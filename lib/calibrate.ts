// Calibration: the category multiples, read off the snapshot's own live tokens.
// No constant here is a price — every multiple is a statistic of the snapshot itself.

import { isPreToken } from './snapshot.ts';
import { SnapshotError } from './types.ts';
import type { Calibration, GlobalCalibration, Snapshot, SnapshotProtocol } from './types.ts';
import { clamp, median, round4 } from './util.ts';

/** Multiples are clamped to this band so no thin category prices a token at 0x or 400x TVL. */
export const MULTIPLE_MIN = 0.05;
export const MULTIPLE_MAX = 3.0;

/** Shrinkage prior strength: a category's own median counts n/(n + SHRINK_PRIOR) of its multiple. */
export const SHRINK_PRIOR = 8;

/**
 * Calibrate the multiples from the snapshot: per-category medians of mcap/TVL over the protocols
 * whose token already trades, shrunk toward the global median in log space. Deterministic: the
 * category list is sorted by name and every statistic is order-free.
 */
export function calibrate(snapshot: Snapshot): { global: GlobalCalibration; byCategory: Map<string, Calibration> } {
  const ratiosByCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!(ratio > 0)) continue;
    all.push(ratio);
    const key = p.category ?? '';
    const list = ratiosByCategory.get(key);
    if (list === undefined) ratiosByCategory.set(key, [ratio]);
    else list.push(ratio);
  }
  if (all.length === 0) throw new SnapshotError('snapshot.json records no tokenized protocol with a market cap: nothing to calibrate from');
  const globalMedian = median(all);
  const global: GlobalCalibration = {
    tokenized_count: all.length,
    median_ratio: round4(globalMedian),
    multiple: round4(clamp(globalMedian, MULTIPLE_MIN, MULTIPLE_MAX)),
  };
  const byCategory = new Map<string, Calibration>();
  for (const category of [...ratiosByCategory.keys()].sort()) {
    const ratios = ratiosByCategory.get(category)!;
    const med = median(ratios);
    const w = ratios.length / (ratios.length + SHRINK_PRIOR);
    const shrunk = Math.exp(w * Math.log(med) + (1 - w) * Math.log(globalMedian));
    byCategory.set(category, {
      category,
      tokenized_count: ratios.length,
      median_ratio: round4(med),
      multiple: round4(clamp(shrunk, MULTIPLE_MIN, MULTIPLE_MAX)),
    });
  }
  return { global, byCategory };
}

/** The multiple one protocol is priced with: its category's, or the global when its kind has no live token. */
export function multipleFor(p: SnapshotProtocol, cal: { global: GlobalCalibration; byCategory: Map<string, Calibration> }): number {
  return cal.byCategory.get(p.category ?? '')?.multiple ?? cal.global.multiple;
}
