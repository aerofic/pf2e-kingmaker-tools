import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const moduleRoot = new URL("../", import.meta.url);
const activities = JSON.parse(readFileSync(new URL("dist/kingdom-activities.json", moduleRoot), "utf8"));
const en = JSON.parse(readFileSync(new URL("dist/lang/en.json", moduleRoot), "utf8"))["pf2e-kingmaker-tools"];
const cn = JSON.parse(readFileSync(new URL("dist/lang/cn.json", moduleRoot), "utf8"))["pf2e-kingmaker-tools"];
const mainJs = readFileSync(new URL("dist/main.js", moduleRoot), "utf8");

const cooldowns = [
  ["false-victory", "failure", 2],
  ["false-victory", "criticalFailure", 7],
  ["preventative-measures", "criticalFailure", 2],
  ["process-hidden-fees", "failure", 2],
  ["process-hidden-fees", "criticalFailure", 2],
  ["garrison-army", "criticalFailure", 5],
  ["supplementary-hunting", "failure", 2],
  ["supplementary-hunting", "criticalFailure", 2],
  ...["corruption", "crime", "decay", "strife"].flatMap((ruin) => [
    [`repair-reputation-${ruin}`, "failure", 2],
    [`repair-reputation-${ruin}`, "criticalFailure", 4],
  ]),
];

function localize(root, key) {
  return key.split(".").reduce((parent, part) => parent?.[part], root);
}

test("safe kingdom cooldowns use zero-value round-limited activity reminders", () => {
  for (const [activityId, degree, turns] of cooldowns) {
    const activity = activities.find((entry) => entry.id === activityId);
    const modifier = activity?.[degree]?.modifiers?.find((entry) => entry.value === 0 && entry.turns === turns);

    assert.ok(modifier, `missing cooldown ${activityId}.${degree}`);
    assert.equal(modifier.enabled, true);
    assert.equal(modifier.type, "untyped");
    assert.deepEqual(modifier.applyIf, [{ eq: ["@activity", activityId] }]);
    assert.ok(localize(en, modifier.name), `missing English ${modifier.name}`);
    assert.ok(localize(cn, modifier.name), `missing Chinese ${modifier.name}`);
    assert.ok(localize(en, modifier.buttonLabel), `missing English ${modifier.buttonLabel}`);
    assert.ok(localize(cn, modifier.buttonLabel), `missing Chinese ${modifier.buttonLabel}`);
    assert.match(mainJs, new RegExp(modifier.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("target-specific and stateful rules remain manual", () => {
  const clandestine = activities.find((entry) => entry.id === "clandestine-business");
  const hireAdventurers = activities.find((entry) => entry.id === "hire-adventurers");

  assert.equal(clandestine.modifiers, undefined, "Clandestine Business needs a stateful DC ledger");
  assert.equal(hireAdventurers.failure.modifiers, undefined, "same-event retry cost remains manual");
  assert.equal(hireAdventurers.criticalFailure.modifiers, undefined, "same-event permanent lockout remains manual");
});

test("garrison reminder explicitly remains scoped by human judgment", () => {
  assert.match(cn.activities["garrison-army"].automationNotes, /同一军队/);
  assert.match(cn.activities["garrison-army"].automationNotes, /同一地块/);
  assert.match(en.activities["garrison-army"].automationNotes, /same army/i);
  assert.match(en.activities["garrison-army"].automationNotes, /same location/i);
});

test("turn counters keep current-turn-inclusive N plus one semantics", () => {
  assert.match(mainJs, /case 1:\r?\n\s+tmp = null;/);
  assert.match(mainJs, /var turns_0 = turns - 1 \| 0;/);
});
