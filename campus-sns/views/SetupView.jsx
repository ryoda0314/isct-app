import { useState, useEffect } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { updateUserPref } from "../hooks/useCurrentUser.js";
import { MatrixInput, COLS, ROWS } from "../components/MatrixInput.jsx";
import { SCHOOLS, DEPTS, UNIT_COL } from "../data.js";
import { QRScanner } from "../components/QRScanner.jsx";
import { PrivacyPolicyView } from "./PrivacyPolicyView.jsx";
import { TermsOfServiceView } from "./TermsOfServiceView.jsx";

const API = "";

/* ─── 学籍番号パーサー ─── */
// 新形式: "24B00001" → { year:"24", degree:"B", schoolNum:"0", yearGroup:"24B", schoolKey:"science" }
// 旧医歯学系(〜23年度): "11220001" → 8桁数字, 先頭2桁が学科コード, 3-4桁目が入学年度
const DEGREE_MAP = { B: "学部", M: "修士", D: "博士", R: "研究生" };
const SCHOOL_NUM_MAP = {
  "0": "science",       // 理学院
  "1": "engineering",   // 工学院
  "2": "matsci",        // 物質理工学院
  "3": "computing",     // 情報理工学院
  "4": "lifesci",       // 生命理工学院
  "5": "envsoc",        // 環境・社会理工学院
  "6": "medicine",      // 医学部
  "7": "dentistry",     // 歯学部
};
const SCHOOL_LABEL = {
  science: "理学院", engineering: "工学院", matsci: "物質理工学院",
  computing: "情報理工学院", lifesci: "生命理工学院", envsoc: "環境・社会理工学院",
  medicine: "医学部", dentistry: "歯学部",
};
// 旧医歯学系の学科コード → { schoolKey, deptKey }
const MED_LEGACY_MAP = {
  "11": { schoolKey: "medicine",  deptKey: "MED_M" }, // 医学科
  "21": { schoolKey: "medicine",  deptKey: "MED_N" }, // 保健衛生学科 看護学専攻
  "22": { schoolKey: "medicine",  deptKey: "MED_T" }, // 保健衛生学科 検査技術学専攻
  "31": { schoolKey: "dentistry", deptKey: "DEN_D" }, // 歯学科
  "32": { schoolKey: "dentistry", deptKey: "DEN_H" }, // 口腔保健学科 口腔保健衛生学専攻
  "39": { schoolKey: "dentistry", deptKey: "DEN_E" }, // 口腔保健学科 口腔保健工学専攻
};
function parseStudentId(id) {
  if (!id || id.length < 4) return null;
  // 新形式: ○○[BMDR]○○○○○ (例: 24B00001, 25M60001)
  const m = id.match(/^(\d{2})([BMDR])(\d)/i);
  if (m) {
    const year = m[1];
    const degree = m[2].toUpperCase();
    const schoolNum = m[3];
    const schoolKey = SCHOOL_NUM_MAP[schoolNum] || null;
    return { year, degree, schoolNum, yearGroup: year + degree, schoolKey, schoolLabel: schoolKey ? SCHOOL_LABEL[schoolKey] : null, deptKey: null, isMedDental: schoolNum >= "6" };
  }
  // 旧医歯学系形式: 8桁数字 (例: 11220001 → 医学科, 22年入学)
  const mLegacy = id.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (mLegacy) {
    const deptCode = mLegacy[1];
    const legacy = MED_LEGACY_MAP[deptCode];
    if (legacy) {
      const year = mLegacy[2];
      return { year, degree: "B", schoolNum: null, yearGroup: year + "B", schoolKey: legacy.schoolKey, schoolLabel: SCHOOL_LABEL[legacy.schoolKey], deptKey: legacy.deptKey, isMedDental: true };
    }
  }
  return null;
}

const PAGE_BASE = {
  position: "fixed", inset: 0, display: "flex", flexDirection: "column",
  fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,'Hiragino Sans','Segoe UI',sans-serif",
  zIndex: 9999,
};
const mkGlobalCSS = () => `@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}*{box-sizing:border-box;margin:0;padding:0}html,body{background:${T.bg};overscroll-behavior:none;-webkit-tap-highlight-color:transparent}input,textarea{font-size:16px}::placeholder{color:${T.txD}}button,input,textarea,select{font-family:inherit;-webkit-appearance:none}`;

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

/**
 * TotpBlock — TOTP secret input + QR scanner + live 6-digit code preview
 */
