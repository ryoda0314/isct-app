// Building elevations and storey counts come from each building's university
// accessibility guide. Window dimensions and the unseen elevations are estimates.
const guide = "https://www.ssc.titech.ac.jp/amap/home/suzukakedai/";
const structures = {
  S1: ["s/s1bldg", "横長の連続窓と張り出した上層階の下に、奥まった玄関があります。"],
  S2: ["s/s2bldg", "縦に深く通る柱型と暗い窓の溝、白い妻壁が特徴です。"],
  S3: ["s/s3bldg", "白い壁の上部に二列の丸窓が並び、下階の大きな開口と対になっています。"],
  S4: ["s/s4bldg", "パネル目地が通る背の高い外壁に小窓を設け、斜面側に外階段を添えています。"],
  S5: ["s/s5bldg", "白い箱形の二階建て。細く切り欠かれた妻面と玄関の張り出しが目印です。"],
  S6: ["s/s6bldg", "背の高い搬入口と角形の煙突があるコンクリートの建物です。"],
  S7: ["s/s7bldg", "低い横長の二階建てで、連続した窓の上に細長い排気筒が伸びています。"],
  S8: ["s/s8bldg", "白い外壁の細長い窓、大きく切り欠いた開口、開放された一階の柱間が特徴です。"],
  R1: ["r/r1bldg", "研究室の窓の外に、各階を水平に走る銀色のルーバーがあります。"],
  "R1-A": ["r/r1annex-a", "三階建ての灰色の外壁を柱型で区切り、連窓を各階に並べています。"],
  "R1-B": ["r/r1annex-b", "細長い平屋の側面に、小さな庇の付いた扉が並びます。"],
  R2: ["r/r2bldg", "高低差のある壁と張り出した縦のコアの間に、帯状のバルコニーが重なります。"],
  "R2-A": ["r/r2annex-a", "二階建ての横長の窓と出入口を、白い外壁が囲んでいます。"],
  "R2-B": ["r/r2annex-b", "高い腰壁と横窓の下に配管が回り、地上の設備には目隠しがあります。"],
  "R2-C": ["r/r2annex-c", "無窓の妻壁と、腰高の目隠しが付いた側面の連窓が特徴です。"],
  "R2-D": ["r/r2annex-d", "二階建ての実験棟。大きな灰色の壁の外側に階段と踊り場があります。"],
  R3: ["r/r3bldg", "六階建ての高層棟には水平ルーバーと屋上のフレームがあり、平屋の低層棟と連結しています。"],
  "R3-LOW": ["r/r3bldg", "高層棟と接続する、陸屋根の低層実験棟です。"],
  "R3-A": ["r/r3annex-a", "平屋の高い外壁の下部に、作業用の横窓が開いています。"],
  "R3-B": ["r/r3annex-b", "平屋の設備棟。妻面は開口が少なく、出入口に小庇があります。"],
  "R3-C": ["r/r3annex-c", "二階の窓が側面に連なり、妻面には箱状に突き出す小さなバルコニーがあります。"],
  "R3-D": ["r/r3annex-d", "濃い灰色の三階建て。ガラスの玄関に、角を丸めた黒い庇が掛かります。"],
  B1: ["b/b1b2bldg", "九階建てのB1棟と十一階建てのB2棟は各階で連結し、外壁には丸い張り出しが並びます。"],
  B2: ["b/b1b2bldg", "B1棟より二階分高い研究棟。縦に重なる丸いバルコニーと端部の塔屋が目印です。"],
  "B1B2-A": ["b/b1b2annex-a", "五階建ての白い建物に縦ルーバーとガラスの玄関があり、前庭には格子状の庇があります。"],
  "B1B2-B": ["b/b1b2annex-b", "灰色タイルの細長い三階建てで、四角い単窓が等間隔に並びます。"],
  "B1B2-C": ["b/b1b2annex-c", "四階建ての付属棟。タイル張りの外壁に黒い玄関庇が取り付きます。"],
  H1: ["h/h1h2bldgs", "円形のガラスの食堂から上層が一段後退し、低い円錐形の屋根が重なります。"],
  H2: ["h/h1h2bldgs", "矩形の大学会館。三階の渡り廊下で、円形のH1棟とつながっています。"],
  J1: ["j/j1bldg", "端部の縦型コアの間に、研究室の水平連窓が九階まで重なります。"],
  "J2-J3": ["j/j2-j3bldg", "二つの二十階建て研究棟が各階でつながります。妻面には四層を単位とした鋼製のメガブレースが現れています。"],
  G1: ["g/g1bldg", "銀色のルーバーが階ごとに張り出し、上端では軽い鉄骨のフレームが空に抜けています。"],
  G2: ["g/g2bldg", "十一階建ての研究棟。外付けの水平ルーバーが、奥まった窓を覆っています。"],
  G3: ["g/g3bldg", "二列の連窓を中央の縦型コアが分け、両端の立ち上がりが屋根の輪郭を作ります。"],
  G4: ["g/g4bldg", "二階建ての白い建物で、コンクリートの太い梁と柱に囲まれた大窓が並びます。"],
  "G4-A": ["g/g4annex-a", "浅い切妻屋根と縦張りの明るい外壁、青い搬入口が特徴の付属棟です。"],
  G5: ["g/g5bldg", "淡いベージュの壁に、縦長の深い窓が格子状に並び、低い庇が玄関を覆います。"],
};
export const buildingNotes = Object.fromEntries(Object.entries(structures).map(([id,[url,detail]]) =>
  [id, {detail, source: guide + url + "/"}]));
buildingNotes["R3-low"] = buildingNotes["R3-LOW"];
buildingNotes["R2-E"] = {
  detail:"大学の構内図に掲載された付属棟です。位置、屋根の高さ、外壁の開口は周辺の地図からの推定です。",
  source:"https://www.isct.ac.jp/ja/001/about/campuses-and-offices/yokohama",
};
for (const letter of ["A","B","C"]) {
  buildingNotes["B1-B2-"+letter] = buildingNotes["B1B2-"+letter];
}
export const towerStructureSource = "https://www.jssi.or.jp/bussiness/shuppan_detail/kaishiback/49-menshinshokai-tokodaisuzukake.pdf";
