// Street-level details on the east walk from Taki Plaza to the south gate.
// Local x runs along the frontage, negative y faces the observer. Dimensions are metres.
import { pathFixtures } from "./campus3dPathFixtures.js";
import { tejimaFixtures } from "./campus3dTejima.js";
const alloy = "#a6adaa",
  steel = "#687374",
  dark = "#313637",
  stone = "carvedStone:#817674";
const offWhite = "#eeeae2",
  blue = "#245990",
  paper = "#fbf5e4";

function treePit(m) {
  // Loose aggregate and fallen fans stop inside the kerb. A bent blade and its
  // petiole catch different light when seen from opposite sides of the island.
  let state=31991;
  const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
  for(let i=0;i<(m.detail?150:56);i++){
    const angle=random()*Math.PI*2, radius=Math.sqrt(.17+.83*random());
    const x=1.05*radius*Math.cos(angle), y=.78*radius*Math.sin(angle), z=.019;
    const size=.023+random()*.041, turn=random()*Math.PI*2;
    if(i%3===0){
      m.loft([m.ring(x,y,.004,size*.55,size*.45,5,turn),m.ring(x+.003,y,z,size*.36,size*.29,5,turn+.3)],
        i%2 ? "spall:#999486" : "spall:#7d766b");
      continue;
    }
    const colors=["#d0bd51","#bbac54","#9a9b4e","#d2b55d","#a89150","#a7a64a"];
    const color=colors[i%colors.length], base=[x,y,z];
    const tip=(a,r,h)=>[x+Math.cos(turn+a)*r,y+Math.sin(turn+a)*r,z+h];
    const mid=tip(0,size*.64,.010);
    const rim=[tip(-.97,size*.76,.007),tip(-.57,size,.013),tip(-.16,size*1.02,.006),
      tip(0,size*.8,.002),tip(.22,size,.004),tip(.66,size*.97,.009),tip(.94,size*.75,.015)];
    for(let k=0;k<rim.length-1;k++) m.face([mid,rim[k],rim[k+1]],color,[0,0,1]);
    m.face([base,rim[0],mid],color,[0,0,1]); m.face([base,mid,rim.at(-1)],color,[0,0,1]);
    if(m.detail)m.face([tip(Math.PI,size*.43,-.004),tip(.89,.0018,0),tip(-.89,.0018,0)],"#9a8753",[0,0,1]);
  }
}

function bicycle(m, child) {
  const wheel = 0.325,
    sides = m.detail ? 24 : 14;
  const arc = (x, radius, from, to, y, count) =>
    Array.from({ length: count + 1 }, (_, i) => {
      const t = from + ((to - from) * i) / count;
      return [x + radius * Math.cos(t), y, wheel + radius * Math.sin(t)];
    });
  for (const x of [-0.54, 0.52]) {
    m.tube(arc(x, wheel - 0.018, 0, Math.PI * 2, 0, sides), 0.022, "#2d302e", 5);
    m.tube(arc(x, wheel - 0.046, 0, Math.PI * 2, 0, sides), 0.009, alloy, 4);
    const guard=arc(x,wheel+.024,.29,2.91,0,m.detail?15:8);
    for(let k=1;k<guard.length;k++){
      const [a,b]=[guard[k-1],guard[k]], edge=(p,y)=>[p[0],y,p[2]-.004];
      m.face([edge(a,-.028),edge(b,-.028),edge(b,.028),edge(a,.028)],"#8f9693",[0,0,1]);
    }
    for (let i = 0; i < (m.detail ? 14 : 6); i++) {
      const t = (i * Math.PI * 2) / (m.detail ? 14 : 6);
      const end = [x + (wheel - 0.045) * Math.cos(t), 0, wheel + (wheel - 0.045) * Math.sin(t)];
      m.tube([[x, i % 2 ? -0.033 : 0.033, wheel], end], 0.0045, alloy, 3);
    }
    m.tube(arc(x, wheel + 0.022, 0.36, Math.PI - 0.17, 0, 10), 0.023, alloy, 5);
  }
  const hub = [-0.08, 0, 0.32],
    seat = [-0.22, 0, 0.83],
    head = [0.32, 0, 0.83];
  m.tube([[-0.54, 0, wheel], hub, head], 0.026, 1, 6);
  m.tube([hub, seat, [-0.54, 0, wheel]], 0.019, 1, 6);
  m.tube([[-0.17, 0, 0.63], [0, 0, 0.46], [0.16, 0, 0.52], head], 0.021, 1, 6);
  for (const y of [-0.044, 0.044]) m.tube([[0.52, y, wheel], [0.36, y, 0.66], head], 0.017, steel, 5);
  m.tube([head, [0.31, 0, 0.98], [0.32, -0.13, 1.01], [0.23, -0.27, 1.01]], 0.016, alloy);
  m.tube(
    [
      [0.31, 0, 0.98],
      [0.32, 0.13, 1.01],
      [0.23, 0.27, 1.01],
    ],
    0.016,
    alloy
  );
  m.oval(-0.22, 0, 0.87, 0.135, 0.094, 0.048, dark);
  m.tube(
    [
      [-0.41, 0, 0.34],
      [-0.52, 0.18, 0.035],
    ],
    0.014,
    steel
  );
  m.tube(
    [
      [-0.11, -0.09, 0.22],
      [-0.08, 0, 0.32],
      [-0.05, 0.09, 0.42],
    ],
    0.014,
    alloy
  );
  for (const [x, y, z] of [
    [-0.11, -0.12, 0.2],
    [-0.05, 0.12, 0.4],
  ])
    m.box(x, y, z, 0.08, 0.085, 0.025, dark);
  for (const y of [-0.09, 0.09]) m.tube([[-0.55, y, wheel], [-0.65, y, 0.7], [-0.33, y, 0.7], seat], 0.012, alloy);
  // The wire basket stays open, including at a grazing angle down a row.
  const rim = (z, w, d) => [...m.rect(0.575, 0, z, w, d), m.rect(0.575, 0, z, w, d)[0]];
  const low = rim(0.73, 0.25, 0.22),
    high = rim(0.98, 0.35, 0.32);
  for (const r of [low, rim(0.86, 0.3, 0.27), high]) m.tube(r, 0.009, steel, 4);
  for (let i = 0; i < 4; i++) {
    m.tube([low[i], high[i]], 0.009, steel, 4);
    if (m.detail)
      for (const t of [0.25, 0.5, 0.75]) {
        const between = (r) => r[i].map((v, j) => v + (r[i + 1][j] - v) * t);
        m.tube([between(low), between(high)], 0.004, steel, 3);
      }
  }
  if (child) {
    m.box(-0.56, 0, 0.7, 0.31, 0.31, 0.085, "#c6c9b9");
    m.oval(-0.72, 0, 0.99, 0.055, 0.17, 0.285, "#bbc0af");
    for (const y of [-0.15, 0.15])
      m.tube(
        [
          [-0.67, y, 1.05],
          [-0.45, y, 0.91],
          [-0.39, y, 0.71],
        ],
        0.034,
        "#b8bead"
      );
  }
}

