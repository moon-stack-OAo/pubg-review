import {BizError} from "@/lib/errors";
import {downloadTelemetryJson, PubgApiError,} from "@/lib/pubg/client";
import {getCachedMatch} from "@/lib/pubg/service";
import type {PubgPlatform} from "@/lib/pubg/types";
import {parseTelemetryJson} from "@/lib/telemetry/parser";
import {
    eventsPath,
    rawExists,
    readMeta,
    readParsedEvents,
    readRawJson,
    writeMeta,
    writeParsedEvents,
    writeRawJson,
} from "@/lib/telemetry/storage";
import {
    DEFAULT_SAMPLE_HZ,
    type ParsedTelemetry,
    PARSER_VERSION,
    type TelemetryAssetMeta,
    type TelemetryEventsPayload,
    type TelemetryEventType,
    type TelemetryStatus,
} from "@/lib/telemetry/types";

/** 进程内互斥：同一 match 并发 parse 只跑一次 */
const inflight = new Map<string, Promise<TelemetryAssetMeta>>();

function nowIso(): string {
  return new Date().toISOString();
}

function emptyMeta(
  matchId: string,
  platform: string,
  status: TelemetryStatus,
  extra?: Partial<TelemetryAssetMeta>,
): TelemetryAssetMeta {
  return {
    matchId,
    platform,
    status,
    sourceUrl: null,
    rawPath: null,
    eventsPath: null,
    errorMessage: null,
    parserVersion: null,
    parsedAt: null,
    updatedAt: nowIso(),
    ...extra,
  };
}

export async function getTelemetryStatus(
  matchId: string,
): Promise<TelemetryStatus> {
  const meta = await readMeta(matchId);
  return meta?.status ?? "none";
}

export async function getTelemetryMeta(
  matchId: string,
): Promise<TelemetryAssetMeta | null> {
  return readMeta(matchId);
}

/**
 * 幂等触发解析：ready 直接返回；pending 等待或复用 inflight；
 * 失败可重试。force 时用已有 raw 重解析（或重新下载）。
 */
export async function parseMatchTelemetry(
  platform: PubgPlatform,
  matchId: string,
  options?: { force?: boolean },
): Promise<{ meta: TelemetryAssetMeta; cached: boolean }> {
  const existing = await readMeta(matchId);
  if (!options?.force && existing?.status === "ready") {
    const parsed = await readParsedEvents(matchId);
    // parser 升级（如新增 gunlines）时自动用已有 raw 重解析
    const stale =
      !parsed ||
      parsed.parserVersion !== PARSER_VERSION ||
      !Array.isArray(parsed.gunlines);
    if (parsed && !stale) {
      return { meta: existing, cached: true };
    }
  }

  const key = `${platform}:${matchId}`;
  const running = inflight.get(key);
  if (running) {
    const meta = await running;
    return { meta, cached: false };
  }

  const job = runParse(platform, matchId);
  inflight.set(key, job);
  try {
    const meta = await job;
    return { meta, cached: false };
  } finally {
    inflight.delete(key);
  }
}

async function runParse(
  platform: PubgPlatform,
  matchId: string,
): Promise<TelemetryAssetMeta> {
  let pending = emptyMeta(matchId, platform, "pending");
  await writeMeta(pending);

  try {
    const { value: match } = await getCachedMatch(platform, matchId);
    const sourceUrl = match.telemetryUrl;

    if (!sourceUrl) {
      const failed = emptyMeta(matchId, platform, "none", {
        errorMessage: "本场对局无遥测资产（可能为自定义局或官方未附带）",
        mapName: match.mapName,
        durationSec: match.durationSec,
      });
      await writeMeta(failed);
      return failed;
    }

    pending = {
      ...pending,
      sourceUrl,
      mapName: match.mapName,
      durationSec: match.durationSec,
      updatedAt: nowIso(),
    };
    await writeMeta(pending);

    let raw: unknown = null;
    if (await rawExists(matchId)) {
      raw = await readRawJson(matchId);
    }
    if (raw == null) {
      raw = await downloadTelemetryJson(sourceUrl);
      await writeRawJson(matchId, raw);
    }

    const parsed = parseTelemetryJson(raw, {
      matchId,
      mapName: match.mapName,
      durationSec: match.durationSec,
      sampleHz: DEFAULT_SAMPLE_HZ,
    });

    const evPath = await writeParsedEvents(matchId, parsed);
    const ready: TelemetryAssetMeta = {
      matchId,
      platform,
      status: "ready",
      sourceUrl,
      rawPath: `.data/telemetry/${matchId}/raw.json`,
      eventsPath: evPath.includes(".data")
        ? `.data/telemetry/${matchId}/events.json`
        : eventsPath(matchId),
      errorMessage: null,
      parserVersion: PARSER_VERSION,
      parsedAt: parsed.parsedAt,
      updatedAt: nowIso(),
      mapName: parsed.mapName,
      durationSec: parsed.durationSec,
    };
    await writeMeta(ready);
    return ready;
  } catch (e) {
    const expired =
      e instanceof PubgApiError &&
      (e.status === 404 || e.message.includes("过期"));
    const message =
      e instanceof BizError || e instanceof PubgApiError || e instanceof Error
        ? e.message
        : "遥测解析失败";
    const failed = emptyMeta(matchId, platform, expired ? "expired" : "failed", {
      errorMessage: message,
      parserVersion: PARSER_VERSION,
    });
    await writeMeta(failed);
    return failed;
  }
}

