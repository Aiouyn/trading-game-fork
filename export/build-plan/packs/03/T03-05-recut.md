# GLOBAL CONTEXT (included at the top of every task pack)

You are implementing one task of **TYCOON**, a persistent multiplayer financial game. The full design is a 3 MB specification; you only receive the parts your task needs. This global context is binding on every task. If anything in your task pack seems to contradict this file, this file wins for code shape (names, packages, APIs) and the spec excerpts win for game rules and numbers.

## G1. How to work

1. Read the whole pack before writing code: this context, the task card, the spec excerpts, the upstream exports, the parameters, the decisions and the acceptance tests.
2. Create exactly the files the card lists (you may add small private helper files inside the same folder; list them in your report). Never edit files owned by another task except where the card says "edit".
3. Use only the upstream exports the pack shows. If you need something that is not exported, stop and report "MISSING EXPORT: <task> <symbol>" instead of inventing it.
4. Every spec rule in your excerpts must be implemented as written. Never simplify a formula, skip a branch, or leave a TODO that changes behaviour. Where the spec says DEFAULT, use that default.
5. Every acceptance test assigned to the task becomes at least one automated test whose name starts with its id, e.g. `it('05#8 market buy of q ADV moves price by s + Y σ_d √(q/D)', …)`.
6. Finish with: `pnpm -w lint && pnpm -w typecheck && pnpm -w test --filter <your package>` all green. Then write the short report described in G12.

## G2. Repository layout (monorepo root = repository root)

pnpm workspaces + Turborepo. Package scope `@tycoon/*`.

```
apps/web        Next.js 16 App Router client (read node_modules/next/dist/docs/ before writing Next code;
                Next 16: proxy.ts not middleware.ts, async params/cookies, Turbopack default)
apps/gateway    WebSocket gateway (uWebSockets.js)       apps/world      world host: coordinator + partitions
apps/projector  event consumers -> read models           apps/jobs       BullMQ jobs
apps/admin      admin console (Next.js 16)               apps/harness    Truth Machine runners (20)
apps/native     Capacitor shell
packages/engine/core        02 time engine, store, rng, dmath, fixed, ids, canon, testing
packages/engine/ledger      03     packages/engine/macro       04     packages/engine/markets   05
packages/engine/assets      06 (equity, etf, bond, fx, commodity, crypto, defi, derivatives, collectibles)
packages/engine/banking     07     packages/engine/funds       08     packages/engine/business  09
packages/engine/realestate  10     packages/engine/lab         11     packages/engine/conflict  12
packages/engine/law         13     packages/engine/progression 14     packages/engine/social    15
packages/engine/world       16     packages/engine/index.ts    PartitionEngine factory
packages/protocol (zod schemas, canonical encoder)   packages/content (22 catalogs)   packages/params (23)
packages/platform (db, bus, auth, telemetry; NOT deterministic)   packages/ui (17)   packages/i18n (en, fr)
packages/sdk   packages/config (tsconfig, eslint incl. determinism rules, tailwind, vitest presets)
infra/  tests/ (Playwright e2e, protocol contract tests)  docs/
```

Each engine module folder contains: `schema.ts` (entity types + table defs), `rules/*.ts` (pure functions), `intents.ts`, `events.ts`, `phases.ts`, `invariants.ts`, `views.ts`, `params.ts`, `index.ts` (exports the `ModuleDef`), and tests next to the code as `*.test.ts`.

Import rules (CI-enforced): engine modules import only `@tycoon/engine/core`, the engine modules they hard-depend on, `@tycoon/params`, `@tycoon/content`, and types from `@tycoon/protocol`. The engine never imports `platform`, `ui`, Node built-ins, network, filesystem or clocks.

Toolchain: TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Node 24 LTS, Vitest (+ fast-check for property tests), zod 4, Playwright, Tailwind 4, Zustand 5, TanStack Query, next-intl, Drizzle + PostgreSQL 18, Valkey 8, NATS JetStream, ClickHouse, BullMQ, Better Auth, OpenTelemetry, three.js (city), TradingView Lightweight Charts 5.

## G3. Units and conventions (00 §3)

| Quantity | Type | Rule |
|---|---|---|
| Money | `Money = bigint` micro-units (1e-6) of a currency, always with a `Ccy` | display `$12.4k`, `$3.21M`, `$1.05B`, `$4.2T` |
| Currency | `Ccy = 'FDL' \| 'EUN' \| 'PYN' \| 'NKR' \| 'SRL'` | FDL is the reserve currency |
| Price | `Price = bigint` micro-units per unit of asset | |
| Quantity | `Qty = bigint` in the asset's base lot | each asset has `lotSize`, `qtyDecimals` |
| Rates | `number` (float64) in model math; persisted as integer `rateE6` (1e-6) when they enter the ledger | |
| Probability | `number` in [0,1] | |
| Time | `Tick = number` (integer since genesis) | |
| Compute | integer PFLOP-days × 1000 | display GPUh (1 PFLOP-day = 10 GPUh) |
| Energy | integer kWh. Data: DQU float, persisted ×1000 integer | |

- All model math in float64; conversion to integers only at the ledger boundary with round-half-to-even through `toMoney(x, ccy)` / `toQty` / `toPrice`. No other code converts floats to money.
- Money crossing the protocol is a decimal string.
- IDs: `<kind>_<26 chars>` generated only by `ctx.newId(kind)` (deterministic). Authored ids like `ast_EQ_HALC` come from content.
- Parameters: `PARAM.snake_case` keys live in `@tycoon/params`; code reads them with `ctx.params.num('key')`, `ctx.params.money('key', ccy)` etc. Never hard-code a number that has a PARAM key. Param defaults in the registry are in display units: money in dollars (convert with `toMoney`), `%` as fractions, "game days" × 720 = ticks, "real days" × 17,280 = ticks.
- Notation: `σ(x)=1/(1+e^-x)`, `clamp`, `ln`, `dt = 1/262080` (one tick in game years).

## G4. Time (00 §5.1)

5 real seconds per tick; 720 ticks per game day (= 1 real hour); 30 ticks per game hour; one tick = 2 game minutes. Week = 7 game days (Mon–Fri trading, Sat–Sun weekend). Quarter = 13 weeks = 91 game days, months 28/28/35 days. Year = 364 game days = 262,080 ticks. Chapter = 8 real weeks = 1,344 game days. Real day = 24 game days.
Trading day tick-of-day `t`: pre-market 0–59; opening auction t=60; continuous 61–539; closing auction t=540; after-hours 541–719. Accruals (interest, rent, wages, fees) post at day close t=719. Business operations run once per game hour, staggered: an entity runs when `tickOfDay mod 30 == fnv1a32(id) mod 30`.

## G5. Tick pipeline (00 §5.2)

```
P0 ingest  P1 validate  P2 calendar  P3 world(16)  P4 npc(05,16)  P5 ai(11)  P6 match(05,06)
P7 clear(07)  P8 finance(07,08)  P9 real(09,10)  P10 conflict(12)  P11 law(13)  P12 social(14,15)
P13 ledger(03: commit postings atomically, settle/release holds, assert invariants)  P14 emit
```
A phase may read any committed state and the outputs of earlier phases of this tick; it writes only its own module's tables and queues postings for P13. Postings never commit before P13. A failed invariant rolls the tick back and replays it in safe mode. Consequences of tick N that other modules react to land in tick N+1 (via `ctx.send(..., 'NEXT')` or events).

## G6. The engine module contract (binding names; owned by tasks of unit 02)