function photoBooth(m) {
  for (const x of [-0.56, 0.56]) {
    m.box(x, 0, 0, 0.32, 1.02, 0.105, "stone:#a8a7a2");
    m.box(x, 0, 0.105, 0.22, 0.85, 0.05, dark);
  }
  m.box(0, 0, 0.15, 1.45, 0.9, 0.065, dark);
  m.box(0, 0.424, 0.21, 1.45, 0.065, 1.87, "#d7d9d1");
  for (const [x, w] of [
    [-0.5, 0.45],
    [0.55, 0.35],
  ])
    m.box(x, 0, 0.21, w, 0.9, 1.87, offWhite);
  m.box(0, 0, 2.08, 1.48, 0.94, 0.21, offWhite);
  m.box(0, -0.477, 2.095, 1.39, 0.025, 0.165, "#f3f2e8");
  m.text("DNP", -0.53, -0.496, 2.14, 0.22, 0.066, blue, 0.003);
  m.text("Ki-Re-i", 0.12, -0.496, 2.125, 0.8, 0.11, blue, 0.003);
  m.tube(
    [
      [-0.25, -0.29, 2.02],
      [0.39, -0.29, 2.02],
    ],
    0.019,
    steel
  );
  // Alternate ridges and hollows along the hanging curtain; the opening below exposes the footwell.
  const front = (i, z) => [
    -0.25 + i * 0.039,
    -0.29 + Math.cos((i * Math.PI) / 2) * 0.029,
    z + 0.012 * Math.sin(i * 0.65),
  ];
  for (let i = 0; i < 15; i++)
    m.face(
      [front(i, 0.54), front(i + 1, 0.54), front(i + 1, 2.04), front(i, 2.04)],
      i % 4 === 1 ? "canvas:#214b92" : "canvas:#386cb5",
      [0, -1, 0]
    );
  m.box(0.04, -0.328, 1.12, 0.42, 0.012, 0.57, paper);
  m.text("QR", 0.04, -0.339, 1.39, 0.27, 0.12, blue, 0.002);
  m.box(.04,-.339,1.58,.40,.008,.062,"#c9c25d");
  m.box(.04,-.339,1.68,.43,.008,.13,"#344c80");
  m.box(.04,-.339,1.82,.46,.008,.115,"#ae3153");
  m.text("ID PHOTO",.04,-.346,1.716,.33,.054,paper,.002);
  for(const x of [-.083,.045,.143]) {
    m.box(x,-.341,1.19,.058,.008,.07,"#c4d4df");
    m.oval(x,-.349,1.225,.014,.004,.019,blue,8,4);
  }
  m.box(-0.51, -0.454, 0.97, 0.35, 0.014, 0.92, "#dae3e5");
  for (let row = 0; row < 4; row++) {
    m.box(-0.51, -0.465, 1.8 - row * 0.19, 0.3, 0.009, 0.037, row % 2 ? blue : "#bd5875");
    for (let j = 0; j < 4; j++)
      m.box(-0.625 + j * 0.074, -0.467, 1.69 - row * 0.19, 0.052, 0.01, 0.075, j % 2 ? "#6c899b" : "#8a9eb5");
  }
  m.box(-0.51, -0.457, 0.56, 0.27, 0.02, 0.088, dark);
  m.box(0.55, -0.456, 0.43, 0.22, 0.02, 0.7, blue);
  m.box(.55,-.466,.98,.20,.016,.22,paper);
  m.oval(.55,-.477,1.086,.050,.006,.072,"#344b60",13,6);
  m.oval(.55,-.483,1.079,.034,.005,.043,"#d9bfa6",10,5);
  for(let i=0;i<5;i++) m.box(.55,-.471,.52+i*.078,.125-i%2*.039,.009,.017,"#c4d9ed");
  for(const x of [-.675,.69]) m.box(x,-.453,.27,.014,.014,1.74,"#b5b8b7");
  m.text("DNP", -0.51, -0.47, 0.44, 0.27, 0.064, blue, 0.002);
  m.turned(
    0.12,
    0.17,
    [
      [0.21, 0.05],
      [0.46, 0.04],
      [0.49, 0.17],
      [0.52, 0.17],
    ],
    "#929799"
  );
}

