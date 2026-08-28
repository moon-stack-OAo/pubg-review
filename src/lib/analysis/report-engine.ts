import type {PubgMatchDetail, PubgParticipant} from "@/lib/pubg/types";

export const RULE_VERSION_NO_TELEMETRY = "1.0.0-no-telemetry";

export type TagConfidence = "high" | "medium" | "low";

export type ReportTagCode =
  | "hot_drop"
  | "early_exit"
  | "mid_overfight"
  | "mid_third_party"
  | "late_rotate"
  | "endgame_nades"
  | "isolated_death"
  | "aim_inconsistent"
  | "low_damage"
  | "good_game";

export type ReportTag = {
  code: ReportTagCode;
  label: string;
  confidence: TagConfidence;
};

export type MatchReportMetrics = {
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
  phase: "early" | "mid" | "late";
};

export type MatchReport = {
  matchId: string;
  accountId: string;
  primaryTag: ReportTag;
  tags: ReportTag[];
  summaryLines: string[];
  suggestions: string[];
  metrics: MatchReportMetrics;
  confidence: TagConfidence;
  ruleVersion: string;
  generatedAt: string;
  /** true=无遥测降级；false=已结合遥测增强 */
  degraded: boolean;
};

const TAG_LABEL: Record<ReportTagCode, string> = {
  hot_drop: "落点过热",
  early_exit: "前期出局",
  mid_overfight: "中期硬刚",
  mid_third_party: "中期第三人",
  late_rotate: "收边偏晚",
  endgame_nades: "决赛圈投掷不足",
  isolated_death: "脱离队伍",
  aim_inconsistent: "枪感不稳",
  low_damage: "输出不足",
  good_game: "优质对局",
};

const SUGGESTION: Partial<Record<ReportTagCode, string>> = {
  hot_drop: "改跳次热点或绕点，前 3 分钟以拾取为主少求打",
  early_exit: "开局优先安全发育，避免不必要的早期混战",
  mid_overfight: "中期交火先听枪位，避免平原无掩体延战",
  mid_third_party: "中期交火先听枪位，避免平原无掩体延战",
  late_rotate: "提前 1 个阶段向边路转移，减少追圈",
  endgame_nades: "决赛圈至少保留 2 颗投掷物再找身位",
  isolated_death: "转点与队友保持可视距离，少独自探点",
  low_damage: "增加有效交战，避免无效绕图",
  aim_inconsistent: "优先保证枪枪有效伤害，减少远距离无效消耗",
  good_game: "保持节奏：高伤高排可复盘关键交火决策巩固优势",
};

/** 负向主因权重：数值越大越优先 */
const NEGATIVE_WEIGHT: Partial<Record<ReportTagCode, number>> = {
  hot_drop: 100,
  mid_third_party: 95,
  early_exit: 90,
  late_rotate: 85,
  endgame_nades: 80,
  mid_overfight: 70,
  isolated_death: 60,
  aim_inconsistent: 50,
  low_damage: 40,
};

