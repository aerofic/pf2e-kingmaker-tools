import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const moduleRoot = new URL("../", import.meta.url);
const mainJs = readFileSync(new URL("dist/main.js", moduleRoot), "utf8");

function extractFunction(name) {
  const start = mainJs.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing function ${name}`);

  const braceStart = mainJs.indexOf("{", start);
  let depth = 0;
  for (let index = braceStart; index < mainJs.length; index += 1) {
    if (mainJs[index] === "{") depth += 1;
    if (mainJs[index] === "}") depth -= 1;
    if (depth === 0) return mainJs.slice(start, index + 1);
  }

  assert.fail(`unterminated function ${name}`);
}

function extractClass(name) {
  const start = mainJs.indexOf(`class ${name} `);
  assert.notEqual(start, -1, `missing class ${name}`);

  const braceStart = mainJs.indexOf("{", start);
  let depth = 0;
  for (let index = braceStart; index < mainJs.length; index += 1) {
    if (mainJs[index] === "{") depth += 1;
    if (mainJs[index] === "}") depth -= 1;
    if (depth === 0) return mainJs.slice(start, index + 1);
  }

  assert.fail(`unterminated class ${name}`);
}

test("migration shape guards distinguish legacy and already-migrated data", () => {
  const context = {};
  runInNewContext(
    `${extractFunction("kmMigrationIsRecord")}
     ${extractFunction("kmMigrationLegacyArrayOrNull")}
     ${extractFunction("kmMigrationLegacyCostOrNull")}
     this.legacyArray = kmMigrationLegacyArrayOrNull;
     this.legacyCost = kmMigrationLegacyCostOrNull;`,
    context,
  );

  const legacyArray = [1, 2];
  assert.equal(context.legacyArray(legacyArray, "activities"), legacyArray);
  assert.equal(context.legacyArray({ activity: {} }, "activities"), null);
  assert.throws(() => context.legacyArray(null, "activities"), /legacy array or a migrated record/);

  assert.equal(context.legacyCost("2 gp", "cost"), "2 gp");
  assert.equal(context.legacyCost({ currency: "gp", value: 2 }, "cost"), null);
  assert.throws(() => context.legacyCost({ currency: "gp" }, "cost"), /legacy string or a migrated cost record/);
});

test("non-idempotent migrations use shape guards and preserve existing defaults", () => {
  assert.match(mainJs, /kmMigrationLegacyCostOrNull\(item\.cost, 'camping\.cooking\.homebrewMeals\.cost'\)/);
  assert.match(mainJs, /kmMigrationLegacyArrayOrNull\(camping\.campingActivities, 'camping\.campingActivities'\)/);
  assert.match(mainJs, /kmMigrationLegacyArrayOrNull\(camping\.cooking\.results, 'camping\.cooking\.results'\)/);
  assert.match(mainJs, /kmMigrationLegacyArrayOrNull\(camping\.cooking\.actorMeals, 'camping\.cooking\.actorMeals'\)/);
  assert.match(mainJs, /if \(camping\.forcedMarchActive == null\)/);
  assert.match(mainJs, /if \(camping\.secondsSpentForcedMarching == null\)/);
  assert.match(mainJs, /if \(camping\.hexSizeInMiles == null\)/);
});

test("Migration 20 can run again against migrated records without changing them", () => {
  const context = {
    _kotlin_kotlin_stdlib_mjs__WEBPACK_IMPORTED_MODULE_2__: {
      VOID3gxj6tk5isa35: undefined,
      Unit_instancev9v8hjid95df: {},
    },
  };
  runInNewContext(
    `${extractFunction("kmMigrationIsRecord")}
     ${extractFunction("kmMigrationLegacyArrayOrNull")}
     ${extractClass("Migration")}
     ${extractClass("Migration20")}
     this.Migration20 = Migration20;`,
    context,
  );

  const camping = {
    campingActivities: { watch: { actorUuid: "Actor.one" } },
    cooking: {
      results: { stew: { result: "success", skill: "survival" } },
      actorMeals: { one: { actorUuid: "Actor.one", chosenMeal: "stew" } },
    },
    forcedMarchActive: true,
    secondsSpentForcedMarching: 600,
    hexSizeInMiles: 6,
  };
  const before = structuredClone(camping);
  const result = new context.Migration20().c62({}, camping, null).next();

  assert.equal(result.done, true);
  assert.deepEqual(camping, before);
});

test("migration runner checkpoints every completed version and hides schemaVersion", () => {
  assert.match(
    mainJs,
    /yield\* element_0\.y61\(_this__u8e3s4, \$completion\);\s*yield\* get_pfrpg2eKingdomCampingWeather\(_this__u8e3s4\.settings\)\.t61\(element_0\.u61_1, \$completion\);/,
  );
  assert.match(
    mainJs,
    /registerInt\(tmp0_\$receiver, 'schemaVersion',[\s\S]*?VOID3gxj6tk5isa35, true\);/,
  );
});
