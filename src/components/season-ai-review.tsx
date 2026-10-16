"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import {buttonClass, Card} from "@/components/ui";

type SeasonReviewData = {
  narrative: string;
  highlights: string[];
  disclaimer: string;
  cached?: boolean;
  stale?: boolean;
  model?: string;
  generatedAt?: string;
};

type ApiBody<T> = {
  code: number;
  message: string;
  data: T | null;
};

type Props = {
  platform: string;
  name: string;
  seasonId?: string;
  gameMode?: string;
};

export function SeasonAiReview({platform, name, seasonId, gameMode}: Props) {
  return (
    <SeasonAiReviewContent
      key={JSON.stringify([platform, name, seasonId, gameMode])}
      platform={platform}
      name={name}
      seasonId={seasonId}
      gameMode={gameMode}
    />
  );
}

function SeasonAiReviewContent({platform, name, seasonId, gameMode}: Props) {
  const [data, setData] = useState<SeasonReviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkedCache, setCheckedCache] = useState(false);
  const generationRequest = useRef<AbortController | null>(null);

  const query = useCallback(() => {
    const qs = new URLSearchParams({platform, name});
    if (seasonId) qs.set("seasonId", seasonId);
    if (gameMode) qs.set("gameMode", gameMode);
    return qs;
  }, [platform, name, seasonId, gameMode]);

  const loadCache = useCallback(async (signal: AbortSignal) => {
    try {
      const res = await fetch(`/api/v1/players/season-review?${query()}`, {signal});
      const body = (await res.json()) as ApiBody<SeasonReviewData>;
      if (signal.aborted) return;
      if (res.status === 404 && body.code === 40403) return;
      if (body.code === 0 && body.data?.narrative) setData(body.data);
    } catch {
      // 静默：无缓存时仍可手动生成
    } finally {
      if (!signal.aborted) setCheckedCache(true);
    }
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    const boot = setTimeout(() => {
      void loadCache(controller.signal);
    }, 0);
    return () => {
      clearTimeout(boot);
      controller.abort();
      generationRequest.current?.abort();
      generationRequest.current = null;
    };
  }, [loadCache]);

  const generate = useCallback(
    async (force = false) => {
      if (generationRequest.current) return;
      const controller = new AbortController();
      generationRequest.current = controller;
      setLoading(true);
      setError("");
      const qs = query();
      if (force) qs.set("force", "1");
      try {
        const res = await fetch(`/api/v1/players/season-review?${qs}`, {
          method: "POST",
          signal: controller.signal,
        });
        const body = (await res.json()) as ApiBody<SeasonReviewData>;
        if (controller.signal.aborted) return;
        if (body.code !== 0 || !body.data?.narrative) {
          setError(body.message || "赛季评价生成失败");
          return;
        }
        setData(body.data);
      } catch {
        if (!controller.signal.aborted) {
          setError("网络异常，赛季 KPI 仍可直接查看");
        }
      } finally {
        if (!controller.signal.aborted && generationRequest.current === controller) {
          generationRequest.current = null;
          setLoading(false);
        }
      }
    },
    [query],
  );

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-medium">AI 赛季评价</h2>
          <p className="mt-1 text-xs text-muted">
            AI 辅助，非官方判定 · 只根据当前模式赛季数据与近场弱点
            {data?.cached ? " · 缓存命中" : ""}
            {data?.stale ? " · 数据已变化，可重新生成" : ""}
            {data?.model ? ` · ${data.model}` : ""}
          </p>
        </div>
        <button
          type="button"
          disabled={loading || !checkedCache}
          onClick={() => void generate(Boolean(data))}
          className={buttonClass(data ? "ghost" : "secondary", "sm")}
        >
          {loading ? "生成中…" : data ? "重新生成" : "生成赛季评价"}
        </button>
      </div>

      {error ? (
        <p className="mb-3 rounded-md border border-warning/40 bg-warning-muted px-3 py-2 text-sm text-warning">
          {error}
        </p>
      ) : null}

      {data ? (
        <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-fg-secondary">
            {data.narrative}
          </p>
          {data.highlights.length > 0 ? (
            <ul className="space-y-1.5 text-sm text-fg-secondary">
              {data.highlights.map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="text-accent">→</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted">
          {checkedCache
            ? "点击生成当前赛季、当前模式的文字总结。不会判定开挂。"
            : "检查缓存中…"}
        </p>
      )}
    </Card>
  );
}
