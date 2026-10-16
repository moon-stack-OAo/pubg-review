import assert from "node:assert/strict";
import {after, test} from "node:test";
import {promises as fs} from "node:fs";
import os from "node:os";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const jiti = require("jiti")(import.meta.url, {alias: {"@": path.join(root, "src")}});
const previousCwd = process.cwd();
const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "pubg-cache-memory-"));
process.chdir(sandbox);
const previousFetch = globalThis.fetch;
let networkAttempts = 0;
globalThis.fetch = async () => {
  networkAttempts += 1;
  throw new Error("缓存内存检查禁止外网请求");
};

const {MemoryCache, CACHE_LIMITS, cacheGet, cacheSet, cacheDeleteIf, cacheGetOrSet} =
  jiti("@/lib/cache");
const {getCachedMatch, estimateMatchCacheBytes} = jiti("@/lib/pubg/service");
const {buildMatchReport} = jiti("@/lib/analysis/report-service");
const {RULE_VERSION_NO_TELEMETRY} = jiti("@/lib/analysis/report-engine");
const {RULE_VERSION_TELEMETRY} = jiti("@/lib/analysis/report-engine-telemetry");
const {writePersistedMatch, readPersistedMatch} = jiti("@/lib/persist/match-store");
const {writePersistedReport, readPersistedReport} = jiti("@/lib/persist/report-store");
const {syncPlayerHistory} = jiti("@/lib/history/service");
const {upsertHistoryMatches, readPlayerHistory, recordPlayerName, readNameHistory} =
  jiti("@/lib/history/storage");
const {writeMeta, writeParsedEvents, eventsPath} = jiti("@/lib/telemetry/storage");
const {PARSER_VERSION} = jiti("@/lib/telemetry/types");

after(async () => {
  globalThis.fetch = previousFetch;
  cacheDeleteIf(() => true);
  process.chdir(previousCwd);
  await fs.rm(sandbox, {recursive: true, force: true});
  assert.equal(networkAttempts, 0, "所有 fixture 均应从隔离磁盘读取");
});

const matchOptions = (estimatedBytes = 100) => ({category: "match", estimatedBytes});
const emptyStats = {entries: 0, matchEntries: 0, matchBytes: 0};
const participant = {accountId: "account.cache-test", name: "测试玩家", winPlace: 8,
  kills: 2, assists: 1, damageDealt: 250, survivalTimeSec: 600, dbnos: 1, revives: 0,
  headshotKills: 1, longestKill: 100, walkDistance: 500, rideDistance: 1000};
const makeMatch = (matchId, overrides = {}) => ({matchId, shard: "steam", mapName: "Baltic_Main",
  gameMode: "squad", matchType: "official", playedAt: "2026-10-16T10:00:00Z", durationSec: 1200,
  isCustomMatch: false, telemetryUrl: null,
  rosters: [{id: "roster-test", teamRank: 8, participants: [{...participant}]}], ...overrides});
const parsedFor = (matchId) => ({matchId, mapName: "Baltic_Main", durationSec: 1200,
  parserVersion: PARSER_VERSION, parsedAt: "2026-10-16T11:00:00Z",
  players: [{accountId: participant.accountId, name: participant.name, teamId: 1}],
  positions: [], zones: [], events: [], gunlines: [], vehicles: [], friendlyFire: []});
async function ready(matchId) {
  await writeParsedEvents(matchId, parsedFor(matchId));
  await writeMeta({matchId, platform: "steam", status: "ready", parserVersion: PARSER_VERSION});
}
const build = (matchId, options) => buildMatchReport("steam", matchId, participant.accountId, options);

