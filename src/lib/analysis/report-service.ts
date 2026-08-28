import {generateNoTelemetryReport, type MatchReport, RULE_VERSION_NO_TELEMETRY,} from "@/lib/analysis/report-engine";
import {generateTelemetryReport, RULE_VERSION_TELEMETRY,} from "@/lib/analysis/report-engine-telemetry";
import {cacheDelete, cacheDeleteIf, cacheGet, cacheSet, TTL} from "@/lib/cache";
import {BizError} from "@/lib/errors";
import {
    deletePersistedReport,
    deletePersistedReportsForMatch,
    readPersistedReport,
    writePersistedReport,
} from "@/lib/persist/report-store";
import {getCachedMatch} from "@/lib/pubg/service";
import type {PubgPlatform} from "@/lib/pubg/types";
import {getTelemetryStatus} from "@/lib/telemetry/service";
import {readParsedEvents} from "@/lib/telemetry/storage";

function reportCacheKey(
  platform: PubgPlatform,
  matchId: string,
  accountId: string,
  ruleVersion: string,
): string {
  return `report:${ruleVersion}:${platform}:${matchId}:${accountId}`;
}

/**
 * 仅读本地已解析 events；不触发下载。ready 且文件存在才返回。
 */
async function tryLoadReadyTelemetry(matchId: string) {
  const status = await getTelemetryStatus(matchId);
  if (status !== "ready") return null;
  return readParsedEvents(matchId);
}

function hydrateReportCache(
  platform: PubgPlatform,
  matchId: string,
  accountId: string,
  report: MatchReport,
): void {
  cacheSet(
    reportCacheKey(platform, matchId, accountId, report.ruleVersion),
    report,
    TTL.matchReport,
  );
}

export function peekCachedMatchReport(
  platform: PubgPlatform,
  matchId: string,
  accountId: string,
  ruleVersion?: string,
): MatchReport | null {
  if (ruleVersion) {
    return cacheGet<MatchReport>(
      reportCacheKey(platform, matchId, accountId, ruleVersion),
    );
  }
  return (
    cacheGet<MatchReport>(
      reportCacheKey(platform, matchId, accountId, RULE_VERSION_TELEMETRY),
    ) ??
    cacheGet<MatchReport>(
      reportCacheKey(platform, matchId, accountId, RULE_VERSION_NO_TELEMETRY),
    )
  );
}

/**
 * 拉 cached match → 找 participant → 若本地 telemetry ready 则增强引擎，否则降级。
 * 读取顺序：内存 → `.data/reports/{matchId}/{accountId}.json` → 生成并落盘。
 * 缓存 key 含 ruleVersion；telemetry 刚 ready 时会自动优先用增强版（跳过旧 no-telemetry 缓存）。
 */
export async function buildMatchReport(
  platform: PubgPlatform,
  matchId: string,
  accountId: string,
  options?: { force?: boolean },
): Promise<{ report: MatchReport; cached: boolean }> {
  const id = accountId.trim();
  if (!id) {
    throw new BizError("accountId 不能为空");
  }
  if (!matchId.trim()) {
    throw new BizError("matchId 不能为空");
  }

  const telemetry = await tryLoadReadyTelemetry(matchId);
  const ruleVersion = telemetry
    ? RULE_VERSION_TELEMETRY
    : RULE_VERSION_NO_TELEMETRY;
  const key = reportCacheKey(platform, matchId, id, ruleVersion);

  if (!options?.force) {
    const hit = cacheGet<MatchReport>(key);
    if (hit) {
      return { report: hit, cached: true };
    }

    const disk = await readPersistedReport(matchId, id);
    if (disk && disk.ruleVersion === ruleVersion) {
      hydrateReportCache(platform, matchId, id, disk);
      return { report: disk, cached: true };
    }
  }

  const { value: match } = await getCachedMatch(platform, matchId);
  const participant =
    match.rosters
      .flatMap((r) => r.participants)
      .find((p) => p.accountId === id) ?? null;

  if (!participant) {
    throw new BizError("该玩家不在本场对局中", 404, 40402);
  }

  try {
    let report: MatchReport;
    if (telemetry) {
      try {
        report = generateTelemetryReport(match, id, participant, telemetry);
      } catch {
        report = generateNoTelemetryReport(match, id, participant);
      }
    } else {
      report = generateNoTelemetryReport(match, id, participant);
    }

    hydrateReportCache(platform, matchId, id, report);
    try {
      await writePersistedReport(platform, matchId, id, report);
    } catch {
      // 落盘失败不影响响应
    }
    return { report, cached: false };
  } catch (e) {
    throw new BizError(
      e instanceof Error ? e.message : "报告生成失败",
      500,
      50003,
    );
  }
}

export async function invalidateMatchReport(
  platform: PubgPlatform,
  matchId: string,
  accountId: string,
  ruleVersion?: string,
): Promise<void> {
  if (ruleVersion) {
    cacheDelete(reportCacheKey(platform, matchId, accountId, ruleVersion));
  } else {
    cacheDelete(
      reportCacheKey(platform, matchId, accountId, RULE_VERSION_NO_TELEMETRY),
    );
    cacheDelete(
      reportCacheKey(platform, matchId, accountId, RULE_VERSION_TELEMETRY),
    );
  }
  try {
    await deletePersistedReport(matchId, accountId);
  } catch {
    // ignore
  }
}

/**
 * 遥测解析成功后：失效该 match 下全部报告缓存与磁盘（各 accountId）。
 */
export async function invalidateReportsForMatch(
  platform: PubgPlatform,
  matchId: string,
): Promise<void> {
  const needle = `:${platform}:${matchId}:`;
  cacheDeleteIf((key) => key.startsWith("report:") && key.includes(needle));
  try {
    await deletePersistedReportsForMatch(matchId);
  } catch {
    // ignore
  }
}

/**
 * 调试重算：清内存 + 磁盘后强制生成并覆盖落盘（优先遥测增强）。
 */
export async function rebuildMatchReport(
  platform: PubgPlatform,
  matchId: string,
  accountId: string,
): Promise<{ report: MatchReport; cached: boolean }> {
  await invalidateMatchReport(platform, matchId, accountId);
  return buildMatchReport(platform, matchId, accountId, { force: true });
}
