// 詳細モード（建物の中）：建物の階（構造物の type "floor"。campus3dFeatures.js）を描く三角形と、歩く世界（campus3dWalk.js）の立体・壁。
// 位置は平面の m（toXY）、高さは標高 m。階の高さ z は groundRef の地面（掘る前の地面＝dem.groundAt）から。
// 内装は昼の色のまま、光を受けない色（アルファ 0.5。campus3dLayer.js の VS_SOLID）で描き、面の向きで少し陰をつける（照明のある屋内。夜も明るい）。
// 描くのは：床（穴＝吹き抜け・階段の口）と床の下の面（下の階の天井）・部屋の床の色・壁（扉の口とまぐさ）・ガラス（枠）・格子の手すり・
// 家具など・階段（段・裏の面・手すり）・地下の上を覆う地面の高さの床（lids）。歩いて見るとき（全部の階）は、建物の屋根の下の天井と梁（addRoofCeiling）。
// 地下の階の下を掘ったふち（dig）の帯は addDigBand
import polygonClipping from "polygon-clipping";
import { LIFT_DOOR_H, LIFT_DOOR_W, LIFT_WALL, WALL_CAP, WALL_T, buildingRoof, herringboneBricks, offsetRingBy, pointInRing, ringArea, roofSlab, toLngLat, toXY, trackZs } from "./campus3dFeatures.js";

const hex = (h, a = 0.5) => {
  const n = parseInt(h.slice(1, 7), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, a];
};
// 内装の色（昼の色。アルファ 0.5＝光を受けない）
const PAL = {
  oak: "#d6c19d", concrete: "#c2beb7", tile: "#cfcbc3", carpet: "#959ba2", stone: "#b2ada4", white: "#ebe9e4", plaza: "#c9c5bc", gravel: "#9a968e", dark: "#55575b",
  wall: "#f1efeb", wallEdge: "#d9d6d0", ceiling: "#ecebe7", slabEdge: "#d4d1cb", roofCeil: "#57534e", beam: "#f4f4f2", beamLit: "#fdf8ec", riser: "#f0f0ee", tubeIn: "#2e3136",
  glass: "#dfeaf0", mullion: "#e3e6e8", mullionDark: "#6d7277", mesh: "#f2f2f0", rail: "#c9cdd1",
  wood: "#cfb48b", woodDark: "#8d6c4a", birch: "#e3d0aa", slatGap: "#7d6650", whiteItem: "#efeeea", darkItem: "#33363b", grey: "#9ea2a6", sofa: "#c0b9ab", seat: "#4d6d8f", green: "#5f7f45",
  screen: "#1e2127", glow: "#cfe2ee", counter: "#dcc59d", platform: "#d9c4a1", platformSide: "#a7a29a", kitchen: "#f3f2ef", vending: "#f6f6f3",
  piano: "#17181b", red: "#b9473d", orange: "#df8a2e", art: "#c7a36c", core: "#eeede9", lift: "#e9e8e4", toilet: "#e5e3de",
  walnut: "#7a5a3c", chalk: "#26292b", lamp: "#4a4d50", bentwood: "#c79f6b", mat: "#5d6064", // カフェ（カウンターの前板・メニューの黒板・ペンダントの照明・曲げ木の椅子）・入口のマット
  // 畳の小上がり（琉球畳の 2 つの色・灰色の石の台）、エレベーターのステンレス（扉・枠）と扉の合わせ目（2026-11-10）
  tatamiA: "#d2cb9c", tatamiB: "#c6bf8d", tatamiSide: "#77767a", steel: "#c4c9cd", steelEdge: "#8f969c",
  // 両側に座れるテントの形のソファー（灰色の布・背もたれの裏・細い金属の脚。写真 S__47226944・動画 IMG_0723 の t042〜t081）
  tentsofa: "#bdbbb6", tentsofaBack: "#b1afaa", sofaLeg: "#8c9196",
  // Taki Plaza 2 階の学習スペースの椅子とソファー（2026-11-12、動画 IMG_0723 の 124〜148 秒）：殻の椅子（灰）と細い金属の脚、
  // 木の枠の椅子（明るい木の枠・座面）、ソファー・ひじ掛けいす（灰の布）
  chairShell: "#b9b8b4", chairLeg: "#9a9ea2", woodFrame: "#cfae7c", chairSeat: "#c9c27a", loungeGrey: "#8f9194",
  // Taki Plaza 地下 2 階のキッチンとイベントスペース（2026-11-12、動画 IMG_1063）：畳の台の合板の側面と積層の線・畳の緑、電子レンジ・自販機の暗いガラス
  plywood: "#c4a37a", plywoodLine: "#8c6c4a", tatamiGreen: "#b8ba8b", tatamiGreen2: "#aeb183",
  // アップライトピアノ（2026-11-12、ユーザーの目印 5「ぴあのをちゃんとつくりたい」。動画 IMG_1063 の 24〜26 秒）：白鍵・黒鍵・ペダルの金・譜面
  pianoKey: "#f3f1ea", pianoBlackKey: "#0e0f11", pianoGold: "#c8a24a", pianoSheet: "#f7f5ee", pianoInk: "#55575b",
  stairWood: "#cdb38a", stairWhite: "#efeeea", stairStone: "#b6b2aa", stairEdge: "#9f9a91",
  // オークの段とステンレスの鼻の帯（2026-11-12、ユーザー「階段外だけじゃなくて中もつながってるんだから分けないでよ」：Taki の明かり取りの
  // 大階段のガラスの内の段。外の段 stairsOak（campus3dMesh）が昼の光で見える色にそろえる）
  stairOak: "#af8a66", stairNose: "#aaaeb2",
  // 大岡山駅の地下ホーム（2026-11-11、動画 IMG_1009）：市松の床（クリーム・ベージュ）・点字ブロック・線路の砂利・まくらぎ・レール・
  // 壁の大きなタイル（クリーム・赤茶・オリーブ・灰・からし色、下の暗い腰）・ホームドア（白・オレンジ・窓の暗いガラス）・鋼の柵・
  // 丸柱（赤茶・オレンジと黄の市松の帯・クリーム色のタイル・白い笠）・ベンチ（オレンジ）・発車標（暗い箱と光る字）・エスカレーター・天井
  checkerA: "#ece5d5", checkerB: "#d5c3a3", tactile: "#e2b93b", ballast: "#57554f", sleeper: "#8d8983", railSteel: "#5f6164", railHead: "#bfc3c7",
  tileCream: "#e8dec6", tileTerra: "#c66a43", tileOlive: "#ae9c58", tileGrey: "#cac7bf", tileKhaki: "#cbb47c", tileBase: "#3a3b3e",
  psdWhite: "#f2f1ec", psdOrange: "#ee8a1e", psdTop: "#c3c5c6", psdGlass: "#3a4047", psdFrame: "#dadbdc",
  colTerra: "#c1653e", colOrange: "#e8892f", colYellow: "#e6c34c", colCream: "#ece4cf", colCap: "#f3f2ee", barSteel: "#9ca1a6",
  benchSeat: "#e5852b", benchFrame: "#a2a7ac", boardBox: "#25282c", ledOrange: "#ff9a3a", ledGreen: "#66e477", ledRed: "#ff5d42",
  escStep: "#2b2d30", escLine: "#e3bf3a", escSide: "#c5cace", ceilSlat: "#e9e7e1", ceilLine: "#d0cdc6", ceilDark: "#45484d", darkWall: "#565a60", lightStrip: "#ffffff",
  // 大岡山駅の階段・エスカレーターのまわりと 1 階（2026-11-12、動画 IMG_1009 の 6〜80 秒）：階段の壁の小さなベージュのタイル（目地・白っぽい縦の帯）、
  // 石の段（明るい御影石・蹴上げ・段の角の黄と赤の印・ピンクの帯）、エスカレーター（黒い段・黄色い線・ステンレス・黒い手すり・ガラスの欄干）、
  // すりガラスの仕切り、段々の天井と丸い照明、鉄の扉、床の矢印、1 階の腰のタイル・木の格子・えんじ色の板・白いタイル、改札機・柱・ロッカー・機械・
  // 額の広告・消火栓の箱・パンフレットの棚
  mtile: "#c6b59b", mtileGrout: "#ab9b83", mtileBand: "#d9d5cb", mtileBandGrout: "#bdb8ad",
  stairTread: "#d6cfc2", stairRiser: "#bdb5a8", stairNose: "#9c9488", stairSide: "#c9c1b3", markYellow: "#f3c21f", markRed: "#dc3b2a", riserPink: "#ea5a95",
  escTread: "#35373b", escRiser: "#222427", escSkirt: "#cfd3d6", escDeck: "#d9dcdf", escHand: "#1b1c1e", escClad: "#c3c8cc", escPit: "#1e1f21", escPlate: "#a4a9ad", escComb: "#e5bd2c",
  glassBal: "#6f7b82", frost: "#f2f4f3", railSteel: "#c9ced2",
  soffit: "#eceae5", soffitUnder: "#e1dfd9", dlight: "#fffef6",
  doorLeaf: "#e9e3d3", doorFrame: "#d6cfbd", doorKnob: "#9ea3a7", arrowBg: "#45484d", arrowFg: "#f6f6f4",
  wainsTile: "#c9bda7", wainsGrout: "#ada190",wainsTop: "#ebe8e1", wainsTrim: "#b9b3a8", slatWood: "#7b4f37", slatBack: "#3d2a20", maroon: "#7a2140", wtile: "#f1f0ec", wtileGrout: "#dcdad5",
  gateBody: "#c9cdd1", gateTop: "#2f3236", gateFlap: "#e3e4e5", gateRead: "#4fb3ff", gateScreen: "#1b2633",
  cylDark: "#4a4648", locker: "#f3f3f0", lockerLine: "#c6c7c8", lockerLed: "#36d05b", machine: "#e6e7e5", screenDark: "#20262e",
  tile2A: "#d9cdb7", tile2B: "#d2c6af", floorBrown: "#a9715a",
  tvmBody: "#e8eaeb", tvmTop: "#1f3b6e", tvmScreen: "#16202c", tvmMenu: "#4f9ad6", tvmMenu2: "#f2f4f6", tvmSlot: "#2a2d31", tvmTray: "#3a3d42", tvmIc: "#3f8de0",
  posterFrame: "#6e4a32", posterIn: "#eae6dc", hydrant: "#f0eee8", hydrantRed: "#d9322b", rackFrame: "#c8ccd0", hatch: "#d8d6d0", ceilPlain: "#f1f0ec",
  // Taki Plaza 2 階の小物（2026-11-13、動画 IMG_1080）：窓ぎわの本棚（白い鉄の枠・木目の段の板・奥の板）、Attic Studio の白い棚（板・足もと・
  // 引き出しの木の前板・取っ手）、計算式の時計（木の箱・黒い面）、板を重ねた切り抜き（明るい木・中の色・濃い線）、トイレの木の板の表示
  // （3 つの木目）、貼り紙と字の色、星の飾りのひもと紙
  shelfSteel: "#eef0f0", shelfWood: "#d6c3a0", shelfBack: "#cbb894", shelfWhite: "#f1f1ee", shelfToe: "#d2d2cf", drawerWood: "#d9c8a7", handle: "#8a8d91",
  clockWood: "#c9a46c", clockFace: "#0c0d0f", cutLight: "#dcc394", cutMid: "#c6a473", cutDark: "#6f5838",
  signWood: "#d9c49b", signWood2: "#cdb488", signWood3: "#e3d2ae", paper: "#fbfaf6", noteInk: "#e2708c", noteGreen: "#4f9a5e", string: "#e9e6dc", starWhite: "#f4f3ee", starPale: "#ece4a6",
  // 附属図書館の地下（2026-11-13、動画 IMG_1077）：灰色のゴムの床、鉄の書架（明るい灰の板・段の板・奥の背の板）
  rubber: "#9a9ea2", stackSteel: "#dfe1e2", stackShelf: "#cfd2d4", stackBack: "#a9adb1",
  // 杉綾のれんが（herring。2026-11-13、動画 IMG_1077 の 612・654・870 秒）：目地と、れんがの 4 つの濃さ（明るい灰〜濃い灰）
  herring: "#8c8a85", herring0: "#c8c6c1", herring1: "#b2b0ab", herring2: "#9d9b96", herring3: "#86847f",
  // 図書館のゲート（2026-11-13、動画 IMG_1077 の 145〜148・600〜606・864 秒）：ステンレスの台・暗いガラスの天板・青い灯・白い防犯ゲートの枠
  gateSteel: "#b9bec2", gateSteelDark: "#8e9397", gateGlassTop: "#2a2e33", gateBlue: "#3d7bff", gateReader: "#1f2a44", secWhite: "#f2f2ef",
  // 打ち放しのコンクリートの壁（P コンの穴）と白いれんがの壁（図書館の地下。動画 IMG_1077）
  concWall: "#c9c8c3", concHole: "#9d9c97", wbrick: "#ecebe6", wbrickJoint: "#d3d1ca",
  stairRubber: "#45484c", stairRubberNose: "#c9cdd0",
  // 図書館の東の階段（暗い鉄の枠にすりガラスの踏面）と、三角の階段の口の斜めのコンクリートの屋根（2026-11-13、動画 IMG_1077 の 190・380・570〜598 秒）
  stairGlass: "#c3cbcf", stairSteel: "#3c4044", wedgeConc: "#d3d1cb",
};
const COL = Object.fromEntries(Object.entries(PAL).map(([k, v]) => [k, hex(v)]));
const GLASS = hex(PAL.glass, 0.5);
const MESH = hex(PAL.mesh, 0.5);
// 面の向きで陰（上 1・下 0.8・横は向きで少しずつ）
const shade = (c, n) => {
  const k = n[2] > 0.7 ? 1 : n[2] < -0.7 ? 0.8 : 0.86 + 0.07 * n[0] + 0.03 * n[1];
  return [c[0] * k, c[1] * k, c[2] * k, c[3]];
};
const FINISH_COL = { oak: "oak", concrete: "concrete", tile: "tile", carpet: "carpet", stone: "stone", white: "white", plaza: "plaza", gravel: "gravel", dark: "dark", checker: "checkerA", ballast: "ballast", tactile: "tactile", tile2: "tile2A", brown: "floorBrown", rubber: "rubber", herring: "herring" };
const ITEM_COL = {
  box: "whiteItem", wood: "wood", white: "whiteItem", dark: "darkItem", grey: "grey", sofa: "sofa", seat: "seat", green: "green", screen: "screen", glow: "glow",
  counter: "counter", layered: "counter", slats: "birch", platform: "platform", table: "wood", shelf: "whiteItem", kitchen: "kitchen", vending: "vending", piano: "piano",
  red: "red", orange: "orange", art: "art", core: "core", lift: "lift", toilet: "toilet", walnut: "walnut", chalk: "chalk", lamp: "lamp", bentwood: "bentwood", mat: "mat",
  tatami: "tatamiA", steel: "steel", liftdoor: "steel", tentsofa: "tentsofa", column: "colCream", bench: "benchSeat", board: "boardBox", light: "lightStrip",
  chair: "chairShell", woodchair: "woodFrame", lounge: "loungeGrey",
  microwave: "whiteItem", drinks: "vending", stool: "whiteItem", tatamibox: "plywood", wboard: "whiteItem", bincab: "whiteItem", aframe: "red", louver: "darkItem",
  cubeshelf: "shelfWood", openshelf: "shelfWhite", mathclock: "clockWood", woodcut: "cutLight", woodsign: "signWood", note: "paper", stars: "starWhite", stack: "stackSteel",
  flapgate: "gateSteel", secgate: "secWhite",
};
// 椅子とソファー（addSeatItem が描く。4 点の四角の 1 本目の辺が背）
const SEAT_ITEMS = new Set(["chair", "woodchair", "lounge"]);
// キッチンとイベントスペースの物（addKitchenItem が描く。4 点の四角の 1 本目の辺が前）
const KITCHEN_ITEMS = new Set(["microwave", "drinks", "stool", "tatamibox", "wboard", "bincab", "aframe", "louver"]);
// 2026-11-12（大岡山駅の階段の上・1 階）の物（addStationItem が描く）。床の上に置かない平らなもの（矢印・天井の照明・点検口）は歩く当たりにしない
const STATION_ITEMS = new Set(["soffit", "sdoor", "gate", "cyl", "locker", "machine", "arrow", "poster", "dlight", "hatch", "hydrant", "rack", "tvm"]);
// 壁に貼った薄い物（木の板の表示・貼り紙・星の飾り。2026-11-13）も当たりにしない
const FLAT_ITEMS = new Set(["arrow", "dlight", "hatch", "woodsign", "note", "stars"]);
const TATAMI = 0.88; // 畳（半畳の琉球畳）の目の大きさ（m）
// rubber：黒いゴムの踏面に明るい灰の段鼻（附属図書館の地下・学習棟の階段。2026-11-13、動画 IMG_1077）
const STAIR_COL = { wood: "stairWood", white: "stairWhite", stone: "stairStone", escalator: "escStep", oak: "stairOak", rubber: "stairRubber", glass: "stairGlass" };
const NOSE_TREAD = 0.045; // オークの段の鼻のステンレスの帯：踏面のふちからの奥行き（m。外の階段と同じ）
const NOSE_DROP = 0.035; // 同じく蹴上げの上の端から下へ（m）
const DOOR_H = 2.2; // 扉の口の高さ（上はまぐさ）
const GLAZED_TOL = 0.25; // 平地の中の見えるガラスの面と「同じ線」とみなす、ガラスの壁の線からの距離（m）
const SOFFIT = 0.45; // 階段の段の角から裏の面まで
export const ROOF_CEIL_DROP = 0.6; // 屋根の板の上の面から天井（暗い灰色の板）まで

// ── 形の小さな道具 ──
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (v) => Math.hypot(v[0], v[1]);
const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const centroid = (ring) => ring.reduce((a, p) => [a[0] + p[0] / ring.length, a[1] + p[1] / ring.length], [0, 0]);
// 点 p が形 ring の辺の上（tol m 以内）か
const onRingEdge = (p, ring, tol = 0.03) => ring.some((a, i) => {
  const b = ring[(i + 1) % ring.length];
  const d = sub(b, a);
  const l2 = d[0] * d[0] + d[1] * d[1];
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / l2)) : 0;
  return len(sub(p, [a[0] + d[0] * t, a[1] + d[1] * t])) < tol;
});
// 四角形（[[x, y], z] × 4）を、向き n・色 c（陰をつける）で
const face = (m, p, n, c) => m.quad(p, n, shade(c, n));
// 平らな多角形の柱（ring、z0〜z1）。上の面・横の面（下の面は bottom なら）。sideCol があれば横はその色
function prismPoly(m, ring, z0, z1, c, { bottom = false, sideCol = null, top = true } = {}) {
  if (ring.length < 3 || !(z1 > z0)) return;
  if (top) m.polygon([ring], z1, [0, 0, 1], shade(c, [0, 0, 1]));
  if (bottom) m.polygon([ring], z0, [0, 0, -1], shade(c, [0, 0, -1]));
  const out = ringArea(ring) > 0 ? 1 : -1;
  const sc = sideCol || c;
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length];
    const L = len(sub(b, a));
    if (L < 1e-6) return;
    const n = [((b[1] - a[1]) / L) * out, (-(b[0] - a[0]) / L) * out, 0];
    face(m, [[a, z0], [b, z0], [b, z1], [a, z1]], n, sc);
  });
}

// 両側に座れるテントの形のソファー（物 tentsofa の四角 r。1 本目の辺が長さ＝背のてっぺんの線、z0〜z1 がてっぺん）：細い金属の脚 4 本、
// 両側に座面（角を落とした厚いクッション）、まん中に 2 枚の背もたれが寄りかかり合った三角の形（写真 S__47226944：背の端が「Λ」に見える）
// 斜めの板の屋根（物 wedge）の上の面：形の点 r（平面の m）と点ごとの高さ zs の平らな面 (x, y) → 高さ。全部の点にいちばん合う平面
// （zs は読み込みで小数 2 けたに丸めるので、点が数 mm 平らでない。前は最初の 3 点の面で、上の面の三角とずれ、側の壁の上の端が線に見えた。
// 2026-11-14）。一直線に並ぶときは一直線でない 3 点から
export function wedgeTopAt(r, zs) {
  const n = r.length;
  if (n >= 3) {
    const mx = r.reduce((s, p) => s + p[0], 0) / n, my = r.reduce((s, p) => s + p[1], 0) / n, mz = zs.reduce((s, z) => s + z, 0) / n;
    let sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0;
    r.forEach((p, i) => { const dx = p[0] - mx, dy = p[1] - my, dz = zs[i] - mz; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; sxz += dx * dz; syz += dy * dz; });
    const det = sxx * syy - sxy * sxy;
    if (det > 1e-6 * Math.max(1, sxx * syy)) {
      const cx = (sxz * syy - syz * sxy) / det, cy = (syz * sxx - sxz * sxy) / det;
      return (x, y) => mz + cx * (x - mx) + cy * (y - my);
    }
  }
  for (let k = 1; k + 1 < r.length; k++) {
    const [x0, y0] = r[0], [x1, y1] = r[k], [x2, y2] = r[k + 1];
    const det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(det) < 1e-6) continue;
    const dz1 = zs[k] - zs[0], dz2 = zs[k + 1] - zs[0];
    const cx = (dz1 * (y2 - y0) - dz2 * (y1 - y0)) / det;
    const cy = ((x1 - x0) * dz2 - (x2 - x0) * dz1) / det;
    return (x, y) => zs[0] + cx * (x - x0) + cy * (y - y0);
  }
  const zm = Math.max(...zs);
  return () => zm;
}

// 斜めの板の屋根（物 wedge。附属図書館 地下 1 階の三角の階段の口の、床から立ち上がる打ち放しの斜めの板。2026-11-13、動画 IMG_1077 の
// 190・380・596 秒）：上の面（点ごとの高さ zs）・下の面（厚さ thick）・側の面（z0 から上の面まで。open の辺は口＝板の小口だけ）。形は凸
function addWedge(m, it, r, zf, T, tint) {
  const n = r.length;
  const col = it.color ? tint(COL_HEX(it.color)) : T("wedgeConc");
  const th = it.thick > 0 ? it.thick : 0.3;
  const zBot = zf + it.z0;
  // 上の面は 1 枚の平面（wedgeTopAt）：点の高さもその面の上に置く（側の壁の上の端と同じ面）
  const plane = wedgeTopAt(r, it.zs);
  const zt = r.map((p) => zf + Math.max(it.z0, plane(p[0], p[1])));
  const zb = zt.map((v) => Math.max(zBot, v - th));
  // 上の面の向き（上向き）
  let nn = [0, 0, 1];
  for (let k = 1; k + 1 < n; k++) {
    const u = [r[k][0] - r[0][0], r[k][1] - r[0][1], zt[k] - zt[0]], v = [r[k + 1][0] - r[0][0], r[k + 1][1] - r[0][1], zt[k + 1] - zt[0]];
    const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const L = Math.hypot(...cr);
    if (L > 1e-6) {
      nn = cr.map((x) => x / L);
      if (nn[2] < 0) nn = nn.map((x) => -x);
      break;
    }
  }
  for (let k = 1; k + 1 < n; k++) {
    face(m, [[r[0], zt[0]], [r[k], zt[k]], [r[k + 1], zt[k + 1]], [r[k + 1], zt[k + 1]]], nn, col);
    face(m, [[r[0], zb[0]], [r[k + 1], zb[k + 1]], [r[k], zb[k]], [r[k], zb[k]]], nn.map((x) => -x), col);
  }
  const ccw = ringArea(r) > 0;
  const open = new Set(it.open || []);
  // 閉じた辺の側の壁は厚さ WT の打ち放しの板（2026-11-14、ユーザーの目印「折り返してるのはいいけどそこから厚みを生み出さないと」：前は面 1 枚で、
  // 口から見ると紙のように薄かった）。辺から内へ WT の四角を外の形で切り、その縦の面を床の下から上の面まで（上は板の上の面が覆う）
  const WT = it.wallT > 0 ? it.wallT : th;
  const ztAt = (p) => zf + plane(p[0], p[1]);
  const ring = ccw ? r : r.slice().reverse();
  const clipConvex = (poly) => {
    let P = poly;
    for (let k = 0; k < ring.length && P.length; k++) {
      const a = ring[k], b = ring[(k + 1) % ring.length];
      const side = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]); // 左（中）が正
      const Q = [];
      P.forEach((p, i) => {
        const q = P[(i + 1) % P.length];
        const sp = side(p), sq = side(q);
        if (sp >= -1e-9) Q.push(p);
        if ((sp >= -1e-9) !== (sq >= -1e-9)) { const t = sp / (sp - sq); Q.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
      });
      P = Q;
    }
    return P;
  };
  for (let k = 0; k < n; k++) {
    const k2 = (k + 1) % n;
    const a = r[k], b = r[k2];
    const d = sub(b, a);
    const L = len(d);
    if (L < 1e-4) continue;
    const out = ccw ? [d[1] / L, -d[0] / L, 0] : [-d[1] / L, d[0] / L, 0];
    if (open.has(k)) {
      // 口：板の小口（下の面から上の面まで）
      if (zt[k] - zb[k] < 0.005 && zt[k2] - zb[k2] < 0.005) continue;
      face(m, [[a, zb[k]], [b, zb[k2]], [b, zt[k2]], [a, zt[k]]], out, col);
      continue;
    }
    const inw = [-out[0] * WT, -out[1] * WT];
    const slab = clipConvex([a, b, [b[0] + inw[0], b[1] + inw[1]], [a[0] + inw[0], a[1] + inw[1]]].map((p) => [p[0], p[1]]));
    if (slab.length < 3) continue;
    const sccw = ringArea(slab) > 0;
    slab.forEach((p, i) => {
      const q = slab[(i + 1) % slab.length];
      const e = sub(q, p);
      const Le = len(e);
      if (Le < 1e-4) return;
      const no = sccw ? [e[1] / Le, -e[0] / Le, 0] : [-e[1] / Le, e[0] / Le, 0];
      const tp = ztAt(p), tq = ztAt(q);
      if (tp - zBot < 0.005 && tq - zBot < 0.005) return;
      face(m, [[p, zBot], [q, zBot], [q, Math.max(zBot, tq)], [p, Math.max(zBot, tp)]], no, col);
    });
  }
}

function addTentSofa(m, r, z0, z1, T) {
  const L = len(sub(r[1], r[0])), W = len(sub(r[2], r[1]));
  if (L < 0.3 || W < 0.3) return;
  const u = [(r[1][0] - r[0][0]) / L, (r[1][1] - r[0][1]) / L];
  const v = [(r[2][0] - r[1][0]) / W, (r[2][1] - r[1][1]) / W];
  const ce = centroid(r);
  const P = (x, y) => [ce[0] + u[0] * x + v[0] * y, ce[1] + u[1] * x + v[1] * y];
  const seatC = T("tentsofa"), backC = T("tentsofaBack"), legC = T("sofaLeg");
  const hx = L / 2, hy = W / 2;
  const zSeat0 = z0 + 0.1, zSeat1 = z0 + 0.38;
  // 脚と、座面の下の細い枠
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) bar(m, [P(sx * (hx - 0.12), sy * (hy - 0.12)), z0], [P(sx * (hx - 0.12), sy * (hy - 0.12)), zSeat0 + 0.01], 0.025, legC);
  for (const sy of [-1, 1]) bar(m, [P(-hx + 0.12, sy * (hy - 0.12)), zSeat0 - 0.01], [P(hx - 0.12, sy * (hy - 0.12)), zSeat0 - 0.01], 0.025, legC);
  // 座面：両側。角を 0.06 落とした厚いクッション
  const ch = 0.06;
  for (const sy of [-1, 1]) {
    const y0 = sy * 0.1, y1 = sy * (hy - 0.01);
    const ya = Math.min(y0, y1), yb = Math.max(y0, y1);
    const ring = [P(-hx + ch, ya), P(hx - ch, ya), P(hx, ya + ch), P(hx, yb - ch), P(hx - ch, yb), P(-hx + ch, yb), P(-hx, yb - ch), P(-hx, ya + ch)];
    prismPoly(m, ring, zSeat0, zSeat1, seatC, { bottom: true });
  }
  // 背もたれ：(y, z) の四角を長さの向きに押し出す（両側。てっぺん z1 で寄りかかり合う）
  const zt = Math.max(z1, zSeat1 + 0.25);
  for (const sy of [-1, 1]) {
    const sec = [[0.34, zSeat1 - 0.02], [0.07, zt], [0.0, zt - 0.03], [0.12, zSeat1 - 0.02]].map(([y, z]) => [y * sy, z]);
    const x0 = -hx + 0.03, x1 = hx - 0.03;
    for (let k = 0; k < sec.length; k++) {
      const [ya, za] = sec[k], [yb, zb] = sec[(k + 1) % sec.length];
      // 面の外向き：(y, z) の辺の外向き（多角形の向きで）を 3 次元に
      const ny = (zb - za), nz = -(yb - ya);
      const nl = Math.hypot(ny, nz) || 1;
      const sgn = sy > 0 ? 1 : -1;
      const n = [v[0] * (ny / nl) * sgn, v[1] * (ny / nl) * sgn, (nz / nl) * sgn];
      face(m, [[P(x0, ya), za], [P(x1, ya), za], [P(x1, yb), zb], [P(x0, yb), zb]], n, k === 0 ? seatC : backC);
    }
    // 両端の面（「Λ」の片側）
    for (const [x, nx] of [[x0, -1], [x1, 1]]) {
      const pts = sec.map(([y, z]) => [P(x, y), z]);
      face(m, [pts[0], pts[1], pts[2], pts[3]], [u[0] * nx, u[1] * nx, 0], backC);
    }
  }
}

// 椅子とソファー（物 chair・woodchair・lounge の四角 r。1 本目の辺が背、z1 が背のてっぺん。2026-11-12、Taki Plaza 2 階の学習スペース）：
// chair 殻の椅子（座面と背が color の一枚、color2 の細い金属の脚）、woodchair 木の枠の椅子（color2 の枠・脚・背の横木 2 本、color の座面）、
// lounge ソファー・ひじ掛けいす（color の布の台・座・背・ひじ掛け、color2 の短い脚）
function addSeatItem(m, it, r, z0, z1, T, tint) {
  const col = it.color ? tint(COL_HEX(it.color)) : null;
  const col2 = it.color2 ? tint(COL_HEX(it.color2)) : null;
  const L = len(sub(r[1], r[0])), D = len(sub(r[3], r[0]));
  if (L < 0.2 || D < 0.2) return;
  const u = [(r[1][0] - r[0][0]) / L, (r[1][1] - r[0][1]) / L]; // 背に沿って
  const v = [(r[3][0] - r[0][0]) / D, (r[3][1] - r[0][1]) / D]; // 背から前へ
  const P = (x, y) => [r[0][0] + u[0] * x + v[0] * y, r[0][1] + u[1] * x + v[1] * y];
  const rect = (x0, y0, x1, y1) => [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)];
  const H = z1 - z0;
  if (it.kind === "lounge") {
    const cloth = col || T("loungeGrey"), legC = col2 || T("sofaLeg");
    const zl = z0 + 0.07, zs = z0 + Math.min(0.42, H * 0.55);
    const arm = Math.min(0.14, L * 0.16), back = Math.min(0.2, D * 0.25);
    for (const x of [0.07, L - 0.07]) for (const y of [0.07, D - 0.07]) bar(m, [P(x, y), z0], [P(x, y), zl + 0.01], 0.035, legC);
    prismPoly(m, rect(0.01, 0.01, L - 0.01, D - 0.01), zl, zs - 0.12, cloth, { bottom: true }); // 台
    prismPoly(m, rect(arm, back, L - arm, D - 0.02), zs - 0.12, zs, cloth); // 座のクッション
    prismPoly(m, rect(0, 0, L, back), zs - 0.12, z1, cloth); // 背
    for (const [xa, xb] of [[0, arm], [L - arm, L]]) prismPoly(m, rect(xa, back, xb, D), zs - 0.12, Math.min(z1, zs + 0.2), cloth); // ひじ掛け
    return;
  }
  const zs = z0 + Math.min(0.45, H * 0.56); // 座面の高さ
  if (it.kind === "chair") {
    const shell = col || T("chairShell"), legC = col2 || T("chairLeg");
    for (const x of [0.05, L - 0.05]) for (const y of [0.06, D - 0.05]) bar(m, [P(x, y), z0], [P(x, y), zs - 0.03], 0.024, legC);
    prismPoly(m, rect(0.01, 0.03, L - 0.01, D - 0.01), zs - 0.035, zs, shell, { bottom: true });
    prismPoly(m, rect(0.03, 0, L - 0.03, 0.035), zs, z1, shell, { bottom: true });
    return;
  }
  // woodchair：後ろの 2 本の脚は背のてっぺんまで（背の柱）
  const fr = col2 || T("woodFrame"), seat = col || T("chairSeat");
  for (const x of [0.03, L - 0.03]) {
    bar(m, [P(x, 0.03), z0], [P(x, 0.03), z1], 0.032, fr);
    bar(m, [P(x, D - 0.03), z0], [P(x, D - 0.03), zs], 0.032, fr);
  }
  prismPoly(m, rect(0.02, 0.02, L - 0.02, D - 0.02), zs - 0.03, zs, seat, { bottom: true });
  bar(m, [P(0.03, 0.03), z1 - 0.04], [P(L - 0.03, 0.03), z1 - 0.04], 0.05, fr);
  bar(m, [P(0.03, 0.03), zs + 0.18], [P(L - 0.03, 0.03), zs + 0.18], 0.025, fr);
  for (const y of [0.03, D - 0.03]) bar(m, [P(0.03, y), z0 + 0.16], [P(L - 0.03, y), z0 + 0.16], 0.018, fr);
}

