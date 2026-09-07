# Random encounter circumstances (6.4.0)

Only a GM can change these controls. Each Party stores its own choices in
`flags.pf2e-kingmaker-tools.camping-sheet.encounterConditions`; old Parties need no migration.

The displayed DC and actual flat check share the calculation:
regional DC + existing activity modifiers + existing manual modifier - 2 if Road / river + 3 if Flying.
Both checked means a net +1, when the GM judges both circumstances applicable.
The ordinary DC reset resets only the existing manual modifier.

The Road / river default reads the Party's sole Token on Scene `AJ1k5II28u72JOmz`,
using V14 `TokenDocument.getCenterPoint()` and `scene.grid.getOffset()`.
It then reads `kingmaker.region.hexes.get(kingmaker.api.KingmakerHex.getKey(offset)).data.features`
for `type === "road"`. This is independent of the currently viewed scene and
does not inspect the map image, selected player Tokens, fly speeds or elevations.
No road marker is not proof that no river exists. A marker also does not prove
the Party is actually following the road: GM overrides remain authoritative.

The road override survives sheet/browser refreshes and movement within the same
hex. Leaving the hex clears it, including when returning to a previously visited
hex. The small road button restores automatic detection immediately. If detection
is unavailable, the interface says so and permits manual selection. Multiple Party
Tokens on the map are treated as ambiguous, not selected arbitrarily.

Flying is manual, persists while travelling, and clears when the rest workflow
starts. Rest encounter checks explicitly exclude flight, including interrupted
rests. While a rest is pending the flight checkbox is disabled. Flying does not
automatically filter or replace monsters/hazards; the GM must choose an appropriate
encounter.

Rule: GM Core p. 209, Random Encounter Chance table footnote:
<https://2e.aonprd.com/Rules.aspx?ID=3103>. Road/river lowers the flat-check DC and
therefore increases encounter probability; flight raises it and decreases it.
These controls do not change the module's existing encounter-check frequency.

Implementation evidence: local Foundry 14.367 `common/documents/token.mjs`
(`getCenterPoint`) and `client/documents/token.mjs` (`moveToken` after document update),
plus the local V14 declaration snapshot. Kingmaker-specific feature schema/key
comes from `pf2e-kingmaker/pf2e-km-compiled.mjs`, not a guessed core API.

Edits use the existing per-Actor concurrency queue. The receiving GM verifies
requester role/ownership, current location, conditions and rest version before
writing only the changed fields. Older queued movement events cannot erase a
newer manual override. Non-GM generic camping patches cannot change these fields.
Runtime hooks are registered once; open-sheet tracking is removed on close.

After deployment all GM and player clients must reload. Automated tests cover the
calculation, scope, permissions, stale requests, movement and UI action wiring;
they do not replace an initialized-world GM/player acceptance test.
