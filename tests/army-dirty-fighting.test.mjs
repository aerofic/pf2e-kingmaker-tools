import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../dist/main.js', import.meta.url), 'utf8');
const functions = source.slice(source.indexOf('function isDirtyFightingArmyAction('), source.indexOf("var coveringFireArmyActionId"));
function apply(item) {
  const context = vm.createContext({item, getArmyTacticSlug: i => i.system.slug,
    getProperty: (o, path) => path.split('.').reduce((v, k) => v?.[k], o)});
  vm.runInContext(functions + '\napplyDirtyFightingArmyActionOverride(item);', context);
}
function fixture(description, slug = 'dirty-fighting') {
  return {system: {campaign: 'kingmaker', category: 'army-war-action', slug, description: {value: description}},
    updateSource(change) { this.system.description.value = change['system.description.value']; }};
}
for (const [critical, success, failure] of [['大成功', '成功', '大失败'], ['Critical Success', 'Success', 'Critical Failure']]) {
  test(`Dirty Fighting ${success}: total damage, preserves original effects, idempotent`, () => {
    const text = `<p>Requirement and Strike instructions</p><p><strong>${critical}</strong> @UUID[test]{Weary 2} until next turn.</p><p><strong>${success}</strong> Weary 1 until next turn.</p><p><strong>${failure}</strong> Reduce weary 1.</p>`;
    const item = fixture(text);
    apply(item);
    const first = item.system.description.value;
    assert.match(first, /@Damage\[2\]/);
    assert.match(first, /@Damage\[1\]/);
    assert.equal((first.match(/@Damage\[/g) || []).length, 2);
    assert.ok(first.includes('@UUID[test]{Weary 2} until next turn.'));
    assert.ok(first.includes('Weary 1 until next turn.'));
    assert.ok(first.includes(`<p><strong>${failure}</strong> Reduce weary 1.</p>`));
    apply(item);
    assert.equal(item.system.description.value, first);
  });
}
test('does not change other actions or missing descriptions', () => {
  for (const item of [fixture('<p><strong>Success</strong> Test</p>', 'feint'), fixture(null)]) {
    const original = item.system.description.value;
    apply(item);
    assert.equal(item.system.description.value, original);
  }
});
test('covers compendium, existing army/world items, creation and sheet rendering', () => {
  assert.match(source, /pack\.getDocument\(dirtyFightingArmyActionId\)\.then\(applyDirtyFightingArmyActionOverride\)/);
  for (const start of ['function applyArmyTacticOverridesToActors', "Hooks.on('preCreateItem'", 'Array.from(game.items || [])']) {
    const region = source.slice(source.indexOf('function applyArmyTacticOverridesToActors'));
    const offset = region.indexOf(start);
    assert.ok(offset >= 0, start);
    assert.ok(region.slice(offset, offset + 850).includes('applyDirtyFightingArmyActionOverride(item)'), start);
  }
  assert.match(source, /else if \(isDirtyFighting\) \{\s*applyDirtyFightingArmyActionOverride\(item\)/);
});
