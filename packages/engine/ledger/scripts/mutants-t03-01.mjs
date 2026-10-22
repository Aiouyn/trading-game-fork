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
//
// ── ISOLATION: THIS HARNESS MUST BE THE ONLY THING TOUCHING THE PACKAGE'S src/ WHILE IT RUNS ────────────────
// This harness MUTATES files under src/ and restores them afterwards. While it runs, the files it touches are
// in a KNOWN-BAD state on purpose. So if ANYTHING ELSE writes to, reverts, or checks out those files while the
// harness is running, the harness measures a tree that is not the tree it thinks it is measuring.
//
// THE SYMPTOMS, both of them real and both of them MISREAD as "the harness is broken":
//
//   1. A mutant is reported SURVIVED when it is not, or reported KILLED for the wrong reason. The mutation is
//      applied to a file that something else then rewrote, so the guarding test ran against the WRONG source.
//   2. THE SELF-TEST ROW REPORTS MISMATCH. This is the SECOND symptom of the same thing, and it is the one that
//      misleads the most: the self-test and the mutant run DISAGREE when the file changed underneath them, so a
//      MISMATCH looks like "the classifier is broken". It is not - it means the tree moved while the harness was
//      reading it. (A genuinely broken classifier is what scripts/mutant-selfcheck.mjs exists to prove: it breaks
//      the classifier on purpose and requires the self-test to FAIL on the broken copy.)
//
// THE TELL: `git status` and `git diff` disagreeing mid-run, or a file's SHA-256 changing while you watch it.
// A number that changes between two runs of the SAME code on the SAME head is not a flaky number - it is a
// CORRUPTED one. Do not report it as a defect in the code under test; find the other process.
//
// IN CI THIS IS AUTOMATIC: a fresh checkout, one job, one matrix entry per package, nothing else running.
// LOCALLY IT IS NOT, and that is where the false readings come from. Before running this harness locally:
//   * run it in a tree where nothing else is working (ONE SESSION PER WORKTREE), and
//   * run it to completion - do not pipe it into `head`/`tail`, and do not let a tool timeout kill it.
// A run that IS killed can no longer poison the next one: the original bytes of the file being mutated are
// journalled under node_modules/.cache BEFORE the mutation is written, and the next run restores them and says
// so before it measures anything. See THE JOURNAL AND THE PRISTINE CHECK below (QA's F-4).
//
// The rule this harness enforces on ITSELF is the same one, one level up: the CI step that runs the harness
// (scripts/engine-check.mjs) must be the only thing touching that package's src/ while it runs.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
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

// ── THE JOURNAL AND THE PRISTINE CHECK: A KILLED RUN MUST NOT POISON THE NEXT ONE (QA F-4) ──────────────────────
// A `finally` cannot run when the process is KILLED. QA hit this for real: an interrupted probe left
// src/accounts.ts MUTATED, and the next run then reported "SETUP FAILED (pattern not found)" for M23 - a
// misleading setup failure instead of a loud one, and a live failure mode for a cancelled or timed-out CI job.
// Two independent guards:
//   (1) THE JOURNAL (survives SIGKILL, a timeout, a power cut). The original BYTES of a file are written to a
//       journal in the git-ignored cache dir BEFORE the mutation is written, and the journal is deleted only
//       after the file is restored and compared byte-for-byte. A run that finds a journal is running on a
//       poisoned tree: it restores the file from the journal, says so LOUDLY, and only then measures anything.
//   (2) THE PRISTINE CHECK (catches a leftover with no journal, and a local edit). If git is available, every
//       file the mutant list mutates must be identical to HEAD before the first mutation. A dirty src file is
//       either a leftover or a deliberate edit; either way a mutation test of it measures the wrong thing, and
//       the restore would silently keep whatever it found. Refuse, and name the file.
const JOURNAL_DIR = join(PKG, 'node_modules', '.cache', 't03-01-mutant-journal');
/** The files this run writes to. */
const MUTATED_FILES = [...new Set(MUTANTS.map((m) => m.file))];

