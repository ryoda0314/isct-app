import { blocks, streets, treePoints } from "./dataNeighbourhood.js";
import { boundsOf, inside } from "./navigation.js";

// Remote masses stay out of the campus facility and navigation indexes.
const limits = blocks.map(([, , ring]) => boundsOf(ring));

export function hitsContext(x, z) {
  return limits.some((b, i) =>
    x >= b.left && x <= b.right && z >= b.top && z <= b.bottom && inside([x, z], blocks[i][2])
  );
}

export function createContext(T, groundAt, streetGround=groundAt) {
  const group = new T.Group();
  group.name = "横浜キャンパス周辺";
  const positions = [], colors = [];
  const color = new T.Color();
  function triangle(a, b, c, hex) {
    positions.push(...a, ...b, ...c);
    color.setHex(hex);
    for (let i = 0; i < 3; i++) colors.push(color.r, color.g, color.b);
  }
  function quad(a, b, c, d, hex) {
    triangle(a, b, c, hex);
    triangle(a, c, d, hex);
  }
  const point3 = (p, h) => [p[0], h, p[1]];
  const between = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  const walls = [0xc3bcb1, 0xd6cfc2, 0xcec6b6, 0xb9b4a7, 0xd0c4b4, 0xc5c5bc];
  const roofs = [0x777f80, 0x85877f, 0x777d89, 0x8c827b, 0x888e87, 0x807b79];

  for (const [index, [height, pitched, ring]] of blocks.entries()) {
    const box = limits[index], base = groundAt(...box.center);
    const floor = Math.min(base, ...ring.map(p => groundAt(...p))) - .45;
    const rise = pitched ? Math.min(1.5, height * .21) : 0;
    const eave = base + height - rise;
    const wall = walls[index % walls.length], roof = roofs[(index * 5) % roofs.length];
    const shape = ring.map(([x, z]) => new T.Vector2(x, z));
    const triangles = T.ShapeUtils.triangulateShape(shape, []);

    let axis = [1, 0], longest = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
      if (length > longest) { axis = [-dz / length, dx / length]; longest = length; }
    }
    const offset = p => p[0] * axis[0] + p[1] * axis[1];
    const offsets = ring.map(offset), lo = Math.min(...offsets), hi = Math.max(...offsets);
    const mid = (lo + hi) / 2, half = Math.max(.01, (hi - lo) / 2);
    const top = p => eave + rise * (1 - Math.abs(offset(p) - mid) / half);
    function roofSide(polygon, side) {
      const face = [];
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i], b = polygon[(i + 1) % polygon.length];
        const da = (offset(a) - mid) * side, db = (offset(b) - mid) * side;
        if (da >= 0) face.push(a);
        if (da * db < 0) face.push(between(a, b, da / (da - db)));
      }
      for (let i = 1; i + 1 < face.length; i++)
        triangle(...[face[0], face[i + 1], face[i]].map(p => point3(p, top(p))), roof);
    }
    for (const ids of triangles) {
      const face = ids.map(i => ring[i]);
      if (pitched) { roofSide(face, 1); roofSide(face, -1); }
      else triangle(...[face[2], face[1], face[0]].map(p => point3(p, eave)), roof);
    }
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const da = offset(a) - mid, db = offset(b) - mid;
      const edge = pitched && da * db < 0 ? [a, between(a, b, da / (da - db)), b] : [a, b];
      for (let j = 1; j < edge.length; j++) {
        const p = edge[j - 1], q = edge[j];
        quad(point3(p, floor), point3(q, floor), point3(q, top(q)), point3(p, top(p)), wall);
      }
    }
  }
  for (const [width, major, line] of streets) {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i], dx = b[0] - a[0], dz = b[1] - a[1];
      const length = Math.hypot(dx, dz);
      if (!length) continue;
      // The station-side street meets the textured pedestrian crossing. Sample
      // the same hillside closely enough that a long road triangle cannot rise
      // above the painted stripes between its vertices.
      const gate=Math.hypot(a[0]+269,a[1]+318)<19||Math.hypot(b[0]+269,b[1]+318)<19;
      const n = Math.ceil(length / (gate?.65:2.8)), strips = Math.ceil(width / (gate?.65:3));
      function surface(t, r) {
        const x = a[0] + dx * t - dz * r / length, z = a[1] + dz * t + dx * r / length;
        return [x, streetGround(x, z) + (gate?.02:.13), z];
      }
      for (let j = 0; j < n; j++) {
        for (let k = 0; k < strips; k++) {
          const r0 = width * (k / strips - .5), r1 = width * ((k + 1) / strips - .5);
          quad(surface(j/n,r0), surface(j/n,r1), surface((j+1)/n,r1), surface((j+1)/n,r0),
            gate ? 0x707674 : major ? 0x929695 : 0xa5a6a0);
        }
      }
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const solids = new T.Mesh(geometry, new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide }));
  solids.name = "周辺の建物と道路";
  solids.receiveShadow = true;
  group.add(solids);

  const trees = new T.InstancedMesh(new T.IcosahedronGeometry(1, 1),
    new T.MeshLambertMaterial({ flatShading: true }), treePoints.length * 3);
  const bark = new T.InstancedMesh(new T.CylinderGeometry(.5, .7, 1, 5),
    new T.MeshLambertMaterial({ color: 0x786d5a }), treePoints.length);
  const pose = new T.Object3D(), leafColors = [0x688362, 0x7b8b66, 0x6b805e, 0x79906f, 0x758565];
  for (const [i, [x, z]] of treePoints.entries()) {
    const y = groundAt(x, z), h = 6.6 + ((i * 137) % 31) / 7;
    pose.position.set(x, y + h * .29, z);
    pose.scale.set(.65, h * .59, .65);
    pose.rotation.set(0, 0, 0);
    pose.updateMatrix();
    bark.setMatrixAt(i, pose.matrix);
    for (let k = 0; k < 3; k++) {
      const angle = i * 1.63 + k * 2.1, spread = h * .26;
      pose.position.set(x + Math.cos(angle) * spread * .55, y + h * (.62 + k * .055),
        z + Math.sin(angle) * spread * .55);
      pose.scale.set(spread, h * .28, spread * 1.1);
      pose.rotation.set(0, angle, 0);
      pose.updateMatrix();
      trees.setMatrixAt(3*i+k, pose.matrix);
      trees.setColorAt(3*i+k, color.setHex(leafColors[(i+k) % leafColors.length]));
    }
  }
  group.add(trees, bark);
  return group;
}
