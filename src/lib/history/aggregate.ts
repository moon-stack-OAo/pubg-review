import type {
    HistoryMatchRecord,
    MapAggRow,
    ParticipantCombatAgg,
    WeaponAggRow,
    WeaponsTabData,
    WindowKpi,
} from "@/lib/history/types";
import {mapLabel} from "@/lib/pubg/maps";
import type {ParsedTelemetry} from "@/lib/telemetry/types";

export function filterByGameMode(
  matches: HistoryMatchRecord[],
  gameMode?: string,
): HistoryMatchRecord[] {
  if (!gameMode) return matches;
  return matches.filter((m) => m.gameMode === gameMode);
}

/** 按 playedAt 过滤半开区间 [sinceMs, untilMs)；非法时间戳的场次丢弃 */
export function filterByPlayedAtWindow<T extends { playedAt: string }>(
  matches: T[],
  sinceMs: number,
  untilMs = Date.now(),
): T[] {
  return matches.filter((m) => {
    const t = Date.parse(m.playedAt);
    if (!Number.isFinite(t)) return false;
    return t >= sinceMs && t < untilMs;
  });
}

export function isPlayedAtInWindow(
  playedAt: string,
  sinceMs: number,
  untilMs = Date.now(),
): boolean {
  const t = Date.parse(playedAt);
  if (!Number.isFinite(t)) return false;
  return t >= sinceMs && t < untilMs;
}

export function aggregateWindowKpi(matches: HistoryMatchRecord[]): WindowKpi {
  const n = matches.length;
  if (n === 0) {
    return {
      matches: 0,
      kd: null,
      winRate: null,
      avgDamage: null,
      avgRank: null,
      avgKills: null,
      top10Rate: null,
      wins: 0,
      totalKills: 0,
      totalDamage: 0,
    };
  }

  let kills = 0;
  let damage = 0;
  let wins = 0;
  let top10 = 0;
  let rankSum = 0;
  let rankCount = 0;
  let deathsApprox = 0;

  for (const m of matches) {
    kills += m.kills;
    damage += m.damage;
    if (m.rank === 1) wins += 1;
    if (m.rank != null && m.rank <= 10) top10 += 1;
    if (m.rank != null) {
      rankSum += m.rank;
      rankCount += 1;
      if (m.rank > 1) deathsApprox += 1;
    }
  }

  const kd =
    deathsApprox > 0
      ? Number((kills / deathsApprox).toFixed(2))
      : kills > 0
        ? Number(kills.toFixed(2))
        : 0;

  return {
    matches: n,
    kd,
    winRate: Number((wins / n).toFixed(4)),
    avgDamage: Number((damage / n).toFixed(1)),
    avgRank: rankCount > 0 ? Number((rankSum / rankCount).toFixed(1)) : null,
    avgKills: Number((kills / n).toFixed(2)),
    top10Rate: Number((top10 / n).toFixed(4)),
    wins,
    totalKills: kills,
    totalDamage: Number(damage.toFixed(1)),
  };
}

export function aggregateMaps(matches: HistoryMatchRecord[]): MapAggRow[] {
  const byMap = new Map<
    string,
    {
      mapName: string;
      matches: number;
      rankSum: number;
      rankCount: number;
      kills: number;
      damage: number;
      wins: number;
      deathsApprox: number;
    }
  >();

  for (const m of matches) {
    const key = m.mapName || "Unknown";
    let row = byMap.get(key);
    if (!row) {
      row = {
        mapName: key,
        matches: 0,
        rankSum: 0,
        rankCount: 0,
        kills: 0,
        damage: 0,
        wins: 0,
        deathsApprox: 0,
      };
      byMap.set(key, row);
    }
    row.matches += 1;
    row.kills += m.kills;
    row.damage += m.damage;
    if (m.rank != null) {
      row.rankSum += m.rank;
      row.rankCount += 1;
      if (m.rank === 1) row.wins += 1;
      // 近似死亡：非吃鸡视为至少 1 死（粗略）
      if (m.rank > 1) row.deathsApprox += 1;
    }
  }

  return Array.from(byMap.values())
    .map((r) => {
      const avgRank =
        r.rankCount > 0 ? r.rankSum / r.rankCount : null;
      const kdApprox =
        r.deathsApprox > 0
          ? r.kills / r.deathsApprox
          : r.kills > 0
            ? r.kills
            : 0;
      return {
        mapName: r.mapName,
        mapLabel: mapLabel(r.mapName),
        matches: r.matches,
        avgRank,
        kdApprox,
        avgDamage: r.matches > 0 ? r.damage / r.matches : null,
        winRate: r.matches > 0 ? r.wins / r.matches : null,
        totalKills: r.kills,
        totalDamage: r.damage,
        wins: r.wins,
      } satisfies MapAggRow;
    })
    .sort((a, b) => b.matches - a.matches);
}

