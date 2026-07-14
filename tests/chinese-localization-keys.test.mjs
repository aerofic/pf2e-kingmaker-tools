import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const distPath = fileURLToPath(new URL("../dist/", import.meta.url));
const en = JSON.parse(readFileSync(new URL("../dist/lang/en.json", import.meta.url), "utf8"));
const cn = JSON.parse(readFileSync(new URL("../dist/lang/cn.json", import.meta.url), "utf8"));
const structures = JSON.parse(readFileSync(new URL("../dist/structures.json", import.meta.url), "utf8"));

function flattenKeys(value, prefix = "") {
  return Object.entries(value ?? {}).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === "object" && !Array.isArray(child) ? flattenKeys(child, path) : [path];
  });
}

function collectFiles(directory, extension) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(filePath, extension);
    return entry.isFile() && filePath.endsWith(extension) ? [filePath] : [];
  });
}

function hasLocalizationKey(locale, key) {
  return key.split(".").reduce((parent, part) => {
    if (!parent || !Object.prototype.hasOwnProperty.call(parent, part)) return undefined;
    return parent[part];
  }, locale) !== undefined;
}

function extractLiteralLocalizationKeys() {
  const keys = new Set();
  const collectMatches = (text, patterns) => {
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text))) keys.add(match[1]);
    }
  };

  for (const file of collectFiles(distPath, ".hbs")) {
    collectMatches(readFileSync(file, "utf8"), [
      /localizeKM\s+"([^"]+)"/g,
      /localizeKM\s+'([^']+)'/g,
    ]);
  }

  collectMatches(readFileSync(new URL("../dist/main.js", import.meta.url), "utf8"), [
    /\bt_0\('([A-Za-z0-9_.-]+)'\)/g,
    /\bt_0\("([A-Za-z0-9_.-]+)"\)/g,
    /\bt\('([A-Za-z0-9_.-]+)'\s*[,)]/g,
    /\bt\("([A-Za-z0-9_.-]+)"\s*[,)]/g,
  ]);

  return [...keys].sort();
}

function stripVkSuffix(name) {
  return name.replace(/\s*\(V(?:&|&amp;)K\)$/, "");
}

test("Chinese localization includes every English localization key", () => {
  const enKeys = flattenKeys(en["pf2e-kingmaker-tools"]).sort();
  const cnKeys = new Set(flattenKeys(cn["pf2e-kingmaker-tools"]));
  const missingKeys = enKeys.filter((key) => !cnKeys.has(key));

  assert.deepEqual(missingKeys, []);
});

test("Chinese localization includes literal keys used by templates and bundled script", () => {
  const literalKeys = extractLiteralLocalizationKeys();
  const enRoot = en["pf2e-kingmaker-tools"];
  const cnRoot = cn["pf2e-kingmaker-tools"];

  assert.deepEqual({
    en: literalKeys.filter((key) => !hasLocalizationKey(enRoot, key)),
    cn: literalKeys.filter((key) => !hasLocalizationKey(cnRoot, key)),
  }, {
    en: [],
    cn: [],
  });
});

test("Chinese localization includes camping travel and settings labels loaded by Foundry", () => {
  const camping = cn["pf2e-kingmaker-tools"]?.camping ?? {};
  const requiredKeys = [
    "forcedMarch",
    "forcedMarchHelp",
    "hexSizeInMiles",
    "hexSizeInMilesHelp",
  ];

  const missingKeys = requiredKeys.filter((key) => typeof camping[key] !== "string" || camping[key].length === 0);

  assert.deepEqual(missingKeys, []);
});

test("Chinese localization includes Vance and Kerenshara kingdom house-rule labels", () => {
  const kingdom = cn["pf2e-kingmaker-tools"]?.kingdom ?? {};
  const expected = {
    capitalCanGrowOneSizeLarger: "首都规模可比正常限制高一级",
    capitalCanGrowOneSizeLargerHelp: "启用后，首都可比当前王国等级通常允许的定居点规模上限高一个类别。",
    capStructureBonusAtKingdomLevel: "按王国等级封顶建筑物品加值",
    capStructureBonusAtKingdomLevelHelp:
      "未启用时，建筑提供的最高物品加值只由实际定居点等级决定。启用后，即使首都提前扩张为更大的规模，建筑物品加值也会按当前王国等级通常可达到的最高定居点规模封顶。若允许首都比其他定居点更早扩大，但仍想让物品加值保持在规则预期范围内，请启用此项。",
  };

  assert.deepEqual(
    Object.fromEntries(Object.keys(expected).map((key) => [key, kingdom[key]])),
    expected,
  );
});

