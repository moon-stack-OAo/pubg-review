import {appendApiSyncLog} from "@/lib/sync-log";
import type {
    PubgBanType,
    PubgGameModeStats,
    PubgMatchDetail,
    PubgMatchSummary,
    PubgParticipant,
    PubgPlatform,
    PubgPlayerSummary,
    PubgRoster,
    PubgSeasonMeta,
    PubgSeasonOverview,
} from "./types";

const PUBG_API_BASE = "https://api.pubg.com";

type JsonApiResource = {
  type: string;
  id: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: unknown }>;
};

type JsonApiResponse = {
  data?: JsonApiResource | JsonApiResource[];
  included?: JsonApiResource[];
  errors?: Array<{ title?: string; detail?: string }>;
};

export class PubgApiError extends Error {
  status: number;
  retryAfterSec: number | null;

  constructor(message: string, status: number, retryAfterSec: number | null = null) {
    super(message);
    this.name = "PubgApiError";
    this.status = status;
    this.retryAfterSec = retryAfterSec;
  }
}

function getApiKey(): string {
  const key = process.env.PUBG_API_KEY?.trim();
  if (!key) {
    throw new PubgApiError("未配置 PUBG_API_KEY，请在 .env.local 中设置", 500);
  }
  return key;
}

function platformToShard(platform: PubgPlatform): string {
  return platform;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function safeRate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Number((numerator / denominator).toFixed(4));
}

function extractPlatformFromPath(path: string): string | undefined {
  const m = path.match(/\/shards\/([^/]+)\//);
  return m?.[1];
}

async function pubgFetch<T extends JsonApiResponse>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = path.startsWith("http") ? path : `${PUBG_API_BASE}${path}`;
  const logPath = path.startsWith("http")
    ? (() => {
        try {
          return new URL(path).pathname;
        } catch {
          return "/external";
        }
      })()
    : path.split("?")[0] || path;
  const platform = extractPlatformFromPath(path);
  const started = Date.now();

  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        Accept: "application/vnd.api+json",
        "Accept-Encoding": "gzip",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after") ?? "60");
      void appendApiSyncLog({
        path: logPath,
        status: 429,
        durationMs: Date.now() - started,
        platform,
        error: "rate_limited",
      });
      throw new PubgApiError(
        "PUBG API 限流（429）",
        429,
        Number.isFinite(retryAfter) ? retryAfter : 60,
      );
    }

    const text = await response.text();
    let body: T | null = null;
    if (text) {
      try {
        body = JSON.parse(text) as T;
      } catch {
        void appendApiSyncLog({
          path: logPath,
          status: response.status,
          durationMs: Date.now() - started,
          platform,
          error: "invalid_json",
        });
        throw new PubgApiError(
          `PUBG API 返回非 JSON（HTTP ${response.status}）`,
          response.status,
        );
      }
    }

    if (!response.ok) {
      const detail =
        body?.errors?.map((e) => e.detail || e.title).filter(Boolean).join("; ") ||
        `HTTP ${response.status}`;
      void appendApiSyncLog({
        path: logPath,
        status: response.status,
        durationMs: Date.now() - started,
        platform,
        error: detail.slice(0, 120),
      });
      throw new PubgApiError(detail, response.status);
    }

    void appendApiSyncLog({
      path: logPath,
      status: response.status,
      durationMs: Date.now() - started,
      platform,
      cacheHit: false,
    });

    return (body ?? {}) as T;
  } catch (error) {
    if (error instanceof PubgApiError) throw error;
    void appendApiSyncLog({
      path: logPath,
      status: 0,
      durationMs: Date.now() - started,
      platform,
      error: error instanceof Error ? error.message : "network_error",
    });
    throw error;
  }
}

function extractMatchIds(player: JsonApiResource): string[] {
  const rel = player.relationships?.matches?.data;
  if (!Array.isArray(rel)) return [];
  return rel
    .map((item) => (item && typeof item === "object" && "id" in item ? String((item as { id: string }).id) : ""))
    .filter(Boolean);
}

