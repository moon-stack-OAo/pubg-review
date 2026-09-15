"use client";

import {useRouter} from "next/navigation";
import {useCallback, useState} from "react";
import {Button, cn} from "@/components/ui";

type ApiBody = {
  code: number;
  message: string;
  data: unknown;
  meta?: { retryAfterSec?: number };
};

export function RefreshButton({
  accountId,
  platform,
  name,
  seasonId,
  className,
}: {
  accountId: string;
  platform: string;
  name: string;
  seasonId?: string;
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState("");

  const onClick = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setHint("");
    try {
      const q = new URLSearchParams({
        platform,
        name,
      });
      if (seasonId) q.set("seasonId", seasonId);

      const res = await fetch(
        `/api/v1/players/${encodeURIComponent(accountId)}/refresh?${q}`,
        { method: "POST" },
      );
      const body = (await res.json()) as ApiBody;

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
      setLoading(false);
    }
  }, [accountId, loading, name, platform, router, seasonId]);

  return (
    <div className={cn("flex flex-col items-end gap-1.5", className)}>
      <Button
        type="button"
        variant="primary"
        onClick={onClick}
        disabled={loading}
        className="shrink-0"
      >
        {loading ? "刷新中…" : "刷新"}
      </Button>
      {hint ? (
        <p className="max-w-xs text-right text-xs leading-snug text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
