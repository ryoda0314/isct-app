import { useState, useEffect, useRef } from "react";
import { T, ACCENT_PRESETS, THEME_MODES } from '../theme.js';
import { I } from '../icons.jsx';
import { Av } from '../shared.jsx';
import { updateUserPref } from '../hooks/useCurrentUser.js';
import { MatrixInput, COLS, ROWS } from '../components/MatrixInput.jsx';
import { QA_ALL, QA_DEFAULT } from './HomeView.jsx';
import { NAV_QUICK_DEFAULT, SPOT_GROUPS } from './NavigationView.jsx';
import { SPOTS, SPOT_CATS } from '../hooks/useLocationSharing.js';
import { SCHOOLS, DEPTS } from '../data.js';
import { PrivacyPolicyView } from './PrivacyPolicyView.jsx';
import { TermsOfServiceView } from './TermsOfServiceView.jsx';

/* ─── 画像 → 正方形クロップ → data URI ─── */
const AV_SZ=160;
const cropImg=(file)=>new Promise((res,rej)=>{
  const rd=new FileReader();
  rd.onload=()=>{
    const img=new Image();
    img.onload=()=>{
      const s=Math.min(img.width,img.height);
      const c=document.createElement("canvas");
      c.width=AV_SZ;c.height=AV_SZ;
      c.getContext("2d").drawImage(img,(img.width-s)/2,(img.height-s)/2,s,s,0,0,AV_SZ,AV_SZ);
      res(c.toDataURL("image/jpeg",0.85));
    };
    img.onerror=()=>rej("画像の読み込みに失敗");
    img.src=rd.result;
  };
  rd.onerror=()=>rej("ファイルの読み込みに失敗");
  rd.readAsDataURL(file);
});

