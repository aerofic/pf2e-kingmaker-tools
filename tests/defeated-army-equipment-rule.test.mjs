import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const moduleRoot = new URL("../", import.meta.url);
const en = JSON.parse(readFileSync(new URL("dist/lang/en.json", moduleRoot), "utf8"))["pf2e-kingmaker-tools"];
const cn = JSON.parse(readFileSync(new URL("dist/lang/cn.json", moduleRoot), "utf8"))["pf2e-kingmaker-tools"];

const affectedActivities = ["outfit-army", "recover-army-defeated", "disband-army"];
const englishRule = "An army with the Defeated condition cannot remove or transfer any army equipment already outfitted to it.";
const chineseRule = "处于【战败】状态的军队不能移除或转移任何已经列装的军队装备。";

test("Defeated army equipment restriction is consistent across relevant activity descriptions", () => {
  for (const activityId of affectedActivities) {
    assert.match(en.activities[activityId].description, new RegExp(englishRule.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(cn.activities[activityId].description, new RegExp(chineseRule.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
