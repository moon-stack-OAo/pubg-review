import {
    aggregateMaps,
    aggregateWeaponsFromTelemetry,
    aggregateWindowKpi,
    buildWeaponsTabData,
    filterByGameMode,
    filterByPlayedAtWindow,
} from "@/lib/history/aggregate";
import {toHistoryRecord} from "@/lib/history/persist";
import {
  readNameHistory,
  readPlayerHistory,
  recordPlayerName,
  upsertHistoryMatches,
} from "@/lib/history/storage";
import type {
    CompareKpi,
    ComparePlayerSide,
    HistoryMatchRecord,
    MapsTabData,
    PlayerWindowStats,
    WeaponsTabData,
} from "@/lib/history/types";
import {cacheGet, cacheSet} from "@/lib/cache";
import {BizError} from "@/lib/errors";
import {getCachedMatch, getCachedPlayer, getCachedSeason,} from "@/lib/pubg/service";
import type {PubgMatchDetail, PubgPlatform} from "@/lib/pubg/types";
import {getTelemetryStatus, parseMatchTelemetry} from "@/lib/telemetry/service";
import {readParsedEvents} from "@/lib/telemetry/storage";

const SYNC_COOLDOWN_MS = 90_000;

type SyncCooldown = { lastAt: number };

function syncCooldownKey(accountId: string): string {
  return `history:sync:cooldown:${accountId}`;
}

export function getHistorySyncRetryAfterSec(accountId: string): number {
  const hit = cacheGet<SyncCooldown>(syncCooldownKey(accountId));
  if (!hit) return 0;
  const remainMs = hit.lastAt + SYNC_COOLDOWN_MS - Date.now();
  return remainMs > 0 ? Math.ceil(remainMs / 1000) : 0;
}

export type HistoryListResult = {
  accountId: string;
  platform: PubgPlatform;
  matches: HistoryMatchRecord[];
  total: number;
  updatedAt: string | null;
};

export async function listLocalHistory(
  accountId: string,
  options?: { gameMode?: string; limit?: number },
): Promise<HistoryListResult> {
  const file = await readPlayerHistory(accountId);
  if (!file) {
    return {
      accountId,
      platform: "steam",
      matches: [],
      total: 0,
      updatedAt: null,
    };
  }
  let matches = filterByGameMode(file.matches, options?.gameMode);
  const total = matches.length;
  if (options?.limit != null) {
    matches = matches.slice(0, options.limit);
  }
  return {
    accountId: file.accountId,
    platform: file.platform,
    matches,
    total,
    updatedAt: file.updatedAt,
  };
}

export type SyncHistoryResult = {
  accountId: string;
  name: string;
  platform: PubgPlatform;
  upserted: number;
  historyTotal: number;
  syncedAt: string;
  cooldownSec: number;
  renamed: boolean;
  previousName: string | null;
  parseRecent: number;
  telemetryParsed: number;
  telemetrySkipped: number;
  telemetryFailed: number;
};

/**
 * 同步近况：重拉玩家 matchIds，串行补齐本地缺失的 match 详情后 upsert。
 * 冷却 90s，避免与 refresh 叠加打满 10RPM。
 * 可选顺带串行 parse 最近 N 场遥测（parseRecent 0..3）。
 */
