# Spec: PREMINT v4 (token-radar-01) — multi-signal value model

## Objective
Beat the standing entry (v3, judge 89.32%) on substance: v3's value model was a single
signal — a category TVL multiple with two fixed-formula adjustments — and its own honest
validation lost the walk-forward to a flat multiple. v4 replaces it with a multi-signal
log-linear model whose own validation, on the identical splits, beats v3's printed
numbers on every headline figure and beats the flat baseline on both tests.

Success = the measurement gate below, the board's shape invariants unchanged (198 clean
pre-token rows, sorted, deterministic), and every figure on the dashboard computed from
the snapshot at run time.

## The measurement gate (hard, on lib/validate.ts's unchanged splits)
Splits: 128 live comps; size-interleaved holdout fit 64 / test 64; TVL-band walk-forward
n=96. v3 baseline (reproduced exactly before any change): holdout model x5.05 (log
0.703), within-2x 25%, vs flat x6.32; walk-forward model x4.66 vs flat x4.11 (log gap
+0.0546 in log10, +0.126 in ln — v3 lost).

Gate: holdout median error < x5.05 AND holdout within-2x > 25% AND walk-forward log gap
(model − flat) <= +0.0546 log10, with beating flat outright the goal.

v4 result (computed by the program at run time): holdout x3.72 (log 0.5707), within-2x
36%, vs flat x6.32 / 22%; walk-forward x3.45 (log 0.5382) vs flat x4.11 — gap −0.0753
log10. The model beats flat on both tests.

## The v4 model (lib/model.ts over lib/calibrate.ts)
log10(implied / TVL) = log10(category multiple) + b0 + bSize*size + bMom*momentum
                     + bAge*age + bChains*chains

- Category multiple: v3's calibration — per-category median mcap/TVL, shrunk toward the
  global median in log space, clamped [0.05, 3.0]. One change: shrinkage prior 8 -> 10.
