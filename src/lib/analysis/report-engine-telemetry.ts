import {
    generateNoTelemetryReport,
    type MatchReport,
    type MatchReportMetrics,
    type ReportTag,
    type ReportTagCode,
    RULE_VERSION_NO_TELEMETRY,
    type TagConfidence,
} from "@/lib/analysis/report-engine";
import type {PubgMatchDetail, PubgParticipant} from "@/lib/pubg/types";
import type {ParsedTelemetry, TelemetryEvent, TelemetryPosition, TelemetryZone,} from "@/lib/telemetry/types";

export const RULE_VERSION_TELEMETRY = "1.1.0-telemetry";

/** PUBG 坐标多为厘米；规则阈值用米 */
const CM_PER_M = 100;

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

const DEATH_WINDOW_SEC = 20;
const NEARBY_RADIUS_M = 80;
const ISOLATED_TEAMMATE_M = 150;
const LATE_ROTATE_OUTSIDE_M = 0;
const LATE_ROTATE_EDGE_M = 100;

type DeathContext = {
  deathT: number;
  deathX: number | null;
  deathY: number | null;
  killerId: string | null;
  weaponId: string | null;
  damageReason: string | null;
  attackerCountInWindow: number;
  enemiesNearbyAtDeath: number;
  teammateDistanceM: number | null;
  /** 正=圈外米数；负=圈内距边米数；null=无法算 */
  distanceToSafeEdgeM: number | null;
  outsideSafe: boolean;
};

function formatMmSs(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function distM(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy) / CM_PER_M;
}

function positionNearT(
  positions: TelemetryPosition[],
  accountId: string,
  t: number,
  maxDelta = 3,
): TelemetryPosition | null {
  let best: TelemetryPosition | null = null;
  let bestDelta = Infinity;
  for (const p of positions) {
    if (p.accountId !== accountId) continue;
    const d = Math.abs(p.t - t);
    if (d <= maxDelta && d < bestDelta) {
      best = p;
      bestDelta = d;
    }
  }
  return best;
}

function zoneNearT(
  zones: TelemetryZone[],
  t: number,
  type: "safe" | "blue",
): TelemetryZone | null {
  let best: TelemetryZone | null = null;
  for (const z of zones) {
    if (z.type !== type) continue;
    if (z.t > t + 2) break;
    if (z.t <= t + 2) best = z;
  }
  return best;
}

function isSquadLike(gameMode: string): boolean {
  const m = gameMode.toLowerCase();
  return (
    m.includes("squad") ||
    m.includes("duo") ||
    m.includes("trio") ||
    m.includes("team")
  );
}

function looksLikeThrowableWeapon(weaponId: string | null): boolean {
  if (!weaponId) return false;
  const w = weaponId.toLowerCase();
  return (
    w.includes("grenade") ||
    w.includes("molotov") ||
    w.includes("flashbang") ||
    w.includes("smoke") ||
    w.includes("stun") ||
    w.includes("c4") ||
    w.includes("projectile")
  );
}

function looksLikeCloseRangeDeath(
  weaponId: string | null,
  damageReason: string | null,
): boolean {
  const w = (weaponId ?? "").toLowerCase();
  const r = (damageReason ?? "").toLowerCase();
  if (r.includes("melee") || r.includes("punch")) return true;
  if (
    w.includes("shotgun") ||
    w.includes("smg") ||
    w.includes("pistol") ||
    w.includes("melee") ||
    w.includes("pan") ||
    w.includes("machete") ||
    w.includes("crowbar")
  ) {
    return true;
  }
  return false;
}

function findDeathEvent(
  events: TelemetryEvent[],
  accountId: string,
): TelemetryEvent | null {
  let kill: TelemetryEvent | null = null;
  let knock: TelemetryEvent | null = null;
  for (const e of events) {
    if (e.victimId !== accountId) continue;
    if (e.type === "kill") {
      if (!kill || e.t >= kill.t) kill = e;
    } else if (e.type === "knock") {
      if (!knock || e.t >= knock.t) knock = e;
    }
  }
  return kill ?? knock;
}

