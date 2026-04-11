// デモモード用テストデータ
// スキップボタンからデモモードに入ると表示される

const now = new Date();
const d = (days, h = 23, m = 59) => {
  const t = new Date(now);
  t.setDate(t.getDate() + days);
  t.setHours(h, m, 0, 0);
  return t;
};

// ── コース ──
const DEMO_COURSES = [
  { id: "mc_101", moodleId: 101, code: "CSC.T243", name: "データ構造とアルゴリズム", per: "月3-4", room: "W6-31", col: "#a855c7", mem: 95, quarter: 2, building: "w6", bldg: "西6号館" },
  { id: "mc_102", moodleId: 102, code: "MCS.T223", name: "線形代数学第二", per: "火1-2", room: "W5-21", col: "#6375f0", mem: 180, quarter: 2, building: "w5", bldg: "西5号館" },
  { id: "mc_103", moodleId: 103, code: "CSC.T253", name: "論理と形式言語", per: "火5-6", room: "S2-203", col: "#e5534b", mem: 85, quarter: 2, building: "s2", bldg: "南2号館" },
  { id: "mc_104", moodleId: 104, code: "LAS.A101", name: "英語第二 S", per: "水1-2", room: "W9-31", col: "#3dae72", mem: 30, quarter: 2, building: "w9", bldg: "西9号館" },
  { id: "mc_105", moodleId: 105, code: "CSC.T273", name: "計算機科学実験第一", per: "水5-8", room: "S3-115", col: "#d4843e", mem: 42, quarter: 2, building: "s3", bldg: "南3号館" },
  { id: "mc_106", moodleId: 106, code: "MCS.T213", name: "確率と統計", per: "木3-4", room: "W5-21", col: "#2d9d8f", mem: 160, quarter: 2, building: "w5", bldg: "西5号館" },
  { id: "mc_107", moodleId: 107, code: "CSC.T263", name: "コンピュータアーキテクチャ", per: "金1-2", room: "W6-31", col: "#c678dd", mem: 90, quarter: 2, building: "w6", bldg: "西6号館" },
  { id: "mc_108", moodleId: 108, code: "LAS.C103", name: "東工大立志プロジェクト", per: "金5-6", room: "WL1-301", col: "#c75d8e", mem: 200, quarter: 2, building: "wl1", bldg: "西講義棟1" },
];

// ── 時間割 (5限×5日) ──
function buildDemoTT(courses) {
  const DAY = { '月': 0, '火': 1, '水': 2, '木': 3, '金': 4 };
  const grid = Array.from({ length: 5 }, () => Array(5).fill(null));
  for (const c of courses) {
    if (!c.per) continue;
    const m = c.per.match(/([月火水木金])(\d+)[–\-](\d+)/);
    if (!m) continue;
    const di = DAY[m[1]], rs = Math.floor((parseInt(m[2]) - 1) / 2), re = Math.floor((parseInt(m[3]) - 1) / 2);
    for (let r = rs; r <= re; r++) if (di >= 0 && r < 5) grid[r][di] = c;
  }
  return grid;
}

// NOTE: 全クォーターの qdata は buildDemoDataForPersona() で動的生成される
// この定数は後方互換用（直接参照している箇所向け）
const DEMO_QDATA = {
  2: { C: DEMO_COURSES, TT: buildDemoTT(DEMO_COURSES) }
};

// ── 課題 ──
const DEMO_ASGN = [
  { id: "da_1", moodleId: 201, cid: "mc_101", title: "第3回レポート: ソートアルゴリズムの比較", desc: "クイックソート・マージソート・ヒープソートの計算量を比較し、実験結果とともにレポートを提出せよ。", due: d(2), type: "assignment", st: "not_started", pri: 2, subs: [] },
  { id: "da_2", moodleId: 202, cid: "mc_101", title: "演習4: 二分探索木の実装", desc: "二分探索木の挿入・検索・削除を実装し、テストケースとともに提出。", due: d(5), type: "assignment", st: "in_progress", pri: 1, subs: [{ id: "s1", t: "挿入の実装", d: true }, { id: "s2", t: "検索の実装", d: true }, { id: "s3", t: "削除の実装", d: false }] },
  { id: "da_3", moodleId: 203, cid: "mc_102", title: "線形代数 問題セット5", desc: "固有値・固有ベクトルに関する演習問題。", due: d(3), type: "assignment", st: "not_started", pri: 1, subs: [] },
  { id: "da_4", moodleId: 204, cid: "mc_103", title: "論理回路 中間レポート", desc: "ブール代数を用いた論理回路の最適化について述べよ。", due: d(7), type: "assignment", st: "not_started", pri: 1, subs: [] },
  { id: "da_5", moodleId: 205, cid: "mc_105", title: "実験レポート第2回", desc: "RISC-Vアセンブリによるフィボナッチ数列の実装と考察。", due: d(1), type: "assignment", st: "in_progress", pri: 3, subs: [{ id: "s4", t: "実装", d: true }, { id: "s5", t: "考察", d: false }, { id: "s6", t: "PDF作成", d: false }] },
  { id: "da_6", moodleId: 206, cid: "mc_104", title: "Essay: Technology and Society", desc: "Write a 500-word essay on the impact of AI on modern society.", due: d(10), type: "assignment", st: "not_started", pri: 0, subs: [] },
  { id: "da_7", moodleId: 207, cid: "mc_106", title: "確率統計 小テスト3", desc: "第7-9回の範囲。条件付き確率、ベイズの定理。", due: d(4), type: "quiz", st: "not_started", pri: 1, subs: [] },
  { id: "da_8", moodleId: 208, cid: "mc_101", title: "演習3: ハッシュテーブル", desc: "オープンアドレス法とチェイン法の実装。", due: d(-2), type: "assignment", st: "completed", sub: d(-3), pri: 1, subs: [] },
  { id: "da_9", moodleId: 209, cid: "mc_102", title: "線形代数 問題セット4", desc: "行列式と逆行列に関する演習。", due: d(-5), type: "assignment", st: "completed", sub: d(-6), pri: 1, subs: [] },
  { id: "da_10", moodleId: 210, cid: "mc_107", title: "CA 小テスト2", desc: "パイプライン処理とハザードについて。", due: d(-1), type: "quiz", st: "completed", sub: d(-1, 10, 0), pri: 1, subs: [] },
  { id: "da_11", moodleId: 211, cid: "mc_106", title: "確率統計 レポート2", desc: "最尤推定量とベイズ推定の比較について論ぜよ。", due: d(-1), type: "assignment", st: "not_started", pri: 2, subs: [] },
  { id: "da_12", moodleId: 212, cid: "mc_103", title: "論理と形式言語 演習3", desc: "正規表現からNFAへの変換。", due: d(-3), type: "assignment", st: "in_progress", pri: 2, subs: [{ id: "s7", t: "正規表現→NFA", d: true }, { id: "s8", t: "NFA→DFA", d: false }, { id: "s9", t: "最小化", d: false }] },
  { id: "da_13", moodleId: 213, cid: "mc_107", title: "CA レポート1: キャッシュメモリ", desc: "キャッシュの連想度とヒット率の関係をシミュレーションで検証せよ。", due: d(-7), type: "assignment", st: "not_started", pri: 3, subs: [] },
  // Q1 完了済み
  { id: "da_q1_1", moodleId: 1201, cid: "mc_q1_101", title: "プログラミング基礎 期末課題", desc: "Pythonで簡易データベースを実装せよ。", due: d(-45), type: "assignment", st: "completed", sub: d(-46), pri: 1, subs: [] },
  { id: "da_q1_2", moodleId: 1202, cid: "mc_q1_102", title: "微分積分学第一 問題セット8", desc: "重積分に関する演習問題。", due: d(-42), type: "assignment", st: "completed", sub: d(-43), pri: 1, subs: [] },
  { id: "da_q1_3", moodleId: 1203, cid: "mc_q1_101", title: "プログラミング基礎 演習10", desc: "再帰関数とメモ化。", due: d(-50), type: "assignment", st: "completed", sub: d(-51), pri: 1, subs: [] },
  { id: "da_q1_4", moodleId: 1204, cid: "mc_q1_103", title: "線形代数学第一 期末レポート", desc: "行列の応用に関するレポート。", due: d(-40), type: "assignment", st: "completed", sub: d(-41), pri: 1, subs: [] },
  { id: "da_q1_5", moodleId: 1205, cid: "mc_q1_105", title: "物理学基礎 最終レポート", desc: "力学の総合演習問題。", due: d(-38), type: "assignment", st: "completed", sub: d(-39), pri: 1, subs: [] },
];

// ── 成績 (GradeView API互換フォーマット) ──
const DEMO_GRADES = {
  summary: {
    studentId: "25B00099",
    name: "テスト太郎",
    totalCredits: 62,
    gpa: {
      overall: 2.78,
      major: 2.95,
      liberal: 2.42,
    },
  },
  categories: [
    { name: "文系教養科目", credits: 4 },
    { name: "英語科目", credits: 3 },
    { name: "理工系教養科目", credits: 6 },
    { name: "情報工学系専門科目", credits: 34 },
    { name: "数理・計算科学系専門科目", credits: 10 },
    { name: "広域教養科目", credits: 2 },
    { name: "第二外国語科目", credits: 3 },
  ],
  courses: [
    // ── 2025年度 1Q ──
    { code: "CSC.T213", name: "プログラミング基礎", grade: "92", credits: "2", quarter: "1", period: "2025-1Q", instructor: "山本 一郎", recommendation: "R", gradeNum: 92 },
    { code: "MCS.T201", name: "微分積分学第一", grade: "78", credits: "2", quarter: "1", period: "2025-1Q", instructor: "佐々木 修", recommendation: "R", gradeNum: 78 },
    { code: "MCS.T211", name: "線形代数学第一", grade: "85", credits: "2", quarter: "1", period: "2025-1Q", instructor: "松田 健", recommendation: "R", gradeNum: 85 },
    { code: "LAH.S101", name: "東工大立志プロジェクト", grade: "合格", credits: "1", quarter: "1", period: "2025-1Q", instructor: "複数教員", recommendation: "R", gradeNum: null },
    { code: "LAS.A101", name: "英語第一 S", grade: "80", credits: "1", quarter: "1", period: "2025-1Q", instructor: "Smith J.", recommendation: "R", gradeNum: 80 },
    { code: "LAS.M101", name: "物理学基礎", grade: "71", credits: "2", quarter: "1", period: "2025-1Q", instructor: "高橋 誠", recommendation: "R", gradeNum: 71 },
    // ── 2025年度 2Q ──
    { code: "CSC.T223", name: "離散構造とアルゴリズム", grade: "88", credits: "2", quarter: "2", period: "2025-2Q", instructor: "田中 裕子", recommendation: "R", gradeNum: 88 },
    { code: "MCS.T203", name: "微分積分学第二", grade: "65", credits: "2", quarter: "2", period: "2025-2Q", instructor: "佐々木 修", recommendation: "R", gradeNum: 65 },
    { code: "MCS.T213", name: "線形代数学第二", grade: "82", credits: "2", quarter: "2", period: "2025-2Q", instructor: "松田 健", recommendation: "R", gradeNum: 82 },
    { code: "LAS.A103", name: "英語第二 S", grade: "77", credits: "1", quarter: "2", period: "2025-2Q", instructor: "Brown K.", recommendation: "R", gradeNum: 77 },
    { code: "LAH.S201", name: "科学技術と社会", grade: "合格", credits: "1", quarter: "2", period: "2025-2Q", instructor: "中村 由美", recommendation: "A", gradeNum: null },
    { code: "LAS.C101", name: "化学基礎", grade: "68", credits: "2", quarter: "2", period: "2025-2Q", instructor: "石井 陽介", recommendation: "A", gradeNum: 68 },
    // ── 2025年度 3Q ──
    { code: "CSC.T233", name: "オペレーティングシステム", grade: "90", credits: "2", quarter: "3", period: "2025-3Q", instructor: "渡辺 剛", recommendation: "R", gradeNum: 90 },
    { code: "CSC.T243", name: "データ構造とアルゴリズム", grade: "95", credits: "2", quarter: "3", period: "2025-3Q", instructor: "鈴木 太郎", recommendation: "R", gradeNum: 95 },
    { code: "MCS.T223", name: "確率と統計", grade: "73", credits: "2", quarter: "3", period: "2025-3Q", instructor: "木村 真理", recommendation: "R", gradeNum: 73 },
    { code: "LAL.G101", name: "ドイツ語初級1", grade: "82", credits: "1", quarter: "3", period: "2025-3Q", instructor: "Schmidt H.", recommendation: "A", gradeNum: 82 },
    { code: "LAW.A101", name: "現代社会論", grade: "合格", credits: "2", quarter: "3", period: "2025-3Q", instructor: "藤本 和也", recommendation: "L", gradeNum: null },
    // ── 2025年度 4Q ──
    { code: "CSC.T253", name: "論理と形式言語", grade: "86", credits: "2", quarter: "4", period: "2025-4Q", instructor: "伊藤 正", recommendation: "R", gradeNum: 86 },
    { code: "CSC.T263", name: "コンピュータアーキテクチャ", grade: "91", credits: "2", quarter: "4", period: "2025-4Q", instructor: "加藤 浩一", recommendation: "R", gradeNum: 91 },
    { code: "CSC.T273", name: "計算機科学実験第一", grade: "85", credits: "2", quarter: "4", period: "2025-4Q", instructor: "複数教員", recommendation: "R", gradeNum: 85 },
    { code: "LAL.G103", name: "ドイツ語初級2", grade: "79", credits: "1", quarter: "4", period: "2025-4Q", instructor: "Schmidt H.", recommendation: "A", gradeNum: 79 },
    { code: "LAH.T101", name: "哲学入門", grade: "75", credits: "2", quarter: "4", period: "2025-4Q", instructor: "小林 哲也", recommendation: "A", gradeNum: 75 },
    // ── 2026年度 1Q ──
    { code: "CSC.T283", name: "ソフトウェア工学", grade: "87", credits: "2", quarter: "1", period: "2026-1Q", instructor: "大野 智", recommendation: "R", gradeNum: 87 },
    { code: "CSC.T293", name: "データベース", grade: "93", credits: "2", quarter: "1", period: "2026-1Q", instructor: "吉田 誠", recommendation: "A", gradeNum: 93 },
    { code: "MCS.T301", name: "数値解析", grade: "70", credits: "2", quarter: "1", period: "2026-1Q", instructor: "長谷川 勝", recommendation: "A", gradeNum: 70 },
    { code: "LAS.A201", name: "英語第三", grade: "83", credits: "1", quarter: "1", period: "2026-1Q", instructor: "Davis M.", recommendation: "A", gradeNum: 83 },
    { code: "LAL.G201", name: "ドイツ語中級", grade: "76", credits: "1", quarter: "1", period: "2026-1Q", instructor: "Weber A.", recommendation: "L", gradeNum: 76 },
    // ── 2026年度 2Q (現在受講中) ──
    { code: "CSC.T243", name: "データ構造とアルゴリズム", grade: "未報告", credits: "2", quarter: "2", period: "2026-2Q", instructor: "鈴木 太郎", recommendation: "R", gradeNum: null },
    { code: "MCS.T223", name: "線形代数学第二", grade: "未報告", credits: "2", quarter: "2", period: "2026-2Q", instructor: "松田 健", recommendation: "R", gradeNum: null },
    { code: "CSC.T253", name: "論理と形式言語", grade: "未報告", credits: "2", quarter: "2", period: "2026-2Q", instructor: "伊藤 正", recommendation: "R", gradeNum: null },
    { code: "LAS.A101", name: "英語第二 S", grade: "未報告", credits: "1", quarter: "2", period: "2026-2Q", instructor: "Smith J.", recommendation: "R", gradeNum: null },
    { code: "CSC.T273", name: "計算機科学実験第一", grade: "未報告", credits: "2", quarter: "2", period: "2026-2Q", instructor: "複数教員", recommendation: "R", gradeNum: null },
    { code: "MCS.T213", name: "確率と統計", grade: "未報告", credits: "2", quarter: "2", period: "2026-2Q", instructor: "木村 真理", recommendation: "R", gradeNum: null },
    { code: "CSC.T263", name: "コンピュータアーキテクチャ", grade: "未報告", credits: "2", quarter: "2", period: "2026-2Q", instructor: "加藤 浩一", recommendation: "R", gradeNum: null },
    { code: "LAS.C103", name: "東工大立志プロジェクト", grade: "未報告", credits: "2", quarter: "2", period: "2026-2Q", instructor: "複数教員", recommendation: "R", gradeNum: null },
  ],
};

// ── 出席 ──
const DEMO_ATT = {
  mc_101: { total: 12, attended: 11, late: 1 },
  mc_102: { total: 12, attended: 12, late: 0 },
  mc_103: { total: 12, attended: 10, late: 0 },
  mc_104: { total: 12, attended: 12, late: 0 },
  mc_105: { total: 6, attended: 6, late: 0 },
  mc_106: { total: 12, attended: 11, late: 1 },
  mc_107: { total: 12, attended: 10, late: 2 },
  mc_108: { total: 6, attended: 5, late: 0 },
};

// ── ユーザー ──
const DEMO_USER = {
  userid: 99999,
  fullname: "テスト太郎",
  yearGroup: "25B",
};

// ── イベント ──
const DEMO_EVENTS = [
  { id: "ev_1", title: "プログラミングコンテスト 2026 Spring", desc: "情報理工学院主催。チーム参加可。", cat: "contest", date: d(14, 13, 0), end: d(14, 17, 0), loc: "W6-31", col: "#6375f0" },
  { id: "ev_2", title: "研究室公開 Week", desc: "各研究室の紹介と見学ツアー。", cat: "open_lab", date: d(21, 10, 0), end: d(21, 16, 0), loc: "各号館", col: "#a855c7" },
  { id: "ev_3", title: "就活ガイダンス（学部3年向け）", desc: "キャリア支援課による就活準備セミナー。", cat: "career", date: d(10, 15, 0), end: d(10, 16, 30), loc: "WL1-301", col: "#d4843e" },
];

// ── レビュー ──
const DEMO_REVIEWS = [
  { id: "rv_1", cid: "mc_101", uid: 10001, name: "先輩A", rating: 4, text: "課題は多いが力がつく。スライドがわかりやすい。", ts: d(-30) },
  { id: "rv_2", cid: "mc_102", uid: 10002, name: "先輩B", rating: 3, text: "証明が多くて大変だが、演習をちゃんとやれば単位は来る。", ts: d(-45) },
  { id: "rv_3", cid: "mc_107", uid: 10003, name: "先輩C", rating: 5, text: "教授の説明がとても丁寧。CAに興味があるなら絶対取るべき。", ts: d(-20) },
];

// ── カレンダーイベント ──
const DEMO_MY_EVENTS = [
  { id: "me_1", title: "グループ勉強会", date: d(1, 18, 0), endDate: d(1, 20, 0), color: "#a855c7" },
  { id: "me_2", title: "バイト", date: d(3, 17, 0), endDate: d(3, 21, 0), color: "#3dae72" },
];

// ── タスク ──
const DEMO_TASKS = [
  { id: "tk_1", t: "AtCoderの過去問を3問解く", d: false, due: d(2) },
  { id: "tk_2", t: "研究室見学の申し込み", d: false, due: d(7) },
  { id: "tk_3", t: "図書館で参考書を借りる", d: true, due: null },
];

// ── 友達 ──
const DEMO_FRIENDS = [
  { friendId: 10001, name: "山田花子", avatar: "H", color: "#e5534b", dept: "情報工学系" },
  { friendId: 10002, name: "鈴木一郎", avatar: "I", color: "#6375f0", dept: "数理・計算科学系" },
  { friendId: 10003, name: "田中美咲", avatar: "M", color: "#3dae72", dept: "情報工学系" },
  { friendId: 10004, name: "佐藤健太", avatar: "K", color: "#d4843e", dept: "電気電子系" },
  { friendId: 10005, name: "高橋優", avatar: "Y", color: "#a855c7", dept: "機械系" },
];
const DEMO_FRIEND_PENDING = [
  { id: 501, fromId: 10006, toId: 99999, name: "伊藤翔太", avatar: "S", color: "#2d9d8f", dept: "情報通信系", isSender: false, status: "pending" },
];
const DEMO_FRIEND_SENT = [
  { id: 502, fromId: 99999, toId: 10007, name: "渡辺結衣", avatar: "Y", color: "#c75d8e", dept: "応用化学系", isSender: true, status: "pending" },
];

// ── DM 会話 ──
const DEMO_DM_CONVERSATIONS = [
  {
    id: 301, withId: 10001, withName: "山田花子", withAvatar: "H", withColor: "#e5534b",
    msgs: [
      { id: 1001, senderId: 10001, uid: 10001, text: "明日のアルゴリズムの課題、もう始めた？", ts: d(-1, 14, 30) },
      { id: 1002, senderId: 99999, uid: 99999, text: "まだ…今日から始める予定", ts: d(-1, 14, 35) },
      { id: 1003, senderId: 10001, uid: 10001, text: "ヒープソートの計算量の証明が分からなくて😭", ts: d(-1, 14, 38) },
      { id: 1004, senderId: 99999, uid: 99999, text: "それなら一緒に図書館で勉強しない？", ts: d(-1, 14, 42) },
      { id: 1005, senderId: 10001, uid: 10001, text: "いいね！16時に南2号館の前で！", ts: d(-1, 14, 45) },
    ],
  },
  {
    id: 302, withId: 10002, withName: "鈴木一郎", withAvatar: "I", withColor: "#6375f0",
    msgs: [
      { id: 1006, senderId: 10002, uid: 10002, text: "線形代数の問題セット5の問3って分かる？", ts: d(0, 10, 15) },
      { id: 1007, senderId: 99999, uid: 99999, text: "固有ベクトルのやつ？あれは対角化してから考えるとわかりやすいよ", ts: d(0, 10, 22) },
      { id: 1008, senderId: 10002, uid: 10002, text: "ありがとう！やってみる", ts: d(0, 10, 25) },
    ],
  },
  {
    id: 303, withId: 10003, withName: "田中美咲", withAvatar: "M", withColor: "#3dae72",
    msgs: [
      { id: 1009, senderId: 10003, uid: 10003, text: "実験レポート、参考文献何使った？", ts: d(-2, 20, 0) },
      { id: 1010, senderId: 99999, uid: 99999, text: "パタヘネの教科書とWikipediaのRISC-Vの記事", ts: d(-2, 20, 10) },
    ],
  },
];

// ── グループ ──
const DEMO_GROUPS = [
  {
    id: 401, name: "CSC 勉強会", avatar: null, color: "#a855c7", memberCount: 4,
    members: [
      { id: 99999, name: "テスト太郎", avatar: "T", color: "#888" },
      { id: 10001, name: "山田花子", avatar: "H", color: "#e5534b" },
      { id: 10002, name: "鈴木一郎", avatar: "I", color: "#6375f0" },
      { id: 10003, name: "田中美咲", avatar: "M", color: "#3dae72" },
    ],
    lastMessage: { senderName: "山田花子", text: "今週の土曜、空いてる？", ts: d(-1, 18, 0) },
  },
  {
    id: 402, name: "立志プロジェクトA班", avatar: null, color: "#c75d8e", memberCount: 3,
    members: [
      { id: 99999, name: "テスト太郎", avatar: "T", color: "#888" },
      { id: 10004, name: "佐藤健太", avatar: "K", color: "#d4843e" },
      { id: 10005, name: "高橋優", avatar: "Y", color: "#a855c7" },
    ],
    lastMessage: { senderName: "佐藤健太", text: "スライドの分担決めよう", ts: d(-3, 15, 0) },
  },
];

// ── サークル ──
const DEMO_CIRCLES = [
  {
    id: "cir_1", name: "プログラミング研究会", icon: "P", color: "#6375f0",
    desc: "競プロ・Web開発・AI など幅広くやってます。初心者歓迎！",
    tags: ["技術", "プログラミング", "初心者歓迎"],
    memberCount: 24, role: "admin",
    channels: [
      { id: "ch_1_1", name: "general", type: "text" },
      { id: "ch_1_2", name: "announcements", type: "text" },
      { id: "ch_1_3", name: "competitive-programming", type: "text" },
      { id: "ch_1_4", name: "web-dev", type: "text" },
      { id: "ch_1_5", name: "random", type: "text" },
    ],
    members: [
      { id: 99999, name: "テスト太郎", avatar: "T", color: "#888", role: "admin" },
      { id: 10001, name: "山田花子", avatar: "H", color: "#e5534b", role: "admin" },
      { id: 10002, name: "鈴木一郎", avatar: "I", color: "#6375f0", role: "member" },
      { id: 10003, name: "田中美咲", avatar: "M", color: "#3dae72", role: "member" },
      { id: 10004, name: "佐藤健太", avatar: "K", color: "#d4843e", role: "member" },
      { id: 10005, name: "高橋優", avatar: "Y", color: "#a855c7", role: "member" },
    ],
    announcements: [
      { id: "ann_1", text: "次回の勉強会は3/22(土) 13:00〜 南3号館115教室です。テーマは「Reactのパフォーマンス最適化」", by: "山田花子", ts: d(-2, 10, 0) },
      { id: "ann_2", text: "新メンバーが3人加入しました！よろしくお願いします", by: "山田花子", ts: d(-1, 14, 0) },
    ],
    events: [
      { id: "cev_1", title: "もくもく会", date: d(5, 13, 0), location: "南3号館 115教室", desc: "各自の開発を進める自習会。質問し合いましょう！", going: [99999, 10001, 10002, 10003] },
      { id: "cev_2", title: "React勉強会", date: d(7, 13, 0), location: "南3号館 115教室", desc: "Reactのパフォーマンス最適化について", going: [99999, 10001] },
      { id: "cev_3", title: "春合宿", date: d(21, 10, 0), location: "河口湖セミナーハウス", desc: "2泊3日の開発合宿。チーム開発を行います。", going: [10001, 10002, 10004, 10005] },
    ],
    recruit: [
      { id: "rec_1", title: "Web開発チームメンバー募集", desc: "学園祭のWebサイトを一緒に作りませんか？React/Next.js経験者歓迎", spots: 3, applied: 1, deadline: d(14, 23, 59) },
    ],
  },
  {
    id: "cir_2", name: "テニスサークル", icon: "🎾", color: "#3dae72",
    desc: "毎週火・木の放課後に大岡山コートで練習しています。",
    tags: ["運動", "テニス", "初心者歓迎"],
    memberCount: 38, role: "member",
    channels: [
      { id: "ch_2_1", name: "general", type: "text" },
      { id: "ch_2_2", name: "announcements", type: "text" },
      { id: "ch_2_3", name: "practice-schedule", type: "text" },
      { id: "ch_2_4", name: "off-topic", type: "text" },
    ],
    members: [
      { id: 10005, name: "高橋優", avatar: "Y", color: "#a855c7", role: "admin" },
      { id: 99999, name: "テスト太郎", avatar: "T", color: "#888", role: "member" },
      { id: 10001, name: "山田花子", avatar: "H", color: "#e5534b", role: "member" },
      { id: 10004, name: "佐藤健太", avatar: "K", color: "#d4843e", role: "member" },
    ],
    announcements: [
      { id: "ann_3", text: "来週の練習は雨予報のため体育館に変更します", by: "高橋優", ts: d(-1, 9, 0) },
    ],
    events: [
      { id: "cev_4", title: "練習試合 vs 電通大", date: d(10, 14, 0), location: "大岡山コート", desc: "電通大テニス部との練習試合", going: [10005, 10004] },
      { id: "cev_5", title: "新歓コンパ", date: d(18, 18, 0), location: "大岡山駅周辺", desc: "新入生歓迎会！", going: [10005, 99999, 10001, 10004] },
    ],
    recruit: [],
  },
  {
    id: "cir_3", name: "映画同好会", icon: "🎬", color: "#d4843e",
    desc: "月1で映画鑑賞会を開催。ジャンル問わず語り合いましょう。",
    tags: ["文化", "映画", "ゆるめ"],
    memberCount: 15, role: "member",
    channels: [
      { id: "ch_3_1", name: "general", type: "text" },
      { id: "ch_3_2", name: "recommendations", type: "text" },
      { id: "ch_3_3", name: "screening-schedule", type: "text" },
    ],
    members: [
      { id: 10003, name: "田中美咲", avatar: "M", color: "#3dae72", role: "admin" },
      { id: 99999, name: "テスト太郎", avatar: "T", color: "#888", role: "member" },
      { id: 10002, name: "鈴木一郎", avatar: "I", color: "#6375f0", role: "member" },
    ],
    announcements: [
      { id: "ann_4", text: "次回の鑑賞会は「君たちはどう生きるか」です。3/29(土) 14:00〜", by: "田中美咲", ts: d(-3, 11, 0) },
    ],
    events: [
      { id: "cev_6", title: "映画鑑賞会「君たちはどう生きるか」", date: d(14, 14, 0), location: "西8号館 視聴覚室", desc: "鑑賞後にディスカッション", going: [10003, 99999, 10002] },
    ],
    recruit: [
      { id: "rec_2", title: "映画レビューブログ執筆者募集", desc: "サークルブログに映画レビューを書いてくれる方を募集中", spots: 2, applied: 0, deadline: d(30, 23, 59) },
    ],
  },
];

