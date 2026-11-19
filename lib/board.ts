// Launch Radar's board: one sealed snapshot of the protocol universe in, one ranked board out.
//
// The board ranks the snapshot's whole clean pre-token universe — every protocol that records
// no token and passes the watchlist rule's own visible exclusions, at any TVL (lib/snapshot.ts
// isCleanPreToken) — by an implied value: what a token would be worth if it were priced the
// way the market already prices live tokens of the same kind.
//
// The v4 model (lib/model.ts) prices in log space, as a sum of interpretable parts:
//
//   log10(implied / TVL) = log10(category multiple) + intercept
//                        + bSize*size + bMom*momentum + bAge*age + bChains*chains
//
// - category_multiple is calibrated from the snapshot itself: for each category, the median
//   market-cap / TVL ratio of that category's protocols whose token already trades, shrunk
//   toward the global tokenized median (log-space, prior strength 10) so a category with two
//   live tokens cannot shout down one with sixty, and clamped to [0.05, 3.0]. A category with
//   no live token uses the global median. No constant is a price: every multiple on the board
//   is a statistic of the snapshot's own figures.
// - The four signals are centred features — size (log10 TVL vs the comps' centre), momentum
//   (the week's TVL change, winsorised to [-60%, +150%]), age (log-scaled days listed vs the
//   comps' centre) and chain reach (log chain count vs the centre) — whose coefficients are
//   fitted by ridge regression (one penalty, 5) on the comps' residuals after the category
//   multiple. On this snapshot the market pays a lower multiple for larger protocols and for
//   protocols whose TVL just spiked, a mildly lower one for older protocols, and a higher
//   one for wider chain reach. Each row carries the full breakdown (factors: every signal's
//   log-space contribution and multiplicative factor, with a label built from the row's own
//   figures) and a one-line rationale templated from those same values.
// - Each row also carries a value range: its implied value re-priced under leave-one-out
//   refits of the whole model — one refit per live comp of the row's category, that comp
//   left out (lib/model.ts makeLooRanger) — the spread the category's own evidence supports,
//   widest where the evidence is thinnest.
//
// The model is tested, not just stated: lib/validate.ts fits the same model on half the
// snapshot's live tokens and predicts the other half blind, against a flat global-multiple
// baseline, and walks forward across TVL bands; the report rides in the dashboard's data.
// On this snapshot the v4 model beats the flat baseline on both tests (v3's single-signal
// model lost the walk-forward); the exact figures are computed at run time, never stated
// as constants — see SPEC.md for the design ledger.
//
// Which pre-token protocols the board carries: the clean universe, all of it. The watchlist
// (40 protocols, the house's vetted floor) is inside it by construction — the exclusions here
// are the watchlist's own, applied at every size instead of only at the floor — and the large
// clean protocols the house's extra parent-protocol field kept off its list (a $2.76B curator,
// a $320M prediction market) are ranked like everything else. What stays off is what the rule
// itself names: wrapped, staked and bridged products, exchange reserve pages, versioned
// deployments — none of them is a token that does not exist yet. Live tokens are never ranked:
// they are set aside as the comps the model is fitted and tested on.
//
// A likelihood tier (separate from value) grades how launch-ready a protocol looks from size,
// age, momentum and watchlist membership. Farm plans come from per-category playbooks
// parameterised by the protocol's own name, chains and TVL tier, and each plan is netted
// against its row's implied value into a FARM / THIN / SKIP verdict (lib/farm.ts). No protocol
// name is ever special-cased: the same functions score and write every row.
//
// This module is the assembly: it wires the model (lib/model.ts, over lib/calibrate.ts), the
// validation (lib/validate.ts), the tier (lib/tiers.ts) and the farm plans (lib/farm.ts) into
// the board, the dashboard's data and the gate's own pre-flight check.

