// The source-level guard behind AC-10A-12-ROLE-PA: the module under test DERIVES the district
// role, it never reads the shipped `role` column of packages/content/data/district-flags.json.
//
// WHY THIS IS NOT A REGEX (fork PR #19, QA finding F-1). A line regex only sees the spellings it
// was written for: `flags.role` matched, `const { role } = flags` did not - and QA wrote exactly
// that copy. It compiled, ran, and returned the shipped column on all 105 districts while the
// regex found 0 hits. This scan parses the module with the TypeScript parser, so "a read of the
// column" is the IDENTIFIER `role` (or the exact string 'role'), wherever it sits: the member
// name (`x.role`), the destructuring binding (`{ role }` and the renamed `{ role: alias }`), the
// computed key (`x['role']`), the object or type key (`{ role: ... }`), and a plain variable. A
// renamed alias cannot hide the column, because the rename keeps `role` as the binding's property
// name. Comments are not AST nodes, so the module's prose naming the column does not count.
//
// THE BOUNDARY, stated honestly: this is a static check, so a determined obfuscator can build the
// string `role` at runtime (`'rol' + 'e'`). That is not a copy a developer writes by accident, and
// it would be caught in review; the five shapes a copy actually takes are pinned by the committed
// mutants R17..R21 in ./role-copy-mutants.json.
//
// The scan and the mutant builders live here, outside the test file, so the test and the kill
// harness (scripts/mutants-t10a-12-role.mjs) run the COMMITTED check and the COMMITTED mutant
// text - not a re-typed copy of either. The mutant text itself is the JSON beside this file, so
// the mutants the test scans and the mutants the harness kills are the same five strings.
import * as ts from 'typescript';
import COPY_MUTANT_DATA from './role-copy-mutants.json';

/** The syntactic position a `role` name was found in. */
export type RoleColumnKind = 'member' | 'binding' | 'key' | 'index' | 'literal' | 'name';

/** One place the scanned source names the `role` column. */
export interface RoleColumnHit {
  /** 1-based line number in the scanned source. */
  readonly line: number;
  /** Which spelling of the column was found. */
  readonly kind: RoleColumnKind;
  /** The node's text, whitespace collapsed, so a failure names the line. */
  readonly text: string;
}

/** The column name. */
const COLUMN = 'role';

/** The kind of an identifier named `role`, from its parent. */
const kindOfIdentifier = (node: ts.Identifier): RoleColumnKind => {
  const p = node.parent;
  if (ts.isPropertyAccessExpression(p) && p.name === node) return 'member';
  if (ts.isBindingElement(p)) return 'binding';
  if (ts.isPropertyAssignment(p) && p.name === node) return 'key';
  if (ts.isPropertySignature(p) && p.name === node) return 'key';
  if (ts.isPropertyDeclaration(p) && p.name === node) return 'key';
  if (ts.isShorthandPropertyAssignment(p) && p.name === node) return 'key';
  if (ts.isMethodDeclaration(p) && p.name === node) return 'key';
  if (ts.isMethodSignature(p) && p.name === node) return 'key';
  return 'name';
};

/**
 * Every place `src` names the `role` column, as hits. An empty list is the pass.
 *
 * Total over plain identifiers and exact string literals: no spelling that a copy can be written
 * in without obfuscation is missed, and a hit is never a false positive on the shipped module
 * (which names the column only in comments, and comments are trivia, not nodes).
 */
export const roleColumnReads = (src: string): RoleColumnHit[] => {
  const sf = ts.createSourceFile('scanned.ts', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const hits: RoleColumnHit[] = [];
  const record = (node: ts.Node, kind: RoleColumnKind): void => {
    hits.push({
      line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
      kind,
      text: node.getText(sf).replace(/\s+/g, ' ').trim().slice(0, 160),
    });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === COLUMN) {
      record(node, kindOfIdentifier(node));
    } else if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && node.text === COLUMN) {
      const p = node.parent;
      const kind: RoleColumnKind =
        ts.isElementAccessExpression(p) && p.argumentExpression === node
          ? 'index'
          : ts.isPropertyAssignment(p) && p.name === node
            ? 'key'
            : 'literal';
      record(node, kind);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
};

/** One committed copy mutant, built from the module's own source text. */
export interface CopyMutant {
  /** The mutant id (R17..R21). */
  readonly id: string;
  /** What shape of copy it is, for the failure message. */
  readonly shape: string;
  /** The full module source with the copy inserted. */
  readonly source: string;
  /** The line the copy returns the column with. */
  readonly guard: string;
  /** The spellings of the column this mutant must trip, in source order. */
  readonly kinds: readonly RoleColumnKind[];
}

/**
 * Build the committed copy mutants R17..R21 from the module's own source text.
 *
 * Each is a GENUINE copy: it reads the shipped `role` column and returns it before the derivation,
 * so it compiles, runs, and returns the shipped column on all 105 districts. That is the whole
 * point - a mutant that is not a copy inflates the kill count and proves nothing (QA finding F-3,
 * where R19 was `{ role: 'CBD' }` appended to the source and never read a row at all).
 *
 * They differ only in the SPELLING of the read, one per detector path:
 *   R17 - a member read, with `role: string` in the row type (member + key);
 *   R18 - a member read with no `role:` key anywhere (member only);
 *   R19 - the shorthand destructuring binding `{ role }` (binding only - the shape the old regex
 *         could not see, and the one QA wrote);
 *   R20 - a bracket read `row['role']` (the string literal as an element key);
 *   R21 - a computed-key read `row[key]` where `const key = 'role'` (the bare literal).
 *
 * The read and the early return are INSERTED after the flags block, not substituted for it: a
 * substitution would leave `riverOrCanal` (or `cbd`) unbound and the mutant would not compile.
 */
export const copyMutants = (src: string): CopyMutant[] => {
  const anchor = COPY_MUTANT_DATA.anchor;
  return COPY_MUTANT_DATA.mutants.map((m) => ({
    id: m.id,
    shape: m.shape,
    guard: m.guard,
    kinds: m.kinds as readonly RoleColumnKind[],
    source: src
      .split('\n')
      .map((line) => (line.includes(anchor) ? [line, `  ${m.read}`, `  ${m.guard}`].join('\n') : line))
      .join('\n'),
  }));
};
