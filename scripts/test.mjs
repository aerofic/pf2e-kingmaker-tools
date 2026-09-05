import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const tests = readdirSync(new URL("tests/", root), { recursive: true })
  .filter((name) => name.endsWith(".test.mjs"))
  .sort()
  .map((name) => fileURLToPath(new URL(`tests/${name.replaceAll("\\", "/")}`, root)));
if (!tests.length) throw new Error("No regression tests found");
console.log(`Running all ${tests.length} regression test files (serially).`);
const result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...tests], {
  cwd: fileURLToPath(root), stdio: "inherit",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
