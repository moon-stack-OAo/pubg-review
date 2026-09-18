import {aggregateWeaknessTags, type WeaknessTagSummary,} from "@/lib/analysis/player-analysis-core";
import {buildMatchReport} from "@/lib/analysis/report-service";
import type {ReportTagCode} from "@/lib/analysis/report-engine";
import {cacheDelete, cacheDeleteByPrefix, cacheGet, cacheGetOrSet, cacheSet, TTL,} from "@/lib/cache";
import {BizError} from "@/lib/errors";
import type {HistoryMatchRecord} from "@/lib/history/types";
import {persistDashboardHistory} from "@/lib/history/persist";
import {readPlayerHistory} from "@/lib/history/storage";
import {buildDailyTrend, type PlayerTrend,} from "@/lib/history/trend";
import {readPersistedMatch, writePersistedMatch,} from "@/lib/persist/match-store";
import {readPersistedSeason, writePersistedSeason,} from "@/lib/persist/season-store";
import {
    getCurrentSeasonId,
    getMatchDetail,
    getPlayerSeasonOverview,
    listSeasons,
    PubgApiError,
    searchPlayerByName,
} from "@/lib/pubg/client";
import {mapLabel} from "@/lib/pubg/maps";
import type {
    PubgGameModeStats,
    PubgMatchDetail,
    PubgPlatform,
    PubgPlayerSummary,
    PubgSeasonMeta,
    PubgSeasonOverview,
} from "@/lib/pubg/types";

export type RecentMatchRow = {
  matchId: string;
  mapName: string;
  mapLabel: string;
  gameMode: string;
  matchType?: string;
  isCustomMatch?: boolean;
  playedAt: string;
  durationSec: number;
  rank: number | null;
  kills: number;
  assists: number;
  damage: number;
  survivalTimeSec: number;
  /** 来自官方 14 天列表 or 本地历史库 */
  source?: "official" | "local";
};

export type PlayerDashboard = {
  player: Omit<PubgPlayerSummary, "matchIds"> & { recentMatchCount: number };
  season: PubgSeasonOverview;
  selectedStats: PubgGameModeStats | null;
  recentMatches: RecentMatchRow[];
  /** 本地历史库中不在本次官方 recent 的对局（去重后） */
  localHistoryExtra: RecentMatchRow[];
  historyTotal: number;
  renameHint: {
    renamed: boolean;
    previousName: string | null;
    knownNames: string[];
  };
  /** 近 N 场报告聚合的弱点标签（最多 5） */
  weaknessTags: WeaknessTagSummary[];
  /** 近 N 场主因标签（与 recentMatches 对齐，供页面展示/过滤，避免二次 build） */
  primaryTags: Record<
    string,
    { code: ReportTagCode; label: string; positive: boolean } | null
  >;
  /** 近 14 天按日趋势（官方 recent + 本地历史，不额外打官方） */
  trend: PlayerTrend;
  cached: {
    player: boolean;
    season: boolean;
  };
  /** 赛季等数据是否为 API 失败后的磁盘降级 */
  degraded?: boolean;
  syncedAt: string;
};

const REFRESH_COOLDOWN_MS = 60_000;
const matchInflight = new Map<
  string,
  Promise<{ value: PubgMatchDetail; cached: boolean }>
>();

type RefreshCooldown = {
  lastAt: number;
};

export async function getCachedPlayer(
  platform: PubgPlatform,
  name: string,
): Promise<{ value: PubgPlayerSummary; cached: boolean }> {
  const key = `player:${platform}:${name.trim()}`;
  const result = await cacheGetOrSet(key, TTL.playerByName, () =>
    searchPlayerByName(platform, name),
  );
  // 旧缓存对象可能缺 banType 字段：回源一次补齐
  if (!("banType" in result.value) || result.value.banType == null) {
    if (result.cached) {
      const fresh = await searchPlayerByName(platform, name);
      cacheSet(key, fresh, TTL.playerByName);
      return { value: fresh, cached: false };
    }
    return {
      value: { ...result.value, banType: "Unknown" },
      cached: result.cached,
    };
  }
  return result;
}

