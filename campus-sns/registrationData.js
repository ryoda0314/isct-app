// 2026年度 履修登録補助データ

export const DAYS = ["月","火","水","木","金"];
export const PERIODS = ["1-2限","3-4限","5-6限","7-8限","9-10限"];
export const PER_TIMES = ["8:50–10:30","10:45–12:25","13:30–15:10","15:25–17:05","17:15–18:55"];

// slot = [day(0-4), period(0-4)]
export const slotLabel = (s) => `${DAYS[s[0]]}${PERIODS[s[1]]}`;
export const slotKey = (s) => `${s[0]}-${s[1]}`;

// ── 1Q 必修科目 ────────────────────────────
const COMMON_1Q = [
  { id:"eng1", name:"英語第一", cr:1, col:"#4a9ae0",
    slots:[[0,0],[3,0]] },
  { id:"la1", name:"線形代数学第一・演習", cr:2, col:"#6375f0",
    slots:[[0,0],[0,1],[1,1],[2,0],[2,1],[3,0],[3,1],[4,0],[4,1]] },
  { id:"risshi", name:"立志プロジェクト", cr:1, col:"#8b5cf6",
    slots:[[0,2],[3,1],[3,2]] },
  { id:"info1", name:"情報リテラシ第一", cr:2, col:"#a855c7",
    slots:[[0,1],[2,0],[2,1],[3,0],[3,1]] },
];

// ── 2Q 必修科目 ────────────────────────────
const COMMON_2Q = [
  { id:"eng2", name:"英語第二", cr:1, col:"#4a9ae0",
    slots:[[0,0],[3,0]] },
  { id:"calc1", name:"微分積分学第一・演習", cr:2, col:"#4f8cd6",
    slots:[[0,0],[0,1],[1,0],[1,1],[2,0],[2,1],[3,0],[3,1],[4,0],[4,1]] },
  { id:"info2", name:"情報リテラシ第二", cr:2, col:"#a855c7",
    slots:[[0,1],[2,0],[2,1],[3,0],[3,1]] },
];

// ── 1Q 理工系基礎 ──────────────────────────
// ユニット1-20,41-60→無機(sec A-H, 火1-2/金3-4), ユニット21-40,61-80→有機(sec I-P, 火3-4/金1-2)
const SCIENCE_1Q = [
  { id:"mech1", name:"力学基礎1", cr:1, col:"#e5534b",
    slots:[[1,0],[1,1],[4,0],[4,1]] },
  { id:"inorg", name:"無機化学基礎", cr:1, col:"#3dae72",
    slots:[[1,0],[4,1]] },
  { id:"org", name:"有機化学基礎", cr:1, col:"#2d9d8f",
    slots:[[1,1],[4,0]] },
  { id:"life1", name:"生命科学基礎第一1", cr:1, col:"#d4843e",
    slots:[[1,0],[1,1],[4,1]] },
];

// ── 2Q 理工系基礎 ──────────────────────────
// ユニット1-20,41-60→有機(sec A-H, 火1-2/金3-4), ユニット21-40,61-80→無機(sec I-P, 火3-4/金1-2)
const SCIENCE_2Q = [
  { id:"mech2", name:"力学基礎2", cr:1, col:"#e5534b",
    slots:[[1,0],[1,1],[4,0],[4,1]] },
  { id:"inorg2", name:"無機化学基礎", cr:1, col:"#3dae72",
    slots:[[1,1],[4,0]] },
  { id:"org2", name:"有機化学基礎", cr:1, col:"#2d9d8f",
    slots:[[1,0],[4,1]] },
  { id:"life2", name:"生命科学基礎第一2", cr:1, col:"#d4843e",
    slots:[[1,0],[1,1],[4,1]] },
];

export const REQ_1Q = { common: COMMON_1Q, science: SCIENCE_1Q };
export const REQ_2Q = { common: COMMON_2Q, science: SCIENCE_2Q };

// カテゴリ別カラー（選択科目表示用）
export const CAT_COLORS = {
  '実験・演習':'#06b6d4','教養':'#6366f1','文系教養':'#8b5cf6',
  '語学':'#3b82f6','体育・健康':'#ec4899','図学':'#d08030',
  '学院別':'#a855c7','教職':'#64748b','日本語':'#3b82f6','その他':'#6b7280',
  // 200+番台: 系別カラー
  '数学系':'#6366f1','物理学系':'#3b82f6','化学系':'#06b6d4','地球惑星科学系':'#0d9488',
  '機械系':'#e5534b','システム制御系':'#f59e0b','電気電子系':'#eab308','情報通信系':'#84cc16',
  '経営工学系':'#f97316',
  '材料系':'#a855c7','応用化学系':'#ec4899',
  '数理・計算科学系':'#8b5cf6','人工知能系':'#7c3aed','情報工学系':'#6366f1',
  '生命理工学系':'#10b981','ライフエンジニアリング系':'#059669',
  '建築学系':'#ef4444','土木・環境工学系':'#f97316','融合理工学系':'#d97706',
  '都市・環境学系':'#84cc16','社会・人間科学系':'#14b8a6','地球環境共創系':'#0d9488',
  '技術経営専門職学位課程':'#64748b',
  '理工系教養':'#6366f1','第二外国語':'#3b82f6',
  '工学院共通':'#e5534b','環境・社会共通':'#14b8a6','情報理工共通':'#8b5cf6','物質理工共通':'#a855c7',
  '生命理工共通':'#10b981','学際':'#64748b',
  '理工系共通':'#6366f1','原子核':'#3b82f6','エネルギー':'#f97316',
  '工学系':'#e5534b','超スマート社会':'#7c3aed','知能':'#8b5cf6',
  'データサイエンス':'#6366f1','情報理工学院':'#8b5cf6','地球環境':'#0d9488',
  '技術経営':'#64748b','社会人':'#64748b',
};

