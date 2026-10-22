// T10A-12 (city placement): the sector rules table as data (card unit U1).
//
// The card's "Sector rules (rules.ts content, placement.v1)" table, one row per facility.
// Everything here is STATIC CONTENT (card "State model" 1): it is versioned by
// PLACEMENT_RULES_VERSION and never re-derived from a seed.
//
// Placement is LEGIBILITY, NOT ECONOMICS: nothing in this file is a price, a value or a yield.
// The per-mille mix below is a readability target (DECISION D-10A-12-MIX, Quant decision 1):
// it says what a city block should LOOK like, and it is not calibrated to employment, output,
// land value or demand.
//
// THE MIX IS A RELATIVE PRIORITY, NOT A COUNT (Producer ruling, 2026-10-22). The per-mille
// numbers are compared WITHIN A ROW ONLY: they say how a district's sectors rank against each
// other, and the absolute count of facilities is left to the land ("the ratio is what the eye
// reads; the count is what the land does"). The unit is a SHARE, and the mix-deficit term in
// `assign.ts` is a per-mille shortfall against the row's own target, bounded by that target - so
// it can never express a facility count.
//
// WHICH FACILITY CARRIES A CELL (Producer ruling, 2026-10-22, on Studio's T10A-12 review). The
// card's rules table carries ONE "Preferred roles" column per SECTOR, but the data model is per
// FACILITY (`FacilityRule.preferredRoles`), and a cell without a named carrier means different
// cities: `CBD x FINANCE = 300` is 30 exchanges (3,000 m2 each) or 30 branches (80 m2 each), and
// `PORT x LOGISTICS_TRANSPORT = 450` is a parade or an overflow. The rules table below therefore
// names the carrier per FACILITY, and `mixCarriers()` reads it back per CELL.

import { cmpStr, sortBy } from '@tycoon/engine-core/order';
import type {
  BizSector,
  DensityBand,
  DistrictRole,
  FacilityRule,
  Nuisance,
} from './types';
import { DISTRICT_ROLES, SECTORS } from './types';

/** The rules version. A change to the rules bumps it (card "State model" 1). */
export const PLACEMENT_RULES_VERSION = 'placement.v1';

/**
 * The nuisance buffer of each class, in metres, from the receptor's edge to the facility's edge.
 * N0 0; N1 may share a block with receptors but never a building; N2 >= 60 m; N3 >= 150 m.
 */
export const BUFFER_M: Readonly<Record<Nuisance, number>> = {
  N0: 0,
  N1: 0,
  N2: 60,
  N3: 150,
};

/**
 * The structure caps, in metres (Systems ruling 1). Structures are exempt from `maxHeightM` but
 * capped here: they carry no floor area, no FAR, no `heightLevel`, no value and no crown title.
 */
export const STRUCTURE_CAP_M: Readonly<Record<string, number>> = {
  STS_CRANE: 80,
  RTG_GANTRY: 30,
  SHIP_LOADER: 50,
  STACK: 120,
  CHIMNEY: 60,
  SILO: 55,
  TANK: 25,
  FLARE: 60,
  COOLING_TOWER: 90,
  MAST: 120,
};

// ---------- the style keys (Studio decision 1) ----------

/**
 * The sector base key a facility key inherits from: `style.sector.<sector lowercase>`.
 * A missing facility key falls back to this (AC-10A-12-STYLE-FALLBACK).
 */
export const sectorStyleKey = (sector: BizSector): string => `style.sector.${sector.toLowerCase()}`;

/** The facility style key: `style.sector.<sector lowercase>.<facility>`. */
export const facilityStyleKey = (sector: BizSector, facility: string): string =>
  `${sectorStyleKey(sector)}.${facility}`;

// ---------- the sector rules table ----------

/**
 * The table, one row per facility class. The card's table columns are: sector, facility classes
 * (lot types, footprint m2), preferred roles, allowed roles, hard exclusions, adjacency and
 * buffers, and the nuisance class (the last column of the card's table).
 *
 * Reading of the card's shorthand, so the table is unambiguous:
 *   - "allowed roles" that the card writes as "+ MIXED_RIVER, PRIME_RES (cafes, restaurants)" is
 *     a per-facility refinement, not a role-wide one: only `fh_cafe` and `fh_restaurant` gain
 *     MIXED_RIVER and PRIME_RES, and only `fh_hotel` and `fh_food_hall` do not. The table below
 *     is per facility, so it says exactly that.
 *   - "INDUSTRIAL edge (big box only)" means `rc_big_box` may sit in INDUSTRIAL, and
 *     `rc_supermarket` may not.
 *   - "any except as excluded" means every role the sector's facilities name, minus the
 *     exclusions; the per-facility rows say which.
 *   - the card's "receptors" are RES parcels, `hl_hospital` and CIVIC parcels tagged school.
 */