function noticeCase(m, variant) {
  const width = 2.55;
  m.box(0, 0, 0, width, 0.3, 0.11, "stone:#8a8981");
  for (const x of [-1.21, 1.21]) {
    m.box(x, 0, 0.11, 0.066, 0.091, 1.94, alloy);
    m.box(x, 0, 0.1, 0.13, 0.18, 0.065, steel);
  }
  m.box(0, 0.01, 0.64, width, 0.098, 1.3, "#696e69");
  for (const z of [0.61, 1.91]) m.box(0, 0, z, width + 0.035, 0.17, 0.069, "#c4c7be");
  for (const x of [-1.25, 1.25]) m.box(x, -0.01, 0.62, 0.047, 0.15, 1.32, "#b7bab1");
  const inks = ["#47788c", "#c99a42", "#769287", "#b36d62", "#778bad", "#a99e8c"];
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < 6; col++) {
      const n = row * 6 + col + variant * 5;
      if (n % 10 === 3 || n % 13 === 7) continue;
      const x = -1.019 + col * 0.409 + ((n % 3) - 1) * 0.021,
        z = 0.73 + row * 0.56 + (n % 4) * 0.012;
      const w = n % 4 === 0 ? 0.377 : 0.304,
        h = n % 5 === 0 ? 0.365 : 0.46;
      m.box(x, -0.048, z, w, 0.012, h, n % 6 === 3 ? "#e1dab3" : paper);
      m.box(x, -0.058, z + h - 0.087, w - 0.026, 0.005, 0.064, inks[n % 6]);
      if (m.detail) {
        m.box(x - w * 0.17, -0.06, z + h * 0.26, w * 0.47, 0.005, h * 0.32, inks[(n + 3) % 6]);
        for (let i = 0; i < 3; i++)
          m.box(x + 0.025, -0.062, z + 0.035 + i * 0.03, w * (0.66 - i * 0.07), 0.003, 0.009, "#81837a");
      }
    }
  m.windowPane(-1.22, 1.22, 0.68, 1.91, -0.081, "#c8d1cc");
  m.tube(
    [
      [-1.17, 0.09, 0.32],
      [1.17, 0.09, 0.32],
    ],
    0.029,
    alloy
  );
}

