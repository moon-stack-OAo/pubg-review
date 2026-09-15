"use client";

import {useMemo, useState, useSyncExternalStore} from "react";
import {useRouter} from "next/navigation";
import {
  getFavoritesServerSnapshot,
  readFavorites,
  subscribeFavorites,
} from "@/lib/favorites";
import {
  getRecentSearchesServerSnapshot,
  readRecentSearches,
  subscribeRecentSearches,
} from "@/lib/recent-searches";
import type {PubgPlatform} from "@/lib/pubg/types";

const MAX_CHIPS = 8;

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
  const favorites = useSyncExternalStore(
    subscribeFavorites,
    readFavorites,
    getFavoritesServerSnapshot,
  );
  const recent = useSyncExternalStore(
    subscribeRecentSearches,
    readRecentSearches,
    getRecentSearchesServerSnapshot,
  );

  const chips = useMemo(() => {
    const self = name.trim().toLowerCase();
    const plat = platform as PubgPlatform;
    const seen = new Set<string>();
    const out: string[] = [];

    const push = (n: string) => {
      const trimmed = n.trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      if (key === self || seen.has(key)) return;
      seen.add(key);
      out.push(trimmed);
    };

    for (const f of favorites) {
      if (out.length >= MAX_CHIPS) break;
      if (f.platform !== plat) continue;
      push(f.name);
    }
    for (const r of recent) {
      if (out.length >= MAX_CHIPS) break;
      if (r.platform !== plat) continue;
      push(r.name);
    }
    return out;
  }, [favorites, recent, name, platform]);

  function pushCompare(vsName: string) {
    const trimmed = vsName.trim();
    if (!trimmed) return;
    setPeer(trimmed);
    const q = new URLSearchParams();
    q.set("tab", "compare");
    q.set("vs", trimmed);
    if (gameMode) q.set("gameMode", gameMode);
    if (seasonId) q.set("seasonId", seasonId);
    router.push(
      `/player/${platform}/${encodeURIComponent(name)}?${q.toString()}`,
    );
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    pushCompare(peer);
  }

  return (
    <div className="space-y-3">
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm text-fg-secondary">
          <span>对比玩家昵称（同平台）</span>
          <input
            value={peer}
            onChange={(e) => setPeer(e.target.value)}
            placeholder="输入另一个昵称"
            className="min-w-[12rem] rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-fg"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:brightness-110"
        >
          对比
        </button>
      </form>
      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">快捷：</span>
          {chips.map((n) => (
            <button
              key={n.toLowerCase()}
              type="button"
              onClick={() => pushCompare(n)}
              className="rounded-full border border-border-strong bg-surface-2 px-3 py-1 text-fg-secondary transition-colors hover:border-accent-border hover:text-accent"
            >
              {n}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
