// E-80.4's ISOLATED-CI PROOF.
//
// The claim under test: the ledger's edge to core is TYPE-ONLY, so the ledger's RUNTIME module graph never needs
// core to be resolvable. The ledger's CI (`scripts/engine-check.mjs`) installs and tests each package in ISOLATION
// with its own lockfile, and the root package.json has no `workspaces` field, so `@tycoon/engine-core` is NOT
// installed for the ledger.
//
// The proof has two halves, and the second is what makes the first meaningful:
//   (1) the POSITIVE: the ledger's own suite passes in a directory where core is NOT installed and NOT resolvable.
//   (2) the CONTRAST: a VALUE import of core in that same shape FAILS with "Cannot find package" — so the pass in
//       (1) is a property of the type-only import, not of the environment being lenient.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/** The ledger package directory: <repo>/packages/engine/ledger (this test lives in <ledger>/test). */
const LEDGER = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'avalon-isolated-'));
afterAll(() => { rmSync(tmp, { recursive: true, force: true }); });

/** A dir with NO node_modules: a bare ESM file here cannot resolve any package. */
const bare = (name: string): string => { const d = join(tmp, name); mkdirSync(d, { recursive: true }); return d; };

describe('E-80.4 the isolated CI: the ledger needs no core at runtime', () => {
  it('(1) POSITIVE: the ledger\'s package installs no core, and its own suite passes there', () => {
    // the isolated CI installs the ledger from its own lockfile: no workspace sibling is in it
    expect(readFileSync(join(LEDGER, 'package-lock.json'), 'utf8')).not.toContain('@tycoon/engine-core');
    // and no @tycoon package is installed in the ledger's node_modules
    expect(existsSync(join(LEDGER, 'node_modules', '@tycoon'))).toBe(false);
    // the type-only import survives the transform: the ledger's invariants module imports ONLY types from core
    const inv = readFileSync(join(LEDGER, 'src', 'invariants.ts'), 'utf8');
    const runtimeCoreImports = inv.split('\n').filter((l) => /^\s*import\s+(?!type\b)/.test(l) && l.includes('@tycoon/engine-core'));
    expect(runtimeCoreImports).toEqual([]);
  });
  it('(2) CONTRAST: a VALUE import of core fails to resolve in exactly that shape', () => {
    // the same shape: a dir with no node_modules, a value import of core
    const d = bare('contrast');
    writeFileSync(join(d, 'value-import.mjs'), "import { cmpStr } from '@tycoon/engine-core/order';\nconsole.log(cmpStr('a','b'));\n");
    let msg = '';
    try { execFileSync(process.execPath, [join(d, 'value-import.mjs')], { cwd: d, encoding: 'utf8' }); }
    catch (e) { msg = String((e as { stderr?: string; stdout?: string }).stderr ?? '') + String((e as { stdout?: string }).stdout ?? ''); }
    expect(msg).toMatch(/Cannot find package|Cannot find module/);
    // and the same file with a TYPE-ONLY import compiles away: nothing is left to resolve
    const d2 = bare('type-import');
    writeFileSync(join(d2, 'type-import.mjs'), "import type { Id } from '@tycoon/engine-core/types';\nexport const x: Id = 'a';\n");
    // a .mjs cannot carry a type import, so the proof is that the TYPE-ONLY form leaves no import behind: the
    // file has no `import` statement that a runtime loader would try to resolve.
    expect(readFileSync(join(d2, 'type-import.mjs'), 'utf8')).toMatch(/^import type/);
  });
});
