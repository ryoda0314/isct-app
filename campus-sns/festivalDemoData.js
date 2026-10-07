// 工大祭 出店・展示のテストデータ（デモモード専用）。
// 本番DBには入らない。名前・団体名・画像のすべてに「テスト」と分かる印を付けている。

// ポスター風のサンプル画像（SVG）。右上に TEST の帯、左下に「サンプル画像」と入れる。
const poster = ({ bg, fg = "#fff", accent, title, sub, price }) => {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const F = "'Hiragino Sans','Yu Gothic','Noto Sans JP',sans-serif";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760">
  <rect width="1200" height="760" fill="${bg}"/>
  <circle cx="1060" cy="680" r="280" fill="${accent}" opacity=".3"/>
  <circle cx="120" cy="60" r="170" fill="${accent}" opacity=".2"/>
  <rect x="490" y="108" width="220" height="64" rx="8" fill="#111"/>
  <text x="600" y="153" text-anchor="middle" font-family="sans-serif" font-size="36" font-weight="900" fill="#ffd400" letter-spacing="6">TEST</text>
  <text x="600" y="345" text-anchor="middle" font-family="${F}" font-size="110" font-weight="900" fill="${fg}">${esc(title)}</text>
  <text x="600" y="430" text-anchor="middle" font-family="${F}" font-size="44" font-weight="700" fill="${fg}" opacity=".85">${esc(sub)}</text>
  ${price ? `<rect x="${600 - (price.length * 52 + 64) / 2}" y="480" rx="14" width="${price.length * 52 + 64}" height="92" fill="${fg}"/><text x="600" y="544" text-anchor="middle" font-family="${F}" font-size="54" font-weight="800" fill="${bg}">${esc(price)}</text>` : ""}
  <text x="600" y="640" text-anchor="middle" font-family="sans-serif" font-size="28" font-weight="700" fill="${fg}" opacity=".55">サンプル画像 / SAMPLE IMAGE</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const NOTE = "\n\n※これはテスト用のダミーデータです。実在の出店ではありません。";

export const DEMO_FESTIVAL_BOOTHS = [
  {
    id: "test-1", isMine: true, category: "food", name: "【テスト】ソース焼きそば屋", org: "テスト団体A（料理サークル）",
    coupon: { title: "【テスト】50円引き", detail: "ソース焼きそば1皿につき1回。他の割引との併用不可。", limit: 100, used: 37, myUsedAt: null },
    description: "特製ソースの焼きそばを鉄板で焼きます。\n・ソース焼きそば 400円\n・目玉焼きのせ +100円" + NOTE,
    building: "main", location: "正面玄関前 3番テント", hours: "両日 10:00–16:00（売り切れ次第終了）",
    link: "https://example.com", likeCount: 42, liked: true,
    imageUrl: poster({ bg: "#c2410c", accent: "#fbbf24", title: "ソース焼きそば", sub: "本館 正面玄関前 3番テント", price: "400円" }),
  },
  {
    id: "test-2", category: "exhibit", name: "【テスト】ロボット展示・デモ走行", org: "テスト研究室B",
    description: "自作の自律移動ロボットを展示します。1時間ごとにデモ走行あり。\n研究内容の質問も歓迎です。" + NOTE,
    building: "w5", location: "1階 エントランス", hours: "両日 10:00–17:00 / デモ走行は毎時0分",
    link: null, likeCount: 31, liked: false,
    imageUrl: poster({ bg: "#1e3a8a", accent: "#60a5fa", title: "ロボット展示", sub: "毎時0分 デモ走行" }),
  },
  {
    id: "test-3", category: "drink", name: "【テスト】タピオカミルクティー", org: "テスト団体C",
    coupon: { title: "【テスト】トッピング1つ無料", detail: "黒糖タピオカ・ナタデココから1つ。", limit: null, used: 12, myUsedAt: null },
    description: "黒糖タピオカのミルクティーです。\n・ミルクティー 350円\n・抹茶ラテ 400円" + NOTE,
    building: "", location: "芝生広場 7番テント", hours: "両日 11:00–15:00",
    link: "https://example.com", likeCount: 27, liked: false,
    imageUrl: poster({ bg: "#3f2a1d", accent: "#d6a46b", title: "タピオカ", sub: "芝生広場 7番テント", price: "350円〜" }),
  },
  {
    id: "test-4", category: "stage", name: "【テスト】軽音ライブ", org: "テスト団体D（軽音部）",
    description: "野外ステージでバンド演奏をします。コピーとオリジナル曲。" + NOTE,
    building: "", location: "野外ステージ", hours: "10/10(土) 13:00–14:00",
    link: "https://example.com", likeCount: 18, liked: false,
    imageUrl: poster({ bg: "#111827", accent: "#ec4899", title: "LIVE", sub: "10/10 13:00 野外ステージ" }),
  },
  {
    id: "test-5", category: "game", name: "【テスト】射的・スーパーボールすくい", org: "テスト団体E",
    description: "小さなお子さんも楽しめる縁日コーナーです。1回 200円。" + NOTE,
    building: "s3", location: "1階 ロビー", hours: "両日 10:00–16:00",
    link: null, likeCount: 12, liked: false,
    imageUrl: null,
  },
  {
    id: "test-6", category: "goods", name: "【テスト】オリジナル缶バッジ販売", org: "テスト団体F（イラスト研究会）",
    coupon: { title: "【テスト】2個目半額", detail: "先着30名。", limit: 30, used: 30, myUsedAt: null },
    description: "部員が描いたイラストの缶バッジとポストカードを販売します。" + NOTE,
    building: "w9", location: "2階 W921教室", hours: "両日 10:00–17:00",
    link: "https://example.com", likeCount: 9, liked: false,
    imageUrl: poster({ bg: "#7c3aed", accent: "#f0abfc", title: "缶バッジ", sub: "W921教室", price: "1個 300円" }),
  },
  {
    id: "test-7", category: "food", name: "【テスト】チュロス", org: "テスト団体G",
    coupon: { title: "【テスト】シナモン増量", detail: "注文時に画面を見せてください。", limit: 50, used: 21, myUsedAt: new Date(Date.now() - 25 * 60e3).toISOString() },
    description: "揚げたてのチュロスです。シナモン・チョコの2種類。" + NOTE,
    building: "", location: "正門付近 2番テント", hours: "両日 10:30–16:00",
    link: null, likeCount: 6, liked: false,
    imageUrl: null,
  },
  {
    id: "test-8", category: "other", name: "【テスト】受験生向け 学生相談ブース", org: "テスト団体H",
    description: "在学生が大学生活や受験勉強について質問に答えます。" + NOTE,
    building: "main", location: "1階 ロビー", hours: "両日 10:00–15:00",
    link: null, likeCount: 4, liked: false,
    imageUrl: null,
  },
].map((b, i) => ({ coupon: null, ...b, ownerId: 900000 + i, createdAt: new Date(Date.now() - i * 3600e3).toISOString() }));

// 自分の申請のテストデータ（審査中・却下の表示例）
export const DEMO_FESTIVAL_APPS = [
  { id: "test-app-1", status: "pending", boothId: null, name: "【テスト】フランクフルト", createdAt: new Date(Date.now() - 2 * 3600e3).toISOString() },
  { id: "test-app-2", status: "rejected", boothId: null, name: "【テスト】クレープ", rejectReason: "写真が出店の内容と関係ないため（テスト）", createdAt: new Date(Date.now() - 26 * 3600e3).toISOString() },
];
