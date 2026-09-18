import Link from "next/link";
import {AppTopbar, PageShell, buttonClass} from "@/components/ui";

export default function MapNotFound() {
  return (
    <div className="flex min-h-full flex-col">
      <AppTopbar subtitle="地图资料" />
      <PageShell className="items-center justify-center text-center">
        <p className="font-mono text-sm text-muted">404 / MAP NOT FOUND</p>
        <h1 className="text-2xl font-semibold">未找到这张地图</h1>
        <Link href="/maps" className={buttonClass("primary")}>
          返回地图中心
        </Link>
      </PageShell>
    </div>
  );
}
