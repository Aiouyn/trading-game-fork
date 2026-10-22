// T03-01 mutant proof: apply a mutation to the ledger source, run the tests that guard it, and require them to FAIL.
// A test that survives a mutation of the thing it guards is not a test. Each mutant below is a one-line change to
// the implementation the new tests are supposed to guard; the file is restored byte-for-byte after each run.
//
// ── THE KILL PREDICATE ───────────────────────────────────────────────────────────────────────────────────────────
// A kill is NOT "the process exited non-zero". A kill is "the runner ran the guarding tests, and the runner's OWN
// summary reports failing tests". Five outcomes are distinguished, and only one of them is a kill:
//
//   KILLED        the runner ran the guarding tests and its summary reports "Tests N failed"
//   SURVIVED      the runner ran the guarding tests and they passed (the mutant is not guarded)
//   NO_TESTS_RAN  the runner collected no test at all ("Tests no tests"): the mutant broke the MODULE, not the TEST
//   FILE_FAILED   a test FILE failed but no test reported a failure: the mutant broke the FILE, not the TEST
//   RUNNER_ERROR  the runner started but produced no usable summary (a broken config, a crash before collection)
//   SPAWN_ERROR   the runner never started at all (no entry point, the spawn failed, the process was killed)
//
// Two bugs made the previous version of this file report a perfect score while measuring nothing:
//   1. the runner was spawned as `node_modules/.bin/vitest` with `shell: true`. On Windows that is a POSIX `sh` shim
//      which cmd.exe cannot execute, so the spawn exited non-zero and NO TEST EVER RAN;
//   2. the kill test was `/Tests\s+\d+ failed/.test(out) || /\d+ failed/.test(out) || r.status !== 0`, so the
//      non-zero exit of a runner that never started was enough to call every mutant KILLED.
// A detector that never fires is worse than no detector, because it reads as a guard. So the summary is stripped of
// ANSI before it is matched at all (vitest puts the colour codes BETWEEN the word "Tests" and the word "failed",
// which is why the raw summary does not match a plain-text pattern), and the self-test below proves the classifier
// on a known-bad input AND on a known-good one before any mutant is scored.
//
// Usage: node scripts/mutants-t03-01.mjs   (the paths are resolved from this file, so the cwd does not matter)
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

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

