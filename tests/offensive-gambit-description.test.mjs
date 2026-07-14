import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const moduleRoot = new URL("../", import.meta.url);
const en = JSON.parse(readFileSync(new URL("dist/lang/en.json", moduleRoot), "utf8"))["pf2e-kingmaker-tools"];
const cn = JSON.parse(readFileSync(new URL("dist/lang/cn.json", moduleRoot), "utf8"))["pf2e-kingmaker-tools"];

test("Offensive Gambit assigns attack timing on critical outcomes", () => {
  assert.equal(cn.activities["offensive-gambit"].criticalSuccess.msg, "<p>进攻方可以选择进攻时点。</p>");
  assert.equal(cn.activities["offensive-gambit"].criticalFailure.msg, "<p>防守方可以选择进攻时点。</p>");
  assert.equal(en.activities["offensive-gambit"].criticalSuccess.msg, "<p>The attacking side can choose when the attack takes place.</p>");
  assert.equal(en.activities["offensive-gambit"].criticalFailure.msg, "<p>The defending side can choose when the attack takes place.</p>");
});
