// キャンパスナビの3D表示に手で足す構造物（平地・坂道・階段・壁・橋・建物の通り抜け）と路面（道路・路面・白線・横断歩道）のデータと、形の計算。
// データ: public/map-3d/features.json（/editor/3d で編集する）。座標は [経度, 緯度]、長さ・高さは m。
//   { id, type, name, coords: [[lng, lat], ...], osm?（取り込んだ OSM の way） } に、種類ごとに
//   terrace : coords は囲む範囲（3点以上、閉じない）。elev（平らにする標高。null は中の元の地面の平均）, side（ふちの斜面の幅。0 は垂直に切って壁）,
//             faces（辺ごとの壁の面の見た目。辺 i は点 i → 点 i+1、最後は最後の点 → 最初の点。null はふつうの壁）：
//             { glass（低いほうの地面からこの高さまでガラス。m）, base（ガラスの下の端。同じく m、なければ 0）, frost（すりガラス）,
//             pitch（縦の桟の間隔 m）, rows（横の桟の高さ。低いほうの地面から m）, doors（扉：[[始まり, 終わり], ...]。辺の上の位置 0〜1）,
//             brick（ガラスの上＝ガラスがなければ面ぜんぶをれんが積みに）, deck（ウッドデッキの縁：上の DECK_FASCIA m は木の板、
//             その下は奥の暗いすき間と、DECK_POST m おきの灰色の束（つか）） }。段差の低いほうに向く面に描く（掘り下げなら中、盛りなら外）,
//             beams（くぼみの上を渡る梁。8本まで）：[{ coords（両端の2点）, width, depth（梁の下までの深さ）, top（上の高さ。平らにした
//             地面から m。なければ両端の外の地面） }],
//             wallTop（壁の上の面の色：なしは自動＝壁の外の高い側の路面の色、"wall" は壁の色、ほかは路面の種類 SURFACE_KIND_KEYS）,
//             ceiling（天井の高さ。平らにした地面から m）：まわりの地面の下に掘った部屋（地下の玄関の穴など）。外の地面が天井より高い辺は
//             床から天井までの壁（faces の面つき）、ほか（明かり取り・踊り場に面した辺）は開いた口。上はまわりの地面の続きのふた（terraceLid）
//   slope   : 坂道。width, z（各点の高さ。平地を入れた地面から ±m、null は自動）, side（両わきの斜面の幅。0 は垂直な壁）,
//             flat（区間ごとの踊り場＝平らにするか）, corner（曲がり角を幅のぶん平らにして踊り場にするか）,
//             base（土台の横幅＝両わきの壁・路肩を含む。なければ自動：壁なら 幅＋WALL_T×2、斜面なら幅）,
//             widths（各点の横幅。null は、両端なら width、途中は前後の決まった点のあいだを距離で直線に結ぶ＝だんだん広がる）,
//             shifts（各点の帯の中心のずれ。中心線から左へ m、右はマイナス。null は widths と同じ決まりで、両端は 0。
//             上底を横にずらした台形など、中心線に対して左右が同じでない形）,
//             walls（false なら両わき・両端に壁を立てない。平地の中に置いて、平地の壁を両わきの壁にするときなど）,
//             material（坂だけ：両わき・両端の壁の色＝STAIRS_MATERIALS。芝生を渡る木の歩道の縁など。なしはコンクリート）
//   stairs  : slope と同じ（width, z, side, flat, corner, base）に riser（一段の高さ）, rails（手すりの位置。段の幅に対する割合で、
//             0 が左の端・1 が右の端（点1から点2を見て）。0 未満・1 より大は土台の上）。坂の面にそって riser ごとに段を刻む。
//             steps（区間ごとの段数）があれば、段数は手で決めたもの。蹴上げはどの段も同じ（高さの差 ÷ 段数の合計）。
//             段数は蹴上げの数。踊り場につながる流れは両端が蹴上げで、踏面は 段数−1 枚（stairFlights）。material（段の材質：wood 木 / stone 石 / brick 灰色のれんが。なしはコンクリート）
//   wall    : height（高いほうの地面から）, thickness, kind（hedge 生け垣 / fence 縦の格子の柵 / rail ガードパイプ＝柱と横の管 2 本 /
//             glass ガラスの手すり＝ガラスの板と上の細い手すり / slant 斜めの格子＝ステンレスの丸棒の柵（正門）。断面は三角形：
//             足もとの幅は thickness、上は 1 本の手すり。両側の面の棒を上で合わせた「Λ」の並び（柵の向きに傾ける）。
//             upright（slant の鉛直な面："left" 左 / "right" 右＝点1から点2を見て。上の手すりはその側の足の真上で、断面は直角三角形。
//             なしは二等辺の A）。
//             leans（slant の棒の柵の向きの傾き：点ごとの度。点のあいだは距離で直線に。0 は柵に直角な面の中））,
//             xbrace クロスの柵＝柱と上下の横の棒、柱のあいだに X の筋交い（柱は bay m おき。なしは 1.8m） /
//             bench ベンチ＝木の座面（高さ height、奥行き thickness）と木の脚。点の並びに沿って（閉じれば木のまわりを囲むベンチ））,
//             curb（glass・slant の下の石の縁石の高さ m。幅 curbWidth。ガラス・棒はその上から height まで）,
//             rim（fence・rail・xbrace を、両わき RAIL_REACH m の高いほうの地面から立てる：掘り下げた平地のふちの壁の上・
//             盛った平地のふちの壁の上（壁の帯の上）に立つ柵。glass はいつも）
//   bridge  : width, z（各点の床の高さ。真下の地面から、null は自動）, thickness, railing, piers, surface（walk / street / rail / deck 木の床）
//   tree    : 木。coords は幹の 1 点。height, crown（枝の広がりの直径 m）, kind（broad 枝の広がる木 / round 丸い木 / ginkgo イチョウ /
//             conifer 針葉樹 / cherry サクラ＝低いところで太い枝に分かれ、横に広い平たい傘の形）
//   passage : width, height（天井の高さ）。建物の外から外へ引いた中心線に沿って、建物に穴をあける
//   building : 建物の形を変える（地図の建物を置きかえる・新しく足す）。coords は建物の形（囲む範囲）、height（屋上の高さ。地面から m）、
//             cuts（屋根を斜めに切る面。6つまで）：[{ slope: [[lng, lat], [lng, lat]], low }]。面ごとに点1で low m・点2で height m、
//             そのあいだは平らな斜面で、点1より手前は low、点2より先は height のまま（low が 0 なら点1の線で地面まで切れる）。
//             屋根はどの面よりも低いところ：向かい合う2面で横から見て台形、4面で寄棟。以前の slope・low（1面）も読む。
//             rotLow・rotHigh（度）：「低」の線・「高」の線をそれぞれ回す（0 は下がる向きに直角、左回りが＋）。平行でなければ、
//             あいだは2本の線を結ぶねじれた斜面（傾きは場所で変わる）
//             carves（くり抜き＝ベランダ・テラス。8つまで）：[{ coords（囲む範囲。建物と重なるところだけ）, bottom（床の高さ。地面から m）,
//             top（天井の高さ。null なら上まで抜く＝屋上テラス）, rail（床のふちの手すり壁 1.1m）,
//             floors・ceils（点ごとの床・天井の高さ。null の点は bottom・top。点のあいだは連続した斜めの面＝上辺と下辺が平行でなくてよい） }]
//             glass（地面からこの高さまでガラス張り）, glassSides（辺ごとにガラスにするか。辺 i は点 i → 点 i+1。なければ全部）,
//             glassPitch（縦の桟の間隔 m。辺ごとに等間隔。なければ 1.5）, glassFrame（"light" 細い明るい枠）, glassFrit（白い点の模様のガラス）,
//             glassRows（床の高さの横の桟。地面から m、地下の階はマイナス）,
//             roof（"green" 屋上の緑 / "deck" 木の床）, eave（軒の出 m）, eaveSides（辺ごとに軒を出すか。なければ全部）,
//             boards（屋根の板。800 枚まで）：[{ coords（板の形）, top（板の上の高さ。地面から m）, kind（"green" は植え込み）,
//             tops（傾いた板：点ごとの上面の高さ。上面はその点を通る平面） }]。
//             あれば屋根の高さは「その点にある板のいちばん高い上面」（板のないところは斜めの屋根から BOARD_BASE_DROP 下＝板のあいだの暗いすき間）。
//             板は厚さ BOARD_T の板として描き、建物の形の外へ出ていれば張り出し（下をくぐれる）。
//             groundRef（[lng, lat]。高さを測る地面の点。なければ形の点の平均の位置）：つながった建物（建物とスロープ・テラスなど）で
//             同じ点にすると、まわりの地面の高さがちがっても高さがそろう
//             windows（壁の窓・扉。200 まで）：[{ coords（壁ぞいの両端の2点。いちばん近い壁＝建物のふちか、くり抜きの奥の壁に描く）,
//             bottom・top（地面から m）, kind（glass ガラス / dark 奥の暗いガラス / grille 格子 / door 扉 / glassdoor ガラスの扉）,
//             panes（縦に分ける数）, rows（横の桟の高さ。地面から m）, louver（扉の上のがらり。m） }]
//             （top2 があれば窓の上の端は斜め：1 点目で top・2 点目で top2。frame "light" は明るい枠）
//             canopies（小さなひさし。20 まで）：[{ coords（壁ぞいの両端の2点）, z（上の高さ。地面から m）, depth（出）, thickness }]
//             vaults（上が平らで下が半円の筒＝屋根の高さに横たわるステンレスの胴。4 つまで）：[{ coords（筒の軸の折れ線。2〜6 点。
//             折れ目は留め継ぎ）, width（幅＝半円の直径 m）, top（上の平らな面の高さ。地面から m）, glass（両端の面の窓。端ごとに
//             { top・bottom（上の端・下の端。筒の上の面から下へ m。下の端が半円より深ければ丸みに沿う）, lens（true なら下の端は
//             上の端の両はしを通る弧＝レンズの形）, panes（縦に分ける数） } か null）, balcony（端の面の下に吊った
//             格子の床の台：{ end（0 か 1）, from・to（軸から左へ m。軸の向きに見て左が +）, depth（端の面から外へ m）, z（床の高さ。
//             地面から m） }） }]。建物の形の外へ出たところが張り出し（建物の中は壁と屋根に隠れる）
//             material（壁と屋根の材質：rust さびた鉄 / perforated 穴あきの金属板 / steel ステンレス / darkbrick こげ茶のれんが /
//             stone 白っぽい石 / green 壁面緑化＝植物で覆った壁（大岡山駅） / red 赤く塗った板（屋上の看板の塔など） /
//             concrete 打ち放しのコンクリート（灰色）。なしは地図の建物の色）,
//             joints（外の壁のパネルの目地：[横の間隔, 縦の間隔, 横の目地の基準の高さ]。縦の目地は辺ごとに等間隔、窓の奥に隠れる）
//             frame（true なら壁でなく鉄骨の外階段：角と辺の柱、levels（踊り場の高さ。地面から m）ごとの床と手すり、そのあいだの段の板）
//             roof "glass"（ガラスの屋根。縦の桟は斜面の向きに glassPitch m ごと） / "solar"（太陽光パネル。ふちに白い笠木）
//             base（宙に浮いた建物：外の壁の下の端の高さ。地面から m。下はピロティ）, keel（船底の傾き：base の下の面は、壁の下の端から
//             中へ keel の傾きで下がる面（keelSides の辺ごと。なければ全部）の組み＝いちばん高い面。0 か なしは平らな下の面）
//             soffitJoints（下の面のパネルの目地：[辺に沿った間隔, 辺から内への間隔] m。船底の面ごとにその辺に平行・直角。平らな下の面は 1 本目の辺）
//             fins（縦のルーバー。10 まで）：[{ coords（壁ぞいの両端の2点）, pitch（間隔 m）, depth（出 m）, width（厚さ m） }]。壁の下の端から上まで。
//             南を向く面は太陽光パネル（暗い色）
//             members（白い鋼の柱・梁＝V 字の柱など。20 まで）：[{ coords（点の並び）, zs（点ごとの高さ。地面から m）, size（太さ m） }]
//             panels（空中の平らな板：ひさし・穴あきの衝立・ガラスの箱の面・V 字の柱など。40 まで）：[{ coords（点の位置。40 点まで）,
//             zs（点ごとの高さ。地面から m）, kind（PANEL_KINDS：perforated 穴あきの金属板 / glass ガラス / steel ステンレス / dark 暗い鋼 /
//             wall 建物の色 / white 白い鋼 / red 赤い板＝店の日よけなど）, thickness（m） }]。点は同じ平面の上（凸でない形も可。点の順に囲む）。
//             立った板は、歩いて見るときにぶつかる（panelSlices）
//             domes（屋根の丸い天窓。20 まで）：[{ coords（中心の 1 点）, r（半径 m）, z（台の上の高さ。地面から m。なければ屋根の高さ） }]
//             letters（壁の文字＝ステンレスの切り文字。12 行まで）：[{ coords（壁の面の上の 2 点＝行の左端と右端。文字はこの 2 点を結ぶ線に
//             並び、幅に合わせて字のあいだが決まる。外向きはいちばん近い壁の向き）, z（文字の下の端。地面から m）, size（大文字の高さ m）, text（A〜Z・0〜9・& - . と空白）,
//             line（true なら文字の下の端に行の幅の横線）, color（"red" なら赤い文字＝店の看板の切り文字。なしはステンレス） }]
//             step（段の高さ m）：斜めに切った屋根を step m ごとの水平な段にする（段の境目は斜面の同じ高さの線＝線を回した面なら
//             扇のように開く段）。段の板は軒の出（eave）だけ、段の向きに壁の外へ張り出す（斜めに交わる壁ではのこぎりの歯のように）
//             地図の建物のうち、中心がこの形の中にあるものは描かず（replacedBuildings）、campus3dMesh.js が代わりに描く
//   road    : 道路。coords は中心線。width（車道の幅）, lanes（車線の数。偶数ならまん中が中央線）, center（中央線：dashed 白の破線 /
//             solid 白線 / yellow 黄線 / none）, edge（外側線＝車道のふちの内側の白線）, walk（[左, 右] の歩道の幅。0 はなし。点1から点2を見て）,
//             radius（[左, 右] の車道のふちが作る交差点の角の丸みの半径 m。null は既定の CORNER_R＝3m）。
//             交差点（車道を重ねて角を丸める・標示を切る）は campus3dPaint.js が自動で作る
//   surface : 路面の塗り。coords は囲む範囲。kind（road 車道 / walk 歩道 / plaza 広場 / tile 石畳 / deck 木の床 / red カラー舗装 / green 植え込み / zebra 導流帯 /
//             gravel 黒い砂利 / stones 白い砂利 / brick 灰色のれんが / darkbrick こげ茶のれんが / wood 古い木の床 /
//             lawn 芝生＝地図の公園と同じ色でいちばん下に描く（下の地図の通路の帯を隠し、その通路には街灯を立てない） /
//             slab 敷石（飛び石）＝いちばん上に描く）,
//             angle（導流帯の縞の向き、度）, boards（板の目地：[板の幅 m, 板の向き＝北から右回りの度]。目地は寄って見たときだけ描く）。
//             地面に貼って描く（campus3dPaint.js）
//   marking : 白線。coords は折れ線。kind（solid 白線 / dashed 白の破線 / stop 停止線 / yellow 黄線 / wide 太い白線 / tactile 点字ブロック（黄 30cm））
//   crosswalk : 横断歩道。coords は渡る向きの2点（歩道から歩道へ）、width（横断歩道の幅＝縞の長さ）
//   signal  : 信号機。coords は柱の足もとの 1 点。height（柱の高さ＝腕の高さ m）, arm（腕の長さ m。0 は腕なし）, bearing（腕の向き。北から右回りの度）,
//             face（車の信号の向き＝信号の面が向く方位。null は車の信号なし。腕の先に吊る）, peds（歩行者の信号の向き：方位の並び。柱に付ける）。
//             灯は歩行者だけが渡れるとき（車の信号は赤、歩行者の信号は青。campus3dMesh.js の addSignal）
//   sign    : 看板（立て看板・柵に付けた銘板）。coords は板の下の端のまん中の真下の地面の 1 点。bearing（面が向く方位）, width・height（板の幅・高さ m）,
//             thickness（板の厚さ m）, z（板の下の端の高さ。地面から m）, tilt（後ろへ倒す角度。度）, style（steel ステンレスの箱に暗い文字 /
//             white 白い板に薄い灰色の文字 / notice 白い板の上に緑の帯（帯の中の行は白、ほかは暗い文字） / dark 黒い板に白い文字（店の看板））,
//             legs（脚の数。0 は柵などに付けた板）,
//             lines（文字の行：[{ text（A〜Z・0〜9・& - . ' 空白と、漢字 東京科学大）, x・y（行の左下。板の左下の角から m）, size（字の高さ m） }]。8 行まで）,
//             rules（細い線：[[x0, y0, x1, y1]]。区切りの縦線など）, logo（校章＝Science Tokyo のシンボルマーク：[左下の x, y, 高さ]。幅は高さの 0.72 倍。なしは null）
// z が null の点は、両端なら地面の高さ、途中なら前後の決まった点のあいだを距離で直線に結ぶ。
// 地面は「元の地面 → 平地 → 坂道・階段」の順に重ねて作る（坂道・階段の高さは平地を入れたあとの地面から）
// DOM も MapLibre も使わない（3D表示・エディタ・テストから共通で使う）
import { CAMPUS_CENTER } from "./hooks/useLocationSharing.js";

