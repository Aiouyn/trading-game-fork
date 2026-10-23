# Studio verdict — T10A-12 `DISTRICT_ROLE_MIX` (8-row table, recut)


---

## ANNOTATION (Producer, added at review) — read the HEALTH/LUXURY use-class premise below before relying on this record

*Find it by text, not by line number — line numbers shift when this annotation is edited. Grep: `use class for HEALTH or LUXURY`.*

**This record predates E-82 and E-84. Two of its premises are superseded; its findings are not.**

**E-82** replaced the per-sector use-class reading this review assumes. Where this document rests on
*"10 §3.3.1 names no use class for HEALTH or LUXURY"*, that is **no longer true**:

| Class | E-82's ruling |
|---|---|
| `HEALTH` | **OFFICE** via `hl_hospital`, `hl_lab`; **RETAIL** via `hl_clinic` |
| `LUXURY` | **RETAIL** + **INDUSTRIAL** via `lx_atelier` |

E-82 measures **0 unmapped and 0 ambiguous** at facility level. The review's premise was written
against a sector-level reading; the facility-level map resolves it.

**E-84** superseded the card's `28 / 13 / 2` lot-type split with **`30 / 13 / 0`** (`CAMPUS` is a
**derived** lot type: `offices` + area ≥ 8,000 m² + frontage ≥ 60 m). This record's *"28 of 43
unplaceable"* is a **different metric** — footprint feasibility on the reference map — not the card's
lot-type split. **Same number, two metrics.** Do not read them as the same claim.

**What this annotation does NOT do:** it does not alter Studio's findings, its six fix items, or its
refusal to sign off. Those stand as written and were judged on their own reasoning. It records only
that two premises have moved.


**Reviewer:** Studio (Avalon Studio) · **Date:** 2026-10-22 · **Card:** `export/build-plan/cards/10A/T10A-12.md` (DECISION D-10A-12-MIX)
**Question asked:** does the new 8-row table read like a place? In particular, a CBD with `RETAIL_CONSUMER 0`.

**Short answer:** the *character* of the table is right and I approve its shape. But the table as written
does **not** determine what you see, because the unit it is denominated in — the non-RES parcel count of
a district — is not written down anywhere yet, and the same cell buys 5× more facilities at one parcel
count than at another. Two of the eight rows are arithmetically unreachable at the facility level.
**None of that requires changing a number; all of it requires saying what the number means.**

---

## 1. What I verified myself (not taken on trust)

I re-derived the Producer's cell-by-cell diff from the pre-recut card in git rather than from the
summary, and re-ran the biconditional against City Dev's in-flight `rules.ts`.

**Pre-recut prose** (`git show a90874ba597a:export/build-plan/cards/10A/T10A-12.md`, line 144) is
exactly as the Producer described: one prose line, `PROVISIONAL [Quant/Studio]`, with `other 50` in PORT
and `other 60` in INDUSTRIAL, and no HEALTH/LOGISTICS/MANUFACTURING for CBD.

**The re-cut table, parsed from the card** (8 rows × 13 sectors = 104 cells):

```
row           sum    zero cells
CBD           1000   3
PORT          1000   8
INDUSTRIAL    1000   4
MIXED_CORE    1000   4
MIXED_RIVER   1000   2
TRANSIT_HUB   1000   3
PRIME_RES     1000   4
TROPHY_RES    1000   9
total cells 104 | zero cells 37 | rows not summing to 1000: 0
```

**37 zero cells — matches Quant and the Producer exactly.** All 8 rows sum to 1000. The Producer's
correction stands and I confirm it: the old CBD row did sum to exactly 1000 with no "other" bucket, so
the Designer's self-correction was right.

**The diff, re-derived from the pre-recut prose:** I count **7 cells changed in value**, not 8. The
Producer counted 8 by also counting the removal of the `OTHER_BUCKET` from PORT. On the "cells changed
value" reading it is 7 (CBD 6: ENERGY 40→35, HEALTH absent→80, LUXURY 80→70, MEDIA 50→45, MINING
30→25, REAL_ESTATE 70→65, RETAIL 50→0; PORT 1: FOOD 50→0; INDUSTRIAL 0). The 8th is the bucket removal.
**This is a counting-convention difference, not a disagreement about the table** — flagging it only so
nobody re-litigates it later. 5 newly listed, 2 "other" buckets gone: all confirmed.

