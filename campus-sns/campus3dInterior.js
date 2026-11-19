// 詳細モード（建物の中）：建物の階（構造物の type "floor"。campus3dFeatures.js）を描く三角形と、歩く世界（campus3dWalk.js）の立体・壁。
// 位置は平面の m（toXY）、高さは標高 m。階の高さ z は groundRef の地面（掘る前の地面＝dem.groundAt）から。
// 内装は昼の色のまま、光を受けない色（アルファ 0.5。campus3dLayer.js の VS_SOLID）で描き、面の向きで少し陰をつける（照明のある屋内。夜も明るい）。
// 描くのは：床（穴＝吹き抜け・階段の口）と床の下の面（下の階の天井）・部屋の床の色・壁（扉の口とまぐさ）・ガラス（枠）・格子の手すり・
// 家具など・階段（段・裏の面・手すり）・地下の上を覆う地面の高さの床（lids）。歩いて見るとき（全部の階）は、建物の屋根の下の天井と梁（addRoofCeiling）。
// 地下の階の下を掘ったふち（dig）の帯は addDigBand
import { floorUV } from "./campus3dFloorMaterials.js";
import { addAcousticShell, addAuditoriumSeat, addAuditoriumSpeaker, addStageBatten, addStageWing, addVaultFixture } from "./campus3dAuditorium.js";
import { ceilingMount, ceilingProfile } from "./campus3dCeiling.js";
import { iconCells } from "./campus3dSignText.js";
import { SHOP_PRINTS, shopFace, shopQueue, shopRow } from "./campus3dShop.js";
import { addMarketDownlight, addMarketFixture } from "./campus3dMarket.js";
import { MARKET_ART, addMarketArt } from "./campus3dMarketSigns.js";
import { drawMarketFloor } from "./campus3dMarketFloor.js";
import { drawStationFixture, drawStationBoarding, drawTactileStrip, stationFixtureStyles } from "./campus3dStationFixtures.js";
import { drawStationFloor, isStationTile } from "./campus3dStationFloor.js";
import { glassPalette, glassPanels } from "./campus3dGlassArtwork.js";
import { addPicody, addPicodyStand } from "./campus3dPicody.js";
import { drawKuramaeItem } from "./campus3dKuramaeCafe.js";
import { addTakiVending, addTakiSorting, addBinLiner } from "./campus3dTakiVending.js";
import { addCeramicRelief, addReliefPlaque, addLobbyCase, addCaseCaption, addGalleryPlaster, addGalleryTrack, reliefWalkSpans } from "./campus3dTakiExhibition.js";
import polygonClipping from "polygon-clipping";
import { LIFT_DOOR_H, LIFT_DOOR_W, LIFT_WALL, WALL_CAP, WALL_T, archTop, buildingRoof, offsetRingBy, pointInRing, ringArea, roofSlab, toLngLat, toXY, trackZs } from "./campus3dFeatures.js";

const TAKI_FIXTURES = {
  takiVending:addTakiVending, takiSorting:addTakiSorting,
  galleryPlaster:addGalleryPlaster, galleryTrack:addGalleryTrack,
  ceramicRelief:addCeramicRelief, reliefPlaque:addReliefPlaque, picody:addPicody,
  picodyDisplay:addPicodyStand, plazaModel:addLobbyCase, lobbyShowcase:addLobbyCase, caseCaption:addCaseCaption,
};

const hex = (h, a = 0.5) => {
  const n = parseInt(h.slice(1, 7), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, a];
};
// 内装の色（昼の色。アルファ 0.5＝光を受けない）
const PAL = {
  deckwood: "#b1ada6", speckle: "#e1ded2", roofpaving: "#77756b",
  paleoak: "#e4dccb", // 白っぽいオークの床（Taki Plaza の地下 2 階・地下 1 階。2026-11-18、動画 IMG_1462）
  marketVinyl: "#c4c2bc",
  pine: "#deb278", // 滝プラザ2階の学習スペースの変形テーブル（S__47661073）
  darkgravel: "#676660",
  groovedwood: "#9c8e79",
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
  psdWhite: "#f2f1ec", psdOrange: "#eac13e", psdTop: "#c3c5c6", psdGlass: "#3a4047", psdFrame: "#dadbdc",
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
  soffit: "#eceae5", soffitUnder: "#e1dfd9", dlight: "#fffef6", globe: "#fdfaf1", cord: "#e4e3df", tray: "#f1f1ee", duct: "#b9bec3", ductBand: "#9da3a9", cassette: "#f2f2ef", cassetteGrille: "#a4a8ac", beltBlue: "#2f4f9c", postSteel: "#c3c8cc",
  doorLeaf: "#e9e3d3", doorFrame: "#d6cfbd", doorKnob: "#9ea3a7", arrowBg: "#45484d", arrowFg: "#f6f6f4",
  // 西1号館の玄関ホールの茶色のれんが（2026-11-15、写真 w1ent4・w1AED1）
  rbrick: "#7a4a36", rbrickJoint: "#a08670",
  wainsTile: "#c9bda7", wainsGrout: "#ada190",wainsTop: "#ebe8e1", wainsTrim: "#b9b3a8", slatWood: "#7b4f37", slatBack: "#3d2a20", maroon: "#7a2140", wtile: "#f1f0ec", wtileGrout: "#dcdad5",
  gateBody: "#c9cdd1", gateTop: "#2f3236", gateFlap: "#e3e4e5", gateRead: "#4fb3ff", gateScreen: "#1b2633",
  cylDark: "#4a4648", locker: "#f3f3f0", lockerLine: "#c6c7c8", lockerLed: "#36d05b", machine: "#e6e7e5", screenDark: "#20262e",
  tile2A: "#d9cdb7", tile2B: "#d2c6af", floorBrown: "#a9715a",
  // 本館の廊下（2026-11-15、アクセシビリティマップの写真 em-ent8-2）：灰色の石のタイルの 2 つの近い色・壁の暗い見切りの帯と幅木・扉の木の枠
  stone2A: "#bcb8b0", stone2B: "#b4b0a8", trimDark: "#4a4d52", doorCase: "#6b5038",
  // 本館の廊下の床（つやのあるクリーム色の長尺シート）・玄関ホールの明るいベージュの石張りの壁と目地（2026-11-16、ユーザーの動画 IMG_1380・IMG_1381）
  ivory: "#d8d1ba", bstone: "#d8ccb0", bstoneJoint: "#b8aa8d", transomGlass: "#7f8b8f",
  // 本館の地下 1 階の生協の床（つやのあるピンクがかったベージュ）・第2食堂の茶色のタイルの 2 つの近い色（2026-11-16、動画 IMG_1381）
  rose: "#e2cfc6", tanA: "#ab835c", tanB: "#a47c56",
  // 石川台8号館（ELSI-2）の 1 階のラウンジの紺のタイルカーペット（2 つの近い紺の市松。2026-11-17、ユーザーの動画 IMG_1391・ELSI の写真）
  navyA: "#323a4b", navyB: "#2a3242",
  // 南4号館のセブン-イレブン（2026-11-17、ユーザーの動画 IMG_1393）：クリーム色の大きなタイルの床（2 つの近い色と暗い目地）、飲み物の冷蔵ケース
  // （黒い枠・中の白い壁と棚・上の帯・扉の灯）、多段のオープンケース（白い箱・奥の板・吸い込みの格子）、平型の冷凍ケースの暗いガラス、レジ、
  // コーヒーマシン（黒・画面・金の帯）、ATM（白・赤い帯・画面）、番重・コンテナ（青・緑・灰・黒）、ホットケースの暖かい灯と揚げ物の色
  cvsA: "#e5e1cd", cvsB: "#e0ddc9", cvsJoint: "#898578",
  coolFrame: "#2b2e32", coolIn: "#f5f6f4", coolShelf: "#c9ced2", coolHead: "#f4f4f2", coolLed: "#ffffff", coolBase: "#3a3d41",
  chillBody: "#f2f2ef", chillBack: "#e2e4e3", chillGrille: "#3b3e42", freezerGlass: "#3d4a55",
  regBody: "#efefec", regScreen: "#203245", coffeeBody: "#1c1d1f", coffeeScreen: "#3a4f66", coffeeGold: "#b59b6a",
  atmBody: "#ebeceb", atmRed: "#d3283b", atmScreen: "#1f3a55", atmGrey: "#a3a8ad",
  crateBlue: "#2f62c9", crateGreen: "#2f8a5e", crateGrey: "#8f959a", crateBlack: "#2b2d30", hotIn: "#f6d9a0", hotFood: "#c98a3c", hotFood2: "#a5652b",
  tvmBody: "#e8eaeb", tvmTop: "#1f3b6e", tvmScreen: "#16202c", tvmMenu: "#4f9ad6", tvmMenu2: "#f2f4f6", tvmSlot: "#2a2d31", tvmTray: "#3a3d42", tvmIc: "#3f8de0",
  posterFrame: "#6e4a32", posterIn: "#eae6dc", hydrant: "#f0eee8", hydrantRed: "#d9322b", rackFrame: "#c8ccd0", hatch: "#d8d6d0", ceilPlain: "#f1f0ec",
  // Taki Plaza 2 階の小物（2026-11-13、動画 IMG_1080）：窓ぎわの本棚（白い鉄の枠・木目の段の板・奥の板）、Attic Studio の白い棚（板・足もと・
  // 引き出しの木の前板・取っ手）、計算式の時計（木の箱・黒い面）、板を重ねた切り抜き（明るい木・中の色・濃い線）、トイレの木の板の表示
  // （3 つの木目）、貼り紙と字の色、星の飾りのひもと紙
  shelfSteel: "#eef0f0", shelfWood: "#d6c3a0", shelfBack: "#cbb894", shelfWhite: "#f1f1ee", shelfToe: "#d2d2cf", drawerWood: "#d9c8a7", handle: "#8a8d91",
  clockWood: "#c9a46c", clockFace: "#0c0d0f", cutLight: "#dcc394", cutMid: "#c6a473", cutDark: "#6f5838",
  signWood: "#d9c49b", signWood2: "#cdb488", signWood3: "#e3d2ae", paper: "#fbfaf6", noteInk: "#e2708c", noteGreen: "#4f9a5e", string: "#e9e6dc", starWhite: "#f4f3ee", starPale: "#ece4a6",
  // 附属図書館の地下（2026-11-13、動画 IMG_1077）：灰色のゴムの床、鉄の書架（明るい灰の板・段の板・奥の背の板）
  rubber: "#a3a3a0", studdedRubber: "#555555", stackSteel: "#dfe1e2", stackShelf: "#cfd2d4", stackBack: "#a9adb1",
  // 杉綾のれんが（herring。2026-11-13、動画 IMG_1077 の 612・654・870 秒）：目地と、れんがの 4 つの濃さ（明るい灰〜濃い灰）
  herring: "#8c8a85", herring0: "#c8c6c1", herring1: "#b2b0ab", herring2: "#9d9b96", herring3: "#86847f",
  // 図書館のゲート（2026-11-13、動画 IMG_1077 の 145〜148・600〜606・864 秒）：ステンレスの台・暗いガラスの天板・青い灯・白い防犯ゲートの枠
  gateSteel: "#b9bec2", gateSteelDark: "#8e9397", gateGlassTop: "#2a2e33", gateBlue: "#3d7bff", gateReader: "#1f2a44", secWhite: "#f2f2ef",
  // 打ち放しのコンクリートの壁（P コンの穴）と白いれんがの壁（図書館の地下。動画 IMG_1077）
  concWall: "#c9c8c3", concHole: "#9d9c97", wbrick: "#ecebe6", wbrickJoint: "#d3d1ca",
  stairRubber: "#45484c", stairRubberNose: "#c9cdd0",
  // 図書館の東の階段（暗い鉄の枠にすりガラスの踏面）と、三角の階段の口の斜めのコンクリートの屋根（2026-11-13、動画 IMG_1077 の 190・380・570〜598 秒）
  stairGlass: "#c3cbcf", stairSteel: "#3c4044", wedgeConc: "#d3d1cb",
  // 西5号館の 4 階の製図室（2026-11-15、JIA の写真 07-01_W5_77。写真の白い床 #bdbec3 を白に戻した明るさ）：かまぼこ形の天井の明るい木の
  // 細い板・板の裏の暗い面・天窓の明るい面と横のルーバー・黒い吹き出し口、木の横板張りの壁と継ぎ目の溝、作り付けの木の収納と扉の継ぎ目
  vaultWood: "#e6cfac", vaultBack: "#57524c", vaultSky: "#dfe9f1", vaultLouver: "#f2f1ed", slotDark: "#141415",
  hboard: "#cbae8a", hboardGroove: "#7f6548", cabinetWood: "#c49f75", cabinetLine: "#8a6c4c",
  // 70周年記念講堂の客席（2026-11-18、ユーザーの写真 DSC06057 ほか）：あたたかい色の木の縦板張りの壁と継ぎ目、南の壁の白い格子、
  // 劇場の椅子（橙がかった布・明るい木の背の板・暗い木の袖）
  vboard: "#9a673e", vboardJoint: "#68482e", lattice: "#e6e6de", latticeJoint: "#a3a39b", tseatCloth: "#c8694a", tseatWood: "#d2a05f", tseatSide: "#5a4030",
};
export { PAL as interiorPalette };
const COL = Object.fromEntries(Object.entries(PAL).map(([k, v]) => [k, hex(v)]));
const interiorColor = k => typeof k === "string" && k[0] === "#" ? hex(k) : COL[k];
const GLASS = hex(PAL.glass, 0.5);
const MESH = hex(PAL.mesh, 0.5);
// 面の向きで陰（上 1・下 0.8・横は向きで少しずつ）
const shade = (c, n) => {
  const k = n[2] > 0.7 ? 1 : n[2] < -0.7 ? 0.8 : 0.86 + 0.07 * n[0] + 0.03 * n[1];
  return [c[0] * k, c[1] * k, c[2] * k, c[3]];
};
const FINISH_COL = { stationHallTile: "tile2A", stationPlatformTile: "checkerA", takiConcrete: "concrete", marketPlanks: "paleoak", marketVinyl: "marketVinyl", marketTile: "tile2A", pine: "pine", darkgravel: "darkgravel", groovedwood: "groovedwood", paleoak: "paleoak", oak: "oak", deckwood: "deckwood", terraceBoards: "deckwood", speckle: "speckle", concrete: "concrete", tile: "tile", grayTile: "gravel", carpet: "carpet", stone: "stone", white: "white", plaza: "plaza", gravel: "gravel", dark: "dark", checker: "checkerA", ballast: "ballast", tactile: "tactile", tile2: "tile2A", brown: "floorBrown", rubber: "rubber", studdedRubber: "studdedRubber", herring: "herring", stone2: "stone2A", ivory: "ivory", rose: "rose", tan: "tanA", navy: "navyA", cvs: "cvsA" };
const ITEM_COL = {
  box: "whiteItem", wood: "wood", white: "whiteItem", dark: "darkItem", grey: "grey", sofa: "sofa", seat: "seat", green: "green", screen: "screen", glow: "glow",
  counter: "counter", layered: "counter", slats: "birch", platform: "platform", table: "wood", shelf: "whiteItem", kitchen: "kitchen", vending: "vending", piano: "piano",
  red: "red", orange: "orange", art: "art", core: "core", lift: "lift", toilet: "toilet", walnut: "walnut", chalk: "chalk", lamp: "lamp", bentwood: "bentwood", mat: "mat",
  tatami: "tatamiA", steel: "steel", liftdoor: "steel", tentsofa: "tentsofa", column: "colCream", bench: "benchSeat", board: "boardBox", light: "lightStrip",
  chair: "chairShell", woodchair: "woodFrame", lounge: "loungeGrey", tseat: "tseatCloth",
  microwave: "whiteItem", drinks: "vending", stool: "whiteItem", tatamibox: "plywood", wboard: "whiteItem", bincab: "whiteItem", aframe: "red", louver: "darkItem",
  cubeshelf: "shelfWood", openshelf: "shelfWhite", mathclock: "clockWood", woodcut: "cutLight", woodsign: "signWood", note: "paper", stars: "starWhite", stack: "stackSteel",
  flapgate: "gateSteel", secgate: "secWhite", cabinet: "cabinetWood",
  cooler: "coolFrame", chiller: "chillBody", freezer: "chillBody", register: "regBody", coffee: "coffeeBody", atm: "atmBody", crates: "crateBlue", hotcase: "coolShelf",
};
// 椅子とソファー（addSeatItem が描く。4 点の四角の 1 本目の辺が背）
const SEAT_ITEMS = new Set(["chair", "woodchair", "lounge", "tseat"]);
// キッチンとイベントスペースの物（addKitchenItem が描く。4 点の四角の 1 本目の辺が前）
const KITCHEN_ITEMS = new Set(["microwave", "drinks", "stool", "tatamibox", "wboard", "bincab", "aframe", "louver"]);
// 南4号館のセブン-イレブンの物（addStoreItem が描く。4 点の四角の 1 本目の辺が前。2026-11-17）
const STORE_ITEMS = new Set(["cooler", "chiller", "freezer", "register", "coffee", "atm", "crates", "hotcase", "servery", "market"]);
// 2026-11-12（大岡山駅の階段の上・1 階）の物（addStationItem が描く）。床の上に置かない平らなもの（矢印・天井の照明・点検口）は歩く当たりにしない
const STATION_ITEMS = new Set(["soffit", "sdoor", "gate", "cyl", "locker", "machine", "arrow", "poster", "dlight", "hatch", "hydrant", "rack", "tvm"]);
// 壁に貼った薄い物（木の板の表示・貼り紙・星の飾り。2026-11-13）も当たりにしない
const FLAT_ITEMS = new Set(["arrow", "dlight", "hatch", "woodsign", "note", "stars"]);
const TATAMI = 0.88; // 畳（半畳の琉球畳）の目の大きさ（m）
// rubber：黒いゴムの踏面に明るい灰の段鼻（附属図書館の地下・学習棟の階段。2026-11-13、動画 IMG_1077）
const STAIR_COL = { wood: "stairWood", white: "stairWhite", stone: "stairStone", escalator: "escStep", oak: "stairOak", paleoak: "paleoak", rubber: "stairRubber", glass: "stairGlass" };
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

// 白い樹脂の背、色布の座、交差するパイプ脚とキャスター（S__47661074）。
function addSeminarChair(m, P, rect, L, D, z0, zs, z1, seat, T) {
  const frame = T("steelEdge"), shell = T("#eeede6");
  for (const x of [0.035, L - 0.035]) {
    for (const y of [0.045, D - 0.045]) {
      addCylinder(m, P(x - 0.013, y), P(x + 0.013, y), z0 + 0.032, 0.032, T("darkItem"), null, false, 8);
      bar(m, [P(x, y), z0 + 0.045], [P(x, D - y), zs - 0.025], 0.021, frame);
    }
    bar(m, [P(x, D * 0.55), zs], [P(x, D * 0.55), zs + 0.13], 0.022, shell);
    bar(m, [P(x, D * 0.55), zs + 0.13], [P(x, D * 0.13), zs + 0.15], 0.025, shell);
  }
  prismPoly(m, rect(0.035, 0.045, L - 0.035, D - 0.012), zs - 0.042, zs, seat, { bottom: true });
  // 背の上部に3列の長穴。穴を残した帯を張るので、後ろの机も穴越しに見える。
  const F = frontOf(rect(0, 0, L, D));
  const at = (x, t) => [P(L * (0.5 + (x - 0.5) * (0.85 + 0.15 * t)), D * (0.17 - 0.15 * t)), zs + (z1 - zs) * t];
  const patch = (x0, x1, t0, t1) => face(m, [at(x0, t0), at(x1, t0), at(x1, t1), at(x0, t1)], [...F.nf, 0], shell);
  const holes = [0.56, 0.70, 0.84];
  let bottom = 0.07;
  for (const top of holes) {
    patch(0, 1, bottom, top);
    let left = 0;
    for (let col = 0; col < 5; col++) {
      const start = 0.13 + col * 0.16;
      patch(left, start, top, top + 0.029);
      left = start + 0.065;
    }
    patch(left, 1, top, top + 0.029);
    bottom = top + 0.029;
  }
  patch(0, 1, bottom, 1);
}

function addWebbedChair(m, P, rect, L, D, z0, zs, z1, wood, strap) {
  const dark = shade(strap, [0, 0, -1]);
  for (const x of [0.033, L - 0.033]) {
    bar(m, [P(x, 0.06), z0], [P(x, 0.066), z1 - 0.055], 0.033, wood);
    bar(m, [P(x, D - 0.03), z0], [P(x, D - 0.045), zs], 0.035, wood);
    bar(m, [P(x, 0.06), zs - 0.023], [P(x, D - 0.03), zs - 0.023], 0.042, wood);
    bar(m, [P(x, 0.06), z0 + 0.18], [P(x, D - 0.03), z0 + 0.18], 0.022, wood);
  }
  for (const y of [0.06, D - 0.04]) bar(m, [P(0.032, y), zs - 0.018], [P(L - 0.032, y), zs - 0.018], 0.035, wood);
  const back = t => P(L * t, D * (0.065 + 0.52 * (t - 0.5) ** 2));
  for (let i = 0; i < 8; i++) segBox(m, back(i / 8), back((i + 1) / 8), 0.039, z1 - 0.085, z1 - 0.085, z1, z1, wood, { bottom: true });
  // 経糸と緯糸が交互に上に来る座。隙間から木の枠がのぞく。
  const dx = (L - 0.048) / 6, dy = (D - 0.07) / 6;
  for (let i = 0; i < 6; i++) {
    const x = 0.024 + i * dx, y = 0.045 + i * dy;
    m.polygon([rect(x + 0.002, 0.04, x + dx - 0.002, D - 0.023)], zs, [0,0,1], dark);
    m.polygon([rect(0.021, y + 0.002, L - 0.021, y + dy - 0.002)], zs + 0.0015, [0,0,1], strap);
    for (let j = i % 2; j < 6; j += 2) {
      const top = 0.045 + j * dy;
      m.polygon([rect(x + 0.002, top, x + dx - 0.002, top + dy)], zs + 0.003, [0,0,1], dark);
    }
  }
}

// IMG_1487 の客席。薄い成形合板の背は中央が後ろへ湾曲し、両端を黒いパイプで支える。
function addPlywoodChair(m, P, L, D, z0, zs, z1, seat, back, frame) {
  const shell = [[0.08, 0.12], [0.92, 0.12], [0.99, 0.21], [0.99, 0.88],
    [0.91, 0.98], [0.09, 0.98], [0.01, 0.88], [0.01, 0.21]].map(([x, y]) => P(x * L, y * D));
  prismPoly(m, shell, zs - 0.019, zs, seat, { bottom: true });
  const arc = [0.02, 0.25, 0.5, 0.75, 0.98].map(x => [x * L, D * (0.012 + 0.11 * (2 * x - 1) ** 2)]);
  const panel = [...arc.map(([x, y]) => P(x, y)), ...arc.slice().reverse().map(([x, y]) => P(x, y + 0.014))];
  prismPoly(m, panel, z1 - 0.19, z1, back, { bottom: true });
  for (const [foot, joint] of [[0.02, 0.065], [0.98, 0.935]]) {
    const x = joint * L;
    bar(m, [P(foot * L, 0.045 * D), z0], [P(x, 0.16 * D), zs], 0.017, frame);
    bar(m, [P(foot * L, 0.985 * D), z0], [P(x, 0.88 * D), zs], 0.017, frame);
    bar(m, [P(x, 0.16 * D), zs], [P(x, 0.065 * D), z1 - 0.035], 0.017, frame);
    bar(m, [P(x, 0.16 * D), zs - 0.034], [P(x, 0.88 * D), zs - 0.034], 0.018, frame);
  }
}

// IMG_1393 の丸テーブル席。浅い丸座の後ろに細いパイプが立ち、上端だけに湾曲した木の背が付く。
function addHoopChair(m, P, L, D, z0, zs, z1, wood, metal) {
  const seat = Array.from({length: 20}, (_, i) => {
    const a = Math.PI * i / 10;
    return P(L * (.5 + .49 * Math.cos(a)), D * (.53 + .43 * Math.sin(a)));
  });
  prismPoly(m, seat, zs - .025, zs, wood, {bottom: true});
  const arc = Array.from({length: 9}, (_, i) => {
    const a = i * Math.PI / 8;
    return [L * (.5 - .49*Math.cos(a)), D * (.32 - .30*Math.sin(a))];
  });
  const band = [...arc.map(([x,y]) => P(x,y)), ...arc.slice().reverse().map(([x,y]) => P(x,y+.022))];
  prismPoly(m, band, z1-.055, z1, wood, {bottom:true});
  for (const side of [-1,1]) {
    const foot = L*(.5+side*.49), joint = L*(.5+side*.40);
    bar(m,[P(foot,0),z0],[P(joint,D*.25),zs],.019,metal);
    bar(m,[P(foot,D),z0],[P(joint,D*.78),zs],.019,metal);
    bar(m,[P(joint,D*.25),zs],[P(foot,D*.32),z1-.026],.016,metal);
  }
}

// 平面上の角を円弧にする。P の最初の軸が家具の幅、次の軸が奥行き。
function roundedRect(P, x0, y0, x1, y1, radius) {
  const r = Math.min(radius, (x1 - x0) / 2, (y1 - y0) / 2);
  const corners = [[x1 - r, y1 - r], [x0 + r, y1 - r], [x0 + r, y0 + r], [x1 - r, y0 + r]];
  return corners.flatMap(([x, y], i) => [0, 1, 2, 3].map(j => {
    const a = (i + j / 3) * Math.PI / 2;
    return P(x + r * Math.cos(a), y + r * Math.sin(a));
  }));
}

// 水平な輪郭を順に結ぶ。最後に内側へ折り返すと、縁から内面まで連続した器にもなる。
function loftBands(m, levels, color) {
  const winding = Math.sign(ringArea(levels[0][0]));
  for (let k = 1; k < levels.length; k++) {
    const [lower, za] = levels[k - 1], [upper, zb] = levels[k];
    lower.forEach((p, i) => {
      const j = (i + 1) % lower.length, q = lower[j];
      const edge = sub(q, p), across = sub(upper[i], p), dz = zb - za;
      const normal = [edge[1] * dz, -edge[0] * dz, edge[0] * across[1] - edge[1] * across[0]];
      const length = Math.hypot(...normal);
      if (length < 1e-8) return;
      face(m, [[p, za], [q, za], [upper[j], zb], [upper[i], zb]], normal.map(v => v * winding / length), color);
    });
  }
}

// Attic Lab の成形椅子。回転脚のシェル、木脚の合板椅子、布張りの肘掛け椅子。
function addStudyChair(m, it, P, L, D, z0, zs, z1, seat, frame, T) {
  const swivel = it.style === "swivel", padded = it.style === "paddedArms";
  const backColor = it.color3 ? T(it.color3) : seat;
  const pan = roundedRect(P, L * 0.025, D * 0.065, L * 0.975, D * 0.985, 0.075);
  prismPoly(m, pan, zs - (padded ? 0.055 : 0.022), zs, seat, { bottom: true });
  const profile = (width, y, curve, thick) => {
    const arc = [-1, -0.72, -0.38, 0, 0.38, 0.72, 1].map(t => [L * (0.5 + width * t / 2), D * (y + curve * t * t)]);
    return [...arc.map(([x, d]) => P(x, d)), ...arc.slice().reverse().map(([x, d]) => P(x, d + thick))];
  };
  const thickness = padded ? 0.044 : 0.016;
  const levels = [
    [profile(0.74, 0.12, 0.12, thickness), zs - 0.012],
    [profile(0.94, 0.045, swivel ? 0.30 : 0.17, thickness), zs + (z1 - zs) * 0.37],
    [profile(0.84, 0.013, swivel ? 0.20 : 0.12, thickness), z1 - 0.035],
    [profile(0.74, 0.02, 0.12, thickness * 0.7), z1],
  ];
  loftBands(m, levels, backColor);
  m.polygon([levels[3][0]], z1, [0, 0, 1], backColor);
  if (swivel) {
    const center = P(L / 2, D * 0.52);
    bar(m, [center, z0 + 0.105], [center, zs - 0.018], 0.045, frame);
    for (let i = 0; i < 5; i++) {
      const a = (i * 2 + 0.24) * Math.PI / 5;
      const x = L * (0.5 + 0.45 * Math.cos(a)), y = D * (0.52 + 0.43 * Math.sin(a));
      bar(m, [center, z0 + 0.135], [P(x, y), z0 + 0.065], 0.023, frame);
      addCylinder(m, P(x - 0.014, y), P(x + 0.014, y), z0 + 0.031, 0.031, T("#494949"), null, false, 8);
    }
    return;
  }
  for (const side of [-1, 1]) {
    const x = L * (0.5 + 0.42 * side), foot = L * (0.5 + 0.47 * side);
    for (const y of [0.05, 0.94]) bar(m, [P(foot, D * y), z0], [P(x, D * (0.50 + (y - 0.5) * 0.79)), zs - 0.02], 0.031, frame);
    if (padded) {
      const arm = [[0.13, 0.47], [0.27, 0.55], [0.65, 0.54], [0.73, 0.44], [0.69, 0.32], [0.26, 0.04]];
      for (let i = 1; i < arm.length; i++) {
        const point = ([y, z]) => [P(foot, D * y), zs + (z1 - zs) * z];
        bar(m, point(arm[i - 1]), point(arm[i]), 0.026, frame);
      }
    }
  }
}

