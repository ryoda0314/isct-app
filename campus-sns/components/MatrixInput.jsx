import { useState, useRef, useEffect, useCallback } from "react";
import { T } from "../theme.js";

const COLS = ['A','B','C','D','E','F','G','H','I','J'];
const ROWS = ['1','2','3','4','5','6','7'];

export { COLS, ROWS };

/** Tesseract.js を遅延ロード */
async function loadTesseract() {
  if (window.Tesseract) return;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    s.onload = res;
    s.onerror = () => rej(new Error('OCRエンジンの読み込みに失敗しました'));
    document.head.appendChild(s);
  });
}

/** Otsu's method で最適な二値化閾値を計算 */
function computeThreshold(imageData) {
  const d = imageData.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    hist[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])]++;
  }
  const total = d.length / 4;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, thresh = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const diff = sumB / wB - (sum - sumB) / wF;
    const v = wB * wF * diff * diff;
    if (v > best) { best = v; thresh = t; }
  }
  return thresh;
}

/** canvas を二値化処理（Otsu adaptive threshold） */
function binarize(canvas) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;
  const thresh = computeThreshold(imageData);
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = gray > thresh ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(imageData, 0, 0);
}

/** データ領域のみ切り出し（ヘッダ行・行番号列を除去）+ 小さければ拡大 */
function cropDataArea(srcCanvas) {
  const sw = srcCanvas.width, sh = srcCanvas.height;
  // マトリクスカード: 左 ~9% が行番号列、上 ~14% がヘッダ行
  const x0 = Math.round(sw * 0.09);
  const y0 = Math.round(sh * 0.14);
  const cw = sw - x0 - Math.round(sw * 0.01);
  const ch = sh - y0 - Math.round(sh * 0.02);
  const scale = cw < 600 ? 2 : 1;
  const canvas = document.createElement('canvas');
  canvas.width = cw * scale;
  canvas.height = ch * scale;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(srcCanvas, x0, y0, cw, ch, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** OCR誤認識の数字→文字補正 */
function fixOCRChar(c) {
  return { '0': 'O', '1': 'I', '2': 'Z', '5': 'S', '8': 'B', '6': 'G' }[c] || c;
}

/** OCR結果からマトリクスをパース */
function parseOCRResult(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const matrix = {};
  let rowIdx = 0;

  for (const line of lines) {
    let cleaned = line.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    if (cleaned.length < 3) continue;
    // ヘッダ行をスキップ
    if (cleaned.length >= 8 && cleaned.slice(0, 5) === 'ABCDE') continue;
    // 数字のみの行をスキップ
    if (/^\d+$/.test(cleaned)) continue;
    if (rowIdx >= ROWS.length) break;
    // 先頭が数字なら行番号 → スキップ
    let start = 0;
    if (/^\d/.test(cleaned)) start = 1;
    const chars = cleaned.slice(start).split('').map(fixOCRChar).filter(c => /^[A-Z]$/.test(c));
    if (chars.length < 3) continue;
    const row = ROWS[rowIdx];
    for (let ci = 0; ci < Math.min(chars.length, COLS.length); ci++) {
      const col = COLS[ci];
      if (!matrix[col]) matrix[col] = {};
      matrix[col][row] = chars[ci];
    }
    rowIdx++;
  }
  return { matrix, rowsFound: rowIdx };
}

/** 画像ファイルからマトリクスを読み取る */
async function scanMatrixFromImage(file) {
  await loadTesseract();

  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('画像の読み込みに失敗'));
    i.src = URL.createObjectURL(file);
  });

  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext('2d').drawImage(img, 0, 0);
  URL.revokeObjectURL(img.src);
  const dataCanvas = cropDataArea(canvas);
  binarize(dataCanvas);

  const { data } = await window.Tesseract.recognize(dataCanvas, 'eng', {
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    tessedit_pageseg_mode: '6',
  });
  return parseOCRResult(data.text);
}