**Biconditional, re-run against the current code: 0 violations across 104 cells.** Quant's result holds
against the *code* as well as against the card, not just the card's "Allowed roles" column. (I raised
one violation mid-review — `TROPHY_RES × SECURITY_LEGAL_INTEL 0` — and City Dev amended `rules.ts` at
04:48 to exclude TROPHY_RES from `sl_law_firm` and `sl_cyber`. It is fixed in the in-flight code; no
action needed from the Designer on that cell.)

**One card-vs-code divergence remains, and it is a card-text fix, not a number:** the card's sector
rules table gives FOOD_HOSPITALITY's allowed roles as *MIXED_CORE, CBD, TRANSIT_HUB + MIXED_RIVER,
PRIME_RES* — it does not name TROPHY_RES. The code allows `fh_restaurant` in TROPHY_RES (one per
district). The mix's `TROPHY_RES × FOOD_HOSPITALITY 80` cell depends on that, and the card's own
sentence *("nothing in TROPHY_RES except one `fh_restaurant` per district")* lives in the **hard
exclusions** column, not the allowed-roles column. So the card is self-consistent in prose but the two
columns disagree with the code. Worth one line in the card; not a numbers change.

---

## 2. Does each row read like a place? — the character, judged

**CBD: 300 FINANCE, 120 TECH_AI, 120 SECURITY, 140 FOOD, 80 HEALTH, 70 LUXURY, 65 REAL_ESTATE, 45 MEDIA, 35 ENERGY, 25 MINING, 0 RETAIL.**
Yes — and the "no retail" worry is the wrong worry. Two reasons:

1. **The street-level trade is not missing, it is under two other labels.** `FOOD_HOSPITALITY 140`
   (café, restaurant, food hall, hotel — all street-facing) plus `LUXURY 70` (boutique, flagship, atelier
   — all street-facing) = **210 permille of ground-floor trade**, and `LUXURY` is explicitly *"CBD (main
   avenue)"*. A CBD with 210 permille of cafés, restaurants, boutiques and flagship stores does not read
   as a financial park. It reads as an expensive shopping street with an exchange on it.
2. **Spec 10 §3.19.4 already puts retail in the CBD, in the podium.** *"commercial (shops → offices →
   towers; **ground floors of commercial parcels become storefront slots**)"*, and §3.19.5's grammar is
   `Lot → Podium(h_p) Shaft(h_s) Crown`. So a `CBD_TOWER` in Financial Mile **already carries retail in
   its podium** under spec 10, and the podium's use class is not this card's business. The cell `0` does
   not remove retail from the city; it says *no standalone retail parcel* in the CBD.

That is a real and legible distinction — high street in the podium, no out-of-frame big-box or suburban
strip in the CBD. **I approve `RETAIL_CONSUMER 0` for CBD and I do not want it changed.** The one thing
I want added is a sentence in the card saying this, because the next reader will have exactly the
Producer's worry and will file it again. (Verified: **no** retail facility lists CBD in `allowedRoles`
— `rc_shop`, `rc_supermarket` and `rc_big_box` all exclude it. The cell is correct.)

**PORT: 450 LOGISTICS, 150 ENERGY, 150 MINING, 150 MANUFACTURING, 100 REAL_ESTATE, 0 FOOD.**
Reads as the dock, yes — and the `0 FOOD` is right: a canteen on a quay is not a district character.
(Verified: **no** food facility lists PORT in `allowedRoles`.) But `REAL_ESTATE_SERVICES 100` in a port
is the wrong *facility*, not the wrong *number*. The three real-estate facilities legal in PORT are
`re_agency` (shopfront), `re_office` (office tower) and `re_builders_yard` (warehouse, 2,000–10,000 m²).
A port with 100 permille of **offices and agencies** does not read as the dock — it reads as a dock with
a mini-CBD. The dock's real character is `log_port_terminal` (STS cranes), `en_tank_farm` (tanks,
flares), `ma_bulk_terminal` (ship loaders) and `mf_heavy` (chimneys) — none of which is real-estate.
**This cell should carry the yards, not the offices.** The card's own rule already says *"yards never
outside INDUSTRIAL/PORT"*, so `re_builders_yard` is legal here and is the right facility. See §4(d) —
**this is a U1 rules-table question, not a number question, and I am not asking for a number change.**

