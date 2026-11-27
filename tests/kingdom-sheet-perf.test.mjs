import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadBundle } from './helpers/bundle-harness.mjs';

const root = new URL('../', import.meta.url);
const readText = (rel) => readFileSync(new URL(rel, root), 'utf8');

function sampleBaseline() {
  return {
    name: 'Stolen Kingdom',
    atWar: false,
    fame: { now: 2, next: 3, type: 'infamy' },
    level: 5,
    xp: 450,
    xpThreshold: 1000,
    unrest: 1,
    ruin: {
      crime: { value: 1, threshold: 10, penalty: 0 },
      corruption: { value: 0, threshold: 10, penalty: 0 },
      strife: { value: 2, threshold: 10, penalty: 0 },
      decay: { value: 0, threshold: 10, penalty: 0 },
    },
    commodities: {
      now: { food: 3, lumber: 4, luxuries: 1, ore: 2, stone: 5 },
      next: { food: 1, lumber: 0, luxuries: 0, ore: 1, stone: 2 },
    },
    workSites: {
      farmlands: { quantity: 2, resources: 1 },
      lumberCamps: { quantity: 1, resources: 1 },
      mines: { quantity: 1, resources: 0 },
      quarries: { quantity: 0, resources: 0 },
    },
    size: 12,
    resourcePoints: { now: 6, next: 2 },
    resourceDice: { now: 5, next: 0 },
    activeSettlement: 'Scene.Capital1',
    supernaturalSolutions: 1,
    creativeSolutions: 2,
    blessedSolutions: 1,
    consumption: { armies: 1, now: 2, next: 1 },
    charter: {
      type: 'fealty',
      abilityBoosts: { culture: false, economy: true, loyalty: true, stability: false },
    },
    heartland: { type: 'forestOrSwamp' },
    government: {
      type: 'feudalism',
      abilityBoosts: { culture: false, economy: false, loyalty: true, stability: true },
      featRuinThresholdIncreases: [{ crime: { value: 2, increase: true } }],
    },
    abilityBoosts: { culture: true, economy: true, loyalty: false, stability: false },
    features: [
      { id: 'ability-boosts', featId: null, abilityBoosts: { culture: true, economy: false, loyalty: true, stability: false } },
      { id: 'kingdom-feat-2', featId: 'cooperative-leadership' },
      { id: 'kingdom-feat-5', featId: 'predictive-shopping', abilityBoosts: { culture: false, economy: true, loyalty: false, stability: false } },
    ],
    bonusFeats: [
      { id: 'civic-planning-bonus', supportedLeader: 'general' },
    ],
    leaders: {
      ruler: { uuid: 'Actor.PC1', type: 'pc', invested: true, vacant: false },
      counselor: { uuid: 'Actor.NPC1', type: 'regularNpc', invested: false, vacant: false },
    },
    groups: [
      { id: 'grp-1', name: 'Restov', negotiationDC: 18, atWar: false, preventPledgeOfFealty: false, relations: 'tradeAgreement' },
    ],
    skillRanks: { agriculture: 'trained', defense: 'expert' },
    abilityScores: { culture: 14, economy: 16, loyalty: 12, stability: 14 },
    milestones: [
      { id: 'm1', completed: true, enabled: true },
      { id: 'm2', completed: false, enabled: true },
    ],
    notes: {
      public: '<p>Public ledger</p>',
      gm: '<p>Secret GM plan</p>',
    },
    initialProficiencies: ['agriculture', 'defense', 'engineering', 'politics'],
  };
}

