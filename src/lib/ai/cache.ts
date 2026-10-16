import {
  dataPath,
  deleteJsonFile,
  readJsonFile,
  safeSegment,
  writeJsonFile,
} from "@/lib/persist/fs-json";

export type PersistedAiExplain = {
  savedAt: string;
  matchId: string;
  accountId: string;
  ruleVersion: string;
  promptVersion: string;
  model: string;
  narrative: string;
  polishedSuggestions: string[];
};

function aiFilePath(
  matchId: string,
  accountId: string,
  ruleVersion: string,
  promptVersion: string,
): string {
  const key = `${safeSegment(accountId)}__${safeSegment(ruleVersion)}__${safeSegment(promptVersion)}.json`;
  return dataPath("ai", "match", safeSegment(matchId), key);
}

export async function readAiExplainCache(
  matchId: string,
  accountId: string,
  ruleVersion: string,
  promptVersion: string,
): Promise<PersistedAiExplain | null> {
  const file = await readJsonFile<PersistedAiExplain>(
    aiFilePath(matchId, accountId, ruleVersion, promptVersion),
  );
  if (!file?.narrative) return null;
  if (file.matchId !== matchId || file.accountId !== accountId) return null;
  if (file.ruleVersion !== ruleVersion || file.promptVersion !== promptVersion) {
    return null;
  }
  return file;
}

export async function writeAiExplainCache(
  payload: PersistedAiExplain,
): Promise<void> {
  await writeJsonFile(
    aiFilePath(
      payload.matchId,
      payload.accountId,
      payload.ruleVersion,
      payload.promptVersion,
    ),
    payload,
  );
}

export type PersistedSeasonReview = {
  savedAt: string;
  accountId: string;
  platform: string;
  seasonId: string;
  gameMode: string;
  promptVersion: string;
  model: string;
  narrative: string;
  highlights: string[];
  fingerprint: string;
};

function seasonFilePath(
  accountId: string,
  seasonId: string,
  gameMode: string,
  promptVersion: string,
): string {
  const key = `${safeSegment(seasonId)}__${safeSegment(gameMode || "all")}__${safeSegment(promptVersion)}.json`;
  return dataPath("ai", "season", safeSegment(accountId), key);
}

export async function readSeasonReviewCache(
  accountId: string,
  seasonId: string,
  gameMode: string,
  promptVersion: string,
): Promise<PersistedSeasonReview | null> {
  const file = await readJsonFile<PersistedSeasonReview>(
    seasonFilePath(accountId, seasonId, gameMode, promptVersion),
  );
  if (!file?.narrative) return null;
  if (file.accountId !== accountId || file.seasonId !== seasonId) return null;
  if (file.gameMode !== gameMode || file.promptVersion !== promptVersion) {
    return null;
  }
  return file;
}

export async function writeSeasonReviewCache(
  payload: PersistedSeasonReview,
): Promise<void> {
  await writeJsonFile(
    seasonFilePath(
      payload.accountId,
      payload.seasonId,
      payload.gameMode,
      payload.promptVersion,
    ),
    payload,
  );
}

export async function deleteAiExplainCache(
  matchId: string,
  accountId: string,
  ruleVersion: string,
  promptVersion: string,
): Promise<boolean> {
  return deleteJsonFile(
    aiFilePath(matchId, accountId, ruleVersion, promptVersion),
  );
}
