---
id: T03-05-recut
unit: "03"
stage: S0
title: Re-cut of T03-05's invariant-view block — LedgerCheckView, ledgerView, fail, LEDGER_INV_BASE, I_CHECK_TO_INV and the exported QTY_ONLY_CODES
depends_on: ["T03-01", "T03-02", "T20A-01"]
spec: ["03§3.16"]
context: ["20§3.1"]
catalog: []
tests: []
invariants: []
decisions: ["E-79", "E-80", "E-81", "E-85"]
params: []
files:
  - packages/engine/ledger/src/invariants.ts
  - packages/engine/ledger/src/catalog.ts
  - packages/engine/ledger/test/invariant-view.test.ts
est_loc: 260
---

## Goal

Make the six symbols that four 03 cards already import exist, in the flat tree, with the shapes the shipped code actually needs: `LedgerCheckView`, `ledgerView`, `fail`, `LEDGER_INV_BASE`, `I_CHECK_TO_INV`, and an exported `QTY_ONLY_CODES`. This card is the **re-cut of the `packages/engine/ledger/invariants/types.ts` block of T03-05** and **supersedes that block**; it implements no invariant, adds no catalog row, and does not tick T03-05. It writes the contract the four consumer cards check against, so the implementer checks four cards, not one.

## Why this card exists — the code says so itself

`packages/engine/ledger/src/invariants.ts:619-621` says, of `ledgerInvariant`:

> *"`ledgerView` (the shared check view) lands with T03-05's re-cut card; until then the wrapper reads the postings and the hold rows from the 20A context directly."*

The named card does not exist, and nothing in `BUILD-ORDER.md` owns it. Measured at `52b30f7`, `invariants.ts` exports **zero** of the six symbols (`grep -nE 'export (function|const|interface|type) (LedgerCheckView|ledgerView|fail|LEDGER_INV_BASE|I_CHECK_TO_INV|QTY_ONLY_CODES)\b' packages/engine/ledger/src/*.ts` returns no match). The tree therefore carries a **contract gap, not a bug**: the 20A bridge works for a check written against `InvariantCtx`, the 24 shipped `Check`s work against `CheckView`, and four cards import symbols no file exports.

Three reasons T03-05's block cannot simply be kept:

1. **The block's file layout is forbidden.** It puts the members in `packages/engine/ledger/invariants/types.ts` (T03-05 `files:` line 20). E-79 part 1 forbids it: every T03 card builds into the existing **flat** `packages/engine/ledger/src`; `invariants/*` is `src/invariants.ts`; no `ledger/state`, no `schema.ts`, no new subdirectory. The test goes to `packages/engine/ledger/test/`.
2. **The block reads the catalog through `getCatalog()`** (T03-05 `Exports`, line 54: `export function getCatalog(): ReasonCatalog`). E-79 part 3 supersedes it: there is no `getCatalog()` and no `buildCatalog()`; callers use **`LedgerWorld.catalog`** (`world.ts:365`, `readonly catalog: ReasonCatalog`). `test/er79-shape.test.ts:32-35` is the gate that keeps it absent.
3. **The block's view is not the view the comment names.** The comment says the wrapper reads *"the postings and the hold rows"*, but the block's `LedgerCheckView` has no `holds` member and no `facts` member. It also omits the 20A facts view that T03-10's I9/I10 need. Two resolutions below add them (R2, R3).

## What this card supersedes — and what it does not

**Superseded, in full:**

- T03-05 `files:` line 20 (`packages/engine/ledger/invariants/types.ts`) — the six symbols live in `src/invariants.ts` and `src/catalog.ts`.
- The third block of T03-05's `## Exports` (the `LedgerCheckView` / `ledgerView` / `fail` / `LEDGER_INV_BASE` / `I_CHECK_TO_INV` block, T03-05 lines 57-81). Its **names** survive; its **paths, the one-argument `ledgerView`, the triple-keyed memo, the `getCatalog` catalog source, and the string-valued `I_CHECK_TO_INV`** do not.
- The stale `getCatalog` import in T03-08:34, T03-09:31 and T03-10:29. **This card does not build a `getCatalog` shim**; the replacement is `LedgerWorld.catalog` (R11). T03-08 is already merged and its code already reads the world's catalog; its card line is stale text, not a code defect.

**Not superseded:**

- T03-05's reason-code tables (CREDIT_CREATE, CREDIT_DESTROY, REVALUE), the 24 §8 aliases, the extension point, `catalog.ts`, and `INV_LED_002` itself. This card supplies only the view those checks use.
- `CheckView` (`invariants.ts:25-43`), `Check` (`:134`), `INV_BS_011` (`:587`), `TICK_INVARIANTS` (`:627`, 17 rows) and `SYS_INVARIANTS` (`sysinv.ts:143`, 7 rows). **Both views survive; neither is retired** (R1).
- T03-06, T03-09, T03-10 and every other card's implementation. This card changes two source files and adds one test file; it edits no other card and no other source file.

## Measured state at 52b30f7

Every line below was read in the worktree at `52b30f7`, not inferred.

