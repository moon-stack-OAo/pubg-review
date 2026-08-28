import type {PubgPlatform} from "@/lib/pubg/types";

/** 本地历史库中单场摘要（含 participant 关键字段） */
export type HistoryMatchRecord = {
  matchId: string;
  mapName: string;
  mapLabel: string;
  gameMode: string;
  playedAt: string;
  durationSec: number;
  rank: number | null;
  kills: number;
  assists: number;
  damage: number;
  survivalTimeSec: number;
  headshotKills: number;
  dbnos: number;
  revives: number;
  savedAt: string;
};

export type PlayerHistoryFile = {
  accountId: string;
  platform: PubgPlatform;
  updatedAt: string;
  matches: HistoryMatchRecord[];
};

export type NameHistoryEntry = {
  name: string;
  seenAt: string;
};

export type NameHistoryFile = {
  accountId: string;
  platform: PubgPlatform;
  updatedAt: string;
  names: NameHistoryEntry[];
};

export type MapAggRow = {
  mapName: string;
  mapLabel: string;
  matches: number;
  avgRank: number | null;
  kdApprox: number | null;
  avgDamage: number | null;
  winRate: number | null;
  totalKills: number;
  totalDamage: number;
  wins: number;
};

export type WeaponAggRow = {
  weaponId: string;
  label: string;
  kills: number;
  knocks: number;
};

export type ParticipantCombatAgg = {
  matches: number;
  kills: number;
  assists: number;
  damage: number;
  headshotKills: number;
  avgDamage: number | null;
  avgKills: number | null;
  headshotRate: number | null;
};

export type WeaponsTabData = {
  source: "participant" | "telemetry" | "mixed";
  note: string;
  combat: ParticipantCombatAgg;
  weapons: WeaponAggRow[];
  sampleSize: number;
};

export type MapsTabData = {
  rows: MapAggRow[];
  sampleSize: number;
  gameModeFilter: string | null;
};

export type CompareKpi = {
  kd: number | null;
  winRate: number | null;
  avgDamage: number | null;
  roundsPlayed: number;
  top10Rate: number | null;
};

export type ComparePlayerSide = {
  accountId: string;
  name: string;
  platform: PubgPlatform;
  gameMode: string | null;
  kpi: CompareKpi;
};
