const DAY_MAP = { '月': 0, '火': 1, '水': 2, '木': 3, '金': 4 };

/**
 * Build a 5×5 timetable grid (5 periods × 5 days) from courses.
 *
 * Period mapping (university numbering → grid index):
 *   1-2  → row 0 (8:50–10:30)
 *   3-4  → row 1 (10:45–12:25)
 *   5-6  → row 2 (13:20–15:00)
 *   7-8  → row 3 (15:15–16:55)
 *   9-10 → row 4 (17:10–18:50)
 *
 * Courses may span multiple rows (e.g. 木1-4 → rows 0+1).
 */
export function buildTimetable(courses) {
  const grid = Array.from({ length: 5 }, () => Array(5).fill(null));

  for (const course of courses) {
    if (!course.per || course.per === '未設定') continue;

    const match = course.per.match(/([月火水木金])(\d+)[–\-ー](\d+)/);
    if (!match) continue;

    const dayIdx = DAY_MAP[match[1]];
    const periodStart = parseInt(match[2]);
    const periodEnd = parseInt(match[3]);

    // Map period numbers to grid rows
    const rowStart = Math.floor((periodStart - 1) / 2);
    const rowEnd = Math.floor((periodEnd - 1) / 2);

    for (let row = rowStart; row <= rowEnd; row++) {
      if (dayIdx >= 0 && dayIdx < 5 && row >= 0 && row < 5) {
        grid[row][dayIdx] = course;
      }
    }
  }

  return grid;
}
