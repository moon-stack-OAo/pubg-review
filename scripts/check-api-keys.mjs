import assert from "node:assert/strict";
import {after, beforeEach, mock, test} from "node:test";
import {promises as fs} from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const jiti = require("jiti")(import.meta.url, {alias: {"@": path.join(root, "src")}});
const previousFetch = globalThis.fetch;
const previousKeys = process.env.PUBG_API_KEYS;
const previousKey = process.env.PUBG_API_KEY;
const calls = [];
const logs = [];
let responses = new Map();

// 拦截落盘与全部外呼，不读取真实环境文件，也不改写项目的 .data。
mock.method(fs, "mkdir", async () => undefined);
mock.method(fs, "appendFile", async (_file, row) => {
  logs.push(JSON.parse(row));
});
globalThis.fetch = async (url, init) => {
  assert.equal(url, "https://api.pubg.com/shards/steam/seasons");
  assert.equal(init.cache, "no-store");
  const headers = new Headers(init.headers);
  assert.equal(headers.get("Accept"), "application/vnd.api+json");
  const key = headers.get("Authorization")?.replace(/^Bearer /, "");
  calls.push(key);
  assert.ok(responses.has(key), "未配置的模拟请求，禁止调用外网");
  const reply = responses.get(key);
  if (reply instanceof Error) throw reply;
  const {status = 200, body = '{"data":[]}', retryAfter = "60"} = reply;
  return new Response(body, {status, headers: {"retry-after": retryAfter}});
};

const {listSeasons, PubgApiError} = jiti("@/lib/pubg/client");
const request = () => listSeasons("steam");
const configure = (entries) => {
  process.env.PUBG_API_KEYS = JSON.stringify(entries.map(([key]) => key));
  delete process.env.PUBG_API_KEY;
  responses = new Map(entries);
};
const hasStatus = (status, retryAfterSec = null) => (error) => {
  assert.ok(error instanceof PubgApiError);
  assert.equal(error.status, status);
  assert.equal(error.retryAfterSec, retryAfterSec);
  return true;
};

beforeEach(async () => {
  // 一次单 Key 成功请求将轮询游标归零；各用例使用不同 Key 隔离停用状态。
  configure([["fixture-bootstrap", {}]]);
  await request();
  calls.length = 0;
  logs.length = 0;
});

after(() => {
  globalThis.fetch = previousFetch;
  if (previousKeys === undefined) delete process.env.PUBG_API_KEYS;
  else process.env.PUBG_API_KEYS = previousKeys;
  if (previousKey === undefined) delete process.env.PUBG_API_KEY;
  else process.env.PUBG_API_KEY = previousKey;
  mock.restoreAll();
});

test("401 自动换 Key，后续轮询跳过失效 Key，正常 Key 仍按序轮换", async () => {
  configure([
    ["rotate-invalid", {status: 401}],
    ["rotate-good-a", {}],
    ["rotate-good-b", {}],
  ]);
  for (let i = 0; i < 4; i++) assert.deepEqual(await request(), []);
  assert.deepEqual(calls, [
    "rotate-invalid", "rotate-good-a", "rotate-good-b", "rotate-good-a", "rotate-good-b",
  ]);
});

test("全部 Key 失效时最多尝试一轮，后续请求直接返回明确 401", async () => {
  configure([["all-bad-a", {status: 401}], ["all-bad-b", {status: 401}]]);
  await assert.rejects(request(), (error) => {
    hasStatus(401)(error);
    assert.match(error.message, /所有.*Key.*鉴权失败/);
    return true;
  });
  await assert.rejects(request(), hasStatus(401));
  assert.deepEqual(calls, ["all-bad-a", "all-bad-b"]);
});

test("单 Key 401 同样停用，替换为新 Key 后可以请求", async () => {
  configure([["single-invalid", {status: 401}]]);
  await assert.rejects(request(), hasStatus(401));
  await assert.rejects(request(), hasStatus(401));
  configure([["single-replacement", {}]]);
  assert.deepEqual(await request(), []);
  assert.deepEqual(calls, ["single-invalid", "single-replacement"]);
});

test("非 JSON、空响应和上游回显密钥的 401 都安全换 Key", async () => {
  for (const [index, body] of ["<html>Unauthorized</html>", "", "echo-key"].entries()) {
    const badKey = `body-invalid-${index}`;
    const goodKey = `body-good-${index}`;
    configure([[badKey, {
      status: 401,
      body: body === "echo-key"
        ? JSON.stringify({errors: [{detail: badKey}]})
        : body,
    }], [goodKey, {}]]);
    assert.deepEqual(await request(), []);
    const row = logs.findLast((entry) => entry.status === 401);
    assert.equal(row.error, "unauthorized_key_disabled");
    assert.ok(!JSON.stringify(logs).includes(badKey), "日志不能包含密钥");
  }
});

test("失效与限流并存时返回 429，并保留 retry-after；后续跳过失效 Key", async () => {
  configure([
    ["mixed-limited", {status: 429, retryAfter: "17"}],
    ["mixed-invalid", {status: 401}],
  ]);
  await assert.rejects(request(), hasStatus(429, 17));
  await assert.rejects(request(), hasStatus(429, 17));
  assert.deepEqual(calls, ["mixed-limited", "mixed-invalid", "mixed-limited"]);
});

test("401 在前、429 在后时仍返回剩余 Key 的限流错误", async () => {
  configure([
    ["mixed-first-invalid", {status: 401}],
    ["mixed-last-limited", {status: 429, retryAfter: "23"}],
  ]);
  await assert.rejects(request(), hasStatus(429, 23));
  assert.deepEqual(calls, ["mixed-first-invalid", "mixed-last-limited"]);
});