// アップライトピアノ（物 piano の四角 r。1 本目の辺が鍵盤の側＝前。2026-11-12、ユーザー「ぴあのをちゃんとつくりたい」）：奥の本体（下の板・上の箱・
// ふた）、前へ出た鍵盤の台（拍子木＝両はしの腕木と前の脚 2 本）、白鍵 52 と黒鍵 36（A0〜C8 の並び）、譜面台と譜面、足もとのペダル 3（金）
function addPiano(m, r, z0, z1, T) {
  const F = frontOf(r);
  const L = F.L, D = len(sub(r[3], r[0]));
  if (L < 0.6 || D < 0.3) return;
  const inw = [-F.nf[0], -F.nf[1]];
  const P = (x, y) => [F.a[0] + F.u[0] * x + inw[0] * y, F.a[1] + F.u[1] * x + inw[1] * y];
  const box = (x0, y0, x1, y1) => [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)];
  const body = T("piano"), key = T("pianoKey"), bkey = T("pianoBlackKey"), gold = T("pianoGold");
  const H = z1 - z0;
  const bodyD = Math.min(0.4, D * 0.62); // 奥の本体の奥行き
  const yb = D - bodyD; // 本体の前の面
  const zKb = z0 + Math.min(0.66, H * 0.53); // 鍵盤の台の下
  const zKey = zKb + 0.07; // 白鍵の上
  // 奥の本体：下の板（ペダルの上まで）と上の箱、ふた
  prismPoly(m, box(0.02, yb, L - 0.02, D), z0 + 0.02, zKb, body, { sideCol: body });
  prismPoly(m, box(0, yb, L, D), zKb, z1 - 0.03, body, { sideCol: body });
  prismPoly(m, box(-0.01, yb - 0.02, L + 0.01, D + 0.005), z1 - 0.03, z1, body, { sideCol: body, bottom: true });
  // 台座（床の帯）
  prismPoly(m, box(0, yb - 0.01, L, D), z0, z0 + 0.02, T("darkItem"), { sideCol: T("darkItem") });
  // 鍵盤の台（拍子木）と両はしの腕木、前の脚
  prismPoly(m, box(0.0, 0.02, L, yb + 0.01), zKb, zKb + 0.05, body, { sideCol: body, bottom: true });
  for (const [x0, x1] of [[0, 0.1], [L - 0.1, L]]) prismPoly(m, box(x0, 0.0, x1, yb + 0.01), zKb, zKey + 0.08, body, { sideCol: body, bottom: true });
  for (const x of [0.05, L - 0.05]) bar(m, [P(x, 0.05), z0 + 0.02], [P(x, 0.05), zKb], 0.05, body);
  // 白鍵 52（境目の細い線）と黒鍵 36
  const kx0 = 0.1, kx1 = L - 0.1, kw = (kx1 - kx0) / 52;
  prismPoly(m, box(kx0, 0.03, kx1, 0.19), zKb + 0.05, zKey, key, { sideCol: key });
  for (let i = 1; i < 52; i++) {
    const x = kx0 + i * kw;
    m.quad([[P(x - 0.0012, 0.03), zKey + 0.001], [P(x + 0.0012, 0.03), zKey + 0.001], [P(x + 0.0012, 0.19), zKey + 0.001], [P(x - 0.0012, 0.19), zKey + 0.001]], [0, 0, 1], T("pianoInk"));
  }
  // 白鍵の名前（A0 から）：A B C D E F G のくり返し。黒鍵はその白鍵の右の境目（B・E のあとにはない）
  const names = "ABCDEFG";
  for (let i = 0; i < 51; i++) {
    const n = names[i % 7];
    if (n === "B" || n === "E") continue;
    const x = kx0 + (i + 1) * kw;
    prismPoly(m, box(x - kw * 0.29, 0.1, x + kw * 0.29, 0.19), zKey, zKey + 0.012, bkey, { sideCol: bkey });
  }
  // 鍵盤の奥の蓋の受け（暗い帯）と譜面台・譜面
  prismPoly(m, box(0.1, 0.19, L - 0.1, yb), zKb + 0.05, zKey + 0.05, body, { sideCol: body });
  const zM0 = zKey + 0.12, zM1 = Math.min(z1 - 0.12, zKey + 0.36);
  const lean = 0.05;
  face(m, [[P(0.18, yb - 0.004 - lean), zM0], [P(L - 0.18, yb - 0.004 - lean), zM0], [P(L - 0.18, yb - 0.004), zM1], [P(0.18, yb - 0.004), zM1]], [F.nf[0], F.nf[1], 0.3], body);
  const sx = L / 2;
  face(m, [[P(sx - 0.17, yb - 0.008 - lean * 0.85), zM0 + 0.03], [P(sx + 0.17, yb - 0.008 - lean * 0.85), zM0 + 0.03], [P(sx + 0.17, yb - 0.008 - lean * 0.1), zM1 - 0.02], [P(sx - 0.17, yb - 0.008 - lean * 0.1), zM1 - 0.02]], [F.nf[0], F.nf[1], 0.3], T("pianoSheet"));
  // ペダル 3（金）
  for (const dx of [-0.09, 0, 0.09]) prismPoly(m, box(sx + dx - 0.022, yb - 0.11, sx + dx + 0.022, yb), z0 + 0.05, z0 + 0.075, gold, { sideCol: gold });
}

// キッチンとイベントスペースの物（2026-11-12、Taki Plaza 地下 2 階。動画 IMG_1063）。4 点の四角の 1 本目の辺が前（frontOf）、x はその辺にそって、
// y は前から奥へ（0〜D）：microwave 電子レンジ（暗いガラスの扉と右の操作の帯）、drinks 自販機（上に商品の窓と色とりどりの段、右にお金の口、
// 下に取り出し口）、stool 背のない高い椅子（楕円の座 color・木の脚 4 本 color2・足かけ）、tatamibox 畳の台（下がり込んだ暗い台座・
// 合板の側面と積層の線・上に 2 枚の畳。color は畳）、wboard 移動式のホワイトボード（板の面が 1 本目の辺にそう・灰の枠・受け・脚と車輪）、
// bincab ゴミ箱の棚（0.6m ごとの区画：上に暗い棚の口、下に扉とラベル）、aframe A 型の看板（2 枚の板）、louver 黒いがらり（横の羽根）
function addKitchenItem(m, it, r, z0, z1, T, tint) {
  const col = it.color ? tint(COL_HEX(it.color)) : null;
  const col2 = it.color2 ? tint(COL_HEX(it.color2)) : null;
  const F = frontOf(r);
  const D = len(sub(r[3], r[0]));
  const H = z1 - z0;
  if (F.L < 0.05 || D < 0.01 || !(H > 0.01)) return;
  const inw = [-F.nf[0], -F.nf[1]];
  const P = (x, y) => [F.a[0] + F.u[0] * x + inw[0] * y, F.a[1] + F.u[1] * x + inw[1] * y];
  const box = (x0, y0, x1, y1) => [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)];
  if (it.kind === "microwave") {
    const body = col || T("whiteItem");
    prismPoly(m, r, z0, z1, body, { sideCol: body });
    frontQuad(m, F, F.L * 0.06, F.L * 0.68, z0 + H * 0.14, z0 + H * 0.86, 0.004, T("screenDark"));
    frontQuad(m, F, F.L * 0.74, F.L * 0.94, z0 + H * 0.6, z0 + H * 0.76, 0.004, T("tvmScreen"));
    return;
  }
  if (it.kind === "drinks") {
    const body = col || T("vending");
    prismPoly(m, r, z0, z1, body, { sideCol: body });
    const xw0 = F.L * 0.07, xw1 = F.L * 0.71;
    frontQuad(m, F, xw0, xw1, z0 + H * 0.42, z0 + H * 0.94, 0.004, T("screenDark"));
    const cs = ["#d8452f", "#f2c037", "#3d8fd6", "#f4f4f2", "#4caf50", "#e07b2a", "#7a4a2a"];
    for (let row = 0; row < 4; row++) {
      const zr = z0 + H * (0.46 + row * 0.12);
      for (let k = 0; k < 7; k++) {
        const x0 = xw0 + ((xw1 - xw0) * (k + 0.18)) / 7, x1 = xw0 + ((xw1 - xw0) * (k + 0.82)) / 7;
        frontQuad(m, F, x0, x1, zr, zr + H * 0.075, 0.008, tint(COL_HEX(cs[(row * 3 + k) % cs.length])));
      }
      frontQuad(m, F, xw0, xw1, zr - H * 0.012, zr - H * 0.004, 0.01, T("whiteItem"));
    }
    frontQuad(m, F, F.L * 0.76, F.L * 0.93, z0 + H * 0.45, z0 + H * 0.78, 0.004, T("grey"));
    frontQuad(m, F, F.L * 0.12, F.L * 0.66, z0 + H * 0.09, z0 + H * 0.2, 0.004, T("screenDark"));
    return;
  }
  if (it.kind === "stool") {
    const seatC = col || T("whiteItem"), legC = col2 || T("woodFrame");
    const ce = centroid(r);
    for (const q of r) {
      const foot = lerp2(q, ce, Math.min(0.4, 0.05 / (len(sub(ce, q)) || 1)));
      bar(m, [foot, z0], [lerp2(q, ce, 0.5), z1 - 0.04], 0.03, legC);
    }
    const zr = z0 + H * 0.38;
    const rr = r.map((q) => lerp2(q, ce, 0.28));
    for (let i = 0; i < 4; i++) bar(m, [rr[i], zr], [rr[(i + 1) % 4], zr], 0.016, T("railSteel"));
    const seat = Array.from({ length: 18 }, (_, k) => {
      const t = (2 * Math.PI * k) / 18;
      return P(F.L / 2 + F.L * 0.5 * Math.cos(t), D / 2 + D * 0.5 * Math.sin(t));
    });
    prismPoly(m, seat, z1 - 0.04, z1, seatC, { bottom: true });
    return;
  }
  if (it.kind === "tatamibox") {
    const ce = centroid(r);
    const plinth = r.map((q) => lerp2(q, ce, Math.min(0.4, 0.09 / (len(sub(ce, q)) || 1))));
    prismPoly(m, plinth, z0, z0 + 0.06, T("darkItem"), { sideCol: T("darkItem") });
    const ply = col2 || T("plywood");
    prismPoly(m, r, z0 + 0.06, z1, ply, { sideCol: ply, bottom: true });
    // 側面の積層の線（暗い細い帯）
    const out = ringArea(r) > 0 ? 1 : -1;
    r.forEach((a, i) => {
      const b = r[(i + 1) % r.length];
      const L = len(sub(b, a));
      if (L < 1e-3) return;
      const n = [((b[1] - a[1]) / L) * out, (-(b[0] - a[0]) / L) * out, 0];
      const off = (p) => [p[0] + n[0] * 0.002, p[1] + n[1] * 0.002];
      for (const f of [0.22, 0.4, 0.58, 0.76]) {
        const z = z0 + 0.06 + (H - 0.06) * f;
        face(m, [[off(a), z], [off(b), z], [off(b), z + 0.006], [off(a), z + 0.006]], n, T("plywoodLine"));
      }
    });
    // 上の 2 枚の畳（1 本目の辺に平行な継ぎ目で前と奥に分ける。ふちは合板が見える）
    const mat1 = col || T("tatamiGreen"), mat2 = col ? col : T("tatamiGreen2");
    const e = 0.03, g = 0.006;
    m.polygon([box(e, e, F.L - e, D / 2 - g)], z1 + 0.003, [0, 0, 1], shade(mat1, [0, 0, 1]));
    m.polygon([box(e, D / 2 + g, F.L - e, D - e)], z1 + 0.003, [0, 0, 1], shade(mat2, [0, 0, 1]));
    return;
  }
  if (it.kind === "wboard") {
    const yc = D / 2;
    const frame = col2 || T("grey"), board = col || T("whiteItem");
    const zb0 = z0 + Math.min(0.78, H * 0.4), zb1 = z1 - 0.03;
    for (const x of [0.025, F.L - 0.025]) bar(m, [P(x, yc), z0 + 0.09], [P(x, yc), z1], 0.035, frame);
    segBox(m, P(0.045, yc), P(F.L - 0.045, yc), 0.022, zb0, zb0, zb1, zb1, board, { bottom: true });
    bar(m, [P(0.045, yc), zb1 + 0.012], [P(F.L - 0.045, yc), zb1 + 0.012], 0.028, frame);
    bar(m, [P(0.045, yc), zb0 - 0.012], [P(F.L - 0.045, yc), zb0 - 0.012], 0.028, frame);
    segBox(m, P(0.12, yc - 0.055), P(F.L - 0.12, yc - 0.055), 0.07, zb0 - 0.05, zb0 - 0.05, zb0 - 0.02, zb0 - 0.02, T("darkItem"), { bottom: true });
    for (const x of [0.025, F.L - 0.025]) {
      bar(m, [P(x, 0.03), z0 + 0.09], [P(x, D - 0.03), z0 + 0.09], 0.03, frame);
      for (const y of [0.04, D - 0.04]) prismPoly(m, box(x - 0.025, y - 0.025, x + 0.025, y + 0.025), z0, z0 + 0.075, T("darkItem"), { sideCol: T("darkItem") });
    }
    return;
  }
  if (it.kind === "bincab") {
    const body = col || T("whiteItem");
    prismPoly(m, r, z0, z1, body, { sideCol: body });
    const n = it.n || Math.max(1, Math.round(F.L / 0.6));
    const bw = F.L / n;
    for (let k = 0; k < n; k++) {
      const x0 = k * bw, x1 = (k + 1) * bw;
      frontQuad(m, F, x0 + 0.025, x1 - 0.025, z1 - 0.21, z1 - 0.06, 0.003, T("screenDark"));
      if (k) frontQuad(m, F, x0 - 0.004, x0 + 0.004, z0 + 0.04, z1 - 0.22, 0.003, T("grey"));
      frontQuad(m, F, x0 + bw * 0.22, x0 + bw * 0.78, z1 - 0.44, z1 - 0.34, 0.004, T("whiteItem"));
      frontQuad(m, F, x0 + bw * 0.3, x0 + bw * 0.7, z1 - 0.405, z1 - 0.39, 0.006, T("darkItem"));
    }
    return;
  }
  if (it.kind === "aframe") {
    const c = col || T("red");
    const yc = D / 2;
    for (const yf of [0, D]) {
      const a0 = P(0.02, yf), a1 = P(F.L - 0.02, yf), t0 = P(0.02, yc), t1 = P(F.L - 0.02, yc);
      const s = [inw[0] * (yc - yf), inw[1] * (yc - yf), H];
      const u3 = [F.u[0], F.u[1], 0];
      let n = [u3[1] * s[2] - u3[2] * s[1], u3[2] * s[0] - u3[0] * s[2], u3[0] * s[1] - u3[1] * s[0]];
      const nl = Math.hypot(...n) || 1;
      n = n.map((v) => v / nl);
      face(m, [[a0, z0], [a1, z0], [t1, z1], [t0, z1]], n, c);
      face(m, [[a1, z0], [a0, z0], [t0, z1], [t1, z1]], n.map((v) => -v), c);
    }
    return;
  }
  if (it.kind === "louver") {
    const c = col || T("darkItem");
    prismPoly(m, r, z0, z1, c, { sideCol: c });
    const n = Math.floor(H / 0.045);
    for (let k = 1; k < n; k++) {
      const z = z0 + k * 0.045;
      frontQuad(m, F, 0.025, F.L - 0.025, z, z + 0.012, 0.004, T("grey"));
    }
  }
}

// エレベーターの昇降路（物 lift の四角 r。1 本目の辺が扉の面）：4 面の壁（厚さ LIFT_WALL、四角の中へ）。扉の面のまん中に口（LIFT_DOOR_W × LIFT_DOOR_H。
// 扉・かごは campus3dLift）。外から見て口の右に、細いステンレスの呼びボタンの板（動画 IMG_0723 の 2 階の写真）
export function liftSides(r) {
  const c = r.reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4], [0, 0]);
  return r.map((a, k) => {
    const b = r[(k + 1) % 4];
    const L = len(sub(b, a)) || 1;
    const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    let n = [-u[1], u[0]];
    const mid = lerp2(a, b, 0.5);
    if ((c[0] - mid[0]) * n[0] + (c[1] - mid[1]) * n[1] < 0) n = [-n[0], -n[1]]; // 中向き
    const inn = (p) => [p[0] + n[0] * (LIFT_WALL / 2), p[1] + n[1] * (LIFT_WALL / 2)];
    // 扉の面は口の両わきの 2 本と口の上（まぐさ）
    const s0 = (L - LIFT_DOOR_W) / 2, s1 = (L + LIFT_DOOR_W) / 2;
    return { a, b, L, u, n, inn, door: k === 0, s0, s1 };
  });
}
function addLiftShaft(m, r, z0, z1, c, steel) {
  for (const sd of liftSides(r)) {
    const { a, b, u, inn } = sd;
    const P = (s) => [a[0] + u[0] * s, a[1] + u[1] * s];
    if (!sd.door) {
      segBox(m, inn(a), inn(b), LIFT_WALL, z0, z0, z1, z1, c, { ends: false });
      continue;
    }
    segBox(m, inn(a), inn(P(sd.s0)), LIFT_WALL, z0, z0, z1, z1, c);
    segBox(m, inn(P(sd.s1)), inn(b), LIFT_WALL, z0, z0, z1, z1, c);
    if (z1 > z0 + LIFT_DOOR_H + 0.02) segBox(m, inn(P(sd.s0)), inn(P(sd.s1)), LIFT_WALL, z0 + LIFT_DOOR_H, z0 + LIFT_DOOR_H, z1, z1, c, { ends: false, bottom: true });
    // 呼びボタンの板：外から見て右（外向き −n に向いて右手）、口の端から 0.2m、高さ 1.0〜1.3
    const out = [-sd.n[0], -sd.n[1]];
    const right = [-out[1], out[0]]; // 扉に向いて（向き d = −out）立った人の右手 = (d[1], −d[0])
    const rs = (right[0] * u[0] + right[1] * u[1]) >= 0 ? sd.s1 + 0.2 : sd.s0 - 0.2;
    const pc = P(rs);
    const q = (s, d) => [pc[0] + u[0] * s + out[0] * d, pc[1] + u[1] * s + out[1] * d];
    prismPoly(m, [q(-0.035, 0), q(0.035, 0), q(0.035, 0.015), q(-0.035, 0.015)], z0 + 1.0, z0 + 1.3, steel, { sideCol: steel });
  }
}

// 畳の目（四角の r の上の面 z に、TATAMI m の升目のうち 1 つおきを色 c で重ねる）。升目は平面の原点から辺の向きにとる
function addTatamiTiles(m, r, z, c) {
  const ex = sub(r[1], r[0]);
  const ey = sub(r[3], r[0]);
  const lx = len(ex) || 1, ly = len(ey) || 1;
  const u = [ex[0] / lx, ex[1] / lx], v = [ey[0] / ly, ey[1] / ly];
  const S = (p) => p[0] * u[0] + p[1] * u[1];
  const Tt = (p) => p[0] * v[0] + p[1] * v[1];
  const s0 = S(r[0]), s1 = s0 + lx, t0 = Tt(r[0]), t1 = t0 + ly;
  const P = (s, t) => [r[0][0] + u[0] * (s - s0) + v[0] * (t - t0), r[0][1] + u[1] * (s - s0) + v[1] * (t - t0)];
  for (let i = Math.floor(s0 / TATAMI); i * TATAMI < s1 - 1e-6; i++) {
    for (let k = Math.floor(t0 / TATAMI); k * TATAMI < t1 - 1e-6; k++) {
      if ((((i + k) % 2) + 2) % 2 === 0) continue;
      const a0 = Math.max(s0, i * TATAMI), a1 = Math.min(s1, (i + 1) * TATAMI);
      const b0 = Math.max(t0, k * TATAMI), b1 = Math.min(t1, (k + 1) * TATAMI);
      if (a1 - a0 < 0.02 || b1 - b0 < 0.02) continue;
      m.quad([[P(a0, b0), z], [P(a1, b0), z], [P(a1, b1), z], [P(a0, b1), z]], [0, 0, 1], c);
    }
  }
}
// 線分 a→b に沿った厚さ t の箱。下と上の高さは端ごと（za0・zb0、za1・zb1）
function segBox(m, a, b, t, za0, zb0, za1, zb1, c, { ends = true, bottom = false } = {}) {
  const d = sub(b, a);
  const L = len(d);
  if (L < 1e-4) return;
  const u = [d[0] / L, d[1] / L];
  const n = [-u[1] * t / 2, u[0] * t / 2];
  const A1 = [a[0] + n[0], a[1] + n[1]], A2 = [a[0] - n[0], a[1] - n[1]];
  const B1 = [b[0] + n[0], b[1] + n[1]], B2 = [b[0] - n[0], b[1] - n[1]];
  const nl = [-u[1], u[0], 0];
  face(m, [[A2, za0], [B2, zb0], [B2, zb1], [A2, za1]], [-nl[0], -nl[1], 0], c);
  face(m, [[B1, zb0], [A1, za0], [A1, za1], [B1, zb1]], nl, c);
  face(m, [[A1, za1], [A2, za1], [B2, zb1], [B1, zb1]], [0, 0, 1], c);
  if (bottom) face(m, [[A1, za0], [B1, zb0], [B2, zb0], [A2, za0]], [0, 0, -1], c);
  if (ends) {
    face(m, [[A1, za0], [A2, za0], [A2, za1], [A1, za1]], [-u[0], -u[1], 0], c);
    face(m, [[B2, zb0], [B1, zb0], [B1, zb1], [B2, zb1]], [u[0], u[1], 0], c);
  }
}
// 細い角材（a・b は [[x, y], z]）
function bar(m, a, b, w, c) {
  const d = [b[0][0] - a[0][0], b[0][1] - a[0][1]];
  const L = len(d);
  if (L < 1e-4) {
    segBox(m, [a[0][0] - w / 2, a[0][1]], [a[0][0] + w / 2, a[0][1]], w, a[1], a[1], b[1], b[1], c);
    return;
  }
  segBox(m, a[0], b[0], w, a[1] - w / 2, b[1] - w / 2, a[1] + w / 2, b[1] + w / 2, c);
}
// 折れ線 pts を、距離の区間（doors）で分ける：[{ a, b, s0, s1, door }]（各区間は 1 本の線分の上）
export function wallPieces(pts, doors = [], wins = []) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + len(sub(pts[i], pts[i - 1])));
  const total = cum[cum.length - 1];
  const cuts = new Set([...cum]);
  for (const [d0, d1] of [...doors, ...wins]) {
    if (d0 > 0 && d0 < total) cuts.add(d0);
    if (d1 > 0 && d1 < total) cuts.add(d1);
  }
  const ss = [...cuts].sort((x, y) => x - y);
  const at = (s) => {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    const L = cum[i] - cum[i - 1] || 1;
    return lerp2(pts[i - 1], pts[i], Math.min(1, Math.max(0, (s - cum[i - 1]) / L)));
  };
  const out = [];
  for (let k = 0; k + 1 < ss.length; k++) {
    const s0 = ss[k], s1 = ss[k + 1];
    if (s1 - s0 < 1e-4) continue;
    const mid = (s0 + s1) / 2;
    const door = doors.some(([d0, d1]) => mid > d0 && mid < d1);
    out.push({ a: at(s0), b: at(s1), s0, s1, door, win: door ? null : wins.find(([d0, d1]) => mid > d0 && mid < d1) || null });
  }
  return out;
}

// 折れ線 pts の始めから長さ s の点
function polyAt(pts, s) {
  let acc = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const L = len(sub(pts[i + 1], pts[i]));
    if (s <= acc + L || i === pts.length - 2) return lerp2(pts[i], pts[i + 1], Math.min(1, Math.max(0, (s - acc) / (L || 1))));
    acc += L;
  }
  return pts[0];
}

// 階の高さの基準（掘る前の地面）
export const floorG0 = (f, groundAt) => {
  const ring = f.coords.map(toXY);
  return groundAt(f.groundRef || toLngLat(centroid(ring)));
};
// 壁の既定の高さ（次の階の床の下の面より少し上まで＝床にもぐる）
const wallTop = (f, w) => (w.h != null ? w.h : w.kind === "mesh" ? 1.1 : w.kind === "rail" ? 0.95 : w.kind === "low" ? 1.1 : w.kind === "psd" ? (w.style === "om" ? 1.5 : 1.35) : w.kind === "bars" ? 1.15 : f.height - f.slab + 0.05 - (w.z0 || 0));
const wallT = (w) => (w.t != null ? w.t : w.kind === "ext" ? 0.25 : w.kind === "glass" || w.kind === "curtain" ? 0.08 : w.kind === "mesh" || w.kind === "rail" ? 0.06 : w.kind === "psd" ? 0.32 : w.kind === "bars" ? 0.06 : w.kind === "tiles" || w.kind === "dark" ? 0.3 : 0.15);
// 壁の下の端・上の端（標高。点 → 標高）：始まりの点で z0・z0 + 高さ（wallTop）、終わりの点で z02・z02 + h2（なければ始まりと同じ）、
// あいだは折れ線に沿った長さで線形。上の端は cutTop まで。any：どこかで上の端が下の端より上
function wallSlope(f, w, pts, zf, cutTop = Infinity) {
  const h0 = wallTop(f, w);
  const b0 = w.z0 || 0;
  if (w.h2 == null && w.z02 == null) {
    const bot = zf + b0;
    const top = Math.min(bot + h0, cutTop);
    return { bot: () => bot, top: () => top, any: top > bot + 0.02 };
  }
  const b1 = w.z02 != null ? w.z02 : b0;
  const h1 = w.h2 != null ? w.h2 : h0;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + len(sub(pts[i], pts[i - 1])));
  const total = cum[cum.length - 1] || 1;
  // 折れ線の上（か近く）の点の、始めからの長さの割合
  const kOf = (p) => {
    let best = 0;
    let bd = Infinity;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const u = sub(pts[i], a);
      const L2 = u[0] * u[0] + u[1] * u[1] || 1;
      const tt = Math.max(0, Math.min(1, ((p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1]) / L2));
      const d = len(sub(p, [a[0] + u[0] * tt, a[1] + u[1] * tt]));
      if (d < bd) {
        bd = d;
        best = (cum[i - 1] + tt * Math.sqrt(L2)) / total;
      }
    }
    return best;
  };
  const bot = (p) => zf + b0 + (b1 - b0) * kOf(p);
  const top = (p) => {
    const k = kOf(p);
    return Math.min(zf + b0 + (b1 - b0) * k + h0 + (h1 - h0) * k, cutTop);
  };
  return { bot, top, any: [pts[0], pts[pts.length - 1]].some((p) => top(p) > bot(p) + 0.02) };
}
// 階段の形：下の端 A（低い）・上の端 B、段数 N・蹴上げ・踏面
export function stairGeom(s, zf) {
  let [A, B] = s.coords.map(toXY);
  let zA = zf + (s.z0 || 0);
  let R = s.rise;
  if (R < 0) {
    [A, B] = [B, A];
    zA += R;
    R = -R;
  }
  const d = sub(B, A);
  const L = len(d) || 1e-3;
  const u = [d[0] / L, d[1] / L];
  const n = [-u[1], u[0]];
  // 蹴上げの数 N（steps か rise ÷ 0.17）。flush なら上の端は蹴上げで終わり（その先は上の階の床）、踏面は N − 1 枚。
  // ふつうは一番上の踏面が上の階の高さで、帯の中に N 枚
  const N = s.steps >= 1 ? Math.round(s.steps) : Math.max(1, Math.round(R / 0.17));
  const nT = s.flush && N >= 2 ? N - 1 : N;
  const riser = R / N;
  const tread = L / nT;
  const hw = s.width / 2;
  // skew：上るにつれて帯が左へずれる（下の端から上の端へ。rise がマイナスで入れかえたときは向きも逆）
  const sk = (s.skew || 0) * (s.rise < 0 ? -1 : 1);
  const P = (sv, lv) => [A[0] + u[0] * sv + n[0] * (lv + sk * sv), A[1] + u[1] * sv + n[1] * (lv + sk * sv)];
  // 点 (x, y) の段の上の面（帯の外は null）
  const topAt = (x, y) => {
    const sv = (x - A[0]) * u[0] + (y - A[1]) * u[1];
    const lv = (x - A[0]) * n[0] + (y - A[1]) * n[1] - sk * sv;
    if (sv < -1e-6 || sv > L + 1e-6 || Math.abs(lv) > hw + 1e-6) return null;
    const k = Math.min(nT - 1, Math.max(0, Math.floor(sv / tread)));
    return zA + (k + 1) * riser;
  };
  return { A, B, zA, R, L, u, n, N, nT, riser, tread, hw, P, topAt, ring: [P(0, -hw), P(L, -hw), P(L, hw), P(0, hw)] };
}

/**
 * 階 f を描く。M は { m（ふつう）, glassy（ガラス。半透明で重ねる）, veil（格子の手すり。半透明） }。
 * ctx：groundAt（掘る前の地面）, tint（選んだものの色）, ceilAt（点 → 屋根の下の天井の標高。屋根のある建物の上の階の壁はそこまで。なければ null）,
 * paintAt（点 → 地面に貼った路面の色。lids の色）, cutTop（切り取った階を上から見るとき、この標高より上は描かない）
 */
// 横向きの円柱：軸 A0 → A1（平面の点）、高さ zc、半径 R。open なら A1 の端は中が暗い穴（筒の内の面）、ちがえば平らなふた
function addCylinder(m, A0, A1, zc, R, c, inner, open) {
  const d = sub(A1, A0);
  const L = len(d);
  if (L < 1e-3 || !(R > 0)) return;
  const u = [d[0] / L, d[1] / L];
  const n = [-u[1], u[0]];
  const SEG = 14;
  const P = (p, ang, r = R) => [[p[0] + n[0] * Math.cos(ang) * r, p[1] + n[1] * Math.cos(ang) * r], zc + Math.sin(ang) * r];
  for (let k = 0; k < SEG; k++) {
    const a0 = (k / SEG) * 2 * Math.PI, a1 = ((k + 1) / SEG) * 2 * Math.PI, am = (a0 + a1) / 2;
    const nn = [n[0] * Math.cos(am), n[1] * Math.cos(am), Math.sin(am)];
    face(m, [P(A0, a0), P(A1, a0), P(A1, a1), P(A0, a1)], nn, c);
    // 端：A0 はふた、A1 は open なら輪と暗い穴、ちがえばふた
    const cA0 = [A0, zc], cA1 = [A1, zc];
    m.quad([cA0, P(A0, a1), P(A0, a0), cA0], [-u[0], -u[1], 0], shade(c, [-u[0], -u[1], 0]));
    if (open) {
      face(m, [P(A1, a0, R * 0.78), P(A1, a0), P(A1, a1), P(A1, a1, R * 0.78)], [u[0], u[1], 0], c);
      const back = [A1[0] - u[0] * L * 0.6, A1[1] - u[1] * L * 0.6];
      m.quad([[back, zc], P(back, a0, R * 0.78), P(back, a1, R * 0.78), [back, zc]], [u[0], u[1], 0], inner);
      face(m, [P(back, a0, R * 0.78), P(A1, a0, R * 0.78), P(A1, a1, R * 0.78), P(back, a1, R * 0.78)], [-nn[0], -nn[1], -nn[2]], inner);
    } else m.quad([cA1, P(A1, a0), P(A1, a1), cA1], [u[0], u[1], 0], shade(c, [u[0], u[1], 0]));
  }
}

// 壁の区間 pc を、屋根の下の天井より上へ出ないように上の端で区切る：{ a, b, ta, tb } の並び（区間の中で上の端はまっすぐ）。
// 上の端がまっすぐ続くあいだ（あいだの点が直線から CEIL_RUN_TOL 以内）は 1 つ（斜めの壁・なめらかな天井でも細かく区切らない＝
// ガラスの縦の枠が区切りごとに並ばない）。跳び（となりの点と CEIL_JUMP 以上ちがう）は二分してその位置で区切る。
// zTop・z0 は数か、点 → 標高の関数（斜めの壁）
const CEIL_RUN_TOL = 0.02;
const CEIL_JUMP = 0.2;
function ceilRuns(pc, zTop, z0, ceilAt) {
  const L = len(sub(pc.b, pc.a));
  const topOf = typeof zTop === "function" ? zTop : () => zTop;
  const botOf = typeof z0 === "function" ? z0 : () => z0;
  const val = (t) => {
    const q = lerp2(pc.a, pc.b, t);
    const c = ceilAt(q);
    const zt = topOf(q);
    return Math.max(botOf(q) + 0.3, Math.min(zt, Number.isFinite(c) ? c : zt));
  };
  if (L < 1e-3) return [{ ...pc, ta: val(0), tb: val(0) }];
  const n = Math.max(1, Math.ceil(L / 0.25));
  const eps = Math.min(0.25, 0.002 / L);
  // 0.25m ごとの点（両端は少し内）
  const T = [];
  const V = [];
  for (let k = 0; k <= n; k++) {
    T.push(k / n);
    V.push(val(k === 0 ? eps : k === n ? 1 - eps : k / n));
  }
  const out = [];
  let tS = 0;
  let vS = V[0];
  let i0 = 0;
  const close = (tE, vE) => {
    if (tE - tS > 1e-4) out.push({ ...pc, a: lerp2(pc.a, pc.b, tS), b: lerp2(pc.a, pc.b, tE), ta: vS, tb: vE });
  };
  for (let k = 1; k <= n; k++) {
    if (Math.abs(V[k] - V[k - 1]) > CEIL_JUMP) {
      // 跳び：前の点の高さが続くところと次の高さのあいだを二分
      let lo = T[k - 1] + eps;
      let hi = T[k] - eps;
      for (let it = 0; it < 14; it++) {
        const md = (lo + hi) / 2;
        if (Math.abs(val(md) - V[k - 1]) <= CEIL_RUN_TOL + Math.abs(V[k - 1] - (k >= 2 ? V[k - 2] : V[k - 1]))) lo = md;
        else hi = md;
      }
      close(lo, val(lo));
      tS = hi;
      vS = val(Math.min(1, hi + eps));
      i0 = k;
      continue;
    }
    // あいだの点が直線（区間の始まり → この点）から離れたら、ひとつ前の点で区切る
    for (let j = i0 + 1; j < k; j++) {
      const z = vS + ((V[k] - vS) * (T[j] - tS)) / (T[k] - tS || 1);
      if (Math.abs(V[j] - z) > CEIL_RUN_TOL) {
        close(T[k - 1], V[k - 1]);
        tS = T[k - 1];
        vS = V[k - 1];
        i0 = k - 1;
        break;
      }
    }
  }
  close(1, V[n]);
  return out;
}

// 板を重ねた壁（受付のカウンターなど）。r は上の外のふち（閉じた形）。厚さ SLAT_T の板を SLAT_PITCH ごとに重ね（あいだは奥まった暗い
// 板）、下の板ほど形の内へ入る（いちばん下で lean m。上ほど外へ張り出す。壁の外の面も中の面も斜め）。壁の厚さ w、いちばん上は天板。
// gaps（r の 1 点目からふちに沿った距離 [s0, s1]）は壁がない（入口）、plain の区間は板を重ねない平らな壁
const SLAT_T = 0.032;
const SLAT_PITCH = 0.064;
const SLAT_TOP = 0.045;
function addSlats(m, it, r0, z0, z1, T) {
  const ccw = ringArea(r0) > 0;
  const ring = ccw ? r0 : r0.slice().reverse();
  const P = ring.length;
  const Ls = ring.map((p, i) => len(sub(ring[(i + 1) % P], p)));
  const per = Ls.reduce((a, b) => a + b, 0);
  // 点の向きを逆にしたら、距離も逆から
  const conv = (rs) => (rs || []).map(([s0, s1]) => (ccw ? [s0, s1] : [per - s1, per - s0]));
  const gaps = conv(it.gaps);
  const plain = conv(it.plain);
  const w = it.w ?? 0.45;
  const lean = it.lean ?? 0;
  const S0 = [];
  let acc = 0;
  for (const L of Ls) {
    S0.push(acc);
    acc += L;
  }
  // 辺 i の区間（0〜1）：gaps は除き、plain は印をつける
  const spans = ring.map((_, i) => {
    const cuts = new Set([0, 1]);
    for (const [g0, g1] of [...gaps, ...plain]) {
      for (const g of [g0, g1]) {
        const t = (g - S0[i]) / (Ls[i] || 1);
        if (t > 1e-4 && t < 1 - 1e-4) cuts.add(t);
      }
    }
    const ts = [...cuts].sort((a, b) => a - b);
    const out = [];
    for (let k = 0; k + 1 < ts.length; k++) {
      const sm = S0[i] + ((ts[k] + ts[k + 1]) / 2) * Ls[i];
      if (gaps.some(([g0, g1]) => sm > g0 && sm < g1)) continue;
      out.push({ t0: ts[k], t1: ts[k + 1], plain: plain.some(([g0, g1]) => sm > g0 && sm < g1) });
    }
    return out;
  });
  // 外のふちから d0〜d1 内の帯の、辺 i の区間の四角
  const band = (d0, d1) => ({ O: offsetRingBy(ring, ring.map(() => -d0)), I: offsetRingBy(ring, ring.map(() => -d1)) });
  const quad = ({ O, I }, i, t0, t1) => {
    const j = (i + 1) % P;
    return [lerp2(O[i], O[j], t0), lerp2(O[i], O[j], t1), lerp2(I[i], I[j], t1), lerp2(I[i], I[j], t0)];
  };
  const light = T("birch");
  const dark = T("slatGap");
  const hTot = z1 - SLAT_TOP - z0;
  if (hTot <= 0.05) return;
  const N = Math.max(3, Math.round(hTot / SLAT_PITCH));
  const pitch = hTot / N;
  for (let k = 0; k < N; k++) {
    const d = lean * (1 - (k + 1) / N);
    const zA = z0 + k * pitch;
    const bS = band(d, d + w);
    const bD = band(d + 0.025, d + w - 0.025);
    ring.forEach((_, i) => {
      for (const sp of spans[i]) {
        if (sp.plain) continue;
        prismPoly(m, quad(bS, i, sp.t0, sp.t1), zA + pitch - SLAT_T, zA + pitch, light, { bottom: true });
        prismPoly(m, quad(bD, i, sp.t0, sp.t1), zA, zA + pitch - SLAT_T, dark, { top: false });
      }
    });
  }
  const b0 = band(0, w);
  ring.forEach((_, i) => {
    for (const sp of spans[i]) {
      if (sp.plain) prismPoly(m, quad(b0, i, sp.t0, sp.t1), z0, z1 - SLAT_TOP, light);
      prismPoly(m, quad(b0, i, sp.t0, sp.t1), z1 - SLAT_TOP, z1, light, { bottom: true });
    }
  });
}

