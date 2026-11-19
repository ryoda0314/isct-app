// 一冊の原点は背の下端。書架内の m で並べ、同じ立体を寸法・傾き・装丁を変えて使う。
// インスタンスの順は [背の中心 x, y, z, 上端の横ずれ, 厚さ, 符号付き奥行, 高さ, 巻号, r, g, b, 書名]。
export const BOOK_STRIDE = 12;

export function projectBookRack({ a, u, v, z, ...rack }, project) {
  const start = project(a);
  const axis = v => project([a[0]+v[0],a[1]+v[1]]).map((n,i) => n-start[i]);
  const along = axis(u), across = axis(v);
  const center = start.map((p,i) => p+(along[i]*rack.length+across[i]*rack.depth)/2);
  const extent = along.map((n,i) => (Math.abs(n)*rack.length+Math.abs(across[i])*rack.depth)/2);
  return { ...rack, origin:[...start,z], along, across, hand:Math.sign(u[0]*v[1]-u[1]*v[0]),
    center:[...center,z+rack.height/2], extent:[...extent,rack.height/2], metres:Math.hypot(...along) };
}

const jackets = [
  "#dfddce", "#f0ebdd", "#d5cec0", "#eae5d6", "#b8bcaf", "#eadab9", "#e1e1d8", "#bfccd0",
  "#e8e5dc", "#c5af94", "#d6d4bd", "#d1c5ae", "#486378", "#8d443c", "#52684f", "#425059",
  "#b47d45", "#828d91", "#ab685b", "#516c80", "#dab75c", "#8f929e", "#e1c5a3", "#708879",
];
const bindings = ["#733735", "#354c62", "#3c5546", "#494845", "#8c4a48", "#a28e72", "#cbc3a6", "#566e83", "#59473e", "#526251"];
const colors = list => list.map(s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16) / 255));
const generalColors = colors(jackets), journalColors = colors(bindings);

// 書名・誌名は撮影画像を使わず文字で組む。図書検索の書誌データとは独立した装丁用の表記。
export const SPINE_TITLES = [
  "線形代数", "物理学入門", "材料力学", "基礎化学", "統計解析", "建築構造", "計算科学", "現代数学",
  "機械設計", "生物学", "応用解析", "電子回路", "都市の歴史", "科学と社会", "熱と流体", "地球科学",
  "Geometry", "Materials", "Analysis", "Optics", "Dynamics", "Computing", "Geology", "Mathematics",
  "実験物理", "研究と方法", "科学史", "結晶構造", "環境工学", "設計論", "確率と統計", "技術と文化",
  "物性研究", "応用物理", "建築論集", "数理科学", "化学研究", "機械工学", "材料研究", "学術紀要",
  "PROCEEDINGS", "PHYSICS", "OPTICS", "MATERIALS", "ENGINEERING", "CHEMISTRY", "GEOLOGY", "TRANSACTIONS",
];

