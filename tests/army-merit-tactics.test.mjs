import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const moduleRoot = new URL("../", import.meta.url);
const classicLevelUrl = new URL("../../foundryvtt-node-14.363/node_modules/classic-level/index.js", import.meta.url);
const packPath = "packs/kingmaker-tools-army-merit-tactics";
const meritNames = new Set(["老兵勋章", "精锐勋章", "王牌勋章"]);
const aceTactics = new Map([
  ["势在必得", ["cavalry", "infantry", "siege", "skirmisher"]],
  ["闪电战", ["cavalry", "infantry", "siege", "skirmisher"]],
  ["毁灭冲锋", ["cavalry"]],
  ["帕提亚战术", ["skirmisher"]],
  ["蜂巢齐射", ["siege"]],
  ["破釜沉舟", ["cavalry", "infantry", "siege", "skirmisher"]],
  ["万众一心", ["cavalry", "infantry", "siege", "skirmisher"]],
  ["坎尼新月阵", ["cavalry", "infantry", "siege", "skirmisher"]],
  ["库尔斯克铁壁", ["infantry"]],
]);
const aceTacticText = new Map([
  ["坎尼新月阵", ["军阵佯装后退", "敌军陷入被包抄"]],
  ["帕提亚战术", ["退却本身就是陷阱", "免费执行一次脱离战斗", "远程攻击检定"]],
  ["毁灭冲锋", ["铁蹄踏碎战线", "全军突击", "失败则溃败"]],
  ["蜂巢齐射", ["弹幕如蜂群倾泻而下", "三动作", "包括友军", "无MAP"]],
  ["势在必得", ["千钧一发之际", "d20检定投三次取最高结果"]],
  ["闪电战", ["敌军尚未列阵完毕", "先攻前，额外获得一个回合"]],
  ["破釜沉舟", ["退无可退", "无法执行脱离战斗和撤退行动", "溃败阈值降为0"]],
  ["万众一心", ["战意如潮水般涌遍全军", "所有友军下一次攻击检定获得+2状态加值"]],
  ["库尔斯克铁壁", ["阵地如铁", "本军队受到伤害时", "最多损失一点生命"]],
]);

async function readPack() {
  const { ClassicLevel } = await import(classicLevelUrl.href);
  const db = new ClassicLevel(fileURLToPath(new URL(packPath, moduleRoot)), {
    keyEncoding: "utf8",
    valueEncoding: "json",
  });
  await db.open();
  try {
    const documents = [];
    const folders = [];
    for await (const [key, value] of db.iterator()) {
      if (key.startsWith("!items!")) documents.push(value);
      if (key.startsWith("!folders!")) folders.push(value);
    }
    return { documents, folders };
  } finally {
    await db.close();
  }
}

test("army merit tactics pack is private and bundled", () => {
  const manifest = JSON.parse(readFileSync(new URL("module.json", moduleRoot), "utf8"));
  const pack = manifest.packs.find((entry) => entry.name === "kingmaker-tools-army-merit-tactics");
  assert.ok(pack, "missing army merit tactics pack manifest entry");
  assert.equal(pack.private, true);
  assert.equal(pack.type, "Item");
  assert.ok(existsSync(fileURLToPath(new URL(pack.path, moduleRoot))));
  assert.ok(manifest.packFolders.some((folder) => folder.packs.includes(pack.name)));
});

test("army merit tactics pack contains three medals and nine ace tactics", async () => {
  const { documents, folders } = await readPack();
  assert.equal(documents.length, 12);
  assert.deepEqual(new Set(folders.map((folder) => folder.name)), new Set(["功勋勋章", "王牌战术"]));
  assert.deepEqual(new Set(documents.filter((item) => meritNames.has(item.name)).map((item) => item.name)), meritNames);
  assert.deepEqual(new Set(documents.filter((item) => aceTactics.has(item.name)).map((item) => item.name)), new Set(aceTactics.keys()));

  for (const item of documents) {
    assert.match(item._id, /^[A-Za-z0-9]{16}$/, item.name);
    assert.equal(item.type, "campaignFeature", item.name);
    assert.equal(item.system.campaign, "kingmaker", item.name);
    assert.equal(item.system.category, "army-tactic", item.name);
    assert.equal(item.system.actionType.value, "passive", item.name);
    assert.equal(item.system.actions.value, null, item.name);
    assert.equal(item.system.location, null, item.name);
    assert.equal(item.flags?.["pf2e-kingmaker-tools"]?.hiddenFromArmyTraining, true, item.name);
    assert.match(
      item._stats.compendiumSource,
      new RegExp(`^Compendium\\.pf2e-kingmaker-tools\\.kingmaker-tools-army-merit-tactics\\.Item\\.${item._id}$`),
      item.name,
    );
    assert.ok(folders.some((folder) => folder._id === item.folder), `${item.name} has an invalid folder`);
  }
});

test("merit medals retain their thresholds and manual effects", async () => {
  const { documents } = await readPack();
  const veteran = documents.find((item) => item.name === "老兵勋章");
  const elite = documents.find((item) => item.name === "精锐勋章");
  const ace = documents.find((item) => item.name === "王牌勋章");

  assert.match(veteran.system.description.value, /功勋累计5/);
  assert.match(veteran.system.description.value, /轮末避免溃败的豁免/);
  assert.match(elite.system.description.value, /功勋累计15/);
  assert.match(elite.system.description.value, /检定或攻击骰/);
  assert.match(ace.system.description.value, /功勋累计30/);
  assert.match(ace.system.description.value, /获得一个王牌战术/);
  assert.equal(veteran.img, "icons/commodities/treasure/medal-ribbon-silver-purple.webp");
  assert.equal(elite.img, "icons/commodities/treasure/medal-ribbon-silver-blue.webp");
  assert.equal(ace.img, "icons/commodities/treasure/medal-ribbon-gold-red.webp");
  for (const medal of [veteran, elite, ace]) assert.deepEqual(medal.system.rules, [], medal.name);
});

test("ace tactics keep their intended army restrictions and text-only mechanics", async () => {
  const { documents } = await readPack();
  for (const [name, traits] of aceTactics) {
    const item = documents.find((entry) => entry.name === name);
    assert.ok(item, `missing ${name}`);
    assert.deepEqual([...item.system.traits.value].sort(), [...traits].sort(), name);
    for (const text of aceTacticText.get(name)) {
      assert.ok(item.system.description.value.includes(text), `${name} is missing: ${text}`);
    }
    assert.deepEqual(item.system.rules, [], name);
    assert.equal(item.system.actionType.value, "passive", name);
    assert.equal(item.system.actions.value, null, name);
    assert.equal(item.img, "icons/magic/control/control-influence-crown-yellow.webp", name);
  }
});

test("training browser excludes hidden merit tactics from all sources", () => {
  const main = readFileSync(new URL("dist/main.js", moduleRoot), "utf8");
  assert.match(main, /function isHiddenFromArmyTraining\(tactic\)/);
  assert.match(main, /flags\.pf2e-kingmaker-tools\.hiddenFromArmyTraining/);
  assert.match(main, /get_isArmyTactic\(element_0\) && !isHiddenFromArmyTraining\(element_0\)/);
});