export function addFloor(M, f, ctx) {
  const { m, glassy, veil } = M;
  const cull = M.cull || m; // 外の壁（ext）は中から見える面だけ（外からは殻が見える）
  const g0 = floorG0(f, ctx.groundAt);
  if (!Number.isFinite(g0)) return;
  const tint = ctx.tint || ((c) => c);
  const T = (k) => tint(COL[k]);
  const zf = g0 + f.z;
  const cutTop = ctx.cutTop ?? Infinity;
  const ceilAt = ctx.ceilAt || null;
  const ring = f.coords.map(toXY);
  const holes = (f.holes || []).map((h) => h.coords.map(toXY));
  // 床：上の面（仕上げの色）・下の面（下の階の天井）・ふちの面
  const top = T(FINISH_COL[f.finish] || "oak");
  m.polygon([ring, ...holes], zf, [0, 0, 1], shade(top, [0, 0, 1]));
  m.polygon([ring, ...holes], zf - f.slab, [0, 0, -1], shade(T(f.under ? FINISH_COL[f.under] : "ceiling"), [0, 0, -1]));
  // ふちの面は床が本当にある所のふちだけ（外形から穴を差し引いた形のふち）。穴が外形の辺に接するところに両側から縁を描くと、床のない所に
  // 床の板の帯が立つ（附属図書館 地下 1 階の東の吹き抜けのガラスの前を横切る帯。2026-11-14、ユーザーの写真 S__47464487）
  const solid = holes.length ? clipOp("difference", [closeR(ring)], ...holes.map((h) => [closeR(h)])) : null;
  const edgeRings = solid ? solid.flatMap((pg) => pg.map((r, k) => ({ r: openR(r), outer: k === 0 }))) : [ring, ...holes].map((r, k) => ({ r, outer: k === 0 }));
  // 浮いた建物の階（ctx.edgeBot：点 → 標高）：外まわりの床の縁は下の階の天井（いちばん下の階は船底）まで下ろす。天井と床のあいだの空洞
  // （天井ふところ）がガラス越しに見えた（附属図書館の学習棟。2026-11-14 ユーザーの目印「二階の天井と三階の床の隙間が空いている空洞に、うめて」）
  const edgeBot = ctx.edgeBot || null;
  for (const { r, outer } of edgeRings) {
    const out = (ringArea(r) > 0 ? 1 : -1) * (outer ? 1 : -1);
    r.forEach((a, i) => {
      const b = r[(i + 1) % r.length];
      const L = len(sub(b, a));
      if (L < 1e-6) return;
      const n = [((b[1] - a[1]) / L) * out, (-(b[0] - a[0]) / L) * out, 0];
      if (edgeBot && outer && onRingEdge(lerp2(a, b, 0.5), ring)) {
        const k = Math.max(1, Math.ceil(L));
        for (let j = 0; j < k; j++) {
          const p = lerp2(a, b, j / k), q = lerp2(a, b, (j + 1) / k);
          face(m, [[p, Math.min(zf - f.slab, edgeBot(p))], [q, Math.min(zf - f.slab, edgeBot(q))], [q, zf], [p, zf]], n, T("slabEdge"));
        }
        return;
      }
      face(m, [[a, zf - f.slab], [b, zf - f.slab], [b, zf], [a, zf]], n, T("slabEdge"));
    });
  }
  // 市松のタイル（checker）：grid の向き・大きさの升目の 1 つおきに濃い色（形の中に入りきる升目だけ）
  if (f.finish === "checker") addChecker(m, ring, holes, zf + 0.004, f.grid || [0, 0.6], T("checkerB"));
  // 1 階の床のタイル（tile2：ベージュの 2 つの近い色の市松＝目地の見えるタイル。2026-11-12）
  if (f.finish === "tile2") addChecker(m, ring, holes, zf + 0.004, f.grid || [0, 0.3], T("tile2B"));
  // 杉綾のれんが（herring。附属図書館の 1 階のロビー。2026-11-13）
  if (f.finish === "herring") addHerring(m, ring, holes, zf + 0.004, f.grid, T);
  // 部屋の床の色（herring の部屋は目地の色の上にれんが。向きは部屋の grid、なければ階の grid）
  for (const r of f.rooms || []) {
    if (!r.finish || r.finish === f.finish) continue;
    const rr = r.coords.map(toXY);
    m.polygon([rr], zf + 0.012, [0, 0, 1], shade(T(FINISH_COL[r.finish]), [0, 0, 1]));
    if (r.finish === "herring") addHerring(m, rr, r.over ? [] : holes, zf + 0.016, r.grid || f.grid, T);
  }
  // 平地の中の見えるガラスの面（ctx.glazed：[p, q]。明かり取りのガラスなど）と同じ線のガラスの壁は描かない（ガラスと桟が二重になる）
  const glazed = ctx.glazed || [];
  const offGlazed = (pc) => {
    const L = len(sub(pc.b, pc.a));
    if (!glazed.length || L < 1e-6) return [pc];
    const u = [(pc.b[0] - pc.a[0]) / L, (pc.b[1] - pc.a[1]) / L];
    const cov = [];
    for (const [p, q] of glazed) {
      const d = (x) => Math.abs((x[0] - pc.a[0]) * u[1] - (x[1] - pc.a[1]) * u[0]);
      if (d(p) > GLAZED_TOL || d(q) > GLAZED_TOL) continue;
      const s0 = (p[0] - pc.a[0]) * u[0] + (p[1] - pc.a[1]) * u[1];
      const s1 = (q[0] - pc.a[0]) * u[0] + (q[1] - pc.a[1]) * u[1];
      const lo = Math.max(0, Math.min(s0, s1) - 0.05), hi = Math.min(L, Math.max(s0, s1) + 0.05);
      if (hi > lo) cov.push([lo, hi]);
    }
    if (!cov.length) return [pc];
    cov.sort((x, y) => x[0] - y[0]);
    const out = [];
    let s = 0;
    for (const [lo, hi] of cov) {
      if (lo > s + 0.05) out.push([s, lo]);
      s = Math.max(s, hi);
    }
    if (L > s + 0.05) out.push([s, L]);
    return out.map(([s0, s1]) => ({ ...pc, a: lerp2(pc.a, pc.b, s0 / L), b: lerp2(pc.a, pc.b, s1 / L) }));
  };
  // 壁・ガラス・手すり。斜めの壁（h2・z02：折れ線の終わりの点の高さ・下の端。始まりは h・z0、あいだは折れ線に沿った長さで線形）は、
  // 区間ごとに両端の下の端（ba・bb）と上の端（ta・tb）で
  for (const w of f.walls || []) {
    const pts = w.coords.map(toXY);
    const t = wallT(w);
    const S = wallSlope(f, w, pts, zf, cutTop);
    if (!S.any) continue;
    // 自動ドア（w.auto）：扉の口ごとに、campus3dDoors の自動ドアのレイヤーが板を描く（ctx.doors に足す）。口の上の板の側に、戸を動かす箱
    if (w.auto && ctx.doors) {
      for (const pc of wallPieces(pts, w.doors || [])) {
        if (!pc.door) continue;
        const L = len(sub(pc.b, pc.a));
        if (L < 0.4) continue;
        const u = [(pc.b[0] - pc.a[0]) / L, (pc.b[1] - pc.a[1]) / L];
        const nl = [-u[1], u[0]];
        const z0 = S.bot(lerp2(pc.a, pc.b, 0.5));
        const kind = L >= 1.5 ? "bi" : "single";
        ctx.doors.push({ a: pc.a, b: pc.b, z0, z1: z0 + DOOR_H, n: nl, off: 0.08, kind });
        const ext = kind === "bi" ? L / 2 : L;
        const A = [pc.a[0] - u[0] * ext + nl[0] * 0.08, pc.a[1] - u[1] * ext + nl[1] * 0.08];
        const B = [pc.b[0] + u[0] * (kind === "bi" ? ext : 0) + nl[0] * 0.08, pc.b[1] + u[1] * (kind === "bi" ? ext : 0) + nl[1] * 0.08];
        segBox(m, A, B, 0.14, z0 + DOOR_H, z0 + DOOR_H, z0 + DOOR_H + 0.18, z0 + DOOR_H + 0.18, T("mullion"), { bottom: true });
      }
    }
    // 屋根の下の天井より上へは出さない（天井の高さが変わるところで区切る）
    const cutByCeil = ceilAt && (w.kind === "wall" || w.kind === "ext" || w.kind === "glass" || w.kind === "curtain" || w.kind === "conc" || w.kind === "wbrick");
    const runs = (pc) => (cutByCeil ? ceilRuns(pc, S.top, S.bot, ceilAt) : [{ ...pc, ta: S.top(pc.a), tb: S.top(pc.b) }]);
    const glassy0 = w.kind === "glass" || w.kind === "curtain";
    // ホームドアの戸の口：口ごとに 1 組の戸（折れ線の点をまたいでも 1 つ）。線路 track があれば電車に合わせて開く（ctx.psd に足して
    // campus3dPsd が描く）、なければ閉じた戸
    if (w.kind === "psd") {
      for (const [d0, d1] of w.doors || []) {
        const A = polyAt(pts, d0), B = polyAt(pts, d1);
        const L = len(sub(B, A)) || 1;
        const d = { a: A, b: B, z0: S.bot(A), z1: Math.min(S.top(A), S.top(B)) - 0.05, n: [-(B[1] - A[1]) / L, (B[0] - A[0]) / L], style: w.style, track: w.track || null };
        if (ctx.psd && w.track) ctx.psd.push(d);
        else psdLeaves(m, glassy, d, 0, T);
      }
    }
    for (const pc of wallPieces(pts, w.doors || [], w.wins || []).flatMap((pc) => (glassy0 ? offGlazed(pc) : [pc])).flatMap(runs)) {
      const { ta, tb } = pc;
      const ba = S.bot(pc.a), bb = S.bot(pc.b);
      if (!(ta > ba + 0.02 || tb > bb + 0.02)) continue;
      if (w.kind === "ext") {
        // 外の壁：床の形の中を向く 1 枚の面（殻の内側。外からは裏になって見えない）。窓のところは腰と上だけ、ガラスは中側に
        const L = len(sub(pc.b, pc.a)) || 1;
        const nl = [-(pc.b[1] - pc.a[1]) / L, (pc.b[0] - pc.a[0]) / L];
        const mid = lerp2(pc.a, pc.b, 0.5);
        const sg = pointInRing(mid[0] + nl[0] * 0.3, mid[1] + nl[1] * 0.3, ring) ? 1 : -1;
        const off = (t / 2) * sg;
        const A = [pc.a[0] + nl[0] * off, pc.a[1] + nl[1] * off], B = [pc.b[0] + nl[0] * off, pc.b[1] + nl[1] * off];
        const nIn = [nl[0] * sg, nl[1] * sg, 0];
        const c = T("wall");
        // 面の向きが中を向くように点の順をそろえる（quad は渡した向き n で描く）
        const quadIn = (za0, zb0, za1, zb1) => cull.quad([[A, za0], [B, zb0], [B, zb1], [A, za1]], nIn, shade(c, nIn));
        if (pc.door) {
          if (Math.min(ta - ba, tb - bb) > DOOR_H + 0.1) quadIn(ba + DOOR_H, bb + DOOR_H, ta, tb);
        } else if (pc.win) {
          const [, , wz0, wz1] = pc.win;
          const loA = Math.min(ba + wz0, ta), loB = Math.min(bb + wz0, tb), hiA = Math.min(ba + wz1, ta), hiB = Math.min(bb + wz1, tb);
          if (Math.max(loA - ba, loB - bb) > 0.02) quadIn(ba, bb, loA, loB);
          if (Math.min(ta - hiA, tb - hiB) > 0.02) quadIn(hiA, hiB, ta, tb);
          if (Math.min(hiA - loA, hiB - loB) > 0.05) glassy.quad([[A, loA], [B, loB], [B, hiB], [A, hiA]], nIn, tint(GLASS));
        } else quadIn(ba, bb, ta, tb);
      } else if (w.kind === "wall" || w.kind === "low") {
        const c = T("wall");
        if (pc.win) {
          // 窓：下の腰の壁・ガラス・上の壁（まぐさ）と枠
          const [, , wz0, wz1] = pc.win;
          const loA = Math.min(ba + wz0, ta), loB = Math.min(bb + wz0, tb), hiA = Math.min(ba + wz1, ta), hiB = Math.min(bb + wz1, tb);
          if (Math.max(loA - ba, loB - bb) > 0.02) segBox(m, pc.a, pc.b, t, ba, bb, loA, loB, c, { ends: false });
          if (Math.min(ta - hiA, tb - hiB) > 0.02) segBox(m, pc.a, pc.b, t, hiA, hiB, ta, tb, c, { ends: false, bottom: true });
          if (Math.min(hiA - loA, hiB - loB) > 0.05) {
            const L = len(sub(pc.b, pc.a)) || 1;
            glassy.quad([[pc.a, loA], [pc.b, loB], [pc.b, hiB], [pc.a, hiA]], [-(pc.b[1] - pc.a[1]) / L, (pc.b[0] - pc.a[0]) / L, 0], tint(GLASS));
            const fc = T("mullion");
            bar(m, [pc.a, loA], [pc.a, hiA], 0.06, fc);
            bar(m, [pc.b, loB], [pc.b, hiB], 0.06, fc);
            bar(m, [pc.a, loA], [pc.b, loB], 0.06, fc);
            bar(m, [pc.a, hiA], [pc.b, hiB], 0.06, fc);
          }
        } else if (!pc.door) segBox(m, pc.a, pc.b, t, ba, bb, ta, tb, c);
        else if (w.kind !== "low" && Math.min(ta - ba, tb - bb) > DOOR_H + 0.1) segBox(m, pc.a, pc.b, t, ba + DOOR_H, bb + DOOR_H, ta, tb, c, { bottom: true });
      } else if (w.kind === "glass" || w.kind === "curtain") {
        const frameC = T(w.kind === "curtain" ? "mullionDark" : "mullion");
        const fw = w.kind === "curtain" ? 0.07 : 0.05;
        const pitch = w.kind === "curtain" ? 1.25 : 1.5;
        const L = len(sub(pc.b, pc.a));
        const gA = pc.door ? ba + DOOR_H + 0.05 : ba + 0.02, gB = pc.door ? bb + DOOR_H + 0.05 : bb + 0.02;
        if (Math.min(ta - gA, tb - gB) > 0.05) {
          glassy.quad([[pc.a, gA], [pc.b, gB], [pc.b, tb], [pc.a, ta]], [-(pc.b[1] - pc.a[1]) / (L || 1), (pc.b[0] - pc.a[0]) / (L || 1), 0], tint(GLASS));
        }
        // すりガラスの帯（w.band：[下, 上]＝壁の下の端から m）：小さな菱形を互い違いの列に、ガラスの両面に（附属図書館 3 階のグループ研究室。
        // 2026-11-13、動画 IMG_1077 の 794〜800 秒：膝から胸の高さの菱形の模様）
        if (w.kind === "glass" && w.band && !pc.door && L > 0.2) addFrostBand(glassy, pc, L, ba, bb, ta, tb, w.band, tint(hex(PAL.frost, 0.5)));
        // 縦の枠（区間の両端と、間隔ごと）・下と上の枠・扉の上の横の枠。1 枚のガラス（pane）は途中の縦の枠・横の枠なしで、縦の枠は
        // 壁の折れ線の両端だけ（天井で区切った区間の境には枠を描かない）
        const n = w.pane ? 1 : Math.max(1, Math.round(L / pitch));
        const atEnd = (q) => len(sub(q, pts[0])) < 1e-6 || len(sub(q, pts[pts.length - 1])) < 1e-6;
        for (let k = 0; k <= n; k++) {
          const p = lerp2(pc.a, pc.b, k / n);
          const tp = ta + ((tb - ta) * k) / n;
          const bp = ba + ((bb - ba) * k) / n;
          if (pc.door && k > 0 && k < n) continue;
          if (w.pane && !pc.door && !atEnd(p)) continue;
          bar(m, [p, bp], [p, tp], pc.door && (k === 0 || k === n) ? fw * 1.4 : fw, frameC);
        }
        if (!pc.door) bar(m, [pc.a, ba + 0.03], [pc.b, bb + 0.03], fw, frameC);
        bar(m, [pc.a, ta - 0.02], [pc.b, tb - 0.02], fw, frameC);
        if (pc.door || (w.kind === "curtain" && !w.pane)) {
          const dz = DOOR_H + (pc.door ? 0.02 : 0.6);
          if (Math.min(ta - ba, tb - bb) > dz + 0.1) bar(m, [pc.a, ba + dz], [pc.b, bb + dz], fw, frameC);
        }
      } else if (w.kind === "mesh" || w.kind === "rail") {
        if (pc.door) continue;
        const railC = T("rail");
        const L = len(sub(pc.b, pc.a));
        if (w.kind === "mesh") veil.quad([[pc.a, ba + 0.03], [pc.b, bb + 0.03], [pc.b, tb - 0.04], [pc.a, ta - 0.04]], [-(pc.b[1] - pc.a[1]) / (L || 1), (pc.b[0] - pc.a[0]) / (L || 1), 0], tint(MESH));
        bar(m, [pc.a, ta], [pc.b, tb], 0.05, T(w.kind === "mesh" ? "mesh" : "rail"));
        if (w.kind === "rail") bar(m, [pc.a, ba + (ta - ba) * 0.5], [pc.b, bb + (tb - bb) * 0.5], 0.03, railC);
        else bar(m, [pc.a, ba + 0.03], [pc.b, bb + 0.03], 0.04, T("mesh"));
        const n = Math.max(1, Math.round(L / 1.5));
        for (let k = 0; k <= n; k++) {
          const p = lerp2(pc.a, pc.b, k / n);
          bar(m, [p, ba + ((bb - ba) * k) / n], [p, ta + ((tb - ta) * k) / n], 0.04, w.kind === "mesh" ? T("mesh") : railC);
        }
      } else if (w.kind === "psd") {
        // ホームドア：固定の箱（戸の口は下で、口ごとに 1 組の戸）
        if (!pc.door) addPsdUnit(m, glassy, pc.a, pc.b, t, ba, Math.min(ta, tb), w.style, T);
      } else if (w.kind === "bars") {
        if (pc.door) continue;
        addBars(m, pc.a, pc.b, ba, bb, ta, tb, T("barSteel"));
      } else if (w.kind === "tiles" || w.kind === "dark") {
        if (pc.door) {
          if (Math.min(ta - ba, tb - bb) > DOOR_H + 0.1) segBox(m, pc.a, pc.b, t, ba + DOOR_H, bb + DOOR_H, ta, tb, T(w.kind === "dark" ? "darkWall" : "tileBase"), { bottom: true });
          continue;
        }
        segBox(m, pc.a, pc.b, t, ba, bb, ta, tb, T(w.kind === "dark" ? "darkWall" : "tileBase"));
        if (w.kind === "tiles") addTilePanels(m, pc, t, ba, bb, ta, tb, T);
      } else if (w.kind === "conc" || w.kind === "wbrick") {
        // 2026-11-13（附属図書館の地下）：打ち放しのコンクリート（P コンの穴 0.9×0.6m おき）・白いれんが（目地 0.24×0.075m）。扉の口は口の上だけ
        const za = pc.door ? ba + DOOR_H : ba, zb = pc.door ? bb + DOOR_H : bb;
        if (!(ta > za + 0.02 || tb > zb + 0.02)) continue;
        segBox(m, pc.a, pc.b, t, za, zb, ta, tb, T(w.kind === "conc" ? "concWall" : "wbrick"), { bottom: !!pc.door });
        if (w.kind === "wbrick") addSmallTiles(m, pc, t, za, zb, ta, tb, T, { tw: 0.24, th: 0.075, tile: "wbrick", grout: "wbrickJoint" });
        else addTieHoles(m, pc, t, za, zb, ta, tb, T("concHole"));
      } else if (w.kind === "mtile" || w.kind === "wains" || w.kind === "wtile" || w.kind === "maroon" || w.kind === "slat") {
        // 2026-11-12（大岡山駅）：小さなタイルの壁・腰のタイル・白いタイル・えんじ色の板・木の格子。扉の口は口の上だけ
        const za = pc.door ? ba + DOOR_H : ba, zb = pc.door ? bb + DOOR_H : bb;
        if (!(ta > za + 0.02 || tb > zb + 0.02)) continue;
        if (w.kind === "slat") {
          addSlatWall(m, pc, t, za, zb, ta, tb, T);
          continue;
        }
        const base = { mtile: "mtile", wtile: "wtile", maroon: "maroon", wains: "wainsTop" }[w.kind];
        segBox(m, pc.a, pc.b, t, za, zb, ta, tb, T(base), { bottom: !!pc.door });
        if (w.kind === "mtile") addSmallTiles(m, pc, t, za, zb, ta, tb, T, { band: [0.45, 2.7] });
        else if (w.kind === "wtile") addSmallTiles(m, pc, t, za, zb, ta, tb, T, { tw: 0.2, th: 0.2, tile: "wtile", grout: "wtileGrout" });
        else if (w.kind === "wains" && !pc.door) {
          const th = w.th ?? 1.3;
          const ka = Math.min(ta, ba + th), kb = Math.min(tb, bb + th);
          addSmallTiles(m, pc, t, ba, bb, ka, kb, T, { tw: 0.1, th: 0.1, tile: "wainsTile", grout: "wainsGrout" });
          // 腰の上の見切り（細い帯）
          segBox(m, pc.a, pc.b, t + 0.03, ka - 0.01, kb - 0.01, ka + 0.025, kb + 0.025, T("wainsTrim"), { ends: false, bottom: true });
        }
      }
    }
  }
  // 家具など
  const ctxG = { ...ctx, glassy }; // 小物の半透明の板（ゲートのガラス）
  for (const it of f.items || []) {
    const r = it.coords.map(toXY);
    const z0 = zf + it.z0;
    // 屋根の下の天井より上へは出さない（柱は天井まで）
    const z1 = Math.min(zf + it.z1, cutTop, ceilAt ? ceilAt(centroid(r)) : Infinity);
    if (!(z1 > z0 + 0.005)) continue;
    // 切り取った階を上から見るときは、天井の近くの物（照明・ダクト・上の床の板）は描かない（下の部屋が見えるように）
    if (Number.isFinite(cutTop) && z0 > cutTop - 0.9) continue;
    const c = T(ITEM_COL[it.kind] || "whiteItem");
    if (it.kind === "table" && z1 - z0 > 0.2) {
      // 天板の色は color があればそれ（白い丸テーブルなど。2026-11-12）
      prismPoly(m, r, z1 - 0.035, z1, it.color ? tint(COL_HEX(it.color)) : c, { bottom: true });
      // 脚：角ごと（4 点の形なら角から 0.06m 内）、ほかはまん中に 1 本
      const legC = T("grey");
      if (r.length === 4) {
        const ce = centroid(r);
        for (const p of r) {
          const q = lerp2(p, ce, Math.min(0.45, 0.08 / (len(sub(ce, p)) || 1)));
          bar(m, [q, z0], [q, z1 - 0.035], 0.035, legC);
        }
      } else {
        const ce = centroid(r);
        bar(m, [ce, z0], [ce, z1 - 0.035], 0.06, legC);
      }
    } else if (it.kind === "layered") {
      // 板を重ねたカウンター：厚さ 0.035 の板を 0.02 のすき間で、板ごとに少し内へ（溝が見える）
      const n = Math.max(2, Math.round((z1 - z0) / 0.055));
      const h = (z1 - z0) / n;
      const ce = centroid(r);
      for (let k = 0; k < n; k++) {
        const inset = k % 2 ? 0.012 : 0;
        const rr = inset ? r.map((p) => lerp2(p, ce, inset / (len(sub(ce, p)) || 1))) : r;
        prismPoly(m, rr, z0 + k * h, z0 + (k + 1) * h - (k === n - 1 ? 0 : 0.012), c, { sideCol: k % 2 ? T("woodDark") : c });
      }
    } else if (it.kind === "slats") {
      addSlats(m, it, r, z0, z1, T);
    } else if (it.kind === "platform") {
      // 踊り場の台。color があればその色（図書館の階段の暗い灰の踊り場。2026-11-13）。color2 は側と下の面の色。z0 が床より上なら宙に浮いた
      // 薄い踊り場で、下の面も描く（学習棟の白い折れ板の階段の踊り場：床から立ち上がる箱だった。2026-11-14 ユーザーの目印「なにこれ。てぬき？」）
      const pc = it.color ? tint(COL_HEX(it.color)) : T("platform");
      const sc = it.color2 ? tint(COL_HEX(it.color2)) : it.color ? pc : T("platformSide");
      prismPoly(m, r, z0, z1, pc, { sideCol: sc });
      // 下の面は階段の裏と同じ色（前後の階段の裏の面と続いて見える。ユーザー「つながりが適当じゃない？」）
      if (it.z0 > 0.01) m.polygon([r], z0, [0, 0, -1], shade(T("ceiling"), [0, 0, -1]));
      // 手すり（rails：辺ごと）：階段の手すりと同じ作り。辺の端が階段の下の端・上の端に接していれば、その階段の手すりの高さにそろえる
      if (it.rails) {
        const baseAt = (p) => {
          for (const st of f.stairs || []) {
            const G = stairGeom(st, zf);
            const a = (p[0] - G.A[0]) * G.u[0] + (p[1] - G.A[1]) * G.u[1], l = (p[0] - G.A[0]) * G.n[0] + (p[1] - G.A[1]) * G.n[1];
            if (Math.abs(l) > G.hw + 0.06) continue;
            if (Math.abs(a) < 0.06) return G.zA + G.riser;
            if (Math.abs(a - G.L) < 0.06) return G.zA + G.R + G.riser * 0.5;
          }
          return z1 + 0.13;
        };
        it.rails.forEach((k, i) => {
          if (!k) return;
          const a = r[i], b = r[(i + 1) % r.length];
          const L = len(sub(b, a));
          if (L < 0.05) return;
          const za = baseAt(a), zb = baseAt(b);
          const rc = T(k === "mesh" ? "mesh" : "rail");
          const ctr = centroid(r);
          const nn0 = [(b[1] - a[1]) / L, -(b[0] - a[0]) / L];
          const sgn = (ctr[0] - a[0]) * nn0[0] + (ctr[1] - a[1]) * nn0[1] > 0 ? -1 : 1; // 外向き
          const nn = [nn0[0] * sgn, nn0[1] * sgn, 0];
          if (k === "mesh") veil.quad([[a, za - 0.1], [b, zb - 0.1], [b, zb + 0.95], [a, za + 0.95]], nn, tint(MESH));
          if (k === "glass") glassy.quad([[a, za - 0.1], [b, zb - 0.1], [b, zb + 0.95], [a, za + 0.95]], nn, tint(GLASS));
          bar(m, [a, za + 1.0], [b, zb + 1.0], 0.05, rc);
          if (k !== "rail") bar(m, [a, za - 0.08], [b, zb - 0.08], 0.05, rc);
          const np = Math.max(1, Math.round(L / 1.6));
          for (let j = 0; j <= np; j++) {
            const p = lerp2(a, b, j / np);
            const z = za + ((zb - za) * j) / np;
            bar(m, [p, z - 0.1], [p, z + 1.0], 0.04, rc);
          }
        });
      }
    } else if (it.kind === "wedge" && Array.isArray(it.zs) && it.zs.length === r.length) {
      addWedge(m, it, r, zf, T, tint);
    } else if (it.kind === "tatami") {
      // 畳の小上がり：灰色の石の台に、半畳の琉球畳を目ごとに 2 つの色で（目は平面の原点からの升目＝となりの小上がりと目がそろう）
      prismPoly(m, r, z0, z1, T("tatamiA"), { sideCol: T("tatamiSide") });
      if (r.length === 4) addTatamiTiles(m, r, z1 + 0.003, T("tatamiB"));
    } else if (it.kind === "tentsofa" && r.length === 4) {
      addTentSofa(m, r, z0, z1, T);
    } else if (SEAT_ITEMS.has(it.kind) && r.length === 4) {
      addSeatItem(m, it, r, z0, z1, T, tint);
    } else if (KITCHEN_ITEMS.has(it.kind) && r.length === 4) {
      addKitchenItem(m, it, r, z0, z1, T, tint);
    } else if (it.kind === "piano" && r.length === 4) {
      addPiano(m, r, z0, z1, T);
    } else if (it.kind === "lift" && r.length === 4) {
      addLiftShaft(m, r, z0, z1, c, T("steel"));
    } else if (it.kind === "liftdoor") {
      // エレベーターの扉（ステンレスの板）：前の面も縦の面なので、縦の面ぜんぶ板の色（合わせ目はデータの暗い細い板）
      prismPoly(m, r, z0, z1, c, { sideCol: c });
    } else if (it.kind === "column" && r.length >= 3) {
      addColumn(m, r, z0, z1, T);
    } else if (it.kind === "bench" && r.length === 4) {
      addStationBench(m, r, z0, z1, T, it.color ? tint(COL_HEX(it.color)) : null);
    } else if (it.kind === "board" && r.length === 4) {
      addBoard(m, r, z0, z1, T);
    } else if (r.length === 4 && addSmallItem(m, it, r, z0, z1, T, tint, ctxG)) {
      // 2026-11-13（Taki Plaza 2 階の小物）：本棚・白い棚・計算式の時計・板を重ねた切り抜き・木の板の表示・貼り紙・星の飾り
    } else if (STATION_ITEMS.has(it.kind) && addStationItem(m, it, r, zf, z0, z1, T, tint)) {
      // 2026-11-12（大岡山駅の階段の上・1 階）：段々の天井・鉄の扉・改札機・丸い柱・ロッカー・機械・床の矢印・額の広告・照明・点検口・消火栓・棚
    } else if ((it.kind === "tube" || it.kind === "disc") && r.length >= 4) {
      // 軸：1 点目 → 2 点目の向き（形の両はしのまん中どうし）。直径は z1 − z0
      const A0 = lerp2(r[0], r[3], 0.5), A1 = lerp2(r[1], r[2], 0.5);
      addCylinder(m, A0, A1, (zf + it.z0 + zf + it.z1) / 2, (it.z1 - it.z0) / 2, it.kind === "tube" ? T("beam") : c, it.kind === "tube" ? T("tubeIn") : c, it.kind === "tube");
    } else {
      // color があればその色（青いゴミ箱など。2026-11-12）
      prismPoly(m, r, z0, z1, it.color ? tint(COL_HEX(it.color)) : c, { bottom: z0 > zf + 0.05 });
    }
  }
  // 階段
  for (const s of f.stairs || []) addFloorStairs(M, s, zf, T, tint, cutTop);
  // エスカレーター（動かない部分。段は ctx.esc に足して campus3dEscalator が時刻に合わせて描く。なければ止まった段をここで）と、踊り場のある石の階段
  for (const e of f.escalators || []) {
    addEscalator(M, e, zf, T, tint);
    if (ctx.esc) ctx.esc.push({ e, zf });
    else addEscalatorSteps(m, escalatorGeom(e, zf), 0, T);
  }
  for (const s of f.flights || []) addFlight(M, s, zf, T, tint, cutTop);
  // 天井（切り取った階を上から見るときは描かない）
  // 床の穴のうち ceil: false（下の階へだけ抜ける階段の口）は天井に穴をあけない
  if (f.ceiling && !Number.isFinite(cutTop)) addCeiling(m, f, ring, holes.filter((_, i) => f.holes[i].ceil !== false), zf, T, ctx.plenumTop ? { top: ctx.plenumTop, outer: !!ctx.plenumOuter } : null);
  // 地下の上を覆う、地面の高さの床（広場・通路の下）：掘る前の地面の高さ、色は地面に貼った路面の色
  for (const l of f.noLid ? [] : f.lids || []) {
    const r = l.coords.map(toXY);
    const zAt = lidGround(r, ctx.groundAt, zf);
    const col = (ctx.paintAt && ctx.paintAt(centroid(r))) || T("plaza");
    m.polygon([r], zAt, [0, 0, 1], col);
    m.polygon([r], (p) => zAt(p) - 0.35, [0, 0, -1], shade(T("ceiling"), [0, 0, -1]));
  }
}

// ふた（lids の形 r）の上の面の高さ（点 → 掘る前の地面 + 0.03）。ふたは角の点の高さの平面の三角形なので、ふちの点で地面を測ると、
// となりの掘り下げた平地（明かり取りの床など）の高さを拾って、ふたが大きく傾いた板になる（広場の下の大階段の上に垂れ下がっていた）。
// 掘り下げた平地の外の地面は、ふちから壁の帯の中（0.9m ほど）まで低い（段差を壁の中に置くため）ので、点のまわり 0.3〜3.5m（16 の向き）の
// ふたの中の点の地面のいちばん高いところ（ふたの中に点がなければ、その点の地面）。細いくさびの角（明かり取りのふちと建物の線の角）でも
// 段差の帯の外の点が入るように
const LID_PROBE = [0.3, 0.8, 1.5, 2.5, 3.5];
export function lidGround(r, groundAt, zf) {
  const memo = new Map();
  return (p) => {
    const k = `${p[0]},${p[1]}`;
    if (memo.has(k)) return memo.get(k);
    let g = -Infinity;
    for (const d of LID_PROBE) {
      for (let a = 0; a < 16; a++) {
        const q = [p[0] + Math.cos((a * Math.PI) / 8) * d, p[1] + Math.sin((a * Math.PI) / 8) * d];
        if (!pointInRing(q[0], q[1], r)) continue;
        const v = groundAt(toLngLat(q));
        if (Number.isFinite(v)) g = Math.max(g, v);
      }
    }
    if (!Number.isFinite(g)) g = groundAt(toLngLat(p));
    const z = (Number.isFinite(g) ? g : zf) + 0.03;
    memo.set(k, z);
    return z;
  };
}

