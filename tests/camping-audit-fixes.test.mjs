import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const moduleRoot = new URL("../", import.meta.url);
const main = readFileSync(new URL("dist/main.js", moduleRoot), "utf8");

test("camping GM socket actions authenticate the server-provided sender and target ownership", () => {
  assert.match(main, /return \(message, senderUserId\) => \{/);
  assert.match(main, /__kmSenderUserId: senderUserId/);
  assert.match(main, /receivedViaSocket && kmActionRequester\(this\.f3s_1, action\) == null/);
  assert.match(main, /kmCanActionUpdate\(campingActor, requester\)/);
  assert.match(main, /kmCanActionUpdate\(actor, requester\)/);
});

test("camping writes are serialized and full snapshots are diffed against the latest actor flag", () => {
  assert.match(main, /var kmCampingWriteQueues = new WeakMap\(\);/);
  assert.match(main, /previous\.catch\(\(\) => undefined\)\.then\(write\)/);
  assert.match(main, /var current = getAppFlag\(_this__u8e3s4, 'camping-sheet'\) \|\| \{\};/);
  assert.match(main, /foundry\.utils\.diffObject\(current, data\)/);
});

test("camping rest is first-GM-authoritative and rejects duplicate stale requests", () => {
  assert.match(main, /var kmCampingRestSocketAction = 'startCampingRest';/);
  assert.match(main, /function registerCampingRestSocket\(dispatcher\)/);
  assert.match(main, /registerCampingRestSocket\(actionDispatcher\);/);
  assert.match(main, /senderUserId !== data\.requestingUserId/);
  assert.match(main, /requester == null \|\| requester\.active !== true/);
  assert.match(main, /kmCanActionUpdate\(campingActor, requester\)/);
  assert.match(main, /var expectedRestOperationVersion = kmCampingRestOperationVersion\(camping\);/);
  assert.match(main, /data\.continuing !== \(camping\.watchSecondsRemaining > 0\)/);

  const requestSource = main.slice(
    main.indexOf("function kmRequestCampingRest("),
    main.indexOf("async function kmApplyCampingRestRequest("),
  );
  const applySource = main.slice(
    main.indexOf("async function kmApplyCampingRestRequest("),
    main.indexOf("function registerCampingRestSocket("),
  );

  assert.doesNotMatch(requestSource, /game\.user\.isGM/, "party owners must be able to request rest from the first GM");
  assert.doesNotMatch(applySource, /requester\.isGM/, "the receiving GM must authorize party owners by document permission");

  const restSource = main.slice(
    main.indexOf("function *rest(game, dispatcher, campingActor"),
    main.indexOf("function getRestSecondsPerPlayer", main.indexOf("function *rest(game, dispatcher, campingActor")),
  );

  assert.notEqual(restSource, "", "rest source must be present");
  assert.match(restSource, /var kmCampingRestInFlight = new WeakSet\(\);|kmCampingRestInFlight\.has\(campingActor\)/);
  assert.match(restSource, /kmCampingRestInFlight\.add\(campingActor\);/);
  assert.match(restSource, /kmCampingRestOperationVersion\(latestCamping\) !== expectedRestOperationVersion/);
  assert.match(restSource, /latestCamping\.restOperationVersion = expectedRestOperationVersion \+ 1;/);
  assert.match(restSource, /finally \{\s*kmCampingRestInFlight\.delete\(campingActor\);\s*\}/);
});

test("camping chat result buttons are one-shot and render listeners are deduplicated", () => {
  for (const template of [
    "apply-meal-result.hbs",
    "discover-special-meal.hbs",
    "hunt-and-gather.hbs",
    "pass-time.hbs",
    "random-camping-encounter.hbs",
    "subsist.hbs",
  ]) {
    const source = readFileSync(new URL(`dist/chatmessages/${template}`, moduleRoot), "utf8");
    assert.match(source, /data-km-once="true"/, template);
  }
  assert.match(main, /element_0\.__kmChatHandlers/);
  assert.match(main, /target\.dataset\.kmProcessed === 'true'/);
});

test("army consumption recomputation is first-GM authoritative", () => {
  assert.match(main, /function \*updateArmyConsumption\(game, \$completion\) \{[\s\S]*?game\.user\.isGM !== true \|\| !isFirstGM\(game\)/);
});

test("Offensive Gambit never merges enemy armies from multiple hexes", () => {
  assert.match(main, /var anchorHexes = new Set\(anchorTokens\.map\(kmArmyTokenHexKey\)/);
  assert.match(main, /if \(anchorHexes\.size > 1\) \{\s*return \[\];/);
});

test("non-GM Kingdom turn completion delegates the counter increment to the first GM", () => {
  assert.match(main, /var kmKingdomTurnSocketAction = 'incrementKingdomTurn';/);
  assert.match(main, /registerKingdomTurnSocket\(\);/);
  assert.match(main, /action: kmKingdomTurnSocketAction/);
  assert.match(main, /senderUserId !== data\.requestingUserId/);
});
