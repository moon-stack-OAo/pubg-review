import {type MatchReport, type ReportTagCode, tagLabel,} from "@/lib/analysis/report-engine";
import type {PlayerRadar, WeaknessTagSummary,} from "@/lib/analysis/player-analysis-core";

export type FormStatusCode = "normal" | "soft" | "poor";

export type FormSeasonKpi = {
  kd: number | null;
  avgDamage: number | null;
  top10Rate: number | null;
  wins?: number;
  rounds?: number;
};

export type FormRecentKpi = {
  sampleSize: number;
  kd: number | null;
  avgDamage: number;
  avgRank: number | null;
  top10Rate: number;
  wins: number;
};

export type FormStatusResult = {
  status: FormStatusCode;
  label: string;
  summary: string;
  needImprove: string[];
  season: FormSeasonKpi | null;
  recent: FormRecentKpi;
  deltas?: { damageRatio: number | null; kdRatio: number | null };
};

export type AnomalyItem =
  | {
      type: "tag_streak";
      tagCode: string;
      tagLabel: string;
      count: number;
      matchIds: string[];
    }
  | {
      type: "low_damage";
      matchId: string;
      damage: number;
      avgDamage: number;
      ratio: number;
      playedAt?: string;
      mapLabel?: string;
    }
  | {
      type: "low_kills";
      matchId: string;
      kills: number;
      avgKills: number;
      ratio: number;
      playedAt?: string;
      mapLabel?: string;
    };

export type PlayerFormAnalysis = {
  form: FormStatusResult;
  anomalies: AnomalyItem[];
  /** 0–100，供 UI「综合评分」；优先雷达五维均值，否则按 form 映射 */
  overallScore?: number;
  /** 近场弱点聚合；由 getPlayerFormAnalysis 附带，避免再打 dashboard */
  weaknessTags?: WeaknessTagSummary[];
};

export type RecentMatchFormRow = {
  matchId: string;
  damage: number;
  kills: number;
  rank: number | null;
  playedAt?: string;
  mapLabel?: string;
  primaryTag: { code: ReportTagCode; label: string };
  /** 存活占比 0–1，可选，用于 needImprove「存活」 */
  survivalRatio?: number;
};

/** 赛季场次少于此值时，不把赛季当可靠基线 */
export const MIN_SEASON_ROUNDS = 10;

const STATUS_LABEL: Record<FormStatusCode, string> = {
  normal: "近况正常",
  soft: "近况偏软",
  poor: "近况偏摆",
};

const MAX_ANOMALIES = 10;
const STREAK_MIN = 3;
/** 场均击杀过低时不报 low_kills，避免刷屏 */
const MIN_AVG_KILLS_FOR_OUTLIER = 0.8;

function round2(n: number): number {
  return Number(n.toFixed(2));
}

function safeRatio(num: number | null | undefined, den: number | null | undefined): number | null {
  if (num == null || den == null || !Number.isFinite(num) || !Number.isFinite(den) || den <= 0) {
    return null;
  }
  return round2(num / den);
}

/**
 * formStatus 判定（有赛季基线时）：
 * - damageRatio / kdRatio = recent / season
 * - 两者都 ≥ 0.85 → normal
 * - 任一 < 0.7，或两者都 < 0.85 → soft
 * - 两者都 < 0.7，或 damageRatio < 0.55 → poor
 *
 * 无赛季 / 场次过少：按近况绝对水平保守判定（见 computeFormWithoutSeason）。
 */