// 階段：段（踏面・蹴上げ・両わきの段の形）・裏の斜めの面・手すり（rails）
function addFloorStairs(M, s, zf, T, tint, cutTop) {
  const { m, glassy, veil } = M;
  const G = stairGeom(s, zf);
  const { zA, nT, riser, tread, hw, P, u, n, L, R } = G;
  const esc = s.kind === "escalator"; // エスカレーター：黒い段の前のふちに黄色い線、横はステンレス
  const c = T(STAIR_COL[s.kind] || "stairWhite");
  // glass：側の桁・蹴上げ・段の鼻は暗い鉄（すりガラスの踏面を鉄の枠が囲む）
  const steel = s.kind === "glass" ? T("stairSteel") : null;
  const edge = steel || T(esc ? "escSide" : "stairEdge");
  // 裏の面：段の角から SOFFIT 下。床から始まる階段は床より下へ出さない。踊り場から始まる階段（z0 > 0）は踊り場の下の面（同じく SOFFIT 下）から
  // 続ける（前は踊り場の上の面の高さから始まり、踊り場との境で裏の線が段違いになった。2026-11-14 ユーザー「つながりが適当じゃない？」）
  const soff = (sv) => Math.max((s.z0 || 0) > 0.05 ? zf + 0.01 : zA - 0.01, zA + (R * sv) / L - SOFFIT);
  // オーク（oak）：段の鼻（踏面の前のふちと蹴上げの上）を包むステンレスの帯（外の階段の addStairs と同じ寸法）
  const noseC = s.kind === "oak" ? T("stairNose") : s.kind === "rubber" ? T("stairRubberNose") : steel;
  const addNose = (sv, z) => {
    const a0 = sv - 0.004, a1 = sv + NOSE_TREAD;
    face(m, [[P(a0, -hw), z + 0.006], [P(a1, -hw), z + 0.006], [P(a1, hw), z + 0.006], [P(a0, hw), z + 0.006]], [0, 0, 1], noseC);
    face(m, [[P(a0, hw), z - NOSE_DROP], [P(a0, -hw), z - NOSE_DROP], [P(a0, -hw), z + 0.006], [P(a0, hw), z + 0.006]], [-u[0], -u[1], 0], noseC);
  };
  // 踏面 nT 枚（flush なら一番上の蹴上げは上の階の床のふちの面）
  for (let k = 0; k < nT; k++) {
    const s0 = k * tread, s1 = (k + 1) * tread;
    const zt = zA + (k + 1) * riser;
    if (zt > cutTop + 1e-6) break;
    face(m, [[P(s0, -hw), zt], [P(s1, -hw), zt], [P(s1, hw), zt], [P(s0, hw), zt]], [0, 0, 1], c);
    if (noseC) addNose(s0, zt);
    if (esc) face(m, [[P(s0, -hw + 0.03), zt + 0.003], [P(s0 + 0.05, -hw + 0.03), zt + 0.003], [P(s0 + 0.05, hw - 0.03), zt + 0.003], [P(s0, hw - 0.03), zt + 0.003]], [0, 0, 1], T("escLine"));
    face(m, [[P(s0, hw), zt - riser], [P(s0, -hw), zt - riser], [P(s0, -hw), zt], [P(s0, hw), zt]], [-u[0], -u[1], 0], steel || (k ? c : edge));
    face(m, [[P(s0, hw), soff(s0)], [P(s1, hw), soff(s1)], [P(s1, hw), zt], [P(s0, hw), zt]], [n[0], n[1], 0], edge);
    face(m, [[P(s1, -hw), soff(s1)], [P(s0, -hw), soff(s0)], [P(s0, -hw), zt], [P(s1, -hw), zt]], [-n[0], -n[1], 0], edge);
  }
  // flush の階段の上の端（上の階の床のふち）にも帯
  if (noseC && s.flush && zA + R <= cutTop + 1e-6) addNose(L, zA + R);
  const sTop = Math.min(L, Math.max(0, ((Math.min(cutTop, zA + R) - zA) / R) * L));
  if (sTop > 0.05) {
    const sl = Math.hypot(R, L);
    face(m, [[P(0, -hw), soff(0)], [P(sTop, -hw), soff(sTop)], [P(sTop, hw), soff(sTop)], [P(0, hw), soff(0)]], [(-R / sl) * u[0] * 0, 0, -1], T("ceiling"));
  }
  // 手すり（左・右）：段の角の線から 1.0m 上に手すり、格子・ガラスはその下の面
  (s.rails || []).forEach((k, i) => {
    if (!k) return;
    const lv = i === 0 ? hw : -hw;
    const a = P(0, lv), b = P(sTop, lv);
    const za = zA + riser, zb = zA + (R * sTop) / L + riser * 0.5;
    if (sTop < 0.05) return;
    const nn = [n[0] * (i === 0 ? 1 : -1), n[1] * (i === 0 ? 1 : -1), 0];
    if (k === "mesh") veil.quad([[a, za - 0.1], [b, zb - 0.1], [b, zb + 0.95], [a, za + 0.95]], nn, tint(MESH));
    if (k === "glass") glassy.quad([[a, za - 0.1], [b, zb - 0.1], [b, zb + 0.95], [a, za + 0.95]], nn, tint(GLASS));
    bar(m, [a, za + 1.0], [b, zb + 1.0], 0.05, T(k === "mesh" ? "mesh" : "rail"));
    if (k !== "rail") bar(m, [a, za - 0.08], [b, zb - 0.08], 0.05, T(k === "mesh" ? "mesh" : "rail"));
    const np = Math.max(1, Math.round(sTop / 1.6));
    for (let j = 0; j <= np; j++) {
      const p = lerp2(a, b, j / np);
      const z = za + ((zb - za) * j) / np;
      bar(m, [p, z - 0.1], [p, z + 1.0], 0.04, T(k === "mesh" ? "mesh" : "rail"));
    }
  });
}

// ── 大岡山駅の地下ホームの部品（2026-11-11、ユーザー「駅の中も含めて作ってほしい。すでに走ってる電車も併せて、うまく組み合うように」・
// 動画 IMG_1009：中央改札 → 改札の中 → 1・2 番線 → 西の端の乗り換えの階段と通路 → 3・4 番線 → エスカレーターで改札の中へ）──
// 整数 (i, j) からの 0〜1 の乱数（いつも同じ。タイルの色・発車標の字の並び）
const hash2 = (i, j) => {
  let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
// 平面の向き deg（度。+x から反時計回り）の単位ベクトル
const dirOf = (deg) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];

// 市松のタイル：grid [向き, 大きさ] の升目 (i, j) で i + j が奇数のところに濃い色の四角（4 隅が床の形の中・穴の外のものだけ。ふちは明るい色のまま）
function addChecker(m, ring, holes, z, [deg, size], c) {
  const u = dirOf(deg), v = [-u[1], u[0]];
  const loc = ring.map((p) => [p[0] * u[0] + p[1] * u[1], p[0] * v[0] + p[1] * v[1]]);
  const i0 = Math.floor(Math.min(...loc.map((q) => q[0])) / size), i1 = Math.ceil(Math.max(...loc.map((q) => q[0])) / size);
  const j0 = Math.floor(Math.min(...loc.map((q) => q[1])) / size), j1 = Math.ceil(Math.max(...loc.map((q) => q[1])) / size);
  if ((i1 - i0) * (j1 - j0) > 400000) return;
  const P = (i, j) => [u[0] * i * size + v[0] * j * size, u[1] * i * size + v[1] * j * size];
  const memo = new Map();
  const inside = (i, j) => {
    const k = i * 100003 + j;
    if (!memo.has(k)) {
      const p = P(i, j);
      memo.set(k, pointInRing(p[0], p[1], ring) && !holes.some((h) => pointInRing(p[0], p[1], h)));
    }
    return memo.get(k);
  };
  const cc = shade(c, [0, 0, 1]);
  for (let i = i0; i < i1; i++) {
    for (let j = j0; j < j1; j++) {
      if (((i + j) & 1) === 0) continue;
      if (!(inside(i, j) && inside(i + 1, j) && inside(i + 1, j + 1) && inside(i, j + 1))) continue;
      m.quad([[P(i, j), z], [P(i + 1, j), z], [P(i + 1, j + 1), z], [P(i, j + 1), z]], [0, 0, 1], cc);
    }
  }
}

// すりガラスの帯：区間 pc（長さ L、下の端 ba〜bb、上の端 ta〜tb）の band [下, 上, 倍率（なければ 1）] に、幅 0.16・高さ 0.12m の菱形を
// 横 0.2m・縦 0.14m おき（どれも倍率倍。1 段おきに半分ずらす）。ガラスの面から 4mm ずつ外の両面に（裏から見ても白く見える）。上の端の 0.05m 下までに収める
function addFrostBand(mesh, pc, L, ba, bb, ta, tb, band, col) {
  const k = band[2] || 1;
  const DW = 0.16 * k, DH = 0.12 * k, SX = 0.2 * k, SY = 0.14 * k;
  const u = [(pc.b[0] - pc.a[0]) / L, (pc.b[1] - pc.a[1]) / L];
  const nn = [-u[1], u[0]];
  const rows = Math.max(1, Math.floor((band[1] - band[0]) / SY));
  for (let r = 0; r < rows; r++) {
    const dz = band[0] + SY * (r + 0.5);
    for (let s = SX / 2 + ((r % 2) * SX) / 2; s < L - DW / 2 - 0.02; s += SX) {
      const t = s / L;
      const base = ba + (bb - ba) * t, top = ta + (tb - ta) * t;
      const zc = base + dz;
      if (zc + DH / 2 > top - 0.05) continue;
      const pm = lerp2(pc.a, pc.b, t);
      const pl = [pm[0] - u[0] * (DW / 2), pm[1] - u[1] * (DW / 2)], pr = [pm[0] + u[0] * (DW / 2), pm[1] + u[1] * (DW / 2)];
      for (const sg of [1, -1]) {
        const o = (q) => [q[0] + nn[0] * 0.004 * sg, q[1] + nn[1] * 0.004 * sg];
        const quad = [[o(pl), zc], [o(pm), zc - DH / 2], [o(pr), zc], [o(pm), zc + DH / 2]];
        mesh.quad(sg > 0 ? quad : [quad[0], quad[3], quad[2], quad[1]], [nn[0] * sg, nn[1] * sg, 0], col);
      }
    }
  }
}

// 杉綾のれんが（herring）：目地の色の面（呼ぶ前に描いてある）の上に、れんが（campus3dFeatures の herringboneBricks。4 つの濃さ）。
// grid [V の並ぶ向き（度。+x から反時計回り）, れんがの幅 m]
function addHerring(m, ring, holes, z, grid, T) {
  const [deg, w] = grid || [0, 0.1];
  const cols = [0, 1, 2, 3].map((t) => shade(T("herring" + t), [0, 0, 1]));
  for (const b of herringboneBricks(ring, holes, dirOf(deg), w)) m.quad(b.q.map((p) => [p, z]), [0, 0, 1], cols[b.tone]);
}

// 天井（階の ceiling）：床の形（床の穴・天井の穴を抜く）の z の高さに下向きの面。slats は細い板の継ぎ目の線（grid の向きに 0.2m おき）
const CEIL_COL = { slats: "ceilSlat", plain: "ceilSlat", dark: "ceilDark" };
const SLAT_GAP = 0.2;
function addCeiling(m, f, ring, holes, zf, T, plen = null) {
  const C = f.ceiling;
  const zc = zf + C.z;
  const hs = [...holes, ...(C.holes || []).map((h) => h.coords.map(toXY))];
  // 天井ふところをふさぐ帯（plen：top＝点 → 帯の上の端の標高か null〔そこは帯なし〕、outer＝外まわりにも）：天井の穴のふち（階段・エレベーターの
  // 吹き抜け）から上の階の床の下の面まで、いちばん上の階は外まわりも屋根の下の天井まで。点は帯の天井の側へ 0.05m 寄せて調べる
  if (plen?.top) {
    const solidC = hs.length ? clipOp("difference", [closeR(ring)], ...hs.map((h) => [closeR(h)])) : [[closeR(ring)]];
    for (const pg of solidC || []) pg.forEach((rr, k) => {
      const r = openR(rr);
      const outer = k === 0;
      const sg = (ringArea(r) > 0 ? 1 : -1) * (outer ? 1 : -1);
      r.forEach((a, i) => {
        const b = r[(i + 1) % r.length];
        const L = len(sub(b, a));
        if (L < 1e-6) return;
        if (outer && !plen.outer && onRingEdge(lerp2(a, b, 0.5), ring)) return; // 外まわりは上の階の床の縁を下ろしてふさぐ
        const n = [((b[1] - a[1]) / L) * sg, (-(b[0] - a[0]) / L) * sg, 0];
        const kk = Math.max(1, Math.ceil(L));
        for (let j = 0; j < kk; j++) {
          const p = lerp2(a, b, j / kk), q = lerp2(a, b, (j + 1) / kk);
          const tp = plen.top([p[0] - n[0] * 0.05, p[1] - n[1] * 0.05]), tq = plen.top([q[0] - n[0] * 0.05, q[1] - n[1] * 0.05]);
          if (tp == null || tq == null || Math.min(tp, tq) < zc + 0.02) continue;
          face(m, [[p, zc], [q, zc], [q, tq], [p, tp]], n, T("slabEdge"));
        }
      });
    });
  }
  // 穴が床の形のふちをまたぐと（大岡山駅の西の端の乗り換えの階段：ホームの床は s −171 まで・天井の穴は −177 まで）、earcut は穴を
  // 抜けず、階段の上を天井がふさいでいた（2026-11-12、ユーザーの目印 10・11「ここふさがってる」）。またぐ穴があれば形の引き算で面を作る
  const ceilCol = shade(T(CEIL_COL[C.kind] || "ceilSlat"), [0, 0, -1]);
  const crosses = hs.some((h) => h.some((p) => !pointInRing(p[0], p[1], ring)));
  // 穴どうしが重なる・同じ穴が 2 回（床の穴と ceiling.holes の両方）・辺を共有する（図書館の入口の階段の穴と屋根つきの踊り場）ときも earcut は
  // 穴を抜けず、天井が階段の穴の上をふさいでいた（2026-11-14、ユーザーの目印「ふさがってる」：抜いたあとの面積が外形より大きかった）→ 形の引き算
  const touch = (h, g) => h.some((p) => g.some((q) => Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6) || pointInRing(p[0], p[1], g));
  const overlap = hs.some((h, i) => hs.some((g, j) => j > i && (touch(h, g) || touch(g, h))));
  const diff = crosses || overlap ? clipOp("difference", [closeR(ring)], ...hs.map((h) => [closeR(h)])) : null;
  if (diff) for (const poly of diff) m.polygon(poly.map(openR), zc, [0, 0, -1], ceilCol);
  else m.polygon([ring, ...hs], zc, [0, 0, -1], ceilCol);
  if (C.kind !== "slats") return;
  let deg = f.grid ? f.grid[0] : null;
  if (deg == null) {
    let best = 0;
    ring.forEach((a, i) => {
      const d = sub(ring[(i + 1) % ring.length], a);
      if (len(d) > best) {
        best = len(d);
        deg = (Math.atan2(d[1], d[0]) * 180) / Math.PI;
      }
    });
  }
  const u = dirOf(deg), v = [-u[1], u[0]];
  const loc = ring.map((p) => [p[0] * u[0] + p[1] * u[1], p[0] * v[0] + p[1] * v[1]]);
  const W = (a, b) => [u[0] * a + v[0] * b, u[1] * a + v[1] * b];
  const lc = shade(T("ceilLine"), [0, 0, -1]);
  const vmin = Math.min(...loc.map((q) => q[1])), vmax = Math.max(...loc.map((q) => q[1]));
  for (let vv = Math.ceil(vmin / SLAT_GAP) * SLAT_GAP; vv < vmax; vv += SLAT_GAP) {
    const xs = [];
    loc.forEach((p, k) => {
      const q = loc[(k + 1) % loc.length];
      if ((p[1] - vv) * (q[1] - vv) < 0) xs.push(p[0] + ((q[0] - p[0]) * (vv - p[1])) / (q[1] - p[1]));
    });
    xs.sort((x, y) => x - y);
    // 穴（エスカレーターと階段の箱など）のふちでも線を切る（2026-11-12：前は線のまん中だけ見ていて、長い線が箱の上を通っていた＝
    // ユーザー「変な線が走ってる」）
    const cuts = [];
    for (const h of hs) {
      const lh = h.map((p) => [p[0] * u[0] + p[1] * u[1], p[0] * v[0] + p[1] * v[1]]);
      lh.forEach((p, k) => {
        const q = lh[(k + 1) % lh.length];
        if ((p[1] - vv) * (q[1] - vv) < 0) cuts.push(p[0] + ((q[0] - p[0]) * (vv - p[1])) / (q[1] - p[1]));
      });
    }
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const b0 = xs[k] + 0.02, b1 = xs[k + 1] - 0.02;
      if (b1 <= b0) continue;
      const stops = [b0, ...cuts.filter((c) => c > b0 && c < b1).sort((x, y) => x - y), b1];
      for (let j = 0; j + 1 < stops.length; j++) {
        const a0 = stops[j] + (j ? 0.02 : 0), a1 = stops[j + 1] - (j + 2 < stops.length ? 0.02 : 0);
        if (a1 <= a0 + 0.01) continue;
        const mid = W((a0 + a1) / 2, vv);
        if (hs.some((h) => pointInRing(mid[0], mid[1], h))) continue;
        m.quad([[W(a0, vv - 0.012), zc - 0.004], [W(a1, vv - 0.012), zc - 0.004], [W(a1, vv + 0.012), zc - 0.004], [W(a0, vv + 0.012), zc - 0.004]], [0, 0, -1], lc);
      }
    }
  }
}

// ホームドアの固定の箱（a→b、厚さ t、z0〜z1）。mg：白い箱の前後の面の上のほうにオレンジの帯。om：白い枠に前後の大きな窓（半透明のガラス）
function addPsdUnit(m, glassy, a, b, t, z0, z1, style, T) {
  const L = len(sub(b, a));
  if (L < 0.05 || !(z1 > z0 + 0.1)) return;
  const W = T("psdWhite");
  const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  const nl = [-u[1], u[0]];
  const off = (p, d) => [p[0] + nl[0] * d, p[1] + nl[1] * d];
  if (style === "om" && L > 0.45 && z1 - z0 > 0.9) {
    const s = 0.09;
    const wz0 = z0 + 0.42, wz1 = z1 - 0.16;
    const A = lerp2(a, b, s / L), B = lerp2(a, b, 1 - s / L);
    segBox(m, a, b, t, z0, z0, wz0, wz0, W);
    segBox(m, a, b, t, wz1, wz1, z1, z1, W, { bottom: true });
    segBox(m, a, A, t, wz0, wz0, wz1, wz1, W, { ends: true });
    segBox(m, B, b, t, wz0, wz0, wz1, wz1, W, { ends: true });
    for (const sg of [1, -1]) {
      const d = sg * (t / 2 - 0.04);
      glassy.quad([[off(A, d), wz0], [off(B, d), wz0], [off(B, d), wz1], [off(A, d), wz1]], [nl[0] * sg, nl[1] * sg, 0], T("glass"));
    }
  } else {
    segBox(m, a, b, t, z0, z0, z1, z1, W);
    if (style !== "om") {
      const bz0 = z1 - 0.5, bz1 = z1 - 0.27;
      for (const sg of [1, -1]) {
        const d = sg * (t / 2 + 0.004);
        face(m, [[off(a, d), bz0], [off(b, d), bz0], [off(b, d), bz1], [off(a, d), bz1]], [nl[0] * sg, nl[1] * sg, 0], T("psdOrange"));
      }
    }
  }
  segBox(m, a, b, t + 0.02, z1 - 0.03, z1 - 0.03, z1 + 0.005, z1 + 0.005, T("psdTop"));
}

/**
 * ホームドアの戸（口 d：{ a, b, z0, z1, style }、開き具合 open 0〜1）：口のまん中で合わさる 2 枚が、開くと両わきの箱の中へ引く。
 * mg はオレンジの板、om は白い枠に窓（半透明）。m・glassy は quad を持つ入れ物（Mesh）。T は色の名前 → 色（光を受けない色）
 */
export function psdLeaves(m, glassy, d, open, T = (k) => COL[k]) {
  const L = len(sub(d.b, d.a));
  if (L < 0.2 || !(d.z1 > d.z0 + 0.2)) return;
  const u = [(d.b[0] - d.a[0]) / L, (d.b[1] - d.a[1]) / L];
  const half = L / 2;
  const slide = half * 0.97 * Math.min(1, Math.max(0, open));
  const z0 = d.z0 + 0.03, z1 = d.z1;
  const at = (s) => [d.a[0] + u[0] * s, d.a[1] + u[1] * s];
  const leaf = (s0, s1) => {
    const A = at(s0), B = at(s1);
    if (d.style === "om") {
      const fw = 0.08;
      const W = T("psdWhite");
      segBox(m, A, B, 0.05, z0, z0, z0 + 0.38, z0 + 0.38, W);
      segBox(m, A, B, 0.05, z1 - 0.14, z1 - 0.14, z1, z1, W, { bottom: true });
      segBox(m, A, at(s0 + fw), 0.05, z0 + 0.38, z0 + 0.38, z1 - 0.14, z1 - 0.14, W);
      segBox(m, at(s1 - fw), B, 0.05, z0 + 0.38, z0 + 0.38, z1 - 0.14, z1 - 0.14, W);
      const nl = [-u[1], u[0], 0];
      glassy.quad([[at(s0 + fw), z0 + 0.38], [at(s1 - fw), z0 + 0.38], [at(s1 - fw), z1 - 0.14], [at(s0 + fw), z1 - 0.14]], nl, T("glass"));
    } else segBox(m, A, B, 0.05, z0, z0, z1, z1, T("psdOrange"));
  };
  leaf(-slide, half - slide);
  leaf(half + slide, L + slide);
}

// 鋼の縦の格子の柵：上と下の横の材・2m おきの柱・0.12m おきの細い縦の棒
function addBars(m, a, b, ba, bb, ta, tb, c) {
  const L = len(sub(b, a));
  if (L < 0.05) return;
  bar(m, [a, ta - 0.03], [b, tb - 0.03], 0.05, c);
  bar(m, [a, ba + 0.1], [b, bb + 0.1], 0.04, c);
  const np = Math.max(1, Math.round(L / 2));
  for (let k = 0; k <= np; k++) {
    const p = lerp2(a, b, k / np);
    bar(m, [p, ba + ((bb - ba) * k) / np], [p, ta + ((tb - ta) * k) / np], 0.06, c);
  }
  // 細い縦の棒は、柵の線に直角な面 1 枚と、線に沿った面 1 枚（箱にすると長い柵で三角形が多すぎる）
  const nb = Math.max(1, Math.round(L / 0.12));
  const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  const nl = [-u[1], u[0]];
  const w = 0.011;
  for (let k = 1; k < nb; k++) {
    const p = lerp2(a, b, k / nb);
    const z0 = ba + ((bb - ba) * k) / nb + 0.1, z1 = ta + ((tb - ta) * k) / nb - 0.03;
    const p0 = [p[0] - u[0] * w, p[1] - u[1] * w], p1 = [p[0] + u[0] * w, p[1] + u[1] * w];
    const q0 = [p[0] - nl[0] * w, p[1] - nl[1] * w], q1 = [p[0] + nl[0] * w, p[1] + nl[1] * w];
    face(m, [[p0, z0], [p1, z0], [p1, z1], [p0, z1]], [nl[0], nl[1], 0], c);
    face(m, [[q1, z0], [q0, z0], [q0, z1], [q1, z1]], [u[0], u[1], 0], c);
  }
}

// 大きなタイルの市松の壁（tiles）：下の TILE_BASE m は暗い腰、その上に TILE 角のタイル（色は升目の番号から。目地は暗い腰の色）。
// 升目は壁の折れ線の始めからの長さで数える（区間をまたいでもそろう）
const TILE = 1.25;
const TILE_BASE = 1.45;
const TILE_GAP = 0.016;
const TILE_COLS = ["tileCream", "tileCream", "tileGrey", "tileCream", "tileTerra", "tileGrey", "tileOlive", "tileCream", "tileKhaki", "tileGrey", "tileTerra", "tileCream"];
function addTilePanels(m, pc, t, ba, bb, ta, tb, T) {
  const L = len(sub(pc.b, pc.a));
  if (L < 0.05) return;
  const u = [(pc.b[0] - pc.a[0]) / L, (pc.b[1] - pc.a[1]) / L];
  const nl = [-u[1], u[0]];
  const z0 = Math.min(ba, bb) + TILE_BASE;
  const top = Math.min(ta, tb) - 0.02;
  const k0 = Math.floor(pc.s0 / TILE), k1 = Math.ceil(pc.s1 / TILE);
  for (const sg of [1, -1]) {
    const d = sg * (t / 2 + 0.005);
    const P = (s) => [pc.a[0] + u[0] * (s - pc.s0) + nl[0] * d, pc.a[1] + u[1] * (s - pc.s0) + nl[1] * d];
    const n3 = [nl[0] * sg, nl[1] * sg, 0];
    for (let k = k0; k < k1; k++) {
      const s0 = Math.max(pc.s0, k * TILE + TILE_GAP / 2), s1 = Math.min(pc.s1, (k + 1) * TILE - TILE_GAP / 2);
      if (s1 - s0 < 0.02) continue;
      for (let r = 0; ; r++) {
        const za = z0 + r * TILE + TILE_GAP / 2;
        if (za > top - 0.05) break;
        const zb = Math.min(top, z0 + (r + 1) * TILE - TILE_GAP / 2);
        const col = TILE_COLS[Math.floor(hash2(k, r) * TILE_COLS.length)];
        face(m, [[P(s0), za], [P(s1), za], [P(s1), zb], [P(s0), zb]], n3, T(col));
      }
    }
  }
}

// 駅のホームの丸柱（4 点の四角に内接する円。直径は辺の短いほう）：下から赤茶（COL_LOW）・オレンジと黄の市松の帯（COL_BAND、3 段）・
// クリーム色のタイル、てっぺんに白い丸い笠（半径 COL_CAP_R・厚さ COL_CAP_T。天井に付く）
const COL_SEG = 20;
const COL_LOW = 1.6;
const COL_BAND = 0.45;
const COL_CAP_R = 1.1;
const COL_CAP_T = 0.22;
function addColumn(m, r, z0, z1, T) {
  const c = centroid(r);
  const R = Math.min(...r.map((p, i) => len(sub(lerp2(p, r[(i + 1) % r.length], 0.5), c))));
  if (!(R > 0.05)) return;
  const circle = (rad) => Array.from({ length: COL_SEG }, (_, k) => {
    const a = (k / COL_SEG) * Math.PI * 2;
    return [c[0] + Math.cos(a) * rad, c[1] + Math.sin(a) * rad];
  });
  const ring0 = circle(R);
  const zc = z1 - COL_CAP_T;
  const zt = Math.min(z0 + COL_LOW, zc), zb = Math.min(zt + COL_BAND, zc);
  prismPoly(m, ring0, z0, zt, T("colTerra"), { top: false });
  const rows = 3;
  const rh = (zb - zt) / rows;
  for (let rr = 0; rr < rows && rh > 0.01; rr++) {
    for (let k = 0; k < COL_SEG; k++) {
      const p = ring0[k], q = ring0[(k + 1) % COL_SEG];
      const mid = lerp2(p, q, 0.5);
      face(m, [[p, zt + rr * rh], [q, zt + rr * rh], [q, zt + (rr + 1) * rh], [p, zt + (rr + 1) * rh]], [(mid[0] - c[0]) / R, (mid[1] - c[1]) / R, 0], T((k + rr) % 2 ? "colOrange" : "colYellow"));
    }
  }
  prismPoly(m, ring0, zb, zc, T("colCream"), { top: false });
  prismPoly(m, circle(Math.max(COL_CAP_R, R + 0.3)), zc, z1, T("colCap"), { bottom: true, top: false });
}

// 駅のベンチ（4 点の四角：1 本目の辺 a→b が背の線、a→d が前へ）：0.5m ごとのオレンジの座面と背、下に鋼の梁と脚 2 本
function addStationBench(m, r, z0, z1, T, seatC = null) {
  const [a, b, , d] = r;
  const L = len(sub(b, a)), D = len(sub(d, a));
  if (L < 0.4 || D < 0.25) return;
  const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], w = [(d[0] - a[0]) / D, (d[1] - a[1]) / D];
  const P = (x, y) => [a[0] + u[0] * x + w[0] * y, a[1] + u[1] * x + w[1] * y];
  const seat = seatC || T("benchSeat"), frame = T("benchFrame");
  const hs = Math.min(0.43, (z1 - z0) * 0.5);
  segBox(m, P(0.1, D * 0.45), P(L - 0.1, D * 0.45), 0.08, z0 + hs - 0.13, z0 + hs - 0.13, z0 + hs - 0.05, z0 + hs - 0.05, frame);
  for (const x of [0.3, L - 0.3]) segBox(m, P(x, D * 0.15), P(x, D * 0.75), 0.06, z0, z0, z0 + hs - 0.05, z0 + hs - 0.05, frame);
  const n = Math.max(1, Math.round(L / 0.5));
  const sw = L / n;
  for (let k = 0; k < n; k++) {
    const x0 = k * sw + 0.03, x1 = (k + 1) * sw - 0.03;
    prismPoly(m, [P(x0, 0.1), P(x1, 0.1), P(x1, D - 0.02), P(x0, D - 0.02)], z0 + hs - 0.05, z0 + hs, seat, { bottom: true });
    segBox(m, P(x0, 0.06), P(x1, 0.06), 0.04, z0 + hs, z0 + hs, z1, z1, seat);
  }
}

// 吊り下げの発車標（4 点の四角）：暗い箱、表（1 本目の辺の面）と裏（3 本目の辺の面）に 2 段の光る字（種別・行き先・時刻の帯）
function addBoard(m, r, z0, z1, T) {
  prismPoly(m, r, z0, z1, T("boardBox"), { bottom: true });
  const ce = centroid(r);
  const H = z1 - z0;
  [[r[0], r[1]], [r[2], r[3]]].forEach(([p, q], side) => {
    const L = len(sub(q, p));
    if (L < 0.4) return;
    const u = [(q[0] - p[0]) / L, (q[1] - p[1]) / L];
    let nl = [u[1], -u[0]];
    const mid = lerp2(p, q, 0.5);
    if ((mid[0] - ce[0]) * nl[0] + (mid[1] - ce[1]) * nl[1] < 0) nl = [-nl[0], -nl[1]];
    const at = (s) => [p[0] + u[0] * s + nl[0] * 0.006, p[1] + u[1] * s + nl[1] * 0.006];
    [[0.56, 0.84], [0.18, 0.46]].forEach(([h0, h1], row) => {
      const za = z0 + H * h0, zb = z0 + H * h1;
      let s = 0.08;
      let k = 0;
      while (s < L - 0.1) {
        const frac = s / L;
        const col = frac < 0.16 ? (row ? "ledRed" : "ledOrange") : frac < 0.68 ? "ledOrange" : "ledGreen";
        const wch = 0.075 + 0.02 * hash2(k + side * 97, row);
        if (hash2(k, row + side * 11 + 5) > 0.12) face(m, [[at(s), za], [at(Math.min(L - 0.08, s + wch)), za], [at(Math.min(L - 0.08, s + wch)), zb], [at(s), zb]], [nl[0], nl[1], 0], T(col));
        s += wch + 0.025;
        if (Math.abs(frac - 0.16) < 0.02 || Math.abs(frac - 0.68) < 0.02) s += 0.12;
        k++;
      }
    });
  });
}

// 駅の中の線路（type "track"）：まくらぎ（RAIL_SLEEPER m おき）と 2 本のレール。高さは点ごとの z（レールの上の面の標高。null は前後の点から）
const GAUGE = 1.067;
const RAIL_H = 0.17;
const RAIL_SLEEPER = 0.62;
export function addTrack(m, f) {
  if (f.bed === false) return;
  const zs = trackZs(f);
  if (!zs) return;
  const pts = f.coords.map(toXY);
  const T = (k) => COL[k];
  const steel = T("railSteel"), head = T("railHead"), sl = T("sleeper");
  let carry = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    const L = len(sub(b, a));
    if (L < 1e-3) continue;
    const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], nl = [-u[1], u[0]];
    const za = zs[i], zb = zs[i + 1];
    // レール：腹（暗い鋼）と頭（光る上の面）。端は少し重ねる（折れ目にすき間を作らない）
    for (const g of [GAUGE / 2 + 0.035, -(GAUGE / 2 + 0.035)]) {
      const A = [a[0] + nl[0] * g - u[0] * 0.02, a[1] + nl[1] * g - u[1] * 0.02], B = [b[0] + nl[0] * g + u[0] * 0.02, b[1] + nl[1] * g + u[1] * 0.02];
      segBox(m, A, B, 0.065, za - RAIL_H, zb - RAIL_H, za - 0.025, zb - 0.025, steel, { ends: false });
      segBox(m, A, B, 0.07, za - 0.025, zb - 0.025, za, zb, head, { ends: false });
    }
    // まくらぎ（コンクリート）：レールの下から RAIL_H 下まで、長さ 2.0m・幅 0.24m
    // まくらぎは上の面と、前後の 2 つの面だけ（両端・下は砂利に埋まる。長い線路で三角形を減らす）
    let s = carry;
    for (; s < L; s += RAIL_SLEEPER) {
      const z = za + ((zb - za) * s) / L - RAIL_H;
      const P = (ds, l) => [a[0] + u[0] * (s + ds) + nl[0] * l, a[1] + u[1] * (s + ds) + nl[1] * l];
      face(m, [[P(-0.12, -1), z], [P(0.12, -1), z], [P(0.12, 1), z], [P(-0.12, 1), z]], [0, 0, 1], sl);
      face(m, [[P(-0.12, 1), z - 0.16], [P(-0.12, -1), z - 0.16], [P(-0.12, -1), z], [P(-0.12, 1), z]], [-u[0], -u[1], 0], sl);
      face(m, [[P(0.12, -1), z - 0.16], [P(0.12, 1), z - 0.16], [P(0.12, 1), z], [P(0.12, -1), z]], [u[0], u[1], 0], sl);
    }
    carry = s - L; // 次の区間の最初のまくらぎまで
  }
}

