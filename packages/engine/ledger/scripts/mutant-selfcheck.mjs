// The mutant harness's own negative control: prove that the harness's SELF-TEST is not vacuous.
//
// A detector that never fires is worse than no detector, because it reads as a guard. The harness's self-test claims
// to catch a broken classifier AND a broken scoring layer. This script proves the claim by breaking each layer on
// purpose and showing that the self-test FAILS on each broken copy.
//
// It writes a broken copy of the harness to the git-ignored cache dir (never into the repo), with ONE of the
// THREE defects below, each broken on its own so each is proven to be caught on its own:
//   1. the kill predicate is the original vacuous one — "a non-zero exit is a kill", whatever the runner printed;
//   2. the runner is the original POSIX `.bin` shim, which cmd.exe cannot execute on Windows, so the spawn exits
//      non-zero and NO TEST EVER RUNS;
//   3. THE SCORING LAYER counts a SETUP_FAILED as a KILL (QA's F-3). This is not a classifier defect at all:
//      with the old self-test this copy printed "10 of 10" and exited 0, because only the classifier was ever
//      exercised. A setup failure means NOTHING WAS MEASURED, so counting it as a kill must fail the self-test.
//
// Usage: node scripts/mutant-selfcheck.mjs
// Expected: the broken copies print "SELFTEST FAILED" and exit non-zero. A broken copy that PASSES is the bug.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const PKG = fileURLToPath(new URL('..', import.meta.url));
const CACHE = join(PKG, 'node_modules', '.cache', 't03-01-mutant-fixtures');
const SRC = join(PKG, 'scripts', 'mutants-t03-01.mjs');

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

/** The three defects, each broken on its own. */
const DEFECTS = [
  { name: 'the vacuous kill predicate (a non-zero exit is a kill)', apply: (t) => t.replace(VACUOUS_PREDICATE, VACUOUS_REPLACEMENT), need: VACUOUS_PREDICATE },
  { name: 'the POSIX .bin shim (the spawn never starts)', apply: (t) => t.replace(REAL_RUNNER, SHIM_RUNNER), need: REAL_RUNNER },
  { name: 'the SCORING counts a SETUP_FAILED as a KILL (nothing was measured)', apply: (t) => t.replace(REAL_SCORING, VACUOUS_SCORING), need: REAL_SCORING },
];

function makeBroken(defect, dst) {
  let text = readFileSync(SRC, 'utf8');
  if (!text.includes(defect.need)) { console.log(`SETUP FAILED: ${defect.name}: the pattern was not found in the harness`); process.exit(1); }
  text = defect.apply(text);
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(dst, text);
}

console.log('=== mutant harness NEGATIVE CONTROL: the self-test must FAIL on a deliberately broken harness ===');
let allCaught = true;
for (const defect of DEFECTS) {
  const broken = join(CACHE, `mutants-t03-01-broken-${DEFECTS.indexOf(defect)}.mjs`);
  makeBroken(defect, broken);
  console.log(`--- broken copy: ${broken}   (defect: ${defect.name})`);
  const r = spawnSync(process.execPath, [broken], { encoding: 'utf8', cwd: PKG });
  rmSync(broken, { force: true });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  for (const l of out.split(/\r?\n/).filter((l) => l.includes('self-test:') || l.includes('SELFTEST'))) console.log(l);
  const caught = out.includes('SELFTEST FAILED') && r.status !== 0;
  if (!caught) { allCaught = false; console.log(`NEGATIVE CONTROL FAILED: the self-test PASSED on a harness broken by: ${defect.name}`); }
  else console.log(`--- caught: the self-test FAILED on the harness broken by ${defect.name}`);
}
if (!allCaught) {
  console.log('NEGATIVE CONTROL FAILED: the self-test is itself vacuous, so its "10 of 10" proves nothing.');
  process.exit(1);
}
console.log('=== NEGATIVE CONTROL OK: the self-test FAILED on every broken harness, so it is a real guard ===');
process.exit(0);
