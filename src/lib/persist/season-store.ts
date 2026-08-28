import type {PubgPlatform, PubgSeasonOverview} from "@/lib/pubg/types";
import {dataPath, readJsonFile, safeSegment, writeJsonFile,} from "@/lib/persist/fs-json";

export type PersistedSeasonFile = {
  savedAt: string;
  /** 写入时的 epoch ms，用于磁盘 TTL 判断 */
  savedAtMs: number;
  season: PubgSeasonOverview;
};

/** 与内存 TTL.season 对齐：过期后仍可读盘作冷启动，但标记 stale 由调用方决定是否重拉 */
export const SEASON_DISK_TTL_MS = 10 * 60 * 1000;

function seasonFilePath(
  platform: PubgPlatform,
  accountId: string,
  seasonId: string,
): string {
  return dataPath(
    "seasons",
    safeSegment(platform),
    safeSegment(accountId),
    `${safeSegment(seasonId)}.json`,
  );
}

export async function readPersistedSeason(
  platform: PubgPlatform,
  accountId: string,
  seasonId: string,
): Promise<{ season: PubgSeasonOverview; fresh: boolean } | null> {
  const file = await readJsonFile<PersistedSeasonFile>(
    seasonFilePath(platform, accountId, seasonId),
  );
  if (!file?.season?.seasonId || !file.season.accountId) return null;
  if (file.season.seasonId !== seasonId) return null;
  if (file.season.accountId !== accountId) return null;
  const age = Date.now() - (file.savedAtMs || 0);
  const fresh = age >= 0 && age < SEASON_DISK_TTL_MS;
  return { season: file.season, fresh };
}

export async function writePersistedSeason(
  season: PubgSeasonOverview,
): Promise<void> {
  const now = Date.now();
  const payload: PersistedSeasonFile = {
    savedAt: new Date(now).toISOString(),
    savedAtMs: now,
    season,
  };
  await writeJsonFile(
    seasonFilePath(season.platform, season.accountId, season.seasonId),
    payload,
  );
}
