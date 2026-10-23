---
id: T03-05-recut
unit: "03"
stage: S0
title: The shared invariant-check view - re-cut of T03-05's invariants/types.ts block (LedgerCheckView, ledgerView, fail, LEDGER_INV_BASE, I_CHECK_TO_INV, exported QTY_ONLY_CODES)
depends_on: ["T03-01", "T03-02", "T03-08", "T20A-01"]
spec: ["03§3.16"]
context: ["20§3.1"]
catalog: []
tests: []
invariants: []
decisions: ["E-79", "E-80"]
params: []
files:
  - packages/engine/ledger/src/invariants.ts
  - packages/engine/ledger/src/catalog.ts
  - packages/engine/ledger/test/invariant-view.test.ts
est_loc: 260
---

## Goal

Build the six symbols that four 03 cards already import and that `src/` exports **zero** of today: `LedgerCheckView`, `ledgerView`, `fail`, `LEDGER_INV_BASE`, `I_CHECK_TO_INV`, and an **exported** `QTY_ONLY_CODES`. This card is the re-cut of the `packages/engine/ledger/invariants/types.ts` block of `T03-05`, and it **supersedes that block**. It implements no invariant, adds no catalog row, and **does not tick `T03-05`** — it is the contract that unblocks it.

## Why this card exists — the code says so itself

`packages/engine/ledger/src/invariants.ts:619-621` says, of `ledgerInvariant`:

> *"`ledgerView` (the shared check view) lands with T03-05's re-cut card; until then the wrapper reads the postings and the hold rows from the 20A context directly."*

Nothing in `BUILD-ORDER.md` owns that card. `T03-05`'s own block puts the six symbols in `packages/engine/ledger/invariants/types.ts`, which **E-79 point 1 forbids**, and reaches the catalog through `getCatalog()`, which **E-79 point 3 forbids**. So the block cannot be implemented as written; it has to be re-cut, and this is the card.

The tree therefore carries a **contract gap, not a bug**: the 20A bridge (`ledgerInvariant`) works for a check written against core's `InvariantCtx`, the **24** shipped `Check`s work against the local `CheckView`, and four cards import six symbols that no file exports.

## Measured state at the re-cut head

Every line below was read in the worktree at `3c010fe`, not inferred.

| Fact | Measured |
|---|---|
| `packages/engine/ledger/src/invariants.ts` | **639 lines** |
| `CheckView` (the existing view) | `invariants.ts:25-43`, **exported** |
| `type Check` | `invariants.ts:134`, **not exported** |
| `QTY_ONLY_CODES` | `invariants.ts:48`, `const`, **not exported**; its only reader is `:353` (the I1 amount rule) |
| `LedgerInvariant` | `invariants.ts:573`, `export type LedgerInvariant = InvariantImpl<Posting>` |
| `INV_BS_011` | `invariants.ts:587` |
| `ledgerInvariant` | `invariants.ts:622-625` |
| `TICK_INVARIANTS` | `invariants.ts:627`, **17** rows |
| `SYS_INVARIANTS` | `sysinv.ts:143`, **7** rows |
| `LedgerCheckView`, `ledgerView`, `fail`, `LEDGER_INV_BASE`, `I_CHECK_TO_INV` | **0 exports** anywhere in `packages/`; `ledgerView` appears only in the comment at `:620` |
| `QTY_ONLY_CODES` as an export | **0** — the array literal is at `:48` and the name is unexported |
| `ESCROW_ONLY_CODES` (shape to reuse) | `catalog.ts:36`, `readonly string[]` |
| `ReasonCatalog` on the world | `world.ts:365`, `readonly catalog: ReasonCatalog` |
| `entityOfKey` | `accounts.ts:68` |
| `Account` / `Hold` | `types.ts:43` / `types.ts:70` |
| Core contract types | `InvariantDef` :7, `TruthStoreRead` :12, `TruthFacts` :20, `InvariantCtx` :21, `InvariantOutcome` :32, `InvariantImpl` :33 |
| `ledgerInvariant` callers | exactly **one**: `test/erasure.test.ts:30` |
| I-numbers the tree emits today | **18**, across **39** `F(...)` sites: I0 I1 I2 I3 I4 I5 I6 I8 I10 I11 I11b I12 I13 I15 I16 I17 I18 I21 |
| I-numbers in 03 §3.16's set | **24**: I0..I22 plus I11b. Not yet emitted: **I7, I9, I14, I19, I20, I22** |

