import { useState } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { updateUserPref } from "../hooks/useCurrentUser.js";
import { MatrixInput, COLS, ROWS } from "../components/MatrixInput.jsx";

const API = "";
const PAGE = {
  position: "fixed", inset: 0, display: "flex", flexDirection: "column",
  background: T.bg, color: T.tx,
  fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,'Hiragino Sans','Segoe UI',sans-serif",
  zIndex: 9999,
};
const GLOBAL_CSS = `@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}*{box-sizing:border-box;margin:0;padding:0}html,body{background:${T.bg};overscroll-behavior:none;-webkit-tap-highlight-color:transparent}input,textarea{font-size:16px}::placeholder{color:${T.txD}}button,input,textarea,select{font-family:inherit;-webkit-appearance:none}`;

/* ─── Icons ─── */
const ICN = {
  cal: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  doc: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  bar: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  ppl: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
  chk: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  cap: <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>,
  lock: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>,
  login: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>,
  signup: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>,
};

const FEATURES = [
  { icon: ICN.cal, title: "時間割", desc: "自動取得", color: T.accent },
  { icon: ICN.doc, title: "課題管理", desc: "締め切り追跡", color: T.green },
  { icon: ICN.bar, title: "成績照会", desc: "教務Web連携", color: T.orange },
  { icon: ICN.ppl, title: "キャンパスSNS", desc: "仲間とつながる", color: T.red },
];

/* ─── Sub-components (outside to avoid re-mount) ─── */

function InputField({ label, value, onChange, placeholder, type = "text", mono, note, showToggle }) {
  const [show, setShow] = useState(false);
  const eyeOff = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 01-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>;
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 600, color: T.txD, marginBottom: 6, display: "block" }}>{label}</label>
      <div style={{ position: "relative" }}>
        <input
          style={{
            width: "100%", padding: showToggle ? "12px 44px 12px 14px" : "12px 14px",
            borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg3,
            color: T.txH, fontSize: 16, outline: "none", boxSizing: "border-box",
            ...(mono ? { fontFamily: "monospace", letterSpacing: 1 } : {}),
          }}
          type={showToggle ? (show ? "text" : "password") : type}
          value={value} onChange={onChange} placeholder={placeholder}
          autoComplete={type === "password" ? "current-password" : "off"}
          autoCapitalize={mono ? "characters" : "none"}
        />
        {showToggle && (
          <button onClick={() => setShow(p => !p)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: T.txD, cursor: "pointer", display: "flex", padding: 4 }}>
            {show ? I.eye : eyeOff}
          </button>
        )}
      </div>
      {note && <p style={{ fontSize: 11, color: T.txD, margin: "6px 0 0", lineHeight: 1.5 }}>{note}</p>}
    </div>
  );
}

function ProgressBar({ current, total }) {
  return (
    <div style={{ display: "flex", gap: 4, padding: "8px 24px 6px" }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{
          flex: 1, height: 3, borderRadius: 2,
          background: i <= current ? T.accent : T.bd,
          transition: "background .3s ease",
        }} />
      ))}
    </div>
  );
}

function SetupHeader({ showBack, onBack, progress }) {
  return (
    <div style={{ paddingTop: "env(safe-area-inset-top)", background: T.bg2, borderBottom: `1px solid ${T.bd}`, flexShrink: 0 }}>
      <div style={{ height: 46, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", padding: "0 12px" }}>
        {showBack && (
          <button onClick={onBack} style={{ position: "absolute", left: 12, background: "none", border: "none", color: T.txD, cursor: "pointer", display: "flex", padding: 4 }}>
            {I.back}
          </button>
        )}
        <span style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>ScienceTokyo App</span>
      </div>
      {progress && <ProgressBar current={progress.current} total={progress.total} />}
    </div>
  );
}

function StepLabel({ n, total = 3 }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", padding: "4px 10px",
      borderRadius: 6, background: `${T.accent}14`, color: T.accent,
      fontSize: 11, fontWeight: 600, marginBottom: 10,
    }}>STEP {n}/{total}</div>
  );
}

