# Build progress

**`BUILD-ORDER.md` is generated. Its `done` column is the only hand-editable field.** Tick a card there
when the work is **merged on `main`** — not when it is opened, reviewed, or nearly done.

This file records *why* each tick is there, so a later reader can check the tick instead of trusting it.

---

## Ticked (7)

Each was verified by looking for the shipped code on `origin/main`, not by trusting a PR title.

| Card | Landed as | Evidence on `main` |
|---|---|---|
| **T02-09** Store | #1 | `packages/engine/core/store/{store,table,undo,hash,invariants,provenance,index}.ts` — table registry, undo log, entity hashes, `logicalStateHash`, matching the card's own description |
| **T02-11** Module contract | #2 | `packages/engine/core/module/registry.ts` (+ `registry.test.ts`) |
| **T03-01** Ledger schema | #15 | `packages/engine/ledger/src/{accounts,types}.ts` |
| **T03-08** Ledger runtime state | #21 | `packages/engine/ledger/src/world.ts` — `registerEntity`, holds, facts, tick queue, rail state |
| **T04-03** Business-cycle regimes | #11 | `packages/engine/macro/{regime,imbalance,cycleCommittee}.ts` (+ their tests) |
| **T10A-12** Sector placement rules | #19 | `packages/citygen/src/placement/{classify,rules,assign,suitability,buffers}.ts` + the committed mutant set |
| **T10A-13** District placement flags | #10 | `packages/content/data/district-flags.json` — 105 districts, 15 launch cities |

---

## Deliberately NOT ticked, with the reason

These have landed work but **do not yet satisfy the whole card**. Ticking them would overstate progress,
which is the one thing this column must not do.

| Card | What has landed | What is missing |
|---|---|---|
| **T03-05** Reason-code catalog | #22 (catalog assembly, `catalog.csv` canonical, CI regeneration) and #27 (**the 03#1 scanner**, self-described as a *slice*) | The card also covers the CREDIT and REVALUE codes, the 24 §8 aliases and registrations. **Needs a pass confirming those are present before it is ticked.** |
| **T20A-01** Invariant framework + launch catalogue | #1 landed the **invariant types** and removed `invariant-port.ts` | The **launch catalogue and registry** are a separate half of the card. |
| Anything in stages 05–09, 11–18, 19–23 | — | No shipped code. |

---

## Two defects fixed here

**1. `BUILD-ORDER.md` was stale.** It listed 399 tasks and omitted **`T10A-12` and `T10A-13` entirely**,
although both card files exist in `export/build-plan/cards/10A/` and both are merged. Two cards we had
already shipped were invisible to the plan. Regenerating brings the count to **401**.

**2. `tools/order.py` destroyed the checkboxes.** Its header says *"do not edit by hand except the
checkboxes"*, but it emitted `[ ]` for every row — so **any regeneration silently reset every tick**, and
the column could never hold state for more than one commit. It now reads the existing file first and
carries each `[x]` forward. Verified by regenerating twice: 401 rows, 7 ticks, unchanged both times.

**This is why the column showed 0 of 399.** Not because nobody had finished anything, but because the
tracker could not remember it.

---

## How to keep this honest

- Tick on **merge to `main`**, and only when the card's own description is fully satisfied.
- If a card lands as a slice, leave it unticked and add a row to the "not ticked" table above saying what
  remains. A partial tick is worse than no tick: it stops anyone looking again.
- Re-run `python export/build-plan/tools/order.py` after adding or editing cards; ticks now survive.