**Two corrections to the dispatch, for the record.** `CheckView` is at `invariants.ts:25`, not `:587` — `:587` is `INV_BS_011`, one of the checks that *consumes* it. And `origin/main` is `3c010fe`, not `7261959`; the branch is cut from the current head.

## Imports this card may add

- `./catalog`: `ReasonCatalog`, `QTY_ONLY_CODES` (new export, R9). **Not** `getCatalog` — it does not exist (E-79 point 3).
- `./accounts`: `entityOfKey`.
- `./types`: `Account`, `Entry`, `Hold`, `Posting`.
- `@tycoon/engine-core/invariants`: `InvariantCtx`, `InvariantDef`, `InvariantImpl`, `InvariantOutcome`, `TruthFacts`, `TruthStoreRead` — **`import type` only**, per E-80.4. `erasure.test.ts` already pins that this edge is erased; a value-position import turns it red.

## Exports

```ts
// packages/engine/ledger/src/catalog.ts
export const QTY_ONLY_CODES: readonly string[];                 // ['EQ_SPLIT', 'LED_DISSOLUTION'] — the single declaration (R9)

// packages/engine/ledger/src/invariants.ts
export interface LedgerCheckView {
  tick: Tick; partitionId: string; isDayClose: boolean;         // isDayClose = scope 'DAY_CLOSE' || tick % 720 === 719
  entries: readonly Entry[];                                    // this tick's led.entry rows from post, sorted by entryId (valid and invalid)
  postings: readonly Posting[];                                 // ctx.postings, by reference
  holds: SortedMap<Id, Hold>;                                   // post['led.hold'], the rows the wrapper reads today
  before(key: string): Account | undefined;                     // ctx.pre led.account
  after(key: string): Account | undefined;                      // ctx.post led.account
  touchedAccounts(): readonly string[];                         // writeSet rows with table 'led.account', de-duplicated, sorted
  touchedEntities(): readonly Id[];                             // entityOfKey of the touched accounts, sorted, unique
  pre: TruthStoreRead; post: TruthStoreRead;                    // by reference, not copies
  catalog: ReasonCatalog;                                       // the second argument of ledgerView, by reference
  events: readonly { kind: string; subjectIds: readonly Id[] }[];
  facts: TruthFacts;                                            // R3: the 20A facts view, for T03-10's I9/I10
  num(paramKey: string): number;
}
export function ledgerView(ctx: InvariantCtx<Posting>, catalog: ReasonCatalog): LedgerCheckView;  // R5: one per (ctx, catalog)
export function fail(iNumber: string, entityIds: readonly Id[], observed: string, expected: string): InvariantOutcome;
export const LEDGER_INV_BASE: Readonly<Pick<InvariantDef, 'module' | 'sampling' | 'sinceEngineVersion'>>;
export const I_CHECK_TO_INV: Readonly<Record<string, readonly string[]>>;   // R8: values are arrays
```

## Resolutions

**R1 — `LedgerCheckView` vs `CheckView`: both survive, and neither is a subtype of the other.** `CheckView` (`:25`) is the staged P13 view the **24** shipped `Check`s consume (`TICK_INVARIANTS` 17 + `SYS_INVARIANTS` 7), including `INV_BS_011` at `:587`. `LedgerCheckView` is the 20A-context view an `InvariantImpl` consumes, starting with T03-10's `SubCheck.run`. Retiring `CheckView` would mean rewriting 24 shipped checks and their 5 test files; widening it would force the 20A members (`postings`, `touchedAccounts`, `num`) on a P13 builder that cannot supply them. So: two shapes, two builders, no shared base.

