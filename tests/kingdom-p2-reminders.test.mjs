import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const moduleRoot = new URL("../", import.meta.url);
const activities = JSON.parse(readFileSync(new URL("dist/kingdom-activities.json", moduleRoot), "utf8"));
const en = JSON.parse(readFileSync(new URL("dist/lang/en.json", moduleRoot), "utf8"))["pf2e-kingmaker-tools"];
const cn = JSON.parse(readFileSync(new URL("dist/lang/cn.json", moduleRoot), "utf8"))["pf2e-kingmaker-tools"];

const reminders = [
  {
    activityId: "collect-taxes",
    degrees: ["criticalSuccess", "success", "failure", "criticalFailure"],
    name: "activities.collect-taxes.modifiers.attemptedThisTurn.name",
    buttonLabel: "activities.collect-taxes.modifiers.attemptedThisTurn.buttonLabel",
    turns: 2,
  },
  {
    activityId: "trade-commodities",
    degrees: ["criticalSuccess", "success", "failure", "criticalFailure"],
    name: "activities.trade-commodities.modifiers.tradedThisTurn.name",
    buttonLabel: "activities.trade-commodities.modifiers.tradedThisTurn.buttonLabel",
    turns: 2,
  },
  {
    activityId: "capital-investment",
    degrees: ["criticalSuccess", "success", "failure", "criticalFailure"],
    name: "activities.capital-investment.modifiers.investedThisTurn.name",
    buttonLabel: "activities.capital-investment.modifiers.investedThisTurn.buttonLabel",
    turns: 1,
    applyIf: [{ eq: ["@activity", "capital-investment"] }],
  },
  {
    activityId: "manage-trade-agreements",
    degrees: ["criticalFailure"],
    name: "activities.manage-trade-agreements.criticalFailure.modifiers.lockout.name",
    buttonLabel: "activities.manage-trade-agreements.criticalFailure.modifiers.lockout.buttonLabel",
    turns: 2,
  },
  {
    activityId: "request-foreign-aid-vk",
    degrees: ["criticalSuccess", "success", "failure", "criticalFailure"],
    name: "activities.request-foreign-aid-vk.modifiers.sameGroupDcMemory.name",
    buttonLabel: "activities.request-foreign-aid-vk.modifiers.sameGroupDcMemory.buttonLabel",
    turns: 2,
  },
  {
    activityId: "send-diplomatic-envoy",
    degrees: ["criticalFailure"],
    name: "activities.send-diplomatic-envoy.criticalFailure.modifiers.lockout.name",
    buttonLabel: "activities.send-diplomatic-envoy.criticalFailure.modifiers.lockout.buttonLabel",
    turns: 4,
  },
  {
    activityId: "relocate-capital",
    degrees: ["criticalSuccess", "success", "failure", "criticalFailure"],
    name: "activities.relocate-capital.modifiers.cooldown.name",
    buttonLabel: "activities.relocate-capital.modifiers.cooldown.buttonLabel",
    turns: 4,
  },
  {
    activityId: "blessed-solution",
    degrees: ["criticalFailure"],
    name: "activities.blessed-solution.criticalFailure.modifiers.lockout.name",
    buttonLabel: "activities.blessed-solution.criticalFailure.modifiers.lockout.buttonLabel",
    turns: 3,
    applyIf: [{ eq: ["@activity", "blessed-solution"] }],
  },
  {
    activityId: "supernatural-solution",
    degrees: ["criticalFailure"],
    name: "activities.supernatural-solution.criticalFailure.modifiers.lockout.name",
    buttonLabel: "activities.supernatural-solution.criticalFailure.modifiers.lockout.buttonLabel",
    turns: 3,
    applyIf: [{ eq: ["@activity", "supernatural-solution"] }],
  },
];

function getLocalization(root, key) {
  return key.split(".").reduce((parent, part) => parent?.[part], root);
}

function getBundledActivitiesFromMain() {
  const mainJs = readFileSync(new URL("dist/main.js", moduleRoot), "utf8");
  const moduleIndex = mainJs.indexOf("./kotlin/kingdom-activities.json");
  const prefix = "module.exports = /*#__PURE__*/JSON.parse(";
  const statementStart = mainJs.indexOf(prefix, moduleIndex) + prefix.length;
  const statementEnd = mainJs.indexOf(");", statementStart);
  return JSON.parse(JSON.parse(mainJs.slice(statementStart, statementEnd)));
}

test("P2 kingdom reminder modifiers are round-limited and localized", () => {
  for (const reminder of reminders) {
    const activity = activities.find((entry) => entry.id === reminder.activityId);
    assert.ok(activity, `missing activity ${reminder.activityId}`);

    for (const degree of reminder.degrees) {
      const modifier = activity[degree]?.modifiers?.find((entry) => entry.name === reminder.name);
      assert.ok(modifier, `missing ${reminder.name} on ${reminder.activityId}.${degree}`);
      assert.equal(modifier.buttonLabel, reminder.buttonLabel);
      assert.equal(modifier.value, 0);
      assert.equal(modifier.type, "untyped");
      assert.equal(modifier.enabled, true);
      assert.equal(modifier.turns, reminder.turns);
      if (reminder.applyIf) assert.deepEqual(modifier.applyIf, reminder.applyIf);
    }

    assert.ok(getLocalization(en, reminder.name), `missing English ${reminder.name}`);
    assert.ok(getLocalization(en, reminder.buttonLabel), `missing English ${reminder.buttonLabel}`);
    assert.ok(getLocalization(cn, reminder.name), `missing Chinese ${reminder.name}`);
    assert.ok(getLocalization(cn, reminder.buttonLabel), `missing Chinese ${reminder.buttonLabel}`);
    assert.notEqual(getLocalization(cn, reminder.buttonLabel), getLocalization(en, reminder.buttonLabel));
  }
});

test("bundled main.js kingdom activity data matches external activity JSON", () => {
  assert.deepEqual(getBundledActivitiesFromMain(), activities);
});

test("Capital Investment activity list has one base use or bank settlement uses, whichever is higher", () => {
  const mainJs = readFileSync(new URL("dist/main.js", moduleRoot), "utf8");
  assert.match(mainJs, /function countCapitalInvestmentBankSettlements/);
  assert.match(mainJs, /function capitalInvestmentAttemptsThisTurn/);
  assert.match(mainJs, /Math\.max\(1, capitalInvestmentBankSettlements\)/);
  assert.match(mainJs, /capitalInvestmentAttemptsThisTurn\(kingdom\) >= capitalInvestmentAllowedAttempts/);
  assert.match(mainJs, /structure\.h3f_1 === true/);
  assert.match(mainJs, /tmp_0 = data\.s3o_1\.equals\(SettlementType_CAPITAL_getInstance\(\)\);/);
  assert.doesNotMatch(mainJs, /data\.s3o_1\.equals\(SettlementType_CAPITAL_getInstance\(\)\) && allowCapitalInvestmentInCapitalWithoutBank/);
});
