import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const moduleRoot = new URL("../", import.meta.url);
const mainJs = readFileSync(new URL("dist/main.js", moduleRoot), "utf8");
const template = readFileSync(
  new URL("dist/applications/kingdom/sections/settlements/page.hbs", moduleRoot),
  "utf8",
);
const stylesheet = readFileSync(
  new URL("dist/applications/kingdom/kingdom-sheet.css", moduleRoot),
  "utf8",
);

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

test("settlement list exposes one mayor drop target and clear control per row", () => {
  assert.match(template, /localizeKM "kingdom\.mayor"/);
  assert.match(template, /class="km-settlement-mayor" data-settlement-id="\{\{id\}\}"/);
  assert.match(template, /fa-solid fa-user-plus/);
  assert.match(template, /data-action="clear-settlement-mayor"/);
  assert.doesNotMatch(template, /isGM|isGm|canEditMayor/);
  assert.match(stylesheet, /\.km-settlement-mayor-empty[\s\S]*?border: 1px dashed currentColor/);
});

test("mayors persist outside settlement scene data and are cleaned up with settlements", () => {
  assert.match(mainJs, /activeSettlement: null, settlementMayors: \{\}/);
  assert.match(mainJs, /function kmGetSettlementMayors\(kingdom\)/);
  assert.match(mainJs, /kmRemoveSettlementMayor\(kingdom, this\.a5r_1\);/);
  assert.match(mainJs, /mayors\[settlementSceneId\] = null;\s*kingdom\.settlementMayors = mayors;/);
  assert.match(mainJs, /await kmWriteSettlementMayorFlag\(kingdomActor, settlementSceneId, mayorActorUuid\);/);
});

test("clearing a mayor uses Foundry's explicit nested-key deletion syntax", () => {
  const context = {};
  runInNewContext(
    `${extractFunction("kmSettlementMayorFlagUpdate")}; this.flagUpdate = kmSettlementMayorFlagUpdate;`,
    context,
  );

  assert.deepEqual(
    { ...context.flagUpdate("scene123", null) },
    { "flags.pf2e-kingmaker-tools.kingdom-sheet.settlementMayors.-=scene123": null },
  );
  assert.deepEqual(
    { ...context.flagUpdate("scene123", "Actor.mayor123") },
    { "flags.pf2e-kingmaker-tools.kingdom-sheet.settlementMayors.scene123": "Actor.mayor123" },
  );
  assert.doesNotMatch(
    extractFunction("kmApplySettlementMayorUpdate"),
    /setFlag\('pf2e-kingmaker-tools', 'kingdom-sheet'/,
  );
});

test("missing, deleted, non-world, and unsupported actors resolve as no mayor", () => {
  const context = {
    kmIsValidSettlementMayorActor: (actor) =>
      actor != null && (actor.type === "character" || actor.type === "npc"),
  };
  runInNewContext(`${extractFunction("kmResolveSettlementMayor")}; this.resolveMayor = kmResolveSettlementMayor;`, context);

  const actors = new Map([
    ["character", { type: "character", name: "Character Mayor" }],
    ["npc", { type: "npc", name: "NPC Mayor" }],
    ["army", { type: "army", name: "Invalid Mayor" }],
  ]);
  const game = { actors: { get: (id) => actors.get(id) } };

  assert.equal(context.resolveMayor(game, { settlement: "Actor.character" }, "settlement")?.name, "Character Mayor");
  assert.equal(context.resolveMayor(game, { settlement: "Actor.npc" }, "settlement")?.name, "NPC Mayor");
  assert.equal(context.resolveMayor(game, { settlement: "Actor.deleted" }, "settlement"), null);
  assert.equal(context.resolveMayor(game, { settlement: "Actor.army" }, "settlement"), null);
  assert.equal(context.resolveMayor(game, { settlement: "Compendium.pack.Actor.id" }, "settlement"), null);
  assert.equal(context.resolveMayor(game, {}, "settlement"), null);
});

test("Settlement Council uses the higher of settlement and mayor level", () => {
  const context = {};
  runInNewContext(
    `${extractFunction("kmSettlementCouncilEffectiveLevel")}; this.effectiveLevel = kmSettlementCouncilEffectiveLevel;`,
    context,
  );

  assert.equal(context.effectiveLevel(3, null), 3);
  assert.equal(context.effectiveLevel(3, 8), 8);
  assert.equal(context.effectiveLevel(10, 4), 10);
  assert.equal(context.effectiveLevel(null, 12), null);
  assert.match(mainJs, /kmSettlementMayorLevel\(settlementMayor\)/);
  assert.match(mainJs, /calculateLeadershipBonus\(actor\.b3d_1, actor\.c3d_1,/);
});

test("active-leader and check-dialog labels share the mayor-backed council formatter", () => {
  assert.match(mainJs, /var settlementCouncilLabel = kmSettlementCouncilLabel\(kingdom, settlements\.g4y_1\);/);
  assert.match(mainJs, /new SelectOption\(settlementCouncilLabel, 'settlementCouncil'\)/);
  assert.match(
    mainJs,
    /new SelectOption\(kmSettlementCouncilLabel\(this\.c5e_1\.e5d_1, this\.c5e_1\.l5d_1\.g4y_1\), Leader_RULER_getInstance\(\)\.p3\(\)\)/,
  );
  assert.match(mainJs, /t_0\('kingdom\.settlementMayorLeaderLabel'\)/);
});

test("all-user writes are validated and routed through an active GM when needed", () => {
  assert.match(mainJs, /kingdomActor\.canUserModify\(game\.user, 'update'\)/);
  assert.match(mainJs, /return game\.users != null && game\.users\.activeGM != null;/);
  assert.match(mainJs, /game\.socket\.emit\('module\.pf2e-kingmaker-tools'/);
  assert.match(mainJs, /requestingUser\.active !== true/);
  assert.match(mainJs, /game\.user\.isGM !== true \|\| !isFirstGM\(game\)/);
  assert.match(mainJs, /kmIsValidSettlementMayorActor\(actor\)/);
  assert.match(mainJs, /kingdom\.settlements\.some\(\(settlement\) => settlement\.sceneId === settlementSceneId\)/);
});

test("settlement table context resolves mayor data from the kingdom map", () => {
  assert.match(mainJs, /toContext_23\(tmp53_\$receiver, tmp54_game, tmp54_settlementMayors,/);
  assert.match(mainJs, /var tmp2_mayor = kmSettlementMayorContext\(game, settlementMayors, parsed\.p3g_1\);/);
  assert.match(mainJs, /\{id: tmp2_id, mayor: tmp2_mayor,/);
});
