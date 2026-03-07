import { useState } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";

const API = "";

// 完全独立のフルスクリーンページ（ボトムバーなし）
const PAGE={position:"fixed",inset:0,display:"flex",flexDirection:"column",background:T.bg,color:T.tx,fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,'Hiragino Sans','Segoe UI',sans-serif",zIndex:9999};

export const SetupView = ({ onComplete, onSkip, mob }) => {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [step, setStep] = useState(0);
  const [showPw, setShowPw] = useState(false);

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

  const canSubmit = userId && password && totpSecret && !loading;

  const eyeOff = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 01-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>;

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
            <p style={{color:T.txH,fontSize:15,fontWeight:600,margin:0}}>LMSに接続中...</p>
            <p style={{color:T.txD,fontSize:13,margin:0,textAlign:"center",lineHeight:1.6}}>SSO認証を実行しています<br/>初回は30秒ほどかかります</p>
            {error&&<div style={{padding:"10px 14px",borderRadius:10,background:`${T.red}18`,color:T.red,fontSize:13,width:"100%",maxWidth:300,textAlign:"center"}}>{error}</div>}
          </div>
        </div>
        <div style={{paddingBottom:"env(safe-area-inset-bottom)",background:T.bg,flexShrink:0}}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}*{box-sizing:border-box;margin:0;padding:0}html,body{background:${T.bg};overscroll-behavior:none;-webkit-tap-highlight-color:transparent}input,textarea{font-size:16px}::placeholder{color:${T.txD}}button,input,textarea,select{font-family:inherit;-webkit-appearance:none}`}</style>
      </div>
    );
  }

  // フォーム
  return (
    <div style={PAGE}>
      <div style={{paddingTop:"env(safe-area-inset-top)",background:T.bg2,borderBottom:`1px solid ${T.bd}`,flexShrink:0}}>
        <div style={{height:46,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:16,fontWeight:700,color:T.txH}}>ScienceTokyo App</span></div>
      </div>
      <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
        <div style={{minHeight:"100%",display:"flex",flexDirection:"column",justifyContent:"center"}}>
          <div style={{padding:mob?"20px 24px":"40px",maxWidth:400,width:"100%",margin:"0 auto",boxSizing:"border-box"}}>
            <p style={{fontSize:13,color:T.txD,margin:"0 0 20px",textAlign:"center"}}>LMSから時間割・課題を自動取得</p>
            {error&&<div style={{padding:"10px 14px",borderRadius:10,background:`${T.red}18`,color:T.red,fontSize:13,marginBottom:16}}>{error}</div>}
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <div>
                <label style={{fontSize:12,fontWeight:600,color:T.txD,marginBottom:6,display:"block"}}>Science Tokyo ID</label>
                <input style={{width:"100%",padding:"12px 14px",borderRadius:10,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:16,outline:"none",boxSizing:"border-box"}} value={userId} onChange={e=>setUserId(e.target.value)} placeholder="abcd1234" autoComplete="username" autoCapitalize="none"/>
              </div>
              <div>
                <label style={{fontSize:12,fontWeight:600,color:T.txD,marginBottom:6,display:"block"}}>パスワード</label>
                <div style={{position:"relative"}}>
                  <input style={{width:"100%",padding:"12px 44px 12px 14px",borderRadius:10,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:16,outline:"none",boxSizing:"border-box"}} type={showPw?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} placeholder="ポータルのパスワード" autoComplete="current-password"/>
                  <button onClick={()=>setShowPw(p=>!p)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",padding:4}}>{showPw?I.eye:eyeOff}</button>
                </div>
              </div>
              <div>
                <label style={{fontSize:12,fontWeight:600,color:T.txD,marginBottom:6,display:"block"}}>TOTPシークレットキー</label>
                <input style={{width:"100%",padding:"12px 14px",borderRadius:10,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:16,outline:"none",boxSizing:"border-box",fontFamily:"monospace",letterSpacing:1}} value={totpSecret} onChange={e=>setTotpSecret(e.target.value.replace(/\s/g,"").toUpperCase())} placeholder="TT5SOVTA4BFN4IND" autoCapitalize="characters" autoComplete="off"/>
                <p style={{fontSize:11,color:T.txD,margin:"6px 0 0",lineHeight:1.5}}>2段階認証のアプリ設定時に表示されたキー</p>
              </div>
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