function archedEntrance(m) {
  const facade = "ashlar:#9b8e8c";
  const stones = ["carvedStone:#a79d92", "carvedStone:#a39a90", "carvedStone:#b2a99b", "carvedStone:#a69b91"];
  const width = 5.65,
    top = 3.82,
    spring = 2.04;
  // Four nested segmental arches. Every stone has a front, side and intrados.
  const courses = [
    [1.09, 0.53, 0.22],
    [1.24, 0.68, 0.11],
    [1.43, 0.86, -0.02],
    [1.65, 1.04, -0.16],
    [1.86, 1.2, -0.29],
  ];
  const pt = ([r, h, y], a) => [r * Math.cos(a), y, spring + h * Math.sin(a)];
  const n = 15,
    outer = courses.at(-1);
  for (let i = 0; i < n; i++) {
    const a = (i * Math.PI) / n,
      b = ((i + 1) * Math.PI) / n;
    const A = pt(outer, a),
      B = pt(outer, b);
    const mortar = [courses[0][0], courses[0][1], 0.3];
    m.face([pt(mortar, a), [A[0], 0.3, A[2]], [B[0], 0.3, B[2]], pt(mortar, b)], "#645e57", [0, -1, 0]);
    m.face([A, B, [B[0], outer[2], top], [A[0], outer[2], top]], facade, [0, -1, 0]);
    const lintelCenter = [0, courses[0][2], spring];
    m.face([lintelCenter, pt(courses[0], a), pt(courses[0], b)], "carvedStone:#948575", [0, -1, 0]);
    for (let j = 0; j < courses.length - 1; j++) {
      const inside = courses[j],
        outside = courses[j + 1],
        stepped = [inside[0], inside[1], outside[2]];
      const a1 = a + 0.0015,
        b1 = b - 0.0015,
        lip = [stepped[0] + .024, stepped[1] + .024, stepped[2]],
        soffit = [stepped[0], stepped[1], stepped[2] + .025],
        v = [pt(lip, a1), pt(outside, a1), pt(outside, b1), pt(lip, b1)];
      m.face(v, stones[(i + 2 * j) % 4], [0, -1, 0]);
      m.face([pt(soffit,a1),pt(lip,a1),pt(lip,b1),pt(soffit,b1)], "carvedStone:#b4aaa0", [0,-1,-.4]);
      m.face([pt(inside, a), pt(soffit, a), pt(soffit, b), pt(inside, b)], stones[(i + j + 1) % 4], [
        -Math.cos((a + b) / 2),
        0,
        -Math.sin((a + b) / 2),
      ]);
    }
  }
  for (const sign of [-1, 1]) {
    const w = width / 2 - outer[0];
    m.box(sign * (outer[0] + w / 2), 0, 0, w, 0.58, top, facade);
    for (let j = 0; j < courses.length - 1; j++) {
      const a = courses[j],
        b = courses[j + 1],
        d = 0.32 - b[2];
      for (let row = 0; row < 4; row++)
        m.box(
          (sign * (a[0] + b[0])) / 2,
          b[2] + d / 2,
          (row * spring) / 4,
          b[0] - a[0],
          d,
          spring / 4 - 0.009,
          stones[(row + j) % 4]
        );
    }
  }
  m.box(0, -0.018, top - 0.064, width + 0.03, 0.64, 0.064, "carvedStone:#827774");
  for (const z of [.28,.80]) {
    const edge=width/2;
    m.tube([[1.98,-.332,z],[edge-.025,-.332,z],[edge+.029,-.292,z],[edge+.029,.196,z]],.018,"#67544b",7);
    for (const x of [2.05,2.69]) m.box(x,-.315,z-.042,.049,.056,.083,"#76645a");
  }
  m.box(0, 0.32, 0.02, 2.22, 0.12, 2.53, "#312b2c");
  for (const s of [-1, 1]) {
    const x = s * 0.53;
    m.box(x, 0.229, 0.075, 1.025, 0.065, 1.97, "#494348");
    for (const [z, h] of [
      [0.12, 0.29],
      [0.58, 0.28],
      [1.03, 0.32],
      [1.53, 0.33],
    ])
      m.box(x, 0.190, z, 0.83, 0.015, h, "doorGlass:#28292a");
    const pull = x - s * 0.41;
    m.tube([[pull, 0.19, 0.81], [pull, 0.12, 0.84], [pull, 0.12, 1.22], [pull, 0.19, 1.25]], 0.016, "#81796b", 6);
  }
  m.box(0, 0.194, 2.055, 2.12, 0.025, 0.12, "#544f50");
  m.box(0, 0.18, 2.15, 0.48, 0.022, 0.093, "#8e8982");
  m.box(-0.54, 0.17, 1.17, 0.13, 0.012, 0.17, "#c44447");
  m.text("AED", -0.54, 0.160, 1.27, 0.105, 0.034, paper, 0.002);
  m.box(-0.75, 0.174, 1.30, 0.14, 0.012, 0.21, paper);
  m.box(-0.75, 0.164, 1.47, 0.14, 0.008, 0.041, "#d3bb67");
  m.box(-1.09, 0.086, 1.11, 0.076, 0.049, 0.155, alloy);
}

function stonePost(m) {
  m.box(0, 0, 0, 0.56, 0.48, 0.83, stone);
  const arc = Array.from({ length: 13 }, (_, i) => [
    0.28 * Math.cos((i * Math.PI) / 12),
    0.83 + 0.28 * Math.sin((i * Math.PI) / 12),
  ]);
  for (let i = 0; i < 12; i++) {
    const [a, b] = arc.slice(i, i + 2);
    m.face(
      [
        [a[0], -0.24, a[1]],
        [a[0], 0.24, a[1]],
        [b[0], 0.24, b[1]],
        [b[0], -0.24, b[1]],
      ],
      "carvedStone:#968f87",
      [a[0], 0, 1]
    );
  }
  for (const side of [-1, 1])
    m.face(
      arc.map(([x, z]) => [x, side * 0.24, z]),
      stone,
      [0, side, 0]
    );
}

