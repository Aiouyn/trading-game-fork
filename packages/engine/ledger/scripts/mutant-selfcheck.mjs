// The mutant harness's own negative control: prove that the harness's SELF-TEST is not vacuous.
//
// A detector that never fires is worse than no detector, because it reads as a guard. The harness's self-test claims
// to catch a broken classifier AND a broken scoring layer. This script proves the claim by breaking each layer on
// purpose and showing that the self-test FAILS on each broken copy.
//
// It writes a broken copy of the harness to the git-ignored cache dir (never into the repo), with ONE of the
// FOUR defects below, each broken on its own so each is proven to be caught on its own:
//   1. the kill predicate is the original vacuous one — "a non-zero exit is a kill", whatever the runner printed;
//   2. the runner is the original POSIX `.bin` shim, which cmd.exe cannot execute on Windows, so the spawn exits
//      non-zero and NO TEST EVER RUNS;
//   3. THE SCORING LAYER counts a SETUP_FAILED as a KILL (QA's F-3). This is not a classifier defect at all:
//      with the old self-test this copy printed "10 of 10" and exited 0, because only the classifier was ever
//      exercised. A setup failure means NOTHING WAS MEASURED, so counting it as a kill must fail the self-test.
//   4. THE PRISTINE CHECK is neutered (QA's F-5): `if (r.status === 1) dirty.push(file)` becomes `if (false)`.
//      The self-test CANNOT catch this one — it never reaches the dirty branch — and nothing else does either:
//      QA measured 20/20, 23 killed, exit 0 for that copy on a tree that was NOT HEAD. So this control runs
//      BOTH copies on the same deliberately dirty tree: the SHIPPED harness must REFUSE (exit 1) and measure
//      nothing, and the neutered copy must MEASURE (a self-test table and a kill count). The pair is the
//      mutation test of that one line: if the shipped harness measures, the guard does not bite; if the
//      neutered copy refuses anyway, the refusal comes from somewhere else and the line is not the mechanism.
//
// Defect 4 is the only one that writes inside the repo, so it restores the file in a `finally`, compares it
// BYTE-FOR-BYTE, and asserts that neither that file nor the rest of the tree changed. A negative control that
// leaves a mutated file behind would be an F-4 generator: it must never be one.
//
// Usage: node scripts/mutant-selfcheck.mjs
// Expected: the broken copies print "SELFTEST FAILED" and exit non-zero (defects 1-3), and the copy that lost
// the pristine check is caught by the refusal check (defect 4). A broken copy that PASSES is the bug.
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const PKG = fileURLToPath(new URL('..', import.meta.url));
const CACHE = join(PKG, 'node_modules', '.cache', 't03-01-mutant-fixtures');
const SRC = join(PKG, 'scripts', 'mutants-t03-01.mjs');
/** The harness's journal: a leftover would be drained on the copy's startup, un-dirtying the file below. */
const JOURNAL_DIR = join(PKG, 'node_modules', '.cache', 't03-01-mutant-journal');
/** The file defect 4 dirties. It is one of the files the mutant list mutates, so pristineCheck() checks it. */
const DIRTY_FILE = 'src/accounts.ts';

const VACUOUS_PREDICATE = `  if (noTests) return { verdict: 'NO_TESTS_RAN', ranAtAll: true, detail: 'the runner collected no test: the module did not load' };
  if (testsFailed) {
    if (r.status !== 0) return { verdict: 'KILLED', ranAtAll: true, detail: '' };
    return { verdict: 'RUNNER_ERROR', ranAtAll: true, detail: 'the runner reported failing tests but exited 0' };
  }`;
const VACUOUS_REPLACEMENT = `  if (r.status !== 0) return { verdict: 'KILLED', ranAtAll: true, detail: '' };`;

const REAL_RUNNER = `  join(PKG, 'node_modules', 'vitest', 'vitest.mjs'),
  join(PKG, '..', '..', '..', 'node_modules', 'vitest', 'vitest.mjs'),   // the repo-root install
].find((p) => existsSync(p));`;
const SHIM_RUNNER = `  join(PKG, 'node_modules', '.bin', 'vitest'),
].find((p) => existsSync(p));`;

