import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mainJs = readFileSync(new URL("../dist/main.js", import.meta.url), "utf8");

test("Feint uses the corrected Chinese name and MAP wording", () => {
  assert.match(mainJs, /feintArmyActionId = 'Hi4LKGOKe6yMDOH5'/);
  assert.match(mainJs, /getArmyTacticSlug\(item\) === 'feint'/);
  assert.match(mainJs, /updates\.name = '佯攻 Feint'/);
  assert.match(mainJs, /佯攻不应用你的多重攻击减值，也不会增加你的多重攻击减值。/);
  assert.match(mainJs, /Feint does not apply your multiple attack penalty, nor does it increase your multiple attack penalty\./);
});

test("Feint description override replaces the old note, is idempotent, and covers every runtime path", () => {
  assert.match(mainJs, /previousNotePattern[\s\S]*?使用此战争动作不会增加你的多重攻击减值（MAP）/);
  assert.match(mainJs, /hasCurrentNote[\s\S]*?佯攻不应用你的多重攻击减值，也不会增加你的多重攻击减值/);
  assert.match(mainJs, /applyArmyTacticOverridesToActors[\s\S]*?applyFeintArmyActionOverride\(item\)/);
  assert.match(mainJs, /Hooks\.on\('preCreateItem',[\s\S]*?applyFeintArmyActionOverride\(item\)/);
  assert.match(mainJs, /pack\.getDocument\(feintArmyActionId\)\.then\(applyFeintArmyActionOverride\)/);
  assert.match(mainJs, /isFeint[\s\S]*?applyFeintArmyActionOverride\(item\)/);
});