import { calibrate, liveComps, multipleFor } from './calibrate.ts';
import { farmPlan } from './farm.ts';
import { breakdownFor, fitModel, makeLooRanger } from './model.ts';
import type { Breakdown, ModelFit } from './model.ts';
import { ageDays, isCleanPreToken, isPreToken } from './snapshot.ts';
import { likelihood } from './tiers.ts';
import type { BoardRow, FactorContribution, LiveRow, RadarData, Snapshot, SnapshotProtocol, Verdict } from './types.ts';
import { round2, round4 } from './util.ts';
import { validateModel } from './validate.ts';

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'multi-signal-4-validated';

/** How many live-token protocols the dashboard's Live view carries, by market cap. */
export const LIVE_ROWS = 30;

/** A compact USD figure for labels and rationales: $2.76B, $320.5M, $45.1K, $900. */
function fmtUsd(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

/** One row's factor breakdown: every signal's contribution, labelled from the row's own figures. */
function factorBreakdown(p: SnapshotProtocol, days: number | null, fit: ModelFit, b: Breakdown): FactorContribution[] {
  const cal = fit.calibration.byCategory.get(p.category ?? '');
  const mk = (signal: FactorContribution['signal'], label: string, log: number): FactorContribution => ({
    signal,
    label,
    log_contribution: round4(log),
    factor: round4(10 ** log),
  });
  return [
    mk(
      'category',
      cal !== undefined
        ? `Category multiple — ${cal.tokenized_count} live ${p.category ?? 'uncategorised'} comp${cal.tokenized_count === 1 ? '' : 's'}, shrunk toward the global median`
        : 'Category multiple — no live comps in this category, so the global multiple applies',
      b.category,
    ),
    mk('size', `Size — TVL ${fmtUsd(p.tvl_usd)} against the comps' ${fmtUsd(10 ** fit.centreLogTvl)} centre`, b.size),
    mk(
      'momentum',
      p.change_7d === null
        ? 'Momentum — no 7-day TVL change reported, so the signal is neutral'
        : `Momentum — 7-day TVL change ${round2(p.change_7d)}%, winsorised to [-60%, +150%]`,
      b.momentum,
    ),
    mk('age', days === null ? 'Age — listing date unknown, so the signal sits at the comp centre' : `Age — listed ${days} days ago`, b.age),
    mk('chains', `Chain reach — live on ${p.chains.length} chain${p.chains.length === 1 ? '' : 's'}`, b.chains),
    mk('global_correction', 'Global correction — the intercept of the comp regression', b.globalCorrection),
  ];
}

const SIGNAL_SHORT: Record<string, string> = { size: 'size', momentum: 'weekly momentum', age: 'age', chains: 'chain reach' };

/** A one-line rationale for one row, templated from its own factor values — never hand-written. */
function rationaleFor(p: SnapshotProtocol, mult: number, factors: FactorContribution[], implied: number): string {
  const movers = factors
    .filter((f) => f.signal in SIGNAL_SHORT && Math.abs(f.log_contribution) >= 0.02)
    .sort((a, b) => Math.abs(b.log_contribution) - Math.abs(a.log_contribution))
    .slice(0, 3);
  const adjusted =
    movers.length > 0
      ? `, adjusted ${movers.map((f) => `${f.log_contribution >= 0 ? 'up' : 'down'} x${f.factor.toFixed(2)} for ${SIGNAL_SHORT[f.signal]}`).join(', ')}`
      : ', with no signal adjustment worth naming';
  const overall = round2(implied / Math.max(1, p.tvl_usd));
  return `${p.name} prices off a x${mult} ${p.category ?? 'uncategorised'} multiple${adjusted}: an implied ${fmtUsd(implied)}, x${overall} its TVL.`;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const comps = liveComps(snapshot);
  const fit = fitModel(comps, snapshot.as_of);
  const loo = makeLooRanger(comps, snapshot.as_of);
  const watch = new Set(snapshot.watchlist);
  const scored = snapshot.protocols
    .filter((p) => isCleanPreToken(p))
    .map((p) => {
      const days = ageDays(snapshot.as_of, p.listed_at);
      const b = breakdownFor(fit, p);
      const logRatio = b.category + b.size + b.momentum + b.age + b.chains + b.globalCorrection;
      const implied = Math.max(1, Math.round(p.tvl_usd * 10 ** logRatio));
      const range = loo(p);
      const low = Math.min(implied, Math.max(1, Math.round(p.tvl_usd * 10 ** range.lowLog)));
      const high = Math.max(implied, Math.max(1, Math.round(p.tvl_usd * 10 ** range.highLog)));
      const plan = farmPlan(p, days, implied);
      const mult = multipleFor(p, fit.calibration);
      const factors = factorBreakdown(p, days, fit, b);
      return { p, days, mult, b, implied, low, high, plan, factors, rationale: rationaleFor(p, mult, factors, implied) };
    });
  scored.sort(
    (a, b) =>
      b.implied - a.implied ||
      b.p.tvl_usd - a.p.tvl_usd ||
      (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0),
  );
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    watchlist: watch.has(s.p.slug),
    age_days: s.days,
    implied_value_usd: s.implied,
    implied_value_low_usd: s.low,
    implied_value_high_usd: s.high,
    model: {
      category_multiple: s.mult,
      growth_factor: round4(10 ** s.b.momentum),
      age_factor: round4(10 ** s.b.age),
      size_factor: round4(10 ** s.b.size),
      chain_factor: round4(10 ** s.b.chains),
      likelihood: likelihood(s.p, s.days, watch.has(s.p.slug)),
    },
    factors: s.factors,
    rationale: s.rationale,
    farm_cost_usd: s.plan.cost_usd,
    farm_weeks: s.plan.weeks,
    breakeven_pct: s.plan.breakeven_pct,
    verdict: s.plan.verdict,
    farm_steps: s.plan.steps,
  }));
}

