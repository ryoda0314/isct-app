import { useState, useEffect } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { NOW, fT, fDS, uDue, pDone, tMap } from "../utils.jsx";
import { Av, Tag, Tx } from "../shared.jsx";

// [label, icon, tint] — tint is used for subtle bg gradient
const WX={0:["晴れ","☀","#f59e0b"],1:["晴れ","🌤","#f59e0b"],2:["くもり","⛅","#6b7280"],3:["くもり","☁","#6b7280"],45:["霧","🌫","#9ca3af"],48:["霧","🌫","#9ca3af"],51:["小雨","🌦","#3b82f6"],53:["雨","🌧","#3b82f6"],55:["雨","🌧","#3b82f6"],61:["雨","🌧","#3b82f6"],63:["雨","🌧","#2563eb"],65:["大雨","🌧","#1d4ed8"],71:["雪","❄","#93c5fd"],73:["雪","❄","#93c5fd"],75:["大雪","❄","#60a5fa"],80:["にわか雨","🌦","#3b82f6"],81:["にわか雨","🌧","#2563eb"],95:["雷雨","⛈","#7c3aed"],96:["雷雨","⛈","#7c3aed"],99:["雷雨","⛈","#6d28d9"]};
const wxInfo=c=>WX[c]||["--","🌡","#6b7280"];

const DEF_LOC={name:"東京",lat:35.68,lon:139.77};

