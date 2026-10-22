// The NEGATIVE CONTROL for the CI WIRING: prove that a surviving mutant really does fail the job.
//
// The wiring card's non-negotiable condition: a surviving mutant must fail the CI job. This script
// proves the WHOLE chain, WITHOUT ever touching a tracked file:
//
//   (1) STEP 1 - the wiring runs a THROWAWAY harness that reports a surviving mutant and exits 1.
//       The wiring must FAIL on that exit code. This is the property that makes the CI job go red;
//       a wiring that ran the harness and ignored its result would be worse than no harness at all.
//   (2) STEP 2 - the CONTROL: the same wiring against a harness that exits 0 must PASS, so the
//       failure in step 1 was caused by the surviving mutant and not by the wiring itself.
//
// The proof that the REAL harness reports SURVIVED and exits 1 on a surviving mutant is the harness's
// OWN self-test (it already has that case) plus the committed harness, so it is not re-derived here.
// What this script adds is the part the harness cannot check: that the WIRING acts on the exit code.
//
// Everything this script writes lives in the OS temp dir and is removed afterwards. It never touches
// a file in the repo, so it cannot leave the tree dirty - not even if it is killed mid-run.
//
// This is a DEVELOPER TOOL and is NOT run in CI, for the same reason the harness's own negative
// control is not: it deliberately breaks things on purpose, so it must never run unattended.
//
// Usage: node scripts/ci-wiring-selfcheck.mjs
// Expected: it prints "NEGATIVE CONTROL OK" and exits 0.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)));

console.log('=== CI WIRING negative control: a surviving mutant must fail the wiring ===');
let failed = false;

const { runHarnesses } = await import(pathToFileURL(join(REPO, 'scripts', 'engine-check.mjs')).href);

// A throwaway package in the OS temp dir: the harness file is written there, so nothing in the repo
// is touched and a killed run cannot leave the tree dirty.
const pkg = join(tmpdir(), `ci-wiring-selfcheck-${process.pid}`);
rmSync(pkg, { recursive: true, force: true });
mkdirSync(join(pkg, 'scripts'), { recursive: true });

try {
  // ── STEP 1: a harness that reports a surviving mutant and exits 1 must fail the wiring ──────────────
  // The exit code is what the wiring acts on, so the harness sets it explicitly - exactly as the real
  // harness does when a mutant survives (it sets process.exitCode = 1 and prints "SURVIVED").
  writeFileSync(join(pkg, 'scripts', 'mutants-survivor.mjs'), [
    "console.log('SURVIVED  M5  a comment-only change (uncatchable by construction)   <-- the test does not guard this');",
    'process.exitCode = 1;',
    '',
  ].join('\n'));
  let threw = false;
  let message = '';
  try {
    runHarnesses(pkg);
  } catch (e) {
    threw = true;
    message = e.message;
  }
  if (!threw) {
    failed = true;
    console.log('NEGATIVE CONTROL FAILED: the wiring ran a harness with a surviving mutant and did NOT fail. The CI job would have been green.');
  } else {
    console.log(`--- step 1 ok: the wiring failed on the surviving mutant (${message.split('\n')[0]})`);
  }

  // ── STEP 2: the CONTROL - a harness that exits 0 must PASS ─────────────────────────────────────────
  writeFileSync(join(pkg, 'scripts', 'mutants-survivor.mjs'), 'process.exitCode = 0;\n');
  let controlThrew = false;
  try { runHarnesses(pkg); } catch { controlThrew = true; }
  if (controlThrew) {
    failed = true;
    console.log('NEGATIVE CONTROL FAILED: the wiring failed on a harness that exited 0, so the failure in step 1 was not caused by the surviving mutant.');
  } else {
    console.log('--- step 2 ok: a harness that exits 0 passes, so the survivor is what made it fail');
  }
} finally {
  rmSync(pkg, { recursive: true, force: true });
}

if (failed) { console.log('=== NEGATIVE CONTROL FAILED ==='); process.exit(1); }
console.log('=== NEGATIVE CONTROL OK: a surviving mutant fails the wiring, so it fails the CI job ===');
process.exit(0);
