import { cancelRender, continueRender, delayRender, staticFile } from 'remotion';

// Noto Sans JP（可変フォント・OFL）を同梱して読み込む。
// システムフォント頼みだと環境によって字形やウェイトが変わるため。
// 9.6MB あるので、並列レンダリングで CPU が混むと既定の 30 秒を超えることがある。
// まれに1つのタブで読み込みが止まったまま進まなくなるので、fetch に時間制限を付けて取り直す。
const URL = staticFile('fonts/NotoSansJP-VF.ttf');
const ATTEMPTS = 4;
const FETCH_TIMEOUT = 30000;

const fetchFont = async () => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(URL, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`${URL}: HTTP ${res.status}`);
    return await res.arrayBuffer();
  } finally {
    clearTimeout(timer);
  }
};

const load = async () => {
  for (let attempt = 1; ; attempt++) {
    try {
      const face = new FontFace('Noto Sans JP', await fetchFont(), { weight: '100 900' });
      await face.load();
      document.fonts.add(face);
      return;
    } catch (err) {
      if (attempt >= ATTEMPTS) throw err;
    }
  }
};

const handle = delayRender('Noto Sans JP を読み込み中', { timeoutInMilliseconds: 180000, retries: 2 });
load()
  .then(() => continueRender(handle))
  .catch((err) => cancelRender(err));
