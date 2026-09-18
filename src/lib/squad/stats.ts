import {BizError} from "@/lib/errors";
import {isPlayedAtInWindow} from "@/lib/history/aggregate";
import {
  clampWindowHours,
  DEFAULT_WINDOW_HOURS,
  resolveWindowBounds,
  type WindowBounds,
} from "@/lib/history/service";
import {
  readPersistedSquad,
  squadCacheHash,
  toSecondIso,
  writePersistedSquad,
} from "@/lib/persist/squad-store";
import {mapLabel} from "@/lib/pubg/maps";
import {getCachedPlayer} from "@/lib/pubg/service";
import type {PubgMatchDetail, PubgParticipant, PubgPlatform,} from "@/lib/pubg/types";
import {collectCandidateMatchIds, loadMatchPreferDisk,} from "@/lib/squad/detect-mates";
import type {
    GetSquadStatsInput,
    SquadMatchRow,
    SquadMemberRef,
    SquadMemberStats,
    SquadSampleMeta,
    SquadStatsResult,
} from "@/lib/squad/types";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 32;
/** 时间窗模式下多扫一些候选，避免近 N 场都落在窗外 */
const WINDOW_SCAN_LIMIT = 32;
const MAX_MATES = 3;
/** 场均击杀/伤害低于队内均值该比例视为贡献偏低 */
const LOW_CONTRIB_RATIO = 0.6;
/** 齐全率阈值 */
const FULL_RATE_HIGH = 0.6;
const FULL_RATE_LOW = 0.3;
/** 平均队排偏高（名次数字大）提示阈值 */
const AVG_RANK_HIGH = 15;

function clampLimit(raw?: number): number {
  if (raw == null || !Number.isFinite(raw)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(raw), 1), MAX_LIMIT);
}