export function normalizeBanType(value: unknown): PubgBanType {
  if (value === "Innocent" || value === "TemporaryBan" || value === "PermanentBan") {
    return value;
  }
  return "Unknown";
}

export async function searchPlayerByName(
  platform: PubgPlatform,
  name: string,
): Promise<PubgPlayerSummary> {
  const shard = platformToShard(platform);
  const encoded = encodeURIComponent(name.trim());
  const data = await pubgFetch<JsonApiResponse>(
    `/shards/${shard}/players?filter[playerNames]=${encoded}`,
  );

  const players = Array.isArray(data.data) ? data.data : data.data ? [data.data] : [];
  if (players.length === 0) {
    throw new PubgApiError("玩家不存在，请检查平台与昵称大小写", 404);
  }

  const player = players[0];
  return {
    accountId: player.id,
    name: asString(player.attributes?.name, name),
    platform,
    shard,
    matchIds: extractMatchIds(player),
    banType: normalizeBanType(player.attributes?.banType),
  };
}

function toModeStats(gameMode: string, raw: Record<string, unknown>): PubgGameModeStats {
  const roundsPlayed = asNumber(raw.roundsPlayed);
  const wins = asNumber(raw.wins);
  const top10s = asNumber(raw.top10s);
  const kills = asNumber(raw.kills);
  const assists = asNumber(raw.assists);
  const losses = asNumber(raw.losses);
  const damageDealt = asNumber(raw.damageDealt);
  const timeSurvived = asNumber(raw.timeSurvived);
  const deaths = losses > 0 ? losses : Math.max(roundsPlayed - wins, 0);

  return {
    gameMode,
    roundsPlayed,
    wins,
    top10s,
    kills,
    assists,
    deaths,
    damageDealt,
    kd: safeRate(kills, Math.max(deaths, 1)),
    winRate: safeRate(wins, roundsPlayed),
    top10Rate: safeRate(top10s, roundsPlayed),
    avgDamage: roundsPlayed > 0 ? Number((damageDealt / roundsPlayed).toFixed(1)) : null,
    avgSurvivalTimeSec: roundsPlayed > 0 ? Number((timeSurvived / roundsPlayed).toFixed(1)) : null,
    rankPoints: typeof raw.rankPoints === "number" ? raw.rankPoints : null,
    bestRankPoint: typeof raw.bestRankPoint === "number" ? raw.bestRankPoint : null,
    rankPointsTitle: typeof raw.rankPointsTitle === "string" ? raw.rankPointsTitle : null,
  };
}

function seasonLabel(id: string): string {
  const parts = id.split(".");
  return parts[parts.length - 1] || id;
}

export async function listSeasons(platform: PubgPlatform): Promise<PubgSeasonMeta[]> {
  const shard = platformToShard(platform);
  const data = await pubgFetch<JsonApiResponse>(`/shards/${shard}/seasons`);
  const seasons = Array.isArray(data.data) ? data.data : [];
  const mapped = seasons.map((s) => ({
    id: s.id,
    isCurrent: s.attributes?.isCurrentSeason === true,
    label: seasonLabel(s.id),
  }));
  // 当前赛季置顶，其余保持官方顺序
  return mapped.sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent));
}

export async function getCurrentSeasonId(platform: PubgPlatform): Promise<string> {
  const seasons = await listSeasons(platform);
  const current = seasons.find((s) => s.isCurrent);
  if (!current) {
    throw new PubgApiError("未找到当前赛季", 500);
  }
  return current.id;
}

export async function getPlayerSeasonOverview(
  platform: PubgPlatform,
  accountId: string,
  seasonId?: string,
): Promise<PubgSeasonOverview> {
  const shard = platformToShard(platform);
  const resolvedSeasonId = seasonId || (await getCurrentSeasonId(platform));
  const data = await pubgFetch<JsonApiResponse>(
    `/shards/${shard}/players/${encodeURIComponent(accountId)}/seasons/${encodeURIComponent(resolvedSeasonId)}`,
  );

  const resource = Array.isArray(data.data) ? data.data[0] : data.data;
  if (!resource) {
    throw new PubgApiError("赛季统计为空", 404);
  }

  const gameModeStats = (resource.attributes?.gameModeStats ?? {}) as Record<
    string,
    Record<string, unknown>
  >;

  const modeStats = Object.entries(gameModeStats)
    .map(([gameMode, stats]) => toModeStats(gameMode, stats ?? {}))
    .filter((m) => m.roundsPlayed > 0)
    .sort((a, b) => b.roundsPlayed - a.roundsPlayed);

  return {
    accountId,
    platform,
    seasonId: resolvedSeasonId,
    selectedGameMode: modeStats[0]?.gameMode ?? null,
    modeStats,
  };
}