**INDUSTRIAL: 400 MANUFACTURING, 200 LOGISTICS, 100 ENERGY, 100 TECH_AI, 80 REAL_ESTATE, 60 RETAIL, 30 MEDIA, 20 MINING, 10 SECURITY.**
Reads as the workshop belt — plant halls, sheds, a gasholder, a silo. Good. Two caveats, both in §4.

**TROPHY_RES: 600 LUXURY, 200 REAL_ESTATE, 120 HEALTH, 80 FOOD.**
The hill: boutiques and ateliers, estate agents, a private clinic, one restaurant. Good. But `FOOD 80`
is **unreachable** — the rules cap the trophy district at *one* `fh_restaurant` per district, and it is
the *only* food facility legal there (`fh_cafe`, `fh_food_hall` and `fh_hotel` all exclude TROPHY_RES).
See §4(b).

**MIXED_CORE / MIXED_RIVER / TRANSIT_HUB / PRIME_RES** — food-and-shop rows with a tech/services
spine; a station with venues, clinics and depots; Glasshill with tech campuses, law firms and boutiques.
All read correctly. I have no objection to any of the five rows the Producer did not ask about.

---

## 3. The finding that matters more than the numbers: the unit is undefined

This is the part I want the card to fix, and it is why I am not simply saying "approve".

**The mix is per-mille of non-RES assigned *parcels*.** The card says so. So the mix is a statement
about *how many facilities of each sector*, not about how much land, not about how much floor area, and
not about how much of the eye's attention a sector gets. Those are three different things, and this
table only controls the first.

**The denominator does not exist yet.** `packages/citygen/src/parcels.ts` is T10A-03's file and it has
not landed (`git ls-tree origin/main -- packages/citygen/src/` returns nothing). The parcel count per
district is therefore unwritten, and the mix is a per-mille of a number nobody has fixed yet.

Here is what the same cell buys, in facilities, at plausible denominators:

```
role        cell                     denom 20   denom 40   denom 60   denom 99    denom 195
CBD         FINANCE 300               6         12         18         30          59
PORT        LOGISTICS_TRANSPORT 450    9         18         27         45          88
INDUSTRIAL  MANUFACTURING 400          8         16         24         40          78
```

One parcel = 83 permille at 12 parcels, 10 permille at 99, 5 permille at 195. **A cell of 80 means one
facility at one denominator and sixteen at another.** The table therefore does not pin down the number
of buildings in a district — and "how many towers are on the Financial Mile" is exactly the question a
legibility table is supposed to answer.

**And the failure mode is not symmetric.** Land need scales with the facility, not with the parcel
count, and *the mix says nothing about which facility wins*. Measured against the reference map
(Financial Mile: 99 parcels, district hull 42,735 m²; Industrial Basin: 189 parcels, hull 72,516 m²):

```
CBD  FINANCE 300  -> 30 facilities
     fin_exchange   90- 300k m2 =  2.11x -  7.02x the district's land
     fin_tower      60- 240k m2 =  1.40x -  5.62x the district's land
     fin_branch     (the third legal one) low shopfronts, no tower, no skyline
     => the same cell spans 1.40x to 7.02x the land, depending only on WHICH facility the solver picks
```

And the extremes, per cell:

```
PORT        LOGISTICS_TRANSPORT 450 -> 88 facilities
     log_port_terminal  1760-10560k m2 =  21.6x - 129.7x hull
     log_courier_hub         9-   53k m2 =   0.11x -   0.65x hull
     => one cell, 0.11x to 129.71x the district's land
INDUSTRIAL  TECH_AI 100 -> 19 facilities, tech_datacenter only
     95 000-760 000 m2 = 1.31x - 10.48x hull, before the en_plant that ENERGY 100 also demands
     and before the substations those data centres need within 800 m
```

**Same cell. Opposite failures: a parade or an overflow.** Nothing in the table says which you get.
That is the gap I am reporting, and it is a *unit* problem, not a *number* problem.

**Two cells are outright unreachable at the facility level:**

1. **`TROPHY_RES × FOOD_HOSPITALITY 80`.** `fh_restaurant` is the *only* food facility legal in
   TROPHY_RES and it is capped at **one per district**. The cell asks for 80 permille. At any
   denominator of 20 or more that is 2+ restaurants against a hard cap of 1; at the reference map's 65
   parcels it is 5. The solver's mix-deficit term will chase a target it can never close, and that
   deficit will distort every other decision it touches.
   *No edit of the denominator fixes this — the cell has to come down.* At `FOOD 20` the cell is
   satisfiable at every denominator I tested (0 or 1 restaurant, cap 1, never over).