const REAL_SCORING = `      case 'SETUP_FAILED': counts.setupFailed++; break;`;
const VACUOUS_SCORING = `      case 'SETUP_FAILED': counts.killed++; break;`;

const PRISTINE_GUARD = `    if (r.status === 1) dirty.push(file);`;
const NEUTERED_PRISTINE = `    if (false) dirty.push(file);`;

/** The four defects, each broken on its own. `check` says how that defect is proven to be caught. */
const DEFECTS = [
  { check: 'selftest', name: 'the vacuous kill predicate (a non-zero exit is a kill)', apply: (t) => t.replace(VACUOUS_PREDICATE, VACUOUS_REPLACEMENT), need: VACUOUS_PREDICATE },
  { check: 'selftest', name: 'the POSIX .bin shim (the spawn never starts)', apply: (t) => t.replace(REAL_RUNNER, SHIM_RUNNER), need: REAL_RUNNER },
  { check: 'selftest', name: 'the SCORING counts a SETUP_FAILED as a KILL (nothing was measured)', apply: (t) => t.replace(REAL_SCORING, VACUOUS_SCORING), need: REAL_SCORING },
  { check: 'refusal', name: 'the PRISTINE CHECK is neutered (a dirty tree would be scored green)', apply: (t) => t.replace(PRISTINE_GUARD, NEUTERED_PRISTINE), need: PRISTINE_GUARD },
];

function makeBroken(defect, dst) {
  let text = readFileSync(SRC, 'utf8');
  if (!text.includes(defect.need)) { console.log(`SETUP FAILED: ${defect.name}: the pattern was not found in the harness`); process.exit(1); }
  text = defect.apply(text);
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(dst, text);
}

/** `git status --porcelain`, optionally scoped to one path. null when there is no git to ask. */
function porcelain(path) {
  const args = ['-C', PKG, 'status', '--porcelain'];
  if (path !== undefined) args.push('--', path);
  const r = spawnSync('git', args, { encoding: 'utf8' });
  if (r.error !== undefined || r.status !== 0) return null;
  return r.stdout.trim();
}

/** The journal entries the harness would drain on its next start. 0 is the only clean answer. */
function journalEntries() {
  return existsSync(JOURNAL_DIR) ? readdirSync(JOURNAL_DIR).length : 0;
}

/** Defects 1-3: the harness's own self-test must FAIL on the copy, and the copy must exit non-zero. */
function selfTestOn(broken) {
  const r = spawnSync(process.execPath, [broken], { encoding: 'utf8', cwd: PKG });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  for (const l of out.split(/\r?\n/).filter((l) => l.includes('self-test:') || l.includes('SELFTEST'))) console.log(`    ${l}`);
  return { caught: out.includes('SELFTEST FAILED') && r.status !== 0, why: 'the self-test PASSED on it' };
}

/**
 * Defect 4 (QA's F-5): the mutation test of the pristine line. Dirty one real src file, then run the
 * SHIPPED harness and the guard-neutered copy against it:
 *   - the shipped harness must print REFUSING TO RUN, exit 1, and measure NOTHING;
 *   - the neutered copy must MEASURE (that is QA's 20/20, 23 killed, exit 0 on a tree that is not HEAD).
 * If the shipped harness measures, the guard does not bite. If the neutered copy refuses anyway, the refusal
 * is caused by something else and removing that line changes nothing - a surviving mutant.
 */