| Fact | Measured |
|---|---|
| `packages/engine/ledger/src/invariants.ts` | 639 lines |
| `CheckView` (the existing view) | `invariants.ts:25-43`, **exported** |
| `Check` (the existing check shape) | `invariants.ts:134`, `type Check = (v: CheckView) => Failure[]`, **not exported** |
| `QTY_ONLY_CODES` | `invariants.ts:48`, `const`, **not exported**; its only reader is `invariants.ts:353` (the I1 amount rule) |
| `LedgerInvariant` | `invariants.ts:572-573`, `= InvariantImpl<Posting>` |
| `INV_BS_011` | `invariants.ts:587`, typed `Check`; its observed strings are `I11`, `I11b`, `I12` |
| `ledgerInvariant(def, check)` | `invariants.ts:622-625`; hard-codes `module: '03', scope: 'TICK', sampling: 'NEVER', sinceEngineVersion: '1.0.0'` |
| `TICK_INVARIANTS` | `invariants.ts:627`, **17** rows |
| `SYS_INVARIANTS` | `sysinv.ts:143`, **7** rows — 24 `Check`-shaped invariants on `CheckView` |
| `LedgerCheckView`, `ledgerView`, `fail`, `LEDGER_INV_BASE`, `I_CHECK_TO_INV` | **0 exports** anywhere in `packages/`; `ledgerView` appears only in the comment at `:620` |
| `LedgerWorld.catalog` | `world.ts:365`, `readonly catalog: ReasonCatalog`; assigned in the constructor at `:378` (`opts.catalog ?? new ReasonCatalog()`) |
| `TICKS_PER_DAY` | `world.ts:22`, `720`; `isDayClose = tick % TICKS_PER_DAY === TICKS_PER_DAY - 1` at `:929` |
| `entityOfKey` | `accounts.ts:68`, `(key) => key.split(':')[0]` |
| `ESCROW_ONLY_CODES` | `catalog.ts:36`, `readonly string[]` — the shape and home this card reuses for `QTY_ONLY_CODES` |
| Core invariant types | `packages/engine/core/invariants/types.ts`: `InvariantDef` :7, `TruthStoreRead` :12, `TruthWrite` :17, `TruthEvent` :18, `TruthFacts` :20, `InvariantCtx` :21, `InvariantOutcome` :32, `InvariantImpl` :33 |
| `tsconfig` mapping | `packages/engine/ledger/tsconfig.json` maps `@tycoon/engine-core/invariants` to `../core/invariants/index.ts` |
| Barrel | `src/index.ts` has `export * from './catalog'` and `export * from './invariants'`; no barrel edit is needed |
| `er79-shape.test.ts` | `:32-35` asserts no `export function|const getCatalog|buildCatalog` in every `packages/engine/**/*.ts`, and `readonly catalog: ReasonCatalog` in `world.ts` |
| Tests naming the rule | **no test** in `packages/engine/ledger/test/` mentions `QTY_ONLY_CODES`; the only `LED_DISSOLUTION` test (`review-pr3.test.ts:233-243`) is about entity status, not the `0n` rule. The `0n` allowance at `:353` has no test today. |

## Imports