async function resolveSeasonId(
  platform: PubgPlatform,
  seasonId?: string,
): Promise<string> {
  if (seasonId) return seasonId;
  const { value: seasons } = await getCachedSeasons(platform);
  const current = seasons.find((s) => s.isCurrent);
  if (current) return current.id;
  // 兜底：列表异常时再直连官方
  return getCurrentSeasonId(platform);
}

export async function getCachedSeason(
  platform: PubgPlatform,
  accountId: string,
  seasonId?: string,
): Promise<{ value: PubgSeasonOverview; cached: boolean; stale?: boolean }> {
  const resolvedSeasonId = await resolveSeasonId(platform, seasonId);
  const key = `season:${platform}:${accountId}:${resolvedSeasonId}`;

  const mem = cacheGet<PubgSeasonOverview>(key);
  if (mem) {
    return { value: mem, cached: true };
  }

  const disk = await readPersistedSeason(platform, accountId, resolvedSeasonId);
  if (disk?.fresh) {
    cacheSet(key, disk.season, TTL.season);
    return { value: disk.season, cached: true };
  }

  try {
    const value = await getPlayerSeasonOverview(
      platform,
      accountId,
      resolvedSeasonId,
    );
    cacheSet(key, value, TTL.season);
    try {
      await writePersistedSeason(value);
    } catch {
      // 落盘失败不影响响应
    }
    return { value, cached: false };
  } catch (e) {
    // 429/5xx：回退磁盘 stale，避免整页空白
    const status = e instanceof PubgApiError ? e.status : 0;
    const canStale = status === 429 || status >= 500;
    if (canStale && disk?.season) {
      cacheSet(key, disk.season, Math.min(TTL.season, 60_000));
      return { value: disk.season, cached: true, stale: true };
    }
    throw e;
  }
}

export async function getCachedMatch(
  platform: PubgPlatform,
  matchId: string,
): Promise<{ value: PubgMatchDetail; cached: boolean }> {
  const key = `match:${platform}:${matchId}`;
  const hit = cacheGet<PubgMatchDetail>(key);
  // 旧缓存可能缺 telemetryUrl / matchType 字段，强制重拉一次补齐。
  if (hit && "telemetryUrl" in hit && "matchType" in hit) {
    return { value: hit, cached: true };
  }

  const running = matchInflight.get(key);
  if (running) return running;

  const job = (async () => {
    const disk = await readPersistedMatch(matchId, platform);
    if (disk && "matchType" in disk) {
      cacheSet(key, disk, TTL.match);
      return { value: disk, cached: true };
    }

    let value: PubgMatchDetail;
    try {
      value = await getMatchDetail(platform, matchId);
    } catch (error) {
      // 官方已无法获取的旧对局仍保留本地可读能力，只是不展示比赛类型。
      if (disk) {
        cacheSet(key, disk, TTL.match);
        return { value: disk, cached: true };
      }
      throw error;
    }
    cacheSet(key, value, TTL.match);
    try {
      await writePersistedMatch(value, platform);
    } catch {
      // 落盘失败不影响响应
    }
    return { value, cached: false };
  })();
  matchInflight.set(key, job);
  try {
    return await job;
  } finally {
    if (matchInflight.get(key) === job) matchInflight.delete(key);
  }
}

export async function getCachedSeasons(
  platform: PubgPlatform,
): Promise<{ value: PubgSeasonMeta[]; cached: boolean }> {
  return cacheGetOrSet(`seasons:list:${platform}`, TTL.seasonsList, () =>
    listSeasons(platform),
  );
}

function toRecentRow(
  match: PubgMatchDetail,
  accountId: string,
  source: "official" | "local" = "official",
): RecentMatchRow {
  const me = match.rosters
    .flatMap((r) => r.participants)
    .find((p) => p.accountId === accountId);

  return {
    matchId: match.matchId,
    mapName: match.mapName,
    mapLabel: mapLabel(match.mapName),
    gameMode: match.gameMode,
    matchType: match.matchType,
    isCustomMatch: match.isCustomMatch,
    playedAt: match.playedAt,
    durationSec: match.durationSec,
    rank: me?.winPlace ?? null,
    kills: me?.kills ?? 0,
    assists: me?.assists ?? 0,
    damage: me?.damageDealt ?? 0,
    survivalTimeSec: me?.survivalTimeSec ?? 0,
    source,
  };
}

