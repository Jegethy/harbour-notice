"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "On duty now" },
  { href: "/admin/staff", label: "Staff" },
  { href: "/admin/rota", label: "Rota" },
  { href: "/admin/settings", label: "Settings" },
] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-1" aria-label="Admin sections">
      {LINKS.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors sm:text-base ${
              active
                ? "bg-brand-cream text-brand-primary"
                : "text-brand-cream/80 hover:bg-brand-deep hover:text-brand-cream"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
