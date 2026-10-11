import assert from 'node:assert/strict';
import test from 'node:test';
import {loadBundle} from './helpers/bundle-harness.mjs';

const c=loadBundle();
c.audit(`globalThis.anarchyResults=(activity,unrest,anarchyAt)=>{
  const k=_kotlin_kotlin_stdlib_mjs__WEBPACK_IMPORTED_MODULE_2__;
  const context=new ExpressionContext(null,null,null,activity,null,1,unrest,k.emptySetcxexqki71qfa(),null,null,anarchyAt,false,null,null,null,null,null,0);
  const filtered=filterModifiersAndUpdateContext(k.listOfvhqybd2zx248(createAnarchyPenalty()),context,ModifierSelector_CHECK_getInstance());
  const result=evaluateModifiers(filtered);
  return [DegreeOfSuccess_CRITICAL_FAILURE_getInstance(),DegreeOfSuccess_FAILURE_getInstance(),DegreeOfSuccess_SUCCESS_getInstance(),DegreeOfSuccess_CRITICAL_SUCCESS_getInstance()]
    .map(degree=>determineDegree(degree,result.b3q_1,result.c3q_1).o3m_1.a4_1);
};`);
const results=(activity,unrest,threshold)=>Array.from(c.anarchyResults(activity,unrest,threshold));

test('anarchy downgrades other kingdom activities and generic/event checks exactly once, with a critical-failure floor',()=>{
  for (const activity of ['build-structure','claim-hex','request-foreign-aid-vk',null]) {
    assert.deepEqual(results(activity,20,20),[0,0,1,2],String(activity));
  }
});
test('Quell Unrest retains every original degree during anarchy',()=>{
  for (const unrest of [20,24,30]) {
    assert.deepEqual(results('quell-unrest',unrest,20),[0,1,2,3]);
  }
});
test('anarchy uses the configured threshold and stops downgrading once unrest is below it',()=>{
  assert.deepEqual(results('build-structure',19,20),[0,1,2,3]);
  assert.deepEqual(results('build-structure',23,24),[0,1,2,3]);
  assert.deepEqual(results('build-structure',24,24),[0,0,1,2]);
  assert.deepEqual(results('quell-unrest',24,24),[0,1,2,3]);
});
