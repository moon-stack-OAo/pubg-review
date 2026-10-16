import type {MatchReport} from "@/lib/analysis/report-engine";
import type {
  PlayerAnalysis,
  WeaknessTagSummary,
} from "@/lib/analysis/player-analysis-core";
import type {PubgGameModeStats} from "@/lib/pubg/types";

/** 单场复盘脱敏 JSON：无 Key、无 CDN、无 raw telemetry */
export type SanitizedMatchReportPayload = {
  kind: "match_report";
  matchId: string;
  accountId: string;
  ruleVersion: string;
  degraded: boolean;
  confidence: string;
  primaryTag: { code: string; label: string; confidence: string };
  tags: Array<{ code: string; label: string; confidence: string }>;
  summaryLines: string[];
  suggestions: string[];
  metrics: {
    rank: number | null;
    kills: number;
    assists: number;
    damage: number;
    survivalTimeSec: number;
    durationSec: number;
    walkDistance: number;
    rideDistance: number;
    headshotKills: number;
    survivalRatio: number;
    phase: string;
  };
};

/** 赛季评价脱敏：无 banType、无 Key、无 telemetry */
export type SanitizedSeasonReviewPayload = {
  kind: "season_review";
  platform: string;
  seasonId: string;
  gameMode: string | null;
  roundsPlayed: number;
  wins: number;
  top10s: number;
  kd: number | null;
  winRate: number | null;
  top10Rate: number | null;
  avgDamage: number | null;
  avgSurvivalTimeSec: number | null;
  rankPoints: number | null;
  rankPointsTitle: string | null;
  recentSample: number;
  weaknessTags: Array<{ label: string; count: number }>;
};

export type SanitizedPlayerAnalysisPayload = {
  kind: "player_analysis";
  accountId: string;
  platform: string;
  range: string;
  sampleSize: number;
  radar: PlayerAnalysis["radar"];
  topIssues: Array<{ code: string; label: string; count: number }>;
  suggestions: string[];
};

export function sanitizeMatchReport(
  report: MatchReport,
): SanitizedMatchReportPayload {
  return {
    kind: "match_report",
    matchId: report.matchId,
    accountId: report.accountId,
    ruleVersion: report.ruleVersion,
    degraded: report.degraded,
    confidence: report.confidence,
    primaryTag: {
      code: report.primaryTag.code,
      label: report.primaryTag.label,
      confidence: report.primaryTag.confidence,
    },
    tags: report.tags.map((t) => ({
      code: t.code,
      label: t.label,
      confidence: t.confidence,
    })),
    summaryLines: [...report.summaryLines],
    suggestions: [...report.suggestions],
    metrics: {
      rank: report.metrics.rank,
      kills: report.metrics.kills,
      assists: report.metrics.assists,
      damage: report.metrics.damage,
      survivalTimeSec: report.metrics.survivalTimeSec,
      durationSec: report.metrics.durationSec,
      walkDistance: report.metrics.walkDistance,
      rideDistance: report.metrics.rideDistance,
      headshotKills: report.metrics.headshotKills,
      survivalRatio: report.metrics.survivalRatio,
      phase: report.metrics.phase,
    },
  };
}

export function sanitizeSeasonReview(input: {
  platform: string;
  seasonId: string;
  gameMode: string | null;
  stats: PubgGameModeStats | null;
  recentSample: number;
  weaknessTags: WeaknessTagSummary[];
}): SanitizedSeasonReviewPayload {
  const stats = input.stats;
  return {
    kind: "season_review",
    platform: input.platform,
    seasonId: input.seasonId,
    gameMode: input.gameMode,
    roundsPlayed: stats?.roundsPlayed ?? 0,
    wins: stats?.wins ?? 0,
    top10s: stats?.top10s ?? 0,
    kd: stats?.kd ?? null,
    winRate: stats?.winRate ?? null,
    top10Rate: stats?.top10Rate ?? null,
    avgDamage: stats?.avgDamage ?? null,
    avgSurvivalTimeSec: stats?.avgSurvivalTimeSec ?? null,
    rankPoints: stats?.rankPoints ?? null,
    rankPointsTitle: stats?.rankPointsTitle ?? null,
    recentSample: input.recentSample,
    weaknessTags: input.weaknessTags.slice(0, 5).map((tag) => ({
      label: tag.label,
      count: tag.count,
    })),
  };
}

export function sanitizePlayerAnalysis(
  analysis: PlayerAnalysis,
): SanitizedPlayerAnalysisPayload {
  return {
    kind: "player_analysis",
    accountId: analysis.accountId,
    platform: analysis.platform,
    range: analysis.range,
    sampleSize: analysis.sampleSize,
    radar: { ...analysis.radar },
    topIssues: analysis.topIssues.map((i) => ({
      code: i.code,
      label: i.label,
      count: i.count,
    })),
    suggestions: [...analysis.suggestions],
  };
}
