import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { c16Verdict, currentBranch, isCityBranch, OWNED_CITYGEN, OWNED_CONTENT } from './paths';

const sh = (cmd: string): string | null => {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
};

describe('C-16 path check', () => {
  const branch = currentBranch(process.env, () => sh('git rev-parse --abbrev-ref HEAD'));
  const city = branch !== null && isCityBranch(branch);
  it.skipIf(!city)(`this City Dev branch touches no path outside Spec 2 ownership (${branch ?? 'unknown branch'})`, () => {
    const base = process.env.CITY_BASE_REF ?? (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'origin/main');
    const out = sh(`git diff --name-only ${base}...HEAD && git diff --name-only HEAD && git ls-files --others --exclude-standard`);
    if (out === null) return; // no git history (e.g. tarball)
    const v = c16Verdict(branch, out.split('\n'));
    expect(v).toEqual({ status: 'pass' });
  });
  if (!city) it('skips on branches City Dev does not own', () => {
    const v = c16Verdict(branch, []);
    console.log(v.status === 'skip' ? v.reason : v);
    expect(v.status).toBe('skip');
  });
});

describe('C-16 scope (AC)', () => {
  const engine = ['packages/engine/src/core.ts', 'src/engine/catalysts.ts'];
  const cityOnly = ['src/city/renderer/picture.ts', 'tests/unit/city/paths.ts', 'tests/e2e/city/legibility.spec.ts', 'docs/city/README.md'];

  it('a city branch touching packages/engine/** or src/engine/** fails', () => {
    for (const b of ['v3/city-renderer', 'city/c16-scope']) {
      expect(c16Verdict(b, [...cityOnly, engine[0]])).toEqual({ status: 'fail', outside: [engine[0]] });
      expect(c16Verdict(b, [engine[1]])).toEqual({ status: 'fail', outside: [engine[1]] });
    }
  });
  it('an engine (or any non-city) branch touching the same files is never flagged', () => {
    for (const b of ['v3/engine-catalysts', 'v3/ledger-core', 'v3/quay-shell', 'ui/citywindow-hardening', 'main', 'refs/heads/v3/engine-x', 'cityscape/x', 'v3/cityish']) {
      const v = c16Verdict(b, [...engine, 'src/app/page.tsx']);
      expect(v.status, b).toBe('skip');
    }
  });
  it('a city branch touching only city paths (and the approved exceptions) passes', () => {
    expect(c16Verdict('city/industrial-basin-label', cityOnly)).toEqual({ status: 'pass' });
    expect(c16Verdict('v3/city-renderer', [...cityOnly, 'package.json', '.github/workflows/city.yml'])).toEqual({ status: 'pass' });
  });
  it('T10A-13: the two district-flags files are City Dev-owned; every other content file is not', () => {
    expect(OWNED_CONTENT).toEqual(['packages/content/data/district-flags.json', 'packages/content/src/district-flags.test.ts']);
    expect(c16Verdict('city/t10a-13', [...OWNED_CONTENT])).toEqual({ status: 'pass' });
    expect(c16Verdict('city/t10a-13', ['packages/content/data/cities.json'])).toEqual({
      status: 'fail', outside: ['packages/content/data/cities.json'],
    });
    expect(c16Verdict('city/t10a-13', ['packages/content/src/view.ts'])).toEqual({
      status: 'fail', outside: ['packages/content/src/view.ts'],
    });
  });
  it('branch comes from GITHUB_HEAD_REF first, then GITHUB_REF_NAME, then git; detached HEAD is unknown → skip', () => {
    expect(currentBranch({ GITHUB_HEAD_REF: 'v3/engine-x', GITHUB_REF_NAME: '6/merge' }, () => 'city/x')).toBe('v3/engine-x');
    expect(currentBranch({ GITHUB_HEAD_REF: '', GITHUB_REF_NAME: 'city/x' }, () => null)).toBe('city/x');
    expect(currentBranch({}, () => 'v3/city-renderer')).toBe('v3/city-renderer');
    expect(currentBranch({}, () => 'HEAD')).toBeNull();
    expect(c16Verdict(null, ['packages/engine/a.ts']).status).toBe('skip');
  });
});