export async function syncPlayerHistory(
  platform: PubgPlatform,
  accountId: string,
  playerName: string,
  options?: { limit?: number; parseRecent?: number },
): Promise<SyncHistoryResult> {
  const name = playerName.trim();
  if (!name) throw new BizError("name 不能为空");

  const retryAfterSec = getHistorySyncRetryAfterSec(accountId);
  if (retryAfterSec > 0) {
    throw new BizError("同步冷却中，请稍后再试", 409, 40901, {
      retryAfterSec,
    });
  }

  const limit = Math.min(options?.limit ?? 10, 15);
  const parseRecent = Math.min(
    Math.max(Math.floor(options?.parseRecent ?? 0), 0),
    3,
  );
  const { value: player } = await getCachedPlayer(platform, name);
  if (player.accountId !== accountId) {
    throw new BizError("accountId 与昵称不匹配", 400, 40001);
  }

  const matchIds = player.matchIds.slice(0, limit);

  const details: PubgMatchDetail[] = [];
  for (const matchId of matchIds) {
    try {
      // 已缓存则不重复打官方；串行避免瞬时打满
      const { value } = await getCachedMatch(platform, matchId);
      details.push(value);
    } catch {
      // 单场跳过
    }
  }

  const records = details.map((m) => toHistoryRecord(m, accountId));
  const file = await upsertHistoryMatches(accountId, platform, records);
  const nameResult = await recordPlayerName(accountId, platform, player.name);

  let telemetryParsed = 0;
  let telemetrySkipped = 0;
  let telemetryFailed = 0;

  if (parseRecent > 0) {
    const toParse = file.matches.slice(0, parseRecent);
    for (const m of toParse) {
      try {
        const status = await getTelemetryStatus(m.matchId);
        if (status === "ready") {
          telemetrySkipped += 1;
          continue;
        }
        const { meta } = await parseMatchTelemetry(platform, m.matchId);
        if (meta.status === "ready") {
          telemetryParsed += 1;
        } else if (meta.status === "none") {
          telemetrySkipped += 1;
        } else {
          telemetryFailed += 1;
        }
      } catch {
        telemetryFailed += 1;
      }
    }
  }

  cacheSet(
    syncCooldownKey(accountId),
    { lastAt: Date.now() } satisfies SyncCooldown,
    SYNC_COOLDOWN_MS,
  );

  return {
    accountId,
    name: player.name,
    platform,
    upserted: records.length,
    historyTotal: file.matches.length,
    syncedAt: new Date().toISOString(),
    cooldownSec: Math.ceil(SYNC_COOLDOWN_MS / 1000),
    renamed: nameResult.renamed,
    previousName: nameResult.previousName,
    parseRecent,
    telemetryParsed,
    telemetrySkipped,
    telemetryFailed,
  };
}

export async function getMapsTabData(
  accountId: string,
  options?: { gameMode?: string; limit?: number },
): Promise<MapsTabData> {
  const file = await readPlayerHistory(accountId);
  const all = file?.matches ?? [];
  const filtered = filterByGameMode(all, options?.gameMode);
  const sample = filtered.slice(0, options?.limit ?? 50);
  return {
    rows: aggregateMaps(sample),
    sampleSize: sample.length,
    gameModeFilter: options?.gameMode ?? null,
  };
}

export async function getWeaponsTabData(
  accountId: string,
  options?: { gameMode?: string; limit?: number },
): Promise<WeaponsTabData> {
  const file = await readPlayerHistory(accountId);
  const all = file?.matches ?? [];
  const filtered = filterByGameMode(all, options?.gameMode);
  const sample = filtered.slice(0, options?.limit ?? 20);

  const parsedList = [];
  for (const m of sample) {
    const parsed = await readParsedEvents(m.matchId);
    if (parsed) parsedList.push(parsed);
  }
  const weapons = aggregateWeaponsFromTelemetry(parsedList, accountId);
  return buildWeaponsTabData(sample, weapons, parsedList.length);
}

function seasonModeToKpi(
  stats: {
    kd: number | null;
    winRate: number | null;
    avgDamage: number | null;
    roundsPlayed: number;
    top10Rate: number | null;
  } | null,
): CompareKpi {
  if (!stats) {
    return {
      kd: null,
      winRate: null,
      avgDamage: null,
      roundsPlayed: 0,
      top10Rate: null,
    };
  }
  return {
    kd: stats.kd,
    winRate: stats.winRate,
    avgDamage: stats.avgDamage,
    roundsPlayed: stats.roundsPlayed,
    top10Rate: stats.top10Rate,
  };
}

export const HOUR_MS = 60 * 60 * 1000;
export const DEFAULT_WINDOW_HOURS = 24;
export const MAX_WINDOW_HOURS = 168;
const MAX_WINDOW_MATCHES = 100;

