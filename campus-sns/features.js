// ============================================================
// 機能ごとの「ログインが要るか」（ログイン任意化。計画書 2.3 の分類）
//
//   none    … ログインせずにそのまま使える（地図・学年暦・PDF・ノート・シラバス検索 など）
//   local   … 端末保存で使える。ログインしていればアカウントに保存（時間割・タスク・カレンダー・電車 など）
//   account … アカウントが要る（他の人とのやり取り・サーバーで集計するもの）。LMS が不調でも使える
//   lms     … LMS 連携が要る（成績・医歯学時間割・授業ページ など）
//   admin   … 管理者だけ（ナビにも出ない）
//
// ここに無い view は none。紹介画面（FeatureGate）は account / lms のものにだけ出る。
// points は「ログインすると何ができるか」（i18n キー。2〜3 行）。
// ============================================================

export const FEATURES = {
  // ── LMS 連携 ──
  "med-tt":  { need: "lms", icon: "cal",   titleKey: "nav.medTimetable", points: ["gate.p.medtt1", "gate.p.medtt2"] },
  grades:    { need: "lms", icon: "grad",  titleKey: "tool.grades",      points: ["gate.p.grades1", "gate.p.grades2"] },
  takiplaza: { need: "lms", icon: "pin",   title: "Taki Plaza",          points: ["gate.p.taki1"] },
  course:    { need: "lms", icon: "book",  titleKey: "header.course",    points: ["gate.p.course1", "gate.p.course2"] },

  // ── アカウント ──
  dm:        { need: "account", icon: "mail",     title: "DM",                    points: ["gate.p.dm1", "gate.p.dm2"] },
  friends:   { need: "account", icon: "userPlus", titleKey: "nav.friends",        points: ["gate.p.friends1", "gate.p.friends2"] },
  user:      { need: "account", icon: "user1",    titleKey: "profile.viewTitle",  points: ["gate.p.user1"] },
  notif:     { need: "account", icon: "bell",     titleKey: "nav.notif",          points: ["gate.p.notif1"] },
  circles:   { need: "account", icon: "users",    titleKey: "nav.circles",        points: ["gate.p.circles1", "gate.p.circles2"] },
  languages: { need: "account", icon: "globe",    titleKey: "nav.languages",      points: ["gate.p.lang1"] },
  dept:      { need: "account", icon: "chat",     titleKey: "sidebar.depts",      points: ["gate.p.dept1"] },
  bmarks:    { need: "account", icon: "bmark",    titleKey: "tool.bmarks",        points: ["gate.p.bmarks1"] },
  pocket:    { need: "account", icon: "inbox",    titleKey: "nav.pocket",         points: ["gate.p.pocket1", "gate.p.pocket2"] },
  tsubame:   { need: "account", icon: "swallow",  titleKey: "tool.tsubame",       points: ["gate.p.tsubame1"] },
  support:   { need: "account", icon: "chat",     titleKey: "support.title",      points: ["gate.p.support1"], guestNoteKey: "gate.supportGuest" },

  // ── 端末保存で使える（ログイン不要） ──
  timetable:  { need: "local" },
  tasks:      { need: "local" },
  calendar:   { need: "local" },
  train:      { need: "local" },
  attendance: { need: "local" },
  events:     { need: "local" },
  search:     { need: "local" },
  ttbuild:    { need: "local" },
  lookup:     { need: "none" },

  // ── 管理者 ──
  admin:  { need: "admin" },
  lecrec: { need: "admin" },
};

export const needOf = (id) => FEATURES[id]?.need || "none";

/** ログインしないと使えない（紹介画面を出す）機能か */
export const requiresLogin = (id) => {
  const n = needOf(id);
  return n === "account" || n === "lms";
};