function refusalDifferential(broken) {
  const before = porcelain(DIRTY_FILE);
  const beforeAll = porcelain();
  if (before === null || beforeAll === null) { console.log('SETUP FAILED: git is not available, so the pristine check cannot be exercised'); process.exit(1); }
  if (before !== '') { console.log(`SETUP FAILED: ${DIRTY_FILE} is already modified (${before}). Restore it first: git checkout -- packages/engine/ledger/src`); process.exit(1); }
  if (existsSync(JOURNAL_DIR) && readdirSync(JOURNAL_DIR).length > 0) {
    console.log('SETUP FAILED: an interrupted run left a journal behind, and the harnesses would drain it and then measure a clean tree.');
    console.log('               Run the harness once (node packages/engine/ledger/scripts/mutants-t03-01.mjs) to drain it, then re-run this control.');
    process.exit(1);
  }

  const path = join(PKG, DIRTY_FILE);
  const original = readFileSync(path);
  const runs = {};
  try {
    writeFileSync(path, Buffer.concat([original, Buffer.from('\n// mutant-selfcheck: deliberately dirty, restored in the finally below\n')]));
    for (const [label, script] of [['shipped', SRC], ['neutered', broken]]) {
      const r = spawnSync(process.execPath, [script], { encoding: 'utf8', cwd: PKG });
      runs[label] = { out: `${r.stdout ?? ''}${r.stderr ?? ''}`, status: r.status };
    }
  } finally {
    writeFileSync(path, original);
    if (!readFileSync(path).equals(original)) throw new Error(`the control could not restore ${DIRTY_FILE} byte-for-byte`);
  }

  const measured = (run) => run.out.includes('--- self-test:') || run.out.includes('mutants killed:');
  const refused = (run) => run.out.includes('REFUSING TO RUN');
  console.log(`    shipped harness on ${DIRTY_FILE}: exit ${runs.shipped.status}, refused=${refused(runs.shipped)}, measured=${measured(runs.shipped)}`);
  console.log(`    guard-neutered copy on ${DIRTY_FILE}: exit ${runs.neutered.status}, refused=${refused(runs.neutered)}, measured=${measured(runs.neutered)}`);
  for (const l of runs.neutered.out.split(/\r?\n/).filter((l) => l.includes('mutants killed'))) console.log(`    ${l}`);

  // The control's own footprint: the file it dirtied is clean again, and the rest of the tree is as it was.
  // (On a clean tree that is QA's "git status --porcelain is empty before and after"; on a tree with unrelated
  // edits it is the same property stated precisely, instead of failing on dirt this control did not make.)
  const after = porcelain(DIRTY_FILE);
  const afterAll = porcelain();
  if (after !== '' || afterAll !== beforeAll) return { caught: false, why: `the control left the tree dirty (${JSON.stringify(after || afterAll)})` };
  // A stale journal is the same defect one step later: the next harness run would restore from it before it
  // measures, so the tree it measures is not the tree it thinks it is. The control must leave none.
  if (journalEntries() !== 0) return { caught: false, why: `the control left ${journalEntries()} journal entry/entries behind, and the next harness run would restore from them` };
  if (measured(runs.shipped)) return { caught: false, why: 'the SHIPPED harness MEASURED a dirty tree instead of refusing it: the pristine check does not bite' };
  if (!refused(runs.shipped)) return { caught: false, why: 'the SHIPPED harness neither refused nor measured, so the refusal path was never exercised' };
  if (runs.shipped.status !== 1) return { caught: false, why: `the SHIPPED harness refused a dirty tree but exited ${runs.shipped.status}, not 1` };
  if (!measured(runs.neutered)) return { caught: false, why: 'the guard-neutered copy refused the dirty tree too: the line is NOT the mechanism, so removing it changes nothing' };
  return { caught: true };
}

console.log('=== mutant harness NEGATIVE CONTROL: the self-test must FAIL on a deliberately broken harness ===');
let allCaught = true;
for (const defect of DEFECTS) {
  const broken = join(CACHE, `mutants-t03-01-broken-${DEFECTS.indexOf(defect)}.mjs`);
  makeBroken(defect, broken);
  console.log(`--- broken copy: ${broken}   (defect: ${defect.name})`);
  const v = defect.check === 'refusal' ? refusalDifferential(broken) : selfTestOn(broken);
  rmSync(broken, { force: true });
  if (!v.caught) { allCaught = false; console.log(`NEGATIVE CONTROL FAILED: nothing caught a harness broken by: ${defect.name} - ${v.why}`); }
  else if (defect.check === 'refusal') console.log('--- caught: the shipped harness refused the dirty tree and the copy that lost that line measured it, so the line is load-bearing');
  else console.log(`--- caught: the self-test FAILED on the harness broken by ${defect.name}`);
}
if (!allCaught) {
  console.log('NEGATIVE CONTROL FAILED: the self-test is itself vacuous, so its "20 of 20" proves nothing.');
  process.exit(1);
}
console.log('=== NEGATIVE CONTROL OK: the self-test FAILED on every broken harness, so it is a real guard ===');
process.exit(0);