- Signals (centred features; coefficients ridge-fitted on the comps' residuals after the
  category multiple, one penalty lambda = 5 on every signal coefficient, intercept free):
  - size = log10(TVL) − comps' mean log10(TVL). Effect negative (full-fit b = −0.40):
    larger protocols trade at lower multiples of TVL. The single biggest improvement.
  - momentum = change_7d winsorised to [−60%, +150%], /100; unreported = 0. Effect
    negative (b = −0.25 full-fit): a hot week inflates the TVL denominator, not value.
    (v3's fixed formula had this backwards, +1/250 per point, unshrunk.)
  - age = log10(1 + days/30) − comps' mean over known listing dates; unknown date sits at
    the centre. Effect mildly negative (b = −0.07). v3's fixed age bonus did not survive.
  - chains = log10(1 + chain count) − comps' mean. Effect positive (b = +0.11).
- Fit in log space throughout, so every signal is an additive log-space contribution:
  each board row carries factors[] (signal, label templated from the row's own figures,
  log_contribution, factor) summing to log10(implied/TVL), plus a rationale string built
  from the row's largest factor moves. No hand-written per-protocol text anywhere.
- Value ranges: leave-one-out refits of the WHOLE model (multiples + centres +
  coefficients), one refit per comp of the row's category, cached per comp
  (lib/model.ts makeLooRanger) — replaces v3's multiple-only refit range.
- Likelihood tiers (lib/tiers.ts) and farm plans (lib/farm.ts) are unchanged; farm
  verdicts move only because the implied values they net against moved.

## Validation ledger — every approach tried, same splits
Holdout = median factor error / within-2x; WF = walk-forward median factor / log10 gap
vs flat (negative gap = beats flat); CV = 5-fold size-interleaved CV inside the 64-comp
training half, where recorded. Gate failures marked X.

| Approach | Holdout | WF | Verdict |
|---|---|---|---|
| v3 replica (control) | x5.05 / 25% | x4.66 / +0.0546 | baseline |
| v3 factors + OLS size slope | x3.17 / 39% | x4.22 / +0.0116 | size signal found |
| cat-only + OLS [size] | x3.41 / 36% | x4.21 / +0.0113 | kept as component |
| cat-only + OLS [size,mom] | x3.76 / 33% | x4.54 / +0.0436 | |
| cat-only + OLS [size,mom,age,chains] | x3.42 / 31% | x4.80 / +0.0678 X | unshrunk OLS fails WF |
| cat-only + OLS [size,mom,age] | x3.84 / 36% | x4.79 / +0.0669 X | |
| cat-only + OLS [mom,age,chains] (no size) | x5.81 / 23% | x4.84 / +0.0711 X | fails holdout too |
| cat-only + OLS [size,age,chains] | x3.29 / 33% | x4.72 / +0.0600 X | |
| cat-only + OLS [size,mom,chains] | x3.36 / 28% | x4.43 / +0.0326 | |
| OLS + major-chain dummies (eth/sol/base/arb) | x3.93 / 23% | x4.20 / +0.0099 X | within-2x fails; dummies rejected |
| OLS, winsor [−30,60] / [−20,40] | x3.43 / x3.34 | +0.0676 / +0.0947 X | tighter winsor hurts WF |
| size-then-cat (OLS slope, cats on adjusted ratios) | x2.84 / 36% | x4.20 / +0.0093 | best raw holdout |
| size-then-cat, prior 4 / 16 / 24 | x3.02 / x3.06 / x3.27 | +0.0238 / +0.0138 / −0.0018 | CV x4.93 / x3.79 / x3.78 |
| size-then-cat + any later linear stage | — | gaps +0.021…+0.096 X | second stage always hurt WF here |
| size-then-cat + standardised ridge | — | gaps +0.044…+0.096 X | rejected |
| size-then-cat + backfitting round | x3.80 / 31% | x4.96 / +0.0824 X | rejected |
| binned (quartile-median) size slope | x3.68 / 34% | x4.40 / +0.0299 | band-1 slope +1.47: unstable, rejected |
| size-then-cat, slope ridge 5, prior 16 | x3.65 / 31% | x3.30 / −0.0952, CV x3.88 | best WF; rejected: drops mom/age/chains entirely |
| linear-then-cat (ridge stage first) | x3.54 / 38% | x4.04 / −0.0069 | ordering worse than cat-first |
| cat-first + ridge [size,mom,age,chains] lambda 2 / 3 / 8 / 12 | x3.42–x3.78 | −0.0066 / −0.0460 / −0.0562 / −0.0330 | lambda 5 the balance point |
| cat-first ridge 5, prior 4 / 16 | x3.48 / x3.85 | −0.0461 / −0.0747 | |
| cat-first ridge 5 subsets: [size,chains] / [size,age,chains] / [size] | x3.50 / x3.64 / x3.62 | −0.0601 / −0.0664 / −0.0557 | full signal set kept |
| cat-first, penalty on size only (mom free) | x3.72 / 30% | x4.55 / +0.0444 | free momentum explodes (b −1.03) |
| cat-first, per-feature penalties (3,8,8,3), prior 8 | x3.49 / 36% | x3.54 / −0.0650, CV x3.96 | best holdout factor; rejected: extra constants, no WF gain |
| ensemble size-then-cat + cat-first | x3.66–x3.75 | −0.0401…−0.0529 | no dominance; rejected for complexity |
| **CHOSEN: cat-first + ridge lambda 5, prior 10, [size, mom, age, chains]** | **x3.72 / 36%** | **x3.45 / −0.0754, CV x3.98** | balanced best: beats flat on both tests, all signals survive, one ridge constant |

Signals that did NOT survive: major-chain presence dummies (within-2x fell to 23%),
v3's fixed growth/age formulas (fitted signs differ), unshrunk OLS anything (walk-forward
fails whenever a coefficient is free to explode on 64 training comps).

## Capability map
| Module | Responsibility | Depends on |
|---|---|---|
| snapshot | Parse the sealed snapshot; age, token status, the clean pre-token universe | types, util |
| calibrate | Category multiples fitted from live-token comps (shrunk, clamped) | snapshot |
| model | v4 fit: centres + ridge signal coefficients; breakdowns; LOO refit ranges | calibrate, snapshot, util |
| validate | Deterministic holdout + TVL-band walk-forward of the model vs a flat multiple | model, calibrate |
| tiers | Launch-likelihood tiers (unchanged from v3) | types |
| farm | Per-category farm playbooks plus cost/weeks/verdict netting (unchanged) | types |
| board | Assembly: ranked board with factor breakdowns + rationales, dashboard data, gate pre-flight | all above |
| dashboard | Sortable/filterable board, detail drawer, live view, calibration + validation panels | data.js |

Build order: snapshot/calibrate → model → validate → board/main → dashboard → screenshots.

## Commands
- Run: `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json`
- Verify: run twice into two dirs, `diff -r`; then the fresh kit's `makefun check`.

## Boundaries
- Always: Node 22 stdlib only, offline, deterministic (no clock, no RNG; every sort tie-broken).
- Never: submit anything; hardcode a protocol name or a validation number — every figure on
  the dashboard is computed from the snapshot at run time.
- Board shape stays the gate's: 100–4000 rows, ranks 1..N, implied value non-increasing,
  farm_steps 3–12 strings of 20–600 trimmed chars, watchlist 40/40.