export const FEATURES_URL = "/map-3d/features.json";
export const CANDIDATES_URL = "/map-3d/osm-candidates.json";
export const FEATURE_TYPES = ["terrace", "slope", "stairs", "wall", "bridge", "passage", "building", "road", "crosswalk", "marking", "surface", "tree", "signal", "sign"];
export const TYPE_LABEL = { terrace: "平地", slope: "坂道", stairs: "階段", wall: "壁", bridge: "橋", passage: "通り抜け", building: "建物", road: "道路", surface: "路面", marking: "白線", crosswalk: "横断歩道", tree: "木", signal: "信号機", sign: "看板" };
// 路面と白線の種類（色・幅は campus3dPaint.js）
export const SURFACE_KIND_KEYS = ["road", "walk", "plaza", "tile", "deck", "red", "green", "zebra", "gravel", "stones", "brick", "darkbrick", "wood", "lawn", "slab"];
export const MARKING_KIND_KEYS = ["solid", "dashed", "stop", "yellow", "wide", "tactile"];
// 壁の種類（なしは壁）：生け垣・縦の格子の柵・ガードパイプ
export const WALL_KIND_KEYS = ["hedge", "fence", "rail", "glass", "slant", "xbrace", "bench"];
export const CENTER_KIND_KEYS = ["dashed", "solid", "yellow", "none"];
// 木の形（campus3dMesh.js の addTree）：枝の広がる木（ケヤキなど）・丸い木（クスノキ・サクラなど）・イチョウ・針葉樹
export const TREE_KIND_KEYS = ["broad", "round", "ginkgo", "conifer", "cherry"];
// 階段の段の材質・坂の両わきの壁の材質（campus3dMesh.js の色）。なしはコンクリート
export const STAIRS_MATERIALS = ["wood", "stone", "brick"];
export const STAIRS_MATERIAL_LABEL = { "": "コンクリート", wood: "木", stone: "石", brick: "れんが" };
// 建物の窓・扉の種類（campus3dMesh.js の addWindows）：ガラス・奥の暗いガラス・格子・扉・ガラスの扉
export const WINDOW_KINDS = ["glass", "dark", "grille", "door", "glassdoor"];
// 建物の壁と屋根の材質（campus3dMesh.js の色）：さびた鉄・穴あきの金属板・ステンレス。なしは地図の建物の色
export const BUILDING_MATERIALS = ["rust", "perforated", "steel", "darkbrick", "stone", "green", "red", "concrete"];
// 空中の板（panels）の見た目：穴あきの金属板・ガラス・ステンレス・暗い鋼・建物の色
export const PANEL_KINDS = ["perforated", "glass", "steel", "dark", "wall", "white", "red"];
export const CURB_W = 0.32; // ガラスの手すり（wall の glass）の下の石の縁石の幅 m
// 縁石の幅：斜めの格子は足もとの幅より 0.15m 広く（少なくとも CURB_W）
export const curbWidth = (f) => (f.kind === "slant" ? Math.max(CURB_W, f.thickness + 0.15) : CURB_W);
export const RAIL_REACH = 1.5; // ガラスの手すり・rim の柵の足もとの高さを測る、線から両わきへの距離 m（railGround。盛った平地の壁の帯 WALL_T より広く）
export const DECK_FASCIA = 0.15; // ウッドデッキの縁（平地の面の deck）の木の板の高さ m
export const DECK_POST = 1.2; // ウッドデッキの縁の下の束の間隔 m
// 地面に貼る塗り（道路・路面・白線・横断歩道）
export const isPaint = (type) => type === "road" || type === "surface" || type === "marking" || type === "crosswalk";
export const SURFACE_LABEL = { walk: "歩道", street: "車道", rail: "線路", deck: "木の床" };
// 地面の形を変える（標高タイルに焼き込む）種類
export const burnsGround = (f) => f.type === "terrace" || f.type === "slope" || f.type === "stairs";
// 帯（中心線と幅）でなく、囲む範囲（多角形）の種類
export const isArea = (type) => type === "terrace" || type === "surface" || type === "building";
// 点1つで置く種類
export const isPoint = (type) => type === "tree" || type === "signal" || type === "sign";
// 形に要る点の数
export const minPoints = (type) => (isArea(type) ? 3 : isPoint(type) ? 1 : 2);

// 種類ごとの既定値（m）
export const DEFAULTS = {
  terrace: { elev: null, side: 0 },
  slope: { width: 4, side: 0, corner: false },
  stairs: { width: 2, side: 0, riser: 0.16, rails: [0, 1], corner: true },
  wall: { height: 1.2, thickness: 0.3 },
  bridge: { width: 4, thickness: 0.8, railing: true, piers: false, surface: "walk" },
  passage: { width: 4, height: 3 },
  building: { height: 10 },
  road: { width: 7, lanes: 2, center: "dashed", edge: true, walk: [2.5, 2.5] },
  surface: { kind: "plaza" },
  marking: { kind: "solid" },
  crosswalk: { width: 4 },
  tree: { height: 10, crown: 8, kind: "broad" },
  signal: { height: 5.5, arm: 3.5, bearing: 90, face: 180, peds: [] },
  sign: { bearing: 0, width: 2, height: 0.5, thickness: 0.15, z: 0.5, tilt: 0, style: "steel", legs: 2, lines: [], rules: [], logo: null },
};
export const SIGN_STYLES = ["steel", "white", "notice", "dark"];
// 看板の文字に使える字（campus3dMesh.js の GLYPHS にある字）
export const SIGN_CHARS = /[A-Z0-9&.'\- 東京科学大]/;
// 入力できる範囲（m）
export const RANGE = {
  height: [0.1, 40], thickness: [0.05, 5], width: [0.5, 60], side: [0, 30], riser: [0.08, 0.4], z: [-30, 60], elev: [-50, 200], base: [0.5, 80], shift: [-30, 30],
  crosswalk: [1, 12], angle: [0, 180], lanes: [1, 8], walk: [0, 15], bheight: [0.1, 250], theight: [1, 40], crown: [1, 30], eave: [0, 10], step: [0.1, 5],
};
const clampTo = (v, [lo, hi], dflt) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : dflt);

// ── 平面の座標（キャンパスの中心からの東・北 m）──
const DEG = Math.PI / 180;
const LNG0 = CAMPUS_CENTER.lng;
const LAT0 = CAMPUS_CENTER.lat;
const KX = 111320 * Math.cos(LAT0 * DEG);
const KY = 110950;
export const toXY = ([lng, lat]) => [(lng - LNG0) * KX, (lat - LAT0) * KY];
export const toLngLat = ([x, y]) => [LNG0 + x / KX, LAT0 + y / KY];

