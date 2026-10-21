import assert from 'node:assert/strict';
import test from 'node:test';
import {loadBundle} from './helpers/bundle-harness.mjs';

function runtime() {
  const c = loadBundle();
  c.audit(`
    t_0 = key => 'translated:' + key;
    t_1 = value => value.p3();
    globalThis.prepareEdit = prepareKingdomModifierEdit;
    globalThis.mergeEdit = mergeKingdomModifierEdit;
  `);
  return c;
}
const plain = value => JSON.parse(JSON.stringify(value));

test('modifier editing prefills simple conditions while preserving event automation', () => {
  const c = runtime();
  const raw = {id:'event-1', name:'event.name', buttonLabel:'event.description',
    requiresTranslation:true, value:-1, turns:2, enabled:false,
    applyIf:[{in:['@skill',['magic']]},{some:[{eq:['@event','cult']}]},
      {in:['@activity',['a','b']]}], valueExpression:'@unrest',
    downgradeResults:1, rollOptions:['cult'], notes:['note'], i18nContext:{count:2}};
  const before = structuredClone(raw);
  const prepared = plain(c.prepareEdit(raw));
  assert.equal(prepared.fields.name,'translated:event.name');
  assert.equal(prepared.fields.buttonLabel,'translated:event.description');
  assert.equal(prepared.fields.skill,'magic');
  assert.equal(prepared.fields.enabled,false);
  const edited = {name:'改名', buttonLabel:'新描述', requiresTranslation:false,
    value:2, turns:4, enabled:true, applyIf:[{in:['@skill',['agriculture']]}]};
  const result = plain(c.mergeEdit(raw,edited));
  assert.equal(result.id, raw.id);
  assert.equal(result.value,2);
  assert.deepEqual(result.applyIf,[...raw.applyIf.slice(1),...edited.applyIf]);
  for (const key of ['valueExpression','downgradeResults','rollOptions','notes','i18nContext'])
    assert.deepEqual(result[key],raw[key]);
  assert.deepEqual(raw,before);
});

test('actual modifier save updates fields and keeps unknown metadata', () => {
  const c = runtime();
  c.audit(`
    const raw = {id:'fixed',name:'Old',buttonLabel:'Old description',type:'circumstance',
      value:-1,selector:'check',applyIf:[{eq:['@event','cult']},{in:['@skill',['magic']]}],
      upgradeResults:1,notes:['Retained']};
    const form = Object.create(AddModifier.prototype);
    form.initialModifier = raw;
    form.t53_1 = [];
    form.v53_1 = {...prepareKingdomModifierEdit(raw).fields, name:'New', value:3,
      skill:'agriculture', turns:2, enabled:false, isConsumedAfterRoll:true,
      buttonLabel:'New description'};
    form.u53_1 = function*(modifier) {globalThis.savedModifier = modifier;};
    form.close = () => {globalThis.closed = true;};
    buildPromise = callback => {
      const step = callback(null,null).next();
      if (!step.done) throw Error('Unexpected async boundary');
    };
    form.h3x(null,{dataset:{action:'km-save'}});
  `);
  const q = plain(c.savedModifier);
  assert.equal(q.id,'fixed');
  assert.equal(q.name,'New');
  assert.equal(q.value,3);
  assert.equal(q.buttonLabel,'New description');
  assert.equal(q.turns,2);
  assert.equal(q.enabled,false);
  assert.equal(q.isConsumedAfterRoll,true);
  assert.equal(q.upgradeResults,1);
  assert.deepEqual(q.notes,['Retained']);
  assert.deepEqual(q.applyIf,[{eq:['@event','cult']},{in:['@skill',['agriculture']]}]);
  assert.equal(c.closed,true);
});

test('editor checks permission on open and save and retains the original write baseline', () => {
  const c = runtime();
  c.audit(`
    let allowed = false;
    const baseline = {modifiers:[{id:'a'},{id:'b'}]};
    const actor = {canUserModify:()=>allowed};
    const sheet = {r5q_1:actor};
    getKingdom_0 = () => baseline;
    getAllActivities_0 = () => _kotlin_kotlin_stdlib_mjs__WEBPACK_IMPORTED_MODULE_2__.emptyList1g2z5xcrvp2zy();
    AddModifier = class {constructor(activities,onSave,raw) {this.save=onSave;this.raw=raw;}};
    launch = editor => {globalThis.editor=editor;};
    setKingdom = function*(savedActor,data) {
      if (savedActor !== actor || data !== baseline) throw Error('Lost edit baseline');
      globalThis.savedIds=data.modifiers.map(m=>m.id);
    };
    openKingdomModifierEditor(sheet,'1');
    if (globalThis.editor) throw Error('Unauthorized open');
    allowed=true;
    for (const invalid of ['-1','','bad','99']) openKingdomModifierEditor(sheet,invalid);
    if (globalThis.editor) throw Error('Invalid index accepted');
    openKingdomModifierEditor(sheet,'1');
    if (editor.raw.id !== 'b') throw Error('Wrong modifier selected');
    allowed=false;
    editor.save({id:'changed'}).next();
    if (globalThis.savedIds) throw Error('Unauthorized save');
    allowed=true;
    editor.save({id:'changed'}).next();
  `);
  assert.deepEqual(plain(c.savedIds),['a','changed']);
});
