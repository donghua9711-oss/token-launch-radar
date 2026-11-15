# Spec: Launch Radar polish pass (refactor + design)

## Objective

Two behaviour-preserving improvements to the token-radar-01 entry, in one pass:

- **Job A — code structure.** Split the 612-line `lib/model.ts` (snapshot handling,
  calibration, factors, tiers, farm playbooks and board assembly in one file) into
  single-concern modules under `lib/`, so each part of the model can be read, reviewed
  and changed on its own. Organisation and naming only.
- **Job B — dashboard design.** Elevate `dashboard/` (typography, spacing rhythm,
  palette refinement, table readability, tier badges, header/stat strip, detail
  drawer) while every interaction keeps working exactly as before.

Approval: this spec executes a brief the user approved in chat ("Poles dulu pakai
skill desain" plus "skill coding dipakai juga … biar code-nya rapi sesuai kamar,
dibagi-bagi"). The brief is the approval gate; this document is the shared record.

## Assumptions surfaced

1. Node ≥ 22.18 runs the TypeScript directly (verified: Node v24.22.1 on this machine).
2. The sealed snapshot for local runs is the kit's `input/snapshot.json`; the grader's
   `/input` carries the same bytes.
3. The dashboard must render with zero network: system font stacks only, no webfonts,
   no `http(s)` reference in any attribute, CSS file or JS specifier (gate rule).
4. The dark "night-scope" identity (deep ink navy, phosphor green signal, amber
   caution) is pinned by the brief and stays; refinement happens inside that family.
5. Screenshots are re-captured by the parent after this pass; the existing PNGs only
   need to remain present and valid for the local gate check.

## Module map (lib/)

| Module | Responsibility | Depends on |
|---|---|---|
| `types.ts` | Every interface, the `Likelihood` type, `SnapshotError` | — |
| `util.ts` | `clamp`, `round4`, `median` — pure numeric helpers | — |
| `snapshot.ts` | `parseSnapshot`, `ageDays`, `isPreToken`, `isRankable` | types |
| `calibrate.ts` | Category multiples: `calibrate`, `multipleFor`, clamp band + prior constants | types, util, snapshot |
| `factors.ts` | `growthFactor`, `ageFactor` and their constants | types, util |
| `tiers.ts` | `likelihood` — the launch-readiness grade | types |
| `farm.ts` | `farmSteps` — playbooks, gas phrases, capital/hold tiers, slug-hash wording | types |
| `board.ts` | `buildBoard`, `liveRows`, `buildRadar`, `boardIssue`, `dataScript`, `MODEL_VERSION`, `LIVE_ROWS` | all of the above |

Dependency direction is one-way (board → the rest → types/util); no cycles.
`lib/model.ts` is deleted; `main.ts` imports `parseSnapshot` from `lib/snapshot.ts`
and `buildRadar`, `boardIssue`, `dataScript` from `lib/board.ts`.

## Commands

```sh
# Run (same as before the polish)
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>

# Behaviour proof for Job A
sha256sum out/board.json   # must equal the pre-refactor baseline bc4f1bf2…

# Determinism proof
# run twice into two directories; diff -r must be silent
```

## Code style

Matches the existing code: TypeScript, single quotes, semicolons, two-space indent,
JSDoc-style block comments that explain *why*, exported names in camelCase, constants
in SCREAMING_SNAKE_CASE. Every moved block keeps its original wording and comments.

## Testing strategy

No unit suite exists in this repo; the oracle is stronger: the pre-refactor
`board.json` (saved outside the repo at `~/workspace/makefun/polish-baseline-board.json`,
sha256 `bc4f1bf22dc894abc1b143c04aa59c91ced96e853550c8ad9a90111fbd6b8a0b`) must be
reproduced byte for byte after the split, and a two-run `diff -r` over the whole
output must be silent. A local script re-checks all seven mechanical gates from
RULES.txt against the fresh output.

## Boundaries

- **Always:** verify the board hash after every refactor slice; keep dashboard
  source ≤ 48 KB; keep every dashboard behaviour (sort, filters, watchlist toggle,
  search, detail view, `#p=<slug>` and `#watchlist=1` deep links) working.
- **Ask first:** nothing in this pass — the brief fixes the scope.
- **Never:** change any formula, constant, rounding, sort order, tier threshold,
  playbook text or wording-variation logic; touch `vendor/makefun-board.ts`,
  `.makefun/owner.json`, `LICENSE` or `screenshots/`; push anywhere; add a
  dependency (standard library only).

## Design plan (Job B)

Subject: a night-scope radar for people hunting pre-token protocols. Audience scans,
compares and shortlists — the table is the product, everything else supports it.

- **Colour (refined in-family):** ink navy `#060c12` / `#0a141e`, panels `#0c1824`,
  hairlines `#1d3247`; signal green `#3dff9e` reserved for values and the active
  state; amber `#ffb454` for watchlist and caution tiers. One fix with a rule behind
  it: `--faint` rises from `#54707f` (≈3.8:1 on the background) to `#6d93a8`
  (≈6:1), clearing the 4.5:1 floor for small text (ui_ux_pro_max, Accessibility).
- **Type:** system stacks only (offline). Mono (`ui-monospace` stack) carries every
  number, right-aligned with tabular figures; the sans carries prose. Scale tightens
  to 11.5 / 12.5 / 13.5 / 15 / 19 / 27 with the detail drawer's implied-value total
  promoted to 20px as the page's one loud number.
- **Layout:** unchanged structure (header → lede + stat strip → controls → board →
  model panel → footer; drawer from the right). Rhythm regularised onto the existing
  4px spacing tokens; table header becomes sticky inside the scroll panel.
- **Table:** numeric columns right-aligned; very subtle zebra; hover wash; ranks
  1–3 in green semibold with a left signal tick; the implied-value bar stays.
- **Badges:** all four tiers get a deliberate treatment — High filled green,
  Elevated green outline, Moderate amber outline, Speculative faint outline
  (today Speculative silently falls back to the generic chip).
- **Motion:** only answers the pointer — 140ms background/colour transitions on
  rows, buttons, tabs and toggles (design-taste hover layer; ui_ux_pro_max
  checklist's 150–300ms band, kept at its quiet end). No scroll effects.
  `prefers-reduced-motion` block already present and kept.
- **Drawer:** step numbers rendered from the CSS counter the stylesheet already
  resets but never uses; equation total enlarged; section rhythm aligned to tokens.
- **Review against the generic defaults:** the near-black + acid-green look is on
  the AI-default list, but the brief pins the radar identity, and the brief wins;
  what changes is the craft inside it (alignment, rhythm, badge system, contrast),
  not the costume. The ui_ux_pro_max design-system query suggested a blue
  enterprise palette and Fira webfonts — rejected: palette conflicts with the
  pinned identity, webfonts break the offline gate. Its "Data-Dense Dashboard"
  style match, KPI strip and accessibility requirements are adopted.

## Success criteria

- [ ] `board.json` sha256 after the refactor equals the baseline `bc4f1bf2…`.
- [ ] Two consecutive runs produce byte-identical output trees.
- [ ] All seven mechanical gates pass on the fresh output.
- [ ] Dashboard source ≤ 48 KB (from 33,450 bytes), still fully offline.
- [ ] `vendor/makefun-board.ts` still byte-identical to the kit's copy.
- [ ] README gains a "Design & code structure" section (module map + design direction).
- [ ] Work committed locally on `main`; nothing pushed.
