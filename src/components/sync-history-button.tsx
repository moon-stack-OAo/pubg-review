"use client";

import {useRouter} from "next/navigation";
import {useCallback, useId, useState} from "react";
import {syncPlayerHistoryClient} from "@/lib/history/sync-client";
import {Button, cn} from "@/components/ui";

export function SyncHistoryButton({
  accountId,
  platform,
  name,
  className,
}: {
  accountId: string;
  platform: string;
  name: string;
  className?: string;
}) {
  const router = useRouter();
  const parseId = useId();
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
    <div className={cn("flex flex-col items-end gap-1", className)}>
      <label
        htmlFor={parseId}
        className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs text-muted"
        title="同步时顺带解析最近 3 场遥测（较慢）"
      >
        <input
          id={parseId}
          type="checkbox"
          className="size-3.5 shrink-0 accent-[var(--accent)]"
          checked={parseRecentOn}
          disabled={loading}
          onChange={(e) => setParseRecentOn(e.target.checked)}
        />
        <span>顺带解析遥测</span>
      </label>
      <Button
        type="button"
        variant="secondary"
        onClick={onClick}
        disabled={loading}
        className="shrink-0"
        title="将官方近况对局写入本地历史库（90s 冷却）"
      >
        {loading
          ? parseRecentOn
            ? "同步并解析中…"
            : "同步中…"
          : "同步近况"}
      </Button>
      {hint ? (
        <p className="max-w-[14rem] text-right text-xs leading-snug text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
