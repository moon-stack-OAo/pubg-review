"use client";

import Link from "next/link";
import {FormEvent, useCallback, useState, useSyncExternalStore} from "react";
import {useRouter} from "next/navigation";
import {
    clearRecentSearches,
    getRecentSearchesServerSnapshot,
    readRecentSearches,
    saveRecentSearch,
    subscribeRecentSearches,
} from "@/lib/recent-searches";
import {PUBG_PLATFORMS, type PubgPlatform} from "@/lib/pubg/types";

export function SearchForm() {
  const router = useRouter();
  const [platform, setPlatform] = useState<PubgPlatform>("steam");
  const [name, setName] = useState("");
  const recent = useSyncExternalStore(
    subscribeRecentSearches,
    readRecentSearches,
    getRecentSearchesServerSnapshot,
  );

  const onSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      const trimmed = name.trim();
      if (!trimmed) return;
      saveRecentSearch({ platform, name: trimmed });
      router.push(`/player/${platform}/${encodeURIComponent(trimmed)}`);
    },
    [name, platform, router],
  );

  return (
    <div>
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="text-zinc-400">平台</span>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as PubgPlatform)}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2"
          >
            {PUBG_PLATFORMS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-[2] flex-col gap-1 text-sm">
          <span className="text-zinc-400">游戏昵称（大小写需一致）</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="输入昵称后回车"
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2"
            autoFocus
          />
        </label>

        <button
          type="submit"
          disabled={!name.trim()}
          className="rounded-lg bg-amber-500 px-4 py-2 font-medium text-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          查询
        </button>
      </form>

      {recent.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-zinc-500">最近搜索：</span>
          {recent.map((item) => (
            <Link
              key={`${item.platform}:${item.name}`}
              href={`/player/${item.platform}/${encodeURIComponent(item.name)}`}
              className="rounded-full border border-zinc-700 px-3 py-1 text-zinc-300 hover:border-amber-500/60 hover:text-amber-300"
            >
              {item.platform}/{item.name}
            </Link>
          ))}
          <button
            type="button"
            className="text-xs text-zinc-500 hover:text-zinc-300"
            onClick={clearRecentSearches}
          >
            清除
          </button>
        </div>
      )}
    </div>
  );
}