function getMergeHarness() {
  const c = loadBundle();
  c.audit(`
    expandObject = (obj) => {
      const out = {};
      for (const [flatKey, val] of Object.entries(obj || {})) {
        const parts = flatKey.split('.');
        let cur = out;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
          cur = cur[parts[i]];
        }
        cur[parts[parts.length - 1]] = val;
      }
      return out;
    };
  `);
  return {
    perf: c.foundryvttKotlinPatches.kingdomSheetPerf,
    merge(raw, baseline, extra = {}) {
      const parseFn = c.audit(`(obj, fb) => parseFormData(obj, fb, () => {})`);
      const merged = c.foundryvttKotlinPatches.kingdomSheetPerf.mergePartialKingdomFormData({
        raw,
        baseline,
        filterBlanks: true,
        parseFormDataFn: parseFn,
        activeLeader: 'counselor',
        bonusFeat: 'keep-preview',
        ...extra,
      });
      return JSON.parse(JSON.stringify(merged));
    },
  };
}

test('partial submit from Turn tab preserves unrendered Creation, Bonus, Features, Groups, and Notes fields', () => {
  const { merge } = getMergeHarness();
  const baseline = sampleBaseline();
  const merged = merge({
    name: 'Stolen Kingdom',
    'fame.now': 3,
    'fame.next': 4,
    xp: 450,
    xpThreshold: 1000,
    level: 5,
    activeSettlement: 'Scene.Capital1',
    activeLeader: 'ruler',
    atWar: false,
    'leaders.ruler.vacant': true,
    'leaders.counselor.vacant': false,
    unrest: 4,
    'milestones.0.id': 'm1',
    'milestones.0.completed': false,
    'milestones.0.enabled': true,
    'milestones.1.id': 'm2',
    'milestones.1.completed': true,
    'milestones.1.enabled': true,
  }, baseline);

  assert.equal(merged.unrest, 4);
  assert.equal(merged.fame.now, 3);
  assert.equal(merged.fame.type, 'infamy');
  assert.equal(merged.activeLeader, 'ruler');
  assert.equal(merged.leaders.ruler.vacant, true);
  assert.equal(merged.leaders.ruler.uuid, 'Actor.PC1');
  assert.equal(merged.leaders.ruler.type, 'pc');
  assert.equal(merged.leaders.ruler.invested, true);
  assert.deepEqual(merged.charter, baseline.charter);
  assert.deepEqual(merged.heartland, baseline.heartland);
  assert.deepEqual(merged.government, baseline.government);
  assert.deepEqual(merged.features, baseline.features);
  assert.deepEqual(merged.bonusFeats, baseline.bonusFeats);
  assert.deepEqual(merged.groups, baseline.groups);
  assert.deepEqual(merged.notes, baseline.notes);
  assert.deepEqual(merged.initialProficiencies, baseline.initialProficiencies);
  assert.equal(merged.milestones[0].completed, false);
  assert.equal(merged.milestones[1].completed, true);
});

test('clearing optional selects (activeSettlement, charter.type, bonusFeat) removes stale values', () => {
  const { merge } = getMergeHarness();
  const baseline = sampleBaseline();

  const mTurn = merge({ activeSettlement: '' }, baseline);
  assert.equal(mTurn.activeSettlement, undefined);

  const mCreation = merge({ 'charter.type': '', 'heartland.type': '', 'government.type': '' }, baseline);
  assert.equal(mCreation.charter.type, undefined);
  assert.equal(mCreation.heartland.type, undefined);
  assert.equal(mCreation.government.type, undefined);

  const mBonus = merge({ bonusFeat: '' }, baseline);
  assert.equal(mBonus.bonusFeat, undefined);
});

