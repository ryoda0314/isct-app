export const metadata = {
  title: "サポート | ScienceTokyo App",
  description: "ScienceTokyo App のサポート・お問い合わせ",
};

const SECTIONS = [
  {
    title: "ScienceTokyo App について",
    body: `ScienceTokyo App は、東京科学大学（旧 東京工業大学・東京医科歯科大学）の学生向けキャンパスSNSアプリです。時間割・課題の自動取得、キャンパスSNS、友達の居場所共有、キャンパスナビなどの機能を提供しています。`,
  },
  {
    title: "よくある質問",
    items: [
      {
        q: "ログインできません",
        a: "Science Tokyo ID（ISCTアカウント）と Moodle のパスワードでログインしてください。パスワードを忘れた場合は大学の情報基盤課にお問い合わせください。",
      },
      {
        q: "時間割や課題が表示されません",
        a: "プロフィール画面の下部にある「データを再取得」をタップしてください。大学の LMS（Moodle）がメンテナンス中の場合は、しばらく時間をおいて再度お試しください。",
      },
      {
        q: "パスコードを忘れました",
        a: "パスコード入力画面で5回間違えると「ログアウト」ボタンが表示されます。ログアウト後に再度ログインしてください。パスコードはリセットされます。",
      },
      {
        q: "アカウントを削除したい",
        a: "プロフィール画面の最下部にある「アカウント削除」から、サーバー上の全データを削除できます。",
      },
      {
        q: "位置情報が共有されているか不安です",
        a: "位置情報共有はデフォルトで「非公開」です。ユーザーが明示的に場所を選択した場合のみ友達に共有されます。履歴は保存されません。",
      },
    ],
  },
  {
    title: "対応環境",
    body: `・iOS 15.0 以降（iPhone / iPad）
・Android（対応予定）
・Web ブラウザ（Chrome / Safari / Firefox / Edge 最新版）`,
  },
  {
    title: "お問い合わせ",
    body: `アプリに関するご質問・不具合報告・ご要望は、以下の方法でご連絡ください。

・アプリ内のプロフィール画面 →「フィードバック」
・メール: sciencetokyo.app@gmail.com

原則として3営業日以内に返信いたします。`,
  },
  {
    title: "運営",
    body: `ScienceTokyo App は東京科学大学の学生が開発・運営しています。

プライバシーポリシーは下記をご覧ください。
https://sciencetokyo.app/privacy`,
  },
];

export default function SupportPage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#f8f9fa",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      <div style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: "40px 20px 60px",
      }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
          サポート
        </h1>
        <p style={{ fontSize: 14, color: "#666", marginTop: 0, marginBottom: 32 }}>
          ScienceTokyo App
        </p>

        {SECTIONS.map((s, i) => (
          <section key={i} style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
              {s.title}
            </h2>
            {s.body && (
              <p style={{
                fontSize: 14, lineHeight: 1.8, color: "#333",
                whiteSpace: "pre-wrap", margin: 0,
              }}>
                {s.body}
              </p>
            )}
            {s.items && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {s.items.map((item, j) => (
                  <div key={j} style={{
                    background: "#fff",
                    borderRadius: 12,
                    padding: "16px 18px",
                    border: "1px solid #e8e8e8",
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#111", marginBottom: 6 }}>
                      Q. {item.q}
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.7, color: "#444" }}>
                      {item.a}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