test("Chinese structure menu names match building names", () => {
  const structureNames = cn["pf2e-kingmaker-tools"]?.structures ?? {};
  const expectedNames = {
    "arcanists-tower": "奥术师塔",
    "bridge-stone": "石桥",
    brewery: "酿酒厂",
    cemetery: "墓园",
    "construction-yard": "建筑场",
    "construction-yard-vk": "建筑场 (V&amp;K)",
    dump: "垃圾场",
    "fishing-fleets-vk": "捕鱼队",
    foundry: "铸造厂",
    "garrison-vk": "驻地 (V&amp;K)",
    garrison: "驻地",
    "gladiatorial-arena": "角斗竞技场",
    guildhall: "行会大厅",
    herbalist: "草药店",
    houses: "民居",
    "illicit-market": "黑市",
    "inn-vk": "旅店 (V&amp;K)",
    inn: "旅店",
    keep: "要塞",
    lumberyard: "木材厂",
    "luxury-store": "奢侈品店",
    "magic-shop": "魔法商店",
    mint: "铸币厂",
    "noble-villa": "贵族庄园",
    "occult-shop": "神秘商店",
    "occult-shop-vk": "神秘商店 (V&amp;K)",
    "paved-streets": "铺砌街道",
    "sacred-grove": "神圣林地",
    "sewer-system": "下水道",
    "specialized-artisan": "巧匠屋",
    stable: "马厩",
    stockyard: "畜栏",
    stonemason: "石匠屋",
    "tavern-dive": "廉价酒馆",
    "tavern-popular": "大众酒馆",
    temple: "神庙",
    tenement: "廉租房",
    theater: "剧场",
    "wall-stone": "石墙",
    "wall-wooden": "木墙",
    waterfront: "滨区",
    "waterfront-vk": "滨区 (V&amp;K)",
  };

  assert.deepEqual(
    Object.fromEntries(Object.keys(expectedNames).map((id) => [id, structureNames[id]?.name])),
    expectedNames,
  );
});

test("Chinese kingdom XP labels describe newly claimed hex XP", () => {
  const kingdom = cn["pf2e-kingmaker-tools"]?.kingdom ?? {};

  assert.equal(kingdom.claimedHexXp, "本回合新宣称六角格");
  assert.equal(kingdom.xpPerClaimedHex, "每个新宣称六角格的 XP &nbsp;");
});

test("Chinese Structure rule terms use building, keeping only technical file structure text", () => {
  const root = cn["pf2e-kingmaker-tools"] ?? {};
  const occurrences = flattenKeys(root)
    .filter((key) => String(key.split(".").reduce((parent, part) => parent?.[part], root)).includes("结构"))
    .map((key) => [key, key.split(".").reduce((parent, part) => parent?.[part], root)]);

  assert.deepEqual(occurrences, [
    [
      "settings.enableTokenMappingHelp",
      "如果未启用官方模组，此功能启用后，会根据手册中记载的文件结构，自动将指示物图像映射到你的怪物图鉴浏览器中",
    ],
  ]);
});

test("Chinese localization avoids known machine-translation artifacts", () => {
  const root = cn["pf2e-kingmaker-tools"] ?? {};
  const forbiddenTerms = [
    "??",
    "｛",
    "｝",
    "演员",
    "令牌",
    "您",
    "十六进位",
    "六边形",
    "猫头鹰",
    "不忠点",
    "壮举",
    "考核",
    "达成和解",
    "项奖励",
    "情况加成",
    "复发性",
    "箔片",
    "每台PC",
    "该党",
    "妖精",
    "费世界",
    "骗子费",
    "aMasterpiece",
    "土强盗",
    "庄作物",
    "王国gain",
    "豪华下一回合",
    "消费下一回合",
    "版或",
    "转弯",
    "增加 动荡",
    "和。",
    "and @",
    "扰乱",
    "关于失败",
    "蓄意破坏行为",
    "增加@",
    "该该",
    "Armyof",
  ];
  const hits = flattenKeys(root).flatMap((key) => {
    const value = String(key.split(".").reduce((parent, part) => parent?.[part], root));
    return forbiddenTerms.filter((term) => value.includes(term)).map((term) => `${key}: ${term}`);
  });

  assert.deepEqual(hits, []);
});

