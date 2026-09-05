import assert from "node:assert/strict";
import test from "node:test";
import { loadBundle } from "./helpers/bundle-harness.mjs";
import { fixture, moduleId } from "./helpers/concurrency-fixture.mjs";

const modes = [
  ["PUBLICROLL", "public", [], false],
  ["GMROLL", "gm", ["gm"], false],
  ["BLINDROLL", "blind", ["gm"], true],
  ["SELFROLL", "self", ["player"], false],
];

function messageFixture() {
  const c = loadBundle();
  const network = fixture({bundle:c});
  c.actor = network.actor;
  Object.defineProperty(c, 'state', {get:()=>network.kingdom,set:value=>{network.state.flags[moduleId]['kingdom-sheet']=value;},configurable:true});
  const messages = [];
  const applied = [];
  c.foundry.documents.ChatMessage.create = async (data) => messages.push(structuredClone(data));
  // Boundary fixture matching V14 applyMode's four standard visibility modes.
  // Assert the mode too, so an omitted/legacy argument cannot silently pass.
  c.foundry.documents.ChatMessage.applyMode = (data, mode) => {
    const entry = modes.find(([, name]) => name === mode);
    assert.ok(entry, `Unknown V14 message mode: ${mode}`);
    applied.push(mode);
    data.whisper = [...entry[2]];
    data.blind = entry[3];
  };
  c.audit("tpl = function* (path,context) {return context.degree;}; t_1 = value=>value.p3(); t_0 = value=>value; escapeHtml = value=>value;");
  return { c, messages, applied };
}

