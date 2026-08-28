import type {PubgPlatform} from "@/lib/pubg/types";

export type SquadMemberRef = {
  accountId: string;
  name: string;
};

export type SquadMemberStats = {
  accountId: string;
  name: string;
  games: number;
  kills: number;
  assists: number;
  damage: number;
  /** 场均存活秒 */
  survival: number | null;
  avgRank: number | null;
  top10Rate: number | null;
  wins: number;
  /** 齐全场内该玩家伤害占车队总伤比例 */
  dmgShare: number | null;
};

export type SquadMatchPlayerRow = {
  accountId: string;
  name: string;
  kills: number;
  damage: number;
};

export type SquadMatchRow = {
  matchId: string;
  mapLabel: string;
  playedAt: string;
  teamRank: number | null;
  gameMode: string;
  players: SquadMatchPlayerRow[];
};

export type SquadSampleMeta = {
  scanned: number;
  fullSquad: number;
  fullRate: number | null;
  /** 按 mate accountId：在已扫场中缺席次数 */
  missingByMate: Record<string, number>;
};

export type SquadStatsResult = {
  platform: PubgPlatform;
  player: SquadMemberRef;
  mates: SquadMemberRef[];
  limit: number;
  gameMode: string | null;
  perPlayer: SquadMemberStats[];
  sample: SquadSampleMeta;
  matches: SquadMatchRow[];
  /** 客观中文洞察（齐全率、贡献、吃鸡/队排等） */
  insights: string[];
};

export type SuggestMate = {
  accountId: string;
  name: string;
  togetherCount: number;
};

export type SuggestMatesResult = {
  platform: PubgPlatform;
  player: SquadMemberRef;
  scan: number;
  mates: SuggestMate[];
};

export type GetSquadStatsInput = {
  platform: PubgPlatform;
  playerName: string;
  mateNames?: string[];
  mateAccountIds?: string[];
  limit?: number;
  gameMode?: string;
  /** 为 true 时绕过磁盘缓存强制重算 */
  refresh?: boolean;
};

export type DetectMatesInput = {
  platform: PubgPlatform;
  playerName: string;
  scan?: number;
};
