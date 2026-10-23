# V3 reason-code catalog (reference, non-normative)

Full data: `catalog.csv` (456 rows: the canonical catalog — 382 rows that are 03 §3.4 codes, plus 74 rows registered by errata from units 04/07/09/10/11/12/14/15/16). Columns: code, class, owner, cf, allowedTemplates, templates_source (card file:line or erratum), v3_source (03 file:line and section), note, description, legA, legB, sector, taxTag, family, restrictedOk, requestableBy, illicit, cols_source, derived.

> **E-81 (2026-10-22) — this file was stale and is corrected here.** `catalog.csv` is the **canonical** catalog and the **unversioned** file is the **newest** revision: the versioned files (`catalog.v1.csv` … `catalog.v4.csv`) are **backups** of earlier revisions, and the code sets form a strict superset chain v1 ⊂ v2 ⊂ v3 ⊂ v4 ⊂ `catalog.csv`. `derived` is a **provenance marker only** — a derived row is a full member of the catalog and counts. See E-81 for the full ruling, the counts, and the generator's contract.

- **Classes** come from the 03 §3.4.x section each row sits in, except where an erratum reclasses a row (E-46 moved `OPS_FENCE_SALE_NPC` out of FAUCET; E-81 moved `ACCT_STARTER_GIFT` to REVALUE).
- **allowedTemplates** come from the card rows (`Tpl` column) of T03-02 (FAUCET, SINK), T03-03 and T03-04 (TRANSFER A/B) and T03-05 (CREDIT_*, REVALUE).
- The 03 §3.4 codes are exactly those whose `v3_source` names the 03 spec file — **384** of them in the spec tables, of which **382** survive PD-12 (the two `OPS_*` rows become the canonical `CONFLICT_*` rows) and E-46 (the fence leaves FAUCET). The rest are erratum registrations.
- Every row's `allowedTemplates` ⊆ `CLASS_TEMPLATES[class]` (03 §3.3.3). The generator refuses to emit a seed that breaks this.

## Counts per class (03 §3.4)

| Class | 03 section (start line) | Spec table rows | Surviving §3.4 rows (E-81) | Card |
|---|---|---|---|---|
| FAUCET | §3.4.1 (`03:511`) | **37** | **36** (the fence moved to TRANSFER, E-46) | T03-02 |
| SINK | §3.4.2 (`03:553`) | **86** | **86** | T03-02 |
| TRANSFER | §3.4.3 (`03:644`) | **209** | **208** (`OPS_LOOT_CASH`/`OPS_RANSOM` → `CONFLICT_*`, PD-12; the fence joins, E-46) | T03-03 (83) + T03-04 (126) |
| CREDIT_CREATE | §3.4.4 (`03:858`) | **12** | **12** | T03-05 |
| CREDIT_DESTROY | §3.4.5 (`03:875`) | **13** | **13** | T03-05 |
| REVALUE | §3.4.6 (`03:897`) | **27** | **27** | T03-05 |
| **Total in 03** | | **384** | **382** | |

**The live catalog is larger than §3.4, by rule.** 24 R23 registers codes 03 lacks in 03's catalog with the class the module states; PD-12 renames two; E-14 adds the seven settlement codes; and each later unit's erratum registers its own codes. The live per-class histogram is **derived from the seed**, not written down anywhere — see E-81 point 5 and `AC-03-ER81-COUNTS`. The current seed holds **454** rows; with the 5 ledger extension codes (E-5) the live catalog holds **459**.

**Card defect, closed by E-81.** The `REGISTERED_BY_24_8` rows in T03-05 were an unrendered placeholder `@@REG248@@` (`cards/03/T03-05.md:120`). The six codes and their classes come from 24 §8 (`24-DECISIONS-REGISTER.md:780,788,796`) and T03-05 `:121` (the `_P` codes are FAUCET via MINT, the `_W` codes are TRANSFER). They are in the catalog, and their class defaults are recorded in the `derived` column with their erratum reference.

## PD-12 aliases (Producer decision, owner sign-off pending; ledger-core §11)

| Deprecated alias (03 row) | Canonical | Canonical source | Class |
|---|---|---|---|
| `OPS_RANSOM` (`03:816`, TRANSFER, owner 12) | `CONFLICT_RANSOM` | 12 `:441` | TRANSFER |
| `OPS_LOOT_CASH` (`03:815`, TRANSFER, owner 12) | `CONFLICT_CASH_LOOT` | 12 `:442` | TRANSFER |

