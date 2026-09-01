"use client";

import Link from "next/link";
import {useCallback, useSyncExternalStore} from "react";
import {FavoritesSyncPanel} from "@/components/favorites-sync-panel";
import {Card, PageShell} from "@/components/ui";
import {
  type FavoritePlayer,
  getFavoritesServerSnapshot,
  readFavorites,
  removeFavorite,
  subscribeFavorites,
} from "@/lib/favorites";

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

  return <FavoritesSyncPanel items={items} onRemove={onRemove} />;
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
