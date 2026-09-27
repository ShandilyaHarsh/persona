"use client";

import { motion } from "motion/react";

/* ─────────────────────────────────────────────────────────
 * REVEAL
 *
 * The decisions page arriving in reading order: each block rises into place
 * a beat after the one above it. A one-time entrance, so a stagger helps
 * the eye follow the structure instead of costing attention on every visit
 * to a control.
 *
 *    0ms   first block: opacity 0 → 1, y 10 → 0
 *  +40ms   each following block (capped, so long pages don't crawl)
 * ───────────────────────────────────────────────────────── */

const REVEAL = {
  riseY: 10,
  stagger: 0.04, // s between blocks
  maxDelay: 0.5, // s - later blocks all arrive by then
  spring: { type: "spring", duration: 0.5, bounce: 0 } as const,
};

export function Reveal({ index, children }: { index: number; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: REVEAL.riseY }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...REVEAL.spring, delay: Math.min(index * REVEAL.stagger, REVEAL.maxDelay) }}
    >
      {children}
    </motion.div>
  );
}