export type TelemetryEventsQuery = {
  accountId?: string;
  types?: string;
  sampleHz?: number;
  /** 未 ready 时是否自动触发 parse（默认 true） */
  autoParse?: boolean;
};

/**
 * 返回精简事件流；未解析时可自动触发 parse。
 * 浏览器只应调用本接口，禁止直拉官方原始 telemetry。
 */
export async function getTelemetryEvents(
  platform: PubgPlatform,
  matchId: string,
  query: TelemetryEventsQuery = {},
): Promise<TelemetryEventsPayload> {
  let meta = await readMeta(matchId);

  if (!meta || meta.status === "none" || meta.status === "failed") {
    if (query.autoParse !== false) {
      const result = await parseMatchTelemetry(platform, matchId);
      meta = result.meta;
    }
  } else if (meta.status === "pending") {
    const key = `${platform}:${matchId}`;
    const running = inflight.get(key);
    if (running) {
      meta = await running;
    } else if (query.autoParse !== false) {
      const result = await parseMatchTelemetry(platform, matchId);
      meta = result.meta;
    }
  }

  if (!meta) {
    return {
      matchId,
      mapName: "",
      durationSec: 0,
      status: "none",
      errorMessage: "尚未解析遥测",
      parserVersion: null,
      players: [],
      zones: [],
      positions: [],
      events: [],
      gunlines: [],
    };
  }

  if (meta.status !== "ready") {
    return {
      matchId,
      mapName: meta.mapName ?? "",
      durationSec: meta.durationSec ?? 0,
      status: meta.status,
      errorMessage: meta.errorMessage,
      parserVersion: meta.parserVersion,
      players: [],
      zones: [],
      positions: [],
      events: [],
      gunlines: [],
    };
  }

  const parsed = await readParsedEvents(matchId);
  if (!parsed) {
    return {
      matchId,
      mapName: meta.mapName ?? "",
      durationSec: meta.durationSec ?? 0,
      status: "failed",
      errorMessage: "精简事件文件丢失，请重新解析",
      parserVersion: meta.parserVersion,
      players: [],
      zones: [],
      positions: [],
      events: [],
      gunlines: [],
    };
  }

  return filterParsed(parsed, meta, query);
}

function filterParsed(
  parsed: ParsedTelemetry,
  meta: TelemetryAssetMeta,
  query: TelemetryEventsQuery,
): TelemetryEventsPayload {
  const typeSet = parseTypes(query.types);
  const accountId = query.accountId?.trim() || "";
  const sampleHz =
    typeof query.sampleHz === "number" && query.sampleHz > 0
      ? query.sampleHz
      : DEFAULT_SAMPLE_HZ;

  let positions = parsed.positions;
  if (sampleHz < DEFAULT_SAMPLE_HZ) {
    const interval = 1 / sampleHz;
    const seen = new Set<string>();
    positions = positions.filter((p) => {
      const bucket = Math.floor(p.t / interval);
      const key = `${p.accountId}:${bucket}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  if (accountId) {
    // 轨迹：焦点玩家全量 + 同队 + 其余玩家降采样（每 5 秒）
    const focusTeam =
      parsed.players.find((p) => p.accountId === accountId)?.teamId ?? null;
    const teammates = new Set(
      parsed.players
        .filter(
          (p) =>
            p.accountId === accountId ||
            (focusTeam != null && p.teamId === focusTeam),
        )
        .map((p) => p.accountId),
    );
    positions = positions.filter((p) => {
      if (teammates.has(p.accountId)) return true;
      return Math.floor(p.t) % 5 === 0;
    });
  }

  let events = parsed.events;
  if (typeSet) {
    events = events.filter((e) => typeSet.has(e.type));
  }
  if (accountId) {
    events = events.filter((e) => {
      if (e.type === "carePackage" || e.type === "zone") return true;
      return (
        e.attackerId === accountId ||
        e.victimId === accountId ||
        e.reviverId === accountId
      );
    });
  }

  let gunlines = Array.isArray(parsed.gunlines) ? parsed.gunlines : [];
  if (accountId) {
    gunlines = gunlines.filter(
      (g) => g.attackerId === accountId || g.victimId === accountId,
    );
  }

  // zone 事件来自 zones 数组，types 含 zone 时附带为 events 可选；此处 zones 始终返回
  let zones = parsed.zones;
  if (typeSet && !typeSet.has("zone")) {
    zones = [];
  }

  return {
    matchId: parsed.matchId,
    mapName: parsed.mapName,
    durationSec: parsed.durationSec,
    status: "ready",
    errorMessage: null,
    parserVersion: meta.parserVersion,
    players: parsed.players,
    zones,
    positions,
    events,
    gunlines,
  };
}

function parseTypes(types?: string): Set<TelemetryEventType> | null {
  if (!types?.trim()) return null;
  const allowed: TelemetryEventType[] = [
    "kill",
    "knock",
    "revive",
    "carePackage",
    "zone",
  ];
  const set = new Set<TelemetryEventType>();
  for (const part of types.split(",")) {
    const t = part.trim() as TelemetryEventType;
    if (allowed.includes(t)) set.add(t);
  }
  return set.size > 0 ? set : null;
}
