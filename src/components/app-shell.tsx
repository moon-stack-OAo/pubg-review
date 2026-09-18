"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {useEffect, useRef, useState, type ReactNode} from "react";
import {cn} from "@/components/ui";

type IconProps = {className?: string};

function SearchIcon({className}: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function MapIcon({className}: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z" />
      <path d="M9 3v15M15 6v15" />
    </svg>
  );
}

function StarIcon({className}: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 2.7 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5-4.7-4.6 6.5-.9z" />
    </svg>
  );
}

function MenuIcon({className}: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function CloseIcon({className}: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

const NAV_ITEMS = [
  {href: "/", label: "玩家查询", icon: SearchIcon},
  {href: "/maps", label: "地图中心", icon: MapIcon},
  {href: "/favorites", label: "收藏玩家", icon: StarIcon},
] as const;

function isNavItemActive(href: string, pathname: string) {
  if (href === "/maps") return pathname === "/maps" || pathname.startsWith("/maps/");
  if (href === "/favorites") return pathname === "/favorites";
  return (
    pathname === "/" ||
    pathname.startsWith("/player/") ||
    pathname.startsWith("/match/") ||
    pathname.startsWith("/share/match/")
  );
}

function Brand() {
  return (
    <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="PUBG Review 首页">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-accent font-mono text-[11px] font-semibold text-accent-fg">
        PR
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">PUBG Review</span>
        <span className="block truncate text-xs text-muted">对局复盘分析台</span>
      </span>
    </Link>
  );
}

function PrimaryNav({pathname, onNavigate}: {pathname: string; onNavigate?: () => void}) {
  return (
    <nav aria-label="一级导航" className="space-y-1">
      {NAV_ITEMS.map(({href, label, icon: Icon}) => {
        const active = isNavItemActive(href, pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
            className={cn(
              "flex h-10 items-center gap-3 rounded-md border px-3 text-sm font-medium transition-colors",
              active
                ? "border-accent-border bg-accent-muted text-fg"
                : "border-transparent text-fg-secondary hover:bg-surface-hover hover:text-fg",
            )}
          >
            <Icon className={cn("h-[18px] w-[18px] shrink-0", active && "text-accent")} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({children}: {children: ReactNode}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const previousPathnameRef = useRef(pathname);

  useEffect(() => {
    if (previousPathnameRef.current !== pathname) {
      previousPathnameRef.current = pathname;
      setDrawerOpen(false);
    }
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusableSelector =
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
    drawerRef.current?.querySelector<HTMLElement>(focusableSelector)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDrawerOpen(false);
        menuButtonRef.current?.focus();
        return;
      }

      if (event.key === "Tab" && drawerRef.current) {
        const focusable = Array.from(
          drawerRef.current.querySelectorAll<HTMLElement>(focusableSelector),
        );
        const first = focusable[0];
        const last = focusable.at(-1);
        if (!first || !last) return;

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [drawerOpen]);

  function closeDrawer(restoreFocus = false) {
    setDrawerOpen(false);
    if (restoreFocus) menuButtonRef.current?.focus();
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[var(--nav-width)_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh border-r border-border bg-bg-elevated lg:flex lg:flex-col">
        <div className="border-b border-border px-5 py-5">
          <Brand />
        </div>
        <div className="flex-1 px-3 py-4">
          <PrimaryNav pathname={pathname} />
        </div>
        <p className="border-t border-border px-5 py-4 text-xs leading-relaxed text-muted">
          数据来自 PUBG 官方 API
        </p>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-[var(--header-height)] items-center justify-between border-b border-border bg-bg-elevated px-4 lg:hidden">
          <Brand />
          <button
            ref={menuButtonRef}
            type="button"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-border-strong bg-surface-2 text-fg hover:bg-surface-hover"
            aria-label="打开导航菜单"
            aria-controls="mobile-navigation"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            <MenuIcon className="h-5 w-5" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-overlay"
            aria-label="关闭导航菜单"
            onClick={() => closeDrawer(true)}
          />
          <aside
            ref={drawerRef}
            id="mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label="导航菜单"
            tabIndex={-1}
            className="relative flex h-full w-[min(19rem,86vw)] flex-col border-r border-border bg-bg-elevated shadow-[var(--shadow-lg)]"
          >
            <div className="flex h-[var(--header-height)] items-center justify-between border-b border-border px-4">
              <Brand />
              <button
                type="button"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-fg-secondary hover:bg-surface-hover hover:text-fg"
                aria-label="关闭导航菜单"
                onClick={() => closeDrawer(true)}
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 px-3 py-4">
              <PrimaryNav pathname={pathname} onNavigate={() => closeDrawer()} />
            </div>
            <p className="border-t border-border px-5 py-4 text-xs text-muted">
              数据来自 PUBG 官方 API
            </p>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
