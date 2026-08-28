import {
    DEFAULT_SAMPLE_HZ,
    GUNLINE_DAMAGE_PER_SEC,
    type ParsedTelemetry,
    PARSER_VERSION,
    type TelemetryEvent,
    type TelemetryGunline,
    type TelemetryPlayer,
    type TelemetryPosition,
    type TelemetryZone,
} from "@/lib/telemetry/types";

type Loc = { x?: unknown; y?: unknown; z?: unknown };
type Char = {
  accountId?: unknown;
  name?: unknown;
  teamId?: unknown;
  location?: Loc;
};

type RawEvent = Record<string, unknown> & {
  _T?: string;
  _D?: string;
};

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function asChar(v: unknown): Char | null {
  if (!v || typeof v !== "object") return null;
  return v as Char;
}

function locOf(c: Char | null): { x: number; y: number; z: number } | null {
  if (!c?.location || typeof c.location !== "object") return null;
  return {
    x: num(c.location.x),
    y: num(c.location.y),
    z: num(c.location.z),
  };
}

/**
 * 将官方事件时间戳换算为对局内秒数。
 * 优先用事件自带 elapsedTime；否则相对 matchStart。
 */
function resolveT(
  ev: RawEvent,
  matchStartMs: number | null,
  elapsedHint?: number,
): number {
  if (typeof elapsedHint === "number" && Number.isFinite(elapsedHint) && elapsedHint >= 0) {
    return Math.round(elapsedHint * 10) / 10;
  }
  const d = str(ev._D);
  if (d && matchStartMs != null) {
    const ms = Date.parse(d);
    if (Number.isFinite(ms)) {
      return Math.max(0, Math.round(((ms - matchStartMs) / 1000) * 10) / 10);
    }
  }
  return 0;
}

function findMatchStartMs(events: RawEvent[]): number | null {
  for (const ev of events) {
    if (ev._T === "LogMatchStart" && typeof ev._D === "string") {
      const ms = Date.parse(ev._D);
      if (Number.isFinite(ms)) return ms;
    }
  }
  for (const ev of events) {
    if (typeof ev._D === "string") {
      const ms = Date.parse(ev._D);
      if (Number.isFinite(ms)) return ms;
    }
  }
  return null;
}

/**
 * 对每位玩家按 ~sampleHz 采样位置（默认 1Hz）。
 * LogPlayerPosition 官方约每秒一条，仍做桶去重以防噪声。
 */
function samplePositions(
  rawPositions: Array<{ t: number; accountId: string; x: number; y: number; z: number }>,
  sampleHz: number,
): TelemetryPosition[] {
  const interval = sampleHz > 0 ? 1 / sampleHz : 1;
  const lastBucket = new Map<string, number>();
  const out: TelemetryPosition[] = [];

  for (const p of rawPositions) {
    const bucket = Math.floor(p.t / interval);
    const key = `${p.accountId}:${bucket}`;
    if (lastBucket.has(key)) continue;
    lastBucket.set(key, bucket);
    out.push(p);
  }
  return out;
}

export type ParseOptions = {
  matchId: string;
  mapName?: string;
  durationSec?: number;
  sampleHz?: number;
};