- T03-01: `Entry`, `Account`, `Posting`, `Hold`, `Id`, `Tick` (`./types`, `./money`), `entityOfKey` (`./accounts`), and `cmpStr` (`./det` — add it to the existing `SortedMap` import at `:4`).
- T03-02: `ReasonCatalog` (`./catalog`). Do **not** import `buildCatalog`: E-79 part 3 supersedes it.
- T20A-01: `InvariantCtx`, `InvariantDef`, `InvariantOutcome`, `TruthStoreRead`, `TruthFacts` — **type-only**, from `'@tycoon/engine-core/invariants'` with the `type` keyword (E-80.4). `InvariantImpl` is already the target of `LedgerInvariant`; this card does not need to import it again.
- **No `PhaseCtx`** (defined in `packages/engine/core/module/ctx.ts:25`, which pulls `@tycoon/params`; the ledger's isolated CI does not install it). A signature requiring `PhaseCtx` is unbuildable here — that is what sank the earlier card attempt. `InvariantCtx` is the allowed core invariant type.
- `TICKS_PER_DAY` is **not** imported from `world.ts`: `world.ts` imports `./invariants` (`:8`), so importing it back is a cycle. The rule is mirrored as the literal `720`/`719` and the test asserts the sync against `TICKS_PER_DAY` (R12).

## Exports

```ts
// packages/engine/ledger/src/catalog.ts   (beside ESCROW_ONLY_CODES :36 — same shape, same file)
/**
 * I1's zero-amount exception (T03-05 step 3; E-11 point 4): the two QTY_ONLY codes whose postings may
 * carry amount 0n with qty. This is a rule list, NOT a catalog source: both codes are ordinary
 * CATALOG_SEED rows (E-81), and this array adds no row.
 */
export const QTY_ONLY_CODES: readonly string[];              // ['EQ_SPLIT', 'LED_DISSOLUTION']

// packages/engine/ledger/src/invariants.ts
export interface LedgerCheckView {                            // the 20A-context view; ONE per (ctx, catalog) (R5)
  tick: Tick; partitionId: string; isDayClose: boolean;       // isDayClose = ctx.scope === 'DAY_CLOSE' || ctx.tick % 720 === 719 (R12)
  entries: readonly Entry[];                                  // 'led.entry' rows with e.tick === ctx.tick, valid and invalid, sorted by entryId (cmpStr)
  postings: readonly Posting[];                               // ctx.postings, by REFERENCE, order unchanged
  holds: readonly Hold[];                                     // every 'led.hold' row in ctx.post, sorted by holdId (cmpStr); status NOT filtered (R2)
  before(key: string): Account | undefined;                   // ctx.pre.get<Account>('led.account', key)
  after(key: string): Account | undefined;                    // ctx.post.get<Account>('led.account', key)
  touchedAccounts(): readonly string[];                       // unique ids of ctx.writeSet rows with table 'led.account', sorted by cmpStr (R6)
  touchedEntities(): readonly Id[];                           // entityOfKey of touchedAccounts(), unique, sorted by cmpStr
  pre: TruthStoreRead; post: TruthStoreRead;                  // ctx.pre / ctx.post, by REFERENCE
  facts: TruthFacts;                                          // ctx.facts, by REFERENCE (T03-10 I9/I10 need it; R3)
  catalog: ReasonCatalog;                                     // the second argument of ledgerView, by REFERENCE
  events: readonly { kind: string; subjectIds: Id[] }[];      // ctx.events projected: kind + a copied subjectIds; payload and visibility dropped
  num(paramKey: string): number;                              // ctx.num
}
export function ledgerView(ctx: InvariantCtx<Posting>, catalog: ReasonCatalog): LedgerCheckView;
// memo: WeakMap<InvariantCtx<Posting>, { catalog: ReasonCatalog; view: LedgerCheckView }>; same ctx + same catalog => same object;
// same ctx + a different catalog rebuilds and replaces (R5). It is NOT keyed by (tick, partitionId, scope): two contexts can share that triple.
export function fail(iNumber: string, entityIds: readonly Id[], observed: string, expected: string): InvariantOutcome;
// { ok: false, entityIds: [...entityIds], observed: `${iNumber}: ${observed}`, expected } — a fresh array, prefixed (R10)
export const LEDGER_INV_BASE: Pick<InvariantDef, 'module' | 'sampling' | 'sinceEngineVersion'>;
// Object.freeze({ module: '03', sampling: 'NEVER', sinceEngineVersion: '1.0.0' }); ledgerInvariant spreads it and keeps scope: 'TICK' literal (R9)
export const I_CHECK_TO_INV: Readonly<Record<string, readonly string[]>>;
// 24 keys: I0..I22 (23) + I11b; list-valued because six I-numbers map to two ids each (R8, table below)
```

## Resolutions — decided here, not left to the implementer

**R1 — `LedgerCheckView` vs `CheckView`: both survive, neither is retired, and neither is a subtype of the other.** `CheckView` (`invariants.ts:25-43`) is the P13 runtime view consumed by the **24** shipped `Check`s (`TICK_INVARIANTS` 17 at `:627` + `SYS_INVARIANTS` 7 at `sysinv.ts:143`), including `INV_BS_011` at `:587` — the line the brief points at. `LedgerCheckView` is the 20A-context view consumed by `InvariantImpl` checks, starting with T03-10's `SubCheck.run(v: LedgerCheckView)`. The reason both must exist:

| | `CheckView` (`:25`) | `LedgerCheckView` (new) |
|---|---|---|
| consumer | 24 shipped `Check`s (`TICK_INVARIANTS`/`SYS_INVARIANTS`) | `InvariantImpl` checks (`InvariantCtx<Posting>`) |
| `pre`/`post` | materialised `Accounts` maps (`SortedMap<string, Bal>`) | `TruthStoreRead` references (`ctx.pre`/`ctx.post`) |
| account lookup | none; checks read `v.pre`/`v.post` maps | `before(key)` / `after(key)` |
| holds | optional `SortedMap<Id, Hold>`; `INV_BS_011` (`:587`) and `INV-LED-022`/`-024` read it | required `readonly Hold[]`, sorted by `holdId`; all statuses |
| runtime-only members | `facts` as `{overdraftLimit, intradayLimit}`, `flows` (with `flows.sysSide`), `alarm`, `sys`, `dayEntries`, `flowsToday`, `dayHistory`, `todayByCode`, optional `escrows`, `accruals` | none of these; a 20A context cannot supply them |
| 20A-only members | none | `partitionId`, `postings`, `before`/`after`, `touchedAccounts`, `touchedEntities`, `events`, `num`, `facts` as `TruthFacts` |
| shared names | `tick`, `isDayClose`, `catalog`, `entries` (different row set: `CheckView` = valid queue order; `LedgerCheckView` = valid + invalid, `entryId` order) | same |

**Neither `extends` the other, and no cast between them is allowed.** `INV_BS_011` (`:587`) **stays** a `Check` on `CheckView` and is **not migrated by this card**; `TICK_INVARIANTS` and `SYS_INVARIANTS` are not edited. T03-08's comment that "T03-05's re-cut wraps this same check as the `LedgerInvariant` without changing it" is a stale aspiration: a `Check` returns `Failure[]` from a `CheckView`, and `ledgerView` returns a `LedgerCheckView`; wrapping it without a rewrite is impossible. The later migration is three read sites (`v.holds`, `v.post` balance, `v.post` qty), not a new data source — and it is **not this card's work**.

**R2 — the view carries the hold rows, as an array.** This is what retires the sentence at `:619-621`. `holds` is `[...ctx.post.iter<Hold>('led.hold')]` sorted by `holdId` (`cmpStr`), **all statuses**. The view is a projection, not a filter: `INV_BS_011` decides which rows are ACTIVE. `escrows` and `accruals` are **not** added: no 20A-scoped check reads them today (the only readers are the `sysinv.ts` `Check`s, `INV-LED-022`/`-024`), and a later card that needs one adds a single member. **On the brief's `{ own, read, post, holds }`:** that is a composite of two objects. `own`/`read` are `LedgerRuntime` fields (`T03-08`), not `InvariantCtx` members — `InvariantCtx` carries `pre`/`post` (`TruthStoreRead`), `writeSet`, `postings`, `events`, `facts`, `num` (`core/invariants/types.ts:21-31`), and a 20A check never receives a runtime handle (E-80.4). The four data references the view actually pins are `postings`, `pre`, `post` and `holds` (plus `facts`); the equivalence test asserts all of them, three by identity and `holds` by the sorted row ids.

**R3 — the view carries `facts`.** The T03-05 block omits it, but T03-10's I9/I10 read `INTRADAY_CREDIT_LIMIT`, `ELIGIBLE_COLLATERAL` and `SEC_BORROW` through the 20A facts view (`T03-10` steps 5-6). `facts: TruthFacts` is `ctx.facts` by reference; it is not a copy and the view does not interpret it. Without this member, T03-10's `SubCheck` cannot implement I9/I10, and "the widest dependent" is not met.

**R4 — `ledgerView` takes the catalog as its second argument.** `ledgerView(ctx, catalog)`, non-optional. The catalog is not on `InvariantCtx`, and E-79 part 3 forbids a module-level `getCatalog()`. A default or optional catalog would reintroduce a second catalog source; do not add one. Callers pass `LedgerWorld.catalog` — the world's own instance, not a fresh `ReasonCatalog` (the E-79 amendment's point: a fresh instance is equivalent in rows but separate in `registerReasonCodes` state).

**R5 — the memo key is the `ctx` object, not `(tick, partitionId, scope)`.** The T03-05 block's triple key is wrong: two distinct contexts can share a tick, a partition and a scope (two fixtures in one test, a replay, a safe-mode retry), and a triple-keyed memo would serve the first context's rows to the second. The memo is `WeakMap<InvariantCtx<Posting>, { catalog: ReasonCatalog; view: LedgerCheckView }>`; a call with the same ctx and the same catalog returns the same object, a different catalog rebuilds and replaces. The catalog check is not cosmetic: `view.catalog` is a member, and a memo that ignores the argument would return the wrong catalog.

**R6 — the set-valued members are sets.** `touchedAccounts()` is the **unique** `id` of every `ctx.writeSet` row whose `table === 'led.account'`, sorted by `cmpStr`. De-duplication matters: a `writeSet` can carry several writes on one account, and `touchedEntities()` derives from the list, so a duplicate would double an entity. `touchedEntities()` is `entityOfKey(id)` for each account, unique, sorted. `entries` is filtered by `e.tick === ctx.tick` (the `led.entry` table can hold rows from earlier ticks, so the filter is required), includes invalid entries, and is sorted by `entryId` — not by insertion or queue order. `events` is projected to `{ kind, subjectIds }` with a copied `subjectIds`; `payload` and `visibility` never reach a check.

