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
    { id: 701, uid: 10001, text: "動的計画法の漸化式の立て方がいまいち分からない…コツありますか？", type: "question", yearGroup: "25B", likes: [10002, 10003], ts: d(0, 11, 30), name: "山田花子", avatar: "H", color: "#e5534b" },
    { id: 702, uid: 10002, text: "小さいケースで手計算→パターンを見つけてテーブルに落とす、が王道だと思う", type: "discussion", yearGroup: "25B", likes: [10001, 99999, 10003], ts: d(0, 11, 45), name: "鈴木一郎", avatar: "I", color: "#6375f0" },
    { id: 703, uid: 99999, text: "第3回レポート、ソートの比較はランダム入力だけでなくソート済み入力も試した方がいいですよ", type: "info", yearGroup: "25B", likes: [10001], ts: d(-1, 16, 0), name: "テスト太郎", avatar: "T", color: "#888" },
    { id: 704, uid: 10003, text: "ヒープソートの計算量 O(n log n) の証明、教科書のp.142がわかりやすかったです", type: "material", yearGroup: "25B", likes: [10001, 10002], ts: d(-1, 20, 15), name: "田中美咲", avatar: "M", color: "#3dae72" },
    { id: 705, uid: 10004, text: "来週の小テスト範囲ってどこまでですか？", type: "question", yearGroup: "25B", likes: [], ts: d(-2, 9, 0), name: "佐藤健太", avatar: "K", color: "#d4843e" },
    { id: 706, uid: 0, text: "正直この授業の課題量多すぎない？毎週レポートはきつい", type: "anon", yearGroup: "25B", likes: [10001, 10002, 10003, 10005], ts: d(-3, 22, 0), name: "匿名", avatar: "?", color: "#68687a" },
  ],
  "mc_102": [
    { id: 711, uid: 10002, text: "固有値分解の計算、3x3以上になると大変すぎる", type: "discussion", yearGroup: "25B", likes: [99999], ts: d(0, 10, 0), name: "鈴木一郎", avatar: "I", color: "#6375f0" },
    { id: 712, uid: 99999, text: "対角化の条件まとめノート作ったので共有します。固有値が全部異なれば対角化可能！", type: "material", yearGroup: "25B", likes: [10001, 10002, 10005], ts: d(-1, 14, 0), name: "テスト太郎", avatar: "T", color: "#888" },
  ],
  "mc_105": [
    { id: 721, uid: 10003, text: "実験レポート、参考文献のフォーマットってIEEEスタイルでいいですよね？", type: "question", yearGroup: "25B", likes: [99999], ts: d(0, 15, 30), name: "田中美咲", avatar: "M", color: "#3dae72" },
    { id: 722, uid: 99999, text: "TAさんに確認したらIEEEでOKとのことです", type: "info", yearGroup: "25B", likes: [10003, 10001], ts: d(0, 16, 10), name: "テスト太郎", avatar: "T", color: "#888" },
  ],
};

export {
  DEMO_COURSES, DEMO_QDATA, DEMO_ASGN, DEMO_GRADES, DEMO_ATT,
  DEMO_USER, DEMO_EVENTS, DEMO_REVIEWS, DEMO_MY_EVENTS, DEMO_TASKS,
  DEMO_FRIENDS, DEMO_FRIEND_PENDING, DEMO_FRIEND_SENT,
  DEMO_DM_CONVERSATIONS, DEMO_GROUPS, DEMO_NOTIFICATIONS,
  DEMO_POSTS, DEMO_CIRCLES, DEMO_CIRCLE_MESSAGES, DEMO_DISCOVER_CIRCLES
};
