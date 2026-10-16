export type PageQuery = Record<string, string | string[] | undefined>;

const PLAYER_CONTEXT_KEYS = [
  "seasonId", "gameMode", "tag", "map", "sort", "page", "tab", "vs",
  "mates", "limit", "hours", "date", "tz", "until",
] as const;

export function firstQueryValues(query: PageQuery): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(query).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );
}

export function buildPlayerReturnHref(platform: string, name: string, query: PageQuery): string {
  const values = firstQueryValues(query);
  const params = new URLSearchParams();
  for (const key of PLAYER_CONTEXT_KEYS) {
    if (values[key]) params.set(key, values[key]);
  }
  const qs = params.toString();
  return `/player/${platform}/${encodeURIComponent(name)}${qs ? `?${qs}` : ""}`;
}

export function validatePlayerReturnHref(
  value: string | string[] | undefined,
  platform: string,
  name: string | undefined,
): string | undefined {
  if (typeof value !== "string" || !name || name === "." || name === ".." || value.length > 4096) return undefined;
  if (!/^(steam|kakao|xbox|psn)$/.test(platform)) return undefined;
  const base = `/player/${platform}/${encodeURIComponent(name)}`;
  if (value.split("?")[0] !== base || value.includes("#")) return undefined;
  let decoded = value;
  for (let i = 0; i < 4; i++) {
    if (/[\\\u0000-\u001f\u007f]/.test(decoded)) return undefined;
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
      if (i === 3) return undefined;
    } catch {
      return undefined;
    }
  }
  const params = new URLSearchParams(value.slice(base.length));
  // 只恢复列表条件；一次性刷新参数和未知参数不随返回链接传播。
  const query = Object.fromEntries(PLAYER_CONTEXT_KEYS.map((key) => [key, params.get(key) ?? undefined]));
  return buildPlayerReturnHref(platform, name, query);
}

export function buildMatchHref(matchId: string, options: {
  platform: string;
  accountId?: string;
  name?: string;
  returnTo?: string;
  tab?: string;
  t?: number;
}): string {
  const params = new URLSearchParams({ platform: options.platform });
  if (options.accountId) params.set("accountId", options.accountId);
  if (options.name) params.set("name", options.name);
  const returnTo = validatePlayerReturnHref(options.returnTo, options.platform, options.name);
  if (returnTo) params.set("returnTo", returnTo);
  if (options.tab && options.tab !== "report") params.set("tab", options.tab);
  if (options.t != null) params.set("t", String(options.t));
  return `/match/${encodeURIComponent(matchId)}?${params}`;
}