```ts
// @tycoon/engine/core — primitives
export type Tick = number; export type Money = bigint; export type Qty = bigint; export type Price = bigint;
export type Ccy = 'FDL' | 'EUN' | 'PYN' | 'NKR' | 'SRL'; export type Id = string;
export type PhaseId = 'P0'|'P1'|'P2'|'P3'|'P4'|'P5'|'P6'|'P7'|'P8'|'P9'|'P10'|'P11'|'P12'|'P13'|'P14';
export type Visibility = 'PUBLIC' | 'PARTIES' | 'PRIVATE' | 'SEALED';
export type Boundary = 'HOUR' | 'DAY_OPEN' | 'DAY_CLOSE' | 'WEEK_CLOSE' | 'MONTH_CLOSE' | 'QUARTER_CLOSE' | 'YEAR_CLOSE' | 'CHAPTER_CLOSE'
  | 'WEEK_OPEN' | 'MONTH_OPEN' | 'QUARTER_OPEN' | 'YEAR_OPEN' | 'CHAPTER_OPEN' | 'PHASE_CHANGE';   // E-51 (T02-05, PR #20): *_OPEN at tickOfDay 0 of the period's first day; PHASE_CHANGE at tickOfDay ∈ {0, 60, 61, 540, 541}. Hook order: OPEN outermost first (CHAPTER→YEAR→QUARTER→MONTH→WEEK→DAY), then HOUR and PHASE_CHANGE, then CLOSE innermost first (DAY→…→CHAPTER).
export class SortedMap<K extends string, V> { get(k): V|undefined; set(k, v): SortedMap<K,V>; delete(k); has(k); size; entries(): Iterable<[K,V]> /* byte order of key */; keys(); values(); }
export class SortedSet<K extends string> { /* same ordering */ }
export function cmpStr(a: string, b: string): -1|0|1;            // UTF-16 code-unit byte order
export function sortBy<T>(arr: readonly T[], key: (t: T) => (string|number|bigint)[]): T[]; // stable, total
export * as dmath from './dmath';   // exp, ln, log2, log10, pow, sin, cos, atan, atan2, tanh, sigmoid, erf, erfc,
                                    // normCdf, normInv, lgamma, expm1, log1p, kahanSum, clamp, lerp,
                                    // bsPrice, bsGreeks, solveBisection(f,a,b,iters), newton(f,df,x0,iters), cholesky
export function roundHalfEven(x: number): number;
export function toMoney(x: number, ccy: Ccy): Money; export function toQty(x: number, lotScale: bigint, mode?: 'HALF_EVEN'|'LOT_FLOOR'): Qty;
export function toPrice(x: number): Price; export function fromMoney(m: Money): number;
export function divRoundHalfEven(n: bigint, d: bigint): bigint; export function mulRate(m: Money, rateE6: bigint): Money;
export function mulRateE12(m: Money, rateE12: bigint): Money; export function accrue(m: Money, annualRateE6: bigint, days: number): Money;
export function notional(qty: Qty, price: Price, lotScale: bigint): Money; export function fxConvert(m: Money, rateE6: bigint): Money;
export function allocate(total: bigint, weights: readonly { id: string; w: bigint }[]): Map<string, bigint>; // largest remainder, parts sum exactly
export function proRata(total: bigint, holdings: SortedMap<string, bigint>): SortedMap<string, bigint>;
export function assertFinite(x: number, ctx: string): number; export function safeDiv(a: number, b: number, fallback: number): number;
export function sha256(bytes: Uint8Array): Uint8Array; export function fnv1a32(s: string): number;
export function canonEncode(v: unknown): Uint8Array;  // canonical encoder (from @tycoon/protocol, re-exported)
export function ticksToGameDate(t: Tick): GameDate; export function calendarOf(t: Tick): CalendarInfo;

export interface Rng {            // one deterministic stream; keys '<module>.<purpose>[:<subjectId>]' (02 §3.10.4)
  next(): number; u53(): number; uOpen(): number; int(n: number): number; bernoulli(p: number): boolean;
  normal(): number; studentT(nu: number): number; exponential(lambda: number): number; poisson(lambda: number): number;
  kouJump(pUp: number, etaUp: number, etaDown: number): number;
  categorical<T extends string>(weights: readonly [T, number][]): T; shuffle<T>(a: T[]): T[];
}

export interface CalendarInfo { tick: Tick; tickOfDay: number; gameDay: number; weekday: 0|1|2|3|4|5|6; isTradingDay: boolean;
  gameHour: number; boundaries: ReadonlySet<Boundary>; quarter: number; year: number; chapter: number; }

export interface TableDef<T> { name: string /* '<module>.<table>' e.g. 'mkt.order' */; module: string; idOf(e: T): Id; schema?: unknown }

export interface StoreRead {
  get<T>(table: string, id: Id): T | undefined;
  iter<T>(table: string): Iterable<T>;                       // sorted by id (byte order)
  range<T>(table: string, fromId: Id, toId: Id): Iterable<T>;
  index<T>(table: string, indexName: string, key: string): Iterable<T>; // secondary index declared in TableDef, sorted by id
  count(table: string): number;
}
export interface Store extends StoreRead {                    // writes check ownership: OwnershipViolation if table.module !== caller
  put<T>(table: string, entity: T): void;                    // records undo entry; normalizes -0; rejects NaN/Infinity
  del(table: string, id: Id): void;
}

export interface EngineEvent { tick: Tick; seq: number; kind: string; subjectIds: Id[]; payload: unknown; visibility: Visibility }
export interface PhaseMessage { fromEntity: Id; toEntity: Id; phase: PhaseId; tick: Tick; kind: string; body: unknown; canonicalKey: string }

export interface PhaseCtx {
  readonly tick: Tick; readonly phase: PhaseId; readonly cal: CalendarInfo; readonly header: TickHeader;
  readonly module: string; readonly safeMode: boolean;
  readonly store: Store;
  rng(key: string): Rng;                                     // only the module's own registered streams
  newId(kind: string): Id;
  readonly params: ParamsView;                                // from @tycoon/params
  readonly content: ContentView;                              // from @tycoon/content
  readonly ledger: LedgerApi;                                 // from 03 (see G7); throws if 03 not loaded
  readonly holds: HoldApi;                                    // from 03 (see G7)
  emit(kind: string, subjectIds: Id[], payload: unknown, visibility: Visibility): void;
  send(toEntity: Id, kind: string, body: unknown, when: 'B1' | 'B2' | 'B3' | 'NEXT'): void;
  inbox(kind?: string): readonly PhaseMessage[];              // messages delivered to this phase, sorted by canonicalKey
  delta(recipient: Id | `pub:${string}`, channel: string, ops: unknown[]): void;  // client deltas (P14 flush)
  fail(invariantId: string, entityIds: Id[], observed: string, expected: string): void; // never throw for control flow
}
export interface ValidateCtx extends Omit<PhaseCtx, 'emit' | 'send' | 'delta'> {}   // P1: read state, place holds

export interface SealedIntent<P = unknown> { intentId: Id; actorId: Id; onBehalfOf?: Id; mandateId?: Id; kind: string;
  payload: P; channel: 'UI'|'API'|'AI'|'MANAGER'|'SYSTEM'; orderKey: string; tick: Tick }
export interface Reject { code: string /* '<MOD>_<REASON>' e.g. 'MKT_INSUFFICIENT_FUNDS' */; params?: Record<string, string> }
export interface IntentHandler<P = unknown> {
  kind: string;                       // namespaced: mkt.*, bank.*, fund.*, biz.*, prop.*, lab.*, ops.*, law.*, soc.*, life.*, acct.*
  schema: import('zod').ZodType<P>;   // registered in @tycoon/protocol too
  applyPhase: PhaseId;                // phase in which apply() runs (P1 if immediate)
  validate(ctx: ValidateCtx, i: SealedIntent<P>): Reject | null;   // P1, in fair order; place holds here
  apply(ctx: PhaseCtx, i: SealedIntent<P>): Reject | null;          // effect; may still reject (PARTIAL/REJECTED)
}
export interface InvariantImpl { def: InvariantDef /* 20 §2.1 */; check(ctx: InvariantCtx): { ok: true } | { ok: false; entityIds: Id[]; observed: string; expected: string } }
export interface ViewHandler<A = unknown, R = unknown> { id: string; schema: import('zod').ZodType<A>; run(store: StoreRead, args: A, viewer: ViewerContext): R }

export interface ModuleDef {
  id: string;                         // build unit id, e.g. '05', '06A'; module number = first two chars
  module: string;                     // '05'
  dependsOn: string[];                // unit ids (hard edges, 19 §12.2)
  tables: TableDef<any>[];            // tables this module owns (only it may write them)
  streams: string[];                  // RNG stream key prefixes it owns, e.g. ['mkt.factor', 'mkt.idio']
  phases: Partial<Record<PhaseId, (ctx: PhaseCtx) => void>>;
  boundaries?: Partial<Record<Boundary, (ctx: PhaseCtx) => void>>; // run in P2 when the boundary is in cal.boundaries
  intents: IntentHandler<any>[];
  events: Record<string, import('zod').ZodType>;   // event kind -> payload schema
  invariants: InvariantImpl[];
  views: ViewHandler<any, any>[];
  genesis?(ctx: PhaseCtx): void;     // creates the module's initial world state from content at world creation
}
export function defineModule(m: ModuleDef): ModuleDef;

// testing (the main tool of every task's tests): @tycoon/engine/core/testing
export interface TestWorld {
  readonly store: StoreRead; readonly tick: Tick;
  submit(actorId: Id, kind: string, payload: unknown, opts?: Partial<SealedIntent>): Id;  // queued for next step
  step(): TickOutcome;                 // runs one full tick P0..P14
  runTicks(n: number): TickOutcome[]; runUntil(pred: (w: TestWorld) => boolean, maxTicks: number): TickOutcome[];
  runToTickOfDay(t: number): void; runGameDays(d: number): void;
  events(filter?: { kind?: string; since?: Tick }): EngineEvent[];
  postings(filter?: { reason?: string; entityId?: Id; since?: Tick }): Posting[];
  intentResult(intentId: Id): IntentResult | undefined;
  balance(entityId: Id, code: number, ccy: Ccy, sub?: string): Money;
  view<R>(viewId: string, args: unknown, viewer?: Id): R;
  setParam(key: string, value: unknown): void;     // test-only override
  stateHash(): string; snapshot(): Uint8Array; 
  spawnCharacter(opts?: { cash?: Money; license?: string; rank?: string; city?: string }): Id; // available once 14.A is built
  asSystem<T>(fn: (ctx: PhaseCtx) => T): T;       // test-only direct state setup (bypasses ownership; never in prod)
}
export interface TickOutcome { tick: Tick; committed: boolean; safeMode: boolean; failedInvariants: string[]; stateHash: string }
export function createTestWorld(opts: { modules: ModuleDef[]; seed?: string; partitions?: number; params?: Record<string, unknown>;
  content?: 'full' | 'minimal' | ContentOverrides; startTick?: Tick }): TestWorld;
```

### G6.1 Ports for later modules (dependency inversion)

A module may never import a module built after it. When its rules need data from a later module (for example 05 needs fundamental values from 09 or index weights from 08), it declares a **port**: a TypeScript interface in its own `ports.ts` (e.g. `MarketPorts`), and its factory takes the implementations: `createMarketsModule(ports: Partial<MarketPorts>)`. The later module exports an implementation of that port, and `packages/engine/index.ts` wires them when building the world. A missing port uses the default the spec gives for "module not present" (stated in the card), never an invented rule.

## G7. Ledger and holds API (binding names; owned by tasks of unit 03)

All money and asset quantities move only through these template functions (03 §3.3.3). Each validates cheaply, queues one balanced `Entry` for P13 and returns its `entryId`. Codes come from 03's reason-code catalog (each code has exactly one class: FAUCET, SINK, TRANSFER, CREDIT_CREATE, CREDIT_DESTROY, REVALUE; a code may only use its allowed templates).

```ts
export interface PostOpts { refs?: Id[]; holdId?: Id; valueLegA?: number; valueLegB?: number; sub?: string; memo?: string }
export interface LedgerApi {
  pay(from: Id, to: Id, amt: Money, ccy: Ccy, code: string, o?: PostOpts): Id;                 // TRANSFER
  swapAsset(buyer: Id, seller: Id, assetId: Id, qty: Qty, amt: Money, ccy: Ccy, code: string, o?: PostOpts): Id;
  mint(to: Id, amt: Money, ccy: Ccy, code: string, o?: PostOpts): Id;                          // FAUCET, no elastic sector
  burn(from: Id, amt: Money, ccy: Ccy, code: string, o?: PostOpts): Id;                        // SINK
  elasticIn(sector: Id, to: Id, amt: Money, ccy: Ccy, code: string, o?: PostOpts): Id;          // FAUCET from hh/frm/row
  elasticOut(from: Id, sector: Id, amt: Money, ccy: Ccy, code: string, o?: PostOpts): Id;       // SINK to hh/frm/row
  lend(bank: Id, borrower: Id, amt: Money, ccy: Ccy, code: string, loanId: Id, o?: PostOpts): Id;   // CREDIT_CREATE
  repay(borrower: Id, bank: Id, principal: Money, ccy: Ccy, code: string, loanId: Id, o?: PostOpts): Id; // CREDIT_DESTROY
  cbCredit(cb: Id, bank: Id, amt: Money, ccy: Ccy, code: string, o?: PostOpts): Id;
  cbCreditUnwind(bank: Id, cb: Id, amt: Money, ccy: Ccy, code: string, o?: PostOpts): Id;
  accrue(e: Id, amt: Money, ccy: Ccy, code: string, drAcct: number, crAcct: number, o?: PostOpts): Id; // REVALUE, one entity
  accruePair(a: Id, b: Id, amt: Money, ccy: Ccy, code: string, o?: PostOpts): Id;
  fx(a: Id, b: Id, ccy1: Ccy, amt1: Money, ccy2: Ccy, amt2: Money, code: string, o?: PostOpts): Id;
  moveQty(from: Id, to: Id, assetId: Id, qty: Qty, bookValue: Money, ccy: Ccy, code: string, o?: PostOpts): Id;
  reclass(e: Id, amt: Money, ccy: Ccy, code: string, fromAcct: number, toAcct: number, o?: PostOpts): Id;
  // reads (committed state + this tick's queued entries are NOT included unless stated)
  balance(accountKey: string): Money; cash(entityId: Id, ccy: Ccy): Money; available(entityId: Id, ccy: Ccy): Money; // cash − active holds
  position(entityId: Id, assetId: Id): Qty; availableQty(entityId: Id, assetId: Id): Qty;
  netWorth(entityId: Id): Money;   // marked, in reporting currency (03 §3.10)
}
export interface HoldApi {
  placeCash(owner: Id, ccy: Ccy, amt: Money, expiresTick: Tick, ref: Id): Id | Reject;   // Reject {code:'LED_INSUFFICIENT_FUNDS'}
  placeQty(owner: Id, assetId: Id, qty: Qty, expiresTick: Tick, ref: Id): Id | Reject;
  release(holdId: Id): void; reduce(holdId: Id, byAmount: bigint): void; get(holdId: Id): Hold | undefined;
}
```
Entity kinds (00 §5.3): `chr cmp biz prop fnd bnk ins spv gov cbk ccp exc rat reg crt npc hh frm row ali sys`. Every entity has one balance sheet (registered with 03 via `registerEntity(ctx, {id, kind, reportingCcy, ownerId, homeCity?})`, exported by 03).

