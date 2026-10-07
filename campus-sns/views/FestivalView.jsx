import React, { useState, useMemo, useRef, useEffect } from "react";
import { T } from "../theme.js";
import { t } from "../i18n.js";
import { I } from "../icons.jsx";
import { Tag, Tx, Loader, Av, useQRCode } from "../shared.jsx";
import { QRScanner } from "../components/QRScanner.jsx";
import { useFestival } from "../hooks/useFestival.js";
import { useCurrentUser } from "../hooks/useCurrentUser.js";
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
export const CAT_MAP=Object.fromEntries(CATEGORIES.map(c=>[c.id,c]));
const SPOT_LIST=SPOTS.filter(s=>s.id);
export const SPOT_MAP=Object.fromEntries(SPOT_LIST.map(s=>[s.id,s]));

const inputSt=()=>({width:"100%",boxSizing:"border-box",padding:"9px 12px",borderRadius:8,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:14,outline:"none",fontFamily:"inherit"});
const btnSt=(primary)=>({display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,padding:"8px 14px",borderRadius:8,border:primary?"none":`1px solid ${T.bd}`,background:primary?T.accent:T.bg3,color:primary?"#fff":T.txH,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"});

const COUPON_COLOR="#e11d48";
const MIN_MEMBERS=3; // 掲載条件: 代表者を含むアプリ登録メンバー数（サーバーと同じ値）
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

// ── 申請の下書き（この端末の localStorage に保存）──
// 画像は一時保存の時点で公開バケットへ上げ、パスだけを持つ。メンバーの証明は24時間で失効するので期限も持つ。
const DRAFT_PREFIX="festivalDraft:";
const MEMBER_PROOF_MS=24*3600e3;
export const draftKeyFor=(uid,boothId)=>`${DRAFT_PREFIX}${uid||"me"}:${boothId||"new"}`;
export const readDraft=(k)=>{try{return JSON.parse(localStorage.getItem(k)||"null");}catch{return null;}};
const writeDraft=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true;}catch{return false;}};
export const removeDraft=(k)=>{try{localStorage.removeItem(k);}catch{}};