test('partial submit from Creation tab preserves fame.now/next, leaders.vacant, groups, milestones, notes, and activeLeader', () => {
  const { merge } = getMergeHarness();
  const baseline = sampleBaseline();
  const merged = merge({
    name: 'Stolen Kingdom',
    'fame.now': 2,
    'fame.next': 3,
    xp: 450,
    xpThreshold: 1000,
    level: 5,
    'fame.type': 'fame',
    'charter.type': 'conquest',
    'heartland.type': 'lakeOrRiver',
    'government.type': 'oligarchy',
    'leaders.ruler.type': 'regularNpc',
    'leaders.ruler.invested': false,
    'initialProficiencies.0': 'boating',
    'initialProficiencies.1': 'intrigue',
    'initialProficiencies.2': '',
    'initialProficiencies.3': 'wilderness',
  }, baseline);

  assert.equal(merged.fame.type, 'fame');
  assert.equal(merged.fame.now, 2);
  assert.equal(merged.fame.next, 3);
  assert.equal(merged.activeLeader, 'counselor');
  assert.equal(merged.leaders.ruler.type, 'regularNpc');
  assert.equal(merged.leaders.ruler.vacant, false);
  assert.deepEqual(merged.initialProficiencies, ['boating', 'intrigue', 'wilderness']);
  assert.deepEqual(merged.groups, baseline.groups);
  assert.deepEqual(merged.milestones, baseline.milestones);
  assert.deepEqual(merged.notes, baseline.notes);
  assert.deepEqual(merged.features, baseline.features);
});

test('partial submit from an active Level sub-tab updates matched feature without sparse holes or data loss', () => {
  const { merge } = getMergeHarness();
  const baseline = sampleBaseline();
  const merged = merge({
    'features.7.id': 'kingdom-feat-5',
    'features.7.featId': 'free-and-fair',
    'features.7.abilityBoosts.culture': true,
    'features.7.abilityBoosts.economy': false,
  }, baseline);

  assert.equal(merged.features.length, 3);
  assert.deepEqual(merged.features[0], baseline.features[0]);
  assert.deepEqual(merged.features[1], baseline.features[1]);
  assert.equal(merged.features[2].id, 'kingdom-feat-5');
  assert.equal(merged.features[2].featId, 'free-and-fair');
  assert.equal(merged.features[2].abilityBoosts.culture, true);

  const appended = merge({
    'features.9.id': 'kingdom-feat-8',
    'features.9.featId': 'crush-dissent',
  }, baseline);
  assert.equal(appended.features.length, 4);
  assert.deepEqual(appended.features[3], { id: 'kingdom-feat-8', featId: 'crush-dissent' });
});

test('partial submit from Notes as non-GM, Trade Agreements, and Settlements/Modifiers keeps unrelated tabs intact', () => {
  const { merge } = getMergeHarness();
  const baseline = sampleBaseline();

  const mNotes = merge({ 'notes.public': '<p>Updated</p>' }, baseline);
  assert.equal(mNotes.notes.public, '<p>Updated</p>');
  assert.equal(mNotes.notes.gm, '<p>Secret GM plan</p>');
  assert.deepEqual(mNotes.groups, baseline.groups);

  const mGroups = merge({
    'groups.0.id': 'grp-1',
    'groups.0.name': 'Brevoy',
    'groups.0.negotiationDC': 20,
    'groups.0.atWar': false,
    'groups.0.preventPledgeOfFealty': true,
    'groups.0.relations': 'friendly',
  }, baseline);
  assert.equal(mGroups.groups.length, 1);
  assert.equal(mGroups.groups[0].name, 'Brevoy');
  assert.deepEqual(mGroups.notes, baseline.notes);
  assert.deepEqual(mGroups.features, baseline.features);

  const mHeader = merge({ name: 'Renamed', xp: 600 }, baseline);
  assert.equal(mHeader.name, 'Renamed');
  assert.equal(mHeader.xp, 600);
  assert.deepEqual(mHeader.charter, baseline.charter);
  assert.deepEqual(mHeader.groups, baseline.groups);
  assert.deepEqual(mHeader.milestones, baseline.milestones);
});

