import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HARNESS_NAME, harnessesOf, runHarnesses } from './engine-check.mjs';

// The CI wiring card: the mutant harnesses must RUN in CI, guarded on the harness file existing, and
// a surviving mutant must fail the job. A harness that is run and ignored would be worse than no
// harness at all, so these tests check the RUN, not just the shape.
//
// The engine-check helpers are imported from the script itself, so the test exercises the same code
// the CI job runs (scripts/engine-check.mjs <pkg> -> runHarnesses(dir)).
const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)));
const scratch = (): string => mkdtempSync(join(tmpdir(), 'engine-check-test-'));
// What a harness that MEASURED prints before it exits 0. runHarnesses requires it (see the skip-path test):
// an exit 0 alone cannot tell a real run from one that skipped, so a fake harness that means "this ran fine"
// has to say so the same way the real one does.
const SUMMARY = "console.log('=== mutants killed: 1   mutants survived: 0   spawn errors: 0 ===');\n";

describe('CI wiring: the mutant harness runs inside the check (pkg) job', () => {
  it('harnessesOf finds the harness by FILE EXISTENCE and skips a package with no harness', () => {
    const dir = scratch();
    try {
      // A package with no scripts dir at all: no harness, no step. (The guard is the file's existence.)
      expect(harnessesOf(dir)).toEqual([]);
      // A package with a scripts dir but no harness: still no step.
      mkdirSync(join(dir, 'scripts'));
      expect(harnessesOf(dir)).toEqual([]);
      // The harness appears -> the step appears.
      writeFileSync(join(dir, 'scripts', 'mutants-t03-01.mjs'), '// harness\n');
      const found = harnessesOf(dir);
      expect(found).toHaveLength(1);
      expect(found[0].replace(/\\/g, '/')).toBe(`${dir.replace(/\\/g, '/')}/scripts/mutants-t03-01.mjs`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the NEGATIVE CONTROL is never picked up as a harness (it writes broken copies on purpose)', () => {
    const dir = scratch();
    try {
      mkdirSync(join(dir, 'scripts'));
      writeFileSync(join(dir, 'scripts', 'mutant-selfcheck.mjs'), '// negative control\n');
      writeFileSync(join(dir, 'scripts', 'mutants-t03-01.mjs'), '// harness\n');
      const found = harnessesOf(dir).map((f) => f.replace(/\\/g, '/').split('/').pop());
      expect(found).toEqual(['mutants-t03-01.mjs']);       // the negative control is NOT in the list
      expect(found).not.toContain('mutant-selfcheck.mjs');
      // And the name pattern itself excludes it, even if the file is named exactly like the control.
      expect(HARNESS_NAME.test('mutant-selfcheck.mjs')).toBe(false);
      expect(HARNESS_NAME.test('mutants-t03-01.mjs')).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a SURVIVING MUTANT fails the job: runHarnesses propagates the harness exit code', () => {
    const dir = scratch();
    try {
      mkdirSync(join(dir, 'scripts'));
      // A harness that exits 1 (what a surviving mutant does): the step must fail.
      writeFileSync(join(dir, 'scripts', 'mutants-failing.mjs'), 'process.exitCode = 1;\n');
      expect(() => runHarnesses(dir)).toThrow();
      // A harness that exits 0 does not - as long as it shows its work.
      writeFileSync(join(dir, 'scripts', 'mutants-failing.mjs'), `${SUMMARY}process.exitCode = 0;\n`);
      expect(() => runHarnesses(dir)).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a run that MEASURES NOTHING cannot exit 0: the skip path fails the job', () => {
    // QA on PR #26: the harness gained a path that returns before anything is measured (the pristine
    // refusal), and CI reads only the exit status - so `process.exitCode = 1` -> `= 0` there turns a
    // refusal into a green job that tested nothing. The same hole covers a harness whose body never
    // runs, a renamed harness, and a summary that reports zero kills. Every one of them must fail.
    const dir = scratch();
    try {
      mkdirSync(join(dir, 'scripts'));
      const harness = join(dir, 'scripts', 'mutants-skip.mjs');

      // (a) THE SKIP PATH ITSELF: the pristine refusal, with its exit code swallowed.
      writeFileSync(harness, "console.log('REFUSING TO RUN: these files differ from HEAD');\nprocess.exitCode = 0;\n");
      expect(() => runHarnesses(dir)).toThrow(/MEASURED NOTHING/);

      // (b) A SILENT HARNESS: exits 0 and prints nothing at all.
      writeFileSync(harness, 'process.exitCode = 0;\n');
      expect(() => runHarnesses(dir)).toThrow(/MEASURED NOTHING/);

      // (c) A SUMMARY THAT REPORTS NOTHING KILLED: measured none, so it proves none.
      writeFileSync(harness, "console.log('=== mutants killed: 0   mutants survived: 0 ===');\nprocess.exitCode = 0;\n");
      expect(() => runHarnesses(dir)).toThrow(/MEASURED NOTHING/);

      // (d) THE CONTROL: the same wiring on a harness that SHOWS ITS WORK passes, so (a)-(c) fail
      // for the reason claimed and not because runHarnesses rejects everything.
      writeFileSync(harness, `${SUMMARY}process.exitCode = 0;\n`);
      expect(() => runHarnesses(dir)).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the harness step really RUNS the harness (the marker file is written by the harness process)', () => {
    const dir = scratch();
    const marker = join(dir, 'ran.txt');
    try {
      mkdirSync(join(dir, 'scripts'));
      writeFileSync(join(dir, 'scripts', 'mutants-marker.mjs'), `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(marker)}, 'ran');\n${SUMMARY}`);
      expect(existsSync(marker)).toBe(false);            // nothing ran yet
      runHarnesses(dir);
      expect(existsSync(marker)).toBe(true);             // the harness process really ran
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the harness runs with the SCRIPT as an argument, not as options (the execSync trap)', () => {
    // execSync's signature is execSync(command, options): an argv ARRAY passed as the second argument
    // is taken as the OPTIONS, so `execSync(node, [harness], { cwd, stdio })` runs `node` with NO
    // SCRIPT - which exits 0 having done nothing. That would make this wiring run a harness that
    // never ran and report success: the same vacuity the card exists to prevent, one level up.
    // This test pins the two things that distinguish a real run from that trap: the harness file is
    // EXECUTED (marker written) and its ARGUMENTS are passed (argv reaches the script).
    const dir = scratch();
    const marker = join(dir, 'ran.txt');
    const argvMarker = join(dir, 'argv.txt');
    try {
      mkdirSync(join(dir, 'scripts'));
      writeFileSync(join(dir, 'scripts', 'mutants-argv.mjs'), `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(marker)}, 'ran');\nwriteFileSync(${JSON.stringify(argvMarker)}, JSON.stringify(process.argv));\n${SUMMARY}`);
      runHarnesses(dir);
      expect(existsSync(marker)).toBe(true);
      // The script saw its own path as argv[1] - proof the SCRIPT was passed as an argument.
      // (argv[0] is the node binary, argv[1] is the script, so the array is NOT sliced.)
      const seen = JSON.parse(readFileSync(argvMarker, 'utf8')) as string[];
      expect(seen.length).toBeGreaterThan(1);
      expect(seen[1]).toContain('mutants-argv.mjs');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the REAL ledger harness is wired: it is found in the tree, and the negative controls are not', () => {
    const ledger = join(REPO, 'packages', 'engine', 'ledger');
    const found = harnessesOf(ledger).map((f) => f.replace(/\\/g, '/'));
    expect(found.length).toBeGreaterThan(0);
    expect(found.some((f) => f.endsWith('packages/engine/ledger/scripts/mutants-t03-01.mjs'))).toBe(true);
    // The negative control is in the same scripts dir and must NOT be wired into CI.
    expect(found.some((f) => f.endsWith('mutant-selfcheck.mjs'))).toBe(false);
  });

  it('the wiring\'s own negative control is NOT wired into CI (it writes broken copies on purpose)', () => {
    // scripts/ci-wiring-selfcheck.mjs deliberately writes a broken copy of the harness, so it is a
    // DEVELOPER TOOL and must never run in CI - exactly like the harness's own negative control.
    // It is run by hand; its output is pasted into the PR body.
    const selfcheck = join(REPO, 'scripts', 'ci-wiring-selfcheck.mjs');
    expect(existsSync(selfcheck)).toBe(true);
    // The repo root's scripts/ dir is not a package, so the wiring never looks there anyway - but the
    // name is also outside the harness pattern, so even a package-rooted wiring could not pick it up.
    expect(HARNESS_NAME.test('ci-wiring-selfcheck.mjs')).toBe(false);
    expect(harnessesOf(REPO)).toEqual([]);
  });
});
