import type { Ccy, Id, Money, Price, Qty, Tick } from './money';
import type { FlowClass, TemplateId } from './catalog';
import type { AccountClass } from './accounts';
import type { TableDef } from './core-port';

export type PhaseId = `P${number}`;
export type EntityKind =
  | 'sys' | 'cbk' | 'gov' | 'reg' | 'crt' | 'exc' | 'ccp' | 'rat' | 'bnk' | 'ins' | 'fnd' | 'spv' | 'cmp' | 'biz' | 'prop'
  | 'ali' | 'npc' | 'hh' | 'frm' | 'row' | 'chr';
/** 03 §2.1 canonical order (the iteration order of every kind-sorted scan). */
export const ENTITY_KIND_ORDER: readonly EntityKind[] = [
  'sys', 'cbk', 'gov', 'reg', 'crt', 'exc', 'ccp', 'rat', 'bnk', 'ins', 'fnd', 'spv', 'cmp', 'biz', 'prop', 'ali', 'npc', 'hh', 'frm', 'row', 'chr',
];
/** Same list under the name the ledger already used; kept so no existing import breaks. */
export const ENTITY_KINDS: readonly EntityKind[] = ENTITY_KIND_ORDER;
export type Perimeter = 'PLAYER' | 'NPC' | 'ELASTIC' | 'SYSTEM';
export type PayAccountChoice = { kind: 'CASH' } | { kind: 'BANK'; bankId: Id };
/** 03 §2.1: a bloc id is its currency code (24 R39); Isla Serena is the free zone. */
export type BlocCode = Ccy;
export type Jurisdiction = BlocCode | 'SERENA';
/** 03 §2.1: court freeze (13), ENGINE_REVIEW (02 §3.15), insolvency (03 §3.14). */
export type EntityStatus = 'ACTIVE' | 'FROZEN' | 'INSOLVENCY_REVIEW' | 'IN_INSOLVENCY' | 'DISSOLVED';

export interface LedgerEntity {
  id: Id; kind: EntityKind; ownerId: Id | null; reportingCcy: Ccy;
  payFrom: PayAccountChoice; receiveInto: PayAccountChoice;
  status?: EntityStatus;   // E-15.2: DISSOLVED entities take no posting except LED_DISSOLUTION
  /** 03 §2.1 fields. Optional here: the world fills the subset it owns today; the remaining fields
   *  (ownership graph, partitions, jurisdiction) are written by the cards that own them (T03-16, unit 02/16). */
  nameKey?: string;
  rootOwnerId?: Id;
  perimeter?: Perimeter;
  homeBloc?: Jurisdiction;
  homeCity?: string;
  partitionId?: string;
  createdTick?: Tick;
  closedTick?: Tick;
  /** acct.payment.setAccounts takes effect from this tick (03 §3.3.4). */
  railChangeTick?: Tick;
}

/** 03 §2.2: one account row. Sign convention (03 §3.3.1): a debit adds `amount`, a credit subtracts it. */
export interface Account {
  key: string; entityId: Id; code: number; sub?: string; ccy: Ccy; class: AccountClass;
  balance: Money; qty?: Qty; assetId?: Id; isMoney: boolean; openedTick: Tick;
}

