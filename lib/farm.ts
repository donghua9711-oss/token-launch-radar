// Farm plans: five concrete steps per protocol, written by its category's playbook and
// parameterised by the protocol's own name, chains, TVL tier and age. Every step names
// the action, what it costs and how long it takes; the wording is picked by a hash of
// the slug, so rows differ in phrasing and runs agree byte for byte.

import type { SnapshotProtocol } from './types.ts';

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