/** The live-token protocols, by market cap: the market's own values, kept apart from the board. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  const cal = calibrate(snapshot);
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.mcap_usd !== null)
    .sort((a, b) => b.mcap_usd! - a.mcap_usd! || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      change_7d: p.change_7d,
      category_multiple: multipleFor(p, cal),
    }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot);
  const cal = calibrate(snapshot);
  const verdict_counts: Record<Verdict, number> = { FARM: 0, THIN: 0, SKIP: 0 };
  for (const r of board) verdict_counts[r.verdict] += 1;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    pre_token_size: board.length,
    live_size: snapshot.protocols.filter((p) => !isPreToken(p)).length,
    global: cal.global,
    calibration: [...cal.byCategory.values()],
    validation: validateModel(snapshot),
    verdict_counts,
    rows: board.map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      listed_at: r.listed_at,
      age_days: r.age_days,
      watchlist: r.watchlist,
      category_multiple: r.model.category_multiple,
      growth_factor: r.model.growth_factor,
      age_factor: r.model.age_factor,
      size_factor: r.model.size_factor,
      chain_factor: r.model.chain_factor,
      factors: r.factors,
      rationale: r.rationale,
      implied_value_usd: r.implied_value_usd,
      implied_value_low_usd: r.implied_value_low_usd,
      implied_value_high_usd: r.implied_value_high_usd,
      likelihood: r.model.likelihood,
      farm_cost_usd: r.farm_cost_usd,
      farm_weeks: r.farm_weeks,
      breakeven_pct: r.breakeven_pct,
      verdict: r.verdict,
      farm_steps: r.farm_steps,
    })),
    live: liveRows(snapshot),
  };
  return { board, radar };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, values and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100..4000`;
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'the board repeats a slug';
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  for (const r of board) if (!known.has(r.slug)) return `the board invents the slug ${r.slug}`;
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  for (let i = 0; i < board.length; i++) if (board[i]!.rank !== i + 1) return `row ${i + 1} carries rank ${board[i]!.rank}`;
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return 'every row shares one implied value: a board that ranks nothing by value is not a ranking';
  }
  for (const r of board) {
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
    if (r.implied_value_low_usd > r.implied_value_usd || r.implied_value_high_usd < r.implied_value_usd) {
      return `${r.slug} has a value range that misses its own implied value`;
    }
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} trimmed characters`;
    }
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
