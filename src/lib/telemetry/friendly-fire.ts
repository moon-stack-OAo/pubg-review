import {BizError} from "@/lib/errors";
import {mapLabel} from "@/lib/pubg/maps";
import type {PubgPlatform} from "@/lib/pubg/types";
import {weaponLabelFromTelemetryId} from "@/lib/pubg/weapons";
import {isCurrentTelemetry, loadMatchTelemetry} from "@/lib/telemetry/service";
import type {ParsedTelemetry, TelemetryFriendlyFireEvent, TelemetryPlayer} from "@/lib/telemetry/types";

export type FriendlyFireQuery = {
  accountId?: string;
  direction?: "dealt" | "received" | "both";
  autoParse?: boolean;
  limit?: number;
  offset?: number;
};

type Metrics = {
  damage: number;
  damageEvents: number;
  knocks: number;
  kills: number;
  finishes: number;
};

function summarize(events: TelemetryFriendlyFireEvent[]): Metrics {
  let damage = 0;
  let damageEvents = 0;
  const knocks = new Set<number>();
  const kills = new Set<number>();
  const finishes = new Set<number>();
  for (const event of events) {
    if (event.type === "damage") {
      damage += event.damage ?? 0;
      damageEvents++;
    } else if (event.type === "knock") {
      knocks.add(event.sourceEventId);
    } else if (event.type === "kill") {
      kills.add(event.sourceEventId);
    } else {
      finishes.add(event.sourceEventId);
    }
  }
  return {damage: Math.round(damage * 100) / 100, damageEvents, knocks: knocks.size,
    kills: kills.size, finishes: finishes.size};
}

export function buildFriendlyFireStats(parsed: ParsedTelemetry, query: FriendlyFireQuery = {}) {
  const accountId = query.accountId?.trim() || null;
  const direction = query.direction ?? "both";
  if (direction !== "both" && !accountId) {
    throw new BizError("按造成或承受方向筛选时，请提供 accountId");
  }
  if (accountId && !parsed.players.some((p) => p.accountId === accountId) &&
    !parsed.friendlyFire.some((e) => e.attacker.accountId === accountId || e.victim.accountId === accountId)) {
    throw new BizError("本场遥测中未找到指定玩家", 404, 40401);
  }
  const limit = query.limit ?? 100;
  const offset = query.offset ?? 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > 500 || !Number.isInteger(offset) || offset < 0) {
    throw new BizError("limit 须为 1–500 的整数，offset 须为非负整数");
  }
  const events = parsed.friendlyFire.filter((e) => !accountId ||
    (direction !== "received" && e.attacker.accountId === accountId) ||
    (direction !== "dealt" && e.victim.accountId === accountId));

  const pairs = new Map<string, TelemetryFriendlyFireEvent[]>();
  const players = new Map<string, {player: TelemetryPlayer; dealt: TelemetryFriendlyFireEvent[];
    received: TelemetryFriendlyFireEvent[]}>();
  for (const event of events) {
    const key = JSON.stringify([event.attacker.accountId, event.victim.accountId]);
    const pair = pairs.get(key) ?? [];
    pair.push(event);
    pairs.set(key, pair);
    for (const [player, side] of [[event.attacker, "dealt"], [event.victim, "received"]] as const) {
      const row = players.get(player.accountId) ?? {player, dealt: [], received: []};
      row[side].push(event);
      players.set(player.accountId, row);
    }
  }

  return {
    hasFriendlyFire: events.length > 0,
    summary: summarize(events),
    pairs: [...pairs.values()].map((pair) => ({
      attacker: pair[0].attacker,
      victim: pair[0].victim,
      ...summarize(pair),
    })),
    players: [...players.values()].map(({player, dealt, received}) => ({
      ...player,
      dealt: summarize(dealt),
      received: summarize(received),
    })),
    totalEvents: events.length,
    limit,
    offset,
    hasMore: offset + limit < events.length,
    events: events.slice(offset, offset + limit).map((event) => ({
      ...event,
      weaponLabel: event.weaponId ? weaponLabelFromTelemetryId(event.weaponId) : null,
    })),
  };
}

const NOTES = [
  "只记录队内伤害事实，不判断是否故意。缺少队伍信息且无官方队友击杀归属的事件无法确认，不计入。",
  "damage 为护甲减免后的生命伤害，仅累加正数伤害事件；damageEvents 是遥测事件数，不是开枪或攻击次数。",
  "kills 按官方归属或同队击杀者统计；finishes 单独表示队友终结行为，两者不可相加作为死亡人数。全局 kills 按死亡事件去重，多人归属时各玩家与配对之和可能更大。",
  "summary、pairs、players 基于全部筛选结果；limit/offset 仅分页明细。按玩家筛选时同时包含其造成和承受的事件，可用 direction 限定。",
];

export async function getMatchFriendlyFire(
  platform: PubgPlatform,
  matchId: string,
  query: FriendlyFireQuery = {},
) {
  const {meta, parsed} = await loadMatchTelemetry(platform, matchId, query.autoParse !== false);
  const base = {
    matchId,
    mapName: parsed?.mapName ?? meta?.mapName ?? "",
    mapLabel: mapLabel(parsed?.mapName ?? meta?.mapName ?? ""),
    parserVersion: parsed?.parserVersion ?? meta?.parserVersion ?? null,
    parsedAt: parsed?.parsedAt ?? meta?.parsedAt ?? null,
    accountId: query.accountId?.trim() || null,
    direction: query.direction ?? "both",
    notes: NOTES,
  };
  if (meta?.status === "ready" && isCurrentTelemetry(parsed)) {
    return {...base, status: "ready", errorMessage: null, ...buildFriendlyFireStats(parsed, query)};
  }
  const outdated = meta?.status === "ready" && parsed != null;
  return {
    ...base,
    status: outdated ? "outdated" : meta?.status === "ready" ? "failed" : meta?.status ?? "none",
    errorMessage: outdated ? "遥测缓存缺少当前友伤数据，请设置 autoParse=true 升级解析"
      : meta?.errorMessage ?? (meta?.status === "ready" ? "精简事件文件丢失，请重新解析" : "遥测尚未就绪，无法判断是否发生友伤"),
    hasFriendlyFire: null,
    summary: null,
    pairs: [],
    players: [],
    totalEvents: null,
    limit: query.limit ?? 100,
    offset: query.offset ?? 0,
    hasMore: false,
    events: [],
  };
}
