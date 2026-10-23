# Studio handover — T10A-12 card re-cut, items the Producer approved


---

## ANNOTATION (Producer, added at review) — read before relying on verdict §6 (line 345) / handover §9 (line 478)

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


**Reviewer:** Studio (Avalon Studio) · **Date:** 2026-10-22 · **Review of record:** `T10A-12-mix-verdict.md`
**Producer ruling:** 2026-10-22, "the mix is a RELATIVE PRIORITY between sectors, not a count" + "within-row only"
**Card:** `export/build-plan/cards/10A/T10A-12.md` (fork PR #17, head `37055b2`)
**Owner of the card:** Designer. **Owner of the code:** City Dev. **This document is the handover, not the edit.**

---

## 0. Why this document exists

The Producer accepted the Studio review in full and authorised exactly two number changes. The
rest of the ruling is **card text**, and the card is the Designer's file. This document is the
card-ready text for every item the Producer approved, plus the two numbers, with everything
re-measured against the tree as it stands at 05:30.

**Nothing here needs the owner's call.** Every item below is a card-text or table change the
Producer has already ruled on. The Designer can apply items 1–8 verbatim.

**Read item 4 before item 1.** The unit statement changes what the numbers *mean*, and finding 4
shows that on the reference map 28 of the 67 non-zero cells have **no placeable carrier at all**.
That is not a defect in the mix table; it is a fact about the reference map's parcel sizes, and it
is the same fact as item 6.

---

## 1. (a) The unit statement — the card must say what the number is a number OF

**Producer ruling, verbatim intent:** the mix is a relative priority between sectors, not a count.
The ratio is what the eye reads; the count is what the land does. **Within-row only.**

### Card text (paste into the "Role mix" section, after the `DECISION D-10A-12-MIX` paragraph)

> **What the per-mille numbers mean.** The mix is a **target share of assigned facilities** for
> **one district role**, and it is a **relative priority between sectors, not a count of
> buildings**. The solver reads the mix deficit as a count (`mixDeficit` returns
> `target - current` in per-mille, and the assignment picks the argmax of `score + deficit`), so
> the deficit steers *which sector takes the next parcel*; the **absolute** number of facilities
> in a district is left to the land, because the parcel count per district is not fixed by this
> card. **The per-mille values are only ever compared WITHIN A ROW** — that is, within one
> district role. They are **never compared across rows**: a CBD cell and a PORT cell describe two
> districts with different parcel counts, so comparing them is meaningless (a PORT cell of 450
> does not mean "this port has more of everything"; it means "within the port, logistics takes
> 45% of the share").
>
> **The ratio is what the eye reads; the count is what the land does.**

### Why "within-row only" is a correctness rule, not a style note

The Producer's own example is the proof: the PORT row's `LOGISTICS_TRANSPORT 450` and the CBD
row's `FINANCE 300` are not comparable. Port Avalon has 195 parcels in Eastside Docks and 99 in
Financial Mile, so the same 1000-per-mille denominator means different absolute counts in each
district. A reader who compares the 450 to the 300 concludes the port is "bigger" than the
financial mile, which is a statement about **parcels**, not about **character**.

Measured on the reference map (per-district parcel counts, parcel basis, `REFERENCE_SEED
20261020`):

```
district                     n     median parcel   max parcel
old_harbor                   255       132 m2        225 m2
midtown                      214       121 m2        227 m2
eastside_docks               195       135 m2        202 m2
industrial_basin             189       119 m2        207 m2
financial_mile                99       131 m2        240 m2
glasshill                     85       289 m2        548 m2
riverside_lofts               72       112 m2        222 m2
summit_estates_on_gilt_hill   65       241 m2        408 m2
ALL                          1174       131 m2        548 m2
```

One parcel is 10 permille in Old Harbor and 15 in Financial Mile. **That is the reason a
cross-row comparison is meaningless, and it is why the card must forbid it in words.**

### Card text for the `AC-10A-12-MIX-SUM` heading

The AC should keep reading the table row-wise. One line is worth adding so the AC cannot be
misread as permitting a cross-row check:

> The AC reads each row independently. A test that compares a cell in one row against a cell in
> another row is **wrong**, not merely strict: the rows describe different districts with
> different parcel counts.

---

## 2. (b) `TROPHY_RES × FOOD_HOSPITALITY 80 → 20` — APPROVED, apply it

| cell | before | after |
|---|---|---|
| `TROPHY_RES × FOOD_HOSPITALITY` | 80 | **20** |
| `TROPHY_RES × REAL_ESTATE_SERVICES` | 200 | **260** |

Row stays at 1000. **Verified:** 0 forward violations, 0 reverse violations, 37 zero cells, all
8 rows sum to 1000, with the change applied.

**Why 20 and not 0:** `fh_restaurant` is the only food facility legal in TROPHY_RES, so a cell of
0 would make the biconditional's reverse side false for that cell. 20 keeps the cell non-zero,
keeps the row legal, and is reachable at every denominator I tested:

```
denominator  20 -> 0.40 restaurants      denominator  65 -> 1.30 restaurants
denominator  40 -> 0.80 restaurants      denominator  99 -> 1.98 restaurants
```

against a hard cap of **1 per district** (`maxPer: { perDistrictRole: { TROPHY_RES: 1 } }`,
rules.ts:113).

---

## 3. (c) `INDUSTRIAL × TECH_AI 100 → 40` — APPROVED, apply it

| cell | before | after |
|---|---|---|
| `INDUSTRIAL × TECH_AI` | 100 | **40** |
| `INDUSTRIAL × MANUFACTURING` | 400 | **460** |

Row stays at 1000. **Verified:** 0 forward violations, 0 reverse violations, 37 zero cells, all
8 rows sum to 1000, with the change applied.

The Basin keeps its identity as the workshop belt. **The Producer's framing stands and the card
should carry it:** this is a decision that belongs on the map, not in a per-mille cell, and 40 is
the number that does not smuggle the decision in.

**One measured caveat the card should carry alongside it** (see item 6): on the reference map
`tech_datacenter` needs 5,000 m² and the largest Industrial Basin parcel is **207 m²**, so the
cell is **unplaceable at any per-mille value** until T10A-03's parcels exist. 40 is right because
it is the honest share; it is not right because it makes the cell placeable. **The card must not
imply the latter.**

---

## 4. (h) The preferred-facility statement — and what it measures on the reference map

**Producer ruling:** the card's rules table carries one "Preferred roles" column per **sector**,
but the data model is per **facility** (`FacilityRule.preferredRoles`). Until the card says which
facility the solver prefers per (role, sector) cell, `CBD × FINANCE = 300` can mean 30 exchanges
or 30 branches — different cities — and `AC-10A-12-AUDIT-REF`'s ±150 per-mille tolerance is not a
meaningful test.

### What I measured (this is new; it was not in the 04:42 review)

I re-derived this against City Dev's current `rules.ts` (mtime 04:48, md5
`ea1eabeaeff73db8253e22a65ffabb0d`) and the measured parcel areas. Of the **67 non-zero mix
cells** (104 cells, 37 zeros):

```
UNIQUE  (the solver's PREFERRED score settles it)     35
AMBIGUOUS (2+ preferred candidates, >=3x footprint)  20
NO-PREFERRED (allowed, but nothing is preferred here) 12
```

**The 20 ambiguous cells are the finding.** The largest spreads:

```
CBD        x FOOD_HOSPITALITY   140   200.0x   fh_cafe[40-250] … fh_food_hall[800-3000]
MIXED_CORE x FOOD_HOSPITALITY   280   200.0x   fh_cafe[40-250] … fh_food_hall[800-3000]
TRANSIT_HUB x FOOD_HOSPITALITY  220   200.0x   fh_cafe[40-250] … fh_food_hall[800-3000]
INDUSTRIAL x MANUFACTURING      460   200.0x   mf_light[600-5000] … mf_chip_fab[30000-120000]
PORT       x LOGISTICS_TRANSPORT 450  150.0x   log_port_terminal[20000-120000] … log_depot[800-4000]
INDUSTRIAL x ENERGY            100   125.0x   en_plant[10000-50000] … en_substation[400-2500]
PRIME_RES  x TECH_AI           250    80.0x   tech_office[500-6000] … tech_campus[8000-40000]
CBD        x REAL_ESTATE_SERVICES 65   75.0x   re_agency[40-200] … re_office[400-3000]
MIXED_CORE x RETAIL_CONSUMER   220   166.7x   rc_shop[30-400] … rc_supermarket[1500-5000]
CBD        x LUXURY              70    50.0x   lx_boutique[60-600] … lx_flagship[600-3000]
TROPHY_RES x LUXURY             600    50.0x   lx_boutique[60-600] … lx_flagship[600-3000]
MIXED_CORE x HEALTH              70   400.0x   hl_hospital[15000-60000] … hl_clinic[150-1500]
TRANSIT_HUB x HEALTH             80   400.0x   hl_hospital[15000-60000] … hl_clinic[150-1500]
```

A `MIXED_CORE × HEALTH 70` cell can be 70 clinics (150–1,500 m²) or 70 hospital campuses
(15,000–60,000 m²) — a **400×** difference in what one cell buys, and the two are different
kinds of city.

**And the 12 NO-PREFERRED cells are the same defect one level down.** The sector is legal in
that role, but no facility of that sector lists the role in `preferredRoles`, so the solver gets
**no PREFERRED score** and the mix deficit is the only signal:

```
CBD         x HEALTH              80   allowed=[hl_clinic, hl_lab]
PORT        x REAL_ESTATE_SERVICES 100  allowed=[re_agency, re_office, re_builders_yard]
MIXED_CORE  x LUXURY              70   allowed=[lx_boutique, lx_flagship, lx_atelier]
MIXED_CORE  x SECURITY_LEGAL_INTEL 100 allowed=[sl_law_firm, sl_cyber, sl_guard_depot]
MIXED_RIVER x FOOD_HOSPITALITY    220  allowed=[fh_cafe, fh_restaurant]
MIXED_RIVER x REAL_ESTATE_SERVICES  90 allowed=[re_agency, re_office]
MIXED_RIVER x HEALTH               50  allowed=[hl_clinic, hl_lab]
MIXED_RIVER x SECURITY_LEGAL_INTEL  60 allowed=[sl_law_firm, sl_cyber, sl_guard_depot]
TRANSIT_HUB x REAL_ESTATE_SERVICES 130 allowed=[re_agency, re_office]
PRIME_RES   x FOOD_HOSPITALITY     60  allowed=[fh_cafe, fh_restaurant]
PRIME_RES   x REAL_ESTATE_SERVICES  90  allowed=[re_agency, re_office]
TROPHY_RES  x REAL_ESTATE_SERVICES 260  allowed=[re_agency, re_office]
```

Eight more cells are the **sole legal facility that is not preferred in that role** — the solver
has exactly one candidate and no PREFERRED score to help it:

```
PORT        x MANUFACTURING      150  mf_heavy       INDUSTRIAL x MINING_AGRICULTURE   20  ma_grain_silo
INDUSTRIAL  x MEDIA_ENTERTAINMENT 30  me_studio      INDUSTRIAL x SECURITY_LEGAL_INTEL 10  sl_guard_depot
MIXED_CORE  x ENERGY              20  en_substation  MIXED_CORE  x MEDIA_ENTERTAINMENT 90  me_venue
MIXED_RIVER x ENERGY              30  en_substation  MIXED_RIVER x MANUFACTURING        30  mf_light
```

### Card text (paste after the sector rules table)

> **Which facility carries a cell.** The sector rules table above carries one "Preferred roles"
> column per **sector**, but the data model is per **facility** (`FacilityRule.preferredRoles`),
> and the mix cell is per **sector**. So the card must say which facility the solver prefers for
> each (role, sector) cell, because a cell value does not determine the building: `CBD × FINANCE
> = 300` may be 30 exchanges (3,000–10,000 m² each) or 30 branches (80–400 m² each), and those are
> different cities. Measured on the current rules table: of the **67 non-zero cells**, **20** have
> two or more equally-preferred candidates whose footprint ranges differ by 3× or more (up to
> **400×**, `MIXED_CORE × HEALTH`), **12** have no preferred facility at all (the sector is legal
> there, but nothing lists that role as preferred), and **8** have a single legal facility that is
> not preferred in that role. **Until the card names the carrier facility per (role, sector)
> cell, `AC-10A-12-AUDIT-REF`'s ±150 per-mille tolerance is not a meaningful test**, because the
> histogram compares sector shares and the sector share is not what the card looks like.
>
> **What U1 must therefore deliver.** `FACILITY_RULES` names, for each (role, sector) cell that
> `DISTRICT_ROLE_MIX` gives a non-zero value, **the facility the solver prefers in that role** —
> at most one — so the cell has a single carrier. Where the sector table's preferred roles are
> role-wide but the facilities disagree, the **facility** wins, because the data model is
> per facility.

**This is a `rules.ts` content question (U1), not a mix-number question**, and it is where the
Producer's item (d) belongs too — see item 5.

---

## 5. (d) The PORT yards preference — a rules-table item, no mix change

**Producer ruling:** no number change. The port's real-estate cell should be carried by
`re_builders_yard`, not `re_office` / `re_agency`. That is a `rules.ts` preference question for
U1.

**Measured, so the Designer and City Dev do not have to derive it:**

- `re_builders_yard` is **allowed in PORT** (the card's own rule: "yards never outside
  INDUSTRIAL/PORT") and is **preferred in INDUSTRIAL** only.
- So today `PORT × REAL_ESTATE_SERVICES 100` is a cell with **no preferred facility** — the
  solver gets no PREFERRED score on the port's largest non-logistics cell, and the choice
  defaults to whatever the footprint filter leaves.
- `re_agency` (40–200 m², shopfront) and `re_office` (400–3,000 m², office tower) are the two
  that remain legal in PORT, and `re_agency` is the only one **placeable** on the reference map's
  Docks parcels (largest 202 m²). **A port carried by `re_agency` is a port with 100 permille of
  estate-agent shopfronts — a mini-CBD, not the dock.**

**Card text (paste into the REAL_ESTATE_SERVICES row of the sector rules table, or beside it)**

> `re_builders_yard` is preferred in **PORT** as well as INDUSTRIAL: the port's
> `REAL_ESTATE_SERVICES` cell (100) is carried by the **yards**, not by `re_office` or
> `re_agency`. A port of offices and agencies does not read as the dock.

**City Dev's file, not the card's** — but the card should say it so the rules table and the
rules data agree (the Producer has told City Dev separately; this is the card-side statement of
the same decision).

---

## 6. (g) The footprint-calibration note, and what U6 does about the reference map

**Producer ruling:** the footprint ranges are calibrated against **the engine's parcels** (T10A-03's
block/parcel stage), not the reference fixture, because the real parcels come from T10A-03, which
does not exist yet. And the card must say what U6 does about the reference map: either the map is
regenerated with parcels big enough for the anchors, or **the audit is scoped to the facilities
that fit**. The Producer prefers the second for now.

### Re-measured on the current tree (rules.ts 04:48, fixture unchanged since `39eb7a2`)

**28 of the 43 facility classes can never be placed on any parcel of the reference map** — the
same figure as my 05:01 correction, now re-derived against the current `rules.ts`:

```
unplaceable (28): en_hq, en_plant, en_tank_farm, fh_food_hall, fh_hotel, fin_exchange,
  fin_tower, hl_hospital, hl_lab, log_depot, log_port_terminal, log_warehouse, lx_flagship,
  ma_bulk_terminal, ma_grain_silo, me_broadcaster, me_studio, me_venue, mf_chip_fab, mf_heavy,
  mf_light, mf_plant, rc_big_box, rc_supermarket, re_builders_yard, sl_law_firm, tech_campus,
  tech_datacenter

placeable (15): en_substation(6), fh_cafe(1093), fh_restaurant(741), fin_branch(1156),
  hl_clinic(381), log_courier_hub(998), lx_atelier(998), lx_boutique(1174),
  ma_trading_office(6), rc_shop(1168), re_agency(1041), re_office(6), sl_cyber(2),
  sl_guard_depot(2), tech_office(2)
```

**Every anchor `AC-10A-12-ANCHORS` requires is unplaceable**, and the largest parcel on the
entire map is 548 m²:

```
fin_exchange        3000-10000     biggest parcel anywhere 548 m2   CANNOT FIT
log_port_terminal  20000-120000    biggest parcel anywhere 548 m2   CANNOT FIT
hl_hospital        15000-60000     biggest parcel anywhere 548 m2   CANNOT FIT
en_tank_farm       15000-60000     biggest parcel anywhere 548 m2   CANNOT FIT
mf_heavy           20000-100000    biggest parcel anywhere 548 m2   CANNOT FIT
mf_chip_fab        30000-120000    biggest parcel anywhere 548 m2   CANNOT FIT
tech_datacenter     5000-40000     biggest parcel anywhere 548 m2   CANNOT FIT

financial_mile      n= 99  max parcel  240 m2
eastside_docks      n=195  max parcel  202 m2
industrial_basin    n=189  max parcel  207 m2
```

**The consequence for the mix table, which I measured and which the card needs to carry: 28 of
the 67 non-zero cells have NO placeable carrier in their own district on the reference map.**
Not "the cell is hard to hit" — there is no facility of that sector that can fit a parcel there.

```
CBD        x ENERGY 35, x MINING 25, x TECH_AI 120, x FINANCE 300, x MEDIA 45, x SECURITY 120
PORT       x ENERGY 150, x MINING 150, x MANUFACTURING 150
INDUSTRIAL x RETAIL 60, x ENERGY 100, x MINING 20, x MANUFACTURING 460, x TECH_AI 40,
           x MEDIA 30, x SECURITY 10
MIXED_CORE x ENERGY 20, x MEDIA 90, x SECURITY 100
MIXED_RIVER x ENERGY 30, x MANUFACTURING 30, x TECH_AI 90, x MEDIA 130, x SECURITY 60
TRANSIT_HUB x ENERGY 30, x TECH_AI 70, x MEDIA 80, x SECURITY 40
```

**And the 39 cells that do have a carrier are mostly carried by the small facility.** Example:
`PORT × LOGISTICS_TRANSPORT 450` is carried by `log_courier_hub` (100–600 m²) because
`log_port_terminal` (20,000–120,000 m²) and `log_warehouse` (4,000–40,000 m²) cannot fit a Docks
parcel. **The dock's 450-permille logistics cell is carried by courier hubs.** That is the
practical meaning of the audit being scoped to what fits.

### Card text (paste into the sector rules section, after the footprint column is introduced)

> **The footprint ranges are calibrated against the engine's parcels**, not the reference
> fixture. The real parcels are produced by T10A-03's block/parcel stage, which does not exist
> yet, so these ranges are a **design target for parcels that do not exist yet**. On the
> reference map as it stands (measured on the **parcel** basis — the building footprint `w × d`,
> not the subdivision cell `lw × ld`), **28 of the 43 facility classes can never be placed**,
> including **every anchor** `AC-10A-12-ANCHORS` requires: `fin_exchange` (min 3,000 m² against
> a largest Financial Mile parcel of 240 m²), `log_port_terminal` (min 20,000 m² against a
> largest Docks parcel of 202 m²), and `hl_hospital` (min 15,000 m²). The largest parcel
> anywhere on the reference map is 548 m².
>
> **What U6 therefore does with the reference map.** U6 does **not** regenerate the map — the
> ground mask, street lines, district polygons, landmarks and crown sites are frozen by
> `AC-10A-12-MAP-KEPT`, and the parcels are cut from those frozen blocks, so the map cannot grow
> a 20,000 m² parcel without changing the streets. **Instead, the reference audit is scoped to
> the facilities that fit**: `AC-10A-12-AUDIT-REF` checks the per-sector histogram **for the
> sectors whose facilities are placeable in that district**, and reports the unplaceable
> sectors as a **named exclusion list**, not as a silent pass. The card must not leave City Dev
> to discover this.

### The AC text (the Producer's point, made checkable)

> **AC-10A-12-AUDIT-REF** … Its per-district histogram matches the role mix within ±150
> per-mille **on each sector with ≥ 5 parcels in the district, restricted to the sectors whose
> facilities are placeable in that district on the reference map** (the exclusion list is
> computed from the footprint ranges and the measured parcel areas, and is **printed by the
> test**, so the excluded sectors are visible in CI output and not hidden in the code). A
> **committed mutant** is required: a mutant that drops the placeability restriction must be
> **killed** by this AC (it would let an unplaceable sector pass the histogram by being absent).

**On the ±150 tolerance, the Producer's other point:** with the carrier named (item 4), the
tolerance becomes meaningful — but it should still be stated as **±150 per-mille on the sectors
that have a carrier**, because a cell with no carrier cannot match a histogram at all.

---

## 7. (f) The count-cap side table, and the strengthened AC

**Producer ruling:** two caps, both already encoded in the in-flight `rules.ts` as `maxPer`. The
side table sits next to `DISTRICT_ROLE_MIX` as a **third** table alongside `FACILITY_RULES` and
`BUFFER_M`. **The AC must require both the biconditional and the count caps** — a row can sum to
1000 and still be unsatisfiable.

### The side table (card-ready)

| Facility | Sector | Cap | Grain | `rules.ts` |
|---|---|---|---|---|
| `fh_restaurant` | FOOD_HOSPITALITY | **1 per district** | `maxPer: { perDistrictRole: { TROPHY_RES: 1 } }` | rules.ts:113 |
| `fin_exchange` | FINANCE | **1 per city** | `maxPer: { perCity: 1 }` | rules.ts:588 |

**Measured:** these are the **only two** `maxPer` entries in the current `rules.ts` (43 facility
rules, 2 with `maxPer`). So the side table is complete as of this measurement, and an AC that
reads the table and compares it against `maxPer` will catch a third cap if one is ever added.

### Card text (paste immediately after the mix table)

> **Count caps on the mix (`DISTRICT_ROLE_MIX_COUNT_CAPS`).** A per-mille share table cannot
> express a count cap, and the card has two of them. They are a third static table, beside
> `FACILITY_RULES` and `BUFFER_M`:
>
> | Facility | Cap | Grain |
> |---|---|---|
> | `fh_restaurant` | 1 per district | `perDistrictRole: { TROPHY_RES: 1 }` |
> | `fin_exchange` | 1 per city | `perCity: 1` |
>
> **A row of the mix can sum to 1000 and still be unsatisfiable**, which is why
> `AC-10A-12-MIX-SUM` is not a sufficient check on its own. `TROPHY_RES × FOOD_HOSPITALITY` is
> the case that proves it: `fh_restaurant` is the only food facility legal in TROPHY_RES and it
> is capped at one per district, so a cell of 80 asks for more restaurants than the cap permits
> at any district of 20 parcels or more, and the solver's mix deficit would chase a target it can
> never close. The biconditional **and** the count caps are what make the table checkable.

### The strengthened AC (card-ready)

> - **AC-10A-12-MIX-SUM:** each `DISTRICT_ROLE_MIX` row sums to 1000, **and the table is the
>   biconditional**, in both directions:
>   1. **Forward** — every non-zero entry names a sector that has at least one facility allowed
>      in that role.
>   2. **Reverse** — every sector that has at least one facility allowed in that role has a
>      **non-zero** cell in that row.
>
>   **And the count caps hold.** For every (role, sector) cell with a non-zero value, the
>   number of facilities the cell asks for is **reachable** under the count caps in
>   `DISTRICT_ROLE_MIX_COUNT_CAPS`: at the reference district's parcel count, the cell's implied
>   facility count must not exceed the cap that applies to that sector's carrier facility in
>   that role. A committed mutant is required: a mutant that raises `TROPHY_RES ×
>   FOOD_HOSPITALITY` back to 80 must be **killed** by this AC (the row still sums to 1000, so
>   the sum half does not catch it — the cap half must).

**Note the mutant requirement.** The Producer's point is that a row can sum to 1000 and still be
unsatisfiable. The mutant that proves the AC catches it is exactly the change the Producer
authorised in item 2 — `TROPHY_RES × FOOD_HOSPITALITY 20 → 80`. **The card should require that
mutant by name.** It is a real, committed, killable mutant and it is the cheapest proof the AC
is not vacuous.

---

## 8. (e) The FOOD_HOSPITALITY allowed-roles line

**Producer ruling:** one line of card text, so the card's two columns agree with the code.

**The divergence, measured:** the card's sector rules table gives FOOD_HOSPITALITY's allowed
roles as *MIXED_CORE, CBD, TRANSIT_HUB + MIXED_RIVER, PRIME_RES* — it does **not** name
TROPHY_RES. The code **does** allow `fh_restaurant` in TROPHY_RES (one per district).
`TROPHY_RES × FOOD_HOSPITALITY 80` (now 20) depends on that, and the card's own sentence
("nothing in TROPHY_RES except one `fh_restaurant` per district") lives in the **hard
exclusions** column, not the allowed-roles column. So the card is self-consistent in prose but
the two columns disagree with the code.

### Card text (the allowed-roles cell of the FOOD_HOSPITALITY row)

> `+ MIXED_RIVER, PRIME_RES (cafés, restaurants), **TROPHY_RES (`fh_restaurant` only, one per
> district)**`

---

## 9. The `CBD × MINING_AGRICULTURE 25` deliberateness sentence

**Producer ruling:** the card must say this is deliberate, so the next person does not assume it
was an oversight. One sentence. **The number does not change.**

**Why it needs saying:** `ma_trading_office` (OFFICE_TOWER, 400–3,000 m²) is the only mining
facility legal in a CBD, so 25 permille is 2–3 mining trading offices on the Financial Mile — a
commodity-trading floor. That is a legitimate read for a financial mile, and it is legal. But it
is currently there because "MINING was in the old CBD row at 30, so it stays at 25", which is an
artefact, not a decision. Note also that Systems' ruling 7 ("mines and farms are never placed
inside a city envelope's developed core") is not violated: `ma_trading_office` is a trading
office, not a mine or a farm.

### Card text (paste beside the mix table)

> **`CBD × MINING_AGRICULTURE 25` is deliberate.** `ma_trading_office` is the only mining
> facility legal in a CBD, so this cell is a **commodity-trading floor on the Financial Mile** —
> 2–3 trading offices, legal, and a deliberate read for a financial mile. It is **not** a mine or
> a farm placed in the developed core (Systems' ruling 7 concerns mines and farms, which live
> off-map under the 09 SITE model). It is recorded here so a later reader does not mistake it for
> an artefact of the old row.

---

## 10. The Producer's earlier rulings still outstanding

These were in the Producer's previous message and are still on the Designer's list. I have
nothing to add to them; I am listing them so the handover is complete in one place.

1. **The 22 §3.3 tier fix** — the AC names the tier input (22 §3.3's `Tier` column); the card
   says where the tier comes from and that **T10A-02 is not built**; `classify.ts` must **DERIVE**
   not copy. **Status in the card as of 05:12: DONE** — the Designer has landed this (new file
   `packages/content/data/district-tiers.json`, `AC-10A-12-TIER-DERIVE` with the `role`-column-
   removed mutant, and the 2-ambiguous-flag-groups measurement). **No further Studio work.**
2. **The boundary narrowing** + the **second clause of `AC-10A-12-NO-ECON`** covering the
   indirect channel **as a test the card can actually fail.** **Status: DONE in the card** — the
   Goal, INV-PLC-4 and the exploit analysis are narrowed and clause 2 names the channel and
   requires a committed mutant. **No further Studio work.**
3. **Quant's economic half** — the use-class-mediated channel, the `jobsAccess_d → D_d → rent →
   demand → location_j` chain, the HEALTH/LUXURY use-class gap. **Not waived, not Studio's.**
   QA is not to approve on the mix until Quant has spoken.

---

## 11. What I did NOT do, and why

- **I did not edit the card.** It is the Designer's file and the Designer has an open branch on
  it. This document is the card-ready text.
- **I did not apply the 50-number list from the 04:42 review.** The Producer parked it, and the
  unit statement changes what the numbers mean, so the list may need re-deriving. **It stays
  parked.**
- **I did not touch `rules.ts`.** Items 4, 5 and 6 have `rules.ts` consequences (the carrier
  facility per cell, the port's yards preference, the footprint calibration) and those are U1
  and City Dev's to land. The Producer has told City Dev separately about item 5.
- **I did not ask for any footprint number to change.** The real parcels come from T10A-03, which
  does not exist yet. This is a T10A-03 question, not a legibility one.
- **I did not run the Playwright suite** (RAM ~88%, disk 6.4 GB free, and one Playwright slot on
  this machine, granted to others). Every number in this document comes from reading the tree and
  from the probes listed in §12.
- **I did not touch the running T10A-12 U6 work** (the sector look). My probes read City Dev's
  files read-only.

---

## 12. How every number in this document was produced

All read-only, no engine code run, no e2e suite. Probes are in the Studio scratch dir
(`%LOCALAPPDATA%/hermes/profiles/studio/cache/scratch/`).

| what | how | measured against |
|---|---|---|
| the 8×13 mix table, the row sums, the 37 zero cells | parsed from the card markdown | `wt-designer` card, working copy 05:12 |
| the biconditional, forward and reverse | re-run against `FACILITY_RULES` | `wt-city-dev/packages/citygen/src/placement/rules.ts`, mtime 04:48, md5 `ea1eabeaeff73db8253e22a65ffabb0d` |
| the two number changes keep the table legal | the same biconditional, with the changes applied | as above |
| the parcel areas per district (n, median, max) | the reference fixture `tests/e2e/city/fixtures/generate-city.ts` run at `REFERENCE_SEED 20261020`, one parcel per `ownerId` (the fixture pushes a base part and a tower part under the same `ownerId`) | fixture unchanged since `39eb7a2` |
| the 28-of-43 unplaceable classes, the anchors | the parcel areas vs each `footprintM2` range, inclusive, as `suitability.ts:135` applies it | as above |
| the 67 non-zero cells, the 20 ambiguous, the 12 no-preferred, the 8 sole-but-unpreferred | the mix table × `allowedRoles` × `preferredRoles` × the measured parcel areas | as above |
| the 28 cells with no placeable carrier | the mix table × the facilities allowed in that role × the parcels of that role's Port Avalon district | as above |
| the count caps | `maxPer` entries in `rules.ts` (2 of 43 facilities) | `rules.ts:113`, `rules.ts:588` |
| the denominator does not exist yet | `git ls-tree -r --name-only origin/main -- packages/citygen/` returns **nothing**; T10A-03 is unchecked in BUILD-ORDER | `origin/main` = `75d3f97` |

**The card was not modified by this review.**
