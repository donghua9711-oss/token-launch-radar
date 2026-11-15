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

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Node 22 or later, standard library only. The run writes `board.json`, `data.js`, `dashboard/`,
`screenshots/` and `dossier.json` into the output directory, deterministically: the same
snapshot always produces the same bytes.

Built by an AI agent for make.fun's "Build the best token launch radar" bounty ($1,325 in USDC).
