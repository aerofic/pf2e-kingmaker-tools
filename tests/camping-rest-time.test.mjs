import assert from 'node:assert/strict';
import test from 'node:test';
import {fixture, moduleId} from './helpers/concurrency-fixture.mjs';
import {loadBundle} from './helpers/bundle-harness.mjs';

function setup({remaining = 4683, encounter = null} = {}) {
  const c = loadBundle();
  c.console = {error() {}, warn() {}};
  const f = fixture({bundle: c, camping: {
    restOperationVersion: 34, watchSecondsRemaining: remaining,
    watchEncounterSecondsRemaining: remaining, watchEncounterNextCheckOffsetSeconds: 9483,
    secondsSpentTraveling: 141657, secondsSpentHexploring: 141657,
    travelModeActive: true, autoApplyFatigued: false,
    resetTimeTrackingAfterOneDay: true, dailyPrepsAtTime: 0,
    actorUuids: [], actorUuidsNotKeepingWatch: [], restRollMode: 'oneEveryFourHours',
    campingActivities: {hunt: {result: 'success'}}, cooking: {results: {meal: {result: 'success'}}},
    restSettings: {}, encounterConditions: {flying: true},
  }});
  const warnings = [], advances = [], effects = [];
  c.game.users.activeGM = c.game.users.get('gm');
  c.actor = f.actor; c.encounter = encounter; c.effects = effects;
  c.ui.notifications.warn = message => warnings.push(message);
  c.audit(`
    getActiveCampingActor = () => actor;
    getActiveCamping = () => getCamping(actor);
    getCampingActorsByUuid = function* () { return []; };
    getActorsInCamp = function* () { return _kotlin_kotlin_stdlib_mjs__WEBPACK_IMPORTED_MODULE_2__.ArrayList3it5z8td81qkl.m1(); };
    getAllRecipes = () => [];
    getFullRestSeconds = function* () { return 28800; };
    findRandomEncounterAt = function* () { return encounter; };
    enrichHtml = function* () { return ''; };
    postChatTemplate = function* () {};
    postNightAmbushWatchInfo = function* () {};
    additionalHealingPerActorAfterRest = function* () {return [];};
    applyAdditionalHealing = function* () {effects.push('healing');};
    applyRestHealEffects = function* () {};
    getMealEffectItems_0 = function* () {return [];};
    removeMealEffects = function* () {};
    removeProvisions = function* () {effects.push('provisions');};
    removeCombatEffects = function* () {};
    gainMinimumSubsistence = function* () {};
    rollWeather_0 = function* () {};
    globalThis.timeHook = registerFatiguedHooks$lambda(game);
  `);
  c.game.time = {worldTime: 100000, async advance(seconds, options) {
    assert.equal(f.camping.restTimeGuard.status, 'pending', 'checkpoint precedes time side effect');
    advances.push({seconds, options}); this.worldTime += seconds;
    c.timeHook(this.worldTime, seconds, options, 'gm');
    return this.worldTime;
  }};
  const rest = () => c.audit('buildPromise((scope,next)=>rest(game, {}, actor, getCamping(actor), false, false, false, true, null, kmCampingRestOperationVersion(getCamping(actor)), next))');
  return {c, f, warnings, advances, effects, rest, api: c.foundryvttKotlinPatches.campingRest};
}

for (const remaining of [0, 4683]) {
  test(`actual rest completion (${remaining ? 'resume' : 'new'}): time hook cannot invalidate reset`, async () => {
    const h = setup({remaining});
    await h.rest();
    assert.equal(h.advances.length, 1);
    assert.equal(h.advances[0].seconds, remaining || 28800);
    assert.equal(h.f.camping.watchSecondsRemaining, 0);
    assert.equal(h.f.camping.secondsSpentTraveling, 0);
    assert.equal(h.f.camping.secondsSpentHexploring, 0);
    assert.equal(h.f.camping.campingActivities.hunt.result, null);
    assert.equal(h.f.camping.restTimeGuard.status, 'complete');
    assert.equal(h.f.camping.encounterConditions.flying, false);
    assert.deepEqual(h.effects, ['healing', 'provisions']);
    assert.equal(h.f.errors.length, 0);
  });
}