const DEMO_CIRCLE_MESSAGES = {
  "ch_1_1": [
    { id: "cm_1", uid: 10001, name: "山田花子", avatar: "H", color: "#e5534b", text: "今週の土曜、もくもく会やりませんか？", ts: new Date(Date.now() - 3600000*5) },
    { id: "cm_2", uid: 10002, name: "鈴木一郎", avatar: "I", color: "#6375f0", text: "いいね！参加します", ts: new Date(Date.now() - 3600000*4) },
    { id: "cm_3", uid: 99999, name: "テスト太郎", avatar: "T", color: "#888", text: "自分も行きます！場所は南3号館でいいですか？", ts: new Date(Date.now() - 3600000*3) },
    { id: "cm_4", uid: 10003, name: "田中美咲", avatar: "M", color: "#3dae72", text: "南3号館の115教室、空いてるか確認しておきますね", ts: new Date(Date.now() - 3600000*2) },
    { id: "cm_5", uid: 10001, name: "山田花子", avatar: "H", color: "#e5534b", text: "ありがとう！13時集合で👍", ts: new Date(Date.now() - 3600000) },
  ],
  "ch_1_2": [
    { id: "cm_10", uid: 10001, name: "山田花子", avatar: "H", color: "#e5534b", text: "@everyone 次回の勉強会は3/22(土) 13:00〜 南3号館115教室です。テーマは「Reactのパフォーマンス最適化」です。", ts: new Date(Date.now() - 86400000*2), pinned: true },
    { id: "cm_11", uid: 10001, name: "山田花子", avatar: "H", color: "#e5534b", text: "新メンバーが3人加入しました！よろしくお願いします🎉", ts: new Date(Date.now() - 86400000) },
  ],
  "ch_1_3": [
    { id: "cm_20", uid: 10002, name: "鈴木一郎", avatar: "I", color: "#6375f0", text: "AtCoder ABC345、参加する人いますか？", ts: new Date(Date.now() - 7200000) },
    { id: "cm_21", uid: 10004, name: "佐藤健太", avatar: "K", color: "#d4843e", text: "参加します！前回のD問題の解説も聞きたい", ts: new Date(Date.now() - 5400000) },
    { id: "cm_22", uid: 10002, name: "鈴木一郎", avatar: "I", color: "#6375f0", text: "了解、コンテスト後にバーチャルで復習会やろう", ts: new Date(Date.now() - 3600000) },
  ],
  "ch_2_1": [
    { id: "cm_30", uid: 10005, name: "高橋優", avatar: "Y", color: "#a855c7", text: "来週の練習、雨予報なので体育館に変更します", ts: new Date(Date.now() - 7200000) },
    { id: "cm_31", uid: 10004, name: "佐藤健太", avatar: "K", color: "#d4843e", text: "了解です！ラケット持っていきます", ts: new Date(Date.now() - 3600000) },
  ],
};

const DEMO_DISCOVER_CIRCLES = [
  { id: "cir_d1", name: "ロボット技術研究会", icon: "🤖", color: "#2d9d8f", desc: "ロボットの設計・制作を行う技術系サークルです。ロボコン出場を目指しています。", memberCount: 32, tags: ["技術", "ロボット", "ものづくり"] },
  { id: "cir_d2", name: "軽音楽部", icon: "🎸", color: "#c678dd", desc: "バンド活動中心。学園祭ライブに向けて練習中！", memberCount: 45, tags: ["音楽", "バンド", "ライブ"] },
  { id: "cir_d3", name: "数学研究会", icon: "∑", color: "#c6a236", desc: "数学好きが集まって問題を解いたり議論したりするサークル。", memberCount: 18, tags: ["学術", "数学"] },
  { id: "cir_d4", name: "写真部", icon: "📷", color: "#e5534b", desc: "キャンパスや街の風景を撮影。月1で撮影会を開催。", memberCount: 22, tags: ["文化", "写真", "アート"] },
  { id: "cir_d5", name: "サッカー部", icon: "⚽", color: "#3dae72", desc: "関東理工系リーグ所属。週3で練習、マネージャーも募集中！", memberCount: 52, tags: ["運動", "サッカー", "本格派"] },
  { id: "cir_d6", name: "AI研究会", icon: "🧠", color: "#6375f0", desc: "機械学習・深層学習の勉強会や論文読み会を開催。Kaggleチームもあります。", memberCount: 28, tags: ["技術", "AI", "機械学習"] },
  { id: "cir_d7", name: "ボードゲーム同好会", icon: "🎲", color: "#d4843e", desc: "カタンやドミニオンなど戦略系ゲームを中心に毎週活動中。", memberCount: 20, tags: ["文化", "ゲーム", "ゆるめ", "初心者歓迎"] },
  { id: "cir_d8", name: "陸上競技部", icon: "🏃", color: "#e5534b", desc: "短距離から長距離まで。大岡山キャンパスのグラウンドで毎日練習。", memberCount: 35, tags: ["運動", "陸上", "本格派"] },
  { id: "cir_d9", name: "天文部", icon: "🔭", color: "#2d4d8f", desc: "月1の観測会と天体写真撮影。すずかけ台の屋上望遠鏡が使えます。", memberCount: 14, tags: ["学術", "天文", "理系"] },
  { id: "cir_d10", name: "料理研究会", icon: "🍳", color: "#c75d8e", desc: "月2で調理実習、レシピ共有。学園祭では模擬店を出店！", memberCount: 30, tags: ["文化", "料理", "初心者歓迎", "ゆるめ"] },
  { id: "cir_d11", name: "バドミントンサークル", icon: "🏸", color: "#a855c7", desc: "経験者も初心者もOK！週2で体育館で活動。", memberCount: 40, tags: ["運動", "バドミントン", "初心者歓迎"] },
  { id: "cir_d12", name: "電子工作研究会", icon: "⚡", color: "#c6a236", desc: "Arduino・ラズパイを使った電子工作。自作キーボード勢も多数。", memberCount: 16, tags: ["技術", "電子工作", "ものづくり"] },
  { id: "cir_d13", name: "アカペラサークル", icon: "🎤", color: "#c678dd", desc: "声だけで音楽を作る！初心者から経験者まで幅広く在籍。", memberCount: 25, tags: ["音楽", "アカペラ", "初心者歓迎"] },
  { id: "cir_d14", name: "ワンダーフォーゲル部", icon: "🏔️", color: "#3dae72", desc: "登山・ハイキングがメイン。夏は北アルプス縦走、冬は雪山にも。", memberCount: 22, tags: ["運動", "アウトドア", "登山", "本格派"] },
  { id: "cir_d15", name: "漫画研究会", icon: "✏️", color: "#d4843e", desc: "オリジナル漫画・イラストの制作。学園祭で同人誌を頒布！", memberCount: 19, tags: ["文化", "漫画", "イラスト", "アート"] },
  { id: "cir_d16", name: "クイズ研究会", icon: "❓", color: "#6375f0", desc: "競技クイズの練習から雑学系まで。ABC大会に毎年出場。", memberCount: 12, tags: ["学術", "クイズ", "ゆるめ"] },
];

// ── 通知 ──
const DEMO_NOTIFICATIONS = [
  { id: 601, type: "deadline", text: "「実験レポート第2回」の締切が明日です", cid: "mc_105", ts: d(0, 9, 0), read: false },
  { id: 602, type: "course", text: "「データ構造とアルゴリズム」に新しい教材がアップロードされました", cid: "mc_101", ts: d(0, 8, 0), read: false },
  { id: 603, type: "deadline", text: "「第3回レポート: ソートアルゴリズムの比較」の締切が2日後です", cid: "mc_101", ts: d(-1, 9, 0), read: false },
  { id: 604, type: "dm", text: "山田花子さんからメッセージが届きました", cid: null, ts: d(-1, 14, 45), read: true },
  { id: 605, type: "course", text: "「確率と統計」の小テスト3が公開されました", cid: "mc_106", ts: d(-2, 12, 0), read: true },
  { id: 606, type: "event", text: "「プログラミングコンテスト 2026 Spring」の参加登録が開始しました", cid: null, ts: d(-3, 10, 0), read: true },
  { id: 607, type: "course", text: "「コンピュータアーキテクチャ」の小テスト2の成績が公開されました", cid: "mc_107", ts: d(-4, 16, 0), read: true },
];

// ── フィード投稿 ──
const DEMO_POSTS = {
  "mc_101": [
    // ── ピン留め投稿 ──
    { id: 700, uid: 10001, text: "📌 **レポート提出要件まとめ**\n- 形式: PDF\n- ファイル名: `学籍番号_report03.pdf`\n- 締切: 3/24(月) 23:59\n- 提出先: Moodleの課題提出ページ\n\n遅延提出は **1日ごとに10%減点** です。",
      type: "info", likes: [10001, 10002, 10003, 10004, 99999, 10005],
      ts: d(-2, 10, 0), name: "山田花子", avatar: "H", color: "#e5534b",
      pinned: true, commentCount: 3, reactions: {"👍":[10002,10003,10004],"🔥":[99999]} },

    // ── 今日の投稿 ──
    // 質問 + TeX
    { id: 701, uid: 10001, text: "動的計画法の漸化式の立て方がいまいち分からない…\n例えばナップサック問題で $dp[i][w] = \\max(dp[i-1][w],\\; dp[i-1][w-w_i] + v_i)$ ってなるけど、この式をどう思いつけばいいの？",
      type: "question", likes: [10002, 10003, 10004],
      ts: d(0, 11, 30), name: "山田花子", avatar: "H", color: "#e5534b",
      commentCount: 2, reactions: {"👍":[10002]} },

    { id: 702, uid: 10002, text: "**DPの漸化式の考え方：**\n1. 小さいケースで手計算してパターンを見つける\n2. 「最後の1手」を考える（最後にどの選択をしたか？）\n3. テーブルの各セルが何を表すか明確にする\n\nナップサックなら「i番目の品物を入れるか入れないか」の2択で分岐する。@山田花子 これで伝わる？",
      type: "discussion", likes: [10001, 99999, 10003],
      ts: d(0, 11, 45), name: "鈴木一郎", avatar: "I", color: "#6375f0",
      reactions: {"❤️":[10001],"👍":[10003,99999]} },

    // 投票 (poll)
    { id: 707, uid: 10004, text: "📊 レポートのプログラミング言語、みんな何使う？",
      type: "poll", likes: [10001],
      ts: d(0, 10, 0), name: "佐藤健太", avatar: "K", color: "#d4843e",
      pollOptions: ["Python", "C/C++", "Java", "JavaScript", "Rust"],
      pollVotes: {"Python":[10001,10003,10005,10006],"C/C++":[10002,99999,10004],"Java":[10007],"JavaScript":[10008],"Rust":[]},
      commentCount: 1 },

    // info + コード
    { id: 703, uid: 99999, text: "第3回レポート、ソートの比較はランダム入力だけでなく**ソート済み入力**も試した方がいいですよ。クイックソートの最悪ケースが見えます：\n```python\nimport time, random\n\ndef benchmark(sort_fn, data):\n    start = time.perf_counter()\n    sort_fn(data[:])\n    return time.perf_counter() - start\n\n# ランダム vs ソート済み\nrandom_data = random.sample(range(10000), 10000)\nsorted_data = list(range(10000))\n```",
      type: "info", likes: [10001, 10002, 10003, 10004],
      ts: d(-1, 16, 0), name: "テスト太郎", avatar: "T", color: "#888",
      commentCount: 4, reactions: {"🔥":[10001,10002],"👍":[10003]} },

    // material
    { id: 704, uid: 10003, text: "ヒープソートの計算量 $O(n \\log n)$ の証明、教科書のp.142がわかりやすかったです。ポイントは：\n- ヒープ構築: $O(n)$（上からではなく下から積み上げ）\n- 取り出し×n回: 各 $O(\\log n)$\n$$T(n) = O(n) + n \\cdot O(\\log n) = O(n \\log n)$$",
      type: "material", likes: [10001, 10002, 10005],
      ts: d(-1, 20, 15), name: "田中美咲", avatar: "M", color: "#3dae72",
      reactions: {"👏":[10001,10002,99999]} },

    // 編集済み投稿
    { id: 705, uid: 10004, text: "来週の小テスト範囲は第5章〜第7章（ソート・探索・グラフ基礎）とのことです。TAさんに確認済み。",
      type: "question", likes: [10001, 10002],
      ts: d(-2, 9, 0), name: "佐藤健太", avatar: "K", color: "#d4843e",
      editedAt: d(-2, 9, 30), commentCount: 1 },

    // 匿名投稿
    { id: 706, uid: 0, text: "正直この授業の課題量多すぎない？毎週レポートはきつい。他の授業との両立が厳しくなってきた…",
      type: "anon", likes: [10001, 10002, 10003, 10004, 10005, 10006, 10007],
      ts: d(-3, 22, 0), name: "匿名", avatar: "?", color: "#68687a",
      commentCount: 5, reactions: {"😢":[10001,10002,10003],"👍":[10004,10005]} },
  ],
  "mc_102": [
    // ピン留め
    { id: 710, uid: 10002, text: "**中間試験の範囲**\n- 行列の基本演算\n- 連立一次方程式（掃き出し法）\n- 行列式\n- 固有値・固有ベクトル\n- 対角化\n\n持ち込み: A4用紙1枚（手書き・両面OK）",
      type: "info", likes: [10001, 10003, 99999, 10004, 10005],
      ts: d(-3, 18, 0), name: "鈴木一郎", avatar: "I", color: "#6375f0",
      pinned: true, commentCount: 2, reactions: {"👍":[10001,10003,10004]} },

    { id: 711, uid: 10002, text: "固有値分解の計算、3x3以上になると大変すぎる…\n$$\\det(A - \\lambda I) = \\det\\begin{pmatrix} a_{11}-\\lambda & a_{12} & a_{13} \\\\ a_{21} & a_{22}-\\lambda & a_{23} \\\\ a_{31} & a_{32} & a_{33}-\\lambda \\end{pmatrix} = 0$$\n3次方程式解くの手計算だときつい",
      type: "discussion", likes: [99999, 10003],
      ts: d(0, 10, 0), name: "鈴木一郎", avatar: "I", color: "#6375f0",
      commentCount: 3, reactions: {"😢":[10001,10003]} },

    { id: 712, uid: 99999, text: "対角化の条件まとめノート作ったので共有します：\n\n**対角化可能な条件**\n1. $n \\times n$ 行列が $n$ 個の線形独立な固有ベクトルを持つ\n2. 固有値が全部異なれば必ず対角化可能\n3. 重複固有値があっても固有空間の次元が重複度と等しければOK\n\nNumPyで確認：\n```python\nimport numpy as np\nA = np.array([[2, 1], [0, 2]])  # 重複固有値λ=2\nevals, evecs = np.linalg.eig(A)\nprint(f\"固有値: {evals}\")  # [2, 2]\n# 固有ベクトルが1つ → 対角化不可能\n```",
      type: "material", likes: [10001, 10002, 10003, 10005],
      ts: d(-1, 14, 0), name: "テスト太郎", avatar: "T", color: "#888",
      commentCount: 2, reactions: {"🔥":[10001,10002],"👏":[10003]} },

    // 投票
    { id: 713, uid: 10003, text: "📊 試験対策どうする？",
      type: "poll", likes: [],
      ts: d(-1, 20, 0), name: "田中美咲", avatar: "M", color: "#3dae72",
      pollOptions: ["過去問を解く", "ノートまとめ", "勉強会開く", "YouTubeで復習"],
      pollVotes: {"過去問を解く":[10001,10002,99999,10004],"ノートまとめ":[10003,10005],"勉強会開く":[10001,10003,10002],"YouTubeで復習":[10006]},
      pollSettings: {multi:true} },

    // 匿名
    { id: 714, uid: 0, text: "証明問題が全く書けない…解法暗記しないとダメなのかな",
      type: "anon", likes: [10001, 10002, 10003],
      ts: d(-2, 23, 30), name: "匿名", avatar: "?", color: "#68687a",
      reactions: {"😢":[10004,10005],"❤️":[10001]} },
  ],
  "mc_105": [
    { id: 721, uid: 10003, text: "実験レポート、参考文献のフォーマットってIEEEスタイルでいいですよね？LaTeXの `\\bibliographystyle{IEEEtran}` で合ってる？",
      type: "question", likes: [99999, 10004],
      ts: d(0, 15, 30), name: "田中美咲", avatar: "M", color: "#3dae72",
      commentCount: 2 },
    { id: 722, uid: 99999, text: "TAさんに確認したらIEEEでOKとのことです。BibTeXの書き方サンプル：\n```bibtex\n@article{smith2024,\n  author  = {Smith, John},\n  title   = {An Example Paper},\n  journal = {IEEE Trans.},\n  year    = {2024},\n  volume  = {42},\n  pages   = {1--10}\n}\n```",
      type: "info", likes: [10003, 10001, 10004],
      ts: d(0, 16, 10), name: "テスト太郎", avatar: "T", color: "#888",
      reactions: {"👍":[10003,10004]} },
    { id: 723, uid: 10004, text: "📊 実験データの可視化ツール何使ってる？",
      type: "poll", likes: [],
      ts: d(-1, 14, 0), name: "佐藤健太", avatar: "K", color: "#d4843e",
      pollOptions: ["matplotlib", "Excel", "gnuplot", "Plotly"],
      pollVotes: {"matplotlib":[10003,99999,10001],"Excel":[10004,10005],"gnuplot":[10002],"Plotly":[10006]} },
  ],
  "mc_103": [
    { id: 730, uid: 10002, text: "正規表現 `(a|b)*abb` からNFAに変換するの、Thompson構成法でやるとノード数めっちゃ多くならない？",
      type: "question", likes: [10001, 10003],
      ts: d(0, 13, 0), name: "鈴木一郎", avatar: "I", color: "#6375f0",
      commentCount: 3, reactions: {"👍":[10001]} },
    { id: 731, uid: 10003, text: "Thompson構成法はε遷移が多くなるのが普通。NFA→DFA変換（部分集合構成法）でまとめると状態数減るよ。\n\n**変換の流れ:**\n1. 正規表現 → NFA (Thompson)\n2. NFA → DFA (部分集合構成法)\n3. DFA → 最小DFA (等価状態の統合)",
      type: "info", likes: [10002, 99999, 10004],
      ts: d(0, 13, 20), name: "田中美咲", avatar: "M", color: "#3dae72",
      reactions: {"🔥":[10002]} },
    { id: 732, uid: 99999, text: "文脈自由文法のチョムスキー標準形への変換手順まとめ：\n1. ε生成規則の除去\n2. 単位生成規則の除去\n3. 右辺を2変数以下に分解\n4. 終端記号を変数に置換\n\nこの順番大事。**順番間違えると正しく変換できない**ので注意",
      type: "material", likes: [10001, 10002, 10003],
      ts: d(-1, 15, 30), name: "テスト太郎", avatar: "T", color: "#888",
      pinned: true, commentCount: 2, reactions: {"👏":[10001,10003]} },
    { id: 733, uid: 0, text: "この授業、毎回の内容が重いのに演習の時間短すぎる…もう少し演習時間ほしい",
      type: "anon", likes: [10001, 10002, 10004, 10005],
      ts: d(-2, 21, 0), name: "匿名", avatar: "?", color: "#68687a",
      reactions: {"😢":[10003,10005]} },
  ],
  "mc_104": [
    { id: 740, uid: 10001, text: "今週のessayのテーマ \"Technology and Society\" って、AIに絞って書いていいのかな？それとも幅広く書くべき？",
      type: "question", likes: [10004],
      ts: d(0, 14, 0), name: "山田花子", avatar: "H", color: "#e5534b",
      commentCount: 2 },
    { id: 741, uid: 10004, text: "先生が授業中に \"You can focus on a specific area\" って言ってたから、AIだけでも大丈夫だと思う",
      type: "discussion", likes: [10001, 10003],
      ts: d(0, 14, 15), name: "佐藤健太", avatar: "K", color: "#d4843e" },
    { id: 742, uid: 10003, text: "Academic writingの構成テンプレ共有します：\n\n**Introduction** (50 words)\n- Hook → Background → Thesis statement\n\n**Body** (350 words)\n- Topic sentence → Evidence → Analysis × 2-3 paragraphs\n\n**Conclusion** (100 words)\n- Restate thesis → Summary → Future implications",
      type: "material", likes: [10001, 10004, 99999],
      ts: d(-1, 10, 0), name: "田中美咲", avatar: "M", color: "#3dae72",
      pinned: true, reactions: {"👍":[10001,10004],"🔥":[99999]} },
    { id: 743, uid: 99999, text: "📊 Grammarly使ってる？",
      type: "poll", likes: [],
      ts: d(-2, 16, 0), name: "テスト太郎", avatar: "T", color: "#888",
      pollOptions: ["使ってる", "使ってない", "DeepL Write派", "ChatGPT派"],
      pollVotes: {"使ってる":[10001,10003],"使ってない":[10004],"DeepL Write派":[10002,10005],"ChatGPT派":[99999,10006]} },
  ],
  "mc_106": [
    { id: 750, uid: 10001, text: "ベイズの定理の問題、事前確率と尤度を取り違えやすい…\n$$P(A|B) = \\frac{P(B|A)\\,P(A)}{P(B)}$$\nの $P(B|A)$ が尤度で $P(A)$ が事前確率。ここ間違える人多そう",
      type: "info", likes: [10002, 10003, 10004],
      ts: d(0, 9, 30), name: "山田花子", avatar: "H", color: "#e5534b",
      commentCount: 2, reactions: {"👍":[10002,10004]} },
    { id: 751, uid: 10002, text: "最尤推定量の導出で対数尤度を使うテクニック、覚えておくと楽：\n$$\\hat{\\theta}_{ML} = \\arg\\max_\\theta \\sum_{i=1}^{n} \\ln f(x_i | \\theta)$$\n積を和にできるから微分が簡単になる",
      type: "discussion", likes: [10001, 99999],
      ts: d(-1, 11, 0), name: "鈴木一郎", avatar: "I", color: "#6375f0",
      reactions: {"🔥":[10001]} },
    { id: 752, uid: 99999, text: "Pythonで正規分布のパラメータ推定やってみた：\n```python\nimport numpy as np\nfrom scipy import stats\n\ndata = np.random.normal(loc=5, scale=2, size=100)\n\n# 最尤推定\nmu_ml = np.mean(data)\nsigma_ml = np.std(data)  # MLEはn割り\n\n# 不偏推定\nmu_ub = np.mean(data)\nsigma_ub = np.std(data, ddof=1)  # n-1割り\n\nprint(f\"MLE: μ={mu_ml:.3f}, σ={sigma_ml:.3f}\")\nprint(f\"不偏: μ={mu_ub:.3f}, σ={sigma_ub:.3f}\")\n```\nMLEの $\\sigma$ は不偏じゃないので注意！",
      type: "material", likes: [10001, 10002, 10003, 10005],
      ts: d(-1, 15, 0), name: "テスト太郎", avatar: "T", color: "#888",
      commentCount: 3, reactions: {"🔥":[10001,10002],"👏":[10003]} },
    { id: 753, uid: 10004, text: "📊 小テスト3の自信は？",
      type: "poll", likes: [],
      ts: d(-2, 20, 0), name: "佐藤健太", avatar: "K", color: "#d4843e",
      pollOptions: ["余裕", "まあまあ", "不安", "無理"],
      pollVotes: {"余裕":[],"まあまあ":[10002,99999],"不安":[10001,10003,10004],"無理":[10005,10006,10007]},
      pollSettings: {anon:true} },
  ],
  "mc_107": [
    { id: 760, uid: 10002, text: "パイプラインハザードの3種類、整理しておく：\n\n**1. データハザード** — 前の命令の結果を次が使う\n  → フォワーディングで解決\n**2. 制御ハザード** — 分岐命令\n  → 分岐予測 or 遅延分岐\n**3. 構造ハザード** — リソース競合\n  → ハードウェア追加で解決",
      type: "material", likes: [10001, 10003, 99999, 10004],
      ts: d(0, 10, 30), name: "鈴木一郎", avatar: "I", color: "#6375f0",
      pinned: true, commentCount: 4, reactions: {"👍":[10001,10003],"🔥":[99999]} },
    { id: 761, uid: 10001, text: "キャッシュのレポート、連想度を1, 2, 4, 8-wayで比較してみたけど、4-wayから先はヒット率ほとんど変わらなかった。これって一般的な傾向？",
      type: "question", likes: [10002],
      ts: d(-1, 16, 30), name: "山田花子", avatar: "H", color: "#e5534b",
      commentCount: 2 },
    { id: 762, uid: 99999, text: "RISC-VのR型命令のデコード、ビットフィールド覚えるの大変だけどこの表が便利：\n```\n31-25  24-20  19-15  14-12  11-7   6-0\nfunct7  rs2    rs1   funct3   rd   opcode\n```\n`add x1, x2, x3` → `0000000 00011 00010 000 00001 0110011`",
      type: "info", likes: [10001, 10002, 10003],
      ts: d(-2, 11, 0), name: "テスト太郎", avatar: "T", color: "#888",
      reactions: {"👍":[10001,10002]} },
    { id: 763, uid: 0, text: "小テスト2、平均点低かったらしいけどみんなどうだった？自分は半分くらいしか取れなかった…",
      type: "anon", likes: [10001, 10003, 10005],
      ts: d(-3, 19, 0), name: "匿名", avatar: "?", color: "#68687a",
      commentCount: 6, reactions: {"😢":[10001,10004,10005]} },
  ],
  "mc_108": [
    { id: 770, uid: 10004, text: "プロジェクトのテーマ決め、来週までだけどみんな何にする？自分は「大学内の食品ロス削減」を考えてる",
      type: "discussion", likes: [10001, 10003],
      ts: d(0, 12, 0), name: "佐藤健太", avatar: "K", color: "#d4843e",
      commentCount: 3 },
    { id: 771, uid: 10001, text: "グループ発表のスライド構成、先生が言ってた流れ：\n\n1. **問題提起**（なぜこのテーマ？）\n2. **現状分析**（データ・事実）\n3. **提案**（具体的な解決策）\n4. **実現可能性**（コスト・期間）\n5. **まとめ・展望**\n\n1スライド1メッセージを意識するといいらしい",
      type: "info", likes: [10002, 10003, 10004, 99999],
      ts: d(-1, 13, 0), name: "山田花子", avatar: "H", color: "#e5534b",
      pinned: true, reactions: {"👍":[10002,10004]} },
    { id: 772, uid: 10003, text: "📊 チームの役割分担、どれがいい？",
      type: "poll", likes: [],
      ts: d(-1, 18, 0), name: "田中美咲", avatar: "M", color: "#3dae72",
      pollOptions: ["リーダー", "リサーチ担当", "スライド作成", "発表者"],
      pollVotes: {"リーダー":[10004],"リサーチ担当":[10002,10003],"スライド作成":[10001,99999],"発表者":[10005]} },
    { id: 773, uid: 0, text: "立志プロジェクト、正直何をすればいいのかよくわからない…グループワーク苦手な人にはきつい",
      type: "anon", likes: [10002, 10005, 10006],
      ts: d(-3, 22, 30), name: "匿名", avatar: "?", color: "#68687a",
      reactions: {"😢":[10001,10003],"❤️":[10004]} },
  ],
};

