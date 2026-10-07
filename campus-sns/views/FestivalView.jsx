import React, { useState, useMemo, useRef, useEffect } from "react";
import { T } from "../theme.js";
import { t } from "../i18n.js";
import { I } from "../icons.jsx";
import { Tag, Tx, Loader } from "../shared.jsx";
import { useFestival } from "../hooks/useFestival.js";
import { showToast } from "../hooks/useToast.js";
import { SPOTS } from "../hooks/useLocationSharing.js";
import { ReportModal } from "../ReportModal.jsx";

// ── 開催情報 ──
const FESTIVAL={nameKey:"festival.koudaisai2026",dates:"2026/10/10(土)–11(日)",hours:"10日 9:30–18:30 / 11日 9:30–17:15",place:"大岡山キャンパス",url:"https://koudaisai.jp/"};

// ── Categories ──
const CATEGORIES=[
  {id:"food",labelKey:"festival.catFood",color:"#f97316"},
  {id:"drink",labelKey:"festival.catDrink",color:"#06b6d4"},
  {id:"exhibit",labelKey:"festival.catExhibit",color:"#6366f1"},
  {id:"game",labelKey:"festival.catGame",color:"#10b981"},
  {id:"stage",labelKey:"festival.catStage",color:"#ec4899"},
  {id:"goods",labelKey:"festival.catGoods",color:"#f59e0b"},
  {id:"other",labelKey:"festival.catOther",color:"#64748b"},
];
const CAT_MAP=Object.fromEntries(CATEGORIES.map(c=>[c.id,c]));
const SPOT_LIST=SPOTS.filter(s=>s.id);
const SPOT_MAP=Object.fromEntries(SPOT_LIST.map(s=>[s.id,s]));

