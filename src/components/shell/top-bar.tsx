"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/* ─────────────────────────────────────────────────────────
 * TOP BAR
 *
 * Lives in the root layout, so it never re-mounts between pages - which is
 * what lets the active pill travel instead of blinking.
 *
 *    0ms   tab tapped
 *    0ms   white pill slides under the new tab (spring, no bounce)
 *    0ms   labels cross-fade ink ↔ muted (150ms)
 * ───────────────────────────────────────────────────────── */

const PAGES = [
  { href: "/", label: "Prototype" },
  { href: "/decisions", label: "Assumptions & decisions" },
] as const;

const PILL = {
  spring: { type: "spring", duration: 0.4, bounce: 0 } as const,
};

export function TopBar() {
  const pathname = usePathname();

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-center bg-paper/80 px-8 py-4 backdrop-blur-xl">
      <Link href="/" className="pointer-events-auto text-body font-semibold text-ink">
        Persona
      </Link>
      <nav className="pointer-events-auto absolute left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-well/70 p-1 backdrop-blur-xl">
        {PAGES.map(({ href, label }) => {
          const current = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={current ? "page" : undefined}
              className={`relative min-h-8 rounded-full px-3.5 py-1.5 text-footnote transition-colors duration-150 ${
                current ? "text-ink" : "text-ink-muted hover:text-ink"
              }`}
            >
              {current ? (
                <motion.span
                  layoutId="top-bar-pill"
                  transition={PILL.spring}
                  className="absolute inset-0 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06),0_0_0_0.5px_rgba(0,0,0,0.06)]"
                />
              ) : null}
              <span className="relative">{label}</span>
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