// ── チャットメッセージ (機能デモ) ──
const DEMO_CHAT_MESSAGES = {
  "mc_101": [
    // ── 3日前 ──
    // 通常テキスト + @メンション + #ハッシュタグ
    { id: "dcm_1", uid: 10001, name: "山田花子", avatar: "H", color: "#e5534b",
      text: "@鈴木一郎 今日の演習の解答もう確認した？ #アルゴリズム",
      ts: d(-3, 14, 20) },

    // 太字
    { id: "dcm_2", uid: 10002, name: "鈴木一郎", avatar: "I", color: "#6375f0",
      text: "まだ見てない！**計算量の証明**が難しかったよね。**O(n log n)**の下界の証明パート",
      ts: d(-3, 14, 35) },

    // インラインコード + TeX数式
    { id: "dcm_3", uid: 10003, name: "田中美咲", avatar: "M", color: "#3dae72",
      text: "マージソートの計算量は再帰式 $T(n) = 2T(n/2) + O(n)$ をマスター定理で解くと $$T(n) = O(n \\log n)$$ になるよ。`mergeSort(arr, 0, n-1)` みたいな呼び出しで再帰する",
      ts: d(-3, 15, 0) },

    // ── 昨日 ──
    // コードブロック (Python)
    { id: "dcm_4", uid: 10002, name: "鈴木一郎", avatar: "I", color: "#6375f0",
      text: "Pythonだとこんな感じ：\n```python\ndef merge_sort(arr):\n    if len(arr) <= 1:\n        return arr\n    mid = len(arr) // 2\n    left = merge_sort(arr[:mid])\n    right = merge_sort(arr[mid:])\n    return merge(left, right)\n\ndef merge(left, right):\n    result = []\n    i = j = 0\n    while i < len(left) and j < len(right):\n        if left[i] <= right[j]:\n            result.append(left[i])\n            i += 1\n        else:\n            result.append(right[j])\n            j += 1\n    result.extend(left[i:])\n    result.extend(right[j:])\n    return result\n```",
      ts: d(-1, 10, 30) },

    // コードブロック (JavaScript)
    { id: "dcm_5", uid: 99999, name: "テスト太郎", avatar: "T", color: "#888",
      text: "JavaScriptだとこう：\n```javascript\nfunction quickSort(arr, lo = 0, hi = arr.length - 1) {\n  if (lo >= hi) return;\n  const pivot = arr[hi];\n  let i = lo;\n  for (let j = lo; j < hi; j++) {\n    if (arr[j] < pivot) {\n      [arr[i], arr[j]] = [arr[j], arr[i]];\n      i++;\n    }\n  }\n  [arr[i], arr[hi]] = [arr[hi], arr[i]];\n  quickSort(arr, lo, i - 1);\n  quickSort(arr, i + 1, hi);\n}\n```\nクイックソートの最悪計算量は $O(n^2)$ だけど平均は $O(n \\log n)$ だよ",
      ts: d(-1, 11, 0) },

    // TeX表示数式（行列）
    { id: "dcm_6", uid: 10003, name: "田中美咲", avatar: "M", color: "#3dae72",
      text: "ちなみに線形代数の授業と繋がるけど、ストラッセンのアルゴリズムで行列積が\n$$C = A \\times B \\quad \\text{where} \\quad A, B \\in \\mathbb{R}^{n \\times n}$$\nを $O(n^{2.807})$ で計算できるんだよね",
      ts: d(-1, 11, 20) },

    // 投票 (単一選択)
    { id: "dcm_7", uid: 10001, name: "山田花子", avatar: "H", color: "#e5534b",
      text: "📊 レポートどのソートアルゴリズムで実験する？",
      ts: d(-1, 14, 0),
      pollOptions: ["クイックソート", "マージソート", "ヒープソート", "基数ソート"],
      pollVotes: { "クイックソート": [10002, 99999], "マージソート": [10001, 10003], "ヒープソート": [10004], "基数ソート": [] },
      pollSettings: {} },

    // ── 今日 ──
    // 投票 (複数選択)
    { id: "dcm_8", uid: 10004, name: "佐藤健太", avatar: "K", color: "#d4843e",
      text: "📊 勉強会の日程、都合いい曜日は？",
      ts: d(0, 9, 30),
      pollOptions: ["月曜", "水曜", "金曜", "土曜"],
      pollVotes: { "月曜": [10001, 10003], "水曜": [10002, 99999, 10003], "金曜": [10001, 10004], "土曜": [10001, 10002, 10003, 99999] },
      pollSettings: { multi: true } },

    // 投票 (匿名)
    { id: "dcm_9", uid: 10003, name: "田中美咲", avatar: "M", color: "#3dae72",
      text: "📊 この授業の難易度どう思う？（正直に！）",
      ts: d(0, 10, 15),
      pollOptions: ["簡単", "ちょうどいい", "やや難しい", "かなり難しい"],
      pollVotes: { "簡単": [10005], "ちょうどいい": [10002, 10004], "やや難しい": [10001, 99999, 10003], "かなり難しい": [10006, 10007] },
      pollSettings: { anon: true } },

    // お知らせ + 太字
    { id: "dcm_10", uid: 10001, name: "山田花子", avatar: "H", color: "#e5534b",
      text: "📢 **お知らせ**\n来週の月曜は**休講**です。代わりに再来週の水曜5-6限に補講があります。教室は `W6-31` のままです。",
      ts: d(0, 12, 0) },

    // インラインTeX + インラインコードの混在
    { id: "dcm_11", uid: 99999, name: "テスト太郎", avatar: "T", color: "#888",
      text: "二分探索木の検索計算量は平均 $O(\\log n)$ だけど、最悪 $O(n)$ になる。`balancedBST` を使えば常に $O(\\log n)$ を保証できるよ。AVL木の回転操作が `rotateLeft()` と `rotateRight()` の2種類 #データ構造",
      ts: d(0, 13, 45) },
  ],

  "mc_102": [
    { id: "dcm_20", uid: 10002, name: "鈴木一郎", avatar: "I", color: "#6375f0",
      text: "固有値 $\\lambda$ は $\\det(A - \\lambda I) = 0$ を解けばいいんだよね？\n$$\\det\\begin{pmatrix} 1-\\lambda & 2 \\\\ 3 & 4-\\lambda \\end{pmatrix} = 0$$",
      ts: d(-1, 16, 0) },
    { id: "dcm_21", uid: 99999, name: "テスト太郎", avatar: "T", color: "#888",
      text: "そう！展開すると $(1-\\lambda)(4-\\lambda) - 6 = 0$ で $\\lambda^2 - 5\\lambda - 2 = 0$ になる。NumPyだと一発：\n```python\nimport numpy as np\nA = np.array([[1, 2], [3, 4]])\neigenvalues, eigenvectors = np.linalg.eig(A)\nprint(f\"固有値: {eigenvalues}\")\nprint(f\"固有ベクトル:\\n{eigenvectors}\")\n```",
      ts: d(0, 9, 10) },
  ],
  "mc_103": [
    { id: "dcm_30", uid: 10002, name: "鈴木一郎", avatar: "I", color: "#6375f0",
      text: "Thompson構成法のε遷移、紙で追うと本当に混乱する…みんなどうやって管理してる？", ts: d(-1, 14, 0) },
    { id: "dcm_31", uid: 10003, name: "田中美咲", avatar: "M", color: "#3dae72",
      text: "**ε-closure** をちゃんと計算するのがポイント。BFS/DFSで到達可能なε遷移先を全部列挙する", ts: d(-1, 14, 20) },
    { id: "dcm_32", uid: 99999, name: "テスト太郎", avatar: "T", color: "#888",
      text: "Pythonで部分集合構成法を実装してみた：\n```python\ndef epsilon_closure(states, transitions):\n    stack = list(states)\n    closure = set(states)\n    while stack:\n        s = stack.pop()\n        for t in transitions.get((s, 'ε'), []):\n            if t not in closure:\n                closure.add(t)\n                stack.append(t)\n    return frozenset(closure)\n```", ts: d(0, 10, 0) },
    { id: "dcm_33", uid: 10001, name: "山田花子", avatar: "H", color: "#e5534b",
      text: "チョムスキー階層の包含関係って：\n正規 ⊂ 文脈自由 ⊂ 文脈依存 ⊂ 帰納的可算\nで合ってる？", ts: d(0, 11, 30) },
    { id: "dcm_34", uid: 10004, name: "佐藤健太", avatar: "K", color: "#d4843e",
      text: "合ってるよ！各クラスに対応するオートマトン：\n- 正規 → 有限オートマトン\n- 文脈自由 → プッシュダウンオートマトン\n- 文脈依存 → 線形有界オートマトン\n- 帰納的可算 → チューリングマシン", ts: d(0, 11, 50) },
  ],
  "mc_104": [
    { id: "dcm_40", uid: 10001, name: "山田花子", avatar: "H", color: "#e5534b",
      text: "今週のessayの構成どうする？5パラグラフエッセイでいいのかな", ts: d(-1, 13, 0) },
    { id: "dcm_41", uid: 10003, name: "田中美咲", avatar: "M", color: "#3dae72",
      text: "先生が「500 words なので3パラグラフでもOK」って言ってたよ。Introduction, Body, Conclusion でコンパクトにまとめる感じ", ts: d(-1, 13, 20) },
    { id: "dcm_42", uid: 10004, name: "佐藤健太", avatar: "K", color: "#d4843e",
      text: "peer review のとき、文法ミスだけじゃなくて**argument の論理構成**もチェックした方がいいってフィードバックもらった", ts: d(0, 9, 0) },
    { id: "dcm_43", uid: 99999, name: "テスト太郎", avatar: "T", color: "#888",
      text: "📊 今回のエッセイ、何で文法チェックする？",
      ts: d(0, 10, 0), pollOptions: ["Grammarly", "DeepL Write", "ChatGPT", "自力"], pollVotes: {"Grammarly":[10001,10003],"DeepL Write":[10002],"ChatGPT":[10004],"自力":[99999]}, pollSettings: {} },
  ],
  "mc_105": [
    { id: "dcm_50", uid: 10003, name: "田中美咲", avatar: "M", color: "#3dae72",
      text: "RISC-Vのフィボナッチ、再帰で書いたらスタック操作が大変すぎた…", ts: d(-1, 15, 0) },
    { id: "dcm_51", uid: 99999, name: "テスト太郎", avatar: "T", color: "#888",
      text: "ループ版の方がアセンブリでは楽だよ：\n```asm\n# RISC-V fibonacci (iterative)\naddi a0, zero, 10    # n = 10\naddi t0, zero, 0     # fib(0) = 0\naddi t1, zero, 1     # fib(1) = 1\nloop:\n  beqz a0, done\n  add t2, t0, t1\n  mv t0, t1\n  mv t1, t2\n  addi a0, a0, -1\n  j loop\ndone:\n  mv a0, t0\n```", ts: d(-1, 15, 30) },
    { id: "dcm_52", uid: 10002, name: "鈴木一郎", avatar: "I", color: "#6375f0",
      text: "レポートのPDF、LaTeXのlstlistingsパッケージでコード載せるとき行番号付けた方がいい？", ts: d(0, 10, 0) },
    { id: "dcm_53", uid: 10004, name: "佐藤健太", avatar: "K", color: "#d4843e",
      text: "TAさんが「行番号あった方が採点しやすい」って言ってたからつけた方がいいよ", ts: d(0, 10, 20) },
  ],
  "mc_106": [
    { id: "dcm_60", uid: 10001, name: "山田花子", avatar: "H", color: "#e5534b",
      text: "ベイズの定理の問題、表に整理すると分かりやすい。事前確率・尤度・事後確率の3列で", ts: d(-1, 14, 0) },
    { id: "dcm_61", uid: 10002, name: "鈴木一郎", avatar: "I", color: "#6375f0",
      text: "全確率の公式 $P(B) = \\sum_i P(B|A_i)P(A_i)$ を忘れがちだけど、分母の計算で必須なんだよね", ts: d(-1, 14, 30) },
    { id: "dcm_62", uid: 99999, name: "テスト太郎", avatar: "T", color: "#888",
      text: "Pythonで分かりやすく：\n```python\n# ベイズの定理\nP_A = 0.01  # 事前確率（病気の確率）\nP_B_A = 0.99  # 尤度（陽性の確率|病気）\nP_B_notA = 0.05  # 偽陽性率\nP_B = P_B_A * P_A + P_B_notA * (1 - P_A)\nP_A_B = P_B_A * P_A / P_B\nprint(f'事後確率: {P_A_B:.4f}')  # 0.1670\n```\n事前確率1%でも偽陽性率が高いと事後確率はたった17%！", ts: d(0, 9, 30) },
    { id: "dcm_63", uid: 10003, name: "田中美咲", avatar: "M", color: "#3dae72",
      text: "📊 小テスト3の対策進んでる？",
      ts: d(0, 10, 0), pollOptions: ["バッチリ", "まあまあ", "これから", "白紙"], pollVotes: {"バッチリ":[],"まあまあ":[10002,99999],"これから":[10001,10003],"白紙":[10004,10005]}, pollSettings: {anon:true} },
  ],
  "mc_107": [
    { id: "dcm_70", uid: 10002, name: "鈴木一郎", avatar: "I", color: "#6375f0",
      text: "データハザードのフォワーディング、パイプラインの図を描くと理解しやすい", ts: d(-1, 14, 0) },
    { id: "dcm_71", uid: 99999, name: "テスト太郎", avatar: "T", color: "#888",
      text: "5段パイプライン（IF-ID-EX-MEM-WB）で `add` → `sub` のデータ依存がある場合：\n```\nadd x1, x2, x3   IF ID EX MEM WB\nsub x4, x1, x5      IF ID EX  MEM WB\n                        ↑ フォワーディング(EX→EX)\n```\nMEM→EXのフォワーディングもあるよ", ts: d(-1, 14, 30) },
    { id: "dcm_72", uid: 10001, name: "山田花子", avatar: "H", color: "#e5534b",
      text: "キャッシュのwrite-backとwrite-throughの違いがごっちゃになる…", ts: d(0, 10, 0) },
    { id: "dcm_73", uid: 10004, name: "佐藤健太", avatar: "K", color: "#d4843e",
      text: "**Write-through**: 書き込み即座にメモリへ（遅いけど一貫性◎）\n**Write-back**: キャッシュにだけ書く→追い出し時にメモリへ（速いけど複雑）\n\n最近のCPUはほぼwrite-back方式", ts: d(0, 10, 20) },
  ],
  "mc_108": [
    { id: "dcm_80", uid: 10004, name: "佐藤健太", avatar: "K", color: "#d4843e",
      text: "プロジェクトのグループ分け決まった？自分はB班になった", ts: d(-1, 13, 0) },
    { id: "dcm_81", uid: 10001, name: "山田花子", avatar: "H", color: "#e5534b",
      text: "自分もB班！テーマは「キャンパスのバリアフリー」にしようかと思ってるんだけど、どう？", ts: d(-1, 13, 15) },
    { id: "dcm_82", uid: 10003, name: "田中美咲", avatar: "M", color: "#3dae72",
      text: "いいと思う！実地調査もしやすいし、具体的な提案が出しやすいテーマだよね", ts: d(-1, 13, 30) },
    { id: "dcm_83", uid: 99999, name: "テスト太郎", avatar: "T", color: "#888",
      text: "📊 発表のスライドツール何使う？",
      ts: d(0, 9, 0), pollOptions: ["PowerPoint", "Google Slides", "Canva", "LaTeX Beamer"], pollVotes: {"PowerPoint":[10001,10004],"Google Slides":[10003,10002],"Canva":[10005],"LaTeX Beamer":[99999]}, pollSettings: {} },
  ],
};

// ══════════════════════════════════════
//  ペルソナ別 全クォーター コース定義
// ══════════════════════════════════════

// ── 情報工学系 (CSC) ──
const CSC_Q1 = [
  { id: "mc_q1_101", moodleId: 1101, code: "CSC.T213", name: "プログラミング基礎", per: "月1-2", room: "W6-31", col: "#a855c7", mem: 120, quarter: 1, building: "w6", bldg: "西6号館" },
  { id: "mc_q1_107", moodleId: 1107, code: "CSC.T215", name: "情報リテラシ", per: "月3-4", room: "W6-32", col: "#d4843e", mem: 110, quarter: 1, building: "w6", bldg: "西6号館" },
  { id: "mc_q1_102", moodleId: 1102, code: "MCS.T201", name: "微分積分学第一", per: "火1-2", room: "W5-21", col: "#6375f0", mem: 200, quarter: 1, building: "w5", bldg: "西5号館" },
  { id: "mc_q1_108", moodleId: 1108, code: "CSC.T217", name: "コンピュータサイエンス入門", per: "火3-4", room: "W6-31", col: "#c678dd", mem: 95, quarter: 1, building: "w6", bldg: "西6号館" },
  { id: "mc_q1_103", moodleId: 1103, code: "MCS.T211", name: "線形代数学第一", per: "水1-2", room: "W5-21", col: "#4a7cf7", mem: 200, quarter: 1, building: "w5", bldg: "西5号館" },
  { id: "mc_q1_104", moodleId: 1104, code: "LAS.A101", name: "英語第一 S", per: "木1-2", room: "W9-31", col: "#3dae72", mem: 30, quarter: 1, building: "w9", bldg: "西9号館" },
  { id: "mc_q1_109", moodleId: 1109, code: "LAS.C101", name: "化学基礎", per: "木3-4", room: "W5-32", col: "#e5534b", mem: 160, quarter: 1, building: "w5", bldg: "西5号館" },
  { id: "mc_q1_110", moodleId: 1110, code: "LAH.C101", name: "科学技術と社会", per: "木5-6", room: "WL1-201", col: "#2d9d8f", mem: 180, quarter: 1, building: "wl1", bldg: "西講義棟1" },
  { id: "mc_q1_105", moodleId: 1105, code: "LAS.M101", name: "物理学基礎", per: "金1-2", room: "W5-32", col: "#2d9d8f", mem: 180, quarter: 1, building: "w5", bldg: "西5号館" },
  { id: "mc_q1_106", moodleId: 1106, code: "LAH.S101", name: "東工大立志プロジェクト", per: "金3-4", room: "WL1-301", col: "#c75d8e", mem: 200, quarter: 1, building: "wl1", bldg: "西講義棟1" },
];
// CSC Q2 = DEMO_COURSES (既存)
const CSC_Q3 = [
  { id: "mc_q3_101", moodleId: 1301, code: "CSC.T233", name: "オペレーティングシステム", per: "月1-2", room: "W6-31", col: "#a855c7", mem: 90, quarter: 3, building: "w6", bldg: "西6号館" },
  { id: "mc_q3_102", moodleId: 1302, code: "CSC.T283", name: "ソフトウェア工学", per: "火1-2", room: "W6-31", col: "#c678dd", mem: 85, quarter: 3, building: "w6", bldg: "西6号館" },
  { id: "mc_q3_103", moodleId: 1303, code: "MCS.T301", name: "数値解析", per: "水1-2", room: "W5-21", col: "#6375f0", mem: 140, quarter: 3, building: "w5", bldg: "西5号館" },
  { id: "mc_q3_104", moodleId: 1304, code: "LAS.A201", name: "英語第三", per: "木1-2", room: "W9-31", col: "#3dae72", mem: 30, quarter: 3, building: "w9", bldg: "西9号館" },
  { id: "mc_q3_105", moodleId: 1305, code: "LAL.G101", name: "ドイツ語初級1", per: "金1-2", room: "W9-21", col: "#c6a236", mem: 25, quarter: 3, building: "w9", bldg: "西9号館" },
  { id: "mc_q3_106", moodleId: 1306, code: "LAW.A101", name: "現代社会論", per: "金5-6", room: "WL1-301", col: "#d4843e", mem: 180, quarter: 3, building: "wl1", bldg: "西講義棟1" },
];
const CSC_Q4 = [
  { id: "mc_q4_101", moodleId: 1401, code: "CSC.T293", name: "データベース", per: "月1-2", room: "W6-31", col: "#a855c7", mem: 88, quarter: 4, building: "w6", bldg: "西6号館" },
  { id: "mc_q4_102", moodleId: 1402, code: "CSC.T303", name: "コンピュータネットワーク", per: "火1-2", room: "S2-203", col: "#e5534b", mem: 80, quarter: 4, building: "s2", bldg: "南2号館" },
  { id: "mc_q4_103", moodleId: 1403, code: "CSC.T313", name: "人工知能基礎", per: "水1-2", room: "W6-31", col: "#c678dd", mem: 95, quarter: 4, building: "w6", bldg: "西6号館" },
  { id: "mc_q4_104", moodleId: 1404, code: "LAL.G103", name: "ドイツ語初級2", per: "木1-2", room: "W9-21", col: "#c6a236", mem: 25, quarter: 4, building: "w9", bldg: "西9号館" },
  { id: "mc_q4_105", moodleId: 1405, code: "LAH.T101", name: "哲学入門", per: "金1-2", room: "WL1-301", col: "#d4843e", mem: 150, quarter: 4, building: "wl1", bldg: "西講義棟1" },
];

// ── 工学院 機械系 (MEC) ──
const MEC_Q1 = [
  { id: "mc_q1_201", moodleId: 2101, code: "MEC.T101", name: "静力学", per: "月1-2", room: "S5-21", col: "#e5534b", mem: 130, quarter: 1, building: "s5", bldg: "南5号館" },
  { id: "mc_q1_202", moodleId: 2102, code: "LAS.S201", name: "微分積分学第一", per: "火1-2", room: "W5-21", col: "#6375f0", mem: 200, quarter: 1, building: "w5", bldg: "西5号館" },
  { id: "mc_q1_203", moodleId: 2103, code: "LAS.M101", name: "物理学基礎", per: "水1-2", room: "W5-32", col: "#2d9d8f", mem: 180, quarter: 1, building: "w5", bldg: "西5号館" },
  { id: "mc_q1_204", moodleId: 2104, code: "LAS.A101", name: "英語第一 S", per: "木1-2", room: "W9-31", col: "#3dae72", mem: 30, quarter: 1, building: "w9", bldg: "西9号館" },
  { id: "mc_q1_205", moodleId: 2105, code: "MEC.T111", name: "製図基礎", per: "金3-4", room: "S5-115", col: "#b86040", mem: 50, quarter: 1, building: "s5", bldg: "南5号館" },
  { id: "mc_q1_206", moodleId: 2106, code: "LAH.S101", name: "東工大立志プロジェクト", per: "金5-6", room: "WL1-301", col: "#c75d8e", mem: 200, quarter: 1, building: "wl1", bldg: "西講義棟1" },
];
const MEC_Q2 = [
  { id: "mc_201", moodleId: 201, code: "MEC.T201", name: "材料力学第一", per: "月1-2", room: "S5-21", col: "#e5534b", mem: 120, quarter: 2, building: "s5", bldg: "南5号館" },
  { id: "mc_202", moodleId: 202, code: "MEC.T211", name: "熱力学第一", per: "月3-4", room: "S5-32", col: "#d96854", mem: 110, quarter: 2, building: "s5", bldg: "南5号館" },
  { id: "mc_203", moodleId: 203, code: "MEC.T221", name: "流体力学第一", per: "火3-4", room: "S2-201", col: "#c6a236", mem: 100, quarter: 2, building: "s2", bldg: "南2号館" },
  { id: "mc_204", moodleId: 204, code: "MEC.T231", name: "機械力学", per: "水1-2", room: "W6-31", col: "#cf7c3e", mem: 95, quarter: 2, building: "w6", bldg: "西6号館" },
  { id: "mc_205", moodleId: 205, code: "MEC.T241", name: "機械製図", per: "水5-8", room: "S5-115", col: "#b86040", mem: 45, quarter: 2, building: "s5", bldg: "南5号館" },
  { id: "mc_206", moodleId: 206, code: "LAS.A101", name: "英語第二 S", per: "木1-2", room: "W9-31", col: "#3dae72", mem: 30, quarter: 2, building: "w9", bldg: "西9号館" },
  { id: "mc_207", moodleId: 207, code: "LAS.S203", name: "微分積分学第二", per: "金1-2", room: "W5-21", col: "#6375f0", mem: 180, quarter: 2, building: "w5", bldg: "西5号館" },
  { id: "mc_208", moodleId: 208, code: "LAS.C103", name: "東工大立志プロジェクト", per: "金5-6", room: "WL1-301", col: "#c75d8e", mem: 200, quarter: 2, building: "wl1", bldg: "西講義棟1" },
];
const MEC_Q3 = [
  { id: "mc_q3_201", moodleId: 2301, code: "MEC.T251", name: "制御工学第一", per: "月1-2", room: "S5-21", col: "#e5534b", mem: 100, quarter: 3, building: "s5", bldg: "南5号館" },
  { id: "mc_q3_202", moodleId: 2302, code: "MEC.T261", name: "機械加工学", per: "火3-4", room: "S5-32", col: "#d96854", mem: 90, quarter: 3, building: "s5", bldg: "南5号館" },
  { id: "mc_q3_203", moodleId: 2303, code: "MEC.T271", name: "機械工学実験第一", per: "水5-8", room: "石川台実験棟", col: "#b86040", mem: 40, quarter: 3, building: "ishikawadai", bldg: "石川台実験棟" },
  { id: "mc_q3_204", moodleId: 2304, code: "LAS.A201", name: "英語第三", per: "木1-2", room: "W9-31", col: "#3dae72", mem: 30, quarter: 3, building: "w9", bldg: "西9号館" },
  { id: "mc_q3_205", moodleId: 2305, code: "LAL.G101", name: "ドイツ語初級1", per: "金1-2", room: "W9-21", col: "#c6a236", mem: 25, quarter: 3, building: "w9", bldg: "西9号館" },
];
const MEC_Q4 = [
  { id: "mc_q4_201", moodleId: 2401, code: "MEC.T281", name: "機械設計", per: "月1-2", room: "S5-21", col: "#e5534b", mem: 95, quarter: 4, building: "s5", bldg: "南5号館" },
  { id: "mc_q4_202", moodleId: 2402, code: "MEC.T291", name: "振動工学", per: "火3-4", room: "S5-32", col: "#cf7c3e", mem: 85, quarter: 4, building: "s5", bldg: "南5号館" },
  { id: "mc_q4_203", moodleId: 2403, code: "MEC.T301", name: "CAD/CAM", per: "水3-4", room: "S5-115", col: "#b86040", mem: 50, quarter: 4, building: "s5", bldg: "南5号館" },
  { id: "mc_q4_204", moodleId: 2404, code: "LAL.G103", name: "ドイツ語初級2", per: "木1-2", room: "W9-21", col: "#c6a236", mem: 25, quarter: 4, building: "w9", bldg: "西9号館" },
  { id: "mc_q4_205", moodleId: 2405, code: "LAH.T101", name: "哲学入門", per: "金1-2", room: "WL1-301", col: "#d4843e", mem: 150, quarter: 4, building: "wl1", bldg: "西講義棟1" },
];

// ── 理学院 物理学系 (PHY) ──
const PHY_Q1 = [
  { id: "mc_q1_301", moodleId: 3101, code: "PHY.S110", name: "力学基礎", per: "月1-2", room: "W5-21", col: "#4a7cf7", mem: 90, quarter: 1, building: "w5", bldg: "西5号館" },
  { id: "mc_q1_302", moodleId: 3102, code: "MTH.T201", name: "微分積分学第一", per: "火1-2", room: "W5-21", col: "#6375f0", mem: 200, quarter: 1, building: "w5", bldg: "西5号館" },
  { id: "mc_q1_303", moodleId: 3103, code: "MTH.T211", name: "線形代数学第一", per: "水1-2", room: "W5-32", col: "#a855c7", mem: 200, quarter: 1, building: "w5", bldg: "西5号館" },
  { id: "mc_q1_304", moodleId: 3104, code: "PHY.S120", name: "電磁気学第一", per: "木3-4", room: "W5-21", col: "#5681e8", mem: 85, quarter: 1, building: "w5", bldg: "西5号館" },
  { id: "mc_q1_305", moodleId: 3105, code: "LAS.A101", name: "英語第一 S", per: "木1-2", room: "W9-31", col: "#3dae72", mem: 30, quarter: 1, building: "w9", bldg: "西9号館" },
  { id: "mc_q1_306", moodleId: 3106, code: "LAS.C101", name: "化学基礎", per: "金1-2", room: "W5-32", col: "#2d9d8f", mem: 170, quarter: 1, building: "w5", bldg: "西5号館" },
];
const PHY_Q2 = [
  { id: "mc_301", moodleId: 301, code: "PHY.S210", name: "量子力学第一", per: "月1-2", room: "W5-21", col: "#4a7cf7", mem: 80, quarter: 2, building: "w5", bldg: "西5号館" },
  { id: "mc_302", moodleId: 302, code: "PHY.S220", name: "電磁気学第二", per: "月3-4", room: "W5-32", col: "#6375f0", mem: 90, quarter: 2, building: "w5", bldg: "西5号館" },
  { id: "mc_303", moodleId: 303, code: "PHY.S230", name: "統計力学第一", per: "火3-4", room: "W6-31", col: "#5681e8", mem: 75, quarter: 2, building: "w6", bldg: "西6号館" },
  { id: "mc_304", moodleId: 304, code: "MTH.T211", name: "解析学第二", per: "水1-2", room: "W5-21", col: "#a855c7", mem: 150, quarter: 2, building: "w5", bldg: "西5号館" },
  { id: "mc_305", moodleId: 305, code: "PHY.S240", name: "物理学実験第二", per: "水5-8", room: "本館-B1", col: "#2d9d8f", mem: 40, quarter: 2, building: "main", bldg: "本館" },
  { id: "mc_306", moodleId: 306, code: "LAS.A101", name: "英語第二 S", per: "木1-2", room: "W9-31", col: "#3dae72", mem: 30, quarter: 2, building: "w9", bldg: "西9号館" },
  { id: "mc_307", moodleId: 307, code: "PHY.S250", name: "物理数学演習", per: "金1-2", room: "W5-32", col: "#c678dd", mem: 60, quarter: 2, building: "w5", bldg: "西5号館" },
  { id: "mc_308", moodleId: 308, code: "LAH.S201", name: "科学技術と社会", per: "金5-6", room: "WL1-301", col: "#c75d8e", mem: 200, quarter: 2, building: "wl1", bldg: "西講義棟1" },
];
const PHY_Q3 = [
  { id: "mc_q3_301", moodleId: 3301, code: "PHY.S310", name: "量子力学第二", per: "月1-2", room: "W5-21", col: "#4a7cf7", mem: 65, quarter: 3, building: "w5", bldg: "西5号館" },
  { id: "mc_q3_302", moodleId: 3302, code: "PHY.S320", name: "光学", per: "火3-4", room: "W5-32", col: "#6375f0", mem: 70, quarter: 3, building: "w5", bldg: "西5号館" },
  { id: "mc_q3_303", moodleId: 3303, code: "PHY.S330", name: "固体物理学", per: "水1-2", room: "W5-21", col: "#5681e8", mem: 60, quarter: 3, building: "w5", bldg: "西5号館" },
  { id: "mc_q3_304", moodleId: 3304, code: "LAS.A201", name: "英語第三", per: "木1-2", room: "W9-31", col: "#3dae72", mem: 30, quarter: 3, building: "w9", bldg: "西9号館" },
  { id: "mc_q3_305", moodleId: 3305, code: "LAL.G101", name: "ドイツ語初級1", per: "金1-2", room: "W9-21", col: "#c6a236", mem: 25, quarter: 3, building: "w9", bldg: "西9号館" },
];
const PHY_Q4 = [
  { id: "mc_q4_301", moodleId: 3401, code: "PHY.S410", name: "原子核物理学", per: "月1-2", room: "W5-21", col: "#4a7cf7", mem: 55, quarter: 4, building: "w5", bldg: "西5号館" },
  { id: "mc_q4_302", moodleId: 3402, code: "PHY.S420", name: "宇宙物理学", per: "火3-4", room: "W5-32", col: "#5681e8", mem: 60, quarter: 4, building: "w5", bldg: "西5号館" },
  { id: "mc_q4_303", moodleId: 3403, code: "PHY.S440", name: "物理学実験第三", per: "水5-8", room: "本館-B1", col: "#2d9d8f", mem: 35, quarter: 4, building: "main", bldg: "本館" },
  { id: "mc_q4_304", moodleId: 3404, code: "LAL.G103", name: "ドイツ語初級2", per: "木1-2", room: "W9-21", col: "#c6a236", mem: 25, quarter: 4, building: "w9", bldg: "西9号館" },
  { id: "mc_q4_305", moodleId: 3405, code: "LAH.T101", name: "哲学入門", per: "金1-2", room: "WL1-301", col: "#d4843e", mem: 150, quarter: 4, building: "wl1", bldg: "西講義棟1" },
];