/** Restore every file a killed run left mutated. Returns the file names it restored. */
function recoverInterrupted() {
  if (!existsSync(JOURNAL_DIR)) return [];
  const restored = [];
  for (const entry of readdirSync(JOURNAL_DIR)) {
    const journalPath = join(JOURNAL_DIR, entry);
    const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
    const path = join(PKG, journal.file);
    const bytes = Buffer.from(journal.bytes, 'base64');
    writeFileSync(path, bytes);
    if (!readFileSync(path).equals(bytes)) throw new Error(`the interrupted run's file could not be restored: ${journal.file}`);
    rmSync(journalPath, { force: true });
    restored.push(journal.file);
  }
  return restored;
}

/**
 * `{ checked: false }` when there is no git to ask (the journal still covers a killed run).
 * `{ checked: true, dirty }` otherwise, where `dirty` names the files that differ from HEAD.
 */
function pristineCheck() {
  const dirty = [];
  for (const file of MUTATED_FILES) {
    const r = spawnSync('git', ['-C', PKG, 'diff', '--quiet', 'HEAD', '--', file], { encoding: 'utf8' });
    if (r.error !== undefined || r.status === null || (r.status !== 0 && r.status !== 1)) return { checked: false, dirty: [] };
    if (r.status === 1) dirty.push(file);
  }
  return { checked: true, dirty };
}

/** The mutation currently applied, if any: restored by the `finally` below AND by a signal handler. */
let inFlight = null;
function restoreInFlight({ announce = false } = {}) {
  if (inFlight === null) return false;
  const { path, originalBytes, journal } = inFlight;
  writeFileSync(path, originalBytes);
  rmSync(journal, { force: true });
  inFlight = null;
  if (announce) console.log(`\n!!! restored ${path} (the tree is not left mutated)`);
  return true;
}
// SIGINT/SIGTERM cannot be handled after SIGKILL, which is why the journal exists; these make the ordinary
// Ctrl-C and `kill` cases quiet instead of leaving a warning for the next run.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => { restoreInFlight({ announce: true }); process.exit(130); });
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
  // THE JOURNAL GOES DOWN BEFORE THE MUTATION DOES, so there is no window in which a kill leaves a mutated
  // file with nothing to restore it from.
  mkdirSync(JOURNAL_DIR, { recursive: true });
  const journal = join(JOURNAL_DIR, `${m.file.replace(/[\\/]/g, '__')}.json`);
  writeFileSync(journal, JSON.stringify({ file: m.file, bytes: originalBytes.toString('base64') }));
  inFlight = { path, originalBytes, journal };
  try {
    writeFileSync(path, original.slice(0, at) + m.to + original.slice(at + m.from.length));
    return { result: body() };
  } finally {
    restoreInFlight();
    if (!readFileSync(path).equals(originalBytes)) throw new Error(`the file was not restored byte-for-byte: ${m.file}`);
  }
}

// ── THE SCORING LAYER ───────────────────────────────────────────────────────────────────────────────────────
// The classifier above says what ONE run was. This says what the RUN SET was, and whether the harness may exit 0.
// It is a separate layer because it fails separately: QA's F-3 measured a copy whose scoring counted a
// SETUP_FAILED as a KILL, and it still printed "10 of 10" and exited 0, because only the classifier was ever
// exercised. A setup failure means NOTHING WAS MEASURED, so it can never be a kill; an empty run set and an
// unknown verdict are failures too, for exactly the same reason.
/**
 * @param {string[]} verdicts one verdict per mutant
 * @returns {{counts: {killed:number, survived:number, spawnErrors:number, runnerErrors:number, noTestsRan:number, fileFailed:number, setupFailed:number}, exitCode: number}}
 */
