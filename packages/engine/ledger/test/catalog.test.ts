import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CBK_CREDIT_CODES, CBK_UNWIND_CODES, CLASS_TEMPLATES, FLOW_CLASSES, LEDGER_EXTENSION_CODES, ReasonCatalog, SPEC_COUNTS_03,
  type CodeRow, type FlowClass,
} from '../src';
import { CATALOG_SEED } from '../src/catalog-data';

const row = (code: string, cls: CodeRow['cls'], owner: number, t: CodeRow['allowedTemplates']): CodeRow =>
  ({ code, cls, owner, cf: 'OP', allowedTemplates: t, descriptionKey: code });

const histogram = (classes: readonly FlowClass[]): Record<FlowClass, number> =>
  Object.fromEntries(FLOW_CLASSES.map((k) => [k, classes.filter((c) => c === k).length])) as Record<FlowClass, number>;
const sum = (h: Readonly<Record<FlowClass, number>>): number => FLOW_CLASSES.reduce((n, k) => n + h[k], 0);

/** E-81 point 2: the canonical catalog.csv is the sole record of a row's `v3_source` (the spec table it came from). */
const canonicalCatalog = (() => {
  const text = readFileSync(new URL('../../../../export/ledger-ref/catalog.csv', import.meta.url), 'utf8');
  const rows: string[][] = []; let line: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; }
    else if (c === '"') quoted = true;
    else if (c === ',') { line.push(cell); cell = ''; }
    else if (c === '\n') { line.push(cell); rows.push(line); line = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || line.length) { line.push(cell); rows.push(line); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
})();
const seedCodes = new Set(CATALOG_SEED.map((r) => r.code));