Implementation notes:
- PD-12 inverts the usual 24 §8 direction. Elsewhere the module name is the alias and the 03 code is canonical (24 §8 `:773`: "A builder posts only the 03 code"). Here the 12 name becomes canonical.
- In the T03-05 `ALIASES` data, add `{ name: 'OPS_RANSOM', module: [12], targets: ['CONFLICT_RANSOM'] }` (and the same for loot). Replace the 03 rows' code with the CONFLICT_* name, keeping class TRANSFER, owner 12, cf OP and template PAY.
- Otherwise `buildCatalog` reports `ALIAS_SHADOWS_CODE` (T03-05 `:76`).
- The CSV keeps the OPS_* rows, flagged DEPRECATED, and adds the CONFLICT_* rows as CANONICAL.

## Other aliases
The full 24 §8 alias table (26 rows) is quoted in T03-05 `:90-118` and `24-DECISIONS-REGISTER.md:771-800`. `CBK_INTEREST_ON_RESERVES` (`03:850`) is superseded for those flows by `CBK_IOR_P/_W` and `CBK_DEPOSIT_INTEREST_P/_W` (24 §8).

## Catalog revisions (E-81, 2026-10-22)

**The unversioned `catalog.csv` is the canonical file and the newest revision.** The versioned files are backups of earlier revisions, and the code sets form a strict superset chain:

| file | rows | what changed |
|---|---|---|
| `catalog.v1.csv` | 392 | the original 9-column catalog |
| `catalog.v2.csv` | 392 | + the columns `legA, legB, sector, taxTag, family, restrictedOk, requestableBy, illicit, cols_source, derived` |
| `catalog.v3.csv` | 399 | + the 7 E-14 settlement codes |
| `catalog.v4.csv` | 401 | + `ACCT_HANDLE_FEE`, `ACCT_HOME_CITY_FEE` (E-21) and E-21's two owner corrections |
| **`catalog.csv`** | **456** | + E-22, E-25, E-26, E-29, E-30, E-33, E-38, E-39, E-44, E-50, E-52 registrations, E-46's fence reclass, E-81's `ACCT_STARTER_GIFT` reclass and the three `CITY_*` leg fixes |

Source: the per-class card tables T03-02..05 (legend at `cards/03/T03-02.md:80-91`, which transcribes 03 §3.4 + §3.3.3 value legs + §3.5.6 + §3.6) plus the errata that registered the rest. Each row's `cols_source` gives the card file:line or the erratum that produced it.

**The `derived` column (74 rows) is a PROVENANCE MARKER, not a membership flag** (E-81 point 1). It names the erratum or ruling the row came from. A derived row is a **full member** of the catalog: postable, classed, counted. The generator emits `derived: true, derivedFrom: '<erratum>'`. `derived` never filters anything.

**The generator's contract** (`packages/engine/ledger/scripts/gen-catalog.mjs`): it reads the canonical `catalog.csv` + `aliases.csv` + `legpolicy.csv` from `export/ledger-ref`, resolved from the script's own location so it runs from any checkout; it **refuses to emit** a seed that breaks the class→template rule (03 §3.3.3) or that carries a malformed leg value; and it is **idempotent** — regenerating from the canonical inputs reproduces the committed files byte for byte.

`restrictedOk = Y`: 44 codes in the current catalog. The E-21 change (`ACCT_LICENSE_FEE` → N) and the E-22 14B life rows are applied.

`aliases.csv`: 56 rows — the 26 24 §8 alias rows, the 2 PD-12 aliases, and the later registrations (E-26, E-29, E-38, E-39, E-44, E-50).

## legpolicy.csv (E-11, 2026-10-21 00:30 CEST)
Generated by `gen_legpolicy.py` (run: `python3 gen_legpolicy.py > gen_legpolicy.out`). 456 rows, one per code: legA and legB each with default, policy, allowed set and source, plus `negative_swap` and `ambiguous` columns. **The catalog's `legA`/`legB` columns are the DEFAULT leg (one account); an allowed SET (`5200|5050`) lives here, in the `legA_allowed` column with policy `CLASS`** — E-29 for `CITY_COSMETIC`/`CITY_NAMING_RIGHT`/`CITY_SPONSORSHIP`, whose catalog default is `5200`.
