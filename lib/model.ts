// Launch Radar's model: one sealed snapshot of the protocol universe in, one ranked board out.
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

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'calibrated-2';

/** Multiples are clamped to this band so no thin category prices a token at 0x or 400x TVL. */
export const MULTIPLE_MIN = 0.05;
export const MULTIPLE_MAX = 3.0;

/** Shrinkage prior strength: a category's own median counts n/(n + SHRINK_PRIOR) of its multiple. */
export const SHRINK_PRIOR = 8;

/** change_7d is clamped to this band before it becomes a growth factor. */
export const GROWTH_FLOOR = -60;
export const GROWTH_CAP = 150;
export const GROWTH_DIVISOR = 250;

/** age_factor = AGE_BASE + AGE_SLOPE x log10(1 + days / AGE_SCALE_DAYS), capped to [AGE_BASE, AGE_CAP]. */
export const AGE_BASE = 0.85;
export const AGE_SLOPE = 0.3;
export const AGE_SCALE_DAYS = 30;
export const AGE_CAP = 1.25;

/** How many live-token protocols the dashboard's Live view carries, by market cap. */
export const LIVE_ROWS = 30;

/** One category's calibration: the statistic the whole model hangs on. */
export interface Calibration {
  category: string;
  tokenized_count: number;
  median_ratio: number;
  multiple: number;
}

/** The global calibration line: every category shrinks toward this. */
export interface GlobalCalibration {
  tokenized_count: number;
  median_ratio: number;
  multiple: number;
}

/** Launch-likelihood tiers, best first. */
export type Likelihood = 'High' | 'Elevated' | 'Moderate' | 'Speculative';

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    growth_factor: number;
    age_factor: number;
    likelihood: Likelihood;
  };
  farm_steps: string[];
}

/** The dashboard's view of one board row: the board row's figures plus its farm plan. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  category_multiple: number;
  growth_factor: number;
  age_factor: number;
  implied_value_usd: number;
  likelihood: Likelihood;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so its value is a market fact, not a model output. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
  category_multiple: number;
}

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  pre_token_size: number;
  live_size: number;
  global: GlobalCalibration;
  calibration: Calibration[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** A whole day count from `listedAt` to `asOf`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token: the snapshot writes no CoinGecko id and no symbol. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a deployment of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a below-floor pre-token protocol is the board's business: not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

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
function multipleFor(p: SnapshotProtocol, cal: { global: GlobalCalibration; byCategory: Map<string, Calibration> }): number {
  return cal.byCategory.get(p.category ?? '')?.multiple ?? cal.global.multiple;
}

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

/** How launch-ready a protocol looks, from size, age, momentum and the house's own floor. */
export function likelihood(p: SnapshotProtocol, days: number | null, onWatchlist: boolean): Likelihood {
  let score = 0;
  if (p.tvl_usd >= 1_000_000_000) score += 3;
  else if (p.tvl_usd >= 250_000_000) score += 2;
  else if (p.tvl_usd >= 50_000_000) score += 1;
  if (days !== null && days >= 730) score += 2;
  else if (days !== null && days >= 365) score += 1;
  if (p.change_7d !== null && p.change_7d >= 10) score += 1;
  if (p.change_7d !== null && p.change_7d <= -15) score -= 1;
  if (onWatchlist) score += 1;
  if (score >= 5) return 'High';
  if (score >= 4) return 'Elevated';
  if (score >= 2) return 'Moderate';
  return 'Speculative';
}

// ---------------------------------------------------------------- farm plans