export const DEFAULT_WINDOW_TZ = "Asia/Shanghai";

export type WindowBoundsInput = {
  hours?: number;
  since?: string;
  until?: string;
  date?: string;
  tz?: string;
};

export type WindowBounds = {
  hours: number;
  sinceMs: number;
  untilMs: number;
  label: "rolling" | "calendar_day";
};

export type GetPlayerWindowStatsOptions = WindowBoundsInput & {
  gameMode?: string;
  matchLimit?: number;
};

export function clampWindowHours(raw: number | undefined): number {
  if (raw == null || !Number.isFinite(raw)) return DEFAULT_WINDOW_HOURS;
  return Math.min(Math.max(Math.floor(raw), 1), MAX_WINDOW_HOURS);
}

/** Asia/Shanghai 固定 +08；date=YYYY-MM-DD → [当日 00:00, 次日 00:00) */
export function resolveCalendarDayBounds(
  date: string,
  tz: string = DEFAULT_WINDOW_TZ,
): WindowBounds {
  const dateRaw = date.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
    throw new BizError("date 必须是 YYYY-MM-DD", 400, 40001);
  }
  const resolvedTz = tz.trim() || DEFAULT_WINDOW_TZ;
  if (resolvedTz !== DEFAULT_WINDOW_TZ) {
    throw new BizError("首版仅支持 tz=Asia/Shanghai", 400, 40001);
  }

  const [y, m, d] = dateRaw.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== m - 1 ||
    probe.getUTCDate() !== d
  ) {
    throw new BizError("date 不是合法日历日", 400, 40001);
  }

  const shanghaiOffsetMs = 8 * HOUR_MS;
  const sinceMs = Date.UTC(y, m - 1, d) - shanghaiOffsetMs;
  const untilMs = sinceMs + 24 * HOUR_MS;
  return {
    hours: 24,
    sinceMs,
    untilMs,
    label: "calendar_day",
  };
}

function assertHalfOpenSpan(sinceMs: number, untilMs: number): number {
  if (!(sinceMs < untilMs)) {
    throw new BizError("since 必须早于 until", 400, 40001);
  }
  const spanMs = untilMs - sinceMs;
  if (spanMs > MAX_WINDOW_HOURS * HOUR_MS) {
    throw new BizError(
      `时间窗跨度不能超过 ${MAX_WINDOW_HOURS} 小时`,
      400,
      40001,
    );
  }
  return Math.max(1, Math.ceil(spanMs / HOUR_MS));
}

/**
 * 优先级：date(+tz) > since+until > since(until=now) > hours(until=now)
 * 半开区间 [sinceMs, untilMs)；跨度超 MAX_WINDOW_HOURS 直接 400
 */
export function resolveWindowBounds(options?: WindowBoundsInput): WindowBounds {
  const dateRaw = options?.date?.trim();
  const sinceRaw = options?.since?.trim();
  const untilRaw = options?.until?.trim();
  const hasHours = options?.hours != null && Number.isFinite(options.hours);

  if (dateRaw) {
    if (sinceRaw || untilRaw || hasHours) {
      throw new BizError("date 不能与 since/until/hours 同时使用", 400, 40001);
    }
    return resolveCalendarDayBounds(dateRaw, options?.tz ?? DEFAULT_WINDOW_TZ);
  }

  if (untilRaw && !sinceRaw) {
    throw new BizError("until 需与 since 一起使用，或改用 date", 400, 40001);
  }

  if (sinceRaw) {
    const sinceMs = Date.parse(sinceRaw);
    if (!Number.isFinite(sinceMs)) {
      throw new BizError("since 必须是合法 ISO 时间", 400, 40001);
    }
    let untilMs: number;
    if (untilRaw) {
      untilMs = Date.parse(untilRaw);
      if (!Number.isFinite(untilMs)) {
        throw new BizError("until 必须是合法 ISO 时间", 400, 40001);
      }
    } else {
      untilMs = Date.now();
    }
    const hours = assertHalfOpenSpan(sinceMs, untilMs);
    return { hours, sinceMs, untilMs, label: "rolling" };
  }

  const untilMs = Date.now();
  const hours = clampWindowHours(options?.hours);
  return {
    hours,
    sinceMs: untilMs - hours * HOUR_MS,
    untilMs,
    label: "rolling",
  };
}