export function computeFormStatus(
  season: FormSeasonKpi | null,
  recent: FormRecentKpi,
  options?: { avgSurvivalRatio?: number | null },
): FormStatusResult {
  if (recent.sampleSize === 0) {
    return {
      status: "soft",
      label: STATUS_LABEL.soft,
      summary: "近场样本不足，暂无法判断近况",
      needImprove: [],
      season,
      recent,
    };
  }

  const seasonUsable =
    season != null &&
    (season.rounds ?? 0) >= MIN_SEASON_ROUNDS &&
    ((season.avgDamage != null && season.avgDamage > 0) ||
      (season.kd != null && season.kd > 0));

  if (!seasonUsable) {
    return computeFormWithoutSeason(season, recent, options?.avgSurvivalRatio);
  }

  const damageRatio = safeRatio(recent.avgDamage, season!.avgDamage);
  const kdRatio = safeRatio(recent.kd, season!.kd);
  const deltas = { damageRatio, kdRatio };
  const status = classifyWithSeasonRatios(damageRatio, kdRatio);

  const needImprove = collectNeedImprove(season, recent, deltas, options?.avgSurvivalRatio);
  const summary = buildSummaryWithSeason(status, recent, deltas);

  return {
    status,
    label: STATUS_LABEL[status],
    summary,
    needImprove,
    season,
    recent,
    deltas,
  };
}

/**
 * 有赛季比值时的状态机：
 * - 可比较指标均 ≥ 0.85（至少一侧有值）→ normal
 * - damageRatio < 0.55，或两侧均 < 0.7 → poor
 * - 任一 < 0.7，或两侧均 < 0.85，或单侧 < 0.85 → soft
 */
function classifyWithSeasonRatios(
  damageRatio: number | null,
  kdRatio: number | null,
): FormStatusCode {
  const ratios = [damageRatio, kdRatio].filter(
    (r): r is number => r != null && Number.isFinite(r),
  );
  if (ratios.length === 0) return "soft";

  const bothGe085 = ratios.every((r) => r >= 0.85);
  if (bothGe085) return "normal";

  const dVeryPoor = damageRatio != null && damageRatio < 0.55;
  const bothLt07 =
    ratios.length >= 2 && ratios.every((r) => r < 0.7);
  if (dVeryPoor || bothLt07) return "poor";

  return "soft";
}

/**
 * 无可靠赛季基线：用近况绝对水平保守估计。
 * - 场均伤 ≥ 250 且 KD ≥ 1.0 → normal
 * - 场均伤 < 120 或 KD < 0.5 → poor
 * - 其余 → soft
 */
function computeFormWithoutSeason(
  season: FormSeasonKpi | null,
  recent: FormRecentKpi,
  avgSurvivalRatio?: number | null,
): FormStatusResult {
  const kd = recent.kd ?? 0;
  const dmg = recent.avgDamage;
  let status: FormStatusCode = "soft";
  if (dmg >= 250 && kd >= 1.0) status = "normal";
  else if (dmg < 120 || kd < 0.5) status = "poor";

  const needImprove: string[] = [];
  if (dmg < 200) needImprove.push("输出");
  if (
    (recent.avgRank != null && recent.avgRank > 40) ||
    (avgSurvivalRatio != null && avgSurvivalRatio < 0.35)
  ) {
    needImprove.push("存活");
  }

  const summary =
    status === "normal"
      ? `近 ${recent.sampleSize} 场绝对水平尚可（无可靠赛季基线对比）`
      : status === "poor"
        ? `近 ${recent.sampleSize} 场相对自身常见水平偏低（无可靠赛季基线）`
        : `近 ${recent.sampleSize} 场样本有限，近况偏软（无可靠赛季基线）`;

  return {
    status,
    label: STATUS_LABEL[status],
    summary,
    needImprove: [...new Set(needImprove)],
    season,
    recent,
  };
}

function collectNeedImprove(
  season: FormSeasonKpi | null,
  recent: FormRecentKpi,
  deltas: { damageRatio: number | null; kdRatio: number | null },
  avgSurvivalRatio?: number | null,
): string[] {
  const out: string[] = [];
  const dmgLow =
    (deltas.damageRatio != null && deltas.damageRatio < 0.85) ||
    (deltas.kdRatio != null && deltas.kdRatio < 0.85);
  if (dmgLow) out.push("输出");

  const survivalWeak =
    (recent.avgRank != null &&
      recent.avgRank > 35 &&
      (season?.top10Rate == null ||
        recent.top10Rate + 0.05 < (season.top10Rate ?? 1))) ||
    (avgSurvivalRatio != null && avgSurvivalRatio < 0.4);
  if (survivalWeak) out.push("存活");

  return [...new Set(out)];
}