export const FACILITY_RULES: readonly FacilityRule[] = [
  // ---------- FOOD_HOSPITALITY ----------
  {
    facility: 'fh_cafe',
    sector: 'FOOD_HOSPITALITY',
    allowedRoles: ['MIXED_CORE', 'CBD', 'TRANSIT_HUB', 'MIXED_RIVER', 'PRIME_RES'],
    // "+ MIXED_RIVER, PRIME_RES (cafés, restaurants)": the card's allowed column names the
    // cafés for these two roles, so the café carries their FOOD cells.
    preferredRoles: ['MIXED_CORE', 'CBD', 'TRANSIT_HUB', 'MIXED_RIVER', 'PRIME_RES'],
    lotTypes: ['SHOPFRONT'],
    footprintM2: [40, 250],
    nuisance: 'N0',
    needs: [],
    near: [{ facility: 'MAIN_AVENUE', maxM: 400 }],
    excludeRoles: ['PORT', 'INDUSTRIAL', 'TROPHY_RES'],
    receptor: false,
    styleKey: facilityStyleKey('FOOD_HOSPITALITY', 'fh_cafe'),
    densityBand: 'LOW',
  },
  {
    facility: 'fh_restaurant',
    sector: 'FOOD_HOSPITALITY',
    allowedRoles: ['MIXED_CORE', 'CBD', 'TRANSIT_HUB', 'MIXED_RIVER', 'PRIME_RES', 'TROPHY_RES'],
    // "+ MIXED_RIVER, PRIME_RES (cafes, restaurants)": the card's allowed column names the
    // cafes and the restaurants for these two roles, so they carry those FOOD cells.
    // "nothing in TROPHY_RES except one fh_restaurant per district" is the card's hard-exclusion
    // column, and it names the carrier too: the restaurant is the only food facility legal on the
    // hill, so it carries TROPHY_RES's FOOD cell (and the card caps it at one per district).
    preferredRoles: ['MIXED_CORE', 'CBD', 'TRANSIT_HUB', 'MIXED_RIVER', 'PRIME_RES', 'TROPHY_RES'],
    lotTypes: ['SHOPFRONT'],
    footprintM2: [120, 600],
    nuisance: 'N0',
    needs: [],
    near: [{ facility: 'MAIN_AVENUE', maxM: 400 }],
    excludeRoles: ['PORT', 'INDUSTRIAL'],
    receptor: false,
    // "nothing in TROPHY_RES except one fh_restaurant per district"
    maxPer: { perDistrictRole: { TROPHY_RES: 1 } },
    styleKey: facilityStyleKey('FOOD_HOSPITALITY', 'fh_restaurant'),
    densityBand: 'LOW',
  },
  {
    facility: 'fh_hotel',
    sector: 'FOOD_HOSPITALITY',
    allowedRoles: ['MIXED_CORE', 'CBD', 'TRANSIT_HUB'],
    preferredRoles: ['MIXED_CORE', 'CBD', 'TRANSIT_HUB'],
    lotTypes: ['HIGHRISE', 'MIDRISE'],
    footprintM2: [1500, 8000],
    nuisance: 'N0',
    needs: [],
    // "hotels <= 400 m from STATION or WATERFRONT"
    needsAny: [{ need: 'TRANSIT_400M' }, { need: 'WATERFRONT' }],
    excludeRoles: ['INDUSTRIAL', 'PORT', 'MIXED_RIVER', 'PRIME_RES', 'TROPHY_RES'],
    receptor: false,
    styleKey: facilityStyleKey('FOOD_HOSPITALITY', 'fh_hotel'),
    densityBand: 'HIGH',
  },
  {
    facility: 'fh_food_hall',
    sector: 'FOOD_HOSPITALITY',
    allowedRoles: ['MIXED_CORE', 'CBD', 'TRANSIT_HUB'],
    preferredRoles: ['MIXED_CORE', 'CBD', 'TRANSIT_HUB'],
    lotTypes: ['MIDRISE'],
    footprintM2: [800, 3000],
    nuisance: 'N0',
    needs: [],
    excludeRoles: ['INDUSTRIAL', 'PORT', 'MIXED_RIVER', 'PRIME_RES', 'TROPHY_RES'],
    receptor: false,
    styleKey: facilityStyleKey('FOOD_HOSPITALITY', 'fh_food_hall'),
    densityBand: 'MID',
  },

  // ---------- RETAIL_CONSUMER ----------
  {
    facility: 'rc_shop',
    sector: 'RETAIL_CONSUMER',
    allowedRoles: ['MIXED_CORE', 'TRANSIT_HUB', 'MIXED_RIVER', 'PRIME_RES'],
    // "+ PRIME_RES (shops)": the card names the SHOPS for PRIME_RES, so the shop carries the
    // RETAIL cell there.
    preferredRoles: ['MIXED_CORE', 'TRANSIT_HUB', 'MIXED_RIVER', 'PRIME_RES'],
    lotTypes: ['SHOPFRONT'],
    footprintM2: [30, 400],
    nuisance: 'N0',
    needs: [],
    excludeRoles: ['CBD', 'PORT', 'INDUSTRIAL', 'TROPHY_RES'],
    receptor: false,
    styleKey: facilityStyleKey('RETAIL_CONSUMER', 'rc_shop'),
    densityBand: 'LOW',
  },
  {
    facility: 'rc_supermarket',
    sector: 'RETAIL_CONSUMER',
    // "+ PRIME_RES (shops)": the card adds PRIME_RES for the SHOPS only, so the supermarket
    // does not follow them there.
    allowedRoles: ['MIXED_CORE', 'TRANSIT_HUB', 'MIXED_RIVER'],
    preferredRoles: ['MIXED_CORE', 'TRANSIT_HUB', 'MIXED_RIVER'],
    lotTypes: ['MIDRISE'],
    footprintM2: [1500, 5000],
    nuisance: 'N0',
    needs: [],
    // "supermarket <= 800 m from RES_LOAD centroid"
    near: [{ facility: 'RES_LOAD', maxM: 800 }],
    excludeRoles: ['CBD', 'PORT', 'INDUSTRIAL', 'PRIME_RES', 'TROPHY_RES'],
    receptor: false,
    styleKey: facilityStyleKey('RETAIL_CONSUMER', 'rc_supermarket'),
    densityBand: 'MID',
  },
  {
    facility: 'rc_big_box',
    sector: 'RETAIL_CONSUMER',
    allowedRoles: ['INDUSTRIAL'],
    preferredRoles: ['INDUSTRIAL'],
    lotTypes: ['WAREHOUSE'],
    footprintM2: [6000, 20000],
    nuisance: 'N1',
    // "big box needs ARTERIAL"
    needs: ['ARTERIAL'],
    excludeRoles: ['CBD', 'MIXED_CORE', 'MIXED_RIVER', 'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES', 'PORT'],
    receptor: false,
    styleKey: facilityStyleKey('RETAIL_CONSUMER', 'rc_big_box'),
    densityBand: 'LOW',
  },

  // ---------- REAL_ESTATE_SERVICES ----------
  {
    facility: 're_agency',
    sector: 'REAL_ESTATE_SERVICES',
    allowedRoles: [
      'MIXED_CORE', 'CBD', 'TRANSIT_HUB', 'MIXED_RIVER', 'PRIME_RES',
      'INDUSTRIAL', 'PORT', 'TROPHY_RES',
    ],
    // THE CARRIER (Producer ruling, 2026-10-22, on Studio's T10A-12 review). The card's
    // preferred column names the OFFICES for MIXED_CORE and CBD, so the office carries those two
    // cells (see `re_office`). The card does not name a facility for the mixed and residential
    // roles, and the agency is the one that fits their street-level stock: an estate agent on
    // the high street, an estate agent on the hill (Studio's reading of TROPHY_RES: "boutiques
    // and ateliers, estate agents, a private clinic, one restaurant").
    // The agency is NOT preferred in PORT: the port's real-estate cell is the YARD (see
    // `re_builders_yard`). CITY DEV'S CALL where the card is silent, pending the Designer's
    // re-cut: the card will state the carrier per cell.
    preferredRoles: ['MIXED_RIVER', 'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES'],
    lotTypes: ['SHOPFRONT'],
    footprintM2: [40, 200],
    nuisance: 'N0',
    needs: [],
    excludeRoles: [],
    receptor: false,
    styleKey: facilityStyleKey('REAL_ESTATE_SERVICES', 're_agency'),
    densityBand: 'LOW',
  },
  {
    facility: 're_office',
    sector: 'REAL_ESTATE_SERVICES',
    allowedRoles: [
      'MIXED_CORE', 'CBD', 'TRANSIT_HUB', 'MIXED_RIVER', 'PRIME_RES',
      'INDUSTRIAL', 'PORT', 'TROPHY_RES',
    ],
    // "MIXED_CORE, CBD (offices)": the card names the offices for the commercial core, so the
    // office carries those two cells.
    preferredRoles: ['MIXED_CORE', 'CBD'],
    lotTypes: ['OFFICE_TOWER', 'MIDRISE'],
    footprintM2: [400, 3000],
    nuisance: 'N0',
    needs: [],
    excludeRoles: [],
    receptor: false,
    styleKey: facilityStyleKey('REAL_ESTATE_SERVICES', 're_office'),
    densityBand: 'MID',
  },
  {
    facility: 're_builders_yard',
    sector: 'REAL_ESTATE_SERVICES',
    allowedRoles: ['INDUSTRIAL', 'PORT'],
    // THE CARRIER (Producer ruling, 2026-10-22, on Studio's T10A-12 review, section 4(d)).
    // The card's hard-exclusion column says "yards never outside INDUSTRIAL/PORT", so the yard
    // is legal in the port, and the port's REAL_ESTATE_SERVICES cell (100 per-mille) is carried
    // by the YARD: a dock with 100 per-mille of OFFICES AND AGENCIES reads as a dock with a
    // mini-CBD. The cell's NUMBER does not change; the FACILITY that carries it does.
    preferredRoles: ['INDUSTRIAL', 'PORT'],
    lotTypes: ['WAREHOUSE'],
    footprintM2: [2000, 10000],
    nuisance: 'N2',
    // "yard needs ARTERIAL"
    needs: ['ARTERIAL'],
    excludeRoles: [
      'CBD', 'MIXED_CORE', 'MIXED_RIVER', 'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES',
    ],
    receptor: false,
    styleKey: facilityStyleKey('REAL_ESTATE_SERVICES', 're_builders_yard'),
    densityBand: 'LOW',
  },

  // ---------- LOGISTICS_TRANSPORT ----------
  {
    facility: 'log_port_terminal',
    sector: 'LOGISTICS_TRANSPORT',
    allowedRoles: ['PORT'],
    preferredRoles: ['PORT'],
    lotTypes: ['PORT_YARD'],
    footprintM2: [20000, 120000],
    nuisance: 'N3',
    // "terminal only in PORT with WATERFRONT"
    needs: ['WATERFRONT'],
    structures: [
      { kind: 'STS_CRANE', maxM: 80 },
      { kind: 'RTG_GANTRY', maxM: 30 },
    ],
    excludeRoles: [
      'CBD', 'MIXED_CORE', 'MIXED_RIVER', 'TRANSIT_HUB', 'INDUSTRIAL', 'PRIME_RES', 'TROPHY_RES',
    ],
    receptor: false,
    styleKey: facilityStyleKey('LOGISTICS_TRANSPORT', 'log_port_terminal'),
    densityBand: 'LOW',
  },
  {
    facility: 'log_warehouse',
    sector: 'LOGISTICS_TRANSPORT',
    allowedRoles: ['PORT', 'INDUSTRIAL'],
    preferredRoles: ['PORT', 'INDUSTRIAL'],
    lotTypes: ['WAREHOUSE'],
    footprintM2: [4000, 40000],
    nuisance: 'N2',
    needs: [],
    // "warehouse <= 800 m from PORT_EDGE or needs RAIL"
    needsAny: [{ need: 'RAIL' }, { near: 'PORT_EDGE', maxM: 800 }],
    near: [{ facility: 'PORT_EDGE', maxM: 800 }],
    excludeRoles: ['CBD', 'MIXED_CORE', 'MIXED_RIVER', 'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES'],
    receptor: false,
    styleKey: facilityStyleKey('LOGISTICS_TRANSPORT', 'log_warehouse'),
    densityBand: 'LOW',
  },
  {
    facility: 'log_depot',
    sector: 'LOGISTICS_TRANSPORT',
    allowedRoles: ['PORT', 'INDUSTRIAL', 'TRANSIT_HUB', 'MIXED_RIVER'],
    // "+ TRANSIT_HUB, MIXED_RIVER (depot, courier)": the card names the depot and the courier
    // for these two roles, so the depot carries their LOGISTICS cells.
    preferredRoles: ['PORT', 'INDUSTRIAL', 'TRANSIT_HUB', 'MIXED_RIVER'],
    lotTypes: ['WAREHOUSE'],
    footprintM2: [800, 4000],
    nuisance: 'N1',
    needs: [],
    excludeRoles: ['CBD', 'PRIME_RES', 'TROPHY_RES'],
    receptor: false,
    styleKey: facilityStyleKey('LOGISTICS_TRANSPORT', 'log_depot'),
    densityBand: 'LOW',
  },
  {
    facility: 'log_courier_hub',
    sector: 'LOGISTICS_TRANSPORT',
    allowedRoles: ['PORT', 'INDUSTRIAL', 'TRANSIT_HUB', 'MIXED_RIVER'],
    preferredRoles: ['TRANSIT_HUB', 'MIXED_RIVER'],
    lotTypes: ['SHOPFRONT', 'ROW'],
    footprintM2: [100, 600],
    nuisance: 'N0',
    needs: [],
    excludeRoles: ['CBD', 'PRIME_RES', 'TROPHY_RES'],
    receptor: false,
    styleKey: facilityStyleKey('LOGISTICS_TRANSPORT', 'log_courier_hub'),
    densityBand: 'LOW',
  },

  // ---------- ENERGY ----------
  {
    facility: 'en_hq',
    sector: 'ENERGY',
    allowedRoles: ['CBD'],
    preferredRoles: ['CBD'],
    lotTypes: ['CBD_TOWER', 'OFFICE_TOWER'],
    footprintM2: [1500, 6000],
    nuisance: 'N0',
    needs: [],
    excludeRoles: [
      'PORT', 'INDUSTRIAL', 'MIXED_CORE', 'MIXED_RIVER', 'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES',
    ],
    receptor: false,
    styleKey: facilityStyleKey('ENERGY', 'en_hq'),
    densityBand: 'TOWER',
  },
  {
    facility: 'en_tank_farm',
    sector: 'ENERGY',
    allowedRoles: ['PORT'],
    preferredRoles: ['PORT'],
    lotTypes: ['PORT_YARD'],
    footprintM2: [15000, 60000],
    nuisance: 'N3',
    // "tanks need WATERFRONT"
    needs: ['WATERFRONT'],
    structures: [
      { kind: 'TANK', maxM: 25 },
      { kind: 'FLARE', maxM: 60 },
    ],
    excludeRoles: [
      'CBD', 'INDUSTRIAL', 'MIXED_CORE', 'MIXED_RIVER', 'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES',
    ],
    receptor: false,
    styleKey: facilityStyleKey('ENERGY', 'en_tank_farm'),
    densityBand: 'LOW',
  },
  {
    facility: 'en_plant',
    sector: 'ENERGY',
    allowedRoles: ['INDUSTRIAL'],
    preferredRoles: ['INDUSTRIAL'],
    lotTypes: ['UTILITY_SITE'],
    footprintM2: [10000, 50000],
    nuisance: 'N3',
    needs: [],
    structures: [
      { kind: 'STACK', maxM: 120 },
      { kind: 'COOLING_TOWER', maxM: 90 },
    ],
    excludeRoles: [
      'CBD', 'PORT', 'MIXED_CORE', 'MIXED_RIVER', 'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES',
    ],
    receptor: false,
    styleKey: facilityStyleKey('ENERGY', 'en_plant'),
    densityBand: 'LOW',
  },
  {
    facility: 'en_substation',
    sector: 'ENERGY',
    allowedRoles: [
      'CBD', 'PORT', 'INDUSTRIAL', 'MIXED_CORE', 'MIXED_RIVER', 'TRANSIT_HUB', 'PRIME_RES',
    ],
    // "substation: any role but TROPHY_RES" is the card's allowed column, and the substation
    // carries the ENERGY cell of every role the card names no plant or tank for. INDUSTRIAL's
    // cell is the PLANT's ("INDUSTRIAL (plants)"), so the substation is not that cell's carrier;
    // there it is the support facility the data centre's "within 800 m of an en_substation" rule
    // needs.
    preferredRoles: ['MIXED_CORE', 'MIXED_RIVER', 'TRANSIT_HUB', 'PRIME_RES'],
    lotTypes: ['UTILITY_SITE'],
    footprintM2: [400, 2500],
    nuisance: 'N1',
    needs: [],
    // "substation <= 600 m from the RES_LOAD centroid it serves"
    near: [{ facility: 'RES_LOAD', maxM: 600 }],
    excludeRoles: ['TROPHY_RES'],
    receptor: false,
    styleKey: facilityStyleKey('ENERGY', 'en_substation'),
    densityBand: 'LOW',
  },

  // ---------- MINING_AGRICULTURE (off-map: Systems ruling 7) ----------
  {
    facility: 'ma_trading_office',
    sector: 'MINING_AGRICULTURE',
    allowedRoles: ['CBD'],
    preferredRoles: ['CBD'],
    lotTypes: ['OFFICE_TOWER'],
    footprintM2: [400, 3000],
    nuisance: 'N0',
    needs: [],
    excludeRoles: [
      'PORT', 'INDUSTRIAL', 'MIXED_CORE', 'MIXED_RIVER', 'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES',
    ],
    receptor: false,
    styleKey: facilityStyleKey('MINING_AGRICULTURE', 'ma_trading_office'),
    densityBand: 'MID',
  },
  {
    facility: 'ma_bulk_terminal',
    sector: 'MINING_AGRICULTURE',
    allowedRoles: ['PORT'],
    preferredRoles: ['PORT'],
    lotTypes: ['PORT_YARD'],
    footprintM2: [15000, 80000],
    nuisance: 'N3',
    // "terminal needs WATERFRONT + RAIL or ARTERIAL"
    needs: ['WATERFRONT'],
    needsAny: [{ need: 'RAIL' }, { need: 'ARTERIAL' }],
    structures: [{ kind: 'SHIP_LOADER', maxM: 50 }],
    excludeRoles: [
      'CBD', 'INDUSTRIAL', 'MIXED_CORE', 'MIXED_RIVER', 'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES',
    ],
    receptor: false,
    styleKey: facilityStyleKey('MINING_AGRICULTURE', 'ma_bulk_terminal'),
    densityBand: 'LOW',
  },
  {
    facility: 'ma_grain_silo',
    sector: 'MINING_AGRICULTURE',
    allowedRoles: ['PORT', 'INDUSTRIAL'],
    // "INDUSTRIAL (silo)": the card names the silo for the basin, so it carries that cell too.
    preferredRoles: ['PORT', 'INDUSTRIAL'],
    lotTypes: ['PLANT'],
    footprintM2: [3000, 15000],
    nuisance: 'N2',
    needs: [],
    structures: [{ kind: 'SILO', maxM: 55 }],
    excludeRoles: [
      'CBD', 'MIXED_CORE', 'MIXED_RIVER', 'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES',
    ],
    receptor: false,
    styleKey: facilityStyleKey('MINING_AGRICULTURE', 'ma_grain_silo'),
    densityBand: 'LOW',
  },

  // ---------- MANUFACTURING ----------
  {
    facility: 'mf_light',
    sector: 'MANUFACTURING',
    allowedRoles: ['INDUSTRIAL', 'MIXED_RIVER'],
    // "MIXED_RIVER (light only)": the card names the light plant for the lofts.
    preferredRoles: ['INDUSTRIAL', 'MIXED_RIVER'],
    lotTypes: ['WAREHOUSE', 'ROW'],
    footprintM2: [600, 5000],
    nuisance: 'N1',
    needs: [],
    excludeRoles: [
      'CBD', 'MIXED_CORE', 'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES',
    ],
    receptor: false,
    styleKey: facilityStyleKey('MANUFACTURING', 'mf_light'),
    densityBand: 'LOW',
  },
  {
    facility: 'mf_plant',
    sector: 'MANUFACTURING',
    allowedRoles: ['INDUSTRIAL'],
    preferredRoles: ['INDUSTRIAL'],
    lotTypes: ['PLANT'],
    footprintM2: [5000, 40000],
    nuisance: 'N2',
    needs: [],
    excludeRoles: [
      'CBD', 'MIXED_CORE', 'MIXED_RIVER', 'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES',
    ],
    receptor: false,
    styleKey: facilityStyleKey('MANUFACTURING', 'mf_plant'),
    densityBand: 'LOW',
  },
  {
    facility: 'mf_heavy',
    sector: 'MANUFACTURING',
    allowedRoles: ['INDUSTRIAL', 'PORT'],
    // "PORT (heavy)": the card names the heavy plant for the dock, so it carries that cell.
    preferredRoles: ['INDUSTRIAL', 'PORT'],
    lotTypes: ['PLANT'],
    footprintM2: [20000, 100000],
    nuisance: 'N3',
    needs: [],
    // "heavy <= 1,200 m from PORT_EDGE or RAIL"
    near: [{ facility: 'PORT_EDGE', maxM: 1200 }],
    needsAny: [{ need: 'RAIL' }, { near: 'PORT_EDGE', maxM: 1200 }],
    structures: [{ kind: 'CHIMNEY', maxM: 60 }],
    excludeRoles: [
      'CBD', 'MIXED_CORE', 'MIXED_RIVER', 'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES',
    ],
    receptor: false,
    styleKey: facilityStyleKey('MANUFACTURING', 'mf_heavy'),
    densityBand: 'LOW',
  },
  {
    facility: 'mf_chip_fab',
    sector: 'MANUFACTURING',
    allowedRoles: ['INDUSTRIAL'],
    preferredRoles: ['INDUSTRIAL'],
    // Systems ruling 2: a fab is placed only on a FAB lot, and a FAB lot occurs only in an
    // INDUSTRIAL role with grid capacity.
    lotTypes: ['FAB'],
    footprintM2: [30000, 120000],
    nuisance: 'N2',
    // "fab needs GRID_MW"
    needs: ['GRID_MW'],
    excludeRoles: [
      'CBD', 'MIXED_CORE', 'MIXED_RIVER', 'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES', 'PORT',
    ],
    receptor: false,
    styleKey: facilityStyleKey('MANUFACTURING', 'mf_chip_fab'),
    densityBand: 'LOW',
  },

  // ---------- TECH_AI ----------
  {
    facility: 'tech_office',
    sector: 'TECH_AI',
    allowedRoles: ['PRIME_RES', 'MIXED_RIVER', 'CBD', 'TRANSIT_HUB'],
    // "TRANSIT_HUB (offices)": the card names the office for the station quarter.
    preferredRoles: ['PRIME_RES', 'MIXED_RIVER', 'CBD', 'TRANSIT_HUB'],
    lotTypes: ['OFFICE_TOWER', 'MIDRISE'],
    footprintM2: [500, 6000],
    nuisance: 'N0',
    needs: [],
    excludeRoles: ['PORT', 'INDUSTRIAL', 'MIXED_CORE', 'TROPHY_RES'],
    receptor: false,
    styleKey: facilityStyleKey('TECH_AI', 'tech_office'),
    densityBand: 'MID',
  },
  {
    facility: 'tech_campus',
    sector: 'TECH_AI',
    allowedRoles: ['PRIME_RES', 'MIXED_RIVER', 'CBD'],
    preferredRoles: ['PRIME_RES'],
    lotTypes: ['CAMPUS'],
    footprintM2: [8000, 40000],
    nuisance: 'N0',
    needs: [],
    excludeRoles: ['PORT', 'INDUSTRIAL', 'MIXED_CORE', 'TRANSIT_HUB', 'TROPHY_RES'],
    receptor: false,
    styleKey: facilityStyleKey('TECH_AI', 'tech_campus'),
    densityBand: 'LOW',
  },
  {
    facility: 'tech_datacenter',
    sector: 'TECH_AI',
    allowedRoles: ['INDUSTRIAL'],
    preferredRoles: ['INDUSTRIAL'],
    lotTypes: ['DC_SITE'],
    footprintM2: [5000, 40000],
    nuisance: 'N1',
    // "data center needs GRID_MW and <= 800 m from an en_substation"
    needs: ['GRID_MW'],
    near: [{ facility: 'en_substation', maxM: 800 }],
    excludeRoles: [
      'CBD', 'MIXED_CORE', 'MIXED_RIVER', 'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES', 'PORT',
    ],
    receptor: false,
    styleKey: facilityStyleKey('TECH_AI', 'tech_datacenter'),
    densityBand: 'LOW',
  },

  // ---------- FINANCE ----------
  {
    facility: 'fin_exchange',
    sector: 'FINANCE',
    allowedRoles: ['CBD'],
    preferredRoles: ['CBD'],
    lotTypes: ['CBD_TOWER'],
    footprintM2: [3000, 10000],
    nuisance: 'N0',
    needs: [],
    // "exchange <= 300 m from the CBD's V peak" - a bare distance, so a PULL (the card's `near`),
    // not a hard exclusion.
    near: [{ facility: 'CBD_PEAK', maxM: 300 }],
    excludeRoles: [
      'PORT', 'INDUSTRIAL', 'MIXED_CORE', 'MIXED_RIVER', 'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES',
    ],
    receptor: false,
    // "at most 1 exchange per city"
    maxPer: { perCity: 1 },
    styleKey: facilityStyleKey('FINANCE', 'fin_exchange'),
    densityBand: 'TOWER',
  },
  {
    facility: 'fin_tower',
    sector: 'FINANCE',
    allowedRoles: ['CBD', 'TRANSIT_HUB'],
    preferredRoles: ['CBD'],
    lotTypes: ['CBD_TOWER', 'OFFICE_TOWER'],
    footprintM2: [2000, 8000],
    nuisance: 'N0',
    needs: [],
    excludeRoles: [
      'PORT', 'INDUSTRIAL', 'MIXED_CORE', 'MIXED_RIVER', 'PRIME_RES', 'TROPHY_RES',
    ],
    receptor: false,
    styleKey: facilityStyleKey('FINANCE', 'fin_tower'),
    densityBand: 'TOWER',
  },
  {
    facility: 'fin_branch',
    sector: 'FINANCE',
    allowedRoles: ['MIXED_CORE', 'TRANSIT_HUB', 'MIXED_RIVER', 'PRIME_RES'],
    // "branches: MIXED_CORE, TRANSIT_HUB, MIXED_RIVER, PRIME_RES": the card names the branch
    // for these four roles, so the branch carries their FINANCE cells.
    preferredRoles: ['MIXED_CORE', 'TRANSIT_HUB', 'MIXED_RIVER', 'PRIME_RES'],
    lotTypes: ['SHOPFRONT'],
    footprintM2: [80, 400],
    nuisance: 'N0',
    needs: [],
    excludeRoles: ['CBD', 'PORT', 'INDUSTRIAL', 'TROPHY_RES'],
    receptor: false,
    styleKey: facilityStyleKey('FINANCE', 'fin_branch'),
    densityBand: 'LOW',
  },

  // ---------- MEDIA_ENTERTAINMENT ----------
  {
    facility: 'me_broadcaster',
    sector: 'MEDIA_ENTERTAINMENT',
    allowedRoles: ['CBD'],
    preferredRoles: ['CBD'],
    lotTypes: ['OFFICE_TOWER'],
    footprintM2: [1500, 6000],
    nuisance: 'N0',
    needs: [],
    structures: [{ kind: 'MAST', maxM: 120 }],
    excludeRoles: [
      'PORT', 'INDUSTRIAL', 'MIXED_CORE', 'MIXED_RIVER', 'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES',
    ],
    receptor: false,
    styleKey: facilityStyleKey('MEDIA_ENTERTAINMENT', 'me_broadcaster'),
    densityBand: 'MID',
  },
  {
    facility: 'me_studio',
    sector: 'MEDIA_ENTERTAINMENT',
    allowedRoles: ['MIXED_RIVER', 'INDUSTRIAL'],
    // "INDUSTRIAL (studios)": the card names the studio for the basin.
    preferredRoles: ['MIXED_RIVER', 'INDUSTRIAL'],
    lotTypes: ['WAREHOUSE'],
    footprintM2: [2000, 15000],
    nuisance: 'N0',
    needs: [],
    excludeRoles: [
      'CBD', 'MIXED_CORE', 'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES',
    ],
    receptor: false,
    styleKey: facilityStyleKey('MEDIA_ENTERTAINMENT', 'me_studio'),
    densityBand: 'LOW',
  },
  {
    facility: 'me_venue',
    sector: 'MEDIA_ENTERTAINMENT',
    allowedRoles: ['TRANSIT_HUB', 'MIXED_CORE'],
    // "MIXED_CORE (venues)": the card names the venue for the old town.
    preferredRoles: ['TRANSIT_HUB', 'MIXED_CORE'],
    lotTypes: ['MIDRISE', 'CAMPUS'],
    footprintM2: [2000, 20000],
    nuisance: 'N1',
    needs: [],
    // "venue <= 400 m from STATION"
    near: [{ facility: 'STATION', maxM: 400 }],
    excludeRoles: [
      'CBD', 'PORT', 'INDUSTRIAL', 'MIXED_RIVER', 'PRIME_RES', 'TROPHY_RES',
    ],
    receptor: false,
    styleKey: facilityStyleKey('MEDIA_ENTERTAINMENT', 'me_venue'),
    densityBand: 'MID',
  },

  // ---------- HEALTH ----------
  {
    facility: 'hl_hospital',
    sector: 'HEALTH',
    allowedRoles: ['TRANSIT_HUB', 'MIXED_CORE'],
    preferredRoles: ['TRANSIT_HUB', 'MIXED_CORE'],
    lotTypes: ['CAMPUS'],
    footprintM2: [15000, 60000],
    nuisance: 'N0',
    // "hospital <= 1,500 m from RES_LOAD centroid and needs ARTERIAL"
    needs: ['ARTERIAL'],
    near: [{ facility: 'RES_LOAD', maxM: 1500 }],
    excludeRoles: [
      'CBD', 'PORT', 'INDUSTRIAL', 'MIXED_RIVER', 'PRIME_RES', 'TROPHY_RES',
    ],
    // "hospital is a receptor (buffers apply to it)"
    receptor: true,
    styleKey: facilityStyleKey('HEALTH', 'hl_hospital'),
    densityBand: 'LOW',
  },
  {
    facility: 'hl_clinic',
    sector: 'HEALTH',
    allowedRoles: [
      'CBD', 'MIXED_CORE', 'MIXED_RIVER', 'TRANSIT_HUB', 'PRIME_RES', 'TROPHY_RES',
    ],
    // "clinics: any role but PORT, INDUSTRIAL": the clinic carries the HEALTH cell of every role
    // the card names no hospital or lab for. PRIME_RES's cell is the LAB's ("PRIME_RES (lab,
    // near tech)"), so the clinic is not that cell's carrier.
    preferredRoles: ['CBD', 'MIXED_CORE', 'MIXED_RIVER', 'TRANSIT_HUB', 'TROPHY_RES'],
    lotTypes: ['SHOPFRONT', 'ROW'],
    footprintM2: [150, 1500],
    nuisance: 'N0',
    needs: [],
    excludeRoles: ['PORT', 'INDUSTRIAL'],
    receptor: false,
    styleKey: facilityStyleKey('HEALTH', 'hl_clinic'),
    densityBand: 'LOW',
  },
  {
    facility: 'hl_lab',
    sector: 'HEALTH',
    allowedRoles: ['PRIME_RES', 'MIXED_RIVER', 'CBD', 'TRANSIT_HUB'],
    preferredRoles: ['PRIME_RES'],
    lotTypes: ['MIDRISE', 'CAMPUS'],
    footprintM2: [1500, 10000],
    nuisance: 'N0',
    needs: [],
    excludeRoles: ['PORT', 'INDUSTRIAL', 'MIXED_CORE', 'TROPHY_RES'],
    receptor: false,
    styleKey: facilityStyleKey('HEALTH', 'hl_lab'),
    densityBand: 'MID',
  },

  // ---------- LUXURY ----------
  {
    facility: 'lx_boutique',
    sector: 'LUXURY',
    allowedRoles: ['CBD', 'PRIME_RES', 'TROPHY_RES', 'MIXED_CORE'],
    // "MIXED_CORE (Old Harbor waterfront)": the card names the boutique for the old town's
    // waterfront, and the boutique is the one that needs MAIN_AVENUE or WATERFRONT.
    preferredRoles: ['CBD', 'PRIME_RES', 'TROPHY_RES', 'MIXED_CORE'],
    lotTypes: ['SHOPFRONT'],
    footprintM2: [60, 600],
    nuisance: 'N0',
    needs: [],
    // "boutique needs MAIN_AVENUE or WATERFRONT"
    needsAny: [{ need: 'MAIN_AVENUE' }, { need: 'WATERFRONT' }],
    excludeRoles: ['INDUSTRIAL', 'PORT', 'TRANSIT_HUB', 'MIXED_RIVER'],
    receptor: false,
    styleKey: facilityStyleKey('LUXURY', 'lx_boutique'),
    densityBand: 'LOW',
  },
  {
    facility: 'lx_flagship',
    sector: 'LUXURY',
    allowedRoles: ['CBD', 'PRIME_RES', 'TROPHY_RES', 'MIXED_CORE'],
    preferredRoles: ['CBD', 'PRIME_RES', 'TROPHY_RES'],
    lotTypes: ['MIDRISE'],
    footprintM2: [600, 3000],
    nuisance: 'N0',
    // "flagship only on corner lots"
    needs: ['CORNER_LOT'],
    excludeRoles: ['INDUSTRIAL', 'PORT', 'TRANSIT_HUB', 'MIXED_RIVER'],
    receptor: false,
    styleKey: facilityStyleKey('LUXURY', 'lx_flagship'),
    densityBand: 'MID',
  },
  {
    facility: 'lx_atelier',
    sector: 'LUXURY',
    allowedRoles: ['CBD', 'PRIME_RES', 'TROPHY_RES', 'MIXED_CORE'],
    preferredRoles: ['PRIME_RES', 'TROPHY_RES'],
    lotTypes: ['ROW'],
    footprintM2: [100, 800],
    nuisance: 'N0',
    needs: [],
    excludeRoles: ['INDUSTRIAL', 'PORT', 'TRANSIT_HUB', 'MIXED_RIVER'],
    receptor: false,
    styleKey: facilityStyleKey('LUXURY', 'lx_atelier'),
    densityBand: 'LOW',
  },

  // ---------- SECURITY_LEGAL_INTEL ----------
  {
    facility: 'sl_law_firm',
    sector: 'SECURITY_LEGAL_INTEL',
    // The card's row: "CBD (law), PRIME_RES (cyber), TRANSIT_HUB (depots)" are the preferred
    // roles, "MIXED_CORE, MIXED_RIVER; INDUSTRIAL (depots)" are the other allowed ones. The
    // sector's allowed set is therefore CBD, MIXED_CORE, MIXED_RIVER, PRIME_RES and
    // TRANSIT_HUB - INDUSTRIAL is the depots' alone, and TROPHY_RES is not in the sector's
    // allowed set at all.
    allowedRoles: ['CBD', 'MIXED_CORE', 'MIXED_RIVER', 'PRIME_RES', 'TRANSIT_HUB'],
    preferredRoles: ['CBD'],
    lotTypes: ['OFFICE_TOWER'],
    footprintM2: [600, 4000],
    nuisance: 'N0',
    needs: [],
    // "law <= 500 m from the courthouse or exchange civic parcel if one exists"
    near: [{ facility: 'CBD_PEAK', maxM: 500 }],
    excludeRoles: ['PORT', 'INDUSTRIAL', 'TROPHY_RES'],
    receptor: false,
    styleKey: facilityStyleKey('SECURITY_LEGAL_INTEL', 'sl_law_firm'),
    densityBand: 'MID',
  },
  {
    facility: 'sl_cyber',
    sector: 'SECURITY_LEGAL_INTEL',
    allowedRoles: ['CBD', 'MIXED_CORE', 'MIXED_RIVER', 'PRIME_RES', 'TRANSIT_HUB'],
    // "PRIME_RES (cyber)" is the card's named carrier for the prime district. The card names no
    // facility for MIXED_CORE and MIXED_RIVER: the cyber firm is the sector's mid-rise facility,
    // and it is the one that can sit on those districts' stock (a law firm is an OFFICE_TOWER and
    // the old town has none; a guard depot is a yard). CITY DEV'S CALL where the card is silent,
    // pending the Designer's re-cut: the card will state the carrier per cell.
    preferredRoles: ['MIXED_CORE', 'MIXED_RIVER', 'PRIME_RES'],
    lotTypes: ['MIDRISE', 'OFFICE_TOWER'],
    footprintM2: [500, 3000],
    nuisance: 'N0',
    needs: [],
    excludeRoles: ['PORT', 'INDUSTRIAL', 'TROPHY_RES'],
    receptor: false,
    styleKey: facilityStyleKey('SECURITY_LEGAL_INTEL', 'sl_cyber'),
    densityBand: 'MID',
  },
  {
    facility: 'sl_guard_depot',
    sector: 'SECURITY_LEGAL_INTEL',
    allowedRoles: ['TRANSIT_HUB', 'MIXED_CORE', 'MIXED_RIVER', 'INDUSTRIAL'],
    // "TRANSIT_HUB (depots)" and "INDUSTRIAL (depots)": the card names the depot for the station
    // quarter and the basin.
    preferredRoles: ['TRANSIT_HUB', 'INDUSTRIAL'],
    lotTypes: ['WAREHOUSE', 'ROW'],
    footprintM2: [500, 3000],
    nuisance: 'N1',
    needs: [],
    excludeRoles: ['TROPHY_RES', 'CBD', 'PRIME_RES'],
    receptor: false,
    styleKey: facilityStyleKey('SECURITY_LEGAL_INTEL', 'sl_guard_depot'),
    densityBand: 'LOW',
  },
];

