export type TelemetryStatus =
  | "none"
  | "pending"
  | "ready"
  | "failed"
  | "expired";

export type TelemetryEventType =
  | "kill"
  | "knock"
  | "revive"
  | "carePackage"
  | "zone";

export type TelemetryPlayer = {
  accountId: string;
  name: string;
  teamId: number | null;
};

export type TelemetryPosition = {
  t: number;
  accountId: string;
  x: number;
  y: number;
  z: number;
};

export type TelemetryZone = {
  t: number;
  type: "safe" | "blue";
  x: number;
  y: number;
  radius: number;
};

export type TelemetryEvent = {
  t: number;
  type: TelemetryEventType;
  attackerId?: string | null;
  victimId?: string | null;
  reviverId?: string | null;
  weaponId?: string | null;
  damageReason?: string | null;
  x?: number | null;
  y?: number | null;
  label?: string;
};

/** 枪线：攻击者 → 受害者（或击杀/击倒两端位置） */
export type TelemetryGunline = {
  t: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  attackerId?: string | null;
  victimId?: string | null;
  /** kill | knock | damage */
  kind?: "kill" | "knock" | "damage";
};

export type ParsedTelemetry = {
  matchId: string;
  mapName: string;
  durationSec: number;
  parserVersion: string;
  parsedAt: string;
  players: TelemetryPlayer[];
  positions: TelemetryPosition[];
  events: TelemetryEvent[];
  zones: TelemetryZone[];
  gunlines: TelemetryGunline[];
};

export type TelemetryAssetMeta = {
  matchId: string;
  platform: string;
  status: TelemetryStatus;
  sourceUrl: string | null;
  rawPath: string | null;
  eventsPath: string | null;
  errorMessage: string | null;
  parserVersion: string | null;
  parsedAt: string | null;
  updatedAt: string;
  mapName?: string | null;
  durationSec?: number | null;
};

export const PARSER_VERSION = "1.1.0";

export const DEFAULT_SAMPLE_HZ = 1;

/** 枪线：伤害事件每秒最多保留条数（另保留全部 kill/knock 枪线） */
export const GUNLINE_DAMAGE_PER_SEC = 8;

/** BFF 返回给前端的精简事件流（无原始 telemetry） */
export type TelemetryEventsPayload = {
  matchId: string;
  mapName: string;
  durationSec: number;
  status: TelemetryStatus;
  errorMessage: string | null;
  parserVersion: string | null;
  players: TelemetryPlayer[];
  zones: TelemetryZone[];
  positions: TelemetryPosition[];
  events: TelemetryEvent[];
  gunlines: TelemetryGunline[];
};
