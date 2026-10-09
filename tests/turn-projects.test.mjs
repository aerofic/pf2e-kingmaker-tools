import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fixture,moduleId,applyUpdate} from './helpers/concurrency-fixture.mjs';
import {loadBundle} from './helpers/bundle-harness.mjs';

function setup() {
  const f=fixture({kingdom:{resourcePoints:{now:40,next:0},modifiers:[],groups:[{id:'ally',name:'Ally',relations:'diplomaticRelations',negotiationDC:18}]}});
  const c=f.gm;
  vm.runInContext(readFileSync(new URL('../dist/api/turn-projects.js',import.meta.url),'utf8'),c);
  const state={system:{attributes:{hp:{value:5,max:50}}},flags:{[moduleId]:{}}};
  let writes=0, before=async()=>{};
  const target={uuid:'Scene.settlement.Token.structure.Actor.structure',getFlag:(scope,key)=>state.flags[scope][key],canUserModify:user=>user.id!=='other',async update(data){await before(data);applyUpdate(state,data);writes++;return target;}};
  let available=true;
  const projects=c.foundryvttKotlinPatches.turnProjects;
  projects.install({projects:()=>available?[{id:target.uuid,document:target,label:'Castle',current:state.system.attributes.hp.value,total:50,dc:20,die:8,ongoingLimit:12,edifice:false,skills:{engineering:1}}]:[]});
  const context={kind:'accelerate',targetId:target.uuid,turn:11,dc:22};
  const request=(kind,data,id)=>f.api.request(kind,{actorUuid:f.actor.uuid,...data},id);
  const check=async(degree='success',ctx=context)=>{
    const result=await request('beginCheck',{modifiers:[],target:ctx});
    await request('projectResult',{checkId:result.id,degree});
    await request('consumeModifiers',{checkId:result.id,ids:[]});
    return result.id;
  };
  return {f,c,projects,state,target,request,context,check,get writes(){return writes;},set before(fn){before=fn;},set available(v){available=v;}};
}