/**
 * The facility rules, sorted by facility class.
 *
 * The lookup is a binary search over a sorted array rather than a `Map`: G8 forbids `Map` and
 * `Set` in engine code, because their iteration order is not the engine's byte order and a
 * `Map` that leaks into a canonical output makes two runs differ.
 */
const RULES_BY_CLASS: readonly FacilityRule[] = sortBy(FACILITY_RULES, (r) => [r.facility]);

/**
 * Every style key this rules version defines: the sector bases and the facility keys.
 *
 * A facility key inherits from its sector base (Studio decision 1), and a missing facility key
 * falls back to the sector base (AC-10A-12-STYLE-FALLBACK).
 */
export const STYLE_KEYS: readonly string[] = [
  ...SECTORS.map((s) => sectorStyleKey(s)),
  ...FACILITY_RULES.map((r) => r.styleKey),
];

/** The rule of a facility class, or `undefined`. */
export const facilityRule = (facility: string): FacilityRule | undefined => {
  // A binary search over the sorted rules: the comparison is byte order (never `localeCompare`).
  let lo = 0;
  let hi = RULES_BY_CLASS.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cmpStr(RULES_BY_CLASS[mid]!.facility, facility) < 0) lo = mid + 1;
    else hi = mid;
  }
  const hit = RULES_BY_CLASS[lo];
  return hit && hit.facility === facility ? hit : undefined;
};

