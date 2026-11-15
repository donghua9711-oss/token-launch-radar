// The two per-protocol adjustments to a category multiple: this week's growth,
// and time survived with no token. Both are centred on 1 — neutral until earned.

import { clamp } from './util.ts';

/** change_7d is clamped to this band before it becomes a growth factor. */
export const GROWTH_FLOOR = -60;
export const GROWTH_CAP = 150;
export const GROWTH_DIVISOR = 250;

/** age_factor = AGE_BASE + AGE_SLOPE x log10(1 + days / AGE_SCALE_DAYS), capped to [AGE_BASE, AGE_CAP]. */
export const AGE_BASE = 0.85;
export const AGE_SLOPE = 0.3;
export const AGE_SCALE_DAYS = 30;
export const AGE_CAP = 1.25;

/** The growth factor: this week's TVL momentum, clamped, as a multiplier centred on 1. */
export function growthFactor(change7d: number | null): number {
  if (change7d === null || !Number.isFinite(change7d)) return 1;
  return 1 + clamp(change7d, GROWTH_FLOOR, GROWTH_CAP) / GROWTH_DIVISOR;
}

/** The age factor: a log-scaled maturity bonus for time run with no token; unknown age is neutral. */
export function ageFactor(days: number | null): number {
  if (days === null) return 1;
  return clamp(AGE_BASE + AGE_SLOPE * Math.log10(1 + days / AGE_SCALE_DAYS), AGE_BASE, AGE_CAP);
}
