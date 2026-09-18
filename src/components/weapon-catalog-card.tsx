import Image from "next/image";
import Link from "next/link";
import {Chip} from "@/components/ui";
import {
  weaponCategoryLabel,
  type PubgWeaponInfo,
} from "@/lib/pubg/weapons";

export function WeaponCatalogCard({weapon}: {weapon: PubgWeaponInfo}) {
  return (
    <li>
      <Link
        href={`/weapons/${weapon.id}`}
        className="group block overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--shadow-sm)] transition-[border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-accent-border"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-black">
          {weapon.image ? (
            <Image
              src={weapon.image}
              alt={`${weapon.name}武器图标`}
              fill
              sizes="(max-width: 767px) 100vw, (max-width: 1199px) 50vw, 25vw"
              className="object-contain p-6 transition-transform duration-300 group-hover:scale-[1.04]"
            />
          ) : (
            <div className="grid h-full place-items-center px-4 text-center text-sm text-muted">
              暂无图标
            </div>
          )}
        </div>
        <div className="space-y-2 border-t border-border px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-fg">
                {weapon.name}
              </h2>
              <p className="truncate text-xs text-muted">{weapon.englishName}</p>
            </div>
            <Chip tone="neutral" className="shrink-0">
              {weaponCategoryLabel(weapon.category)}
            </Chip>
          </div>
          {weapon.summary ? (
            <p className="line-clamp-2 text-sm leading-snug text-fg-secondary">
              {weapon.summary}
            </p>
          ) : null}
        </div>
      </Link>
    </li>
  );
}
