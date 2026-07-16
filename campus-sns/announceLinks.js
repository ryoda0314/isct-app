// お知らせの「遷移先ボタン」定義
// announcements.link にビューキー（下記 key）を保存すると、バナー/モーダルに
// その画面へ飛ぶCTAボタンが表示される。null/未設定＝ボタン無し。
// key は App.jsx の view キー（setView(key) で遷移）と一致させること。

export const ANNOUNCE_LINKS = [
  { key: "exams",      labelKey: "announce.link.exams" },
  { key: "timetable",  labelKey: "announce.link.timetable" },
  { key: "calendar",   labelKey: "announce.link.calendar" },
  { key: "attendance", labelKey: "announce.link.attendance" },
  { key: "grades",     labelKey: "announce.link.grades" },
  { key: "tasks",      labelKey: "announce.link.tasks" },
  { key: "events",     labelKey: "announce.link.events" },
  { key: "train",      labelKey: "announce.link.train" },
];

// 有効なビューキーの集合（バリデーション用）
export const ANNOUNCE_LINK_KEYS = ANNOUNCE_LINKS.map(l => l.key);

// ビューキー → CTAボタンのラベル用 i18n キー（未知キーは null）
export const announceLinkLabelKey = (key) => {
  const f = ANNOUNCE_LINKS.find(l => l.key === key);
  return f ? f.labelKey : null;
};
