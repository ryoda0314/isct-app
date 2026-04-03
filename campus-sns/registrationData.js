// 2026年度 1Q/2Q 100番台 履修登録補助データ

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
const SCIENCE_1Q = [
  { id:"mech1", name:"力学基礎1", cr:1, col:"#e5534b",
    slots:[[1,0],[1,1],[4,0],[4,1]] },
  { id:"inorg", name:"無機化学基礎", cr:1, col:"#3dae72",
    slots:[[1,0],[4,1]] },
  { id:"life1", name:"生命科学基礎第一1", cr:1, col:"#d4843e",
    slots:[[1,0],[1,1],[4,1]] },
];

// ── 2Q 理工系基礎 ──────────────────────────
const SCIENCE_2Q = [
  { id:"mech2", name:"力学基礎2", cr:1, col:"#e5534b",
    slots:[[1,0],[1,1],[4,0],[4,1]] },
  { id:"org", name:"有機化学基礎", cr:1, col:"#2d9d8f",
    slots:[[1,1],[4,0]] },
  { id:"life2", name:"生命科学基礎第一2", cr:1, col:"#d4843e",
    slots:[[1,0],[1,1],[4,1]] },
];

// ── 選択科目（共通）──────────────────────────
const OPTIONAL_COMMON = [
  { id:"frontier", name:"科学・技術の最前線", cr:1, col:"#6366f1",
    slots:[[2,1],[3,2]], cat:"教養" },
  { id:"health", name:"健康科学概論", cr:1, col:"#f59e0b",
    slots:[[1,2],[4,2]], cat:"教養", note:"学院により曜日が異なる" },
  { id:"envsafe", name:"環境安全論", cr:1, col:"#84cc16",
    slots:[[1,2],[4,2]], cat:"教養", note:"学院により曜日が異なる" },
  { id:"phyex1", name:"物理学演習第一", cr:1, col:"#06b6d4",
    slots:[[0,3],[1,3],[3,3],[4,3]], cat:"実験演習" },
  { id:"phylab", name:"物理学実験第一", cr:1, col:"#0891b2",
    slots:[[0,3],[1,3],[3,3],[4,3]], cat:"実験演習",
    note:"9-10限まで連続" },
  { id:"chemlab", name:"化学実験第一", cr:1, col:"#14b8a6",
    slots:[[0,3],[1,3],[3,3],[4,3]], cat:"実験演習" },
  { id:"space", name:"宇宙地球科学A", cr:1, col:"#7c3aed",
    slots:[[0,3],[1,3],[3,3],[4,3]], cat:"教養" },
  { id:"drawing1", name:"図学・図形デザイン第一", cr:1, col:"#d08030",
    slots:[[0,3]], cat:"図学" },
  { id:"drafting", name:"図学製図", cr:1, col:"#c6a236",
    slots:[[3,3]], cat:"図学", note:"1~4Q通年" },
  { id:"wellness", name:"ウェルネス実習", cr:0.5, col:"#ec4899",
    slots:[[0,2],[1,1],[2,0],[2,1],[3,2]], cat:"体育",
    note:"2クラス履修で1単位" },
  // 学院別リテラシ
  { id:"lit_sci", name:"理学院リテラシ", cr:1, col:"#6375f0",
    slots:[[4,2]], cat:"学院", school:"理学院" },
  { id:"lit_eng", name:"工学リテラシーI", cr:1, col:"#e5534b",
    slots:[[1,2]], cat:"学院", school:"工学院" },
  { id:"lit_mat", name:"物質理工学リテラシ", cr:1, col:"#3dae72",
    slots:[[1,2]], cat:"学院", school:"物質理工学院" },
  { id:"lit_comp", name:"情報理工学リテラシー", cr:1, col:"#a855c7",
    slots:[[4,2]], cat:"学院", school:"情報理工学院" },
  { id:"lit_life", name:"最先端生命研究概論", cr:1, col:"#2d9d8f",
    slots:[[4,2]], cat:"学院", school:"生命理工学院" },
  { id:"lit_env", name:"環境・社会理工学院リテラシ", cr:1, col:"#d4843e",
    slots:[[4,2]], cat:"学院", school:"環境・社会理工学院" },
];

// ── 選択英語科目（クオーター別）────────────────────
const OPT_ENG_1Q = [
  { id:"eng_speak1", name:"英語スピーキング演習第一", cr:1, col:"#3b82f6", slots:[], cat:"語学" },
  { id:"eng_pres1", name:"英語プレゼンテーション演習第一", cr:1, col:"#2563eb", slots:[], cat:"語学" },
  { id:"toefl_ls1", name:"TOEFL対策セミナー(LS)第一", cr:1, col:"#1d4ed8", slots:[], cat:"語学" },
  { id:"toefl_rw1", name:"TOEFL対策セミナー(RW)第一", cr:1, col:"#1e40af", slots:[], cat:"語学" },
  { id:"toeic1", name:"TOEIC対策セミナー第一", cr:1, col:"#1e3a8a", slots:[], cat:"語学" },
];
const OPT_ENG_2Q = [
  { id:"eng_speak2", name:"英語スピーキング演習第二", cr:1, col:"#3b82f6", slots:[], cat:"語学" },
  { id:"eng_pres2", name:"英語プレゼンテーション演習第二", cr:1, col:"#2563eb", slots:[], cat:"語学" },
  { id:"toefl_ls2", name:"TOEFL対策セミナー(LS)第二", cr:1, col:"#1d4ed8", slots:[], cat:"語学" },
  { id:"toefl_rw2", name:"TOEFL対策セミナー(RW)第二", cr:1, col:"#1e40af", slots:[], cat:"語学" },
  { id:"toeic2", name:"TOEIC対策セミナー第二", cr:1, col:"#1e3a8a", slots:[], cat:"語学" },
];

export const REQ_1Q = { common: COMMON_1Q, science: SCIENCE_1Q };
export const REQ_2Q = { common: COMMON_2Q, science: SCIENCE_2Q };
export const OPT_1Q = [...OPTIONAL_COMMON, ...OPT_ENG_1Q];
export const OPT_2Q = [...OPTIONAL_COMMON, ...OPT_ENG_2Q];

// カテゴリ一覧
export const OPT_CATS = [...new Set([...OPTIONAL_COMMON, ...OPT_ENG_1Q].map(c => c.cat))];

// ── ユニット番号 → セクション対応表 ──────────────
// 16グループ（各5ユニット: 1-5, 6-10, ..., 76-80）
const MECH_SEC = ['A','B','C','D','I','J','K','L','E','F','G','H','M','N','O','P'];
const PHYEX_SEC= ['a','b','c','d','i','j','k','l','e','f','g','h','m','n','o','p'];
// 物理学実験: phyex a,b→Mon1Q / c,d→Tue1Q / i,j→Fri1Q / k,l→Thu1Q / e,f→Mon2Q / g,h→Tue2Q / m,n→Fri2Q / o,p→Thu2Q
const PHYLAB_SEC=['Mon1Q','Mon1Q','Tue1Q','Tue1Q','Fri1Q','Fri1Q','Thu1Q','Thu1Q','Mon2Q','Mon2Q','Tue2Q','Tue2Q','Fri2Q','Fri2Q','Thu2Q','Thu2Q'];
const LAB_DAYS = ['月','月','火','火','木','木','金','金','月','月','火','火','木','木','金','金'];

export const UNIT_MAP = { mech1: MECH_SEC, mech2: MECH_SEC, phyex1: PHYEX_SEC, phylab: PHYLAB_SEC };

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
