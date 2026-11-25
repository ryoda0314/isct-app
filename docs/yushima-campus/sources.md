# 湯島キャンパスの外観と地理データ

大学公式図の湯島地区に対応するのは案内番号1〜15。病院D棟は北棟と南棟で高さも平面形も大きく異なるため、計16棟として収録した。神田川南岸の駿河台キャンパスは大学が別のキャンパスとして案内している。[大学の施設一覧・現行配置図](https://www.isct.ac.jp/ja/001/about/campuses-and-offices/yushima-and-surugadai)・[歯科棟南北を区別した旧大学の施設一覧](https://www.tmd.ac.jp/mim/access/)

## 棟別の対応

| 公式番号 | モデル | 外形・高さを合わせた資料 |
| --- | --- | --- |
| 1・3 | 1号館西・東 | OSMの各翼。PLATEAUは一体の建物。航空レーザーの主な屋根面は西が地上約34 m、東が約26 m。 |
| 2 | 2号館 | OSMの旧本館の外周。PLATEAU計測高19.1 m。屋上の大部分は地上約16 m。 |
| 4 | 7号館 | OSMの五角形の外周とPLATEAU計測高53.9 m。屋上設備を含む。 |
| 5 | D棟（北）・D棟（南） | PLATEAUの別棟の輪郭と高さ55.5 m・23.1 m。北棟の高層部の西側の後退を点群と照合。 |
| 6 | 10号館 | OSMの外周とPLATEAU計測高37.0 m。川に面した外壁上部の三つの作品は大学の見どころ案内に掲載。 |
| 7・8 | A棟・B棟 | PLATEAUで連続している外周を公式配置図で分割。高層部と低層部の境界を航空レーザーで確認した。A棟の屋上にはヘリポートがある。 |
| 9 | 3号館 | OSMの段差を持つ北西翼とPLATEAU計測高90.1 m。 |
| 10 | M&Dタワー | OSMの角を落とした外周、大学の地上26階・高さ約126 mの記録、点群の東側高屋根と中央の吹き抜け。 |
| 11・12 | 5号館・6号館 | OSMの個別の外周。PLATEAU計測高は29.6 mと16.4 m。 |
| 13・14 | 8号館南・8号館北 | OSMの個別の外周。PLATEAU計測高は36.3 mと26.4 m。 |
| 15 | C棟 | 2023年稼働の機能強化棟。OSMの外形を現行公式図で照合した。PLATEAU計測高42.6 m、大学の工事公告で地上9階。 |

PLATEAUの建物IDは `campus-sns/yushima/data.js` の `plateauId` に記録した。大学の資料ではA棟の高さを約76 m、歯科棟北を約55 mとしている。PLATEAUはA・B棟を一体として測り、屋上設備を含む最高高さを87.4 mとしている。階数や床レベル、屋上の突出部を区別するため、外観の段差は点群で別に照合した。[大学のキャンパスマスタープラン・冊子12ページ](https://www.tmd.ac.jp/files/topics/48709_ext_04_1.pdf)・[大学の屋外サイン取替工事公告](https://www.tmd.ac.jp/files/user/01_okujyosain.pdf)・[大学の主要施設・写真](https://admissions.isct.ac.jp/ja/001/student-life-and-careers/campus-intro/yushima-surugadai)

## 位置と標高

- 東経139.7645度、北緯35.7017度を原点とし、東方向をX、南方向をZとする単位メートルの局所座標を使用した。経度1度を90,499 m、緯度1度を110,952 mとしている。敷地はOSM way 52980054。建物のOSM IDはモデルデータに収録した。現在の公式図にある湯島門（正門）、本郷門、北門、聖門、お茶の水門、南門、西門、外堀門①・②を位置合わせした。南門・西門・外堀門の配置は、案内図と実際の道路の出合いからの推定を含む。[© OpenStreetMap contributors・ODbL 1.0](https://www.openstreetmap.org/copyright)・[公式配置図](https://www.isct.ac.jp/ja/001/about/campuses-and-offices/img/map-yushima-and-surugadai.svg)
- 国土交通省PLATEAU文京区2025年度版の建物属性と輪郭を使用した。配信タイルから建物ID、最高高さ、屋根・地面の輪郭を抽出した。湯島の主棟はLOD2の配信区域でも上端が一枚の水平面になるため、実際の塔屋や上層部の形は東京都の点群で調べた。[PLATEAU文京区](https://www.geospatial.jp/ckan/dataset/plateau-13105-bunkyo-ku-2025)・[文京区LOD2配信](https://api.plateauview.mlit.go.jp/datacatalog/3dtiles/13105-bldg-lod2-2025/tileset.json)・[PLATEAUの利用条件](https://www.mlit.go.jp/plateau/site-policy/)
- 東京都デジタルサービス局「東京都デジタルツイン実現プロジェクト 区部点群データ」（2024年公開、CC BY 4.0）を加工。1/500図郭の09LD1804と09LD0894を使用した。LAS 1.2形式、水平座標は平面直角座標系第IX系。2図郭の12,583,775点から、湯島の高さ比較用範囲にある点を1 m格子に集計した。地表を作る際はClass 2の地盤点を採用した。建物の高さの比較には全クラスの1 m格子内最高点を用いた。[東京都のデータカタログ](https://catalog.data.metro.tokyo.lg.jp/dataset/t000029d0000000024)・[公開時の測量説明](https://www.metro.tokyo.lg.jp/information/press/2024/10/2024103126)・[図郭09LD1804](https://gic-tokyo.s3.ap-northeast-1.amazonaws.com/2024/dig/lp/09LD1804.zip)・[図郭09LD0894](https://gic-tokyo.s3.ap-northeast-1.amazonaws.com/2024/dig/lp/09LD0894.zip)
- 表示用の地形は124 × 116点の5 m格子。14,384格子点のうち4,124点で十分な地盤点を確認した。各格子点の周囲4 × 4 mの中央値を使用した。建物の下や調査範囲外は国土地理院DEM5Aから補間し、その欠測部には同院の10 m DEMを使った。標高15 mが3D空間の高さ0。南側のお茶の水門は標高約15.6 m、本郷門は約20.6 m。[国土地理院の標高タイル仕様](https://maps.gsi.go.jp/development/ichiran.html#dem)

## 見どころと再現精度

大学の外から構内を見たときの街並みには、御茶ノ水・湯島周辺の建物外周2,193件と道路323件を使用した。周辺392棟は中心点・輪郭の重なりから文京区のPLATEAU建物と照合した。ほかはOSMの建物高または階数を使い、どちらもない場合は用途・外形から高さを推定した。背景の窓割りと色は概略。湯島聖堂の大成殿・回廊・門は別の形状とし、深い軒と緑色の屋根を立体化した。[OpenStreetMap](https://www.openstreetmap.org/copyright)・[大学による湯島聖堂の写真](https://www.tmd.ac.jp/artis-cms/cms-files/20190709-164523-4365.pdf)

屋上庭園の位置、梅の花形の植栽、C棟の地下鉄接続、病院A棟のヘリポートは大学が紹介している。10号館上部の三つの壁画レリーフと立体駐車場上の庭園の日時計は、2025年の大学の展示案内にある。病院入口や門からの実際の案内は大学のバリアフリーマップに示されている。[大学の施設紹介](https://admissions.isct.ac.jp/ja/001/student-life-and-careers/campus-intro/yushima-surugadai)・[大学の展示案内・2ページ](https://www.isct.ac.jp/plugins/cms/component_download_file.php?key=ae4faab33a2d10f01fe1e243103e1260.pdf&pageId=6193&type=1)・[大学のバリアフリーマップ](https://www.tmd.ac.jp/campuslife/handicapped/bfm/)

写真は外形・材質・見え方の比較に使用した。窓・庇・設備の寸法、写真に写らない側の立面、植栽の個体位置、門の幅、建物同士の接続部に推定を含む。飛行計測時の点群と公開図の更新日は一致しない。現地での測量・通行条件の調査は行っていない。
