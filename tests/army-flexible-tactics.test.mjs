import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const moduleRoot = new URL("../", import.meta.url);
const classicLevelUrl = new URL("../../foundryvtt-node-14.363/node_modules/classic-level/index.js", import.meta.url);
const packPath = "packs/kingmaker-tools-army-tactics";

async function readPack() {
  const { ClassicLevel } = await import(classicLevelUrl.href);
  const db = new ClassicLevel(fileURLToPath(new URL(packPath, moduleRoot)), {
    keyEncoding: "utf8",
    valueEncoding: "json",
  });
  await db.open();
  try {
    const documents = [];
    for await (const [key, value] of db.iterator()) {
      if (key.startsWith("!items!")) documents.push(value);
    }
    return documents;
  } finally {
    await db.close();
  }
}

test("counterattack tactic pack is public and included in the training browser", () => {
  const manifest = JSON.parse(readFileSync(new URL("module.json", moduleRoot), "utf8"));
  const main = readFileSync(new URL("dist/main.js", moduleRoot), "utf8");
  const pack = manifest.packs.find((entry) => entry.name === "kingmaker-tools-army-tactics");

  assert.ok(pack);
  assert.equal(pack.private, false);
  assert.ok(existsSync(fileURLToPath(new URL(pack.path, moduleRoot))));
  assert.match(main, /packs\.get\('pf2e-kingmaker-tools\.kingmaker-tools-army-tactics'\)/);
  assert.match(main, /destination_0\.n1\(applyVkArmyTacticOverrides\(moduleTactic\)\)/);
});

test("counterattack tactic grants only the official Counterattack action", async () => {
  const documents = await readPack();
  const tactic = documents.find((item) => item.system?.slug === "counterattack-tactics");

  assert.equal(documents.length, 1);
  assert.equal(tactic.name, "反击战术");
  assert.equal(tactic.system.level.value, 5);
  assert.deepEqual(tactic.system.traits.value, ["infantry", "skirmisher"]);
  assert.deepEqual(tactic.system.rules, [{
    key: "GrantItem",
    uuid: "Compendium.pf2e.kingmaker-features.Item.8wjiF3ctXUjP9oyX",
  }]);
  assert.match(tactic.system.description.value, /Compendium\.pf2e\.kingmaker-features\.Item\.8wjiF3ctXUjP9oyX/);
});

test("Flexible Tactics is sanitized without changing the PF2e system pack", () => {
  const main = readFileSync(new URL("dist/main.js", moduleRoot), "utf8");

  assert.match(main, /function isFlexibleArmyTactic\(tactic\)/);
  assert.match(main, /getArmyTacticSlug\(tactic\) === 'flexible-tactics'/);
  assert.match(main, /rule\.uuid !== 'Compendium\.pf2e\.kingmaker-features\.Item\.8wjiF3ctXUjP9oyX'/);
  assert.match(main, /G2eBcOnUHb3yT7JL/);
  assert.match(main, /Hi4LKGOKe6yMDOH5/);
  assert.match(main, /AOFU8pOTMjVdiyNd/);
  assert.match(main, /Hooks\.on\('preCreateItem'/);
  assert.match(main, /function applyCounterattackArmyActionOverride\(item\)/);
  assert.match(main, /applyCounterattackArmyActionOverride\(item\)/);
});