function addWrapSofa(m, P, L, D, z0, zs, z1, cloth, legs) {
  for (const x of [0.13, L - 0.13]) for (const y of [0.13, D - 0.15]) {
    bar(m, [P(x, y), z0], [P(x + (L / 2 - x) * 0.07, y), z0 + 0.16], 0.035, legs);
  }
  const base = roundedRect(P, 0.02, 0.03, L - 0.02, D - 0.02, 0.15);
  prismPoly(m, base, z0 + 0.14, zs - 0.085, cloth, { bottom: true });
  const seat = roundedRect(P, 0.105, 0.105, L - 0.105, D - 0.015, 0.12);
  prismPoly(m, seat, zs - 0.084, zs, cloth, { bottom: true });
  // 背から袖まで一枚の布で回り込み、袖の先だけ座面に向けて下がる。
  const path = [[0.055,0.72], [0.055,0.43], [0.065,0.26], [0.105,0.135], [0.18,0.075], [0.29,0.063]];
  const side = path.map(([x, y]) => [Math.min(L * 0.32, x), D * y]);
  const outer = [...side, ...side.slice().reverse().map(([x, y]) => [L - x, y])];
  const sections = outer.map(([x, y], i) => {
    const prev = outer[Math.max(0, i - 1)], next = outer[Math.min(outer.length - 1, i + 1)];
    const dx = next[0] - prev[0], dy = next[1] - prev[1], length = Math.hypot(dx, dy);
    const nx = -dy / length, ny = dx / length;
    const height = z1 - (z1 - zs) * Math.max(0, (y / D - 0.24) * 1.15);
    const at = (offset, z) => [P(x + nx * offset, y + ny * offset), z];
    return [at(0, zs - 0.08), at(-0.028, height - 0.045), at(0.006, height), at(0.085, height - 0.007), at(0.12, height - 0.055), at(0.12, zs - 0.025)];
  });
  for (let i = 1; i < sections.length; i++) {
    const a = sections[i - 1], b = sections[i], d = sub(b[0][0], a[0][0]), length = len(d);
    const out = ringArea(base) > 0 ? 1 : -1;
    const normal = [out * d[1] / length, -out * d[0] / length, 0];
    for (let j = 0; j < a.length - 1; j++) {
      const n = j === 2 ? [0, 0, 1] : j < 2 ? normal : [-normal[0], -normal[1], 0];
      face(m, [a[j], b[j], b[j + 1], a[j + 1]], n, cloth);
    }
  }
  for (const end of [sections[0], sections.at(-1)]) {
    const ahead = sub(P(0, 1), P(0, 0)), normal = [...ahead, 0];
    face(m, [end[0], end[1], end[4], end[5]], normal, cloth);
    face(m, [end[1], end[2], end[3], end[4]], normal, cloth);
  }
}

// IMG_1077 の閲覧椅子。薄い合板が座面から背まで続き、背の両端が少し手前に回る。
function addReadingChair(m, P, L, D, z0, zs, z1, shell, metal) {
  const seat = [[0.03,0.10], [0.97,0.10], [0.99,0.88], [0.93,0.98], [0.07,0.98], [0.01,0.88]];
  prismPoly(m, seat.map(([x,y]) => P(x * L, y * D)), zs - 0.015, zs, shell, { bottom: true });
  const profile = (inset, y) => {
    const arc = [[inset,y+0.07], [0.5,y], [1-inset,y+0.07]];
    return [...arc.map(([x,d]) => P(x*L, d*D)), ...arc.reverse().map(([x,d]) => P(x*L, d*D+0.013))];
  };
  const rim = profile(0.07, 0.015);
  loftBands(m, [[profile(0.04,0.13), zs-0.014], [profile(0.025,0.07), zs+0.075], [rim, z1]], shell);
  m.polygon([rim], z1, [0,0,1], shell);
  for (const x of [0.045, 0.955]) for (const y of [0.045, 0.945]) {
    bar(m, [P(x*L, y*D), z0], [P((0.5+(x-0.5)*0.86)*L, (0.5+(y-0.5)*0.79)*D), zs-0.015], 0.015, metal);
  }
}

// 学習棟 2 階のグループ席。白い樹脂の背と座面下の荷物受け、濃色の座、キャスター付きの十字脚。
function addBucketChair(m, P, L, D, z0, zs, z1, white, T) {
  const ellipse = (a, rx, ry) => P(L*(0.5+rx*Math.sin(a)), D*(0.52-ry*Math.cos(a)));
  const ring = (rx, ry) => Array.from({length: 20}, (_,i) => ellipse(i*Math.PI/10, rx, ry));
  const tray = z0 + 0.19;
  prismPoly(m, ring(0.43,0.42), tray-0.025, tray, white, { bottom: true });
  prismPoly(m, ring(0.46,0.45), zs-0.038, zs, T("#51483d"), { bottom: true });
  for (let i = -7; i < 7; i++) {
    const a = i*Math.PI/10, b = (i+1)*Math.PI/10;
    const height = ang => zs + (z1-zs)*(0.5+0.5*Math.cos(ang));
    const pa = ellipse(a,0.49,0.48), pb = ellipse(b,0.49,0.48);
    const innerA = ellipse(a,0.45,0.44), innerB = ellipse(b,0.45,0.44);
    const F = frontOf([pa,pb,innerB,innerA]);
    face(m, [[pa,tray-0.02],[pb,tray-0.02],[pb,height(b)],[pa,height(a)]], [...F.nf,0], white);
    face(m, [[innerA,tray],[innerB,tray],[innerB,height(b)],[innerA,height(a)]], [-F.nf[0],-F.nf[1],0], white);
    m.quad([[pa,height(a)],[pb,height(b)],[innerB,height(b)],[innerA,height(a)]], [0,0,1], white);
  }
  const center = P(L/2,D*0.52);
  bar(m, [center,z0+0.07], [center,tray], 0.052, white);
  for (let i = 0; i < 4; i++) {
    const angle = (i+0.5)*Math.PI/2, foot = ellipse(angle,0.56,0.55);
    bar(m, [center,z0+0.086], [foot,z0+0.060], 0.038, white);
    addCylinder(m, [foot[0]-0.016,foot[1]], [foot[0]+0.016,foot[1]], z0+0.028, 0.028, T("#454747"), null, false, 8);
  }
}

// 椅子とソファー。四角 r の最初の辺が背、z1 が背の上端。
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
    if (it.style === "wrap") return addWrapSofa(m, P, L, D, z0, zs, z1, cloth, legC);
    const arm = Math.min(0.14, L * 0.16), back = Math.min(0.2, D * 0.25);
    for (const x of [0.07, L - 0.07]) for (const y of [0.07, D - 0.07]) bar(m, [P(x, y), z0], [P(x, y), zl + 0.01], 0.035, legC);
    prismPoly(m, rect(0.01, 0.01, L - 0.01, D - 0.01), zl, zs - 0.12, cloth, { bottom: true }); // 台
    prismPoly(m, rect(arm, back, L - arm, D - 0.02), zs - 0.12, zs, cloth); // 座のクッション
    prismPoly(m, rect(0, 0, L, back), zs - 0.12, z1, cloth); // 背
    for (const [xa, xb] of [[0, arm], [L - arm, L]]) prismPoly(m, rect(xa, back, xb, D), zs - 0.12, Math.min(z1, zs + 0.2), cloth); // ひじ掛け
    return;
  }
  if (it.kind === "tseat") {
    // 劇場の椅子（2026-11-18、70周年記念講堂。ユーザー「椅子がおかしい」「箱で作る必要はないよ」）：両わきの木の袖（ひじ掛け。前が少し低い）、
    // 布の座（前へ少し上がる）、布の背もたれ、後ろに明るい木の背の板（上の角を落とす）。color＝布、color2＝袖、color3＝背の板
    const cloth = col || T("tseatCloth"), sideC = col2 || T("tseatSide"), wood = it.color3 ? tint(COL_HEX(it.color3)) : T("tseatWood");
    if (it.style === "auditorium") return addAuditoriumSeat(m, P, L, D, z0, z1, cloth, wood, sideC);
    const zSeat = z0 + Math.min(0.44, H * 0.5), zArm = z0 + Math.min(0.62, H * 0.7), sw = Math.min(0.045, L * 0.09), bt = Math.min(0.05, D * 0.09), bc = Math.min(0.09, D * 0.16);
    // 袖：後ろは背のてっぺんの少し下まで、前はひじ掛けの高さ
    for (const [xa, xb] of [[0, sw], [L - sw, L]]) {
      prismPoly(m, rect(xa, 0, xb, bt + bc), z0, z1 - 0.1, sideC, { sideCol: sideC });
      prismPoly(m, rect(xa, bt + bc, xb, D - 0.03), z0, zArm, sideC, { sideCol: sideC });
    }
    // 背の板（木）：下は座の下から、上は角を落とした 2 段
    prismPoly(m, rect(sw, 0, L - sw, bt), z0 + 0.14, z1 - 0.05, wood, { sideCol: wood, bottom: true });
    prismPoly(m, rect(sw + L * 0.12, 0, L - sw - L * 0.12, bt), z1 - 0.05, z1, wood, { sideCol: wood });
    // 背もたれ（布）と座（布。前のふちを 2 cm 高く）
    prismPoly(m, rect(sw + 0.01, bt, L - sw - 0.01, bt + bc), zSeat - 0.02, z1 - 0.07, cloth, { sideCol: cloth });
    prismPoly(m, rect(sw + 0.01, bt + bc, L - sw - 0.01, D - 0.06), zSeat - 0.11, zSeat, cloth, { sideCol: cloth, bottom: true });
    prismPoly(m, rect(sw + 0.01, D - 0.16, L - sw - 0.01, D - 0.04), zSeat, zSeat + 0.02, cloth, { sideCol: cloth });
    return;
  }
  const zs = z0 + Math.min(0.45, H * 0.56); // 座面の高さ
  if (it.style === "readingShell") return addReadingChair(m, P, L, D, z0, zs, z1, col || T("birch"), col2 || T("chairLeg"));
  if (it.style === "bucket") return addBucketChair(m, P, L, D, z0, zs, z1, col || T("whiteItem"), T);
  if (["swivel", "bentShell", "paddedArms"].includes(it.style)) return addStudyChair(m, it, P, L, D, z0, zs, z1, col || T("chairShell"), col2 || T("woodFrame"), T);
  if (it.style === "seminar") return addSeminarChair(m, P, rect, L, D, z0, zs, z1, col || T("seat"), T);
  if (it.style === "webbed") return addWebbedChair(m, P, rect, L, D, z0, zs, z1, col2 || T("woodFrame"), col || T("red"));
  if (it.style === "cafeHoop") return addHoopChair(m, P, L, D, z0, zs, z1, col || T("birch"), col2 || T("chairLeg"));
  if (it.style === "plywood") return addPlywoodChair(m, P, L, D, z0, zs, z1, col || T("chairSeat"), it.color3 ? T(it.color3) : T("chairSeat"), col2 || T("chairLeg"));
  if (it.kind === "chair") {
    const shell = col || T("chairShell"), legC = col2 || T("chairLeg");
    for (const x of [0.05, L - 0.05]) for (const y of [0.06, D - 0.05]) bar(m, [P(x, y), z0], [P(x, y), zs - 0.03], 0.024, legC);
    prismPoly(m, rect(0.01, 0.03, L - 0.01, D - 0.01), zs - 0.035, zs, shell, { bottom: true });
    prismPoly(m, rect(0.03, 0, L - 0.03, 0.035), zs, z1, shell, { bottom: true });
    return;
  }
  // woodchair：後ろの 2 本の脚は背のてっぺんまで（背の柱）
  const fr = col2 || T("woodFrame"), seat = col || T("chairSeat");
  if (it.folding) {
    // Taki Plaza B1: each side is an open polygon of walnut planks, with a wide central backrest.
    // Extrude a convex side profile across the grain. Coordinates are fractions of depth and height.
    const plank = (x0, x1, profile, color) => {
      const yz = profile.map(([y, z]) => [D * y, H * z]);
      const side = (x) => yz.map(([y, z]) => [P(L * x, y), z0 + z]);
      const left = side(x0), right = side(x1);
      face(m, left, [-u[0], -u[1], 0], color);
      face(m, right, [u[0], u[1], 0], color);
      const sign = Math.sign(ringArea(yz));
      for (let i = 0; i < yz.length; i++) {
        const j = (i + 1) % yz.length, dy = yz[j][0] - yz[i][0], dz = yz[j][1] - yz[i][1];
        const scale = sign / Math.hypot(dy, dz);
        face(m, [left[i], left[j], right[j], right[i]], [v[0] * dz * scale, v[1] * dz * scale, -dy * scale], color);
      }
    };
    for (const x of [0.015, 0.945]) {
      plank(x, x + 0.04, [[0.02, 1], [0.19, 0.93], [0.96, 0], [0.89, 0]], fr);
      const inset = x < 0.5 ? 0.041 : -0.041;
      plank(x + inset, x + inset + 0.04, [[0.07, 0], [0.14, 0], [0.83, 0.58], [0.68, 0.65]], fr);
      plank(x, x + 0.04, [[0.02, 1], [0.09, 0.9], [0.74, 0.59], [0.8, 0.62]], fr);
    }
    plank(0.045, 0.955, [[0.25, 0.44], [0.95, 0.54], [0.96, 0.59], [0.25, 0.49]], seat);
    plank(0.30, 0.70, [[0.25, 0.49], [0.30, 0.50], [0.10, 0.965], [0.055, 0.95]], seat);
    plank(0.012, 0.988, [[0.022, 0.995], [0.072, 1], [0.13, 0.92], [0.075, 0.91]], fr);
    return;
  }
  for (const x of [0.03, L - 0.03]) {
    bar(m, [P(x, 0.03), z0], [P(x, 0.03), z1], 0.032, fr);
    bar(m, [P(x, D - 0.03), z0], [P(x, D - 0.03), zs], 0.032, fr);
  }
  prismPoly(m, rect(0.02, 0.02, L - 0.02, D - 0.02), zs - 0.03, zs, seat, { bottom: true });
  // 背の板（color3：西5号館の食堂の黒い鉄の枠にオークの背。2026-11-15）：背の柱のあいだの高さ 0.17 の板
  if (it.color3) prismPoly(m, rect(0.02, 0.01, L - 0.02, 0.045), z1 - 0.19, z1 - 0.02, tint(COL_HEX(it.color3)), { bottom: true });
  bar(m, [P(0.03, 0.03), z1 - 0.04], [P(L - 0.03, 0.03), z1 - 0.04], 0.05, fr);
  bar(m, [P(0.03, 0.03), zs + 0.18], [P(L - 0.03, 0.03), zs + 0.18], 0.025, fr);
  for (const y of [0.03, D - 0.03]) bar(m, [P(0.03, y), z0 + 0.16], [P(L - 0.03, y), z0 + 0.16], 0.018, fr);
}

// 東のテラス（IMG_1488、36〜60 秒）。角を丸めた天板と一枚の台座、湾曲した二枚の背板。
function addSlattedFurniture(m, it, r, z0, z1, T) {
  const paint = T(it.color || "#43574b"), frame = T(it.color2 || "#364b40");
  const across = sub(r[1], r[0]), depth = sub(r[3], r[0]);
  const p = (x, y) => [r[0][0] + x * across[0] + y * depth[0], r[0][1] + x * across[1] + y * depth[1]];
  const h = (t) => z0 + (z1 - z0) * t;
  const rail = (x, y, z, x2, y2, z2, w) => bar(m, [p(x, y), h(z)], [p(x2, y2), h(z2)], w, frame);
  const plate = (pts, lo, hi, col) => prismPoly(m, pts.map(([x,y]) => p(x,y)), h(lo), h(hi), col, { bottom: true });
  if (it.kind === "table") {
    for (let i = 0; i < 7; i++) {
      const y = i / 7 + 0.004, end = (i + 1) / 7 - 0.004, corner = 0.045;
      const front = i === 0 ? [[0, y + corner], [corner, y], [1 - corner, y], [1, y + corner]] : [[0, y], [1, y]];
      const back = i === 6 ? [[1, end - corner], [1 - corner, end], [corner, end], [0, end - corner]] : [[1, end], [0, end]];
      plate([...front, ...back], 0.972, 1, paint);
    }
    plate([[.27,.24],[.73,.24],[.76,.27],[.76,.73],[.73,.76],[.27,.76],[.24,.73],[.24,.27]], 0.005, 0.034, frame);
    for (const x of [0.44, 0.56]) {
      for (const y of [0.44, 0.56]) {
        const dx = x < 0.5 ? -1 : 1, dy = y < 0.5 ? -1 : 1;
        rail(x, y, 0.034, x, y, 0.72, 0.034);
        rail(x, y, 0.72, x + dx * 0.05, y + dy * 0.05, 0.87, 0.032);
        rail(x + dx * 0.05, y + dy * 0.05, 0.87, x + dx * 0.19, y + dy * 0.19, 0.96, 0.028);
      }
    }
    for (const x of [0.23, 0.77]) rail(x, 0.08, 0.96, x, 0.92, 0.96, 0.025);
    return;
  }
  for (let i = 0; i < 3; i++) {
    const y = 0.13 + i * 0.26, end = y + 0.248;
    const slat = [[.075,y+.024],[.13,y],[.51,y+.022],[.87,y],[.925,y+.024],
      [.925,end-.025],[.88,end],[.5,end+.027],[.12,end],[.075,end-.025]];
    plate(slat, 0.514, 0.539, paint);
  }
  for (const x of [0.065, 0.935]) {
    const foot = x < 0.5 ? 0.01 : 0.99;
    rail(foot, 0.015, 0, x, 0.19, 0.52, 0.022);
    rail(foot, 0.99, 0, x, 0.82, 0.52, 0.022);
    rail(x, 0.17, 0.51, x, 0.85, 0.51, 0.022);
    rail(x, 0.19, 0.53, x, 0.067, 0.99, 0.022);
    rail(x, 0.82, 0.51, x, 0.84, 0.69, 0.019);
    rail(x, 0.84, 0.69, x, 0.77, 0.735, 0.019);
    rail(x, 0.77, 0.735, x, 0.13, 0.735, 0.027);
  }
  for (const [y, lo, hi] of [[.056,.775,.873],[.022,.885,.986]]) {
    const arc = [.065,.25,.5,.75,.935].map(x => [x, y + .085 * (2 * x - 1) ** 2]);
    plate([...arc, ...arc.slice().reverse().map(([x,v]) => [x,v+.023])], lo, hi, paint);
  }
}

// 輪郭は現地写真から採った平面形。その内側に積層の天板、そり脚、電源タップを組む。
function addSlabTable(M, r, z0, z1, grid, T, highlight) {
  const { m } = M;
  const u = dirOf(grid?.[0] || 0), v = [-u[1], u[0]];
  const extent = axis => {
    const values = r.map(p => p[0] * axis[0] + p[1] * axis[1]);
    return [Math.min(...values), Math.max(...values)];
  };
  const [x0, x1] = extent(u), [y0, y1] = extent(v);
  const P = (x, y) => [u[0] * (x0 + x) + v[0] * (y0 + y), u[1] * (x0 + x) + v[1] * (y0 + y)];
  const W = x1 - x0, D = y1 - y0, metal = T("steel");
  for (const x of [W * 0.26, W * 0.74]) {
    for (const y of [D * 0.25, D * 0.75]) bar(m, [P(x, y), z0 + 0.018], [P(x, y), z1 - 0.10], 0.032, metal);
    bar(m, [P(x, D * 0.25), z0 + 0.018], [P(x, D * 0.75), z0 + 0.018], 0.032, metal);
  }
  const layers = ["#aa7e4a", "#c39560", "#ac8251", "#d0a675", "#bb905b"];
  layers.forEach((tone, i) => prismPoly(m, r, z1 - 0.105 + i * 0.021, z1 - 0.105 + (i + 1) * 0.021, T(tone), { top: false, bottom: i === 0 }));
  drawFloorFinish(M, [[r]], "pine", floorUV("pine", grid), z1, T, highlight);
  const strip = (a, b, c, d) => [[a, b], [c, b], [c, d], [a, d]].map(([x, y]) => P(W / 2 + x, D / 2 + y));
  prismPoly(m, strip(-0.031, -0.115, 0.031, 0.115), z1, z1 + 0.022, T("whiteItem"));
  for (const y of [-0.062, 0, 0.062]) for (const x of [-0.009, 0.009]) {
    m.polygon([strip(x - 0.002, y - 0.005, x + 0.002, y + 0.005)], z1 + 0.024, [0, 0, 1], T("darkItem"));
  }
}

function addStudyTable(m, it, r, z0, z1, T) {
  const F = frontOf(r), L = F.L, D = depthOf(F, r);
  const P = (x, y) => [F.a[0] + F.u[0] * x - F.nf[0] * y, F.a[1] + F.u[1] * x - F.nf[1] * y];
  const counter = it.style === "railCounter", sections = counter ? Math.max(1, Math.round(L / 2.95)) : 1;
  const wood = T(it.color || "#e6d1a7"), edge = T("#c4a577"), white = T("#e7e7df"), foot = T("#797971");
  const grain = T(counter ? "#d5bd95" : "#dcc59d");
  for (let k = 0; k < sections; k++) {
    const x0 = L * k / sections + 0.002, x1 = L * (k + 1) / sections - 0.002;
    const top = roundedRect(P, x0, 0, x1, D, counter ? 0.008 : 0.058);
    prismPoly(m, top, z1 - 0.032, z1, wood, { bottom: true, sideCol: edge });
    for (let j = 1; j <= 6; j++) {
      const x = x0 + 0.07 + (x1 - x0) * hash2(k + 2, j) * 0.3, y = D * j / 7;
      const end = x1 - 0.08 - (x1 - x0) * hash2(j, 5) * 0.28;
      m.polygon([[P(x, y), P((x + end) / 2, y + 0.003), P(end, y), P((x + end) / 2, y + 0.006)]], z1 + 0.001, [0,0,1], grain);
    }
    const cx = (x0 + x1) / 2, cy = D * (counter ? 0.77 : 0.5);
    const well = roundedRect(P, cx - 0.10, cy - 0.048, cx + 0.10, cy + 0.048, 0.014);
    m.polygon([well], z1 + 0.002, [0,0,1], T("#9f9b91"));
    m.polygon([[P(cx - 0.095, cy - 0.044), P(cx + 0.095, cy - 0.044), P(cx + 0.095, cy + 0.020), P(cx - 0.095, cy + 0.020)]], z1 + 0.003, [0,0,1], T("#dddcd4"));
  }
  // カウンターの継ぎ目には一組の脚を共用。独立机は白い丸パイプの両端が外へ開く。
  for (let i = 0; i <= sections; i++) {
    const x = i === 0 ? 0.12 : i === sections ? L - 0.12 : L * i / sections;
    for (const y of [0.075, D - 0.075]) {
      const bottom = P(x + (counter ? 0 : i === 0 ? -0.065 : 0.065), y + (y < D / 2 ? -0.025 : 0.025));
      const upper = P(x, y + (y < D / 2 ? 0.07 : -0.07));
      const legRing = p => Array.from({ length: 8 }, (_, j) => [p[0] + 0.019 * Math.cos(j * Math.PI / 4), p[1] + 0.019 * Math.sin(j * Math.PI / 4)]);
      const footRing = legRing(bottom);
      loftBands(m, [[footRing, z0], [footRing, z0 + 0.023]], foot);
      loftBands(m, [[footRing, z0 + 0.023], [legRing(upper), z1 - 0.068]], white);
      bar(m, [upper, z1 - 0.068], [P(x, D / 2), z1 - 0.049], 0.036, white);
    }
  }
  bar(m, [P(0.12, D / 2), z1 - 0.06], [P(L - 0.12, D / 2), z1 - 0.06], 0.045, white);
}

function addCafeTable(m, it, r, z0, z1, T) {
  const c = centroid(r), R = Math.min(...r.map(p => len(sub(p, c))));
  const paint = T(it.color || "#ecebe5");
  const leg = it.color2 ? T(it.color2) : paint;
  prismPoly(m, r, z1 - 0.025, z1, paint, { bottom: true });
  for (let k = 0; k < 3; k++) {
    const a = (2 * k + 0.4) * Math.PI / 3;
    const p = radius => [c[0] + radius * Math.cos(a), c[1] + radius * Math.sin(a)];
    bar(m, [p(R * 0.76), z0], [p(R * 0.42), z1 - 0.025], 0.026, leg);
  }
}

// 最初の辺は器具の壁側。洗面台は天板に開口を抜き、下がった内面に排水口を置く。
function addWashroomFixture(m, it, r, z0, z1, T) {
  const F = frontOf(r), L = F.L, D = depthOf(F, r), H = z1 - z0;
  const P = (x, y) => [F.a[0] + F.u[0] * x - F.nf[0] * y, F.a[1] + F.u[1] * x - F.nf[1] * y];
  const ellipse = (x, y, rx, ry) => Array.from({ length: 20 }, (_, j) => {
    const a = j * Math.PI / 10;
    return P(x + rx * Math.cos(a), y + ry * Math.sin(a));
  });
  const china = T("#f4f2eb"), inner = T("#e1e4df"), metal = T("#a2acac");
  if (it.style === "tank") {
    const shell = roundedRect(P, 0.006, 0.015, L - 0.006, D, 0.044);
    prismPoly(m, shell, z0 + H * 0.35, z1 - 0.032, china, { bottom: true });
    const lid = roundedRect(P, 0, 0, L, D, 0.040);
    prismPoly(m, lid, z1 - 0.029, z1, china, { sideCol: inner });
    m.polygon([ellipse(L * 0.62, D / 2, 0.026, 0.019)], z1 + 0.002, [0,0,1], metal);
    return;
  }
  if (it.style === "vanity") {
    const count = Math.max(1, Math.round(L / 1.12)), holes = [], rim = roundedRect(P, 0, 0, L, D, 0.035);
    for (let i = 0; i < count; i++) {
      const x = (i + 0.5) * L / count, y = D * 0.56, rx = Math.min(0.24, L / count * 0.42), ry = D * 0.32;
      const opening = ellipse(x, y, rx, ry), drain = ellipse(x, y - 0.025, 0.021, 0.020);
      holes.push(opening);
      loftBands(m, [[opening, z1], [ellipse(x, y, rx * 0.88, ry * 0.84), z1 - 0.028], [drain, z0 + 0.012]], inner);
      m.polygon([drain], z0 + 0.013, [0,0,1], metal);
      const stem = P(x, D * 0.13), outlet = P(x, D * 0.39);
      bar(m, [stem, z1], [stem, z1 + 0.11], 0.026, metal);
      bar(m, [stem, z1 + 0.11], [outlet, z1 + 0.10], 0.026, metal);
      bar(m, [outlet, z1 + 0.077], [outlet, z1 + 0.10], 0.023, metal);
    }
    prismPoly(m, rim, z0, z1, china, { top: false });
    m.polygon([rim, ...holes], z1, [0,0,1], china);
    for (const x of [L * 0.16, L * 0.84]) bar(m, [P(x, 0.05), z0 - 0.13], [P(x, D * 0.72), z0], 0.038, metal);
    return;
  }
  const cx = L / 2, cy = D * 0.51;
  const bowl = (rx, ry, shift = 0) => ellipse(cx, cy + shift * D, L * rx, D * ry);
  const outer = bowl(0.50, 0.485), lip = bowl(0.37, 0.37), well = bowl(0.17, 0.18);
  if (it.style === "urinal") {
    const mouth = z0 + H * 0.30;
    const back = roundedRect(P, L * 0.04, 0, L * 0.96, D * 0.24, 0.055);
    prismPoly(m, back, mouth - 0.04, z1 - 0.015, china, { bottom: true });
    loftBands(m, [[bowl(0.24, 0.26, -0.13), z0], [outer, mouth - 0.024], [lip, mouth], [well, z0 + 0.05]], china);
    m.polygon([well], z0 + 0.051, [0,0,1], inner);
    return;
  }
  const base = bowl(0.31, 0.31, -0.10);
  loftBands(m, [[base, z0], [bowl(0.29, 0.29, -0.10), z0 + H * 0.35], [outer, z1 - 0.058], [outer, z1 - 0.024]], china);
  loftBands(m, [[outer, z1 - 0.024], [bowl(0.48, 0.47), z1], [lip, z1], [lip, z1 - 0.038], [well, z0 + H * 0.53]], inner);
  m.polygon([well], z0 + H * 0.53, [0,0,1], T("#c1d2d2"));
}

