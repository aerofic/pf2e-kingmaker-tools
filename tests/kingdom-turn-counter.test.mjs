import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const moduleRoot = new URL("../", import.meta.url);
const main = readFileSync(new URL("dist/main.js", moduleRoot), "utf8");
const template = readFileSync(new URL("dist/applications/kingdom/kingdom-sheet.hbs", moduleRoot), "utf8");
const stylesheet = readFileSync(new URL("dist/applications/kingdom/kingdom-sheet.css", moduleRoot), "utf8");
const en = JSON.parse(readFileSync(new URL("dist/lang/en.json", moduleRoot), "utf8"));
const cn = JSON.parse(readFileSync(new URL("dist/lang/cn.json", moduleRoot), "utf8"));

test("kingdom sheet exposes a persistent GM-only turn counter", () => {
  assert.match(template, /km-kingdom-turn-counter-slot/);
  assert.match(main, /Hooks\.on\('renderKingdomSheet', renderCounter\)/);
  assert.match(main, /input\.disabled = !canEdit/);
  assert.match(main, /game\.user\.isGM === true/);
  assert.match(main, /setFlag\('pf2e-kingmaker-tools', kmKingdomTurnFlag, value\)/);
  assert.equal(en["pf2e-kingmaker-tools"].kingdom.turnNumber, "Kingdom Turn");
  assert.equal(cn["pf2e-kingmaker-tools"].kingdom.turnNumber, "王国回合");
});

test("kingdom name input uses a compact header-only width", () => {
  assert.match(stylesheet, /\.km-kingdom-sheet-name\s*\{[\s\S]*?\.km-width-medium\s*\{\s*width: 100px !important;/);
});

test("kingdom header fields share one control height and vertical alignment", () => {
  assert.match(stylesheet, /\.km-kingdom-sheet-header\s*\{\s*align-items: center;/);
  assert.match(stylesheet, /> div,[\s\S]*?\.km-label,[\s\S]*?min-height: 30px;/);
  assert.match(stylesheet, /input:not\(\[type="checkbox"\]\),[\s\S]*?select\s*\{[\s\S]*?height: 30px;/);
});

test("kingdom sheet exposes a persistent GM-only faith counter before the turn counter", () => {
  assert.match(template, /km-kingdom-faith-counter-slot[\s\S]*?km-kingdom-turn-counter-slot/);
  assert.match(main, /var kmKingdomFaithFlag = 'kingdomFaith'/);
  assert.match(main, /icon\.src = 'tokenizer\/Angel%20EyeOfTheGods\.png'/);
  assert.match(main, /input\.value = kmNormalizeKingdomFaith/);
  assert.match(main, /setFlag\('pf2e-kingmaker-tools', kmKingdomFaithFlag, value\)/);
  assert.match(main, /return Number\.isFinite\(parsed\) \? Math\.max\(0, Math\.trunc\(parsed\)\) : 0/);
  assert.equal(en["pf2e-kingmaker-tools"].kingdom.faith, "Faith");
  assert.equal(cn["pf2e-kingmaker-tools"].kingdom.faith, "信仰");
});

test("ending a turn increments the counter only after kingdom data is saved", () => {
  assert.match(
    main,
    /setKingdom\(this\.g5u_1\.r5q_1, tmp0_safe_receiver[\s\S]*?user\.isGM[\s\S]*?setFlag\('pf2e-kingmaker-tools', 'kingdomTurn', currentKingdomTurn \+ 1\)/,
  );
  assert.match(main, /return Number\.isFinite\(parsed\) \? Math\.max\(1, Math\.trunc\(parsed\)\) : 1/);
});
