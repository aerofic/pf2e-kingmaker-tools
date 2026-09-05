import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { readPackEntries } from "./helpers/pack-reader.mjs";

const root = new URL("../", import.meta.url);
function packHashes() {
  const pack = new URL("packs/kingmaker-tools-army-tactics/", root);
  return readdirSync(pack, { withFileTypes: true }).filter((entry) => entry.isFile())
    .map(({ name }) => [name, createHash("sha256").update(readFileSync(new URL(name, pack))).digest("hex")])
    .sort(([a], [b]) => a.localeCompare(b));
}

test("pack tests leave the original LevelDB files byte-for-byte unchanged", async () => {
  const before = packHashes();
  const entries = await readPackEntries("packs/kingmaker-tools-army-tactics");
  assert.ok(entries.some(([key]) => key.startsWith("!items!")));
  assert.deepEqual(packHashes(), before);
});

test("pack reader rejects paths outside the module packs directory", async () => {
  await assert.rejects(readPackEntries("../"), /inside the module packs/);
  await assert.rejects(readPackEntries("packs/"), /inside the module packs/);
  await assert.rejects(readPackEntries("dist/"), /inside the module packs/);
});

test("local and release testing use the same complete serial test entrypoint", () => {
  const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
  const runner = readFileSync(new URL("scripts/test.mjs", root), "utf8");
  const workflow = readFileSync(new URL(".github/workflows/release.yml", root), "utf8");
  assert.equal(pkg.scripts.test, "node scripts/test.mjs");
  assert.equal(pkg.devDependencies["classic-level"], "3.0.0");
  assert.match(runner, /recursive: true/);
  assert.match(runner, /endsWith\("\.test\.mjs"\)/);
  assert.match(runner, /--test-concurrency=1/);
  assert.match(runner, /process\.exitCode = result\.status \?\? 1/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm test/);
  assert.doesNotMatch(workflow, /node --test tests\//);
  for (const entry of readdirSync(new URL("tests/", root)).filter((name) => name.endsWith(".test.mjs"))) {
    const source = readFileSync(new URL(`tests/${entry}`, root), "utf8");
    assert.doesNotMatch(source, /foundryvtt-node-[0-9]/i, entry);
    assert.doesNotMatch(source, /skip:\s*!existsSync\(classicLevelUrl\)/, entry);
  }
});
