import React, { useState, useMemo } from "react";
import { T } from "../theme.js";
import { t } from "../i18n.js";
import { I } from "../icons.jsx";
import { getCurrentQuarter } from "../academicCalendar.js";
import { academicYearOf, DAYS, PERIODS, PER_TIMES, REQ_BY_Q } from "../registrationData.js";
import { toGridSlots, buildGrid, mergeCells, useRegCourseSearch } from "../regCore.js";
import { entriesOf, updateYear, entryFromSection, slotLabel, useLocalTimetable, toCourse } from "../localTimetable.js";
import { showToast } from "../hooks/useToast.js";

// ============================================================
// 時間割をつくる（ログイン任意化 Phase 6）
// 履修登録補助（RegView）のロジック（regCore.js: マス目・重なり・科目検索）を流用した、端末に保存する時間割。
// 使われるのは LMS の時間割がない人（ゲスト・LMS に授業が無いアカウント）。保存は localTimetable.js。
// 科目の入れ方: ①科目名・コードで検索 ②空いているマスをタップして自由入力 ③履修登録補助の計画から取り込む
// ============================================================

const QS = [1, 2, 3, 4];

export const TTBuilderView = ({ mob, goToBuilding, lmsActive = false }) => {
  const year = academicYearOf();
  const [q, setQ] = useState(() => { try { return getCurrentQuarter(new Date()) || 1; } catch { return 1; } });
  const { data } = useLocalTimetable();
  const entries = entriesOf(data, year);
  const qEntries = useMemo(() => entries.filter((e) => (e.quarters || []).includes(q)), [entries, q]);
  const ids = useMemo(() => new Set(entries.map((e) => e.id)), [entries]);

  // マス目（重なりは regCore.buildGrid が conflict に先客の名前を入れる）
  const active = useMemo(() => qEntries.map((e) => {
    const c = toCourse(e, year);
    return { id: e.id, name: e.name, col: c.col, sel: (e.slots || []).flatMap((s) => toGridSlots({ day: s.day, period_start: s.ps, period_end: s.pe })) };
  }), [qEntries, year]);
  const cells = useMemo(() => mergeCells(buildGrid(active)), [active]);
  const credits = qEntries.reduce((s, e) => s + (Number(e.credits) || 0), 0);
  const hasConflict = cells.some((x) => x.c?.conflict);

  const [search, setSearch] = useState("");
  const { cats, loading } = useRegCourseSearch(year, `${q}Q`, search.trim());
  const [free, setFree] = useState(null); // { name, di, pi, room }
  const [importing, setImporting] = useState(false);
  const [sel, setSel] = useState(null);

  const add = (entry, quiet) => {
    updateYear(year, (list) => [...list.filter((x) => x.id !== entry.id), entry]);
    if (!quiet) showToast(t("ttb.added", { name: entry.name }), "success");
  };
  const remove = (id) => { updateYear(year, (list) => list.filter((x) => x.id !== id)); if (sel === id) setSel(null); };
  const addFree = () => {
    if (!free?.name?.trim()) return;
    const ps = free.pi * 2 + 1;
    add({ id: `free_${Date.now().toString(36)}`, code: "", section: null, name: free.name.trim(), credits: null, quarters: [q], slots: [{ day: DAYS[free.di], ps, pe: ps + 1, room: (free.room || "").trim() }], free: true });
    setFree(null);
  };

  // 履修登録補助の計画（reg_<学年>_<Q>）から取り込む。科目コード（なければ名前）でシラバスを引き、
  // 選んでいたセクションの曜日・時限・教室を入れる。見つからなければ計画のマス位置だけで自由入力として入れる。
  const importFromReg = async () => {
    const qs = `${q}Q`;
    const items = [];
    for (const lv of [1, 2, 3, 4]) {
      let d = null;
      try { d = JSON.parse(localStorage.getItem(`reg_${lv}_${qs}`) || "null"); } catch {}
      if (!d) continue;
      const req = REQ_BY_Q[qs];
      for (const [code, slots] of Object.entries(d.opt || {})) {
        if (!slots?.length) continue;
        items.push({ code, name: d.optInfo?.[code]?.name || code, section: d.reqSec?.[code] || null, credits: d.optInfo?.[code]?.cr ?? null, grid: slots });
      }
      if (lv === 1 && req) {
        for (const c of [...req.common, ...req.science]) {
          const slots = d.req?.[c.id] || [];
          if (!slots.length) continue;
          if (req.science.includes(c) && !d.sci?.[c.id]) continue;
          items.push({ code: null, name: c.name, section: d.reqSec?.[c.id] || null, credits: c.cr ?? null, grid: slots });
        }
      }
    }
    if (!items.length) { showToast(t("ttb.importNone")); return; }
    setImporting(true);
    let n = 0;
    for (const it of items) {
      let entry = null;
      try {
        const r = await fetch(`/api/data/reg-courses?year=${year}&quarter=${qs}&search=${encodeURIComponent(it.code || it.name)}`);
        const d = r.ok ? await r.json() : null;
        const courses = (d?.categories || []).flatMap((cat) => cat.courses || []);
        const course = courses.find((c) => (it.code ? c.code === it.code : c.name === it.name)) || null;
        const sec = course && (course.sections || []).find((s) => (it.section ? s.section === it.section : true));
        if (course && sec) entry = entryFromSection(course, sec, q);
      } catch {}
      if (!entry) {
        // 見つからない: 計画のマス位置（[曜日, コマ]）だけで入れる
        entry = { id: `reg_${it.code || it.name}`, code: it.code || "", section: it.section, name: it.name, credits: it.credits, quarters: [q], free: true,
          slots: it.grid.map(([di, pi]) => ({ day: DAYS[di], ps: pi * 2 + 1, pe: pi * 2 + 2, room: "" })) };
      }
      add(entry, true); n++;
    }
    setImporting(false);
    showToast(t("ttb.imported", { n }), "success");
  };

  const pd = mob ? 12 : 20;
  const cellH = mob ? 50 : 58;
  const card = { background: T.bg2, border: `1px solid ${T.bd}`, borderRadius: 14, padding: mob ? 12 : 16 };
  // テーマ（T）は App が毎描画で書き換えるので、スタイルは描画のたびに作る
  const inp = { width: "100%", padding: "9px 12px", borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 14, outline: "none", boxSizing: "border-box" };
  const iconBtn = { width: 32, height: 32, borderRadius: 8, border: `1px solid ${T.bd}`, background: "transparent", color: T.txD, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
  const chip = (on) => ({ padding: "6px 14px", borderRadius: 999, border: `1px solid ${on ? T.accent : T.bd}`, background: on ? `${T.accent}15` : "transparent", color: on ? T.accent : T.txD, fontSize: 13, fontWeight: 700, cursor: "pointer" });

  return (
    <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: pd, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 12, color: T.txD, lineHeight: 1.6 }}>{t("ttb.intro")}</div>
        {lmsActive && <div style={{ fontSize: 12, color: T.orange, lineHeight: 1.6, padding: "8px 12px", borderRadius: 10, background: `${T.orange}12`, border: `1px solid ${T.orange}30` }}>{t("ttb.lmsActive")}</div>}

        {/* 年度・クォーター */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.txH, marginRight: 4 }}>{t("ttb.yearLabel", { y: year })}</span>
          {QS.map((x) => <button key={x} onClick={() => setQ(x)} style={chip(q === x)}>{x}Q</button>)}
          <span style={{ marginLeft: "auto", fontSize: 12, color: T.txD }}>{t("ttb.summary", { n: qEntries.length, c: credits })}</span>
        </div>

        {/* マス目（空いているマスをタップすると自由入力） */}
        <div style={{ ...card, padding: mob ? 8 : 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: `${mob ? 34 : 52}px repeat(5,1fr)`, gridTemplateRows: `24px repeat(5,${cellH}px)`, gap: 4 }}>
            <div />
            {DAYS.map((d) => <div key={d} style={{ textAlign: "center", fontSize: 12, fontWeight: 700, color: T.txH }}>{t("dow.s." + d)}</div>)}
            {PERIODS.map((p, pi) => (
              <div key={p} style={{ gridColumn: 1, gridRow: pi + 2, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: 10, color: T.txD }}>
                <span style={{ fontWeight: 700, color: T.txH }}>{pi + 1}</span>{!mob && <span>{PER_TIMES[pi].split("–")[0]}</span>}
              </div>
            ))}
            {cells.map(({ di, pi, c, span }) => (
              <button key={`${di}-${pi}`} onClick={() => c ? setSel(c.id) : setFree({ name: "", di, pi, room: "" })}
                style={{ gridColumn: di + 2, gridRow: `${pi + 2} / span ${span}`, borderRadius: 8, cursor: "pointer", textAlign: "left", padding: "4px 5px", overflow: "hidden",
                  border: c ? `1px solid ${c.conflict ? T.red : c.col}55` : `1px dashed ${T.bd}`, background: c ? (c.conflict ? `${T.red}14` : `${c.col}18`) : "transparent",
                  outline: c && sel === c.id ? `2px solid ${c.col}` : "none", color: T.txH }}>
                {c ? <>
                  <div style={{ fontSize: mob ? 10 : 11, fontWeight: 700, lineHeight: 1.25, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{c.name}</div>
                  {c.conflict && <div style={{ fontSize: 9, color: T.red, fontWeight: 700, marginTop: 2 }}>{t("ttb.conflict")}</div>}
                </> : <span style={{ color: T.txD, fontSize: 14, display: "flex", justifyContent: "center", opacity: 0.5 }}>+</span>}
              </button>
            ))}
          </div>
          {hasConflict && <div style={{ fontSize: 11, color: T.red, marginTop: 8 }}>{t("ttb.conflictNote")}</div>}
        </div>

        {/* 自由入力（空いているマスから） */}
        {free && (
          <div style={{ ...card, border: `1px solid ${T.accent}55` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.txH, marginBottom: 8 }}>{t("ttb.freeTitle", { slot: `${t("dow.s." + DAYS[free.di])} ${PERIODS[free.pi]}` })}</div>
            <input autoFocus value={free.name} onChange={(e) => setFree({ ...free, name: e.target.value })} placeholder={t("ttb.freeName")} style={inp} />
            <input value={free.room} onChange={(e) => setFree({ ...free, room: e.target.value })} placeholder={t("ttb.freeRoom")} style={{ ...inp, marginTop: 8 }} />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button onClick={addFree} disabled={!free.name.trim()} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", background: free.name.trim() ? T.accent : `${T.accent}55`, color: "#fff", fontWeight: 700, cursor: "pointer" }}>{t("ttb.add")}</button>
              <button onClick={() => setFree(null)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: `1px solid ${T.bd}`, background: "transparent", color: T.txH, fontWeight: 600, cursor: "pointer" }}>{t("common.cancel")}</button>
            </div>
          </div>
        )}

        {/* この Q の授業 */}
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.txH, marginBottom: 8 }}>{t("ttb.listTitle", { q })}</div>
          {qEntries.length === 0 && <div style={{ fontSize: 12, color: T.txD, lineHeight: 1.6 }}>{t("ttb.empty")}</div>}
          {qEntries.map((e) => {
            const c = toCourse(e, year);
            return (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: `1px solid ${T.bd}`, background: sel === e.id ? `${c.col}10` : "transparent" }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: c.col, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</div>
                  <div style={{ fontSize: 11, color: T.txD }}>{[e.code, e.section, (e.slots || []).map(slotLabel).join(" "), (e.slots || []).map((s) => s.room).filter(Boolean).join(" "), e.quarters?.length > 1 ? e.quarters.join("-") + "Q" : null].filter(Boolean).join(" · ")}</div>
                </div>
                {c.building && goToBuilding && <button onClick={() => goToBuilding(c.building)} title={t("ttb.map")} style={iconBtn}>{I.map}</button>}
                <button onClick={() => remove(e.id)} title={t("ttb.remove")} style={{ ...iconBtn, color: T.red }}>{I.trash}</button>
              </div>
            );
          })}
        </div>

        {/* 科目を追加: 検索 / 取り込み */}
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.txH, marginBottom: 8 }}>{t("ttb.addTitle")}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 10, background: T.bg3, border: `1px solid ${T.bd}` }}>
            <span style={{ color: T.txD, display: "flex" }}>{I.search}</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("ttb.searchPh")} style={{ flex: 1, border: "none", background: "transparent", color: T.txH, fontSize: 14, outline: "none" }} />
          </div>
          {search.trim().length >= 2 && (
            <div style={{ marginTop: 8, maxHeight: 420, overflowY: "auto" }}>
              {loading && <div style={{ fontSize: 12, color: T.txD, padding: 8 }}>{t("ttb.searching")}</div>}
              {!loading && cats && cats.length === 0 && <div style={{ fontSize: 12, color: T.txD, padding: 8 }}>{t("ttb.noResults")}</div>}
              {!loading && (cats || []).flatMap((cat) => (cat.courses || []).map((course) => (
                <div key={`${cat.name}-${course.code}`} style={{ padding: "8px 0", borderTop: `1px solid ${T.bd}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.txH }}>{course.name} <span style={{ fontSize: 11, color: T.txD, fontWeight: 400 }}>{course.code}{course.credits != null ? ` · ${t("ttb.creditsN", { n: course.credits })}` : ""}</span></div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                    {(course.sections || []).map((sec, i) => {
                      const en = entryFromSection(course, sec, q);
                      const on = ids.has(en.id);
                      return (
                        <button key={i} onClick={() => (on ? remove(en.id) : add(en))} style={{ ...chip(on), fontSize: 11, fontWeight: 600, padding: "5px 10px", display: "flex", alignItems: "center", gap: 4 }}>
                          {on && I.chk}{[sec.section, (sec.slots || []).map((s) => `${s.day}${s.period_start}-${s.period_end}`).join(" "), sec.quarter, (sec.slots || [])[0]?.room].filter(Boolean).join(" ")}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )))}
            </div>
          )}
          <button onClick={importFromReg} disabled={importing} style={{ width: "100%", marginTop: 10, padding: "10px 0", borderRadius: 10, border: `1px solid ${T.bd}`, background: "transparent", color: T.txH, fontSize: 13, fontWeight: 600, cursor: importing ? "default" : "pointer" }}>
            {importing ? t("ttb.importing") : t("ttb.importReg")}
          </button>
          <div style={{ fontSize: 11, color: T.txD, marginTop: 8, lineHeight: 1.6 }}>{t("ttb.freeHint")}</div>
        </div>
      </div>
    </div>
  );
};

