// 試験時間割の取り込みで使う定数（/api/exams からも読むので、PDF ライブラリを含めない小さなファイルにしておく）

export const EXAM_SOURCES = [
  {
    level: 'undergraduate',
    url: 'https://www.titech.ac.jp/student/pdf/life-undergraduate-exam-timetable.pdf',
    page: 'https://www.titech.ac.jp/student/students/life/undergraduate-exam',
  },
  {
    level: 'graduate',
    url: 'https://www.titech.ac.jp/student/pdf/life-graduate-exam-timetable.pdf',
    page: 'https://www.titech.ac.jp/student/students/life/graduate-exam',
  },
];

/** 取り込みの状態（PDF のハッシュ・確認日時・件数・問題）を置く site_settings のキー */
export const STATE_KEY = 'exam_import_state';

/** 試験期間中の授業・補講を置く site_settings のキー（quarter は '3Q' の形） */
export const classesKey = (year, quarter) => `exam_week_classes_${year}_${quarter}`;
