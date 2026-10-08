// 3Dキャンパスに描くルート（現在地 → 西9号館）を、アプリと同じ経路グラフで求めて JSON に書き出す。
//   node promo-video/capture/gen_route.cjs
// hooks/useNavigation.js の buildGraph / dijkstra と同じ考え方（入口ノードへ最短、階段は 1.5 倍）。
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../../campus-sns/hooks/useLocationSharing.js'), 'utf8');
const D = new Function(src.replace(/^import .*$/gm, '').replace(/^export /gm, '') + '\nreturn { SPOTS, WAYPOINTS, ENTRANCES, EDGES };')();
const hav = (a, b) => { const R = 6371000, r = (x) => x * Math.PI / 180; const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng); const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2; return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)); };
const nodes = {}; const adj = {};
D.SPOTS.forEach((s) => { if (s.id && s.lat != null) nodes[s.id] = { lat: s.lat, lng: s.lng }; });
D.WAYPOINTS.forEach((w) => { nodes[w.id] = { lat: w.lat, lng: w.lng }; });
D.ENTRANCES.forEach((e, i) => { nodes[`ent_${i}`] = { lat: e.lat, lng: e.lng }; });
const ensure = (id) => { if (!adj[id]) adj[id] = []; };
D.EDGES.forEach((e) => { const [a, b] = e; if (!nodes[a] || !nodes[b]) return; const d = hav(nodes[a], nodes[b]); const w = e[2] === 'stairs' ? d * 1.5 : d; ensure(a); ensure(b); adj[a].push({ to: b, w }); adj[b].push({ to: a, w }); });
const wpIds = D.WAYPOINTS.map((w) => w.id).filter((id) => adj[id] && adj[id].length);
const link = (id, p) => { let best = null, bd = Infinity; for (const w of wpIds) { const d = hav(p, nodes[w]); if (d < bd) { bd = d; best = w; } } if (!best) return; ensure(id); ensure(best); adj[id].push({ to: best, w: bd }); adj[best].push({ to: id, w: bd }); };
D.ENTRANCES.forEach((e, i) => { const id = `ent_${i}`; if (!(adj[id] && adj[id].length)) link(id, e); });
D.SPOTS.forEach((s) => { if (!s.id || s.lat == null) return; const ok = D.ENTRANCES.some((e, i) => e.spot === s.id && adj[`ent_${i}`] && adj[`ent_${i}`].length); if (!ok) link(s.id, s); });
function routeFrom(gps, destId) {
  let start = null, bd = Infinity;
  for (const id of Object.keys(adj)) { if (!adj[id].length) continue; const d = hav(gps, nodes[id]); if (d < bd) { bd = d; start = id; } }
  const ends = new Set(D.ENTRANCES.map((e, i) => (e.spot === destId && adj[`ent_${i}`] && adj[`ent_${i}`].length ? `ent_${i}` : null)).filter(Boolean));
  if (!ends.size) ends.add(destId);
  const dist = { [start]: 0 }, prev = { [start]: null }, pq = [[0, start]];
  while (pq.length) {
    pq.sort((a, b) => a[0] - b[0]);
    const [du, u] = pq.shift();
    if (du > dist[u]) continue;
    if (ends.has(u)) { const p = []; let c = u; while (c) { p.unshift(c); c = prev[c]; } return [gps, ...p.map((id) => nodes[id])]; }
    for (const { to, w } of adj[u] || []) { const nd = du + w; if (nd < (dist[to] ?? Infinity)) { dist[to] = nd; prev[to] = u; pq.push([nd, to]); } }
  }
  return null;
}
const HERE = { lat: 35.60705, lng: 139.68518 };
const route = routeFrom(HERE, 'w9');
const len = route.slice(1).reduce((s, p, i) => s + hav(route[i], p), 0);
const w9 = D.SPOTS.find((s) => s.id === 'w9');
const out = { from: HERE, to: { id: 'w9', label: w9.label, lat: w9.lat, lng: w9.lng }, length: Math.round(len), points: route.map((p) => [+p.lat.toFixed(6), +p.lng.toFixed(6)]) };
fs.writeFileSync(path.join(__dirname, '../src/promo2/campusRoute.json'), JSON.stringify(out, null, 1));
console.log(`route ${route.length} pts, ${Math.round(len)} m`);