// ── 登録・編集フォーム ──
const EMPTY={name:"",org:"",category:"food",description:"",building:"",location:"",hours:"",link:""};
const BoothForm=({initial,onSave,onCancel,apply,scanMember,draftKey,uploadDraftImage})=>{
  // apply: 掲載申請モード。新規申請ではメンバーのQRを読み取って追加する（変更申請では不要）
  // draftKey: 指定すると一時保存（自動保存＋「一時保存」ボタン）が有効になる
  const needMembers=apply&&!initial;
  const [draft]=useState(()=>draftKey?readDraft(draftKey):null);
  const [members,setMembers]=useState(()=>(draft?.members||[]).filter(m=>Date.now()-(m.at||0)<MEMBER_PROOF_MS)); // [{proof, member, at}]
  const droppedMembers=(draft?.members?.length||0)-members.length;
  const [scanning,setScanning]=useState(false);
  const onScan=(raw)=>{
    if(typeof raw!=="string"||!raw.startsWith("ISCTFEST1:")) return false;
    scanMember(raw).then(r=>{
      if(members.some(m=>m.member.id===r.member.id)){showToast(t("festival.memberDup",{name:r.member.name}));return;}
      setMembers(p=>p.some(m=>m.member.id===r.member.id)?p:[...p,{...r,at:Date.now()}]);
      showToast(t("festival.memberAdded",{name:r.member.name}));
    }).catch(e=>showToast(e.message)).finally(()=>setScanning(false));
    return true;
  };
  const [f,setF]=useState(()=>draft?.f||(initial?{...EMPTY,...Object.fromEntries(Object.keys(EMPTY).map(k=>[k,initial[k]||EMPTY[k]]))}:EMPTY));
  const [file,setFile]=useState(null);
  const [draftImage,setDraftImage]=useState(draft?.image||null); // 一時保存で上げ済みの画像 {path,url}
  const [preview,setPreview]=useState(draft?.image?.url||(draft?.removeImage?null:initial?.imageUrl)||null);
  const [removeImage,setRemoveImage]=useState(!!draft?.removeImage);
  const [couponOn,setCouponOn]=useState(draft?draft.couponOn:!!initial?.coupon);
  const [cp,setCp]=useState(()=>draft?.cp||{title:initial?.coupon?.title||"",detail:initial?.coupon?.detail||"",limit:initial?.coupon?.limit?String(initial.coupon.limit):""});
  const [saving,setSaving]=useState(false);
  const [draftSaving,setDraftSaving]=useState(false);
  const [savedAt,setSavedAt]=useState(draft?.savedAt||null);

  // 入力のたびに自動で下書き保存（画像ファイルは「一時保存」ボタンで上げるまで含めない）
  const snapshot=()=>({f,couponOn,cp,members,image:draftImage,removeImage,savedAt:Date.now()});
  const firstRun=useRef(true);
  useEffect(()=>{
    if(!draftKey) return;
    if(firstRun.current){firstRun.current=false;return;} // 開いただけでは保存しない
    const id=setTimeout(()=>{const d=snapshot();if(writeDraft(draftKey,d))setSavedAt(d.savedAt);},800);
    return()=>clearTimeout(id);
  },[f,couponOn,cp,members,draftImage,removeImage]);// eslint-disable-line react-hooks/exhaustive-deps

  const saveDraft=async()=>{
    setDraftSaving(true);
    try{
      let img=draftImage;
      if(file){img=await uploadDraftImage(file);setDraftImage(img);setFile(null);}
      const d={...snapshot(),image:img};
      if(!writeDraft(draftKey,d)) throw new Error(t("festival.draftSaveFailed"));
      setSavedAt(d.savedAt);showToast(t("festival.draftSaved"));
    }catch(e){showToast(e.message||t("festival.draftSaveFailed"));}
    setDraftSaving(false);
  };
  const discardDraft=()=>{
    if(!confirm(t("festival.draftConfirmDiscard"))) return;
    removeDraft(draftKey);onCancel();
  };
  const fileRef=useRef(null);
  const set=(k)=>(e)=>setF(p=>({...p,[k]:e.target.value}));

  useEffect(()=>()=>{if(preview?.startsWith("blob:"))URL.revokeObjectURL(preview);},[preview]);

  const pick=(e)=>{
    const fl=e.target.files?.[0];
    e.target.value="";
    if(!fl) return;
    if(!fl.type.startsWith("image/")){showToast(t("festival.imageOnly"));return;}
    setFile(fl);setDraftImage(null);setRemoveImage(false);setPreview(URL.createObjectURL(fl));
  };
  const submit=async()=>{
    if(!f.name.trim()){showToast(t("festival.nameRequired"));return;}
    if(couponOn&&!cp.title.trim()){showToast(t("festival.couponTitleRequired"));return;}
    if(needMembers&&members.length+1<MIN_MEMBERS){showToast(t("festival.applyNeedMembers",{n:MIN_MEMBERS-1-members.length}));return;}
    setSaving(true);
    try{
      await onSave({...f,coupon:couponOn?{title:cp.title,detail:cp.detail,limit:cp.limit.trim()||null}:null,imagePath:!file&&draftImage?draftImage.path:undefined},file,removeImage,members.map(m=>m.proof));
      if(draftKey) removeDraft(draftKey);
    }
    catch(e){showToast(e.message||t("toast.saveFailed"));setSaving(false);}
  };
  const label=(k,req)=><div style={{fontSize:12,fontWeight:600,color:T.txH,margin:"12px 0 5px"}}>{t(k)}{req&&<span style={{color:T.red}}> *</span>}</div>;

  return(
    <div style={{maxWidth:560,margin:"0 auto",padding:16}}>
      <div style={{fontSize:17,fontWeight:700,color:T.txH,marginBottom:4}}>{apply?(initial?t("festival.changeTitle"):t("festival.applyTitle")):initial?t("festival.editTitle"):t("festival.newTitle")}</div>
      <div style={{fontSize:12,color:T.txD,lineHeight:1.6}}>{apply?t("festival.applyNote"):t("festival.formNote")}</div>
      {draft&&<div style={{marginTop:12,padding:"10px 12px",borderRadius:8,background:T.bg3,border:`1px solid ${T.bd}`,fontSize:12,color:T.tx,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <span style={{flex:1,minWidth:180}}>{t("festival.draftRestored",{time:fmtMDHM(new Date(draft.savedAt))})}{droppedMembers>0&&<><br/><span style={{color:T.red}}>{t("festival.draftMembersExpired",{n:droppedMembers})}</span></>}</span>
        <span onClick={discardDraft} style={{color:T.red,cursor:"pointer",fontWeight:600,whiteSpace:"nowrap"}}>{t("festival.draftDiscard")}</span>
      </div>}

      {needMembers&&<div style={{marginTop:16,padding:14,borderRadius:10,border:`1px solid ${T.accent}40`,background:T.accent+"0a"}}>
        <div style={{display:"flex",alignItems:"baseline",gap:8}}>
          <div style={{fontSize:14,fontWeight:700,color:T.txH}}>{t("festival.membersTitle")}</div>
          <span style={{fontSize:12,fontWeight:700,color:members.length+1>=MIN_MEMBERS?T.green:T.txD}}>{t("festival.membersCount",{n:members.length+1,min:MIN_MEMBERS})}</span>
        </div>
        <div style={{fontSize:12,color:T.txD,marginTop:4,lineHeight:1.6}}>{t("festival.membersNote")}</div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginTop:10,fontSize:13,color:T.txH}}>
          <span style={{fontSize:11,color:T.txD,width:48}}>{t("festival.repLabel")}</span>{t("festival.you")}
        </div>
        {members.map(({member})=>(
          <div key={member.id} style={{display:"flex",alignItems:"center",gap:8,marginTop:8}}>
            <span style={{fontSize:11,color:T.green,width:48}}>{t("festival.verified")}</span>
            <Av u={{name:member.name,col:member.color,av:member.avatar||member.name?.[0]}} sz={22}/>
            <span style={{flex:1,fontSize:13,color:T.txH}}>{member.name}</span>
            <span onClick={()=>setMembers(p=>p.filter(m=>m.member.id!==member.id))} style={{color:T.txD,cursor:"pointer",display:"flex",padding:4}}>{I.x}</span>
          </div>
        ))}
        {scanning
          ?<div style={{marginTop:12}}><QRScanner onResult={onScan} onClose={()=>setScanning(false)} title={t("festival.scanTitle")} desc={t("festival.scanDesc")}/></div>
          :members.length<20&&<button onClick={()=>setScanning(true)} style={{...btnSt(true),marginTop:12,width:"100%"}}><span style={{display:"flex",transform:"scale(.8)"}}>{I.qr}</span>{t("festival.scanMember")}</button>}
      </div>}

      {label("festival.fImage")}
      <div onClick={()=>fileRef.current?.click()} style={{borderRadius:10,overflow:"hidden",border:`1px dashed ${T.bd}`,cursor:"pointer",background:T.bg3}}>
        {preview?<img src={preview} alt="" style={{width:"100%",maxHeight:220,objectFit:"cover",display:"block"}}/>
          :<div style={{height:120,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,color:T.txD,fontSize:12}}>{I.img}{t("festival.pickImage")}</div>}
      </div>
      {preview&&<div onClick={()=>{setFile(null);setDraftImage(null);setPreview(null);setRemoveImage(true);}} style={{fontSize:12,color:T.red,cursor:"pointer",marginTop:6}}>{t("festival.removeImage")}</div>}
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

      {draftKey&&savedAt&&<div style={{fontSize:11,color:T.txD,textAlign:"right",marginTop:16}}>{t("festival.draftAutoSaved",{time:fmtMDHM(new Date(savedAt))})}{file&&<span style={{color:T.red}}>{t("festival.draftImagePending")}</span>}</div>}
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:draftKey&&savedAt?8:20,flexWrap:"wrap"}}>
        <button onClick={onCancel} disabled={saving} style={btnSt(false)}>{draftKey?t("festival.draftClose"):t("common.cancel")}</button>
        {draftKey&&<button onClick={saveDraft} disabled={saving||draftSaving} style={{...btnSt(false),opacity:draftSaving?.6:1}}>{draftSaving?t("festival.saving"):t("festival.draftSave")}</button>}
        <button onClick={submit} disabled={saving} style={{...btnSt(true),opacity:saving?.6:1}}>{saving?t("festival.saving"):apply?t("festival.submitApply"):initial?t("festival.update"):t("festival.publish")}</button>
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
  if(b.canEdit||b.isMine) action=<div style={{fontSize:13,color:T.txD}}>{t("festival.couponOwnerStats",{n:c.used})}{c.limit!=null?` / ${c.limit}`:""}</div>;
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
      {!b.canEdit&&!b.isMine&&loggedIn&&!c.myUsedAt&&!soldOut&&<div style={{fontSize:11,color:T.txD,marginTop:8,textAlign:"center"}}>{t("festival.couponHowTo")}</div>}
      {showUsed&&c.myUsedAt&&<UsedOverlay b={b} usedAt={c.myUsedAt} onClose={()=>setShowUsed(false)}/>}
    </div>
  );
};