/**
 * The facilities with hard anchors, in the card's order: "Facilities with hard anchors
 * (exchange, port terminal, tank farm, plants, hospital, data center) are placed first".
 */
export const ANCHOR_FACILITIES: readonly string[] = [
  'fin_exchange',
  'log_port_terminal',
  'en_tank_farm',
  'en_plant',
  'hl_hospital',
  'tech_datacenter',
  'ma_bulk_terminal',
  'mf_chip_fab',
];

// ---------- the role mix ----------

/**
 * The per-mille target of each sector in each district role, over the non-RES assigned parcels.
 *
 * DECISION D-10A-12-MIX (Designer, 2026-10-22): this is a LEGIBILITY target, not an economic
 * one. The per-mille split inside a row is the Designer's call, on the single constraint that
 * the row sums to 1000 and that a non-zero cell names a sector with at least one facility
 * allowed in that role (AC-10A-12-MIX-SUM).
 *
 * The cells are a pure function of the rules table above: a cell is non-zero exactly when the
 * sector has at least one facility whose `allowedRoles` contains the role. `mixTable()` derives
 * it, so the table cannot drift from the rules.
 */
const MIX_ROWS: Readonly<Record<DistrictRole, Readonly<Partial<Record<BizSector, number>>>>> = {
  // CBD: the financial mile. FINANCE 300, TECH_AI 120, SECURITY 120, FOOD 140, LUXURY 70,
  // ENERGY 35, MINING 25, REAL_ESTATE 65, MEDIA 45, HEALTH 80. No retail: `rc_shop`,
  // `rc_supermarket` and `rc_big_box` exclude CBD, so the cell is 0 (the Designer changed the
  // old 50 to 0 for exactly this reason).
  CBD: {
    FOOD_HOSPITALITY: 140,
    RETAIL_CONSUMER: 0,
    REAL_ESTATE_SERVICES: 65,
    LOGISTICS_TRANSPORT: 0,
    ENERGY: 35,
    MINING_AGRICULTURE: 25,
    MANUFACTURING: 0,
    TECH_AI: 120,
    FINANCE: 300,
    MEDIA_ENTERTAINMENT: 45,
    HEALTH: 80,
    LUXURY: 70,
    SECURITY_LEGAL_INTEL: 120,
  },
  // PORT: the docks. LOGISTICS 450, ENERGY 150, MINING 150, MANUFACTURING 150, REAL_ESTATE 100.
  // No food: every food facility excludes PORT.
  PORT: {
    FOOD_HOSPITALITY: 0,
    RETAIL_CONSUMER: 0,
    REAL_ESTATE_SERVICES: 100,
    LOGISTICS_TRANSPORT: 450,
    ENERGY: 150,
    MINING_AGRICULTURE: 150,
    MANUFACTURING: 150,
    TECH_AI: 0,
    FINANCE: 0,
    MEDIA_ENTERTAINMENT: 0,
    HEALTH: 0,
    LUXURY: 0,
    SECURITY_LEGAL_INTEL: 0,
  },
  // INDUSTRIAL: the basin. MANUFACTURING 460, LOGISTICS 200, ENERGY 100, TECH_AI 40 (data
  // centres), REAL_ESTATE 80, RETAIL 60 (the big box), MEDIA 30, SECURITY 10, MINING 20.
  // TECH_AI 100 -> 40, MANUFACTURING 400 -> 460 (Producer ruling, 2026-10-22, relaying Studio's
  // T10A-12 review): the only tech facility legal here is `tech_datacenter`, and 100 permille of
  // the basin's parcels is 19 hyperscale data centres, which does not read as a workshop belt.
  INDUSTRIAL: {
    FOOD_HOSPITALITY: 0,
    RETAIL_CONSUMER: 60,
    REAL_ESTATE_SERVICES: 80,
    LOGISTICS_TRANSPORT: 200,
    ENERGY: 100,
    MINING_AGRICULTURE: 20,
    MANUFACTURING: 460,
    TECH_AI: 40,
    FINANCE: 0,
    MEDIA_ENTERTAINMENT: 30,
    HEALTH: 0,
    LUXURY: 0,
    SECURITY_LEGAL_INTEL: 10,
  },
  // MIXED_CORE: the old town. FOOD 280, RETAIL 220, REAL_ESTATE 100, ENERGY 20, FINANCE 50,
  // MEDIA 90, HEALTH 70, LUXURY 70, SECURITY 100.
  MIXED_CORE: {
    FOOD_HOSPITALITY: 280,
    RETAIL_CONSUMER: 220,
    REAL_ESTATE_SERVICES: 100,
    LOGISTICS_TRANSPORT: 0,
    ENERGY: 20,
    MINING_AGRICULTURE: 0,
    MANUFACTURING: 0,
    TECH_AI: 0,
    FINANCE: 50,
    MEDIA_ENTERTAINMENT: 90,
    HEALTH: 70,
    LUXURY: 70,
    SECURITY_LEGAL_INTEL: 100,
  },
  // MIXED_RIVER: the lofts. FOOD 220, RETAIL 160, REAL_ESTATE 90, LOGISTICS 100, ENERGY 30,
  // MANUFACTURING 30, TECH_AI 90, FINANCE 40, MEDIA 130, HEALTH 50, SECURITY 60.
  MIXED_RIVER: {
    FOOD_HOSPITALITY: 220,
    RETAIL_CONSUMER: 160,
    REAL_ESTATE_SERVICES: 90,
    LOGISTICS_TRANSPORT: 100,
    ENERGY: 30,
    MINING_AGRICULTURE: 0,
    MANUFACTURING: 30,
    TECH_AI: 90,
    FINANCE: 40,
    MEDIA_ENTERTAINMENT: 130,
    HEALTH: 50,
    LUXURY: 0,
    SECURITY_LEGAL_INTEL: 60,
  },
  // TRANSIT_HUB: the station quarter. FOOD 220, RETAIL 210, REAL_ESTATE 130, LOGISTICS 60,
  // ENERGY 30, TECH_AI 70, FINANCE 80, MEDIA 80, HEALTH 80, SECURITY 40.
  TRANSIT_HUB: {
    FOOD_HOSPITALITY: 220,
    RETAIL_CONSUMER: 210,
    REAL_ESTATE_SERVICES: 130,
    LOGISTICS_TRANSPORT: 60,
    ENERGY: 30,
    MINING_AGRICULTURE: 0,
    MANUFACTURING: 0,
    TECH_AI: 70,
    FINANCE: 80,
    MEDIA_ENTERTAINMENT: 80,
    HEALTH: 80,
    LUXURY: 0,
    SECURITY_LEGAL_INTEL: 40,
  },
  // PRIME_RES: the hill. FOOD 60, RETAIL 50, REAL_ESTATE 90, ENERGY 20, TECH_AI 250,
  // FINANCE 180, HEALTH 100, LUXURY 150, SECURITY 100.
  PRIME_RES: {
    FOOD_HOSPITALITY: 60,
    RETAIL_CONSUMER: 50,
    REAL_ESTATE_SERVICES: 90,
    LOGISTICS_TRANSPORT: 0,
    ENERGY: 20,
    MINING_AGRICULTURE: 0,
    MANUFACTURING: 0,
    TECH_AI: 250,
    FINANCE: 180,
    MEDIA_ENTERTAINMENT: 0,
    HEALTH: 100,
    LUXURY: 150,
    SECURITY_LEGAL_INTEL: 100,
  },
  // TROPHY_RES: the summit. FOOD 20 (the one restaurant per district), REAL_ESTATE 260,
  // HEALTH 120, LUXURY 600.
  // THE TWO NUMBER CHANGES (Producer ruling, 2026-10-22, relaying Studio's T10A-12 review):
  //   - FOOD 80 -> 20, REAL_ESTATE 200 -> 260. The old 80 asked for 2+ restaurants against the
  //     hard cap of one `fh_restaurant` per district, so the mix-deficit term chased a target it
  //     could never close, and that deficit distorted every other decision it touched. At 20 the
  //     cell is satisfiable at every denominator (0 or 1 restaurant against the cap of 1).
  //   - INDUSTRIAL TECH_AI 100 -> 40, MANUFACTURING 400 -> 460. The only tech facility legal in
  //     INDUSTRIAL is `tech_datacenter`, and 100 permille of the basin's parcels is 19 hyperscale
  //     data centres, which does not read as a workshop belt.
  TROPHY_RES: {
    FOOD_HOSPITALITY: 20,
    RETAIL_CONSUMER: 0,
    REAL_ESTATE_SERVICES: 260,
    LOGISTICS_TRANSPORT: 0,
    ENERGY: 0,
    MINING_AGRICULTURE: 0,
    MANUFACTURING: 0,
    TECH_AI: 0,
    FINANCE: 0,
    MEDIA_ENTERTAINMENT: 0,
    HEALTH: 120,
    LUXURY: 600,
    SECURITY_LEGAL_INTEL: 0,
  },
};

