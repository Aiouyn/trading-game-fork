// C-16 scope (pure): which branches the Spec 2 path check applies to, and its verdict.
// Spec 2 §1 ownership. package.json / package-lock.json and the city workflow are approved
// exceptions (Producer).

export const OWNED = [/^src\/city\//, /^public\/city\//, /^tests\/unit\/city\//, /^tests\/e2e\/city\//, /^docs\/city\//];
/**
 * T10A-13 (Producer ruling, 2026-10-21): City Dev owns `packages/content/data/district-flags.json`
 * and its schema test. Exactly those two files, matched exactly - `packages/content/**` stays
 * outside City Dev's scope, so every other content file still trips the check.
 */
export const OWNED_CONTENT: readonly string[] = [
  'packages/content/data/district-flags.json',
  'packages/content/src/district-flags.test.ts',
];
/**
 * T10A-12 (Producer ruling, 2026-10-22): City Dev owns the `packages/citygen` package this
 * card CREATES, plus the two CI files that make it checked.
 *
 * An EXACT-PATH allowlist, never a directory glob: `packages/citygen/` must not become an
 * allowed prefix, so a future `packages/citygen/other/**` file still trips the check until it is
 * listed. The negative probe in `paths.test.ts` is what keeps that true.
 */
export const OWNED_CITYGEN: readonly string[] = [
  // The package skeleton (5 files) and the lockfile CI's `npm ci` needs.
  'packages/citygen/package.json',
  'packages/citygen/package-lock.json',
  'packages/citygen/tsconfig.json',
  'packages/citygen/vitest.config.ts',
  'packages/citygen/eslint.config.mjs',
  'packages/citygen/.gitignore',
  // The seven placement sources.
  'packages/citygen/src/placement/types.ts',
  'packages/citygen/src/placement/rules.ts',
  'packages/citygen/src/placement/classify.ts',
  'packages/citygen/src/placement/buffers.ts',
  'packages/citygen/src/placement/suitability.ts',
  'packages/citygen/src/placement/assign.ts',
  'packages/citygen/src/placement/index.ts',
  // The five placement tests.
  'packages/citygen/test/placement/rules.test.ts',
  'packages/citygen/test/placement/classify.test.ts',
  'packages/citygen/test/placement/buffers.test.ts',
  'packages/citygen/test/placement/suitability.test.ts',
  'packages/citygen/test/placement/assign.test.ts',
  // The two CI files that wire the package into the checks.
  'scripts/engine-check.mjs',
  '.github/workflows/engine.yml',
];
// next.config.ts: the NEXT_PUBLIC_CITY_E2E define (Producer-authorized, prod hook leak).
export const APPROVED_EXCEPTIONS = new Set(['package.json', 'package-lock.json', '.github/workflows/city.yml', 'next.config.ts']);

/** City Dev's branches: v3/city-* and city/*. Every other branch belongs to someone else. */
export const isCityBranch = (branch: string): boolean => /^(v3\/city-|city\/)/.test(branch.replace(/^refs\/heads\//, ''));

export type C16Verdict =
  | { status: 'pass' }
  | { status: 'fail'; outside: string[] }
  | { status: 'skip'; reason: string };

export function c16Verdict(branch: string | null, changed: readonly string[]): C16Verdict {
  if (!branch) return { status: 'skip', reason: 'C-16: branch unknown (no GITHUB_HEAD_REF, GITHUB_REF_NAME or git branch)' };
  if (!isCityBranch(branch)) return { status: 'skip', reason: `C-16: '${branch}' is not a City Dev branch (v3/city-*, city/*); not checked` };
  const outside = [...new Set(changed)].filter((p) => p && !APPROVED_EXCEPTIONS.has(p)
    && !OWNED_CONTENT.includes(p) && !OWNED_CITYGEN.includes(p) && !OWNED.some((r) => r.test(p)));
  return outside.length ? { status: 'fail', outside } : { status: 'pass' };
}

/** The branch under test: GITHUB_HEAD_REF (PRs), then GITHUB_REF_NAME, then git. */
export function currentBranch(env: Record<string, string | undefined>, git: () => string | null): string | null {
  const fromEnv = env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME;
  if (fromEnv) return fromEnv;
  const b = git();
  return b && b !== 'HEAD' ? b : null;
}
