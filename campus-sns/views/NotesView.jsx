import { useState, useRef, useEffect, useCallback } from "react";
import { T } from "../theme.js";
import { t } from "../i18n.js";
import { I } from "../icons.jsx";
import { isNative } from "../capacitor.js";
import { inkAvailable, showInk, setInkRect, hideInk, rectOfEl, setInkTool, inkUndo, inkRedo, inkSnapshot, onPencilDoubleTap, setInkShapeAssist } from "../plugins/inkCanvas.js";

/* ──────────────────────────────────────────────
   GoodNotes 風 手書きノート
   ・白紙ノート（罫線/方眼テンプレ）と PDF 注釈の両対応
   ・ストロークはベクター（筆圧つき）で保存 → 拡大しても破綻しにくい
   ・保存はすべて端末ローカル（ネイティブ=Filesystem / Web=localStorage）
   ・Apple Pencil / スタイラス重視（PointerEvent の pressure / pointerType を使用）
   ────────────────────────────────────────────── */

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

// 実機が実際に動かしているコード版を画面で確認するための版数（キャッシュ切り分け用）
const NOTES_VERSION = "v26-shapehold";

// ── pdf.js ローダ（PdfToolsView と同じ jsdelivr 経由）──
const PDFJS_VER = "3.11.174";
const PDFJS_CDN = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VER}`;
let pdfjsLoading = null;
function loadPdfjs() {
  if (typeof window !== "undefined" && window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (pdfjsLoading) return pdfjsLoading;
  pdfjsLoading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `${PDFJS_CDN}/build/pdf.min.js`;
    s.onload = () => {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/build/pdf.worker.min.js`;
        resolve(window.pdfjsLib);
      } else reject(new Error("pdfjsLib not found"));
    };
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return pdfjsLoading;
}
const PDFLIB_CDN = "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js";
let pdflibLoading = null;
function loadPdfLib() {
  if (typeof window !== "undefined" && window.PDFLib) return Promise.resolve(window.PDFLib);
  if (pdflibLoading) return pdflibLoading;
  pdflibLoading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = PDFLIB_CDN;
    s.onload = () => (window.PDFLib ? resolve(window.PDFLib) : reject(new Error("PDFLib not found")));
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return pdflibLoading;
}

// ── ローカル保存層 ────────────────────────────
const INDEX_KEY = "notes_index_v1";
// ノート本体は IndexedDB に保存する。
// 理由: ネイティブ(iOS)アプリは sciencetokyo.app をリモート読み込みする構成で、
// かつ packageClassList に @capacitor/filesystem が含まれていないため
// Filesystem プラグインは実機で "not implemented" になる。IndexedDB なら
// WKWebView 内で同一 origin に永続化でき、Web デプロイのみで実機反映できる。
// インデックス(軽量メタ+サムネ)は同期読みのため localStorage のまま。
const DB_NAME = "sciencetokyo_notes_db";
const STORE = "notes";
let _dbp = null;
function openDB() {
  if (_dbp) return _dbp;
  _dbp = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("idb open failed"));
    } catch (e) { reject(e); }
  });
  return _dbp;
}
function idbDo(mode, run) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let result;
    const r = run(store);
    if (r) r.onsuccess = () => { result = r.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("idb tx aborted"));
  }));
}

function loadIndex() {
  try { return JSON.parse(localStorage.getItem(INDEX_KEY) || "[]"); } catch { return []; }
}
function saveIndex(arr) {
  try { localStorage.setItem(INDEX_KEY, JSON.stringify(arr)); } catch {}
}
// 教材IDに紐づく既存ノートを同期的に検索（MatView から相互リンクに使用）
export function findMaterialNote(matId) {
  if (!matId) return null;
  try { return loadIndex().find((n) => n.sourceMatId === matId) || null; } catch { return null; }
}
// index を 年度(降順) > クォーター(昇順) > 講義(名前順) > 授業回(section順) にグルーピング。
// 講義メタを持たないノート(白紙/手動取込)は uncat に分離。
const NO_SESSION = 1e9; // 授業回なしのノートは末尾へ
function groupNotes(list) {
  const uncat = [];
  const years = new Map(); // year -> Map(quarter -> Map(courseId -> course))
  for (const n of list) {
    if (!n.courseId) { uncat.push(n); continue; }
    const y = n.year || 0, q = n.quarter || 0;
    if (!years.has(y)) years.set(y, new Map());
    const qmap = years.get(y);
    if (!qmap.has(q)) qmap.set(q, new Map());
    const cmap = qmap.get(q);
    if (!cmap.has(n.courseId)) cmap.set(n.courseId, { id: n.courseId, name: n.courseName || n.courseCode || n.courseId, sessions: new Map() });
    const course = cmap.get(n.courseId);
    const sk = n.session || ""; // 授業回(section名)。無ければ ""
    if (!course.sessions.has(sk)) course.sessions.set(sk, { session: n.session || null, order: n.session ? (n.sessionOrder ?? NO_SESSION - 1) : NO_SESSION, notes: [] });
    const sess = course.sessions.get(sk);
    if (n.session && n.sessionOrder != null) sess.order = Math.min(sess.order, n.sessionOrder);
    sess.notes.push(n);
  }
  const sortCourse = (c) => ({
    id: c.id, name: c.name,
    sessions: [...c.sessions.values()].sort((a, b) => a.order - b.order || String(a.session).localeCompare(String(b.session), "ja")),
  });
  const yearArr = [...years.entries()].sort((a, b) => b[0] - a[0]).map(([year, qmap]) => ({
    year,
    quarters: [...qmap.entries()].sort((a, b) => a[0] - b[0]).map(([quarter, cmap]) => ({
      quarter,
      courses: [...cmap.values()].sort((a, b) => String(a.name).localeCompare(String(b.name), "ja")).map(sortCourse),
    })),
  }));
  return { uncat, years: yearArr };
}
async function readNote(id) {
  try { const v = await idbDo("readonly", (s) => s.get(id)); if (v != null) return typeof v === "string" ? JSON.parse(v) : v; }
  catch (e) { console.warn("[notes] idb read", e); }
  // フォールバック(旧localStorage)
  try { return JSON.parse(localStorage.getItem(`notes_data_${id}`) || "null"); } catch { return null; }
}
async function writeNote(note) {
  try { await idbDo("readwrite", (s) => s.put(note, note.id)); return; }
  catch (e) {
    console.warn("[notes] idb write", e);
    try { localStorage.setItem(`notes_data_${note.id}`, JSON.stringify(note)); }
    catch { throw new Error("storage-full"); }
  }
}
async function deleteNote(id) {
  try { await idbDo("readwrite", (s) => s.delete(id)); } catch {}
  try { localStorage.removeItem(`notes_data_${id}`); } catch {}
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] || "");
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] || "");
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}
function b64ToUint8(b64) {
  const bin = atob(b64); const len = bin.length; const u = new Uint8Array(len);
  for (let i = 0; i < len; i++) u[i] = bin.charCodeAt(i);
  return u;
}

// OS に委ねた保存/共有（PdfToolsView と同じ作法）
async function saveBlob(blob, fname, mime, mob) {
  const file = (() => { try { return new File([blob], fname, { type: mime }); } catch { return null; } })();
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: fname }); return; }
    catch (e) { if (/Abort/i.test(String(e?.name || e?.message || ""))) return; }
  }
  if (isNative()) {
    try {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const { Share } = await import("@capacitor/share");
      const base64 = await blobToBase64(blob);
      const { uri } = await Filesystem.writeFile({ path: fname, data: base64, directory: Directory.Cache });
      await Share.share({ title: fname, text: fname, url: uri });
    } catch (e) {
      if (/cancel/i.test(String(e?.message || e || ""))) return;
      try { window.open(URL.createObjectURL(blob), "_blank"); } catch {}
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const isMob = mob || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (isMob) window.open(url, "_blank", "noopener");
  else { const a = document.createElement("a"); a.href = url; a.download = fname; document.body.appendChild(a); a.click(); document.body.removeChild(a); }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ── 描画ユーティリティ ───────────────────────
const A4_W = 1240, A4_H = 1754; // 白紙ページの論理解像度（A4 ≒ 150dpi）

// 用紙サイズ（縦向きの論理px ≒ 150dpi）。横向きは w/h を入れ替える。
const PAPER_SIZES = [
  { id: "a4",     label: "A4",     w: 1240, h: 1754 },
  { id: "a5",     label: "A5",     w: 874,  h: 1240 },
  { id: "b5",     label: "B5",     w: 1039, h: 1476 },
  { id: "letter", label: "Letter", w: 1276, h: 1648 },
  { id: "square", label: "□",      w: 1240, h: 1240 },
];
function paperDims(sizeId, orient) {
  const p = PAPER_SIZES.find((s) => s.id === sizeId) || PAPER_SIZES[0];
  return orient === "landscape" ? { w: p.h, h: p.w } : { w: p.w, h: p.h };
}
// フィット倍率基準のズーム範囲（fit×0.5 〜 fit×6）
const FIT_MIN_ZOOM = 0.5, FIT_MAX_ZOOM = 6;
// ページの内部描画をスーパーサンプリングしてRetina表示でもクッキリさせる倍率
const RENDER_SS = 2;

// Catmull-Rom スプラインで点列を密に補間する。端末が粗い点しか返さなくても
// （速描き時など）滑らかな曲線になる。筆圧も線形補間して引き継ぐ。
function densify(pts) {
  if (!pts || pts.length < 3) return pts || [];
  const P = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const dist = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(1, Math.min(64, Math.ceil(dist / 2.5)));
    const pr1 = p1[2] != null ? p1[2] : 0.5, pr2 = p2[2] != null ? p2[2] : 0.5;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      out.push([x, y, pr1 + (pr2 - pr1) * t]);
    }
  }
  return out;
}