function buildSummaryWithSeason(
  status: FormStatusCode,
  recent: FormRecentKpi,
  deltas: { damageRatio: number | null; kdRatio: number | null },
): string {
  const parts: string[] = [`近 ${recent.sampleSize} 场`];
  if (deltas.damageRatio != null) {
    parts.push(`场均伤约为赛季的 ${Math.round(deltas.damageRatio * 100)}%`);
  }
  if (deltas.kdRatio != null) {
    parts.push(`KD 约为赛季的 ${Math.round(deltas.kdRatio * 100)}%`);
  }
  const detail = parts.join("，");
  if (status === "normal") return `${detail}，近况与赛季基线接近`;
  if (status === "poor") return `${detail}，近况相对自身均值明显偏低`;
  return `${detail}，近况相对赛季基线偏软`;
}

/** 从近场行聚合 recent KPI（KD≈ kills / max(场次-吃鸡, 1)） */
export function aggregateRecentKpi(rows: RecentMatchFormRow[]): FormRecentKpi & {
  avgKills: number;
  avgSurvivalRatio: number | null;
} {
  const n = rows.length;
  if (n === 0) {
    return {
      sampleSize: 0,
      kd: null,
      avgDamage: 0,
      avgRank: null,
      top10Rate: 0,
      wins: 0,
      avgKills: 0,
      avgSurvivalRatio: null,
    };
  }

  let kills = 0;
  let damage = 0;
  let wins = 0;
  let top10 = 0;
  let rankSum = 0;
  let rankCount = 0;
  let survivalSum = 0;
  let survivalCount = 0;

  for (const r of rows) {
    kills += r.kills;
    damage += r.damage;
    if (r.rank === 1) wins += 1;
    if (r.rank != null && r.rank <= 10) top10 += 1;
    if (r.rank != null) {
      rankSum += r.rank;
      rankCount += 1;
    }
    if (r.survivalRatio != null) {
      survivalSum += r.survivalRatio;
      survivalCount += 1;
    }
  }

  const deaths = Math.max(n - wins, 1);
  return {
    sampleSize: n,
    kd: round2(kills / deaths),
    avgDamage: round2(damage / n),
    avgRank: rankCount > 0 ? round2(rankSum / rankCount) : null,
    top10Rate: round2(top10 / n),
    wins,
    avgKills: round2(kills / n),
    avgSurvivalRatio: survivalCount > 0 ? round2(survivalSum / survivalCount) : null,
  };
}

/**
 * 异常检测：
 * 1) 按时间新→旧，连续 ≥3 场同一负向 primaryTag → tag_streak（取最近一段最长 streak）
 * 2) 单场伤 < 近场均值×0.5 → low_damage；击杀类似（avgKills≥0.8 才报）
 * streak 优先，总数上限 MAX_ANOMALIES
 */
export function detectAnomalies(
  rows: RecentMatchFormRow[],
  recentAvg: { avgDamage: number; avgKills: number },
): AnomalyItem[] {
  const anomalies: AnomalyItem[] = [];
  if (rows.length === 0) return anomalies;

  // 假定调用方已按 playedAt 新→旧排序
  const streak = findLongestNegativeStreak(rows);
  if (streak) anomalies.push(streak);

  const avgDmg = recentAvg.avgDamage;
  const avgKills = recentAvg.avgKills;

  for (const r of rows) {
    if (anomalies.length >= MAX_ANOMALIES) break;
    if (avgDmg > 0 && r.damage < avgDmg * 0.5) {
      anomalies.push({
        type: "low_damage",
        matchId: r.matchId,
        damage: round2(r.damage),
        avgDamage: round2(avgDmg),
        ratio: round2(r.damage / avgDmg),
        playedAt: r.playedAt,
        mapLabel: r.mapLabel,
      });
    }
  }

  if (avgKills >= MIN_AVG_KILLS_FOR_OUTLIER) {
    for (const r of rows) {
      if (anomalies.length >= MAX_ANOMALIES) break;
      if (r.kills < avgKills * 0.5) {
        // 避免与同场 low_damage 重复占满：同 match 已有 low_damage 则跳过 kills
        if (anomalies.some((a) => a.type === "low_damage" && a.matchId === r.matchId)) {
          continue;
        }
        anomalies.push({
          type: "low_kills",
          matchId: r.matchId,
          kills: r.kills,
          avgKills: round2(avgKills),
          ratio: round2(r.kills / avgKills),
          playedAt: r.playedAt,
          mapLabel: r.mapLabel,
        });
      }
    }
  }

  return anomalies.slice(0, MAX_ANOMALIES);
}

