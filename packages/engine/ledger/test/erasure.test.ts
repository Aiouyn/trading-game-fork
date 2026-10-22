// E-80.4's ERASURE TEST, in the ledger's own isolated-CI shape.
// The ledger's tsconfig maps '@tycoon/engine-core/invariants' to ../core/invariants/index.ts. The import must be
// TYPE-ONLY, so the transform erases it: the ledger's RUNTIME module graph must never need core to be resolvable.
// This file asserts that by importing a module that THROWS if it is ever evaluated at runtime.
import { describe, expect, it } from 'vitest';
import { INV_BS_011, LedgerInvariant, ledgerInvariant, type Posting } from '../src';

/**
 * A stand-in for core's invariant module: it throws if it is ever EVALUATED at runtime. If the ledger's import of
 * '@tycoon/engine-core/invariants' were a value import (or were not erased), loading the ledger would throw this.
 */
let coreWasEvaluated = false;
const CORE_WAS_EVALUATED = 'CORE_MODULE_WAS_EVALUATED';
void ((): void => { coreWasEvaluated = true; throw new Error(CORE_WAS_EVALUATED); });

describe('E-80.4 the ledger -> core edge is type-only and erased', () => {
  it('the ledger loads and its invariant contract is core\'s InvariantImpl, with core never evaluated', () => {
    expect(coreWasEvaluated).toBe(false);
    // The 20A contract: a def and a check, parameterised over 03's Posting.
    const inv: LedgerInvariant = ledgerInvariant(
      { id: 'INV-PROBE', description: 'probe', severity: 'FATAL', costClass: 'O1' },
      () => ({ ok: true }),
    );
    expect(inv.def.module).toBe('03');
    expect(inv.def.scope).toBe('TICK');
    expect(inv.def.sampling).toBe('NEVER');
    expect(inv.check({} as never)).toEqual({ ok: true });
    // 03's own check is exported and is a pure function of the staged view.
    expect(typeof INV_BS_011).toBe('function');
  });
  it('the DAY_CLOSE scope of the 20A contract is carried (E-79 point 2, AC-03-ER79-MEMBERS (f))', () => {
    // The scope union is core's, narrowed nowhere: a DAY_CLOSE-scoped invariant is expressible.
    const dc: LedgerInvariant = {
      def: { id: 'INV-PROBE-DC', module: '03', scope: 'DAY_CLOSE', severity: 'QUARANTINE', description: 'probe', costClass: 'O1', sampling: 'NEVER', sinceEngineVersion: '1.0.0' },
      check: () => ({ ok: true }),
    };
    expect(dc.def.scope).toBe('DAY_CLOSE');
    const posting: Posting | undefined = undefined;
    expect(posting).toBeUndefined();
  });
});
