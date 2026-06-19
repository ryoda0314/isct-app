立ち絵PNGの置き場所
====================

ここに、ずんだもん／四国めたんの立ち絵PNG（背景透過）を置きます。
口パクさせるには「口閉じ」「口開き」の2枚があると理想。1枚でも動きます（揺れのみ）。

推奨ファイル名（この名前なら設定例そのまま使えます）:
  zunda_close.png   ずんだもん 口閉じ
  zunda_open.png    ずんだもん 口開き
  metan_close.png   四国めたん 口閉じ
  metan_open.png    四国めたん 口開き

置いたら src/PromoVideo.jsx の ASSETS を編集:
  const ASSETS = {
    zundamon: { closed: 'assets/zunda_close.png', open: 'assets/zunda_open.png' },
    metan:    { closed: 'assets/metan_close.png', open: 'assets/metan_open.png' },
  };

形式: PNG / 背景透過 / 縦長（全身 or バストアップ）。高さは CHAR_HEIGHT(px) で調整。

入手先（いずれも規約を確認のうえ使用・クレジット必須）:
  - 東北ずん子・ずんだもん公式サイト  https://zunko.jp/  （イラスト素材／ガイドライン）
  - VOICEVOX 公式キャラクター素材    https://voicevox.hiroshiba.jp/
  - 坂本アヒル氏などの配布立ち絵（YMM4界隈で定番。口パーツ分けPSDもある）

注意: 口パーツが別レイヤーのPSD立ち絵を使う場合は、
      口閉じ／口開きの2枚をPNGで書き出してここに置けばOK。