// ── 屋根の下の天井（作り直し 2026-11-09）──
// ユーザーの写真（S__47235147＝真下から・S__47235150＝斜めから・動画）とアイソメ図の骨組み：屋根は斜めの RC の面（campus3dFeatures の
// roofSlab＝屋根の板をならした面。木の板はその上に段々に浮いている）。天井はその下の面（SLAB_T 下）で暗い灰色の吸音の板。
// 白い小梁（幅 BEAM_W・天井から BEAM_D 下）が斜面に直角に等間隔（大きくならした面の等高線を BEAM_DH ごと＝扇の段といっしょに回る）、
// 白い大梁（幅 GIRDER_W・天井から GIRDER_D 下）が柱（cols）を通って斜面の向きに。梁は下の階の床から頭の高さ（BEAM_HEAD・GIRDER_HEAD）
// より上だけ。上まで抜けたくり抜き（テラス）の中は描かない（天井の高さも Infinity）。ならした面のないところ（板から遠い）は前の決まり
// （屋根の高さ − ROOF_CEIL_DROP）。殻（detailShell）に描く板は上から見えるところだけ（visByIndex：高い板の下にもぐる部分は描かない）
const SLAB_T = 0.2;
const BEAM_W = 0.22;
const BEAM_D = 0.5;
const BEAM_DH = 0.35;
const BEAM_HEAD = 2.1;
const GIRDER_W = 0.5;
const GIRDER_D = 0.8;
const GIRDER_HEAD = 2.4;
const BEAM_INSET = 0.08;
const BEAM_WALL_GAP = 0.25;
const CEIL_EDGE_TOL = 0.3;
const CEIL_CELL = 1;
// 屋根の骨組み（建物の roofFrame。2026-11-10 作り直し、ユーザー「なんでこんなに天井がゆがんでるの？規則的にしたんじゃないの？」）：
// 前は小梁を「大きくならした面の等高線」・大梁を「柱ごとの斜面の向き」で引いていたので、梁が曲がって扇に開き、間隔もばらばらだった。
// 設計事務所のアイソメ図（大梁 500×1000・小梁 220×700）と写真では、大梁は南北にまっすぐ平行（柱の列 a = 7.1・13.88・20.6・27.5・34.45）、
// 小梁は南の緩い屋根で東西に 2.28m おき、北の急な斜面では水平な直線が扇に並ぶ（西で 1.0m・東で 1.85m おき。北西のふちも扇の 1 本）。
// 天井＝格子の点（大梁 × 小梁）の RC の面の高さを結んだ面（小梁に沿って大梁のあいだは直線、小梁のあいだは b の向きに直線）。
// 小梁の点は、ずれが FRAME_FIT 以下なら本物の大梁の点を 1 本の直線にそろえる（水平な小梁がまっすぐ通る）
const FRAME_FIT = 0.15;
const FRAME_STEP = 0.5; // 梁の折れ線の点の間隔（頭の高さで切るため。点はみな梁の直線の上）
const FRAME_WALL = GIRDER_W / 2 + 0.3; // 大梁が外の壁とほぼ平行にこの距離（m）より近いところが半分以上なら描かない（壁が受ける）
const ceilCache = new WeakMap();
const closeR = (r) => [...r, r[0]];
const openR = (r) => (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r.slice(0, -1) : r);
const inPoly = (q, poly) => pointInRing(q[0], q[1], poly[0]) && !poly.slice(1).some((h) => pointInRing(q[0], q[1], h));
const clipOp = (op, ...gs) => {
  try {
    return polygonClipping[op](...gs);
  } catch {
    return null;
  }
};
const boxOf = (r) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of r) {
    x0 = Math.min(x0, p[0]);
    y0 = Math.min(y0, p[1]);
    x1 = Math.max(x1, p[0]);
    y1 = Math.max(y1, p[1]);
  }
  return [x0, y0, x1, y1];
};
const boxHit = (A, B) => A[0] < B[2] && A[2] > B[0] && A[1] < B[3] && A[3] > B[1];
// 凸な形どうしが重なるか（分離軸）。板は四角なので、これで重なる板だけと引き算する
const convexHit = (A, B) => {
  for (const R of [A, B]) {
    for (let i = 0; i < R.length; i++) {
      const p = R[i], q = R[(i + 1) % R.length];
      const n = [q[1] - p[1], p[0] - q[0]];
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const v of A) { const d = v[0] * n[0] + v[1] * n[1]; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
      for (const v of B) { const d = v[0] * n[0] + v[1] * n[1]; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
      if (a1 <= b0 + 1e-9 || b1 <= a0 + 1e-9) return false;
    }
  }
  return true;
};
// 屋根の骨組み（f.roofFrame）の格子：{ toAB, fromAB, G（大梁の a。最初と最後は建物の外の仮の線）, R（小梁 { c, d }：b = c + d·a。最初と
// 最後は仮の線）, Z（格子の点の RC の上の面の標高 [小梁][大梁]）, top(q)（格子の点を結んだ面の標高） }。slabAbs(q) は RC の面の標高（なければ null）
function roofFrameGrid(f, ring, slabAbs, isOpen = () => false) {
  const rf = f.roofFrame;
  if (!rf || !(rf.ribs?.length >= 2)) return null;
  const O = toXY(rf.origin);
  const th = (rf.angle * Math.PI) / 180;
  const E = [Math.cos(th), Math.sin(th)], N = [-Math.sin(th), Math.cos(th)];
  const toAB = (q) => {
    const dx = q[0] - O[0], dy = q[1] - O[1];
    return [dx * E[0] + dy * E[1], dx * N[0] + dy * N[1]];
  };
  const fromAB = (a, b) => [O[0] + E[0] * a + N[0] * b, O[1] + E[1] * a + N[1] * b];
  const ab = ring.map(toAB);
  const a0 = Math.min(...ab.map((p) => p[0])) - 1, a1 = Math.max(...ab.map((p) => p[0])) + 1;
  const b0 = Math.min(...ab.map((p) => p[1])) - 1, b1 = Math.max(...ab.map((p) => p[1])) + 1;
  const G = [a0, ...rf.girders.filter((a) => a > a0 + 0.3 && a < a1 - 0.3), a1];
  const bAt = (r, a) => r.c + r.d * a;
  const am = (a0 + a1) / 2;
  const rs = rf.ribs.map(([c, d]) => ({ c, d })).sort((p, q) => bAt(p, am) - bAt(q, am));
  const first = rs[0], last = rs[rs.length - 1];
  const kS = Math.max(1, Math.max(bAt(first, a0), bAt(first, a1)) - b0 + 1);
  const kN = Math.max(1, b1 - Math.min(bAt(last, a0), bAt(last, a1)) + 1);
  const R = [{ c: first.c - kS, d: first.d, virt: true }, ...rs, { c: last.c + kN, d: last.d, virt: true }];
  const inside = (q) => pointInRing(q[0], q[1], ring);
  // 本物の小梁 × 本物の大梁の点だけ RC の面から取る（建物の外の仮の線の点は、外の地面へ下がる板の面を拾うので使わない）
  const Z = R.map((r, ri) => G.map((a, gi) => (ri > 0 && ri < R.length - 1 && gi > 0 && gi < G.length - 1 ? slabAbs(fromAB(a, bAt(r, a))) : null)));
  // 本物の小梁：建物の中の点を直線にそろえる（ずれが FRAME_FIT 以下のとき。小梁の上の本物の点はみなその直線に）
  for (let ri = 1; ri < R.length - 1; ri++) {
    const pts = [];
    for (let gi = 1; gi < G.length - 1; gi++) if (Z[ri][gi] != null && inside(fromAB(G[gi], bAt(R[ri], G[gi])))) pts.push([G[gi], Z[ri][gi]]);
    if (pts.length < 2) continue;
    const n = pts.length, sx = pts.reduce((s, p) => s + p[0], 0), sy = pts.reduce((s, p) => s + p[1], 0);
    const sxx = pts.reduce((s, p) => s + p[0] * p[0], 0), sxy = pts.reduce((s, p) => s + p[0] * p[1], 0);
    const den = n * sxx - sx * sx;
    const k1 = Math.abs(den) > 1e-9 ? (n * sxy - sx * sy) / den : 0;
    const k0 = (sy - k1 * sx) / n;
    // 扇の小梁（d ≠ 0）は図面で水平な直線なので、いつもそろえる（RC の面のでこぼこは板の段をならした名残り）
    if (!(Math.abs(R[ri].d) > 1e-9) && pts.some((p) => Math.abs(k0 + k1 * p[0] - p[1]) > FRAME_FIT)) continue;
    for (let gi = 1; gi < G.length - 1; gi++) Z[ri][gi] = k0 + k1 * G[gi];
  }
  // 本物の点で高さのないもの：同じ大梁の上の前後の小梁から（b の向きに直線で）、それもなければ同じ小梁の隣の点
  for (let gi = 1; gi < G.length - 1; gi++) {
    const col = R.map((r, ri) => ({ b: bAt(r, G[gi]), z: Z[ri][gi] }));
    const known = col.map((p, ri) => (p.z != null && ri > 0 && ri < R.length - 1 ? ri : -1)).filter((ri) => ri >= 0);
    if (!known.length) continue;
    for (let ri = 1; ri < R.length - 1; ri++) {
      if (Z[ri][gi] != null) continue;
      const lo = known.filter((k) => k < ri), hi = known.filter((k) => k > ri);
      const A = lo.length ? lo[lo.length - 1] : hi[0], B = hi.length ? hi[0] : lo.length > 1 ? lo[lo.length - 2] : null;
      if (B == null || col[A].b === col[B].b) Z[ri][gi] = col[A].z;
      else Z[ri][gi] = col[A].z + ((col[B].z - col[A].z) * (col[ri].b - col[A].b)) / (col[B].b - col[A].b);
    }
  }
  for (let ri = 1; ri < R.length - 1; ri++) {
    for (let gi = 1; gi < G.length - 1; gi++) {
      if (Z[ri][gi] != null) continue;
      let k = gi;
      while (k < G.length - 1 && Z[ri][k] == null) k++;
      if (Z[ri][k] == null) {
        k = gi;
        while (k > 0 && Z[ri][k] == null) k--;
      }
      Z[ri][gi] = Z[ri][k] ?? 0;
    }
  }
  // 仮の大梁の点：小梁に沿って、いちばん外の本物の大梁から外の壁までのあいだ（建物の中・天井のある所）の RC の面に、その大梁の点を
  // 通る直線をあてはめた傾き（壁ぎわで屋根が下がるところも小梁はまっすぐ。足りない分は天井の頭打ちで）。点が 4 つ未満なら水平
  const edgeZ = (ri, gEdge, gIn) => {
    const r = R[ri];
    const aIn = G[gIn];
    const zIn = Z[ri][gIn];
    const step = Math.sign(G[gEdge] - aIn) * 0.25;
    let sxx = 0, sxy = 0, n = 0;
    for (let a = aIn + step; (a - G[gEdge]) * step < 0; a += step) {
      const q = fromAB(a, bAt(r, a));
      if (!inside(q) || isOpen(q)) continue;
      const zs = slabAbs(q);
      if (zs == null) continue;
      sxx += (a - aIn) ** 2;
      sxy += (a - aIn) * (zs - zIn);
      n++;
    }
    return n >= 4 && sxx > 1e-9 ? zIn + (sxy / sxx) * (G[gEdge] - aIn) : zIn;
  };
  for (let ri = 1; ri < R.length - 1; ri++) {
    Z[ri][0] = edgeZ(ri, 0, 1);
    Z[ri][G.length - 1] = edgeZ(ri, G.length - 1, G.length - 2);
  }
  Z[0] = Z[1].slice();
  Z[R.length - 1] = Z[R.length - 2].slice();
  const top = (q) => {
    const [a, b] = toAB(q);
    let gi = 0;
    while (gi < G.length - 2 && a > G[gi + 1]) gi++;
    const u = (a - G[gi]) / (G[gi + 1] - G[gi]);
    let ri = 0;
    while (ri < R.length - 2 && b > bAt(R[ri + 1], a)) ri++;
    const zr = (k) => Z[k][gi] + (Z[k][gi + 1] - Z[k][gi]) * u;
    const bA = bAt(R[ri], a), bB = bAt(R[ri + 1], a);
    const v = bB - bA > 1e-6 ? (b - bA) / (bB - bA) : 0;
    return zr(ri) + (zr(ri + 1) - zr(ri)) * v;
  };
  return { toAB, fromAB, G, R, Z, bAt, top };
}
// 建物 f の屋根の下の天井：{ ring, g0, roof, slab, pieces（天井のある範囲 [{ poly（[外, 穴...]）, box, zAt }]）, pieceAt, at（点 → 天井の標高）,
// slabTop（点 → RC の屋根の上の面の標高）, isOpen, visByIndex }。同じ f には同じもの
export function roofCeiling(f, groundAt) {
  const key = f.coords;
  if (ceilCache.has(key)) return ceilCache.get(key);
  const ring0 = f.coords.map(toXY);
  const ring = ringArea(ring0) > 0 ? ring0 : ring0.slice().reverse();
  const g0 = groundAt(f.groundRef || toLngLat(centroid(ring)));
  const roof = buildingRoof(f);
  const slab = roofSlab(f);
  const open = (f.carves || []).filter((cv) => cv.top == null).map((cv) => cv.coords.map(toXY));
  const isOpen = (q) => open.some((o) => pointInRing(q[0], q[1], o));
  const openG = open.map((o) => [closeR(o)]);
  const ringG = [closeR(ring)];
  const rbox = boxOf(ring);
  // 殻に描く板の見えるところ（本当の高さで高い板から順に、板の形のまま。高い板と重なるところ・くり抜きは除く）
  const boards0 = roof.boards.list.map((b, i) => {
    const r = ringArea(b.ring) > 0 ? b.ring : b.ring.slice().reverse();
    return { i, r, rbox: boxOf(r), key: b.zAt(centroid(b.ring)) };
  }).filter((B) => boxHit(B.rbox, rbox));
  const sorted = boards0.slice().sort((p, q) => q.key - p.key || p.i - q.i);
  const visByIndex = new Map();
  sorted.forEach((B, k) => {
    let vis = clipOp("intersection", [closeR(B.r)], ringG);
    if (!vis?.length) return;
    const higher = [];
    for (let j = 0; j < k; j++) if (boxHit(sorted[j].rbox, B.rbox) && convexHit(sorted[j].r, B.r)) higher.push([closeR(sorted[j].r)]);
    if (higher.length) vis = clipOp("difference", vis, ...higher);
    if (vis?.length && openG.length) vis = clipOp("difference", vis, ...openG);
    if (vis?.length) visByIndex.set(B.i, vis.map((poly) => poly.map(openR).filter((r) => r.length >= 3)).filter((pg) => pg.length));
  });
  // 天井のある範囲（建物の形 − 上まで抜けたくり抜き）
  const region = (openG.length ? clipOp("difference", ringG, ...openG) : [ringG]) || [ringG];
  const slabTop = (q) => {
    const z = slab ? slab.at(q) : null;
    return z != null ? g0 + z : g0 + roof.hAt(q) - ROOF_CEIL_DROP + SLAB_T;
  };
  // 建物の形の外（ふちから CEIL_EDGE_TOL m より外）・上まで抜けたくり抜きの中は Infinity。ふちのすぐ外は形の中と同じ（外の壁と同じ線の
  // 階の壁が、天井で切られずに屋根の上まで伸びない）
  const nearRing = (q) => ring.some((p, i) => {
    const b = ring[(i + 1) % ring.length];
    const u = sub(b, p);
    const uu = u[0] * u[0] + u[1] * u[1];
    if (uu < 1e-12) return false;
    const t = Math.max(0, Math.min(1, ((q[0] - p[0]) * u[0] + (q[1] - p[1]) * u[1]) / uu));
    return len(sub(q, [p[0] + u[0] * t, p[1] + u[1] * t])) < CEIL_EDGE_TOL;
  });
  // 天井の面（RC の面の SLAB_T 下）。骨組み（roofFrame）があれば格子の点を結んだ面（RC の面より 0.05m 以上は上へ出さない）
  const frame = slab ? roofFrameGrid(f, ring, (q) => {
    const z = slab.at(q);
    return z == null ? null : g0 + z;
  }, isOpen) : null;
  const soffit = frame
    ? (q) => {
        const zf = frame.top(q) - SLAB_T;
        const zs = slab.at(q);
        return zs == null ? zf : Math.min(zf, g0 + zs - 0.05);
      }
    : (q) => slabTop(q) - SLAB_T;
  // 上まで抜けたくり抜きのふちから CEIL_EDGE_TOL m 以内（くり抜きの中）は、ふちの外（屋根の下）の天井。くり抜きのふちと同じ線の階の壁
  // （Taki の 2 階テラスのまわりの 3 階の北の壁・2 階の東の壁）が、くり抜きの中へ少し入っているだけで天井で切られず、屋根の板より上へ
  // 白い板のように突き出ていた（2026-11-12、ユーザーの目印 2・3・4「2,3,4の板じゃま。ここにあるのおかしい」。写真 013：テラスの奥の
  // 白い壁は屋根の板の下で終わる）
  const openSign = open.map((o) => (ringArea(o) > 0 ? 1 : -1));
  const openEdgeOut = (q) => {
    let best = null;
    open.forEach((o, k) => {
      if (!pointInRing(q[0], q[1], o)) return;
      o.forEach((p, i) => {
        const b = o[(i + 1) % o.length];
        const u = sub(b, p);
        const uu = u[0] * u[0] + u[1] * u[1];
        if (uu < 1e-12) return;
        const t = Math.max(0, Math.min(1, ((q[0] - p[0]) * u[0] + (q[1] - p[1]) * u[1]) / uu));
        const c = [p[0] + u[0] * t, p[1] + u[1] * t];
        const d = len(sub(q, c));
        if (d < CEIL_EDGE_TOL && (!best || d < best.d)) {
          const L = Math.sqrt(uu);
          const nOut = [(u[1] / L) * openSign[k], (-u[0] / L) * openSign[k]]; // くり抜きの外へ
          best = { d, p: [c[0] + nOut[0] * (CEIL_EDGE_TOL + 0.05), c[1] + nOut[1] * (CEIL_EDGE_TOL + 0.05)] };
        }
      });
    });
    return best ? best.p : null;
  };
  // 天井の面（くり抜きの中は Infinity）
  const at = (q) => ((!pointInRing(q[0], q[1], ring) && !nearRing(q)) || isOpen(q) ? Infinity : soffit(q));
  // 階の壁・物を切る高さ（roofCeilAt）：天井の面と同じで、くり抜きのふちのすぐ中だけはふちの外の天井
  const wallAt = (q) => {
    if (!isOpen(q)) return at(q);
    const p = openEdgeOut(q);
    return p && !isOpen(p) && (pointInRing(p[0], p[1], ring) || nearRing(p)) ? soffit(p) : Infinity;
  };
  const pieces = region
    .map((poly) => poly.map(openR).filter((r) => r.length >= 3))
    .filter((pg) => pg.length && Math.abs(ringArea(pg[0])) > 1e-3)
    .map((pg) => ({ poly: pg, box: boxOf(pg[0]), zAt: at }));
  const pieceAt = (q) => pieces.find((pc) => q[0] >= pc.box[0] && q[0] <= pc.box[2] && q[1] >= pc.box[1] && q[1] <= pc.box[3] && inPoly(q, pc.poly)) || null;
  const out = { ring, g0, roof, slab, pieces, pieceAt, at, wallAt, slabTop, soffit, frame, isOpen, visByIndex };
  ceilCache.set(key, out);
  return out;
}
// 等高線（四角の升目の値 G（nx × ny、点 (x0 + i·cell, y0 + j·cell)、NaN はなし）を、step ごとの高さで）：折れ線の並び [[x, y], ...]
function contourLines(G, step, box) {
  const { x0, y0, cell, nx, ny, coarse: V } = G;
  const i0 = Math.max(0, Math.floor((box[0] - x0) / cell) - 1), i1 = Math.min(nx - 2, Math.ceil((box[2] - x0) / cell) + 1);
  const j0 = Math.max(0, Math.floor((box[1] - y0) / cell) - 1), j1 = Math.min(ny - 2, Math.ceil((box[3] - y0) / cell) + 1);
  let lo = Infinity, hi = -Infinity;
  for (let j = j0; j <= j1 + 1; j++) for (let i = i0; i <= i1 + 1; i++) {
    const v = V[j * nx + i];
    if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  }
  if (!(hi > lo)) return [];
  const out = [];
  const val = (i, j) => V[j * nx + i];
  const P = (i, j) => [x0 + i * cell, y0 + j * cell];
  for (let k = Math.ceil(lo / step); k * step <= hi; k++) {
    const L = k * step + 1e-6;
    // 升ごとの線分（端は升の辺の上の点。辺の名前でつなぐ）
    const segs = [];
    const pt = new Map();
    const edge = (ia, ja, ib, jb) => {
      const key = `${ia},${ja},${ib},${jb}`;
      if (!pt.has(key)) {
        const va = val(ia, ja), vb = val(ib, jb);
        const t = (L - va) / (vb - va);
        const a = P(ia, ja), b = P(ib, jb);
        pt.set(key, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
      return key;
    };
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const v = [val(i, j), val(i + 1, j), val(i + 1, j + 1), val(i, j + 1)];
        if (!v.every(Number.isFinite)) continue;
        const c = v.map((x) => (x > L ? 1 : 0));
        const idx = c[0] | (c[1] << 1) | (c[2] << 2) | (c[3] << 3);
        if (idx === 0 || idx === 15) continue;
        const e = [edge(i, j, i + 1, j), edge(i + 1, j, i + 1, j + 1), edge(i, j + 1, i + 1, j + 1), edge(i, j, i, j + 1)]; // 下・右・上・左
        const add = (a, b) => segs.push([e[a], e[b]]);
        switch (idx) {
          case 1: case 14: add(3, 0); break;
          case 2: case 13: add(0, 1); break;
          case 3: case 12: add(3, 1); break;
          case 4: case 11: add(1, 2); break;
          case 6: case 9: add(0, 2); break;
          case 7: case 8: add(3, 2); break;
          case 5: case 10: {
            const mid = (v[0] + v[1] + v[2] + v[3]) / 4 > L;
            if ((idx === 5) === mid) { add(3, 2); add(0, 1); } else { add(3, 0); add(1, 2); }
            break;
          }
        }
      }
    }
    // つなぐ
    const ends = new Map();
    segs.forEach((s, si) => s.forEach((key) => { if (!ends.has(key)) ends.set(key, []); ends.get(key).push(si); }));
    const used = new Uint8Array(segs.length);
    const walk = (si, from) => {
      const line = [from];
      let cur = si, at = from;
      while (cur != null && !used[cur]) {
        used[cur] = 1;
        const nxt = segs[cur][0] === at ? segs[cur][1] : segs[cur][0];
        line.push(nxt);
        at = nxt;
        cur = (ends.get(at) || []).find((x) => !used[x]) ?? null;
      }
      return line;
    };
    for (let si = 0; si < segs.length; si++) {
      if (used[si]) continue;
      // 端（つながりが 1 つの点）から始める。輪ならどこからでも
      let start = segs[si][0];
      let cur = si;
      const seen = new Set();
      while (!seen.has(cur)) {
        seen.add(cur);
        const other = (ends.get(start) || []).find((x) => x !== cur && !used[x]);
        if (other == null) break;
        start = segs[other][0] === start ? segs[other][1] : segs[other][0];
        cur = other;
      }
      const line = walk(cur, segs[cur][0] === start ? segs[cur][0] : segs[cur][1]);
      if (line.length >= 2) out.push(line.map((key) => pt.get(key)));
    }
  }
  return out;
}
// 線分 a→b と線分 c→d の交わる位置（a→b の上の割合 t。交わらなければ null）
function segT(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]];
  const s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t > 1e-9 && t < 1 - 1e-9 && u >= 0 && u <= 1 ? t : null;
}
// 折れ線を、形（[外, 穴...] の並び）の中の部分だけに切る（ふちとの交わりで切る）。ふちの壁から BEAM_WALL_GAP m 以内を壁とほぼ平行に
// 走るところも除く（壁にぴったり沿う梁は描かない）。端は壁の線から、幅 w の角材の角が壁から出ないだけ手前で止める（壁に斜めに当たる
// ほど長く。壁の面と梁の端の面が重なってちらつかない）
function clipLine(pts, polys, w = 0) {
  const edges = [];
  for (const pg of polys) for (const r of pg) r.forEach((p, i) => edges.push([p, r[(i + 1) % r.length]]));
  const hugs = (p0, p1) => {
    const mid = lerp2(p0, p1, 0.5);
    const d = sub(p1, p0);
    const dl = len(d) || 1;
    return edges.some(([c, e]) => {
      const u = sub(e, c);
      const ul = len(u);
      if (ul < 1e-9) return false;
      const t = Math.max(0, Math.min(1, ((mid[0] - c[0]) * u[0] + (mid[1] - c[1]) * u[1]) / (ul * ul)));
      const dist = len(sub(mid, [c[0] + u[0] * t, c[1] + u[1] * t]));
      return dist < BEAM_WALL_GAP && Math.abs((d[0] * u[0] + d[1] * u[1]) / (dl * ul)) > 0.9;
    });
  };
  const inside = (q) => polys.some((pg) => inPoly(q, pg));
  // 端の手前の長さ：線の向き d が壁（向き u）に当たる角度から
  const insetFor = (d, wall) => {
    if (!wall) return BEAM_INSET;
    const u = sub(wall[1], wall[0]);
    const ul = len(u) || 1;
    const dl = len(d) || 1;
    const along = Math.abs((d[0] * u[0] + d[1] * u[1]) / (dl * ul)); // 壁の線と同じ向きの成分（＝角が出る割合）
    const across = Math.sqrt(Math.max(1e-6, 1 - along * along));
    return Math.min(2, BEAM_INSET + ((w / 2) * along) / across);
  };
  const out = [];
  let cur = null;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    const ts = [[0, null], [1, null]];
    for (const ed of edges) {
      const t = segT(a, b, ed[0], ed[1]);
      if (t != null) ts.push([t, ed]);
    }
    ts.sort((x, y) => x[0] - y[0]);
    for (let k = 0; k + 1 < ts.length; k++) {
      if (ts[k + 1][0] - ts[k][0] < 1e-9) continue;
      const p0 = lerp2(a, b, ts[k][0]), p1 = lerp2(a, b, ts[k + 1][0]);
      if (inside(lerp2(p0, p1, 0.5)) && !hugs(p0, p1)) {
        if (!cur) cur = { pts: [p0], w0: ts[k][1] };
        cur.pts.push(p1);
        cur.w1 = ts[k + 1][1];
      } else if (cur) {
        out.push(cur);
        cur = null;
      }
    }
  }
  if (cur) out.push(cur);
  // 端から長さ rest を切り詰める（端の区間が短ければ、その先の区間までさかのぼる）
  const trimEnd = (l, rest) => {
    const o = l.slice();
    while (o.length >= 2) {
      const a = o[o.length - 1], b = o[o.length - 2];
      const L = len(sub(b, a));
      if (L > rest + 1e-6) {
        o[o.length - 1] = lerp2(a, b, rest / L);
        return o;
      }
      rest -= L;
      o.pop();
    }
    return o;
  };
  return out
    .filter((c) => c.pts.length >= 2)
    .map((c) => {
      const l = c.pts;
      const n = l.length;
      const r1 = insetFor(sub(l[n - 1], l[n - 2]), c.w1);
      const r0 = insetFor(sub(l[1], l[0]), c.w0);
      return trimEnd(trimEnd(l, r1).reverse(), r0).reverse();
    })
    .filter((l) => l.length >= 2 && l.reduce((s, p, i) => (i ? s + len(sub(p, l[i - 1])) : 0), 0) > 0.3);
}
// 折れ線に沿った角材（幅 w、上 top(点)・下 bot(点)）：下の面・両わきの面・両端の面。外向きの面だけ（片面で描く段でもよい）
function beamAlong(m, pts, w, top, bot, c) {
  const n = pts.length;
  if (n < 2) return;
  const segN = [];
  for (let i = 0; i + 1 < n; i++) {
    const d = sub(pts[i + 1], pts[i]);
    const L = len(d) || 1;
    segN.push([-d[1] / L, d[0] / L]); // 左
  }
  const off = pts.map((p, i) => {
    const a = segN[Math.max(0, i - 1)], b = segN[Math.min(segN.length - 1, i)];
    let v = [a[0] + b[0], a[1] + b[1]];
    const vl = len(v) || 1;
    v = [v[0] / vl, v[1] / vl];
    const k = Math.min(3, 1 / Math.max(0.33, v[0] * b[0] + v[1] * b[1]));
    return [v[0] * k * (w / 2), v[1] * k * (w / 2)];
  });
  const Lp = pts.map((p, i) => [p[0] + off[i][0], p[1] + off[i][1]]);
  const Rp = pts.map((p, i) => [p[0] - off[i][0], p[1] - off[i][1]]);
  const zt = pts.map(top);
  const zb = pts.map(bot);
  for (let i = 0; i + 1 < n; i++) {
    const nl = [segN[i][0], segN[i][1], 0];
    const nr = [-segN[i][0], -segN[i][1], 0];
    face(m, [[Lp[i], zb[i]], [Rp[i], zb[i]], [Rp[i + 1], zb[i + 1]], [Lp[i + 1], zb[i + 1]]], [0, 0, -1], c);
    face(m, [[Lp[i + 1], zb[i + 1]], [Lp[i + 1], zt[i + 1]], [Lp[i], zt[i]], [Lp[i], zb[i]]], nl, c);
    face(m, [[Rp[i], zb[i]], [Rp[i], zt[i]], [Rp[i + 1], zt[i + 1]], [Rp[i + 1], zb[i + 1]]], nr, c);
  }
  const t0 = sub(pts[0], pts[1]);
  const t1 = sub(pts[n - 1], pts[n - 2]);
  const l0 = len(t0) || 1, l1 = len(t1) || 1;
  face(m, [[Rp[0], zb[0]], [Lp[0], zb[0]], [Lp[0], zt[0]], [Rp[0], zt[0]]], [t0[0] / l0, t0[1] / l0, 0], c);
  face(m, [[Lp[n - 1], zb[n - 1]], [Rp[n - 1], zb[n - 1]], [Rp[n - 1], zt[n - 1]], [Lp[n - 1], zt[n - 1]]], [t1[0] / l1, t1[1] / l1, 0], c);
}
// 角材を、下の端が床から head より上のところだけに分けて（下が上より 5cm 以上下のところ）
function beamRuns(m, pts, w, top, bot, c) {
  let run = [];
  const flush = () => {
    if (run.length >= 2) beamAlong(m, run, w, top, bot, c);
    run = [];
  };
  for (const p of pts) {
    if (top(p) - bot(p) > 0.05) run.push(p);
    else flush();
  }
  flush();
}
// RC の屋根の面の向き（sg 1 は上の面＝上向き、-1 は下の面＝天井＝下向き）。斜面の傾き（slab.grad）から
function slabNormal(C, q, sg) {
  const g = C.slab ? C.slab.grad(q) : null;
  if (!g) return [0, 0, sg];
  const l = Math.hypot(g[0], g[1], 1);
  return sg > 0 ? [-g[0] / l, -g[1] / l, 1 / l] : [g[0] / l, g[1] / l, -1 / l];
}
// 形（pieces：[{ poly, box }]）を CEIL_CELL m の升目で張る面（高さ zFn(点)、向き n＝数の並びか点 → 向き（升ごとに、升のまん中で）、色 c）。
// 形のふちが通る升は形で切る
function surfaceCells(m, pieces, zFn, n, c) {
  const nAt = typeof n === "function" ? n : () => n;
  for (const pc of pieces) {
    const edgeCells = new Set();
    for (const r of pc.poly) {
      r.forEach((a, i) => {
        const b = r[(i + 1) % r.length];
        const k = Math.max(1, Math.ceil(len(sub(b, a)) / (CEIL_CELL * 0.2)));
        for (let s = 0; s <= k; s++) {
          const q = lerp2(a, b, s / k);
          for (const dx of [-1e-6, 1e-6]) for (const dy of [-1e-6, 1e-6]) edgeCells.add(`${Math.floor((q[0] + dx) / CEIL_CELL)},${Math.floor((q[1] + dy) / CEIL_CELL)}`);
        }
      });
    }
    const polyC = pc.poly.map(closeR);
    for (let gx = Math.floor(pc.box[0] / CEIL_CELL); gx * CEIL_CELL < pc.box[2]; gx++) {
      for (let gy = Math.floor(pc.box[1] / CEIL_CELL); gy * CEIL_CELL < pc.box[3]; gy++) {
        const x0 = gx * CEIL_CELL, y0 = gy * CEIL_CELL, x1 = x0 + CEIL_CELL, y1 = y0 + CEIL_CELL;
        const sq = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
        if (edgeCells.has(`${gx},${gy}`)) {
          for (const pg of clipOp("intersection", [closeR(sq)], polyC) || []) {
            const pp = pg.map(openR).filter((r) => r.length >= 3);
            if (pp.length) m.polygon(pp, zFn, nAt(centroid(pp[0])), c);
          }
        } else if (inPoly([x0 + CEIL_CELL / 2, y0 + CEIL_CELL / 2], pc.poly)) m.polygon([sq], zFn, nAt([x0 + CEIL_CELL / 2, y0 + CEIL_CELL / 2]), c);
      }
    }
  }
}
// RC の屋根の上の面（板のすき間の下に見える暗い面。上向き）。屋根の板のある建物の殻から。地面より下には描かない（北の端は屋根の板が
// 地面まで下がり、ならした面は地面の下＝地下の階の中に入る）
export function addRoofSlabTop(m, f, groundAt, col) {
  const C = roofCeiling(f, groundAt);
  if (!Number.isFinite(C.g0) || !C.slab) return;
  surfaceCells(m, C.pieces, (q) => Math.max(C.slabTop(q), C.g0 + 0.02), (q) => slabNormal(C, q, 1), col);
}
// 屋根の下の天井と梁を描く。opts：cols（屋根の下まで届く柱の点。大梁がそこを通る）、floorAt（点 → その下のいちばん上の床の標高）。
// m は片面で描く段（cull）がよい（天井は下からだけ見える）
export function addRoofCeiling(m, f, groundAt, tint = (c) => c, { cols = [], floorAt = null } = {}) {
  const C = roofCeiling(f, groundAt);
  if (!Number.isFinite(C.g0) || !C.pieces.length) return;
  const panel = shade(tint(COL.roofCeil), [0, 0, -1]);
  const beamC = tint(COL.beam);
  const zc = C.soffit;
  const floorZ = (q) => {
    const z = floorAt ? floorAt(q) : -Infinity;
    return Number.isFinite(z) ? z : C.g0;
  };
  // 天井の面の下向きの法線（骨組みの面は格子の点を結んだ面なので、その傾きから）
  const soffitNormal = (q) => {
    const e = 0.25;
    const gx = (zc([q[0] + e, q[1]]) - zc([q[0] - e, q[1]])) / (2 * e);
    const gy = (zc([q[0], q[1] + e]) - zc([q[0], q[1] - e])) / (2 * e);
    const l = Math.hypot(gx, gy, 1);
    return Number.isFinite(l) ? [gx / l, gy / l, -1 / l] : [0, 0, -1];
  };
  // 1) 天井の板：CEIL_CELL m の升目ごと（形のふちが通る升は形で切る）。高さは点ごと（なめらかな斜面）
  surfaceCells(m, C.pieces, zc, C.frame ? soffitNormal : (q) => slabNormal(C, q, -1), panel);
  const S = C.slab;
  if (!S) return;
  const polys = C.pieces.map((pc) => pc.poly);
  if (C.frame) {
    addFrameBeams(m, C, polys, floorZ, beamC);
    return;
  }
  // 2) 小梁：大きくならした面の等高線（BEAM_DH ごと）。下の端は下の階の床から BEAM_HEAD より上
  const box = boxOf(C.ring);
  for (const line of contourLines(S.grid, BEAM_DH, box)) {
    for (const part of clipLine(line, polys, BEAM_W)) {
      beamRuns(m, part, BEAM_W, (q) => zc(q) + 0.03, (q) => Math.max(zc(q) - BEAM_D, floorZ(q) + BEAM_HEAD), beamC);
    }
  }
  // 3) 大梁：柱ごとに、大きくならした面の斜面の向き（ほぼ同じ線の上の柱は 1 本に）。柱から両向きに、天井のある範囲を出るまで
  const seen = [];
  for (const c of cols) {
    if (!Number.isFinite(C.at(c))) continue;
    const g = S.gradC(c);
    const gl = g ? Math.hypot(g[0], g[1]) : 0;
    if (gl < 1e-3) continue;
    const d = [g[0] / gl, g[1] / gl];
    if (seen.some((o) => Math.abs(d[0] * o.d[0] + d[1] * o.d[1]) > 0.985 && Math.abs((c[0] - o.c[0]) * -o.d[1] + (c[1] - o.c[1]) * o.d[0]) < 1.0)) continue;
    seen.push({ c, d });
    const STEP = 0.5;
    const pts = [c];
    for (const sg of [1, -1]) {
      for (let s = STEP; s < 150; s += STEP) {
        const q = [c[0] + d[0] * s * sg, c[1] + d[1] * s * sg];
        if (!Number.isFinite(C.at(q))) break;
        if (sg > 0) pts.push(q);
        else pts.unshift(q);
      }
    }
    const line = [[pts[0][0] - d[0] * STEP, pts[0][1] - d[1] * STEP], ...pts, [pts[pts.length - 1][0] + d[0] * STEP, pts[pts.length - 1][1] + d[1] * STEP]];
    for (const part of clipLine(line, polys, GIRDER_W)) {
      beamRuns(m, part, GIRDER_W, (q) => zc(q) + 0.03, (q) => Math.max(zc(q) - GIRDER_D, floorZ(q) + GIRDER_HEAD), beamC);
    }
  }
}
// 骨組み（roofFrame）の梁：本物の小梁は建物の幅いっぱいの直線（大梁のところと FRAME_STEP ごとに点）、本物の大梁は奥行きいっぱいの直線
// （小梁と交わるところと FRAME_STEP ごとに点）を、天井のある範囲（polys）で切って、天井から下げる（下の端は下の階の床から頭の高さより上）。
// 外の壁とほぼ平行に FRAME_WALL m より近い大梁は描かない（壁が受ける。梁の面が壁の外へ出ない）
function addFrameBeams(m, C, polys, floorZ, beamC) {
  const Fr = C.frame;
  const zc = C.soffit;
  const dense = (vals) => {
    const out = [];
    for (let k = 0; k + 1 < vals.length; k++) {
      const n = Math.max(1, Math.ceil((vals[k + 1] - vals[k]) / FRAME_STEP));
      for (let j = 0; j < n; j++) out.push(vals[k] + ((vals[k + 1] - vals[k]) * j) / n);
    }
    out.push(vals[vals.length - 1]);
    return out;
  };
  for (let ri = 1; ri < Fr.R.length - 1; ri++) {
    const r = Fr.R[ri];
    const line = dense(Fr.G).map((a) => Fr.fromAB(a, Fr.bAt(r, a)));
    for (const part of clipLine(line, polys, BEAM_W)) {
      beamRuns(m, part, BEAM_W, (q) => zc(q) + 0.03, (q) => Math.max(zc(q) - BEAM_D, floorZ(q) + BEAM_HEAD), beamC);
    }
  }
  const ring = C.ring;
  const wallNear = (q, dir) => ring.some((p, i) => {
    const b = ring[(i + 1) % ring.length];
    const u = sub(b, p);
    const ul = len(u);
    if (ul < 1e-9 || Math.abs((u[0] * dir[0] + u[1] * dir[1]) / ul) < 0.95) return false;
    const t = Math.max(0, Math.min(1, ((q[0] - p[0]) * u[0] + (q[1] - p[1]) * u[1]) / (ul * ul)));
    return len(sub(q, [p[0] + u[0] * t, p[1] + u[1] * t])) < FRAME_WALL;
  });
  for (let gi = 1; gi < Fr.G.length - 1; gi++) {
    const a = Fr.G[gi];
    const bs = Fr.R.map((r) => Fr.bAt(r, a)).sort((x, y) => x - y);
    const line = dense(bs).map((b) => Fr.fromAB(a, b));
    const parts = clipLine(line, polys, GIRDER_W);
    const dir = sub(Fr.fromAB(a, 1), Fr.fromAB(a, 0));
    const pts = parts.flat();
    if (pts.length && pts.filter((q) => wallNear(q, dir)).length > pts.length / 2) continue;
    for (const part of parts) {
      beamRuns(m, part, GIRDER_W, (q) => zc(q) + 0.03, (q) => Math.max(zc(q) - GIRDER_D, floorZ(q) + GIRDER_HEAD), beamC);
    }
  }
}
// 天井の高さ（点 → 標高）：建物 f の屋根の下の天井
export function roofCeilAt(f, groundAt) {
  const C = roofCeiling(f, groundAt);
  return (q) => C.at(q);
}
// 階の壁・物を切る高さ（addFloor の ceilAt）：roofCeilAt と同じで、上まで抜けたくり抜きのふちのすぐ中だけはふちの外の天井（2026-11-12）
export function roofWallAt(f, groundAt) {
  const C = roofCeiling(f, groundAt);
  return (q) => C.wallAt(q);
}

