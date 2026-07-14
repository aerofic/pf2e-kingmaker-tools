import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const moduleRoot = new URL("../", import.meta.url);
const structures = JSON.parse(readFileSync(new URL("dist/structures.json", moduleRoot), "utf8"));
const en = JSON.parse(readFileSync(new URL("dist/lang/en.json", moduleRoot), "utf8"))["pf2e-kingmaker-tools"];
const cn = JSON.parse(readFileSync(new URL("dist/lang/cn.json", moduleRoot), "utf8"))["pf2e-kingmaker-tools"];

function structure(id) {
  const entry = structures.find((item) => item.id === id);
  assert.ok(entry, `missing structure ${id}`);
  return entry;
}

function activityBonus(entry, activity) {
  return entry.activityBonusRules?.find((rule) => rule.activity === activity)?.value;
}

function constructionSkill(entry) {
  return entry.construction.skills.map((rule) => [rule.skill, rule.proficiencyRank ?? 0]);
}

function getBundledStructuresFromMain() {
  const mainJs = readFileSync(new URL("dist/main.js", moduleRoot), "utf8");
  const moduleIndex = mainJs.indexOf("./kotlin/structures.json");
  const prefix = "module.exports = /*#__PURE__*/JSON.parse(";
  const statementStart = mainJs.indexOf(prefix, moduleIndex) + prefix.length;
  const statementEnd = mainJs.indexOf(");", statementStart);
  return JSON.parse(JSON.parse(mainJs.slice(statementStart, statementEnd)));
}

test("V&K civic government structures use the 1.2 settlement-action rules", () => {
  const townHall = structure("town-hall-vk");
  assert.equal(townHall.increaseLeadershipActivities, undefined);
  assert.equal(townHall.reducesUnrest, undefined);
  assert.equal(townHall.reduceUnrestBy, undefined);
  assert.equal(townHall.maximumCivicRdLimit, 2);
  assert.equal(townHall.increaseMinimumSettlementActions, 1);
  assert.deepEqual(townHall.increaseResourceDice, { town: 1 });
  assert.equal(activityBonus(townHall, "manage-trade-agreements"), 1);
  assert.equal(activityBonus(townHall, "retrain-vk"), 1);

  const castle = structure("castle-vk");
  assert.equal(castle.increaseLeadershipActivities, undefined);
  assert.equal(castle.reducesUnrest, true);
  assert.deepEqual(castle.reduceUnrestBy, { value: "1d4" });
  assert.equal(castle.maximumCivicRdLimit, 3);
  assert.equal(castle.increaseMinimumSettlementActions, 2);
  assert.deepEqual(castle.increaseResourceDice, { town: 1, city: 2, metropolis: 3 });
  assert.equal(activityBonus(castle, "manage-trade-agreements"), 2);
  assert.equal(activityBonus(castle, "relocate-capital"), 2);
  assert.equal(activityBonus(castle, "retrain-vk"), 2);

  const palace = structure("palace-vk");
  assert.equal(palace.increaseLeadershipActivities, undefined);
  assert.equal(palace.reducesUnrest, true);
  assert.deepEqual(palace.reduceUnrestBy, { value: "10" });
  assert.deepEqual(palace.leadershipActivityRules, [{ value: 3 }]);
  assert.equal(palace.maximumCivicRdLimit, 4);
  assert.equal(palace.increaseMinimumSettlementActions, 2);
  assert.deepEqual(palace.increaseResourceDice, { town: 1, city: 2, metropolis: 4 });
  assert.equal(activityBonus(palace, "manage-trade-agreements"), 3);
  assert.equal(activityBonus(palace, "relocate-capital"), 3);
  assert.equal(activityBonus(palace, "retrain-vk"), 3);
});

test("original civic government structures keep the original leadership-action rule", () => {
  for (const id of ["town-hall", "castle", "palace"]) {
    assert.equal(structure(id).increaseLeadershipActivities, true);
  }
});

