"use client";

import {useCallback, useState} from "react";

type Props = {
  matchId: string;
  platform: string;
  accountId?: string;
  className?: string;
};

export function CopyShareLink({
  matchId,
  platform,
  accountId,
  className = "",
}: Props) {
  const [hint, setHint] = useState("");

  const onCopy = useCallback(async () => {
    const q = new URLSearchParams({ platform });
    if (accountId) q.set("accountId", accountId);
    const path = `/share/match/${encodeURIComponent(matchId)}?${q}`;
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}${path}`
        : path;
    try {
      await navigator.clipboard.writeText(url);
      setHint("已复制分享链接");
      setTimeout(() => setHint(""), 2000);
    } catch {
      setHint("复制失败，请手动复制地址栏");
      setTimeout(() => setHint(""), 3000);
    }
  }, [matchId, platform, accountId]);

  return (
    <div className={`inline-flex flex-col items-end gap-1 ${className}`}>
      <button
        type="button"
        onClick={() => void onCopy()}
        className="rounded-lg border border-accent-border bg-accent-muted px-3 py-1.5 text-sm text-accent hover:border-accent-border hover:bg-accent-muted"
      >
        复制分享链接
      </button>
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </div>
  );
}