// 1ストロークを ctx（論理座標系）に描く。Catmull-Rom で密に補間してから描画。
function drawStroke(ctx, st) {
  const raw = st.pts;
  if (!raw || !raw.length) return;
  ctx.save();
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  const pts = densify(raw);

  if (st.tool === "highlighter") {
    // 一定幅・半透明 → 1パスで（結合部の濃淡ムラを避ける）
    ctx.globalAlpha = 0.32; ctx.strokeStyle = st.color; ctx.lineWidth = st.size;
    ctx.beginPath();
    if (pts.length === 1) { ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[0][0] + 0.1, pts[0][1]); }
    else { ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); }
    ctx.stroke();
    ctx.restore();
    return;
  }

  // ペン: 密な点列を、筆圧に応じた太さでセグメント描画（点が密なので直線で十分滑らか）
  ctx.strokeStyle = st.color;
  const W = (p) => st.size * (0.35 + 0.65 * (p != null ? p : 0.5));
  if (pts.length === 1) {
    const r = W(pts[0][2]) / 2;
    ctx.fillStyle = st.color; ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], r, 0, Math.PI * 2); ctx.fill();
    ctx.restore(); return;
  }
  for (let i = 1; i < pts.length; i++) {
    const pr = ((pts[i - 1][2] != null ? pts[i - 1][2] : 0.5) + (pts[i][2] != null ? pts[i][2] : 0.5)) / 2;
    ctx.lineWidth = W(pr);
    ctx.beginPath(); ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
  }
  ctx.restore();
}

// テンプレ背景を論理座標系に描く
function drawTemplate(ctx, w, h, template, bg) {
  ctx.save();
  ctx.fillStyle = bg || "#ffffff"; ctx.fillRect(0, 0, w, h);
  if (template === "lined" || template === "grid") {
    const gap = 56;
    ctx.strokeStyle = "rgba(80,120,200,0.18)"; ctx.lineWidth = 1.5;
    for (let y = gap; y < h; y += gap) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    if (template === "grid") for (let x = gap; x < w; x += gap) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  }
  ctx.restore();
}

// 点と線分の距離（消しゴム判定）
function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay; const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - ax, py - ay);
  let tt = ((px - ax) * dx + (py - ay) * dy) / l2; tt = Math.max(0, Math.min(1, tt));
  return Math.hypot(px - (ax + tt * dx), py - (ay + tt * dy));
}

const PEN_COLORS = ["#1c1c1e", "#e5534b", "#1e7ac8", "#2a9058", "#d4843e", "#8b5cf6", "#ffffff"];
const HL_COLORS = ["#ffe14d", "#7ee787", "#8fd3ff", "#ff9eb1", "#c8a2ff"];
const PEN_SIZES = [4, 8, 14];
const HL_SIZES = [22, 38];
const ERASER_SIZES = [28, 60];

// ── ネイティブ(PencilKit)連携ヘルパー ──────────
// ページ背景を base64 PNG(プレフィックス無し)で生成（手書きは含めない＝ネイティブが描く）
async function renderBgB64(note, pg, cache) {
  const c = document.createElement("canvas");
  c.width = pg.w; c.height = pg.h;
  const ctx = c.getContext("2d");
  if (note.type === "pdf" && pg.pdfIndex && note.pdfBase64) {
    if (!cache.doc) {
      const pdfjs = await loadPdfjs();
      cache.doc = await pdfjs.getDocument({ data: b64ToUint8(note.pdfBase64) }).promise;
    }
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, pg.w, pg.h);
    const page = await cache.doc.getPage(pg.pdfIndex);
    const vp = page.getViewport({ scale: pg.w / page.getViewport({ scale: 1 }).width });
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
  } else {
    drawTemplate(ctx, pg.w, pg.h, note.template, note.bg);
  }
  return c.toDataURL("image/png").split(",")[1] || "";
}
function loadImg(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
}
// 背景 + ネイティブから返った ink(透明PNG) を合成してライブラリ用サムネを作る
async function compositeThumb(bgB64, inkB64, pg) {
  const tw = 240, th = Math.max(1, Math.round(tw * pg.h / pg.w));
  const c = document.createElement("canvas"); c.width = tw; c.height = th;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, tw, th);
  if (bgB64) { try { ctx.drawImage(await loadImg("data:image/png;base64," + bgB64), 0, 0, tw, th); } catch {} }
  if (inkB64) { try { ctx.drawImage(await loadImg("data:image/png;base64," + inkB64), 0, 0, tw, th); } catch {} }
  return c.toDataURL("image/jpeg", 0.6);
}

// ページ i の手書きを透明背景 PNG(base64, プレフィックス無) で得る。
// ネイティブ(pencilkit)は保存済みの inkPNGs、Web はストロークから描画。
function pageInkB64(note, pg, i) {
  if (note.engine === "pencilkit") return note.inkPNGs?.[i] || "";
  const c = document.createElement("canvas"); c.width = pg.w; c.height = pg.h;
  const ctx = c.getContext("2d");
  for (const st of (pg.strokes || [])) drawStroke(ctx, st);
  return c.toDataURL("image/png").split(",")[1] || "";
}

// ノートを「描き込み済み PDF」として書き出す。
// ・PDF ノート: 元PDFにインクを重ねて書き出し（本文テキストは保持）
// ・白紙ノート: 背景(テンプレ)＋インクを合成して新規PDF化
async function buildNotePdfBytes(note) {
  const PDFLib = await loadPdfLib();
  const cache = {};
  if (note.type === "pdf" && note.pdfBase64) {
    const out = await PDFLib.PDFDocument.load(b64ToUint8(note.pdfBase64));
    const pdfPages = out.getPages();
    for (let i = 0; i < note.pages.length; i++) {
      const pg = note.pages[i];
      const inkB64 = pageInkB64(note, pg, i);
      if (!inkB64) continue;
      const idx = pg.pdfIndex ? pg.pdfIndex - 1 : i;
      const page = pdfPages[idx]; if (!page) continue;
      const img = await out.embedPng(b64ToUint8(inkB64));
      const { width, height } = page.getSize();
      page.drawImage(img, { x: 0, y: 0, width, height });
    }
    return await out.save();
  }
  // 白紙ノート
  const out = await PDFLib.PDFDocument.create();
  for (let i = 0; i < note.pages.length; i++) {
    const pg = note.pages[i];
    const c = document.createElement("canvas"); c.width = pg.w; c.height = pg.h;
    const ctx = c.getContext("2d");
    const bgB64 = await renderBgB64(note, pg, cache);
    if (bgB64) ctx.drawImage(await loadImg("data:image/png;base64," + bgB64), 0, 0, pg.w, pg.h);
    const inkB64 = pageInkB64(note, pg, i);
    if (inkB64) ctx.drawImage(await loadImg("data:image/png;base64," + inkB64), 0, 0, pg.w, pg.h);
    const jpgB64 = c.toDataURL("image/jpeg", 0.9).split(",")[1];
    const img = await out.embedJpg(b64ToUint8(jpgB64));
    const page = out.addPage([pg.w, pg.h]);
    page.drawImage(img, { x: 0, y: 0, width: pg.w, height: pg.h });
  }
  return await out.save();
}

