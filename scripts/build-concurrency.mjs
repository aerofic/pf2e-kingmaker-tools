import {readFileSync,writeFileSync} from 'node:fs';

// Embed the readable coordinator in the existing entrypoint so servers that
// cached module.json before this code-only update still load it before main.js.
// No new manifest entrypoint and no asynchronous startup race are required.
const marker = '\n// BEGIN GENERATED KINGMAKER CONCURRENCY\n';
const target = new URL('../dist/api/patches.js',import.meta.url);
const existing = readFileSync(target,'utf8').replaceAll('\r\n','\n');
if (existing.split(marker).length > 2) throw new Error('Duplicate concurrency bundle markers');
const coordinator = readFileSync(new URL('../dist/api/concurrency.js',import.meta.url),'utf8').replaceAll('\r\n','\n');
const prefix = existing.split(marker)[0].trimEnd();
const output = prefix + (prefix.endsWith(';') ? '' : ';') + marker + coordinator.trimEnd() + '\n';
if (process.argv.includes('--check')) {
  if (existing !== output) throw new Error('Coordinator bundle is stale; run npm run build');
} else writeFileSync(target,output);
