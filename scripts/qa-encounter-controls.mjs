// Optional isolated browser QA. No connection to, or writes in, a Foundry world.
// Arguments: --playwright <package> --handlebars <package> --foundry <local install> --output <directory>
import assert from 'node:assert/strict';
import {readFileSync, mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {resolve, relative, extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const args = Object.fromEntries(Array.from({length: (process.argv.length - 2) / 2}, (_, i) => [process.argv[2 + i * 2], process.argv[3 + i * 2]]));
for (const key of ['--playwright', '--handlebars', '--foundry', '--output']) if (!args[key]) throw new Error(`Missing ${key}`);
const require = createRequire(import.meta.url);
const {chromium} = require(resolve(args['--playwright']));
const Handlebars = require(resolve(args['--handlebars']));
const root = fileURLToPath(new URL('../', import.meta.url));
const foundryRoot = resolve(args['--foundry'], 'public');
const output = resolve(args['--output']);
mkdirSync(output, {recursive: true});
const fullTemplate = readFileSync(resolve(root, 'dist/applications/camping/camping-sheet.hbs'), 'utf8');
const template = fullTemplate.slice(fullTemplate.indexOf('<div id="km-camping-hexploration"'), fullTemplate.indexOf('<ul class="km-camping-actors">'));
const handlebarsPath = resolve(args['--handlebars'], 'dist/handlebars.js');
Handlebars.precompile(template); // Fail before launching if the production template is malformed.
const translations = Object.fromEntries(['cn', 'en'].map(lang => [lang, JSON.parse(readFileSync(resolve(root, `dist/lang/${lang}.json`), 'utf8'))["pf2e-kingmaker-tools"]]));
const server = createServer((request, response) => {
  if (request.url === '/') {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end('<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/foundry/fonts/fontawesome/css/all.min.css"><link rel="stylesheet" href="/foundry/css/foundry2.css"><link rel="stylesheet" href="/module/dist/applications/camping/camping.css"><style>body{display:block;overflow:auto;padding:24px}.application{position:relative;inset:auto;width:970px;max-width:calc(100vw - 48px);height:auto;padding:12px}#km-camping-encounter{max-width:100%}#qa{margin-top:24px}</style></head><body class="theme-dark"><div id="qa" class="application km-camping-sheet"><form></form></div></body></html>');
    return;
  }
  const match = /^\/(foundry|module)\/(.*)$/.exec(decodeURIComponent(request.url.split('?')[0]));
  if (!match) {response.writeHead(404); response.end(); return;}
  const base = match[1] === 'foundry' ? foundryRoot : root;
  const path = resolve(base, match[2]);
  if (relative(base, path).startsWith('..')) {response.writeHead(403); response.end(); return;}
  try {
    response.setHeader('Content-Type', ({'.css':'text/css', '.js':'text/javascript', '.woff2':'font/woff2'})[extname(path)] || 'application/octet-stream');
    response.end(readFileSync(path));
  } catch {response.writeHead(404); response.end();}
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser;
try {
  browser = await chromium.launch({headless: true, channel: args['--channel'] || 'msedge'});
  const page = await browser.newPage({viewport: {width: 1120, height: 400}});
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.addScriptTag({path: handlebarsPath});
  await page.evaluate(({template, translations}) => {
    const scope = 'pf2e-kingmaker-tools';
    const data = {restOperationVersion: 0, encounterModifier: 0};
    const actor = {type:'party', id:'party', uuid:'Actor.qa', canUserModify:()=>true};
    const scene = {id:'AJ1k5II28u72JOmz', grid:{isHexagonal:true, getOffset:()=>({i:0,j:0})}};
    scene.tokens = [{id:'token', actor, getCenterPoint:()=>({x:50,y:50})}];
    globalThis.game = {i18n:{lang:'cn'}, user:{isGM:true}, scenes:new Map([[scene.id,scene]]), modules:new Map([['pf2e-kingmaker',{active:true}]])};
    globalThis.kingmaker = {api:{KingmakerHex:{getKey:()=>0}}, region:{scene, hexes:new Map([[0,{data:{features:[{type:'road'}]}}]])}};
    globalThis.foundry = {utils:{deepClone:value=>structuredClone(value)}};
    globalThis.foundryvttKotlinPatches = {concurrency:{
      text:(cn,en)=>game.i18n.lang==='cn'?cn:en,
      equal:(a,b)=>JSON.stringify(a)===JSON.stringify(b),
      notify:error=>{throw error;},
      async request(kind, packet) {
        const next=foundryvttKotlinPatches.encounterConditions.applyMutation(actor,data,packet);
        for(const key of Object.keys(data)) delete data[key]; Object.assign(data,next);
      }
    }};
    const get = (obj,key)=>key.split('.').reduce((o,k)=>o?.[k],obj);
    Handlebars.registerHelper('localizeKM', key=>get(translations[game.i18n.lang],key)??key);
    Handlebars.registerHelper('checked', value=>value?'checked':'');
    Handlebars.registerPartial('formElement','<select aria-label="Region"><option>{{value}}</option></select>');
    const render = Handlebars.compile(template);
    globalThis.qaApp = {r4f_1:actor,element:document.querySelector('#qa'), async render() {
      const conditions=foundryvttKotlinPatches.encounterConditions.context(this,actor,data);
      this.element.querySelector('form').innerHTML=render({isGM:game.user.isGM, region:{value:game.i18n.lang==='cn'?'绿地':'Greenbelt'},adventuringFor:'4h',hexplorationActivitiesAvailable:'1',hexplorationActivitiesMax:'2',encounterDc:14+conditions.modifier,encounterConditions:conditions,canRollEncounter:true});
    }};
    qaApp.element.addEventListener('click',event=>{
      const target=event.target.closest('[data-action="encounter-condition"]');
      if(target) foundryvttKotlinPatches.encounterConditions.click(qaApp,event,target);
    });
  }, {template, translations});
  await page.addScriptTag({path: resolve(root,'dist/api/encounter-conditions.js')});
  await page.evaluate(()=>qaApp.render());
  const road=page.locator('[data-encounter-condition="roadRiver"]');
  const flying=page.locator('[data-encounter-condition="flying"]');
  assert.equal(await road.isChecked(),true);
  await road.click();
  await page.waitForFunction(()=>document.querySelector('[data-encounter-condition="autoRoad"]'));
  assert.equal(await road.isChecked(),false);
  await flying.focus(); await flying.press('Space');
  await page.waitForFunction(()=>document.querySelector('[data-encounter-condition="flying"]').checked);
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.encounterCondition),'flying');
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:resolve(output,'encounter-cn-dark.png'), animations:'disabled'});
  await page.locator('[data-encounter-condition="autoRoad"]').click();
  await page.waitForFunction(()=>!document.querySelector('[data-encounter-condition="autoRoad"]'));
  assert.equal(await road.isChecked(),true);
  for(const [lang,theme,width] of [['en','theme-light',1120],['cn','theme-light',780]]) {
    await page.setViewportSize({width,height:400});
    await page.evaluate(async({lang,theme})=>{game.i18n.lang=lang;document.body.className=theme;await qaApp.render();},{lang,theme});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    assert.equal(overflow,false,`${lang} ${width}px must not overflow horizontally`);
    await page.evaluate(()=>document.fonts.ready);
    await page.waitForLoadState('networkidle');
    await page.screenshot({path:resolve(output,`encounter-${lang}-${theme}-${width}.png`), animations:'disabled'});
  }
  await page.evaluate(async()=>{game.user.isGM=false;await qaApp.render();});
  assert.equal(await page.locator('[data-action="encounter-condition"]').count(),0);
  assert.deepEqual(errors,[]);
  console.log(`Isolated browser QA passed: mouse, keyboard, focus, auto reset, GM-only UI, Chinese/English, dark/light, narrow layout. Screenshots: ${output}`);
} finally {
  await browser?.close();
  await new Promise(done=>server.close(done));
}