2. **`INDUSTRIAL × TECH_AI 100`.** The only tech facility legal in INDUSTRIAL is `tech_datacenter`
   (DC_SITE, 5,000–40,000 m², needs GRID_MW and an `en_substation` within 800 m). 100 permille of 189
   reference parcels = **19 data centres, 95,000–760,000 m² = 1.3×–10.5× the district hull** (72,516
   m²) — before the `en_plant` that `ENERGY 100` also demands, and before the substations those data
   centres need. A basin with 19 hyperscale data centres does not read as a workshop belt; it reads as a
   second financial district, and it is not physically placeable.

   **And it is worse than that: the cell is unplaceable at ANY per-mille value.** `tech_datacenter`
   needs 5,000 m² and the largest Industrial Basin parcel on the reference map is **207 m²**. So
   `INDUSTRIAL × TECH_AI` is decoration until T10A-03's parcels exist — the same is true of
   `fin_exchange` in Financial Mile (needs 3,000 m², largest parcel 240 m²) and `log_port_terminal` in
   Eastside Docks (needs 20,000 m², largest parcel 202 m²). See §4(f).

**And one cell is an artefact rather than a decision.** `CBD × MINING_AGRICULTURE 25` requires
`ma_trading_office` (OFFICE_TOWER, 400–3,000 m²) — the only mining facility legal in a CBD. A CBD with
2–3 mining trading offices is a commodity-trading floor, which is a legitimate read for a financial
mile, but Systems' ruling 7 says *"mines and farms are never placed inside a city envelope's developed
core"*, and this is the only mining in a core role. It is legal and I do not object — but it should be
a deliberate one, and today it is an artefact of "MINING was in the old CBD row at 30, so it stays at 25".

---

## 4. What I am asking for — no new numbers, one unit and one sentence

I am **not** asking for a rewrite and I am **not** asking for the table to be re-calibrated. I am asking
for four specific things, and three of them are one-number changes.

**(a) Say what the unit means, in the card.** One sentence: the mix is a target **share of assigned
facilities**, the solver reads the deficit as a count, and the count lands where the district's parcel
count puts it. Then state the resolution: either the card fixes a target facility count per role (so the
denominator stops being an accident), or it states that the mix is a **relative priority** between
sectors — *"if you place a finance parcel, prefer finance; if a tech parcel, prefer tech"* — and the
per-mille numbers are only ever read as a **ratio**, with the absolute count left to the land.

I would take the second reading for the legibility purpose the card actually serves. **The ratio is what
the eye reads; the count is what the land does.** Stating that honestly is better than a table that
implies a count it cannot deliver. And it costs nothing: the table stays exactly as it is.

**(b) `TROPHY_RES × FOOD_HOSPITALITY 80 → 20`**, with `REAL_ESTATE_SERVICES 200 → 260` to keep the row
at 1000. One restaurant on the hill, not five. The hill is a hill. *(Verified: both rows sum to 1000
and both stay clean against the current `rules.ts`.)*

**(c) `INDUSTRIAL × TECH_AI 100 → 40`**, with `MANUFACTURING 400 → 460` to keep the row at 1000. The
Basin keeps its identity as the workshop belt; the data-centre content drops to a couple of halls rather
than 19 (8 data centres, 0.55×–4.41× hull, placeable). If the owner wants the Basin to be a
data-centre district, that is a bigger design decision and it should be taken on the *map*, not by
accident in a per-mille cell. *(Verified: row sums to 1000, biconditional clean.)*

**(d) `PORT × REAL_ESTATE_SERVICES 100` — NO number change.** I said above the port's real-estate cell
is carried by the wrong *facility* (`re_office`/`re_agency` instead of `re_builders_yard`), and the fix
is in the **rules table** — the card already says *"yards never outside INDUSTRIAL/PORT"*, so the port
should prefer `re_builders_yard` — not in the mix cell. The cell stays 100; the *facility* the port gets
from it should be the yard. That is a U1 rules-table question, not a number question, and it is
City Dev's and the Designer's, not mine.

**(e) The FOOD_HOSPITALITY allowed-roles column** (§1): the card's rules table does not name TROPHY_RES
in FOOD's allowed roles while the code does. One line of card text, so the two columns agree.

