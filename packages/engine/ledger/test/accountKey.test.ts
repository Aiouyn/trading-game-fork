// T03-01: the account-key codec (03 §2.2) — format, parsing, round-trip.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { accountKey, parseAccountKey, entityOfKey } from '../src';

describe('T03-01 account key (03 §2.2)', () => {
  it('formats "<entityId>:<code>[:<sub>]:<ccy>" with the code in 4 digits', () => {
    expect(accountKey('chr_A', 1500, 'FDL', 'ast_EQ_HALC')).toBe('chr_A:1500:ast_EQ_HALC:FDL');
    expect(accountKey('chr_A', 1500, 'FDL')).toBe('chr_A:1500:FDL');
    expect(accountKey('sys_SYSTEM', 9900, 'EUN', 'P1->P2')).toBe('sys_SYSTEM:9900:P1->P2:EUN');
    expect(accountKey('chr_A', 1001, 'FDL')).toBe('chr_A:1001:FDL');
    // the code is zero-padded to 4 digits, so 1001 and 9900 are 4 digits and a smaller code keeps its width
    expect(accountKey('chr_A', 1001, 'FDL')).toContain(':1001:');
  });

  it('parses the entity, the code, the sub and the ccy', () => {
    expect(parseAccountKey('chr_A:1500:ast_EQ_HALC:FDL')).toEqual({ entityId: 'chr_A', code: 1500, sub: 'ast_EQ_HALC', ccy: 'FDL' });
    expect(parseAccountKey('chr_A:1500:FDL')).toEqual({ entityId: 'chr_A', code: 1500, sub: undefined, ccy: 'FDL' });
  });

  it('a sub with colons round-trips (RESTRICTED:51840:AD_GRANT)', () => {
    const sub = 'RESTRICTED:51840:AD_GRANT';
    const key = accountKey('chr_A', 1001, 'FDL', sub);
    expect(key).toBe('chr_A:1001:RESTRICTED:51840:AD_GRANT:FDL');
    const p = parseAccountKey(key);
    expect(p?.sub).toBe(sub);
    expect(p?.entityId).toBe('chr_A');
    expect(p?.code).toBe(1001);
    expect(p?.ccy).toBe('FDL');
  });

  it('a sub with the interpartition separator round-trips (P1->P2)', () => {
    const key = accountKey('sys_SYSTEM', 9900, 'EUN', 'P1->P2');
    expect(parseAccountKey(key)?.sub).toBe('P1->P2');
    expect(parseAccountKey(key)?.entityId).toBe('sys_SYSTEM');
  });

  it('entityOfKey returns the entity of the key', () => {
    expect(entityOfKey('chr_A:1500:ast_EQ_HALC:FDL')).toBe('chr_A');
    expect(entityOfKey('sys_SYSTEM:9900:P1->P2:EUN')).toBe('sys_SYSTEM');
  });

  it('rejects a malformed key (no ccy, no code, an unknown entity kind)', () => {
    expect(parseAccountKey('chr_A:1500')).toBeUndefined();
    expect(parseAccountKey('chr_A:1500:XXX')).toBeUndefined();       // not a currency
    expect(parseAccountKey('chr_A:abc:FDL')).toBeUndefined();        // not a code
    expect(parseAccountKey('xxx_A:1500:FDL')).toBeUndefined();       // unknown entity kind
    expect(parseAccountKey('chr_A:150:FDL')).toBeUndefined();         // the code is not 4 digits
  });

  it('round-trips for every random id, code, ccy and sub (fast-check)', () => {
    fc.assert(fc.property(
      fc.constantFrom('chr_A', 'cmp_X', 'bnk_Y', 'sys_SYSTEM', 'hh_C1', 'gov_FDL', 'row_WORLD', 'frm_EUN', 'npc_S'),
      fc.integer({ min: 1001, max: 9910 }),
      fc.constantFrom('FDL' as const, 'EUN' as const, 'PYN' as const, 'NKR' as const, 'SRL' as const),
      fc.option(fc.string({ minLength: 1, maxLength: 12 }).filter((s) => !s.includes(':')), { nil: undefined }),
      (entityId, code, ccy, sub) => {
        const key = accountKey(entityId, code, ccy, sub);
        const p = parseAccountKey(key);
        expect(p, key).toBeDefined();
        expect(p?.entityId).toBe(entityId);
        expect(p?.code).toBe(code);
        expect(p?.ccy).toBe(ccy);
        expect(p?.sub).toBe(sub);
      },
    ), { numRuns: 200, seed: 20261021 });
  });

  it('round-trips for random subs that contain colons (fast-check)', () => {
    fc.assert(fc.property(
      fc.constantFrom('chr_A', 'sys_SYSTEM', 'bnk_Y'),
      fc.integer({ min: 1001, max: 9910 }),
      fc.constantFrom('FDL' as const, 'EUN' as const),
      fc.string({ minLength: 1, maxLength: 16 }).filter((s) => s !== '' && !s.endsWith(':') && !s.startsWith(':')),
      (entityId, code, ccy, sub) => {
        const key = accountKey(entityId, code, ccy, sub);
        expect(parseAccountKey(key)?.sub, key).toBe(sub);
      },
    ), { numRuns: 200, seed: 20261022 });
  });
});
