import assert from "node:assert/strict";
import {after, test} from "node:test";
import {promises as fs} from "node:fs";
import os from "node:os";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const jiti = require("jiti")(import.meta.url, {alias: {"@": path.join(root, "src")}});
const previousCwd = process.cwd();
const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "pubg-friendly-fire-"));
process.chdir(sandbox);
const previousFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("友伤检查禁止外网请求"); };
after(async () => {
  globalThis.fetch = previousFetch;
  process.chdir(previousCwd);
  await fs.rm(sandbox, {recursive: true, force: true});
});

const {parseTelemetryJson} = jiti(path.join(root, "src/lib/telemetry/parser.ts"));
const {buildFriendlyFireStats, getMatchFriendlyFire} = jiti(path.join(root, "src/lib/telemetry/friendly-fire.ts"));
const {getTelemetryEvents} = jiti(path.join(root, "src/lib/telemetry/service.ts"));
const {writeMeta, writeRawJson, writeParsedEvents, readMeta, readParsedEvents} =
  jiti(path.join(root, "src/lib/telemetry/storage.ts"));
const {PARSER_VERSION} = jiti(path.join(root, "src/lib/telemetry/types.ts"));
const {registerPubgMcpTools} = jiti(path.join(root, "src/lib/mcp/tools.ts"));

const alpha = {accountId: "account.alpha", name: "Alpha", teamId: 1, location: {x: 100, y: 100}};
const bravo = {accountId: "account.bravo", name: "Bravo", teamId: 1, location: {x: 1000, y: 1000}};
const enemy = {accountId: "account.enemy", name: "Enemy", teamId: 2, location: {x: 3000, y: 3000}};
const start = {_T: "LogMatchStart", _D: "2026-10-16T10:00:00Z", mapName: "Baltic_Main",
  characters: [alpha, bravo, enemy].map((character) => ({character}))};
const at = "2026-10-16T10:01:00Z";
const damage = (overrides = {}) => ({_T: "LogPlayerTakeDamage", _D: at,
  attacker: alpha, victim: bravo, damage: 10, attackId: 1,
  damageTypeCategory: "Damage_Gun", damageCauserName: "WeapHK416_C", damageReason: "TorsoShot", ...overrides});
const parse = (events, matchId = "test-match") => parseTelemetryJson([start, ...events], {matchId});

test("友伤保留全部伤害与载具来源，不受枪线采样或坐标缺失影响", () => {
  const parsed = parse([
    ...Array.from({length: 20}, () => damage({damage: 2.5})),
    damage({damage: 12.25, damageTypeCategory: "Damage_VehicleHit"}),
    damage({damage: 3.75, damageTypeCategory: "Damage_Molotov", attacker: {...alpha, location: undefined}}),
  ]);
  assert.equal(parsed.gunlines.length, 8);
  assert.equal(parsed.friendlyFire.length, 22);
  const stats = buildFriendlyFireStats(parsed, {limit: 2});
  assert.deepEqual(stats.summary, {damage: 66, damageEvents: 22, knocks: 0, kills: 0, finishes: 0});
  assert.equal(stats.events.length, 2);
  assert.equal(stats.totalEvents, 22);
  assert.equal(stats.hasMore, true);
  assert.equal(stats.events[0].weaponLabel, "M416");
  assert.equal(stats.events[0].t, 60);
});

test("排除敌伤、自伤、环境、机器人、无队伍、无效伤害与赛前事件", () => {
  const parsed = parse([
    damage({victim: enemy}), damage({victim: alpha}), damage({attacker: null}),
    damage({attacker: {...alpha, accountId: "ai.bot"}}),
    damage({attacker: {...alpha, accountId: "None"}}),
    damage({attacker: {...alpha, teamId: null}, victim: {...bravo, teamId: null}}),
    damage({attacker: {...alpha, teamId: -1}, victim: {...bravo, teamId: -1}}),
    damage({damage: 0}), damage({damage: -1}), damage({damage: NaN}),
    damage({_D: "2026-10-16T09:59:00Z"}),
  ]);
  const stats = buildFriendlyFireStats(parsed);
  assert.equal(stats.hasFriendlyFire, false);
  assert.equal(stats.summary.damage, 0);
  assert.equal(stats.totalEvents, 0);
});

test("使用事件当时队伍身份，不用玩家最终缓存身份反推", () => {
  const parsed = parse([damage({attacker: {...alpha, teamId: 3}, victim: {...bravo, teamId: 3}}),
    damage({attacker: {...alpha, teamId: 3}, victim: bravo})]);
  assert.equal(parsed.players.find((p) => p.accountId === alpha.accountId).teamId, 1);
  assert.equal(parsed.friendlyFire.length, 1);
  assert.equal(parsed.friendlyFire[0].attacker.teamId, 3);
});

