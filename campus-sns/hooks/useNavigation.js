import { useState, useMemo, useCallback } from 'react';
import { SPOTS, SPOT_CATS, WAYPOINTS, ENTRANCES, EDGES } from './useLocationSharing.js';

// Haversine distance in meters
function haversine(a, b) {
  const R = 6371000;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function buildGraph() {
  const nodes = {};

  SPOTS.forEach(s => {
    if (!s.id || s.lat == null) return;
    nodes[s.id] = { lat: s.lat, lng: s.lng };
  });
  WAYPOINTS.forEach(w => {
    nodes[w.id] = { lat: w.lat, lng: w.lng };
  });
  ENTRANCES.forEach((ent, idx) => {
    nodes[`ent_${idx}`] = { lat: ent.lat, lng: ent.lng };
  });

  const adj = {};
  const ensure = id => { if (!adj[id]) adj[id] = []; };

  EDGES.forEach(edge => {
    const [a, b] = edge;
    const isStairs = edge[2] === "stairs";
    const na = nodes[a], nb = nodes[b];
    if (!na || !nb) return;

    const dist = haversine(na, nb);
    const weight = isStairs ? dist * 1.5 : dist;

    ensure(a); ensure(b);
    adj[a].push({ to: b, dist, weight, stairs: isStairs });
    adj[b].push({ to: a, dist, weight, stairs: isStairs });
  });

  // Find nearest connected waypoint for a coordinate
  const wpIds = WAYPOINTS.map(w => w.id).filter(id => adj[id] && adj[id].length > 0);
  const nearestWp = (lat, lng) => {
    let bestId = null, bestDist = Infinity;
    for (const wid of wpIds) {
      const w = nodes[wid];
      const d = haversine({ lat, lng }, w);
      if (d < bestDist) { bestDist = d; bestId = wid; }
    }
    return { id: bestId, dist: bestDist };
  };
  const link = (id, lat, lng) => {
    const near = nearestWp(lat, lng);
    if (!near.id) return;
    ensure(id); ensure(near.id);
    adj[id].push({ to: near.id, dist: near.dist, weight: near.dist, stairs: false });
    adj[near.id].push({ to: id, dist: near.dist, weight: near.dist, stairs: false });
  };

  // Connect disconnected entrances to nearest waypoint
  ENTRANCES.forEach((ent, idx) => {
    const eid = `ent_${idx}`;
    if (adj[eid] && adj[eid].length > 0) return;
    link(eid, ent.lat, ent.lng);
  });

  // Connect spots that have no reachable entrances
  SPOTS.forEach(s => {
    if (!s.id || s.lat == null) return;
    const hasConnected = ENTRANCES.some((ent, idx) => ent.spot === s.id && adj[`ent_${idx}`] && adj[`ent_${idx}`].length > 0);
    if (hasConnected) return;
    // No entrance with edges — connect the spot itself
    link(s.id, s.lat, s.lng);
  });

  return { nodes, adj };
}

function dijkstra(adj, nodes, startIds, endIds) {
  const dist = {};
  const prev = {};
  const endSet = new Set(endIds);

  // Priority queue (binary insert)
  const pq = [];
  startIds.forEach(id => {
    if (!nodes[id]) return;
    dist[id] = 0;
    prev[id] = null;
    pq.push({ id, d: 0 });
  });
  pq.sort((a, b) => a.d - b.d);

  while (pq.length > 0) {
    const { id: u, d: du } = pq.shift();
    if (du > (dist[u] ?? Infinity)) continue;

    if (endSet.has(u)) {
      const path = [];
      let curr = u;
      while (curr !== null) { path.unshift(curr); curr = prev[curr]; }
      return { path, distance: dist[u] };
    }

    const neighbors = adj[u] || [];
    for (const { to: v, weight } of neighbors) {
      const nd = du + weight;
      if (nd < (dist[v] ?? Infinity)) {
        dist[v] = nd;
        prev[v] = u;
        let lo = 0, hi = pq.length;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (pq[mid].d < nd) lo = mid + 1; else hi = mid; }
        pq.splice(lo, 0, { id: v, d: nd });
      }
    }
  }
  return null;
}

// Navigable spots (have coordinates)
export const NAV_SPOTS = SPOTS.filter(s => s.id && s.lat != null);
export { SPOT_CATS };

export function useNavigation() {
  const [origin, setOrigin] = useState(null);
  const [destination, setDestination] = useState(null);
  const [gpsOriginPos, setGpsOriginPos] = useState(null); // {lat, lng} — GPS由来の出発地座標

  const graph = useMemo(() => buildGraph(), []);

  const getEntranceNodes = useCallback((spotId) => {
    // Find entrance nodes that are actually connected in the graph
    const ids = [];
    ENTRANCES.forEach((ent, idx) => {
      if (ent.spot === spotId) {
        const eid = `ent_${idx}`;
        if (graph.adj[eid] && graph.adj[eid].length > 0) ids.push(eid);
      }
    });
    // Fallback: use spot node itself (connected via buildGraph's auto-link)
    if (ids.length === 0 && graph.adj[spotId] && graph.adj[spotId].length > 0) ids.push(spotId);
    return ids;
  }, [graph]);

  const route = useMemo(() => {
    const useGps = origin === "__gps__" && gpsOriginPos;
    if (!useGps && (!origin || origin === destination)) return null;
    if (!destination) return null;

    let startNodes;
    let gpsPrefixCoord = null;
    let gpsPrefixDist = 0;

    if (useGps) {
      // GPS出発: 最寄りの接続済みノードを探す
      const connectedIds = Object.keys(graph.adj).filter(id => graph.adj[id]?.length > 0);
      let bestId = null, bestDist = Infinity;
      for (const id of connectedIds) {
        const n = graph.nodes[id];
        if (!n) continue;
        const d = haversine(gpsOriginPos, n);
        if (d < bestDist) { bestDist = d; bestId = id; }
      }
      if (!bestId) return null;
      startNodes = [bestId];
      gpsPrefixCoord = { lat: gpsOriginPos.lat, lng: gpsOriginPos.lng };
      gpsPrefixDist = bestDist;
    } else {
      startNodes = getEntranceNodes(origin);
    }

    const endNodes = getEntranceNodes(destination);
    if (startNodes.length === 0 || endNodes.length === 0) return null;

    const result = dijkstra(graph.adj, graph.nodes, startNodes, endNodes);
    if (!result) return null;

    let coords = result.path.map(id => graph.nodes[id]).filter(Boolean);
    let totalDist = result.distance;

    // GPS出発地を経路の先頭に追加
    if (gpsPrefixCoord) {
      coords = [gpsPrefixCoord, ...coords];
      totalDist += gpsPrefixDist;
    }

    // Check if route includes stairs
    let hasStairs = false;
    for (let i = 0; i < result.path.length - 1; i++) {
      const nbs = graph.adj[result.path[i]] || [];
      const edge = nbs.find(e => e.to === result.path[i + 1]);
      if (edge?.stairs) { hasStairs = true; break; }
    }

    // Walking speed: 80m/min
    const minutes = Math.max(1, Math.ceil(totalDist / 80));

    return { path: result.path, coords, distance: Math.round(totalDist), minutes, hasStairs };
  }, [origin, destination, gpsOriginPos, graph, getEntranceNodes]);

  const swap = useCallback(() => {
    if (origin === "__gps__") return; // GPS出発地は入れ替え不可
    setOrigin(destination);
    setDestination(origin);
  }, [origin, destination]);

  return { origin, setOrigin, destination, setDestination, route, swap, graph, gpsOriginPos, setGpsOriginPos };
}
