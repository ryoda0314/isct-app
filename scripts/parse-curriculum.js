/**
 * 履修案内（学修案内）テキストから必修/選択必修/選択の科目情報をパースする
 * Usage: node scripts/parse-curriculum.js <input.txt>
 */

const fs = require('fs');

const input = fs.readFileSync(process.argv[2] || 'scripts/sample-curriculum.txt', 'utf-8');

// 科目コードのパターン: MTH.A201.R, PHY.Q206 など
// 単位パターン: 1-1-0, 2-0-0, 0-0-2, 0-0-6, 0-0-8
const LINE_RE = /([A-Z]{2,4}\.[A-Z]\d{3}(?:\.[A-Z])?)\s+(◎|○)?\s*(.+?)\s+(\d+-\d+-\d+)\s+([\d\s]+)\s+\(([a-z])\)/g;

const courses = [];

let match;
let currentCategory = null;

// カテゴリ（科目区分）を検出
const lines = input.split('\n');
for (const line of lines) {
  // 科目区分の検出
  const catMatch = line.match(/(専門\s*科目|研究\s*関連\s*科目)[\s\S]*?[（(](\d{3})\s*番台[）)]/);
  if (catMatch) {
    currentCategory = `${catMatch[1].replace(/\s+/g, '')}（${catMatch[2]}番台）`;
  }

  // 科目行のパース
  const courseRe = /([A-Z]{2,4}\.[A-Z]\d{3}(?:\.[A-Z])?)\s+(◎|○)?\s*(.+?)\s+(\d+-\d+-\d+)/g;
  let m;
  while ((m = courseRe.exec(line)) !== null) {
    const [, code, symbol, name, credits] = m;

    // 単位の内訳をパース: 講義-演習-実験
    const [lecture, exercise, experiment] = credits.split('-').map(Number);
    const totalCredits = lecture + exercise + experiment;

    // 区分の判定
    let requirement;
    if (symbol === '◎') requirement = '必修';
    else if (symbol === '○') requirement = '選択必修';
    else requirement = '選択';

    // 身に付ける力
    const afterCredits = line.slice(m.index + m[0].length);
    const skillsMatch = afterCredits.match(/^\s*([\d\s]+?)\s*\(/);
    const skills = skillsMatch
      ? skillsMatch[1].trim().split(/\s+/).map(Number)
      : [];

    // 学修内容
    const contentMatch = afterCredits.match(/\(([a-z])\)/);
    const content = contentMatch ? contentMatch[1] : null;

    // 備考（残りのテキスト）
    let notes = '';
    if (contentMatch) {
      notes = afterCredits.slice(afterCredits.indexOf(contentMatch[0]) + contentMatch[0].length).trim();
    }

    courses.push({
      code,
      name: name.trim(),
      requirement,
      credits: { total: totalCredits, lecture, exercise, experiment, raw: credits },
      skills,
      content,
      category: currentCategory,
      notes: notes || undefined,
    });
  }
}

console.log(`\n=== パース結果: ${courses.length} 科目 ===\n`);

// 区分ごとに集計
const byReq = {};
for (const c of courses) {
  if (!byReq[c.requirement]) byReq[c.requirement] = [];
  byReq[c.requirement].push(c);
}

for (const [req, list] of Object.entries(byReq)) {
  console.log(`\n【${req}】${list.length} 科目`);
  for (const c of list) {
    const credStr = `${c.credits.raw} (計${c.credits.total})`;
    console.log(`  ${c.code}  ${c.name.padEnd(20)} ${credStr.padEnd(15)} ${c.category || ''}`);
  }
}

// JSON出力
const outPath = process.argv[3] || 'scripts/curriculum-parsed.json';
fs.writeFileSync(outPath, JSON.stringify(courses, null, 2), 'utf-8');
console.log(`\n→ JSON出力: ${outPath}`);
