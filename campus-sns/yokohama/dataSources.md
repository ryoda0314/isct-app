# 横浜キャンパスの地図データ

2026年11月25日に東京科学大学の[横浜キャンパス案内図](https://www.isct.ac.jp/ja/001/about/campuses-and-offices/yokohama)と[地区別アクセシビリティマップ](https://www.ssc.titech.ac.jp/amap/home/suzukakedai/)を照合した。公式の索引35項目を収録し、B1・B2、H1・H2、R3高層・低層を個別の形状として扱う。J2・J3は各階で連結している。案内番号29に対応する一体のモデルとした。

## 水平位置と建物高さ

- `data.js` の原点は北緯35.513度、東経139.484度。東をXの正方向、南をZの正方向とする局所メートル座標。経度には緯度の余弦を掛けた。小数第1位は共有頂点を保存するための丸め精度である。
- 棟・駅舎の平面形状、道路、階段、橋、両池、テニスコート、運動場、駐車場、森の一部は[© OpenStreetMap contributors](https://www.openstreetmap.org/copyright) の該当区画に基づく。OSM由来データは[ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)で提供される。建物の `osmId` と、`osm-` に続く数字はway ID。徒歩案内の範囲は本敷地（way 107769850）と駅・長津田門に続く歩道まで。
- 高さは[国土交通省 Project PLATEAU 横浜市・2024年度](https://www.geospatial.jp/ckan/dataset/plateau-14100-yokohama-shi-2024)の[緑区LOD1](https://api.plateauview.mlit.go.jp/datacatalog/3dtiles/14113-bldg-lod1-texture-2024/tileset.json)の建物属性と照合した。各棟の `plateauId` は配布データの `uro:buildingID` に対応する。R3の2翼にはLOD1形状を個別に使用。原典の高さは点群から求めた最高高さなどを含み、屋上各部の高さを区別しない。[PLATEAUの利用条件](https://www.mlit.go.jp/plateau/site-policy/)に基づく加工で、立体表示に写真や配布テクスチャは使っていない。
- J2・J3は建築資料の軒高を採用した。B1の高さは一体で計測されたB1・B2に対する両翼の階数比から推定した。R2-Eは公式図を手がかりに小規模な付属棟に対応づけた。棟同定と高さに不確実性があり、PLATEAU原典には実測高がない。駅舎等の小さな付属施設にも高さの推定を含む。
- 階数は大学の地区別案内に基づく。窓や庇を含む外観資料は各棟の調査記録を参照。

## 地上から見える外観と地形

- すずかけホールの上下二段のガラス面、J2・J3棟の妻面の筋交い、すずかけ台図書館の二列の丸窓を、大学が公開する外観写真と照合した。各棟と資料の対応は `buildingsSurvey.js` に収録している。J2・J3棟では設計資料の軒高85.32 mと最高高さ90.87 mを区別した。[大学の施設紹介](https://admissions.isct.ac.jp/ja/001/student-life-and-careers/campus-intro/yokohama)・[日本免震構造協会の建築資料](https://www.jssi.or.jp/bussiness/shuppan_detail/kaishiback/49-menshinshokai-tokodaisuzukake.pdf)
- 地表は国土地理院のDEM5Aを5 m格子に再標本化した。表示、植栽、歩行判定で同じ三角形の地盤を参照し、橋・階段・トンネルでは通路の高さを重ねる。敷地内の樹木は樹林帯や道路との位置関係に基づいて配置した。窓や設備の寸法、写真で確認できない面、植栽の個体位置には推定を含む。[国土地理院の標高タイル](https://maps.gsi.go.jp/development/ichiran.html#dem)
- すずかけホールでは、芝生から2階のレストランへ入れる地盤の高さ、曲面ガラスの段差、外周の白い帯、赤い庇とテラス席を照合した。H2棟の講堂は坂に沿う壁で囲み、H1棟との渡り廊下をガラス張りにした。芝の勾配と席の配置は写真からの復元。[大学会館の各階図と玄関写真](https://www.ssc.titech.ac.jp/amap/home/suzukakedai/h/h1h2bldgs/)・[設計者の竣工写真](https://www.kyoikushisetsu.co.jp/cms/wp-content/uploads/2020/03/2r-14.jpg)
- J2・J3棟のホール側には坂の上に2階の正面玄関、坂の下に1階の搬入口がある。B地区の駐車場側は3階の玄関に接続する。両玄関の庇、自動ドア、舗装、手すりと妻面の開放廊下を造形した。入口高と勾配は階別図・標高と整合するよう推定した。駐車区画と車は撮影時の景観を参考にした固定モデル。[小林研究室の道案内](https://www.sa.comp.isct.ac.jp/ja/access)・[J2・J3棟の外観・玄関写真](https://www.ssc.titech.ac.jp/amap/home/suzukakedai/j/j2-j3bldg/)

## 徒歩経路と屋外施設

- 道の縦断勾配は5 m格子の標高と、交差点・橋のたもと・各棟の入口高から補間した。路肩付近は地面を1 m間隔で分割し、舗装の下へつなげている。駅前広場、図書館の斜路、会館前の段床では各モデルの舗装面を歩行にも用いる。細かな勾配、縁石の高さ、階段の蹴上げは推定値。
- 道路中心線を同じ高さで接続する。国道246号は歩行者用のすずかけ門アプローチを橋桁でまたぐ。国道の車道を徒歩グラフから除いた。[大学のすずかけ門からの案内](https://www.titech.ac.jp/news/2014/028051)
- 駅前階段、門を入った先のR地区の階段、G2棟入口の階段を区別する。長津田門への外周歩道を収録した。階段回避は収録した階段の有無で判定する。経路の幅、縦断勾配、出入口の開放時間の現地調査は実施していない。S3棟の案内は北西のスロープから玄関1へ、J2・J3棟の案内はホール側の坂から2階玄関へ到着する。その他の棟の着地点は構内通路上に置いた。
- 図書館では北西端のピロティ、南西面の玄関1・2、斜路と踊り場、南東の階段と金属スクリーン、車道沿いの二段植栽を外観写真と1階平面図に合わせた。玄関位置や手すり・植え込みの寸法は写真からの推定。[S3棟の玄関・スロープ写真と平面図](https://www.ssc.titech.ac.jp/amap/home/suzukakedai/s/s3bldg/)
- `source: "district-plan"` の歩行者経路、広場、植生帯は、大学の[地区図](https://www.ssc.titech.ac.jp/amap/home/suzukakedai/)を周囲の棟と道路に位置合わせした概略形状。G地区には[保存緑地を抜けるトンネル](https://www.ssc.titech.ac.jp/amap/home/suzukakedai/g/)と、G4棟下の通路（OSM way 698427430）がある。前者の坑口位置と幅は推定。
- すずかけ池は大学会館と図書館の間の水域。2026年夏の作業写真から、浅い水路、浮草、まとまって生えるアシ、木杭で押さえた畦と石積みを造形した。水位、水路の細かな蛇行、草木の位置は地形に合わせた推定。中央広場の円形段床はキャンパスマスタープラン2016の既設配置図（冊子40ページ）をH1棟に位置合わせした。段高・目地は外観からの推定。[横浜キャンパスの環境整備](https://www.szc.titech.ac.jp/news/fireflyfund/)・[整備を担当した教員による現地写真](https://note.com/yanabo/n/nd870dd913768)・[大学の既設配置図](https://www.sisetu.titech.ac.jp/sisetu/03kikaku_keikaku/03campus_plan/temp/cmp2016.pdf#page=46)
- 中央広場を下段からH1棟に向かって見ると、木製の踊り場と円弧状の客席の右に、木が生えた土と芝の斜面が続く。2017年のすずかけ祭の写真と反対側から撮影した大学の写真に合わせ、石畳の範囲を上段の園路までとした。板幅、斜面の勾配と個々の樹木の位置は推定。[未来産業技術研究所 FIRST NEWS No.02・冊子8頁](https://www.first.iir.isct.ac.jp/news/uploads/FIRSTNEWS02.pdf#page=9)・[大学が掲載したウッドデッキの写真](https://www.titech.ac.jp/news/img/n000331_10.jpg)
- すずかけ門は進行方向右手の銘板とコンクリート壁、左手の生垣を照合した。国道246号の橋桁を抜ける歩道には舗装目地、誘導ブロック、ステンレスの車止めが続く。[大学の門の写真](https://www.ssc.titech.ac.jp/amap/wp-content/uploads/2023/02/suzukakegate-6.jpg)・[橋を抜けた歩道の写真](https://www.ssc.titech.ac.jp/amap/wp-content/uploads/2023/02/suzukakegate-7.jpg)・[駅からの写真入り道案内](https://solid-state-chemistry.jp/pdf/suzukake_access_detail.pdf)
- 橋を抜けた先の花壇に大隅良典碑、末松安晴・伊賀健一碑、古賀逸策碑が並ぶ。相対的な並び、銘板の傾き、花壇背後のバラを写真と照合した。個々の碑の絶対座標は概略。[大学の記念碑設置記録](https://www.isct.ac.jp/ja/news/xeagavluy0ns)・[横浜キャンパスの紹介](https://admissions.isct.ac.jp/ja/001/student-life-and-careers/campus-intro/yokohama)

## キャンパスの外から見える街並み

`dataNeighbourhood.js` は周囲150 mの建物輪郭134件と道路61区間を収録する。駅から門へ至る南つくし野・長津田町の街並み、農地や樹林に沿う道路を景観として表示する。45棟にはOSMの高さ・階数またはPLATEAUの位置・外形に対応する建物高を用いた。残り89棟は地図上の用途と建物の面積から高さを推定した。屋根の傾斜・色は概略。周囲の木816本はOSMの森林・低木・公園の範囲に地形に沿って配置し、既知の建物と道を避けた。個々の樹木を測量した点群ではない。原典は上記のOpenStreetMapとPLATEAU緑区LOD1。