/** The capital one farm position needs, from the protocol's own TVL tier. */
function capitalFor(tvl: number): number {
  if (tvl >= 5_000_000_000) return 500;
  if (tvl >= 1_000_000_000) return 250;
  if (tvl >= 250_000_000) return 150;
  if (tvl >= 50_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get the longer qualifying window. */
function holdDaysFor(days: number | null): number {
  if (days === null) return 45;
  if (days < 180) return 90;
  if (days < 365) return 60;
  if (days < 730) return 45;
  return 30;
}

const CHEAP_GAS = new Set([
  'arbitrum', 'base', 'optimism', 'linea', 'scroll', 'zksync era', 'mantle', 'blast', 'mode', 'zora',
  'ink', 'taiko', 'metis', 'boba', 'fraxtal', 'lisk', 'world chain', 'unichain', 'soneium', 'abstract',
  'sophon', 'cronos zkevm', 'polygon zkevm', 'astar zkevm', 'immutable zkevm', 'manta', 'kroma',
  'metall2', 'silicon zkevm', 'op_bnb', 'binance', 'polygon', 'avalanche', 'xdai', 'celo', 'fantom',
  'sonic', 'cronos', 'moonbeam', 'aurora', 'kava', 'berachain', 'plasma', 'monad', 'megaeth', 'x layer',
]);
const TINY_GAS = new Set(['solana', 'sui', 'aptos', 'near', 'stellar', 'algorand', 'ton', 'tron']);

/** What one transaction costs on a chain, in words a farmer can budget with. */
function gasPhrase(chain: string | null): string {
  if (chain === null) return 'about $0.10-$1 in network fees per transaction';
  const key = chain.toLowerCase();
  if (key === 'ethereum') return 'about $3-$12 in gas per transaction at typical fees, less on weekends';
  if (TINY_GAS.has(key)) return 'well under $0.05 in network fees per transaction';
  if (CHEAP_GAS.has(key)) return 'about $0.05-$0.50 in gas per transaction';
  return 'about $0.10-$1 in network fees per transaction';
}

/** A tiny deterministic hash of the slug, so wording varies by row but never between runs. */
function slugHash(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return h;
}

type Playbook = 'dex' | 'lending' | 'perps' | 'bridge' | 'yield' | 'staking' | 'nft' | 'gaming' | 'prediction' | 'fallback';

/** Which playbook writes a category's plan: matched on the category's own words, never on a name. */
function playbookFor(category: string | null): Playbook {
  const c = (category ?? '').toLowerCase();
  if (c.includes('dex')) return 'dex';
  if (c.includes('lending') || c.includes('cdp')) return 'lending';
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('options') || c.includes('synthetic')) return 'perps';
  if (c.includes('bridge')) return 'bridge';
  if (c.includes('nft')) return 'nft';
  if (c.includes('game')) return 'gaming';
  if (c.includes('prediction')) return 'prediction';
  if (c.includes('staking') || c.includes('restak')) return 'staking';
  if (c.includes('yield') || c.includes('farm') || c.includes('curator') || c.includes('allocator') || c.includes('liquidity manager') || c.includes('basis') || c.includes('index') || c.includes('rwa') || c.includes('stable')) return 'yield';
  return 'fallback';
}

/**
 * A protocol's farm plan: five concrete steps from its category's playbook, parameterised by its
 * name, its first chains, its TVL tier and its age. Every step names the action, what it costs
 * and how long it takes; the wording is picked by a hash of the slug so rows differ and runs agree.
 */
export function farmSteps(p: SnapshotProtocol, days: number | null): string[] {
  const name = p.name;
  const chains = p.chains.slice(0, 3);
  const chainText = chains.length > 0 ? chains.join(', ') : 'its main chain';
  const firstChain = chains.length > 0 ? chains[0]! : null;
  const gas = gasPhrase(firstChain);
  const capital = capitalFor(p.tvl_usd);
  const hold = holdDaysFor(days);
  const v = slugHash(p.slug) % 2;
  const setup =
    v === 0
      ? `Set up a fresh wallet for ${name} and fund it on ${chainText}: you need the chain's gas token plus about $${capital} in stablecoins or ETH. Cost: ${gas}. Time: 15 minutes, once.`
      : `Create a dedicated wallet for this farm (never your main one), move about $${capital} of working capital onto ${chainText} and keep a little of the gas token spare. Cost: ${gas}. Time: 15 minutes, once.`;
  const cadence = `Repeat one small qualifying action every week for at least ${hold} days - consistency across weekly snapshots is what points systems usually reward. Cost: ${gas} each time. Time: 10 minutes a week.`;
  const finish = `Hold the position for the full ${hold} days, then check ${name}'s own app and announcements for a points or rewards page before you withdraw anything. Cost: nothing to check; never pay a third party to "claim" for you. Time: 10 minutes.`;
  const book = playbookFor(p.category);
  let core: string[];
  if (book === 'dex') {
    core = [
      `Make two swaps a week in the ${name} app on ${firstChain ?? chainText}, $25-$100 each way between assets you actually want to hold. Cost: ${gas}, plus the pool's swap fee of roughly 0.05%-0.3% per trade. Time: 10 minutes a week.`,
      `Add about $${capital} of liquidity to one of ${name}'s main pools and leave it in range; a two-sided position in a busy pool is the usage pattern most DEX distributions have counted. Cost: $${capital} of capital, ${gas} to open. Time: 20 minutes to set up.`,
    ];
  } else if (book === 'lending') {
    core = [
      `Supply about $${capital} of USDC or ETH as collateral in ${name} on ${firstChain ?? chainText} and keep the health factor comfortably above 2 if you borrow. Cost: $${capital} of capital, ${gas} to supply. Time: 15 minutes to set up.`,
      `Borrow a small amount against the collateral - 20%-30% of what you supplied - and repay it after a few days, twice a month; real borrowers, not just depositors, are the users lending markets track. Cost: the borrow interest, usually under $1 at this size. Time: 5 minutes per cycle.`,
    ];
  } else if (book === 'perps') {
    core = [
      `Deposit about $${capital} of USDC as margin on ${name} and open one small position ($50-$100 notional, low leverage) that you close the same day. Cost: $${capital} of margin, ${gas}, plus trading fees of roughly 0.05% per side. Time: 15 minutes.`,
      `Trade a little every week rather than in one burst - aim for $200-$500 of total volume a month at this size, always with a stop, so the account reads as a real trader and not a one-off. Cost: fees of about $0.10-$0.50 per round trip. Time: 10 minutes a week.`,
    ];
  } else if (book === 'bridge') {
    core = [
      `Bridge about $${capital} from Ethereum or another major chain into ${chainText} through ${name}, then use the arrived funds in a local app instead of bridging straight back. Cost: the bridge fee plus ${gas}. Time: 10-30 minutes for the transfer to land.`,
      `Make one bridge transfer a week for a month, varying the destination among ${chainText}; steady route usage over several weeks is the pattern bridge point systems count. Cost: roughly $1-$5 of fees per transfer at this size. Time: 10 minutes a week.`,
    ];
  } else if (book === 'staking') {
    core = [
      `Stake about $${capital} worth of the chain's native asset through ${name} on ${firstChain ?? chainText} and keep the liquid receipt token in the same wallet. Cost: $${capital} of capital, ${gas} to stake. Time: 15 minutes to set up.`,
      `Restake or deposit the receipt token in one of the vaults ${name} points to, if it lists any, so the position earns the second layer of points as well. Cost: ${gas}. Time: 10 minutes, once.`,
    ];
  } else if (book === 'nft') {
    core = [
      `Buy one floor-listed NFT on ${name} on ${firstChain ?? chainText} and list it again near the floor rather than holding it idle; completed trades on both sides are what marketplaces count. Cost: about $${capital} of capital, ${gas}, plus the marketplace fee of roughly 1%-2%. Time: 20 minutes.`,
      `Make two or three small trades a week - a bid, a sale, a collection offer - so the wallet shows steady collector activity over the ${hold} days. Cost: ${gas} per trade. Time: 15 minutes a week.`,
    ];
  } else if (book === 'gaming') {
    core = [
      `Play ${name} in short sessions on ${firstChain ?? chainText}: finish the starter quests and make the first in-game purchase or mint the game offers, about $${Math.min(capital, 50)} at most. Cost: ${gas} per on-chain action. Time: 20 minutes to start.`,
      `Come back for the daily or weekly quests rather than grinding once; games reward returning players spread over weeks. Cost: ${gas} on days an action is on-chain. Time: 15 minutes a session, three sessions a week.`,
    ];
  } else if (book === 'prediction') {
    core = [
      `Fund ${name} with about $${capital} and place two or three small positions ($10-$25 each) on liquid markets you can price yourself. Cost: $${capital} of capital, ${gas}. Time: 20 minutes to set up.`,
      `Roll the positions as markets settle instead of letting the balance sit idle - regular resolved trades over ${hold} days are the activity prediction markets remember. Cost: the spread, roughly 1%-2% per position. Time: 15 minutes a week.`,
    ];
  } else if (book === 'yield') {
    core = [
      `Deposit about $${capital} into one of ${name}'s main vaults on ${firstChain ?? chainText} and keep the vault shares in the farming wallet. Cost: $${capital} of capital, ${gas} to deposit. Time: 15 minutes to set up.`,
      `Pick the vault holding assets you would own anyway and check its strategy page monthly; if the vault migrates to a new version, move the shares the week the migration opens. Cost: ${gas} per move. Time: 10 minutes a month.`,
    ];
  } else {
    core = [
      `Use ${name}'s core feature on ${firstChain ?? chainText} with about $${capital} of working capital - the deposit, stake or position its app is built around - and keep it open. Cost: $${capital} of capital, ${gas} to start. Time: 20 minutes to set up.`,
      `Link the same wallet in ${name}'s app every time and complete every free onboarding step it offers (profile, quests, testnet badges) in the first week. Cost: ${gas} where an action is on-chain, otherwise free. Time: 30 minutes, once.`,
    ];
  }
  return [setup, core[0]!, core[1]!, cadence, finish];
}

// ---------------------------------------------------------------- the board

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

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
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
