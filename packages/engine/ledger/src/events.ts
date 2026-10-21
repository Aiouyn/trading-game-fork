// 03 §5: the zod payload schema of every engine event unit 03 emits, and its visibility (T03-01).
// E-79: a new flat file in `src/` — no flat file owned the 03 event schemas before this card.
// Money crosses the protocol as a decimal string (G3), ids as strings (G3).
import { z } from 'zod';
import type { Visibility } from '@tycoon/engine-core/types';
import { CCYS } from './money';
import type { ClaimRank, TaxType } from './types';

/** A Money amount on the wire: an integer micro-unit decimal string (G3, 03 §2.2). */
export const moneyString = z.string().regex(/^-?\d+$/);
/** An id on the wire (G3: `<kind>_<26 chars>` or an authored id). */
export const idString = z.string().min(1);
const ccyEnum = z.enum(CCYS);
/** A tick on the wire (integer since genesis). */
const tick = z.number().int();

/** 03 §2.10: the claim ranks, in priority order. */
const CLAIM_RANKS = ['SECURED', 'ADMIN', 'TAX', 'WAGES', 'DEPOSITS_INSURED', 'SENIOR_UNSECURED', 'SUBORDINATED',
  'PREFERRED_EQUITY', 'COMMON_EQUITY'] as const;
/** 03 §2.9: the tax types. */
const TAX_TYPES = ['PERSONAL_INCOME', 'CAPITAL_GAINS', 'CORPORATE', 'PROPERTY', 'VAT', 'SEC_TX', 'STAMP', 'P2P', 'WHT', 'EXIT', 'FRANCHISE'] as const;

/** 03 §3.7.4: the four Stabilizer levers. */
const LEVERS = ['L1', 'L2', 'L3', 'L4'] as const;
/** 03 §3.7.6: the alert kinds. */
const ALERTS = ['STRUCTURAL_IMBALANCE', 'INFLATION', 'RHO_BAND'] as const;
/** 03 §2.10: the insolvency procedures. */
const PROCEDURES = ['LIQUIDATION', 'RESTRUCTURING', 'BANK_RESOLUTION', 'PERSONAL'] as const;
/** The four lever values (and their daily changes) of the Stabilizer (03 §3.7.4). */
const leverRow = z.object({ L1: z.number(), L2: z.number(), L3: z.number(), L4: z.number() });

/** Every 03 §5 event kind, with its payload schema. */
export const LEDGER_EVENTS = {
  // P13: one committed entry. PARTIES (each side sees its own postings).
  'ledger.entry.committed': z.strictObject({
    entryId: idString, reason: z.string(), amount: moneyString, ccy: ccyEnum, counterpartyLabel: z.string(),
  }),
  // Period close: a statement is ready. PRIVATE (owner) / PUBLIC (published statements).
  'ledger.statement.ready': z.strictObject({
    entityId: idString,
    period: z.strictObject({ kind: z.enum(['DAY', 'MONTH', 'QUARTER', 'YEAR', 'CHAPTER', 'FLASH']), index: z.number().int() }),
    scope: z.enum(['SOLO', 'CONSOLIDATED']),
  }),
  // Day close: the year-to-date tax estimate. PRIVATE.
  'ledger.tax.estimate': z.strictObject({
    entityId: idString, ytdByType: z.record(z.enum(TAX_TYPES), moneyString),
  }),
  // §3.12.14: a tax due / paid / late. PRIVATE.
  'ledger.tax.due': z.strictObject({ taxAccountId: idString, amount: moneyString, dueTick: tick }),
  'ledger.tax.paid': z.strictObject({ taxAccountId: idString, amount: moneyString, dueTick: tick }),
  'ledger.tax.late': z.strictObject({ taxAccountId: idString, amount: moneyString, dueTick: tick }),
  // Quarter end: an audit selection. PRIVATE (taxpayer); the findings stay SEALED until 13 discloses them.
  'ledger.tax.audit.selected': z.strictObject({ entityId: idString, scope: z.enum(['PERSONAL', 'CORPORATE']) }),
  'ledger.tax.audit.finding': z.strictObject({
    entityId: idString,
    findingKind: z.enum(['UNEXPLAINED_WEALTH', 'FALSE_SUBSTANCE']),
    amount: moneyString,
    codes: z.array(z.string()),
    evidencePoints: z.number().int(),
  }),
  // Grace end: a default. PARTIES.
  'ledger.default': z.strictObject({ debtorId: idString, obligationRef: idString, amount: moneyString }),
  // Day close: an insolvency review. PRIVATE + regulator.
  'ledger.insolvency.review': z.strictObject({ entityId: idString, equity: moneyString }),
  // Case events. PUBLIC for companies and institutions, PRIVATE for characters (the emitter picks).
  'ledger.insolvency.opened': z.strictObject({
    caseId: idString, debtorId: idString, procedure: z.enum(PROCEDURES),
    recoveriesByRank: z.record(z.enum(CLAIM_RANKS), moneyString),
  }),
  'ledger.insolvency.distribution': z.strictObject({
    caseId: idString, debtorId: idString, procedure: z.enum(PROCEDURES),
    recoveriesByRank: z.record(z.enum(CLAIM_RANKS), moneyString),
  }),
  'ledger.insolvency.closed': z.strictObject({
    caseId: idString, debtorId: idString, procedure: z.enum(PROCEDURES),
    recoveriesByRank: z.record(z.enum(CLAIM_RANKS), moneyString),
  }),
  // Top-up: a Fresh Start. PRIVATE (+ the public Legacy record of 14).
  'ledger.freshStart': z.strictObject({ chrId: idString, amount: moneyString }),
  // P13: a related-party flag. PRIVATE + regulator; disclosed in the next filing.
  'ledger.related_party.flag': z.strictObject({ entryId: idString, deviationPct: z.number() }),
  // Day close: the public Money Supply Report (03 §3.7.7). M0, M0_sys and M2 are per currency;
  // PEM, PEW, N_a, e, u, the levers, the faucet/sink families and rho are world figures.
  'stab.daily.report': z.strictObject({
    M0: z.record(ccyEnum, moneyString),
    M0_sys: z.record(ccyEnum, moneyString),
    M2: z.record(ccyEnum, moneyString),
    PEM: moneyString, PEW: moneyString, N_a: z.number().int().nonnegative(),
    e: z.number(), u: z.number(),
    levers: leverRow,
    leverChanges: leverRow,
    familiesDay: z.record(z.string(), moneyString),
    familiesYear: z.record(z.string(), moneyString),
    rho: z.number(),
  }),
  // When a lever moves.
  'stab.lever.changed': z.strictObject({ lever: z.enum(LEVERS), from: z.number(), to: z.number() }),
  // §3.7.6: an internal ops alert.
  'stab.alert': z.strictObject({ alert: z.enum(ALERTS), value: z.number() }),
  // Day close: the Money Supply Index.
  'msi.updated': z.strictObject({ msi: z.number(), raw: z.number() }),
  // P13 abort: an invariant failed. SEALED + ops.
  'ledger.invariant.failed': z.strictObject({
    invariantId: z.string(), entryId: idString.optional(), entityId: idString.optional(), module: z.string(),
  }),
} as const;

