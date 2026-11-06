import assert from "node:assert/strict";
import test from "node:test";
import { loadBundle } from "./helpers/bundle-harness.mjs";

const bundle = loadBundle();
bundle.audit(`
  globalThis.rollKingdomCheck = async ({ dc, modifier, keepHighest, keepLowest, assurance }) => {
    const result = await buildPromise((scope, completion) =>
      d20Check(dc, modifier, undefined, null, false, keepHighest, keepLowest, assurance, false, completion)
    );
    return { formula: result.f4o_1.formula, total: result.f4o_1.total, die: result.e4o_1.c65_1, degree: result.d4o_1.a4_1 };
  };
`);

async function roll(die, options) {
  bundle.Roll = class {
    constructor(formula) {
      const match = /^(1d20|2d20k[hl]|10)([+-]\d+)?$/.exec(formula);
      assert.ok(match, `Unexpected roll formula: ${formula}`);
      this.formula = formula;
      this.total = (match[1] === "10" ? 10 : die) + Number(match[2] ?? 0);
    }

    async evaluate() {
      return this;
    }
  };

  return { ...await bundle.rollKingdomCheck(options) };
}

test("a negative kingdom modifier lowers the total without manufacturing a natural 20", async () => {
  assert.deepEqual(await roll(18, { dc: 17, modifier: -2 }), {
    formula: "1d20-2", total: 16, die: 18, degree: 1,
  });
});

test("negative kingdom modifiers preserve genuine natural 20s and natural 1s", async () => {
  assert.deepEqual(await roll(20, { dc: 18, modifier: -3 }), {
    formula: "1d20-3", total: 17, die: 20, degree: 2,
  });
  assert.deepEqual(await roll(1, { dc: 10, modifier: -2 }), {
    formula: "1d20-2", total: -1, die: 1, degree: 0,
  });
});

test("kingdom formulas preserve zero, positive, fortune, misfortune, and Assurance", async () => {
  for (const [options, formula, total, die] of [
    [{ modifier: 0 }, "1d20", 13, 13],
    [{ modifier: 3 }, "1d20+3", 16, 13],
    [{ modifier: -2, keepHighest: true }, "2d20kh-2", 11, 13],
    [{ modifier: -2, keepLowest: true }, "2d20kl-2", 11, 13],
    [{ modifier: 4, assurance: true }, "10+4", 14, 10],
  ]) {
    assert.deepEqual(await roll(13, { dc: 11, ...options }), { formula, total, die, degree: 2 });
  }
});
