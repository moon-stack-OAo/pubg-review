import assert from "node:assert/strict";
import {after, test} from "node:test";
import {promises as fs} from "node:fs";
import os from "node:os";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {execFile} from "node:child_process";
import {promisify} from "node:util";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const jiti = require("jiti")(import.meta.url, {alias: {"@": path.join(root, "src")}});
const previousCwd = process.cwd();
const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "pubg-telemetry-memory-"));
process.chdir(sandbox);
const previousFetch = globalThis.fetch;
let mockFetch = async () => { throw new Error("遥测内存检查禁止外网请求"); };
globalThis.fetch = (...args) => mockFetch(...args);
after(async () => {
  globalThis.fetch = previousFetch;
  process.chdir(previousCwd);
  await fs.rm(sandbox, {recursive: true, force: true});
});

const {createTelemetryTaskQueue, runTelemetryTask} = jiti(path.join(root, "src/lib/telemetry/task-queue.ts"));
const {readTelemetryArray, TELEMETRY_MAX_BYTES} = jiti(path.join(root, "src/lib/telemetry/json-stream.ts"));
const {parseTelemetryJson, parseTelemetryFile} = jiti(path.join(root, "src/lib/telemetry/parser.ts"));
const {parseMatchTelemetry, loadMatchTelemetry} = jiti(path.join(root, "src/lib/telemetry/service.ts"));
const {writeRawJson, writeRawFile, rawPath, writeParsedEvents, writeMeta, readMeta, readParsedEvents, readRawJson} =
  jiti(path.join(root, "src/lib/telemetry/storage.ts"));
const {downloadTelemetryToFile, assertSafeTelemetryUrl} = jiti(path.join(root, "src/lib/pubg/client.ts"));
const {writePersistedMatch} = jiti(path.join(root, "src/lib/persist/match-store.ts"));

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return {promise, resolve};
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
const collect = async (file) => {
  const out = [];
  for await (const value of readTelemetryArray(file)) out.push(value);
  return out;
};
const withoutParsedAt = (parsed) => {
  const copy = {...parsed};
  delete copy.parsedAt;
  return copy;
};
const start = {_T: "LogMatchStart", _D: "2026-10-16T10:00:00Z", mapName: "Baltic_Main"};
const alpha = {accountId: "account.a", name: '中文😀\\\"[]', teamId: 1, location: {x: 100, y: 200}};
const bravo = {accountId: "account.b", name: "Bravo", teamId: 1, location: {x: 900, y: 800}};
const damage = (seconds, overrides = {}) => ({_T: "LogPlayerTakeDamage",
  _D: new Date(Date.parse(start._D) + seconds * 1000).toISOString(), attacker: alpha, victim: bravo,
  damage: 2.5, damageTypeCategory: "Damage_Gun", damageCauserName: "WeapHK416_C", ...overrides});

test("有界队列跨 match 串行，同 key 复用；拒绝超额且失败后继续", async () => {
  const queue = createTelemetryTaskQueue(2);
  const gate = deferred();
  const order = [];
  const first = queue("a", async () => { order.push("a"); await gate.promise; throw new Error("预期失败"); });
  const firstError = assert.rejects(first, /预期失败/);
  assert.equal(first, queue("a", async () => { throw new Error("不能执行重复任务"); }));
  const second = queue("b", async () => { order.push("b"); return 2; });
  const third = queue("c", async () => { order.push("c"); return 3; });
  assert.equal(second, queue("b", async () => 99));
  await assert.rejects(queue("d", async () => 4), (error) => error.status === 429 && error.code === 42902);
  assert.deepEqual(order, ["a"]);
  gate.resolve();
  await firstError;
  assert.deepEqual(await Promise.all([second, third]), [2, 3]);
  assert.deepEqual(order, ["a", "b", "c"]);
  assert.equal(await queue("a", async () => 5), 5);
});

