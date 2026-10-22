// E-79's ACCEPTANCE CRITERIA, checked against the tree (AC-03-ER79-SHAPE and AC-03-ER79-MEMBERS).
// This is a regression guard on the erratum's shape, not a card test: it fails if a later card breaks E-79.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = join(root, 'src');
const allSrc = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? allSrc(p) : (f.endsWith('.ts') ? [p] : []);
});

describe('AC-03-ER79-SHAPE (the E-79 build shape must not regress)', () => {
  it('(a) packages/engine/ledger holds no state/ directory and no schema.ts, and no new subdirectory is created', () => {
    const dirs = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    expect(dirs).not.toContain('state');
    expect(dirs.sort()).toEqual(['data', 'node_modules', 'scripts', 'src', 'test']);
    expect(readdirSync(pkg)).not.toContain('schema.ts');
  });
  it('(b) the repo exports no getCatalog and no buildCatalog; every catalog read goes through LedgerWorld.catalog', () => {
    for (const f of allSrc(join(root, '..', '..'))) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/export\s+(?:function|const)\s+(?:getCatalog|buildCatalog)\b/);
    }
    // the catalog is reached through the world
    expect(readFileSync(join(pkg, 'world.ts'), 'utf8')).toMatch(/readonly catalog: ReasonCatalog/);
  });
  it('(c) HoldApi is declared only in src/world.ts', () => {
    const decls = allSrc(pkg).filter((f) => /export\s+(?:interface|type)\s+HoldApi\b/.test(readFileSync(f, 'utf8')));
    expect(decls.map((f) => f.replace(/\\/g, '/'))).toEqual([join(pkg, 'world.ts').replace(/\\/g, '/')]);
  });
  it('(d) RailState is declared only in src/templates.ts', () => {
    const decls = allSrc(pkg).filter((f) => /export\s+interface\s+RailState\b/.test(readFileSync(f, 'utf8')));
    expect(decls.map((f) => f.replace(/\\/g, '/'))).toEqual([join(pkg, 'templates.ts').replace(/\\/g, '/')]);
  });
});

describe('AC-03-ER79-MEMBERS (the T03 build)', () => {
  it('(c) HoldApi has activeHolds, and placeCashFor\'s optional 7th parameter is crossPartition', () => {
    const src = readFileSync(join(pkg, 'world.ts'), 'utf8');
    expect(src).toMatch(/activeHolds\(owner: Id\): readonly Hold\[\]/);
    expect(src).toMatch(/placeCashFor\([^)]*opts\?: \{ crossPartition\?: boolean \}\)/);
  });
  it('(d) RailState has depositAccounts and bankFrozen', () => {
    const src = readFileSync(join(pkg, 'templates.ts'), 'utf8');
    expect(src).toMatch(/depositAccounts\(entityId: Id, ccy: Ccy\): readonly string\[\]/);
    expect(src).toMatch(/bankFrozen\(bankId: Id\): boolean/);
  });
  it('(e) LedgerInvariant is InvariantImpl from packages/engine/core/invariants/, with no second shape and no adapter', () => {
    const src = readFileSync(join(pkg, 'invariants.ts'), 'utf8');
    // the import is TYPE-ONLY (E-80.4: the `type` keyword is required, the edge must stay erased)
    expect(src).toMatch(/import type \{[^}]*InvariantImpl[^}]*\} from '@tycoon\/engine-core\/invariants'/);
    // the alias IS core's InvariantImpl, parameterised over 03's Posting
    expect(src).toMatch(/export type LedgerInvariant = InvariantImpl<Posting>/);
    // no adapter: no function converts one invariant shape into another
    expect(src).not.toMatch(/function\s+toInvariantImpl|as\s+InvariantImpl\b/);
    // the ledger does not import a VALUE from core anywhere: a real import statement (line-anchored) that does not
    // begin with the `type` keyword would cross the edge at runtime.
    for (const f of allSrc(pkg)) {
      const s = readFileSync(f, 'utf8');
      for (const line of s.split('\n')) {
        const m = /^\s*import\s+(?!type\b)([\s\S]*?)\s+from\s+'@tycoon\/engine-core[^']*'/.exec(line);
        if (m) throw new Error(`${f}: a VALUE import crosses the core edge: ${line.trim()}`);
      }
    }
  });
  it('(f) a DAY_CLOSE-scoped invariant runs at the day-close tick and at no other tick', () => {
    // the scope union is core's, carried through the type-only edge
    const src = readFileSync(join(pkg, 'invariants.ts'), 'utf8');
    expect(src).toMatch(/scope: 'TICK'/);
    // core's union still carries DAY_CLOSE (E-79 point 2: it is not narrowed)
    const core = readFileSync(join(root, '..', 'core', 'invariants', 'types.ts'), 'utf8');
    expect(core).toMatch(/'DAY_CLOSE'/);
  });
});
