export const metadata = {
  title: "アカウント削除 | ScienceTokyo App",
  description:
    "ScienceTokyo App のアカウントおよび関連データの削除方法・削除されるデータ・保持期間についてのご案内です。",
};

const SECTIONS = [
  {
    title: "対象アプリ",
    body: `ScienceTokyo App（提供: ScienceTokyo App 運営チーム / 東京科学大学の学生が開発・運営）
パッケージ名: ac.isct.campus

本ページは、ユーザーがアカウントおよび関連データの削除をリクエストするための公式案内です。`,
  },
  {
    title: "アプリ内から削除する（推奨）",
    body: `1. ScienceTokyo App を開きます。
2. 画面下部のタブから「プロフィール」を開きます。
3. プロフィール画面を最下部までスクロールします。
4. 「アカウント削除」をタップします。
5. 確認ダイアログ（2回）で内容を確認し、削除を実行します。

実行すると、サーバー上のアカウントと関連データがすべて削除され、自動的にログアウトされます。この操作は取り消せません。`,
  },
  {
    title: "アプリを利用できない場合（メールでの削除リクエスト）",
    body: `アプリにアクセスできない場合は、以下のメールアドレス宛に「アカウント削除希望」と明記してご連絡ください。

・メール: admin@sciencetokyo.app
（予備: sciencetokyo.app@gmail.com）

本人確認のため、登録に使用した Science Tokyo ID（学籍番号）またはアプリに登録したメールアドレスをご記載ください。本人確認のうえ、原則7日以内にアカウントと関連データを削除します。`,
  },
  {
    title: "削除されるデータ",
    body: `アカウント削除により、サーバー上の以下のデータがすべて削除されます。

・プロフィール情報（表示名、アバター、学部・学科などの属性）
・投稿、コメント、リアクション（いいね等）
・ダイレクトメッセージ（DM）および送受信したスタンプ
・友達・フォロー等のつながり情報
・保存した認証情報（ポータル／ISCT のログイン情報、TOTP 等）
・アプリ内でアップロードした画像等のコンテンツ`,
  },
  {
    title: "保持されるデータ・保持期間",
    body: `・投稿・メッセージ: アカウント削除時に削除されます。
・認証情報: ユーザーによる個別削除、またはアカウント削除時に削除されます。
・端末内のローカルデータ（キャッシュ等）: アプリのアンインストール、またはプロフィール画面の「キャッシュをクリア」で削除されます。
・バックアップ: 障害復旧用バックアップに含まれる場合がありますが、削除リクエストから最大30日以内に消去されます。
・法令上の保存義務がある記録（電気通信事業法等に基づくものを含む）が存在する場合は、その法定保存期間に限り保持し、期間経過後に削除します。`,
  },
  {
    title: "一部データのみの削除",
    body: `アカウントを削除せずに、一部のデータのみを削除することもできます。

・認証情報のみの削除: プロフィール画面の認証情報セクションから削除できます。
・個別の投稿・メッセージの削除: 各投稿・メッセージのメニューから削除できます。`,
  },
  {
    title: "お問い合わせ",
    body: `本件に関するお問い合わせは admin@sciencetokyo.app までご連絡ください。
プライバシーポリシー: https://sciencetokyo.app/privacy`,
  },
];

export default function AccountDeletionPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8f9fa",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px 20px 60px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
          アカウント削除のご案内
        </h1>
        <p style={{ fontSize: 14, color: "#666", marginTop: 0, marginBottom: 32 }}>
          ScienceTokyo App
        </p>

        {SECTIONS.map((s, i) => (
          <section key={i} style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
              {s.title}
            </h2>
            <p
              style={{
                fontSize: 14,
                lineHeight: 1.8,
                color: "#333",
                whiteSpace: "pre-wrap",
                margin: 0,
              }}
            >
              {s.body}
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}
