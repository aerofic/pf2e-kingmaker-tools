import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const moduleRoot = new URL("../", import.meta.url);
const classicLevelUrl = new URL("../../foundryvtt-node-14.365/node_modules/classic-level/index.js", import.meta.url);
const removedIds = new Set(["reconnoiter-hex-vk"]);
const kingdomSkills = new Set([
  "agriculture",
  "arts",
  "boating",
  "defense",
  "engineering",
  "exploration",
  "folklore",
  "industry",
  "intrigue",
  "magic",
  "politics",
  "scholarship",
  "statecraft",
  "trade",
  "warfare",
  "wilderness",
]);

function readJson(path) {
  return JSON.parse(readFileSync(new URL(path, moduleRoot), "utf8"));
}

function readBundledJsonModule(moduleId) {
  const mainJs = readFileSync(new URL("dist/main.js", moduleRoot), "utf8");
  const moduleIndex = mainJs.indexOf(`/***/ "${moduleId}":`);
  assert.notEqual(moduleIndex, -1, `missing bundled JSON module ${moduleId}`);
  const prefix = "module.exports = /*#__PURE__*/JSON.parse(";
  const statementStart = mainJs.indexOf(prefix, moduleIndex);
  assert.notEqual(statementStart, -1, `missing JSON.parse statement for ${moduleId}`);
  const valueStart = statementStart + prefix.length;
  const valueEnd = mainJs.indexOf(");", valueStart);
  assert.notEqual(valueEnd, -1, `missing JSON.parse statement end for ${moduleId}`);
  const jsonText = Function(`"use strict"; return (${mainJs.slice(valueStart, valueEnd)});`)();
  return JSON.parse(jsonText);
}

async function readPackDocumentIds(relativePath) {
  const { ClassicLevel } = await import(classicLevelUrl.href);
  const db = new ClassicLevel(fileURLToPath(new URL(relativePath, moduleRoot)), {
    keyEncoding: "utf8",
    valueEncoding: "json",
  });
  await db.open();
  try {
    const ids = new Set();
    for await (const [, doc] of db.iterator()) {
      if (doc._id) ids.add(doc._id);
    }
    return ids;
  } finally {
    await db.close();
  }
}

function collectUuidValues(node, uuids = []) {
  if (Array.isArray(node)) {
    for (const value of node) collectUuidValues(value, uuids);
    return uuids;
  }

  if (!node || typeof node !== "object") return uuids;

  for (const [key, value] of Object.entries(node)) {
    if (key === "uuid" && typeof value === "string") uuids.push(value);
    collectUuidValues(value, uuids);
  }

  return uuids;
}

function assertUniqueIds(records, label) {
  const seen = new Set();
  const duplicates = [];
  for (const record of records) {
    if (seen.has(record.id)) duplicates.push(record.id);
    seen.add(record.id);
  }
  assert.deepEqual(duplicates, [], `${label} IDs should be unique`);
}

function collectPredicateRefs(node, refs = []) {
  if (Array.isArray(node)) {
    for (const value of node) collectPredicateRefs(value, refs);
    return refs;
  }

  if (!node || typeof node !== "object") return refs;

  for (const [operator, value] of Object.entries(node)) {
    if (operator === "in" && Array.isArray(value) && value.length === 2) {
      const [tag, candidates] = value;
      if ((tag === "@activity" || tag === "@structure") && Array.isArray(candidates)) {
        refs.push({ tag, candidates });
      }
    }
    collectPredicateRefs(value, refs);
  }

  return refs;
}

function collectMissingPredicateRefs(records, label, validActivities, validStructures) {
  const missing = [];
  for (const record of records) {
    for (const { tag, candidates } of collectPredicateRefs(record)) {
      const valid = tag === "@activity" ? validActivities : validStructures;
      for (const id of candidates) {
        if (!valid.has(id)) missing.push(`${label}.${record.id}: ${tag} ${id}`);
      }
    }
  }
  return missing;
}

