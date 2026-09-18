import type {Metadata} from "next";
import Image from "next/image";
import Link from "next/link";
import {notFound} from "next/navigation";
import {AppTopbar, Chip, PageShell, buttonClass} from "@/components/ui";
import {
  getWeaponById,
  listWeapons,
  weaponAssetGithubUrl,
  weaponCategoryLabel,
} from "@/lib/pubg/weapons";

type Props = {
  params: Promise<{weaponId: string}>;
};

export function generateStaticParams() {
  return listWeapons().map((weapon) => ({weaponId: weapon.id}));
}

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {weaponId} = await params;
  const weapon = getWeaponById(weaponId);
  if (!weapon) return {title: "武器不存在 · PUBG Review"};
  return {
    title: `${weapon.name} · 武器库 · PUBG Review`,
    description: `${weapon.name}（${weapon.englishName}）官方资源标识与遥测 ID。`,
  };
}

export default async function WeaponDetailPage({params}: Props) {
  const {weaponId} = await params;
  const weapon = getWeaponById(weaponId);
  if (!weapon) notFound();

  const githubUrl = weaponAssetGithubUrl(weapon);

  return (
    <div className="flex min-h-full flex-col">
      <AppTopbar
        subtitle="武器资料"
        right={
          <Link href="/weapons" className={buttonClass("ghost", "sm")}>
            全部武器
          </Link>
        }
      />
      <PageShell>
        <nav aria-label="面包屑" className="text-xs text-muted">
          <Link href="/weapons" className="hover:text-fg">
            武器库
          </Link>
          <span aria-hidden className="mx-2">
            /
          </span>
          <span aria-current="page">{weapon.name}</span>
        </nav>

        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-[var(--tracking-label)] text-accent">
              {weapon.englishName}
            </p>
            <h1 className="mt-1 text-3xl font-semibold">{weapon.name}</h1>
            {weapon.summary ? (
              <p className="mt-2 max-w-2xl text-sm text-fg-secondary">
                {weapon.summary}
              </p>
            ) : null}
          </div>
          <Chip tone="neutral">{weaponCategoryLabel(weapon.category)}</Chip>
        </header>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <figure className="overflow-hidden rounded-lg border border-border bg-black shadow-[var(--shadow-md)]">
            {weapon.image ? (
              <Image
                src={weapon.image}
                alt={`${weapon.name}武器图标`}
                width={640}
                height={480}
                priority
                className="mx-auto h-auto w-full max-w-xl object-contain p-10"
              />
            ) : (
              <div className="grid aspect-[4/3] place-items-center text-sm text-muted">
                暂无图标
              </div>
            )}
            <figcaption className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface px-4 py-3 text-xs text-muted">
              <span>{weapon.assetFile}</span>
              <a
                href={githubUrl}
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
              <h2 className="text-sm font-semibold">武器规格</h2>
              <dl className="mt-3 divide-y divide-border border-y border-border text-sm">
                <div className="flex items-center justify-between gap-4 py-3">
                  <dt className="text-muted">分类</dt>
                  <dd className="text-fg">
                    {weaponCategoryLabel(weapon.category)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4 py-3">
                  <dt className="text-muted">资源目录</dt>
                  <dd className="font-mono text-fg">{weapon.assetSubdir}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 py-3">
                  <dt className="text-muted">Item 资源名</dt>
                  <dd className="break-all font-mono text-xs text-fg">
                    {weapon.itemAssetId}
                  </dd>
                </div>
              </dl>
            </section>

            <section>
              <h2 className="text-sm font-semibold">遥测 ID</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {weapon.telemetryIds.map((tid) => (
                  <code
                    key={tid}
                    className="rounded border border-border bg-surface-2 px-2 py-1 text-xs text-fg-secondary"
                  >
                    {tid}
                  </code>
                ))}
              </div>
            </section>

            <section className="border-t border-border pt-5 text-xs leading-relaxed text-muted">
              图标与资源标识来自 PUBG API Assets，使用须遵循 PUBG Terms of Use
              与 Player-created Content 条款。本页仅作客观资料展示，不含强度排名或开挂判定。
            </section>
          </aside>
        </div>
      </PageShell>
    </div>
  );
}