/**
 * The mix table, derived from the rules: a cell is non-zero exactly when the sector has at least
 * one facility allowed in that role, and the row's per-mille values are the Designer's.
 *
 * `MIX_ROWS` states the values; `mixTable()` returns them with the sector keys sorted by byte
 * order, so the object is canonical and a test can compare it byte for byte.
 */
export const DISTRICT_ROLE_MIX: Readonly<Record<DistrictRole, Readonly<Record<BizSector, number>>>> =
  Object.fromEntries(
    DISTRICT_ROLES.map((role) => {
      const row: Record<BizSector, number> = {} as Record<BizSector, number>;
      for (const sector of SECTORS) row[sector] = MIX_ROWS[role][sector] ?? 0;
      return [role, row];
    }),
  ) as Readonly<Record<DistrictRole, Readonly<Record<BizSector, number>>>>;

/**
 * The sectors that have at least one facility allowed in a role. The mix table's non-zero cells
 * are exactly these (AC-10A-12-MIX-SUM's biconditional).
 */
export const SECTORS_ALLOWED_IN_ROLE = (role: DistrictRole): readonly BizSector[] =>
  SECTORS.filter((s) =>
    FACILITY_RULES.some((r) => r.sector === s && r.allowedRoles.includes(role)),
  );

/**
 * THE CARRIER OF EVERY CELL (Producer ruling, 2026-10-22, on Studio's T10A-12 review).
 *
 * The card's rules table carries ONE "Preferred roles" column per SECTOR, but the data model is
 * per FACILITY (`FacilityRule.preferredRoles`), and the two are not the same thing. Studio's
 * measurement of the reference map: the SAME cell `CBD x FINANCE = 300` spans **1.40x to 7.02x**
 * the district's land depending only on which facility the solver picks (30 exchanges of 3,000 m2
 * each, or 30 towers, or 30 branches of 80 m2 each), and `PORT x LOGISTICS_TRANSPORT = 450`
 * spans **0.11x to 129.71x**. Same cell, opposite failures: a parade or an overflow. Until the
 * card states which facility carries each cell, the same cell means different cities.
 *
 * THIS TABLE IS THE RULING, AND IT IS PER CELL. It names, for every non-zero cell of the mix,
 * the facility that carries it - the one the solver prefers, and the one whose footprint and
 * character the cell's per-mille is talking about. The `preferredRoles` of the rules table above
 * is the SOURCE OF TRUTH for it, and `mixCarriers()` reads it back per CELL, so the rules table
 * is what actually expresses the ruling, per FACILITY, as the Producer asked.
 *
 * `MIX_CARRIERS` below is the READOUT of that ruling - the flat list of the 67 non-zero cells and
 * the facility that carries each. It is derived, so it cannot drift from the rules; the CHECK is
 * the committed per-cell expectation table in `test/placement/rules.test.ts`, which is where the
 * Designer's re-cut is confirmed cell by cell and where the mutant that moves a carrier dies.
 *
 * Where the card is silent, the carrier is CITY DEV'S CALL and is flagged as such in the rules
 * table next to the facility that carries it. The card's re-cut will state it.
 */
