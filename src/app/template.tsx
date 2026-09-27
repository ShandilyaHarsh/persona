"use client";

import { motion } from "motion/react";

/* ─────────────────────────────────────────────────────────
 * PAGE ENTRANCE
 *
 * A template re-mounts on every navigation (a layout doesn't), so each page
 * arrives the same way while the top bar above it stays put.
 *
 *    0ms   page content: opacity 0 → 1, y 8 → 0, blur 4px → 0
 * ───────────────────────────────────────────────────────── */

const PAGE = {
  riseY: 8,
  blur: 4,
  spring: { type: "spring", duration: 0.5, bounce: 0 } as const,
};

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: PAGE.riseY, filter: `blur(${PAGE.blur}px)` }}
      // A filter left on the page, even blur(0), would trap everything inside
      // it in a new stacking context - so it's removed once the page lands.
      animate={{ opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none" } }}
      transition={PAGE.spring}
      className="h-full"
    >
      {children}
    </motion.div>
  );
}
