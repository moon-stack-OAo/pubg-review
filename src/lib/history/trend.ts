/** 近 N 天按日聚合趋势（仅用本地已有对局字段，不额外打官方） */

export type TrendPoint = {
  date: string;
  kd: number | null;
  avgDamage: number | null;
  avgRank: number | null;
};

export type PlayerTrend = {
  granularity: "day";
  points: TrendPoint[];
};

export type TrendMatchInput = {
  matchId: string;
  playedAt: string;
  kills: number;
  damage: number;
  rank: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

function toDateKey(timestamp: number): string {
  return new Date(timestamp + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * 近 `days` 天按日聚合：kd≈（击杀/非吃鸡场次）、场均伤害、平均排名。
 * 同一 matchId 去重；包含今天的上海日历日，无数据日期保留 null。
 */
export function buildDailyTrend(
  matches: TrendMatchInput[],
  days = 14,
  options: { now?: number } = {},
): PlayerTrend {
  const now = options.now ?? Date.now();
  const dayCount = Number.isFinite(days) ? Math.max(1, Math.floor(days)) : 14;
  const today = Math.floor((now + SHANGHAI_OFFSET_MS) / DAY_MS) * DAY_MS - SHANGHAI_OFFSET_MS;
  const cutoff = today - (dayCount - 1) * DAY_MS;
  const byId = new Map<string, TrendMatchInput>();
  for (const m of matches) {
    const t = Date.parse(m.playedAt);
    if (!Number.isFinite(t) || t < cutoff || t > now) continue;
    if (!byId.has(m.matchId)) byId.set(m.matchId, m);
  }

  type Acc = {
    kills: number;
    damage: number;
    rankSum: number;
    rankCount: number;
    deathsApprox: number;
    matches: number;
  };
  const byDay = new Map<string, Acc>();

  for (const m of byId.values()) {
    const date = toDateKey(Date.parse(m.playedAt));
    let row = byDay.get(date);
    if (!row) {
      row = {
        kills: 0,
        damage: 0,
        rankSum: 0,
        rankCount: 0,
        deathsApprox: 0,
        matches: 0,
      };
      byDay.set(date, row);
    }
    row.matches += 1;
    row.kills += m.kills;
    row.damage += m.damage;
    if (m.rank != null) {
      row.rankSum += m.rank;
      row.rankCount += 1;
      if (m.rank > 1) row.deathsApprox += 1;
    }
  }

  const points: TrendPoint[] = Array.from(
    { length: dayCount },
    (_, index) => {
      const date = toDateKey(cutoff + index * DAY_MS);
      const r = byDay.get(date);
      if (!r) return { date, kd: null, avgDamage: null, avgRank: null };
      let kd: number | null = null;
      if (r.deathsApprox > 0) kd = Number((r.kills / r.deathsApprox).toFixed(2));
      else if (r.kills > 0) kd = Number(r.kills.toFixed(2));
      else if (r.matches > 0) kd = 0;

      return {
        date,
        kd,
        avgDamage:
          r.matches > 0 ? Number((r.damage / r.matches).toFixed(1)) : null,
        avgRank:
          r.rankCount > 0
            ? Number((r.rankSum / r.rankCount).toFixed(1))
            : null,
      };
    },
  );

  return { granularity: "day", points };
}
