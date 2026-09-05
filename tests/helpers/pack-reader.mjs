import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ClassicLevel } from "classic-level";

const packRoot = fileURLToPath(new URL("../../packs/", import.meta.url));

// Opening LevelDB can rewrite logs and manifests even during read-only tests.
// Always open a disposable copy, including when a single test runs directly.
export async function readPackEntries(moduleRelativePath) {
  const source = resolve(packRoot, "..", moduleRelativePath);
  const child = relative(packRoot, source);
  if (!child || child.startsWith("..") || isAbsolute(child)) {
    throw new Error(`Pack path must be inside the module packs directory: ${moduleRelativePath}`);
  }
  const tempParent = resolve(tmpdir());
  const temp = mkdtempSync(join(tempParent, "km-pack-test-"));
  let db;
  try {
    const copy = join(temp, "pack");
    cpSync(source, copy, { recursive: true });
    db = new ClassicLevel(copy, { keyEncoding: "utf8", valueEncoding: "json", createIfMissing: false });
    await db.open();
    const entries = [];
    for await (const entry of db.iterator()) entries.push(entry);
    return entries;
  } finally {
    try {
      if (db) await db.close();
    } finally {
      // Only remove the exact absolute directory allocated above, never the source.
      if (dirname(resolve(temp)) !== tempParent || !basename(temp).startsWith("km-pack-test-")) {
        throw new Error("Refusing to clean an unexpected test directory");
      }
      rmSync(temp, { recursive: true, force: true });
    }
  }
}
