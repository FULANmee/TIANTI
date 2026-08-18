"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Home, Search, Shield, Trophy, Users } from "lucide-react";
import { cn } from "@/lib/cn";

const navItems = [
  { href: "/", label: "首页", icon: Home },
  { href: "/talents", label: "达人", icon: Users },
  { href: "/events", label: "活动", icon: CalendarDays },
  { href: "/ladder", label: "天梯", icon: Trophy },
  { href: "/search", label: "搜索", icon: Search }
];

export function SiteHeader({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <header
      data-testid="site-header"
      className={cn(
        "sticky top-0 z-50 border-b border-[var(--line-soft)] bg-[rgba(243,246,245,0.94)] backdrop-blur-md",
        className
      )}
    >
      <div className="mx-auto flex w-full max-w-7xl items-center gap-4 px-4 py-3 md:justify-between md:px-8">
        <Link href="/" className="shrink-0 border-r border-[var(--line-strong)] pr-4">
          <span className="block font-display text-2xl tracking-[0.16em] text-[var(--foreground)]">TIANTI</span>
          <span className="block text-[9px] tracking-[0.18em] ui-muted">人物与活动档案</span>
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-2 md:flex-none">
          <nav aria-label="主导航" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto md:flex-none">
            {navItems.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("ui-pill shrink-0 border-transparent bg-transparent px-3 py-1.5 text-sm", active && "border-[rgba(63,82,163,0.18)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]")}>
                <item.icon aria-hidden="true" className="size-3.5" />
                {item.label}
              </Link>;
            })}
          </nav>
          <span className="hidden sm:contents">
            <Link href="/admin" className="ui-button-primary shrink-0 text-sm">
              <Shield aria-hidden="true" className="size-4" />
              后台
            </Link>
          </span>
        </div>
      </div>
    </header>
  );
}
