globalThis.foundryvttKotlinPatches = {};

((exports) => {
    // Reserve before rendering: ApplicationV2 otherwise replaces a same-ID DOM
    // node without closing its owner (which still receives Actor/time hooks).
    const actorPanels = new Map();
    exports.openActorPanel = async function (id, actor, create) {
        let entry = actorPanels.get(id);
        if (entry?.closing) {
            await entry.closing;
            return exports.openActorPanel(id, actor, create);
        }
        if (!entry) {
            const app = create();
            entry = {app, closing: null, disposed: false};
            actorPanels.set(id, entry);
            const render = app.render.bind(app);
            const close = app.close.bind(app);
            app.render = (...args) => entry.closing || entry.disposed
                ? Promise.resolve(app) : render(...args);
            app.close = (...args) => {
                if (entry.closing) return entry.closing;
                if (entry.disposed) return Promise.resolve(app);
                // Set the closing latch before entering the V14 semaphore.
                entry.closing = Promise.resolve().then(() => close(...args)).then(result => {
                    // V14 skips _preClose when there is no element, including
                    // failed first renders. Dispose constructor hooks there too.
                    app.disposePanelHooks();
                    if (actor.apps[id] === app) delete actor.apps[id];
                    if (actorPanels.get(id) === entry) actorPanels.delete(id);
                    entry.disposed = true;
                    return result;
                }).catch(error => {
                    entry.closing = null;
                    throw error;
                });
                return entry.closing;
            };
        }
        try {
            await entry.app.render({force: true});
            return entry.app;
        } catch (error) {
            // Release subscriptions even if the first render failed. Preserve
            // the actual rendering failure rather than hiding it.
            try { await entry.app.close({animate: false}); }
            catch (cleanupError) { console.error('pf2e-kingmaker-tools | Panel cleanup failed', cleanupError); }
            throw error;
        }
    };

    /**
     * There's some weird stuff going on in V2 APIs; this mixin seeks to solve 2 issues:
     * * Allow you to pass PARTS as constructor parameters instead of requiring statics
     * * Automatically sets a submit handler if a form property is present to an onSubmit() method
     */
    function SaneHandlebarsApplicationV2Mixin(clazz) {
        function copy(src, target) {
            Object.keys(src).forEach(key => {
                target[key] = src[key];
            });
        }

        // remove parts from super parameters and store them in a tmp variable instead
        function copyParts(config, parts) {
            if (config.parts) {
                copy(config.parts, parts)
                delete config['parts'];
            }
            return config
        }

        return class Hack extends foundry.applications.api.HandlebarsApplicationMixin(clazz) {

            constructor(config) {
                const parts = {};
                const parentOptions = copyParts({
                    ...config,
                    form: config.form !== undefined ?
                        {...config.form, handler: Hack._onSubmit}
                        : undefined,
                }, parts);
                if (parentOptions.form === undefined) {
                    delete parentOptions.form;
                }
                super(parentOptions);
                this.constructor.PARTS = {}
                copy(parts, this.constructor.PARTS)
            }

            static async _onSubmit(event, form, formData) {
                await this.onSubmit(event, form, formData)
            }

            async onSubmit(event, form, formData) {
            }

            // crap fix for https://github.com/foundryvtt/foundryvtt/issues/14315
            *_headerControlContextEntries() {
                for ( const { action, icon, label, onClick } of this._headerControlButtons() ) {
                    let handler = this.options.actions[action];
                    if ( typeof handler === "object" ) {
                        if ( handler.buttons && !handler.buttons.includes(0) ) continue;
                        handler = handler.handler;
                    }
                    yield {
                        label, icon,
                        onClick: (event) => {
                            const li = document.createElement("li");
                            li.dataset.action = action;
                            if ( typeof onClick === "function" ) onClick(event, li);
                            else if ( handler ) handler.call(this, event, li);
                            else this._onClickAction(event, li);
                        }
                    };
                }
            }
        }
    }

    class SaneHandlebarsApplicationV2 extends SaneHandlebarsApplicationV2Mixin(foundry.applications.api.ApplicationV2) {
    }

    exports.SaneHandlebarsApplicationV2 = SaneHandlebarsApplicationV2;

    Hooks.on('init', () => {
        exports.rolls = {};
        CONFIG.Dice.rolls.forEach(mode => {
            exports.rolls[mode.name] = mode
        })
    });
})(globalThis.foundryvttKotlinPatches);
// BEGIN GENERATED KINGMAKER CONCURRENCY
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
      if (packet.kind === 'projectSpend' || packet.kind === 'projectReconcile') {
        if (!adapter.isParty(actor)) fail('Invalid kingdom actor.');
        const service = globalThis.foundryvttKotlinPatches.turnProjects;
        const targetId = data.paymentId ? service.ledger(actor).payments.find(p=>p.id===data.paymentId)?.targetId : data.targetId;
        return queue(`project:${targetId}`, () => packet.kind === 'projectSpend' ? service.spend(actor,data,user,packet.id,checkedUpdate) : service.reconcile(actor,data,user,checkedUpdate));
      } else if (packet.kind === 'projectGroups') {
        if (!adapter.isParty(actor)) fail('Invalid kingdom actor.');
        const groups = copy(actor.getFlag(moduleId,'kingdom-sheet')?.groups);
        if (!Array.isArray(groups)) fail('Kingdom groups are unavailable.');
        const ids = new Set();
        for (const group of groups) {
          if (!group.id || ids.has(group.id)) group.id = id();
          ids.add(group.id);
        }
        const version = actor.getFlag(moduleId,'projectGroupIdsVersion') || 0;
        if (version > 1) fail('Unsupported group identity version.');
        if (version === 1 && equal(groups,actor.getFlag(moduleId,'kingdom-sheet').groups)) return {unchanged:true};
        updates[`flags.${moduleId}.kingdom-sheet.groups`] = groups;
        updates[`flags.${moduleId}.projectGroupIdsVersion`] = 1;
      } else if (packet.kind === 'projectResult') {
        if (!adapter.isParty(actor) || control.check?.id !== data.checkId || control.check?.userId !== user.id || control.check?.status !== 'pending' || !control.check?.target) fail('Targeted check changed.');
        updates = globalThis.foundryvttKotlinPatches.turnProjects.record(actor,control.check,data.degree,user);
      } else if (packet.kind === 'write') {
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
        if (data.key === 'camping-sheet' && !user.isGM && !equal(current.encounterConditions, next.encounterConditions)) {
          fail('Only a GM can change encounter conditions.');
        }
        if (data.key === 'camping-sheet' && !user.isGM && !equal(current.restTimeGuard, next.restTimeGuard)) {
          fail('Only a GM can change rest time checkpoints.');
        }
        updates = serialize(data.key, current, next);
      } else if (packet.kind === 'encounterCondition') {
        if (!user.isGM || !adapter.isParty(actor)) fail('Only a GM can change encounter conditions.');
        const current = copy(actor.getFlag(moduleId, 'camping-sheet'));
        if (!current) fail('Camping data is unavailable.');
        const next = globalThis.foundryvttKotlinPatches.encounterConditions.applyMutation(actor, current, data);
        updates = serialize('camping-sheet', current, next);
        if (!Object.keys(updates).length) return {unchanged: true};
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
        const target = data.target ? globalThis.foundryvttKotlinPatches.turnProjects.validate(actor,data.target,user) : null;
        updates[`flags.${moduleId}.concurrentOps.check`] = {id:packet.id,status:'pending',userId:user.id,at:Date.now(),...(target ? {target} : {})};
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
// BEGIN GENERATED KINGMAKER ENCOUNTER CONDITIONS
/* GM-controlled encounter circumstances. Embedded before main.js; no core patches. */
(() => {
  const moduleId = 'pf2e-kingmaker-tools';
  const sceneId = 'AJ1k5II28u72JOmz';
  const sheets = new Set();
  const pendingSheets = new WeakSet();
  const refreshActors = new Set();
  let installed = false, refreshScheduled = false;
  const concurrent = () => globalThis.foundryvttKotlinPatches.concurrency;
  const copy = value => foundry.utils.deepClone(value);
  const text = (cn, en) => concurrent().text(cn, en);
  // Fallback also supports a running server which cached the previous manifest.
  const label = (key, cn, en) => game.i18n.has?.(`${moduleId}.encounterConditions.${key}`)
    ? game.i18n.localize(`${moduleId}.encounterConditions.${key}`) : text(cn, en);
  const stateOf = camping => camping?.encounterConditions ?? {};
  const restVersion = camping => Number(camping?.restOperationVersion) || 0;

  // Foundry V14 BaseToken#getCenterPoint and Scene#grid work even off-canvas.
  // Kingmaker's own KingmakerHex.getKey maps offsets to region.hexes keys.
  function locate(actor) {
    const scene = game.scenes?.get(sceneId);
    const unavailable = {key: 'unavailable', known: false, road: false};
    if (actor?.type !== 'party' || !scene?.grid?.isHexagonal) return unavailable;
    const tokens = Array.from(scene.tokens ?? []).filter(token => token.actor?.uuid === actor.uuid);
    if (tokens.length !== 1) return unavailable;
    const token = tokens[0];
    if (typeof token.getCenterPoint !== 'function') return unavailable;
    const offset = scene.grid.getOffset(token.getCenterPoint());
    if (!Number.isInteger(offset?.i) || !Number.isInteger(offset?.j)) return unavailable;
    const key = `${scene.id}:${token.id}:${offset.i},${offset.j}`;
    const runtime = globalThis.kingmaker;
    if (!game.modules?.get('pf2e-kingmaker')?.active || runtime?.region?.scene?.id !== sceneId
      || typeof runtime.api?.KingmakerHex?.getKey !== 'function') return {...unavailable, key};
    const hex = runtime.region.hexes?.get(runtime.api.KingmakerHex.getKey(offset));
    if (!Array.isArray(hex?.data?.features)) return {...unavailable, key};
    return {key, known: true, road: hex.data.features.some(feature => feature?.type === 'road')};
  }

  function evaluate(actor, camping, resting = false) {
    const location = locate(actor), state = stateOf(camping);
    const override = state.roadRiver;
    const manual = typeof override?.value === 'boolean' && override.location === location.key;
    const roadRiver = manual ? override.value : location.known && location.road;
    const flying = state.flying === true && !resting && !(camping?.watchSecondsRemaining > 0);
    return {location, manual, roadRiver, flying, modifier: (roadRiver ? -2 : 0) + (flying ? 3 : 0)};
  }

  function context(app, actor, camping) {
    const value = evaluate(actor, camping);
    app.__kmEncounterSnapshot = {location: value.location.key, expected: copy(stateOf(camping)), restVersion: restVersion(camping)};
    let status = value.location.known
      ? value.location.road ? label('roadFound', '本格有道路', 'Road in this hex') : label('roadAbsent', '本格无道路标记', 'No road marker in this hex')
      : label('unknown', '无法自动识别道路', 'Road detection unavailable');
    status += ' · ' + (value.manual ? label('manual', 'GM 手动', 'GM override') : label('automatic', '自动', 'Automatic'));
    return {...value,
      roadLabel: label('roadLabel', '道路／河流（−2）', 'Road / river (−2)'),
      flyLabel: label('flyLabel', '飞行（+3）', 'Flying (+3)'),
      roadHint: label('roadHint', '按 Party 当前六角格的道路标记自动勾选；GM 可覆盖，离开本格后恢复自动。河流由 GM 判断。', 'Auto-detect the road marker in this party’s hex. GM overrides last until leaving the hex. Rivers require GM judgment.'),
      flyHint: label('flyHint', '由 GM 判断队伍是否正在飞行；开始休息时清除。请选用能影响飞行角色的危害或怪物。', 'GM judges whether the party is flying. Cleared when rest starts. Choose hazards or monsters relevant to flying PCs.'),
      autoLabel: label('autoLabel', '恢复道路自动识别', 'Restore automatic road detection'),
      flyDisabled: camping?.watchSecondsRemaining > 0,
      status,
      adjustment: label('adjustment', '环境修正', 'Circumstances') + ` ${value.modifier >= 0 ? '+' : ''}${value.modifier}`,
    };
  }

  // Invoked only inside the authoritative coordinator's per-Actor queue.
  function applyMutation(actor, camping, data) {
    const state = stateOf(camping), location = locate(actor);
    if (data.kind === 'leaveHex') {
      // A later GM edit must not be cleared by an older queued movement event.
      if (!state.roadRiver || !concurrent().equal(state.roadRiver, data.expected)
        || state.roadRiver.location === data.location) return camping;
      const next = copy(camping);
      delete next.encounterConditions.roadRiver;
      return next;
    }
    if (!['roadRiver', 'flying', 'autoRoad'].includes(data.kind)
      || (data.kind !== 'autoRoad' && typeof data.value !== 'boolean')) throw new Error('Invalid encounter condition.');
    if (data.location !== location.key || restVersion(camping) !== data.restVersion
      || !concurrent().equal(state, data.expected)) {
      throw new Error(text('队伍位置或遭遇设置已变化，请刷新后重试。', 'Party location or encounter settings changed. Refresh and retry.'));
    }
    if (data.kind === 'flying' && data.value && camping.watchSecondsRemaining > 0) {
      throw new Error(text('队伍正在休息，不能启用飞行修正。', 'Cannot enable flight while the party is resting.'));
    }
    const next = copy(camping);
    next.encounterConditions = copy(state);
    if (data.kind === 'autoRoad') delete next.encounterConditions.roadRiver;
    else if (data.kind === 'roadRiver') next.encounterConditions.roadRiver = {location: location.key, value: data.value};
    else next.encounterConditions.flying = data.value;
    return next;
  }

  async function click(app, event, target) {
    // Cancel the checkbox default/change event: this is a scoped action, not a
    // full camping form submission that could overwrite unrelated edits.
    event.preventDefault();
    event.stopPropagation();
    if (pendingSheets.has(app)) return;
    if (!game.user?.isGM || !app.r4f_1?.canUserModify(game.user, 'update')) return;
    const snapshot = app.__kmEncounterSnapshot;
    if (!snapshot) return;
    const kind = target.dataset.encounterCondition;
    const hadFocus = globalThis.document?.activeElement === target;
    pendingSheets.add(app);
    try {
      await concurrent().request('encounterCondition', {
        actorUuid: app.r4f_1.uuid, kind, value: target.checked, ...copy(snapshot),
      });
    } catch (error) { concurrent().notify(error); }
    finally {
      pendingSheets.delete(app);
      await app.render();
      if (hadFocus && ['roadRiver', 'flying', 'autoRoad'].includes(kind)) {
        app.element?.querySelector(`[data-encounter-condition="${kind}"]`)?.focus();
      }
    }
  }

  function refresh(actor) {
    refreshActors.add(actor?.uuid ?? '*');
    if (refreshScheduled) return;
    refreshScheduled = true;
    Promise.resolve().then(() => {
      refreshScheduled = false;
      const ids = new Set(refreshActors); refreshActors.clear();
      for (const app of sheets) {
        if (app.rendered && (ids.has('*') || ids.has(app.r4f_1?.uuid))) {
          Promise.resolve(app.render()).catch(concurrent().notify);
        }
      }
    });
  }

  function onTokenChange(token) {
    if (token.parent?.id !== sceneId || token.actor?.type !== 'party') return;
    const actor = token.actor;
    refresh(actor);
    if (!game.user?.isGM || game.users.find(user => user.active && user.isGM)?.id !== game.user.id) return;
    const camping = actor.getFlag(moduleId, 'camping-sheet');
    const override = stateOf(camping).roadRiver;
    const location = locate(actor);
    if (!override || override.location === location.key) return;
    concurrent().request('encounterCondition', {actorUuid: actor.uuid, kind: 'leaveHex',
      expected: copy(override), location: location.key}).catch(concurrent().notify);
  }

  function install() {
    if (installed) return;
    installed = true;
    Hooks.on('renderCampingSheet', app => { if (game.user?.isGM) sheets.add(app); });
    Hooks.on('closeCampingSheet', app => sheets.delete(app));
    Hooks.on('moveToken', onTokenChange);
    Hooks.on('updateToken', (token, changed) => {
      if (['x', 'y', 'width', 'height', 'actorId', 'actorLink'].some(key => Object.hasOwn(changed, key))) onTokenChange(token);
    });
    Hooks.on('createToken', onTokenChange);
    Hooks.on('deleteToken', onTokenChange);
    Hooks.on('updateSetting', setting => { if (setting.key === 'pf2e-kingmaker.state') refresh(); });
  }

  globalThis.foundryvttKotlinPatches.encounterConditions = {locate, evaluate, context, click, applyMutation, install};
})();
// BEGIN GENERATED KINGMAKER CAMPING REST
/* Rest-only time coordination. No core patches or automatic world migration. */
(() => {
  const moduleId = 'pf2e-kingmaker-tools';
  const optionKey = 'kingmakerRestTime';
  const timeEvents = new Map();
  const timeQueues = new WeakMap();
  const pausedTime = new WeakMap();
  const concurrent = () => globalThis.foundryvttKotlinPatches.concurrency;
  const authority = () => game.users.find(user => user.active && user.isGM)?.id === game.user?.id;
  const reviewMessage = () => /^(cn|zh)/i.test(game.i18n.lang)
    ? '上次休息已进入推进时间阶段，但未完整结束。为防止重复推进，已暂停自动重试；请 GM 核对世界时间和休息进度后再恢复。'
    : 'The previous rest reached the time-advance stage but did not finish. Automatic retry is paused to prevent duplicate time. A GM must review world time and rest progress before recovery.';

  function canStart(actor) {
    // Failed attempts must not permanently block a user-requested retry.
    // The live in-flight guard and time queue still prevent concurrent runs.
    return true;
  }

  // Ordinary calendar ticks must not write a stale timer snapshot over rest
  // completion. Drain earlier ticks, defer new ones, then replay them in order.
  function trackTime(actor, work) {
    if (!actor) return Promise.resolve();
    const paused = pausedTime.get(actor);
    if (paused) {
      paused.push(work);
      return Promise.resolve();
    }
    const next = (timeQueues.get(actor) ?? Promise.resolve()).then(work);
    const settled = next.catch(error => concurrent().notify(error));
    timeQueues.set(actor, settled);
    settled.then(() => { if (timeQueues.get(actor) === settled) timeQueues.delete(actor); });
    return settled;
  }

  async function begin(actor) {
    if (!authority()) throw new Error('Only the authoritative GM may begin rest.');
    if (pausedTime.has(actor)) throw new Error('Rest time tracking is already paused.');
    pausedTime.set(actor, []);
    await timeQueues.get(actor);
  }

  async function end(actor) {
    const waiting = pausedTime.get(actor) ?? [];
    pausedTime.delete(actor);
    for (const work of waiting) trackTime(actor, work);
    await timeQueues.get(actor);
  }

  function isRestTime(actor, delta, options, userId) {
    const marker = options?.[optionKey];
    const guard = timeEvents.get(marker?.id) ?? actor?.getFlag(moduleId, 'camping-sheet')?.restTimeGuard;
    // Recognize only the exact persisted rest event from its GM. An ordinary
    // calendar event (even while resting) must keep its usual time tracking.
    return !!guard && game.users.get(userId)?.isGM === true
      && marker?.actorUuid === actor?.uuid && guard.actorUuid === actor?.uuid && marker?.id === guard.id
      && userId === guard.userId && delta === guard.seconds;
  }

  async function advance(actor, camping, seconds) {
    if (!authority()) throw new Error('Only the authoritative GM may advance rest time.');
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Invalid rest duration.');
    const guard = {
      id: foundry.utils.randomID(24), userId: game.user.id, actorUuid: actor.uuid, status: 'pending',
      version: camping.restOperationVersion, seconds,
      worldTimeBefore: game.time.worldTime,
    };
    camping.restTimeGuard = guard;
    // Persist BEFORE the external side effect. If saving or time advancement
    // has an ambiguous outcome, leave the marker for review, including reloads.
    await concurrent().write(actor, 'camping-sheet', camping);
    if (!authority()) throw new Error('The authoritative GM changed before advancing rest time.');
    timeEvents.set(guard.id, guard);
    if (timeEvents.size > 256) timeEvents.delete(timeEvents.keys().next().value);
    await game.time.advance(seconds, {[optionKey]: {actorUuid: actor.uuid, id: guard.id}});
  }

  async function finish(actor, camping) {
    const guard = camping.restTimeGuard;
    if (!guard) return;
    const current = actor.getFlag(moduleId, 'camping-sheet');
    if (current?.restTimeGuard?.id !== guard.id) throw new Error(reviewMessage());
    camping.restTimeGuard = {...guard, status: 'complete'};
    try {
      await concurrent().write(actor, 'camping-sheet', camping);
    } catch (error) {
      // A lost acknowledgement is not proof of failure. Only a confirmed
      // matching committed state allows us to consider cleanup completed.
      const saved = actor.getFlag(moduleId, 'camping-sheet');
      if (saved?.restTimeGuard?.id !== guard.id || saved?.restTimeGuard?.status !== 'complete'
        || saved?.restOperationVersion !== guard.version) throw error;
    }
  }

  globalThis.foundryvttKotlinPatches.campingRest = {canStart, isRestTime, advance, finish, trackTime, begin, end};
})();
// BEGIN GENERATED KINGMAKER TURN PROJECTS
/* 7.0 targeted activities. State lives on the party; no startup migration or global DOM observers. */
(() => {
  const moduleId = 'pf2e-kingmaker-tools';
  const key = 'turnProjects';
  const api = () => globalThis.foundryvttKotlinPatches.concurrency;
  const text = (cn, en) => api().text(cn, en);
  const clone = value => foundry.utils.deepClone(value);
  const turn = actor => Math.max(1, Number(actor.getFlag(moduleId, 'kingdomTurn')) || 1);
  const kingdom = actor => actor.getFlag(moduleId, 'kingdom-sheet');
  const fail = (cn, en) => { throw new Error(text(cn, en)); };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let adapter;
  function ledger(actor) {
    const value = actor.getFlag(moduleId, key);
    if (value && value.version !== 1) fail('不支持的工程台账版本。', 'Unsupported project ledger version.');
    return clone(value || {version:1, attempts:[], payments:[]});
  }
  function aidExtra(state, targetId, currentTurn) {
    const last = state.attempts.filter(a => a.kind === 'aid' && a.targetId === targetId).at(-1);
    return last ? Math.max(0, last.extra + 2 - Math.max(0, currentTurn - last.turn - 1)) : 0;
  }
  function limit(degree, die, edifice) {
    return degree === 'criticalSuccess' ? Math.floor(die * (edifice ? 1 : 1.5))
      : degree === 'success' ? Math.floor(die * (edifice ? 0.5 : 1)) : 0;
  }
  function project(actor, targetId, user, completed = false) {
    const p = adapter.projects(actor).find(p => p.id === targetId);
    if (!p || !p.document.canUserModify(user, 'update') || (!completed && p.current >= p.total)) {
      fail('建筑已变化、已完成或没有修改权限，请重新选择。', 'Project changed, completed, or is not editable. Select it again.');
    }
    if (![p.current,p.total,p.dc,p.die,p.ongoingLimit].every(Number.isFinite) || p.current < 0 || p.total <= 0) {
      fail('建筑建设数据不完整。', 'Incomplete construction data.');
    }
    return p;
  }
  function validate(actor, context, user) {
    if (game.modules?.get('vk-kingdom-turn-helper')?.active) fail('请停用外部王国回合辅助插件后再使用整合活动。','Disable the external turn helper before using integrated activities.');
    if (!context || !['accelerate','aid'].includes(context.kind) || context.turn !== turn(actor)) fail('回合已变化，请重新打开活动。','Turn changed; reopen the activity.');
    const state = ledger(actor);
    if (state.attempts.some(a => a.kind === context.kind && a.targetId === context.targetId && a.turn === context.turn)) fail('本回合已对这个目标执行过活动。','This target has already been attempted this turn.');
    if (context.kind === 'accelerate') {
      const p = project(actor, context.targetId, user);
      if (context.dc !== p.dc + 2) fail('建造 DC 已变化，请重新打开活动。','Construction DC changed; reopen the activity.');
      return {...context, label:p.label, die:p.die, edifice:p.edifice};
    }
    const group = kingdom(actor)?.groups?.find(g => g.id === context.targetId);
    if (!group || group.relations === 'none' || !Number.isFinite(group.negotiationDC)) fail('外交团体已变化，请重新选择。','Diplomatic group changed; select it again.');
    const extra = aidExtra(state, group.id, context.turn);
    if (context.dc !== group.negotiationDC + 2 + extra) fail('外援 DC 已变化，请重新打开活动。','Aid DC changed; reopen the activity.');
    return {...context, label:group.name, extra};
  }
  function record(actor, check, degree, user) {
    if (!['criticalSuccess','success','failure','criticalFailure'].includes(degree)) fail('无效检定结果。','Invalid check result.');
    const state = ledger(actor);
    if (state.attempts.some(a => a.id === check.id)) return {};
    // The roll is bound to the validated beginCheck snapshot, not changing
    // target DC/progress after the dice have already been rolled.
    const context = check.target;
    if (context.turn !== turn(actor)) fail('回合已变化。','Turn changed.');
    if (state.attempts.some(a=>a.kind===context.kind && a.targetId===context.targetId && a.turn===context.turn)) fail('目标已在本回合结算。','Target already resolved this turn.');
    state.attempts.push({...context,id:check.id,degree,at:Date.now(),limit:context.kind === 'accelerate' ? limit(degree,context.die,context.edifice) : 0});
    return {[`flags.${moduleId}.${key}`]:state};
  }
  function allowance(actor, state, p, attemptId) {
    const currentTurn = turn(actor);
    if (attemptId) {
      const attempt = state.attempts.find(a => a.id === attemptId && a.kind === 'accelerate' && a.targetId === p.id && a.turn === currentTurn);
      if (!attempt) fail('加速结果已过期或不属于此建筑。','Acceleration result expired or belongs to another project.');
      const spent = state.payments.filter(x => x.attemptId === attemptId && x.status !== 'refunded').reduce((n,x)=>n+x.amount,0);
      return Math.max(0, attempt.limit - spent);
    }
    const penalty = state.attempts.filter(a => a.kind === 'accelerate' && a.targetId === p.id && a.turn === currentTurn && a.degree === 'criticalFailure').reduce((n,a)=>n+a.die,0);
    const spent = state.payments.filter(x => !x.attemptId && x.targetId === p.id && x.turn === currentTurn && x.status !== 'refunded').reduce((n,x)=>n+x.amount,0);
    return Math.max(0,p.ongoingLimit - penalty - spent);
  }
  async function save(actor, state, update) {
    await update(actor, {[`flags.${moduleId}.${key}`]:state});
  }
  // Debit + durable intent is one party update. HP + receipt is one structure
  // update. Retrying a partially completed payment never debits or adds HP twice.
  async function spend(actor, data, user, requestId, update) {
    let state = ledger(actor);
    let payment = state.payments.find(p => p.id === (data.paymentId || requestId));
    if (data.paymentId && !payment) fail('找不到待处理记录。','Payment record not found.');
    if (payment && payment.status !== 'pending') return {status:payment.status};
    if (!payment) {
      if (data.turn !== turn(actor)) fail('回合已变化，请重新打开投入窗口。','Turn changed; reopen the payment dialog.');
      const p = project(actor,data.targetId,user);
      if (state.payments.some(x=>x.targetId===p.id && x.status==='pending')) fail('此建筑有待处理投入，请从工程记录继续或核对。','Project has a pending payment; resume or reconcile it in the ledger.');
      const maximum = Math.min(allowance(actor,state,p,data.attemptId),p.total-p.current,kingdom(actor).resourcePoints.now);
      if (!Number.isSafeInteger(data.amount) || data.amount <= 0 || data.amount > maximum) fail('投入超过当前可用 RP、进度缺口或本回合上限。','Payment exceeds current RP, remaining progress, or turn allowance.');
      payment = {id:requestId,targetId:p.id,label:p.label,turn:turn(actor),attemptId:data.attemptId || null,amount:data.amount,before:p.current,after:p.current+data.amount,status:'pending'};
      state.payments.push(payment);
      await update(actor, {
        [`flags.${moduleId}.kingdom-sheet.resourcePoints.now`]:kingdom(actor).resourcePoints.now-data.amount,
        [`flags.${moduleId}.${key}`]:state
      });
    }
    const p = project(actor,payment.targetId,user,true);
    const receipts = p.document.getFlag(moduleId,'projectPayments') || [];
    if (!receipts.includes(payment.id)) {
      if (p.current !== payment.before || p.total < payment.after) fail('RP 已记录扣除，但建筑进度发生变化。请在工程记录核对，不会再次扣费。','RP debit is recorded, but project progress changed. Reconcile in the ledger; no second debit.');
      await update(p.document, {'system.attributes.hp.value':payment.after,[`flags.${moduleId}.projectPayments`]:[...receipts,payment.id]});
    }
    state = ledger(actor);
    state.payments.find(x=>x.id===payment.id).status='done';
    await save(actor,state,update);
    return {status:'done',amount:payment.amount};
  }
  async function reconcile(actor,data,user,update) {
    if (!user.isGM) fail('只有 GM 可以核对工程投入。','Only a GM may reconcile payments.');
    const state=ledger(actor), p=state.payments.find(x=>x.id===data.paymentId);
    if (!p || p.status!=='pending') return {unchanged:true};
    if (data.resolution!=='manual') fail('无效核对方式。','Invalid reconciliation.');
    // Explicit GM acknowledgement: do not guess whether external edits applied
    // the work, and do not refund or repeat unknown side effects automatically.
    p.status='manual';
    await save(actor,state,update);
    return {status:'manual'};
  }
  async function input(title,content,label=text('继续','Continue')) {
    return foundry.applications.api.DialogV2.input({window:{title},content,ok:{label},rejectClose:false});
  }
  async function prepare(actor,activity,group) {
    if (!['accelerate-project','request-foreign-aid-vk'].includes(activity.id)) return null;
    if (game.modules?.get('vk-kingdom-turn-helper')?.active) fail('请先停用外部王国回合辅助插件，避免同一活动重复结算。','Disable the external kingdom turn helper before using integrated activities.');
    if (activity.id==='request-foreign-aid-vk') {
      if (!group?.id) fail('请先点击“工程与外援记录”初始化团体标识，再重新打开活动。','Open Project & Aid Records to initialize group IDs, then reopen this activity.');
      const state=ledger(actor), extra=aidExtra(state,group.id,turn(actor));
      const context={kind:'aid',turn:turn(actor),targetId:group.id,dc:group.negotiationDC+2+extra};
      validate(actor,context,game.user);
      const accepted=await foundry.applications.api.DialogV2.confirm({window:{title:text('请求外援','Foreign Aid')},content:`<p>${esc(group.name)} · DC ${group.negotiationDC} + 2 + ${extra} = ${context.dc}</p><p>${text('同一团体每回合一次；取消不占次数。','Once per group per turn; canceling consumes no attempt.')}</p>`,rejectClose:false});
      return accepted ? context : false;
    }
    const choices=adapter.projects(actor).filter(p=>p.current<p.total && p.document.canUserModify(game.user,'update'));
    if (!choices.length) fail('本王国没有可加速的未完成建筑。','No unfinished project in this kingdom.');
    const answer=await input(text('加速项目：选择建筑','Accelerate Project'),`<label>${text('建筑／当前进度／检定 DC','Project / progress / check DC')}<select name="targetId">${choices.map(p=>`<option value="${esc(p.id)}">${esc(p.label)} · ${p.current}/${p.total} RP · DC ${p.dc+2}</option>`).join('')}</select></label>`);
    if (!answer) return false;
    const p=choices.find(p=>p.id===answer.targetId);
    if (!p) fail('无效建筑。','Invalid project.');
    const context={kind:'accelerate',targetId:p.id,turn:turn(actor),dc:p.dc+2};
    validate(actor,context,game.user);
    return {...context,skills:p.skills};
  }
  async function payDialog(actor,targetId,attemptId) {
    const state=ledger(actor), p=project(actor,targetId,game.user);
    const maximum=Math.min(allowance(actor,state,p,attemptId),p.total-p.current,kingdom(actor).resourcePoints.now);
    if (maximum<=0) fail('当前没有可投入的 RP 额度。','No RP allowance available.');
    const expectedTurn=turn(actor);
    const answer=await input(text('投入工程 RP','Invest Construction RP'),`<p>${esc(p.label)} · ${p.current}/${p.total} RP</p><label>RP (1–${maximum})<input name="amount" type="number" min="1" max="${maximum}" step="1" value="${maximum}" required></label>`,text('确认投入','Invest'));
    if (!answer) return;
    await api().request('projectSpend',{actorUuid:actor.uuid,targetId,attemptId,turn:expectedTurn,amount:Number(answer.amount)});
    ui.notifications.info(text('工程投入已保存。','Construction payment saved.'));
  }
  async function show(actor) {
    if (!actor.canUserModify(game.user,'update')) fail('没有修改此王国的权限。','Cannot update this kingdom.');
    // Explicit, versioned, idempotent metadata initialization; never on ready.
    await api().request('projectGroups',{actorUuid:actor.uuid});
    const state=ledger(actor), now=turn(actor);
    const rows=state.attempts.slice(-50).reverse().map(a=>`<tr><td>${a.turn}</td><td>${esc(a.label)}</td><td>${a.kind==='aid'?text('外援','Aid'):text('加速','Accelerate')}</td><td>DC ${a.dc} · ${esc(a.degree)}${a.kind==='accelerate'?` · ≤${a.limit} RP`:''}</td></tr>`).join('');
    const actions=[];
    for(const p of state.payments.filter(x=>x.status==='pending')) {
      actions.push({id:`resume:${p.id}`,label:text('继续待处理投入：','Resume payment: ')+p.label,run:()=>api().request('projectSpend',{actorUuid:actor.uuid,paymentId:p.id})});
      if(game.user.isGM) actions.push({id:`manual:${p.id}`,label:text('人工核对后标记已处理：','Mark manually reconciled: ')+p.label,run:async()=>{
        if(await foundry.applications.api.DialogV2.confirm({window:{title:text('人工核对','Manual reconciliation')},content:`<p>${text('此操作不会退回 RP 或修改建筑。请先核对并手动修正已扣 RP 与建筑进度，再标记已处理。','This does not refund RP or change the project. Reconcile debited RP and progress manually before marking complete.')}</p>`,rejectClose:false})) await api().request('projectReconcile',{actorUuid:actor.uuid,paymentId:p.id,resolution:'manual'});
      }});
    }
    for(const a of state.attempts.filter(x=>x.kind==='accelerate' && x.turn===now && x.limit>0)) {
      actions.push({id:a.id,label:text('投入加速 RP：','Invest acceleration RP: ')+a.label,run:()=>payDialog(actor,a.targetId,a.id)});
    }
    const groups=(kingdom(actor).groups || []).filter(g=>g.relations!=='none').map(g=>`<li>${esc(g.name)} · DC ${g.negotiationDC} + 2 + ${aidExtra(state,g.id,now)} = ${g.negotiationDC+2+aidExtra(state,g.id,now)}${state.attempts.some(a=>a.kind==='aid' && a.targetId===g.id && a.turn===now)?' · '+text('本回合已请求','Requested this turn'):''}</li>`).join('');
    const content=`<p>${text('回合','Turn')} ${now} · ${text('最近 50 次检定；援助奖励继续由原结果卡处理。','Latest 50 checks; aid benefits remain on the original result card.')}</p><p>${text('下次外援参考 DC（本回合已请求的团体须等下一回合）','Next aid DC (groups already attempted must wait until next turn)')}</p><ul>${groups}</ul><table><thead><tr><th>${text('回合','Turn')}</th><th>${text('目标','Target')}</th><th>${text('活动','Activity')}</th><th>${text('结果','Result')}</th></tr></thead><tbody>${rows}</tbody></table>`;
    if(!actions.length) {await input(text('工程与外援记录','Project & Aid Records'),content,text('关闭','Close'));return;}
    const choice=await input(text('工程与外援记录','Project & Aid Records'),content+`<label>${text('后续操作','Follow-up')}<select name="action">${actions.map(a=>`<option value="${esc(a.id)}">${esc(a.label)}</option>`).join('')}</select></label>`);
    if(choice) await actions.find(a=>a.id===choice.action)?.run();
  }
  globalThis.foundryvttKotlinPatches.turnProjects={install:a=>{adapter=a;},ledger,aidExtra,limit,validate,record,spend,reconcile,allowance,prepare,payDialog,show};
})();
