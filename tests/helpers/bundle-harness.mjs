import { readFileSync } from "node:fs";
import vm from "node:vm";

// Execute the shipped Kotlin/JS runtime and business functions, without startup,
// a Foundry license/install, sockets, or world writes. Foundry APIs are test
// boundaries, not substitutes for an initialized GM/player integration test.
export function loadBundle() {
  class Stub {}
  const Hooks = { on() {}, once() {}, off() {} };
  const documents = Object.fromEntries([
    "Actor", "ChatMessage", "RollTable", "JournalEntry", "JournalEntryPage",
    "Playlist", "PlaylistSound", "Folder", "TokenDocument", "Scene", "Macro",
  ].map((name) => [name, class extends Stub {}]));
  const fields = Object.fromEntries([
    "StringField", "NumberField", "BooleanField", "SchemaField", "ArrayField", "TypedObjectField",
  ].map((name) => [name, class extends Stub {}]));
  const context = vm.createContext({
    console, setTimeout, clearTimeout, TextEncoder, TextDecoder, URL, structuredClone,
    foundry: {
      utils: { deepClone: structuredClone, fromUuid: async () => null },
      documents, abstract: { Document: Stub, DataModel: Stub }, data: { fields },
      helpers: { Hooks }, Game: Stub,
      applications: {
        api: { ApplicationV2: Stub, HandlebarsApplicationMixin: (base) => class extends base {}, DialogV2: Stub },
        ux: { FormDataExtended: Stub, TextEditor: { implementation: {} } }, handlebars: {},
      },
    },
    Hooks,
    CONFIG: { PF2E: { Actor: { documentClasses: { party: documents.Actor, character: Stub, npc: Stub } } } },
    game: { i18n: { lang: "cn" }, user: { id: "player", isGM: false, active: true }, actors: { contents: [] } },
    ui: { notifications: { warn() {}, error() {}, info() {} } }, document: {},
  });
  const root = new URL("../../", import.meta.url);
  vm.runInContext(readFileSync(new URL("dist/api/patches.js", root), "utf8"), context);
  const bundle = readFileSync(new URL("dist/main.js", root), "utf8");
  const marker = "\nmainWrapper();";
  if (bundle.split(marker).length !== 2) throw new Error("Unexpected bundle entrypoint count");
  vm.runInContext(bundle.replace(marker, "\nglobalThis.audit = code => eval(code);"), context, { timeout: 15000 });
  return context;
}
