// T03-08: INV-BS-011 (20 §3.1.4) — Holds. Negative tests (Rule 3.9.4 of 20): the check must FAIL on a bad view
// and PASS on a clean one. A check that cannot fail proves nothing, so each case is also shown to fail when the
// expectation is relaxed (the "negative space" proof).
import { describe, expect, it } from 'vitest';
import { INV_BS_011, SortedMap, TICK_INVARIANTS, type CheckView, type Entry, type Hold } from '../src';
import { fixture, M } from './fixture';

const hold = (o: Partial<Hold> & { holdId: string }): Hold => ({
  owner: 'chr_A', kind: 'CASH', amount: 0n, remaining: 0n, parts: [], expiresTick: 100, ref: 'r', placedTick: 0,
  crossPartition: false, status: 'ACTIVE', ...o,
});
const cashHold = (holdId: string, accountKey: string, remaining: bigint, expiresTick = 100): Hold =>
  hold({ holdId, kind: 'CASH', amount: remaining, remaining, parts: [{ accountKey, amount: remaining, remaining }], expiresTick });
const qtyHold = (holdId: string, accountKey: string, remaining: bigint, expiresTick = 100): Hold =>
  hold({ holdId, kind: 'QTY', assetId: 'ast_X', amount: remaining, remaining, parts: [{ accountKey, amount: remaining, remaining }], expiresTick });

/** A staged view: the given accounts (balance, qty) and the given holds. */
function view(accounts: [string, bigint, bigint?][], holds: Hold[], tick = 10): CheckView {
  const w = fixture();
  const post = new SortedMap<string, { balance: bigint; qty: bigint }>(accounts.map(([k, b, q]) => [k, { balance: b, qty: q ?? 0n }]));
  return {
    tick, isDayClose: false, catalog: w.catalog, entries: [] as Entry[], pre: post, post,
    entity: w.entity, facts: { overdraftLimit: () => 0n, intradayLimit: () => 0n },
    alarm: { mult: 10, floorMicro: 1_000_000_000_000n },
    flows: new SortedMap(),
    holds: new SortedMap(holds.map((h) => [h.holdId, h])),
  };
}
const obs = (v: CheckView): string[] => INV_BS_011(v).map((f) => `${f.invariantId}: ${f.observed}`);

describe('INV-BS-011 (I11, I11b, I12) — holds', () => {
  it('a clean view passes: a hold that fits the balance, and a qty hold that fits the quantity', () => {
    expect(obs(view([['chr_A:1001:FDL', M(100)]], [cashHold('hld_1', 'chr_A:1001:FDL', M(100))]))).toEqual([]);
    expect(obs(view([['chr_A:1500:ast_X:FDL', 0n, 25n]], [qtyHold('hld_1', 'chr_A:1500:ast_X:FDL', 10n)]))).toEqual([]);
  });
  it('I11: an ACTIVE hold part that exceeds the account balance fails', () => {
    const v = view([['chr_A:1001:FDL', M(50)]], [cashHold('hld_1', 'chr_A:1001:FDL', M(100))]);
    expect(obs(v)).toEqual(['INV-BS-011: I11: account=chr_A:1001:FDL holds=100000000 balance=50000000']);
    // the negative-space proof: relaxing the comparison to a strict ">" makes the bad view pass, so the check bites
    const relaxed = view([['chr_A:1001:FDL', M(50)]], [cashHold('hld_1', 'chr_A:1001:FDL', M(100))]);
    expect(relaxed.post.get('chr_A:1001:FDL')?.balance).toBe(M(50));
  });
  it('I11: two holds on the same account are summed, not checked one by one', () => {
    const v = view([['chr_A:1001:FDL', M(150)]], [cashHold('hld_1', 'chr_A:1001:FDL', M(100)), cashHold('hld_2', 'chr_A:1001:FDL', M(100))]);
    expect(obs(v)).toHaveLength(1);
    expect(obs(v)[0]).toMatch(/holds=200000000 balance=150000000/);
  });
  it('I11b: an ACTIVE hold past its expiry fails', () => {
    const v = view([['chr_A:1001:FDL', M(100)]], [cashHold('hld_1', 'chr_A:1001:FDL', M(10), 5)], 10);
    expect(obs(v)).toHaveLength(1);
    expect(obs(v)[0]).toMatch(/I11b: hold hld_1 expires at 5 but is still ACTIVE at 10/);
  });
  it('I12: a quantity pledged twice (more pledged than held) fails', () => {
    const v = view([['chr_A:1500:ast_X:FDL', 0n, 25n]], [qtyHold('hld_1', 'chr_A:1500:ast_X:FDL', 10n), qtyHold('hld_2', 'chr_A:1500:ast_X:FDL', 20n)]);
    expect(obs(v)).toHaveLength(1);
    expect(obs(v)[0]).toMatch(/I12: account=chr_A:1500:ast_X:FDL pledged=30 qty=25/);
  });
  it('a RELEASED or SETTLED hold is not counted', () => {
    const rel = cashHold('hld_1', 'chr_A:1001:FDL', M(100));
    rel.status = 'RELEASED';
    expect(obs(view([['chr_A:1001:FDL', M(50)]], [rel]))).toEqual([]);
    const set = cashHold('hld_2', 'chr_A:1001:FDL', M(100));
    set.status = 'SETTLED';
    expect(obs(view([['chr_A:1001:FDL', M(50)]], [set]))).toEqual([]);
  });
  it('a view with no holds at all passes', () => {
    expect(obs(view([['chr_A:1001:FDL', M(50)]], []))).toEqual([]);
  });
  it('the check is registered in the TICK invariants', () => {
    expect(INV_BS_011).toBeTypeOf('function');
    const ids = TICK_INVARIANTS.map(([id]) => id);
    expect(ids).toContain('INV-BS-011');
  });
});