test("kingdom data IDs and structured references are internally valid", () => {
  const structures = readJson("dist/structures.json");
  const activities = readJson("dist/kingdom-activities.json");
  const feats = readJson("dist/feats.json");
  const features = readJson("dist/features.json");
  const structureIds = new Set(structures.map((structure) => structure.id));
  const activityIds = new Set(activities.map((activity) => activity.id));
  const missing = [];

  assertUniqueIds(structures, "structure");
  assertUniqueIds(activities, "activity");
  assertUniqueIds(feats, "feat");
  assertUniqueIds(features, "feature");

  for (const structure of structures) {
    for (const id of structure.upgradeFrom ?? []) {
      if (!structureIds.has(id)) missing.push(`structures.${structure.id}: upgradeFrom ${id}`);
    }
    for (const id of structure.ignoreConsumptionReductionOf ?? []) {
      if (!structureIds.has(id)) missing.push(`structures.${structure.id}: ignoreConsumptionReductionOf ${id}`);
    }
    for (const id of structure.unlockActivities ?? []) {
      if (!activityIds.has(id)) missing.push(`structures.${structure.id}: unlockActivities ${id}`);
    }
    for (const rule of structure.activityBonusRules ?? []) {
      if (rule.activity && !activityIds.has(rule.activity)) {
        missing.push(`structures.${structure.id}: activityBonusRules ${rule.activity}`);
      }
    }
    for (const rule of structure.skillBonusRules ?? []) {
      if (rule.activity && !activityIds.has(rule.activity)) {
        missing.push(`structures.${structure.id}: skillBonusRules activity ${rule.activity}`);
      }
      if (rule.skill && !kingdomSkills.has(rule.skill)) {
        missing.push(`structures.${structure.id}: skillBonusRules ${rule.skill}`);
      }
      for (const skill of rule.skillIds ?? []) {
        if (!kingdomSkills.has(skill)) missing.push(`structures.${structure.id}: skillBonusRules ${skill}`);
      }
    }
    for (const rule of structure.construction?.skills ?? []) {
      if (rule.skill && !kingdomSkills.has(rule.skill)) {
        missing.push(`structures.${structure.id}: construction ${rule.skill}`);
      }
    }
    for (const skill of structure.construction?.skillIds ?? []) {
      if (!kingdomSkills.has(skill)) {
        missing.push(`structures.${structure.id}: construction ${skill}`);
      }
    }
  }

  missing.push(...collectMissingPredicateRefs(feats, "feats", activityIds, structureIds));
  missing.push(...collectMissingPredicateRefs(features, "features", activityIds, structureIds));
  missing.push(...collectMissingPredicateRefs(activities, "activities", activityIds, structureIds));

  assert.deepEqual(missing, []);
});

test("structure reference schema accepts every bundled structure rule", () => {
  const structures = readJson("dist/structures.json");
  const structureRefSchema = readJson("dist/schemas/structure-ref.json");
  const bundledStructureRefSchema = readBundledJsonModule("./kotlin/schemas/structure-ref.json");
  const structureIds = structures.map((structure) => structure.id).sort();
  const schemaRefs = [...structureRefSchema.$defs.Ref.properties.ref.enum].sort();
  const bundledSchemaRefs = [...bundledStructureRefSchema.$defs.Ref.properties.ref.enum].sort();

  assert.deepEqual(schemaRefs, structureIds);
  assert.deepEqual(bundledSchemaRefs, structureIds);
});

test("recipe and camping combat-effect UUIDs use the modern Item document type", () => {
  const recipes = readJson("dist/recipes.json");
  const mainJs = readFileSync(new URL("dist/main.js", moduleRoot), "utf8");
  const legacyUuid =
    /Compendium\.pf2e-kingmaker-tools\.kingmaker-tools-(?:meal|camping)-effects\.(?!Item\.)[A-Za-z0-9]+/g;

  const recipeLegacy = [];
  for (const recipe of recipes) {
    for (const uuid of collectUuidValues(recipe)) {
      if (legacyUuid.test(uuid)) recipeLegacy.push(`${recipe.id}: ${uuid}`);
      legacyUuid.lastIndex = 0;
      assert.match(
        uuid,
        /^Compendium\.pf2e-kingmaker-tools\.kingmaker-tools-meal-effects\.Item\.[A-Za-z0-9]+$/,
        `${recipe.id} meal UUID must include .Item.`,
      );
    }
  }
  assert.deepEqual(recipeLegacy, []);

  const mainLegacy = mainJs.match(legacyUuid) ?? [];
  assert.deepEqual(mainLegacy, [], "bundled main.js must not keep legacy meal/camping effect UUIDs");

  for (const id of [
    "ZKJlIqyFgbKDACnG", // enhance-weapons
    "PSBOS7ZEl9RGWBqD", // set-traps
    "KysTaC245mOnSnmE", // undead-guardians
    "LN6mH7Muj4hgvStt", // water-hazards
    "wojV4NiAOYsnfFby", // maintain-armor
  ]) {
    assert.match(
      mainJs,
      new RegExp(
        String.raw`Compendium\.pf2e-kingmaker-tools\.kingmaker-tools-camping-effects\.Item\.${id}`,
      ),
      `combat effect ${id} must use .Item.`,
    );
  }
});

test("recipe compendium UUIDs point at bundled meal-effect documents", { skip: !existsSync(classicLevelUrl) }, async () => {
  const recipes = readJson("dist/recipes.json");
  const bundledRecipes = readBundledJsonModule("./kotlin/recipes.json");
  const mealEffectIds = await readPackDocumentIds("packs/kingmaker-tools-meal-effects");
  const missing = [];

  assert.deepEqual(bundledRecipes, recipes);

  for (const recipe of recipes) {
    for (const uuid of collectUuidValues(recipe)) {
      const match = uuid.match(/^Compendium\.pf2e-kingmaker-tools\.kingmaker-tools-meal-effects\.Item\.([A-Za-z0-9]+)$/);
      if (!match) {
        missing.push(`${recipe.id}: malformed meal UUID ${uuid}`);
        continue;
      }
      if (!mealEffectIds.has(match[1])) missing.push(`${recipe.id}: ${uuid}`);
    }
  }

  assert.deepEqual(missing, []);
});

