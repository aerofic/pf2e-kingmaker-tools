import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mainJs = readFileSync(new URL("../dist/main.js", import.meta.url), "utf8");

test("Merciless and All-Out Assault are cavalry-exclusive", () => {
  assert.match(mainJs, /mercilessArmyTacticId = 'QRwIcmCEHpDQm9DO'/);
  assert.match(mainJs, /allOutAssaultArmyActionId = 'Z6jMZgAxI1zRO7Sl'/);
  assert.match(mainJs, /getArmyTacticSlug\(item\) === 'merciless'/);
  assert.match(mainJs, /getArmyTacticSlug\(item\) === 'all-out-assault'/);
  assert.match(mainJs, /applyMercilessArmyTacticOverride[\s\S]*?'system\.traits\.value': \['cavalry'\]/);
  assert.match(mainJs, /armyTacticSupportsArmyType[\s\S]*?isMercilessArmyTactic\(tactic\)[\s\S]*?armyType === 'cavalry'/);
  assert.match(mainJs, /applyAllOutAssaultArmyActionOverride[\s\S]*?\{'system\.traits\.value': \['attack', 'cavalry'\]\}/);
});

test("army tactic training revalidates the selected army type", () => {
  assert.match(mainJs, /ArmyTacticsBrowser\$_preparePartContext\$slambda\$lambda[\s\S]*?armyTacticSupportsArmyType\(it, this\$0\.h55_1\.system\.traits\.type\)/);
  assert.match(mainJs, /function \*trainTactic[\s\S]*?applyMercilessArmyTacticOverride\(item\)[\s\S]*?!armyTacticSupportsArmyType\(item, \$this\.h55_1\.system\.traits\.type\)[\s\S]*?ui\.notifications\.error/);
  assert.match(mainJs, /“毫无怜悯”仅限骑兵军队学习/);
});

test("All-Out Assault failure deals one damage and outflanks the acting army", () => {
  assert.match(mainJs, /仍然对敌军造成 @Damage\[1\|domains:melee-damage,strike-damage\] 点伤害/);
  assert.match(mainJs, /Compendium\.pf2e\.kingmaker-features\.Item\.ibcMcEGRbPRtk9Pu/);
  assert.match(mainJs, /军队陷入[\s\S]*?被包抄[\s\S]*?直到下个回合开始/);
  assert.match(mainJs, /Your army still deals @Damage\[1\|domains:melee-damage,strike-damage\] point of damage/);
});

test("Merciless and All-Out Assault overrides cover every runtime entry path", () => {
  assert.match(mainJs, /return applyMercilessArmyTacticOverride\(tactic\)/);
  assert.match(mainJs, /pack\.getDocument\(mercilessArmyTacticId\)\.then\(applyMercilessArmyTacticOverride\)/);
  assert.match(mainJs, /pack\.getDocument\(allOutAssaultArmyActionId\)\.then\(applyAllOutAssaultArmyActionOverride\)/);
  assert.match(mainJs, /Hooks\.on\('preCreateItem',[\s\S]*?applyMercilessArmyTacticOverride\(item\)[\s\S]*?applyAllOutAssaultArmyActionOverride\(item\)/);
  assert.match(mainJs, /applyArmyTacticOverridesToActors\(game\.actors\)/);
  assert.match(mainJs, /Hooks\.on\('renderItemSheet', renderArmyTacticDescriptionOverrides\)/);
});
