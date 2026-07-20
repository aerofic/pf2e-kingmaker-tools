import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mainJs = readFileSync(new URL("../dist/main.js", import.meta.url), "utf8");

test("camping token movement falls back from Zone NN to the configured region index", () => {
  assert.match(
    mainJs,
    /Try to find zone by index if name match fails/,
    "missing fallback marker copied from the v13 customization",
  );
  assert.match(
    mainJs,
    /var zName = "Zone " \+ zoneId;/,
    "missing Zone NN name reconstruction",
  );
  assert.match(
    mainJs,
    /zoneNames\.e2\(zName\) \|\| zoneNames\.e2\(localizedZoneName\)/,
    "missing localized Zone NN fallback for Chinese region labels",
  );
  assert.match(
    mainJs,
    /tmp\$ret\$7 = tmp0\[i\];/,
    "missing assignment of the configured region at the matching Zone index",
  );
  assert.match(
    mainJs,
    /var hexScene = \$game\.scenes\.get\('AJ1k5II28u72JOmz'\);[\s\S]*?tmp_0 = true;/,
    "hex map scene must remain fixed without requiring it to be the currently viewed scene",
  );
});