## G8. Determinism rules (02 §3.7, 19 Rule 3.6.2) — lint-enforced in packages/engine

Forbidden in engine code: `Date`, `performance`, `Math.random`, `crypto` randomness, timers, `process`, `globalThis`, `Intl`, `toLocaleString`, `localeCompare`, `async/await`/Promises, `for…in`, iterating `Object.keys/values/entries` of map-like objects, `Map`/`Set` iteration where order matters (use `SortedMap`/`SortedSet`), `Array.sort` without a total comparator (use `sortBy`), `JSON.stringify` for hashing/persistence (use `canonEncode`), `WeakMap/WeakRef`, `Math.exp/log/pow/sin/cos/tan/atan2/cbrt/hypot/...` (use `dmath`), `Math.round` (use `roundHalfEven`), `Number` for money or quantities. Allowed raw math: `+ - * /`, `Math.sqrt/abs/floor/ceil/trunc/min/max/sign/fround/imul/clz32`.
NaN/Infinity are illegal in state. Ties are broken by entity id then intent id. Iterate collections only in sorted order. Rejection sampling is forbidden; each variate uses a fixed number of draws. A module may draw only from its own streams. Split money into parts only with `allocate`. No exceptions for control flow: report impossible states with `ctx.fail`.

## G9. Events, intents, rates

- Event kinds are namespaced like intents (`mkt.fill`, `acct.rank.up`); every kind has a zod payload schema in the module's `events.ts` and is registered in `@tycoon/protocol`. Visibility per 00 §5.6; SEALED = court evidence only.
- Intent results: `ACCEPTED | REJECTED | PARTIAL | QUEUED_NEXT` with stable reject codes `<MOD>_<REASON>` (localized via i18n keys `err.<code>`).
- Rate limits: 20 intents per tick per character + 20 per operator, ≤ 100 combined (enforced by 19/02 intake, not by modules). AI: 2,000 DU per tick per player.
- Fairness: humans, player AIs and delegated managers use the same intents. No private API.
- L11 privacy: nothing automatically reveals a player's holdings, strategy or style. Disclosure only by opt-in, legal filing rule, or in-game espionage.

## G10. Locked decisions (never change)

L1 one persistent world, invisible partitions. L2 breach floor 1%. L3 hidden sessions accumulate progress (ceiling 0.85). L4 visual direction Ink & Brass (+ Shadow palette for Lab/Security). L5 16+, no gambling mechanics. L6 fully fictional brands, cities, currencies. L7 monetization cosmetic only, never money/rank/odds, no loot boxes. L8 English first, French second, string keys from day one (no raw UI text). L9 1 real hour = 1 game day. L10 derivatives, IPOs, takeovers gated behind late licenses; player tokens later (flag off); no prediction markets, no vice businesses. L11 no automatic leaks. L12 rewarded ads $250 each, max 10/day, only under $1,000 NW. L13 approved features (player IPOs, funds, honeypots, AI tournament, rival funds, world events, rumors, bankruptcy comeback, trade journal, "Why it moved", company building). L14 rebuilt from scratch. L15 full ambition, nothing cut.
Spec precedence when two texts disagree: 24 Decisions register > the owning module > 23 Parameter registry > other text. 22 catalogs win on content names and counts.
Conflict/cyber content is purely game-mechanical (named verbs, probabilities, budgets, cooldowns). Never implement or describe real-world attack techniques.

## G11. Shared enums (00 §5.8)

Ranks `R0 Broke, R1 Hustler, R2 Owner, R3 Mogul, R4 Tycoon, R5 Titan, R6 Dynasty`. Licenses `LIC0 Cash, LIC1 Retail, LIC2 Pro, LIC3 Derivatives, LIC4 Institutional`; charters `CH_BANK, CH_FUND, CH_INSURER, CH_EXCHANGE_MEMBER, CH_CUSTODIAN`. AI tiers `T0 … T5`. Business tiers `B1 … B6`. Property tiers `working, mid, prime, trophy`. Severity `S1 … S6`. World: 5 blocs (Federal Union FDL, Euran Compact EUN, Pacific League PYN, Nordic Alliance NKR, Southern Coalition SRL), 15 cities (3 per bloc) + Isla Serena (FDL). Player start: $5,000 FDL, LIC0, R0, home city among the 3 FDL cities, 72 real hours protection.

## G12. Your report (end of task)

```
TASK <id> DONE | BLOCKED
files: <list with line counts>
tests: <n passed> / <n>; acceptance tests covered: <ids>
exports: unchanged from card | changed: <diff>   (changing exports requires reviewer approval)
missing exports / spec questions: <list or none>
```


---

# TASK T03-05-recut: The shared invariant-check view - re-cut of T03-05's invariants/types.ts block (LedgerCheckView, ledgerView, fail, LEDGER_INV_BASE, I_CHECK_TO_INV, exported QTY_ONLY_CODES)

Unit 03 · stage S0 · depends on: T03-01, T03-02, T03-08, T20A-01

Files to create:
- `packages/engine/ledger/src/invariants.ts`
- `packages/engine/ledger/src/catalog.ts`
- `packages/engine/ledger/test/invariant-view.test.ts`

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


---

# UPSTREAM EXPORTS (the only APIs you may import besides GLOBAL CONTEXT)

### From T03-01 (Ledger schema, chart of accounts, account keys, authored ids and event schemas)