**(f) A count-cap side table next to `DISTRICT_ROLE_MIX`.** A per-mille share table cannot express the
card's own count caps, and there are two of them (both already encoded in the in-flight `rules.ts` as
`maxPer`, so this is a *table* not a *rule* change):
- `fh_restaurant`: **one per district** — `maxPer: { perDistrictRole: { TROPHY_RES: 1 } }` (rules.ts:113). This is the cap that makes `TROPHY_RES × FOOD 80` a contradiction rather than a target.
- `fin_exchange`: **one per city** — `maxPer: { perCity: 1 }` (rules.ts:588). The CBD's anchor, and the largest cell in the table.

The card's rules table states both caps in prose but the mix table has no column for them, so nothing
in `AC-10A-12-MIX-SUM` can see them. Without the side table, either U1 fails the audit or City Dev
silently places five restaurants on the hill. And **`AC-10A-12-MIX-SUM` is not a sufficient check on
its own**: a row can sum to 1000 and still be unsatisfiable. The biconditional plus the count caps are
what make the table checkable.

**(g) The footprint ranges do not fit the reference map's parcels, and the card asserts an audit over
exactly that map.** `FacilityRule.footprintM2` is a *"parcel area range, inclusive"* and suitability
EXCLUDES a parcel whose area is outside it, so a facility needs a parcel at least as big as its
minimum footprint. Measured on the **parcel** basis (the fixture's `w x d` polygon — the subdivision
cell `lw x ld` is a different, larger number, and the earlier Studio note used that one):

```
district                      n    parcel med/max      cell med/max
financial_mile               99   131 / 240            226 / 305
eastside_docks              195   135 / 202            238 / 270
industrial_basin            189   119 / 207            207 / 294
old_harbor                  255   132 / 225            212 / 296
glasshill                    85   289 / 548            485 / 848
summit_estates_on_gilt_hill  65   241 / 408            464 / 636
ALL                        1174   131 / 548            228 / 848
```

**28 of the 43 facility classes can never be placed on any parcel of the reference map**, including
`fh_hotel`, `rc_supermarket`, `rc_big_box`, `re_builders_yard`, `log_port_terminal`, `log_warehouse`,
`en_hq`, `en_tank_farm`, `en_plant`, `ma_bulk_terminal`, `mf_plant`, `mf_heavy`, `mf_chip_fab`,
`tech_campus`, `tech_datacenter`, `fin_exchange`, `fin_tower`, `me_studio`, `hl_hospital`, `hl_lab`.

That includes **every anchor `AC-10A-12-ANCHORS` requires**: `fin_exchange` (min 3,000 m², largest
Financial Mile parcel 240 m²), `log_port_terminal` (min 20,000 m², largest Docks parcel 202 m²),
`hl_hospital` (min 15,000 m²). None is placeable.

I am **not** asking for a footprint number to change — the real parcels come from T10A-03's block/parcel
stage, which does not exist yet, so this is a T10A-03 question and not a legibility one. I am asking
for a note in the card that the footprint ranges are calibrated against the **engine's** parcels, not
the reference fixture, and that U6's reference map must either be regenerated with parcels big enough
for the anchors, or the audit must be scoped to the facilities that fit. Otherwise
`AC-10A-12-ANCHORS` is unbuildable as written and City Dev will burn a day discovering it.

**(h) The card should say which facility the solver prefers per (role, sector) cell.** The rules table
carries one "Preferred roles" column per **sector**, but the data model is per **facility**
(`FacilityRule.preferredRoles`). `CBD × FINANCE = 300` can mean 30 exchanges (3,000 m² each) or 30
branches (80 m² each) — different cities. Until the card says, `AC-10A-12-AUDIT-REF`'s ±150 per-mille
tolerance is not a meaningful test.

---

## 5. On the leak finding

The Producer accepted my leak finding and asked Quant to rule on whether the use-class-mediated channel
violates "placement has no economic link" or is a tolerated consequence. That is Quant's call and I am
not touching it. I will only note that the narrowing the Producer proposed is the right one and that
**the second clause of `AC-10A-12-NO-ECON` must be a test, not a paragraph** — a test the card can
actually fail. My position does not change either way: the table is legibility, the numbers are a
legibility choice, and none of what I have written above depends on the economic half.

---

## 6. Bottom line

- **The character of the 8 rows is right.** I would not rewrite the table. The CBD, the dock, the basin,
  the hill and the five other rows each read as a recognisable place.