// ── 物質理工学院 応用化学系 (CAP) ──
const CAP_Q1 = [
  { id: "mc_q1_401", moodleId: 4101, code: "CAP.A101", name: "有機化学第一", per: "月1-2", room: "S4-21", col: "#5cb88a", mem: 75, quarter: 1, building: "s4", bldg: "南4号館" },
  { id: "mc_q1_402", moodleId: 4102, code: "LAS.S201", name: "微分積分学第一", per: "火1-2", room: "W5-21", col: "#6375f0", mem: 200, quarter: 1, building: "w5", bldg: "西5号館" },
  { id: "mc_q1_403", moodleId: 4103, code: "LAS.M101", name: "物理学基礎", per: "水1-2", room: "W5-32", col: "#2d9d8f", mem: 180, quarter: 1, building: "w5", bldg: "西5号館" },
  { id: "mc_q1_404", moodleId: 4104, code: "CAP.A111", name: "物理化学第一", per: "木3-4", room: "S4-32", col: "#3dae72", mem: 68, quarter: 1, building: "s4", bldg: "南4号館" },
  { id: "mc_q1_405", moodleId: 4105, code: "LAS.A101", name: "英語第一 S", per: "木1-2", room: "W9-31", col: "#3dae72", mem: 30, quarter: 1, building: "w9", bldg: "西9号館" },
  { id: "mc_q1_406", moodleId: 4106, code: "LAH.S101", name: "東工大立志プロジェクト", per: "金5-6", room: "WL1-301", col: "#c75d8e", mem: 200, quarter: 1, building: "wl1", bldg: "西講義棟1" },
];
const CAP_Q2 = [
  { id: "mc_401", moodleId: 401, code: "CAP.A201", name: "有機化学第二", per: "月1-2", room: "S4-21", col: "#5cb88a", mem: 70, quarter: 2, building: "s4", bldg: "南4号館" },
  { id: "mc_402", moodleId: 402, code: "CAP.A211", name: "物理化学第二", per: "月3-4", room: "S4-32", col: "#3dae72", mem: 65, quarter: 2, building: "s4", bldg: "南4号館" },
  { id: "mc_403", moodleId: 403, code: "CAP.A221", name: "無機化学第一", per: "火3-4", room: "S4-21", col: "#2d9d8f", mem: 60, quarter: 2, building: "s4", bldg: "南4号館" },
  { id: "mc_404", moodleId: 404, code: "CAP.A231", name: "分析化学", per: "水1-2", room: "S4-115", col: "#c6a236", mem: 55, quarter: 2, building: "s4", bldg: "南4号館" },
  { id: "mc_405", moodleId: 405, code: "CAP.A241", name: "化学実験第二", per: "水5-8", room: "S4-B1", col: "#d4843e", mem: 35, quarter: 2, building: "s4", bldg: "南4号館" },
  { id: "mc_406", moodleId: 406, code: "LAS.A101", name: "英語第二 S", per: "木1-2", room: "W9-31", col: "#3dae72", mem: 30, quarter: 2, building: "w9", bldg: "西9号館" },
  { id: "mc_407", moodleId: 407, code: "LAS.S203", name: "微分積分学第二", per: "金1-2", room: "W5-21", col: "#6375f0", mem: 180, quarter: 2, building: "w5", bldg: "西5号館" },
  { id: "mc_408", moodleId: 408, code: "LAS.C103", name: "東工大立志プロジェクト", per: "金5-6", room: "WL1-301", col: "#c75d8e", mem: 200, quarter: 2, building: "wl1", bldg: "西講義棟1" },
];
const CAP_Q3 = [
  { id: "mc_q3_401", moodleId: 4301, code: "CAP.A301", name: "高分子化学", per: "月1-2", room: "S4-21", col: "#5cb88a", mem: 55, quarter: 3, building: "s4", bldg: "南4号館" },
  { id: "mc_q3_402", moodleId: 4302, code: "CAP.A311", name: "化学工学基礎", per: "火3-4", room: "S4-32", col: "#3dae72", mem: 60, quarter: 3, building: "s4", bldg: "南4号館" },
  { id: "mc_q3_403", moodleId: 4303, code: "CAP.A321", name: "生化学", per: "水1-2", room: "S4-21", col: "#2d9d8f", mem: 50, quarter: 3, building: "s4", bldg: "南4号館" },
  { id: "mc_q3_404", moodleId: 4304, code: "LAS.A201", name: "英語第三", per: "木1-2", room: "W9-31", col: "#3dae72", mem: 30, quarter: 3, building: "w9", bldg: "西9号館" },
  { id: "mc_q3_405", moodleId: 4305, code: "LAL.G101", name: "ドイツ語初級1", per: "金1-2", room: "W9-21", col: "#c6a236", mem: 25, quarter: 3, building: "w9", bldg: "西9号館" },
];
const CAP_Q4 = [
  { id: "mc_q4_401", moodleId: 4401, code: "CAP.A401", name: "機器分析", per: "月1-2", room: "S4-21", col: "#5cb88a", mem: 50, quarter: 4, building: "s4", bldg: "南4号館" },
  { id: "mc_q4_402", moodleId: 4402, code: "CAP.A411", name: "触媒化学", per: "火3-4", room: "S4-32", col: "#3dae72", mem: 45, quarter: 4, building: "s4", bldg: "南4号館" },
  { id: "mc_q4_403", moodleId: 4403, code: "CAP.A421", name: "化学実験第三", per: "水5-8", room: "S4-B1", col: "#d4843e", mem: 30, quarter: 4, building: "s4", bldg: "南4号館" },
  { id: "mc_q4_404", moodleId: 4404, code: "LAL.G103", name: "ドイツ語初級2", per: "木1-2", room: "W9-21", col: "#c6a236", mem: 25, quarter: 4, building: "w9", bldg: "西9号館" },
  { id: "mc_q4_405", moodleId: 4405, code: "LAH.T101", name: "哲学入門", per: "金1-2", room: "WL1-301", col: "#d4843e", mem: 150, quarter: 4, building: "wl1", bldg: "西講義棟1" },
];

// ── 医学部 医学科 (MED_M) ──
const MED_Q1 = [
  { id: "mc_q1_501", moodleId: 5101, code: "MED.A101", name: "解剖学I", per: "月1-2", room: "M&Dタワー26F", col: "#e04e6a", mem: 110, quarter: 1, building: "mdt", bldg: "M&Dタワー" },
  { id: "mc_q1_502", moodleId: 5102, code: "MED.A111", name: "生理学I", per: "火1-2", room: "1号館-講義室A", col: "#d4577a", mem: 110, quarter: 1, building: "ichi", bldg: "1号館" },
  { id: "mc_q1_503", moodleId: 5103, code: "MED.A121", name: "生化学I", per: "水1-2", room: "M&Dタワー26F", col: "#c9405e", mem: 110, quarter: 1, building: "mdt", bldg: "M&Dタワー" },
  { id: "mc_q1_504", moodleId: 5104, code: "MED.A131", name: "組織学", per: "水3-4", room: "3号館-201", col: "#e86b83", mem: 110, quarter: 1, building: "san", bldg: "3号館" },
  { id: "mc_q1_505", moodleId: 5105, code: "MED.A141", name: "医学英語I", per: "木1-2", room: "1号館-講義室B", col: "#3dae72", mem: 110, quarter: 1, building: "ichi", bldg: "1号館" },
  { id: "mc_q1_506", moodleId: 5106, code: "MED.A151", name: "医療概論", per: "金1-2", room: "M&Dタワー26F", col: "#6375f0", mem: 110, quarter: 1, building: "mdt", bldg: "M&Dタワー" },
];
const MED_Q2 = [
  { id: "mc_501", moodleId: 501, code: "MED.A202", name: "解剖学II", per: "月1-2", room: "M&Dタワー26F", col: "#e04e6a", mem: 110, quarter: 2, building: "mdt", bldg: "M&Dタワー" },
  { id: "mc_502", moodleId: 502, code: "MED.A212", name: "生理学II", per: "月3-4", room: "1号館-講義室A", col: "#d4577a", mem: 110, quarter: 2, building: "ichi", bldg: "1号館" },
  { id: "mc_503", moodleId: 503, code: "MED.A222", name: "生化学II", per: "火1-2", room: "M&Dタワー26F", col: "#c9405e", mem: 110, quarter: 2, building: "mdt", bldg: "M&Dタワー" },
  { id: "mc_504", moodleId: 504, code: "MED.A232", name: "微生物学", per: "火5-6", room: "3号館-201", col: "#a855c7", mem: 110, quarter: 2, building: "san", bldg: "3号館" },
  { id: "mc_505", moodleId: 505, code: "MED.A242", name: "免疫学", per: "水1-2", room: "M&Dタワー26F", col: "#2d9d8f", mem: 110, quarter: 2, building: "mdt", bldg: "M&Dタワー" },
  { id: "mc_506", moodleId: 506, code: "MED.A252", name: "医学英語II", per: "木1-2", room: "1号館-講義室B", col: "#3dae72", mem: 110, quarter: 2, building: "ichi", bldg: "1号館" },
  { id: "mc_507", moodleId: 507, code: "MED.A262", name: "発生学", per: "木3-4", room: "3号館-201", col: "#e86b83", mem: 110, quarter: 2, building: "san", bldg: "3号館" },
  { id: "mc_508", moodleId: 508, code: "MED.A272", name: "人体構造実習", per: "金3-8", room: "解剖実習室", col: "#d96854", mem: 110, quarter: 2, building: "kaibou", bldg: "解剖実習棟" },
];
const MED_Q3 = [
  { id: "mc_q3_501", moodleId: 5301, code: "MED.A301", name: "病理学I", per: "月1-2", room: "M&Dタワー26F", col: "#e04e6a", mem: 110, quarter: 3, building: "mdt", bldg: "M&Dタワー" },
  { id: "mc_q3_502", moodleId: 5302, code: "MED.A311", name: "薬理学I", per: "火1-2", room: "1号館-講義室A", col: "#d4577a", mem: 110, quarter: 3, building: "ichi", bldg: "1号館" },
  { id: "mc_q3_503", moodleId: 5303, code: "MED.A321", name: "社会医学", per: "水1-2", room: "3号館-201", col: "#6375f0", mem: 110, quarter: 3, building: "san", bldg: "3号館" },
  { id: "mc_q3_504", moodleId: 5304, code: "MED.A331", name: "医学統計学", per: "木1-2", room: "M&Dタワー26F", col: "#c6a236", mem: 110, quarter: 3, building: "mdt", bldg: "M&Dタワー" },
  { id: "mc_q3_505", moodleId: 5305, code: "MED.A341", name: "医学研究入門", per: "金3-8", room: "各研究室", col: "#a855c7", mem: 110, quarter: 3, building: "lab", bldg: "各研究室" },
];
const MED_Q4 = [
  { id: "mc_q4_501", moodleId: 5401, code: "MED.A302", name: "病理学II", per: "月1-2", room: "M&Dタワー26F", col: "#e04e6a", mem: 110, quarter: 4, building: "mdt", bldg: "M&Dタワー" },
  { id: "mc_q4_502", moodleId: 5402, code: "MED.A312", name: "薬理学II", per: "火1-2", room: "1号館-講義室A", col: "#d4577a", mem: 110, quarter: 4, building: "ichi", bldg: "1号館" },
  { id: "mc_q4_503", moodleId: 5403, code: "MED.A352", name: "寄生虫学", per: "水1-2", room: "3号館-201", col: "#2d9d8f", mem: 110, quarter: 4, building: "san", bldg: "3号館" },
  { id: "mc_q4_504", moodleId: 5404, code: "MED.A362", name: "法医学", per: "木1-2", room: "M&Dタワー26F", col: "#c9405e", mem: 110, quarter: 4, building: "mdt", bldg: "M&Dタワー" },
  { id: "mc_q4_505", moodleId: 5405, code: "MED.A372", name: "病理実習", per: "金3-8", room: "病理実習室", col: "#d96854", mem: 110, quarter: 4, building: "byouri", bldg: "病理実習室" },
];

// ── 歯学部 歯学科 (DEN_D) ──
const DEN_Q1 = [
  { id: "mc_q1_601", moodleId: 6101, code: "DEN.A101", name: "口腔解剖学I", per: "月1-2", room: "1号館-第1講義室", col: "#4ea8e0", mem: 55, quarter: 1, building: "ichi", bldg: "1号館" },
  { id: "mc_q1_602", moodleId: 6102, code: "DEN.A111", name: "口腔生理学I", per: "火1-2", room: "1号館-第2講義室", col: "#3d96cf", mem: 55, quarter: 1, building: "ichi", bldg: "1号館" },
  { id: "mc_q1_603", moodleId: 6103, code: "DEN.A121", name: "口腔生化学", per: "水1-2", room: "3号館-歯科棟301", col: "#6bb8e8", mem: 55, quarter: 1, building: "san", bldg: "3号館" },
  { id: "mc_q1_604", moodleId: 6104, code: "DEN.A131", name: "歯科材料学I", per: "水3-4", room: "3号館-歯科棟301", col: "#2d8abf", mem: 55, quarter: 1, building: "san", bldg: "3号館" },
  { id: "mc_q1_605", moodleId: 6105, code: "DEN.A141", name: "歯学英語I", per: "木1-2", room: "1号館-第2講義室", col: "#3dae72", mem: 55, quarter: 1, building: "ichi", bldg: "1号館" },
  { id: "mc_q1_606", moodleId: 6106, code: "DEN.A151", name: "歯学概論", per: "金1-2", room: "1号館-第1講義室", col: "#6375f0", mem: 55, quarter: 1, building: "ichi", bldg: "1号館" },
];
const DEN_Q2 = [
  { id: "mc_601", moodleId: 601, code: "DEN.A202", name: "口腔解剖学II", per: "月1-2", room: "1号館-第1講義室", col: "#4ea8e0", mem: 55, quarter: 2, building: "ichi", bldg: "1号館" },
  { id: "mc_602", moodleId: 602, code: "DEN.A212", name: "口腔生理学II", per: "月3-4", room: "1号館-第2講義室", col: "#3d96cf", mem: 55, quarter: 2, building: "ichi", bldg: "1号館" },
  { id: "mc_603", moodleId: 603, code: "DEN.A222", name: "口腔微生物学", per: "火1-2", room: "3号館-歯科棟301", col: "#2d9d8f", mem: 55, quarter: 2, building: "san", bldg: "3号館" },
  { id: "mc_604", moodleId: 604, code: "DEN.A232", name: "歯科材料学II", per: "火3-4", room: "3号館-歯科棟301", col: "#2d8abf", mem: 55, quarter: 2, building: "san", bldg: "3号館" },
  { id: "mc_605", moodleId: 605, code: "DEN.A242", name: "口腔組織学", per: "水1-2", room: "1号館-第1講義室", col: "#6bb8e8", mem: 55, quarter: 2, building: "ichi", bldg: "1号館" },
  { id: "mc_606", moodleId: 606, code: "DEN.A252", name: "歯学英語II", per: "木1-2", room: "1号館-第2講義室", col: "#3dae72", mem: 55, quarter: 2, building: "ichi", bldg: "1号館" },
  { id: "mc_607", moodleId: 607, code: "DEN.A262", name: "歯科薬理学", per: "木3-4", room: "3号館-歯科棟301", col: "#a855c7", mem: 55, quarter: 2, building: "san", bldg: "3号館" },
  { id: "mc_608", moodleId: 608, code: "DEN.A272", name: "歯科基礎実習", per: "金3-8", room: "歯科基礎実習室", col: "#d4843e", mem: 55, quarter: 2, building: "shika", bldg: "歯科基礎実習室" },
];
const DEN_Q3 = [
  { id: "mc_q3_601", moodleId: 6301, code: "DEN.A301", name: "口腔病理学", per: "月1-2", room: "1号館-第1講義室", col: "#4ea8e0", mem: 55, quarter: 3, building: "ichi", bldg: "1号館" },
  { id: "mc_q3_602", moodleId: 6302, code: "DEN.A311", name: "歯科補綴学I", per: "火1-2", room: "3号館-歯科棟301", col: "#3d96cf", mem: 55, quarter: 3, building: "san", bldg: "3号館" },
  { id: "mc_q3_603", moodleId: 6303, code: "DEN.A321", name: "保存修復学", per: "水1-2", room: "1号館-第1講義室", col: "#6bb8e8", mem: 55, quarter: 3, building: "ichi", bldg: "1号館" },
  { id: "mc_q3_604", moodleId: 6304, code: "DEN.A331", name: "歯科放射線学", per: "木1-2", room: "3号館-歯科棟301", col: "#2d8abf", mem: 55, quarter: 3, building: "san", bldg: "3号館" },
  { id: "mc_q3_605", moodleId: 6305, code: "DEN.A341", name: "歯科模型実習", per: "金3-8", room: "歯科模型実習室", col: "#d4843e", mem: 55, quarter: 3, building: "mokei", bldg: "歯科模型実習室" },
];
const DEN_Q4 = [
  { id: "mc_q4_601", moodleId: 6401, code: "DEN.A302", name: "歯周病学", per: "月1-2", room: "1号館-第1講義室", col: "#4ea8e0", mem: 55, quarter: 4, building: "ichi", bldg: "1号館" },
  { id: "mc_q4_602", moodleId: 6402, code: "DEN.A312", name: "歯科補綴学II", per: "火1-2", room: "3号館-歯科棟301", col: "#3d96cf", mem: 55, quarter: 4, building: "san", bldg: "3号館" },
  { id: "mc_q4_603", moodleId: 6403, code: "DEN.A322", name: "歯内療法学", per: "水1-2", room: "1号館-第1講義室", col: "#6bb8e8", mem: 55, quarter: 4, building: "ichi", bldg: "1号館" },
  { id: "mc_q4_604", moodleId: 6404, code: "DEN.A332", name: "口腔外科学I", per: "木1-2", room: "3号館-歯科棟301", col: "#2d8abf", mem: 55, quarter: 4, building: "san", bldg: "3号館" },
  { id: "mc_q4_605", moodleId: 6405, code: "DEN.A342", name: "歯科臨床基礎実習", per: "金3-8", room: "歯科臨床実習室", col: "#d4843e", mem: 55, quarter: 4, building: "rinsho", bldg: "歯科臨床実習室" },
];

// ── 課題テンプレ生成 (Q2 アクティブ + Q1 完了済み) ──
function buildPersonaAsgn(q1Courses, q2Courses) {
  const c = q2Courses;
  const q1 = q1Courses;
  return [
    // Q2 アクティブ課題
    { id: "da_1", moodleId: 501, cid: c[0].id, title: `${c[0].name} 第3回レポート`, desc: "レポート課題。指定の形式で提出せよ。", due: d(2), type: "assignment", st: "not_started", pri: 2, subs: [] },
    { id: "da_2", moodleId: 502, cid: c[0].id, title: `${c[0].name} 演習4`, desc: "演習問題。", due: d(5), type: "assignment", st: "in_progress", pri: 1, subs: [{ id: "s1", t: "問1-3", d: true }, { id: "s2", t: "問4-6", d: false }] },
    { id: "da_3", moodleId: 503, cid: c[1].id, title: `${c[1].name} 問題セット5`, desc: "演習問題セット。", due: d(3), type: "assignment", st: "not_started", pri: 1, subs: [] },
    { id: "da_4", moodleId: 504, cid: c[2].id, title: `${c[2].name} 中間レポート`, desc: "中間レポート課題。", due: d(7), type: "assignment", st: "not_started", pri: 1, subs: [] },
    { id: "da_5", moodleId: 505, cid: c[4].id, title: `${c[4].name} レポート第2回`, desc: "実験・演習レポート。", due: d(1), type: "assignment", st: "in_progress", pri: 3, subs: [{ id: "s4", t: "実施内容", d: true }, { id: "s5", t: "考察", d: false }, { id: "s6", t: "PDF作成", d: false }] },
    { id: "da_6", moodleId: 506, cid: c[5].id, title: "Essay: Technology and Society", desc: "Write a 500-word essay on the impact of AI on modern society.", due: d(10), type: "assignment", st: "not_started", pri: 0, subs: [] },
    { id: "da_7", moodleId: 507, cid: c[3].id, title: `${c[3].name} 小テスト3`, desc: "第7-9回の範囲。", due: d(4), type: "quiz", st: "not_started", pri: 1, subs: [] },
    // Q2 完了済み
    { id: "da_8", moodleId: 508, cid: c[0].id, title: `${c[0].name} 演習3`, desc: "前回の演習。", due: d(-2), type: "assignment", st: "completed", sub: d(-3), pri: 1, subs: [] },
    { id: "da_9", moodleId: 509, cid: c[1].id, title: `${c[1].name} 問題セット4`, desc: "前回の問題セット。", due: d(-5), type: "assignment", st: "completed", sub: d(-6), pri: 1, subs: [] },
    { id: "da_10", moodleId: 510, cid: c[6].id, title: `${c[6].name} 小テスト2`, desc: "前回の小テスト。", due: d(-1), type: "quiz", st: "completed", sub: d(-1, 10, 0), pri: 1, subs: [] },
    // Q1 完了済み（前クォーター）
    { id: "da_q1_1", moodleId: 601, cid: q1[0].id, title: `${q1[0].name} 期末レポート`, desc: "期末レポート。", due: d(-45), type: "assignment", st: "completed", sub: d(-46), pri: 1, subs: [] },
    { id: "da_q1_2", moodleId: 602, cid: q1[1].id, title: `${q1[1].name} 期末試験対策`, desc: "期末演習。", due: d(-42), type: "assignment", st: "completed", sub: d(-43), pri: 1, subs: [] },
    { id: "da_q1_3", moodleId: 603, cid: q1[0].id, title: `${q1[0].name} 演習6`, desc: "最終演習。", due: d(-50), type: "assignment", st: "completed", sub: d(-51), pri: 1, subs: [] },
    { id: "da_q1_4", moodleId: 604, cid: q1[2].id, title: `${q1[2].name} 最終レポート`, desc: "最終レポート。", due: d(-40), type: "assignment", st: "completed", sub: d(-41), pri: 1, subs: [] },
  ];
}

// ── ペルソナ定義（全クォーター対応） ──
const DEMO_PERSONAS = [
  {
    id: "csc",
    name: "テスト太郎",
    dept: "情報工学系",
    deptKey: "CSC",
    school: "情報理工学院",
    schoolCol: "#a855c7",
    year: "B2",
    yearGroup: "25B",
    studentId: "25B30099",
    icon: "💻",
    q: { 1: CSC_Q1, 2: DEMO_COURSES, 3: CSC_Q3, 4: CSC_Q4 },
    asgn: DEMO_ASGN,
  },
  {
    id: "mec",
    name: "鉄野 修平",
    dept: "機械系",
    deptKey: "MEC",
    school: "工学院",
    schoolCol: "#e5534b",
    year: "B2",
    yearGroup: "25B",
    studentId: "25B10042",
    icon: "⚙️",
    q: { 1: MEC_Q1, 2: MEC_Q2, 3: MEC_Q3, 4: MEC_Q4 },
    asgn: null,
  },
  {
    id: "phy",
    name: "波動 理沙",
    dept: "物理学系",
    deptKey: "PHY",
    school: "理学院",
    schoolCol: "#4a7cf7",
    year: "B2",
    yearGroup: "25B",
    studentId: "25B00018",
    icon: "🔬",
    q: { 1: PHY_Q1, 2: PHY_Q2, 3: PHY_Q3, 4: PHY_Q4 },
    asgn: null,
  },
  {
    id: "cap",
    name: "分子 あゆみ",
    dept: "応用化学系",
    deptKey: "CAP",
    school: "物質理工学院",
    schoolCol: "#3dae72",
    year: "B2",
    yearGroup: "25B",
    studentId: "25B20055",
    icon: "🧪",
    q: { 1: CAP_Q1, 2: CAP_Q2, 3: CAP_Q3, 4: CAP_Q4 },
    asgn: null,
  },
  {
    id: "ss",
    name: "藤原 陽翔",
    dept: "情報工学系",
    deptKey: "CSC",
    school: "情報理工学院",
    schoolCol: "#a855c7",
    year: "B2",
    yearGroup: "25B",
    studentId: "25B30042",
    icon: "📱",
    q: { 1: CSC_Q1, 2: DEMO_COURSES, 3: CSC_Q3, 4: CSC_Q4 },
    asgn: DEMO_ASGN,
    _screenshot: true,
  },
  {
    id: "med",
    name: "白石 遥",
    dept: "医学科",
    deptKey: "MED_M",
    school: "医学部",
    schoolCol: "#e04e6a",
    year: "B2",
    yearGroup: "25B",
    studentId: "25B61033",
    icon: "🩺",
    q: { 1: MED_Q1, 2: MED_Q2, 3: MED_Q3, 4: MED_Q4 },
    asgn: null,
  },
  {
    id: "den",
    name: "清水 凛",
    dept: "歯学科",
    deptKey: "DEN_D",
    school: "歯学部",
    schoolCol: "#4ea8e0",
    year: "B2",
    yearGroup: "25B",
    studentId: "25B65017",
    icon: "🦷",
    q: { 1: DEN_Q1, 2: DEN_Q2, 3: DEN_Q3, 4: DEN_Q4 },
    asgn: null,
  },
];

// ══════════════════════════════════════════════
//  ペルソナ別 フィード投稿・チャット・通知・成績
// ══════════════════════════════════════════════

// 共通ポスターテンプレ
const P1 = { uid: 10001, name: "山田花子", avatar: "H", color: "#e5534b" };
const P2 = { uid: 10002, name: "鈴木一郎", avatar: "I", color: "#6375f0" };
const P3 = { uid: 10003, name: "田中美咲", avatar: "M", color: "#3dae72" };
const P4 = { uid: 10004, name: "佐藤健太", avatar: "K", color: "#d4843e" };
const P5 = { uid: 10005, name: "高橋優", avatar: "Y", color: "#a855c7" };
const PU = { uid: 99999, name: "テスト", avatar: "T", color: "#888" };
const PA = { uid: 0, name: "匿名", avatar: "?", color: "#68687a" };