**R2 — `LedgerCheckView` carries `holds`, because the comment names it.** The comment says the wrapper reads *"the postings and the hold rows"*. `T03-05`'s block has **no `holds` member** — as written it could not replace the wrapper it was written to replace. `holds` is `post['led.hold']` as the `SortedMap<Id, Hold>` the P13 view already uses (`CheckView.holds`), so T03-08's `INV_BS_011` logic ports unchanged.

**R3 — `LedgerCheckView` carries `facts`.** T03-10's I9/I10 read `SEC_BORROW` and other engine-supplied facts, which reach a check only through the 20A `InvariantCtx.facts`. Without the member the four consumer cards cannot be written.

**R4 — `ledgerView` takes the catalog as a second argument.** `ReasonCatalog` is not a member of `InvariantCtx` and E-79 point 3 forbids fetching it module-side (`getCatalog`). The call site owns the world, so the caller passes `world.catalog`.

**R5 — the memo is keyed on `(ctx, catalog)`, not `(tick, partitionId, scope)`.** `T03-05`'s block memos on the tick triple, which is wrong: two different contexts can share a tick triple (a re-run, a partition replay) and would then get a view built over the **wrong rows**. Key on `ctx` object identity (a `WeakMap`) and compare the catalog by identity; same `ctx` + same `catalog` ⇒ same object, anything else ⇒ a fresh view.

**R6 — `fail` prefixes `observed` with the I-number.** `observed` is `` `${iNumber}: ${observed}` ``; `entityIds` is a **copy** of the input, so a caller mutating its own array cannot reach into a returned outcome.

**R7 — `LEDGER_INV_BASE` is the single source of the three fixed def fields**, `{ module: '03', sampling: 'NEVER', sinceEngineVersion: '1.0.0' }`, frozen. `ledgerInvariant` already inlines those three literals at `:624`; it spreads the base instead, so the two cannot drift. `scope` is **not** in the base — it varies per invariant (`TICK` vs `DAY_CLOSE`) and `erasure.test.ts:38` pins that a `DAY_CLOSE` def is expressible.

**R8 — `I_CHECK_TO_INV` values are `readonly string[]`, not `string`.** `T03-05`'s block types it `Record<string, string>`, which cannot hold the shipped reality: **I1** is emitted by *both* `INV-LED-002` and `INV-LED-007`, and **I4** by both `INV-LED-003` and `INV-LED-004` (measured). The map carries all **24** keys of 03 §3.16 — the six with no emitting check yet (I7, I9, I14, I19, I20, I22) are declared so a later card does not have to re-open this file.

**R9 — `QTY_ONLY_CODES` gets one declaration, in `catalog.ts`, next to `ESCROW_ONLY_CODES`.** `invariants.ts` imports it. It is a catalog-shaped constant (a set of reason codes, `readonly string[]`), and `catalog.ts:36` is where its sibling already lives. `invariants.ts:48`'s `const` is deleted, not aliased — a re-export would leave two declarations for the next grep to find.

**R10 — no `getCatalog` shim.** `T03-08:34`, `T03-09:31` and `T03-10:29` still name it in their Imports; those lines are **stale card text, not a code defect** — T03-08 is already merged and its code reads the world's catalog. This card does not resurrect the function; E-79 point 3 stands and `test/er79-shape.test.ts` keeps it absent.

**R11 — `ledgerView` is what the wrapper reads, so the wrapper is rewritten to use it.** `ledgerInvariant`'s doc comment (`:619-621`) says the wrapper reads postings and holds *"directly"* **until** this card lands. After it, the comment's premise is gone: the comment is rewritten to state that a check gets its view from `ledgerView(ctx, catalog)`. The signature of `ledgerInvariant` does **not** change — `erasure.test.ts:30` keeps compiling untouched.

## Implementation steps

