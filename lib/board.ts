// Launch Radar's board: one sealed snapshot of the protocol universe in, one ranked board out.
//
// The board ranks the snapshot's whole clean pre-token universe — every protocol that records
// no token and passes the watchlist rule's own visible exclusions, at any TVL (lib/snapshot.ts
// isCleanPreToken) — by an implied value: what a token would be worth if it were priced the way
// the market already prices live tokens of the same kind.
//
//   implied_value_usd = round( tvl_usd x category_multiple x growth_factor x age_factor )
//
// - category_multiple is calibrated from the snapshot itself: for each category, take the
//   median market-cap / TVL ratio of that category's protocols whose token already trades,
//   shrink it toward the global tokenized median (log-space, prior strength SHRINK_PRIOR) so a
//   category with two live tokens cannot shout down one with sixty, and clamp to [0.05, 3.0].
//   A category with no live token uses the global median. No constant is a price: every multiple
//   on the board is a statistic of the snapshot's own figures.
// - growth_factor = 1 + clamp(change_7d, -60, +150) / 250, so a hot week lifts a row by up to
//   1.6x and a bad one cuts it to 0.76x; an unreported change is neutral (factor 1).
// - age_factor rewards time survived with no token: 0.85 + 0.3 x log10(1 + days_live / 30),
//   capped to [0.85, 1.25]; an unknown listing date is neutral (factor 1).
// - each row also carries a value range: its implied value re-priced at the low and high of its
//   category multiple's leave-one-out refits (lib/calibrate.ts multipleRangeFor) — the spread
//   the category's own evidence supports, widest where the evidence is thinnest.
//
// The model is tested, not just stated: lib/validate.ts fits the same multiples on half the
// snapshot's live tokens and predicts the other half blind, against a flat global-multiple
// baseline, and walks forward across TVL bands; the report rides in the dashboard's data.
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
// This module is the assembly: it wires calibration (lib/calibrate.ts), the factors
// (lib/factors.ts), the validation (lib/validate.ts), the tier (lib/tiers.ts) and the farm
// plans (lib/farm.ts) into the board, the dashboard's data and the gate's own pre-flight check.

import { calibrate, liveComps, multipleFor, multipleRangeFor } from './calibrate.ts';
import { ageFactor, growthFactor } from './factors.ts';
import { farmPlan } from './farm.ts';
import { ageDays, isCleanPreToken, isPreToken } from './snapshot.ts';
import { likelihood } from './tiers.ts';
import type { BoardRow, LiveRow, RadarData, Snapshot, Verdict } from './types.ts';
import { round4 } from './util.ts';
import { validateModel } from './validate.ts';

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'calibrated-3-validated';

/** How many live-token protocols the dashboard's Live view carries, by market cap. */
export const LIVE_ROWS = 30;

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const cal = calibrate(snapshot);
  const comps = liveComps(snapshot);
  const watch = new Set(snapshot.watchlist);
  const scored = snapshot.protocols
    .filter((p) => isCleanPreToken(p))
    .map((p) => {
      const days = ageDays(snapshot.as_of, p.listed_at);
      const mult = multipleFor(p, cal);
      const range = multipleRangeFor(p, cal, comps);
      const gf = growthFactor(p.change_7d);
      const af = ageFactor(days);
      const implied = Math.max(1, Math.round(p.tvl_usd * mult * gf * af));
      const low = Math.min(implied, Math.max(1, Math.round(p.tvl_usd * range.low * gf * af)));
      const high = Math.max(implied, Math.max(1, Math.round(p.tvl_usd * range.high * gf * af)));
      const plan = farmPlan(p, days, implied);
      return { p, days, mult, gf, af, implied, low, high, plan };
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
      growth_factor: round4(s.gf),
      age_factor: round4(s.af),
      likelihood: likelihood(s.p, s.days, watch.has(s.p.slug)),
    },
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