function buildDeathContext(
  telemetry: ParsedTelemetry,
  accountId: string,
  survivalHintSec: number,
): DeathContext | null {
  const deathEv = findDeathEvent(telemetry.events, accountId);
  const deathT =
    deathEv?.t ??
    (survivalHintSec > 0 ? survivalHintSec : telemetry.durationSec * 0.5);

  let deathX = deathEv?.x ?? null;
  let deathY = deathEv?.y ?? null;
  if (deathX == null || deathY == null) {
    const pos = positionNearT(telemetry.positions, accountId, deathT, 5);
    deathX = pos?.x ?? null;
    deathY = pos?.y ?? null;
  }

  const windowStart = deathT - DEATH_WINDOW_SEC;
  const attackers = new Set<string>();
  for (const e of telemetry.events) {
    if (e.t < windowStart || e.t > deathT + 1) continue;
    if (e.victimId !== accountId) continue;
    if ((e.type === "kill" || e.type === "knock") && e.attackerId) {
      if (e.attackerId !== accountId) attackers.add(e.attackerId);
    }
  }
  // 窗口内附近击杀/倒地的其他攻击者（第三人迹象）
  if (deathX != null && deathY != null) {
    for (const e of telemetry.events) {
      if (e.t < windowStart || e.t > deathT + 1) continue;
      if (e.type !== "kill" && e.type !== "knock") continue;
      if (!e.attackerId || e.attackerId === accountId) continue;
      if (e.x == null || e.y == null) continue;
      if (distM(deathX, deathY, e.x, e.y) <= NEARBY_RADIUS_M) {
        attackers.add(e.attackerId);
      }
    }
  }

  const focusTeam =
    telemetry.players.find((p) => p.accountId === accountId)?.teamId ?? null;
  const teammateIds = new Set(
    telemetry.players
      .filter(
        (p) =>
          p.accountId !== accountId &&
          focusTeam != null &&
          p.teamId === focusTeam,
      )
      .map((p) => p.accountId),
  );

  let enemiesNearby = 0;
  let teammateDistanceM: number | null = null;
  if (deathX != null && deathY != null) {
    const seenEnemy = new Set<string>();
    for (const p of telemetry.players) {
      if (p.accountId === accountId) continue;
      if (teammateIds.has(p.accountId)) continue;
      const pos = positionNearT(telemetry.positions, p.accountId, deathT, 3);
      if (!pos) continue;
      if (distM(deathX, deathY, pos.x, pos.y) <= NEARBY_RADIUS_M) {
        if (!seenEnemy.has(p.accountId)) {
          seenEnemy.add(p.accountId);
          enemiesNearby += 1;
        }
      }
    }
    let minTeammate = Infinity;
    for (const tid of teammateIds) {
      const pos = positionNearT(telemetry.positions, tid, deathT, 5);
      if (!pos) continue;
      const d = distM(deathX, deathY, pos.x, pos.y);
      if (d < minTeammate) minTeammate = d;
    }
    if (Number.isFinite(minTeammate)) teammateDistanceM = minTeammate;
  }

  let distanceToSafeEdgeM: number | null = null;
  let outsideSafe = false;
  if (deathX != null && deathY != null) {
    const safe = zoneNearT(telemetry.zones, deathT, "safe");
    if (safe && safe.radius > 0) {
      const toCenter = distM(deathX, deathY, safe.x, safe.y);
      const edge = toCenter - safe.radius / CM_PER_M;
      distanceToSafeEdgeM = edge;
      outsideSafe = edge > LATE_ROTATE_OUTSIDE_M;
    }
  }

  return {
    deathT,
    deathX,
    deathY,
    killerId: deathEv?.attackerId ?? null,
    weaponId: deathEv?.weaponId ?? null,
    damageReason: deathEv?.damageReason ?? null,
    attackerCountInWindow: attackers.size,
    enemiesNearbyAtDeath: enemiesNearby,
    teammateDistanceM,
    distanceToSafeEdgeM,
    outsideSafe,
  };
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

function overallConfidence(
  tags: ReportTag[],
  primary: ReportTag,
): TagConfidence {
  if (tags.some((t) => t.confidence === "high")) return primary.confidence;
  if (tags.some((t) => t.confidence === "medium")) return "medium";
  return "low";
}

function bumpConfidence(
  c: TagConfidence,
  to: TagConfidence,
): TagConfidence {
  return CONFIDENCE_RANK[to] > CONFIDENCE_RANK[c] ? to : c;
}

function upsertTag(tags: ReportTag[], next: ReportTag): void {
  const i = tags.findIndex((t) => t.code === next.code);
  if (i < 0) {
    tags.push(next);
    return;
  }
  const prev = tags[i];
  tags[i] = {
    ...prev,
    confidence: bumpConfidence(prev.confidence, next.confidence),
    label: next.label || prev.label,
  };
}

function removeTag(tags: ReportTag[], code: ReportTagCode): void {
  const i = tags.findIndex((t) => t.code === code);
  if (i >= 0) tags.splice(i, 1);
}

function deathContextPhrase(ctx: DeathContext): string {
  if (ctx.outsideSafe) return "圈外";
  if (ctx.attackerCountInWindow >= 2 || ctx.enemiesNearbyAtDeath >= 3) {
    return "被多人集火";
  }
  if (ctx.teammateDistanceM != null && ctx.teammateDistanceM >= ISOLATED_TEAMMATE_M) {
    return "脱离队伍";
  }
  if (ctx.attackerCountInWindow >= 1) return "交火";
  return "战斗";
}

function buildTelemetrySummary(
  metrics: MatchReportMetrics,
  tags: ReportTag[],
  ctx: DeathContext,
): string[] {
  const rankText =
    metrics.rank == null ? "未知排名" : `Top${metrics.rank}`;
  const lines: string[] = [
    `【已结合遥测】存活至 ${rankText}，约 ${formatMmSs(ctx.deathT)} 处${deathContextPhrase(ctx)}阵亡`,
    `本场伤害 ${Math.round(metrics.damage)}，击杀 ${metrics.kills}，助攻 ${metrics.assists}`,
  ];

  if (ctx.enemiesNearbyAtDeath > 0 || ctx.attackerCountInWindow > 0) {
    lines.push(
      `死亡窗口约 ${DEATH_WINDOW_SEC}s：附近敌人 ${ctx.enemiesNearbyAtDeath}，攻击者 ${ctx.attackerCountInWindow}`,
    );
  }
  if (ctx.distanceToSafeEdgeM != null) {
    const edge = Math.round(ctx.distanceToSafeEdgeM);
    lines.push(
      edge > 0
        ? `死亡点在安全区外约 ${edge}m`
        : `死亡点距安全区边缘约 ${Math.abs(edge)}m（区内）`,
    );
  }
  if (ctx.teammateDistanceM != null) {
    lines.push(`阵亡时最近队友约 ${Math.round(ctx.teammateDistanceM)}m`);
  }

  const codes = new Set(tags.map((t) => t.code));
  if (codes.has("mid_third_party")) {
    lines.push("中期死亡窗口多攻击者/附近敌人，疑似第三人局");
  } else if (codes.has("mid_overfight")) {
    lines.push("中期有一定输出但排名不佳，交火决策偏激进");
  }
  if (codes.has("late_rotate")) {
    lines.push("死亡点相对安全区偏外或贴边，收边偏晚");
  }
  if (codes.has("isolated_death")) {
    lines.push("阵亡时与队友距离过大，协同不足");
  }
  if (codes.has("hot_drop")) {
    lines.push("开局很快出局且死亡点附近敌情密集，热点落地特征明显");
  } else if (codes.has("early_exit")) {
    lines.push("前 25% 对局时长内出局且排名靠后");
  }
  if (codes.has("low_damage")) {
    lines.push("存活过半但对局伤害偏低，有效交战不足");
  }
  if (codes.has("aim_inconsistent")) {
    lines.push("伤害尚可但击杀转化偏低，枪感/距离选择可能不稳");
  }
  if (codes.has("endgame_nades")) {
    lines.push("决赛阶段近距离阵亡且未见投掷相关痕迹（弱证据）");
  }
  if (codes.has("good_game")) {
    lines.push(
      metrics.rank === 1
        ? "本场吃鸡，整体表现优质"
        : "高排名且高伤害，本场表现优质",
    );
  }

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
    out.push("结合回放核对关键交火帧，巩固本场决策优势");
  }
  return out;
}

