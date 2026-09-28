"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ADMIN_TABS = [
  { label: "Обзор", href: "/admin", instanceOnly: true },
  { label: "Настройки", href: "/admin/settings", instanceOnly: true },
  { label: "Пользователи", href: "/admin/users", instanceOnly: false },
  { label: "Состояние системы", href: "/admin/health", instanceOnly: true },
] as const;

export function AdminNav({ instanceAdmin }: { instanceAdmin: boolean }) {
  const pathname = usePathname();
  const tabs = ADMIN_TABS.filter((tab) => instanceAdmin || !tab.instanceOnly);

  return (
    <nav
      aria-label="Разделы администрирования"
      className="flex items-center gap-1 border-b border-rule"
    >
      {tabs.map((tab) => {
        const active =
          tab.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative -mb-px h-9 px-3 text-[14px] text-ink-3 transition-colors hover:text-ink",
              active && "text-ink font-medium"
            )}
          >
            {tab.label}
            {active && (
              <span className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-accent" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
