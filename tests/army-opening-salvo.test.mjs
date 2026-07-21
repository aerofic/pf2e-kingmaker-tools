import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mainJs = readFileSync(new URL("../dist/main.js", import.meta.url), "utf8");

test("Opening Salvo starts distant and ignores the first-round penalty", () => {
  assert.match(mainJs, /openingSalvoArmyTacticId = 'G6MAyRjG91I8iNLR'/);
  assert.match(mainJs, /getArmyTacticSlug\(item\) === 'opening-salvo'/);
  assert.match(mainJs, /Compendium\.pf2e\.kingmaker-features\.Item\.8upne4E6Q7Da5T5w/);
  assert.match(mainJs, /在第一轮的战斗中忽视远距的-5惩罚/);
  assert.match(mainJs, /During the first round, this army ignores the -5 penalty from being Distant/);
});

test("Opening Salvo override covers training, compendium, actors, and created items", () => {
  assert.match(mainJs, /applyOpeningSalvoArmyTacticOverride\(tactic\)/);
  assert.match(mainJs, /pack\.getDocument\(openingSalvoArmyTacticId\)\.then\(applyOpeningSalvoArmyTacticOverride\)/);
  assert.match(mainJs, /Hooks\.on\('preCreateItem',[\s\S]*?applyOpeningSalvoArmyTacticOverride\(item\)/);
  assert.match(mainJs, /applyArmyTacticOverridesToActors\(game\.actors\)/);
  assert.match(mainJs, /Hooks\.on\('renderItemSheet', renderArmyTacticDescriptionOverrides\)/);
});