describe('C-16 negative-space probe: the OWNED_CONTENT grant must not leak', () => {
  // A scope grant that silently becomes a wildcard rots unnoticed, because the files it
  // wrongly admits are exactly the files nobody looks at. QA probed the grant with 11 paths;
  // only the two named files may pass. This keeps that probe in the repo.
  const NAMED = ['packages/content/data/district-flags.json', 'packages/content/src/district-flags.test.ts'];

  it('exactly the two named files pass; the other nine probe paths still FAIL', () => {
    // The two named files pass.
    for (const p of NAMED) {
      expect(c16Verdict('city/t10a-13', [p]), p).toEqual({ status: 'pass' });
    }

    // Every one of these must still be flagged as outside City Dev's scope.
    const mustFail = [
      'packages/content/data/district-flags.json.bak',        // a backup extension
      'Packages/Content/Data/district-flags.json',            // a different case
      'packages/content/data/nested/district-flags.json',     // a nested path
      'packages/content/data/district-flags.json ',           // a trailing space
      'packages/content/data/district-flags.jsonx',           // a longer filename
      'packages/content/data/district-flags.json.bak.json',   // a longer filename, extension in the middle
      'packages/content/data/district-flags.json.bak.bak',    // two extensions
      'packages/content/data/other.json',                     // a different file in the same folder
      'packages/engine/data/district-flags.json',             // a different package
    ];
    expect(mustFail.length).toBe(9);
    for (const p of mustFail) {
      expect(c16Verdict('city/t10a-13', [p]), p).toEqual({ status: 'fail', outside: [p] });
    }
  });

  it('the grant is a list of exact paths, not a prefix or a pattern', () => {
    // A prefix would admit every file under packages/content/.
    expect(c16Verdict('city/t10a-13', ['packages/content/data/cities.json'])).toEqual({
      status: 'fail', outside: ['packages/content/data/cities.json'],
    });
    expect(c16Verdict('city/t10a-13', ['packages/content/src/blocs.ts'])).toEqual({
      status: 'fail', outside: ['packages/content/src/blocs.ts'],
    });
    // And the list holds exactly two entries - not one more, not one fewer.
    expect(OWNED_CONTENT).toHaveLength(2);
  });
});

describe('T10A-12: the OWNED_CITYGEN grant covers the package this card creates, and nothing else', () => {
  // The 20 exact paths: the package skeleton (6, including the lockfile), the seven placement
  // sources, the five placement tests, and the two CI files.
  const NAMED: readonly string[] = [
    'packages/citygen/package.json',
    'packages/citygen/package-lock.json',
    'packages/citygen/tsconfig.json',
    'packages/citygen/vitest.config.ts',
    'packages/citygen/eslint.config.mjs',
    'packages/citygen/.gitignore',
    'packages/citygen/src/placement/types.ts',
    'packages/citygen/src/placement/rules.ts',
    'packages/citygen/src/placement/classify.ts',
    'packages/citygen/src/placement/buffers.ts',
    'packages/citygen/src/placement/suitability.ts',
    'packages/citygen/src/placement/assign.ts',
    'packages/citygen/src/placement/index.ts',
    'packages/citygen/test/placement/rules.test.ts',
    'packages/citygen/test/placement/classify.test.ts',
    'packages/citygen/test/placement/buffers.test.ts',
    'packages/citygen/test/placement/suitability.test.ts',
    'packages/citygen/test/placement/assign.test.ts',
    'scripts/engine-check.mjs',
    '.github/workflows/engine.yml',
  ];

  it('the grant is exactly the twenty named paths', () => {
    expect(OWNED_CITYGEN).toHaveLength(20);
    for (const p of NAMED) expect(OWNED_CITYGEN, p).toContain(p);
    for (const p of OWNED_CITYGEN) expect(NAMED, p).toContain(p);
  });

  it('every named path passes the check on a City Dev branch', () => {
    for (const p of NAMED) {
      expect(c16Verdict('city/t10a-12', [p]), p).toEqual({ status: 'pass' });
    }
  });

  it('a City Dev branch touching the whole package at once passes', () => {
    expect(c16Verdict('city/t10a-12', NAMED)).toEqual({ status: 'pass' });
  });

  it('the negative-space probe: every other packages/** path still FAILS', () => {
    // A scope grant that silently becomes a wildcard rots unnoticed, because the files it
    // wrongly admits are exactly the files nobody looks at. This probe lives in the repo, not in
    // a reviewer's session.
    const mustFail = [
      'packages/citygen/other/thing.ts',          // a future file under the package
      'packages/citygen/src/index.ts',            // T10A-03's file, NOT this card's
      'packages/citygen/src/parcels.ts',          // T10A-03's file
      'packages/citygen/src/placement/predicates.ts', // a file this card does not create
      'packages/citygen/test/determinism.test.ts',    // T10A-03's test
      'packages/citygen/package.json.bak',       // a backup extension
      'packages/citygen/package.jsonx',          // a longer filename
      'packages/citygen/package-lock.json.bak',  // a backup of the lockfile
      'packages/engine/core/index.ts',           // another package entirely
      'packages/content/data/cities.json',       // another content file
      'packages/content/src/view.ts',            // another content file
      'packages/params/src/index.ts',            // another package
      'scripts/lint/other.mjs',                  // another script
      '.github/workflows/other.yml',              // another workflow
    ];
    expect(mustFail.length).toBe(14);
    for (const p of mustFail) {
      expect(c16Verdict('city/t10a-12', [p]), p).toEqual({ status: 'fail', outside: [p] });
    }
  });

  it('the grant is a list of exact paths, not a prefix or a directory glob', () => {
    // A prefix would admit every file under packages/citygen/, and the card says it must not.
    for (const p of [
      'packages/citygen/src/placement/predicates.ts',
      'packages/citygen/src/index.ts',
      'packages/citygen/test/determinism.test.ts',
    ]) {
      expect(c16Verdict('city/t10a-12', [p]), p).toEqual({ status: 'fail', outside: [p] });
    }
    // And the list holds exactly twenty entries - not one more, not one fewer.
    expect(OWNED_CITYGEN).toHaveLength(20);
  });
});
