import {SearchForm} from "@/components/search-form";
import {AppTopbar, cn} from "@/components/ui";

const FEATURES = [
  {
    title: "赛季概览",
    desc: "KD、胜率、Top10 与样本量一眼扫完，趋势对比帮你判断是状态波动还是系统性短板。",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <path d="M2 12V6h4v6M7 12V3h4v9M12 12V8h2v4" />
      </svg>
    ),
  },
  {
    title: "对局复盘",
    desc: "每场附可解释标签：为什么死、哪里失分。弱点写成可执行结论，而不是空泛评分。",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <path d="M3 3h10v10H3z" />
        <path d="M5 8h6M5 11h4" />
      </svg>
    ),
  },
  {
    title: "2D 回放",
    desc: "路径、交火与圈压时间轴对齐，适合小队复盘配合失误与位移决策。",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <circle cx="8" cy="8" r="5.5" />
        <path d="M6.5 5.5l5 2.5-5 2.5z" />
      </svg>
    ),
  },
] as const;

export default function HomePage() {
  return (
    <div className="flex min-h-full flex-col">
      <AppTopbar />

      <main className="flex flex-1 flex-col items-center px-4 pb-[max(3rem,var(--safe-bottom))] pt-8 sm:px-6 md:pt-12">
        <section className="mb-8 flex w-full max-w-[44rem] flex-col items-center gap-4 text-center">
          <p className="text-xs font-medium uppercase tracking-[var(--tracking-label)] text-muted">
            Self-hosted · Match Review
          </p>
          <h1 className="m-0 text-[clamp(1.75rem,3vw,2.5rem)] font-bold leading-tight tracking-tight">
            PUBG 复盘分析台
          </h1>
          <p className="m-0 w-full text-base text-fg-secondary">
            查战绩，更要看懂每一场为什么输赢 —— 输入昵称，定位弱点，拿到可执行改进建议。
          </p>
        </section>

        <section
          className={cn(
            "flex w-full max-w-[44rem] flex-col gap-4 rounded-lg border border-border",
            "bg-surface p-5 shadow-[var(--shadow-md)]",
          )}
        >
          <SearchForm />
        </section>

        <section
          className="mt-10 grid w-full max-w-[56rem] gap-4 md:grid-cols-3"
          aria-label="产品卖点"
        >
          {FEATURES.map((f) => (
            <article
              key={f.title}
              className="flex min-h-full flex-col gap-3 rounded-lg border border-border bg-surface p-5 shadow-[var(--shadow-sm)]"
            >
              <div className="grid h-8 w-8 place-items-center rounded-md border border-accent-border bg-accent-muted text-accent [&_svg]:h-4 [&_svg]:w-4">
                {f.icon}
              </div>
              <h2 className="m-0 text-base font-semibold">{f.title}</h2>
              <p className="m-0 text-sm leading-snug text-fg-secondary">{f.desc}</p>
            </article>
          ))}
        </section>

        <p className="mt-10 text-center text-xs text-muted">
          数据来自 PUBG 官方 API · 仅用于个人查询与复盘分析
        </p>
      </main>
    </div>
  );
}
