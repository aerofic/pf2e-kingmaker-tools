import {readFileSync,writeFileSync} from 'node:fs';

// Embed the readable coordinator in the existing entrypoint so servers that
// cached module.json before this code-only update still load it before main.js.
// No new manifest entrypoint and no asynchronous startup race are required.
const marker = '\n// BEGIN GENERATED KINGMAKER CONCURRENCY\n';
const target = new URL('../dist/api/patches.js',import.meta.url);
const existing = readFileSync(target,'utf8').replaceAll('\r\n','\n');
if (existing.split(marker).length > 2) throw new Error('Duplicate concurrency bundle markers');
const coordinator = readFileSync(new URL('../dist/api/concurrency.js',import.meta.url),'utf8').replaceAll('\r\n','\n');
const encounters = readFileSync(new URL('../dist/api/encounter-conditions.js',import.meta.url),'utf8').replaceAll('\r\n','\n');
const rest = readFileSync(new URL('../dist/api/camping-rest.js',import.meta.url),'utf8').replaceAll('\r\n','\n');
const projects = readFileSync(new URL('../dist/api/turn-projects.js',import.meta.url),'utf8').replaceAll('\r\n','\n');
const prefix = existing.split(marker)[0].trimEnd();
const output = prefix + (prefix.endsWith(';') ? '' : ';') + marker + coordinator.trimEnd()
  + '\n// BEGIN GENERATED KINGMAKER ENCOUNTER CONDITIONS\n' + encounters.trimEnd()
  + '\n// BEGIN GENERATED KINGMAKER CAMPING REST\n' + rest.trimEnd()
  + '\n// BEGIN GENERATED KINGMAKER TURN PROJECTS\n' + projects.trimEnd() + '\n';
if (process.argv.includes('--check')) {
  if (existing !== output) throw new Error('Coordinator bundle is stale; run npm run build');
} else writeFileSync(target,output);

// The Kotlin bundle also embeds the English fallback dictionary. Keep the
// generated copy identical to the shipped editable translation source.
const mainPath = new URL('../dist/main.js',import.meta.url);
const main = readFileSync(mainPath,'utf8');
const moduleMarker = '/***/ "./kotlin/lang/en.json":';
const prefixJson = 'module.exports = /*#__PURE__*/JSON.parse(';
const moduleStart = main.indexOf(moduleMarker);
const jsonStart = main.indexOf(prefixJson,moduleStart) + prefixJson.length;
const jsonEnd = main.lastIndexOf(');',main.indexOf('\n',jsonStart));
if (moduleStart < 0 || jsonStart < prefixJson.length || jsonEnd < jsonStart) throw new Error('English bundle marker missing');
JSON.parse(JSON.parse(main.slice(jsonStart,jsonEnd)));
const english = JSON.parse(readFileSync(new URL('../dist/lang/en.json',import.meta.url),'utf8'));
const updatedMain = main.slice(0,jsonStart) + JSON.stringify(JSON.stringify(english)) + main.slice(jsonEnd);
if (process.argv.includes('--check')) {
  if (main !== updatedMain) throw new Error('English fallback is stale; run npm run build');
} else if (main !== updatedMain) writeFileSync(mainPath,updatedMain);
