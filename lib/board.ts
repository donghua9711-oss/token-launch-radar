// Launch Radar's board: one sealed snapshot of the protocol universe in, one ranked board out.
//
// The board ranks every protocol that records no token yet — the snapshot's whole pre-token
// universe, not a hand-picked list — by an implied value: what a token would be worth if it were
// priced the way the market already prices live tokens of the same kind.
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
//
// A likelihood tier (separate from value) grades how launch-ready a protocol looks from size,
// age, momentum and watchlist membership. Farm plans come from per-category playbooks
// parameterised by the protocol's own name, chains and TVL tier. No protocol name is ever
// special-cased: the same functions score and write every row.
//
// Which pre-token protocols the board carries: every watchlist slug (the house's own vetted
// floor), plus every other pre-token protocol below the floor that is rankable — not an
// exchange's reserves page (category CEX) and not a versioned deployment of another protocol.
// A pre-token protocol at or above the floor that the house left off the watchlist stays off:
// the house already judged it there, and what its rule names — wrapped, staked and bridged
// products of tokens that already trade, exchanges, versioned pools — is not a token that does
// not exist yet. Ranking WBTC or an exchange's reserves as a "future launch" would be the one
// claim this board refuses to make.
//
// This module is the assembly: it wires calibration (lib/calibrate.ts), the factors
// (lib/factors.ts), the tier (lib/tiers.ts) and the farm plans (lib/farm.ts) into the board,
// the dashboard's data and the gate's own pre-flight check.

import { calibrate, multipleFor } from './calibrate.ts';
import { ageFactor, growthFactor } from './factors.ts';
import { farmSteps } from './farm.ts';
import { ageDays, isPreToken, isRankable } from './snapshot.ts';
import { likelihood } from './tiers.ts';
import type { BoardRow, LiveRow, RadarData, Snapshot } from './types.ts';
import { round4 } from './util.ts';

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'calibrated-2';

/** How many live-token protocols the dashboard's Live view carries, by market cap. */
export const LIVE_ROWS = 30;

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const cal = calibrate(snapshot);
  const watch = new Set(snapshot.watchlist);
  const scored = snapshot.protocols
    .filter((p) => watch.has(p.slug) || (p.tvl_usd < snapshot.floor_usd && isRankable(p)))
    .map((p) => {
      const days = ageDays(snapshot.as_of, p.listed_at);
      const mult = multipleFor(p, cal);
      const gf = growthFactor(p.change_7d);
      const af = ageFactor(days);
      const implied = Math.max(1, Math.round(p.tvl_usd * mult * gf * af));
      return { p, days, mult, gf, af, implied };
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
    model: {
      category_multiple: s.mult,
      growth_factor: round4(s.gf),
      age_factor: round4(s.af),
      likelihood: likelihood(s.p, s.days, watch.has(s.p.slug)),
    },
    farm_steps: farmSteps(s.p, s.days),
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
      likelihood: r.model.likelihood,
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
