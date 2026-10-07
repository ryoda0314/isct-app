import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { T } from "../theme.js";
import { t } from "../i18n.js";
import { I } from "../icons.jsx";
import { useLeaflet, Loader } from "../shared.jsx";
import { CAMPUS_CENTER, CAMPUS_ZOOM, SPOTS, SPOT_CATS, ENTRANCES, AREAS, roomToSpot } from "../hooks/useLocationSharing.js";
import { useNavigation, NAV_SPOTS } from "../hooks/useNavigation.js";
import { createCampusBasemap, isDarkColor } from "../campusBasemap.js";
import { getNextClass } from "../todayClasses.js";

const ROUTE_COL="#1a8ef0"; // ルート線（地図アプリの慣例どおり青）
const PIN_SVG=(col)=>`<svg width="36" height="46" viewBox="0 0 36 46"><path d="M18 44C18 44 3 29.5 3 18a15 15 0 0130 0c0 11.5-15 26-15 26z" fill="${col}" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><circle cx="18" cy="18" r="5.5" fill="#fff"/></svg>`;
const hm=([h,m])=>`${h}:${String(m).padStart(2,"0")}`;

const NAV_QUICK_DEFAULT=["taki","eki","lib","main","coop","gym","w5"];
// Returns raw IDs including cat: and grp: prefixes
const getNavQuickRaw=()=>{try{const v=localStorage.getItem("navQuickSpots");return v?JSON.parse(v):NAV_QUICK_DEFAULT;}catch{return NAV_QUICK_DEFAULT;}};
export { NAV_QUICK_DEFAULT };
const NON_GEO_NAV=new Set(["suzu","home_loc","commute","off_campus"]);
const haversineNav=(lat1,lng1,lat2,lng2)=>{
  const R=6371e3,toRad=d=>d*Math.PI/180;
  const dLat=toRad(lat2-lat1),dLng=toRad(lng2-lng1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
};
// 2点間の方位角（度, 北=0, 時計回り）
const bearingNav=(lat1,lng1,lat2,lng2)=>{
  const toRad=d=>d*Math.PI/180,toDeg=r=>r*180/Math.PI;
  const dLng=toRad(lng2-lng1);
  const y=Math.sin(dLng)*Math.cos(toRad(lat2));
  const x=Math.cos(toRad(lat1))*Math.sin(toRad(lat2))-Math.sin(toRad(lat1))*Math.cos(toRad(lat2))*Math.cos(dLng);
  return (toDeg(Math.atan2(y,x))+360)%360;
};
const pointInPolyNav=(lat,lng,poly)=>{
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const [yi,xi]=poly[i],[yj,xj]=poly[j];
    if((yi>lat)!==(yj>lat)&&lng<(xj-xi)*(lat-yi)/(yj-yi)+xi)inside=!inside;
  }
  return inside;
};
const findNearestNavSpot=(lat,lng)=>{
  // 1) ポリゴン判定: AREAS内のポリゴンに含まれるか
  for(const [id,poly] of Object.entries(AREAS)){
    if(NON_GEO_NAV.has(id)||poly.length<3)continue;
    if(pointInPolyNav(lat,lng,poly)){
      const spot=NAV_SPOTS.find(s=>s.id===id);
      if(spot)return {spot,distance:0};
    }
  }
  // 2) 入口ベース: 最も近い入口の建物を優先
  let bestEntSpot=null,bestEntDist=Infinity;
  for(const ent of ENTRANCES){
    if(!ent.spot||NON_GEO_NAV.has(ent.spot))continue;
    const d=haversineNav(lat,lng,ent.lat,ent.lng);
    if(d<bestEntDist){bestEntDist=d;bestEntSpot=ent.spot;}
  }
  if(bestEntSpot&&bestEntDist<100){
    const spot=NAV_SPOTS.find(s=>s.id===bestEntSpot);
    if(spot)return {spot,distance:bestEntDist};
  }
  // 3) フォールバック: 入口データがない建物は中心点で判定
  let best=null,bestDist=Infinity;
  for(const s of NAV_SPOTS){
    if(!s.id||s.lat==null||NON_GEO_NAV.has(s.id))continue;
    const d=haversineNav(lat,lng,s.lat,s.lng);
    if(d<bestDist){bestDist=d;best=s;}
  }
  return {spot:best,distance:bestDist};
};

/* ── Spot group definitions ── */
export const SPOT_GROUPS=[
  {prefix:"bench",labelKey:"navi.grpBench",col:"#8bc34a"},
  {prefix:"park",labelKey:"navi.grpPark",col:"#78909c"},
  {prefix:"vend_d",labelKey:"navi.grpVendDrink",col:"#42a5f5"},
  {prefix:"vend_f",labelKey:"navi.grpVendFood",col:"#ff8a65"},
  {prefix:"smoke",labelKey:"navi.grpSmoke",col:"#b0bec5"},
  {prefix:"rest",labelKey:"navi.grpRest",col:"#e8843a"},
];
const getGroupPrefix=(id)=>{const g=SPOT_GROUPS.find(g=>id.startsWith(g.prefix+"_"));return g?g.prefix:null;};
const isGroupableSpot=(s)=>(s.cat==="outdoor"||s.cat==="restaurant")&&getGroupPrefix(s.id)!=null;

/* ── スポット選択シート（検索・出発地・目的地で共通） ── */
const RECENT_KEY="navRecentSpots";
const getRecent=()=>{try{const v=JSON.parse(localStorage.getItem(RECENT_KEY)||"[]");return Array.isArray(v)?v:[];}catch{return [];}};
const pushRecent=(id)=>{if(!id)return;try{localStorage.setItem(RECENT_KEY,JSON.stringify([id,...getRecent().filter(x=>x!==id)].slice(0,6)));}catch{}};
const normQ=(s)=>String(s||"").normalize("NFKC").toLowerCase().replace(/\s+/g,"");
const catLabelOf=(id)=>SPOT_CATS.find(c=>c.id===id)?.label||"";
const fmtDist=(m)=>m<1000?`${Math.max(10,Math.round(m/10)*10)}m`:`${(m/1000).toFixed(1)}km`;
// 教室番号（W9-311 / S2-203 / WL1-301 / 西9号館311 など）から建物を引く
const roomHit=(q)=>{
  const raw=String(q||"").normalize("NFKC").trim().toUpperCase();
  if(raw.length<3||!/\d/.test(raw)||!/-|号館/.test(raw))return null;
  const sp=roomToSpot(raw);
  const s=sp&&NAV_SPOTS.find(x=>x.id===sp.id);
  return s?{s,room:raw}:null;
};
// 略称・名前・IDの一致度で並べる（「W9」「図書」「taki」など）
const rankSpots=(q)=>{
  const nq=normQ(q);
  if(!nq)return [];
  const scored=[];
  NAV_SPOTS.forEach(s=>{
    const label=normQ(s.label),short=normQ(s.short),id=s.id.toLowerCase();
    const score=short===nq||id===nq?100:label.startsWith(nq)?80:short.startsWith(nq)?70:label.includes(nq)?60:id.includes(nq)?40:-1;
    if(score>=0)scored.push({s,score});
  });
  return scored.sort((a,b)=>b.score-a.score||a.s.label.length-b.s.label.length).map(x=>x.s);
};