describe('reason-code catalog (T03-02..05, INV-LED-002, Q-2)', () => {
  const cat = new ReasonCatalog();
  it('AC-03-ER81-COUNTS: the live histogram equals the histogram of the seed + the E-5 extension codes, never a literal', () => {
    expect(cat.countByClass()).toEqual(histogram([...CATALOG_SEED.map((r) => r.cls), ...LEDGER_EXTENSION_CODES.map((r) => r.cls)]));
    expect(cat.all().length).toBe(CATALOG_SEED.length + LEDGER_EXTENSION_CODES.length);
  });
  it('AC-03-ER81-COUNTS: the §3.4-origin subset is the pinned spec number, and the live total is that subset plus the registered rows', () => {
    const origin = canonicalCatalog.filter((r) => seedCodes.has(r.code) && r.v3_source.startsWith('03-LEDGER-AND-ACCOUNTING.md'));
    expect(histogram(origin.map((r) => r.class as FlowClass))).toEqual(SPEC_COUNTS_03);
    const originCodes = new Set(origin.map((r) => r.code));
    const registered = [...CATALOG_SEED.filter((r) => !originCodes.has(r.code)), ...LEDGER_EXTENSION_CODES];
    const registeredLive = cat.all().filter((r) => !originCodes.has(r.code));
    expect(cat.all().length).toBe(sum(SPEC_COUNTS_03) + registeredLive.length);
    expect(registeredLive.length).toBe(registered.length);
  });
  it('03#1 / p10 books.ts port: every code has exactly one class and only templates of that class; no default class', () => {
    for (const r of cat.all()) {
      expect(FLOW_CLASSES).toContain(r.cls);
      expect(r.allowedTemplates.length).toBeGreaterThan(0);
      for (const t of r.allowedTemplates) expect(CLASS_TEMPLATES[r.cls]).toContain(t);
    }
    expect(cat.get('NOT_A_CODE')).toBeUndefined();
  });
  it('PD-12: CONFLICT_* are canonical, OPS_* are aliases only', () => {
    expect(cat.get('CONFLICT_RANSOM')?.cls).toBe('TRANSFER');
    expect(cat.get('CONFLICT_CASH_LOOT')?.cls).toBe('TRANSFER');
    expect(cat.get('OPS_RANSOM')).toBeUndefined();
    expect(cat.resolveAlias('OPS_RANSOM')).toBe('CONFLICT_RANSOM');
    expect(cat.resolveAlias('OPS_LOOT_CASH')).toBe('CONFLICT_CASH_LOOT');
  });
  it('errata E-3: exactly the 5 + 5 central-bank credit codes sit on CB_CREDIT / CB_CREDIT_UNWIND', () => {
    expect(cat.all().filter((r) => r.allowedTemplates.includes('CB_CREDIT')).map((r) => r.code).sort()).toEqual([...CBK_CREDIT_CODES]);
    expect(cat.all().filter((r) => r.allowedTemplates.includes('CB_CREDIT_UNWIND')).map((r) => r.code).sort()).toEqual([...CBK_UNWIND_CODES]);
    expect(cat.get('CBK_PROFIT_REMITTANCE')?.cls).toBe('TRANSFER');
    expect(cat.get('CBK_IOR_P')?.cls).toBe('FAUCET');
    expect(cat.get('CBK_DEPOSIT_INTEREST_P')?.cls).toBe('FAUCET');
  });
  it('spec test 3 (Δ1, PD-1): prefix must match class; duplicate -> NAME_TAKEN', () => {
    const c = new ReasonCatalog();
    expect(c.registerReasonCodes(5, 'TRANSFER', [row('SINK_X', 'TRANSFER', 5, ['PAY'])])).toEqual(['SINK_X: PREFIX_CLASS_MISMATCH']);
    expect(c.registerReasonCodes(5, 'TRANSFER', [row('FAUCET_X', 'TRANSFER', 5, ['PAY'])])).toEqual(['FAUCET_X: PREFIX_CLASS_MISMATCH']);
    expect(c.registerReasonCodes(5, 'SINK', [row('SINK_X', 'SINK', 5, ['BURN'])])).toEqual([]);
    expect(c.get('SINK_X')?.cls).toBe('SINK');
    expect(Object.isFrozen(c.get('SINK_X'))).toBe(true); // E-12 layer 1(iii): registered rows are frozen too
    expect(c.registerReasonCodes(5, 'SINK', [row('SINK_X', 'SINK', 5, ['BURN'])])).toEqual(['SINK_X: NAME_TAKEN']);
    expect(c.registerReasonCodes(5, 'TRANSFER', [row('MKT_TRADE', 'TRANSFER', 5, ['SWAP_ASSET'])])).toEqual(['MKT_TRADE: NAME_TAKEN']);
    expect(c.registerReasonCodes(12, 'TRANSFER', [row('OPS_RANSOM', 'TRANSFER', 12, ['PAY'])])).toEqual(['OPS_RANSOM: NAME_TAKEN']);
  });
  it('registerReasonCodes rejects owner, class and template mismatches and is frozen after start', () => {
    const c = new ReasonCatalog();
    expect(c.registerReasonCodes(4, 'TRANSFER', [row('GOV_X', 'TRANSFER', 9, ['PAY'])])).toEqual(['GOV_X: OWNER_MISMATCH']);
    expect(c.registerReasonCodes(4, 'TRANSFER', [row('GOV_X', 'SINK', 4, ['BURN'])])).toEqual(['GOV_X: CLASS_MISMATCH']);
    expect(c.registerReasonCodes(4, 'FAUCET', [row('GOV_X', 'FAUCET', 4, ['PAY'])])).toEqual(['GOV_X: TEMPLATE_CLASS_MISMATCH']);
    expect(c.registerReasonCodes(4, 'TRANSFER', [row('GOV_X', 'TRANSFER', 4, ['PAY']), row('SINK_Y', 'TRANSFER', 4, ['PAY'])])).toEqual(['SINK_Y: PREFIX_CLASS_MISMATCH']);
    expect(c.get('GOV_X')).toBeUndefined(); // all-or-nothing
    c.freeze();
    expect(c.registerReasonCodes(4, 'TRANSFER', [row('GOV_X', 'TRANSFER', 4, ['PAY'])])).toEqual(['GOV_X: CATALOG_FROZEN']);
  });
  it('the catalog is per instance (no process-global registry)', () => {
    const a = new ReasonCatalog(); const b = new ReasonCatalog();
    a.registerReasonCodes(5, 'SINK', [row('SINK_ONLY_A', 'SINK', 5, ['BURN'])]);
    expect(b.get('SINK_ONLY_A')).toBeUndefined();
  });
});