for (const [enumName, mode, whisper, blind] of modes) {
  test(`ordinary kingdom result preserves ${mode} visibility`, async () => {
    const { c, messages, applied } = messageFixture();
    await c.audit(`buildPromise((scope,completion)=>postKingdomCheckOutcome(function*(){},RollMode_${enumName}_getInstance(),null,null,{changed:DegreeOfSuccess_SUCCESS_getInstance(),originalDegree:DegreeOfSuccess_SUCCESS_getInstance(),skill:KingdomSkill_ARTS_getInstance(),notes:[]},[],{},null,null,completion))`);
    assert.equal(messages.length, 1);
    assert.deepEqual(applied, [mode]);
    assert.deepEqual(messages[0].whisper, whisper);
    assert.equal(messages[0].blind, blind);
    assert.match(messages[0].content, /success/);
  });

  test(`Supernatural summary and spend preserve ${mode} visibility`, async () => {
    const { c, messages } = messageFixture();
    c.mode = enumName.toLowerCase();
    c.audit(`
      globalThis.state = {supernaturalSolutions:1,modifiers:[]};
      getKingdom = () => structuredClone(state);
      setKingdom = function* (actor,value) {state=value;};
      rollCheck_1 = function* () {return {changed:DegreeOfSuccess_SUCCESS_getInstance(),skill:KingdomSkill_ARTS_getInstance()};};
      rollAutomaticSupernaturalMagicCheck = function* () {return {changed:DegreeOfSuccess_CRITICAL_SUCCESS_getInstance(),skill:KingdomSkill_MAGIC_getInstance(),consumedModifierIds:[]};};
      postKingdomCheckOutcome = function* () {};
      globalThis.dialog = {u5d_1:{supernaturalSolution:true,assurance:false,rollMode:mode,skill:'arts',dc:15},d5d_1:actor,e5d_1:{modifiers:[]},close(){}};
    `);
    await c.audit("buildPromise((scope,completion)=>roll(dialog,0,0,[],[],[],[],false,[],_kotlin_kotlin_stdlib_mjs__WEBPACK_IMPORTED_MODULE_2__.emptyList1g2z5xcrvp2zy(),false,false,false,[],0,completion))");
    assert.equal(c.state.supernaturalSolutions, 0);
    assert.equal(messages.length, 2);
    assert.match(messages[1].content, /magic.*criticalSuccess/);
    for (const data of messages) {
      assert.deepEqual(data.whisper, whisper);
      assert.equal(data.blind, blind);
    }
  });

  for (const resource of ["creative", "freeAndFair", "fame"]) {
    test(`${resource} spend message preserves ${mode} visibility and amount`, async () => {
      const { c, messages } = messageFixture();
      c.resource = resource;
      c.audit(`
        globalThis.state = {creativeSolutions:2,resourcePoints:{now:10},fame:{type:'famous',now:2}};
        getKingdom = () => structuredClone(state);
        setKingdom = function* (actor,value) {state=value;};
        t = value=>value;
        d20Check = function* () {return {d4o_1:{},*k5f(){}};};
        determineDegree = () => ({n3m_1:DegreeOfSuccess_SUCCESS_getInstance(),o3m_1:DegreeOfSuccess_SUCCESS_getInstance()});
        generateRollMeta = function* () {return {};};
      `);
      await c.audit(`buildPromise((scope,completion)=>rollCheck_1(function*(){},RollMode_${enumName}_getInstance(),null,KingdomSkill_ARTS_getInstance(),0,0,false,[],15,{},[],false,false,[],[],resource==='creative',[],[],resource==='fame',false,[],null,null,null,resource==='freeAndFair',0,true,completion))`);
      assert.equal(messages.length, 1);
      assert.deepEqual(messages[0].whisper, whisper);
      assert.equal(messages[0].blind, blind);
      assert.equal(c.state.creativeSolutions, resource === "creative" ? 1 : 2);
      assert.equal(c.state.resourcePoints.now, resource === "freeAndFair" ? 8 : 10);
      assert.equal(c.state.fame.now, resource === "fame" ? 1 : 2);
    });
  }

  test(`Blessed Solution spend preserves ${mode} visibility and amount`, async () => {
    const { c, messages } = messageFixture();
    c.mode = enumName.toLowerCase();
    c.audit(`
      globalThis.state = {blessedSolutions:1,modifiers:[{id:'blessed',name:'activities.blessed-solution.success.modifiers.blessedAttempt.name'}]};
      getKingdom = () => structuredClone(state);
      setKingdom = function* (actor,value) {state=value;};
      t = value=>value;
      rollCheck_1 = function* () {return DegreeOfSuccess_SUCCESS_getInstance();};
      globalThis.dialog = {u5d_1:{supernaturalSolution:false,assurance:false,rollMode:mode,skill:'arts',dc:15},d5d_1:actor,e5d_1:structuredClone(state),close(){}};
    `);
    await c.audit("buildPromise((scope,completion)=>roll(dialog,0,0,[],[],[],[],false,[],_kotlin_kotlin_stdlib_mjs__WEBPACK_IMPORTED_MODULE_2__.listOf1jh22dvmctj1r(['blessed']),false,false,false,[],0,completion))");
    assert.equal(c.state.blessedSolutions, 0);
    assert.equal(c.state.modifiers.length, 0);
    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0].whisper, whisper);
    assert.equal(messages[0].blind, blind);
  });
}

for (const [name, whisper, blind] of [
  ["public", [], false], ["custom whisper", ["gm", "observer"], false],
  ["blind", ["gm"], true], ["self", ["player"], false],
]) {
  test(`night ambush outcome inherits exact ${name} recipients`, async () => {
    const { c, messages } = messageFixture();
    c.game.user = c.game.users.get('player');
    c.source = {whisper: [...whisper], blind, flags:{pf2e:{context:{options:["night-ambush"],outcome:"success"}}}};
    c.audit("postNightAmbushOutcome(source,{},'player')");
    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0].whisper, whisper);
    assert.equal(messages[0].blind, blind);
    assert.deepEqual(c.source.whisper, whisper);
    c.audit("postNightAmbushOutcome(source,{},'another-client')");
    assert.equal(messages.length, 1, "non-originating clients must not duplicate the outcome");
  });
}
