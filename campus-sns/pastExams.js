// 過去問: 学生有志の非公式サイト ScienceTokyoExam（https://sciencetokyoexam.com）の科目ページを開く。
//
// いまはリンクだけ（API は使わない・データはこのアプリを通らない）。向こうの API でアプリ内に一覧を出すには
// 運営者の許可が要る（Firebase の Google ログインに、このアプリの OAuth クライアントを許可してもらう等）。
// 科目ページの URL は向こうのルーティング（/course/:subjectCode、枝番なしの科目コード）。
// ログインは大学の Google アカウント（@m.isct.ac.jp）で、Google はアプリ内の WebView でのログインを拒否するので、
// ネイティブではシステムのブラウザ（SafariVC / Custom Tabs）で開く。
import { isNative } from "./capacitor.js";
import { openInSystemBrowser } from "./openMaterial.js";
import { t } from "./i18n.js";

const SITE = "https://sciencetokyoexam.com";
const NOTICE_KEY = "pastExamNoticeSeen";

/** 科目コード（LAL.C203-04 のような枝番付きでもよい）→ ScienceTokyoExam の科目ページ */
export function pastExamUrl(code) {
  const base = String(code || "").trim().replace(/-\d+$/, "");
  return base ? `${SITE}/course/${encodeURIComponent(base)}` : `${SITE}/`;
}

/** 科目の過去問ページを開く。初めてのときだけ、非公式サイトであることと規約の要点を知らせる */
export function openPastExams(code) {
  let seen = false;
  try { seen = localStorage.getItem(NOTICE_KEY) === "1"; } catch {}
  if (!seen) {
    if (!window.confirm(t("pastExam.notice"))) return;
    try { localStorage.setItem(NOTICE_KEY, "1"); } catch {}
  }
  const url = pastExamUrl(code);
  if (isNative()) openInSystemBrowser(url);
  else window.open(url, "_blank", "noopener");
}
