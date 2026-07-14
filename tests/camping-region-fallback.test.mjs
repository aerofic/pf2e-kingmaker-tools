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
    /var zName = "Zone " \+ \(i < 10 \? "0" \+ i : "" \+ i\);/,
    "missing Zone NN name reconstruction",
  );
  assert.match(
    mainJs,
    /if \(zoneNames\.e2\(zName\)\) \{/,
    "missing v14 set-membership check against generated Zone NN names",
  );
  assert.match(
    mainJs,
    /tmp\$ret\$7 = tmp0\[i\];/,
    "missing assignment of the configured region at the matching Zone index",
  );
});