function addWashroomMirror(m, r, z0, z1, T) {
  const F = frontOf(r), edge = T("#b5bdbc");
  prismPoly(m, r, z0, z1, edge, { bottom: true });
  frontQuad(m, F, 0.012, F.L - 0.012, z0 + 0.012, z1 - 0.012, 0.002, T("#bbc9c9"));
  frontQuad(m, F, 0.014, F.L - 0.014, z1 - 0.045, z1 - 0.015, 0.003, T("#d1dbd8"));
}

function addStallDoor(m, r, z0, z1, T) {
  const F = frontOf(r);
  prismPoly(m, r, z0, z1, T("#e2e1d9"), { sideCol: T("#d3d1c7"), bottom: true });
  for (const hinge of [z0 + 0.15, z1 - 0.21]) frontQuad(m, F, 0.01, 0.045, hinge, hinge + 0.08, 0.002, T("steelEdge"));
  for (const side of [F, frontOf([r[3], r[2], r[1], r[0]])]) {
    frontQuad(m, side, F.L - 0.10, F.L - 0.047, z0 + 0.79, z0 + 0.86, 0.006, T("steelEdge"));
    frontQuad(m, side, F.L - 0.097, F.L - 0.062, z0 + 0.81, z0 + 0.835, 0.009, T("#74897a"));
  }
}

function addSeminarTable(m, r, z0, z1, T) {
  // 左右のT字脚、天板下の黒い受け、白い幕板。
  const wide = len(sub(r[1], r[0])) >= len(sub(r[2], r[1])) ? r : [r[1], r[2], r[3], r[0]];
  const F = frontOf(wide), D = depthOf(F, wide);
  const P = (x, y) => [F.a[0] + F.u[0] * x - F.nf[0] * y, F.a[1] + F.u[1] * x - F.nf[1] * y];
  const white = T("#eeede8"), frame = T("#cfcec8"), dark = T("#464745");
  prismPoly(m, r, z1 - 0.03, z1, white, { bottom: true, sideCol: frame });
  segBox(m, P(0.055, D / 2), P(F.L - 0.055, D / 2), D * 0.69, z1 - 0.097, z1 - 0.097, z1 - 0.033, z1 - 0.033, dark, { bottom: true });
  for (const x of [0.095, F.L - 0.095]) {
    segBox(m, P(x, 0), P(x, D), 0.065, z0 + 0.022, z0 + 0.022, z0 + 0.06, z0 + 0.06, frame);
    segBox(m, P(x, D * 0.34), P(x, D * 0.53), 0.055, z0 + 0.055, z0 + 0.055, z1 - 0.05, z1 - 0.05, white);
  }
  segBox(m, P(0.096, D * 0.25), P(F.L - 0.096, D * 0.25), 0.018, z1 - 0.31, z1 - 0.31, z1 - 0.095, z1 - 0.095, frame, { bottom: true });
}

// 図書館の長机には銀色の手元灯、地下 2 階の個人席には乳白色の仕切りがつく。
function addLibraryTable(m, it, r, z0, z1, T) {
  const center = centroid(r);
  const edges = r.map((p, i) => sub(r[(i + 1) % r.length], p));
  const longest = edges.reduce((a, b) => len(a) > len(b) ? a : b);
  const u = longest.map(v => v / len(longest)), v = [-u[1], u[0]];
  const extent = axis => {
    const values = r.map(p => (p[0] - center[0])*axis[0] + (p[1] - center[1])*axis[1]);
    return Math.max(...values) - Math.min(...values);
  };
  const L = extent(u), D = extent(v);
  const P = (x, y) => [center[0] + u[0]*x + v[0]*y, center[1] + u[1]*x + v[1]*y];
  const group = it.style === "groupStudy";
  const metal = T(it.color2 || (group ? "#eeede6" : "#abab9f"));
  prismPoly(m, r, z1-0.031, z1, T(it.color || "#e3c978"), { bottom: true, sideCol: T(group ? "#c4ab79" : "#b5b2a3") });
  for (const x of [-1,1]) for (const y of [-1,1]) {
    const p = P(x*(group ? L*0.29 : L/2-0.055), y*(group ? D*0.36 : D/2-0.055));
    bar(m, [p,z0+0.015], [p,z1-0.031], group ? 0.047 : 0.035, metal);
    bar(m, [p,z0], [p,z0+0.015], group ? 0.041 : 0.03, T("#65665f"));
  }
  if (group) return;
  if (it.style === "carrel") {
    const half = L/2-0.035;
    segBox(m, P(-half,0), P(half,0), 0.018, z1+0.008, z1+0.008, z1+0.43, z1+0.43, T("#d9d8d0"), { bottom: true });
    return;
  }
  const lamps = Math.max(1, Math.round(L / 1.35));
  for (let i = 0; i < lamps; i++) {
    const x = L*((i+0.5)/lamps-0.5), half = Math.min(0.43,L/lamps*0.39);
    const stem = P(x,0), left = P(x-half,0), right = P(x+half,0), z = z1+0.40;
    bar(m, [stem,z1], [stem,z], 0.019, metal);
    segBox(m, left, right, 0.042, z, z, z+0.025, z+0.025, metal);
    m.quad([[P(x-half,-0.016),z],[P(x+half,-0.016),z],[P(x+half,0.016),z],[P(x-half,0.016),z]], [0,0,-1], T("beamLit"));
  }
}

