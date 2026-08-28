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
        className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-200 hover:border-amber-400/60 hover:bg-amber-500/20"
      >
        复制分享链接
      </button>
      {hint ? <span className="text-xs text-zinc-500">{hint}</span> : null}
    </div>
  );
}
