import { useState, useRef, useCallback } from "react";
import { T } from "../theme.js";

const COLS = ['A','B','C','D','E','F','G','H','I','J'];
const ROWS = ['1','2','3','4','5','6','7'];

export { COLS, ROWS };

export function MatrixInput({ matrix, setMatrix }) {
  const [expanded, setExpanded] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteError, setPasteError] = useState("");
  const fileRef = useRef(null);
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

  const handleDecline = useCallback(() => {
    setConfirmOpen(false);
    setExpanded(true);
    setScanMsg({ type: 'info', text: '下の表から手入力できます。' });
  }, []);

  const handleAgree = useCallback(() => {
    setConfirmOpen(false);
    fileRef.current?.click();
  }, []);

  const handlePasteApply = useCallback(() => {
    setPasteError("");
    let arr = null;
    try {
      const parsed = JSON.parse(pasteText);
      if (Array.isArray(parsed)) arr = parsed.map(s => String(s).trim());
    } catch {
      // Fallback: extract letters A-Z (one per position)
      const letters = pasteText.match(/[A-Za-z]/g);
      if (letters) arr = letters;
    }
    if (!arr) { setPasteError("JSON配列または文字列として解釈できません"); return; }
    if (arr.length !== COLS.length * ROWS.length) {
      setPasteError(`70文字必要です（入力: ${arr.length}文字）`);
      return;
    }
    const next = {};
    let i = 0;
    for (const col of COLS) {
      next[col] = {};
      for (const row of ROWS) {
        const v = String(arr[i] || "").toUpperCase().slice(0, 1);
        next[col][row] = v;
        i++;
      }
    }
    setMatrix(next);
    setPasteOpen(false);
    setPasteText("");
    setExpanded(true);
    setScanMsg({ type: 'ok', text: '70セルを一括入力しました。結果を確認してください。' });
  }, [pasteText, setMatrix]);

  const handleScan = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanning(true);
    setScanMsg(null);
    try {
      const form = new FormData();
      form.append('image', file);
      const res = await fetch('/api/matrix/scan', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '読み取りに失敗しました');
      setMatrix(prev => {
        const next = { ...prev };
        for (const col of COLS) {
          if (!data.matrix[col]) continue;
          if (!next[col]) next[col] = {};
          for (const row of ROWS) {
            if (data.matrix[col][row]) next[col] = { ...next[col], [row]: data.matrix[col][row] };
          }
        }
        return next;
      });
      setScanMsg({ type: 'ok', text: `${data.cells}/70 セルを読み取りました。結果を確認してください。` });
      setExpanded(true);
    } catch (err) {
      setScanMsg({ type: 'err', text: err.message });
    }
    setScanning(false);
    if (fileRef.current) fileRef.current.value = '';
  }, [setMatrix]);

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

      {/* 画像読み取りボタン */}
      <div style={{ marginTop: 8 }}>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handleScan} />
        <button onClick={() => setConfirmOpen(true)} disabled={scanning} style={{
          width: "100%", padding: "10px 0", borderRadius: 8,
          border: `1px solid ${T.accent}40`, background: `${T.accent}08`,
          color: T.accent, fontSize: 12, fontWeight: 600, cursor: scanning ? "wait" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          opacity: scanning ? .6 : 1,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
          {scanning ? "読み取り中..." : "カード写真から読み取り"}
        </button>
        <button onClick={() => { setPasteOpen(true); setPasteError(""); }} style={{
          width: "100%", marginTop: 6, padding: "8px 0",
          background: "none", border: "none", color: T.txD,
          fontSize: 11, cursor: "pointer", textDecoration: "underline",
        }}>
          または、配列/文字列から一括入力
        </button>
      </div>

      {/* 一括貼り付けダイアログ */}
      {pasteOpen && <>
        <div onClick={() => setPasteOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 999 }} />
        <div style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          width: "min(420px, 92vw)", background: T.bg2, borderRadius: 14,
          border: `1px solid ${T.bd}`, boxShadow: "0 8px 32px rgba(0,0,0,.4)",
          padding: 20, zIndex: 1000,
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.txH, marginBottom: 8 }}>一括入力</div>
          <p style={{ fontSize: 12, color: T.txD, lineHeight: 1.6, margin: "0 0 10px" }}>
            A1→A7→B1→B7→...→J7 の順で70文字。JSON配列（<code style={{ fontFamily: "monospace" }}>{'["G","P",...]'}</code>）または連続文字列を貼り付けてください。
          </p>
          <textarea
            value={pasteText}
            onChange={e => { setPasteText(e.target.value); setPasteError(""); }}
            placeholder={'["G","P","O","A","K","C","L", ...]'}
            rows={6}
            style={{
              width: "100%", padding: 10, borderRadius: 8,
              border: `1px solid ${pasteError ? T.red : T.bd}`,
              background: T.bg3, color: T.txH, fontSize: 12,
              fontFamily: "monospace", outline: "none", resize: "vertical",
              boxSizing: "border-box",
            }}
          />
          {pasteError && (
            <div style={{ fontSize: 11, color: T.red, marginTop: 6 }}>{pasteError}</div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={() => { setPasteOpen(false); setPasteText(""); setPasteError(""); }} style={{
              flex: 1, padding: "10px 0", borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, cursor: "pointer",
            }}>キャンセル</button>
            <button onClick={handlePasteApply} disabled={!pasteText.trim()} style={{
              flex: 1, padding: "10px 0", borderRadius: 8, fontSize: 13, fontWeight: 700,
              border: "none", background: T.accent, color: "#fff",
              cursor: pasteText.trim() ? "pointer" : "not-allowed",
              opacity: pasteText.trim() ? 1 : 0.5,
            }}>適用</button>
          </div>
        </div>
      </>}

      {/* 同意確認ダイアログ */}
      {confirmOpen && <>
        <div onClick={handleDecline} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 999 }} />
        <div style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          width: "min(360px, 90vw)", background: T.bg2, borderRadius: 14,
          border: `1px solid ${T.bd}`, boxShadow: "0 8px 32px rgba(0,0,0,.4)",
          padding: 20, zIndex: 1000,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.yellow || "#eab308"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span style={{ fontSize: 15, fontWeight: 700, color: T.txH }}>外部AI送信の確認</span>
          </div>
          <p style={{ fontSize: 13, color: T.tx, lineHeight: 1.7, margin: "0 0 6px" }}>
            カード画像を<strong style={{ color: T.txH }}>外部AIサービス（OpenAI）</strong>に送信して文字を読み取ります。
          </p>
          <ul style={{ fontSize: 12, color: T.txD, lineHeight: 1.7, margin: "0 0 14px", paddingLeft: 18 }}>
            <li>画像はOpenAIのサーバーに送信されます</li>
            <li>API経由のデータはAIの学習には使用されません</li>
            <li>送信に同意しない場合は手入力できます</li>
          </ul>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleDecline} style={{
              flex: 1, padding: "10px 0", borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, cursor: "pointer",
            }}>手入力する</button>
            <button onClick={handleAgree} style={{
              flex: 1, padding: "10px 0", borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: "none", background: T.accent, color: "#fff", cursor: "pointer",
            }}>同意して読み取り</button>
          </div>
        </div>
      </>}

      {scanMsg && (
        <div style={{
          marginTop: 6, padding: "8px 12px", borderRadius: 8, fontSize: 12,
          background: scanMsg.type === 'ok' ? `${T.green}14` : scanMsg.type === 'info' ? `${T.accent}14` : `${T.red}14`,
          color: scanMsg.type === 'ok' ? T.green : scanMsg.type === 'info' ? T.accent : T.red,
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
