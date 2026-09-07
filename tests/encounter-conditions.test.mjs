import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import {fixture, moduleId} from './helpers/concurrency-fixture.mjs';
import {loadBundle} from './helpers/bundle-harness.mjs';

const root = new URL('../', import.meta.url);
const helperSource = readFileSync(new URL('dist/api/encounter-conditions.js', root), 'utf8');
const main = readFileSync(new URL('dist/main.js', root), 'utf8');
const sceneId = 'AJ1k5II28u72JOmz';
const settle = () => new Promise(done => setImmediate(done));

function setup({bundle = false, road = true, ...options} = {}) {
  const f = fixture({...options, bundle: bundle ? loadBundle() : undefined});
  const c = f.gm;
  f.actor.id = 'party';
  const scene = {id: sceneId, grid: {isHexagonal: true, getOffset: point => ({i: Math.floor(point.y / 100), j: Math.floor(point.x / 100)})}};
  const token = {id: 'token', actor: f.actor, parent: scene, x: 0, y: 0,
    getCenterPoint() { return {x: this.x + 50, y: this.y + 50}; }};
  scene.tokens = [token];
  const hexes = new Map([[0, {data: {features: road ? [{type: 'road'}] : []}}], [1, {data: {features: []}}]]);
  const runtime = {api: {KingmakerHex: {getKey: o => o.i * 1000 + o.j}}, region: {scene, hexes}};
  const hooks = new Map();
  function attach(client) {
    client.game.scenes = new Map([[sceneId, scene]]);
    client.game.modules = new Map([['pf2e-kingmaker', {active: true}]]);
    client.kingmaker = runtime;
    vm.runInContext(helperSource, client);
  }
  attach(c);
  c.Hooks.on = (name, fn) => { const list = hooks.get(name) ?? []; list.push(fn); hooks.set(name, list); };
  const helper = c.foundryvttKotlinPatches.encounterConditions;
  helper.install();
  const app = {r4f_1: f.actor, rendered: true, count: 0, async render() { this.count++; }};
  const view = () => helper.context(app, f.actor, f.camping);
  const packet = (kind, value) => { view(); return {actorUuid: f.actor.uuid, kind, value, ...structuredClone(app.__kmEncounterSnapshot)}; };
  const set = (kind, value) => f.api.request('encounterCondition', packet(kind, value));
  const fire = (name, ...args) => { for (const fn of hooks.get(name) ?? []) fn(...args); };
  return {f, c, scene, token, hexes, helper, hooks, app, view, packet, set, fire, attach};
}

test('road defaults use the actual party token center, off-canvas, without any world writes', () => {
  const s = setup();
  assert.equal(s.view().roadRiver, true);
  assert.equal(s.view().modifier, -2);
  assert.equal(s.f.updates.length, 0);
  s.token.x = 100;
  assert.equal(s.view().roadRiver, false);
  assert.equal(s.f.updates.length, 0);
});

for (const [road, flying, expected] of [[false, false, 0], [true, false, -2], [false, true, 3], [true, true, 1]]) {
  test(`independent road=${road} and flying=${flying} have modifier ${expected}`, async () => {
    const s = setup({road});
    await s.set('flying', flying);
    assert.equal(s.view().modifier, expected);
    for (let i = 0; i < 4; i++) assert.equal(s.view().modifier, expected);
  });
}

test('same-hex manual road override survives renders and within-hex movement; auto button restores detection', async () => {
  const s = setup();
  await s.set('roadRiver', false);
  s.token.x = 20;
  s.fire('moveToken', s.token);
  await settle();
  assert.equal(s.view().manual, true);
  assert.equal(s.view().roadRiver, false);
  await s.set('autoRoad');
  assert.equal(s.view().manual, false);
  assert.equal(s.view().roadRiver, true);
});

test('leaving and returning to a hex does not resurrect the previous manual override', async () => {
  const s = setup();
  await s.set('roadRiver', false);
  s.token.x = 100; s.fire('moveToken', s.token);
  await settle();
  assert.equal(s.f.camping.encounterConditions.roadRiver, undefined);
  s.token.x = 0; s.fire('moveToken', s.token);
  await settle();
  assert.equal(s.view().roadRiver, true);
  assert.equal(s.view().manual, false);
});

