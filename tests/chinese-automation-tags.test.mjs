import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const moduleRoot = new URL("../", import.meta.url);
const automationTagPattern = /@Check\[[^\]]+\]|@(?:gain|lose)[A-Za-z0-9_+\-]+/g;

function readLocalization(locale) {
  return JSON.parse(readFileSync(new URL(`dist/lang/${locale}.json`, moduleRoot), "utf8"));
}

function countTags(text) {
  const counts = new Map();
  for (const tag of text.match(automationTagPattern) ?? []) {
    counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return counts;
}

function sameTagCounts(a, b) {
  const keys = new Set([...a.keys(), ...b.keys()]);
  for (const key of keys) {
    if ((a.get(key) ?? 0) !== (b.get(key) ?? 0)) return false;
  }
  return true;
}

function collectMismatches(enNode, cnNode, keyPath = []) {
  if (typeof enNode === "string" && typeof cnNode === "string") {
    const enTags = countTags(enNode);
    const cnTags = countTags(cnNode);
    return sameTagCounts(enTags, cnTags) ? [] : [keyPath.join(".")];
  }

  if (enNode && cnNode && typeof enNode === "object" && typeof cnNode === "object") {
    return Object.keys(enNode).flatMap((key) =>
      Object.hasOwn(cnNode, key) ? collectMismatches(enNode[key], cnNode[key], [...keyPath, key]) : [],
    );
  }

  return [];
}

test("Chinese automation tags match English automation tags", () => {
  const en = readLocalization("en");
  const cn = readLocalization("cn");

  assert.deepEqual(collectMismatches(en, cn), []);
});

test("Chinese localization has no obvious mojibake placeholders or stale turn text", () => {
  const cn = JSON.stringify(readLocalization("cn"));

  assert.equal(/\?{5,}/.test(cn), false);
  assert.equal(/\b(?:Nexturn|Turn)\b/.test(cn), false);
});
