/* Kingmaker V14: serialized, acknowledged world writes. No core patches. */
(() => {
  const moduleId = 'pf2e-kingmaker-tools';
  const channel = `module.${moduleId}`;
  const requestAction = 'kmConcurrentRequestV1';
  const replyAction = 'kmConcurrentReplyV1';
  const snapshots = new WeakMap();
  const queues = new Map();
  const pending = new Map();
  const activeChats = new Set();
  const activeChecks = new Set();
  const onceSelector = '.km-add-recipe, .km-add-food, .km-apply-meal-effect, .gain-provisions, .km-pass-time, .km-random-encounter';
  let adapter;
  let registered = false;

  const copy = value => value === undefined ? undefined : foundry.utils.deepClone(value);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  function equal(a, b) {
    if (Object.is(a, b)) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    const ak = Object.keys(a), bk = Object.keys(b);
    return ak.length === bk.length && ak.every(key => Object.hasOwn(b, key) && equal(a[key], b[key]));
  }
  function validPath(path) {
    return Array.isArray(path) && path.length > 0 && path.length < 40 && path.every(key => typeof key === 'string' && key.length > 0 && !key.includes('.') && !['__proto__', 'prototype', 'constructor'].includes(key));
  }
  function changes(base, desired, path = []) {
    if (equal(base, desired)) return [];
    if (object(base) && object(desired)) {
      return [...new Set([...Object.keys(base), ...Object.keys(desired)])].flatMap(key => changes(base[key], desired[key], [...path, key]));
    }
    if (!validPath(path)) throw new Error('Invalid state update path.');
    return [{path, had: base !== undefined, before: copy(base), has: desired !== undefined, after: copy(desired)}];
  }
  function readAt(value, path) {
    for (const key of path) value = value == null ? undefined : value[key];
    return value;
  }
  function writeAt(value, change) {
    let parent = value;
    for (const key of change.path.slice(0, -1)) {
      if (!object(parent[key])) parent[key] = {};
      parent = parent[key];
    }
    const key = change.path.at(-1);
    if (change.has) parent[key] = copy(change.after);
    else delete parent[key];
  }
  function serialize(key, before, after) {
    const data = {};
    for (const change of changes(before, after)) {
      const path = [...change.path];
      if (!change.has) path[path.length - 1] = '-=' + path.at(-1);
      data[`flags.${moduleId}.${key}.${path.join('.')}`] = change.has ? copy(change.after) : null;
    }
    return data;
  }
  function queue(key, fn) {
    const previous = queues.get(key) || Promise.resolve();
    const work = previous.catch(() => undefined).then(fn);
    const done = work.finally(() => { if (queues.get(key) === done) queues.delete(key); });
    queues.set(key, done);
    return done;
  }
  function firstGM() { return game.users.find(user => user.active && user.isGM); }
  function isAuthority() { return firstGM()?.id === game.user?.id; }
  function fail(message) { throw new Error(message); }
  function id() { return foundry.utils.randomID(24); }
  function notify(error) {
    console.error(`${moduleId} | Concurrent operation failed`, error);
    ui.notifications.error(error.message || String(error));
  }
  const text = (cn, en) => /^(cn|zh)/i.test(game.i18n.lang) ? cn : en;
  function capture(actor, key, value, base = value) {
    if (object(value)) snapshots.set(value, {actorUuid: actor.uuid, key, base: copy(base ?? {})});
    return value;
  }
  function clone(value) {
    const result = copy(value);
    const meta = snapshots.get(value);
    if (meta && object(result)) snapshots.set(result, {...meta, base: copy(meta.base)});
    return result;
  }
  async function request(kind, data, requestId = id()) {
    if (!game.user?.active) fail('No active user.');
    if (!firstGM()) fail(text('需要一位在线 GM 来安全保存此操作。', 'An active GM is required to save this operation safely.'));
    const packet = {id: requestId, kind, data, userId: game.user.id};
    if (isAuthority()) return execute(packet, game.user);
    if (pending.has(requestId)) return pending.get(requestId).promise;
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error(text('未收到 GM 确认；请勿假定操作失败。再次点击会核对同一操作。', 'GM confirmation timed out. The operation may have completed; retry checks the same operation.')));
    }, 20000);
    pending.set(requestId, {promise, resolve, reject, timer, gmId: firstGM().id});
    try { game.socket.emit(channel, {action: requestAction, packet}); }
    catch (error) { clearTimeout(timer); pending.delete(requestId); reject(error); }
    return promise;
  }
  async function actorFor(uuid, user) {
    const actor = await adapter.fromUuid(uuid);
    if (!actor || !adapter.canUpdate(actor, user)) fail(text('无法更新此队伍或角色。', 'Cannot update this party or actor.'));
    return actor;
  }
  async function checkedUpdate(actor, data) {
    if (!isAuthority()) fail(text('执行 GM 已变化，请重新核对操作。', 'The authoritative GM changed. Review the operation.'));
    if (!Object.keys(data).length) return;
    const result = await actor.update(data);
    if (!result) fail(text('保存被取消，请重新检查数据。', 'The update was cancelled; check the data before retrying.'));
  }
  async function execute(packet, user) {
    if (!isAuthority() || !user?.active || packet?.userId !== user.id || typeof packet.id !== 'string' || packet.id.length > 100) fail('Invalid mutation request.');
    if (packet.kind === 'chat' || packet.kind === 'resolveChat') {
      if (packet.kind === 'resolveChat' && activeChats.has(`${packet.data?.messageId}:${packet.data?.key}`)) fail('This chat action is still running.');
      return queue('chat-actions', () => executeChat(packet, user));
    }
    const actor = await actorFor(packet.data?.actorUuid, user);
    return queue(actor.uuid, async () => {
      const data = packet.data;
      const control = copy(actor.getFlag(moduleId, 'concurrentOps') || {});
      const receipts = Array.isArray(control.receipts) ? control.receipts : [];
      const receipt = receipts.find(entry => entry.id === packet.id);
      if (receipt) return receipt.result;
      let updates = {}, result = {};
      if (packet.kind === 'write') {
        if (!['camping-sheet', 'kingdom-sheet'].includes(data.key) || !Array.isArray(data.changes) || data.changes.length > 10000) fail('Invalid state patch.');
        const current = copy(actor.getFlag(moduleId, data.key) || {});
        const next = copy(current);
        for (const change of data.changes) {
          if (!validPath(change.path) || typeof change.has !== 'boolean' || typeof change.had !== 'boolean') fail('Invalid state patch path.');
          const actual = readAt(current, change.path);
          const expected = change.had ? change.before : undefined;
          // Different requests with the same new number may be TWO increments.
          // Only a persisted receipt proves replay; never silently lose one.
          const parentChanged = change.path.slice(0, -1).some((_, i) => !object(readAt(current, change.path.slice(0, i + 1))));
          if (parentChanged || !equal(actual, expected)) {
            fail(text('数据已被其他操作修改，请重新打开窗口后重试；本次没有覆盖新数据。', 'Data changed in another operation. Reopen the window and retry; newer data was not overwritten.'));
          }
          writeAt(next, change);
        }
        updates = serialize(data.key, current, next);
      } else if (packet.kind === 'endTurn') {
        if (['pending','review'].includes(control.check?.status)) fail(text('请先完成或核对当前王国检定。', 'Complete or review the current kingdom check first.'));
        if (!adapter.isParty(actor) || !Number.isSafeInteger(data.expectedTurn) || data.expectedTurn < 1) fail('Invalid kingdom turn.');
        const currentTurn = adapter.turn(actor);
        if (currentTurn > data.expectedTurn) return {alreadyApplied: true, turn: currentTurn};
        if (currentTurn < data.expectedTurn) fail('Kingdom turn changed; reopen the sheet.');
        const current = copy(actor.getFlag(moduleId, 'kingdom-sheet'));
        if (!current) fail('Kingdom data is unavailable.');
        const next = adapter.endTurn(actor, copy(current));
        updates = serialize('kingdom-sheet', current, next);
        updates[`flags.${moduleId}.kingdomTurn`] = currentTurn + 1;
        result = {turn: currentTurn + 1};
      } else if (packet.kind === 'beginCheck') {
        if (['pending','review'].includes(control.check?.status)) fail(text('已有王国检定正在执行或等待核对，请稍后重试。', 'A kingdom check is running or awaiting GM review.'));
        const current = actor.getFlag(moduleId, 'kingdom-sheet');
        if (!Array.isArray(data.modifiers) || !equal(current?.modifiers || [], data.modifiers)) fail(text('检定调整值已变化，请重新打开检定窗口。', 'Check modifiers changed. Reopen the check dialog.'));
        updates[`flags.${moduleId}.concurrentOps.check`] = {id:packet.id,status:'pending',userId:user.id,at:Date.now()};
        result = {id:packet.id};
      } else if (packet.kind === 'failCheck' || packet.kind === 'resolveCheck') {
        if (packet.kind === 'resolveCheck' && (!user.isGM || activeChecks.has(actor.uuid))) fail('Only a GM can review an inactive kingdom check.');
        if (packet.kind === 'resolveCheck' && (control.check?.id !== data.checkId || control.check?.status !== data.expectedStatus)) fail('Check state changed while reviewing. Reopen the sheet.');
        if (packet.kind === 'failCheck' && (control.check?.id !== data.checkId || control.check?.userId !== user.id)) fail('Check operation changed.');
        if (packet.kind === 'failCheck' && control.check?.status === 'done') return {alreadyApplied:true};
        updates[`flags.${moduleId}.concurrentOps.check`] = {...control.check,status:packet.kind === 'resolveCheck' ? 'ready' : 'review'};
      } else if (packet.kind === 'consumeModifiers') {
        if (data.checkId && (control.check?.id !== data.checkId || control.check?.status !== 'pending')) fail('Check operation changed.');
        if (!Array.isArray(data.ids) || data.ids.some(value => typeof value !== 'string')) fail('Invalid modifier IDs.');
        const current = copy(actor.getFlag(moduleId, 'kingdom-sheet'));
        if (!current) fail('Kingdom data is unavailable.');
        const used = new Set(data.ids);
        const removed = (current.modifiers || []).filter(modifier => used.has(modifier.id));
        const blessed = removed.filter(modifier => ['activities.blessed-solution.criticalSuccess.modifiers.blessedAttempt.name', 'activities.blessed-solution.success.modifiers.blessedAttempt.name'].includes(modifier.name)).length;
        const next = {...current, modifiers: (current.modifiers || []).filter(modifier => !used.has(modifier.id))};
        if (blessed) next.blessedSolutions = Math.max(0, (current.blessedSolutions || 0) - blessed);
        updates = serialize('kingdom-sheet', current, next);
        if (data.checkId) updates[`flags.${moduleId}.concurrentOps.check`] = {...control.check,status:'done'};
        result = {blessed};
      } else fail('Unknown mutation operation.');
      const nextReceipts = [...receipts.slice(-255), {id: packet.id, result, at: Date.now()}];
      // Receipt, affected fields and turn counter commit as ONE Actor update.
      updates[`flags.${moduleId}.concurrentOps.receipts`] = nextReceipts;
      await checkedUpdate(actor, updates);
      if (packet.kind === 'endTurn') {
        try { await adapter.postEndTurn(); } catch (error) { console.warn(`${moduleId} | Turn saved; chat failed`, error); }
      }
      return result;
    });
  }
  async function write(actor, key, value, partial = false) {
    const meta = snapshots.get(value);
    const current = actor.getFlag(moduleId, key);
    if (!meta && current != null && !partial) fail(text('缺少编辑基准，已阻止覆盖。请重新打开窗口。', 'Missing edit baseline; overwrite blocked. Reopen the window.'));
    if (meta && (meta.actorUuid !== actor.uuid || meta.key !== key)) fail('State snapshot belongs to a different document.');
    const base = copy(meta?.base ?? current ?? {});
    const desired = foundry.utils.mergeObject(copy(base), copy(value), {inplace: true, applyOperators: true});
    const patch = changes(base, desired);
    if (!patch.length) return;
    const requestId = meta?.requestId && equal(meta.sent, patch) ? meta.requestId : id();
    snapshots.set(value, {actorUuid: actor.uuid, key, base, sent: copy(patch), requestId});
    try {
      await request('write', {actorUuid: actor.uuid, key, changes: patch}, requestId);
      capture(actor, key, value, desired);
    } catch (error) { notify(error); throw error; }
  }
  function canRead(message, user) {
    if (user.isGM) return true;
    if (message.blind) return false;
    return !message.whisper.length || message.whisper.includes(user.id) || message.author?.id === user.id;
  }
  function chatState(message, key) { return message.getFlag(moduleId, 'onceActions')?.[key]; }
  function chatButtons(message) {
    return Array.from(new DOMParser().parseFromString(message.content, 'text/html').querySelectorAll(onceSelector)).filter(button => button.dataset.kmOnce === 'true');
  }
  function chatButton(message, key) {
    if (!/^b\d+$/.test(key)) return null;
    return chatButtons(message)[Number(key.slice(1))] || null;
  }
  async function clickChat(target) {
    if (target.__kmPending) return;
    const root = target.closest('[data-message-id]');
    const message = game.messages.get(root?.dataset.messageId);
    if (!message) fail('Chat message is unavailable.');
    const buttons = Array.from(root.querySelectorAll(onceSelector)).filter(button => button.dataset.kmOnce === 'true');
    const index = buttons.indexOf(target);
    if (index < 0) fail('Chat action is unavailable.');
    const key = `b${index}`;
    target.__kmPending = true;
    target.disabled = true;
    try { await request('chat', {messageId:message.id,key}); }
    finally { target.__kmPending = false; renderChat(message, root); }
  }
  async function confirmReview(content) {
    return foundry.applications.api.DialogV2.confirm({window:{title:text('核对未完成操作','Review interrupted operation')},content:`<p>${content}</p>`,rejectClose:false});
  }
  function renderChat(message, html) {
    const buttons = Array.from(html.querySelectorAll(onceSelector)).filter(button => button.dataset.kmOnce === 'true');
    html.querySelectorAll('.km-once-review').forEach(element => element.remove());
    buttons.forEach((button, index) => {
      const key = `b${index}`, state = chatState(message, key);
      const legacy = !state && message.getFlag(moduleId, 'onceVersion') !== 1;
      const review = legacy || ['pending','review'].includes(state?.status);
      button.disabled = !!button.__kmPending || state?.status === 'done' || review;
      button.setAttribute('aria-disabled', String(button.disabled));
      if (state?.status === 'done') button.title = text('已结算','Completed');
      if (!review) return;
      const box = document.createElement('div'); box.className = 'km-once-review';
      const label = document.createElement('p');
      label.textContent = legacy ? text('旧版卡片：请 GM 核对是否已结算。','Legacy card: ask the GM to verify completion.') : text('处理中或待核对：请勿重复结算。','In progress or awaiting review: do not repeat.');
      box.append(label);
      if (game.user.isGM) for (const resolution of ['ready','done']) {
        const control = document.createElement('button'); control.type = 'button';
        control.textContent = resolution === 'ready' ? text('核对后允许执行','Enable after review') : text('标记已完成','Mark complete');
        control.addEventListener('click', async () => {
          if (!await confirmReview(text('请先确认物品、效果与时间是否已发生变化。允许重试会重新执行整个动作，部分完成的结果须由 GM 先行处理。','First check inventory, effects and time. Enabling retry repeats the entire action; the GM must reconcile any partial results first.'))) return;
          control.disabled = true;
          try { await request('resolveChat', {messageId:message.id,key,resolution,expectedStatus:state?.status || 'legacy'}); renderChat(message,html); }
          catch(error) { notify(error); control.disabled = false; }
        });
        box.append(control);
      }
      button.after(box);
    });
  }
  function renderCheckReview(app, html) {
    html.querySelectorAll('.km-check-review').forEach(element => element.remove());
    const actor = app.r5q_1;
    const operation = actor?.getFlag(moduleId,'concurrentOps')?.check;
    if (!game.user.isGM || !actor || !['pending','review'].includes(operation?.status)) return;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'km-check-review';
    button.textContent = text('核对未完成的王国检定','Review unfinished kingdom check');
    button.addEventListener('click', async () => {
      if (!await confirmReview(text('确认没有玩家正在检定，并核对资源扣除、一次性调整值和已发送结果；必要时先手动修正，再解除处理中状态。','Confirm no player is still rolling. Reconcile spent resources, one-use modifiers and posted results before unlocking.'))) return;
      try { await request('resolveCheck',{actorUuid:actor.uuid,checkId:operation.id,expectedStatus:operation.status}); button.remove(); } catch(error) { notify(error); }
    });
    html.append(button);
  }
  async function executeChat(packet, user) {
    const {messageId, key} = packet.data;
    const message = game.messages.get(messageId);
    if (!message || !canRead(message, user)) fail('Chat message is unavailable.');
    const button = (adapter.chatButton || chatButton)(message, key);
    if (!button) fail('Chat action is unavailable.');
    const state = chatState(message, key);
    if (packet.kind === 'resolveChat') {
      if (!user.isGM || activeChats.has(`${messageId}:${key}`)) fail('Only a GM can resolve an interrupted chat action.');
      if ((state?.status || 'legacy') !== packet.data.expectedStatus) fail('Chat state changed while reviewing. Reopen the card.');
      if (!['ready', 'done'].includes(packet.data.resolution)) fail('Invalid resolution.');
      const resolved = await message.setFlag(moduleId, `onceActions.${key}`, {status: packet.data.resolution, at: Date.now(), userId: user.id});
      if (!resolved) fail('Chat review was cancelled.');
      return {status: packet.data.resolution};
    }
    if (state?.status === 'done') return {status: 'done'};
    if (state && state.status !== 'ready') fail(text('此操作可能已部分完成，请 GM 核对卡片；不会自动重复执行。', 'This action may have partly completed. Ask the GM to review the card; it will not be replayed automatically.'));
    if (!state && message.getFlag(moduleId, 'onceVersion') !== 1) fail(text('这是旧版卡片，无法确定是否已结算。请 GM 先核对并启用或标记完成。', 'Legacy card: its prior completion is unknown. Ask the GM to enable it or mark it complete.'));
    // Validation runs before reservation; existing camping/target permissions
    // are delegated unchanged to the adapter, not tightened here.
    await adapter.validateChat(message, button, user);
    if (!isAuthority()) fail('The authoritative GM changed. Review the operation.');
    const activeKey = `${messageId}:${key}`;
    activeChats.add(activeKey);
    try {
      const reserved = await message.setFlag(moduleId, `onceActions.${key}`, {status:'pending', at:Date.now(), userId:user.id});
      if (!reserved) fail('Chat reservation was cancelled.');
      await adapter.executeChat(message, button, user);
      if (!isAuthority()) fail('The authoritative GM changed. Review the operation.');
      const completed = await message.setFlag(moduleId, `onceActions.${key}`, {status:'done', at:Date.now(), userId:user.id});
      if (!completed) fail('Chat completion record was cancelled.');
      return {status:'done'};
    } catch (error) {
      try { if (isAuthority()) await message.setFlag(moduleId, `onceActions.${key}`, {status:'review', at:Date.now(), userId:user.id}); } catch (_) { /* pending remains fail-closed */ }
      throw new Error(text('操作中断，可能已有部分结果。请 GM 核对卡片后再决定重试。', 'Action interrupted and may be partially applied. The GM must review the card before retrying.'));
    } finally { activeChats.delete(activeKey); }
  }
  function install(nextAdapter) {
    adapter = nextAdapter;
    if (registered) return;
    registered = true;
    Hooks.on('renderChatMessageHTML', renderChat);
    Hooks.on('renderKingdomSheet', renderCheckReview);
    const listener = (message, senderUserId) => {
      if (message?.action === replyAction) {
        const item = pending.get(message.id);
        if (!item || item.gmId !== senderUserId || message.to !== game.user.id) return;
        clearTimeout(item.timer); pending.delete(message.id);
        if (message.error) item.reject(new Error(message.error));
        else item.resolve(message.result);
      } else if (message?.action === requestAction && isAuthority()) {
        const user = game.users.get(senderUserId);
        if (!user || message.packet?.userId !== senderUserId) return;
        execute(message.packet, user).then(result => {
          game.socket.emit(channel, {action:replyAction,id:message.packet.id,to:senderUserId,result});
        }, error => {
          game.socket.emit(channel, {action:replyAction,id:message.packet.id,to:senderUserId,error:error.message});
        });
      }
    };
    if (game.ready) game.socket.on(channel, listener);
    else Hooks.once('ready', () => game.socket.on(channel, listener));
  }
  globalThis.foundryvttKotlinPatches.concurrency = {install, capture, clone, write, request, notify, text, equal, changes, serialize, chatState, clickChat, renderChat, chatButton, activeChecks, isChatActive: (messageId,key) => activeChats.has(`${messageId}:${key}`)};
})();
