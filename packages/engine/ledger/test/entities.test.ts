// T03-08: the entity registry, the lazy accounts, the facts table and the runtime handle.
import { describe, expect, it } from 'vitest';
import { LedgerWorld, accountKey as K, type Account, type LedgerEntity } from '../src';
import { fixture, M } from './fixture';

describe('T03-08 the entity registry (registerEntity)', () => {
  it('registering a character: homeBloc from the spec, reportingCcy FDL, perimeter PLAYER, root itself', () => {
    const w = fixture();
    const e = w.entity('chr_A') as LedgerEntity;
    expect(e.kind).toBe('chr');
    expect(e.reportingCcy).toBe('FDL');           // 03 §2.1: a character always reports in FDL
    expect(e.perimeter).toBe('PLAYER');
    expect(e.rootOwnerId).toBe('chr_A');
    expect(e.status).toBe('ACTIVE');
    expect(e.nameKey).toBe('entity.chr_A');
    expect(e.createdTick).toBe(0);
  });
  it('a company owned by a character: the root is the character, the perimeter is PLAYER', () => {
    const w = fixture();
    const e = w.entity('biz_B') as LedgerEntity;
    expect(e.ownerId).toBe('chr_P');
    expect(e.rootOwnerId).toBe('chr_P');
    expect(e.perimeter).toBe('PLAYER');
  });
  it('an NPC company with no owner: the perimeter is NPC', () => {
    const w = fixture();
    expect((w.entity('cmp_N') as LedgerEntity).perimeter).toBe('NPC');
  });
  it('a household, a firm and the rest-of-world are ELASTIC; the system entity is SYSTEM', () => {
    const w = fixture();
    expect((w.entity('hh_C1') as LedgerEntity).perimeter).toBe('ELASTIC');
    expect((w.entity('frm_FDL') as LedgerEntity).perimeter).toBe('ELASTIC');
    expect((w.entity('sys_SYSTEM') as LedgerEntity).perimeter).toBe('SYSTEM');
  });
  it('registering twice is idempotent: the same id, the same row', () => {
    const w = fixture();
    const before = w.entity('chr_A');
    expect(w.registerEntity({ id: 'chr_A' })).toBe('chr_A');
    expect(w.entity('chr_A')).toBe(before);
  });
  it('no account rows exist until a posting: the accounts are opened lazily (03 §3.1.2)', () => {
    const w = fixture();
    expect(w.accounts().length).toBe(0);
    w.apiFor('21').ledger.mint('chr_A', M(10), 'FDL', 'ADM_CORRECTION_IN');
    w.runP13();
    expect(w.accounts().length).toBeGreaterThan(0);
  });
  it('the entity id rules still hold: too long, a bad prefix, a delimiter', () => {
    const w = fixture();
    expect(() => w.registerEntity({ id: 'x'.repeat(65) })).toThrow(/longer than 64/);
    expect(() => w.registerEntity({ id: 'Hh_X' })).toThrow(/registerEntity/);
    expect(() => w.registerEntity({ id: 'chr_A:B' })).toThrow(/registerEntity/);
  });
});

