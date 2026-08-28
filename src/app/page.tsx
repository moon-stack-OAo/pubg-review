import Link from "next/link";
import {SearchForm} from "@/components/search-form";
import {Card, PageShell} from "@/components/ui";

export default function HomePage() {
  return (
    <PageShell>
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-zinc-500">PUBG Review · M2</p>
          <Link
            href="/favorites"
            className="text-sm text-zinc-500 hover:text-amber-300"
          >
            收藏玩家
          </Link>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">对局复盘分析台</h1>
        <p className="text-zinc-400">查战绩，更要看懂每一场为什么输赢。</p>
      </header>

      <Card>
        <SearchForm />
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        {[
          ["赛季概览", "KPI + 弱点标签，可按标签过滤对局"],
          ["分析 Tab", "雷达粗分 + 主要问题与建议聚合"],
          ["复盘报告", "无遥测初判标签与可执行建议"],
        ].map(([title, desc]) => (
          <Card key={title}>
            <h2 className="font-medium text-zinc-100">{title}</h2>
            <p className="mt-1 text-sm text-zinc-500">{desc}</p>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}
