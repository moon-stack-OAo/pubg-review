import {promises as fs} from "fs";
import type {MatchReport} from "@/lib/analysis/report-engine";
import {dataPath, deleteJsonFile, readJsonFile, safeSegment, writeJsonFile,} from "@/lib/persist/fs-json";

export type PersistedReportFile = {
  savedAt: string;
  platform: string;
  matchId: string;
  accountId: string;
  report: MatchReport;
};

const reportWriteChains = new Map<string, Promise<unknown>>();

function withReportWriteLock<T>(
  matchId: string,
  accountId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const key = `${matchId}:${accountId}`;
  const prev = reportWriteChains.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  reportWriteChains.set(
    key,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

function reportDir(matchId: string): string {
  return dataPath("reports", safeSegment(matchId));
}

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
  return withReportWriteLock(matchId, accountId, async () => {
    const payload: PersistedReportFile = {
      savedAt: new Date().toISOString(),
      platform,
      matchId,
      accountId,
      report,
    };
    await writeJsonFile(reportFilePath(matchId, accountId), payload);
  });
}

export async function deletePersistedReport(
  matchId: string,
  accountId: string,
): Promise<boolean> {
  return withReportWriteLock(matchId, accountId, () =>
    deleteJsonFile(reportFilePath(matchId, accountId)),
  );
}

/** 删除某场对局下全部落盘报告（遥测解析成功后失效旧报告） */
export async function deletePersistedReportsForMatch(
  matchId: string,
): Promise<void> {
  const dir = reportDir(matchId);
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}
