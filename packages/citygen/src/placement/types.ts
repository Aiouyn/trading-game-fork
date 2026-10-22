// T10A-12 (city placement, unit U1): the types of the placement module.
//
// Placement is LEGIBILITY, NOT ECONOMICS. Nothing in this package enters V, rent, amenityMult,
// location_j (10 §3.15.3), appraisal or demand (INV-PLC-4, Quant decision 1). The types here
// carry no price, no value and no yield.
//
// CARD SEAM NOTES (City Dev, T10A-12 U1). The card's "Exports" sketch is a shape, not a complete
// schema: four of the card's own sentences have no field to live in. Each extension below is
// additive, encodes a sentence the card states, and is flagged to the Producer in the PR body:
//   1. `needsAny`      - the card states OR-requirements ("boutique needs MAIN_AVENUE or
//                        WATERFRONT", "terminal needs WATERFRONT + RAIL or ARTERIAL"). `needs` is
//                        a plain list, and the card's suitability step ("a `needs` item fails")
//                        reads it as an AND list, so an OR cannot be expressed without it.
//   2. `receptor`      - AC-10A-12-TABLE-ROWS requires "hl_hospital is a receptor" and the card's
//                        buffer rules name receptors (RES parcels, hl_hospital, CIVIC schools).
//   3. `maxPer`        - the card's "at most 1 exchange per city" and "nothing in TROPHY_RES
//                        except one fh_restaurant per district" are cardinality limits.
//   4. `CORNER_LOT` in FacilityNeed and `CBD_PEAK` / `MAIN_AVENUE` in NearTarget - the card's
//                        "flagship only on corner lots", "exchange <= 300 m from the CBD's V peak"
//                        and "cafes cluster on MAIN_AVENUE" name conditions the card's own enums
//                        do not carry.
// A later unit may reshape these; nothing depends on their names outside this package.

/** 09 §3.1.4 business sector. The 13 canonical values, in the card's order. */
export type BizSector =
  | 'FOOD_HOSPITALITY'
  | 'RETAIL_CONSUMER'
  | 'REAL_ESTATE_SERVICES'
  | 'LOGISTICS_TRANSPORT'
  | 'ENERGY'
  | 'MINING_AGRICULTURE'
  | 'MANUFACTURING'
  | 'TECH_AI'
  | 'FINANCE'
  | 'MEDIA_ENTERTAINMENT'
  | 'HEALTH'
  | 'LUXURY'
  | 'SECURITY_LEGAL_INTEL';

/** The 13 sectors, in the card's order (09 §3.1.4). */
export const SECTORS: readonly BizSector[] = [
  'FOOD_HOSPITALITY',
  'RETAIL_CONSUMER',
  'REAL_ESTATE_SERVICES',
  'LOGISTICS_TRANSPORT',
  'ENERGY',
  'MINING_AGRICULTURE',
  'MANUFACTURING',
  'TECH_AI',
  'FINANCE',
  'MEDIA_ENTERTAINMENT',
  'HEALTH',
  'LUXURY',
  'SECURITY_LEGAL_INTEL',
];

/** E-61 sector key: `SECTOR_<sector>`. */
export type SectorKey = `SECTOR_${BizSector}`;

/** The sector key of a sector. */
export const sectorKeyOf = (sector: BizSector): SectorKey => `SECTOR_${sector}`;

/**
 * Function of a district, derived from tier + the cbd / port / station / riverOrCanal flags
 * (classify.ts). One per district.
 */
export type DistrictRole =
  | 'CBD'
  | 'PORT'
  | 'INDUSTRIAL'
  | 'MIXED_CORE'
  | 'MIXED_RIVER'
  | 'TRANSIT_HUB'
  | 'PRIME_RES'
  | 'TROPHY_RES';

/** The 8 district roles, in the card's table order. */
export const DISTRICT_ROLES: readonly DistrictRole[] = [
  'CBD',
  'PORT',
  'INDUSTRIAL',
  'MIXED_CORE',
  'MIXED_RIVER',
  'TRANSIT_HUB',
  'PRIME_RES',
  'TROPHY_RES',
];

