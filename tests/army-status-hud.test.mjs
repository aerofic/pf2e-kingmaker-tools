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