// ── the harness itself ───────────────────────────────────────────────────────────────────────────────────────────
// The package root (packages/engine/ledger), resolved by walking up from this file until a package.json is found.
// Resolving it from the file's own location means a copy of this script (the negative control writes one) still
// finds the real package root, instead of computing a root relative to wherever the copy happens to live.
const PKG = (() => {
  let dir = fileURLToPath(new URL('.', import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = join(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return fileURLToPath(new URL('..', import.meta.url));   // the fallback: one level up, as the script is in scripts/
})();
/** The vitest entry point: never a `.bin` shim, which is an `sh` script on Windows and cannot be executed by cmd.exe. */
const VITEST_ENTRY = [
  join(PKG, 'node_modules', 'vitest', 'vitest.mjs'),
  join(PKG, '..', '..', '..', 'node_modules', 'vitest', 'vitest.mjs'),   // the repo-root install
].find((p) => existsSync(p));

/**
 * The self-test fixtures live in a cache dir under node_modules: it is git-ignored and eslint-ignored, so a
 * deliberately broken fixture (a syntax error, a broken config) can never reach the repo's lint, typecheck or tests.
 */
const FIXTURES = join(PKG, 'node_modules', '.cache', 't03-01-mutant-fixtures');

/**
 * vitest colourises its summary, and the ANSI codes sit BETWEEN the word "Tests" and the word "failed".
 * A plain-text pattern therefore matches the stripped summary and NOT the raw one, so the summary is stripped
 * before it is matched at all.
 */
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

/**
 * Run vitest and classify the run. This verdict is the ONLY thing that decides a kill.
 * @param {string[]} args the vitest arguments
 * @param {{runnerEntry?: string, command?: string, cwd?: string}} opts
 * @returns {{verdict: string, ranAtAll: boolean, detail: string}}
 */
function runVitest(args, { runnerEntry = VITEST_ENTRY, command = process.execPath, cwd = PKG } = {}) {
  // A runner that is not there is a spawn that cannot start: nothing was spawned, so nothing can have been killed.
  if (runnerEntry === undefined || !existsSync(runnerEntry)) {
    return { verdict: 'SPAWN_ERROR', ranAtAll: false, detail: `there is no runner at ${runnerEntry ?? '(vitest is not installed)'}` };
  }
  const r = spawnSync(command, [runnerEntry, ...args], { encoding: 'utf8', cwd });
  if (r.error !== undefined) return { verdict: 'SPAWN_ERROR', ranAtAll: false, detail: `the spawn failed: ${r.error.message}` };
  if (r.status === null) return { verdict: 'SPAWN_ERROR', ranAtAll: false, detail: 'the runner was killed before it could report' };
  const out = stripAnsi(`${r.stdout ?? ''}${r.stderr ?? ''}`);
  const ranAtAll = /RUN\s+v\d/.test(out);             // the runner really started
  const noTests = /Tests\s+no tests/.test(out);       // the runner collected no test at all
  const testsFailed = /Tests\s+\d+\s+failed/.test(out);
  const filesFailed = /Test Files\s+\d+\s+failed/.test(out);
  if (!ranAtAll) return { verdict: 'RUNNER_ERROR', ranAtAll: false, detail: 'the runner never printed its banner: it did not start' };
  // "no tests" is checked BEFORE "failed": a mutant that breaks the module's import prints "Test Files 1 failed"
  // AND "Tests no tests", and that is a broken FILE, not a failing test.
  if (noTests) return { verdict: 'NO_TESTS_RAN', ranAtAll: true, detail: 'the runner collected no test: the module did not load' };
  if (testsFailed) {
    if (r.status !== 0) return { verdict: 'KILLED', ranAtAll: true, detail: '' };
    return { verdict: 'RUNNER_ERROR', ranAtAll: true, detail: 'the runner reported failing tests but exited 0' };
  }
  if (filesFailed) return { verdict: 'FILE_FAILED', ranAtAll: true, detail: 'a test file failed but no test reported a failure: the file did not load' };
  if (r.status === 0) return { verdict: 'SURVIVED', ranAtAll: true, detail: '' };
  return { verdict: 'RUNNER_ERROR', ranAtAll: true, detail: `the runner exited ${r.status} without reporting a failing test` };
}

/**
 * Apply a mutation, run `body`, and restore the file byte-for-byte (the restore is checked, not assumed).
 * Returns `{ setup }` when the mutation does not apply (the pattern is missing or not unique).
 */
function withMutation(m, body) {
  const path = join(PKG, m.file);
  const originalBytes = readFileSync(path);
  const original = originalBytes.toString('utf8');
  const at = original.indexOf(m.from);
  if (at < 0) return { setup: `SETUP FAILED (pattern not found): ${m.name}` };
  if (original.indexOf(m.from, at + 1) >= 0) return { setup: `SETUP FAILED (pattern not unique): ${m.name}` };
  writeFileSync(path, original.slice(0, at) + m.to + original.slice(at + m.from.length));
  try {
    return { result: body() };
  } finally {
    writeFileSync(path, originalBytes);
    if (!readFileSync(path).equals(originalBytes)) throw new Error(`the file was not restored byte-for-byte: ${m.file}`);
  }
}

// ── the self-test fixtures ─────────────────────────────────────────────────────────────────────────────────────
// Each fixture is a REAL file that makes the runner fail in one specific way, so the classifier is proven on a
// known-bad input AND on a known-good one. They are written into a git-ignored cache dir and removed afterwards, so
// a deliberately broken source can never reach the repo's lint, typecheck or test run.
const FIXTURE_SOURCES = {
  'vitest.config.ts': "import { defineConfig } from 'vitest/config';\nexport default defineConfig({ test: { include: ['*.test.ts'], environment: 'node' } });\n",
  // an assertion that genuinely fails -> the runner's summary says "Tests 1 failed"
  'fail.test.ts': "import { describe, expect, it } from 'vitest';\ndescribe('self-test', () => { it('fails on purpose', () => { expect(1).toBe(2); }); });\n",
  // an import error -> the file never loads, so the runner says "Tests no tests"
  'import-error.test.ts': "import { describe, expect, it } from 'vitest';\nimport { missing } from './this-module-does-not-exist';\ndescribe('self-test', () => { it('never runs', () => { expect(missing).toBeDefined(); }); });\n",
  // a syntax error -> the file never parses, so the runner says "Tests no tests"
  'syntax-error.test.ts': "import { describe, expect, it } from 'vitest';\ndescribe('self-test', () => { it('never parses', () => { const x = ; }); });\n",
  // a config that cannot be loaded -> the runner never starts
  'broken.config.ts': "import { defineConfig } from 'vitest/config';\nthis is not valid javascript ((((\n",
  // a passing file, so a broken file can be run ALONGSIDE a passing one
  'pass.test.ts': "import { describe, expect, it } from 'vitest';\ndescribe('self-test', () => { it('passes', () => { expect(1).toBe(1); }); });\n",
};
function writeFixtures() {
  rmSync(FIXTURES, { recursive: true, force: true });
  mkdirSync(FIXTURES, { recursive: true });
  for (const [name, body] of Object.entries(FIXTURE_SOURCES)) writeFileSync(join(FIXTURES, name), body);
}
function removeFixtures() { rmSync(FIXTURES, { recursive: true, force: true }); }

// ── the self-test: the harness must classify each of these cases correctly ───────────────────────────────────────
// Every row is a REAL run, not a recorded output. The table prints what the harness actually measured, so a
// misclassification is visible in the log rather than hidden behind a claim. A detector that never fires is worse
// than no detector, because it reads as a guard: each condition here is proven to fire on a known-bad input AND to
// stay quiet on a known-good one.
const M10 = MUTANTS.find((m) => m.name.startsWith('M10'));
if (M10 === undefined) { console.log('SETUP FAILED: M10 is not in the mutant list'); process.exit(1); }
const COMMENT_ONLY = {
  name: 'a comment-only change',
  file: 'src/accounts.ts',
  from: '// 03 §3.2 chart of accounts, the account-key codec and the authored system entity ids (T03-01).',
  to: '// 03 §3.2 chart of accounts, the account-key codec and the authored system entity ids (T03-01). // SELFTEST',
};
/** Run one mutation case: mutate, run the guarding test, restore. */
const runMutationCase = (m, tests) => {
  const run = withMutation(m, () => runVitest(['run', tests]));
  if (run.setup !== undefined) return { verdict: 'SETUP_FAILED', ranAtAll: false, detail: run.setup };
  return run.result;
};

const SELFTEST_ROWS = [
  { case: 'the unmutated baseline (the runner really ran)', expected: 'SURVIVED',
    run: () => runVitest(['run', 'test/accountKey.test.ts']) },
  { case: 'a comment-only change (uncatchable by construction)', expected: 'SURVIVED',
    run: () => runMutationCase(COMMENT_ONLY, 'test/accountKey.test.ts') },
  { case: 'M10: the zero-padding removed, with the new assertion', expected: 'KILLED',
    run: () => runMutationCase(M10, 'test/accountKey.test.ts') },
  { case: 'an assertion that genuinely fails', expected: 'KILLED',
    run: () => runVitest(['run', '--root', FIXTURES, '--config', join(FIXTURES, 'vitest.config.ts'), 'fail.test.ts']) },
  { case: 'an import error (the module does not load)', expected: 'NO_TESTS_RAN',
    run: () => runVitest(['run', '--root', FIXTURES, '--config', join(FIXTURES, 'vitest.config.ts'), 'import-error.test.ts']) },
  { case: 'a syntax error (the file does not parse)', expected: 'NO_TESTS_RAN',
    run: () => runVitest(['run', '--root', FIXTURES, '--config', join(FIXTURES, 'vitest.config.ts'), 'syntax-error.test.ts']) },
  { case: 'a broken file alongside a passing one (the false kill)', expected: 'FILE_FAILED',
    run: () => runVitest(['run', '--root', FIXTURES, '--config', join(FIXTURES, 'vitest.config.ts'), 'import-error.test.ts', 'pass.test.ts']) },
  { case: 'a broken runner config (the runner never starts)', expected: 'RUNNER_ERROR',
    run: () => runVitest(['run', '--config', join(FIXTURES, 'broken.config.ts'), 'test/accountKey.test.ts']) },
  { case: 'a runner path that does not exist (the spawn cannot start)', expected: 'SPAWN_ERROR',
    run: () => runVitest(['run', 'test/accountKey.test.ts'], { runnerEntry: join(FIXTURES, 'no-such-runner.mjs') }) },
  { case: 'a command that cannot be spawned at all', expected: 'SPAWN_ERROR',
    run: () => runVitest(['run', 'test/accountKey.test.ts'], { command: join(FIXTURES, 'no-such-command') }) },
];

let killed = 0;
let survived = 0;
let spawnErrors = 0;
let runnerErrors = 0;
let noTestsRan = 0;
let fileFailed = 0;

console.log('=== T03-01 mutants: each must be KILLED by the test that guards it ===');
console.log(`--- runner: ${process.execPath} ${VITEST_ENTRY ?? '(not found)'} run <test file>`);
console.log('--- self-test: the harness must classify each case below correctly (every row is a real run) ---');
const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('case', 58)}${pad('expected', 15)}${pad('measured', 15)}${pad('ranAtAll', 9)}verdict`);
writeFixtures();
let selfFailures = 0;
try {
  for (const row of SELFTEST_ROWS) {
    const r = row.run();
    const ok = r.verdict === row.expected;
    if (!ok) selfFailures++;
    console.log(`${pad(row.case, 58)}${pad(row.expected, 15)}${pad(r.verdict, 15)}${pad(String(r.ranAtAll), 9)}${ok ? 'ok' : 'MISMATCH'}${r.detail === '' ? '' : `   (${r.detail})`}`);
  }
} finally {
  removeFixtures();
}
console.log(`--- self-test: ${SELFTEST_ROWS.length - selfFailures} of ${SELFTEST_ROWS.length} cases classified as expected ---`);
if (selfFailures > 0) {
  console.log('SELFTEST FAILED: the harness misclassifies a known case, so its kill count proves nothing.');
  // process.exitCode, not process.exit(): an immediate exit can truncate the pending stdout write, which would
  // hide the very table the failure is about.
  process.exitCode = 1;
} else {
  for (const m of MUTANTS) {
    const run = withMutation(m, () => runVitest(['run', m.tests]));
    if (run.setup !== undefined) { console.log(run.setup); survived++; continue; }
    const { verdict, detail } = run.result;
    if (verdict === 'KILLED') { console.log(`KILLED    ${m.name}`); killed++; }
    else if (verdict === 'SURVIVED') {
      console.log(`SURVIVED  ${m.name}   <-- the test does not guard this`);
      survived++;
    } else if (verdict === 'SPAWN_ERROR') {
      console.log(`SPAWN ERROR  ${m.name}   <-- the runner never started: ${detail}`);
      spawnErrors++;
    } else if (verdict === 'NO_TESTS_RAN') {
      console.log(`NO TESTS RAN  ${m.name}   <-- the mutant broke the module, not the test: ${detail}`);
      noTestsRan++;
    } else if (verdict === 'FILE_FAILED') {
      console.log(`FILE FAILED  ${m.name}   <-- the mutant broke the file, not the test: ${detail}`);
      fileFailed++;
    } else {
      console.log(`RUNNER ERROR  ${m.name}   <-- the runner reported no failing test: ${detail}`);
      runnerErrors++;
    }
  }
  console.log(`\n=== mutants killed: ${killed}   mutants survived: ${survived}   spawn errors: ${spawnErrors}   no tests ran: ${noTestsRan}   file failed: ${fileFailed}   runner errors: ${runnerErrors} ===`);
  if (killed !== MUTANTS.length) console.log(`=== NOT every mutant was killed: ${MUTANTS.length - killed} of ${MUTANTS.length} are unaccounted for ===`);
  if (survived !== 0 || spawnErrors !== 0 || runnerErrors !== 0 || noTestsRan !== 0 || fileFailed !== 0) process.exitCode = 1;
}
