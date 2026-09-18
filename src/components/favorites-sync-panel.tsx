"use client";

import Link from "next/link";
import {Fragment, useRef, useState} from "react";
import {Card} from "@/components/ui";
import type {FavoritePlayer} from "@/lib/favorites";
import {formatDateTime} from "@/lib/format";
import {
  isAbortError,
  sleep,
  syncPlayerHistoryClient,
} from "@/lib/history/sync-client";

export type SyncPersonStatus = "idle" | "running" | "ok" | "skipped" | "failed";

function personKey(item: Pick<FavoritePlayer, "platform" | "accountId">) {
  return `${item.platform}:${item.accountId}`;
}

function gapMs() {
  return 300 + Math.floor(Math.random() * 501);
}

function formatResultHint(
  result: Awaited<ReturnType<typeof syncPlayerHistoryClient>>,
): string {
  if (result.ok) {
    return `已同步 ${result.upserted} 场 · 历史库共 ${result.historyTotal} 场`;
  }
  if (result.skipped) {
    return result.retryAfterSec != null
      ? `冷却中，约 ${result.retryAfterSec} 秒后再试`
      : result.message;
  }
  return result.message;
}

export function FavoritesSyncPanel({
  items,
  onRemove,
}: {
  items: FavoritePlayer[];
  onRemove: (item: FavoritePlayer) => void;
}) {
  const [batchRunning, setBatchRunning] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, SyncPersonStatus>>(
    {},
  );
  const [hints, setHints] = useState<Record<string, string>>({});
  const [progressText, setProgressText] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const batchRunningRef = useRef(false);
  const inflightRef = useRef(new Set<string>());

  const anyRowRunning = Object.values(statuses).some((s) => s === "running");

  const onCancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
  };

  const onSyncOne = async (item: FavoritePlayer) => {
    if (batchRunningRef.current) return;
    const key = personKey(item);
    if (inflightRef.current.has(key)) return;
    inflightRef.current.add(key);

    setStatuses((prev) => ({ ...prev, [key]: "running" }));
    setHints((prev) => ({ ...prev, [key]: "" }));

    try {
      const result = await syncPlayerHistoryClient({
        accountId: item.accountId,
        platform: item.platform,
        name: item.name,
      });
      setStatuses((prev) => ({
        ...prev,
        [key]: result.ok ? "ok" : result.skipped ? "skipped" : "failed",
      }));
      setHints((prev) => ({ ...prev, [key]: formatResultHint(result) }));
    } catch {
      setStatuses((prev) => ({ ...prev, [key]: "failed" }));
      setHints((prev) => ({ ...prev, [key]: "网络异常，请稍后重试" }));
    } finally {
      inflightRef.current.delete(key);
    }
  };

  const onSyncAll = async () => {
    if (batchRunningRef.current || items.length === 0 || anyRowRunning) return;

    const ac = new AbortController();
    abortRef.current = ac;
    batchRunningRef.current = true;
    setBatchRunning(true);

    let ok = 0;
    let skipped = 0;
    let failed = 0;
    const n = items.length;

    setProgressText(`同步中 0/${n} · 成功 0 · 跳过 0 · 失败 0`);

    try {
      for (let i = 0; i < items.length; i++) {
        if (ac.signal.aborted) break;
        const item = items[i]!;
        const key = personKey(item);
        setStatuses((prev) => ({ ...prev, [key]: "running" }));
        setHints((prev) => ({ ...prev, [key]: "" }));
        setProgressText(
          `同步中 ${i + 1}/${n} · 成功 ${ok} · 跳过 ${skipped} · 失败 ${failed}`,
        );

        try {
          const result = await syncPlayerHistoryClient(
            {
              accountId: item.accountId,
              platform: item.platform,
              name: item.name,
            },
            { signal: ac.signal },
          );
          if (result.ok) {
            ok += 1;
            setStatuses((prev) => ({ ...prev, [key]: "ok" }));
          } else if (result.skipped) {
            skipped += 1;
            setStatuses((prev) => ({ ...prev, [key]: "skipped" }));
          } else {
            failed += 1;
            setStatuses((prev) => ({ ...prev, [key]: "failed" }));
          }
          setHints((prev) => ({ ...prev, [key]: formatResultHint(result) }));
        } catch (error) {
          if (isAbortError(error)) {
            setStatuses((prev) => ({ ...prev, [key]: "idle" }));
            setHints((prev) => ({ ...prev, [key]: "已取消" }));
            break;
          }
          failed += 1;
          setStatuses((prev) => ({ ...prev, [key]: "failed" }));
          setHints((prev) => ({ ...prev, [key]: "网络异常，请稍后重试" }));
        }

        if (ac.signal.aborted) break;
        if (i < items.length - 1) {
          try {
            await sleep(gapMs(), ac.signal);
          } catch (error) {
            if (isAbortError(error)) break;
            throw error;
          }
        }
      }

      const cancelled = ac.signal.aborted;
      setProgressText(
        cancelled
          ? `已取消 · 成功 ${ok} · 跳过 ${skipped} · 失败 ${failed}`
          : `完成 · 成功 ${ok} · 跳过 ${skipped} · 失败 ${failed}`,
      );
    } finally {
      abortRef.current = null;
      batchRunningRef.current = false;
      setBatchRunning(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void onSyncAll()}
          disabled={batchRunning || anyRowRunning || items.length === 0}
          className="rounded-lg border border-border-strong px-3 py-2 text-sm hover:border-success/50 disabled:cursor-not-allowed disabled:opacity-50"
          title="串行同步全部收藏玩家近况（每人约 90s 冷却）"
        >
          {batchRunning ? "同步全部中…" : "同步全部"}
        </button>
        {batchRunning ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border-strong px-3 py-2 text-sm text-fg-secondary hover:border-danger/40 hover:text-danger"
          >
            取消
          </button>
        ) : null}
        {progressText ? (
          <span className="text-xs text-muted">{progressText}</span>
        ) : null}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="px-2 py-2 font-medium">昵称</th>
                <th className="px-2 py-2 font-medium">平台</th>
                <th className="px-2 py-2 font-medium">收藏时间</th>
                <th className="px-2 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const key = personKey(item);
                const status = statuses[key];
                const running = status === "running";
                const hint = hints[key];
                const disabled = batchRunning || running;
                const hintClass =
                  status === "failed"
                    ? "text-danger"
                    : status === "skipped"
                      ? "text-warning"
                      : status === "ok"
                        ? "text-success"
                        : "text-muted";
                return (
                  <Fragment key={key}>
                    <tr className="border-t border-border">
                      <td className="px-2 py-2">
                        <Link
                          href={`/player/${item.platform}/${encodeURIComponent(item.name)}`}
                          className="text-accent hover:underline"
                        >
                          {item.name}
                        </Link>
                        <div className="mt-0.5 text-xs text-muted">
                          {item.accountId}
                        </div>
                      </td>
                      <td className="px-2 py-2">{item.platform}</td>
                      <td className="px-2 py-2 text-fg-secondary">
                        {formatDateTime(item.savedAt)}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void onSyncOne(item)}
                            disabled={disabled}
                            className="rounded-md border border-border-strong px-2 py-1 text-xs text-fg-secondary hover:border-success/50 disabled:cursor-not-allowed disabled:opacity-50"
                            title="将官方近况对局写入本地历史库（90s 冷却）"
                          >
                            {running ? "同步中…" : "同步近况"}
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemove(item)}
                            className="rounded-md border border-border-strong px-2 py-1 text-xs text-fg-secondary hover:border-danger/40 hover:text-danger"
                          >
                            取消收藏
                          </button>
                        </div>
                      </td>
                    </tr>
                    {hint ? (
                      <tr>
                        <td
                          colSpan={4}
                          className={`px-2 pb-2.5 pt-0 text-xs leading-snug ${hintClass}`}
                        >
                          {hint}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">
          本机收藏可单人/全部串行同步写入历史库；每人约 90s
          冷却；非定时任务。
        </p>
      </Card>
    </div>
  );
}
