import { useState } from "react";
import { T } from "../theme.js";

const SECTIONS = [
  {
    title: "第1条（サービスの概要）",
    body: `ScienceTokyo App（以下「本サービス」）は、東京科学大学の学生が大学生活をより便利にするためのキャンパスSNSアプリです。本サービスは個人が運営する電気通信事業（届出番号は本ページ下部に記載）として提供されます。

本サービスは以下の機能を提供します。
・LMS（Moodle）連携による時間割・課題・成績の自動取得
・コース別タイムライン・チャット
・ダイレクトメッセージ（DM）・グループチャット
・友達・すれ違い通信機能
・キャンパス内位置情報共有
・サークル機能
・イベント管理・学年暦
・ポモドーロタイマー
・キャンパスナビゲーション`,
  },
  {
    title: "第2条（電気通信事業者としての表記）",
    body: `本サービスは、電気通信事業法（昭和59年法律第86号）に基づく届出電気通信事業者が提供するサービスです。

【届出情報】
・届出年月日: （届出後に記載）
・届出先: 関東総合通信局
・提供する電気通信役務: インターネット上のメッセージ媒介サービス（DM・チャット）

本サービスは電気通信事業法に定める通信の秘密の保護その他の義務を遵守します。`,
  },
  {
    title: "第3条（利用資格）",
    body: `本サービスを利用できるのは、以下の条件を満たす方に限ります。

・東京科学大学の在学生であること
・有効なISCT（Science Tokyo）アカウントを保有していること
・本利用規約およびプライバシーポリシーに同意していること

18歳未満の方が利用する場合は、保護者の同意を得た上でご利用ください。`,
  },
  {
    title: "第4条（通信の秘密）",
    body: `運営者は、電気通信事業法第4条に基づき、本サービスを通じて取り扱う通信の秘密を保護します。

・ダイレクトメッセージ、チャット、グループチャット等のメッセージ内容を、正当な理由なく閲覧・漏洩・窃用しません
・法令に基づく場合を除き、通信の秘密に該当する情報を第三者に開示しません
・通信の秘密の保護のため、適切な技術的・組織的安全管理措置を講じます`,
  },
  {
    title: "第5条（禁止事項）",
    body: `利用者は、本サービスの利用にあたり、以下の行為を行ってはなりません。

・法令または公序良俗に反する行為
・他の利用者への嫌がらせ、誹謗中傷、脅迫行為
・他人になりすます行為
・本サービスのサーバーやネットワークに過度な負荷をかける行為
・本サービスの運営を妨害する行為
・他の利用者の個人情報を不正に収集・利用する行為
・営利目的の広告・宣伝活動（運営者の許可なく行うもの）
・本サービスのリバースエンジニアリング・不正アクセス
・その他、運営者が不適切と判断する行為`,
  },
  {
    title: "第6条（アカウントの管理）",
    body: `・利用者は、自己のアカウント情報を適切に管理する責任を負います
・アカウントの第三者への貸与・譲渡は禁止します
・アカウントの不正利用が判明した場合は、速やかに運営者に連絡してください
・運営者は、利用規約に違反した利用者のアカウントを停止または削除できます`,
  },
  {
    title: "第7条（サービスの変更・中断・終了）",
    body: `・運営者は、事前の通知なくサービスの内容を変更できます
・システム保守、障害対応、その他やむを得ない事由により、サービスを一時的に中断する場合があります
・運営者は、30日前の通知をもってサービスを終了できます
・サービス終了時は、利用者がデータをエクスポートできる期間を設けます`,
  },
  {
    title: "第8条（免責事項）",
    body: `・本サービスは「現状有姿」で提供され、特定目的への適合性を保証しません
・LMS等の外部サービスの仕様変更・障害により、一部機能が利用できなくなる場合があります
・利用者間のトラブルについて、運営者は仲裁義務を負いません
・天災、サーバー障害等の不可抗力によるサービス中断について、運営者は責任を負いません
・本サービスの利用により生じた損害について、運営者の故意または重過失がある場合を除き、責任を負いません`,
  },
  {
    title: "第9条（投稿コンテンツ）",
    body: `・利用者が投稿したコンテンツの著作権は、原則として利用者に帰属します
・運営者は、サービスの提供・改善に必要な範囲で、投稿コンテンツを利用できます
・違法・不適切な投稿は、運営者の判断で削除できます`,
  },
  {
    title: "第10条（規約の変更）",
    body: `・運営者は、必要に応じて本規約を変更できます
・重要な変更がある場合は、アプリ内で事前に通知します
・変更後もサービスの利用を継続した場合、変更後の規約に同意したものとみなします`,
  },
  {
    title: "第11条（準拠法・管轄裁判所）",
    body: `・本規約は日本法に準拠します
・本サービスに関する紛争は、東京地方裁判所を第一審の専属的合意管轄裁判所とします`,
  },
  {
    title: "第12条（お問い合わせ）",
    body: `本規約に関するお問い合わせは、アプリ内のフィードバック機能またはプロフィール画面からご連絡ください。`,
  },
];

export const TermsOfServiceView = ({ mob, embedded }) => {
  const [expandedIdx, setExpandedIdx] = useState(null);

  return (
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
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: T.txH }}>利用規約</h2>
                <p style={{ margin: 0, fontSize: 12, color: T.txD }}>最終更新: 2026年3月22日</p>
              </div>
            </div>
            <div style={{
              padding: "10px 14px", borderRadius: 10, marginBottom: 20,
              background: `${T.accent}08`, border: `1px solid ${T.accent}20`,
              fontSize: 13, color: T.tx, lineHeight: 1.7,
            }}>
              本サービスを利用する前に、以下の利用規約をよくお読みください。本サービスの利用をもって、本規約に同意したものとみなします。
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
};