// ── MEC 投稿 ──
function mecPosts(c) {
  return {
    [c[0].id]: [ // 材料力学
      { id: 2700, ...P1, text: "📌 **中間レポート提出要件**\n- 形式: PDF（A4, 10ページ以内）\n- ファイル名: `学籍番号_report_mid.pdf`\n- 締切: 来週金曜 23:59\n- 提出先: Moodle\n\n遅延提出は**1日ごとに10%減点**",
        type: "info", likes: [10002,10003,10004,99999], ts: d(-2,10,0), pinned: true, commentCount: 2, reactions: {"👍":[10002,10003,10004]} },
      { id: 2701, ...P2, text: "応力-ひずみ線図の降伏点の判定、0.2%オフセット法でやるのが普通？教科書だと明瞭降伏点の説明しかないんだけど…\n$$\\sigma_y = \\frac{F_y}{A_0}, \\quad \\varepsilon = \\frac{\\Delta L}{L_0}$$",
        type: "question", likes: [10001,10003], ts: d(0,11,30), commentCount: 3, reactions: {"👍":[10001]} },
      { id: 2702, ...P3, text: "**モールの応力円**の作図手順まとめ：\n1. $\\sigma_x, \\sigma_y, \\tau_{xy}$ から中心 $C = \\frac{\\sigma_x + \\sigma_y}{2}$ を求める\n2. 半径 $R = \\sqrt{\\left(\\frac{\\sigma_x - \\sigma_y}{2}\\right)^2 + \\tau_{xy}^2}$\n3. 主応力 $\\sigma_1 = C + R,\\; \\sigma_2 = C - R$\n\nPythonで計算：\n```python\nimport numpy as np\nsx, sy, txy = 80, -40, 30  # MPa\nC = (sx + sy) / 2\nR = np.sqrt(((sx - sy)/2)**2 + txy**2)\nprint(f\"主応力: σ1={C+R:.1f} MPa, σ2={C-R:.1f} MPa\")\n```",
        type: "material", likes: [10001,10002,99999,10004], ts: d(-1,20,15), commentCount: 2, reactions: {"🔥":[10001,10002],"👏":[99999]} },
      { id: 2703, ...P4, text: "📊 レポートのFEM解析ソフト、何使う？",
        type: "poll", likes: [10001], ts: d(0,10,0), pollOptions: ["ANSYS","Abaqus","FreeCAD","手計算のみ"], pollVotes: {"ANSYS":[10001,10003],"Abaqus":[10002,99999],"FreeCAD":[10004],"手計算のみ":[10005]}, commentCount: 1 },
      { id: 2704, ...PA, text: "正直この授業のレポート量えぐくない？材力だけで毎週レポートって他の授業との両立きつすぎる…",
        type: "anon", likes: [10001,10002,10003,10004,10005], ts: d(-3,22,0), commentCount: 4, reactions: {"😢":[10001,10002,10003],"👍":[10004]} },
    ],
    [c[1].id]: [ // 熱力学
      { id: 2710, ...P2, text: "📌 **小テスト範囲**\n- カルノーサイクル\n- エントロピーの定義と計算\n- 自由エネルギー\n\n持ち込み: 公式集1枚（手書き・両面OK）",
        type: "info", likes: [10001,10003,99999], ts: d(-3,18,0), pinned: true, commentCount: 2, reactions: {"👍":[10001,10003]} },
      { id: 2711, ...P1, text: "カルノーサイクルの効率の導出、覚えておくと便利：\n$$\\eta = 1 - \\frac{T_L}{T_H}$$\nこの式だけで色々解ける。例えば $T_H = 500K, T_L = 300K$ なら\n$$\\eta = 1 - \\frac{300}{500} = 0.4 = 40\\%$$",
        type: "discussion", likes: [10002,99999], ts: d(0,10,0), commentCount: 2, reactions: {"👍":[10002]} },
      { id: 2712, ...PU, text: "エントロピー変化の計算、理想気体の場合：\n$$\\Delta S = nC_v \\ln\\frac{T_2}{T_1} + nR\\ln\\frac{V_2}{V_1}$$\nMATLABで確認：\n```matlab\nT1=300; T2=600; V1=1; V2=2;\nn=1; Cv=20.8; R=8.314;\ndS = n*Cv*log(T2/T1) + n*R*log(V2/V1);\nfprintf('ΔS = %.2f J/K\\n', dS)\n```",
        type: "material", likes: [10001,10002,10003], ts: d(-1,15,0), commentCount: 1, reactions: {"🔥":[10001],"👏":[10003]} },
    ],
    [c[2].id]: [ // 流体力学
      { id: 2720, ...P3, text: "ナビエ・ストークス方程式の非圧縮性条件 $\\nabla \\cdot \\mathbf{v} = 0$ って、物理的には「流体要素の体積が変わらない」ってことでいいの？",
        type: "question", likes: [10002,10004], ts: d(0,13,0), commentCount: 3 },
      { id: 2721, ...P2, text: "そう！連続の式から出てくる。密度 $\\rho = \\text{const}$ のとき $\\frac{\\partial \\rho}{\\partial t} + \\nabla \\cdot (\\rho \\mathbf{v}) = 0$ → $\\nabla \\cdot \\mathbf{v} = 0$\n\nレイノルズ数の目安：\n- $Re < 2300$: 層流\n- $Re > 4000$: 乱流\n- 間: 遷移域",
        type: "info", likes: [10003,99999,10004], ts: d(0,13,20), reactions: {"🔥":[10003]} },
      { id: 2722, ...P4, text: "📊 流体シミュレーション、やったことある？",
        type: "poll", likes: [], ts: d(-1,18,0), pollOptions: ["OpenFOAM","COMSOL","Python(FEniCS)","やったことない"], pollVotes: {"OpenFOAM":[10002],"COMSOL":[10003],"Python(FEniCS)":[99999],"やったことない":[10001,10004,10005]}, pollSettings: {anon:true} },
    ],
    [c[3].id]: [ // 機械力学
      { id: 2730, ...P1, text: "1自由度減衰振動の一般解：\n$$x(t) = e^{-\\zeta\\omega_n t}\\left(A\\cos\\omega_d t + B\\sin\\omega_d t\\right)$$\nここで $\\omega_d = \\omega_n\\sqrt{1-\\zeta^2}$（減衰固有振動数）\n\n$\\zeta < 1$: 振動減衰、$\\zeta = 1$: 臨界減衰、$\\zeta > 1$: 過減衰",
        type: "material", likes: [10002,10003,99999], ts: d(-1,16,30), pinned: true, commentCount: 2, reactions: {"👍":[10002,10003]} },
    ],
    [c[4].id]: [ // 機械製図
      { id: 2740, ...P4, text: "第三角法の投影図、正面図の選び方ってどう決めてる？形状が最もよく分かる方向を正面にするのが原則？",
        type: "question", likes: [10001], ts: d(0,15,30), commentCount: 2 },
      { id: 2741, ...P3, text: "JIS B 0001 の規定だと：\n1. 形状を最も明確に表す方向\n2. 隠れ線が最も少なくなる方向\n3. 加工時の姿勢\n\n実務では3が結構大事らしい",
        type: "info", likes: [10004,99999], ts: d(0,16,10), reactions: {"👍":[10004]} },
    ],
    [c[5].id]: [ // 英語
      { id: 2750, ...P1, text: "今週のlistening test、スクリプトなしで一発勝負きつい…speakingパートはペアワークだよね？",
        type: "question", likes: [10003,10004], ts: d(0,14,0), commentCount: 2 },
      { id: 2751, ...PU, text: "前回のessay返却されたけど、\"coherence\"のスコアが低かった…パラグラフ間のtransitionをもっと意識しないと",
        type: "discussion", likes: [10001,10003], ts: d(-1,10,0), reactions: {"👍":[10003]} },
      { id: 2752, ...P4, text: "📊 TOEIC何点目標にしてる？",
        type: "poll", likes: [], ts: d(-2,16,0), pollOptions: ["600点台","700点台","800点以上","受けない"], pollVotes: {"600点台":[10004,10005],"700点台":[10001,10003],"800点以上":[10002,99999],"受けない":[]}, pollSettings: {anon:true} },
    ],
    [c[6].id]: [ // 微分積分学第二
      { id: 2760, ...P2, text: "重積分の変数変換、ヤコビアンの計算でよくミスる…\n$$\\iint f(x,y)\\,dx\\,dy = \\iint f(r\\cos\\theta, r\\sin\\theta)\\cdot r\\,dr\\,d\\theta$$\nの $r$ を忘れがち",
        type: "discussion", likes: [10001,10003,99999], ts: d(0,11,30), commentCount: 3, reactions: {"👍":[10001]} },
      { id: 2761, ...P3, text: "📌 **問題セット5の範囲**\n- 二重積分（累次積分、積分順序の交換）\n- 極座標変換\n- 三重積分\n- ガウスの発散定理\n\n来週火曜提出",
        type: "info", likes: [10002,10004,99999], ts: d(-2,18,0), pinned: true, reactions: {"👍":[10002,10004]} },
      { id: 2762, ...PU, text: "ε-δ論法のイメージ、こう考えると分かりやすい：\n- $\\varepsilon$: 「どのくらい$f(x)$がLに近いか」の許容範囲\n- $\\delta$: 「$x$がどのくらい$a$に近ければいいか」\n\n「任意の$\\varepsilon > 0$に対して$\\delta > 0$が存在して…」= 「いくら厳しくしても対応できる」",
        type: "material", likes: [10001,10002,10003], ts: d(-1,15,0), commentCount: 2, reactions: {"🔥":[10001],"👏":[10003]} },
      { id: 2763, ...PA, text: "微積の問題セット毎回量多すぎない？工学の専門科目と両立がきつい…",
        type: "anon", likes: [10001,10002,10003,10005], ts: d(-3,22,0), reactions: {"😢":[10001,10002],"👍":[10004]} },
    ],
    [c[7].id]: [ // 東工大立志プロジェクト
      { id: 2770, ...P4, text: "グループ発表の準備、テーマは「ものづくりとAI」に決まったけど、切り口どうする？",
        type: "discussion", likes: [10001,10003], ts: d(0,12,0), commentCount: 3 },
      { id: 2771, ...P1, text: "先輩に聞いたら「具体的な事例を1つ深掘りした方が評価高い」らしい。工作機械のAI異常検知とかどう？",
        type: "info", likes: [10002,10003,99999], ts: d(-1,13,0), reactions: {"👍":[10002,99999]} },
      { id: 2772, ...P3, text: "📊 発表資料、どこまで進んでる？",
        type: "poll", likes: [], ts: d(-1,18,0), pollOptions: ["ほぼ完成","半分くらい","構成だけ","まだ何も"], pollVotes: {"ほぼ完成":[],"半分くらい":[10002],"構成だけ":[10001,10003,99999],"まだ何も":[10004,10005]} },
    ],
  };
}

// ── PHY 投稿 ──
function phyPosts(c) {
  return {
    [c[0].id]: [ // 量子力学
      { id: 2800, ...P1, text: "📌 **レポート提出要件**\n- シュレーディンガー方程式の解法3問\n- 固有値問題の証明1問\n- 形式: PDF or 手書きスキャン\n- 締切: 来週月曜 23:59",
        type: "info", likes: [10002,10003,99999], ts: d(-2,10,0), pinned: true, commentCount: 2, reactions: {"👍":[10002,10003]} },
      { id: 2801, ...P2, text: "無限井戸型ポテンシャルのエネルギー固有値、導出の流れ：\n$$-\\frac{\\hbar^2}{2m}\\frac{d^2\\psi}{dx^2} = E\\psi \\quad (0 < x < L)$$\n境界条件 $\\psi(0) = \\psi(L) = 0$ から\n$$E_n = \\frac{n^2\\pi^2\\hbar^2}{2mL^2}, \\quad n = 1,2,3,\\ldots$$\n\nPythonで可視化：\n```python\nimport numpy as np\nimport matplotlib.pyplot as plt\n\nL, m, hbar = 1e-9, 9.109e-31, 1.055e-34\nx = np.linspace(0, L, 200)\nfor n in range(1, 4):\n    psi = np.sqrt(2/L) * np.sin(n*np.pi*x/L)\n    plt.plot(x*1e9, psi, label=f'n={n}')\nplt.xlabel('x (nm)'); plt.legend(); plt.show()\n```",
        type: "material", likes: [10001,10003,99999,10004], ts: d(-1,20,15), commentCount: 3, reactions: {"🔥":[10001,10002],"👏":[10003]} },
      { id: 2802, ...P3, text: "不確定性原理の $\\Delta x \\cdot \\Delta p \\geq \\frac{\\hbar}{2}$ って、測定の限界じゃなくて粒子の本質的な性質なんだよね？コペンハーゲン解釈だと",
        type: "question", likes: [10002,10004], ts: d(0,11,30), commentCount: 4, reactions: {"👍":[10002]} },
      { id: 2803, ...P4, text: "📊 量子力学の教科書、何使ってる？",
        type: "poll", likes: [], ts: d(0,10,0), pollOptions: ["サクライ","グリフィス","ランダウ","講義ノートだけ"], pollVotes: {"サクライ":[10002,10003],"グリフィス":[10001,99999,10004],"ランダウ":[10005],"講義ノートだけ":[]} },
      { id: 2804, ...PA, text: "ブラケット記法に慣れなさすぎて毎回波動関数に戻して計算してる…効率悪いのわかってるけど",
        type: "anon", likes: [10001,10002,10003,10005], ts: d(-3,22,0), commentCount: 3, reactions: {"😢":[10001,10003],"❤️":[10004]} },
    ],
    [c[1].id]: [ // 電磁気学
      { id: 2810, ...P2, text: "マクスウェル方程式の微分形まとめ：\n$$\\nabla \\cdot \\mathbf{E} = \\frac{\\rho}{\\varepsilon_0}$$\n$$\\nabla \\cdot \\mathbf{B} = 0$$\n$$\\nabla \\times \\mathbf{E} = -\\frac{\\partial \\mathbf{B}}{\\partial t}$$\n$$\\nabla \\times \\mathbf{B} = \\mu_0 \\mathbf{J} + \\mu_0\\varepsilon_0 \\frac{\\partial \\mathbf{E}}{\\partial t}$$\n\nこの4つから電磁波の波動方程式が出る",
        type: "material", likes: [10001,10003,99999,10004], ts: d(-1,14,0), pinned: true, commentCount: 2, reactions: {"👍":[10001,10003],"🔥":[99999]} },
      { id: 2811, ...P1, text: "ガウスの法則を使って球対称な電荷分布の電場を求める問題、対称性の議論をちゃんと書かないと減点されるらしい。\n\n**書くべきこと：**\n1. 対称性から $\\mathbf{E} = E(r)\\hat{r}$\n2. ガウス面は半径 $r$ の球面\n3. $\\oint \\mathbf{E}\\cdot d\\mathbf{A} = E(r) \\cdot 4\\pi r^2$",
        type: "info", likes: [10002,99999], ts: d(0,10,0), commentCount: 2 },
    ],
    [c[2].id]: [ // 統計力学
      { id: 2820, ...P3, text: "ボルツマン分布の導出で「等重率の原理」が前提になってるけど、これって公理なの？それとも導出できる？",
        type: "question", likes: [10002,10004], ts: d(0,13,0), commentCount: 3 },
      { id: 2821, ...PU, text: "分配関数 $Z$ から全ての熱力学量が出せる！\n- 自由エネルギー: $F = -k_BT \\ln Z$\n- エントロピー: $S = -\\frac{\\partial F}{\\partial T}$\n- 内部エネルギー: $U = -\\frac{\\partial \\ln Z}{\\partial \\beta}$\n\n調和振動子の分配関数：\n$$Z = \\frac{1}{2\\sinh(\\beta\\hbar\\omega/2)}$$",
        type: "material", likes: [10001,10002,10003], ts: d(-1,15,30), reactions: {"🔥":[10001],"👏":[10002]} },
    ],
    [c[3].id]: [ // 解析学第二
      { id: 2830, ...P2, text: "フーリエ級数の収束条件（ディリクレの条件）って、不連続点では $(f(x^+) + f(x^-))/2$ に収束するんだよね？",
        type: "question", likes: [10001,10003], ts: d(0,11,30), commentCount: 3, reactions: {"👍":[10001]} },
      { id: 2831, ...P3, text: "フーリエ変換のペア、よく使うやつ：\n$$\\mathcal{F}[e^{-a|t|}] = \\frac{2a}{a^2 + \\omega^2}$$\n$$\\mathcal{F}[\\delta(t)] = 1$$\n$$\\mathcal{F}[\\text{rect}(t)] = \\text{sinc}(\\omega/2\\pi)$$\n\n物理で頻出！",
        type: "material", likes: [10001,10002,99999], ts: d(-1,15,30), pinned: true, commentCount: 2, reactions: {"🔥":[10001],"👏":[10002]} },
      { id: 2832, ...PU, text: "```python\nimport numpy as np\nfrom numpy.fft import fft, fftfreq\n\nN, T = 1000, 1/1000\nt = np.linspace(0, N*T, N, endpoint=False)\ny = np.sin(50*2*np.pi*t) + 0.5*np.sin(80*2*np.pi*t)\nyf = fft(y)\nxf = fftfreq(N, T)[:N//2]\nprint(f'ピーク周波数: {xf[np.argsort(np.abs(yf[:N//2]))[-2:]]}')  # [50, 80] Hz\n```\nFFTで周波数成分を抽出！",
        type: "info", likes: [10001,10003,10004], ts: d(-1,20,0), reactions: {"👍":[10001,10003]} },
      { id: 2833, ...PA, text: "ε-δ論法の証明問題、毎回具体的な $\\delta$ の選び方がわからなくて白紙になる…",
        type: "anon", likes: [10001,10002,10003,10005], ts: d(-2,23,0), reactions: {"😢":[10001,10003]} },
    ],
    [c[4].id]: [ // 物理学実験
      { id: 2840, ...P4, text: "レーザー干渉計の実験、誤差解析ってどこまで詳しく書けばいい？最小二乗法のフィッティングまでやった方がいい？",
        type: "question", likes: [99999,10001], ts: d(0,15,30), commentCount: 2 },
      { id: 2841, ...PU, text: "```python\nimport numpy as np\nfrom scipy.optimize import curve_fit\n\n# 実験データ\nx = np.array([1,2,3,4,5])\ny = np.array([2.1, 3.9, 6.2, 7.8, 10.1])\n\ndef linear(x, a, b):\n    return a*x + b\n\npopt, pcov = curve_fit(linear, x, y)\nperr = np.sqrt(np.diag(pcov))\nprint(f'a = {popt[0]:.3f} ± {perr[0]:.3f}')\nprint(f'b = {popt[1]:.3f} ± {perr[1]:.3f}')\n```\nこれで誤差付きフィッティングできるよ",
        type: "info", likes: [10004,10001,10003], ts: d(0,16,10), reactions: {"👍":[10004]} },
    ],
    [c[5].id]: [ // 英語
      { id: 2850, ...P1, text: "Physical Review Lettersの論文、abstract読むだけでもリーディング練習になる。今週の課題は自分の専門分野の英語論文要約だよね？",
        type: "discussion", likes: [10003,99999], ts: d(0,14,0), commentCount: 2 },
      { id: 2851, ...P4, text: "📊 英語の授業、一番苦手なスキルは？",
        type: "poll", likes: [], ts: d(-1,16,0), pollOptions: ["Writing","Speaking","Listening","Reading"], pollVotes: {"Writing":[10001,10004],"Speaking":[10002,10003,10005],"Listening":[99999],"Reading":[]}, pollSettings: {anon:true} },
    ],
    [c[6].id]: [ // 物理数学演習
      { id: 2860, ...P2, text: "グリーン関数 $G(\\mathbf{r}, \\mathbf{r}')$ の物理的イメージ：「点源に対するシステムの応答」。\n$$\\nabla^2 G = \\delta^3(\\mathbf{r} - \\mathbf{r}')$$\nクーロンポテンシャル $G = -\\frac{1}{4\\pi|\\mathbf{r}-\\mathbf{r}'|}$ がまさにこれ",
        type: "material", likes: [10001,10003,99999], ts: d(-1,14,0), pinned: true, commentCount: 2, reactions: {"🔥":[10001],"👏":[10003]} },
      { id: 2861, ...P3, text: "複素積分の留数定理、物理で超頻出：\n$$\\oint_C f(z)\\,dz = 2\\pi i \\sum \\text{Res}(f, z_k)$$\n\nグリーン関数の計算とか散乱理論で必須",
        type: "info", likes: [10002,10004,99999], ts: d(0,10,0), commentCount: 2, reactions: {"👍":[10002]} },
      { id: 2862, ...PA, text: "物理数学のレベル高すぎる…数学科の授業よりきついのでは",
        type: "anon", likes: [10001,10002,10003,10004,10005], ts: d(-3,22,0), reactions: {"😢":[10001,10002,10003]} },
    ],
    [c[7].id]: [ // 科学技術と社会
      { id: 2870, ...P4, text: "今週のディスカッションテーマ「原子力発電の是非」、賛否両論から客観的にまとめるの難しい…",
        type: "discussion", likes: [10001,10003], ts: d(0,12,0), commentCount: 4 },
      { id: 2871, ...P1, text: "📌 **レポート課題**\n- テーマ: 科学技術の倫理的問題について\n- 2000字以上\n- 締切: 来週金曜\n- 参考文献を3つ以上引用すること",
        type: "info", likes: [10002,10003,99999], ts: d(-2,18,0), pinned: true, reactions: {"👍":[10002,10003]} },
      { id: 2872, ...P3, text: "📊 発表テーマ、どの分野が面白い？",
        type: "poll", likes: [], ts: d(-1,14,0), pollOptions: ["AI倫理","環境・エネルギー","医療技術","宇宙開発"], pollVotes: {"AI倫理":[10002,10003],"環境・エネルギー":[10001,10004],"医療技術":[99999],"宇宙開発":[10005,10006]} },
    ],
  };
}

// ── CAP 投稿 ──
function capPosts(c) {
  return {
    [c[0].id]: [ // 有機化学
      { id: 2900, ...P1, text: "📌 **中間試験範囲**\n- 求核置換反応 (SN1, SN2)\n- 脱離反応 (E1, E2)\n- 立体化学（R/S表記, E/Z表記）\n- 反応機構の矢印の書き方\n\n持ち込み不可、周期表のみ配布",
        type: "info", likes: [10002,10003,99999,10004], ts: d(-3,18,0), pinned: true, commentCount: 3, reactions: {"👍":[10002,10003,10004]} },
      { id: 2901, ...P3, text: "SN1 vs SN2 の判定フローチャート作ったので共有：\n\n**基質が3級** → SN1\n**基質が1級 + 強い求核剤** → SN2\n**基質が2級** → 求核剤と溶媒で判断\n- 極性非プロトン性溶媒 → SN2寄り\n- 極性プロトン性溶媒 → SN1寄り\n\n$v = k[\\text{substrate}][\\text{Nu}^-]$ (SN2) vs $v = k[\\text{substrate}]$ (SN1)",
        type: "material", likes: [10001,10002,99999,10004], ts: d(-1,20,15), commentCount: 2, reactions: {"🔥":[10001,10002],"👏":[99999]} },
      { id: 2902, ...P2, text: "逆合成解析の問題、ターゲット分子を見てどの結合を切るか全然ひらめかない…コツある？\n\nたとえばこういう構造：\n```\n    OH\n    |\nCH3-CH-CH2-CH2-COOH\n```\nどこから攻める？",
        type: "question", likes: [10001,10003], ts: d(0,11,30), commentCount: 4, reactions: {"👍":[10001]} },
      { id: 2903, ...P4, text: "📊 有機化学の勉強法、何が一番効果的？",
        type: "poll", likes: [10001], ts: d(0,10,0), pollOptions: ["反応機構を書きまくる","モデルキットで立体確認","問題集を解く","YouTube/動画"], pollVotes: {"反応機構を書きまくる":[10001,10003,99999],"モデルキットで立体確認":[10002],"問題集を解く":[10004,10005],"YouTube/動画":[]} },
      { id: 2904, ...PA, text: "有機化学の反応覚える量多すぎ…100個以上の反応全部テスト範囲ってどうやって覚えるの",
        type: "anon", likes: [10001,10002,10003,10004,10005,10006], ts: d(-3,22,0), commentCount: 5, reactions: {"😢":[10001,10002,10003],"👍":[10004,10005]} },
    ],
    [c[1].id]: [ // 物理化学
      { id: 2910, ...P2, text: "ギブズ自由エネルギーの温度依存性：\n$$\\left(\\frac{\\partial G}{\\partial T}\\right)_P = -S$$\n$$\\left(\\frac{\\partial G}{\\partial P}\\right)_T = V$$\n\nここからクラウジウス-クラペイロン式が出る：\n$$\\frac{dP}{dT} = \\frac{\\Delta H}{T\\Delta V}$$",
        type: "material", likes: [10001,10003,99999], ts: d(-1,14,0), pinned: true, commentCount: 2, reactions: {"👍":[10001,10003]} },
      { id: 2911, ...P1, text: "化学平衡定数と $\\Delta G^\\circ$ の関係式、符号間違えやすくない？\n$$\\Delta G^\\circ = -RT\\ln K$$\n$K > 1$ → $\\Delta G^\\circ < 0$（自発的）\n$K < 1$ → $\\Delta G^\\circ > 0$（非自発的）",
        type: "discussion", likes: [10002,99999], ts: d(0,10,0), commentCount: 2 },
    ],
    [c[2].id]: [ // 無機化学
      { id: 2920, ...P3, text: "結晶場理論の $\\Delta_o$（八面体場分裂エネルギー）の大小関係：\n$$I^- < Br^- < Cl^- < F^- < OH^- < H_2O < NH_3 < en < NO_2^- < CN^- < CO$$\n\nこの分光化学系列、丸暗記しかない？",
        type: "question", likes: [10002,10004], ts: d(0,13,0), commentCount: 3 },
      { id: 2921, ...PU, text: "配位化合物の色と $\\Delta_o$ の関係：\n- $\\Delta_o$ 大 → 短波長を吸収 → 青〜紫に見える\n- $\\Delta_o$ 小 → 長波長を吸収 → 赤〜黄に見える\n\n$[Cu(H_2O)_6]^{2+}$ が青いのは赤色光を吸収するから",
        type: "info", likes: [10001,10002,10003], ts: d(-1,15,30), reactions: {"👍":[10001,10003]} },
    ],
    [c[3].id]: [ // 分析化学
      { id: 2930, ...P2, text: "📌 **中間試験範囲**\n- 酸塩基滴定（多塩基酸・緩衝液）\n- 錯滴定（EDTA）\n- 酸化還元滴定\n- 重量分析\n\n電卓持ち込み可",
        type: "info", likes: [10001,10003,99999,10004], ts: d(-3,18,0), pinned: true, commentCount: 2, reactions: {"👍":[10001,10003,10004]} },
      { id: 2931, ...P3, text: "EDTA滴定の条件付き安定度定数 $K'_f$ の計算：\n$$K'_f = K_f \\cdot \\alpha_{Y^{4-}}$$\n\npH依存性が大きいので、適切なpH条件が重要。$Ca^{2+}$ はpH10以上で定量的！",
        type: "material", likes: [10001,10002,99999], ts: d(-1,14,0), commentCount: 2, reactions: {"🔥":[10001],"👏":[10002]} },
      { id: 2932, ...P1, text: "吸光度と濃度の関係（ランベルト・ベールの法則）：\n$$A = \\varepsilon b c$$\n$\\varepsilon$: モル吸光係数、$b$: 光路長、$c$: 濃度\n\n検量線作るときに必須！",
        type: "info", likes: [10002,10003,99999], ts: d(0,10,0), reactions: {"👍":[10002,10003]} },
      { id: 2933, ...PA, text: "滴定の計算問題、molの計算で桁を間違えて全滅した…有効数字の扱いも厳しい",
        type: "anon", likes: [10001,10002,10003,10005], ts: d(-2,22,0), reactions: {"😢":[10001,10002]} },
    ],
    [c[4].id]: [ // 化学実験
      { id: 2940, ...P4, text: "今回の有機合成実験、収率が30%しか出なかったんだけどみんなどれくらい？",
        type: "question", likes: [99999,10001], ts: d(0,15,30), commentCount: 3 },
      { id: 2941, ...P3, text: "📊 収率どれくらいだった？",
        type: "poll", likes: [], ts: d(-1,14,0), pollOptions: ["50%以上","30-50%","10-30%","10%以下"], pollVotes: {"50%以上":[10003],"30-50%":[10001,10002],"10-30%":[10004,99999],"10%以下":[10005]}, pollSettings: {anon:true} },
      { id: 2942, ...PU, text: "レポートのIRスペクトル解析、ピークの帰属表：\n```\n波数 (cm⁻¹)   帰属\n3300-3500     O-H 伸縮\n2850-2960     C-H 伸縮\n1700-1750     C=O 伸縮\n1600-1680     C=C 伸縮\n1000-1300     C-O 伸縮\n```\nNISTのデータベースでも確認できる",
        type: "info", likes: [10001,10004,10003], ts: d(0,16,10), reactions: {"👍":[10004,10003]} },
    ],
    [c[5].id]: [ // 英語
      { id: 2950, ...P1, text: "chemistry関連の英語論文、専門用語多すぎて辞書引きまくり…\"nucleophilic substitution\" とか授業で使わないよね",
        type: "discussion", likes: [10003,10004], ts: d(0,14,0), commentCount: 2 },
      { id: 2951, ...PU, text: "Lab reportの英語テンプレ：\n- **Objective**: The purpose of this experiment was to...\n- **Procedure**: A solution of ... was prepared by...\n- **Results**: The yield was calculated to be ...\n- **Discussion**: The low yield can be attributed to...",
        type: "material", likes: [10001,10002,10003], ts: d(-1,10,0), pinned: true, reactions: {"👍":[10001,10003]} },
      { id: 2952, ...P4, text: "📊 英語のプレゼン、緊張する？",
        type: "poll", likes: [], ts: d(-2,16,0), pollOptions: ["全然平気","少し緊張","かなり緊張","無理"], pollVotes: {"全然平気":[10002],"少し緊張":[10003,99999],"かなり緊張":[10001,10004],"無理":[10005]}, pollSettings: {anon:true} },
    ],
    [c[6].id]: [ // 微分積分学第二
      { id: 2960, ...P2, text: "偏微分方程式、化学で出てくるフィックの拡散法則：\n$$\\frac{\\partial c}{\\partial t} = D \\nabla^2 c$$\nこれの解を求めるのに微積が必要なんだなって実感した",
        type: "discussion", likes: [10001,10003,99999], ts: d(0,11,30), commentCount: 2, reactions: {"👍":[10001]} },
      { id: 2961, ...P3, text: "📌 **演習問題の範囲**\n- 偏微分\n- 全微分と近似\n- 重積分（累次積分）\n- 広義積分\n\n来週金曜提出",
        type: "info", likes: [10002,10004,99999], ts: d(-2,18,0), pinned: true, reactions: {"👍":[10002,10004]} },
      { id: 2962, ...PA, text: "化学の専門科目のレポートと微積の問題セットの締切が同じ日なのきつすぎる…",
        type: "anon", likes: [10001,10002,10003,10004,10005], ts: d(-3,22,0), reactions: {"😢":[10001,10002,10003]} },
    ],
    [c[7].id]: [ // 東工大立志プロジェクト
      { id: 2970, ...P4, text: "グループ発表のテーマ「持続可能な化学」で進めてるけど、グリーンケミストリーの12原則を軸にするのどう？",
        type: "discussion", likes: [10001,10003], ts: d(0,12,0), commentCount: 3 },
      { id: 2971, ...P1, text: "いいね！原子効率（atom economy）の話とか、生分解性プラスチックの話とか具体例が豊富だから発表しやすそう",
        type: "info", likes: [10002,10003,99999], ts: d(-1,13,0), reactions: {"👍":[10002,99999]} },
      { id: 2972, ...P3, text: "📊 発表の分担",
        type: "poll", likes: [], ts: d(-1,18,0), pollOptions: ["導入パート","事例紹介","データ分析","まとめ・提言"], pollVotes: {"導入パート":[10004],"事例紹介":[10001,10002],"データ分析":[99999],"まとめ・提言":[10003]} },
    ],
  };
}