function findLongestNegativeStreak(rows: RecentMatchFormRow[]): AnomalyItem | null {
  let best: {
    code: ReportTagCode;
    label: string;
    matchIds: string[];
  } | null = null;

  let i = 0;
  while (i < rows.length) {
    const code = rows[i].primaryTag.code;
    if (code === "good_game") {
      i += 1;
      continue;
    }
    const label = rows[i].primaryTag.label || tagLabel(code);
    const matchIds: string[] = [];
    let j = i;
    while (j < rows.length && rows[j].primaryTag.code === code) {
      matchIds.push(rows[j].matchId);
      j += 1;
    }
    if (matchIds.length >= STREAK_MIN) {
      if (!best || matchIds.length > best.matchIds.length) {
        best = { code, label, matchIds };
      }
      // 同长度时优先更靠前（更新）的一段：仅在更长时替换，故已满足
    }
    i = j;
  }

  if (!best) return null;
  return {
    type: "tag_streak",
    tagCode: best.code,
    tagLabel: best.label,
    count: best.matchIds.length,
    matchIds: best.matchIds,
  };
}

export function mapFormToOverallScore(status: FormStatusCode): number {
  if (status === "normal") return 72;
  if (status === "soft") return 52;
  return 32;
}

export function scoreFromRadar(radar: PlayerRadar | null | undefined): number | null {
  if (!radar) return null;
  const vals = [
    radar.survival,
    radar.aim,
    radar.landing,
    radar.endgame,
    radar.teamplay,
  ];
  if (vals.some((v) => !Number.isFinite(v))) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

export function buildPlayerFormAnalysis(input: {
  season: FormSeasonKpi | null;
  rows: RecentMatchFormRow[];
  radar?: PlayerRadar | null;
}): PlayerFormAnalysis {
  const agg = aggregateRecentKpi(input.rows);
  const recent: FormRecentKpi = {
    sampleSize: agg.sampleSize,
    kd: agg.kd,
    avgDamage: agg.avgDamage,
    avgRank: agg.avgRank,
    top10Rate: agg.top10Rate,
    wins: agg.wins,
  };
  const form = computeFormStatus(input.season, recent, {
    avgSurvivalRatio: agg.avgSurvivalRatio,
  });
  const anomalies = detectAnomalies(input.rows, {
    avgDamage: agg.avgDamage,
    avgKills: agg.avgKills,
  });
  const radarScore = scoreFromRadar(input.radar);
  const overallScore = radarScore ?? mapFormToOverallScore(form.status);

  return { form, anomalies, overallScore };
}

/** 从 MatchReport 列表构造行（需外部提供 playedAt / mapLabel） */
export function rowsFromReports(
  reports: MatchReport[],
  metaByMatchId: Map<string, { playedAt?: string; mapLabel?: string }>,
): RecentMatchFormRow[] {
  return reports.map((r) => {
    const meta = metaByMatchId.get(r.matchId);
    return {
      matchId: r.matchId,
      damage: r.metrics.damage,
      kills: r.metrics.kills,
      rank: r.metrics.rank,
      playedAt: meta?.playedAt,
      mapLabel: meta?.mapLabel,
      primaryTag: {
        code: r.primaryTag.code,
        label: r.primaryTag.label || tagLabel(r.primaryTag.code),
      },
      survivalRatio: r.metrics.survivalRatio,
    };
  });
}
