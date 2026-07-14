import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const cn = JSON.parse(readFileSync(new URL("../dist/lang/cn.json", import.meta.url), "utf8"));
const root = cn["pf2e-kingmaker-tools"];

function allStrings(value) {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(allStrings);
}

test("Chinese kingdom terminology uses the approved mechanical terms", () => {
  assert.equal(root.enums.fameType, "美名/恶名类型");
  assert.equal(root.kingdom.maximumFamePoints, "最大美名/恶名点数");
  assert.equal(root.kingdom.rubble, "瓦砾");
  assert.equal(root.structures.rubble.name, "瓦砾");
  assert.equal(root.kingdom.wrapTextInParagraph, "文本应包裹在 <p></p> 元素中");
  assert.equal(root.kingdom.leadership, "领导行动");
});

test("Chinese resource-button messages preserve every runtime ICU selector", () => {
  const groups = root.resourceButton;
  for (const [groupName, entries] of Object.entries({
    resourceDice: groups.resourceDice,
    resource: groups.resource,
    resourceExpression: groups.resourceExpression,
  })) {
    for (const [key, value] of Object.entries(entries)) {
      assert.match(value, /\{location, select,/, `${groupName}.${key} needs location`);
      assert.match(value, /\{mode, select,/, `${groupName}.${key} needs mode`);
      if (groupName === "resource" && key === "event") continue;
      assert.match(value, /\{multiple, select,/, `${groupName}.${key} needs multiple`);
      assert.match(value, /\{turn, select,/, `${groupName}.${key} needs turn`);
      assert.match(value, groupName === "resourceExpression" ? /\{expression\}/ : /\{count\}/);
    }
  }
});

test("known P1 Chinese machine-translation artifacts stay removed", () => {
  const text = allStrings(root).join("\n");
  for (const artifact of [
    "你你的",
    "；；",
    "）。：",
    "下个王 国",
    "修复声誉",
    "Repair Reputation",
    "Relocate the Capital",
    "Relocate your Capital",
    "Negotiation DC ，",
    "资源骰资源骰",
    "索赔地块：大失败",
  ]) {
    assert.doesNotMatch(text, new RegExp(artifact));
  }
});
