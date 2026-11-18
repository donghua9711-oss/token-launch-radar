# Spec: Launch Radar v2 (token-radar-01 improvement candidate)

## Objective
Beat the standing entry (judge 88.07%) by fixing its known blind spots, in slice order:
universe completion, out-of-sample validation, per-row value ranges, farm-plan netting,
methodology surface, screenshots. Success = fresh-kit gate shape green, deterministic
double run, and the metrics in the build report.

## Capability map
| Module | Responsibility | Depends on |
|---|---|---|
| snapshot | Parse the sealed snapshot; age, token status, the clean pre-token universe | types, util |
| calibrate | Category multiples fitted from live-token comps; leave-one-out refit ranges | snapshot |
| factors | Growth and age adjustments (centred on 1) | util |
| validate | Deterministic holdout + TVL-band walk-forward of the model vs a flat multiple | calibrate, factors, snapshot |
| farm | Per-category farm playbooks plus cost/weeks/verdict netting | types |
| board | Assembly: ranked board, dashboard data, gate pre-flight | all above |
| dashboard | Sortable/filterable board, detail drawer, live view, calibration + validation panels | data.js |

Build order: snapshot/calibrate/factors → validate → farm → board/main → dashboard → screenshots.

## Commands
- Run: `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json`
- Verify: run twice into two dirs, `diff -r`; then the fresh kit's `makefun check`.

## Boundaries
- Always: Node 22 stdlib only, offline, deterministic (no clock, no RNG; every sort tie-broken).
- Never: submit anything; hardcode a protocol name or a validation number — every figure on
  the dashboard is computed from the snapshot at run time.
- Board shape stays the gate's: 100–4000 rows, ranks 1..N, implied value non-increasing,
  farm_steps 3–12 strings of 20–600 trimmed chars, watchlist 40/40.