export function aggregateParticipantCombat(
  matches: HistoryMatchRecord[],
): ParticipantCombatAgg {
  const n = matches.length;
  let kills = 0;
  let assists = 0;
  let damage = 0;
  let headshotKills = 0;
  for (const m of matches) {
    kills += m.kills;
    assists += m.assists;
    damage += m.damage;
    headshotKills += m.headshotKills;
  }
  return {
    matches: n,
    kills,
    assists,
    damage,
    headshotKills,
    avgDamage: n > 0 ? damage / n : null,
    avgKills: n > 0 ? kills / n : null,
    headshotRate: kills > 0 ? headshotKills / kills : null,
  };
}

function weaponLabel(weaponId: string): string {
  if (!weaponId) return "未知";
  // Item_Weapon_AK47_C → AK47
  const m = weaponId.match(/Item_Weapon_(.+?)_C$/i);
  if (m) return m[1].replace(/_/g, " ");
  return weaponId.replace(/^Item_/, "").replace(/_C$/, "");
}

export function aggregateWeaponsFromTelemetry(
  parsedList: ParsedTelemetry[],
  accountId: string,
): WeaponAggRow[] {
  const map = new Map<string, WeaponAggRow>();
  for (const parsed of parsedList) {
    for (const ev of parsed.events) {
      if (ev.type !== "kill" && ev.type !== "knock") continue;
      if (ev.attackerId !== accountId) continue;
      const wid = ev.weaponId?.trim() || "unknown";
      let row = map.get(wid);
      if (!row) {
        row = {
          weaponId: wid,
          label: weaponLabel(wid),
          kills: 0,
          knocks: 0,
        };
        map.set(wid, row);
      }
      if (ev.type === "kill") row.kills += 1;
      else row.knocks += 1;
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => b.kills + b.knocks - (a.kills + a.knocks),
  );
}

export function buildWeaponsTabData(
  matches: HistoryMatchRecord[],
  weapons: WeaponAggRow[],
  telemetrySampleCount: number,
): WeaponsTabData {
  const combat = aggregateParticipantCombat(matches);
  const sampleSize = matches.length;
  const parsedCount = telemetrySampleCount;

  if (weapons.length > 0) {
    return {
      source:
        parsedCount > 0 && parsedCount < sampleSize ? "mixed" : "telemetry",
      note:
        parsedCount < sampleSize
          ? `已解析遥测 ${parsedCount}/${sampleSize} 场；完整武器明细需更多场次 telemetry。`
          : `已解析 ${parsedCount}/${sampleSize} 场。武器明细来自 telemetry 击杀/倒地事件。`,
      combat,
      weapons,
      sampleSize,
      parsedCount,
    };
  }

  if (parsedCount === 0) {
    return {
      source: "participant",
      note:
        sampleSize === 0
          ? "本地历史库暂无对局。请先到概览同步近况。"
          : `近 ${sampleSize} 场均未解析遥测。打开近期对局的事件轴/回放可触发自动解析，完成后再回本 Tab。`,
      combat,
      weapons: [],
      sampleSize,
      parsedCount,
    };
  }

  return {
    source: "participant",
    note: `已解析 ${parsedCount}/${sampleSize} 场遥测，但暂无可用武器击杀/倒地事件；当前仅展示 participant 聚合（伤害/击杀/爆头）。`,
    combat,
    weapons: [],
    sampleSize,
    parsedCount,
  };
}
