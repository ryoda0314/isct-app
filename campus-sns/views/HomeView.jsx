import { useState, useEffect } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { NOW, uDue, pDone } from "../utils.jsx";
import { Av, Tag } from "../shared.jsx";
import { useLocationSharing, getSpot } from "../hooks/useLocationSharing.js";

// [label, icon, tint] — tint is used for subtle bg gradient
const WX={0:["晴れ","☀","#f59e0b"],1:["晴れ","🌤","#f59e0b"],2:["くもり","⛅","#6b7280"],3:["くもり","☁","#6b7280"],45:["霧","🌫","#9ca3af"],48:["霧","🌫","#9ca3af"],51:["小雨","🌦","#3b82f6"],53:["雨","🌧","#3b82f6"],55:["雨","🌧","#3b82f6"],61:["雨","🌧","#3b82f6"],63:["雨","🌧","#2563eb"],65:["大雨","🌧","#1d4ed8"],71:["雪","❄","#93c5fd"],73:["雪","❄","#93c5fd"],75:["大雪","❄","#60a5fa"],80:["にわか雨","🌦","#3b82f6"],81:["にわか雨","🌧","#2563eb"],95:["雷雨","⛈","#7c3aed"],96:["雷雨","⛈","#7c3aed"],99:["雷雨","⛈","#6d28d9"]};
const wxInfo=c=>WX[c]||["--","🌡","#6b7280"];

const DEF_LOC={name:"東京",lat:35.68,lon:139.77};
const PD=[{s:[8,50],e:[10,30],l:"1限"},{s:[10,45],e:[12,25],l:"2限"},{s:[13,20],e:[15,0],l:"3限"},{s:[15,15],e:[16,55],l:"4限"},{s:[17,10],e:[18,50],l:"5限"}];
const fPdTime=(h,m)=>`${h}:${String(m).padStart(2,"0")}`;
const DAY_NAMES=["日","月","火","水","木","金","土"];