export type LedgerEventKind = keyof typeof LEDGER_EVENTS;
export type LedgerEventPayload<K extends LedgerEventKind> = z.infer<(typeof LEDGER_EVENTS)[K]>;

/**
 * The visibility of every 03 §5 event kind.
 * - `ledger.entry.committed`: PARTIES (each side sees its own postings).
 * - `ledger.statement.ready`: PRIVATE (the owner's statement) / PUBLIC (a published statement).
 * - `ledger.tax.estimate`, `ledger.tax.due|paid|late`: PRIVATE.
 * - `ledger.tax.audit.selected`: PRIVATE (the taxpayer); `ledger.tax.audit.finding`: SEALED until 13 discloses it.
 * - `ledger.default`: PARTIES.
 * - `ledger.insolvency.review`: PRIVATE (owner) + regulator.
 * - `ledger.insolvency.opened|distribution|closed`: PUBLIC for companies and institutions, PRIVATE for characters
 *   (the emitter picks; the character case is the private one).
 * - `ledger.freshStart`: PRIVATE (+ the public Legacy record of 14).
 * - `ledger.related_party.flag`: PRIVATE (owner) + regulator.
 * - `stab.daily.report`, `stab.lever.changed`, `msi.updated`: PUBLIC.
 * - `stab.alert`: PRIVATE, addressed to `sys_SYSTEM` as the ops channel.
 * - `ledger.invariant.failed`: SEALED (+ ops).
 */
export const LEDGER_EVENT_VISIBILITY: Readonly<Record<LedgerEventKind, Visibility>> = {
  'ledger.entry.committed': 'PARTIES',
  'ledger.statement.ready': 'PRIVATE',
  'ledger.tax.estimate': 'PRIVATE',
  'ledger.tax.due': 'PRIVATE',
  'ledger.tax.paid': 'PRIVATE',
  'ledger.tax.late': 'PRIVATE',
  'ledger.tax.audit.selected': 'PRIVATE',
  'ledger.tax.audit.finding': 'SEALED',
  'ledger.default': 'PARTIES',
  'ledger.insolvency.review': 'PRIVATE',
  'ledger.insolvency.opened': 'PUBLIC',
  'ledger.insolvency.distribution': 'PUBLIC',
  'ledger.insolvency.closed': 'PUBLIC',
  'ledger.freshStart': 'PRIVATE',
  'ledger.related_party.flag': 'PRIVATE',
  'stab.daily.report': 'PUBLIC',
  'stab.lever.changed': 'PUBLIC',
  'stab.alert': 'PRIVATE',
  'msi.updated': 'PUBLIC',
  'ledger.invariant.failed': 'SEALED',
};

/** The tax types (03 §2.9), re-exported for the callers that build a `ytdByType` map. */
export const TAX_TYPE_NAMES: readonly TaxType[] = TAX_TYPES;
/** The claim ranks (03 §2.10), re-exported for the callers that build a `recoveriesByRank` map. */
export const CLAIM_RANK_NAMES: readonly ClaimRank[] = CLAIM_RANKS;