/**
 * 个人时间窗战绩：仅用本地 history，按 playedAt 过滤后聚合 KPI。
 * 不拉官方、不做 squad。
 */
export async function getPlayerWindowStats(
  platform: PubgPlatform,
  options: {
    name?: string;
    accountId?: string;
  } & GetPlayerWindowStatsOptions,
): Promise<PlayerWindowStats> {
  const name = options.name?.trim() || "";
  const accountIdOpt = options.accountId?.trim() || "";
  if (!name && !accountIdOpt) {
    throw new BizError("name 或 accountId 不能为空", 400, 40001);
  }

  const { hours, sinceMs, untilMs } = resolveWindowBounds(options);
  const gameMode = options.gameMode?.trim() || undefined;
  const matchLimit = Math.min(
    Math.max(Math.floor(options.matchLimit ?? MAX_WINDOW_MATCHES), 1),
    MAX_WINDOW_MATCHES,
  );

  let accountId = accountIdOpt;
  let resolvedName: string | null = name || null;
  let resolvedPlatform = platform;

  if (name) {
    const { value: player } = await getCachedPlayer(platform, name);
    accountId = player.accountId;
    resolvedName = player.name;
    resolvedPlatform = player.platform;
    if (accountIdOpt && accountIdOpt !== accountId) {
      throw new BizError("accountId 与昵称不匹配", 400, 40001);
    }
  } else {
    const file = await readPlayerHistory(accountId);
    if (file) resolvedPlatform = file.platform;
    const names = await readNameHistory(accountId);
    resolvedName = names?.names[0]?.name ?? null;
  }

  const file = await readPlayerHistory(accountId);
  const historyTotal = file?.matches.length ?? 0;
  if (!file || historyTotal === 0) {
    return {
      accountId,
      platform: resolvedPlatform,
      name: resolvedName,
      hours,
      since: new Date(sinceMs).toISOString(),
      until: new Date(untilMs).toISOString(),
      gameModeFilter: gameMode ?? null,
      historyTotal: 0,
      kpi: aggregateWindowKpi([]),
      matches: [],
      emptyReason: "no_history",
    };
  }

  const modeFiltered = filterByGameMode(file.matches, gameMode);
  const windowed = filterByPlayedAtWindow(modeFiltered, sinceMs, untilMs).sort(
    (a, b) => +new Date(b.playedAt) - +new Date(a.playedAt),
  );
  const matches = windowed.slice(0, matchLimit);

  return {
    accountId,
    platform: file.platform,
    name: resolvedName,
    hours,
    since: new Date(sinceMs).toISOString(),
    until: new Date(untilMs).toISOString(),
    gameModeFilter: gameMode ?? null,
    historyTotal,
    kpi: aggregateWindowKpi(matches),
    matches,
    emptyReason: matches.length === 0 ? "no_matches_in_window" : "ok",
  };
}

export async function buildCompareSide(
  platform: PubgPlatform,
  name: string,
  options?: { gameMode?: string; seasonId?: string },
): Promise<ComparePlayerSide> {
  const { value: player } = await getCachedPlayer(platform, name);
  const { value: season } = await getCachedSeason(
    platform,
    player.accountId,
    options?.seasonId,
  );
  const selected =
    season.modeStats.find((m) => m.gameMode === options?.gameMode) ??
    season.modeStats[0] ??
    null;

  return {
    accountId: player.accountId,
    name: player.name,
    platform: player.platform,
    gameMode: selected?.gameMode ?? null,
    kpi: seasonModeToKpi(selected),
  };
}
