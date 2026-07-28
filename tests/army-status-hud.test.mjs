import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mainJs = readFileSync(new URL("../dist/main.js", import.meta.url), "utf8");

test("army status HUD treats all counter conditions as valued", () => {
  const match = mainJs.match(/kmArmyStatusHudValuedSlugs = new Set\(\[([^\]]+)]\)/);
  assert.ok(match, "missing army status HUD valued-slug configuration");

  const slugs = [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
  assert.deepEqual(slugs.sort(), ["merit", "mired", "shaken", "weary"]);
});

test("army status HUD builds Merit from Shaken without inheriting its rules", () => {
  assert.match(mainJs, /function kmCreateArmyMeritStatusSource\(conditions\)/);
  assert.match(mainJs, /kmArmyStatusHudSlug\(item\) === 'shaken'/);
  assert.match(mainJs, /data\.system\.slug = 'merit'/);
  assert.match(mainJs, /data\.system\.rules = \[\]/);
  assert.match(mainJs, /data\.system\.badge\.value = 1/);
  assert.match(mainJs, /armyMeritCondition: true/);
  assert.match(mainJs, /medal-ribbon-star-gold-red\.webp/);
});

test("local Merit effects do not retain a fake compendium source", () => {
  assert.match(mainJs, /if \(sourceItem\.kmLocalArmyCondition\) \{\s*delete data\._stats;/);
});

test("Merit description includes the veteran, elite, and ace milestones", () => {
  assert.match(mainJs, /功勋累计5：[\s\S]*老兵/);
  assert.match(mainJs, /功勋累计15：[\s\S]*精锐/);
  assert.match(mainJs, /功勋累计30：[\s\S]*王牌/);
  assert.doesNotMatch(mainJs, /RT-[12]|选择一种王牌战术/);
});

test("Distant uses the revised mutual ranged Strike penalty description", () => {
  assert.match(mainJs, /kmDistantArmyConditionId = '8upne4E6Q7Da5T5w'/);
  assert.match(mainJs, /拥有远距状态的军队已经和敌人拉开相当远的距离，可能正在逃离战场。远距军队可以和敌军相互尝试远程打击，但该次打击承受 -5 减值。/);
  assert.match(mainJs, /Distant armies can attempt ranged Strikes against each other, but the Strike takes a -5 penalty/);
  assert.match(mainJs, /pack\.getDocument\(kmDistantArmyConditionId\)\.then\(kmApplyArmyConditionDescriptionOverrides\)/);
  assert.match(mainJs, /kmArmyStatusHudActorEffects\(actor\)\.forEach\(kmApplyArmyConditionDescriptionOverrides\)/);
  assert.match(mainJs, /Hooks\.on\('preCreateItem',[\s\S]*?kmApplyArmyConditionDescriptionOverrides\(item\)/);
});

test("Routed describes mandatory retreat, distant rally, and post-war shaken", () => {
  assert.match(mainJs, /kmRoutedArmyConditionId = 'aZImSBBmTHff2POP'/);
  assert.match(mainJs, /溃败军队在自己的回合中必须执行撤退战争动作/);
  assert.match(mainJs, /处于远离状态的溃败军队可以在回合开始时以自由动作执行一次重整/);
  assert.match(mainJs, /军队士气检定承受 -2 环境减值/);
  assert.match(mainJs, /增加 1 点动摇状态值/);
  assert.match(mainJs, /若一方所有军队同时处于溃败状态，战斗结束，另一方获胜/);
  assert.match(mainJs, /pack\.getDocument\(kmRoutedArmyConditionId\)\.then\(kmApplyArmyConditionDescriptionOverrides\)/);
  assert.match(mainJs, /kmApplyRoutedArmyConditionOverride\(item\)/);
});

test("Fortified keeps its defensive benefits when using healing potions or Defend", () => {
  assert.match(mainJs, /kmFortifiedArmyConditionId = 'c8lNjzrY2WM60Zsv'/);
  assert.match(mainJs, /除使用治疗药水和防卫以外，驻防军队执行机动战争动作时会立即失去驻防状态/);
  assert.match(mainJs, /Except for Use Healing Potion and Defend, a fortified army that uses a maneuver war action immediately loses its fortified condition/);
  assert.match(mainJs, /pack\.getDocument\(kmFortifiedArmyConditionId\)\.then\(kmApplyArmyConditionDescriptionOverrides\)/);
  assert.match(mainJs, /kmApplyFortifiedArmyConditionOverride\(item\)/);
});
