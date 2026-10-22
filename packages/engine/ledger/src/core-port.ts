// T02-09 (E-79): the genuine TableDef / IndexDef, imported type-only from core's store barrel.
// Type-only edge (E-80.4): no runtime value crosses it, so the ledger's isolated CI needs no
// npm dependency on core and no vitest alias.
import type { IndexDef, TableDef } from '@tycoon/engine-core/store';

export type { IndexDef, TableDef };
