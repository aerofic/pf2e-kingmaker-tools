import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../dist/main.js', import.meta.url), 'utf8');
const functions = source.slice(source.indexOf('function kmNpcAttitudeKey('), source.indexOf('function renderKingdomFaithCounter('));
const namespace = 'pf2e-kingmaker-tools';
const neutral = () => ({positive: false, discontent: 0});
const plain = value => JSON.parse(JSON.stringify(value));
function setup() {
  const leaders = {ruler: {type: 'regularNpc', uuid: 'Actor.NPC1'}, general: {type: 'regularNpc', uuid: 'Actor.NPC2'}};
  const attitudes = {}, writes = [], warnings = [];
  let permission = true;
  const actor = {
    getFlag(scope, key) {assert.equal(scope, namespace); return key === 'kingdom-sheet' ? {leaders} : attitudes;},
    canUserModify(user, action) { assert.equal(action, 'update'); return permission; },
    async update(change) {
      writes.push(change);
      for (const [path, value] of Object.entries(change)) {
        const parts = path.split('.');
        (attitudes[parts.at(-2)] ??= {})[parts.at(-1)] = value;
      }
    },
  };
  const context = vm.createContext({
    console, game: {user: {isGM: true}, i18n: {localize: key => key}},
    document: {
      createElement: tagName => ({tagName, children: [], append(...children) {this.children.push(...children);}, setAttribute(key, value) {this[key] = value;}}),
      createTextNode: textContent => ({textContent}),
    },
    foundry: {applications: {api: {DialogV2: {wait: async () => null}}}},
    ui: {notifications: {warn: msg => warnings.push(msg), error: msg => warnings.push(msg)}},
  });
  vm.runInContext(functions, context);
  return {context, actor, leaders, attitudes, writes, warnings, deny: () => {permission = false;}};
}
test('positive attitude and discontent are independent: all eight combinations survive', () => {
  const {context: c, actor, attitudes, writes} = setup();
  const key = c.kmNpcAttitudeKey('Actor.NPC1');
  assert.deepEqual(plain(c.kmNpcAttitudeState(actor, 'Actor.NPC1')), neutral());
  for (const positive of [false, true]) for (const discontent of [0, 1, 2, 3]) {
    attitudes[key] = {positive, discontent};
    assert.deepEqual(plain(c.kmNpcAttitudeState(actor, 'Actor.NPC1')), {positive, discontent});
  }
  assert.equal(writes.length, 0);
});
test('missing and malformed annotations are unmarked, never inferred from NPC type', () => {
  const {context: c, actor, leaders, attitudes} = setup();
  leaders.ruler.type = 'highlyMotivatedNpc';
  assert.deepEqual(plain(c.kmNpcAttitudeState(actor, 'Actor.NPC1')), neutral());
  const key = c.kmNpcAttitudeKey('Actor.NPC1');
  for (const record of [null, undefined, 1, 'positive', {positive: 'true', discontent: -1}, {positive: false, discontent: 4}]) {
    attitudes[key] = record;
    assert.deepEqual(plain(c.kmNpcAttitudeState(actor, 'Actor.NPC1')), neutral());
  }
  attitudes[key] = {positive: true, discontent: '3'};
  assert.deepEqual(plain(c.kmNpcAttitudeState(actor, 'Actor.NPC1')), {positive: true, discontent: 0});
});
test('only occupied NPC-typed offices qualify, including NPC character sheets', () => {
  const {context: c, actor, leaders} = setup();
  for (const type of ['regularNpc', 'highlyMotivatedNpc', 'nonPathfinderNpc']) {
    leaders.ruler.type = type;
    assert.equal(c.kmNpcAttitudeLeader(actor, 'ruler'), leaders.ruler);
  }
  for (const type of ['pc', 'unknown']) {
    leaders.ruler.type = type;
    assert.equal(c.kmNpcAttitudeLeader(actor, 'ruler'), null);
  }
  leaders.ruler.type = 'regularNpc';
  leaders.ruler.uuid = null;
  assert.equal(c.kmNpcAttitudeLeader(actor, 'ruler'), null);
  assert.equal(c.kmNpcAttitudeLeader(actor, '__proto__'), null);
});
test('dimension-only writes preserve another GM edit and leave kingdom rules untouched', async () => {
  const {context: c, actor, leaders, attitudes, writes} = setup();
  const beforeLeaders = structuredClone(leaders);
  const key = c.kmNpcAttitudeKey('Actor.NPC1');
  const otherKey = c.kmNpcAttitudeKey('Actor.NPC2');
  attitudes[otherKey] = {positive: true, discontent: 3};
  // Two dialogs opened on the same neutral state.
  const previousA = c.kmNpcAttitudeState(actor, 'Actor.NPC1');
  const previousB = c.kmNpcAttitudeState(actor, 'Actor.NPC1');
  assert.equal(await c.kmSaveNpcAttitude(actor, 'ruler', 'Actor.NPC1', {positive: true, discontent: 0}, previousA), true);
  assert.equal(await c.kmSaveNpcAttitude(actor, 'ruler', 'Actor.NPC1', {positive: false, discontent: 2}, previousB), true);
  assert.deepEqual(attitudes[key], {positive: true, discontent: 2});
  assert.deepEqual(Object.keys(writes[0]), ['flags.' + namespace + '.npcAttitudes.' + key + '.positive']);
  assert.deepEqual(Object.keys(writes[1]), ['flags.' + namespace + '.npcAttitudes.' + key + '.discontent']);
  assert.deepEqual(attitudes[otherKey], {positive: true, discontent: 3});
  assert.deepEqual(leaders, beforeLeaders);
});
test('clearing one dimension does not clear the other; unchanged dialogs perform no write', async () => {
  const {context: c, actor, writes} = setup();
  const save = state => c.kmSaveNpcAttitude(actor, 'ruler', 'Actor.NPC1', state, c.kmNpcAttitudeState(actor, 'Actor.NPC1'));
  await save({positive: true, discontent: 3});
  await save({positive: false, discontent: 3});
  assert.deepEqual(plain(c.kmNpcAttitudeState(actor, 'Actor.NPC1')), {positive: false, discontent: 3});
  await save({positive: true, discontent: 3});
  await save({positive: true, discontent: 0});
  assert.deepEqual(plain(c.kmNpcAttitudeState(actor, 'Actor.NPC1')), {positive: true, discontent: 0});
  const count = writes.length;
  await save({positive: true, discontent: 0});
  assert.equal(writes.length, count);
});
test('annotation follows its NPC between offices but never transfers to a new appointee', async () => {
  const {context: c, actor, leaders} = setup();
  await c.kmSaveNpcAttitude(actor, 'ruler', 'Actor.NPC1', {positive: true, discontent: 2}, neutral());
  leaders.general.uuid = 'Actor.NPC1';
  leaders.ruler.uuid = 'Actor.NPC3';
  assert.deepEqual(plain(c.kmNpcAttitudeState(actor, leaders.general.uuid)), {positive: true, discontent: 2});
  assert.deepEqual(plain(c.kmNpcAttitudeState(actor, leaders.ruler.uuid)), neutral());
});
test('players and GMs lacking update permission cannot write', async () => {
  const {context: c, actor, writes, deny} = setup();
  c.game.user.isGM = false;
  assert.equal(await c.kmSaveNpcAttitude(actor, 'ruler', 'Actor.NPC1', {positive: true, discontent: 1}, neutral()), false);
  c.game.user.isGM = true;
  deny();
  assert.equal(await c.kmSaveNpcAttitude(actor, 'ruler', 'Actor.NPC1', {positive: true, discontent: 1}, neutral()), false);
  assert.equal(writes.length, 0);
});
test('stale reassignment/type and invalid values are rejected', async () => {
  const {context: c, actor, leaders, writes} = setup();
  for (const state of [1, null, {}, {positive: 'true', discontent: 0}, {positive: true, discontent: -1}, {positive: false, discontent: 4}]) {
    assert.equal(await c.kmSaveNpcAttitude(actor, 'ruler', 'Actor.NPC1', state, neutral()), false);
  }
  assert.equal(await c.kmSaveNpcAttitude(actor, 'ruler', 'Actor.Wrong', {positive: true, discontent: 1}, neutral()), false);
  leaders.ruler.type = 'pc';
  assert.equal(await c.kmSaveNpcAttitude(actor, 'ruler', 'Actor.NPC1', {positive: true, discontent: 1}, neutral()), false);
  assert.equal(writes.length, 0);
});
test('UUID key is deterministic, path-safe and collision-free for delimiter variations', () => {
  const {context: c} = setup();
  const keys = ['Actor.NPC1', 'Actor_NPC1', 'Scene.A.Token.B.Actor.C', '__proto__', '汉字'].map(c.kmNpcAttitudeKey);
  assert.equal(new Set(keys).size, keys.length);
  for (const key of keys) assert.match(key, /^u[0-9a-f]+$/);
  assert.equal(c.kmNpcAttitudeKey(''), null);
  assert.equal(c.kmNpcAttitudeKey(null), null);
});
test('dialog uses an independent checkbox and emotion selector; cancel never writes', async () => {
  const {context: c, actor, writes} = setup();
  let config;
  c.foundry.applications.api.DialogV2.wait = async options => {config = options; return null;};
  const control = {disabled: false};
  await c.kmEditNpcAttitude({isConnected: false}, actor, 'ruler', 'Actor.NPC1', control);
  const checkbox = config.content.children[0].children[0];
  const selector = config.content.children[1].children[1];
  assert.equal(checkbox.type, 'checkbox');
  assert.equal(checkbox.checked, false);
  assert.equal(selector.tagName, 'select');
  assert.deepEqual(Array.from(selector.children, option => option.value), ['0', '1', '2', '3']);
  checkbox.checked = true;
  selector.value = '2';
  assert.deepEqual(plain(config.buttons[0].callback()), {positive: true, discontent: 2});
  assert.equal(writes.length, 0);
  assert.equal(control.disabled, false);
  assert.equal(c.kmNpcAttitudeEdits.get(actor).size, 0);
});
test('an open dialog cannot save into a reassigned office', async () => {
  const {context: c, actor, leaders, writes, warnings} = setup();
  c.foundry.applications.api.DialogV2.wait = async () => {leaders.ruler.uuid = 'Actor.New'; return {positive: true, discontent: 3};};
  await c.kmEditNpcAttitude({isConnected: false}, actor, 'ruler', 'Actor.NPC1', {disabled: false});
  assert.equal(writes.length, 0);
  assert.equal(warnings.length, 1);
});
test('rerendered controls do not open duplicate dialogs for the same NPC', async () => {
  const {context: c, actor} = setup();
  let resolve, dialogs = 0;
  c.foundry.applications.api.DialogV2.wait = () => {dialogs++; return new Promise(r => {resolve = r;});};
  const first = c.kmEditNpcAttitude({isConnected: false}, actor, 'ruler', 'Actor.NPC1', {disabled: false});
  await c.kmEditNpcAttitude({isConnected: false}, actor, 'ruler', 'Actor.NPC1', {disabled: false});
  assert.equal(dialogs, 1);
  resolve(null);
  await first;
});
test('localized strings are complete in both manifest-declared languages', () => {
  const manifest = JSON.parse(readFileSync(new URL('../module.json', import.meta.url), 'utf8'));
  const keys = ['title', 'positive', 'emotion', 'discontent0', 'discontent1', 'discontent2', 'discontent3', 'none', 'save', 'cancel', 'hint', 'editHint', 'readHint', 'stale', 'error'];
  for (const lang of ['cn', 'en']) {
    const path = 'dist/lang/npc-attitude-' + lang + '.json';
    assert.ok(manifest.languages.some(l => l.lang === lang && l.path === path));
    const text = JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'))[namespace].npcAttitude;
    assert.deepEqual(Object.keys(text).sort(), keys.toSorted());
  }
});
