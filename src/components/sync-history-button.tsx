"use client";

import {useRouter} from "next/navigation";
import {useCallback, useState} from "react";

type ApiBody = {
  code: number;
  message: string;
  data: {
    upserted?: number;
    historyTotal?: number;
  } | null;
  meta?: { retryAfterSec?: number; cooldownSec?: number };
};

export function SyncHistoryButton({
  accountId,
  platform,
  name,
}: {
  accountId: string;
  platform: string;
  name: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState("");

  const onClick = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setHint("");
    try {
      const q = new URLSearchParams({ platform, name });
      const res = await fetch(
        `/api/v1/players/${encodeURIComponent(accountId)}/history/sync?${q}`,
        { method: "POST" },
      );
      const body = (await res.json()) as ApiBody;

      if (body.code === 40901) {
        const sec = body.meta?.retryAfterSec;
        setHint(
          sec != null
            ? `同步冷却中，请 ${sec} 秒后再试`
            : body.message || "同步冷却中",
        );
        return;
      }

      if (body.code !== 0 || !body.data) {
        setHint(body.message || "同步失败");
        return;
      }

      setHint(
        `已同步 ${body.data.upserted ?? 0} 场 · 历史库共 ${body.data.historyTotal ?? 0} 场`,
      );
      router.refresh();
    } catch {
      setHint("网络异常，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, [accountId, loading, name, platform, router]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="rounded-lg border border-zinc-700 px-3 py-2 text-sm hover:border-emerald-500/50 disabled:cursor-not-allowed disabled:opacity-50"
        title="将官方近况对局写入本地历史库（90s 冷却）"
      >
        {loading ? "同步中…" : "同步近况"}
      </button>
      {hint ? (
        <span className="absolute top-full right-0 z-10 mt-1 max-w-[14rem] whitespace-nowrap text-right text-xs text-zinc-500">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
