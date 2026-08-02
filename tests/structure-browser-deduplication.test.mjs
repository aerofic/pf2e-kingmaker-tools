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

class Npc {}

function structureActor({ id, ref, img, createdTime }) {
  return Object.assign(new Npc(), {
    id,
    img,
    flags: { "pf2e-kingmaker-tools": { structureData: { ref } } },
    _stats: { createdTime },
  });
}

function loadHelpers() {
  const context = {
    CONFIG: { PF2E: { Actor: { documentClasses: { npc: Npc } } } },
  };
  runInNewContext(
    `${extractFunction("getStructureImportRef")}
     ${extractFunction("kmStructureImportIdentity")}
     ${extractFunction("kmStructureActorCreatedTime")}
     ${extractFunction("kmPreferStructureActor")}
     ${extractFunction("kmDedupeImportedStructureActors")}
     ${extractFunction("filterVkPreferredStructureImports")}
     this.dedupeActors = kmDedupeImportedStructureActors;
     this.filterImports = filterVkPreferredStructureImports;`,
    context,
  );
  return context;
}

test("structure browser keeps the oldest actor for identical rule cards", () => {
  const { dedupeActors } = loadHelpers();
  const newerWall = structureActor({
    id: "new-wall",
    ref: "wall-wooden",
    img: "wall.webp",
    createdTime: 200,
  });
  const olderCustomizedWall = structureActor({
    id: "old-wall",
    ref: "wall-wooden",
    img: "wall.webp",
    createdTime: 100,
  });
  const waterfrontSide = structureActor({
    id: "waterfront-side",
    ref: "waterfront-vk",
    img: "waterfront-side.webp",
    createdTime: 100,
  });
  const waterfrontCorner = structureActor({
    id: "waterfront-corner",
    ref: "waterfront-vk",
    img: "waterfront-corner.webp",
    createdTime: 100,
  });

  const result = dedupeActors([newerWall, waterfrontSide, olderCustomizedWall, waterfrontCorner]);
  assert.deepEqual(
    Array.from(result, (actor) => actor.id),
    ["waterfront-side", "old-wall", "waterfront-corner"],
  );
});

test("structure import removes exact duplicates but preserves image variants", () => {
  const { filterImports } = loadHelpers();
  const data = [
    { id: "base", img: "hall.webp", flags: { "pf2e-kingmaker-tools": { structureData: { ref: "town-hall" } } } },
    { id: "vk", img: "hall.webp", flags: { "pf2e-kingmaker-tools": { structureData: { ref: "town-hall-vk" } } } },
    { id: "vk-copy", img: "hall.webp", flags: { "pf2e-kingmaker-tools": { structureData: { ref: "town-hall-vk" } } } },
    { id: "side", img: "waterfront-side.webp", flags: { "pf2e-kingmaker-tools": { structureData: { ref: "waterfront-vk" } } } },
    { id: "corner", img: "waterfront-corner.webp", flags: { "pf2e-kingmaker-tools": { structureData: { ref: "waterfront-vk" } } } },
  ];

  assert.deepEqual(
    Array.from(filterImports(data), (entry) => entry.id),
    ["vk", "side", "corner"],
  );
});
