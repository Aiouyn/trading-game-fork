// T03-01: the chart of accounts (03 §3.2) — completeness, class, contra, money flag, kind restriction, marketable codes.
import { describe, expect, it } from 'vitest';
import {
  CHART, chartEntry, classOfCode, isMoneyCode, kindMayUse, MARKETABLE_CODES, ENTITY_KIND_ORDER,
  type AccountClass, type EntityKind,
} from '../src';

/**
 * Every code of 03 §3.2, transcribed from the spec tables (the 1xxx/2xxx/3xxx tables, the 4xxx/5xxx/6xxx
 * income, expense and income-tax lists, and the 9xxx memo list). The chart must hold exactly these codes:
 * a missing code and an invented code both fail the count assertion.
 */
const SPEC_CODES: readonly number[] = [
  // 1xxx assets
  1001, 1002, 1003, 1009, 1010, 1050, 1060, 1070, 1100, 1110, 1120, 1130, 1140, 1150, 1160, 1190,
  1200, 1210, 1220, 1221, 1230, 1300, 1301, 1302, 1303, 1304, 1305, 1306, 1307, 1309,
  1500, 1510, 1520, 1530, 1540, 1541, 1542, 1560, 1570, 1580, 1600,
  1700, 1710, 1720, 1730, 1740, 1800, 1810, 1830, 1839, 1840, 1850, 1860, 1870, 1880,
  1900, 1909, 1910, 1950, 1999,
  // 2xxx liabilities
  2001, 2002, 2003, 2100, 2110, 2120, 2130, 2140, 2150, 2160,
  2200, 2201, 2202, 2203, 2206, 2300, 2310, 2320, 2330,
  2400, 2410, 2420, 2430, 2500, 2510, 2520, 2530, 2540, 2550, 2560, 2570, 2580, 2590, 2600,
  2700, 2710, 2800, 2900, 2909, 2950, 2990, 2999,
  // 3xxx equity
  3100, 3110, 3150, 3200, 3300, 3400, 3500, 3600, 3700, 3800, 3900, 3990,
  // 4xxx income
  4000, 4010, 4020, 4030, 4040, 4050, 4060, 4070, 4080, 4090, 4100, 4110, 4120, 4130, 4140, 4150, 4190, 4900,
  // 5xxx expenses
  5000, 5010, 5020, 5030, 5040, 5050, 5060, 5070, 5080, 5090, 5100, 5110, 5120, 5130, 5140, 5150, 5160, 5170, 5180, 5190,
  5200, 5210, 5220, 5230, 5240, 5250, 5260, 5270, 5280, 5900,
  // 6xxx income taxes
  6000, 6010, 6020,
  // 9xxx memo and system
  9100, 9110, 9200, 9300, 9900, 9910,
];

