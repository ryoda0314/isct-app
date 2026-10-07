import { cancelRender, continueRender, delayRender, staticFile } from 'remotion';

// Noto Sans JP（可変フォント・OFL）を同梱して読み込む。
// システムフォント頼みだと環境によって字形やウェイトが変わるため。
// 9.6MB あるので、並列レンダリングで CPU が混むと既定の 30 秒を超えることがある
const handle = delayRender('Noto Sans JP を読み込み中', { timeoutInMilliseconds: 180000 });
const face = new FontFace(
  'Noto Sans JP',
  `url('${staticFile('fonts/NotoSansJP-VF.ttf')}') format('truetype')`,
  { weight: '100 900' },
);
face
  .load()
  .then((f) => {
    document.fonts.add(f);
    continueRender(handle);
  })
  .catch((err) => cancelRender(err));
