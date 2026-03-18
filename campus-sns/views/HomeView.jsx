import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { NOW, uDue, pDone } from "../utils.jsx";
import { Tag } from "../shared.jsx";
import { useLocationSharing, getSpot } from "../hooks/useLocationSharing.js";

// SVG weather icons — clean, consistent style
const WxIcon=({type,sz=20})=>{const s={width:sz,height:sz,display:"inline-block",verticalAlign:"middle",flexShrink:0};
  const sun=<svg style={s} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="5" fill="#f59e0b" opacity=".85"/><g stroke="#f59e0b" strokeWidth="2" strokeLinecap="round">{[[12,1,12,3],[12,21,12,23],[4.22,4.22,5.64,5.64],[18.36,18.36,19.78,19.78],[1,12,3,12],[21,12,23,12],[4.22,19.78,5.64,18.36],[18.36,5.64,19.78,4.22]].map(([x1,y1,x2,y2],i)=><line key={i} x1={x1} y1={y1} x2={x2} y2={y2}/>)}</g></svg>;
  const cloud=<svg style={s} viewBox="0 0 24 24" fill="none"><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" fill="#94a3b8" opacity=".7" stroke="#64748b" strokeWidth="1.5" strokeLinejoin="round"/></svg>;
  const partCloud=<svg style={s} viewBox="0 0 24 24" fill="none"><circle cx="9" cy="9" r="4" fill="#f59e0b" opacity=".8"/><g stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round">{[[9,2,9,3.5],[9,14.5,9,16],[3.05,3.05,4.11,4.11],[13.89,13.89,14.95,14.95],[2,9,3.5,9],[14.5,9,16,9],[3.05,14.95,4.11,13.89],[13.89,4.11,14.95,3.05]].map(([x1,y1,x2,y2],i)=><line key={i} x1={x1} y1={y1} x2={x2} y2={y2}/>)}</g><path d="M19 14h-1A6.5 6.5 0 008 16.5 4 4 0 008 22h11a4 4 0 000-8z" fill="#94a3b8" opacity=".7" stroke="#64748b" strokeWidth="1.5" strokeLinejoin="round"/></svg>;
  const rain=<svg style={s} viewBox="0 0 24 24" fill="none"><path d="M18 8h-1.26A8 8 0 109 18h9a5 5 0 000-10z" fill="#93c5fd" opacity=".5" stroke="#3b82f6" strokeWidth="1.5" strokeLinejoin="round"/><g stroke="#3b82f6" strokeWidth="1.8" strokeLinecap="round"><line x1="8" y1="20" x2="7" y2="23"/><line x1="12" y1="20" x2="11" y2="23"/><line x1="16" y1="20" x2="15" y2="23"/></g></svg>;
  const heavyRain=<svg style={s} viewBox="0 0 24 24" fill="none"><path d="M18 7h-1.26A8 8 0 109 17h9a5 5 0 000-10z" fill="#93c5fd" opacity=".6" stroke="#2563eb" strokeWidth="1.5" strokeLinejoin="round"/><g stroke="#2563eb" strokeWidth="2" strokeLinecap="round"><line x1="7" y1="19" x2="5.5" y2="23"/><line x1="10.5" y1="19" x2="9" y2="23"/><line x1="14" y1="19" x2="12.5" y2="23"/><line x1="17.5" y1="19" x2="16" y2="23"/></g></svg>;
  const drizzle=<svg style={s} viewBox="0 0 24 24" fill="none"><circle cx="8" cy="7" r="3.5" fill="#f59e0b" opacity=".7"/><path d="M18 12h-1A6 6 0 008 14a4 4 0 004 6h6a4 4 0 000-8z" fill="#93c5fd" opacity=".45" stroke="#3b82f6" strokeWidth="1.5" strokeLinejoin="round"/><g stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round"><line x1="10" y1="21" x2="9.5" y2="23"/><line x1="14" y1="21" x2="13.5" y2="23"/></g></svg>;
  const fog=<svg style={s} viewBox="0 0 24 24" fill="none"><g stroke="#9ca3af" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="8" x2="21" y2="8"/><line x1="5" y1="12" x2="19" y2="12"/><line x1="3" y1="16" x2="21" y2="16"/><line x1="7" y1="20" x2="17" y2="20"/></g></svg>;
  const snow=<svg style={s} viewBox="0 0 24 24" fill="none"><path d="M18 8h-1.26A8 8 0 109 18h9a5 5 0 000-10z" fill="#e0e7ff" opacity=".5" stroke="#93c5fd" strokeWidth="1.5" strokeLinejoin="round"/><g fill="#60a5fa">{[[8,21],[12,20],[16,21],[10,23],[14,23]].map(([cx,cy],i)=><circle key={i} cx={cx} cy={cy} r="1.2"/>)}</g></svg>;
  const thunder=<svg style={s} viewBox="0 0 24 24" fill="none"><path d="M18 6h-1.26A8 8 0 109 16h9a5 5 0 000-10z" fill="#c4b5fd" opacity=".5" stroke="#7c3aed" strokeWidth="1.5" strokeLinejoin="round"/><path d="M13 16l-2 4h3l-2 4" stroke="#eab308" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  const m={sun,partCloud,cloud,rain,heavyRain,drizzle,fog,snow,thunder};
  return m[type]||sun;
};
// [label, iconType, tint]
const WX={0:["晴れ","sun","#f59e0b"],1:["晴れ","partCloud","#f59e0b"],2:["くもり","partCloud","#6b7280"],3:["くもり","cloud","#6b7280"],45:["霧","fog","#9ca3af"],48:["霧","fog","#9ca3af"],51:["小雨","drizzle","#3b82f6"],53:["雨","rain","#3b82f6"],55:["雨","rain","#3b82f6"],61:["雨","rain","#3b82f6"],63:["雨","rain","#2563eb"],65:["大雨","heavyRain","#1d4ed8"],71:["雪","snow","#93c5fd"],73:["雪","snow","#93c5fd"],75:["大雪","snow","#60a5fa"],80:["にわか雨","drizzle","#3b82f6"],81:["にわか雨","rain","#2563eb"],95:["雷雨","thunder","#7c3aed"],96:["雷雨","thunder","#7c3aed"],99:["雷雨","thunder","#6d28d9"]};
const wxInfo=c=>WX[c]||["--","sun","#6b7280"];