test('an old movement event cannot erase a newer GM override', async () => {
  const s = setup();
  await s.set('roadRiver', false);
  const old = structuredClone(s.f.camping.encounterConditions.roadRiver);
  s.token.x = 100;
  await s.set('roadRiver', true);
  await s.f.api.request('encounterCondition', {actorUuid: s.f.actor.uuid, kind: 'leaveHex', expected: old, location: s.helper.locate(s.f.actor).key});
  assert.equal(s.view().roadRiver, true);
  assert.equal(s.view().manual, true);
});

test('missing map/runtime data and ambiguous party tokens stay manual and never guess', async () => {
  const s = setup();
  s.scene.tokens.push({...s.token, id: 'duplicate'});
  assert.equal(s.view().location.known, false);
  assert.match(s.view().status, /无法自动识别/);
  await s.set('roadRiver', true);
  assert.equal(s.view().roadRiver, true);
  s.scene.tokens.pop();
  s.c.game.modules.get('pf2e-kingmaker').active = false;
  assert.equal(s.view().location.known, false);
  assert.equal(s.view().roadRiver, false);
});

test('another party is never substituted for a missing party token', () => {
  const s = setup();
  const other = {...s.f.actor, uuid: 'Actor.otherParty'};
  assert.equal(s.helper.evaluate(other, {}).modifier, 0);
  assert.equal(s.helper.locate(other).known, false);
});

test('flight is excluded from rest and disabled while an interrupted rest is pending', async () => {
  const s = setup();
  await s.set('flying', true);
  assert.equal(s.view().modifier, 1);
  assert.equal(s.helper.evaluate(s.f.actor, s.f.camping, true).modifier, -2);
  s.f.camping.watchSecondsRemaining = 600;
  assert.equal(s.view().flying, false);
  assert.equal(s.view().flyDisabled, true);
  await assert.rejects(s.set('flying', true), /休息/);
});

test('GM requests reject stale location, stale conditions, changed rest version and invalid values', async () => {
  const s = setup();
  const moved = s.packet('roadRiver', false);
  s.token.x = 100;
  await assert.rejects(s.f.api.request('encounterCondition', moved), /已变化/);
  const old = s.packet('roadRiver', false);
  await s.set('flying', true);
  await assert.rejects(s.f.api.request('encounterCondition', old), /已变化/);
  const rest = s.packet('roadRiver', false);
  s.f.camping.restOperationVersion++;
  await assert.rejects(s.f.api.request('encounterCondition', rest), /已变化/);
  await assert.rejects(s.set('flying', 'yes'), /Invalid/);
});

test('players cannot use the GM-only operation or smuggle fields through generic camping saves', async () => {
  const s = setup();
  const player = s.f.addClient('player'); s.attach(player);
  const api = player.foundryvttKotlinPatches.concurrency;
  await assert.rejects(api.request('encounterCondition', s.packet('flying', true)), /Only a GM/);
  const data = api.capture(s.f.actor, 'camping-sheet', structuredClone(s.f.camping));
  data.encounterConditions = {flying: true};
  await assert.rejects(api.write(s.f.actor, 'camping-sheet', data), /Only a GM/);
  assert.equal(s.f.updates.length, 0);
});

test('a second GM is serialized through the authority and duplicate receipts do not apply twice', async () => {
  const s = setup();
  const second = s.f.addClient('gm2'); s.attach(second);
  const api = second.foundryvttKotlinPatches.concurrency;
  const packet = s.packet('flying', true);
  await Promise.all([api.request('encounterCondition', packet, 'same-click'), api.request('encounterCondition', packet, 'same-click')]);
  assert.equal(s.f.updates.length, 1);
  assert.equal(s.view().flying, true);
});

test('unrelated concurrent camping fields are preserved', async () => {
  const s = setup();
  const data = s.f.api.capture(s.f.actor, 'camping-sheet', structuredClone(s.f.camping));
  data.section = 'new-section';
  await s.set('roadRiver', false);
  await s.f.api.write(s.f.actor, 'camping-sheet', data);
  assert.equal(s.f.camping.section, 'new-section');
  assert.equal(s.view().roadRiver, false);
});

test('checkbox action prevents full form submission, saves only once and rerenders', async () => {
  const s = setup(); s.view();
  let prevented = 0, stopped = 0;
  const event = {preventDefault() { prevented++; }, stopPropagation() { stopped++; }};
  const target = {checked: false, dataset: {encounterCondition: 'roadRiver'}};
  await Promise.all([s.helper.click(s.app, event, target), s.helper.click(s.app, event, target)]);
  assert.equal(prevented, 2); assert.equal(stopped, 2);
  assert.equal(s.f.updates.length, 1); assert.equal(s.app.count, 1);
  assert.equal(s.view().roadRiver, false);
});

