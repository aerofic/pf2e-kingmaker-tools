import assert from "node:assert/strict";
import test from "node:test";
import { loadBundle } from "./helpers/bundle-harness.mjs";

for (const capital of [false, true]) {
  for (const setting of [false, true]) {
    for (const bankState of ["absent", "complete", "under-construction", "slowed"]) {
      test(`Capital Investment: capital=${capital}, setting=${setting}, bank=${bankState}`, () => {
        const c = loadBundle();
        Object.assign(c, { capital, setting, bankState });
        const actual = c.audit(`(() => {
          const empty = _kotlin_kotlin_stdlib_mjs__WEBPACK_IMPORTED_MODULE_2__.emptyList1g2z5xcrvp2zy();
          const bank = new Structure('bank','Actor.bank','Actor.bank','Bank');
          bank.h3f_1 = true;
          bank.g3g_1 = bankState === 'slowed';
          bank.m3g_1 = bankState !== 'under-construction';
          const structures = bankState === 'absent' ? empty : _kotlin_kotlin_stdlib_mjs__WEBPACK_IMPORTED_MODULE_2__.listOf1jh22dvmctj1r([bank]);
          const data = {r3o_1:1,q3o_1:'Settlement',s3o_1:capital ? SettlementType_CAPITAL_getInstance() : SettlementType_SETTLEMENT_getInstance(),v3o_1:'scene',u3o_1:[],t3o_1:false,w3o_1:'freeForm'};
          return evaluateSettlement(data,structures,false,setting,false,1,empty).x3g_1;
        })()`);
        assert.equal(actual, bankState === "complete" || (capital && setting));
      });
    }
  }
}
