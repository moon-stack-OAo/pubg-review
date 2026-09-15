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
  /** 启用时间窗时返回；近 N 场模式为 null */
  hours: number | null;
  since: string | null;
  until: string | null;
  /** 自然日模式：YYYY-MM-DD */
  date?: string | null;
  /** 自然日时区；首版仅 Asia/Shanghai */
  tz?: string | null;
  /** rolling=滚动窗；calendar_day=自然日；近 N 场为 null */
  label?: "rolling" | "calendar_day" | null;
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
  /**
   * 时间窗小时数。传入则按 playedAt 过滤。
   * 不传且无 since/until/date：保持近 N 场（limit）旧行为。
   * 优先级见 resolveWindowBounds：date > since+until > since > hours
   */
  hours?: number;
  /** ISO 起始时间 */
  since?: string;
  /** ISO 结束时间（半开）；需与 since 同用，或改用 date */
  until?: string;
  /** 自然日 YYYY-MM-DD；与 since/until/hours 互斥 */
  date?: string;
  /** 自然日时区；默认 Asia/Shanghai */
  tz?: string;
  /** 为 true 时绕过磁盘缓存强制重算 */
  refresh?: boolean;
};

export type DetectMatesInput = {
  platform: PubgPlatform;
  playerName: string;
  scan?: number;
};
