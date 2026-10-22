// T03-01: the 03 §5 event schemas — every kind has a schema, a valid sample parses, and a numeric amount is rejected.
import { describe, expect, it } from 'vitest';
import { LEDGER_EVENTS, LEDGER_EVENT_VISIBILITY, type LedgerEventKind } from '../src';

/** A valid sample of every 03 §5 payload (the card's payloads, filled with the spec's shapes). */
const SAMPLES: Readonly<Record<LedgerEventKind, unknown>> = {
  'ledger.entry.committed': { entryId: 'ent_1', reason: 'MKT_TRADE', amount: '1000000', ccy: 'FDL', counterpartyLabel: 'NPC' },
  'ledger.statement.ready': { entityId: 'cmp_N', period: { kind: 'QUARTER', index: 3 }, scope: 'SOLO' },
  'ledger.tax.estimate': { entityId: 'chr_A', ytdByType: { PERSONAL_INCOME: '100', CAPITAL_GAINS: '0', CORPORATE: '0', PROPERTY: '0', VAT: '0', SEC_TX: '0', STAMP: '0', P2P: '0', WHT: '0', EXIT: '0', FRANCHISE: '0' } },
  'ledger.tax.due': { taxAccountId: 'taxacc_1', amount: '500', dueTick: 720 },
  'ledger.tax.paid': { taxAccountId: 'taxacc_1', amount: '500', dueTick: 720 },
  'ledger.tax.late': { taxAccountId: 'taxacc_1', amount: '500', dueTick: 720 },
  'ledger.tax.audit.selected': { entityId: 'cmp_N', scope: 'CORPORATE' },
  'ledger.tax.audit.finding': { entityId: 'cmp_N', findingKind: 'UNEXPLAINED_WEALTH', amount: '250', codes: ['CMP_NPC_REVENUE'], evidencePoints: 3 },
  'ledger.default': { debtorId: 'chr_A', obligationRef: 'loan_1', amount: '900' },
  'ledger.insolvency.review': { entityId: 'cmp_N', equity: '-100' },
  'ledger.insolvency.opened': {
    caseId: 'case_1', debtorId: 'cmp_N', procedure: 'LIQUIDATION',
    recoveriesByRank: { SECURED: '100', ADMIN: '0', TAX: '0', WAGES: '0', DEPOSITS_INSURED: '0', SENIOR_UNSECURED: '0', SUBORDINATED: '0', PREFERRED_EQUITY: '0', COMMON_EQUITY: '0' },
  },
  'ledger.insolvency.distribution': {
    caseId: 'case_1', debtorId: 'cmp_N', procedure: 'LIQUIDATION',
    recoveriesByRank: { SECURED: '100', ADMIN: '0', TAX: '0', WAGES: '0', DEPOSITS_INSURED: '0', SENIOR_UNSECURED: '0', SUBORDINATED: '0', PREFERRED_EQUITY: '0', COMMON_EQUITY: '0' },
  },
  'ledger.insolvency.closed': {
    caseId: 'case_1', debtorId: 'cmp_N', procedure: 'LIQUIDATION',
    recoveriesByRank: { SECURED: '100', ADMIN: '0', TAX: '0', WAGES: '0', DEPOSITS_INSURED: '0', SENIOR_UNSECURED: '0', SUBORDINATED: '0', PREFERRED_EQUITY: '0', COMMON_EQUITY: '0' },
  },
  'ledger.freshStart': { chrId: 'chr_A', amount: '5000000000' },
  'ledger.related_party.flag': { entryId: 'ent_1', deviationPct: 12.5 },
  'stab.daily.report': {
    M0: { EUN: '1', FDL: '2', NKR: '3', PYN: '4', SRL: '5' },
    M0_sys: { EUN: '1', FDL: '2', NKR: '3', PYN: '4', SRL: '5' },
    M2: { EUN: '1', FDL: '2', NKR: '3', PYN: '4', SRL: '5' },
    PEM: '10', PEW: '20', N_a: 5, e: 0.01, u: 0.02,
    levers: { L1: 1, L2: 1, L3: 0.5, L4: 1 },
    leverChanges: { L1: 0, L2: 0, L3: 0, L4: 0 },
    familiesDay: { F1: '10', S1: '5' }, familiesYear: { F1: '100', S1: '50' }, rho: 0.9,
  },
  'stab.lever.changed': { lever: 'L1', from: 1, to: 0.995 },
  'stab.alert': { alert: 'STRUCTURAL_IMBALANCE', value: 0.6 },
  'msi.updated': { msi: 1.01, raw: 1.02 },
  'ledger.invariant.failed': { invariantId: 'INV-LED-001', entryId: 'ent_1', entityId: 'chr_A', module: '03' },
};