test("V&K 1.2 kingdom feat bonus types follow source text", () => {
  const feats = readJson("dist/feats.json");
  const byId = new Map(feats.map((feat) => [feat.id, feat]));

  function feat(id) {
    const record = byId.get(id);
    assert.ok(record, `missing feat ${id}`);
    return record;
  }

  function modifier(id, key) {
    const record = feat(id);
    const match = record.modifiers?.find((entry) => entry.name.includes(`.${key}.name`));
    assert.ok(match, `missing ${id}.${key}`);
    return match;
  }

  const expectedTypes = [
    ["civil-service", "newLeadership", "status"],
    ["crush-dissent", "bickering", "status"],
    ["fortified-fiefs-vk", "fortified", "circumstance"],
    ["fortified-fiefs-vk", "dangerousEvent", "status"],
    ["fortified-fiefs", "fortified", "circumstance"],
    ["fortified-fiefs", "dangerousEvent", "status"],
    ["insider-trading-vk", "businessInformation", "status"],
    ["insider-trading", "businessInformation", "status"],
    ["inspiring-entertainment", "talentedArtists", "status"],
    ["practical-magic-vk", "magicBonus", "status"],
    ["practical-magic-vk", "engineeringBonus", "circumstance"],
    ["practical-magic", "magicBonus", "status"],
    ["practical-magic", "engineeringBonus", "circumstance"],
    ["quick-recovery", "harmfulEvent", "status"],
  ];

  assert.deepEqual(
    expectedTypes.map(([id, key, type]) => [`${id}.${key}`, modifier(id, key).type]),
    expectedTypes.map(([id, key, type]) => [`${id}.${key}`, type]),
  );

  assert.equal(modifier("civil-service", "newLeadership").value, 2);
  assert.equal(modifier("crush-dissent", "bickering").value, 1);
  assert.equal(modifier("insider-trading", "businessInformation").value, 1);
  assert.equal(modifier("inspiring-entertainment", "talentedArtists").value, 2);
  assert.equal(modifier("quick-recovery", "harmfulEvent").value, 4);

  for (const id of ["fortified-fiefs-vk", "fortified-fiefs"]) {
    assert.equal(modifier(id, "fortified").value, 2);
    assert.equal(modifier(id, "dangerousEvent").value, 1);
  }

  for (const id of ["practical-magic-vk", "practical-magic"]) {
    assert.equal(modifier(id, "magicBonus").value, 1);
    assert.deepEqual(modifier(id, "engineeringBonus").valueExpression, {
      when: {
        default: 0,
        cases: [
          { case: [{ eq: ["@magicRank", 2] }, 1] },
          { case: [{ gte: ["@magicRank", 3] }, 2] },
        ],
      },
    });
  }

  assert.equal(feat("practical-magic").increaseUsableSkills, undefined);
});

test("removed V&K kingdom action IDs do not remain in bundled player-facing data", () => {
  const bundledData = [
    readJson("dist/kingdom-activities.json"),
    readJson("dist/feats.json"),
    readJson("dist/features.json"),
    readJson("dist/lang/en.json"),
    readJson("dist/lang/cn.json"),
  ];
  const found = [];

  for (const id of removedIds) {
    for (const [index, data] of bundledData.entries()) {
      if (JSON.stringify(data).includes(id)) found.push(`${id} in bundle ${index}`);
    }
  }

  assert.deepEqual(found, []);
});

test("module manifest references only bundled files and declared packs", () => {
  const manifest = readJson("module.json");
  const referencedFiles = [
    ...(manifest.scripts ?? []),
    ...(manifest.styles ?? []),
    ...(manifest.languages ?? []).map((language) => language.path),
    ...(manifest.packs ?? []).map((pack) => pack.path),
  ];
  const missingFiles = referencedFiles.filter((path) => !existsSync(new URL(path, moduleRoot)));
  const packNames = new Set((manifest.packs ?? []).map((pack) => pack.name));
  const undefinedPackFolderRefs = (manifest.packFolders ?? [])
    .flatMap((folder) => folder.packs ?? [])
    .filter((packName) => !packNames.has(packName));

  assert.deepEqual(missingFiles, []);
  assert.deepEqual(undefinedPackFolderRefs, []);
});

test("production bundle has no stray console debug logging", () => {
  const mainJs = readFileSync(new URL("dist/main.js", moduleRoot), "utf8");
  const debugLogs = mainJs
    .split(/\r?\n/)
    .map((line, index) => [index + 1, line.trim()])
    .filter(([, line]) => /^console\.log\(/.test(line))
    .map(([lineNumber, line]) => `${lineNumber}: ${line}`);

  assert.deepEqual(debugLogs, []);
});

test("production bundle references only bundled Handlebars templates", () => {
  const mainJs = readFileSync(new URL("dist/main.js", moduleRoot), "utf8");
  const templatePaths = [...new Set([...mainJs.matchAll(/["']([^"']+\.hbs)["']/g)].map((match) => match[1]))];
  const missingTemplates = templatePaths
    .filter((path) => !existsSync(new URL(`dist/${path}`, moduleRoot)))
    .sort();

  assert.deepEqual(missingTemplates, []);
});