```ts
// packages/engine/ledger/schema.ts
export type EntityKind = 'sys'|'cbk'|'gov'|'reg'|'crt'|'exc'|'ccp'|'rat'|'bnk'|'ins'|'fnd'|'spv'|'cmp'|'biz'|'prop'|'ali'|'npc'|'hh'|'frm'|'row'|'chr';
export const ENTITY_KIND_ORDER: readonly EntityKind[];          // exactly the 03 §2.1 order (canonical iteration order)
export type BlocCode = Ccy;                                     // bloc ids = currency codes (24 R39)
export type Jurisdiction = BlocCode | 'SERENA';
export type Perimeter = 'PLAYER' | 'NPC' | 'ELASTIC' | 'SYSTEM';
export type EntityStatus = 'ACTIVE' | 'FROZEN' | 'INSOLVENCY_REVIEW' | 'IN_INSOLVENCY' | 'DISSOLVED';
export type PayAccountChoice = { kind: 'CASH' } | { kind: 'BANK'; bankId: Id };
export interface LedgerEntity {                                  // 03 §2.1 Entity + rail defaults (03 §3.3.4)
  id: Id; kind: EntityKind; nameKey: string; ownerId: Id | null; rootOwnerId: Id;
  perimeter: Perimeter; homeBloc: Jurisdiction; homeCity?: string; reportingCcy: Ccy; partitionId: string;
  status: EntityStatus; createdTick: Tick; closedTick?: Tick;
  payFrom: PayAccountChoice; receiveInto: PayAccountChoice;     // DEFAULT { kind: 'CASH' } both
  railChangeTick?: Tick;                                        // acct.payment.setAccounts takes effect from this tick
}
export type AccountClass = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE' | 'MEMO';
export interface Account {                                       // 03 §2.2 verbatim field names
  key: string; entityId: Id; code: number; sub?: string; ccy: Ccy; class: AccountClass;
  balance: Money; qty?: Qty; assetId?: Id; isMoney: boolean; openedTick: Tick;
}
export type FlowClass = 'FAUCET' | 'SINK' | 'TRANSFER' | 'CREDIT_CREATE' | 'CREDIT_DESTROY' | 'REVALUE';
export type CashFlowClass = 'OP' | 'INV' | 'FIN' | 'NC';
export type TemplateId = 'PAY'|'SWAP_ASSET'|'MINT'|'BURN'|'ELASTIC_IN'|'ELASTIC_OUT'|'LEND'|'REPAY'|'CB_CREDIT'|'CB_CREDIT_UNWIND'|'ACCRUE'|'ACCRUE_PAIR'|'FX'|'MOVE_QTY'|'RECLASS';
export interface Posting {                                       // 03 §2.3 verbatim
  tick: Tick; entryId: Id; postingSeq: number; debitAccount: string; creditAccount: string; amount: Money; ccy: Ccy;
  reason: string; refs: Id[]; qty?: Qty; assetId?: Id; legOf?: { legId: string; side: 'A' | 'B' };
}
export interface Entry {
  entryId: Id; tick: Tick; template: TemplateId; reason: string; postings: Posting[];
  requestedBy: { module: string; phase: PhaseId; entityId?: Id; intentId?: Id };
  holdId?: Id;                                                  // hold this entry settles (03 §3.3.2 rule 5)
  headline?: { amount: Money; ccy: Ccy; counterpartyId?: Id };  // the template's main amount and counterparty (for ledger.entry.committed)
  invalid?: { invariantId: string; observed: string; expected: string };  // set by eager validation; P13 fails it
}
export interface Hold {                                          // 02 §3.14.3 hold record, owned by 03
  holdId: Id; owner: Id; kind: 'CASH' | 'QTY'; ccy?: Ccy; assetId?: Id; amount: bigint; remaining: bigint;
  parts: { accountKey: string; amount: bigint; remaining: bigint }[];  // the accounts the rail will use, in draw order (03 §3.3.4 last paragraph)
  expiresTick: Tick; ref: Id; placedTick: Tick; crossPartition: boolean;
  purposeCode?: string;                                         // reason code that will consume it (restricted cash, T03-12)
  status: 'ACTIVE' | 'SETTLED' | 'RELEASED';
}
export interface LedgerFact { id: string /* `${kind}:${subjectId}` */; kind: LedgerFactKind; subjectId: Id; value: unknown; tick: Tick }
export type LedgerFactKind =                                     // facts other modules push into 03 (event edges, 19 Rule 12.4.2)
  | 'POLICY_RATE_E6'          // subject bloc; value number (04)
  | 'FX_MARK_E6'              // subject `${from}>${to}`; value bigint string, units of `to` per `from` (05)
  | 'INTRADAY_CREDIT_LIMIT'   // subject bnkId; value Money string (07)
  | 'OVERDRAFT_LIMIT'         // subject accountKey; value Money string (07)
  | 'BANK_FROZEN'             // subject bnkId; value boolean (07, edge case 2)
  | 'COURT_FREEZE'            // subject entityId; value boolean (13)
  | 'HELD'                    // subject chrId; value boolean (13.A)
  | 'LICENSE'                 // subject chrId; value 'LIC0'..'LIC4' (14.A)
  | 'HOME_IN_BLOC'            // subject `${chrId}:${bloc}`; value boolean (10)
  | 'LAST_ACTIVE_TICK'        // subject chrId; value Tick of last accepted human intent (14.A)
  | 'ACTIVE_DAYS'             // subject chrId; value number[] game-day indexes with an accepted human intent (last 168)
  | 'ACCOUNTING_FIRM_TIER'    // subject entityId; value number tier (09)
  | 'LIFESTYLE_SPEND_4Q'      // subject chrId; value Money string (14)
  | 'TIPS_4Q'                 // subject chrId; value number (16)
  | 'MARKET_STATS'            // subject assetId; value { adv20: string; sigmaDaily: number; listedBloc: BlocCode; product: string; outstanding: string } (05/06)
  | 'BOARD_CONTROL'           // subject `${holderId}:${issuerId}`; value boolean (09 governance)
  | 'SHARE_CLASS'             // subject `${issuerId}:${shareClass}`; value { votesPerShare: number; economicWeight: number; outstanding: string } (09)
  | 'LINKED_ACCOUNTS'         // subject chrId; value Id[] (15 anti-cheat)
  | 'SERENA_PROPERTY'         // subject cmpId; value boolean (10)
  | 'ESCROW_OPEN_TOTAL'       // subject ccy; value Money string: Σ open contract escrow obligations (15, I14)
  | 'SEC_BORROW'              // subject `${entityId}:${assetId}`; value Qty string borrowed under a securities-borrow record (07, I9)
  | 'ELIGIBLE_COLLATERAL'      // subject bnkId; value Money string pledged eligible collateral at the cbk (07; D050 intraday limit default)
  | 'DEPOSIT_INSURED_LIMIT'   // subject bnkId; value Money string insured limit per depositor (07; T03-13 deposits row)
  | 'RESOLUTION_RECOVERY'   // subject bnkId; value fraction recovery announced for uninsured deposits (07)
  | 'HELD_FOR_USE'   // subject propId or asset account key; value boolean property held for own use (10/09; T03-14)
  | 'APPRAISAL_EVENT'   // subject propId or itemId; value { tick, kind } re-appraisal trigger (10/06; T03-14)
  | 'REPLACEMENT_COST'   // subject modelId; value Money string (11; T03-14)
  | 'MODEL_IMPAIRMENT_PCT'   // subject modelId; value fraction (11; T03-14)
  | 'FACILITY_RATE_E6'   // subject ccy; value number standing-facility rate (04; T03-15)
  | 'SPV_EQUITY_TRANCHE'   // subject spvId; value trancheId (08; T03-16)
  | 'FX_CLOSE_E6'   // subject `${from}>${to}`; value bigint string official day-close FX mark (05; T03-17)
  | 'CHALLENGE_BOOK'   // subject entityId; value boolean challenge-event portfolio, never counted (15; T03-17)
  | 'INTRAGROUP_GUARANTEE'   // subject `${guarantor}>${beneficiary}`; value Money string (07/09; T03-18)
  | 'CONCESSION_RESERVE'   // subject operatedId; value Money string mandated reserve of the day (10; T03-18)
  | 'LISTED'   // subject entityId; value boolean (05; T03-19)
  | 'PUBLIC_FUND'   // subject fndId; value boolean (08; T03-19)
  | 'CHARTERED'   // subject entityId; value boolean (13; T03-19)
  | 'EARNINGS_DATE'   // subject `${entityId}:${kind}:${index}`; value Tick (09; T03-19)
  | 'LOAN_MATURITY'   // subject loanId; value Tick (07; T03-19)
  | 'BANK_CAPITAL_RATIO'   // subject bnkId; value number (07; T03-19 KPIs)
  | 'BANK_LCR'   // subject bnkId; value number (07; T03-19 KPIs)
  | 'INS_SOLVENCY_RATIO'   // subject insId; value number (08; T03-19 KPIs)
  | 'FUND_KPIS'   // subject fndId; value { navPerUnit, ret, drawdown, grossLev, netLev } (08; T03-19 KPIs)
  | 'SERENA_ACTIVE_CLAIM'   // subject cmpId; value boolean company claims active Serena status (09; T03-22/T03-23)
  | 'OWNER_OCCUPIED_SINCE'   // subject propId; value Tick or null (10; T03-20)
  | 'ASSESSED_VALUE'   // subject propId; value Money string assessed value for property tax (10; T03-20/T03-21)
  | 'COLLATERAL_OF'   // subject liability key (loanId); value asset account keys pledged (07; T03-25)
  | 'SUBORDINATED_ASSET'   // subject bond assetId; value boolean (06/09; T03-25)
  | 'BIZ_TIER'   // subject bizId; value 'T1'|'T2'|... (09; T03-26)
  | 'FRESH_START_COOLDOWN_UNTIL'   // subject chrId; value Tick (14; T03-26)
  | 'CRIME_COURT_DEBT';   // subject liability key; value 'FINE'|'RESTITUTION'|'JUDGMENT' (13; T03-26)
export const TBL: { entity: 'led.entity'; account: 'led.account'; entry: 'led.entry'; hold: 'led.hold'; fact: 'led.fact' };
export const entityTable: TableDef<LedgerEntity>;   // indexes: byKind (kind), byOwner (ownerId ?? ''), byRoot (rootOwnerId)
export const accountTable: TableDef<Account>;       // indexes: byEntity (entityId), byAsset (assetId ?? ''), byCode (String(code))
export const entryTable: TableDef<Entry>;           // index: byTick (tick zero-padded to 12 digits)
export const holdTable: TableDef<Hold>;             // indexes: byOwner (owner), byExpiry (expiresTick padded), byStatus (status)
export const factTable: TableDef<LedgerFact>;       // index: byKind (kind)
export type ReasonCodeDef = { code: string; cls: FlowClass; owner: number; cf: CashFlowClass; allowedTemplates: TemplateId[];
  taxTag?: TaxTag; stabilizerFamily?: string; descriptionKey: string };      // 03 §2.4 verbatim
export type TaxTag = 'DIV'|'INT'|'RENT'|'ROYALTY'|'BIZ'|'SERVICE'|'OTHER'|'GAIN'|'GAIN_SHORT'|'EXEMPT'|'FINE'|'ILLICIT'|'DONATION'|'HOSTING'|'P2P'|'P2P_IF_RELATED'|'VAT_FINAL'|'TAX';
export type TaxType = 'PERSONAL_INCOME'|'CAPITAL_GAINS'|'CORPORATE'|'PROPERTY'|'VAT'|'SEC_TX'|'STAMP'|'P2P'|'WHT'|'EXIT'|'FRANCHISE';   // 03 §2.9
export type ClaimRank = 'SECURED'|'ADMIN'|'TAX'|'WAGES'|'DEPOSITS_INSURED'|'SENIOR_UNSECURED'|'SUBORDINATED'|'PREFERRED_EQUITY'|'COMMON_EQUITY'; // 03 §2.10, in priority order
export type MarkSource = 'CLEAR'|'CLOSE'|'NAV'|'MODEL_FUND'|'MODEL_CURVE'|'MODEL_OPTION'|'APPRAISAL'|'INDEX'|'COST_LESS_AMORT'|'RECOVERY'|'ZERO';
export interface Mark { assetId: Id; tick: Tick; price: Price; ccy: Ccy; source: MarkSource; confidence: 'LIQUID'|'MODEL'|'APPRAISAL'|'STALE'; validUntilTick: Tick }

// packages/engine/ledger/rules/chart.ts
export interface ChartEntry { code: number; name: string; cls: AccountClass; subMeaning: string | null; isMoney: boolean;
  kinds: readonly EntityKind[] | 'ALL'; qtyBearing: boolean; contra: boolean; mustBeZeroAtP13: boolean; consolidatedOnly: boolean }
export const CHART: SortedMap<string, ChartEntry>;   // key = String(code) zero-padded to 4 digits ('1001')
export function chartEntry(code: number): ChartEntry | undefined;
export function classOfCode(code: number): AccountClass | undefined;     // 1xxx ASSET, 2xxx LIABILITY, 3xxx EQUITY, 4xxx INCOME, 5xxx/6xxx EXPENSE, 9xxx MEMO; contra assets 1309/1839 stay ASSET, 3150 EQUITY
export function isMoneyCode(code: number, kind: EntityKind): boolean;    // 1001, 1002, 1003, 1010 for every kind; 1009 only for hh/frm/row
export function kindMayUse(code: number, kind: EntityKind): boolean;
export const MARKETABLE_CODES: readonly number[];   // 03 §3.3.8: 1500,1510,1520,1530,1540,1541,1542,1560,1600,2600,1210,1870 (1220 OWNED excluded)

// packages/engine/ledger/rules/accountKey.ts
export function accountKey(entityId: Id, code: number, ccy: Ccy, sub?: string): string;  // '<entityId>:<code>[:<sub>]:<ccy>'
export function parseAccountKey(key: string): { entityId: Id; code: number; sub?: string; ccy: Ccy };
export function entityOfKey(key: string): Id;

// packages/engine/ledger/rules/ids.ts
export const SYS_ID: 'sys_SYSTEM';
export function cbkId(ccy: Ccy): Id;                // 'cbk_<CCY>'  (authored ids in 22 must use these; reconciler checks)
export function govId(bloc: BlocCode): Id;          // 'gov_<BLOC>'
export function frmId(bloc: BlocCode): Id;          // 'frm_<BLOC>'
export function hhId(cityId: string): Id;           // 'hh_<cityId>'
export const ROW_ID: 'row_WORLD';
export const CCP_ID: 'ccp_TCH';                     // the Clearing House
export const SERENA_AUTHORITY_GOV: Id;              // = govId('FDL') (03 §3.12.8: FDL treasury collects for the free zone)
export function kindOfId(id: Id): EntityKind | undefined;   // prefix before the first '_'
export function suspenseSub(fromPartition: string, toPartition: string): string;  // `${A}->${B}`

// packages/engine/ledger/events.ts
export const LEDGER_EVENTS: Record<string, import('zod').ZodType>;  // every kind of 03 §5 (list in step 6)
export type LedgerEventKind = keyof typeof LEDGER_EVENTS;
```