const DEF_LOC={name:"東京",lat:35.68,lon:139.77};
const PD=[{s:[8,50],e:[10,30],l:"1限"},{s:[10,45],e:[12,25],l:"2限"},{s:[13,20],e:[15,0],l:"3限"},{s:[15,15],e:[16,55],l:"4限"},{s:[17,10],e:[18,50],l:"5限"}];
const fPdTime=(h,m)=>`${h}:${String(m).padStart(2,"0")}`;
const DAY_NAMES=["日","月","火","水","木","金","土"];

export const HomeView=({asgn,setView,setCid,setCh,mob,courses=[],user={},myEvents=[],quarter,hiddenSet=new Set(),qd,goToBuilding})=>{
  const [now,setNow]=useState(()=>new Date());
  const [wx,setWx]=useState(()=>{try{const v=localStorage.getItem("wxCache");if(v){const d=JSON.parse(v);if(Date.now()-d._ts<30*60*1000)return d;}return null;}catch{return null;}});
  const [loc,setLoc]=useState(()=>{try{const v=localStorage.getItem("wxLoc");return v?JSON.parse(v):DEF_LOC;}catch{return DEF_LOC;}});
  const [locOpen,setLocOpen]=useState(false);
  const [locQ,setLocQ]=useState("");
  const [locRes,setLocRes]=useState([]);
  const [locLoading,setLocLoading]=useState(false);
  const [portalData,setPortalData]=useState(null);
  const [portalLoading,setPortalLoading]=useState(false);
  const [portalError,setPortalError]=useState(null);
  const [portalPage,setPortalPage]=useState(null);
  const {myLoc}=useLocationSharing({id:user.moodleId||user.id,name:user.name,col:user.col,av:user.av});
  const mySpot=getSpot(myLoc);

  useEffect(()=>{
    const tid=setInterval(()=>setNow(new Date()),60000);
    return()=>clearInterval(tid);
  },[]);
  useEffect(()=>{try{localStorage.setItem("wxLoc",JSON.stringify(loc));}catch{}},[loc]);
  useEffect(()=>{fetch("/api/portal/page?warmup=1",{cache:"no-store"}).catch(()=>{});},[]);
  useEffect(()=>{
    (async()=>{
      try{
        const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&hourly=temperature_2m,weather_code,precipitation_probability&forecast_days=2&timezone=Asia%2FTokyo`);
        if(!r.ok)return;
        const d=await r.json();
        if(d.current){
          const dy=d.daily||{};
          const hr=d.hourly||{};
          // 現在時刻から先の時間帯データを抽出（1時間おき、最大7個）
          const nowH=new Date();
          const hourly=[];
          if(hr.time&&hr.temperature_2m&&hr.weather_code){
            const curIdx=hr.time.findIndex(t=>new Date(t)>nowH);
            if(curIdx>=0){
              for(let i=curIdx;i<hr.time.length&&hourly.length<7;i+=1){
                const dt=new Date(hr.time[i]);
                hourly.push({h:dt.getHours(),temp:Math.round(hr.temperature_2m[i]),code:hr.weather_code[i],rain:hr.precipitation_probability?hr.precipitation_probability[i]:null,isNextDay:dt.getDate()!==nowH.getDate()});
              }
            }
          }
          const wxData={temp:Math.round(d.current.temperature_2m),code:d.current.weather_code,hi:dy.temperature_2m_max?Math.round(dy.temperature_2m_max[0]):null,lo:dy.temperature_2m_min?Math.round(dy.temperature_2m_min[0]):null,rain:dy.precipitation_probability_max?dy.precipitation_probability_max[0]:null,hourly};
          setWx(wxData);
          try{localStorage.setItem("wxCache",JSON.stringify({...wxData,_ts:Date.now()}));}catch{}
        }
      }catch{}
    })();
  },[loc.lat,loc.lon]);
  // Geocoding search with debounce
  useEffect(()=>{
    if(!locQ.trim()){setLocRes([]);return;}
    setLocLoading(true);
    const tid=setTimeout(async()=>{
      try{
        const r=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locQ.trim())}&count=5&language=ja`);
        if(!r.ok){setLocLoading(false);return;}
        const d=await r.json();
        setLocRes(d.results||[]);
      }catch{}
      setLocLoading(false);
    },300);
    return()=>clearTimeout(tid);
  },[locQ]);

  // 今日の授業
  const dow=now.getDay(),di=dow>=1&&dow<=5?dow-1:-1;
  const nowMin=now.getHours()*60+now.getMinutes();
  const todayClasses=di>=0?PD.map((pd,pi)=>{const co=qd?.TT?.[pi]?.[di];if(!co)return null;const sM=pd.s[0]*60+pd.s[1],eM=pd.e[0]*60+pd.e[1];const st=nowMin>=eM?"done":nowMin>=sM?"now":"next";return{co,pd,pi,st,sM,eM,type:"class"};}).filter(Boolean):[];

  const vis=asgn.filter(a=>!hiddenSet.has(a.id));
  const active=vis.filter(a=>a.st!=="completed");
  const upcoming=[...active].filter(a=>a.due>=NOW).sort((a,b)=>a.due-b.due).slice(0,mob?4:8);

  // 今日のタイムライン: 授業+予定+締切を時刻順に統合
  const todayKey=`${NOW.getFullYear()}-${NOW.getMonth()}-${NOW.getDate()}`;
  const todayEvents=myEvents.filter(e=>{const d=e.date instanceof Date?e.date:new Date(e.date);return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`===todayKey;});
  const todayAsgn=vis.filter(a=>{const d=a.due;return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`===todayKey&&a.st!=="completed";});

  // 全アイテムを統合して時刻ソート
  const timeline=[];
  todayClasses.forEach(c=>timeline.push({...c,sortMin:c.sM}));
  todayEvents.forEach(ev=>{const d=ev.date instanceof Date?ev.date:new Date(ev.date);const m=d.getHours()*60+d.getMinutes();timeline.push({type:"event",ev,sM:m,sortMin:m,st:nowMin>m+60?"done":nowMin>=m?"now":"next"});});
  todayAsgn.forEach(a=>{const d=a.due;const m=d.getHours()*60+d.getMinutes();const co=courses.find(x=>x.id===a.cid);timeline.push({type:"deadline",a,co,sM:m,sortMin:m,st:a.due<NOW?"done":"next"});});
  timeline.sort((a,b)=>a.sortMin-b.sortMin);

  const gcol=mob?2:3;

  return(
    <><div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
      {/* ── Hero: 挨拶 + 天気 ── */}
      <div style={{padding:"10px 16px 6px"}}>
        {/* 日時 + 天気カード */}
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          {/* 日時 */}
          <div style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center"}}>
            <span style={{fontSize:mob?26:32,fontWeight:800,color:T.txH,lineHeight:1,letterSpacing:-1}}>{now.getMonth()+1}/{now.getDate()}</span>
            <span style={{fontSize:11,fontWeight:600,color:T.txD,marginTop:3}}>{DAY_NAMES[now.getDay()]}曜日</span>
            <span style={{fontSize:12,fontWeight:700,color:T.accent,marginTop:2}}>{now.getHours()}:{String(now.getMinutes()).padStart(2,"0")}</span>
          </div>
          {/* 天気 */}
          {wx?(()=>{const tint=wxInfo(wx.code)[2];const [,curIcon,]=wxInfo(wx.code);const [wxLabel]=wxInfo(wx.code);return(
          <div style={{position:"relative",flex:1,minWidth:0}}>
            <div onClick={()=>{setLocOpen(p=>!p);setLocQ("");setLocRes([]);}} style={{borderRadius:14,overflow:"hidden",cursor:"pointer",background:`linear-gradient(145deg,${tint}18,${tint}08,${T.bg2})`,border:`1px solid ${tint}25`,boxShadow:`0 2px 12px ${tint}12`}}>
              {/* 現在の天気 — メイン */}
              <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px"}}>
                <div style={{width:42,height:42,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:12,background:`${tint}15`,flexShrink:0}}>
                  <WxIcon type={curIcon} sz={28}/>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:1}}>
                  <div style={{display:"flex",alignItems:"baseline",gap:6}}>
                    <span style={{fontSize:24,fontWeight:800,color:T.txH,lineHeight:1,letterSpacing:-.5}}>{wx.temp}°</span>
                    <span style={{fontSize:12,fontWeight:600,color:tint,opacity:.9}}>{wxLabel}</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginTop:1}}>
                    {wx.hi!=null&&<span style={{fontSize:11,fontWeight:600,color:T.txD}}><span style={{color:"#ef6b5e"}}>↑</span>{wx.hi}°</span>}
                    {wx.lo!=null&&<span style={{fontSize:11,fontWeight:600,color:T.txD}}><span style={{color:"#60a5fa"}}>↓</span>{wx.lo}°</span>}
                    {wx.rain!=null&&wx.rain>0&&<span style={{fontSize:11,fontWeight:700,color:wx.rain>50?T.accent:T.txD,background:wx.rain>50?`${T.accent}15`:"transparent",padding:wx.rain>50?"0 4px":"0",borderRadius:3}}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" style={{verticalAlign:"middle",marginRight:1,opacity:.7}}><path d="M12 2C8 8 4 13 4 16a8 8 0 0016 0c0-3-4-8-8-14z"/></svg>
                      {wx.rain}%
                    </span>}
                  </div>
                </div>
                <div style={{marginLeft:"auto",display:"flex",flexDirection:"column",alignItems:"flex-end",justifyContent:"center",flexShrink:0,paddingLeft:8}}>
                  <span style={{fontSize:12,fontWeight:700,color:T.txH,opacity:.7,whiteSpace:"nowrap"}}>{loc.name}</span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.txD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{opacity:.4,marginTop:2}}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                </div>
              </div>
              {/* 時間別予報 */}
              {wx.hourly?.length>0&&<div style={{display:"flex",overflowX:"auto",scrollbarWidth:"none",msOverflowStyle:"none",padding:"0 6px 8px",gap:2}} onClick={e=>e.stopPropagation()}>
                {wx.hourly.map((h,i)=>{const [,iconType]=wxInfo(h.code);
                  const lbl=i===0?"Now":h.isNextDay?`翌${h.h}`:mob?`${h.h}:00`:`${h.h}時`;
                  return(
                  <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:mob?"5px 8px":"4px 7px",minWidth:mob?38:34,flexShrink:0,borderRadius:8,background:i===0?`${tint}14`:"transparent"}}>
                    <span style={{fontSize:i===0?9:8,fontWeight:700,color:i===0?tint:T.txD,whiteSpace:"nowrap",marginBottom:2}}>{lbl}</span>
                    <WxIcon type={iconType} sz={mob?18:16}/>
                    <span style={{fontSize:mob?10:9,fontWeight:700,color:T.txH,marginTop:2}}>{h.temp}°</span>
                    {h.rain!=null&&h.rain>0&&<span style={{fontSize:7,fontWeight:600,color:"#3b82f6"}}>{h.rain}%</span>}
                  </div>
                );})}
              </div>}
            </div>
            {/* 場所変更ドロップダウン */}
            {locOpen&&<>
              <div onClick={()=>setLocOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.25)",zIndex:998}}/>
              <div style={{position:"absolute",top:"100%",right:0,marginTop:4,width:220,background:T.bg2,border:`1px solid ${T.bdL}`,borderRadius:10,boxShadow:"0 12px 32px rgba(0,0,0,.6)",zIndex:999,overflow:"hidden"}} onClick={e=>e.stopPropagation()}>
                <div style={{padding:"8px 10px",borderBottom:`1px solid ${T.bd}`}}>
                  <div style={{position:"relative"}}>
                    <span style={{position:"absolute",left:7,top:"50%",transform:"translateY(-50%)",display:"flex",color:T.txD,pointerEvents:"none"}}>{I.search}</span>
                    <input value={locQ} onChange={e=>setLocQ(e.target.value)} placeholder="都市名を検索..." autoFocus style={{width:"100%",padding:"6px 8px 6px 28px",borderRadius:7,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:12,outline:"none"}}/>
                  </div>
                </div>
                <div style={{padding:"3px 5px",maxHeight:160,overflowY:"auto"}}>
                  {locLoading&&<div style={{padding:"10px 0",fontSize:11,color:T.txD,textAlign:"center"}}>検索中...</div>}
                  {!locLoading&&!locQ.trim()&&<div onClick={()=>{setLoc(DEF_LOC);setLocOpen(false);}} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 7px",borderRadius:7,cursor:"pointer",transition:"background .1s"}} onMouseEnter={e=>e.currentTarget.style.background=T.bg3} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <span style={{display:"flex",color:T.accent}}>{I.pin}</span>
                    <div><div style={{fontSize:11,fontWeight:600,color:T.txH}}>東京</div><div style={{fontSize:9,color:T.txD}}>デフォルト</div></div>
                  </div>}
                  {locRes.map(r=><div key={`${r.latitude}-${r.longitude}`} onClick={()=>{setLoc({name:r.name,lat:r.latitude,lon:r.longitude});setLocOpen(false);}} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 7px",borderRadius:7,cursor:"pointer",transition:"background .1s"}} onMouseEnter={e=>e.currentTarget.style.background=T.bg3} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <span style={{display:"flex",color:T.txD,flexShrink:0}}>{I.pin}</span>
                    <div style={{minWidth:0}}><div style={{fontSize:11,fontWeight:600,color:T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</div><div style={{fontSize:9,color:T.txD,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{[r.admin1,r.country].filter(Boolean).join(", ")}</div></div>
                  </div>)}
                  {!locLoading&&locQ.trim()&&locRes.length===0&&<div style={{padding:"10px 0",fontSize:10,color:T.txD,textAlign:"center"}}>「{locQ}」が見つかりません</div>}
                </div>
              </div>
            </>}
          </div>
        );})():null}
        </div>
      </div>

      {/* ── クイックアクセス ── */}
      <div style={{padding:"2px 16px 6px",display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6}}>
        <button onClick={()=>setView("circles")} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:5,padding:"7px 0",borderRadius:10,border:`1px solid ${T.accent}30`,background:`${T.accent}10`,cursor:"pointer"}}>
          <span style={{color:T.accent,display:"flex"}}>{I.circle}</span>
          <span style={{fontSize:11,fontWeight:600,color:T.txH}}>サークル</span>
        </button>
        <button onClick={()=>setView("calendar")} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:5,padding:"7px 0",borderRadius:10,border:`1px solid ${T.bd}`,background:T.bg2,cursor:"pointer"}}>
          <span style={{color:T.txD,display:"flex"}}>{I.cal}</span>
          <span style={{fontSize:11,fontWeight:600,color:T.txH}}>カレンダー</span>
        </button>
        <button onClick={()=>setView("events")} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:5,padding:"7px 0",borderRadius:10,border:`1px solid ${T.bd}`,background:T.bg2,cursor:"pointer"}}>
          <span style={{color:T.txD,display:"flex"}}>{I.event}</span>
          <span style={{fontSize:11,fontWeight:600,color:T.txH}}>イベント</span>
        </button>
        <button onClick={()=>{
          setPortalLoading(true);setPortalError(null);
          fetch("/api/portal/page",{cache:"no-store"}).then(async r=>{
            if(!r.ok){const b=await r.json().catch(()=>({}));throw new Error(b.error||(r.status===400?"ポータル認証情報が未設定です":"ポータルへの接続に失敗しました"));}
            return r.json();
          }).then(d=>{setPortalData(d);setPortalLoading(false);})
            .catch(e=>{setPortalError(e.message);setPortalLoading(false);});
        }} disabled={portalLoading} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:5,padding:"7px 0",borderRadius:10,border:`1px solid ${T.bd}`,background:T.bg2,cursor:portalLoading?"wait":"pointer",opacity:portalLoading?.6:1}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.txD} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
          <span style={{fontSize:11,fontWeight:600,color:T.txH}}>{portalLoading?"読込中...":"ポータル"}</span>
        </button>
      </div>

      {/* ── メインコンテンツ: 40:60 ── */}
      <div style={{padding:"4px 16px 8px",display:mob?"block":"flex",gap:14,alignItems:"flex-start"}}>

        {/* 左: 今日のスケジュール (40%) */}
        <div style={{flex:mob?undefined:"0 0 40%",minWidth:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <span style={{fontWeight:700,color:T.txH,fontSize:14}}>今日のスケジュール</span>
            <button onClick={()=>setView("calendar")} style={{background:"none",border:"none",color:T.accentSoft,fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",gap:2}}>カレンダー {I.arr}</button>
          </div>
          {timeline.length>0?<div style={{display:"flex",flexDirection:"column",gap:4}}>
            {timeline.map((item,idx)=>{
              const done=item.st==="done",act=item.st==="now";
              const timeStr=`${Math.floor(item.sM/60)}:${String(item.sM%60).padStart(2,"0")}`;
              if(item.type==="class"){
                const {co,pd}=item;
                // 出発地: 前の授業の建物、なければ大岡山駅
                const prevClass=timeline.slice(0,idx).filter(t=>t.type==="class").pop();
                const origId=prevClass?.co?.building||"eki";
                return <div key={`c${idx}`} onClick={()=>{setCid(co.id);setView("course");setCh("timeline");}} style={{display:"flex",gap:8,padding:"6px 10px",borderRadius:8,background:act?`${co.col}12`:T.bg2,border:`1px solid ${act?co.col:T.bd}`,cursor:"pointer",opacity:done?.4:1}}>
                  <div style={{width:38,flexShrink:0,textAlign:"center"}}>
                    <div style={{fontSize:10,fontWeight:700,color:done?T.txD:co.col}}>{pd.l}</div>
                    <div style={{fontSize:9,color:T.txD}}>{fPdTime(...pd.s)}</div>
                  </div>
                  <div style={{width:3,borderRadius:2,background:done?T.txD:co.col,flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:600,color:done?T.txD:T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{co.name}</div>
                    <div style={{display:"flex",gap:6,fontSize:10,color:T.txD,marginTop:1,alignItems:"center"}}>
                      <span>{fPdTime(...pd.s)}–{fPdTime(...pd.e)}</span>
                      {co.room&&<span>{co.room}{co.bldg?` (${co.bldg})`:""}</span>}
                      {co.building&&<span onClick={e=>{e.stopPropagation();goToBuilding?.(co.building,origId);}} style={{cursor:"pointer",color:T.accent,fontWeight:600,display:"inline-flex",alignItems:"center",gap:2,marginLeft:"auto",flexShrink:0}}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
                        行き方
                      </span>}
                    </div>
                  </div>
                  {act&&<span style={{fontSize:8,fontWeight:700,color:co.col,background:`${co.col}20`,padding:"1px 5px",borderRadius:3,alignSelf:"center",flexShrink:0}}>NOW</span>}
                </div>;
              }
              if(item.type==="event"){
                const {ev}=item;const evCol=ev.color||T.orange;
                return <div key={`e${idx}`} onClick={()=>setView("calendar")} style={{display:"flex",gap:8,padding:"6px 10px",borderRadius:8,background:T.bg2,border:`1px solid ${T.bd}`,cursor:"pointer",opacity:done?.4:1}}>
                  <div style={{width:38,flexShrink:0,textAlign:"center"}}>
                    <div style={{fontSize:10,fontWeight:600,color:evCol}}>予定</div>
                    <div style={{fontSize:9,color:T.txD}}>{timeStr}</div>
                  </div>
                  <div style={{width:3,borderRadius:2,background:evCol,flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:600,color:done?T.txD:T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ev.title}</div>
                    {ev.memo&&<div style={{fontSize:10,color:T.txD,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ev.memo}</div>}
                  </div>
                </div>;
              }
              if(item.type==="deadline"){
                const {a,co}=item;const dl=uDue(a.due);
                return <div key={`d${idx}`} onClick={()=>setView("tasks")} style={{display:"flex",gap:8,padding:"6px 10px",borderRadius:8,background:`${dl.c}08`,border:`1px solid ${dl.c}20`,cursor:"pointer"}}>
                  <div style={{width:38,flexShrink:0,textAlign:"center"}}>
                    <div style={{fontSize:10,fontWeight:700,color:dl.c}}>締切</div>
                    <div style={{fontSize:9,color:T.txD}}>{timeStr}</div>
                  </div>
                  <div style={{width:3,borderRadius:2,background:dl.c,flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:4}}>
                      <Tag color={co?.col}>{co?.code}</Tag>
                      <span style={{fontSize:10,fontWeight:700,color:dl.c,marginLeft:"auto"}}>{dl.t}</span>
                    </div>
                    <div style={{fontSize:12,fontWeight:600,color:T.txH,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.title}</div>
                  </div>
                </div>;
              }
              return null;
            })}
          </div>:<div style={{padding:"12px 0",textAlign:"center",color:T.txD,fontSize:12}}>今日の予定はありません</div>}
        </div>

        {/* 右: 直近の締切 (60%) */}
        {upcoming.length>0&&<div style={{flex:mob?undefined:"1 1 0",minWidth:0,marginTop:mob?12:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <span style={{fontWeight:700,color:T.txH,fontSize:14}}>直近の締切</span>
            <button onClick={()=>setView("tasks")} style={{background:"none",border:"none",color:T.accentSoft,fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",gap:2}}>すべて {I.arr}</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr",gap:6}}>
            {upcoming.map(a=>{const co=courses.find(x=>x.id===a.cid),dl=uDue(a.due),p=pDone(a.subs);return(
              <div key={a.id} onClick={()=>setView("tasks")} style={{padding:"8px 10px",borderRadius:8,background:dl.u?`${dl.c}08`:T.bg2,border:`1px solid ${dl.u?`${dl.c}20`:T.bd}`,borderLeft:`3px solid ${dl.c}`,cursor:"pointer"}}>
                <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:2}}>
                  <Tag color={co?.col}>{co?.code}</Tag>
                  {a.subs.length>0&&<span style={{fontSize:9,color:T.txD,marginLeft:"auto"}}>{p}%</span>}
                </div>
                <div style={{fontSize:12,fontWeight:600,color:T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.title}</div>
                <div style={{fontSize:11,fontWeight:700,color:dl.c,marginTop:3}}>{dl.t}</div>
              </div>
            );})}
          </div>
        </div>}

      </div>
      <div style={{height:12}}/>
    </div>

    {/* ── ポータル オーバーレイ (absolute within content wrapper, tab bar stays visible) ── */}
    {portalData&&(()=>{
      const secIcons={
        "教務系サービス":{col:"#4285f4",icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4285f4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>},
        "DX支援サービス":{col:"#34a853",icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34a853" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h6v6H9z"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/></svg>},
        "メール関連サービス":{col:"#ea4335",icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ea4335" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>},
        "各種情報サービス":{col:"#fbbc04",icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fbbc04" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>},
      };
      const fallback={col:T.accent,icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>};
      return <div style={{position:"absolute",inset:0,zIndex:10,background:T.bg,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <header style={{display:"flex",alignItems:"center",gap:8,padding:"env(safe-area-inset-top) 14px 0",minHeight:54,borderBottom:`1px solid ${T.bd}`,flexShrink:0,background:T.bg2}}>
          <div style={{display:"flex",alignItems:"center",gap:10,width:"100%",height:54}}>
            <button onClick={()=>setPortalData(null)} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",padding:4}}>{I.back}</button>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
            <span style={{flex:1,fontSize:17,fontWeight:700,color:T.txH}}>TiTech Portal</span>
            <button onClick={()=>setPortalData(null)} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",padding:4}}>{I.x}</button>
          </div>
        </header>
        <div style={{flex:1,overflowY:"scroll",WebkitOverflowScrolling:"touch",overscrollBehavior:"contain",minHeight:0,padding:"12px 16px 80px"}}>
          {portalData.sections?.map((sec,si)=>{
            const s=secIcons[sec.title]||fallback;
            return <div key={si} style={{marginBottom:20}}>
              <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 2px 8px"}}>
                {s.icon}
                <span style={{fontSize:15,fontWeight:700,color:T.txH}}>{sec.title}</span>
                <span style={{fontSize:11,color:T.txD,marginLeft:"auto"}}>{sec.links.length}件</span>
              </div>
              <div style={{borderRadius:14,background:T.bg2,border:`1px solid ${T.bd}`,overflow:"hidden"}}>
                {sec.links.map((lnk,li)=><button key={li} onClick={()=>setPortalPage({url:"/api/portal/page?url="+encodeURIComponent(lnk.url),label:lnk.label})} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"14px 16px",textDecoration:"none",border:"none",borderTop:li>0?`1px solid ${T.bd}`:"none",cursor:"pointer",background:"transparent",textAlign:"left",color:"inherit"}}>
                  <div style={{width:32,height:32,borderRadius:8,background:`${s.col}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={s.col} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  </div>
                  <span style={{flex:1,fontSize:14,fontWeight:500,color:T.txH,lineHeight:1.3}}>{lnk.label}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.txD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>)}
              </div>
            </div>;
          })}
          {(!portalData.sections||portalData.sections.length===0)&&<div style={{textAlign:"center",padding:"40px 0",color:T.txD,fontSize:13}}>サービス情報を取得できませんでした</div>}
        </div>
        {portalPage&&<div style={{position:"absolute",inset:0,zIndex:1,background:"#fff",display:"flex",flexDirection:"column"}}>
          <header style={{display:"flex",alignItems:"center",gap:8,padding:"env(safe-area-inset-top) 14px 0",minHeight:54,borderBottom:`1px solid ${T.bd}`,flexShrink:0,background:T.bg2}}>
            <div style={{display:"flex",alignItems:"center",gap:10,width:"100%",height:54}}>
              <button onClick={()=>setPortalPage(null)} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",padding:4}}>{I.back}</button>
              <span style={{flex:1,fontSize:14,fontWeight:600,color:T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{portalPage.label}</span>
              <button onClick={()=>{setPortalPage(null);setPortalData(null);}} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",padding:4}}>{I.x}</button>
            </div>
          </header>
          <iframe src={portalPage.url} style={{flex:1,border:"none",width:"100%",minHeight:0}} title={portalPage.label}/>
        </div>}
      </div>;
    })()}

    {/* ── ポータル エラー トースト ── */}
    {portalError&&createPortal(<div onClick={()=>setPortalError(null)} style={{position:"fixed",bottom:mob?80:24,left:"50%",transform:"translateX(-50%)",zIndex:9999,padding:"10px 20px",borderRadius:12,background:T.red,color:"#fff",fontSize:13,fontWeight:600,boxShadow:"0 4px 16px rgba(0,0,0,.3)",cursor:"pointer",animation:"navSlideUp .25s ease-out"}}>{portalError}</div>,document.body)}
    </>
  );
};
