import type {PubgMatchDetail} from "@/lib/pubg/types";
import {dataPath, readJsonFile, safeSegment, writeJsonFile,} from "@/lib/persist/fs-json";

export type PersistedMatchFile = {
  savedAt: string;
  match: PubgMatchDetail;
};

function matchFilePath(matchId: string): string {
  return dataPath("matches", `${safeSegment(matchId)}.json`);
}

export async function readPersistedMatch(
  matchId: string,
): Promise<PubgMatchDetail | null> {
  const file = await readJsonFile<PersistedMatchFile>(matchFilePath(matchId));
  if (!file?.match?.matchId) return null;
  // 旧文件可能缺 telemetryUrl，视为无效以便重拉
  if (!("telemetryUrl" in file.match)) return null;
  return file.match;
}

export async function writePersistedMatch(
  match: PubgMatchDetail,
): Promise<void> {
  const payload: PersistedMatchFile = {
    savedAt: new Date().toISOString(),
    match,
  };
  await writeJsonFile(matchFilePath(match.matchId), payload);
}
