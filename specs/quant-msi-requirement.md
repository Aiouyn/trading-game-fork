# MSI requirement — what `msi()` must become

**Owner:** Quant. **Custodian of the code:** Systems/Engine Dev via **T03-24**.
**Status:** BLOCKER for E-76. Currently `packages/engine/ledger/src/stubs.ts:16-17` is
`export const msi = (): number => 1;` — a constant 1, so no drift, and no E-76 rerun is possible.
**Spec of record:** 03 §3.8 (formula reproduced verbatim below). T03-24 lists
`packages/engine/ledger/stabilizer/msi.ts` and `msi.test.ts` in its `files:`, and T03-24 is in no
branch on any of the 90 refs.

---

## 1. The formula (03 §3.8, verbatim)

```
design_money(t) = κ · Σ_i w_i · W_target(age_i)      over all characters (not only engaged)
                                                     κ = PARAM.msi_money_share = 0.20
raw(t)          = PEM_FDL(t) / design_money(t)
ema(t)          = ema(t-1) + α · (raw(t) − ema(t-1)),  α = 1 − 2^(−1/28)   (28-GD half-life)
MSI(t)          = clamp( ema(t) / ema_base, MSI(t-1)·(1 − 0.005), MSI(t-1)·(1 + 0.005) )
ema_base        = mean of ema over the world's first 168 game days; MSI = 1.000 during that period
NWI_i(t)        = NWrank_i(t) / MSI(t)
```

`W_target(age)` is the designed median-engaged wealth curve (01 §8.4, §14.3), interpolated
**log-linearly in age**: 5k, 15k, 500k, 20M, 300M, 2B, 6B FDL, then × (1 +
`stab_target_growth_after_year` = 0.001) per real day past the last point. `w_i` is the
activity weight; `age_i` is real days since character creation (ticks / 17,280).

## 2. Inputs, and who owns each

| Input | Source | Owner task | Present today? |
|---|---|---|---|
| `PEM_FDL(t)` | player-economy money, per currency | **T03-11** (`money/aggregates.ts`) | ✗ |
| `W_target(age)` | designed wealth curve, log-linear | 01 §8.4 data + **T03-24** (`stabilizer/target.ts`) | ✗ |
| `age_i`, `w_i` | character age in real days, activity weight | **T03-17** (`networth/`), T03-08 | ✗ |
| `NWrank_i(t)` → NWI | consolidated look-through NW | **T03-17** (`networth/nw.ts`) | ✗ |
| `msi_money_share` = 0.20 | param registry | already registered | ✓ (param only) |

**Dependency order: T03-11 → T03-17 → T03-24.** MSI cannot be built before T03-11 and T03-17
exist; it is the last of the three, not the first. `NWI` is a one-line consequence once `MSI`
exists — it needs no separate design work.

## 3. What a test asserts that fails without it

Each of these fails against `msi() => 1` and passes only against the real implementation:

1. **MSI moves.** Hold `PEM_FDL` at 2× the design path for 60 GD; assert `MSI` rises above
   1.02 and `NWI` falls correspondingly. Against the stub, `MSI` is 1 forever → FAIL.
2. **The clamp binds.** Feed a single-day `PEM_FDL` jump of +50%; assert
   `|MSI(t)/MSI(t-1) − 1| ≤ 0.005`. Against a naive `PEM/design` this fails; against the stub it
   also fails (no movement at all, so the test asserts movement *and* the band).
3. **The EMA has the specified half-life.** A step input reaches ~50% of its final move in 28 GD
   (α = 1 − 2^(−1/28)); assert the 28-GD value within 1%. A wrong α fails.
4. **The base is the first 168 GD.** Assert `MSI ≡ 1.000` for GD ≤ 168 and that `ema_base` is
   the mean of `ema` over exactly that span. An implementation that normalises on GD 0 only fails.
5. **Every character counts in `design_money`, not only engaged ones.** Add an inert character
   with a large `W_target(age)`; assert `design_money` rises. Using only `N_a` fails.
6. **Log-linear interpolation in age.** Assert `W_target` at the geometric midpoint of two curve
   points equals the geometric mean of their values (not the arithmetic mean).

## 4. THE CLIFF — the reason this card is urgent

> **E-76 (b) flips to FAIL when the measured MSI drift exceeds `0.293 %/GD`, i.e. decimal
> `0.00293`. The placeholder `msi_drift_per_gd` is `0.0029` (decimal) = `0.29 %/GD`.**
> **Headroom: `0.003 %/GD` = 3 thousandths of a percent per game day = 0.30 basis points.**

The cliff is on **average**, the tightest style. Full set, all in **%/GD numbers** as the errata
print them (divide by 100 for the decimal form the registry stores):

| Style | AC (b) cliff | decimal | headroom over placeholder |
|---|---|---|---|
| **average** | **0.293** | **0.00293** | **0.003 %/GD = 0.3 bp** |
| managed | 0.304 | 0.00304 | 0.014 %/GD = 1.4 bp |
| excellent | 0.566 | 0.00566 | 0.276 %/GD = 27.6 bp |

AC (a) has more room but moves the **same** direction: average's P90 real loss is 0.102 against
the 0.11 limit, so it fails at drift **0.298 %/GD** — 0.5 bp further out than (b). **Both ACs
tighten as drift rises.** A rising drift is never safe.

**Derivation** (`scripts/quant/e76-analyze.ts`, pinned by its tests). `real = nominal − drift`, so
raising the drift by δ lowers every seed's real by δ. Managed and average grow *below* drift, so
the E-60 drag never touches them: `real = g_raw − drift`, and (b) gives
`drift ≤ g_raw + 0.07 = 0.223 + 0.07 = 0.293`. For excellent the drag binds and
`real = (g_raw − drift)(1 − D·w)`, so `real ≥ 0 ⇔ drift ≤ g_raw = 0.566` — a different algebra
and a 27.6 bp margin.

**This is a live risk on a FINAL criterion, not a hypothetical.** `msi_drift_per_gd` is still
**PROVISIONAL** in the 23 registry. If the 03 §3.8 MSI is built and measures above 0.00293, E-76
(b) fails on merge with no code fault anywhere. The person building `msi()` must know the number
the drift is being measured against.

**Unit warning — this number was reported wrong once.** `msi_drift_per_gd` is a *decimal
fraction* (0.0029); every errata table and AC limit is a *%/GD number* (0.29, 0.07, 0.11). Mixing
them is a 100× error. Proof from E-60's own table: excellent at $2B is nominal 0.417 with real
+0.127, so `0.417 − 0.127 = 0.290 %/GD` = decimal 0.0029. **An earlier report of `0.0059` was this
error** (it added the decimal 0.0029 to the %/GD headroom 0.003); the correct decimals are
**0.00293** (cliff) and **0.0029** (placeholder).

## 5. Rerun obligation that comes with this card

E-76's rerun rule: *any change to `msi_drift_per_gd` or to mid-book yields re-runs the AC before
merge.* When T03-24 lands, run:

```
npx tsx scripts/quant/e76-run.ts <batch>.json --drift <measured decimal>
```

20 real seeds per style, the last 400 GD of a 1,400-GD run. Exit code 0 = all ACs pass; 1 = fail;
it prints the cliff per style and names the binding one. `scripts/quant/e76-fixture.json` is the
committed smoke input that proves the runner works today, before MSI exists.
