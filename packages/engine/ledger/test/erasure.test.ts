// E-80.4's ERASURE PROOF: the ledger -> core edge is TYPE-ONLY, so the ledger's RUNTIME module graph never needs
// core to be resolvable.
//
// This is a real runtime assertion, not a comment: '@tycoon/engine-core/invariants' is registered as a module whose
// factory THROWS, and the ledger is then loaded (`../src`). A type-only import is erased by the transform, so the
// mocked specifier is never requested and the sentinel never runs. If the import ever becomes a value import — or
// anything else in the graph reaches core at runtime — evaluating the factory throws CORE_MODULE_WAS_EVALUATED and
// this file fails. (The vacuous form of this test — an arrow function that is never invoked — passes whatever
// src/ imports, because `void (fn)` evaluates the function VALUE and never calls it.)
import { describe, expect, it, vi } from 'vitest';
import { INV_BS_011, ledgerInvariant, type LedgerInvariant, type Posting } from '../src';

/** Set only if the stand-in core module is EVALUATED at runtime. `vi.hoisted` because `vi.mock` is hoisted above imports. */
const sentinel = vi.hoisted(() => ({ evaluated: false }));

// The vitest transform hoists this above the imports, so the mock is registered before `../src` is evaluated.
vi.mock('@tycoon/engine-core/invariants', () => {
  sentinel.evaluated = true;
  throw new Error('CORE_MODULE_WAS_EVALUATED');
});

describe('E-80.4 the ledger -> core edge is type-only and erased', () => {
  it('the ledger loads and its invariant contract is core\'s InvariantImpl, with core never evaluated', async () => {
    expect(sentinel.evaluated).toBe(false);
    // ...and the trap is ARMED: requesting that specifier here DOES evaluate the factory that threw, so a green run
    // above is not a mock that silently failed to register (the "proof that cannot fail" defect this file used to have).
    await expect(import('@tycoon/engine-core/invariants')).rejects.toThrow();
    expect(sentinel.evaluated).toBe(true);
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