test("串行保护发生在 ready events 与 raw 文件读取之前，force 同场复用", async () => {
  await writeRawJson("queue-raw", [start]);
  const parsed = parseTelemetryJson([start], {matchId: "queue-ready"});
  await writeParsedEvents("queue-ready", parsed);
  await writeMeta({matchId: "queue-ready", platform: "steam", status: "ready"});
  const gate = deferred();
  const blocker = runTelemetryTask("test:read-gate", () => gate.promise);
  const originalRead = fs.readFile;
  const originalAccess = fs.access;
  const reads = [];
  fs.readFile = async (file, ...args) => { reads.push(String(file)); return originalRead.call(fs, file, ...args); };
  fs.access = async (file, ...args) => { reads.push(String(file)); return originalAccess.call(fs, file, ...args); };
  const parse = parseMatchTelemetry("steam", "queue-raw", {force: true});
  assert.equal(parse, parseMatchTelemetry("steam", "queue-raw", {force: true}));
  const jobs = [parse, parseMatchTelemetry("steam", "queue-ready"),
    loadMatchTelemetry("steam", "queue-ready"), readParsedEvents("queue-ready"), readRawJson("queue-raw")];
  try {
    await tick();
    assert.deepEqual(reads, []);
  } finally {
    gate.resolve();
    await blocker;
    let results;
    try {
      results = await Promise.all(jobs);
    } finally {
      fs.readFile = originalRead;
      fs.access = originalAccess;
    }
    assert.equal(results[0].meta.status, "ready");
    assert.equal(results[1].cached, true);
    assert.equal(results[2].parsed.matchId, "queue-ready");
    assert.ok(reads.some((file) => file.endsWith("events.json")));
    assert.ok(reads.some((file) => file.endsWith("raw.json")));
  }
});

test("真实服务跨 match 下载串行，同场只下载一次，失败后后续任务成功", async () => {
  for (const matchId of ["download-a", "download-b", "download-fail", "download-after"]) {
    await writePersistedMatch({matchId, shard: "steam", matchType: "official", mapName: "Baltic_Main", durationSec: 60,
      telemetryUrl: `https://telemetry-cdn.pubg.com/${matchId}`, rosters: []}, "steam");
  }
  const entered = deferred();
  const gate = deferred();
  const calls = [];
  mockFetch = async (url, init) => {
    assert.equal(init.redirect, "manual");
    assert.equal(init.cache, "no-store");
    assert.ok(init.signal instanceof AbortSignal);
    assert.equal(init.headers.Authorization, undefined);
    const id = new URL(url).pathname.slice(1);
    calls.push(id);
    if (id === "download-fail") return new Response("[{broken]", {status: 200});
    if (id !== "download-a") return new Response(JSON.stringify([start]));
    entered.resolve();
    return new Response(new ReadableStream({async pull(controller) {
      await gate.promise;
      controller.enqueue(new TextEncoder().encode(JSON.stringify([start])));
      controller.close();
    }}));
  };
  const first = parseMatchTelemetry("steam", "download-a");
  assert.equal(first, parseMatchTelemetry("steam", "download-a"));
  await entered.promise;
  const second = parseMatchTelemetry("steam", "download-b");
  const failed = parseMatchTelemetry("steam", "download-fail");
  const afterFailure = parseMatchTelemetry("steam", "download-after");
  await tick();
  assert.deepEqual(calls, ["download-a"]);
  gate.resolve();
  const results = await Promise.all([first, second, failed, afterFailure]);
  assert.deepEqual(results.map((result) => result.meta.status), ["ready", "ready", "failed", "ready"]);
  assert.deepEqual(calls, ["download-a", "download-b", "download-fail", "download-after"]);
  await assert.rejects(fs.access(rawPath("download-fail")), {code: "ENOENT"});
  assert.deepEqual(await fs.readdir(path.dirname(rawPath("download-fail"))), ["meta.json"]);
});