### From T03-02 (Reason-code catalog framework, FAUCET (37) and SINK (86) codes)

```ts
// packages/engine/ledger/catalog/types.ts
export type ElasticKind = 'hh' | 'frm' | 'row';
export type LegSpec = number | '@ASSET' | '@' | '-';
export interface ReasonCodeEntry extends ReasonCodeDef {
  descriptionEn: string;              // the spec Description cell, verbatim
  elasticSectors: ElasticKind[];      // non-empty iff allowedTemplates includes ELASTIC_IN or ELASTIC_OUT
  legA: LegSpec; legB: LegSpec;       // default value legs (legend below)
  restrictedOk: boolean;              // 03 §3.5.6
  requestableBy: number[] | 'ALL';    // modules besides `owner` allowed to request it
  illicit: boolean;                   // 03 §3.12.14
  source: '03' | '24§8';              // where the code is defined
}
export type CodeRow = readonly [code: string, owner: number, cf: CashFlowClass, tpl: string, sectors: string, legA: string, legB: string,
  tax: string, fam: string, restrictedOk: 'Y' | '-', alsoBy: string, descriptionEn: string];
export const CLASS_TEMPLATES: Readonly<Record<FlowClass, readonly TemplateId[]>>;
//  FAUCET: MINT, ELASTIC_IN | SINK: BURN, ELASTIC_OUT | TRANSFER: PAY, SWAP_ASSET, FX, MOVE_QTY
//  CREDIT_CREATE: LEND, CB_CREDIT | CREDIT_DESTROY: REPAY, CB_CREDIT_UNWIND | REVALUE: ACCRUE, ACCRUE_PAIR, RECLASS   (03 §3.3.3 last paragraph)
export const ILLICIT_CODES: readonly string[];

// packages/engine/ledger/catalog/registry.ts
export function rowsToEntries(cls: FlowClass, rows: readonly CodeRow[], source?: '03' | '24§8'): ReasonCodeEntry[];
export function validateCodeEntry(e: ReasonCodeEntry): string[];          // [] when valid
export interface ReasonCatalog {
  get(code: string): ReasonCodeEntry | undefined;
  all(): readonly ReasonCodeEntry[];                                      // sorted by code (cmpStr)
  byClass(cls: FlowClass): readonly ReasonCodeEntry[];
  countByClass(): Record<FlowClass, number>;
  templateAllowed(code: string, tpl: TemplateId): boolean;
  mayRequest(code: string, module: number): boolean;
  resolveAlias(name: string): string | undefined;                          // alias data comes from T03-05 (24 §8)
}
export function buildCatalog(parts: readonly (readonly ReasonCodeEntry[])[], aliases?: readonly (readonly [string, string])[]): { catalog: ReasonCatalog; errors: string[] };

// packages/engine/ledger/catalog/faucet.ts
export const FAUCET_ROWS: readonly CodeRow[];   export const FAUCET_CODES: readonly ReasonCodeEntry[];   // 37
// packages/engine/ledger/catalog/sink.ts
export const SINK_ROWS: readonly CodeRow[];     export const SINK_CODES: readonly ReasonCodeEntry[];     // 86
```

### From T03-08 (Ledger runtime state - entity registry (registerEntity), lazy accounts, holds (HoldApi), facts, tick queue and rail state)

```ts
// E-80.4: the ledger imports 20A's invariant types from core and NOTHING ELSE from core, so no signature in this card
// takes `PhaseCtx` — `packages/engine/core/module/ctx.ts:25` defines it and imports `@tycoon/params`, which the ledger's
// isolated CI does not install. Where this card used to pass a `PhaseCtx` it passes the ledger's own runtime handle, and
// every read goes through that handle (`rt.read`) rather than a bare core `StoreRead`.
// packages/engine/ledger/state/runtime.ts
export interface LedgerRuntime {
  own: RuntimeWrite;                  // 03-scoped writer for the current tick: a STRUCTURAL SUBSET of core's `Store` (E-80.4)
  read: RuntimeRead;                  // committed + this tick's 03 writes (same store): a STRUCTURAL SUBSET of core's `StoreRead` (E-80.4)
  tick: Tick; partitionId: string; safeMode: boolean;
  queue: TickQueue;
  catalog: ReasonCatalog;
}
export interface RuntimeWrite { put<T>(table: string, entity: T): void; del(table: string, id: string): void }
export interface RuntimeRead { get<T>(table: string, id: string): T | undefined; iter<T>(table: string): Iterable<T>; count(table: string): number }
// There is no `runtimeOf(ctx: PhaseCtx)`: the handle is built and owned by the ledger's own world/partition and passed in —
// `LedgerWorld.runtime(): LedgerRuntime` on the flat tree; T03-09's `LedgerPartitionImpl` builds the same object per
// (partition, module, phase, tick) with `own` = `store.bind({ module: '03', phase })` and `read` = the partition store.
export const RUNTIME: unique symbol;   // the symbol a partition attaches its runtime under (T03-09)
// packages/engine/ledger/state/entities.ts
export interface RegisterEntitySpec { id: Id; kind?: EntityKind; reportingCcy?: Ccy; ownerId?: Id | null; homeCity?: string;
  homeBloc?: Jurisdiction; nameKey?: string; partitionId?: string; payFrom?: PayAccountChoice; receiveInto?: PayAccountChoice }
export class LedgerWorld {
  /** GLOBAL G7 name; idempotent; returns the id. The registry is the world's method (`world.ts`), the world being what
   *  T03-09 binds to the partition's store. No `PhaseCtx` (E-80.4). */
  registerEntity(spec: RegisterEntitySpec): Id;
}
export function getEntity(rt: LedgerRuntime, id: Id): LedgerEntity | undefined;
export function setEntityStatus(rt: LedgerRuntime, id: Id, status: EntityStatus): void;   // used by 03 insolvency, 13 freeze via facts, 02 ENGINE_REVIEW
export function rootOwnerOf(rt: LedgerRuntime, id: Id): Id;                               // follows ownerId to the end (cycle -> stops at repeat, reported by INV-BS-004)
export function perimeterFor(rt: LedgerRuntime, e: LedgerEntity): Perimeter;               // 03 §3.5.1 (kind sys -> SYSTEM; hh/frm/row -> ELASTIC; root chr/ali -> PLAYER; else NPC)
// packages/engine/ledger/state/accounts.ts
export function getAccount(rt: LedgerRuntime, key: string): Account | undefined;
export function ensureAccount(rt: LedgerRuntime, key: string): Account;                 // lazy open (03 §3.1.2), class from the chart, isMoney by kind
export function committedBalance(rt: LedgerRuntime, key: string): Money;                    // 0n if absent
export function committedQty(rt: LedgerRuntime, key: string): Qty;
export function accountsOfEntity(rt: LedgerRuntime, entityId: Id): readonly Account[];     // index byEntity, sorted by key
export function accountsOfAsset(rt: LedgerRuntime, assetId: Id): readonly Account[];
// packages/engine/ledger/state/holds.ts
export const HOLD_REJECT: { INSUFFICIENT_FUNDS: 'LED_INSUFFICIENT_FUNDS'; INSUFFICIENT_QTY: 'LED_INSUFFICIENT_QTY'; ENTITY_FROZEN: 'LED_ENTITY_FROZEN'; RESTRICTED_FUNDS: 'LED_RESTRICTED_FUNDS'; BAD_EXPIRY: 'LED_BAD_EXPIRY' };
// E-79 point 4: the canonical `HoldApi` is `world.ts`'s and is declared there and nowhere else. It already carries G7's
// members plus `activeHolds` and `placeCashFor`'s optional 7th `crossPartition`, so this card adds no member and no second
// interface — `HoldApiExt` is an ALIAS of it, not an extension.
export type HoldApiExt = HoldApi;
// No `createHoldApiImpl`: the hold API is the world's `apiFor(module, phase).holds`, not a factory over a runtime.
export function activeHoldOn(rt: LedgerRuntime, accountKey: string): bigint;            // Σ remaining of ACTIVE holds' parts on the account
export function expireHolds(holds: SortedMap<Id, Hold>, tick: Tick): Id[];               // P13: the STAGED hold table; status RELEASED for expiresTick < tick; returns ids
export function consumeHold(h: Hold | undefined, e: Entry): void;                        // P13 settlement: the entry's postings reduce the hold's parts
// packages/engine/ledger/state/facts.ts
export function putFact(rt: LedgerRuntime, kind: LedgerFactKind, subjectId: Id, value: unknown): void;   // any module may push; last write in a tick wins
export function getFact<T>(rt: LedgerRuntime, kind: LedgerFactKind, subjectId: Id): T | undefined;
export function factsOfKind(rt: LedgerRuntime, kind: LedgerFactKind): readonly LedgerFact[];
// packages/engine/ledger/state/queue.ts
export class TickQueue {
  constructor(tick: Tick);
  readonly tick: Tick;
  push(e: Entry): void;                       // keeps insertion order (deterministic: phases run in fixed order)
  entries(): readonly Entry[];
  queuedDebit(accountKey: string): Money;     // Σ debits that reduce this money account from entries without a holdId (or beyond their hold)
  clear(): void;
}
// packages/engine/ledger/state/railState.ts
export function railStateFor(rt: LedgerRuntime): RailState;
export function spendable(rt: LedgerRuntime, accountKey: string): Money;   // committedBalance - activeHoldOn - queue.queuedDebit
// packages/engine/ledger/invariants/holds.ts
// Not an `InvariantImpl` over the 20A `InvariantCtx`: T03-05 is not built, and `ledgerView`, `fail` and `LEDGER_INV_BASE`
// are its deliverables, so the check is a pure function of the tree's own staged view — `Check` = `(v: CheckView) =>
// Failure[]` (invariants.ts). T03-05's re-cut wraps this same check as the `LedgerInvariant` without changing it.
export const INV_BS_011: Check;
```

### From T20A-01 (Invariant framework types, launch catalogue and registry)

```ts
// packages/engine/core/truth/types.ts
export type InvariantScope = 'TICK' | 'PHASE' | 'DAY_CLOSE' | 'SNAPSHOT' | 'OFFLINE' | 'STATIC';
export type InvariantSeverity = 'FATAL' | 'QUARANTINE' | 'ALERT';
export type InvariantCostClass = 'O1' | 'O_TOUCHED' | 'O_ENTITIES' | 'O_LOG';
export interface InvariantDef {
  id: string; module: string; scope: InvariantScope; severity: InvariantSeverity;
  phase?: string; description: string; costClass: InvariantCostClass; sampling: 'NEVER'; sinceEngineVersion: string;
}
export interface InvariantResult { checked: number; failed: string[] }
export interface InvariantViolation {
  violationId: string; invariantId: string; tick: number; partitionId: string;
  attempt: 'NORMAL' | 'SAFE_MODE'; entityIds: string[]; observed: string; expected: string;
  culpritIntentIds: string[];
  outcome: 'QUARANTINED' | 'RECOVERED_IN_SAFE_MODE' | 'PARTITION_HALTED' | 'ALERT_ONLY'; caseId: string;
}
/** Structural read view; the engine's StoreRead (02) satisfies it. */
export interface TruthStoreRead {
  get<T>(table: string, id: string): T | undefined;
  iter<T>(table: string): Iterable<T>;
  count(table: string): number;
}
export interface TruthWrite { table: string; id: string; module: string; phase: string; kind: 'PUT' | 'DEL' }
export interface TruthEvent { tick: number; seq: number; kind: string; subjectIds: string[]; payload: unknown; visibility: 'PUBLIC'|'PARTIES'|'PRIVATE'|'SEALED' }
/** Engine-supplied named facts (rng ledger, id log, read stamps, deltas, telemetry, ledger suspense ...). Keys are owned by the supplier. */
export interface TruthFacts { get<T>(key: string): T | undefined }
export interface InvariantCtx<P = unknown> {
  readonly tick: number; readonly phase: string; readonly scope: InvariantScope;
  readonly partitionId: string; readonly safeMode: boolean;
  readonly pre: TruthStoreRead;              // committed state of tick - 1
  readonly post: TruthStoreRead;             // state with this tick's writes applied (not yet committed)
  readonly writeSet: readonly TruthWrite[];  // in write order
  readonly postings: readonly P[];           // postings queued for P13 (typed by 03 as its Posting)
  readonly events: readonly TruthEvent[];    // events of this tick so far
  readonly facts: TruthFacts;
  num(paramKey: string): number;             // parameter read (wired to ctx.params.num by the engine)
}
export type InvariantOutcome = { ok: true } | { ok: false; entityIds: string[]; observed: string; expected: string };
export interface InvariantImpl<P = unknown> { def: InvariantDef; check(ctx: InvariantCtx<P>): InvariantOutcome }
export interface InvariantFailure { def: InvariantDef; entityIds: string[]; observed: string; expected: string }
export interface InvariantRunReport { result: InvariantResult; failures: InvariantFailure[] }