// ── MED 投稿 ──
function medmPosts(c) {
  return {
    [c[0].id]: [ // 解剖学II
      { id: 3000, ...P1, text: "📌 **人体構造実習レポート提出要件**\n- 形式: PDF（スケッチ含む）\n- ファイル名: `学籍番号_anatomy_report.pdf`\n- 締切: 来週月曜 23:59\n- 対象部位: 上肢の筋・神経・血管\n\n遅延提出は**受理不可**",
        type: "info", likes: [10002,10003,10004,99999], ts: d(-2,10,0), pinned: true, commentCount: 2, reactions: {"👍":[10002,10003,10004]} },
      { id: 3001, ...P2, text: "腕神経叢の枝の覚え方：\n「**武**蔵(筋皮)の**正**体(正中)は**尺**八(尺骨)を吹く**橈**骨(橈骨)な**腋**(腋窩)」\n\n$$C5-T1 \\to \\text{幹} \\to \\text{束} \\to \\text{枝}$$\n外側束→筋皮神経＋正中神経外側頭\n内側束→尺骨神経＋正中神経内側頭\n後束→橈骨神経＋腋窩神経",
        type: "material", likes: [10001,10003,99999,10004], ts: d(-1,20,15), commentCount: 3, reactions: {"🔥":[10001,10002],"👏":[10003]} },
      { id: 3002, ...P3, text: "大腿三角（スカルパ三角）の境界がいつも混乱する…\n- 上辺: 鼠径靭帯\n- 外側: 縫工筋\n- 内側: 長内転筋\n\n中を通るもの(外→内): **N**erve, **A**rtery, **V**ein, **E**mpty space, **L**ymphatics → NAVEL で覚える？",
        type: "question", likes: [10002,10004], ts: d(0,11,30), commentCount: 4, reactions: {"👍":[10002]} },
      { id: 3003, ...P4, text: "📊 解剖実習のスケッチ、何で描いてる？",
        type: "poll", likes: [10001], ts: d(0,10,0), pollOptions: ["色鉛筆","iPad (Procreate)","紙＋写真","PowerPoint"], pollVotes: {"色鉛筆":[10001,10004],"iPad (Procreate)":[10002,99999,10003],"紙＋写真":[10005],"PowerPoint":[]}, commentCount: 1 },
      { id: 3004, ...PA, text: "解剖実習のホルマリン臭がきつすぎて毎回頭痛い…マスク二重にしても限界がある",
        type: "anon", likes: [10001,10002,10003,10004,10005], ts: d(-3,22,0), commentCount: 4, reactions: {"😢":[10001,10002,10003],"👍":[10004]} },
    ],
    [c[1].id]: [ // 生理学II
      { id: 3010, ...P2, text: "📌 **中間試験範囲**\n- 心臓の電気生理学（活動電位、刺激伝導系）\n- 心電図の基礎（P波, QRS, T波）\n- 循環調節（圧受容器反射, レニン-アンジオテンシン系）\n- 呼吸生理（ガス交換, 酸素解離曲線）\n\n持ち込み不可",
        type: "info", likes: [10001,10003,99999], ts: d(-3,18,0), pinned: true, commentCount: 2, reactions: {"👍":[10001,10003]} },
      { id: 3011, ...P1, text: "酸素解離曲線のシフト因子、右方移動 = 酸素放出しやすくなる：\n- pH↓（ボーア効果）\n- $P_{CO_2}$↑\n- 温度↑\n- 2,3-DPG↑\n\n覚え方: 「**運動**すると全部上がる」→ 組織に酸素供給↑",
        type: "material", likes: [10002,99999,10004], ts: d(0,10,0), commentCount: 2, reactions: {"👍":[10002]} },
      { id: 3012, ...P3, text: "心電図の読み方がまだ不安…QRS幅が広いのが脚ブロックで、ST上昇が心筋梗塞でいいんだよね？\nP波消失＋irregularly irregular = 心房細動？",
        type: "question", likes: [10001,10004], ts: d(-1,16,0), commentCount: 3 },
    ],
    [c[2].id]: [ // 生化学II
      { id: 3020, ...P3, text: "TCA回路の基質、語呂合わせ：\n「**ク**エン**イ**ソ（あ）**ア**ルファ（の）**サ**クシニル**コ**ハク**フ**マル**リ**ンゴ**オ**キサロ」\n\nクエン酸→イソクエン酸→α-ケトグルタル酸→サクシニルCoA→コハク酸→フマル酸→リンゴ酸→オキサロ酢酸",
        type: "material", likes: [10001,10002,99999], ts: d(-1,14,0), pinned: true, commentCount: 2, reactions: {"🔥":[10001],"👏":[10002]} },
      { id: 3021, ...P2, text: "糖新生とグリコーゲン代謝の制御、インスリン vs グルカゴンの対比で整理すると覚えやすい：\n\n|  | インスリン | グルカゴン |\n|--|--|--|\n| 血糖 | ↓ | ↑ |\n| グリコーゲン合成 | 促進 | 抑制 |\n| 糖新生 | 抑制 | 促進 |\n| 脂肪合成 | 促進 | 抑制 |",
        type: "info", likes: [10001,10003,99999], ts: d(0,10,0), commentCount: 2, reactions: {"👍":[10001,10003]} },
    ],
    [c[3].id]: [ // 微生物学
      { id: 3030, ...P2, text: "グラム染色の手順と原理まとめ：\n1. クリスタルバイオレット → 全菌紫\n2. ヨウ素液 → CV-I複合体形成\n3. アルコール脱色 → **陰性菌のみ脱色**（外膜のLPSが溶ける）\n4. サフラニン → 陰性菌がピンクに\n\nグラム**陽**性 = 厚いペプチドグリカン層 → **紫**\nグラム**陰**性 = 薄い + 外膜あり → **ピンク**",
        type: "material", likes: [10001,10003,99999,10004], ts: d(-1,20,15), pinned: true, commentCount: 2, reactions: {"🔥":[10001,10002],"👏":[99999]} },
      { id: 3031, ...P4, text: "📊 微生物の実習、一番面白かった実験は？",
        type: "poll", likes: [], ts: d(0,10,0), pollOptions: ["グラム染色","培養・コロニー観察","抗菌薬感受性試験","PCR"], pollVotes: {"グラム染色":[10001,10004],"培養・コロニー観察":[10002,10003],"抗菌薬感受性試験":[99999,10005],"PCR":[10006]}, pollSettings: {anon:true} },
    ],
    [c[4].id]: [ // 免疫学
      { id: 3040, ...P3, text: "T細胞のサブセット整理：\n- **CD4+ Th1**: IFN-γ → マクロファージ活性化（細胞内寄生菌）\n- **CD4+ Th2**: IL-4, IL-5 → B細胞のIgE産生（寄生虫・アレルギー）\n- **CD4+ Th17**: IL-17 → 好中球動員（細菌・真菌）\n- **CD4+ Treg**: IL-10, TGF-β → 免疫抑制\n- **CD8+ CTL**: パーフォリン・グランザイム → 細胞傷害",
        type: "material", likes: [10001,10002,99999], ts: d(-1,15,30), pinned: true, reactions: {"👍":[10001,10002]} },
      { id: 3041, ...P1, text: "I型アレルギーのメカニズム、国試頻出：\n1. 抗原に初回曝露 → B細胞がIgE産生\n2. IgEがマスト細胞のFcεRIに結合（感作）\n3. 再曝露 → 抗原がIgE架橋 → マスト細胞脱顆粒\n4. ヒスタミン放出 → 血管透過性↑、平滑筋収縮",
        type: "info", likes: [10002,99999,10004], ts: d(0,10,0), commentCount: 2, reactions: {"👍":[10002,10004]} },
    ],
    [c[5].id]: [ // 医学英語II
      { id: 3050, ...P1, text: "今週のcase presentation、英語で症例提示するの緊張する…\n\"A 45-year-old male presented with acute onset chest pain...\" みたいなテンプレ使えばいい？",
        type: "question", likes: [10003,10004], ts: d(0,14,0), commentCount: 2 },
      { id: 3051, ...P4, text: "📊 医学英語、一番苦手なスキルは？",
        type: "poll", likes: [], ts: d(-1,16,0), pollOptions: ["Case presentation","Journal reading","Medical terminology","OSCE英語"], pollVotes: {"Case presentation":[10001,10003],"Journal reading":[10004],"Medical terminology":[10002],"OSCE英語":[99999,10005]}, pollSettings: {anon:true} },
    ],
    [c[6].id]: [ // 発生学
      { id: 3060, ...P2, text: "胚葉の分化先まとめ：\n- **外胚葉**: 表皮, 神経系, 感覚器\n- **中胚葉**: 骨格筋, 骨, 心血管系, 腎臓, 血液\n- **内胚葉**: 消化管上皮, 肝臓, 膵臓, 肺\n\n覚え方: 外=皮膚と脳、中=運動器と循環、内=消化吸収",
        type: "material", likes: [10001,10003,99999], ts: d(-1,14,0), pinned: true, commentCount: 2, reactions: {"🔥":[10001],"👏":[10003]} },
      { id: 3061, ...P3, text: "催奇形因子の critical period、特に心臓が3-8週って狭いのに先天性心疾患が多い理由がわかった気がする",
        type: "discussion", likes: [10002,10004], ts: d(0,11,30), commentCount: 2 },
    ],
    [c[7].id]: [ // 人体構造実習
      { id: 3070, ...P4, text: "実習で同定すべき構造物リスト長すぎない？今回は上肢だけで筋20個以上…\n三角筋、上腕二頭筋、上腕三頭筋はわかるけど、回旋筋腱板（ローテーターカフ）の4つがいつも混ざる",
        type: "question", likes: [99999,10001], ts: d(0,15,30), commentCount: 3 },
      { id: 3071, ...PU, text: "回旋筋腱板（SITS）の覚え方：\n- **S**upraspinatus（棘上筋）→ 外転の開始\n- **I**nfraspinatus（棘下筋）→ 外旋\n- **T**eres minor（小円筋）→ 外旋\n- **S**ubscapularis（肩甲下筋）→ 内旋\n\n「**S**uper **I**ntelligent **T**eacher **S**ays」で覚えよう",
        type: "info", likes: [10004,10001,10003], ts: d(0,16,10), reactions: {"👍":[10004,10003]} },
      { id: 3072, ...PA, text: "実習後に手がホルマリン臭くてご飯が食べられない…グローブ二重にしても染みる",
        type: "anon", likes: [10001,10002,10003,10004,10005], ts: d(-2,22,0), reactions: {"😢":[10001,10002,10003]} },
    ],
  };
}

// ── DEN 投稿 ──
function dendPosts(c) {
  return {
    [c[0].id]: [ // 口腔解剖学II
      { id: 3100, ...P1, text: "📌 **頭蓋骨スケッチレポート**\n- 対象: 蝶形骨・篩骨・上顎骨・下顎骨\n- 形式: 手描きスケッチ＋ランドマーク記入\n- 締切: 来週月曜 23:59\n- A3用紙推奨\n\n**名称は日本語＋ラテン語**で記入すること",
        type: "info", likes: [10002,10003,10004,99999], ts: d(-2,10,0), pinned: true, commentCount: 2, reactions: {"👍":[10002,10003,10004]} },
      { id: 3101, ...P2, text: "三叉神経の3枝の走行まとめ：\n- **V1 眼神経**: 上眼窩裂 → 前頭部・眼瞼上部\n- **V2 上顎神経**: 正円孔 → 上顎歯・頬部\n- **V3 下顎神経**: 卵円孔 → 下顎歯・咀嚼筋(運動枝)\n\n歯科で特に重要なのはV2(上顎歯の麻酔)とV3(下顎孔伝達麻酔)！",
        type: "material", likes: [10001,10003,99999,10004], ts: d(-1,20,15), commentCount: 3, reactions: {"🔥":[10001,10002],"👏":[10003]} },
      { id: 3102, ...P3, text: "咀嚼筋4つの作用がごっちゃになる…\n- 咬筋: 閉口\n- 側頭筋: 閉口＋後退\n- 内側翼突筋: 閉口\n- 外側翼突筋: **開口**・前方移動\n\n外側翼突筋だけ開口なのがポイント？",
        type: "question", likes: [10002,10004], ts: d(0,11,30), commentCount: 4, reactions: {"👍":[10002]} },
      { id: 3103, ...PA, text: "頭蓋骨の孔が多すぎて覚えきれない…大後頭孔、頸静脈孔、正円孔、卵円孔、棘孔、内耳孔、茎乳突孔…",
        type: "anon", likes: [10001,10002,10003,10004,10005], ts: d(-3,22,0), commentCount: 4, reactions: {"😢":[10001,10002,10003],"👍":[10004]} },
    ],
    [c[1].id]: [ // 口腔生理学II
      { id: 3110, ...P2, text: "📌 **中間試験範囲**\n- 唾液分泌の調節（自律神経支配）\n- 味覚の受容機構（甘味・苦味・うま味のGPCR）\n- 咀嚼運動の神経制御\n- 嚥下反射のメカニズム\n\n持ち込み不可、選択+記述",
        type: "info", likes: [10001,10003,99999], ts: d(-3,18,0), pinned: true, commentCount: 2, reactions: {"👍":[10001,10003]} },
      { id: 3111, ...P1, text: "唾液の機能って意外に多い：\n1. 消化（アミラーゼ）\n2. 潤滑（ムチン）\n3. 緩衝（重炭酸）\n4. 抗菌（リゾチーム, IgA, ラクトフェリン）\n5. 再石灰化（Ca²⁺, PO₄³⁻過飽和）\n\n口腔乾燥症(ドライマウス)で齲蝕が激増する理由がわかる",
        type: "material", likes: [10002,99999,10004], ts: d(0,10,0), commentCount: 2, reactions: {"👍":[10002]} },
    ],
    [c[2].id]: [ // 口腔微生物学
      { id: 3120, ...P3, text: "齲蝕の病因論、Keyesの3つの輪：\n- **宿主**（歯の質・形態）\n- **細菌**（S. mutans, Lactobacillus）\n- **食餌**（ショ糖 = スクロース）\n\n+ **時間** → Newbrunの4つの輪\n\nS. mutans が産生するグルカン(不溶性グルカン)がバイオフィルム形成の鍵",
        type: "material", likes: [10001,10002,99999], ts: d(-1,14,0), pinned: true, commentCount: 2, reactions: {"🔥":[10001],"👏":[10002]} },
      { id: 3121, ...P4, text: "📊 微生物の培養実習、コロニー形態の判別できた？",
        type: "poll", likes: [], ts: d(0,10,0), pollOptions: ["余裕","だいたいOK","怪しい","全然わからん"], pollVotes: {"余裕":[],"だいたいOK":[10002,99999],"怪しい":[10001,10003,10004],"全然わからん":[10005]}, pollSettings: {anon:true} },
    ],
    [c[3].id]: [ // 歯科材料学II
      { id: 3130, ...P2, text: "印象材の分類と特性：\n- **アルジネート**: 安価・操作簡便、寸法変化あり（概形印象用）\n- **シリコーンゴム**: 精密、弾性回復◎（精密印象用）\n- **ポリエーテル**: 親水性◎、硬い\n- **寒天**: 精密だが温度管理が必要\n\n臨床ではシリコーンが主流。付加型 vs 縮合型の違いも要注意",
        type: "material", likes: [10001,10003,99999], ts: d(-1,14,0), pinned: true, commentCount: 2, reactions: {"👍":[10001,10003]} },
      { id: 3131, ...P1, text: "コンポジットレジンの重合収縮が辺縁適合性に影響するって話、C-factor（ボンド面/フリー面の比）が高いと収縮応力も大きくなるのがポイントだよね",
        type: "discussion", likes: [10002,10004], ts: d(0,11,30), commentCount: 2 },
    ],
    [c[4].id]: [ // 口腔組織学
      { id: 3140, ...P3, text: "エナメル質の構造：\n- **エナメル小柱**(enamel rod): 直径4-8μm、HA結晶の集合\n- **小柱鞘**(rod sheath): 有機質が多い境界\n- **レチウス線条**: 成長線（木の年輪のようなもの）\n- **新生児線**: 出生時のストレスによる明瞭なレチウス線\n\n人体で最も硬い組織だけど、**酸に弱い**（pH 5.5以下で脱灰開始）",
        type: "material", likes: [10001,10002,99999,10004], ts: d(-1,15,30), pinned: true, reactions: {"🔥":[10001],"👏":[10002,10003]} },
      { id: 3141, ...P2, text: "象牙質の種類：\n- **一次象牙質**: 歯の萌出まで\n- **二次象牙質**: 萌出後、生理的に形成\n- **第三象牙質**(修復象牙質): 刺激(齲蝕等)に応じて形成\n\n象牙細管の直径と密度が歯髄に近いほど増すのも臨床的に重要",
        type: "info", likes: [10001,10003,99999], ts: d(0,10,0), commentCount: 2, reactions: {"👍":[10001,10003]} },
    ],
    [c[5].id]: [ // 歯学英語II
      { id: 3150, ...P1, text: "Patient communication で \"Does it hurt when I tap here?\" って打診のときに使うんだね。\"sensitivity to cold\" と \"sensitivity to heat\" の鑑別が問診のポイントらしい",
        type: "discussion", likes: [10003,99999], ts: d(0,14,0), commentCount: 2 },
      { id: 3151, ...P4, text: "📊 歯科英語の用語、一番覚えにくいのは？",
        type: "poll", likes: [], ts: d(-1,16,0), pollOptions: ["解剖用語","材料用語","病名","手技の名前"], pollVotes: {"解剖用語":[10001,10003],"材料用語":[10002],"病名":[10004,10005],"手技の名前":[99999]}, pollSettings: {anon:true} },
    ],
    [c[6].id]: [ // 歯科薬理学
      { id: 3160, ...P2, text: "局所麻酔薬の分類：\n- **エステル型**: プロカイン、テトラカイン（血中エステラーゼで分解→アレルギー起きやすい）\n- **アミド型**: リドカイン、メピバカイン、アーティカイン（肝代謝→アレルギー稀）\n\n歯科ではリドカイン(キシロカイン) + アドレナリン1:80,000が標準",
        type: "material", likes: [10001,10003,99999], ts: d(-1,14,0), pinned: true, commentCount: 2, reactions: {"👍":[10001,10003]} },
      { id: 3161, ...P3, text: "エピネフリン(アドレナリン)添加の理由：\n1. 血管収縮 → 麻酔薬の吸収遅延 → **持続時間延長**\n2. 出血減少\n3. 全身的副作用↓\n\nただし心疾患患者では使用注意！フェリプレシン含有製剤に切替え",
        type: "info", likes: [10002,99999,10004], ts: d(0,10,0), commentCount: 2 },
    ],
    [c[7].id]: [ // 歯科基礎実習
      { id: 3170, ...P4, text: "ワックスアップで臼歯の咬合面形態を再現するの難しすぎる…咬頭の位置と溝の走行がうまくいかない",
        type: "question", likes: [99999,10001], ts: d(0,15,30), commentCount: 3 },
      { id: 3171, ...PU, text: "窩洞形成の基本原則（Black）：\n1. **Outline form**: 齲蝕を含む適切な辺縁\n2. **Resistance form**: 咬合力に耐える形態\n3. **Retention form**: 修復物の維持形態\n4. **Convenience form**: 操作しやすい形態\n\nメタルインレーの窩洞は**テーパー2-5°**がポイント",
        type: "info", likes: [10001,10004,10003], ts: d(0,16,10), reactions: {"👍":[10004,10003]} },
      { id: 3172, ...PA, text: "マネキン相手でもハンドピース持つ手が震える…患者さん相手の臨床実習が来年って考えると不安しかない",
        type: "anon", likes: [10001,10002,10003,10004,10005], ts: d(-2,22,0), reactions: {"😢":[10001,10002,10003]} },
    ],
  };
}

// ── ペルソナ別チャットメッセージ ──
function mecChat(c) {
  return {
    [c[0].id]: [ // 材料力学
      { id: "dcm_m1", ...P1, text: "今日の材力の演習、はり のたわみ量の問題難しくなかった？", ts: d(-1,14,20) },
      { id: "dcm_m2", ...P2, text: "あれは**重ね合わせの原理**使えば解けるよ。集中荷重と分布荷重を分けて考える", ts: d(-1,14,35) },
      { id: "dcm_m3", ...P3, text: "たわみの公式は $\\delta = \\frac{PL^3}{48EI}$（中央集中荷重の場合）。断面二次モーメント $I$ の計算がポイント", ts: d(-1,15,0) },
      { id: "dcm_m4", ...PU, text: "Pythonで梁のたわみ計算してみた：\n```python\nimport numpy as np\nP, L, E, I = 1000, 2, 200e9, 1e-6  # N, m, Pa, m^4\ndelta = P*L**3 / (48*E*I)\nprint(f'たわみ: {delta*1e3:.3f} mm')\n```", ts: d(-1,15,20) },
      { id: "dcm_m5", ...P4, text: "📊 材力の小テスト、自信ある？",
        ts: d(0,9,30), pollOptions: ["余裕","まあまあ","不安","無理"], pollVotes: {"余裕":[],"まあまあ":[10002],"不安":[10001,99999,10003],"無理":[10004,10005]}, pollSettings: {anon:true} },
      { id: "dcm_m6", ...P1, text: "📢 **お知らせ**\n来週の月曜は**休講**です。補講は再来週水曜3-4限。教室は `S5-21` です", ts: d(0,12,0) },
    ],
    [c[1].id]: [ // 熱力学
      { id: "dcm_m10", ...P2, text: "エントロピーの概念が抽象的すぎてイメージ湧かない…「乱雑さの尺度」って言われてもピンとこない", ts: d(-1,16,0) },
      { id: "dcm_m11", ...P3, text: "統計力学的に考えると $S = k_B \\ln W$ で、$W$ は微視的状態数。**取りうる状態が多い ≒ 乱雑** ってことだよ", ts: d(0,9,10) },
    ],
    [c[2].id]: [ // 流体力学
      { id: "dcm_m20", ...P3, text: "ベルヌーイの定理 $P + \\frac{1}{2}\\rho v^2 + \\rho gh = \\text{const}$ って非粘性・定常・非圧縮の条件がいるんだよね", ts: d(-1,14,0) },
      { id: "dcm_m21", ...P2, text: "ピトー管がまさにベルヌーイの応用。流速を圧力差から測る：\n$v = \\sqrt{\\frac{2(P_{total} - P_{static})}{\\rho}}$", ts: d(-1,14,20) },
      { id: "dcm_m22", ...PU, text: "レイノルズ数の計算メモ：\n```python\nrho = 1000  # 水 kg/m^3\nv = 2       # m/s\nD = 0.05    # 管径 m\nmu = 1e-3   # 動粘度 Pa·s\nRe = rho * v * D / mu\nprint(f'Re = {Re:.0f}')  # 100000 → 乱流\n```", ts: d(0,10,0) },
    ],
    [c[3].id]: [ // 機械力学
      { id: "dcm_m30", ...P1, text: "固有振動数の公式 $\\omega_n = \\sqrt{k/m}$ って、バネ定数 $k$ が大きいほど振動数高くなるのは直感と合うよね", ts: d(-1,15,0) },
      { id: "dcm_m31", ...P4, text: "ラグランジュ方程式で運動方程式立てるの、座標の取り方でめっちゃ式が変わるから注意\n$$\\frac{d}{dt}\\frac{\\partial L}{\\partial \\dot{q}_i} - \\frac{\\partial L}{\\partial q_i} = 0$$", ts: d(0,9,30) },
    ],
    [c[4].id]: [ // 機械製図
      { id: "dcm_m40", ...P4, text: "SolidWorksの面取り、フィレットの使い分けが分からない。見た目の問題？", ts: d(-1,14,0) },
      { id: "dcm_m41", ...P3, text: "面取り（chamfer）は45°のカット、フィレット（fillet）はR付け。**応力集中を避けたい箇所はフィレット**が鉄則！", ts: d(-1,14,20) },
      { id: "dcm_m42", ...P2, text: "寸法公差の記入方法、JIS B 0401 の はめあい公差（H7/g6とか）が製図の実技で頻出だよ", ts: d(0,10,0) },
    ],
    [c[5].id]: [ // 英語
      { id: "dcm_m50", ...P1, text: "technical writing の課題、abstract の書き方って結論から先に書くのが正解？", ts: d(-1,13,0) },
      { id: "dcm_m51", ...P3, text: "そう！IMRaD構成のabstractは**目的→方法→結果→結論**の順。最初に結論を書くスタイルもあるけど工学系はIMRaDが多い", ts: d(0,9,0) },
    ],
    [c[6].id]: [ // 微積
      { id: "dcm_m60", ...P2, text: "偏微分のヤコビ行列、機械の運動学でも使うんだよね。リンク機構の速度解析とか", ts: d(-1,14,0) },
      { id: "dcm_m61", ...PU, text: "機械系だと微積の応用が見えやすい。例えば仕事量 $W = \\int \\mathbf{F} \\cdot d\\mathbf{r}$ は線積分そのもの", ts: d(0,9,30) },
    ],
    [c[7].id]: [ // 立志P
      { id: "dcm_m70", ...P4, text: "グループ発表のリハーサルいつやる？来週までに1回は通しでやりたい", ts: d(-1,13,0) },
      { id: "dcm_m71", ...P1, text: "水曜の放課後はどう？S5のゼミ室借りれるか聞いてみる", ts: d(-1,13,20) },
      { id: "dcm_m72", ...P3, text: "📊 リハの日程候補",
        ts: d(0,9,0), pollOptions: ["月曜放課後","水曜放課後","金曜昼休み","土曜午前"], pollVotes: {"月曜放課後":[10004],"水曜放課後":[10001,10003,99999],"金曜昼休み":[10002],"土曜午前":[]}, pollSettings: {} },
    ],
  };
}

function phyChat(c) {
  return {
    [c[0].id]: [ // 量子力学
      { id: "dcm_p1", ...P2, text: "ハミルトニアン $\\hat{H}$ の固有値問題 $\\hat{H}|n\\rangle = E_n|n\\rangle$ の物理的意味って、「エネルギーが確定した状態」ってこと？", ts: d(-1,16,0) },
      { id: "dcm_p2", ...PU, text: "そう！固有状態 $|n\\rangle$ で測定すると必ず $E_n$ が得られる。重ね合わせ $|\\psi\\rangle = \\sum c_n|n\\rangle$ だと確率 $|c_n|^2$ で $E_n$", ts: d(0,9,10) },
      { id: "dcm_p3", ...P3, text: "交換関係 $[\\hat{x}, \\hat{p}] = i\\hbar$ がすべての出発点。ここから不確定性原理も出る\n$$\\Delta x \\cdot \\Delta p \\geq \\frac{\\hbar}{2}$$", ts: d(0,9,30) },
      { id: "dcm_p4", ...P1, text: "水素原子の波動関数、角度部分の球面調和関数 $Y_l^m(\\theta,\\phi)$ の可視化やってみた：\n```python\nfrom scipy.special import sph_harm\nimport numpy as np\ntheta = np.linspace(0, np.pi, 100)\nphi = np.linspace(0, 2*np.pi, 100)\nT, P = np.meshgrid(theta, phi)\nY = sph_harm(0, 1, P, T)  # l=1, m=0\nprint(f'max|Y|={np.abs(Y).max():.4f}')\n```", ts: d(0,10,30) },
      { id: "dcm_p5", ...P4, text: "📊 量子力学、難易度どう感じてる？",
        ts: d(0,11,0), pollOptions: ["楽しい","難しいけど面白い","厳しい","完全に迷子"], pollVotes: {"楽しい":[10002],"難しいけど面白い":[10001,10003,99999],"厳しい":[10004],"完全に迷子":[10005]}, pollSettings: {anon:true} },
    ],
    [c[1].id]: [ // 電磁気学
      { id: "dcm_p6", ...P1, text: "ガウス面の取り方がいまいちわからない…球対称は球面、円柱対称は円柱面？", ts: d(-1,14,0) },
      { id: "dcm_p7", ...P3, text: "そう！対称性に合わせてガウス面を取る。電場が面に平行 or 垂直になるようにすると $\\oint \\mathbf{E}\\cdot d\\mathbf{A}$ が簡単になる", ts: d(-1,14,20) },
      { id: "dcm_p8", ...PU, text: "導体球の電場を計算してみた：\n```python\nimport numpy as np\nepsilon_0 = 8.854e-12\nQ = 1e-6  # 1μC\nR = 0.1   # 半径 0.1m\nr = np.linspace(0.01, 0.5, 100)\nE = np.where(r >= R, Q/(4*np.pi*epsilon_0*r**2), 0)\nprint(f'表面の電場: {Q/(4*np.pi*epsilon_0*R**2):.2f} V/m')\n```", ts: d(0,10,0) },
    ],
    [c[2].id]: [ // 統計力学
      { id: "dcm_p10", ...P3, text: "カノニカル分布の分配関数 $Z = \\sum_i e^{-\\beta E_i}$ の $\\beta = 1/(k_BT)$ って温度の逆数なんだけど、なぜ逆数を使うの？", ts: d(-1,16,0) },
      { id: "dcm_p11", ...P2, text: "数学的に $\\beta$ の方がラグランジュ未定乗数法の計算が綺麗になるから。物理的には「エネルギーの分配のしやすさ」のパラメータ", ts: d(0,9,10) },
    ],
    [c[3].id]: [ // 解析学第二
      { id: "dcm_p20", ...P2, text: "ストークスの定理 $\\oint \\mathbf{F}\\cdot d\\mathbf{r} = \\iint (\\nabla \\times \\mathbf{F})\\cdot d\\mathbf{A}$ って、電磁気のファラデーの法則そのものだよね", ts: d(-1,14,0) },
      { id: "dcm_p21", ...P1, text: "そう！$\\nabla \\times \\mathbf{E} = -\\partial\\mathbf{B}/\\partial t$ にストークスの定理を適用すると積分形のファラデーの法則になる", ts: d(0,9,30) },
    ],
    [c[4].id]: [ // 物理学実験
      { id: "dcm_p30", ...P4, text: "マイケルソン干渉計、ミラーの微調整がシビアすぎる…0.5μm動かすだけで縞が1本動く", ts: d(-1,14,0) },
      { id: "dcm_p31", ...PU, text: "有効数字の伝播、誤差の伝播公式で：\n$$\\sigma_f = \\sqrt{\\sum_i \\left(\\frac{\\partial f}{\\partial x_i}\\right)^2 \\sigma_{x_i}^2}$$\nレポートでは必ず不確かさを付けよう", ts: d(-1,14,30) },
      { id: "dcm_p32", ...P3, text: "今回のガイガーカウンターの実験、放射線のカウント数がポアソン分布に従うか検定するの面白かった", ts: d(0,10,0) },
    ],
    [c[5].id]: [ // 英語
      { id: "dcm_p40", ...P1, text: "Scientific paperのpresentation準備、1スライドに情報詰め込みすぎって指摘された…", ts: d(-1,13,0) },
      { id: "dcm_p41", ...P3, text: "理系のプレゼンは「1 slide, 1 message」が鉄則。図表メインで文字は最小限にした方がいいよ", ts: d(0,9,0) },
    ],
    [c[6].id]: [ // 物理数学演習
      { id: "dcm_p50", ...P2, text: "ルジャンドル多項式 $P_l(\\cos\\theta)$ の直交性を使った展開って、フーリエ展開の球面版みたいなもの？", ts: d(-1,14,0) },
      { id: "dcm_p51", ...PU, text: "まさにそう！完全直交系で展開するという意味では同じ。球面調和関数 $Y_l^m$ がその一般化", ts: d(-1,14,30) },
      { id: "dcm_p52", ...P3, text: "特殊関数（ベッセル関数、エルミート多項式、ラゲール多項式）全部が微分方程式の解。覚えるんじゃなくて**出てくる物理系**と紐付けると忘れにくい", ts: d(0,10,0) },
    ],
    [c[7].id]: [ // 科学技術と社会
      { id: "dcm_p60", ...P4, text: "今回のレポート、物理学者の社会的責任について書こうと思うんだけど、マンハッタン計画の話でいい？", ts: d(-1,13,0) },
      { id: "dcm_p61", ...P1, text: "定番だけど良いテーマだと思う。オッペンハイマーの葛藤とか、パグウォッシュ会議の話も入れると厚みが出るよ", ts: d(0,9,0) },
    ],
  };
}