/* ─── ガイドフレームの位置をビデオ座標に変換 ─── */
function getFrameRect(video, containerEl) {
  if (!video || !containerEl) return null;
  const vw = video.videoWidth, vh = video.videoHeight;
  const cw = containerEl.clientWidth, ch = containerEl.clientHeight;
  if (!vw || !vh || !cw || !ch) return null;

  // object-fit: cover のスケール計算
  const scale = Math.max(cw / vw, ch / vh);
  const sw = vw * scale, sh = vh * scale;
  const ox = (sw - cw) / 2, oy = (sh - ch) / 2;

  // ガイドフレームの画面上の位置（CSS: 90% width, centered, aspect 8.56/5.4）
  const CARD_RATIO = 8.56 / 5.4;
  const fw = cw * 0.90;
  const fh = fw / CARD_RATIO;
  const fx = (cw - fw) / 2;
  const fy = (ch - fh) / 2;

  // ビデオ座標に変換
  const sx = (fx + ox) / scale;
  const sy = (fy + oy) / scale;
  const sWidth = fw / scale;
  const sHeight = fh / scale;

  return {
    sx: Math.max(0, Math.round(sx)),
    sy: Math.max(0, Math.round(sy)),
    sWidth: Math.min(vw - Math.max(0, Math.round(sx)), Math.round(sWidth)),
    sHeight: Math.min(vh - Math.max(0, Math.round(sy)), Math.round(sHeight)),
  };
}

