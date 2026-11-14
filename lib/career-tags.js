// キャリア（インターン・就活・イベント）の分類と選択肢。サーバーの入力チェック（lib/career.js）と
// 画面（campus-sns/views/CareerView.jsx ほか）の両方から読む。ラベルは i18n（career.f.* / career.s.* など）。
//
// ID は端末に保存した興味（career_prefs_v1）や DB の行に入るので、一度出したら変えない（足すのは自由）。

export const CAREER_KINDS = ['intern', 'job', 'event'];

// 興味の分野（複数選択）
export const CAREER_FIELDS = [
  'ai', 'data', 'software', 'xr',
  'robotics', 'control', 'mech', 'space', 'mobility',
  'ee', 'network', 'materials', 'bio', 'energy',
  'civil', 'quant', 'business', 'research',
];

// 技術・経験（必須 / 歓迎）
export const CAREER_SKILLS = [
  'python', 'cpp', 'js', 'java', 'gorust',
  'ml', 'dataanalysis', 'webfront', 'backend', 'mobile', 'uiux',
  'unity', 'cad', 'cae', 'matlab', 'ros', 'embedded', 'circuit', 'fpga',
  'experiment', 'english', 'paper',
];

// イベントで「もらえるもの」。カードでは必ずこの種類を金額より先に出す（誤認させないため）
//   all … 参加者全員に謝礼 / conditional … 条件を満たすと謝礼 / lottery … 抽選で特典
//   prize … 入賞者に賞金 / travel … 交通費のみ / none … なし
export const REWARD_KINDS = ['all', 'conditional', 'lottery', 'prize', 'travel', 'none'];

export const PAY_KINDS = ['paid', 'unpaid', 'unknown'];
export const REMOTE_KINDS = ['onsite', 'remote', 'hybrid'];
export const DURATIONS = ['short', 'long'];
export const DEGREES = ['B', 'M', 'D'];
// 広告・提携の表示（null = 通常の掲載）。並び順には使わない
export const PROMO_KINDS = ['pr', 'partner'];
export const LISTING_STATUSES = ['draft', 'published', 'closed', 'hidden'];

// 所属の系 → 興味の分野の候補（「所属から選ぶ」を押したときだけ使う。絞り込みには使わない）
export const DEPT_FIELDS = {
  MTH: ['quant', 'data', 'research'], PHY: ['research', 'ee', 'space'], CHM: ['materials', 'research'], EPS: ['space', 'energy', 'research'],
  MEC: ['mech', 'robotics', 'control', 'space'], SCE: ['control', 'robotics', 'ai'], EEE: ['ee', 'energy', 'network'], ICT: ['network', 'software', 'ee'], IEE: ['business', 'data', 'quant'],
  MAT: ['materials', 'mech'], CAP: ['materials', 'energy'],
  MCS: ['ai', 'data', 'quant'], CSC: ['software', 'ai', 'network'],
  LST: ['bio', 'materials'], HCB: ['bio', 'mech'],
  ARC: ['civil'], CVE: ['civil', 'energy'], TSE: ['energy', 'civil'], UDE: ['civil'], GEG: ['energy', 'civil'],
  SHS: ['business'], ESI: ['business'], TIM: ['business'], MOT: ['business'],
  MED_M: ['bio'], MED_N: ['bio'], MED_T: ['bio'], DEN_D: ['bio'], DEN_H: ['bio'], DEN_E: ['bio', 'mech'],
};
export const DEPT_CODES = Object.keys(DEPT_FIELDS);

/**
 * "25B" / "24M" / "23D" → { degree, gradYear }（卒業年 = 入学年 + B:4 / M:2 / D:3。R や不明は null）。
 * 医学科などの 6 年制は区別できないので、本人が直せるようにしておく（画面側）。
 */
export function gradFromYearGroup(yearGroup) {
  const m = /^(\d{2})([BMD])$/.exec(String(yearGroup || '').trim());
  if (!m) return { degree: null, gradYear: null };
  const add = { B: 4, M: 2, D: 3 }[m[2]];
  return { degree: m[2], gradYear: 2000 + Number(m[1]) + add };
}
