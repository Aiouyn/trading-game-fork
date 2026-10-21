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
export const APPROVED_EXCEPTIONS = new Set(['package.json', 'package-lock.json', '.github/workflows/city.yml']);

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
    && !OWNED_CONTENT.includes(p) && !OWNED.some((r) => r.test(p)));
  return outside.length ? { status: 'fail', outside } : { status: 'pass' };
}

/** The branch under test: GITHUB_HEAD_REF (PRs), then GITHUB_REF_NAME, then git. */
export function currentBranch(env: Record<string, string | undefined>, git: () => string | null): string | null {
  const fromEnv = env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME;
  if (fromEnv) return fromEnv;
  const b = git();
  return b && b !== 'HEAD' ? b : null;
}
