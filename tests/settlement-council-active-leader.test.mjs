import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const moduleRoot = new URL("../", import.meta.url);
const mainJs = readFileSync(new URL("dist/main.js", moduleRoot), "utf8");

function readJson(path) {
  return JSON.parse(readFileSync(new URL(path, moduleRoot), "utf8"));
}

function getBundledJsonModule(modulePath) {
  const moduleIndex = mainJs.indexOf(modulePath);
  assert.notEqual(moduleIndex, -1, `missing bundled module ${modulePath}`);

  const prefix = "module.exports = /*#__PURE__*/JSON.parse(";
  const statementStart = mainJs.indexOf(prefix, moduleIndex);
  assert.notEqual(statementStart, -1, `missing bundled module export ${modulePath}`);

  const valueStart = statementStart + prefix.length;
  const lineEnd = mainJs.indexOf("\n", valueStart);
  const statementEnd = lineEnd === -1 ? mainJs.length : lineEnd;
  const lineValue = mainJs.slice(valueStart, statementEnd).replace(/\);$/, "");

  return JSON.parse(runInNewContext(lineValue));
}

test("active leader dropdown offers the dynamic Settlement Council and None sentinels", () => {
  assert.match(mainJs, /var tmp47_value = getActiveLeaderSetting\(this\.n5u_1\.q5q_1\);/);
  assert.match(mainJs, /var tmp4_value_0 = tmp47_value == null \? 'settlementCouncil' : tmp47_value;/);
  assert.match(
    mainJs,
    /var settlementCouncilLabel = kmSettlementCouncilLabel\(kingdom, settlements\.g4y_1\);/,
  );
  assert.match(
    mainJs,
    /destination_8\.n1\(new SelectOption\(settlementCouncilLabel, 'settlementCouncil'\)\);/,
  );
  assert.match(
    mainJs,
    /destination_8\.n1\(new SelectOption\(t_0\('kingdom\.noLeader'\), 'none'\)\);/,
  );
  assert.match(mainJs, /new Select\(tmp3_label_0, name, tmp4_value_0, destination_8, true,/);
});

test("active leader and check schemas accept sentinel values", () => {
  const activeLeaderSchemaIndex = mainJs.indexOf("var name = 'activeLeader';");
  assert.notEqual(activeLeaderSchemaIndex, -1);
  assert.notEqual(mainJs.indexOf("destination.n1('settlementCouncil');", activeLeaderSchemaIndex), -1);
  assert.notEqual(mainJs.indexOf("destination.n1('none');", activeLeaderSchemaIndex), -1);

  const checkSchemaIndex = mainJs.indexOf("function CheckModel$Companion$defineSchema$lambda");
  assert.notEqual(checkSchemaIndex, -1);
  assert.notEqual(mainJs.indexOf("destination_0.n1('none');", checkSchemaIndex), -1);
});

test("Settlement Council mode keeps activity list on default action counts", () => {
  assert.match(
    mainJs,
    /function getActiveLeader\(_this__u8e3s4\) \{[\s\S]*?Companion_instance_17\.m36\(tmp0_safe_receiver\);[\s\S]*?return tmp;[\s\S]*?\}/,
  );
  assert.match(
    mainJs,
    /if \(this\.y5v_1\.settings\.enableLeadershipModifiers && \(this\.x5v_1\.actions === 1 \|\| this\.x5v_1\.actions == null\) && !\(this\.b5w_1 == null\)\)/,
  );
});

test("Settlement Council and None leader modes are isolated in check dialogs", () => {
  assert.match(mainJs, /function getActiveLeaderForCheck\(_this__u8e3s4\)/);
  assert.match(mainJs, /function isNoLeaderSelection\(value\) \{\s*return value === 'none';\s*\}/);
  assert.match(mainJs, /setOf1u3mizs95ngxo\)\('settlement-council'\)/);
  assert.match(mainJs, /setOf1u3mizs95ngxo\)\('no-leader'\)/);
  assert.match(
    mainJs,
    /function createSettlementCouncilModifier\(settlementLevel\) \{[\s\S]*?calculateRegularNpcBonus\(settlementLevel\)[\s\S]*?new HasRollOption\('settlement-council'\)[\s\S]*?new Not\(new HasRollOption\('no-leader'\)\)/,
  );
  assert.match(
    mainJs,
    /var settlementCouncilLevel = currentSettlement == null \? null : kmSettlementCouncilEffectiveLevel\(currentSettlement\.v3h_1, settlementMayorLevel\);\s*tmp_3 = createLeadershipModifiers\(settlementCouncilLevel, leaderActors, leaderSkills, leaderKingdomSkills\);/,
  );
  assert.match(
    mainJs,
    /if \(!\(settlementCouncilLevel == null\)\) \{\s*destination\.n1\(createSettlementCouncilModifier\(settlementCouncilLevel\)\);\s*\}/,
  );
  assert.match(mainJs, /new Not\(new HasRollOption\('settlement-council'\)\)/);
  assert.match(
    mainJs,
    /enableLeadershipModifiers && !\(this\.c5e_1\.n5d_1 == null\) && !\(leader == null\) && !this\.c5e_1\.j5d_1\.e2\('settlement-council'\)/,
  );
  assert.match(mainJs, /function selectedLeaderForNestedCheckDialog\(\$this\)/);
});

