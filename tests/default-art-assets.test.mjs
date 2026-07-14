import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const moduleRoot = new URL("../", import.meta.url);
const campingCssUrl = new URL("dist/applications/camping/camping.css", moduleRoot);
const structureBrowserCssUrl = new URL("dist/applications/kingdom/structure-browser.css", moduleRoot);

const campingTerrains = [
  "aquatic",
  "arctic",
  "desert",
  "dungeon",
  "forest",
  "hills",
  "mountain",
  "plains",
  "swamp",
  "urban",
];
const timesOfDay = ["day", "night"];
const settlementTypes = ["city", "metropolis", "town", "village"];

test("default artDirectory contains camping and kingdom backgrounds referenced by the sheets", () => {
  const expectedFiles = [
    ...campingTerrains.flatMap((terrain) =>
      timesOfDay.map((timeOfDay) => `art/camping/backgrounds/${terrain}-${timeOfDay}.webp`),
    ),
    ...settlementTypes.map((type) => `art/kingdom/backgrounds/${type}.webp`),
  ];

  const missingFiles = expectedFiles.filter((file) => !existsSync(new URL(file, moduleRoot)));

  assert.deepEqual(missingFiles, []);
});

test("stylesheet module-local asset paths resolve", () => {
  const cssFiles = [];
  const visit = (dirUrl) => {
    for (const entry of readdirSync(dirUrl, { withFileTypes: true })) {
      const entryUrl = new URL(entry.name, dirUrl);
      if (entry.isDirectory()) visit(new URL(`${entry.name}/`, dirUrl));
      if (entry.isFile() && entry.name.endsWith(".css")) cssFiles.push(entryUrl);
    }
  };
  visit(new URL("dist/", moduleRoot));

  const missingFiles = [];
  for (const cssUrl of cssFiles) {
    const css = readFileSync(cssUrl, "utf8");
    for (const [, rawSrc] of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
      if (rawSrc.startsWith("/") || rawSrc.includes("/icons/") || rawSrc.includes("/ui/")) continue;

      const assetUrl = new URL(rawSrc, cssUrl);
      if (!assetUrl.href.startsWith(moduleRoot.href)) continue;
      if (!existsSync(assetUrl)) missingFiles.push(`${cssUrl.pathname}: ${rawSrc}`);
    }
  }

  assert.deepEqual(missingFiles, []);
});

test("camping stylesheet background image paths resolve", () => {
  const css = readFileSync(campingCssUrl, "utf8");
  assert.equal(css.includes("img/camping/backgrounds"), false);

  const missingFiles = [...css.matchAll(/url\("([^"]*camping\/backgrounds\/[^"]+)"\)/g)]
    .map(([, src]) => ({ src, url: new URL(src, campingCssUrl) }))
    .filter(({ url }) => !existsSync(url))
    .map(({ src }) => src);

  assert.deepEqual(missingFiles, []);
});

test("zero-lot infrastructure previews render at one-lot image size", () => {
  const css = readFileSync(structureBrowserCssUrl, "utf8");

  assert.match(css, /\.km-lots-0 img,\s*\.km-lots-1 img\s*\{[^}]*height:\s*50%;/s);
});
