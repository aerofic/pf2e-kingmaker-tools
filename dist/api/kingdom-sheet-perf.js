// BEGIN GENERATED KINGMAKER SHEET PERF helper source
/* KingdomSheet performance helpers: hook filtering, render coalescing, lazy detail bodies,
 * delegated select styling without :has(), and partial-form merge for active-tab rendering. */
(() => {
  const ns = globalThis.foundryvttKotlinPatches = globalThis.foundryvttKotlinPatches || {};
  const MODULE_ID = 'pf2e-kingmaker-tools';
  const PENDING_RENDERS = new WeakMap();
  const PROTECTED_PATH_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
  const NON_SCALAR_ARRAY_ROOTS = new Set(['features', 'bonusFeats', 'groups', 'milestones', 'initialProficiencies']);
  const SKIPPED_WHOLE_SUBTREE_ROOTS = new Set([...NON_SCALAR_ARRAY_ROOTS, 'government', 'charter', 'heartland', 'abilityBoosts']);
  const RELEVANT_LEADER_KEYS = new Set(['name', 'img', 'items']);
  const RELEVANT_LEADER_SYSTEM_PREFIXES = ['details', 'skills', 'abilities', 'proficiencies', 'attributes.classDC'];
  let selectListenerInstalled = false;

  function kingdomFlag(sheet) {
    return sheet?.r5q_1?.getFlag?.(MODULE_ID, 'kingdom-sheet') ?? null;
  }

  function currentNavKey(sheet) {
    return sheet?.w5q_1?.p3?.() ?? null;
  }

  function hasMethod(obj, name) {
    return obj != null && typeof obj[name] === 'function';
  }

  function openSetHas(set, id) {
    if (hasMethod(set, 'e2')) return set.e2(id);
    return hasMethod(set, 'has') ? set.has(id) : false;
  }

  function openSetAdd(set, id) {
    if (hasMethod(set, 'n1')) set.n1(id);
    else if (hasMethod(set, 'add')) set.add(id);
  }

  function openSetDelete(set, id) {
    if (hasMethod(set, 'r5')) set.r5(id);
    else if (hasMethod(set, 'delete')) set.delete(id);
  }

  function settlementSceneIds(kingdom) {
    const ids = new Set();
    if (kingdom?.activeSettlement) ids.add(kingdom.activeSettlement);
    if (Array.isArray(kingdom?.settlements)) {
      for (const s of kingdom.settlements) {
        if (s?.sceneId) ids.add(s.sceneId);
      }
    }
    return ids;
  }

  function shouldHandleSceneHook(sheet, sceneId, options = {}) {
    if (!sheet?.rendered || sheet.panelHooksDisposed) return false;
    if (options.isDeleteScene && currentNavKey(sheet) === 'settlements') return true;
    if (!sceneId) return false;
    const kingdom = kingdomFlag(sheet);
    if (!kingdom) return false;
    return settlementSceneIds(kingdom).has(sceneId);
  }

  function shouldHandleCanvasReady(sheet) {
    return Boolean(sheet?.rendered && !sheet.panelHooksDisposed && currentNavKey(sheet) === 'settlements');
  }

  function shouldHandleStatusEffectHook(sheet, token, isStructureFn) {
    if (!sheet?.rendered || sheet.panelHooksDisposed || !token) return false;
    const doc = token.document ?? token;
    if (typeof isStructureFn === 'function' && isStructureFn(doc)) return true;
    if (doc?.actor?.type === 'army') return true;
    const sceneId = doc?.parent?.id ?? token?.scene?.id ?? null;
    return shouldHandleSceneHook(sheet, sceneId);
  }

  function changedHasModuleKingdomWrite(changed) {
    if (!changed || typeof changed !== 'object') return true;
    if (Object.hasOwn(changed, 'name') || Object.hasOwn(changed, 'ownership')) return true;
    const modFlags = changed.flags?.[MODULE_ID];
    if (modFlags && typeof modFlags === 'object') {
      for (const key of Object.keys(modFlags)) {
        if (key !== 'camping-sheet' && key !== 'restTimeGuard') return true;
      }
    }
    const flatModPrefix = `flags.${MODULE_ID}.`;
    for (const key of Object.keys(changed)) {
      if (key.startsWith(flatModPrefix)) {
        const sub = key.slice(flatModPrefix.length).split('.')[0];
        if (sub !== 'camping-sheet' && sub !== 'restTimeGuard') return true;
      } else if (key === `flags.${MODULE_ID}`) {
        return true;
      }
    }
    return false;
  }

  function changedAffectsLeaderStats(changed) {
    if (!changed || typeof changed !== 'object') return true;
    for (const key of Object.keys(changed)) {
      if (RELEVANT_LEADER_KEYS.has(key)) return true;
      if (key.startsWith('system.')) {
        const sub = key.slice('system.'.length);
        if (RELEVANT_LEADER_SYSTEM_PREFIXES.some(p => sub === p || sub.startsWith(p + '.'))) return true;
      }
    }
    const sys = changed.system;
    if (sys && typeof sys === 'object') {
      for (const key of Object.keys(sys)) {
        if (['details', 'skills', 'abilities', 'proficiencies'].includes(key)) return true;
        if (key === 'attributes' && sys.attributes && typeof sys.attributes === 'object' && Object.hasOwn(sys.attributes, 'classDC')) {
          return true;
        }
      }
    }
    return false;
  }

  function shouldHandleActorUpdate(sheet, actor, changed, hasLeaderUuidFn, hasMayorUuidFn) {
    if (!sheet?.rendered || sheet.panelHooksDisposed || !actor) return false;
    const kingdom = kingdomFlag(sheet);
    if (!kingdom) return false;
    const partyUuid = sheet.r5q_1?.uuid;
    if (actor.uuid === partyUuid) {
      return changedHasModuleKingdomWrite(changed);
    }
    const isLeader = typeof hasLeaderUuidFn === 'function' && hasLeaderUuidFn(kingdom, actor.uuid);
    const isMayor = typeof hasMayorUuidFn === 'function' && hasMayorUuidFn(kingdom, actor.uuid);
    if (!isLeader && !isMayor) return false;
    return changedAffectsLeaderStats(changed);
  }

  function shouldSkipDocumentRender(sheet, options, _options, hasLeaderUuidFn, hasMayorUuidFn) {
    if (options === true || options?.force === true) return false;
    const ctxObj = typeof options === 'object' && options !== null ? options
      : (typeof _options === 'object' && _options !== null ? _options : null);
    if (!ctxObj || ctxObj.renderContext !== 'updateActor' || !ctxObj.renderData || typeof ctxObj.renderData !== 'object') {
      return false;
    }
    return !shouldHandleActorUpdate(sheet, sheet?.r5q_1, ctxObj.renderData, hasLeaderUuidFn, hasMayorUuidFn);
  }

  function cancelScheduledRender(sheet) {
    if (!sheet) return;
    const timer = PENDING_RENDERS.get(sheet);
    if (timer != null) {
      clearTimeout(timer);
      PENDING_RENDERS.delete(sheet);
    }
  }

  function scheduleRender(sheet, delayMs = 80) {
    if (!sheet?.rendered || sheet.panelHooksDisposed) return false;
    if (PENDING_RENDERS.has(sheet)) return true;
    const timer = setTimeout(() => {
      PENDING_RENDERS.delete(sheet);
      if (sheet.rendered && !sheet.panelHooksDisposed) {
        Promise.resolve(sheet.render()).catch(error => console.error(`${MODULE_ID} | Scheduled render failed`, error));
      }
    }, delayMs);
    PENDING_RENDERS.set(sheet, timer);
    return true;
  }

  function toggleDetailCard(sheet, toggleButton) {
    const li = toggleButton?.closest?.('li.km-kingdom-details') || null;
    if (!li) return false;
    const id = toggleButton.dataset?.detailToggle || li.dataset?.detailId || '';
    const opening = !li.classList.contains('is-open');
    if (opening) {
      openSetAdd(sheet?.y5q_1, id);
      const tpl = li.querySelector(':scope > template.km-detail-body-template');
      if (tpl?.content) {
        li.append(tpl.content);
        tpl.remove();
      }
      li.classList.add('is-open');
      toggleButton.setAttribute('aria-expanded', 'true');
    } else {
      openSetDelete(sheet?.y5q_1, id);
      const body = li.querySelector(':scope > .km-detail-body');
      if (body && typeof document?.createElement === 'function') {
        const tpl = document.createElement('template');
        tpl.className = 'km-detail-body-template';
        tpl.content.append(body);
        li.append(tpl);
      }
      li.classList.remove('is-open');
      toggleButton.setAttribute('aria-expanded', 'false');
    }
    return opening;
  }

  function syncSelectStyleAttrs(select) {
    if (!select || !select.dataset) return;
    const value = select.value ?? '';
    if (value) select.dataset.kmValue = value;
    else delete select.dataset.kmValue;
    const selectedOpt = select.selectedOptions?.[0] ?? null;
    const optClasses = typeof selectedOpt?.className === 'string' ? selectedOpt.className.trim() : '';
    if (optClasses) select.dataset.kmSelectedClass = optClasses;
    else delete select.dataset.kmSelectedClass;
  }

  function installSelectStyleListener() {
    if (selectListenerInstalled || typeof document?.addEventListener !== 'function') return;
    selectListenerInstalled = true;
    document.addEventListener('change', event => {
      const target = event?.target;
      if (!target?.matches?.('select.km-degree-of-success, select.km-rarity, select.km-proficiency')) return;
      syncSelectStyleAttrs(target);
    });
  }

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function safeSegments(dottedPath) {
    const parts = String(dottedPath).split('.');
    if (!parts.length || parts.some(p => !p || PROTECTED_PATH_KEYS.has(p))) return null;
    return parts;
  }

  function setAtSegments(target, segments, value) {
    let cursor = target;
    for (let i = 0; i < segments.length - 1; i++) {
      const key = segments[i];
      if (!isPlainObject(cursor[key])) cursor[key] = {};
      cursor = cursor[key];
    }
    cursor[segments[segments.length - 1]] = value;
  }

  function deleteAtSegments(target, segments) {
    let cursor = target;
    for (let i = 0; i < segments.length - 1; i++) {
      cursor = cursor?.[segments[i]];
      if (!isPlainObject(cursor)) return;
    }
    delete cursor[segments[segments.length - 1]];
  }

  function cloneValue(value) {
    if (typeof foundry?.utils?.deepClone === 'function') return foundry.utils.deepClone(value);
    return structuredClone(value);
  }

  function mergePartialKingdomFormData({ raw, baseline, filterBlanks = true, parseFormDataFn, activeLeader = null, bonusFeat = null }) {
    const merged = cloneValue(baseline || {});
    if (merged.bonusFeat === undefined) merged.bonusFeat = bonusFeat ?? null;
    if (merged.activeLeader === undefined) merged.activeLeader = activeLeader ?? null;
    if (merged.ongoingEvent === undefined) merged.ongoingEvent = null;
    if (merged.blessedSolutions === undefined) merged.blessedSolutions = 0;

    const rawObj = raw && typeof raw === 'object' ? raw : {};
    const rawKeys = Object.keys(rawObj);
    const presentRoots = new Set(rawKeys.map(k => k.split('.')[0]));
    const partial = typeof parseFormDataFn === 'function' ? parseFormDataFn(rawObj, filterBlanks, () => {}) : {};

    // 1. Subtree-owned Creation / Bonus / Array sections (entirely within one active view when present)
    if (presentRoots.has('government')) merged.government = partial?.government ?? {};
    if (presentRoots.has('charter')) merged.charter = partial?.charter ?? {};
    if (presentRoots.has('heartland')) merged.heartland = partial?.heartland ?? {};
    if (presentRoots.has('abilityBoosts')) merged.abilityBoosts = partial?.abilityBoosts ?? {};

    if (presentRoots.has('bonusFeats')) {
      merged.bonusFeats = Array.isArray(partial?.bonusFeats) ? partial.bonusFeats : [];
    }
    if (presentRoots.has('groups')) {
      merged.groups = Array.isArray(partial?.groups) ? partial.groups : [];
    }
    if (presentRoots.has('milestones')) {
      merged.milestones = Array.isArray(partial?.milestones) ? partial.milestones : [];
    }
    if (presentRoots.has('initialProficiencies')) {
      const profPairs = [];
      for (const key of rawKeys) {
        const m = /^initialProficiencies\.(\d+)$/.exec(key);
        if (m) profPairs.push([Number(m[1]), rawObj[key]]);
      }
      profPairs.sort((a, b) => a[0] - b[0]);
      const profs = [];
      for (const [, val] of profPairs) {
        if (filterBlanks && typeof val === 'string' && val.length === 0) continue;
        profs.push(val);
      }
      merged.initialProficiencies = profs;
    }

    // 2. Features array: only the active level sub-tab renders in DOM, so merge rendered entries by id
    if (presentRoots.has('features')) {
      const grouped = new Map();
      for (const key of rawKeys) {
        const m = /^features\.(\d+)\.(.+)$/.exec(key);
        if (!m) continue;
        const idx = Number(m[1]);
        if (!grouped.has(idx)) grouped.set(idx, {});
        grouped.get(idx)[m[2]] = rawObj[key];
      }
      const nextFeatures = Array.isArray(merged.features) ? merged.features.slice() : [];
      const sortedIndices = [...grouped.keys()].sort((a, b) => a - b);
      for (const idx of sortedIndices) {
        const subRaw = grouped.get(idx);
        const parsedFeature = typeof parseFormDataFn === 'function' ? parseFormDataFn(subRaw, filterBlanks, () => {}) : subRaw;
        if (!parsedFeature || typeof parsedFeature !== 'object') continue;
        const existingIdx = parsedFeature.id != null
          ? nextFeatures.findIndex(entry => entry && entry.id === parsedFeature.id)
          : -1;
        if (existingIdx >= 0) nextFeatures[existingIdx] = parsedFeature;
        else nextFeatures.push(parsedFeature);
      }
      merged.features = nextFeatures;
    }

    // 3. Leaf-level merge for shared/split sections (header, fame, leaders, notes, turn/kingdom sidebar, etc.)
    for (const key of rawKeys) {
      const root = key.split('.')[0];
      if (SKIPPED_WHOLE_SUBTREE_ROOTS.has(root)) continue;
      const segments = safeSegments(key);
      if (!segments) continue;
      const val = rawObj[key];
      if (filterBlanks && typeof val === 'string' && val.length === 0) {
        deleteAtSegments(merged, segments);
      } else {
        setAtSegments(merged, segments, val);
      }
    }

    return merged;
  }

  installSelectStyleListener();

  ns.kingdomSheetPerf = {
    shouldHandleSceneHook,
    shouldHandleCanvasReady,
    shouldHandleStatusEffectHook,
    shouldHandleActorUpdate,
    shouldSkipDocumentRender,
    scheduleRender,
    cancelScheduledRender,
    toggleDetailCard,
    syncSelectStyleAttrs,
    installSelectStyleListener,
    mergePartialKingdomFormData,
    openSetHas,
    openSetAdd,
    openSetDelete,
  };
})();
