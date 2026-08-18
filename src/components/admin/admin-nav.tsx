"use client";

import { usePathname } from "next/navigation";
import { GuardedLink } from "@/components/admin/guarded-link";
import { cn } from "@/lib/cn";

const navItems = [
  { href: "/admin", label: "总览" },
  { href: "/admin/talents", label: "达人" },
  { href: "/admin/archives", label: "活动档案" },
  { href: "/admin/ladder", label: "天梯" }
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="后台主导航" className="flex flex-wrap gap-1">
      {navItems.map((item) => {
        const active = pathname === item.href;
        return (
          <GuardedLink
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "ui-pill min-h-9 border-transparent bg-transparent px-3 py-1.5 text-sm",
              active && "border-[rgba(63,82,163,0.18)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
            )}
          >
            {item.label}
          </GuardedLink>
        );
      })}
    </nav>
  );
}