export interface MixCarrier {
  /** The district role of the cell. */
  role: DistrictRole;
  /** The sector of the cell. */
  sector: BizSector;
  /**
   * The facilities that carry the cell, in the rules table's order.
   *
   * MORE THAN ONE is legal and means the cell is a CLASS of facility, not one building: the
   * card's own table carries several classes in a cell's sector ("CBD: FINANCE 300" is the
   * exchange and the tower, and the count cap of one exchange per city is what stops the cell
   * from becoming thirty exchanges). The order is the rules table's order, so the first entry is
   * the most characteristic carrier of the cell.
   */
  facilities: readonly string[];
}

/**
 * The carrier of every cell, read from the rules table's `preferredRoles`.
 *
 * A cell's carriers are the facilities of its sector whose `preferredRoles` contain the cell's
 * role. The list is sorted by the rules table's own order (facility id, byte order), so it is
 * canonical and a test can compare it byte for byte.
 */
export const mixCarriers = (
  role: DistrictRole,
  sector: BizSector,
): readonly string[] => {
  if ((DISTRICT_ROLE_MIX[role]?.[sector] ?? 0) === 0) return [];
  return FACILITY_RULES.filter(
    (r) => r.sector === sector && r.preferredRoles.includes(role),
  ).map((r) => r.facility);
};