1. `catalog.ts`: add `export const QTY_ONLY_CODES: readonly string[] = ['EQ_SPLIT', 'LED_DISSOLUTION'];` beside `ESCROW_ONLY_CODES` (`:36`).
2. `invariants.ts`: delete the `const QTY_ONLY_CODES` at `:48`; import it from `./catalog`. The reader at `:353` is unchanged.
3. `invariants.ts`: add `import { entityOfKey } from './accounts'` and the type-only core import additions (`TruthFacts`, `TruthStoreRead`).
4. `invariants.ts`: declare `LedgerCheckView`, `ledgerView`, `fail`, `LEDGER_INV_BASE`, `I_CHECK_TO_INV` above `ledgerInvariant`.
5. `invariants.ts`: rewrite `ledgerInvariant` to spread `LEDGER_INV_BASE` instead of the three literals, and rewrite the `:619-621` comment.
6. Add `test/invariant-view.test.ts` with the ACs below.

## Test plan

All in `packages/engine/ledger/test/invariant-view.test.ts`. Each `it` is titled with its AC name so a red line can be quoted in the PR body.

**`AC-03-05RECUT-EXPORTS` — all six importable, each killing its own mutant.** Import the barrel as a namespace and read each runtime symbol through a `Record<string, unknown>` cast in its **own** `it`, so deleting one export reddens one row rather than failing the module load. Mutants: delete any one export → that row red.

**`AC-03-05RECUT-VIEW` — `ledgerView` builds what the wrapper reads.** One fixture `ctx` (`tick 7`, `partitionId 'p1'`, `scope 'TICK'`): `pre`/`post` are fake `TruthStoreRead`s with **different** balances for the same three `led.account` keys; `post['led.entry']` holds three entries — two at tick 7 (one with `invalid`) and one at tick 6 — inserted so `entryId` order ≠ insertion order; `post['led.hold']` holds two `Hold` rows in reverse `holdId` order (one ACTIVE with two parts, one RELEASED); `writeSet` has four rows — `led.account` A, `led.hold`, `led.account` A again, `led.account` B; `postings` two rows; `events` one row with a payload; `facts` one fake `TruthFacts`; `num` a fixed function. Asserts: the tick-6 entry is excluded; entries are in `entryId` order; `touchedAccounts()` is `[A, B]` (the hold id absent, A once); `touchedEntities()` is `[entityOfKey(A), entityOfKey(B)]`; `before`/`after` return different balances; `pre`/`post` are **identical references** to `ctx.pre`/`ctx.post`; `holds` exposes both rows including the RELEASED one; `events[0].payload` is dropped (only `kind` and `subjectIds` are carried); `isDayClose` is true for `scope 'DAY_CLOSE'` and for `tick 719`. Mutants: drop the tick filter → the tick-6 entry leaks; sort by insertion → order fails; keep `led.hold` in `touchedAccounts` → the hold id appears; no de-duplication → two copies of A; `before` reads `post` → the balance assertion fails; copy `pre`/`post` → the identity assertions fail; filter `holds` to ACTIVE → the RELEASED id missing; pass `ctx.events` whole → the `payload` assertion fails; `isDayClose = tick % 720 === 719` only → the `DAY_CLOSE` case fails; drop `facts` → the T03-10 consumer fixture fails.

**`AC-03-05RECUT-VIEW-MEMO` — one view per `(ctx, catalog)`.** `expect(ledgerView(ctx, cat)).toBe(ledgerView(ctx, cat))`; `expect(ledgerView(ctx, cat)).not.toBe(ledgerView(otherCtx, cat))` where `otherCtx` has the **same** tick/partition/scope and different rows; `expect(ledgerView(ctx, catA).catalog).toBe(catA)` and `expect(ledgerView(ctx, catB).catalog).toBe(catB)` with `catA !== catB`. Mutants: drop the memo → the first fails; memo on the tick triple → the second fails; ignore the catalog argument → the `catB` assertion fails.