/** Spec §2.2 (T03-01) + Δ5 flowLeg. */
export interface Posting {
  tick: Tick; entryId: Id; postingSeq: number;
  debitAccount: string; creditAccount: string;
  amount: Money; ccy: Ccy; reason: string; refs: Id[];
  qty?: Qty; assetId?: Id; legOf?: { legId: string; side: 'A' | 'B' };
  flowLeg?: true;
}
export interface Entry {
  entryId: Id; tick: Tick; template: TemplateId; reason: string; postings: Posting[];
  requestedBy: { module: string; phase: PhaseId; entityId?: Id; intentId?: Id };
  holdId?: Id;                                                  // hold this entry settles (03 §3.3.2 rule 5)
  headline?: { amount: Money; ccy: Ccy; counterpartyId?: Id };  // the template's main amount and counterparty (for ledger.entry.committed)
  invalid?: { invariantId: string; observed: string; expected: string };  // set by eager validation; P13 fails it
  /** Parties the template was called with; borrowerId for LEND/REPAY/CB_CREDIT(_UNWIND) (PR #3 review F1, X-4). */
  meta?: {
    parties: Id[]; borrowerId?: Id;
    escrow?: { op: 'PLACE'; row: ConflictEscrow } | { op: 'SETTLE'; escrowId: Id; toAttacker: Money; toVictim: Money };
    accrual?: { id: Id; accrued?: Money; settled?: Money };
    garnish?: { id: Id; amount: Money };
  };
}
export interface Hold {
  holdId: Id; owner: Id; kind: 'CASH' | 'QTY'; ccy?: Ccy; assetId?: Id; amount: bigint; remaining: bigint;
  parts: { accountKey: string; amount: bigint; remaining: bigint }[];  // the accounts the rail will use, in draw order (03 §3.3.4 last paragraph)
  expiresTick: Tick; ref: Id; placedTick: Tick;
  /** 03 §2.3: the hold crosses a partition boundary (INV-BS-012 reads it; E-79 point 4). T03-08 threads the flag. */
  crossPartition: boolean;
  purposeCode?: string;                                         // reason code that will consume it (restricted cash, T03-12)
  status: 'ACTIVE' | 'SETTLED' | 'RELEASED';
}
export interface Reject { code: 'LED_INSUFFICIENT_FUNDS' | 'LED_INSUFFICIENT_QTY' | 'LED_RESTRICTED_FUNDS' | 'LED_BAD_EXPIRY' | 'LED_UNKNOWN_ENTITY' | 'LED_ENTITY_FROZEN' }
export function isReject(x: unknown): x is Reject {
  return typeof x === 'object' && x !== null && 'code' in x;
}

/** led.escrow row (spec §6.11 Δ14). */
export interface ConflictEscrow {
  escrowId: Id; victimId: Id; attackerId: Id; opId: Id; code: string; ccy: Ccy; amount: Money;
  placedTick: Tick; expiresTick: Tick; caseId: Id | null; status: 'HELD' | 'RELEASED' | 'CLAWED_BACK' | 'SPLIT';
}
/** Accrual registry row (errata E-14). a = receivable holder (payee), b = payer. */
export interface AccrualRow { accrualId: Id; kind: string; code: string; module: number; a: Id; b: Id; ccy: Ccy; payable: number; accrued: Money; settled: Money }

// ───────── 03 §2.4 reason-code definition ─────────
/** 03 §2.4: operating, investing, financing, non-cash. */
export type CashFlowClass = 'OP' | 'INV' | 'FIN' | 'NC';
/** 03 §2.4 verbatim. The runtime row is `catalog.CodeRow` (this shape plus the catalog v2 columns). */
export type ReasonCodeDef = {
  code: string; cls: FlowClass; owner: number; cf: CashFlowClass;
  allowedTemplates: TemplateId[]; taxTag?: TaxTag; stabilizerFamily?: string; descriptionKey: string;
};
/** 03 §2.4 taxTag: the tax base a code feeds (03 §3.12). */
export type TaxTag = 'DIV' | 'INT' | 'RENT' | 'ROYALTY' | 'BIZ' | 'SERVICE' | 'OTHER' | 'GAIN' | 'GAIN_SHORT' | 'EXEMPT'
  | 'FINE' | 'ILLICIT' | 'DONATION' | 'HOSTING' | 'P2P' | 'P2P_IF_RELATED' | 'VAT_FINAL' | 'TAX';
