import {resolveVehicle, shouldSkipVehicleId} from "@/lib/pubg/vehicles";
import {readTelemetryArray} from "@/lib/telemetry/json-stream";
import {
    DEFAULT_SAMPLE_HZ,
    GUNLINE_DAMAGE_PER_SEC,
    type ParsedTelemetry,
    PARSER_VERSION,
    type TelemetryEvent,
    type TelemetryFriendlyFireEvent,
    type TelemetryGunline,
    type TelemetryPlayer,
    type TelemetryPosition,
    type TelemetryVehicleEvent,
    type TelemetryZone,
} from "@/lib/telemetry/types";

type Loc = { x?: unknown; y?: unknown; z?: unknown };
type Char = {
  accountId?: unknown;
  name?: unknown;
  teamId?: unknown;
  location?: Loc;
};
type Veh = {
  vehicleId?: unknown;
  vehicleUniqueId?: unknown;
  vehicleType?: unknown;
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

function asVeh(v: unknown): Veh | null {
  if (!v || typeof v !== "object") return null;
  return v as Veh;
}

function locFrom(loc: Loc | undefined | null): { x: number; y: number; z: number } | null {
  if (!loc || typeof loc !== "object") return null;
  return { x: num(loc.x), y: num(loc.y), z: num(loc.z) };
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
  const parser = createTelemetryParser(options, findMatchStartMs(events));
  events.forEach((ev, index) => parser.consume(ev, index));
  return parser.finish();
}

export async function parseTelemetryFile(file: string, options: ParseOptions): Promise<ParsedTelemetry> {
  let firstTimestamp: number | null = null;
  let matchStartMs: number | null = null;
  for await (const value of readTelemetryArray(file)) {
    const ev = value as RawEvent;
    const ms = typeof ev._D === "string" ? Date.parse(ev._D) : NaN;
    if (!Number.isFinite(ms)) continue;
    firstTimestamp ??= ms;
    if (ev._T === "LogMatchStart") {
      matchStartMs = ms;
      break;
    }
  }
  const parser = createTelemetryParser(options, matchStartMs ?? firstTimestamp);
  let index = 0;
  for await (const value of readTelemetryArray(file)) {
    parser.consume(value as RawEvent, index++);
  }
  return parser.finish();
}

function createTelemetryParser(options: ParseOptions, matchStartMs: number | null) {
  const sampleHz = options.sampleHz ?? DEFAULT_SAMPLE_HZ;
  const interval = sampleHz > 0 ? 1 / sampleHz : 1;

  const playersMap = new Map<string, TelemetryPlayer>();
  const positionBuckets = new Map<string, TelemetryPosition>();
  const gameEvents: TelemetryEvent[] = [];
  const zones: TelemetryZone[] = [];
  const rawGunlines: TelemetryGunline[] = [];
  const vehicles: TelemetryVehicleEvent[] = [];
  const friendlyFire: TelemetryFriendlyFireEvent[] = [];
  let mapName = options.mapName ?? "";
  /** 仅由事件推算，勿用官方 duration 初始化（偶发异常偏大） */
  let maxT = 0;

  const pushVehicle = (
    t: number,
    action: TelemetryVehicleEvent["type"],
    character: Char | null,
    vehicle: Veh | null,
    seatIndex?: number | null,
  ) => {
    const vehicleId = str(vehicle?.vehicleId);
    if (!vehicleId || shouldSkipVehicleId(vehicleId)) return;
    const loc = locOf(character) ?? locFrom(vehicle?.location);
    if (!loc) return;
    const info = resolveVehicle(vehicleId);
    const accountId = str(character?.accountId) || null;
    if (accountId?.startsWith("ai.")) return;
    const uniqueId = num(vehicle?.vehicleUniqueId, -1);
    vehicles.push({
      t,
      type: action,
      vehicleId,
      vehicleUniqueId: uniqueId >= 0 ? uniqueId : 0,
      kind: info.kind,
      label: info.name,
      accountId,
      x: loc.x,
      y: loc.y,
      z: loc.z,
      seatIndex: seatIndex ?? null,
    });
    const eventType =
      action === "ride"
        ? "vehicleRide"
        : action === "leave"
          ? "vehicleLeave"
          : "vehicleDestroy";
    gameEvents.push({
      t,
      type: eventType,
      attackerId: accountId,
      victimId: null,
      weaponId: vehicleId,
      x: loc.x,
      y: loc.y,
      label: info.name,
    });
  };

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

  const playerSnapshot = (c: Char | null): TelemetryPlayer | null => {
    const accountId = str(c?.accountId);
    if (!accountId || accountId === "None" || accountId.startsWith("ai.")) return null;
    const teamId = num(c?.teamId, -1);
    return {
      accountId,
      name: str(c?.name) || playersMap.get(accountId)?.name || "Unknown",
      teamId: teamId >= 0 ? teamId : null,
    };
  };

  const pushFriendlyFire = (
    ev: RawEvent,
    sourceEventId: number,
    type: TelemetryFriendlyFireEvent["type"],
    attacker: TelemetryPlayer | null,
    victim: TelemetryPlayer | null,
    damageInfo: Record<string, unknown> = ev,
    officialIds: string[] = [],
  ) => {
    if (!attacker || !victim || attacker.accountId === victim.accountId) return;
    const official = type === "kill" && officialIds.includes(attacker.accountId);
    if (!official && (attacker.teamId == null || attacker.teamId !== victim.teamId)) return;
    const timestamp = str(ev._D);
    if (matchStartMs != null && Date.parse(timestamp) < matchStartMs) return;
    const damage = num(ev.damage, -1);
    if (type === "damage" && damage <= 0) return;
    friendlyFire.push({
      id: `${sourceEventId}:${type}:${attacker.accountId}`,
      sourceEventId,
      t: resolveT(ev, matchStartMs),
      timestamp: timestamp || null,
      type,
      attacker,
      victim,
      evidence: official ? "officialTeamKiller" : "sameTeam",
      damage: type === "damage" ? damage : null,
      weaponId: str(damageInfo.damageCauserName) || null,
      damageTypeCategory: str(damageInfo.damageTypeCategory) || null,
      damageReason: str(damageInfo.damageReason) || null,
      attackId: typeof ev.attackId === "number" && Number.isFinite(ev.attackId) ? ev.attackId : null,
      dbnoId: typeof ev.dBNOId === "number" && Number.isFinite(ev.dBNOId) ? ev.dBNOId : null,
      teamKillersAccountIds: officialIds,
    });
  };

  const consume = (ev: RawEvent, sourceEventId: number) => {
    const type = str(ev._T);

    if (type === "LogMatchStart") {
      if (!mapName) mapName = str(ev.mapName);
      const chars = Array.isArray(ev.characters) ? ev.characters : [];
      for (const wrap of chars) {
        const w = wrap as { character?: unknown };
        upsertPlayer(asChar(w.character ?? wrap));
      }
      return;
    }

    if (type === "LogPlayerCreate") {
      upsertPlayer(asChar(ev.character));
      return;
    }

    if (type === "LogPlayerPosition") {
      const c = asChar(ev.character);
      upsertPlayer(c);
      const loc = locOf(c);
      const accountId = str(c?.accountId);
      if (!loc || !accountId || accountId.startsWith("ai.")) return;
      const t = resolveT(ev, matchStartMs, num(ev.elapsedTime, -1) >= 0 ? num(ev.elapsedTime) : undefined);
      maxT = Math.max(maxT, t);
      const key = `${accountId}:${Math.floor(t / interval)}`;
      const previous = positionBuckets.get(key);
      // 与先稳定排序再采样一致：保留桶内最早时间，相同时间保留原顺序第一条。
      if (!previous || t < previous.t) {
        positionBuckets.set(key, {t, accountId, x: loc.x, y: loc.y, z: loc.z});
      }
      return;
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
      const creditedKiller = asChar(ev.killer);
      const finisher = asChar(ev.finisher);
      const dbnoMaker = asChar(ev.dBNOMaker);
      upsertPlayer(finisher);
      upsertPlayer(dbnoMaker);
      const officialIds = Array.isArray(ev.teamKillers_AccountId)
        ? [...new Set(ev.teamKillers_AccountId.filter((id): id is string =>
          typeof id === "string" && id !== "" && id !== "None" && !id.startsWith("ai."),
        ))]
        : [];
      const victimSnapshot = playerSnapshot(victim);
      const killerSnapshot = playerSnapshot(creditedKiller);
      const killActors = new Map<string, TelemetryPlayer>();
      if (killerSnapshot) killActors.set(killerSnapshot.accountId, killerSnapshot);
      for (const accountId of officialIds) {
        const character = [creditedKiller, finisher, dbnoMaker]
          .find((c) => c?.accountId === accountId);
        killActors.set(accountId, playerSnapshot(character ?? null) ??
          playersMap.get(accountId) ?? {accountId, name: "Unknown", teamId: null});
      }
      for (const actor of killActors.values()) {
        // 仅把归属击杀者的伤害信息关联给本人，避免将敌方终结武器归到队友名下。
        const actorDamageInfo = actor.accountId === killerSnapshot?.accountId
          ? (ev.killerDamageInfo as Record<string, unknown> | undefined) ?? (type === "LogPlayerKill" ? ev : {})
          : actor.accountId === str(finisher?.accountId)
            ? (ev.finishDamageInfo as Record<string, unknown> | undefined) ?? {}
            : actor.accountId === str(dbnoMaker?.accountId)
              ? (ev.dBNODamageInfo as Record<string, unknown> | undefined) ?? {}
              : {};
        pushFriendlyFire(ev, sourceEventId, "kill", actor, victimSnapshot, actorDamageInfo, officialIds);
      }
      if (type === "LogPlayerKillV2") {
        pushFriendlyFire(ev, sourceEventId, "finish", playerSnapshot(finisher), victimSnapshot,
          (ev.finishDamageInfo as Record<string, unknown> | undefined) ?? {}, officialIds);
      }
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
      return;
    }

    if (type === "LogPlayerMakeGroggy") {
      const victim = asChar(ev.victim);
      const attacker = asChar(ev.attacker);
      upsertPlayer(victim);
      upsertPlayer(attacker);
      pushFriendlyFire(ev, sourceEventId, "knock", playerSnapshot(attacker), playerSnapshot(victim));
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
      return;
    }

    if (type === "LogPlayerTakeDamage") {
      const victim = asChar(ev.victim);
      const attacker = asChar(ev.attacker);
      upsertPlayer(victim);
      upsertPlayer(attacker);
      // 友伤统计保留所有伤害来源（含载具），不受回放枪线类别和采样限制。
      pushFriendlyFire(ev, sourceEventId, "damage", playerSnapshot(attacker), playerSnapshot(victim));
      const category = str(ev.damageTypeCategory);
      // 枪伤 / 近战 / 投掷爆炸；排除蓝圈、坠落、自伤等
      if (
        category !== "Damage_Gun" &&
        category !== "Damage_Punch" &&
        category !== "Damage_MeleeThrow" &&
        !category.startsWith("Damage_Explosion") &&
        category !== "Damage_Molotov"
      ) {
        return;
      }
      const t = resolveT(ev, matchStartMs);
      maxT = Math.max(maxT, t);
      pushGunline(t, attacker, victim, "damage");
      return;
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
      return;
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
      return;
    }

    if (type === "LogVehicleRide") {
      const character = asChar(ev.character);
      upsertPlayer(character);
      const t = resolveT(ev, matchStartMs);
      maxT = Math.max(maxT, t);
      const seat =
        typeof ev.seatIndex === "number" ? ev.seatIndex : null;
      pushVehicle(t, "ride", character, asVeh(ev.vehicle), seat);
      return;
    }

    if (type === "LogVehicleLeave") {
      const character = asChar(ev.character);
      upsertPlayer(character);
      const t = resolveT(ev, matchStartMs);
      maxT = Math.max(maxT, t);
      const seat =
        typeof ev.seatIndex === "number" ? ev.seatIndex : null;
      pushVehicle(t, "leave", character, asVeh(ev.vehicle), seat);
      return;
    }

    if (type === "LogVehicleDestroy") {
      const attacker = asChar(ev.attacker);
      upsertPlayer(attacker);
      const t = resolveT(ev, matchStartMs);
      maxT = Math.max(maxT, t);
      pushVehicle(t, "destroy", attacker, asVeh(ev.vehicle), null);
      return;
    }

    if (type === "LogGameStatePeriodic") {
      const gs = ev.gameState as Record<string, unknown> | undefined;
      if (!gs) return;
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
      return;
    }
  };

  const finish = (): ParsedTelemetry => {
    // 圈变化采样：同类型约每 5 秒保留一条，降低体积。
    const sampledZones = sampleZones(zones, 5);
    const positions = Array.from(positionBuckets.values())
      .sort((a, b) => a.t - b.t || a.accountId.localeCompare(b.accountId));
    positionBuckets.clear();

    gameEvents.sort((a, b) => a.t - b.t);
    sampledZones.sort((a, b) => a.t - b.t);
    const gunlines = sampleGunlines(rawGunlines);
    vehicles.sort((a, b) => a.t - b.t);
    friendlyFire.sort((a, b) => a.t - b.t || a.sourceEventId - b.sourceEventId);

    // 官方 match.duration 偶发异常偏大；优先用事件推算的 maxT。
    const fromEvents = Math.ceil(maxT);
    const fromMatch =
      options.durationSec && options.durationSec > 0 ? options.durationSec : 0;
    const durationSec =
      fromEvents > 0
        ? fromMatch > 0 && fromMatch <= fromEvents * 1.25
          ? fromMatch
          : fromEvents
        : fromMatch || 0;

    if (!mapName) mapName = "Unknown";

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
      vehicles,
      friendlyFire,
    };
  };
  return {consume, finish};
}

/**
 * kill/knock 全保留；damage 按秒限流，避免枪线过密卡顿。
 */
function sampleGunlines(lines: TelemetryGunline[]): TelemetryGunline[] {
  const sorted = lines.sort(
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
