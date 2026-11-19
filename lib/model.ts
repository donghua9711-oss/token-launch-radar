// The v4 value model: a multi-signal log-linear model fitted on the snapshot's live comps.
//
//   log10(implied / TVL) = log10(category multiple)
//                        + b0 + bSize*size + bMom*momentum + bAge*age + bChains*chains
//
// - The category multiple is v3's calibration, kept: per-category medians of mcap/TVL shrunk
//   toward the global median in log space (lib/calibrate.ts, prior strength 10) and clamped.
// - The four signals are centred features of the protocol itself, and their coefficients are
//   fitted by ridge regression (one penalty, RIDGE_LAMBDA, on every signal coefficient; the
//   intercept is unpenalised) on the comps' residuals after the category multiple. Fitting in
//   log space keeps every signal's effect an additive log-space contribution, so each board
//   row can show exactly what each signal did to its price (see breakdownFor).
// - size     = log10(TVL) - the comps' mean log10(TVL). Fitted effect is negative: the market
//              pays a lower multiple of TVL the larger the protocol already is.
// - momentum = the week's TVL change, winsorised to [-60%, +150%] and scaled by 1/100 (an
//              unreported change is 0, neutral). Fitted effect is negative: a hot week mostly
//              inflates the TVL denominator, not the token's value.
// - age      = log10(1 + days listed / 30) - the comps' mean over protocols with a known
//              listing date; an unknown date sits at the centre (contribution from the fitted
//              coefficient times zero). Fitted effect is mildly negative.
// - chains   = log10(1 + chain count) - the comps' mean. Fitted effect is positive: wider
//              distribution prices higher per unit of TVL.
//
// Every constant above is a design choice, not a price: all fitted quantities (multiples,
// centres, coefficients) are statistics of the snapshot's own comps, refitted on whatever
// subset a caller passes — the board fits on all comps, the validation on a training half.
// The design was selected on the v3 validation splits; the ledger in SPEC.md records what
// was tried and what each variant scored.

import { fitMultiples, multipleFor } from './calibrate.ts';
import type { Fitted } from './calibrate.ts';
import { ageDays } from './snapshot.ts';
import type { SnapshotProtocol } from './types.ts';
import { clamp, mean, solveLinear } from './util.ts';

/** change_7d is winsorised to this band before it becomes the momentum feature. */
export const MOMENTUM_FLOOR = -60;
export const MOMENTUM_CAP = 150;

/** The one ridge penalty applied to every signal coefficient (the intercept is unpenalised). */
export const RIDGE_LAMBDA = 5;

/** The four centred signal features of one protocol, in the model's fixed order. */
export interface SignalFeatures {
  size: number;
  momentum: number;
  age: number;
  chains: number;
}

/** A fitted model: the calibration, the feature centres, and the ridge coefficients. */
export interface ModelFit {
  calibration: Fitted;
  asOf: string;
  centreLogTvl: number;
  centreLogAge: number;
  centreLogChains: number;
  beta: { intercept: number; size: number; momentum: number; age: number; chains: number };
}

/** The centre a fit's features are measured from: the fit's own comp means. */
interface Centre {
  centreLogTvl: number;
  centreLogAge: number;
  centreLogChains: number;
}

function centreOf(comps: SnapshotProtocol[], asOf: string): Centre {
  const ages: number[] = [];
  for (const p of comps) {
    const d = ageDays(asOf, p.listed_at);
    if (d !== null) ages.push(Math.log10(1 + d / 30));
  }
  return {
    centreLogTvl: mean(comps.map((p) => Math.log10(Math.max(1, p.tvl_usd)))),
    centreLogAge: ages.length > 0 ? mean(ages) : 0,
    centreLogChains: mean(comps.map((p) => Math.log10(1 + p.chains.length))),
  };
}

/** One protocol's centred features under a centre: pure functions of the protocol and the centre. */
export function featuresOf(p: SnapshotProtocol, asOf: string, c: Centre): SignalFeatures {
  const days = ageDays(asOf, p.listed_at);
  return {
    size: Math.log10(Math.max(1, p.tvl_usd)) - c.centreLogTvl,
    momentum: (p.change_7d === null ? 0 : clamp(p.change_7d, MOMENTUM_FLOOR, MOMENTUM_CAP)) / 100,
    age: (days === null ? c.centreLogAge : Math.log10(1 + days / 30)) - c.centreLogAge,
    chains: Math.log10(1 + p.chains.length) - c.centreLogChains,
  };
}

