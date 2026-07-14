import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const moduleRoot = new URL("../", import.meta.url);
const main = readFileSync(new URL("dist/main.js", moduleRoot), "utf8");
const en = JSON.parse(readFileSync(new URL("dist/lang/en.json", moduleRoot), "utf8"))["pf2e-kingmaker-tools"];
const cn = JSON.parse(readFileSync(new URL("dist/lang/cn.json", moduleRoot), "utf8"))["pf2e-kingmaker-tools"];

test("Offensive Gambit uses the highest enemy Scouting DC in the contested hex", () => {
  assert.match(cn.activities["offensive-gambit"].description, /该地块所有敌军中最高的侦查 DC/);
  assert.match(en.activities["offensive-gambit"].description, /highest Scouting DC among all enemy armies in that hex/);
  assert.match(main, /function kmOffensiveGambitEnemyArmies\(game\)/);
  assert.match(main, /activity\.id === 'offensive-gambit' \? kmOffensiveGambitEnemyArmies\(game\) : getSelectedArmies\(game\)/);
  assert.match(main, /var tmp\$ret\$4 = kmArmyStatisticDc\(item, 'scouting'\)/);
});

test("army opposed DCs use prepared statistic DC values instead of raw modifiers", () => {
  assert.match(main, /function kmArmyStatisticDc\(actor, statisticSlug\)/);
  assert.match(main, /statistic\.dc\.value/);
  assert.match(main, /Number\.isFinite\(modifier\) \? modifier \+ 10 : null/);
});

test("Rally uses the highest Morale DC among remaining enemy armies", () => {
  assert.match(main, /function kmRallyRemainingEnemyArmies\(rollingActor\)/);
  assert.match(main, /!kmArmyHasDestroyedCondition\(kmArmyActorFromToken\(token\)\)/);
  assert.match(main, /kmArmyStatisticDc\(actor, 'morale'\)/);
  assert.match(main, /delete link\.dataset\.pf2Dc/);
  assert.match(main, /link\.dataset\.pf2Dc = String\(Math\.max\(\.\.\.dcs\)\)/);
  assert.match(main, /pack\.getDocument\('8XXylMGJuqe1ozMk'\)/);
  assert.match(main, /剩余敌军中最高的士气 DC/);
  assert.match(main, /highest Morale DC among all remaining enemy armies/);
});
