import type {Metadata} from "next";
import Link from "next/link";
import {AppTopbar, PageShell, buttonClass} from "@/components/ui";

export const metadata: Metadata = {
  title: "地图中心已暂停 · PUBG Review",
  description: "地图中心暂时关闭，对局回放中的官方底图不受影响。",
};

export default function MapDetailPage() {
  return (
    <div className="flex min-h-full flex-col">
      <AppTopbar subtitle="地图资料" />
      <PageShell className="items-center justify-center text-center">
        <p className="font-mono text-sm text-muted">MAPS / PAUSED</p>
        <h1 className="text-2xl font-semibold">地图资料页已暂时关闭</h1>
        <p className="max-w-md text-sm text-fg-secondary">
          单地图资料与 POI 查看暂停开放。需要看落点和路线时，请从对局进入 2D 回放。
        </p>
        <Link href="/" className={buttonClass("primary")}>
          返回查询
        </Link>
      </PageShell>
    </div>
  );
}
