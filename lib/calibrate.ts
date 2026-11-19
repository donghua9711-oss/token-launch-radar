// Calibration: the category multiples, read off the snapshot's own live tokens.
// No constant here is a price: every multiple is a statistic of the snapshot itself.
// (The leave-one-out refit ranges the board carries live in lib/model.ts, whose ranger
// refits the whole v4 model — multiples plus signal coefficients — per left-out comp.)

import { isPreToken } from './snapshot.ts';
import { SnapshotError } from './types.ts';
import type { Calibration, GlobalCalibration, Snapshot, SnapshotProtocol } from './types.ts';
import { clamp, median, round4 } from './util.ts';

/** Multiples are clamped to this band so no thin category prices a token at 0x or 400x TVL. */
export const MULTIPLE_MIN = 0.05;
export const MULTIPLE_MAX = 3.0;

/**
 * Shrinkage prior strength: a category's own median counts n/(n + SHRINK_PRIOR) of its multiple.
 * v4 raised this from 8 to 10: on the validation splits the stronger shrinkage cost the
 * holdout almost nothing and measurably steadied the walk-forward fits (see SPEC.md ledger).
 */
export const SHRINK_PRIOR = 10;

/** A fitted set of multiples: the global line and one entry per category that has live tokens. */
export interface Fitted {
  global: GlobalCalibration;
  byCategory: Map<string, Calibration>;
}

/**
 * The comparable live tokens: protocols whose token already trades, with a positive
 * market-cap / TVL ratio. (A recorded mcap of zero or less carries no price signal and
 * is left out, exactly as the calibration has always left it out.)
 */
export function liveComps(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter(
    (p) => !isPreToken(p) && p.mcap_usd !== null && p.tvl_usd > 0 && p.mcap_usd / p.tvl_usd > 0,
  );
}

/** One shrunk, clamped multiple from a list of ratios and the global median they shrink toward. */
function shrunkMultiple(ratios: number[], globalMedian: number): number {
  const med = median(ratios);
  const w = ratios.length / (ratios.length + SHRINK_PRIOR);
  const shrunk = Math.exp(w * Math.log(med) + (1 - w) * Math.log(globalMedian));
  return clamp(shrunk, MULTIPLE_MIN, MULTIPLE_MAX);
}

/**
 * Fit the multiples from a list of live-token comps: per-category medians of mcap/TVL,
 * shrunk toward the comps' global median in log space. Deterministic: the category
 * list is sorted by name and every statistic is order-free. The board fits this on all
 * comps; the validation fits it on a training half only — same code, honest split.
 */
export function fitMultiples(comps: SnapshotProtocol[]): Fitted {
  const ratiosByCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of comps) {
    const ratio = p.mcap_usd! / p.tvl_usd;
    all.push(ratio);
    const key = p.category ?? '';
    const list = ratiosByCategory.get(key);
    if (list === undefined) ratiosByCategory.set(key, [ratio]);
    else list.push(ratio);
  }
  if (all.length === 0) throw new SnapshotError('no tokenized protocol with a market cap: nothing to calibrate from');
  const globalMedian = median(all);
  const global: GlobalCalibration = {
    tokenized_count: all.length,
    median_ratio: round4(globalMedian),
    multiple: round4(clamp(globalMedian, MULTIPLE_MIN, MULTIPLE_MAX)),
  };
  const byCategory = new Map<string, Calibration>();
  for (const category of [...ratiosByCategory.keys()].sort()) {
    const ratios = ratiosByCategory.get(category)!;
    byCategory.set(category, {
      category,
      tokenized_count: ratios.length,
      median_ratio: round4(median(ratios)),
      multiple: round4(shrunkMultiple(ratios, globalMedian)),
    });
  }
  return { global, byCategory };
}

/** Calibrate the multiples from the whole snapshot: a fit on every live comp it carries. */
export function calibrate(snapshot: Snapshot): Fitted {
  return fitMultiples(liveComps(snapshot));
}

/** The multiple one protocol is priced with: its category's, or the global when its kind has no live token. */
export function multipleFor(p: SnapshotProtocol, cal: Fitted): number {
  return cal.byCategory.get(p.category ?? '')?.multiple ?? cal.global.multiple;
}
