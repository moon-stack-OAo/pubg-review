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
import {Button, cn} from "@/components/ui";

const PLATFORM_LABEL: Record<PubgPlatform, string> = {
  steam: "Steam",
  kakao: "Kakao",
  xbox: "Xbox",
  psn: "PSN",
};

export function SearchForm() {
  const router = useRouter();
  const [platform, setPlatform] = useState<PubgPlatform>("steam");
  const [name, setName] = useState("");
  const [error, setError] = useState(false);
  const recent = useSyncExternalStore(
    subscribeRecentSearches,
    readRecentSearches,
    getRecentSearchesServerSnapshot,
  );

  const onSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      const trimmed = name.trim();
      if (!trimmed) {
        setError(true);
        return;
      }
      setError(false);
      saveRecentSearch({ platform, name: trimmed });
      router.push(`/player/${platform}/${encodeURIComponent(trimmed)}`);
    },
    [name, platform, router],
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-2 text-xs font-medium tracking-wide text-muted">
          平台
        </div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="平台选择">
          {PUBG_PLATFORMS.map((item) => {
            const active = platform === item;
            return (
              <button
                key={item}
                type="button"
                aria-pressed={active}
                onClick={() => setPlatform(item)}
                className={cn(
                  "h-8 rounded-full border px-3 text-xs font-medium transition-colors",
                  active
                    ? "border-accent-border bg-accent-muted text-fg"
                    : "border-border bg-bg text-fg-secondary hover:bg-surface-hover hover:text-fg",
                )}
              >
                {PLATFORM_LABEL[item]}
              </button>
            );
          })}
        </div>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-2" noValidate>
        <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div
            className={cn(
              "input-wrap flex h-[var(--control-h-lg)] items-center gap-2 rounded-md border bg-bg px-4",
              "transition-[border-color,box-shadow] duration-150",
              "focus-within:border-accent focus-within:shadow-[var(--shadow-focus)]",
              error ? "border-danger focus-within:border-danger" : "border-border",
            )}
          >
            <svg
              className="h-4 w-4 shrink-0 text-muted"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden
            >
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10.5 10.5L14 14" />
            </svg>
            <input
              id="home-nickname"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (e.target.value.trim()) setError(false);
              }}
              placeholder="输入玩家昵称"
              aria-label="玩家昵称"
              aria-invalid={error}
              autoComplete="off"
              className="h-full min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 text-base leading-none text-fg outline-none ring-0 placeholder:text-muted"
              autoFocus
            />
          </div>
          <Button
            type="submit"
            size="lg"
            className="h-[var(--control-h-lg)] w-full shrink-0 px-5 sm:w-auto"
          >
            查询
          </Button>
        </div>
        {error ? (
          <p className="text-xs text-danger">请输入昵称后再查询。</p>
        ) : (
          <p className="text-xs text-muted">
            提示：昵称需与平台显示一致（大小写敏感）。未找到时可核对平台与拼写。
          </p>
        )}
      </form>

      {recent.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="text-xs font-medium tracking-wide text-muted">
            最近搜索
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {recent.map((item) => (
              <Link
                key={`${item.platform}:${item.name}`}
                href={`/player/${item.platform}/${encodeURIComponent(item.name)}`}
                className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 text-xs font-medium text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
              >
                <span className="font-mono text-[10px] uppercase text-muted">
                  {item.platform}
                </span>
                {item.name}
              </Link>
            ))}
            <button
              type="button"
              className="text-xs text-muted hover:text-fg"
              onClick={clearRecentSearches}
            >
              清除
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
