import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const moduleRoot = new URL("../", import.meta.url);
const en = JSON.parse(readFileSync(new URL("dist/lang/en.json", moduleRoot), "utf8"))["pf2e-kingmaker-tools"];
const cn = JSON.parse(readFileSync(new URL("dist/lang/cn.json", moduleRoot), "utf8"))["pf2e-kingmaker-tools"];
const main = readFileSync(new URL("dist/main.js", moduleRoot), "utf8");
const turnPage = readFileSync(new URL("dist/applications/kingdom/sections/turn/page.hbs", moduleRoot), "utf8");

test("Blessed Solution has kingdom form UI and persistent resource automation", () => {
  assert.match(turnPage, /blessedSolutionsInput/);
  assert.match(main, /blessedSolutions: 0/);
  assert.match(main, /\$this\$buildSchema\.e40\('blessedSolutions'\)/);
  assert.match(main, /Resource_BLESSED_SOLUTION_getInstance/);
  assert.match(main, /case 19:/);
  assert.match(main, /getPropertyCallableRef3hckxc0xueiaj\)\('blessedSolutions'/);
});

test("Blessed Solution chat tags and resource button labels exist in English and Chinese", () => {
  for (const locale of [en, cn]) {
    const blessed = locale.activities["blessed-solution"];
    assert.match(blessed.criticalSuccess.msg, /@gain1BlessedSolution/);
    assert.match(blessed.success.msg, /@gain1BlessedSolution/);
    assert.equal(typeof locale.resourceButton.resource.blessedSolution, "string");
    assert.equal(typeof locale.resourceButton.resourceDice.blessedSolution, "string");
    assert.equal(typeof locale.resourceButton.resourceExpression.blessedSolution, "string");
    assert.equal(typeof locale.kingdom.reducingBlessedSolutions, "string");
  }
});

test("Chinese Blessed Solution terminology uses prayer-style solution", () => {
  const blessed = cn.activities["blessed-solution"];
  const serialized = JSON.stringify(blessed);

  assert.equal(blessed.title, "祷告式解决方案");
  assert.match(cn.kingdom.creativeOrSupernaturalSolution, /祷告式/);
  assert.equal(serialized.includes("祝福方案"), false);
});

test("Consumed Blessed Solution modifiers reduce the stored counter", () => {
  assert.match(main, /consumedBlessedSolutions/);
  assert.match(main, /activities\.blessed-solution\.criticalSuccess\.modifiers\.blessedAttempt\.name/);
  assert.match(main, /activities\.blessed-solution\.success\.modifiers\.blessedAttempt\.name/);
  assert.match(main, /kingdom\.reducingBlessedSolutions/);
  assert.match(main, /blessedSolutions = Math\.max\(0, currentBlessedSolutions - consumedBlessedSolutions \| 0\)/);
});

test("Solution XP button settles all unused solution resources", () => {
  const solutionXpHandler = main.match(
    /class KingdomSheet\$_onClickAction\$slambda_25[\s\S]*?class KingdomSheet\$_onClickAction\$slambda_26/
  )?.[0] ?? "";

  assert.notEqual(solutionXpHandler, "");
  assert.match(turnPage, /data-action="solution-xp"/);
  assert.match(solutionXpHandler, /tmp0_safe_receiver\.supernaturalSolutions \+ tmp0_safe_receiver\.creativeSolutions/);
  assert.match(solutionXpHandler, /tmp0_safe_receiver\.blessedSolutions == null \? 0 : tmp0_safe_receiver\.blessedSolutions/);
  assert.match(solutionXpHandler, /calculateXpChange\(tmp0_safe_receiver, xp\)/);
  assert.match(solutionXpHandler, /yield\* change\.f5q\(\$completion\)/);
  assert.match(solutionXpHandler, /tmp0_safe_receiver\.supernaturalSolutions = 0/);
  assert.match(solutionXpHandler, /tmp0_safe_receiver\.creativeSolutions = 0/);
  assert.match(solutionXpHandler, /tmp0_safe_receiver\.blessedSolutions = 0/);
  assert.match(solutionXpHandler, /yield\* setKingdom\(this\.j5t_1\.r5q_1, tmp0_safe_receiver, \$completion\)/);
  assert.doesNotMatch(solutionXpHandler, /yield\* gainXp\(this\.j5t_1\.r5q_1, xp/);
});