test('actual ambush interruption saves remaining progress and allows one continuation', async () => {
  const h = setup({encounter: {seconds: 1000, stealthDc: 20}});
  await h.rest();
  assert.equal(h.f.camping.watchSecondsRemaining, 3683);
  assert.equal(h.f.camping.secondsSpentTraveling, 141657, 'rest is not travel');
  assert.equal(h.f.camping.restTimeGuard.status, 'complete');
  assert.equal(h.effects.length, 0);
  h.c.encounter = null;
  await h.rest();
  assert.deepEqual(h.advances.map(event => event.seconds), [1000, 3683]);
  assert.equal(h.f.camping.watchSecondsRemaining, 0);
});

test('simultaneous actual rest requests join the in-flight guard', async () => {
  const h = setup();
  await Promise.all([h.rest(), h.rest()]);
  assert.equal(h.advances.length, 1);
  assert.equal(h.f.camping.restOperationVersion, 35);
});

test('ordinary calendar advance still updates travel/exploration while resting', async () => {
  const h = setup(); h.c.delta = 120;
  await h.c.audit('buildPromise((scope,next)=>persistPassedTime_0(game,delta,next))');
  assert.equal(h.f.camping.secondsSpentTraveling, 141777);
  assert.equal(h.f.camping.secondsSpentHexploring, 141777);
  assert.equal(h.api.isRestTime(h.f.actor, 120, {}, 'gm'), false);
});

test('time event filter rejects wrong user, actor, delta, or operation ID', async () => {
  const h = setup(); await h.rest();
  const {seconds, options} = h.advances[0];
  assert.equal(h.api.isRestTime(h.f.actor, seconds, options, 'gm'), true);
  assert.equal(h.api.isRestTime(h.f.actor, seconds, options, 'player'), false);
  assert.equal(h.api.isRestTime(h.f.actor, seconds + 1, options, 'gm'), false);
  assert.equal(h.api.isRestTime({...h.f.actor, uuid: 'Actor.other'}, seconds, options, 'gm'), false);
  assert.equal(h.api.isRestTime(h.f.actor, seconds, {kingmakerRestTime: {...options.kingmakerRestTime, id: 'wrong'}}, 'gm'), false);
  // V14 calendar callbacks may dispatch late, after the next operation started.
  await h.rest();
  assert.equal(h.api.isRestTime(h.f.actor, seconds, options, 'gm'), true);
});

test('checkpoint save failure never advances time and is safe to retry', async () => {
  const h = setup();
  h.f.beforeUpdate = async data => {
    if (data[`flags.${moduleId}.camping-sheet.restTimeGuard`]) throw Error('checkpoint save failed');
  };
  await assert.rejects(h.rest(), /checkpoint save failed/);
  assert.equal(h.advances.length, 0);
  h.f.beforeUpdate = async () => {};
  await h.rest(); assert.equal(h.advances.length, 1);
});

test('failure after time advancement blocks retry, including a fresh client', async () => {
  const h = setup();
  h.f.beforeUpdate = async data => {
    if (data[`flags.${moduleId}.camping-sheet.watchSecondsRemaining`] === 0) throw Error('completion save failed');
  };
  await assert.rejects(h.rest(), /completion save failed/);
  assert.equal(h.advances.length, 1);
  assert.equal(h.effects.length, 0);
  assert.equal(h.f.camping.restTimeGuard.status, 'pending');
  h.f.beforeUpdate = async () => {};
  await h.rest();
  assert.equal(h.advances.length, 1);
  const fresh = loadBundle();
  fresh.ui.notifications.warn = message => h.warnings.push(message);
  assert.equal(fresh.foundryvttKotlinPatches.campingRest.canStart(h.f.actor), false);
  assert.equal(h.warnings.length, 2);
});

test('lost time acknowledgement cannot cause duplicate advance', async () => {
  const h = setup(); const advance = h.c.game.time.advance;
  h.c.game.time.advance = async function (...args) {await advance.apply(this, args); throw Error('time response lost');};
  await assert.rejects(h.rest(), /time response lost/);
  await h.rest();
  assert.equal(h.advances.length, 1);
  assert.equal(h.f.camping.restTimeGuard.status, 'pending');
});