function capChat(c) {
  return {
    [c[0].id]: [ // 有機化学
      { id: "dcm_c1", ...P1, text: "SN2反応の立体反転（ワルデン反転）、分子模型で確認したら一発で理解できた！", ts: d(-1,14,20) },
      { id: "dcm_c2", ...P2, text: "求核剤の強さ：\n$I^- > Br^- > Cl^- > F^-$（極性プロトン性溶媒中）\n逆に極性非プロトン性溶媒だと $F^- > Cl^- > Br^- > I^-$\nこの逆転が試験によく出る", ts: d(-1,14,35) },
      { id: "dcm_c3", ...P3, text: "マルコフニコフ則：「富めるものはますます富む」\nHBrの付加で $H$ はH多い方の炭素に。\n反マルコフニコフ（過酸化物存在下）も覚えておこう", ts: d(-1,15,0) },
      { id: "dcm_c4", ...PU, text: "RDKitで分子構造描画できるよ：\n```python\nfrom rdkit import Chem\nfrom rdkit.Chem import Draw\nmol = Chem.MolFromSmiles('CCO')  # エタノール\nDraw.MolToImage(mol)\n```", ts: d(0,10,0) },
      { id: "dcm_c5", ...P4, text: "📊 有機化学の試験対策どうする？",
        ts: d(0,9,30), pollOptions: ["反応カード作る","過去問解く","友達と問題出し合う","前日に詰め込む"], pollVotes: {"反応カード作る":[10001,10003],"過去問解く":[10002,99999,10004],"友達と問題出し合う":[10001,10002],"前日に詰め込む":[10005]}, pollSettings: {multi:true} },
    ],
    [c[1].id]: [ // 物理化学
      { id: "dcm_c10", ...P2, text: "ヘスの法則使って反応エンタルピー計算する問題、経路をどう選ぶかがポイントだよね", ts: d(-1,16,0) },
      { id: "dcm_c11", ...P3, text: "そう！$\\Delta H$ は状態量だから経路に依存しない。既知の生成エンタルピーを使って：\n$$\\Delta H_{rxn} = \\sum \\Delta H_f^\\circ(\\text{生成物}) - \\sum \\Delta H_f^\\circ(\\text{反応物})$$", ts: d(0,9,10) },
    ],
    [c[2].id]: [ // 無機化学
      { id: "dcm_c20", ...P3, text: "d軌道の分裂、八面体と四面体で逆転するの覚えてる？八面体は $t_{2g}$ が低エネルギー、四面体は $e$ が低い", ts: d(-1,14,0) },
      { id: "dcm_c21", ...P2, text: "四面体場分裂エネルギーは八面体の約 $4/9$ 倍：$\\Delta_t \\approx \\frac{4}{9}\\Delta_o$\nだから四面体錯体は基本的に高スピン", ts: d(-1,14,20) },
      { id: "dcm_c22", ...PU, text: "配位化合物の命名法、IUPAC規則のポイント：\n1. 配位子（アルファベット順）→ 中心金属\n2. 陰イオン配位子は -o: chlorido, hydroxido\n3. 中性配位子はそのまま: ammine, aqua\n4. 酸化数をローマ数字で", ts: d(0,10,0) },
    ],
    [c[3].id]: [ // 分析化学
      { id: "dcm_c30", ...P1, text: "pHメーターの校正、2点校正（pH 4と7）と3点校正（4,7,10）どっちでやった？", ts: d(-1,14,0) },
      { id: "dcm_c31", ...P4, text: "3点校正の方が精度高いけど、酸性域しか測らないなら2点で十分って先生が言ってた", ts: d(-1,14,20) },
      { id: "dcm_c32", ...P3, text: "分析化学の定量で重要なのは**精度（precision）と正確さ（accuracy）**の違い。精度は再現性、正確さは真値との一致度。両方大事", ts: d(0,9,30) },
    ],
    [c[4].id]: [ // 化学実験
      { id: "dcm_c40", ...P4, text: "今日の再結晶、氷水で冷やしすぎて不純物ごと析出した…ゆっくり冷やすのが大事だった", ts: d(-1,14,0) },
      { id: "dcm_c41", ...P2, text: "融点測定したら文献値より3℃低かったんだけど、不純物混入のサイン？", ts: d(-1,14,20) },
      { id: "dcm_c42", ...PU, text: "融点降下は不純物の量に比例。$\\Delta T_f = K_f \\cdot m$（モル凝固点降下）\n純度が高いほど融点が鋭い（温度幅が狭い）", ts: d(0,10,0) },
    ],
    [c[5].id]: [ // 英語
      { id: "dcm_c50", ...P1, text: "Lab reportのMethodsセクション、受動態で書くのが普通？\"The solution was heated\" みたいに？", ts: d(-1,13,0) },
      { id: "dcm_c51", ...P3, text: "最近はactive voiceもOKなジャーナル増えてるけど、大学のレポートは**passive voice**が無難だよ", ts: d(0,9,0) },
    ],
    [c[6].id]: [ // 微積
      { id: "dcm_c60", ...P2, text: "反応速度論で出てくる微分方程式 $\\frac{d[A]}{dt} = -k[A]$ の解が $[A] = [A]_0 e^{-kt}$。微積の指数関数型が直結してる！", ts: d(-1,14,0) },
      { id: "dcm_c61", ...PU, text: "化学で微積が必要な場面まとめ：\n- 反応速度論（微分方程式）\n- 物理化学（熱力学関数の偏微分）\n- 分析化学（ピーク面積の積分）\n全部繋がってるんだよね", ts: d(0,9,30) },
    ],
    [c[7].id]: [ // 立志P
      { id: "dcm_c70", ...P4, text: "プレゼンの流れ確認したいんだけど、今週末にオンラインで打ち合わせできる？", ts: d(-1,13,0) },
      { id: "dcm_c71", ...P1, text: "土曜の午前中なら空いてるよ。Google Meetでいい？", ts: d(-1,13,15) },
      { id: "dcm_c72", ...P3, text: "📊 打ち合わせの日程",
        ts: d(0,9,0), pollOptions: ["土曜午前","土曜午後","日曜午前","平日放課後"], pollVotes: {"土曜午前":[10001,10003,99999],"土曜午後":[10002],"日曜午前":[10004],"平日放課後":[]}, pollSettings: {} },
    ],
  };
}

function medmChat(c) {
  return {
    [c[0].id]: [ // 解剖学II
      { id: "dcm_md1", ...P1, text: "今日の実習、上肢の神経同定できた？正中神経と尺骨神経の走行の違い、実物だとわかりやすかった", ts: d(-1,14,20) },
      { id: "dcm_md2", ...P2, text: "正中神経は前腕の前面中央、尺骨神経は肘の内側（funny bone）を通るのがポイント。触って確認できるよ", ts: d(-1,14,35) },
      { id: "dcm_md3", ...P3, text: "腕神経叢の枝、配布先を表にまとめたノート共有します。臨床では「手のしびれ」の鑑別に直結するから大事", ts: d(-1,15,0) },
      { id: "dcm_md4", ...PU, text: "Visible Body（解剖アプリ）で3Dモデル回転させながら覚えると効率いいよ。実習前の予習に使ってる", ts: d(0,9,30) },
      { id: "dcm_md5", ...P4, text: "📊 解剖実習、予習どれくらいしてる？",
        ts: d(0,11,0), pollOptions: ["2時間以上","1時間くらい","アトラスざっと見","ぶっつけ本番"], pollVotes: {"2時間以上":[10002],"1時間くらい":[10001,10003,99999],"アトラスざっと見":[10004],"ぶっつけ本番":[10005]}, pollSettings: {anon:true} },
    ],
    [c[1].id]: [ // 生理学II
      { id: "dcm_md10", ...P2, text: "スターリングの心臓の法則：前負荷↑ → 一回拍出量↑。フランク-スターリング曲線を描くとわかりやすい", ts: d(-1,16,0) },
      { id: "dcm_md11", ...P3, text: "心不全だとこの曲線が右下にシフトする。同じ前負荷でも拍出量が落ちるから肺うっ血が起こるんだよね", ts: d(0,9,10) },
    ],
    [c[2].id]: [ // 生化学II
      { id: "dcm_md20", ...P3, text: "電子伝達系の複合体I-IV、ATPの産生量は結局1分子のNADHから2.5ATP、FADHₕから1.5ATPでいいんだっけ？", ts: d(-1,14,0) },
      { id: "dcm_md21", ...P2, text: "そう、旧教科書の3ATP/2ATPから改訂された。P/O比が実測値に近づいた結果。グルコース1分子からの総ATP≒30-32", ts: d(-1,14,20) },
      { id: "dcm_md22", ...PU, text: "代謝マップ、KEGGデータベースで全体像を見ると繋がりがわかる。特にTCA回路とアミノ酸代謝の接点が試験に出やすい", ts: d(0,10,0) },
    ],
    [c[3].id]: [ // 微生物学
      { id: "dcm_md30", ...P1, text: "MRSA（メチシリン耐性黄色ブドウ球菌）の耐性機構って、mecA遺伝子がPBP2'を発現→β-ラクタム系が効かなくなるんだよね", ts: d(-1,15,0) },
      { id: "dcm_md31", ...P4, text: "バンコマイシンが最終兵器だったけどVRSAも出てきてるし、AMR（薬剤耐性）は本当に深刻な問題", ts: d(0,9,30) },
    ],
    [c[4].id]: [ // 免疫学
      { id: "dcm_md40", ...P4, text: "MHC class I は全有核細胞に発現、class II はAPCのみ。CD8はI、CD4はIIを認識。「8×1=8, 4×2=8」で覚えた", ts: d(-1,14,0) },
      { id: "dcm_md41", ...PU, text: "免疫チェックポイント阻害薬(PD-1/PD-L1阻害)って腫瘍免疫の講義で出てきたけど、ノーベル賞の本庶先生の研究だよね。臨床応用が急速に進んでる", ts: d(0,10,0) },
    ],
    [c[5].id]: [ // 医学英語II
      { id: "dcm_md50", ...P1, text: "症例提示の定型文 \"The patient is a [age]-year-old [gender] who presents with [chief complaint] of [duration]\" は暗記した方がいい", ts: d(-1,13,0) },
      { id: "dcm_md51", ...P3, text: "Physical exam の所見を英語で言うの難しい…\"Auscultation reveals a grade 3/6 systolic murmur best heard at the apex\" みたいな", ts: d(0,9,0) },
    ],
    [c[6].id]: [ // 発生学
      { id: "dcm_md60", ...P2, text: "神経管閉鎖不全：前方が閉じないと無脳症、後方だと二分脊椎。葉酸摂取で予防できるの知ってた？", ts: d(-1,14,0) },
      { id: "dcm_md61", ...PU, text: "心臓の発生が複雑すぎる…心臓ループ形成→中隔形成→弁形成の流れ、図を描きながら覚えるしかない", ts: d(0,9,30) },
    ],
    [c[7].id]: [ // 人体構造実習
      { id: "dcm_md70", ...P4, text: "次の実習範囲、胸部（心臓・肺・縦隔）だけど予習のポイントある？", ts: d(-1,13,0) },
      { id: "dcm_md71", ...P1, text: "縦隔の区画（上縦隔・前縦隔・中縦隔・後縦隔）と各区画の臓器をまず整理しておくと楽。ネッターのアトラスp.200あたり", ts: d(-1,13,20) },
      { id: "dcm_md72", ...P3, text: "📊 解剖アトラス、何使ってる？",
        ts: d(0,9,0), pollOptions: ["ネッター","プロメテウス","グレイ","Visible Body(アプリ)"], pollVotes: {"ネッター":[10001,10004],"プロメテウス":[10002,10003],"グレイ":[99999],"Visible Body(アプリ)":[10005]}, pollSettings: {} },
    ],
  };
}

function dendChat(c) {
  return {
    [c[0].id]: [ // 口腔解剖学II
      { id: "dcm_dd1", ...P1, text: "顎関節の構造、関節円板がポイントだよね。前方脱臼(開口障害)と関節円板のずれの関係を理解しないと", ts: d(-1,14,20) },
      { id: "dcm_dd2", ...P2, text: "顎関節は回転運動（開口初期）と滑走運動（大開口時）の複合運動。側方運動では作業側と非作業側で動きが違う", ts: d(-1,14,35) },
      { id: "dcm_dd3", ...P3, text: "オトガイ孔の位置（下顎小臼歯部の下方）は局所麻酔で使うから臨床的に超重要。あとオトガイ神経はV3の枝", ts: d(-1,15,0) },
      { id: "dcm_dd4", ...PU, text: "頭蓋骨の模型、解剖学実習室で借りて触りながら覚えると効率いいよ。蝶形骨は実物見ないと立体構造わからない", ts: d(0,9,30) },
    ],
    [c[1].id]: [ // 口腔生理学II
      { id: "dcm_dd10", ...P2, text: "味覚の閾値って甘味・塩味・酸味・苦味・うま味で全然違うんだよね。苦味が一番低い(=少量で感じる)のは毒物回避の進化的意味", ts: d(-1,16,0) },
      { id: "dcm_dd11", ...P3, text: "嚥下の3相：口腔相(随意)→咽頭相(不随意・反射)→食道相(蠕動運動)。咽頭相の喉頭蓋閉鎖が誤嚥防止の鍵", ts: d(0,9,10) },
    ],
    [c[2].id]: [ // 口腔微生物学
      { id: "dcm_dd20", ...P3, text: "歯周病の原因菌 Red Complex (Socransky)：\n- P. gingivalis\n- T. forsythia\n- T. denticola\nこの3菌が歯周ポケット内で増殖すると組織破壊が進む", ts: d(-1,14,0) },
      { id: "dcm_dd21", ...P2, text: "プラーク(バイオフィルム)の成熟過程：ペリクル形成→初期付着菌(Streptococcus)→共凝集→嫌気性菌の増殖。約2週間で成熟する", ts: d(-1,14,20) },
      { id: "dcm_dd22", ...PU, text: "位相差顕微鏡で歯垢を見る実習面白かった。螺旋菌（スピロヘータ）が動いてるの初めて見た…", ts: d(0,10,0) },
    ],
    [c[3].id]: [ // 歯科材料学II
      { id: "dcm_dd30", ...P1, text: "CAD/CAMの材料、ジルコニアとe.maxの使い分けってどうなってる？強度はジルコニア、審美はe.max？", ts: d(-1,14,0) },
      { id: "dcm_dd31", ...P4, text: "ジルコニアは曲げ強度1000MPa以上で臼歯部に最適。e.maxはフレームレスで透明感◎だからと前歯に使う。最近はマルチレイヤードジルコニアで両立もできる", ts: d(-1,14,20) },
    ],
    [c[4].id]: [ // 口腔組織学
      { id: "dcm_dd40", ...P4, text: "セメント質の種類、無細胞セメント質(歯頸部)と有細胞セメント質(根尖部)で機能が違うの覚えておこう", ts: d(-1,14,0) },
      { id: "dcm_dd41", ...PU, text: "歯根膜(PDL)の機能まとめ：\n- 支持（歯をソケットに固定）\n- 感覚（咬合力の感知 → 咬合調整反射）\n- 栄養（血管からセメント質・歯槽骨へ）\n- 修復（セメント芽細胞・骨芽細胞を含む）", ts: d(-1,14,30) },
    ],
    [c[5].id]: [ // 歯学英語II
      { id: "dcm_dd50", ...P1, text: "患者への説明で \"You have a cavity in your upper right molar\" って言うんだね。\"cavity\" = 齲蝕、日本語の「虫歯」に相当", ts: d(-1,13,0) },
      { id: "dcm_dd51", ...P3, text: "歯式の英語表記、FDI方式(11-48)とUniversal方式(1-32)の両方覚えないといけないの面倒…国際学会ではFDI", ts: d(0,9,0) },
    ],
    [c[6].id]: [ // 歯科薬理学
      { id: "dcm_dd60", ...P2, text: "NSAIDsの作用機序：COX阻害→PG合成↓→鎮痛・抗炎症。でも胃粘膜保護のPGも↓だから胃潰瘍のリスク。COX-2選択的阻害薬(セレコキシブ)で軽減", ts: d(-1,14,0) },
      { id: "dcm_dd61", ...PU, text: "歯科でよく処方する薬:\n- 鎮痛: ロキソプロフェン(ロキソニン)\n- 抗菌: アモキシシリン(サワシリン)\n- 消炎: アズレンスルホン酸Na(うがい薬)\n処方箋の書き方も試験に出るから注意", ts: d(0,10,0) },
    ],
    [c[7].id]: [ // 歯科基礎実習
      { id: "dcm_dd70", ...P4, text: "ワックスアップの咬頭頂の位置、模型と教科書見比べても微妙にズレる…先生のお手本が上手すぎて参考にならない", ts: d(-1,13,0) },
      { id: "dcm_dd71", ...P1, text: "コツは最初に咬頭頂の4点(近心頬側・遠心頬側・近心舌側・遠心舌側)をしっかり決めてから隆線を繋ぐこと。溝は最後に掘る", ts: d(-1,13,20) },
      { id: "dcm_dd72", ...P3, text: "📊 実習で一番苦手な操作は？",
        ts: d(0,9,0), pollOptions: ["ワックスアップ","印象採得","支台歯形成","石膏注入"], pollVotes: {"ワックスアップ":[10001,10004],"印象採得":[10002,10003],"支台歯形成":[99999],"石膏注入":[10005]}, pollSettings: {} },
    ],
  };
}

// ── ペルソナ別通知 ──
function generateNotifications(q2) {
  return [
    { id: 601, type: "deadline", text: `「${q2[4]?.name||'実習'}」の締切が明日です`, cid: q2[4]?.id, ts: d(0,9,0), read: false },
    { id: 602, type: "course", text: `「${q2[0]?.name}」に新しい教材がアップロードされました`, cid: q2[0]?.id, ts: d(0,8,0), read: false },
    { id: 603, type: "deadline", text: `「${q2[0]?.name} 第3回レポート」の締切が2日後です`, cid: q2[0]?.id, ts: d(-1,9,0), read: false },
    { id: 604, type: "dm", text: "山田花子さんからメッセージが届きました", cid: null, ts: d(-1,14,45), read: true },
    { id: 605, type: "course", text: `「${q2[3]?.name}」の小テスト3が公開されました`, cid: q2[3]?.id, ts: d(-2,12,0), read: true },
    { id: 606, type: "event", text: "「プログラミングコンテスト 2026 Spring」の参加登録が開始しました", cid: null, ts: d(-3,10,0), read: true },
    { id: 607, type: "course", text: `「${q2[6]?.name||q2[2]?.name}」の小テスト2の成績が公開されました`, cid: q2[6]?.id||q2[2]?.id, ts: d(-4,16,0), read: true },
  ];
}