function score(verdicts) {
  const counts = { killed: 0, survived: 0, spawnErrors: 0, runnerErrors: 0, noTestsRan: 0, fileFailed: 0, setupFailed: 0 };
  for (const v of verdicts) {
    switch (v) {
      case 'KILLED': counts.killed++; break;
      case 'SURVIVED': counts.survived++; break;
      case 'SPAWN_ERROR': counts.spawnErrors++; break;
      case 'NO_TESTS_RAN': counts.noTestsRan++; break;
      case 'FILE_FAILED': counts.fileFailed++; break;
      case 'RUNNER_ERROR': counts.runnerErrors++; break;
      case 'SETUP_FAILED': counts.setupFailed++; break;
      default: counts.runnerErrors++; break;   // an unknown verdict is not a pass either
    }
  }
  const exitCode = verdicts.length > 0 && counts.killed === verdicts.length ? 0 : 1;
  return { counts, exitCode };
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
/** A mutation whose pattern is not in the file: the SETUP fails, so nothing is measured. The seventh verdict. */
const NO_SUCH_PATTERN = {
  name: 'a mutant whose pattern is absent (the setup fails)',
  file: 'src/accounts.ts',
  from: '// THIS PATTERN CANNOT EXIST IN src/accounts.ts: the SETUP_FAILED self-test row',
  to: 'x',
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
  { case: 'a mutation whose pattern is absent (the setup failed)', expected: 'SETUP_FAILED',
    run: () => runMutationCase(NO_SUCH_PATTERN, 'test/accountKey.test.ts') },
];

// ── the scoring self-test: what a RUN SET means, not what one run was (QA F-3) ───────────────────────────────
// Every row is a real call to `score`, the function the mutant loop itself uses, so a scoring copy that counts a
// setup failure as a kill - the exact copy QA measured passing the old self-test 10/10 - fails HERE.
// `killed` is asserted where a wrong COUNT would still produce the right exit code (the SETUP_FAILED row is the
// one that matters: a setup failure counted as a kill is how QA's copy exited 0).
const SCORING_ROWS = [
  { case: 'two KILLED (the only passing run set)', verdicts: ['KILLED', 'KILLED'], expected: 0, killed: 2 },
  { case: 'one SURVIVED', verdicts: ['KILLED', 'SURVIVED'], expected: 1, killed: 1 },
  { case: 'one SETUP_FAILED (nothing was measured)', verdicts: ['KILLED', 'SETUP_FAILED'], expected: 1, killed: 1 },
  { case: 'one SPAWN_ERROR', verdicts: ['KILLED', 'SPAWN_ERROR'], expected: 1, killed: 1 },
  { case: 'one NO_TESTS_RAN', verdicts: ['KILLED', 'NO_TESTS_RAN'], expected: 1, killed: 1 },
  { case: 'one FILE_FAILED', verdicts: ['KILLED', 'FILE_FAILED'], expected: 1, killed: 1 },
  { case: 'one RUNNER_ERROR', verdicts: ['KILLED', 'RUNNER_ERROR'], expected: 1, killed: 1 },
  { case: 'an unknown verdict (it must never pass)', verdicts: ['KILLED', 'SOMETHING_NEW'], expected: 1, killed: 1 },
  { case: 'an EMPTY run set (nothing ran at all)', verdicts: [], expected: 1, killed: 0 },
];

console.log('=== T03-01 mutants: each must be KILLED by the test that guards it ===');
console.log(`--- runner: ${process.execPath} ${VITEST_ENTRY ?? '(not found)'} run <test file>`);
const pad = (s, n) => String(s).padEnd(n);

// A run that starts on a poisoned tree must HEAL IT AND SAY SO before it measures anything (QA's F-4).
const restored = recoverInterrupted();
if (restored.length > 0) {
  console.log('');
  console.log('!!! A PREVIOUS RUN WAS INTERRUPTED AND LEFT A MUTATED FILE BEHIND.');
  for (const f of restored) console.log(`!!! restored ${f} from the journal: the tree is what that run started with.`);
  console.log('!!! This run measures the RESTORED tree. If you wanted the interrupted run\'s numbers, run it again.');
  console.log('');
}

const pristine = pristineCheck();
if (pristine.dirty.length > 0) {
  console.log('');
  console.log('REFUSING TO RUN: these files differ from HEAD, so a mutation test of them would measure the wrong tree:');
  for (const f of pristine.dirty) console.log(`  M ${f}`);
  console.log('That is either a leftover mutation from an interrupted run or a deliberate edit. Either way it cannot');
  console.log('be mutation-tested: restore it first (git checkout -- packages/engine/ledger/src) and check that');
  console.log('`git status --porcelain` is empty. A deliberate edit is its author\'s to revert, not this harness\'s.');
  process.exitCode = 1;
} else {
  main();
}

/**
 * The self-test, then the mutants. Split out of the top level so the pristine check can refuse to measure at all
 * without an immediate `process.exit`, which would truncate the table this run exists to print.
 */
function main() {
  let selfFailures = 0;
  console.log('--- self-test: the CLASSIFIER (what ONE run was) ---');
  console.log(`${pad('case', 58)}${pad('expected', 15)}${pad('measured', 15)}${pad('ranAtAll', 9)}verdict`);
  writeFixtures();
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

  console.log('');
  console.log('--- self-test: the SCORING LAYER (what a RUN SET was - a setup failure is not a kill) ---');
  console.log(`${pad('case', 58)}${pad('expected exit', 15)}${pad('measured exit', 15)}ok`);
  for (const row of SCORING_ROWS) {
    const s = score(row.verdicts);
    const ok = s.exitCode === row.expected && (row.killed === undefined || s.counts.killed === row.killed);
    if (!ok) selfFailures++;
    console.log(`${pad(row.case, 58)}${pad(row.expected, 15)}${pad(s.exitCode, 15)}${ok ? 'ok' : 'MISMATCH'}`);
  }

  const totalCases = SELFTEST_ROWS.length + SCORING_ROWS.length;
  console.log('');
  console.log(`--- self-test: ${totalCases - selfFailures} of ${totalCases} cases measured as expected ---`);
  if (selfFailures > 0) {
    console.log('SELFTEST FAILED: the harness misclassifies a known case, so its kill count proves nothing.');
    console.log('');
    console.log('  BEFORE YOU FILE A DEFECT AGAINST THIS HARNESS, READ THIS.');
    console.log('  A MISMATCH row has TWO causes, and the second one is far more common than it looks:');
    console.log('    (a) the classifier or the scoring really is broken - which is what scripts/mutant-selfcheck.mjs');
    console.log('        exists to prove, by breaking each LAYER on purpose (the classifier, and the scoring that');
    console.log('        decides whether a run set may exit 0) and requiring this self-test to FAIL on each copy;');
    console.log('    (b) THE TREE MOVED UNDERNEATH THE HARNESS. This harness mutates files under src/ and restores');
    console.log('        them, so anything else that writes to, reverts or checks out those files while it runs');
    console.log('        makes the self-test and the mutant run disagree. The tell is `git status` and `git diff`');
    console.log('        disagreeing mid-run, or a file\'s SHA-256 changing while you watch it.');
    console.log('  A number that changes between two runs of the SAME code on the SAME head is not a flaky number -');
    console.log('  it is a CORRUPTED one. Check the tree first: run this harness in a tree where nothing else is');
    console.log('  working, and make sure `git status --porcelain` is empty before and after.');
    // process.exitCode, not process.exit(): an immediate exit can truncate the pending stdout write, which would
    // hide the very table the failure is about.
    process.exitCode = 1;
    return;
  }

  const verdicts = [];
  for (const m of MUTANTS) {
    const run = withMutation(m, () => runVitest(['run', m.tests]));
    if (run.setup !== undefined) { console.log(run.setup); verdicts.push('SETUP_FAILED'); continue; }
    const { verdict, detail } = run.result;
    verdicts.push(verdict);
    if (verdict === 'KILLED') console.log(`KILLED    ${m.name}`);
    else if (verdict === 'SURVIVED') console.log(`SURVIVED  ${m.name}   <-- the test does not guard this`);
    else if (verdict === 'SPAWN_ERROR') console.log(`SPAWN ERROR  ${m.name}   <-- the runner never started: ${detail}`);
    else if (verdict === 'NO_TESTS_RAN') console.log(`NO TESTS RAN  ${m.name}   <-- the mutant broke the module, not the test: ${detail}`);
    else if (verdict === 'FILE_FAILED') console.log(`FILE FAILED  ${m.name}   <-- the mutant broke the file, not the test: ${detail}`);
    else console.log(`RUNNER ERROR  ${m.name}   <-- the runner reported no failing test: ${detail}`);
  }
  // The scoring layer decides the exit code, and it is the same function the self-test above exercises.
  const { counts, exitCode } = score(verdicts);
  console.log(`\n=== mutants killed: ${counts.killed}   mutants survived: ${counts.survived}   spawn errors: ${counts.spawnErrors}   no tests ran: ${counts.noTestsRan}   file failed: ${counts.fileFailed}   runner errors: ${counts.runnerErrors}   setup failed: ${counts.setupFailed} ===`);
  if (counts.killed !== MUTANTS.length) console.log(`=== NOT every mutant was killed: ${MUTANTS.length - counts.killed} of ${MUTANTS.length} are unaccounted for ===`);
  process.exitCode = exitCode;
}
