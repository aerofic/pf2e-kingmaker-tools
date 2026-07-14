import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const moduleRoot = new URL("../", import.meta.url);
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test("legacy journal image references resolve to bundled documentation images", () => {
  const image = new URL("docs/images/random-encounter-proxy-table.png", moduleRoot);

  assert.equal(existsSync(image), true);
  assert.deepEqual(readFileSync(image).subarray(0, pngSignature.length), pngSignature);
});