export function parseTelemetryJson(
  raw: unknown,
  options: ParseOptions,
): ParsedTelemetry {
  if (!Array.isArray(raw)) {
    throw new Error("遥测格式异常：期望事件数组（JSON array）");
  }

  const events = raw as RawEvent[];
  const matchStartMs = findMatchStartMs(events);
  const sampleHz = options.sampleHz ?? DEFAULT_SAMPLE_HZ;

  const playersMap = new Map<string, TelemetryPlayer>();
  const rawPositions: Array<{
    t: number;
    accountId: string;
    x: number;
    y: number;
    z: number;
  }> = [];
  const gameEvents: TelemetryEvent[] = [];
  const zones: TelemetryZone[] = [];
  const rawGunlines: TelemetryGunline[] = [];
  let mapName = options.mapName ?? "";
  /** 仅由事件推算，勿用官方 duration 初始化（偶发异常偏大） */
  let maxT = 0;

  const pushGunline = (
    t: number,
    attacker: Char | null,
    victim: Char | null,
    kind: TelemetryGunline["kind"],
  ) => {
    const aLoc = locOf(attacker);
    const vLoc = locOf(victim);
    if (!aLoc || !vLoc) return;
    const aId = str(attacker?.accountId);
    const vId = str(victim?.accountId);
    if (!aId || !vId || aId === vId) return;
    if (aId.startsWith("ai.") || vId.startsWith("ai.")) return;
    const dx = aLoc.x - vLoc.x;
    const dy = aLoc.y - vLoc.y;
    if (dx * dx + dy * dy < 1) return;
    rawGunlines.push({
      t,
      x1: aLoc.x,
      y1: aLoc.y,
      x2: vLoc.x,
      y2: vLoc.y,
      attackerId: aId,
      victimId: vId,
      kind,
    });
  };

  const upsertPlayer = (c: Char | null) => {
    if (!c) return;
    const accountId = str(c.accountId);
    if (!accountId || accountId.startsWith("ai.") || accountId === "None") return;
    const existing = playersMap.get(accountId);
    const teamId =
      typeof c.teamId === "number" && Number.isFinite(c.teamId) ? c.teamId : null;
    if (!existing) {
      playersMap.set(accountId, {
        accountId,
        name: str(c.name, "Unknown"),
        teamId,
      });
    } else if (teamId != null && existing.teamId == null) {
      existing.teamId = teamId;
    }
  };

  for (const ev of events) {
    const type = str(ev._T);

    if (type === "LogMatchStart") {
      if (!mapName) mapName = str(ev.mapName);
      const chars = Array.isArray(ev.characters) ? ev.characters : [];
      for (const wrap of chars) {
        const w = wrap as { character?: unknown };
        upsertPlayer(asChar(w.character ?? wrap));
      }
      continue;
    }

    if (type === "LogPlayerCreate") {
      upsertPlayer(asChar(ev.character));
      continue;
    }

    if (type === "LogPlayerPosition") {
      const c = asChar(ev.character);
      upsertPlayer(c);
      const loc = locOf(c);
      const accountId = str(c?.accountId);
      if (!loc || !accountId || accountId.startsWith("ai.")) continue;
      const t = resolveT(ev, matchStartMs, num(ev.elapsedTime, -1) >= 0 ? num(ev.elapsedTime) : undefined);
      maxT = Math.max(maxT, t);
      rawPositions.push({
        t,
        accountId,
        x: loc.x,
        y: loc.y,
        z: loc.z,
      });
      continue;
    }

    if (type === "LogPlayerKillV2" || type === "LogPlayerKill") {
      const victim = asChar(ev.victim);
      const killer = asChar(ev.killer) ?? asChar(ev.finisher);
      upsertPlayer(victim);
      upsertPlayer(killer);
      const t = resolveT(ev, matchStartMs);
      maxT = Math.max(maxT, t);
      const damageInfo =
        (ev.killerDamageInfo as Record<string, unknown> | undefined) ??
        (ev.finishDamageInfo as Record<string, unknown> | undefined);
      const weaponId =
        str(damageInfo?.damageCauserName) ||
        str(ev.damageCauserName) ||
        null;
      const damageReason =
        str(damageInfo?.damageReason) || str(ev.damageReason) || null;
      const loc = locOf(victim);
      gameEvents.push({
        t,
        type: "kill",
        attackerId: str(killer?.accountId) || null,
        victimId: str(victim?.accountId) || null,
        weaponId,
        damageReason,
        x: loc?.x ?? null,
        y: loc?.y ?? null,
      });
      pushGunline(t, killer, victim, "kill");
      continue;
    }

    if (type === "LogPlayerMakeGroggy") {
      const victim = asChar(ev.victim);
      const attacker = asChar(ev.attacker);
      upsertPlayer(victim);
      upsertPlayer(attacker);
      const t = resolveT(ev, matchStartMs);
      maxT = Math.max(maxT, t);
      const loc = locOf(victim);
      gameEvents.push({
        t,
        type: "knock",
        attackerId: str(attacker?.accountId) || null,
        victimId: str(victim?.accountId) || null,
        weaponId: str(ev.damageCauserName) || null,
        damageReason: str(ev.damageReason) || null,
        x: loc?.x ?? null,
        y: loc?.y ?? null,
      });
      pushGunline(t, attacker, victim, "knock");
      continue;
    }

    if (type === "LogPlayerTakeDamage") {
      const category = str(ev.damageTypeCategory);
      // 枪伤 / 近战 / 投掷爆炸；排除蓝圈、坠落、自伤等
      if (
        category !== "Damage_Gun" &&
        category !== "Damage_Punch" &&
        category !== "Damage_MeleeThrow" &&
        !category.startsWith("Damage_Explosion") &&
        category !== "Damage_Molotov"
      ) {
        continue;
      }
      const victim = asChar(ev.victim);
      const attacker = asChar(ev.attacker);
      upsertPlayer(victim);
      upsertPlayer(attacker);
      const t = resolveT(ev, matchStartMs);
      maxT = Math.max(maxT, t);
      pushGunline(t, attacker, victim, "damage");
      continue;
    }

    if (type === "LogPlayerRevive") {
      const victim = asChar(ev.victim);
      const reviver = asChar(ev.reviver);
      upsertPlayer(victim);
      upsertPlayer(reviver);
      const t = resolveT(ev, matchStartMs);
      maxT = Math.max(maxT, t);
      const loc = locOf(victim);
      gameEvents.push({
        t,
        type: "revive",
        reviverId: str(reviver?.accountId) || null,
        victimId: str(victim?.accountId) || null,
        attackerId: str(reviver?.accountId) || null,
        x: loc?.x ?? null,
        y: loc?.y ?? null,
      });
      continue;
    }

    if (type === "LogCarePackageLand" || type === "LogCarePackageSpawn") {
      const pkg = ev.itemPackage as { location?: Loc } | undefined;
      const t = resolveT(ev, matchStartMs);
      maxT = Math.max(maxT, t);
      const x = num(pkg?.location?.x, NaN);
      const y = num(pkg?.location?.y, NaN);
      gameEvents.push({
        t,
        type: "carePackage",
        x: Number.isFinite(x) ? x : null,
        y: Number.isFinite(y) ? y : null,
        label: type === "LogCarePackageLand" ? "空投落地" : "空投生成",
      });
      continue;
    }

    if (type === "LogGameStatePeriodic") {
      const gs = ev.gameState as Record<string, unknown> | undefined;
      if (!gs) continue;
      const t = resolveT(
        ev,
        matchStartMs,
        typeof gs.elapsedTime === "number" ? gs.elapsedTime : undefined,
      );
      maxT = Math.max(maxT, t);
      const safePos = gs.safetyZonePosition as Loc | undefined;
      const bluePos = gs.poisonGasWarningPosition as Loc | undefined;
      const safeR = num(gs.safetyZoneRadius, -1);
      const blueR = num(gs.poisonGasWarningRadius, -1);
      if (safePos && safeR > 0) {
        zones.push({
          t,
          type: "safe",
          x: num(safePos.x),
          y: num(safePos.y),
          radius: safeR,
        });
      }
      if (bluePos && blueR > 0) {
        zones.push({
          t,
          type: "blue",
          x: num(bluePos.x),
          y: num(bluePos.y),
          radius: blueR,
        });
      }
      continue;
    }
  }

  // 圈变化采样：同类型约每 5 秒保留一条，降低体积
  const sampledZones = sampleZones(zones, 5);

  const positions = samplePositions(
    rawPositions.sort((a, b) => a.t - b.t || a.accountId.localeCompare(b.accountId)),
    sampleHz,
  );

  gameEvents.sort((a, b) => a.t - b.t);
  sampledZones.sort((a, b) => a.t - b.t);
  const gunlines = sampleGunlines(rawGunlines);

  // 官方 match.duration 偶发异常偏大；优先用事件推算的 maxT
  const fromEvents = Math.ceil(maxT);
  const fromMatch =
    options.durationSec && options.durationSec > 0 ? options.durationSec : 0;
  const durationSec =
    fromEvents > 0
      ? fromMatch > 0 && fromMatch <= fromEvents * 1.25
        ? fromMatch
        : fromEvents
      : fromMatch || 0;

  if (!mapName) {
    mapName = "Unknown";
  }

  return {
    matchId: options.matchId,
    mapName,
    durationSec,
    parserVersion: PARSER_VERSION,
    parsedAt: new Date().toISOString(),
    players: Array.from(playersMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    positions,
    events: gameEvents,
    zones: sampledZones,
    gunlines,
  };
}

/**
 * kill/knock 全保留；damage 按秒限流，避免枪线过密卡顿。
 */
function sampleGunlines(lines: TelemetryGunline[]): TelemetryGunline[] {
  const sorted = [...lines].sort(
    (a, b) => a.t - b.t || (a.kind === "damage" ? 1 : -1),
  );
  const damageCount = new Map<number, number>();
  const out: TelemetryGunline[] = [];
  for (const g of sorted) {
    if (g.kind === "kill" || g.kind === "knock") {
      out.push(g);
      continue;
    }
    const bucket = Math.floor(g.t);
    const n = damageCount.get(bucket) ?? 0;
    if (n >= GUNLINE_DAMAGE_PER_SEC) continue;
    damageCount.set(bucket, n + 1);
    out.push(g);
  }
  return out;
}

function sampleZones(zones: TelemetryZone[], intervalSec: number): TelemetryZone[] {
  const last = new Map<string, number>();
  const out: TelemetryZone[] = [];
  for (const z of zones) {
    const bucket = Math.floor(z.t / intervalSec);
    const key = `${z.type}:${bucket}`;
    if (last.has(key)) continue;
    last.set(key, bucket);
    out.push(z);
  }
  return out;
}
