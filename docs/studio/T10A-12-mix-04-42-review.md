STUDIO REVIEW — T10A-12 DISTRICT_ROLE_MIX (fork PR #17, head 37055b2)

Answering the Producer's question directly: does the completed table read like a place?
Short answer: four of the eight rows read like a place, and the four that don't are the
four I am changing below. I traced the use-class chain in the spec before touching the
numbers, and I have measured the reference map rather than reasoning about it.

=====================================================================
1. THE PRODUCER'S jobsAccess_d CHAIN — CONFIRMED, AND IT IS TIGHTER
   THAN THE CARD'S BOUNDARY CLAIM
=====================================================================

I traced it in export/vision-review/complete/10-REAL-ESTATE-AND-CITIES.md myself
before I had an opinion. Every link is there:

  §3.3.1  jobs_c = Σ jobsBySector_c; sector -> use class
           (office sectors -> OFFICE; retail and food -> RETAIL;
            manufacturing, logistics, energy, mining -> INDUSTRIAL; tourism -> HOSPITALITY)
  §3.5    D_d = 0.30*jobsAccess_d + 0.20*services_d + 0.15*transit_d + 0.15*environment_d
                + 0.10*safety_d + 0.05*prestige_d + 0.05*momentum_d + tierOffset_d
           jobsAccess_d = tanh(2*(jobsWithinCity_weighted_d / mean_d - 1))
  §3.4.1  U_d = 1.0*D_d - 1.2*ln(R_{d,RES}/R̄_{tier,RES}) + 0.5*ln(availableArea_d / mean)
           -> share_d|tier -> hhDemand_d
  §3.6    ΔlnR_{d,u} carries a 0.15*(D_d - D_d,90-day-ago)/90 rent term
  §3.15.3 location_j = 0.25*frontageBonus + 0.50*D_d + 0.25*tanh(ln(hhDemand_d / mean))

The Producer is right that the import scan cannot see this. It is a semantic coupling
through the use class, not a module edge. Two things I can add that make it sharper:

(a) The card's own text names the boundary too strongly. The Goal section says "No output
    of this card enters V, rent, amenityMult, location_j (10 3.15.3), appraisal or
    demand." As a statement about the module graph that is true; as a statement about
    the world it is not, because the mix decides which use class sits in which district,
    and use class -> jobs -> jobsAccess_d -> D_d -> rent -> hhDemand_d -> location_j.
    I agree with the Producer's ruling: narrow the claim to what the AC can demonstrate
    ("the placement code neither reads nor writes those quantities, and its per-mille
    numbers are not calibrated to them"), and name the channel in the card.

(b) The chain is STRONGER than a "tolerated consequence", and here is the measured part:
    10 §3.3.1 lists only four use classes and names them for office / retail / industrial
    / tourism. Two of the 13 sectors have NO use class in that list: HEALTH and LUXURY.
    So the mapping is already partial. That is a Quant question, not mine — but it means
    the chain runs through a mapping that does not exist yet for 2 of 13 sectors, and
    whoever owns that decision should know it is load-bearing.

(c) Quant should also see this: with the card's CURRENT table, the use-class share each
    row implies is measured below. A CBD that is 300 FINANCE + 120 TECH_AI + 120
    SECURITY_LEGAL_INTEL is ~65% OFFICE by parcel count. That is not a coincidence of
    the numbers; it is what a "financial mile" is. Which is the point: the mix IS an
    economic input through the back door, and it should be treated as one, not as a
    neutral drawing instruction.

=====================================================================
2. TWO STRUCTURAL DEFECTS IN THE TABLE THAT ARE NOT ABOUT THE NUMBERS
=====================================================================

These are the findings that matter more than my number preferences, and both are one-line
fixes next to the table.

DEFECT A — A PER-MILLE SHARE TABLE CANNOT EXPRESS THE CARD'S OWN COUNT CAPS.

  The rules table has two count caps that a share cannot carry:
    - FOOD_HOSPITALITY: "nothing in TROPHY_RES except one fh_restaurant per district"
    - FINANCE: "at most 1 exchange per city"
  The current TROPHY_RES row asks for FOOD_HOSPITALITY = 80 per-mille. On the reference
  map Gilt Hill has 65 non-landmark parcels, so 80 per-mille is ~5 food facilities there,
  and the card allows exactly ONE restaurant. And 80 is not "one": the mix asks for 80% of
  the district's non-RES parcels to be food, and the carve-out permits one.

  This is not a wrong number, it is a wrong UNIT. A per-mille table cannot say "one per
  district" or "one per city". Fix: add a small count-cap side table next to
  DISTRICT_ROLE_MIX (e.g. MAX_PER_DISTRICT: { TROPHY_RES: { fh_restaurant: 1 } },
  MAX_PER_CITY: { fin_exchange: 1 }) and make the mix solver treat a count-capped cell as
  a hard ceiling, not a target. Otherwise U1 will either fail the audit or silently place
  five restaurants on the hill.

  This also means the AC-10A-12-MIX-SUM check ("every row sums to 1000") is not by itself
  a sufficient check on the table. A row can sum to 1000 and still be unsatisfiable.

DEFECT B — THE FOOTPRINT RANGES AND THE REFERENCE MAP'S PARCELS DISAGREE, AND THE
            FOOTPRINT RANGES ARE WHAT BREAK.

  The card defines FacilityRule.footprintM2 as a "parcel area range, inclusive" and
  suitability EXCLUDES a parcel whose area is outside it. So a facility needs a parcel at
  least as big as its minimum footprint.

  I measured the reference map's parcel cell areas (instrumented copy of
  tests/e2e/city/fixtures/generate-city.ts, seed 20261020):
    old_harbor 255 parcels, median 212 m2, max 296
    financial_mile 99, median 226, max 305
    eastside_docks 195, median 238, max 270
    industrial_basin 189, median 207, max 294
    riverside_lofts 72, median 189, max 333
    midtown 214, median 224, max 324
    glasshill 85, median 485, max 848
    summit_estates_on_gilt_hill 65, median 464, max 636
    ALL 1174 parcels, median 228, max 848 m2

  Against the rules table's minimum footprints, 23 of 37 facility classes can NEVER be
  placed on any parcel of the reference map: fh_hotel, rc_supermarket, rc_big_box,
  re_builders_yard, log_port_terminal, log_warehouse, en_hq, en_tank_farm, en_plant,
  ma_bulk_terminal, ma_grain_silo, mf_plant, mf_heavy, mf_chip_fab, tech_campus,
  tech_datacenter, fin_exchange, fin_tower, me_broadcaster, me_studio, me_venue,
  hl_hospital, hl_lab.

  That includes every anchor the card's own AC-10A-12-ANCHORS requires:
    "exactly one fin_exchange, in Financial Mile"      -> min 3000 m2, CBD max parcel 305 m2
    "at least one log_port_terminal, in Eastside Docks" -> min 20000 m2, Docks max 270 m2
  Neither is placeable. Neither is hl_hospital (15000 m2). Neither is log_warehouse
  (4000 m2), so the PORT row's 450 per-mille of LOGISTICS_TRANSPORT has no facility
  that fits a dock parcel. It collapses to log_courier_hub (min 100 m2), which is a
  courier kiosk, not a dock.

  I want to be careful here: I do NOT think this is a Studio or Designer's call to make,
  and I am not asking to change a single footprint number. The reference map is a
  stand-in fixture that pre-dates T10A-03; the real parcels come from @game/citygen's
  block/parcel stage (10 §3.19.3 stage 6), which does not exist yet. So the honest
  statement is: the footprint ranges in this card are one to two orders of magnitude
  above what the current reference map's parcels are, and the card asserts an audit
  (AC-10A-12-AUDIT-REF, zero violations) over exactly that map. One of those two things
  has to give, and the card is where it should be named.

  What I am asking for is a note in the card that the footprint ranges are calibrated
  against the ENGINE's parcels (T10A-03), not against the reference fixture, and that
  U6's reference map must either (a) be regenerated with parcels big enough for the
  anchors, or (b) the audit must be scoped to the facilities that fit. Otherwise
  AC-10A-12-ANCHORS is unbuildable as written and City Dev will burn a day discovering
  it.

  For reference, this also means the mix is currently unresolvable in the way the card
  imagines it: the mix is per-mille of parcels and the rules are per-facility with
  area bands. A cell like "CBD x FINANCE = 300" cannot say WHICH facility fills it.
  The rules table has one "Preferred roles" column per SECTOR but the data model is
  per-FACILITY (FacilityRule.preferredRoles). On the current table, CBD x FINANCE = 300
  could mean 36 exchanges (3,000 m2 each = 108,900 m2 on a 48,942 m2 district) or 36
  branches (80 m2 each). Those are different cities. I recommend the card state which
  facility the mix solver prefers per (role, sector) cell, or the AC-10A-12-AUDIT-REF
  tolerance of ±150 per-mille is not a meaningful test.

=====================================================================
3. THE ROWS. WHAT READS LIKE A PLACE AND WHAT DOES NOT.
=====================================================================

I read each row against the reference map's actual parcel counts, so a per-mille number
becomes a COUNT of things you can see. Counts below are on the district's non-landmark
parcels, upper bound (the real denominator is non-RES assigned parcels, which the card
does not pin — see item 5).

  CBD / Financial Mile (100 parcels)
    current: finance 30 | tech 12 | sec 12 | food 14 | health 8 | lux 7 | real-est 7 |
             media 5 | energy 4 | mining 3
    READS AS: a financial mile. Finance is the leader, towers dominate. Good.
    Two problems. (i) MINING_AGRICULTURE at 25 per-mille puts ~3 grain-trading offices
    in the middle of the money mile — that is a commodity desk, which is fine, but 25 is
    too many and it dilutes the tower cluster. (ii) HEALTH at 80 per-mille is ~8 parcels
    of hospital; a hospital is a 15,000 m2 campus and there is no room for it. A clinic
    strip is what reads as "there is healthcare on the mile". Reduce.
    Also ENERGY 35 = ~4 energy HQs competing with the exchange for the same tower
    silhouette. One substation would read better than four rival towers.

  PORT / Eastside Docks (195 parcels)
    current: logi 88 | energy 29 | mining 29 | manuf 29 | real-est 20
    READS AS: a dock, but a soft one. 88 logistics parcels out of 195 is the dock, but
    the other 100 parcels split three ways between energy, mining and manufacturing, so
    the eye reads a general industrial yard, not a working dock.
    And REAL_ESTATE_SERVICES at 100 per-mille = ~20 agency/office parcels in the dock.
    An estate agency in a working dock is wrong. The card allows re_builders_yard in
    PORT, so this cell is legal, but 100 per-mille of it is the second-largest thing in
    the district.
    The dock should be: sheds and yards, a terminal, heavy plant on the quay, one or two
    tank farms, bulk silos. Push logistics up, push real-estate down hard.

  INDUSTRIAL / Industrial Basin (189 parcels)
    current: manuf 76 | logi 38 | energy 19 | tech 19 | real-est 15 | retail 11 | media 6 |
             mining 4 | sec 2
    READS AS: a workshop belt. Manufacturing at 400 per-mille is right — 400 is the
    largest cell in the table and it should be. But the second-largest is LOGISTICS at
    200 and the third is ENERGY at 100, so the basin is 60% manufacturing/warehouses and
    30% everything else. That reads as a warehouse park with factories in it.
    Two specific problems: TECH_AI at 100 per-mille is ~19 parcels, half as many as
    manufacturing. A data centre corner is a feature, not half the basin. And RETAIL at
    60 per-mille = 11 shops is too many; the card says big box only on the industrial
    edge, and "big box only" means one or two, not eleven.
    Also MEDIA_ENTERTAINMENT at 30 (studios in sheds) and SECURITY at 10 (guard depots)
    are tiny but correct — they are the texture that makes a belt read as a belt.

  MIXED_CORE / Old Harbor (255 parcels)
    current: food 71 | retail 56 | real-est 26 | sec 26 | media 23 | health 18 | lux 18 |
             fin 13 | energy 5
    READS AS: the market quarter. Food + retail = 127 of 255 is half the district, and
    that is exactly what a harbour market is. Good.
    But 26 law/cyber/security parcels and 23 media parcels is a legal-and-media district
    in the oldest part of town, and 18 health parcels is 7 hospitals in the heritage core.
    Old Harbor should be: market, food, quayside luxury, a heritage courthouse, ONE
    hospital. Right now it is a market with a law firm on every corner.
    LUXURY at 70 should be higher — the card's own rule gives LUXURY MIXED_CORE
    preference "(Old Harbor waterfront)". Luxury is the thing that makes a harbour read
    as a harbour rather than as a market.

  MIXED_RIVER / Riverside Lofts (73 parcels)
    current: food 16 | retail 12 | media 10 | tech 7 | fin 3 | sec 4 | health 4 | logi 7 |
             real-est 7 | energy 2 | manuf 2
    READS AS: the most interesting row, and the one I would change least in structure.
    It is the only row with 11 species, and the mix (media 130, food 220, retail 160) is
    close to right. But MEDIA at 130 per-mille is the third-largest cell and studios are
    warehouses — 10 studio parcels next to 12 retail parcels is a media quarter, not a
    loft quarter. Push media up (it is the identity of the district) and push real-est
    (90) and energy (30) down.
    MANUFACTURING at 30 per-mille is legal (mf_light only) but it is 2 parcels of light
    industry; keep it at 10 for texture, do not let it grow.

  TRANSIT_HUB / Midtown (214 parcels)
    current: food 47 | retail 45 | real-est 28 | media 17 | fin 17 | health 17 | tech 15 |
             logi 13 | sec 9 | energy 6
    READS AS: the station quarter. Food + retail = 92 of 214, plus media and health
    around the platforms. This is the row I would NOT change — it reads as a transit
    hub already. It is the one row I am leaving completely alone.

  PRIME_RES / Glasshill (85 parcels)
    current: tech 21 | fin 15 | lux 13 | health 9 | sec 9 | real-est 8 | food 5 | retail 4
             | energy 2
    READS AS: the campus hill. TECH at 250 per-mille is the leader and it should be —
    the card's preferred roles put TECH in PRIME_RES first. Good.
    But FINANCE at 180 per-mille = ~15 parcels of branch/office on a residential hill
    fights the tech cluster, and HEALTH at 100 = ~9 parcels of hospital/lab. One lab
    next to the campus is the story; nine is a hospital campus that would flatten the
    hill. And LUXURY at 150 should be higher still: boutiques and ateliers are what
    make a glass hill read as expensive.

  TROPHY_RES / Summit Estates on Gilt Hill (65 parcels)
    current: lux 39 | real-est 13 | health 8 | food 5
    READS AS: the hill. Luxury at 600 per-mille is the right call — 600 is the largest
    cell in the table and the hill should be overwhelmingly luxury. Good.
    But FOOD at 80 per-mille is the defect-A cell: the card allows exactly ONE restaurant
    there. It has to be 0 in the mix with the count cap carrying the exception, or the
    mix has to be understood as "food 80 per-mille, of which at most 1 is a restaurant".
    REAL_ESTATE at 200 = ~13 parcels of agency/office on the best land in the city is
    too many; the hill should be boutiques, a gallery, and two or three offices.
    HEALTH at 120 = ~8 parcels is a private clinic plus staff, not a hospital wing.

=====================================================================
4. MY NUMBERS — 50 one-number changes, 7 of 8 rows
=====================================================================

Every row still sums to exactly 1000, every non-zero cell names a sector with at least
one facility legal in that role, every zero cell is a sector with no facility allowed in
that role (checked in both directions, 0 violations), and the only legal-but-zero cell is
TROPHY_RES x FOOD_HOSPITALITY, which is the count-capped one and is declared as such.

Row | Sector | from -> to
CBD  FINANCE                300 -> 330    the mile is a finance mile
CBD  FOOD_HOSPITALITY       140 -> 170    cafes and lunch on the avenue
CBD  SECURITY_LEGAL_INTEL   120 -> 110
CBD  LUXURY                  70 ->  80    boutiques on the main avenue
CBD  HEALTH                  80 ->  60    clinics, not a hospital campus
CBD  MEDIA_ENTERTAINMENT     45 ->  30    broadcasters belong on the river
CBD  ENERGY                  35 ->  20    one substation, not four rival towers
CBD  MINING_AGRICULTURE      25 ->  15    a commodity desk, not a floor of them
PORT LOGISTICS_TRANSPORT    450 -> 520    it is a dock
PORT MANUFACTURING          150 -> 210    heavy plant on the quay
PORT ENERGY                 150 -> 100    tank farms, not an energy city
PORT MINING_AGRICULTURE     150 -> 100    bulk terminals and silos
PORT REAL_ESTATE_SERVICES   100 ->  70    builders' yard only; no agencies on the quay
INDUSTRIAL MANUFACTURING     400 -> 440    the workshop belt
INDUSTRIAL LOGISTICS_TRANSPORT 200 -> 250  warehouses beside the plant
INDUSTRIAL ENERGY            100 ->  90    plants and substations
INDUSTRIAL REAL_ESTATE_SERVICES 80 ->  90 builders' yards
INDUSTRIAL TECH_AI          100 ->  50    a data centre corner, not half the basin
INDUSTRIAL RETAIL_CONSUMER   60 ->  20    one big box on the edge, not eleven shops
MIXED_CORE FOOD_HOSPITALITY 280 -> 330    the market quarter
MIXED_CORE RETAIL_CONSUMER  220 -> 250    shops and market stalls
MIXED_CORE LUXURY            70 -> 100    the waterfront luxury strip
MIXED_CORE REAL_ESTATE_SERVICES 100 -> 90
MIXED_CORE MEDIA_ENTERTAINMENT 90 ->  70  theatre and venues, not broadcast towers
MIXED_CORE SECURITY_LEGAL_INTEL 100 -> 60 heritage law offices, not a legal quarter
MIXED_CORE HEALTH             70 ->  40   one hospital and its clinics
MIXED_CORE ENERGY             20 ->  10   a substation
MIXED_RIVER MEDIA_ENTERTAINMENT 130 -> 180  the creative quarter: studios and venues
MIXED_RIVER FOOD_HOSPITALITY  220 -> 250  loft ground floors
MIXED_RIVER RETAIL_CONSUMER   160 -> 180  the quay shops
MIXED_RIVER TECH_AI            90 -> 110  offices and a campus on the river
MIXED_RIVER LOGISTICS_TRANSPORT 100 -> 60  depot and courier only
MIXED_RIVER REAL_ESTATE_SERVICES 90 -> 60 offices over the lofts, not agencies
MIXED_RIVER FINANCE            40 ->  50  branches on the quay
MIXED_RIVER SECURITY_LEGAL_INTEL 60 -> 50
MIXED_RIVER HEALTH             50 ->  40  clinics and a lab
MIXED_RIVER ENERGY             30 ->  10  a substation
MIXED_RIVER MANUFACTURING      30 ->  10  light industry only; keep it at texture size
PRIME_RES TECH_AI            250 -> 300   the campus is the hill
PRIME_RES LUXURY             150 -> 220   boutiques and ateliers: the glass address
PRIME_RES FINANCE            180 -> 120   branches, not a second financial district
PRIME_RES FOOD_HOSPITALITY    60 ->  80   cafes and restaurants on the hill
PRIME_RES SECURITY_LEGAL_INTEL 100 -> 90  cyber, not a guard-depot yard
PRIME_RES HEALTH             100 ->  50   one lab beside the campus
PRIME_RES RETAIL_CONSUMER     50 ->  40   a shop and a pharmacy
PRIME_RES ENERGY              20 ->  10   a substation
TROPHY_RES LUXURY            600 -> 780   the hill is luxury
TROPHY_RES REAL_ESTATE_SERVICES 200 -> 120 a gallery and two offices
TROPHY_RES HEALTH            120 -> 100   a private clinic and its staff
TROPHY_RES FOOD_HOSPITALITY   80 ->   0   the card allows exactly ONE restaurant: cap it, do not share it

TRANSIT_HUB is untouched — 10 cells, no change. It already reads as a station quarter.

=====================================================================
5. TWO THINGS THE CARD SHOULD PIN THAT I COULD NOT FIND
=====================================================================

(a) THE DENOMINATOR. The mix is "per-mille of non-RES assigned parcels". That is a
    COUNT of parcels, so every per-mille number is a count of visible objects and the
    denominator decides how big the count is. But the card does not say how RES and
    non-RES are separated, and on the reference map the districts have 65 to 255
    non-landmark parcels each. Gilt Hill has 65: 600 per-mille there is 39 luxury
    parcels out of 65, which is a hill that is 60% boutiques. That is either exactly
    right for a trophy hill or absurd, and the difference is entirely in the
    denominator. The card needs to state it, or the per-mille numbers are not comparable
    between a 65-parcel hill and a 255-parcel market quarter.

(b) THE MIX UNIT vs THE FACILITY UNIT (restated from item 2). One "Preferred roles"
    column per sector, but the data model is per-facility. The card should say which
    facility the solver prefers per (role, sector) cell.

=====================================================================
6. WHAT I DID NOT DO
=====================================================================

- I did not change any footprint number, and I am not asking for one to change: that is
  a Systems/Engine question about T10A-03's parcel sizes, not a legibility one.
- I did not rule on the indirect economic channel. The Producer has sent that to Quant
  and Quant owns it. I only measured what the coupling's magnitude would be.
- I did not touch the card. The 50 numbers above are a one-number change on a complete
  table, which is what the Producer said this would be. I will hand them over as a
  table edit when the Producer asks for it.
- I did not run the e2e suite (RAM ~88%, and this review needs no Playwright).
- No files in the repo were changed. All probes were throwaway and are deleted;
  `git status --short` shows only my two earlier PR-7 review notes.

=====================================================================
7. BOTTOM LINE
=====================================================================

The table is a good table and the completion work was right: every row sums to 1000, the
zero cells are all correct, and six of the eight rows read as a recognisable place. My
objections are narrow and numeric except for two structural points the card should carry
whatever the numbers end up being:

  1. The mix table cannot express the card's own count caps ("one restaurant per
     district", "one exchange per city"). Add a count-cap side table. Without it,
     TROPHY_RES x FOOD_HOSPITALITY = 80 is not a target, it is a contradiction.
  2. The card's footprint ranges do not fit the reference map's parcels — 23 of 37
     facility classes can never be placed there, including every anchor that
     AC-10A-12-ANCHORS requires. Name that in the card, because U6's audit runs on that
     exact map.

And the boundary ruling: I support it. Narrow the Goal's claim to what the AC can
demonstrate, name the jobsAccess_d -> D_d -> rent -> demand -> location_j chain in the
card, and put a test behind it. I would add one line to that test: that the mix is not
consulted by, and does not feed, the use-class-to-district mapping — and note for Quant
that 10 §3.3.1 names no use class for HEALTH or LUXURY, so that mapping is not yet
complete for 2 of the 13 sectors.

— Studio (Avalon Studio)