**R7 — `QTY_ONLY_CODES` is declared once, in `catalog.ts`, and the I1 check imports it.** The local `const` at `invariants.ts:48` is **deleted**; `invariants.ts:353` reads the imported array unchanged. Why `catalog.ts` and not `invariants.ts`: T03-06's `normalizeDraft` lives in the flat template/rail file, and `invariants.ts` already imports `./templates` (`legKey` at `:6`); exporting the list from `invariants.ts` would make `templates.ts → invariants.ts → templates.ts` a cycle. `catalog.ts` is the module both sides already import, and it is the home of the same shape (`ESCROW_ONLY_CODES` at `:36`), matching T03-05's `catalog/*` → `catalog.ts` mapping. The array the check reads **is** the exported array — there is no copy to drift.

**R8 — `I_CHECK_TO_INV` is list-valued, and the values are the crosswalk, not a guess.** A `string` value cannot express the shipped code: `I1` is emitted by `INV-LED-002` and `INV-LED-007`, `I4` by `INV-LED-003` and `INV-LED-004`, and `I5`/`I6`/`I7`/`I8` are split between `INV-LED-001` (incremental) and `INV-LED-010` (full scans). A string map would either drop one id or force a rename of shipped `observed` strings. The 24 keys and values:

| I | invariant id(s) | | I | invariant id(s) |
|---|---|---|---|---|
| `I0` | `INV-LED-012` | | `I12` | `INV-BS-011` |
| `I1` | `INV-LED-002`, `INV-LED-007` | | `I13` | `INV-LED-005` |
| `I2` | `INV-LED-001` | | `I14` | `INV-LED-010` |
| `I3` | `INV-LED-010` | | `I15` | `INV-LED-010` |
| `I4` | `INV-LED-003`, `INV-LED-004` | | `I16` | `INV-LED-012` |
| `I5` | `INV-LED-001`, `INV-LED-010` | | `I17` | `INV-LED-003` |
| `I6` | `INV-LED-001`, `INV-LED-010` | | `I18` | `INV-LED-003` |
| `I7` | `INV-LED-001`, `INV-LED-010` | | `I19` | `INV-BS-002` |
| `I8` | `INV-LED-001`, `INV-LED-010` | | `I20` | `INV-BS-004` |
| `I9` | `INV-LED-008` | | `I21` | `INV-LED-014` |
| `I10` | `INV-LED-008` | | `I22` | `INV-LED-010` |
| `I11` | `INV-BS-011` | | `I11b` | `INV-BS-011` |

`I11b` is shipped (`invariants.ts:598`) and is the 24th key; the T03-05 block's comment lists only `I0..I22` and would miss it. `I19`/`I20`/`I22` are not emitted by the ledger yet (`T03-10`/`T03-23` add them); the map is the full crosswalk, and the static scan only asserts that what the tree emits is a subset.

**R9 — `LEDGER_INV_BASE` is the single source of the three def fields.** `ledgerInvariant` spreads it: `{ def: { ...def, scope: 'TICK', ...LEDGER_INV_BASE }, check }`. The `scope: 'TICK'` stays a **literal** in `invariants.ts`: `test/er79-shape.test.ts` (f) asserts `/scope: 'TICK'/`, so moving it into the base turns the E-79 gate red. `LEDGER_INV_BASE` carries only `module`, `sampling`, `sinceEngineVersion`; a DAY_CLOSE def built by T03-10's `composeInvariant` supplies its own `scope`.

**R10 — `fail` is the 20A-shaped sibling of the private `F`, not a replacement for it.** `F` returns `Failure` (`invariantId`, `severity`) for the 24 shipped `Check`s; `fail` returns `InvariantOutcome` (`ok`, `entityIds`, `observed`, `expected`) for `InvariantImpl`s. Both stay. `fail` copies `entityIds` (`[...entityIds]`) because `InvariantOutcome` requires a mutable `string[]`; returning the readonly input directly is a type error and, if widened, lets a caller mutate an outcome after the fact.

**R11 — `getCatalog` stays absent; `LedgerWorld.catalog` replaces it in the three acceptance cards (and in the same way in the later ones).** No `getCatalog` or `buildCatalog` is built, exported, aliased or defaulted. `test/er79-shape.test.ts:32-35` is the assertion: it scans every engine source for the two export names and requires `readonly catalog: ReasonCatalog` in `world.ts`. The replacement, card by card:

- **T03-08:34** — `getCatalog` → **`LedgerWorld.catalog`**. T03-08 is already merged and its code already does this (`world.ts:365/378/670/676`); only the card's import line is stale. No code change is needed for T03-08.
- **T03-09:31 and step 1 (`:91`, `catalog: getCatalog()`)** — `getCatalog()` → **the world's catalog** passed into the partition (`LedgerWorld.catalog`; a `LedgerPartitionImpl` holds the same instance, never a fresh one).
- **T03-10:29** — `getCatalog` → **`LedgerWorld.catalog`** for the scanner/real code; in a test outside `src/`, `new ReasonCatalog()` is an equivalent instance (E-79 part 3 amendment) — same seed and ledger extension codes, separate registration state.

Do not "help" the stale cards by exporting a deprecated `getCatalog`: that is the one line `er79-shape.test.ts` catches, and it is exactly what E-79 part 3 removes.

**R12 — `isDayClose` mirrors `TICKS_PER_DAY` and the test keeps the two in sync.** `isDayClose = ctx.scope === 'DAY_CLOSE' || ctx.tick % 720 === 719`. `world.ts` owns `TICKS_PER_DAY = 720` (`:22`) and computes the same rule at `:929`; importing it from `world.ts` would cycle (`world.ts` imports `./invariants`). The literal is therefore a mirror, not a second rule: the test imports `TICKS_PER_DAY` from the barrel and asserts `ledgerView`'s `isDayClose` equals `tick % TICKS_PER_DAY === TICKS_PER_DAY - 1` at 719, 720 and 1439 (and at a `'DAY_CLOSE'` scope). Change either side and the sync test fails.

## DIVERGENCE (E-85)

