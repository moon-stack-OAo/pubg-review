import type {MatchReport} from "@/lib/analysis/report-engine";
import type {PlayerAnalysis} from "@/lib/analysis/player-analysis-core";

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
