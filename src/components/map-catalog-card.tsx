import Image from "next/image";
import Link from "next/link";
import {mapSizeLabel, type PubgMapInfo} from "@/lib/pubg/maps";

export function MapCatalogCard({map}: {map: PubgMapInfo}) {
  return (
    <li>
      <Link
        href={`/maps/${map.id}`}
        className="group block overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--shadow-sm)] transition-[border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-accent-border"
      >
        <div className="relative aspect-square overflow-hidden bg-black">
          <Image
            src={map.image}
            alt={`${map.name}官方地图底图`}
            fill
            sizes="(max-width: 767px) 100vw, (max-width: 1199px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
          <div className="absolute inset-x-0 bottom-0 bg-black/75 px-4 py-3 backdrop-blur-sm">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">{map.name}</h2>
                <p className="text-xs text-white/65">{map.englishName}</p>
              </div>
              <span className="font-mono text-xs text-white/80">
                {mapSizeLabel(map.sizeCm)}
              </span>
            </div>
          </div>
        </div>
        <p className="min-h-16 px-4 py-3 text-sm leading-snug text-fg-secondary">
          {map.summary}
        </p>
      </Link>
    </li>
  );
}