test('hooks install once, filter unrelated tokens, debounce refresh and release closed sheets', async () => {
  const s = setup(); s.helper.install();
  assert.equal(s.hooks.get('moveToken').length, 1);
  s.fire('renderCampingSheet', s.app);
  s.fire('moveToken', {...s.token, parent: {id: 'otherScene'}});
  await settle(); assert.equal(s.app.count, 0);
  s.fire('moveToken', s.token); s.fire('updateToken', s.token, {x: 5});
  await settle(); assert.equal(s.app.count, 1);
  s.fire('closeCampingSheet', s.app); s.fire('moveToken', s.token);
  await settle(); assert.equal(s.app.count, 1);
});

test('actual bundled DC function preserves base, activity and manual modifiers without compounding', () => {
  const s = setup({bundle: true});
  s.c.party = s.f.actor;
  s.c.data = {currentRegion: 'Test', regionSettings: {regions: [{name: 'Test', encounterDc: 14}]}, encounterModifier: 2, encounterConditions: {flying: true}};
  s.c.audit('calculateModifierIncrease=()=>4;');
  // loadBundle's kmEncounterConditions retains the same implementation and shares game/runtime.
  assert.equal(s.c.audit('findEncounterDcModifier(data,true,party)'), 21);
  assert.equal(s.c.audit('findEncounterDcModifier(data,false,party,true)'), 18);
  assert.equal(s.c.data.encounterModifier, 2);
  assert.equal(s.c.audit('findEncounterDcModifier(data,true,party)'), 21);
});

test('actual encounter roll uses the same modified DC as the sheet', async () => {
  const s = setup({bundle: true}); s.c.party = s.f.actor;
  s.c.data = {currentRegion: 'Test', regionSettings: {regions: [{name: 'Test', encounterDc: 14}]}, encounterModifier: 1, randomEncounterRollMode: 'gmroll', encounterConditions: {flying: true}};
  s.c.audit(`calculateModifierIncrease=()=>0; fromUuid=async()=>new RollTable(); t=()=>'';
    d20Check=function* (dc){globalThis.rolledDc=dc;return {d4o_1:{k38:()=>false}};};`);
  await s.c.audit("buildPromise((scope,next)=>rollRandomEncounter_0(data,true,{name:'Test',rollTableUuid:'RollTable.test'},true,1,next,party))");
  assert.equal(s.c.rolledDc, s.c.audit('findEncounterDcModifier(data,true,party)'));
  assert.equal(s.c.rolledDc, 16);
});

test('rest entry clears flight before saving and rest encounters explicitly request rest context', () => {
  assert.match(main, /latestCamping\.restOperationVersion = expectedRestOperationVersion \+ 1;[\s\S]{0,200}latestCamping\.encounterConditions\.flying = false;/);
  assert.match(main, /rollRandomEncounter\(game, campingActor, true, \$completion, true\)/);
  assert.match(main, /encounterConditions: encounterConditionsContext/);
  assert.match(main, /case 'encounter-condition':\s+return kmEncounterConditions\.click\(this, event, target\)/);
});

test('checkbox template remains GM-only, accessible, localized and outside form fields', () => {
  const template = readFileSync(new URL('dist/applications/camping/camping-sheet.hbs', root), 'utf8');
  const area = template.slice(template.indexOf('<div id="km-camping-encounter">'), template.indexOf('<ul class="km-camping-actors">'));
  assert.ok(template.lastIndexOf('{{#if isGM}}', template.indexOf('<div id="km-camping-encounter">')) >= 0);
  assert.match(area, /<label[^>]*>[\s\S]*?<input type="checkbox" data-action="encounter-condition"/);
  assert.doesNotMatch(area, /<input[^>]*\sname=/);
  assert.match(area, /aria-label="\{\{encounterConditions.autoLabel\}\}"/);
  const en = JSON.parse(readFileSync(new URL('dist/lang/encounter-conditions-en.json', root), 'utf8'))[moduleId].encounterConditions;
  const cn = JSON.parse(readFileSync(new URL('dist/lang/encounter-conditions-cn.json', root), 'utf8'))[moduleId].encounterConditions;
  assert.deepEqual(Object.keys(en), Object.keys(cn));
  for (const text of [...Object.values(en), ...Object.values(cn)]) assert.ok(text.trim().length > 0);
});
