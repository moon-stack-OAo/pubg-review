export type SyncHistoryOk = {
  ok: true;
  upserted: number;
  historyTotal: number;
  cooldownSec?: number;
  parseRecent: number;
  telemetryParsed: number;
  telemetrySkipped: number;
  telemetryFailed: number;
};

export type SyncHistorySkipped = {
  ok: false;
  skipped: true;
  code: 40901;
  message: string;
  retryAfterSec?: number;
};

export type SyncHistoryFailed = {
  ok: false;
  skipped: false;
  code: number;
  message: string;
  retryAfterSec?: number;
};

export type SyncHistoryClientResult =
  | SyncHistoryOk
  | SyncHistorySkipped
  | SyncHistoryFailed;

type ApiBody = {
  code: number;
  message: string;
  data: {
    upserted?: number;
    historyTotal?: number;
    cooldownSec?: number;
    parseRecent?: number;
    telemetryParsed?: number;
    telemetrySkipped?: number;
    telemetryFailed?: number;
  } | null;
  meta?: { retryAfterSec?: number; cooldownSec?: number };
};

export async function syncPlayerHistoryClient(
  params: {
    accountId: string;
    platform: string;
    name: string;
    parseRecent?: number;
  },
  init?: { signal?: AbortSignal },
): Promise<SyncHistoryClientResult> {
  const q = new URLSearchParams({
    platform: params.platform,
    name: params.name,
  });
  if (params.parseRecent != null && params.parseRecent > 0) {
    q.set("parseRecent", String(params.parseRecent));
  }
  const res = await fetch(
    `/api/v1/players/${encodeURIComponent(params.accountId)}/history/sync?${q}`,
    { method: "POST", signal: init?.signal },
  );
  const body = (await res.json()) as ApiBody;

  if (body.code === 40901) {
    return {
      ok: false,
      skipped: true,
      code: 40901,
      message: body.message || "同步冷却中",
      retryAfterSec: body.meta?.retryAfterSec,
    };
  }

  if (body.code !== 0 || !body.data) {
    return {
      ok: false,
      skipped: false,
      code: body.code,
      message: body.message || "同步失败",
      retryAfterSec: body.meta?.retryAfterSec,
    };
  }

  return {
    ok: true,
    upserted: body.data.upserted ?? 0,
    historyTotal: body.data.historyTotal ?? 0,
    cooldownSec: body.meta?.cooldownSec ?? body.data.cooldownSec,
    parseRecent: body.data.parseRecent ?? 0,
    telemetryParsed: body.data.telemetryParsed ?? 0,
    telemetrySkipped: body.data.telemetrySkipped ?? 0,
    telemetryFailed: body.data.telemetryFailed ?? 0,
  };
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}
