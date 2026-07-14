import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mainJs = readFileSync(new URL("../dist/main.js", import.meta.url), "utf8");

test("recruitable armies include actors in descendant folders", () => {
  assert.match(
    mainJs,
    /function getRecruitableArmies\$lambda_0\(\$folder\) \{[\s\S]*?return isFolderOrDescendant\(it\.folder, \$folder\.id\);[\s\S]*?\n\}/,
  );
  assert.doesNotMatch(
    mainJs,
    /function getRecruitableArmies\$lambda_0\(\$folder\) \{[\s\S]*?tmp0_safe_receiver\.id\) == \$folder\.id;/,
  );
});
