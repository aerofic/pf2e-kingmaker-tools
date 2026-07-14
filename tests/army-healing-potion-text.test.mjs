import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const moduleRoot = new URL("../", import.meta.url);
const cn = JSON.parse(readFileSync(new URL("dist/lang/cn.json", moduleRoot), "utf8"));

test("army healing potions are described as a single-action maneuver", () => {
  const description = cn["PF2E.Kingmaker"].Army.Gear.Potions.Description;

  assert.match(description, /将使用一剂药水作为一个单动作机动动作/);
  assert.doesNotMatch(description, /作为机动(?:（Maneuver）)?动作的(?:一个)?部分/);
});
