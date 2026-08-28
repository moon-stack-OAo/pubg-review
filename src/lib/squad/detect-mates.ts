import {BizError} from "@/lib/errors";
import {readPlayerHistory} from "@/lib/history/storage";
import {getCachedMatch, getCachedPlayer} from "@/lib/pubg/service";
import type {PubgMatchDetail, PubgPlatform} from "@/lib/pubg/types";
import {readPersistedMatch} from "@/lib/persist/match-store";
import type {DetectMatesInput, SuggestMate, SuggestMatesResult,} from "@/lib/squad/types";

const DEFAULT_SCAN = 12;
const MAX_SCAN = 32;

/** 优先磁盘；miss 再 getCachedMatch（调用方保证串行） */
export async function loadMatchPreferDisk(
  platform: PubgPlatform,
  matchId: string,
): Promise<PubgMatchDetail | null> {
  const disk = await readPersistedMatch(matchId);
  if (disk) return disk;
  try {
    const { value } = await getCachedMatch(platform, matchId);
    return value;
  } catch {
    return null;
  }
}

/** 官方 recent ∪ 本地历史 matchId，按官方顺序优先，再补历史 */
export async function collectCandidateMatchIds(
  accountId: string,
  officialMatchIds: string[],
  limit: number,
): Promise<string[]> {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of officialMatchIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= limit) return out;
  }
  const history = await readPlayerHistory(accountId);
  for (const m of history?.matches ?? []) {
    if (!m.matchId || seen.has(m.matchId)) continue;
    seen.add(m.matchId);
    out.push(m.matchId);
    if (out.length >= limit) break;
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

/**
 * 扫描主玩家最近 N 场，统计同 roster 队友出现次数，返回 Top3。
 */
export async function detectFrequentMates(
  input: DetectMatesInput,
): Promise<SuggestMatesResult> {
  const name = input.playerName.trim();
  if (!name) {
    throw new BizError("name 不能为空");
  }
  const scan = Math.min(
    Math.max(input.scan ?? DEFAULT_SCAN, 1),
    MAX_SCAN,
  );

  const { value: player } = await getCachedPlayer(input.platform, name);
  const matchIds = await collectCandidateMatchIds(
    player.accountId,
    player.matchIds,
    scan,
  );

  const counts = new Map<string, { name: string; count: number }>();

  for (const matchId of matchIds) {
    const match = await loadMatchPreferDisk(input.platform, matchId);
    if (!match) continue;
    const roster = findRosterOf(match, player.accountId);
    if (!roster) continue;
    for (const p of roster.participants) {
      if (!p.accountId || p.accountId === player.accountId) continue;
      const prev = counts.get(p.accountId);
      if (prev) {
        prev.count += 1;
        if (p.name) prev.name = p.name;
      } else {
        counts.set(p.accountId, { name: p.name || p.accountId, count: 1 });
      }
    }
  }

  const mates: SuggestMate[] = Array.from(counts.entries())
    .map(([accountId, v]) => ({
      accountId,
      name: v.name,
      togetherCount: v.count,
    }))
    .sort(
      (a, b) =>
        b.togetherCount - a.togetherCount || a.name.localeCompare(b.name),
    )
    .slice(0, 3);

  return {
    platform: input.platform,
    player: { accountId: player.accountId, name: player.name },
    scan,
    mates,
  };
}