/** Physical lot type, derived from zoning class + area + frontage + access (classify.ts). */
export type LotType =
  | 'SHOPFRONT'
  | 'ROW'
  | 'MIDRISE'
  | 'HIGHRISE'
  | 'OFFICE_TOWER'
  | 'CBD_TOWER'
  | 'WAREHOUSE'
  | 'PLANT'
  | 'PORT_YARD'
  | 'DC_SITE'
  | 'FAB'
  | 'UTILITY_SITE'
  | 'CAMPUS'
  | 'CIVIC'
  | 'GREEN';

/** Nuisance class of a facility. Receptors = RES parcels, HEALTH inpatient, CIVIC schools. */
export type Nuisance = 'N0' | 'N1' | 'N2' | 'N3';

/** The 4 nuisance classes, quietest first. */
export const NUISANCE_CLASSES: readonly Nuisance[] = ['N0', 'N1', 'N2', 'N3'];

/** A facility class: 'fin_exchange', 'log_port_terminal', ... (rules.ts, a closed set). */
export type FacilityClass = string;

/**
 * A hard requirement of a facility on its parcel. `WATERFRONT` and `GRID_MW` are the two the
 * card's systems ruling leans on; `ARTERIAL` and `RAIL` are access; `TRANSIT_400M` is the
 * 400 m transit bound the card states for venues and hotels; `MAIN_AVENUE` is the frontage
 * rule; `CORNER_LOT` is the flagship rule.
 */
export type FacilityNeed =
  | 'WATERFRONT'
  | 'ARTERIAL'
  | 'RAIL'
  | 'TRANSIT_400M'
  | 'GRID_MW'
  | 'MAIN_AVENUE'
  | 'CORNER_LOT';

/**
 * What a facility pulls towards. `RES_LOAD` is the residential load centroid, `PORT_EDGE` the
 * port edge, `STATION` a station, `CBD_PEAK` the CBD's V peak, `MAIN_AVENUE` the main avenue;
 * anything else is a facility class.
 */
export type NearTarget = FacilityClass | 'RES_LOAD' | 'PORT_EDGE' | 'STATION' | 'CBD_PEAK' | 'MAIN_AVENUE';

/** One adjacency pull: a target and the greatest distance to it, in metres. */
export interface NearRule {
  /** The thing to be near. */
  facility: NearTarget;
  /** The greatest acceptable distance, in metres. */
  maxM: number;
}

/**
 * One hard condition of a facility on its parcel: either a named need, or a distance bound to a
 * near target.
 *
 * WHY THIS EXISTS (City Dev, T10A-12 U1). The card's sector rules table states its conditions in
 * three different registers, and the card's own `near` field cannot carry all of them:
 *   - "needs X" (WATERFRONT, ARTERIAL, RAIL, GRID_MW, MAIN_AVENUE, TRANSIT_400M, CORNER_LOT) is
 *     hard, and is the card's `needs` list.
 *   - "X or Y" clauses ("warehouse <= 800 m from PORT_EDGE or needs RAIL", "boutique needs
 *     MAIN_AVENUE or WATERFRONT") are hard, and mix a need with a distance. `needsAny` carries
 *     them: at least one of the listed conditions must hold.
 *   - a bare distance ("supermarket <= 800 m from RES_LOAD centroid", "cafes cluster on
 *     MAIN_AVENUE") is a PULL, the card's `near` list: it adds to the score, never excludes.
 * A condition is therefore either a named need or a hard distance bound; the pull list stays
 * `near`.
 */
export type FacilityCondition =
  | { need: FacilityNeed }
  | { near: NearTarget; maxM: number };

/** Tall industrial structures. Systems ruling 1: no floor area, no FAR, no value, no crown title. */
export type StructureKind =
  | 'STS_CRANE'
  | 'RTG_GANTRY'
  | 'SHIP_LOADER'
  | 'STACK'
  | 'CHIMNEY'
  | 'SILO'
  | 'TANK'
  | 'FLARE'
  | 'COOLING_TOWER'
  | 'MAST';

/** Studio density band. A hook, never a height: the height stays 10 §3.19.4's `maxHeightM`. */
export type DensityBand = 'LOW' | 'MID' | 'HIGH' | 'TOWER';

/** The 4 density bands, lowest first. */
export const DENSITY_BANDS: readonly DensityBand[] = ['LOW', 'MID', 'HIGH', 'TOWER'];

/** A cardinality limit on a facility, per city or per district. */
export interface MaxPer {
  /** At most this many in one city. */
  perCity?: number;
  /** At most this many in one district. */
  perDistrict?: number;
  /** At most this many in one district of a given role. */
  perDistrictRole?: Readonly<Partial<Record<DistrictRole, number>>>;
}

