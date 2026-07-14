import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mainJs = readFileSync(new URL("../dist/main.js", import.meta.url), "utf8");
const nightAmbushTemplatePath = new URL("../dist/chatmessages/night-ambush.hbs", import.meta.url);
const nightAmbushWatchTemplatePath = new URL("../dist/chatmessages/night-ambush-watch.hbs", import.meta.url);

test("rest random encounter checks cover every started four-hour watch block", () => {
  assert.match(
    mainJs,
    /var size = Math\.ceil\(watchDurationSeconds \/ 14400\);/,
    "one-every-four-hours mode must include the final partial four-hour block",
  );
  assert.match(
    mainJs,
    /var end = Math\.min\(imul\(index_0, 14400\) \+ 14400 \| 0, watchDurationSeconds\);/,
    "the final partial block must not schedule an encounter after the remaining watch duration",
  );
});

test("continuing rest after an encounter checks the remaining watch duration", () => {
  assert.match(
    mainJs,
    /var watchDurationSeconds = camping\.watchSecondsRemaining > 0 \? camping\.watchSecondsRemaining : camping\.restSettings\.skipWatch \? 28800 : \(yield\* \/\*#__NOINLINE__\*\/getFullRestSeconds/,
    "beginRest_0 must use remaining watch seconds after an encounter interrupts rest",
  );
  assert.match(
    mainJs,
    /else \{\r?\n    yield\* \/\*#__NOINLINE__\*\/beginRest_0\(game, dispatcher, campingActor, camping, party, \$completion\);\r?\n  \}/,
    "rest should resume encounter checks instead of immediately completing daily preparations",
  );
});

test("disabled watch still checks random encounters across an eight-hour rest window", () => {
  assert.match(
    mainJs,
    /var randomEncounterDurationSeconds = camping\.restSettings\.skipWatch \? Math\.min\(watchDurationSeconds, 28800\) : watchDurationSeconds;/,
    "disabled watch should use up to eight hours for random encounter checks",
  );
  assert.match(
    mainJs,
    /findRandomEncounterAt\(game, campingActor, camping, randomEncounterDurationSeconds, \$completion\)/,
    "random encounter checks must use the dedicated encounter duration instead of total rest duration",
  );
});

test("disabling random encounters skips encounter lookup entirely", () => {
  assert.match(
    mainJs,
    /var randomEncounterAt = camping\.restSettings\.disableRandomEncounter \? null : \(yield\* \/\*#__NOINLINE__\*\/findRandomEncounterAt\(game, campingActor, camping, randomEncounterDurationSeconds, \$completion\)\);/,
    "disabled random encounters must not resolve regional encounter tables or roll encounter timing",
  );
});

test("overnight camping completion does not automatically refill PF2e daily resources", () => {
  assert.doesNotMatch(
    mainJs,
    /restForTheNight\(/,
    "camping rest completion should not invoke PF2e Rest for the Night automation",
  );
});

test("night ambush posts a player-clickable perception card instead of auto-rolling watch perception", () => {
  assert.match(
    mainJs,
    /var stealthDc = randomEncounterAt\.stealthDc == null \? \(yield\* askDc\(t_0\('camping\.enemyStealth'\), \$completion\)\) : randomEncounterAt\.stealthDc;/,
    "night ambushes should use the auto-detected lowest stealth DC and only prompt the GM as a fallback",
  );
  assert.doesNotMatch(
    mainJs,
    /performCampingCheck\([^;]+Perception_instance[^;]+true,\s*true/,
    "night ambushes should not automatically roll a secret watch Perception check",
  );
  assert.match(
    mainJs,
    /postChatTemplate\('chatmessages\/night-ambush\.hbs'/,
    "night ambushes should post the dedicated chat card",
  );
  assert.match(
    mainJs,
    /options:night-ambush/,
    "the player-clicked Perception check should be identifiable as a night ambush roll",
  );
  assert.doesNotMatch(
    mainJs,
    /@Check\[perception\|dc:' \+ stealthDc \+ '\|showDC:all/,
    "night ambush Perception links should not reveal the hidden Stealth DC to players",
  );
  assert.match(
    mainJs,
    /Hooks\.on\('createChatMessage', postNightAmbushOutcome\)/,
    "night ambush rolls should post the matching degree-of-success result after players click",
  );
  assert.match(mainJs, /夜袭察觉结果/);

  const template = readFileSync(nightAmbushTemplatePath, "utf8");
  assert.doesNotMatch(template, /袭击者隐秘 DC/);
  assert.doesNotMatch(template, /多个敌人取最低/);
  assert.doesNotMatch(template, /\{\{stealthDc\}\}/);
  assert.match(template, /\{\{\{perceptionCheck\}\}\}/);
  assert.match(template, /大成功[\s\S]*PC 不处于俯卧状态且拥有反应/);
  assert.match(template, /成功[\s\S]*熟睡的 PC 会醒来，并获得俯卧状态/);
  assert.match(template, /失败[\s\S]*敌人从 60 英尺距离内开始行动/);
  assert.match(template, /大失败[\s\S]*敌人起始位置距离 PC 15 英尺以内[\s\S]*Unconscious/);
});

test("random encounter rolls carry the lowest detected enemy stealth DC to rest ambushes", () => {
  assert.match(
    mainJs,
    /function \*getLowestStealthDcFromTableDraw\(/,
    "random encounter table draws should be inspectable for enemy stealth DCs",
  );
  assert.match(
    mainJs,
    /function getStealthDcFromActor\(/,
    "enemy stealth DCs should be read from PF2e actor statistics",
  );
  assert.match(
    mainJs,
    /Math\.min\(\.\.\.stealthDcs\)/,
    "multiple enemies should use the lowest stealth DC",
  );
  assert.match(
    mainJs,
    /return \{occurred: true, stealthDc: stealthDc\};/,
    "random encounter roll result should include the detected stealth DC",
  );
  assert.match(
    mainJs,
    /return \{seconds: checksAtSecond, stealthDc: randomEncounterResult\.stealthDc\};/,
    "rest encounter timing should carry the detected stealth DC",
  );
});

test("night ambush privately tells the GM which watch shift was interrupted", () => {
  assert.match(
    mainJs,
    /postNightAmbushWatchInfo\(watchers, randomEncounterAt\.seconds, watchDurationSeconds, camping\.increaseWatchActorNumber, \$completion\)/,
    "night ambushes should post watch shift information when an encounter happens",
  );
  assert.match(
    mainJs,
    /var watcherCount = collectionToArray\(watchers\)\.length \+ additionalWatchers \| 0;/,
    "the watch count should include system-configured additional watch actors",
  );
  assert.match(
    mainJs,
    /Math\.floor\(encounterAtSeconds \/ shiftSeconds\)/,
    "the interrupted watch should be calculated from encounter time divided by equal watch shift length",
  );
  assert.match(
    mainJs,
    /postChatTemplate\('chatmessages\/night-ambush-watch\.hbs'[\s\S]*RollMode_GMROLL_getInstance\(\)/,
    "watch shift information should be whispered to the GM",
  );

  const template = readFileSync(nightAmbushWatchTemplatePath, "utf8");
  assert.match(template, /第 \{\{watcherIndex\}\} 位守夜人/);
  assert.match(template, /守夜人数：\{\{watcherCount\}\}/);
  assert.match(template, /每人守夜：\{\{shiftDuration\}\}/);
  assert.match(template, /遭遇时间：\{\{encounterAt\}\}/);
});