/* ─── ライブカメラスキャナー ─── */
function LiveScanner({ onResult, onClose }) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const streamRef = useRef(null);
  const busyRef = useRef(false);
  const doneRef = useRef(false);
  const workerRef = useRef(null);
  const votesRef = useRef({}); // { "A-1": { "G": 3, "C": 1 }, ... }
  const [phase, setPhase] = useState('init'); // init | workerLoading | ready | error | found
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errMsg, setErrMsg] = useState(null);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  // カメラ起動 + Tesseract worker 同時ロード
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // カメラ起動
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      } catch {
        if (!cancelled) { setErrMsg('カメラにアクセスできません'); setPhase('error'); }
        return;
      }

      // Tesseract ロード
      if (!cancelled) setPhase('workerLoading');
      try {
        await loadTesseract();
        if (cancelled) return;
        const w = await window.Tesseract.createWorker('eng');
        await w.setParameters({
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
          tessedit_pageseg_mode: '6',
        });
        if (cancelled) { w.terminate(); return; }
        workerRef.current = w;
        setPhase('ready');
      } catch {
        if (!cancelled) { setErrMsg('OCRエンジンの読み込みに失敗'); setPhase('error'); }
      }
    })();

    return () => {
      cancelled = true;
      stopStream();
      if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; }
    };
  }, [stopStream]);

  // 定期フレームスキャン（phase に依存しない安定した interval）
  useEffect(() => {
    const iv = setInterval(async () => {
      if (busyRef.current || doneRef.current || !workerRef.current || !videoRef.current) return;
      const video = videoRef.current;
      if (video.readyState < 2) return;

      busyRef.current = true;
      setScanning(true);

      try {
        // ガイドフレーム内のみ切り出し
        const rect = getFrameRect(video, containerRef.current);
        const rawCanvas = document.createElement('canvas');
        if (rect && rect.sWidth > 50 && rect.sHeight > 50) {
          rawCanvas.width = rect.sWidth;
          rawCanvas.height = rect.sHeight;
          rawCanvas.getContext('2d').drawImage(video, rect.sx, rect.sy, rect.sWidth, rect.sHeight, 0, 0, rect.sWidth, rect.sHeight);
        } else {
          rawCanvas.width = video.videoWidth;
          rawCanvas.height = video.videoHeight;
          rawCanvas.getContext('2d').drawImage(video, 0, 0);
        }
        // データ領域のみ切り出し + 二値化
        const dataCanvas = cropDataArea(rawCanvas);
        binarize(dataCanvas);

        const { data } = await workerRef.current.recognize(dataCanvas);
        const { matrix: parsed, rowsFound } = parseOCRResult(data.text);

        // 投票を蓄積（複数フレームのコンセンサスで精度向上）
        for (const c of COLS) {
          for (const r of ROWS) {
            const ch = parsed[c]?.[r];
            if (!ch || !/^[A-Z]$/.test(ch)) continue;
            const key = `${c}-${r}`;
            if (!votesRef.current[key]) votesRef.current[key] = {};
            votesRef.current[key][ch] = (votesRef.current[key][ch] || 0) + 1;
          }
        }

        // コンセンサス行列を構築（最多投票の文字を採用）
        const consensus = {};
        let cells = 0;
        for (const c of COLS) {
          consensus[c] = {};
          for (const r of ROWS) {
            const votes = votesRef.current[`${c}-${r}`];
            if (!votes) continue;
            let best = null, bestCount = 0;
            for (const [ch, count] of Object.entries(votes)) {
              if (count > bestCount) { best = ch; bestCount = count; }
            }
            if (best) { consensus[c][r] = best; cells++; }
          }
        }
        setProgress(cells);

        if (cells >= 55) {
          doneRef.current = true;
          setPhase('found');
          setScanning(false);
          stopStream();
          onResult(consensus, 7);
          return;
        }
      } catch {}

      busyRef.current = false;
      setScanning(false);
    }, 1200);

    return () => clearInterval(iv);
  }, [onResult, stopStream]);

  const handleClose = () => { stopStream(); onClose(); };

  const cornerSize = 28;
  const cornerStyle = (pos) => {
    const base = { position: 'absolute', width: cornerSize, height: cornerSize, borderColor: T.accent, borderStyle: 'solid', borderWidth: 0 };
    if (pos === 'tl') return { ...base, top: -1, left: -1, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 10 };
    if (pos === 'tr') return { ...base, top: -1, right: -1, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 10 };
    if (pos === 'bl') return { ...base, bottom: -1, left: -1, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 10 };
    return { ...base, bottom: -1, right: -1, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 10 };
  };

  const isActive = phase === 'ready' || scanning;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000, background: '#000',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* ヘッダー */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
        background: 'rgba(0,0,0,.8)', flexShrink: 0,
      }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>マトリクスカード読み取り</span>
        <button onClick={handleClose} style={{
          background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff',
          width: 32, height: 32, borderRadius: 16, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
        }}>✕</button>
      </div>

      {/* カメラビュー */}
      <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <video ref={videoRef} playsInline muted style={{
          width: '100%', height: '100%', objectFit: 'cover',
        }} />

        {/* フレーム外を暗くするオーバーレイ（CSS mask で穴を開ける） */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'rgba(0,0,0,.55)',
          maskImage: 'radial-gradient(ellipse 48% 26% at 50% 50%, transparent 98%, black 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 48% 26% at 50% 50%, transparent 98%, black 100%)',
        }} />

        {/* ガイドフレーム — クレジットカードサイズ比率 */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: '90%', maxWidth: 420, aspectRatio: '8.56 / 5.4',
        }}>
          <div style={cornerStyle('tl')} />
          <div style={cornerStyle('tr')} />
          <div style={cornerStyle('bl')} />
          <div style={cornerStyle('br')} />

          {/* スキャンライン */}
          {isActive && (
            <div style={{
              position: 'absolute', left: 6, right: 6, height: 2,
              background: `linear-gradient(90deg, transparent, ${T.accent}cc, transparent)`,
              animation: 'mxscanline 2s ease-in-out infinite',
            }} />
          )}
        </div>
      </div>

      {/* ステータスバー */}
      <div style={{
        padding: '16px', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
        background: 'rgba(0,0,0,.85)', flexShrink: 0, textAlign: 'center',
      }}>
        {phase === 'init' && (
          <div style={{ color: '#fff', fontSize: 13 }}>カメラを起動中...</div>
        )}
        {phase === 'workerLoading' && (
          <div style={{ color: '#fff', fontSize: 13 }}>
            <div style={{ marginBottom: 6 }}>OCRエンジンを読み込み中...</div>
            <div style={{
              width: 120, height: 3, borderRadius: 2, background: 'rgba(255,255,255,.15)',
              margin: '0 auto', overflow: 'hidden',
            }}>
              <div style={{
                width: '60%', height: '100%', background: T.accent,
                animation: 'mxloader 1.2s ease-in-out infinite',
              }} />
            </div>
          </div>
        )}
        {phase === 'error' && (
          <div style={{ color: T.red, fontSize: 13 }}>{errMsg}</div>
        )}
        {phase === 'ready' && <>
          <div style={{ color: '#fff', fontSize: 13, marginBottom: 8 }}>
            カードを枠に合わせてください
          </div>
          <div style={{
            width: '100%', maxWidth: 260, margin: '0 auto', height: 6,
            borderRadius: 3, background: 'rgba(255,255,255,.12)', overflow: 'hidden',
          }}>
            <div style={{
              width: `${Math.min(100, (progress / 70) * 100)}%`, height: '100%',
              borderRadius: 3, background: progress >= 35 ? T.green : T.accent,
              transition: 'width .3s, background .3s',
            }} />
          </div>
          <div style={{ color: 'rgba(255,255,255,.45)', fontSize: 11, marginTop: 4 }}>
            {scanning ? `読み取り中... (${progress}/70)` : (progress > 0 ? `${progress}/70 セル検出` : 'スキャン待機中')}
          </div>
        </>}
        {phase === 'found' && (
          <div style={{ color: T.green, fontSize: 14, fontWeight: 700 }}>読み取り完了</div>
        )}
      </div>

      <style>{`
        @keyframes mxscanline{0%{top:8%}50%{top:88%}100%{top:8%}}
        @keyframes mxloader{0%{transform:translateX(-100%)}100%{transform:translateX(200%)}}
      `}</style>
    </div>
  );
}