// ══════════════════════════════════════════════
// ライブラリ（ノート一覧）
// ══════════════════════════════════════════════
export function NotesView({ mob, onExit, pendingNote, onPendingConsumed }) {
  const [screen, setScreen] = useState("library");
  const [index, setIndex] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [paperSize, setPaperSize] = useState("a4");
  const [orient, setOrient] = useState("portrait");
  const [tabYear, setTabYear] = useState(null); // 選択中の年度タブ（key）。null=先頭
  const [tabQ, setTabQ] = useState(0); // 選択中のクォーター（0=すべて）
  const [showNew, setShowNew] = useState(false); // 新規ノート作成モーダル
  const fileRef = useRef(null);

  useEffect(() => { setIndex(loadIndex()); }, []);

  const refreshIndex = useCallback(() => setIndex(loadIndex()), []);

  // 教材ビューから渡された依頼を消費（既存ノートを開く / 教材PDFから新規ノート作成）
  const pendingDoneRef = useRef(null);
  useEffect(() => {
    if (!pendingNote) return;
    if (pendingDoneRef.current === pendingNote) return; // 二重実行ガード
    pendingDoneRef.current = pendingNote;
    (async () => {
      try {
        if (pendingNote.openId) {
          await openNote(pendingNote.openId);
        } else if (pendingNote.create) {
          const c = pendingNote.create;
          const existing = findMaterialNote(c.matId); // 既に作成済みなら開くだけ
          if (existing) { await openNote(existing.id); }
          else {
            const file = new File([b64ToUint8(c.base64)], c.name || "material.pdf", { type: "application/pdf" });
            await importPdf(file, { title: c.name, matId: c.matId, courseId: c.courseId, courseName: c.courseName, courseCode: c.courseCode, year: c.year, quarter: c.quarter, session: c.session, sessionOrder: c.sessionOrder });
          }
        }
      } catch (e) { console.warn("[notes] pending", e); }
      finally { onPendingConsumed?.(); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingNote]);

  // ノートを開く: iPad(ネイティブ)で engine=pencilkit ならオーバーレイ編集、それ以外は Web エディタ
  const openNote = async (id) => {
    const note = await readNote(id);
    if (!note) return;
    if (inkAvailable() && note.engine === "pencilkit") { setActiveId(id); setScreen("native"); }
    else { setActiveId(id); setScreen("editor"); }
  };

  // 白紙ノート新規作成（選択中の用紙サイズ・向きを使用）
  const createBlank = async (template) => {
    const id = uid();
    const { w, h } = paperDims(paperSize, orient);
    const useInk = inkAvailable();
    const note = {
      v: 1, id, title: t("notes.untitled"), type: "blank", template,
      paperSize, orient, engine: useInk ? "pencilkit" : "web", pkDrawing: "",
      pages: [{ id: uid(), w, h, strokes: [] }],
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    try {
      await writeNote(note);
      const idx = [{ id, title: note.title, type: "blank", template, engine: note.engine, pageCount: 1, updatedAt: note.updatedAt, thumb: "" }, ...loadIndex()];
      saveIndex(idx); setIndex(idx);
      setActiveId(id); setScreen(useInk ? "native" : "editor");
    } catch (e) { setErr(t("notes.saveFailed")); }
  };

  // PDF 取り込み（meta があれば講義メタ＝年度/クォーター/講義/教材ID をノートへ付与）
  const importPdf = async (file, meta) => {
    if (!file) return;
    setBusy(t("notes.importing")); setErr("");
    try {
      const base64 = await fileToBase64(file);
      const pdfjs = await loadPdfjs();
      const doc = await pdfjs.getDocument({ data: b64ToUint8(base64) }).promise;
      const pages = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const pg = await doc.getPage(i);
        const vp = pg.getViewport({ scale: 1 });
        const scale = A4_W / vp.width; // 横幅を A4_W に正規化
        const v2 = pg.getViewport({ scale });
        pages.push({ id: uid(), w: Math.round(v2.width), h: Math.round(v2.height), pdfIndex: i, strokes: [] });
      }
      const id = uid();
      const useInk = inkAvailable();
      const title = (meta?.title || file.name || t("notes.untitled")).replace(/\.pdf$/i, "");
      // 講義メタ（教材から書き込む場合のみ。null/undefined は持たせない）
      const cm = meta ? {
        courseId: meta.courseId || null, courseName: meta.courseName || null, courseCode: meta.courseCode || null,
        year: meta.year || null, quarter: meta.quarter || null, sourceMatId: meta.matId || null,
        session: meta.session || null, sessionOrder: meta.sessionOrder ?? null,
      } : {};
      const note = {
        v: 1, id, title,
        type: "pdf", pdfBase64: base64, engine: useInk ? "pencilkit" : "web", pkDrawing: "",
        pages, createdAt: Date.now(), updatedAt: Date.now(), ...cm,
      };
      await writeNote(note);
      const idx = [{ id, title, type: "pdf", engine: note.engine, pageCount: pages.length, updatedAt: note.updatedAt, thumb: "", ...cm }, ...loadIndex()];
      saveIndex(idx); setIndex(idx);
      setActiveId(id); setScreen(useInk ? "native" : "editor");
      return id;
    } catch (e) {
      console.error("[notes] import", e);
      setErr(/storage-full/.test(String(e?.message)) ? t("notes.storageFull") : t("notes.importFailed"));
    } finally { setBusy(""); }
  };

  const removeNote = async (id) => {
    if (!window.confirm(t("notes.confirmDelete"))) return;
    await deleteNote(id);
    const idx = loadIndex().filter((n) => n.id !== id); saveIndex(idx); setIndex(idx);
  };

  // 描き込み済みPDFを書き出し（PDFノートは元PDFにインク重ね、白紙は合成）
  const exportNotePdf = async (id) => {
    setBusy(t("notes.exporting")); setErr("");
    try {
      const note = await readNote(id);
      if (!note) return;
      if (note.engine === "pencilkit" && !(note.inkPNGs && note.inkPNGs.length)) {
        setErr(t("notes.exportReopen")); return; // インク未保存（この版より前に作成）→一度開いて閉じてもらう
      }
      const bytes = await buildNotePdfBytes(note);
      await saveBlob(new Blob([bytes], { type: "application/pdf" }), `${(note.title || "note").replace(/[\\/:*?"<>|]/g, "_")}.pdf`, "application/pdf", mob);
    } catch (e) {
      console.error("[notes] export pdf", e);
      setErr(t("notes.exportFailed"));
    } finally { setBusy(""); }
  };

  if (screen === "native" && activeId) {
    return <NativeNoteEditor id={activeId} onBack={() => { setScreen("library"); setActiveId(null); refreshIndex(); }} onIndexChange={refreshIndex} />;
  }
  if (screen === "editor" && activeId) {
    return <NoteEditor id={activeId} mob={mob} onBack={() => { setScreen("library"); setActiveId(null); refreshIndex(); }} onIndexChange={refreshIndex} />;
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {mob && (
        <header style={{ display: "flex", alignItems: "center", gap: 8, padding: "env(safe-area-inset-top) 14px 0", minHeight: 54, borderBottom: `1px solid ${T.bd}`, flexShrink: 0, background: T.bg2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", height: 54 }}>
            {onExit && <button onClick={onExit} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", display: "flex", padding: 4 }}>{I.back}</button>}
            <h1 style={{ flex: 1, margin: 0, fontSize: 17, fontWeight: 700, color: T.txH }}>{t("nav.notes")}</h1>
          </div>
        </header>
      )}
      <div style={{ flex: 1, overflowY: "auto", padding: mob ? 14 : 20, WebkitOverflowScrolling: "touch" }}>
      {/* 新規作成（＋でモーダルを開く） */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 18 }}>
        {!mob && <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.txH }}>{t("nav.notes")}</h1>}
        <button onClick={() => setShowNew(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10, border: "none", background: T.accent, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: `0 2px 8px ${T.accent}40`, marginLeft: mob ? "auto" : 0 }}>{I.plus || I.add || "+"} {t("notes.new")}</button>
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; setShowNew(false); importPdf(f); }} />
      </div>

      {busy && <div style={{ color: T.txD, fontSize: 13, marginBottom: 12 }}>{busy}</div>}
      {err && <div style={{ color: T.red, fontSize: 13, marginBottom: 12 }}>{err}</div>}

      {index.length === 0 ? (
        <div style={{ color: T.txD, fontSize: 13, textAlign: "center", padding: "60px 0" }}>{t("notes.empty")}</div>
      ) : (() => {
        const card = (n) => (
          <div key={n.id} style={{ cursor: "pointer" }}>
            {n.session && <div style={{ fontSize: 10, fontWeight: 700, color: T.accent, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.session}</div>}
            <div onClick={() => openNote(n.id)}
              style={{ aspectRatio: "3/4", borderRadius: 10, border: `1px solid ${T.bd}`, background: n.thumb ? `#fff url(${n.thumb}) center/cover` : "#fff", boxShadow: `0 2px 8px ${T.bd}`, overflow: "hidden", position: "relative", display: "flex", alignItems: "flex-start", justifyContent: "flex-start" }}>
              {!n.thumb && <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#c8c8d0" }}>{I.pen}</span>}
              <span style={{ position: "absolute", top: 6, left: 6, fontSize: 9, fontWeight: 700, color: "#fff", background: n.type === "pdf" ? T.red : T.accent, padding: "2px 6px", borderRadius: 5 }}>{n.type === "pdf" ? "PDF" : "NOTE"}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6 }}>
              <span style={{ flex: 1, fontSize: 12, color: T.txH, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</span>
              <button title={t("notes.exportPdf")} onClick={(e) => { e.stopPropagation(); exportNotePdf(n.id); }} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", display: "flex", padding: 2 }}>{I.dl}</button>
              <button title={t("notes.confirmDelete")} onClick={(e) => { e.stopPropagation(); removeNote(n.id); }} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", display: "flex", padding: 2 }}>{I.trash}</button>
            </div>
            <div style={{ fontSize: 10, color: T.txD }}>{n.pageCount} {t("notes.pages")}</div>
          </div>
        );
        const grid = (notes) => (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${mob ? 120 : 150}px, 1fr))`, gap: 14 }}>{notes.map(card)}</div>
        );
        // 講義ブロック（アイコン付き見出し＋ 授業回ラベル付きカードを横並びグリッド）。
        // 基本1授業1教材なので、授業回(section順)に並べてカード上部にラベルを置くだけにする。
        const courseBlock = (cg) => {
          const notes = cg.sessions.flatMap((s) => s.notes); // sessions は section 順にソート済み
          return (
            <div key={cg.id} style={{ marginBottom: 22 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
                <span style={{ display: "flex", color: T.accent }}>{I.book || I.file}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: T.txH, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cg.name}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: T.txD, background: T.bg3, borderRadius: 10, padding: "1px 8px", flexShrink: 0 }}>{notes.length}</span>
              </div>
              {grid(notes)}
            </div>
          );
        };

        const { uncat, years } = groupNotes(index);
        // タブモデル: 年度タブ（降順）＋ 末尾に「その他」（講義メタ無し）
        const tabs = years.map((yg) => ({ key: `y${yg.year}`, label: yg.year ? t("notes.yearLabel", { year: yg.year }) : t("notes.uncategorized"), yg }));
        if (uncat.length) tabs.push({ key: "uncat", label: t("notes.uncategorized"), uncat });
        const curKey = tabs.some((tb) => tb.key === tabYear) ? tabYear : tabs[0]?.key;
        const cur = tabs.find((tb) => tb.key === curKey);

        const yearTab = (tb) => {
          const on = tb.key === curKey;
          return (
            <button key={tb.key} onClick={() => { setTabYear(tb.key); setTabQ(0); }}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 14px", border: "none", borderBottom: `2px solid ${on ? T.accent : "transparent"}`, background: "transparent", color: on ? T.accent : T.txD, fontSize: 13, fontWeight: on ? 700 : 500, cursor: "pointer", whiteSpace: "nowrap", transition: "all .15s" }}>
              {tb.label}
            </button>
          );
        };

        let body = null;
        if (cur?.uncat) {
          body = grid(cur.uncat);
        } else if (cur?.yg) {
          const qs = cur.yg.quarters; // [{quarter,courses}] quarter昇順
          const effQ = qs.some((q) => q.quarter === tabQ) ? tabQ : 0;
          const qOptions = [0, ...qs.map((q) => q.quarter)];
          const shown = effQ === 0 ? qs : qs.filter((q) => q.quarter === effQ);
          body = (
            <div>
              {qs.length > 0 && (
                <div style={{ display: "inline-flex", gap: 2, background: T.bg3, borderRadius: 10, padding: 3, marginBottom: 18, flexWrap: "wrap" }}>
                  {qOptions.map((q) => {
                    const on = effQ === q;
                    const label = q === 0 ? t("notes.allQuarters") : q < 0 ? t("notes.uncategorized") : t("notes.quarterLabel", { q });
                    return (
                      <button key={q} onClick={() => setTabQ(q)}
                        style={{ padding: "5px 14px", borderRadius: 8, border: "none", background: on ? T.bg2 : "transparent", boxShadow: on ? `0 1px 3px ${T.bd}` : "none", color: on ? T.accent : T.txD, fontSize: 12, fontWeight: on ? 700 : 600, cursor: "pointer" }}>{label}</button>
                    );
                  })}
                </div>
              )}
              {shown.map((qg) => (
                <div key={qg.quarter}>
                  {effQ === 0 && qs.length > 1 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0 12px" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.txD, letterSpacing: ".04em" }}>{qg.quarter ? t("notes.quarterLabel", { q: qg.quarter }) : t("notes.uncategorized")}</span>
                      <div style={{ flex: 1, height: 1, background: T.bd }} />
                    </div>
                  )}
                  {qg.courses.map(courseBlock)}
                </div>
              ))}
            </div>
          );
        }

        return (
          <div>
            <div style={{ display: "flex", gap: 2, borderBottom: `1px solid ${T.bd}`, marginBottom: 16, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              {tabs.map(yearTab)}
            </div>
            {body}
          </div>
        );
      })()}
      </div>

      {/* 新規ノート作成モーダル */}
      {showNew && (() => {
        const TEMPLATES = [
          { id: "plain", label: t("notes.blankPlain"), bg: "#fff" },
          { id: "lined", label: t("notes.blankLined"), bg: "#fff", img: "repeating-linear-gradient(to bottom, transparent 0 9px, #d6d6de 9px 10px)" },
          { id: "grid", label: t("notes.blankGrid"), bg: "#fff", img: "repeating-linear-gradient(to bottom, transparent 0 9px, #d6d6de 9px 10px), repeating-linear-gradient(to right, transparent 0 9px, #d6d6de 9px 10px)" },
        ];
        const makeBlank = (tpl) => { setShowNew(false); createBlank(tpl); };
        return (
          <div onClick={() => setShowNew(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: mob ? "flex-end" : "center", justifyContent: "center", zIndex: 3000, padding: mob ? 0 : 20 }}>
            <div onClick={(e) => e.stopPropagation()}
              style={{ background: T.bg2, borderRadius: mob ? "16px 16px 0 0" : 16, border: `1px solid ${T.bd}`, padding: mob ? "18px 16px calc(env(safe-area-inset-bottom) + 18px)" : "22px 24px", width: mob ? "100%" : 440, maxWidth: "100%", boxShadow: "0 8px 32px rgba(0,0,0,.4)" }}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
                <span style={{ flex: 1, fontSize: 16, fontWeight: 700, color: T.txH }}>{t("notes.newTitle")}</span>
                <button onClick={() => setShowNew(false)} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", display: "flex", padding: 4 }}>{I.x}</button>
              </div>

              {/* 用紙サイズ */}
              <div style={{ fontSize: 12, color: T.txD, fontWeight: 700, marginBottom: 7 }}>{t("notes.paperSize")}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                {PAPER_SIZES.map((p) => (
                  <button key={p.id} onClick={() => setPaperSize(p.id)} style={{ minWidth: 44, padding: "6px 12px", borderRadius: 8, border: `1px solid ${paperSize === p.id ? T.accent : T.bd}`, background: paperSize === p.id ? `${T.accent}14` : T.bg3, color: paperSize === p.id ? T.accent : T.txH, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>{p.label}</button>
                ))}
              </div>

              {/* 向き */}
              <div style={{ fontSize: 12, color: T.txD, fontWeight: 700, marginBottom: 7 }}>{t("notes.orient")}</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
                {[{ id: "portrait", l: t("notes.portrait") }, { id: "landscape", l: t("notes.landscape") }].map((o) => (
                  <button key={o.id} onClick={() => setOrient(o.id)} style={{ padding: "6px 16px", borderRadius: 8, border: `1px solid ${orient === o.id ? T.accent : T.bd}`, background: orient === o.id ? `${T.accent}14` : T.bg3, color: orient === o.id ? T.accent : T.txH, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>{o.l}</button>
                ))}
              </div>

              {/* テンプレート（押すと作成） */}
              <div style={{ fontSize: 12, color: T.txD, fontWeight: 700, marginBottom: 9 }}>{t("notes.template")}</div>
              <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
                {TEMPLATES.map((tpl) => (
                  <button key={tpl.id} onClick={() => makeBlank(tpl.id)}
                    style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "12px 8px", borderRadius: 12, border: `1px solid ${T.bd}`, background: T.bg3, cursor: "pointer", transition: "all .12s" }}>
                    <div style={{ width: 48, height: 64, borderRadius: 5, background: tpl.bg, backgroundImage: tpl.img || "none", border: `1px solid ${T.bd}`, boxShadow: `0 1px 4px ${T.bd}` }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: T.txH }}>{tpl.label}</span>
                  </button>
                ))}
              </div>

              {/* PDF 取込 */}
              <button onClick={() => fileRef.current?.click()}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", padding: "11px", borderRadius: 10, border: `1px dashed ${T.accent}`, background: `${T.accent}10`, color: T.accent, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{I.upload} {t("notes.importPdf")}</button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ══════════════════════════════════════════════
// ネイティブ(PencilKit)オーバーレイ編集
//  Web のチャンク（ヘッダ＋キャンバス領域 div）を表示したまま、その領域に
//  ネイティブ PKCanvasView を重ねる。サイドバーは App 側でそのまま表示される。
// ══════════════════════════════════════════════
const NPEN_SIZES = [5, 9, 16];
const NMONO_SIZES = [0.2, 0.6, 1.5]; // 一律ペンは極細まで（0.2が最小）
const NHL_SIZES = [22, 40];
const NERASER_SIZES = [40, 80];

// ツール用ライン系アイコン（絵文字をやめて既存アイコンと統一感のあるSVGに）
const svgProps = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
const TOOL_ICONS = {
  pen: (<svg {...svgProps}><path d="M4 20l3.8-.9L19 7.9a2.1 2.1 0 1 0-3-3L4.9 16.2 4 20z" /><path d="M13.5 6.5l3 3" /></svg>),
  mono: (<svg {...svgProps}><path d="M7 18l2.2-.5L18 8.8a1.7 1.7 0 0 0-2.4-2.4L6.8 15.2 7 18z" /><circle cx="7" cy="17.4" r="1.1" /></svg>),
  highlighter: (<svg {...svgProps}><path d="M4 21h16" /><path d="M8.5 13.5l-2 2V18h2.5l2-2" /><path d="M8.5 13.5l6.5-6.5 3 3-6.5 6.5z" /></svg>),
  eraser: (<svg {...svgProps}><path d="M4 21h16" /><path d="M8.5 18.5l-3.4-3.4a1.5 1.5 0 0 1 0-2.1l6.6-6.6a1.5 1.5 0 0 1 2.1 0l3.8 3.8a1.5 1.5 0 0 1 0 2.1L15 18.5z" /></svg>),
  lasso: (<svg {...svgProps} strokeDasharray="3 2.5"><path d="M4 11a8 4 0 1 1 16 0 8 4 0 0 1-12.5 3.3" /><path d="M7.5 14.3c-.8.5-.8 2 .3 2.4" strokeDasharray="0" /></svg>),
};

function NativeNoteEditor({ id, onBack, onIndexChange }) {
  const hostRef = useRef(null);
  const noteRef = useRef(null);
  const bgPagesRef = useRef([]);
  const shownRef = useRef(false);
  const finishedRef = useRef(false);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState(t("notes.opening"));
  const [ready, setReady] = useState(false);
  const [exporting, setExporting] = useState(false);
  // ツール状態（独自ツールバー → ネイティブのペンを操作）。各ペンは色/太さを個別に保持
  const [tool, setTool] = useState("mono"); // 初期=一律ペン。pen(筆圧)/mono(一律)/highlighter/eraser
  const [penColor, setPenColor] = useState(PEN_COLORS[0]);
  const [monoColor, setMonoColor] = useState(PEN_COLORS[2]);
  const [hlColor, setHlColor] = useState(HL_COLORS[0]);
  const [penW, setPenW] = useState(NPEN_SIZES[1]);
  const [monoW, setMonoW] = useState(NMONO_SIZES[0]);
  const [hlW, setHlW] = useState(NHL_SIZES[0]);
  const [eraserW, setEraserW] = useState(NERASER_SIZES[0]);
  const [eraserMode, setEraserMode] = useState("stroke"); // stroke=線ごと / pixel=部分消し
  const [shapeAssist, setShapeAssist] = useState(true); // 図形補助(ホールドで整形)。既定ON

  // ツール変更をネイティブへ反映
  useEffect(() => {
    if (!ready) return;
    if (tool === "pen") setInkTool({ type: "pen", color: penColor, width: penW });
    else if (tool === "mono") setInkTool({ type: "mono", color: monoColor, width: monoW });
    else if (tool === "highlighter") setInkTool({ type: "highlighter", color: hlColor, width: hlW });
    else if (tool === "lasso") setInkTool({ type: "lasso" });
    else setInkTool({ type: "eraser", width: eraserW, mode: eraserMode });
  }, [ready, tool, penColor, monoColor, hlColor, penW, monoW, hlW, eraserW, eraserMode]);

  // 図形補助の ON/OFF をネイティブへ反映
  useEffect(() => { if (ready) setInkShapeAssist(shapeAssist); }, [ready, shapeAssist]);

  // 直前のツールを記憶（Apple Pencil ダブルタップの「前のツールに戻す」用）
  const prevToolRef = useRef("pen");
  const curToolRef = useRef(tool);
  useEffect(() => { if (curToolRef.current !== tool) { prevToolRef.current = curToolRef.current; curToolRef.current = tool; } }, [tool]);

  // Apple Pencil ダブルタップ → ツール切替（設定を尊重）。ツールバー表示も同期される
  useEffect(() => {
    let handle;
    (async () => {
      handle = await onPencilDoubleTap((ev) => {
        const action = ev?.action || "switchEraser";
        if (action === "ignore") return;
        if (action === "switchPrevious") { setTool(prevToolRef.current || "pen"); return; }
        // switchEraser など → 現ツール↔消しゴムをトグル
        setTool((cur) => cur === "eraser" ? (prevToolRef.current && prevToolRef.current !== "eraser" ? prevToolRef.current : "mono") : "eraser");
      });
    })();
    return () => { try { handle && handle.remove && handle.remove(); } catch {} };
  }, []);

  // 編集中にこのノートを「描き込み済みPDF」で書き出す
  async function exportCurrent() {
    const note = noteRef.current; if (!note) return;
    setExporting(true);
    try {
      const res = await inkSnapshot();
      note.pkDrawing = res.drawing || note.pkDrawing || "";
      note.inkPNGs = (res.thumbnails && res.thumbnails.length) ? res.thumbnails : (note.inkPNGs || []);
      note.engine = "pencilkit"; note.updatedAt = Date.now();
      await writeNote(note);
      const bytes = await buildNotePdfBytes(note);
      await saveBlob(new Blob([bytes], { type: "application/pdf" }), `${(note.title || "note").replace(/[\\/:*?"<>|]/g, "_")}.pdf`, "application/pdf", true);
    } catch (e) { console.warn("[notes] export current", e); }
    finally { setExporting(false); }
  }

  async function finish() {
    if (finishedRef.current || !shownRef.current) return;
    finishedRef.current = true;
    try {
      const res = await hideInk();
      const note = noteRef.current; if (!note) return;
      note.pkDrawing = res.drawing || note.pkDrawing || "";
      note.inkPNGs = res.thumbnails || []; // ページ別の透明インクPNG（PDF書き出し用）
      note.engine = "pencilkit"; note.updatedAt = Date.now();
      await writeNote(note);
      let thumb = "";
      try { thumb = await compositeThumb(bgPagesRef.current[0]?.bg, res.thumbnails?.[0], note.pages[0]); } catch {}
      const idx = loadIndex(); const e = idx.find((x) => x.id === note.id);
      if (e) { e.updatedAt = note.updatedAt; e.pageCount = note.pages.length; e.engine = "pencilkit"; if (thumb) e.thumb = thumb; saveIndex(idx); }
      onIndexChange?.();
    } catch (e) { console.warn("[notes] finish native", e); }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      const note = await readNote(id);
      if (!alive || !note) { onBack(); return; }
      noteRef.current = note; setTitle(note.title || "");
      // レイアウト確定を待つ（host のサイズが決まってから rect を測る）
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (!alive) return;
      const cache = {};
      const pages = [];
      for (const pg of note.pages) pages.push({ bg: await renderBgB64(note, pg, cache), w: pg.w, h: pg.h });
      bgPagesRef.current = pages;
      if (!alive || !hostRef.current) return;
      try { await showInk({ rect: rectOfEl(hostRef.current), pages, drawing: note.pkDrawing }); shownRef.current = true; setStatus(""); setReady(true); }
      catch (e) { console.warn("[notes] showInk", e); setStatus(""); }
    })();
    const onResize = () => { if (shownRef.current && hostRef.current) setInkRect(rectOfEl(hostRef.current)); };
    window.addEventListener("resize", onResize);
    let ro = null;
    if (typeof ResizeObserver !== "undefined" && hostRef.current) { ro = new ResizeObserver(onResize); ro.observe(hostRef.current); }
    return () => { alive = false; window.removeEventListener("resize", onResize); ro?.disconnect(); finish(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const back = async () => { await finish(); onBack(); };

  // 選択中ツールの 色/太さ アクセサ（ペン2種＋蛍光は色/太さを個別保持）
  const usesColor = tool !== "eraser" && tool !== "lasso";
  const usesSize = tool !== "lasso"; // なげなわは太さ不要
  const palette = tool === "highlighter" ? HL_COLORS : PEN_COLORS;
  const curColor = tool === "mono" ? monoColor : tool === "highlighter" ? hlColor : penColor;
  const setColor = (c) => { if (tool === "mono") setMonoColor(c); else if (tool === "highlighter") setHlColor(c); else setPenColor(c); };
  const sizes = tool === "eraser" ? NERASER_SIZES : tool === "mono" ? NMONO_SIZES : tool === "highlighter" ? NHL_SIZES : NPEN_SIZES;
  const curSize = tool === "mono" ? monoW : tool === "highlighter" ? hlW : tool === "eraser" ? eraserW : penW;
  const setSize = (s) => { if (tool === "mono") setMonoW(s); else if (tool === "highlighter") setHlW(s); else if (tool === "eraser") setEraserW(s); else setPenW(s); };
  const dotColor = tool === "eraser" ? T.txD : curColor === "#ffffff" ? "#999" : curColor;
  const sizeDiv = tool === "eraser" ? 8 : tool === "highlighter" ? 4 : 2.2;
  // 太さ選択ドットの見た目サイズ（極細の一律ペンは段階が見分かるよう専用スケール）
  const dotSize = (s) => tool === "mono" ? (3 + s * 2.2) : Math.max(3, s / sizeDiv);

  const TOOLS = [
    { id: "mono", icon: TOOL_ICONS.mono, label: t("notes.penMono") },
    { id: "pen", icon: TOOL_ICONS.pen, label: t("notes.penPressure") },
    { id: "highlighter", icon: TOOL_ICONS.highlighter, label: t("notes.highlighter") },
    { id: "eraser", icon: TOOL_ICONS.eraser, label: t("notes.eraser") },
    { id: "lasso", icon: TOOL_ICONS.lasso, label: t("notes.lasso") },
  ];
  const IconBtn = ({ onClick, children, title: tt, disabled }) => (
    <button title={tt} onClick={onClick} disabled={disabled} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 9, border: "none", background: "transparent", color: T.txH, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1 }}>{children}</button>
  );

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, background: T.bg3 }}>
      {/* ヘッダー（戻る＋タイトル＋書き出し） */}
      <header style={{ display: "flex", alignItems: "center", gap: 8, padding: "calc(env(safe-area-inset-top) + 8px) 12px 8px", background: T.bg2, borderBottom: `1px solid ${T.bd}`, flexShrink: 0 }}>
        <button onClick={back} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", display: "flex", padding: 6 }}>{I.back}</button>
        <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700, color: T.txH, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
        <IconBtn onClick={exportCurrent} title={t("notes.exportPdf")} disabled={exporting}>{I.dl}</IconBtn>
      </header>
      {/* ツールバー（描画ツール） */}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, padding: "8px 10px", background: T.bg2, borderBottom: `1px solid ${T.bd}`, flexShrink: 0 }}>
        {/* Undo / Redo（左側） */}
        <IconBtn onClick={() => inkUndo()} title="Undo">{I.reset}</IconBtn>
        <IconBtn onClick={() => inkRedo()} title="Redo"><span style={{ transform: "scaleX(-1)", display: "inline-flex" }}>{I.reset}</span></IconBtn>
        <div style={{ width: 1, height: 26, background: T.bd, margin: "0 2px" }} />

        {/* ツール選択（アイコン＋ラベル・大きめ・はっきり） */}
        <div style={{ display: "flex", gap: 2, background: T.bg3, borderRadius: 11, padding: 3 }}>
          {TOOLS.map((tl) => (
            <button key={tl.id} onClick={() => setTool(tl.id)} title={tl.label}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, minWidth: 46, height: 42, borderRadius: 9, border: "none", background: tool === tl.id ? T.bg2 : "transparent", boxShadow: tool === tl.id ? `0 1px 3px ${T.bd}` : "none", cursor: "pointer" }}>
              <span style={{ display: "flex", color: tool === tl.id ? T.accent : T.txH }}>{tl.icon}</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: tool === tl.id ? T.accent : T.txD }}>{tl.label}</span>
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 26, background: T.bd, margin: "0 2px" }} />

        {/* 色 */}
        {usesColor && (
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            {palette.map((c) => (
              <button key={c} onClick={() => setColor(c)} style={{ width: 24, height: 24, borderRadius: "50%", border: curColor === c ? `2.5px solid ${T.accent}` : `1px solid ${T.bd}`, background: c, cursor: "pointer", padding: 0, boxShadow: c === "#ffffff" ? "inset 0 0 0 1px #ccc" : "none" }} />
            ))}
          </div>
        )}

        {/* 消しゴムの種類 */}
        {tool === "eraser" && (
          <div style={{ display: "flex", gap: 4 }}>
            {[{ id: "stroke", l: t("notes.eraseStroke") }, { id: "pixel", l: t("notes.erasePixel") }].map((m) => (
              <button key={m.id} onClick={() => setEraserMode(m.id)} style={{ padding: "6px 11px", borderRadius: 8, border: `1px solid ${eraserMode === m.id ? T.accent : T.bd}`, background: eraserMode === m.id ? `${T.accent}14` : T.bg2, color: eraserMode === m.id ? T.accent : T.txH, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>{m.l}</button>
            ))}
          </div>
        )}

        {usesSize && <>
        <div style={{ width: 1, height: 26, background: T.bd, margin: "0 2px" }} />

        {/* 太さ */}
        <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
          {sizes.map((s) => (
            <button key={s} onClick={() => setSize(s)} title={t("notes.thickness") || ""} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 8, border: "none", background: curSize === s ? T.bg4 : "transparent", cursor: "pointer" }}>
              <span style={{ display: "block", borderRadius: "50%", background: dotColor, width: dotSize(s), height: dotSize(s) }} />
            </button>
          ))}
        </div>
        </>}

        {tool !== "lasso" && tool !== "eraser" && <>
        <div style={{ width: 1, height: 26, background: T.bd, margin: "0 2px" }} />
        {/* 図形補助トグル */}
        <button onClick={() => setShapeAssist((v) => !v)} title={t("notes.shapeHint")}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 11px", borderRadius: 8, border: `1px solid ${shapeAssist ? T.accent : T.bd}`, background: shapeAssist ? `${T.accent}14` : T.bg2, color: shapeAssist ? T.accent : T.txH, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="5" /><rect x="11" y="11" width="9" height="9" rx="1" /></svg>
          {t("notes.shapeAssist")}
        </button>
        </>}

      </div>
      {/* この div の矩形にネイティブ PKCanvasView を重ねる */}
      <div ref={hostRef} style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {status && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: T.txD, fontSize: 13 }}>{status}</div>}
        {exporting && <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.7)", color: "#fff", fontSize: 12, padding: "4px 10px", borderRadius: 8 }}>{t("notes.exporting")}</div>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
