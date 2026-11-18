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

/** The farm verdict: whether a plan's cost is worth paying against the row's implied value. */
export type Verdict = 'FARM' | 'THIN' | 'SKIP';

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
  /** The leave-one-out refit range around the implied value (lib/calibrate.ts). */
  implied_value_low_usd: number;
  implied_value_high_usd: number;
  model: {
    category_multiple: number;
    growth_factor: number;
    age_factor: number;
    likelihood: Likelihood;
  };
  /** The farm plan's netting (lib/farm.ts): what the plan costs, over how long, and the verdict. */
  farm_cost_usd: number;
  farm_weeks: number;
  breakeven_pct: number;
  verdict: Verdict;
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
  implied_value_low_usd: number;
  implied_value_high_usd: number;
  likelihood: Likelihood;
  farm_cost_usd: number;
  farm_weeks: number;
  breakeven_pct: number;
  verdict: Verdict;
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

/**
 * The out-of-sample validation report (lib/validate.ts): the model fitted on one half of the
 * snapshot's live tokens and tested blind on the other, plus a walk-forward across TVL bands.
 * Every figure is computed from the snapshot at run time; nothing here is a constant.
 */
export interface ValidationReport {
  comps: number;
  train: number;
  test: number;
  model_median_log_error: number;
  model_median_factor: number;
  flat_median_log_error: number;
  flat_median_factor: number;
  model_within_2x_pct: number;
  flat_within_2x_pct: number;
  walk_forward_n: number;
  walk_forward_median_log_error: number;
  walk_forward_median_factor: number;
  walk_forward_flat_median_log_error: number;
  walk_forward_flat_median_factor: number;
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
  validation: ValidationReport;
  verdict_counts: Record<Verdict, number>;
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
