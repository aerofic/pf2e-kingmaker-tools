import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const moduleRoot = new URL("../", import.meta.url);
const dataFiles = [
  { path: "dist/kingdom-activities.json", modulePath: "./kotlin/kingdom-activities.json" },
  { path: "dist/events.json", modulePath: "./kotlin/events.json" },
  { path: "dist/feats.json", modulePath: "./kotlin/feats.json" },
  { path: "dist/features.json", modulePath: "./kotlin/features.json" },
  { path: "dist/structures.json", modulePath: "./kotlin/structures.json" },
];
const shoppingUnlockExpectations = [
  { id: "smithy-vk", cn: "金属装备", en: "metallic equipment" },
  { id: "smithy", cn: "金属装备", en: "metallic equipment" },
  { id: "foundry", cn: "金属装备", en: "metallic equipment" },
  { id: "specialized-artisan", cn: "符文、护符/饰品", en: "runes and amulets/accessories" },
  { id: "tannery", cn: "皮革装备", en: "leather equipment" },
  { id: "arcanists-tower", cn: "卷轴/魔杖/法杖", en: "scrolls/wands/staves" },
  { id: "library-vk", cn: "典籍", en: "tomes" },
  { id: "library", cn: "典籍", en: "tomes" },
  { id: "academy", cn: "典籍", en: "tomes" },
  { id: "university", cn: "典籍", en: "tomes" },
  { id: "alchemy-laboratory", cn: "炼金物品", en: "alchemical items" },
  { id: "lumberyard", cn: "木制物品", en: "wooden items" },
  { id: "general-store", cn: "其他物品", en: "other items" },
  { id: "marketplace", cn: "其他物品", en: "other items" },
];
const localizableFields = new Set([
  "automationNotes",
  "buttonLabel",
  "description",
  "help",
  "label",
  "location",
  "msg",
  "name",
  "notes",
  "requirement",
  "resolution",
  "text",
  "title",
]);
const localizationKeyPattern =
  /^(?:activities|applications|camping|enums|events|fame|features|kingdom|kingdomFeats|resourceButton|settings|settlements|structures)\.[A-Za-z0-9_.-]+$/;
const modifierTypes = new Set(["circumstance", "item", "status", "untyped"]);
const degrees = new Set(["criticalSuccess", "success", "failure", "criticalFailure"]);
const resources = [
  "ResourceDice",
  "Crime",
  "Decay",
  "Corruption",
  "Consumption",
  "Strife",
  "ResourcePoints",
  "Food",
  "Luxuries",
  "Unrest",
  "Ore",
  "Lumber",
  "Fame",
  "Stone",
  "Xp",
  "SupernaturalSolution",
  "CreativeSolution",
  "RolledResourceDice",
  "BlessedSolution",
];
const resourceTagPattern = /@(?:gain|lose)[A-Za-z0-9_+\-]+/g;
const resourceButtonPattern = new RegExp(
  `^@(gain|lose)(Multiple)?([0-9rd+]+)(${resources.join("|")}|[A-Za-z]+Event)(NextTurn)?$`,
);

function readJson(path) {
  return JSON.parse(readFileSync(new URL(path, moduleRoot), "utf8"));
}

function visit(node, path, callback) {
  callback(node, path);
  if (Array.isArray(node)) {
    node.forEach((value, index) => visit(value, `${path}[${index}]`, callback));
  } else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) visit(value, `${path}.${key}`, callback);
  }
}

