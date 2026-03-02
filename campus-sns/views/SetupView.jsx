import React, { useState } from "react";
import { T } from "../theme.js";

const API = "";

export const SetupView = ({ onComplete, onSkip, mob }) => {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [step, setStep] = useState(0); // 0=form, 1=connecting

  const handleSubmit = async () => {
    if (!userId || !password || !totpSecret) {
      setError("全ての項目を入力してください");
      return;
    }
    setLoading(true);
    setError(null);
    setStep(1);
    try {
      const resp = await fetch(`${API}/api/auth/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, password, totpSecret })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || data.error);
      onComplete();
    } catch (err) {
      setError(err.message);
      setStep(0);
    } finally {
      setLoading(false);
    }
  };

  const s = {
    wrap: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, padding: mob ? 20 : 40, overflow: "auto" },
    card: { width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: 16 },
    title: { fontSize: 22, fontWeight: 700, color: T.txH, textAlign: "center", marginBottom: 4 },
    sub: { fontSize: 13, color: T.txD, textAlign: "center", marginBottom: 8 },
    label: { fontSize: 12, fontWeight: 600, color: T.txD, marginBottom: 4 },
    input: { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 14, outline: "none" },
    btn: { padding: "12px 0", borderRadius: 8, border: "none", background: T.accent, color: "#fff", fontSize: 14, fontWeight: 600, cursor: loading ? "wait" : "pointer", opacity: loading ? 0.6 : 1 },
    skip: { background: "none", border: "none", color: T.txD, fontSize: 12, cursor: "pointer", marginTop: 8, textAlign: "center" },
    err: { padding: "8px 12px", borderRadius: 6, background: `${T.red}22`, color: T.red, fontSize: 12 },
    note: { fontSize: 11, color: T.txD, lineHeight: 1.5 },
    connecting: { display: "flex", flexDirection: "column", alignItems: "center", gap: 16 },
    spinner: { width: 32, height: 32, border: `3px solid ${T.bd}`, borderTop: `3px solid ${T.accent}`, borderRadius: "50%", animation: "spin 1s linear infinite" }
  };

  if (step === 1) {
    return (
      <div style={s.wrap}>
        <div style={s.connecting}>
          <div style={s.spinner} />
          <p style={{ color: T.txH, fontSize: 14 }}>T2SCHOLAに接続中...</p>
          <p style={{ color: T.txD, fontSize: 12 }}>SSO認証を実行しています。初回は30秒ほどかかります。</p>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <div style={s.title}>Science Tokyo ログイン</div>
        <div style={s.sub}>T2SCHOLAから時間割・課題を自動取得します</div>

        {error && <div style={s.err}>{error}</div>}

        <div>
          <div style={s.label}>Science Tokyo ID</div>
          <input style={s.input} value={userId} onChange={e => setUserId(e.target.value)} placeholder="例: 24B00000" autoComplete="username" />
        </div>

        <div>
          <div style={s.label}>パスワード</div>
          <input style={s.input} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="ポータルのパスワード" autoComplete="current-password" />
        </div>

        <div>
          <div style={s.label}>TOTPシークレットキー</div>
          <input style={s.input} value={totpSecret} onChange={e => setTotpSecret(e.target.value.replace(/\s/g, "").toUpperCase())} placeholder="例: TT5SOVTA4BFN4IND" />
          <div style={{ ...s.note, marginTop: 4 }}>アプリ認証設定時に表示されたシークレットキー</div>
        </div>

        <button style={s.btn} onClick={handleSubmit} disabled={loading}>ログインして接続</button>
        <button style={s.skip} onClick={onSkip}>スキップ（モックデータで表示）</button>

        <div style={s.note}>
          認証情報はこのPC内にAES-256-GCMで暗号化して保存されます。外部には送信されません。
        </div>
      </div>
    </div>
  );
};
