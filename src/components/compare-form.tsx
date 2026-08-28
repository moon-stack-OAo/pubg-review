"use client";

import {useRouter} from "next/navigation";
import {useState} from "react";

export function CompareForm({
  platform,
  name,
  gameMode,
  seasonId,
  otherName,
}: {
  platform: string;
  name: string;
  gameMode?: string;
  seasonId?: string;
  otherName?: string;
}) {
  const router = useRouter();
  const [peer, setPeer] = useState(otherName ?? "");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = peer.trim();
    if (!trimmed) return;
    const q = new URLSearchParams();
    q.set("tab", "compare");
    q.set("vs", trimmed);
    if (gameMode) q.set("gameMode", gameMode);
    if (seasonId) q.set("seasonId", seasonId);
    router.push(
      `/player/${platform}/${encodeURIComponent(name)}?${q.toString()}`,
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-sm text-zinc-400">
        <span>对比玩家昵称（同平台）</span>
        <input
          value={peer}
          onChange={(e) => setPeer(e.target.value)}
          placeholder="输入另一个昵称"
          className="min-w-[12rem] rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-200"
        />
      </label>
      <button
        type="submit"
        className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-black hover:bg-amber-400"
      >
        对比
      </button>
    </form>
  );
}