test("解压后的 80MiB 超限立即取消，临时文件清理且不覆盖已有 raw", async () => {
  const original = JSON.stringify([start]);
  await writeRawJson("oversize", original);
  let cancelled = false;
  let produced = 0;
  const block = new Uint8Array(1024 * 1024);
  mockFetch = async () => new Response(new ReadableStream({
    pull(controller) { produced++; controller.enqueue(block); },
    cancel() { cancelled = true; },
  }, {highWaterMark: 0}), {headers: {"content-length": "12", "content-encoding": "gzip"}});
  await assert.rejects(writeRawFile("oversize", (temporary) =>
    downloadTelemetryToFile("https://telemetry-cdn.pubg.com/large", temporary)),
  (error) => error.status === 413);
  assert.equal(cancelled, true);
  assert.equal(produced, TELEMETRY_MAX_BYTES / block.byteLength + 1);
  assert.equal(await fs.readFile(rawPath("oversize"), "utf8"), original);
  assert.deepEqual(await fs.readdir(path.dirname(rawPath("oversize"))), ["raw.json"]);
  await assert.rejects(writeRawFile("oversize", async (temporary) => {
    await fs.writeFile(temporary, "[invalid]");
    return parseTelemetryFile(temporary, {matchId: "oversize"});
  }));
  assert.equal(await fs.readFile(rawPath("oversize"), "utf8"), original);
  assert.deepEqual(await fs.readdir(path.dirname(rawPath("oversize"))), ["raw.json"]);
  await writeRawFile("oversize", async (temporary) => {
    await fs.writeFile(temporary, "[]");
    return parseTelemetryFile(temporary, {matchId: "oversize"});
  });
  assert.equal(await fs.readFile(rawPath("oversize"), "utf8"), "[]");
  mockFetch = async () => new Response(null, {status: 302, headers: {location: "https://localhost/secret"}});
  await assert.rejects(writeRawFile("redirect", (temporary) =>
    downloadTelemetryToFile("https://telemetry-cdn.pubg.com/redirect", temporary)), /拒绝重定向/);
  assert.deepEqual(await fs.readdir(path.dirname(rawPath("redirect"))), []);
  for (const url of ["http://telemetry-cdn.pubg.com/x", "https://127.0.0.1/x", "https://evil.example/x",
    "https://telemetry-cdn.pubg.com.evil.example/x", "https://user:pass@telemetry-cdn.pubg.com/x"]) {
    assert.throws(() => assertSafeTelemetryUrl(url));
  }
});

test("旧版遗留截断 raw 可以重新下载恢复，校验完成后才替换原文件", async () => {
  const matchId = "truncated-raw";
  await writeRawJson(matchId, `[${JSON.stringify(start)},`);
  await writePersistedMatch({matchId, shard: "steam", matchType: "official", mapName: "Baltic_Main",
    durationSec: 60, telemetryUrl: "https://telemetry-cdn.pubg.com/recover", rosters: []}, "steam");
  let calls = 0;
  mockFetch = async () => { calls++; return new Response(JSON.stringify([start, damage(60)])); };
  assert.equal((await parseMatchTelemetry("steam", matchId)).meta.status, "ready");
  assert.equal(calls, 1);
  assert.deepEqual(JSON.parse(await fs.readFile(rawPath(matchId), "utf8")), [start, damage(60)]);
  assert.deepEqual((await fs.readdir(path.dirname(rawPath(matchId)))).sort(), ["events.json", "meta.json", "raw.json"]);
});

test("流式切分兼容跨块转义、反斜杠、UTF-8、嵌套、空数组及原生 JSON 校验", async () => {
  const prefix = '[{"note":"';
  const padding = "x".repeat(65535 - Buffer.byteLength(prefix));
  const texts = ["[]", ' [ {}, [1,true,null,{},[]], "a", -1.2e+3 ] ',
    `${prefix}${padding}\\\"结束\\\\[]{}"}]`,
    `${prefix}${padding}😀中文"}]`,
    `${prefix}${padding}\\u4e2d"}]`];
  for (let i = 0; i < texts.length; i++) {
    const file = path.join(sandbox, `chunks-${i}.json`);
    await fs.writeFile(file, texts[i]);
    assert.deepEqual(await collect(file), JSON.parse(texts[i]));
  }
  for (const text of ["", "{}", "[{},]", "[{} {}]", "[,]", '[[1,2}', '[]true', '[{"note":"bad\\q"}]']) {
    const file = path.join(sandbox, "invalid.json");
    await fs.writeFile(file, text);
    await assert.rejects(collect(file));
  }
});