test("保留原有 429 换 Key 行为，不把限流 Key 当作失效 Key 永久停用", async () => {
  configure([["retry-limited", {status: 429}], ["retry-good", {}]]);
  assert.deepEqual(await request(), []);
  responses.set("retry-limited", {});
  assert.deepEqual(await request(), []);
  assert.deepEqual(calls, ["retry-limited", "retry-good", "retry-limited"]);
});

test("全部限流时最多尝试一轮，并返回 429 而非 401", async () => {
  configure([
    ["all-limited-a", {status: 429}],
    ["all-limited-b", {status: 429, retryAfter: "30"}],
  ]);
  await assert.rejects(request(), hasStatus(429, 30));
  assert.deepEqual(calls, ["all-limited-a", "all-limited-b"]);
});

test("403 自动换 Key，但后续请求仍可使用该 Key", async () => {
  configure([["forbidden-first", {status: 403}], ["forbidden-spare", {}]]);
  assert.deepEqual(await request(), []);
  responses.set("forbidden-first", {});
  assert.deepEqual(await request(), []);
  assert.deepEqual(calls, ["forbidden-first", "forbidden-spare", "forbidden-first"]);
});

test("全部 403 时每个 Key 只尝试一次，后续请求不会全局跳过", async () => {
  configure([["all-forbidden-a", {status: 403}], ["all-forbidden-b", {status: 403}]]);
  await assert.rejects(request(), hasStatus(403));
  await assert.rejects(request(), hasStatus(403));
  assert.deepEqual(calls, [
    "all-forbidden-a", "all-forbidden-b", "all-forbidden-a", "all-forbidden-b",
  ]);
});

test("单 Key 403 不无限重试，也不误停用", async () => {
  configure([["single-forbidden", {status: 403}]]);
  await assert.rejects(request(), hasStatus(403));
  responses.set("single-forbidden", {});
  assert.deepEqual(await request(), []);
  assert.deepEqual(calls, ["single-forbidden", "single-forbidden"]);
});

test("非 JSON、空响应和上游回显密钥的 403 都安全换 Key", async () => {
  for (const [index, body] of ["<html>Forbidden</html>", "", "echo-key"].entries()) {
    const badKey = `forbidden-body-${index}`;
    const goodKey = `forbidden-good-${index}`;
    configure([[badKey, {
      status: 403,
      body: body === "echo-key"
        ? JSON.stringify({errors: [{detail: badKey}]})
        : body,
    }], [goodKey, {}]]);
    assert.deepEqual(await request(), []);
    const row = logs.findLast((entry) => entry.status === 403);
    assert.equal(row.error, "forbidden_key_retry");
    assert.ok(!JSON.stringify(logs).includes(badKey), "日志不能包含密钥");
  }
});

for (const statuses of [[401, 403], [403, 401], [429, 403], [403, 429]]) {
  test(`${statuses.join(" / ")} 混合失败时优先返回 429，其次 403`, async () => {
    const keys = statuses.map((status, index) => `mixed-${statuses.join("-")}-${index}`);
    configure(keys.map((key, index) => [key, {status: statuses[index], retryAfter: "19"}]));
    const expected = statuses.includes(429) ? 429 : 403;
    await assert.rejects(request(), hasStatus(expected, expected === 429 ? 19 : null));
    assert.deepEqual(calls, keys);
  });
}

test("401、403、429 连续失败后仍可切换到正常 Key", async () => {
  configure([
    ["chain-invalid", {status: 401}],
    ["chain-forbidden", {status: 403}],
    ["chain-limited", {status: 429}],
    ["chain-good", {}],
  ]);
  assert.deepEqual(await request(), []);
  assert.deepEqual(calls, ["chain-invalid", "chain-forbidden", "chain-limited", "chain-good"]);
});

for (const status of [404, 500]) {
  test(`${status} 不换 Key，也不误停用当前 Key`, async () => {
    const first = `other-status-${status}`;
    configure([[first, {status}], [`other-spare-${status}`, {}]]);
    await assert.rejects(request(), hasStatus(status));
    assert.equal(calls.at(-1), first);
    responses.set(first, {});
    assert.deepEqual(await request(), []);
    assert.equal(calls.at(-1), first);
    assert.equal(calls.length, 2);
  });
}

test("网络错误不换 Key，也不误判鉴权失败", async () => {
  const failure = new TypeError("模拟网络错误");
  configure([["network-first", failure], ["network-spare", {}]]);
  await assert.rejects(request(), (error) => error === failure);
  responses.set("network-first", {});
  assert.deepEqual(await request(), []);
  assert.deepEqual(calls, ["network-first", "network-first"]);
});

test("多 Key 与单 Key 合并去重后，401 仍能切换到有效 Key", async () => {
  configure([["merged-invalid", {status: 401}], ["merged-good", {}]]);
  process.env.PUBG_API_KEYS = "merged-invalid, merged-invalid";
  process.env.PUBG_API_KEY = "merged-good";
  assert.deepEqual(await request(), []);
  assert.deepEqual(calls, ["merged-invalid", "merged-good"]);
});

test("未配置 Key 时不发出任何请求，仍返回配置错误", async () => {
  delete process.env.PUBG_API_KEYS;
  delete process.env.PUBG_API_KEY;
  await assert.rejects(request(), hasStatus(500));
  assert.deepEqual(calls, []);
});
