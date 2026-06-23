export const metadata = {
  title: "機能紹介 | ScienceTokyo App",
  description:
    "ScienceTokyo App の主な機能。時間割・課題の自動取得、キャンパスSNS、DM、友達の居場所共有、キャンパスナビ、すれ違い通信、イベント、音楽プレイヤーなど、東京科学大学の学生生活を便利にする機能を紹介します。",
};

/* ─── Palette (既存 install/support ページに準拠) ─── */
const ACCENT = "#28c868";
const BG = "#f8f9fa";
const TXH = "#0e2030";
const TX = "#3a5870";

/* ─── Inline SVG icons (stroke = currentColor) ─── */
const ico = (paths) => () =>
  (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths}
    </svg>
  );

const CalendarIcon = ico(
  <>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </>
);
const ChartIcon = ico(
  <>
    <line x1="4" y1="20" x2="4" y2="10" />
    <line x1="10" y1="20" x2="10" y2="4" />
    <line x1="16" y1="20" x2="16" y2="14" />
    <line x1="20" y1="20" x2="20" y2="8" />
  </>
);
const ChatIcon = ico(
  <>
    <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z" />
  </>
);
const MailIcon = ico(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <polyline points="3 7 12 13 21 7" />
  </>
);
const PinIcon = ico(
  <>
    <path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </>
);
const NavIcon = ico(<polygon points="3 11 22 2 13 21 11 13 3 11" />);
const CardsIcon = ico(
  <>
    <rect x="2" y="6" width="14" height="11" rx="2" />
    <path d="M8 6V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
  </>
);
const EventIcon = ico(
  <>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <path d="M9 16l2 2 4-4" />
  </>
);
const MusicIcon = ico(
  <>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </>
);
const TrainIcon = ico(
  <>
    <rect x="4" y="3" width="16" height="14" rx="3" />
    <line x1="4" y1="11" x2="20" y2="11" />
    <circle cx="8.5" cy="14" r="0.5" fill="currentColor" />
    <circle cx="15.5" cy="14" r="0.5" fill="currentColor" />
    <path d="M7 20l-2 2" />
    <path d="M17 20l2 2" />
  </>
);
const StarIcon = ico(
  <polygon points="12 2 15.1 8.6 22 9.5 17 14.4 18.2 21.5 12 18.1 5.8 21.5 7 14.4 2 9.5 8.9 8.6 12 2" />
);
const LockIcon = ico(
  <>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </>
);

/* ─── 厳選した主要機能 ─── */
const FEATURES = [
  {
    Icon: CalendarIcon,
    title: "時間割・課題管理",
    desc: "大学公式LMS（Moodle）と連携し、時間割・課題を自動取得。締切が近い課題はアプリを閉じていても通知でお知らせします。",
  },
  {
    Icon: ChartIcon,
    title: "成績・出欠",
    desc: "成績をいつでも確認。講義ごとの出欠もアプリで記録・管理できます。",
  },
  {
    Icon: ChatIcon,
    title: "キャンパスSNS",
    desc: "学内限定のタイムライン。投稿・コメント・リアクションで、同じ大学の仲間とゆるくつながれます。",
  },
  {
    Icon: MailIcon,
    title: "DM・グループチャット",
    desc: "友達と1対1のダイレクトメッセージや、グループでのチャット。スタンプにも対応しています。",
  },
  {
    Icon: PinIcon,
    title: "友達の居場所共有",
    desc: "キャンパス内で友達がどこにいるかをリアルタイムで共有。空きコマの合流や待ち合わせに便利です（完全オプトイン）。",
  },
  {
    Icon: NavIcon,
    title: "キャンパスナビ",
    desc: "学内のスポットを検索して、マップ上でナビゲーション。初めてのキャンパスでも迷いません。",
  },
  {
    Icon: CardsIcon,
    title: "すれ違い通信",
    desc: "同じ場所にいる人とプロフィールカードを自動で交換。新しい出会いのきっかけに。",
  },
  {
    Icon: EventIcon,
    title: "イベント・サークル",
    desc: "学内イベントの作成・参加・出欠管理や、サークル活動の情報共有ができます。",
  },
  {
    Icon: MusicIcon,
    title: "Science Tokyo Music",
    desc: "学内の楽曲を集めた音楽プレイヤー。歌詞表示やバックグラウンド再生に対応しています。",
  },
  {
    Icon: TrainIcon,
    title: "電車・ジム混雑",
    desc: "最寄り駅の発車時刻や、学内ジムの混雑状況をひと目でチェックできます。",
  },
  {
    Icon: StarIcon,
    title: "ツバメポイント",
    desc: "毎日のログインや活動でポイントが貯まり、ランキングやレベルで成長を実感できます。",
  },
  {
    Icon: LockIcon,
    title: "安心のセキュリティ",
    desc: "パスコードロック・Face ID / 指紋認証に対応。大切な学業データをしっかり守ります。",
  },
];