function TotpBlock({ totpSecret, setTotpSecret, showQR, setShowQR }) {
  const [totpCode, setTotpCode] = useState(null);
  const [timeLeft, setTimeLeft] = useState(30);

  // Fetch TOTP code from API, then countdown locally
  useEffect(() => {
    if (!totpSecret || totpSecret.length < 6) { setTotpCode(null); return; }
    let cancelled = false;
    const fetchCode = async () => {
      try {
        const res = await fetch('/api/auth/totp-preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret: totpSecret }) });
        if (!res.ok) { setTotpCode(null); return; }
        const { code, remaining } = await res.json();
        if (!cancelled) { setTotpCode(code); setTimeLeft(remaining); }
      } catch { if (!cancelled) setTotpCode(null); }
    };
    fetchCode();
    // Re-fetch every 30s to get new code
    const iv = setInterval(fetchCode, 30000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [totpSecret]);

  // Client-side 1s countdown + re-fetch when expired
  useEffect(() => {
    if (!totpCode) return;
    const iv = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // Refetch new code
          fetch('/api/auth/totp-preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret: totpSecret }) })
            .then(r => r.json())
            .then(({ code, remaining }) => { setTotpCode(code); setTimeLeft(remaining); })
            .catch(() => {});
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [totpCode, totpSecret]);

  const [showGuide, setShowGuide] = useState(true);
  const [zoomImg, setZoomImg] = useState(null);

  const guideSteps = [
    { n: 1, text: "ISCTアカウントページにログインし、「多要素認証 (OTP)」タブを開く", img: "/guide/step1.png", top: 0, h: 109, zoom: "192%", ml: "-61%" },
    { n: 2, text: "「アプリ認証」の横にある「設定」ボタンを押す", img: "/guide/step2.png", top: -2, h: 99, zoom: "185%", ml: "-50%" },
    { n: 3, text: "表示されるQRコードをこのアプリでスキャン。表示された6桁コードをISCTの「トークン」欄に入力して完了", img: "/guide/step3.png", top: -43, h: 185, zoom: "180%", ml: "-40%" },
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: T.txD }}>TOTP認証</label>
        {!totpSecret && (
          <button onClick={() => setShowGuide(p => !p)} style={{
            background: "none", border: "none", color: T.accent,
            fontSize: 11, fontWeight: 600, cursor: "pointer", padding: 0,
            display: "flex", alignItems: "center", gap: 3,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            {showGuide ? "閉じる" : "やり方"}
          </button>
        )}
      </div>
      {/* Setup guide */}
      {showGuide && !totpSecret && (
        <div style={{
          marginBottom: 10, padding: 12, borderRadius: 10,
          border: `1px solid ${T.accent}20`, background: `${T.accent}06`,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.txH, marginBottom: 8 }}>QRコードの取得方法</div>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 10px", borderRadius: 8, marginBottom: 10,
            background: `${T.accent}14`, border: `1px solid ${T.accent}30`,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
            <span style={{ fontSize: 11, color: T.accent, fontWeight: 600, lineHeight: 1.5 }}>
              PCでISCTアカウントページを開いて操作してください
            </span>
          </div>
          {guideSteps.map(s => (
            <div key={s.n} style={{ marginBottom: s.n < 3 ? 12 : 0 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <div style={{
                  width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                  background: T.accent, color: "#fff", fontSize: 11, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1,
                }}>{s.n}</div>
                <p style={{ fontSize: 12, color: T.tx, lineHeight: 1.6, margin: 0 }}>{s.text}</p>
              </div>
              <div onClick={() => setZoomImg(s.img)} style={{
                overflow: "hidden", borderRadius: 8,
                border: `1px solid ${T.bd}`, background: "#fff",
                height: s.h, marginLeft: 28, cursor: "pointer",
                position: "relative",
              }}>
                <img src={s.img} alt={`Step ${s.n}`} style={{
                  width: s.zoom, display: "block",
                  marginLeft: s.ml,
                  marginTop: s.top,
                }} />
                <div style={{
                  position: "absolute", bottom: 4, right: 4, padding: "2px 6px",
                  borderRadius: 4, background: "rgba(0,0,0,0.5)", color: "#fff",
                  fontSize: 9, display: "flex", alignItems: "center", gap: 3,
                }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                  拡大
                </div>
              </div>
            </div>
          ))}
          <div style={{
            marginTop: 10, padding: "8px 10px", borderRadius: 8,
            background: `${T.orange}12`, border: `1px solid ${T.orange}25`,
            fontSize: 11, color: T.orange, lineHeight: 1.5,
          }}>
            ISCTの「トークン」欄には、スキャン後にこのアプリに表示される6桁のコードを入力してください
          </div>
        </div>
      )}
      {!totpSecret && !showQR && (
        <button onClick={() => setShowQR(true)} style={{
          width: "100%", padding: "12px 0", borderRadius: 8,
          border: `1px solid ${T.accent}40`, background: `${T.accent}08`,
          color: T.accent, fontSize: 13, fontWeight: 600, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
          </svg>
          QRコードをスキャンして設定
        </button>
      )}
      {showQR && (
        <QRScanner
          onSecret={(secret) => { setTotpSecret(secret); setShowQR(false); }}
          onClose={() => setShowQR(false)}
        />
      )}
      {/* Live TOTP code preview */}
      {totpCode && (
        <div style={{
          marginTop: 10, padding: "12px 14px", borderRadius: 10,
          background: `${T.green}12`, border: `1px solid ${T.green}30`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 11, color: T.green, fontWeight: 600, marginBottom: 4 }}>現在のTOTPコード</div>
            <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "monospace", letterSpacing: 4, color: T.txH }}>
              {totpCode.slice(0, 3)} {totpCode.slice(3)}
            </div>
          </div>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            border: `3px solid ${T.bd}`, borderTopColor: timeLeft > 5 ? T.green : T.red,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, color: timeLeft > 5 ? T.green : T.red,
          }}>{timeLeft}</div>
        </div>
      )}
      {totpSecret && !showQR && (
        <button onClick={() => setShowQR(true)} style={{
          width: "100%", marginTop: 6, padding: "6px 0",
          background: "none", border: "none", color: T.txD,
          fontSize: 11, cursor: "pointer",
        }}>QRコードを再スキャン</button>
      )}
      {/* Lightbox */}
      {zoomImg && (
        <div onClick={() => setZoomImg(null)} style={{
          position: "fixed", inset: 0, zIndex: 10000,
          background: "rgba(0,0,0,0.85)",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          cursor: "pointer", padding: 16,
          animation: "fadeIn .15s ease",
        }}>
          <img src={zoomImg} alt="拡大表示" style={{
            maxWidth: "100%", maxHeight: "85vh",
            borderRadius: 8, objectFit: "contain",
          }} />
          <div style={{
            marginTop: 12, color: "rgba(255,255,255,0.6)",
            fontSize: 12,
          }}>タップして閉じる</div>
        </div>
      )}
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
export const SetupView = ({ onComplete, onSkip, personas, mob, onBackToBoard, backLabel }) => {
  const [mode, setMode] = useState(null);
  const [showPersonaPicker, setShowPersonaPicker] = useState(false);
  const [step, setStep] = useState(0);
  const [connecting, setConnecting] = useState(false);
  const [connectingMsg, setConnectingMsg] = useState("");
  const [isctValidated, setIsctValidated] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(() => {
    try { return localStorage.getItem("privacyAgreed") === "true"; } catch { return false; }
  });
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const [isctId, setIsctId] = useState("");
  const [isctPw, setIsctPw] = useState("");
  const [totpSecret, setTotpSecret] = useState("");

  const [portalId, setPortalId] = useState("");
  const [portalPw, setPortalPw] = useState("");
  const [matrix, setMatrix] = useState({});

  const [emailLogin, setEmailLogin] = useState("");
  const [emailPw, setEmailPw] = useState("");
  const [loginTab, setLoginTab] = useState("isct"); // "isct" | "email"

  const [yearGroup, setYearGroup] = useState(null);
  const [school, setSchool] = useState(null);
  const [showYG, setShowYG] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [error, setError] = useState(null);

  // Step 3: 学系・ユニット
  const [setupDeptSchool, setSetupDeptSchool] = useState(null);
  const [setupDept, setSetupDept] = useState(null);
  const [setupUnitNum, setSetupUnitNum] = useState("");
  const [setupTransfer, setSetupTransfer] = useState(false);

  // Registration limit
  const [regLimited, setRegLimited] = useState(false);
  const [regLimitMsg, setRegLimitMsg] = useState("");
  useEffect(() => {
    fetch(`${API}/api/settings`).then(r => r.json()).then(d => {
      const rl = d.registration_limit;
      if (rl?.closed) { setRegLimited(true); setRegLimitMsg(rl.message || ""); }
    }).catch(() => {});
  }, []);

  // Step 4: メール認証
  const [setupEmail, setSetupEmail] = useState("");
  const [setupEmailPw, setSetupEmailPw] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [emailPending, setEmailPending] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);

  // 医歯学系用: 学籍番号 + 学部学科選択
  const [medStudentId, setMedStudentId] = useState("");
  const [isMedRoute, setIsMedRoute] = useState(false);
  const [medFaculty, setMedFaculty] = useState(null);  // "medicine" | "dentistry"
  const [medDept, setMedDept] = useState(null);         // DEPTS key (e.g. "MED_M")

  // 学籍番号から学年・課程・学院/学部を自動抽出
  useEffect(() => {
    if (isMedRoute) {
      // 医歯学系: 学部・学科は手動選択、年度のみ学籍番号から推定
      const parsed = parseStudentId(medStudentId);
      if (parsed) setYearGroup(parsed.yearGroup);
    } else {
      const parsed = parseStudentId(portalId);
      if (parsed) {
        setYearGroup(parsed.yearGroup);
        setSchool(parsed.schoolKey);
        if (parsed.schoolKey) setSetupDeptSchool(parsed.schoolKey);
      }
    }
  }, [portalId, medStudentId, isMedRoute]);

  // 医歯学系: 手動選択した学部をschool/deptに反映
  useEffect(() => {
    if (isMedRoute && medFaculty) {
      setSchool(medFaculty);
      setSetupDeptSchool(medFaculty);
    }
  }, [medFaculty, isMedRoute]);
  useEffect(() => {
    if (isMedRoute && medDept) setSetupDept(medDept);
  }, [medDept, isMedRoute]);

  const hasIsct = isctId && isctPw && totpSecret;
  const hasMatrix = COLS.every(c => ROWS.every(r => matrix[c]?.[r]));
  const hasPortal = portalId && portalPw && hasMatrix;
  const hasMedId = isMedRoute && medStudentId && medFaculty && medDept;
  const hasAny = hasIsct || hasPortal || hasMedId;

  const goBack = () => {
    setError(null);
    if (mode === "login") { setMode(null); setLoginTab("isct"); return; }
    if (mode === "signup" && step === 0) { setMode(null); return; }
    if (mode === "signup" && step >= 3) return; // 完了後の画面からは戻れない
    if (mode === "signup") { setStep(s => s - 1); }
  };
  const nextStep = async () => {
    setError(null);

    // Step 0: validate ISCT credentials via SSO
    if (step === 0 && hasIsct) {
      setConnecting(true);
      setConnectingMsg("ISCT SSO認証を確認中...\n初回は30秒ほどかかります");
      try {
        const resp = await fetch(`${API}/api/auth/validate/isct`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: isctId, password: isctPw, totpSecret }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || "ISCT認証に失敗しました");
        setIsctValidated(true);
      } catch (err) {
        setError(err.message);
        setConnecting(false);
        setConnectingMsg("");
        return;
      }
      setConnecting(false);
      setConnectingMsg("");
    }

    // Step 1: validate Portal credentials
    if (step === 1 && hasPortal) {
      setConnecting(true);
      setConnectingMsg("ポータル認証を確認中...\n30秒ほどかかります");
      try {
        const resp = await fetch(`${API}/api/auth/validate/portal`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ portalUserId: portalId, portalPassword: portalPw, matrix }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || "ポータル認証に失敗しました");
      } catch (err) {
        setError(err.message);
        setConnecting(false);
        setConnectingMsg("");
        return;
      }
      setConnecting(false);
      setConnectingMsg("");
    }

    setStep(s => s + 1);
  };

  const handleSubmit = async () => {
    if (!hasIsct && !hasPortal && !hasMedId) {
      setError("いずれかの認証情報を入力してください");
      return;
    }
    setConnecting(true);
    setConnectingMsg(isctValidated ? "設定を保存中..." : "");
    setError(null);
    try {
      const body = {};
      // ISCT: if already validated in Step 0, mark as pre-validated to skip SSO
      if (hasIsct) {
        body.userId = isctId;
        body.password = isctPw;
        body.totpSecret = totpSecret;
        if (isctValidated) body.isctValidated = true;
      }
      if (hasPortal) { body.portalUserId = portalId; body.portalPassword = portalPw; body.matrix = matrix; }
      // 医歯学系: 学籍番号のみ
      if (hasMedId) body.studentId = medStudentId;
      const resp = await fetch(`${API}/api/auth/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || data.error);
      if (yearGroup) updateUserPref({ yearGroup, ...(school ? { school } : {}) });
      // Show post-registration guidance instead of going directly to main app
      setStep(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setConnecting(false);
      setConnectingMsg("");
    }
  };

  const handleEmailLogin = async () => {
    if (!emailLogin || !emailPw) { setError("メールアドレスとパスワードを入力してください"); return; }
    setConnecting(true);
    setError(null);
    try {
      const resp = await fetch(`${API}/api/auth/email/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailLogin, password: emailPw }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "ログインに失敗しました");
      await onComplete();
    } catch (err) {
      setError(err.message);
    } finally {
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

  const showBack = mode === "login" || (mode === "signup" && step < 3);
  const progress = mode === "signup" ? { current: step, total: 5 } : null;

  /* ─────────── Connecting overlay ─────────── */
  if (connecting) {
    return (
      <div style={{...PAGE_BASE, background: T.bg, color: T.tx}}>
        <SetupHeader onBack={goBack} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <div style={{ width: 48, height: 48, border: `3px solid ${T.bd}`, borderTop: `3px solid ${T.accent}`, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
            <p style={{ color: T.txH, fontSize: 15, fontWeight: 600, margin: 0 }}>接続中...</p>
            <p style={{ color: T.txD, fontSize: 13, margin: 0, textAlign: "center", lineHeight: 1.6, whiteSpace: "pre-line" }}>
              {connectingMsg || (loginTab === "email" ? "メールアドレスで認証中..." : hasIsct ? "ISCT SSO認証を実行しています\n初回は30秒ほどかかります" : "認証情報を保存しています")}
            </p>
            {error && <div style={{ padding: "10px 14px", borderRadius: 10, background: `${T.red}18`, color: T.red, fontSize: 13, width: "100%", maxWidth: 300, textAlign: "center" }}>{error}</div>}
          </div>
        </div>
        <div style={{ paddingBottom: "env(safe-area-inset-bottom)", background: T.bg, flexShrink: 0 }} />
        <style>{mkGlobalCSS()}</style>
      </div>
    );
  }

  /* ─────────── Main render ─────────── */
  return (
    <div style={{...PAGE_BASE, background: T.bg, color: T.tx}}>
      <SetupHeader showBack={showBack} onBack={goBack} progress={progress} />

      {/* ═══ Welcome ═══ */}
      {mode === null && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: mob ? "12px 24px" : "40px", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          <div style={{ maxWidth: 400, width: "100%", textAlign: "center", margin: "auto 0" }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16,
              background: `linear-gradient(135deg, ${T.accent}, ${T.accentSoft})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 12px", boxShadow: `0 6px 20px ${T.accent}30`,
            }}><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg></div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: T.txH, margin: "0 0 4px" }}>ScienceTokyo App</h1>
            <p style={{ fontSize: 13, color: T.txD, margin: "0 0 16px", lineHeight: 1.5 }}>LMS・教務Webと連携して<br />大学生活をもっと便利に</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              {FEATURES.map((f, i) => (
                <div key={i} style={{ padding: "10px 8px", borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg2, textAlign: "center" }}>
                  <div style={{ color: f.color, marginBottom: 4, display: "flex", justifyContent: "center" }}>{f.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.txH }}>{f.title}</div>
                  <div style={{ fontSize: 10, color: T.txD, marginTop: 1 }}>{f.desc}</div>
                </div>
              ))}
            </div>
            {/* ── 同意チェックボックス ── */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
              borderRadius: 10, border: `1px solid ${privacyAgreed ? T.green + "40" : T.bd}`,
              background: privacyAgreed ? `${T.green}06` : T.bg2, marginBottom: 10,
              cursor: "pointer", transition: "all .15s",
            }} onClick={() => { setPrivacyAgreed(p => { const next = !p; try { localStorage.setItem("privacyAgreed", String(next)); } catch {} return next; }); }}>
              <div style={{
                width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                border: `2px solid ${privacyAgreed ? T.green : T.bd}`,
                background: privacyAgreed ? T.green : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all .15s",
              }}>
                {privacyAgreed && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
              </div>
              <div style={{ fontSize: 12, color: T.tx, lineHeight: 1.5 }}>
                <button onClick={e => { e.stopPropagation(); setShowTerms(true); }} style={{
                  background: "none", border: "none", color: T.accent, fontSize: 12,
                  fontWeight: 600, cursor: "pointer", padding: 0, textDecoration: "underline",
                }}>利用規約</button>
                ・
                <button onClick={e => { e.stopPropagation(); setShowPrivacyPolicy(true); }} style={{
                  background: "none", border: "none", color: T.accent, fontSize: 12,
                  fontWeight: 600, cursor: "pointer", padding: 0, textDecoration: "underline",
                }}>プライバシーポリシー</button>
                に同意します
              </div>
            </div>

            {/* ── テスト運用中バナー ── */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
              borderRadius: 10, border: `1px solid ${T.orange}30`,
              background: `${T.orange}06`, marginBottom: 12,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.orange} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <div style={{ fontSize: 11, color: T.txD, lineHeight: 1.5 }}>
                現在<span style={{ fontWeight: 700, color: T.orange }}>テスト運用中</span>です。不具合が発生する可能性があります。
              </div>
            </div>

            {regLimited && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
                borderRadius: 10, border: `1px solid ${T.red}30`,
                background: `${T.red}08`, marginBottom: 12,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.red} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <div style={{ fontSize: 12, color: T.txD, lineHeight: 1.5 }}>
                  {regLimitMsg || "現在、新規登録の受付人数が上限に達しています。既存ユーザーのログインは可能です。"}
                </div>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={() => { if (!privacyAgreed || regLimited) return; setMode("signup"); setStep(0); setError(null); }} style={{
                width: "100%", padding: "12px 0", borderRadius: 12, border: "none",
                background: privacyAgreed && !regLimited ? T.accent : `${T.accent}40`,
                color: "#fff", fontSize: 15, fontWeight: 700,
                cursor: privacyAgreed && !regLimited ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                transition: "background .15s", opacity: regLimited ? 0.5 : 1,
              }}>{ICN.signup} 新規登録{regLimited ? "（受付停止中）" : ""}</button>
              <button onClick={() => { if (!privacyAgreed) return; setMode("login"); setError(null); }} style={{
                width: "100%", padding: "12px 0", borderRadius: 12,
                border: `1px solid ${privacyAgreed ? T.bd : T.bd + "60"}`,
                background: privacyAgreed ? T.bg2 : `${T.bg2}80`,
                color: privacyAgreed ? T.txH : T.txD,
                fontSize: 15, fontWeight: 700,
                cursor: privacyAgreed ? "pointer" : "default",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                transition: "all .15s",
              }}>{ICN.login} ログイン</button>
              {onBackToBoard&&<button onClick={onBackToBoard} style={{
                width: "100%", padding: "10px 0", borderRadius: 10,
                border: `1px solid ${T.bd}`, background: T.bg2, color: T.txD,
                fontSize: 12, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>{backLabel||"新入生掲示板に戻る"}</button>}
            </div>
            {!privacyAgreed && <p style={{ fontSize: 11, color: T.txD, textAlign: "center", marginTop: 8 }}>利用するには利用規約・プライバシーポリシーへの同意が必要です</p>}
            <button onClick={() => setShowPersonaPicker(true)} style={{
              background: "none", border: "none", color: T.txD, fontSize: 12,
              cursor: "pointer", marginTop: 8, textAlign: "center", padding: 4, width: "100%",
            }}>スキップ（デモモードで表示）</button>
          </div>
        </div>
      )}

      {/* ═══ ペルソナ選択モーダル ═══ */}
      {showPersonaPicker && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.5)", padding: 16 }} onClick={() => setShowPersonaPicker(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 380, background: T.bg2, borderRadius: 16, border: `1px solid ${T.bd}`, overflow: "hidden", animation: "fadeIn .2s ease" }}>
            <div style={{ padding: "18px 20px 12px", borderBottom: `1px solid ${T.bd}` }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>テストユーザーを選択</div>
              <div style={{ fontSize: 12, color: T.txD, marginTop: 4 }}>学部ごとの時間割・課題を体験できます</div>
            </div>
            <div style={{ padding: "8px 12px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
              {(personas || []).map(p => (
                <button key={p.id} onClick={() => { setShowPersonaPicker(false); onSkip(p.id); }}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12, border: `1px solid ${T.bd}`, background: T.bg3, cursor: "pointer", textAlign: "left", transition: "background .15s" }}
                  onMouseEnter={e => e.currentTarget.style.background = T.bg2}
                  onMouseLeave={e => e.currentTarget.style.background = T.bg3}
                >
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: `${p.schoolCol}18`, border: `1px solid ${p.schoolCol}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{p.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: T.txH }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: p.schoolCol, fontWeight: 500, marginTop: 1 }}>{p.school} {p.dept}</div>
                    <div style={{ fontSize: 11, color: T.txD, marginTop: 1 }}>{p.year} ・ {(p.q[2] || []).length}科目履修中</div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.txD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              ))}
            </div>
            <div style={{ padding: "8px 12px 14px" }}>
              <button onClick={() => setShowPersonaPicker(false)} style={{ width: "100%", padding: "10px 0", borderRadius: 10, border: `1px solid ${T.bd}`, background: "transparent", color: T.txD, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>キャンセル</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ ログイン ═══ */}
      {mode === "login" && (
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          <div style={bodyStyle}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: T.txH, margin: "0 0 6px" }}>ログイン</h2>
            <p style={{ fontSize: 13, color: T.txD, margin: "0 0 16px", lineHeight: 1.5 }}>アカウントにログインします</p>

            {/* ── タブ切り替え ── */}
            <div style={{ display: "flex", gap: 0, marginBottom: 18, borderRadius: 10, background: T.bg3, padding: 3 }}>
              {[["isct","ISCT LMS"],["email","メールアドレス"]].map(([k,l])=>(
                <button key={k} onClick={()=>{setLoginTab(k);setError(null);}}
                  style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "none",
                    background: loginTab===k ? T.bg2 : "transparent",
                    color: loginTab===k ? T.txH : T.txD,
                    fontSize: 13, fontWeight: 600, cursor: "pointer",
                    boxShadow: loginTab===k ? "0 1px 3px rgba(0,0,0,.08)" : "none",
                    transition: "all .15s",
                  }}>{l}</button>
              ))}
            </div>

            <ErrorBanner error={error} />

            {/* ── ISCT LMS ログイン ── */}
            {loginTab === "isct" && <>
              <div style={cardStyle}>
                <InputField label="Science Tokyo ID" value={isctId} onChange={e => setIsctId(e.target.value)} placeholder="abcd1234" />
                <InputField label="パスワード" value={isctPw} onChange={e => setIsctPw(e.target.value)} placeholder="ISCTのパスワード" type="password" showToggle />
                <TotpBlock totpSecret={totpSecret} setTotpSecret={setTotpSecret} showQR={showQR} setShowQR={setShowQR} />
              </div>
              <div style={{ marginTop: 24 }}>
                <button onClick={handleSubmit} disabled={!hasIsct} style={primaryBtnStyle(hasIsct)}>ログイン</button>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 14 }}>
                <span style={{ color: T.txD, display: "flex" }}>{ICN.lock}</span>
                <p style={{ fontSize: 11, color: T.txD, lineHeight: 1.6 }}>認証情報はAES-256-GCMで暗号化して保存されます</p>
              </div>
            </>}

            {/* ── メールアドレス ログイン ── */}
            {loginTab === "email" && <>
              <div style={cardStyle}>
                <InputField label="メールアドレス" value={emailLogin} onChange={e => setEmailLogin(e.target.value)} placeholder="example@m.isct.ac.jp" type="email" />
                <InputField label="パスワード" value={emailPw} onChange={e => setEmailPw(e.target.value)} placeholder="パスワード" type="password" showToggle />
              </div>
              <div style={{ marginTop: 24 }}>
                <button onClick={handleEmailLogin} disabled={!emailLogin||!emailPw} style={primaryBtnStyle(emailLogin&&emailPw)}>ログイン</button>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 14 }}>
                <span style={{ color: T.txD, display: "flex" }}>{ICN.lock}</span>
                <p style={{ fontSize: 11, color: T.txD, lineHeight: 1.6 }}>事前にISCTアカウントでメールアドレス連携が必要です</p>
              </div>
            </>}

            <div style={{ textAlign: "center", marginTop: 20 }}>
              <span style={{ fontSize: 13, color: T.txD }}>アカウントをお持ちでない方は</span>
              <button onClick={() => { if (regLimited) return; setMode("signup"); setStep(0); setError(null); }} style={{ background: "none", border: "none", color: regLimited ? T.txD : T.accent, fontSize: 13, fontWeight: 600, cursor: regLimited ? "default" : "pointer", padding: "0 4px", opacity: regLimited ? 0.5 : 1 }}>{regLimited ? "新規登録（受付停止中）" : "新規登録"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 新規登録 Step 0 : ISCT LMS ═══ */}
      {mode === "signup" && step === 0 && (
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          <div style={bodyStyle}>
            <StepLabel n={1} total={5} />
            <h2 style={{ fontSize: 20, fontWeight: 700, color: T.txH, margin: "0 0 6px" }}>ISCT LMS</h2>
            <p style={{ fontSize: 13, color: T.txD, margin: "0 0 20px", lineHeight: 1.5 }}>時間割・課題・教材の自動取得に必要です</p>
            <ErrorBanner error={error} />
            <div style={cardStyle}>
              <InputField label="Science Tokyo ID" value={isctId} onChange={e => setIsctId(e.target.value)} placeholder="abcd1234" />
              <InputField label="パスワード" value={isctPw} onChange={e => setIsctPw(e.target.value)} placeholder="ISCTのパスワード" type="password" showToggle />
              <TotpBlock totpSecret={totpSecret} setTotpSecret={setTotpSecret} showQR={showQR} setShowQR={setShowQR} />
            </div>
            {hasIsct && <DoneBanner />}
            <div style={{ marginTop: 24 }}>
              <button onClick={nextStep} disabled={!hasIsct} style={primaryBtnStyle(hasIsct)}>次へ</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 新規登録 Step 1 : Titech Portal / 医歯学系 学籍番号 ═══ */}
      {mode === "signup" && step === 1 && (
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          <div style={bodyStyle}>
            <StepLabel n={2} total={5} />

            {/* ── ルート切り替えタブ ── */}
            <div style={{ display: "flex", gap: 0, marginBottom: 18, borderRadius: 10, background: T.bg3, padding: 3 }}>
              {[["portal","理工学系（Portal）"],["med","医歯学系"]].map(([k,l])=>(
                <button key={k} onClick={()=>{setIsMedRoute(k==="med");setError(null);}}
                  style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "none",
                    background: (isMedRoute ? "med" : "portal")===k ? T.bg2 : "transparent",
                    color: (isMedRoute ? "med" : "portal")===k ? T.txH : T.txD,
                    fontSize: 13, fontWeight: 600, cursor: "pointer",
                    boxShadow: (isMedRoute ? "med" : "portal")===k ? "0 1px 3px rgba(0,0,0,.08)" : "none",
                    transition: "all .15s",
                  }}>{l}</button>
              ))}
            </div>

            {/* ── 理工学系: Titech Portal ── */}
            {!isMedRoute && <>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: T.txH, margin: "0 0 6px" }}>Titech Portal</h2>
              <p style={{ fontSize: 13, color: T.txD, margin: "0 0 20px", lineHeight: 1.5 }}>成績情報の取得に必要です</p>
              <ErrorBanner error={error} />
              <div style={cardStyle}>
                <InputField label="ポータル アカウント" value={portalId} onChange={e => setPortalId(e.target.value)} placeholder="学籍番号（例: 24B00001）" mono />
                {(() => {
                  const p = parseStudentId(portalId);
                  return p ? (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {[`20${p.year}年入学`, DEGREE_MAP[p.degree], p.schoolLabel].filter(Boolean).map(t => (
                        <span key={t} style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: `${T.green}14`, color: T.green }}>{t}</span>
                      ))}
                    </div>
                  ) : null;
                })()}
                <InputField label="ポータル パスワード" value={portalPw} onChange={e => setPortalPw(e.target.value)} placeholder="ポータルのパスワード" type="password" showToggle />
                <MatrixInput matrix={matrix} setMatrix={setMatrix} />
              </div>
              {hasPortal && <DoneBanner />}
              <div style={{ marginTop: 24 }}>
                <button onClick={nextStep} disabled={!hasPortal} style={primaryBtnStyle(hasPortal)}>次へ</button>
              </div>
            </>}

            {/* ── 医歯学系: 学籍番号 + 学部学科選択 ── */}
            {isMedRoute && <>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: T.txH, margin: "0 0 6px" }}>医歯学系</h2>
              <p style={{ fontSize: 13, color: T.txD, margin: "0 0 20px", lineHeight: 1.5 }}>学籍番号と所属を入力してください</p>
              <ErrorBanner error={error} />
              <div style={cardStyle}>
                <InputField label="学籍番号" value={medStudentId} onChange={e => setMedStudentId(e.target.value)} placeholder="例: 11220001 / 24B60001" mono />

                {/* 学部選択 */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: T.txD, marginBottom: 6, display: "block" }}>学部</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[["medicine","医学部"],["dentistry","歯学部"]].map(([k,l])=>{
                      const s = SCHOOLS[k];
                      const on = medFaculty === k;
                      return (
                        <button key={k} onClick={() => { setMedFaculty(on ? null : k); setMedDept(null); }}
                          style={{
                            flex: 1, padding: "10px 0", borderRadius: 8,
                            border: `1px solid ${on ? s.col : T.bd}`,
                            background: on ? `${s.col}14` : "transparent",
                            color: on ? s.col : T.txH,
                            fontSize: 14, fontWeight: on ? 700 : 500, cursor: "pointer",
                            transition: "all .15s",
                          }}>{l}</button>
                      );
                    })}
                  </div>
                </div>

                {/* 学科・専攻選択 */}
                {medFaculty && (
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: T.txD, marginBottom: 6, display: "block" }}>学科・専攻</label>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {Object.entries(DEPTS).filter(([,d]) => d.school === medFaculty).map(([key, d]) => {
                        const on = medDept === key;
                        return (
                          <button key={key} onClick={() => setMedDept(on ? null : key)}
                            style={{
                              padding: "10px 14px", borderRadius: 8, textAlign: "left",
                              border: `1px solid ${on ? d.col : T.bd}`,
                              background: on ? `${d.col}14` : "transparent",
                              color: on ? d.col : T.txH,
                              fontSize: 13, fontWeight: on ? 700 : 500, cursor: "pointer",
                              transition: "all .15s",
                            }}>{d.name}</button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <div style={{
                display: "flex", alignItems: "center", gap: 8, marginTop: 12,
                padding: "10px 14px", borderRadius: 10,
                background: `${T.accent}06`, border: `1px solid ${T.accent}20`,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <p style={{ fontSize: 11, color: T.txD, lineHeight: 1.6, margin: 0 }}>
                  医歯学系にはTitech Portalが存在しないため、学籍番号のみで登録できます。成績照会機能は現在利用できません。
                </p>
              </div>
              {hasMedId && <DoneBanner />}
              <div style={{ marginTop: 24 }}>
                <button onClick={nextStep} disabled={!hasMedId} style={primaryBtnStyle(hasMedId)}>次へ</button>
              </div>
            </>}
          </div>
        </div>
      )}

      {/* ═══ 新規登録 Step 2 : Profile & Confirm ═══ */}
      {mode === "signup" && step === 2 && (
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          <div style={bodyStyle}>
            <StepLabel n={3} total={5} />
            <h2 style={{ fontSize: 20, fontWeight: 700, color: T.txH, margin: "0 0 6px" }}>プロフィール</h2>
            <p style={{ fontSize: 13, color: T.txD, margin: "0 0 20px", lineHeight: 1.5 }}>学年情報を設定してください</p>
            <ErrorBanner error={error} />
            {/* Year group — auto-detected or manual */}
            {(() => {
              const parsed = parseStudentId(isMedRoute ? medStudentId : portalId);
              return parsed ? (
                <div style={{ padding: 14, borderRadius: 12, border: `1px solid ${T.green}30`, background: `${T.green}06` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    <span style={{ fontSize: 12, fontWeight: 600, color: T.green }}>学籍番号から自動検出</span>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {[
                      { label: "入学年度", value: `20${parsed.year}` },
                      { label: "課程", value: DEGREE_MAP[parsed.degree] || parsed.degree },
                      ...(parsed.schoolLabel ? [{ label: parsed.isMedDental ? "学部" : "学院", value: parsed.schoolLabel }] : []),
                    ].map(item => (
                      <div key={item.label} style={{ flex: 1, padding: "10px 8px", borderRadius: 8, background: T.bg2, textAlign: "center" }}>
                        <div style={{ fontSize: 10, color: T.txD, marginBottom: 4, fontWeight: 500 }}>{item.label}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: T.txH }}>{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
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
              );
            })()}
            {/* Connection summary */}
            <div style={{ marginTop: 16, padding: 14, borderRadius: 12, border: `1px solid ${T.bd}`, background: T.bg2 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.txD, marginBottom: 10 }}>接続設定</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, color: T.txH }}>ISCT LMS</span>
                  <Badge ok={hasIsct} label={hasIsct ? "設定済み" : "未設定"} />
                </div>
                {!isMedRoute && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, color: T.txH }}>Titech Portal</span>
                    <Badge ok={hasPortal} label={hasPortal ? "設定済み" : "未設定"} />
                  </div>
                )}
                {isMedRoute && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, color: T.txH }}>学籍番号</span>
                    <Badge ok={hasMedId} label={hasMedId ? "設定済み" : "未設定"} />
                  </div>
                )}
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

      {/* ═══ 新規登録 Step 3 : 学系・ユニット ═══ */}
      {mode === "signup" && step === 3 && (() => {
        const grade = (() => {
          if (!yearGroup) return null;
          const ey = 2000 + parseInt(yearGroup.slice(0, 2));
          const now = new Date();
          const ay = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
          return Math.max(1, ay - ey + 1);
        })();
        const isFirstYear = grade === 1 && yearGroup?.slice(-1) === "B" && !isMedRoute;
        const isMedSchool = school === "medicine" || school === "dentistry" || isMedRoute;
        const showSchoolPicker = !school || setupTransfer;
        const sd = setupDeptSchool ? SCHOOLS[setupDeptSchool] : null;
        const depts = setupDeptSchool ? Object.entries(DEPTS).filter(([, d]) => d.school === setupDeptSchool) : [];

        return (
          <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
            <div style={bodyStyle}>
              <StepLabel n={4} total={5} />
              <h2 style={{ fontSize: 20, fontWeight: 700, color: T.txH, margin: "0 0 6px" }}>
                {isMedSchool ? "所属学科" : isFirstYear ? "志望系・ユニット" : "所属系・ユニット"}
              </h2>
              <p style={{ fontSize: 13, color: T.txD, margin: "0 0 20px", lineHeight: 1.5 }}>
                {isMedSchool ? "所属する学科を選んでください" : isFirstYear ? "志望する系とユニットを設定してください" : "所属する系を選んでください"}
              </p>

              {/* 系選択 */}
              <div style={cardStyle}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: T.txD }}>
                    {isMedSchool ? "学科・専攻" : isFirstYear ? "志望系" : "所属系"}
                  </label>
                  {sd && !showSchoolPicker && (
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 6,
                      background: `${sd.col}14`, color: sd.col,
                    }}>{sd.name}</span>
                  )}
                </div>

                {/* 転院モード: 学院選択 */}
                {showSchoolPicker && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 500, color: T.txD, marginBottom: 6 }}>{isMedSchool ? "学部" : "学院"}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {Object.entries(SCHOOLS).map(([sk, sv]) => {
                        const on = setupDeptSchool === sk;
                        return (
                          <button key={sk} onClick={() => { setSetupDeptSchool(sk); setSetupDept(null); }}
                            style={{
                              padding: "7px 12px", borderRadius: 8,
                              border: `1px solid ${on ? sv.col : T.bd}`,
                              background: on ? `${sv.col}14` : "transparent",
                              color: on ? sv.col : T.txH,
                              fontSize: 12, fontWeight: on ? 700 : 500, cursor: "pointer",
                              transition: "all .15s",
                            }}>{sv.name}</button>
                        );
                      })}
                    </div>
                    {setupTransfer && (
                      <button onClick={() => { setSetupTransfer(false); setSetupDeptSchool(school); setSetupDept(null); }}
                        style={{ background: "none", border: "none", color: T.txD, fontSize: 11, cursor: "pointer", padding: "6px 0 0" }}>
                        キャンセル
                      </button>
                    )}
                  </div>
                )}

                {/* 学系ボタン */}
                {depts.length > 0 && (
                  <div>
                    {showSchoolPicker && <div style={{ fontSize: 11, fontWeight: 500, color: T.txD, marginBottom: 6 }}>{isMedSchool ? "学科・専攻" : "学系"}</div>}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {depts.map(([prefix, d]) => {
                        const sel = setupDept === prefix;
                        return (
                          <button key={prefix} onClick={() => setSetupDept(sel ? null : prefix)}
                            style={{
                              padding: "8px 16px", borderRadius: 8,
                              border: `1px solid ${sel ? d.col : T.bd}`,
                              background: sel ? `${d.col}14` : "transparent",
                              color: sel ? d.col : T.txH,
                              fontSize: 13, fontWeight: sel ? 700 : 500, cursor: "pointer",
                              transition: "all .15s",
                            }}>{d.name}</button>
                        );
                      })}
                      {!isFirstYear && (
                        <button onClick={() => setSetupDept(setupDept === "none" ? null : "none")}
                          style={{
                            padding: "8px 16px", borderRadius: 8,
                            border: `1px solid ${setupDept === "none" ? T.txD : T.bd}`,
                            background: setupDept === "none" ? `${T.txD}14` : "transparent",
                            color: T.txD,
                            fontSize: 13, fontWeight: setupDept === "none" ? 700 : 500, cursor: "pointer",
                            transition: "all .15s",
                          }}>未所属</button>
                      )}
                    </div>
                  </div>
                )}

                {/* 転院ボタン (2年生以上, 通常モード時) */}
                {!isFirstYear && !setupTransfer && school && (
                  <button onClick={() => { setSetupTransfer(true); setSetupDept(null); }}
                    style={{
                      background: "none", border: "none", color: T.accent,
                      fontSize: 12, fontWeight: 500, cursor: "pointer",
                      padding: "2px 0", textAlign: "left", display: "flex", alignItems: "center", gap: 4,
                    }}>
                    転院した方はこちら
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                )}
              </div>

              {/* ユニット */}
              <div style={{ ...cardStyle, marginTop: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: T.txD }}>
                  ユニット{isFirstYear ? "" : "（任意）"}
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    padding: "9px 14px", borderRadius: 8,
                    background: `${UNIT_COL}10`, border: `1px solid ${UNIT_COL}30`,
                    color: UNIT_COL, fontSize: 14, fontWeight: 700, flexShrink: 0,
                  }}>{yearGroup || "?"}</div>
                  <span style={{ fontSize: 16, color: T.txD, fontWeight: 300 }}>/</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
                    <span style={{ fontSize: 13, color: T.txD, fontWeight: 500, flexShrink: 0 }}>U</span>
                    <input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="番号"
                      value={setupUnitNum} onChange={e => setSetupUnitNum(e.target.value.replace(/[^0-9]/g, ""))}
                      style={{
                        width: 56, padding: "9px 0", borderRadius: 8,
                        border: `1px solid ${T.bd}`, background: T.bg3,
                        color: T.txH, fontSize: 16, fontWeight: 700,
                        textAlign: "center", outline: "none",
                      }} />
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 8 }}>
                <button onClick={() => {
                  if (setupDept && setupDept !== "none") updateUserPref({ myDept: setupDept });
                  if (yearGroup && setupUnitNum) updateUserPref({ myUnit: `${yearGroup}-${setupUnitNum}` });
                  setStep(4);
                }} style={primaryBtnStyle(true)}>次へ</button>
                <button onClick={() => setStep(4)}
                  style={{ background: "none", border: "none", color: T.txD, fontSize: 13, cursor: "pointer", padding: "8px 0" }}>
                  スキップ
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══ 新規登録 Step 4 : メール認証 ═══ */}
      {mode === "signup" && step === 4 && (
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          <div style={bodyStyle}>
            <StepLabel n={5} total={5} />
            <h2 style={{ fontSize: 20, fontWeight: 700, color: T.txH, margin: "0 0 6px" }}>メールアドレス連携</h2>
            <div style={{ fontSize: 13, color: T.txD, margin: "0 0 20px", lineHeight: 1.6 }}>
              <p style={{ margin: "0 0 10px" }}>メールアドレスを連携すると、次回以降のログインがもっと便利になります：</p>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                <li>TOTPシークレットの入力が不要になります</li>
                <li>メール＋パスワードだけでログインできます</li>
                <li>どの端末からでもすぐにログイン可能</li>
              </ul>
            </div>
            <ErrorBanner error={error} />

            {emailVerified ? (
              <div style={{
                padding: 14, borderRadius: 12, border: `1px solid ${T.green}30`, background: `${T.green}06`,
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.green }}>メール連携完了</div>
                  <div style={{ fontSize: 12, color: T.txD, marginTop: 2 }}>{setupEmail}</div>
                </div>
              </div>
            ) : !emailPending ? (
              <div style={cardStyle}>
                <InputField label="メールアドレス" value={setupEmail}
                  onChange={e => setSetupEmail(e.target.value)}
                  placeholder="example@m.isct.ac.jp" type="email" />
                <InputField label="ログイン用パスワード" value={setupEmailPw}
                  onChange={e => setSetupEmailPw(e.target.value)}
                  placeholder="8文字以上" type="password" showToggle
                  note="ISCTのパスワードとは別に、このアプリ用のパスワードを設定します" />
                <button onClick={async () => {
                  if (!setupEmail || !setupEmailPw) { setError("メールアドレスとパスワードを入力してください"); return; }
                  if (setupEmailPw.length < 8) { setError("パスワードは8文字以上にしてください"); return; }
                  setEmailSaving(true); setError(null);
                  try {
                    const r = await fetch(`${API}/api/auth/email/link`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ email: setupEmail, password: setupEmailPw }),
                    });
                    const d = await r.json();
                    if (!r.ok) throw new Error(d.error || "送信に失敗しました");
                    setEmailPending(true);
                  } catch (e) { setError(e.message); }
                  setEmailSaving(false);
                }} disabled={emailSaving || !setupEmail || !setupEmailPw}
                  style={{
                    ...primaryBtnStyle(setupEmail && setupEmailPw && !emailSaving),
                    padding: "12px 0", fontSize: 14,
                  }}>
                  {emailSaving ? "送信中..." : "確認コードを送信"}
                </button>
              </div>
            ) : (
              <div style={cardStyle}>
                <p style={{ fontSize: 13, color: T.txD, lineHeight: 1.6 }}>
                  <strong style={{ color: T.txH }}>{setupEmail}</strong> に6桁の確認コードを送信しました
                </p>
                <InputField label="確認コード" value={emailCode}
                  onChange={e => setEmailCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                  placeholder="123456" mono />
                <button onClick={async () => {
                  if (emailCode.length !== 6) { setError("6桁のコードを入力してください"); return; }
                  setEmailSaving(true); setError(null);
                  try {
                    const r = await fetch(`${API}/api/auth/email/verify`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ email: setupEmail, code: emailCode }),
                    });
                    const d = await r.json();
                    if (!r.ok) throw new Error(d.error || "認証に失敗しました");
                    setEmailVerified(true);
                  } catch (e) { setError(e.message); }
                  setEmailSaving(false);
                }} disabled={emailSaving || emailCode.length !== 6}
                  style={{
                    ...primaryBtnStyle(emailCode.length === 6 && !emailSaving),
                    padding: "12px 0", fontSize: 14,
                  }}>
                  {emailSaving ? "確認中..." : "認証する"}
                </button>
                <button onClick={() => { setEmailPending(false); setEmailCode(""); setError(null); }}
                  style={{ background: "none", border: "none", color: T.txD, fontSize: 12, cursor: "pointer", padding: "4px 0" }}>
                  メールアドレスを変更する
                </button>
              </div>
            )}

            <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={onComplete} style={primaryBtnStyle(true)}>
                {emailVerified ? "アプリを始める" : "アプリを始める"}
              </button>
              {!emailVerified && (
                <p style={{ fontSize: 11, color: T.txD, textAlign: "center", lineHeight: 1.6 }}>
                  あとからプロフィール画面で設定することもできます
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ paddingBottom: "env(safe-area-inset-bottom)", background: T.bg, flexShrink: 0 }} />

      {/* ═══ プライバシーポリシー モーダル ═══ */}
      {showPrivacyPolicy && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 10001,
          background: T.bg, display: "flex", flexDirection: "column",
        }}>
          <div style={{
            paddingTop: "env(safe-area-inset-top)", borderBottom: `1px solid ${T.bd}`,
            background: T.bg2, flexShrink: 0,
          }}>
            <div style={{
              height: 46, display: "flex", alignItems: "center",
              justifyContent: "space-between", padding: "0 12px",
            }}>
              <button onClick={() => setShowPrivacyPolicy(false)} style={{
                background: "none", border: "none", color: T.txD,
                cursor: "pointer", display: "flex", padding: 4,
              }}>{I.back}</button>
              <span style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>プライバシーポリシー</span>
              <div style={{ width: 28 }} />
            </div>
          </div>
          <PrivacyPolicyView mob={mob} embedded={false} />
          <div style={{
            padding: "12px 24px", paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
            borderTop: `1px solid ${T.bd}`, background: T.bg2, flexShrink: 0,
          }}>
            <button onClick={() => {
              setPrivacyAgreed(true);
              try { localStorage.setItem("privacyAgreed", "true"); } catch {}
              setShowPrivacyPolicy(false);
            }} style={{
              width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
              background: T.accent, color: "#fff", fontSize: 15, fontWeight: 700,
              cursor: "pointer",
            }}>同意して閉じる</button>
          </div>
        </div>
      )}

      {/* ═══ 利用規約 モーダル ═══ */}
      {showTerms && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 10001,
          background: T.bg, display: "flex", flexDirection: "column",
        }}>
          <div style={{
            paddingTop: "env(safe-area-inset-top)", borderBottom: `1px solid ${T.bd}`,
            background: T.bg2, flexShrink: 0,
          }}>
            <div style={{
              height: 46, display: "flex", alignItems: "center",
              justifyContent: "space-between", padding: "0 12px",
            }}>
              <button onClick={() => setShowTerms(false)} style={{
                background: "none", border: "none", color: T.txD,
                cursor: "pointer", display: "flex", padding: 4,
              }}>{I.back}</button>
              <span style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>利用規約</span>
              <div style={{ width: 28 }} />
            </div>
          </div>
          <TermsOfServiceView mob={mob} embedded={false} />
          <div style={{
            padding: "12px 24px", paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
            borderTop: `1px solid ${T.bd}`, background: T.bg2, flexShrink: 0,
          }}>
            <button onClick={() => {
              setPrivacyAgreed(true);
              try { localStorage.setItem("privacyAgreed", "true"); } catch {}
              setShowTerms(false);
            }} style={{
              width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
              background: T.accent, color: "#fff", fontSize: 15, fontWeight: 700,
              cursor: "pointer",
            }}>同意して閉じる</button>
          </div>
        </div>
      )}

      <style>{mkGlobalCSS()}</style>
    </div>
  );
};