test("官方队友击杀归属、敌方终结与队友补枪分别统计，去重官方名单", () => {
  const parsed = parse([
    {_T: "LogPlayerMakeGroggy", _D: at, attacker: alpha, victim: bravo, dBNOId: 7},
    {_T: "LogPlayerKillV2", _D: at, victim: bravo, killer: enemy, finisher: enemy,
      dBNOMaker: alpha, dBNOId: 7, teamKillers_AccountId: [alpha.accountId, alpha.accountId, "None", "ai.bot"],
      dBNODamageInfo: {damageCauserName: "WeapHK416_C"},
      killerDamageInfo: {damageCauserName: "WeapAWM_C"}},
    {_T: "LogPlayerKillV2", _D: at, victim: bravo, killer: enemy, finisher: alpha,
      finishDamageInfo: {damageCauserName: "WeapHK416_C"}},
    {_T: "LogPlayerKillV2", _D: at, victim: bravo, killer: alpha, finisher: alpha,
      teamKillers_AccountId: [alpha.accountId]},
  ]);
  const stats = buildFriendlyFireStats(parsed);
  assert.deepEqual(stats.summary, {damage: 0, damageEvents: 0, knocks: 1, kills: 2, finishes: 2});
  assert.equal(parsed.friendlyFire.find((e) => e.type === "kill").weaponId, "WeapHK416_C");
  assert.equal(parsed.friendlyFire.find((e) => e.type === "kill").evidence, "officialTeamKiller");
});

test("兼容旧版击杀与仅有官方账号归属；多人归属按死亡事件去重", () => {
  const parsed = parse([
    {_T: "LogPlayerKill", _D: at, victim: bravo, killer: alpha, damageCauserName: "WeapHK416_C"},
    {_T: "LogPlayerKillV2", _D: at, victim: bravo, killer: null, finisher: enemy,
      teamKillers_AccountId: [alpha.accountId, "account.missing", bravo.accountId]},
    {_T: "LogPlayerKillV2", _D: at, victim: bravo, killer: null, finisher: alpha},
  ]);
  const stats = buildFriendlyFireStats(parsed);
  assert.equal(stats.summary.kills, 2);
  assert.equal(stats.summary.finishes, 1);
  assert.equal(stats.pairs.reduce((sum, row) => sum + row.kills, 0), 3);
  assert.equal(parsed.friendlyFire.find((e) => e.attacker.accountId === "account.missing").weaponId, null);
});

test("玩家方向、双向聚合与分页互不影响统计；无效筛选明确报错", () => {
  const parsed = parse([damage(), damage({attacker: bravo, victim: alpha, damage: 4})]);
  const both = buildFriendlyFireStats(parsed, {accountId: alpha.accountId, limit: 1, offset: 1});
  assert.equal(both.summary.damage, 14);
  assert.equal(both.events.length, 1);
  assert.equal(both.hasMore, false);
  const player = both.players.find((p) => p.accountId === alpha.accountId);
  assert.equal(player.dealt.damage, 10);
  assert.equal(player.received.damage, 4);
  assert.equal(buildFriendlyFireStats(parsed, {accountId: alpha.accountId, direction: "received"}).summary.damage, 4);
  assert.equal(buildFriendlyFireStats(parsed, {accountId: alpha.accountId, direction: "dealt"}).summary.damage, 10);
  assert.throws(() => buildFriendlyFireStats(parsed, {direction: "dealt"}), /accountId/);
  assert.throws(() => buildFriendlyFireStats(parsed, {accountId: "unknown"}), /未找到/);
  assert.throws(() => buildFriendlyFireStats(parsed, {limit: 0}), /limit/);
});

test("缺少/过期/失败遥测返回不可用，旧缓存仅读不伪报零友伤", async () => {
  const absent = await getMatchFriendlyFire("steam", "absent", {autoParse: false});
  assert.equal(absent.status, "none");
  assert.equal(absent.summary, null);
  assert.equal(absent.hasFriendlyFire, null);
  for (const status of ["expired", "failed", "pending"]) {
    await writeMeta({matchId: status, platform: "steam", status, errorMessage: null});
    const result = await getMatchFriendlyFire("steam", status, {autoParse: false});
    assert.equal(result.status, status);
    assert.equal(result.summary, null);
  }
  const old = {...parse([damage()], "old"), parserVersion: "1.2.0"};
  delete old.friendlyFire;
  await writeParsedEvents("old", old);
  await writeMeta({matchId: "old", platform: "steam", status: "ready", parserVersion: "1.2.0"});
  assert.equal((await getMatchFriendlyFire("steam", "old", {autoParse: false})).status, "outdated");
  assert.equal((await readParsedEvents("old")).parserVersion, "1.2.0");
});

test("旧缓存从本地 raw 离线升级、并发复用；MCP 可调用且不暴露内部地址", async () => {
  await writeRawJson("old", [start, damage()]);
  const [result, parallel] = await Promise.all([
    getMatchFriendlyFire("steam", "old"), getMatchFriendlyFire("steam", "old"),
  ]);
  assert.equal(result.status, "ready");
  assert.equal(parallel.summary.damage, 10);
  assert.equal(result.parserVersion, PARSER_VERSION);
  assert.equal((await readMeta("old")).status, "ready");
  assert.equal((await readParsedEvents("old")).friendlyFire.length, 1);
  assert.equal((await getTelemetryEvents("steam", "old")).status, "ready");
  const tools = new Map();
  registerPubgMcpTools({registerTool(name, config, handler) { tools.set(name, {config, handler}); }});
  assert.equal(tools.size, 17);
  const {config, handler} = tools.get("get_match_friendly_fire");
  const args = config.inputSchema.parse({platform: "steam", matchId: "old", autoParse: false});
  const response = await handler(args);
  assert.equal(response.isError, undefined);
  const payload = JSON.parse(response.content[0].text);
  assert.equal(payload.summary.damage, 10);
  assert.equal(payload.mapLabel, "艾伦格");
  assert.doesNotMatch(response.content[0].text, /sourceUrl|telemetryUrl|rawPath|eventsPath/);
});
