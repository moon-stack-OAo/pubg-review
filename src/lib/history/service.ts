import {
    aggregateMaps,
    aggregateWeaponsFromTelemetry,
    buildWeaponsTabData,
    filterByGameMode,
} from "@/lib/history/aggregate";
import {toHistoryRecord} from "@/lib/history/persist";
import {readPlayerHistory, recordPlayerName, upsertHistoryMatches,} from "@/lib/history/storage";
import type {
    CompareKpi,
    ComparePlayerSide,
    HistoryMatchRecord,
    MapsTabData,
    WeaponsTabData,
} from "@/lib/history/types";
import {cacheGet, cacheSet} from "@/lib/cache";
import {BizError} from "@/lib/errors";
import {getCachedMatch, getCachedPlayer, getCachedSeason,} from "@/lib/pubg/service";
import type {PubgMatchDetail, PubgPlatform} from "@/lib/pubg/types";
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
};

/**
 * 同步近况：重拉玩家 matchIds，串行补齐本地缺失的 match 详情后 upsert。
 * 冷却 90s，避免与 refresh 叠加打满 10RPM。
 */
export async function syncPlayerHistory(
  platform: PubgPlatform,
  accountId: string,
  playerName: string,
  options?: { limit?: number },
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
