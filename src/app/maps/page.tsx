import type {Metadata} from "next";
import Link from "next/link";
import {AppTopbar, PageShell, buttonClass} from "@/components/ui";

export const metadata: Metadata = {
  title: "地图中心已暂停 · PUBG Review",
  description: "地图中心暂时关闭，对局回放中的官方底图不受影响。",
};

export default function MapsPage() {
  return (
    <div className="flex min-h-full flex-col">
      <AppTopbar subtitle="地图中心" />
      <PageShell className="items-center justify-center text-center">
        <p className="font-mono text-sm text-muted">MAPS / PAUSED</p>
        <h1 className="text-2xl font-semibold">地图中心已暂时关闭</h1>
        <p className="max-w-md text-sm text-fg-secondary">
          独立地图目录与资料页暂停开放。对局回放里的官方底图、轨迹和图层仍可正常使用。
        </p>
        <Link href="/" className={buttonClass("primary")}>
          返回查询
        </Link>
      </PageShell>
    </div>
  );
}
