import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mainJs = readFileSync(new URL("../dist/main.js", import.meta.url), "utf8");

test("Efficient limits its unused benefit to Shaken or Weary", () => {
  assert.match(mainJs, /DURRMyANFnFccM24/);
  assert.match(mainJs, /将其动摇或疲劳状态值降低 1 点/);
  assert.match(mainJs, /reduces its shaken or weary condition value by 1/);
  assert.doesNotMatch(mainJs, /reduces the value of one condition of its choice by 1/);
});

test("Efficient override covers the compendium, existing armies, and newly created effects", () => {
  assert.match(mainJs, /pack\.getDocument\(kmEfficientArmyConditionId\)/);
  assert.match(mainJs, /kmApplyEfficientArmyConditionToActors\(game\.actors\)/);
  assert.match(mainJs, /Hooks\.on\('canvasReady'/);
  assert.match(mainJs, /Hooks\.on\('preCreateItem'/);
  assert.match(mainJs, /\.map\(kmApplyEfficientArmyConditionOverride\)/);
});
