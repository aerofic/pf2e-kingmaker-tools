/* Rest-only time coordination. No core patches or automatic world migration. */
(() => {
  const moduleId = 'pf2e-kingmaker-tools';
  const optionKey = 'kingmakerRestTime';
  const timeEvents = new Map();
  const concurrent = () => globalThis.foundryvttKotlinPatches.concurrency;
  const authority = () => game.users.find(user => user.active && user.isGM)?.id === game.user?.id;
  const reviewMessage = () => /^(cn|zh)/i.test(game.i18n.lang)
    ? '上次休息已进入推进时间阶段，但未完整结束。为防止重复推进，已暂停自动重试；请 GM 核对世界时间和休息进度后再恢复。'
    : 'The previous rest reached the time-advance stage but did not finish. Automatic retry is paused to prevent duplicate time. A GM must review world time and rest progress before recovery.';

  function canStart(actor) {
    const guard = actor.getFlag(moduleId, 'camping-sheet')?.restTimeGuard;
    if (!guard || guard.status === 'complete') return true;
    ui.notifications.warn(reviewMessage());
    return false;
  }

  function isRestTime(actor, delta, options, userId) {
    const marker = options?.[optionKey];
    const guard = timeEvents.get(marker?.id) ?? actor?.getFlag(moduleId, 'camping-sheet')?.restTimeGuard;
    // Recognize only the exact persisted rest event from its GM. An ordinary
    // calendar event (even while resting) must keep its usual time tracking.
    return !!guard && game.users.get(userId)?.isGM === true
      && marker?.actorUuid === actor?.uuid && guard.actorUuid === actor?.uuid && marker?.id === guard.id
      && userId === guard.userId && delta === guard.seconds;
  }

  async function advance(actor, camping, seconds) {
    if (!authority()) throw new Error('Only the authoritative GM may advance rest time.');
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Invalid rest duration.');
    const previous = actor.getFlag(moduleId, 'camping-sheet')?.restTimeGuard;
    if (previous && previous.status !== 'complete') throw new Error(reviewMessage());
    const guard = {
      id: foundry.utils.randomID(24), userId: game.user.id, actorUuid: actor.uuid, status: 'pending',
      version: camping.restOperationVersion, seconds,
      worldTimeBefore: game.time.worldTime,
    };
    camping.restTimeGuard = guard;
    // Persist BEFORE the external side effect. If saving or time advancement
    // has an ambiguous outcome, leave the marker for review, including reloads.
    await concurrent().write(actor, 'camping-sheet', camping);
    if (!authority()) throw new Error('The authoritative GM changed before advancing rest time.');
    timeEvents.set(guard.id, guard);
    if (timeEvents.size > 256) timeEvents.delete(timeEvents.keys().next().value);
    await game.time.advance(seconds, {[optionKey]: {actorUuid: actor.uuid, id: guard.id}});
  }

  async function finish(actor, camping) {
    const guard = camping.restTimeGuard;
    if (!guard) return;
    const current = actor.getFlag(moduleId, 'camping-sheet');
    if (current?.restTimeGuard?.id !== guard.id) throw new Error(reviewMessage());
    camping.restTimeGuard = {...guard, status: 'complete'};
    try {
      await concurrent().write(actor, 'camping-sheet', camping);
    } catch (error) {
      // A lost acknowledgement is not proof of failure. Only a confirmed
      // matching committed state allows us to consider cleanup completed.
      const saved = actor.getFlag(moduleId, 'camping-sheet');
      if (saved?.restTimeGuard?.id !== guard.id || saved?.restTimeGuard?.status !== 'complete'
        || saved?.restOperationVersion !== guard.version) throw error;
    }
  }

  globalThis.foundryvttKotlinPatches.campingRest = {canStart, isRestTime, advance, finish};
})();
