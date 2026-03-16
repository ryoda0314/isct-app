import { useState, useRef } from "react";
import { T } from "../theme.js";

const COLS = ['A','B','C','D','E','F','G','H','I','J'];
const ROWS = ['1','2','3','4','5','6','7'];

export { COLS, ROWS };

/** OCR: カメラ/画像からマトリクスを読み取る */
async function scanMatrixFromImage(file) {
  if (!window.Tesseract) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      s.onload = res;
      s.onerror = () => rej(new Error('OCRエンジンの読み込みに失敗しました'));
      document.head.appendChild(s);
    });
  }

  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('画像の読み込みに失敗'));
    i.src = URL.createObjectURL(file);
  });

  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = gray > 140 ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(imageData, 0, 0);

  URL.revokeObjectURL(img.src);

  const { data } = await window.Tesseract.recognize(canvas, 'eng', {
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    tessedit_pageseg_mode: '6',
  });

  const lines = data.text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const matrix = {};

  let rowIdx = 0;
  for (const line of lines) {
    const chars = line.replace(/[^A-Z]/g, '').split('');
    if (chars.length < 5) continue;

    const isHeader = chars.length >= 8 &&
      chars.slice(0, 5).join('') === 'ABCDE';
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

export function MatrixInput({ matrix, setMatrix }) {
  const [expanded, setExpanded] = useState(false);
  const [scanning, setScanning] = useState(false);
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

  const handleScan = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanning(true);
    setScanMsg(null);
    try {
      const { matrix: parsed, rowsFound } = await scanMatrixFromImage(file);
      if (rowsFound === 0) {
        setScanMsg({ type: 'err', text: '文字を検出できませんでした。画像を確認してください。' });
      } else {
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
        setScanMsg({ type: 'ok', text: `${rowsFound}行を検出しました。読み取り結果を確認してください。` });
        setExpanded(true);
      }
    } catch (err) {
      setScanMsg({ type: 'err', text: err.message || '読み取りに失敗しました' });
    }
    setScanning(false);
    if (scanRef.current) scanRef.current.value = '';
  };

  return (
    <div>
      <div onClick={() => setExpanded(p => !p)} style={{
        padding: "12px 14px", borderRadius: 10, border: `1px solid ${T.bd}`,
        background: T.bg3, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontSize: 14, color: filled ? T.green : T.txD }}>
          {filled ? "マトリクスカード登録済み" : "マトリクスカードを入力"}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.txD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform .15s" }}><polyline points="6 9 12 15 18 9" /></svg>
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <input ref={scanRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handleScan} />
        <button onClick={() => scanRef.current?.click()} disabled={scanning} style={{
          flex: 1, padding: "10px 0", borderRadius: 8,
          border: `1px solid ${T.accent}40`, background: `${T.accent}08`,
          color: T.accent, fontSize: 12, fontWeight: 600, cursor: scanning ? "wait" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          opacity: scanning ? .6 : 1,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
          {scanning ? "読み取り中..." : "カードを撮影して読み取り"}
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