// ── データの読み込み・書き出し ──
const round7 = (v) => Math.round(v * 1e7) / 1e7;
const round2 = (v) => Math.round(v * 100) / 100;
export const newId = (type) => `${type[0]}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// 平地の辺の面の見た目（faces の1つ）を整える。ガラスもれんがもなければ null
function normalizeFace(fc) {
  if (!fc || typeof fc !== "object") return null;
  const ok = (v) => v != null && v !== "" && Number.isFinite(+v);
  const out = {};
  if (ok(fc.glass) && +fc.glass > 0) {
    out.glass = round2(clampTo(fc.glass, [0.3, 60], 3));
    if (ok(fc.base) && +fc.base > 0) out.base = round2(clampTo(fc.base, [0, out.glass - 0.3], 0));
    if (fc.frost) out.frost = true;
    if (ok(fc.pitch)) out.pitch = round2(clampTo(fc.pitch, [0.3, 10], 1.5));
    const rows = (Array.isArray(fc.rows) ? fc.rows : []).filter(ok).map((v) => round2(+v)).filter((v) => v > (out.base || 0) && v < out.glass).sort((a, b) => a - b);
    if (rows.length) out.rows = rows.slice(0, 8);
    const doors = (Array.isArray(fc.doors) ? fc.doors : []).filter((d) => Array.isArray(d) && d.length === 2 && d.every(ok))
      .map((d) => [Math.min(+d[0], +d[1]), Math.max(+d[0], +d[1])].map((v) => Math.round(clampTo(v, [0, 1], 0) * 1000) / 1000))
      .filter((d) => d[1] > d[0]);
    if (doors.length) out.doors = doors.slice(0, 8);
  }
  if (fc.brick) out.brick = true;
  if (fc.deck) out.deck = true;
  return Object.keys(out).length ? out : null;
}

// 平地の辺ごとの面（faces）を、点を足す・消すのに合わせる（扉の位置は辺の上の割合なので、分けた・つないだ辺の上の位置に直す）。
// 足す：辺 i をまん中で2つに（どちらも元の面）。消す：点 v の前後の辺を1つに（前の辺に面があればその面、なければ後ろの辺の面。
// 扉は両方から）。lens は消す前の辺の長さ
const withDoors = (fc, doors) => {
  const { doors: _, ...rest } = fc;
  return doors.length ? { ...rest, doors } : rest;
};
export function facesInsert(faces, i) {
  if (!faces) return faces;
  const fc = faces[i];
  const half = (lo) => (!fc ? fc : withDoors(fc, (fc.doors || []).map(([a, b]) => [Math.max(a, lo), Math.min(b, lo + 0.5)]).filter(([a, b]) => b - a > 1e-3).map(([a, b]) => [(a - lo) * 2, (b - lo) * 2])));
  return [...faces.slice(0, i), half(0), half(0.5), ...faces.slice(i + 1)];
}
export function facesDelete(faces, v, lens) {
  if (!faces) return faces;
  const n = faces.length;
  const a = (v - 1 + n) % n;
  const [A, B] = [faces[a], faces[v]];
  const L = lens[a] + lens[v] || 1;
  const doors = [...(A?.doors || []).map((d) => d.map((t) => (t * lens[a]) / L)), ...(B?.doors || []).map((d) => d.map((t) => (lens[a] + t * lens[v]) / L))];
  const merged = A || B ? withDoors(A || B, doors) : null;
  return v === 0 ? [...faces.slice(1, n - 1), merged] : [...faces.slice(0, v - 1), merged, ...faces.slice(v + 1)];
}

// 1つの構造物を整える（足りない値は既定値、範囲外は範囲内に）。使えないものは null
export function normalizeFeature(f) {
  if (!f || !FEATURE_TYPES.includes(f.type) || !Array.isArray(f.coords)) return null;
  const coords = f.coords
    .filter((c) => Array.isArray(c) && Number.isFinite(+c[0]) && Number.isFinite(+c[1]))
    .map((c) => [round7(+c[0]), round7(+c[1])]);
  // 範囲は閉じずに持つ（最後の点が最初と同じなら外す）
  if (isArea(f.type) && coords.length > 1 && coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1]) coords.pop();
  if (coords.length < minPoints(f.type)) return null;
  const d = DEFAULTS[f.type];
  const out = { id: typeof f.id === "string" && f.id ? f.id : newId(f.type), type: f.type, name: typeof f.name === "string" ? f.name.slice(0, 80) : "", coords };
  if (f.osm) out.osm = String(f.osm);
  if (f.type === "terrace") {
    out.elev = f.elev != null && Number.isFinite(+f.elev) ? round2(clampTo(f.elev, RANGE.elev, 0)) : null;
    out.side = round2(clampTo(f.side, RANGE.side, d.side));
    // 辺ごとの面の見た目（ガラス・れんが）。どの辺もふつうの壁ならなし
    const faces = Array.isArray(f.faces) ? coords.map((_, i) => normalizeFace(f.faces[i])) : [];
    if (faces.some(Boolean)) out.faces = faces;
    const beams = (Array.isArray(f.beams) ? f.beams : []).map((b) => {
      const bc = Array.isArray(b?.coords) ? b.coords.filter((q) => Array.isArray(q) && Number.isFinite(+q[0]) && Number.isFinite(+q[1])).map((q) => [round7(+q[0]), round7(+q[1])]) : [];
      if (bc.length !== 2 || (bc[0][0] === bc[1][0] && bc[0][1] === bc[1][1])) return null;
      const ob = { coords: bc, width: round2(clampTo(b.width, [0.1, 5], 0.5)), depth: round2(clampTo(b.depth, [0.1, 10], 1)) };
      if (b.top != null && b.top !== "" && Number.isFinite(+b.top)) ob.top = round2(clampTo(b.top, [0, 60], 0));
      return ob;
    }).filter(Boolean).slice(0, 8);
    if (beams.length) out.beams = beams;
    if (f.ceiling != null && f.ceiling !== "" && Number.isFinite(+f.ceiling) && +f.ceiling > 0) out.ceiling = round2(clampTo(f.ceiling, [1, 30], 3));
    // 壁の上の面の色：なしは自動（壁の外の高い側の路面の色。路面がなければ壁の色）、"wall" は壁の色、ほかは路面の種類の色
    if (f.wallTop === "wall" || SURFACE_KIND_KEYS.includes(f.wallTop)) out.wallTop = f.wallTop;
  } else if (f.type === "wall") {
    out.height = round2(clampTo(f.height, RANGE.height, d.height));
    out.thickness = round2(clampTo(f.thickness, RANGE.thickness, d.thickness));
    if (WALL_KIND_KEYS.includes(f.kind)) out.kind = f.kind; // 生け垣（緑で、上がでこぼこ）・柵（縦の格子。向こうが透ける）・ガードパイプ
    // ガラスの手すり・斜めの格子の下の石の縁石（ガラス・棒が 0.2m は残る高さまで）
    if ((out.kind === "glass" || out.kind === "slant") && f.curb != null && f.curb !== "" && Number.isFinite(+f.curb) && +f.curb > 0) out.curb = round2(clampTo(f.curb, [0.05, Math.max(0.05, Math.min(1.5, out.height - 0.2))], 0.3));
    if ((out.kind === "fence" || out.kind === "rail" || out.kind === "xbrace") && f.rim) out.rim = true;
    if (out.kind === "xbrace" && Number.isFinite(+f.bay) && f.bay != null && f.bay !== "") out.bay = round2(clampTo(f.bay, [0.5, 6], 1.8));
    if (out.kind === "slant" && (f.upright === "left" || f.upright === "right")) out.upright = f.upright;
    // 斜めの格子の棒の傾き（点ごと。なければ 10 度）
    if (out.kind === "slant" && Array.isArray(f.leans) && f.leans.some((v) => v != null && v !== "" && Number.isFinite(+v))) {
      out.leans = coords.map((_, i) => (f.leans[i] != null && f.leans[i] !== "" && Number.isFinite(+f.leans[i]) ? round2(clampTo(f.leans[i], [0, 60], 10)) : 10));
    }
  } else if (f.type === "signal") {
    out.coords = coords.slice(0, 1);
    out.height = round2(clampTo(f.height, [2.5, 12], d.height));
    out.arm = round2(clampTo(f.arm, [0, 12], d.arm));
    const deg = (v) => Math.round((((+v % 360) + 360) % 360) * 10) / 10;
    out.bearing = Number.isFinite(+f.bearing) && f.bearing !== null && f.bearing !== "" ? deg(f.bearing) : d.bearing;
    out.face = f.face === null || f.face === "" ? null : Number.isFinite(+f.face) && f.face !== undefined ? deg(f.face) : d.face;
    out.peds = (Array.isArray(f.peds) ? f.peds : []).filter((v) => v !== null && v !== "" && Number.isFinite(+v)).map(deg).slice(0, 4);
  } else if (f.type === "sign") {
    out.coords = coords.slice(0, 1);
    const deg = (v) => Math.round((((+v % 360) + 360) % 360) * 10) / 10;
    out.bearing = Number.isFinite(+f.bearing) && f.bearing !== null && f.bearing !== "" ? deg(f.bearing) : d.bearing;
    out.width = round2(clampTo(f.width, [0.2, 12], d.width));
    out.height = round2(clampTo(f.height, [0.1, 5], d.height));
    out.thickness = round2(clampTo(f.thickness, [0.01, 1], d.thickness));
    out.z = round2(clampTo(f.z, [0, 10], d.z));
    out.tilt = round2(clampTo(f.tilt, [-30, 80], d.tilt));
    out.style = SIGN_STYLES.includes(f.style) ? f.style : d.style;
    out.legs = Math.round(clampTo(f.legs, [0, 4], d.legs));
    const W = out.width, H = out.height;
    out.lines = (Array.isArray(f.lines) ? f.lines : []).map((l) => {
      const text = typeof l?.text === "string" ? [...l.text.toUpperCase()].filter((ch) => SIGN_CHARS.test(ch)).join("").slice(0, 40) : "";
      if (!text.trim()) return null;
      return { text, x: round2(clampTo(l.x, [0, W], 0)), y: round2(clampTo(l.y, [0, H], 0)), size: round2(clampTo(l.size, [0.01, H], Math.min(0.2, H))) };
    }).filter(Boolean).slice(0, 8);
    out.rules = (Array.isArray(f.rules) ? f.rules : []).filter((r) => Array.isArray(r) && r.length === 4 && r.every((v) => Number.isFinite(+v)))
      .map((r) => [round2(clampTo(r[0], [0, W], 0)), round2(clampTo(r[1], [0, H], 0)), round2(clampTo(r[2], [0, W], 0)), round2(clampTo(r[3], [0, H], 0))]).slice(0, 8);
    const lg = f.logo;
    out.logo = Array.isArray(lg) && lg.length === 3 && lg.every((v) => Number.isFinite(+v)) && +lg[2] > 0 ? [round2(clampTo(lg[0], [0, W], 0)), round2(clampTo(lg[1], [0, H], 0)), round2(clampTo(lg[2], [0.02, H], 0.2))] : null;
  } else if (f.type === "tree") {
    out.coords = coords.slice(0, 1);
    out.height = round2(clampTo(f.height, RANGE.theight, d.height));
    out.crown = round2(clampTo(f.crown, RANGE.crown, d.crown)); // 枝の広がり（直径）
    out.kind = TREE_KIND_KEYS.includes(f.kind) ? f.kind : d.kind;
  } else if (f.type === "passage") {
    out.width = round2(clampTo(f.width, RANGE.width, d.width));
    out.height = round2(clampTo(f.height, RANGE.height, d.height));
  } else if (f.type === "building") {
    out.height = round2(clampTo(f.height, RANGE.bheight, d.height));
    if (Array.isArray(f.groundRef) && f.groundRef.length === 2 && f.groundRef.every((v) => v !== null && v !== "" && Number.isFinite(+v))) out.groundRef = [round7(+f.groundRef[0]), round7(+f.groundRef[1])];
    const cuts =(Array.isArray(f.cuts) ? f.cuts : f.slope ? [{ slope: f.slope, low: f.low }] : []).map((c) => {
      const sp = Array.isArray(c?.slope) ? c.slope.filter((q) => Array.isArray(q) && Number.isFinite(+q[0]) && Number.isFinite(+q[1])).map((q) => [round7(+q[0]), round7(+q[1])]) : [];
      if (sp.length !== 2 || (sp[0][0] === sp[1][0] && sp[0][1] === sp[1][1])) return null;
      const cut = { slope: sp, low: round2(clampTo(c.low, [0, out.height], 0)) };
      for (const k of ["rotLow", "rotHigh"]) {
        const v = Number.isFinite(+c[k]) ? Math.round(clampTo(c[k], [-75, 75], 0) * 10) / 10 : 0;
        if (v) cut[k] = v;
      }
      return cut;
    }).filter(Boolean).slice(0, 6);
    if (cuts.length) out.cuts = cuts;
    const carves = (Array.isArray(f.carves) ? f.carves : []).map((cv) => {
      const cs = Array.isArray(cv?.coords) ? cv.coords.filter((q) => Array.isArray(q) && Number.isFinite(+q[0]) && Number.isFinite(+q[1])).map((q) => [round7(+q[0]), round7(+q[1])]) : [];
      if (cs.length > 1 && cs[0][0] === cs[cs.length - 1][0] && cs[0][1] === cs[cs.length - 1][1]) cs.pop();
      if (cs.length < 3) return null;
      const bottom = round2(clampTo(cv.bottom, [0, RANGE.bheight[1]], 3));
      const top = cv.top == null || cv.top === "" || !Number.isFinite(+cv.top) ? null : round2(clampTo(cv.top, [bottom + 0.5, RANGE.bheight[1]], bottom + 3));
      const ok = (v) => v != null && v !== "" && Number.isFinite(+v);
      const perPoint = (arr) => (Array.isArray(arr) && arr.some(ok) ? cs.map((_, i) => (ok(arr[i]) ? round2(clampTo(arr[i], [0, RANGE.bheight[1]], 0)) : null)) : null);
      const out2 = { coords: cs, bottom, top, rail: cv.rail !== false };
      const floors = perPoint(cv.floors);
      const ceils = top == null ? null : perPoint(cv.ceils);
      if (floors) out2.floors = floors;
      if (ceils) out2.ceils = ceils;
      return out2;
    }).filter(Boolean).slice(0, 8);
    if (carves.length) out.carves = carves;
    // 見た目：地面からこの高さまでガラス張り（窓の桟つき）・屋上（緑 / 木の床）・軒（壁から外へ出る屋根の幅）
    if (Number.isFinite(+f.glass) && +f.glass > 0) out.glass = round2(clampTo(f.glass, [0.5, out.height], 3));
    // ガラスにする辺（辺 i は点 i → 点 i+1、最後は最後の点 → 最初の点）。ないか全部なら、どの辺もガラス
    if (out.glass && Array.isArray(f.glassSides) && coords.some((_, i) => f.glassSides[i] === false)) out.glassSides = coords.map((_, i) => f.glassSides[i] !== false);
    // ガラスの縦の桟の間隔（辺ごとに等間隔）・枠の色（light 細い明るい枠）・床の高さの横の桟（地面から m。地下の階はマイナス）
    if (out.glass && Number.isFinite(+f.glassPitch) && +f.glassPitch > 0) out.glassPitch = round2(clampTo(f.glassPitch, [0.5, 6], 1.5));
    if (out.glass && f.glassFrame === "light") out.glassFrame = "light";
    if (out.glass && f.glassFrit) out.glassFrit = true; // ガラスに白いセラミックの点の模様（明るく見える）
    const gRows = out.glass && Array.isArray(f.glassRows) ? f.glassRows.filter((v) => v != null && v !== "" && Number.isFinite(+v) && +v < out.glass).map((v) => round2(Math.max(-30, +v))) : [];
    if (gRows.length) out.glassRows = [...new Set(gRows)].sort((x, y) => x - y).slice(0, 6);
    if (f.roof === "green" || f.roof === "deck" || f.roof === "glass" || f.roof === "solar") out.roof = f.roof;
    if (Number.isFinite(+f.base) && +f.base > 0) {
      out.base = round2(clampTo(f.base, [0.5, out.height - 1], 3));
      if (Number.isFinite(+f.keel) && +f.keel > 0) out.keel = round2(clampTo(f.keel, [0.01, 3], 0.2));
      if (out.keel && Array.isArray(f.keelSides) && coords.some((_, i) => f.keelSides[i] === false)) out.keelSides = coords.map((_, i) => f.keelSides[i] !== false);
      if (Array.isArray(f.soffitJoints) && f.soffitJoints.length === 2 && f.soffitJoints.every((v) => v != null && v !== "" && Number.isFinite(+v) && +v > 0)) out.soffitJoints = f.soffitJoints.map((v) => round2(clampTo(v, [0.3, 20], 1.5)));
    }
    if (BUILDING_MATERIALS.includes(f.material)) out.material = f.material;
    // 外の壁のパネルの目地：[横の間隔, 縦の間隔, 横の目地の基準の高さ（地面から m。なしは 0）]
    if (Array.isArray(f.joints) && f.joints.length >= 2 && f.joints.slice(0, 3).every((v) => Number.isFinite(+v))) {
      out.joints = [round2(clampTo(f.joints[0], [0.3, 5], 1)), round2(clampTo(f.joints[1], [0.3, 5], 2))];
      if (f.joints.length > 2 && +f.joints[2]) out.joints.push(round2(clampTo(f.joints[2], [-5, out.height], 0)));
    }
    if (f.frame === true) {
      out.frame = true;
      const lv = (Array.isArray(f.levels) ? f.levels : []).filter((v) => v != null && v !== "" && Number.isFinite(+v) && +v > 0.3 && +v <= out.height).map((v) => round2(+v));
      if (lv.length) out.levels = [...new Set(lv)].sort((x, y) => x - y).slice(0, 12);
    }
    if (Number.isFinite(+f.eave) && +f.eave > 0) out.eave = round2(clampTo(f.eave, RANGE.eave, 0));
    // 軒を出す辺（glassSides と同じ。ないか全部なら、どの辺も）
    if (out.eave && Array.isArray(f.eaveSides) && coords.some((_, i) => f.eaveSides[i] === false)) out.eaveSides = coords.map((_, i) => f.eaveSides[i] !== false);
    // 段々の屋根（斜めに切った屋根を、この高さごとの水平な段に）
    if (Number.isFinite(+f.step) && +f.step > 0) out.step = round2(clampTo(f.step, RANGE.step, 0.4));
    // 屋根の板（1枚ずつの形と高さ。植え込みは kind "green"）
    const boards = (Array.isArray(f.boards) ? f.boards : []).map((b) => {
      const bc = Array.isArray(b?.coords) ? b.coords.filter((q) => Array.isArray(q) && Number.isFinite(+q[0]) && Number.isFinite(+q[1])).map((q) => [round7(+q[0]), round7(+q[1])]) : [];
      if (bc.length < 3 || !Number.isFinite(+b.top)) return null;
      const ob = { coords: bc.slice(0, 16), top: round2(clampTo(b.top, [0, out.height + 5], 0)) };
      if (b.kind === "green") ob.kind = "green";
      // 傾いた板（点ごとの上面の高さ。板の上面はその点を通る平面）
      if (Array.isArray(b.tops) && b.tops.length === bc.length && b.tops.every((v) => Number.isFinite(+v))) ob.tops = b.tops.slice(0, 16).map((v) => round2(clampTo(v, [0, out.height + 5], 0)));
      return ob;
    }).filter(Boolean).slice(0, 800);
    if (boards.length) out.boards = boards;
    const twoPts = (c) => {
      const cs = Array.isArray(c) ? c.filter((q) => Array.isArray(q) && Number.isFinite(+q[0]) && Number.isFinite(+q[1])).map((q) => [round7(+q[0]), round7(+q[1])]) : [];
      return cs.length === 2 && (cs[0][0] !== cs[1][0] || cs[0][1] !== cs[1][1]) ? cs : null;
    };
    const windows = (Array.isArray(f.windows) ? f.windows : []).map((w) => {
      const cs = twoPts(w?.coords);
      if (!cs || !Number.isFinite(+w.bottom) || !Number.isFinite(+w.top)) return null;
      const bottom = round2(clampTo(w.bottom, [-10, out.height + 5], 0));
      const top = round2(clampTo(w.top, [bottom + 0.1, out.height + 5], bottom + 1));
      const ow = { coords: cs, bottom, top, kind: WINDOW_KINDS.includes(w.kind) ? w.kind : "glass" };
      if (Number.isFinite(+w.panes) && +w.panes > 1) ow.panes = Math.round(clampTo(w.panes, [1, 40], 1));
      const rows = (Array.isArray(w.rows) ? w.rows : []).filter((v) => v != null && v !== "" && Number.isFinite(+v)).map((v) => round2(+v)).filter((v) => v > bottom && v < top).sort((x, y) => x - y);
      if (rows.length) ow.rows = rows.slice(0, 6);
      if (Number.isFinite(+w.louver) && +w.louver > 0) ow.louver = round2(clampTo(w.louver, [0.1, top - bottom], 0.4));
      if (w.top2 != null && w.top2 !== "" && Number.isFinite(+w.top2) && round2(+w.top2) !== top) ow.top2 = round2(clampTo(w.top2, [bottom + 0.1, out.height + 5], top));
      if (w.frame === "light") ow.frame = "light"; // 明るい枠（白いアルミ）
      return ow;
    }).filter(Boolean).slice(0, 200);
    if (windows.length) out.windows = windows;
    const vaults = (Array.isArray(f.vaults) ? f.vaults : []).map((v) => {
      const cs = Array.isArray(v?.coords) ? v.coords.filter((q) => Array.isArray(q) && Number.isFinite(+q[0]) && Number.isFinite(+q[1])).map((q) => [round7(+q[0]), round7(+q[1])]) : [];
      if (cs.length < 2 || !Number.isFinite(+v.width) || !Number.isFinite(+v.top)) return null;
      const ov = { coords: cs.slice(0, 6), width: round2(clampTo(v.width, [1, 30], 8)), top: round2(clampTo(v.top, [1, out.height + 10], out.height)) };
      const R = ov.width / 2;
      const glass = [0, 1].map((k) => {
        const g = Array.isArray(v.glass) ? v.glass[k] : null;
        if (!g || !Number.isFinite(+g.top) || !Number.isFinite(+g.bottom)) return null;
        const top = round2(clampTo(g.top, [0, R - 0.3], 0.8));
        const og = { top, bottom: round2(clampTo(g.bottom, [top + 0.2, R], R)) };
        if (g.lens) og.lens = true;
        if (Number.isFinite(+g.panes) && +g.panes > 1) og.panes = Math.round(clampTo(g.panes, [1, 20], 1));
        return og;
      });
      if (glass.some(Boolean)) ov.glass = glass;
      const bc = v.balcony;
      if (bc && [bc.from, bc.to, bc.depth, bc.z].every((x) => Number.isFinite(+x)) && +bc.to !== +bc.from) {
        const [lo, hi] = [+bc.from, +bc.to].sort((x, y) => x - y).map((x) => round2(clampTo(x, [-R, R], 0)));
        ov.balcony = { end: bc.end === 0 ? 0 : 1, from: lo, to: hi, depth: round2(clampTo(bc.depth, [0.3, 5], 1.5)), z: round2(clampTo(bc.z, [0, ov.top], ov.top - R)) };
      }
      return ov;
    }).filter(Boolean).slice(0, 4);
    if (vaults.length) out.vaults = vaults;
    const panels = (Array.isArray(f.panels) ? f.panels : []).map((p) => {
      const ok = Array.isArray(p?.coords) && Array.isArray(p.zs) && p.coords.length === p.zs.length && p.coords.length >= 3;
      if (!ok || !p.coords.every((q) => Array.isArray(q) && Number.isFinite(+q[0]) && Number.isFinite(+q[1])) || !p.zs.every((z) => Number.isFinite(+z))) return null;
      const op = { coords: p.coords.slice(0, 40).map((q) => [round7(+q[0]), round7(+q[1])]), zs: p.zs.slice(0, 40).map((z) => round2(clampTo(z, [-10, out.height + 10], 0))), kind: PANEL_KINDS.includes(p.kind) ? p.kind : "wall" };
      op.thickness = round2(clampTo(p.thickness, [0.01, 1], 0.05));
      return op;
    }).filter(Boolean).slice(0, 40);
    if (panels.length) out.panels = panels;
    const domes = (Array.isArray(f.domes) ? f.domes : []).map((d) => {
      const c = Array.isArray(d?.coords) && d.coords.length === 2 && d.coords.every((v) => Number.isFinite(+v)) ? [round7(+d.coords[0]), round7(+d.coords[1])] : null;
      if (!c || !Number.isFinite(+d.r)) return null;
      const od = { coords: c, r: round2(clampTo(d.r, [0.2, 5], 1)) };
      if (d.z != null && d.z !== "" && Number.isFinite(+d.z)) od.z = round2(clampTo(d.z, [0, out.height + 10], out.height));
      return od;
    }).filter(Boolean).slice(0, 20);
    if (domes.length) out.domes = domes;
    const letters = (Array.isArray(f.letters) ? f.letters : []).map((l) => {
      const cs = twoPts(l?.coords);
      const text = typeof l?.text === "string" ? l.text.toUpperCase().replace(/[^A-Z0-9&.\- ]/g, "").slice(0, 60) : "";
      if (!cs || !text.trim() || !Number.isFinite(+l.z) || !Number.isFinite(+l.size)) return null;
      const ol = { coords: cs, z: round2(clampTo(l.z, [-10, out.height + 5], 1)), size: round2(clampTo(l.size, [0.05, 5], 0.5)), text };
      if (l.line) ol.line = true;
      if (l.color === "red") ol.color = "red";
      return ol;
    }).filter(Boolean).slice(0, 12);
    if (letters.length) out.letters = letters;
    const fins = (Array.isArray(f.fins) ? f.fins : []).map((r) => {
      const cs = twoPts(r?.coords);
      if (!cs) return null;
      return { coords: cs, pitch: round2(clampTo(r.pitch, [0.2, 10], 1)), depth: round2(clampTo(r.depth, [0.05, 3], 0.5)), width: round2(clampTo(r.width, [0.02, 1], 0.1)) };
    }).filter(Boolean).slice(0, 10);
    if (fins.length) out.fins = fins;
    const members = (Array.isArray(f.members) ? f.members : []).map((r) => {
      const ok = Array.isArray(r?.coords) && Array.isArray(r.zs) && r.coords.length === r.zs.length && r.coords.length >= 2;
      if (!ok || !r.coords.every((q) => Array.isArray(q) && Number.isFinite(+q[0]) && Number.isFinite(+q[1])) || !r.zs.every((z) => Number.isFinite(+z))) return null;
      return { coords: r.coords.slice(0, 40).map((q) => [round7(+q[0]), round7(+q[1])]), zs: r.zs.slice(0, 40).map((z) => round2(clampTo(z, [-10, out.height + 10], 0))), size: round2(clampTo(r.size, [0.05, 3], 0.4)) };
    }).filter(Boolean).slice(0, 20);
    if (members.length) out.members = members;
    const canopies = (Array.isArray(f.canopies) ? f.canopies : []).map((c) => {
      const cs = twoPts(c?.coords);
      if (!cs || !Number.isFinite(+c.z)) return null;
      return { coords: cs, z: round2(clampTo(c.z, [0.5, out.height + 5], 3)), depth: round2(clampTo(c.depth, [0.1, 5], 0.8)), thickness: round2(clampTo(c.thickness, [0.02, 1], 0.12)) };
    }).filter(Boolean).slice(0, 20);
    if (canopies.length) out.canopies = canopies;
  } else if (f.type === "road") {
    out.width = round2(clampTo(f.width, RANGE.width, d.width));
    out.lanes = Math.round(clampTo(f.lanes, RANGE.lanes, d.lanes));
    out.center = CENTER_KIND_KEYS.includes(f.center) ? f.center : d.center;
    out.edge = f.edge == null ? d.edge : !!f.edge;
    const w = Array.isArray(f.walk) ? f.walk : d.walk;
    out.walk = [0, 1].map((i) => round2(clampTo(w[i], RANGE.walk, d.walk[i])));
    const rad = Array.isArray(f.radius) ? [0, 1].map((i) => (f.radius[i] != null && f.radius[i] !== "" && Number.isFinite(+f.radius[i]) ? round2(clampTo(f.radius[i], [0.5, 20], 3)) : null)) : null;
    if (rad && rad.some((v) => v != null)) out.radius = rad;
  } else if (f.type === "surface") {
    out.kind = SURFACE_KIND_KEYS.includes(f.kind) ? f.kind : d.kind;
    if (out.kind === "zebra" && f.angle != null && Number.isFinite(+f.angle)) out.angle = Math.round(clampTo(f.angle, RANGE.angle, 45));
    // 板の目地：[板の幅, 板の向き]
    if (Array.isArray(f.boards) && f.boards.length === 2 && f.boards.every((v) => v != null && v !== "" && Number.isFinite(+v))) {
      out.boards = [round2(clampTo(f.boards[0], [0.05, 1], 0.15)), Math.round((((+f.boards[1] % 180) + 180) % 180) * 10) / 10];
    }
  } else if (f.type === "marking") {
    out.kind = MARKING_KIND_KEYS.includes(f.kind) ? f.kind : d.kind;
  } else if (f.type === "crosswalk") {
    out.coords = coords.slice(0, 2);
    out.width = round2(clampTo(f.width, RANGE.crosswalk, d.width));
  } else {
    out.width = round2(clampTo(f.width, RANGE.width, d.width));
    out.z = coords.map((_, i) => (f.z && f.z[i] != null && Number.isFinite(+f.z[i]) ? round2(clampTo(f.z[i], RANGE.z, 0)) : null));
    if (burnsGround(f)) {
      // 以前の形（edge: "wall" / "blend" と blend）も読む
      const side = f.side != null ? f.side : f.edge === "wall" ? 0 : f.blend;
      out.side = round2(clampTo(side, RANGE.side, d.side));
      out.flat = coords.slice(1).map((_, i) => !!(f.flat && f.flat[i]));
      out.corner = f.corner == null ? d.corner : !!f.corner;
      // 土台の横幅（帯の幅より狭くはしない）。空なら自動
      if (f.base != null && f.base !== "" && Number.isFinite(+f.base)) out.base = round2(clampTo(f.base, [out.width, RANGE.base[1]], out.width));
      // 各点の横幅（どれかに数があるときだけ持つ）
      const wOk = (v) => v != null && v !== "" && Number.isFinite(+v);
      if (Array.isArray(f.widths) && f.widths.some(wOk)) out.widths = coords.map((_, i) => (wOk(f.widths[i]) ? round2(clampTo(f.widths[i], RANGE.width, out.width)) : null));
      // 壁を立てないとき（既定は立てる）
      if (f.walls === false) out.walls = false;
      // 坂の両わきの壁の材質（階段は段の材質。下）
      if (f.type === "slope" && STAIRS_MATERIALS.includes(f.material)) out.material = f.material;
      // 各点の中心のずれ（どれかに数があるときだけ持つ）
      if (Array.isArray(f.shifts) && f.shifts.some(wOk)) out.shifts = coords.map((_, i) => (wOk(f.shifts[i]) ? round2(clampTo(f.shifts[i], RANGE.shift, 0)) : null));
      if (f.type === "stairs") {
        out.riser = round2(clampTo(f.riser, RANGE.riser, d.riser));
        // 手すり（以前の railing: true/false も読む）。12本まで。並べ替えない（エディタで入力中の行がずれないように）
        const rails = Array.isArray(f.rails) ? f.rails : f.railing === false ? [] : d.rails;
        out.rails = rails.map((r) => +r).filter(Number.isFinite).map((r) => Math.round(Math.min(3, Math.max(-2, r)) * 1000) / 1000).slice(0, 12);
        // 段の材質（wood 木 / stone 石。なければコンクリート）
        if (STAIRS_MATERIALS.includes(f.material)) out.material = f.material;
        // 段数を手で決めたとき：段の区間は 1〜200 段、踊り場は null
        if (Array.isArray(f.steps) && f.steps.some((v) => +v >= 1)) {
          out.steps = coords.slice(1).map((_, i) => (out.flat[i] || !(+f.steps[i] >= 1) ? null : Math.min(200, Math.round(+f.steps[i]))));
        }
      }
    } else {
      out.thickness = round2(clampTo(f.thickness, RANGE.thickness, d.thickness));
      out.railing = f.railing == null ? d.railing : !!f.railing;
      out.piers = f.piers == null ? d.piers : !!f.piers;
      out.surface = SURFACE_LABEL[f.surface] ? f.surface : d.surface;
    }
  }
  return out;
}

export function parseFeatures(json) {
  const list = Array.isArray(json) ? json : json && Array.isArray(json.features) ? json.features : [];
  const seen = new Set();
  return list.map(normalizeFeature).filter((f) => f && !seen.has(f.id) && seen.add(f.id));
}
export const serializeFeatures = (features) => `${JSON.stringify({ version: 1, features: features.map(normalizeFeature).filter(Boolean) }, null, 1)}\n`;

// 新しく描いた構造物（座標だけ）を既定値で作る
export const createFeature = (type, coords, extra = {}) => normalizeFeature({ type, coords, ...DEFAULTS[type], ...extra, id: newId(type) });

// ── 折れ線の計算（平面の m 座標）──
export function cumulative(xy) {
  const c = [0];
  for (let i = 1; i < xy.length; i++) c.push(c[i - 1] + Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]));
  return c;
}

// 距離 s の位置の値（vals は頂点ごとの値）
export function lerpAlong(cum, vals, s) {
  const n = cum.length;
  if (s <= 0) return vals[0];
  if (s >= cum[n - 1]) return vals[n - 1];
  let i = 1;
  while (cum[i] < s) i++;
  const k = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
  return vals[i - 1] + (vals[i] - vals[i - 1]) * k;
}

// 頂点ごとの高さ（標高 m）。z[i] が数なら「その点の地面 + z[i]」、空なら
// 両端は地面、途中は前後の決まった点のあいだを距離で直線に結ぶ
export function vertexElevations(coords, z, groundAt) {
  const n = coords.length;
  const cum = cumulative(coords.map(toXY));
  const E = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (z && typeof z[i] === "number") E[i] = groundAt(coords[i]) + z[i];
    else if (i === 0 || i === n - 1) E[i] = groundAt(coords[i]);
  }
  for (let i = 1; i < n - 1; i++) {
    if (E[i] != null) continue;
    let b = i + 1;
    while (E[b] == null) b++;
    E[i] = E[i - 1] + ((E[b] - E[i - 1]) * (cum[i] - cum[i - 1])) / (cum[b] - cum[i - 1] || 1);
  }
  return { cum, elev: E };
}

/**
 * 坂道・階段（と橋）の高さの折れ線。頂点に加えて、曲がり角の踊り場のふち（角から ±半幅）にも点を置く。
 * 踊り場（flat の区間と、corner なら曲がり角）は平らにし、決まった点どうしの高さの差は、残りの区間に長さの割合で割り振る
 * （どの段の区間も同じ勾配になる）。決まった点は、z のある頂点（地面 + z）と両端（地面）
 * @returns { xy, cum（頂点の中心線に沿った距離）, s・e（折れ線の点の距離と標高）, flat（折れ線の区間ごとに平らか）, elev（頂点の標高） }
 */
export function pathProfile(f, groundAt) {
  const xy = f.coords.map(toXY);
  const cum = cumulative(xy);
  const n = xy.length;
  const fixed = f.coords.map((c, i) => (f.z && typeof f.z[i] === "number" ? groundAt(c) + f.z[i] : i === 0 || i === n - 1 ? groundAt(c) : null));
  const knots = cum.map((s, v) => ({ s, v }));
  const zones = []; // 曲がり角の踊り場 [s0, s1]
  if (f.corner && f.width) {
    const wv = vertexWidths(f);
    const cv = vertexShifts(f);
    for (let i = 1; i < n - 1; i++) {
      const ax = xy[i][0] - xy[i - 1][0];
      const ay = xy[i][1] - xy[i - 1][1];
      const bx = xy[i + 1][0] - xy[i][0];
      const by = xy[i + 1][1] - xy[i][1];
      const la = Math.hypot(ax, ay);
      const lb = Math.hypot(bx, by);
      if (!la || !lb || (ax * bx + ay * by) / (la * lb) > Math.cos(25 * DEG)) continue; // ほぼまっすぐなら角ではない
      const d0 = Math.min(wv[i] / 2 + Math.abs(cv[i]), la * 0.4);
      const d1 = Math.min(wv[i] / 2 + Math.abs(cv[i]), lb * 0.4);
      knots.push({ s: cum[i] - d0 }, { s: cum[i] + d1 });
      zones.push([cum[i] - d0, cum[i] + d1]);
    }
  }
  knots.sort((p, q) => p.s - q.s);
  const S = knots.map((k) => k.s);
  const segOf = (s) => {
    let i = 0;
    while (i < n - 2 && cum[i + 1] <= s) i++;
    return i;
  };
  const seg = S.slice(0, -1).map((s0, k) => segOf((s0 + S[k + 1]) / 2)); // 折れ線の区間が中心線のどの辺か
  const flat = seg.map((g, k) => {
    const m = (S[k] + S[k + 1]) / 2;
    return !!(f.flat && f.flat[g]) || zones.some(([a, b]) => m > a && m < b);
  });
  // 辺ごとの、平らでない長さ
  const segRun = new Array(Math.max(1, n - 1)).fill(0);
  seg.forEach((g, k) => { if (!flat[k]) segRun[g] += S[k + 1] - S[k]; });
  // 高さの差の割り振り方：ふつうは長さの割合（どこも同じ勾配）。階段で段数を手で決めたときは段数の割合（どの段も同じ蹴上げ）
  const steps = f.type === "stairs" && Array.isArray(f.steps) && f.steps.some((v) => v >= 1) ? f.steps : null;
  const weight = (k) => {
    if (flat[k]) return 0;
    const len = S[k + 1] - S[k];
    return steps ? (len / (segRun[seg[k]] || 1)) * (steps[seg[k]] || segRun[seg[k]] / 0.3) : len;
  };
  const E = knots.map((k) => (k.v != null ? fixed[k.v] : null));
  for (let a = 0, j = 1; j < S.length; j++) {
    if (E[j] == null) continue;
    let run = 0;
    for (let k = a; k < j; k++) run += weight(k);
    const total = S[j] - S[a] || 1;
    let acc = 0;
    for (let k = a; k < j - 1; k++) {
      acc += run > 1e-9 ? weight(k) / run : (S[k + 1] - S[k]) / total; // ぜんぶ平らなのに高さが違うときは、まっすぐ結ぶ
      E[k + 1] = E[a] + (E[j] - E[a]) * acc;
    }
    a = j;
  }
  const elev = cum.map((_, v) => E[knots.findIndex((k) => k.v === v)]);
  return { xy, cum, s: S, e: E, flat, seg, segRun, steps, elev };
}

// 辺 i の長さを L m にする：その辺の向きのまま、うしろの点をまとめてずらす
export function withSegmentLength(coords, i, L) {
  const xy = coords.map(toXY);
  const dx = xy[i + 1][0] - xy[i][0];
  const dy = xy[i + 1][1] - xy[i][1];
  const cur = Math.hypot(dx, dy);
  if (!(cur > 1e-6) || !(L > 0)) return coords;
  const mx = (dx / cur) * (L - cur);
  const my = (dy / cur) * (L - cur);
  return coords.map((c, k) => (k <= i ? c : toLngLat([xy[k][0] + mx, xy[k][1] + my])));
}

/**
 * 段（坂）の区間のうち、高さの差が everyRise m を超えるものを同じ高さずつに分け、あいだに長さ len m の踊り場を入れた形を返す
 * （踊り場は区間の長さの半分まで）。頂点の z・横幅は残し、足した点は自動（高さも横幅も前後のあいだを結ぶ）
 */
export function withLandings(f, groundAt, everyRise, len) {
  const P = pathProfile({ ...f, corner: false }, groundAt);
  const coords = [f.coords[0]];
  const z = [f.z?.[0] ?? null];
  const flat = [];
  const widths = f.widths ? [f.widths[0] ?? null] : null; // 足した点の横幅・ずれは空き（前後のあいだを結ぶ）
  const shifts = f.shifts ? [f.shifts[0] ?? null] : null;
  let added = 0;
  for (let i = 0; i < f.coords.length - 1; i++) {
    const L = P.cum[i + 1] - P.cum[i];
    const k = f.flat?.[i] ? 1 : Math.ceil(Math.abs(P.elev[i + 1] - P.elev[i]) / everyRise - 0.01); // ちょうど割り切れるときに1つ多くならないよう少し余裕
    if (k > 1 && L > 0) {
      const d = Math.min(len, (L * 0.5) / (k - 1));
      const fl = (L - d * (k - 1)) / k;
      const [ax, ay] = P.xy[i];
      const [bx, by] = P.xy[i + 1];
      const at = (s) => toLngLat([ax + ((bx - ax) * s) / L, ay + ((by - ay) * s) / L]);
      for (let j = 1, pos = 0; j < k; j++) {
        pos += fl;
        coords.push(at(pos)); z.push(null); flat.push(false); widths?.push(null); shifts?.push(null); // ここまで段
        pos += d;
        coords.push(at(pos)); z.push(null); flat.push(true); widths?.push(null); shifts?.push(null); // ここまで踊り場
        added++;
      }
    }
    coords.push(f.coords[i + 1]);
    z.push(f.z?.[i + 1] ?? null);
    flat.push(!!f.flat?.[i]);
    widths?.push(f.widths[i + 1] ?? null);
    shifts?.push(f.shifts[i + 1] ?? null);
  }
  return { coords, z, flat, added, widths, shifts };
}

// 点を細かく足す（各辺を maxStep m 以下に）。元の頂点は残し、各点の距離 s も返す
export function densify(xy, maxStep) {
  const pts = [xy[0]];
  const s = [0];
  for (let i = 1; i < xy.length; i++) {
    const [ax, ay] = xy[i - 1];
    const [bx, by] = xy[i];
    const L = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.ceil(L / maxStep));
    for (let k = 1; k <= n; k++) {
      pts.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
      s.push(s[s.length - 1] + L / n);
    }
  }
  return { pts, s };
}

// 点ごとの値：arr の数か、両端は endValue、途中の空きは前後の決まった点のあいだを距離で直線に結ぶ
function perVertex(f, arr, endValue) {
  const n = f.coords.length;
  const V = f.coords.map((_, i) => (arr && typeof arr[i] === "number" ? arr[i] : i === 0 || i === n - 1 ? endValue : null));
  if (!V.some((v) => v == null)) return V;
  const cum = cumulative(f.coords.map(toXY));
  for (let i = 1; i < n - 1; i++) {
    if (V[i] != null) continue;
    let b = i + 1;
    while (V[b] == null) b++;
    V[i] = V[i - 1] + ((V[b] - V[i - 1]) * (cum[i] - cum[i - 1])) / (cum[b] - cum[i - 1] || 1);
  }
  return V;
}
// 坂道・階段の各点の横幅（空きは両端なら width）と、帯の中心のずれ（中心線から左へ m。空きは両端なら 0）
export const vertexWidths = (f) => perVertex(f, f.widths, f.width);
export const vertexShifts = (f) => perVertex(f, f.shifts, 0);

// 折れ線を左（進む向きの左）へ d m ずらした線（d は数か、点ごとの数の並び）。角は留め継ぎ（とがりすぎたら抑える）
export function offsetLine(xy, d) {
  const dd = Array.isArray(d) ? (i) => d[i] : () => d;
  const n = xy.length;
  const nrm = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = xy[i + 1][0] - xy[i][0];
    const dy = xy[i + 1][1] - xy[i][1];
    const L = Math.hypot(dx, dy) || 1;
    nrm.push([-dy / L, dx / L]);
  }
  return xy.map((p, i) => {
    const a = nrm[Math.max(0, i - 1)];
    const b = nrm[Math.min(n - 2, i)];
    let mx = a[0] + b[0];
    let my = a[1] + b[1];
    const ml = Math.hypot(mx, my);
    if (ml < 1e-6) return [p[0] + a[0] * dd(i), p[1] + a[1] * dd(i)];
    mx /= ml;
    my /= ml;
    const k = Math.min(3, 1 / Math.max(1e-3, mx * a[0] + my * a[1])); // 留め継ぎの長さ（3倍まで）
    return [p[0] + mx * dd(i) * k, p[1] + my * dd(i) * k];
  });
}

// 帯（中心線 xy・半幅 hw・中心のずれ ctr）の外側までの距離 D と、中心線に沿った位置 s、そこでの半幅 hw と帯の横の範囲 lo〜hi
// （中心線から左へ m）。帯の中なら D=0。hw・ctr は数か、点ごとの並び（だんだん広がる帯・横にずれた帯）。
// 両端は平らに切り、途中の角は丸く見る。角の丸みは、角の外側のすき間（前の辺の終わりより先で、次の辺の始まりより手前）だけに使う。
// ほかでは、その点を横に見る辺（まっすぐの距離）で決める（丸みを広く使うと、最初・最後の辺が半幅より短いときに帯が端の先へ
// はみ出し、点ごとに幅が違うと広い点の丸みがせまい辺の横へはみ出して、帯が描いた形より太くなる）
export function stripDistance(xy, cum, hw, p, ctr = 0) {
  let best = null;
  const at = (arr, i, tc) => (Array.isArray(arr) ? arr[i] + (arr[i + 1] - arr[i]) * tc : arr);
  const last = xy.length - 2;
  // 辺ごとの、点の位置（辺の始まり 0〜終わり 1）。長さのない辺は null
  const T = [];
  for (let i = 0; i <= last; i++) {
    const dx = xy[i + 1][0] - xy[i][0];
    const dy = xy[i + 1][1] - xy[i][1];
    const L2 = dx * dx + dy * dy;
    T.push(L2 < 1e-9 ? null : ((p[0] - xy[i][0]) * dx + (p[1] - xy[i][1]) * dy) / L2);
  }
  const prevT = (i) => { for (let k = i - 1; k >= 0; k--) if (T[k] != null) return T[k]; return null; };
  const nextT = (i) => { for (let k = i + 1; k <= last; k++) if (T[k] != null) return T[k]; return null; };
  let first = 0;
  while (first < last && T[first] == null) first++;
  let end = last;
  while (end > 0 && T[end] == null) end--;
  for (let i = 0; i <= last; i++) {
    const t = T[i];
    if (t == null) continue;
    const [ax, ay] = xy[i];
    const dx = xy[i + 1][0] - ax;
    const dy = xy[i + 1][1] - ay;
    const L = Math.hypot(dx, dy);
    const tc = Math.min(1, Math.max(0, t));
    const h = at(hw, i, tc);
    const c = at(ctr, i, tc);
    const lat = (dx * (p[1] - ay) - dy * (p[0] - ax)) / L; // 中心線から左へ（右はマイナス）
    let D;
    let raw;
    if ((i === first && t < 0) || (i === end && t > 1)) {
      const over = t < 0 ? -t * L : (t - 1) * L;
      D = Math.hypot(Math.max(0, lat - (c + h), c - h - lat), over);
      raw = Math.abs(lat) + over;
    } else if (t >= 0 && t <= 1) {
      D = Math.max(0, lat - (c + h), c - h - lat);
      raw = Math.abs(lat);
    } else {
      // 角の丸みは、角の外側のすき間だけ。丸みの半径は、その側のふちまで
      if (t < 0 && !(prevT(i) > 1)) continue;
      if (t > 1 && !(nextT(i) < 0)) continue;
      const dist = Math.hypot(p[0] - (ax + dx * tc), p[1] - (ay + dy * tc));
      D = Math.max(0, dist - (lat >= 0 ? c + h : h - c));
      raw = dist;
    }
    if (!best || D < best.D - 1e-9 || (Math.abs(D - best.D) <= 1e-9 && raw < best.raw)) {
      best = { D, raw, s: cum[i] + tc * L, hw: h, lo: c - h, hi: c + h };
    }
  }
  if (!best && T.some((t) => t != null)) {
    // どの決まりにも当たらない点（念のため）：いちばん近い辺の上の点から
    for (let i = 0; i <= last; i++) {
      if (T[i] == null) continue;
      const tc = Math.min(1, Math.max(0, T[i]));
      const [ax, ay] = xy[i];
      const dx = xy[i + 1][0] - ax;
      const dy = xy[i + 1][1] - ay;
      const lateral = Math.hypot(p[0] - (ax + dx * tc), p[1] - (ay + dy * tc));
      const h = at(hw, i, tc);
      const c = at(ctr, i, tc);
      if (!best || lateral < best.raw) best = { D: Math.max(0, lateral - h - Math.abs(c)), raw: lateral, s: cum[i] + tc * Math.hypot(dx, dy), hw: h, lo: c - h, hi: c + h };
    }
  }
  const h0 = Array.isArray(hw) ? hw[0] : hw;
  const c0 = Array.isArray(ctr) ? ctr[0] : ctr;
  return best || { D: Infinity, raw: Infinity, s: 0, hw: h0, lo: c0 - h0, hi: c0 + h0 };
}

const bboxOf = (xy, pad) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of xy) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
};
const inBox = (b, x, y) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];

// すべての構造物を囲む範囲 [西, 南, 東, 北]（読み込む標高タイルを決めるため）。pad は m
export function featuresBounds(features, pad = 40) {
  const xy = features.flatMap((f) => f.coords.map(toXY));
  if (!xy.length) return null;
  const [x0, y0, x1, y1] = bboxOf(xy, pad);
  const [w, s] = toLngLat([x0, y0]);
  const [e, n] = toLngLat([x1, y1]);
  return [w, s, e, n];
}

// 垂直に切るとき（side 0）の壁の厚さ（m）。地面の段差は壁の中（ふちから外へ 0〜WALL_T）に置いて隠す。
// ふちちょうどに置くと、標高タイルの升目に沿ってぎざぎざになり、地形の補間（前後 0.5〜0.7m）で壁の外へはみ出して見える
export const WALL_T = 1.2;
// 壁を高い側へ広げる幅（m）：表示の地面（ズーム 18 の px の中心どうしの補間）で、段差のへこみが壁の外へ出るのは 0.4m まで
export const WALL_CAP = 0.5;
// 帯・範囲のふちからの距離 d での高さ：inner（中の高さ）から v（外の地面）へ。band が 0 なら壁（厚さ wt）の中で段差にする。
// 補間で高い地面が低い側へはみ出すので、段差は高い側の面に寄せる（中が高ければふち寄り、外が高ければ外寄り）。
// 逆に低い地面が高い側の壁の外へ少しへこんで出るので、壁は高い側へ WALL_CAP ぶん広く描く（campus3dMesh の addTerraceWalls）
const edgeBlend = (d, inner, v, band, wt = WALL_T) => {
  if (band > 0) return d >= band ? v : v + (inner - v) * (1 - d / band);
  return d < wt * (inner > v ? 0.25 : 0.75) ? inner : v;
};

// 坂道・階段の土台の横幅（両わきの壁・路肩を含む）。壁（side 0）は既定で両わきに WALL_T ずつ、いちばん細くて 0.1m ずつ。
// 斜面（side > 0）は既定で帯と同じ（路肩なし）
export function baseWidth(f) {
  if (f.walls === false && !(f.side > 0)) return f.width; // 壁を立てない
  if (f.side > 0) return Math.max(f.width, f.base ?? f.width);
  return Math.max(f.width + 0.2, f.base ?? f.width + 2 * WALL_T);
}
// 両わきの壁の厚さ（斜面なら 0）
export const wallThickness = (f) => (f.side > 0 ? 0 : (baseWidth(f) - f.width) / 2);

// ── 壁を立てない階段（walls: false）と平地のふち ──
// 平地のふちのうち、壁なしの階段が横切るところ（帯の中で、両わきのふちの線に沿っていない）は「開いている」：
// 平地はそこに壁を立てず（campus3dMesh.js）、ふちの外も掘らない（地面の段差は階段の段が隠す）。
// 両わきのふちの線から WALL_T 以内で向きが 30°以内なら「沿っている」：平地の壁がそのまま階段の両わきの壁になる
export const isOpenStairs = (f) => f.type === "stairs" && f.walls === false && !(f.side > 0);
const ALONG = Math.cos((30 * Math.PI) / 180);
// 平面の形だけ（高さはいらないので、平地より先に作れる）
export function stairsOpening(f) {
  const xy = f.coords.map(toXY);
  const hwv = vertexWidths(f).map((w) => w / 2);
  const cv = vertexShifts(f);
  return {
    xy, cum: cumulative(xy), hwv, cv,
    sides: [1, -1].map((sg) => offsetLine(xy, hwv.map((h, i) => cv[i] + sg * h))), // 左と右のふちの線
    box: bboxOf(xy, Math.max(...hwv.map((h, i) => h + Math.abs(cv[i]))) + WALL_T),
  };
}
// 点 p（向き dir のふちの上）が、どれかの線に沿っているか
function alongLines(lines, p, dir) {
  return lines.some((ln) => ln.some((a, k) => {
    const b = ln[k + 1];
    if (!b) return false;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    if (l2 < 1e-9) return false;
    const t = Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
    if (Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t) > WALL_T) return false;
    return Math.abs(dx * dir[0] + dy * dir[1]) / Math.sqrt(l2) >= ALONG;
  }));
}
// 両わきとも、垂直に切った平地のふちに沿っている（7割以上の長さで、1.2m 以内・30°以内）階段は、壁なしの階段
// （walls: false）として扱う：平地の壁がそのまま両わきの壁になる。階段の壁も立てると、平地の壁と上端の高さを測る
// 場所がずれて段違いになり（角・端で 0.5〜0.8m）、平地のふちとのすき間の段差も壁の外に出てガタガタに見える。
// 自動で切り替えたものは autoOpen: true（エディタで知らせる）
export function withAutoOpenStairs(features) {
  const rings = features.filter((f) => f.type === "terrace" && !(f.side > 0) && f.coords.length >= 3).map((f) => {
    const r = f.coords.map(toXY);
    return [...r, r[0]];
  });
  if (!rings.length) return features;
  return features.map((f) => {
    if (f.type !== "stairs" || f.walls === false || f.side > 0 || f.coords.length < 2) return f;
    const along = stairsOpening(f).sides.every((side) => {
      const { pts } = densify(side, 1);
      let ok = 0;
      pts.forEach((p, i) => {
        const a = pts[Math.max(0, i - 1)];
        const b = pts[Math.min(pts.length - 1, i + 1)];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        if (alongLines(rings, p, [(b[0] - a[0]) / l, (b[1] - a[1]) / l])) ok++;
      });
      return ok >= 0.7 * pts.length;
    });
    return along ? { ...f, walls: false, autoOpen: true } : f;
  });
}
// ふちの点 p（ふちの向き dir）が、壁なしの階段の通り道で開いているか（opens は stairsOpening の並び）
export function edgeOpen(opens, p, dir) {
  return opens.some((o) => inBox(o.box, p[0], p[1]) && stripDistance(o.xy, o.cum, o.hwv, p, o.cv).D <= 0.01 && !alongLines(o.sides, p, dir));
}

// ── 坂・階段：標高タイルに「焼き込む」形 ──
// baseAt([lng,lat]) は元の地面の高さ。返す burn(x, y, v) は地面の高さ v をその点の坂の高さにする。
// 帯の外は side m かけて元の地面へ戻す（0 なら両わきの壁の厚さ wt のぶんでつなぎ、壁は campus3dMesh.js が立てる）。
// 土台が帯より広く、斜面のとき（side > 0）は、帯と斜面のあいだが平らな路肩になる
export function prepareSlope(f, baseAt) {
  const P = pathProfile(f, baseAt);
  if (!P.e.every(Number.isFinite)) return null;
  const { xy, cum, elev } = P;
  const prof = { s: P.s, e: P.e, flat: P.flat, seg: P.seg, segRun: P.segRun, steps: P.steps }; // 高さの折れ線（踊り場の区切りを含む）
  const side = f.side;
  const hwv = vertexWidths(f).map((w) => w / 2); // 点ごとの半幅（だんだん広がる帯）
  const wt = wallThickness(f); // 両わきの壁の厚さ（斜面なら 0）。幅が変わっても同じ
  const edge = (baseWidth(f) - f.width) / 2; // 帯のふちから土台のふちまで（壁の厚さか路肩の幅）
  const hbv = hwv.map((h) => h + edge); // 点ごとの土台の半幅
  const cv = vertexShifts(f); // 点ごとの帯の中心のずれ（左へ m）
  const hw = Math.max(...hwv.map((h, i) => h + Math.abs(cv[i]))); // 中心線からいちばん遠いふちまで
  const hb = Math.max(...hbv.map((h, i) => h + Math.abs(cv[i])));
  const box = bboxOf(xy, hb + side + 1);
  // 焼き込む地面：坂道は坂の面、階段は段の下（stairGround）。rise は階段のいちばん高い蹴上げ（段の角をなぞる線の高さ）
  let under = prof;
  let rise = 0;
  if (f.type === "stairs") {
    const fls = stairFlights(prof, f.riser, cum);
    const g = stairGround(fls);
    if (g.s.length >= 2) under = g;
    rise = Math.max(0, ...fls.map((fl) => fl.rise || 0)) || f.riser;
  }
  // 壁で囲った階段は削るだけ：まわりより高いところは元の地面のまま（段と壁で隠れる）。地面の段差が壁の外に出ないので、壁を細くできる
  const cutOnly = f.type === "stairs" && side === 0;
  // 壁なしの階段は、高いほうの端から WALL_T のあいだだけ盛りもする：地面の段差を端の外（段のない所）でなく段の下に置く。
  // 低いほうの端は盛らない（下の段は床のすぐ上にあり、段の角に触れる下の地面が表示の地面の補間で段の上に出る）
  const fillEnds = isOpenStairs(f) ? WALL_T : 0;
  const hiStart = under.e[0] >= under.e[under.e.length - 1];
  const hEnd = hiStart ? under.e[0] : under.e[under.e.length - 1]; // 高いほうの端の、段の下の地面（いちばん上の段の高さ）
  const len = cum[cum.length - 1];
  const sw = side > 0 ? edge : 0; // 路肩の幅
  // 路肩の高さ：坂道は坂の面、階段は段の下の地面より下（坂の面から一段下）
  const shoulder = (s) => lerpAlong(prof.s, prof.e, s) - (f.type === "stairs" ? rise + 0.02 : 0);
  return {
    f, xy, cum, elev, prof, under, rise, hw, hb, hwv, hbv, cv, wt, side, box, walls: f.walls !== false,
    burn(x, y, v) {
      if (!inBox(box, x, y)) return v;
      const { D, s } = stripDistance(xy, cum, hwv, [x, y], cv);
      const h = lerpAlong(under.s, under.e, s);
      if (cutOnly) {
        // 盛るところは段の下の地面より一段＋0.08m 下：表示の地面は標高タイルの px の値を px の角に置いて補間する（＝焼き込んだ位置から
        // 東と南へ半 px＝0.24m ずれる）ので、段の角にちょうど触れる地面は、ずれた先で段の上の面より上に出て白い筋になる
        if (D <= 0) return (s < fillEnds && hiStart) || (s > len - fillEnds && !hiStart) ? Math.max(Math.min(h, v), h - rise - 0.08) : Math.min(h, v);
        // 高いほうの端の外（段の続きの地面）と、端から 1m までの両わきは、いちばん上の段より 0.03m 下（ずれて、上の段の上に出ないように。
        // 両わきは平地の壁の帯の下。壁なしの階段は壁の厚さ wt が 0 なので、平地の壁の厚さの 3/4 まで）
        if (fillEnds && D < WALL_T * 0.75 && (hiStart ? s <= 1 : s >= len - 1)) return Math.min(v, hEnd - 0.03);
        return h < v && D < wt * 0.75 ? h : v; // 掘ったところの段差は壁の中（外の面寄り）
      }
      if (D <= 0) return h;
      if (side === 0) return edgeBlend(D, h, v, 0, wt);
      if (sw <= 0) return edgeBlend(D, h, v, side); // 斜面はまっすぐに
      const hs = shoulder(s);
      return D <= sw ? hs : edgeBlend(D - sw, hs, v, side);
    },
  };
}

// ── 平地：囲んだ範囲を平らにする ──
// 多角形 ring（平面の m 座標、閉じない）の中か
export function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// 多角形のふちまでの距離
function distToRing(x, y, ring) {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j];
    const dx = ring[i][0] - ax;
    const dy = ring[i][1] - ay;
    const L2 = dx * dx + dy * dy || 1e-9;
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / L2));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), y - (ay + dy * t)));
  }
  return best;
}
// 多角形のふちのいちばん近い辺 k（ring[k] から次の点へ）とその上の位置 t、距離 d
function nearestOnRing(x, y, ring) {
  let best = { d: Infinity, k: 0, t: 0 };
  for (let k = 0; k < ring.length; k++) {
    const [ax, ay] = ring[k];
    const b = ring[(k + 1) % ring.length];
    const dx = b[0] - ax;
    const dy = b[1] - ay;
    const L2 = dx * dx + dy * dy || 1e-9;
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / L2));
    const d = Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
    if (d < best.d) best = { d, k, t };
  }
  return best;
}
const ringDir = (ring, k) => {
  const a = ring[(k + ring.length) % ring.length];
  const b = ring[(k + 1 + ring.length) % ring.length];
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
};

// 多角形の面積（左回りなら正）
export const ringArea = (ring) => ring.reduce((a, p, i) => { const q = ring[(i + 1) % ring.length]; return a + (p[0] * q[1] - q[0] * p[1]) / 2; }, 0);

// baseAt は元の地面。中の地面を 1m おき（広いときは間引く）に調べて、最低・平均・最高を出し、平らにする高さを決める。
// opens（stairsOpening の並び）：壁なしの階段が横切るふちの外は掘らない（そこには壁を立てないので、掘ると溝が見える）
// 辺ごとに外へ d[i] m ずらした多角形（点 i は、辺 i−1 と辺 i をずらした線の交わり。平行ならずらした点）
export function offsetRingBy(ring, d) {
  const n = ring.length;
  const out = ringArea(ring) > 0 ? 1 : -1; // 左回りなら外は辺の右
  const lines = ring.map((a, i) => {
    const b = ring[(i + 1) % n];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    return { p: [a[0] + u[1] * out * d[i], a[1] - u[0] * out * d[i]], u };
  });
  return ring.map((_, i) => {
    const A = lines[(i - 1 + n) % n];
    const B = lines[i];
    const den = A.u[0] * B.u[1] - A.u[1] * B.u[0];
    if (Math.abs(den) < 1e-9) return B.p;
    const t = ((B.p[0] - A.p[0]) * B.u[1] - (B.p[1] - A.p[1]) * B.u[0]) / den;
    return [A.p[0] + A.u[0] * t, A.p[1] + A.u[1] * t];
  });
}

// 天井のある平地（ceiling）の形：辺ごとに、外の地面（掘った帯の外）が天井より高ければ壁の辺、ほかは開いた辺（明かり取りや踊り場に
// 面した口）。ふた（上の地面の続き）は壁の辺を外へ WALL_T + WALL_CAP 広げた形（地面の段差の補間のへこみを隠す）で、開いた辺は
// そのまま（となりの平地の壁の面の線）。床は開いた辺を 0.05m 外へ（踊り場とのすき間をふさぐ）。ground(x, y) は平面の m の地面
// @returns { walls（辺ごとに壁か）, under（天井の標高）, top（ふたの上＝まわりの地面）, poly（ふたの形）, floor（床の形） }
export function terraceLid(f, ring, elev, ground) {
  if (!(f.ceiling > 0) || !Number.isFinite(elev) || ring.length < 3) return null;
  const n = ring.length;
  const out = ringArea(ring) > 0 ? 1 : -1;
  const reach = WALL_T + WALL_CAP + 0.9;
  const under = elev + f.ceiling;
  let top = -Infinity;
  const walls = ring.map((a, i) => {
    const b = ring[(i + 1) % n];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nn = [((b[1] - a[1]) / L) * out, (-(b[0] - a[0]) / L) * out];
    let g = -Infinity;
    for (const t of [0.25, 0.5, 0.75]) {
      const v = ground(a[0] + (b[0] - a[0]) * t + nn[0] * reach, a[1] + (b[1] - a[1]) * t + nn[1] * reach);
      if (Number.isFinite(v)) g = Math.max(g, v);
    }
    if (!(g > under)) return false;
    top = Math.max(top, g);
    return true;
  });
  if (!Number.isFinite(top)) return null;
  return { walls, under, top, poly: offsetRingBy(ring, walls.map((w) => (w ? WALL_T + WALL_CAP : 0))), floor: offsetRingBy(ring, walls.map((w) => (w ? 0 : 0.05))) };
}

export function prepareTerrace(f, baseAt, opens = []) {
  const ring = f.coords.map(toXY);
  const b0 = bboxOf(ring, 0);
  const step = Math.max(1, Math.sqrt(((b0[2] - b0[0]) * (b0[3] - b0[1])) / 2500));
  let sum = 0;
  let n = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let x = b0[0] + step / 2; x < b0[2]; x += step) {
    for (let y = b0[1] + step / 2; y < b0[3]; y += step) {
      if (!pointInRing(x, y, ring)) continue;
      const v = baseAt(toLngLat([x, y]));
      if (!Number.isFinite(v)) continue;
      sum += v;
      n++;
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
  }
  if (!n) {
    // 細すぎて升目に当たらないときは、頂点の地面で
    f.coords.forEach((c) => { const v = baseAt(c); if (Number.isFinite(v)) { sum += v; n++; min = Math.min(min, v); max = Math.max(max, v); } });
  }
  const mean = n ? sum / n : NaN;
  const elev = f.elev != null ? f.elev : mean;
  if (!Number.isFinite(elev)) return null;
  const side = f.side;
  const box = bboxOf(ring, Math.max(side, WALL_T) + 1);
  const near = side > 0 ? [] : opens.filter((o) => !(o.box[2] < box[0] || o.box[0] > box[2] || o.box[3] < box[1] || o.box[1] > box[3]));
  // 坂道・階段の高さの基準にする地面：開いていてもふちの外を掘る（ふちちょうどに置いた点の地面が、1cm の丸めで
  // 平地の高さと外の地面のあいだを飛ばないように）
  const level = (x, y, v) => {
    if (!inBox(box, x, y)) return v;
    return pointInRing(x, y, ring) ? elev : edgeBlend(distToRing(x, y, ring), elev, v, side);
  };
  return {
    f, ring, elev, side, box, stats: { min, mean, max }, level,
    // 表示する地面
    burn: !near.length ? level : (x, y, v) => {
      if (!inBox(box, x, y)) return v;
      if (pointInRing(x, y, ring)) return elev;
      const { d, k, t } = nearestOnRing(x, y, ring);
      if (d < WALL_T) {
        const a = ring[k];
        const b = ring[(k + 1) % ring.length];
        const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        // 角に近いなら両側の辺の向きで見る（どちらかで開いていれば掘らない）
        const dirs = t < 1e-6 ? [ringDir(ring, k - 1), ringDir(ring, k)] : t > 1 - 1e-6 ? [ringDir(ring, k), ringDir(ring, k + 1)] : [ringDir(ring, k)];
        if (dirs.some((dir) => edgeOpen(near, p, dir))) return v;
      }
      return edgeBlend(d, elev, v, side);
    },
  };
}

// 階段の流れ：高さの折れ線（prepareSlope の prof）の区間ごとに、段数 n（蹴上げの数）を決める。段数は手で決めた数か、
// 高さの差を一段の高さで割った数。踊り場と、高さがほとんど変わらない区間は平ら（flat）。seg は中心線のどの辺か（cum は頂点の距離）。
// 流れの中の踏面はふつう n−1 枚で、両端が蹴上げ（踊り場は描いた長さのまま見える）。
// ただし高いほうの端が踊り場でない流れ（階段の端で上の地面につながる・次の流れに直接つながる）は、上がりきった一段
// （上の高さの踏面）も流れの中に含めて n 枚（top）。上の地面との段差を流れの端に作ると、標高タイルの補間で地面が段の上に出るため
export function stairFlights(prof, riser, cum) {
  const K = prof.s.length - 1;
  const out = [];
  for (let k = 0; k < K; k++) {
    const s0 = prof.s[k];
    const s1 = prof.s[k + 1];
    const L = s1 - s0;
    let seg = 0;
    while (seg < cum.length - 2 && cum[seg + 1] <= (s0 + s1) / 2) seg++;
    const e0 = prof.e[k];
    const e1 = prof.e[k + 1];
    const manual = prof.steps && prof.steps[seg] >= 1 ? Math.max(1, Math.round((prof.steps[seg] * L) / (prof.segRun?.[seg] || L))) : 0;
    const tiny = L < 0.05;
    const flat = tiny || !!prof.flat[k] || (!manual && Math.abs(e1 - e0) < riser / 2);
    out.push({ k, seg, s0, s1, e0, e1, tiny, flat, n: flat ? 0 : manual || Math.max(1, Math.round(Math.abs(e1 - e0) / riser)) });
  }
  // 高いほうの端のとなり（ごく短い区間はとばす）が踊り場でなければ top
  const near = (k, d) => { let j = k + d; while (out[j] && out[j].tiny) j += d; return out[j]; };
  out.forEach((fl) => {
    if (fl.flat) return;
    const nb = near(fl.k, fl.e1 > fl.e0 ? 1 : -1);
    fl.top = !nb || !nb.flat;
    fl.rise = Math.abs(fl.e1 - fl.e0) / fl.n; // 蹴上げ
    fl.treads = fl.top ? fl.n : fl.n - 1; // 流れの長さに並ぶ踏面の数
  });
  return out;
}

// 階段の段：流れごとの踏面の箱。s0〜s1 は中心線に沿った距離、top は段の上の標高、seg は中心線のどの辺か。踊り場は平ら（flat）
export function stairSteps(prof, riser, cum) {
  const out = [];
  for (const fl of stairFlights(prof, riser, cum)) {
    const { s0, s1, e0, e1, n, seg } = fl;
    const L = s1 - s0;
    const dh = e1 - e0;
    if (fl.tiny) continue;
    if (fl.flat) out.push({ s0, s1, top: e0 + dh / 2, seg, flat: true });
    else if (fl.top) {
      // 上がりきった一段も含めて n 枚。上りなら1段目から一段ぶん上がり、下りなら1段目は上の高さのまま
      for (let i = 0; i < n; i++) out.push({ s0: s0 + (L * i) / n, s1: s0 + (L * (i + 1)) / n, top: e0 + (dh * (dh > 0 ? i + 1 : i)) / n, seg });
    } else if (n === 1) {
      out.push({ s0, s1, top: Math.min(e0, e1), seg }); // 一段だけ：低いほうの高さのまま進み、高いほうの端で上がる
    } else {
      // n−1 枚。両端が蹴上げ
      for (let j = 0; j < n - 1; j++) out.push({ s0: s0 + (L * j) / (n - 1), s1: s0 + (L * (j + 1)) / (n - 1), top: e0 + (dh * (j + 1)) / n, seg });
    }
  }
  return out;
}

// 階段の下の地面（標高タイルに焼き込む高さの折れ線 { s, e }）。段の上に地面が出ないよう、段の内側の角を結ぶ線にする：
// 両端が蹴上げの流れは高いほうの端で一段ぶん低く、そこにつながる踊り場も一段ぶん下げる（段差は踊り場の箱の下に隠れる）。
// 階段の両端の高さは prof と同じ（まわりの地面とのあいだに段差を作らない）
export function stairGround(flights) {
  const S = [];
  const E = [];
  const put = (s, e) => {
    S.push(S.length && s <= S[S.length - 1] ? S[S.length - 1] + 1e-4 : s);
    E.push(e);
  };
  const real = flights.filter((fl) => !fl.tiny);
  // 両端が蹴上げの流れの、高いほうの端が踊り場にあるときの下げ幅
  const dropAt = (fl, end) => (fl && !fl.flat && !fl.top && (end === 1) === fl.e1 > fl.e0 ? fl.rise : 0);
  real.forEach((fl, i) => {
    const { s0, s1, e0, e1 } = fl;
    if (fl.flat) {
      const e = (e0 + e1) / 2;
      const d0 = dropAt(real[i - 1], 1); // 前の流れの高い端がここ
      const d1 = dropAt(real[i + 1], 0); // 次の流れの高い端がここ
      const half = Math.min(1.2, (s1 - s0) / 2);
      if (i === 0 && d1) { put(s0, e); put(s1 - half, e); put(s1 - half, e - d1); put(s1, e - d1); } // 階段の端の踊り場：端は元の高さ
      else if (i === real.length - 1 && d0) { put(s0, e - d0); put(s0 + half, e - d0); put(s0 + half, e); put(s1, e); }
      else { const d = Math.max(d0, d1); put(s0, e - d); put(s1, e - d); }
    } else if (fl.top) {
      put(s0, e0); put(s1, e1);
    } else if (e1 > e0) {
      put(s0, e0); put(s1, e1 - fl.rise);
    } else {
      put(s0, e0 - fl.rise); put(s1, e1);
    }
  });
  // 段の角にちょうど触れるところがあるので、両端の点のほかは少しだけ下げる（標高の丸めで地面が段の上に出ないように）
  for (let i = 1; i < E.length - 1; i++) E[i] -= 0.02;
  return { s: S, e: E };
}

// ── 線を持ち上げる面（橋の床・階段の段の上）：その上を通る線の見分け ──
// hwv は点ごとの半幅（なければ f.width の半分で一定）、cv は点ごとの帯の中心のずれ（なければ 0）
function pathOf(f, xy, cum, deckAt, hwv = null, cv = null) {
  const hv = hwv || xy.map(() => f.width / 2);
  const cc = cv || xy.map(() => 0);
  const segs = [];
  for (let i = 0; i < xy.length - 1; i++) {
    const dx = xy[i + 1][0] - xy[i][0];
    const dy = xy[i + 1][1] - xy[i][1];
    const L = Math.hypot(dx, dy);
    // 辺の横の範囲（中心線から左へ m）
    if (L > 1e-6) segs.push({ a: xy[i], ux: dx / L, uy: dy / L, L, lo: Math.min(cc[i] - hv[i], cc[i + 1] - hv[i + 1]), hi: Math.max(cc[i] + hv[i], cc[i + 1] + hv[i + 1]) });
  }
  const hw = Math.max(...hv.map((h, i) => h + Math.abs(cc[i])));
  return { f, xy, cum, hw, hwv: hv, cv: cc, segs, box: bboxOf(xy, hw + 1), deckAt };
}
export function prepareBridge(f, groundAt) {
  const xy = f.coords.map(toXY);
  const { cum, elev } = vertexElevations(f.coords, f.z, groundAt);
  if (elev.some((v) => !Number.isFinite(v))) return null;
  return { ...pathOf(f, xy, cum, (s) => lerpAlong(cum, elev, s)), elev };
}
// 階段の上のルートの通り道：手すりのあいだでいちばん広いところのまん中（中心線から左へ m）。
// 手すりが段の両端だけならまん中。まん中に手すりがあるときに、ルートが手すりの支柱に隠れて途切れないように
// 手すりの位置は幅に対する割合なので、通り道も割合で決まる（幅が変わる階段でも、同じ割合の位置を通る）
const laneRatio = (f) => {
  const xs = [0, ...(f.rails || []).filter((r) => r > 0.02 && r < 0.98), 1].sort((a, b) => a - b);
  let best = null;
  for (let i = 0; i < xs.length - 1; i++) {
    const gap = xs[i + 1] - xs[i];
    const mid = (xs[i] + xs[i + 1]) / 2;
    if (!best || gap > best.gap + 1e-6 || (Math.abs(gap - best.gap) <= 1e-6 && Math.abs(mid - 0.5) < Math.abs(best.mid - 0.5) - 1e-6)) best = { gap, mid };
  }
  return best.mid;
};
export const stairsLane = (f) => f.width * (0.5 - laneRatio(f));
// 階段の上を通る線は、段の角をなぞる高さ（坂の面 + 一段）より少し上（STAIRS_CLEAR）に、手すりのあいだの通り道（lane）へ寄せて描く。
// 段の角とほとんど同じ高さだと、画面での線の太さのぶん、手前の段の蹴上げに隠れて点線のように途切れる。
// 踊り場の前後で高さの折れ目があるので、点は 0.5m ごと。sl は prepareSlope の結果
export const STAIRS_CLEAR = 0.15;
export const stairsPath = (sl) => {
  const k = 1 - 2 * laneRatio(sl.f); // 通り道 = 半幅 × k（中心線から左へ）
  return {
    ...pathOf(sl.f, sl.xy, sl.cum, (s) => lerpAlong(sl.prof.s, sl.prof.e, s) + (sl.rise || sl.f.riser) + STAIRS_CLEAR, sl.hwv, sl.cv),
    elev: sl.elev,
    laneAt: (s) => lerpAlong(sl.cum, sl.cv, s) + lerpAlong(sl.cum, sl.hwv, s) * k,
    step: 0.5,
  };
};

const ALIGN = Math.cos(35 * DEG); // 線の向きと橋の向きがこの角度以内なら「橋の上を通る線」

// 線分 A→B のうち、橋 br の上にある範囲 [t0, t1]（0〜1）。橋と向きがそろっていなければ null（橋の下をくぐる線）。
// margin は橋の両端から先へ、side は床のふちから外へ、どこまで「橋の上」とみなすか（m）
function onBridgeRange(A, B, br, margin, side) {
  const vx = B[0] - A[0];
  const vy = B[1] - A[1];
  const vl = Math.hypot(vx, vy);
  if (vl < 1e-6) return null;
  const ranges = [];
  for (const sg of br.segs) {
    if (Math.abs((vx * sg.ux + vy * sg.uy) / vl) < ALIGN) continue;
    let t0 = 0;
    let t1 = 1;
    // 橋の向き（0〜L）と横（±半幅）の4つの条件で切る
    const ax = A[0] - sg.a[0];
    const ay = A[1] - sg.a[1];
    const conds = [
      [ax * sg.ux + ay * sg.uy, vx * sg.ux + vy * sg.uy, -margin, sg.L + margin],
      [-ax * sg.uy + ay * sg.ux, -vx * sg.uy + vy * sg.ux, (sg.lo ?? -br.hw) - side, (sg.hi ?? br.hw) + side],
    ];
    let ok = true;
    for (const [p0, dp, lo, hi] of conds) {
      if (Math.abs(dp) < 1e-9) {
        if (p0 < lo || p0 > hi) { ok = false; break; }
        continue;
      }
      let ta = (lo - p0) / dp;
      let tb = (hi - p0) / dp;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 >= t1) { ok = false; break; }
    }
    if (ok && t1 - t0 > 1e-6) ranges.push([t0, t1]);
  }
  return ranges;
}

const mergeRanges = (rs) => {
  rs.sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const r of rs) {
    if (out.length && r[0] <= out[out.length - 1][1] + 1e-9) out[out.length - 1][1] = Math.max(out[out.length - 1][1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
};

// 中心線に沿って距離 s の点・向き・横向き（平面の m 座標）
function centerAt(br, s) {
  let i = 1;
  while (i < br.cum.length - 1 && br.cum[i] < s) i++;
  const a = br.xy[i - 1];
  const b = br.xy[i];
  const L = br.cum[i] - br.cum[i - 1] || 1;
  const t = (s - br.cum[i - 1]) / L;
  const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], u, n: [-u[1], u[0]] };
}

// 階段の通り道（lane）へ寄せた点の並びを、両端の LANE_EASE m で元の位置からなめらかに寄せる（端で横に折れ曲がらないように）。
// 寄せる前の位置（p.free）を持たない点（地面の線とのつなぎ）はそのまま
const LANE_EASE = 1.5;
function easeIntoLane(pts) {
  const idx = pts.map((p, i) => (p.free ? i : -1)).filter((i) => i >= 0);
  if (idx.length < 2) return;
  const xy = idx.map((i) => toXY(pts[i]));
  const d = [0];
  for (let k = 1; k < xy.length; k++) d.push(d[k - 1] + Math.hypot(xy[k][0] - xy[k - 1][0], xy[k][1] - xy[k - 1][1]));
  const total = d[d.length - 1];
  idx.forEach((i, k) => {
    const w = Math.min(1, d[k] / LANE_EASE, (total - d[k]) / LANE_EASE);
    if (w >= 1) return;
    const f = toXY(pts[i].free);
    const ll = toLngLat([f[0] + (xy[k][0] - f[0]) * w, f[1] + (xy[k][1] - f[1]) * w]);
    pts[i][0] = ll[0];
    pts[i][1] = ll[1];
  });
}

// ルートや経路の線を橋の上に乗せるときの決まり：橋と向きがそろっていれば、床のふちから 2.5m 外まで橋の上とみなし、床の上へ寄せて描く
// （経路の線は手で引いたものなので、OSM の橋などとは数m ずれていることがある）
export const ROUTE_ON_BRIDGE = { side: 2.5, toDeck: true };

/**
 * 線（[[lat, lng], ...]）を、地面を通る部分と橋の上を通る部分に分ける。
 * 返す ground は地図に貼って描く線、onBridge は橋の上の線（[lng, lat, 床の標高] の点の並び）。
 * opts: margin（橋の両端から先へ m）, side（床のふちから外へ m）, toDeck（橋の上の点を床の上へ寄せる）
 */
export function splitByBridges(lines, bridges, { margin = 0.6, side = 0.6, toDeck = false } = {}) {
  if (!bridges.length) return { ground: lines, onBridge: [] };
  const ground = [];
  const onBridge = [];
  for (const line of lines) {
    if (line.length < 2) continue;
    const xy = line.map(([lat, lng]) => toXY([lng, lat]));
    let run = null; // 続いている区間 { br（地面なら null）, pts, tail（床へ寄せる前の終わりの点） }
    const close = () => {
      if (run && run.br && run.br.laneAt) easeIntoLane(run.pts);
      if (run && run.tail) run.pts.push(run.tail); // 床へ寄せた線を、地面の線の続きへつなぎ戻す
      if (run && run.pts.length > 1) (run.br ? onBridge : ground).push(run.pts);
      run = null;
    };
    for (let i = 0; i < xy.length - 1; i++) {
      const A = xy[i];
      const B = xy[i + 1];
      const at = (t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
      const latLngAt = (t) => {
        if (t <= 0) return line[i];
        if (t >= 1) return line[i + 1];
        const [lng, lat] = toLngLat(at(t));
        return [lat, lng];
      };
      // 橋の上の点 [lng, lat, 床の標高]。toDeck なら、中心線からの横のずれを床の内側（ふちから 0.4m）までに抑える。
      // 通り道（lane：階段の手すりのあいだ）があれば、そこへ寄せる
      const deckPoint = (br, t, raw = false) => {
        const q = at(t);
        const { s, lo, hi } = stripDistance(br.xy, br.cum, br.hwv || br.hw, q, br.cv || 0);
        if (!toDeck || raw) return [...toLngLat(q), br.deckAt(s)];
        const c = centerAt(br, s);
        const off = (q[0] - c.p[0]) * c.n[0] + (q[1] - c.p[1]) * c.n[1];
        // 床の内側（ふちから 0.4m）までに抑える。床がせまければまん中
        const free = (lo + 0.4 <= hi - 0.4 ? Math.max(lo + 0.4, Math.min(hi - 0.4, off)) : (lo + hi) / 2) - off;
        const o = br.laneAt ? br.laneAt(s) - off : free;
        const p = [...toLngLat([q[0] + c.n[0] * o, q[1] + c.n[1] * o]), br.deckAt(s)];
        if (br.laneAt) p.free = toLngLat([q[0] + c.n[0] * free, q[1] + c.n[1] * free]); // 通り道へ寄せる前の位置（両端でなめらかに寄せる）
        return p;
      };
      const moved = (a, b) => Math.hypot(...toXY(a).map((v, k) => v - toXY(b)[k])) > 0.3;
      const hits = [];
      for (const br of bridges) {
        if (!segBoxHit(br.box, A, B, side)) continue;
        for (const r of onBridgeRange(A, B, br, margin, side) || []) hits.push({ r, br });
      }
      // この線分を「地面」と「橋の上」の区間に分ける。重なった橋は、中心線にいちばん近いものにする
      const parts = [];
      let t = 0;
      for (const [t0, t1] of mergeRanges(hits.map((h) => h.r))) {
        if (t0 > t) parts.push([t, t0, null]);
        const tm = (t0 + t1) / 2;
        const mid = at(tm);
        const br = hits
          .filter((h) => h.r[0] <= tm && h.r[1] >= tm)
          .map((h) => h.br)
          .sort((a, b) => stripDistance(a.xy, a.cum, a.hwv || a.hw, mid, a.cv || 0).raw - stripDistance(b.xy, b.cum, b.hwv || b.hw, mid, b.cv || 0).raw)[0];
        parts.push([t0, t1, br]);
        t = t1;
      }
      if (t < 1) parts.push([t, 1, null]);
      for (const [ta, tb, br] of parts) {
        if (tb - ta < 1e-9) continue;
        if (!run || run.br !== br) {
          close();
          if (br) {
            // 床へ寄せたときは、地面の線の終わりの点から床の上へつなぐ
            const raw = deckPoint(br, ta, true);
            const p = deckPoint(br, ta);
            run = { br, pts: moved(raw, p) ? [raw, p] : [p] };
          } else run = { br, pts: [latLngAt(ta)] };
        }
        if (!br) {
          run.pts.push(latLngAt(tb));
          continue;
        }
        // 橋の上は 2m（階段は 0.5m）ごとに点を置き、それぞれに床の高さを付ける
        const len = (tb - ta) * Math.hypot(B[0] - A[0], B[1] - A[1]);
        const steps = Math.max(1, Math.ceil(len / (br.step || 2)));
        for (let k = 1; k <= steps; k++) run.pts.push(deckPoint(br, ta + ((tb - ta) * k) / steps));
        const raw = deckPoint(br, tb, true);
        run.tail = moved(raw, run.pts[run.pts.length - 1]) ? raw : null;
      }
    }
    close();
  }
  return { ground, onBridge };
}

function segBoxHit(b, A, B, pad = 0) {
  return !(Math.max(A[0], B[0]) < b[0] - pad || Math.min(A[0], B[0]) > b[2] + pad || Math.max(A[1], B[1]) < b[1] - pad || Math.min(A[1], B[1]) > b[3] + pad);
}

// ── 通り抜け：建物にあける穴の形（中心線を幅で太らせた多角形の集まり。平面の m 座標）──
export function passageFootprint(f) {
  const xy = f.coords.map(toXY);
  const hw = f.width / 2;
  const L = offsetLine(xy, hw);
  const R = offsetLine(xy, -hw);
  const polys = [];
  for (let i = 0; i < xy.length - 1; i++) polys.push([[L[i], L[i + 1], R[i + 1], R[i], L[i]]]);
  return polys;
}

// 通り抜けの線（平面の点）の両端が建物の中で、その先 max m 以内に建物の外があれば、外（＋0.5m）までのばす。
// 端が壁の少し手前で止まっていると、穴の奥が薄い壁でふさがってくぐれない。buildings は建物ごとの [外の輪, 中庭の輪...]（平面）
const inBuilding = (x, y, rings) => pointInRing(x, y, rings[0]) && !rings.slice(1).some((h) => pointInRing(x, y, h));
export function reachPassageEnds(xy, buildings, max = 4) {
  const out = xy.map((p) => [...p]);
  const reach = (i, j) => {
    const p = out[i];
    const L = Math.hypot(p[0] - out[j][0], p[1] - out[j][1]);
    if (L < 1e-6) return;
    const ux = (p[0] - out[j][0]) / L;
    const uy = (p[1] - out[j][1]) / L;
    const b = buildings.find((rings) => inBuilding(p[0], p[1], rings));
    if (!b) return;
    for (let t = 0.25; t <= max; t += 0.25) {
      if (!inBuilding(p[0] + ux * t, p[1] + uy * t, b)) {
        out[i] = [p[0] + ux * (t + 0.5), p[1] + uy * (t + 0.5)];
        return;
      }
    }
  };
  if (out.length > 1) {
    reach(out.length - 1, out.length - 2);
    reach(0, 1);
  }
  return out;
}

// 手で足した建物にあく口：くり抜きと、建物を通る通り抜け（地面から通り抜けの高さまでのくり抜きとして。passage: true）。
// 通り抜けは地図の建物にしか穴をあけない（campus3dBuildings.js）ので、置きかえた建物は形を描くときにここで同じ穴をあける
export function buildingOpenings(f, features) {
  const ring = (f.coords || []).map(toXY);
  const out = [...(f.carves || [])];
  if (ring.length < 3) return out;
  for (const p of features) {
    if (p.type !== "passage" || !(p.coords?.length > 1)) continue;
    const xy = p.coords.map(toXY);
    const L = cumulative(xy).at(-1);
    let crosses = false;
    for (let s = 0; s <= L && !crosses; s += 0.5) {
      const [x, y] = lerpPoint(xy, s);
      crosses = pointInRing(x, y, ring);
    }
    if (!crosses) continue;
    const coords = reachPassageEnds(xy, [[ring]]).map(toLngLat);
    for (const poly of passageFootprint({ ...p, coords })) {
      out.push({ coords: poly[0].slice(0, -1).map(toLngLat), bottom: 0, top: p.height, rail: false, passage: true });
    }
  }
  return out;
}
// 折れ線の上の距離 s の点
function lerpPoint(xy, s) {
  let rest = s;
  for (let i = 1; i < xy.length; i++) {
    const L = Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]);
    if (rest <= L || i === xy.length - 1) {
      const t = L ? Math.min(1, rest / L) : 0;
      return [xy[i - 1][0] + (xy[i][0] - xy[i - 1][0]) * t, xy[i - 1][1] + (xy[i][1] - xy[i - 1][1]) * t];
    }
    rest -= L;
  }
  return xy[0];
}

// ── OSM の候補を構造物にする ──
export function candidateToFeature(c) {
  const extra = { name: c.name || "", osm: c.osm };
  if (c.type === "bridge") Object.assign(extra, { width: c.width, surface: c.surface, z: c.z });
  if (c.type === "stairs") Object.assign(extra, { width: c.width });
  if (c.type === "passage") Object.assign(extra, { width: c.width, height: c.height });
  if (c.type === "wall") Object.assign(extra, { height: c.height });
  return createFeature(c.type, c.coords, extra);
}

// ── 建物（地図の建物の置きかえ）──
// 斜めに切る面（以前の slope・low の1面も）
export const buildingCuts = (f) => f.cuts || (f.slope ? [{ slope: f.slope, low: f.low ?? 0 }] : []);
// 屋根の高さ（地面から m）。面ごとに点1→点2の向きに low から height へ（外はそれぞれの高さのまま）、屋根はどの面よりも低いところ。
// cuts は面ごとの { A, B, L, u, low, t（点1で 0・点2で 1）, ramp（斜面の高さ。平面の式 [a, b, c]：a·x + b·y + c） }
// 線を回したとき（rotLow・rotHigh）は warped：「低」の線より外（sLo < 0）は low、「高」の線より外（sHi < 0）は height、あいだは
// 2本の線からの距離の比で low → height（ねじれた斜面。同じ高さの線は2本の線の交わる点 X から放射状に出る。線が近いところほど急）。
// 2本が平行なら平らな斜面（plane）。vl・vh は「低」「高」の線の向き、sectors は X からの扇（描くときに細かく分ける）
const WARP_N = 24;
export function buildingRoof(f) {
  const H = f.height;
  const cuts = buildingCuts(f).map((c) => {
    const A = toXY(c.slope[0]);
    const B = toXY(c.slope[1]);
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1;
    const u = [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
    const low = Math.min(c.low ?? 0, H);
    const k = (H - low) / L;
    const perp = [-u[1], u[0]];
    const rot = (d) => [perp[0] * Math.cos(d * DEG) - perp[1] * Math.sin(d * DEG), perp[0] * Math.sin(d * DEG) + perp[1] * Math.cos(d * DEG)];
    const vl = rot(c.rotLow || 0);
    const vh = rot(c.rotHigh || 0);
    const base = { A, B, L, u, low, vl, vh, t: (p) => ((p[0] - A[0]) * u[0] + (p[1] - A[1]) * u[1]) / L, ramp: [u[0] * k, u[1] * k, low - k * (A[0] * u[0] + A[1] * u[1])] };
    if (!c.rotLow && !c.rotHigh) return base;
    // 線から相手の側へ向く法線と、そちらへの距離
    const toward = (v, from, to) => { const n = [-v[1], v[0]]; return (to[0] - from[0]) * n[0] + (to[1] - from[1]) * n[1] >= 0 ? n : [-n[0], -n[1]]; };
    const nl = toward(vl, A, B);
    const nh = toward(vh, B, A);
    const sLo = (p) => (p[0] - A[0]) * nl[0] + (p[1] - A[1]) * nl[1];
    const sHi = (p) => (p[0] - B[0]) * nh[0] + (p[1] - B[1]) * nh[1];
    const value = (p) => {
      const lo = sLo(p);
      const hi = sHi(p);
      if (lo <= 0) return low;
      if (hi <= 0) return H;
      return low + ((H - low) * lo) / (lo + hi);
    };
    const cr = vl[0] * vh[1] - vl[1] * vh[0];
    if (Math.abs(cr) < 1e-6) {
      // 平行：あいだは平らな斜面
      const D = sLo(B) || 1;
      const k2 = (H - low) / D;
      return { ...base, warped: true, sLo, sHi, value, plane: [nl[0] * k2, nl[1] * k2, low - k2 * (A[0] * nl[0] + A[1] * nl[1])] };
    }
    // 2本の線の交わる点 X と、あいだ（sLo ≥ 0・sHi ≥ 0）の扇の両はしの向き（「低」の線の上と「高」の線の上）
    const tX = ((B[0] - A[0]) * vh[1] - (B[1] - A[1]) * vh[0]) / cr;
    const X = [A[0] + vl[0] * tX, A[1] + vl[1] * tX];
    const d1 = vl[0] * nh[0] + vl[1] * nh[1] >= 0 ? vl : [-vl[0], -vl[1]];
    const d2 = vh[0] * nl[0] + vh[1] * nl[1] >= 0 ? vh : [-vh[0], -vh[1]];
    const a1 = Math.atan2(d1[1], d1[0]);
    let da = Math.atan2(d2[1], d2[0]) - a1;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    const rays = Array.from({ length: WARP_N + 1 }, (_, i) => [Math.cos(a1 + (da * i) / WARP_N), Math.sin(a1 + (da * i) / WARP_N)]);
    const sg = da >= 0 ? 1 : -1;
    // 扇 i：ray i と ray i+1 のあいだ（X からの半平面2つ）
    // 扇 i の、まん中の向きの高さ（X そのものは高さが決まらないので、その扇の X にはこの高さを使う）
    const sectors = rays.slice(0, -1).map((r0, i) => {
      const r1 = rays[i + 1];
      const m = [r0[0] + r1[0], r0[1] + r1[1]];
      const ml = Math.hypot(m[0], m[1]) || 1;
      return { f1: (p) => sg * (r0[0] * (p[1] - X[1]) - r0[1] * (p[0] - X[0])), f2: (p) => sg * ((p[0] - X[0]) * r1[1] - (p[1] - X[1]) * r1[0]), hX: value([X[0] + m[0] / ml, X[1] + m[1] / ml]) };
    });
    return { ...base, warped: true, sLo, sHi, value, X, sectors };
  });
  const cutAt = (c, p) => (c.warped ? c.value(p) : c.low + (H - c.low) * Math.min(1, Math.max(0, c.t(p))));
  const smooth = (p) => cuts.reduce((h, c) => Math.min(h, cutAt(c, p)), H);
  // 段々の屋根（step）：高さを step m ごとにそろえる（四捨五入。いちばん高いところ H はそのまま）。hSmooth は段にする前の斜面
  const step = cuts.length && f.step > 0 ? f.step : 0;
  const level = (h) => (!step ? h : h >= H - 1e-6 ? H : Math.min(H, Math.round(Math.round(h / step) * step * 1000) / 1000));
  const shaped = step ? (p) => level(smooth(p)) : smooth;
  // 屋根の板があれば：その点の板のいちばん高い上面、なければ斜めの屋根から BOARD_BASE_DROP 下
  const bd = roofBoards(f);
  const hAt = !bd.list.length ? shaped : (p) => {
    const t = bd.topAt(p);
    return t != null ? t : Math.max(0, smooth(p) - BOARD_BASE_DROP);
  };
  return { H, cuts, sloped: cuts.length > 0, step, level, hSmooth: smooth, hAt, boards: bd };
}

// 屋根の板（平面の m に直したものと、2m の升目の索引）。同じ f には同じものを返す
export const BOARD_T = 0.25;
export const BOARD_BASE_DROP = 0.8;
const boardCache = new WeakMap();
export function roofBoards(f) {
  const hit = boardCache.get(f);
  if (hit) return hit;
  // 板の上面の平面 [a, b, c]（高さ = a·x + b·y + c）。tops があれば点を通る平面（最小二乗）、なければ水平
  const planeFit = (ring, tops) => {
    if (!tops) return null;
    let sx = 0, sy = 0, sz = 0;
    ring.forEach((p, i) => { sx += p[0]; sy += p[1]; sz += tops[i]; });
    const n = ring.length;
    const mx = sx / n, my = sy / n, mz = sz / n;
    let xx = 0, xy = 0, yy = 0, xz = 0, yz = 0;
    ring.forEach((p, i) => {
      const dx = p[0] - mx, dy = p[1] - my, dz = tops[i] - mz;
      xx += dx * dx; xy += dx * dy; yy += dy * dy; xz += dx * dz; yz += dy * dz;
    });
    const det = xx * yy - xy * xy;
    if (Math.abs(det) < 1e-9) return [0, 0, mz];
    const a = (xz * yy - yz * xy) / det;
    const b = (yz * xx - xz * xy) / det;
    return [a, b, mz - a * mx - b * my];
  };
  const list = (f.boards || []).map((b) => {
    const ring = b.coords.map(toXY);
    const fn = planeFit(ring, b.tops) || [0, 0, b.top];
    return { ring, top: b.top, fn, zAt: (p) => fn[0] * p[0] + fn[1] * p[1] + fn[2], kind: b.kind || "deck" };
  });
  const CELL = 2;
  const grid = new Map();
  list.forEach((b, i) => {
    const xs = b.ring.map((p) => p[0]);
    const ys = b.ring.map((p) => p[1]);
    b.box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    for (let gx = Math.floor(b.box[0] / CELL); gx <= Math.floor(b.box[2] / CELL); gx++) {
      for (let gy = Math.floor(b.box[1] / CELL); gy <= Math.floor(b.box[3] / CELL); gy++) {
        const k = `${gx},${gy}`;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(i);
      }
    }
  });
  // p にある板（上面がいちばん高いもの）。なければ null
  const at = (p) => {
    let best = null;
    let bz = -Infinity;
    for (const i of grid.get(`${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`) || []) {
      const b = list[i];
      if (p[0] < b.box[0] || p[0] > b.box[2] || p[1] < b.box[1] || p[1] > b.box[3]) continue;
      const z = b.zAt(p);
      if (z > bz && pointInRing(p[0], p[1], b.ring)) {
        best = b;
        bz = z;
      }
    }
    return best;
  };
  const out = { list, at, topAt: (p) => at(p)?.zAt(p) ?? null };
  boardCache.set(f, out);
  return out;
}

// 3点（xy と高さ）を通る平面の式 [a, b, c]
function planeOf(P) {
  const [p, q, r] = P;
  const d = (q[0] - p[0]) * (r[1] - p[1]) - (r[0] - p[0]) * (q[1] - p[1]);
  if (Math.abs(d) < 1e-12) return [0, 0, (p[2] + q[2] + r[2]) / 3];
  const a = ((q[2] - p[2]) * (r[1] - p[1]) - (r[2] - p[2]) * (q[1] - p[1])) / d;
  const b = ((q[0] - p[0]) * (r[2] - p[2]) - (r[0] - p[0]) * (q[2] - p[2])) / d;
  return [a, b, p[2] - a * p[0] - b * p[1]];
}
// 多角形を三角形に（凸でなくてもよいよう耳を切る。点は 3〜数十）
function triangulate(poly) {
  const pts = poly.slice();
  const ccw = ringArea(pts) > 0;
  const out = [];
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p, a, b, c) => { const s1 = cross(a, b, p), s2 = cross(b, c, p), s3 = cross(c, a, p); return ccw ? s1 > 1e-12 && s2 > 1e-12 && s3 > 1e-12 : s1 < -1e-12 && s2 < -1e-12 && s3 < -1e-12; };
  let guard = 0;
  while (pts.length > 3 && guard++ < 500) {
    let cut = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
      const cv = cross(a, b, c);
      if (ccw ? cv <= 1e-12 : cv >= -1e-12) continue;
      if (pts.some((p) => p !== a && p !== b && p !== c && inside(p, a, b, c))) continue;
      out.push([a, b, c]);
      pts.splice(i, 1);
      cut = true;
      break;
    }
    if (!cut) break;
  }
  if (pts.length === 3) out.push(pts);
  else for (let i = 1; i + 1 < pts.length; i++) out.push([pts[0], pts[i], pts[i + 1]]);
  return out;
}

// 屋根を平面ごとの多角形に分ける（どの面よりも低いところ）：[{ poly: xy の輪, fn: [a, b, c]（高さ = a·x + b·y + c） }]。
// 高さがほぼ 0 のところ（地面まで切れたところ）は除く。段々の屋根（step）なら段ごとの水平な多角形（fn は [0, 0, 段の高さ]、
// src は段にする前の斜面の式＝段の向き）。smooth なら段にする前の斜面のまま
export function roofPieces(f, ring, { smooth = false } = {}) {
  const r = buildingRoof(f);
  const val = (fn, p) => fn[0] * p[0] + fn[1] * p[1] + fn[2];
  const diff = (g, fn) => (p) => val(g, p) - val(fn, p); // >= 0 なら fn のほうが低い
  let pieces = [{ poly: ring, fn: [0, 0, r.H] }];
  for (const c of r.cuts) {
    const lowFn = [0, 0, c.low];
    const next = [];
    for (const pc of pieces) {
      // 線を回した面：「高」の線より外は効かない、「低」の線より外は low、あいだは（平行なら平らな斜面、でなければ扇ごとに
      // 三角形に分けて、頂点の高さを通る平面）といまの高さの低いほう
      if (c.warped) {
        const hiW = clipHalf(pc.poly, (p) => -c.sHi(p));
        if (hiW.length >= 3) next.push({ poly: hiW, fn: pc.fn });
        const between = clipHalf(clipHalf(pc.poly, c.sLo), c.sHi);
        const regions = [[clipHalf(pc.poly, (p) => -c.sLo(p)), lowFn]];
        if (between.length >= 3) {
          if (c.plane) regions.push([between, c.plane]);
          else {
            for (const { f1, f2, hX } of c.sectors) {
              const sec = clipHalf(clipHalf(between, f1), f2);
              if (sec.length < 3 || Math.abs(ringArea(sec)) < 1e-6) continue;
              const hv = (q) => (Math.hypot(q[0] - c.X[0], q[1] - c.X[1]) < 1e-4 ? hX : c.value(q));
              for (const tri of triangulate(sec)) regions.push([tri, planeOf(tri.map((q) => [q[0], q[1], hv(q)]))]);
            }
          }
        }
        for (const [poly, g] of regions) {
          if (poly.length < 3) continue;
          const keep = clipHalf(poly, diff(g, pc.fn));
          if (keep.length >= 3) next.push({ poly: keep, fn: pc.fn });
          const cut = clipHalf(poly, diff(pc.fn, g));
          if (cut.length >= 3) next.push({ poly: cut, fn: g });
        }
        continue;
      }
      // 面の高い側（点2より先）：この面は効かない
      const hi = clipHalf(pc.poly, (p) => c.t(p) - 1);
      if (hi.length >= 3) next.push({ poly: hi, fn: pc.fn });
      // 斜面（点1〜点2）と、低い側（点1より手前）：いまの高さとこの面の低いほう
      const mid = clipHalf(clipHalf(pc.poly, (p) => c.t(p)), (p) => 1 - c.t(p));
      const lo = clipHalf(pc.poly, (p) => -c.t(p));
      for (const [poly, g] of [[mid, c.ramp], [lo, lowFn]]) {
        if (poly.length < 3) continue;
        const keep = clipHalf(poly, diff(g, pc.fn));
        if (keep.length >= 3) next.push({ poly: keep, fn: pc.fn });
        const cut = clipHalf(poly, diff(pc.fn, g));
        if (cut.length >= 3) next.push({ poly: cut, fn: g });
      }
    }
    pieces = next.filter(({ poly }) => Math.abs(ringArea(poly)) > 1e-4);
  }
  return (r.step && !smooth ? stepPieces(pieces, r) : pieces).filter(({ poly, fn }) => poly.some((p) => val(fn, p) > 0.05));
}

// 段々の屋根：斜面の多角形を高さ (k ± 0.5)·step の線で切って、それぞれ水平な段（高さ level(k·step)）にする
function stepPieces(pieces, r) {
  const val = (fn, p) => fn[0] * p[0] + fn[1] * p[1] + fn[2];
  const out = [];
  for (const { poly, fn } of pieces) {
    const vs = poly.map((p) => val(fn, p));
    const lo = Math.min(...vs);
    const hi = Math.max(...vs);
    if (hi - lo < 1e-6) {
      out.push({ poly, fn: [0, 0, r.level(lo)], src: fn });
      continue;
    }
    const k0 = Math.round(lo / r.step);
    const k1 = Math.round(hi / r.step);
    for (let k = k0; k <= k1; k++) {
      let pg = poly;
      if (k > k0) pg = clipHalf(pg, (p) => val(fn, p) - (k - 0.5) * r.step);
      if (k < k1 && pg.length >= 3) pg = clipHalf(pg, (p) => (k + 0.5) * r.step - val(fn, p));
      if (pg.length < 3 || Math.abs(ringArea(pg)) < 1e-4) continue;
      out.push({ poly: pg, fn: [0, 0, r.level(k * r.step)], src: fn });
    }
  }
  return out;
}

// 段々の屋根の蹴上げ（段の境目の縦の面）：[{ a, b, lo, hi, n }]。a→b の線の上で、地面から lo m〜hi m、n は低い段の側への向き。
// 段の境目は斜面の高さ (k + 0.5)·step の線（斜面の多角形ごとにまっすぐ。となりの多角形とはつながる）
export function roofRisers(f, ring) {
  const r = buildingRoof(f);
  if (!r.step) return [];
  const val = (fn, p) => fn[0] * p[0] + fn[1] * p[1] + fn[2];
  const out = [];
  for (const { poly, fn } of roofPieces(f, ring, { smooth: true })) {
    const g = Math.hypot(fn[0], fn[1]);
    if (g < 1e-9) continue;
    const vs = poly.map((p) => val(fn, p));
    const lo = Math.min(...vs);
    const hi = Math.max(...vs);
    const n = [-fn[0] / g, -fn[1] / g];
    for (let k = Math.round(lo / r.step); (k + 0.5) * r.step < hi; k++) {
      const t = (k + 0.5) * r.step;
      if (t <= lo) continue;
      const zLo = r.level(k * r.step);
      const zHi = r.level((k + 1) * r.step);
      if (zHi - zLo < 1e-3) continue;
      const pg = clipHalf(poly, (p) => val(fn, p) - t);
      const on = (p) => Math.abs(val(fn, p) - t) < 1e-6;
      pg.forEach((a, i) => {
        const b = pg[(i + 1) % pg.length];
        if (on(a) && on(b) && Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-4) out.push({ a, b, lo: zLo, hi: zHi, n });
      });
    }
  }
  return out;
}

// 多角形 ring（xy）の、f(p) >= 0 のほうだけを残す（直線で切る。凹んだ形でも描くのに困らない程度に）
export function clipHalf(ring, f) {
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    const fp = f(p);
    const fq = f(q);
    if (fp >= 0) out.push(p);
    if ((fp >= 0) !== (fq >= 0)) {
      const k = fp / (fp - fq);
      out.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]);
    }
  }
  return out;
}

// ガラスの手すり（wall の glass）の足もとの高さ：点 p（平面 m）と、向き n（単位。線に直角）の両わき RAIL_REACH m の地面のうち
// いちばん高いもの（壁の高さは高いほうの地面から）。掘り下げた平地のふち（壁の上の面。下の地面は壁の厚さぶん掘ってある）に立つ手すりも、上の面に立つ
export function railGround(groundAt, p, n) {
  const g = [p, [p[0] + n[0] * RAIL_REACH, p[1] + n[1] * RAIL_REACH], [p[0] - n[0] * RAIL_REACH, p[1] - n[1] * RAIL_REACH]].map((q) => groundAt(toLngLat(q))).filter(Number.isFinite);
  return g.length ? Math.max(...g) : NaN;
}

// 看板（sign）の板の向き：o（板の前の面の左下の角。平面 m）と地面からの高さ z0、ex（板の幅の向き＝前から見て右。水平）、
// ey（板の上の向き：[水平のずれ, 上]。後ろへ倒すと水平のずれは奥へ）、en（前の面の外向き：[水平, 上]）、n（面の向きの水平の単位ベクトル）。
// 点は o + ex·x + n·(ey[0]·y + en[0]·d)、高さ z0 + ey[1]·y + en[1]·d（x は幅の向き、y は板の上の向き、d は面から外へ）
export function signFrame(f) {
  const p = toXY(f.coords[0]);
  const b = f.bearing * DEG;
  const n = [Math.sin(b), Math.cos(b)];
  const ex = [-n[1], n[0]]; // 面に向かって立つと右（面が北を向けば西）
  const t = (f.tilt || 0) * DEG;
  const ey = [-Math.sin(t), Math.cos(t)];
  const en = [Math.cos(t), Math.sin(t)];
  const o = [p[0] - (ex[0] * f.width) / 2, p[1] - (ex[1] * f.width) / 2];
  const at = (x, y, dd = 0) => {
    const h = ey[0] * y + en[0] * dd;
    return [[o[0] + ex[0] * x + n[0] * h, o[1] + ex[1] * x + n[1] * h], f.z + ey[1] * y + en[1] * dd];
  };
  return { o, z0: f.z, ex, ey, en, n, at };
}

// 立った板（建物の panels の 1 つ。V 字の柱など）を、地面の上の線に沿って step m ごとに切ったもの：
// [{ a, b（線の上の両端）, spans（その位置で板のある高さの区間。地面から m。多角形を縦の線で切った区間） }]。
// 立っていない板（法線が水平から 30 度より上を向く）は []
export function panelSlices(p, step = 0.25) {
  const P = p.coords.map(toXY);
  const Z = p.zs;
  const k = P.length;
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < k; i++) {
    const j = (i + 1) % k;
    nx += (P[i][1] - P[j][1]) * (Z[i] + Z[j]);
    ny += (Z[i] - Z[j]) * (P[i][0] + P[j][0]);
    nz += (P[i][0] - P[j][0]) * (P[i][1] + P[j][1]);
  }
  const nl = Math.hypot(nx, ny, nz);
  if (nl < 1e-9 || Math.abs(nz) / nl > 0.5) return [];
  const hl = Math.hypot(nx, ny);
  const e = [-ny / hl, nx / hl]; // 地面の上の線の向き（板の点はみなこの線の上）
  const u = P.map((q) => (q[0] - P[0][0]) * e[0] + (q[1] - P[0][1]) * e[1]);
  const [lo, hi] = [Math.min(...u), Math.max(...u)];
  const at = (s) => [P[0][0] + e[0] * s, P[0][1] + e[1] * s];
  const out = [];
  for (let s = lo; s < hi - 1e-6; s += step) {
    const s1 = Math.min(hi, s + step);
    const sm = (s + s1) / 2;
    const zs = [];
    for (let i = 0; i < k; i++) {
      const j = (i + 1) % k;
      if ((u[i] <= sm && sm < u[j]) || (u[j] <= sm && sm < u[i])) zs.push(Z[i] + ((Z[j] - Z[i]) * (sm - u[i])) / (u[j] - u[i]));
    }
    zs.sort((x, y) => x - y);
    const spans = [];
    for (let i = 0; i + 1 < zs.length; i += 2) spans.push([zs[i], zs[i + 1]]);
    if (spans.length) out.push({ a: at(s), b: at(s1), spans });
  }
  return out;
}

// 宙に浮いた建物（base）の下の面（地面から m）。keel があれば、keelSides の辺ごとの面（壁の下の端 base から中へ keel の傾きで下がる）の
// いちばん高いもの＝いちばん近い辺の面（船底の形）。ring は平面 m の形。浮いていなければ null。
// at(p)：その点の下の面の高さ、pieces：面ごとの多角形と面の式 fn（z = fn[0]·x + fn[1]·y + fn[2]）と、
// 船底の面ならその辺の番号 i（平らな下の面は i なし）
export function buildingSoffit(f, ring) {
  if (!(f.base > 0) || ring.length < 3) return null;
  const n = ring.length;
  const ccw = ringArea(ring) > 0;
  const planes = [];
  if (f.keel > 0) {
    ring.forEach((a, i) => {
      if (f.keelSides && f.keelSides[i] === false) return;
      const b = ring[(i + 1) % n];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 1e-6) return;
      const nin = ccw ? [-(b[1] - a[1]) / L, (b[0] - a[0]) / L] : [(b[1] - a[1]) / L, -(b[0] - a[0]) / L]; // 中向き
      const d0 = nin[0] * a[0] + nin[1] * a[1];
      planes.push({ i, fn: [-f.keel * nin[0], -f.keel * nin[1], f.base + f.keel * d0] });
    });
  }
  const val = (fn, p) => fn[0] * p[0] + fn[1] * p[1] + fn[2];
  if (!planes.length) return { at: () => f.base, pieces: [{ poly: ring, fn: [0, 0, f.base] }], planes: [] };
  const at = (p) => Math.max(...planes.map((pl) => val(pl.fn, p)));
  const pieces = planes.map((pl) => {
    let poly = ring;
    for (const o of planes) if (o !== pl && poly.length >= 3) poly = clipHalf(poly, (p) => val(pl.fn, p) - val(o.fn, p));
    return poly.length >= 3 && Math.abs(ringArea(poly)) > 1e-4 ? { poly, fn: pl.fn, i: pl.i } : null;
  }).filter(Boolean);
  return { at, pieces, planes };
}

// 屋根を斜めに切るときの、最初の2点：形のいちばん長い辺の向きに、端から端まで（点1の側が低い）
export function defaultSlope(coords) {
  const xy = coords.map(toXY);
  let best = null;
  xy.forEach((a, i) => {
    const b = xy[(i + 1) % xy.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!best || l > best.l) best = { l, u: [(b[0] - a[0]) / (l || 1), (b[1] - a[1]) / (l || 1)] };
  });
  const c = xy.reduce((m, p) => [m[0] + p[0] / xy.length, m[1] + p[1] / xy.length], [0, 0]);
  const pr = xy.map((p) => (p[0] - c[0]) * best.u[0] + (p[1] - c[1]) * best.u[1]);
  const lo = Math.min(...pr);
  const hi = Math.max(...pr);
  return [toLngLat([c[0] + best.u[0] * lo, c[1] + best.u[1] * lo]), toLngLat([c[0] + best.u[0] * hi, c[1] + best.u[1] * hi])];
}

// 置きかえる地図の建物（BASEMAP.buildings の番号）：中心 c（[緯度, 経度]）が、どれかの「建物」の形の中にあるもの。
// 返すのは 番号 → その建物を置きかえる「建物」
export function replacedBuildings(features, buildings) {
  const out = new Map();
  const blds = features.filter((f) => f.type === "building" && f.coords.length >= 3).map((f) => ({ f, ring: f.coords.map(toXY) }));
  if (!blds.length) return out;
  buildings.forEach((b, i) => {
    if (!b.c) return;
    const [x, y] = toXY([b.c[1], b.c[0]]);
    const hit = blds.find(({ ring }) => pointInRing(x, y, ring));
    if (hit) out.set(i, hit.f);
  });
  return out;
}

// 屋根を斜めに切る向き：低くなる向きの方位（度。北 0・東 90・南 180・西 270）
export function slopeAzimuth(f) {
  if (!f.slope) return null;
  const A = toXY(f.slope[0]);
  const B = toXY(f.slope[1]);
  return ((Math.atan2(A[0] - B[0], A[1] - B[1]) / DEG) + 360) % 360;
}
// 屋根の傾き（度）
export function slopePitch(f) {
  if (!f.slope) return null;
  const A = toXY(f.slope[0]);
  const B = toXY(f.slope[1]);
  return Math.atan2(f.height - (f.low ?? 0), Math.hypot(B[0] - A[0], B[1] - A[1])) / DEG;
}
// 低くなる向きを az 度にした2点。低い側（点1）は建物のいちばん低い側の端に置き、斜面の長さ（＝傾き）はそのまま。
// fit なら建物の端から端まで（点2が高い側の端）、len があればその長さ。f は面（slope・low）と建物（coords・height）を合わせたもの
export function aimSlope(f, az, fit = false, len = null) {
  const xy = f.coords.map(toXY);
  const u = [-Math.sin(az * DEG), -Math.cos(az * DEG)]; // 上る向き
  const c = xy.reduce((m, p) => [m[0] + p[0] / xy.length, m[1] + p[1] / xy.length], [0, 0]);
  const pr = xy.map((p) => (p[0] - c[0]) * u[0] + (p[1] - c[1]) * u[1]);
  const hi = Math.max(...pr);
  const lo = Math.min(...pr);
  const A = [c[0] + u[0] * lo, c[1] + u[1] * lo];
  let L = hi - lo;
  if (len != null) L = len;
  else if (!fit && f.slope) {
    const A0 = toXY(f.slope[0]);
    const B0 = toXY(f.slope[1]);
    L = Math.hypot(B0[0] - A0[0], B0[1] - A0[1]);
  }
  L = Math.max(0.5, L);
  return [toLngLat(A), toLngLat([A[0] + u[0] * L, A[1] + u[1] * L])];
}
// 傾きを deg 度にした2点：低い側（点1）と向きはそのまま、「高」の線（点2）を動かす（急にするほど斜面が短く、上の平らなところが広い）
export function pitchSlope(f, deg) {
  if (!f.slope) return f.slope;
  const A = toXY(f.slope[0]);
  const B = toXY(f.slope[1]);
  const L0 = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1;
  const u = [(B[0] - A[0]) / L0, (B[1] - A[1]) / L0];
  const dh = f.height - (f.low ?? 0);
  if (dh <= 0.01) return f.slope;
  const L = Math.max(0.5, dh / Math.tan(Math.min(89, Math.max(1, deg)) * DEG));
  return [f.slope[0], toLngLat([A[0] + u[0] * L, A[1] + u[1] * L])];
}
// 建物の向き az に沿った長さ（端から端まで）
export function extentAlong(coords, az) {
  const u = [Math.sin(az * DEG), Math.cos(az * DEG)];
  const pr = coords.map(toXY).map((p) => p[0] * u[0] + p[1] * u[1]);
  return Math.max(...pr) - Math.min(...pr);
}
// 建物の辺ごとの、外へ向く方位（度）と長さ：その辺へ向かって低くする（辺に沿って切る）ときの向き
export function edgeAzimuths(coords) {
  const xy = coords.map(toXY);
  const ccw = ringArea(xy) > 0;
  return xy.map((a, i) => {
    const b = xy[(i + 1) % xy.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const n = ccw ? [dy, -dx] : [-dy, dx]; // 外向き
    return { i, len: Math.hypot(dx, dy), az: ((Math.atan2(n[0], n[1]) / DEG) + 360) % 360 };
  });
}
// 方位（度）の名前（8方位）
export const azimuthName = (az) => ["北", "北東", "東", "南東", "南", "南西", "西", "北西"][Math.round(((az % 360) + 360) % 360 / 45) % 8];

// くり抜きを描いて足すときの高さ：2階の床（3.5m）から1階分。建物が低ければ1階から、上が近ければ上まで抜く
export function defaultCarve(f, coords) {
  const bottom = f.height > 4.5 ? 3.5 : 0;
  return { coords, bottom, top: bottom + 3.5 < f.height - 0.5 ? bottom + 3.5 : null, rail: bottom > 0 };
}
