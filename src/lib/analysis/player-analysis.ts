import {
    type AnalysisRange,
    buildPlayerAnalysisFromReports,
    parseRange,
    type PlayerAnalysis,
} from "@/lib/analysis/player-analysis-core";
import {buildMatchReport} from "@/lib/analysis/report-service";
import type {MatchReport} from "@/lib/analysis/report-engine";
import {BizError} from "@/lib/errors";
import {getCachedMatch, getCachedPlayer} from "@/lib/pubg/service";
import type {PubgPlatform} from "@/lib/pubg/types";

export type {
  AnalysisRange,
  PlayerAnalysis,
  PlayerRadar,
  WeaknessTagSummary,
} from "@/lib/analysis/player-analysis-core";

export {
  aggregateSuggestions,
  aggregateWeaknessTags,
  buildPlayerAnalysisFromReports,
  computeRadar,
  parseRange,
} from "@/lib/analysis/player-analysis-core";

function rangeMatchLimit(range: AnalysisRange): number {
  // 20m / 14d 当前均上限 20 场，避免串行拉太多 match
  void range;
  return 20;
}

function filterMatchIdsByRange(
  matchIds: string[],
  playedAtById: Map<string, string>,
  range: AnalysisRange,
): string[] {
  if (range === "20m") {
    return matchIds.slice(0, 20);
  }
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  return matchIds
    .filter((id) => {
      const at = playedAtById.get(id);
      if (!at) return true;
      return +new Date(at) >= cutoff;
    })
    .slice(0, 20);
}

/**
 * 按昵称拉取近期对局报告并聚合分析（优先用已有报告缓存，必要时生成）。
 */
export async function getPlayerAnalysisByName(
  platform: PubgPlatform,
  name: string,
  options?: { range?: string },
): Promise<PlayerAnalysis> {
  const range = parseRange(options?.range);
  const limit = rangeMatchLimit(range);
  const { value: player } = await getCachedPlayer(platform, name);
  const candidateIds = player.matchIds.slice(0, Math.max(limit, 8));

  const playedAtById = new Map<string, string>();
  for (const matchId of candidateIds) {
    try {
      const { value: match } = await getCachedMatch(platform, matchId);
      playedAtById.set(matchId, match.playedAt);
    } catch {
      // 单场失败跳过
    }
  }

  const matchIds = filterMatchIdsByRange(
    candidateIds,
    playedAtById,
    range,
  ).slice(0, limit);

  const reports: MatchReport[] = [];
  for (const matchId of matchIds) {
    try {
      const { report } = await buildMatchReport(
        platform,
        matchId,
        player.accountId,
      );
      reports.push(report);
    } catch {
      // 单场报告失败跳过
    }
  }

  return buildPlayerAnalysisFromReports(
    {
      accountId: player.accountId,
      platform,
      name: player.name,
      range,
    },
    reports,
  );
}

export async function getPlayerAnalysisByAccount(
  platform: PubgPlatform,
  accountId: string,
  name: string,
  options?: { range?: string },
): Promise<PlayerAnalysis> {
  const id = accountId.trim();
  if (!id) {
    throw new BizError("accountId 不能为空");
  }
  const trimmed = name.trim();
  if (!trimmed) {
    throw new BizError("name 不能为空");
  }
  const { value: player } = await getCachedPlayer(platform, trimmed);
  if (player.accountId !== id) {
    throw new BizError("accountId 与昵称不匹配", 400, 40001);
  }
  return getPlayerAnalysisByName(platform, player.name, options);
}