export async function getMatchDetail(
  platform: PubgPlatform,
  matchId: string,
): Promise<PubgMatchDetail> {
  const shard = platformToShard(platform);
  const data = await pubgFetch<JsonApiResponse>(
    `/shards/${shard}/matches/${encodeURIComponent(matchId)}`,
  );
  const match = Array.isArray(data.data) ? data.data[0] : data.data;
  if (!match) {
    throw new PubgApiError("对局不存在或已过期", 404);
  }

  const included = data.included ?? [];
  const participantsById = new Map<string, PubgParticipant>();
  const rosters: PubgRoster[] = [];

  for (const item of included) {
    if (item.type !== "participant") continue;
    const attrs = (item.attributes?.stats ?? {}) as Record<string, unknown>;
    participantsById.set(item.id, {
      accountId: asString(attrs.playerId) || null,
      name: asString(attrs.name, "Unknown"),
      winPlace: typeof attrs.winPlace === "number" ? attrs.winPlace : null,
      kills: asNumber(attrs.kills),
      assists: asNumber(attrs.assists),
      damageDealt: asNumber(attrs.damageDealt),
      survivalTimeSec: asNumber(attrs.timeSurvived),
      dbnos: asNumber(attrs.DBNOs),
      revives: asNumber(attrs.revives),
      headshotKills: asNumber(attrs.headshotKills),
      longestKill: asNumber(attrs.longestKill),
      walkDistance: asNumber(attrs.walkDistance),
      rideDistance: asNumber(attrs.rideDistance),
    });
  }

  for (const item of included) {
    if (item.type !== "roster") continue;
    const participantRefs = item.relationships?.participants?.data;
    const ids = Array.isArray(participantRefs)
      ? participantRefs
          .map((ref) =>
            ref && typeof ref === "object" && "id" in ref
              ? String((ref as { id: string }).id)
              : "",
          )
          .filter(Boolean)
      : [];

    const participants = ids
      .map((id) => participantsById.get(id))
      .filter((p): p is PubgParticipant => Boolean(p));

    const attrs = (item.attributes?.stats ?? {}) as Record<string, unknown>;
    rosters.push({
      id: item.id,
      teamRank: typeof attrs.rank === "number" ? attrs.rank : null,
      participants,
    });
  }

  rosters.sort((a, b) => (a.teamRank ?? 999) - (b.teamRank ?? 999));

  const telemetryUrl = extractTelemetryUrl(match, included);

  const attrs = match.attributes ?? {};
  return {
    matchId: match.id,
    shard,
    mapName: asString(attrs.mapName),
    gameMode: asString(attrs.gameMode),
    playedAt: asString(attrs.createdAt),
    durationSec: asNumber(attrs.duration),
    isCustomMatch: Boolean(attrs.isCustomMatch),
    rosters,
    telemetryUrl,
  };
}

/**
 * 从 match JSON-API 中取出 telemetry CDN URL。
 * 官方：relationships.assets → included type=asset → attributes.URL
 */
function extractTelemetryUrl(
  match: JsonApiResource,
  included: JsonApiResource[],
): string | null {
  const assetRel = match.relationships?.assets?.data;
  const assetIds = new Set<string>();
  if (Array.isArray(assetRel)) {
    for (const ref of assetRel) {
      if (ref && typeof ref === "object" && "id" in ref) {
        assetIds.add(String((ref as { id: string }).id));
      }
    }
  } else if (assetRel && typeof assetRel === "object" && "id" in assetRel) {
    assetIds.add(String((assetRel as { id: string }).id));
  }

  for (const item of included) {
    if (item.type !== "asset") continue;
    if (assetIds.size > 0 && !assetIds.has(item.id)) continue;
    const name = asString(item.attributes?.name).toLowerCase();
    const url = asString(item.attributes?.URL || item.attributes?.url);
    if (!url) continue;
    if (name === "telemetry" || url.includes("telemetry") || assetIds.has(item.id)) {
      return url;
    }
  }
  return null;
}

