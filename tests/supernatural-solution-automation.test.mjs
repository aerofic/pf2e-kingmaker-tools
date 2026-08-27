import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const moduleRoot = new URL("../", import.meta.url);
const main = readFileSync(new URL("dist/main.js", moduleRoot), "utf8");
const activities = JSON.parse(readFileSync(new URL("dist/kingdom-activities.json", moduleRoot), "utf8"));
const en = JSON.parse(readFileSync(new URL("dist/lang/en.json", moduleRoot), "utf8"))["pf2e-kingmaker-tools"];
const cn = JSON.parse(readFileSync(new URL("dist/lang/cn.json", moduleRoot), "utf8"))["pf2e-kingmaker-tools"];

function sourceBetween(startMarker, endMarker) {
  const start = main.indexOf(startMarker);
  const end = main.indexOf(endMarker, start);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return main.slice(start, end);
}

test("Supernatural Solution is spent before both checks and automatically keeps the higher degree", () => {
  const roll = sourceBetween("function *roll($this, modifier, creativeSolutionModifier", "function createCheckContext($this");
  const spend = roll.indexOf("yield* KingdomCheckDialog$roll$slambda_0($this)");
  const originalCheck = roll.indexOf("var primaryOutcome = yield* rollCheck_1(");
  const magicCheck = roll.indexOf("yield* rollAutomaticSupernaturalMagicCheck(");
  const finalOutcome = roll.indexOf("yield* postKingdomCheckOutcome(");

  assert.ok(spend >= 0, "missing Supernatural Solution spend");
  assert.ok(originalCheck > spend, "the original result must not be revealed before spending the solution");
  assert.ok(magicCheck > originalCheck, "the same-DC Magic check must roll automatically after the original check");
  assert.ok(finalOutcome > magicCheck, "the activity outcome must resolve only after both checks");
  assert.match(roll, /tmp0_supernaturalKingdom\.supernaturalSolutions > 0/);
  assert.match(roll, /automaticSupernaturalOutcome\.changed\.a4_1 > primaryOutcome\.changed\.a4_1 \? automaticSupernaturalOutcome : primaryOutcome/);
  assert.doesNotMatch(roll, /launch\(new KingdomCheckDialog\(/);
  assert.match(roll, /else if \(wantsSupernaturalSolution\)[\s\S]*fortune = false;/);
});

test("Supernatural Solution defers consequences and resolves only the selected result", () => {
  const check = sourceBetween("function *rollCheck_1(", "function *postComplexDegreeOfSuccess(");
  const rollMessage = check.indexOf("yield* result.k5f(rollMeta, true");
  const defer = check.indexOf("if (deferOutcome)");
  const outcome = check.indexOf("yield* postKingdomCheckOutcome(");

  assert.ok(rollMessage >= 0);
  assert.ok(defer > rollMessage);
  assert.ok(outcome > defer, "deferred checks must not apply activity consequences independently");
  assert.match(check, /return outcome;/);

  const magic = sourceBetween("function *rollAutomaticSupernaturalMagicCheck(", "function determineAssuranceDegree(");
  assert.match(magic, /KingdomSkill_MAGIC_getInstance\(\)/);
  assert.match(magic, /rollCheck_1\([\s\S]*true, \$completion\)/);
  assert.match(magic, /consumedModifierIds/);
});

test("Supernatural Solution is persisted before its spend message is posted", () => {
  const spendCallback = sourceBetween("class KingdomCheckDialog$roll$slambda {", "class KingdomCheckDialog$_preparePartContext$slambda {");
  const persist = spendCallback.indexOf("yield* setKingdom(");
  const message = spendCallback.indexOf("kingdom.reducingSupernaturalSolutions");

  assert.ok(persist >= 0);
  assert.ok(message > persist, "a chat failure must not leave the solution unspent");
  assert.match(spendCallback, /supernaturalSolutions = Math\.max\(0, b\)/);
});

test("Supernatural and Creative Solution cannot stack on the same check", () => {
  const creativeCondition = sourceBetween("function entries$lambda_1(game, elem) {", "function entries$lambda_2(game, elem) {");
  assert.match(creativeCondition, /creativeSolution > 0 && isKingdomRoll\(elem\) && !parseRollMeta\(elem\)\.fortune/);

  const supernatural = activities.find((activity) => activity.id === "supernatural-solution");
  assert.equal(supernatural?.fortune, true);
  assert.match(en.activities["supernatural-solution"].special, /cannot.*simultaneously/i);
  assert.match(cn.activities["supernatural-solution"].special, /不能.*同时/);
});

test("Supernatural Solution count and cooldown reminders are guarded", () => {
  assert.match(main, /supernaturalSolutions <= 0 \|\| evaluatedModifiers\.y3p_1/);

  const reminderNames = sourceBetween("var tmpP2_reminderNames = [", "];",);
  assert.match(reminderNames, /activities\.supernatural-solution\.criticalFailure\.modifiers\.lockout\.name/);

  assert.match(en.activities["supernatural-solution"].automationNotes, /rolls the original check and an additional same-DC Magic check automatically/i);
  assert.match(en.activities["supernatural-solution"].automationNotes, /resolves only the higher result/i);
  assert.match(cn.activities["supernatural-solution"].automationNotes, /先扣除/);
  assert.match(cn.activities["supernatural-solution"].automationNotes, /自动进行原检定/);
  assert.match(cn.activities["supernatural-solution"].automationNotes, /只结算较高结果/);
});
