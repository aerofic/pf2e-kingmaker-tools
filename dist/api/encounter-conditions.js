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
