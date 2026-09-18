import type {Metadata} from "next";
import Link from "next/link";
import {WeaponCatalogCard} from "@/components/weapon-catalog-card";
import {AppTopbar, Chip, PageShell} from "@/components/ui";
import {
  isWeaponCategory,
  listWeaponCategories,
  listWeaponsByCategory,
  weaponCategoryLabel,
  type WeaponCategory,
} from "@/lib/pubg/weapons";

export const metadata: Metadata = {
  title: "武器库 · PUBG Review",
  description: "PUBG 常见武器图鉴（官方 api-assets 图标），与玩家战绩无关。",
};

type Props = {
  searchParams: Promise<{category?: string}>;
};

export default async function WeaponsPage({searchParams}: Props) {
  const {category: rawCategory} = await searchParams;
  const category: WeaponCategory | null =
    rawCategory && isWeaponCategory(rawCategory) ? rawCategory : null;
  const weapons = listWeaponsByCategory(category);
  const categories = listWeaponCategories();

  return (
    <div className="flex min-h-full flex-col">
      <AppTopbar subtitle="武器库" />
      <PageShell>
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-[var(--tracking-label)] text-accent">
              Weapon Atlas
            </p>
            <h1 className="mt-1 text-3xl font-semibold">武器库</h1>
            <p className="mt-2 max-w-2xl text-sm text-fg-secondary">
              基于 PUBG API Assets 的常见武器图鉴，仅作资料查阅；与玩家战绩
              Tab、对局复盘无绑定。
            </p>
          </div>
          <span className="font-mono text-sm text-muted">
            {weapons.length} WEAPONS
          </span>
        </header>

        <div className="flex flex-wrap gap-2">
          <Link href="/weapons" className="no-underline">
            <Chip tone="neutral" active={!category}>
              全部
            </Chip>
          </Link>
          {categories.map((cat) => (
            <Link
              key={cat}
              href={`/weapons?category=${cat}`}
              className="no-underline"
            >
              <Chip tone="neutral" active={category === cat}>
                {weaponCategoryLabel(cat)}
              </Chip>
            </Link>
          ))}
        </div>

        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {weapons.map((weapon) => (
            <WeaponCatalogCard key={weapon.id} weapon={weapon} />
          ))}
        </ul>

        {weapons.length === 0 ? (
          <p className="text-sm text-muted">该分类暂无收录武器。</p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs text-muted">
          <span>
            图标来自官方 api-assets，本地静态托管；不含强度排名或开挂判定。
          </span>
          <a
            href="https://github.com/pubg/api-assets/tree/master/Assets/Item/Weapon"
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:underline"
          >
            PUBG API Assets
          </a>
        </div>
      </PageShell>
    </div>
  );
}