export const HomeView=({asgn,setView,setCid,setCh,mob,courses=[],user={},myEvents=[],quarter,hiddenSet=new Set()})=>{
  const [now,setNow]=useState(()=>new Date());
  const [wx,setWx]=useState(null);
  const [loc,setLoc]=useState(()=>{try{const v=localStorage.getItem("wxLoc");return v?JSON.parse(v):DEF_LOC;}catch{return DEF_LOC;}});
  const [locOpen,setLocOpen]=useState(false);
  const [locQ,setLocQ]=useState("");
  const [locRes,setLocRes]=useState([]);
  const [locLoading,setLocLoading]=useState(false);

  useEffect(()=>{
    const tid=setInterval(()=>setNow(new Date()),60000);
    return()=>clearInterval(tid);
  },[]);
  useEffect(()=>{try{localStorage.setItem("wxLoc",JSON.stringify(loc));}catch{}},[loc]);
  useEffect(()=>{
    (async()=>{
      try{
        const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1&timezone=Asia%2FTokyo`);
        if(!r.ok)return;
        const d=await r.json();
        if(d.current){
          const dy=d.daily||{};
          setWx({temp:Math.round(d.current.temperature_2m),code:d.current.weather_code,hi:dy.temperature_2m_max?Math.round(dy.temperature_2m_max[0]):null,lo:dy.temperature_2m_min?Math.round(dy.temperature_2m_min[0]):null,rain:dy.precipitation_probability_max?dy.precipitation_probability_max[0]:null});
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

  const vis=asgn.filter(a=>!hiddenSet.has(a.id));
  const upcoming=[...vis].filter(a=>a.st!=="completed").sort((a,b)=>a.due-b.due).slice(0,mob?4:6);
  const overdue=vis.filter(a=>a.st!=="completed"&&a.due<NOW).length;
  const nextDl=[...vis].filter(a=>a.st!=="completed"&&a.due>NOW).sort((a,b)=>a.due-b.due)[0];

  // 今日の予定
  const todayKey=`${NOW.getFullYear()}-${NOW.getMonth()}-${NOW.getDate()}`;
  const todayEvents=myEvents.filter(e=>{const d=e.date instanceof Date?e.date:new Date(e.date);return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`===todayKey;}).sort((a,b)=>(a.date instanceof Date?a.date:new Date(a.date))-(b.date instanceof Date?b.date:new Date(b.date)));
  const todayAsgn=vis.filter(a=>{const d=a.due;return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`===todayKey&&a.st!=="completed";});
  const gcol=mob?2:3;

  return(
    <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
      {/* ── Hero ── */}
      <div style={{padding:"10px 16px 8px",display:"flex",gap:10,alignItems:"stretch"}}>
        {/* 左: 日付 + 挨拶 + 統計 + アラート */}
        <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:4}}>
          <div style={{display:"flex",alignItems:"baseline",gap:8}}>
            <div style={{fontSize:mob?18:22,fontWeight:800,color:T.txH,letterSpacing:-.3}}>{now.getMonth()+1}月{now.getDate()}日（{["日","月","火","水","木","金","土"][now.getDay()]}）</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:5}}>
            <Av u={user} sz={18}/>
            <span style={{fontSize:11,color:T.txD}}>{now.getHours()}:{String(now.getMinutes()).padStart(2,"0")}</span>
            <span style={{fontSize:11,color:T.txD}}>·</span>
            <span style={{fontSize:11,color:T.tx}}>おかえり{user.name?`、${user.name}さん`:""}</span>
          </div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:2}}>
            {overdue>0&&<div onClick={()=>setView("tasks")} style={{display:"flex",alignItems:"center",gap:4,padding:"2px 7px",borderRadius:6,background:`${T.red}14`,border:`1px solid ${T.red}30`,cursor:"pointer"}}><span style={{fontSize:11,fontWeight:700,color:T.red}}>{overdue}件期限切れ</span></div>}
            {nextDl&&<div onClick={()=>setView("tasks")} style={{display:"flex",alignItems:"center",gap:4,padding:"2px 7px",borderRadius:6,background:T.bg3,cursor:"pointer"}}><span style={{fontSize:10,color:T.txD}}>次の締切</span><span style={{fontSize:11,fontWeight:600,color:T.txH}}>{nextDl.title.length>10?nextDl.title.slice(0,10)+"…":nextDl.title}</span><span style={{fontSize:10,fontWeight:700,color:T.orange}}>{uDue(nextDl.due).t}</span></div>}
          </div>
        </div>
        {/* 右: 天気カード */}
        {wx&&(()=>{const tint=wxInfo(wx.code)[2];return(
          <div style={{flexShrink:0,borderRadius:12,minWidth:mob?90:110,padding:"10px 14px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:`linear-gradient(135deg,${tint}18,${tint}08)`,border:`1px solid ${tint}25`,position:"relative"}}>
            <div onClick={()=>{setLocOpen(p=>!p);setLocQ("");setLocRes([]);}} style={{display:"flex",alignItems:"center",gap:2,marginBottom:4,cursor:"pointer"}}>
              <span style={{display:"flex",color:T.txD}}>{I.pin}</span>
              <span style={{fontSize:9,fontWeight:600,color:T.txD,letterSpacing:.3}}>{loc.name}</span>
            </div>
            <span style={{fontSize:28,lineHeight:1}}>{wxInfo(wx.code)[1]}</span>
            <div style={{fontSize:20,fontWeight:800,color:T.txH,lineHeight:1,marginTop:3}}>{wx.temp}°</div>
            <div style={{fontSize:11,fontWeight:600,color:T.tx,marginTop:1}}>{wxInfo(wx.code)[0]}</div>
            <div style={{width:"100%",height:1,background:`${tint}20`,margin:"4px 0"}}/>
            <div style={{display:"flex",gap:6,fontSize:10,color:T.txD}}>
              {wx.hi!=null&&<span style={{color:T.red}}>↑{wx.hi}°</span>}
              {wx.lo!=null&&<span style={{color:T.accent}}>↓{wx.lo}°</span>}
            </div>
            {wx.rain!=null&&<div style={{fontSize:10,color:wx.rain>50?T.accent:T.txD,marginTop:2,fontWeight:600}}>☂ {wx.rain}%</div>}
            {locOpen&&<>
              <div onClick={()=>setLocOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.25)",zIndex:998}}/>
              <div style={{position:"absolute",top:"100%",right:0,marginTop:6,width:240,background:T.bg2,border:`1px solid ${T.bdL}`,borderRadius:12,boxShadow:"0 12px 32px rgba(0,0,0,.6)",zIndex:999,overflow:"hidden"}} onClick={e=>e.stopPropagation()}>
                <div style={{padding:"10px 12px 8px",borderBottom:`1px solid ${T.bd}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <span style={{fontSize:12,fontWeight:700,color:T.txH}}>場所を変更</span>
                    <button onClick={()=>setLocOpen(false)} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",padding:0}}>{I.x}</button>
                  </div>
                  <div style={{position:"relative"}}>
                    <span style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",display:"flex",color:T.txD,pointerEvents:"none"}}>{I.search}</span>
                    <input value={locQ} onChange={e=>setLocQ(e.target.value)} placeholder="都市名を検索..." autoFocus style={{width:"100%",padding:"7px 8px 7px 30px",borderRadius:8,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:12,outline:"none"}}/>
                  </div>
                </div>
                <div style={{padding:"4px 6px",maxHeight:180,overflowY:"auto"}}>
                  {locLoading&&<div style={{padding:"12px 0",fontSize:11,color:T.txD,textAlign:"center"}}>検索中...</div>}
                  {!locLoading&&!locQ.trim()&&<div onClick={()=>{setLoc(DEF_LOC);setLocOpen(false);}} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 8px",borderRadius:8,cursor:"pointer",transition:"background .1s"}} onMouseEnter={e=>e.currentTarget.style.background=T.bg3} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <span style={{display:"flex",color:T.accent}}>{I.pin}</span>
                    <div><div style={{fontSize:12,fontWeight:600,color:T.txH}}>東京</div><div style={{fontSize:10,color:T.txD}}>デフォルト</div></div>
                  </div>}
                  {locRes.map(r=><div key={`${r.latitude}-${r.longitude}`} onClick={()=>{setLoc({name:r.name,lat:r.latitude,lon:r.longitude});setLocOpen(false);}} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 8px",borderRadius:8,cursor:"pointer",transition:"background .1s"}} onMouseEnter={e=>e.currentTarget.style.background=T.bg3} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <span style={{display:"flex",color:T.txD,flexShrink:0}}>{I.pin}</span>
                    <div style={{minWidth:0}}><div style={{fontSize:12,fontWeight:600,color:T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</div><div style={{fontSize:10,color:T.txD,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{[r.admin1,r.country].filter(Boolean).join(", ")}</div></div>
                  </div>)}
                  {!locLoading&&locQ.trim()&&locRes.length===0&&<div style={{padding:"12px 0",fontSize:11,color:T.txD,textAlign:"center"}}>「{locQ}」が見つかりません</div>}
                </div>
              </div>
            </>}
          </div>
        );})()}
      </div>

      {/* ── 今日の予定（グリッド） ── */}
      {(todayEvents.length>0||todayAsgn.length>0)&&<div style={{padding:"4px 16px 8px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <span style={{fontWeight:700,color:T.txH,fontSize:14}}>今日の予定</span>
          <button onClick={()=>setView("calendar")} style={{background:"none",border:"none",color:T.accentSoft,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:2}}>カレンダー {I.arr}</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:`repeat(${gcol},1fr)`,gap:8}}>
          {todayEvents.map(ev=>{const d=ev.date instanceof Date?ev.date:new Date(ev.date);const end=ev.end?(ev.end instanceof Date?ev.end:new Date(ev.end)):null;return(
            <div key={ev.id} onClick={()=>setView("calendar")} style={{padding:"10px 12px",borderRadius:10,background:T.bg2,border:`1px solid ${T.bd}`,borderTop:`3px solid ${ev.color||T.accent}`,cursor:"pointer"}}>
              <div style={{fontSize:11,color:T.txD,marginBottom:4}}>{d.getHours()}:{String(d.getMinutes()).padStart(2,"0")}{end?`–${end.getHours()}:${String(end.getMinutes()).padStart(2,"0")}`:""}</div>
              <div style={{fontSize:13,fontWeight:600,color:T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ev.title}</div>
              {ev.memo&&<div style={{fontSize:11,color:T.txD,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ev.memo}</div>}
            </div>
          );})}
          {todayAsgn.map(a=>{const co=courses.find(x=>x.id===a.cid),dl=uDue(a.due);return(
            <div key={a.id} onClick={()=>setView("tasks")} style={{padding:"10px 12px",borderRadius:10,background:`${dl.c}08`,border:`1px solid ${dl.c}20`,borderTop:`3px solid ${dl.c}`,cursor:"pointer"}}>
              <Tag color={co?.col}>{co?.code}</Tag>
              <div style={{fontSize:13,fontWeight:600,color:T.txH,marginTop:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.title}</div>
              <div style={{fontSize:12,fontWeight:700,color:dl.c,marginTop:4}}>{dl.t}</div>
            </div>
          );})}
        </div>
      </div>}

      {/* ── 直近の締切（グリッド） ── */}
      {upcoming.length>0&&<div style={{padding:"4px 16px 8px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><span style={{fontWeight:700,color:T.txH,fontSize:14}}>直近の締切</span><button onClick={()=>setView("tasks")} style={{background:"none",border:"none",color:T.accentSoft,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:2}}>すべて {I.arr}</button></div>
        <div style={{display:"grid",gridTemplateColumns:`repeat(${gcol},1fr)`,gap:8}}>
          {upcoming.map(a=>{const co=courses.find(x=>x.id===a.cid),dl=uDue(a.due),p=pDone(a.subs);return(
            <div key={a.id} onClick={()=>setView("tasks")} style={{padding:"10px 12px",borderRadius:10,background:dl.u?`${dl.c}08`:T.bg2,border:`1px solid ${dl.u?`${dl.c}20`:T.bd}`,borderTop:`3px solid ${dl.c}`,cursor:"pointer"}}>
              <Tag color={co?.col}>{co?.code}</Tag>
              <div style={{fontSize:13,fontWeight:600,color:T.txH,marginTop:4,overflow:"hidden",textOverflow:"ellipsis",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{a.title}</div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:6}}>
                <span style={{fontSize:13,fontWeight:700,color:dl.c}}>{dl.t}</span>
                {a.subs.length>0&&<span style={{fontSize:11,color:T.txD}}>{p}%</span>}
              </div>
            </div>
          );})}
        </div>
      </div>}
      {upcoming.length===0&&todayEvents.length===0&&todayAsgn.length===0&&<div style={{padding:"20px 16px",textAlign:"center",color:T.txD,fontSize:13}}>直近の締切はありません</div>}
      <div style={{height:16}}/>
    </div>
  );
};