function historyToRecentRow(m: HistoryMatchRecord): RecentMatchRow {
  return {
    matchId: m.matchId,
    mapName: m.mapName,
    mapLabel: m.mapLabel,
    gameMode: m.gameMode,
    matchType: m.matchType,
    isCustomMatch: m.isCustomMatch,
    playedAt: m.playedAt,
    durationSec: m.durationSec,
    rank: m.rank,
    kills: m.kills,
    assists: m.assists,
    damage: m.damage,
    survivalTimeSec: m.survivalTimeSec,
    source: "local",
  };
}

function matchModeEquals(matchGameMode: string, filter?: string): boolean {
  if (!filter) return true;
  return matchGameMode === filter;
}

export async function getPlayerDashboard(
  platform: PubgPlatform,
  name: string,
  options?: { gameMode?: string; recentLimit?: number; seasonId?: string },
): Promise<PlayerDashboard> {
  // 默认少拉几场；matches 虽常不计 RPM，但串行更稳，避免瞬时打满连接
  const recentLimit = options?.recentLimit ?? 5;
  const gameMode = options?.gameMode?.trim() || undefined;
  const playerResult = await getCachedPlayer(platform, name);
  const seasonResult = await getCachedSeason(
    platform,
    playerResult.value.accountId,
    options?.seasonId,
  );

  const accountId = playerResult.value.accountId;
  // 有模式过滤时多取一些 id，过滤后仍尽量凑满 recentLimit（上限 20）
  const candidateCap = gameMode
    ? Math.min(Math.max(recentLimit * 3, recentLimit), 20)
    : recentLimit;
  const matchIds = playerResult.value.matchIds.slice(0, candidateCap);
  const recentMatches: RecentMatchRow[] = [];
  const detailForHistory: PubgMatchDetail[] = [];
  for (const matchId of matchIds) {
    if (recentMatches.length >= recentLimit) break;
    try {
      const result = await getCachedMatch(platform, matchId);
      detailForHistory.push(result.value);
      if (!matchModeEquals(result.value.gameMode, gameMode)) continue;
      recentMatches.push(toRecentRow(result.value, accountId, "official"));
    } catch {
      // 单场失败跳过，不影响整页
    }
  }
  recentMatches.sort((a, b) => +new Date(b.playedAt) - +new Date(a.playedAt));

  let historyMeta = {
    historyCount: 0,
    renamed: false,
    previousName: null as string | null,
    knownNames: [] as string[],
  };
  try {
    historyMeta = await persistDashboardHistory(
      platform,
      accountId,
      playerResult.value.name,
      detailForHistory,
    );
  } catch {
    // 本地落盘失败不影响页面
  }

  const officialIds = new Set(recentMatches.map((m) => m.matchId));
  const historyFile = await readPlayerHistory(accountId);
  const localHistoryExtra = (historyFile?.matches ?? [])
    .filter((m) => !officialIds.has(m.matchId))
    .filter((m) => matchModeEquals(m.gameMode, gameMode))
    .slice(0, 30)
    .map(historyToRecentRow);

  const selectedStats = gameMode
    ? (seasonResult.value.modeStats.find((m) => m.gameMode === gameMode) ??
      null)
    : (seasonResult.value.modeStats[0] ?? null);

  const reports = [];
  const primaryTags: PlayerDashboard["primaryTags"] = {};
  for (const row of recentMatches) {
    try {
      const { report } = await buildMatchReport(
        platform,
        row.matchId,
        accountId,
      );
      reports.push(report);
      primaryTags[row.matchId] = {
        code: report.primaryTag.code,
        label: report.primaryTag.label,
        positive: report.primaryTag.code === "good_game",
      };
    } catch {
      primaryTags[row.matchId] = null;
    }
  }

  return {
    player: {
      accountId,
      name: playerResult.value.name,
      platform: playerResult.value.platform,
      shard: playerResult.value.shard,
      banType: playerResult.value.banType ?? "Unknown",
      recentMatchCount: playerResult.value.matchIds.length,
    },
    season: {
      ...seasonResult.value,
      selectedGameMode: selectedStats?.gameMode ?? null,
    },
    selectedStats,
    recentMatches,
    localHistoryExtra,
    historyTotal: historyMeta.historyCount || (historyFile?.matches.length ?? 0),
    renameHint: {
      renamed: historyMeta.renamed,
      previousName: historyMeta.previousName,
      knownNames: historyMeta.knownNames,
    },
    weaknessTags: aggregateWeaknessTags(reports, 5),
    primaryTags,
    trend: buildDailyTrend(
      [
        ...recentMatches.map((m) => ({
          matchId: m.matchId,
          playedAt: m.playedAt,
          kills: m.kills,
          damage: m.damage,
          rank: m.rank,
        })),
        ...(historyFile?.matches ?? []).map((m) => ({
          matchId: m.matchId,
          playedAt: m.playedAt,
          kills: m.kills,
          damage: m.damage,
          rank: m.rank,
        })),
      ],
      14,
    ),
    cached: {
      player: playerResult.cached,
      season: seasonResult.cached,
    },
    degraded: Boolean(seasonResult.stale),
    syncedAt: new Date().toISOString(),
  };
}

