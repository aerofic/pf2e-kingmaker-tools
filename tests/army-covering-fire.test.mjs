import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mainJs = readFileSync(new URL("../dist/main.js", import.meta.url), "utf8");

test("Covering Fire failure deals no damage and suppresses maneuver reactions", () => {
  assert.match(mainJs, /coveringFireArmyActionId = 'GIbm9qo8VuFgPywJ'/);
  assert.match(mainJs, /getArmyTacticSlug\(item\) === 'covering-fire'/);
  assert.match(mainJs, /未对目标敌军造成伤害，但敌军无法使用由任意军队的机动战争动作触发的反应动作，直到你的下个回合开始。/);
  assert.match(mainJs, /You deal no damage to the target enemy army, but it cannot take reactions triggered by maneuver war actions from any army until the start of your next turn/);
  assert.match(mainJs, /pack\.getDocument\(coveringFireArmyActionId\)\.then\(applyCoveringFireArmyActionOverride\)/);
  assert.match(mainJs, /Hooks\.on\('preCreateItem',[\s\S]*?applyCoveringFireArmyActionOverride\(item\)/);
  assert.match(mainJs, /applyArmyTacticOverridesToActors\(game\.actors\)/);
  assert.match(mainJs, /Hooks\.on\('renderItemSheet', renderArmyTacticDescriptionOverrides\)/);
});

test("Covering Fire override replaces only the localized failure paragraph", () => {
  assert.match(mainJs, /var failurePattern = \/<p\(\?:\\s\[\^>\]\*\)\?>/);
  assert.match(mainJs, /\(\?:Failure\|失败\)/);
  assert.match(mainJs, /currentDescription\.replace\(failurePattern, coveringFireArmyActionFailureText\(\)\)/);
});