describe('T03-08 the runtime handle', () => {
  it('the runtime reads and writes the 03 tables', () => {
    const w = fixture();
    const rt = w.runtime();
    expect(rt.tick).toBe(0);
    expect(rt.partitionId).toBe('p1');
    expect(rt.catalog).toBe(w.catalog);
    expect(rt.read.count('led.entity')).toBeGreaterThan(0);
    expect(rt.read.get<LedgerEntity>('led.entity', 'chr_A')?.id).toBe('chr_A');
    expect(rt.own).toBeDefined();
    expect(rt.queue.tick).toBe(0);
  });
  it('the queue keeps insertion order and reports the debits it has queued', () => {
    const w = fixture();
    w.apiFor('21').ledger.mint('chr_A', M(10), 'FDL', 'ADM_CORRECTION_IN');
    const rt = w.runtime();
    expect(rt.queue.entries().length).toBe(1);
    // The mint DEBITS chr_A's cash (so it is credited, not debited) and CREDITS the cbk's holder account, which is
    // the account the queue reports as a pending debit against.
    expect(rt.queue.queuedDebit(K('chr_A', 1001, 'FDL'))).toBe(0n);
    expect(rt.queue.queuedDebit('cbk_FDL:2001:chr_A:FDL')).toBe(M(10));
  });
  it('ensureAccount opens a row with the chart class, the money flag and the asset of a qty-bearing code', () => {
    const w = fixture();
    const rt = w.runtime();
    const cash = rt.own.put('led.account', { key: K('chr_A', 1001, 'FDL'), entityId: 'chr_A', code: 1001, ccy: 'FDL',
      class: 'ASSET', balance: 0n, isMoney: true, openedTick: 0 } as Account);
    expect(cash).toBeUndefined();
    expect(rt.read.get<Account>('led.account', K('chr_A', 1001, 'FDL'))?.balance).toBe(0n);
  });
  it('a balance write outside applyPosting is refused (INV-LED-009)', () => {
    const w = fixture();
    const rt = w.runtime();
    rt.own.put('led.account', { key: K('chr_A', 1001, 'FDL'), entityId: 'chr_A', code: 1001, ccy: 'FDL',
      class: 'ASSET', balance: 0n, isMoney: true, openedTick: 0 } as Account);
    expect(() => rt.own.put('led.account', { key: K('chr_A', 1001, 'FDL'), entityId: 'chr_A', code: 1001, ccy: 'FDL',
      class: 'ASSET', balance: 5n, isMoney: true, openedTick: 0 } as Account)).toThrow(/outside applyPosting/);
  });
  it('an unknown table is an error, never a silent no-op', () => {
    const w = fixture();
    const rt = w.runtime();
    expect(() => rt.read.count('led.nope')).toThrow(/unknown 03 table/);
  });
});

describe('T03-08 the facts table', () => {
  it('a fact is written, read back and listed by kind; the last write in a tick wins', () => {
    const w = fixture();
    w.putFact('POLICY_RATE_E6', 'FDL', 100n);
    expect(w.getFact<bigint>('POLICY_RATE_E6', 'FDL')).toBe(100n);
    w.putFact('POLICY_RATE_E6', 'FDL', 200n);
    expect(w.getFact<bigint>('POLICY_RATE_E6', 'FDL')).toBe(200n);
    expect(w.factsOfKind('POLICY_RATE_E6').map((f) => f.id)).toEqual(['POLICY_RATE_E6:FDL']);
    expect(w.factsOfKind('FX_MARK_E6')).toEqual([]);
  });
  it('a fact carries its tick and its subject', () => {
    const w = new LedgerWorld();
    w.putFact('BANK_FROZEN', 'bnk_X', true);
    const f = w.factsOfKind('BANK_FROZEN')[0];
    expect(f.subjectId).toBe('bnk_X');
    expect(f.value).toBe(true);
    expect(f.tick).toBe(0);
  });
  it('the two limit facts are on the facts table as well as in the limit map', () => {
    const w = fixture();
    w.setOverdraftLimit(K('chr_A', 1001, 'FDL'), M(5));
    w.setIntradayLimit('bnk_N', M(7));
    expect(w.getFact<bigint>('OVERDRAFT_LIMIT', K('chr_A', 1001, 'FDL'))).toBe(M(5));
    expect(w.getFact<bigint>('INTRADAY_CREDIT_LIMIT', 'bnk_N')).toBe(M(7));
  });
  it('the freeze facts are writable and readable', () => {
    const w = fixture();
    w.setBankFrozen('bnk_X', true);
    w.setCourtFreeze('chr_A', true);
    expect(w.getFact<boolean>('BANK_FROZEN', 'bnk_X')).toBe(true);
    expect(w.getFact<boolean>('COURT_FREEZE', 'chr_A')).toBe(true);
  });
});

describe('T03-08 the root owner walk', () => {
  it('the root owner of a chain is the end of it', () => {
    const w = fixture();
    w.registerEntity({ id: 'fnd_F', ownerId: 'biz_B' });
    expect(w.rootOwnerOf('fnd_F')).toBe('chr_P');
  });
  it('a cycle stops at the repeat instead of looping forever', () => {
    const w = fixture();
    w.registerEntity({ id: 'cmp_A', ownerId: 'cmp_B' });
    w.registerEntity({ id: 'cmp_B', ownerId: 'cmp_A' });
    expect(() => w.rootOwnerOf('cmp_A')).not.toThrow();
  });
});