test('hook filters ignore irrelevant scene/canvas/status/actor updates and debounce bursts', async () => {
  const c = loadBundle();
  const perf = c.foundryvttKotlinPatches.kingdomSheetPerf;
  const kingdom = sampleBaseline();
  kingdom.settlements = [{ sceneId: 'Scene.Capital1' }, { sceneId: 'Scene.Town2' }];

  let renders = 0;
  const sheet = {
    rendered: true,
    panelHooksDisposed: false,
    w5q_1: { p3: () => 'turn' },
    r5q_1: {
      uuid: 'Actor.Party1',
      getFlag: (ns, key) => (ns === 'pf2e-kingmaker-tools' && key === 'kingdom-sheet' ? kingdom : null),
    },
    render: () => { renders += 1; return Promise.resolve(sheet); },
  };

  assert.equal(perf.shouldHandleSceneHook(sheet, 'Scene.Dungeon99'), false);
  assert.equal(perf.shouldHandleSceneHook(sheet, 'Scene.Town2'), true);
  assert.equal(perf.shouldHandleSceneHook(sheet, 'Scene.Dungeon99', { isDeleteScene: true }), false);
  sheet.w5q_1 = { p3: () => 'settlements' };
  assert.equal(perf.shouldHandleSceneHook(sheet, 'Scene.Dungeon99', { isDeleteScene: true }), true);
  assert.equal(perf.shouldHandleCanvasReady(sheet), true);
  sheet.w5q_1 = { p3: () => 'turn' };
  assert.equal(perf.shouldHandleCanvasReady(sheet), false);

  const isStructure = (doc) => doc?.isStructure === true;
  assert.equal(perf.shouldHandleStatusEffectHook(sheet, { actor: { type: 'npc' }, parent: { id: 'Scene.Dungeon99' } }, isStructure), false);
  assert.equal(perf.shouldHandleStatusEffectHook(sheet, { actor: { type: 'army' }, parent: { id: 'Scene.Dungeon99' } }, isStructure), true);
  assert.equal(perf.shouldHandleStatusEffectHook(sheet, { isStructure: true, parent: { id: 'Scene.Dungeon99' } }, isStructure), true);
  assert.equal(perf.shouldHandleStatusEffectHook(sheet, { actor: { type: 'character' }, parent: { id: 'Scene.Capital1' } }, isStructure), true);

  const hasLeader = (k, uuid) => Object.values(k.leaders).some(l => l.uuid === uuid);
  const hasMayor = () => false;

  assert.equal(perf.shouldHandleActorUpdate(sheet, { uuid: 'Actor.Party1' }, { flags: { 'pf2e-kingmaker-tools': { 'camping-sheet': { rest: true } } } }, hasLeader, hasMayor), false);
  assert.equal(perf.shouldHandleActorUpdate(sheet, { uuid: 'Actor.Party1' }, { 'flags.pf2e-kingmaker-tools.camping-sheet.x': 1 }, hasLeader, hasMayor), false);
  assert.equal(perf.shouldHandleActorUpdate(sheet, { uuid: 'Actor.Party1' }, { flags: { 'pf2e-kingmaker-tools': { kingdomTurn: 4 } } }, hasLeader, hasMayor), true);
  assert.equal(perf.shouldHandleActorUpdate(sheet, { uuid: 'Actor.Party1' }, { 'flags.pf2e-kingmaker-tools.kingdom-sheet.unrest': 3 }, hasLeader, hasMayor), true);

  assert.equal(perf.shouldHandleActorUpdate(sheet, { uuid: 'Actor.PC1' }, { system: { attributes: { hp: { value: 10 } } } }, hasLeader, hasMayor), false);
  assert.equal(perf.shouldHandleActorUpdate(sheet, { uuid: 'Actor.PC1' }, { 'system.attributes.hp.value': 10 }, hasLeader, hasMayor), false);
  assert.equal(perf.shouldHandleActorUpdate(sheet, { uuid: 'Actor.PC1' }, { system: { skills: { warfare: { rank: 2 } } } }, hasLeader, hasMayor), true);
  assert.equal(perf.shouldHandleActorUpdate(sheet, { uuid: 'Actor.PC1' }, { name: 'Amiri II' }, hasLeader, hasMayor), true);
  assert.equal(perf.shouldHandleActorUpdate(sheet, { uuid: 'Actor.Unrelated' }, { name: 'Goblin' }, hasLeader, hasMayor), false);

  assert.equal(perf.shouldSkipDocumentRender(sheet, { renderContext: 'updateActor', renderData: { flags: { 'pf2e-kingmaker-tools': { 'camping-sheet': {} } } } }, undefined, hasLeader, hasMayor), true);
  assert.equal(perf.shouldSkipDocumentRender(sheet, { force: true, renderContext: 'updateActor', renderData: { flags: { 'pf2e-kingmaker-tools': { 'camping-sheet': {} } } } }, undefined, hasLeader, hasMayor), false);
  assert.equal(perf.shouldSkipDocumentRender(sheet, { renderContext: 'updateActor', renderData: { flags: { 'pf2e-kingmaker-tools': { 'kingdom-sheet': { size: 13 } } } } }, undefined, hasLeader, hasMayor), false);

  perf.scheduleRender(sheet, 15);
  perf.scheduleRender(sheet, 15);
  perf.scheduleRender(sheet, 15);
  await new Promise(r => setTimeout(r, 45));
  assert.equal(renders, 1);

  perf.scheduleRender(sheet, 15);
  perf.cancelScheduledRender(sheet);
  await new Promise(r => setTimeout(r, 35));
  assert.equal(renders, 1);
});

