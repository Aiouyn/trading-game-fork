// Types-only stand-in for the upstream names T02-09 owns (G6: TableDef, IndexDef). The two interfaces below are
// T02-09's VERBATIM shape (packages/engine/core/store/table.ts on branch eng/02-t09, head 252ca08e3adddd205eaa451ae0c1b8c02da17ee7),
// which is not on main yet (fork PR #1 is open and on hold). Replace this file with
//   import type { IndexDef, TableDef } from '@tycoon/engine-core/store';
// plus the matching tsconfig `paths` mapping when PR #1 merges; nothing else moves (the interfaces are identical).
// Same pattern as packages/engine/macro/core-port.ts. Types only: no runtime value crosses this edge (E-80).
import type { Id } from './money';

/** T02-09: null = not indexed. */
export interface IndexDef<T> { name: string; key(e: T): string | null }
/** T02-09: G6 TableDef + the optional secondary indexes. */
export interface TableDef<T> { name: string; module: string; idOf(e: T): Id; schema?: unknown; indexes?: IndexDef<T>[] }