test("V&K 1.2 added structures exist for the structure browser", () => {
  const expected = [
    ["town-watch", 3, 0, 6, 18, [["trade", 1]], undefined, [["repair-reputation-crime", 1]]],
    ["town-square", 3, 0, 6, 18, [["arts", 1]], undefined, [["repair-reputation-corruption", 1]]],
    [
      "planning-office",
      3,
      0,
      6,
      18,
      [["engineering", 1]],
      undefined,
      [
        ["accelerate-project", 1],
        ["repair-reputation-decay", 1],
      ],
    ],
    ["publicity-office", 3, 0, 6, 18, [["intrigue", 1]], undefined, [["repair-reputation-strife", 1]]],
    [
      "oddity-emporium",
      5,
      1,
      34,
      20,
      [["magic", 1]],
      undefined,
      [
        ["prognostication", 1],
        ["supernatural-solution", 1],
      ],
    ],
    ["city-watch", 9, 0, 16, 26, [["trade", 2]], ["town-watch"], [["repair-reputation-crime", 2]]],
    ["public-forum", 9, 0, 16, 26, [["arts", 2]], ["town-square"], [["repair-reputation-corruption", 2]]],
    [
      "planning-department",
      9,
      0,
      16,
      26,
      [["engineering", 2]],
      ["planning-office"],
      [
        ["accelerate-project", 2],
        ["repair-reputation-decay", 2],
      ],
    ],
    [
      "information-department",
      9,
      0,
      16,
      26,
      [["intrigue", 2]],
      ["publicity-office"],
      [["repair-reputation-strife", 2]],
    ],
  ];

  for (const [id, level, lots, rp, dc, skills, upgradeFrom, bonuses] of expected) {
    const entry = structure(id);
    assert.equal(entry.name, `structures.${id}.name`);
    assert.equal(entry.notes, `structures.${id}.notes`);
    assert.equal(entry.level, level);
    assert.equal(entry.lots, lots);
    assert.equal(entry.construction.rp, rp);
    assert.equal(entry.construction.dc, dc);
    assert.deepEqual(constructionSkill(entry), skills);
    assert.deepEqual(entry.upgradeFrom, upgradeFrom);
    assert.deepEqual(entry.traits, [id === "oddity-emporium" ? "building" : "infrastructure"]);
    assert.deepEqual(
      bonuses.map(([activity, value]) => [activity, activityBonus(entry, activity)]),
      bonuses,
    );
    if (id === "oddity-emporium") {
      assert.deepEqual(entry.availableItemsRules, [{ value: 1, group: "occult" }]);
    } else {
      assert.equal(entry.availableItemsRules, undefined);
    }
    assert.equal(entry.reduceRuinBy, undefined);
    assert.equal(entry.reducesRuin, undefined);
  }

  assert.deepEqual(structure("magic-shop-vk").upgradeFrom, ["oddity-emporium"]);
});

test("V&K 1.2 added structure P1-lite notes expose requirements and upgrade paths", () => {
  const upgradeNotes = [
    ["town-watch", "Upgrade To", "City Watch", "升级为", "城市守望"],
    ["town-square", "Upgrade To", "Public Forum", "升级为", "公共论坛"],
    ["planning-office", "Upgrade To", "Planning Department", "升级为", "规划部门"],
    ["publicity-office", "Upgrade To", "Information Department", "升级为", "信息部门"],
  ];

  for (const [id, enLabel, enTarget, cnLabel, cnTarget] of upgradeNotes) {
    assert.match(en.structures[id].notes, new RegExp(`${enLabel}</strong> ${enTarget}`));
    assert.match(cn.structures[id].notes, new RegExp(`${cnLabel}</strong> ${cnTarget}`));
    assert.match(cn.structures[id].notes, /要求/);
    assert.match(cn.structures[id].notes, /不能同时拥有/);
  }
});

test("bundled main.js structure data matches external structure JSON", () => {
  assert.deepEqual(getBundledStructuresFromMain(), structures);
});
