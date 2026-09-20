"use client";

import {useCallback, useEffect, useState} from "react";
import {buttonClass, Card} from "@/components/ui";

type AiExplainData = {
  narrative: string;
  polishedSuggestions: string[];
  disclaimer: string;
  cached?: boolean;
  model?: string;
  ruleVersion?: string;
  generatedAt?: string;
};

type ApiBody<T> = {
  code: number;
  message: string;
  data: T | null;
};

type Props = {
  matchId: string;
  platform: string;
  accountId: string;
  ruleSummaryLines: string[];
  ruleSuggestions: string[];
};

export function MatchAiExplain({
  matchId,
  platform,
  accountId,
  ruleSummaryLines,
  ruleSuggestions,
}: Props) {
  const [data, setData] = useState<AiExplainData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkedCache, setCheckedCache] = useState(false);

  const loadCache = useCallback(async () => {
    const qs = new URLSearchParams({ platform, accountId });
    try {
      const res = await fetch(
        `/api/v1/matches/${encodeURIComponent(matchId)}/report/ai?${qs}`,
      );
      const body = (await res.json()) as ApiBody<AiExplainData>;
      if (res.status === 404 && body.code === 40403) {
        return;
      }
      if (body.code === 0 && body.data?.narrative) {
        setData(body.data);
      }
    } catch {
      // 静默
    } finally {
      setCheckedCache(true);
    }
  }, [matchId, platform, accountId]);

  useEffect(() => {
    const boot = setTimeout(() => {
      void loadCache();
    }, 0);
    return () => clearTimeout(boot);
  }, [loadCache]);

  const generate = useCallback(
    async (force = false) => {
      setLoading(true);
      setError("");
      const qs = new URLSearchParams({ platform, accountId });
      if (force) qs.set("force", "1");
      try {
        const res = await fetch(
          `/api/v1/matches/${encodeURIComponent(matchId)}/report/ai?${qs}`,
          { method: "POST" },
        );
        const body = (await res.json()) as ApiBody<AiExplainData>;
        if (body.code !== 0 || !body.data?.narrative) {
          setError(body.message || "AI 解读失败");
          setData(null);
          return;
        }
        setData(body.data);
      } catch {
        setError("网络异常，已保留规则原文");
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [matchId, platform, accountId],
  );

  return (
    <Card className="border-border">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-medium">AI 解读</h2>
          <p className="mt-1 text-xs text-muted">
            AI 辅助，非官方判定 · 规则引擎仍是事实源
            {data?.cached ? " · 缓存命中" : ""}
            {data?.model ? ` · ${data.model}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!data ? (
            <button
              type="button"
              disabled={loading || !checkedCache}
              onClick={() => void generate(false)}
              className={buttonClass("secondary", "sm")}
            >
              {loading ? "生成中…" : "生成 AI 解读"}
            </button>
          ) : (
            <button
              type="button"
              disabled={loading}
              onClick={() => void generate(true)}
              className={buttonClass("ghost", "sm")}
            >
              {loading ? "重算中…" : "重新生成"}
            </button>
          )}
        </div>
      </div>

      {error ? (
        <div className="mb-3 rounded-md border border-warning/40 bg-warning-muted px-3 py-2 text-sm text-warning">
          {error}
          <p className="mt-1 text-xs opacity-80">以下为规则引擎原文：</p>
        </div>
      ) : null}

      {data ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
              人话复盘
            </h3>
            <p className="text-sm leading-relaxed text-fg-secondary whitespace-pre-wrap">
              {data.narrative}
            </p>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
              建议（润色）
            </h3>
            <ul className="space-y-1.5 text-sm text-fg-secondary">
              {(data.polishedSuggestions.length > 0
                ? data.polishedSuggestions
                : ruleSuggestions
              ).map((line, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-accent">→</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : error ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
              结论（规则）
            </h3>
            <ul className="space-y-1.5 text-sm text-fg-secondary">
              {ruleSummaryLines.map((line, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-muted">·</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
              建议（规则）
            </h3>
            <ul className="space-y-1.5 text-sm text-fg-secondary">
              {ruleSuggestions.map((line, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-accent">→</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted">
          {checkedCache
            ? "点击生成：基于上方规则报告脱敏后润色，不判定开挂。"
            : "检查缓存中…"}
        </p>
      )}
    </Card>
  );
}