test('toggleDetailCard opens and closes lazily without calling sheet.render()', () => {
  const c = loadBundle();
  const perf = c.foundryvttKotlinPatches.kingdomSheetPerf;
  const set = new Set();
  let renderCalls = 0;
  const sheet = { y5q_1: set, render() { renderCalls += 1; } };

  function makeEl(tag, cls = '') {
    const classes = new Set(cls ? cls.split(/\s+/).filter(Boolean) : []);
    const attrs = new Map();
    const el = {
      tagName: tag.toUpperCase(),
      children: [],
      parentNode: null,
      dataset: {},
      _classes: classes,
      classList: {
        contains: (k) => classes.has(k),
        add: (k) => classes.add(k),
        remove: (k) => classes.delete(k),
      },
      setAttribute: (k, v) => attrs.set(k, String(v)),
      getAttribute: (k) => attrs.get(k) ?? null,
      append(...nodes) {
        for (const n of nodes) {
          if (n && n._isFragment) {
            for (const child of [...n.children]) el.append(child);
            n.children.length = 0;
          } else if (n) {
            if (n.parentNode) n.parentNode.children = n.parentNode.children.filter(x => x !== n);
            n.parentNode = el;
            el.children.push(n);
          }
        }
      },
      remove() {
        if (this.parentNode) {
          this.parentNode.children = this.parentNode.children.filter(x => x !== this);
          this.parentNode = null;
        }
      },
      querySelector(sel) {
        if (sel === ':scope > template.km-detail-body-template') {
          return this.children.find(ch => ch.tagName === 'TEMPLATE' && ch.classList.contains('km-detail-body-template')) ?? null;
        }
        if (sel === ':scope > .km-detail-body') {
          return this.children.find(ch => ch.classList.contains('km-detail-body')) ?? null;
        }
        return null;
      },
      closest(sel) {
        if (sel === 'li.km-kingdom-details') return li;
        return null;
      },
    };
    return el;
  }

  const origCreate = c.document.createElement;
  c.document.createElement = (tag) => {
    const el = makeEl(tag);
    if (tag === 'template') {
      el.content = {
        _isFragment: true,
        children: [],
        append(node) {
          node?.remove?.();
          this.children.push(node);
        },
      };
      // Real DOM moves classes through className setter; keep mock classList in sync.
      Object.defineProperty(el, 'className', {
        get() { return [...el._classes].join(' '); },
        set(v) { el._classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach(k => el._classes.add(k)); },
      });
    }
    return el;
  };

  const li = makeEl('li', 'km-kingdom-details');
  li.dataset.detailId = 'activity-claim-hex';
  const btn = makeEl('button', 'km-detail-toggle');
  btn.dataset.detailToggle = 'activity-claim-hex';
  const tpl = c.document.createElement('template');
  tpl.className = 'km-detail-body-template';
  tpl.classList.add('km-detail-body-template');
  const body = makeEl('div', 'km-detail-body');
  tpl.content.append(body);
  li.append(btn, tpl);

  assert.equal(perf.toggleDetailCard(sheet, btn), true);
  assert.equal(renderCalls, 0);
  assert.equal(set.has('activity-claim-hex'), true);
  assert.equal(li.classList.contains('is-open'), true);
  assert.equal(btn.getAttribute('aria-expanded'), 'true');
  assert.ok(li.querySelector(':scope > .km-detail-body'));
  assert.equal(li.querySelector(':scope > template.km-detail-body-template'), null);

  assert.equal(perf.toggleDetailCard(sheet, btn), false);
  assert.equal(renderCalls, 0);
  assert.equal(set.has('activity-claim-hex'), false);
  assert.equal(li.classList.contains('is-open'), false);
  assert.equal(btn.getAttribute('aria-expanded'), 'false');
  assert.equal(li.querySelector(':scope > .km-detail-body'), null);
  assert.ok(li.querySelector(':scope > template.km-detail-body-template'));

  c.document.createElement = origCreate;
});