**`AC-03-05RECUT-VIEWS` — the two shapes stay two, and the 24 shipped checks stay.** Type-level `@ts-expect-error` both ways: `const a: CheckView = view` and `const b: LedgerCheckView = checkView`; if either shape becomes assignable to the other (a shared base, or `LedgerCheckView extends CheckView`), the corresponding `@ts-expect-error` goes unused and `tsc` fails. Runtime: `TICK_INVARIANTS.length === 17`, `SYS_INVARIANTS.length === 7`, `INV_BS_011` present in `TICK_INVARIANTS` and still typed `Check`. Mutants: add a required member to `CheckView` or a second required parameter to `Check` → `invariants.test.ts`, `invariants-holds.test.ts`, `sysside.test.ts`, `review-pr3.test.ts` stop compiling; annotate `INV_BS_011` as `LedgerInvariant` → the `TICK_INVARIANTS` typecheck fails.

**`AC-03-05RECUT-FAIL` — shape, prefix, and the copy.** `fail('I1', ['e1'], 'o', 'x')` deep-equals `{ ok: false, entityIds: ['e1'], observed: 'I1: o', expected: 'x' }`; a second call with a mutable input array, mutated after the call, proves `entityIds` is a copy; for **every** key `k` of `I_CHECK_TO_INV`, `fail(k, [], 'b', 'e').observed.startsWith(`${k}: `)` — so the prefix convention and the map cannot drift apart. Mutants: drop the prefix → both fail; return `{ ok: true }` → the first fails; return the input array → the copy assertion fails.

**`AC-03-05RECUT-BASE` — one source for the three def fields.** `LEDGER_INV_BASE` deep-equals `{ module: '03', sampling: 'NEVER', sinceEngineVersion: '1.0.0' }` and is frozen (`Object.isFrozen`); `ledgerInvariant({ id: 'INV-PROBE', description: 'p', severity: 'FATAL', costClass: 'O1' }, () => ({ ok: true })).def` deep-equals the same object plus `id`/`description`/`severity`/`costClass` and `scope: 'TICK'`. Mutants: change `module` in the base to `'04'` → this test and `erasure.test.ts:34` fail; re-inline the literals in `ledgerInvariant` and change one → this test fails while `erasure` stays green (that is the point: the base is the source, not a copy); move `scope` into the base → `er79-shape.test.ts` (e) fails.

**`AC-03-05RECUT-MAP` — the map covers what the tree emits.** `Object.keys(I_CHECK_TO_INV).sort()` deep-equals the **24**-key literal set (I0..I22 plus I11b), and the values deep-equal the R8 table. A static scan over `src/invariants.ts` extracts every `F('INV-…', 'I…` pair — the scan's acceptance is the assertion, so a silent no-match cannot make it vacuous: it must find **at least 18** distinct I-numbers and **at least 39** pairs at the head (both counts derived from the scan, never hard-coded into the implementation). For each pair, `I_CHECK_TO_INV[I]` exists and **contains** the id. I-numbers with no emitting check today (I7, I9, I14, I19, I20, I22) are declared in the map and asserted **absent** from the scan's output, so the two halves stay honest. Mutants: point `I21` at `INV-LED-013` → red; delete `I11b` → the key-set assertion red; add `I23` → the key-set assertion red; type `I1` as a bare string → `tsc` fails and the T03-10 fixture fails.

**`AC-03-05RECUT-QTY-SINGLE` — one declaration, no copy.** A static scan over `src/*.ts` finds exactly **one** match of `/(?:const|let|var)\s+QTY_ONLY_CODES\b/`, and it is in `catalog.ts`. This AC is **red at the head today** (`invariants.ts:48` is the one match) — step 2 is the fix. Mutant: re-add a local `const QTY_ONLY_CODES` in `invariants.ts` → two matches → red.

