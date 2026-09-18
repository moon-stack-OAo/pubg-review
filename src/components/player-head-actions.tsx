"use client";

import {useCallback, useId, useState} from "react";
import {useRouter} from "next/navigation";
import {FavoriteButton} from "@/components/favorite-button";
import {Button} from "@/components/ui";
import {syncPlayerHistoryClient} from "@/lib/history/sync-client";
import type {PubgPlatform} from "@/lib/pubg/types";

type RefreshBody = {
  code: number;
  message: string;
  data: unknown;
  meta?: { retryAfterSec?: number };
};

export function PlayerHeadActions({
  accountId,
  platform,
  name,
  seasonId,
}: {
  accountId: string;
  platform: PubgPlatform;
  name: string;
  seasonId?: string;
}) {
  const router = useRouter();
  const parseId = useId();
  const [parseRecentOn, setParseRecentOn] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [hint, setHint] = useState("");

  const onSync = useCallback(async () => {
    if (syncLoading) return;
    setSyncLoading(true);
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
      setSyncLoading(false);
    }
  }, [accountId, name, parseRecentOn, platform, router, syncLoading]);

  const onRefresh = useCallback(async () => {
    if (refreshLoading) return;
    setRefreshLoading(true);
    setHint("");
    try {
      const q = new URLSearchParams({ platform, name });
      if (seasonId) q.set("seasonId", seasonId);
      const res = await fetch(
        `/api/v1/players/${encodeURIComponent(accountId)}/refresh?${q}`,
        { method: "POST" },
      );
      const body = (await res.json()) as RefreshBody;

      if (body.code === 40901) {
        const sec = body.meta?.retryAfterSec;
        setHint(
          sec != null
            ? `冷却中，请 ${sec} 秒后再试`
            : body.message || "刷新冷却中",
        );
        return;
      }
      if (body.code !== 0) {
        setHint(body.message || "刷新失败");
        return;
      }
      setHint("已刷新");
      router.refresh();
    } catch {
      setHint("网络异常，请稍后重试");
    } finally {
      setRefreshLoading(false);
    }
  }, [accountId, name, platform, refreshLoading, router, seasonId]);

  return (
    <div className="flex w-full shrink-0 flex-col items-stretch gap-2 sm:w-auto sm:items-end">
      <label
        htmlFor={parseId}
        className="inline-flex min-h-[var(--touch-min)] cursor-pointer items-center gap-1.5 self-start whitespace-nowrap text-xs text-muted sm:min-h-0 sm:self-end"
        title="同步时顺带解析最近 3 场遥测（较慢）"
      >
        <input
          id={parseId}
          type="checkbox"
          className="size-3.5 shrink-0 accent-[var(--accent)]"
          checked={parseRecentOn}
          disabled={syncLoading}
          onChange={(e) => setParseRecentOn(e.target.checked)}
        />
        <span>顺带解析遥测</span>
      </label>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
        <div className="col-span-2 sm:col-span-1 sm:contents">
          <FavoriteButton
            accountId={accountId}
            platform={platform}
            name={name}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={onSync}
          disabled={syncLoading}
          className="min-h-[var(--touch-min)] sm:min-h-0"
          title="将官方近况对局写入本地历史库（90s 冷却）"
        >
          {syncLoading
            ? parseRecentOn
              ? "同步并解析中…"
              : "同步中…"
            : "同步近况"}
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={onRefresh}
          disabled={refreshLoading}
          className="min-h-[var(--touch-min)] sm:min-h-0"
        >
          {refreshLoading ? "刷新中…" : "刷新"}
        </Button>
      </div>

      {hint ? (
        <p className="max-w-md text-left text-xs leading-snug text-muted sm:text-right">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
