/* 7.0 targeted activities. State lives on the party; no startup migration or global DOM observers. */
(() => {
  const moduleId = 'pf2e-kingmaker-tools';
  const key = 'turnProjects';
  const api = () => globalThis.foundryvttKotlinPatches.concurrency;
  const text = (cn, en) => api().text(cn, en);
  const clone = value => foundry.utils.deepClone(value);
  const turn = actor => Math.max(1, Number(actor.getFlag(moduleId, 'kingdomTurn')) || 1);
  const kingdom = actor => actor.getFlag(moduleId, 'kingdom-sheet');
  const fail = (cn, en) => { throw new Error(text(cn, en)); };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let adapter;
  function ledger(actor) {
    const value = actor.getFlag(moduleId, key);
    if (value && value.version !== 1) fail('不支持的工程台账版本。', 'Unsupported project ledger version.');
    return clone(value || {version:1, attempts:[], payments:[]});
  }
  function aidExtra(state, targetId, currentTurn) {
    const last = state.attempts.filter(a => a.kind === 'aid' && a.targetId === targetId).at(-1);
    return last ? Math.max(0, last.extra + 2 - Math.max(0, currentTurn - last.turn - 1)) : 0;
  }
  function limit(degree, die, edifice) {
    return degree === 'criticalSuccess' ? Math.floor(die * (edifice ? 1 : 1.5))
      : degree === 'success' ? Math.floor(die * (edifice ? 0.5 : 1)) : 0;
  }
  function project(actor, targetId, user, completed = false) {
    const p = adapter.projects(actor).find(p => p.id === targetId);
    if (!p || !p.document.canUserModify(user, 'update') || (!completed && p.current >= p.total)) {
      fail('建筑已变化、已完成或没有修改权限，请重新选择。', 'Project changed, completed, or is not editable. Select it again.');
    }
    if (![p.current,p.total,p.dc,p.die,p.ongoingLimit].every(Number.isFinite) || p.current < 0 || p.total <= 0) {
      fail('建筑建设数据不完整。', 'Incomplete construction data.');
    }
    return p;
  }
  function validate(actor, context, user) {
    if (game.modules?.get('vk-kingdom-turn-helper')?.active) fail('请停用外部王国回合辅助插件后再使用整合活动。','Disable the external turn helper before using integrated activities.');
    if (!context || !['accelerate','aid'].includes(context.kind) || context.turn !== turn(actor)) fail('回合已变化，请重新打开活动。','Turn changed; reopen the activity.');
    const state = ledger(actor);
    if (state.attempts.some(a => a.kind === context.kind && a.targetId === context.targetId && a.turn === context.turn)) fail('本回合已对这个目标执行过活动。','This target has already been attempted this turn.');
    if (context.kind === 'accelerate') {
      const p = project(actor, context.targetId, user);
      if (context.dc !== p.dc + 2) fail('建造 DC 已变化，请重新打开活动。','Construction DC changed; reopen the activity.');
      return {...context, label:p.label, die:p.die, edifice:p.edifice};
    }
    const group = kingdom(actor)?.groups?.find(g => g.id === context.targetId);
    if (!group || group.relations === 'none' || !Number.isFinite(group.negotiationDC)) fail('外交团体已变化，请重新选择。','Diplomatic group changed; select it again.');
    const extra = aidExtra(state, group.id, context.turn);
    if (context.dc !== group.negotiationDC + 2 + extra) fail('外援 DC 已变化，请重新打开活动。','Aid DC changed; reopen the activity.');
    return {...context, label:group.name, extra};
  }
  function record(actor, check, degree, user) {
    if (!['criticalSuccess','success','failure','criticalFailure'].includes(degree)) fail('无效检定结果。','Invalid check result.');
    const state = ledger(actor);
    if (state.attempts.some(a => a.id === check.id)) return {};
    // The roll is bound to the validated beginCheck snapshot, not changing
    // target DC/progress after the dice have already been rolled.
    const context = check.target;
    if (context.turn !== turn(actor)) fail('回合已变化。','Turn changed.');
    if (state.attempts.some(a=>a.kind===context.kind && a.targetId===context.targetId && a.turn===context.turn)) fail('目标已在本回合结算。','Target already resolved this turn.');
    state.attempts.push({...context,id:check.id,degree,at:Date.now(),limit:context.kind === 'accelerate' ? limit(degree,context.die,context.edifice) : 0});
    return {[`flags.${moduleId}.${key}`]:state};
  }
  function allowance(actor, state, p, attemptId) {
    const currentTurn = turn(actor);
    if (attemptId) {
      const attempt = state.attempts.find(a => a.id === attemptId && a.kind === 'accelerate' && a.targetId === p.id && a.turn === currentTurn);
      if (!attempt) fail('加速结果已过期或不属于此建筑。','Acceleration result expired or belongs to another project.');
      const spent = state.payments.filter(x => x.attemptId === attemptId && x.status !== 'refunded').reduce((n,x)=>n+x.amount,0);
      return Math.max(0, attempt.limit - spent);
    }
    const penalty = state.attempts.filter(a => a.kind === 'accelerate' && a.targetId === p.id && a.turn === currentTurn && a.degree === 'criticalFailure').reduce((n,a)=>n+a.die,0);
    const spent = state.payments.filter(x => !x.attemptId && x.targetId === p.id && x.turn === currentTurn && x.status !== 'refunded').reduce((n,x)=>n+x.amount,0);
    return Math.max(0,p.ongoingLimit - penalty - spent);
  }
  async function save(actor, state, update) {
    await update(actor, {[`flags.${moduleId}.${key}`]:state});
  }
  // Debit + durable intent is one party update. HP + receipt is one structure
  // update. Retrying a partially completed payment never debits or adds HP twice.
  async function spend(actor, data, user, requestId, update) {
    let state = ledger(actor);
    let payment = state.payments.find(p => p.id === (data.paymentId || requestId));
    if (data.paymentId && !payment) fail('找不到待处理记录。','Payment record not found.');
    if (payment && payment.status !== 'pending') return {status:payment.status};
    if (!payment) {
      if (data.turn !== turn(actor)) fail('回合已变化，请重新打开投入窗口。','Turn changed; reopen the payment dialog.');
      const p = project(actor,data.targetId,user);
      if (state.payments.some(x=>x.targetId===p.id && x.status==='pending')) fail('此建筑有待处理投入，请从工程记录继续或核对。','Project has a pending payment; resume or reconcile it in the ledger.');
      const maximum = Math.min(allowance(actor,state,p,data.attemptId),p.total-p.current,kingdom(actor).resourcePoints.now);
      if (!Number.isSafeInteger(data.amount) || data.amount <= 0 || data.amount > maximum) fail('投入超过当前可用 RP、进度缺口或本回合上限。','Payment exceeds current RP, remaining progress, or turn allowance.');
      payment = {id:requestId,targetId:p.id,label:p.label,turn:turn(actor),attemptId:data.attemptId || null,amount:data.amount,before:p.current,after:p.current+data.amount,status:'pending'};
      state.payments.push(payment);
      await update(actor, {
        [`flags.${moduleId}.kingdom-sheet.resourcePoints.now`]:kingdom(actor).resourcePoints.now-data.amount,
        [`flags.${moduleId}.${key}`]:state
      });
    }
    const p = project(actor,payment.targetId,user,true);
    const receipts = p.document.getFlag(moduleId,'projectPayments') || [];
    if (!receipts.includes(payment.id)) {
      if (p.current !== payment.before || p.total < payment.after) fail('RP 已记录扣除，但建筑进度发生变化。请在工程记录核对，不会再次扣费。','RP debit is recorded, but project progress changed. Reconcile in the ledger; no second debit.');
      await update(p.document, {'system.attributes.hp.value':payment.after,[`flags.${moduleId}.projectPayments`]:[...receipts,payment.id]});
    }
    state = ledger(actor);
    state.payments.find(x=>x.id===payment.id).status='done';
    await save(actor,state,update);
    return {status:'done',amount:payment.amount};
  }
  async function reconcile(actor,data,user,update) {
    if (!user.isGM) fail('只有 GM 可以核对工程投入。','Only a GM may reconcile payments.');
    const state=ledger(actor), p=state.payments.find(x=>x.id===data.paymentId);
    if (!p || p.status!=='pending') return {unchanged:true};
    if (data.resolution!=='manual') fail('无效核对方式。','Invalid reconciliation.');
    // Explicit GM acknowledgement: do not guess whether external edits applied
    // the work, and do not refund or repeat unknown side effects automatically.
    p.status='manual';
    await save(actor,state,update);
    return {status:'manual'};
  }
  async function input(title,content,label=text('继续','Continue')) {
    return foundry.applications.api.DialogV2.input({window:{title},content,ok:{label},rejectClose:false});
  }
  async function prepare(actor,activity,group) {
    if (!['accelerate-project','request-foreign-aid-vk'].includes(activity.id)) return null;
    if (game.modules?.get('vk-kingdom-turn-helper')?.active) fail('请先停用外部王国回合辅助插件，避免同一活动重复结算。','Disable the external kingdom turn helper before using integrated activities.');
    if (activity.id==='request-foreign-aid-vk') {
      if (!group) return false;
      if (!group?.id) fail('请先点击“工程与外援记录”初始化团体标识，再重新打开活动。','Open Project & Aid Records to initialize group IDs, then reopen this activity.');
      const state=ledger(actor), extra=aidExtra(state,group.id,turn(actor));
      const context={kind:'aid',turn:turn(actor),targetId:group.id,dc:group.negotiationDC+2+extra};
      validate(actor,context,game.user);
      const accepted=await foundry.applications.api.DialogV2.confirm({window:{title:text('请求外援','Foreign Aid')},content:`<p>${esc(group.name)} · DC ${group.negotiationDC} + 2 + ${extra} = ${context.dc}</p><p>${text('同一团体每回合一次；取消不占次数。','Once per group per turn; canceling consumes no attempt.')}</p>`,rejectClose:false});
      return accepted ? context : false;
    }
    const choices=adapter.projects(actor).filter(p=>p.current<p.total && p.document.canUserModify(game.user,'update'));
    if (!choices.length) fail('本王国没有可加速的未完成建筑。','No unfinished project in this kingdom.');
    const answer=await input(text('加速项目：选择建筑','Accelerate Project'),`<label>${text('建筑／当前进度／检定 DC','Project / progress / check DC')}<select name="targetId">${choices.map(p=>`<option value="${esc(p.id)}">${esc(p.label)} · ${p.current}/${p.total} RP · DC ${p.dc+2}</option>`).join('')}</select></label>`);
    if (!answer) return false;
    const p=choices.find(p=>p.id===answer.targetId);
    if (!p) fail('无效建筑。','Invalid project.');
    const context={kind:'accelerate',targetId:p.id,turn:turn(actor),dc:p.dc+2};
    validate(actor,context,game.user);
    return {...context,skills:p.skills};
  }
  async function payDialog(actor,targetId,attemptId) {
    const state=ledger(actor), p=project(actor,targetId,game.user);
    const maximum=Math.min(allowance(actor,state,p,attemptId),p.total-p.current,kingdom(actor).resourcePoints.now);
    if (maximum<=0) fail('当前没有可投入的 RP 额度。','No RP allowance available.');
    const expectedTurn=turn(actor);
    const answer=await input(text('投入工程 RP','Invest Construction RP'),`<p>${esc(p.label)} · ${p.current}/${p.total} RP</p><label>RP (1–${maximum})<input name="amount" type="number" min="1" max="${maximum}" step="1" value="${maximum}" required></label>`,text('确认投入','Invest'));
    if (!answer) return;
    await api().request('projectSpend',{actorUuid:actor.uuid,targetId,attemptId,turn:expectedTurn,amount:Number(answer.amount)});
    ui.notifications.info(text('工程投入已保存。','Construction payment saved.'));
  }
  async function show(actor) {
    if (!actor.canUserModify(game.user,'update')) fail('没有修改此王国的权限。','Cannot update this kingdom.');
    // Explicit, versioned, idempotent metadata initialization; never on ready.
    await api().request('projectGroups',{actorUuid:actor.uuid});
    const state=ledger(actor), now=turn(actor);
    const rows=state.attempts.slice(-50).reverse().map(a=>`<tr><td>${a.turn}</td><td>${esc(a.label)}</td><td>${a.kind==='aid'?text('外援','Aid'):text('加速','Accelerate')}</td><td>DC ${a.dc} · ${esc(a.degree)}${a.kind==='accelerate'?` · ≤${a.limit} RP`:''}</td></tr>`).join('');
    const actions=[];
    for(const p of state.payments.filter(x=>x.status==='pending')) {
      actions.push({id:`resume:${p.id}`,label:text('继续待处理投入：','Resume payment: ')+p.label,run:()=>api().request('projectSpend',{actorUuid:actor.uuid,paymentId:p.id})});
      if(game.user.isGM) actions.push({id:`manual:${p.id}`,label:text('人工核对后标记已处理：','Mark manually reconciled: ')+p.label,run:async()=>{
        if(await foundry.applications.api.DialogV2.confirm({window:{title:text('人工核对','Manual reconciliation')},content:`<p>${text('此操作不会退回 RP 或修改建筑。请先核对并手动修正已扣 RP 与建筑进度，再标记已处理。','This does not refund RP or change the project. Reconcile debited RP and progress manually before marking complete.')}</p>`,rejectClose:false})) await api().request('projectReconcile',{actorUuid:actor.uuid,paymentId:p.id,resolution:'manual'});
      }});
    }
    for(const a of state.attempts.filter(x=>x.kind==='accelerate' && x.turn===now && x.limit>0)) {
      actions.push({id:a.id,label:text('投入加速 RP：','Invest acceleration RP: ')+a.label,run:()=>payDialog(actor,a.targetId,a.id)});
    }
    const groups=(kingdom(actor).groups || []).filter(g=>g.relations!=='none').map(g=>`<li>${esc(g.name)} · DC ${g.negotiationDC} + 2 + ${aidExtra(state,g.id,now)} = ${g.negotiationDC+2+aidExtra(state,g.id,now)}${state.attempts.some(a=>a.kind==='aid' && a.targetId===g.id && a.turn===now)?' · '+text('本回合已请求','Requested this turn'):''}</li>`).join('');
    const content=`<p>${text('回合','Turn')} ${now} · ${text('最近 50 次检定；援助奖励继续由原结果卡处理。','Latest 50 checks; aid benefits remain on the original result card.')}</p><p>${text('下次外援参考 DC（本回合已请求的团体须等下一回合）','Next aid DC (groups already attempted must wait until next turn)')}</p><ul>${groups}</ul><table><thead><tr><th>${text('回合','Turn')}</th><th>${text('目标','Target')}</th><th>${text('活动','Activity')}</th><th>${text('结果','Result')}</th></tr></thead><tbody>${rows}</tbody></table>`;
    if(!actions.length) {await input(text('工程与外援记录','Project & Aid Records'),content,text('关闭','Close'));return;}
    const choice=await input(text('工程与外援记录','Project & Aid Records'),content+`<label>${text('后续操作','Follow-up')}<select name="action">${actions.map(a=>`<option value="${esc(a.id)}">${esc(a.label)}</option>`).join('')}</select></label>`);
    if(choice) await actions.find(a=>a.id===choice.action)?.run();
  }
  globalThis.foundryvttKotlinPatches.turnProjects={install:a=>{adapter=a;},ledger,aidExtra,limit,validate,record,spend,reconcile,allowance,prepare,payDialog,show};
})();
