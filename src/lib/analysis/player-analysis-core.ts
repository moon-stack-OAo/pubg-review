import {type MatchReport, type ReportTagCode, tagLabel,} from "@/lib/analysis/report-engine";

export type AnalysisRange = "20m" | "14d";

export const WEAK_SAMPLE_THRESHOLD = 5;

export type WeaknessTagSummary = {
  code: ReportTagCode;
  label: string;
  count: number;
  matchIds: string[];
};

export type PlayerRadar = {
  survival: number;
  aim: number;
  landing: number;
  endgame: number;
  teamplay: number;
};

export type PlayerAnalysis = {
  accountId: string;
  platform: string;
  name: string;
  range: AnalysisRange;
  sampleSize: number;
  radar: PlayerRadar;
  topIssues: WeaknessTagSummary[];
  suggestions: string[];
  weaknessTags: WeaknessTagSummary[];
};

const DEFAULT_RADAR: PlayerRadar = {
  survival: 50,
  aim: 50,
  landing: 50,
  endgame: 50,
  teamplay: 50,
};

const NEGATIVE_CODES: ReportTagCode[] = [
  "hot_drop",
  "early_exit",
  "mid_overfight",
  "mid_third_party",
  "late_rotate",
  "endgame_nades",
  "isolated_death",
  "aim_inconsistent",
  "low_damage",
];

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function parseRange(raw: string | undefined): AnalysisRange {
  if (raw === "14d") return "14d";
  return "20m";
}

/** 从多场报告聚合标签频次（仅负向主因，用于弱点） */
export function aggregateWeaknessTags(
  reports: MatchReport[],
  max = 5,
): WeaknessTagSummary[] {
  const map = new Map<
    ReportTagCode,
    { label: string; count: number; matchIds: string[] }
  >();

  for (const report of reports) {
    const code = report.primaryTag.code;
    if (code === "good_game") continue;
    const prev = map.get(code);
    if (prev) {
      prev.count += 1;
      if (!prev.matchIds.includes(report.matchId)) {
        prev.matchIds.push(report.matchId);
      }
    } else {
      map.set(code, {
        label: report.primaryTag.label || tagLabel(code),
        count: 1,
        matchIds: [report.matchId],
      });
    }
  }

  return [...map.entries()]
    .map(([code, v]) => ({ code, ...v }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
    .slice(0, max);
}

export function aggregateSuggestions(reports: MatchReport[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const report of reports) {
    for (const s of report.suggestions) {
      const text = s.trim();
      if (!text || seen.has(text)) continue;
      seen.add(text);
      out.push(text);
    }
  }
  return out.slice(0, 8);
}

/**
 * 粗算雷达 0–100；无报告时返回默认中间值。
 */
export function computeRadar(reports: MatchReport[]): PlayerRadar {
  if (reports.length === 0) return { ...DEFAULT_RADAR };

  const n = reports.length;
  let survivalRatioSum = 0;
  let rankScoreSum = 0;
  let damageSum = 0;
  let killsSum = 0;
  let assistsSum = 0;
  let headshotSum = 0;
  let lateGood = 0;
  let lateTotal = 0;
  let hotOrEarly = 0;

  for (const r of reports) {
    const m = r.metrics;
    survivalRatioSum += m.survivalRatio;
    if (m.rank != null) {
      rankScoreSum += Math.max(0, 100 - (m.rank - 1) * (100 / 99));
    } else {
      rankScoreSum += 40;
    }
    damageSum += m.damage;
    killsSum += m.kills;
    assistsSum += m.assists;
    headshotSum += m.headshotKills;
    if (m.phase === "late" || (m.rank != null && m.rank <= 10)) {
      lateTotal += 1;
      if (m.rank != null && m.rank <= 10) lateGood += 1;
    }
    if (
      r.primaryTag.code === "hot_drop" ||
      r.primaryTag.code === "early_exit"
    ) {
      hotOrEarly += 1;
    }
  }

  const avgSurvivalRatio = survivalRatioSum / n;
  const avgRankScore = rankScoreSum / n;
  const avgDamage = damageSum / n;
  const avgKills = killsSum / n;
  const avgAssists = assistsSum / n;
  const hsRate = killsSum > 0 ? headshotSum / killsSum : 0;
  const killPer400Dmg =
    damageSum > 0 ? (killsSum / damageSum) * 400 : avgKills;

  const survival = clampScore(
    avgSurvivalRatio * 55 + avgRankScore * 0.45,
  );
  const aim = clampScore(
    Math.min(avgDamage / 5.5, 55) +
      Math.min(killPer400Dmg * 18, 30) +
      hsRate * 20,
  );
  const landing = clampScore(100 - (hotOrEarly / n) * 85);
  let endgamePenalty = 0;
  let teamPenalty = 0;
  for (const r of reports) {
    for (const t of r.tags) {
      if (t.code === "endgame_nades" || t.code === "late_rotate") {
        endgamePenalty += 1;
      }
      if (t.code === "isolated_death") teamPenalty += 1;
    }
  }
  const endgameBase =
    lateTotal > 0
      ? clampScore(35 + (lateGood / lateTotal) * 65)
      : clampScore(40 + avgSurvivalRatio * 40);
  const endgame = clampScore(endgameBase - (endgamePenalty / n) * 25);
  const teamplay = clampScore(
    Math.min(avgAssists * 22, 55) +
      Math.min(avgKills * 8, 25) +
      (avgAssists > avgKills ? 15 : 5) -
      (teamPenalty / n) * 30,
  );

  return { survival, aim, landing, endgame, teamplay };
}

export function buildPlayerAnalysisFromReports(
  meta: {
    accountId: string;
    platform: string;
    name: string;
    range: AnalysisRange;
  },
  reports: MatchReport[],
): PlayerAnalysis {
  const weaknessTags = aggregateWeaknessTags(reports, 5);
  return {
    accountId: meta.accountId,
    platform: meta.platform,
    name: meta.name,
    range: meta.range,
    sampleSize: reports.length,
    radar: computeRadar(reports),
    topIssues: weaknessTags,
    suggestions: aggregateSuggestions(
      reports.filter((r) => NEGATIVE_CODES.includes(r.primaryTag.code)),
    ),
    weaknessTags,
  };
}
