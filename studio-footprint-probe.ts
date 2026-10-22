// Studio probe: re-verify the T10A-12 footprint claim (finding g) against the
// CURRENT fixture and City Dev's CURRENT in-flight rules.ts.
//
// Basis: suitability EXCLUDES a parcel whose area is outside footprintM2, so a
// facility needs a parcel with min <= area <= max. Measured on the PARCEL
// (building footprint w x d), not the subdivision cell (lw x ld).
import { buildWorld, REFERENCE_SEED } from './tests/e2e/city/fixtures/generate-city.js';
import { FACILITY_RULES } from './packages/citygen/src/placement/rules.js';

const world = buildWorld(REFERENCE_SEED, 1);

// --- rebuild per-district parcel areas from the world parts -------------------
// parts cm = [x, z, w, d, baseH, h, ..., style]; parcel id = bnd_<pid>_...
const byEntity = new Map(world.entities.map((e) => [e.id, e]));
const perDist = new Map();
for (const p of world.parts) {
  const ent = byEntity.get(p.ownerId);
  if (!ent) continue;
  if (ent.kind === 'landmark' || ent.kind === 'crown_tower') continue;
  const w = p.cm[2] / 100;
  const d = p.cm[3] / 100;
  const area = w * d;
  const arr = perDist.get(ent.districtId) ?? [];
  arr.push(area);
  perDist.set(ent.districtId, arr);
}

const stats = [];
for (const [dist, areas] of perDist) {
  const sorted = [...areas].sort((a, b) => a - b);
  stats.push({
    dist,
    n: sorted.length,
    med: sorted[Math.floor(sorted.length / 2)],
    max: sorted[sorted.length - 1],
  });
}
console.log('=== district parcel areas (PARCEL basis: w x d) ===');
for (const s of stats.sort((a, b) => b.n - a.n)) {
  console.log(
    `${s.dist.padEnd(40)} n=${String(s.n).padStart(4)} med=${s.med.toFixed(0).padStart(5)} max=${s.max.toFixed(0).padStart(5)}`,
  );
}

const allAreas = [...perDist.values()].flat().sort((a, b) => a - b);
console.log(
  `\nALL n=${allAreas.length} med=${allAreas[Math.floor(allAreas.length / 2)].toFixed(0)} max=${allAreas[allAreas.length - 1].toFixed(0)}`,
);

// --- placeability of every facility class -------------------------------------
const placeable = [];
const unplaceable = [];
for (const r of FACILITY_RULES) {
  const [min, max] = r.footprintM2;
  const n = allAreas.filter((a) => a >= min && a <= max).length;
  // also: on the biggest parcel anywhere
  const biggest = allAreas[allAreas.length - 1];
  const fitsAnywhere = biggest >= min && biggest <= max;
  (n > 0 ? placeable : unplaceable).push({
    f: r.facility,
    sec: r.sector,
    fp: `${min}-${max}`,
    n,
    fitsAnywhere,
  });
}

console.log(`\n=== placeability of ${FACILITY_RULES.length} facility classes (PARCEL basis) ===`);
console.log(`placeable on >=1 parcel:   ${placeable.length}`);
console.log(`UNPLACEABLE on every parcel: ${unplaceable.length}`);
for (const u of unplaceable) {
  console.log(`  ${u.f.padEnd(20)} ${u.sec.padEnd(22)} ${u.fp.padStart(12)}  fitsBiggestParcel=${u.fitsAnywhere}`);
}
console.log('\n--- placeable ---');
for (const p of placeable) {
  console.log(`  ${p.f.padEnd(20)} ${p.sec.padEnd(22)} ${p.fp.padStart(12)}  parcels=${p.n}`);
}

// --- the anchors AC-10A-12-ANCHORS requires -----------------------------------
console.log('\n=== anchors ===');
for (const name of ['fin_exchange', 'log_port_terminal', 'hl_hospital', 'en_tank_farm', 'mf_heavy', 'tech_datacenter']) {
  const r = FACILITY_RULES.find((x) => x.facility === name);
  if (!r) {
    console.log(`  ${name}: NOT IN rules.ts`);
    continue;
  }
  const [min, max] = r.footprintM2;
  const biggest = allAreas[allAreas.length - 1];
  console.log(
    `  ${name.padEnd(20)} ${String(min).padStart(6)}-${String(max).padEnd(6)}  biggestParcelAnywhere=${biggest.toFixed(0).padStart(5)}  placeable=${biggest >= min && biggest <= max}`,
  );
}
// biggest parcel in the three anchor districts
for (const d of ['dst_port_avalon_financial_mile', 'dst_port_avalon_eastside_docks', 'dst_port_avalon_industrial_basin']) {
  const a = perDist.get(d) ?? [];
  console.log(`  ${d}: n=${a.length} maxParcel=${a.length ? Math.max(...a).toFixed(0) : 'n/a'}`);
}
