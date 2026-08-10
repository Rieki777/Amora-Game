/* Export contract check (§5.2 + geometry layer). Usage: node check-schema.js amora-scene.json */
const fs = require('fs');
const J = JSON.parse(fs.readFileSync(process.argv[2] || 'amora-scene.json', 'utf8'));
let fails = 0;
const ok = (c, n) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };
const blocks = ['map_scene','map_zones','map_structures','map_flows','map_structure_facts','map_edits','boundary','circles','org_roles','quests','journeys','forum_threads','events','stays_occupancy','concierge_queries','vital_overrides'];
ok(blocks.every(b => b in J), 'all sixteen blocks present');
ok(J.events.every(e => e.id && e.title && Array.isArray(e.structure_keys) && typeof e.days_until === 'number' && e.src === 'sample'), 'events: id/title/structure_keys[]/days_until, sample-labeled');
ok(J.events.every(e => e.structure_keys.every(k => J.map_structures.some(s => s.key === k))), 'every event address resolves to a live structure');
ok(J.stays_occupancy && J.stays_occupancy.lots && Object.values(J.stays_occupancy.lots).every(l => l.sold <= l.total), 'stays_occupancy: sold never exceeds total');
ok(Array.isArray(J.concierge_queries) && J.concierge_queries.every(c => 'query' in c && 'matched_kind' in c && c.method === 'deterministic'), 'concierge_queries: the demand sensor rows are well-formed');
ok(typeof J.vital_overrides === 'object' && Object.values(J.vital_overrides).every(o => 'v' in o), 'vital_overrides: founder words carry values');
ok(J.map_scene.vocabulary && Array.isArray(J.map_scene.vocabulary.zone), 'vocabulary: the founder’s words export');
ok(J.quests.every(q => 'address_source' in q) && J.org_roles.every(r => 'address_source' in r), 'quests + roles carry address_source (creator’s word vs guess vs pool)');
ok(J.journeys.every(j => Array.isArray(j.steps) && j.steps.every(s => 'structure_key' in s && 'address_source' in s)), 'journey steps carry structure_key + address_source');
ok(J.forum_threads.every(t => Array.isArray(t.structure_keys) && 'address_source' in t), 'threads carry structure_keys[] (multi-address, D10) + address_source');
const sKeys = new Set(J.map_structures.map(s => s.key));
ok(J.forum_threads.every(t => t.structure_keys.every(k => sKeys.has(k))), 'every thread address resolves to a live structure');
ok(J.map_structures.every(s => ['key','name','archetype','anchor','footprint','rot','phase','circle_id','blurb','origin_story','state_inputs','bindings','icon','sort'].every(k => k in s)), 'structure rows carry the full thin shape');
ok(J.map_structures.every(s => !('quest_count' in s) && !('seat_count' in s)), 'zero per-structure counts (compute-on-read)');
/* Badges P4: the marks are projections, so the only thing worth exporting is
   a founder's deliberate silence and a founder's overruled weight. */
ok(J.map_structures.every(s => Array.isArray(s.bindings.badges)), 'every structure carries a bindings.badges list, empty when nothing was silenced');
ok(J.map_structures.every(s => s.bindings.badges.every(b => ['quest','seat','event','talk'].includes(b.kind) && b.show === false)),
  'badge rows name a known kind and only ever record a silence');
ok(J.quests.every(q => 'weight' in q && (q.weight === null || [1,2,3].includes(q.weight))),
  'quests carry weight: null means read it from the need text');
ok(J.map_structures.every(s => !/^new\d+$/.test(s.key)), 'no newN keys leak into the seed (slugified)');
const fIds = new Set(J.map_zones.filter(z => z.id).map(z => z.id));
ok(J.map_structures.every(s => s.footprint === null || fIds.has(s.footprint)), 'every footprint references a live feature id');
ok(J.map_zones.filter(z => z.id).every(z => ['id','kind','geom','subtype','phase'].every(k => k in z) && (z.polygon || z.path)), 'feature rows: id/kind/geom/subtype/phase + geometry');
ok(J.map_zones.filter(z => z.geom === 'line').every(z => typeof z.length_m === 'number'), 'lines carry length_m');
ok(J.map_zones.filter(z => z.id && z.geom === 'area').every(z => typeof z.area_m2 === 'number'), 'areas carry area_m2');
ok(J.map_flows.every(f => f.via_feature === null || fIds.has(f.via_feature)), 'flow via_feature ids resolve');
let asc = true; let last = 0;
for (const e of J.map_edits) { if (!(e.seq > last)) asc = false; last = e.seq; }
ok(asc, 'map_edits seq strictly ascending');
const ring = J.boundary.geojson.geometry.coordinates[0];
ok(ring.length >= 4 && ring[0][0] === ring[ring.length-1][0] && ring[0][1] === ring[ring.length-1][1], 'GeoJSON ring closed');
ok(ring.every(c => c[0] > -84 && c[0] < -83 && c[1] > 9 && c[1] < 10), 'ring in real WGS84 range');
ok(J.circles.length === 11 && J.circles.every(c => c.home_structure_key), '11 circles with home keys');
ok(!JSON.stringify(J).includes('undefined'), 'no "undefined" anywhere');
console.log(fails === 0 ? 'SCHEMA: ALL GREEN' : `SCHEMA: ${fails} FAILURES`);
process.exit(fails ? 1 : 0);