// ── ペルソナ別成績 ──
const PERSONA_GRADES = {
  mec: {
    summary: { studentId: "25B10042", name: "鉄野 修平", totalCredits: 58, gpa: { overall: 2.65, major: 2.80, liberal: 2.35 } },
    categories: [
      { name: "文系教養科目", credits: 4 }, { name: "英語科目", credits: 3 }, { name: "理工系教養科目", credits: 6 },
      { name: "機械系専門科目", credits: 30 }, { name: "数理系科目", credits: 10 }, { name: "広域教養科目", credits: 2 }, { name: "第二外国語科目", credits: 3 },
    ],
    courses: [
      { code: "MEC.T101", name: "静力学", grade: "75", credits: "2", quarter: "1", period: "2025-1Q", instructor: "吉田 剛", recommendation: "R", gradeNum: 75 },
      { code: "LAS.S201", name: "微分積分学第一", grade: "68", credits: "2", quarter: "1", period: "2025-1Q", instructor: "佐々木 修", recommendation: "R", gradeNum: 68 },
      { code: "LAS.M101", name: "物理学基礎", grade: "72", credits: "2", quarter: "1", period: "2025-1Q", instructor: "高橋 誠", recommendation: "R", gradeNum: 72 },
      { code: "LAH.S101", name: "東工大立志プロジェクト", grade: "合格", credits: "1", quarter: "1", period: "2025-1Q", instructor: "複数教員", recommendation: "R", gradeNum: null },
      { code: "LAS.A101", name: "英語第一 S", grade: "70", credits: "1", quarter: "1", period: "2025-1Q", instructor: "Smith J.", recommendation: "R", gradeNum: 70 },
      { code: "MEC.T111", name: "製図基礎", grade: "80", credits: "2", quarter: "1", period: "2025-1Q", instructor: "森田 隆", recommendation: "R", gradeNum: 80 },
      { code: "MEC.T201", name: "材料力学第一", grade: "82", credits: "2", quarter: "2", period: "2025-2Q", instructor: "田村 正", recommendation: "R", gradeNum: 82 },
      { code: "MEC.T211", name: "熱力学第一", grade: "70", credits: "2", quarter: "2", period: "2025-2Q", instructor: "山口 健", recommendation: "R", gradeNum: 70 },
      { code: "MEC.T221", name: "流体力学第一", grade: "65", credits: "2", quarter: "2", period: "2025-2Q", instructor: "藤本 誠", recommendation: "R", gradeNum: 65 },
      { code: "LAS.A101", name: "英語第二 S", grade: "72", credits: "1", quarter: "2", period: "2025-2Q", instructor: "Brown K.", recommendation: "R", gradeNum: 72 },
      { code: "LAS.S203", name: "微分積分学第二", grade: "62", credits: "2", quarter: "2", period: "2025-2Q", instructor: "佐々木 修", recommendation: "R", gradeNum: 62 },
      { code: "MEC.T251", name: "制御工学第一", grade: "78", credits: "2", quarter: "3", period: "2025-3Q", instructor: "中島 亮", recommendation: "R", gradeNum: 78 },
      { code: "MEC.T261", name: "機械加工学", grade: "85", credits: "2", quarter: "3", period: "2025-3Q", instructor: "松本 拓", recommendation: "R", gradeNum: 85 },
      { code: "LAL.G101", name: "ドイツ語初級1", grade: "77", credits: "1", quarter: "3", period: "2025-3Q", instructor: "Schmidt H.", recommendation: "A", gradeNum: 77 },
      { code: "MEC.T281", name: "機械設計", grade: "88", credits: "2", quarter: "4", period: "2025-4Q", instructor: "岡田 慎一", recommendation: "R", gradeNum: 88 },
      { code: "MEC.T291", name: "振動工学", grade: "73", credits: "2", quarter: "4", period: "2025-4Q", instructor: "西田 浩", recommendation: "R", gradeNum: 73 },
      { code: "LAL.G103", name: "ドイツ語初級2", grade: "75", credits: "1", quarter: "4", period: "2025-4Q", instructor: "Schmidt H.", recommendation: "A", gradeNum: 75 },
      { code: "LAH.T101", name: "哲学入門", grade: "70", credits: "2", quarter: "4", period: "2025-4Q", instructor: "小林 哲也", recommendation: "A", gradeNum: 70 },
      // 現在受講中 (2Q)
      { code: "MEC.T201", name: "材料力学第一", grade: "未報告", credits: "2", quarter: "2", period: "2026-2Q", instructor: "田村 正", recommendation: "R", gradeNum: null },
      { code: "MEC.T211", name: "熱力学第一", grade: "未報告", credits: "2", quarter: "2", period: "2026-2Q", instructor: "山口 健", recommendation: "R", gradeNum: null },
      { code: "MEC.T221", name: "流体力学第一", grade: "未報告", credits: "2", quarter: "2", period: "2026-2Q", instructor: "藤本 誠", recommendation: "R", gradeNum: null },
      { code: "MEC.T231", name: "機械力学", grade: "未報告", credits: "2", quarter: "2", period: "2026-2Q", instructor: "鈴木 大", recommendation: "R", gradeNum: null },
      { code: "MEC.T241", name: "機械製図", grade: "未報告", credits: "2", quarter: "2", period: "2026-2Q", instructor: "森田 隆", recommendation: "R", gradeNum: null },
    ],
  },
  phy: {
    summary: { studentId: "25B00018", name: "波動 理沙", totalCredits: 60, gpa: { overall: 3.15, major: 3.35, liberal: 2.60 } },
    categories: [
      { name: "文系教養科目", credits: 4 }, { name: "英語科目", credits: 3 }, { name: "理工系教養科目", credits: 4 },
      { name: "物理学系専門科目", credits: 32 }, { name: "数学系科目", credits: 12 }, { name: "第二外国語科目", credits: 3 }, { name: "広域教養科目", credits: 2 },
    ],
    courses: [
      { code: "PHY.S110", name: "力学基礎", grade: "90", credits: "2", quarter: "1", period: "2025-1Q", instructor: "河野 誠", recommendation: "R", gradeNum: 90 },
      { code: "MTH.T201", name: "微分積分学第一", grade: "88", credits: "2", quarter: "1", period: "2025-1Q", instructor: "佐々木 修", recommendation: "R", gradeNum: 88 },
      { code: "MTH.T211", name: "線形代数学第一", grade: "92", credits: "2", quarter: "1", period: "2025-1Q", instructor: "松田 健", recommendation: "R", gradeNum: 92 },
      { code: "PHY.S120", name: "電磁気学第一", grade: "85", credits: "2", quarter: "1", period: "2025-1Q", instructor: "小林 誠", recommendation: "R", gradeNum: 85 },
      { code: "LAS.A101", name: "英語第一 S", grade: "75", credits: "1", quarter: "1", period: "2025-1Q", instructor: "Smith J.", recommendation: "R", gradeNum: 75 },
      { code: "LAS.C101", name: "化学基礎", grade: "70", credits: "2", quarter: "1", period: "2025-1Q", instructor: "石井 陽介", recommendation: "R", gradeNum: 70 },
      { code: "PHY.S210", name: "量子力学第一", grade: "93", credits: "2", quarter: "2", period: "2025-2Q", instructor: "渡辺 光", recommendation: "R", gradeNum: 93 },
      { code: "PHY.S220", name: "電磁気学第二", grade: "87", credits: "2", quarter: "2", period: "2025-2Q", instructor: "小林 誠", recommendation: "R", gradeNum: 87 },
      { code: "PHY.S230", name: "統計力学第一", grade: "80", credits: "2", quarter: "2", period: "2025-2Q", instructor: "永田 健一", recommendation: "R", gradeNum: 80 },
      { code: "MTH.T211", name: "解析学第二", grade: "85", credits: "2", quarter: "2", period: "2025-2Q", instructor: "松田 健", recommendation: "R", gradeNum: 85 },
      { code: "PHY.S310", name: "量子力学第二", grade: "88", credits: "2", quarter: "3", period: "2025-3Q", instructor: "渡辺 光", recommendation: "R", gradeNum: 88 },
      { code: "PHY.S320", name: "光学", grade: "82", credits: "2", quarter: "3", period: "2025-3Q", instructor: "上田 幸一", recommendation: "R", gradeNum: 82 },
      { code: "LAL.G101", name: "ドイツ語初級1", grade: "73", credits: "1", quarter: "3", period: "2025-3Q", instructor: "Schmidt H.", recommendation: "A", gradeNum: 73 },
      { code: "PHY.S410", name: "原子核物理学", grade: "86", credits: "2", quarter: "4", period: "2025-4Q", instructor: "木村 剛", recommendation: "R", gradeNum: 86 },
      { code: "LAL.G103", name: "ドイツ語初級2", grade: "71", credits: "1", quarter: "4", period: "2025-4Q", instructor: "Schmidt H.", recommendation: "A", gradeNum: 71 },
      { code: "LAH.T101", name: "哲学入門", grade: "68", credits: "2", quarter: "4", period: "2025-4Q", instructor: "小林 哲也", recommendation: "A", gradeNum: 68 },
      // 現在受講中
      { code: "PHY.S210", name: "量子力学第一", grade: "未報告", credits: "2", quarter: "2", period: "2026-2Q", instructor: "渡辺 光", recommendation: "R", gradeNum: null },
      { code: "PHY.S220", name: "電磁気学第二", grade: "未報告", credits: "2", quarter: "2", period: "2026-2Q", instructor: "小林 誠", recommendation: "R", gradeNum: null },
      { code: "PHY.S230", name: "統計力学第一", grade: "未報告", credits: "2", quarter: "2", period: "2026-2Q", instructor: "永田 健一", recommendation: "R", gradeNum: null },
      { code: "PHY.S240", name: "物理学実験第二", grade: "未報告", credits: "2", quarter: "2", period: "2026-2Q", instructor: "複数教員", recommendation: "R", gradeNum: null },
    ],
  },
  cap: {
    summary: { studentId: "25B20055", name: "分子 あゆみ", totalCredits: 56, gpa: { overall: 2.90, major: 3.05, liberal: 2.50 } },
    categories: [
      { name: "文系教養科目", credits: 4 }, { name: "英語科目", credits: 3 }, { name: "理工系教養科目", credits: 6 },
      { name: "応用化学系専門科目", credits: 28 }, { name: "数理系科目", credits: 8 }, { name: "第二外国語科目", credits: 3 }, { name: "広域教養科目", credits: 4 },
    ],
    courses: [
      { code: "CAP.A101", name: "有機化学第一", grade: "82", credits: "2", quarter: "1", period: "2025-1Q", instructor: "林 修一", recommendation: "R", gradeNum: 82 },
      { code: "LAS.S201", name: "微分積分学第一", grade: "70", credits: "2", quarter: "1", period: "2025-1Q", instructor: "佐々木 修", recommendation: "R", gradeNum: 70 },
      { code: "LAS.M101", name: "物理学基礎", grade: "68", credits: "2", quarter: "1", period: "2025-1Q", instructor: "高橋 誠", recommendation: "R", gradeNum: 68 },
      { code: "CAP.A111", name: "物理化学第一", grade: "75", credits: "2", quarter: "1", period: "2025-1Q", instructor: "白石 誠", recommendation: "R", gradeNum: 75 },
      { code: "LAS.A101", name: "英語第一 S", grade: "80", credits: "1", quarter: "1", period: "2025-1Q", instructor: "Smith J.", recommendation: "R", gradeNum: 80 },
      { code: "LAH.S101", name: "東工大立志プロジェクト", grade: "合格", credits: "1", quarter: "1", period: "2025-1Q", instructor: "複数教員", recommendation: "R", gradeNum: null },
      { code: "CAP.A201", name: "有機化学第二", grade: "78", credits: "2", quarter: "2", period: "2025-2Q", instructor: "林 修一", recommendation: "R", gradeNum: 78 },
      { code: "CAP.A211", name: "物理化学第二", grade: "72", credits: "2", quarter: "2", period: "2025-2Q", instructor: "白石 誠", recommendation: "R", gradeNum: 72 },
      { code: "CAP.A221", name: "無機化学第一", grade: "80", credits: "2", quarter: "2", period: "2025-2Q", instructor: "田原 進", recommendation: "R", gradeNum: 80 },
      { code: "LAS.A101", name: "英語第二 S", grade: "76", credits: "1", quarter: "2", period: "2025-2Q", instructor: "Brown K.", recommendation: "R", gradeNum: 76 },
      { code: "LAS.S203", name: "微分積分学第二", grade: "65", credits: "2", quarter: "2", period: "2025-2Q", instructor: "佐々木 修", recommendation: "R", gradeNum: 65 },
      { code: "CAP.A301", name: "高分子化学", grade: "85", credits: "2", quarter: "3", period: "2025-3Q", instructor: "大村 智", recommendation: "R", gradeNum: 85 },
      { code: "CAP.A311", name: "化学工学基礎", grade: "77", credits: "2", quarter: "3", period: "2025-3Q", instructor: "松井 誠", recommendation: "R", gradeNum: 77 },
      { code: "LAL.G101", name: "ドイツ語初級1", grade: "80", credits: "1", quarter: "3", period: "2025-3Q", instructor: "Schmidt H.", recommendation: "A", gradeNum: 80 },
      { code: "CAP.A401", name: "機器分析", grade: "90", credits: "2", quarter: "4", period: "2025-4Q", instructor: "三浦 隆", recommendation: "R", gradeNum: 90 },
      { code: "CAP.A411", name: "触媒化学", grade: "83", credits: "2", quarter: "4", period: "2025-4Q", instructor: "佐野 健", recommendation: "R", gradeNum: 83 },
      { code: "LAL.G103", name: "ドイツ語初級2", grade: "78", credits: "1", quarter: "4", period: "2025-4Q", instructor: "Schmidt H.", recommendation: "A", gradeNum: 78 },
      // 現在受講中
      { code: "CAP.A201", name: "有機化学第二", grade: "未報告", credits: "2", quarter: "2", period: "2026-2Q", instructor: "林 修一", recommendation: "R", gradeNum: null },
      { code: "CAP.A211", name: "物理化学第二", grade: "未報告", credits: "2", quarter: "2", period: "2026-2Q", instructor: "白石 誠", recommendation: "R", gradeNum: null },
      { code: "CAP.A221", name: "無機化学第一", grade: "未報告", credits: "2", quarter: "2", period: "2026-2Q", instructor: "田原 進", recommendation: "R", gradeNum: null },
      { code: "CAP.A241", name: "化学実験第二", grade: "未報告", credits: "2", quarter: "2", period: "2026-2Q", instructor: "複数教員", recommendation: "R", gradeNum: null },
    ],
  },
  med: {
    summary: { studentId: "25B61033", name: "白石 遥", totalCredits: 52, gpa: { overall: 3.05, major: 3.20, liberal: 2.60 } },
    categories: [
      { name: "基礎医学科目", credits: 32 }, { name: "教養科目", credits: 8 }, { name: "医学英語", credits: 4 },
      { name: "実習科目", credits: 6 }, { name: "社会医学系科目", credits: 2 },
    ],
    courses: [
      // 2025 1Q
      { code: "MED.A101", name: "解剖学I", grade: "82", credits: "3", quarter: "1", period: "2025-1Q", instructor: "山田 太一", recommendation: "R", gradeNum: 82 },
      { code: "MED.A111", name: "生理学I", grade: "78", credits: "2", quarter: "1", period: "2025-1Q", instructor: "高田 明", recommendation: "R", gradeNum: 78 },
      { code: "MED.A121", name: "生化学I", grade: "85", credits: "2", quarter: "1", period: "2025-1Q", instructor: "中島 裕", recommendation: "R", gradeNum: 85 },
      { code: "MED.A131", name: "組織学", grade: "80", credits: "2", quarter: "1", period: "2025-1Q", instructor: "西村 純", recommendation: "R", gradeNum: 80 },
      { code: "MED.A141", name: "医学英語I", grade: "75", credits: "1", quarter: "1", period: "2025-1Q", instructor: "Wilson R.", recommendation: "R", gradeNum: 75 },
      { code: "MED.A151", name: "医療概論", grade: "合格", credits: "1", quarter: "1", period: "2025-1Q", instructor: "複数教員", recommendation: "R", gradeNum: null },
      // 2025 2Q
      { code: "MED.A202", name: "解剖学II", grade: "88", credits: "3", quarter: "2", period: "2025-2Q", instructor: "山田 太一", recommendation: "R", gradeNum: 88 },
      { code: "MED.A212", name: "生理学II", grade: "75", credits: "2", quarter: "2", period: "2025-2Q", instructor: "高田 明", recommendation: "R", gradeNum: 75 },
      { code: "MED.A222", name: "生化学II", grade: "80", credits: "2", quarter: "2", period: "2025-2Q", instructor: "中島 裕", recommendation: "R", gradeNum: 80 },
      { code: "MED.A252", name: "医学英語II", grade: "72", credits: "1", quarter: "2", period: "2025-2Q", instructor: "Wilson R.", recommendation: "R", gradeNum: 72 },
      // 2025 3Q
      { code: "MED.A301", name: "病理学I", grade: "83", credits: "2", quarter: "3", period: "2025-3Q", instructor: "藤原 誠一", recommendation: "R", gradeNum: 83 },
      { code: "MED.A311", name: "薬理学I", grade: "77", credits: "2", quarter: "3", period: "2025-3Q", instructor: "大西 健", recommendation: "R", gradeNum: 77 },
      { code: "MED.A321", name: "社会医学", grade: "合格", credits: "2", quarter: "3", period: "2025-3Q", instructor: "上田 洋子", recommendation: "R", gradeNum: null },
      // 2025 4Q
      { code: "MED.A302", name: "病理学II", grade: "86", credits: "2", quarter: "4", period: "2025-4Q", instructor: "藤原 誠一", recommendation: "R", gradeNum: 86 },
      { code: "MED.A312", name: "薬理学II", grade: "74", credits: "2", quarter: "4", period: "2025-4Q", instructor: "大西 健", recommendation: "R", gradeNum: 74 },
      { code: "MED.A352", name: "寄生虫学", grade: "79", credits: "2", quarter: "4", period: "2025-4Q", instructor: "関口 誠", recommendation: "R", gradeNum: 79 },
      // 現在受講中 (2026-2Q)
      { code: "MED.A202", name: "解剖学II", grade: "未報告", credits: "3", quarter: "2", period: "2026-2Q", instructor: "山田 太一", recommendation: "R", gradeNum: null },
      { code: "MED.A212", name: "生理学II", grade: "未報告", credits: "2", quarter: "2", period: "2026-2Q", instructor: "高田 明", recommendation: "R", gradeNum: null },
      { code: "MED.A222", name: "生化学II", grade: "未報告", credits: "2", quarter: "2", period: "2026-2Q", instructor: "中島 裕", recommendation: "R", gradeNum: null },
      { code: "MED.A232", name: "微生物学", grade: "未報告", credits: "2", quarter: "2", period: "2026-2Q", instructor: "松本 剛", recommendation: "R", gradeNum: null },
      { code: "MED.A242", name: "免疫学", grade: "未報告", credits: "2", quarter: "2", period: "2026-2Q", instructor: "井上 誠", recommendation: "R", gradeNum: null },
      { code: "MED.A272", name: "人体構造実習", grade: "未報告", credits: "3", quarter: "2", period: "2026-2Q", instructor: "山田 太一", recommendation: "R", gradeNum: null },
    ],
  },
  den: {
    summary: { studentId: "25B65017", name: "清水 凛", totalCredits: 48, gpa: { overall: 2.85, major: 2.95, liberal: 2.55 } },
    categories: [
      { name: "歯学基礎科目", credits: 28 }, { name: "教養科目", credits: 8 }, { name: "歯学英語", credits: 4 },
      { name: "実習科目", credits: 6 }, { name: "歯科臨床基礎科目", credits: 2 },
    ],
    courses: [
      // 2025 1Q
      { code: "DEN.A101", name: "口腔解剖学I", grade: "78", credits: "2", quarter: "1", period: "2025-1Q", instructor: "森田 誠", recommendation: "R", gradeNum: 78 },
      { code: "DEN.A111", name: "口腔生理学I", grade: "72", credits: "2", quarter: "1", period: "2025-1Q", instructor: "佐藤 健一", recommendation: "R", gradeNum: 72 },
      { code: "DEN.A121", name: "口腔生化学", grade: "80", credits: "2", quarter: "1", period: "2025-1Q", instructor: "小川 誠", recommendation: "R", gradeNum: 80 },
      { code: "DEN.A131", name: "歯科材料学I", grade: "85", credits: "2", quarter: "1", period: "2025-1Q", instructor: "田辺 拓也", recommendation: "R", gradeNum: 85 },
      { code: "DEN.A141", name: "歯学英語I", grade: "70", credits: "1", quarter: "1", period: "2025-1Q", instructor: "Carter A.", recommendation: "R", gradeNum: 70 },
      { code: "DEN.A151", name: "歯学概論", grade: "合格", credits: "1", quarter: "1", period: "2025-1Q", instructor: "複数教員", recommendation: "R", gradeNum: null },
      // 2025 2Q
      { code: "DEN.A202", name: "口腔解剖学II", grade: "82", credits: "2", quarter: "2", period: "2025-2Q", instructor: "森田 誠", recommendation: "R", gradeNum: 82 },
      { code: "DEN.A212", name: "口腔生理学II", grade: "75", credits: "2", quarter: "2", period: "2025-2Q", instructor: "佐藤 健一", recommendation: "R", gradeNum: 75 },
      { code: "DEN.A222", name: "口腔微生物学", grade: "78", credits: "2", quarter: "2", period: "2025-2Q", instructor: "野口 修", recommendation: "R", gradeNum: 78 },
      { code: "DEN.A252", name: "歯学英語II", grade: "68", credits: "1", quarter: "2", period: "2025-2Q", instructor: "Carter A.", recommendation: "R", gradeNum: 68 },
      // 2025 3Q
      { code: "DEN.A301", name: "口腔病理学", grade: "80", credits: "2", quarter: "3", period: "2025-3Q", instructor: "伊東 大輔", recommendation: "R", gradeNum: 80 },
      { code: "DEN.A311", name: "歯科補綴学I", grade: "77", credits: "2", quarter: "3", period: "2025-3Q", instructor: "大塚 誠", recommendation: "R", gradeNum: 77 },
      { code: "DEN.A321", name: "保存修復学", grade: "83", credits: "2", quarter: "3", period: "2025-3Q", instructor: "清野 健", recommendation: "R", gradeNum: 83 },
      // 2025 4Q
      { code: "DEN.A302", name: "歯周病学", grade: "75", credits: "2", quarter: "4", period: "2025-4Q", instructor: "村田 洋介", recommendation: "R", gradeNum: 75 },
      { code: "DEN.A312", name: "歯科補綴学II", grade: "81", credits: "2", quarter: "4", period: "2025-4Q", instructor: "大塚 誠", recommendation: "R", gradeNum: 81 },
      { code: "DEN.A332", name: "口腔外科学I", grade: "73", credits: "2", quarter: "4", period: "2025-4Q", instructor: "岡本 哲", recommendation: "R", gradeNum: 73 },
      // 現在受講中 (2026-2Q)
      { code: "DEN.A202", name: "口腔解剖学II", grade: "未報告", credits: "2", quarter: "2", period: "2026-2Q", instructor: "森田 誠", recommendation: "R", gradeNum: null },
      { code: "DEN.A212", name: "口腔生理学II", grade: "未報告", credits: "2", quarter: "2", period: "2026-2Q", instructor: "佐藤 健一", recommendation: "R", gradeNum: null },
      { code: "DEN.A222", name: "口腔微生物学", grade: "未報告", credits: "2", quarter: "2", period: "2026-2Q", instructor: "野口 修", recommendation: "R", gradeNum: null },
      { code: "DEN.A232", name: "歯科材料学II", grade: "未報告", credits: "2", quarter: "2", period: "2026-2Q", instructor: "田辺 拓也", recommendation: "R", gradeNum: null },
      { code: "DEN.A272", name: "歯科基礎実習", grade: "未報告", credits: "2", quarter: "2", period: "2026-2Q", instructor: "複数教員", recommendation: "R", gradeNum: null },
    ],
  },
};

// ── ペルソナデータ活性化 (既存 DEMO_* オブジェクトを書き換え) ──
const _CSC_POSTS = { ...DEMO_POSTS };
const _CSC_CHAT = { ...DEMO_CHAT_MESSAGES };
const _CSC_NOTIF = [...DEMO_NOTIFICATIONS];
const _CSC_GRADES = JSON.parse(JSON.stringify(DEMO_GRADES));

function activatePersonaData(personaId, q2Courses) {
  // Posts
  for (const k of Object.keys(DEMO_POSTS)) delete DEMO_POSTS[k];
  if (personaId === "csc" || personaId === "ss") Object.assign(DEMO_POSTS, _CSC_POSTS);
  else if (personaId === "mec") Object.assign(DEMO_POSTS, mecPosts(q2Courses));
  else if (personaId === "phy") Object.assign(DEMO_POSTS, phyPosts(q2Courses));
  else if (personaId === "cap") Object.assign(DEMO_POSTS, capPosts(q2Courses));
  else if (personaId === "med") Object.assign(DEMO_POSTS, medmPosts(q2Courses));
  else if (personaId === "den") Object.assign(DEMO_POSTS, dendPosts(q2Courses));

  // Chat
  for (const k of Object.keys(DEMO_CHAT_MESSAGES)) delete DEMO_CHAT_MESSAGES[k];
  if (personaId === "csc" || personaId === "ss") Object.assign(DEMO_CHAT_MESSAGES, _CSC_CHAT);
  else if (personaId === "mec") Object.assign(DEMO_CHAT_MESSAGES, mecChat(q2Courses));
  else if (personaId === "phy") Object.assign(DEMO_CHAT_MESSAGES, phyChat(q2Courses));
  else if (personaId === "cap") Object.assign(DEMO_CHAT_MESSAGES, capChat(q2Courses));
  else if (personaId === "med") Object.assign(DEMO_CHAT_MESSAGES, medmChat(q2Courses));
  else if (personaId === "den") Object.assign(DEMO_CHAT_MESSAGES, dendChat(q2Courses));

  // Notifications
  DEMO_NOTIFICATIONS.length = 0;
  if (personaId === "csc" || personaId === "ss") DEMO_NOTIFICATIONS.push(..._CSC_NOTIF);
  else DEMO_NOTIFICATIONS.push(...generateNotifications(q2Courses));

  // Grades
  if (personaId === "csc" || personaId === "ss") {
    DEMO_GRADES.summary = { ..._CSC_GRADES.summary };
    DEMO_GRADES.categories = _CSC_GRADES.categories;
    DEMO_GRADES.courses = _CSC_GRADES.courses;
    if (personaId === "ss") {
      DEMO_GRADES.summary.name = "藤原 陽翔";
      DEMO_GRADES.summary.studentId = "25B30042";
    }
  } else if (PERSONA_GRADES[personaId]) {
    const g = PERSONA_GRADES[personaId];
    DEMO_GRADES.summary = g.summary;
    DEMO_GRADES.categories = g.categories;
    DEMO_GRADES.courses = g.courses;
  }

  // Attendance (keyed by Q2 course IDs)
  for (const k of Object.keys(DEMO_ATT)) delete DEMO_ATT[k];
  for (const c of q2Courses) {
    DEMO_ATT[c.id] = { total: 12, attended: 10 + Math.floor(Math.random() * 3), late: Math.floor(Math.random() * 2) };
  }
}

/** ペルソナからデモデータ一式を生成（全クォーター対応） */
function buildDemoDataForPersona(personaId) {
  const p = DEMO_PERSONAS.find(x => x.id === personaId) || DEMO_PERSONAS[0];
  const q1 = p.q[1] || [];
  const q2 = p.q[2] || [];
  const q3 = p.q[3] || [];
  const q4 = p.q[4] || [];
  const allCourses = [...q1, ...q2, ...q3, ...q4];
  const qdata = {
    1: { C: q1, TT: buildDemoTT(q1) },
    2: { C: q2, TT: buildDemoTT(q2) },
    3: { C: q3, TT: buildDemoTT(q3) },
    4: { C: q4, TT: buildDemoTT(q4) },
  };
  const asgn = p.asgn || buildPersonaAsgn(q1, q2);
  const user = { userid: 99999, fullname: p.name, yearGroup: p.yearGroup, studentId: p.studentId, dept: p.deptKey || null };

  // ペルソナ固有のデータでグローバル DEMO_* を書き換え
  activatePersonaData(p.id, q2);

  return { courses: allCourses, qdata, asgn, user };
}

// ── 期末試験（デモ用） ──
const DEMO_EXAMS = {
  quarters: [
    { year: "2026", quarter: 2, label: "2026年度 2Q" },
    { year: "2025", quarter: 4, label: "2025年度 4Q" },
  ],
  exams: [
    // 2Q 期末試験 — デモコースに対応
    { date: "2026-06-18", day: "水", period: "1-2", code: "LAS.A101", code_raw: "LAS.A101", name: "英語第二 S", instructor: "Smith J.", room: "W9-31", year: "2026", quarter: 2 },
    { date: "2026-06-19", day: "木", period: "3-4", code: "MCS.T213", code_raw: "MCS.T213", name: "確率と統計", instructor: "木村 真理", room: "W5-21", year: "2026", quarter: 2 },
    { date: "2026-06-20", day: "金", period: "1-2", code: "CSC.T263", code_raw: "CSC.T263", name: "コンピュータアーキテクチャ", instructor: "加藤 浩一", room: "W6-31", year: "2026", quarter: 2 },
    { date: "2026-06-23", day: "月", period: "3-4", code: "CSC.T243", code_raw: "CSC.T243", name: "データ構造とアルゴリズム", instructor: "鈴木 太郎", room: "W6-31", year: "2026", quarter: 2 },
    { date: "2026-06-24", day: "火", period: "1-2", code: "MCS.T223", code_raw: "MCS.T223", name: "線形代数学第二", instructor: "松田 健", room: "W5-21", year: "2026", quarter: 2 },
    { date: "2026-06-24", day: "火", period: "5-6", code: "CSC.T253", code_raw: "CSC.T253", name: "論理と形式言語", instructor: "伊藤 正", room: "S2-203", year: "2026", quarter: 2 },
  ],
};

export {
  DEMO_COURSES, DEMO_QDATA, DEMO_ASGN, DEMO_GRADES, DEMO_ATT,
  DEMO_USER, DEMO_EVENTS, DEMO_REVIEWS, DEMO_MY_EVENTS, DEMO_TASKS,
  DEMO_FRIENDS, DEMO_FRIEND_PENDING, DEMO_FRIEND_SENT,
  DEMO_DM_CONVERSATIONS, DEMO_GROUPS, DEMO_NOTIFICATIONS,
  DEMO_POSTS, DEMO_CIRCLES, DEMO_CIRCLE_MESSAGES, DEMO_DISCOVER_CIRCLES,
  DEMO_CHAT_MESSAGES, DEMO_EXAMS,
  DEMO_PERSONAS, buildDemoDataForPersona,
  DEMO_MED_RAW_COURSES, buildDemoMedSessions,
};

// ══════════════════════════════════════════════
//  医歯学時間割デモ用データ
// ══════════════════════════════════════════════

// MedTTView に渡す raw Moodle コース形式 (fullname に【lctCd】が必要)
const DEMO_MED_RAW_COURSES = {
  med: [
    { id: 501, fullname: "解剖学II / Anatomy II【021201】", shortname: "MED.A202[2026]", visible: 1 },
    { id: 502, fullname: "生理学II / Physiology II【021202】", shortname: "MED.A212[2026]", visible: 1 },
    { id: 503, fullname: "生化学II / Biochemistry II【021203】", shortname: "MED.A222[2026]", visible: 1 },
    { id: 504, fullname: "微生物学 / Microbiology【021204】", shortname: "MED.A232[2026]", visible: 1 },
    { id: 505, fullname: "免疫学 / Immunology【021205】", shortname: "MED.A242[2026]", visible: 1 },
    { id: 506, fullname: "医学英語II / Medical English II【021206】", shortname: "MED.A252[2026]", visible: 1 },
    { id: 507, fullname: "発生学 / Embryology【021207】", shortname: "MED.A262[2026]", visible: 1 },
    { id: 508, fullname: "人体構造実習 / Gross Anatomy Lab【021208】", shortname: "MED.A272[2026]", visible: 1 },
  ],
  den: [
    { id: 601, fullname: "口腔解剖学II / Oral Anatomy II【021301】", shortname: "DEN.A202[2026]", visible: 1 },
    { id: 602, fullname: "口腔生理学II / Oral Physiology II【021302】", shortname: "DEN.A212[2026]", visible: 1 },
    { id: 603, fullname: "口腔微生物学 / Oral Microbiology【021303】", shortname: "DEN.A222[2026]", visible: 1 },
    { id: 604, fullname: "歯科材料学II / Dental Materials II【021304】", shortname: "DEN.A232[2026]", visible: 1 },
    { id: 605, fullname: "口腔組織学 / Oral Histology【021305】", shortname: "DEN.A242[2026]", visible: 1 },
    { id: 606, fullname: "歯学英語II / Dental English II【021306】", shortname: "DEN.A252[2026]", visible: 1 },
    { id: 607, fullname: "歯科薬理学 / Dental Pharmacology【021307】", shortname: "DEN.A262[2026]", visible: 1 },
    { id: 608, fullname: "歯科基礎実習 / Basic Dental Lab【021308】", shortname: "DEN.A272[2026]", visible: 1 },
  ],
};

// 週間スケジュールテンプレート → 複数週のセッションを動的生成
const _MED_WEEKLY = [
  { code: "MED.A202", name: "解剖学II", lctCd: "021201", dayIdx: 0, timeStart: "08:50", timeEnd: "10:20", periodStr: "g1", periodEnd: "g1", room: "M&Dタワー26F", instructor: "山田 太一" },
  { code: "MED.A212", name: "生理学II", lctCd: "021202", dayIdx: 0, timeStart: "13:30", timeEnd: "16:55", periodStr: "g3", periodEnd: "g4", room: "1号館-講義室A", instructor: "高田 明" },
  { code: "MED.A222", name: "生化学II", lctCd: "021203", dayIdx: 1, timeStart: "08:50", timeEnd: "12:15", periodStr: "g1", periodEnd: "g2", room: "M&Dタワー26F", instructor: "中島 裕" },
  { code: "MED.A232", name: "微生物学", lctCd: "021204", dayIdx: 1, timeStart: "13:30", timeEnd: "15:00", periodStr: "g3", periodEnd: "g3", room: "3号館-201", instructor: "松本 剛" },
  { code: "MED.A242", name: "免疫学", lctCd: "021205", dayIdx: 2, timeStart: "08:50", timeEnd: "12:15", periodStr: "g1", periodEnd: "g2", room: "M&Dタワー26F", instructor: "井上 誠" },
  { code: "MED.A252", name: "医学英語II", lctCd: "021206", dayIdx: 3, timeStart: "08:50", timeEnd: "10:20", periodStr: "g1", periodEnd: "g1", room: "1号館-講義室B", instructor: "Wilson R." },
  { code: "MED.A262", name: "発生学", lctCd: "021207", dayIdx: 3, timeStart: "13:30", timeEnd: "15:00", periodStr: "g3", periodEnd: "g3", room: "3号館-201", instructor: "西村 純" },
  { code: "MED.A272", name: "人体構造実習", lctCd: "021208", dayIdx: 4, timeStart: "10:45", timeEnd: "18:45", periodStr: "g2", periodEnd: "g5", room: "解剖実習室", instructor: "山田 太一" },
];
const _DEN_WEEKLY = [
  { code: "DEN.A202", name: "口腔解剖学II", lctCd: "021301", dayIdx: 0, timeStart: "09:00", timeEnd: "11:50", periodStr: "11", periodEnd: "13", room: "1号館-第1講義室", instructor: "森田 誠" },
  { code: "DEN.A212", name: "口腔生理学II", lctCd: "021302", dayIdx: 0, timeStart: "12:50", timeEnd: "14:40", periodStr: "15", periodEnd: "16", room: "1号館-第2講義室", instructor: "佐藤 健一" },
  { code: "DEN.A222", name: "口腔微生物学", lctCd: "021303", dayIdx: 1, timeStart: "09:00", timeEnd: "11:50", periodStr: "11", periodEnd: "13", room: "3号館-歯科棟301", instructor: "野口 修" },
  { code: "DEN.A232", name: "歯科材料学II", lctCd: "021304", dayIdx: 1, timeStart: "12:50", timeEnd: "14:40", periodStr: "15", periodEnd: "16", room: "3号館-歯科棟301", instructor: "田辺 拓也" },
  { code: "DEN.A242", name: "口腔組織学", lctCd: "021305", dayIdx: 2, timeStart: "09:00", timeEnd: "11:50", periodStr: "11", periodEnd: "13", room: "1号館-第1講義室", instructor: "小川 誠" },
  { code: "DEN.A252", name: "歯学英語II", lctCd: "021306", dayIdx: 3, timeStart: "09:00", timeEnd: "10:50", periodStr: "11", periodEnd: "12", room: "1号館-第2講義室", instructor: "Carter A." },
  { code: "DEN.A262", name: "歯科薬理学", lctCd: "021307", dayIdx: 3, timeStart: "12:50", timeEnd: "15:40", periodStr: "15", periodEnd: "17", room: "3号館-歯科棟301", instructor: "大西 健" },
  { code: "DEN.A272", name: "歯科基礎実習", lctCd: "021308", dayIdx: 4, timeStart: "09:00", timeEnd: "17:40", periodStr: "11", periodEnd: "19", room: "歯科基礎実習室", instructor: "複数教員" },
];

const DAY_NAMES = ["月", "火", "水", "木", "金"];

/**
 * 週間テンプレートから前期(4月〜7月)の全セッションを生成
 * @param {"med"|"den"} personaId
 * @returns {{ sessions: Array, courseMeta: Object }}
 */
function buildDemoMedSessions(personaId) {
  const weekly = personaId === "den" ? _DEN_WEEKLY : _MED_WEEKLY;
  const sessions = [];
  const courseMeta = {};

  // 前期: 2026/04/06 (月) 〜 2026/07/17 (金) ≒ 15週
  const semStart = new Date(2026, 3, 6); // April 6, 2026 (Monday)
  for (let week = 0; week < 15; week++) {
    for (const tmpl of weekly) {
      const dt = new Date(semStart);
      dt.setDate(dt.getDate() + week * 7 + tmpl.dayIdx);
      const dateStr = `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getDate()).padStart(2, "0")}`;
      sessions.push({
        date: dateStr,
        day: DAY_NAMES[tmpl.dayIdx],
        timeStart: tmpl.timeStart,
        timeEnd: tmpl.timeEnd,
        periodStr: tmpl.periodStr,
        periodEnd: tmpl.periodEnd,
        code: tmpl.code,
        name: tmpl.name,
        room: tmpl.room,
        instructor: tmpl.instructor,
      });
      if (!courseMeta[tmpl.code]) {
        courseMeta[tmpl.code] = {
          name: tmpl.name,
          instructor: tmpl.instructor,
          credits: tmpl.code.includes("272") ? 3 : 2,
          semester: "前期",
        };
      }
    }
  }
  return { sessions, courseMeta };
}