function getLocalization(root, key) {
  return key.split(".").reduce((parent, part) => parent?.[part], root);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isModifierPath(path) {
  return /(?:^|\.)(?:modifiers|globalModifiers)\[\d+\]$/.test(path);
}

function parseEventId(value) {
  return value
    .replace(/Event$/, "")
    .split(/(?=\p{Lu})/u)
    .filter(Boolean)
    .map((part) => part.toLowerCase())
    .join("-");
}

function getBundledJsonModule(modulePath) {
  const mainJs = readFileSync(new URL("dist/main.js", moduleRoot), "utf8");
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

function getActivity(activities, id) {
  const activity = activities.find((entry) => entry.id === id);
  assert.ok(activity, `missing activity ${id}`);
  return activity;
}

function getDegreeModifier(activity, degree, name) {
  const modifier = activity[degree]?.modifiers?.find((entry) => entry.name === name);
  assert.ok(modifier, `missing ${activity.id}.${degree} modifier ${name}`);
  return modifier;
}

test("automation data localization keys exist in English and Chinese", () => {
  const locales = {
    en: readJson("dist/lang/en.json")["pf2e-kingmaker-tools"],
    cn: readJson("dist/lang/cn.json")["pf2e-kingmaker-tools"],
  };
  const missing = [];

  for (const { path } of dataFiles) {
    visit(readJson(path), path, (node, keyPath) => {
      if (!node || typeof node !== "object" || Array.isArray(node)) return;

      for (const [field, value] of Object.entries(node)) {
        if (
          typeof value === "string" &&
          localizableFields.has(field) &&
          localizationKeyPattern.test(value)
        ) {
          for (const [locale, root] of Object.entries(locales)) {
            if (!getLocalization(root, value)) missing.push(`${keyPath}.${field}: missing ${locale} ${value}`);
          }
        }
      }
    });
  }

  assert.deepEqual(missing, []);
});

test("automation modifiers use valid button, turn, and result adjustment shapes", () => {
  const issues = [];

  for (const { path } of dataFiles.filter((file) => !file.path.endsWith("structures.json"))) {
    visit(readJson(path), path, (node, keyPath) => {
      if (!node || typeof node !== "object" || Array.isArray(node) || !isModifierPath(keyPath)) return;

      if (!node.name) issues.push(`${keyPath}: missing name`);
      if (!node.buttonLabel) issues.push(`${keyPath}: missing buttonLabel`);
      if (node.type && !modifierTypes.has(node.type)) issues.push(`${keyPath}: unknown type ${node.type}`);
      if ("value" in node && typeof node.value !== "number") issues.push(`${keyPath}: nonnumeric value`);
      if ("turns" in node && (!Number.isInteger(node.turns) || node.turns < 1)) {
        issues.push(`${keyPath}: invalid turns ${node.turns}`);
      }
      if ("enabled" in node && typeof node.enabled !== "boolean") issues.push(`${keyPath}: nonboolean enabled`);
      if (node.rollTwiceKeepHighest && node.rollTwiceKeepLowest) issues.push(`${keyPath}: conflicting rollTwice flags`);

      for (const [field, degreeField, oppositeField] of [
        ["upgradeResults", "upgrade", "downgrade"],
        ["downgradeResults", "downgrade", "upgrade"],
      ]) {
        if (!(field in node)) continue;
        if (!Array.isArray(node[field]) || node[field].length === 0) {
          issues.push(`${keyPath}.${field}: not a nonempty array`);
          continue;
        }

        for (const [index, entry] of node[field].entries()) {
          if (typeof entry === "string") {
            if (!degrees.has(entry)) issues.push(`${keyPath}.${field}[${index}]: bad degree ${entry}`);
          } else if (entry && typeof entry === "object") {
            if (!degrees.has(entry[degreeField])) {
              issues.push(`${keyPath}.${field}[${index}]: bad ${degreeField} ${JSON.stringify(entry)}`);
            }
            if (oppositeField in entry) issues.push(`${keyPath}.${field}[${index}]: unexpected ${oppositeField}`);
            if ("times" in entry && (!Number.isInteger(entry.times) || entry.times < 1)) {
              issues.push(`${keyPath}.${field}[${index}]: invalid times ${entry.times}`);
            }
            if ("applyIf" in entry && !Array.isArray(entry.applyIf)) {
              issues.push(`${keyPath}.${field}[${index}]: applyIf is not an array`);
            }
          } else {
            issues.push(`${keyPath}.${field}[${index}]: invalid entry`);
          }
        }
      }
    });
  }

  assert.deepEqual(issues, []);
});

test("Spread the Legend has a separate printing-press-installed activity", () => {
  const activities = readJson("dist/kingdom-activities.json");
  const en = readJson("dist/lang/en.json")["pf2e-kingmaker-tools"];
  const cn = readJson("dist/lang/cn.json")["pf2e-kingmaker-tools"];
  const baseActivity = getActivity(activities, "spread-the-legend");
  const printingActivity = getActivity(activities, "spread-the-legend-printing");
  const baseModifier = baseActivity.modifiers?.find(
    (entry) => entry.name === "activities.spread-the-legend.modifiers.printingPress.name",
  );
  const printingModifier = printingActivity.modifiers?.find(
    (entry) => entry.name === "activities.spread-the-legend.modifiers.printingPress.name",
  );

  assert.equal(baseModifier, undefined);
  assert.ok(printingModifier, "missing Spread the Legend printing press modifier");
  assert.equal(printingModifier.enabled, true);
  assert.equal(printingModifier.value, 2);
  assert.equal(printingModifier.type, "item");
  assert.equal(printingModifier.applyIf, undefined);
  assert.equal(printingActivity.title, "activities.spread-the-legend-printing.title");
  assert.equal(getLocalization(en, printingModifier.name), "Printing Press Installed");
  assert.equal(getLocalization(en, printingModifier.buttonLabel), "Printing Press Installed");
  assert.equal(getLocalization(cn, printingModifier.name), "印刷机已安装");
  assert.equal(getLocalization(cn, printingModifier.buttonLabel), "印刷机已安装");
  assert.equal(getLocalization(cn, printingActivity.title), "颂扬传奇（印刷机已安装）");
});

test("Wartime Oversight is a no-automation leadership activity", () => {
  const activities = readJson("dist/kingdom-activities.json");
  const en = readJson("dist/lang/en.json")["pf2e-kingmaker-tools"];
  const cn = readJson("dist/lang/cn.json")["pf2e-kingmaker-tools"];
  const activity = getActivity(activities, "wartime-oversight");

  assert.equal(activity.phase, "leadership");
  assert.equal(activity.dc, "none");
  assert.equal(activity.actions, 1);
  assert.deepEqual(activity.skills, {});
  assert.equal(activity.modifiers, undefined);
  assert.equal(activity.success, undefined);
  assert.equal(activity.failure, undefined);
  assert.equal(activity.criticalSuccess, undefined);
  assert.equal(activity.criticalFailure, undefined);
  assert.equal(getLocalization(en, activity.title), "Wartime Oversight");
  assert.equal(typeof getLocalization(cn, activity.title), "string");
  assert.equal(typeof getLocalization(cn, activity.description), "string");
});

test("Moonlit Secret Detention keeps only low-risk automation", () => {
  const activities = readJson("dist/kingdom-activities.json");
  const en = readJson("dist/lang/en.json")["pf2e-kingmaker-tools"];
  const cn = readJson("dist/lang/cn.json")["pf2e-kingmaker-tools"];
  const activity = getActivity(activities, "moonlit-secret-detention");

  assert.equal(activity.phase, "leadership");
  assert.equal(activity.dc, "control");
  assert.equal(activity.actions, 1);
  assert.deepEqual(activity.skills, { intrigue: 0 });

  assert.equal(activity.criticalSuccess.modifiers, undefined);
  assert.match(getLocalization(cn, activity.criticalSuccess.msg), /@lose1Unrest/);
  assert.match(getLocalization(cn, activity.criticalSuccess.msg), /防越狱演练/);
  assert.match(getLocalization(cn, activity.criticalSuccess.msg), /狼犬/);
  assert.match(getLocalization(cn, activity.success.msg), /@lose1ResourceDiceNextTurn/);
  assert.doesNotMatch(getLocalization(cn, activity.success.msg), /@gain1ResourceDiceNextTurn/);
  assert.match(getLocalization(cn, activity.success.msg), /没有变身/);
  assert.match(getLocalization(cn, activity.success.msg), /若目标变身/);
  assert.match(getLocalization(cn, activity.failure.msg), /@gain1Unrest/);
  assert.match(getLocalization(cn, activity.failure.msg), /没有变身/);
  assert.match(getLocalization(cn, activity.failure.msg), /怪物肆虐/);
  assert.doesNotMatch(getLocalization(cn, activity.success.msg), /@lose\d+RolledResourceDice/);
  assert.match(getLocalization(cn, activity.criticalFailure.msg), /@gain1d4Strife/);
  assert.match(getLocalization(cn, activity.criticalFailure.msg), /没有变身/);
  assert.match(getLocalization(cn, activity.criticalFailure.msg), /若目标变身/);
  assert.doesNotMatch(getLocalization(cn, activity.criticalFailure.msg), /失去所有领导加值/);
  assert.doesNotMatch(getLocalization(en, activity.criticalFailure.msg), /loses all leadership bonuses/);
  assert.match(getLocalization(cn, activity.special), /执行本行动的领袖不能为关押目标本人/);
  assert.match(getLocalization(en, activity.special), /cannot be the detained target/);
  assert.doesNotMatch(getLocalization(cn, activity.special), /王国行动数 -1/);
  assert.doesNotMatch(getLocalization(en, activity.special), /fewer Kingdom activit/);
  assert.match(getLocalization(en, activity.automationNotes), /On a Critical Success, the -1 Unrest button/);
  assert.match(getLocalization(en, activity.automationNotes), /On a Success, apply the -1 Resource Die next turn button only if the target transforms/);
  assert.doesNotMatch(getLocalization(en, activity.automationNotes), /loss of leadership bonus/);
  assert.doesNotMatch(getLocalization(en, activity.automationNotes), /end-of-month leader activity reduction/);
  assert.doesNotMatch(getLocalization(cn, activity.automationNotes), /失去领导加值/);
  assert.doesNotMatch(getLocalization(cn, activity.automationNotes), /月底领袖行动数 -1/);
  assert.match(getLocalization(cn, activity.automationNotes), /大成功结果的动荡 -1/);
  assert.match(getLocalization(cn, activity.automationNotes), /只有目标发生变身才点击下回合资源骰 -1/);
  assert.doesNotMatch(getLocalization(cn, activity.special), /<\/?p>/);
  assert.doesNotMatch(getLocalization(en, activity.special), /<\/?p>/);
});

test("Darkvision army tactic is overridden by the plugin without prerequisite gating", () => {
  const main = readFileSync(new URL("dist/main.js", moduleRoot), "utf8");

  assert.match(main, /function isDarkvisionArmyTactic\(tactic\)/);
  assert.match(main, /getArmyTacticSlug\(tactic\) === 'darkvision'/);
  assert.match(main, /function effectiveArmyTacticLevel\(tactic\) \{\s*return isDarkvisionArmyTactic\(tactic\) \? 5 : tactic\.level;\s*\}/);
  assert.match(main, /Requirement<\/strong> The army has the Low-Light Vision tactic\./);
  assert.match(main, /appendDarkvisionArmyTacticRequirementHtml\(this\.i55_1, link\)/);
  assert.match(main, /destination_0\.n1\(applyVkArmyTacticOverrides\(element_0\)\)/);
  assert.match(main, /getLevelBasedDC\(effectiveArmyTacticLevel\(item\)\)/);
  assert.doesNotMatch(main, /armyTacticVkRequirementMet|darkvisionArmyTacticRequirementMet|hasArmyTacticSlug|'low-light-vision'/);
});

test("General Store shopping unlock and no-shop-penalty removal stay separated from magic shops", () => {
  const structures = readJson("dist/structures.json");
  const main = readFileSync(new URL("dist/main.js", moduleRoot), "utf8");
  const byId = new Map(structures.map((structure) => [structure.id, structure]));
  const noShopPenaltyRemovalChain = [
    "general-store",
    "marketplace",
  ];
  const otherItemUnlockChain = ["general-store", "marketplace"];
  const magicShopChain = ["magic-shop", "occult-shop", "occult-shop-vk"];
  const nonShopStructures = ["embassy", "luxury-store", ...magicShopChain];

  for (const id of noShopPenaltyRemovalChain) {
    assert.equal(byId.get(id)?.preventItemLevelPenalty, true, `${id} should remove the no-shop item level penalty`);
  }

  for (const id of nonShopStructures) {
    assert.equal(byId.get(id)?.preventItemLevelPenalty, undefined, `${id} should not remove the no-shop item level penalty`);
  }

  for (const id of otherItemUnlockChain) {
    assert.ok(byId.has(id), `${id} should be available as an other-item unlock source`);
  }

  assert.equal(byId.get("magic-shop-vk")?.upgradeFrom?.[0], "oddity-emporium");
  assert.equal(byId.get("magic-shop-vk")?.preventItemLevelPenalty, undefined);
  assert.match(
    main,
    /id === 'general-store' \|\| id === 'marketplace'/,
  );
  assert.doesNotMatch(main, /id === 'general-store' \|\| id === 'marketplace' \|\| id === 'luxury-store'/);
  assert.doesNotMatch(main, /getOtherItemsLabel\(\), sourceName[\s\S]*magic-shop/);
});

test("Academy and University inherit Library tome shopping unlocks", () => {
  const structures = readJson("dist/structures.json");
  const main = readFileSync(new URL("dist/main.js", moduleRoot), "utf8");
  const byId = new Map(structures.map((structure) => [structure.id, structure]));

  assert.deepEqual(byId.get("academy")?.upgradeFrom, ["library", "library-vk"]);
  assert.deepEqual(byId.get("university")?.upgradeFrom, ["academy"]);
  assert.match(
    main,
    /id === 'library-vk' \|\| id === 'library' \|\| id === 'academy' \|\| id === 'university'\) \{\s*addPurchasableItemUnlock\(result, indexByKey, 'tomes'/,
  );
  assert.doesNotMatch(
    main,
    /id === 'military-academy'[\s\S]{0,200}addPurchasableItemUnlock\(result, indexByKey, 'tomes'/,
  );
});

test("special shopping item level rows use settlement level calculations", () => {
  const main = readFileSync(new URL("dist/main.js", moduleRoot), "utf8");

  assert.match(main, /function addAdditionalAvailableItemLevelRows\(result, structures, settlementLevel\)/);
  assert.match(main, /addAdditionalAvailableItemLevelRows\(destination_9, parsed\.k3h_1, availableItemsSettlementLevel\)/);
  assert.match(main, /id === 'herbalist'[\s\S]*addDisplayedAvailableItemLevelRule\(result, '\\u6cbb\\u7597\\u836f\\u6c34', settlementLevel, 2\)/);
  assert.match(main, /id === 'shrine'[\s\S]*addDisplayedAvailableItemLevelRule\(result, '\\u795e\\u672f\\u6cbb\\u7597\\u7269\\u54c1', settlementLevel, 1\)/);
  assert.match(main, /id === 'smithy-vk' \|\| id === 'smithy'[\s\S]*addDisplayedAvailableItemLevelRule\(result, '\\u62a4\\u7532\\u3001\\u76fe\\u724c\\u3001\\u6b66\\u5668', settlementLevel, 1\)/);
  assert.match(main, /id === 'luxury-store'[\s\S]*addDisplayedAvailableItemLevelRule\(result, '\\u53ef\\u4f9b\\u8d2d\\u4e70\\u7684\\u5962\\u4f88\\u54c1\\uff08\\u7f55\\u89c1\\u3001\\u7a00\\u6709\\uff09', settlementLevel, 1\)/);
  assert.doesNotMatch(main, /addAdditionalAvailableItemLevelRows\(destination_9, parsed\.k3h_1\);/);
});

test("shopping unlock structures document their unlocked item categories", () => {
  const structures = readJson("dist/structures.json");
  const en = readJson("dist/lang/en.json")["pf2e-kingmaker-tools"];
  const cn = readJson("dist/lang/cn.json")["pf2e-kingmaker-tools"];
  const byId = new Map(structures.map((structure) => [structure.id, structure]));

  for (const { id, cn: cnLabel, en: enLabel } of shoppingUnlockExpectations) {
    assert.equal(byId.get(id)?.notes, `structures.${id}.notes`, `${id} should expose structure notes`);
    assert.match(cn.structures[id]?.notes ?? "", /购物解锁/, `${id} Chinese notes should mention shopping unlocks`);
    assert.match(cn.structures[id]?.notes ?? "", new RegExp(escapeRegExp(cnLabel)), `${id} Chinese notes should mention ${cnLabel}`);
    assert.match(en.structures[id]?.notes ?? "", /Shopping Unlock/, `${id} English notes should mention shopping unlocks`);
    assert.match(en.structures[id]?.notes ?? "", new RegExp(escapeRegExp(enLabel)), `${id} English notes should mention ${enLabel}`);
  }
});

test("kingdom skill critical failures remind the matching V&K ruin increase", () => {
  const main = readFileSync(new URL("dist/main.js", moduleRoot), "utf8");
  const upgradeTemplate = readFileSync(new URL("dist/chatmessages/upgrade-roll-meta.hbs", moduleRoot), "utf8");
  const en = readJson("dist/lang/en.json")["pf2e-kingmaker-tools"];
  const cn = readJson("dist/lang/cn.json")["pf2e-kingmaker-tools"];

  assert.match(main, /function kingdomSkillCriticalFailureRuinData\(skill\)/);
  assert.match(main, /KingdomAbility_CULTURE_getInstance\(\)[\s\S]*Ruin_CORRUPTION_getInstance\(\)[\s\S]*@gain1Corruption/);
  assert.match(main, /KingdomAbility_ECONOMY_getInstance\(\)[\s\S]*Ruin_CRIME_getInstance\(\)[\s\S]*@gain1Crime/);
  assert.match(main, /KingdomAbility_STABILITY_getInstance\(\)[\s\S]*Ruin_DECAY_getInstance\(\)[\s\S]*@gain1Decay/);
  assert.match(main, /KingdomAbility_LOYALTY_getInstance\(\)[\s\S]*Ruin_STRIFE_getInstance\(\)[\s\S]*@gain1Strife/);
  assert.match(main, /degree\.equals\(DegreeOfSuccess_CRITICAL_FAILURE_getInstance\(\)\)/);
  assert.match(main, /skill: skill\.p3\(\)/);
  assert.match(main, /elem\.dataset\['skill'\]/);
  assert.match(main, /notesHtml \+ criticalFailureRuinReminder \+ postHtml/);
  assert.match(main, /postDegreeOfSuccess\(changed, originalDegree[\s\S]*criticalFailureRuinReminder/);
  assert.match(upgradeTemplate, /data-skill="{{skill}}"/);
  assert.equal(
    en.kingdom.criticalFailureRuinReminder,
    "V&K: This kingdom skill check critically failed. {skill} is a {ability} skill; increase {ruin} by 1. {button}",
  );
  assert.equal(
    cn.kingdom.criticalFailureRuinReminder,
    "V&K：王国技能检定大失败。{skill} 属于{ability}技能；额外增加 1 点{ruin}。{button}",
  );
});

test("localized resource automation tags are parser-compatible and reference existing events", () => {
  const eventIds = new Set(readJson("dist/events.json").map((event) => event.id));
  const invalid = [];

  for (const locale of ["en", "cn"]) {
    visit(readJson(`dist/lang/${locale}.json`), locale, (node, path) => {
      if (typeof node !== "string") return;

      for (const tag of node.match(resourceTagPattern) ?? []) {
        if (!resourceButtonPattern.test(tag)) {
          invalid.push(`${path}: invalid resource tag ${tag}`);
          continue;
        }

        const eventMatch = tag.match(/([A-Za-z]+Event)(?:NextTurn)?$/);
        if (eventMatch) {
          const eventId = parseEventId(eventMatch[1]);
          if (!eventIds.has(eventId)) invalid.push(`${path}: missing event for ${tag} -> ${eventId}`);
        }
      }
    });
  }

  assert.deepEqual(invalid, []);
});

test("high-risk kingdom automation fixtures remain configured", () => {
  const activities = readJson("dist/kingdom-activities.json");
  const events = readJson("dist/events.json");
  const en = readJson("dist/lang/en.json")["pf2e-kingmaker-tools"];
  const degreesToCheck = ["criticalSuccess", "success", "failure", "criticalFailure"];

  const tapTreasury = getActivity(activities, "tap-treasury");
  assert.deepEqual(tapTreasury.skills, { politics: 0 });
  assert.equal(tapTreasury.skills.statecraft, undefined);
  for (const degree of degreesToCheck) {
    const modifier = getDegreeModifier(tapTreasury, degree, `activities.tap-treasury.${degree}.modifiers.futureAttempts.name`);
    assert.equal(modifier.value, 0);
    assert.equal(modifier.type, "untyped");
    assert.deepEqual(modifier.applyIf, [{ eq: ["@activity", "tap-treasury"] }]);
    assert.deepEqual(modifier.downgradeResults, [
      { downgrade: "criticalSuccess", times: 2 },
      { downgrade: "success", times: 2 },
      { downgrade: "failure" },
    ]);
  }

  assert.match(en.activities["capital-investment"].criticalSuccess.msg, /@gain4RolledResourceDice/);
  assert.match(en.activities["capital-investment"].criticalSuccess.msg, /@gain4ResourceDiceNextTurn/);
  assert.match(en.activities["capital-investment"].success.msg, /@gain2RolledResourceDice/);
  assert.match(en.activities["capital-investment"].success.msg, /@gain2ResourceDiceNextTurn/);
  assert.match(en.activities["capital-investment"].automationNotes, /Crime by the rolled amount/);

  for (const id of [
    "establish-work-site-lumber",
    "establish-work-site-mine",
    "establish-work-site-quarry",
  ]) {
    const activity = getActivity(activities, id);
    assert.equal(activity.criticalSuccess.modifiers[0].turns, 2);
  }

  const newLeadershipVk = getActivity(activities, "new-leadership-vk");
  assert.equal(newLeadershipVk.automationNotes, "activities.new-leadership-vk.automationNotes");
  assert.deepEqual(newLeadershipVk.failure.modifiers[0].applyIf, [
    { in: ["@phase", ["leadership", "commerce", "region", "civic", "army"]] },
  ]);
  for (const id of ["quell-unrest", "build-roads", "abandon-hex", "build-structure"]) {
    assert.equal(getActivity(activities, id).automationNotes, `activities.${id}.automationNotes`);
  }

  const manageTrade = getActivity(activities, "manage-trade-agreements");
  for (const degree of degreesToCheck) {
    const modifier = getDegreeModifier(
      manageTrade,
      degree,
      "activities.manage-trade-agreements.modifiers.previousTurn.name",
    );
    assert.equal(modifier.value, -5);
    assert.equal(modifier.turns, 2);
    assert.deepEqual(modifier.applyIf, [{ eq: ["@activity", "manage-trade-agreements"] }]);
  }
  const tradeLockout = getDegreeModifier(
    manageTrade,
    "criticalFailure",
    "activities.manage-trade-agreements.criticalFailure.modifiers.lockout.name",
  );
  assert.equal(tradeLockout.value, 0);
  assert.equal(tradeLockout.turns, 2);

  const foreignAid = getActivity(activities, "request-foreign-aid-vk");
  for (const degree of degreesToCheck) {
    const modifier = getDegreeModifier(
      foreignAid,
      degree,
      "activities.request-foreign-aid-vk.modifiers.sameGroupDcMemory.name",
    );
    assert.equal(modifier.value, 0);
    assert.equal(modifier.turns, 2);
    assert.deepEqual(modifier.applyIf, [{ eq: ["@activity", "request-foreign-aid-vk"] }]);
  }

  const relocateCapital = getActivity(activities, "relocate-capital");
  for (const degree of degreesToCheck) {
    const modifier = getDegreeModifier(relocateCapital, degree, "activities.relocate-capital.modifiers.cooldown.name");
    assert.equal(modifier.value, 0);
    assert.equal(modifier.turns, 4);
    assert.deepEqual(modifier.applyIf, [{ eq: ["@activity", "relocate-capital"] }]);
  }

  const naturesBlessing = events.find((event) => event.id === "natures-blessing");
  assert.ok(naturesBlessing, "missing Nature's Blessing event");
  assert.deepEqual(naturesBlessing.stages[0].criticalSuccess.modifiers[0].applyIf, [
    { in: ["@activity", ["create-a-masterpiece", "craft-luxuries"]] },
  ]);
  assert.deepEqual(naturesBlessing.stages[0].criticalSuccess.modifiers[0].upgradeResults, [
    { upgrade: "success" },
    { upgrade: "failure" },
    { upgrade: "criticalFailure" },
  ]);
  assert.deepEqual(naturesBlessing.stages[0].success.modifiers[0].applyIf, [
    { in: ["@ability", ["culture", "stability"]] },
  ]);
});

test("bundled main.js automation JSON matches external JSON data", () => {
  for (const { path, modulePath } of dataFiles) {
    assert.deepEqual(getBundledJsonModule(modulePath), readJson(path), `${modulePath} should match ${path}`);
  }
  assert.deepEqual(getBundledJsonModule("./kotlin/lang/en.json"), readJson("dist/lang/en.json"));
});