function graniteLanding(m, chipped) {
  const width = 6.34,
    depth = 1.9,
    height = 0.145;
  m.box(0, 0, 0, width, depth, 0.108, "#98968f");
  // A continuous nosing survives in front of the chipped flagstone in photograph 53.
  m.box(0, -0.855, 0.108, width, 0.19, height - 0.108, "cutGranite:#c2c2bf");
  const tones = ["#b1b4b7", "#a9afb1", "#b8bab9", "#adb1b2"];
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < 6; col++) {
      const w = width / 6 - 0.007,
        d = 0.855 - 0.007;
      const x = -width / 2 + ((col + 0.5) * width) / 6,
        y = -0.76 + (row + 0.5) * 0.855;
      const finish = "cutGranite:" + tones[(col + row * 2) % 4];
      if (!chipped || col !== 4 || row !== 0) {
        m.box(x, y, 0.108, w, d, height - 0.108, finish);
        continue;
      }
      const perimeter = [
        [-1, -1],
        [-0.55, -1],
        [0, -1],
        [0.53, -1],
        [1, -1],
        [1, -0.35],
        [1, 0.37],
        [1, 1],
        [0.36, 1],
        [-0.28, 1],
        [-1, 1],
        [-1, 0.4],
        [-1, -0.3],
      ];
      const rim = perimeter.map(([u, v]) => [x + (u * w) / 2, y + (v * d) / 2, height]);
      const edge = perimeter.map(([u, v], i) => [
        x - 0.06 + u * w * (0.32 + 0.08 * Math.sin(i * 3.1)),
        y - 0.07 + v * d * (0.28 + 0.09 * Math.sin(i * 2.4)),
        height,
      ]);
      for (let i = 0; i < rim.length; i++) {
        const j = (i + 1) % rim.length,
          a = edge[i],
          b = edge[j];
        const lowA = [a[0], a[1], 0.113],
          lowB = [b[0], b[1], 0.113];
        m.face([rim[i], rim[j], b, a], finish, [0, 0, 1]);
        m.face([a, b, lowB, lowA], "#8e8b82");
        m.face([lowA, lowB, [x - 0.06, y - 0.07, 0.117]], "spall:#888882", [0, 0, 1]);
      }
      // Broken white aggregate projects out of the darker bedding. Keep each
      // chip inside the jagged rim and below the surviving polished surface.
      const center=[x-.06,y-.07];
      for(let k=0;k<31;k++){
        const a=2.39996*k, r=Math.sqrt((k+.3)/31);
        const px=center[0]+Math.cos(a)*r*w*.24, py=center[1]+Math.sin(a)*r*d*.21;
        const size=.014+.022*(.5+.5*Math.sin(k*7.93));
        m.loft([m.ring(px,py,.116,size*1.24,size*.73,5,a),
          m.ring(px+.003,py+.002,.125+.009*Math.abs(Math.cos(k)),size*.73,size*.49,5,a+.14)],
          k%4 ? "cutGranite:#d4d3c7" : "spall:#98978c");
      }
    }
}

function wellPipes(m) {
  m.tube(
    [
      [-1.4, 0, 0.2],
      [-1.4, 0, 0.8],
      [-1.28, 0, 0.93],
      [1.19, 0, 0.93],
      [1.3, 0, 0.82],
      [1.3, 0, 0.18],
    ],
    0.061,
    "#c6c6b6"
  );
  for (const x of [-1.14, -.42, .45, 1.06]) {
    m.tube([[x,.11,.90],[x,-.002,.90],[x,-.002,1.005]],.013,steel,5);
    m.box(x,.115,.87,.08,.026,.13,alloy);
  }
  m.tube([[-1.16,.04,.17],[-.98,-.045,.31],[.85,-.045,.31],[.93,0,.40],[.93,.03,.60]],.043,"#acb2a6",9);
  for (const x of [-0.68, 0.32]) {
    m.tube(
      [
        [x, 0, 0.93],
        [x, -0.08, 0.77],
        [x, -0.08, 0.52],
        [x + 0.21, -0.08, 0.52],
      ],
      0.052,
      steel
    );
    m.tube([[x,-.08,.52],[x,-.12,.41],[x+.09,-.12,.35],[x+.20,-.045,.32]],.045,alloy,9);
    m.oval(x, -.07, .52, .145, .106, .12, "#93a2a3");
    m.oval(x,-.155,.55,.076,.027,.073,"#d6d7bf");
    m.turned(x+.14,-.08,[[.53,.026],[.62,.026]],steel,7);
    m.turned(x+.14,-.08,[[.616,.064],[.634,.064]],"#9d7760",7);
  }
}

function wellMasonry(m) {
  const shades=["#817b77","#777472","#8c837d","#827d77","#757774"];
  const height=.48;
  m.box(0,.036,0,3.45,.072,3.36,"#645f59");
  for(let j=0;j<7;j++) for(let i=-1;i<4;i++) {
    const a=Math.max(-1.725,-1.725+(i+(j%2)*.5)*.88), b=Math.min(1.725,-1.725+(i+1+(j%2)*.5)*.88);
    if (b-a<.04) continue;
    const shade=shades[(i+2*j+5)%shades.length], z=j*height;
    m.box((a+b)/2,-.012,z+.003,b-a-.009,.066,height-.008,"carvedStone:"+shade);
    if(j>2 && (i+2*j)%3===0) {
      const x=(a+b)/2;
      m.box(x,-.047,z+.22,.072,.01,.086,"#4b4941");
      m.face([[x-.029,-.054,z+.215],[x+.021,-.054,z+.215],[x+.010,-.054,z+.039]],"#a09a8e",[0,-1,0]);
    }
  }
}

function courtyardPost(m) {
  m.turned(0,0,[[0,.105],[.42,.093],[.49,.083],[.53,.054],[.55,.021]],"stucco:#9e9d92",14);
  m.turned(0,0,[[.30,.094],[.318,.094]],"#787a71",14);
}