test("Chinese V&K 1.2 text corrections stay aligned with source rules", () => {
  const root = cn["pf2e-kingmaker-tools"] ?? {};
  const activities = root.activities ?? {};
  const structuresCn = root.structures ?? {};
  const sacredGrove = structures.find((structure) => structure.id === "sacred-grove");

  assert.equal(root.structureBrowserMainFilters?.reducesRuin, "减少毁灭");
  assert.equal(root.structureBrowserMainFilters?.famous, "美名");
  assert.equal(root.structureBrowserMainFilters?.edifice, "宏伟");
  assert.equal(root.structureBrowserMainFilters?.yard, "场地");
  assert.equal(root.structureTrait?.yard, "场地");
  assert.equal(root.structureTrait?.building, "建筑");
  assert.equal(root.ruin?.decay, "衰败");

  assert.equal(activities["establish-work-site-lumber"]?.title, "建立工地：伐木场");
  assert.equal(structuresCn.lumberyard?.name, "木材厂");
  assert.match(structuresCn["sacred-grove"]?.notes ?? "", /原初魔法物品/);
  assert.doesNotMatch(structuresCn["sacred-grove"]?.notes ?? "", /等级 5|1 地块|36 RP/);
  assert.equal(sacredGrove?.notes, "structures.sacred-grove.notes");

  assert.doesNotMatch(activities["new-leadership-vk"]?.success?.msg ?? "", /@gain1Unrest/);
  assert.doesNotMatch(activities["new-leadership-vk"]?.failure?.msg ?? "", /@gain1Unrest/);
  assert.match(activities["creative-solution"]?.success?.msg ?? "", /@gain1CreativeSolution/);
  assert.match(activities["supernatural-solution"]?.success?.msg ?? "", /@gain1SupernaturalSolution/);
  assert.match(activities["capital-investment"]?.requirement ?? "", /首都/);
  assert.match(activities["capital-investment"]?.requirement ?? "", /银行/);
  assert.match(activities["quell-unrest"]?.description ?? "", /密谋/);
  assert.doesNotMatch(activities["build-roads"]?.criticalSuccess?.msg ?? "", /\/p&gt;/);
  assert.doesNotMatch(activities["establish-work-site-lumber"]?.description ?? "", /森楼/);
  assert.doesNotMatch(activities["creative-solution"]?.description ?? "", /解决问题的性方法/);
  assert.doesNotMatch(activities["abandon-hex"]?.success?.msg ?? "", /废弃的海角/);
});

test("Chinese localization keeps corrected placeholders and short UI terms", () => {
  const root = cn["pf2e-kingmaker-tools"] ?? {};

  assert.equal(root.migrations?.runningMigration, "正在运行迁移版本 {version}");
  assert.equal(root.activityDcType?.custom, "自定义");
  assert.equal(root.activityDcType?.none, "无");
  assert.equal(root.kingdom?.confirmDeleteKingdom, "是否确实要从角色 {actorName} 清除所有王国数据？");
  assert.equal(root.kingdom?.confirmDeleteCamping, "是否确实要从角色 {actorName} 清除所有营地数据？");
});

test("Chinese kingdom bonus-feat navigation is not translated as numeric bonus", () => {
  const kingdom = cn["pf2e-kingmaker-tools"]?.kingdom ?? {};

  assert.equal(kingdom.bonus, "奖励专长");
  assert.equal(kingdom.addBonusFeat, "添加奖励专长");
  assert.equal(kingdom.bonusFeat, "奖励专长");
});

test("Chinese V&K structure names use the base building name plus suffix", () => {
  const structureNames = cn["pf2e-kingmaker-tools"]?.structures ?? {};
  const structureIds = new Set(structures.map((structure) => structure.id));
  const mismatches = structures
    .map((structure) => structure.id)
    .filter((id) => id.endsWith("-vk"))
    .map((id) => [id, id.replace(/-vk$/, "")])
    .filter(([, baseId]) => structureIds.has(baseId))
    .filter(([id, baseId]) => stripVkSuffix(structureNames[id]?.name ?? "") !== structureNames[baseId]?.name)
    .map(([id, baseId]) => `${id} -> ${baseId}`);

  assert.deepEqual(mismatches, []);
});
