import { useState, useRef, useEffect, useCallback } from "react";
import { T } from "../theme.js";
import { t } from "../i18n.js";
import { I } from "../icons.jsx";
import { isNative } from "../capacitor.js";

/* ──────────────────────────────────────────────
   GoodNotes 風 手書きノート
   ・白紙ノート（罫線/方眼テンプレ）と PDF 注釈の両対応
   ・ストロークはベクター（筆圧つき）で保存 → 拡大しても破綻しにくい
   ・保存はすべて端末ローカル（ネイティブ=Filesystem / Web=localStorage）
   ・Apple Pencil / スタイラス重視（PointerEvent の pressure / pointerType を使用）
   ────────────────────────────────────────────── */

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

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

// Catmull-Rom スプラインで点列を密に補間する。端末が粗い点しか返さなくても
// （速描き時など）滑らかな曲線になる。筆圧も線形補間して引き継ぐ。
function densify(pts) {
  if (!pts || pts.length < 3) return pts || [];
  const P = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const dist = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(1, Math.min(32, Math.ceil(dist / 5)));
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

// ══════════════════════════════════════════════
// ライブラリ（ノート一覧）
// ══════════════════════════════════════════════
export function NotesView({ mob, onExit }) {
  const [screen, setScreen] = useState("library");
  const [index, setIndex] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [paperSize, setPaperSize] = useState("a4");
  const [orient, setOrient] = useState("portrait");
  const fileRef = useRef(null);

  useEffect(() => { setIndex(loadIndex()); }, []);

  const refreshIndex = useCallback(() => setIndex(loadIndex()), []);

  // 白紙ノート新規作成（選択中の用紙サイズ・向きを使用）
  const createBlank = async (template) => {
    const id = uid();
    const { w, h } = paperDims(paperSize, orient);
    const note = {
      v: 1, id, title: t("notes.untitled"), type: "blank", template,
      paperSize, orient,
      pages: [{ id: uid(), w, h, strokes: [] }],
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    try {
      await writeNote(note);
      const idx = [{ id, title: note.title, type: "blank", template, pageCount: 1, updatedAt: note.updatedAt, thumb: "" }, ...loadIndex()];
      saveIndex(idx); setIndex(idx); setActiveId(id); setScreen("editor");
    } catch (e) { setErr(t("notes.saveFailed")); }
  };

  // PDF 取り込み
  const importPdf = async (file) => {
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
      const note = {
        v: 1, id, title: (file.name || t("notes.untitled")).replace(/\.pdf$/i, ""),
        type: "pdf", pdfBase64: base64, pages, createdAt: Date.now(), updatedAt: Date.now(),
      };
      await writeNote(note);
      const idx = [{ id, title: note.title, type: "pdf", pageCount: pages.length, updatedAt: note.updatedAt, thumb: "" }, ...loadIndex()];
      saveIndex(idx); setIndex(idx); setActiveId(id); setScreen("editor");
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
      {/* 用紙サイズ・向き */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: T.txD, fontWeight: 600 }}>{t("notes.paperSize")}</span>
        {PAPER_SIZES.map((p) => (
          <button key={p.id} onClick={() => setPaperSize(p.id)} style={{ minWidth: 40, padding: "5px 10px", borderRadius: 8, border: `1px solid ${paperSize === p.id ? T.accent : T.bd}`, background: paperSize === p.id ? `${T.accent}14` : T.bg2, color: paperSize === p.id ? T.accent : T.txH, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>{p.label}</button>
        ))}
        <div style={{ width: 1, height: 22, background: T.bd, margin: "0 2px" }} />
        {[{ id: "portrait", l: t("notes.portrait") }, { id: "landscape", l: t("notes.landscape") }].map((o) => (
          <button key={o.id} onClick={() => setOrient(o.id)} style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${orient === o.id ? T.accent : T.bd}`, background: orient === o.id ? `${T.accent}14` : T.bg2, color: orient === o.id ? T.accent : T.txH, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>{o.l}</button>
        ))}
      </div>
      {/* 新規作成 */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
        <NewBtn icon={I.file} label={t("notes.blankPlain")} onClick={() => createBlank("plain")} />
        <NewBtn icon={I.file} label={t("notes.blankLined")} onClick={() => createBlank("lined")} />
        <NewBtn icon={I.file} label={t("notes.blankGrid")} onClick={() => createBlank("grid")} />
        <NewBtn icon={I.upload} label={t("notes.importPdf")} onClick={() => fileRef.current?.click()} accent />
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; importPdf(f); }} />
      </div>

      {busy && <div style={{ color: T.txD, fontSize: 13, marginBottom: 12 }}>{busy}</div>}
      {err && <div style={{ color: T.red, fontSize: 13, marginBottom: 12 }}>{err}</div>}

      {index.length === 0 ? (
        <div style={{ color: T.txD, fontSize: 13, textAlign: "center", padding: "60px 0" }}>{t("notes.empty")}</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${mob ? 120 : 150}px, 1fr))`, gap: 14 }}>
          {index.map((n) => (
            <div key={n.id} style={{ cursor: "pointer" }}>
              <div onClick={() => { setActiveId(n.id); setScreen("editor"); }}
                style={{ aspectRatio: "3/4", borderRadius: 10, border: `1px solid ${T.bd}`, background: n.thumb ? `#fff url(${n.thumb}) center/cover` : "#fff", boxShadow: `0 2px 8px ${T.bd}`, overflow: "hidden", position: "relative", display: "flex", alignItems: "flex-start", justifyContent: "flex-start" }}>
                {!n.thumb && <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#c8c8d0" }}>{I.pen}</span>}
                <span style={{ position: "absolute", top: 6, left: 6, fontSize: 9, fontWeight: 700, color: "#fff", background: n.type === "pdf" ? T.red : T.accent, padding: "2px 6px", borderRadius: 5 }}>{n.type === "pdf" ? "PDF" : "NOTE"}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6 }}>
                <span style={{ flex: 1, fontSize: 12, color: T.txH, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</span>
                <button onClick={(e) => { e.stopPropagation(); removeNote(n.id); }} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", display: "flex", padding: 2 }}>{I.trash}</button>
              </div>
              <div style={{ fontSize: 10, color: T.txD }}>{n.pageCount} {t("notes.pages")}</div>
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}

function NewBtn({ icon, label, onClick, accent }) {
  return (
    <button onClick={onClick} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 96, padding: "14px 8px", borderRadius: 12, border: `1px solid ${accent ? T.accent : T.bd}`, background: accent ? `${T.accent}14` : T.bg2, color: accent ? T.accent : T.txH, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
      <span style={{ display: "flex" }}>{icon}</span>{label}
    </button>
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

  // ページ canvas（論理解像度）を背景+確定ストロークで再構築
  async function rebuildPage(pi) {
    const n = noteRef.current; if (!n) return;
    const pg = n.pages[pi]; if (!pg) return;
    let pc = pageCanvasRef.current;
    if (!pc) { pc = document.createElement("canvas"); pageCanvasRef.current = pc; }
    pc.width = pg.w; pc.height = pg.h;
    const ctx = pc.getContext("2d");
    ctx.clearRect(0, 0, pg.w, pg.h);
    // 背景
    if (n.type === "pdf" && pdfDocRef.current && pg.pdfIndex) {
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, pg.w, pg.h);
      try {
        const page = await pdfDocRef.current.getPage(pg.pdfIndex);
        const vp = page.getViewport({ scale: pg.w / page.getViewport({ scale: 1 }).width });
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
      } catch (e) { console.warn("[notes] render pdf bg", e); }
    } else {
      drawTemplate(ctx, pg.w, pg.h, n.template, n.bg);
    }
    // 確定ストローク
    for (const st of pg.strokes) drawStroke(ctx, st);
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
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = T.bg3 || "#222"; ctx.fillRect(0, 0, cv._cw, cv._ch);
    ctx.save();
    ctx.translate(vs.panX, vs.panY); ctx.scale(vs.scale, vs.scale);
    // 影
    ctx.shadowColor = "rgba(0,0,0,0.25)"; ctx.shadowBlur = 12 / vs.scale; ctx.shadowOffsetY = 4 / vs.scale;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, pg.w, pg.h);
    ctx.shadowColor = "transparent";
    ctx.drawImage(pc, 0, 0);
    if (drawing.current) drawStroke(ctx, drawing.current);
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
    scheduleRender();
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
    for (const ev of evs) {
      const [lx, ly] = toLogical(ev.clientX, ev.clientY);
      const pr = ev.pressure && ev.pressure > 0 ? ev.pressure : 0.5;
      drawing.current.pts.push([lx, ly, pr]);
    }
    scheduleRender();
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
        const ctx = pageCanvasRef.current.getContext("2d"); drawStroke(ctx, st);
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
      {/* ツールバー */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 8px", background: T.bg2, borderBottom: `1px solid ${T.bd}`, flexShrink: 0, flexWrap: "wrap" }}>
        <button onClick={() => { flushSave(); onBack(); }} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", display: "flex", padding: 4 }}>{I.back}</button>
        <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle}
          style={{ width: mob ? 90 : 150, background: "transparent", border: "none", color: T.txH, fontSize: 14, fontWeight: 600, outline: "none" }} />
        <div style={{ width: 1, height: 22, background: T.bd, margin: "0 4px" }} />
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
