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
};

// ══════════════════════════════════════
//  ペルソナ別 全クォーター コース定義
// ══════════════════════════════════════

// ── 情報工学系 (CSC) ──
const CSC_Q1 = [
  { id: "mc_q1_101", moodleId: 1101, code: "CSC.T213", name: "プログラミング基礎", per: "月1-2", room: "W6-31", col: "#a855c7", mem: 120, quarter: 1, building: "w6", bldg: "西6号館" },
  { id: "mc_q1_102", moodleId: 1102, code: "MCS.T201", name: "微分積分学第一", per: "火1-2", room: "W5-21", col: "#6375f0", mem: 200, quarter: 1, building: "w5", bldg: "西5号館" },
  { id: "mc_q1_103", moodleId: 1103, code: "MCS.T211", name: "線形代数学第一", per: "水1-2", room: "W5-21", col: "#4a7cf7", mem: 200, quarter: 1, building: "w5", bldg: "西5号館" },
  { id: "mc_q1_104", moodleId: 1104, code: "LAS.A101", name: "英語第一 S", per: "木1-2", room: "W9-31", col: "#3dae72", mem: 30, quarter: 1, building: "w9", bldg: "西9号館" },
  { id: "mc_q1_105", moodleId: 1105, code: "LAS.M101", name: "物理学基礎", per: "金1-2", room: "W5-32", col: "#2d9d8f", mem: 180, quarter: 1, building: "w5", bldg: "西5号館" },
  { id: "mc_q1_106", moodleId: 1106, code: "LAH.S101", name: "東工大立志プロジェクト", per: "金5-6", room: "WL1-301", col: "#c75d8e", mem: 200, quarter: 1, building: "wl1", bldg: "西講義棟1" },
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
  { id: "mc_q1_202", moodleId: 2102, code: "MCS.T201", name: "微分積分学第一", per: "火1-2", room: "W5-21", col: "#6375f0", mem: 200, quarter: 1, building: "w5", bldg: "西5号館" },
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
  { id: "mc_207", moodleId: 207, code: "MCS.T203", name: "微分積分学第二", per: "金1-2", room: "W5-21", col: "#6375f0", mem: 180, quarter: 2, building: "w5", bldg: "西5号館" },
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
  { id: "mc_q1_302", moodleId: 3102, code: "MCS.T201", name: "微分積分学第一", per: "火1-2", room: "W5-21", col: "#6375f0", mem: 200, quarter: 1, building: "w5", bldg: "西5号館" },
  { id: "mc_q1_303", moodleId: 3103, code: "MCS.T211", name: "線形代数学第一", per: "水1-2", room: "W5-32", col: "#a855c7", mem: 200, quarter: 1, building: "w5", bldg: "西5号館" },
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
  { id: "mc_q1_402", moodleId: 4102, code: "MCS.T201", name: "微分積分学第一", per: "火1-2", room: "W5-21", col: "#6375f0", mem: 200, quarter: 1, building: "w5", bldg: "西5号館" },
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
  { id: "mc_407", moodleId: 407, code: "MCS.T203", name: "微分積分学第二", per: "金1-2", room: "W5-21", col: "#6375f0", mem: 180, quarter: 2, building: "w5", bldg: "西5号館" },
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
    school: "物質理工学院",
    schoolCol: "#3dae72",
    year: "B2",
    yearGroup: "25B",
    studentId: "25B20055",
    icon: "🧪",
    q: { 1: CAP_Q1, 2: CAP_Q2, 3: CAP_Q3, 4: CAP_Q4 },
    asgn: null,
  },
];

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
  const user = { userid: 99999, fullname: p.name, yearGroup: p.yearGroup };
  return { courses: allCourses, qdata, asgn, user };
}

export {
  DEMO_COURSES, DEMO_QDATA, DEMO_ASGN, DEMO_GRADES, DEMO_ATT,
  DEMO_USER, DEMO_EVENTS, DEMO_REVIEWS, DEMO_MY_EVENTS, DEMO_TASKS,
  DEMO_FRIENDS, DEMO_FRIEND_PENDING, DEMO_FRIEND_SENT,
  DEMO_DM_CONVERSATIONS, DEMO_GROUPS, DEMO_NOTIFICATIONS,
  DEMO_POSTS, DEMO_CIRCLES, DEMO_CIRCLE_MESSAGES, DEMO_DISCOVER_CIRCLES,
  DEMO_CHAT_MESSAGES,
  DEMO_PERSONAS, buildDemoDataForPersona
};
