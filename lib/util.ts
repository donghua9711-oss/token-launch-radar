// Small pure helpers the model shares: clamping, rounding and the median.
// No state, no input but their arguments — every module may lean on these.

export const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
export const round2 = (n: number): number => Math.round(n * 100) / 100;

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** The median of a non-empty list of numbers. */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A tiny deterministic hash of a slug, so wording and splits vary by row but never between runs. */
export function slugHash(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return h;
}

/** The arithmetic mean of a non-empty list of numbers. */
export function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Solve A x = b for a small dense system by Gaussian elimination with partial pivoting.
 * Deterministic: the pivot rule depends only on the values, never on run state. A column
 * whose pivot is numerically zero yields a zero coefficient rather than a NaN — the ridge
 * penalties the model adds keep every system it solves well away from that case.
 */
export function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    const swap = M[c]!;
    M[c] = M[piv]!;
    M[piv] = swap;
    const d = M[c]![c]!;
    if (Math.abs(d) < 1e-12) continue;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / d;
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r]![k] = M[r]![k]! - f * M[c]![k]!;
    }
  }
  return M.map((row, i) => (Math.abs(M[i]![i]!) < 1e-12 ? 0 : row[n]! / M[i]![i]!));
}