// エディタ
// ══════════════════════════════════════════════
function NoteEditor({ id, mob, onBack, onIndexChange }) {
  const [note, setNote] = useState(null);
  const [pageIdx, setPageIdx] = useState(0);
  const [tool, setTool] = useState("pen");
  const [penColor, setPenColor] = useState(PEN_COLORS[0]);
  const [hlColor, setHlColor] = useState(HL_COLORS[0]);
  const [penSize, setPenSize] = useState(PEN_SIZES[1]);
  const [hlSize, setHlSize] = useState(HL_SIZES[0]);
  const [eraserSize, setEraserSize] = useState(ERASER_SIZES[0]);
  const [panMode, setPanMode] = useState(false);
  const [fingerDraw, setFingerDraw] = useState(false); // false=指は移動 / true=指でも描画
  const [zoom, setZoom] = useState(1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [exporting, setExporting] = useState("");

  // 描画系は再レンダリングを避けるため ref で保持
  const wrapRef = useRef(null);
  const viewRef = useRef(null);          // 表示用 canvas
  const pageCanvasRef = useRef(null);    // 論理解像度のページ（背景+確定ストローク）
  const noteRef = useRef(null);
  const pageIdxRef = useRef(0);
  const toolRef = useRef({ tool, penColor, hlColor, penSize, hlSize, eraserSize, panMode, fingerDraw });
  const viewState = useRef({ scale: 1, panX: 0, panY: 0, fit: 1, zoom: 1 });
  const pointers = useRef(new Map());
  const drawing = useRef(null);          // 進行中ストローク
  const liveLast = useRef(null);         // 増分ライブ描画: 直前の実点 [x,y,pr]
  const liveMid = useRef(null);          // 増分ライブ描画: 直前の中点 [x,y]
  const eraseOp = useRef(null);          // 進行中の消去（undo 用）
  const gesture = useRef(null);          // ピンチ/パン
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const rafRef = useRef(0);
  const snapRaf = useRef(0);
  const saveTimer = useRef(0);
  const pdfDocRef = useRef(null);
  const dirtyRef = useRef(false);

  useEffect(() => { toolRef.current = { tool, penColor, hlColor, penSize, hlSize, eraserSize, panMode, fingerDraw }; }, [tool, penColor, hlColor, penSize, hlSize, eraserSize, panMode, fingerDraw]);

  // ノート読み込み
  useEffect(() => {
    let alive = true;
    (async () => {
      const n = await readNote(id);
      if (!alive || !n) { if (alive) onBack(); return; }
      noteRef.current = n; setNote(n); setTitle(n.title || "");
      if (n.type === "pdf" && n.pdfBase64) {
        try { const pdfjs = await loadPdfjs(); pdfDocRef.current = await pdfjs.getDocument({ data: b64ToUint8(n.pdfBase64) }).promise; } catch (e) { console.warn("[notes] pdf load", e); }
      }
      await rebuildPage(0);
      // canvas はこの後の再レンダリングで初めて DOM に出るため、ここでは描画しない
      // （初期フィットは下の note 依存 effect が canvas マウント後に行う）
    })();
    return () => { alive = false; cancelAnimationFrame(rafRef.current); cancelAnimationFrame(snapRaf.current); flushSave(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // canvas マウント後の初期フィット & リサイズ追従（note セット後に canvas が DOM に出る）
  useEffect(() => {
    if (!note) return;
    let raf = requestAnimationFrame(() => { sizeViewport(); fitAndRender(); });
    const onResize = () => { sizeViewport(); fitAndRender(); };
    window.addEventListener("resize", onResize);
    let ro = null;
    if (typeof ResizeObserver !== "undefined" && wrapRef.current) { ro = new ResizeObserver(onResize); ro.observe(wrapRef.current); }
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); ro?.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note]);

  const curPage = () => noteRef.current?.pages[pageIdxRef.current];

  // ページ canvas（スーパーサンプリング解像度）を背景+確定ストロークで再構築。
  // 背景は等倍(高解像度)で、テンプレ/ストロークは SS スケールした論理座標で描く。
  async function rebuildPage(pi) {
    const n = noteRef.current; if (!n) return;
    const pg = n.pages[pi]; if (!pg) return;
    const SS = RENDER_SS;
    let pc = pageCanvasRef.current;
    if (!pc) { pc = document.createElement("canvas"); pageCanvasRef.current = pc; }
    pc.width = Math.round(pg.w * SS); pc.height = Math.round(pg.h * SS);
    const ctx = pc.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pc.width, pc.height);
    // 背景（高解像度で）
    if (n.type === "pdf" && pdfDocRef.current && pg.pdfIndex) {
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, pc.width, pc.height);
      try {
        const page = await pdfDocRef.current.getPage(pg.pdfIndex);
        const vp = page.getViewport({ scale: pc.width / page.getViewport({ scale: 1 }).width });
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
      } catch (e) { console.warn("[notes] render pdf bg", e); }
    } else {
      ctx.setTransform(SS, 0, 0, SS, 0, 0);
      drawTemplate(ctx, pg.w, pg.h, n.template, n.bg);
    }
    // 確定ストローク（論理座標、SS スケール）
    ctx.setTransform(SS, 0, 0, SS, 0, 0);
    for (const st of pg.strokes) drawStroke(ctx, st);
  }
  // 確定ストロークを pageCanvas に追記する用の ctx（SS 変換適用済み）
  function pageCtxSS() {
    const pc = pageCanvasRef.current; if (!pc) return null;
    const ctx = pc.getContext("2d"); ctx.setTransform(RENDER_SS, 0, 0, RENDER_SS, 0, 0); return ctx;
  }

  function sizeViewport() {
    const cv = viewRef.current, wrap = wrapRef.current; if (!cv || !wrap) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = wrap.clientWidth, h = wrap.clientHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv.style.width = w + "px"; cv.style.height = h + "px";
    cv._dpr = dpr; cv._cw = w; cv._ch = h;
  }

  function fitAndRender() {
    sizeViewport();
    const cv = viewRef.current, pg = curPage(); if (!cv || !pg) return;
    const fit = cv._cw / pg.w;
    viewState.current.fit = fit;
    viewState.current.zoom = 1;
    const s = fit;
    viewState.current.scale = s;
    viewState.current.panX = (cv._cw - pg.w * s) / 2;
    viewState.current.panY = 0;
    setZoom(1);
    renderViewport();
  }

  // 現在のスケールでの pan 許容範囲。ページが画面より小さい軸は中央に固定（min===max）。
  function panBounds() {
    const cv = viewRef.current, pg = curPage(); if (!cv || !pg) return null;
    const vs = viewState.current; const pw = pg.w * vs.scale, ph = pg.h * vs.scale;
    let minX, maxX, minY, maxY;
    if (pw <= cv._cw) { minX = maxX = (cv._cw - pw) / 2; } else { minX = cv._cw - pw; maxX = 0; }
    if (ph <= cv._ch) { minY = maxY = (cv._ch - ph) / 2; } else { minY = cv._ch - ph; maxY = 0; }
    return { minX, maxX, minY, maxY };
  }
  function clampPan() {
    const b = panBounds(); if (!b) return; const vs = viewState.current;
    vs.panX = Math.max(b.minX, Math.min(b.maxX, vs.panX));
    vs.panY = Math.max(b.minY, Math.min(b.maxY, vs.panY));
  }
  // 枠外は抵抗をかけて引っ張れる（ラバーバンド）。min===max の軸は中央からの引っ張り。
  function rubber(v, min, max) {
    const R = 0.45;
    if (min === max) return min + (v - min) * R;
    if (v < min) return min - (min - v) * R;
    if (v > max) return max + (v - max) * R;
    return v;
  }
  // 指を離したら許容範囲へ弾性スナップ（easeOutCubic）
  function snapPan() {
    const vs = viewState.current; const b = panBounds(); if (!b) return;
    const tx = Math.max(b.minX, Math.min(b.maxX, vs.panX));
    const ty = Math.max(b.minY, Math.min(b.maxY, vs.panY));
    const sx = vs.panX, sy = vs.panY;
    cancelAnimationFrame(snapRaf.current);
    if (Math.abs(tx - sx) < 0.5 && Math.abs(ty - sy) < 0.5) { vs.panX = tx; vs.panY = ty; renderViewport(); return; }
    const start = performance.now(), dur = 260;
    const step = (now) => {
      let p = (now - start) / dur; if (p > 1) p = 1;
      const e = 1 - Math.pow(1 - p, 3);
      vs.panX = sx + (tx - sx) * e; vs.panY = sy + (ty - sy) * e;
      renderViewport();
      if (p < 1) snapRaf.current = requestAnimationFrame(step);
    };
    snapRaf.current = requestAnimationFrame(step);
  }

  function clampScale(s) { const fit = viewState.current.fit || 1; return Math.max(fit * FIT_MIN_ZOOM, Math.min(fit * FIT_MAX_ZOOM, s)); }
  // 中心(cx,cy)を固定して targetScale へ。引数省略時はビューポート中央。
  function applyZoom(targetScale, cx, cy) {
    const cv = viewRef.current, pg = curPage(); if (!cv || !pg) return;
    const vs = viewState.current;
    if (cx == null) { cx = cv._cw / 2; cy = cv._ch / 2; }
    const ns = clampScale(targetScale);
    const lx = (cx - vs.panX) / vs.scale, ly = (cy - vs.panY) / vs.scale;
    vs.scale = ns; vs.panX = cx - lx * ns; vs.panY = cy - ly * ns;
    clampPan(); setZoom(+(ns / vs.fit).toFixed(2)); renderViewport();
  }
  const zoomBy = (factor) => applyZoom(viewState.current.scale * factor);

  function renderViewport() {
    const cv = viewRef.current, pc = pageCanvasRef.current, pg = curPage(); if (!cv || !pc || !pg) return;
    const ctx = cv.getContext("2d"); const vs = viewState.current; const dpr = cv._dpr || 1;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = T.bg3 || "#222"; ctx.fillRect(0, 0, cv._cw, cv._ch);
    ctx.save();
    ctx.translate(vs.panX, vs.panY); ctx.scale(vs.scale, vs.scale);
    // 影
    ctx.shadowColor = "rgba(0,0,0,0.25)"; ctx.shadowBlur = 12 / vs.scale; ctx.shadowOffsetY = 4 / vs.scale;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, pg.w, pg.h);
    ctx.shadowColor = "transparent";
    // SS 解像度の pageCanvas を論理ページサイズに縮小描画（クッキリ）
    ctx.drawImage(pc, 0, 0, pg.w, pg.h);
    // ペンの進行中ストロークは増分描画(liveStrokeTo)で別途描くのでここでは描かない
    if (drawing.current && drawing.current.tool === "highlighter") drawStroke(ctx, drawing.current);
    ctx.restore();
  }
  function scheduleRender() { if (!rafRef.current) rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; renderViewport(); }); }

  // 座標変換: 画面 → 論理
  function toLogical(clientX, clientY) {
    const cv = viewRef.current; const rect = cv.getBoundingClientRect(); const vs = viewState.current;
    const sx = clientX - rect.left, sy = clientY - rect.top;
    return [(sx - vs.panX) / vs.scale, (sy - vs.panY) / vs.scale];
  }

  // ── 保存 ──
  function markDirty() { dirtyRef.current = true; clearTimeout(saveTimer.current); saveTimer.current = setTimeout(flushSave, 900); }
  async function flushSave() {
    if (!dirtyRef.current || !noteRef.current) return;
    dirtyRef.current = false;
    const n = noteRef.current; n.updatedAt = Date.now();
    try {
      await writeNote(n);
      // インデックス更新（サムネは現在ページから生成）
      const idx = loadIndex();
      const e = idx.find((x) => x.id === n.id);
      const thumb = makeThumb();
      if (e) { e.title = n.title; e.pageCount = n.pages.length; e.updatedAt = n.updatedAt; if (thumb) e.thumb = thumb; saveIndex(idx); onIndexChange?.(); }
    } catch (e) { console.warn("[notes] save", e); }
  }
  function makeThumb() {
    try {
      const pc = pageCanvasRef.current; if (!pc) return "";
      const tw = 240, th = Math.round(tw * pc.height / pc.width);
      const c = document.createElement("canvas"); c.width = tw; c.height = th;
      const cx = c.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, tw, th); cx.drawImage(pc, 0, 0, tw, th);
      return c.toDataURL("image/jpeg", 0.6);
    } catch { return ""; }
  }

  // ── undo/redo ──
  function pushOp(op) { undoStack.current.push(op); redoStack.current = []; syncUndo(); }
  function syncUndo() { setCanUndo(undoStack.current.length > 0); setCanRedo(redoStack.current.length > 0); }
  async function applyUndo(redo) {
    const stack = redo ? redoStack.current : undoStack.current;
    const other = redo ? undoStack.current : redoStack.current;
    const op = stack.pop(); if (!op) return;
    if (op.pi !== pageIdxRef.current) { await gotoPage(op.pi, false); }
    const pg = noteRef.current.pages[op.pi];
    if (op.type === "add") {
      if (redo) pg.strokes.push(op.stroke);
      else pg.strokes = pg.strokes.filter((s) => s !== op.stroke);
    } else if (op.type === "erase") {
      if (redo) pg.strokes = pg.strokes.filter((s) => !op.strokes.includes(s));
      else pg.strokes.push(...op.strokes);
    }
    other.push(op); syncUndo();
    await rebuildPage(op.pi); renderViewport(); markDirty();
  }

  async function gotoPage(pi, render = true) {
    const n = noteRef.current; if (!n || pi < 0 || pi >= n.pages.length) return;
    flushSave();
    pageIdxRef.current = pi; setPageIdx(pi);
    await rebuildPage(pi);
    if (render) fitAndRender();
  }

  async function addPage() {
    const n = noteRef.current; if (!n) return;
    if (n.type === "pdf") return; // PDF は固定
    const ref = n.pages[0] || { w: A4_W, h: A4_H };
    n.pages.push({ id: uid(), w: ref.w, h: ref.h, strokes: [] });
    markDirty();
    await gotoPage(n.pages.length - 1);
  }

  function clearPage() {
    const pg = curPage(); if (!pg || !pg.strokes.length) return;
    if (!window.confirm(t("notes.confirmClear"))) return;
    pushOp({ type: "erase", pi: pageIdxRef.current, strokes: pg.strokes.slice() });
    pg.strokes = []; rebuildPage(pageIdxRef.current).then(renderViewport); markDirty();
  }

  // ── ポインタ操作 ──
  const onPointerDown = (e) => {
    const cv = viewRef.current; if (!cv) return;
    const tc = toolRef.current;

    // パームリジェクション: ペンで描画中はタッチ（手のひら）を完全に無視
    if (e.pointerType === "touch" && drawing.current && drawing.current._pen) return;

    cv.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });

    // 2本目以降のタッチ → ピンチ/パン（指で描画中なら中断して破棄）
    if (pointers.current.size >= 2) {
      if (drawing.current) { drawing.current = null; scheduleRender(); }
      if (eraseOp.current) eraseOp.current = null;
      startGesture(); return;
    }
    // パンモード（手のひらツール）／指（fingerDraw OFF時）は 1 本でも移動
    // → 描画はペン(スタイラス)とマウスのみ。指はスクロール/移動に使う。
    if (tc.panMode || (e.pointerType === "touch" && !tc.fingerDraw)) { startGesture(); return; }

    // 描画開始
    beginStroke(e);
    e.preventDefault();
  };

  function startGesture() {
    cancelAnimationFrame(snapRaf.current); // 進行中のスナップを止めてからドラッグ開始
    const ps = [...pointers.current.values()];
    const vs = viewState.current;
    if (ps.length >= 2) {
      const [a, b] = ps;
      gesture.current = { mode: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y), scale0: vs.scale, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, panX0: vs.panX, panY0: vs.panY, mx0: (a.x + b.x) / 2, my0: (a.y + b.y) / 2 };
    } else if (ps.length === 1) {
      gesture.current = { mode: "pan", x0: ps[0].x, y0: ps[0].y, panX0: vs.panX, panY0: vs.panY };
    }
  }

  function beginStroke(e) {
    const tc = toolRef.current;
    const [lx, ly] = toLogical(e.clientX, e.clientY);
    const pressure = e.pressure && e.pressure > 0 ? e.pressure : 0.5;
    if (tc.tool === "eraser") {
      eraseOp.current = { type: "erase", pi: pageIdxRef.current, strokes: [] };
      doErase(lx, ly);
      return;
    }
    drawing.current = {
      tool: tc.tool,
      color: tc.tool === "highlighter" ? tc.hlColor : tc.penColor,
      size: tc.tool === "highlighter" ? tc.hlSize : tc.penSize,
      pts: [[lx, ly, pressure]],
      _pen: e.pointerType === "pen",
    };
    if (tc.tool === "highlighter") {
      scheduleRender(); // 蛍光ペンは半透明なので毎フレーム1パス再描画
    } else {
      // ペンは増分ライブ描画（全体を再計算しないので長い線でも軽い）
      liveLast.current = [lx, ly, pressure];
      liveMid.current = [lx, ly];
      renderViewport(); // 背景+確定分を1回描く（進行中ペンは描かない）
    }
  }

  // 増分ライブ描画: 直前の中点→(制御点=直前の実点)→新しい中点 の2次ベジェを1本だけ描く
  function liveStrokeTo(x, y, pr) {
    const cv = viewRef.current; const d = drawing.current; if (!cv || !d) return;
    const ctx = cv.getContext("2d"); const vs = viewState.current; const dpr = cv._dpr || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.translate(vs.panX, vs.panY); ctx.scale(vs.scale, vs.scale);
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = d.color;
    const last = liveLast.current, m = liveMid.current;
    const nmx = (last[0] + x) / 2, nmy = (last[1] + y) / 2;
    const prAvg = ((last[2] != null ? last[2] : 0.5) + pr) / 2;
    ctx.lineWidth = d.size * (0.35 + 0.65 * prAvg);
    ctx.beginPath(); ctx.moveTo(m[0], m[1]); ctx.quadraticCurveTo(last[0], last[1], nmx, nmy); ctx.stroke();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    liveMid.current = [nmx, nmy]; liveLast.current = [x, y, pr];
  }

  const onPointerMove = (e) => {
    // ジェスチャー判定より先に最新座標を反映する（でないと moveGesture が
    // 指を置いた瞬間の座標を読み続け、パン/ピンチの移動量が常に 0 になる）
    const tracked = pointers.current.has(e.pointerId);
    if (tracked) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    if (gesture.current) { moveGesture(); return; }
    if (!tracked) return;
    const tc = toolRef.current;
    if (tc.tool === "eraser" && eraseOp.current) {
      // coalesced で滑らかに
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of evs) { const [lx, ly] = toLogical(ev.clientX, ev.clientY); doErase(lx, ly); }
      return;
    }
    if (!drawing.current) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    if (drawing.current.tool === "highlighter") {
      for (const ev of evs) {
        const [lx, ly] = toLogical(ev.clientX, ev.clientY);
        const pr = ev.pressure && ev.pressure > 0 ? ev.pressure : 0.5;
        drawing.current.pts.push([lx, ly, pr]);
      }
      scheduleRender();
    } else {
      // ペン: 新しい点だけを増分で描く（全体の再描画はしない）
      for (const ev of evs) {
        const [lx, ly] = toLogical(ev.clientX, ev.clientY);
        const pr = ev.pressure && ev.pressure > 0 ? ev.pressure : 0.5;
        drawing.current.pts.push([lx, ly, pr]);
        liveStrokeTo(lx, ly, pr);
      }
    }
  };

  function moveGesture() {
    const ps = [...pointers.current.values()]; const g = gesture.current; const vs = viewState.current; const cv = viewRef.current;
    if (g.mode === "pinch" && ps.length >= 2) {
      const [a, b] = ps; const d = Math.hypot(a.x - b.x, a.y - b.y);
      let ns = clampScale(g.scale0 * (d / (g.d0 || 1)));
      const rect = cv.getBoundingClientRect();
      const fx = g.cx - rect.left, fy = g.cy - rect.top;
      // ピンチ中心を固定するようパン補正
      const lx = (fx - g.panX0) / g.scale0, ly = (fy - g.panY0) / g.scale0;
      vs.scale = ns;
      const curMx = (a.x + b.x) / 2 - rect.left, curMy = (a.y + b.y) / 2 - rect.top;
      vs.panX = curMx - lx * ns; vs.panY = curMy - ly * ns;
      setZoom(+(ns / vs.fit).toFixed(2));
      clampPan();
    } else if (g.mode === "pan" && ps.length >= 1) {
      // 枠外はラバーバンドで引っ張れる（離したら snapPan で吸着）
      const rawX = g.panX0 + (ps[0].x - g.x0), rawY = g.panY0 + (ps[0].y - g.y0);
      const b = panBounds();
      if (b) { vs.panX = rubber(rawX, b.minX, b.maxX); vs.panY = rubber(rawY, b.minY, b.maxY); }
      else { vs.panX = rawX; vs.panY = rawY; }
    }
    scheduleRender();
  }

  function doErase(lx, ly) {
    const pg = curPage(); if (!pg) return;
    const r = toolRef.current.eraserSize;
    const remaining = []; let removed = false;
    for (const st of pg.strokes) {
      let hit = false; const thr = r + (st.size || 4) / 2;
      const p = st.pts;
      for (let i = 0; i < p.length && !hit; i++) {
        if (i === 0) { if (Math.hypot(p[0][0] - lx, p[0][1] - ly) < thr) hit = true; }
        else if (distToSeg(lx, ly, p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]) < thr) hit = true;
      }
      if (hit) { eraseOp.current.strokes.push(st); removed = true; } else remaining.push(st);
    }
    if (removed) { pg.strokes = remaining; rebuildPage(pageIdxRef.current).then(renderViewport); }
  }

  const onPointerUp = (e) => {
    const cv = viewRef.current; cv?.releasePointerCapture?.(e.pointerId);
    pointers.current.delete(e.pointerId);
    if (gesture.current) {
      if (pointers.current.size === 0) { gesture.current = null; snapPan(); } // 離したら枠内へ弾性スナップ
      else if (pointers.current.size === 1) { startGesture(); } // ピンチ→パンへ
      return;
    }
    const tc = toolRef.current;
    if (tc.tool === "eraser") {
      if (eraseOp.current && eraseOp.current.strokes.length) { pushOp(eraseOp.current); markDirty(); }
      eraseOp.current = null; return;
    }
    if (drawing.current) {
      const st = drawing.current; drawing.current = null; delete st._pen;
      if (st.pts.length) {
        const pg = curPage(); pg.strokes.push(st);
        const ctx = pageCtxSS(); if (ctx) drawStroke(ctx, st);
        pushOp({ type: "add", pi: pageIdxRef.current, stroke: st }); markDirty();
      }
      renderViewport();
    }
  };

  // ── エクスポート ──
  async function renderPageOffscreen(pi) {
    const n = noteRef.current; const pg = n.pages[pi];
    const c = document.createElement("canvas"); c.width = pg.w; c.height = pg.h;
    const ctx = c.getContext("2d");
    if (n.type === "pdf" && pdfDocRef.current && pg.pdfIndex) {
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, pg.w, pg.h);
      try { const page = await pdfDocRef.current.getPage(pg.pdfIndex); const vp = page.getViewport({ scale: pg.w / page.getViewport({ scale: 1 }).width }); await page.render({ canvasContext: ctx, viewport: vp }).promise; } catch {}
    } else { drawTemplate(ctx, pg.w, pg.h, n.template, n.bg); }
    for (const st of pg.strokes) drawStroke(ctx, st);
    return c;
  }
  async function exportPng() {
    setMenuOpen(false); setExporting(t("notes.exporting"));
    try { const c = await renderPageOffscreen(pageIdxRef.current); const blob = await new Promise((r) => c.toBlob(r, "image/png")); await saveBlob(blob, `${noteRef.current.title || "note"}_p${pageIdxRef.current + 1}.png`, "image/png", mob); }
    finally { setExporting(""); }
  }
  async function exportPdf() {
    setMenuOpen(false); setExporting(t("notes.exporting"));
    try {
      const PDFLib = await loadPdfLib();
      const out = await PDFLib.PDFDocument.create();
      const n = noteRef.current;
      for (let i = 0; i < n.pages.length; i++) {
        const c = await renderPageOffscreen(i);
        const dataUrl = c.toDataURL("image/jpeg", 0.85);
        const img = await out.embedJpg(dataUrl);
        const page = out.addPage([c.width, c.height]);
        page.drawImage(img, { x: 0, y: 0, width: c.width, height: c.height });
      }
      const bytes = await out.save();
      await saveBlob(new Blob([bytes], { type: "application/pdf" }), `${n.title || "note"}.pdf`, "application/pdf", mob);
    } catch (e) { console.error("[notes] export pdf", e); }
    finally { setExporting(""); }
  }

  const saveTitle = () => { if (noteRef.current) { noteRef.current.title = title.trim() || t("notes.untitled"); markDirty(); } };

  if (!note) return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: T.txD }}>…</div>;

  const isHL = tool === "highlighter";
  const colors = isHL ? HL_COLORS : PEN_COLORS;
  const curColor = isHL ? hlColor : penColor;
  const setColor = isHL ? setHlColor : setPenColor;
  const sizes = tool === "eraser" ? ERASER_SIZES : isHL ? HL_SIZES : PEN_SIZES;
  const curSize = tool === "eraser" ? eraserSize : isHL ? hlSize : penSize;
  const setSize = tool === "eraser" ? setEraserSize : isHL ? setHlSize : setPenSize;

  const TB = ({ active, onClick, children, tt }) => (
    <button title={tt} onClick={onClick} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 8, border: "none", background: active ? T.accent : "transparent", color: active ? "#fff" : T.txH, cursor: "pointer" }}>{children}</button>
  );

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, background: T.bg3 }}>
      {/* ヘッダー（戻る＋タイトル） */}
      <header style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: T.bg2, borderBottom: `1px solid ${T.bd}`, flexShrink: 0 }}>
        <button onClick={() => { flushSave(); onBack(); }} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", display: "flex", padding: 4 }}>{I.back}</button>
        <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle}
          style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", color: T.txH, fontSize: 15, fontWeight: 700, outline: "none" }} />
        <span style={{ fontSize: 10, color: T.accent, fontWeight: 700, padding: "1px 5px", border: `1px solid ${T.accent}`, borderRadius: 5, flexShrink: 0 }}>{NOTES_VERSION}</span>
      </header>
      {/* ツールバー */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 8px", background: T.bg2, borderBottom: `1px solid ${T.bd}`, flexShrink: 0, flexWrap: "wrap" }}>
        <TB active={tool === "pen"} onClick={() => { setTool("pen"); setPanMode(false); }} tt={t("notes.pen")}>{I.pen}</TB>
        <TB active={tool === "highlighter"} onClick={() => { setTool("highlighter"); setPanMode(false); }} tt={t("notes.highlighter")}>
          <span style={{ fontSize: 16 }}>🖍️</span>
        </TB>
        <TB active={tool === "eraser"} onClick={() => { setTool("eraser"); setPanMode(false); }} tt={t("notes.eraser")}>
          <span style={{ fontSize: 15 }}>🩹</span>
        </TB>
        <TB active={panMode} onClick={() => setPanMode((v) => !v)} tt={t("notes.pan")}>
          <span style={{ fontSize: 15 }}>✋</span>
        </TB>
        <TB active={fingerDraw} onClick={() => setFingerDraw((v) => !v)} tt={fingerDraw ? t("notes.fingerDrawOn") : t("notes.fingerDrawOff")}>
          <span style={{ fontSize: 15 }}>✍️</span>
        </TB>
        <div style={{ width: 1, height: 22, background: T.bd, margin: "0 4px" }} />
        {/* 色 */}
        {tool !== "eraser" && colors.map((c) => (
          <button key={c} onClick={() => setColor(c)} style={{ width: 24, height: 24, borderRadius: "50%", border: curColor === c ? `2px solid ${T.accent}` : `1px solid ${T.bd}`, background: c, cursor: "pointer", padding: 0, boxShadow: c === "#ffffff" ? "inset 0 0 0 1px #ccc" : "none" }} />
        ))}
        {/* 太さ */}
        <div style={{ width: 1, height: 22, background: T.bd, margin: "0 4px" }} />
        {sizes.map((s) => (
          <button key={s} onClick={() => setSize(s)} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 8, border: "none", background: curSize === s ? T.bg4 : "transparent", cursor: "pointer" }}>
            <span style={{ display: "block", borderRadius: "50%", background: tool === "eraser" ? T.txD : curColor === "#ffffff" ? "#999" : curColor, width: Math.max(4, s / (tool === "eraser" ? 6 : isHL ? 4 : 2)), height: Math.max(4, s / (tool === "eraser" ? 6 : isHL ? 4 : 2)) }} />
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {/* undo/redo */}
        <TB onClick={() => applyUndo(false)} tt="Undo"><span style={{ opacity: canUndo ? 1 : 0.3 }}>{I.reset}</span></TB>
        <TB onClick={() => applyUndo(true)} tt="Redo"><span style={{ opacity: canRedo ? 1 : 0.3, transform: "scaleX(-1)", display: "inline-flex" }}>{I.reset}</span></TB>
        <div style={{ position: "relative" }}>
          <TB onClick={() => setMenuOpen((v) => !v)} tt={t("notes.more")}>{I.more}</TB>
          {menuOpen && (
            <>
              <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
              <div style={{ position: "absolute", top: 38, right: 0, zIndex: 41, background: T.bg2, border: `1px solid ${T.bd}`, borderRadius: 10, boxShadow: `0 6px 20px ${T.bd}`, minWidth: 180, overflow: "hidden" }}>
                <MenuItem icon={I.img} label={t("notes.exportPng")} onClick={exportPng} />
                <MenuItem icon={I.file} label={t("notes.exportPdf")} onClick={exportPdf} />
                <MenuItem icon={I.trash} label={t("notes.clearPage")} onClick={() => { setMenuOpen(false); clearPage(); }} danger />
              </div>
            </>
          )}
        </div>
      </div>

      {/* キャンバス */}
      <div ref={wrapRef} style={{ flex: 1, position: "relative", overflow: "hidden", minHeight: 0, touchAction: "none" }}>
        <canvas ref={viewRef}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onPointerLeave={onPointerUp}
          style={{ display: "block", touchAction: "none", cursor: panMode ? "grab" : "crosshair" }} />
        {exporting && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)", color: "#fff", fontSize: 14 }}>{exporting}</div>}
      </div>

      {/* ページバー */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: 10, padding: "6px 10px", background: T.bg2, borderTop: `1px solid ${T.bd}`, flexShrink: 0 }}>
        <button onClick={() => gotoPage(pageIdx - 1)} disabled={pageIdx <= 0} style={{ background: "none", border: "none", color: pageIdx <= 0 ? T.txD : T.txH, cursor: pageIdx <= 0 ? "default" : "pointer", display: "flex", padding: 4, transform: "scaleX(-1)" }}>{I.arr}</button>
        <span style={{ fontSize: 13, color: T.txH, minWidth: 60, textAlign: "center" }}>{pageIdx + 1} / {note.pages.length}</span>
        <button onClick={() => gotoPage(pageIdx + 1)} disabled={pageIdx >= note.pages.length - 1} style={{ background: "none", border: "none", color: pageIdx >= note.pages.length - 1 ? T.txD : T.txH, cursor: pageIdx >= note.pages.length - 1 ? "default" : "pointer", display: "flex", padding: 4 }}>{I.arr}</button>
        {note.type !== "pdf" && (
          <button onClick={addPage} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: `1px solid ${T.bd}`, borderRadius: 8, color: T.accent, cursor: "pointer", fontSize: 12, padding: "4px 10px" }}>{I.plus}{t("notes.addPage")}</button>
        )}
        <div style={{ width: 1, height: 22, background: T.bd, margin: "0 2px" }} />
        {/* ズーム操作 */}
        <button onClick={() => zoomBy(1 / 1.25)} title={t("notes.zoomOut")} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, cursor: "pointer", fontSize: 18, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
        <button onClick={() => fitAndRender()} title={t("notes.fit")} style={{ minWidth: 48, height: 30, borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txD, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>{Math.round(zoom * 100)}%</button>
        <button onClick={() => zoomBy(1.25)} title={t("notes.zoomIn")} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, cursor: "pointer", fontSize: 16, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>＋</button>
      </div>
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", background: "none", border: "none", borderBottom: `1px solid ${T.bd}`, color: danger ? T.red : T.txH, cursor: "pointer", fontSize: 13, textAlign: "left" }}>
      <span style={{ display: "flex" }}>{icon}</span>{label}
    </button>
  );
}