// 地下の階の下を掘ったふち（dig）の帯：形の外へ WALL_T + WALL_CAP、下は掘った地面・上は掘る前の地面の少し下（上の面の色は路面）。
// 外がほかの dig でもっと深く掘ってあるところは描かない
// 帯は辺ごとに DIG_BAND_STEP m 以下の区間に分け、区間の両端の上の面の高さは、帯の中ほど（ふちから 3 割）と外のふちの地面の高いほう
// （前は辺の両端の外のふちの地面を直線で結んでいたので、辺の途中から外が掘り下げた平地になると、広場の上で帯が何 m も下がって
// 地下が見える穴になった：Taki の北西の角、ユーザーの目印 13「近くに穴が開いてる」）
const DIG_BAND_STEP = 1;
// 掘らない地下の階（digMode "cut"・いまの並びに dig がない）の形：[{ ring, holes, level（掘るときの底）, top（床の上の面の標高） }]。
// 掘ったふちの外がここなら、帯は床から PASS_CLEAR m より上だけ（下は通れる口・上は地面のまま歩ける。Taki の地下 1 階から附属図書館の
// 地下 1 階への連絡通路。2026-11-13：前は帯をまるごと省いたので、掘った地面のにじみ〔ふちの外 0.7m ほど〕の上に地面がなく、歩く人が落ちた）
export const PASS_CLEAR = 2.6;
export function cutFloorRegions(features, groundAt) {
  const dug = new Set(features.filter((f) => f.type === "dig").map((f) => f.id));
  return features
    .filter((f) => f.type === "floor" && f.digMode === "cut" && f.host && f.z < -0.5 && f.coords?.length > 2 && !dug.has(`dig:${f.id}`))
    .map((f) => {
      const g0 = groundAt(f.groundRef || f.coords[0]);
      return Number.isFinite(g0) ? { ring: f.coords.map(toXY), holes: (f.holes || []).map((h) => (h.coords || h).map(toXY)), level: g0 + f.z - f.slab - 0.35, top: g0 + f.z } : null;
    })
    .filter(Boolean);
}
export function digBandPieces(dig, digs, groundAt, cuts = []) {
  if (dig.f?.band === false) return []; // 帯なし（駅のエスカレーターの口など：ふちの壁は階の壁で作る）
  const ring = ringArea(dig.ring) > 0 ? dig.ring : dig.ring.slice().reverse();
  const outer = offsetRingBy(ring, ring.map(() => WALL_T + WALL_CAP));
  const out = [];
  const topAt = (p, o) => {
    const g1 = groundAt(toLngLat(lerp2(p, o, 0.3)));
    const g2 = groundAt(toLngLat(o));
    const g = Math.max(Number.isFinite(g1) ? g1 : -Infinity, Number.isFinite(g2) ? g2 : -Infinity);
    return Number.isFinite(g) ? g - 0.03 : NaN;
  };
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length];
    const oa = outer[i], ob = outer[(i + 1) % ring.length];
    const k = Math.max(1, Math.ceil(len(sub(b, a)) / DIG_BAND_STEP));
    for (let j = 0; j < k; j++) {
      const pa = lerp2(a, b, j / k), pb = lerp2(a, b, (j + 1) / k);
      const qa = lerp2(oa, ob, j / k), qb = lerp2(oa, ob, (j + 1) / k);
      const mo = lerp2(qa, qb, 0.5);
      const probe = lerp2(lerp2(pa, pb, 0.5), mo, 0.3);
      // 外のほかの掘った所：同じか深ければ帯はいらない。浅ければ帯はその底まで（上の階の床の下）
      const outer2 = digs.filter((o) => o !== dig && pointInRing(probe[0], probe[1], o.ring) && !o.holes.some((h) => pointInRing(probe[0], probe[1], h)));
      if (outer2.some((o) => o.level <= dig.level + 0.05)) continue;
      const cap = outer2.length ? Math.min(...outer2.map((o) => o.level)) : null;
      const ga = cap ?? topAt(pa, qa), gb = cap ?? topAt(pb, qb);
      if (!Number.isFinite(ga) || !Number.isFinite(gb)) continue;
      // 外が掘らない地下の階（同じか低い）なら、帯はその床から PASS_CLEAR m より上だけ（lintel＝帯の下の端）
      const near = cap == null ? cuts.filter((c) => c.level <= dig.level + 0.05 && pointInRing(probe[0], probe[1], c.ring) && !c.holes.some((h) => pointInRing(probe[0], probe[1], h))) : [];
      const lintel = near.length ? Math.max(...near.map((c) => c.top)) + PASS_CLEAR : null;
      if (lintel != null && Math.max(ga, gb) < lintel + 0.05) continue;
      out.push({ a: pa, b: pb, oa: qa, ob: qb, ta: ga, tb: gb, level: dig.level, mo, capped: cap != null, ...(lintel != null ? { lintel } : {}) });
    }
  });
  return out;
}
// 帯の上の面は、ふちに沿って 1m ごとに、ふちのすぐ外（帯の幅の 1/4）の路面の色（なければ、となりの区切りの色・地面の色）。
// 上の面は、標高タイルの補間で外の地面が帯の上より下がるところだけ見える（明かり取りのガラスの足もとなど）ので、そこの床と同じ色に
// （帯のまん中の 1 点で測ると、明かり取りでは大階段の下で路面がなく、白いぎざぎざが出ていた）
export function addDigBand(m, dig, digs, groundAt, paintAt, ground, cuts = []) {
  for (const p of digBandPieces(dig, digs, groundAt, cuts)) {
    if (Math.max(p.ta, p.tb) < p.level + 0.05) continue;
    const L = len(sub(p.b, p.a)) || 1;
    const n = [(p.b[1] - p.a[1]) / L, -(p.b[0] - p.a[0]) / L, 0]; // 外向き（左回りの輪の右）
    const zb = p.lintel ?? p.level; // 帯の下の端（通路の口の上の帯は lintel から）
    face(m, [[p.b, zb], [p.a, zb], [p.a, p.ta], [p.b, p.tb]], [-n[0], -n[1], 0], COL.wall);
    // 口の上の帯の下の面（天井）
    if (p.lintel != null) m.quad([[p.a, zb], [p.b, zb], [p.ob, zb], [p.oa, zb]], [0, 0, -1], COL.wall);
    const k = Math.max(1, Math.ceil(L / 1));
    const cols = [];
    for (let i = 0; i < k; i++) {
      const t = (i + 0.5) / k;
      cols.push(p.capped ? COL.wall : (paintAt && paintAt(lerp2(lerp2(p.a, p.b, t), lerp2(p.oa, p.ob, t), 0.25))) || null);
    }
    const near = (i) => { for (let d = 1; d < k; d++) for (const j of [i - d, i + d]) if (j >= 0 && j < k && cols[j]) return cols[j]; return null; };
    for (let i = 0; i < k; i++) {
      const t0 = i / k, t1 = (i + 1) / k;
      const col = cols[i] || near(i) || ground || COL.plaza;
      const z0 = p.ta + (p.tb - p.ta) * t0, z1 = p.ta + (p.tb - p.ta) * t1;
      m.quad([[lerp2(p.a, p.b, t0), z0], [lerp2(p.a, p.b, t1), z1], [lerp2(p.oa, p.ob, t1), z1], [lerp2(p.oa, p.ob, t0), z0]], [0, 0, 1], col);
    }
  }
}

// ── 歩く世界：階の立体・壁・段（campus3dWalk.js の walkWorld から）──
// add は { solid(outer, holes, spans, piece), edge(a, b, half, spans, stand) }（spans は [[下, 上]...] の標高）、BODY は体の半径
export function floorWalk(f, groundAt, add, BODY) {
  const g0 = floorG0(f, groundAt);
  if (!Number.isFinite(g0)) return;
  const zf = g0 + f.z;
  const ring = f.coords.map(toXY);
  const holes = (f.holes || []).map((h) => h.coords.map(toXY));
  // 床（穴は抜ける）
  add.solid(ring, holes, () => [[zf - f.slab, zf]], 2);
  // 壁・ガラス・手すり：扉の口は通れる（まぐさの下は 2.2m）
  for (const w of f.walls || []) {
    const pts = w.coords.map(toXY);
    const t = wallT(w);
    const S = wallSlope(f, w, pts, zf);
    // ホームドアは戸の口も通れない（線路へ落ちない。電車には乗れない）
    for (const pc of wallPieces(pts, w.kind === "psd" ? [] : w.doors || [])) {
      // 斜めの壁（h2・z02）は区間の両端の低い下の端・高い上の端（まっすぐな壁は前と同じ）
      const z0 = Math.min(S.bot(pc.a), S.bot(pc.b));
      const z1 = Math.max(S.top(pc.a), S.top(pc.b));
      const low = w.kind === "mesh" || w.kind === "rail" || w.kind === "bars" || w.kind === "psd"; // 腰の高さ：越えられない高さまで
      const lo = pc.door ? (low || w.kind === "low" ? null : z0 + DOOR_H) : z0;
      if (lo == null || !(z1 > lo)) continue;
      const stand = w.kind === "low";
      add.edge(pc.a, pc.b, t / 2 + BODY, [[lo, low ? Math.max(z1, z0 + 1.5) : z1]], stand);
    }
  }
  // 家具など（上に立てる。低いもの＝0.6m までは段として上れる）。エレベーターの昇降路（lift）は中空：4 面の壁の線（扉の面は口をあける。
  // 閉まった扉は campus3dLift の liftBlocked が動く壁としてふさぐ）。中の床は階の床
  for (const it of f.items || []) {
    const r = it.coords.map(toXY);
    const span = [[zf + it.z0, zf + it.z1]];
    if (it.kind === "lift" && r.length === 4) {
      for (const sd of liftSides(r)) {
        const P = (s) => [sd.a[0] + sd.u[0] * s, sd.a[1] + sd.u[1] * s];
        if (!sd.door) add.edge(sd.inn(sd.a), sd.inn(sd.b), LIFT_WALL / 2 + BODY, span, false);
        else {
          add.edge(sd.inn(sd.a), sd.inn(P(sd.s0)), LIFT_WALL / 2 + BODY, span, false);
          add.edge(sd.inn(P(sd.s1)), sd.inn(sd.b), LIFT_WALL / 2 + BODY, span, false);
          if (it.z1 > it.z0 + LIFT_DOOR_H) add.edge(sd.inn(P(sd.s0)), sd.inn(P(sd.s1)), LIFT_WALL / 2 + BODY, [[zf + it.z0 + LIFT_DOOR_H, zf + it.z1]], false);
        }
      }
      continue;
    }
    // 斜めの板の屋根（wedge）：板（上の面から厚さぶん下まで。上れないように床から 1.2m より低くしない）と、閉じた辺の側の壁
    // （z0 から上の面の高いほうまで）。口の辺（open）は板の下を通れる
    if (it.kind === "wedge" && Array.isArray(it.zs) && it.zs.length === r.length) {
      const th = it.thick > 0 ? it.thick : 0.3;
      const topAt = wedgeTopAt(r, it.zs);
      add.solid(r, [], (x, y) => {
        const t = topAt(x, y);
        return [[zf + t - th, zf + Math.max(t, 1.2)]];
      }, 0.5);
      const open = new Set(it.open || []);
      r.forEach((a, k) => {
        if (open.has(k)) return;
        const k2 = (k + 1) % r.length;
        add.edge(a, r[k2], BODY + 0.1, [[zf + it.z0, zf + Math.max(it.zs[k], it.zs[k2], 1.2)]], false);
      });
      continue;
    }
    if (FLAT_ITEMS.has(it.kind)) continue;
    add.solid(r, [], () => span, 0.5);
    // 踊り場の台の手すりの辺：その側からは落ちない（階段の手すりと同じ当たり）
    if (it.kind === "platform" && it.rails) it.rails.forEach((k, i) => {
      if (!k) return;
      add.edge(r[i], r[(i + 1) % r.length], 0.03 + BODY, [[zf + it.z1 - 0.6, zf + it.z1 + 1.1]], false);
    });
  }
  // エスカレーター（2026-11-12）：段の帯は段の角の線の高さの床（動く向きに体を運ぶ：add.belt）、両わき（くしの横の板〜外の箱）は手すりの高さまでの立体
  for (const e of f.escalators || []) {
    const G = escalatorGeom(e, zf);
    const box = (lv0, lv1, s0, s1) => [G.P(s0, lv0), G.P(s1, lv0), G.P(s1, lv1), G.P(s0, lv1)];
    const zAt = (x, y) => G.zA + G.zLine(Math.min(G.L, Math.max(0, G.local(x, y)[0])));
    const band = box(-G.hs - ESC.skirt, G.hs + ESC.skirt, 0, G.L);
    add.solid(band, [], (x, y) => [[G.zA - 0.6, zAt(x, y)]], 0.25);
    for (const sg of [1, -1]) {
      add.solid(box(sg * (G.hs + ESC.skirt), sg * (G.hs + ESC.outer), -G.newel, G.L + G.newel), [], (x, y) => [[G.zA - 0.6, zAt(x, y) + ESC.rail + ESC.railT]], 0.25);
    }
    if (add.belt && G.dirSign) {
      add.belt(band, (x, y) => {
        const sv = G.local(x, y)[0];
        const v = (G.dirSign * G.speed) / Math.hypot(1, G.slope(sv));
        return { z: zAt(x, y), v: [G.u[0] * v, G.u[1] * v] };
      });
    }
  }
  // 踊り場のある石の階段：段と踊り場の上の面に立てる（下の床から）。手すり・仕切りの側は落ちない
  for (const s of f.flights || []) {
    const G = flightGeom(s, zf);
    const ring = [G.P(0, -G.hw), G.P(G.L, -G.hw), G.P(G.L, G.hw), G.P(0, G.hw)];
    add.solid(ring, [], (x, y) => {
      const z = G.topAt(x, y);
      return z == null ? [] : [[G.zA - 0.3, z]];
    }, 0.3);
    (s.rails || []).forEach((k, i) => {
      if (!k) return;
      const lv = (i === 0 ? 1 : -1) * (G.hw + 0.03);
      for (let a = 0; a < G.L; a += 0.3) {
        const b = Math.min(G.L, a + 0.3);
        add.edge(G.P(a, lv), G.P(b, lv), 0.03 + BODY, [[G.zA + G.noseAt(a) - 0.6, G.zA + G.noseAt(b) + 1.1]], false);
      }
    });
  }
  // 階段：段の上の面に立てる（裏は段の角から SOFFIT 下まで）。手すりの側は落ちない
  for (const s of f.stairs || []) {
    const G = stairGeom(s, zf);
    add.solid(G.ring, [], (x, y) => {
      const z = G.topAt(x, y);
      return z == null ? [] : [[Math.max(G.zA - 0.02, z - G.riser - SOFFIT), z]];
    }, 0.5);
    (s.rails || []).forEach((k, i) => {
      if (!k) return;
      const lv = i === 0 ? G.hw : -G.hw;
      for (let j = 0; j < G.nT; j++) {
        const a = G.P(j * G.tread, lv), b = G.P((j + 1) * G.tread, lv);
        const z = G.zA + (j + 1) * G.riser;
        add.edge(a, b, 0.03 + BODY, [[z - G.riser - SOFFIT, z + 1.5]], false);
      }
    });
  }
  // 地面の高さの床（掘る前の地面）。掘り下げた平地のふちのそば（壁の帯の中で地面が低い）でも、描くふた（lidGround の角の点）の
  // いちばん低いところより下げない（明かり取りのふちの壁は外が地下の階なら薄いので、その外はふたの上を歩く）
  for (const l of f.lids || []) {
    const r = l.coords.map(toXY);
    const zl = lidGround(r, groundAt, zf);
    const zMin = Math.min(...r.map(zl)) - 0.03;
    add.solid(r, [], (x, y) => {
      const g = Math.max(groundAt(toLngLat([x, y])), zMin);
      return Number.isFinite(g) ? [[g + 0.03 - 0.35, g + 0.03]] : [];
    }, 2);
  }
}
// 掘ったふちの帯：上は掘る前の地面（上を歩ける）、下は掘った地面
export function digWalk(dig, digs, groundAt, add, cuts = []) {
  for (const p of digBandPieces(dig, digs, groundAt, cuts)) {
    const lo = p.lintel ?? -Infinity; // 通路の口の上の帯は lintel から上だけ
    add.solid([p.a, p.b, p.ob, p.oa], [], (x, y) => {
      if (p.capped) return [[lo, Math.max(p.ta, p.tb)]];
      const g = groundAt(toLngLat([x, y]));
      return [[lo, Number.isFinite(g) ? g - 0.03 : Math.max(p.ta, p.tb)]];
    }, 0.5);
  }
}

// 部屋の名前を出す点（at か、形の中心）と高さ（床 + 0.3m の標高）：[{ name, xy, z }]
export function floorLabels(f, groundAt) {
  const g0 = floorG0(f, groundAt);
  if (!Number.isFinite(g0)) return [];
  return (f.rooms || []).filter((r) => r.name).map((r) => ({ name: r.name, xy: r.at ? toXY(r.at) : centroid(r.coords.map(toXY)), z: g0 + f.z + 0.3 }));
}

// ── 大岡山駅の階段・エスカレーターのまわりと 1 階（2026-11-12、ユーザー「階段とエスカレーター周辺がダメすぎ。既存のものを流用するのではなく
// しっかり再現するためにないものは新しく作って。エスカレーターは動かさないと。あと階段の途中に変な線あるし、登り切ったとこにも変な面あるよ。
// あとえき１階もちゃんと再現して」・動画 IMG_1009 の 6〜80 秒）──

// エスカレーター（階の escalators）：A（下のくし）→ B（上のくし）のまん中の線。段の角の線の高さ zLine(sv)（A からの水平の距離 sv で、
// 下の平ら → 曲がり → 斜め → 曲がり → 上の平ら。曲がりは 2 次の曲線でなめらか）。横は段のふち hs から：くしの横の板（skirt）・
// 内のふた（〜inner）・欄干の板（panel）・外のふた（〜outer）・外の箱の側板。手すりは段の角の線の rail m 上、くしの外 newel m まで出て
// 半径 newelR の半円で下へ回る。段は pitch m おき（踏面 tread・蹴上げ riser）で、時刻とともに動く（addEscalatorSteps。campus3dEscalator）
export const ESC = { skirt: 0.025, inner: 0.1, panel: 0.11, outer: 0.3, deck: 0.3, rail: 0.9, railT: 0.07, railW: 0.08, pitch: 0.406, tread: 0.4, riser: 0.205, newelR: 0.42 };
const ESC_LIFT = 0.008; // 段の面を床の面から浮かす m（addEscalatorSteps）
export function escalatorGeom(e, zf) {
  const [A, B] = e.coords.map(toXY);
  const zA = zf + (e.z0 || 0);
  const d = sub(B, A);
  const L = len(d) || 1e-3;
  const u = [d[0] / L, d[1] / L];
  const n = [-u[1], u[0]];
  const rise = Math.max(0.1, e.rise);
  const fl = e.flats || [1.2, 1.4];
  const c0 = Math.min(fl[0], L * 0.3), c1 = L - Math.min(fl[1], L * 0.3);
  const k = rise / Math.max(0.5, c1 - c0);
  const w = Math.max(0.05, Math.min(0.8, c0 * 0.9, (L - c1) * 0.9, (c1 - c0) / 2));
  const zLine = (sv) => {
    if (sv <= c0 - w) return 0;
    if (sv < c0 + w) return (k * (sv - c0 + w) ** 2) / (4 * w);
    if (sv <= c1 - w) return k * (sv - c0);
    if (sv < c1 + w) return rise - (k * (c1 + w - sv) ** 2) / (4 * w);
    return rise;
  };
  const slope = (sv) => {
    if (sv <= c0 - w || sv >= c1 + w) return 0;
    if (sv < c0 + w) return (k * (sv - c0 + w)) / (2 * w);
    if (sv <= c1 - w) return k;
    return (k * (c1 + w - sv)) / (2 * w);
  };
  const hs = (e.width || 1) / 2;
  const P = (sv, lv) => [A[0] + u[0] * sv + n[0] * lv, A[1] + u[1] * sv + n[1] * lv];
  const local = (x, y) => [(x - A[0]) * u[0] + (y - A[1]) * u[1], (x - A[0]) * n[0] + (y - A[1]) * n[1]];
  const dirSign = e.dir === "down" ? -1 : e.dir === "stop" ? 0 : 1;
  return { A, B, zA, L, u, n, rise, c0, c1, k, w, zLine, slope, hs, P, local, newel: e.newel ?? 0.9, dirSign, speed: e.speed ?? 0.5, panel: e.panel || "glass" };
}
// sv の点の並び（a〜b。曲がりのところは細かく）
function escSamples(G, a, b) {
  const out = [a];
  let s = a;
  while (s < b - 1e-6) {
    const curve = Math.abs(s - G.c0) < G.w + 0.1 || Math.abs(s - G.c1) < G.w + 0.1;
    s = Math.min(b, s + (curve ? 0.1 : 0.5));
    out.push(s);
  }
  return out;
}
// 縦の帯（横の位置 lv、sv の並び ss の下 zb(sv)・上 zt(sv)）。向き sg（+1 は左＝n の向き）
function escWall(m, G, ss, lv, zb, zt, sg, c) {
  const nn = [G.n[0] * sg, G.n[1] * sg, 0];
  for (let i = 0; i + 1 < ss.length; i++) {
    const a = ss[i], b = ss[i + 1];
    face(m, [[G.P(a, lv), zb(a)], [G.P(b, lv), zb(b)], [G.P(b, lv), zt(b)], [G.P(a, lv), zt(a)]], nn, c);
  }
}
// 横の帯（lv0〜lv1、高さ z0(sv)・z1(sv)）
function escTop(m, G, ss, lv0, lv1, z0, z1, c, nrm = [0, 0, 1]) {
  for (let i = 0; i + 1 < ss.length; i++) {
    const a = ss[i], b = ss[i + 1];
    face(m, [[G.P(a, lv0), z0(a)], [G.P(b, lv0), z0(b)], [G.P(b, lv1), z1(b)], [G.P(a, lv1), z1(a)]], nrm, c);
  }
}
// 手すりの通り道（[sv, z] の折れ線。下の端の半円 → 斜め → 上の端の半円）。z は手すりのまん中の高さ（標高）
function escRailPath(G) {
  const R = ESC.newelR;
  const top = ESC.rail + ESC.railT / 2;
  const Z = (sv) => G.zA + G.zLine(Math.min(G.L, Math.max(0, sv)));
  const out = [];
  const sb = -G.newel + R, st = G.L + G.newel - R;
  const cb = [sb, G.zA + top - R], ct = [st, G.zA + G.rise + top - R];
  for (let k = 0; k <= 10; k++) {
    const a = Math.PI * (1.5 - k / 10); // 270° → 90°（外を回って上へ）
    out.push([cb[0] + R * Math.cos(a), cb[1] + R * Math.sin(a)]);
  }
  for (const s of escSamples(G, sb, st)) if (s > sb + 1e-6 && s < st - 1e-6) out.push([s, Z(s) + top]);
  for (let k = 0; k <= 10; k++) {
    const a = Math.PI * (0.5 - k / 10); // 90° → −90°
    out.push([ct[0] + R * Math.cos(a), ct[1] + R * Math.sin(a)]);
  }
  return { pts: out, cb, ct, R };
}
// 動かない部分：欄干（ガラスかステンレスの板・黒い手すり）・くしの横の板・ふた・外の箱・乗り口の床の板とくし・段の下の暗いところ
export function addEscalator(M, e, zf, T, tint) {
  const { m, glassy } = M;
  const G = escalatorGeom(e, zf);
  const { zA, L, hs, newel } = G;
  const Z = (sv) => zA + G.zLine(Math.min(L, Math.max(0, sv)));
  const all = escSamples(G, -newel, L + newel);
  const mid = escSamples(G, 0, L);
  const steel = T("escClad"), deck = T("escDeck"), skirt = T("escSkirt");
  const rp = escRailPath(G);
  const panelC = G.panel === "steel" ? T("escClad") : tint(hex(PAL.glassBal, 0.5));
  for (const sg of [1, -1]) {
    const lv = (d) => sg * (hs + d);
    // くしの横の板（段の面の 0.12m 下〜0.22m 上）と、内のふた（斜め）。乗り口の外（くしの外）は床から
    escWall(m, G, all, lv(ESC.skirt), (s) => (s < 0 || s > L ? Z(s) : Z(s) - 0.12), (s) => Z(s) + 0.22, -sg, skirt);
    escTop(m, G, all, lv(ESC.skirt), lv(ESC.inner), (s) => Z(s) + 0.22, (s) => Z(s) + ESC.deck, deck, [-G.n[0] * sg * 0.6, -G.n[1] * sg * 0.6, 0.8]);
    // 欄干の板（手すりの下の縁まで。両端は半円の中）
    const pTop = (s) => Z(s) + ESC.rail;
    const pBot = (s) => Z(s) + ESC.deck;
    const ps = all.filter((s) => s >= -newel + rp.R - 1e-6 && s <= L + newel - rp.R + 1e-6);
    const pl = lv(ESC.panel);
    const nn = [G.n[0] * sg, G.n[1] * sg, 0];
    const panelQuad = (q) => {
      if (G.panel === "steel") {
        face(m, q, nn, panelC);
        face(m, q.map(([p, z]) => [[p[0] - G.n[0] * sg * 0.02, p[1] - G.n[1] * sg * 0.02], z]), [-nn[0], -nn[1], 0], panelC);
      } else glassy.quad(q, nn, panelC);
    };
    for (let i = 0; i + 1 < ps.length; i++) {
      const a = ps[i], b = ps[i + 1];
      panelQuad([[G.P(a, pl), pBot(a)], [G.P(b, pl), pBot(b)], [G.P(b, pl), pTop(b)], [G.P(a, pl), pTop(a)]]);
    }
    // 両端の半円の板（中心から手すりの内の縁まで）
    for (const [c, a0, a1] of [[rp.cb, 1.5, 0.5], [rp.ct, 0.5, -0.5]]) {
      const r = rp.R - ESC.railT / 2;
      for (let k = 0; k < 10; k++) {
        const t0 = Math.PI * (a0 + ((a1 - a0) * k) / 10), t1 = Math.PI * (a0 + ((a1 - a0) * (k + 1)) / 10);
        panelQuad([[G.P(c[0], pl), c[1]], [G.P(c[0] + r * Math.cos(t0), pl), c[1] + r * Math.sin(t0)], [G.P(c[0] + r * Math.cos(t1), pl), c[1] + r * Math.sin(t1)], [G.P(c[0], pl), c[1]]]);
      }
    }
    // 外のふた（平ら）と外の箱の側板（下の床から）
    escTop(m, G, all, lv(ESC.panel + 0.012), lv(ESC.outer), (s) => Z(s) + ESC.deck, (s) => Z(s) + ESC.deck - 0.02, deck);
    escWall(m, G, all, lv(ESC.outer), () => zA, (s) => Z(s) + ESC.deck - 0.02, sg, steel);
    // 端の面（外のふたの高さまでの箱）
    for (const s of [-newel, L + newel]) {
      const zb = s < 0 ? zA : zA + G.rise;
      const en = s < 0 ? [-G.u[0], -G.u[1], 0] : [G.u[0], G.u[1], 0];
      face(m, [[G.P(s, lv(ESC.skirt)), zb], [G.P(s, lv(ESC.outer)), zb], [G.P(s, lv(ESC.outer)), zb + ESC.deck], [G.P(s, lv(ESC.skirt)), zb + ESC.deck]], en, steel);
    }
    // 黒い手すり（通り道に沿った帯：外・内・両わき）
    const hand = T("escHand");
    const pts = rp.pts;
    const hw = ESC.railW / 2, ht = ESC.railT / 2;
    const lc = sg * (hs + ESC.panel);
    for (let i = 0; i + 1 < pts.length; i++) {
      const [s0, z0] = pts[i], [s1, z1] = pts[i + 1];
      const dl = Math.hypot(s1 - s0, z1 - z0) || 1;
      const ns = -(z1 - z0) / dl, nz = (s1 - s0) / dl; // 通り道の左（上）へ
      const C = (s, z, a, b) => [G.P(s + ns * b, lc + a), z + nz * b];
      const q = (a0, b0, a1, b1) => [C(s0, z0, a0, b0), C(s1, z1, a0, b0), C(s1, z1, a1, b1), C(s0, z0, a1, b1)];
      face(m, q(-hw, ht, hw, ht), [0, 0, 1], hand);
      face(m, q(-hw, -ht, hw, -ht), [0, 0, -1], hand);
      face(m, q(hw, -ht, hw, ht), [G.n[0], G.n[1], 0], hand);
      face(m, q(-hw, -ht, -hw, ht), [-G.n[0], -G.n[1], 0], hand);
    }
  }
  // 乗り口の床の板（ステンレス）と、くしの黄色い線・板の溝
  const plate = T("escPlate"), comb = T("escComb");
  for (const [s0, s1, z, cs] of [[-newel, 0, zA, -0.07], [L, L + newel, zA + G.rise, L]]) {
    face(m, [[G.P(s0, -hs - ESC.skirt), z + 0.012], [G.P(s1, -hs - ESC.skirt), z + 0.012], [G.P(s1, hs + ESC.skirt), z + 0.012], [G.P(s0, hs + ESC.skirt), z + 0.012]], [0, 0, 1], plate);
    face(m, [[G.P(cs, -hs), z + 0.016], [G.P(cs + 0.07, -hs), z + 0.016], [G.P(cs + 0.07, hs), z + 0.016], [G.P(cs, hs), z + 0.016]], [0, 0, 1], comb);
    for (let k = 1; k < 6; k++) {
      const sv = s0 + ((s1 - s0) * k) / 6;
      face(m, [[G.P(sv - 0.006, -hs), z + 0.014], [G.P(sv + 0.006, -hs), z + 0.014], [G.P(sv + 0.006, hs), z + 0.014], [G.P(sv - 0.006, hs), z + 0.014]], [0, 0, 1], skirt);
    }
  }
  // 段の下の暗いところ（段と段のすき間から見える）
  escTop(m, G, mid, -hs, hs, (s) => Z(s) - 0.3, (s) => Z(s) - 0.3, T("escPit"));
}
// 段（動く）：時刻 t（秒）の段の並び。段の角の線に沿った長さ λ で pitch m おき、dirSign × speed で進む
export function addEscalatorSteps(m, G, t, T = (k) => COL[k]) {
  const { L, hs, P, zLine, zA } = G;
  if (!G.tab) {
    const N = Math.max(8, Math.ceil(L / 0.05));
    const sv = [], lam = [];
    let acc = 0, pz = zLine(0);
    for (let i = 0; i <= N; i++) {
      const s = (L * i) / N, z = zLine(s);
      if (i) acc += Math.hypot(L / N, z - pz);
      sv.push(s);
      lam.push(acc);
      pz = z;
    }
    G.tab = { sv, lam, total: acc };
  }
  const { sv: SV, lam: LAM, total } = G.tab;
  const svAt = (l) => {
    let lo = 0, hi = LAM.length - 1;
    while (hi - lo > 1) {
      const mi = (lo + hi) >> 1;
      if (LAM[mi] <= l) lo = mi;
      else hi = mi;
    }
    const f = (l - LAM[lo]) / (LAM[hi] - LAM[lo] || 1);
    return SV[lo] + (SV[hi] - SV[lo]) * f;
  };
  const pitch = ESC.pitch;
  const phase = (((G.dirSign * G.speed * t) % pitch) + pitch) % pitch;
  const tread = T("escTread"), riser = T("escRiser"), line = T("escLine");
  const up = [0, 0, 1], back = [-G.u[0], -G.u[1], 0];
  for (let l = phase; l <= total + 1e-6; l += pitch) {
    const s = svAt(Math.min(l, total));
    // 段の面は床の面より ESC_LIFT 上（下の平らなところで段がホームの床と同じ高さになり、床と取り合って模様のように欠けていた。
    // 2026-11-12、ユーザーの目印 13・14「表示がおかしくなってる」）。乗り口の板（+0.012）・くし（+0.016）より下
    const z = zA + zLine(s) + ESC_LIFT;
    const s1 = Math.min(L, s + ESC.tread);
    if (s1 - s < 0.03) continue;
    face(m, [[P(s, -hs), z], [P(s1, -hs), z], [P(s1, hs), z], [P(s, hs), z]], up, tread);
    // 黄色い線：前の縁と両わき
    const zl = z + 0.003;
    const sl = Math.min(s1, s + 0.045);
    face(m, [[P(s, -hs), zl], [P(sl, -hs), zl], [P(sl, hs), zl], [P(s, hs), zl]], up, line);
    for (const sg of [1, -1]) {
      const a = sg * (hs - 0.04), b = sg * hs;
      face(m, [[P(sl, a), zl], [P(s1, a), zl], [P(s1, b), zl], [P(sl, b), zl]], up, line);
    }
    if (s > 0.02) face(m, [[P(s, hs), z - ESC.riser], [P(s, -hs), z - ESC.riser], [P(s, -hs), z], [P(s, hs), z]], back, riser);
  }
}

