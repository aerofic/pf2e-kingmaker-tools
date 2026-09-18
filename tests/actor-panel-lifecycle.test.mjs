import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';

const main = readFileSync(new URL('../dist/main.js', import.meta.url), 'utf8');
const patches = readFileSync(new URL('../dist/api/patches.js', import.meta.url), 'utf8')
  .split('// BEGIN GENERATED KINGMAKER CONCURRENCY')[0];

function block(marker) {
  const start = main.indexOf(marker);
  assert.notEqual(start, -1);
  const brace = main.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < main.length; i++) {
    if (main[i] === '{') depth++;
    if (main[i] === '}' && --depth === 0) return main.slice(start, i + 1);
  }
  assert.fail(`Unterminated ${marker}`);
}

function harness() {
  const context = {
    foundry: {applications: {api: {
      ApplicationV2: class {}, HandlebarsApplicationMixin: base => base,
    }}},
    Hooks: {on() {}}, console,
  };
  runInNewContext(patches, context);
  const dom = new Map();
  const subscriptions = new Set();
  const offCalls = [];
  context.TypedHooks_instance = {v3u: (key, callback) => {
    offCalls.push(key); subscriptions.delete(callback);
  }};
  const dispose = runInNewContext(`({${block('disposePanelHooks() {')}}).disposePanelHooks`, context);
  const actor = {apps: {}};
  const apps = [];
  // Models the relevant V14 behavior: serialized render/close, same-ID DOM
  // replacement without closing the former owner, no _preClose without DOM.
  function create(id, fail = false) {
    let queue = Promise.resolve();
    const enqueue = action => {
      const task = queue.then(action); queue = task.catch(() => {}); return task;
    };
    const app = {
      id, element: null, renders: 0, closeGate: null,
      disposePanelHooks: dispose,
      render() { return enqueue(async () => {
        if (fail) throw new Error('template failed');
        if (!this.element) {
          const old = dom.get(id);
          if (old) old.isConnected = false;
          this.element = {isConnected: true}; dom.set(id, this.element);
        }
        if (!this.element.isConnected) throw new TypeError('null parent offsetWidth');
        this.renders++; return this;
      }); },
      close() { return enqueue(async () => {
        if (this.closeGate) await this.closeGate;
        if (this.element) {
          this.disposePanelHooks();
          this.element.isConnected = false;
          dom.delete(id); this.element = null;
        }
        return this;
      }); },
    };
    const callback = () => app.render();
    subscriptions.add(callback);
    app.q3u_1 = {r1() {
      let done = false;
      return {s1: () => !done, t1: () => {
        done = true; return {j3u_1: 'updateWorldTime', k3u_1: callback};
      }};
    }};
    actor.apps[id] = app; apps.push(app); return app;
  }
  return {open: context.foundryvttKotlinPatches.openActorPanel, create, actor, apps,
    subscriptions, offCalls};
}

test('harness reproduces V14 same-ID replacement and stale refresh failure', async () => {
  const h = harness();
  const first = h.create('kingdom'); await first.render();
  await h.create('kingdom').render();
  await assert.rejects(first.render(), /offsetWidth/);
  assert.equal(h.subscriptions.size, 2);
});

for (const id of ['kmCamping-Actor.party', 'kmKingdomSheet-Actor.party']) {
  test(`${id}: rapid opens reuse one owner, normal time/document refresh survives`, async () => {
    const h = harness();
    const opened = await Promise.all(Array.from({length: 8}, () => h.open(id, h.actor, () => h.create(id))));
    assert.equal(h.apps.length, 1);
    assert.ok(opened.every(app => app === opened[0]));
    assert.equal(h.subscriptions.size, 1);
    await Promise.all([...h.subscriptions].map(callback => callback()));
    await h.actor.apps[id].render();
    assert.equal(opened[0].renders, 10);
    assert.equal(opened[0].element.isConnected, true);
  });

  test(`${id}: close/reopen race cleans old subscriptions and blocks late refresh`, async () => {
    const h = harness();
    const first = await h.open(id, h.actor, () => h.create(id));
    const lateCallback = [...h.subscriptions][0];
    let release;
    first.closeGate = new Promise(resolve => {release = resolve;});
    const closing = first.close();
    const opening = h.open(id, h.actor, () => h.create(id));
    await lateCallback();
    assert.equal(h.apps.length, 1);
    release(); await closing;
    const second = await opening;
    assert.notEqual(second, first);
    assert.equal(h.actor.apps[id], second);
    assert.equal(h.subscriptions.size, 1);
    assert.equal(h.offCalls.length, 1);
    await lateCallback();
    assert.equal(first.element, null);
    await second.close();
    assert.equal(h.subscriptions.size, 0);
    assert.equal(h.actor.apps[id], undefined);
  });
}

test('failed first render cleans constructor hooks and permits retry', async () => {
  const h = harness(); const id = 'kingdom';
  await assert.rejects(h.open(id, h.actor, () => h.create(id, true)), /template failed/);
  assert.equal(h.subscriptions.size, 0);
  assert.equal(h.actor.apps[id], undefined);
  const app = await h.open(id, h.actor, () => h.create(id));
  assert.equal(app.element.isConnected, true);
});

test('closing removes only its own Actor window reference', async () => {
  const h = harness();
  const app = await h.open('kingdom', h.actor, () => h.create('kingdom'));
  const replacement = {}; h.actor.apps.kingdom = replacement;
  await app.close();
  assert.equal(h.actor.apps.kingdom, replacement);
});

test('production opening paths use the lifecycle manager instead of constructing duplicate windows', () => {
  for (const kind of ['Camping', 'Kingdom']) {
    const handler = block(`class Open${kind}SheetHandler extends ActionHandler`);
    assert.match(handler, /yield\*.*awaitd1m8y0em728c.*openActorPanel/);
    assert.doesNotMatch(handler, /launch\(new/);
  }
});

for (const suffix of [9, 10]) {
  for (const result of [null, undefined, {j5n_1: 'Town', l5n_1: 'forest', k5n_1: 2, m5n_1: 'grid'}]) {
    test(`settlement action ${suffix}: ${result == null ? String(result) : 'confirmation'}`, () => {
      const calls = [];
      const unit = {};
      const context = {
        _kotlin_kotlin_stdlib_mjs__WEBPACK_IMPORTED_MODULE_2__: {Unit_instancev9v8hjid95df: unit},
        newSettlementChoices: function* () {return result;},
        getKingdom_0: () => ({}), getChosenHeartland: () => null,
        SettlementType_SETTLEMENT_getInstance: () => 'settlement',
        SettlementType_CAPITAL_getInstance: () => 'capital',
      };
      const name = `KingdomSheet$_onClickAction$slambda_${suffix}`;
      const Handler = runInNewContext(`${block(`class ${name} {`)}; ${name}`, context);
      const handler = new Handler({*m5s(...args) {calls.push(args);}});
      const finished = handler.k3s(null, 'completion').next();
      assert.equal(finished.done, true);
      assert.equal(finished.value, unit);
      if (result == null) assert.equal(calls.length, 0);
      else assert.deepEqual(calls, [['Town', 'forest', 2, suffix === 9 ? 'settlement' : 'capital', 'grid', 'completion']]);
    });
  }
}