// ── 詳細 ──
const BoothDetail=({b,mob,loggedIn,onLogin,couponOpen,onRedeem,onRequestChange,isAdmin,onBack,onLike,onEdit,onDelete,onHide,onReport,goToBuilding})=>{
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
              {b.isMine&&!b.canEdit&&<span onClick={onRequestChange} style={{color:T.accent,cursor:"pointer",fontWeight:600}}>{t("festival.requestChange")}</span>}
              {b.canEdit&&<span onClick={onEdit} style={{color:T.accent,cursor:"pointer",fontWeight:600}}>{t("festival.edit")}</span>}
              {b.canEdit&&<span onClick={onDelete} style={{color:T.red,cursor:"pointer",fontWeight:600}}>{t("festival.delete")}</span>}
              {isAdmin&&<span onClick={onHide} style={{color:T.txD,cursor:"pointer",fontWeight:600}}>{b.hidden?t("festival.unhide"):t("festival.hide")}</span>}
              {loggedIn&&!b.canEdit&&!b.isMine&&<span onClick={onReport} style={{color:T.txD,cursor:"pointer"}}>{t("festival.report")}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── メンバー用QR（代表者に読み取ってもらう）。有効期限が短いので表示中は自動で取り直す ──
const MemberQrModal=({getMemberQr,onClose})=>{
  const ready=useQRCode();
  const [code,setCode]=useState(null);
  const [left,setLeft]=useState(0);
  const [err,setErr]=useState(null);
  useEffect(()=>{
    let alive=true,timer=null;
    const load=async()=>{
      try{const r=await getMemberQr();if(!alive)return;setCode(r.code);setLeft(r.ttl);setErr(null);timer=setTimeout(load,Math.max(10,r.ttl-15)*1000);}
      catch(e){if(alive)setErr(e.message);}
    };
    load();
    return()=>{alive=false;clearTimeout(timer);};
  },[getMemberQr]);
  useEffect(()=>{const id=setInterval(()=>setLeft(v=>Math.max(0,v-1)),1000);return()=>clearInterval(id);},[]);
  const src=useMemo(()=>{
    if(!ready||!code||!window.qrcode) return null;
    try{const qr=window.qrcode(0,"M");qr.addData(code);qr.make();return qr.createDataURL(8,4);}catch{return null;}
  },[ready,code]);
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(0,0,0,.55)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:340,background:T.bg2,borderRadius:16,padding:20,textAlign:"center"}}>
        <div style={{fontSize:16,fontWeight:800,color:T.txH}}>{t("festival.memberQrTitle")}</div>
        <div style={{fontSize:12,color:T.txD,marginTop:6,lineHeight:1.6}}>{t("festival.memberQrNote")}</div>
        <div style={{margin:"16px auto 8px",width:240,height:240,borderRadius:12,background:"#fff",display:"flex",alignItems:"center",justifyContent:"center"}}>
          {err?<span style={{fontSize:12,color:T.red,padding:12}}>{err}</span>:src?<img src={src} alt="" style={{width:224,height:224,imageRendering:"pixelated"}}/>:<Loader size="sm"/>}
        </div>
        <div style={{fontSize:11,color:T.txD}}>{t("festival.memberQrRefresh",{n:left})}</div>
        <button onClick={onClose} style={{...btnSt(false),marginTop:14,width:"100%"}}>{t("festival.couponClose")}</button>
      </div>
    </div>
  );
};

