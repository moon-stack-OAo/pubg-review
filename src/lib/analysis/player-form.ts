import {aggregateWeaknessTags, computeRadar,} from "@/lib/analysis/player-analysis-core";
import {
    buildPlayerFormAnalysis,
    type FormSeasonKpi,
    type PlayerFormAnalysis,
    rowsFromReports,
} from "@/lib/analysis/form-status";
import {buildMatchReport} from "@/lib/analysis/report-service";
import type {MatchReport} from "@/lib/analysis/report-engine";
import {BizError} from "@/lib/errors";
import {mapLabel} from "@/lib/pubg/maps";
import {getCachedMatch, getCachedPlayer, getCachedSeason,} from "@/lib/pubg/service";
import type {PubgGameModeStats, PubgPlatform} from "@/lib/pubg/types";

export type {
  AnomalyItem,
  FormStatusCode,
  FormStatusResult,
  PlayerFormAnalysis,
} from "@/lib/analysis/form-status";

export type GetPlayerFormOptions = {
  gameMode?: string;
  seasonId?: string;
  /** 近场样本上限，默认 20，最大 20 */
  limit?: number;
};

function clampLimit(raw: number | undefined): number {
  if (raw == null || !Number.isFinite(raw)) return 20;
  return Math.min(Math.max(Math.floor(raw), 1), 20);
}

function pickModeStats(
  modeStats: PubgGameModeStats[],
  gameMode?: string,
): PubgGameModeStats | null {
  if (gameMode) {
    return modeStats.find((m) => m.gameMode === gameMode) ?? null;
  }
  if (modeStats.length === 0) return null;
  return [...modeStats].sort((a, b) => b.roundsPlayed - a.roundsPlayed)[0] ?? null;
}

function toSeasonKpi(stats: PubgGameModeStats | null): FormSeasonKpi | null {
  if (!stats) return null;
  return {
    kd: stats.kd,
    avgDamage: stats.avgDamage,
    top10Rate: stats.top10Rate,
    wins: stats.wins,
    rounds: stats.roundsPlayed,
  };
}

function matchModeOk(matchGameMode: string, filter?: string): boolean {
  if (!filter) return true;
  return matchGameMode === filter;
}

/**
 * 玩家「现状 vs 异常」分析：赛季 KPI 对比近 N 场 + 连续主因 / 低伤离群。
 * 串行 getCachedMatch + buildMatchReport，优先磁盘/内存缓存。
 */
export async function getPlayerFormAnalysis(
  platform: PubgPlatform,
  name: string,
  options?: GetPlayerFormOptions,
): Promise<PlayerFormAnalysis> {
  const trimmed = name.trim();
  if (!trimmed) throw new BizError("name 不能为空");

  const limit = clampLimit(options?.limit);
  const gameMode = options?.gameMode?.trim() || undefined;

  const { value: player } = await getCachedPlayer(platform, trimmed);
  const seasonResult = await getCachedSeason(
    platform,
    player.accountId,
    options?.seasonId,
  );
  const selectedStats = pickModeStats(seasonResult.value.modeStats, gameMode);
  const season = toSeasonKpi(selectedStats);

  // 多取一些 id，过滤模式后仍能凑满 limit
  const candidateIds = player.matchIds.slice(0, Math.min(limit * 2, 40));
  const metaByMatchId = new Map<
    string,
    { playedAt?: string; mapLabel?: string; gameMode: string }
  >();
  const orderedIds: string[] = [];

  for (const matchId of candidateIds) {
    if (orderedIds.length >= limit) break;
    try {
      const { value: match } = await getCachedMatch(platform, matchId);
      if (!matchModeOk(match.gameMode, gameMode)) continue;
      metaByMatchId.set(matchId, {
        playedAt: match.playedAt,
        mapLabel: mapLabel(match.mapName),
        gameMode: match.gameMode,
      });
      orderedIds.push(matchId);
    } catch {
      // 单场失败跳过
    }
  }

  // 新→旧
  orderedIds.sort((a, b) => {
    const ta = metaByMatchId.get(a)?.playedAt ?? "";
    const tb = metaByMatchId.get(b)?.playedAt ?? "";
    return +new Date(tb) - +new Date(ta);
  });

  const reports: MatchReport[] = [];
  for (const matchId of orderedIds) {
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

  // 与 orderedIds 顺序对齐（报告可能缺场）
  const reportOrder = new Map(reports.map((r, i) => [r.matchId, i]));
  reports.sort((a, b) => {
    const ia = orderedIds.indexOf(a.matchId);
    const ib = orderedIds.indexOf(b.matchId);
    if (ia !== -1 && ib !== -1) return ia - ib;
    return (reportOrder.get(a.matchId) ?? 0) - (reportOrder.get(b.matchId) ?? 0);
  });

  const rows = rowsFromReports(
    reports,
    new Map(
      [...metaByMatchId.entries()].map(([id, m]) => [
        id,
        { playedAt: m.playedAt, mapLabel: m.mapLabel },
      ]),
    ),
  );

  const radar = reports.length > 0 ? computeRadar(reports) : null;
  const base = buildPlayerFormAnalysis({ season, rows, radar });
  return {
    ...base,
    weaknessTags: aggregateWeaknessTags(reports, 5),
  };
}
