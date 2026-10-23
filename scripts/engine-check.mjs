// Runs typecheck, lint and tests for each engine package that exists (packages/engine/core is skipped when absent).
// Usage: node scripts/engine-check.mjs [core|ledger|macro|content ...]   (default: all present). Each package is isolated (own lockfile).
//
// The MUTANT HARNESS step (added by the CI wiring card): a package may carry one or more mutant
// harnesses under <pkg>/scripts/mutants-*.mjs. A harness is a CLAIM of coverage - it mutates the
// implementation and requires the guarding test to FAIL - so it only means anything if it is run.
// A harness that is never run in CI is a claim nobody checks, and a harness that silently goes
// vacuous (a runner that cannot start, a non-zero exit misread as a failing test) reports a perfect
// score to whoever runs it next. So the harness runs HERE, inside the job that already installed the
// package's own pinned dependencies, and its exit code PROPAGATES: a surviving mutant fails the job.
//
// Three rules this step keeps:
//   (a) the harness runs with the PACKAGE'S OWN vitest, not the repo root's - engine-check.mjs installs
//       the package in isolation (npm ci), so the harness inherits the package's pinned vitest (3.2.7)
//       rather than the root's (5.0.3). The harness resolves its runner from the package's own
//       node_modules first, so it uses whatever this step installed.
//   (b) the harness's own SELFTEST must run in CI too, not just the mutants - because it is what makes
//       the 23/23 number mean anything. If the harness is ever broken again, the self-test fails
//       loudly and the job goes red instead of the harness reporting a perfect score. The harness does
//       that itself: the self-test runs first, and a misclassification exits non-zero before any
//       mutant is scored.
//   (c) the NEGATIVE CONTROL (scripts/mutant-selfcheck.mjs) deliberately writes broken copies of the
//       harness, so it is a developer tool and is NOT run here. It must never be: it proves the
//       self-test fires, by making it fire on purpose. The name pattern below keeps it out.
//   (d) ISOLATION: this step must be the ONLY thing touching that package's src/ while it runs. The harness
//       mutates files under src/ and restores them, so anything else writing to those files concurrently
//       corrupts the harness's verdict - a mutant is reported SURVIVED when it is not, or the harness's own
//       self-test row reports MISMATCH because the self-test and the mutant run disagree about a file that
//       changed underneath them. In CI that is automatic (a fresh checkout, one job, one matrix entry per
//       package). Locally it is NOT, which is where false readings come from. A number that changes between
//       two runs of the same code on the same head is not a flaky number - it is a corrupted one. The tell is
//       `git status` and `git diff` disagreeing mid-run. The harness's own docstring says the same thing, and
//       names the MISMATCH row as the second symptom.
//   (e) A HARNESS MUST SHOW ITS WORK. The exit code alone cannot tell a measured run from a skipped one: a
//       harness that refuses ("REFUSING TO RUN") with its exit code flipped to 0, a harness whose body was
//       deleted, and a harness renamed out of the glob all exit 0 having measured nothing. So an exit 0 is
//       only accepted when the harness also prints its MEASUREMENT SUMMARY (`=== mutants killed: N ...`) with
//       at least one kill. Anything else fails the job. QA measured the skip path on PR #26: one character
//       (`process.exitCode = 1` -> `= 0` in the pristine branch) produced a green CI step that had measured
//       nothing at all, which is the same false green this whole card exists to close, one level up.
import { existsSync, readdirSync } from 'node:fs';
import { execSync, spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The name pattern of a MUTANT HARNESS. The negative control (mutant-selfcheck.mjs) does not match it. */
export const HARNESS_NAME = /^mutants-.*\.mjs$/;

/**
 * The mutant harnesses of a package: <pkg>/scripts/mutants-*.mjs, sorted by name.
 * The guard is the FILE'S EXISTENCE, exactly like the package.json guard above: a package with no
 * harness simply has no harness step. The name pattern is deliberate - the negative control is
 * scripts/mutant-selfcheck.mjs (no 's' after mutant), so it can never be picked up by this glob.
 * The paths are ABSOLUTE: the harness is spawned with cwd set to the package, so a relative path
 * would be resolved against the package dir and point at a doubled path.
 */
export function harnessesOf(dir) {
  const scripts = join(dir, 'scripts');
  if (!existsSync(scripts)) return [];
  return readdirSync(scripts).filter((f) => HARNESS_NAME.test(f)).sort().map((f) => resolve(scripts, f));
}

/**
 * The harness's MEASUREMENT SUMMARY, printed once at the end, after every mutant has been scored:
 *   === mutants killed: 23   mutants survived: 0   spawn errors: 0 ...
 * It is the only thing in the output that distinguishes a run that MEASURED from one that skipped.
 */
export const MEASUREMENT = /^=== mutants killed: (\d+)\b/m;

/**
 * Require a measured run, not merely a zero exit status.
 *
 * The exit code is necessary and NOT sufficient. Every skip path in the harness - the pristine refusal, a
 * body that never runs, an early return - prints no summary, and one flipped character is all it takes for
 * such a run to exit 0. So a run that exits 0 without a summary naming at least one kill is treated as the
 * failure it is: nothing was measured, and a green job would be a lie. The harness's own output is printed
 * first, so the reason (REFUSING TO RUN, or silence) is visible in the log above the error.
 */
export function requireMeasurement(harness, out) {
  const m = MEASUREMENT.exec(out);
  if (m === null || Number(m[1]) === 0) {
    throw new Error(
      `the mutant harness exited 0 but MEASURED NOTHING: ${harness}\n` +
      `It printed no "=== mutants killed: N ..." summary with at least one kill. A refusal, a harness\n` +
      `whose body never ran, and a harness renamed out of the harness glob all look exactly like this from\n` +
      `here, so this step fails instead of reporting a green run that measured nothing.`,
    );
  }
}

/**
 * Run every mutant harness of a package and PROPAGATE a non-zero exit.
 *
 * The exit code is checked EXPLICITLY, with spawnSync, and NOT by relying on execSync to throw.
 *
 * execSync CANNOT be used here, and the reason is the same defect class this whole card is about:
 * execSync's signature is execSync(command, options). An ARGV ARRAY passed as the second argument is
 * taken as the OPTIONS, not as the arguments - so `execSync(process.execPath, [harness], { cwd, stdio })`
 * runs `node` with NO SCRIPT, which exits 0 having done nothing. Measured on this box, on Node 22
 * and Node 26 alike: the harness file was never executed and the call returned normally. A wiring
 * written that way would run a harness that never ran and report success: the exact vacuity this
 * card exists to prevent, one level up.
 *
 * spawnSync is used instead, with the exit status read directly and checked, AND the output captured so
 * requireMeasurement() above can refuse an exit 0 that measured nothing. The harness's own output is
 * replayed to this process's stdout/stderr, so the log reads exactly as it did when it was inherited.
 */
export function runHarnesses(dir) {
  for (const harness of harnessesOf(dir)) {
    console.log(`\n> ${dir}: mutant harness ${harness}`);
    const r = spawnSync(process.execPath, [harness], { cwd: dir, encoding: 'utf8' });
    const out = r.stdout ?? '';
    process.stdout.write(out);
    if (r.stderr) process.stderr.write(r.stderr);
    if (r.error !== undefined) {
      throw new Error(`the mutant harness could not be spawned: ${harness}\n${r.error.message}`);
    }
    if (r.status !== 0) {
      throw new Error(`the mutant harness FAILED (exit ${r.status}): ${harness}`);
    }
    requireMeasurement(harness, out);
  }
}

// content, params and citygen live outside packages/engine/ (T22A-01: content, T02-11 / E-70:
// params, T10A-12 U0: citygen).
const all = ['core', 'ledger', 'macro', 'content', 'params', 'citygen'];

function main() {
  const want = process.argv.slice(2).length ? process.argv.slice(2) : all;
  for (const p of want) {
    const dir =
      p === 'content' || p === 'params' || p === 'citygen'
        ? `packages/${p}`
        : `packages/engine/${p}`; // T22A-01: content, T02-11 / E-70: params, T10A-12 U0: citygen live outside engine
    if (!existsSync(`${dir}/package.json`)) { console.log(`skip ${dir} (absent)`); continue; }
    for (const cmd of [existsSync(`${dir}/node_modules`) ? null : 'npm ci', 'npm run typecheck', 'npm run lint', 'npm test']) {
      if (!cmd) continue;
      console.log(`\n> ${dir}: ${cmd}`);
      execSync(cmd, { cwd: dir, stdio: 'inherit' });
    }
    // The mutant harnesses run AFTER the package's own tests, with the SAME installed dependencies.
    runHarnesses(dir);
  }
}

// Run only when invoked as a script, so a test can import the helpers above without the checks running.
const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
