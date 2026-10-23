// T03-08: the HoldApi — place, reduce, release, expiry, the frozen-owner rule, the frozen-bank rule, the qty hold.
import { describe, expect, it } from 'vitest';
import { HOLD_REJECT, LedgerWorld, type Hold } from '../src';
import { fixture, M } from './fixture';

/** A world with $150 on chr_A's cash account, committed. */
const funded = (amount = M(150)): LedgerWorld => {
  const w = fixture();
  w.apiFor('21').ledger.mint('chr_A', amount, 'FDL', 'ADM_CORRECTION_IN');
  w.runP13();
  return w;
};

describe('T03-08 the cash hold', () => {
  it('place $100 on a $150 balance: ok, and $50 is available', () => {
    const w = funded();
    const H = w.apiFor('09').holds;
    const id = H.placeCash('chr_A', 'FDL', M(100), w.tick + 1, 'ref_1');
    expect(typeof id).toBe('string');
    expect(w.available('chr_A', 'FDL')).toBe(M(50));
  });
  it('a second hold of $60 on the remaining $50 is rejected with LED_INSUFFICIENT_FUNDS', () => {
    const w = funded();
    const H = w.apiFor('09').holds;
    expect(H.placeCash('chr_A', 'FDL', M(100), w.tick + 1, 'ref_1')).not.toEqual({ code: 'LED_INSUFFICIENT_FUNDS' });
    expect(H.placeCash('chr_A', 'FDL', M(60), w.tick + 1, 'ref_2')).toEqual({ code: HOLD_REJECT.INSUFFICIENT_FUNDS });
  });
  it('reduce by 30 frees the money again; release frees all of it', () => {
    const w = funded();
    const H = w.apiFor('09').holds;
    const id = H.placeCash('chr_A', 'FDL', M(100), w.tick + 1, 'ref_1') as string;
    expect(w.available('chr_A', 'FDL')).toBe(M(50));
    H.reduce(id, M(30));
    expect(w.available('chr_A', 'FDL')).toBe(M(80));
    H.release(id);
    expect(w.available('chr_A', 'FDL')).toBe(M(150));
    expect((H.get(id) as Hold).status).toBe('RELEASED');
  });
  it('a hold with an expiry in the past is rejected with LED_BAD_EXPIRY', () => {
    const w = funded();
    const H = w.apiFor('09').holds;
    expect(H.placeCash('chr_A', 'FDL', M(10), w.tick - 1, 'ref_1')).toEqual({ code: HOLD_REJECT.BAD_EXPIRY });
  });
  it('a hold on an unknown entity is rejected with LED_UNKNOWN_ENTITY', () => {
    const w = funded();
    const H = w.apiFor('09').holds;
    expect(H.placeCash('chr_ZZZ', 'FDL', M(10), w.tick + 1, 'ref_1')).toEqual({ code: 'LED_UNKNOWN_ENTITY' });
  });
  it('a FROZEN owner is rejected with LED_ENTITY_FROZEN (03 §3.14.3)', () => {
    const w = funded();
    w.setEntityStatus('chr_A', 'FROZEN');
    const H = w.apiFor('09').holds;
    expect(H.placeCash('chr_A', 'FDL', M(10), w.tick + 1, 'ref_1')).toEqual({ code: HOLD_REJECT.ENTITY_FROZEN });
  });
  it('an IN_INSOLVENCY owner is rejected with LED_ENTITY_FROZEN', () => {
    const w = funded();
    w.setEntityStatus('chr_A', 'IN_INSOLVENCY');
    const H = w.apiFor('09').holds;
    expect(H.placeCash('chr_A', 'FDL', M(10), w.tick + 1, 'ref_1')).toEqual({ code: HOLD_REJECT.ENTITY_FROZEN });
  });
  it('a COURT_FREEZE fact blocks the hold (the court pushes the fact)', () => {
    const w = funded();
    w.setCourtFreeze('chr_A', true);
    const H = w.apiFor('09').holds;
    expect(H.placeCash('chr_A', 'FDL', M(10), w.tick + 1, 'ref_1')).toEqual({ code: HOLD_REJECT.ENTITY_FROZEN });
  });
  it('a hold on a FROZEN bank\'s deposit is rejected (03 §8 edge 2, E-79 point 5)', () => {
    const w = funded();
    w.setRail('chr_A', { payFrom: { kind: 'BANK', bankId: 'bnk_N' } });
    w.setBankFrozen('bnk_N', true);
    const H = w.apiFor('09').holds;
    expect(H.placeCash('chr_A', 'FDL', M(10), w.tick + 1, 'ref_1')).toEqual({ code: HOLD_REJECT.INSUFFICIENT_FUNDS });
  });
  it('the cross-partition flag is carried on the hold row (E-79 point 4)', () => {
    const w = funded();
    const H = w.apiFor('09').holds;
    const id = H.placeCashFor('chr_A', 'FDL', M(10), w.tick + 1, 'ref_1', 'BIZ_PURCHASE_NEW', { crossPartition: true }) as string;
    expect((H.get(id) as Hold).crossPartition).toBe(true);
    const id2 = H.placeCashFor('chr_A', 'FDL', M(10), w.tick + 1, 'ref_2', 'BIZ_PURCHASE_NEW') as string;
    expect((H.get(id2) as Hold).crossPartition).toBe(false);
  });
  it('activeHolds lists the owner\'s ACTIVE holds only, in id order (E-79 point 4)', () => {
    const w = funded();
    const H = w.apiFor('09').holds;
    const a = H.placeCash('chr_A', 'FDL', M(10), w.tick + 1, 'ref_1') as string;
    const b = H.placeCash('chr_A', 'FDL', M(10), w.tick + 1, 'ref_2') as string;
    H.release(b);
    expect(H.activeHolds('chr_A').map((h) => h.holdId)).toEqual([a]);
    expect(H.activeHolds('chr_B')).toEqual([]);
  });
});