/**
 * The carrier of every non-zero cell, as a flat list in (role, sector) order.
 *
 * This is the table the Designer's re-cut has to confirm: 67 cells, each with the facility that
 * carries it. `AC-10A-12-CARRIER` asserts that every non-zero cell has at least one carrier, and
 * that the carrier list below matches what the rules table says.
 */
export const MIX_CARRIERS: readonly MixCarrier[] = DISTRICT_ROLES.flatMap((role) =>
  SECTORS.map((sector) => ({
    role,
    sector,
    facilities: mixCarriers(role, sector),
  })).filter((c) => c.facilities.length > 0),
);

/** The sum of a mix row. Every row sums to 1000 (AC-10A-12-MIX-SUM). */
export const mixRowSum = (role: DistrictRole): number => {
  const row = DISTRICT_ROLE_MIX[role];
  let sum = 0;
  for (const sector of SECTORS) sum += row[sector];
  return sum;
};

/**
 * The density band of a facility, read off its preferred lot type (Studio decision 2): the band
 * is a function of the parcel's zoning class and `maxFar`, and this table gives the facility's
 * preferred class's band. `densityBandFor` in classify.ts is the parcel-level function.
 */
export const DENSITY_BAND_BY_LOT: Readonly<Record<string, DensityBand>> = {
  SHOPFRONT: 'LOW',
  ROW: 'LOW',
  MIDRISE: 'MID',
  HIGHRISE: 'HIGH',
  OFFICE_TOWER: 'MID',
  CBD_TOWER: 'TOWER',
  WAREHOUSE: 'LOW',
  PLANT: 'LOW',
  PORT_YARD: 'LOW',
  DC_SITE: 'LOW',
  FAB: 'LOW',
  UTILITY_SITE: 'LOW',
  CAMPUS: 'LOW',
  CIVIC: 'LOW',
  GREEN: 'LOW',
};

/** The rules of a sector, in table order. */
export const rulesOfSector = (sector: BizSector): readonly FacilityRule[] =>
  FACILITY_RULES.filter((r) => r.sector === sector);

/** The facility classes of a sector, sorted by byte order. */
export const facilitiesOfSector = (sector: BizSector): readonly string[] =>
  rulesOfSector(sector).map((r) => r.facility).sort(cmpStr);
