// テストアカウント用デモデータ
// userId: "test" / password: "test" / totpSecret: "TEST" でログイン可能

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
];

// ── 成績 ──
const DEMO_GRADES = [
  { cid: "mc_101", mid: 82, asgn: 88 },
  { cid: "mc_102", mid: 75, asgn: 90 },
  { cid: "mc_103", mid: null, asgn: 85 },
  { cid: "mc_106", mid: 70, asgn: 78 },
  { cid: "mc_107", mid: 88, asgn: 92 },
];

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
  { id: "ev_1", title: "プログラミングコンテスト 2026 Spring", desc: "情報理工学院主催。チーム参加可。", cat: "contest", date: d(14, 13, 0), loc: "W6-31", col: "#6375f0" },
  { id: "ev_2", title: "研究室公開 Week", desc: "各研究室の紹介と見学ツアー。", cat: "open_lab", date: d(21, 10, 0), loc: "各号館", col: "#a855c7" },
  { id: "ev_3", title: "就活ガイダンス（学部3年向け）", desc: "キャリア支援課による就活準備セミナー。", cat: "career", date: d(10, 15, 0), loc: "WL1-301", col: "#d4843e" },
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

export {
  DEMO_COURSES, DEMO_QDATA, DEMO_ASGN, DEMO_GRADES, DEMO_ATT,
  DEMO_USER, DEMO_EVENTS, DEMO_REVIEWS, DEMO_MY_EVENTS, DEMO_TASKS,
  DEMO_FRIENDS, DEMO_FRIEND_PENDING, DEMO_FRIEND_SENT,
  DEMO_DM_CONVERSATIONS, DEMO_GROUPS, DEMO_NOTIFICATIONS
};
