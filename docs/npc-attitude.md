# NPC attitude and emotion annotations

The kingdom's office portraits display two **independent** GM annotations:

- **Positive / 积极:** a green dot and label when enabled; nothing when disabled.
- **Discontent:** none, Uneasy / 不悦 (1), Discontent / 不满 (2), or Angry / 愤怒 (3). Only nonzero values display the small yellow/orange/red three-segment meter.

All eight combinations are valid, including Positive + Angry. The two dimensions are not a single five-state scale, and clearing either does not clear the other. Neither affects rolls, leader type, highly motivated NPC bonuses, vacancies, or any rules.

The marker overlays the bottom-left of the existing portrait without changing grid, image, header, or form-control dimensions. With both dimensions absent, players see no marker; GMs can reveal the edit icon by hovering the portrait or focusing it with the keyboard. Clicking opens a V14 DialogV2 with a separate Positive checkbox and emotion selector. Cancel/close does not save.

## Storage and authority

The kingdom Actor stores `flags.pf2e-kingmaker-tools.npcAttitudes.<encoded-NPC-UUID>.positive` (boolean) and `.discontent` (integer 0–3). Missing values mean false/0, with no implicit write or inference from the leader type. UUID keys are encoded to avoid dots or special object property names in update paths. An NPC retains annotations when moved to a different office in the same kingdom; a new appointee does not inherit the former NPC's annotations.

The current role must have a UUID and one of the module's `regularNpc`, `highlyMotivatedNpc`, or `nonPathfinderNpc` types. PC-typed and unassigned cards are not annotated. NPCs represented by character Actors remain supported through the explicit role type.

Only `game.user.isGM` with `actor.canUserModify(game.user, "update")` may write. Permission and current office UUID/type are rechecked after the dialog. Writes are absolute dotted leaf updates for only the dimensions changed in that dialog: another GM's concurrent edit to the other dimension is preserved. Concurrent edits to the same dimension are intentionally last-write-wins. No sockets, automatic migrations, global listeners, or timers are added. The existing kingdom render hook supplies updates; widget listeners are element-local and discarded with their DOM nodes.

## V14 evidence and verification

- Current locally inspected runtime: Foundry 14.367, PF2e 8.4.1. The module remains V14-only.
- `FoundryVTT-Node-14.367/common/abstract/document.mjs`: `canUserModify` permission API.
- `FoundryVTT-Node-14.367/client/applications/api/dialog.mjs`: `DialogV2.wait` supports DOM content, button callbacks and null on close.
- Module's existing `renderKingdomTurnCounter` resolves the kingdom Actor and receives the rendered root; this feature reuses it rather than patching a Foundry prototype.

Automated data/permission tests: `node --test tests/npc-attitude.test.mjs`. Full suite: `npm run check` and `npm test`. Local isolated browser QA used the shipped widget functions, kingdom CSS, Foundry V14 CSS and mocked persistence to check all eight combinations, both themes, unchanged surrounding bounds/styles, repeated renders, click isolation, editing, and player read-only behavior. It is not an initialized-world integration test.

Before claiming live verification: reload GM and player clients, open the kingdom Creation offices, verify the green marker and discontent meter independently, cancel a dialog, save each dimension, move/replace an NPC, and ensure other office controls still work. Use a disposable test kingdom for persistence tests, not the active campaign without authorization.