function DoneBanner() {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, marginTop: 12,
      padding: "10px 14px", borderRadius: 10, background: `${T.green}12`,
      color: T.green, fontSize: 13, fontWeight: 500,
    }}>{ICN.chk} 入力完了</div>
  );
}

function Badge({ ok, label }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
      background: ok ? `${T.green}14` : `${T.txD}14`,
      color: ok ? T.green : T.txD,
    }}>{label}</span>
  );
}

function ErrorBanner({ error }) {
  if (!error) return null;
  return (
    <div style={{ padding: "10px 14px", borderRadius: 10, background: `${T.red}18`, color: T.red, fontSize: 13, marginBottom: 16 }}>{error}</div>
  );
}

/* ================================================================
   SetupView
   mode=null  → Welcome（新規登録 or ログイン を選択）
   mode="login"  → ログイン（ISCT資格情報のみ）
   mode="signup" → 新規登録ウィザード（step 0〜2）
   ================================================================ */
export const SetupView = ({ onComplete, onSkip, onDemo, mob }) => {
  const [mode, setMode] = useState(null);
  const [step, setStep] = useState(0);
  const [connecting, setConnecting] = useState(false);

  const [isctId, setIsctId] = useState("");
  const [isctPw, setIsctPw] = useState("");
  const [totpSecret, setTotpSecret] = useState("");

  const [portalId, setPortalId] = useState("");
  const [portalPw, setPortalPw] = useState("");
  const [matrix, setMatrix] = useState({});

  const [yearGroup, setYearGroup] = useState(null);
  const [showYG, setShowYG] = useState(false);
  const [error, setError] = useState(null);

  const hasIsct = isctId && isctPw && totpSecret;
  const hasMatrix = COLS.every(c => ROWS.every(r => matrix[c]?.[r]));
  const hasPortal = portalId && portalPw && hasMatrix;
  const hasAny = hasIsct || hasPortal;

  const goBack = () => {
    setError(null);
    if (mode === "login") { setMode(null); return; }
    if (mode === "signup" && step === 0) { setMode(null); return; }
    if (mode === "signup") { setStep(s => s - 1); }
  };
  const nextStep = () => { setError(null); setStep(s => s + 1); };

  const handleSubmit = async () => {
    if (!hasIsct && !hasPortal) {
      setError("いずれかの認証情報を入力してください");
      return;
    }
    if (isctId === "test" && isctPw === "test" && totpSecret === "TEST") {
      if (yearGroup) updateUserPref({ yearGroup });
      onDemo();
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const body = {};
      if (hasIsct) { body.userId = isctId; body.password = isctPw; body.totpSecret = totpSecret; }
      if (hasPortal) { body.portalUserId = portalId; body.portalPassword = portalPw; body.matrix = matrix; }
      const resp = await fetch(`${API}/api/auth/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || data.error);
      if (yearGroup) updateUserPref({ yearGroup });
      onComplete();
    } catch (err) {
      setError(err.message);
      setConnecting(false);
    }
  };

  /* ── inline style helpers ── */
  const bodyStyle = {
    padding: mob ? "24px 24px 40px" : "40px",
    maxWidth: 440, width: "100%", margin: "0 auto", boxSizing: "border-box",
  };
  const cardStyle = {
    display: "flex", flexDirection: "column", gap: 14,
    padding: 14, borderRadius: 12, border: `1px solid ${T.bd}`, background: T.bg2,
  };
  const primaryBtnStyle = (active) => ({
    width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
    background: active ? T.accent : `${T.accent}40`,
    color: "#fff", fontSize: 15, fontWeight: 700,
    cursor: active ? "pointer" : "default", transition: "opacity .15s",
  });
  const mutedBtnStyle = {
    width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
    background: T.bg3, color: T.txD, fontSize: 15, fontWeight: 700, cursor: "pointer",
  };

  const showBack = mode === "login" || mode === "signup";
  const progress = mode === "signup" ? { current: step, total: 3 } : null;

  /* ─────────── Connecting overlay ─────────── */
  if (connecting) {
    return (
      <div style={PAGE}>
        <SetupHeader onBack={goBack} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <div style={{ width: 48, height: 48, border: `3px solid ${T.bd}`, borderTop: `3px solid ${T.accent}`, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
            <p style={{ color: T.txH, fontSize: 15, fontWeight: 600, margin: 0 }}>接続中...</p>
            <p style={{ color: T.txD, fontSize: 13, margin: 0, textAlign: "center", lineHeight: 1.6 }}>
              {hasIsct ? "ISCT SSO認証を実行しています" : "認証情報を保存しています"}
              <br />初回は30秒ほどかかります
            </p>
            {error && <div style={{ padding: "10px 14px", borderRadius: 10, background: `${T.red}18`, color: T.red, fontSize: 13, width: "100%", maxWidth: 300, textAlign: "center" }}>{error}</div>}
          </div>
        </div>
        <div style={{ paddingBottom: "env(safe-area-inset-bottom)", background: T.bg, flexShrink: 0 }} />
        <style>{GLOBAL_CSS}</style>
      </div>
    );
  }

  /* ─────────── Main render ─────────── */
  return (
    <div style={PAGE}>
      <SetupHeader showBack={showBack} onBack={goBack} progress={progress} />

      {/* ═══ Welcome ═══ */}
      {mode === null && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: mob ? "20px 24px" : "40px" }}>
          <div style={{ maxWidth: 400, width: "100%", textAlign: "center" }}>
            <div style={{
              width: 72, height: 72, borderRadius: 20,
              background: `linear-gradient(135deg, ${T.accent}, ${T.accentSoft})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 20px", boxShadow: `0 8px 24px ${T.accent}30`,
            }}>{ICN.cap}</div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: T.txH, margin: "0 0 8px" }}>ScienceTokyo App</h1>
            <p style={{ fontSize: 14, color: T.txD, margin: "0 0 28px", lineHeight: 1.6 }}>LMS・教務Webと連携して<br />大学生活をもっと便利に</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 32 }}>
              {FEATURES.map((f, i) => (
                <div key={i} style={{ padding: "16px 12px", borderRadius: 12, border: `1px solid ${T.bd}`, background: T.bg2, textAlign: "center" }}>
                  <div style={{ color: f.color, marginBottom: 8, display: "flex", justifyContent: "center" }}>{f.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.txH }}>{f.title}</div>
                  <div style={{ fontSize: 11, color: T.txD, marginTop: 2 }}>{f.desc}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button onClick={() => { setMode("signup"); setStep(0); setError(null); }} style={{
                width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
                background: T.accent, color: "#fff", fontSize: 15, fontWeight: 700,
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}>{ICN.signup} 新規登録</button>
              <button onClick={() => { setMode("login"); setError(null); }} style={{
                width: "100%", padding: "14px 0", borderRadius: 12,
                border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH,
                fontSize: 15, fontWeight: 700, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}>{ICN.login} ログイン</button>
            </div>
            <button onClick={onSkip} style={{
              background: "none", border: "none", color: T.txD, fontSize: 13,
              cursor: "pointer", marginTop: 16, textAlign: "center", padding: 8, width: "100%",
            }}>スキップ（デモモードで表示）</button>
          </div>
        </div>
      )}

      {/* ═══ ログイン ═══ */}
      {mode === "login" && (
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          <div style={bodyStyle}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: T.txH, margin: "0 0 6px" }}>ログイン</h2>
            <p style={{ fontSize: 13, color: T.txD, margin: "0 0 20px", lineHeight: 1.5 }}>ISCT LMSのアカウントでログインします</p>
            <ErrorBanner error={error} />
            <div style={cardStyle}>
              <InputField label="Science Tokyo ID" value={isctId} onChange={e => setIsctId(e.target.value)} placeholder="abcd1234" />
              <InputField label="パスワード" value={isctPw} onChange={e => setIsctPw(e.target.value)} placeholder="ISCTのパスワード" type="password" showToggle />
              <InputField label="TOTPシークレットキー" value={totpSecret} onChange={e => setTotpSecret(e.target.value.replace(/\s/g, "").toUpperCase())} placeholder="TT5SOVTA4BFN4IND" mono note="2段階認証アプリ設定時に表示されたキー" />
            </div>
            <div style={{ marginTop: 24 }}>
              <button onClick={handleSubmit} disabled={!hasIsct} style={primaryBtnStyle(hasIsct)}>ログイン</button>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 14 }}>
              <span style={{ color: T.txD, display: "flex" }}>{ICN.lock}</span>
              <p style={{ fontSize: 11, color: T.txD, lineHeight: 1.6 }}>認証情報はAES-256-GCMで暗号化して保存されます</p>
            </div>
            <div style={{ textAlign: "center", marginTop: 20 }}>
              <span style={{ fontSize: 13, color: T.txD }}>アカウントをお持ちでない方は</span>
              <button onClick={() => { setMode("signup"); setStep(0); setError(null); }} style={{ background: "none", border: "none", color: T.accent, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: "0 4px" }}>新規登録</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 新規登録 Step 0 : ISCT LMS ═══ */}
      {mode === "signup" && step === 0 && (
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          <div style={bodyStyle}>
            <StepLabel n={1} />
            <h2 style={{ fontSize: 20, fontWeight: 700, color: T.txH, margin: "0 0 6px" }}>ISCT LMS</h2>
            <p style={{ fontSize: 13, color: T.txD, margin: "0 0 20px", lineHeight: 1.5 }}>時間割・課題・教材の自動取得に必要です</p>
            <ErrorBanner error={error} />
            <div style={cardStyle}>
              <InputField label="Science Tokyo ID" value={isctId} onChange={e => setIsctId(e.target.value)} placeholder="abcd1234" />
              <InputField label="パスワード" value={isctPw} onChange={e => setIsctPw(e.target.value)} placeholder="ISCTのパスワード" type="password" showToggle />
              <InputField label="TOTPシークレットキー" value={totpSecret} onChange={e => setTotpSecret(e.target.value.replace(/\s/g, "").toUpperCase())} placeholder="TT5SOVTA4BFN4IND" mono note="2段階認証アプリ設定時に表示されたキー" />
            </div>
            {hasIsct && <DoneBanner />}
            <div style={{ marginTop: 24 }}>
              <button onClick={nextStep} style={primaryBtnStyle(true)}>{hasIsct ? "次へ" : "スキップして次へ"}</button>
            </div>
            {!hasIsct && <p style={{ fontSize: 11, color: T.txD, textAlign: "center", marginTop: 10 }}>あとから設定することもできます</p>}
          </div>
        </div>
      )}

      {/* ═══ 新規登録 Step 1 : Titech Portal ═══ */}
      {mode === "signup" && step === 1 && (
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          <div style={bodyStyle}>
            <StepLabel n={2} />
            <h2 style={{ fontSize: 20, fontWeight: 700, color: T.txH, margin: "0 0 6px" }}>Titech Portal</h2>
            <p style={{ fontSize: 13, color: T.txD, margin: "0 0 20px", lineHeight: 1.5 }}>成績情報の取得に必要です</p>
            <ErrorBanner error={error} />
            <div style={cardStyle}>
              <InputField label="ポータル アカウント" value={portalId} onChange={e => setPortalId(e.target.value)} placeholder="学籍番号" />
              <InputField label="ポータル パスワード" value={portalPw} onChange={e => setPortalPw(e.target.value)} placeholder="ポータルのパスワード" type="password" showToggle />
              <MatrixInput matrix={matrix} setMatrix={setMatrix} />
            </div>
            {hasPortal && <DoneBanner />}
            <div style={{ marginTop: 24 }}>
              <button onClick={nextStep} style={primaryBtnStyle(true)}>{hasPortal ? "次へ" : "スキップして次へ"}</button>
            </div>
            {!hasPortal && <p style={{ fontSize: 11, color: T.txD, textAlign: "center", marginTop: 10 }}>あとから設定することもできます</p>}
          </div>
        </div>
      )}

      {/* ═══ 新規登録 Step 2 : Profile & Confirm ═══ */}
      {mode === "signup" && step === 2 && (
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          <div style={bodyStyle}>
            <StepLabel n={3} />
            <h2 style={{ fontSize: 20, fontWeight: 700, color: T.txH, margin: "0 0 6px" }}>プロフィール</h2>
            <p style={{ fontSize: 13, color: T.txD, margin: "0 0 20px", lineHeight: 1.5 }}>学年情報を設定してください</p>
            <ErrorBanner error={error} />
            {/* Year group */}
            <div style={{ padding: 14, borderRadius: 12, border: `1px solid ${T.bd}`, background: T.bg2 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.txD, marginBottom: 8, display: "block" }}>学年グループ</label>
              <div onClick={() => setShowYG(p => !p)} style={{
                padding: "12px 14px", borderRadius: 10, border: `1px solid ${T.bd}`,
                background: T.bg3, cursor: "pointer", display: "flex",
                justifyContent: "space-between", alignItems: "center",
              }}>
                <span style={{ fontSize: 15, color: yearGroup ? T.txH : T.txD }}>{yearGroup || "選択してください"}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.txD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showYG ? "rotate(180deg)" : "none", transition: "transform .15s" }}><polyline points="6 9 12 15 18 9" /></svg>
              </div>
              {showYG && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: T.txD, marginBottom: 6, fontWeight: 500 }}>入学年度</div>
                  <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                    {["22", "23", "24", "25", "26"].map(y => {
                      const sel = yearGroup && yearGroup.slice(0, -1) === y;
                      return (
                        <button key={y} onClick={() => { const t = yearGroup ? yearGroup.slice(-1) : "B"; setYearGroup(sel ? null : y + t); }} style={{
                          flex: 1, padding: "10px 0", borderRadius: 8,
                          border: `1px solid ${sel ? T.accent : T.bd}`,
                          background: sel ? `${T.accent}18` : "transparent",
                          color: sel ? T.accent : T.txD,
                          fontSize: 15, fontWeight: sel ? 700 : 500,
                          cursor: "pointer", transition: "all .15s",
                        }}>{y}</button>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 11, color: T.txD, marginBottom: 6, fontWeight: 500 }}>課程</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[["B", "学部"], ["M", "修士"], ["D", "博士"], ["R", "研究生"]].map(([k, l]) => {
                      const sel = yearGroup && yearGroup.endsWith(k);
                      return (
                        <button key={k} onClick={() => { if (!yearGroup) return; setYearGroup(yearGroup.slice(0, -1) + k); }} style={{
                          flex: 1, padding: "8px 0", borderRadius: 8,
                          border: `1px solid ${sel ? T.accent : T.bd}`,
                          background: sel ? `${T.accent}18` : "transparent",
                          color: sel ? T.accent : T.txD,
                          fontSize: 13, fontWeight: sel ? 700 : 500,
                          cursor: yearGroup ? "pointer" : "default",
                          opacity: yearGroup ? 1 : .4, transition: "all .15s",
                        }}>{l}</button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            {/* Connection summary */}
            <div style={{ marginTop: 16, padding: 14, borderRadius: 12, border: `1px solid ${T.bd}`, background: T.bg2 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.txD, marginBottom: 10 }}>接続設定</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, color: T.txH }}>ISCT LMS</span>
                  <Badge ok={hasIsct} label={hasIsct ? "設定済み" : "未設定"} />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, color: T.txH }}>Titech Portal</span>
                  <Badge ok={hasPortal} label={hasPortal ? "設定済み" : "未設定"} />
                </div>
              </div>
            </div>
            <div style={{ marginTop: 24 }}>
              <button onClick={handleSubmit} style={hasAny ? primaryBtnStyle(true) : mutedBtnStyle}>
                {hasAny ? "登録して接続する" : "デモモードで始める"}
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 12 }}>
              <span style={{ color: T.txD, display: "flex" }}>{ICN.lock}</span>
              <p style={{ fontSize: 11, color: T.txD, lineHeight: 1.6 }}>認証情報はAES-256-GCMで暗号化して保存されます</p>
            </div>
          </div>
        </div>
      )}

      <div style={{ paddingBottom: "env(safe-area-inset-bottom)", background: T.bg, flexShrink: 0 }} />
      <style>{GLOBAL_CSS}</style>
    </div>
  );
};
