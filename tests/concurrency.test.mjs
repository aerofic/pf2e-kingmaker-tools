import assert from 'node:assert/strict';
import test from 'node:test';
import {fixture,moduleId} from './helpers/concurrency-fixture.mjs';
import {loadBundle} from './helpers/bundle-harness.mjs';

test('stale camping snapshot preserves newer rest progress', async()=>{
  const f=fixture(), old=f.api.capture(f.actor,'camping-sheet',structuredClone(f.camping));
  const fresh=f.api.clone(old); fresh.restOperationVersion=1; fresh.watchSecondsRemaining=28800;
  await f.api.write(f.actor,'camping-sheet',fresh);
  old.section='new'; await f.api.write(f.actor,'camping-sheet',old);
  assert.equal(f.camping.restOperationVersion,1); assert.equal(f.camping.watchSecondsRemaining,28800); assert.equal(f.camping.section,'new');
});
test('overlapping writes conflict instead of silently losing identical increments', async()=>{
  const f=fixture(), a=f.api.capture(f.actor,'camping-sheet',structuredClone(f.camping)),b=f.api.clone(a);
  a.restOperationVersion++;b.restOperationVersion++;
  const results=await Promise.allSettled([f.api.write(f.actor,'camping-sheet',a),f.api.write(f.actor,'camping-sheet',b)]);
  assert.deepEqual(results.map(r=>r.status),['fulfilled','rejected']);assert.equal(f.camping.restOperationVersion,1);
});
test('two player/GM clients merge non-overlapping fields through one authority', async()=>{
  const f=fixture(), p=f.addClient('player').foundryvttKotlinPatches.concurrency;
  const a=p.capture(f.actor,'camping-sheet',structuredClone(f.camping)),b=f.api.capture(f.actor,'camping-sheet',structuredClone(f.camping));
  a.section='player';b.watchSecondsRemaining=123;
  await Promise.all([p.write(f.actor,'camping-sheet',a),f.api.write(f.actor,'camping-sheet',b)]);
  assert.equal(f.camping.section,'player');assert.equal(f.camping.watchSecondsRemaining,123);assert.equal(f.updates.length,2);
});
test('missing baseline and stale arrays are rejected, clones retain baseline', async()=>{
  const f=fixture({kingdom:{modifiers:[{id:'old'}]}});
  await assert.rejects(f.api.write(f.actor,'kingdom-sheet',{modifiers:[]}),/编辑基准/);
  const a=f.api.capture(f.actor,'kingdom-sheet',structuredClone(f.kingdom)),b=f.api.clone(a);
  a.modifiers.push({id:'new'});await f.api.write(f.actor,'kingdom-sheet',a);
  b.modifiers=[];await assert.rejects(f.api.write(f.actor,'kingdom-sheet',b),/其他操作/);
  assert.deepEqual(f.kingdom.modifiers.map(m=>m.id),['old','new']);
});
test('initial state, partial updates and explicit deletions preserve flag semantics',async()=>{
  const f=fixture({camping:undefined}); delete f.state.flags[moduleId]['camping-sheet'];
  await f.api.write(f.actor,'camping-sheet',{a:{b:1,c:2}});
  await f.api.write(f.actor,'camping-sheet',{'a.-=b':null},true);
  assert.deepEqual(f.camping,{a:{c:2}});
});
test('commit succeeded but response lost: stable write receipt prevents replay',async()=>{
  const f=fixture(); const original=f.actor.update; let once=true;
  f.actor.update=async data=>{const result=await original(data);if(once){once=false;throw Error('response lost');}return result;};
  const snapshot=f.api.capture(f.actor,'camping-sheet',structuredClone(f.camping));snapshot.restOperationVersion=1;
  await assert.rejects(f.api.write(f.actor,'camping-sheet',snapshot),/response lost/);
  await f.api.write(f.actor,'camping-sheet',snapshot);
  assert.equal(f.updates.length,1);assert.equal(f.camping.restOperationVersion,1);
});
test('end turn is one atomic commit; retries and simultaneous clients settle once',async()=>{
  const f=fixture({kingdom:{resourcePoints:{now:10,next:20},modifiers:[{id:'two',turns:2}]}});
  const p=f.addClient('player').foundryvttKotlinPatches.concurrency;
  await Promise.all([f.api.request('endTurn',{actorUuid:f.actor.uuid,expectedTurn:11},'a'),p.request('endTurn',{actorUuid:f.actor.uuid,expectedTurn:11},'b')]);
  assert.equal(f.updates.length,1);assert.equal(f.postCount,1);assert.equal(f.kingdom.resourcePoints.now,20);assert.equal(f.kingdom.modifiers[0].turns,1);assert.equal(f.actor.getFlag(moduleId,'kingdomTurn'),12);
  await f.api.request('endTurn',{actorUuid:f.actor.uuid,expectedTurn:11},'a');assert.equal(f.updates.length,1);
  await f.api.request('endTurn',{actorUuid:f.actor.uuid,expectedTurn:12},'c');assert.equal(f.actor.getFlag(moduleId,'kingdomTurn'),13);assert.equal(f.kingdom.modifiers.length,0);
});
test('failed end turn leaves all values intact and is retryable',async()=>{
  const f=fixture({kingdom:{resourcePoints:{now:10,next:20},modifiers:[{id:'two',turns:2}]}});
  f.beforeUpdate=async()=>{throw Error('database unavailable');};
  await assert.rejects(f.api.request('endTurn',{actorUuid:f.actor.uuid,expectedTurn:11},'same'));
  assert.equal(f.kingdom.resourcePoints.now,10);assert.equal(f.actor.getFlag(moduleId,'kingdomTurn'),11);
  f.beforeUpdate=async()=>{};await f.api.request('endTurn',{actorUuid:f.actor.uuid,expectedTurn:11},'same');assert.equal(f.kingdom.resourcePoints.now,20);
});
test('latest modifier IDs are consumed once without resurrecting old or deleting new buffs',async()=>{
  const name='activities.blessed-solution.success.modifiers.blessedAttempt.name';
  const f=fixture({kingdom:{blessedSolutions:2,modifiers:[{id:'blessed',name},{id:'new'}]}});
  await f.api.request('consumeModifiers',{actorUuid:f.actor.uuid,ids:['old','blessed']});
  await f.api.request('consumeModifiers',{actorUuid:f.actor.uuid,ids:['old','blessed']});
  assert.deepEqual(f.kingdom.modifiers,[{id:'new'}]);assert.equal(f.kingdom.blessedSolutions,1);
});
test('kingdom checks reserve before dice and reject concurrent/stale one-use modifiers',async()=>{
  const f=fixture({kingdom:{modifiers:[{id:'one'}]}}), data={actorUuid:f.actor.uuid,modifiers:[{id:'one'}]};
  await f.api.request('beginCheck',data,'check');
  await assert.rejects(f.api.request('beginCheck',data,'duplicate'),/已有王国检定/);
  await f.api.request('consumeModifiers',{actorUuid:f.actor.uuid,ids:['one'],checkId:'check'});
  await assert.rejects(f.api.request('beginCheck',data,'stale'),/调整值已变化/);
});
test('interrupted check requires explicit GM resolution, not automatic retry',async()=>{
  const f=fixture();await f.api.request('beginCheck',{actorUuid:f.actor.uuid,modifiers:[]},'check');
  await f.api.request('failCheck',{actorUuid:f.actor.uuid,checkId:'check'});
  const p=f.addClient('player').foundryvttKotlinPatches.concurrency;
  await assert.rejects(p.request('resolveCheck',{actorUuid:f.actor.uuid}),/Only a GM/);
  await f.api.request('resolveCheck',{actorUuid:f.actor.uuid,checkId:'check',expectedStatus:'review'});
  await f.api.request('beginCheck',{actorUuid:f.actor.uuid,modifiers:[]},'next');
});
test('chat dedup persists across coordinator reload and distinguishes buttons/cards',async()=>{
  const f=fixture();f.message();
  await Promise.all([f.api.request('chat',{messageId:'card',key:'b0'}),f.api.request('chat',{messageId:'card',key:'b0'})]);
  assert.equal(f.chatCount,1);
  const reloaded=f.addClient('gm').foundryvttKotlinPatches.concurrency;
  await reloaded.request('chat',{messageId:'card',key:'b0'});assert.equal(f.chatCount,1);
  await reloaded.request('chat',{messageId:'card',key:'b1'});assert.equal(f.chatCount,2);
  f.message('next');await reloaded.request('chat',{messageId:'next',key:'b0'});assert.equal(f.chatCount,3);
});
test('partial chat failure is fail-closed and legacy cards need explicit review',async()=>{
  const f=fixture();const card=f.message('legacy',undefined);card.flags[moduleId].onceVersion=undefined;
  await assert.rejects(f.api.request('chat',{messageId:'legacy',key:'b0'}),/旧版卡片/);assert.equal(f.chatCount,0);
  await f.api.request('resolveChat',{messageId:'legacy',key:'b0',resolution:'ready',expectedStatus:'legacy'});
  const original=card.setFlag;card.setFlag=async function(scope,key,value){if(value.status==='done')throw Error('after side effect');return original.call(this,scope,key,value);};
  await assert.rejects(f.api.request('chat',{messageId:'legacy',key:'b0'}),/操作中断/);assert.equal(f.chatCount,1);
  await assert.rejects(f.api.request('chat',{messageId:'legacy',key:'b0'}),/部分完成/);assert.equal(f.chatCount,1);
});
test('socket authority preserves existing ownership, blind privacy and first GM selection',async()=>{
  const f=fixture();f.message().blind=true;
  const p=f.addClient('player').foundryvttKotlinPatches.concurrency;
  await assert.rejects(p.request('chat',{messageId:'card',key:'b0'}),/unavailable/);
  const no=f.addClient('other').foundryvttKotlinPatches.concurrency;
  await assert.rejects(no.request('consumeModifiers',{actorUuid:f.actor.uuid,ids:[]}),/无法更新/);
  const gm2=f.addClient('gm2').foundryvttKotlinPatches.concurrency;
  await gm2.request('consumeModifiers',{actorUuid:f.actor.uuid,ids:[]});assert.equal(f.updates.length,1);
});
test('actual bundle getters and clone preserve stale edit baseline',async()=>{
  const c=loadBundle(),f=fixture({bundle:c});c.actor=f.actor;
  c.audit("globalThis.old = getCamping(actor); globalThis.copy = deepClone(old);");
  f.camping.restOperationVersion=1;c.copy.section='updated';
  await c.audit('buildPromise((scope,next)=>setCamping(actor,copy,next))');
  assert.equal(f.camping.restOperationVersion,1);assert.equal(f.camping.section,'updated');
});
test('actual end-turn UI joins a double click but permits the next intentional turn',async()=>{
  const c=loadBundle(),f=fixture({bundle:c,kingdom:{resourcePoints:{now:10,next:20},modifiers:[]}});c.sheet={r5q_1:f.actor};
  await Promise.all([c.audit('kmEndKingdomTurn(sheet)'),c.audit('kmEndKingdomTurn(sheet)')]);assert.equal(f.updates.length,1);
  await c.audit('kmEndKingdomTurn(sheet)');assert.equal(f.actor.getFlag(moduleId,'kingdomTurn'),13);
});
test('a stale GM review cannot re-enable a completed action or a newer check',async()=>{
  const f=fixture();f.message();await f.api.request('chat',{messageId:'card',key:'b0'});
  await assert.rejects(f.api.request('resolveChat',{messageId:'card',key:'b0',resolution:'ready',expectedStatus:'pending'}),/state changed/);
  assert.equal(f.api.chatState(f.messages.get('card'),'b0').status,'done');
  await f.api.request('beginCheck',{actorUuid:f.actor.uuid,modifiers:[]},'new-check');
  await assert.rejects(f.api.request('resolveCheck',{actorUuid:f.actor.uuid,checkId:'old-check',expectedStatus:'pending'}),/state changed/);
  assert.equal(f.actor.getFlag(moduleId,'concurrentOps').check.id,'new-check');
});