/** The kinds whose payload carries a Money amount (the card's money-as-a-decimal-string rule). */
const KINDS_WITH_AMOUNT: readonly LedgerEventKind[] = [
  'ledger.entry.committed', 'ledger.tax.due', 'ledger.tax.paid', 'ledger.tax.late', 'ledger.tax.audit.finding',
  'ledger.default', 'ledger.insolvency.review', 'ledger.freshStart',
];
/** The kinds that carry a Money amount under another name (equity, recoveries). */
const KINDS_WITH_MONEY_FIELDS: readonly LedgerEventKind[] = ['ledger.insolvency.opened', 'ledger.insolvency.distribution', 'ledger.insolvency.closed'];

describe('T03-01 event schemas (03 §5)', () => {
  it('has a schema and a visibility for every 03 §5 kind', () => {
    const kinds = Object.keys(LEDGER_EVENTS);
    // the 03 §5 table, with the tax.due/paid/late row and the insolvency.opened/distribution/closed row expanded,
    // and with `ledger.tax.audit.finding` (the "findings until 13 discloses" half of the audit row, card step 6).
    expect(kinds.length).toBe(20);
    for (const kind of kinds) {
      expect(LEDGER_EVENTS[kind as LedgerEventKind], kind).toBeDefined();
      expect(LEDGER_EVENT_VISIBILITY[kind as LedgerEventKind], kind).toBeDefined();
    }
    // the visibility map has no extra kind
    expect(Object.keys(LEDGER_EVENT_VISIBILITY).sort()).toEqual([...kinds].sort());
    // the 03 §5 table's kinds, all present
    for (const kind of [
      'ledger.entry.committed', 'ledger.statement.ready', 'ledger.tax.estimate', 'ledger.tax.due', 'ledger.tax.paid',
      'ledger.tax.late', 'ledger.tax.audit.selected', 'ledger.tax.audit.finding', 'ledger.default',
      'ledger.insolvency.review', 'ledger.insolvency.opened', 'ledger.insolvency.distribution', 'ledger.insolvency.closed',
      'ledger.freshStart', 'ledger.related_party.flag', 'stab.daily.report', 'stab.lever.changed', 'stab.alert',
      'msi.updated', 'ledger.invariant.failed',
    ] as LedgerEventKind[]) expect(kinds).toContain(kind);
  });

  it('the visibility of every kind is the one 03 §5 gives', () => {
    expect(LEDGER_EVENT_VISIBILITY['ledger.entry.committed']).toBe('PARTIES');
    expect(LEDGER_EVENT_VISIBILITY['ledger.default']).toBe('PARTIES');
    expect(LEDGER_EVENT_VISIBILITY['ledger.tax.estimate']).toBe('PRIVATE');
    expect(LEDGER_EVENT_VISIBILITY['ledger.tax.due']).toBe('PRIVATE');
    expect(LEDGER_EVENT_VISIBILITY['ledger.tax.paid']).toBe('PRIVATE');
    expect(LEDGER_EVENT_VISIBILITY['ledger.tax.late']).toBe('PRIVATE');
    expect(LEDGER_EVENT_VISIBILITY['ledger.tax.audit.selected']).toBe('PRIVATE');
    expect(LEDGER_EVENT_VISIBILITY['ledger.tax.audit.finding']).toBe('SEALED');
    expect(LEDGER_EVENT_VISIBILITY['ledger.insolvency.review']).toBe('PRIVATE');
    expect(LEDGER_EVENT_VISIBILITY['ledger.insolvency.opened']).toBe('PUBLIC');
    expect(LEDGER_EVENT_VISIBILITY['ledger.insolvency.distribution']).toBe('PUBLIC');
    expect(LEDGER_EVENT_VISIBILITY['ledger.insolvency.closed']).toBe('PUBLIC');
    expect(LEDGER_EVENT_VISIBILITY['ledger.freshStart']).toBe('PRIVATE');
    expect(LEDGER_EVENT_VISIBILITY['ledger.related_party.flag']).toBe('PRIVATE');
    expect(LEDGER_EVENT_VISIBILITY['ledger.statement.ready']).toBe('PRIVATE');
    expect(LEDGER_EVENT_VISIBILITY['stab.daily.report']).toBe('PUBLIC');
    expect(LEDGER_EVENT_VISIBILITY['stab.lever.changed']).toBe('PUBLIC');
    expect(LEDGER_EVENT_VISIBILITY['stab.alert']).toBe('PRIVATE');
    expect(LEDGER_EVENT_VISIBILITY['msi.updated']).toBe('PUBLIC');
    expect(LEDGER_EVENT_VISIBILITY['ledger.invariant.failed']).toBe('SEALED');
  });

  it('parses a valid sample of every kind', () => {
    for (const kind of Object.keys(LEDGER_EVENTS) as LedgerEventKind[]) {
      const r = LEDGER_EVENTS[kind].safeParse(SAMPLES[kind]);
      expect(r.success, `${kind}: ${r.success ? '' : JSON.stringify(r.error.issues)}`).toBe(true);
    }
  });

  it('rejects a numeric amount (money crosses the protocol as a decimal string)', () => {
    for (const kind of KINDS_WITH_AMOUNT) {
      const sample = SAMPLES[kind] as Record<string, unknown>;
      const broken = { ...sample, amount: 100 };
      expect(LEDGER_EVENTS[kind].safeParse(broken).success, kind).toBe(false);
    }
  });

  it('rejects a numeric Money value in the recoveries map', () => {
    for (const kind of KINDS_WITH_MONEY_FIELDS) {
      const sample = SAMPLES[kind] as { recoveriesByRank: Record<string, string> };
      const broken = { ...sample, recoveriesByRank: { ...sample.recoveriesByRank, SECURED: 100 } };
      expect(LEDGER_EVENTS[kind].safeParse(broken).success, kind).toBe(false);
    }
  });

  it('rejects a payload with an unknown key (a protocol drift is a loud failure)', () => {
    for (const kind of Object.keys(LEDGER_EVENTS) as LedgerEventKind[]) {
      const broken = { ...(SAMPLES[kind] as Record<string, unknown>), unexpected: 1 };
      expect(LEDGER_EVENTS[kind].safeParse(broken).success, kind).toBe(false);
    }
  });

  it('rejects an unknown enum value (a lever, a claim rank, a tax type, an alert, a ccy)', () => {
    expect(LEDGER_EVENTS['stab.lever.changed'].safeParse({ lever: 'L5', from: 1, to: 2 }).success).toBe(false);
    expect(LEDGER_EVENTS['stab.alert'].safeParse({ alert: 'NOPE', value: 1 }).success).toBe(false);
    expect(LEDGER_EVENTS['ledger.entry.committed'].safeParse({ entryId: 'e', reason: 'R', amount: '1', ccy: 'XXX', counterpartyLabel: 'x' }).success).toBe(false);
    expect(LEDGER_EVENTS['ledger.insolvency.opened'].safeParse({ caseId: 'c', debtorId: 'd', procedure: 'LIQUIDATION', recoveriesByRank: { NOPE: '1' } }).success).toBe(false);
    expect(LEDGER_EVENTS['ledger.tax.estimate'].safeParse({ entityId: 'chr_A', ytdByType: { NOPE: '1' } }).success).toBe(false);
  });

  it('the daily report needs every currency and rejects a missing one', () => {
    const s = SAMPLES['stab.daily.report'] as { M0: Record<string, string> };
    expect(LEDGER_EVENTS['stab.daily.report'].safeParse({ ...s, M0: { EUN: '1' } }).success).toBe(false);
    expect(LEDGER_EVENTS['stab.daily.report'].safeParse(s).success).toBe(true);
  });
});
