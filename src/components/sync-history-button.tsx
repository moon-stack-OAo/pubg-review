"use client";

import {useRouter} from "next/navigation";
import {useCallback, useState} from "react";
import {syncPlayerHistoryClient} from "@/lib/history/sync-client";

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
  const [parseRecentOn, setParseRecentOn] = useState(false);

  const onClick = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setHint("");
    try {
      const result = await syncPlayerHistoryClient({
        accountId,
        platform,
        name,
        parseRecent: parseRecentOn ? 3 : undefined,
      });

      if (result.ok) {
        const base = `已同步 ${result.upserted} 场 · 历史库共 ${result.historyTotal} 场`;
        setHint(
          result.parseRecent > 0
            ? `${base} · 遥测 解析${result.telemetryParsed}/跳过${result.telemetrySkipped}/失败${result.telemetryFailed}`
            : base,
        );
        router.refresh();
        return;
      }

      if (result.skipped) {
        setHint(
          result.retryAfterSec != null
            ? `同步冷却中，请 ${result.retryAfterSec} 秒后再试`
            : result.message || "同步冷却中",
        );
        return;
      }

      setHint(result.message || "同步失败");
    } catch {
      setHint("网络异常，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, [accountId, loading, name, parseRecentOn, platform, router]);

  return (
    <div className="flex flex-col items-end gap-1">
      <label className="flex max-w-[14rem] cursor-pointer items-start gap-1.5 text-right text-xs text-zinc-500">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={parseRecentOn}
          disabled={loading}
          onChange={(e) => setParseRecentOn(e.target.checked)}
        />
        <span>顺带解析最近 3 场遥测（较慢）</span>
      </label>
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="rounded-lg border border-zinc-700 px-3 py-2 text-sm hover:border-emerald-500/50 disabled:cursor-not-allowed disabled:opacity-50"
        title="将官方近况对局写入本地历史库（90s 冷却）"
      >
        {loading
          ? parseRecentOn
            ? "同步并解析中…"
            : "同步中…"
          : "同步近况"}
      </button>
      {hint ? (
        <span className="max-w-[14rem] text-right text-xs text-zinc-500">
          {hint}
        </span>
      ) : null}
      {hint ? (
        <span className="absolute top-full right-0 z-10 mt-1 max-w-[14rem] whitespace-nowrap text-right text-xs text-zinc-500">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