test("match 硬条数、分类 LRU 与全局上限同时生效", () => {
  const cache = new MemoryCache({maxEntries: 3, matchMaxEntries: 2, matchMaxBytes: 4096});
  cache.set("small", true, 1000);
  cache.set("a", 1, 1000, matchOptions());
  cache.set("b", 2, 1000, matchOptions());
  assert.equal(cache.get("a"), 1);
  cache.set("c", 3, 1000, matchOptions());
  assert.equal(cache.get("b"), null);
  assert.equal(cache.get("small"), true);
  assert.equal(cache.stats.matchEntries, 2);
  cache.set("other", true, 1000);
  assert.equal(cache.get("a"), null);
  assert.equal(cache.stats.entries, 3);
  cache.deleteIf(() => true);
  assert.deepEqual(cache.stats, emptyStats);
});

test("字节预算淘汰最久未使用的 match；超大条目拒绝且保留其他缓存", () => {
  const cache = new MemoryCache({matchMaxBytes: 700});
  cache.set("small", true, 1000);
  cache.set("a", 1, 1000, matchOptions());
  cache.set("b", 2, 1000, matchOptions());
  cache.get("a");
  cache.set("c", 3, 1000, matchOptions(200));
  assert.equal(cache.get("b"), null);
  assert.equal(cache.get("a"), 1);
  assert.equal(cache.stats.matchBytes, 560);
  assert.equal(cache.set("huge", {}, 1000, matchOptions(701)), false);
  assert.equal(cache.get("small"), true);
  assert.equal(cache.stats.matchEntries, 2);
  cache.deleteIf(() => true);
});

test("替换、分类切换、拒绝替换及按前缀删除准确释放预算", () => {
  const cache = new MemoryCache({maxEntries: 2, matchMaxBytes: 1000});
  cache.set("a", 1, 1000, matchOptions(400));
  cache.set("b", 2, 1000, matchOptions());
  cache.set("a", 3, 1000, matchOptions());
  assert.equal(cache.get("b"), 2, "满容量替换不能额外淘汰其他条目");
  assert.equal(cache.stats.matchBytes, 460);
  cache.set("a", 4, 1000);
  assert.equal(cache.stats.matchBytes, 230);
  assert.equal(cache.set("b", 5, 1000, matchOptions(1001)), false);
  assert.equal(cache.get("b"), null);
  assert.equal(cache.stats.matchBytes, 0);
  cache.set("match:x", 6, 1000, matchOptions());
  assert.equal(cache.deleteIf((key) => key.startsWith("match:")), 1);
  assert.equal(cache.stats.matchBytes, 0);
  cache.deleteIf(() => true);
});

test("TTL 到期边界、插入清理与非法预算不能保留旧引用", () => {
  let now = 0;
  const cache = new MemoryCache({clock: () => now});
  cache.set("a", 1, 10, matchOptions());
  cache.set("b", 2, 5, matchOptions());
  now = 5;
  assert.equal(cache.get("b"), null);
  assert.equal(cache.stats.matchEntries, 1);
  now = 10;
  cache.set("c", true, 10);
  assert.equal(cache.stats.matchEntries, 0);
  for (const size of [-1, NaN, Infinity, 1.5]) {
    assert.equal(cache.set("bad", {}, 10, matchOptions(size)), false);
  }
  assert.equal(cache.set("c", true, 0), false);
  assert.deepEqual(cache.stats, emptyStats);
});

test("空闲时定时清理实际删除过期对象，不需要 get 或插入压力", (t) => {
  t.mock.timers.enable({apis: ["setInterval"]});
  let now = 0;
  const cache = new MemoryCache({clock: () => now, cleanupIntervalMs: 50});
  cache.set("a", {}, 10, matchOptions());
  cache.set("b", {}, 20);
  now = 20;
  t.mock.timers.tick(50);
  assert.deepEqual(cache.stats, emptyStats);
  cache.set("again", {}, 1, matchOptions());
  now = 21;
  t.mock.timers.tick(50);
  assert.deepEqual(cache.stats, emptyStats, "清空后再次插入会重新启动清理");
});

