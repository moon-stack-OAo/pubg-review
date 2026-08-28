import type {PubgMatchDetail, PubgPlatform} from "@/lib/pubg/types";
import {dataPath, readJsonFile, safeSegment, writeJsonFile,} from "@/lib/persist/fs-json";

export type PersistedMatchFile = {
  savedAt: string;
  /** 写入时的平台；旧文件可能缺失 */
  platform?: PubgPlatform;
  match: PubgMatchDetail;
};

const matchWriteChains = new Map<string, Promise<unknown>>();

function withMatchWriteLock<T>(
  matchId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = matchWriteChains.get(matchId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  matchWriteChains.set(
    matchId,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

function matchFilePath(matchId: string): string {
  return dataPath("matches", `${safeSegment(matchId)}.json`);
}

function shardMatchesPlatform(
  shard: string,
  platform: PubgPlatform,
): boolean {
  return shard === platform || shard.startsWith(`${platform}-`);
}

/**
 * 读取落盘 match；传入 platform 时校验 shard/platform，不匹配则视为 miss（不污染缓存）。
 */
export async function readPersistedMatch(
  matchId: string,
  platform?: PubgPlatform,
): Promise<PubgMatchDetail | null> {
  const file = await readJsonFile<PersistedMatchFile>(matchFilePath(matchId));
  if (!file?.match?.matchId) return null;
  // 旧文件可能缺 telemetryUrl，视为无效以便重拉
  if (!("telemetryUrl" in file.match)) return null;
  if (platform) {
    if (file.platform && file.platform !== platform) return null;
    if (!shardMatchesPlatform(file.match.shard, platform)) return null;
  }
  return file.match;
}

export async function writePersistedMatch(
  match: PubgMatchDetail,
  platform: PubgPlatform,
): Promise<void> {
  return withMatchWriteLock(match.matchId, async () => {
    const payload: PersistedMatchFile = {
      savedAt: new Date().toISOString(),
      platform,
      match,
    };
    await writeJsonFile(matchFilePath(match.matchId), payload);
  });
}