// packages/engine/core/truth/catalogue.ts
export interface CatalogueEntry { id: string; module: string; scope: InvariantScope; severity: InvariantSeverity | 'STATIC'; phase?: string; description: string }
export const LAUNCH_CATALOGUE: readonly CatalogueEntry[];   // every id of 20 §3.1.3–§3.1.8 plus INV-SOC-004 (20 §3.15)
export const INVARIANT_ID_RE: RegExp;                        // /^INV-[A-Z]{2,4}-\d{3}$/
export function catalogueEntry(id: string): CatalogueEntry | undefined;
export function ownerModuleOf(id: string): string;           // from the catalogue; throws for unknown ids

// packages/engine/core/truth/registry.ts
export class InvariantRegistry {
  register(impl: InvariantImpl<any>, registeringModule: string): void;   // throws RegistryError on violation (build-time, not in step())
  registerAll(impls: readonly InvariantImpl<any>[], registeringModule: string): void;
  get(id: string): InvariantImpl<any> | undefined;
  ids(): string[];                                            // sorted by cmp of UTF-16 code units
  forScope(scope: InvariantScope, phase?: string): InvariantImpl<any>[];  // sorted by id
  missingFromCatalogue(modulesBuilt: readonly string[]): string[];       // catalogue ids whose owner module is built but which are not registered
}
export class RegistryError extends Error { readonly code: 'INV_BAD_ID' | 'INV_DUPLICATE' | 'INV_WRONG_OWNER' | 'INV_SAMPLED' | 'INV_SCOPE_MISMATCH' | 'INV_PHASE_MISSING' }
export function createInvariantRegistry(): InvariantRegistry;

// packages/engine/core/truth/runner.ts
export function runInvariants(reg: InvariantRegistry, scope: InvariantScope, ctx: InvariantCtx<any>, phase?: string): InvariantRunReport;
export const INVARIANT_THREW = 'I0.invariant_threw';          // observed prefix when a check throws

