import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mainJs = readFileSync(new URL("../dist/main.js", import.meta.url), "utf8");

test("Retreat gains the maneuver trait through the module override", () => {
  assert.match(mainJs, /retreatArmyActionId = 'IhjlbJinff1wUSjL'/);
  assert.match(mainJs, /getArmyTacticSlug\(item\) === 'retreat'/);
  assert.match(mainJs, /!traits\.includes\('maneuver'\)/);
  assert.match(mainJs, /'system\.traits\.value': \[\.\.\.traits, 'maneuver'\]/);
  assert.match(mainJs, /pack\.getDocument\(retreatArmyActionId\)\.then\(applyRetreatArmyActionOverride\)/);
  assert.match(mainJs, /Hooks\.on\('preCreateItem',[\s\S]*?applyRetreatArmyActionOverride\(item\)/);
  assert.match(mainJs, /applyArmyTacticOverridesToActors\(game\.actors\)/);
});