/* ─── プリセットアバター SVG ─── */
const sv=(body,bg)=>`data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="160" height="160" rx="80" fill="${bg}"/>${body}</svg>`)}`;
const PERSON='<circle cx="80" cy="62" r="26" fill="#fff" opacity=".85"/><ellipse cx="80" cy="128" rx="40" ry="30" fill="#fff" opacity=".85"/>';
const PRESETS=[
  sv(PERSON,"#6375f0"), sv(PERSON,"#3dae72"), sv(PERSON,"#e5534b"),
  sv(PERSON,"#7c3aed"), sv(PERSON,"#0ea5e9"), sv(PERSON,"#ec4899"),
  // 猫
  sv('<circle cx="80" cy="82" r="30" fill="#fff" opacity=".9"/><circle cx="68" cy="76" r="4" fill="#333"/><circle cx="92" cy="76" r="4" fill="#333"/><ellipse cx="80" cy="86" rx="5" ry="3" fill="#f9a"/><polygon points="58,50 54,20 76,44" fill="#fff" opacity=".9"/><polygon points="102,50 106,20 84,44" fill="#fff" opacity=".9"/>',"#f59e0b"),
  // 犬
  sv('<circle cx="80" cy="82" r="30" fill="#fff" opacity=".9"/><circle cx="68" cy="76" r="4" fill="#333"/><circle cx="92" cy="76" r="4" fill="#333"/><ellipse cx="80" cy="88" rx="6" ry="3.5" fill="#333"/><ellipse cx="52" cy="58" rx="14" ry="22" fill="#fff" opacity=".8" transform="rotate(-15 52 58)"/><ellipse cx="108" cy="58" rx="14" ry="22" fill="#fff" opacity=".8" transform="rotate(15 108 58)"/>',"#92400e"),
  // ロボ
  sv('<rect x="54" y="52" width="52" height="48" rx="10" fill="#fff" opacity=".9"/><rect x="66" y="66" width="10" height="10" rx="2" fill="#333"/><rect x="84" y="66" width="10" height="10" rx="2" fill="#333"/><rect x="70" y="84" width="20" height="5" rx="2.5" fill="#333"/><rect x="74" y="38" width="12" height="16" rx="4" fill="#fff" opacity=".7"/>',"#6366f1"),
  // 星
  sv('<polygon points="80,30 92,62 128,62 100,84 110,118 80,98 50,118 60,84 32,62 68,62" fill="#fff" opacity=".9"/>',"#eab308"),
  // 木
  sv('<rect x="73" y="100" width="14" height="32" rx="3" fill="#92400e"/><circle cx="80" cy="68" r="34" fill="#22c55e" opacity=".9"/><circle cx="66" cy="56" r="18" fill="#4ade80" opacity=".6"/>',"#bbf7d0"),
  // 山
  sv('<polygon points="80,34 126,116 34,116" fill="#fff" opacity=".85"/><polygon points="108,56 140,116 76,116" fill="#fff" opacity=".6"/><polygon points="80,34 90,50 70,50" fill="#e2e8f0"/>',"#3b82f6"),
];

/* ─── 共通パーツ ─── */
const Toggle=({on,onTog})=>{
  const h=e=>{e.stopPropagation();onTog();};
  return <div onClick={h} style={{width:42,height:24,borderRadius:12,background:on?T.green:T.bg4,cursor:"pointer",padding:2,transition:"background .2s",flexShrink:0}}>
    <div style={{width:20,height:20,borderRadius:10,background:"#fff",transform:on?"translateX(18px)":"translateX(0)",transition:"transform .2s",boxShadow:"0 1px 4px rgba(0,0,0,.25)"}}/>
  </div>;
};

const GHead=({children})=>(
  <div style={{fontSize:12,fontWeight:600,color:T.txD,textTransform:"uppercase",letterSpacing:.5,padding:"16px 4px 6px"}}>{children}</div>
);

// グループカード — iOS設定風に複数行をまとめる
const GCard=({children})=>(
  <div style={{borderRadius:12,background:T.bg2,border:`1px solid ${T.bd}`,overflow:"hidden"}}>{children}</div>
);

const GRow=({icon,label,sub,right,onClick,last,danger})=>(
  <div onClick={onClick}
    style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",cursor:onClick?"pointer":"default",transition:"background .1s",...(!last?{borderBottom:`1px solid ${T.bd}`}:{})}}
    onMouseEnter={e=>{if(onClick)e.currentTarget.style.background=T.hover;}}
    onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}>
    {icon&&<span style={{color:danger?T.red:T.txD,display:"flex",flexShrink:0}}>{icon}</span>}
    <div style={{flex:1,minWidth:0}}>
      <div style={{fontSize:14,color:danger?T.red:T.txH,fontWeight:danger?600:400}}>{label}</div>
      {sub&&<div style={{fontSize:11,color:T.txD,marginTop:1}}>{sub}</div>}
    </div>
    {right}
    {onClick&&!right&&<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.txD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>}
  </div>
);

const Badge=({ok,label})=>(
  <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:10,background:ok?`${T.green}18`:`${T.orange}18`,color:ok?T.green:T.orange}}>{label}</span>
);

const Inp=({label,hint,...props})=>(
  <div>
    <div style={{fontSize:11,fontWeight:600,color:T.txD,marginBottom:4}}>{label}</div>
    <input {...props} style={{width:"100%",padding:"9px 11px",borderRadius:8,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:13,outline:"none",...(props.style||{})}}/>
    {hint&&<div style={{fontSize:10,color:T.txD,marginTop:3}}>{hint}</div>}
  </div>
);

const PwInp=({label,hint,show,onTogShow,...props})=>(
  <div>
    <div style={{fontSize:11,fontWeight:600,color:T.txD,marginBottom:4}}>{label}</div>
    <div style={{position:"relative"}}>
      <input {...props} type={show?"text":"password"} style={{width:"100%",padding:"9px 11px",paddingRight:38,borderRadius:8,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:13,outline:"none",...(props.style||{})}}/>
      <button onClick={e=>{e.stopPropagation();onTogShow();}} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:show?T.accent:T.txD,cursor:"pointer",display:"flex",padding:2}}>{I.eye}</button>
    </div>
    {hint&&<div style={{fontSize:10,color:T.txD,marginTop:3}}>{hint}</div>}
  </div>
);

/* ─── 認証フォーム（共通化） ─── */
const CredForm=({form,setForm,showPw,showTotp,setShowPw,setShowTotp,onSave,saving,btnLabel})=>(
  <div style={{display:"grid",gap:10,padding:"12px 14px"}}>
    <Inp label="Science Tokyo ID" value={form.userId} onChange={e=>setForm(p=>({...p,userId:e.target.value}))} placeholder="例: 24B00000" autoComplete="username"/>
    <PwInp label="パスワード" value={form.password} onChange={e=>setForm(p=>({...p,password:e.target.value}))} placeholder="ポータルのパスワード" autoComplete="current-password" show={showPw} onTogShow={()=>setShowPw(p=>!p)}/>
    <PwInp label="TOTPシークレットキー" value={form.totpSecret} onChange={e=>setForm(p=>({...p,totpSecret:e.target.value.replace(/\s/g,"").toUpperCase()}))} placeholder="例: TT5SOVTA4BFN4IND" show={showTotp} onTogShow={()=>setShowTotp(p=>!p)} style={{fontFamily:"monospace"}} hint="アプリ認証設定時に表示されたシークレットキー"/>
    <button onClick={onSave} disabled={saving}
      style={{padding:"10px 0",borderRadius:8,border:"none",background:T.accent,color:"#fff",fontSize:13,fontWeight:600,cursor:saving?"wait":"pointer",opacity:saving?.6:1,transition:"opacity .15s"}}>
      {saving?"接続中...":btnLabel}
    </button>
  </div>
);

/* ─── メイン ─── */
export const ProfileView=({mob,togTheme,dark,themePref="dark",setThemePref,accentPref="default",setAccentPref,asgn,courses=[],user={},notifEnabled,setNotifEnabled,notifSettings,setNotifSettings,onLogout})=>{
  const done=asgn.filter(a=>a.st==="completed").length;
  const total=asgn.length;

  const [credOpen,setCredOpen]=useState(false);
  const [notifOpen,setNotifOpen]=useState(false);
  const [ygOpen,setYgOpen]=useState(false);
  const [deptOpen,setDeptOpen]=useState(false);
  const [deptSchool,setDeptSchool]=useState(()=>user.myDept?DEPTS[user.myDept]?.school||null:null);
  const [cacheCleared,setCacheCleared]=useState(false);
  const [showPrivacy,setShowPrivacy]=useState(false);
  const [showTerms,setShowTerms]=useState(false);
  const [avEdit,setAvEdit]=useState(false);
  const [uploading,setUploading]=useState(false);
  const fileRef=useRef(null);
  const isImgAv=user.av&&(user.av.startsWith("data:")||user.av.startsWith("http")||user.av.startsWith("/"));

  const handleFile=async(e)=>{
    const f=e.target.files?.[0];
    if(!f)return;
    if(!f.type.startsWith("image/")){alert("画像ファイルを選択してください");return;}
    setUploading(true);
    try{
      const uri=await cropImg(f);
      updateUserPref({av:uri});
    }catch(err){alert(typeof err==="string"?err:err.message);}
    setUploading(false);
    if(fileRef.current)fileRef.current.value="";
  };

  // 認証情報
  const [credStatus,setCredStatus]=useState(null);
  const [credForm,setCredForm]=useState({userId:"",password:"",totpSecret:""});
  const [credSaving,setCredSaving]=useState(false);
  const [credMsg,setCredMsg]=useState(null);
  const [credDeleting,setCredDeleting]=useState(false);
  const [showPw,setShowPw]=useState(false);
  const [showTotp,setShowTotp]=useState(false);

  // Portal認証情報
  const [portalOpen,setPortalOpen]=useState(false);
  const [portalForm,setPortalForm]=useState({userId:"",password:"",matrix:{}});
  const [portalSaving,setPortalSaving]=useState(false);
  const [portalMsg,setPortalMsg]=useState(null);
  const [portalDeleting,setPortalDeleting]=useState(false);
  const [showPortalPw,setShowPortalPw]=useState(false);

  // 表示設定
  const [fontSize,setFontSize]=useState(()=>{try{return localStorage.getItem("fontSize")||"medium";}catch{return "medium";}});
  const saveFontSize=v=>{setFontSize(v);try{localStorage.setItem("fontSize",v);}catch{}};

  // クイックアクセス設定
  const [qaIds,setQaIds]=useState(()=>{try{const v=localStorage.getItem("quickAccess");return v?JSON.parse(v):QA_DEFAULT;}catch{return QA_DEFAULT;}});
  const [qaOpen,setQaOpen]=useState(false);
  const saveQa=ids=>{setQaIds(ids);try{localStorage.setItem("quickAccess",JSON.stringify(ids));}catch{}};

  // マップ よく使う場所
  const navSpots=SPOTS.filter(s=>s.id&&s.lat!=null);
  const [navQIds,setNavQIds]=useState(()=>{try{const v=localStorage.getItem("navQuickSpots");return v?JSON.parse(v):NAV_QUICK_DEFAULT;}catch{return NAV_QUICK_DEFAULT;}});
  const [navQOpen,setNavQOpen]=useState(false);
  const [navQCat,setNavQCat]=useState(null);
  const saveNavQ=ids=>{setNavQIds(ids);try{localStorage.setItem("navQuickSpots",JSON.stringify(ids));}catch{}};

  useEffect(()=>{
    (async()=>{try{const r=await fetch("/api/auth/status");if(r.ok)setCredStatus(await r.json());}catch{}})();
  },[]);

  const handleCredSave=async()=>{
    const {userId,password,totpSecret}=credForm;
    if(!userId||!password||!totpSecret){setCredMsg({type:"err",text:"全ての項目を入力してください"});return;}
    setCredSaving(true);setCredMsg(null);
    try{
      const r=await fetch("/api/auth/setup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId,password,totpSecret})});
      const d=await r.json();
      if(!r.ok)throw new Error(d.detail||d.error||"保存に失敗しました");
      setCredMsg({type:"ok",text:"認証情報を保存しました"});
      setCredStatus({hasCredentials:true,isAuthenticated:true});
      setCredForm({userId:"",password:"",totpSecret:""});
      setCredOpen(false);
    }catch(e){setCredMsg({type:"err",text:e.message});}
    setCredSaving(false);
  };

  const handleCredDelete=async()=>{
    if(!confirm("認証情報を削除しますか？\n再度ログインが必要になります。"))return;
    setCredDeleting(true);setCredMsg(null);
    try{
      await fetch("/api/auth/credentials",{method:"DELETE"});
      setCredStatus({hasCredentials:false,isAuthenticated:false});
      setCredMsg({type:"ok",text:"認証情報を削除しました"});
    }catch{setCredMsg({type:"err",text:"削除に失敗しました"});}
    setCredDeleting(false);
  };

  const handlePortalSave=async()=>{
    const {userId,password,matrix}=portalForm;
    const hasMatrix=COLS.every(c=>ROWS.every(r=>matrix[c]?.[r]));
    if(!userId||!password||!hasMatrix){setPortalMsg({type:"err",text:"全ての項目を入力してください"});return;}
    setPortalSaving(true);setPortalMsg(null);
    try{
      const r=await fetch("/api/auth/setup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({portalUserId:userId,portalPassword:password,matrix})});
      const d=await r.json();
      if(!r.ok)throw new Error(d.detail||d.error||"保存に失敗しました");
      setPortalMsg({type:"ok",text:"ポータル認証情報を保存しました"});
      setCredStatus(p=>({...p,hasPortal:true}));
      setPortalForm({userId:"",password:"",matrix:{}});
      setPortalOpen(false);
    }catch(e){setPortalMsg({type:"err",text:e.message});}
    setPortalSaving(false);
  };

  const handlePortalDelete=async()=>{
    if(!confirm("ポータル認証情報を削除しますか？"))return;
    setPortalDeleting(true);setPortalMsg(null);
    try{
      await fetch("/api/auth/credentials",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"portal"})});
      setCredStatus(p=>({...p,hasPortal:false}));
      setPortalMsg({type:"ok",text:"ポータル認証情報を削除しました"});
    }catch{setPortalMsg({type:"err",text:"削除に失敗しました"});}
    setPortalDeleting(false);
  };

  const handleClearCache=()=>{
    try{
      ["wxLoc","quarter","hiddenAsgn","notifEnabled","notifSettings","fontSize"].forEach(k=>localStorage.removeItem(k));
      setCacheCleared(true);setTimeout(()=>setCacheCleared(false),2000);
    }catch{}
  };

  const mw=mob?undefined:520;

  return(
    <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
      <div style={{maxWidth:mw,margin:"0 auto",padding:mob?"12px 14px":"20px 24px"}}>

        {/* ═══ プロフィールカード ═══ */}
        <div style={{padding:"20px 16px",borderRadius:14,background:T.bg2,border:`1px solid ${T.bd}`,marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            {/* アバター — タップで編集 */}
            <div style={{position:"relative",cursor:"pointer",flexShrink:0}} onClick={()=>setAvEdit(p=>!p)}>
              <Av u={user} sz={56} st/>
              <div style={{position:"absolute",bottom:-2,right:-2,width:20,height:20,borderRadius:10,background:T.accent,border:`2px solid ${T.bg2}`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              </div>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:18,fontWeight:700,color:T.txH}}>{user.name||"ユーザー"}</div>
              <div style={{fontSize:12,color:T.txD,marginTop:2}}>
                {[user.dept,user.yr?`B${user.yr}`:null,user.moodleId].filter(Boolean).join(" · ")}
              </div>
            </div>
          </div>

          {/* ── アバター編集パネル ── */}
          {avEdit&&<div style={{marginTop:14,borderTop:`1px solid ${T.bd}`,paddingTop:14}}>
            <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleFile}/>

            {/* 現在のアバタープレビュー */}
            <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:14}}>
              <Av u={user} sz={72}/>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600,color:T.txH,marginBottom:6}}>アイコンを変更</div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>fileRef.current?.click()} disabled={uploading}
                    style={{padding:"6px 14px",borderRadius:8,border:`1px solid ${T.accent}`,background:"transparent",color:T.accent,fontSize:12,fontWeight:600,cursor:uploading?"wait":"pointer",opacity:uploading?.5:1}}>
                    {uploading?"処理中...":"画像をアップロード"}
                  </button>
                  {isImgAv&&<button onClick={()=>updateUserPref({av:""})}
                    style={{padding:"6px 10px",borderRadius:8,border:`1px solid ${T.bd}`,background:"transparent",color:T.txD,fontSize:12,cursor:"pointer"}}>
                    削除
                  </button>}
                </div>
                <div style={{fontSize:10,color:T.txD,marginTop:4}}>JPG・PNG・WebP 対応（円形にクロップされます）</div>
              </div>
            </div>

            {/* プリセット画像 */}
            <div style={{fontSize:11,fontWeight:600,color:T.txD,marginBottom:8}}>プリセットから選ぶ</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(52px,1fr))",gap:6,marginBottom:14}}>
              {PRESETS.map((src,i)=>{
                const sel=user.av===src;
                return <button key={i} onClick={()=>updateUserPref({av:src})}
                  style={{width:"100%",aspectRatio:"1",borderRadius:"50%",border:`3px solid ${sel?T.accent:"transparent"}`,background:T.bg3,cursor:"pointer",padding:0,overflow:"hidden",transition:"border .12s, transform .12s",transform:sel?"scale(1.08)":"scale(1)",outline:"none"}}
                  onMouseEnter={e=>{if(!sel)e.currentTarget.style.borderColor=T.bdL;}}
                  onMouseLeave={e=>{if(!sel)e.currentTarget.style.borderColor="transparent";}}>
                  <img src={src} style={{width:"100%",height:"100%",borderRadius:"50%",objectFit:"cover",display:"block"}} alt=""/>
                </button>;
              })}
            </div>

            {/* フォールバック色（画像なし時のイニシャル背景色） */}
            {!isImgAv&&<>
              <div style={{fontSize:11,fontWeight:600,color:T.txD,marginBottom:6}}>カラー（イニシャルアイコン用）</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
                {["#6375f0","#3dae72","#e5534b","#d4843e","#c6a236","#7c3aed","#0ea5e9","#ec4899","#14b8a6","#f97316","#6b7280"].map(c=>(
                  <div key={c} onClick={()=>updateUserPref({col:c})}
                    style={{width:28,height:28,borderRadius:"50%",background:c,cursor:"pointer",border:user.col===c?`3px solid ${T.txH}`:"3px solid transparent",transition:"all .12s",transform:user.col===c?"scale(1.1)":"scale(1)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    {user.col===c&&<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                  </div>
                ))}
              </div>
            </>}

            <button onClick={()=>setAvEdit(false)}
              style={{width:"100%",padding:"9px 0",borderRadius:8,border:"none",background:T.accent,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer"}}>
              完了
            </button>
          </div>}

          {/* ミニ統計 */}
          {!avEdit&&<div style={{display:"flex",gap:0,marginTop:14,borderTop:`1px solid ${T.bd}`,paddingTop:12}}>
            {[
              {v:`${done}/${total}`,l:"課題提出",c:T.green},
              {v:courses.length,l:"履修科目",c:T.orange},
            ].map((s,i,arr)=>(
              <div key={i} style={{flex:1,textAlign:"center",...(i<arr.length-1?{borderRight:`1px solid ${T.bd}`}:{})}}>
                <div style={{fontSize:18,fontWeight:700,color:s.c}}>{s.v}</div>
                <div style={{fontSize:10,color:T.txD,marginTop:1}}>{s.l}</div>
              </div>
            ))}
          </div>}
        </div>

        {/* ═══ 接続設定 ═══ */}
        <GHead>接続設定</GHead>
        <GCard>
          <GRow icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>}
            label="ISCT LMS" sub={credStatus?.hasCredentials?"ID・パスワード・TOTPキー 設定済み":"未設定 — タップして設定"}
            onClick={()=>setCredOpen(p=>!p)}
            right={credStatus&&<Badge ok={credStatus.hasCredentials} label={credStatus.hasCredentials?"接続中":"未接続"}/>}/>
          <GRow last icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}
            label="Titech Portal" sub={credStatus?.hasPortal?"アカウント・パスワード・マトリクス 設定済み":"未設定 — タップして設定"}
            onClick={()=>setPortalOpen(p=>!p)}
            right={credStatus&&<Badge ok={credStatus.hasPortal} label={credStatus.hasPortal?"接続中":"未接続"}/>}/>
        </GCard>

        {credOpen&&<div style={{marginTop:6,borderRadius:12,background:T.bg2,border:`1px solid ${T.bd}`,overflow:"hidden"}}>
          {credMsg&&<div style={{margin:"10px 14px 0",padding:"8px 10px",borderRadius:8,background:credMsg.type==="ok"?`${T.green}14`:`${T.red}14`,color:credMsg.type==="ok"?T.green:T.red,fontSize:12,fontWeight:500}}>{credMsg.text}</div>}

          {credStatus?.hasCredentials&&!credStatus._editing?<div style={{padding:"14px"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,padding:10,borderRadius:8,background:`${T.green}08`,border:`1px solid ${T.green}20`,marginBottom:10}}>
              <div style={{width:8,height:8,borderRadius:4,background:T.green,flexShrink:0}}/>
              <span style={{fontSize:12,color:T.green,fontWeight:600}}>ISCT LMSに接続済み</span>
            </div>
            <div style={{fontSize:12,color:T.txD,marginBottom:12,lineHeight:1.5}}>認証情報はAES-256-GCMで暗号化保存されています。</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setCredStatus(p=>({...p,_editing:true}))}
                style={{flex:1,padding:"9px 0",borderRadius:8,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:13,fontWeight:600,cursor:"pointer"}}>
                再設定
              </button>
              <button onClick={handleCredDelete} disabled={credDeleting}
                style={{flex:1,padding:"9px 0",borderRadius:8,border:`1px solid ${T.red}30`,background:`${T.red}08`,color:T.red,fontSize:13,fontWeight:600,cursor:credDeleting?"wait":"pointer",opacity:credDeleting?.5:1}}>
                {credDeleting?"削除中...":"削除"}
              </button>
            </div>
          </div>:<>
            {credStatus?.hasCredentials&&<div style={{padding:"10px 14px 0"}}>
              <button onClick={()=>setCredStatus(p=>({...p,_editing:false}))}
                style={{background:"none",border:"none",color:T.txD,fontSize:12,cursor:"pointer",padding:0}}>← 戻る</button>
            </div>}
            <CredForm form={credForm} setForm={setCredForm} showPw={showPw} showTotp={showTotp} setShowPw={setShowPw} setShowTotp={setShowTotp} onSave={handleCredSave} saving={credSaving} btnLabel={credStatus?.hasCredentials?"認証情報を更新":"ログインして接続"}/>
            {!credStatus?.hasCredentials&&<div style={{padding:"0 14px 12px",fontSize:10,color:T.txD,lineHeight:1.5}}>認証情報はこのPC内に暗号化して保存されます。外部には送信されません。</div>}
          </>}
        </div>}

        {portalOpen&&<div style={{marginTop:6,borderRadius:12,background:T.bg2,border:`1px solid ${T.bd}`,overflow:"hidden"}}>
          {portalMsg&&<div style={{margin:"10px 14px 0",padding:"8px 10px",borderRadius:8,background:portalMsg.type==="ok"?`${T.green}14`:`${T.red}14`,color:portalMsg.type==="ok"?T.green:T.red,fontSize:12,fontWeight:500}}>{portalMsg.text}</div>}

          {credStatus?.hasPortal&&!credStatus._portalEditing?<div style={{padding:"14px"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,padding:10,borderRadius:8,background:`${T.green}08`,border:`1px solid ${T.green}20`,marginBottom:10}}>
              <div style={{width:8,height:8,borderRadius:4,background:T.green,flexShrink:0}}/>
              <span style={{fontSize:12,color:T.green,fontWeight:600}}>Titech Portalに接続済み</span>
            </div>
            <div style={{fontSize:12,color:T.txD,marginBottom:12,lineHeight:1.5}}>認証情報はAES-256-GCMで暗号化保存されています。</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setCredStatus(p=>({...p,_portalEditing:true}))}
                style={{flex:1,padding:"9px 0",borderRadius:8,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:13,fontWeight:600,cursor:"pointer"}}>
                再設定
              </button>
              <button onClick={handlePortalDelete} disabled={portalDeleting}
                style={{flex:1,padding:"9px 0",borderRadius:8,border:`1px solid ${T.red}30`,background:`${T.red}08`,color:T.red,fontSize:13,fontWeight:600,cursor:portalDeleting?"wait":"pointer",opacity:portalDeleting?.5:1}}>
                {portalDeleting?"削除中...":"削除"}
              </button>
            </div>
          </div>:<>
            {credStatus?.hasPortal&&<div style={{padding:"10px 14px 0"}}>
              <button onClick={()=>setCredStatus(p=>({...p,_portalEditing:false}))}
                style={{background:"none",border:"none",color:T.txD,fontSize:12,cursor:"pointer",padding:0}}>← 戻る</button>
            </div>}
            <div style={{display:"grid",gap:10,padding:"12px 14px"}}>
              <Inp label="ポータル アカウント" value={portalForm.userId} onChange={e=>setPortalForm(p=>({...p,userId:e.target.value}))} placeholder="学籍番号"/>
              <PwInp label="ポータル パスワード" value={portalForm.password} onChange={e=>setPortalForm(p=>({...p,password:e.target.value}))} placeholder="ポータルのパスワード" show={showPortalPw} onTogShow={()=>setShowPortalPw(p=>!p)}/>
              <MatrixInput matrix={portalForm.matrix} setMatrix={m=>setPortalForm(p=>({...p,matrix:typeof m==='function'?m(p.matrix):m}))}/>
              <button onClick={handlePortalSave} disabled={portalSaving}
                style={{padding:"10px 0",borderRadius:8,border:"none",background:T.accent,color:"#fff",fontSize:13,fontWeight:600,cursor:portalSaving?"wait":"pointer",opacity:portalSaving?.6:1,transition:"opacity .15s"}}>
                {portalSaving?"接続中...":(credStatus?.hasPortal?"認証情報を更新":"ログインして接続")}
              </button>
            </div>
            {!credStatus?.hasPortal&&<div style={{padding:"0 14px 12px",fontSize:10,color:T.txD,lineHeight:1.5}}>認証情報はこのPC内に暗号化して保存されます。外部には送信されません。</div>}
          </>}
        </div>}

        {/* ═══ ホーム画面 ═══ */}
        <GHead>ホーム画面</GHead>
        <GCard>
          <GRow icon={I.home} label="クイックアクセス" sub={`${qaIds.length}個のショートカットを表示中`}
            onClick={()=>setQaOpen(p=>!p)}/>
          {qaOpen&&<div style={{padding:"8px 14px 12px"}}>
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
              {QA_ALL.map(q=>{
                const on=qaIds.includes(q.id);
                const full=!on&&qaIds.length>=4;
                const portalIcon=<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>;
                return(
                  <button key={q.id} onClick={()=>{if(on)saveQa(qaIds.filter(x=>x!==q.id));else if(!full)saveQa([...qaIds,q.id]);}}
                    style={{display:"flex",alignItems:"center",gap:4,padding:"6px 10px",borderRadius:8,
                      border:`1px solid ${on?T.accent+"30":T.bd}`,background:on?`${T.accent}14`:"transparent",
                      color:on?T.accent:full?T.txD:T.txH,fontSize:12,fontWeight:on?600:500,
                      cursor:full&&!on?"default":"pointer",opacity:full&&!on?.4:1}}>
                    <span style={{display:"flex",color:on?T.accent:T.txD}}>{q.icon||portalIcon}</span>
                    {q.label}
                  </button>
                );
              })}
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:8}}>
              <span style={{fontSize:10,color:T.txD}}>{qaIds.length}/4個選択中</span>
              <button onClick={()=>saveQa(QA_DEFAULT)} style={{background:"none",border:"none",color:T.txD,fontSize:10,cursor:"pointer",padding:0}}>リセット</button>
            </div>
          </div>}
        </GCard>

        {/* ═══ マップ ═══ */}
        <GHead>マップ</GHead>
        <GCard>
          <GRow icon={I.map} label="よく使う場所" sub={`${navQIds.length}件登録中`}
            onClick={()=>setNavQOpen(p=>!p)}/>
          {navQOpen&&<div style={{padding:"8px 14px 12px"}}>
            {/* 登録済みタグ */}
            {navQIds.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:10}}>
              {navQIds.map(id=>{
                const xBtn=<button onClick={()=>saveNavQ(navQIds.filter(x=>x!==id))} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",padding:0,marginLeft:1}}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>;
                if(id.startsWith("cat:")){const cat=SPOT_CATS.find(c=>c.id===id.slice(4));if(!cat)return null;return(
                  <div key={id} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 8px",borderRadius:6,background:`${T.accent}14`,border:`1px solid ${T.accent}30`}}>
                    <span style={{fontSize:11,fontWeight:600,color:T.accent}}>{cat.label}</span>{xBtn}
                  </div>);}
                if(id.startsWith("grp:")){const g=SPOT_GROUPS.find(x=>x.prefix===id.slice(4));if(!g)return null;return(
                  <div key={id} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 8px",borderRadius:6,background:`${g.col}18`,border:`1px solid ${g.col}30`}}>
                    <span style={{fontSize:11,fontWeight:600,color:g.col}}>{g.label}</span>{xBtn}
                  </div>);}
                const s=navSpots.find(x=>x.id===id);if(!s)return null;return(
                  <div key={id} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 8px",borderRadius:6,background:`${s.col}18`,border:`1px solid ${s.col}30`}}>
                    <span style={{fontSize:8,fontWeight:700,color:s.col}}>{s.short}</span>
                    <span style={{fontSize:11,fontWeight:600,color:T.txH}}>{s.label}</span>{xBtn}
                  </div>);
              })}
            </div>}
            {/* カテゴリ追加 */}
            <div style={{fontSize:10,fontWeight:600,color:T.txD,marginBottom:5}}>エリア・カテゴリ</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:10}}>
              {SPOT_CATS.filter(c=>navSpots.some(s=>s.cat===c.id)).map(c=>{
                const cid="cat:"+c.id;const on=navQIds.includes(cid);
                return <button key={cid} onClick={()=>{if(on)saveNavQ(navQIds.filter(x=>x!==cid));else saveNavQ([...navQIds,cid]);}}
                  style={{padding:"5px 10px",borderRadius:8,border:`1px solid ${on?T.accent+"30":T.bd}`,background:on?`${T.accent}14`:"transparent",
                    color:on?T.accent:T.txH,fontSize:12,fontWeight:on?600:500,cursor:"pointer"}}>
                  {c.label}{on&&<span style={{marginLeft:3,display:"inline-flex",color:T.accent}}>{I.chk}</span>}
                </button>;
              })}
            </div>
            {/* スポットグループ追加 */}
            <div style={{fontSize:10,fontWeight:600,color:T.txD,marginBottom:5}}>スポット種別</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:10}}>
              {SPOT_GROUPS.map(g=>{
                const gid="grp:"+g.prefix;const on=navQIds.includes(gid);
                return <button key={gid} onClick={()=>{if(on)saveNavQ(navQIds.filter(x=>x!==gid));else saveNavQ([...navQIds,gid]);}}
                  style={{display:"flex",alignItems:"center",gap:4,padding:"5px 10px",borderRadius:8,
                    border:`1px solid ${on?g.col+"40":T.bd}`,background:on?`${g.col}14`:"transparent",
                    color:on?g.col:T.txH,fontSize:12,fontWeight:on?600:500,cursor:"pointer"}}>
                  <div style={{width:8,height:8,borderRadius:2,background:g.col,opacity:on?1:.5}}/>
                  {g.label}{on&&<span style={{marginLeft:3,display:"inline-flex",color:g.col}}>{I.chk}</span>}
                </button>;
              })}
            </div>
            {/* 個別スポット */}
            <div style={{fontSize:10,fontWeight:600,color:T.txD,marginBottom:5}}>個別に追加</div>
            <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:6}}>
              {SPOT_CATS.filter(c=>navSpots.some(s=>s.cat===c.id)).map(c=>{
                const on=navQCat===c.id;
                return <button key={c.id} onClick={()=>setNavQCat(on?null:c.id)}
                  style={{padding:"3px 8px",borderRadius:6,border:`1px solid ${on?T.accent:T.bd}`,background:on?`${T.accent}14`:"transparent",color:on?T.accent:T.txD,fontSize:10,fontWeight:on?700:500,cursor:"pointer"}}>{c.label}</button>;
              })}
            </div>
            {navQCat&&<div style={{maxHeight:160,overflowY:"auto",display:"flex",flexDirection:"column",gap:2}}>
              {navSpots.filter(s=>s.cat===navQCat).map(s=>{
                const on=navQIds.includes(s.id);
                return <button key={s.id} onClick={()=>{if(on)saveNavQ(navQIds.filter(x=>x!==s.id));else saveNavQ([...navQIds,s.id]);}}
                  style={{display:"flex",alignItems:"center",gap:6,padding:"6px 8px",borderRadius:6,border:`1px solid ${on?T.accent+"30":T.bd}`,background:on?`${T.accent}10`:"transparent",cursor:"pointer",textAlign:"left"}}>
                  <div style={{width:18,height:18,borderRadius:4,background:on?s.col:`${s.col}40`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <span style={{fontSize:7,fontWeight:700,color:on?"#fff":s.col}}>{s.short}</span>
                  </div>
                  <span style={{fontSize:12,fontWeight:on?600:400,color:on?T.txH:T.tx,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.label}</span>
                  {on&&<span style={{display:"flex",color:T.accent}}>{I.chk}</span>}
                </button>;
              })}
            </div>}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:8}}>
              <span style={{fontSize:10,color:T.txD}}>{navQIds.filter(id=>!id.startsWith("grp:")).length}件 + {navQIds.filter(id=>id.startsWith("grp:")).length}グループ</span>
              <button onClick={()=>saveNavQ(NAV_QUICK_DEFAULT)} style={{background:"none",border:"none",color:T.txD,fontSize:10,cursor:"pointer",padding:0}}>リセット</button>
            </div>
          </div>}
        </GCard>

        {/* ═══ 一般 ═══ */}
        <GHead>一般</GHead>
        <GCard>
          <GRow icon={I.users} label="学年グループ" sub="タイムライン投稿に自動タグ付け"
            onClick={()=>setYgOpen(p=>!p)}
            right={<span style={{fontSize:13,fontWeight:600,color:user.yearGroup?T.accent:T.txD}}>{user.yearGroup||"未設定"}</span>}/>
          {ygOpen&&<div style={{padding:"8px 14px 12px",display:"flex",flexDirection:"column",gap:8}}>
            <div>
              <div style={{fontSize:11,color:T.txD,marginBottom:6,fontWeight:500}}>入学年度</div>
              <div style={{display:"flex",gap:6}}>
                {["22","23","24","25","26"].map(y=>{const sel=user.yearGroup&&user.yearGroup.slice(0,-1)===y;return(
                  <button key={y} onClick={e=>{e.stopPropagation();const t=user.yearGroup?user.yearGroup.slice(-1):"B";updateUserPref({yearGroup:sel?null:y+t});}}
                    style={{flex:1,padding:"8px 0",borderRadius:8,border:`1px solid ${sel?T.accent:T.bd}`,background:sel?`${T.accent}14`:"transparent",color:sel?T.accent:T.txD,fontSize:13,fontWeight:sel?700:500,cursor:"pointer",transition:"all .12s"}}>
                    {y}
                  </button>
                );})}
              </div>
            </div>
            <div>
              <div style={{fontSize:11,color:T.txD,marginBottom:6,fontWeight:500}}>課程</div>
              <div style={{display:"flex",gap:6}}>
                {[["B","学部"],["M","修士"],["D","博士"],["R","研究生"]].map(([k,l])=>{const sel=user.yearGroup&&user.yearGroup.endsWith(k);return(
                  <button key={k} onClick={e=>{e.stopPropagation();if(!user.yearGroup)return;updateUserPref({yearGroup:user.yearGroup.slice(0,-1)+k});}}
                    style={{flex:1,padding:"8px 0",borderRadius:8,border:`1px solid ${sel?T.accent:T.bd}`,background:sel?`${T.accent}14`:"transparent",color:sel?T.accent:T.txD,fontSize:13,fontWeight:sel?700:500,cursor:user.yearGroup?"pointer":"default",opacity:user.yearGroup?1:.4,transition:"all .12s"}}>
                    {l}
                  </button>
                );})}
              </div>
            </div>
          </div>}
          <GRow icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>}
            label="所属学系" sub="プロフィールに表示される学系"
            onClick={()=>setDeptOpen(p=>!p)}
            right={<span style={{fontSize:13,fontWeight:600,color:user.myDept?DEPTS[user.myDept]?.col||T.accent:T.txD}}>{user.myDept?DEPTS[user.myDept]?.name||user.myDept:"未設定"}</span>}/>
          {deptOpen&&<div style={{padding:"8px 14px 12px"}}>
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
              {Object.entries(SCHOOLS).map(([sk,sv])=>{
                const on=deptSchool===sk;
                const hidden=deptSchool&&!on;
                const ds=on?Object.entries(DEPTS).filter(([,d])=>d.school===sk):[];
                return(
                <div key={sk} style={{display:"flex",flexWrap:"wrap",gap:5,transition:"flex-basis .3s cubic-bezier(.4,0,.2,1)",flexBasis:on?"100%":"auto"}}>
                  <button onClick={e=>{e.stopPropagation();if(on){setDeptSchool(null);updateUserPref({myDept:null});}else setDeptSchool(sk);}}
                    style={{padding:"7px 14px",borderRadius:8,border:`1px solid ${on?sv.col:T.bd}`,background:on?sv.col:"transparent",color:on?"#fff":T.txH,fontSize:12,fontWeight:on?700:500,cursor:"pointer",
                      transition:"all .25s cubic-bezier(.4,0,.2,1)",
                      maxWidth:hidden?0:200,opacity:hidden?0:1,padding:hidden?"7px 0":"7px 14px",margin:hidden?"0 -2.5px":0,overflow:"hidden",whiteSpace:"nowrap"}}>
                    {sv.name}{on?" ▾":""}
                  </button>
                  {ds.map(([prefix,d],i)=>{const sel=user.myDept===prefix;return(
                    <button key={prefix} onClick={e=>{e.stopPropagation();updateUserPref({myDept:prefix});}}
                      style={{padding:"7px 14px",borderRadius:8,border:`1px solid ${sel?d.col:T.bd}`,background:sel?`${d.col}20`:"transparent",color:sel?d.col:T.txH,fontSize:12,fontWeight:sel?700:500,cursor:"pointer",
                        animation:"deptPop .28s cubic-bezier(.34,1.56,.64,1) both",animationDelay:`${i*50}ms`}}>
                      {d.name}
                    </button>
                  );})}
                </div>
              );})}
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",marginTop:8}}>
              {user.myDept&&<button onClick={()=>{setDeptSchool(null);updateUserPref({myDept:null});}} style={{background:"none",border:"none",color:T.txD,fontSize:10,cursor:"pointer",padding:0}}>リセット</button>}
            </div>
            <style>{`@keyframes deptPop{from{opacity:0;transform:scale(.5)}to{opacity:1;transform:scale(1)}}`}</style>
          </div>}
          {/* ── テーマ設定セクション ── */}
          <div style={{padding:"10px 14px",borderBottom:`1px solid ${T.bd}`}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <span style={{color:T.txD,display:"flex"}}>{dark?I.moon:I.sun}</span>
              <span style={{fontSize:13,fontWeight:600,color:T.txH}}>テーマ</span>
            </div>
            {/* ベーステーマ */}
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {THEME_MODES.base.map(m=>{
                const sel=themePref===m.id;
                return <button key={m.id} onClick={e=>{e.stopPropagation();setThemePref?.(m.id);}}
                  style={{padding:"6px 14px",borderRadius:8,border:`1.5px solid ${sel?T.accent:T.bd}`,background:sel?`${T.accent}14`:"transparent",color:sel?T.accent:T.txD,fontSize:12,fontWeight:sel?700:500,cursor:"pointer",transition:"all .12s"}}>
                  {m.name}
                </button>;
              })}
            </div>
            {/* Science Tokyo ブランド */}
            <div style={{marginTop:12,marginBottom:4}}>
              <span style={{fontSize:11,fontWeight:600,color:T.txD,letterSpacing:"0.03em"}}>Science Tokyo</span>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {THEME_MODES.brand.map(m=>{
                const sel=themePref===m.id;
                return <button key={m.id} onClick={e=>{e.stopPropagation();setThemePref?.(m.id);}}
                  style={{padding:"6px 14px",borderRadius:8,border:`1.5px solid ${sel?m.col:T.bd}`,background:sel?`${m.col}18`:"transparent",color:sel?m.col:T.txD,fontSize:12,fontWeight:sel?700:500,cursor:"pointer",transition:"all .12s"}}>
                  <span style={{display:"inline-block",width:8,height:8,borderRadius:"50%",background:m.col,marginRight:6,verticalAlign:"middle"}}/>
                  {m.name}
                </button>;
              })}
            </div>
            {/* 季節テーマ */}
            <div style={{marginTop:12,marginBottom:4}}>
              <span style={{fontSize:11,fontWeight:600,color:T.txD,letterSpacing:"0.03em"}}>季節</span>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {THEME_MODES.season.map(m=>{
                const sel=themePref===m.id;
                return <button key={m.id} onClick={e=>{e.stopPropagation();setThemePref?.(m.id);}}
                  style={{padding:"6px 14px",borderRadius:8,border:`1.5px solid ${sel?m.col:T.bd}`,background:sel?`${m.col}18`:"transparent",color:sel?m.col:T.txD,fontSize:12,fontWeight:sel?700:500,cursor:"pointer",transition:"all .12s"}}>
                  <span style={{marginRight:4}}>{m.emoji}</span>{m.name}
                </button>;
              })}
            </div>
          </div>
          {/* ── アクセントカラーセクション ── */}
          <div style={{padding:"10px 14px",borderBottom:`1px solid ${T.bd}`}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <span style={{color:T.txD,display:"flex"}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12a10 10 0 005.012 8.662"/></svg></span>
              <span style={{fontSize:13,fontWeight:600,color:T.txH}}>テーマカラー</span>
              {["titech","tmdu","scitokyo","sakura","shinryoku","koyo","yuki"].includes(themePref)&&
                <span style={{fontSize:10,color:T.txD,fontStyle:"italic"}}>(ブランド・季節テーマでは固定)</span>}
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:8,opacity:["titech","tmdu","scitokyo","sakura","shinryoku","koyo","yuki"].includes(themePref)?0.4:1,pointerEvents:["titech","tmdu","scitokyo","sakura","shinryoku","koyo","yuki"].includes(themePref)?"none":"auto",transition:"opacity .15s"}}>
              {ACCENT_PRESETS.map(p=>{
                const sel=accentPref===p.id;
                return <button key={p.id} onClick={e=>{e.stopPropagation();setAccentPref?.(p.id);}}
                  style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"8px 6px",borderRadius:10,border:sel?`2px solid ${p.col}`:`2px solid transparent`,background:sel?`${p.col}14`:"transparent",cursor:"pointer",minWidth:56,transition:"all .15s"}}>
                  <div style={{width:28,height:28,borderRadius:"50%",background:p.col,boxShadow:sel?`0 0 12px ${p.col}50`:"none",transition:"box-shadow .15s"}}/>
                  <span style={{fontSize:10,fontWeight:sel?700:400,color:sel?p.col:T.txD,whiteSpace:"nowrap"}}>{p.name}</span>
                </button>;
              })}
            </div>
          </div>
          <GRow icon={I.bell} label="通知" onClick={()=>setNotifOpen(p=>!p)}
            right={<Toggle on={notifEnabled} onTog={()=>setNotifEnabled(p=>!p)}/>}/>
          {notifOpen&&notifEnabled&&<>
            {[
              {k:"course",l:"授業・お知らせ"},
              {k:"deadline",l:"締切リマインダー"},
              {k:"dm",l:"DM"},
              {k:"event",l:"イベント"},
            ].map((n,i,arr)=>(
              <div key={n.k} style={{display:"flex",alignItems:"center",padding:"9px 14px 9px 44px",...(i<arr.length-1?{borderBottom:`1px solid ${T.bd}`}:{})}}>
                <span style={{flex:1,fontSize:13,color:T.tx}}>{n.l}</span>
                <Toggle on={notifSettings[n.k]} onTog={()=>setNotifSettings(p=>({...p,[n.k]:!p[n.k]}))}/>
              </div>
            ))}
            {typeof Notification!=="undefined"&&<div style={{padding:"8px 14px 10px 44px",borderTop:`1px solid ${T.bd}`}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{flex:1,fontSize:12,color:T.txD}}>
                  {Notification.permission==="granted"?"デスクトップ通知: 許可済み":Notification.permission==="denied"?"デスクトップ通知: ブロック中":"デスクトップ通知を有効にする"}
                </span>
                {Notification.permission==="default"&&<button onClick={()=>Notification.requestPermission().then(()=>setNotifOpen(p=>p))}
                  style={{padding:"4px 12px",borderRadius:6,border:`1px solid ${T.accent}`,background:`${T.accent}14`,color:T.accent,fontSize:11,fontWeight:600,cursor:"pointer"}}>許可</button>}
                {Notification.permission==="granted"&&<span style={{color:T.green,fontSize:11,fontWeight:600}}>✓</span>}
                {Notification.permission==="denied"&&<span style={{color:T.red,fontSize:11,fontWeight:600}}>✕</span>}
              </div>
            </div>}
          </>}
          <GRow last icon={I.eye} label="フォントサイズ"
            right={<div style={{display:"flex",gap:4}}>
              {[{id:"small",l:"小"},{id:"medium",l:"中"},{id:"large",l:"大"}].map(f=>(
                <button key={f.id} onClick={e=>{e.stopPropagation();saveFontSize(f.id);}}
                  style={{padding:"4px 12px",borderRadius:6,border:`1px solid ${fontSize===f.id?T.accent:T.bd}`,background:fontSize===f.id?`${T.accent}14`:"transparent",color:fontSize===f.id?T.accent:T.txD,fontSize:12,fontWeight:fontSize===f.id?700:500,cursor:"pointer",transition:"all .12s"}}>
                  {f.l}
                </button>
              ))}
            </div>}/>
        </GCard>

        {/* ═══ データ管理 ═══ */}
        <GHead>データ管理</GHead>
        <GCard>
          <GRow icon={I.dl} label="データエクスポート"
            sub="個人データをJSON形式でダウンロード（開示請求対応）"
            onClick={()=>{
              const data={exportedAt:new Date().toISOString(),user:{name:user.name,dept:user.dept,yearGroup:user.yearGroup},assignments:asgn,courses:courses.map(c=>({id:c.id,code:c.code,name:c.name})),settings:{notifEnabled,notifSettings,fontSize}};
              const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
              const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`sciencetokyo-export-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url);
            }}/>
          <GRow icon={I.reset} label={cacheCleared?"キャッシュクリア完了":"キャッシュをクリア"}
            sub="ローカル設定をリセット"
            onClick={handleClearCache}
            right={cacheCleared&&<span style={{color:T.green,display:"flex"}}>{I.chk}</span>}/>
          <GRow last danger
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>}
            label="アカウント削除"
            sub="サーバー上の全データを削除します"
            onClick={()=>{
              if(!confirm("本当にアカウントを削除しますか？\n\n・サーバー上のプロフィール、投稿、メッセージ等の全データが削除されます\n・この操作は取り消せません")) return;
              if(!confirm("最終確認: アカウントを完全に削除してよろしいですか？")) return;
              (async()=>{
                try{
                  await fetch('/api/auth/credentials',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'all'})});
                  try{localStorage.removeItem("privacyAgreed");}catch{}
                  onLogout();
                }catch{ alert("削除に失敗しました。もう一度お試しください。"); }
              })();
            }}/>
        </GCard>

        {/* ═══ その他 ═══ */}
        <GHead>その他</GHead>
        <GCard>
          <GRow icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>}
            label="利用規約"
            sub="サービスの利用条件について"
            onClick={()=>setShowTerms(true)}/>
          <GRow icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}
            label="プライバシーポリシー"
            sub="個人情報の取り扱いについて"
            onClick={()=>setShowPrivacy(true)}/>
          <GRow
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>}
            label="ログアウト" last danger
            onClick={()=>{if(confirm("ログアウトしますか？")){onLogout();}}}/>
        </GCard>

        {/* フッター */}
        <div style={{textAlign:"center",padding:"24px 0 36px",color:T.txD,fontSize:11}}>
          <div style={{fontWeight:500}}>ScienceTokyo App v1.0.0</div>
          <div style={{marginTop:2}}>© 2026 Institute of Science Tokyo</div>
        </div>

        {/* ═══ 利用規約 モーダル ═══ */}
        {showTerms&&<div style={{position:"fixed",inset:0,zIndex:10001,background:T.bg,display:"flex",flexDirection:"column"}}>
          <div style={{paddingTop:"env(safe-area-inset-top)",borderBottom:`1px solid ${T.bd}`,background:T.bg2,flexShrink:0}}>
            <div style={{height:46,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 12px"}}>
              <button onClick={()=>setShowTerms(false)} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",padding:4}}>{I.back}</button>
              <span style={{fontSize:16,fontWeight:700,color:T.txH}}>利用規約</span>
              <div style={{width:28}}/>
            </div>
          </div>
          <TermsOfServiceView mob={mob} embedded={false}/>
        </div>}
        {/* ═══ プライバシーポリシー モーダル ═══ */}
        {showPrivacy&&<div style={{position:"fixed",inset:0,zIndex:10001,background:T.bg,display:"flex",flexDirection:"column"}}>
          <div style={{paddingTop:"env(safe-area-inset-top)",borderBottom:`1px solid ${T.bd}`,background:T.bg2,flexShrink:0}}>
            <div style={{height:46,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 12px"}}>
              <button onClick={()=>setShowPrivacy(false)} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",padding:4}}>{I.back}</button>
              <span style={{fontSize:16,fontWeight:700,color:T.txH}}>プライバシーポリシー</span>
              <div style={{width:28}}/>
            </div>
          </div>
          <PrivacyPolicyView mob={mob} embedded={false}/>
        </div>}
      </div>
    </div>
  );
};