function parseNameList(names?: string[]): string[] {
  if (!names?.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const n of names) {
    const t = n.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function parseIdList(ids?: string[]): string[] {
  if (!ids?.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const t = id.trim();
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function findRosterOf(
  match: PubgMatchDetail,
  accountId: string,
): PubgMatchDetail["rosters"][number] | null {
  for (const roster of match.rosters) {
    if (roster.participants.some((p) => p.accountId === accountId)) {
      return roster;
    }
  }
  return null;
}

function participantByAccount(
  roster: PubgMatchDetail["rosters"][number],
  accountId: string,
): PubgParticipant | undefined {
  return roster.participants.find((p) => p.accountId === accountId);
}

function avg(sum: number, n: number): number | null {
  if (n <= 0) return null;
  return Number((sum / n).toFixed(2));
}

function rate(num: number, den: number): number | null {
  if (den <= 0) return null;
  return Number((num / den).toFixed(4));
}

/** squad 匹配 squad/squad-fpp；duo 匹配 duo/duo-fpp；精确值仍精确匹配 */
function matchGameModeFamily(
  matchGameMode: string,
  filter: string | null,
): boolean {
  if (!filter) return true;
  const m = matchGameMode.toLowerCase();
  const f = filter.toLowerCase();
  if (m === f) return true;
  if (f === "squad" || f === "duo" || f === "solo") {
    return m === f || m.startsWith(`${f}-`);
  }
  return false;
}

type Acc = {
  accountId: string;
  name: string;
  games: number;
  kills: number;
  assists: number;
  damage: number;
  survivalSum: number;
  rankSum: number;
  rankCount: number;
  top10: number;
  wins: number;
};

function emptyAcc(ref: SquadMemberRef): Acc {
  return {
    accountId: ref.accountId,
    name: ref.name,
    games: 0,
    kills: 0,
    assists: 0,
    damage: 0,
    survivalSum: 0,
    rankSum: 0,
    rankCount: 0,
    top10: 0,
    wins: 0,
  };
}

async function resolveMates(
  platform: PubgPlatform,
  playerAccountId: string,
  playerName: string,
  mateNames: string[],
  mateAccountIds: string[],
): Promise<SquadMemberRef[]> {
  const refs: SquadMemberRef[] = [];
  const seen = new Set<string>([playerAccountId]);

  // 昵称优先（可解析真实 name）；再补 accountId
  for (const mateName of mateNames) {
    if (refs.length >= MAX_MATES) break;
    if (mateName.toLowerCase() === playerName.toLowerCase()) {
      throw new BizError("队友昵称不能与主玩家相同");
    }
    const { value: mate } = await getCachedPlayer(platform, mateName);
    if (seen.has(mate.accountId)) continue;
    seen.add(mate.accountId);
    refs.push({ accountId: mate.accountId, name: mate.name });
  }

  for (const id of mateAccountIds) {
    if (seen.has(id)) continue;
    if (refs.length >= MAX_MATES) break;
    seen.add(id);
    refs.push({ accountId: id, name: id });
  }

  if (refs.length === 0) {
    throw new BizError("请至少指定 1 名队友（mates 或 mateIds）");
  }
  return refs;
}

function buildInsights(
  sample: SquadSampleMeta,
  perPlayer: SquadMemberStats[],
  mates: SquadMemberRef[],
): string[] {
  const out: string[] = [];
  const { scanned, fullSquad, fullRate, missingByMate } = sample;

  if (scanned === 0) {
    out.push("样本内无可扫描对局，请先同步近况或调大扫描场次。");
    return out;
  }

  if (fullSquad === 0) {
    out.push(
      `已扫 ${scanned} 场中尚无四人齐全对局，可核对队友昵称、模式过滤或扩大扫描范围。`,
    );
    const topMissing = mates
      .map((m) => ({
        name: m.name,
        n: missingByMate[m.accountId] ?? 0,
      }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n);
    if (topMissing[0]) {
      out.push(
        `缺席较多：${topMissing[0].name}（${topMissing[0].n}/${scanned}），影响齐全率。`,
      );
    }
    return out;
  }

  if (fullRate != null) {
    const pct = Math.round(fullRate * 100);
    if (fullRate >= FULL_RATE_HIGH) {
      out.push(`齐全率 ${pct}%（${fullSquad}/${scanned}），近期同队较稳定。`);
    } else if (fullRate < FULL_RATE_LOW) {
      out.push(
        `齐全率 ${pct}%（${fullSquad}/${scanned}）偏低，固定四人同场样本偏少，结论请谨慎参考。`,
      );
    } else {
      out.push(`齐全率 ${pct}%（${fullSquad}/${scanned}），同队频率中等。`);
    }
  }

  const withGames = perPlayer.filter((p) => p.games > 0);
  if (withGames.length >= 2) {
    const avgKills =
      withGames.reduce((s, p) => s + p.kills / p.games, 0) / withGames.length;
    const avgDmg =
      withGames.reduce((s, p) => s + p.damage / p.games, 0) / withGames.length;

    for (const p of withGames) {
      const kpg = p.kills / p.games;
      const dpg = p.damage / p.games;
      const lowKill = avgKills > 0 && kpg < avgKills * LOW_CONTRIB_RATIO;
      const lowDmg = avgDmg > 0 && dpg < avgDmg * LOW_CONTRIB_RATIO;
      if (lowKill && lowDmg) {
        out.push(
          `${p.name} 场均击杀与伤害均明显低于队内均值，贡献偏低。`,
        );
      } else if (lowKill) {
        out.push(`${p.name} 场均击杀明显低于队内均值，贡献偏低。`);
      } else if (lowDmg) {
        out.push(`${p.name} 场均伤害明显低于队内均值，贡献偏低。`);
      }
    }
  }

  const teamWins = withGames.length
    ? Math.max(...withGames.map((p) => p.wins))
    : 0;
  if (fullSquad > 0 && teamWins === 0) {
    out.push(`近 ${fullSquad} 场齐全样本中暂无吃鸡。`);
  }

  const teamAvgRank =
    withGames.find((p) => p.avgRank != null)?.avgRank ?? null;
  if (teamAvgRank != null && teamAvgRank >= AVG_RANK_HIGH) {
    out.push(
      `齐全场平均队排约 #${teamAvgRank.toFixed(1)}，整体偏后，可关注开局与中圈决策。`,
    );
  }

  return out;
}

async function computeSquadStats(args: {
  platform: PubgPlatform;
  player: SquadMemberRef;
  playerMatchIds: string[];
  mates: SquadMemberRef[];
  limit: number;
  gameMode: string | null;
  window: WindowBounds | null;
  date: string | null;
  tz: string | null;
}): Promise<SquadStatsResult> {
  const { platform, player, mates, limit, gameMode, window, date, tz } = args;

  const requiredIds = [player.accountId, ...mates.map((m) => m.accountId)];
  const scanLimit = window ? Math.max(limit, WINDOW_SCAN_LIMIT) : limit;
  const matchIds = await collectCandidateMatchIds(
    player.accountId,
    args.playerMatchIds,
    scanLimit,
  );

  const missingByMate: Record<string, number> = {};
  for (const m of mates) {
    missingByMate[m.accountId] = 0;
  }

  const squadRefs: SquadMemberRef[] = [
    { accountId: player.accountId, name: player.name },
    ...mates,
  ];
  const accs = new Map<string, Acc>(
    squadRefs.map((r) => [r.accountId, emptyAcc(r)]),
  );

  const matches: SquadMatchRow[] = [];
  let scanned = 0;
  let fullSquad = 0;
  let teamDamageTotal = 0;

  // 串行：磁盘 match 优先，miss 再拉官方
  for (const matchId of matchIds) {
    const match = await loadMatchPreferDisk(platform, matchId);
    if (!match) continue;
    if (!matchGameModeFamily(match.gameMode, gameMode)) continue;
    if (
      window &&
      !isPlayedAtInWindow(match.playedAt, window.sinceMs, window.untilMs)
    ) {
      continue;
    }

    scanned += 1;
    const roster = findRosterOf(match, player.accountId);
    if (!roster) {
      for (const m of mates) {
        missingByMate[m.accountId] += 1;
      }
      continue;
    }

    const present = new Set(
      roster.participants
        .map((p) => p.accountId)
        .filter((id): id is string => Boolean(id)),
    );

    for (const m of mates) {
      if (!present.has(m.accountId)) {
        missingByMate[m.accountId] += 1;
      }
    }

    const isFull = requiredIds.every((id) => present.has(id));
    if (!isFull) continue;

    fullSquad += 1;
    const teamRank = roster.teamRank;
    let matchTeamDamage = 0;
    const playerRows: SquadMatchRow["players"] = [];

    for (const ref of squadRefs) {
      const p = participantByAccount(roster, ref.accountId);
      if (!p) continue;
      const acc = accs.get(ref.accountId)!;
      if (p.name) acc.name = p.name;
      acc.games += 1;
      acc.kills += p.kills;
      acc.assists += p.assists;
      acc.damage += p.damageDealt;
      acc.survivalSum += p.survivalTimeSec;
      if (teamRank != null) {
        acc.rankSum += teamRank;
        acc.rankCount += 1;
        if (teamRank <= 10) acc.top10 += 1;
        if (teamRank === 1) acc.wins += 1;
      }
      matchTeamDamage += p.damageDealt;
      playerRows.push({
        accountId: ref.accountId,
        name: p.name || ref.name,
        kills: p.kills,
        damage: Number(p.damageDealt.toFixed(2)),
      });
    }

    teamDamageTotal += matchTeamDamage;
    matches.push({
      matchId: match.matchId,
      mapLabel: mapLabel(match.mapName),
      playedAt: match.playedAt,
      teamRank,
      gameMode: match.gameMode,
      matchType: match.matchType,
      isCustomMatch: match.isCustomMatch,
      players: playerRows,
    });
  }

  matches.sort((a, b) => +new Date(b.playedAt) - +new Date(a.playedAt));

  const perPlayer: SquadMemberStats[] = squadRefs.map((ref) => {
    const acc = accs.get(ref.accountId)!;
    const dmgShare =
      teamDamageTotal > 0
        ? Number((acc.damage / teamDamageTotal).toFixed(4))
        : null;
    return {
      accountId: acc.accountId,
      name: acc.name,
      games: acc.games,
      kills: acc.kills,
      assists: acc.assists,
      damage: Number(acc.damage.toFixed(2)),
      survival: avg(acc.survivalSum, acc.games),
      avgRank: avg(acc.rankSum, acc.rankCount),
      top10Rate: rate(acc.top10, acc.games),
      wins: acc.wins,
      dmgShare,
    };
  });

  const matesOut = mates.map((m) => {
    const acc = accs.get(m.accountId);
    return {
      accountId: m.accountId,
      name: acc?.name && acc.name !== m.accountId ? acc.name : m.name,
    };
  });

  const sample: SquadSampleMeta = {
    scanned,
    fullSquad,
    fullRate: rate(fullSquad, scanned),
    missingByMate,
  };

  return {
    platform,
    player: { accountId: player.accountId, name: player.name },
    mates: matesOut,
    limit,
    gameMode,
    hours: window?.hours ?? null,
    since: window ? new Date(window.sinceMs).toISOString() : null,
    until: window ? new Date(window.untilMs).toISOString() : null,
    date: window?.label === "calendar_day" ? date : null,
    tz: window?.label === "calendar_day" ? tz : null,
    label: window?.label ?? null,
    perPlayer,
    sample,
    matches,
    insights: buildInsights(sample, perPlayer, matesOut),
  };
}

/**
 * 车队同场统计：以主玩家 match 列表为锚，筛「齐全对局」后聚合。
 * 结果写入 `.data/squad/{hash}.json`（TTL ~20min）；`refresh=true` 强制绕过。
 */
export async function getSquadStats(
  input: GetSquadStatsInput,
): Promise<SquadStatsResult> {
  const playerName = input.playerName.trim();
  if (!playerName) {
    throw new BizError("name 不能为空");
  }

  const limit = clampLimit(input.limit);
  const gameMode = input.gameMode?.trim() || null;
  const mateNames = parseNameList(input.mateNames);
  const mateAccountIds = parseIdList(input.mateAccountIds);
  const sinceRaw = input.since?.trim() || "";
  const untilRaw = input.until?.trim() || "";
  const dateRaw = input.date?.trim() || "";
  const tzRaw = input.tz?.trim() || "";
  const hoursRaw = input.hours;
  const useWindow =
    Boolean(dateRaw) ||
    Boolean(sinceRaw) ||
    Boolean(untilRaw) ||
    (hoursRaw != null && Number.isFinite(hoursRaw));

  if (mateNames.length === 0 && mateAccountIds.length === 0) {
    throw new BizError("请至少指定 1 名队友（mates 或 mateIds）");
  }

  const window = useWindow
    ? resolveWindowBounds({
        hours:
          hoursRaw != null && Number.isFinite(hoursRaw)
            ? clampWindowHours(hoursRaw)
            : dateRaw || sinceRaw
              ? undefined
              : DEFAULT_WINDOW_HOURS,
        since: sinceRaw || undefined,
        until: untilRaw || undefined,
        date: dateRaw || undefined,
        tz: tzRaw || undefined,
      })
    : null;

  const dateOut =
    window?.label === "calendar_day" ? dateRaw || null : null;
  const tzOut =
    window?.label === "calendar_day"
      ? tzRaw || "Asia/Shanghai"
      : null;

  const { value: player } = await getCachedPlayer(input.platform, playerName);
  const mates = await resolveMates(
    input.platform,
    player.accountId,
    player.name,
    mateNames,
    mateAccountIds,
  );

  const hash = squadCacheHash({
    platform: input.platform,
    accountIds: [player.accountId, ...mates.map((m) => m.accountId)],
    limit,
    gameMode,
    sinceIso: window ? toSecondIso(window.sinceMs) : null,
    untilIso: window ? toSecondIso(window.untilMs) : null,
  });

  if (!input.refresh) {
    const disk = await readPersistedSquad(hash);
    if (disk?.fresh) {
      const cached = disk.result;
      const normalized: SquadStatsResult = {
        ...cached,
        hours: cached.hours ?? null,
        since: cached.since ?? null,
        until: cached.until ?? null,
        date: cached.date ?? null,
        tz: cached.tz ?? null,
        label: cached.label ?? null,
        insights: cached.insights?.length
          ? cached.insights
          : buildInsights(cached.sample, cached.perPlayer, cached.mates),
      };
      return normalized;
    }
  }

  const result = await computeSquadStats({
    platform: input.platform,
    player: { accountId: player.accountId, name: player.name },
    playerMatchIds: player.matchIds,
    mates,
    limit,
    gameMode,
    window,
    date: dateOut,
    tz: tzOut,
  });
  await writePersistedSquad(hash, result);
  return result;
}
