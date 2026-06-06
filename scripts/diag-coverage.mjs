// isct シラバス教科書データのカバレッジ診断（秘密情報は出力しない）
// node scripts/diag-coverage.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const count = async (table, mod) => {
  let q = sb.from(table).select("*", { count: "exact", head: true });
  if (mod) q = mod(q);
  const { count: c, error } = await q;
  return error ? `ERR ${error.message}` : c;
};

console.log("=== テーブル件数 ===");
console.log("syllabus_courses:", await count("syllabus_courses"));
console.log("course_textbooks_raw:", await count("course_textbooks_raw"));
console.log("books:", await count("books"));
console.log("course_books(全):", await count("course_books"));
console.log("course_books(book_idあり):", await count("course_books", (q) => q.not("book_id", "is", null)));
console.log(
  "course_books(linked & pending/confirmed):",
  await count("course_books", (q) => q.not("book_id", "is", null).in("status", ["pending", "confirmed"]))
);

// linked な course_books の course_code から学院/系の分布を出す
const { data: links, error: le } = await sb
  .from("course_books")
  .select("course_code")
  .not("book_id", "is", null)
  .in("status", ["pending", "confirmed"]);
if (le) { console.error(le.message); process.exit(1); }

const baseCode = (c) => (c && c.includes(":") ? c.split(":")[0] : c);
const codes = Array.from(new Set((links || []).map((l) => baseCode(l.course_code)).filter(Boolean)));

// syllabus_courses から code -> {dept, school}
const codeMap = new Map();
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
for (const part of chunk(codes, 300)) {
  const { data: cs } = await sb.from("syllabus_courses").select("code, dept, school").in("code", part);
  for (const c of cs || []) if (!codeMap.has(c.code)) codeMap.set(c.code, { dept: c.dept, school: c.school });
}

const bySchool = {};
const byDept = {};
for (const l of links || []) {
  const s = codeMap.get(baseCode(l.course_code));
  if (!s) continue;
  bySchool[s.school] = (bySchool[s.school] || 0) + 1;
  const k = `${s.school} / ${s.dept}`;
  byDept[k] = (byDept[k] || 0) + 1;
}

console.log("\n=== linked course_books の学院分布 ===");
for (const [k, v] of Object.entries(bySchool).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
console.log("\n=== 系(dept)分布 ===");
for (const [k, v] of Object.entries(byDept).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
