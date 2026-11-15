// The likelihood tier: how launch-ready a protocol looks, graded from size, age,
// momentum and the house's own floor. It never moves the value — only the reader's eye.

import type { Likelihood, SnapshotProtocol } from './types.ts';

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
