// バーチャルキャンパスのゲームの一覧（docs/campus-royale-spec.md の 7.7 章）。ゲームを足すときはここに 1 行足す。
// title・desc は i18n の鍵、load はゲームのコードを後から読む（「みんなと歩く」だけの人に読ませない）
export const VC_GAMES = [
  { id: "royale", title: "roy.title", desc: "roy.desc", min: 2, max: 24, load: () => import("./campus3dRoyale.js") },
];
