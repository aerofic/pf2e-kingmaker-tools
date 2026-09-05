import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const moduleRoot = new URL("../", import.meta.url);
import { readPackEntries } from "./helpers/pack-reader.mjs";
const defaultTokenImage = "systems/pf2e/icons/default-icons/mystery-man.svg";
const customStructureImages = [
  "Bridge, Stone.webp",
  "Bridge.webp",
  "City Watch.png",
  "Fishing Fleets.webp",
  "Gladiatorial Arena.webp",
  "Information Department.png",
  "Magical Streetlamps.webp",
  "Oddity Emporium.png",
  "Paved Streets.webp",
  "Planning Department.png",
  "Planning Office.png",
  "Printing House.webp",
  "Public Forum.png",
  "Publicity Office.png",
  "Sewer System.webp",
  "Town Square.png",
  "Town Watch.png",
  "Wall, Stone.webp",
  "Wall, Wooden.webp",
];
const shoppingUnlockExpectations = [
  { id: "smithy-vk", cn: "金属装备", en: "metallic equipment" },
  { id: "smithy", cn: "金属装备", en: "metallic equipment" },
  { id: "foundry", cn: "金属装备", en: "metallic equipment" },
  { id: "specialized-artisan", cn: "符文、护符/饰品", en: "runes and amulets/accessories" },
  { id: "tannery", cn: "皮革装备", en: "leather equipment" },
  { id: "arcanists-tower", cn: "卷轴/魔杖/法杖", en: "scrolls/wands/staves" },
  { id: "library-vk", cn: "典籍", en: "tomes" },
  { id: "library", cn: "典籍", en: "tomes" },
  { id: "academy", cn: "典籍", en: "tomes" },
  { id: "university", cn: "典籍", en: "tomes" },
  { id: "alchemy-laboratory", cn: "炼金物品", en: "alchemical items" },
  { id: "lumberyard", cn: "木制物品", en: "wooden items" },
  { id: "general-store", cn: "其他物品", en: "other items" },
  { id: "marketplace", cn: "其他物品", en: "other items" },
];

async function readStructureActors() {
  return (await readPackEntries("packs/kingmaker-tools-structures")).map(([key, actor]) => ({ key, actor }));
}

