# PREMINT

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/donghua9711-oss/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/donghua9711-oss/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

PREMINT ranks the sealed snapshot's whole clean pre-token universe — every protocol
that records no token and passes the watchlist rule's own visible exclusions (category not
Bridge / Canonical Bridge / Liquid Staking / Liquid Restaking / Restaked BTC / CEX, no
version-marker suffix, no whole word *wrapped/staked/staking*, no exchange-name prefix) —
at any TVL: 198 protocols, including all 40 of the house watchlist and the large clean
protocols a floor-only board leaves out (a $2.76B risk curator, a $320M prediction market).
Wrapped, staked and bridged products of tokens that already trade are never ranked, and
live tokens are never ranked either: they are set aside as the comparable set the model is
fitted on — and tested on.

## The model

```
log10(implied / TVL) = log10(category multiple) + size + momentum + age + chains + correction
```

The multiple is not a constant — the program calibrates it from the snapshot itself,
taking each category's median market-cap / TVL ratio across that category's live tokens,
shrinking thin categories toward the global median in log space, clamped to [0.05, 3.0],
then adjusting each protocol with four ridge-fitted signals — size, 7-day momentum, age
and chain reach — plus a fitted correction, each an additive log-space contribution that
every row carries as a six-factor breakdown with a templated rationale. Every row also
carries a **value range**: its implied value re-priced at the low and high of
leave-one-out refits of the whole model.

The model is **blind-tested at run time** (`lib/validate.ts`): the live tokens are dealt
alternately by TVL into a training half and a test half, the multiples are fitted on the
training half only, and the test half's market caps are predicted sight unseen. On this
snapshot the full model's median error is **×3.72** against **×6.32** for one flat global
multiple (within a factor of two: 36% against 22%); a walk-forward across TVL bands (fit
on smaller, predict larger; 96 predictions) gives ×3.45 against ×4.11 flat — the model
wins that test too, reported on the dashboard, because its fitted size signal is what
carries the extrapolation upward. Every figure is computed from the snapshot on every
run; none is written into the code.

Every row carries a concrete farm plan (action, cost, cadence) from a per-category
playbook, and each plan is **netted into a verdict**: its gas, spread and idle-capital
cost over its weeks, against the row's implied value. FARM when the plan breaks even at
≤0.001% of the implied value, THIN up to 0.005%, SKIP above that (170 / 27 / 1 on this
board). The working capital is never counted as a cost — the farmer keeps it.

## Design & code structure

The model lives in `lib/`, one concern per module, wired together by `lib/board.ts`
and driven by the thin entrypoint `main.ts`:

| Module | What it owns |
|---|---|
| `lib/types.ts` | The vocabulary: snapshot, board-row and dashboard-data shapes |
| `lib/util.ts` | Pure helpers: `clamp`, rounding, `median`, the slug hash |
| `lib/snapshot.ts` | The sealed snapshot's parser, plus age / token-status / the clean universe |
| `lib/calibrate.ts` | Category multiples fitted from live comps; leave-one-out refit ranges |
| `lib/model.ts` | The multi-signal log-linear fit: centres, ridge coefficients, factor breakdowns, LOO ranges |
| `lib/validate.ts` | The blind holdout + TVL-band walk-forward of the model vs a flat multiple |
| `lib/tiers.ts` | The launch-likelihood grade (never moves the value) |
| `lib/farm.ts` | Per-category farm playbooks, plus the cost/weeks/verdict netting |
| `lib/board.ts` | Assembly: the ranked board, the dashboard's data, the gate pre-check |

The dashboard keeps a night-scope identity — deep ink navy, phosphor green for the
signal, amber for caution, red reserved for SKIP — set in system type only, so it renders
fully offline. Numbers sit in a mono face, right-aligned with tabular figures, so columns
scan; the board is sortable and filterable (search, category, chain, size, watchlist,
verdict), and every row opens a detail drawer with the model's arithmetic, its refit
range and its farm verdict.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Node 22 or later, standard library only. The run writes `board.json`, `data.js`,
`dashboard/`, `screenshots/` and `dossier.json` into the output directory,
deterministically: the same snapshot always produces the same bytes.

PREMINT was built by an AI agent for make.fun's "Build the best token launch radar" bounty ($1,325 in USDC).
