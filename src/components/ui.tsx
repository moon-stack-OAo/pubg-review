import Link from "next/link";
import type {ButtonHTMLAttributes, ReactNode} from "react";
import {parseGameMode} from "@/lib/game-mode";

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function PageShell({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <main
      className={cn(
        "mx-auto flex w-full max-w-[var(--content-max)] flex-1 flex-col gap-6 px-4 py-8 md:px-6",
        className,
      )}
    >
      {children}
      <footer className="mt-auto border-t border-border pt-4 text-center text-xs text-muted">
        数据来自 PUBG 官方 API · 仅用于个人查询与复盘分析
      </footer>
    </main>
  );
}

export function AppTopbar({
  subtitle = "自托管复盘分析台",
  leftExtra,
  right,
}: {
  subtitle?: string;
  leftExtra?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="flex h-[var(--header-height)] items-center justify-between border-b border-border bg-bg-elevated px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/" className="flex shrink-0 items-center gap-3">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-accent to-[oklch(62%_0.12_250)] font-mono text-[11px] font-semibold text-accent-fg">
            PR
          </span>
          <span>
            <span className="block text-sm font-semibold tracking-tight">
              PUBG Review
            </span>
            <span className="block text-xs text-muted">{subtitle}</span>
          </span>
        </Link>
        {leftExtra ? (
          <div className="hidden min-w-0 items-center gap-2 sm:flex">
            {leftExtra}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{right}</div>
    </header>
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
      className={cn(
        "rounded-xl border border-border bg-surface p-4 shadow-[var(--shadow-sm)] md:p-5",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function Kpi({
  label,
  value,
  hint,
  className = "",
}: {
  label: string;
  value: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-[var(--kpi-min)] rounded-lg border border-border bg-surface-2 p-3",
        className,
      )}
      title={hint}
    >
      <div className="text-xs font-medium uppercase tracking-[var(--tracking-label)] text-muted">
        {label}
      </div>
      <div className="mt-1 font-mono text-4xl font-semibold leading-none tracking-tight text-fg tabular-nums">
        {value}
      </div>
    </div>
  );
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "soft";
type BtnSize = "sm" | "md" | "lg";

const btnVariant: Record<BtnVariant, string> = {
  primary:
    "border-transparent bg-accent text-accent-fg hover:brightness-110 disabled:opacity-45",
  secondary:
    "border-border-strong bg-surface-2 text-fg hover:bg-surface-hover",
  ghost:
    "border-transparent bg-transparent text-fg-secondary hover:bg-surface-hover hover:text-fg",
  danger:
    "border-transparent bg-danger text-danger-fg hover:brightness-110",
  soft:
    "border-border bg-surface text-fg-secondary hover:bg-surface-hover hover:text-fg",
};

const btnSize: Record<BtnSize, string> = {
  sm: "h-[var(--control-h-sm)] px-3 text-xs",
  md: "h-[var(--control-h-md)] px-4 text-sm",
  lg: "h-[var(--control-h-lg)] px-5 text-base",
};

export function buttonClass(
  variant: BtnVariant = "primary",
  size: BtnSize = "md",
  className = "",
) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-md border font-medium transition-[background,border-color,box-shadow,color,filter] duration-150 disabled:cursor-not-allowed whitespace-nowrap",
    btnVariant[variant],
    btnSize[size],
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: BtnSize;
}) {
  return (
    <button className={buttonClass(variant, size, className)} {...props} />
  );
}

export type ChipTone =
  | "neutral"
  | "accent"
  | "weakness"
  | "insight"
  | "success"
  | "warning"
  | "danger"
  | "rank1"
  | "rank10"
  | "solo"
  | "duo"
  | "squad"
  | "fpp"
  | "tpp";

export function Chip({
  children,
  active = false,
  tone = "neutral",
  className = "",
  as: As = "span",
  ...rest
}: {
  children: ReactNode;
  active?: boolean;
  tone?: ChipTone;
  className?: string;
  as?: "span" | "button" | "a";
} & Record<string, unknown>) {
  const tones: Record<string, string> = {
    neutral: active
      ? "border-accent-border bg-accent-muted text-fg"
      : "border-border bg-surface-2 text-fg-secondary hover:bg-surface-hover hover:text-fg",
    accent: "border-accent-border bg-accent-muted text-fg",
    weakness: "border-tag-weakness/40 bg-tag-weakness-muted text-tag-weakness",
    insight: "border-tag-insight/40 bg-tag-insight-muted text-tag-insight",
    success: "border-success/40 bg-success-muted text-success",
    warning: "border-warning/40 bg-warning-muted text-warning",
    danger: "border-danger/40 bg-danger-muted text-danger",
    rank1: "border-rank-1/40 bg-rank-1-muted text-rank-1",
    rank10: "border-rank-top10/40 bg-rank-top10-muted text-rank-top10",
    solo: "border-mode-solo/40 bg-mode-solo/15 text-mode-solo",
    duo: "border-mode-duo/40 bg-mode-duo/15 text-mode-duo",
    squad: "border-mode-squad/40 bg-mode-squad/15 text-mode-squad",
    fpp: "border-perspective-fpp/40 bg-perspective-fpp/15 text-perspective-fpp",
    tpp: "border-perspective-tpp/40 bg-perspective-tpp/15 text-perspective-tpp",
  };
  return (
    <As
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
        tones[tone],
        active && tone !== "neutral"
          ? "ring-1 ring-accent/60 ring-offset-1 ring-offset-bg"
          : null,
        className,
      )}
      {...rest}
    >
      {children}
    </As>
  );
}

export function GameModeChips({
  gameMode,
  className = "",
  size = "md",
}: {
  gameMode: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const parsed = parseGameMode(gameMode);
  const modeTone: ChipTone =
    parsed.mode === "other" ? "neutral" : parsed.mode;
  const chipSize =
    size === "sm" ? "h-6 px-2 text-[11px]" : undefined;

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      <Chip tone={modeTone} className={chipSize}>
        {parsed.modeLabel}
      </Chip>
      {parsed.perspectiveLabel ? (
        <Chip
          tone={parsed.perspective === "fpp" ? "fpp" : "tpp"}
          className={chipSize}
        >
          {parsed.perspectiveLabel}
        </Chip>
      ) : null}
    </span>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <Card className="border-danger/40 bg-danger-muted text-danger">
      <p className="font-medium">加载失败</p>
      <p className="mt-1 text-sm text-fg-secondary">{message}</p>
    </Card>
  );
}

export function LoadingBox({ text = "加载中…" }: { text?: string }) {
  return (
    <Card>
      <div className="animate-pulse space-y-3">
        <div className="h-4 w-40 rounded bg-surface-2" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 rounded-lg bg-surface-2" />
          ))}
        </div>
        <p className="text-sm text-muted">{text}</p>
      </div>
    </Card>
  );
}

export function AlertBox({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  title?: string;
  children: ReactNode;
}) {
  const map = {
    info: "border-info/40 bg-info-muted text-fg",
    warning: "border-warning/40 bg-warning-muted text-warning",
    danger: "border-danger/40 bg-danger-muted text-danger",
    success: "border-success/40 bg-success-muted text-success",
  };
  return (
    <div className={cn("rounded-lg border px-3 py-2 text-sm", map[tone])}>
      {title ? <p className="font-medium">{title}</p> : null}
      <div className={title ? "mt-1 text-fg-secondary" : ""}>{children}</div>
    </div>
  );
}