const inputSt=()=>({width:"100%",boxSizing:"border-box",padding:"9px 12px",borderRadius:8,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:14,outline:"none",fontFamily:"inherit"});
const btnSt=(primary)=>({display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,padding:"8px 14px",borderRadius:8,border:primary?"none":`1px solid ${T.bd}`,background:primary?T.accent:T.bg3,color:primary?"#fff":T.txH,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"});

const COUPON_COLOR="#e11d48";
const pad2=(n)=>String(n).padStart(2,"0");
const fmtMDHM=(d)=>`${d.getMonth()+1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

const placeText=(b)=>[SPOT_MAP[b.building]?.label,b.location].filter(Boolean).join(" ");

// ── 画像（無ければカテゴリ色のプレースホルダ） ──
const Cover=({b,h})=>{
  const c=CAT_MAP[b.category]||CAT_MAP.other;
  if(b.imageUrl) return <img src={b.imageUrl} alt="" loading="lazy" style={{width:"100%",height:h,objectFit:"cover",display:"block",background:T.bg3}}/>;
  // 斜めストライプのみ（名前・カテゴリは下に出るので重ねない）
  return <div style={{width:"100%",height:h,background:`repeating-linear-gradient(135deg,${c.color}1f 0 14px,${c.color}0d 14px 28px)`,borderBottom:`3px solid ${c.color}`}}/>;
};

const LikeBtn=({b,onLike})=>(
  <span onClick={e=>{e.stopPropagation();onLike(b.id);}} style={{display:"inline-flex",alignItems:"center",gap:4,cursor:"pointer",fontSize:12,color:b.liked?T.red:T.txD,padding:"3px 9px",borderRadius:14,background:b.liked?T.red+"12":T.bg3,border:`1px solid ${b.liked?T.red+"30":T.bd}`}}>
    <span style={{display:"flex",transform:"scale(.8)"}}>{I.heart}</span>{b.likeCount}
  </span>
);

// ── 一覧カード ──
const BoothCard=({b,onOpen,onLike})=>{
  const c=CAT_MAP[b.category]||CAT_MAP.other;
  const place=placeText(b);
  return(
    <div onClick={()=>onOpen(b.id)} style={{borderRadius:12,overflow:"hidden",border:`1px solid ${T.bd}`,background:T.bg2,cursor:"pointer",display:"flex",flexDirection:"column",opacity:b.hidden?.5:1}}>
      <Cover b={b} h={130}/>
      <div style={{padding:"10px 12px",display:"flex",flexDirection:"column",gap:5,flex:1}}>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          <Tag color={c.color}>{t(c.labelKey)}</Tag>
          {b.coupon&&<Tag color={COUPON_COLOR}>{t("festival.couponTag")}</Tag>}
          {b.isMine&&<Tag color={T.accent}>{t("festival.mine")}</Tag>}
          {b.hidden&&<Tag color={T.red}>{t("festival.hiddenTag")}</Tag>}
        </div>
        <div style={{fontWeight:700,fontSize:15,color:T.txH,lineHeight:1.3}}>{b.name}</div>
        {b.org&&<div style={{fontSize:12,color:T.txD}}>{b.org}</div>}
        {place&&<div style={{fontSize:12,color:T.tx,display:"flex",alignItems:"center",gap:4}}><span style={{display:"flex",transform:"scale(.7)",color:T.txD}}>{I.pin}</span>{place}</div>}
        <div style={{marginTop:"auto",paddingTop:4}}><LikeBtn b={b} onLike={onLike}/></div>
      </div>
    </div>
  );
};

// ── 登録・編集フォーム ──
const EMPTY={name:"",org:"",category:"food",description:"",building:"",location:"",hours:"",link:""};
const BoothForm=({initial,onSave,onCancel})=>{
  const [f,setF]=useState(()=>initial?{...EMPTY,...Object.fromEntries(Object.keys(EMPTY).map(k=>[k,initial[k]||EMPTY[k]]))}:EMPTY);
  const [file,setFile]=useState(null);
  const [preview,setPreview]=useState(initial?.imageUrl||null);
  const [removeImage,setRemoveImage]=useState(false);
  const [couponOn,setCouponOn]=useState(!!initial?.coupon);
  const [cp,setCp]=useState({title:initial?.coupon?.title||"",detail:initial?.coupon?.detail||"",limit:initial?.coupon?.limit?String(initial.coupon.limit):""});
  const [saving,setSaving]=useState(false);
  const fileRef=useRef(null);
  const set=(k)=>(e)=>setF(p=>({...p,[k]:e.target.value}));

  useEffect(()=>()=>{if(preview?.startsWith("blob:"))URL.revokeObjectURL(preview);},[preview]);

  const pick=(e)=>{
    const fl=e.target.files?.[0];
    e.target.value="";
    if(!fl) return;
    if(!fl.type.startsWith("image/")){showToast(t("festival.imageOnly"));return;}
    setFile(fl);setRemoveImage(false);setPreview(URL.createObjectURL(fl));
  };
  const submit=async()=>{
    if(!f.name.trim()){showToast(t("festival.nameRequired"));return;}
    if(couponOn&&!cp.title.trim()){showToast(t("festival.couponTitleRequired"));return;}
    setSaving(true);
    try{await onSave({...f,coupon:couponOn?{title:cp.title,detail:cp.detail,limit:cp.limit.trim()||null}:null},file,removeImage);}
    catch(e){showToast(e.message||t("toast.saveFailed"));setSaving(false);}
  };
  const label=(k,req)=><div style={{fontSize:12,fontWeight:600,color:T.txH,margin:"12px 0 5px"}}>{t(k)}{req&&<span style={{color:T.red}}> *</span>}</div>;

  return(
    <div style={{maxWidth:560,margin:"0 auto",padding:16}}>
      <div style={{fontSize:17,fontWeight:700,color:T.txH,marginBottom:4}}>{initial?t("festival.editTitle"):t("festival.newTitle")}</div>
      <div style={{fontSize:12,color:T.txD}}>{t("festival.formNote")}</div>

      {label("festival.fImage")}
      <div onClick={()=>fileRef.current?.click()} style={{borderRadius:10,overflow:"hidden",border:`1px dashed ${T.bd}`,cursor:"pointer",background:T.bg3}}>
        {preview?<img src={preview} alt="" style={{width:"100%",maxHeight:220,objectFit:"cover",display:"block"}}/>
          :<div style={{height:120,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,color:T.txD,fontSize:12}}>{I.img}{t("festival.pickImage")}</div>}
      </div>
      {preview&&<div onClick={()=>{setFile(null);setPreview(null);setRemoveImage(true);}} style={{fontSize:12,color:T.red,cursor:"pointer",marginTop:6}}>{t("festival.removeImage")}</div>}
      <input ref={fileRef} type="file" accept="image/*" onChange={pick} style={{display:"none"}}/>

      {label("festival.fName",true)}
      <input value={f.name} onChange={set("name")} maxLength={60} placeholder={t("festival.phName")} style={inputSt()}/>
      {label("festival.fOrg")}
      <input value={f.org} onChange={set("org")} maxLength={60} placeholder={t("festival.phOrg")} style={inputSt()}/>

      {label("festival.fCategory",true)}
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {CATEGORIES.map(c=><span key={c.id} onClick={()=>setF(p=>({...p,category:c.id}))} style={{padding:"6px 11px",borderRadius:16,fontSize:12,fontWeight:600,cursor:"pointer",border:`1px solid ${f.category===c.id?c.color:T.bd}`,background:f.category===c.id?c.color+"20":T.bg3,color:f.category===c.id?c.color:T.txD}}>{t(c.labelKey)}</span>)}
      </div>

      {label("festival.fDesc")}
      <textarea value={f.description} onChange={set("description")} maxLength={2000} rows={5} placeholder={t("festival.phDesc")} style={{...inputSt(),resize:"vertical",lineHeight:1.6}}/>

      {label("festival.fBuilding")}
      <select value={f.building} onChange={set("building")} style={inputSt()}>
        <option value="">{t("festival.noBuilding")}</option>
        {SPOT_LIST.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
      {label("festival.fLocation")}
      <input value={f.location} onChange={set("location")} maxLength={100} placeholder={t("festival.phLocation")} style={inputSt()}/>
      {label("festival.fHours")}
      <input value={f.hours} onChange={set("hours")} maxLength={100} placeholder={t("festival.phHours")} style={inputSt()}/>
      {label("festival.fLink")}
      <input value={f.link} onChange={set("link")} maxLength={300} placeholder="https://" inputMode="url" style={inputSt()}/>

      {/* 学生限定クーポン */}
      <div style={{marginTop:22,padding:14,borderRadius:10,border:`1px solid ${couponOn?COUPON_COLOR+"55":T.bd}`,background:couponOn?COUPON_COLOR+"08":T.bg2}}>
        <div role="switch" aria-checked={couponOn} onClick={()=>setCouponOn(v=>!v)} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
          <span style={{flexShrink:0,width:38,height:22,borderRadius:11,background:couponOn?COUPON_COLOR:T.bd,position:"relative",transition:"background .15s"}}>
            <span style={{position:"absolute",top:2,left:couponOn?18:2,width:18,height:18,borderRadius:"50%",background:"#fff",boxShadow:"0 1px 2px rgba(0,0,0,.2)",transition:"left .15s"}}/>
          </span>
          <span style={{fontSize:14,fontWeight:700,color:T.txH}}>{t("festival.couponOffer")}</span>
        </div>
        <div style={{fontSize:12,color:T.txD,marginTop:4,lineHeight:1.6}}>{t("festival.couponFormNote")}</div>
        {couponOn&&<>
          {label("festival.fCouponTitle",true)}
          <input value={cp.title} onChange={e=>setCp(p=>({...p,title:e.target.value}))} maxLength={40} placeholder={t("festival.phCouponTitle")} style={inputSt()}/>
          {label("festival.fCouponDetail")}
          <input value={cp.detail} onChange={e=>setCp(p=>({...p,detail:e.target.value}))} maxLength={200} placeholder={t("festival.phCouponDetail")} style={inputSt()}/>
          {label("festival.fCouponLimit")}
          <input value={cp.limit} onChange={e=>setCp(p=>({...p,limit:e.target.value.replace(/[^0-9]/g,"")}))} inputMode="numeric" maxLength={5} placeholder={t("festival.phCouponLimit")} style={{...inputSt(),maxWidth:160}}/>
          <div style={{fontSize:11,color:T.txD,marginTop:8,lineHeight:1.6}}>{t("festival.couponRuleNote")}</div>
        </>}
      </div>

      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:20}}>
        <button onClick={onCancel} disabled={saving} style={btnSt(false)}>{t("common.cancel")}</button>
        <button onClick={submit} disabled={saving} style={{...btnSt(true),opacity:saving?.6:1}}>{saving?t("festival.saving"):initial?t("festival.update"):t("festival.publish")}</button>
      </div>
    </div>
  );
};

// ── 使用済み画面（店員に見せる）。時計が動き続けるのでスクリーンショットの使い回しと区別できる ──
const UsedOverlay=({b,usedAt,onClose})=>{
  const [now,setNow]=useState(()=>new Date());
  useEffect(()=>{const id=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(id);},[]);
  const u=new Date(usedAt);
  return(
    <div style={{position:"fixed",inset:0,zIndex:1000,background:COUPON_COLOR,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <style>{`@keyframes fcStripe{from{background-position:0 0}to{background-position:56px 0}}`}</style>
      <div style={{width:"100%",maxWidth:380,background:"#fff",borderRadius:18,overflow:"hidden",color:"#111",textAlign:"center"}}>
        <div style={{height:14,background:`repeating-linear-gradient(135deg,${COUPON_COLOR} 0 14px,#fda4af 14px 28px)`,backgroundSize:"56px 14px",animation:"fcStripe 1s linear infinite"}}/>
        <div style={{padding:"22px 20px 18px"}}>
          <div style={{fontSize:13,fontWeight:700,color:COUPON_COLOR,letterSpacing:2}}>{t("festival.couponUsedLabel")}</div>
          <div style={{fontSize:26,fontWeight:900,marginTop:8,lineHeight:1.3}}>{b.coupon.title}</div>
          <div style={{fontSize:14,color:"#555",marginTop:6}}>{b.name}</div>
          <div style={{fontSize:44,fontWeight:800,fontVariantNumeric:"tabular-nums",marginTop:18,letterSpacing:1}}>{pad2(now.getHours())}:{pad2(now.getMinutes())}:{pad2(now.getSeconds())}</div>
          <div style={{fontSize:12,color:"#777",marginTop:4}}>{t("festival.couponUsedAt",{time:fmtMDHM(u)})}</div>
          <div style={{fontSize:12,color:"#777",marginTop:14,lineHeight:1.6,whiteSpace:"pre-line"}}>{t("festival.couponShowStaff")}</div>
          <button onClick={onClose} style={{marginTop:16,width:"100%",padding:"12px 0",borderRadius:10,border:"none",background:"#111",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{t("festival.couponClose")}</button>
        </div>
      </div>
    </div>
  );
};

const CouponPanel=({b,loggedIn,onLogin,couponOpen,onRedeem})=>{
  const [busy,setBusy]=useState(false);
  const [showUsed,setShowUsed]=useState(false);
  const c=b.coupon;
  if(!c) return null;
  const soldOut=c.limit!=null&&c.used>=c.limit&&!c.myUsedAt;
  const redeem=async()=>{
    if(!confirm(t("festival.couponConfirm"))) return;
    setBusy(true);
    try{await onRedeem(b.id);setShowUsed(true);}
    catch(e){showToast(e.message);}
    setBusy(false);
  };
  const big={width:"100%",padding:"12px 0",borderRadius:10,border:"none",fontSize:15,fontWeight:700,fontFamily:"inherit",cursor:"pointer"};
  const sub={...big,background:T.bg3,color:T.txH,border:`1px solid ${T.bd}`};
  const off={...big,background:T.bg3,color:T.txD,cursor:"default"};
  let action;
  if(b.isMine) action=<div style={{fontSize:13,color:T.txD}}>{t("festival.couponOwnerStats",{n:c.used})}{c.limit!=null?` / ${c.limit}`:""}</div>;
  else if(!loggedIn) action=<button onClick={onLogin} style={sub}>{t("festival.couponLogin")}</button>;
  else if(c.myUsedAt) action=<button onClick={()=>setShowUsed(true)} style={sub}>{t("festival.couponShowUsed")}</button>;
  else if(soldOut) action=<button disabled style={off}>{t("festival.couponSoldOut")}</button>;
  else if(!couponOpen) action=<button disabled style={off}>{t("festival.couponNotYet")}</button>;
  else action=<button onClick={redeem} disabled={busy} style={{...big,background:COUPON_COLOR,color:"#fff",opacity:busy?.6:1}}>{t("festival.couponUse")}</button>;
  return(
    <div style={{marginTop:18,borderRadius:12,border:`1.5px dashed ${COUPON_COLOR}`,background:COUPON_COLOR+"0a",padding:16}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
        <span style={{fontSize:11,fontWeight:700,color:COUPON_COLOR,letterSpacing:1}}>{t("festival.couponTag")}</span>
        <span style={{fontSize:11,color:T.txD}}>{c.myUsedAt?t("festival.couponUsedShort"):c.limit!=null?t("festival.couponRemaining",{n:Math.max(0,c.limit-c.used)}):t("festival.couponOnePerPerson")}</span>
      </div>
      <div style={{fontSize:20,fontWeight:800,color:T.txH,marginTop:6,lineHeight:1.3}}>{c.title}</div>
      {c.detail&&<div style={{fontSize:13,color:T.tx,marginTop:4,lineHeight:1.6}}>{c.detail}</div>}
      <div style={{marginTop:12}}>{action}</div>
      {!b.isMine&&loggedIn&&!c.myUsedAt&&!soldOut&&<div style={{fontSize:11,color:T.txD,marginTop:8,textAlign:"center"}}>{t("festival.couponHowTo")}</div>}
      {showUsed&&c.myUsedAt&&<UsedOverlay b={b} usedAt={c.myUsedAt} onClose={()=>setShowUsed(false)}/>}
    </div>
  );
};

// ── 詳細 ──
const BoothDetail=({b,mob,loggedIn,onLogin,couponOpen,onRedeem,isAdmin,onBack,onLike,onEdit,onDelete,onHide,onReport,goToBuilding})=>{
  const c=CAT_MAP[b.category]||CAT_MAP.other;
  const place=placeText(b);
  const row=(icon,text)=>text&&<div style={{display:"flex",gap:8,alignItems:"flex-start",fontSize:14,color:T.tx,marginTop:8}}><span style={{display:"flex",color:T.txD,transform:"scale(.85)"}}>{icon}</span><span style={{flex:1}}>{text}</span></div>;
  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{flexShrink:0,display:"flex",alignItems:"center",gap:8,padding:"10px 16px",borderBottom:`1px solid ${T.bd}`,background:T.bg2}}>
        <div onClick={onBack} style={{cursor:"pointer",color:T.txD,display:"flex",padding:4}}>{I.back}</div>
        <span onClick={onBack} style={{fontSize:13,color:T.txD,cursor:"pointer"}}>{t("festival.backToList")}</span>
      </div>
      <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
        <div style={{maxWidth:640,margin:"0 auto"}}>
          <Cover b={b} h={mob?220:300}/>
          <div style={{padding:mob?16:24}}>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
              <Tag color={c.color}>{t(c.labelKey)}</Tag>
              {b.hidden&&<Tag color={T.red}>{t("festival.hiddenTag")}</Tag>}
            </div>
            <div style={{fontSize:21,fontWeight:800,color:T.txH,lineHeight:1.3}}>{b.name}</div>
            {b.org&&<div style={{fontSize:13,color:T.txD,marginTop:3}}>{b.org}</div>}
            {row(I.pin,place)}
            {row(I.clock,b.hours)}
            <CouponPanel b={b} loggedIn={loggedIn} onLogin={onLogin} couponOpen={couponOpen} onRedeem={onRedeem}/>
            {b.description&&<div style={{fontSize:15,color:T.tx,lineHeight:1.75,whiteSpace:"pre-wrap",marginTop:14}}><Tx>{b.description}</Tx></div>}

            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginTop:18,paddingTop:14,borderTop:`1px solid ${T.bd}`}}>
              <LikeBtn b={b} onLike={onLike}/>
              {b.building&&goToBuilding&&<button onClick={()=>goToBuilding(b.building)} style={btnSt(false)}><span style={{display:"flex",transform:"scale(.8)"}}>{I.map}</span>{t("festival.showMap")}</button>}
              {b.link&&<a href={b.link} target="_blank" rel="noopener noreferrer" style={{...btnSt(false),textDecoration:"none"}}>{t("festival.openLink")}</a>}
            </div>

            <div style={{display:"flex",gap:14,flexWrap:"wrap",marginTop:18,fontSize:12}}>
              {b.isMine&&<span onClick={onEdit} style={{color:T.accent,cursor:"pointer",fontWeight:600}}>{t("festival.edit")}</span>}
              {(b.isMine||isAdmin)&&<span onClick={onDelete} style={{color:T.red,cursor:"pointer",fontWeight:600}}>{t("festival.delete")}</span>}
              {isAdmin&&<span onClick={onHide} style={{color:T.txD,cursor:"pointer",fontWeight:600}}>{b.hidden?t("festival.unhide"):t("festival.hide")}</span>}
              {loggedIn&&!b.isMine&&<span onClick={onReport} style={{color:T.txD,cursor:"pointer"}}>{t("festival.report")}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Main View ──
export const FestivalView=({mob,loggedIn,onLogin,goToBuilding})=>{
  const {booths,isAdmin,loading,save,toggleLike,remove,toggleHidden,redeemCoupon,couponOpen}=useFestival();
  const [couponOnly,setCouponOnly]=useState(false);
  const [cat,setCat]=useState(null);
  const [q,setQ]=useState("");
  const [sortBy,setSortBy]=useState("new");
  const [mineOnly,setMineOnly]=useState(false);
  const [openId,setOpenId]=useState(null);
  const [editing,setEditing]=useState(null); // null | "new" | booth
  const [reporting,setReporting]=useState(null);

  const like=(id)=>{if(!loggedIn){showToast(t("festival.loginToLike"));return;}toggleLike(id);};

  const shown=useMemo(()=>{
    let r=booths;
    if(mineOnly) r=r.filter(b=>b.isMine);
    if(couponOnly) r=r.filter(b=>b.coupon);
    if(cat) r=r.filter(b=>b.category===cat);
    const n=q.trim().toLowerCase();
    if(n) r=r.filter(b=>[b.name,b.org,b.description,b.location,SPOT_MAP[b.building]?.label].some(s=>(s||"").toLowerCase().includes(n)));
    if(sortBy==="popular") r=[...r].sort((a,b)=>b.likeCount-a.likeCount);
    return r;
  },[booths,cat,q,sortBy,mineOnly,couponOnly]);

  if(editing){
    const initial=editing==="new"?null:editing;
    return <div style={{flex:1,overflowY:"auto"}}><BoothForm initial={initial} onCancel={()=>setEditing(null)} onSave={async(f,file,rm)=>{
      const b=await save(initial?.id,f,file,rm);
      showToast(initial?t("festival.updated"):t("festival.published"));
      setEditing(null);setOpenId(b.id);
    }}/></div>;
  }

  const open=openId?booths.find(b=>b.id===openId):null;
  if(open){
    return <>
      <BoothDetail b={open} mob={mob} loggedIn={loggedIn} onLogin={onLogin} couponOpen={couponOpen} onRedeem={redeemCoupon} isAdmin={isAdmin} goToBuilding={goToBuilding}
        onBack={()=>setOpenId(null)} onLike={like} onEdit={()=>setEditing(open)}
        onDelete={async()=>{if(!confirm(t("festival.confirmDelete")))return;try{await remove(open.id);setOpenId(null);showToast(t("festival.deleted"));}catch(e){showToast(e.message);}}}
        onHide={()=>toggleHidden(open.id).catch(e=>showToast(e.message))}
        onReport={()=>setReporting(open)}/>
      {reporting&&<ReportModal targetType="festival_booth" targetId={reporting.id} targetUserId={reporting.ownerId} onClose={()=>setReporting(null)}/>}
    </>;
  }

  const myCount=booths.filter(b=>b.isMine).length;
  const chip=(on,color,onClick,children,key)=><span key={key} onClick={onClick} style={{flexShrink:0,padding:"5px 11px",borderRadius:16,fontSize:12,fontWeight:600,cursor:"pointer",border:`1px solid ${on?color:T.bd}`,background:on?color+"20":T.bg2,color:on?color:T.txD,whiteSpace:"nowrap"}}>{children}</span>;

  return(
    <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
      <div style={{maxWidth:1100,margin:"0 auto",padding:mob?12:20}}>
        {/* 開催情報 */}
        <div style={{borderRadius:14,padding:mob?16:20,background:"linear-gradient(135deg,#f59e0b22,#ec489922,#6366f122)",border:`1px solid ${T.bd}`}}>
          <div style={{fontSize:mob?19:22,fontWeight:800,color:T.txH}}>{t(FESTIVAL.nameKey)}</div>
          <div style={{fontSize:13,color:T.tx,marginTop:6,lineHeight:1.7}}>{FESTIVAL.dates}　{FESTIVAL.place}<br/><span style={{color:T.txD,fontSize:12}}>{FESTIVAL.hours}</span></div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:12}}>
            {loggedIn
              ?<button onClick={()=>setEditing("new")} style={btnSt(true)}><span style={{display:"flex",transform:"scale(.8)"}}>{I.plus}</span>{t("festival.add")}</button>
              :<button onClick={onLogin} style={btnSt(true)}>{t("festival.loginToAdd")}</button>}
            <a href={FESTIVAL.url} target="_blank" rel="noopener noreferrer" style={{...btnSt(false),textDecoration:"none"}}>{t("festival.officialSite")}</a>
          </div>
        </div>

        {/* 検索・絞り込み */}
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder={t("festival.search")} style={{...inputSt(),marginTop:14,background:T.bg2}}/>
        <div style={{display:"flex",gap:6,overflowX:"auto",padding:"10px 0 2px",scrollbarWidth:"none"}}>
          {chip(!cat,T.accent,()=>setCat(null),t("festival.all"),"all")}
          {CATEGORIES.map(c=>chip(cat===c.id,c.color,()=>setCat(cat===c.id?null:c.id),t(c.labelKey),c.id))}
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center",padding:"8px 0 12px",flexWrap:"wrap"}}>
          {chip(sortBy==="new",T.accent,()=>setSortBy("new"),t("festival.sortNew"),"new")}
          {chip(sortBy==="popular",T.accent,()=>setSortBy("popular"),t("festival.sortPopular"),"pop")}
          {booths.some(b=>b.coupon)&&chip(couponOnly,COUPON_COLOR,()=>setCouponOnly(v=>!v),t("festival.couponFilter"),"coupon")}
          {myCount>0&&chip(mineOnly,T.accent,()=>setMineOnly(v=>!v),t("festival.mineOnly",{n:myCount}),"mine")}
          <span style={{marginLeft:"auto",fontSize:12,color:T.txD}}>{t("festival.count",{n:shown.length})}</span>
        </div>

        {loading?<Loader/>:shown.length===0?(
          <div style={{textAlign:"center",padding:"40px 16px",color:T.txD,fontSize:13,lineHeight:1.8,whiteSpace:"pre-line"}}>
            {booths.length===0?t("festival.emptyAll"):t("festival.emptyFiltered")}
          </div>
        ):(
          <div style={{display:"grid",gridTemplateColumns:`repeat(auto-fill,minmax(${mob?150:220}px,1fr))`,gap:mob?10:14}}>
            {shown.map(b=><BoothCard key={b.id} b={b} onOpen={setOpenId} onLike={like}/>)}
          </div>
        )}
      </div>
    </div>
  );
};