/**
 * 遥测增强复盘：在无遥测规则基础上叠加死亡时刻特征。
 * 解析异常时由调用方降级到 generateNoTelemetryReport。
 */
export function generateTelemetryReport(
  match: PubgMatchDetail,
  accountId: string,
  participant: PubgParticipant,
  telemetry: ParsedTelemetry,
): MatchReport {
  const base = generateNoTelemetryReport(match, accountId, participant);
  const tags: ReportTag[] = base.tags.map((t) => ({ ...t }));
  const metrics: MatchReportMetrics = { ...base.metrics };
  const phase = metrics.phase;
  const winPlace = metrics.rank;
  const ctx = buildDeathContext(
    telemetry,
    accountId,
    participant.survivalTimeSec,
  );

  if (!ctx) {
    return {
      ...base,
      ruleVersion: RULE_VERSION_TELEMETRY,
      degraded: false,
      summaryLines: base.summaryLines.map((l) =>
        l.includes("初判")
          ? l.replace("【基于基础战绩的初判】", "【已结合遥测】").replace(
              "（无遥测，死亡情境待增强）",
              "（死亡事件不足，部分情境弱化）",
            )
          : l,
      ),
      generatedAt: new Date().toISOString(),
    };
  }

  // 提升原 early / hot_drop / mid_overfight 置信度
  if (phase === "early") {
    const hot = tags.find((t) => t.code === "hot_drop");
    const early = tags.find((t) => t.code === "early_exit");
    if (hot && (ctx.enemiesNearbyAtDeath >= 2 || ctx.attackerCountInWindow >= 1)) {
      upsertTag(tags, {
        code: "hot_drop",
        label: TAG_LABEL.hot_drop,
        confidence: "high",
      });
    } else if (early) {
      upsertTag(tags, {
        code: "early_exit",
        label: TAG_LABEL.early_exit,
        confidence: bumpConfidence(early.confidence, "high"),
      });
    }
  }

  // mid_third_party
  if (
    phase === "mid" &&
    (ctx.enemiesNearbyAtDeath >= 3 || ctx.attackerCountInWindow >= 2)
  ) {
    upsertTag(tags, {
      code: "mid_third_party",
      label: TAG_LABEL.mid_third_party,
      confidence: "high",
    });
    removeTag(tags, "mid_overfight");
  } else if (phase === "mid") {
    const mid = tags.find((t) => t.code === "mid_overfight");
    if (mid && (ctx.attackerCountInWindow >= 1 || metrics.damage >= 300)) {
      upsertTag(tags, {
        code: "mid_overfight",
        label: TAG_LABEL.mid_overfight,
        confidence: bumpConfidence(mid.confidence, "medium"),
      });
    }
  }

  // late_rotate
  if (ctx.distanceToSafeEdgeM != null) {
    if (
      ctx.outsideSafe ||
      ctx.distanceToSafeEdgeM > LATE_ROTATE_OUTSIDE_M ||
      (ctx.distanceToSafeEdgeM > -LATE_ROTATE_EDGE_M &&
        ctx.distanceToSafeEdgeM <= LATE_ROTATE_OUTSIDE_M &&
        phase !== "early")
    ) {
      const conf: TagConfidence =
        ctx.outsideSafe || ctx.distanceToSafeEdgeM > 50 ? "high" : "medium";
      if (ctx.outsideSafe || ctx.distanceToSafeEdgeM >= -LATE_ROTATE_EDGE_M) {
        upsertTag(tags, {
          code: "late_rotate",
          label: TAG_LABEL.late_rotate,
          confidence: conf,
        });
      }
    }
  } else if (
    phase === "late" &&
    metrics.rideDistance < 400 &&
    winPlace != null &&
    winPlace >= 8 &&
    winPlace <= 25
  ) {
    upsertTag(tags, {
      code: "late_rotate",
      label: TAG_LABEL.late_rotate,
      confidence: "low",
    });
  }

  // endgame_nades：无投掷使用事件时，仅在近战死亡弱提示
  if (
    phase === "late" &&
    winPlace != null &&
    winPlace <= 10 &&
    looksLikeCloseRangeDeath(ctx.weaponId, ctx.damageReason) &&
    !looksLikeThrowableWeapon(ctx.weaponId)
  ) {
    upsertTag(tags, {
      code: "endgame_nades",
      label: TAG_LABEL.endgame_nades,
      confidence: "low",
    });
  }

  // isolated_death
  if (
    isSquadLike(match.gameMode) &&
    ctx.teammateDistanceM != null &&
    ctx.teammateDistanceM >= ISOLATED_TEAMMATE_M
  ) {
    upsertTag(tags, {
      code: "isolated_death",
      label: TAG_LABEL.isolated_death,
      confidence: "medium",
    });
  }

  if (tags.length === 0) {
    tags.push({
      code: "mid_overfight",
      label: TAG_LABEL.mid_overfight,
      confidence: "low",
    });
  }

  const primaryTag = pickPrimary(tags);
  return {
    matchId: match.matchId,
    accountId,
    primaryTag,
    tags,
    summaryLines: buildTelemetrySummary(metrics, tags, ctx),
    suggestions: buildSuggestions(tags),
    metrics,
    confidence: overallConfidence(tags, primaryTag),
    ruleVersion: RULE_VERSION_TELEMETRY,
    generatedAt: new Date().toISOString(),
    degraded: false,
  };
}

/** 供测试/调试：暴露规则版本对照 */
export function isTelemetryRuleVersion(v: string): boolean {
  return v === RULE_VERSION_TELEMETRY;
}

export function isNoTelemetryRuleVersion(v: string): boolean {
  return v === RULE_VERSION_NO_TELEMETRY;
}
