import { useState } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { updateUserPref } from "../hooks/useCurrentUser.js";
import { MatrixInput, COLS, ROWS } from "../components/MatrixInput.jsx";

const API = "";
const PAGE={position:"fixed",inset:0,display:"flex",flexDirection:"column",background:T.bg,color:T.tx,fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,'Hiragino Sans','Segoe UI',sans-serif",zIndex:9999};

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
          value={value}
          onChange={onChange}
          placeholder={placeholder}
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

export const SetupView = ({ onComplete, onSkip, onDemo, mob }) => {
  // ISCT (LMS)
  const [isctId, setIsctId] = useState("");
  const [isctPw, setIsctPw] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  // Titech Portal
  const [portalId, setPortalId] = useState("");
  const [portalPw, setPortalPw] = useState("");
  const [matrix, setMatrix] = useState({});

  const [yearGroup, setYearGroup] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [step, setStep] = useState(0);
  const [showYG, setShowYG] = useState(false);
  const [tab, setTab] = useState("isct");

  const hasIsct = isctId && isctPw && totpSecret;
  const hasMatrix = COLS.every(c => ROWS.every(r => matrix[c]?.[r]));
  const hasPortal = portalId && portalPw && hasMatrix;

  const handleSubmit = async () => {
    if (!hasIsct && !hasPortal) {
      setError("いずれかの認証情報を入力してください");
      return;
    }
    // テストアカウント
    if (isctId === "test" && isctPw === "test" && totpSecret === "TEST") {
      if (yearGroup) updateUserPref({ yearGroup });
      onDemo();
      return;
    }
    setLoading(true);
    setError(null);
    setStep(1);
    try {
      const body = {};
      if (hasIsct) {
        body.userId = isctId;
        body.password = isctPw;
        body.totpSecret = totpSecret;
      }
      if (hasPortal) {
        body.portalUserId = portalId;
        body.portalPassword = portalPw;
        body.matrix = matrix;
      }

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
      setStep(0);
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = (hasIsct || hasPortal) && !loading;

  const tabBtn = (id, label, desc, ready) => (
    <button onClick={() => setTab(id)} style={{
      flex: 1, padding: "10px 8px", borderRadius: 10,
      border: `1px solid ${tab === id ? T.accent : T.bd}`,
      background: tab === id ? `${T.accent}12` : "transparent",
      color: tab === id ? T.accent : T.txD, cursor: "pointer", textAlign: "center",
      position: "relative",
    }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 10, marginTop: 2, opacity: .7 }}>{desc}</div>
      <div style={{
        position: "absolute", top: 6, right: 6, width: 8, height: 8,
        borderRadius: 4, background: ready ? T.green : T.txD,
      }} />
    </button>
  );

  // 接続中
  if (step === 1) {
    return (
      <div style={PAGE}>
        <div style={{paddingTop:"env(safe-area-inset-top)",background:T.bg2,borderBottom:`1px solid ${T.bd}`,flexShrink:0}}>
          <div style={{height:46,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:16,fontWeight:700,color:T.txH}}>ScienceTokyo App</span></div>
        </div>
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16}}>
            <div style={{width:48,height:48,border:`3px solid ${T.bd}`,borderTop:`3px solid ${T.accent}`,borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
            <p style={{color:T.txH,fontSize:15,fontWeight:600,margin:0}}>接続中...</p>
            <p style={{color:T.txD,fontSize:13,margin:0,textAlign:"center",lineHeight:1.6}}>
              {hasIsct ? "ISCT SSO認証を実行しています" : "認証情報を保存しています"}
              <br/>初回は30秒ほどかかります
            </p>
            {error&&<div style={{padding:"10px 14px",borderRadius:10,background:`${T.red}18`,color:T.red,fontSize:13,width:"100%",maxWidth:300,textAlign:"center"}}>{error}</div>}
          </div>
        </div>
        <div style={{paddingBottom:"env(safe-area-inset-bottom)",background:T.bg,flexShrink:0}}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}*{box-sizing:border-box;margin:0;padding:0}html,body{background:${T.bg};overscroll-behavior:none;-webkit-tap-highlight-color:transparent}input,textarea{font-size:16px}::placeholder{color:${T.txD}}button,input,textarea,select{font-family:inherit;-webkit-appearance:none}`}</style>
      </div>
    );
  }

  return (
    <div style={PAGE}>
      <div style={{paddingTop:"env(safe-area-inset-top)",background:T.bg2,borderBottom:`1px solid ${T.bd}`,flexShrink:0}}>
        <div style={{height:46,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:16,fontWeight:700,color:T.txH}}>ScienceTokyo App</span></div>
      </div>
      <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
        <div style={{minHeight:"100%",display:"flex",flexDirection:"column",justifyContent:"center"}}>
          <div style={{padding:mob?"20px 24px":"40px",maxWidth:440,width:"100%",margin:"0 auto",boxSizing:"border-box"}}>
            <p style={{fontSize:13,color:T.txD,margin:"0 0 20px",textAlign:"center"}}>LMS・教務Webから時間割・課題・成績を自動取得</p>
            {error&&<div style={{padding:"10px 14px",borderRadius:10,background:`${T.red}18`,color:T.red,fontSize:13,marginBottom:16}}>{error}</div>}

            {/* タブ切り替え */}
            <div style={{display:"flex",gap:8,marginBottom:14}}>
              {tabBtn("isct", "ISCT LMS", "時間割・課題", hasIsct)}
              {tabBtn("titech", "Titech Portal", "成績", hasPortal)}
            </div>

            {/* ISCT LMS */}
            {tab === "isct" && (
              <div style={{display:"flex",flexDirection:"column",gap:14,padding:14,borderRadius:10,border:`1px solid ${T.bd}`,background:T.bg2}}>
                <InputField label="Science Tokyo ID" value={isctId} onChange={e => setIsctId(e.target.value)} placeholder="abcd1234" />
                <InputField label="パスワード" value={isctPw} onChange={e => setIsctPw(e.target.value)} placeholder="ISCTのパスワード" type="password" showToggle />
                <InputField label="TOTPシークレットキー" value={totpSecret} onChange={e => setTotpSecret(e.target.value.replace(/\s/g, "").toUpperCase())} placeholder="TT5SOVTA4BFN4IND" mono note="2段階認証アプリ設定時に表示されたキー" />
              </div>
            )}

            {/* Titech Portal */}
            {tab === "titech" && (
              <div style={{display:"flex",flexDirection:"column",gap:14,padding:14,borderRadius:10,border:`1px solid ${T.bd}`,background:T.bg2}}>
                <InputField label="ポータル アカウント" value={portalId} onChange={e => setPortalId(e.target.value)} placeholder="学籍番号" />
                <InputField label="ポータル パスワード" value={portalPw} onChange={e => setPortalPw(e.target.value)} placeholder="ポータルのパスワード" type="password" showToggle />
                <MatrixInput matrix={matrix} setMatrix={setMatrix} />
              </div>
            )}

            {/* 学年グループ */}
            <div style={{marginTop:16}}>
              <label style={{fontSize:12,fontWeight:600,color:T.txD,marginBottom:8,display:"block"}}>学年グループ</label>
              <div onClick={()=>setShowYG(p=>!p)} style={{padding:"12px 14px",borderRadius:10,border:`1px solid ${T.bd}`,background:T.bg3,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:15,color:yearGroup?T.txH:T.txD}}>{yearGroup||"選択してください"}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.txD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{transform:showYG?"rotate(180deg)":"none",transition:"transform .15s"}}><polyline points="6 9 12 15 18 9"/></svg>
              </div>
              {showYG&&<div style={{marginTop:8,padding:14,borderRadius:10,border:`1px solid ${T.bd}`,background:T.bg3}}>
                <div style={{fontSize:11,color:T.txD,marginBottom:6,fontWeight:500}}>入学年度</div>
                <div style={{display:"flex",gap:6,marginBottom:10}}>
                  {["22","23","24","25","26"].map(y=>{const sel=yearGroup&&yearGroup.slice(0,-1)===y;return(
                    <button key={y} onClick={()=>{const t=yearGroup?yearGroup.slice(-1):"B";setYearGroup(sel?null:y+t);}} style={{flex:1,padding:"10px 0",borderRadius:8,border:`1px solid ${sel?T.accent:T.bd}`,background:sel?`${T.accent}18`:"transparent",color:sel?T.accent:T.txD,fontSize:15,fontWeight:sel?700:500,cursor:"pointer",transition:"all .15s"}}>{y}</button>
                  );})}
                </div>
                <div style={{fontSize:11,color:T.txD,marginBottom:6,fontWeight:500}}>課程</div>
                <div style={{display:"flex",gap:6}}>
                  {[["B","学部"],["M","修士"],["D","博士"],["R","研究生"]].map(([k,l])=>{const sel=yearGroup&&yearGroup.endsWith(k);return(
                    <button key={k} onClick={()=>{if(!yearGroup)return;setYearGroup(yearGroup.slice(0,-1)+k);}} style={{flex:1,padding:"8px 0",borderRadius:8,border:`1px solid ${sel?T.accent:T.bd}`,background:sel?`${T.accent}18`:"transparent",color:sel?T.accent:T.txD,fontSize:13,fontWeight:sel?700:500,cursor:yearGroup?"pointer":"default",opacity:yearGroup?1:.4,transition:"all .15s"}}>{l}</button>
                  );})}
                </div>
              </div>}
            </div>

            <button onClick={handleSubmit} disabled={!canSubmit} style={{width:"100%",padding:"14px 0",borderRadius:12,border:"none",background:canSubmit?T.accent:`${T.accent}40`,color:"#fff",fontSize:15,fontWeight:700,cursor:canSubmit?"pointer":"default",marginTop:24,transition:"opacity .15s"}}>ログインして接続</button>
            <button onClick={onSkip} style={{background:"none",border:"none",color:T.txD,fontSize:13,cursor:"pointer",marginTop:16,textAlign:"center",padding:8,width:"100%"}}>スキップ（モックデータで表示）</button>
            <p style={{fontSize:11,color:T.txD,textAlign:"center",lineHeight:1.6,margin:"16px 0 0"}}>認証情報はAES-256-GCMで暗号化して保存されます</p>
          </div>
        </div>
      </div>
      <div style={{paddingBottom:"env(safe-area-inset-bottom)",background:T.bg,flexShrink:0}}/>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}html,body{background:${T.bg};overscroll-behavior:none;-webkit-tap-highlight-color:transparent}input,textarea{font-size:16px}::placeholder{color:${T.txD}}button,input,textarea,select{font-family:inherit;-webkit-appearance:none}`}</style>
    </div>
  );
};
