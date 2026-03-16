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

/** canvas を二値化処理 */
function binarize(canvas) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = gray > 140 ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(imageData, 0, 0);
}

/** OCR結果からマトリクスをパース */
function parseOCRResult(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const matrix = {};
  let rowIdx = 0;

  for (const line of lines) {
    const chars = line.replace(/[^A-Z]/g, '').split('');
    if (chars.length < 5) continue;
    const isHeader = chars.length >= 8 && chars.slice(0, 5).join('') === 'ABCDE';
    if (isHeader) continue;
    if (rowIdx >= ROWS.length) break;
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
  binarize(canvas);

  const { data } = await window.Tesseract.recognize(canvas, 'eng', {
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    tessedit_pageseg_mode: '6',
  });
  return parseOCRResult(data.text);
}

/* ─── ライブカメラスキャナー ─── */
function LiveScanner({ onResult, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanningRef = useRef(false);
  const workerRef = useRef(null);
  const [status, setStatus] = useState('loading'); // loading | ready | scanning | found | error
  const [progress, setProgress] = useState(0); // 検出セル数
  const [errMsg, setErrMsg] = useState(null);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  // カメラ起動
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        setStatus('ready');
      } catch {
        setErrMsg('カメラにアクセスできません');
        setStatus('error');
      }
    })();
    return () => { cancelled = true; stopStream(); };
  }, [stopStream]);

  // Tesseract worker を事前ロード
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadTesseract();
        if (!cancelled) {
          const w = await window.Tesseract.createWorker('eng');
          await w.setParameters({
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
            tessedit_pageseg_mode: '6',
          });
          if (!cancelled) workerRef.current = w;
          else w.terminate();
        }
      } catch {}
    })();
    return () => { cancelled = true; if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; } };
  }, []);

  // 定期フレームスキャン
  useEffect(() => {
    if (status !== 'ready') return;
    const iv = setInterval(async () => {
      if (scanningRef.current || !workerRef.current || !videoRef.current) return;
      const video = videoRef.current;
      if (video.readyState < 2) return;

      scanningRef.current = true;
      setStatus('scanning');

      try {
        const canvas = canvasRef.current || document.createElement('canvas');
        canvasRef.current = canvas;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        binarize(canvas);

        const { data } = await workerRef.current.recognize(canvas);
        const { matrix, rowsFound } = parseOCRResult(data.text);

        // 検出セル数をカウント
        let cells = 0;
        for (const c of COLS) for (const r of ROWS) if (matrix[c]?.[r]) cells++;
        setProgress(cells);

        if (rowsFound >= 5 && cells >= 40) {
          // 十分なデータが検出された
          setStatus('found');
          stopStream();
          onResult(matrix, rowsFound);
          return;
        }
      } catch {}

      scanningRef.current = false;
      setStatus('ready');
    }, 1500);

    return () => clearInterval(iv);
  }, [status, onResult, stopStream]);

  const handleClose = () => {
    stopStream();
    onClose();
  };

  const cornerStyle = (pos) => {
    const base = { position: 'absolute', width: 24, height: 24, borderColor: T.accent, borderStyle: 'solid', borderWidth: 0 };
    if (pos === 'tl') return { ...base, top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 };
    if (pos === 'tr') return { ...base, top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 };
    if (pos === 'bl') return { ...base, bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 };
    return { ...base, bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8 };
  };

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
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <video ref={videoRef} playsInline muted style={{
          width: '100%', height: '100%', objectFit: 'cover',
        }} />

        {/* ガイドフレーム */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: '88%', maxWidth: 400, aspectRatio: '10/7',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ position: 'absolute', inset: 0 }}>
            <div style={cornerStyle('tl')} />
            <div style={cornerStyle('tr')} />
            <div style={cornerStyle('bl')} />
            <div style={cornerStyle('br')} />
          </div>
          {/* スキャンライン */}
          {status === 'scanning' && (
            <div style={{
              position: 'absolute', left: 4, right: 4, height: 2,
              background: `linear-gradient(90deg, transparent, ${T.accent}, transparent)`,
              animation: 'scanline 1.5s ease-in-out infinite',
            }} />
          )}
        </div>

        {/* オーバーレイ（フレーム外を暗くする） */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse 52% 38% at center, transparent 0%, rgba(0,0,0,.6) 100%)',
          pointerEvents: 'none',
        }} />
      </div>

      {/* ステータスバー */}
      <div style={{
        padding: '16px', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
        background: 'rgba(0,0,0,.85)', flexShrink: 0, textAlign: 'center',
      }}>
        {status === 'loading' && (
          <div style={{ color: '#fff', fontSize: 13 }}>カメラを起動中...</div>
        )}
        {status === 'error' && (
          <div style={{ color: T.red, fontSize: 13 }}>{errMsg || 'エラーが発生しました'}</div>
        )}
        {(status === 'ready' || status === 'scanning') && <>
          <div style={{ color: '#fff', fontSize: 13, marginBottom: 8 }}>
            マトリクスカードを枠内に合わせてください
          </div>
          {/* プログレスバー */}
          <div style={{
            width: '100%', maxWidth: 280, margin: '0 auto', height: 6,
            borderRadius: 3, background: 'rgba(255,255,255,.15)', overflow: 'hidden',
          }}>
            <div style={{
              width: `${Math.min(100, (progress / 70) * 100)}%`, height: '100%',
              borderRadius: 3, background: progress >= 40 ? T.green : T.accent,
              transition: 'width .3s, background .3s',
            }} />
          </div>
          <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 11, marginTop: 4 }}>
            {progress > 0 ? `${progress}/70 セル検出中...` : 'スキャン待機中...'}
          </div>
        </>}
        {status === 'found' && (
          <div style={{ color: T.green, fontSize: 14, fontWeight: 700 }}>
            読み取り完了
          </div>
        )}
      </div>

      <style>{`@keyframes scanline{0%{top:10%}50%{top:85%}100%{top:10%}}`}</style>
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
