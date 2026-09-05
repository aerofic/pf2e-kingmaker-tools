import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import vm from 'node:vm';

export const moduleId = 'pf2e-kingmaker-tools';
export function applyUpdate(target, update) {
  for (const [path,value] of Object.entries(update)) {
    const parts = path.split('.'); let parent = target;
    for (const part of parts.slice(0,-1)) parent = parent[part] ??= {};
    const key = parts.at(-1);
    if (key.startsWith('-=')) delete parent[key.slice(2)];
    else parent[key] = structuredClone(value);
  }
  return target;
}
// Narrow Foundry document-boundary fixture. Arrays replace; plain objects merge;
// deletion keys and dotted paths model the patch format used by this module.
export function mergeObject(base, patch) {
  for (const [key,value] of Object.entries(patch)) {
    if (key.includes('.') || key.startsWith('-=')) applyUpdate(base,{[key]:value});
    else if (value && typeof value === 'object' && !Array.isArray(value)) base[key] = mergeObject(base[key] && typeof base[key] === 'object' && !Array.isArray(base[key]) ? base[key] : {},value);
    else base[key] = structuredClone(value);
  }
  return base;
}
export function fixture({bundle, kingdom = {modifiers:[]}, camping = {restOperationVersion:0,watchSecondsRemaining:0,section:'old'}} = {}) {
  const users = [{id:'gm',active:true,isGM:true},{id:'gm2',active:true,isGM:true},{id:'player',active:true,isGM:false},{id:'other',active:true,isGM:false}];
  users.get = id => users.find(user => user.id === id);
  const state = {flags:{[moduleId]:{'kingdom-sheet':kingdom,'camping-sheet':camping,kingdomTurn:11}}};
  const updates = [], errors = [], contexts = [], messages = new Map();
  let beforeUpdate = async()=>{}, postCount=0, chatCount=0;
  const socketListeners = [];
  let relayFilter = () => true;
  const actor = {
    uuid:'Actor.party', type:'party',
    getFlag:(scope,key) => key.split('.').reduce((obj,part)=>obj?.[part], state.flags[scope]),
    canUserModify:user => user.id !== 'other',
    async update(data) { await beforeUpdate(data); updates.push(structuredClone(data)); applyUpdate(state,data); return actor; },
    async setFlag(scope,key,value) {return actor.update({[`flags.${scope}.${key}`]:value});}
  };
  function addClient(userId, supplied) {
    const hooks = new Map();
    const c = supplied || vm.createContext({console:{error(){},warn(){}},setTimeout,clearTimeout,structuredClone,foundry:{utils:{}},foundryvttKotlinPatches:{},Hooks:{on:(name,fn)=>hooks.set(name,fn)}});
    c.game = {ready:true,user:users.get(userId),users,messages,i18n:{lang:'cn'},socket:{
      on:(channel,fn)=>socketListeners.push({userId,fn}),
      emit:(channel,message)=>{
        for(const listener of socketListeners) if(listener.userId!==userId && relayFilter(message,userId,listener.userId)) queueMicrotask(()=>listener.fn(structuredClone(message),userId));
      }
    }};
    c.ui = {notifications:{error:message=>errors.push(message)}};
    c.foundry.utils.deepClone = structuredClone;
    c.foundry.utils.randomID = () => randomBytes(12).toString('hex');
    c.foundry.utils.mergeObject = mergeObject;
    if (!supplied) vm.runInContext(readFileSync(new URL('../../dist/api/concurrency.js',import.meta.url),'utf8'),c);
    const api = c.foundryvttKotlinPatches.concurrency;
    api.install({fromUuid:async uuid=>uuid===actor.uuid?actor:null,canUpdate:(doc,user)=>doc.canUserModify(user),isParty:()=>true,turn:doc=>doc.getFlag(moduleId,'kingdomTurn'),
      endTurn:(doc,data)=>({...data,resourcePoints:{now:data.resourcePoints.next,next:0},modifiers:data.modifiers.filter(m=>m.turns!==1).map(m=>({...m,turns:m.turns ? m.turns-1:m.turns}))}),
      postEndTurn:async()=>{postCount++;},chatButton:(message,key)=>message.buttons[key],validateChat:async()=>{},executeChat:async()=>{chatCount++;}
    });
    contexts.push(c); return c;
  }
  const gm = addClient('gm',bundle);
  return {gm,actor,state,updates,errors,users,messages,contexts,addClient,
    get api(){return gm.foundryvttKotlinPatches.concurrency;},
    get kingdom(){return state.flags[moduleId]['kingdom-sheet'];},
    get camping(){return state.flags[moduleId]['camping-sheet'];},
    get postCount(){return postCount;},get chatCount(){return chatCount;},
    set beforeUpdate(fn){beforeUpdate=fn;},set relayFilter(fn){relayFilter=fn;},
    message(id='card',version=1){
      const value={id,whisper:[],blind:false,author:users.get('player'),buttons:{b0:{},b1:{}},flags:{[moduleId]:{onceVersion:version}},
        getFlag(scope,key){return key.split('.').reduce((obj,part)=>obj?.[part],this.flags[scope]);},
        async setFlag(scope,key,v){applyUpdate(this,{[`flags.${scope}.${key}`]:v});return this;}};
      messages.set(id,value);return value;
    }
  };
}