// ── 「出店を宣伝しませんか？」 ──
const PromoCard=({mob,loggedIn,onLogin,onApply,onShowQr})=>(
  <div style={{marginTop:12,borderRadius:14,padding:mob?14:18,border:`1px solid ${T.bd}`,background:T.bg2,display:"flex",flexDirection:mob?"column":"row",alignItems:mob?"stretch":"center",gap:12}}>
    <div style={{flex:1,minWidth:0}}>
      <div style={{fontSize:15,fontWeight:800,color:T.txH}}>{t("festival.promoTitle")}</div>
      <div style={{fontSize:12,color:T.txD,marginTop:4,lineHeight:1.7}}>{t("festival.promoBody")}</div>
    </div>
    {loggedIn
      ?<div style={{display:"flex",flexDirection:"column",gap:8,flexShrink:0}}>
        <button onClick={onApply} style={btnSt(true)}>{t("festival.promoApply")}</button>
        <button onClick={onShowQr} style={btnSt(false)}><span style={{display:"flex",transform:"scale(.8)"}}>{I.qr}</span>{t("festival.showMemberQr")}</button>
      </div>
      :<button onClick={onLogin} style={{...btnSt(false),flexShrink:0}}>{t("festival.promoLogin")}</button>}
  </div>
);

// ── 自分の申請 ──
const APP_STATUS={
  pending:{key:"festival.stPending",color:"#f59e0b"},
  approved:{key:"festival.stApproved",color:"#10b981"},
  rejected:{key:"festival.stRejected",color:"#e11d48"},
  withdrawn:{key:"festival.stWithdrawn",color:"#64748b"},
};
const MyApplications=({apps,draft,onResume,onWithdraw})=>{
  const shown=apps.filter(a=>a.status!=="withdrawn");
  if(!shown.length&&!draft) return null;
  return(
    <div style={{marginTop:12,borderRadius:14,border:`1px solid ${T.bd}`,background:T.bg2,padding:"12px 14px"}}>
      <div style={{fontSize:13,fontWeight:700,color:T.txH,marginBottom:4}}>{t("festival.myApps")}</div>
      {draft&&<div style={{display:"flex",alignItems:"flex-start",gap:8,padding:"8px 0",borderTop:`1px solid ${T.bd}`}}>
        <Tag color={T.txD}>{t("festival.stDraft")}</Tag>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:600,color:T.txH}}>{draft.f?.name||t("festival.draftUntitled")}</div>
          <div style={{fontSize:11,color:T.txD,marginTop:2}}>{t("festival.draftSavedAt",{time:fmtMDHM(new Date(draft.savedAt))})}</div>
        </div>
        <span onClick={onResume} style={{fontSize:12,color:T.accent,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>{t("festival.draftResume")}</span>
      </div>}
      {shown.map(a=>{const st=APP_STATUS[a.status]||APP_STATUS.pending;return(
        <div key={a.id} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"8px 0",borderTop:`1px solid ${T.bd}`}}>
          <Tag color={st.color}>{t(st.key)}</Tag>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:600,color:T.txH}}>{a.name}{a.boothId&&a.status!=="approved"?<span style={{fontSize:11,color:T.txD,fontWeight:400}}> {t("festival.changeSuffix")}</span>:null}</div>
            {a.status==="pending"&&<div style={{fontSize:11,color:T.txD,marginTop:2}}>{t("festival.pendingNote")}</div>}
            {a.status==="rejected"&&a.rejectReason&&<div style={{fontSize:11,color:T.txD,marginTop:2}}>{t("festival.rejectReason",{r:a.rejectReason})}</div>}
          </div>
          {a.status==="pending"&&<span onClick={()=>onWithdraw(a.id)} style={{fontSize:12,color:T.txD,cursor:"pointer",whiteSpace:"nowrap"}}>{t("festival.withdraw")}</span>}
        </div>
      );})}
    </div>
  );
};

