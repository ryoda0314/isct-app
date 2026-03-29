import { useState } from "react";
import { T } from "../theme.js";

const SECTIONS = [
  {
    title: "1. 本アプリについて",
    body: `ScienceTokyo App（以下「本アプリ」）は、東京科学大学の学生が大学生活をより便利にするためのキャンパスSNSアプリです。本アプリを利用するにあたり、以下のプライバシーポリシーに同意いただく必要があります。`,
  },
  {
    title: "2. 収集する個人情報",
    body: `本アプリでは、以下の個人情報を収集・利用します。

【認証情報】
・Science Tokyo ID（ISCTアカウント）
・ISCTパスワード（AES-256-GCMで暗号化して保存）
・TOTP認証シークレット
・Titech Portal アカウント・パスワード（暗号化して保存）
・マトリクス認証情報

【プロフィール情報】
・氏名（Moodleから取得）
・学籍番号・学年・学部/学院
・アバター画像・表示色

【位置情報】
・キャンパス内の現在地（任意設定・オプトイン方式）

【利用データ】
・投稿・コメント・リアクション
・ダイレクトメッセージ
・友達関係情報
・イベント出欠情報
・すれ違い通信で交換されるカード情報`,
  },
  {
    title: "3. 利用目的",
    body: `収集した個人情報は、以下の目的のためにのみ利用します。

・LMS（Moodle）からの時間割・課題・成績の自動取得
・教務Webポータルからの成績情報取得
・キャンパスSNS機能の提供（投稿、チャット、DM）
・友達機能・すれ違い通信機能の提供
・イベント管理・出欠機能の提供
・位置情報共有機能の提供（ユーザーがオンにした場合のみ）
・通知機能の提供
・アプリの改善・不具合修正`,
  },
  {
    title: "4. 第三者提供",
    body: `本アプリでは、以下の外部サービスにデータを送信します。

【Supabase（データベース・リアルタイム通信）】
・プロフィール情報、投稿、メッセージ、友達関係、位置情報プレゼンス

【東京科学大学 Moodle / 教務Webポータル】
・認証情報（暗号化された状態で送信し、LMSデータ取得に使用）

【OpenAI（マトリクスカード画像読み取り・任意機能）】
・マトリクスカードの写真をAI（OpenAI API）に送信し、文字を読み取ります
・この機能は任意であり、送信前に明示的な同意確認を行います
・同意しない場合は手入力で代替できます
・OpenAI API経由のデータはAIモデルの学習には使用されません（OpenAI APIデータ利用ポリシーに準拠）
・画像はリアルタイム処理のみに使用され、本アプリのサーバーには保存されません

上記以外の第三者への個人情報の提供は、法令に基づく場合を除き、ユーザーの同意なく行いません。`,
  },
  {
    title: "5. データの保管と安全管理",
    body: `・パスワード等の認証情報はAES-256-GCMで暗号化して保管します
・通信はHTTPS（TLS）で暗号化されます
・ブラウザのlocalStorageに保存される情報は、設定・表示の最適化目的に限定されます
・サーバー上のデータへのアクセスは認証済みユーザーに制限されます`,
  },
  {
    title: "6. ユーザーの権利",
    body: `ユーザーは、個人情報保護法に基づき以下の権利を有します。

【開示請求】
プロフィール画面の「データエクスポート」機能から、保有する個人データをJSON形式でダウンロードできます。

【削除請求】
プロフィール画面の「アカウント削除」から、サーバー上の全データを削除できます。認証情報のみの削除も可能です。

【利用停止】
いつでもログアウトまたはアカウント削除が可能です。

【訂正】
プロフィール画面からアバター・表示名を変更できます。`,
  },
  {
    title: "7. 位置情報について",
    body: `キャンパス内の現在地共有は完全にオプトイン（任意）です。

・位置情報は「非公開」がデフォルトです
・ユーザーが明示的に場所を選択した場合のみ、友達に共有されます
・すれ違い通信機能も、位置を設定した場合にのみ動作します
・位置情報はリアルタイムのプレゼンス情報としてのみ使用され、履歴は保存されません`,
  },
  {
    title: "8. Cookie・ローカルストレージ",
    body: `本アプリでは、以下の目的でブラウザのローカルストレージを使用します。

・テーマ・フォントサイズ等の表示設定
・通知設定
・キャッシュ（天気情報など）

これらはプロフィール画面の「キャッシュをクリア」から削除できます。トラッキング目的のCookieは使用しません。`,
  },
  {
    title: "9. データ保持期間",
    body: `・投稿・メッセージ: アカウント削除時まで保持
・認証情報: ユーザーが削除するか、アカウント削除時まで保持
・ローカルストレージ: ユーザーがキャッシュクリアまたはブラウザデータ消去するまで保持
・位置情報プレゼンス: リアルタイムのみ（ログアウト・アプリ終了で消去）`,
  },
  {
    title: "10. 未成年者の利用",
    body: `本アプリは東京科学大学の学生を対象としています。18歳未満の方が利用する場合は、保護者の同意を得た上でご利用ください。`,
  },
  {
    title: "11. 電気通信事業法に基づく事項",
    body: `本アプリは、電気通信事業法に基づく届出電気通信事業者が提供するサービスです。

【通信の秘密の保護】
電気通信事業法第4条に基づき、ダイレクトメッセージ・チャット等の通信内容について秘密を保護します。運営者は、法令に基づく場合を除き、通信の内容を第三者に開示しません。

【外部送信規律（令和4年改正法対応）】
本アプリでは、以下のとおり利用者の端末から外部に情報を送信しています。

・Supabase: データベース・リアルタイム通信のため、投稿・メッセージ・プレゼンス情報を送信
・Vercel: アプリケーションのホスティングのため、アクセスログ（IPアドレス等）を送信
・OpenAI: マトリクスカード画像読み取り機能の利用時のみ、ユーザーの明示的な同意を得た上でカード画像を送信（任意機能）

トラッキング目的の第三者Cookieや広告トラッカーは使用していません。`,
  },
  {
    title: "12. ポリシーの変更",
    body: `本ポリシーは、法令の変更やアプリの機能追加に伴い更新される場合があります。重要な変更がある場合は、アプリ内で通知します。`,
  },
  {
    title: "13. お問い合わせ",
    body: `個人情報の取り扱いに関するお問い合わせは、アプリ内のフィードバック機能またはプロフィール画面からご連絡ください。`,
  },
];

