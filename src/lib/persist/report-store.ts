import type {MatchReport} from "@/lib/analysis/report-engine";
import {dataPath, deleteJsonFile, readJsonFile, safeSegment, writeJsonFile,} from "@/lib/persist/fs-json";

export type PersistedReportFile = {
  savedAt: string;
  platform: string;
  matchId: string;
  accountId: string;
  report: MatchReport;
};

function reportFilePath(matchId: string, accountId: string): string {
  return dataPath(
    "reports",
    safeSegment(matchId),
    `${safeSegment(accountId)}.json`,
  );
}

export async function readPersistedReport(
  matchId: string,
  accountId: string,
): Promise<MatchReport | null> {
  const file = await readJsonFile<PersistedReportFile>(
    reportFilePath(matchId, accountId),
  );
  if (!file?.report?.matchId || !file.report.accountId) return null;
  if (file.report.matchId !== matchId) return null;
  if (file.report.accountId !== accountId) return null;
  return file.report;
}

export async function writePersistedReport(
  platform: string,
  matchId: string,
  accountId: string,
  report: MatchReport,
): Promise<void> {
  const payload: PersistedReportFile = {
    savedAt: new Date().toISOString(),
    platform,
    matchId,
    accountId,
    report,
  };
  await writeJsonFile(reportFilePath(matchId, accountId), payload);
}

export async function deletePersistedReport(
  matchId: string,
  accountId: string,
): Promise<boolean> {
  return deleteJsonFile(reportFilePath(matchId, accountId));
}
