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
