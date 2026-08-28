import type {HistoryMatchRecord} from "@/lib/history/types";
import {recordPlayerName, upsertHistoryMatches,} from "@/lib/history/storage";
import {mapLabel} from "@/lib/pubg/maps";
import type {PubgMatchDetail, PubgPlatform} from "@/lib/pubg/types";

export function toHistoryRecord(
  match: PubgMatchDetail,
  accountId: string,
): HistoryMatchRecord {
  const me = match.rosters
    .flatMap((r) => r.participants)
    .find((p) => p.accountId === accountId);

  return {
    matchId: match.matchId,
    mapName: match.mapName,
    mapLabel: mapLabel(match.mapName),
    gameMode: match.gameMode,
    playedAt: match.playedAt,
    durationSec: match.durationSec,
    rank: me?.winPlace ?? null,
    kills: me?.kills ?? 0,
    assists: me?.assists ?? 0,
    damage: me?.damageDealt ?? 0,
    survivalTimeSec: me?.survivalTimeSec ?? 0,
    headshotKills: me?.headshotKills ?? 0,
    dbnos: me?.dbnos ?? 0,
    revives: me?.revives ?? 0,
    savedAt: new Date().toISOString(),
  };
}

/** dashboard 拉取 recent 后写入本地历史；并记录昵称 */
export async function persistDashboardHistory(
  platform: PubgPlatform,
  accountId: string,
  name: string,
  matches: PubgMatchDetail[],
): Promise<{
  historyCount: number;
  renamed: boolean;
  previousName: string | null;
  knownNames: string[];
}> {
  const records = matches.map((m) => toHistoryRecord(m, accountId));
  const file = await upsertHistoryMatches(accountId, platform, records);
  const nameResult = await recordPlayerName(accountId, platform, name);
  const knownNames = nameResult.file.names.map((n) => n.name);
  const previousName =
    nameResult.previousName ??
    knownNames.find((n) => n !== name.trim()) ??
    null;
  return {
    historyCount: file.matches.length,
    // 本次检测到改名，或历史上曾见过多昵称
    renamed: nameResult.renamed || knownNames.length > 1,
    previousName,
    knownNames,
  };
}