// Padded faces meet at a pinched seam. The top leans back toward the first edge of the footprint.
function addPillow(m, r, z0, z1, color) {
  const along = sub(r[1], r[0]), depth = sub(r[3], r[0]);
  const surface = (x, z, side) => {
    const bulge = (1 - x * x) * (1 - z * z);
    const t = 0.48 - 0.35 * z + side * 0.36 * bulge;
    const s = 0.5 + x * (0.48 - 0.04 * z * z);
    return [[r[0][0] + along[0] * s + depth[0] * t, r[0][1] + along[1] * s + depth[1] * t], z0 + (z1 - z0) * (0.5 + z * (0.46 + 0.04 * x * x))];
  };
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
      const x = i / 3 - 1, z = j / 3 - 1;
      const a = surface(x, z, side), b = surface(x + 1 / 3, z, side);
      const c = surface(x + 1 / 3, z + 1 / 3, side), d = surface(x, z + 1 / 3, side);
      const ac = sub(c[0], a[0]), bd = sub(d[0], b[0]), acZ = c[1] - a[1], bdZ = d[1] - b[1];
      const n = [ac[1] * bdZ - acZ * bd[1], acZ * bd[0] - ac[0] * bdZ, ac[0] * bd[1] - ac[1] * bd[0]];
      const norm = (n[0] * depth[0] + n[1] * depth[1] > 0 ? side : -side) / (Math.hypot(...n) || 1);
      face(m, [a, b, c, d], n.map(k => k * norm), color);
    }
  }
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
function addKitchenItem(M, it, r, z0, z1, T, tint) {
  const m = M.m;
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
    if (it.style === "lit") {
      const panel = (a, b, y0, y1, d, color) => frontQuad(m, F, F.L * a, F.L * b, z0 + H * y0, z0 + H * y1, d, T(color));
      panel(0.045, 0.824, 0.35, 0.943, 0.003, "#b4c3ca");
      panel(0.058, 0.810, 0.367, 0.928, 0.005, "#e4edf0");
      const labels = ["#70946c", "#e3ac6a", "#87aacb", "#92a970", "#dbbe6c", "#a186a7", "#839cb1"];
      for (let row = 0; row < 3; row++) {
        const y = 0.379 + row * 0.183;
        panel(0.06, 0.809, y, y + 0.017, 0.008, "#94aac4");
        for (let col = 0; col < 10; col++) {
          const x = 0.074 + col * 0.074, ink = labels[(col + row * 3) % labels.length];
          panel(x, x + 0.048, y + 0.032, y + 0.13, 0.009, "#f3f0e5");
          panel(x + 0.013, x + 0.035, y + 0.13, y + 0.145, 0.009, ink);
          panel(x, x + 0.048, y + 0.048, y + 0.100, 0.011, ink);
          panel(x + 0.008, x + 0.04, y + 0.002, y + 0.014, 0.012, "#4669a2");
        }
      }
      panel(0.845, 0.955, 0.67, 0.81, 0.009, "#879baa");
      panel(0.857, 0.943, 0.685, 0.79, 0.011, "#e1e6e3");
      panel(0.858, 0.936, 0.52, 0.605, 0.015, "#536b88");
      panel(0.849, 0.947, 0.41, 0.436, 0.011, "#72797a");
      panel(0.20, 0.77, 0.11, 0.233, 0.006, "#515658");
      panel(0.215, 0.755, 0.132, 0.214, 0.009, "#929a9b");
      return;
    }
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
    const rr = it.style === "chromeRing" ? Array.from({length:20}, (_,i) => {
      const a = i * Math.PI / 10;
      return P(F.L*(.5+.485*Math.cos(a)), D*(.5+.485*Math.sin(a)));
    }) : r.map((q) => lerp2(q, ce, 0.28));
    for (let i = 0; i < rr.length; i++) bar(m, [rr[i], zr], [rr[(i + 1) % rr.length], zr], 0.016, T("railSteel"));
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
    // clear（2026-11-18、Taki Plaza 地下 2 階の透明のついたて）：板を描かず、白い枠と脚だけ
    if (!it.clear) segBox(m, P(0.045, yc), P(F.L - 0.045, yc), 0.022, zb0, zb0, zb1, zb1, board, { bottom: true });
    bar(m, [P(0.045, yc), zb1 + 0.012], [P(F.L - 0.045, yc), zb1 + 0.012], 0.028, frame);
    bar(m, [P(0.045, yc), zb0 - 0.012], [P(F.L - 0.045, yc), zb0 - 0.012], 0.028, frame);
    if (!it.clear) segBox(m, P(0.12, yc - 0.055), P(F.L - 0.12, yc - 0.055), 0.07, zb0 - 0.05, zb0 - 0.05, zb0 - 0.02, zb0 - 0.02, T("darkItem"), { bottom: true });
    for (const x of [0.025, F.L - 0.025]) {
      bar(m, [P(x, 0.03), z0 + 0.09], [P(x, D - 0.03), z0 + 0.09], 0.03, frame);
      for (const y of [0.04, D - 0.04]) prismPoly(m, box(x - 0.025, y - 0.025, x + 0.025, y + 0.025), z0, z0 + 0.075, T("darkItem"), { sideCol: T("darkItem") });
    }
    return;
  }
  if (it.kind === "bincab") {
    const body = col || T("whiteItem");
    if (it.style === "openBin" || it.style === "takiLinedBin") {
      const rim = roundedRect(P, 0, 0, F.L, D, 0.042);
      const inset = roundedRect(P, 0.02, 0.02, F.L - 0.02, D - 0.02, 0.030);
      const base = roundedRect(P, 0.028, 0.028, F.L - 0.028, D - 0.028, 0.035);
      loftBands(m, [[base,z0], [rim,z1 - 0.072]], body);
      loftBands(m, [[rim,z1 - 0.072], [rim,z1], [inset,z1], [inset,z1 - 0.12]], col2 || body);
      m.polygon([inset], z1 - 0.12, [0,0,1], T("#727672"));
      if (it.style === "takiLinedBin") addBinLiner(M,F,D,z0,z1,T);
      return;
    }
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
      frontQuad(m, F, 0.025, F.L - 0.025, z, z + 0.012, 0.004, col2 || T("grey"));
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
  if (bottom) {
    const dz = zb0 - za0, slopeLength = Math.hypot(L, dz);
    face(m, [[A1, za0], [B1, zb0], [B2, zb0], [A2, za0]], [u[0] * dz / slopeLength, u[1] * dz / slopeLength, -L / slopeLength], c);
  }
  if (ends) {
    face(m, [[A1, za0], [A2, za0], [A2, za1], [A1, za1]], [-u[0], -u[1], 0], c);
    face(m, [[B2, zb0], [B1, zb0], [B1, zb1], [B2, zb1]], [u[0], u[1], 0], c);
  }
}
// 壁（kind wall）の見切りの帯・幅木・扉の枠（階の trim：{ base（幅木の高さ m）, band（[下, 上]：見切りの帯の床からの高さ m）,
// frame（扉の枠の幅 m） }。本館の廊下。2026-11-15、アクセシビリティマップの写真 em-ent8-2）。帯と幅木は壁の両面から 1.5cm 出た暗い箱で、
// 区間の端の面も包む（柱の出っぱりを回りこむ。となりの区間の箱と重なるところは同じ色）。扉の口：幅木なし、帯は口の上の壁にだけ、
// 枠は口の両わき（口の中へ 2cm）と上。窓の区間：幅木は窓の下の端より低いとき、帯は窓にかからないときだけ
function addTrim(m, pc, t, ba, bb, ta, tb, tr, T) {
  const L = len(sub(pc.b, pc.a));
  if (L < 1e-3) return;
  const u = [(pc.b[0] - pc.a[0]) / L, (pc.b[1] - pc.a[1]) / L];
  const P = (s) => [pc.a[0] + u[0] * s, pc.a[1] + u[1] * s];
  const zAt = (s) => ba + ((bb - ba) * s) / L; // 区間の下の端の高さ（斜めの壁は線形）
  const E = 0.015, tt = t + 2 * E, c = T(tr.col || "trimDark");
  const box = (s0, s1, z0, z1, col, opt) => segBox(m, P(s0), P(s1), tt, zAt(s0) + z0, zAt(s1) + z0, zAt(s0) + z1, zAt(s1) + z1, col, opt);
  const top = Math.min(ta - ba, tb - bb);
  const win = pc.win ? [pc.win[2], pc.win[3]] : null;
  // 帯（band と bands。2026-11-16：本館の廊下は腰の帯と扉の上の帯の 2 本）。扉の口では扉の上の高さの帯だけ、窓にかかる帯は描かない
  for (const bd of [tr.band, ...(tr.bands || [])]) {
    if (!bd || !(top > bd[1] + 0.01) || (pc.door && bd[0] < DOOR_H) || (win && win[0] < bd[1] && win[1] > bd[0])) continue;
    box(-E, L + E, bd[0], bd[1], c, { bottom: true });
  }
  if (tr.base > 0 && !pc.door && top > tr.base && !(win && win[0] < tr.base)) box(-E, L + E, 0, tr.base, T(tr.baseCol || tr.col || "trimDark"));
  if (pc.door && tr.frame > 0 && L >= 0.5 && L <= 2.6 && top > DOOR_H + 0.05) { // 広い口（廊下の続き）には枠をつけない
    const fw = tr.frame, fc = T(tr.frameCol || "doorCase");
    box(-fw, 0.02, 0, DOOR_H + fw, fc);
    box(L - 0.02, L + fw, 0, DOOR_H + fw, fc);
    box(-fw, L + fw, DOOR_H - 0.02, DOOR_H + fw, fc, { bottom: true });
    // 欄間（扉の上のガラスの窓。2026-11-16、本館の廊下）：枠の色の細い框と、壁の両面から少し出た暗いガラスの板
    const ts = tr.transom;
    if (ts && ts[0] > DOOR_H + fw && top > ts[1] + fw + 0.02) {
      box(0.02, L - 0.02, ts[0], ts[1], T("transomGlass"));
      box(-fw, L + fw, ts[0] - fw, ts[0], fc, { bottom: true });
      box(-fw, L + fw, ts[1], ts[1] + fw, fc, { bottom: true });
      box(-fw, 0.02, ts[0], ts[1], fc);
      box(L - 0.02, L + fw, ts[0], ts[1], fc);
      if (L > 1.4) box(L / 2 - fw / 2, L / 2 + fw / 2, ts[0], ts[1], fc);
    }
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
    // a0：区間の始めの点（ceilRuns・offGlazed で区間を細かく分けても残る＝分けた区間の点の、折れ線の始めからの長さを s0 + |点 − a0| で出せる）
    out.push({ a: at(s0), b: at(s1), a0: at(s0), s0, s1, door, win: door ? null : wins.find(([d0, d1]) => mid > d0 && mid < d1) || null });
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
    if (s.ramp) return zA + R * Math.max(0, Math.min(1, sv / L));
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
// 球（中心 c・高さ zc・半径 R）と、球のてっぺんから zTop までのコード（吊り下げの照明）。経線 12・緯線 8 の四角で
function addGlobe(m, c, zc, R, col, cordC, zTop, land = null) {
  if (!(R > 0)) return;
  const NU = land ? 48 : 12, NV = land ? 24 : 8;
  const P = (iu, iv) => {
    const a = (iu / NU) * 2 * Math.PI, b = -Math.PI / 2 + (iv / NV) * Math.PI;
    return [[c[0] + R * Math.cos(b) * Math.cos(a), c[1] + R * Math.cos(b) * Math.sin(a)], zc + R * Math.sin(b)];
  };
  for (let iv = 0; iv < NV; iv++) {
    for (let iu = 0; iu < NU; iu++) {
      const a = ((iu + 0.5) / NU) * 2 * Math.PI, b = -Math.PI / 2 + ((iv + 0.5) / NV) * Math.PI;
      const n = [Math.cos(b) * Math.cos(a), Math.cos(b) * Math.sin(a), Math.sin(b)];
      const onLand = land && WOODCUT_SHAPES.world.some(r => pointInRing((iu + 0.5) / NU, (iv + 0.5) / NV, r));
      m.quad([P(iu, iv), P(iu + 1, iv), P(iu + 1, iv + 1), P(iu, iv + 1)], n, onLand ? land : col);
    }
  }
  if (zTop > zc + R + 0.02) bar(m, [c, zc + R - 0.01], [c, zTop], 0.012, cordC);
}

function addCylinder(m, A0, A1, zc, R, c, inner, open, segments = 14) {
  const d = sub(A1, A0);
  const L = len(d);
  if (L < 1e-3 || !(R > 0)) return;
  const u = [d[0] / L, d[1] / L];
  const n = [-u[1], u[0]];
  const P = (p, ang, r = R) => [[p[0] + n[0] * Math.cos(ang) * r, p[1] + n[1] * Math.cos(ang) * r], zc + Math.sin(ang) * r];
  for (let k = 0; k < segments; k++) {
    const a0 = (k / segments) * 2 * Math.PI, a1 = ((k + 1) / segments) * 2 * Math.PI, am = (a0 + a1) / 2;
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
function ceilRuns(pc, zTop, z0, ceilAt, minHeight) {
  const L = len(sub(pc.b, pc.a));
  const topOf = typeof zTop === "function" ? zTop : () => zTop;
  const botOf = typeof z0 === "function" ? z0 : () => z0;
  const val = (t, sample = t) => {
    const q = lerp2(pc.a, pc.b, t);
    const c = ceilAt(sample === t ? q : lerp2(pc.a, pc.b, sample));
    const zt = topOf(q);
    return Math.max(botOf(q) + minHeight, Math.min(zt, Number.isFinite(c) ? c : zt));
  };
  if (L < 1e-3) return [{ ...pc, ta: val(0), tb: val(0) }];
  const n = Math.max(1, Math.ceil(L / 0.25));
  const eps = Math.min(0.25, 0.002 / L);
  // 0.25m ごとの点（両端は少し内）
  const T = [];
  const V = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    T.push(t);
    V.push(val(t, k === 0 ? eps : k === n ? 1 - eps : t));
  }
  const roofClips = (k) => V[k] < topOf(lerp2(pc.a, pc.b, T[k])) - CEIL_RUN_TOL;
  const out = [];
  let tS = 0;
  let vS = V[0];
  let i0 = 0;
  const close = (tE, vE) => {
    if (tE - tS > 1e-4) out.push({ ...pc, a: lerp2(pc.a, pc.b, tS), b: lerp2(pc.a, pc.b, tE), ta: vS, tb: vE });
  };
  for (let k = 1; k <= n; k++) {
    if (Math.abs(V[k] - V[k - 1]) > CEIL_JUMP && (roofClips(k) || roofClips(k - 1))) {
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

// 外周に接する穴や交差する穴を、三角形に分ける前に切り取る。
function slabPolygons(ring, holes) {
  if (!holes.length) return [[ring]];
  return clipOp("difference", [ring], ...holes.map((h) => [h])) ?? [[ring, ...holes]];
}

// 階の形が同じなら、選択色や時刻が変わっても平面の切り分けは再利用できる。
const floorSurfaceCache = new WeakMap();
function floorSurfaces(f) {
  const cached = floorSurfaceCache.get(f);
  if (cached) return cached;
  const ring = f.coords.map(toXY);
  const holes = (f.holes || []).map((h) => h.coords.map(toXY));
  // 開口が外周をまたぐ場合や、複数の穴が重なる場合も、床板の上下・縁・仕上げに同じ輪郭を使う。
  const footprint = [ring];
  const solid = slabPolygons(ring, holes);
  const regions = [];
  // 部屋の仕上げを床に埋め込む。点字ブロックなど後に指定された仕上げが重なる所は、その仕上げだけを残す。
  // over は平地の踊り場の上にも仕上げを貼る指定。そこだけは地形と重ならない元の高さを保つ。
  let base = solid;
  let openings = null;
  const takeRoom = (remaining, shape, room, dz) => {
    const area = clipOp("intersection", remaining, shape);
    if (!area?.length) return remaining;
    const rest = clipOp("difference", remaining, shape);
    if (!rest) return remaining;
    regions.push({ area, finish: room.finish, uv: floorUV(room.finish, room.grid || f.grid), dz });
    return rest;
  };
  for (let i = (f.rooms?.length || 0) - 1; i >= 0; i--) {
    const room = f.rooms[i];
    if (!room.finish || (room.finish === f.finish && !room.over && !room.grid)) continue;
    const shape = [room.coords.map(toXY)];
    base = takeRoom(base, shape, room, 0);
    if (room.over && holes.length) {
      openings ??= clipOp("difference", footprint, solid) ?? [];
      openings = takeRoom(openings, shape, room, 0.012);
    }
  }
  if (base.length) regions.push({ area: base, finish: f.finish, uv: floorUV(f.finish, f.grid), dz: 0 });
  const plan = { ring, holes, solid, regions };
  floorSurfaceCache.set(f, plan);
  return plan;
}

function drawFloorFinish(M, area, finish, uv, z, T, highlight = [0, 0, 0, 0]) {
  if (uv && isStationTile(finish)) {
    drawStationFloor(M, area, finish, uv, z, T, highlight);
    return;
  }
  if (uv && (finish === "marketPlanks" || finish === "marketVinyl" || finish === "marketTile")) {
    drawMarketFloor(M, area, finish, uv, z, T, highlight);
    return;
  }
  if (uv && M.finishes) {
    if (!M.finishes.has(finish)) M.finishes.set(finish, []);
    M.finishes.get(finish).push({ area, uv, z, highlight });
  } else {
    const color = T(FINISH_COL[finish] || "oak");
    for (const poly of area) M.m.polygon(poly, z, [0, 0, 1], color);
  }
}

export function addFloor(M, f, ctx) {
  M = { ...M, fixtureInstances: ctx.marketStock };
  const { m, glassy, veil } = M;
  const cull = M.cull || m; // 外の壁（ext）は中から見える面だけ（外からは殻が見える）
  const g0 = floorG0(f, ctx.groundAt);
  if (!Number.isFinite(g0)) return;
  const tint = ctx.tint || ((c) => c);
  // 色の名前（PAL）か #rrggbb（階の trim の col・baseCol・frameCol。2026-11-16）
  const T = k => tint(interiorColor(k));
  const zf = g0 + f.z;
  const cutTop = ctx.cutTop ?? Infinity;
  const ceilAt = ctx.ceilAt || null;
  const profile = ceilingProfile(f);
  const { ring, holes, solid, regions } = floorSurfaces(f);
  const waitingRooms = (f.items || []).filter(it => it.style === "waitingCanopy").map(it => it.coords.map(toXY));
  const underside = shade(T(f.under ? FINISH_COL[f.under] : "ceiling"), [0, 0, -1]);
  for (const poly of solid) m.polygon(poly, zf - f.slab, [0, 0, -1], underside);
  const edgeRings = solid.flatMap((pg) => pg.map((r, k) => ({ r: openR(r), outer: k === 0 })));
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
  for (const { area, finish, uv, dz } of regions) {
    drawFloorFinish(M, area, finish, uv, zf + dz, T, finish === "deckwood" || finish === "terraceBoards" ? ctx.deckTint : ctx.highlight);
  }
  if (M.fixtureInstances && (isStationTile(f.finish) || f.id === "stnb1-xfer")) {
    for (const room of f.rooms || []) {
      if (room.finish !== "tactile") continue;
      const r = room.coords.map(toXY);
      const square = r.length === 4 && Math.max(len(sub(r[0], r[1])), len(sub(r[1], r[2]))) < .47;
      drawTactileStrip(M.fixtureInstances, r, zf + (room.over ? .012 : 0), square);
    }
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
    if (!w.auto && ctx.doors) for (const [start, end, side, classroom] of w.doors || []) {
      if (!side) continue;
      const p = polyAt(pts, start), q = polyAt(pts, end);
      const [a, b] = side === "left" ? [p, q] : [q, p];
      const width = len(sub(b, a)), base = Math.max(S.bot(a), S.bot(b));
      const top = Math.min(base + DOOR_H, S.top(a), S.top(b), cutTop);
      if (width < .65 || top - base < 1.7) continue;
      const n = [-(b[1] - a[1]) / width, (b[0] - a[0]) / width];
      const door = { kind: "room", a, b, n, width, z0: base + .016, z1: top - .022, off: 0, glazed: w.doorFinish === "glass" };
      if (w.doorFinish === "timber") door.timber = true;
      if (w.hardware) door.hardware = w.hardware;
      if (classroom) {
        const mid = lerp2(a,b,.5);
        door.classroom = classroom;
        door.outside = pointInRing(mid[0]+n[0]*.3,mid[1]+n[1]*.3,ring) ? -1 : 1;
      }
      ctx.doors.push(door);
      if (!(f.trim?.frame && w.kind === "wall")) {
        const frame = T(w.hardware === "bronzeDiagonal" ? "#3a3732" : door.timber ? "#674f3b" : door.glazed ? "mullion" : "doorCase");
        const u = [n[1], -n[0]];
        for (const [jamb, sign] of [[a, -1], [b, 1]]) {
          const edge = [jamb[0] + sign * .055 * u[0], jamb[1] + sign * .055 * u[1]];
          segBox(m, jamb, edge, t + .035, base, base, top + .05, top + .05, frame);
        }
        segBox(m, a, b, t + .035, top, top, top + .05, top + .05, frame, { bottom: true });
      }
    }
    // 自動ドア（w.auto）：扉の口ごとに、campus3dDoors の自動ドアのレイヤーが板を描く（ctx.doors に足す）。口の上の板の側に、戸を動かす箱
    if (w.auto && ctx.doors) {
      for (const pc of wallPieces(pts, w.doors || [])) {
        if (!pc.door) continue;
        // 同じ開口を外のガラス面が描くとき、室内側の戸を二重に置かない。
        if (w.swing && !offGlazed(pc).length) continue;
        const L = len(sub(pc.b, pc.a));
        if (L < 0.4) continue;
        const u = [(pc.b[0] - pc.a[0]) / L, (pc.b[1] - pc.a[1]) / L];
        const nl = [-u[1], u[0]];
        const z0 = S.bot(lerp2(pc.a, pc.b, 0.5));
        const kind = w.swing ? "swing" : L >= 1.5 ? "bi" : "single";
        const head = z0 + (w.doorHeight ?? DOOR_H);
        ctx.doors.push({ a: pc.a, b: pc.b, z0, z1: head, n: nl, off: 0.08, kind, ...(w.motif ? {motif:w.motif} : {}) });
        if (w.swing) {
          segBox(m, pc.a, pc.b, 0.12, head, head, head + 0.13, head + 0.13, T("steel"));
          continue;
        }
        // 店舗の戸袋は壁の内側に収まり、通り抜け側で見えるケースは開口の幅まで。
        if (w.motif === "storeStripe") {
          segBox(m, pc.a, pc.b, .105, head, head, head + .13, head + .13, T("#737873"), { bottom:true });
          continue;
        }
        const ext = kind === "bi" ? L / 2 : L;
        const A = [pc.a[0] - u[0] * ext + nl[0] * 0.08, pc.a[1] - u[1] * ext + nl[1] * 0.08];
        const B = [pc.b[0] + u[0] * (kind === "bi" ? ext : 0) + nl[0] * 0.08, pc.b[1] + u[1] * (kind === "bi" ? ext : 0) + nl[1] * 0.08];
        segBox(m, A, B, 0.14, head, head, head + 0.18, head + 0.18, T(w.frame === "aluminum" ? "steelEdge" : "mullion"), { bottom: true });
      }
    }
    // 屋根の下の天井より上へは出さない（天井の高さが変わるところで区切る）
    const cutByCeil = ceilAt && (w.kind === "wall" || w.kind === "ext" || w.kind === "glass" || w.kind === "curtain" || w.kind === "conc" || w.kind === "wbrick" || w.kind === "rbrick" || w.kind === "bstone");
    const pointedPane = w.pane && w.h2 === 0;
    const runs = (pc) => (cutByCeil ? ceilRuns(pc, S.top, S.bot, ceilAt, pointedPane ? 0 : 0.3) : [{ ...pc, ta: S.top(pc.a), tb: S.top(pc.b) }]);
    const glassy0 = w.kind === "glass" || w.kind === "curtain";
    // ホームドアの戸の口：口ごとに 1 組の戸（折れ線の点をまたいでも 1 つ）。線路 track があれば電車に合わせて開く（ctx.psd に足して
    // campus3dPsd が描く）、なければ閉じた戸
    if (w.kind === "psd") {
      if (M.fixtureInstances && /^stntrk-[1-4]$/.test(w.track)) {
        const side = w.track === "stntrk-1" || w.track === "stntrk-3" ? 1 : -1;
        drawStationBoarding(M.fixtureInstances, w.doors || [], s => polyAt(pts, s), S.bot(pts[0]), side, w.style,
          p => !waitingRooms.some(room => pointInRing(p[0],p[1],room)));
      }
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
          const head = w.transomTop || DOOR_H;
          if (Math.min(ta - ba, tb - bb) > head + .005) quadIn(ba + head, bb + head, ta, tb);
          if (w.transomTop && !f.hostSashes) glassy.quad([[A,ba+DOOR_H],[B,bb+DOOR_H],[B,Math.min(tb,bb+head)],[A,Math.min(ta,ba+head)]],nIn,tint(GLASS));
        } else if (pc.win && pc.win[4] > 0) {
          // アーチの窓（5 つ目＝弧の上がり。2026-11-15、西1号館）：窓の幅（v0〜v1）いっぱいの弧。区間を縦の帯に分け、弧より上は壁、下はガラス
          const [v0, v1, wz0, wz1, arch] = pc.win;
          const sOf = (fr) => pc.s0 + len(sub(lerp2(pc.a, pc.b, fr), pc.a0 || pc.a));
          const K = Math.max(2, Math.ceil(((sOf(1) - sOf(0)) / Math.max(0.05, v1 - v0)) * 12));
          for (let k = 0; k < K; k++) {
            const fa = k / K, fb = (k + 1) / K;
            const sa = sOf(fa), sb = sOf(fb);
            const Pa = lerp2(A, B, fa), Pb = lerp2(A, B, fb);
            const b0 = ba + (bb - ba) * fa, b1 = ba + (bb - ba) * fb, t0 = ta + (tb - ta) * fa, t1 = ta + (tb - ta) * fb;
            const lo0 = Math.min(b0 + wz0, t0), lo1 = Math.min(b1 + wz0, t1);
            const hi0 = Math.min(b0 + archTop(sa - v0, v1 - v0, arch, wz1), t0), hi1 = Math.min(b1 + archTop(sb - v0, v1 - v0, arch, wz1), t1);
            const q = (za0, zb0, za1, zb1) => cull.quad([[Pa, za0], [Pb, zb0], [Pb, zb1], [Pa, za1]], nIn, shade(c, nIn));
            if (Math.max(lo0 - b0, lo1 - b1) > 0.02) q(b0, b1, lo0, lo1);
            if (Math.min(t0 - hi0, t1 - hi1) > 0.005) q(hi0, hi1, t0, t1);
            if (Math.min(hi0 - lo0, hi1 - lo1) > 0.05) glassy.quad([[Pa, lo0], [Pb, lo1], [Pb, hi1], [Pa, hi0]], nIn, tint(GLASS));
          }
        } else if (pc.win) {
          const [, , wz0, wz1] = pc.win;
          const loA = Math.min(ba + wz0, ta), loB = Math.min(bb + wz0, tb), hiA = Math.min(ba + wz1, ta), hiB = Math.min(bb + wz1, tb);
          if (Math.max(loA - ba, loB - bb) > 0.02) quadIn(ba, bb, loA, loB);
          if (Math.min(ta - hiA, tb - hiB) > 0.02) quadIn(hiA, hiB, ta, tb);
          if (!(w.transomTop && f.hostSashes) && Math.min(hiA - loA, hiB - loB) > 0.05) glassy.quad([[A, loA], [B, loB], [B, hiB], [A, hiA]], nIn, tint(GLASS));
        } else quadIn(ba, bb, ta, tb);
      } else if (w.kind === "wall" || w.kind === "low") {
        const c = T("wall");
        if (pc.win) {
          // 窓：下の腰の壁・ガラス・上の壁（まぐさ）と枠
          const [, , wz0, wz1] = pc.win;
          const loA = Math.min(ba + wz0, ta), loB = Math.min(bb + wz0, tb), hiA = Math.min(ba + wz1, ta), hiB = Math.min(bb + wz1, tb);
          if (Math.max(loA - ba, loB - bb) > 0.02) segBox(m, pc.a, pc.b, t, ba, bb, loA, loB, c, { ends: false });
          if (Math.min(ta - hiA, tb - hiB) > 0.02) segBox(m, pc.a, pc.b, t, hiA, hiB, ta, tb, c, { ends: false, bottom: true });
          if (Math.min(hiA - loA, hiB - loB) > 0.05 && !(w.shellGlazing && ctx.hostShell)) {
            const L = len(sub(pc.b, pc.a)) || 1;
            glassy.quad([[pc.a, loA], [pc.b, loB], [pc.b, hiB], [pc.a, hiA]], [-(pc.b[1] - pc.a[1]) / L, (pc.b[0] - pc.a[0]) / L, 0], tint(GLASS));
            const fc = T("mullion");
            bar(m, [pc.a, loA], [pc.a, hiA], 0.06, fc);
            bar(m, [pc.b, loB], [pc.b, hiB], 0.06, fc);
            bar(m, [pc.a, loA], [pc.b, loB], 0.06, fc);
            bar(m, [pc.a, hiA], [pc.b, hiB], 0.06, fc);
          }
        } else if (!pc.door) segBox(m, pc.a, pc.b, t, ba, bb, ta, tb, c, { bottom: w.z0 > 0 || w.z02 > 0 });
        else if (w.kind !== "low") {
          const head = w.doorHeight ?? DOOR_H;
          if (Math.min(ta-ba,tb-bb) > head+.1) segBox(m, pc.a, pc.b, t, ba+head, bb+head, ta, tb, c, { bottom: true });
        }
        if (f.trim && w.kind === "wall") addTrim(m, pc, t, ba, bb, ta, tb, f.trim, T);
      } else if (w.kind === "glass" || w.kind === "curtain") {
        // frame "dark"：黒い枠（石川台8号館のラウンジのガラスの仕切り。2026-11-17）
        const recessed = w.frame === "recessed";
        const frameC = T(recessed ? "wall" : w.frame === "aluminum" ? "steelEdge" : w.frame === "dark" ? "darkItem" : w.kind === "curtain" ? "mullionDark" : "mullion");
        const fw = pointedPane ? 0.028 : w.kind === "curtain" ? 0.07 : 0.05;
        const pitch = w.kind === "curtain" ? 1.25 : 1.5;
        const L = len(sub(pc.b, pc.a));
        const sill = pc.door ? (w.doorHeight ?? DOOR_H) + 0.05 : pointedPane ? 0 : 0.02;
        const gA = ba + sill, gB = bb + sill;
        const paneHeight = pointedPane && !pc.door ? Math.max(ta - gA, tb - gB) : Math.min(ta - gA, tb - gB);
        if (paneHeight > 0.05 && !(w.shellGlazing && ctx.hostShell)) {
          glassy.quad([[pc.a, gA], [pc.b, gB], [pc.b, tb], [pc.a, ta]], [-(pc.b[1] - pc.a[1]) / (L || 1), (pc.b[0] - pc.a[0]) / (L || 1), 0], tint(GLASS));
        }
        // すりガラスの帯（w.band：[下, 上]＝壁の下の端から m）：小さな菱形を互い違いの列に、ガラスの両面に（附属図書館 3 階のグループ研究室。
        // 2026-11-13、動画 IMG_1077 の 794〜800 秒：膝から胸の高さの菱形の模様）
        if (w.kind === "glass" && w.band && !pc.door && L > 0.2) addFrostBand(glassy, pc, L, ba, bb, ta, tb, w.band, tint(hex(PAL.frost, 0.5)), recessed);
        // 縦の枠（区間の両端と、間隔ごと）・下と上の枠・扉の上の横の枠。1 枚のガラス（pane）は途中の縦の枠・横の枠なしで、縦の枠は
        // 壁の折れ線の両端だけ（天井で区切った区間の境には枠を描かない）
        const n = w.pane ? 1 : Math.max(1, Math.round(L / pitch));
        const atEnd = (q) => len(sub(q, pts[0])) < 1e-6 || len(sub(q, pts[pts.length - 1])) < 1e-6;
        for (let k = 0; k <= n; k++) {
          const p = lerp2(pc.a, pc.b, k / n);
          const tp = ta + ((tb - ta) * k) / n;
          const bp = ba + ((bb - ba) * k) / n;
          if (pc.door && k > 0 && k < n) continue;
          if (w.pane && !pc.door && (!atEnd(p) || tp - bp <= 0.02)) continue;
          const upright = pc.door ? fw * 1.4 : recessed ? 0.19 : fw;
          bar(m, [p, bp], [p, tp], upright, frameC);
        }
        const sillFrame = pointedPane ? fw / 2 : 0.03;
        if (!pc.door) bar(m, [pc.a, ba + sillFrame], [pc.b, bb + sillFrame], fw, frameC);
        if (recessed && !pc.door && Math.min(ta - ba, tb - bb) > 1.1) {
          bar(m, [pc.a, ba + 1.06], [pc.b, bb + 1.06], 0.032, T("mullion"));
        }
        bar(m, [pc.a, Math.max(ba + sillFrame, ta - 0.02)], [pc.b, Math.max(bb + sillFrame, tb - 0.02)], fw, frameC);
        if (pc.door || (w.kind === "curtain" && !w.pane)) {
          const dz = (w.doorHeight ?? DOOR_H) + (pc.door ? 0.02 : 0.6);
          if (Math.min(ta - ba, tb - bb) > dz + 0.1) bar(m, [pc.a, ba + dz], [pc.b, bb + dz], fw, frameC);
        }
      } else if (w.kind === "mesh" || w.kind === "rail") {
        if (pc.door) continue;
        const railC = T("rail");
        const L = len(sub(pc.b, pc.a));
        if (w.style === "expanded" && L > 0.02) {
          const outward = [(pc.b[1] - pc.a[1]) / L, (pc.a[0] - pc.b[0]) / L];
          addExpandedRail(m, pc.a, pc.b, ba, bb, outward, T, ta - ba, tb - bb, w.handrail !== false);
          continue;
        }
        if (w.kind === "mesh") veil.quad([[pc.a, ba + 0.03], [pc.b, bb + 0.03], [pc.b, tb - 0.04], [pc.a, ta - 0.04]], [-(pc.b[1] - pc.a[1]) / (L || 1), (pc.b[0] - pc.a[0]) / (L || 1), 0], tint(MESH));
        bar(m, [pc.a, ta], [pc.b, tb], 0.05, T(w.kind === "mesh" ? "mesh" : "rail"));
        if (w.kind === "rail") {
          const count = w.crossbars || 1;
          for (let i=1;i<=count;i++) {
            const t = i/(count+1);
            bar(m,[pc.a,ba+(ta-ba)*t],[pc.b,bb+(tb-bb)*t],.03,railC);
          }
        } else bar(m, [pc.a, ba + 0.03], [pc.b, bb + 0.03], 0.04, T("mesh"));
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
        addBars(m, pc.a, pc.b, ba, bb, ta, tb, T("barSteel"), w.style === "picket");
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
      } else if (w.kind === "bstone") {
        // 明るいベージュの石張り（本館の玄関ホールの壁・柱。2026-11-16、ユーザーの動画 IMG_1380 の 63〜128 秒）：0.9×0.45m の板と目地。扉の口は口の上だけ
        const za = pc.door ? ba + DOOR_H : ba, zb = pc.door ? bb + DOOR_H : bb;
        if (!(ta > za + 0.02 || tb > zb + 0.02)) continue;
        segBox(m, pc.a, pc.b, t, za, zb, ta, tb, T("bstone"), { bottom: !!pc.door });
        addSmallTiles(m, pc, t, za, zb, ta, tb, T, { tw: 0.9, th: 0.45, tile: "bstone", grout: "bstoneJoint" });
      } else if (w.kind === "hboard") {
        // 明るい木の横板張り（西5号館の 4 階の製図室の窓の下の壁。2026-11-15）：木の箱に、両面とも 0.16m おきの暗い継ぎ目の溝。扉の口は口の上だけ
        const za = pc.door ? ba + DOOR_H : ba, zb = pc.door ? bb + DOOR_H : bb;
        if (!(ta > za + 0.02 || tb > zb + 0.02)) continue;
        segBox(m, pc.a, pc.b, t, za, zb, ta, tb, T("hboard"), { bottom: true });
        addBoardGrooves(m, pc, t, za, zb, ta, tb, T("hboardGroove"));
      } else if (w.kind === "vboard" || w.kind === "lattice") {
        // 70周年記念講堂の客席（2026-11-18）：vboard あたたかい色の木の縦板張り（0.14 m おきの継ぎ目）、lattice 白い格子（0.24 m の升目。南の壁の窓の内の格子）。
        // 扉の口は口の上だけ
        const za = pc.door ? ba + DOOR_H : ba, zb = pc.door ? bb + DOOR_H : bb;
        if (!(ta > za + 0.02 || tb > zb + 0.02)) continue;
        segBox(m, pc.a, pc.b, t, za, zb, ta, tb, T(w.kind), { bottom: true });
        if (w.kind === "vboard") addSmallTiles(m, pc, t, za, zb, ta, tb, T, { tw: 0.14, th: 400, tile: "vboard", grout: "vboardJoint" });
        else addSmallTiles(m, pc, t, za, zb, ta, tb, T, { tw: 0.24, th: 0.24, tile: "lattice", grout: "latticeJoint" });
      } else if (w.kind === "mtile" || w.kind === "wains" || w.kind === "wtile" || w.kind === "maroon" || w.kind === "slat" || w.kind === "rbrick") {
        // 2026-11-12（大岡山駅）：小さなタイルの壁・腰のタイル・白いタイル・えんじ色の板・木の格子。扉の口は口の上だけ
        const za = pc.door ? ba + DOOR_H : ba, zb = pc.door ? bb + DOOR_H : bb;
        if (!(ta > za + 0.02 || tb > zb + 0.02)) continue;
        if (w.kind === "slat") {
          addSlatWall(m, pc, t, za, zb, ta, tb, T);
          continue;
        }
        const base = { mtile: "mtile", wtile: "wtile", maroon: "maroon", wains: "wainsTop", rbrick: "wainsTop" }[w.kind];
        segBox(m, pc.a, pc.b, t, za, zb, ta, tb, T(base), { bottom: !!pc.door });
        if (w.kind === "mtile" && f.id === "stnb1-xfer") addSmallTiles(m, pc, t, za, zb, ta, tb, T, { tw: .07, th: .17, tile: "#c0b9ac", grout: "#918b80" });
        else if (w.kind === "mtile") addSmallTiles(m, pc, t, za, zb, ta, tb, T, { band: [0.45, 2.7] });
        else if (w.kind === "wtile" && f.id === "stn1fu-free") addSmallTiles(m, pc, t, za, zb, ta, tb, T, { tw: 0.146, th: 0.054, joint: 0.003, tile: "#ece8dd", grout: "#cfc9bc" });
        else if (w.kind === "wtile") addSmallTiles(m, pc, t, za, zb, ta, tb, T, { tw: 0.2, th: 0.2, tile: "wtile", grout: "wtileGrout" });
        else if (w.kind === "wains" && !pc.door) {
          const th = w.th ?? 1.3;
          const ka = Math.min(ta, ba + th), kb = Math.min(tb, bb + th);
          addSmallTiles(m, pc, t, ba, bb, ka, kb, T, { tw: 0.1, th: 0.1, tile: "wainsTile", grout: "wainsGrout" });
          // 腰の上の見切り（細い帯）
          segBox(m, pc.a, pc.b, t + 0.03, ka - 0.01, kb - 0.01, ka + 0.025, kb + 0.025, T("wainsTrim"), { ends: false, bottom: true });
        } else if (w.kind === "rbrick") {
          // 茶色のれんがの腰壁（扉の口の上は白いしっくいのまま）
          const th = w.th ?? 2.4;
          const ka = Math.min(ta, ba + th), kb = Math.min(tb, bb + th);
          // 色は col・col2 があればそれ（本館の地下の通り抜けのクリーム色のれんが。2026-11-16）
          if (!pc.door && (ka > ba + 0.02 || kb > bb + 0.02)) addSmallTiles(m, pc, t, ba, bb, ka, kb, T, { tw: 0.23, th: 0.07, tile: w.col || "rbrick", grout: w.col2 || "rbrickJoint" });
        }
      }
    }
  }
  // 家具など
  const ctxG = { ...ctx, glassy, finishes: M.finishes };
  for (const it of f.items || []) {
    const r = it.coords.map(toXY);
    const mount = ceilingMount(profile, it, r);
    if (mount && it.z0 > 0 && Number.isFinite(cutTop)) continue;
    const shift = mount ? mount.offset(centroid(r)) : 0;
    const z0 = zf + it.z0 + (it.z0 > 0 ? shift : 0);
    // 屋根の下の天井より上へは出さない（柱は天井まで）
    const z1 = Math.min(zf + it.z1 + shift, cutTop, ceilAt ? ceilAt(centroid(r)) : Infinity);
    if (!(z1 > z0 + 0.005)) continue;
    // 切り取った階を上から見るときは、天井の近くの物（照明・ダクト・上の床の板）は描かない（下の部屋が見えるように）
    if (Number.isFinite(cutTop) && z0 > cutTop - 0.9) continue;
    const c = T(ITEM_COL[it.kind] || "whiteItem");
    if (mount && mount.plane.normal[2] > -0.99999 && ["white", "glow"].includes(it.kind)) {
      const top = p => Math.min(zf + it.z1 + mount.offset(p), cutTop, ceilAt ? ceilAt(p) : Infinity);
      const bottom = p => zf + it.z0 + (it.z0 > 0 ? mount.offset(p) : 0);
      const col = it.color ? T(it.color) : it.kind === "glow" ? T("lightStrip") : c;
      const normal = mount.plane.normal;
      m.polygon([r], top, normal.map(v => -v), col);
      m.polygon([r], bottom, it.z0 > 0 ? normal : [0,0,-1], it.kind === "glow" ? col : shade(col, normal));
      const sign = Math.sign(ringArea(r));
      r.forEach((a,i) => {
        const b = r[(i+1)%r.length], dx = b[0]-a[0], dy = b[1]-a[1], l = Math.hypot(dx,dy);
        if (l > .001) face(m, [[a,bottom(a)],[b,bottom(b)],[b,top(b)],[a,top(a)]], [sign*dy/l,-sign*dx/l,0], col);
      });
      if (mount.plane.finish === "daylit" && it.kind === "white" && it.z0 > 0 && r.length === 4) {
        const a=lerp2(r[0],r[3],.5), b=lerp2(r[1],r[2],.5);
        addTieHoles(m,{a,b},len(sub(r[0],r[3])),bottom(a),bottom(b),top(a),top(b),T("concHole"));
      }
      continue;
    }
    if (M.fixtureInstances && r.length === 4 && stationFixtureStyles.has(it.style)) {
      drawStationFixture(M, it, r, z0, z1, T, { prism: prismPoly, bar });
      continue;
    }
    if (it.style && drawKuramaeItem(m, it, r, z0, z1, T, ctx, f.items)) continue;
    const fixture = Object.hasOwn(TAKI_FIXTURES,it.style) && TAKI_FIXTURES[it.style];
    if (fixture && r.length === 4) {
      const F=frontOf(r);
      fixture(M,F,depthOf(F,r),z0,z1,T,it.style);
    } else if (it.kind === "dlight" && f.finish === "marketVinyl") {
      addMarketDownlight(m,r,z0,T);
    } else if (it.kind === "mat" && it.style === "queue" && f.finish === "marketVinyl" && r.length === 4) {
      const F=frontOf(r), left=leftEnd(F), right=rightOf(F), depth=depthOf(F,r);
      const corners=[[0,0],[F.L,0],[F.L,depth],[0,depth]].map(([x,y]) =>
        [[left[0]+right[0]*x-F.nf[0]*y,left[1]+right[1]*x-F.nf[1]*y],zf+.003]);
      addMarketArt(m, it.color === "#474845" ? "queueGrey" : "queueRed", corners, [0,0,1], tint);
    } else if (it.kind === "mat" && it.style === "queue" && r.length === 4) {
      shopQueue(m, r, z1 + .002, T, it.color);
    } else if (it.kind === "mat" && MARKET_ART.has(it.relief) && r.length === 4) {
      const F = frontOf(r), left = leftEnd(F), right = rightOf(F), depth = depthOf(F,r);
      const corners = [[0,0],[F.L,0],[F.L,depth],[0,depth]].map(([x,y]) =>
        [[left[0]+right[0]*x-F.nf[0]*y, left[1]+right[1]*x-F.nf[1]*y], z1]);
      addMarketArt(m, it.relief, corners, [0,0,1], tint);
    } else if (it.slatted && r.length === 4 && (it.kind === "chair" || it.kind === "table")) {
      addSlattedFurniture(m, it, r, z0, z1, T);
    } else if (it.kind === "table" && it.style === "marketStand" && r.length===4) {
      const F=frontOf(r), L=F.L, D=depthOf(F,r), P=(a,b)=>[F.a[0]+F.u[0]*a-F.nf[0]*b,F.a[1]+F.u[1]*a-F.nf[1]*b];
      const steel=T("steel");
      prismPoly(m,r,z1-.032,z1,T("#dfc89b"),{bottom:true});
      for (const y of [.055,D-.055]) {
        bar(m,[P(.04,y),z0+.018],[P(L-.07,y),z1-.035],.022,steel);
        bar(m,[P(L-.04,y),z0+.018],[P(.07,y),z1-.035],.022,steel);
      }
      for (const x of [L*.26,L*.74]) {
        const circle = rad => Array.from({length:14},(_,i)=>P(x+rad*Math.cos(i*Math.PI/7),D*.52+rad*.7*Math.sin(i*Math.PI/7)));
        prismPoly(m,circle(Math.min(L*.23,D*.52)),z1,z1+.03,T("#c69e60"));
        prismPoly(m,circle(Math.min(L*.22,D*.50)),z1+.03,z1+.05,T("#e7c780"));
      }
      const forward = F.u[0]*-F.nf[1]+F.u[1]*F.nf[0]>0;
      shopRow(m,ctxG,T,(x,y)=>P(forward?x:L-x,D*.24+y),"bakery",L*.08,L*.92,z1+.051,.14,0,7);
    } else if (it.kind === "table" && it.style === "slab" && z1 - z0 > 0.2) {
      addSlabTable(M, r, z0, z1, f.grid, T, ctx.highlight);
    } else if (it.kind === "table" && ["study", "railCounter"].includes(it.style) && r.length === 4 && z1 - z0 > 0.3) {
      addStudyTable(m, it, r, z0, z1, T);
    } else if (it.kind === "table" && it.style === "tripod" && z1 - z0 > 0.2) {
      addCafeTable(m, it, r, z0, z1, T);
    } else if (it.kind === "toilet" && it.style && r.length === 4) {
      addWashroomFixture(m, it, r, z0, z1, T);
    } else if (it.kind === "steel" && it.style === "mirror" && r.length === 4) {
      addWashroomMirror(m, r, z0, z1, T);
    } else if (it.kind === "white" && it.style === "stallDoor" && r.length === 4) {
      addStallDoor(m, r, z0, z1, T);
    } else if (it.kind === "table" && it.style === "seminar" && r.length === 4 && z1 - z0 > 0.35) {
      addSeminarTable(m, r, z0, z1, T);
    } else if (it.kind === "table" && ["readingLamp", "carrel", "groupStudy"].includes(it.style) && z1 - z0 > 0.3) {
      addLibraryTable(m, it, r, z0, z1, T);
    } else if (it.kind === "table" && z1 - z0 > 0.2) {
      // 天板の色は color があればそれ（白い丸テーブルなど。2026-11-12）。4 点の天板の color3 は天板のふちの帯（西5号館の製図室の白い天板に
      // 木のふち。2026-11-15）
      prismPoly(m, r, z1 - 0.035, z1, it.color ? tint(COL_HEX(it.color)) : c, { bottom: true, sideCol: r.length === 4 && it.color3 ? tint(COL_HEX(it.color3)) : null });
      // 脚：角ごと（4 点の形なら角から 0.06m 内）、ほかはまん中に 1 本。脚の色は color2（西5号館の食堂のオークの脚。2026-11-15）、
      // 1 本脚の足もとの丸い台は color3（なしは台なし）
      const legC = it.color2 ? tint(COL_HEX(it.color2)) : T("grey");
      if (r.length === 4) {
        const ce = centroid(r);
        for (const p of r) {
          const q = lerp2(p, ce, Math.min(0.45, 0.08 / (len(sub(ce, p)) || 1)));
          bar(m, [q, z0], [q, z1 - 0.035], 0.035, legC);
        }
      } else {
        const ce = centroid(r);
        bar(m, [ce, z0], [ce, z1 - 0.035], 0.06, legC);
        if (it.color3) {
          const rb = Math.min(0.28, 0.5 * Math.min(...r.map((p) => len(sub(p, ce)))));
          prismPoly(m, Array.from({ length: 16 }, (_, k) => [ce[0] + rb * Math.cos((Math.PI * k) / 8), ce[1] + rb * Math.sin((Math.PI * k) / 8)]), z0, z0 + 0.03, tint(COL_HEX(it.color3)));
        }
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
      if (it.style === "serviceDesk" && r.length===4) addServiceDesk(M,r,z1,T);
    } else if (it.kind === "slats") {
      addSlats(m, it, r, z0, z1, T);
    } else if (it.kind === "box" && it.style === "rock") {
      addGardenRock(m, r, z0, z1, T(it.color || "#77766b"));
    } else if (it.kind === "mat" && it.style === "studs" && r.length === 4) {
      addStudStrip(m, r, z1, T, it.color);
    } else if (it.kind === "screen" && it.style === "kiosk" && r.length === 4) {
      addKiosk(m, r, z0, z1, T);
    } else if (it.kind === "glazedleaf" && r.length === 4) {
      addGlazedLeaf(m, glassy, r, z0, z1, tint);
    } else if (it.kind === "helmetRack" && r.length === 4) {
      addHelmetRack(m, r, z0, z1, T);
    } else if (it.kind === "sash" && r.length === 4) {
      const [a, b, c, d] = r;
      const color = T(it.color || "#adb4b4"), depth = depthOf(frontOf(r), r);
      const left = lerp2(a, d, 0.5), right = lerp2(b, c, 0.5);
      for (const z of [z0 + 0.025, z0 + (z1 - z0) * 0.45, z1 - 0.025]) {
        segBox(m, left, right, depth, z - 0.025, z - 0.025, z + 0.025, z + 0.025, color);
      }
      for (const t of [0.012, 0.5, 0.988]) {
        const p = lerp2(left, right, t);
        bar(m, [p, z0 + 0.05], [p, z1 - 0.05], 0.045, color);
      }
    } else if (it.kind === "noticeboard" && r.length === 4) {
      addNoticeboard(m, it, r, z0, z1, T);
    } else if (it.kind === "glassart" && r.length === 4) {
      addGlassArtwork(m, glassy, r, z0, z1, T, tint);
    } else if (it.kind === "cabinet") {
      addCabinet(m, it, r, z0, z1, T, tint);
    } else if (it.kind === "platform") {
      // 踊り場の台。color があればその色（図書館の階段の暗い灰の踊り場。2026-11-13）。color2 は側と下の面の色。z0 が床より上なら宙に浮いた
      // 薄い踊り場で、下の面も描く（学習棟の白い折れ板の階段の踊り場：床から立ち上がる箱だった。2026-11-14 ユーザーの目印「なにこれ。てぬき？」）
      const pc = it.color ? tint(COL_HEX(it.color)) : T("platform");
      const sc = it.color2 ? tint(COL_HEX(it.color2)) : it.color ? pc : T("platformSide");
      prismPoly(m, r, z0, z1, pc, { sideCol: sc, top: !it.finish });
      if (it.finish) {
        const grooved = it.finish === "groovedwood";
        const grid = grooved ? [Math.atan2(r[1][1] - r[0][1], r[1][0] - r[0][0]) * 180 / Math.PI, 0.14] : f.grid;
        drawFloorFinish(M, [[r]], it.finish, floorUV(it.finish, grid), z1, T, grooved || it.finish === "deckwood" ? ctx.deckTint : ctx.highlight);
      }
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
          if (k === "expanded") return addExpandedRail(m, a, b, z1, z1, nn, T);
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
    } else if (it.style === "acousticShell" && r.length === 4) {
      addAcousticShell(m,r,z0,z1,T);
    } else if (it.style === "stageWing" && r.length === 4) {
      addStageWing(m,r,z0,z1,T);
    } else if (it.style === "auditoriumSpeaker" && r.length === 4) {
      addAuditoriumSpeaker(m,r,z0,z1,T);
    } else if (it.style === "stageBatten" && r.length === 4) {
      addStageBatten(m,r,z0,z1,T);
    } else if (SEAT_ITEMS.has(it.kind) && r.length === 4) {
      addSeatItem(m, it, r, z0, z1, T, tint);
    } else if (KITCHEN_ITEMS.has(it.kind) && r.length === 4) {
      addKitchenItem(M, it, r, z0, z1, T, tint);
    } else if (STORE_ITEMS.has(it.kind) && r.length === 4) {
      addStoreItem(m, it, r, z0, z1, T, tint, glassy, ctxG);
    } else if (it.kind === "box" && it.pillow && r.length === 4) {
      addPillow(m, r, z0, z1, it.color ? tint(COL_HEX(it.color)) : T("whiteItem"));
    } else if (it.kind === "piano" && r.length === 4) {
      addPiano(m, r, z0, z1, T);
    } else if (it.kind === "lift" && r.length === 4) {
      addLiftShaft(m, r, z0, z1, c, T("steel"));
    } else if (it.kind === "liftdoor") {
      // エレベーターの扉（ステンレスの板）：前の面も縦の面なので、縦の面ぜんぶ板の色（合わせ目はデータの暗い細い板）
      prismPoly(m, r, z0, z1, c, { sideCol: c });
    } else if (it.kind === "column" && r.length >= 3) {
      if (M.fixtureInstances && f.finish === "stationPlatformTile") {
        const center = centroid(r), diameter = Math.min(...r.map((a,i) => 2*len(sub(lerp2(a,r[(i+1)%r.length],.5),center))));
        const colors = ["#ded9c5", "#ae805c"];
        M.fixtureInstances.add("station/column",center,z0,0,[diameter,diameter,z1-z0-.16],colors,1.12);
        M.fixtureInstances.add("station/cap",center,z1-.17,0,[diameter*1.85,diameter*1.85,.17],colors,1.10);
      } else addColumn(m, r, z0, z1, T);
    } else if (it.kind === "bench" && r.length === 4) {
      addStationBench(m, r, z0, z1, T, it.color ? tint(COL_HEX(it.color)) : null);
    } else if (it.kind === "board" && r.length === 4) {
      addBoard(m, r, z0, z1, T);
    } else if (it.kind === "light" && it.style === "suspended" && r.length === 4) {
      const a = lerp2(r[0], r[3], 0.5), b = lerp2(r[1], r[2], 0.5);
      const housing = T("#b8b8ad"), width = len(sub(r[0], r[3]));
      segBox(m, a, b, width, z0, z0, z0+0.045, z0+0.045, housing);
      m.quad(r.map(p => [p,z0]), [0,0,-1], T("beamLit"));
      for (const t of [0.15,0.85]) {
        const p = lerp2(a,b,t);
        bar(m, [p,z0+0.045], [p,z1], 0.012, housing);
      }
    } else if (r.length === 4 && addSmallItem(m, it, r, z0, z1, T, tint, ctxG)) {
      // 2026-11-13（Taki Plaza 2 階の小物）：本棚・白い棚・計算式の時計・板を重ねた切り抜き・木の板の表示・貼り紙・星の飾り
    } else if (STATION_ITEMS.has(it.kind) && addStationItem(m, it, r, zf, z0, z1, T, tint, ctxG)) {
      // 2026-11-12（大岡山駅の階段の上・1 階）：段々の天井・鉄の扉・改札機・丸い柱・ロッカー・機械・床の矢印・額の広告・照明・点検口・消火栓・棚
    } else if (it.kind === "duct" && r.length >= 4) {
      // むき出しの丸いダクト（西5号館の食堂の天井。動画 IMG_1078）：軸は tube と同じ（形の両はしのまん中どうし）、両はしは閉じる。3m ごとに継ぎ目の帯
      const A0 = lerp2(r[0], r[3], 0.5), A1 = lerp2(r[1], r[2], 0.5);
      const zc = (zf + it.z0 + zf + it.z1) / 2, R = (it.z1 - it.z0) / 2;
      addCylinder(m, A0, A1, zc, R, T("duct"), T("duct"), false);
      const L = len(sub(A1, A0));
      for (let d = 3; d < L - 0.5; d += 3) {
        const p = lerp2(A0, A1, (d - 0.04) / L), q = lerp2(A0, A1, (d + 0.04) / L);
        addCylinder(m, p, q, zc, R * 1.04, T("ductBand"), T("ductBand"), false);
      }
    } else if (it.kind === "tray" && r.length === 4) {
      // 天井のはしご形のケーブルラック（白。西5号館の食堂。2026-11-15）：1 本目の辺の向きに両わきの細い板（高さ z1 − z0）、0.3m ごとの横木
      const e0 = len(sub(r[1], r[0])), e1 = len(sub(r[2], r[1]));
      const [a, b, , d] = e0 >= e1 ? r : [r[1], r[2], r[3], r[0]];
      const L = len(sub(b, a)), W = len(sub(d, a));
      const tc = T("tray");
      const dv = sub(d, a);
      const off = (p, k) => [p[0] + dv[0] * k, p[1] + dv[1] * k];
      for (const y of [0.01, W - 0.01]) segBox(m, off(a, y / W), off(b, y / W), 0.02, z0, z0, z1, z1, tc, { bottom: true });
      for (let x = 0.15; x < L - 0.05; x += 0.3) {
        const p = lerp2(a, b, x / L);
        segBox(m, p, off(p, 1), 0.03, z0, z0, z0 + 0.025, z0 + 0.025, tc, { bottom: true });
      }
    } else if (it.kind === "cassette" && r.length >= 3) {
      // 天井の空調のカセット：白い薄い箱（上の面が z1）、下の面のまん中に灰色の吸い込みの格子（形の 55%）
      prismPoly(m, r, z1 - 0.05, z1, T("cassette"), { bottom: true });
      const ce = centroid(r);
      const inner = r.map((p) => lerp2(ce, p, 0.55));
      m.polygon([inner], z1 - 0.052, [0, 0, -1], shade(T("cassetteGrille"), [0, 0, -1]));
    } else if (it.kind === "belt" && r.length >= 4) {
      // ポールとベルトの仕切り：1 本目の辺の両はしに銀色のポール（丸い台）、あいだに青いベルト（両面）
      const a = lerp2(r[0], r[3], 0.5), b = lerp2(r[1], r[2], 0.5);
      for (const p of [a, b]) {
        bar(m, [p, z0], [p, z1], 0.05, T("postSteel"));
        prismPoly(m, Array.from({ length: 12 }, (_, k) => [p[0] + 0.16 * Math.cos((Math.PI * k) / 6), p[1] + 0.16 * Math.sin((Math.PI * k) / 6)]), z0, z0 + 0.025, T("postSteel"));
      }
      const L = len(sub(b, a)) || 1;
      const n = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L, 0];
      const zb0 = z1 - 0.08, zb1 = z1 - 0.03;
      const belt = it.color ? tint(hex(it.color)) : T("beltBlue");
      face(m, [[a, zb0], [b, zb0], [b, zb1], [a, zb1]], n, belt);
      face(m, [[b, zb0], [a, zb0], [a, zb1], [b, zb1]], [-n[0], -n[1], 0], belt);
    } else if (it.kind === "globe") {
      // 吊り下げの白い球の照明（西5号館の食堂つばめテラス。2026-11-15、動画 IMG_1078）：形のまん中に直径 z1 − z0 の球と、上の天井までの細いコード
      const zc = (z0 + z1) / 2, R = (z1 - z0) / 2;
      const zTop = Math.min(zf + f.height - f.slab, cutTop, ceilAt ? ceilAt(centroid(r)) : Infinity);
      // stand（2026-11-18、Taki Plaza 地下 1 階の本棚の上の地球儀）：吊らずに置く。木の丸い台と、color の球（なしは水色がかった白）
      if (it.stand) {
        const ce = centroid(r), rb = R * 0.55;
        prismPoly(m, Array.from({ length: 12 }, (_, k) => [ce[0] + rb * Math.cos((Math.PI * k) / 6), ce[1] + rb * Math.sin((Math.PI * k) / 6)]), z0, z0 + 0.03, T("clockWood"));
        bar(m, [ce, z0 + 0.03], [ce, z0 + 0.1], 0.02, T("clockWood"));
        const radius = R * 0.82, centerZ = z1 - R;
        addGlobe(m, ce, centerZ, radius, tint(COL_HEX(it.color || "#c6d8e4")), T("clockWood"), centerZ, tint(COL_HEX(it.color2 || "#adb2aa")));
        const meridian = (i) => {
          const angle = i * Math.PI / 16, dx = R * 0.94 * Math.cos(angle);
          return [[ce[0] + dx * 0.8, ce[1] + dx * 0.6], centerZ + R * 0.94 * Math.sin(angle)];
        };
        for (let i = 0; i < 32; i++) bar(m, meridian(i), meridian(i + 1), Math.max(0.008, R * 0.06), T("clockWood"));
      } else addGlobe(m, centroid(r), zc, R, T("globe"), T("cord"), zTop);
    } else if ((it.kind === "tube" || it.kind === "disc") && r.length >= 4) {
      // 軸：1 点目 → 2 点目の向き（形の両はしのまん中どうし）。直径は z1 − z0
      const A0 = lerp2(r[0], r[3], 0.5), A1 = lerp2(r[1], r[2], 0.5);
      addCylinder(m, A0, A1, (zf + it.z0 + zf + it.z1) / 2, (it.z1 - it.z0) / 2, it.kind === "tube" ? T("beam") : c, it.kind === "tube" ? T("tubeIn") : c, it.kind === "tube");
      if (it.style === "jetDiffuser") addJetDiffuser(m,[r[1],r[2],r[3],r[0]],z0,z1,T);
    } else {
      // color があればその色（青いゴミ箱など。2026-11-12）。床より下に吊った物（下の階の軒下の天井の格子・吹き出し口。西5号館 2026-11-15）も下の面を
      prismPoly(m, r, z0, z1, it.color ? tint(COL_HEX(it.color)) : c, { bottom: z0 > zf + 0.05 || z1 < zf - 0.05 });
      if (it.flowers && r.length === 4) addColumnFlowers(m, r, z0, z1, tint);
    }
  }
  // 階段
  for (const s of f.stairs || []) addFloorStairs(M, s, zf, T, tint, cutTop, ctx.highlight);
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
  // かまぼこ形の天井（西5号館の 4 階の製図室。2026-11-15）も切り取って見るときは描かない
  if (f.vault && !Number.isFinite(cutTop)) addVault(m, glassy, f, zf, T, tint);
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

// ドライガーデンの景石。平面図の輪郭から肩を少しずつずらして割れ面を作る。
function addGardenRock(m, r, z0, z1, color) {
  const ring = ringArea(r) > 0 ? r : r.slice().reverse();
  const center = centroid(ring), height = z1 - z0;
  const seed = Math.round(37 * center[0] + 11 * center[1]);
  const foot = ring.map(p => [...p, z0]);
  const waist = ring.map((p, i) => [...lerp2(p, center, 0.19 * hash2(seed, i)), z0 + height * (0.27 + 0.26 * hash2(i, seed))]);
  const shoulder = ring.map((p, i) => [...lerp2(p, center, 0.32 + 0.29 * hash2(i + 1, seed)), z0 + height * (0.69 + 0.24 * hash2(seed, i + 1))]);
  const crown = [...lerp2(center, ring[0], 0.18), z1];
  const facet = (a, b, c) => {
    const u = b.map((v, k) => v - a[k]), v = c.map((value, k) => value - a[k]);
    const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const length = Math.hypot(...normal);
    if (length < 1e-8) return;
    const n = normal.map(value => value / length), base = shade(color, n);
    const grain = 0.82 + 0.31 * hash2(Math.round(a[0] * 13), Math.round(c[1] * 53));
    const tone = [base[0] * grain, base[1] * grain, base[2] * grain, base[3]];
    for (const p of [a, b, c]) m.vert([p[0], p[1]], p[2], n, tone);
  };
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    for (const [bottom, top] of [[foot, waist], [waist, shoulder]]) {
      facet(bottom[i], bottom[j], top[j]);
      facet(bottom[i], top[j], top[i]);
    }
    facet(shoulder[i], shoulder[j], crown);
  }
}

// 階段と踊り場の金属製の点字鋲。各鋲の丸い頭を色の違う扇形で描く。
function addStudStrip(m, r, z, T, tile) {
  const along = sub(r[1], r[0]), across = sub(r[3], r[0]);
  const cols = Math.max(1, Math.round(len(along) / 0.06)), rows = Math.max(1, Math.round(len(across) / 0.06));
  const silver = T(tile || "steel"), dark = T(tile ? "#ad8b30" : "steelEdge"), light = T(tile ? "#f4db71" : "whiteItem");
  if (tile) m.polygon([r], z-0.001, [0,0,1], silver);
  const rim = Array.from({ length: 6 }, (_, k) => [0.012 * Math.cos(k * Math.PI / 3), 0.012 * Math.sin(k * Math.PI / 3)]);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const p = [0, 1].map(k => r[0][k] + along[k] * (i + 0.5) / cols + across[k] * (j + 0.5) / rows);
    const ring = rim.map(([x, y]) => [p[0] + x, p[1] + y]);
    for (let k = 0; k < 6; k++) {
      const color = k < 2 ? light : k < 4 ? dark : silver;
      for (const [q, h] of [[ring[k], z], [ring[(k + 1) % 6], z], [p, z + 0.003]]) m.vert(q, h, [0, 0, 1], color);
    }
  }
}

function addExpandedRail(m, a, b, za, zb, outward, T, heightA = 1.05, heightB = heightA, handrail = true) {
  const L = len(sub(b, a));
  if (L < 0.02) return;
  const white = T("mesh"), silver = T("steel"), normal = [outward[0], outward[1], 0];
  const P = (s, h, inset = 0) => {
    const p = lerp2(a, b, s / L);
    const height = heightA + (heightB - heightA) * s / L;
    return [[p[0] - outward[0] * inset, p[1] - outward[1] * inset], za + (zb - za) * s / L + h * height / 1.05];
  };
  // 菱形のエキスパンドメタル。踊り場も同じ断面にし、格子越しに階下が見えるようにする。
  for (const sign of [-1, 1]) {
    for (let start = -1.7; start < L; start += 0.092) {
      const left = Math.max(0, start), right = Math.min(L, start + 1.7);
      if (right <= left) continue;
      const wire = (x, dz) => P(sign > 0 ? x : L - x, -0.04 + (x - start) * 0.64 + dz);
      face(m, [wire(left, -0.0025), wire(right, -0.0025), wire(right, 0.0025), wire(left, 0.0025)], normal, white);
    }
  }
  for (const h of [-0.04, 1.05]) bar(m, P(0, h), P(L, h), 0.044, white);
  if (handrail) bar(m, P(0, 0.82, 0.075), P(L, 0.82, 0.075), 0.037, silver);
  const bays = Math.max(1, Math.round(L / 1.45));
  for (let k = 0; k <= bays; k++) {
    const s = L * k / bays;
    bar(m, P(s, -0.04), P(s, 1.05), 0.032, white);
    if (handrail) bar(m, P(s, 0.79), P(s, 0.82, 0.075), 0.022, silver);
  }
}

function addFloorStairs(M, s, zf, T, tint, cutTop, highlight) {
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
  const woodUV = s.kind === "paleoak" ? floorUV("paleoak", [Math.atan2(n[1], n[0]) * 180 / Math.PI, 0.18]) : null;
  const noseC = (s.kind === "paleoak" || s.kind === "oak") ? T("stairNose") : s.kind === "rubber" ? T("stairRubberNose") : steel;
  const addNose = (sv, z) => {
    const a0 = sv - 0.004, a1 = sv + NOSE_TREAD;
    face(m, [[P(a0, -hw), z + 0.006], [P(a1, -hw), z + 0.006], [P(a1, hw), z + 0.006], [P(a0, hw), z + 0.006]], [0, 0, 1], noseC);
    face(m, [[P(a0, hw), z - NOSE_DROP], [P(a0, -hw), z - NOSE_DROP], [P(a0, -hw), z + 0.006], [P(a0, hw), z + 0.006]], [-u[0], -u[1], 0], noseC);
  };
  // 踏面 nT 枚（flush なら一番上の蹴上げは上の階の床のふちの面）
  // スロープの歩行面は stairGeom.topAt と同じ一枚の斜面。
  if (s.ramp) {
    const sl = Math.hypot(R, L) || 1;
    const zEnd = zA + R;
    face(m, [[P(0, -hw), zA], [P(L, -hw), zEnd], [P(L, hw), zEnd], [P(0, hw), zA]], [(-R / sl) * u[0], (-R / sl) * u[1], L / sl], c);
    face(m, [[P(0, hw), soff(0)], [P(L, hw), soff(L)], [P(L, hw), zEnd], [P(0, hw), zA]], [n[0], n[1], 0], edge);
    face(m, [[P(L, -hw), soff(L)], [P(0, -hw), soff(0)], [P(0, -hw), zA], [P(L, -hw), zEnd]], [-n[0], -n[1], 0], edge);
  }
  for (let k = 0; k < (s.ramp ? 0 : nT); k++) {
    const s0 = k * tread, s1 = (k + 1) * tread;
    const zt = zA + (k + 1) * riser;
    if (zt > cutTop + 1e-6) break;
    const ring = [P(s0, -hw), P(s1, -hw), P(s1, hw), P(s0, hw)];
    if (woodUV) drawFloorFinish(M, [[ring]], "paleoak", woodUV, zt, T, highlight);
    else face(m, ring.map(p => [p, zt]), [0, 0, 1], c);
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
    if (k === "expanded") return addExpandedRail(m, a, b, zA, zA + R * sTop / L, nn, T);
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

// すりガラスの帯：区間 pc（長さ L、下の端 ba〜bb、上の端 ta〜tb）の band [下, 上, 倍率（なければ 1）] に、幅 0.16・高さ 0.12m の菱形を
// 横 0.2m・縦 0.14m おき（どれも倍率倍。1 段おきに半分ずらす）。ガラスの面から 4mm ずつ外の両面に（裏から見ても白く見える）。上の端の 0.05m 下までに収める
function addFrostBand(mesh, pc, L, ba, bb, ta, tb, band, col, graduated = false) {
  const k = band[2] || 1;
  const DW = 0.16 * k, DH = 0.12 * k, SX = 0.2 * k, SY = 0.14 * k;
  const u = [(pc.b[0] - pc.a[0]) / L, (pc.b[1] - pc.a[1]) / L];
  const nn = [-u[1], u[0]];
  const rows = Math.max(1, Math.floor((band[1] - band[0]) / SY));
  for (let r = 0; r < rows; r++) {
    const dz = band[0] + SY * (r + 0.5);
    const scale = graduated ? 1 - 0.85 * r / Math.max(1, rows - 1) : 1;
    const halfW = DW * scale / 2, halfH = DH * scale / 2;
    for (let s = SX / 2 + ((r % 2) * SX) / 2; s < L - DW / 2 - 0.02; s += SX) {
      const t = s / L;
      const base = ba + (bb - ba) * t, top = ta + (tb - ta) * t;
      const zc = base + dz;
      if (zc + halfH > top - 0.05) continue;
      const pm = lerp2(pc.a, pc.b, t);
      const pl = [pm[0] - u[0] * halfW, pm[1] - u[1] * halfW], pr = [pm[0] + u[0] * halfW, pm[1] + u[1] * halfW];
      for (const sg of [1, -1]) {
        const o = (q) => [q[0] + nn[0] * 0.004 * sg, q[1] + nn[1] * 0.004 * sg];
        const quad = [[o(pl), zc], [o(pm), zc - halfH], [o(pr), zc], [o(pm), zc + halfH]];
        mesh.quad(sg > 0 ? quad : [quad[0], quad[3], quad[2], quad[1]], [nn[0] * sg, nn[1] * sg, 0], col);
      }
    }
  }
}

// 天井（階の ceiling）：床の形（床の穴・天井の穴を抜く）の z の高さに下向きの面。slats は細い板の継ぎ目の線（grid の向きに 0.2m おき）
const CEIL_COL = { slats: "ceilSlat", plain: "ceilSlat", dark: "ceilDark" };
const SLAT_GAP = 0.2;
function addCeiling(m, f, ring, holes, zf, T, plen = null) {
  const C = f.ceiling;
  const zc = zf + C.z;
  const hs = [...holes, ...(C.holes || []).map((h) => h.coords.map(toXY))];
  const solidC = slabPolygons(ring, hs);
  // 天井ふところをふさぐ帯（plen：top＝点 → 帯の上の端の標高か null〔そこは帯なし〕、outer＝外まわりにも）：天井の穴のふち（階段・エレベーターの
  // 吹き抜け）から上の階の床の下の面まで、いちばん上の階は外まわりも屋根の下の天井まで。点は帯の天井の側へ 0.05m 寄せて調べる
  if (plen?.top) {
    for (const pg of solidC) pg.forEach((rr, k) => {
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
  const profile = ceilingProfile(f);
  if (profile) {
    const col = T(CEIL_COL[C.kind] || "ceilSlat");
    for (const patch of profile.patches) for (const pg of patch.area) {
      const surface = patch.finish === "frosted" ? T("#fffdf5")
        : patch.finish === "daylit" ? T("#eae7df") : shade(col,patch.normal);
      m.polygon(pg, p => zf + patch.at(p), patch.normal, surface);
    }
    for (const {a,b,lo,hi,normal} of profile.steps)
      face(m,[[a,zf+lo[0]],[b,zf+lo[1]],[b,zf+hi[1]],[a,zf+hi[0]]],normal,col);
    return;
  }
  const ceilCol = shade(T(CEIL_COL[C.kind] || "ceilSlat"), [0, 0, -1]);
  for (const poly of solidC) m.polygon(poly, zc, [0, 0, -1], ceilCol);
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
export function psdLeaves(m, glassy, d, open, T = interiorColor) {
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
    } else {
      const inset = Math.min(.013,(s1-s0)*.1);
      segBox(m, A, B, .044, z0, z0, z1, z1, T("#534f44"));
      segBox(m, at(s0+inset), at(s1-inset), .052, z0+.015, z0+.015, z1, z1, T("psdOrange"));
    }
  };
  leaf(-slide, half - slide);
  leaf(half + slide, L + slide);
}

// 鋼の縦の格子の柵：上と下の横の材・2m おきの柱・0.12m おきの細い縦の棒
function addBars(m, a, b, ba, bb, ta, tb, c, picket = false) {
  const L = len(sub(b, a));
  if (L < 0.05) return;
  const bottom = picket ? 0.025 : 0.1;
  if (picket) segBox(m, a, b, 0.082, ta - 0.035, tb - 0.035, ta, tb, c);
  else bar(m, [a, ta - 0.03], [b, tb - 0.03], 0.05, c);
  bar(m, [a, ba + bottom], [b, bb + bottom], picket ? 0.026 : 0.04, c);
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
    const z0 = ba + ((bb - ba) * k) / nb + bottom, z1 = ta + ((tb - ta) * k) / nb - 0.03;
    const p0 = [p[0] - u[0] * w, p[1] - u[1] * w], p1 = [p[0] + u[0] * w, p[1] + u[1] * w];
    const depth = picket ? 0.022 : w;
    const q0 = [p[0] - nl[0] * depth, p[1] - nl[1] * depth], q1 = [p[0] + nl[0] * depth, p[1] + nl[1] * depth];
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
// m は片面で描く段（cull）がよい（天井は下からだけ見える）。skip（形の並び）：殻の屋根の上に別の建物の階の床がのるところ。そこは天井も
// 梁も描かない（その階の床の下の面が見える。西5号館の階段室：殻の屋根の下の天井が 2 階から 3 階への階段を横切っていた。2026-11-15）
export function addRoofCeiling(m, f, groundAt, tint = (c) => c, { cols = [], floorAt = null, skip = [] } = {}) {
  const C0 = roofCeiling(f, groundAt);
  if (!Number.isFinite(C0.g0) || !C0.pieces.length) return;
  const C = !skip.length ? C0 : {
    ...C0,
    pieces: C0.pieces.flatMap((pc) => (clipOp("difference", pc.poly.map(closeR), ...skip.map((r) => [closeR(r)])) || [])
      .map((pg) => pg.map(openR).filter((r) => r.length >= 3))
      .filter((pg) => pg.length && Math.abs(ringArea(pg[0])) > 1e-3)
      .map((pg) => ({ poly: pg, box: boxOf(pg[0]), zAt: pc.zAt }))),
  };
  if (!C.pieces.length) return;
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
  const profile = ceilingProfile(f);
  for (const patch of profile?.patches || []) for (const pg of patch.area) {
    const [boundary,...openings] = pg.map(openR);
    add.solid(boundary,openings,(x,y) => {
      const z = zf + patch.at([x,y]);
      return [[z,z+.12]];
    }, 2);
  }
  for (const {a,b,lo,hi} of profile?.steps || []) {
    const count = Math.max(1, Math.ceil(Math.max(Math.abs(lo[1]-lo[0]),Math.abs(hi[1]-hi[0]))/.15));
    for (let i=0;i<count;i++) {
      const t=i/count, u=(i+1)/count;
      const bottom=lo[0]+(lo[1]-lo[0])*(lo[1]>lo[0] ? t : u);
      const top=hi[0]+(hi[1]-hi[0])*(hi[1]>hi[0] ? u : t);
      add.edge(lerp2(a,b,t),lerp2(a,b,u),BODY,[[zf+bottom,zf+top]],false);
    }
  }
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
      const lo = pc.door ? (low || w.kind === "low" ? null : z0 + (w.doorHeight ?? DOOR_H)) : z0;
      if (lo == null || !(z1 > lo)) continue;
      const stand = w.kind === "low";
      // 厚い壁（0.4m より厚い。本館の柱・階段のあいだの壁 0.86m など）は四角の当たり：線の当たり（両端が丸い）だと、端が厚さの半分だけ
      // 先へ出て、踊り場で折り返せなかった（2026-11-15）
      if (t > 0.4 && !low) {
        const L = len(sub(pc.b, pc.a));
        const u = L > 1e-6 ? [(pc.b[0] - pc.a[0]) / L, (pc.b[1] - pc.a[1]) / L] : [1, 0];
        const nn = [(-u[1] * t) / 2, (u[0] * t) / 2];
        const rr = [[pc.a[0] + nn[0], pc.a[1] + nn[1]], [pc.b[0] + nn[0], pc.b[1] + nn[1]], [pc.b[0] - nn[0], pc.b[1] - nn[1]], [pc.a[0] - nn[0], pc.a[1] - nn[1]]];
        const sp = [[lo, z1]];
        add.solid(rr, [], () => sp, 1);
        continue;
      }
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
    if (it.style === "ceramicRelief" && r.length===4) {
      const F=frontOf(r);
      add.solid(r,[],reliefWalkSpans(F,depthOf(F,r),zf+it.z0),.16);
      continue;
    }
    const mount = ceilingMount(profile,it,r);
    if (mount) {
      add.solid(r, [], (x,y) => {
        const offset = mount.offset([x,y]);
        return [[zf+it.z0+(it.z0 > 0 ? offset : 0), zf+it.z1+offset]];
      }, .5);
      continue;
    }
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
    if (G.panel === "steel") {
      for (let sv=1.12; sv<L-.55; sv+=1.24) {
        for (const d of [-.027,.007]) {
          const x=pl+sg*d;
          bar(m,[G.P(sv,x),pBot(sv)+.025],[G.P(sv+.025,x),pTop(sv)-.045],.009,T("#969da1"));
        }
      }
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
    if (M.fixtureInstances) {
      for(const [lo,hi,z] of [[-.9,-.3,zA+.006],[L+.3,L+.9,zTop+.018]]) {
        drawTactileStrip(M.fixtureInstances,[P(lo,-hw),P(hi,-hw),P(hi,hw),P(lo,hw)],z,true);
      }
    }
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
function addSmallTiles(m, pc, t, z0a, z0b, z1a, z1b, T, { tw = 0.1, th = 0.15, joint = 0.008, tile = "mtile", grout = "mtileGrout", band = null, bandC = "mtileBand", bandGrout = "mtileBandGrout" } = {}) {
  const L = len(sub(pc.b, pc.a));
  if (L < 0.05) return;
  const u = [(pc.b[0] - pc.a[0]) / L, (pc.b[1] - pc.a[1]) / L];
  const nl = [-u[1], u[0]];
  const lo = (s) => z0a + ((z0b - z0a) * s) / L, hi = (s) => z1a + ((z1b - z1a) * s) / L;
  const bands = [];
  if (band) for (let s = band[1] * 0.5; s < L; s += band[1]) bands.push([Math.max(0, s), Math.min(L, s + band[0])]);
  const inBand = (s) => bands.some(([a, b]) => s >= a && s <= b);
  const g = joint;
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
// 横板張りの継ぎ目の溝（壁の両面、下の端から 0.16m おきの細い暗い帯。西5号館の製図室の窓の下の木の壁。2026-11-15）
function addBoardGrooves(m, pc, t, ba, bb, ta, tb, c) {
  const L = len(sub(pc.b, pc.a));
  if (L < 0.05) return;
  const u = [(pc.b[0] - pc.a[0]) / L, (pc.b[1] - pc.a[1]) / L];
  const nl = [-u[1], u[0]];
  for (const sg of [1, -1]) {
    const o = sg * (t / 2 + 0.002);
    const A = [pc.a[0] + nl[0] * o, pc.a[1] + nl[1] * o], B = [pc.b[0] + nl[0] * o, pc.b[1] + nl[1] * o];
    const n = [nl[0] * sg, nl[1] * sg, 0];
    for (let z = 0.16; ; z += 0.16) {
      const za = ba + z, zb = bb + z;
      if (za > ta - 0.03 || zb > tb - 0.03) break;
      face(m, [[A, za - 0.006], [B, zb - 0.006], [B, zb + 0.006], [A, za + 0.006]], n, c);
    }
  }
}
// 作り付けの木の収納（物 cabinet。西5号館の製図室の壁ぎわ。2026-11-15）：1 本目の辺が前。足もとの暗い台（高さ 0.08、前から 0.05 内）、
// 木の箱、前の面に扉の継ぎ目の暗い線（n 枚。なしは 0.9m ごと）と、扉ごとの細い縦の取っ手（となりの扉との合わせの側）
function addCabinet(m, it, r, z0, z1, T, tint) {
  const F = frontOf(r);
  const D = depthOf(F, r), L = F.L;
  if (L < 0.2 || D < 0.05 || z1 - z0 < 0.2) return;
  const wood = it.color ? tint(COL_HEX(it.color)) : T("cabinetWood");
  const P = (x, y) => [F.a[0] + F.u[0] * x - F.nf[0] * y, F.a[1] + F.u[1] * x - F.nf[1] * y];
  const zp = z0 + 0.08;
  prismPoly(m, [P(0.02, 0.05), P(L - 0.02, 0.05), P(L - 0.02, D), P(0.02, D)], z0, zp, T("darkItem"));
  prismPoly(m, r, zp, z1, wood, { bottom: true });
  const n = Math.max(1, it.n || Math.round(L / 0.9));
  const line = T("cabinetLine");
  for (let k = 1; k < n; k++) frontQuad(m, F, (L * k) / n - 0.006, (L * k) / n + 0.006, zp + 0.01, z1 - 0.01, 0.003, line);
  const hz0 = zp + Math.min(0.9, (z1 - zp) * 0.42), hz1 = hz0 + 0.3;
  for (let k = 0; k < n; k++) {
    const x = (L * (k + (k % 2 ? 0.1 : 0.9))) / n;
    frontQuad(m, F, x - 0.01, x + 0.01, hz0, hz1, 0.012, T("handle"));
  }
}
// かまぼこ形の天井（階の vault。2026-11-15、西5号館の 4 階の製図室：JIA の写真 07-01_W5_77 のカメラを解いて、立ち上がり・頂部の高さ・
// 円弧の半径・板の間隔を測った）：裏の暗い灰の面（円弧を 0.25m ほどの帯に分けた面）、その下に頂部の線に平行な木の板（pitch m おき）、
// 頂部の天窓（口の上にも細い板が続く。口の両わきの白い面・上の明るいガラスの面と横の枠）、板の下の面の四角い照明、板の裏の黒い吹き出し口
// （すき間が黒く見える）、円弧の壁（ends：立ち上がりより上。窓は明るいすりガラスの面と枠・上の半分の横の格子）。
// v は頂部の線から横の m（1 点目→2 点目に見て左が +）
const VAULT_PITCH = 0.2, VAULT_SLAT = 0.14, VAULT_DEPTH = 0.035, VAULT_DROP = 0.06;
function addVault(m, glassy, f, zf, T, tint) {
  const V = f.vault;
  const A = toXY(V.coords[0]), B = toXY(V.coords[1]);
  const Lax = len(sub(B, A));
  if (Lax < 0.5) return;
  const u = [(B[0] - A[0]) / Lax, (B[1] - A[1]) / Lax], nv = [-u[1], u[0]];
  const hw = V.half, zs = zf + V.z0, zc = zf + V.z1, rise = zc - zs;
  const R = (hw * hw + rise * rise) / (2 * rise);
  const zO = zc - R; // 円の中心の高さ
  const P = (s, v) => [A[0] + u[0] * s + nv[0] * v, A[1] + u[1] * s + nv[1] * v];
  const pt = (a, r) => [r * Math.sin(a), zO + r * Math.cos(a)]; // 角度 a（頂部から、左が +）・半径 r の点 [v, z]
  const nrm = (dv, dz) => { const l = Math.hypot(dv, dz) || 1; return [(nv[0] * dv) / l, (nv[1] * dv) / l, dz / l]; };
  const inward = (a) => nrm(-Math.sin(a), -Math.cos(a)); // 部屋を向く向き
  const aMax = Math.asin(Math.min(1, hw / R));
  const sky = V.sky || null;
  const aSky = sky ? Math.asin(Math.min(1, sky.half / R)) : 0;
  const wood = V.col ? tint(COL_HEX(V.col)) : T("vaultWood");
  const back = V.back ? tint(COL_HEX(V.back)) : T("vaultBack");
  const pitch = V.pitch || VAULT_PITCH, slat = Math.min(V.slat || VAULT_SLAT, pitch - 0.005), dep = V.depth || VAULT_DEPTH, drop = V.drop ?? VAULT_DROP;
  const long = (q1, q2, nn, c, s0 = 0, s1 = Lax) => face(m, [[P(s0, q1[0]), q1[1]], [P(s1, q1[0]), q1[1]], [P(s1, q2[0]), q2[1]], [P(s0, q2[0]), q2[1]]], nn, c);
  // 裏の面
  for (const sg of [1, -1]) {
    const n = Math.max(2, Math.ceil((R * (aMax - aSky)) / 0.25));
    for (let k = 0; k < n; k++) {
      const aa = (aSky + ((aMax - aSky) * k) / n) * sg, ab = (aSky + ((aMax - aSky) * (k + 1)) / n) * sg;
      long(pt(aa, R), pt(ab, R), inward((aa + ab) / 2), back);
    }
  }
  // 木の板：下の面と両わきの面（上の面は裏に隠れる）。板のまん中の角度 a・幅 w
  const rIn = R - drop - dep, rOut = R - drop, rMid = R - drop - dep / 2;
  const slatAt = (a, w) => {
    const da = w / 2 / R;
    const p1 = pt(a - da, rIn), p2 = pt(a + da, rIn), p3 = pt(a + da, rOut), p4 = pt(a - da, rOut), c0 = pt(a, rMid);
    long(p1, p2, inward(a), wood);
    long(p1, p4, nrm((p1[0] + p4[0]) / 2 - c0[0], (p1[1] + p4[1]) / 2 - c0[1]), wood);
    long(p2, p3, nrm((p2[0] + p3[0]) / 2 - c0[0], (p2[1] + p3[1]) / 2 - c0[1]), wood);
  };
  for (const sg of [1, -1]) for (let arc = R * aSky + pitch / 2; arc < R * aMax - slat / 2; arc += pitch) slatAt((arc / R) * sg, slat);
  // 板の下の面に貼るもの（照明）・裏に貼るもの（吹き出し口）：v のまわり ±hv、s0〜s1 の四角（半径 r の円弧の上）
  const onArc = (r, v, hv, s0, s1, c) => {
    const za = zO + Math.sqrt(Math.max(0, r * r - (v - hv) * (v - hv))), zb = zO + Math.sqrt(Math.max(0, r * r - (v + hv) * (v + hv)));
    face(m, [[P(s0, v - hv), za], [P(s1, v - hv), za], [P(s1, v + hv), zb], [P(s0, v + hv), zb]], inward(Math.asin(Math.max(-1, Math.min(1, v / r)))), c);
  };
  for (const ln of V.lights || []) {
    if (Math.abs(ln.v) > hw - 0.15 || (sky && Math.abs(ln.v) < sky.half + 0.1)) continue;
    for (let s = ln.s0 || ln.step / 2; s < Lax - 0.1; s += ln.step) {
      if (ln.fixture) {
        const at = (ds,dv,drop) => {
          const v = ln.v+dv, r = rIn-.006-drop;
          return [P(s+ds,v),zO+Math.sqrt(Math.max(0,r*r-v*v))];
        };
        addVaultFixture(m,ln.fixture,at,inward(Math.asin(ln.v/rIn)),T);
      } else onArc(rIn - 0.006, ln.v, 0.095, s - 0.095, s + 0.095, T("dlight"));
    }
  }
  // 吹き出し口：板の裏の面のすぐ前（板のあいだのすき間が黒く見える）
  for (const ln of V.slots || []) {
    const hv = (ln.w || 0.8) / 2;
    if (Math.abs(ln.v) + hv > hw - 0.1 || (sky && Math.abs(ln.v) - hv < sky.half + 0.05)) continue;
    for (let s = ln.s0 || 0; s < Lax - 0.1; s += ln.step) onArc(R - 0.012, ln.v, hv, Math.max(0.05, s), Math.min(Lax - 0.05, s + (ln.len || 1)), T("slotDark"));
  }
  // 天窓：口の上にも細い板（sky.pitch おき・幅 sky.slat）、口の両わきの白い面（裏の面から上のガラスの面まで）、上の明るいガラスの面と
  // 横の枠（sky.bar m おき）・両わきの長い枠
  if (sky) {
    const zTop = zf + sky.z;
    const zEdge = pt(aSky, R)[1];
    const sp = sky.pitch || pitch, sw = Math.min(sky.slat || slat * 0.45, sp - 0.01);
    const nS = Math.max(1, Math.round((2 * sky.half) / sp));
    for (let k = 0; k < nS; k++) slatAt((-sky.half + ((k + 0.5) * 2 * sky.half) / nS) / R, sw);
    for (const sg of [1, -1]) {
      const v = sky.half * sg;
      face(m, [[P(0, v), zEdge], [P(Lax, v), zEdge], [P(Lax, v), zTop], [P(0, v), zTop]], nrm(-sg, 0), T("vaultLouver"));
      segBox(m, P(0, v - sg * 0.04), P(Lax, v - sg * 0.04), 0.08, zTop - 0.07, zTop - 0.07, zTop, zTop, T("vaultLouver"), { bottom: true, ends: false });
    }
    face(m, [[P(0, -sky.half), zTop], [P(Lax, -sky.half), zTop], [P(Lax, sky.half), zTop], [P(0, sky.half), zTop]], [0, 0, -1], T("vaultSky"));
    const bs = sky.bar || 1.0;
    for (let s = bs / 2; s < Lax; s += bs) segBox(m, P(s, -sky.half), P(s, sky.half), 0.05, zTop - 0.08, zTop - 0.08, zTop - 0.005, zTop - 0.005, T("vaultLouver"), { bottom: true, ends: false });
  }
  // 円弧の壁（立ち上がりより上）：縦の帯に分けて、窓のところは窓の下と上だけ。上の端は裏の面（天窓のところは天窓の上の明るい面）まで
  const wallC = T("wall");
  const topAt = (v) => (sky && Math.abs(v) < sky.half ? zf + sky.z : zO + Math.sqrt(Math.max(0, R * R - v * v)) + 0.01);
  for (const e of V.ends || []) {
    const s = Math.max(0, Math.min(Lax, e.s));
    const wins = (e.wins || []).map(([v0, v1, wz0, wz1]) => [v0, v1, zf + wz0, zf + wz1]);
    const cuts = new Set([-hw, hw]);
    for (let v = -hw; v < hw; v += 0.5) cuts.add(Math.round(v * 1000) / 1000);
    if (sky) { cuts.add(-sky.half); cuts.add(sky.half); }
    for (const w of wins) { cuts.add(Math.max(-hw, Math.min(hw, w[0]))); cuts.add(Math.max(-hw, Math.min(hw, w[1]))); }
    const vs = [...cuts].sort((a, b) => a - b);
    const nn = [u[0], u[1], 0];
    for (let i = 0; i + 1 < vs.length; i++) {
      const va = vs[i], vb = vs[i + 1];
      if (vb - va < 1e-4) continue;
      const vm = (va + vb) / 2;
      // 天窓の口の端をまたぐ帯では、上の端を帯の中ほどの高さにそろえる（頂部の明るい面との段）
      const ta = sky && Math.abs(vm) < sky.half ? zf + sky.z : topAt(va), tb = sky && Math.abs(vm) < sky.half ? zf + sky.z : topAt(vb);
      const w = wins.find((q) => vm > q[0] && vm < q[1]);
      const quadV = (za0, zb0, za1, zb1) => { if (Math.max(za1 - za0, zb1 - zb0) > 0.005) face(m, [[P(s, va), za0], [P(s, vb), zb0], [P(s, vb), zb1], [P(s, va), za1]], nn, wallC); };
      if (!w) { quadV(zs, zs, ta, tb); continue; }
      const lo = Math.max(zs, w[2]), hi = Math.min(Math.min(ta, tb), w[3]);
      quadV(zs, zs, lo, lo);
      quadV(hi, hi, ta, tb);
    }
    // 窓：明るいすりガラスの面（向こうは隣の部屋の天井の上なので透かさない）・枠・上の半分の横の格子
    for (const [v0, v1, z0, z1] of wins) {
      face(m, [[P(s, v0), z0], [P(s, v1), z0], [P(s, v1), z1], [P(s, v0), z1]], nn, T("frost"));
      const fc = T("mullion");
      bar(m, [P(s, v0), z0], [P(s, v1), z0], 0.06, fc);
      bar(m, [P(s, v0), z1], [P(s, v1), z1], 0.06, fc);
      bar(m, [P(s, v0), z0], [P(s, v0), z1], 0.06, fc);
      bar(m, [P(s, v1), z0], [P(s, v1), z1], 0.06, fc);
      const zm = z0 + (z1 - z0) * 0.55;
      for (let z = zm; z < z1 - 0.05; z += 0.11) bar(m, [P(s, v0), z], [P(s, v1), z], 0.035, fc);
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

// The long front edge of the counter faces the lobby; staff sit behind the clear screens.
function addServiceDesk(M,r,z,T) {
  const F=frontOf(r), depth=depthOf(F,r), count=Math.max(1,Math.round(F.L/2.35));
  const P=(x,y)=>[F.a[0]+F.u[0]*x-F.nf[0]*y,F.a[1]+F.u[1]*x-F.nf[1]*y];
  const rect=(a,b,c,d)=>[P(a,b),P(c,b),P(c,d),P(a,d)];
  const metal=T("#a8aaa4"), bezel=T("#373b3b"), mount=depth*.70;
  for (let i=0;i<count;i++) {
    const x=(i+.5)*F.L/count, half=Math.min(.70,F.L/count*.40);
    const a=P(x-half,.17), b=P(x+half,.17);
    for (const s of [-1,1]) {
      const foot=x+s*(half-.13);
      prismPoly(M.m,rect(foot-.045,.115,foot+.045,.225),z,z+.014,metal);
      bar(M.m,[P(foot,.17),z+.012],[P(foot,.17),z+.16],.016,metal);
    }
    M.glassy.quad([[a,z+.115],[b,z+.115],[b,z+.68],[a,z+.68]],[...F.nf,0],T("#d6e4df"));
    bar(M.m,[a,z+.68],[b,z+.68],.009,metal);
    const monitor=x-.19;
    prismPoly(M.m,rect(monitor-.11,mount-.07,monitor+.11,mount+.07),z,z+.014,bezel);
    bar(M.m,[P(monitor,mount),z+.01],[P(monitor,mount),z+.21],.037,bezel);
    prismPoly(M.m,rect(monitor-.24,mount-.024,monitor+.24,mount+.024),z+.16,z+.45,bezel,{bottom:true});
    // The low blue forms tray and the upright card visible between service positions.
    prismPoly(M.m,rect(x+.16,.255,x+.40,.43),z,z+.032,T("#658398"));
    prismPoly(M.m,rect(x+.18,.27,x+.38,.41),z+.032,z+.037,T("#e8e8da"));
    prismPoly(M.m,rect(x+.37,.07,x+.48,.092),z,z+.14,T("#e9e8df"));
  }
}

// The swivel nozzle and retaining flange fit the existing supply duct.
function addJetDiffuser(m,r,z0,z1,T) {
  const F=frontOf(r), z=(z0+z1)/2, radius=Math.min(F.L,z1-z0)/2;
  const center=lerp2(F.a,F.b,.5), n=[...F.nf,0];
  const point=(angle,scale,depth,drop) => {
    const x=radius*scale*Math.cos(angle);
    return [[center[0]+x*F.u[0]+depth*F.nf[0],center[1]+x*F.u[1]+depth*F.nf[1]],z+radius*scale*Math.sin(angle)+drop];
  };
  const profile=[[1,0,0,"#bcc0bd"],[.94,.018,0,"#f0efea"],[.76,.024,0,"#d0d1ca"],
    [.65,.015,-.004,"#818681"],[.57,.004,-.012,"#454947"],[.43,.016,-.022,"#939993"],[0,.012,-.022,"#373c3b"]];
  for (let j=1;j<profile.length;j++) {
    const [ra,da,za]=profile[j-1],[rb,db,zb,color]=profile[j];
    for (let i=0;i<24;i++) {
      const a=2*Math.PI*i/24,b=2*Math.PI*(i+1)/24;
      face(m,[point(a,ra,da,za),point(b,ra,da,za),point(b,rb,db,zb),point(a,rb,db,zb)],n,T(color));
    }
  }
}
// 前の面の上の四角（x：a から b へ m、z：標高、d：面から前へ m）
function frontQuad(m, F, x0, x1, z0, z1, d, c) {
  const P = (x) => [F.a[0] + F.u[0] * x + F.nf[0] * d, F.a[1] + F.u[1] * x + F.nf[1] * d];
  face(m, [[P(x0), z0], [P(x1), z0], [P(x1), z1], [P(x0), z1]], [F.nf[0], F.nf[1], 0], c);
}

// 本館の廊下の窓台の下に並ぶ防災ヘルメット。
function addHelmetRack(m, r, z0, z1, T) {
  const F = frontOf(r), depth = depthOf(F, r), h = z1 - z0;
  const P = (x, d) => [F.a[0] + F.u[0] * x + F.nf[0] * (d - depth), F.a[1] + F.u[1] * x + F.nf[1] * (d - depth)];
  const back = [P(0, 0), P(F.L, 0), P(F.L, 0.035), P(0, 0.035)];
  prismPoly(m, back, z0, z0 + h * 0.7, T("#596e91"));
  const count = Math.min(12, Math.max(1, Math.round(F.L / 0.32)));
  const pitch = F.L / count, rx = Math.min(0.16, pitch * 0.47);
  // 開口を壁に向けて掛ける。つばを残し、廊下側に丸い帽体を張り出す。
  const profile = [[0, 0.98], [0.08, 1.03], [0.15, 0.96], [0.49, 0.87], [0.75, 0.67], [0.94, 0.36], [1, 0]];
  for (let i = 0; i < count; i++) {
    const cx = pitch * (i + 0.5), blue = T(i % 3 === 1 ? "#83aacc" : "#789fc4");
    const vertex = ([d, radius], a) => [P(cx + rx * radius * Math.cos(a), 0.033 + (depth - 0.033) * d), z0 + h * (0.54 + 0.43 * radius * Math.sin(a))];
    for (let j = 1; j < profile.length; j++) for (let k = 0; k < 16; k++) {
      const a = k * Math.PI / 8, b = (k + 1) * Math.PI / 8, mid = (a + b) / 2;
      const forward = (profile[j - 1][1] - profile[j][1]) / (profile[j][0] - profile[j - 1][0]), scale = Math.hypot(1, forward);
      const n = [(F.u[0] * Math.cos(mid) + F.nf[0] * forward) / scale, (F.u[1] * Math.cos(mid) + F.nf[1] * forward) / scale, Math.sin(mid) / scale];
      face(m, [vertex(profile[j - 1], a), vertex(profile[j - 1], b), vertex(profile[j], b), vertex(profile[j], a)], n, j === 1 ? T("#4f7097") : blue);
    }
    bar(m, [P(cx, 0.052), z0 + 0.02], [P(cx, 0.12), z0 + h * 0.23], 0.025, T("#454d5d"));
  }
}

function addNoticeboard(m, it, r, z0, z1, T) {
  const F = frontOf(r), w = F.L, h = z1 - z0;
  prismPoly(m, r, z0, z1, T("#858a88"));
  const rect = (x0, y0, x1, y1, d, color) => frontQuad(m, F, x0 * w, x1 * w, z0 + y0 * h, z0 + y1 * h, d, T(color));
  rect(0.012, 0.025, 0.988, 0.975, 0.004, it.color || "#f2f1e9");
  if (it.style === "whiteboard") {
    rect(0.02, 0.02, 0.98, 0.052, 0.024, "#9d9f9d");
    rect(0.72, 0.052, 0.78, 0.079, 0.026, "#4a6384");
    return;
  }
  const ink = ["#7997a7", "#868775", "#b8a88d", "#758a9e", "#92a5a7"];
  for (let i = 0; i < 5; i++) {
    const x = 0.042 + i * 0.185, y = 0.84 - (i % 3) * 0.053;
    rect(x, y - 0.49, x + 0.15, y, 0.008, "#f9f8ef");
    rect(x + 0.009, y - 0.085, x + 0.139, y - 0.035, 0.010, ink[i]);
    if (i % 2 === 0) rect(x + 0.021, y - 0.26, x + 0.13, y - 0.12, 0.010, ink[(i + 2) % ink.length]);
    for (let j = 0; j < 3; j++) rect(x + 0.015, y - 0.32 - j * 0.047, x + 0.127 - (j % 2) * 0.025, y - 0.312 - j * 0.047, 0.010, "#9b9d99");
  }
}

// 開いた框戸。四角の最初の辺は吊元から戸先へ向く。
function addGlazedLeaf(m, glassy, r, z0, z1, tint) {
  const F = frontOf(r), depth = depthOf(F, r), height = z1 - z0;
  const at = (x, offset) => [F.a[0] + F.u[0] * x + F.nf[0] * offset, F.a[1] + F.u[1] * x + F.nf[1] * offset];
  const width = F.L, stile = Math.min(0.085, width * 0.1);
  const frame = tint(hex("#333944")), brass = tint(hex("#b6a16e"));
  const rail = (left, right, low, high) => segBox(m, at(left, -depth / 2), at(right, -depth / 2), depth, low, low, high, high, frame, { bottom: true });
  rail(0, stile, z0, z1);
  rail(width - stile, width, z0, z1);
  for (const [lo, hi] of [[0, 0.09], [0.26, 0.285], [0.48, 0.505], [0.72, 0.745], [0.96, 1]]) {
    rail(stile, width - stile, z0 + lo * height, z0 + hi * height);
  }
  const p = at(stile, -depth / 2), q = at(width - stile, -depth / 2);
  glassy.quad([[p, z0 + height * 0.09], [q, z0 + height * 0.09], [q, z1 - height * 0.04], [p, z1 - height * 0.04]], [...F.nf, 0], tint(GLASS));
  for (const side of [-1, 1]) {
    const pull = (reach, h) => [at(width - stile / 2, -depth / 2 + side * (depth / 2 + reach)), z0 + h * height];
    const path = [pull(0, 0.33), pull(0.075, 0.36), pull(0.09, 0.46), pull(0, 0.49)];
    for (let i = 1; i < path.length; i++) bar(m, path[i - 1], path[i], 0.024, brass);
  }
}

// 本館の玄関ホール。三連のガラスの向こうに投光器と覆いが見える（IMG_1380、62〜91 秒）。
function addGlassArtwork(m, glassy, r, z0, z1, T, tint) {
  const F = frontOf(r), depth = depthOf(F, r), height = z1 - z0;
  const at = (x, y) => [F.a[0] + x * F.u[0] - y * F.nf[0], F.a[1] + x * F.u[1] - y * F.nf[1]];
  const box = (x0, x1, y0, y1, lo, hi, c) => prismPoly(m, [at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)], z0 + lo * height, z0 + hi * height, c, { bottom: true });
  const normal = [...F.nf, 0], steel = T("steel"), dark = T("darkItem");
  box(0, F.L, 0, depth, 0, 0.065, steel);
  box(0, F.L, depth * 0.86, depth, 0.36, 0.96, dark);
  // 折り返した銀色の覆い。背面・側面からも見える投光器のひさし。
  for (let i = 0; i < 20; i++) {
    const a = i * F.L / 20, b = (i + 1) * F.L / 20;
    const y = (i % 2 ? 0.79 : 0.83) * depth, y2 = 1.62 * depth - y;
    face(m, [[at(a, y), z0 + height * 0.40], [at(b, y2), z0 + height * 0.40], [at(b, y2), z1], [at(a, y), z1]], normal, tint(hex(i % 2 ? "#a2a3a3" : "#b2b3b2")));
  }
  box(0, F.L, depth * 0.78, depth, 0.96, 1, steel);
  const colors = glassPalette.map(color => tint(hex(color)));
  for (let panel = 0; panel < 3; panel++) {
    const pitch = F.L / 3, cx = pitch * (panel + 0.5);
    const left = panel * pitch + 0.018, right = (panel + 1) * pitch - 0.018;
    const y = 0.12 * depth, bottom = z0 + 0.065 * height;
    glassy.quad([[at(left, y), bottom], [at(right, y), bottom], [at(right, y), z1], [at(left, y), z1]], normal, tint(GLASS));
    for (const x of [left, right]) bar(m, [at(x, y), bottom], [at(x, y), z1], 0.022, steel);
    bar(m, [at(left, y), z1], [at(right, y), z1], 0.025, steel);
    box(left + pitch * 0.08, right - pitch * 0.08, depth * 0.19, depth * 0.48, 0.066, 0.073, T("beamLit"));
    box(cx - pitch * 0.12, cx + pitch * 0.12, depth * 0.63, depth * 0.88, 0.31, 0.41, dark);
    // ガラスを通して見える背景はそのまま透かし、色が映った部分を頂点色で補間する。
    const rows = glassPanels[2 - panel];
    const vertices = rows.map((row, iy) => Array.from(row, (code, ix) => {
      if (code === ".") return null;
      const x = right - (right - left) * ix / (row.length - 1);
      const z = z0 + height * (0.97 - 0.78 * iy / (rows.length - 1));
      return { xy: at(x, y - 0.009), z, color: colors[parseInt(code, 36)] };
    }));
    for (let iy = 1; iy < vertices.length; iy++) {
      const upper = vertices[iy - 1], lower = vertices[iy];
      for (let ix = 1; ix < lower.length; ix++) {
        const corners = [upper[ix - 1], upper[ix], lower[ix], lower[ix - 1]].filter(Boolean);
        if (corners.length < 3) continue;
        for (let i = 2; i < corners.length; i++) {
          for (const v of [corners[0], corners[i - 1], corners[i]]) m.vert(v.xy, v.z, normal, v.color);
        }
      }
    }
  }
}
// Blue and lavender paper flowers on the square column beside the Taki B1 bookshelf.
function addColumnFlowers(m, r, z0, z1, tint) {
  const palette = ["#8daed2", "#9d95b3", "#b5c8d7", "#7c99b3"].map(c => tint(COL_HEX(c)));
  for (let side = 0; side < 4; side++) {
    const F = frontOf([...r.slice(side), ...r.slice(0, side)]);
    for (let i = 0; i < 12; i++) {
      const x = F.L * (0.2 + 0.6 * hash2(side + 17, i));
      const z = z0 + 0.30 + i * 0.12 + 0.05 * hash2(i, side);
      const radius = Math.min(F.L * 0.14, i % 4 === 0 ? 0.068 : 0.032);
      if (z + radius > z1) continue;
      const point = (dx, dz) => [[F.a[0] + F.u[0] * (x + dx) + F.nf[0] * 0.006, F.a[1] + F.u[1] * (x + dx) + F.nf[1] * 0.006], z + dz];
      const rim = Array.from({ length: 20 }, (_, j) => {
        const a = j * Math.PI / 10, size = radius * (j % 4 === 0 ? 0.36 : 1);
        return point(Math.cos(a) * size, Math.sin(a) * size);
      });
      const center = point(0, 0), color = palette[(i + side) % palette.length];
      for (let j = 0; j < rim.length; j += 2) face(m, [center, rim[j], rim[j + 1], rim[(j + 2) % rim.length]], [...F.nf, 0], color);
    }
  }
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
// B2のイベントスペースのキャスター付き縦型モニター。
function addKiosk(m, r, z0, z1, T) {
  const F = frontOf(r), W = F.L, D = depthOf(F, r), H = z1 - z0;
  const P = (x, y) => [F.a[0] + F.u[0] * x - F.nf[0] * y, F.a[1] + F.u[1] * x - F.nf[1] * y];
  const frame = T("#292a2b"), screen = T("#202226");
  for (const x of [0.075, W - 0.075]) for (const y of [0.07, D - 0.07]) {
    segBox(m, P(x, y - 0.031), P(x, y + 0.031), 0.036, z0, z0, z0 + 0.07, z0 + 0.07, frame);
  }
  prismPoly(m, r, z0 + 0.06, z0 + 0.14 * H, T("#424447"), { bottom: true });
  const panel = (x, t, d) => [P(x, D * (0.08 + 0.56 * t) + d), z0 + H * (0.13 + 0.87 * t)];
  face(m, [panel(0,0,0), panel(W,0,0), panel(W,1,0), panel(0,1,0)], [...F.nf, 0], frame);
  face(m, [panel(0.018,0.02,-0.003), panel(W-0.018,0.02,-0.003), panel(W-0.018,0.984,-0.003), panel(0.018,0.984,-0.003)], [...F.nf, 0], screen);
  for (const x of [0, W]) face(m, [panel(x,0,0), panel(x,1,0), panel(x,1,0.045), panel(x,0,0.045)], [...F.u, 0], frame);
  face(m, [panel(0,1,0), panel(W,1,0), panel(W,1,0.045), panel(0,1,0.045)], [0,0,1], frame);
  face(m, [panel(0,0,0.045), panel(W,0,0.045), panel(W,1,0.045), panel(0,1,0.045)], [-F.nf[0], -F.nf[1], 0], frame);
  bar(m, [P(W / 2, D * 0.8), z0 + 0.14 * H], panel(W / 2, 0.64, 0.045), 0.06, frame);
}

// 額の広告・掲示板：額（color2）の中に紙（color）、紙の上に色の四角（紙ごと。いつも同じ並び）
function addPoster(m, r, z0, z1, T, it, tint, ctx) {
  const F = frontOf(r);
  if (it.style === "exit") {
    const green = T("#08ae76"), white = T("#f6faf2"), h = Math.min(F.L, z1 - z0) * 0.86;
    prismPoly(m, r, z0, z1, white);
    frontQuad(m, F, 0.012, F.L - 0.012, z0 + 0.012, z1 - 0.012, 0.002, green);
    const pad = (F.L - h) / 2, bottom = (z0 + z1 - h) / 2;
    for (const [x, y, w, height] of iconCells("exit", h)?.rects || []) {
      frontQuad(m, F, pad + x, pad + x + w, bottom + y, bottom + y + height, 0.003, white);
    }
    return;
  }
  if (it.style === "flowers") {
    // 大型画面の下の銅色の花と、右へ散る花びら（S__47661077）。
    const color = T("#a36e47"), H = z1 - z0, n = [...F.nf, 0];
    const lf = leftEnd(F), u = rightOf(F);
    const P = (x, y) => [[lf[0] + u[0] * x * F.L, lf[1] + u[1] * x * F.L], z0 + y * H];
    const petal = (x, y, angle, size) => {
      const dx = Math.cos(angle) * size, dy = Math.sin(angle) * size;
      const at = (forward, side) => P(x + (dx * forward - dy * side) / F.L, y + (dy * forward + dx * side) / H);
      face(m, [at(0, 0), at(0.55, 0.26), at(1, 0), at(0.6, -0.26)], n, color);
    };
    for (let i = 0; i < 12; i++) {
      const root = 0.08 + 0.27 * hash2(i, 23), x = root + (hash2(i, 5) - 0.5) * 0.13;
      const y = 0.20 + hash2(i, 9) * 0.55;
      face(m, [P(root - 0.0015, 0), P(root + 0.0015, 0), P(x + 0.001, y), P(x - 0.001, y)], n, color);
      for (let k = 0; k < 7; k++) petal(x, y, 2 * Math.PI * k / 7 + i, 0.041 + 0.015 * hash2(i, 8));
    }
    for (let i = 0; i < 16; i++) petal(0.36 + hash2(i, 18) * 0.60, 0.25 + hash2(i, 7) * 0.68, hash2(i, 24) * Math.PI, 0.035);
    return;
  }
  const frame = it.color2 ? tint(COL_HEX(it.color2)) : T("posterFrame");
  const paper = it.color ? tint(COL_HEX(it.color)) : T("posterIn");
  prismPoly(m, r, z0, z1, frame, { sideCol: frame });
  if (it.print || it.relief) {
    const inset = 0.015, left = leftEnd(F), u = rightOf(F);
    const at = x => [left[0]+x*u[0]+0.003*F.nf[0], left[1]+x*u[1]+0.003*F.nf[1]];
    const a = at(inset), b = at(F.L-inset), normal = [...F.nf,0];
    const panel = [[a,z0+inset],[b,z0+inset],[b,z1-inset],[a,z1-inset]];
    if (ctx.finishes && Object.hasOwn(SHOP_PRINTS, it.print)) {
      shopFace(ctx, SHOP_PRINTS[it.print], panel, normal);
    } else if (MARKET_ART.has(it.relief)) {
      addMarketArt(m, it.relief, panel, normal, tint);
    } else if (ctx.finishes) {
      if (!ctx.finishes.has(it.print)) ctx.finishes.set(it.print, []);
      ctx.finishes.get(it.print).push({face:panel, normal, highlight:ctx.highlight || [0,0,0,0]});
    } else face(m, panel, normal, paper);
    return;
  }
  frontQuad(m, F, 0.04, F.L - 0.04, z0 + 0.04, z1 - 0.04, 0.003, paper);
  const n = Math.max(1, Math.round(F.L / 0.75));
  const w = (F.L - 0.08) / n;
  // color3（西5号館の製図室の大きな掲示板の図面。2026-11-15）：紙の上の四角を、その色の濃さ違いの落ち着いた色だけで
  const pal = it.color3 ? [it.color3, "#cfd2d4", "#e4e2dc", it.color3, "#b8bcc0", "#f5f3ee"] : ["#d24b5a", "#3e7cc4", "#f0c33c", "#5aa36a", "#8a5bb5", "#e98a3a", "#2b2f36", "#f5f3ee"];
  const seed = Math.round((F.a[0] + F.a[1]) * 10);
  const h = z1 - z0 - 0.08;
  for (let i = 0; i < n; i++) {
    const x0 = 0.04 + i * w + 0.03, x1 = 0.04 + (i + 1) * w - 0.03;
    const c1 = tint(COL_HEX(pal[Math.floor(hash2(seed, i) * pal.length)])), c2 = tint(COL_HEX(pal[Math.floor(hash2(seed + 7, i) * pal.length)]));
    frontQuad(m, F, x0, x1, z0 + 0.06 + h * 0.45, z0 + 0.04 + h * 0.95, 0.005, c1);
    frontQuad(m, F, x0, x0 + (x1 - x0) * 0.7, z0 + 0.06 + h * 0.18, z0 + 0.06 + h * 0.36, 0.005, c2);
  }
}

// ── 南4号館のセブン-イレブンの物（2026-11-17、ユーザー「セブンイレブンの内装作って」・動画 IMG_1393）──
// どれも 4 点の四角の 1 本目の辺が前（frontOf）。x は前の辺にそって（F.a から）、y は前から奥へ（0〜D）
// cooler 飲み物の冷蔵ケース（ガラスの扉 n 枚、なければ 0.76m ごと）：黒い枠・中の白い壁と棚・棚ごとの色とりどりのボトル（下の 2 段は大きい
//   ボトル）・扉の框と取っ手・扉のあいだの縦の灯・上の白い帯（color があればその色）・半透明のガラス
// chiller 多段のオープンケース（おにぎり・弁当）：白い箱（両わきの板・台・上のひさし）・ひさしの下の灯・奥の板・上の段ほど奥の棚と値札の帯・
//   商品・足もとの暗い吸い込みの格子。low なら腰の高さの平台（台の上の商品・前と上のガラス）
// freezer 平型の冷凍ケース（アイス）：白い箱・上の商品の色と暗いガラスのふた・白い縁・前の足もとの格子
// register レジ（カウンターの上）：白い台・前（客の側）の画面・奥の店員の画面
// coffee コーヒーマシン：color の箱（なしは黒）・上の光る画面・注ぎ口のくぼみ・金の帯・受け皿
// atm ATM：白い箱・前へ傾けた操作の面と画面・上の画面・紙幣の口・下の灰色の板・上の赤い帯
// crates 番重・折りたたみコンテナの山：color の箱（なしは青）を n 段（なければ 0.27m ごと）。箱ごとに上のふちの濃い帯と前の取っ手の穴
// hotcase ホットケース（レジの上）：角の銀の枠・上と下の板・中の暖かい色の奥の板・まん中の棚・2 段の揚げ物・半透明のガラス
const DRINK_PAL = ["#3f8f4f", "#e6eef3", "#c7302b", "#6b4428", "#f0a531", "#2f6db5", "#f4f4f0", "#9cc84b", "#e2d39a", "#24303a", "#d95f7f", "#f6d64a", "#8fc3e6"];
const FOOD_PAL = ["#f3efe4", "#e9dcc0", "#d9b98a", "#b8875a", "#f1e3c6", "#efe7d6", "#e8d7b0", "#ffffff", "#d8452f", "#7aa04a", "#f2c037", "#c9a06a", "#f6f1e6", "#9a6b3f"];

// 西5号館・IMG_1486。客側からトレーの滑り桟、料理、ガラスの順に並ぶ。
function addServery(m, it, L, D, z0, z1, T, { P, box, fq, glass }) {
  const steel = T("steel"), edge = T("steelEdge"), white = T("whiteItem");
  const body = T(it.color || "#d0c2a9");
  const height = z1 - z0;
  const work = z0 + 0.61 * height;
  if (L < 0.8 || D < 0.45 || height < 0.5) {
    box(0, L, 0, D, z0, z1, body);
    return;
  }
  const ledge = D * 0.22;
  box(0.06, L - 0.06, ledge + 0.045, D - 0.045, z0, z0 + 0.07, edge);
  box(0.035, L - 0.035, ledge, D - 0.025, z0 + 0.07, work - 0.045, body);
  const bays = Math.min(16, Math.max(1, Math.round(L / 0.66)));
  for (let j = 1; j < bays; j++) {
    const x = L * j / bays;
    fq(x - 0.005, x + 0.005, ledge - 0.003, z0 + 0.09, work - 0.065, edge);
  }
  box(0, L, 0, D, work - 0.045, work, steel);
  for (const y of [0.15, 0.47, 0.79]) box(0.025, L - 0.025, ledge * y, ledge * y + 0.012, work, work + 0.011, edge);

  const stations = Math.max(1, Math.min(12, Math.floor((L - 0.5) / 0.54)));
  const pitch = (L - 0.48) / stations;
  const food = ["#90a64b", "#d7924e", "#8a5538", "#e6c275", "#68904d", "#bf7660"].map(T);
  const salad = it.service === "salad", buffet = it.service === "buffet";
  box(0.20, L - 0.20, D * 0.34, D * 0.91, work, work + 0.012, salad ? edge : T("darkItem"));
  // 一皿ずつ白い縁と中身を分ける。ビュッフェでは二列の小鉢、サラダバーでは角形のホテルパン。
  const plate = (x, y, radius, base, filling) => {
    const ring = (r) => Array.from({ length: 12 }, (_, k) => {
      const a = k * Math.PI / 6;
      return P(x + r * Math.cos(a), y + r * Math.sin(a));
    });
    prismPoly(m, ring(radius * 0.78), base, base + 0.022, white);
    prismPoly(m, ring(radius), base + 0.022, base + 0.042, white, { bottom: true });
    m.polygon([ring(radius * 0.67)], base + 0.044, [0, 0, 1], filling);
  };
  for (let j = 0; j < stations; j++) {
    const x = 0.24 + (j + 0.5) * pitch;
    const za = work + 0.014;
    if (salad) {
      box(x - pitch * 0.45, x + pitch * 0.45, D * 0.36, D * 0.89, za, za + 0.022, steel);
      box(x - pitch * 0.40, x + pitch * 0.40, D * 0.40, D * 0.85, za + 0.023, za + 0.028, food[j % food.length]);
      bar(m, [P(x + pitch * 0.22, D * 0.59), za + 0.042], [P(x + pitch * 0.30, D * 0.37), za + 0.075], 0.012, edge);
    } else if (buffet) {
      const radius = Math.min(0.136, pitch * 0.42, D * 0.13);
      plate(x, D * 0.50, radius, za, food[(j + 2) % food.length]);
      plate(x, D * 0.77, radius, za, food[(j + 3) % food.length]);
    } else {
      box(x - pitch * 0.43, x + pitch * 0.43, D * 0.46, D * 0.85, za, za + 0.035, steel);
    }
  }
  const supports = Math.max(1, Math.min(12, Math.ceil(L / 2.2)));
  for (let i = 0; i <= supports; i++) {
    const x = 0.08 + (L - 0.16) * i / supports;
    box(x - 0.016, x + 0.016, D * 0.70, D * 0.70 + 0.03, work, z1, edge);
  }
  glass(0.06, L - 0.06, D * 0.36, work + height * 0.18, z1 - 0.035);
  box(0.025, L - 0.025, D * 0.32, D * 0.85, z1 - 0.035, z1, steel);
  box(0.05, L - 0.05, D * 0.34, D * 0.38, z1 - 0.044, z1 - 0.035, T("lightStrip"));
}

function addStoreItem(m, it, r, z0, z1, T, tint, glassy, ctx) {
  const F = frontOf(r);
  const L = F.L, D = depthOf(F, r), H = z1 - z0;
  if (L < 0.1 || D < 0.05 || !(H > 0.02)) return;
  const P = (x, y) => [F.a[0] + F.u[0] * x - F.nf[0] * y, F.a[1] + F.u[1] * x - F.nf[1] * y];
  const box = (x0, x1, y0, y1, za, zb, c, opt = {}) => {
    if (!(x1 > x0 + 1e-4 && y1 > y0 + 1e-4 && zb > za + 1e-4)) return;
    prismPoly(m, [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], za, zb, c, { bottom: true, ...opt });
  };
  const nf = [F.nf[0], F.nf[1], 0];
  const fq = (x0, x1, y, za, zb, c) => face(m, [[P(x0, y), za], [P(x1, y), za], [P(x1, y), zb], [P(x0, y), zb]], nf, c); // 奥行き y の前向きの四角
  const glass = (x0, x1, y, za, zb) => (glassy || m).quad([[P(x0, y), za], [P(x1, y), za], [P(x1, y), zb], [P(x0, y), zb]], nf, tint(GLASS));
  if (it.kind === "market") {
    addMarketFixture(m, it, F, D, z0, z1, T, { P, box, glass, ctx, ramp: (points,col) => {
      const p=points.map(([a,z])=>[a[0],a[1],z]), a=p[1].map((v,i)=>v-p[0][i]), b=p[3].map((v,i)=>v-p[0][i]);
      const n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]], length=Math.hypot(...n)||1;
      face(m,points,n.map(v=>v/length),col);
    }, glassFace: (points,n) => (glassy || m).quad(points,n,tint(GLASS)), bar: (a,b,w,c) => bar(m,a,b,w,c),
      prism: (ring,lo,hi,col) => prismPoly(m, ring, lo, hi, col) });
    return;
  }
  const display = (tile, x0, x1, y0, y1, lo, hi) => {
    const first = -nf[1]*F.u[0]+nf[0]*F.u[1] > 0 ? x0 : x1, last = first === x0 ? x1 : x0;
    shopFace(ctx, tile, [[P(first,y0),lo],[P(last,y0),lo],[P(last,y1),hi],[P(first,y1),hi]], nf);
  };
  if (it.kind === "servery") {
    addServery(m, it, L, D, z0, z1, T, { P, box, fq, glass });
    return;
  }
  // 商品 1 つ：前の面と上の面だけ（棚の上の箱。三角形を減らす）
  const good = (x0, x1, y0, y1, za, zb, c) => {
    fq(x0, x1, y0, za, zb, c);
    face(m, [[P(x0, y0), zb], [P(x1, y0), zb], [P(x1, y1), zb], [P(x0, y1), zb]], [0, 0, 1], c);
  };
  const col = it.color ? tint(COL_HEX(it.color)) : null;
  const seed = Math.round((F.a[0] * 7 + F.a[1] * 13) * 10);
  const pick = (pal, i, j) => tint(COL_HEX(pal[Math.floor(hash2(seed + i, j) * pal.length) % pal.length]));
  const darker = (c, k) => [c[0] * k, c[1] * k, c[2] * k, c[3]];
  if (it.kind === "cooler") {
    const frame = T("coolFrame");
    const n = Math.max(1, Math.round(it.n || L / 0.76));
    const w = L / n;
    const zb = z0 + 0.14, zt = z1 - 0.3; // 扉の下・上の端
    const yIn = it.stock ? Math.min(.29, D*.42) : Math.min(.12, D*.3);
    box(0, L, yIn, D, z0, z1, frame); // 箱
    box(0, L, 0, yIn, z0, zb, T("coolBase")); // 足もと
    box(-0.01, L + 0.01, -0.03, yIn, zt, z1, col || T("coolHead")); // 上の帯
    box(0, 0.03, 0, yIn, zb, zt, frame); // 両わきの板
    box(L - 0.03, L, 0, yIn, zb, zt, frame);
    const rows = 5;
    for (let k = 0; k < n; k++) {
      const x0 = k * w + 0.04, x1 = (k + 1) * w - 0.04;
      fq(x0, x1, yIn - 0.003, zb, zt, T("coolIn"));
      for (let j = 0; j < rows; j++) {
        const zs = zb + 0.06 + ((zt - zb - 0.1) * j) / rows;
        const zn = zb + 0.06 + ((zt - zb - 0.1) * (j + 1)) / rows;
        fq(x0, x1, yIn - 0.012, zs - 0.014, zs, T("coolShelf")); // 棚の前のふち
        if (it.stock) {
          const span = x1 - x0, start = F.u[0] * -nf[1] + F.u[1] * nf[0] > 0;
          const shelf = (x, depth) => P(start ? x0+x : x1-x, yIn*.22+depth);
          box(x0, x1, yIn*.20, yIn, zs-.014, zs, T("coolShelf"));
          shopRow(m, ctx, T, shelf, it.stock, .01, span-.01, zs, zn-zs, j, Math.abs(seed+k*3));
          continue;
        }
        const bw = j < 2 ? 0.085 : 0.066, bh = Math.max(0.05, Math.min(zn - zs - 0.035, j < 2 ? 0.27 : 0.17));
        let x = x0 + 0.012, q = 0;
        while (x + bw <= x1 - 0.004) {
          fq(x, x + bw - 0.009, yIn - 0.016, zs + 0.004, zs + bh * (0.82 + 0.18 * hash2(seed + k * 31 + j, q)), pick(DRINK_PAL, k * 7 + j, Math.floor(q / 3)));
          x += bw;
          q++;
        }
      }
    }
    // 扉の框（扉のあいだは縦の灯つき）・上下の框・取っ手・ガラス
    for (let k = 0; k <= n; k++) {
      const x = k * w;
      fq(Math.max(0, x - 0.035), Math.min(L, x + 0.035), -0.004, zb, zt, frame);
      if (k > 0 && k < n) fq(x - 0.009, x + 0.009, -0.007, zb + 0.06, zt - 0.06, T("coolLed"));
    }
    fq(0, L, -0.004, zb, zb + 0.05, frame);
    fq(0, L, -0.004, zt - 0.05, zt, frame);
    for (let k = 0; k < n; k++) {
      const xh = k * w + (k % 2 ? 0.075 : w - 0.075); // 取っ手は扉の端（となりと向かい合う）
      box(xh - 0.012, xh + 0.012, -0.05, -0.006, z0 + 0.75, z0 + 1.35, T("atmGrey"));
      glass(k * w + 0.035, (k + 1) * w - 0.035, -0.01, zb + 0.05, zt - 0.05);
    }
    return;
  }
  if (it.kind === "chiller") {
    const body = col || T("chillBody");
    const side = 0.05;
    const displayBase = z0 + Math.min(0.62, H * 0.72);
    const glazedEnds = it.low && it.stock === "desserts";
    const sideTop = glazedEnds ? displayBase : z1;
    box(0, side, 0, D, z0, sideTop, body);
    box(L - side, L, 0, D, z0, sideTop, body);
    if (it.low) {
      // 平台（デザートのケース）：台・台の上の商品・奥の低い板・前と上のガラス
      const zc = displayBase;
      box(side, L - side, 0.02, D, z0, zc, body);
      fq(side + 0.03, L - side - 0.03, 0.018, z0 + 0.05, z0 + 0.15, T("chillGrille"));
      const nx = Math.max(1, Math.floor((L - 2 * side - 0.04) / 0.16)), ny = Math.max(1, Math.floor((D - 0.12) / 0.16));
      const gx = (L - 2 * side - 0.04) / nx, gy = (D - 0.12) / ny;
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < ny; j++) {
          const x0 = side + 0.02 + i * gx, y0 = 0.06 + j * gy;
          const x1 = x0+gx-.025, y1 = y0+gy-.025, top = zc+.05+.04*hash2(seed+i,j);
          good(x0, x1, y0, y1, zc, top, pick(FOOD_PAL, i, j));
          if (it.stock === "desserts") shopFace(ctx, [31,30,4,5][(i+2*j)%4],
            [[P(x0,y0),top+.002],[P(x1,y0),top+.002],[P(x1,y1),top+.002],[P(x0,y1),top+.002]], [0,0,1]);
        }
      }
      box(side, L - side, D - 0.04, D, zc, z1, T("chillBack"));
      if (glazedEnds) {
        for (const [x, direction] of [[.018,-1],[L-.018,1]]) {
          const normal = [F.u[0]*direction,F.u[1]*direction,0];
          (glassy || m).quad([[P(x,0),zc],[P(x,D),zc],[P(x,D),z1],[P(x,0),z1-.1]],normal,tint(GLASS));
          bar(m,[P(x,0),z1-.1],[P(x,D),z1],.025,T("steelEdge"));
          bar(m,[P(x,0),zc],[P(x,0),z1-.1],.018,T("steelEdge"));
        }
      }
      const lip = z1 - (glazedEnds ? .10 : .02), top = glazedEnds ? lip + .055 : lip;
      glass(side, L-side, 0, zc, lip);
      (glassy || m).quad([[P(side,0),lip],[P(L-side,0),lip],[P(L-side,D*.55),top],[P(side,D*.55),top]], [0,0,1], tint(GLASS));
      if (glazedEnds) bar(m,[P(.018,0),lip],[P(L-.018,0),lip],.023,T("steelEdge"));
      return;
    }
    const zBase = z0 + Math.min(0.42, H * 0.25);
    const zCan = z1 - Math.min(0.24, H * 0.14);
    box(side, L - side, 0.02, D, z0, zBase, body); // 台
    fq(side + 0.03, L - side - 0.03, 0.018, z0 + 0.05, z0 + 0.15, T("chillGrille")); // 足もとの吸い込みの格子
    box(side, L - side, D - 0.06, D, zBase, zCan, T("chillBack")); // 奥の板
    box(side, L - side, 0, D, zCan, z1, body); // 上のひさし
    face(m, [[P(side, 0.04), zCan - 0.004], [P(L - side, 0.04), zCan - 0.004], [P(L - side, 0.16), zCan - 0.004], [P(side, 0.16), zCan - 0.004]], [0, 0, -1], T("coolLed")); // ひさしの下の灯
    if (col) fq(side, L - side, -0.003, zCan + 0.04, z1 - 0.04, T("coolHead")); // 色のひさしの前の白い帯
    const ns = 5; // 台の上を入れた段の数
    const zAt = (k) => zBase + ((zCan - 0.14 - zBase) * k) / ns;
    for (let k = 0; k < ns; k++) {
      const zs = zAt(k), zn = zAt(k + 1);
      const yf = 0.05 + k * Math.min(0.075, Math.max(0, D - 0.35) / ns); // 上の段ほど奥
      if (k > 0) box(side, L - side, yf, D - 0.06, zs - 0.018, zs, T("chillBack"));
      fq(side, L - side, yf - 0.004, zs - 0.045, zs, T("coolHead")); // 値札の帯
      if (it.stock) {
        const start = F.u[0] * -nf[1] + F.u[1] * nf[0] > 0;
        const shelf = (x, depth) => P(start ? x : L-x, yf+depth);
        shopRow(m, ctx, T, shelf, it.stock, side+.02, L-side-.02, zs, zn-zs, k, Math.abs(seed));
        continue;
      }
      const gh = Math.max(0.04, Math.min(zn - zs - 0.05, 0.15));
      let x = side + 0.02, q = 0;
      for (;;) {
        const gw = 0.08 + 0.06 * hash2(seed + k, q);
        if (x + gw > L - side - 0.02) break;
        good(x, x + gw - 0.014, yf + 0.02, yf + 0.22, zs, zs + gh * (0.6 + 0.4 * hash2(seed + q, k + 5)), pick(FOOD_PAL, k * 11 + q, 0));
        x += gw;
        q++;
      }
    }
    return;
  }
  if (it.kind === "freezer") {
    const body = col || T("chillBody");
    const filled = it.stock === "iceCream";
    const tray = filled ? Math.max(z0 + .03, z1 - .15) : z1 - .03;
    box(0, L, 0, D, z0, tray, body);
    if (filled) {
      box(0, L, 0, .05, tray, z1 - .03, body);
      box(0, L, D - .05, D, tray, z1 - .03, body);
      box(0, .05, .05, D - .05, tray, z1 - .03, body);
      box(L - .05, L, .05, D - .05, tray, z1 - .03, body);
    }
    fq(0.06, L - 0.06, -0.003, z0 + 0.04, z0 + 0.12, T("chillGrille"));
    const nx = Math.max(1, Math.floor((L - 0.16) / 0.14)), ny = Math.max(1, Math.floor((D - 0.16) / 0.14));
    const gx = (L - 0.16) / nx, gy = (D - 0.16) / ny;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const x0 = 0.08 + i * gx, y0 = 0.08 + j * gy;
        const x1 = x0 + gx - .015, y1 = y0 + gy - .015;
        const z = filled ? tray + .037 + .019 * hash2(seed + i, j) : z1 - .028;
        const lid = [[P(x0,y0),z],[P(x1,y0),z],[P(x1,y1),z],[P(x0,y1),z]];
        if (filled) {
          box(x0, x1, y0, y1, tray, z - .001, T("#dfdbca"));
          shopFace(ctx, 58 + (Math.floor(i/2) + j) % 4, lid, [0,0,1]);
        } else {
          face(m, lid, [0,0,1], pick(FOOD_PAL.concat(DRINK_PAL), i, j));
        }
      }
    }
    // 白い縁（ふたの枠）と、暗いガラスのふた（半透明）
    box(0, L, 0, 0.06, z1 - 0.03, z1, body);
    box(0, L, D - 0.06, D, z1 - 0.03, z1, body);
    box(0, 0.06, 0.06, D - 0.06, z1 - 0.03, z1, body);
    box(L - 0.06, L, 0.06, D - 0.06, z1 - 0.03, z1, body);
    box(L / 2 - 0.015, L / 2 + 0.015, 0.06, D - 0.06, z1 - 0.03, z1, body);
    (glassy || m).quad([[P(0.06, 0.06), z1 - 0.008], [P(L - 0.06, 0.06), z1 - 0.008], [P(L - 0.06, D - 0.06), z1 - 0.008], [P(0.06, D - 0.06), z1 - 0.008]], [0, 0, 1], tint(hex(PAL.freezerGlass, 0.5)));
    return;
  }
  if (it.kind === "register") {
    const body = T("regBody");
    box(0.02, L - 0.02, 0.06, D - 0.02, z0, z0 + 0.09, body); // 台（引き出し）
    const zs0 = z0 + 0.1, zs1 = Math.min(z1, z0 + 0.42);
    face(m, [[P(0.06, 0.2), zs0], [P(L - 0.06, 0.2), zs0], [P(L - 0.06, 0.26), zs1], [P(0.06, 0.26), zs1]], nf, body); // 客の側の画面の板（少し後ろへ傾く）
    face(m, [[P(0.09, 0.193), zs0 + 0.035], [P(L - 0.09, 0.193), zs0 + 0.035], [P(L - 0.09, 0.253), zs1 - 0.03], [P(0.09, 0.253), zs1 - 0.03]], nf, T("regScreen"));
    if (it.style === "storePOS") display(48,.09,L-.09,.189,.249,zs0+.035,zs1-.03);
    box(0.1, L - 0.1, D - 0.2, D - 0.15, z0 + 0.09, Math.min(z1, z0 + 0.46), body); // 店員の画面の箱
    face(m, [[P(L - 0.13, D - 0.145), z0 + 0.15], [P(0.13, D - 0.145), z0 + 0.15], [P(0.13, D - 0.145), z0 + 0.43], [P(L - 0.13, D - 0.145), z0 + 0.43]], [-F.nf[0], -F.nf[1], 0], T("regScreen"));
    return;
  }
  if (it.kind === "coffee") {
    const body = col || T("coffeeBody");
    box(0, L, 0, D, z0, z1, body);
    fq(L * 0.12, L * 0.88, -0.003, z0 + H * 0.66, z0 + H * 0.9, T("coffeeScreen"));
    if (it.style === "sevenCafe") {
      display(49,L*.12,L*.88,-.006,-.006,z0+H*.66,z0+H*.91);
      box(L*.44,L*.56,-.034,.008,z0+H*.42,z0+H*.52,T("steelEdge"));
    }
    fq(L * 0.2, L * 0.8, -0.003, z0 + H * 0.12, z0 + H * 0.52, darker(body, 0.55)); // 注ぎ口のくぼみ
    fq(0, L, -0.004, z0 + H * 0.57, z0 + H * 0.6, T("coffeeGold"));
    box(L * 0.18, L * 0.82, -0.08, 0.02, z0 + 0.03, z0 + 0.06, T("atmGrey")); // 受け皿
    return;
  }
  if (it.kind === "atm") {
    const body = T("atmBody");
    const zTop = z1 - Math.min(0.28, H * 0.18);
    const za = z0 + H * 0.5, zb2 = z0 + H * 0.66;
    box(0, L, 0.14, D, z0, zTop, body);
    box(0, L, 0, 0.14, z0, za, body); // 前へ出た下の箱
    const tn = [F.nf[0] * 0.6, F.nf[1] * 0.6, 0.8];
    face(m, [[P(0, 0), za], [P(L, 0), za], [P(L, 0.14), zb2], [P(0, 0.14), zb2]], tn, body); // 前へ傾けた操作の面
    face(m, [[P(L * 0.14, 0.01), za + 0.02], [P(L * 0.86, 0.01), za + 0.02], [P(L * 0.86, 0.12), zb2 - 0.02], [P(L * 0.14, 0.12), zb2 - 0.02]], tn, T("atmScreen"));
    fq(L * 0.14, L * 0.86, 0.137, zb2 + 0.06, Math.min(zTop - 0.06, zb2 + 0.3), T("atmScreen")); // 上の画面
    if (it.style === "sevenBank") display(50,L*.14,L*.86,.13,.13,zb2+.06,Math.min(zTop-.06,zb2+.3));
    fq(L * 0.22, L * 0.78, -0.003, z0 + H * 0.4, z0 + H * 0.43, T("darkItem")); // 紙幣の口
    fq(0.03, L - 0.03, -0.003, z0 + 0.05, z0 + H * 0.3, T("atmGrey"));
    box(-0.01, L + 0.01, 0.12, D + 0.01, zTop, z1, T("atmRed")); // 上の赤い帯
    return;
  }
  if (it.kind === "crates") {
    const c = col || T("crateBlue");
    const n = Math.max(1, Math.round(it.n || H / 0.27));
    const h = H / n;
    if (it.style === "baskets") {
      const edge = T("#ae591e");
      box(.025,L-.025,.025,D-.025,z0,z1-.16,c);
      for (let k=0;k<n;k++) {
        const z=z0+(k+1)*h, t=.026;
        box(0,L,0,t,z-.022,z,c); box(0,L,D-t,D,z-.022,z,c);
        box(0,t,t,D-t,z-.022,z,c); box(L-t,L,t,D-t,z-.022,z,c);
      }
      for (let k=0;k<7;k++) {
        const x=.02+k*(L-.055)/6;
        box(x,x+.014,0,.014,z1-.16,z1,edge);
        box(x,x+.014,D-.014,D,z1-.16,z1,edge);
      }
      return;
    }
    if (it.style === "cartons") {
      for (let k=0;k<n;k++) {
        const zs=z0+k*h, top=zs+h-.009, pad=(k%2)*.012;
        box(pad,L-.012,.008,D-.008,zs,top,c);
        box(L*.44,L*.54,.007,D-.007,top,top+.002,T("#aa8d57"));
        fq(L*.44,L*.54,.004,top-.063,top,T("#b49a66"));
        fq(L*.10,L*.39,.005,zs+h*.33,zs+h*.62,T("#e8dfb9"));
        for (let j=0;j<6;j++) fq(L*(.14+j*.033),L*(.15+j*.033),.002,zs+h*.38,zs+h*.55,T("#594e3d"));
      }
      return;
    }
    for (let k = 0; k < n; k++) {
      const za = z0 + k * h, zb = za + h - 0.006;
      box(0.012, L - 0.012, 0.012, D - 0.012, za, zb, c);
      box(0, L, 0, D, zb - 0.045, zb - 0.015, darker(c, 0.78)); // 上のふちの帯
      if (h > 0.15) fq(L * 0.35, L * 0.65, -0.003, zb - h * 0.45, zb - h * 0.3, darker(c, 0.45)); // 取っ手の穴
    }
    return;
  }
  if (it.kind === "hotcase") {
    const steel = T("atmGrey");
    box(0, L, 0, D, z0, z0 + 0.04, steel);
    box(0, L, 0, D, z1 - 0.035, z1, steel);
    for (const [x, y] of [[0.015, 0.015], [L - 0.015, 0.015], [0.015, D - 0.015], [L - 0.015, D - 0.015]]) bar(m, [P(x, y), z0], [P(x, y), z1], 0.025, steel);
    fq(0.02, L - 0.02, D - 0.03, z0 + 0.04, z1 - 0.035, T("hotIn"));
    const zm = z0 + 0.04 + (H - 0.075) / 2;
    box(0.02, L - 0.02, 0.04, D - 0.04, zm - 0.008, zm, steel);
    for (const zz of [z0 + 0.04, zm]) {
      let x = 0.05, q = 0;
      while (x + 0.08 <= L - 0.04) {
        good(x, x + 0.07, 0.08, Math.min(D - 0.1, 0.16), zz, zz + 0.045, q % 3 ? T("hotFood") : T("hotFood2"));
        if (D > 0.34) good(x + 0.01, x + 0.08, 0.2, Math.min(D - 0.05, 0.28), zz, zz + 0.05, q % 2 ? T("hotFood2") : T("hotFood"));
        x += 0.1;
        q++;
      }
    }
    glass(0, L, -0.003, z0 + 0.04, z1 - 0.035);
    for (const x of [0, L]) {
      const sg = x ? 1 : -1;
      (glassy || m).quad([[P(x, 0), z0 + 0.04], [P(x, D), z0 + 0.04], [P(x, D), z1 - 0.035], [P(x, 0), z1 - 0.035]], [F.u[0] * sg, F.u[1] * sg, 0], tint(GLASS));
    }
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
  else if (it.kind === "stack") addStack(m, it, r, z0, z1, T, tint, ctx);
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
// 店の商品の色（書架の goods。本館の地下の生協の棚：菓子・カップ麺・飲み物・文具。2026-11-16、動画 IMG_1381 の 6 分 29〜33 秒）
const GOODS = ["#d8452f", "#f2c037", "#3d8fd6", "#f4f4f2", "#4caf50", "#e07b2a", "#b5312e", "#f6e27a", "#2d5fa8", "#e9e4d6", "#8a5a33", "#e86a8f", "#5bb5c8", "#c9a227"];
const STACK_BOOKS = ["#f1ede2", "#e7e0cf", "#d9cfb8", "#ece9e2", "#c9c2b0", "#e3ddd0", "#b7aa8c", "#d4cbb6", "#f4f2ec", "#cfc8bb", "#3d4b63", "#7b3a3a", "#4b5e46", "#2b2d33", "#8a7d5c", "#5e6f86"];
function addStack(m, it, r, z0, z1, T, tint, ctx) {
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
  const steel = T(it.stock ? "#e1e0d9" : "stackSteel");
  const shelfC = T(it.stock ? "#eceae3" : "stackShelf"), back = T(it.stock ? "#d1d0c8" : "stackBack");
  const pt = 0.02, zb0 = z0 + 0.09, zt = z1 - 0.025;
  const wallShelf = it.style === "wallShelf";
  const spine = it.bookSide === 1 ? .022 : it.bookSide === 0 ? D-.022 : wallShelf ? D-.045 : D/2;
  if (it.stock) {
    // 売場のゴンドラは棚の端が開いており、中央の支柱まで商品が見える。
    for (const x of [0, L - .034]) {
      box(x, x + .034, spine - .035, spine + .035, zb0, z1, steel);
      box(x, x + .034, .012, D - .012, z0 + .055, zb0, steel);
    }
    box(0, L, spine - .042, spine + .042, zt, z1, steel);
  } else {
    box(0, pt, 0, D, z0, z1, steel);
    box(L - pt, L, 0, D, z0, z1, steel);
    box(0, L, 0, D, zt, z1, steel);
  }
  const library = !it.goods && (it.style === "books" || it.style === "journals");
  box(pt, L - pt, 0.03, D - 0.03, z0, zb0, library ? T("#555551") : back); // 足もと
  box(pt, L - pt, spine - 0.01, spine + 0.01, zb0, zt, back);
  const rows = Math.max(1, Math.round(it.rows || (zt - zb0) / 0.32));
  const rh = (zt - zb0) / rows;
  const bk = it.books == null ? 0.75 : it.books;
  const seed = Math.round((a[0] * 13 + a[1] * 7) * 10);
  const bays = Math.max(1, Math.round(L / 0.9));
  if (library) {
    for (let i = 1; i < bays; i++) {
      const x = L * i / bays;
      box(x - 0.012, x + 0.012, 0.018, D - 0.018, zb0, zt, steel);
    }
  }
  if (library && bk > 0) {
    ctx.bookRacks?.push({ a, u, v, z:z0, length:L, depth:D, height:H, rows, bays, fill:bk, seed,
      bookSide:it.bookSide, journals:it.style === "journals", cut:Number.isFinite(ctx.cutTop), highlight:ctx.highlight || [0,0,0,0] });
  }
  for (let k = 0; k < rows; k++) {
    const zs = zb0 + k * rh;
    if (k > 0) box(pt, L - pt, 0.01, D - 0.01, zs - 0.012, zs + 0.006, shelfC);
    // 本：両面（y = 0 の面は −v 向き、y = D の面は +v 向き）
    for (let side = 0; side < (wallShelf ? 1 : 2); side++) {
      const y = side ? D - 0.035 : 0.035;
      const nrm = side ? [v[0], v[1], 0] : [-v[0], -v[1], 0];
      if (it.stock) {
        const forward = u[0] * -nrm[1] + u[1] * nrm[0] > 0;
        const shelf = (x, depth) => P(forward ? x : L-x, y + (side ? -depth : depth));
        shopRow(m, ctx, T, shelf, it.stock, pt+.012, L-pt-.012, zs+.007, rh-.015, k, Math.abs(seed)+side*7);
        continue;
      }
      if (library) continue;
      let x = pt + 0.01;
      let j = 0;
      while (x < L - pt - 0.05) {
        const h1 = hash2(seed + k * 17 + side * 5, j);
        // 店の商品（goods）は細めの箱で、色は GOODS（菓子・飲み物・文具の明るい色）
        const w = it.goods ? 0.07 + h1 * 0.17 : 0.1 + h1 * 0.38;
        const x1 = Math.min(L - pt - 0.01, x + w);
        if (hash2(seed + j * 3 + side, k * 11) < bk) {
          const bh = Math.min(rh - 0.04, (it.goods ? 0.1 : 0.17) + hash2(seed + j, k + side * 31) * 0.12);
          const hc = hash2(seed + j * 7 + side * 13, k);
          // goods "food"（2026-11-17、セブン-イレブンのパン・カップ麺の棚）：食べ物の明るいベージュ・茶の色（FOOD_PAL）
          const gp = it.goods === "food" ? FOOD_PAL : GOODS;
          const c = tint(COL_HEX(it.goods ? gp[Math.floor(hc * gp.length) % gp.length] : hc < 0.78 ? STACK_BOOKS[Math.floor((hc / 0.78) * 10)] : STACK_BOOKS[10 + Math.floor(((hc - 0.78) / 0.22) * 6) % 6]));
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
  // 斜めにつないだ書架は端の升だけ留め継ぎにする。正面から見た仕切りの間隔と、途中の升の直角は保つ。
  const backOffset = (back, front) => [back[0] - front[0] + F.nf[0] * D, back[1] - front[1] + F.nf[1] * D];
  const left = backOffset(r[r.length - 1], r[0]), right = backOffset(r[2], r[1]);
  const beveled = it.kind === "openshelf" && r.length === 4 && (len(left) > 0.025 || len(right) > 0.025);
  const cell = L / cols;
  const P = (x, y) => {
    const p = [F.a[0] + F.u[0] * x - F.nf[0] * y, F.a[1] + F.u[1] * x - F.nf[1] * y];
    if (!beveled) return p;
    const wl = (y / D) * Math.max(0, 1 - x / cell), wr = (y / D) * Math.max(0, 1 - (L - x) / cell);
    return [p[0] + wl * left[0] + wr * right[0], p[1] + wl * left[1] + wr * right[1]];
  };
  const box = (x0, x1, y0, y1, za, zb, c, opt = {}) => {
    if (!(x1 > x0 + 1e-4 && y1 > y0 + 1e-4 && zb > za + 1e-4)) return;
    prismPoly(m, [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], za, zb, c, { bottom: true, ...opt });
  };
  const xi = (i) => (L * i) / cols;
  const seed = Math.round((F.a[0] * 7 + F.a[1] * 3) * 10);
  if (it.style === "printer") {
    const timber = T("#c7a36c"), shelf = T("#dabe8e"), white = T("#dfdfd9"), dark = T("#515254");
    for (const x of [0, L - 0.062]) for (const y of [0, D - 0.057]) {
      box(x, x + 0.062, y, y + 0.057, z0 + 0.04, z1, timber);
      box(x + 0.012, x + 0.048, y + 0.012, y + 0.05, z0, z0 + 0.045, dark);
    }
    for (const z of [z0 + 0.07, z0 + H * 0.44, z1 - 0.035]) {
      for (const y of [0.01, D - 0.042]) box(0, L, y, y + 0.032, z, z + 0.032, timber);
      for (let i = 0; i < 5; i++) {
        const y = D * i / 5;
        box(0.04, L - 0.04, y + 0.006, y + D / 5 - 0.006, z, z + 0.024, shelf);
      }
    }
    const base = z0 + H * 0.44 + 0.025, x = L * 0.41;
    box(x, x + 0.43, -0.02, D - 0.04, base, base + 0.19, white);
    box(x + 0.025, x + 0.385, -0.025, 0.012, base + 0.045, base + 0.10, dark);
    box(x + 0.045, x + 0.38, 0.025, D - 0.06, base + 0.19, base + 0.225, dark);
    box(x + 0.11, x + 0.35, D * 0.65, D - 0.06, base + 0.22, base + 0.30, dark);
    box(L * 0.10, L * 0.37, 0.08, D - 0.04, z0 + 0.096, z0 + 0.30, T("#ba9e78"));
    return;
  }
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
    const depth = !dbl && i > 0 && i < cols ? D - 0.012 : D;
    box(x, x + pt, 0, depth, z0, zTop, white); // 両端と仕切りの板
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
  if (it.brochures) {
    const ink = ["#596386", "#ae8052", "#638b86", "#997781", "#8a80a0"].map(c => tint(COL_HEX(c)));
    const paper = tint(COL_HEX("#ece8da"));
    const booklet = (x, y, z, i) => {
      const w = Math.min(0.21, L / cols * 0.65), d = Math.min(0.28, D * 0.8);
      const top = z + 0.014 + 0.024 * hash2(seed, i);
      box(x - w / 2, x + w / 2, y, y + d, z, top, paper, { top: false });
      const panel = (a, b, left, right, color) => {
        const x0 = x + (left - 0.5) * w, x1 = x + (right - 0.5) * w;
        const y0 = y + a * d, y1 = y + b * d;
        m.quad([[P(x0, y0), top], [P(x1, y0), top], [P(x1, y1), top], [P(x0, y1), top]], [0, 0, 1], color);
      };
      const cover = ink[i % ink.length], accent = ink[(i + 2) % ink.length];
      panel(0, 0.18, 0, 1, cover);
      panel(0.18, 0.28, 0, 1, paper);
      panel(0.28, 0.74, 0, 0.64, i % 2 ? accent : cover);
      panel(0.28, 0.74, 0.64, 1, i % 2 ? paper : accent);
      panel(0.74, 1, 0, 1, paper);
    };
    for (let i = 0; i < cols; i++) {
      const x = xi(i + 0.5);
      for (let k = nd; k < rows; k++) {
        const base = zBot + rh * k + 0.009;
        if (!dbl && hash2(seed + k + 9, i) < 0.56) {
          const count = Math.min(6, Math.floor((L / cols - 0.05) / 0.04));
          for (let j = 0; j < count; j++) {
            const spine = xi(i) + 0.035 + j * 0.04;
            const height = Math.min(rh - 0.03, 0.17 + hash2(seed + j, i + k) * 0.10);
            box(spine, spine + 0.034, 0.055, Math.min(D - 0.02, 0.26), base, base + height, ink[(i + j + k) % ink.length]);
          }
        } else if (hash2(seed + k, i) < 0.7) booklet(x, 0.025, base, i + k * cols);
      }
      // Leave the first end of the long unit free for the globes. On deep islands the upper case sits in the middle.
      if (cols < 5 || i > 1) {
        const spaced = !dbl && L / cols > 0.51;
        booklet(x - (spaced ? 0.12 : 0), 0.028, z1, i + cols * rows);
        if (spaced) booklet(x + 0.12, 0.09, z1, i + cols * rows + 3);
      }
    }
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
  // 2 階のエレベーター表示。積層材の枠の中に 3 人、枠の上に上下の矢印。
  lift: [
    [[0, 0], [1, 0], [1, 0.77], [0, 0.77]],
    [[0.055, 0.045], [0.945, 0.045], [0.945, 0.715], [0.055, 0.715]],
    ...[0.24, 0.50, 0.76].map(x => [
      [x - 0.088, 0.045], [x - 0.018, 0.045], [x - 0.018, 0.245], [x + 0.018, 0.245],
      [x + 0.018, 0.045], [x + 0.088, 0.045], [x + 0.088, 0.565], [x + 0.038, 0.565],
      [x + 0.038, 0.615], [x - 0.038, 0.615], [x - 0.038, 0.565], [x - 0.088, 0.565],
    ]),
    [[0.18, 0.875], [0.265, 0.875], [0.265, 0.978], [0.33, 0.978], [0.33, 0.875], [0.415, 0.875], [0.30, 0.77]],
    [[0.61, 0.875], [0.72, 1], [0.835, 0.875], [0.76, 0.875], [0.76, 0.77], [0.688, 0.77], [0.688, 0.875]],
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
  // 世界地図（2026-11-18、Taki Plaza 地下 1 階のグローバルラウンジの壁の木の地図。動画 IMG_1462 の 3:27〜3:33）：大陸の大まかな形
  world: [
    [[0.03, 0.7], [0.1, 0.86], [0.24, 0.9], [0.33, 0.8], [0.3, 0.66], [0.24, 0.6], [0.22, 0.5], [0.17, 0.52], [0.12, 0.62]], // 北アメリカ
    [[0.3, 0.9], [0.4, 0.97], [0.44, 0.88], [0.36, 0.82]], // グリーンランド
    [[0.2, 0.5], [0.24, 0.47], [0.3, 0.42], [0.34, 0.3], [0.29, 0.12], [0.26, 0.02], [0.23, 0.14], [0.21, 0.32]], // 南アメリカ
    [[0.44, 0.62], [0.5, 0.66], [0.58, 0.6], [0.62, 0.48], [0.6, 0.36], [0.56, 0.16], [0.52, 0.1], [0.49, 0.3], [0.43, 0.46]], // アフリカ
    [[0.45, 0.68], [0.47, 0.8], [0.55, 0.9], [0.7, 0.94], [0.9, 0.9], [0.98, 0.8], [0.9, 0.66], [0.84, 0.52], [0.78, 0.5], [0.74, 0.4], [0.7, 0.5], [0.64, 0.56], [0.58, 0.66], [0.5, 0.7]], // ヨーロッパ・アジア
    [[0.8, 0.26], [0.9, 0.28], [0.94, 0.16], [0.86, 0.08], [0.79, 0.14]], // オーストラリア
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
  const tones = [T("signWood"), T("signWood2"), T("signWood3")];
  const n = Math.max(3, Math.round(F.L / 0.016));
  const slats = it.style === "slats";
  const bow = y => slats ? 0.024 * (2 * y / H - 1) ** 2 : 0;
  if (it.style === "fascia") {
    prismPoly(m,r,z0,z1,T("wall"));
  } else if (slats) {
    const point = (x, y, d) => [[F.a[0] + F.u[0] * x + F.nf[0] * d, F.a[1] + F.u[1] * x + F.nf[1] * d], z0 + y];
    for (let i = 0; i < n; i++) {
      const x0 = F.L * i / n, x1 = F.L * (i + 1) / n - 0.0012, col = tones[Math.floor(hash2(i, 7) * 3)];
      for (let j = 0; j < 4; j++) {
        const a = H * j / 4, b = H * (j + 1) / 4;
        face(m, [point(x0, a, bow(a)), point(x1, a, bow(a)), point(x1, b, bow(b)), point(x0, b, bow(b))], [...F.nf, 0], col);
      }
      for (const s of [-1, 1]) {
        const y = s > 0 ? H : 0;
        face(m, [point(x0,y,-0.007),point(x1,y,-0.007),point(x1,y,bow(y)),point(x0,y,bow(y))], [0,0,s], col);
      }
    }
  } else {
    prismPoly(m, r, z0, z1, T("signWood"), { bottom: true });
    for (let i = 0; i < n; i++) frontQuad(m, F, (F.L * i) / n, (F.L * (i + 1)) / n, z0 + 0.003, z1 - 0.003, 0.0012, tones[Math.floor(hash2(i, 7) * 3)]);
  }
  if (!txt || !it.text) return;
  const ux = rightOf(F), lf = leftEnd(F);
  const opt = { stroke: 0.15, d0: 0.0012, d1: 0.004 };
  // 字の高さは板の高さの 0.34。行が板の幅の 0.86 を超えるなら小さく（行の幅は字の高さに比例）
  const size = Math.min(H * 0.34, (F.L * 0.86) / Math.max(1e-6, txt.textWidth(it.text, 1, opt)));
  const w = txt.textWidth(it.text, size, opt);
  const plane = { P: (x, y, d) => [[lf[0] + ux[0] * x + F.nf[0] * (d + bow(y)), lf[1] + ux[1] * x + F.nf[1] * (d + bow(y))], z0 + y], N: [F.nf[0], F.nf[1], 0], U: [ux[0], ux[1], 0], V: [0, 0, 1] };
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
function addStationItem(m, it, r, zf, z0, z1, T, tint, ctx) {
  const { text } = ctx;
  const color = it.color ? tint(COL_HEX(it.color)) : null;
  const color2 = it.color2 ? tint(COL_HEX(it.color2)) : null;
  if (it.kind === "soffit") {
    // 段々の天井の箱：横は明るい灰、下の面に丸い照明（長い向きに 1.6m おき、幅が広ければ 2 列）
    prismPoly(m, r, z0, z1, T("soffit"), { sideCol: T("soffit"), top: false });
    m.polygon([r], z0, [0, 0, -1], shade(T("soffitUnder"), [0, 0, -1]));
    if (r.length === 4 && it.style !== "plain") {
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
    if (it.style === "swingWindow") {
      // パン棚の脇に見えるスイングドア。ゴムの縁の内側に縦長ののぞき窓がある。
      const oval = (rx, rz, depth, col) => {
        const point = (angle) => {
          const x = F.L * .66 + rx * Math.cos(angle);
          return [[F.a[0] + F.u[0] * x + F.nf[0] * depth, F.a[1] + F.u[1] * x + F.nf[1] * depth], z0 + (z1-z0)*.69 + rz * Math.sin(angle)];
        };
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI/2 + Math.PI*i/10, b = a + Math.PI/10;
          face(m, [point(a), point(b), point(Math.PI-b), point(Math.PI-a)], [...F.nf, 0], col);
        }
      };
      oval(.115, .245, .009, T("#424540"));
      oval(.094, .221, .012, T("#626a65"));
      frontQuad(m, F, .08, F.L-.08, z0+.07, z0+.44, .007, T("#a1a4a1"));
    } else if (it.style === "staff") {
      const metal = T("doorKnob"), u = rightOf(F), left = leftEnd(F);
      const P = (x, y, d) => [[left[0] + u[0] * x + F.nf[0] * d, left[1] + u[1] * x + F.nf[1] * d], z0 + y];
      const handle = F.L - 0.11;
      bar(m, P(handle, 0.99, 0.005), P(handle, 0.99, 0.043), 0.024, metal);
      bar(m, P(handle, 0.99, 0.043), P(handle - 0.105, 0.99, 0.043), 0.019, metal);
      if (text) {
        const size = 0.029, opt = { stroke: 0.10, d0: 0.005, d1: 0.006 };
        const plane = { P, N: [...F.nf, 0], U: [...u, 0], V: [0, 0, 1] };
        const start = (F.L - text.textWidth("STAFF ONLY", size, opt)) / 2;
        text.planeText(m, plane, "STAFF ONLY", start, 1.48, size, opt, T("#777871"), T("#777871"));
      }
    } else {
      frontQuad(m, F, F.L - 0.17, F.L - 0.1, z0 + 0.95, z0 + 1.12, 0.025, T("doorKnob"));
    }
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
    addPoster(m, r, z0, z1, T, it, tint, ctx);
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
  if (it.kind === "hatch" && it.style === "floorDiffuser" && r.length === 4) {
    // IMG_1077 の 177・533 秒。床と同じ高さの放射状の吹出口。外輪、羽根、中央の円盤。
    const c = centroid(r), radius = Math.min(len(sub(r[1],r[0])), len(sub(r[2],r[1]))) / 2;
    const steel = color || T("#96968e"), slot = T("#373a39"), up = [0,0,1];
    const z = z1 + 0.003, count = 28;
    const at = (i, k) => [c[0]+radius*k*Math.cos(i*2*Math.PI/count), c[1]+radius*k*Math.sin(i*2*Math.PI/count)];
    const quad = (a,b,c,d,col) => m.quad([a,b,c,d].map(p => [p,z]), up, col);
    for (let i = 0; i < count; i++) {
      quad(at(i,0.91), at(i,1), at(i+1,1), at(i+1,0.91), steel);
      quad(at(i,0.91), at(i+0.52,0.91), at(i+0.72,0.31), at(i+0.32,0.31), slot);
      quad(at(i+0.52,0.91), at(i+1,0.91), at(i+1.32,0.31), at(i+0.72,0.31), steel);
    }
    m.polygon([Array.from({length:count}, (_,i) => at(i+0.32,0.31))], z, up, steel);
    return true;
  }
  if (it.kind === "hatch" && r.length === 4) {
    const c = T("hatch");
    const ce = centroid(r);
    if (it.style === "grille") {
      const inset = r.map(p => lerp2(p, ce, 0.085));
      m.polygon([inset], z1 - 0.006, [0, 0, -1], T("#8e8d86"));
      for (let j = 1; j < 13; j++) {
        const a = j / 13, b = a + 0.016;
        const strip = [lerp2(inset[0], inset[1], a), lerp2(inset[0], inset[1], b), lerp2(inset[3], inset[2], b), lerp2(inset[3], inset[2], a)];
        m.polygon([strip], z1 - 0.009, [0, 0, -1], T("#d5d2c9"));
      }
    }
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
    const flush = it.style === "flush";
    const cx = F.L * (flush ? 0.73 : 0.5), cz = z1 - H * 0.12, R = Math.min(flush ? 0.055 : 0.07, H * 0.08);
    const P = (x, y) => [[F.a[0] + F.u[0] * x + F.nf[0] * 0.02, F.a[1] + F.u[1] * x + F.nf[1] * 0.02], y];
    for (let k = 0; k < 12; k++) {
      const a0 = (Math.PI * k) / 6, a1 = (Math.PI * (k + 1)) / 6;
      face(m, [P(cx, cz), P(cx + R * Math.cos(a0), cz + R * Math.sin(a0)), P(cx + R * Math.cos(a1), cz + R * Math.sin(a1)), P(cx, cz)], [F.nf[0], F.nf[1], 0], T("hydrantRed"));
    }
    if (flush) {
      for (const x of [0.006, F.L * 0.32, F.L - 0.006]) frontQuad(m, F, x - 0.003, x + 0.003, z0, z1, 0.004, T("#999992"));
      frontQuad(m, F, 0, F.L, z1 - 0.008, z1, 0.004, T("#999992"));
    } else {
      frontQuad(m, F, F.L * 0.25, F.L * 0.75, z1 - H * 0.32, z1 - H * 0.24, 0.004, T("hydrantRed"));
    }
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