/**
 * Fit the model on a list of live comps: calibrate the multiples on them, centre the
 * features on them, and ridge-fit the signal coefficients on their log-ratio residuals.
 * Deterministic — the same comps in the same order always fit the same model.
 */
export function fitModel(comps: SnapshotProtocol[], asOf: string): ModelFit {
  const calibration = fitMultiples(comps);
  const centre = centreOf(comps, asOf);
  const names = ['size', 'momentum', 'age', 'chains'] as const;
  const k = names.length + 1;
  const A = Array.from({ length: k }, () => Array(k).fill(0));
  const b = Array(k).fill(0);
  for (const p of comps) {
    const f = featuresOf(p, asOf, centre);
    const x = [1, f.size, f.momentum, f.age, f.chains];
    const resid = Math.log10(p.mcap_usd! / p.tvl_usd) - Math.log10(multipleFor(p, calibration));
    for (let i = 0; i < k; i++) {
      b[i]! += x[i]! * resid;
      for (let j = 0; j < k; j++) A[i]![j]! += x[i]! * x[j]!;
    }
  }
  for (let i = 1; i < k; i++) A[i]![i]! += RIDGE_LAMBDA;
  const beta = solveLinear(A, b);
  return {
    calibration,
    asOf,
    ...centre,
    beta: {
      intercept: beta[0]!,
      size: beta[1]!,
      momentum: beta[2]!,
      age: beta[3]!,
      chains: beta[4]!,
    },
  };
}

/** One protocol's per-signal log-space contributions under a fit: they sum to its predicted log-ratio. */
export interface Breakdown {
  /** log10 of the category multiple the row is priced from. */
  category: number;
  size: number;
  momentum: number;
  age: number;
  chains: number;
  /** The regression's intercept: a small global correction the comp fit applies to every row. */
  globalCorrection: number;
}

/** The additive log-space contributions of every signal for one protocol under a fit. */
export function breakdownFor(fit: ModelFit, p: SnapshotProtocol): Breakdown {
  const f = featuresOf(p, fit.asOf, fit);
  return {
    category: Math.log10(multipleFor(p, fit.calibration)),
    size: fit.beta.size * f.size,
    momentum: fit.beta.momentum * f.momentum,
    age: fit.beta.age * f.age,
    chains: fit.beta.chains * f.chains,
    globalCorrection: fit.beta.intercept,
  };
}

/** The model's predicted log10(market cap / TVL) for one protocol: the sum of its breakdown. */
export function predictLogRatio(fit: ModelFit, p: SnapshotProtocol): number {
  const b = breakdownFor(fit, p);
  return b.category + b.size + b.momentum + b.age + b.chains + b.globalCorrection;
}

/** The model's predicted market value for one protocol. */
export function predictValue(fit: ModelFit, p: SnapshotProtocol): number {
  return p.tvl_usd * 10 ** predictLogRatio(fit, p);
}

/**
 * A leave-one-out ranger over a comp set: for a protocol, the spread of the model's
 * predictions when the model is refitted once per comp of the protocol's own category,
 * each time leaving that one comp out (a category with no comps is ranged on refits over
 * the whole comp set). Refits are cached by the left-out comp's slug, so a whole board
 * costs at most one refit per comp. The range measures how much one comp can move the
 * model that prices a row: thin evidence, wide range. Deterministic, like the fit.
 */
export function makeLooRanger(comps: SnapshotProtocol[], asOf: string): (p: SnapshotProtocol) => { lowLog: number; highLog: number } {
  const cache = new Map<string, ModelFit>();
  const refitWithout = (leftOut: SnapshotProtocol): ModelFit => {
    const hit = cache.get(leftOut.slug);
    if (hit !== undefined) return hit;
    const fit = fitModel(comps.filter((c) => c !== leftOut), asOf);
    cache.set(leftOut.slug, fit);
    return fit;
  };
  return (p) => {
    const key = p.category ?? '';
    const own = comps.filter((c) => (c.category ?? '') === key);
    const pool = own.length > 0 ? own : comps;
    let low = Infinity;
    let high = -Infinity;
    for (const c of pool) {
      const v = predictLogRatio(refitWithout(c), p);
      if (v < low) low = v;
      if (v > high) high = v;
    }
    if (!Number.isFinite(low)) {
      const v = predictLogRatio(fitModel(comps, asOf), p);
      return { lowLog: v, highLog: v };
    }
    return { lowLog: low, highLog: high };
  };
}