test('conflicting edits stay protected after rest time', async () => {
  const h = setup(); const advance = h.c.game.time.advance;
  h.c.game.time.advance = async function (...args) {
    await advance.apply(this, args);
    const edit = h.f.api.capture(h.f.actor, 'camping-sheet', structuredClone(h.f.camping));
    edit.secondsSpentTraveling += 1;
    await h.f.api.write(h.f.actor, 'camping-sheet', edit);
  };
  await assert.rejects(h.rest(), /其他操作/);
  assert.equal(h.f.camping.secondsSpentTraveling, 141658);
  await h.rest(); assert.equal(h.advances.length, 1);
});

test('original untagged time hook reproduces the reported self-conflict in the actual rest flow', async () => {
  const h = setup(); h.api.isRestTime = () => false;
  await assert.rejects(h.rest(), /其他操作/);
  assert.equal(h.advances.length, 1);
  assert.equal(h.f.camping.watchSecondsRemaining, 4683);
  assert.equal(h.f.camping.secondsSpentTraveling, 146340);
});

test('unrelated edits made during rest survive final saves', async () => {
  const h = setup(); const advance = h.c.game.time.advance;
  h.c.game.time.advance = async function (...args) {
    await advance.apply(this, args);
    const edit = h.f.api.capture(h.f.actor, 'camping-sheet', structuredClone(h.f.camping));
    edit.section = 'newer-section';
    await h.f.api.write(h.f.actor, 'camping-sheet', edit);
  };
  await h.rest();
  assert.equal(h.f.camping.section, 'newer-section');
  assert.equal(h.f.camping.restTimeGuard.status, 'complete');
});

test('lost checkpoint acknowledgement does not advance and does not silently retry', async () => {
  const h = setup(); const update = h.f.actor.update;
  h.f.actor.update = async data => {
    const result = await update(data);
    if (data[`flags.${moduleId}.camping-sheet.restTimeGuard`]) throw Error('checkpoint response lost');
    return result;
  };
  await assert.rejects(h.rest(), /checkpoint response lost/);
  await h.rest();
  assert.equal(h.advances.length, 0);
  assert.equal(h.f.camping.restTimeGuard.status, 'pending');
});

test('failed final checkpoint leaves rest paused instead of repeating effects', async () => {
  const h = setup();
  h.f.beforeUpdate = async data => {
    if (data[`flags.${moduleId}.camping-sheet.restTimeGuard.status`] === 'complete') throw Error('finish failed');
  };
  await assert.rejects(h.rest(), /finish failed/);
  await h.rest();
  assert.equal(h.advances.length, 1);
  assert.deepEqual(h.effects, ['healing', 'provisions']);
  assert.equal(h.f.camping.restTimeGuard.status, 'pending');
});

test('confirmed complete checkpoint survives lost final acknowledgement', async () => {
  const h = setup(); const update = h.f.actor.update;
  h.f.actor.update = async data => {
    const result = await update(data);
    if (data[`flags.${moduleId}.camping-sheet.restTimeGuard.status`] === 'complete') throw Error('finish response lost');
    return result;
  };
  await h.rest();
  assert.equal(h.f.camping.restTimeGuard.status, 'complete');
  assert.equal(h.advances.length, 1);
});

test('non-authoritative clients cannot invoke the time side effect directly', async () => {
  const h = setup();
  for (const id of ['gm2', 'player']) {
    h.c.game.user = h.f.users.get(id);
    await assert.rejects(h.api.advance(h.f.actor, structuredClone(h.f.camping), 10), /authoritative GM/);
  }
  assert.equal(h.advances.length, 0);
  assert.equal(h.f.updates.length, 0);
});

test('non-GM owner cannot clear a persisted safety checkpoint', async () => {
  const h = setup();
  h.f.camping.restTimeGuard = {id: 'unfinished', status: 'pending'};
  const player = h.f.addClient('player').foundryvttKotlinPatches.concurrency;
  const data = player.capture(h.f.actor, 'camping-sheet', structuredClone(h.f.camping));
  data.restTimeGuard = null;
  await assert.rejects(player.write(h.f.actor, 'camping-sheet', data), /Only a GM/);
  assert.equal(h.f.camping.restTimeGuard.status, 'pending');
});