test('Select#y41 exposes selectedOptionClasses and templates/CSS enforce performance invariants', () => {
  const c = loadBundle();
  const selectCtx = c.audit(`(() => {
    const opts = _kotlin_kotlin_stdlib_mjs__WEBPACK_IMPORTED_MODULE_2__.listOf1jh22dvmctj1r([
      new SelectOption('Trained', 'trained', _kotlin_kotlin_stdlib_mjs__WEBPACK_IMPORTED_MODULE_2__.listOfvhqybd2zx248('km-proficiency-trained')),
      new SelectOption('Expert', 'expert', _kotlin_kotlin_stdlib_mjs__WEBPACK_IMPORTED_MODULE_2__.listOfvhqybd2zx248('km-proficiency-expert')),
    ]);
    return (new Select('Skill', 'skillRanks.defense', 'expert', opts)).y41();
  })()`);
  assert.equal(selectCtx.value, 'expert');
  assert.equal(selectCtx.selectedOptionClasses, 'km-proficiency-expert');

  const styleCss = readText('dist/style.css');
  assert.doesNotMatch(styleCss, /:has\(/);
  assert.match(styleCss, /data-km-value="criticalSuccess"/);
  assert.match(styleCss, /data-km-selected-class~="km-proficiency-expert"/);

  const formElementHbs = readText('dist/components/forms/form-element.hbs');
  assert.match(formElementHbs, /data-km-value="\{\{value\}\}"/);
  assert.match(formElementHbs, /data-km-selected-class="\{\{selectedOptionClasses\}\}"/);

  for (const tplPath of ['dist/applications/kingdom/activities.hbs', 'dist/applications/kingdom/events.hbs']) {
    const hbs = readText(tplPath);
    assert.doesNotMatch(hbs, /<summary[\s\S]*?<button/);
    assert.match(hbs, /km-detail-toggle/);
    assert.match(hbs, /km-detail-body-template/);
  }

  const sheetHbs = readText('dist/applications/kingdom/kingdom-sheet.hbs');
  for (const tab of ['kingdom', 'notes', 'turn', 'tradeAgreements', 'settlements', 'modifiers']) {
    assert.match(sheetHbs, new RegExp(`#if \\(eq currentNavEntry '${tab}'\\)`));
  }
  assert.match(readText('dist/applications/kingdom/sections/character-sheet/page.hbs'), /#unless hideCreation/);
  assert.match(readText('dist/applications/kingdom/sections/character-sheet/levels.hbs'), /#unless hidden/);
  assert.match(readText('dist/applications/kingdom/sections/notes/page.hbs'), /#if isGM/);
});
