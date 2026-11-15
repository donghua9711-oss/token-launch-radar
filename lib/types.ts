// The model's vocabulary: the snapshot's shape, the board's rows and the dashboard's data.
// Types only — no logic lives here, so every other module can speak the same language.

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
