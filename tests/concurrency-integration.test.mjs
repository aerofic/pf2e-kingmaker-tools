import assert from 'node:assert/strict';
import test from 'node:test';
import {loadBundle} from './helpers/bundle-harness.mjs';
import {fixture,moduleId} from './helpers/concurrency-fixture.mjs';

function adapterFixture(){
  const c=loadBundle(),f=fixture({bundle:c});
  Object.setPrototypeOf(f.actor,c.CONFIG.PF2E.Actor.documentClasses.party.prototype);
  c.actor=f.actor;c.actions=[];
  const install=f.api.install;f.api.install=adapter=>{c.adapter=adapter;};
  c.audit("fromUuid=async uuid=>uuid===actor.uuid?actor:null; kmInstallConcurrency({f3s_1:game});");
  f.api.install=install;
  return {c,f};
}
const button=(selector,dataset)=>({dataset,matches:query=>query.split(',').map(s=>s.trim()).includes(selector)});
for(const [selector,handler,action,extra,expected] of [
  ['.km-add-recipe','LearnSpecialRecipeHandler','learnSpecialRecipe',{id:'recipe',degree:'success'},{id:'recipe',degree:'success'}],
  ['.km-add-food','AddHuntAndGatherResultHandler','addHuntAndGatherResult',{basicIngredients:'2',specialIngredients:'3'},{basicIngredients:2,specialIngredients:3}],
  ['.km-apply-meal-effect','ApplyMealEffectsHandler','applyMealEffects',{recipe:'recipe',degree:'criticalSuccess'},{recipeId:'recipe',degree:'criticalSuccess'}],
  ['.gain-provisions','GainProvisionsHandler','gainProvisions',{quantity:'4'},{quantity:4}]
]) test(`actual chat adapter maps ${selector} to the existing handler with original requester`,async()=>{
  const {c}=adapterFixture();
  c.audit(`${handler}=class {constructor(){this.z3s_1=${JSON.stringify(action)};} *c3t(action){actions.push(action);}};`);
  await c.adapter.executeChat({},button(selector,{campingActorUuid:'Actor.party',actorUuid:'Actor.party',...extra}),c.game.users.get('player'));
  assert.equal(c.actions.length,1);assert.equal(c.actions[0].action,action);assert.equal(c.actions[0].__kmSenderUserId,'player');
  for(const [key,value] of Object.entries(expected)) assert.equal(c.actions[0].data[key],value);
});
test('random encounter adapter fully awaits the roll rather than releasing reservation early',async()=>{
  const {c}=adapterFixture();let resolve;c.gate=new Promise(done=>resolve=done);
  c.audit('rollRandomEncounter=function* (game,actor,flat,completion){yield* (0,_kotlinx_coroutines_core_mjs__WEBPACK_IMPORTED_MODULE_3__.awaitd1m8y0em728c)(gate,completion); actions.push(flat);};');
  let finished=false;const promise=c.adapter.executeChat({},button('.km-random-encounter',{campingActorUuid:'Actor.party'}),c.game.user).then(()=>{finished=true;});
  await new Promise(done=>setImmediate(done));assert.equal(finished,false);resolve();await promise;assert.deepEqual(c.actions,[true]);
});
test('random encounter readers retain access; food collection still uses existing ownership',async()=>{
  const {c}=adapterFixture();const other=c.game.users.get('other');
  await c.adapter.validateChat({},button('.km-random-encounter',{campingActorUuid:'Actor.party'}),other);
  await assert.rejects(c.adapter.validateChat({},button('.km-add-food',{campingActorUuid:'Actor.party'}),other),/Cannot update/);
});
test('existing turn math retains resource amounts, storage caps and modifier duration semantics',()=>{
  const c=loadBundle();
  c.audit("getRealmData=()=>({});getAllSettlements=()=>({e4y_1:[]});calculateStorage=()=>({z3j_1:5,a3k_1:5,c3k_1:5,y3j_1:5,b3k_1:5});");
  c.input={supernaturalSolutions:2,creativeSolutions:3,blessedSolutions:4,fame:{type:'famous',now:1,next:2},resourcePoints:{now:10,next:20},resourceDice:{now:3,next:4},consumption:{armies:2,now:3,next:4},commodities:{now:{food:4,lumber:2,luxuries:0,ore:1,stone:3},next:{food:3,lumber:1,luxuries:0,ore:1,stone:3}},modifiers:[{id:'permanent',turns:null},{id:'zero',turns:0},{id:'one',turns:1},{id:'two',turns:2}]};
  const result=c.audit('kmEndTurnData({},input)');
  assert.deepEqual(structuredClone(result.resourcePoints),{now:20,next:0});assert.deepEqual(structuredClone(result.resourceDice),{now:4,next:0});
  assert.deepEqual(structuredClone(result.consumption),{armies:2,now:4,next:0});assert.equal(result.commodities.now.food,5);assert.equal(result.commodities.now.stone,5);
  assert.deepEqual(Array.from(result.modifiers,m=>[m.id,m.turns]),[['permanent',null],['zero',0],['two',1]]);assert.equal(result.fame.now,2);
  for(const key of ['supernaturalSolutions','creativeSolutions','blessedSolutions'])assert.equal(result[key],0);
});
test('actual kingdom check wrapper joins double click, persists completion and cannot replay',async()=>{
  const c=loadBundle(),f=fixture({bundle:c});c.dialog={d5d_1:f.actor,e5d_1:{modifiers:[]}};c.calls=0;
  c.audit("globalThis.run=async()=>{calls++;await kmConcurrent.request('consumeModifiers',{actorUuid:dialog.d5d_1.uuid,ids:[],checkId:dialog.__kmCheckId});};");
  await Promise.all([c.audit('kmRunKingdomCheck(dialog,run)'),c.audit('kmRunKingdomCheck(dialog,run)')]);
  await c.audit('kmRunKingdomCheck(dialog,run)');assert.equal(c.calls,1);assert.equal(f.actor.getFlag(moduleId,'concurrentOps').check.status,'done');
});
test('new one-shot cards carry persistent version metadata at their real creation boundary',async()=>{
  const c=loadBundle();const messages=[];
  c.foundry.documents.ChatMessage.create=async data=>{messages.push(data);return data;};
  c.foundry.documents.ChatMessage.applyMode=()=>{};
  c.audit('escapeHtml=value=>value;');
  await c.audit('buildPromise((scope,next)=>postChatMessage(\'<button data-km-once="true">Apply</button>\',RollMode_PUBLICROLL_getInstance(),null,true,next))');
  assert.equal(messages[0].flags[moduleId].onceVersion,1);
});
