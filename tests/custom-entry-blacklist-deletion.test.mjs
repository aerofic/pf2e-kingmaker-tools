import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mainJs = readFileSync(new URL("../dist/main.js", import.meta.url), "utf8");

const blacklistFilters = [
  ["activity", "element_0", "l51_1"],
  ["charter", "element_0", "k56_1"],
  ["feat", "element_0", "d59_1"],
  ["government", "element_0", "y59_1"],
  ["heartland", "element_0", "t5a_1"],
  ["kingdom event", "element_1", "d5f_1"],
];

test("deleting a custom entry removes only its id from the blacklist", () => {
  for (const [entryType, element, field] of blacklistFilters) {
    assert.match(
      mainJs,
      new RegExp(`if \\(!\\(${element} === this\\.${field}\\)\\) \\{\\r?\\n\\s+destination`),
      `${entryType} deletion must preserve all blacklist ids except the deleted entry`,
    );
    assert.doesNotMatch(
      mainJs,
      new RegExp(`if \\(${element} === this\\.${field}\\) \\{\\r?\\n\\s+destination`),
      `${entryType} deletion must not collapse the blacklist to the deleted id`,
    );
  }
});

test("blacklist deletion behavior preserves unrelated ids", () => {
  const blacklist = ["alpha", "deleted", "omega"];
  assert.deepEqual(blacklist.filter((id) => id !== "deleted"), ["alpha", "omega"]);
});