/** One facility's placement rule. The row of the card's sector rules table. */
export interface FacilityRule {
  /** The facility class, unique, prefixed by its sector's short code. */
  facility: FacilityClass;
  /** The 09 §3.1.4 sector the facility belongs to. */
  sector: BizSector;
  /** The district roles the facility may be placed in. */
  allowedRoles: DistrictRole[];
  /** The roles the facility prefers; a subset of `allowedRoles`. */
  preferredRoles: DistrictRole[];
  /** The lot types the facility may take; the first is the preferred one. */
  lotTypes: LotType[];
  /** The parcel area range, in square metres, inclusive. */
  footprintM2: [min: number, max: number];
  /** The nuisance class: how far the facility must sit from a receptor. */
  nuisance: Nuisance;
  /** Hard requirements; every one of them must hold. */
  needs: FacilityNeed[];
  /**
   * Hard requirements of which at least one must hold (the card's "or" clauses). Each entry is
   * a named need or a hard distance bound; see `FacilityCondition`.
   */
  needsAny?: FacilityCondition[];
  /** Adjacency pulls: a score bonus when met, never an exclusion. */
  near?: NearRule[];
  /** Hard exclusions; they beat the preferred roles. */
  excludeRoles: DistrictRole[];
  /** The tall structures the facility may carry, each with its own cap in metres. */
  structures?: { kind: StructureKind; maxM: number }[];
  /** True when the facility is itself a receptor: its own buffer applies to it. */
  receptor: boolean;
  /** Cardinality limits. */
  maxPer?: MaxPer;
  /** Studio hook: `style.sector.<sector>.<facility>`. */
  styleKey: string;
  /** Studio hook: the band of the facility's preferred lot type. Never a height. */
  densityBand: DensityBand;
}

/** The parcel flags a placement reads (Systems rulings 3, 4 and 6). */
export interface ParcelFlags {
  /** The cm polyline of the parcel edge that carries a quay wall, or null. */
  quayEdge: [number, number][] | null;
  /** True when a rail line or siding lies within 30 m of the parcel edge. */
  railAccess: boolean;
  /** The nearest point on that rail line, in cm. */
  railPointCm: [number, number] | null;
  /** True exactly where the parcel is reserved for the city crown. */
  crownParcel: boolean;
  /** True when the parcel is buffer land with no facility on it. */
  bufferGreen: boolean;
}

/** The closed set of reason codes a suitability verdict may carry. */
export type SuitabilityReason =
  | 'ROLE'
  | 'LOT'
  | 'AREA'
  | 'NEED_WATERFRONT'
  | 'NEED_ARTERIAL'
  | 'NEED_RAIL'
  | 'NEED_TRANSIT_400M'
  | 'NEED_GRID_MW'
  | 'NEED_MAIN_AVENUE'
  | 'NEED_CORNER_LOT'
  | 'BUFFER'
  | 'RESERVED'
  /**
   * The reason of a failed hard distance bound to a near target: `NEED_<target>`, where the
   * target is `RES_LOAD`, `PORT_EDGE`, `STATION`, `CBD_PEAK` or `MAIN_AVENUE`. The card's closed
   * set is `NEED_<x>`, and these are the `x` values a distance bound carries.
   */
  | 'NEED_RES_LOAD'
  | 'NEED_PORT_EDGE'
  | 'NEED_STATION'
  | 'NEED_CBD_PEAK'
  | 'NEED_MAIN_AVENUE_DIST';

/** One parcel's verdict for one facility. */
export interface Suitability {
  /** The parcel the verdict is about. */
  parcelId: string;
  /** The facility the verdict is about. */
  facility: FacilityClass;
  /** The verdict. */
  verdict: 'EXCLUDED' | 'ALLOWED' | 'PREFERRED';
  /** An integer score; 0 when the verdict is EXCLUDED. */
  score: number;
  /** Why. Empty when the verdict is ALLOWED or PREFERRED. */
  reasons: SuitabilityReason[];
}