**DIVERGENCE (E-85):** from 03 §3.16 I1 — cause: ERRATUM E-11 — build: `QTY_ONLY_CODES` is the exported two-code allow-list (`EQ_SPLIT`, `LED_DISSOLUTION`); `INV_LED_007` admits `amount = 0n` only with `qty` and only for those codes, and keeps `amount > 0n` for every other code. E-11 point 4 makes these two `NONE`-policy QTY_ONLY codes (no value leg; override rejected); the zero-amount record is that special-code rule. The same departure from `20 §3.1 INV-LED-007` is the same line and is not re-marked.

**No other `DIVERGENCE (E-85)` mark is due.** The `invariants/types.ts` path and the `getCatalog` catalog source are not spec-vs-card departures: they are card-block defects that **E-79** (FINAL) supersedes, and E-85 §2.1 says a FINAL erratum binds over both texts and a mark cannot launder it. Marking them would name an erratum the mark itself contradicts — invalid under E-85 §3 (a mark whose `build:` contradicts the cause it names is no mark). The card follows E-79 and says so at the point of the change.

## Dependents and their symbols — check four, not one

| Card | Import line at `52b30f7` | Symbols it consumes from this card | What this card supplies | What is replaced |
|---|---|---|---|---|
| **T03-06** | `:27` — `T03-05: ReasonCatalog, QTY_ONLY_CODES` | `QTY_ONLY_CODES`; `ReasonCatalog` already exists in `catalog.ts` | `QTY_ONLY_CODES` exported from `catalog.ts`; `ReasonCatalog` unchanged | none |
| **T03-08** | `:34` — `T03-05: getCatalog, ReasonCatalog, LedgerInvariant, ledgerView, fail, LEDGER_INV_BASE` | `ledgerView`, `fail`, `LEDGER_INV_BASE`; `ReasonCatalog` and `LedgerInvariant` already exist | the three new symbols; **no `getCatalog`** | `getCatalog` → `LedgerWorld.catalog` (T03-08's merged code already does this) |
| **T03-09** | `:31` — `T03-05: getCatalog, LedgerInvariant, ledgerView, fail, LEDGER_INV_BASE` | `ledgerView`, `fail`, `LEDGER_INV_BASE`; `LedgerInvariant` exists | the three new symbols; **no `getCatalog`** | `getCatalog` → `LedgerWorld.catalog`; step 1's `catalog: getCatalog()` → the world's instance |
| **T03-10** | `:29` — `T03-05: LedgerInvariant, ledgerView, fail, LEDGER_INV_BASE, I_CHECK_TO_INV, QTY_ONLY_CODES, getCatalog` | **all six**: `LedgerCheckView` (`SubCheck.run`), `ledgerView`, `fail`, `LEDGER_INV_BASE`, `I_CHECK_TO_INV`, `QTY_ONLY_CODES` | all six; **no `getCatalog`** | `getCatalog` → `LedgerWorld.catalog`; tests may use `new ReasonCatalog()` |

Also measured, and later consumers of the same symbols: `T03-11:31`, `T03-12:28`, `T03-18:45` and `T03-25:47` name `ledgerView` and/or `getCatalog`; `T03-16:42` and `T03-17:40` name `ledgerView (invariants/types.ts)`. The same replacement and the same flat path apply to them, but the four rows above are this card's acceptance set.

## Implementation steps

1. `catalog.ts`: add `QTY_ONLY_CODES` directly after `ESCROW_ONLY_CODES` (`:36`), with the comment above. Do not add it to `CATALOG_SEED`, `ALIAS_SEED`, `LEDGER_EXTENSION_CODES` or any catalog table; it is a rule list (E-81).
2. `invariants.ts`: add `QTY_ONLY_CODES` to the existing `./catalog` import at `:3`; add `cmpStr` to the `./det` import at `:4` and `entityOfKey` to the `./accounts` import at `:2`; extend the type-only core import at `:14` with `InvariantDef`, `TruthStoreRead` and `TruthFacts`. Delete the `const` at `:48`. The reader at `:353` is unchanged — do not rewrite the I1 expression.
3. `invariants.ts`: add `LedgerCheckView` and `ledgerView` immediately after `CheckView` (after `:43`), so the two shapes are adjacent and their difference is readable in one screen. `LedgerCheckView` must not `extends CheckView`, and `CheckView` must not gain a member.
4. `ledgerView(ctx, catalog)`:
   - memo lookup by `ctx` identity; if the stored catalog is `catalog`, return the stored view; if it is a different catalog, rebuild and replace (R5);
   - `entries`: `[...ctx.post.iter<Entry>('led.entry')].filter((e) => e.tick === ctx.tick)`, sorted by `cmpStr(a.entryId, b.entryId)`;
   - `holds`: `[...ctx.post.iter<Hold>('led.hold')]`, sorted by `cmpStr(a.holdId, b.holdId)`;
   - `touchedAccounts()`: `ctx.writeSet` rows with `table === 'led.account'`, map `id`, de-duplicate, sort `cmpStr`; `touchedEntities()`: `entityOfKey` of that list, de-duplicate, sort `cmpStr`;
   - `before`/`after`: `ctx.pre.get<Account>('led.account', key)` / `ctx.post.get<Account>('led.account', key)`;
   - `pre`, `post`, `postings`, `facts`, `catalog`: the arguments/ctx members by reference;
   - `events`: `ctx.events.map((e) => ({ kind: e.kind, subjectIds: [...e.subjectIds] }))`;
   - `num`: `(k) => ctx.num(k)`; `isDayClose`: the R12 rule; `tick`/`partitionId`: copies.
5. `fail`: `({ ok: false, entityIds: [...entityIds], observed: `${iNumber}: ${observed}`, expected })`.
6. `LEDGER_INV_BASE`: `Object.freeze({ module: '03', sampling: 'NEVER', sinceEngineVersion: '1.0.0' })` typed `Pick<InvariantDef, 'module' | 'sampling' | 'sinceEngineVersion'>`; `ledgerInvariant` returns `{ def: { ...def, scope: 'TICK', ...LEDGER_INV_BASE }, check }`. Keep the `scope: 'TICK'` literal.
7. `I_CHECK_TO_INV`: the R8 table as data, `Readonly<Record<string, readonly string[]>>`; place it next to `LEDGER_INV_BASE`.
8. `test/invariant-view.test.ts`: the fixture and every AC below. The static scans walk `packages/engine/ledger/src/*.ts` with `fs` (the same technique T03-05 step 9 established for its reason-code scanner) — a test outside `src/` may read files.
9. No other file changes: no barrel edit (`index.ts` already re-exports both modules), no `tsconfig` edit (the `@tycoon/engine-core/invariants` mapping exists), no `.gitignore`, no new directory. Do not edit `T03-08`/`T03-09`/`T03-10`'s cards or code; this card records the replacement, their implementers apply it.

## Test plan

All tests live in `packages/engine/ledger/test/invariant-view.test.ts`. A test named `AC-03-05R-…` that fails must name the AC in its title, so the PR body can quote the red line.

**`AC-03-05R-EXPORTS` — each of the six, and the mutant that kills it.** The file imports the barrel as a namespace and, for each runtime symbol, reads it through a `Record<string, unknown>` cast in its own `it`, so deleting one export fails that row, not the whole module load:

| export | assertion | gate | mutant that reddens it |
|---|---|---|---|
| `ledgerView` | `typeof` is `'function'` | `vitest` | delete the export → `expected 'function', received 'undefined'` |
| `fail` | `typeof` is `'function'` | `vitest` | delete → same |
| `LEDGER_INV_BASE` | `typeof` is `'object'` and `.module === '03'` | `vitest` | delete → `Cannot read properties of undefined` |
| `I_CHECK_TO_INV` | `typeof` is `'object'` and `Object.keys(...).length === 24` | `vitest` | delete → `Cannot convert undefined or null to object` |
| `QTY_ONLY_CODES` | `Array.isArray` and deep-equals `['EQ_SPLIT', 'LED_DISSOLUTION']` | `vitest` | delete → `QTY_ONLY_CODES is not iterable` |
| `LedgerCheckView` | a typed fixture `const v: LedgerCheckView = …` | `tsc` | delete the type → `TS2305: Module '…' has no exported member 'LedgerCheckView'` |

The `LedgerCheckView` row is **compile-only**: say so in the PR body; do not claim a runtime kill. The barrel is part of the surface: the file imports from `../src`, not `../src/invariants`.

**`AC-03-05R-VIEW` — `ledgerView` builds the view the workaround builds.** One in-memory fixture `ctx` (`tick 7`, `partitionId 'p1'`, `scope 'TICK'`): `pre` and `post` are two fake `TruthStoreRead`s over maps with **different** balances for the same three `led.account` keys; `post['led.entry']` holds three entries — two at tick 7 (one with `invalid` set) and one at tick 6 — inserted in an order where `entryId` order ≠ insertion order; `post['led.hold']` holds two `Hold` rows in reverse `holdId` order (one ACTIVE with two parts, one RELEASED); `writeSet` has four rows: `led.account` key A, `led.hold`, `led.account` key A again (duplicate), `led.account` key B; `postings` two rows; `events` one row with a payload and a visibility; `facts` one fake `TruthFacts`; `num` a fixed function.

The test computes the expected view **by hand from the ctx** — the projection the comment at `:619-621` describes — and asserts:

- `view.postings` **is** `ctx.postings` (`toBe`), order unchanged; `view.pre` **is** `ctx.pre`; `view.post` **is** `ctx.post`; `view.facts` **is** `ctx.facts`; `view.catalog` **is** the catalog passed in.
- `view.entries.map(e => e.entryId)` deep-equals the two tick-7 ids **in `entryId` order**; the tick-6 id absent; the invalid entry present.
- `view.holds.map(h => h.holdId)` deep-equals the two ids **in `holdId` order**, the ACTIVE and the RELEASED both present, and the full row (`amount`, `remaining`, `parts`, `expiresTick`, `status`) carried.
- `view.before(k)` reads `pre` and `view.after(k)` reads `post`, proven on the key whose balances differ; `before('absent')` is `undefined`.
- `view.touchedAccounts()` deep-equals the unique sorted account keys — the `led.hold` writeSet row absent, the duplicate collapsed.
- `view.touchedEntities()` deep-equals the unique sorted `entityOfKey` values.
- `view.events` deep-equals `[{ kind, subjectIds }]` — no `payload`, no `visibility`.
- `view.num('x')` equals `ctx.num('x')`.
- `isDayClose`: `tick 719, scope 'TICK'` → true; `tick 7, scope 'DAY_CLOSE'` → true; `tick 7, scope 'TICK'` → false; and `tick 719/720/1439` match `tick % TICKS_PER_DAY === TICKS_PER_DAY - 1` (R12).

**Mutants this assertion must kill** (each is a mutation to the implementation, and the named assertion goes red): M1 drop the `e.tick === ctx.tick` filter → the tick-6 entry leaks in; M2 sort entries by insertion → the `entryId` order assertion fails; M3 keep `led.hold` writeSet rows in `touchedAccounts` → the hold id appears; M4 do not de-duplicate → two copies of account A; M5 `before` reads `post` → the differing-balance assertion fails; M6 assign copies of `pre`/`post` → the `toBe` assertions fail; M7 filter `holds` to `ACTIVE` → the RELEASED id missing; M8 pass `ctx.events` through whole → the `payload` assertion fails; M9 `isDayClose = tick % 720 === 719` only → the `scope 'DAY_CLOSE'` case fails; M10 drop `facts` → the view fixture and the T03-10 consumer fixture fail.

**`AC-03-05R-VIEW-MEMO` — derived once per (ctx, catalog).** `expect(ledgerView(ctx, cat)).toBe(ledgerView(ctx, cat))`; `expect(ledgerView(ctx, cat)).not.toBe(ledgerView(otherCtx, cat))` where `otherCtx` has the **same** `tick`/`partitionId`/`scope` and different rows; `expect(ledgerView(ctx, catA).catalog).toBe(catA)` and `expect(ledgerView(ctx, catB).catalog).toBe(catB)`, with `catA !== catB`. Mutants: drop the memo → the first fails; memo on `(tick, partitionId, scope)` → the second fails (R5); memo that ignores the catalog argument → the catB assertion fails.

**`AC-03-05R-VIEWS` — the two shapes stay two, and the 24 shipped checks stay.** Type-level `@ts-expect-error` assignments both ways: `const a: CheckView = view` and `const b: LedgerCheckView = checkView`; if either shape becomes assignable to the other (e.g. `LedgerCheckView extends CheckView`), the corresponding `@ts-expect-error` becomes unused and `tsc` fails. Runtime: `TICK_INVARIANTS.length === 17`, `SYS_INVARIANTS.length === 7`, `INV_BS_011` is present in `TICK_INVARIANTS`, and `INV_BS_011` is still typed `Check`. Mutants: add a required member to `CheckView` or a required second parameter to `Check` → `invariants.test.ts`, `invariants-holds.test.ts`, `sysside.test.ts` and `review-pr3.test.ts` stop compiling; annotate `INV_BS_011` as `LedgerInvariant` → the `TICK_INVARIANTS` typecheck fails.

**`AC-03-05R-FAIL` — the helper's shape and prefix.** `fail('I1', ['e1'], 'o', 'x')` deep-equals `{ ok: false, entityIds: ['e1'], observed: 'I1: o', expected: 'x' }`; a second call with a mutable input array, mutated after the call, proves `entityIds` is a copy; for **every** key `k` of `I_CHECK_TO_INV`, `fail(k, [], 'b', 'e').observed.startsWith(`${k}: `)` is true, so the prefix convention and the map cannot drift apart. Mutants: drop the prefix → the first and the loop fail; return `{ ok: true }` → the first fails; return the input array → the copy assertion fails.

**`AC-03-05R-BASE` — one source for the three def fields.** `LEDGER_INV_BASE` deep-equals `{ module: '03', sampling: 'NEVER', sinceEngineVersion: '1.0.0' }` and is frozen; `ledgerInvariant({ id: 'INV-PROBE', description: 'p', severity: 'FATAL', costClass: 'O1' }, () => ({ ok: true })).def` deep-equals `{ id: 'INV-PROBE', description: 'p', severity: 'FATAL', costClass: 'O1', scope: 'TICK', module: '03', sampling: 'NEVER', sinceEngineVersion: '1.0.0' }`. Mutants: change `module` in the base to `'04'` → this test and `erasure.test.ts:34` fail; inline the three literals in `ledgerInvariant` again and change one → this test fails while `erasure` stays green (that is the point: the base is the source, not a copy); move `scope` into the base → `er79-shape.test.ts` (f) fails.

**`AC-03-05R-MAP` — the mapping covers what the tree emits.** `Object.keys(I_CHECK_TO_INV).sort()` deep-equals the 24-key literal set (`I0`..`I22` plus `I11b`), and the values deep-equal the R8 table. A static scan over `packages/engine/ledger/src/invariants.ts` extracts every `F('INV-…', 'I…` and `fail('I…', …)` pair, including multi-line declarations, and asserts for each pair that `I_CHECK_TO_INV[I]` exists and **contains** the id. The scan only accepts observed strings that begin with `I<digits>` or `I11b`; `sysinv.ts`'s Δ-series strings (`INV-LED-016`..`-024`) carry no 03 §3.16 I-number and are outside this map. The scan's coverage is part of the AC: it must find at least 20 pairs at the head (the count is derived from the scan, not hard-coded into the implementation), so a silent no-match cannot make the assertion vacuous. Mutants: point `I21` at `INV-LED-013` → red; delete `I11b` → the key-set assertion red (the tree emits it); add `I23` → the key-set assertion red; change `I1` to a single string → `tsc` and the T03-10 consumer fixture red.

**`AC-03-05R-QTY-SINGLE` — one declaration, no copy.** A static scan over `packages/engine/ledger/src/*.ts` finds exactly **one** match of `/(?:const|let|var)\s+QTY_ONLY_CODES\b/`, and it is in `catalog.ts`. This AC is **red at the head today** (`invariants.ts:48` is the one match) — the fix is step 2. Mutant: re-add a local `const QTY_ONLY_CODES` in `invariants.ts` → two matches → red.

**`AC-03-05R-QTY-SEMANTIC` — the set the I1 check uses, not a list that happens to match.** Two halves, both read the **exported** array: (a) every member resolves in a default-seeded `ReasonCatalog` (`new ReasonCatalog()` in the test; E-79 amendment) and its `allowedTemplates` includes `'RECLASS'` — a typo (`EQ_SPLT`) fails here; (b) `INV_LED_007` — called with a minimal `CheckView` fixture carrying the single posting — accepts `amount: 0n` with `qty` for each member, and **rejects** the same posting for `LED_RECLASS` (a real REVALUE/RECLASS code that is not a member; `LED_MTM_DAILY` is also a valid control). Mutants: remove `'EQ_SPLIT'` from the array → (b)'s acceptance half red; add `'LED_RECLASS'` → (b)'s rejection half red; add `'EQ_SPLT'` → (a) red. **Do not** assert owner `03`: `EQ_SPLIT` is owner `06` in `catalog.csv` (`LED_DISSOLUTION` is owner `03`); both are REVALUE/RECLASS. `QTY_ONLY_CODES` is not a catalog source — the existing `AC-03-ER81-COUNTS` in `catalog.test.ts` stays green and is not edited.

**`AC-03-05R-CONSUMERS` — all four cards, not the one you happened to read.** A compile-and-runtime fixture in the test file imports each symbol with the shape its card uses:

- **T03-06**: `import { QTY_ONLY_CODES, type ReasonCatalog } from '../src'`; `QTY_ONLY_CODES.includes('EQ_SPLIT')` and a `ReasonCatalog` value typechecks. Mutant: remove `QTY_ONLY_CODES` → the fixture fails to compile.
- **T03-08**: `import { ledgerView, fail, LEDGER_INV_BASE, type LedgerInvariant } from '../src'`; `ledgerInvariant({ id: 'INV-PROBE', description: 'p', severity: 'FATAL', costClass: 'O1' }, (ctx) => fail('I11', [ctx.partitionId], 'o', 'e'))` returns a `LedgerInvariant`; the 17+7 shipped checks still run. Mutant: change `ledgerInvariant`'s signature or `LEDGER_INV_BASE`'s fields → the `LedgerInvariant` assignment fails to compile.
- **T03-09**: `ledgerView(ctx, catalog)` returns a `LedgerCheckView`; `fail('I13', [], 'o', 'e')` is an `InvariantOutcome`; `LEDGER_INV_BASE` is usable in a def. Mutant: make `ledgerView` return `CheckView` → the T03-10 fixture below and this assignment fail.
- **T03-10**: `type SubCheck = { iNumber: string; run(v: LedgerCheckView): InvariantOutcome }`; a fixture `{ iNumber: 'I1', run: (v) => fail('I1', [], String(v.tick), 'ok') }`; `I_CHECK_TO_INV['I1']` contains `INV-LED-002` and `INV-LED-007`; `QTY_ONLY_CODES` is the array `INV_LED_007` reads; `view.post` is a `TruthStoreRead` for `cbkHolderMirror`; `view.touchedAccounts()` feeds the incremental I5/I6/I7 scans; `view.facts.get('INTRADAY_CREDIT_LIMIT')` typechecks for I9/I10. Mutant: drop `facts`, `touchedAccounts`, `I_CHECK_TO_INV` or `QTY_ONLY_CODES` → the fixture fails to compile; change `LedgerCheckView`'s `post` to `Accounts` → the `TruthStoreRead` argument fails.

**`AC-03-05R-GETCATALOG` — it stays absent, and the replacement is named.** `test/er79-shape.test.ts` (b) is the gate and is **not edited**: it scans every `packages/engine/**/*.ts` for `export function|const getCatalog|buildCatalog` and asserts `readonly catalog: ReasonCatalog` in `world.ts`; the new test file imports no `getCatalog` and builds no catalog function. The replacement is the R11 line: `LedgerWorld.catalog` for real code, `new ReasonCatalog()` only in a test. Mutant: add `export const getCatalog = …` to any engine source → `er79-shape.test.ts` (b) red.

**`AC-03-05R-INTACT` — the merged ledger suite does not move.** `packages/engine/ledger` `npm run typecheck`, `npm run lint` and `npm run test` all green with **no edit** to `test/erasure.test.ts`, `test/invariants.test.ts`, `test/invariants-holds.test.ts`, `test/sysside.test.ts` or `test/review-pr3.test.ts`, and the 24 shipped `Check`s still in `TICK_INVARIANTS`/`SYS_INVARIANTS` unchanged. Mutant: add a required member to `CheckView`, a required second parameter to `Check`, or change `INV_BS_011`'s annotation → those tests stop compiling/running. This is the assertion behind R1: the 24 shipped checks are not re-typed.

**`AC-03-05R-ER79-SHAPE` — E-79 part 1.** `test/er79-shape.test.ts` (a)-(d) stays green unedited: `packages/engine/ledger/` holds exactly `data`, `scripts`, `src`, `test`; no `state/`; no `schema.ts`; no `getCatalog`/`buildCatalog`; `HoldApi` only in `world.ts`; `RailState` only in `templates.ts`. This card adds no directory and no catalog function. Mutant: create `packages/engine/ledger/state/view.ts` → (a) red; add a `getCatalog` → (b) red. The type-only `LedgerInvariant` clause is (e) and is covered by AC-03-05R-ER804; the `scope: 'TICK'` literal is (f) and is covered by R9.

**`AC-03-05R-ER804` — E-80.4.** Two existing tests are the gate and both stay green unedited: `test/erasure.test.ts` throws `CORE_MODULE_WAS_EVALUATED` if the core module is ever evaluated, and `test/er79-shape.test.ts` (e) requires the `import type { … } from '@tycoon/engine-core/invariants'` line, forbids a value import from any core specifier, and forbids `function toInvariantImpl` / `as InvariantImpl`. The new test file contains **no `PhaseCtx`** and no `@tycoon/engine-core/module/ctx` import. Mutant: add `import type { PhaseCtx } from '@tycoon/engine-core/module/ctx'` → the isolated ledger typecheck cannot resolve `@tycoon/params` and fails; add a value import from core → `erasure.test.ts` red. The `scope: 'TICK'` literal stays (R9), so (f) stays green.

**`AC-03-05R-ER81` — E-81.** No catalog row is added, `CATALOG_SEED` is unchanged, `SPEC_COUNTS_03` is unchanged, and the live histogram derived from `CATALOG_SEED` is unchanged: the existing `AC-03-ER81-COUNTS` in `catalog.test.ts` stays green. `QTY_ONLY_CODES` is a rule list, not a catalog source; `EQ_SPLIT` stays owner `06`, `LED_DISSOLUTION` owner `03`, and neither row is edited. Mutant: add `LED_RECLASS` to `QTY_ONLY_CODES` → the QTY semantic rejection half red; add a seed row → the live-total/§3.4-origin assertion red.

## Done when

- [ ] The six symbols exist exactly as exported above, in the flat tree, in `src/invariants.ts` and `src/catalog.ts`, with no new subdirectory (E-79 part 1).
- [ ] `QTY_ONLY_CODES` is declared once, in `catalog.ts`; `invariants.ts:48` is gone and `:353` reads the import; the I1 rule is unchanged for every other code.
- [ ] `LedgerCheckView` and `CheckView` are two distinct, non-interchangeable shapes; `Check`/`CheckView`/`INV_BS_011`/`TICK_INVARIANTS`/`SYS_INVARIANTS` are unmodified; the 24 shipped checks are untouched (R1).
- [ ] `ledgerView(ctx, catalog)` matches the fixture view, carries `holds` and `facts`, and memoizes by (ctx, catalog); `fail`, `LEDGER_INV_BASE`, `I_CHECK_TO_INV` are exactly as specified.
- [ ] `getCatalog`/`buildCatalog` stay absent; `er79-shape.test.ts` (a)-(d) green unedited, and (e)/(f) green under AC-03-05R-ER804/R9; the three stale import lines are recorded as `LedgerWorld.catalog` in the R11 table (the consumer cards are not edited here).
- [ ] `test/invariant-view.test.ts` carries every AC above; the six export mutants and M1-M10 of the view are run as mutations and their red output is in the PR body; the QTY single-declaration AC is red at the head and green after step 2.
- [ ] `packages/engine/ledger`: `npm run typecheck`, `npm run lint`, `npm run test` — output pasted in the PR body; `test/erasure.test.ts` green and unedited.
- [ ] **T03-05 is not ticked by this card.** It stays unticked until this card merges; then whoever merges ticks T03-05, because this card is the half of it that was missing.
