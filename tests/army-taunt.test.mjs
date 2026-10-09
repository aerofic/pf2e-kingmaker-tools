import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const main = readFileSync(new URL('../dist/main.js',import.meta.url),'utf8');
const overrides = main.slice(main.indexOf('function get_isArmyTactic('),main.indexOf('function isHiddenFromArmyTraining('));
const zh = '<p><strong>需求</strong> @UUID[requirement]</p><p>@Check[morale|defense:morale|roller:self]</p><p><strong>大成功</strong> 目标敌军陷入@UUID[shaken]{动摇 Shaken 2}，直到你的下个回合开始。</p><p><strong>成功</strong> 目标敌军陷入动摇 1，直到你的下个回合开始。</p><p><strong>大失败</strong> 目标敌军的动摇状态减少 1 点。</p>';
const en = '<p><strong>Requirement</strong> @UUID[requirement]</p><p>@Check[morale|defense:morale|roller:self]</p><p><strong>Critical Success</strong> The target army becomes @UUID[shaken]{Shaken 2} until the start of your next turn.</p><p><strong>Success</strong> The target army becomes shaken 1 until the start of your next turn.</p><p><strong>Critical Failure</strong> This reduces the target army\'s shaken value by 1.</p>';
function item(description=zh,category='army-war-action') {
  return {system:{campaign:'kingmaker',category,slug:'taunt',description:{value:description}},
    writes:0,updateSource(data){this.writes++;this.system.description.value=data['system.description.value'];}};
}
function setup() {
  const events = new Map();
  const context = vm.createContext({console,HTMLElement:class {},
    getProperty:(o,path)=>path.split('.').reduce((v,k)=>v?.[k],o),
    game:{i18n:{lang:'cn'},packs:new Map(),items:[],actors:[]},canvas:{scene:null},
    implementation:{enrichHTML:async text=>text},
    Hooks:{on:(event,fn)=>events.set(event,fn),once:(event,fn)=>events.set(event,fn)}});
  vm.runInContext(overrides,context);
  return {context,events};
}
for (const [language,description,phrase] of [['Chinese',zh,'，直到你的下个回合开始'],['English',en,' until the start of your next turn']]) {
  test(`Taunt ${language} removes only the success duration and is idempotent`,()=>{
    const {context:c}=setup(),target=item(description);
    c.applyTauntArmyActionOverride(target);
    assert.equal(target.system.description.value,description.replaceAll(phrase,''));
    c.applyTauntArmyActionOverride(target);
    assert.equal(target.writes,1);
    const other=item(description,'army-tactic');
    c.applyTauntArmyActionOverride(other);
    assert.equal(other.system.description.value,description);assert.equal(other.writes,0);
  });
}
test('Taunt override reaches compendium, world items, armies, tokens, creation and sheet rendering',async()=>{
  const {context:c,events}=setup();
  const compendium=item(),world=item(),armyItem=item(),tokenItem=item(),created=item(),sheetItem=item();
  c.game.packs.set('pf2e.kingmaker-features',{getDocument:async id=>id==='ggVahjiAlVICpiPA'?compendium:{system:{}}});
  c.game.items=[world];c.game.actors=[{type:'army',items:[armyItem]}];
  c.canvas.scene={tokens:[{actor:{type:'army',items:[tokenItem]}}]};
  c.registerArmyTacticOverrides();
  events.get('ready')();await Promise.resolve();
  events.get('canvasReady')();events.get('preCreateItem')(created);
  const content={isConnected:true,innerHTML:''},root=new c.HTMLElement();
  root.querySelector=()=>content;
  events.get('renderItemSheet')({item:sheetItem},root);await new Promise(resolve=>setImmediate(resolve));
  for (const target of [compendium,world,armyItem,tokenItem,created,sheetItem]) {
    assert.equal(target.system.description.value,zh.replaceAll('，直到你的下个回合开始',''));
  }
  assert.equal(content.innerHTML,sheetItem.system.description.value);
});