/** 03 §2.9. */
export type TaxType = 'PERSONAL_INCOME' | 'CAPITAL_GAINS' | 'CORPORATE' | 'PROPERTY' | 'VAT' | 'SEC_TX' | 'STAMP' | 'P2P' | 'WHT' | 'EXIT' | 'FRANCHISE';
/** 03 §2.10, in priority order. */
export type ClaimRank = 'SECURED' | 'ADMIN' | 'TAX' | 'WAGES' | 'DEPOSITS_INSURED' | 'SENIOR_UNSECURED' | 'SUBORDINATED'
  | 'PREFERRED_EQUITY' | 'COMMON_EQUITY';
/** 03 §2.6. */
export type MarkSource = 'CLEAR' | 'CLOSE' | 'NAV' | 'MODEL_FUND' | 'MODEL_CURVE' | 'MODEL_OPTION' | 'APPRAISAL' | 'INDEX'
  | 'COST_LESS_AMORT' | 'RECOVERY' | 'ZERO';
export interface Mark {
  assetId: Id; tick: Tick; price: Price; ccy: Ccy; source: MarkSource;
  confidence: 'LIQUID' | 'MODEL' | 'APPRAISAL' | 'STALE'; validUntilTick: Tick;
}

// ───────── facts other modules push into 03 (event edges, 19 Rule 12.4.2) ─────────
export interface LedgerFact { id: string /* `${kind}:${subjectId}` */; kind: LedgerFactKind; subjectId: Id; value: unknown; tick: Tick }
export type LedgerFactKind =
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
  | 'CRIME_COURT_DEBT'   // subject liability key; value 'FINE'|'RESTITUTION'|'JUDGMENT' (13; T03-26);

// ───────── the five core store tables (03 §2.1–§2.4) ─────────
/** Table names of unit 03 (19 Rule 3.6.3: one owner per table). */
export const TBL = {
  entity: 'led.entity', account: 'led.account', entry: 'led.entry', hold: 'led.hold', fact: 'led.fact',
} as const;
/** 12-digit zero-padded tick: the byTick / byExpiry index key (byte order = tick order). */
const tickKey = (t: Tick): string => String(t).padStart(12, '0');

export const entityTable: TableDef<LedgerEntity> = {
  name: TBL.entity, module: '03', idOf: (e) => e.id,
  indexes: [
    { name: 'byKind', key: (e) => e.kind },
    { name: 'byOwner', key: (e) => e.ownerId ?? '' },
    { name: 'byRoot', key: (e) => e.rootOwnerId ?? '' },
  ],
};
export const accountTable: TableDef<Account> = {
  name: TBL.account, module: '03', idOf: (e) => e.key,
  indexes: [
    { name: 'byEntity', key: (e) => e.entityId },
    { name: 'byAsset', key: (e) => e.assetId ?? '' },
    { name: 'byCode', key: (e) => String(e.code) },
  ],
};
export const entryTable: TableDef<Entry> = {
  name: TBL.entry, module: '03', idOf: (e) => e.entryId,
  indexes: [{ name: 'byTick', key: (e) => tickKey(e.tick) }],
};
export const holdTable: TableDef<Hold> = {
  name: TBL.hold, module: '03', idOf: (e) => e.holdId,
  indexes: [
    { name: 'byOwner', key: (e) => e.owner },
    { name: 'byExpiry', key: (e) => tickKey(e.expiresTick) },
    { name: 'byStatus', key: (e) => e.status },
  ],
};
export const factTable: TableDef<LedgerFact> = {
  name: TBL.fact, module: '03', idOf: (e) => e.id,
  indexes: [{ name: 'byKind', key: (e) => e.kind }],
};

/**
 * 03 §3.1 entity lifecycle (documented here, enforced elsewhere):
 * - accounts open lazily on the first posting of an entity (T03-08 creates them);
 * - an entity is dissolved only with all balances at zero except the equity accounts closing to zero,
 *   or through insolvency (03 §3.14; T03-25 enforces it);
 * - the dissolution posting is `LED_DISSOLUTION` (REVALUE class, amount 0 check record).
 */