// ── 学院・系 マッピング ──────────────────────────
export const SCHOOLS = [
  { key:'science',     label:'理学院',        depts:['MTH','PHY','CHM','EPS'] },
  { key:'engineering', label:'工学院',        depts:['MEC','CSC','EEE','IEE','ICT'] },
  { key:'matsci',      label:'物質理工学院',   depts:['MAT','CAP'] },
  { key:'computing',   label:'情報理工学院',   depts:['MCS','ART','ISC'] },
  { key:'lifesci',     label:'生命理工学院',   depts:['LST','HCB'] },
  { key:'envsoc',      label:'環境・社会理工学院', depts:['ARC','CVE','TSE','UDE','ESI','GEG','TIM'] },
];
export const SHARED_DEPTS = ['LAS','LAE','LAJ','LAH','LAW','LAT','LAL','ENT','SCE','XEG','XEN','XCO','XMC','XES','XLS','XIP'];

export const DEPT_LABELS = {
  MTH:'数学系', PHY:'物理学系', CHM:'化学系', EPS:'地球惑星科学系',
  MEC:'機械系', CSC:'システム制御系', EEE:'電気電子系', IEE:'情報通信系', ICT:'経営工学系',
  MAT:'材料系', CAP:'応用化学系',
  MCS:'数理・計算科学系', ART:'人工知能系', ISC:'情報工学系',
  LST:'生命理工学系', HCB:'ライフエンジニアリング系',
  ARC:'建築学系', CVE:'土木・環境工学系', TSE:'融合理工学系',
  UDE:'都市・環境学系', ESI:'社会・人間科学系', GEG:'地球環境共創系', TIM:'技術経営専門職学位課程',
};

// ── ユニット → 選択科目の自動設定用コード対応 ──────────
export const UNIT_OPT = {
  'LAS.P105': 'phyex1',  // 物理学演習第一
  'LAS.P107': 'phylab',  // 物理学実験第一
};
export const LAB_OPT = ['LAS.C110']; // 化学実験第一（曜日マッチ）

// ── ユニット番号 → セクション対応表 ──────────────
// 16グループ（各5ユニット: 1-5, 6-10, ..., 76-80）
const MECH_SEC = ['A','B','C','D','I','J','K','L','E','F','G','H','M','N','O','P'];
const PHYEX_SEC= ['a','b','c','d','i','j','k','l','e','f','g','h','m','n','o','p'];
// 物理学実験: phyex a,b→Mon1Q / c,d→Tue1Q / i,j→Fri1Q / k,l→Thu1Q / e,f→Mon2Q / g,h→Tue2Q / m,n→Fri2Q / o,p→Thu2Q
const PHYLAB_SEC=['Mon1Q','Mon1Q','Tue1Q','Tue1Q','Fri1Q','Fri1Q','Thu1Q','Thu1Q','Mon2Q','Mon2Q','Tue2Q','Tue2Q','Fri2Q','Fri2Q','Thu2Q','Thu2Q'];
const LAB_DAYS = ['月','月','火','火','木','木','金','金','月','月','火','火','木','木','金','金'];

export const UNIT_MAP = { mech1: MECH_SEC, mech2: MECH_SEC, inorg: MECH_SEC, org: MECH_SEC, inorg2: MECH_SEC, org2: MECH_SEC, phyex1: PHYEX_SEC, phylab: PHYLAB_SEC };

/** courseId + unitNum → セクション名 (A-P / a-p) or null */
export function unitToSection(courseId, unitNum) {
  const n = parseInt(unitNum);
  if (!n || n < 1 || n > 80) return null;
  const sec = UNIT_MAP[courseId];
  return sec ? sec[Math.floor((n - 1) / 5)] : null;
}

/** unitNum → 実験/演習の曜日 or null */
export function unitToLabDay(unitNum) {
  const n = parseInt(unitNum);
  if (!n || n < 1 || n > 80) return null;
  return LAB_DAYS[Math.floor((n - 1) / 5)];
}