export const HomeView=({asgn,setView,setCid,setCh,mob,courses=[],user={},myEvents=[],quarter,hiddenSet=new Set(),qd,goToBuilding})=>{
  const [now,setNow]=useState(()=>new Date());
  const [wx,setWx]=useState(null);
  const [loc,setLoc]=useState(()=>{try{const v=localStorage.getItem("wxLoc");return v?JSON.parse(v):DEF_LOC;}catch{return DEF_LOC;}});
  const [locOpen,setLocOpen]=useState(false);
  const [locQ,setLocQ]=useState("");
  const [locRes,setLocRes]=useState([]);
  const [locLoading,setLocLoading]=useState(false);
  const {myLoc}=useLocationSharing({id:user.moodleId||user.id,name:user.name,col:user.col,av:user.av});
  const mySpot=getSpot(myLoc);

  useEffect(()=>{
    const tid=setInterval(()=>setNow(new Date()),60000);
    return()=>clearInterval(tid);
  },[]);
  useEffect(()=>{try{localStorage.setItem("wxLoc",JSON.stringify(loc));}catch{}},[loc]);
  useEffect(()=>{
    (async()=>{
      try{
        const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&hourly=temperature_2m,weather_code,precipitation_probability&forecast_days=2&timezone=Asia%2FTokyo`);
        if(!r.ok)return;
        const d=await r.json();
        if(d.current){
          const dy=d.daily||{};
          const hr=d.hourly||{};
          // 現在時刻から先の時間帯データを抽出（3時間おき、最大8個）
          const nowH=new Date();
          const hourly=[];
          if(hr.time&&hr.temperature_2m&&hr.weather_code){
            const curIdx=hr.time.findIndex(t=>new Date(t)>nowH);
            if(curIdx>=0){
              for(let i=curIdx;i<hr.time.length&&hourly.length<8;i+=3){
                const dt=new Date(hr.time[i]);
                hourly.push({h:dt.getHours(),temp:Math.round(hr.temperature_2m[i]),code:hr.weather_code[i],rain:hr.precipitation_probability?hr.precipitation_probability[i]:null,isNextDay:dt.getDate()!==nowH.getDate()});
              }
            }
          }
          setWx({temp:Math.round(d.current.temperature_2m),code:d.current.weather_code,hi:dy.temperature_2m_max?Math.round(dy.temperature_2m_max[0]):null,lo:dy.temperature_2m_min?Math.round(dy.temperature_2m_min[0]):null,rain:dy.precipitation_probability_max?dy.precipitation_probability_max[0]:null,hourly});
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
  const upcoming=[...active].sort((a,b)=>a.due-b.due).slice(0,mob?4:8);

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
    <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
      {/* ── Hero: 日付+挨拶 左 / 天気 右 ── */}
      <div style={{padding:"10px 16px 6px",display:"flex",gap:12,alignItems:"center",justifyContent:"space-between"}}>
        {/* 左: 日付 + 挨拶 */}
        <div style={{minWidth:0,display:"flex",flexDirection:"column",gap:2}}>
          <div style={{fontSize:mob?18:22,fontWeight:800,color:T.txH,letterSpacing:-.3}}>{now.getMonth()+1}月{now.getDate()}日（{DAY_NAMES[now.getDay()]}）</div>
          <div style={{display:"flex",alignItems:"center",gap:5}}>
            <Av u={user} sz={18}/>
            <span style={{fontSize:15,fontWeight:700,color:T.txH}}>{now.getHours()}:{String(now.getMinutes()).padStart(2,"0")}</span>
            <span style={{fontSize:11,color:T.txD}}>·</span>
            <span style={{fontSize:11,color:T.tx,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>おかえり{user.name?`、${user.name}さん`:""}</span>
          </div>
        </div>
        {/* 右: 天気 */}
        {wx&&(()=>{const tint=wxInfo(wx.code)[2];const [,curIcon,]=wxInfo(wx.code);return(
          <div style={{position:"relative",flexShrink:0}}>
            <div style={{borderRadius:10,background:T.bg2,border:`1px solid ${T.bd}`,overflow:"hidden",display:"flex",alignItems:"stretch"}}>
              {/* 現在の天気 */}
              <div onClick={()=>{setLocOpen(p=>!p);setLocQ("");setLocRes([]);}} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",cursor:"pointer",background:`linear-gradient(135deg,${tint}14,${tint}06)`}}>
                <span style={{fontSize:26,lineHeight:1}}>{curIcon}</span>
                <span style={{fontSize:20,fontWeight:800,color:T.txH,lineHeight:1}}>{wx.temp}°</span>
                <div style={{display:"flex",flexDirection:"column",gap:1}}>
                  <span style={{fontSize:10,color:T.txD}}>{wx.hi!=null&&<span style={{color:T.red}}>↑{wx.hi}°</span>}{" "}{wx.lo!=null&&<span style={{color:T.accent}}>↓{wx.lo}°</span>}</span>
                  <div style={{display:"flex",alignItems:"center",gap:3}}>
                    <span style={{fontSize:10,fontWeight:600,color:T.txD}}>{loc.name}</span>
                    {wx.rain!=null&&<span style={{fontSize:10,fontWeight:600,color:wx.rain>50?T.accent:T.txD}}>☂{wx.rain}%</span>}
                  </div>
                </div>
              </div>
              {/* 時間別（デスクトップ: 横に並べる） */}
              {!mob&&<div style={{display:"flex",borderLeft:`1px solid ${T.bd}`}}>
                {wx.hourly?.slice(0,5).map((h,i,a)=>{const [,icon]=wxInfo(h.code);
                  const hr=h.h;const period=hr<6?"深夜":hr<12?"朝":hr<18?"昼":"夜";
                  const pCol=hr<6?"#8b5cf6":hr<12?"#f59e0b":hr<18?"#3b82f6":"#6366f1";
                  const lbl=i===0?"Now":h.isNextDay?`翌${hr}`:`${hr}時`;
                  return(
                  <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"4px 7px",minWidth:34,flexShrink:0,borderRight:i<a.length-1?`1px solid ${T.bd}`:"none",background:i===0?`${T.accent}10`:"transparent"}}>
                    <span style={{fontSize:i===0?9:8,fontWeight:700,color:i===0?T.accent:T.txD,whiteSpace:"nowrap"}}>{lbl}</span>
                    <span style={{fontSize:13,lineHeight:1,margin:"1px 0"}}>{icon}</span>
                    <span style={{fontSize:9,fontWeight:700,color:T.txH}}>{h.temp}°</span>
                    {h.rain!=null&&h.rain>0?<span style={{fontSize:7,fontWeight:600,color:h.rain>50?T.accent:T.txD}}>{h.rain}%</span>
                    :<span style={{fontSize:7,fontWeight:500,color:pCol,opacity:.7}}>{period}</span>}
                  </div>
                );})}
              </div>}
            </div>
            {/* 時間別（モバイル: 下段に表示） */}
            {mob&&<div style={{display:"flex",overflowX:"auto",scrollbarWidth:"none",msOverflowStyle:"none",borderTop:`1px solid ${T.bd}`}}>
              {wx.hourly?.slice(0,6).map((h,i,a)=>{const [,icon]=wxInfo(h.code);
                const hr=h.h;const period=hr<6?"深夜":hr<12?"朝":hr<18?"昼":"夜";
                const pCol=hr<6?"#8b5cf6":hr<12?"#f59e0b":hr<18?"#3b82f6":"#6366f1";
                const lbl=i===0?"Now":h.isNextDay?`翌${hr}:00`:`${hr}:00`;
                return(
                <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"4px 8px",minWidth:38,flexShrink:0,borderRight:i<a.length-1?`1px solid ${T.bd}`:"none",background:i===0?`${T.accent}10`:"transparent"}}>
                  <span style={{fontSize:i===0?9:8,fontWeight:700,color:i===0?T.accent:T.txD,whiteSpace:"nowrap"}}>{lbl}</span>
                  <span style={{fontSize:14,lineHeight:1,margin:"2px 0"}}>{icon}</span>
                  <span style={{fontSize:10,fontWeight:700,color:T.txH}}>{h.temp}°</span>
                  {h.rain!=null&&h.rain>0?<span style={{fontSize:7,fontWeight:600,color:h.rain>50?T.accent:T.txD}}>{h.rain}%</span>
                  :<span style={{fontSize:7,fontWeight:500,color:pCol,opacity:.7}}>{period}</span>}
                </div>
              );})}
            </div>}
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
        );})()}
      </div>

      {/* ── クイックリンク ── */}
      <div style={{padding:"0 16px 6px",display:"flex",gap:6,overflowX:"auto",scrollbarWidth:"none",msOverflowStyle:"none"}}>
        {[
          {l:"OCW-i",u:"https://www.ocw.titech.ac.jp",c:"#2196f3",s:"OC"},
          {l:"学務Web",u:"https://gakumu-web1.jim.titech.ac.jp",c:"#4caf50",s:"学"},
          {l:"Portal",u:"https://portal.titech.ac.jp",c:"#9c27b0",s:"P"},
          {l:"Library",u:"https://www.libra.titech.ac.jp",c:"#ff9800",s:"Li"},
        ].map(lk=>(
          <a key={lk.l} href={lk.u} target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",gap:6,padding:"7px 14px",borderRadius:8,background:`${lk.c}12`,border:`1px solid ${lk.c}30`,textDecoration:"none",flexShrink:0,cursor:"pointer",transition:"all .12s"}} onMouseEnter={e=>{e.currentTarget.style.background=`${lk.c}22`;e.currentTarget.style.borderColor=lk.c;}} onMouseLeave={e=>{e.currentTarget.style.background=`${lk.c}12`;e.currentTarget.style.borderColor=`${lk.c}30`;}}>
            <div style={{width:18,height:18,borderRadius:4,background:lk.c,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:8,fontWeight:800,color:"#fff",lineHeight:1}}>{lk.s}</span></div>
            <span style={{fontSize:12,fontWeight:700,color:T.txH,whiteSpace:"nowrap"}}>{lk.l}</span>
          </a>
        ))}
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
          <div style={{display:"grid",gridTemplateColumns:mob?"1fr 1fr":"1fr 1fr",gap:6}}>
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
  );
};
