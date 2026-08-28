import type {ReactNode} from "react";

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8">
      {children}
      <footer className="mt-auto border-t border-zinc-900 pt-4 text-center text-xs text-zinc-600">
        数据来自 PUBG 官方 API · 仅用于个人查询与复盘分析
      </footer>
    </main>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 ${className}`}
    >
      {children}
    </section>
  );
}

export function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3" title={hint}>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight text-zinc-100">{value}</div>
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <Card className="border-rose-900/60 bg-rose-950/20 text-rose-200">
      <p className="font-medium">加载失败</p>
      <p className="mt-1 text-sm text-rose-300/90">{message}</p>
    </Card>
  );
}

export function LoadingBox({ text = "加载中…" }: { text?: string }) {
  return (
    <Card>
      <div className="animate-pulse space-y-3">
        <div className="h-4 w-40 rounded bg-zinc-800" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-zinc-800/80" />
          ))}
        </div>
        <p className="text-sm text-zinc-500">{text}</p>
      </div>
    </Card>
  );
}
