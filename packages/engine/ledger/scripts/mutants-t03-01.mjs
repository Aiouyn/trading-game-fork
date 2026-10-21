// T03-01 mutant proof: apply a mutation to the ledger source, run the tests that guard it, and require them to FAIL.
// A test that survives a mutation of the thing it guards is not a test. Each mutant below is a one-line change to
// the implementation the new tests are supposed to guard; the file is restored byte-for-byte after each run.
//
// Usage: node scripts/mutants-t03-01.mjs   (from packages/engine/ledger)
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const MUTANTS = [
  // ── the chart of accounts (03 §3.2) ──
  { name: 'M1  chart: 1009 loses its ELASTIC money flag (isMoneyCode(1009,"hh") -> false)', file: 'src/accounts.ts',
    from: "[1009, 'Elastic money (virtual)', null, ELASTIC_KINDS, 'ELASTIC', '']",
    to: "[1009, 'Elastic money (virtual)', null, ELASTIC_KINDS, 'NO', '']", tests: 'test/chart.test.ts' },
  { name: 'M2  chart: 2100 loses its bnk kind restriction (kindMayUse(2100,"chr") -> true)', file: 'src/accounts.ts',
    from: "[2100, 'Customer deposits', 'holderId (term deposits: holderId:termId)', ['bnk'], 'NO', '']",
    to: "[2100, 'Customer deposits', 'holderId (term deposits: holderId:termId)', 'ALL', 'NO', '']", tests: 'test/chart.test.ts' },
  { name: 'M3  chart: 1309 loses its contra flag', file: 'src/accounts.ts',
    from: "[1309, 'Allowance for credit losses (contra-asset)', 'portfolioId', 'ALL', 'NO', 'qC']",
    to: "[1309, 'Allowance for credit losses (contra-asset)', 'portfolioId', 'ALL', 'NO', 'q']", tests: 'test/chart.test.ts' },
  { name: 'M4  chart: 1999 loses its mustBeZeroAtP13 flag', file: 'src/accounts.ts',
    from: "[1999, 'Suspense', null, 'ALL', 'NO', 'Z']", to: "[1999, 'Suspense', null, 'ALL', 'NO', '']", tests: 'test/chart.test.ts' },
  { name: 'M5  chart: a code is dropped (4010 Rental income removed)', file: 'src/accounts.ts',
    from: "[4010, 'Rental income', 'segment, counterparty class or asset', 'ALL', 'NO', ''],\n  ",
    to: '', tests: 'test/chart.test.ts' },
  { name: 'M6  chart: an invented code is added (4901)', file: 'src/accounts.ts',
    from: "[4900, 'System burn income', 'segment, counterparty class or asset', ['sys'], 'NO', ''],",
    to: "[4900, 'System burn income', 'segment, counterparty class or asset', ['sys'], 'NO', ''],\n  [4901, 'Invented', null, 'ALL', 'NO', ''],",
    tests: 'test/chart.test.ts' },
  { name: 'M7  chart: 3500 loses its consolidatedOnly flag', file: 'src/accounts.ts',
    from: "[3500, 'FX translation reserve', null, 'ALL', 'NO', 'X']", to: "[3500, 'FX translation reserve', null, 'ALL', 'NO', '']",
    tests: 'test/chart.test.ts' },
  { name: 'M8  chart: 1200 loses its qtyBearing flag', file: 'src/accounts.ts',
    from: "[1200, 'Inventory (goods)', 'sku', 'ALL', 'NO', 'q']", to: "[1200, 'Inventory (goods)', 'sku', 'ALL', 'NO', '']",
    tests: 'test/chart.test.ts' },
  { name: 'M9  chart: the class of 3300 is flipped to INCOME (first-digit rule broken)', file: 'src/accounts.ts',
    from: "return (['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE', 'EXPENSE', undefined, undefined, 'MEMO'] as const)[d - 1];",
    to: "return (['ASSET', 'LIABILITY', 'INCOME', 'INCOME', 'EXPENSE', 'EXPENSE', undefined, undefined, 'MEMO'] as const)[d - 1];",
    tests: 'test/chart.test.ts' },
  // ── the account-key codec (03 §2.2) ──
  { name: 'M10 accountKey: the code is not zero-padded to 4 digits', file: 'src/accounts.ts',
    from: "const c = String(code).padStart(4, '0');", to: "const c = String(code);", tests: 'test/accountKey.test.ts' },
  { name: 'M11 accountKey: the sub is dropped from the key', file: 'src/accounts.ts',
    from: "return sub === undefined ? `${entityId}:${c}:${ccy}` : `${entityId}:${c}:${sub}:${ccy}`;",
    to: "return `${entityId}:${c}:${ccy}`;", tests: 'test/accountKey.test.ts' },
  { name: 'M12 parseAccountKey: the sub is not re-joined (a sub with colons is truncated)', file: 'src/accounts.ts',
    from: "const sub = parts.length > 3 ? parts.slice(2, -1).join(':') : undefined;",
    to: "const sub = parts.length > 3 ? parts[2] : undefined;", tests: 'test/accountKey.test.ts' },
  { name: 'M13 parseAccountKey: an unknown entity kind is accepted', file: 'src/accounts.ts',
    from: "if (!isCcy(ccy) || !/^\\d{4}$/.test(parts[1]) || parts[0] === '' || kindOfId(parts[0]) === undefined) return undefined;",
    to: "if (!isCcy(ccy) || !/^\\d{4}$/.test(parts[1]) || parts[0] === '') return undefined;", tests: 'test/accountKey.test.ts' },
  { name: 'M14 parseAccountKey: the ccy is not checked (any last segment is accepted)', file: 'src/accounts.ts',
    from: "if (!isCcy(ccy) || !/^\\d{4}$/.test(parts[1]) || parts[0] === '' || kindOfId(parts[0]) === undefined) return undefined;",
    to: "if (!/^\\d{4}$/.test(parts[1]) || parts[0] === '' || kindOfId(parts[0]) === undefined) return undefined;",
    tests: 'test/accountKey.test.ts' },
  // ── the 03 §5 event schemas ──
  { name: 'M15 events: moneyString accepts a number (the money-as-string rule is lost)', file: 'src/events.ts',
    from: "export const moneyString = z.string().regex(/^-?\\d+$/);",
    to: "export const moneyString = z.union([z.string().regex(/^-?\\d+$/), z.number().int()]);", tests: 'test/events.test.ts' },
  { name: 'M16 events: a payload with an unknown key is accepted (strict -> loose)', file: 'src/events.ts',
    from: "'ledger.entry.committed': z.strictObject({", to: "'ledger.entry.committed': z.object({", tests: 'test/events.test.ts' },
  { name: 'M17 events: the visibility of ledger.tax.audit.finding flips from SEALED to PRIVATE', file: 'src/events.ts',
    from: "'ledger.tax.audit.finding': 'SEALED',", to: "'ledger.tax.audit.finding': 'PRIVATE',", tests: 'test/events.test.ts' },
  { name: 'M18 events: stab.lever.changed accepts any lever string', file: 'src/events.ts',
    from: "'stab.lever.changed': z.strictObject({ lever: z.enum(LEVERS), from: z.number(), to: z.number() }),",
    to: "'stab.lever.changed': z.strictObject({ lever: z.string(), from: z.number(), to: z.number() }),", tests: 'test/events.test.ts' },
  { name: 'M19 events: the daily report accepts a partial currency map', file: 'src/events.ts',
    from: 'M0: z.record(ccyEnum, moneyString),', to: 'M0: z.record(z.string(), moneyString),', tests: 'test/events.test.ts' },
  { name: 'M20 events: the insolvency recoveries map accepts an unknown rank', file: 'src/events.ts',
    from: "'ledger.insolvency.opened': z.strictObject({\n    caseId: idString, debtorId: idString, procedure: z.enum(PROCEDURES),\n    recoveriesByRank: z.record(z.enum(CLAIM_RANKS), moneyString),\n  }),",
    to: "'ledger.insolvency.opened': z.strictObject({\n    caseId: idString, debtorId: idString, procedure: z.enum(PROCEDURES),\n    recoveriesByRank: z.record(z.string(), moneyString),\n  }),",
    tests: 'test/events.test.ts' },
  { name: 'M21 events: the tax estimate accepts an unknown tax type', file: 'src/events.ts',
    from: 'ytdByType: z.record(z.enum(TAX_TYPES), moneyString),', to: 'ytdByType: z.record(z.string(), moneyString),',
    tests: 'test/events.test.ts' },
  { name: 'M22 events: the entry event accepts an unknown ccy', file: 'src/events.ts',
    from: 'entryId: idString, reason: z.string(), amount: moneyString, ccy: ccyEnum, counterpartyLabel: z.string(),',
    to: 'entryId: idString, reason: z.string(), amount: moneyString, ccy: z.string(), counterpartyLabel: z.string(),',
    tests: 'test/events.test.ts' },
  { name: 'M23 chart: the row-level isMoney flag of 1010 is cleared', file: 'src/accounts.ts',
    from: "[1010, 'Deposits at bank', 'bnkId (term deposits: bnkId:termId)', 'ALL', 'ALL', '']",
    to: "[1010, 'Deposits at bank', 'bnkId (term deposits: bnkId:termId)', 'ALL', 'NO', '']", tests: 'test/chart.test.ts' },
];

const VITEST = 'node_modules/.bin/vitest';
let killed = 0;
let survived = 0;

console.log('=== T03-01 mutants: each must be KILLED by the test that guards it ===');
for (const m of MUTANTS) {
  const original = readFileSync(m.file, 'utf8');
  const at = original.indexOf(m.from);
  if (at < 0) { console.log(`SETUP FAILED (pattern not found): ${m.name}`); survived++; continue; }
  if (original.indexOf(m.from, at + 1) >= 0) { console.log(`SETUP FAILED (pattern not unique): ${m.name}`); survived++; continue; }
  writeFileSync(m.file, original.slice(0, at) + m.to + original.slice(at + m.from.length));
  const r = spawnSync(VITEST, ['run', m.tests], { encoding: 'utf8', shell: true });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const failed = /Tests\s+\d+ failed/.test(out) || /\d+ failed/.test(out) || r.status !== 0;
  writeFileSync(m.file, original);
  if (failed) { console.log(`KILLED    ${m.name}`); killed++; }
  else {
    console.log(`SURVIVED  ${m.name}   <-- the test does not guard this`);
    survived++;
  }
}
console.log(`\n=== mutants killed: ${killed}   mutants survived: ${survived} ===`);
process.exit(survived === 0 ? 0 : 1);