// 踊り場のある石の階段（階の flights）：A（いちばん下の蹴上げのまん中）→ B（いちばん上の段の角＝上の階の床のふち）。runs（流れごとの
// 蹴上げの数）、landings（流れのあいだの踊り場の長さ）。踏面の奥行き Tr は残りの長さを踏面の数（流れごとに蹴上げ − 1）で割ったもの。
// steps：段と踊り場の並び { s0, s1, z（上の面。A の床から）, riser（下からの蹴上げの番号）, land（踊り場の番号） }。いちばん上の蹴上げは B
export function flightGeom(s, zf) {
  const [A, B] = s.coords.map(toXY);
  const zA = zf + (s.z0 || 0);
  const d = sub(B, A);
  const L = len(d) || 1e-3;
  const u = [d[0] / L, d[1] / L];
  const n = [-u[1], u[0]];
  const runs = s.runs?.length ? s.runs : [Math.max(1, Math.round(s.rise / 0.17))];
  const landings = runs.slice(1).map((_, i) => s.landings?.[i] ?? 1.5);
  const nR = runs.reduce((a, b) => a + b, 0);
  const R = s.rise / nR;
  const nT = runs.reduce((a, b) => a + b - 1, 0);
  const Tr = (L - landings.reduce((a, b) => a + b, 0)) / Math.max(1, nT);
  const steps = [];
  let sv = 0, k = 0;
  runs.forEach((nr, fi) => {
    for (let j = 0; j < nr - 1; j++) {
      k++;
      steps.push({ s0: sv, s1: sv + Tr, z: k * R, riser: k - 1, flight: fi });
      sv += Tr;
    }
    k++;
    if (fi < runs.length - 1) {
      steps.push({ s0: sv, s1: sv + landings[fi], z: k * R, riser: k - 1, flight: fi, land: fi });
      sv += landings[fi];
    }
  });
  const hw = s.width / 2;
  const P = (a, l) => [A[0] + u[0] * a + n[0] * l, A[1] + u[1] * a + n[1] * l];
  const local = (x, y) => [(x - A[0]) * u[0] + (y - A[1]) * u[1], (x - A[0]) * n[0] + (y - A[1]) * n[1]];
  const topAt = (x, y) => {
    const [a, l] = local(x, y);
    if (a < -1e-6 || a > L + 1e-6 || Math.abs(l) > hw + 1e-6) return null;
    for (const st of steps) if (a < st.s1) return zA + st.z;
    return zA + s.rise;
  };
  // 段の角の線（手すりの高さの基準。流れごとに段の角を通る斜めの線、踊り場は平ら。下と上は 0.3m 平らに出す）
  const nose = [[-Tr - 0.3, 0], [-Tr, 0]];
  let s0 = 0, zb = 0;
  runs.forEach((nr, fi) => {
    const sEnd = s0 + (nr - 1) * Tr, zEnd = zb + nr * R;
    nose.push([sEnd, zEnd]);
    if (fi < runs.length - 1) {
      nose.push([sEnd + landings[fi] - Tr, zEnd]);
      s0 = sEnd + landings[fi];
      zb = zEnd;
    }
  });
  nose.push([L + 0.3, s.rise]);
  const noseAt = (a) => {
    if (a <= nose[0][0]) return nose[0][1];
    for (let i = 0; i + 1 < nose.length; i++) if (a <= nose[i + 1][0]) return nose[i][1] + ((nose[i + 1][1] - nose[i][1]) * (a - nose[i][0])) / (nose[i + 1][0] - nose[i][0] || 1);
    return nose[nose.length - 1][1];
  };
  return { A, B, zA, L, u, n, R, Tr, steps, hw, P, local, topAt, nose, noseAt, rise: s.rise, runs, landings };
}
// 床の矢印（角の丸い暗い四角に矢印。c：中心、dir：矢印の向き（平面の単位ベクトル）、a：四角の大きさ）
function addFloorArrow(m, c, dir, a, z, fg, bg) {
  const v = [-dir[1], dir[0]];
  const Q = (x, y) => [c[0] + dir[0] * x + v[0] * y, c[1] + dir[1] * x + v[1] * y];
  const up = [0, 0, 1];
  const h = a / 2, r = a * 0.12;
  m.polygon([[Q(-h + r, -h), Q(h - r, -h), Q(h, -h + r), Q(h, h - r), Q(h - r, h), Q(-h + r, h), Q(-h, h - r), Q(-h, -h + r)]], z, up, bg);
  face(m, [[Q(-h * 0.62, -a * 0.075), z + 0.002], [Q(h * 0.05, -a * 0.075), z + 0.002], [Q(h * 0.05, a * 0.075), z + 0.002], [Q(-h * 0.62, a * 0.075), z + 0.002]], up, fg);
  m.polygon([[Q(h * 0.62, 0), Q(-h * 0.02, -h * 0.5), Q(-h * 0.02, h * 0.5)]], z + 0.002, up, fg);
}
export function addFlight(M, s, zf, T, tint, cutTop = Infinity) {
  const { m, glassy } = M;
  const G = flightGeom(s, zf);
  const { zA, R, steps, hw, P, u, n, L } = G;
  const tread = T("stairTread"), riser = T("stairRiser"), side = T("stairSide"), nose = T("stairNose");
  const yel = T("markYellow"), red = T("markRed"), pink = T("riserPink");
  const up = [0, 0, 1], back = [-u[0], -u[1], 0];
  const marks = (s0, z, withTop) => {
    for (const sg of [1, -1]) {
      for (const [a, b, c] of [[0.05, 0.16, yel], [0.16, 0.27, red]]) {
        const la = sg * (hw - a), lb = sg * (hw - b);
        if (withTop) face(m, [[P(s0, la), z + 0.003], [P(s0 + 0.045, la), z + 0.003], [P(s0 + 0.045, lb), z + 0.003], [P(s0, lb), z + 0.003]], up, c);
        face(m, [[P(s0 - 0.003, lb), z - 0.035], [P(s0 - 0.003, la), z - 0.035], [P(s0 - 0.003, la), z + (withTop ? 0 : 0.012)], [P(s0 - 0.003, lb), z + (withTop ? 0 : 0.012)]], back, c);
      }
    }
  };
  for (const st of steps) {
    const z = zA + st.z;
    if (z > cutTop + 1e-6) break;
    face(m, [[P(st.s0, -hw), z], [P(st.s1, -hw), z], [P(st.s1, hw), z], [P(st.s0, hw), z]], up, tread);
    face(m, [[P(st.s0, hw), z - R], [P(st.s0, -hw), z - R], [P(st.s0, -hw), z], [P(st.s0, hw), z]], back, riser);
    // 段の角の細い線（すべり止め）と、両はしの黄と赤の印
    face(m, [[P(st.s0, -hw), z + 0.002], [P(st.s0 + 0.025, -hw), z + 0.002], [P(st.s0 + 0.025, hw), z + 0.002], [P(st.s0, hw), z + 0.002]], up, nose);
    if (s.marks) marks(st.s0, z, true);
    // ピンクの帯（広告。左右は上る向きに見て左から幅の割合）
    for (const [ri, f0, f1] of s.bands || []) {
      if (ri !== st.riser) continue;
      const la = hw - f0 * 2 * hw, lb = hw - f1 * 2 * hw;
      face(m, [[P(st.s0 - 0.004, lb), z - R + 0.025], [P(st.s0 - 0.004, la), z - R + 0.025], [P(st.s0 - 0.004, la), z - 0.04], [P(st.s0 - 0.004, lb), z - 0.04]], back, pink);
    }
    // 両わきの面（床まで）
    for (const sg of [1, -1]) face(m, [[P(st.s0, sg * hw), zA], [P(st.s1, sg * hw), zA], [P(st.s1, sg * hw), z], [P(st.s0, sg * hw), z]], [n[0] * sg, n[1] * sg, 0], side);
  }
  // いちばん上の蹴上げ（上の階の床のふち）
  const zTop = zA + G.rise;
  face(m, [[P(L, hw), zTop - R], [P(L, -hw), zTop - R], [P(L, -hw), zTop], [P(L, hw), zTop]], back, riser);
  if (s.marks) marks(L, zTop, false);
  for (const [ri, f0, f1] of s.bands || []) {
    if (ri !== G.runs.reduce((a, b) => a + b, 0) - 1) continue;
    const la = hw - f0 * 2 * hw, lb = hw - f1 * 2 * hw;
    face(m, [[P(L - 0.004, lb), zTop - R + 0.025], [P(L - 0.004, la), zTop - R + 0.025], [P(L - 0.004, la), zTop - 0.04], [P(L - 0.004, lb), zTop - 0.04]], back, pink);
  }
  // 踊り場の床の矢印
  for (const [li, fr, dsg] of s.arrows || []) {
    const st = steps.find((q) => q.land === li);
    if (!st) continue;
    const c = P((st.s0 + st.s1) / 2, hw - fr * 2 * hw);
    addFloorArrow(m, c, [u[0] * dsg, u[1] * dsg], 0.5, zA + st.z + 0.004, T("arrowFg"), T("arrowBg"));
  }
  // 点字ブロック（下の床と上の床。段から 0.3m あけて 0.6m）
  if (s.tactile) {
    const tc = T("tactile");
    face(m, [[P(-0.9, -hw), zA + 0.006], [P(-0.3, -hw), zA + 0.006], [P(-0.3, hw), zA + 0.006], [P(-0.9, hw), zA + 0.006]], up, tc);
    face(m, [[P(L + 0.3, -hw), zTop + 0.018], [P(L + 0.9, -hw), zTop + 0.018], [P(L + 0.9, hw), zTop + 0.018], [P(L + 0.3, hw), zTop + 0.018]], up, tc);
  }
  // 手すり：wall2 壁の 2 段（0.85m・0.65m）と壁からの支え、frost すりガラスの仕切り（段の角の線の 0.15m 下〜0.95m 上）とステンレスの丸い笠木（1.0m）・柱
  const railC = T("railSteel");
  (s.rails || []).forEach((k, i) => {
    if (!k) return;
    const sg = i === 0 ? 1 : -1;
    const pts = G.nose;
    if (k === "wall2") {
      const lv = sg * (hw - 0.07);
      for (const h of [0.85, 0.65]) {
        for (let j = 0; j + 1 < pts.length; j++) bar(m, [P(pts[j][0], lv), zA + pts[j][1] + h], [P(pts[j + 1][0], lv), zA + pts[j + 1][1] + h], 0.04, railC);
      }
      for (let sv = pts[0][0] + 0.2; sv < pts[pts.length - 1][0]; sv += 1.2) {
        for (const h of [0.82, 0.62]) bar(m, [P(sv, lv), zA + G.noseAt(sv) + h], [P(sv, sg * (hw + 0.02)), zA + G.noseAt(sv) + h], 0.025, railC);
      }
    } else if (k === "frost") {
      const lv = sg * (hw + 0.03);
      const fc = tint(hex(PAL.frost, 0.5));
      const nn = [n[0] * sg, n[1] * sg, 0];
      for (let j = 0; j + 1 < pts.length; j++) {
        const a0 = Math.max(pts[j][0], -0.2), b0 = Math.min(pts[j + 1][0], L + 0.2);
        if (b0 <= a0 + 1e-3) continue;
        const za = zA + G.noseAt(a0), zb = zA + G.noseAt(b0);
        for (const dd of [0, 0.012]) {
          const l2 = lv + (i === 0 ? dd : -dd);
          glassy.quad([[P(a0, l2), za - 0.15], [P(b0, l2), zb - 0.15], [P(b0, l2), zb + 0.95], [P(a0, l2), za + 0.95]], nn, fc);
        }
        bar(m, [P(a0, lv), za + 1.0], [P(b0, lv), zb + 1.0], 0.05, railC);
      }
      for (let sv = -0.2; sv <= L + 0.2 + 1e-6; sv += 1.4) {
        const z = zA + G.noseAt(sv);
        bar(m, [P(sv, lv), z - 0.15], [P(sv, lv), z + 1.0], 0.045, railC);
      }
    }
  });
}

// 壁の小さなタイル：区間 pc の両面に、壁の面から少し浮かせて（目地の線・白っぽい縦の帯）。z0a・z0b・z1a・z1b：貼る下と上（区間の両端の標高）、
// tw・th：タイルの幅・高さ、band：[幅, 間隔]（縦の帯）
function addSmallTiles(m, pc, t, z0a, z0b, z1a, z1b, T, { tw = 0.1, th = 0.15, tile = "mtile", grout = "mtileGrout", band = null, bandC = "mtileBand", bandGrout = "mtileBandGrout" } = {}) {
  const L = len(sub(pc.b, pc.a));
  if (L < 0.05) return;
  const u = [(pc.b[0] - pc.a[0]) / L, (pc.b[1] - pc.a[1]) / L];
  const nl = [-u[1], u[0]];
  const lo = (s) => z0a + ((z0b - z0a) * s) / L, hi = (s) => z1a + ((z1b - z1a) * s) / L;
  const bands = [];
  if (band) for (let s = band[1] * 0.5; s < L; s += band[1]) bands.push([Math.max(0, s), Math.min(L, s + band[0])]);
  const inBand = (s) => bands.some(([a, b]) => s >= a && s <= b);
  const g = 0.008;
  for (const sg of [1, -1]) {
    const nn = [nl[0] * sg, nl[1] * sg, 0];
    const Q = (o) => (s, z) => [[pc.a[0] + u[0] * s + nl[0] * sg * o, pc.a[1] + u[1] * s + nl[1] * sg * o], z];
    const q1 = Q(t / 2 + 0.002), q2 = Q(t / 2 + 0.004), q3 = Q(t / 2 + 0.006);
    face(m, [q1(0, lo(0)), q1(L, lo(L)), q1(L, hi(L)), q1(0, hi(0))], nn, T(tile));
    for (const [s0, s1] of bands) face(m, [q2(s0, lo(s0)), q2(s1, lo(s1)), q2(s1, hi(s1)), q2(s0, hi(s0))], nn, T(bandC));
    // 横の目地（th おき。壁の下と上の線のあいだだけ）
    const zMin = Math.min(z0a, z0b), zMax = Math.max(z1a, z1b);
    for (let z = Math.ceil((zMin + 0.001) / th) * th; z < zMax; z += th) {
      // 区間の中で z が下と上のあいだにある部分
      const segs = [];
      const N = 8;
      let open = null;
      for (let i = 0; i <= N; i++) {
        const s = (L * i) / N;
        const inside = z > lo(s) + 0.005 && z < hi(s) - 0.005;
        if (inside && open == null) open = s;
        if ((!inside || i === N) && open != null) {
          segs.push([open, inside ? s : Math.max(open, s - L / N)]);
          open = null;
        }
      }
      for (const [s0, s1] of segs) if (s1 > s0 + 0.01) face(m, [q3(s0, z - g / 2), q3(s1, z - g / 2), q3(s1, z + g / 2), q3(s0, z + g / 2)], nn, T(grout));
    }
    for (let s = tw; s < L - 0.01; s += tw) face(m, [q3(s - g / 2, lo(s)), q3(s + g / 2, lo(s)), q3(s + g / 2, hi(s)), q3(s - g / 2, hi(s))], nn, T(inBand(s) ? bandGrout : grout));
  }
}
// 打ち放しのコンクリートの P コンの穴（両面。横 0.9m・縦 0.6m おき、径 0.035m の暗い点。壁の下と上の線のあいだだけ）
function addTieHoles(m, pc, t, z0a, z0b, z1a, z1b, col) {
  const L = len(sub(pc.b, pc.a));
  if (L < 0.3) return;
  const u = [(pc.b[0] - pc.a[0]) / L, (pc.b[1] - pc.a[1]) / L];
  const nl = [-u[1], u[0]];
  const lo = (s) => z0a + ((z0b - z0a) * s) / L, hi = (s) => z1a + ((z1b - z1a) * s) / L;
  const r = 0.0175;
  const s0 = ((L % 0.9) || 0.9) / 2;
  for (const sg of [1, -1]) {
    const nn = [nl[0] * sg, nl[1] * sg, 0];
    const Q = (s, z) => [[pc.a[0] + u[0] * s + nl[0] * sg * (t / 2 + 0.003), pc.a[1] + u[1] * s + nl[1] * sg * (t / 2 + 0.003)], z];
    for (let s = s0; s < L - 0.1; s += 0.9) {
      for (let z = Math.ceil((lo(s) + 0.25) / 0.6) * 0.6; z < hi(s) - 0.2; z += 0.6) face(m, [Q(s - r, z - r), Q(s + r, z - r), Q(s + r, z + r), Q(s - r, z + r)], nn, col);
    }
  }
}
// 木の縦の格子：暗い板（両面）の前に、幅 0.06・奥行き 0.09 の木の棒を 0.16m おき
function addSlatWall(m, pc, t, ba, bb, ta, tb, T) {
  segBox(m, pc.a, pc.b, t, ba, bb, ta, tb, T("slatBack"));
  const L = len(sub(pc.b, pc.a));
  if (L < 0.1) return;
  const u = [(pc.b[0] - pc.a[0]) / L, (pc.b[1] - pc.a[1]) / L];
  const nl = [-u[1], u[0]];
  const c = T("slatWood");
  for (const sg of [1, -1]) {
    for (let s = 0.08; s < L - 0.03; s += 0.16) {
      const z0 = ba + ((bb - ba) * s) / L, z1 = ta + ((tb - ta) * s) / L;
      const o0 = sg * (t / 2), o1 = sg * (t / 2 + 0.09);
      const p = (ds, o) => [pc.a[0] + u[0] * (s + ds) + nl[0] * o, pc.a[1] + u[1] * (s + ds) + nl[1] * o];
      prismPoly(m, [p(-0.03, o0), p(0.03, o0), p(0.03, o1), p(-0.03, o1)], z0, z1, c, { top: false });
    }
  }
}

// 物の前の面（1 本目の辺。形のまん中から外へ向く）：{ a, b, u（a → b）, nf（外への向き）, L }
function frontOf(r) {
  const a = r[0], b = r[1];
  const L = len(sub(b, a)) || 1e-3;
  const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  let nf = [-u[1], u[0]];
  const c = centroid(r);
  const mid = lerp2(a, b, 0.5);
  if ((c[0] - mid[0]) * nf[0] + (c[1] - mid[1]) * nf[1] > 0) nf = [-nf[0], -nf[1]];
  return { a, b, u, nf, L };
}
// 前の面の上の四角（x：a から b へ m、z：標高、d：面から前へ m）
function frontQuad(m, F, x0, x1, z0, z1, d, c) {
  const P = (x) => [F.a[0] + F.u[0] * x + F.nf[0] * d, F.a[1] + F.u[1] * x + F.nf[1] * d];
  face(m, [[P(x0), z0], [P(x1), z0], [P(x1), z1], [P(x0), z1]], [F.nf[0], F.nf[1], 0], c);
}
const COL_HEX = (h) => hex(h, 0.5);
// 円柱（4 点の四角に内接。z0〜z1。色 c、split より上は c2）と足もとのステンレスの帯
function addCyl(m, r, z0, z1, c, c2, split, steel) {
  const ce = centroid(r);
  const R = Math.min(len(sub(r[1], r[0])), len(sub(r[2], r[1]))) / 2;
  const K = 28;
  const parts = c2 && split != null && split > z0 && split < z1 ? [[z0, split, c], [split, z1, c2]] : [[z0, z1, c]];
  const ring = (RR, za, zb, col) => {
    for (let k = 0; k < K; k++) {
      const a0 = (2 * Math.PI * k) / K, a1 = (2 * Math.PI * (k + 1)) / K;
      const p0 = [ce[0] + RR * Math.cos(a0), ce[1] + RR * Math.sin(a0)], p1 = [ce[0] + RR * Math.cos(a1), ce[1] + RR * Math.sin(a1)];
      const am = (a0 + a1) / 2;
      face(m, [[p0, za], [p1, za], [p1, zb], [p0, zb]], [Math.cos(am), Math.sin(am), 0], col);
    }
  };
  for (const [za, zb, col] of parts) ring(R, za, zb, col);
  ring(R + 0.008, z0, z0 + 0.1, steel);
}
// 自動改札機：長い辺が通る向き。足もと・胴（横の板の色）・上の暗い板・両はしの青く光る読み取り部と小さな画面・まん中の扉
function addGate(m, r, z0, T, sideC) {
  const e0 = len(sub(r[1], r[0])), e1 = len(sub(r[2], r[1]));
  const [a, b, , d] = e0 >= e1 ? r : [r[1], r[2], r[3], r[0]];
  const Lg = len(sub(b, a)) || 1;
  const u = [(b[0] - a[0]) / Lg, (b[1] - a[1]) / Lg];
  const W = len(sub(d, a)) || 0.2;
  const v = [(d[0] - a[0]) / W, (d[1] - a[1]) / W];
  const P = (x, y) => [a[0] + u[0] * x + v[0] * y, a[1] + u[1] * x + v[1] * y];
  const box = (x0, x1, y0, y1, za, zb, col, top = col) => prismPoly(m, [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], za, zb, top, { sideCol: col });
  box(0.05, Lg - 0.05, 0.02, W - 0.02, z0, z0 + 0.08, T("gateTop"));
  box(0.08, Lg - 0.08, 0, W, z0 + 0.08, z0 + 0.9, sideC, T("gateTop"));
  box(0.02, Lg - 0.02, -0.01, W + 0.01, z0 + 0.9, z0 + 1.0, T("gateTop"));
  for (const [x0, x1] of [[0.1, 0.32], [Lg - 0.32, Lg - 0.1]]) face(m, [[P(x0, 0.03), z0 + 1.004], [P(x1, 0.03), z0 + 1.004], [P(x1, W - 0.03), z0 + 1.004], [P(x0, W - 0.03), z0 + 1.004]], [0, 0, 1], T("gateRead"));
  for (const x of [0.4, Lg - 0.5]) box(x, x + 0.1, W * 0.2, W * 0.8, z0 + 1.0, z0 + 1.12, T("gateTop"), T("gateScreen"));
  for (const [y0, y1] of [[-0.2, 0], [W, W + 0.2]]) box(Lg * 0.5 - 0.03, Lg * 0.5 + 0.03, y0, y1, z0 + 0.55, z0 + 0.88, T("gateFlap"));
}
// コインロッカー：白い箱の前の面に扉の線（横 0.45m・縦 0.38m おき）と緑の小さな灯
function addLocker(m, r, z0, z1, T) {
  prismPoly(m, r, z0, z1, T("locker"), { sideCol: T("locker") });
  const F = frontOf(r);
  const line = T("lockerLine"), led = T("lockerLed");
  const nx = Math.max(1, Math.round(F.L / 0.45)), ny = Math.max(1, Math.round((z1 - z0 - 0.15) / 0.38));
  for (let i = 1; i < nx; i++) {
    const x = (F.L * i) / nx;
    frontQuad(m, F, x - 0.006, x + 0.006, z0 + 0.1, z1 - 0.05, 0.004, line);
  }
  for (let j = 0; j <= ny; j++) {
    const z = z0 + 0.1 + ((z1 - z0 - 0.15) * j) / ny;
    frontQuad(m, F, 0.02, F.L - 0.02, z - 0.006, z + 0.006, 0.004, line);
    if (j < ny) for (let i = 0; i < nx; i++) {
      const x = (F.L * (i + 0.85)) / nx;
      frontQuad(m, F, x - 0.015, x + 0.015, z + 0.2, z + 0.24, 0.006, led);
    }
  }
}
// 機械（券売機・精算機）：color の箱、前の面に暗い画面とお金の口
function addMachine(m, r, z0, z1, T, body) {
  prismPoly(m, r, z0, z1, body, { sideCol: body });
  const F = frontOf(r);
  const H = z1 - z0;
  frontQuad(m, F, F.L * 0.15, F.L * 0.85, z0 + H * 0.52, z0 + H * 0.8, 0.004, T("screenDark"));
  frontQuad(m, F, F.L * 0.2, F.L * 0.45, z0 + H * 0.38, z0 + H * 0.44, 0.004, T("gateTop"));
  frontQuad(m, F, F.L * 0.55, F.L * 0.8, z0 + H * 0.38, z0 + H * 0.44, 0.004, T("gateTop"));
}
// 券売機（2026-11-12、ユーザー「券売機も再現したい」）：明るい灰の箱、前の面の上に紺の帯（color2）、斜めに寝た画面（暗い面に青と白の
// ボタン）、右に硬貨・紙幣・カードの口と IC の読み取り（青）、下にきっぷとおつりの口。1 本目の辺の面が前
function addTvm(m, r, z0, z1, T, top) {
  const body = T("tvmBody");
  prismPoly(m, r, z0, z1, body, { sideCol: body });
  const F = frontOf(r);
  const H = z1 - z0, Wd = F.L;
  frontQuad(m, F, 0.02, Wd - 0.02, z1 - 0.2, z1 - 0.03, 0.004, top || T("tvmTop"));
  // 斜めの画面：下の端は前へ 0.12m、上の端は面の上（左の 3/4）
  const P = (x, d) => [F.a[0] + F.u[0] * x + F.nf[0] * d, F.a[1] + F.u[1] * x + F.nf[1] * d];
  const sx0 = 0.06, sx1 = Wd * 0.7, zb = z0 + H * 0.56, zt = z0 + H * 0.84;
  const nS = [F.nf[0] * 0.6, F.nf[1] * 0.6, 0.8];
  face(m, [[P(sx0, 0.13), zb], [P(sx1, 0.13), zb], [P(sx1, 0.01), zt], [P(sx0, 0.01), zt]], nS, T("tvmScreen"));
  // 画面の下の縁（前へ出た台）
  face(m, [[P(sx0, 0), zb - 0.04], [P(sx1, 0), zb - 0.04], [P(sx1, 0.13), zb], [P(sx0, 0.13), zb]], [F.nf[0], F.nf[1], 0.3], body);
  for (const x of [sx0, sx1]) face(m, [[P(x, 0), zb - 0.04], [P(x, 0.13), zb], [P(x, 0.01), zt], [P(x, 0), zt]], [F.u[0], F.u[1], 0], body);
  // 画面のボタン（3 行 × 2 列の青、上に白い帯）
  const lerpS = (fx, fz, dd) => { const d = 0.13 - (0.12 * fz) + dd; return [P(sx0 + (sx1 - sx0) * fx, d), zb + (zt - zb) * fz]; };
  const btn = (fx0, fz0, fx1, fz1, c) => face(m, [lerpS(fx0, fz0, 0.004), lerpS(fx1, fz0, 0.004), lerpS(fx1, fz1, 0.004), lerpS(fx0, fz1, 0.004)], nS, c);
  btn(0.08, 0.78, 0.92, 0.92, T("tvmMenu2"));
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) btn(0.1 + j * 0.42, 0.1 + i * 0.22, 0.46 + j * 0.42, 0.27 + i * 0.22, T("tvmMenu"));
  // 右の口：硬貨（細い横の口）・紙幣・カード、IC の読み取り
  const rx0 = Wd * 0.75, rx1 = Wd - 0.06;
  frontQuad(m, F, rx0, rx1, z0 + H * 0.74, z0 + H * 0.76, 0.006, T("tvmSlot"));
  frontQuad(m, F, rx0, rx1, z0 + H * 0.66, z0 + H * 0.685, 0.006, T("tvmSlot"));
  frontQuad(m, F, rx0 + 0.02, rx1 - 0.02, z0 + H * 0.6, z0 + H * 0.615, 0.006, T("tvmSlot"));
  frontQuad(m, F, rx0, rx1, z0 + H * 0.5, z0 + H * 0.56, 0.008, T("tvmIc"));
  // きっぷの口・おつりの口（下の暗いくぼみ）
  frontQuad(m, F, Wd * 0.2, Wd * 0.6, z0 + H * 0.36, z0 + H * 0.4, 0.005, T("tvmSlot"));
  frontQuad(m, F, Wd * 0.15, Wd * 0.85, z0 + H * 0.16, z0 + H * 0.26, 0.005, T("tvmTray"));
  // 足もとの暗い帯
  frontQuad(m, F, 0, Wd, z0, z0 + 0.08, 0.003, T("tvmSlot"));
}
// 額の広告・掲示板：額（color2）の中に紙（color）、紙の上に色の四角（紙ごと。いつも同じ並び）
function addPoster(m, r, z0, z1, T, it, tint) {
  const F = frontOf(r);
  const frame = it.color2 ? tint(COL_HEX(it.color2)) : T("posterFrame");
  const paper = it.color ? tint(COL_HEX(it.color)) : T("posterIn");
  prismPoly(m, r, z0, z1, frame, { sideCol: frame });
  frontQuad(m, F, 0.04, F.L - 0.04, z0 + 0.04, z1 - 0.04, 0.003, paper);
  const n = Math.max(1, Math.round(F.L / 0.75));
  const w = (F.L - 0.08) / n;
  const pal = ["#d24b5a", "#3e7cc4", "#f0c33c", "#5aa36a", "#8a5bb5", "#e98a3a", "#2b2f36", "#f5f3ee"];
  const seed = Math.round((F.a[0] + F.a[1]) * 10);
  const h = z1 - z0 - 0.08;
  for (let i = 0; i < n; i++) {
    const x0 = 0.04 + i * w + 0.03, x1 = 0.04 + (i + 1) * w - 0.03;
    const c1 = tint(COL_HEX(pal[Math.floor(hash2(seed, i) * pal.length)])), c2 = tint(COL_HEX(pal[Math.floor(hash2(seed + 7, i) * pal.length)]));
    frontQuad(m, F, x0, x1, z0 + 0.06 + h * 0.45, z0 + 0.04 + h * 0.95, 0.005, c1);
    frontQuad(m, F, x0, x0 + (x1 - x0) * 0.7, z0 + 0.06 + h * 0.18, z0 + 0.06 + h * 0.36, 0.005, c2);
  }
}

// ── Taki Plaza 2 階の小物（2026-11-13、ユーザー「小物も作って」。動画 IMG_1080）──
// 4 点の四角の 1 本目の辺が前（frontOf）。前から見て右の向きと、前の辺の前から見て左の端（字・形の左右）、前の辺から奥の辺までの長さ
const rightOf = (F) => [-F.nf[1], F.nf[0]];
const leftEnd = (F) => {
  const ux = rightOf(F);
  return (F.b[0] - F.a[0]) * ux[0] + (F.b[1] - F.a[1]) * ux[1] > 0 ? F.a : F.b;
};
const depthOf = (F, r) => Math.abs((r[2][0] - r[1][0]) * F.nf[0] + (r[2][1] - r[1][1]) * F.nf[1]);
const BOOK_PAL = ["#2f4f7f", "#b23a3a", "#e8e4d8", "#3c6e47", "#d9a441", "#5b4a7a", "#f2f0ea", "#1f2328", "#c96f2d", "#7aa6c9", "#e0c9a8", "#8c2f4b"];

// 描いたら true
function addSmallItem(m, it, r, z0, z1, T, tint, ctx) {
  if (it.kind === "cubeshelf" || it.kind === "openshelf") addShelfUnit(m, it, r, z0, z1, T, tint);
  else if (it.kind === "mathclock") addMathClockCase(m, it, r, z0, z1, T, tint, ctx.clocks);
  else if (it.kind === "woodcut") addWoodCut(m, it, r, z0, z1, T);
  else if (it.kind === "woodsign") addWoodSign(m, it, r, z0, z1, T, tint, ctx.text);
  else if (it.kind === "note") addNote(m, r, z0, z1, T, ctx.text);
  else if (it.kind === "stars") addStars(m, r, z0, z1, T);
  else if (it.kind === "stack") addStack(m, it, r, z0, z1, T, tint);
  else if (it.kind === "flapgate") addFlapGate(m, ctx.glassy || m, r, z0, z1, T);
  else if (it.kind === "secgate") addSecGate(m, ctx.glassy || m, r, z0, z1, T);
  else return false;
  return true;
}

