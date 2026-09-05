# Concurrent operations in the assembled V14 fork

## Scope

This build preserves the existing camping ownership predicates and rule calculations. It adds a first-active-GM coordinator, acknowledged requests and conflict detection for camping/kingdom flag saves. No migration runs, world-setting changes or rule-compendium edits are part of this change. The module version remains 6.3.6; these changes are listed under Unreleased until a separate release is requested.

`dist/api/concurrency.js` is the readable coordinator source. `npm run build` embeds it in the existing `dist/api/patches.js` entrypoint; `npm run check` rejects an outdated embedding. This keeps the existing manifest load order and avoids a server-cached manifest missing a new script after code-only deployment.

## Guarantees and recovery

- A state snapshot carries its editing baseline. Only intended field differences are submitted. Conflicting fields or stale arrays are rejected, not silently overwritten or guessed into additive changes. Refresh the editing window before repeating a rejected edit.
- End-turn resources, durations, turn counter and a recent request receipt are written in one Actor update. Retrying the same request, or submitting the same expected turn from another client, does not settle it again. An intentional request for the next turn is allowed. Chat notification failure after settlement does not roll back or repeat the settlement.
- Kingdom checks reserve the kingdom before rolling, validate the modifier snapshot and exclude simultaneous checks. Cleanup removes consumed IDs from the latest list and reduces Blessed Solutions only for modifiers actually removed. The original dice, degree selection and deduction timing within a successful check are retained.
- Chat deduplication is per stored message and button index, not a DOM latch. A durable pending record precedes the action; success marks it done. An error leaves it pending/review because inventory, effects and time cannot be committed as a single transaction.
- GM review is explicit and potentially consequential: inspect and reconcile partial results first. Enabling a card re-executes its whole action. Unlocking a kingdom check does not automatically refund resources or erase previous rolls. Legacy cards have no reliable historical completion record and require the same review.

An active GM is required for coordinated saves. Reload every connected client after deployment; mixed old/new clients and third-party direct writes do not participate in the coordinator. Authority changes, disconnected clients or ambiguous failures require review; this is not a server-side distributed transaction or a guarantee against arbitrary external mutations. Actor request receipts retain the most recent 256 operations; chat completion records remain with their messages.

## Verification

Run `npm ci`, `npm run check`, `npm test` and the workspace V14 module validator. Tests use the shipped bundle, isolated document/socket fixtures, two GMs/players, stale edits, response-loss retries, failed commits, per-button replay, interrupted checks, modifier cleanup, real handler adapters and original end-turn calculations. Pack tests only open disposable copies.

Foundry 14.367 checks also exercised the actual Actor `updateSource`/flag schema, `mergeObject` deletion semantics, and browser DOM chat rendering using detached elements and isolated state. Double-click and rerender produced one action; the other button remained usable; legacy cards exposed GM recovery controls. No world documents were written by those probes. This is not a live multi-client gameplay test; perform the following on a disposable world when available:

1. Connect one GM and two owning players, then two GMs. Submit unrelated camping edits and same-field conflicting edits.
2. Double-click food collection, rerender the chat, and click the same card from another player. Confirm only one inventory change; a different card remains usable.
3. Interrupt an action between inventory/effect/time changes and completion recording. Confirm no automatic replay and exercise both GM review choices after reconciling data.
4. Run simultaneous kingdom checks using the same one-use modifier. Reopen the rejected dialog after the first finishes; confirm the consumed modifier is absent.
5. Simulate a lost end-turn reply, then retry. Confirm one turn increment and one duration/resource settlement. Intentionally finish the next turn and confirm it still works.
6. Check public, GM, blind and self messages from a player account. The ordinary result and resource summaries must retain the intended visibility.

The complete Kotlin build source is not present in this assembled repository; tests exercise the actual shipped JavaScript, not a Kotlin rebuild.

## Code-only deployment

The Windows workspace deploy helper now supports opt-in `--preserve-packs`. Use it only when no compendium content changed. It preserves the same validated, existing manifest pack directories on both sides of the sync. Dry-run review, overwrite confirmation and the target-root lock remain mandatory; ordinary full deployment is unchanged. Back up and verify the target before applying. This avoids replacing open LevelDB files while deploying a code-only fix; a full compendium deployment should be done with Foundry stopped.
