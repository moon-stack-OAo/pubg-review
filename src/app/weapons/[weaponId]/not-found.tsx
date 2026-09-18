import Link from "next/link";
import {AppTopbar, PageShell, buttonClass} from "@/components/ui";

export default function WeaponNotFound() {
  return (
    <div className="flex min-h-full flex-col">
      <AppTopbar subtitle="武器资料" />
      <PageShell className="items-center justify-center text-center">
        <p className="font-mono text-sm text-muted">404 / WEAPON NOT FOUND</p>
        <h1 className="text-2xl font-semibold">未找到这把武器</h1>
        <Link href="/weapons" className={buttonClass("primary")}>
          返回武器库
        </Link>
      </PageShell>
    </div>
  );
}