// フラップゲート（図書館の入口。2026-11-13、動画 IMG_1077 の 145〜148・603〜604・864 秒）：4 点の四角の長い向きが通る向き。ステンレスの台
// （角を落とした箱）・暗いガラスの天板・天板のふちの青い灯・カードを読む青い板（両端）と、両わきの面に沿ってたたんだガラスの羽（開いた形。
// 歩く当たりは台の四角だけ）。z1 は台の高さ（なければ 1.0）
function addFlapGate(m, glassy, r, z0, z1, T) {
  const e0 = len(sub(r[1], r[0])), e1 = len(sub(r[2], r[1]));
  const [a, b, , d] = e0 >= e1 ? r : [r[1], r[2], r[3], r[0]];
  const L = len(sub(b, a)) || 1, W = len(sub(d, a)) || 0.2;
  const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], v = [(d[0] - a[0]) / W, (d[1] - a[1]) / W];
  const P = (x, y) => [a[0] + u[0] * x + v[0] * y, a[1] + u[1] * x + v[1] * y];
  const H = Math.max(0.6, Math.min(1.2, z1 - z0));
  const steel = T("gateSteel"), dark = T("gateSteelDark"), top = T("gateGlassTop"), blue = T("gateBlue"), reader = T("gateReader");
  const c = Math.min(0.06, W * 0.25); // 角の落とし
  const body = [P(c, 0), P(L - c, 0), P(L, c), P(L, W - c), P(L - c, W), P(c, W), P(0, W - c), P(0, c)];
  prismPoly(m, body, z0 + 0.04, z0 + H - 0.03, steel, { sideCol: steel });
  prismPoly(m, [P(0.03, 0.02), P(L - 0.03, 0.02), P(L - 0.03, W - 0.02), P(0.03, W - 0.02)], z0, z0 + 0.04, dark, { sideCol: dark });
  prismPoly(m, body, z0 + H - 0.03, z0 + H, top, { sideCol: top });
  // 天板のふちの青い灯（両わきの長い辺）と、両端のカードを読む板
  for (const y of [0, W]) {
    const o = y === 0 ? -1 : 1;
    face(m, [[P(c, y + o * 0.004), z0 + H - 0.05], [P(L - c, y + o * 0.004), z0 + H - 0.05], [P(L - c, y + o * 0.004), z0 + H - 0.025], [P(c, y + o * 0.004), z0 + H - 0.025]], [v[0] * o, v[1] * o, 0], blue);
  }
  for (const [x0, x1] of [[0.06, 0.26], [L - 0.26, L - 0.06]]) {
    face(m, [[P(x0, W * 0.2), z0 + H + 0.003], [P(x1, W * 0.2), z0 + H + 0.003], [P(x1, W * 0.8), z0 + H + 0.003], [P(x0, W * 0.8), z0 + H + 0.003]], [0, 0, 1], reader);
    face(m, [[P(x0 + 0.05, W * 0.35), z0 + H + 0.005], [P(x1 - 0.05, W * 0.35), z0 + H + 0.005], [P(x1 - 0.05, W * 0.65), z0 + H + 0.005], [P(x0 + 0.05, W * 0.65), z0 + H + 0.005]], [0, 0, 1], blue);
  }
  // たたんだガラスの羽（両わきの面から 0.02m 外、長さのまん中 0.55m、台の上 0.2m まで）と、羽の上のふちの青い灯
  const fx0 = L * 0.5 - 0.28, fx1 = L * 0.5 + 0.28;
  for (const y of [-0.025, W + 0.025]) {
    const o = y < 0 ? -1 : 1;
    glassy.quad([[P(fx0, y), z0 + 0.3], [P(fx1, y), z0 + 0.3], [P(fx1, y), z0 + H + 0.2], [P(fx0, y), z0 + H + 0.2]], [v[0] * o, v[1] * o, 0], GLASS);
    face(m, [[P(fx0, y), z0 + H + 0.18], [P(fx1, y), z0 + H + 0.18], [P(fx1, y), z0 + H + 0.2], [P(fx0, y), z0 + H + 0.2]], [v[0] * o, v[1] * o, 0], blue);
    face(m, [[P(fx1, y), z0 + H + 0.18], [P(fx0, y), z0 + H + 0.18], [P(fx0, y), z0 + H + 0.2], [P(fx1, y), z0 + H + 0.2]], [-v[0] * o, -v[1] * o, 0], blue);
  }
}
// 防犯ゲート（白い枠の板。図書館の入口。動画 600〜602 秒）：4 点の四角の長い向きが板の幅。両端の白い柱・上下の枠と、あいだの半透明の板
function addSecGate(m, glassy, r, z0, z1, T) {
  const e0 = len(sub(r[1], r[0])), e1 = len(sub(r[2], r[1]));
  const [a, b, , d] = e0 >= e1 ? r : [r[1], r[2], r[3], r[0]];
  const L = len(sub(b, a)) || 0.6, W = len(sub(d, a)) || 0.08;
  const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], v = [(d[0] - a[0]) / W, (d[1] - a[1]) / W];
  const P = (x, y) => [a[0] + u[0] * x + v[0] * y, a[1] + u[1] * x + v[1] * y];
  const wc = T("secWhite");
  const box = (x0, x1, za, zb) => prismPoly(m, [P(x0, 0), P(x1, 0), P(x1, W), P(x0, W)], za, zb, wc, { sideCol: wc, bottom: true });
  const pw = Math.min(0.07, L * 0.15);
  box(0, pw, z0, z1); box(L - pw, L, z0, z1);
  box(pw, L - pw, z1 - 0.07, z1); box(pw, L - pw, z0 + 0.08, z0 + 0.14);
  for (const o of [1, -1]) glassy.quad([[P(pw, W / 2), z0 + 0.14], [P(L - pw, W / 2), z0 + 0.14], [P(L - pw, W / 2), z1 - 0.07], [P(pw, W / 2), z1 - 0.07]], [v[0] * o, v[1] * o, 0], GLASS);
}

// 図書館の書架（附属図書館の地下。2026-11-13、動画 IMG_1077・パンフレットの平面図の細長い四角）：両面の鉄の書架。四角の長い向きに、
// 両端の板・まん中の背の板・足もとの板・段の板（rows 段。なければ 0.32m くらい）・天板と、両面の段ごとの本の並び（色の帯を前の面に。
// books の割合〔なければ 0.75〕。帯の長さ・高さ・色は位置で決まる乱数）。集密書架（すき間なく並んだ四角）も同じ
// 背表紙の色：動画（171 秒）では白・生成り・ベージュ・明るい灰が多く、濃い色はところどころ
const STACK_BOOKS = ["#f1ede2", "#e7e0cf", "#d9cfb8", "#ece9e2", "#c9c2b0", "#e3ddd0", "#b7aa8c", "#d4cbb6", "#f4f2ec", "#cfc8bb", "#3d4b63", "#7b3a3a", "#4b5e46", "#2b2d33", "#8a7d5c", "#5e6f86"];
function addStack(m, it, r, z0, z1, T, tint) {
  const e0 = len(sub(r[1], r[0])), e1 = len(sub(r[2], r[1]));
  const [a, b, , d] = e0 >= e1 ? r : [r[1], r[2], r[3], r[0]];
  const L = len(sub(b, a)), D = len(sub(d, a)), H = z1 - z0;
  if (L < 0.3 || D < 0.15 || H < 0.4) return;
  const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], v = [(d[0] - a[0]) / D, (d[1] - a[1]) / D];
  const P = (x, y) => [a[0] + u[0] * x + v[0] * y, a[1] + u[1] * x + v[1] * y];
  const box = (x0, x1, y0, y1, za, zb, c) => {
    if (!(x1 > x0 + 1e-4 && y1 > y0 + 1e-4 && zb > za + 1e-4)) return;
    prismPoly(m, [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], za, zb, c, { bottom: true });
  };
  const steel = T("stackSteel"), shelfC = T("stackShelf"), back = T("stackBack");
  const pt = 0.02, zb0 = z0 + 0.09, zt = z1 - 0.025;
  box(0, pt, 0, D, z0, z1, steel); // 両端の板
  box(L - pt, L, 0, D, z0, z1, steel);
  box(0, L, 0, D, zt, z1, steel); // 天板
  box(pt, L - pt, 0.03, D - 0.03, z0, zb0, back); // 足もと
  box(pt, L - pt, D / 2 - 0.01, D / 2 + 0.01, zb0, zt, back); // 背の板
  const rows = Math.max(1, Math.round(it.rows || (zt - zb0) / 0.32));
  const rh = (zt - zb0) / rows;
  const bk = it.books == null ? 0.75 : it.books;
  const seed = Math.round((a[0] * 13 + a[1] * 7) * 10);
  for (let k = 0; k < rows; k++) {
    const zs = zb0 + k * rh;
    if (k > 0) box(pt, L - pt, 0.01, D - 0.01, zs - 0.012, zs + 0.006, shelfC);
    // 本：両面（y = 0 の面は −v 向き、y = D の面は +v 向き）
    for (const side of [0, 1]) {
      const y = side ? D - 0.035 : 0.035;
      const nrm = side ? [v[0], v[1], 0] : [-v[0], -v[1], 0];
      let x = pt + 0.01;
      let j = 0;
      while (x < L - pt - 0.05) {
        const h1 = hash2(seed + k * 17 + side * 5, j);
        const w = 0.1 + h1 * 0.38;
        const x1 = Math.min(L - pt - 0.01, x + w);
        if (hash2(seed + j * 3 + side, k * 11) < bk) {
          const bh = Math.min(rh - 0.04, 0.17 + hash2(seed + j, k + side * 31) * 0.12);
          const hc = hash2(seed + j * 7 + side * 13, k);
          const c = tint(COL_HEX(hc < 0.78 ? STACK_BOOKS[Math.floor((hc / 0.78) * 10)] : STACK_BOOKS[10 + Math.floor(((hc - 0.78) / 0.22) * 6) % 6]));
          const q = [[P(x, y), zs + 0.008], [P(x1, y), zs + 0.008], [P(x1, y), zs + bh], [P(x, y), zs + bh]];
          face(m, side ? [q[1], q[0], q[3], q[2]] : q, nrm, c);
        }
        x = x1 + 0.004;
        j++;
      }
    }
  }
}

// 棚。cols 列 × rows 段の升（なければ 0.42m・0.4m くらい）
// cubeshelf（窓ぎわの本棚）：白い鉄の枠（前と後ろの柱、段ごとの前・後ろ・奥行きの枠）と木目の板（段の板・奥の板・両端の板）。升の仕切りの板は
//   ない（となりの升が見える）。books（0〜1）の割合の升に立てた本
// openshelf（Attic Studio の白い棚）：白い板（両端と仕切りの板・段の板・奥の板。double なら奥も開いた両面の棚）、引っこんだ足もと。
//   下から drawers 段は木の前板の引き出し（上のふちに取っ手）。top が "wood" なら木の天板
function addShelfUnit(m, it, r, z0, z1, T, tint) {
  const F = frontOf(r);
  const D = depthOf(F, r), L = F.L, H = z1 - z0;
  if (L < 0.2 || D < 0.1 || H < 0.2) return;
  const cols = Math.max(1, Math.round(it.cols || L / 0.42));
  const rows = Math.max(1, Math.round(it.rows || H / 0.4));
  const P = (x, y) => [F.a[0] + F.u[0] * x - F.nf[0] * y, F.a[1] + F.u[1] * x - F.nf[1] * y];
  const box = (x0, x1, y0, y1, za, zb, c, opt = {}) => {
    if (!(x1 > x0 + 1e-4 && y1 > y0 + 1e-4 && zb > za + 1e-4)) return;
    prismPoly(m, [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], za, zb, c, { bottom: true, ...opt });
  };
  const xi = (i) => (L * i) / cols;
  const seed = Math.round((F.a[0] * 7 + F.a[1] * 3) * 10);
  if (it.kind === "cubeshelf") {
    const steel = T("shelfSteel"), wood = T("shelfWood"), back = T("shelfBack");
    const t = 0.022, bt = 0.016, zb0 = z0 + 0.025; // 枠の太さ・板の厚さ・いちばん下の枠の高さ（脚）
    const zr = (k) => zb0 + ((z1 - t - zb0) * k) / rows; // k 段目の枠の下の面
    const xp = (i) => Math.min(L - t, Math.max(0, xi(i) - t / 2));
    for (let i = 0; i <= cols; i++) {
      box(xp(i), xp(i) + t, 0, t, z0, z1, steel);
      box(xp(i), xp(i) + t, D - t, D, z0, z1, steel);
    }
    for (let k = 0; k <= rows; k++) {
      const z = zr(k);
      box(0, L, 0, t, z, z + t, steel);
      box(0, L, D - t, D, z, z + t, steel);
      for (let i = 0; i <= cols; i++) box(xp(i), xp(i) + t, t, D - t, z, z + t, steel);
      box(t, L - t, t, D - t, z + t - bt, z + t + 0.001, wood); // 段の板（枠の上の面にそろえる）
    }
    box(t, L - t, D - t - 0.012, D - t, zr(0) + t, zr(rows), back); // 奥の板
    box(t, t + 0.012, t, D - t - 0.012, zr(0) + t, zr(rows), wood); // 両端の板
    box(L - t - 0.012, L - t, t, D - t - 0.012, zr(0) + t, zr(rows), wood);
    const bk = it.books || 0;
    for (let k = 0; k < rows && bk > 0; k++) {
      const za = zr(k) + t + 0.001, ch = zr(k + 1) - za;
      for (let i = 0; i < cols; i++) {
        if (hash2(seed + k * 31, i) >= bk) continue;
        let x = xi(i) + t / 2 + 0.02 + hash2(seed + 5, i * 7 + k) * 0.1;
        const xEnd = xi(i + 1) - t / 2 - 0.02;
        const n = 3 + Math.floor(hash2(seed + 9, i + k * 13) * 9);
        for (let j = 0; j < n; j++) {
          const w = 0.016 + hash2(seed + j, i * 17 + k) * 0.03;
          if (x + w > xEnd) break;
          const bh = Math.min(ch - 0.03, 0.17 + hash2(seed + j * 3, i + k * 5) * 0.12);
          const bd = Math.min(D - 2 * t - 0.03, 0.15 + hash2(seed + j * 5, i + k * 7) * 0.07);
          const c = tint(COL_HEX(BOOK_PAL[Math.floor(hash2(seed + j * 11, i * 3 + k) * BOOK_PAL.length)]));
          box(x, x + w, D - t - 0.014 - bd, D - t - 0.014, za, za + bh, c);
          x += w + (hash2(seed + j, k) < 0.15 ? 0.01 : 0.001);
        }
      }
    }
    return;
  }
  const white = it.color ? tint(COL_HEX(it.color)) : T("shelfWhite");
  const front = it.color2 ? tint(COL_HEX(it.color2)) : T("drawerWood");
  const pt = 0.02, zTop = z1 - 0.025, zBot = z0 + 0.06;
  const dbl = !!it.double;
  box(0.03, L - 0.03, 0.04, dbl ? D - 0.04 : D - 0.012, z0, zBot, T("shelfToe")); // 足もと
  box(0, L, 0, D, zTop, z1, it.top === "wood" ? T("shelfWood") : white); // 天板
  if (!dbl) box(pt, L - pt, D - 0.012, D, zBot, zTop, white); // 奥の板
  for (let i = 0; i <= cols; i++) {
    const x = Math.min(L - pt, Math.max(0, xi(i) - pt / 2));
    box(x, x + pt, 0, D, z0, zTop, white); // 両端と仕切りの板
  }
  const rh = (zTop - zBot) / rows;
  const nd = dbl ? 0 : Math.min(rows, Math.max(0, it.drawers || 0));
  for (let k = 0; k < rows; k++) {
    const z = zBot + rh * k;
    if (k < nd) {
      for (let i = 0; i < cols; i++) {
        const x0 = xi(i) + pt / 2 + 0.003, x1 = xi(i + 1) - pt / 2 - 0.003;
        box(x0, x1, -0.004, 0.014, z + 0.003, z + rh - 0.003, front);
        const xc = (x0 + x1) / 2, hw = Math.min(0.08, (x1 - x0) * 0.2);
        box(xc - hw, xc + hw, -0.01, -0.004, z + rh - 0.065, z + rh - 0.05, T("handle"));
      }
      continue;
    }
    box(pt / 2, L - pt / 2, 0.01, dbl ? D - 0.01 : D - 0.012, z - 0.009, z + 0.009, white); // 段の板
  }
}

// 計算式の時計の箱（Taki Plaza 2 階の窓ぎわの棚の上。動画 IMG_1080 の 6〜18 秒）：木の箱と黒いガラスの面。光る字（時刻の式）は
// campus3dMathClock が分ごとに描く（ctx.clocks に面の左下・右の向き・前の向き・大きさを足す）
function addMathClockCase(m, it, r, z0, z1, T, tint, clocks) {
  const F = frontOf(r);
  prismPoly(m, r, z0, z1, it.color ? tint(COL_HEX(it.color)) : T("clockWood"), { bottom: true });
  const e = 0.006;
  frontQuad(m, F, e, F.L - e, z0 + e, z1 - e, 0.0012, T("clockFace"));
  if (!clocks) return;
  const ux = rightOf(F), lf = leftEnd(F);
  clocks.push({ o: [lf[0] + ux[0] * e, lf[1] + ux[1] * e], u: ux, n: [F.nf[0], F.nf[1]], z0: z0 + e, w: F.L - 2 * e, h: z1 - z0 - 2 * e, d: 0.0012 });
}

// 板を重ねた切り抜き（エレベーターの扉の上の建物の飾り bldg、トイレの入口の男女の形 man・woman。動画 IMG_1080 の 85〜106 秒）：
// 形の面は前の辺を含む縦の面、四角の奥行きが板の幅。形（前から見て左 0〜右 1・下 0〜上 1 の多角形の組。重なりは偶奇＝穴）を厚さ 6mm の
// 板ごとに横に切り、明るい木 2 枚と濃い線 1 枚の縞に
const WOODCUT_SHAPES = {
  // 頭・胴・2 本の脚
  man: [
    [[0.37, 0.87], [0.63, 0.87], [0.63, 1], [0.37, 1]],
    [[0.08, 0.4], [0.92, 0.4], [0.92, 0.87], [0.08, 0.87]],
    [[0.2, 0], [0.45, 0], [0.45, 0.4], [0.2, 0.4]],
    [[0.55, 0], [0.8, 0], [0.8, 0.4], [0.55, 0.4]],
  ],
  // とがった頭・すそが広がる服・短い脚
  woman: [
    [[0.36, 0.78], [0.64, 0.78], [0.64, 0.9], [0.5, 1], [0.36, 0.9]],
    [[0.04, 0.1], [0.96, 0.1], [0.64, 0.78], [0.36, 0.78]],
    [[0.32, 0], [0.45, 0], [0.45, 0.1], [0.32, 0.1]],
    [[0.55, 0], [0.68, 0], [0.68, 0.1], [0.55, 0.1]],
  ],
  // 四角い枠（下 0〜0.78）の中に下に縦長の口のある塔 3 本、枠の上に左の十字の塔と右の切妻の家
  bldg: [
    [[0, 0], [1, 0], [1, 0.78], [0, 0.78]],
    [[0.09, 0.07], [0.91, 0.07], [0.91, 0.7], [0.09, 0.7]],
    [[0.15, 0.07], [0.36, 0.07], [0.36, 0.6], [0.3, 0.6], [0.255, 0.655], [0.21, 0.6], [0.15, 0.6]],
    [[0.235, 0.07], [0.275, 0.07], [0.275, 0.27], [0.255, 0.29], [0.235, 0.27]],
    [[0.4, 0.07], [0.6, 0.07], [0.6, 0.58], [0.55, 0.58], [0.55, 0.64], [0.45, 0.64], [0.45, 0.58], [0.4, 0.58]],
    [[0.48, 0.07], [0.52, 0.07], [0.52, 0.27], [0.48, 0.27]],
    [[0.64, 0.07], [0.84, 0.07], [0.84, 0.62], [0.79, 0.62], [0.79, 0.68], [0.69, 0.68], [0.69, 0.62], [0.64, 0.62]],
    [[0.72, 0.07], [0.76, 0.07], [0.76, 0.27], [0.72, 0.27]],
    [[0.16, 0.78], [0.33, 0.78], [0.33, 0.82], [0.29, 0.82], [0.29, 0.86], [0.32, 0.86], [0.32, 0.89], [0.27, 0.89], [0.27, 0.96], [0.22, 0.96], [0.22, 0.89], [0.17, 0.89], [0.17, 0.86], [0.2, 0.86], [0.2, 0.82], [0.16, 0.82]],
    [[0.5, 0.78], [0.68, 0.78], [0.68, 0.88], [0.59, 0.98], [0.5, 0.88]],
    [[0.57, 0.81], [0.61, 0.81], [0.61, 0.87], [0.57, 0.87]],
  ],
};
const CUT_LAYER = 0.006;
function addWoodCut(m, it, r, z0, z1, T) {
  const F = frontOf(r);
  const shape = WOODCUT_SHAPES[it.shape];
  const D = depthOf(F, r), W = F.L, H = z1 - z0;
  if (!shape || W < 0.02 || H < 0.02 || D < 0.002) {
    prismPoly(m, r, z0, z1, T("cutLight"), { bottom: true });
    return;
  }
  const ux = rightOf(F), lf = leftEnd(F);
  const P = (x, y) => [lf[0] + ux[0] * x - F.nf[0] * y, lf[1] + ux[1] * x - F.nf[1] * y];
  const n = Math.max(1, Math.round(H / CUT_LAYER));
  const tones = [T("cutLight"), T("cutMid"), T("cutDark")];
  for (let k = 0; k < n; k++) {
    const ym = (k + 0.5) / n;
    const xs = [];
    for (const poly of shape) {
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length];
        if (p[1] <= ym !== q[1] <= ym) xs.push(p[0] + ((ym - p[1]) * (q[0] - p[0])) / (q[1] - p[1]));
      }
    }
    xs.sort((a, b) => a - b);
    const c = tones[k % 3];
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = xs[i] * W, xb = xs[i + 1] * W;
      if (xb - xa < 0.002) continue;
      const ring = [P(xa, 0), P(xb, 0), P(xb, D), P(xa, D)];
      const za = z0 + (k * H) / n;
      prismPoly(m, ring, za, z0 + ((k + 1) * H) / n, c);
      // 下の面は板の面（明るい木）：枠の内の上の縁を見上げたとき濃い線の色の帯にならないように
      m.polygon([ring], za, [0, 0, -1], shade(tones[0], [0, 0, -1]));
    }
  }
}

// 木の板の表示（トイレの入口の「MEN」「WOMEN」。動画 IMG_1080 の 85〜95 秒）：壁に貼った板（縦の木目の縞）に color の字 text
function addWoodSign(m, it, r, z0, z1, T, tint, txt) {
  const F = frontOf(r);
  const H = z1 - z0;
  prismPoly(m, r, z0, z1, T("signWood"), { bottom: true });
  const tones = [T("signWood"), T("signWood2"), T("signWood3")];
  const n = Math.max(3, Math.round(F.L / 0.016));
  for (let i = 0; i < n; i++) frontQuad(m, F, (F.L * i) / n, (F.L * (i + 1)) / n, z0 + 0.003, z1 - 0.003, 0.0012, tones[Math.floor(hash2(i, 7) * 3)]);
  if (!txt || !it.text) return;
  const ux = rightOf(F), lf = leftEnd(F);
  const opt = { stroke: 0.15, d0: 0.0012, d1: 0.004 };
  // 字の高さは板の高さの 0.34。行が板の幅の 0.86 を超えるなら小さく（行の幅は字の高さに比例）
  const size = Math.min(H * 0.34, (F.L * 0.86) / Math.max(1e-6, txt.textWidth(it.text, 1, opt)));
  const w = txt.textWidth(it.text, size, opt);
  const plane = { P: (x, y, d) => [[lf[0] + ux[0] * x + F.nf[0] * d, lf[1] + ux[1] * x + F.nf[1] * d], z0 + y], N: [F.nf[0], F.nf[1], 0], U: [ux[0], ux[1], 0], V: [0, 0, 1] };
  const c = it.color ? tint(COL_HEX(it.color)) : T("darkItem");
  txt.planeText(m, plane, it.text, (F.L - w) / 2, (H - size) / 2, size, opt, c, c);
}

// 貼り紙（窓ぎわの本棚の「ご自由にどうぞ FREE to USE」。動画 IMG_1080 の 7〜12 秒）：白い紙に手書きの桃色の 2 行（日本語の字のかわりに線）と
// 下に緑の「FREE to USE」
function addNote(m, r, z0, z1, T, txt) {
  const F = frontOf(r);
  const H = z1 - z0, L = F.L;
  prismPoly(m, r, z0, z1, T("paper"), { bottom: true });
  const ink = T("noteInk");
  frontQuad(m, F, L * 0.12, L * 0.62, z0 + H * 0.74, z0 + H * 0.8, 0.0012, ink);
  frontQuad(m, F, L * 0.3, L * 0.76, z0 + H * 0.55, z0 + H * 0.61, 0.0012, ink);
  frontQuad(m, F, L * 0.62, L * 0.9, z0 + H * 0.88, z0 + H * 0.91, 0.0012, ink);
  if (!txt) return;
  const ux = rightOf(F), lf = leftEnd(F);
  const size = H * 0.12;
  const opt = { stroke: 0.12, d0: 0.0012, d1: 0.0025 };
  const w = Math.min(L * 0.9, txt.textWidth("FREE to USE", size, opt));
  const plane = { P: (x, y, d) => [[lf[0] + ux[0] * x + F.nf[0] * d, lf[1] + ux[1] * x + F.nf[1] * d], z0 + y], N: [F.nf[0], F.nf[1], 0], U: [ux[0], ux[1], 0], V: [0, 0, 1] };
  txt.planeText(m, plane, "FREE to USE", (L - w) / 2, H * 0.14, size, opt, T("noteGreen"), T("noteGreen"));
}

// 星の飾り（2 階のエレベーターの扉の左の縁。動画 IMG_1080 の 101〜107 秒）：前の辺のまん中の前に、上から下へ細いひもと 0.24m おきの
// 紙の星（白とうすい黄色を交互・少しずつ回す。両面）
function addStars(m, r, z0, z1, T) {
  const F = frontOf(r);
  const ux = rightOf(F);
  const c = lerp2(F.a, F.b, 0.5);
  const p = [c[0] + F.nf[0] * 0.012, c[1] + F.nf[1] * 0.012];
  bar(m, [p, z0], [p, z1], 0.003, T("string"));
  const R = 0.05;
  let k = 0;
  for (let z = z1 - 0.12; z > z0 + 0.04; z -= 0.24, k++) {
    const col = k % 2 ? T("starPale") : T("starWhite");
    const rot = (hash2(k, 3) - 0.5) * 0.9;
    const pts = Array.from({ length: 10 }, (_, j) => {
      const a = Math.PI / 2 + rot + (j * Math.PI) / 5;
      const rr = j % 2 ? R * 0.42 : R;
      return [Math.cos(a) * rr, Math.sin(a) * rr];
    });
    for (const s of [1, -1]) {
      const Q = (x, y) => [[p[0] + ux[0] * x + F.nf[0] * 0.002 * s, p[1] + ux[1] * x + F.nf[1] * 0.002 * s], z + y];
      const nn = [F.nf[0] * s, F.nf[1] * s, 0];
      for (let j = 0; j < 10; j++) {
        const a = pts[j], b = pts[(j + 1) % 10];
        if (s > 0) face(m, [Q(0, 0), Q(a[0], a[1]), Q(b[0], b[1]), Q(0, 0)], nn, col);
        else face(m, [Q(0, 0), Q(b[0], b[1]), Q(a[0], a[1]), Q(0, 0)], nn, col);
      }
    }
  }
}

// 1 階・階段の上の新しい物（addFloor の家具から）：描いたら true
function addStationItem(m, it, r, zf, z0, z1, T, tint) {
  const color = it.color ? tint(COL_HEX(it.color)) : null;
  const color2 = it.color2 ? tint(COL_HEX(it.color2)) : null;
  if (it.kind === "soffit") {
    // 段々の天井の箱：横は明るい灰、下の面に丸い照明（長い向きに 1.6m おき、幅が広ければ 2 列）
    prismPoly(m, r, z0, z1, T("soffit"), { sideCol: T("soffit"), top: false });
    m.polygon([r], z0, [0, 0, -1], shade(T("soffitUnder"), [0, 0, -1]));
    if (r.length === 4) {
      const e0 = len(sub(r[1], r[0])), e1 = len(sub(r[2], r[1]));
      const [a, b, , d] = e0 >= e1 ? r : [r[1], r[2], r[3], r[0]];
      const Lx = len(sub(b, a)), Ly = len(sub(d, a));
      const nx = Math.max(1, Math.round(Lx / 1.6));
      for (let i = 0; i < nx; i++) {
        for (const fy of Ly > 1.6 ? [0.25, 0.75] : [0.5]) {
          const fx = (i + 0.5) / nx;
          const p = [a[0] + (b[0] - a[0]) * fx + (d[0] - a[0]) * fy, a[1] + (b[1] - a[1]) * fx + (d[1] - a[1]) * fy];
          m.polygon([Array.from({ length: 12 }, (_, k) => [p[0] + 0.08 * Math.cos((Math.PI * k) / 6), p[1] + 0.08 * Math.sin((Math.PI * k) / 6)])], z0 - 0.004, [0, 0, -1], T("dlight"));
        }
      }
    }
    return true;
  }
  if (it.kind === "sdoor" && r.length === 4) {
    const F = frontOf(r);
    // 枠の色は color2 があればそれ（白い壁の閉じた扉。2026-11-12）
    const frame = color2 || T("doorFrame");
    prismPoly(m, r, z0, z1, frame, { sideCol: frame });
    frontQuad(m, F, 0.05, F.L - 0.05, z0 + 0.01, z1 - 0.05, 0.003, color || T("doorLeaf"));
    frontQuad(m, F, F.L - 0.17, F.L - 0.1, z0 + 0.95, z0 + 1.12, 0.025, T("doorKnob"));
    return true;
  }
  if (it.kind === "gate" && r.length === 4) {
    addGate(m, r, z0, T, color || T("gateBody"));
    return true;
  }
  if (it.kind === "cyl" && r.length === 4) {
    addCyl(m, r, z0, z1, color || T("cylDark"), color2, it.split != null ? zf + it.split : null, T("railSteel"));
    return true;
  }
  if (it.kind === "locker" && r.length === 4) {
    addLocker(m, r, z0, z1, T);
    return true;
  }
  if (it.kind === "machine" && r.length === 4) {
    addMachine(m, r, z0, z1, T, color || T("machine"));
    return true;
  }
  if (it.kind === "tvm" && r.length === 4) {
    addTvm(m, r, z0, z1, T, color2);
    return true;
  }
  if (it.kind === "poster" && r.length === 4) {
    addPoster(m, r, z0, z1, T, it, tint);
    return true;
  }
  if (it.kind === "arrow" && r.length >= 3) {
    const c = centroid(r);
    const a = Math.min(len(sub(r[1], r[0])), len(sub(r[2], r[1])));
    const d = sub(r[1], r[0]);
    const L = len(d) || 1;
    addFloorArrow(m, c, [d[0] / L, d[1] / L], a, z1, color || T("arrowFg"), T("arrowBg"));
    return true;
  }
  if (it.kind === "dlight") {
    const c = centroid(r);
    const R = Math.min(len(sub(r[1], r[0])), len(sub(r[2 % r.length], r[1]))) / 2;
    m.polygon([Array.from({ length: 16 }, (_, k) => [c[0] + R * Math.cos((Math.PI * k) / 8), c[1] + R * Math.sin((Math.PI * k) / 8)])], z1 - 0.003, [0, 0, -1], color || T("dlight"));
    return true;
  }
  if (it.kind === "hatch" && r.length === 4) {
    const c = T("hatch");
    const ce = centroid(r);
    for (let i = 0; i < 4; i++) {
      const a = r[i], b = r[(i + 1) % 4];
      const a2 = lerp2(a, ce, 0.03 / (len(sub(ce, a)) || 1)), b2 = lerp2(b, ce, 0.03 / (len(sub(ce, b)) || 1));
      face(m, [[a, z1 - 0.004], [b, z1 - 0.004], [b2, z1 - 0.004], [a2, z1 - 0.004]], [0, 0, -1], c);
    }
    return true;
  }
  if (it.kind === "hydrant" && r.length === 4) {
    const F = frontOf(r);
    prismPoly(m, r, z0, z1, T("hydrant"), { sideCol: T("hydrant") });
    const H = z1 - z0;
    const cx = F.L / 2, cz = z1 - H * 0.12, R = Math.min(0.07, H * 0.08);
    const P = (x, y) => [[F.a[0] + F.u[0] * x + F.nf[0] * 0.02, F.a[1] + F.u[1] * x + F.nf[1] * 0.02], y];
    for (let k = 0; k < 12; k++) {
      const a0 = (Math.PI * k) / 6, a1 = (Math.PI * (k + 1)) / 6;
      face(m, [P(cx, cz), P(cx + R * Math.cos(a0), cz + R * Math.sin(a0)), P(cx + R * Math.cos(a1), cz + R * Math.sin(a1)), P(cx, cz)], [F.nf[0], F.nf[1], 0], T("hydrantRed"));
    }
    frontQuad(m, F, F.L * 0.25, F.L * 0.75, z1 - H * 0.32, z1 - H * 0.24, 0.004, T("hydrantRed"));
    return true;
  }
  if (it.kind === "rack" && r.length === 4) {
    // パンフレットの棚：ステンレスの台と枠、奥の板（color）、前の面に 4 段の色とりどりの冊子
    const F = frontOf(r);
    const frame = T("rackFrame");
    prismPoly(m, r, z0, z0 + 0.12, frame, { sideCol: frame });
    for (const x of [0.02, F.L - 0.02]) bar(m, [[F.a[0] + F.u[0] * x, F.a[1] + F.u[1] * x], z0], [[F.a[0] + F.u[0] * x, F.a[1] + F.u[1] * x], z1], 0.03, frame);
    const ce = centroid(r);
    const backC = color || frame;
    prismPoly(m, r.map((p) => lerp2(p, ce, 0.5)), z0 + 0.12, z1, backC, { sideCol: backC });
    const pal = ["#d8423c", "#f4f1ea", "#3a78c2", "#e9b631", "#e46f9a", "#4fa266", "#f0f0f0", "#c43c3c"];
    const seed = Math.round((F.a[0] - F.a[1]) * 10);
    const rows = 4;
    const ncol = Math.max(1, Math.round(F.L / 0.24));
    for (let j = 0; j < rows; j++) {
      const za = z0 + 0.18 + ((z1 - z0 - 0.25) * j) / rows, zb = za + ((z1 - z0 - 0.25) / rows) * 0.8;
      for (let i = 0; i < ncol; i++) {
        const x0 = 0.04 + ((F.L - 0.08) * i) / ncol + 0.01, x1 = 0.04 + ((F.L - 0.08) * (i + 1)) / ncol - 0.01;
        frontQuad(m, F, x0, x1, za, zb, 0.02 + 0.012 * j, tint(COL_HEX(pal[Math.floor(hash2(seed + j, i) * pal.length)])));
      }
    }
    return true;
  }
  return false;
}
