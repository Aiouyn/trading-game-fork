// T10A-12 mutant proof: apply each committed copy of the shipped `role` column to the REAL module,
// run the test that is supposed to guard it, and require that test to FAIL. A test that survives a
// mutation of the thing it guards is not a test.
//
// WHY THIS EXISTS (fork PR #19, QA findings F-1 and F-3). The PR's central claim is that the
// district role is DERIVED, not copied from the shipped `role` column of district-flags.json. The
// claim cannot be checked behaviourally: the derivation and the column agree on all 105 districts,
// so a copy returns the same 105 values and every behavioural test passes with it in place. The
// source-level scan in test/placement/role-column-scan.ts is the only backstop, so its coverage has
// to be MEASURED, not asserted. Two ways the previous attempt failed to do that:
//   F-1  the scan was a line regex that only knew `.role` and `role:`; QA's copy
//        `const { role } = ...` compiled, ran, and was invisible to it.
//   F-3  one "mutant" (R19) was the untouched derivation plus an unrelated `{ role: 'CBD' }`
//        literal: it never read a row and was satisfied by construction.
// So every mutant here is applied to src/placement/classify.ts and must (a) leave the behavioural
// test PASSING - that is what makes a copy invisible to behaviour - and (b) make the full test file
// FAIL, because the source scan rejects it. Both halves are measured for each mutant.
//
// THE KILL PREDICATE. A kill is NOT "the process exited non-zero". A kill is "the runner ran the
// tests and its OWN summary reports failing tests". Six outcomes are distinguished, only one is a
// kill:
//
//   KILLED        the runner ran the tests and its summary reports "Tests N failed"
//   SURVIVED      the runner ran the tests and at least one PASSED (zero passes = nothing observed)
//   NO_TESTS_RAN  the runner collected no test at all ("Tests no tests"): the mutant broke the MODULE
//   FILE_FAILED   a test FILE failed but no test reported a failure: the mutant broke the FILE
//   RUNNER_ERROR  the runner started but produced no usable summary (a broken config, a crash)
//   SPAWN_ERROR   the runner never started at all (no entry point, the spawn failed, it was killed)
//
// Two rules that keep the count honest:
//   - the summary is stripped of ANSI before it is matched, because vitest puts the colour codes
//     BETWEEN the word "Tests" and the word "failed";
//   - "Tests no tests" is checked BEFORE "failed", because a mutant that breaks an import prints
//     "Test Files 1 failed" AND "Tests no tests", and that is a broken module, not a kill.
//
// The self-test below proves the classifier on known-bad AND known-good inputs before any mutant is
// scored, and the F-1 control proves the extension was NECESSARY: the old regex is run over the
// committed mutant text and must find NOTHING in the three shapes it used to miss.
//
// Usage: node scripts/mutants-t10a-12-role.mjs   (paths resolve from this file, so cwd does not matter)
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/** The package root (packages/citygen), found by walking up to the nearest package.json. */
const PKG = (() => {
  let dir = fileURLToPath(new URL('.', import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = join(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return fileURLToPath(new URL('..', import.meta.url)); // the fallback: scripts/ is one level down
})();

const SOURCE = 'src/placement/classify.ts';
const TEST_FILE = 'test/placement/classify.test.ts';
/** The behavioural test alone: a copy must pass it (that is why the source scan is needed). */
const BEHAVIOUR_FILTER = 'the MODULE derives the same roles';
/** The committed mutant text, shared with the test so the two cannot drift apart. */
const DATA = JSON.parse(readFileSync(join(PKG, 'test', 'placement', 'role-copy-mutants.json'), 'utf8'));

/** The vitest entry point: never a `.bin` shim, which is an `sh` script on Windows. */
const VITEST_ENTRY = [
  join(PKG, 'node_modules', 'vitest', 'vitest.mjs'),
  join(PKG, '..', '..', '..', 'node_modules', 'vitest', 'vitest.mjs'), // the repo-root install
].find((p) => existsSync(p));

/** The self-test fixtures live in a cache dir under node_modules: git-ignored and eslint-ignored. */
const FIXTURES = join(PKG, 'node_modules', '.cache', 't10a-12-role-mutant-fixtures');

/** vitest colourises its summary; the ANSI codes sit between "Tests" and "failed". */
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

/**
 * Run vitest and classify the run. This verdict is the ONLY thing that decides a kill.
 * @param {string[]} args the vitest arguments
 * @param {{runnerEntry?: string, command?: string, cwd?: string}} opts
 * @returns {{verdict: string, ranAtAll: boolean, detail: string}}
 */
function runVitest(args, { runnerEntry = VITEST_ENTRY, command = process.execPath, cwd = PKG } = {}) {
  if (runnerEntry === undefined || !existsSync(runnerEntry)) {
    return { verdict: 'SPAWN_ERROR', ranAtAll: false, detail: `there is no runner at ${runnerEntry ?? '(vitest is not installed)'}` };
  }
  const r = spawnSync(command, [runnerEntry, ...args], { encoding: 'utf8', cwd });
  if (r.error !== undefined) return { verdict: 'SPAWN_ERROR', ranAtAll: false, detail: `the spawn failed: ${r.error.message}` };
  if (r.status === null) return { verdict: 'SPAWN_ERROR', ranAtAll: false, detail: 'the runner was killed before it could report' };
  const out = stripAnsi(`${r.stdout ?? ''}${r.stderr ?? ''}`);
  const ranAtAll = /RUN\s+v\d/.test(out);
  const noTests = /Tests\s+no tests/.test(out);
  const testsFailed = /Tests\s+\d+\s+failed/.test(out);
  const filesFailed = /Test Files\s+\d+\s+failed/.test(out);
  if (!ranAtAll) return { verdict: 'RUNNER_ERROR', ranAtAll: false, detail: 'the runner never printed its banner: it did not start' };
  if (noTests) return { verdict: 'NO_TESTS_RAN', ranAtAll: true, detail: 'the runner collected no test: the module did not load' };
  if (testsFailed) {
    if (r.status !== 0) return { verdict: 'KILLED', ranAtAll: true, detail: '' };
    return { verdict: 'RUNNER_ERROR', ranAtAll: true, detail: 'the runner reported failing tests but exited 0' };
  }
  if (filesFailed) return { verdict: 'FILE_FAILED', ranAtAll: true, detail: 'a test file failed but no test reported a failure: the file did not load' };
  if (/No test files found/.test(out)) {
    return { verdict: 'NO_TESTS_RAN', ranAtAll: true, detail: 'the runner found no test file: nothing was exercised' };
  }
  if (r.status === 0) {
    const passed = /Tests\s+(?:.*\|\s*)?(\d+)\s+passed/.exec(out);
    if (passed !== null && Number(passed[1]) > 0) return { verdict: 'SURVIVED', ranAtAll: true, detail: '' };
    return { verdict: 'NO_TESTS_RAN', ranAtAll: true, detail: 'the runner exited 0 without passing a test: nothing was exercised' };
  }
  return { verdict: 'RUNNER_ERROR', ranAtAll: true, detail: `the runner exited ${r.status} without reporting a failing test` };
}

/** The original module text, read once so every mutant is built from the same bytes. */
const ORIGINAL_SOURCE = readFileSync(join(PKG, SOURCE), 'utf8');

/** Apply a mutation, run `body`, and restore the file byte-for-byte (the restore is checked). */
function withMutation(m, body) {
  const path = join(PKG, SOURCE);
  const originalBytes = readFileSync(path);
  const original = originalBytes.toString('utf8');
  const at = original.indexOf(m.from);
  if (at < 0) return { setup: `SETUP FAILED (pattern not found): ${m.id}` };
  if (original.indexOf(m.from, at + 1) >= 0) return { setup: `SETUP FAILED (pattern not unique): ${m.id}` };
  writeFileSync(path, original.slice(0, at) + m.to + original.slice(at + m.from.length));
  try {
    return { result: body() };
  } finally {
    writeFileSync(path, originalBytes);
    if (!readFileSync(path).equals(originalBytes)) throw new Error(`the file was not restored byte-for-byte: ${SOURCE}`);
  }
}

/**
 * Build the mutation for one committed mutant: insert its read and its guard after the anchor line.
 * The anchor must be ONE line of the module, or the mutant would be inserted in two places.
 */
const MUTANTS = DATA.mutants.map((m) => {
  const anchorLines = ORIGINAL_SOURCE.split('\n').filter((line) => line.includes(DATA.anchor));
  if (anchorLines.length !== 1) throw new Error(`the anchor "${DATA.anchor}" appears ${anchorLines.length} times in ${SOURCE}`);
  const line = anchorLines[0];
  return { id: m.id, shape: m.shape, from: line, to: [line, `  ${m.read}`, `  ${m.guard}`].join('\n') };
});

/**
 * THE OLD CHECK, kept only as the F-1 control: a code line that reads `.role` or declares `role:`.
 * Run over the committed mutants it must find NOTHING in R19..R21, which is exactly why the scan
 * had to become a parser. If it ever starts matching them the control is meaningless and fails.
 */
const legacyHits = (src) =>
  src.split('\n').filter((text) => {
    const t = text.trim();
    if (t === '' || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return false;
    return /\.role\b/.test(text) || /\brole\s*:/.test(text);
  });

// ── the self-test fixtures: each is a REAL file that makes the runner fail in one specific way ──
const FIXTURE_SOURCES = {
  'vitest.config.ts': "import { defineConfig } from 'vitest/config';\nexport default defineConfig({ test: { include: ['*.test.ts'], environment: 'node' } });\n",
  'fail.test.ts': "import { describe, expect, it } from 'vitest';\ndescribe('self-test', () => { it('fails on purpose', () => { expect(1).toBe(2); }); });\n",
  'import-error.test.ts': "import { describe, expect, it } from 'vitest';\nimport { missing } from './this-module-does-not-exist';\ndescribe('self-test', () => { it('never runs', () => { expect(missing).toBeDefined(); }); });\n",
  'syntax-error.test.ts': "import { describe, expect, it } from 'vitest';\ndescribe('self-test', () => { it('never parses', () => { const x = ; }); });\n",
  'broken.config.ts': "import { defineConfig } from 'vitest/config';\nthis is not valid javascript ((((\n",
  'pass.test.ts': "import { describe, expect, it } from 'vitest';\ndescribe('self-test', () => { it('passes', () => { expect(1).toBe(1); }); });\n",
};
function writeFixtures() {
  rmSync(FIXTURES, { recursive: true, force: true });
  mkdirSync(FIXTURES, { recursive: true });
  for (const [name, body] of Object.entries(FIXTURE_SOURCES)) writeFileSync(join(FIXTURES, name), body);
}
function removeFixtures() {
  rmSync(FIXTURES, { recursive: true, force: true });
}

const R17 = MUTANTS.find((m) => m.id === 'R17');
if (R17 === undefined) {
  console.log('SETUP FAILED: R17 is not in the committed mutant list');
  process.exit(1);
}

/** A change no test can or should catch: a comment appended to an import line. */
const COMMENT_ONLY = {
  id: 'a comment-only change',
  from: "import { readFileSync } from 'node:fs';",
  to: "import { readFileSync } from 'node:fs'; // SELFTEST",
};

const SELFTEST_ROWS = [
  { case: 'the unmutated baseline (the runner really ran)', expected: 'SURVIVED',
    run: () => runVitest(['run', TEST_FILE]) },
  { case: 'a comment-only change (uncatchable by construction)', expected: 'SURVIVED',
    run: () => { const run = withMutation(COMMENT_ONLY, () => runVitest(['run', TEST_FILE])); return run.setup !== undefined ? { verdict: 'SETUP_FAILED', ranAtAll: false, detail: run.setup } : run.result; } },
  { case: 'R17: a real copy behind the source scan', expected: 'KILLED',
    run: () => { const run = withMutation(R17, () => runVitest(['run', TEST_FILE])); return run.setup !== undefined ? { verdict: 'SETUP_FAILED', ranAtAll: false, detail: run.setup } : run.result; } },
  { case: 'an assertion that genuinely fails', expected: 'KILLED',
    run: () => runVitest(['run', '--root', FIXTURES, '--config', join(FIXTURES, 'vitest.config.ts'), 'fail.test.ts']) },
  { case: 'an import error (the module does not load)', expected: 'NO_TESTS_RAN',
    run: () => runVitest(['run', '--root', FIXTURES, '--config', join(FIXTURES, 'vitest.config.ts'), 'import-error.test.ts']) },
  { case: 'a syntax error (the file does not parse)', expected: 'NO_TESTS_RAN',
    run: () => runVitest(['run', '--root', FIXTURES, '--config', join(FIXTURES, 'vitest.config.ts'), 'syntax-error.test.ts']) },
  { case: 'a broken file alongside a passing one (the false kill)', expected: 'FILE_FAILED',
    run: () => runVitest(['run', '--root', FIXTURES, '--config', join(FIXTURES, 'vitest.config.ts'), 'import-error.test.ts', 'pass.test.ts']) },
  { case: 'a broken runner config (the runner never starts)', expected: 'RUNNER_ERROR',
    run: () => runVitest(['run', '--config', join(FIXTURES, 'broken.config.ts'), TEST_FILE]) },
  { case: 'a runner path that does not exist (the spawn cannot start)', expected: 'SPAWN_ERROR',
    run: () => runVitest(['run', TEST_FILE], { runnerEntry: join(FIXTURES, 'no-such-runner.mjs') }) },
  { case: 'a command that cannot be spawned at all', expected: 'SPAWN_ERROR',
    run: () => runVitest(['run', TEST_FILE], { command: join(FIXTURES, 'no-such-command') }) },
  { case: 'a -t filter that matches no test title (24 skipped, exit 0)', expected: 'NO_TESTS_RAN',
    run: () => runVitest(['run', TEST_FILE, '-t', 'no test has this title']) },
  { case: 'a test path with no test file (passWithNoTests, exit 0)', expected: 'NO_TESTS_RAN',
    run: () => runVitest(['run', 'test/placement/no-such.test.ts']) },
];

const pad = (s, n) => String(s).padEnd(n);
console.log('=== T10A-12 role mutants: every committed copy must be KILLED by the source scan ===');
console.log(`--- runner: ${process.execPath} ${VITEST_ENTRY ?? '(not found)'} run <test file>`);

// ── the F-1 control: the extension was necessary, measured on the committed mutant text ─────────
// R17 and R18 carry `.role` (and R17 a `role:` key), so the old regex sees them. R19..R21 are the
// shapes it was blind to: a shorthand binding, a bracket key and a computed key. If this control
// ever reports a hit there, the scan's extension is no longer what catches them.
console.log('--- F-1 control: the OLD regex (`.role` / `role:`) over the committed mutants ---');
const LEGACY_EXPECTED = { R17: true, R18: true, R19: false, R20: false, R21: false };
let controlFailures = 0;
for (const m of MUTANTS) {
  const mutantSource = ORIGINAL_SOURCE.replace(m.from, m.to);
  const hits = legacyHits(mutantSource).length;
  const expected = LEGACY_EXPECTED[m.id];
  const ok = expected ? hits > 0 : hits === 0;
  if (!ok) controlFailures++;
  console.log(`${pad(m.id, 6)}${pad(expected ? 'must match' : 'must NOT match', 16)}hits: ${pad(hits, 4)}${ok ? 'ok' : 'CONTROL CHANGED'}${ok ? '' : '   <-- the F-1 control no longer describes the hole'}`);
}
if (controlFailures > 0) {
  console.log('F-1 CONTROL FAILED: the old-regex baseline changed, so the "the regex could not see these shapes" claim is stale.');
}

// ── the self-test: the harness must classify each of these cases correctly ──────────────────────
console.log('--- self-test: the harness must classify each case below correctly (every row is a real run) ---');
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
if (selfFailures > 0 || controlFailures > 0) {
  console.log('SELFTEST FAILED: the harness misclassifies a known case, so its kill count proves nothing.');
  // process.exitCode, not process.exit(): an immediate exit can truncate the pending stdout write.
  process.exitCode = 1;
} else {
  let killed = 0;
  let survived = 0;
  let bad = 0;
  console.log('--- mutants: each must SURVIVE behaviour (it is a copy) and be KILLED by the full file ---');
  console.log(`${pad('mutant', 6)}${pad('behaviour only', 18)}${pad('full test file', 18)}verdict`);
  for (const m of MUTANTS) {
    const behaviour = withMutation(m, () => runVitest(['run', TEST_FILE, '-t', BEHAVIOUR_FILTER]));
    const full = withMutation(m, () => runVitest(['run', TEST_FILE]));
    if (behaviour.setup !== undefined || full.setup !== undefined) {
      console.log(behaviour.setup ?? full.setup);
      bad++;
      continue;
    }
    const b = behaviour.result;
    const f = full.result;
    const ok = b.verdict === 'SURVIVED' && f.verdict === 'KILLED';
    if (ok) killed++;
    else bad++;
    console.log(`${pad(m.id, 6)}${pad(b.verdict, 18)}${pad(f.verdict, 18)}${ok ? 'ok' : 'NOT A KILL'}   (${m.shape})`);
    if (!ok) console.log(`    <-- behaviour: ${b.detail || b.verdict}; full file: ${f.detail || f.verdict}`);
    if (f.verdict !== 'KILLED') survived++;
  }
  console.log(`\n=== mutants: ${killed} of ${MUTANTS.length} SURVIVED behaviour and were KILLED by the source scan; ${survived} not killed; ${bad} bad ===`);
  // THE MEASUREMENT SUMMARY that scripts/engine-check.mjs reads (requireMeasurement): an exit 0 is only
  // accepted when the harness also prints this line with at least one kill, because a refusal, a deleted
  // body and a harness renamed out of the glob all exit 0 having measured nothing. Printed here, after
  // every mutant is scored, in the same shape the ledger harness uses.
  console.log(`=== mutants killed: ${killed}   mutants survived: ${survived}   not a clean kill: ${bad} ===`);
  if (bad !== 0) process.exitCode = 1;
}