test("清理定时器 unref 后不会阻止 Node 退出", () => {
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import {createRequire} from 'node:module';
    const require = createRequire(${JSON.stringify(import.meta.url)});
    const jiti = require('jiti')(${JSON.stringify(import.meta.url)});
    const {MemoryCache} = jiti(${JSON.stringify(path.join(root, "src/lib/cache.ts"))});
    new MemoryCache().set('alive', {}, 86400000);
  `], {cwd: sandbox, timeout: 10_000, encoding: "utf8"});
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr);
});

test("通用缓存和命中路径不序列化对象；inflight 继续合并并发加载", async () => {
  const value = {toJSON() { throw new Error("缓存不可序列化"); }};
  cacheSet("test:no-serialize", value, 1000);
  assert.equal(cacheGet("test:no-serialize"), value);
  let loads = 0;
  const loader = async () => { loads += 1; return value; };
  const [a, b] = await Promise.all([
    cacheGetOrSet("test:inflight", 1000, loader), cacheGetOrSet("test:inflight", 1000, loader),
  ]);
  assert.equal(loads, 1);
  assert.equal(a.value, value);
  assert.equal(b.value, value);
});

test("正常百人对局估算保守；match 内存只保留最近 64 场，淘汰后可从磁盘恢复", async () => {
  const normal = makeMatch("normal", {rosters: Array.from({length: 25}, (_, team) => ({
    id: `team-${team}`, teamRank: team + 1,
    participants: Array.from({length: 4}, (_, index) => ({...participant, accountId: `account.${team}.${index}`})),
  }))});
  const bytes = estimateMatchCacheBytes(normal);
  assert.ok(bytes >= 100 * 1024 && bytes < 256 * 1024);
  const originalStringify = JSON.stringify;
  try {
    JSON.stringify = () => { throw new Error("估算器不可序列化"); };
    assert.equal(estimateMatchCacheBytes(normal), bytes);
  } finally {
    JSON.stringify = originalStringify;
  }
  cacheDeleteIf((key) => key.startsWith("match:"));
  for (let index = 0; index <= CACHE_LIMITS.matchMaxEntries; index += 1) {
    const match = makeMatch(`capacity-${index}`);
    await writePersistedMatch(match, "steam");
    assert.equal((await getCachedMatch("steam", match.matchId)).cached, true);
    assert.ok(cacheGet(`match:steam:${match.matchId}`), `第 ${index} 场应进入内存`);
  }
  assert.equal(cacheGet("match:steam:capacity-0"), null);
  assert.ok(cacheGet("match:steam:capacity-64"));
  assert.equal((await getCachedMatch("steam", "capacity-0")).value.matchId, "capacity-0");
});

test("超预算对局不进入内存，重复访问仍离线走磁盘", async () => {
  const match = makeMatch("oversized", {telemetryUrl: "x".repeat(CACHE_LIMITS.matchMaxBytes / 2)});
  await writePersistedMatch(match, "steam");
  for (let index = 0; index < 2; index += 1) {
    const result = await getCachedMatch("steam", match.matchId);
    assert.equal(result.cached, true);
    assert.equal(result.value.telemetryUrl.length, match.telemetryUrl.length);
    assert.equal(cacheGet(`match:steam:${match.matchId}`), null);
  }
});

test("ready 报告内存/磁盘命中不读取 events，force 才读取并重建", async (t) => {
  const matchId = "report-hit";
  await writePersistedMatch(makeMatch(matchId), "steam");
  await ready(matchId);
  const originalRead = fs.readFile.bind(fs);
  let eventReads = 0;
  let reportReads = 0;
  t.mock.method(fs, "readFile", async (file, ...args) => {
    if (String(file) === eventsPath(matchId)) eventReads += 1;
    if (String(file).includes(`${path.sep}reports${path.sep}${matchId}${path.sep}`)) reportReads += 1;
    return originalRead(file, ...args);
  });
  const generated = await build(matchId);
  assert.equal(generated.cached, false);
  assert.equal(generated.report.ruleVersion, RULE_VERSION_TELEMETRY);
  assert.equal(eventReads, 1);
  assert.equal(reportReads, 1);
  assert.equal((await build(matchId)).cached, true);
  assert.equal(eventReads, 1);
  assert.equal(reportReads, 1, "内存命中无需再读磁盘报告");
  cacheDeleteIf((key) => key.startsWith("report:") && key.includes(`:${matchId}:`));
  assert.equal((await build(matchId)).cached, true);
  assert.equal(eventReads, 1);
  assert.equal(reportReads, 2, "失效内存后命中磁盘报告");
  assert.equal((await build(matchId, {force: true})).cached, false);
  assert.equal(eventReads, 2);
  assert.equal(reportReads, 2, "force 跳过内存和磁盘报告");
});

test("ready 但文件缺失/空/非法 JSON/结构损坏均正确降级；修复后会自动升级", async () => {
  for (const [index, contents] of [null, "", "{broken", "{}", "null"].entries()) {
    const matchId = `report-broken-${index}`;
    await writePersistedMatch(makeMatch(matchId), "steam");
    await ready(matchId);
    if (contents === null) await fs.unlink(eventsPath(matchId));
    else await fs.writeFile(eventsPath(matchId), contents);
    const result = await build(matchId);
    assert.equal(result.report.ruleVersion, RULE_VERSION_NO_TELEMETRY);
    assert.equal(result.report.degraded, true);
    const forced = await build(matchId, {force: true});
    assert.equal(forced.report.degraded, true);
    await ready(matchId);
    const upgraded = await build(matchId);
    assert.equal(upgraded.cached, false);
    assert.equal(upgraded.report.ruleVersion, RULE_VERSION_TELEMETRY);
    assert.equal(upgraded.report.degraded, false);
  }
});

test("none → ready 跳过旧内存/磁盘基础报告；增强报告缺少 events 时降级", async () => {
  for (const clearMemory of [false, true]) {
    const matchId = `report-upgrade-${clearMemory}`;
    await writePersistedMatch(makeMatch(matchId), "steam");
    assert.equal((await build(matchId)).report.ruleVersion, RULE_VERSION_NO_TELEMETRY);
    assert.equal((await build(matchId)).cached, true);
    if (clearMemory) cacheDeleteIf((key) => key.startsWith("report:"));
    await ready(matchId);
    const result = await build(matchId);
    assert.equal(result.cached, false);
    assert.equal(result.report.ruleVersion, RULE_VERSION_TELEMETRY);
    await fs.unlink(eventsPath(matchId));
    const fallback = await build(matchId);
    assert.equal(fallback.report.ruleVersion, RULE_VERSION_NO_TELEMETRY);
    assert.equal(fallback.report.degraded, true);
  }
});

test("stat 后 events 丢失仍降级，不把生成错误暴露给用户", async (t) => {
  const matchId = "report-read-race";
  await writePersistedMatch(makeMatch(matchId), "steam");
  await ready(matchId);
  const originalRead = fs.readFile.bind(fs);
  t.mock.method(fs, "readFile", async (file, ...args) => {
    if (String(file) === eventsPath(matchId)) throw new Error("模拟文件在 stat 后消失");
    return originalRead(file, ...args);
  });
  assert.equal((await build(matchId)).report.ruleVersion, RULE_VERSION_NO_TELEMETRY);
});

test("match/history/name/report 写锁在成功与失败后释放，并发追加不丢更新", async (t) => {
  const chains = new Set();
  const originalSet = Map.prototype.set;
  // 观察私有锁 Map，避免为了断言而给业务代码增加导出。
  t.mock.method(Map.prototype, "set", function (key, value) {
    if (String(key).startsWith("lock-test-") && value instanceof Promise) chains.add(this);
    return originalSet.call(this, key, value);
  });
  const accountId = "lock-test-account";
  const records = Array.from({length: 12}, (_, index) => ({matchId: `match-${index}`,
    playedAt: new Date(Date.UTC(2026, 9, 16, 0, index)).toISOString(), savedAt: "saved"}));
  await Promise.all(records.map((record, index) => Promise.all([
    upsertHistoryMatches(accountId, "steam", [record]),
    recordPlayerName(accountId, "steam", `name-${index}`),
    writePersistedMatch(makeMatch("lock-test-match", {durationSec: index}), "steam"),
    writePersistedReport("steam", "lock-test-report", accountId,
      {matchId: "lock-test-report", accountId, sampleIndex: index}),
  ])));
  assert.equal((await readPlayerHistory(accountId)).matches.length, 12);
  assert.equal((await readNameHistory(accountId)).names.length, 12);
  assert.equal((await readPersistedMatch("lock-test-match", "steam")).durationSec, 11);
  assert.equal((await readPersistedReport("lock-test-report", accountId)).sampleIndex, 11);
  assert.equal(chains.size, 4);
  for (const chain of chains) assert.equal(chain.size, 0);

  const originalWrite = fs.writeFile.bind(fs);
  let remainingFailures = 4;
  t.mock.method(fs, "writeFile", async (...args) => {
    if (remainingFailures > 0) {
      remainingFailures -= 1;
      throw new Error("模拟磁盘写入失败");
    }
    return originalWrite(...args);
  });
  const failed = await Promise.allSettled([
    upsertHistoryMatches(accountId, "steam", [records[0]]),
    recordPlayerName(accountId, "steam", "failed"),
    writePersistedMatch(makeMatch("lock-test-match"), "steam"),
    writePersistedReport("steam", "lock-test-report", accountId, {matchId: "lock-test-report", accountId}),
  ]);
  assert.ok(failed.every((result) => result.status === "rejected"));
  for (const chain of chains) assert.equal(chain.size, 0);
  await Promise.all([
    upsertHistoryMatches(accountId, "steam", [{...records[0], matchId: "recovered"}]),
    recordPlayerName(accountId, "steam", "recovered"),
    writePersistedMatch(makeMatch("lock-test-match", {durationSec: 99}), "steam"),
    writePersistedReport("steam", "lock-test-report", accountId,
      {matchId: "lock-test-report", accountId, sampleIndex: 99}),
  ]);
  assert.equal((await readPlayerHistory(accountId)).matches.length, 13);
  assert.equal((await readNameHistory(accountId)).names[0].name, "recovered");
  assert.equal((await readPersistedMatch("lock-test-match", "steam")).durationSec, 99);
  assert.equal((await readPersistedReport("lock-test-report", accountId)).sampleIndex, 99);
  for (const chain of chains) assert.equal(chain.size, 0);
});

test("旧任务完成不会删除仍在等待的尾锁；中途追加第三次写入仍串行", async (t) => {
  const chains = new Map();
  const originalSet = Map.prototype.set;
  t.mock.method(Map.prototype, "set", function (key, value) {
    if (String(key).startsWith("lock-tail-") && value instanceof Promise) {
      originalSet.call(chains, key, this);
    }
    return originalSet.call(this, key, value);
  });
  const originalWrite = fs.writeFile.bind(fs);
  let target = "";
  let writes = 0;
  let enterSecond;
  let releaseSecond;
  let secondGate;
  t.mock.method(fs, "writeFile", async (file, ...args) => {
    if (String(file) === target && ++writes === 2) {
      enterSecond();
      await secondGate;
    }
    return originalWrite(file, ...args);
  });
  for (const kind of ["history", "name-history", "matches", "reports"]) {
    const id = `lock-tail-${kind}`;
    const key = kind === "reports" ? `${id}:${participant.accountId}` : id;
    target = kind === "reports"
      ? path.join(sandbox, ".data", kind, id, `${participant.accountId}.json`)
      : path.join(sandbox, ".data", kind, `${key}.json`);
    writes = 0;
    const secondEntered = new Promise((resolve) => { enterSecond = resolve; });
    secondGate = new Promise((resolve) => { releaseSecond = resolve; });
    const write = (index) => {
      if (kind === "history") return upsertHistoryMatches(key, "steam", [{
        matchId: `match-${index}`, playedAt: "2026-10-16T10:00:00Z", savedAt: "saved",
      }]);
      if (kind === "name-history") return recordPlayerName(key, "steam", `name-${index}`);
      if (kind === "reports") return writePersistedReport("steam", id, participant.accountId,
        {matchId: id, accountId: participant.accountId, sampleIndex: index});
      return writePersistedMatch(makeMatch(key, {durationSec: index}), "steam");
    };
    const first = write(1);
    const second = write(2);
    try {
      await first;
      await secondEntered;
      assert.equal(chains.get(key)?.has(key), true, `${kind} 的第二次写入仍须持锁`);
      const third = write(3);
      releaseSecond();
      await Promise.all([second, third]);
      assert.equal(chains.get(key).size, 0);
      if (kind === "history") assert.equal((await readPlayerHistory(key)).matches.length, 3);
      else if (kind === "name-history") assert.equal((await readNameHistory(key)).names.length, 3);
      else if (kind === "reports") assert.equal((await readPersistedReport(id, participant.accountId)).sampleIndex, 3);
      else assert.equal((await readPersistedMatch(key, "steam")).durationSec, 3);
    } finally {
      releaseSecond();
      await second;
    }
  }
});

test("同一账号同步中拒绝重复执行，成功保留冷却，失败后释放执行锁", async (t) => {
  const accountId = participant.accountId;
  const name = participant.name;
  const matchId = "sync-inflight";
  await writePersistedMatch(makeMatch(matchId), "steam");
  cacheSet(`player:steam:${name}`, {accountId, name, platform: "steam", shard: "steam",
    banType: "Innocent", clanId: null, matchIds: [matchId]}, 60_000);
  const originalRead = fs.readFile.bind(fs);
  const originalWrite = fs.writeFile.bind(fs);
  const matchFile = path.join(sandbox, ".data", "matches", `${matchId}.json`);
  const historyFile = path.join(sandbox, ".data", "history", `${accountId}.json`);
  let enter;
  let release;
  const entered = new Promise((resolve) => { enter = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  let blockRead = true;
  let failWrite = false;
  let historyWrites = 0;
  t.mock.method(fs, "readFile", async (file, ...args) => {
    if (blockRead && String(file) === matchFile) {
      blockRead = false;
      enter();
      await gate;
    }
    return originalRead(file, ...args);
  });
  t.mock.method(fs, "writeFile", async (file, ...args) => {
    if (String(file) === historyFile) {
      historyWrites += 1;
      if (failWrite) throw new Error("模拟同步落盘失败");
    }
    return originalWrite(file, ...args);
  });
  const first = syncPlayerHistory("steam", accountId, name);
  try {
    await entered;
    await assert.rejects(syncPlayerHistory("steam", accountId, name),
      (error) => error.code === 40901 && error.message.includes("进行中"));
  } finally {
    release();
    await first;
  }
  assert.equal(historyWrites, 1);
  await assert.rejects(syncPlayerHistory("steam", accountId, name),
    (error) => error.code === 40901 && error.message.includes("冷却"));
  cacheDeleteIf((key) => key === `history:sync:cooldown:${accountId}`);
  failWrite = true;
  await assert.rejects(syncPlayerHistory("steam", accountId, name), /模拟同步落盘失败/);
  failWrite = false;
  const recovered = await syncPlayerHistory("steam", accountId, name);
  assert.equal(recovered.upserted, 1);
  assert.equal(recovered.cooldownSec, 90);
  assert.equal(historyWrites, 3);
});