const CONFIDENCE_RANK: Record<TagConfidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function formatMmSs(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function resolvePhase(
  survivalTimeSec: number,
  durationSec: number,
): "early" | "mid" | "late" {
  const d = Math.max(durationSec, 1);
  const ratio = survivalTimeSec / d;
  if (ratio < 0.25) return "early";
  if (ratio < 0.7) return "mid";
  return "late";
}

function pickPrimary(tags: ReportTag[]): ReportTag {
  const negatives = tags.filter((t) => t.code !== "good_game");
  if (negatives.length > 0) {
    return [...negatives].sort((a, b) => {
      const confDiff =
        CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
      if (confDiff !== 0) return confDiff;
      return (NEGATIVE_WEIGHT[b.code] ?? 0) - (NEGATIVE_WEIGHT[a.code] ?? 0);
    })[0];
  }
  return tags[0];
}

function overallConfidence(tags: ReportTag[], primary: ReportTag): TagConfidence {
  if (tags.some((t) => t.confidence === "high")) return primary.confidence;
  if (tags.some((t) => t.confidence === "medium")) return "medium";
  return "low";
}

function buildSummary(
  participant: PubgParticipant,
  metrics: MatchReportMetrics,
  tags: ReportTag[],
): string[] {
  const rankText =
    metrics.rank == null ? "未知排名" : `Top${metrics.rank}`;
  const lines: string[] = [
    `【基于基础战绩的初判】存活至 ${rankText}，约 ${formatMmSs(metrics.survivalTimeSec)} 处阵亡（无遥测，死亡情境待增强）`,
    `本场伤害 ${Math.round(metrics.damage)}，击杀 ${metrics.kills}，助攻 ${metrics.assists}`,
  ];

  const codes = new Set(tags.map((t) => t.code));
  if (codes.has("hot_drop")) {
    lines.push("开局位移短且很快出局，疑似热点落地混战（弱化判定）");
  } else if (codes.has("early_exit")) {
    lines.push("前 25% 对局时长内出局且排名靠后");
  }
  if (codes.has("mid_overfight")) {
    lines.push("中期有一定输出但排名不佳，疑似硬刚翻车（低置信）");
  }
  if (codes.has("low_damage")) {
    lines.push("存活过半但对局伤害偏低，有效交战不足");
  }
  if (codes.has("aim_inconsistent")) {
    lines.push("伤害尚可但击杀转化偏低，枪感/距离选择可能不稳");
  }
  if (codes.has("good_game")) {
    lines.push(
      metrics.rank === 1
        ? "本场吃鸡，整体表现优质"
        : "高排名且高伤害，本场表现优质",
    );
  }

  void participant;
  return lines;
}

function buildSuggestions(tags: ReportTag[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const text = SUGGESTION[tag.code];
    if (text && !seen.has(text)) {
      seen.add(text);
      out.push(text);
    }
  }
  if (out.length === 0) {
    out.push("加载回放/遥测后可给出更精确的落点与收边建议");
  }
  return out;
}

/**
 * 无遥测降级版复盘引擎：仅用 match + participant 统计。
 */
export function generateNoTelemetryReport(
  match: PubgMatchDetail,
  accountId: string,
  participant: PubgParticipant,
): MatchReport {
  const durationSec = Math.max(match.durationSec, 1);
  const survivalTimeSec = Math.max(participant.survivalTimeSec, 0);
  const winPlace = participant.winPlace;
  const kills = participant.kills;
  const damageDealt = participant.damageDealt;
  const walkDistance = participant.walkDistance;
  const phase = resolvePhase(survivalTimeSec, durationSec);
  const survivalRatio = survivalTimeSec / durationSec;

  const tags: ReportTag[] = [];

  // 1) 落点过热 / 前期出局（无遥测弱化）
  if (phase === "early" && (winPlace == null || winPlace >= 40) && kills <= 1) {
    if (walkDistance < 200 && survivalTimeSec < 180) {
      tags.push({
        code: "hot_drop",
        label: TAG_LABEL.hot_drop,
        confidence: "medium",
      });
    } else {
      tags.push({
        code: "early_exit",
        label: TAG_LABEL.early_exit,
        confidence: "medium",
      });
    }
  }

  // 2) 中期硬刚（无遥测只能 low confidence）
  if (
    phase === "mid" &&
    damageDealt >= 300 &&
    (winPlace == null || winPlace > 10) &&
    kills <= 2
  ) {
    tags.push({
      code: "mid_overfight",
      label: TAG_LABEL.mid_overfight,
      confidence: "low",
    });
  }

  // 5) 输出问题
  if (survivalTimeSec >= 0.5 * durationSec && damageDealt < 150) {
    tags.push({
      code: "low_damage",
      label: TAG_LABEL.low_damage,
      confidence: "high",
    });
  }
  if (damageDealt >= 400 && kills <= 1) {
    tags.push({
      code: "aim_inconsistent",
      label: TAG_LABEL.aim_inconsistent,
      confidence: "medium",
    });
  }

  // 7) 正向
  if (
    winPlace === 1 ||
    (winPlace != null && winPlace <= 3 && damageDealt >= 500)
  ) {
    tags.push({
      code: "good_game",
      label: TAG_LABEL.good_game,
      confidence: "high",
    });
  }

  // 兜底：保证至少 1 个主因标签
  if (tags.length === 0) {
    if (phase === "early") {
      tags.push({
        code: "early_exit",
        label: TAG_LABEL.early_exit,
        confidence: "low",
      });
    } else if (damageDealt < 250) {
      tags.push({
        code: "low_damage",
        label: TAG_LABEL.low_damage,
        confidence: "low",
      });
    } else {
      tags.push({
        code: "mid_overfight",
        label: TAG_LABEL.mid_overfight,
        confidence: "low",
      });
    }
  }

  const primaryTag = pickPrimary(tags);
  const metrics: MatchReportMetrics = {
    rank: winPlace,
    kills,
    assists: participant.assists,
    damage: damageDealt,
    survivalTimeSec,
    durationSec,
    walkDistance,
    rideDistance: participant.rideDistance,
    headshotKills: participant.headshotKills,
    survivalRatio,
    phase,
  };

  return {
    matchId: match.matchId,
    accountId,
    primaryTag,
    tags,
    summaryLines: buildSummary(participant, metrics, tags),
    suggestions: buildSuggestions(tags),
    metrics,
    confidence: overallConfidence(tags, primaryTag),
    ruleVersion: RULE_VERSION_NO_TELEMETRY,
    generatedAt: new Date().toISOString(),
    degraded: true,
  };
}

export function tagLabel(code: ReportTagCode): string {
  return TAG_LABEL[code];
}