describe('T03-01 chart of accounts (03 §3.2)', () => {
  it('holds exactly the codes of 03 §3.2 (the count is asserted, so a missing or invented code fails)', () => {
    expect(CHART.size).toBe(SPEC_CODES.length);
    for (const code of SPEC_CODES) expect(chartEntry(code), `code ${code} missing`).toBeDefined();
    // no code outside the spec list
    const spec = new Set(SPEC_CODES.map((c) => String(c).padStart(4, '0')));
    expect(CHART.keys().filter((k) => !spec.has(k))).toEqual([]);
    // the keys are the 4-digit codes, in byte order
    expect(CHART.keys()[0]).toBe('1001');
    expect(CHART.keys()[CHART.size - 1]).toBe('9910');
  });

  it('class of every code is by its first digit (1 ASSET, 2 LIABILITY, 3 EQUITY, 4 INCOME, 5/6 EXPENSE, 9 MEMO)', () => {
    const byDigit: Record<string, AccountClass> = {
      '1': 'ASSET', '2': 'LIABILITY', '3': 'EQUITY', '4': 'INCOME', '5': 'EXPENSE', '6': 'EXPENSE', '9': 'MEMO',
    };
    for (const code of SPEC_CODES) {
      const e = chartEntry(code)!;
      expect(e.cls, `class of ${code}`).toBe(byDigit[String(code)[0]!]);
      expect(classOfCode(code)).toBe(e.cls);
    }
    // a code outside the chart has no class; the rule is by first digit (a 7xxx code has none)
    expect(classOfCode(7000)).toBeUndefined();
    expect(classOfCode(8000)).toBeUndefined();
  });

  it('the contra accounts are 1309, 1839 and 3150 (contra flag, class unchanged)', () => {
    expect(chartEntry(1309)!.contra).toBe(true);
    expect(chartEntry(1309)!.cls).toBe('ASSET');
    expect(chartEntry(1839)!.contra).toBe(true);
    expect(chartEntry(1839)!.cls).toBe('ASSET');
    expect(chartEntry(3150)!.contra).toBe(true);
    expect(chartEntry(3150)!.cls).toBe('EQUITY');
    // no other code is contra
    const contra = SPEC_CODES.filter((c) => chartEntry(c)!.contra);
    expect(contra.sort((a, b) => a - b)).toEqual([1309, 1839, 3150]);
  });

  it('money flag: 1001/1002/1003/1010 for every kind; 1009 only for the elastic kinds (hh, frm, row)', () => {
    expect(isMoneyCode(1009, 'hh')).toBe(true);
    expect(isMoneyCode(1009, 'frm')).toBe(true);
    expect(isMoneyCode(1009, 'row')).toBe(true);
    expect(isMoneyCode(1009, 'chr')).toBe(false);
    expect(isMoneyCode(1009, 'bnk')).toBe(false);
    for (const code of [1001, 1002, 1003, 1010]) {
      for (const kind of ENTITY_KIND_ORDER) expect(isMoneyCode(code, kind), `${code}/${kind}`).toBe(true);
    }
    // a non-money code is never money
    expect(isMoneyCode(1500, 'chr')).toBe(false);
    expect(isMoneyCode(2100, 'bnk')).toBe(false);
    expect(isMoneyCode(9999, 'chr')).toBe(false);
  });

  it('kind restriction: 2100 is a bank account, 1003 a government one, 1009 an elastic one', () => {
    expect(kindMayUse(2100, 'chr')).toBe(false);
    expect(kindMayUse(2100, 'bnk')).toBe(true);
    expect(kindMayUse(1003, 'gov')).toBe(true);
    expect(kindMayUse(1003, 'chr')).toBe(false);
    expect(kindMayUse(1009, 'hh')).toBe(true);
    expect(kindMayUse(1009, 'chr')).toBe(false);
    expect(kindMayUse(2001, 'cbk')).toBe(true);
    expect(kindMayUse(2001, 'bnk')).toBe(false);
    expect(kindMayUse(3990, 'sys')).toBe(true);
    expect(kindMayUse(3990, 'chr')).toBe(false);
    // an 'ALL' code is open to every kind
    for (const kind of ENTITY_KIND_ORDER) expect(kindMayUse(1001, kind)).toBe(true);
  });

  it('MARKETABLE_CODES holds the 03 §3.3.8 positions and excludes 1220 OWNED', () => {
    expect(MARKETABLE_CODES.includes(1220)).toBe(false);
    for (const code of [1500, 1510, 1520, 1530, 1540, 1541, 1542, 1560, 1600, 2600, 1210, 1870]) {
      expect(MARKETABLE_CODES, `marketable ${code}`).toContain(code);
    }
    expect(MARKETABLE_CODES.length).toBe(12);
    // every marketable code is in the chart and carries a quantity
    for (const code of MARKETABLE_CODES) {
      expect(chartEntry(code)).toBeDefined();
      expect(chartEntry(code)!.qtyBearing, `qty-bearing ${code}`).toBe(true);
    }
  });

  it('the suspense accounts 1999 and 2999 must be zero at P13; nothing else is', () => {
    const mustZero = SPEC_CODES.filter((c) => chartEntry(c)!.mustBeZeroAtP13);
    expect(mustZero.sort((a, b) => a - b)).toEqual([1999, 2999]);
  });

  it('the consolidated-only accounts are 3500 and 3600', () => {
    const consolidated = SPEC_CODES.filter((c) => chartEntry(c)!.consolidatedOnly);
    expect(consolidated.sort((a, b) => a - b)).toEqual([3500, 3600]);
  });

  it('the row-level isMoney flag is set for 1001, 1002, 1003, 1010 and for the virtual 1009 only', () => {
    const moneyRows = SPEC_CODES.filter((c) => chartEntry(c)!.isMoney).sort((a, b) => a - b);
    expect(moneyRows).toEqual([1001, 1002, 1003, 1009, 1010]);
  });

  it('every chart row carries a name and a sub meaning (null when the code has no sub)', () => {
    for (const code of SPEC_CODES) {
      const e = chartEntry(code)!;
      expect(e.name.length, `name of ${code}`).toBeGreaterThan(0);
      expect(typeof e.subMeaning === 'string' || e.subMeaning === null).toBe(true);
      expect(e.code).toBe(code);
    }
  });

  it('the qty-bearing codes are the ones that hold a quantity (03 §3.2 + the issuer accounts of I8)', () => {
    const qty = SPEC_CODES.filter((c) => chartEntry(c)!.qtyBearing).sort((a, b) => a - b);
    expect(qty).toEqual([
      1200, 1210, 1220, 1221, 1309, 1500, 1510, 1520, 1530, 1540, 1541, 1542, 1560, 1570, 1580, 1600, 1700, 1710, 1720, 1740,
      1800, 1810, 1830, 1839, 1840, 1850, 1860, 1870, 1880, 2300, 2310, 2320, 2330, 2600, 3100, 3150, 9100, 9110,
    ]);
  });

  it('the entity kinds of the chart are the 03 §2.1 kinds', () => {
    const kinds = new Set<EntityKind>();
    for (const code of SPEC_CODES) {
      const k = chartEntry(code)!.kinds;
      if (k !== 'ALL') for (const x of k) kinds.add(x);
    }
    for (const kind of kinds) expect(ENTITY_KIND_ORDER).toContain(kind);
  });
});