function localModulePath(src) {
  if (!src?.startsWith("modules/") || src.includes("{")) return null;

  const [, moduleId, ...rest] = src.split("/");
  const decoded = decodeURIComponent(rest.join("/"));
  if (moduleId === "pf2e-kingmaker-tools") return fileURLToPath(new URL(decoded, moduleRoot));
  return null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function webpHasAlpha(bytes) {
  if (!bytes.subarray(0, 4).equals(Buffer.from("RIFF")) || !bytes.subarray(8, 12).equals(Buffer.from("WEBP"))) {
    return false;
  }

  for (let offset = 12; offset + 8 <= bytes.length;) {
    const id = bytes.toString("ascii", offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;

    if (id === "ALPH") return true;
    if (id === "VP8X") return (bytes[dataOffset] & 0x10) !== 0;
    if (id === "VP8L") {
      return bytes[dataOffset] === 0x2f && ((bytes.readUInt32LE(dataOffset + 1) >>> 28) & 1) === 1;
    }

    offset = dataOffset + length + (length % 2);
  }

  return false;
}

function pngHasAlpha(bytes) {
  if (!bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return false;
  }

  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const dataOffset = offset + 8;
    if (type === "IHDR") {
      const colorType = bytes[dataOffset + 9];
      return colorType === 4 || colorType === 6;
    }
    offset = dataOffset + length + 4;
  }

  return false;
}

test("bundled structure image paths resolve after URL decoding", async () => {
  const actors = await readStructureActors();
  const missing = [];

  for (const { actor } of actors) {
    for (const src of [actor.img, actor.prototypeToken?.texture?.src]) {
      if (!src?.startsWith("modules/pf2e-kingmaker-tools/")) continue;
      const localPath = localModulePath(src);
      if (!localPath || !existsSync(localPath)) missing.push(`${actor.name}: ${src}`);
    }
  }

  assert.deepEqual(missing, []);
});

test("structure actor token images match portrait images", async () => {
  const mismatches = (await readStructureActors())
    .map(({ actor }) => ({
      name: actor.name,
      ref: actor.flags?.["pf2e-kingmaker-tools"]?.structureData?.ref,
      img: actor.img,
      token: actor.prototypeToken?.texture?.src,
    }))
    .filter(({ ref, img, token }) => ref && img !== token)
    .map(({ name, ref, img, token }) => `${ref} (${name}): portrait=${img}, token=${token}`)
    .sort();

  assert.deepEqual(mismatches, []);
});

test("custom structure images are bundled artwork rather than text placeholders", () => {
  const invalid = customStructureImages.flatMap((fileName) => {
    const fileUrl = new URL(`img/structures/${encodeURIComponent(fileName)}`, moduleRoot);
    const filePath = fileURLToPath(fileUrl);
    const exists = existsSync(filePath);
    if (!exists) return [`${fileName}: missing`];

    const imageBytes = readFileSync(filePath);
    const size = statSync(filePath).size;
    const extension = fileName.split(".").pop();
    if (extension === "png") {
      return size > 100_000 && pngHasAlpha(imageBytes) ? [] : [`${fileName}: invalid transparent PNG artwork asset`];
    }

    const header = imageBytes.subarray(0, 12).toString("ascii");
    const isWebp = header.startsWith("RIFF") && header.endsWith("WEBP");
    return isWebp && size > 100_000 && webpHasAlpha(imageBytes)
      ? []
      : [`${fileName}: invalid transparent WebP artwork asset`];
  });

  assert.deepEqual(invalid, []);
});

test("V&K structure actors do not use the default mystery token image", async () => {
  const actors = await readStructureActors();
  const defaultTokenActors = actors
    .map(({ actor }) => actor)
    .filter((actor) => /\(V&K\)$/.test(actor.name ?? ""))
    .filter((actor) => actor.prototypeToken?.texture?.src === defaultTokenImage)
    .map((actor) => actor.name)
    .sort();

  assert.deepEqual(defaultTokenActors, []);
});

test("structure pack actor refs point at existing structure rules", async () => {
  const structureIds = new Set(
    JSON.parse(readFileSync(new URL("dist/structures.json", moduleRoot), "utf8")).map((structure) => structure.id),
  );
  const actors = await readStructureActors();
  const missing = actors
    .map(({ actor }) => ({
      name: actor.name,
      ref: actor.flags?.["pf2e-kingmaker-tools"]?.structureData?.ref,
    }))
    .filter(({ ref }) => ref && !structureIds.has(ref))
    .map(({ name, ref }) => `${name}: ${ref}`)
    .sort();

  assert.deepEqual(missing, []);
});

test("shopping unlock structure actors document their unlocked item categories", async () => {
  const actorByRef = new Map(
    (await readStructureActors()).map(({ actor }) => [actor.flags?.["pf2e-kingmaker-tools"]?.structureData?.ref, actor]),
  );

  for (const { id, cn, en } of shoppingUnlockExpectations) {
    const actor = actorByRef.get(id);
    assert.ok(actor, `missing structure actor ${id}`);
    const notes = actor.system?.details?.publicNotes ?? "";
    assert.doesNotMatch(notes, /<strong>\?{2,}<\/strong>/, `${id} should not contain corrupted shopping unlock text`);

    if (/[\u4e00-\u9fff]/u.test(notes)) {
      assert.match(notes, /购物解锁/, `${id} Chinese actor notes should mention shopping unlocks`);
      assert.match(notes, new RegExp(escapeRegExp(cn)), `${id} Chinese actor notes should mention ${cn}`);
    } else {
      assert.match(notes, /Shopping Unlock/, `${id} English actor notes should mention shopping unlocks`);
      assert.match(notes, new RegExp(escapeRegExp(en)), `${id} English actor notes should mention ${en}`);
    }
  }
});

test("selected structure actor levels match the V&K 1.2 structure rules", async () => {
  const structureRules = new Map(
    JSON.parse(readFileSync(new URL("dist/structures.json", moduleRoot), "utf8")).map((structure) => [
      structure.id,
      structure,
    ]),
  );
  const actorByRef = new Map(
    (await readStructureActors()).map(({ actor }) => [actor.flags?.["pf2e-kingmaker-tools"]?.structureData?.ref, actor]),
  );

  for (const [ref, expectedLevel] of [
    ["luxury-store", 8],
    ["temple", 5],
    ["orphanage", 2],
  ]) {
    assert.equal(structureRules.get(ref)?.level, expectedLevel, `${ref} structure rule level`);
    assert.equal(actorByRef.get(ref)?.system?.details?.level?.value, expectedLevel, `${ref} actor level`);
  }
});

test("Occult Shop actor notes use the V&K 1.2 construction cost", async () => {
  const actorByRef = new Map(
    (await readStructureActors()).map(({ actor }) => [actor.flags?.["pf2e-kingmaker-tools"]?.structureData?.ref, actor]),
  );

  for (const ref of ["occult-shop", "occult-shop-vk"]) {
    const notes = actorByRef.get(ref)?.system?.details?.publicNotes ?? "";
    assert.match(notes, /68 RP/, `${ref} should show 68 RP`);
    assert.doesNotMatch(notes, /38 RP/, `${ref} should not show 38 RP`);
  }
});

test("V&K 1.2 added structure actors use Chinese display names", async () => {
  const expectedNames = new Map([
    ["town-watch", "城镇守望"],
    ["town-square", "城镇广场"],
    ["planning-office", "规划办公室"],
    ["publicity-office", "宣传办公室"],
    ["oddity-emporium", "异物商铺"],
    ["city-watch", "城市守望"],
    ["public-forum", "公共论坛"],
    ["planning-department", "规划部门"],
    ["information-department", "信息部门"],
  ]);
  const byRef = new Map(
    (await readStructureActors()).map(({ actor }) => [actor.flags?.["pf2e-kingmaker-tools"]?.structureData?.ref, actor]),
  );

  for (const [ref, expectedName] of expectedNames) {
    const actor = byRef.get(ref);
    assert.ok(actor, `missing structure actor ${ref}`);
    assert.equal(actor.name, expectedName);
    assert.equal(actor.prototypeToken?.name, expectedName);
  }
});

test("V&K 1.2 added structure actors use Chinese descriptions", async () => {
  const expectedRefs = [
    "town-watch",
    "town-square",
    "planning-office",
    "publicity-office",
    "oddity-emporium",
    "city-watch",
    "public-forum",
    "planning-department",
    "information-department",
  ];
  const byRef = new Map(
    (await readStructureActors()).map(({ actor }) => [actor.flags?.["pf2e-kingmaker-tools"]?.structureData?.ref, actor]),
  );
  const remainingEnglish = [];

  for (const ref of expectedRefs) {
    const actor = byRef.get(ref);
    assert.ok(actor, `missing structure actor ${ref}`);
    assert.match(actor.system.details.blurb, /建筑|基础设施/);
    assert.match(actor.system.details.publicNotes, /<strong>地段<\/strong>/);
    assert.match(actor.system.details.publicNotes, /<strong>花费<\/strong>/);
    assert.match(actor.system.details.publicNotes, /<strong>建造<\/strong>/);
    assert.match(actor.system.details.publicNotes, /<strong>效果<\/strong>/);

    const stripped = `${actor.system.details.blurb}\n${actor.system.details.publicNotes}`.replace(/<[^>]*>/g, " ");
    const words = (stripped.match(/[A-Za-z]{4,}/g) ?? []).filter((word) => !["span", "strong"].includes(word));
    const allowed = new Set(["Lumber"]);
    const unexpected = words.filter((word) => !allowed.has(word));
    if (unexpected.length) remainingEnglish.push(`${ref}: ${unexpected.slice(0, 8).join(", ")}`);
  }

  assert.deepEqual(remainingEnglish, []);
});

test("V&K civic government structure actors do not retain old rule text", async () => {
  const byRef = new Map(
    (await readStructureActors()).map(({ actor }) => [actor.flags?.["pf2e-kingmaker-tools"]?.structureData?.ref, actor]),
  );

  for (const id of ["town-hall-vk", "castle-vk", "palace-vk"]) {
    const actor = byRef.get(id);
    assert.ok(actor, `missing structure actor ${id}`);
    assert.match(actor.system.details.blurb, /\bCivic\b/);
    assert.doesNotMatch(actor.system.details.publicNotes, /PC leaders.*3|instead of the usual 2/i);
  }

  assert.doesNotMatch(byRef.get("town-hall-vk").system.details.publicNotes, /first time you build a Town Hall.*reduce Unrest/i);
  assert.doesNotMatch(byRef.get("palace-vk").system.details.publicNotes, /noble villa/i);
  assert.match(byRef.get("palace-vk").system.details.publicNotes, /建筑场/);
  assert.match(byRef.get("palace-vk").system.details.publicNotes, /这些定居点行动若用于区域活动/);
});

test("structure import button keeps V&K replacements and skips superseded originals", async () => {
  const actors = (await readStructureActors()).map(({ actor }) => actor);
  const refs = new Set(actors.map((actor) => actor.flags?.["pf2e-kingmaker-tools"]?.structureData?.ref).filter(Boolean));
  const importedRefs = actors
    .map((actor) => actor.flags?.["pf2e-kingmaker-tools"]?.structureData?.ref)
    .filter((ref) => ref && (ref.endsWith("-vk") || !refs.has(`${ref}-vk`)))
    .sort();
  const uniqueImportedRefs = [...new Set(importedRefs)];
  const supersededOriginals = [...refs]
    .filter((ref) => !ref.endsWith("-vk") && refs.has(`${ref}-vk`))
    .sort();

  assert.equal(importedRefs.length, 89);
  assert.equal(uniqueImportedRefs.length, 88);
  assert.equal(uniqueImportedRefs.filter((ref) => ref.endsWith("-vk")).length, 21);
  assert.equal(supersededOriginals.length, 20);
  assert.deepEqual(importedRefs.filter((ref) => supersededOriginals.includes(ref)), []);
  assert.ok(importedRefs.includes("fishing-fleets-vk"));
  assert.ok(importedRefs.includes("academy"));
  assert.ok(!importedRefs.includes("town-hall"));
  assert.ok(importedRefs.includes("town-hall-vk"));
  for (const ref of [
    "town-watch",
    "town-square",
    "planning-office",
    "publicity-office",
    "oddity-emporium",
    "city-watch",
    "public-forum",
    "planning-department",
    "information-department",
  ]) {
    assert.ok(importedRefs.includes(ref), `imported refs should include ${ref}`);
  }
});