export const PrivacyPolicyView = ({ mob, onBack, embedded }) => {
  const [expandedIdx, setExpandedIdx] = useState(null);

  const content = (
    <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
      <div style={{
        padding: mob ? "20px 18px 40px" : "32px 40px 48px",
        maxWidth: 640, margin: "0 auto", boxSizing: "border-box",
      }}>
        {!embedded && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: `${T.accent}14`, display: "flex",
                alignItems: "center", justifyContent: "center",
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: T.txH }}>プライバシーポリシー</h2>
                <p style={{ margin: 0, fontSize: 12, color: T.txD }}>最終更新: 2026年3月22日</p>
              </div>
            </div>
            <div style={{
              padding: "10px 14px", borderRadius: 10, marginBottom: 20,
              background: `${T.accent}08`, border: `1px solid ${T.accent}20`,
              fontSize: 13, color: T.tx, lineHeight: 1.7,
            }}>
              本アプリは個人情報保護法に基づき、ユーザーの個人情報を適切に管理します。
            </div>
          </>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {SECTIONS.map((s, i) => {
            const open = expandedIdx === i;
            return (
              <div key={i} style={{
                borderRadius: 10, border: `1px solid ${T.bd}`,
                background: T.bg2, overflow: "hidden",
              }}>
                <button
                  onClick={() => setExpandedIdx(open ? null : i)}
                  style={{
                    width: "100%", padding: "12px 14px",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: "transparent", border: "none",
                    cursor: "pointer", color: T.txH, fontSize: 14, fontWeight: 600,
                    textAlign: "left",
                  }}
                >
                  <span>{s.title}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.txD}
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s", flexShrink: 0 }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                {open && (
                  <div style={{
                    padding: "0 14px 14px", fontSize: 13,
                    color: T.tx, lineHeight: 1.8, whiteSpace: "pre-wrap",
                    borderTop: `1px solid ${T.bd}`,
                    paddingTop: 12,
                  }}>
                    {s.body}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return content;
};
