// Farm plans: five concrete steps per protocol from its category's playbook, plus a sixth
// that nets the plan up — what it costs in total, over how many weeks, and a verdict on
// whether the cost is worth paying against the row's implied value.
//
// The netting rule (stated here because the dashboard states it too):
//   total cost  = transaction fees over the plan (setup + core + one weekly action)
//               + about 0.6% of the working capital in swap/borrow spread
//               + the working capital's idle cost at 10% a year for the plan's weeks.
//               The capital itself is NOT a cost: the farmer keeps it.
//   break-even share = total cost / the row's implied value, in percent.
//   verdict: FARM when the break-even share is at most 0.001% of the implied value —
//            the plan pays for itself if one wallet captures a minuscule slice of the
//            launch. THIN up to 0.005% — it pays only if the wallet earns a real slice,
//            so size down. SKIP above that — the fees eat too much of any plausible
//            slice at this size; watch the protocol, do not farm it.
// Every step names the action, what it costs and how long it takes; the wording is picked
// by a hash of the slug, so rows differ in phrasing and runs agree byte for byte.

import type { SnapshotProtocol, Verdict } from './types.ts';
import { round2, slugHash } from './util.ts';

/** Break-even shares run from ~0.0000005% to ~0.01%: they are kept to 8 decimals so a big row's share never rounds away to zero. */
const round8 = (n: number): number => Math.round(n * 1e8) / 1e8;

/** Break-even share thresholds, in percent of the row's implied value (see the rule above). */
export const FARM_MAX_BREAKEVEN_PCT = 0.001;
export const THIN_MAX_BREAKEVEN_PCT = 0.005;

/** The idle-capital rate the netting charges the plan, per year. */
const IDLE_APR = 0.1;
/** Swap/borrow spread charged on the working capital across the plan's core actions. */
const SPREAD_SHARE = 0.006;

/** The capital one farm position needs, from the protocol's own TVL tier. */
export function capitalFor(tvl: number): number {
  if (tvl >= 5_000_000_000) return 500;
  if (tvl >= 1_000_000_000) return 250;
  if (tvl >= 250_000_000) return 150;
  if (tvl >= 50_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get the longer qualifying window. */
export function holdDaysFor(days: number | null): number {
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

/** The same chain cost as a number, for the netting: the mid of the phrase's band. */
function gasCostUsd(chain: string | null): number {
  if (chain === null) return 0.5;
  const key = chain.toLowerCase();
  if (key === 'ethereum') return 7;
  if (TINY_GAS.has(key)) return 0.03;
  if (CHEAP_GAS.has(key)) return 0.25;
  return 0.5;
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

/** A break-even share small enough to print: two significant figures, plain decimals, never a row of zeros. */
function fmtShare(pct: number): string {
  if (pct >= 0.01) return `${pct.toPrecision(2)}%`;
  return `${pct.toFixed(8).replace(/0+$/, '').replace(/\.$/, '')}%`;
}

/** One protocol's whole farm plan: the steps, and the netting the steps add up to. */
export interface FarmPlan {
  steps: string[];
  capital_usd: number;
  cost_usd: number;
  weeks: number;
  breakeven_pct: number;
  verdict: Verdict;
}

/**
 * A protocol's farm plan: five concrete steps from its category's playbook, parameterised by
 * its name, its first chains, its TVL tier and its age — then a closing step that nets the
 * plan against the row's implied value and gives the verdict (see the rule at the top).
 */
export function farmPlan(p: SnapshotProtocol, days: number | null, impliedValueUsd: number): FarmPlan {
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

  // The netting: fees for setup + core + one action a week, the spread on the capital, and
  // the capital's idle cost — against the row's implied value, as the rule at the top states.
  const weeks = Math.ceil(hold / 7);
  const fees = (3 + weeks) * gasCostUsd(firstChain) + SPREAD_SHARE * capital;
  const cost = round2(fees + capital * IDLE_APR * (weeks / 52));
  const breakeven = round8((cost / Math.max(1, impliedValueUsd)) * 100);
  const verdict: Verdict = breakeven <= FARM_MAX_BREAKEVEN_PCT ? 'FARM' : breakeven <= THIN_MAX_BREAKEVEN_PCT ? 'THIN' : 'SKIP';
  const gloss =
    verdict === 'FARM'
      ? 'the plan pays for itself on a minuscule slice of the launch'
      : verdict === 'THIN'
        ? 'it pays only if the wallet earns a real slice, so size down and keep every week'
        : 'the fees eat too much of any plausible slice at this size, so watch it instead of farming it';
  const netting =
    `Netting the plan up: about $${cost.toFixed(2)} of gas, spread and idle-capital cost over ~${weeks} weeks, on $${capital} of working capital that stays yours. ` +
    `That breaks even if one wallet captures just ${fmtShare(breakeven)} of this row's implied value. Verdict: ${verdict} - ${gloss}.`;

  return {
    steps: [setup, core[0]!, core[1]!, cadence, finish, netting],
    capital_usd: capital,
    cost_usd: cost,
    weeks,
    breakeven_pct: breakeven,
    verdict,
  };
}
