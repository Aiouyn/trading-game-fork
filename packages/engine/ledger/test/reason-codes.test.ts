// 03#1 — the REASON-CODE SCANNER (T03-05). The card files this as `tests/contract/reason-codes.test.ts`;
// ledger errata E-79 puts a card's test file next to the ledger's other tests, so it lives here.
//
// What it proves: every reason code the engine posts is a code the catalog knows, that the template the
// posting uses is one the code allows, and that the calling package is allowed to request it. It reads
// SOURCE TEXT (a call site is a literal argument, not a runtime value), so it catches the mistake where it
// is written, not when the posting is attempted three units later.
//
// The scanner takes a ReasonCatalog instead of building one: errata E-79 removed the module-level
// `getCatalog()` — the one catalog is `LedgerWorld.catalog`, and a test may construct its own.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ReasonCatalog, type TemplateId } from '../src';

export interface SourceFile { path: string; text: string }
export interface Finding { file: string; line: number; code: string; problems: string[] }

/** Method -> index of the reason-code argument, and the template the method posts with (03 §3.3.3). */
const CODE_ARG: Readonly<Record<string, number>> = {
  pay: 4, swapAsset: 6, mint: 3, burn: 3, elasticIn: 4, elasticOut: 4, lend: 4, repay: 4,
  cbCredit: 4, cbCreditUnwind: 4, accrue: 3, accruePair: 4, fx: 6, moveQty: 6, reclass: 3,
};
const TEMPLATE: Readonly<Record<string, string>> = {
  pay: 'PAY', swapAsset: 'SWAP_ASSET', mint: 'MINT', burn: 'BURN', elasticIn: 'ELASTIC_IN', elasticOut: 'ELASTIC_OUT',
  lend: 'LEND', repay: 'REPAY', cbCredit: 'CB_CREDIT', cbCreditUnwind: 'CB_CREDIT_UNWIND', accrue: 'ACCRUE',
  accruePair: 'ACCRUE_PAIR', fx: 'FX', moveQty: 'MOVE_QTY', reclass: 'RECLASS',
};
/** The package folder -> its module number (00 §3.5); a file outside these is not module-checked. */
const MODULE: Readonly<Record<string, number>> = {
  core: 2, ledger: 3, macro: 4, markets: 5, assets: 6, banking: 7, funds: 8, business: 9, realestate: 10,
  lab: 11, conflict: 12, law: 13, progression: 14, social: 15, world: 16,
};

/** The module number of the package a file belongs to, or undefined when the file is outside one. */
export function moduleOf(file: string): number | undefined {
  const m = /packages[\\/](?:engine[\\/])?([a-z]+)[\\/]/.exec(file);
  return m === null ? undefined : MODULE[m[1]];
}

/**
 * The arguments of the call whose `(` is at `open`, split at top-level commas.
 * Strings and bracket nesting are respected, so `f(a, 'x,y', g(1, 2))` is three arguments, not five.
 */