test('acceleration caps respect success, critical success and edifice',()=>{
  const h=setup();
  assert.equal(h.projects.limit('criticalSuccess',8,false),12);
  assert.equal(h.projects.limit('success',8,false),8);
  assert.equal(h.projects.limit('criticalSuccess',8,true),8);
  assert.equal(h.projects.limit('success',8,true),4);
  assert.equal(h.projects.limit('criticalFailure',8,true),0);
});
test('result, target and degree are persisted once; target cannot be attempted twice in one turn',async()=>{
  const h=setup(), id=await h.check();
  assert.equal(h.projects.ledger(h.f.actor).attempts[0].id,id);
  assert.equal(h.projects.ledger(h.f.actor).attempts[0].limit,8);
  await assert.rejects(h.check(),/已对这个目标/);
  assert.equal(h.projects.ledger(h.f.actor).attempts.length,1);
});
test('DC or turn changed before roll does not reserve check or consume attempt',async()=>{
  const h=setup();
  await assert.rejects(h.request('beginCheck',{modifiers:[],target:{...h.context,dc:23}}),/DC/);
  await assert.rejects(h.request('beginCheck',{modifiers:[],target:{...h.context,turn:10}}),/回合/);
  assert.equal(h.f.actor.getFlag(moduleId,'concurrentOps'),undefined);
});
test('duplicate spend packet adds progress and deducts RP once',async()=>{
  const h=setup(), id=await h.check();
  const data={targetId:h.target.uuid,turn:11,amount:8,attemptId:id};
  await Promise.all([h.request('projectSpend',data,'pay'),h.request('projectSpend',data,'pay')]);
  assert.equal(h.f.kingdom.resourcePoints.now,32);
  assert.equal(h.state.system.attributes.hp.value,13);
  assert.equal(h.writes,1);
  await assert.rejects(h.request('projectSpend',data,'extra'),/超过/);
});
test('partial accelerated payments share the result allowance',async()=>{
  const h=setup(),id=await h.check();
  for(const amount of [3,5]) await h.request('projectSpend',{targetId:h.target.uuid,turn:11,amount,attemptId:id});
  assert.equal(h.state.system.attributes.hp.value,13);
  await assert.rejects(h.request('projectSpend',{targetId:h.target.uuid,turn:11,amount:1,attemptId:id}),/超过/);
});
test('canceling target or payment dialog performs no writes',async()=>{
  const h=setup(); h.c.foundry.applications={api:{DialogV2:{input:async()=>null}}};
  assert.equal(await h.projects.prepare(h.f.actor,{id:'accelerate-project'}),false);
  await h.projects.payDialog(h.f.actor,h.target.uuid,null);
  assert.equal(h.f.updates.length,0);assert.equal(h.writes,0);
});
test('canceling foreign aid group selection exits without dialogs, writes or attempts',async()=>{
  const h=setup();
  for (const group of [null,undefined]) {
    assert.equal(await h.projects.prepare(h.f.actor,{id:'request-foreign-aid-vk'},group),false);
  }
  assert.equal(h.f.updates.length,0);assert.equal(h.writes,0);
  assert.equal(h.projects.ledger(h.f.actor).attempts.length,0);
  assert.equal(h.f.kingdom.resourcePoints.now,40);
});
test('selected foreign aid group without an ID still fails validation',async()=>{
  const h=setup();
  await assert.rejects(h.projects.prepare(h.f.actor,{id:'request-foreign-aid-vk'},{name:'Ally',negotiationDC:18}),/初始化团体标识/);
  assert.equal(h.f.updates.length,0);assert.equal(h.writes,0);
});
test('debit failure before commit leaves progress untouched and retry succeeds',async()=>{
  const h=setup(); h.f.beforeUpdate=async()=>{throw Error('offline');};
  const data={targetId:h.target.uuid,turn:11,amount:4};
  await assert.rejects(h.request('projectSpend',data,'retry'),/offline/);
  assert.equal(h.writes,0);assert.equal(h.f.kingdom.resourcePoints.now,40);
  h.f.beforeUpdate=async()=>{};
  await h.request('projectSpend',data,'retry');
  assert.equal(h.f.kingdom.resourcePoints.now,36);
});
test('lost debit acknowledgement can resume persisted payment after reload without a second debit',async()=>{
  const h=setup(), original=h.f.actor.update;
  let once=true;
  h.f.actor.update=async data=>{const value=await original(data);if(once){once=false;throw Error('lost ack');}return value;};
  await assert.rejects(h.request('projectSpend',{targetId:h.target.uuid,turn:11,amount:4},'lost-debit'));
  await h.request('projectSpend',{paymentId:'lost-debit'},'resumed');
  assert.equal(h.f.kingdom.resourcePoints.now,36);assert.equal(h.state.system.attributes.hp.value,9);
});
test('lost structure acknowledgement recovers via receipt without adding HP twice',async()=>{
  const h=setup(),original=h.target.update;let once=true;
  h.target.update=async data=>{const value=await original(data);if(once){once=false;throw Error('lost structure ack');}return value;};
  await assert.rejects(h.request('projectSpend',{targetId:h.target.uuid,turn:11,amount:4},'lost-hp'));
  await h.request('projectSpend',{paymentId:'lost-hp'});
  assert.equal(h.writes,1);assert.equal(h.f.kingdom.resourcePoints.now,36);assert.equal(h.state.system.attributes.hp.value,9);
});
test('interrupted structure save does not freeze end turn; pending intent remains resumable',async()=>{
  const h=setup();h.before=async()=>{throw Error('offline');};
  await assert.rejects(h.request('projectSpend',{targetId:h.target.uuid,turn:11,amount:4},'pending'));
  await h.request('endTurn',{expectedTurn:11});
  h.before=async()=>{};
  await h.request('projectSpend',{paymentId:'pending'});
  assert.equal(h.state.system.attributes.hp.value,9);
  assert.equal(h.f.kingdom.resourcePoints.now,0);
});
test('changed or deleted target never silently replays; GM can explicitly reconcile',async()=>{
  const h=setup();h.before=async()=>{throw Error('offline');};
  await assert.rejects(h.request('projectSpend',{targetId:h.target.uuid,turn:11,amount:4},'pending'));
  h.before=async()=>{};h.state.system.attributes.hp.value=20;
  await assert.rejects(h.request('projectSpend',{paymentId:'pending'}),/进度发生变化/);
  h.available=false;
  await h.request('projectReconcile',{paymentId:'pending',resolution:'manual'});
  assert.equal(h.projects.ledger(h.f.actor).payments[0].status,'manual');
  assert.equal(h.f.kingdom.resourcePoints.now,36);
});
test('ongoing construction shares cumulative cap and critical failure penalty, reset by committed turn ID',async()=>{
  const h=setup();await h.check('criticalFailure');
  await h.request('projectSpend',{targetId:h.target.uuid,turn:11,amount:4});
  await assert.rejects(h.request('projectSpend',{targetId:h.target.uuid,turn:11,amount:1}),/超过/);
  h.f.kingdom.resourcePoints.next=30;
  await h.request('endTurn',{expectedTurn:11});
  await h.request('endTurn',{expectedTurn:11});
  await h.request('projectSpend',{targetId:h.target.uuid,turn:12,amount:12});
  assert.equal(h.state.system.attributes.hp.value,21);
});
test('aid history survives renaming; skipped turns decay the extra DC to zero',async()=>{
  const h=setup(),ctx={kind:'aid',targetId:'ally',turn:11,dc:20};
  await h.check('failure',ctx);
  h.f.kingdom.groups[0].name='Renamed';
  await h.request('endTurn',{expectedTurn:11});
  assert.equal(h.projects.aidExtra(h.projects.ledger(h.f.actor),'ally',12),2);
  await h.check('success',{...ctx,turn:12,dc:22});
  const state=h.projects.ledger(h.f.actor);
  assert.equal(state.attempts[1].label,'Renamed');
  assert.equal(h.projects.aidExtra(state,'ally',13),4);
  assert.equal(h.projects.aidExtra(state,'ally',14),3);
  assert.equal(h.projects.aidExtra(state,'ally',18),0);
});
test('group ID initialization is idempotent and differentiates same-name groups',async()=>{
  const h=setup();h.f.kingdom.groups=[{name:'same'},{name:'same'}];
  await h.request('projectGroups',{});const ids=h.f.kingdom.groups.map(g=>g.id);
  await h.request('projectGroups',{});
  assert.deepEqual(h.f.kingdom.groups.map(g=>g.id),ids);assert.notEqual(ids[0],ids[1]);
});
test('unauthorized clients and owner attempts to reconcile are rejected',async()=>{
  const h=setup(),other=h.f.addClient('other').foundryvttKotlinPatches.concurrency;
  await assert.rejects(other.request('projectSpend',{actorUuid:h.f.actor.uuid,targetId:h.target.uuid,turn:11,amount:4}),/无法更新/);
  const player=h.f.addClient('player').foundryvttKotlinPatches.concurrency;
  await assert.rejects(player.request('projectReconcile',{actorUuid:h.f.actor.uuid,paymentId:'x',resolution:'manual'}),/只有 GM/);
});
test('two clients spend within one shared cap through authoritative GM',async()=>{
  const h=setup(),player=h.f.addClient('player').foundryvttKotlinPatches.concurrency;
  const data={actorUuid:h.f.actor.uuid,targetId:h.target.uuid,turn:11,amount:8};
  const results=await Promise.allSettled([h.f.api.request('projectSpend',data),player.request('projectSpend',data)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(h.f.kingdom.resourcePoints.now,32);assert.equal(h.writes,1);
});
test('actual bundle resolves project targets only from the party settlements',()=>{
  const c=loadBundle();c.testActor={};
  const doc={uuid:'Actor.building',name:'Building',hitPoints:{value:2,max:20}};
  c.game.scenes=new Map([['s',{name:'Town',tokens:{contents:[{actor:doc},{actor:doc}]}}],['unrelated',{tokens:{contents:[{actor:{uuid:'Actor.other'}}]}}]]);
  c.audit(`getKingdom=()=>({settlements:[{sceneId:'s'}]});getRealmData=()=>({a3a_1:{t39_1:{t3a_1:8},x39_1:12}});getRawResolvedStructureData=()=>({construction:{dc:20,skills:[{skill:'engineering',proficiencyRank:1}]},traits:['edifice']});`);
  const targets=c.audit('kmProjectTargets(testActor)');
  assert.equal(targets.length,1);assert.equal(targets[0].id,'Actor.building');assert.equal(targets[0].edifice,true);assert.equal(targets[0].die,8);
});
test('actual native callback binds the selected target and degree, records once, then offers RP after check cleanup',async()=>{
  const c=loadBundle();const f=fixture({bundle:c,kingdom:{modifiers:[],resourcePoints:{now:20,next:0},groups:[]}});
  c.foundryvttKotlinPatches.turnProjects.install({projects:()=>[{id:'project',document:f.actor,label:'Test',current:1,total:20,dc:18,die:6,ongoingLimit:8}]});
  const order=[];c.order=order;c.actor=f.actor;
  c.foundryvttKotlinPatches.turnProjects.payDialog=async()=>{assert.equal(f.actor.getFlag(moduleId,'concurrentOps').check.status,'done');order.push('payment');};
  c.audit(`globalThis.dialog={d5d_1:actor,e5d_1:{modifiers:[]},g5d_1:function*(){order.push('original');}};
    kmBindProjectCheck(dialog,{kind:'accelerate',turn:11,targetId:'project',dc:20});
    globalThis.runCheck=()=>kmRunKingdomCheck(dialog,async()=>{
      await buildPromise((scope,next)=>dialog.g5d_1(DegreeOfSuccess_SUCCESS_getInstance(),next));
      await kmConcurrent.request('consumeModifiers',{actorUuid:actor.uuid,checkId:dialog.__kmCheckId,ids:[]});
    });`);
  await c.runCheck();await c.runCheck();
  assert.deepEqual(order,['original','payment']);
  assert.equal(c.foundryvttKotlinPatches.turnProjects.ledger(f.actor).attempts[0].degree,'success');
});
test('roll-time snapshot is retained if construction changes during the check',async()=>{
  const h=setup();const op=await h.request('beginCheck',{modifiers:[],target:h.context});
  h.state.system.attributes.hp.value=50;
  await h.request('projectResult',{checkId:op.id,degree:'success'});
  assert.equal(h.projects.ledger(h.f.actor).attempts[0].dc,22);
  await assert.rejects(h.request('projectSpend',{targetId:h.target.uuid,attemptId:op.id,turn:11,amount:1}),/已完成/);
});
test('group form context retains stable IDs when names are edited',()=>{
  const c=loadBundle();c.game.i18n.localize=key=>key;c.group=[{id:'stable',name:'Renamed',negotiationDC:20,relations:'diplomaticRelations',atWar:false,preventPledgeOfFealty:false}];
  const result=c.audit('toContext_13(group)');
  assert.equal(result[0].id,'stable');
});
