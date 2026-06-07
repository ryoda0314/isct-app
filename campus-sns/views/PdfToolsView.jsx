import { useState, useRef, useEffect, useCallback } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { isNative } from "../capacitor.js";

/* ──────────────────────────────────────────────
   CDN loaders (jsdelivr — already allowed by CSP)
   ・pdf.js v3 legacy UMD … MatView と同じ理由で jsdelivr の cmaps を使う
     (cdnjs は cmaps/ 未配信で日本語が空白になる)
   ・pdf-lib v1.17.1 UMD … 結合(ページコピー→保存)用
   どちらもクライアント完結。ファイルはサーバーに送られない。
   ────────────────────────────────────────────── */
const PDFJS_VER = "3.11.174";
const PDFJS_CDN = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VER}`;
let pdfjsLoading = null;
function loadPdfjs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
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
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
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

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const MAX_SIZE = 50 * 1024 * 1024; // 50MB / file

/* pdf.js: 1ページを canvas に描画 (高DPI対応) */
async function renderPageToCanvas(pdf, pageIndex, canvas, scale) {
  const page = await pdf.getPage(pageIndex + 1); // pdf.js は 1-based
  const viewport = page.getViewport({ scale });
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(viewport.width * ratio);
  canvas.height = Math.floor(viewport.height * ratio);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  await page.render({ canvasContext: ctx, viewport }).promise;
}

/* 画像(カメラ/写真)を JPEG に正規化して取り出す。
   canvas を経由するので HEIC/WebP/PNG 等もブラウザがデコードできれば JPEG 化でき、
   pdf-lib(embedJpg) で確実に埋め込める。巨大写真は長辺 maxDim まで縮小。 */
function imageFileToJpeg(file, maxDim = 2200) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); // 透過は白背景に
      ctx.drawImage(img, 0, 0, w, h);
      c.toBlob(b => {
        if (!b) { reject(new Error("toBlob failed")); return; }
        b.arrayBuffer().then(ab => resolve({ bytes: new Uint8Array(ab), w, h })).catch(reject);
      }, "image/jpeg", 0.9);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image decode failed")); };
    img.src = url;
  });
}

const camIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
  </svg>
);

/* ──────────────────────────────────────────────
   サムネイル (1ページ) — doc proxy はキャッシュを共有
   ────────────────────────────────────────────── */
function PageThumb({ getPdf, docId, pageIndex }) {
  const ref = useRef(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const pdf = await getPdf(docId);
        if (!alive || !ref.current) return;
        await renderPageToCanvas(pdf, pageIndex, ref.current, 0.4);
      } catch (e) {
        console.error("[pdftools] thumb render", e?.message);
      }
    })();
    return () => { alive = false; };
  }, [getPdf, docId, pageIndex]);
  return <canvas ref={ref} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }} />;
}

/* ──────────────────────────────────────────────
   フルスクリーンのページプレビュー
   ────────────────────────────────────────────── */
function PreviewOverlay({ getPdf, pages, docs, startId, onClose }) {
  const idx0 = Math.max(0, pages.findIndex(p => p.id === startId));
  const [idx, setIdx] = useState(idx0);
  const [zoom, setZoom] = useState(1.1);
  const [rendering, setRendering] = useState(false);
  const ref = useRef(null);
  const cur = pages[idx];

  useEffect(() => {
    if (!cur || !ref.current) return;
    let alive = true;
    (async () => {
      setRendering(true);
      try {
        const pdf = await getPdf(cur.docId);
        if (!alive || !ref.current) return;
        await renderPageToCanvas(pdf, cur.pageIndex, ref.current, zoom);
      } catch (e) {
        console.error("[pdftools] preview render", e?.message);
      } finally {
        if (alive) setRendering(false);
      }
    })();
    return () => { alive = false; };
  }, [cur, zoom, getPdf]);

  if (!cur) return null;
  const navBtn = { padding: 10, borderRadius: 999, border: "none", background: T.bg3, color: T.txH, cursor: "pointer", display: "flex" };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,.82)", display: "flex", flexDirection: "column" }}>
      {/* top bar */}
      <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", color: "#fff" }}>
        <span style={{ fontSize: 13, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {docs[cur.docId]?.name} — {idx + 1} / {pages.length}
        </span>
        <button onClick={() => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))} style={{ ...navBtn, background: "rgba(255,255,255,.12)", color: "#fff" }} title="縮小">−</button>
        <span style={{ fontSize: 12, minWidth: 42, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(3, +(z + 0.25).toFixed(2)))} style={{ ...navBtn, background: "rgba(255,255,255,.12)", color: "#fff" }} title="拡大">＋</button>
        <button onClick={onClose} style={{ ...navBtn, background: "rgba(255,255,255,.12)", color: "#fff" }} title="閉じる">{I.x}</button>
      </div>
      {/* canvas */}
      <div onClick={e => e.stopPropagation()} style={{ flex: 1, overflow: "auto", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16 }}>
        <div style={{ background: "#fff", boxShadow: "0 8px 40px rgba(0,0,0,.5)", opacity: rendering ? 0.6 : 1, transition: "opacity .15s" }}>
          <canvas ref={ref} style={{ display: "block" }} />
        </div>
      </div>
      {/* prev / next */}
      <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 24, padding: "14px 0 22px" }}>
        <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx <= 0} style={{ ...navBtn, opacity: idx <= 0 ? 0.35 : 1 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <button onClick={() => setIdx(i => Math.min(pages.length - 1, i + 1))} disabled={idx >= pages.length - 1} style={{ ...navBtn, opacity: idx >= pages.length - 1 ? 0.35 : 1 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
        </button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   メインビュー
   ────────────────────────────────────────────── */
export function PdfToolsView({ mob = false }) {
  const [docs, setDocs] = useState({});          // id -> {id,name,pageCount,bytes}
  const [pages, setPages] = useState([]);        // [{id,docId,pageIndex}]
  const [busy, setBusy] = useState(false);
  const [busyMsg, setBusyMsg] = useState("");
  const [err, setErr] = useState("");
  const [previewId, setPreviewId] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [dropActive, setDropActive] = useState(false);
  const fileRef = useRef(null);
  const camRef = useRef(null);
  const pdfCache = useRef({}); // docId -> Promise<pdf proxy>
  // getPdf が常に最新の docs を参照できるよう ref を保持
  const docsRef = useRef(docs);
  useEffect(() => { docsRef.current = docs; }, [docs]);

  // doc proxy を1回だけ生成して共有 (pdf.js は渡した配列の buffer を detach するので毎回 slice)
  const getPdf = useCallback((docId) => {
    if (pdfCache.current[docId]) return pdfCache.current[docId];
    const p = (async () => {
      const lib = await loadPdfjs();
      const bytes = docsRef.current[docId].bytes;
      return lib.getDocument({
        data: bytes.slice(),
        cMapUrl: `${PDFJS_CDN}/cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${PDFJS_CDN}/standard_fonts/`,
      }).promise;
    })();
    pdfCache.current[docId] = p;
    return p;
  }, []);

  // bytes(=PDF) を doc として登録し、全ページを pagePlan に追加する共通処理
  const registerDocFromBytes = useCallback(async (bytes, name, lib) => {
    const proxy = await lib.getDocument({
      data: bytes.slice(),
      cMapUrl: `${PDFJS_CDN}/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${PDFJS_CDN}/standard_fonts/`,
    }).promise;
    const docId = uid();
    pdfCache.current[docId] = Promise.resolve(proxy);
    const n = proxy.numPages;
    setDocs(prev => ({ ...prev, [docId]: { id: docId, name, pageCount: n, bytes } }));
    setPages(prev => [
      ...prev,
      ...Array.from({ length: n }, (_, i) => ({ id: `${docId}-${i}-${uid()}`, docId, pageIndex: i })),
    ]);
  }, []);

  const addFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || []).filter(f => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
    if (!files.length) return;
    setErr("");
    setBusy(true);
    setBusyMsg("PDFを読み込み中…");
    try {
      const lib = await loadPdfjs();
      for (const file of files) {
        if (file.size > MAX_SIZE) { setErr(`「${file.name}」は50MBを超えています`); continue; }
        const buf = new Uint8Array(await file.arrayBuffer());
        await registerDocFromBytes(buf, file.name, lib);
      }
    } catch (e) {
      console.error("[pdftools] addFiles", e);
      setErr("PDFを読み込めませんでした。破損またはパスワード保護の可能性があります。");
    } finally {
      setBusy(false);
      setBusyMsg("");
    }
  }, [registerDocFromBytes]);

  // カメラ/写真 → JPEG正規化 → pdf-libで1ページPDF化 → 既存パイプラインへ
  const addImages = useCallback(async (fileList) => {
    const files = Array.from(fileList || []).filter(f => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i.test(f.name));
    if (!files.length) return;
    setErr("");
    setBusy(true);
    setBusyMsg("写真を変換中…");
    try {
      const PDFLib = await loadPdfLib();
      const lib = await loadPdfjs();
      for (const file of files) {
        if (file.size > MAX_SIZE) { setErr(`「${file.name}」は50MBを超えています`); continue; }
        try {
          const { bytes: jpg, w, h } = await imageFileToJpeg(file);
          const pdfDoc = await PDFLib.PDFDocument.create();
          const img = await pdfDoc.embedJpg(jpg);
          const page = pdfDoc.addPage([w, h]);
          page.drawImage(img, { x: 0, y: 0, width: w, height: h });
          const bytes = await pdfDoc.save();
          const base = file.name.replace(/\.[^.]+$/, "") || "photo";
          await registerDocFromBytes(bytes, `${base}.pdf`, lib);
        } catch (e) {
          console.error("[pdftools] image", file?.name, e?.message);
          setErr(`「${file.name}」を変換できませんでした`);
        }
      }
    } catch (e) {
      console.error("[pdftools] addImages", e);
      setErr("写真を追加できませんでした。");
    } finally {
      setBusy(false);
      setBusyMsg("");
    }
  }, [registerDocFromBytes]);

  const deletePage = useCallback((id) => {
    setPages(prev => prev.filter(p => p.id !== id));
  }, []);

  const movePage = useCallback((id, dir) => {
    setPages(prev => {
      const i = prev.findIndex(p => p.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = prev.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }, []);

  const reorder = useCallback((fromId, toId) => {
    if (fromId === toId) return;
    setPages(prev => {
      const from = prev.findIndex(p => p.id === fromId);
      const to = prev.findIndex(p => p.id === toId);
      if (from < 0 || to < 0) return prev;
      const next = prev.slice();
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setPages([]); setDocs({}); pdfCache.current = {}; setErr(""); setPreviewId(null);
  }, []);

  async function handleExport() {
    if (!pages.length) return;
    setErr("");
    setBusy(true);
    setBusyMsg("PDFを結合中…");
    try {
      const PDFLib = await loadPdfLib();
      const out = await PDFLib.PDFDocument.create();
      const loaded = {};
      for (const p of pages) {
        let src = loaded[p.docId];
        if (!src) { src = await PDFLib.PDFDocument.load(docs[p.docId].bytes); loaded[p.docId] = src; }
        const [pg] = await out.copyPages(src, [p.pageIndex]);
        out.addPage(pg);
      }
      const bytes = await out.save();
      const blob = new Blob([bytes], { type: "application/pdf" });
      const fname = `merged-${new Date().toISOString().slice(0, 10)}.pdf`;
      await saveBlob(blob, fname);
    } catch (e) {
      console.error("[pdftools] export", e);
      setErr("結合に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setBusy(false);
      setBusyMsg("");
    }
  }

  // blob → base64 (data: プレフィックス無し。Filesystem.writeFile はこの形式を要求)
  function blobToBase64(blob) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(",")[1] || "");
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
  }

  // 保存/共有 (openMaterial.js と同じ「OSに委ねる」考え方)
  async function saveBlob(blob, fname) {
    const file = (() => { try { return new File([blob], fname, { type: "application/pdf" }); } catch { return null; } })();

    // ① OSの共有シート(Web Share API)。iOSのアプリ/Safariで動作し、これが
    //    教材DLの「Safariで開く/ファイルに保存」に相当。プラグイン・再ビルド不要。
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: fname });
        return;
      } catch (e) {
        const m = String(e?.name || e?.message || "");
        if (/Abort/i.test(m)) return; // ユーザーがキャンセル
        console.warn("[pdftools] web share failed", m); // それ以外は下のフォールバックへ
      }
    }

    // ② ネイティブ(Capacitor): ファイル書き出し→共有シート (要・最新ネイティブビルド)
    if (isNative()) {
      try {
        const { Filesystem, Directory } = await import("@capacitor/filesystem");
        const { Share } = await import("@capacitor/share");
        const base64 = await blobToBase64(blob);
        const { uri } = await Filesystem.writeFile({ path: fname, data: base64, directory: Directory.Cache });
        await Share.share({ title: fname, text: fname, url: uri });
      } catch (e) {
        // ユーザーが共有シートを閉じた場合もここに来るので、キャンセルは無視
        const msg = String(e?.message || e || "");
        if (/cancel/i.test(msg)) return;
        console.error("[pdftools] native save", msg);
        // 旧ビルド(プラグイン未実装)向けの保険: WebView内でPDFを開いて閲覧/共有させる
        try { window.open(URL.createObjectURL(blob), "_blank"); } catch {}
        setErr("保存機能はアプリの最新ビルドで利用できます。更新後に再度お試しください。");
      }
      return;
    }
    // Web
    const url = URL.createObjectURL(blob);
    const isMob = mob || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMob) {
      // モバイルブラウザは a.download を無視するので新規タブで開く
      window.open(url, "_blank", "noopener");
    } else {
      const a = document.createElement("a");
      a.href = url;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  const pickFiles = () => fileRef.current?.click();
  const pickCamera = () => camRef.current?.click();

  /* ── ドロップ(PDF/画像を種類で振り分け) ── */
  const onDropFiles = (e) => {
    e.preventDefault();
    setDropActive(false);
    const fl = e.dataTransfer?.files;
    if (!fl?.length) return;
    const arr = Array.from(fl);
    const pdfs = arr.filter(f => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
    const imgs = arr.filter(f => f.type.startsWith("image/"));
    if (pdfs.length) addFiles(pdfs);
    if (imgs.length) addImages(imgs);
  };

  const inputs = (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        onChange={e => { addFiles(e.target.files); e.target.value = ""; }}
        style={{ display: "none" }}
      />
      {/* capture="environment" で背面カメラを直接起動。非対応環境では写真ピッカーにフォールバック */}
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        onChange={e => { addImages(e.target.files); e.target.value = ""; }}
        style={{ display: "none" }}
      />
    </>
  );

  /* ── 空状態 ── */
  if (pages.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, color: T.tx, minHeight: 0, overflow: "auto" }}>
        {inputs}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div
            onClick={pickFiles}
            onDragOver={e => { e.preventDefault(); setDropActive(true); }}
            onDragLeave={() => setDropActive(false)}
            onDrop={onDropFiles}
            style={{
              width: "100%", maxWidth: 460, borderRadius: 16, cursor: "pointer",
              border: `2px dashed ${dropActive ? T.accent : T.bd}`,
              background: dropActive ? `${T.accent}10` : T.bg2,
              padding: "44px 24px", textAlign: "center",
              transition: "border-color .15s, background .15s",
            }}
          >
            <div style={{ color: T.accent, display: "flex", justifyContent: "center", marginBottom: 14 }}>{I.upload}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, marginBottom: 6 }}>PDF・写真を追加して結合</div>
            <div style={{ fontSize: 13, color: T.txD, lineHeight: 1.6 }}>
              {mob ? "タップしてPDFを選択" : "クリックまたはPDF/画像をドラッグ＆ドロップ"}<br />
              複数選択OK・並べ替え/不要ページ削除も可能
            </div>
          </div>
          <button onClick={pickCamera} style={{ ...btnGhost, marginTop: 16, padding: "10px 18px", fontSize: 13.5 }}>
            {camIcon}<span style={{ marginLeft: 7 }}>カメラで撮影して追加</span>
          </button>
          <div style={{ marginTop: 18, fontSize: 11.5, color: T.txD, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: T.green }} />
            すべて端末内で処理（ファイルはサーバーに送信されません）・1ファイル50MBまで
          </div>
          {err && <div style={{ marginTop: 14, fontSize: 12.5, color: T.red, fontWeight: 600 }}>{err}</div>}
        </div>
        {busy && <BusyOverlay msg={busyMsg} />}
      </div>
    );
  }

  /* ── 編集状態 ── */
  const card = mob ? 130 : 150;
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, color: T.tx, minHeight: 0, overflow: "hidden" }}>
      {inputs}
      {/* sub toolbar */}
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${T.bd}`, background: T.bg2 }}>
        <button onClick={pickFiles} style={btnGhost}>{I.plus}<span style={{ marginLeft: 4 }}>追加</span></button>
        <button onClick={pickCamera} style={btnGhost} title="カメラで撮影して追加">{camIcon}<span style={{ marginLeft: 4 }}>カメラ</span></button>
        <button onClick={clearAll} style={{ ...btnGhost, color: T.txD }} title="すべてクリア">{I.trash}</button>
        <div style={{ flex: 1, textAlign: "center", fontSize: 12, color: T.txD }}>
          全 <b style={{ color: T.txH }}>{pages.length}</b> ページ
        </div>
        <button onClick={handleExport} disabled={busy} style={btnPrimary}>{I.dl}<span style={{ marginLeft: 5 }}>結合して保存</span></button>
      </div>
      {err && (
        <div style={{ flexShrink: 0, padding: "8px 14px", background: `${T.red}15`, color: T.red, fontSize: 12.5, fontWeight: 600, borderBottom: `1px solid ${T.red}30` }}>{err}</div>
      )}
      {!mob && (
        <div style={{ flexShrink: 0, padding: "6px 14px", fontSize: 11, color: T.txD }}>
          カードをドラッグして並べ替え／◀▶で移動・🗑で削除・タップで拡大プレビュー
        </div>
      )}

      {/* page grid */}
      <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${card}px, 1fr))`, gap: 14, alignContent: "start" }}>
          {pages.map((p, i) => {
            const isOver = overId === p.id && dragId && dragId !== p.id;
            return (
              <div
                key={p.id}
                draggable={!mob}
                onDragStart={() => setDragId(p.id)}
                onDragOver={e => { e.preventDefault(); setOverId(p.id); }}
                onDragLeave={() => setOverId(o => (o === p.id ? null : o))}
                onDrop={e => { e.preventDefault(); if (dragId) reorder(dragId, p.id); setDragId(null); setOverId(null); }}
                onDragEnd={() => { setDragId(null); setOverId(null); }}
                onClick={() => setPreviewId(p.id)}
                style={{
                  position: "relative", background: T.bg2, borderRadius: 10,
                  border: `1.5px solid ${isOver ? T.accent : T.bd}`,
                  boxShadow: dragId === p.id ? "none" : "0 1px 3px rgba(0,0,0,.12)",
                  opacity: dragId === p.id ? 0.4 : 1,
                  cursor: mob ? "pointer" : "grab", overflow: "hidden",
                  transition: "border-color .12s",
                }}
              >
                {/* index */}
                <div style={{ position: "absolute", top: 6, left: 6, zIndex: 2, background: T.txH, color: T.bg, fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 5 }}>
                  {String(i + 1).padStart(2, "0")}
                </div>
                {/* delete */}
                <button
                  onClick={e => { e.stopPropagation(); deletePage(p.id); }}
                  title="このページを削除"
                  style={{ position: "absolute", top: 5, right: 5, zIndex: 2, padding: 5, borderRadius: 6, border: "none", background: "rgba(0,0,0,.55)", color: "#fff", cursor: "pointer", display: "flex" }}
                >{I.trash}</button>
                {/* thumbnail */}
                <div style={{ aspectRatio: "3 / 4", background: T.bg3, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  <PageThumb getPdf={getPdf} docId={p.docId} pageIndex={p.pageIndex} />
                </div>
                {/* move controls */}
                <div style={{ display: "flex", borderTop: `1px solid ${T.bd}` }}>
                  <button onClick={e => { e.stopPropagation(); movePage(p.id, -1); }} disabled={i === 0}
                    style={{ ...moveBtn, opacity: i === 0 ? 0.3 : 1 }} title="前へ">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                  </button>
                  <div style={{ width: 1, background: T.bd }} />
                  <button onClick={e => { e.stopPropagation(); movePage(p.id, 1); }} disabled={i === pages.length - 1}
                    style={{ ...moveBtn, opacity: i === pages.length - 1 ? 0.3 : 1 }} title="次へ">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {previewId && (
        <PreviewOverlay getPdf={getPdf} pages={pages} docs={docs} startId={previewId} onClose={() => setPreviewId(null)} />
      )}
      {busy && <BusyOverlay msg={busyMsg} />}
    </div>
  );
}

function BusyOverlay({ msg }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 210, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: T.bg2, padding: "22px 30px", borderRadius: 14, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, boxShadow: "0 12px 40px rgba(0,0,0,.4)" }}>
        <span style={{ width: 28, height: 28, borderRadius: "50%", border: `3px solid ${T.accent}`, borderTopColor: "transparent", animation: "mnSpin .6s linear infinite", display: "block" }} />
        <span style={{ fontSize: 13, color: T.txH, fontWeight: 600 }}>{msg || "処理中…"}</span>
      </div>
    </div>
  );
}

const btnGhost = { display: "flex", alignItems: "center", padding: "7px 11px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg, color: T.txH, fontSize: 12.5, fontWeight: 600, cursor: "pointer" };
const btnPrimary = { display: "flex", alignItems: "center", padding: "8px 14px", borderRadius: 8, border: "none", background: T.accent, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer" };
const moveBtn = { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "6px 0", border: "none", background: "transparent", color: T.txH, cursor: "pointer" };