/** One placed facility on one parcel. */
export interface PlacementAssignment {
  /** The parcel the facility sits on. */
  parcelId: string;
  /** The district the parcel is in. */
  districtId: string;
  /** The 09 §3.1.4 sector. */
  sector: BizSector;
  /** The E-61 sector key. */
  sectorKey: SectorKey;
  /** The facility class. */
  facility: FacilityClass;
  /** The Studio style hook. */
  styleKey: string;
  /** The Studio density hook. */
  densityBand: DensityBand;
  /** The rules version that produced this assignment. */
  rulesVersion: string;
  /** The parcel flags the placement read. */
  flags: ParcelFlags;
  /** `city.vis:<cityId>:<parcelId>`, built only by `cityVisKey`. */
  visKey: string;
}

/** A draw from the injected stream `city.gen:<cityId>:<regionId>:sector`. Always in [0, 1). */
export type Draw = () => number;

// ---------- the input view (the T10A-01 / T10A-03 seam) ----------

/**
 * INPUT SEAM (City Dev, T10A-12 U1). The card's "Imports" section names T10A-01's
 * `DistrictRow` and `ParcelRow` and T10A-03's parcel polygon and predicates. Neither package
 * exists in the tree yet (`packages/engine/city/` is empty on main) and T10A-01 owns
 * `packages/engine/city/schema.ts`, so this package may NOT declare them. The placement module
 * therefore declares the STRUCTURAL VIEW of the rows it consumes - `PlacementParcel`,
 * `PlacementDistrict` - and the card's rows are satisfied by any value with the same shape
 * (TypeScript is structural). When T10A-01 and T10A-03 land their rows are passed straight in;
 * if a field name differs, the fix is one adapter, not a rewrite of the rules.
 */

/** A point in integer centimetres in the city plane. */
export interface FixedPointCoord {
  /** The east coordinate, in centimetres. */
  x: number;
  /** The north coordinate, in centimetres. */
  z: number;
}

/** A closed polygon in integer centimetres, counter-clockwise (10 §3.19.1). */
export type FixedPointPolygon = readonly FixedPointCoord[];

/** 10 §2.2 use class. */
export type UseClass =
  | 'RES'
  | 'OFFICE'
  | 'RETAIL'
  | 'INDUSTRIAL'
  | 'HOSPITALITY'
  | 'DATACENTER'
  | 'CIVIC'
  | 'GREEN';

/**
 * 10 §3.19.4's zoning ladder, as the class names the spec uses: the residential ladder is
 * house -> row house -> mid-rise -> high-rise, the commercial one shops -> offices -> towers,
 * then industrial, civic and green.
 */
export type ZoningClass =
  | 'house'
  | 'row_house'
  | 'midrise'
  | 'highrise'
  | 'shops'
  | 'offices'
  | 'office_tower'
  | 'cbd'
  | 'industrial'
  | 'civic'
  | 'green';

/**
 * The industrial parcel kinds 10 §3.19.4 lists ("warehouses, plants, port, data-center-eligible
 * parcels where the grid allows"), plus the two kinds the card's lot types add: `utility` (a
 * substation or a power plant's yard) and `fab` (a clean-room site, Systems ruling 2).
 */
export type IndustrialKind = 'warehouse' | 'plant' | 'port' | 'datacenter' | 'utility' | 'fab';

/** 10 §2.2 zoning: the uses permitted by right, the height cap and the FAR cap. */
export interface PlacementZoning {
  /** The zoning class of 10 §3.19.4's ladder. */
  class: ZoningClass;
  /** The industrial parcel kind, when the class is `industrial`. */
  industrialKind?: IndustrialKind;
  /** The uses permitted by right. */
  allowed: UseClass[];
  /** The height cap, `min(districtCap, V-derived cap)`. */
  maxHeightM: number;
  /** The floor-area ratio cap. */
  maxFar: number;
  /** True when the heritage locks apply (10 §3.11.7). */
  heritageLocked: boolean;
}

/** 10 §2.2 parcel attributes, plus the tag the buffer rules read for schools. */
export interface PlacementAttributes {
  /** The water view, 0..1. */
  waterView: number;
  /** The distance to the nearest transit stop, in metres. */
  transitDist: number;
  /** The slope, as the generator reports it. */
  slope: number;
  /** True on a corner lot. */
  cornerLot: boolean;
  /** True when the parcel fronts the main avenue. */
  mainAvenue: boolean;
  /** True when the parcel is a CIVIC parcel tagged school (a buffer receptor). */
  school: boolean;
}

/** What a parcel is reserved for. `null` when it is free. */
export type ReservedFor = 'CROWN' | 'LANDMARK' | 'HALL_OF_PATRONS' | 'CIVIC' | 'CORRIDOR' | null;

