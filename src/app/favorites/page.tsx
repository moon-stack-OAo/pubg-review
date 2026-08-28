"use client";

import Link from "next/link";
import {useCallback, useSyncExternalStore} from "react";
import {Card, PageShell} from "@/components/ui";
import {
    type FavoritePlayer,
    getFavoritesServerSnapshot,
    readFavorites,
    removeFavorite,
    subscribeFavorites,
} from "@/lib/favorites";
import {formatDateTime} from "@/lib/format";

function FavoritesList({ items }: { items: FavoritePlayer[] }) {
  const onRemove = useCallback((item: FavoritePlayer) => {
    removeFavorite(item.accountId, item.platform);
  }, []);

  if (items.length === 0) {
    return (
      <Card>
        <p className="text-sm text-zinc-500">
          暂无收藏。在玩家页点击「收藏」即可加入本机列表（localStorage）。
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-zinc-500">
            <tr>
              <th className="px-2 py-2 font-medium">昵称</th>
              <th className="px-2 py-2 font-medium">平台</th>
              <th className="px-2 py-2 font-medium">收藏时间</th>
              <th className="px-2 py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={`${item.platform}:${item.accountId}`}
                className="border-t border-zinc-800/80"
              >
                <td className="px-2 py-2">
                  <Link
                    href={`/player/${item.platform}/${encodeURIComponent(item.name)}`}
                    className="text-amber-300 hover:underline"
                  >
                    {item.name}
                  </Link>
                  <div className="mt-0.5 text-xs text-zinc-600">
                    {item.accountId}
                  </div>
                </td>
                <td className="px-2 py-2">{item.platform}</td>
                <td className="px-2 py-2 text-zinc-400">
                  {formatDateTime(item.savedAt)}
                </td>
                <td className="px-2 py-2">
                  <button
                    type="button"
                    onClick={() => onRemove(item)}
                    className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:border-rose-500/40 hover:text-rose-300"
                  >
                    取消收藏
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-zinc-600">
        本机收藏，不自动批量刷新。进入玩家页可点「同步近况」写入本地历史库（90s
        冷却），避免打满 10 RPM。
      </p>
    </Card>
  );
}

export default function FavoritesPage() {
  const items = useSyncExternalStore(
    subscribeFavorites,
    readFavorites,
    getFavoritesServerSnapshot,
  );

  return (
    <PageShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
            ← 返回搜索
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">收藏玩家</h1>
          <p className="text-sm text-zinc-500">共 {items.length} 人 · 设备本地</p>
        </div>
      </div>
      <FavoritesList items={items} />
    </PageShell>
  );
}
