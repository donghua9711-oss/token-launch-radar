// Small pure helpers the model shares: clamping, rounding and the median.
// No state, no input but their arguments — every module may lean on these.

export const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** The median of a non-empty list of numbers. */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
