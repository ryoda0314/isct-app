import { useState } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";

const API = "";

export const SetupView = ({ onComplete, onSkip, mob }) => {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [step, setStep] = useState(0); // 0=form, 1=connecting
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

  if (step === 1) {
    return (
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flex:1,padding:"env(safe-area-inset-top) 20px env(safe-area-inset-bottom)"}}>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16}}>
          <div style={{width:48,height:48,border:`3px solid ${T.bd}`,borderTop:`3px solid ${T.accent}`,borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
          <p style={{color:T.txH,fontSize:15,fontWeight:600,margin:0}}>LMSに接続中...</p>
          <p style={{color:T.txD,fontSize:13,margin:0,textAlign:"center",lineHeight:1.6}}>SSO認証を実行しています<br/>初回は30秒ほどかかります</p>
          {error&&<div style={{padding:"10px 14px",borderRadius:10,background:`${T.red}18`,color:T.red,fontSize:13,width:"100%",maxWidth:300,textAlign:"center"}}>{error}</div>}
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
    );
  }

  return (
    <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"auto",WebkitOverflowScrolling:"touch"}}>
      <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center",padding:mob?"env(safe-area-inset-top) 24px env(safe-area-inset-bottom)":"40px",maxWidth:400,width:"100%",margin:"0 auto"}}>

        {/* Logo / Header */}
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{width:56,height:56,borderRadius:16,background:`${T.accent}18`,display:"inline-flex",alignItems:"center",justifyContent:"center",marginBottom:12}}>
            <span style={{fontSize:24,fontWeight:800,color:T.accent}}>ST</span>
          </div>
          <h1 style={{fontSize:22,fontWeight:800,color:T.txH,margin:"0 0 6px",letterSpacing:-.3}}>ScienceTokyo App</h1>
          <p style={{fontSize:13,color:T.txD,margin:0}}>LMSから時間割・課題を自動取得</p>
        </div>

        {error&&<div style={{padding:"10px 14px",borderRadius:10,background:`${T.red}18`,color:T.red,fontSize:13,marginBottom:16}}>{error}</div>}

        {/* Form */}
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div>
            <label style={{fontSize:12,fontWeight:600,color:T.txD,marginBottom:6,display:"block"}}>Science Tokyo ID</label>
            <input
              style={{width:"100%",padding:"12px 14px",borderRadius:10,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:16,outline:"none",boxSizing:"border-box"}}
              value={userId}
              onChange={e=>setUserId(e.target.value)}
              placeholder="24B00000"
              autoComplete="username"
              autoCapitalize="none"
            />
          </div>

          <div>
            <label style={{fontSize:12,fontWeight:600,color:T.txD,marginBottom:6,display:"block"}}>パスワード</label>
            <div style={{position:"relative"}}>
              <input
                style={{width:"100%",padding:"12px 44px 12px 14px",borderRadius:10,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:16,outline:"none",boxSizing:"border-box"}}
                type={showPw?"text":"password"}
                value={password}
                onChange={e=>setPassword(e.target.value)}
                placeholder="ポータルのパスワード"
                autoComplete="current-password"
              />
              <button onClick={()=>setShowPw(p=>!p)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",padding:4}}>
                {showPw?I.eye||"👁":I.eyeOff||"👁‍🗨"}
              </button>
            </div>
          </div>

          <div>
            <label style={{fontSize:12,fontWeight:600,color:T.txD,marginBottom:6,display:"block"}}>TOTPシークレットキー</label>
            <input
              style={{width:"100%",padding:"12px 14px",borderRadius:10,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:16,outline:"none",boxSizing:"border-box",fontFamily:"monospace",letterSpacing:1}}
              value={totpSecret}
              onChange={e=>setTotpSecret(e.target.value.replace(/\s/g,"").toUpperCase())}
              placeholder="TT5SOVTA4BFN4IND"
              autoCapitalize="characters"
              autoComplete="off"
            />
            <p style={{fontSize:11,color:T.txD,margin:"6px 0 0",lineHeight:1.5}}>2段階認証のアプリ設定時に表示されたキー</p>
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{width:"100%",padding:"14px 0",borderRadius:12,border:"none",background:canSubmit?T.accent:`${T.accent}40`,color:"#fff",fontSize:15,fontWeight:700,cursor:canSubmit?"pointer":"default",marginTop:24,transition:"opacity .15s"}}
        >
          ログインして接続
        </button>

        <button onClick={onSkip} style={{background:"none",border:"none",color:T.txD,fontSize:13,cursor:"pointer",marginTop:16,textAlign:"center",padding:8,width:"100%"}}>
          スキップ（モックデータで表示）
        </button>

        <p style={{fontSize:11,color:T.txD,textAlign:"center",lineHeight:1.6,margin:"16px 0 0"}}>
          認証情報はAES-256-GCMで暗号化して保存されます
        </p>
      </div>
    </div>
  );
};