export function MatrixInput({ matrix, setMatrix }) {
  const [expanded, setExpanded] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [liveMode, setLiveMode] = useState(false);
  const [scanMsg, setScanMsg] = useState(null);
  const scanRef = useRef(null);
  const filled = COLS.every(c => ROWS.every(r => matrix[c]?.[r]));

  const set = (col, row, val) => {
    setMatrix(prev => {
      const next = { ...prev };
      if (!next[col]) next[col] = {};
      next[col] = { ...next[col], [row]: val.toUpperCase().slice(0, 1) };
      return next;
    });
  };

  const focusNext = (col, row) => {
    const ci = COLS.indexOf(col);
    const ri = ROWS.indexOf(row);
    let nc = ci + 1, nr = ri;
    if (nc >= COLS.length) { nc = 0; nr++; }
    if (nr < ROWS.length) {
      const next = document.getElementById(`mx-${COLS[nc]}-${ROWS[nr]}`);
      if (next) next.focus();
    }
  };

  const applyParsed = useCallback((parsed) => {
    setMatrix(prev => {
      const next = { ...prev };
      for (const col of COLS) {
        if (parsed[col]) {
          if (!next[col]) next[col] = {};
          for (const row of ROWS) {
            if (parsed[col][row]) next[col] = { ...next[col], [row]: parsed[col][row] };
          }
        }
      }
      return next;
    });
  }, [setMatrix]);

  // ファイル選択フォールバック
  const handleFileScan = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanning(true);
    setScanMsg(null);
    try {
      const { matrix: parsed, rowsFound } = await scanMatrixFromImage(file);
      if (rowsFound === 0) {
        setScanMsg({ type: 'err', text: '文字を検出できませんでした。画像を確認してください。' });
      } else {
        applyParsed(parsed);
        setScanMsg({ type: 'ok', text: `${rowsFound}行を検出しました。読み取り結果を確認してください。` });
        setExpanded(true);
      }
    } catch (err) {
      setScanMsg({ type: 'err', text: err.message || '読み取りに失敗しました' });
    }
    setScanning(false);
    if (scanRef.current) scanRef.current.value = '';
  };

  const handleLiveResult = useCallback((parsed, rowsFound) => {
    applyParsed(parsed);
    setScanMsg({ type: 'ok', text: `${rowsFound}行を自動検出しました。結果を確認してください。` });
    setExpanded(true);
    setLiveMode(false);
  }, [applyParsed]);

  const hasCamera = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  return (
    <div>
      {liveMode && <LiveScanner onResult={handleLiveResult} onClose={() => setLiveMode(false)} />}

      <div onClick={() => setExpanded(p => !p)} style={{
        padding: "12px 14px", borderRadius: 10, border: `1px solid ${T.bd}`,
        background: T.bg3, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontSize: 14, color: filled ? T.green : T.txD }}>
          {filled ? "マトリクスカード登録済み" : "マトリクスカードを入力"}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.txD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform .15s" }}><polyline points="6 9 12 15 18 9" /></svg>
      </div>

      {/* カメラスキャン / 画像選択 */}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        {hasCamera && (
          <button onClick={() => setLiveMode(true)} style={{
            flex: 1, padding: "10px 0", borderRadius: 8,
            border: `1px solid ${T.accent}40`, background: `${T.accent}08`,
            color: T.accent, fontSize: 12, fontWeight: 600, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
            カメラで読み取り
          </button>
        )}
        <input ref={scanRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileScan} />
        <button onClick={() => scanRef.current?.click()} disabled={scanning} style={{
          flex: hasCamera ? 0 : 1, padding: hasCamera ? "10px 14px" : "10px 0", borderRadius: 8,
          border: `1px solid ${T.bd}`, background: "transparent",
          color: T.txD, fontSize: 12, fontWeight: 500, cursor: scanning ? "wait" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          opacity: scanning ? .6 : 1,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          {scanning ? "読み取り中..." : (hasCamera ? "画像" : "画像から読み取り")}
        </button>
      </div>

      {scanMsg && (
        <div style={{
          marginTop: 6, padding: "8px 12px", borderRadius: 8, fontSize: 12,
          background: scanMsg.type === 'ok' ? `${T.green}14` : `${T.red}14`,
          color: scanMsg.type === 'ok' ? T.green : T.red,
        }}>{scanMsg.text}</div>
      )}

      {expanded && (
        <div style={{ marginTop: 8, padding: 10, borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg3, overflowX: "auto" }}>
          <p style={{ fontSize: 11, color: T.txD, marginBottom: 8 }}>マトリクスカードの各セルを入力（大文字・小文字は区別しません）</p>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ width: 24, fontSize: 10, color: T.txD, padding: 2 }} />
                {COLS.map(c => (
                  <th key={c} style={{ fontSize: 11, color: T.accent, padding: 2, textAlign: "center", fontWeight: 700 }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map(r => (
                <tr key={r}>
                  <td style={{ fontSize: 11, color: T.accent, textAlign: "center", fontWeight: 700, padding: 2 }}>{r}</td>
                  {COLS.map(c => (
                    <td key={c} style={{ padding: 1 }}>
                      <input
                        id={`mx-${c}-${r}`}
                        value={matrix[c]?.[r] || ''}
                        onChange={e => {
                          const v = e.target.value;
                          set(c, r, v);
                          if (v) focusNext(c, r);
                        }}
                        maxLength={1}
                        style={{
                          width: "100%", minWidth: 24, height: 28, textAlign: "center",
                          border: `1px solid ${matrix[c]?.[r] ? T.accent + '40' : T.bd}`,
                          borderRadius: 4, background: matrix[c]?.[r] ? `${T.accent}08` : T.bg2,
                          color: T.txH, fontSize: 14, fontWeight: 700, fontFamily: "monospace",
                          outline: "none", textTransform: "uppercase", padding: 0,
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