// packages/engine/core/truth/index.ts re-exports all of the above.
```


---

# SPEC EXCERPTS (verbatim; binding game rules)

**[03 §1 Purpose]** (context)

## §1 Purpose

The ledger is the game's first law: **every unit of money and every unit of every asset exists on exactly one balance sheet, and moves only by a posting with a reason code**. This module defines:

1. the entity kinds and the balance sheet each one carries;
2. the full chart of accounts;
3. the double-entry posting model, its standard templates (pay, mint, burn, lend, revalue, FX) and the payment rail across settlement cash, bank deposits and partitions;
4. the complete reason-code catalog of the game, each code in exactly one class (FAUCET, SINK, TRANSFER, CREDIT_CREATE, CREDIT_DESTROY, REVALUE);
5. money aggregates (M0, M2, player-economy money and wealth), the faucet and sink inventory with target ratios, the **Stabilizer** PI controller, the **Money Supply Index (MSI)** and the **Net Worth Index (NWI)**;
6. valuation (marking) rules for every asset type, including illiquid ones;
7. consolidation of ownership chains, minority interests and intercompany elimination;
8. taxes in the five blocs and the Isla Serena free zone;
9. financial statements generated for every entity;
10. insolvency and bankruptcy accounting;
11. the invariants asserted every tick.

Design stance: real accounting where it creates gameplay (balance sheets, consolidation, taxes, credit creation, insolvency), simplification only where it would be invisible (no accrual-vs-cash tax timing nuances beyond those listed, no lease accounting standards). The ledger is also the evidence base for courts (13), the explanation base for "Why it moved" (18) and the data base for the Truth Machine (20).

---


<!-- excerpt 03§3.16 -->
**[03 §3.16]** (from spec file 03-LEDGER-AND-ACCOUNTING.md)

### §3.16 Invariants asserted every tick (P13)

"L" = checked by each partition locally in R4; "G" = checked by COORD in R5 (02 §3.15.1). Any failure aborts the tick into safe mode (02 §3.15.3).

| ID | Invariant | Scope |
|---|---|---|
| I0 | no uncaught error, no NaN/Infinity written to state (02 §3.7.2) | L |
| I1 | every posting is well formed: amount > 0, registered reason code, template allowed for the code's class, accounts exist, same currency, quantities on matching assets | L |
| I2 | every entry balances per entity per currency (Σ debits = Σ credits for each entity it touches, including 3800 accounts) | L |
| I3 | global trial balance: for each currency, the sum of all account balances of all entities is 0 | G |
| I4 | money identities of §3.5.3 hold exactly (ΔM0_sys = FAUCET − SINK; ΔM0_cb per CBK codes; ΔM2 reconciliation) | G |
| I5 | `cbk:2001 + 2002 + 2003` equals the sum of all holders' 1001 + 1002 + 1003 balances, per currency | G |
| I6 | for each bank, `Σ 2100` = Σ of holders' 1010 balances at that bank | G |
| I7 | every bilateral instrument (loan, repo, deposit, P2P loan, intercompany balance, derivative) has equal and opposite balances on both sides | G |
| I8 | quantity conservation: for every asset, Σ qty held across all entities (incl. elastic sectors and issuers' treasury) equals outstanding supply (shares outstanding, bond face, token supply, units issued; 1 for each property, business, item); for every derivative series, Σ long = Σ short | G |
| I9 | short positions exist only with a matching securities-borrow record (07) or as derivative positions | L |
| I10 | no settlement cash or deposit balance below 0 (overdrafts are loans, `BNK_OVERDRAFT_DRAW`); bank reserves ≥ −intraday credit limit; at day close reserves ≥ 0 after facility conversion | L |
| I11 | Σ active holds on an account ≤ its committed balance; every expired hold released | L |
| I12 | no collateral lot pledged more than once (Σ encumbrances ≤ qty) | L |
| I13 | interpartition suspense nets to zero for every partition pair and currency | G |
| I14 | Σ escrow held by the CCP (2160) = Σ escrow deposited (1070) = Σ open contract escrow obligations (15) | G |
| I15 | suspense accounts 1999 and 2999 are zero; for every entity, `Σ assets − Σ liabilities = −Σ (equity + income + expense)` | L |
| I16 | all amounts are bigint integers; no money computed from floats except through `toMoney` (enforced statically, spot-checked by tagging) | L |
| I17 | `sys:3990` equals cumulative net FAUCET − SINK since genesis, and `sys:2900` = Σ cbk 1910, per currency | G |
| I18 | today's flow totals by class equal the sum of the day's postings by class (the money report cannot drift from the ledger) | G (day close) |
| I19 | every core entity with marked equity < 0 at day close has status INSOLVENCY_REVIEW or IN_INSOLVENCY (except gov, cbk) | L (day close) |
| I20 | ownership consistency: every entity has one root owner; control is unique; perimeter matches the root; voting shares sum to shares outstanding | G (when ownership changed) |
| I21 | restricted cash is never debited by a forbidden purpose (§3.5.6) | L |
| I22 | tax accounts: Σ liabilities − paid − withheld = 2400/2410/2420 balances per (entity, jurisdiction) | L (day close) |

Cost control: all checks are incremental over the entries of the tick (touched accounts only), except I8 and I20 which are maintained as running sums per asset and per issuer updated by every quantity posting.

---


<!-- excerpt 20§3.1 -->
**[20 §3.1]** (from spec file 20-VERIFICATION-AND-BALANCE.md)

### §3.1 The invariant catalogue

**Rule 3.1.1 (registration).** Every engine module exports `invariants.ts` (19 Rule 3.1.3). Each export is an `InvariantDef` plus a pure check function `check(ctx: InvariantCtx): InvariantOutcome`. `InvariantCtx` gives read access to the tick's pending writes (the store's write set), the queued postings for P13, the pre-tick committed state and the tick's events. Check functions are pure, deterministic and allocation-bounded; they follow the same determinism lint rules as engine code (19 §3.6.2). The ids below are the launch catalogue; modules may add more (new ids, never reused). The owner listed is the module whose rule the invariant protects; 20 owns the framework and the catalogue numbering.

**Rule 3.1.2 (notation).** `Σ` over postings means over all postings queued in this tick for P13. `bal(a, ccy)` is the balance of account `a` in currency `ccy` after the tick's postings are applied. "Holder" means the entity whose balance sheet holds an asset (03).

#### §3.1.3 Ledger and money (owner 03)

| Id | Scope | Severity | Invariant |
|---|---|---|---|
| INV-LED-001 | TICK | FATAL | Double entry: for every `entryId`, Σ debits = Σ credits, per currency. No single-sided posting exists |
| INV-LED-002 | TICK | FATAL | Every posting has a `reason` registered in 03's reason-code table, and that code's class is exactly one of FAUCET, SINK, TRANSFER, CREDIT_CREATE, CREDIT_DESTROY, REVALUE (00 §5.4) |
| INV-LED-003 | TICK | FATAL | Base money: ΔM0(ccy) over the tick = Σ FAUCET amounts(ccy) − Σ SINK amounts(ccy), exactly, in micro-units. No other class changes M0 |
| INV-LED-004 | TICK | FATAL | Broad money: ΔM2(ccy) − ΔM0(ccy) = Σ CREDIT_CREATE(ccy) − Σ CREDIT_DESTROY(ccy) |
| INV-LED-005 | TICK | FATAL | TRANSFER postings move value only between two non-`sys` entities or between a non-`sys` entity and a `sys` clearing account that nets to zero within the same tick |
| INV-LED-006 | TICK | FATAL | REVALUE postings never touch cash or deposit accounts (marks only) |
| INV-LED-007 | TICK | FATAL | Every posting's `amount` > 0 and is an integer number of micro-units; zero and negative postings are rejected (direction is carried by debit/credit) |
| INV-LED-008 | TICK | FATAL | No cash or deposit account is negative unless the holder has an overdraft or credit facility (07) recorded for that account, and the negative balance ≤ the facility limit |
| INV-LED-009 | TICK | FATAL | Postings commit only at P13; no module wrote a balance directly (the store write set contains no balance field changed outside the ledger writer) |
| INV-LED-010 | DAY_CLOSE | FATAL | Trial balance: across all entities, Σ assets − Σ liabilities − Σ equity = 0 per currency (03 chart of accounts) |
| INV-LED-011 | DAY_CLOSE | ALERT | Every FAUCET and SINK reason code's daily total is within its 23 alarm range; `ACCT_REWARDED_AD` (lots tagged `AD_GRANT`) above 0.01% of the day's net mint pages on-call (21 §3.14.9) |
| INV-LED-012 | TICK | FATAL | Conversion rule: every Money value created this tick came through `toMoney` (00 §3.1); detected by the store's provenance tag on Money writes |
| INV-LED-013 | SNAPSHOT | FATAL | Recomputing every balance by folding the postings archive from genesis (or the last verified snapshot) equals the snapshot's balances |
| INV-LED-014 | TICK | FATAL | Restricted-cash lots (14 `RestrictedCashLot`, tags `AD_GRANT`, `FRESH_START`): Σ lot remaining ≤ the holder's cash balance, and no posting for a use the tag forbids (21 §3.14.6, 14) consumed a lot inside its window (FIFO) |

#### §3.1.4 Balance sheets, ownership and collateral (owners 03, 06, 07, 08, 09)

| Id | Scope | Severity | Invariant |
|---|---|---|---|
| INV-BS-001 | TICK | FATAL | Net worth is derived, never stored: any stored NW field is a cache that equals the derivation from the balance sheet at that tick (V3 2.1) |
| INV-BS-002 | TICK | FATAL | A character's equity may go negative only if this tick contains a recorded cause event (liquidation shortfall, judgment, default) referencing that character (V3 Part 8) |
| INV-BS-003 | TICK | FATAL | Units outstanding: for every security, Σ holdings across all holders (including treasury stock and the CCP) = units outstanding recorded by the issuer (06) |
| INV-BS-004 | TICK | FATAL | Ownership chain: every entity has exactly one `ownerId` chain ending at a `chr`, `npc`, `gov` or `sys` (00 §5.3), and the chain has no cycle |
| INV-BS-005 | TICK | FATAL | Equity stakes in any company sum to exactly 100% of issued shares (no over-issuance by contract, 09) |
| INV-BS-006 | TICK | FATAL | Collateral is never double-pledged: each collateral unit (cash, security lot, property, collectible, receivable) has at most one active pledge record across loans, repo, margin, securities lending and contracts (07) |
| INV-BS-007 | TICK | FATAL | Rehypothecation only where permitted: a pledged unit re-used by the secured party appears only under a product type whose 07 rules allow re-use, and the chain length ≤ `PARAM.inv_rehypo_max_chain = 1` |
| INV-BS-008 | TICK | FATAL | Consolidation: intercompany balances eliminate exactly; a group's consolidated NW never exceeds Σ standalone NW of its members minus intercompany equity (03 consolidation, I06) |
| INV-BS-009 | TICK | FATAL | Every property, business and Unique collectible has exactly one holder (10, 09, 14) |
| INV-BS-010 | TICK | FATAL | Escrow: assets in a contract escrow (15) are not counted as available to either party for any other use |
| INV-BS-011 | TICK | FATAL | Holds: for every character, Σ active holds (open orders, pending intents, cross-partition transfers in flight) ≤ available balance before the holds (19 §3.5.3) |
| INV-BS-012 | TICK | FATAL | Cross-partition money: every hold placed for a cross-partition transfer is either settled or released within `PARAM.inv_xpart_settle_max_ticks = 2` ticks (00 §5.7) |

#### §3.1.5 Markets, clearing and finance (owners 05, 06, 07, 08)

| Id | Scope | Severity | Invariant |
|---|---|---|---|
| INV-MKT-001 | PHASE P6 | FATAL | Uniform price: all fills of one asset's batch auction in one tick have the same price (05) |
| INV-MKT-002 | PHASE P6 | FATAL | No self-match: a fill never has the same beneficial owner on both sides (05; linked-account matches are flagged, not blocked, per 15) |
| INV-MKT-003 | PHASE P6 | FATAL | Fill quantity: per asset per tick, Σ buy fills = Σ sell fills; no fill exceeds its order's remaining quantity; limit orders never fill through their limit |
| INV-MKT-004 | PHASE P6 | FATAL | Halted assets produce no fills (05 halts, 21 §3.3) |
| INV-MKT-005 | TICK | FATAL | Every printed price is > the asset's floor and finite; circuit-breaker bounds of 05 hold |
| INV-MKT-006 | PHASE P6 | FATAL | Ordering inside a tick depends only on `orderKey` (19 §3.4.4), never on arrival time or gateway |
| INV-CCP-001 | PHASE P7 | FATAL | Novation: for each cleared trade, the CCP holds equal and opposite positions, and its net position per contract is zero |
| INV-CCP-002 | PHASE P7 | FATAL | Default waterfall order: losses are allocated strictly in 07's layer order (defaulter margin, defaulter fund contribution, CCP capital, mutualized fund, then assessments); no layer is touched while an earlier one has capacity |
| INV-CCP-003 | PHASE P7 | FATAL | Variation margin nets to zero across all members each tick |
| INV-BNK-001 | DAY_CLOSE | FATAL | A bank's reported capital ratio equals the recomputation from its balance sheet; a bank below its minimum is in the 07 resolution state, never "ACTIVE" |
| INV-BNK-002 | TICK | FATAL | Every loan origination posts CREDIT_CREATE equal to the deposit created; every repayment of principal posts CREDIT_DESTROY |
| INV-FND-001 | DAY_CLOSE | FATAL | Fund NAV = (Σ marked assets − Σ liabilities) / units outstanding, within one micro-unit per unit (08) |
| INV-FND-002 | TICK | FATAL | A fund manager can never withdraw investor assets except through 08's fee and redemption rules (ROADMAP M42; property test over 10k random action sequences, §3.4.3) |
| INV-FND-003 | TICK | FATAL | Securitization waterfall: SPV cash distributions follow the tranche priority of the deal and never exceed collections (08) |
| INV-INS-001 | TICK | FATAL | Insurer claim payments come from the insurer's balance sheet or reinsurance recoverables; an insurer with insufficient funds enters 08 run-off, never pays from nothing |

#### §3.1.6 Conflict, law and fairness rules (owners 12, 13, 14, 15)

| Id | Scope | Severity | Invariant |
|---|---|---|---|
| INV-CON-001 | PHASE P10 | FATAL | Breach probability for any resolved op is ≥ 0.01 when AP ≥ DP_eff/8 and ≤ 0.90 always (L2, 12 AT 2–3) |
| INV-CON-002 | PHASE P10 | FATAL | No hidden session's progress P exceeds 0.85 (L3) |
| INV-CON-003 | PHASE P10 | FATAL | Concurrent hostile sessions per victim ≤ 3; per attacker ≤ tier cap (12) |
| INV-CON-004 | PHASE P10 | FATAL | Cash loot per op ≤ min(10% of victim liquid cash, 2% of victim NW) before the r-scaling (03 §13.2, 12 AT 17) |
| INV-CON-005 | PHASE P10 | FATAL | No op resolves against a character inside its 72 h protection, dormant, or ineligible Rookie-zone state (12 AT 22) |
| INV-CON-006 | TICK | FATAL | All loot between characters posts as TRANSFER; no op mints base money (12 AT 20) |
| INV-CON-007 | PHASE P10 | FATAL | Hostile and legitimate connection entries serialize identically (12 AT 13): the client delta schema has no field that differs by hostility |
| INV-LAW-001 | PHASE P11 | FATAL | Held never exceeds 24 real hours per verdict (17,280 ticks) online; in the sandbox and practice worlds Held never applies (13 §3.10, §3.15) |
| INV-LAW-002 | PHASE P11 | FATAL | Crime and court never take a character below $5,000 liquid plus one T1 business (03 §13.5 floor); excess becomes garnishment |
| INV-LAW-003 | PHASE P11 | FATAL | Fines are computed on max(NW at offense, NW at verdict) (03 §14 #6) |
| INV-LAW-004 | TICK | FATAL | Reputation is never an input to verdict probability, fine size or legal fee (MASTER-BIBLE decision 5): enforced by the dependency graph of 13's verdict function (STATIC check INV-STR-006) plus a runtime check that the verdict function's declared inputs match |
| INV-SOC-001 | TICK | FATAL | Ladder rewards, tournament rewards and challenge rewards never post money (01 §14.4); any posting with a reward reason other than the listed non-cash ones fails |
| INV-SOC-002 | TICK | FATAL | Challenge portfolios are ring-fenced: no posting moves value between a challenge portfolio and any real-economy account (02 §2.4) |
| INV-SOC-003 | TICK | FATAL | P2P caps by account age (15) hold for every P2P transfer and contract payment |
| INV-SOC-004 | TICK | FATAL | Every board, ladder, league and tournament score update is derived from events of the production world (or of a server-run challenge world) whose `TickRecord` exists; there is no write path from client-submitted results (sandbox, practice or imported runs) (§3.15, E-52) |
| INV-WLD-001 | TICK | FATAL | Every published news item has non-empty `causeEventIds`, each resolving to a committed event at or before its publishTick (16 §3.6.1 N1) |
| INV-WLD-002 | TICK | FATAL | No news item states a fact that is false in engine state at publishTick, except a Rumor labelled as such with its source (16 §3.6.1 N2) |
| INV-PRG-001 | TICK | FATAL | Rank never decreases (14); a character's rank equals the 14 threshold function of its peak liquidation-value NW, where the peak uses the crowd-exit valuation (§3.6, H08) |
| INV-PRG-002 | TICK | FATAL | Purchased cosmetics never enter Prestige, Reputation, Notoriety, NW or any engine state (L7); the engine has no entity or field that references an entitlement (also STATIC INV-STR-002) |
| INV-CHR-001 | TICK | FATAL | One account, one profile and one character per player, pointing at each other; every chr id matches `^(?:[a-z]{3}\|hh\|prop)_[A-Za-z0-9_]+$` and is ≤ 64 chars (14 §2.1, §2.4; ledger errata E-18 (4), E-20, E-21) |
| INV-CHR-002 | TICK | FATAL | protectionEndsTick ≤ joinTick + 51,840 and never increases (14 §2.4, 13 §3.12) |
| INV-CHR-003 | TICK | FATAL | Every ACTIVE LIC2–LIC4 met its rank gate and an exam pass at grant (14 §3.3.1) |
| INV-CHR-004 | TICK | FATAL | At most one ACCT_ONBOARD_GRANT per character ever; LIC1 never LAPSED (14 §3.3.1) |
| INV-CHR-005 | TICK | FATAL | Every ACCT_FRESH_START posting is made by 14, matches a GRANTED Fresh Start record, is ≤ fresh_start_cash_real × MSI, and no two grants in one linked cluster fall within fresh_start_cooldown_real_days (14 §3.13; inert for linking until 15 provides links) |
| INV-CHR-006 | TICK | FATAL | No 14 fee (ACCT_LICENSE_FEE, ACCT_HANDLE_FEE, ACCT_HOME_CITY_FEE) draws a restricted cash lot (14 §4; complements INV-LED-014) |
| INV-CHR-007 | TICK | FATAL | Handles are unique case-insensitively among live handles and held released handles (14 §3.1.3) |
| INV-CHR-008 | TICK | FATAL | No GUEST account has an accepted P2P, contract or alliance intent (14 §3.1.1, 15 §3.12) |
| INV-CHR-009 | TICK | FATAL | shellsEarned = r0..rK for rank K; reachedTick set exactly for ranks ≤ K and non-decreasing (14 §3.2.4, §3.4) |
| INV-CHR-010 | TICK | FATAL | Every ACTIVE charter's controlling character had reached the charter rank gate at grant: CH_FUND, CH_EXCHANGE_MEMBER R3; CH_BANK, CH_INSURER, CH_CUSTODIAN R4 (14 §3.2.2) |
| INV-CHR-011 | TICK | FATAL | Legacy points never decrease; convictions are record lines, never subtractions (14 §3.14) |
| INV-CHR-012 | TICK | FATAL | Reputation stays in [0, 100] and every change has a reputation event row and a life.reputation.changed event (14 §3.10) |
| INV-CHR-013 | TICK | FATAL | Notoriety stays in [0, 100] and is never an input to breach, detection, verdict, fine or price (14 §3.11) |
| INV-CHR-014 | TICK | FATAL | Prestige counts only displayed, non-cosmetic items, and an item counts in at most one set (14 §3.8, §3.9) |
| INV-CHR-015 | TICK | FATAL | A LIMITED drop allocates at most its size and at most one unit per character (14 §3.6.3) |
| INV-CHR-016 | TICK | FATAL | No rule moves an estate or a House to another account; the character id is unchanged across succession (14 §3.15.5) |
| INV-CHR-017 | TICK | FATAL | Back Room membership never appears in any PUBLIC or PARTIES payload or event (14 §3.12.1) |
| INV-CHR-018 | TICK | FATAL | Public payloads of module 14 use only the PublicationConsent allowlist and money only as price buckets unless showItemValues (14 §2.3, §5) |
| INV-CHR-019 | TICK | FATAL | Philanthropy Reputation gained per chapter ≤ rep_philanthropy_chapter_cap (14 §3.10.2) |
| INV-CHR-020 | TICK | FATAL | Every money movement of module 14 uses a 14 §3.17 code or its 03 alias (14 §3.17; ledger errata E-21, E-22) |

#### §3.1.7 Engine structure, determinism and privacy (owners 02, 19)

| Id | Scope | Severity | Invariant |
|---|---|---|---|
| INV-ENG-001 | TICK | FATAL | Write ownership: every entity written this tick was written only by its owning module (19 Rule 3.1.3 ownership tables) |
| INV-ENG-002 | TICK | FATAL | RNG discipline: every random draw came from a named 02 stream; the per-stream draw counters advanced only by draws recorded in the tick's RNG ledger |
| INV-ENG-003 | TICK | FATAL | ID determinism: every id created this tick equals `hash(worldSeed, kind, creationTick, sequence)` (00 §3.2), and no id collides with an existing id |
| INV-ENG-004 | TICK | FATAL | Event sequence: event `seq` values in the tick are dense from 0 and in canonical order (19 §3.6.4) |
| INV-ENG-005 | TICK | FATAL | Visibility: no `PRIVATE`, `PARTIES` or `SEALED` event, and no field derived from one, appears in a delta addressed to a recipient outside its `partyIds` (L11). Checked by the delta builder's recipient filter assertion at P14 |
| INV-ENG-006 | TICK | FATAL | Phase discipline: no module read a value written later in the same tick's pipeline than its own phase (00 §5.2), detected by the store's phase stamps |
| INV-ENG-007 | TICK | FATAL | Time: the tick number is exactly previous + 1; calendar hooks fired exactly at their boundary ticks (02) |
| INV-ENG-008 | OFFLINE | FATAL | Replay: re-running any committed tick range from its snapshot and batches reproduces every `TickRecord.logicalStateHash` (§3.3) |
| INV-ENG-009 | OFFLINE | FATAL | Partition equivalence: 1, 4 and 16 partitions give identical `logicalStateHash` sequences and identical canonical event streams (§3.3.3) |
| INV-ENG-010 | TICK | ALERT | Phase budgets: no phase exceeded its wall-time budget of 19 by more than 2×; a tick whose total exceeds `PARAM.tm_tick_alert_ms = 3500` pages on-call |

#### §3.1.8 Static (CI) invariants (owners 19, 20, 21)

| Id | Invariant |
|---|---|
| INV-STR-001 | `packages/engine/**` imports nothing outside its allowed set (19 Rule 3.1.2): no Node built-ins, no network, no clock, no filesystem, no `Math.random`, no `Date`, no `platform`, no `ui` |
| INV-STR-002 | **Purchase code can never import the engine package.** No file under the commerce paths (`apps/web/store/**`, `apps/jobs/commerce/**`, `packages/platform/commerce/**`, 21 §3.13) has a direct or transitive import of `packages/engine` or of any package that itself imports it. Checked on the resolved module graph, not by grepping. `DEFAULT (Mathis may override)`: this is a hard CI failure with no waiver path |
| INV-STR-003 | The engine never imports `packages/platform/commerce`, the entitlement tables' schema module, or the ad module |
| INV-STR-004 | The world process's runtime configuration contains no credentials for the commerce schema or the ad-network keys (deployment manifest check, 19 §3.14) |
| INV-STR-005 | Every intent kind registered in `packages/protocol` has a validator and a handler in exactly one engine module, and an entry in that module's spec "Player intents" section (doc-sync check over the spec's intent list exported to `docs/intents.json`) |
| INV-STR-006 | Function-input whitelists: 13's verdict, fine and fee functions have no parameter of type Reputation or Prestige; 12's breach and detection functions have no parameter of type Prestige (heat multiplies exposure only, MASTER-BIBLE decision 4) |
| INV-STR-007 | Every PARAM read in code exists in the 23 registry with a default and a range; every 23 key is read somewhere or marked `RESERVED` |
| INV-STR-008 | Every string shown to players is a key present in both `en` and `fr` catalogues (L8); French coverage 100% at G4 |
| INV-STR-009 | No content string in 22 or the i18n catalogues matches the real-brand block list (L6, 21 §3.8.3) |
| INV-STR-010 | No code path in `packages/engine` or `apps/web` produces a random reward amount for anything bought or watched (L7, L5): the reward functions for ads and purchases are constants or table lookups, checked by an AST rule that forbids RNG calls in `rewards/**` |


---

# PARAMETERS (23 registry rows; read via ctx.params)

| key | default | range | unit | owner § | what it affects | live |
|---|---|---|---|---|---|---|
| `inv_rehypo_max_chain` | 1 | 0–2 | re-uses | 20 §3.1.4 | max rehypothecation chain length checked by INV-BS-007 (07 owns re-use rules) | no (V) |
| `inv_xpart_settle_max_ticks` | 2 | 1–4 | ticks | 20 §3.1.4 | max life of a cross-partition hold before INV-BS-012 fails | no (V) |
| `tm_tick_alert_ms` | 3500 | 2500–4500 | ms | 20 §3.1.7 | tick wall time that pages on-call (INV-ENG-010) | no (V) |

---

# DECISIONS AND RULINGS THAT APPLY (24; they override the excerpts where they differ)

| D415 | purchase code can never import the engine; hard CI failure, no waiver (INV-STR-002, §3.1.8) — caller default. | 20 §3.1.8 | Every rule is verified before release | IN FORCE |