test("Army phase activities default their check leader to None", () => {
  assert.match(mainJs, /var selectedLeaderForDialog = selectedLeader;/);
  assert.match(
    mainJs,
    /if \(!\(tmp33_activityForLeader == null\) && tmp33_activityForLeader\.phase === 'army'\) \{\s*selectedLeaderForDialog = 'none';\s*\}/,
  );
  assert.match(
    mainJs,
    /new KingdomCheckDialog\(kingdomActor, kingdom, baseModifiers, afterRoll, params, degreeMessages, rollOptions,[\s\S]*?selectedLeaderForDialog\)/,
  );
});

test("Settlement Council and None localization exists in external and bundled language data", () => {
  const cn = readJson("dist/lang/cn.json")["pf2e-kingmaker-tools"];
  const en = readJson("dist/lang/en.json")["pf2e-kingmaker-tools"];
  const bundledEn = getBundledJsonModule("./kotlin/lang/en.json")["pf2e-kingmaker-tools"];

  assert.equal(cn.kingdom.settlementCouncil, "\u5b9a\u5c45\u70b9\u8bae\u4f1a");
  assert.equal(cn.kingdom.noLeader, "\u65e0");
  assert.equal(cn.modifiers.bonuses.settlementCouncil, "\u5b9a\u5c45\u70b9\u8bae\u4f1a");
  assert.equal(en.kingdom.settlementCouncil, "Settlement Council");
  assert.equal(en.kingdom.noLeader, "None");
  assert.equal(en.modifiers.bonuses.settlementCouncil, "Settlement Council");
  assert.equal(cn.kingdom.mayor, "\u5e02\u957f");
  assert.equal(cn.kingdom.settlementMayorLeaderLabel, "\u201c{settlement}\u201d-{mayor}");
  assert.equal(en.kingdom.mayor, "Mayor");
  assert.equal(en.kingdom.settlementMayorLeaderLabel, '"{settlement}"-{mayor}');
  assert.equal(bundledEn.kingdom.settlementCouncil, en.kingdom.settlementCouncil);
  assert.equal(bundledEn.kingdom.noLeader, en.kingdom.noLeader);
  assert.equal(bundledEn.kingdom.mayor, en.kingdom.mayor);
  assert.equal(bundledEn.kingdom.settlementMayorLeaderLabel, en.kingdom.settlementMayorLeaderLabel);
  assert.equal(bundledEn.modifiers.bonuses.settlementCouncil, en.modifiers.bonuses.settlementCouncil);
});
