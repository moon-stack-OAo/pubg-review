export type PubgPlatform = "steam" | "kakao" | "xbox" | "psn";

export const PUBG_PLATFORMS: PubgPlatform[] = [
  "steam",
  "kakao",
  "xbox",
  "psn",
];

export function isPubgPlatform(value: string): value is PubgPlatform {
  return (PUBG_PLATFORMS as string[]).includes(value);
}

/** 官方 Players API attributes.banType */
export type PubgBanType = "Innocent" | "TemporaryBan" | "PermanentBan" | "Unknown";

export type PubgPlayerSummary = {
  accountId: string;
  name: string;
  platform: PubgPlatform;
  shard: string;
  matchIds: string[];
  /** PUBG 账号封禁类型（非「是否开挂」判定） */
  banType: PubgBanType;
};

export type PubgGameModeStats = {
  gameMode: string;
  roundsPlayed: number;
  wins: number;
  top10s: number;
  kills: number;
  assists: number;
  deaths: number;
  damageDealt: number;
  kd: number | null;
  winRate: number | null;
  top10Rate: number | null;
  avgDamage: number | null;
  avgSurvivalTimeSec: number | null;
  rankPoints: number | null;
  bestRankPoint: number | null;
  rankPointsTitle: string | null;
};

export type PubgSeasonOverview = {
  accountId: string;
  platform: PubgPlatform;
  seasonId: string;
  selectedGameMode: string | null;
  modeStats: PubgGameModeStats[];
};

export type PubgSeasonMeta = {
  id: string;
  isCurrent: boolean;
  /** 展示用短标签，优先截取 id 末段 */
  label: string;
};

export type PubgMatchSummary = {
  matchId: string;
  shard: string;
  mapName: string;
  gameMode: string;
  playedAt: string;
  durationSec: number;
  isCustomMatch: boolean;
};

export type PubgParticipant = {
  accountId: string | null;
  name: string;
  winPlace: number | null;
  kills: number;
  assists: number;
  damageDealt: number;
  survivalTimeSec: number;
  dbnos: number;
  revives: number;
  headshotKills: number;
  longestKill: number;
  walkDistance: number;
  rideDistance: number;
};

export type PubgRoster = {
  id: string;
  teamRank: number | null;
  participants: PubgParticipant[];
};

export type PubgMatchDetail = PubgMatchSummary & {
  rosters: PubgRoster[];
  /** match included 中 telemetry asset 的 CDN URL；无则 null */
  telemetryUrl: string | null;
};
