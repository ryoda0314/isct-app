// 学籍番号・プロフィールから所属（学院・学系・入学年度）を割り出す。
// 管理画面のユーザー分析（/api/admin?action=user_analytics）と時間割例（lib/timetable-examples.js）で共通。

export const DEPT_TO_SCHOOL = {
  MTH:'science',PHY:'science',CHM:'science',EPS:'science',
  MEC:'engineering',SCE:'engineering',EEE:'engineering',ICT:'engineering',IEE:'engineering',
  MAT:'matsci',CAP:'matsci',
  MCS:'computing',CSC:'computing',
  LST:'lifesci',
  ARC:'envsoc',CVE:'envsoc',TSE:'envsoc',SHS:'envsoc',TIM:'envsoc',MOT:'envsoc',
  MED_M:'medicine',MED_N:'medicine',MED_T:'medicine',
  DEN_D:'dentistry',DEN_H:'dentistry',DEN_E:'dentistry',
};
export const SCHOOL_NAMES = {
  science:'理学院',engineering:'工学院',matsci:'物質理工学院',
  computing:'情報理工学院',lifesci:'生命理工学院',envsoc:'環境・社会理工学院',
  medicine:'医学部',dentistry:'歯学部',
};
export const DEPT_NAMES = {
  MTH:'数学系',PHY:'物理学系',CHM:'化学系',EPS:'地球惑星科学系',
  MEC:'機械系',SCE:'システム制御系',EEE:'電気電子系',ICT:'情報通信系',IEE:'経営工学系',
  MAT:'材料系',CAP:'応用化学系',
  MCS:'数理・計算科学系',CSC:'情報工学系',
  LST:'生命理工学系',
  ARC:'建築学系',CVE:'土木・環境工学系',TSE:'融合理工学系',SHS:'社会・人間科学系',TIM:'イノベーション科学系',MOT:'技術経営専門職学位課程',
  MED_M:'医学科',MED_N:'保健衛生学科 看護学',MED_T:'保健衛生学科 検査技術学',
  DEN_D:'歯学科',DEN_H:'口腔保健 衛生学',DEN_E:'口腔保健 工学',
};
export const MED_SCHOOLS = new Set(['medicine','dentistry']);

const SCHOOL_NUM_MAP = {'0':'science','1':'engineering','2':'matsci','3':'computing','4':'lifesci','5':'envsoc'};
const MED_NEW_MAP = {'1':'medicine','2':'medicine','3':'medicine','5':'dentistry','6':'dentistry','7':'dentistry'};
const MED_LEGACY = {'11':'medicine','21':'medicine','22':'medicine','31':'dentistry','32':'dentistry','39':'dentistry'};
const MED_NEW_DEPT = {'1':'MED_M','2':'MED_N','3':'MED_T','5':'DEN_D','6':'DEN_H','7':'DEN_E'};
const MED_LEGACY_DEPT = {'11':'MED_M','21':'MED_N','22':'MED_T','31':'DEN_D','32':'DEN_H','39':'DEN_E'};

/** 学籍番号 → 学院・学系（学系は医歯学系だけ番号から分かる） */
export function inferFromStudentId(sid) {
  if (!sid) return { schoolKey: null, deptKey: null };
  const m = sid.match(/^(\d{2})([BMDR])(\d)(\d)?/i);
  if (m) {
    const sn = m[3], sub = m[4] || null;
    if (sn === '6' && sub) return { schoolKey: MED_NEW_MAP[sub] || null, deptKey: MED_NEW_DEPT[sub] || null };
    return { schoolKey: SCHOOL_NUM_MAP[sn] || null, deptKey: null };
  }
  const mL = sid.match(/^(\d{2})(\d{2})\d{4}$/);
  if (mL && MED_LEGACY[mL[1]]) return { schoolKey: MED_LEGACY[mL[1]], deptKey: MED_LEGACY_DEPT[mL[1]] || null };
  return { schoolKey: null, deptKey: null };
}

/**
 * 学籍番号（無ければ year_group "25B"）→ { entryYear: 2025, degree: 'B' }。分からなければ null。
 * 旧医歯学系の8桁番号 "11220001" は3-4桁目が入学年度。
 */
export function entryFromStudent(studentId, yearGroup) {
  const m = studentId?.match(/^(\d{2})([BMDR])/i);
  if (m) return { entryYear: 2000 + Number(m[1]), degree: m[2].toUpperCase() };
  const mL = studentId?.match(/^(\d{2})(\d{2})\d{4}$/);
  if (mL && MED_LEGACY[mL[1]]) return { entryYear: 2000 + Number(mL[2]), degree: 'B' };
  const yg = yearGroup?.match(/^(\d{2})([BMDR])$/i);
  if (yg) return { entryYear: 2000 + Number(yg[1]), degree: yg[2].toUpperCase() };
  return null;
}

/** 所属: 学系はプロフィール（本人が選んだもの）を優先、学院は学系から、無ければ学籍番号から */
export function resolveAffiliation({ dept, studentId }) {
  let schoolKey = dept ? DEPT_TO_SCHOOL[dept] || null : null;
  let deptKey = dept || null;
  if (!schoolKey) {
    const inferred = inferFromStudentId(studentId);
    schoolKey = inferred.schoolKey;
    if (!deptKey) deptKey = inferred.deptKey;
  }
  return { schoolKey, deptKey };
}