test("两遍解析保留迟到 matchStart、首时间回退、elapsedTime、友伤 ID 与回放采样", async () => {
  const positions = [1.9, 1.2, 1.2, 0.9].map((elapsedTime, i) => ({_T: "LogPlayerPosition",
    _D: "2026-10-16T10:00:10Z", elapsedTime, character: {...alpha, location: {x: i, y: 1}}}));
  const fixture = [damage(-1), ...positions, start, ...Array.from({length: 20}, (_, i) => damage(5 + i / 100)),
    {_T: "LogPlayerMakeGroggy", _D: "2026-10-16T10:00:06Z", attacker: alpha, victim: bravo},
    {_T: "LogPlayerKillV2", _D: "2026-10-16T10:00:07Z", killer: alpha, finisher: alpha, victim: bravo,
      teamKillers_AccountId: [alpha.accountId]},
    ...[2, 1, 6].map((elapsedTime) => ({_T: "LogGameStatePeriodic", gameState: {elapsedTime,
      safetyZonePosition: {x: 1, y: 2}, safetyZoneRadius: 50}}))];
  for (const [i, events] of [fixture, fixture.filter((ev) => ev !== start), [{_T: "LogMatchStart"}], []].entries()) {
    const file = path.join(sandbox, `semantic-${i}.json`);
    await fs.writeFile(file, JSON.stringify(events));
    const options = {matchId: `semantics-${i}`, durationSec: 9999, sampleHz: 1};
    const actual = await parseTelemetryFile(file, options);
    assert.deepEqual(withoutParsedAt(actual), withoutParsedAt(parseTelemetryJson(events, options)));
    if (i === 0) {
      assert.equal(actual.friendlyFire.filter((event) => event.type === "damage").length, 20);
      assert.equal(actual.friendlyFire[0].sourceEventId, 6);
      assert.equal(actual.friendlyFire[0].t, 5);
      assert.equal(actual.gunlines.filter((line) => line.kind === "damage" && line.t >= 5).length, 8);
      assert.deepEqual(actual.positions.map(({t, x}) => ({t, x})), [{t: 0.9, x: 3}, {t: 1.2, x: 1}]);
      assert.deepEqual(actual.zones.map((zone) => zone.t), [2, 6]);
    }
  }
});

test("已有 raw 的 force 重解析全程离线，大量不相关事件无需展开整个 raw 数组", async () => {
  mockFetch = async () => { throw new Error("离线重解析不能联网"); };
  const file = rawPath("large-offline");
  await fs.mkdir(path.dirname(file), {recursive: true});
  const handle = await fs.open(file, "w");
  const ignored = JSON.stringify({_T: "LogIgnored", payload: {nested: [{value: "x".repeat(1024)}]}});
  try {
    await handle.write(`[${JSON.stringify(start)}`);
    const batch = `,${ignored}`.repeat(1024);
    for (let i = 0; i < 48; i++) await handle.write(batch);
    await handle.write("," + JSON.stringify(damage(60)) + "]");
  } finally { await handle.close(); }
  const result = await parseMatchTelemetry("steam", "large-offline", {force: true});
  assert.equal(result.meta.status, "ready");
  const parsed = await readParsedEvents("large-offline");
  assert.equal(parsed.friendlyFire.length, 1);
  assert.equal(parsed.friendlyFire[0].sourceEventId, 48 * 1024 + 1);
  assert.equal((await readMeta("large-offline")).status, "ready");
  // 在独立小堆进程验证，避免“只加队列但仍整份展开 raw”的实现悄悄回归。
  const worker = `
    const {createRequire} = require("node:module");
    const load = createRequire(${JSON.stringify(import.meta.url)});
    const jiti = load("jiti")(${JSON.stringify(import.meta.url)}, {alias: {"@": ${JSON.stringify(path.join(root, "src"))}}});
    const {parseTelemetryFile} = jiti(${JSON.stringify(path.join(root, "src/lib/telemetry/parser.ts"))});
    globalThis.fetch = async () => { throw new Error("离线子进程禁止网络"); };
    parseTelemetryFile(${JSON.stringify(file)}, {matchId: "bounded-heap"}).then((parsed) => {
      require("node:assert/strict").equal(parsed.friendlyFire.length, 1);
      console.log("64MiB heap parse passed");
    }).catch((error) => { console.error(error); process.exitCode = 1; });
  `;
  const {stdout} = await promisify(execFile)(process.execPath,
    ["--max-old-space-size=64", "-e", worker], {cwd: sandbox, timeout: 30_000});
  assert.match(stdout, /64MiB heap parse passed/);
  console.log(`离线 raw ${(await fs.stat(file)).size} 字节，64MiB 堆限制子进程逐事件解析完成`);
});