describe('T03-08 the expiry', () => {
  it('a hold is ACTIVE at its expiry tick and RELEASED at the next one', () => {
    const w = funded();
    const H = w.apiFor('09').holds;
    const t = w.tick;
    const id = H.placeCash('chr_A', 'FDL', M(10), t + 1, 'ref_1') as string;
    expect((H.get(id) as Hold).status).toBe('ACTIVE');
    w.runP13();                       // commits tick t: the hold expires at t+1, so it is still ACTIVE
    expect((H.get(id) as Hold).status).toBe('ACTIVE');
    w.runP13();                       // commits tick t+1: the expiry (t+1 < t+1) is false, still ACTIVE
    expect((H.get(id) as Hold).status).toBe('ACTIVE');
    w.runP13();                       // commits tick t+2: now t+1 < t+2, the hold is released
    expect((H.get(id) as Hold).status).toBe('RELEASED');
    expect(w.available('chr_A', 'FDL')).toBe(M(150));
  });
});

describe('T03-08 the quantity hold', () => {
  /** A world where chr_A holds 10 units of ast_EQ_N (the issuance account is the source of the swap). */
  const withShares = (qty = 10n): LedgerWorld => {
    const w = fixture();
    w.apiFor('21').ledger.mint('chr_A', M(100), 'FDL', 'ADM_CORRECTION_IN');
    w.apiFor('05').ledger.swapAsset('chr_A', 'cmp_N', 'ast_EQ_N', qty, M(10), 'FDL', 'MKT_TRADE', { assetAcct: 1500, assetAcctFrom: 2600 });
    expect(w.runP13().failures).toEqual([]);
    return w;
  };
  it('place 10 of 25 shares is ok; 20 more is rejected with LED_INSUFFICIENT_QTY', () => {
    const w = withShares(25n);
    const H = w.apiFor('07').holds;
    const id = H.placeQty('chr_A', 'ast_EQ_N', 10n, w.tick + 1, 'ref_1');
    expect(typeof id).toBe('string');
    expect(w.availableQty('chr_A', 'ast_EQ_N')).toBe(15n);
    expect(H.placeQty('chr_A', 'ast_EQ_N', 20n, w.tick + 1, 'ref_2')).toEqual({ code: HOLD_REJECT.INSUFFICIENT_QTY });
  });
  it('the qty hold names the account it is pledged on, so I12 is computable', () => {
    const w = withShares(25n);
    const H = w.apiFor('07').holds;
    const id = H.placeQty('chr_A', 'ast_EQ_N', 10n, w.tick + 1, 'ref_1') as string;
    const h = H.get(id) as Hold;
    expect(h.parts.length).toBe(1);
    expect(h.parts[0].accountKey).toBe('chr_A:1500:ast_EQ_N:FDL');
    expect(h.parts[0].remaining).toBe(10n);
  });
  it('a FROZEN owner cannot pledge a quantity', () => {
    const w = withShares(25n);
    w.setEntityStatus('chr_A', 'FROZEN');
    const H = w.apiFor('07').holds;
    expect(H.placeQty('chr_A', 'ast_EQ_N', 10n, w.tick + 1, 'ref_1')).toEqual({ code: HOLD_REJECT.ENTITY_FROZEN });
  });
});

describe('T03-08 the restricted cash rule (03#32)', () => {
  it('a purpose that may not use restricted cash is rejected with LED_RESTRICTED_FUNDS', () => {
    const w = fixture();
    const t = w.tick;
    w.apiFor('21').ledger.mint('chr_P', 250_000_000n, 'FDL', 'ACCT_REWARDED_AD');
    w.runP13();
    const H = w.apiFor('09').holds;
    expect(H.placeCashFor('chr_P', 'FDL', 100_000_000n, t + 1, 'ref_1', 'OPS_COST_NPC')).toEqual({ code: HOLD_REJECT.RESTRICTED_FUNDS });
  });
});