function safetyCone(m) {
  m.box(0,0,0,.34,.34,.044,"#6e6861");
  m.turned(0,0,[[.04,.14],[.24,.096]],"#ce644b");
  m.turned(0,0,[[.24,.096],[.32,.079]],offWhite);
  m.turned(0,0,[[.32,.079],[.43,.055]],"#ce644b");
  m.turned(0,0,[[.43,.055],[.49,.042]],offWhite);
  m.turned(0,0,[[.49,.042],[.60,.019]],"#ce644b");
}

function laboratoryWindow(m) {
  const frame = "#aaa99d";
  const sash = "#c6c3b4";
  m.box(0, .038, 0, 5.2, .03, 1.7, "#545957");
  for (const [index, x] of [-1.70, 0, 1.70].entries()) {
    m.box(x, .012, .075, 1.64, .024, 1.545, ["#798075", "#616e6b", "#838a80"][index]);
    const count = m.detail ? 27 : 13;
    const drop = [1.48, .90, 1.39][index];
    for (let i = 0; i < count; i++) {
      const z = 1.585 - i * drop / count;
      m.box(x, -.007, z, 1.625, .013, drop / count * .52, ["#a6a99d","#929b90","#a7a99c"][index]);
    }
  }
  for (const x of [-2.57, -.85, .85, 2.57]) m.box(x, -.030, .035, .054, .054, 1.626, frame);
  for (const z of [.025, 1.62]) m.box(0, -.031, z, 5.18, .060, .054, sash);
  m.box(0, -.045, 0, 5.20, .096, .03, "#99998e");
}

function serviceBay(m) {
  // Repeated galvanized shading rails stand clear of the South 5 laboratory windows.
  for (const z of [3.78, 7.03, 10.3, 13.57]) {
    for (const x of [-2.92, 0, 2.92])
      m.tube(
        [
          [x, 0.27, z - 0.37],
          [x, -0.25, z - 0.06],
          [x, -0.25, z + 0.52],
        ],
        0.032,
        steel,
        5
      );
    for (let i = 0; i < 4; i++) {
      m.box(0, -0.26, z + i * 0.17, 5.96, 0.065, 0.105, "punchedMetal:#a8afb2");
      m.box(0,-.297,z+i*.17+.079,5.96,.019,.02,"#c2c6c5");
    }
    m.box(0,-.02,z-.09,5.96,.52,.048,"punchedMetal:#788184");
    for(const x of [-2.83,-1.45,0,1.45,2.83]) m.box(x,-.02,z-.165,.065,.54,.095,"#656f71");
  }
  // External soil stack, flanged goosenecks and the low safety rail visible from
  // the junction. The tubes stand clear of the window reveals.
  m.tube([[-.17,.15,.02],[-.17,.15,3.60]],.106,"#a9a9a3",11);
  for(let z=.26;z<3.6;z+=.32) m.turned(-.17,.15,[[z,.110],[z+.012,.110]],"#8e9390",11);
  for(const x of [-2.59,2.54]) {
    m.tube([[x,.09,.07],[x,.09,2.61],[x-.042,.08,2.75],[x-.14,.14,2.82],[x-.16,.27,2.82]],.048,"#a5a9a3",9);
    for(const z of [.65,1.91]) m.box(x,.17,z,.117,.20,.034,steel);
    m.oval(x+.34,.20,2.81,.079,.098,.105,"#909690",12,6);
  }
  for(const x of [-2.81,.18,2.81]) m.tube([[x,-.25,.02],[x,-.25,.96]],.018,"#989fa0",7);
  for(const z of [.25,.58,.94]) m.tube([[-2.99,-.25,z],[2.99,-.25,z]],.019,alloy,7);
  m.tube(
    [
      [-2.7, 0.1, 0.02],
      [-2.7, 0.1, 2.44],
      [-2.58, 0.1, 2.57],
      [-2.28, 0.1, 2.57],
    ],
    0.05,
    alloy
  );
  m.box(1.65, 0.16, 0.03, 0.87, 0.33, 0.44, "#d6d6c9");
  for (let i = 0; i < 4; i++) m.box(1.65, -0.016, 0.11 + i * 0.06, 0.69, 0.02, 0.018, steel);
}

function mirror(m) {
  m.turned(
    0,
    0,
    [
      [0, 0.052],
      [2.31, 0.052],
    ],
    "#c96b33"
  );
  m.tube(
    [
      [0, 0, 2.27],
      [0, 0.08, 2.57],
    ],
    0.045,
    steel
  );
  m.oval(0, 0, 2.58, 0.326, 0.062, 0.353, "#c87739", 20, 8);
  m.oval(0, -.046, 2.58, .303, .061, .322, "glass:#9aaeb1", 28, 12);
  const lip = Array.from({length:17}, (_, i) => {
    const a = Math.PI * i / 16;
    return [.318*Math.cos(a), -.085, 2.58+.338*Math.sin(a)];
  });
  m.tube(lip, .015, "#db843f", 6);
  m.box(0, .081, 2.35, .103, .055, .24, steel);
  for (const z of [.85,1.09]) m.turned(0,0,[[z,.055],[z+.11,.055]],offWhite);
  m.box(0, -.052, 1.45, .092, .012, .33, "#286482");
}
function bollard(m) {
  m.turned(
    0,
    0,
    [
      [0, 0.079],
      [0.035, 0.067],
      [0.76, 0.062],
      [0.8, 0.056],
    ],
    "#eeeede"
  );
  m.turned(
    0,
    0,
    [
      [0.69, 0.063],
      [0.725, 0.063],
    ],
    "#e6be48"
  );
}
function cornerLouvers(m) {
  m.box(0, 0.02, 0, 2.72, 0.2, 3.26, "#4b5051");
  for (let i = 0; i < 23; i++) m.box(0, -0.095, i * 0.142, 2.75, 0.075, 0.048, "#888d89");
}

