import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mainJs = readFileSync(new URL("../dist/main.js", import.meta.url), "utf8");
const template = readFileSync(new URL("../dist/chatmessages/firstrun.hbs", import.meta.url), "utf8");

test("first-run sheet links use live module actions instead of missing macro UUIDs", () => {
  assert.doesNotMatch(mainJs, /Macro\.(?:GXeKz3qKlsoxcaTg|1LmPW2OlHgJvedY8)/);
  assert.match(mainJs, /bindChatClick\('\.km-open-firstrun-sheet'/);
  assert.match(mainJs, /function \*openFirstRunSheet\$slambda\(sheetType, \$completion\)/);
  assert.match(mainJs, /yield\* chooseParty\(game, \$completion\)/);
  assert.match(mainJs, /game\.pf2eKingmakerTools\.macros\.openSheet\(sheetType, party\.id\)/);
  assert.match(template, /data-sheet-type="camping"/);
  assert.match(template, /data-sheet-type="kingdom"/);
});