- **`CBD × RETAIL_CONSUMER 0` is correct and I want it kept.** The trade is in the podium
  (spec 10 §3.19.4) and in the 210 permille of café/boutique frontage. Add one sentence to the card
  saying so, and it will not be re-raised.
- **But the table does not yet determine what you see, because the unit is undefined.** That is the
  blocker I care about, and it is a card-text fix, not a numbers fix.
- **Two cells are unreachable** (`TROPHY_RES × FOOD 80`, `INDUSTRIAL × TECH_AI 100`). Both are
  one-number changes on a complete table.
- **The footprint ranges do not fit the reference map the card audits.** 28 of 43 facility classes,
  including every anchor `AC-10A-12-ANCHORS` requires. That is a card-text fix (§4(g)).
- **Do not re-cut for this.** The Producer's correction is accepted and confirmed: 8 changed cells
  (7 values + 1 bucket removal), 5 newly listed, buckets gone, 37 zeros, all rows 1000, biconditional
  clean against the card **and** against the current code.

**Verdict: the table's *character* is approved. The table's *unit* is not yet defined, two cells are
unreachable, and the footprint ranges do not fit the audited map. Fix (a), (b), (c), (e), (f), (g) and
(h), and I sign off the rest.**

---

### Reconciliation note (2026-10-22 05:01)

An earlier Studio run of this task posted a fuller review at 04:42
(`studio-review-t10a-12-mix.md`), and my own 04:56 comment duplicated it. **The 04:42 review stands as
the review**, with three corrections carried by this document and by my 05:01 board comment:

1. **DEFECT B's figures change on the correct basis.** The 04:42 review measured the fixture's
   subdivision **cell** (`lw x ld`); the footprint range applies to the **parcel** (`w x d`). On the
   parcel basis the figure is **28 of 43 facility classes** unplaceable, not 23 of 37 — and the anchors
   are unplaceable at *any* per-mille value, not merely implausible.
2. **`TROPHY_RES × FOOD_HOSPITALITY` should go to 20, not 0.** The 04:42 review proposed 0. The
   Producer says Quant is restating `AC-10A-12-MIX-SUM` as the biconditional, and `fh_restaurant` **is**
   allowed in TROPHY_RES — so a cell of 0 makes the biconditional false for that cell (verified: 1
   violation). At 20 the row still sums to 1000, the biconditional stays clean, **and** the target is
   reachable at every denominator (0 or 1 restaurant against the cap of 1). This supersedes the 04:42
   value.
3. **The 50-number change list in the 04:42 review is unchanged and is mine to hand over**, but the
   card should carry the unit statement, the count-cap side table and the parcel-basis note whatever
   the numbers end up being.

The 04:42 review's boundary ruling (narrow the Goal's claim, name the `jobsAccess_d → D_d → rent →
demand → location_j` chain, put a test behind it, and note that 10 §3.3.1 names no use class for
HEALTH or LUXURY) is unchanged and supported.

---

### Appendix — how the numbers above were produced

Tooling only, read-only, no engine code and no e2e suite (RAM ~92% as instructed):

- the mix table and the 104-cell biconditional were parsed from the card markdown and re-run against
  City Dev's in-flight `packages/citygen/src/placement/rules.ts` (`wt-city-dev`, untracked working
  file, mtime 2026-10-22 04:48). **Note: that file changed under me during the review** — the
  `TROPHY_RES × SECURITY` biconditional violation I found at 04:40 was fixed by City Dev at 04:48, and
  every claim in this document was re-verified against the 04:48 state. Section 1 states the divergence
  that remains.
- the pre-recut values were read from git at `a90874ba597a` (the commit the Producer cites);
- the parcel counts, parcel areas and district hull areas were measured by running the reference fixture
  `tests/e2e/city/fixtures/generate-city.ts` at `REFERENCE_SEED 20261020` — 99 parcels in Financial Mile
  (median 131 m², max 240 m², hull 42,735 m²), 195 in Eastside Docks (hull 81,414 m²), 189 in
  Industrial Basin (median 119 m², hull 72,516 m²), 65 on Gilt Hill. **These are the reference
  fixture's parcels, not T10A-03's real ones** — that is the point of finding (a): the real denominator
  is unwritten.
- the facility counts, footprint ranges and `maxPer` caps were read from the card's own sector rules
  table and from `rules.ts`.

Probes are in the Studio scratch dir. **The card was not modified by this review.**
