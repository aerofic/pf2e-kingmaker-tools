import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { loadBundle } from './helpers/bundle-harness.mjs';

const roles = ['ruler', 'counselor', 'emissary', 'general', 'magister', 'treasurer', 'viceroy', 'warden'];
const names = ['activities.new-leadership.failure.modifiers.name', 'activities.new-leadership-vk.failure.modifiers.name'];
const modifier = name => ({ name, buttonLabel: name + '.button', type: 'circumstance', value: -1, enabled: false,
  turns: null, applyIf: [{ in: ['@phase', ['leadership', 'commerce', 'region', 'civic', 'army']] }] });

function fixture(input, selected) {
  const c = loadBundle();
  c.crypto = webcrypto;
  c.input = structuredClone(input);
  c.selected = selected;
  c.state = { modifiers: [] };
  c.writes = [];
  c.messages = [];
  c.prompts = [];
  c.audit(`
    t_0 = key => 'translated:' + key;
    t_1 = role => 'role:<&"' + String.fromCharCode(39) + '>' + role.p3();
    t = key => key;
    deserializeB64Json = () => structuredClone(input);
    validateUsingSchema = () => ({z1: () => true});
    getKingdom = () => structuredClone(state);
    setKingdom = function* (actor, value) { writes.push(structuredClone(value)); state = structuredClone(value); };
    postChatMessage = function* (...args) { messages.push(args[0]); };
    DialogV2.prompt = options => { prompts.push(options); return Promise.resolve(selected); };
  `);
  return c;
}

async function apply(c) {
  await c.audit(`buildPromise((scope, completion) => (new buttons$slambda_5()).v4x(game, {}, {}, {dataset:{data:'fixture'}}, completion))`);
}

for (const name of names) {
  test(`${name}: selected role is saved without changing rule fields or input`, async () => {
    const input = modifier(name);
    const c = fixture(input, 'general');
    await apply(c);
    assert.equal(c.prompts.length, 1);
    assert.equal(c.writes.length, 1);
    assert.equal(c.messages.length, 1);
    const saved = structuredClone(c.state.modifiers[0]);
    assert.match(saved.id, /^[0-9a-f-]{36}$/i);
    assert.equal(saved.name, `translated:${name} (role:<&"'>general)`);
    assert.equal(saved.buttonLabel, `translated:${name}.button (role:<&"'>general)`);
    assert.equal(saved.requiresTranslation, false);
    const { id, name: savedName, buttonLabel, requiresTranslation, ...rules } = saved;
    const { name: originalName, buttonLabel: originalButton, ...originalRules } = input;
    assert.deepEqual(rules, originalRules);
    assert.deepEqual(c.input, input);
    c.audit(`globalThis.display = toContext_18(JSON.parse(JSON.stringify(state.modifiers)));`);
    assert.equal(c.display[0].name, savedName);
    assert.equal(c.display[0].description, buttonLabel);
  });

  for (const selected of [null, '', 'invalid']) {
    test(`${name}: ${JSON.stringify(selected)} does not save or post`, async () => {
      const c = fixture(modifier(name), selected);
      await apply(c);
      assert.equal(c.prompts.length, 1);
      assert.equal(c.writes.length, 0);
      assert.equal(c.messages.length, 0);
      assert.equal(c.state.modifiers.length, 0);
    });
  }
}

test('unrelated modifiers are saved unmodified without a role prompt', async () => {
  const input = modifier('activities.some-other.failure.modifiers.name');
  const c = fixture(input, 'general');
  await apply(c);
  assert.equal(c.prompts.length, 0);
  assert.equal(c.writes.length, 1);
  const { id, ...saved } = structuredClone(c.state.modifiers[0]);
  assert.deepEqual(saved, input);
  assert.deepEqual(c.input, input);
});

test('role prompt offers exactly eight explicit roles and escapes text', async () => {
  const c = fixture(modifier(names[0]), 'warden');
  await apply(c);
  const options = c.prompts[0];
  assert.equal(options.rejectClose, false);
  assert.match(options.content, /<select[^>]*required>/);
  assert.match(options.content, /<option value="" selected disabled>/);
  assert.deepEqual([...options.content.matchAll(/<option value="([^"]*)"/g)].map(m => m[1]), ['', ...roles]);
  assert.equal((options.content.match(/role:&lt;&amp;&quot;&#39;&gt;/g) || []).length, 8);
  assert.equal(options.ok.callback(null, {form:{elements:{namedItem: () => ({value:'warden'})}}}), 'warden');
});
