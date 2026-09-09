# NPC discontent annotations

The kingdom's NPC office portraits display one GM annotation:

- **Discontent:** none, Uneasy / 不悦 (1), Discontent / 不满 (2), or Angry / 愤怒 (3). Only nonzero values display the small yellow/orange/red three-segment meter.

The Positive checkbox and green marker have been removed at the user's request. No annotation affects rolls, leader type, highly motivated NPC bonuses, vacancies, or any rules.

The marker overlays the bottom-left of the existing portrait without changing grid, image, header, or form-control dimensions. With no discontent, players see no marker; GMs can reveal the edit icon by hovering the portrait or focusing it with the keyboard. Clicking opens a V14 DialogV2 with an emotion selector. Cancel/close does not save.

## Storage and authority

The kingdom Actor stores `flags.pf2e-kingmaker-tools.npcAttitudes.<encoded-NPC-UUID>.discontent` (integer 0–3). Missing values mean 0, with no implicit write or inference from the leader type. UUID keys are encoded to avoid dots or special object property names in update paths. An NPC retains annotations when moved to a different office in the same kingdom; a new appointee does not inherit the former NPC's annotations. Legacy `.positive` flags from 6.4.2 are neither displayed nor modified; this feature does not delete world data.

The current role must have a UUID and one of the module's `regularNpc`, `highlyMotivatedNpc`, or `nonPathfinderNpc` types. PC-typed and unassigned cards are not annotated. NPCs represented by character Actors remain supported through the explicit role type.

Only `game.user.isGM` with `actor.canUserModify(game.user, "update")` may write. Permission and current office UUID/type are rechecked after the dialog. Writes are absolute dotted leaf updates to discontent only when changed. Concurrent edits to the same NPC's emotion are intentionally last-write-wins. No sockets, automatic migrations, global listeners, or timers are added. The existing kingdom render hook supplies updates; widget listeners are element-local and discarded with their DOM nodes.

## V14 evidence and verification

- Current locally inspected runtime: Foundry 14.367, PF2e 8.4.1. The module remains V14-only.
- `FoundryVTT-Node-14.367/common/abstract/document.mjs`: `canUserModify` permission API.
- `FoundryVTT-Node-14.367/client/applications/api/dialog.mjs`: `_initializeApplicationOptions` requires an attribute-free outer DIV and serializes its `innerHTML`; `_renderHTML` reparses that string. Use `option.defaultSelected` for initial state and read `button.form.elements` in the save callback. `_onSubmit` falls back to the action string when callbacks return null, so Cancel is explicitly handled as the `cancel` action; closing the window resolves to null.
- Module's existing `renderKingdomTurnCounter` resolves the kingdom Actor and receives the rendered root; this feature reuses it rather than patching a Foundry prototype.

Automated data/permission tests: `node --test tests/npc-attitude.test.mjs`. Full suite: `npm run check` and `npm test`. Local isolated browser QA now executes the actual local V14 `_initializeApplicationOptions`, `_renderHTML` and `_renderButtons` methods with the shipped widget, both stylesheets and mocked persistence. It verifies the attribute-free root, HTML round-trip, current selection, save/reopen, cancel, no Positive UI even with legacy data, four emotion values, both themes, unchanged surrounding bounds/styles, repeated renders, click isolation and player read-only behavior. The earlier live-node dialog mock missed V14's serialization restrictions; it is no longer used for this validation. This is still not an initialized-world integration test.

Before claiming live verification: reload GM and player clients, open the kingdom Creation offices, verify the discontent meter, cancel a dialog, save/reopen an emotion, move/replace an NPC, and ensure other office controls still work. Use a disposable test kingdom for persistence tests, not the active campaign without authorization.