export default function FeaturesPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: BG,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        color: TX,
      }}
    >
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "56px 20px 72px" }}>
        {/* ─── Hero ─── */}
        <header style={{ textAlign: "center", marginBottom: 48 }}>
          <img
            src="/icons/icon-192x192.png"
            alt="ScienceTokyo App"
            width={72}
            height={72}
            style={{
              borderRadius: 18,
              boxShadow: "0 6px 24px rgba(40,200,104,0.28)",
            }}
          />
          <h1
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: TXH,
              margin: "18px 0 8px",
            }}
          >
            ScienceTokyo App の機能
          </h1>
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.7,
              color: TX,
              maxWidth: 520,
              margin: "0 auto",
            }}
          >
            東京科学大学の学生のためのキャンパスSNS。
            <br />
            学業からキャンパスライフまで、毎日をもっと便利に。
          </p>
        </header>

        {/* ─── Feature grid ─── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 16,
          }}
        >
          {FEATURES.map(({ Icon, title, desc }) => (
            <div
              key={title}
              style={{
                background: "#fff",
                border: "1px solid #e3ebf2",
                borderRadius: 16,
                padding: "20px 20px 22px",
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(40,200,104,0.12)",
                  color: ACCENT,
                  marginBottom: 14,
                }}
              >
                <Icon />
              </div>
              <h2
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: TXH,
                  margin: "0 0 6px",
                }}
              >
                {title}
              </h2>
              <p style={{ fontSize: 13.5, lineHeight: 1.7, color: TX, margin: 0 }}>
                {desc}
              </p>
            </div>
          ))}
        </div>

        {/* ─── CTA ─── */}
        <div style={{ textAlign: "center", marginTop: 48 }}>
          <a
            href="/install"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "14px 36px",
              background: ACCENT,
              color: "#fff",
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 600,
              textDecoration: "none",
              boxShadow: "0 6px 20px rgba(40,200,104,0.3)",
            }}
          >
            アプリをはじめる
          </a>
          <p style={{ fontSize: 12.5, color: TX, marginTop: 14, marginBottom: 0 }}>
            ※ ご利用には東京科学大学（旧 東京工業大学・東京医科歯科大学）の学生アカウントが必要です。
          </p>
        </div>

        {/* ─── Footer links ─── */}
        <footer
          style={{
            marginTop: 56,
            paddingTop: 24,
            borderTop: "1px solid #e3ebf2",
            textAlign: "center",
            fontSize: 13,
          }}
        >
          <a href="/support" style={{ color: ACCENT, textDecoration: "none", margin: "0 12px" }}>
            サポート
          </a>
          <a href="/privacy" style={{ color: ACCENT, textDecoration: "none", margin: "0 12px" }}>
            プライバシーポリシー
          </a>
          <p style={{ color: "#9bb0c2", marginTop: 16, marginBottom: 0 }}>
            ScienceTokyo App — 東京科学大学の学生が開発・運営
          </p>
        </footer>
      </div>
    </div>
  );
}
