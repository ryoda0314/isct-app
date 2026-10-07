import React, { useState, useEffect, useCallback } from "react";
import { T } from "../theme.js";
import { t } from "../i18n.js";
import { Tag, Loader } from "../shared.jsx";
import { showToast } from "../hooks/useToast.js";
import { CAT_MAP, SPOT_MAP } from "./FestivalView.jsx";

// 管理画面「工大祭」タブ: 出店の掲載・変更申請を審査する
const FILTERS=[
  {id:"pending",key:"festival.stPending"},
  {id:"approved",key:"festival.stApproved"},
  {id:"rejected",key:"festival.stRejected"},
  {id:"all",key:"festival.all"},
];
const STATUS_COLOR={pending:"#f59e0b",approved:"#10b981",rejected:"#e11d48",withdrawn:"#64748b"};
const MIN_MEMBERS=3;

const fmt=(iso)=>{if(!iso)return "";const d=new Date(iso);return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;};

const AppCard=({a,onApprove,onReject})=>{
  const [busy,setBusy]=useState(false);
  const b=a.booth||{};
  const c=CAT_MAP[b.category]||CAT_MAP.other;
  const place=[SPOT_MAP[b.building]?.label,b.location].filter(Boolean).join(" ");
  const registered=a.members.filter(m=>m.registered).length+1; // +1 = 代表者
  const enough=registered>=MIN_MEMBERS;
  const run=async(fn)=>{setBusy(true);try{await fn();}catch(e){showToast(e.message);}setBusy(false);};
  const btn=(bg,fg)=>({padding:"8px 16px",borderRadius:8,border:bg===T.bg3?`1px solid ${T.bd}`:"none",background:bg,color:fg,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",opacity:busy?.6:1});
  return(
    <div style={{border:`1px solid ${T.bd}`,borderRadius:12,background:T.bg2,overflow:"hidden"}}>
      <div style={{display:"flex",gap:12,padding:14,flexWrap:"wrap"}}>
        {b.imageUrl&&<img src={b.imageUrl} alt="" style={{width:160,height:100,objectFit:"cover",borderRadius:8,flexShrink:0}}/>}
        <div style={{flex:1,minWidth:220}}>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
            <Tag color={STATUS_COLOR[a.status]}>{t(`festival.st${a.status[0].toUpperCase()}${a.status.slice(1)}`)}</Tag>
            <Tag color={a.boothId?"#6366f1":T.accent}>{a.boothId&&a.status==="pending"?t("festival.admChange"):t("festival.admNew")}</Tag>
            <Tag color={c.color}>{t(c.labelKey)}</Tag>
            {b.coupon_title&&<Tag color="#e11d48">{t("festival.couponTag")}</Tag>}
            <span style={{fontSize:11,color:T.txD}}>{fmt(a.createdAt)}</span>
          </div>
          <div style={{fontSize:16,fontWeight:800,color:T.txH,marginTop:6}}>{b.name}</div>
          {a.boothId&&a.currentBoothName&&a.currentBoothName!==b.name&&<div style={{fontSize:11,color:T.txD}}>{t("festival.admCurrentName",{n:a.currentBoothName})}</div>}
          {b.org&&<div style={{fontSize:12,color:T.txD,marginTop:2}}>{b.org}</div>}
          <div style={{fontSize:12,color:T.tx,marginTop:6,lineHeight:1.6}}>
            {place&&<div>{t("festival.admPlace")}: {place}</div>}
            {b.hours&&<div>{t("festival.fHours")}: {b.hours}</div>}
            {b.link&&<div>{t("festival.fLink")}: <a href={b.link} target="_blank" rel="noopener noreferrer" style={{color:T.accent}}>{b.link}</a></div>}
            {b.coupon_title&&<div>{t("festival.couponTag")}: {b.coupon_title}{b.coupon_detail?`（${b.coupon_detail}）`:""}{b.coupon_limit?` / ${t("festival.admCouponLimit",{n:b.coupon_limit})}`:""}</div>}
          </div>
          {b.description&&<div style={{fontSize:12,color:T.tx,marginTop:6,whiteSpace:"pre-wrap",lineHeight:1.6,maxHeight:120,overflowY:"auto",padding:8,borderRadius:6,background:T.bg3}}>{b.description}</div>}
        </div>
      </div>

      <div style={{padding:"10px 14px",borderTop:`1px solid ${T.bd}`,display:"flex",gap:16,flexWrap:"wrap",fontSize:12}}>
        <div style={{minWidth:200}}>
          <div style={{fontWeight:700,color:T.txH,marginBottom:4}}>{t("festival.admApplicant")}</div>
          <div style={{color:T.tx}}>{a.applicant?.name||"—"} <span style={{color:T.txD}}>({a.applicant?.login})</span></div>
        </div>
        <div style={{flex:1,minWidth:220}}>
          <div style={{fontWeight:700,color:enough?T.green:T.red,marginBottom:4}}>{t("festival.admMembers",{n:registered,min:MIN_MEMBERS})}</div>
          {a.members.map(m=>(
            <div key={m.login} style={{display:"flex",gap:6,color:m.registered?T.tx:T.red}}>
              <span style={{width:14}}>{m.registered?"✓":"✗"}</span>
              <span>{m.login}</span>
              <span style={{color:T.txD}}>{m.registered?(m.name||t("festival.admRegistered")):t("festival.admNotRegistered")}</span>
            </div>
          ))}
        </div>
      </div>

      {a.status==="pending"
        ?<div style={{padding:"10px 14px",borderTop:`1px solid ${T.bd}`,display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button disabled={busy} onClick={()=>{const r=prompt(t("festival.admRejectPrompt"));if(r===null)return;run(()=>onReject(a.id,r));}} style={btn(T.bg3,T.txH)}>{t("festival.admReject")}</button>
          <button disabled={busy} onClick={()=>{if(!enough&&!confirm(t("festival.admApproveAnyway")))return;run(()=>onApprove(a.id));}} style={btn(T.green,"#fff")}>{a.boothId?t("festival.admApproveChange"):t("festival.admApprove")}</button>
        </div>
        :a.status==="rejected"&&a.rejectReason&&<div style={{padding:"8px 14px",borderTop:`1px solid ${T.bd}`,fontSize:12,color:T.txD}}>{t("festival.rejectReason",{r:a.rejectReason})}</div>}
    </div>
  );
};

export const FestivalAdminTab=()=>{
  const [status,setStatus]=useState("pending");
  const [apps,setApps]=useState(null);

  const load=useCallback(async()=>{
    setApps(null);
    try{
      const r=await fetch(`/api/festival/applications?scope=admin&status=${status}`);
      const d=await r.json();
      if(!r.ok) throw new Error(d.error);
      setApps(d.applications||[]);
    }catch(e){showToast(e.message||t("toast.saveFailed"));setApps([]);}
  },[status]);
  useEffect(()=>{load();},[load]);

  const act=async(id,action,reason)=>{
    const r=await fetch("/api/festival/applications",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,action,reason})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(d.error||t("toast.saveFailed"));
    showToast(action==="approve"?t("festival.admApproved"):t("festival.admRejected"));
    setApps(prev=>status==="pending"?prev.filter(a=>a.id!==id):prev.map(a=>a.id===id?{...a,status:action==="approve"?"approved":"rejected",rejectReason:reason||null}:a));
  };

  return(
    <div style={{padding:16,display:"flex",flexDirection:"column",gap:12,maxWidth:900,width:"100%",boxSizing:"border-box",margin:"0 auto"}}>
      <div>
        <div style={{fontSize:16,fontWeight:800,color:T.txH}}>{t("festival.admTitle")}</div>
        <div style={{fontSize:12,color:T.txD,marginTop:4,lineHeight:1.6}}>{t("festival.admDesc",{min:MIN_MEMBERS})}</div>
      </div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
        {FILTERS.map(f=><span key={f.id} onClick={()=>setStatus(f.id)} style={{padding:"5px 11px",borderRadius:16,fontSize:12,fontWeight:600,cursor:"pointer",border:`1px solid ${status===f.id?T.accent:T.bd}`,background:status===f.id?T.accent+"20":T.bg2,color:status===f.id?T.accent:T.txD}}>{t(f.key)}</span>)}
        <span onClick={load} style={{marginLeft:"auto",fontSize:12,color:T.accent,cursor:"pointer",fontWeight:600}}>{t("festival.admReload")}</span>
      </div>
      {apps===null?<Loader size="sm"/>:apps.length===0
        ?<div style={{textAlign:"center",padding:32,color:T.txD,fontSize:13}}>{t("festival.admEmpty")}</div>
        :apps.map(a=><AppCard key={a.id} a={a} onApprove={id=>act(id,"approve")} onReject={(id,r)=>act(id,"reject",r)}/>)}
    </div>
  );
};