function rainCoverCycle(m) {
  bicycle(m, true);
  // The fabric hood folds back over the child's seat. Its forward and side
  // windows share a curved zip; the seat is visible through those panels.
  const stations = [[-.85,.15,.92],[-.83,.213,1.14],[-.74,.25,1.29],[-.57,.255,1.35],[-.39,.25,1.32],[-.27,.229,1.22],[-.21,.192,1.06],[-.19,.16,.87]];
  const sides = m.detail ? 10 : 6;
  const ribs = stations.map(([x,width,top]) => Array.from({length:sides+1}, (_, k) => {
    const a = k*Math.PI/sides;
    return [x, -width*Math.cos(a), top-.081+.081*Math.sin(a)];
  }));
  for (let i = 1; i < ribs.length; i++) {
    const back = ribs[i-1], front = ribs[i], clear = i > 4;
    for (let k = 0; k < sides; k++)
      m.face([back[k],front[k],front[k+1],back[k+1]], clear ? "shopglass:#a7b8b7" : "canvas:#bac0bd",
        [0, -Math.cos((k+.5)*Math.PI/sides), 1], clear ? m.glassIndices : m.i);
    for (const k of [0,sides]) {
      const a=back[k], b=front[k], dir=[0,Math.sign(a[1]),0];
      const hem=p=>[p[0],p[1]*.89,.625], sill=p=>[p[0],p[1],Math.min(p[2],.924)];
      m.face([hem(a),hem(b),sill(b),sill(a)],"canvas:#3d403f",dir);
      const win=i>=3 && i<=6;
      m.face([sill(a),sill(b),b,a],win ? "shopglass:#a2b0ac" : "canvas:#737779",dir,win ? m.glassIndices : m.i);
      m.tube([a,b],.009,dark,5);
    }
  }
  for (const i of [1,4,7]) m.tube(ribs[i], .009, dark, 5);
  const rear=ribs[0], edge=[rear[0],[-.80,-.127,.645],[-.80,.127,.645],rear[sides]];
  m.face(edge,"canvas:#535651",[-1,0,0]);
  for(const sign of [-1,1])
    m.tube([[ -.82,sign*.186,1.04],[-.72,sign*.235,1.14],[-.53,sign*.245,1.27],[-.39,sign*.246,1.29]],.007,"#747873",5);
  m.oval(-.54,0,.92,.15,.13,.11,"#656867");
}

function cycleHoop(m) {
  const path = [
    [-0.78, 0, 0],
    [-0.78, 0, 0.61],
    [-0.76, 0, 0.68],
    [-0.7, 0, 0.73],
    [-0.62, 0, 0.75],
    [0.62, 0, 0.75],
    [0.7, 0, 0.73],
    [0.76, 0, 0.68],
    [0.78, 0, 0.61],
    [0.78, 0, 0],
  ];
  m.tube(path, 0.028, alloy, 8);
}

function parapetBlocks(m) {
  // Weathering follows the joints of the stone retaining wall and stops beneath its cap.
  const shades = ["#827d72", "#77726a", "#888278", "#79776e", "#817c73"];
  for (let row = 0; row < 2; row++) {
    for (let i = -1; i < 7; i++) {
      const left = Math.max(-3, -3 + i + row * 0.46),
        right = Math.min(3, -2 + i + row * 0.46);
      if (right - left < 0.02) continue;
      m.box(
        (left + right) / 2,
        0,
        row * 0.319,
        right - left - 0.008,
        0.245,
        0.314,
        "carvedStone:" + shades[(i + row + 7) % 5]
      );
      if (row === 1 && i % 2 === 0) {
        m.face(
          [
            [left + 0.02, -0.124, 0.62],
            [left + 0.075, -0.124, 0.62],
            [left + 0.045, -0.124, 0.4],
          ],
          "#777369",
          [0, -1, 0]
        );
      }
    }
  }
  m.box(0, 0, 0.637, 6.01, 0.269, 0.07, "stucco:#969388");
}

function stopPlate(m) {
  m.tube([[0,.028,0],[0,.028,2.47]],.032,"#95958b",10);
  function triangle(y,half,top,bottom,color,reverse=false) {
    const face=[[-half,y,top],[0,y,bottom],[half,y,top]];
    m.face(reverse ? face.reverse() : face,color,[0,reverse ? 1 : -1,0]);
  }
  triangle(.013,.35,2.52,1.92,alloy,true);
  triangle(-.007,.35,2.52,1.92,offWhite);
  triangle(-.010,.316,2.50,1.955,"#a74039");
  m.text("止まれ",0,-.015,2.31,.424,.109,offWhite,.002);
  for(const z of [2.12,2.41]) m.box(0,.045,z,.19,.035,.037,steel);
}

