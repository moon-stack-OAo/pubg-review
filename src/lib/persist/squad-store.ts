import {createHash} from "crypto";
import type {PubgPlatform} from "@/lib/pubg/types";
import type {SquadStatsResult} from "@/lib/squad/types";
import {dataPath, readJsonFile, safeSegment, writeJsonFile,} from "@/lib/persist/fs-json";

export type PersistedSquadFile = {
  savedAt: string;
  savedAtMs: number;
  hash: string;
  result: SquadStatsResult;
};

/** 车队统计磁盘 TTL：20 分钟 */
export const SQUAD_DISK_TTL_MS = 20 * 60 * 1000;

/**
 * 缓存键：platform + 成员 accountId 排序拼接 + limit + gameMode
 */
export function squadCacheHash(input: {
  platform: PubgPlatform;
  accountIds: string[];
  limit: number;
  gameMode: string | null;
}): string {
  const ids = [...input.accountIds].sort();
  const raw = [
    input.platform,
    ids.join("|"),
    String(input.limit),
    input.gameMode ?? "",
  ].join("::");
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

function squadFilePath(hash: string): string {
  return dataPath("squad", `${safeSegment(hash)}.json`);
}

export async function readPersistedSquad(
  hash: string,
): Promise<{ result: SquadStatsResult; fresh: boolean } | null> {
  const file = await readJsonFile<PersistedSquadFile>(squadFilePath(hash));
  if (!file?.result?.player?.accountId) return null;
  if (file.hash && file.hash !== hash) return null;
  const age = Date.now() - (file.savedAtMs || 0);
  const fresh = age >= 0 && age < SQUAD_DISK_TTL_MS;
  return { result: file.result, fresh };
}

export async function writePersistedSquad(
  hash: string,
  result: SquadStatsResult,
): Promise<void> {
  const now = Date.now();
  const payload: PersistedSquadFile = {
    savedAt: new Date(now).toISOString(),
    savedAtMs: now,
    hash,
    result,
  };
  await writeJsonFile(squadFilePath(hash), payload);
}
