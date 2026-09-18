import type {Metadata} from "next";
import Image from "next/image";
import Link from "next/link";
import {notFound} from "next/navigation";
import {AppTopbar, Chip, PageShell, buttonClass} from "@/components/ui";
import {getMapById, listMaps, mapSizeLabel} from "@/lib/pubg/maps";

type Props = {
  params: Promise<{mapId: string}>;
};

export function generateStaticParams() {
  return listMaps().map((map) => ({mapId: map.id}));
}

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {mapId} = await params;
  const map = getMapById(mapId);
  if (!map) return {title: "地图不存在 · PUBG Review"};
  return {
    title: `${map.name}地图 · PUBG Review`,
    description: `${map.name}（${map.englishName}）官方底图、遥测坐标尺寸与 PUBG API 标识。`,
  };
}

export default async function MapDetailPage({params}: Props) {
  const {mapId} = await params;
  const map = getMapById(mapId);
  if (!map) notFound();

  return (
    <div className="flex min-h-full flex-col">
      <AppTopbar
        subtitle="地图资料"
        right={
          <Link href="/maps" className={buttonClass("ghost", "sm")}>
            全部地图
          </Link>
        }
      />
      <PageShell>
        <nav aria-label="面包屑" className="text-xs text-muted">
          <Link href="/maps" className="hover:text-fg">
            地图中心
          </Link>
          <span aria-hidden className="mx-2">/</span>
          <span aria-current="page">{map.name}</span>
        </nav>

        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-[var(--tracking-label)] text-accent">
              {map.englishName}
            </p>
            <h1 className="mt-1 text-3xl font-semibold">{map.name}</h1>
            <p className="mt-2 max-w-2xl text-sm text-fg-secondary">{map.summary}</p>
          </div>
          <Chip tone="neutral">遥测坐标 {mapSizeLabel(map.sizeCm)}</Chip>
        </header>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <figure className="overflow-hidden rounded-lg border border-border bg-black shadow-[var(--shadow-md)]">
            <Image
              src={map.image}
              alt={`${map.name}官方地图底图`}
              width={1024}
              height={1024}
              priority
              className="aspect-square h-auto w-full object-cover"
            />
            <figcaption className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface px-4 py-3 text-xs text-muted">
              <span>{map.assetFile}</span>
              <a
                href={`https://github.com/pubg/api-assets/blob/master/Assets/Maps/${map.assetFile}`}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
              >
                查看官方资源
              </a>
            </figcaption>
          </figure>

          <aside className="space-y-5 border-l border-border pl-5 max-lg:border-l-0 max-lg:border-t max-lg:pl-0 max-lg:pt-5">
            <section>
              <h2 className="text-sm font-semibold">地图规格</h2>
              <dl className="mt-3 divide-y divide-border border-y border-border text-sm">
                <div className="flex items-center justify-between gap-4 py-3">
                  <dt className="text-muted">遥测边长</dt>
                  <dd className="font-mono text-fg">{mapSizeLabel(map.sizeCm)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 py-3">
                  <dt className="text-muted">坐标范围</dt>
                  <dd className="font-mono text-fg">0–{map.sizeCm.toLocaleString()}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 py-3">
                  <dt className="text-muted">资源规格</dt>
                  <dd className="text-fg">Low Res</dd>
                </div>
              </dl>
            </section>

            <section>
              <h2 className="text-sm font-semibold">PUBG API 标识</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {map.apiNames.map((apiName) => (
                  <code
                    key={apiName}
                    className="rounded border border-border bg-surface-2 px-2 py-1 text-xs text-fg-secondary"
                  >
                    {apiName}
                  </code>
                ))}
              </div>
            </section>

            <section className="border-t border-border pt-5 text-xs leading-relaxed text-muted">
              地图资源来自 PUBG API Assets，使用须遵循 PUBG Terms of Use 与 Player-created Content 条款。
            </section>
          </aside>
        </div>
      </PageShell>
    </div>
  );
}