function terraceLight(m) {
  m.box(0,0,0,.105,.098,.466,"#7c817f");
  m.box(0,0,.465,.104,.097,.043,"#e4e7de");
  m.box(0,0,.508,.108,.101,.016,alloy);
}

function cribPlants(m) {
  // Soil pockets sit between the lips of the existing stepped retaining wall.
  m.oval(0,0,.025,.32,.13,.031,"#665c48",12,4);
  for(let i=0;i<13;i++) {
    const a=i*2.39996, x=.19*Math.cos(a), y=.08*Math.sin(a), h=.095+.13*(.5+.5*Math.sin(i*1.37));
    m.tube([[x,y,.04],[x*1.18,y*1.22,h*.69],[x*1.34,y*1.28,h]],.008,"#605937",4);
    m.oval(x*1.34,y*1.28,h,.053,.033,.053,["#818c51","#859759","#737d49","#a1a566"][i%4],6,4);
  }
}

function retainingCells(m) {
  // Three open concrete cells per bay. Walking along the lane exposes their
  // side webs and the soil behind each projecting lip (IMG_1382, 02:37).
  const concrete=["stucco:#77786f","stucco:#808078","stucco:#73756f"];
  for(let row=0; row<8; row++) {
    const y=.94-row*.229, z=.12+row*.555;
    m.box(0,y-.125,z,2.70,.28,.13,concrete[row%3]);
    m.box(0,y-.28,z+.11,2.70,.32,.064,"#675e4b");
    m.box(0,y-.39,z+.12,2.70,.115,.47,concrete[(row+1)%3]);
    for(const x of [-.90,0,.90]) {
      const profile=[[y-.29,z+.13],[y-.01,z+.13],[y-.09,z+.40],[y-.29,z+.47]];
      const left=profile.map(([v,h])=>[x-.082,v,h]), right=profile.map(([v,h])=>[x+.082,v,h]);
      m.face(left,concrete[row%3],[-1,0,0]);
      m.face(right.slice().reverse(),concrete[row%3],[1,0,0]);
      for(let i=0;i<4;i++) {
        const j=(i+1)%4;
        m.face([left[i],right[i],right[j],left[j]],concrete[(row+i)%3]);
      }
    }
  }
}

export const avenueFixtures = {
  ...tejimaFixtures,
  ginkgoBed: [[2.16,1.64,.05],treePit],
  graniteKerb: [[1,.135,.05],m=>{
    m.loft([m.rect(0,0,0,1,.135),m.rect(0,0,.035,1,.135),m.rect(0,0,.05,.993,.122)],"cutGranite:#c3c3bd");
  }],
  concreteSpandrel: [[1,.052,1],m=>m.box(0,0,0,1,.052,1,"castConcrete:#c4c0b3")],
  ...pathFixtures,
  retainingCells: [[2.70,2.46,4.50],retainingCells],
  cribPlants: [[.68,.28,.27],cribPlants],
  stopPlate: [[.70,.14,2.52],stopPlate],
  terraceLight: [[.108,.101,.524],terraceLight],
  wellMasonry: [[3.45,.12,3.36],wellMasonry],
  courtyardPost: [[.21,.21,.55],courtyardPost],
  safetyCone: [[.34,.34,.60],safetyCone],
  parkedCycle: [[1.76, 0.55, 1.04], (m) => bicycle(m, false)],
  childCycle: [[1.76, 0.55, 1.28], (m) => bicycle(m, true)],
  coveredCycle: [[1.76, 0.55, 1.35], rainCoverCycle],
  cycleHoop: [[1.62, 0.07, 0.78], cycleHoop],
  parapetBlocks: [[6.01, 0.27, 0.71], parapetBlocks],
  photoBooth: [[1.48, 1.02, 2.29], photoBooth],
  noticeCaseA: [[2.59, 0.3, 2.05], (m) => noticeCase(m, 0)],
  noticeCaseB: [[2.59, 0.3, 2.05], (m) => noticeCase(m, 1)],
  noticeCaseC: [[2.59, 0.3, 2.05], (m) => noticeCase(m, 2)],
  archedEntrance: [[5.65, 0.76, 3.82], archedEntrance],
  chippedLanding: [[6.34, 1.9, 0.145], (m) => graniteLanding(m, true)],
  graniteLanding: [[6.34, 1.9, 0.145], (m) => graniteLanding(m, false)],
  roundCoping: [[0.56, 0.48, 1.11], stonePost],
  wellPipes: [[2.94, 0.29, 1.05], wellPipes],
  laboratoryBay: [[5.98, 0.63, 14.23], serviceBay],
  laboratoryWindow: [[5.2, .12, 1.70], laboratoryWindow],
  cornerLouvers: [[2.75, 0.29, 3.26], cornerLouvers],
  trafficMirror: [[0.66, 0.23, 2.94], mirror],
  bandedBollard: [[0.16, 0.16, 0.8], bollard],
  stoneBall: [[0.39, 0.39, 0.55], (m) => m.oval(0, 0, 0.35, 0.195, 0.195, 0.2, "stucco:#aaa69b", 18, 10)],
};