function randomStream(seed) {
  let n = seed >>> 0;
  return () => {
    n = (n + 0x6d2b79f5) >>> 0;
    let v = Math.imul(n ^ (n >>> 15), 1 | n);
    v ^= v + Math.imul(v ^ (v >>> 7), 61 | v);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

export function rackBooks(rack) {
  const { length, depth, height, rows, bays, fill, seed, journals } = rack;
  if (fill <= 0 || depth < 0.15) return new Float32Array();
  const values = [];
  const rowHeight = (height - 0.115) / rows, bayWidth = length / bays;
  const sides = rack.bookSide == null ? [0, 1] : [rack.bookSide];
  for (const side of sides) for (let bay = 0; bay < bays; bay++) {
    const series = randomStream(seed + 1429 * bay + 6581 * side);
    const seriesColor = Math.floor(series() * journalColors.length), seriesTitle = 32 + Math.floor(series() * 16);
    const seriesHeight = 0.225 + 0.044 * series(), seriesDepth = 0.155 + 0.04 * series();
    const seriesWidth = 0.033 + 0.019 * series(), firstVolume = 1 + Math.floor(series() * 38);
    let serial = firstVolume;
    for (let row = 0; row < rows; row++) {
      const random = randomStream(seed + 1103 * bay + 7823 * side + 421 * row);
      const width = bayWidth - 0.052;
      const occupied = width * (fill + (random() * 2 - 1) * Math.min(fill, 1 - fill));
      const free = width - occupied, inset = free * (random() < 0.5 ? random() * 0.2 : 0.8 + random() * 0.2);
      let x = bay * bayWidth + 0.026 + inset;
      const end = x + occupied, gapAt = x + occupied * (0.28 + 0.44 * random());
      let split = !journals && occupied > 0.38 && random() < 0.48;
      while (end - x >= 0.014) {
        const w = Math.min(end - x, journals ? seriesWidth * (0.88 + 0.26 * random()) : 0.014 + 0.042 * random() ** 1.4);
        const h = Math.max(0.03, Math.min(rowHeight - 0.023, journals ? seriesHeight + 0.005 * random() : 0.173 + 0.125 * random()));
        const aisleInset = 0.024 + (journals ? 0.012 : 0.038) * random();
        const available = (sides.length === 1 ? depth - .033 : depth / 2 - .011) - aisleInset;
        const d = Math.min(available, journals ? seriesDepth : h * (0.63 + 0.17 * random()));
        const y = side ? depth - aisleInset : aisleInset;
        // 倒れかけた本の上端は空きの側へ。両どなりにも棚板にも食い込ませない。
        const gap = split && x >= gapAt ? Math.min(0.06, end - x - w) : 0;
        const lean = gap > 0.014 ? gap * 0.87 : 0;
        if (gap > 0) split = false;
        const palette = journals ? journalColors : generalColors;
        const color = journals ? palette[seriesColor] : palette[(random() < .72 ? 0 : 12) + Math.floor(random()*12)];
        const tone = 0.90 + random() * 0.13;
        const title = journals ? seriesTitle : Math.floor(random() * 32);
        values.push(x + w / 2, y, 0.099 + row * rowHeight, lean,
          w, side ? -d : d, h, journals ? serial++ : 100 + Math.floor(random() * 899),
          color[0] * tone, color[1] * tone, color[2] * tone, title);
        x += w + gap + 0.0014 + random() * (journals ? 0.0012 : 0.0037);
      }
    }
  }
  return Float32Array.from(values);
}

// 共通の索引付きメッシュ。model xyz は厚さ・奥行・高さをそれぞれ 1 とした座標。
// 各面に材質、印字用の UV、紙や布の面の向きに応じた明るさを持たせる。
export function bookModel(detailed) {
  const vertices = [], indices = [];
  function quad(a, b, c, d, material, light, u0 = 0, u1 = 1) {
    const i = vertices.length / 7;
    for (const [pos, u, v] of [[a,u0,0], [b,u1,0], [c,u1,1], [d,u0,1]]) {
      vertices.push(...pos, u, v, material, light);
    }
    indices.push(i,i+1,i+2,i,i+2,i+3);
  }
  // 0 背、1 表紙と裏表紙、2 紙の天、3 小口、4 表紙の小口。
  const profile = detailed ? [[-0.5,0.058],[-0.39,0.015],[0,0],[0.39,0.015],[0.5,0.058]] : [[-0.5,0],[0.5,0]];
  for (let i = 1; i < profile.length; i++) {
    const [x,y] = profile[i-1], [X,Y] = profile[i];
    quad([x,y,0],[X,Y,0],[X,Y,1],[x,y,1],0, detailed ? [0.78,0.98,1,0.85][i-1] : 0.96, x+0.5,X+0.5);
    if (detailed) quad([x,y,1],[X,Y,1],[X,0.068,1],[x,0.068,1],4,1.05);
  }
  const front = detailed ? 0.058 : 0, fore = detailed ? 0.976 : 1;
  const pageX = detailed ? 0.441 : 0.50, pageZ = detailed ? 0.986 : 1;
  quad([-pageX,front,pageZ],[pageX,front,pageZ],[pageX,fore,pageZ],[-pageX,fore,pageZ],2,1);
  quad([pageX,fore,0],[-pageX,fore,0],[-pageX,fore,pageZ],[pageX,fore,pageZ],3,0.87);
  for (const side of [-1, 1]) {
    const x = side * 0.5, inset = side * pageX;
    quad([x,front,0],[x,1,0],[x,1,1],[x,front,1],1,side < 0 ? 0.78 : 0.89);
    if (!detailed) continue;
    quad([x,front,1],[inset,front,1],[inset,1,1],[x,1,1],4,1.12);
    quad([x,1,0],[inset,1,0],[inset,1,1],[x,1,1],4,0.84);
    quad([inset,0.068,pageZ],[inset,1,pageZ],[inset,1,1],[inset,0.068,1],4,0.7);
  }
  return { vertices: Float32Array.from(vertices), indices: Uint16Array.from(indices) };
}