/** 仅取 telemetry URL（走完整 match 解析，可与 getMatchDetail 缓存共用） */
export async function getMatchTelemetryUrl(
  platform: PubgPlatform,
  matchId: string,
): Promise<string | null> {
  const detail = await getMatchDetail(platform, matchId);
  return detail.telemetryUrl;
}

const TELEMETRY_MAX_BYTES = 80 * 1024 * 1024;

function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[0-2]\d)\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) {
    return true;
  }
  return false;
}

function isAllowedTelemetryHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "telemetry-cdn.pubg.com") return true;
  if (host === "pubg.com" || host.endsWith(".pubg.com")) return true;
  if (host === "amazonaws.com" || host.endsWith(".amazonaws.com")) return true;
  return false;
}

/** 校验 telemetry CDN URL，防 SSRF */
export function assertSafeTelemetryUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new PubgApiError("遥测 URL 非法", 400);
  }
  if (parsed.protocol !== "https:") {
    throw new PubgApiError("遥测 URL 仅允许 https", 400);
  }
  if (parsed.username || parsed.password) {
    throw new PubgApiError("遥测 URL 非法", 400);
  }
  if (isPrivateOrLocalHost(parsed.hostname)) {
    throw new PubgApiError("遥测 URL 主机不允许", 400);
  }
  if (!isAllowedTelemetryHost(parsed.hostname)) {
    throw new PubgApiError("遥测 URL 不在白名单", 400);
  }
  return parsed;
}

async function readResponseTextLimited(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const contentLength = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new PubgApiError("遥测文件过大", 413);
  }

  if (!response.body) {
    const text = await response.text();
    if (text.length > maxBytes) {
      throw new PubgApiError("遥测文件过大", 413);
    }
    return text;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      throw new PubgApiError("遥测文件过大", 413);
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(merged);
}

/**
 * 下载官方 telemetry JSON 原文（通常不计 API rate limit，无需 Bearer）。
 * 返回原始文本便于直接落盘，避免 parse 后再 stringify 双倍拷贝。
 */
export async function downloadTelemetryJson(url: string): Promise<string> {
  const safeUrl = assertSafeTelemetryUrl(url);
  const response = await fetch(safeUrl.toString(), {
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
    },
    cache: "no-store",
    redirect: "manual",
  });

  if (response.status >= 300 && response.status < 400) {
    throw new PubgApiError("遥测下载拒绝重定向", 400);
  }
  if (response.status === 404) {
    throw new PubgApiError("遥测文件不存在或已过期（官方约保留 14 天）", 404);
  }
  if (!response.ok) {
    throw new PubgApiError(`遥测下载失败 HTTP ${response.status}`, response.status);
  }

  return readResponseTextLimited(response, TELEMETRY_MAX_BYTES);
}

export async function smokeTest(
  platform: PubgPlatform,
  name: string,
): Promise<{
  player: PubgPlayerSummary;
  season: PubgSeasonOverview;
  match: PubgMatchDetail | null;
  matchSummary: PubgMatchSummary | null;
}> {
  const player = await searchPlayerByName(platform, name);
  const season = await getPlayerSeasonOverview(platform, player.accountId);
  const firstMatchId = player.matchIds[0] ?? null;

  if (!firstMatchId) {
    return { player, season, match: null, matchSummary: null };
  }

  const match = await getMatchDetail(platform, firstMatchId);
  return {
    player,
    season,
    match,
    matchSummary: {
      matchId: match.matchId,
      shard: match.shard,
      mapName: match.mapName,
      gameMode: match.gameMode,
      playedAt: match.playedAt,
      durationSec: match.durationSec,
      isCustomMatch: match.isCustomMatch,
    },
  };
}