/** 使该玩家相关内存缓存失效（名映射 / 赛季统计） */
export function invalidatePlayerCaches(
  platform: PubgPlatform,
  accountId: string,
  playerName?: string,
): void {
  if (playerName) {
    cacheDelete(`player:${platform}:${playerName.trim()}`);
  }
  cacheDeleteByPrefix(`season:${platform}:${accountId}:`);
}

function refreshCooldownKey(accountId: string): string {
  return `refresh:cooldown:${accountId}`;
}

export function getRefreshRetryAfterSec(accountId: string): number {
  const hit = cacheGet<RefreshCooldown>(refreshCooldownKey(accountId));
  if (!hit) return 0;
  const remainMs = hit.lastAt + REFRESH_COOLDOWN_MS - Date.now();
  return remainMs > 0 ? Math.ceil(remainMs / 1000) : 0;
}

export type RefreshPlayerResult = {
  accountId: string;
  name: string;
  platform: PubgPlatform;
  banType: PubgPlayerSummary["banType"];
  seasonId: string;
  recentMatchCount: number;
  syncedAt: string;
  cooldownSec: number;
};

/**
 * 手动刷新：按 accountId 冷却 60s；失效缓存后重新拉取 player + season。
 * 对局详情仍走 getCachedMatch，不强制重打官方。
 */
export async function refreshPlayer(
  platform: PubgPlatform,
  accountId: string,
  playerName: string,
  options?: { seasonId?: string },
): Promise<RefreshPlayerResult> {
  const name = playerName.trim();
  if (!name) {
    throw new BizError("name 不能为空");
  }

  const retryAfterSec = getRefreshRetryAfterSec(accountId);
  if (retryAfterSec > 0) {
    throw new BizError("刷新冷却中，请稍后再试", 409, 40901, { retryAfterSec });
  }

  invalidatePlayerCaches(platform, accountId, name);

  const player = await searchPlayerByName(platform, name);
  if (player.accountId !== accountId) {
    throw new BizError("accountId 与昵称不匹配", 400, 40001);
  }

  cacheSet(`player:${platform}:${player.name.trim()}`, player, TTL.playerByName);
  if (name !== player.name.trim()) {
    cacheSet(`player:${platform}:${name}`, player, TTL.playerByName);
  }

  const resolvedSeasonId = await resolveSeasonId(platform, options?.seasonId);

  const season = await getPlayerSeasonOverview(
    platform,
    accountId,
    resolvedSeasonId,
  );
  cacheSet(
    `season:${platform}:${accountId}:${season.seasonId}`,
    season,
    TTL.season,
  );
  try {
    await writePersistedSeason(season);
  } catch {
    // ignore
  }

  cacheSet(
    refreshCooldownKey(accountId),
    { lastAt: Date.now() } satisfies RefreshCooldown,
    REFRESH_COOLDOWN_MS,
  );

  return {
    accountId: player.accountId,
    name: player.name,
    platform: player.platform,
    banType: player.banType,
    seasonId: season.seasonId,
    recentMatchCount: player.matchIds.length,
    syncedAt: new Date().toISOString(),
    cooldownSec: Math.ceil(REFRESH_COOLDOWN_MS / 1000),
  };
}