/**
 * The structural view of a parcel row (T10A-01's `ParcelRow`). Placement reads the polygon, the
 * area, the zoning, the attributes and the reservation, and nothing else.
 */
export interface PlacementParcel {
  /** The parcel id, `pcl_<city>_<seq>`. */
  id: string;
  /** The city the parcel is in. */
  cityId: string;
  /** The district the parcel is in. */
  districtId: string;
  /** The generation region (10 §3.19.2). */
  regionId: string;
  /** The polygon, in integer centimetres. */
  polygon: FixedPointPolygon;
  /** The parcel area, in square metres. */
  areaM2: number;
  /** The street frontage, in metres. */
  frontageM: number;
  /** How the parcel is served. */
  access: ('ROAD' | 'FOOT' | 'CANAL')[];
  /** The zoning. */
  zoning: PlacementZoning;
  /** The generator's land-value sample (static). Placement reads it, never prices from it. */
  landValueV: number;
  /** The attributes. */
  attributes: PlacementAttributes;
  /** The primary use of the parcel. */
  primaryUse: UseClass;
  /** What the parcel is reserved for; `null` when it is free. */
  reservedFor: ReservedFor;
}

/** The structural view of a district row (T10A-01's `DistrictRow`). */
export interface PlacementDistrict {
  /** The district id, `dst_<city>_<slug>`. */
  id: string;
  /** The city the district is in. */
  cityId: string;
  /** The tier of the district (22 §3.3). */
  tier: 'working' | 'mid' | 'prime' | 'trophy';
  /** The terrain role of the district (22 §3.3). */
  terrainRole: string;
}

/**
 * The context a suitability verdict reads: the facts about the parcel's surroundings that
 * T10A-03's terrain, street and rail skeleton owns. The caller supplies the distances, so this
 * package never walks terrain or street geometry itself.
 *
 * The context is REGION-wide, because the buffers and the near pulls reach across parcel
 * boundaries; the role and the flags are per parcel and are read through the accessors.
 */
export interface PlacementCtx {
  /**
   * The flags of a parcel (quay edge, rail access, crown), by parcel id. The caller derives them
   * with `classify.parcelFlags`.
   */
  flagsOf: (parcelId: string) => Omit<ParcelFlags, 'bufferGreen'>;
  /** True when the parcel's grid connection carries the megawatts the facility needs. */
  gridMw: (parcelId: string) => boolean;
  /** True when an arterial road serves the parcel. */
  arterial: (parcelId: string) => boolean;
  /**
   * The distance in metres from the parcel to a near target, or `null` when the target does not
   * exist in this city. The card's "near" rules are distances, so the geometry stays with the
   * generator that owns it. A facility class as a target means "the nearest placed facility of
   * that class".
   */
  nearDistanceM: (parcelId: string, target: NearTarget) => number | null;
  /**
   * The exact edge distance between two parcels, in centimetres, or `null` when the distance is
   * unknown. The buffers are measured on this, and `buffers.ts` owns the exact predicate; the
   * caller supplies the two polygons' result so the verdict and the audit agree.
   */
  bufferDistanceCm: (parcelId: string, otherParcelId: string) => number | null;
  /**
   * The ids of the parcels that are buffer RECEPTORS: RES parcels, hospital parcels and CIVIC
   * parcels tagged school (card "Buffers"). The list is the region's, sorted by id, so the
   * symmetric buffer check reads one membership test rather than re-deriving the receptor rule
   * per candidate. A plain array, not a `Set`: G8 forbids `Set` in engine code.
   */
  receptorParcelIds: readonly string[];
  /** The facilities already placed in this region, for the "near a facility class" pulls. */
  placedFacilities: readonly PlacementAssignment[];
}

/** The region an assignment run covers. */
export interface RegionInput {
  /** The city the region belongs to. */
  cityId: string;
  /** The region id; the `city.gen:<cityId>:<regionId>:sector` stream carries it. */
  regionId: string;
  /** The districts of the region, with their roles. */
  districts: readonly PlacementDistrict[];
  /** The role of each district, by district id. */
  roles: Readonly<Partial<Record<string, DistrictRole>>>;
  /** The parcels of the region. */
  parcels: readonly PlacementParcel[];
  /** The context facts of the region. */
  ctx: PlacementCtx;
}