const SpotBadge=({s,size=36,on})=>(
  <div style={{width:size,height:size,borderRadius:Math.round(size*0.3),background:on?s.col:`${s.col}22`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
    {s.cat==="restaurant"
      ?<svg width={Math.round(size*0.46)} height={Math.round(size*0.46)} viewBox="0 0 24 24" fill={on?"#fff":s.col}><path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z"/></svg>
      :<span style={{fontSize:size<30?(s.short.length>=3?8.5:10):(s.short.length>=3?10:12),fontWeight:800,color:on?"#fff":s.col,letterSpacing:"-.02em",lineHeight:1}}>{s.short}</span>}
  </div>
);
const GroupBadge=({col,size=36})=>(
  <div style={{width:size,height:size,borderRadius:Math.round(size*0.3),background:`${col}26`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
    <svg width={Math.round(size*0.42)} height={Math.round(size*0.42)} viewBox="0 0 24 24" fill={col}><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/></svg>
  </div>
);
const ellipsis={overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"};

/**
 * mode: "search"（スポットを探す）| "origin"（出発地）| "destination"（目的地）
 * refPos: 「ベンチ」などのグループを選んだとき、ここから一番近いものを選ぶ（出発地/目的地モード）
 */
const SpotPicker=({mode,value,mob,gpsPos,refPos,nextCls,nextClsSpot,gpsLoading,onPick,onPickGroup,onGps,onPickOnMap,onClear,onClose})=>{
  const accent=T.accent;
  const [q,setQ]=useState("");
  const [openCat,setOpenCat]=useState(null);
  const [active,setActive]=useState(0);
  const inputRef=useRef(null);
  const listRef=useRef(null);
  const searching=q.trim().length>0;
  const placeholder=t(mode==="origin"?"navi.searchOrigin":mode==="destination"?"navi.searchDest":"navi.searchAny");
  const distOf=(s)=>gpsPos&&s.lat!=null?haversineNav(gpsPos.lat,gpsPos.lng,s.lat,s.lng):null;
  const subOf=(s,extra)=>{const d=distOf(s);return [extra,catLabelOf(s.cat),d!=null?fmtDist(d):null].filter(Boolean).join(" · ");};
  const pick=(s,extra)=>{pushRecent(s.id);onPick(s,extra);};
  const pickGroup=(prefix)=>{
    if(mode==="search"){onPickGroup?.(prefix);return;}
    const members=NAV_SPOTS.filter(s=>s.id.startsWith(prefix+"_"));
    const ref=refPos||gpsPos;
    const best=ref?members.reduce((b,s)=>{const d=haversineNav(ref.lat,ref.lng,s.lat,s.lng);return !b||d<b.d?{s,d}:b;},null)?.s:members[0];
    if(best)pick(best);
  };

  // 検索結果（キーボードで上下できるよう平らな配列にする）
  const results=useMemo(()=>{
    if(!searching)return [];
    const nq=normQ(q);
    const out=[];
    const rh=roomHit(q);
    if(rh)out.push({kind:"room",s:rh.s,room:rh.room});
    const ranked=rankSpots(q).filter(s=>!(rh&&s.id===rh.s.id));
    const members={};
    ranked.forEach(s=>{if(isGroupableSpot(s)){const p=getGroupPrefix(s.id);(members[p]=members[p]||[]).push(s);}});
    // ベンチ・自販機などは、グループ名に当たったか4件以上ならまとめて1行に
    const collapsed=new Set(SPOT_GROUPS.filter(g=>normQ(t(g.labelKey)).includes(nq)||(members[g.prefix]||[]).length>3).map(g=>g.prefix));
    SPOT_GROUPS.forEach(g=>{if(collapsed.has(g.prefix))out.push({kind:"group",g,count:NAV_SPOTS.filter(s=>s.id.startsWith(g.prefix+"_")).length});});
    ranked.forEach(s=>{if(!(isGroupableSpot(s)&&collapsed.has(getGroupPrefix(s.id))))out.push({kind:"spot",s});});
    return out.slice(0,60);
  },[q,searching]);
  useEffect(()=>{setActive(0);},[q]);
  useEffect(()=>{listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({block:"nearest"});},[active]);
  const choose=(r)=>{if(!r)return;if(r.kind==="group")pickGroup(r.g.prefix);else pick(r.s,r.kind==="room"?{room:r.room}:undefined);};
  const onKey=(e)=>{
    e.stopPropagation();
    if(e.key==="Escape"){e.preventDefault();if(openCat&&!searching)setOpenCat(null);else onClose();return;}
    if(!searching||!results.length)return;
    if(e.key==="ArrowDown"){e.preventDefault();setActive(a=>Math.min(results.length-1,a+1));}
    else if(e.key==="ArrowUp"){e.preventDefault();setActive(a=>Math.max(0,a-1));}
    else if(e.key==="Enter"){e.preventDefault();choose(results[active]||results[0]);}
  };
  const hl=(text)=>{
    const nq=q.normalize("NFKC").toLowerCase().trim();
    const i=nq?text.normalize("NFKC").toLowerCase().indexOf(nq):-1;
    if(i<0)return text;
    return <>{text.slice(0,i)}<span style={{color:accent,fontWeight:800}}>{text.slice(i,i+nq.length)}</span>{text.slice(i+nq.length)}</>;
  };

  const row=(key,{idx,title,sub,on,icon,onClick})=>{
    const isActive=searching&&idx===active;
    return <button key={key} data-idx={idx} onClick={onClick} onMouseEnter={()=>{if(idx!=null)setActive(idx);}} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"8px 10px",minHeight:54,borderRadius:14,border:"none",background:isActive?T.bg3:on?`${accent}14`:"transparent",cursor:"pointer",textAlign:"left",boxSizing:"border-box",transition:"background .12s"}}>
      {icon}
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:14.5,fontWeight:on?800:600,color:T.txH,...ellipsis}}>{title}</div>
        {sub&&<div style={{fontSize:11.5,color:T.txD,marginTop:2,...ellipsis}}>{sub}</div>}
      </div>
      {on&&<span style={{display:"flex",color:accent,flexShrink:0}}>{I.chk}</span>}
    </button>;
  };
  const chip=(key,{s,label,col,count,on,onClick})=>(
    <button key={key} onClick={onClick} style={{display:"inline-flex",alignItems:"center",gap:7,padding:s?"4px 12px 4px 4px":"7px 12px",borderRadius:22,border:`1px solid ${on?accent:T.bd}`,background:on?`${accent}14`:T.bg2,cursor:"pointer",maxWidth:"100%",boxSizing:"border-box"}}>
      {s?<SpotBadge s={s} size={28} on={on}/>:<span style={{width:9,height:9,borderRadius:3,background:col||T.txD,flexShrink:0}}/>}
      <span style={{fontSize:13,fontWeight:700,color:T.txH,...ellipsis}}>{label}</span>
      {count!=null&&<span style={{fontSize:11.5,color:T.txD,flexShrink:0}}>{count}</span>}
    </button>
  );
  const section=(title,children)=>(
    <div style={{marginTop:16}}>
      <div style={{fontSize:11,fontWeight:800,color:T.txD,letterSpacing:".06em",padding:"0 4px 8px"}}>{title}</div>
      {children}
    </div>
  );
  const action=(key,{col,icon,label,onClick,disabled})=>(
    <button key={key} onClick={onClick} disabled={disabled} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"8px 13px",borderRadius:20,border:`1px solid ${col}45`,background:`${col}12`,color:col,fontSize:12.5,fontWeight:700,cursor:disabled?"wait":"pointer",opacity:disabled?.6:1}}>
      <span style={{display:"flex"}}>{icon}</span>{label}
    </button>
  );

  const recent=getRecent().map(id=>NAV_SPOTS.find(s=>s.id===id)).filter(Boolean);
  const quick=getNavQuickRaw().map(id=>{
    if(id.startsWith("cat:")){const catId=id.slice(4);const cat=SPOT_CATS.find(c=>c.id===catId);return cat?{type:"cat",key:id,label:cat.label,count:NAV_SPOTS.filter(s=>s.cat===catId).length,go:()=>setOpenCat(catId)}:null;}
    if(id.startsWith("grp:")){const pfx=id.slice(4);const g=SPOT_GROUPS.find(x=>x.prefix===pfx);return g?{type:"grp",key:id,label:t(g.labelKey),col:g.col,count:NAV_SPOTS.filter(s=>s.id.startsWith(pfx+"_")).length,go:()=>pickGroup(pfx)}:null;}
    const s=NAV_SPOTS.find(x=>x.id===id);return s?{type:"spot",key:id,s}:null;
  }).filter(Boolean);
  const cats=SPOT_CATS.filter(c=>NAV_SPOTS.some(s=>s.cat===c.id));
  const byDistance=(a,b)=>{const da=distOf(a),db=distOf(b);return da!=null&&db!=null?da-db:a.label.localeCompare(b.label,"ja");};

  let body;
  if(searching){
    body=results.length?results.map((r,idx)=>{
      if(r.kind==="group")return row(`g:${r.g.prefix}`,{idx,title:hl(t(r.g.labelKey)),sub:mode==="search"?t("navi.itemsCount",{n:r.count}):t("navi.nearestPick"),icon:<GroupBadge col={r.g.col}/>,onClick:()=>pickGroup(r.g.prefix)});
      const on=r.s.id===value;
      return row(`${r.kind}:${r.s.id}`,{idx,title:r.kind==="room"?r.s.label:hl(r.s.label),sub:subOf(r.s,r.kind==="room"?t("navi.roomIn",{room:r.room}):null),on,icon:<SpotBadge s={r.s} on={on}/>,onClick:()=>choose(r)});
    }):<div style={{padding:"36px 12px",textAlign:"center"}}>
      <div style={{fontSize:14,fontWeight:700,color:T.txH}}>{t("navi.notFound")}</div>
      <div style={{fontSize:12,color:T.txD,marginTop:6}}>{t("navi.searchHint")}</div>
    </div>;
  }else if(openCat){
    const catGroups=SPOT_GROUPS.filter(g=>NAV_SPOTS.some(s=>s.cat===openCat&&s.id.startsWith(g.prefix+"_")));
    const catSpots=NAV_SPOTS.filter(s=>s.cat===openCat&&!isGroupableSpot(s)).sort(byDistance);
    body=<>
      <button onClick={()=>setOpenCat(null)} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 6px",border:"none",background:"transparent",cursor:"pointer",color:T.txH,fontSize:15,fontWeight:800}}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        {catLabelOf(openCat)}
        <span style={{fontSize:12,fontWeight:600,color:T.txD}}>{t("navi.itemsCount",{n:catSpots.length+catGroups.length})}</span>
      </button>
      {catGroups.map(g=>row(g.prefix,{title:t(g.labelKey),sub:mode==="search"?t("navi.itemsCount",{n:NAV_SPOTS.filter(s=>s.id.startsWith(g.prefix+"_")).length}):t("navi.nearestPick"),icon:<GroupBadge col={g.col}/>,onClick:()=>pickGroup(g.prefix)}))}
      {catSpots.map(s=>{const on=s.id===value;return row(s.id,{title:s.label,sub:subOf(s),on,icon:<SpotBadge s={s} on={on}/>,onClick:()=>pick(s)});})}
    </>;
  }else{
    body=<>
      {mode!=="search"&&(onGps||onPickOnMap||(value&&onClear))&&<div style={{display:"flex",flexWrap:"wrap",gap:8,padding:"4px 2px 0"}}>
        {onGps&&action("gps",{col:ROUTE_COL,disabled:gpsLoading,onClick:onGps,label:gpsLoading?t("navi.locating"):t("navi.currentLocation"),icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/><circle cx="12" cy="12" r="8"/></svg>})}
        {onPickOnMap&&action("map",{col:T.tx,onClick:onPickOnMap,label:t("navi.pickOnMap"),icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>})}
        {value&&onClear&&action("clear",{col:T.red,onClick:onClear,label:t("navi.clearSelection"),icon:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>})}
      </div>}
      {mode!=="origin"&&nextCls&&nextClsSpot&&section(t(nextCls.st==="now"?"navi.nowClass":"navi.nextClass"),
        <button onClick={()=>pick(nextClsSpot)} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"10px 12px",borderRadius:14,border:`1px solid ${accent}40`,background:`${accent}10`,cursor:"pointer",textAlign:"left",boxSizing:"border-box"}}>
          <div style={{width:36,height:36,borderRadius:11,background:`${accent}22`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:11.5,fontWeight:800,color:accent}}>{nextCls.pd.l} {hm(nextCls.pd.s)}〜</div>
            <div style={{fontSize:14.5,fontWeight:800,color:T.txH,marginTop:1,...ellipsis}}>{nextCls.co.name}</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:3,flexShrink:0,fontSize:12.5,fontWeight:800,color:T.txH}}>
            {nextClsSpot.label.replace(/・.*$/,"")}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        </button>
      )}
      {recent.length>0&&section(t("navi.recent"),
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>{recent.map(s=>chip(s.id,{s,label:s.label.replace(/・.*$/,""),on:s.id===value,onClick:()=>pick(s)}))}</div>
      )}
      {section(t("navi.frequentlyUsed"),
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>{quick.map(it=>it.type==="spot"
          ?chip(it.key,{s:it.s,label:it.s.label.replace(/・.*$/,""),on:it.s.id===value,onClick:()=>pick(it.s)})
          :chip(it.key,{label:it.label,col:it.col,count:it.count,onClick:it.go}))}</div>
      )}
      {section(t("navi.browseByArea"),
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {cats.map(c=><button key={c.id} onClick={()=>setOpenCat(c.id)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:6,padding:"12px 12px 12px 14px",borderRadius:14,border:`1px solid ${T.bd}`,background:T.bg2,cursor:"pointer",textAlign:"left",minWidth:0}}>
            <span style={{fontSize:13.5,fontWeight:700,color:T.txH,...ellipsis}}>{c.label}</span>
            <span style={{display:"flex",alignItems:"center",gap:2,fontSize:12,color:T.txD,flexShrink:0}}>{NAV_SPOTS.filter(s=>s.cat===c.id).length}<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg></span>
          </button>)}
        </div>
      )}
    </>;
  }

  return <>
    <div onClick={onClose} style={{position:"absolute",inset:0,zIndex:1000,background:mob?"rgba(10,20,30,.2)":"transparent"}}/>
    <div onMouseDown={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()} onKeyUp={e=>e.stopPropagation()} style={{position:"absolute",top:mob?10:14,left:mob?10:14,right:mob?10:"auto",bottom:mob?10:"auto",width:mob?"auto":440,maxHeight:mob?undefined:"calc(100% - 28px)",zIndex:1001,display:"flex",flexDirection:"column",background:T.bg2,borderRadius:22,border:`1px solid ${T.bdL}`,boxShadow:"0 28px 60px -24px rgba(0,0,0,.55), 0 2px 8px rgba(0,0,0,.12)",overflow:"hidden",animation:"navPickerIn .18s ease-out"}}>
      <div style={{display:"flex",alignItems:"center",gap:4,padding:"10px 12px 10px 6px",borderBottom:`1px solid ${T.bd}`,flexShrink:0}}>
        <button onClick={onClose} aria-label={t("common.back")} style={{width:38,height:38,borderRadius:19,border:"none",background:"transparent",color:T.tx,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0}}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style={{flex:1,position:"relative",minWidth:0}}>
          <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",display:"flex",color:T.txD,pointerEvents:"none"}}>
            {mode==="origin"
              ?<span style={{width:12,height:12,borderRadius:6,border:`2.5px solid ${T.txD}`,boxSizing:"border-box"}}/>
              :mode==="destination"
                ?<svg width="16" height="16" viewBox="0 0 24 24" fill={accent}><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/></svg>
                :I.search}
          </span>
          <input ref={inputRef} autoFocus value={q} onChange={e=>{setQ(e.target.value);if(openCat)setOpenCat(null);}} onKeyDown={onKey} placeholder={placeholder} enterKeyHint="search" autoComplete="off" spellCheck={false}
            style={{width:"100%",padding:"11px 38px 11px 38px",borderRadius:14,border:`1.5px solid ${accent}`,background:T.bg3,color:T.txH,fontSize:mob?16:15,outline:"none",boxSizing:"border-box"}}/>
          {q&&<button onClick={()=>{setQ("");inputRef.current?.focus();}} aria-label={t("navi.clearSelection")} style={{position:"absolute",right:7,top:"50%",transform:"translateY(-50%)",width:26,height:26,borderRadius:13,border:"none",background:T.bg4,color:T.tx,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",padding:0}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>}
        </div>
      </div>
      <div ref={listRef} style={{flex:mob?1:"0 1 auto",overflowY:"auto",padding:"6px 10px 16px",WebkitOverflowScrolling:"touch",maxHeight:mob?undefined:560,overscrollBehavior:"contain"}}>
        {body}
      </div>
    </div>
  </>;
};

/* ── ルート線（白い縁取り＋青い線＋流れる点） ── */
const drawRouteLine=(L,map,latlngs)=>{
  const casing=L.polyline(latlngs,{color:"#ffffff",weight:12,opacity:0.95,lineCap:"round",lineJoin:"round",interactive:false}).addTo(map);
  const line=L.polyline(latlngs,{color:ROUTE_COL,weight:6.5,opacity:1,lineCap:"round",lineJoin:"round",interactive:false}).addTo(map);
  const flow=L.polyline(latlngs,{color:"#ffffff",weight:2.6,opacity:0.95,lineCap:"round",dashArray:"0.1 16",className:"nav-route-flow",interactive:false}).addTo(map);
  // GPS更新で描き直しても流れが途切れないよう、アニメーションの位相を時刻に合わせる
  const el=flow.getElement?.();
  if(el)el.style.animationDelay=`-${Math.round(performance.now()%800)}ms`;
  return [casing,line,flow];
};
// ルートが新しく出たときに、出発地から線を引いていく
const drawRouteIn=(map,lines)=>{
  let done=false;
  const run=()=>{
    if(done)return;
    done=true;
    lines.forEach(l=>{
      const el=l.getElement?.();
      if(!el||!el.getTotalLength)return;
      const len=el.getTotalLength();
      el.style.transition="none";
      el.style.strokeDasharray=`${len} ${len}`;
      el.style.strokeDashoffset=`${len}`;
      el.getBoundingClientRect();
      el.style.transition="stroke-dashoffset .9s cubic-bezier(.65,0,.35,1)";
      el.style.strokeDashoffset="0";
      setTimeout(()=>{el.style.transition="";el.style.strokeDasharray="";el.style.strokeDashoffset="";},1000);
    });
  };
  map.once("moveend",run);
  setTimeout(run,400);
};

/* ── NavigationView ── */
export const NavigationView=({mob,initialDest,initialOrig,onDestUsed,qDataAll})=>{
  const leafletReady=useLeaflet();
  const mapRef=useRef(null);
  const mapInst=useRef(null);
  const layersRef=useRef([]);
  const overlayRef=useRef(null);
  // 地図の見た目: "illust"（イラスト地図・既定）| "photo"（航空写真）
  const [basemap,setBasemap]=useState(()=>{try{return localStorage.getItem("navBasemap")==="photo"?"photo":"illust";}catch{return "illust";}});
  const [bmData,setBmData]=useState(null);
  const [bmVersion,setBmVersion]=useState(0); // イラスト地図を作り直したら増やす（マーカーの描き直し用）
  const [outOfRegion,setOutOfRegion]=useState(false);
  const photoLayersRef=useRef([]);
  const basemapRef=useRef(null);
  const spotTapRef=useRef(null);
  const animatedDestRef=useRef(null);
  const gpsMarkerRef=useRef(null);
  const gpsCircleRef=useRef(null);
  const {origin,setOrigin,destination,setDestination,route,swap,gpsOriginPos,setGpsOriginPos}=useNavigation();
  const [selectMode,setSelectMode]=useState(null);
  const [panelMin,setPanelMin]=useState(false);
  const [searchMin,setSearchMin]=useState(true);
  const [navPhase,setNavPhase]=useState(initialDest?"route":"search"); // "search" | "group" | "detail" | "route"
  const [spotGroup,setSpotGroup]=useState(null); // e.g. "bench", "park"
  const [gpsPos,setGpsPos]=useState(null);
  const [gpsLoading,setGpsLoading]=useState(false);
  // 案内モード（GPS追従+コンパス）
  const [guiding,setGuiding]=useState(false);
  const [heading,setHeading]=useState(null);
  const headingRef=useRef(null);
  const watchIdRef=useRef(null);
  const prevGpsRef=useRef(null);
  const GPS_SMOOTH=0.35;
  const routeCoordsRef=useRef(null);
  const initialBearingRef=useRef(null);
  const compassPermRef=useRef(false); // コンパス権限取得済みか
  const guidingOriginRef=useRef(null); // 案内開始時の出発地点（固定表示用）
  // 自動追従モード（案内中にユーザーがドラッグしたらfalse）
  const [following,setFollowing]=useState(true);
  const guidingRef=useRef(false);
  useEffect(()=>{guidingRef.current=guiding;},[guiding]);
  // 出発地がGPS（現在地）由来かどうか
  const [originFromGps,setOriginFromGps]=useState(false);
  const gpsCenteredRef=useRef(false);
  const fittedGroupRef=useRef(null);
  const fittedDetailRef=useRef(null);
  const fittedRouteRef=useRef(null);

  // 位置情報の利用同意。地図を開いた瞬間にOSの許可ダイアログを出さず、用途を説明してから求める。
  // 位置は端末内の地図表示・ルート案内にのみ使い、このビューからサーバーへは送信しない。
  const [locConsent,setLocConsent]=useState(()=>{try{return localStorage.getItem("mapLocConsent");}catch{return null;}}); // "granted" | "declined" | null
  const [locDenied,setLocDenied]=useState(false);   // OS/ブラウザ側でブロックされている
  const [locDeniedMsg,setLocDeniedMsg]=useState(false); // ユーザー操作で取得を試みて拒否された
  const [pageVisible,setPageVisible]=useState(()=>typeof document==="undefined"||document.visibilityState!=="hidden");
  const saveLocConsent=(v)=>{setLocConsent(v);try{localStorage.setItem("mapLocConsent",v);}catch{}};
  useEffect(()=>{
    // すでにOS側で許可済みなら説明は省略、ブロック済みなら案内を出さない
    if(locConsent||!navigator.permissions?.query)return;
    navigator.permissions.query({name:"geolocation"}).then(p=>{
      if(p.state==="granted")saveLocConsent("granted");
      else if(p.state==="denied")setLocDenied(true);
    }).catch(()=>{});
  },[]);// eslint-disable-line react-hooks/exhaustive-deps
  // バックグラウンド中はGPSを止めて電池消費を抑える
  useEffect(()=>{
    const on=()=>setPageVisible(document.visibilityState!=="hidden");
    document.addEventListener("visibilitychange",on);
    return()=>document.removeEventListener("visibilitychange",on);
  },[]);
  const onGeoOk=()=>{if(locConsent!=="granted")saveLocConsent("granted");setLocDenied(false);setLocDeniedMsg(false);};
  const onGeoErr=(err,userInitiated)=>{if(err?.code===1){setLocDenied(true);if(userInitiated)setLocDeniedMsg(true);}};
  const requestLocation=()=>{
    if(!navigator.geolocation)return;
    navigator.geolocation.getCurrentPosition(onGeoOk,(e)=>onGeoErr(e,true),{enableHighAccuracy:true,timeout:10000,maximumAge:30000});
  };

  // マップ表示用の常時GPS更新（案内中はstartWatchが担当するのでスキップ）
  // 同意済みかつ画面表示中のときだけ動かす
  useEffect(()=>{
    if(guiding||!navigator.geolocation||locConsent!=="granted"||!pageVisible)return;
    const id=navigator.geolocation.watchPosition(
      (pos)=>{
        const {latitude:rawLat,longitude:rawLng,accuracy}=pos.coords;
        const prev=prevGpsRef.current;
        const A=GPS_SMOOTH;
        const lat=prev?prev.lat+A*(rawLat-prev.lat):rawLat;
        const lng=prev?prev.lng+A*(rawLng-prev.lng):rawLng;
        prevGpsRef.current={lat,lng};
        setGpsPos({lat,lng,accuracy});
        // 初回GPS取得時にマップを現在地へ移動
        if(!gpsCenteredRef.current&&mapInst.current){
          gpsCenteredRef.current=true;
          mapInst.current.flyTo([lat,lng],CAMPUS_ZOOM,{duration:0.6});
        }
      },
      (e)=>onGeoErr(e,false),
      {enableHighAccuracy:true,timeout:10000,maximumAge:2000}
    );
    return ()=>{navigator.geolocation.clearWatch(id);prevGpsRef.current=null;};
  },[guiding,locConsent,pageVisible]);// eslint-disable-line react-hooks/exhaustive-deps

  // ルート座標をrefに同期（watchPositionコールバック内で参照するため）
  useEffect(()=>{routeCoordsRef.current=route?.coords||null;},[route]);

  // ルートからの逸脱判定しきい値（メートル）
  const REROUTE_THRESHOLD=50;

  // GPS位置からルートポリライン上の最短距離を求める
  const distToRoute=(lat,lng,coords)=>{
    if(!coords||coords.length===0)return Infinity;
    let minD=Infinity;
    for(let i=0;i<coords.length-1;i++){
      const c1=coords[i],c2=coords[i+1];
      const dx=c2.lat-c1.lat,dy=c2.lng-c1.lng;
      const lenSq=dx*dx+dy*dy;
      let t=lenSq===0?0:((lat-c1.lat)*dx+(lng-c1.lng)*dy)/lenSq;
      t=Math.max(0,Math.min(1,t));
      const d=haversineNav(lat,lng,c1.lat+t*dx,c1.lng+t*dy);
      if(d<minD)minD=d;
    }
    // 単一点の場合
    if(coords.length===1){
      minD=haversineNav(lat,lng,coords[0].lat,coords[0].lng);
    }
    return minD;
  };

  // GPS常時追従
  const startWatch=useCallback(()=>{
    if(!navigator.geolocation||watchIdRef.current!=null)return;
    const id=navigator.geolocation.watchPosition(
      (pos)=>{
        const {latitude:rawLat,longitude:rawLng,accuracy}=pos.coords;
        const prev=prevGpsRef.current;
        const A=GPS_SMOOTH;
        const lat=prev?prev.lat+A*(rawLat-prev.lat):rawLat;
        const lng=prev?prev.lng+A*(rawLng-prev.lng):rawLng;
        prevGpsRef.current={lat,lng};
        setGpsPos({lat,lng,accuracy});
        // ルートが存在する場合、逸脱時のみ再計算
        const rc=routeCoordsRef.current;
        if(rc&&rc.length>0){
          const d=distToRoute(lat,lng,rc);
          if(d>REROUTE_THRESHOLD){
            setOrigin("__gps__");setGpsOriginPos({lat,lng});setOriginFromGps(true);
          }
        }else{
          // ルート未設定時は従来通り（出発地の初期設定用）
          setOrigin("__gps__");setGpsOriginPos({lat,lng});setOriginFromGps(true);
        }
      },
      (e)=>onGeoErr(e,true),
      {enableHighAccuracy:true,timeout:10000,maximumAge:2000}
    );
    watchIdRef.current=id;
  },[setOrigin]);
  const stopWatch=useCallback(()=>{
    if(watchIdRef.current!=null){navigator.geolocation.clearWatch(watchIdRef.current);watchIdRef.current=null;}
  },[]);
  useEffect(()=>()=>stopWatch(),[]);

  // コンパス（ローパスフィルタ+連続回転角でジッター・ラップアラウンド抑制）
  // 権限はstartGuiding内（ユーザージェスチャー内）で取得済み
  useEffect(()=>{
    if(!guiding){setHeading(null);return;}
    if(!compassPermRef.current)return;
    let smoothed=null;
    let prevSmoothed=null;
    let accumulated=null;
    let gotAbsolute=false; // 絶対方向イベントを受信済みか
    const process=(h)=>{
      // ローパスフィルタ: 急な変動を平滑化
      if(smoothed==null){smoothed=h;prevSmoothed=h;accumulated=h;}
      else{
        let delta=h-smoothed;
        if(delta>180)delta-=360;
        if(delta<-180)delta+=360;
        smoothed=(smoothed+delta*0.25+360)%360;
      }
      headingRef.current=smoothed;
      // 連続回転角: 0/360境界をまたいでもCSSが最短経路で回転
      let d=smoothed-prevSmoothed;
      if(d>180)d-=360;
      if(d<-180)d+=360;
      prevSmoothed=smoothed;
      accumulated+=d;
      // 2度以上変化した時のみ再描画
      setHeading(prev=>{
        if(prev==null)return Math.round(accumulated);
        return Math.abs(accumulated-prev)>=2?Math.round(accumulated):prev;
      });
    };
    // 絶対方向ハンドラ（deviceorientationabsolute）
    const absHandler=(e)=>{
      let h=null;
      if(e.webkitCompassHeading!=null)h=e.webkitCompassHeading;
      else if(e.alpha!=null&&(e.absolute||e.type==="deviceorientationabsolute"))h=(360-e.alpha)%360;
      if(h==null)return;
      gotAbsolute=true;
      process(h);
    };
    // フォールバック: 通常のdeviceorientation（絶対方向が取れない場合のみ使用）
    const fallbackHandler=(e)=>{
      if(gotAbsolute)return; // 絶対方向が取れている場合は無視
      let h=null;
      if(e.webkitCompassHeading!=null)h=e.webkitCompassHeading;
      else if(e.alpha!=null)h=(360-e.alpha)%360;
      if(h==null)return;
      process(h);
    };
    const hasAbsoluteEvent=typeof window.DeviceOrientationAbsoluteEvent!=="undefined";
    if(hasAbsoluteEvent){
      window.addEventListener("deviceorientationabsolute",absHandler,true);
    }
    // iOS: webkitCompassHeadingはdeviceorientationイベント内で取得
    // Android: absoluteイベントがない端末のフォールバック
    window.addEventListener("deviceorientation",hasAbsoluteEvent?fallbackHandler:absHandler,true);
    return()=>{
      if(hasAbsoluteEvent)window.removeEventListener("deviceorientationabsolute",absHandler,true);
      window.removeEventListener("deviceorientation",hasAbsoluteEvent?fallbackHandler:absHandler,true);
    };
  },[guiding]);

  // 案内モード: GPS追従でマップ中央を追従（followingがtrueの時のみ）
  useEffect(()=>{
    if(guiding&&following&&gpsPos&&mapInst.current){
      const zoom=Math.max(mapInst.current.getZoom(),18);
      mapInst.current.setView([gpsPos.lat,gpsPos.lng],zoom,{animate:true,duration:0.3});
    }
  },[guiding,following,gpsPos]);

  // 案内モード: heading変更時にマップをネイティブ回転（followingがtrueの時のみ）
  // コンパスデータ到着前は出発地→目的地の初期方位を維持
  useEffect(()=>{
    if(!mapInst.current||typeof mapInst.current.setBearing!=='function')return;
    if(guiding&&following&&heading!=null){
      mapInst.current.setBearing(-heading);
    }else if(guiding&&following&&initialBearingRef.current!=null){
      mapInst.current.setBearing(initialBearingRef.current);
    }else if(!guiding){
      mapInst.current.setBearing(0);
    }
    // guiding && !following の時は何もしない（ユーザーが自由操作中）
  },[guiding,following,heading]);

  // GPSマーカーの方向矢印をheading変化に追従させる（DOM直接操作）
  useEffect(()=>{
    if(!gpsMarkerRef.current) return;
    const el=gpsMarkerRef.current.getElement?.();
    if(!el) return;
    const arrow=el.querySelector('.gps-arrow');
    if(!arrow) return;
    const hd=headingRef.current;
    const mapBearing=(mapInst.current&&typeof mapInst.current.getBearing==='function')?mapInst.current.getBearing():0;
    const arrowAngle=hd!=null?hd+mapBearing:null;
    if(arrowAngle!=null){
      arrow.style.display='block';
      arrow.style.transform=`translateX(-50%) rotate(${arrowAngle}deg)`;
    }else{
      arrow.style.display='none';
    }
  },[heading,guiding,following]);

  // 案内開始/終了
  const startGuiding=useCallback(()=>{
    const doStart=()=>{
      setGuiding(true);
      setFollowing(true);
      setPanelMin(true);
      startWatch();
      // 出発地点を固定保存（マーカー表示用、案内中に動かない）
      const origSpot=origin==="__gps__"&&gpsOriginPos?{lat:gpsOriginPos.lat,lng:gpsOriginPos.lng}:NAV_SPOTS.find(s=>s.id===origin);
      if(origSpot)guidingOriginRef.current={lat:origSpot.lat,lng:origSpot.lng};
      const destSpot=NAV_SPOTS.find(s=>s.id===destination);
      if(origSpot&&destSpot&&mapInst.current&&typeof mapInst.current.setBearing==='function'){
        const b=bearingNav(origSpot.lat,origSpot.lng,destSpot.lat,destSpot.lng);
        initialBearingRef.current=b;
        mapInst.current.setBearing(b);
      }
      // 現在地にズームイン
      if(gpsPos&&mapInst.current){
        mapInst.current.flyTo([gpsPos.lat,gpsPos.lng],18,{duration:0.8});
      }else if(mapInst.current){
        navigator.geolocation?.getCurrentPosition((pos)=>{
          const {latitude:lat,longitude:lng,accuracy}=pos.coords;
          setGpsPos({lat,lng,accuracy});
          mapInst.current?.flyTo([lat,lng],18,{duration:0.8});
        },()=>{},{enableHighAccuracy:true,timeout:10000});
      }
    };
    // iOSではユーザージェスチャー内でコンパス権限を取得する必要がある
    if(typeof DeviceOrientationEvent!=="undefined"&&typeof DeviceOrientationEvent.requestPermission==="function"){
      DeviceOrientationEvent.requestPermission().then(r=>{
        compassPermRef.current=r==="granted";
        doStart();
      }).catch(()=>{compassPermRef.current=false;doStart();});
    }else{
      compassPermRef.current=true;
      doStart();
    }
  },[startWatch,gpsPos,gpsOriginPos,origin,destination]);
  const stopGuiding=useCallback(()=>{
    setGuiding(false);
    setFollowing(true);
    stopWatch();
    initialBearingRef.current=null;
    guidingOriginRef.current=null;
  },[stopWatch]);

  // 現在地に戻る（自動追従再開）
  const reCenter=useCallback(()=>{
    setFollowing(true);
    if(gpsPos&&mapInst.current){
      mapInst.current.flyTo([gpsPos.lat,gpsPos.lng],18,{duration:0.5});
    }
  },[gpsPos]);

  const getGpsOrigin=useCallback(()=>{
    if(!navigator.geolocation)return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos)=>{
        const {latitude:lat,longitude:lng,accuracy}=pos.coords;
        setGpsPos({lat,lng,accuracy});
        setOrigin("__gps__");setGpsOriginPos({lat,lng});setOriginFromGps(true);
        setGpsLoading(false);onGeoOk();
      },
      (e)=>{setGpsLoading(false);onGeoErr(e,true);},
      {enableHighAccuracy:true,timeout:10000,maximumAge:30000}
    );
  },[setOrigin,setGpsOriginPos,locConsent]);// eslint-disable-line react-hooks/exhaustive-deps

  // Accept initial origin+destination from external navigation (e.g. TTView/HomeView building click)
  useEffect(()=>{
    if(initialDest){
      if(initialOrig){
        setOrigin(initialOrig);
        setNavPhase("route");
      } else {
        // GPS で現在地を取得して出発地に設定
        if(navigator.geolocation){
          setGpsLoading(true);
          navigator.geolocation.getCurrentPosition(
            pos=>{
              const {latitude:lat,longitude:lng,accuracy}=pos.coords;
              setGpsPos({lat,lng,accuracy});
              const ns=findNearestNavSpot(lat,lng);
              if(ns&&ns.distance<1500){setOrigin("__gps__");setGpsOriginPos({lat,lng});setOriginFromGps(true);}
              setGpsLoading(false);setNavPhase("route");
            },
            ()=>{setGpsLoading(false);setNavPhase("route");},
            {enableHighAccuracy:true,timeout:10000,maximumAge:30000}
          );
        } else {
          setNavPhase("route");
        }
      }
      setDestination(initialDest);
      onDestUsed?.();
    }
  },[initialDest]);

  // init map
  useEffect(()=>{
    if(!leafletReady||!mapRef.current||mapInst.current)return;
    const L=window.L;
    const map=L.map(mapRef.current,{center:[CAMPUS_CENTER.lat,CAMPUS_CENTER.lng],zoom:CAMPUS_ZOOM,zoomControl:false,attributionControl:false,rotate:true,touchRotate:true,bearing:0});
    // 航空写真（切り替え用）。どちらを表示するかは下の basemap の effect が決める
    const imagery=L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:22,maxNativeZoom:19,attribution:"Imagery © Esri"});
    overlayRef.current=L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:22,maxNativeZoom:19,pane:"overlayPane",opacity:0.35,attribution:"© OpenStreetMap contributors"});
    photoLayersRef.current=[imagery,overlayRef.current];
    L.control.zoom({position:"bottomright"}).addTo(map);
    L.control.attribution({position:"bottomright",prefix:false}).addTo(map);
    mapInst.current=map;
    map.on("click",()=>{if(navPhaseRef.current==="search")setSearchMin(true);});
    map.on("dragstart",()=>{if(guidingRef.current)setFollowing(false);});
    return()=>{map.remove();mapInst.current=null;gpsMarkerRef.current=null;gpsCircleRef.current=null;};
  },[leafletReady]);

  // イラスト地図のデータ（約50KB）は地図を開いたときだけ読む
  useEffect(()=>{
    if(basemap!=="illust"||bmData)return;
    let alive=true;
    import("../campusBasemapData.js").then(m=>{if(alive)setBmData(m.BASEMAP);}).catch(()=>{if(alive)setBasemap("photo");});
    return()=>{alive=false;};
  },[basemap,bmData]);

  // 地図の見た目（イラスト / 航空写真）を切り替える
  useEffect(()=>{
    const map=mapInst.current;
    if(!leafletReady||!map)return;
    try{localStorage.setItem("navBasemap",basemap);}catch{}
    if(basemap!=="illust"){
      photoLayersRef.current.forEach(l=>{if(!map.hasLayer(l))l.addTo(map);});
      return;
    }
    photoLayersRef.current.forEach(l=>{if(map.hasLayer(l))map.removeLayer(l);});
    if(!bmData)return;
    const ctl=createCampusBasemap(window.L,map,bmData,{dark:isDarkColor(T.bg),accent:T.accent,onSpotClick:id=>spotTapRef.current?.(id)});
    basemapRef.current=ctl;
    setBmVersion(v=>v+1);
    const onMove=()=>setOutOfRegion(!ctl.regionBounds.contains(map.getCenter()));
    map.on("moveend",onMove);
    onMove();
    return()=>{map.off("moveend",onMove);ctl.remove();basemapRef.current=null;setOutOfRegion(false);setBmVersion(v=>v+1);};
  },[leafletReady,basemap,bmData]);

  // refs for click handler
  const selectModeRef=useRef(selectMode);
  useEffect(()=>{selectModeRef.current=selectMode;},[selectMode]);
  const originRef=useRef(origin);
  useEffect(()=>{originRef.current=origin;},[origin]);
  const destRef=useRef(destination);
  useEffect(()=>{destRef.current=destination;},[destination]);
  const navPhaseRef=useRef(navPhase);
  useEffect(()=>{navPhaseRef.current=navPhase;},[navPhase]);
  const spotGroupRef=useRef(spotGroup);
  useEffect(()=>{spotGroupRef.current=spotGroup;},[spotGroup]);
  // 建物（イラスト地図の建物の面・地図上の点）をタップしたとき
  spotTapRef.current=(id)=>{
    const mode=selectModeRef.current;
    const phase=navPhaseRef.current;
    if(mode==="origin"){setOrigin(id);setGpsOriginPos(null);setOriginFromGps(false);setSelectMode(null);}
    else if(mode==="destination"){setDestination(id);setSelectMode(null);if(phase!=="route")setNavPhase("detail");}
    else if(phase==="search"||phase==="detail"||phase==="group"){setDestination(id);setSpotGroup(null);setNavPhase("detail");}
    else if(phase==="route"&&!originRef.current){setOrigin(id);setGpsOriginPos(null);setOriginFromGps(false);}
  };

  // update markers/route
  useEffect(()=>{
    if(!mapInst.current||!leafletReady)return;
    const L=window.L;
    const map=mapInst.current;
    layersRef.current.forEach(l=>{try{map.removeLayer(l);}catch{}});
    layersRef.current=[];

    const originSpot=origin==="__gps__"&&gpsOriginPos?{id:"__gps__",label:t("navi.currentLocation"),lat:gpsOriginPos.lat,lng:gpsOriginPos.lng,col:"#4285f4"}:NAV_SPOTS.find(s=>s.id===origin);
    const destSpot=NAV_SPOTS.find(s=>s.id===destination);

    // All building dots
    const isGroupPhase=navPhase==="group"&&spotGroup;
    const groupBounds=[];
    NAV_SPOTS.forEach(s=>{
      const isOrig=s.id===origin,isDest=s.id===destination;
      if(isOrig||isDest)return;
      const inGroup=isGroupPhase&&s.id.startsWith(spotGroup+"_");
      // Group phase: prominent pins for group members, dim others
      if(inGroup){
        const gInfo=SPOT_GROUPS.find(g=>g.prefix===spotGroup);
        const col=gInfo?.col||s.col;
        const lbl=s.label.replace(/^[^（(]*[（(]/,"").replace(/[）)]$/,"")||s.short;
        const mkIcon=(showLabel,anim=false,delay=0)=>L.divIcon({className:"",html:showLabel
          ?`<div style="position:relative;display:flex;flex-direction:column;align-items:center;${anim?`animation:navPinPop .35s cubic-bezier(.34,1.56,.64,1) ${delay}ms both`:""}"><div style="background:${col};color:#fff;font-size:10px;font-weight:700;padding:3px 8px;border-radius:8px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.4);border:2px solid #fff">${lbl}</div><div style="width:2px;height:6px;background:#fff;opacity:.7"></div><div style="width:6px;height:6px;border-radius:50%;background:${col};border:1.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div></div>`
          :`<div style="position:relative;display:flex;flex-direction:column;align-items:center"><div style="width:14px;height:14px;border-radius:50%;background:${col};border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4);${anim?`animation:navPinDot .3s cubic-bezier(.34,1.56,.64,1) ${delay}ms both`:""}"></div></div>`,
          iconSize:[0,0],iconAnchor:[0,showLabel?40:7]});
        const initShow=map.getZoom()>=17;
        const m=L.marker([s.lat,s.lng],{icon:mkIcon(initShow),interactive:true,zIndexOffset:500}).addTo(map);
        m._mkIcon=mkIcon;
        m.on("click",()=>{setDestination(s.id);setSpotGroup(null);setNavPhase("detail");});
        layersRef.current.push(m);
        groupBounds.push([s.lat,s.lng]);
      } else {
        if(basemapRef.current?.hasSpot(s.id))return; // イラスト地図では建物そのものをタップする
        const opacity=isGroupPhase?"20":"55";
        const borderOp=isGroupPhase?"40":"80";
        const icon=L.divIcon({className:"",html:`<div class="nav-dot" style="width:10px;height:10px;border-radius:50%;background:${s.col}${opacity};border:1.5px solid ${s.col}${borderOp};cursor:pointer;transition:transform .15s,opacity .2s" onmouseover="this.style.transform='scale(1.6)'" onmouseout="this.style.transform='scale(1)'"></div>`,iconSize:[10,10],iconAnchor:[5,5]});
        const m=L.marker([s.lat,s.lng],{icon,interactive:true}).addTo(map);
        m.on("click",()=>spotTapRef.current?.(s.id));
        m.bindTooltip(s.label,{direction:"top",offset:[0,-8],className:"nav-tip"});
        layersRef.current.push(m);
      }
    });
    // Fit map to group bounds — only on group change, not every GPS tick
    if(isGroupPhase&&groupBounds.length>0&&fittedGroupRef.current!==spotGroup){
      fittedGroupRef.current=spotGroup;
      if(groupBounds.length===1)map.flyTo(groupBounds[0],18,{duration:.4});
      else map.fitBounds(L.latLngBounds(groupBounds).pad(0.3));
    }
    if(!isGroupPhase)fittedGroupRef.current=null;

    // Zoom-dependent label toggle for group pins
    if(isGroupPhase){
      let prevShow=map.getZoom()>=17;
      const onZoom=()=>{
        const show=map.getZoom()>=17;
        if(show===prevShow)return;
        prevShow=show;
        const center=map.getCenter();
        const pins=layersRef.current.filter(m=>m._mkIcon);
        const dists=pins.map(m=>{const ll=m.getLatLng();return Math.hypot(ll.lat-center.lat,ll.lng-center.lng);});
        const maxD=Math.max(...dists)||1;
        pins.forEach((m,i)=>{m.setIcon(m._mkIcon(show,true,Math.round((dists[i]/maxD)*200)));});
      };
      map.on("zoomend",onZoom);
      layersRef.current.push({remove:()=>map.off("zoomend",onZoom)});
    }

    // Route polyline
    if(route&&route.coords.length>1){
      const latlngs=route.coords.map(c=>[c.lat,c.lng]);

      // 案内中: GPSに最も近いルート上のセグメント射影点で分割 → 通過済み=グレー, 残り=緑
      if(guiding&&gpsPos){
        let bestSeg=0,bestT=0,bestDist=Infinity;
        for(let i=0;i<latlngs.length-1;i++){
          const [ay,ax]=latlngs[i],[by,bx]=latlngs[i+1];
          const dy=by-ay,dx=bx-ax,lenSq=dy*dy+dx*dx;
          let t=lenSq===0?0:((gpsPos.lat-ay)*dy+(gpsPos.lng-ax)*dx)/lenSq;
          t=Math.max(0,Math.min(1,t));
          const d=haversineNav(gpsPos.lat,gpsPos.lng,ay+t*dy,ax+t*dx);
          if(d<bestDist){bestDist=d;bestSeg=i;bestT=t;}
        }
        const [ay,ax]=latlngs[bestSeg],[by,bx]=latlngs[bestSeg+1];
        const proj=[ay+bestT*(by-ay),ax+bestT*(bx-ax)];
        // 通過済み部分（先頭〜射影点）
        const passed=[...latlngs.slice(0,bestSeg+1),proj];
        // 残り部分（射影点〜ゴール）
        const remaining=[proj,...latlngs.slice(bestSeg+1)];

        if(passed.length>1){
          const pg=L.polyline(passed,{color:"#888",weight:5,opacity:0.4,lineCap:"round",lineJoin:"round",dashArray:"6 8"}).addTo(map);
          layersRef.current.push(pg);
        }
        if(remaining.length>1)layersRef.current.push(...drawRouteLine(L,map,remaining));
      }else{
        // 通常表示
        const lines=drawRouteLine(L,map,latlngs);
        layersRef.current.push(...lines);
        if(fittedRouteRef.current!==route){
          fittedRouteRef.current=route;
          // 上の出発地/目的地カードと下の到着予測カードに隠れないよう余白を取る（PCはカードが左側）
          map.fitBounds(lines[1].getBounds(),{paddingTopLeft:[mob?24:480,mob?150:40],paddingBottomRight:[mob?24:60,mob?260:60],maxZoom:19});
          drawRouteIn(map,lines.slice(0,2));
        }
      }
    }

    // Origin marker — 白丸（中心アンカー）、案内中はguidingOriginRefの固定位置を使用
    const originPos=guiding&&guidingOriginRef.current?guidingOriginRef.current:originSpot;
    if(originPos){
      const icon=L.divIcon({className:"",html:`<div style="width:18px;height:18px;border-radius:50%;background:#fff;border:3px solid #ccc;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center"><div style="width:6px;height:6px;border-radius:50%;background:#aaa"></div></div>`,iconSize:[18,18],iconAnchor:[9,9]});
      const m=L.marker([originPos.lat,originPos.lng],{icon,zIndexOffset:1000}).addTo(map);
      m.bindTooltip(t("navi.originLabel",{name:originSpot?.label||t("navi.currentLocation")}),{direction:"top",offset:[0,-12],className:"nav-tip"});
      layersRef.current.push(m);
    }

    // Destination marker — accent pin style
    if(destSpot){
      // 目的地が変わったときだけピンを落とす（GPS更新のたびに再生しない）
      const drop=animatedDestRef.current!==destSpot.id;
      animatedDestRef.current=destSpot.id;
      const icon=L.divIcon({className:"",html:`<div class="nav-pin"><div class="nav-pin-shadow"></div><div class="${drop?"nav-pin-body nav-pin-drop":"nav-pin-body"}">${PIN_SVG(T.accent)}</div></div>`,iconSize:[36,46],iconAnchor:[18,44]});
      const m=L.marker([destSpot.lat,destSpot.lng],{icon,zIndexOffset:1000}).addTo(map);
      m.bindTooltip(t("navi.destLabel",{name:destSpot.label}),{direction:"top",offset:[0,-46],className:"nav-tip"});
      layersRef.current.push(m);
    }else{
      animatedDestRef.current=null;
    }

    // detailフェーズ: 目的地にズーム — destination/origin変更時のみ
    const detailKey=`${origin}|${destination}`;
    if(!route&&destSpot&&!originSpot&&fittedDetailRef.current!==detailKey){
      fittedDetailRef.current=detailKey;
      map.flyTo([destSpot.lat,destSpot.lng],18,{duration:.4});
    }
    if(!route&&originSpot&&destSpot&&fittedDetailRef.current!==detailKey){
      fittedDetailRef.current=detailKey;
      map.fitBounds(L.latLngBounds([[originSpot.lat,originSpot.lng],[destSpot.lat,destSpot.lng]]).pad(0.3));
    }
    if(route||(!destSpot&&!originSpot))fittedDetailRef.current=null;
    if(!route)fittedRouteRef.current=null;
  },[leafletReady,origin,destination,route,gpsPos,gpsOriginPos,guiding,navPhase,spotGroup,bmVersion]);

  // 目的地の建物を塗る（イラスト地図）
  useEffect(()=>{basemapRef.current?.setHighlight(destination||null);},[destination,bmVersion]);

  // GPS位置マーカー — 永続refでスムーズ移動
  useEffect(()=>{
    if(!mapInst.current||!leafletReady) return;
    const L=window.L;
    const map=mapInst.current;
    if(!gpsPos){
      if(gpsMarkerRef.current){map.removeLayer(gpsMarkerRef.current);gpsMarkerRef.current=null;}
      if(gpsCircleRef.current){map.removeLayer(gpsCircleRef.current);gpsCircleRef.current=null;}
      return;
    }
    if(gpsMarkerRef.current){
      gpsMarkerRef.current.setLatLng([gpsPos.lat,gpsPos.lng]);
    }else{
      const gpsDot=L.divIcon({className:"gps-smooth",html:`<div style="position:relative"><div class="gps-arrow" style="display:none;position:absolute;top:-18px;left:50%;transform-origin:center 25px;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:14px solid ${ROUTE_COL};filter:drop-shadow(0 0 3px rgba(26,142,240,.6));z-index:2;transition:transform .15s ease-out"></div><div style="position:absolute;inset:-12px;border-radius:50%;background:rgba(26,142,240,.25);animation:navHalo 2s ease-out infinite"></div><div style="width:14px;height:14px;border-radius:50%;background:${ROUTE_COL};border:3px solid #fff;box-shadow:0 1px 6px rgba(26,142,240,.55)"></div><div class="nav-here">${t("navi.currentLocation")}</div></div>`,iconSize:[14,14],iconAnchor:[10,10]});
      const gm=L.marker([gpsPos.lat,gpsPos.lng],{icon:gpsDot,zIndexOffset:900}).addTo(map);
      gm.bindTooltip(`<b>${t("navi.currentLocation")}</b>`,{direction:"top",offset:[0,-10],className:"nav-tip"});
      gpsMarkerRef.current=gm;
    }
    if(gpsPos.accuracy&&gpsPos.accuracy<500){
      if(gpsCircleRef.current){
        gpsCircleRef.current.setLatLng([gpsPos.lat,gpsPos.lng]);
        gpsCircleRef.current.setRadius(gpsPos.accuracy);
      }else{
        gpsCircleRef.current=L.circle([gpsPos.lat,gpsPos.lng],{radius:gpsPos.accuracy,color:"#4285f4",fillColor:"#4285f4",fillOpacity:0.08,weight:1,opacity:0.3}).addTo(map);
      }
    }else if(gpsCircleRef.current){
      map.removeLayer(gpsCircleRef.current);gpsCircleRef.current=null;
    }
  },[leafletReady,gpsPos]);

  /* ── Inline search for search phase ── */
  const [pickerFor,setPickerFor]=useState(null); // ルート画面で開いている選択シート: "origin" | "destination" | null
  const [tipsOpen,setTipsOpen]=useState(false);

  if(!leafletReady)return <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center"}}><Loader msg={t("navi.loadingMap")} size="md"/></div>;

  const tipStyle=`.nav-tip{background:${T.bg2}!important;color:${T.txH}!important;border:1px solid ${T.bdL}!important;border-radius:8px!important;font-size:11px!important;font-weight:600!important;padding:4px 10px!important;box-shadow:0 4px 16px rgba(0,0,0,.45)!important;font-family:inherit!important}.nav-tip::before{display:none!important}`;

  const hasRoute=!!route;
  const noRoute=origin&&destination&&origin!==destination&&!route;

  // 目的地を決めてルート表示へ（出発地は現在地）
  const navigateTo=(destId)=>{
    if(destId){setDestination(destId);setSpotGroup(null);}
    setNavPhase("route");
    if(navigator.geolocation){
      setGpsLoading(true);
      navigator.geolocation.getCurrentPosition(
        pos=>{
          const {latitude:lat,longitude:lng,accuracy}=pos.coords;
          setGpsPos({lat,lng,accuracy});
          setOrigin("__gps__");setGpsOriginPos({lat,lng});setOriginFromGps(true);
          setGpsLoading(false);
        },
        ()=>setGpsLoading(false),
        {enableHighAccuracy:true,timeout:10000,maximumAge:30000}
      );
    }
  };
  // 今日の次の授業（時間割と学年暦から）。目的地カードと検索画面のショートカットに使う
  const nextCls=getNextClass(qDataAll);
  const nextClsSpot=nextCls?NAV_SPOTS.find(s=>s.id===nextCls.co.building):null;
  const destIsNextCls=!!(nextClsSpot&&destination===nextClsSpot.id);

  /* ── helper: destination / origin spot ── */
  const destSpotInfo=NAV_SPOTS.find(s=>s.id===destination);
  const originSpotInfo=origin&&origin!=="__gps__"?NAV_SPOTS.find(s=>s.id===origin):null;

  /* ── Floating search card ── */
  const cardW=mob?"auto":440;
  const cardBase={position:"absolute",top:mob?10:14,left:mob?10:14,right:mob?10:"auto",width:cardW,zIndex:1000,background:T.bg2,borderRadius:16,boxShadow:"0 4px 24px rgba(0,0,0,.45), 0 1px 3px rgba(0,0,0,.2)",border:`1px solid ${T.bdL}`,overflow:"visible"};

  const groupInfo=spotGroup?SPOT_GROUPS.find(g=>g.prefix===spotGroup):null;
  const groupSpots=spotGroup?NAV_SPOTS.filter(s=>s.id.startsWith(spotGroup+"_")):[];
  const searchCard=navPhase==="search"&&searchMin?
    <button type="button" onClick={()=>setSearchMin(false)} style={{position:"absolute",top:mob?10:14,left:mob?10:14,right:mob?10:"auto",width:cardW,zIndex:1000,display:"flex",alignItems:"center",gap:10,padding:"13px 18px",background:T.bg2,borderRadius:26,border:`1px solid ${T.bdL}`,boxShadow:"0 10px 30px -10px rgba(0,0,0,.45), 0 1px 3px rgba(0,0,0,.15)",cursor:"pointer",transition:"box-shadow .15s",boxSizing:"border-box",textAlign:"left",font:"inherit"}}>
      <span style={{display:"flex",color:T.tx}}>{I.search}</span>
      <span style={{fontSize:14.5,color:T.txD,flex:1}}>{t("navi.searchAny")}</span>
    </button>
  :navPhase==="search"?
    /* ── Phase 1: Search（共通の選択シート） ── */
    <SpotPicker mode="search" mob={mob} gpsPos={gpsPos} nextCls={nextCls} nextClsSpot={nextClsSpot}
      onPick={(sp)=>{setDestination(sp.id);setSpotGroup(null);setNavPhase("detail");setSearchMin(true);if(mapInst.current)mapInst.current.flyTo([sp.lat,sp.lng],18,{duration:.5});}}
      onPickGroup={(prefix)=>{setSpotGroup(prefix);setNavPhase("group");setSearchMin(true);}}
      onClose={()=>setSearchMin(true)}/>
  :navPhase==="group"?
    /* ── Phase 1.5: Group pins on map ── */
    <div style={cardBase}>
      <div style={{padding:14}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
          <div style={{width:36,height:36,borderRadius:10,background:`${groupInfo?.col||T.txD}30`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill={groupInfo?.col||T.txD} stroke="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/></svg>
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:15,fontWeight:700,color:T.txH}}>{groupInfo?t(groupInfo.labelKey):""}</div>
            <div style={{fontSize:11,color:T.txD,marginTop:1}}>{t("navi.spotsCount",{n:groupSpots.length})}</div>
          </div>
          <button onClick={()=>{setSpotGroup(null);setNavPhase("search");}} style={{display:"flex",alignItems:"center",justifyContent:"center",width:28,height:28,borderRadius:"50%",border:`1px solid ${T.bd}`,background:"transparent",cursor:"pointer",color:T.txD,flexShrink:0}}>{I.x}</button>
        </div>
        <div style={{fontSize:11,color:T.txD}}>{t("navi.tapPinToSelect")}</div>
      </div>
    </div>
  :navPhase==="detail"?
    /* ── Phase 2: Spot detail + navigate button ── */
    <div style={{...cardBase,top:"auto",bottom:mob?10:14}}>
      <div style={{padding:14}}>
        {destSpotInfo&&<>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:destSpotInfo.meta?8:12}}>
            <div style={{width:36,height:36,borderRadius:10,background:`${destSpotInfo.col}30`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              {destSpotInfo.cat==="restaurant"
                ?<svg width="18" height="18" viewBox="0 0 24 24" fill={destSpotInfo.col} stroke="none"><path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z"/></svg>
                :<span style={{fontSize:12,fontWeight:800,color:destSpotInfo.col}}>{destSpotInfo.short}</span>}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:15,fontWeight:700,color:T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{destSpotInfo.label}</div>
              <div style={{fontSize:11,color:T.txD,marginTop:1}}>{SPOT_CATS.find(c=>c.id===destSpotInfo.cat)?.label||""}</div>
            </div>
            <button onClick={()=>{setDestination(null);setOrigin(null);setNavPhase("search");}} style={{display:"flex",alignItems:"center",justifyContent:"center",width:28,height:28,borderRadius:"50%",border:`1px solid ${T.bd}`,background:"transparent",cursor:"pointer",color:T.txD,flexShrink:0}}>{I.x}</button>
          </div>
          {/* ── Restaurant meta info ── */}
          {destSpotInfo.meta&&<div style={{marginBottom:12,padding:"10px 12px",borderRadius:10,background:T.bg3,display:"flex",flexDirection:"column",gap:6}}>
            {destSpotInfo.meta.genre&&<div style={{display:"flex",alignItems:"center",gap:8}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.txD} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
              <span style={{fontSize:12,color:T.txH,fontWeight:500}}>{destSpotInfo.meta.genre}</span>
            </div>}
            {destSpotInfo.meta.hours&&<div style={{display:"flex",alignItems:"center",gap:8}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.txD} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span style={{fontSize:12,color:T.txH}}>{destSpotInfo.meta.hours}</span>
            </div>}
            {destSpotInfo.meta.budget&&<div style={{display:"flex",alignItems:"center",gap:8}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.txD} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
              <span style={{fontSize:12,color:T.txH}}>{destSpotInfo.meta.budget}</span>
            </div>}
            {destSpotInfo.meta.closed&&<div style={{display:"flex",alignItems:"center",gap:8}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.red||"#e5534b"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
              <span style={{fontSize:12,color:T.red||"#e5534b"}}>{t("navi.closedDay",{day:destSpotInfo.meta.closed})}</span>
            </div>}
            {destSpotInfo.meta.desc&&<div style={{fontSize:11,color:T.txD,marginTop:2,lineHeight:1.5}}>{destSpotInfo.meta.desc}</div>}
            {destSpotInfo.meta.tips&&<button onClick={()=>setTipsOpen(true)} style={{width:"100%",display:"flex",alignItems:"center",gap:8,marginTop:8,padding:"8px 10px",borderRadius:8,border:`1px solid ${destSpotInfo.col}40`,background:`${destSpotInfo.col}10`,cursor:"pointer",transition:"background .15s"}} onMouseEnter={e=>e.currentTarget.style.background=`${destSpotInfo.col}20`} onMouseLeave={e=>e.currentTarget.style.background=`${destSpotInfo.col}10`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={destSpotInfo.col} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              <span style={{fontSize:12,fontWeight:600,color:destSpotInfo.col,flex:1,textAlign:"left"}}>{t("navi.firstTimeGuide")}</span>
              <span style={{fontSize:11,color:`${destSpotInfo.col}90`}}>›</span>
            </button>}
            {destSpotInfo.meta.links&&<div style={{display:"flex",gap:6,marginTop:8}}>
              {destSpotInfo.meta.links.map((lk,li)=><a key={li} href={lk.url} target="_blank" rel="noopener noreferrer" style={{flex:1,display:"flex",alignItems:"center",gap:6,padding:"7px 10px",borderRadius:8,border:`1px solid ${T.bd}`,background:"transparent",textDecoration:"none",cursor:"pointer",transition:"background .15s"}} onMouseEnter={e=>e.currentTarget.style.background=T.hover} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                {lk.icon==="x"&&<svg width="14" height="14" viewBox="0 0 24 24" fill={T.txH}><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>}
                {lk.icon==="yt"&&<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="16" rx="3" fill="#ff0000"/><polygon points="10,8.5 16,12 10,15.5" fill="#fff"/></svg>}
                <span style={{fontSize:11,fontWeight:500,color:T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{lk.label}</span>
              </a>)}
            </div>}
          </div>}
          <button onClick={()=>navigateTo()} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,width:"100%",padding:"11px 0",borderRadius:12,border:"none",background:"linear-gradient(135deg,#4de8b0,#34a853)",cursor:"pointer",transition:"opacity .15s"}} onMouseEnter={e=>e.currentTarget.style.opacity=".85"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
            <span style={{fontSize:14,fontWeight:700,color:"#fff"}}>{t("navi.navigateHere")}</span>
          </button>
        </>}
      </div>
    </div>
  :
    /* ── Phase 3: Route mode（出発地・目的地。タップで選択シートを開く） ── */
    pickerFor?
      <SpotPicker mode={pickerFor} value={pickerFor==="origin"?origin:destination} mob={mob} gpsPos={gpsPos}
        refPos={pickerFor==="origin"?null:(origin==="__gps__"?gpsOriginPos:NAV_SPOTS.find(x=>x.id===origin)||null)}
        nextCls={pickerFor==="destination"?nextCls:null} nextClsSpot={nextClsSpot} gpsLoading={gpsLoading}
        onPick={(sp)=>{
          if(pickerFor==="origin"){setOrigin(sp.id);setGpsOriginPos(null);setOriginFromGps(false);}
          else setDestination(sp.id);
          setSelectMode(null);setPickerFor(null);
        }}
        onGps={pickerFor==="origin"?()=>{getGpsOrigin();setPickerFor(null);}:null}
        onPickOnMap={()=>{setSelectMode(pickerFor);setPickerFor(null);}}
        onClear={()=>{
          if(pickerFor==="origin"){setOrigin(null);setGpsOriginPos(null);setOriginFromGps(false);}
          else{setDestination(null);setOrigin(null);setNavPhase("search");}
          setPickerFor(null);
        }}
        onClose={()=>setPickerFor(null)}/>
    :<div style={cardBase}>
      <div style={{display:"flex",alignItems:"stretch",padding:"6px 8px 6px 4px"}}>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",width:34,flexShrink:0,padding:"14px 0"}}>
          {origin==="__gps__"
            ?<div style={{width:12,height:12,borderRadius:"50%",background:ROUTE_COL,border:"2.5px solid #fff",boxShadow:`0 0 0 1.5px ${ROUTE_COL}55`,flexShrink:0}}/>
            :<div style={{width:11,height:11,borderRadius:"50%",background:T.bg2,border:`2.5px solid ${origin?T.tx:T.txD}`,flexShrink:0,boxSizing:"border-box"}}/>}
          <div style={{width:0,flex:1,borderLeft:`2px dotted ${T.txD}66`,margin:"4px 0",minHeight:14}}/>
          <svg width="16" height="16" viewBox="0 0 24 24" fill={destination?T.accent:`${T.accent}80`} style={{flexShrink:0}}><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/></svg>
        </div>
        <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
          {[["origin",origin==="__gps__"?t("navi.currentLocation"):originSpotInfo?.label,t("navi.selectOrigin")],
            ["destination",destSpotInfo?.label,t("navi.selectDestination")]].map(([key,label,ph],i)=>(
            <button key={key} onClick={()=>{setSelectMode(null);setPickerFor(key);}} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"11px 10px",borderRadius:10,border:"none",borderBottom:i===0?`1px solid ${T.bd}`:"none",background:selectMode===key?`${T.accent}12`:"transparent",cursor:"pointer",textAlign:"left",boxSizing:"border-box"}} onMouseEnter={e=>{if(selectMode!==key)e.currentTarget.style.background=T.hover;}} onMouseLeave={e=>{e.currentTarget.style.background=selectMode===key?`${T.accent}12`:"transparent";}}>
              <span style={{flex:1,minWidth:0,fontSize:14.5,fontWeight:label?700:500,color:label?(key==="origin"&&origin==="__gps__"?ROUTE_COL:T.txH):T.txD,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{label||ph}</span>
            </button>
          ))}
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,flexShrink:0,paddingLeft:6}}>
          <button onClick={getGpsOrigin} disabled={gpsLoading} style={{display:"flex",alignItems:"center",justifyContent:"center",width:34,height:34,borderRadius:"50%",border:`1px solid ${origin==="__gps__"?`${ROUTE_COL}55`:T.bd}`,background:origin==="__gps__"?`${ROUTE_COL}14`:"transparent",cursor:gpsLoading?"wait":"pointer",color:origin==="__gps__"?ROUTE_COL:T.txD,transition:"all .15s",opacity:gpsLoading?0.5:1}} title={t("navi.setCurrentAsOrigin")}>
            {I.tgt}
          </button>
          <button onClick={swap} disabled={origin==="__gps__"} style={{display:"flex",alignItems:"center",justifyContent:"center",width:34,height:34,borderRadius:"50%",border:`1px solid ${T.bd}`,background:"transparent",cursor:origin==="__gps__"?"default":"pointer",color:T.txD,transition:"all .15s",opacity:origin==="__gps__"?0.4:1}} title={t("navi.swap")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="7 3 7 21"/><polyline points="4 6 7 3 10 6"/><polyline points="17 21 17 3"/><polyline points="14 18 17 21 20 18"/></svg>
          </button>
        </div>
      </div>
      {selectMode&&<div style={{padding:"0 12px 12px"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 8px 8px 12px",borderRadius:12,background:`${T.accent}12`,border:`1px solid ${T.accent}35`}}>
          <span style={{display:"flex",color:T.accent}}>{I.tgt}</span>
          <span style={{flex:1,fontSize:12,color:T.txH,fontWeight:600}}>{t("navi.tapBuildingToSelect",{what:selectMode==="origin"?t("navi.origin"):t("navi.destination")})}</span>
          <button onClick={()=>setSelectMode(null)} style={{padding:"5px 10px",borderRadius:9,border:`1px solid ${T.bd}`,background:T.bg2,color:T.tx,fontSize:11.5,fontWeight:700,cursor:"pointer"}}>{t("common.cancel")}</button>
        </div>
      </div>}
    </div>;

  /* ── Floating route info card (bottom) ── */
  const routeCard=hasRoute&&!panelMin&&<div style={{
    position:"absolute",
    bottom:mob?12:20,
    left:mob?12:14,
    right:mob?12:"auto",
    width:cardW,
    zIndex:1000,
    background:T.bg2,
    borderRadius:20,
    boxShadow:"0 18px 40px -18px rgba(0,0,0,.5), 0 1px 3px rgba(0,0,0,.18)",
    border:`1px solid ${T.bdL}`,
    padding:"16px 18px",
    boxSizing:"border-box",
    animation:"navSlideUp .25s ease-out",
  }}>
    <div style={{display:"flex",alignItems:"center",gap:12,paddingRight:18}}>
      <div style={{width:46,height:46,borderRadius:14,background:`${T.accent}1f`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
          <span style={{fontSize:18,fontWeight:800,color:T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{destSpotInfo?.label||""}</span>
          {destSpotInfo?.short&&<span style={{padding:"2px 8px",borderRadius:7,background:T.bg3,color:T.tx,fontSize:11,fontWeight:800,flexShrink:0}}>{destSpotInfo.short}</span>}
        </div>
        <div style={{display:"flex",alignItems:"baseline",gap:6,marginTop:3,flexWrap:"wrap"}}>
          <span style={{fontSize:13,fontWeight:700,color:T.tx}}>{t("navi.walk")}</span>
          <span style={{fontSize:30,fontWeight:900,color:ROUTE_COL,lineHeight:1,letterSpacing:"-.02em"}}>{route.minutes}</span>
          <span style={{fontSize:13,fontWeight:700,color:T.tx}}>{t("navi.min")} ・ {t("navi.aboutMeters",{n:route.distance})}</span>
          {route.hasStairs&&<span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 8px",borderRadius:6,background:`${T.orange}14`,alignSelf:"center"}}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.orange} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 18h4v-4h4v-4h4v-4h4"/></svg>
            <span style={{fontSize:11,fontWeight:700,color:T.orange}}>{t("navi.hasStairs")}</span>
          </span>}
        </div>
      </div>
    </div>
    {/* 目的地が今日の次の授業の建物なら、その授業を出す */}
    {destIsNextCls&&<div style={{display:"flex",alignItems:"center",gap:8,marginTop:12,padding:"9px 12px",borderRadius:12,background:T.bg3,fontSize:12.5,color:T.tx,minWidth:0}}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <span style={{fontWeight:800,color:T.txH,flexShrink:0}}>{t(nextCls.st==="now"?"navi.nowClass":"navi.nextClass")}</span>
      <span style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{nextCls.co.name}</span>
      <span style={{fontWeight:700,flexShrink:0}}>{nextCls.pd.l} {hm(nextCls.pd.s)}〜</span>
    </div>}
    {/* Close/minimize */}
    <button onClick={()=>setPanelMin(true)} style={{position:"absolute",top:10,right:10,background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",padding:4}} title={t("common.close")}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 15 12 9 18 15"/></svg>
    </button>
    {/* 案内を開始ボタン（出発地がGPS=現在地の時のみ） */}
    {!guiding&&originFromGps&&<button onClick={startGuiding} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,width:"100%",padding:"12px 0",marginTop:12,borderRadius:14,border:"none",background:"linear-gradient(135deg,#4de8b0,#34a853)",cursor:"pointer",transition:"opacity .15s"}} onMouseEnter={e=>e.currentTarget.style.opacity=".85"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
      <span style={{fontSize:14,fontWeight:700,color:"#fff"}}>{t("navi.startGuiding")}</span>
    </button>}
    {guiding&&<button onClick={stopGuiding} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,width:"100%",padding:"12px 0",marginTop:12,borderRadius:14,border:`1.5px solid ${T.red}40`,background:`${T.red}12`,cursor:"pointer",transition:"opacity .15s"}}>
      <span style={{fontSize:14,fontWeight:700,color:T.red}}>{t("navi.stopGuiding")}</span>
    </button>}
  </div>;

  /* ── Minimized route pill ── */
  const routePill=hasRoute&&panelMin&&<button onClick={()=>setPanelMin(false)} style={{
    position:"absolute",
    bottom:mob?12:20,
    left:mob?12:14,
    zIndex:1000,
    display:"flex",alignItems:"center",gap:8,
    padding:"10px 16px",
    borderRadius:28,
    background:"linear-gradient(135deg,#4de8b0,#34a853)",
    border:"none",
    boxShadow:"0 4px 16px rgba(77,232,176,.3), 0 2px 6px rgba(0,0,0,.2)",
    cursor:"pointer",
    animation:"navSlideUp .2s ease-out",
  }}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
    <span style={{fontSize:14,fontWeight:700,color:"#fff"}}>{t("navi.minCount",{n:route.minutes})}</span>
    <span style={{fontSize:12,fontWeight:500,color:"rgba(255,255,255,.8)"}}>{route.distance}m</span>
  </button>;

  /* ── No route error ── */
  const noRouteCard=noRoute&&<div style={{
    position:"absolute",
    bottom:mob?12:20,
    left:mob?12:14,
    right:mob?12:"auto",
    width:cardW,
    zIndex:1000,
    background:T.bg2,
    borderRadius:14,
    boxShadow:"0 4px 20px rgba(0,0,0,.35)",
    border:`1px solid ${T.red}30`,
    padding:"14px 18px",
    display:"flex",alignItems:"center",gap:10,
    animation:"navSlideUp .25s ease-out",
  }}>
    <div style={{width:36,height:36,borderRadius:"50%",background:`${T.red}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.red} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
    </div>
    <div>
      <div style={{fontSize:13,fontWeight:600,color:T.txH}}>{t("navi.noRoute")}</div>
      <div style={{fontSize:11,color:T.txD,marginTop:2}}>{t("navi.noRouteHint")}</div>
    </div>
  </div>;

  // 下からのカードが出ている間、スマホでは地図切り替えボタンを隠す（重なるため）
  const locPromptShown=!guiding&&navPhase==="search"&&((locConsent==null&&!locDenied)||locDeniedMsg)&&!!navigator.geolocation;
  const bottomCardShown=(hasRoute&&!panelMin)||noRoute||navPhase==="detail"||locPromptShown;
  const pickerOpen=!!pickerFor||(navPhase==="search"&&!searchMin);
  const showMapToggle=!guiding&&!(mob&&bottomCardShown)&&!(mob&&pickerOpen);
  const nextClsCard=!guiding&&navPhase==="search"&&searchMin&&nextCls&&nextClsSpot&&<button onClick={()=>navigateTo(nextClsSpot.id)} style={{position:"absolute",top:(mob?10:14)+58,left:mob?10:14,right:mob?10:"auto",width:cardW,zIndex:999,display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:T.bg2,borderRadius:16,border:`1px solid ${T.bdL}`,boxShadow:"0 10px 26px -14px rgba(0,0,0,.45)",cursor:"pointer",textAlign:"left",boxSizing:"border-box",animation:"navSlideUp .25s ease-out"}}>
    <div style={{width:36,height:36,borderRadius:11,background:`${T.accent}1f`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
    </div>
    <div style={{flex:1,minWidth:0}}>
      <div style={{fontSize:11,fontWeight:800,color:T.accent}}>{t(nextCls.st==="now"?"navi.nowClass":"navi.nextClass")} ・ {nextCls.pd.l} {hm(nextCls.pd.s)}〜</div>
      <div style={{fontSize:14,fontWeight:800,color:T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginTop:1}}>{nextCls.co.name}</div>
    </div>
    <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0,fontSize:12.5,fontWeight:800,color:T.txH}}>
      {nextClsSpot.label.replace(/・.*$/,"")}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    </div>
  </button>;
  const mapToggle=showMapToggle&&<button onClick={()=>setBasemap(b=>b==="illust"?"photo":"illust")} style={{position:"absolute",right:mob?10:14,bottom:mob?92:96,zIndex:999,display:"flex",alignItems:"center",gap:6,padding:"8px 12px",borderRadius:20,background:T.bg2,border:`1px solid ${T.bdL}`,boxShadow:"0 6px 16px -6px rgba(0,0,0,.4)",cursor:"pointer",color:T.txH,fontSize:12,fontWeight:700}}>
    {basemap==="illust"
      ?<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
      :<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>}
    {basemap==="illust"?t("navi.mapPhoto"):t("navi.mapIllust")}
  </button>;
  const outOfRegionChip=basemap==="illust"&&outOfRegion&&!guiding&&!bottomCardShown&&<div style={{position:"absolute",left:mob?10:0,right:mob?64:0,bottom:mob?18:24,zIndex:999,display:"flex",justifyContent:mob?"flex-start":"center",pointerEvents:"none"}}>
    <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 8px 8px 14px",borderRadius:20,background:T.bg2,border:`1px solid ${T.bdL}`,boxShadow:"0 6px 16px -6px rgba(0,0,0,.4)",whiteSpace:"nowrap",animation:"navSlideUp .2s ease-out",pointerEvents:"auto"}}>
      <span style={{fontSize:12,color:T.tx}}>{t("navi.illustAreaOnly")}</span>
      <button onClick={()=>setBasemap("photo")} style={{padding:"5px 10px",borderRadius:14,border:"none",background:T.accent,color:"#fff",fontSize:11.5,fontWeight:800,cursor:"pointer"}}>{t("navi.mapPhoto")}</button>
    </div>
  </div>;

  return <div className={guiding?"nav-guiding":""} style={{flex:1,position:"relative",overflow:"hidden"}}>
    <style>{tipStyle}{`
@keyframes navSlideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes navPinPop{0%{opacity:0;transform:scale(.3) translateY(8px)}60%{opacity:1;transform:scale(1.08) translateY(-1px)}100%{opacity:1;transform:scale(1) translateY(0)}}
@keyframes navPinDot{0%{transform:scale(.5)}60%{transform:scale(1.15)}100%{transform:scale(1)}}
@keyframes locPulse{0%,100%{opacity:.6;transform:scale(1)}50%{opacity:1;transform:scale(1.5)}}
.gps-smooth{transition:transform .3s ease-out!important}
@keyframes navHalo{0%{transform:scale(.55);opacity:.9}100%{transform:scale(1.9);opacity:0}}
@keyframes navPickerIn{from{opacity:0;transform:translateY(-8px) scale(.985)}to{opacity:1;transform:none}}
@keyframes navFlow{to{stroke-dashoffset:-16.1}}
.nav-route-flow{animation:navFlow .8s linear infinite}
@keyframes navPinDrop{0%{transform:translateY(-90px) scale(.7);opacity:0}55%{transform:translateY(3px) scale(1.04);opacity:1}75%{transform:translateY(-7px) scale(1)}100%{transform:translateY(0)}}
@keyframes navPinShadow{0%{transform:translateX(-50%) scale(.2);opacity:0}100%{transform:translateX(-50%) scale(1);opacity:1}}
.nav-pin{position:relative;width:36px;height:46px}
.nav-pin-body{position:absolute;inset:0;transform-origin:50% 100%;filter:drop-shadow(0 3px 4px rgba(0,0,0,.25))}
.nav-pin-drop{animation:navPinDrop .6s cubic-bezier(.3,.9,.4,1.1) both}
.nav-pin-shadow{position:absolute;left:50%;bottom:-1px;width:18px;height:6px;border-radius:50%;background:rgba(0,0,0,.22);transform:translateX(-50%);animation:navPinShadow .6s ease-out both}
.nav-here{position:absolute;left:24px;top:50%;transform:translateY(-50%);padding:4px 9px;border-radius:11px;background:#0e2030;color:#fff;font-size:11px;font-weight:800;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.25);pointer-events:none}
.nav-guiding .nav-here{display:none}
.leaflet-control-attribution{font-size:9.5px!important;line-height:1.4!important;padding:0 5px!important;background:${T.bg2}cc!important;color:${T.txD}!important;border-radius:6px 0 0 0}
.leaflet-control-attribution a{color:inherit!important}
    `}</style>
    {/* Full-screen map */}
    <div ref={mapRef} style={{position:"absolute",inset:0}}/>
    {/* Floating UI */}
    {!guiding&&searchCard}
    {nextClsCard}
    {mapToggle}
    {outOfRegionChip}
    {routeCard}
    {routePill}
    {noRouteCard}
    {/* 位置情報: 事前説明（未同意時のみ・検索画面のとき） / 拒否時の案内 */}
    {locPromptShown&&<div role="dialog" aria-live="polite" style={{position:"absolute",left:mob?10:14,right:mob?10:"auto",bottom:mob?16:20,width:mob?"auto":cardW,zIndex:1000,padding:"12px 14px",background:T.bg2,borderRadius:14,boxShadow:"0 4px 20px rgba(0,0,0,.35)",border:`1px solid ${T.bd}`}}>
      {locDeniedMsg?<>
        <div style={{fontSize:13,fontWeight:700,color:T.txH}}>{t("navi.locDeniedTitle")}</div>
        <div style={{fontSize:12,color:T.txD,marginTop:4,lineHeight:1.5}}>{t("navi.locDeniedBody")}</div>
        <div style={{display:"flex",justifyContent:"flex-end",marginTop:10}}>
          <button onClick={()=>setLocDeniedMsg(false)} style={{padding:"6px 14px",borderRadius:8,border:`1px solid ${T.bd}`,background:"transparent",cursor:"pointer",fontSize:12,fontWeight:600,color:T.txD}}>{t("navi.locClose")}</button>
        </div>
      </>:<>
        <div style={{fontSize:13,fontWeight:700,color:T.txH}}>{t("navi.locPromptTitle")}</div>
        <div style={{fontSize:12,color:T.txD,marginTop:4,lineHeight:1.5}}>{t("navi.locPromptBody")}</div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:10}}>
          <button onClick={()=>saveLocConsent("declined")} style={{padding:"6px 14px",borderRadius:8,border:`1px solid ${T.bd}`,background:"transparent",cursor:"pointer",fontSize:12,fontWeight:600,color:T.txD}}>{t("navi.locNotNow")}</button>
          <button onClick={requestLocation} style={{padding:"6px 14px",borderRadius:8,border:"none",background:"#4285f4",cursor:"pointer",fontSize:12,fontWeight:700,color:"#fff"}}>{t("navi.locAllow")}</button>
        </div>
      </>}
    </div>}
    {/* 案内中: 終了ボタン（searchCardが非表示のため） */}
    {guiding&&<div style={{position:"absolute",top:mob?10:14,left:mob?10:14,right:mob?10:"auto",width:cardW,zIndex:1000}}>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:T.bg2,borderRadius:14,boxShadow:"0 4px 20px rgba(0,0,0,.4)",border:`1px solid #4de8b060`}}>
        <div style={{width:8,height:8,borderRadius:"50%",background:following?"#4de8b0":"#888",animation:following?"locPulse 1.5s infinite":"none",flexShrink:0}}/>
        <span style={{fontSize:13,fontWeight:700,color:following?"#4de8b0":"#888",flex:1}}>{following?t("navi.guiding"):t("navi.freeControl")}</span>
        {route&&<span style={{fontSize:12,fontWeight:600,color:T.txH}}>{t("navi.distMin",{dist:route.distance,min:route.minutes})}</span>}
        <button onClick={stopGuiding} style={{padding:"5px 12px",borderRadius:8,border:`1px solid ${T.red}40`,background:`${T.red}10`,cursor:"pointer",fontSize:11,fontWeight:600,color:T.red}}>{t("navi.stop")}</button>
      </div>
    </div>}
    {/* 案内中 + 自由操作中: 現在地に戻るボタン */}
    {guiding&&!following&&<button onClick={reCenter} style={{position:"absolute",bottom:hasRoute&&!panelMin?(mob?180:195):(mob?70:80),right:mob?12:14,zIndex:1000,display:"flex",alignItems:"center",gap:6,padding:"10px 16px",borderRadius:28,background:T.bg2,border:`1px solid #4285f440`,boxShadow:"0 4px 16px rgba(0,0,0,.35)",cursor:"pointer",animation:"navSlideUp .2s ease-out",transition:"bottom .25s ease"}}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4285f4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4m-10-10h4m12 0h4"/></svg>
      <span style={{fontSize:13,fontWeight:700,color:"#4285f4"}}>{t("navi.recenter")}</span>
    </button>}
    {/* ── Tips Modal ── */}
    {tipsOpen&&destSpotInfo?.meta?.tips&&(()=>{
      const col=destSpotInfo.col;
      const secIcons=[
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>,
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 10h20"/></svg>,
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z"/></svg>,
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
      ];
      return <div style={{position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"flex-end",justifyContent:"center",animation:"navFadeIn .2s ease-out"}} onClick={()=>setTipsOpen(false)}>
        <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.55)",backdropFilter:"blur(4px)"}}/>
        <div onClick={e=>e.stopPropagation()} style={{position:"relative",width:"100%",maxWidth:480,maxHeight:"85vh",margin:mob?0:"0 16px 16px",borderRadius:mob?"20px 20px 0 0":20,background:T.bg2,border:`1px solid ${T.bd}`,boxShadow:"0 -4px 40px rgba(0,0,0,.5)",display:"flex",flexDirection:"column",animation:"navSlideUp .25s ease-out"}}>
          {/* Handle bar */}
          {mob&&<div style={{display:"flex",justifyContent:"center",padding:"10px 0 0"}}><div style={{width:36,height:4,borderRadius:2,background:T.bdL}}/></div>}
          {/* Header */}
          <div style={{padding:"16px 20px 12px",borderBottom:`1px solid ${T.bd}`,display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
            <div style={{width:40,height:40,borderRadius:12,background:`${col}20`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:16,fontWeight:700,color:T.txH}}>{t("navi.firstTimeGuide")}</div>
              <div style={{fontSize:11,color:T.txD,marginTop:1}}>{t("navi.visitManners",{name:destSpotInfo.label})}</div>
            </div>
            <button onClick={()=>setTipsOpen(false)} style={{width:32,height:32,borderRadius:"50%",border:`1px solid ${T.bd}`,background:T.bg3,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:T.txD,flexShrink:0}}>{I.x}</button>
          </div>
          {/* Scrollable body */}
          <div style={{flex:1,overflowY:"auto",padding:"12px 16px 20px",WebkitOverflowScrolling:"touch"}}>
            <div style={{fontSize:11,color:T.txD,lineHeight:1.6,marginBottom:14,padding:"8px 12px",borderRadius:8,background:`${col}08`,borderLeft:`3px solid ${col}40`}}>
              カウンター4席・ワンオペの超個人店。店主のこだわりが強めですが、それも含めて愛されるお店です。気持ちよく食べるために知っておくと安心なことをまとめました。
            </div>
            {destSpotInfo.meta.tips.map((sec,si)=><div key={si} style={{marginBottom:si<destSpotInfo.meta.tips.length-1?16:0}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                <div style={{width:28,height:28,borderRadius:8,background:`${col}15`,display:"flex",alignItems:"center",justifyContent:"center",color:col,flexShrink:0}}>{secIcons[si]||secIcons[0]}</div>
                <span style={{fontSize:13,fontWeight:700,color:T.txH}}>{sec.title}</span>
                <span style={{fontSize:10,color:T.txD,background:T.bg3,padding:"2px 7px",borderRadius:10}}>{t("navi.itemsCount",{n:sec.items.length})}</span>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:1}}>
                {sec.items.map((item,ii)=><div key={ii} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"6px 10px",borderRadius:8,background:ii%2===0?"transparent":T.bg3}}>
                  <span style={{fontSize:10,fontWeight:700,color:`${col}90`,width:16,textAlign:"right",flexShrink:0,marginTop:1}}>{ii+1}.</span>
                  <span style={{fontSize:12,color:T.tx,lineHeight:1.5}}>{item}</span>
                </div>)}
              </div>
            </div>)}
            {/* ── 1ミリも怒ってないタイムライン ── */}
            {destSpotInfo.meta.notAngry&&<div style={{marginTop:20}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <div style={{width:28,height:28,borderRadius:8,background:`${T.red}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.red} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                </div>
                <div style={{flex:1}}>
                  <span style={{fontSize:13,fontWeight:700,color:T.txH}}>１ミリも怒ってないのですが</span>
                  <div style={{fontSize:10,color:T.txD}}>撤去・廃止の歴史</div>
                </div>
              </div>
              <div style={{position:"relative",paddingLeft:14}}>
                <div style={{position:"absolute",left:5,top:4,bottom:4,width:2,background:`${T.red}20`,borderRadius:1}}/>
                {destSpotInfo.meta.notAngry.map((ev,ei)=><div key={ei} style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:ei<destSpotInfo.meta.notAngry.length-1?2:0,padding:"5px 8px",borderRadius:8,background:ei%2===0?"transparent":T.bg3,position:"relative"}}>
                  <div style={{position:"absolute",left:-10,top:10,width:8,height:8,borderRadius:"50%",background:T.bg2,border:`2px solid ${T.red}50`}}/>
                  <span style={{fontSize:9,fontWeight:600,color:T.txD,width:52,flexShrink:0,marginTop:2}}>{ev.date}</span>
                  <span style={{fontSize:11,color:T.tx,lineHeight:1.5}}>{ev.text}</span>
                </div>)}
              </div>
            </div>}
            <div style={{marginTop:16,padding:"10px 12px",borderRadius:8,background:T.bg3,fontSize:11,color:T.txD,lineHeight:1.5,textAlign:"center"}}>
              店主いわく「僕が口に出してるだけで、ラーメン屋さんみんな思ってること」とのこと。リスペクトを持って美味しくいただきましょう。
            </div>
            <a href="https://www.youtube.com/watch?v=FIiwCPRcMbk" target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",gap:10,marginTop:10,padding:"10px 12px",borderRadius:8,background:"#ff000012",border:"1px solid #ff000025",textDecoration:"none",cursor:"pointer",transition:"background .15s"}} onMouseEnter={e=>e.currentTarget.style.background="#ff000020"} onMouseLeave={e=>e.currentTarget.style.background="#ff000012"}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="16" rx="3" fill="#ff0000"/><polygon points="10,8.5 16,12 10,15.5" fill="#fff"/></svg>
              <div style={{flex:1}}>
                <div style={{fontSize:12,fontWeight:600,color:T.txH}}>なるメンルールブック</div>
                <div style={{fontSize:10,color:T.txD}}>店主本人が解説する元動画</div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.txD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
            <a href="https://x.com/NARUTOmoMENMAmo" target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",gap:10,marginTop:6,padding:"10px 12px",borderRadius:8,background:`${T.txH}08`,border:`1px solid ${T.txH}15`,textDecoration:"none",cursor:"pointer",transition:"background .15s"}} onMouseEnter={e=>e.currentTarget.style.background=`${T.txH}14`} onMouseLeave={e=>e.currentTarget.style.background=`${T.txH}08`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill={T.txH}><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              <div style={{flex:1}}>
                <div style={{fontSize:12,fontWeight:600,color:T.txH}}>@NARUTOmoMENMAmo</div>
                <div style={{fontSize:10,color:T.txD}}>営業情報はここでチェック</div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.txD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
          </div>
        </div>
      </div>;
    })()}
  </div>;
};