export function callArguments(text: string, open: number): string[] {
  const args: string[] = [];
  let depth = 0;
  let current = '';
  let quote: string | null = null;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (quote !== null) {
      if (ch === '\\') { current += ch + (text[i + 1] ?? ''); i++; continue; }
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; current += ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') { depth++; if (depth === 1 && ch === '(') continue; current += ch; continue; }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) { args.push(current.trim()); return args; }
      current += ch;
      continue;
    }
    if (ch === ',' && depth === 1) { args.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  return args;                                   // unbalanced source: the caller's parse is not a finding
}

/**
 * A quoted string literal argument, or null. Both quote styles are read: nothing in this repo enforces
 * single quotes (no prettier, no `quotes` rule), so `"MKT_TRADE"` is as reachable as `'MKT_TRADE'`.
 * Templates and concatenations are not literals we can read.
 */
const literal = (arg: string | undefined): string | null => {
  if (arg === undefined) return null;
  const m = /^(['"])([^'"\\]*)\1$/.exec(arg.trim());
  return m === null ? null : m[2];
};

/** Every `ledger.<method>(` call with a literal code argument, checked against `catalog`. */
export function scanReasonCodes(files: readonly SourceFile[], catalog: ReasonCatalog): Finding[] {
  const findings: Finding[] = [];
  for (const file of files) {
    const module = moduleOf(file.path);
    for (const match of file.text.matchAll(/(?:apiFor\(\s*'(?<apiFor>\d+)'\s*\)\s*\.\s*)?\bledger\.(?<method>[A-Za-z]+)\s*\(/g)) {
      const method = match.groups?.method ?? '';
      const index = CODE_ARG[method];
      if (index === undefined) continue;
      // The module that REQUESTS the code is the one on `apiFor('<n>')` when the call has a receiver of that
      // shape (`w.apiFor('21').ledger.mint(...)`); the folder is only a fallback for a bare `ctx.ledger.*`.
      const requestingModule = match.groups?.apiFor === undefined ? module : Number(match.groups.apiFor);
      const open = (match.index ?? 0) + match[0].length - 1;
      const args = callArguments(file.text, open);
      const code = literal(args[index]);
      if (code === null) continue;               // not a literal: nothing static to check
      const problems: string[] = [];
      const aliasTargets = catalog.resolveAlias(code);
      if (aliasTargets !== undefined) {
        problems.push(`ALIAS_USED ${code} is a 24 §8 alias of ${aliasTargets}; post the canonical code`);
      } else if (catalog.get(code) === undefined) {
        problems.push(`UNKNOWN_CODE ${code} is not in the catalog`);
      } else {
        const tpl = TEMPLATE[method];
        if (!catalog.templateAllowed(code, tpl as TemplateId)) problems.push(`TEMPLATE_NOT_ALLOWED ${code} does not allow ${tpl}`);
        if (requestingModule !== undefined && !catalog.mayRequest(code, requestingModule)) {
          problems.push(`NOT_REQUESTABLE ${code} is owned by module ${catalog.get(code)?.owner} and module ${requestingModule} may not request it`);
        }
      }
      if (problems.length === 0) continue;
      const line = file.text.slice(0, match.index ?? 0).split('\n').length;
      findings.push({ file: file.path, line, code, problems });
    }
  }
  return findings;
}

/** Every `.ts` file under `dir`, recursively, skipping tests (the scanner guards shipped code). */
export function sourceFiles(dir: string, skip = /\.test\.ts$|node_modules/): SourceFile[] {
  const out: SourceFile[] = [];
  for (const entry of readdirSync(dir)) {
    if (skip.test(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path, skip));
    else if (entry.endsWith('.ts')) out.push({ path, text: readFileSync(path, 'utf8') });
  }
  return out;
}

const here = fileURLToPath(new URL('.', import.meta.url));
const ENGINE = join(here, '..', '..');           // packages/engine

describe('03#1 reason-code scanner', () => {
  const catalog = new ReasonCatalog();

  it('accepts a code the caller owns, posted with a template the code allows', () => {
    const src: SourceFile[] = [{ path: 'packages/engine/progression/src/x.ts', text: "ctx.ledger.mint(a, x, 'FDL', 'ACCT_START_CASH');" }];
    expect(scanReasonCodes(src, catalog)).toEqual([]);
  });

  it('rejects a code whose class does not allow the template the method posts with', () => {
    const src: SourceFile[] = [{ path: 'packages/engine/progression/src/x.ts', text: "ctx.ledger.mint(a, x, 'FDL', 'BIZ_SALES_B2B');" }];
    const findings = scanReasonCodes(src, catalog);
    expect(findings).toHaveLength(1);
    expect(findings[0].problems.join(' ')).toContain('TEMPLATE_NOT_ALLOWED BIZ_SALES_B2B does not allow MINT');
  });

  it('rejects an alias name and names its 24 §8 target', () => {
    const src: SourceFile[] = [{ path: 'packages/engine/progression/src/x.ts', text: "ctx.ledger.mint(a, x, 'FDL', 'START_CASH');" }];
    const findings = scanReasonCodes(src, catalog);
    expect(findings).toHaveLength(1);
    expect(findings[0].problems.join(' ')).toContain('ALIAS_USED');
    expect(findings[0].problems.join(' ')).toContain('ACCT_START_CASH');
  });

  it('rejects a code another module owns', () => {
    const src: SourceFile[] = [{ path: 'packages/engine/progression/src/x.ts', text: "ctx.ledger.pay(a, b, x, 'FDL', 'MKT_TRADE');" }];
    const findings = scanReasonCodes(src, catalog);
    expect(findings).toHaveLength(1);
    expect(findings[0].problems.join(' ')).toContain('owned by module 5');
  });

  it('reads a nested call without mistaking its commas for the call\'s own arguments', () => {
    const text = "ctx.ledger.pay(f(a, b), g('x,y'), 1n, 'FDL', 'MKT_TRADE');";
    const open = text.indexOf('(', text.indexOf('ledger.pay'));
    expect(callArguments(text, open)).toEqual(['f(a, b)', "g('x,y')", '1n', "'FDL'", "'MKT_TRADE'"]);
  });

  it('reads a double-quoted literal too — nothing in the repo enforces single quotes', () => {
    const src: SourceFile[] = [{ path: 'packages/engine/ledger/src/x.ts', text: 'import { a } from \'./y\';\nctx.ledger.pay(a, b, x, "FDL", "MKT_TRADE");' }];
    const findings = scanReasonCodes(src, catalog);
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('MKT_TRADE');
    expect(findings[0].line).toBe(2);              // the call's own line, not the file's first
    expect(findings[0].problems.join(' ')).toContain('owned by module 5');
  });

  it('rejects a code the catalog does not know', () => {
    const src: SourceFile[] = [{ path: 'packages/engine/ledger/src/x.ts', text: "ctx.ledger.mint(a, x, 'FDL', 'NOT_A_CODE');" }];
    const findings = scanReasonCodes(src, catalog);
    expect(findings).toHaveLength(1);
    expect(findings[0].line).toBe(1);
    expect(findings[0].problems.join(' ')).toContain('UNKNOWN_CODE NOT_A_CODE is not in the catalog');
  });

  it('every literal reason code in packages/engine/**/*.ts is postable by the module that writes it', () => {
    const findings = scanReasonCodes(sourceFiles(ENGINE), catalog);
    expect(findings.map((f) => `${relative(ENGINE, f.file)}:${f.line} ${f.problems.join('; ')}`)).toEqual([]);
  });
});
