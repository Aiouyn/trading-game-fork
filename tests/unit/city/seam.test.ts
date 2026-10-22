import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

const SRC = join(__dirname, '../../../src/city');

/** Path relative to SRC, always with POSIX separators (Windows joins with '\'). */
const relSrc = (f: string): string => relative(SRC, f).split(/[\\/]/).join('/');

/** Static (non type-only) import specifiers of a module. Dynamic import() is not followed. */
function staticImports(file: string): string[] {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const out: string[] = [];
  for (const st of sf.statements) {
    if ((ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
      const typeOnly = ts.isImportDeclaration(st) ? st.importClause?.isTypeOnly ?? false : st.isTypeOnly;
      if (!typeOnly) out.push(st.moduleSpecifier.text);
    }
  }
  return out;
}

function resolveLocal(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(from), spec);
  for (const c of [`${base}.ts`, join(base, 'index.ts')]) {
    try {
      readFileSync(c);
      return c;
    } catch {
      /* next */
    }
  }
  return null;
}

/** The C-04 seam rule: src/city/index.ts pulls in exactly ONE module - itself. */
const SEAM_FILES: readonly string[] = ['index.ts'];

/**
 * The rule as a function, so a test can prove it REJECTS a widened set. Writing the assertion
 * inline would make that impossible; keeping it here is what makes the negative check below
 * a real proof instead of a restatement.
 */
const assertSeamFiles = (files: readonly string[]): void => {
  expect(files).toEqual(SEAM_FILES);
};

/** Every module src/city/index.ts reaches by STATIC import, and the bare specifiers it names. */
function walkSeam(): { seen: string[]; bare: string[] } {
  const seen = new Set<string>();
  const bare: string[] = [];
  const walk = (f: string) => {
    if (seen.has(f)) return;
    seen.add(f);
    for (const s of staticImports(f)) {
      const local = resolveLocal(f, s);
      if (local) walk(local);
      else bare.push(s);
    }
  };
  walk(join(SRC, 'index.ts'));
  return { seen: [...seen], bare };
}

describe('C-04 seam', () => {
  it('src/city/index.ts has no static import of three, directly or transitively', () => {
    const { seen, bare } = walkSeam();
    expect(bare.filter((s) => s === 'three' || s.startsWith('three/'))).toEqual([]);
    assertSeamFiles(seen.map(relSrc));
  });
  it('index.ts loads the implementation with a dynamic import, and three is only imported dynamically anywhere', () => {
    expect(readFileSync(join(SRC, 'index.ts'), 'utf8')).toMatch(/await import\('\.\/renderer\/create'\)/);
    const create = readFileSync(join(SRC, 'renderer/create.ts'), 'utf8');
    expect(create).toMatch(/await import\('three'\)/);
    for (const f of ['renderer/create.ts', 'renderer/scene.ts']) {
      expect(staticImports(join(SRC, f)).filter((s) => s === 'three')).toEqual([]);
    }
  });
});

describe('C-04 seam negative checks', () => {
  // QA's proof that the seam assertion was NOT weakened when the separator normalisation was
  // introduced: widen the expected set to two files and the assertion must FAIL. Kept here as a
  // committed test, because a relaxed seam assertion is exactly what rots unnoticed.
  it('the seam assertion requires EXACTLY one file: a two-file variant FAILS', () => {
    expect(() => assertSeamFiles(['index.ts'])).not.toThrow();
    expect(() => assertSeamFiles(['index.ts', 'renderer/create.ts'])).toThrow();
    expect(() => assertSeamFiles(['index.ts', 'data/types.ts'])).toThrow();
    // One file too many is a failure; one file too few is a failure; a different single file is
    // a failure. The rule is "exactly index.ts", not "at most one file".
    expect(() => assertSeamFiles([])).toThrow();
    expect(() => assertSeamFiles(['renderer/create.ts'])).toThrow();
  });

  it('relSrc normalises separators only: it does not widen or narrow the file set', () => {
    // The Windows join produces a backslash; relSrc turns it into the POSIX form the assertion
    // expects. The NAME is unchanged, so the assertion still requires exactly one file.
    expect(relSrc(join(SRC, 'index.ts'))).toBe('index.ts');
    expect(relSrc('C:\\a\\b\\index.ts')).toBe(relSrc('C:/a/b/index.ts'));
    expect(relSrc(join(SRC, 'renderer', 'create.ts'))).toBe('renderer/create.ts');
  });
});