// ── Main View ──
export const FestivalView=({mob,loggedIn,onLogin,goToBuilding})=>{
  const user=useCurrentUser();
  const uid=user?.moodleId||user?.id;
  const {booths,isAdmin,myApps,apply,withdraw,getMemberQr,scanMember,uploadDraftImage,loading,save,toggleLike,remove,toggleHidden,redeemCoupon,couponOpen}=useFestival();
  const [couponOnly,setCouponOnly]=useState(false);
  const [cat,setCat]=useState(null);
  const [q,setQ]=useState("");
  const [sortBy,setSortBy]=useState("new");
  const [openId,setOpenId]=useState(null);
  const [editing,setEditing]=useState(null); // null | "new" | booth（運営の直接編集）
  const [applying,setApplying]=useState(null); // null | "new" | booth（代表者の掲載・変更申請）
  const [showQr,setShowQr]=useState(false);
  const [reporting,setReporting]=useState(null);

  const like=(id)=>{if(!loggedIn){showToast(t("festival.loginToLike"));return;}toggleLike(id);};

  const shown=useMemo(()=>{
    let r=booths;
    if(couponOnly) r=r.filter(b=>b.coupon);
    if(cat) r=r.filter(b=>b.category===cat);
    const n=q.trim().toLowerCase();
    if(n) r=r.filter(b=>[b.name,b.org,b.description,b.location,SPOT_MAP[b.building]?.label].some(s=>(s||"").toLowerCase().includes(n)));
    if(sortBy==="popular") r=[...r].sort((a,b)=>b.likeCount-a.likeCount);
    return r;
  },[booths,cat,q,sortBy,couponOnly]);

  if(editing){
    const initial=editing==="new"?null:editing;
    return <div style={{flex:1,overflowY:"auto"}}><BoothForm initial={initial} onCancel={()=>setEditing(null)} onSave={async(f,file,rm)=>{
      const b=await save(initial?.id,f,file,rm);
      showToast(initial?t("festival.updated"):t("festival.published"));
      setEditing(null);setOpenId(b.id);
    }}/></div>;
  }

  if(applying){
    const initial=applying==="new"?null:applying;
    return <div style={{flex:1,overflowY:"auto"}}><BoothForm apply scanMember={scanMember} uploadDraftImage={uploadDraftImage} draftKey={draftKeyFor(uid,initial?.id)} initial={initial} onCancel={()=>setApplying(null)} onSave={async(f,file,rm,proofs)=>{
      await apply(f,file,rm,proofs,initial?.id);
      showToast(t("festival.applied"));
      setApplying(null);setOpenId(null);
    }}/></div>;
  }

  const open=openId?booths.find(b=>b.id===openId):null;
  if(open){
    return <>
      <BoothDetail b={open} mob={mob} loggedIn={loggedIn} onLogin={onLogin} couponOpen={couponOpen} onRedeem={redeemCoupon} isAdmin={isAdmin} goToBuilding={goToBuilding}
        onBack={()=>setOpenId(null)} onLike={like} onEdit={()=>setEditing(open)} onRequestChange={()=>setApplying(open)}
        onDelete={async()=>{if(!confirm(t("festival.confirmDelete")))return;try{await remove(open.id);setOpenId(null);showToast(t("festival.deleted"));}catch(e){showToast(e.message);}}}
        onHide={()=>toggleHidden(open.id).catch(e=>showToast(e.message))}
        onReport={()=>setReporting(open)}/>
      {reporting&&<ReportModal targetType="festival_booth" targetId={reporting.id} onClose={()=>setReporting(null)}/>}
    </>;
  }

  const chip=(on,color,onClick,children,key)=><span key={key} onClick={onClick} style={{flexShrink:0,padding:"5px 11px",borderRadius:16,fontSize:12,fontWeight:600,cursor:"pointer",border:`1px solid ${on?color:T.bd}`,background:on?color+"20":T.bg2,color:on?color:T.txD,whiteSpace:"nowrap"}}>{children}</span>;

  return(
    <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
      <div style={{maxWidth:1100,margin:"0 auto",padding:mob?12:20}}>
        {/* 開催情報 */}
        <div style={{borderRadius:14,padding:mob?16:20,background:"linear-gradient(135deg,#f59e0b22,#ec489922,#6366f122)",border:`1px solid ${T.bd}`}}>
          <div style={{fontSize:mob?19:22,fontWeight:800,color:T.txH}}>{t(FESTIVAL.nameKey)}</div>
          <div style={{fontSize:13,color:T.tx,marginTop:6,lineHeight:1.7}}>{FESTIVAL.dates}　{FESTIVAL.place}<br/><span style={{color:T.txD,fontSize:12}}>{FESTIVAL.hours}</span></div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:12}}>
            {isAdmin&&<button onClick={()=>setEditing("new")} style={btnSt(true)}><span style={{display:"flex",transform:"scale(.8)"}}>{I.plus}</span>{t("festival.add")}</button>}
            <a href={FESTIVAL.url} target="_blank" rel="noopener noreferrer" style={{...btnSt(false),textDecoration:"none"}}>{t("festival.officialSite")}</a>
          </div>
        </div>

        {/* 出店の宣伝を受け付ける（登録は運営が代行） */}
        {!isAdmin&&<PromoCard mob={mob} loggedIn={loggedIn} onLogin={onLogin} onApply={()=>setApplying("new")} onShowQr={()=>setShowQr(true)}/>}
        {showQr&&<MemberQrModal getMemberQr={getMemberQr} onClose={()=>setShowQr(false)}/>}
        {loggedIn&&<MyApplications apps={myApps} draft={readDraft(draftKeyFor(uid))} onResume={()=>setApplying("new")} onWithdraw={id=>{if(confirm(t("festival.confirmWithdraw")))withdraw(id).catch(e=>showToast(e.message));}}/>}

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