**`AC-03-05RECUT-QTY-SEMANTIC` — the set I1 actually uses.** Read the **exported** array, not a literal: (a) every member resolves in a default-seeded `new ReasonCatalog()` and its `allowedTemplates` includes `'RECLASS'` — a typo (`EQ_SPLT`) fails here; (b) `INV_LED_007` accepts `amount: 0n` with `qty` for each member and **rejects** the same posting for `LED_RECLASS` (a real REVALUE/RECLASS code that is not a member). Mutants: remove `'EQ_SPLIT'` from the array → (b)'s acceptance half red; add `'LED_RECLASS'` → (b)'s rejection half red; add `'EQ_SPLT'` → (a) red. **Do not** assert owner `03`: `EQ_SPLIT` is owner `06`; both members are reasons, not catalog rows, and `catalog.test.ts`'s `AC-03-ER81-COUNTS` stays green and is not edited.

**`AC-03-05RECUT-CONSUMERS` — all four cards, not the one you happened to read.** A compile-and-runtime fixture per consumer, importing each symbol with the shape its card states:
- **T03-06**: `import { QTY_ONLY_CODES, type ReasonCatalog } from '../src'`; `QTY_ONLY_CODES.includes('EQ_SPLIT')`; a `ReasonCatalog` value typechecks. Mutant: remove `QTY_ONLY_CODES` → the fixture fails to compile.
- **T03-08**: `import { ledgerView, fail, LEDGER_INV_BASE, type LedgerInvariant } from '../src'`; `ledgerInvariant({ id: 'INV-PROBE', description: 'p', severity: 'FATAL', costClass: 'O1' }, (ctx) => fail('I11', [], 'o', 'e'))` returns a `LedgerInvariant`. Mutant: change `ledgerInvariant`'s signature or `LEDGER_INV_BASE`'s fields → the assignment fails to compile.
- **T03-09**: `import { ledgerView, fail, LEDGER_INV_BASE, type LedgerInvariant } from '../src'`; a def built with `...LEDGER_INV_BASE` and `scope: 'DAY_CLOSE'` typechecks. Mutant: widen `LEDGER_INV_BASE`'s `Pick` to include `scope` → the spread collides and `tsc` fails.
- **T03-10**: `import { ledgerView, fail, LEDGER_INV_BASE, I_CHECK_TO_INV, QTY_ONLY_CODES, type LedgerCheckView } from '../src'`; a `SubCheck` whose `run(v: LedgerCheckView)` returns `fail('I9', [], 'o', 'e')`, and `I_CHECK_TO_INV['I9']` is `['INV-LED-008']`. Mutant: drop the `facts` or `holds` member from `LedgerCheckView` → the fixture fails to compile.

**`AC-03-05RECUT-ER80-4` — the core edge stays type-only.** `test/erasure.test.ts` stays green and is **not edited**; the ledger's runtime module graph still never evaluates core. Mutant: change any core import to value position (`import { InvariantImpl }` without `type`) → `erasure.test.ts` reddens with `CORE_MODULE_WAS_EVALUATED`.

**`AC-03-05RECUT-NOTICK` — this card does not close `T03-05`.** `BUILD-ORDER.md` still shows `T03-05` as `[ ]` after this card lands, and this card's own row is `[ ]` too. Mutant: tick `T03-05` in the same PR → the check reddens.

## Done when

1. `grep -rnE "export (function|const|interface|type) (LedgerCheckView|ledgerView|fail|LEDGER_INV_BASE|I_CHECK_TO_INV|QTY_ONLY_CODES)\b" packages/engine/ledger/src/` returns all six.
2. `QTY_ONLY_CODES` has exactly one declaration, in `catalog.ts`.
3. Every AC above has a named `it` that is **red before** the change and **green after**; the mutants listed are applied and each named assertion goes red.
4. `npm run typecheck`, `npm run lint` and the ledger test suite pass, and `test/erasure.test.ts` is untouched and green.
5. `packages/engine/ledger/src/invariants.ts`'s `:619-621` comment now describes `ledgerView` as the source of the view, not as a future card.
6. `T03-05` is **not** ticked; this card's row is added to `BUILD-ORDER.md` by `order.py` and no existing tick is lost.
