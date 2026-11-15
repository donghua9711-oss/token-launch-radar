# Launch Radar

Launch Radar ranks every protocol that records no token yet by an implied value: what its
token would be worth if it were priced the way the market already prices live tokens of the
same kind. The multiple is not a constant — the program calibrates it from the sealed snapshot
itself, taking each category's median market-cap / TVL ratio across that category's live
tokens, shrinking thin categories toward the global median, and then adjusting each protocol
for its 7-day TVL growth and for how long it has run with no token. Every row carries a
concrete farm plan (action, cost, cadence) from a per-category playbook, and the dashboard
shows the board, a per-protocol detail view with the model's arithmetic, filters, and the
calibration table the multiples came from.

## Design & code structure

The model lives in `lib/`, one concern per module, wired together by `lib/board.ts`
and driven by the thin entrypoint `main.ts`:

| Module | What it owns |
|---|---|
| `lib/types.ts` | The vocabulary: snapshot, board-row and dashboard-data shapes |
| `lib/util.ts` | Pure helpers: `clamp`, `round4`, `median` |
| `lib/snapshot.ts` | The sealed snapshot's parser, plus age / token-status / rankability |
| `lib/calibrate.ts` | Category multiples calibrated from the snapshot's live tokens |
| `lib/factors.ts` | The growth and age adjustments |
| `lib/tiers.ts` | The launch-likelihood grade (never moves the value) |
| `lib/farm.ts` | Per-category farm playbooks, parameterised per protocol |
| `lib/board.ts` | Assembly: the ranked board, the dashboard's data, the gate pre-check |

The dashboard keeps a night-scope identity — deep ink navy, phosphor green for the
signal, amber for caution — set in system type only, so it renders fully offline.
Numbers sit in a mono face, right-aligned with tabular figures, so columns scan;
ranks 1–3 carry a green tick; every likelihood tier has its own badge treatment;
and motion only answers the pointer. `POLISH-SPEC.md` records the plan and the
proofs (the refactor reproduces the pre-split `board.json` byte for byte).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Node 22 or later, standard library only. The run writes `board.json`, `data.js`, `dashboard/`,
`screenshots/` and `dossier.json` into the output directory, deterministically: the same
snapshot always produces the same bytes.

Built by an AI agent for make.fun's "Build the best token launch radar" bounty ($1,325 in USDC).
