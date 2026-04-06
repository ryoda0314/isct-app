import React, { useState, useMemo, useEffect } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { NOW, fDS, fDF, fTs, uDue, aMap, sMap } from "../utils.jsx";
import { Tag } from "../shared.jsx";
import { getAcademicInfo } from "../academicCalendar.js";
import { PERIOD_TIMES } from "../examData.js";
const DAYS=["月","火","水","木","金","土","日"];
const COLORS=["#6375f0","#e5534b","#3dae72","#a855c7","#d4843e","#c6a236","#2d9d8f","#c75d8e"];
const dKey=d=>`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const isSameDay=(a,b)=>a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();
const PD=[{s:[8,50],e:[10,30],l:"1限"},{s:[10,45],e:[12,25],l:"2限"},{s:[13,20],e:[15,0],l:"3限"},{s:[15,15],e:[16,55],l:"4限"},{s:[17,10],e:[18,50],l:"5限"}];
const PRESETS=[
  {label:"バイト",color:"#d4843e",time:"17:00",endTime:"22:00"},
  {label:"ゼミ",color:"#a855c7",time:"13:00",endTime:"15:00"},
  {label:"サークル",color:"#3dae72",time:"18:00",endTime:"20:00"},
  {label:"勉強",color:"#6375f0",time:"10:00",endTime:"12:00"},
  {label:"外出",color:"#2d9d8f",time:"10:00",endTime:"17:00"},
  {label:"通院",color:"#e5534b",time:"10:00",endTime:"11:00"},
];
const loadFavs=()=>{try{return JSON.parse(localStorage.getItem("calFavPresets"))||[];}catch{return[];}};
const saveFavs=f=>{try{localStorage.setItem("calFavPresets",JSON.stringify(f));}catch{}};

// Overlap detection: returns true if two time ranges overlap
const rangesOverlap=(s1h,s1m,e1h,e1m,s2h,s2m,e2h,e2m)=>{
  const a=s1h*60+s1m,b=e1h*60+e1m,c=s2h*60+s2m,d=e2h*60+e2m;
  return a<d&&c<b;
};

const getMonday=d=>{const dt=new Date(d);const day=dt.getDay();const diff=day===0?-6:1-day;dt.setDate(dt.getDate()+diff);dt.setHours(0,0,0,0);return dt;};

export const CalendarView=({myEvents,setMyEvents,asgn,courses=[],qd,qDataAll={},mob,pastTTCache={},fetchPastTimetable})=>{
  const [viewMode,setViewMode]=useState("month");
  const [calMonth,setCalMonth]=useState(()=>({y:NOW.getFullYear(),m:NOW.getMonth()}));
  const [weekStart,setWeekStart]=useState(()=>getMonday(NOW));
  const [selDay,setSelDay]=useState(null);
  const [adding,setAdding]=useState(false);
  const [editing,setEditing]=useState(null);
  const [form,setForm]=useState({title:"",date:"",time:"",endTime:"",color:COLORS[0],memo:"",repeat:"none"});
  const [savAsFav,setSavAsFav]=useState(false);
  const [favPresets,setFavPresets]=useState(loadFavs);
  const [filter,setFilter]=useState({ev:true,asgn:true,cls:true,exam:true});
  const togFilter=k=>setFilter(p=>({...p,[k]:!p[k]}));
  const [exams,setExams]=useState([]);
  useEffect(()=>{fetch("/api/exams").then(r=>r.json()).then(d=>setExams(d.exams||[])).catch(()=>{});},[]);
  const myExams=useMemo(()=>{
    if(!courses?.length||!exams.length)return [];
    const rawSet=new Set(),baseSet=new Set();
    courses.forEach(c=>{if(c.codeRaw&&c.codeRaw!==c.code)rawSet.add(c.codeRaw);else if(c.code)baseSet.add(c.code);});
    return exams.filter(e=>rawSet.has(e.code_raw)||baseSet.has(e.code));
  },[exams,courses]);

  const addFav=p=>{const next=[...favPresets,p];setFavPresets(next);saveFavs(next);};
  const removeFav=label=>{const next=favPresets.filter(f=>f.label!==label);setFavPresets(next);saveFavs(next);};
  const isFav=label=>favPresets.some(f=>f.label===label);
  const builtinLabels=new Set(PRESETS.map(p=>p.label));
  const fmtDate=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

  const resetForm=()=>{setForm({title:"",date:"",time:"",endTime:"",color:COLORS[0],memo:"",repeat:"none"});setSavAsFav(false);};
  const openAdd=(day)=>{
    const d=day||new Date(calMonth.y,calMonth.m,1);
    setForm({title:"",date:fmtDate(d),time:"09:00",endTime:"",color:COLORS[0],memo:"",repeat:"none"});
    setSavAsFav(false);setEditing(null);setAdding(true);
  };
  const openEdit=(ev)=>{
    const d=ev.date;
    const ts=`${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
    const et=ev.end?`${String(ev.end.getHours()).padStart(2,"0")}:${String(ev.end.getMinutes()).padStart(2,"0")}`:"";
    setForm({title:ev.title,date:fmtDate(d),time:ts,endTime:et,color:ev.color,memo:ev.memo||"",repeat:"none"});
    setSavAsFav(false);setEditing(ev.id);setAdding(true);
  };
  const applyPreset=p=>setForm(f=>({...f,title:p.label,color:p.color,time:p.time,endTime:p.endTime||""}));
  const quickAdd=(day,p)=>{
    const [hh,mm]=p.time.split(":").map(Number);
    const date=new Date(day.getFullYear(),day.getMonth(),day.getDate(),hh,mm);
    let end=null;
    if(p.endTime){const [eh,em]=p.endTime.split(":").map(Number);end=new Date(day.getFullYear(),day.getMonth(),day.getDate(),eh,em);}
    setMyEvents(prev=>[...prev,{id:`ev_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,title:p.label,date,end,color:p.color,memo:""}]);
  };

  const saveEvent=()=>{
    if(!form.title.trim()||!form.date)return;
    const [y,m,d]=form.date.split("-").map(Number);
    const [hh,mm]=form.time?form.time.split(":").map(Number):[0,0];
    const mkDate=(yr,mo,dy)=>{const dt=new Date(yr,mo-1,dy,hh,mm);let end=null;if(form.endTime){const [eh,em]=form.endTime.split(":").map(Number);end=new Date(yr,mo-1,dy,eh,em);}return{date:dt,end};};
    if(editing){
      const {date,end}=mkDate(y,m,d);
      setMyEvents(p=>p.map(e=>e.id===editing?{...e,title:form.title.trim(),date,end,color:form.color,memo:form.memo.trim()}:e));
    }else{
      const newEvs=[];
      const weeks=form.repeat==="weekly"?12:form.repeat==="biweekly"?6:1;
      const step=form.repeat==="biweekly"?14:7;
      for(let i=0;i<weeks;i++){
        const base=new Date(y,m-1,d+( i===0?0:i*step));
        const {date,end}=mkDate(base.getFullYear(),base.getMonth()+1,base.getDate());
        newEvs.push({id:`ev_${Date.now()}_${i}_${Math.random().toString(36).slice(2,5)}`,title:form.title.trim(),date,end,color:form.color,memo:form.memo.trim()});
      }
      setMyEvents(p=>[...p,...newEvs]);
    }
    if(savAsFav&&form.title.trim()&&!isFav(form.title.trim())&&!builtinLabels.has(form.title.trim())){
      addFav({label:form.title.trim(),color:form.color,time:form.time||"09:00",endTime:form.endTime||""});
    }
    setAdding(false);resetForm();setEditing(null);
  };
  const deleteEvent=id=>{setMyEvents(p=>p.filter(e=>e.id!==id));setEditing(null);setAdding(false);resetForm();};

  // Academic year from date: April–March = same nendo
  const dateToAY=d=>d.getMonth()>=3?d.getFullYear():d.getFullYear()-1;
  // Viewed month's academic year (for auto-fetch)
  const viewedAY=useMemo(()=>calMonth.m>=3?calMonth.y:calMonth.y-1,[calMonth.y,calMonth.m]);
  // Auto-fetch past timetable when browsing a different academic year
  useEffect(()=>{
    if(!fetchPastTimetable)return;
    // Check if qDataAll has any courses for this year
    const hasInCurrent=Object.values(qDataAll).some(qd=>qd?.C?.some(c=>c.year===viewedAY));
    if(!hasInCurrent&&!pastTTCache[viewedAY]){fetchPastTimetable(viewedAY);}
  },[viewedAY,qDataAll,pastTTCache,fetchPastTimetable]);

  // Timetable classes for a given date (academic calendar + year aware)
  const curTT=qd?.TT||[];
  const getTT=(q,yr)=>{
    // 1. Try qDataAll filtered by year
    const qAll=qDataAll[q]?.TT;
    if(qAll){
      const filtered=qAll.map(row=>(row||[]).map(cell=>cell&&(!cell.year||cell.year===yr)?cell:null));
      if(filtered.some(row=>row.some(cell=>cell)))return filtered;
    }
    // 2. Fallback: pastTTCache for that year
    const past=pastTTCache[yr];
    if(past?.qData?.[q]?.TT)return past.qData[q].TT;
    // 3. If same year as current quarter, use curTT as last resort
    return[];
  };
  const DOW_MAP={"月":0,"火":1,"水":2,"木":3,"金":4};
  const getClasses=date=>{
    const yr=dateToAY(date);
    const info=getAcademicInfo(date);
    const hasAcad=info.items.length>0||info.period;
    if(hasAcad){
      const classItems=info.items.filter(it=>it.type==="class");
      if(classItems.length===0) return [];
      const results=[];
      for(const item of classItems){
        const di=DOW_MAP[item.dow];
        if(di===undefined) continue;
        const tt=getTT(item.q,yr);
        PD.forEach((pd,pi)=>{const co=tt[pi]?.[di];if(co) results.push({type:"class",course:co,pd,pi,n:item.n,sub:item.sub,dow:item.dow});});
      }
      return results;
    }
    const dow=date.getDay();
    if(dow<1||dow>5)return [];
    const di=dow-1;
    // No academic calendar entry — use current quarter TT filtered by date's year
    const filteredCurTT=curTT.map(row=>(row||[]).map(cell=>cell&&(!cell.year||cell.year===yr)?cell:null));
    return PD.map((pd,pi)=>{const co=filteredCurTT[pi]?.[di];if(!co)return null;return{type:"class",course:co,pd,pi,n:null,sub:false};}).filter(Boolean);
  };

  // Build calendar data
  const first=new Date(calMonth.y,calMonth.m,1);
  const startOff=(first.getDay()+6)%7;
  const daysInMonth=new Date(calMonth.y,calMonth.m+1,0).getDate();
  const weeks=Math.ceil((startOff+daysInMonth)/7);
  const prevM=()=>setCalMonth(p=>p.m===0?{y:p.y-1,m:11}:{y:p.y,m:p.m-1});
  const nextM=()=>setCalMonth(p=>p.m===11?{y:p.y+1,m:0}:{y:p.y,m:p.m+1});
  const goToday=()=>{setCalMonth({y:NOW.getFullYear(),m:NOW.getMonth()});setWeekStart(getMonday(NOW));};
  const prevW=()=>setWeekStart(p=>{const d=new Date(p);d.setDate(d.getDate()-7);return d;});
  const nextW=()=>setWeekStart(p=>{const d=new Date(p);d.setDate(d.getDate()+7);return d;});

  const byDay=useMemo(()=>{
    const map={};
    const ensure=k=>{if(!map[k])map[k]={events:[],asgns:[],classes:[],exams:[]};return map[k];};
    myEvents.forEach(ev=>{
      ensure(dKey(ev.date)).events.push(ev);
      // Multi-day: also add to each intermediate & end day
      if(ev.end&&!isSameDay(ev.date,ev.end)){
        const d=new Date(ev.date);d.setDate(d.getDate()+1);d.setHours(0,0,0,0);
        const last=new Date(ev.end);last.setHours(0,0,0,0);
        while(d<=last){ensure(dKey(d)).events.push(ev);d.setDate(d.getDate()+1);}
      }
    });
    asgn.filter(a=>a.st!=="completed").forEach(a=>{ensure(dKey(a.due)).asgns.push(a);});
    myExams.forEach(ex=>{const d=new Date(ex.date+"T00:00:00");ensure(dKey(d)).exams.push(ex);});
    return map;
  },[myEvents,asgn,myExams]);

  const getDayData=(date)=>{
    const base=byDay[dKey(date)]||{events:[],asgns:[],classes:[],exams:[]};
    const cls=getClasses(date);
    const acad=getAcademicInfo(date);
    return{events:filter.ev?base.events:[],asgns:filter.asgn?base.asgns:[],classes:filter.cls?cls:[],acad,exams:filter.exam?(base.exams||[]):[]};
  };

  // Overlap detection for a day
  const getOverlaps=(date)=>{
    const data=getDayData(date);
    const ranges=[];
    data.events.forEach(ev=>{
      const sh=ev.date.getHours(),sm=ev.date.getMinutes();
      const eh=ev.end?ev.end.getHours():sh+1,em=ev.end?ev.end.getMinutes():sm;
      ranges.push({sh,sm,eh,em,label:ev.title,color:ev.color});
    });
    data.classes.forEach(c=>{
      ranges.push({sh:c.pd.s[0],sm:c.pd.s[1],eh:c.pd.e[0],em:c.pd.e[1],label:c.course.name,color:c.course.col});
    });
    (data.exams||[]).forEach(ex=>{
      const pt=PERIOD_TIMES[ex.period];
      if(pt){const [sh,sm]=pt.start.split(":").map(Number);const [eh,em]=pt.end.split(":").map(Number);ranges.push({sh,sm,eh,em,label:ex.name,color:"#d97706"});}
    });
    const conflicts=[];
    for(let i=0;i<ranges.length;i++)for(let j=i+1;j<ranges.length;j++){
      if(rangesOverlap(ranges[i].sh,ranges[i].sm,ranges[i].eh,ranges[i].em,ranges[j].sh,ranges[j].sm,ranges[j].eh,ranges[j].em))
        conflicts.push([ranges[i],ranges[j]]);
    }
    return conflicts;
  };

  const selDayData=selDay?getDayData(selDay):{events:[],asgns:[],classes:[],exams:[]};
  const selOverlaps=selDay?getOverlaps(selDay):[];
  const maxShow=mob?1:2;
  const quickOptions=useMemo(()=>{
    const seen=new Set(PRESETS.map(p=>p.label));
    const favs=favPresets.filter(f=>!seen.has(f.label));
    return [...PRESETS.map(p=>({...p,src:"builtin"})),...favs.map(f=>({...f,src:"fav"}))];
  },[favPresets]);

  // ── FORM VIEW ──
  if(adding){
    const titleIsFav=isFav(form.title.trim()),titleIsBuiltin=builtinLabels.has(form.title.trim());
    const canSaveFav=form.title.trim()&&!titleIsFav&&!titleIsBuiltin;
    return(
      <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:mob?14:20}}>
        <button onClick={()=>{setAdding(false);resetForm();setEditing(null);}} style={{display:"flex",alignItems:"center",gap:4,background:"none",border:"none",color:T.txD,fontSize:13,cursor:"pointer",marginBottom:12,padding:0}}>{I.back} 戻る</button>
        <h2 style={{color:T.txH,margin:"0 0 14px",fontSize:mob?18:20,fontWeight:700}}>{editing?"予定を編集":"予定を追加"}</h2>
        {!editing&&<>
          <div style={{fontSize:12,color:T.txD,marginBottom:6}}>テンプレート</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:4}}>
            {PRESETS.map(p=>{const a=form.title===p.label;return <button key={p.label} onClick={()=>applyPreset(p)} style={{display:"flex",alignItems:"center",gap:4,padding:"6px 12px",borderRadius:8,border:a?`2px solid ${p.color}`:`1px solid ${T.bd}`,background:a?`${p.color}14`:T.bg3,color:a?T.txH:T.tx,fontSize:13,fontWeight:a?600:400,cursor:"pointer"}}><span style={{width:8,height:8,borderRadius:4,background:p.color,flexShrink:0}}/>{p.label}</button>;})}
          </div>
          {favPresets.length>0&&<>
            <div style={{fontSize:11,color:T.txD,marginTop:6,marginBottom:4,display:"flex",alignItems:"center",gap:4}}><span style={{color:T.accent,display:"flex"}}>{I.star}</span>よく使うセット</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:4}}>
              {favPresets.map(p=>{const a=form.title===p.label;return <div key={p.label} style={{display:"flex",gap:0}}>
                <button onClick={()=>applyPreset(p)} style={{display:"flex",alignItems:"center",gap:4,padding:"6px 12px",borderRadius:"8px 0 0 8px",border:a?`2px solid ${p.color}`:`1px solid ${T.bd}`,borderRight:a?`2px solid ${p.color}`:"none",background:a?`${p.color}14`:T.bg3,color:a?T.txH:T.tx,fontSize:13,fontWeight:a?600:400,cursor:"pointer"}}><span style={{width:8,height:8,borderRadius:4,background:p.color,flexShrink:0}}/>{p.label}</button>
                <button onClick={()=>removeFav(p.label)} style={{padding:"6px 6px",borderRadius:"0 8px 8px 0",border:a?`2px solid ${p.color}`:`1px solid ${T.bd}`,borderLeft:"none",background:a?`${p.color}14`:T.bg3,color:T.txD,cursor:"pointer",display:"flex",alignItems:"center",fontSize:10}}>{I.x}</button>
              </div>;})}
            </div>
          </>}
          <div style={{height:10}}/>
        </>}
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div>
            <label style={{fontSize:12,color:T.txD,marginBottom:4,display:"block"}}>タイトル</label>
            <input value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} placeholder="予定のタイトル" style={{width:"100%",padding:"10px 12px",borderRadius:8,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr 1fr",gap:8}}>
            <div><label style={{fontSize:12,color:T.txD,marginBottom:4,display:"block"}}>日付</label><input type="date" value={form.date} onChange={e=>setForm(p=>({...p,date:e.target.value}))} style={{width:"100%",padding:"10px 12px",borderRadius:8,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/></div>
            <div><label style={{fontSize:12,color:T.txD,marginBottom:4,display:"block"}}>開始時刻</label><input type="time" value={form.time} onChange={e=>setForm(p=>({...p,time:e.target.value}))} style={{width:"100%",padding:"10px 12px",borderRadius:8,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/></div>
            <div><label style={{fontSize:12,color:T.txD,marginBottom:4,display:"block"}}>終了時刻（任意）</label><input type="time" value={form.endTime} onChange={e=>setForm(p=>({...p,endTime:e.target.value}))} style={{width:"100%",padding:"10px 12px",borderRadius:8,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/></div>
          </div>
          {/* Repeat */}
          {!editing&&<div>
            <label style={{fontSize:12,color:T.txD,marginBottom:4,display:"block"}}>繰り返し</label>
            <div style={{display:"flex",gap:6}}>
              {[{id:"none",l:"なし"},{id:"weekly",l:"毎週"},{id:"biweekly",l:"隔週"}].map(r=><button key={r.id} onClick={()=>setForm(p=>({...p,repeat:r.id}))} style={{padding:"7px 14px",borderRadius:8,border:form.repeat===r.id?`2px solid ${T.accent}`:`1px solid ${T.bd}`,background:form.repeat===r.id?`${T.accent}14`:T.bg3,color:form.repeat===r.id?T.accent:T.txD,fontSize:13,fontWeight:form.repeat===r.id?600:400,cursor:"pointer"}}>{r.l}</button>)}
            </div>
            {form.repeat!=="none"&&<div style={{fontSize:11,color:T.txD,marginTop:4}}>{form.repeat==="weekly"?"12週間分（約3ヶ月）の予定を一括作成します":"6回分（約3ヶ月）の予定を隔週で作成します"}</div>}
          </div>}
          <div><label style={{fontSize:12,color:T.txD,marginBottom:4,display:"block"}}>色</label><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{COLORS.map(c=><button key={c} onClick={()=>setForm(p=>({...p,color:c}))} style={{width:28,height:28,borderRadius:8,background:c,border:form.color===c?`2px solid ${T.txH}`:`2px solid transparent`,cursor:"pointer"}}/>)}</div></div>
          <div><label style={{fontSize:12,color:T.txD,marginBottom:4,display:"block"}}>メモ（任意）</label><textarea value={form.memo} onChange={e=>setForm(p=>({...p,memo:e.target.value}))} placeholder="メモを入力..." rows={3} style={{width:"100%",padding:"10px 12px",borderRadius:8,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:14,outline:"none",fontFamily:"inherit",resize:"vertical",boxSizing:"border-box"}}/></div>
          {!editing&&<button onClick={()=>{if(canSaveFav)setSavAsFav(p=>!p);}} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",borderRadius:8,border:`1px solid ${savAsFav?T.accent:T.bd}`,background:savAsFav?`${T.accent}10`:T.bg3,cursor:canSaveFav?"pointer":"default",opacity:canSaveFav?1:.4}}>
            <div style={{width:20,height:20,borderRadius:5,display:"flex",alignItems:"center",justifyContent:"center",background:savAsFav?T.accent:"transparent",border:savAsFav?"none":`2px solid ${T.bdL}`,color:"#fff",flexShrink:0}}>{savAsFav&&I.chk}</div>
            <div style={{flex:1,textAlign:"left"}}><div style={{fontSize:13,color:T.txH,fontWeight:500}}>よく使うセットに保存</div><div style={{fontSize:11,color:T.txD}}>{titleIsBuiltin?"デフォルトテンプレートです":titleIsFav?"すでに保存済みです":"次回からワンタップで追加できます"}</div></div>
            <span style={{color:savAsFav?T.accent:T.txD,display:"flex"}}>{I.star}</span>
          </button>}
          <div style={{display:"flex",gap:8,marginTop:4}}>
            <button onClick={saveEvent} disabled={!form.title.trim()||!form.date} style={{flex:1,padding:"10px 0",borderRadius:8,border:"none",background:form.title.trim()&&form.date?T.accent:T.bg3,color:form.title.trim()&&form.date?"#fff":T.txD,fontSize:14,fontWeight:600,cursor:form.title.trim()&&form.date?"pointer":"default"}}>{editing?"保存":"追加"}{form.repeat!=="none"&&!editing?` (${form.repeat==="weekly"?"12":"6"}件)`:""}</button>
            {editing&&<button onClick={()=>deleteEvent(editing)} style={{padding:"10px 16px",borderRadius:8,border:`1px solid ${T.red}33`,background:`${T.red}10`,color:T.red,fontSize:14,fontWeight:600,cursor:"pointer"}}>削除</button>}
          </div>
        </div>
      </div>
    );
  }

  // ── HEADER (shared) ──
  const Header=()=>(
    <div style={{display:"flex",flexDirection:"column",borderBottom:`1px solid ${T.bd}`,background:T.bg2,flexShrink:0}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px"}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          {viewMode==="month"?<>
            <button onClick={prevM} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",padding:4}}>{I.back}</button>
            <span style={{fontSize:15,fontWeight:700,color:T.txH,minWidth:100,textAlign:"center"}}>{calMonth.y}年{calMonth.m+1}月</span>
            <button onClick={nextM} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",padding:4}}>{I.arr}</button>
          </>:<>
            <button onClick={prevW} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",padding:4}}>{I.back}</button>
            <span style={{fontSize:14,fontWeight:700,color:T.txH,minWidth:120,textAlign:"center"}}>{weekStart.getMonth()+1}/{weekStart.getDate()}〜{(()=>{const e=new Date(weekStart);e.setDate(e.getDate()+6);return `${e.getMonth()+1}/${e.getDate()}`;})()}{viewMode==="timeline"?" TL":""}</span>
            <button onClick={nextW} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",padding:4}}>{I.arr}</button>
          </>}
          <button onClick={goToday} style={{padding:"3px 8px",borderRadius:6,border:`1px solid ${T.bd}`,background:"transparent",color:T.txD,fontSize:11,cursor:"pointer",marginLeft:2}}>今日</button>
        </div>
        <div style={{display:"flex",gap:4,alignItems:"center"}}>
          {[{id:"month",l:"月"},{id:"week",l:"週"},{id:"timeline",l:"TL"}].map(v=><button key={v.id} onClick={()=>setViewMode(v.id)} style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${viewMode===v.id?T.accent:T.bd}`,background:viewMode===v.id?`${T.accent}16`:"transparent",color:viewMode===v.id?T.accent:T.txD,fontSize:11,fontWeight:viewMode===v.id?600:400,cursor:"pointer"}}>{v.l}</button>)}
          <div style={{width:1,height:16,background:T.bd,margin:"0 2px"}}/>
          <button onClick={()=>openAdd(selDay)} style={{display:"flex",alignItems:"center",gap:3,padding:"4px 10px",borderRadius:6,border:"none",background:T.accent,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>{I.plus}</button>
        </div>
      </div>
      {/* Filter */}
      <div style={{display:"flex",gap:4,padding:"0 12px 8px"}}>
        {[{k:"ev",l:"予定",c:T.accent},{k:"asgn",l:"課題",c:T.orange},{k:"cls",l:"授業",c:T.green},{k:"exam",l:"試験",c:"#d97706"}].map(f=><button key={f.k} onClick={()=>togFilter(f.k)} style={{padding:"3px 10px",borderRadius:6,border:`1px solid ${filter[f.k]?f.c:T.bd}`,background:filter[f.k]?`${f.c}14`:"transparent",color:filter[f.k]?f.c:T.txD,fontSize:11,fontWeight:filter[f.k]?600:400,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
          <span style={{width:6,height:6,borderRadius:3,background:filter[f.k]?f.c:T.txD}}/>{f.l}
        </button>)}
      </div>
    </div>
  );

  // ── DAY DETAIL (simple list) ──
  const DayDetail=()=>{
    if(!selDay)return null;
    const cls=selDayData.classes, evs=selDayData.events, asgns=selDayData.asgns, acad=selDayData.acad, exs=selDayData.exams||[];
    const acadNonClass=(acad?.items||[]).filter(it=>it.type!=="class");
    const empty=cls.length===0&&evs.length===0&&asgns.length===0&&exs.length===0&&acadNonClass.length===0&&!acad?.period;
    return <div style={{marginTop:mob?12:0,borderRadius:10,background:T.bg2,border:`1px solid ${T.bd}`,overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 12px",borderBottom:`1px solid ${T.bd}`}}>
        <span style={{fontSize:14,fontWeight:700,color:T.txH}}>{selDay.getMonth()+1}/{selDay.getDate()} ({DAYS[(selDay.getDay()+6)%7]})</span>
        <div style={{display:"flex",gap:6}}>
          <button onClick={()=>openAdd(selDay)} style={{padding:"4px 8px",borderRadius:6,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txD,fontSize:11,cursor:"pointer"}}>追加</button>
          <button onClick={()=>setSelDay(null)} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",padding:2}}>{I.x}</button>
        </div>
      </div>
      {selOverlaps.length>0&&<div style={{padding:"6px 12px",background:`${T.red}08`,borderBottom:`1px solid ${T.red}20`,display:"flex",alignItems:"center",gap:6}}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill={T.red} style={{flexShrink:0}}><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>
        <div style={{fontSize:11,color:T.red}}>{selOverlaps.map(([a,b],i)=><span key={i}>{i>0?" / ":""}「{a.label}」×「{b.label}」</span>)}</div>
      </div>}
      <div style={{padding:"8px 12px",borderBottom:`1px solid ${T.bd}`,display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
        {PRESETS.map(p=><button key={p.label} onClick={()=>quickAdd(selDay,p)} style={{display:"flex",alignItems:"center",gap:3,padding:"4px 8px",borderRadius:6,border:`1px solid ${p.color}25`,background:`${p.color}08`,color:T.txH,fontSize:11,cursor:"pointer"}}><span style={{width:6,height:6,borderRadius:3,background:p.color,flexShrink:0}}/>{p.label}</button>)}
        {favPresets.length>0&&<>
          <span style={{width:1,height:14,background:T.bd}}/>
          {favPresets.map(p=><button key={p.label} onClick={()=>quickAdd(selDay,p)} style={{display:"flex",alignItems:"center",gap:3,padding:"4px 8px",borderRadius:6,border:`1px solid ${p.color}25`,background:`${p.color}08`,color:T.txH,fontSize:11,cursor:"pointer"}}><span style={{color:T.accent,display:"flex",fontSize:8}}>{I.star}</span>{p.label}</button>)}
        </>}
      </div>
      <div style={{padding:"8px 12px",display:"flex",flexDirection:"column",gap:6}}>
        {acadNonClass.length>0&&acadNonClass.map((it,i)=>{
          const cfg={holiday:{col:"#ef4444",tag:"祝日"},event:{col:"#0ea5e9",tag:"行事"},cancel:{col:"#6b7280",tag:"休講"},exam:{col:"#d97706",tag:"試験"}}[it.type];
          if(!cfg)return null;
          const lbl=it.type==="cancel"?`${it.q}Q ${it.label}`:it.type==="exam"?`${it.q}Q ${it.label}`:it.label;
          return <div key={`ac${i}`} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",borderRadius:8,background:`${cfg.col}10`,borderLeft:`3px solid ${cfg.col}`}}>
            <span style={{fontSize:10,fontWeight:700,color:cfg.col,background:`${cfg.col}18`,padding:"1px 5px",borderRadius:4}}>{cfg.tag}</span>
            <span style={{fontSize:12,fontWeight:500,color:T.txH}}>{lbl}</span>
          </div>;
        })}
        {acad?.period&&!acadNonClass.some(it=>it.type==="exam")&&<div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",borderRadius:8,background:`${{exam:"#d97706",break:"#10b981",prep:"#6366f1"}[acad.period.t]||T.accent}10`,borderLeft:`3px solid ${{exam:"#d97706",break:"#10b981",prep:"#6366f1"}[acad.period.t]||T.accent}`}}>
          <span style={{fontSize:11,fontWeight:600,color:{exam:"#d97706",break:"#10b981",prep:"#6366f1"}[acad.period.t]||T.accent}}>{acad.period.l}</span>
        </div>}
        {cls.length>0&&<>
          <div style={{fontSize:10,fontWeight:700,color:T.txD,letterSpacing:.4}}>授業</div>
          {cls.map((c,i)=><div key={`c${i}`} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:8,background:`${c.course.col}10`,borderLeft:`3px solid ${c.course.col}`}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:4}}>
                <span style={{fontSize:13,fontWeight:600,color:T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.course.name}</span>
                {c.n!=null&&<span style={{fontSize:9,fontWeight:700,color:c.course.col,background:`${c.course.col}18`,padding:"1px 5px",borderRadius:4,flexShrink:0}}>第{c.n}回</span>}
                {c.sub&&<span style={{fontSize:9,fontWeight:700,color:"#d97706",background:"#d9770618",padding:"1px 5px",borderRadius:4,flexShrink:0}}>振替</span>}
              </div>
              <div style={{fontSize:11,color:T.txD}}>{c.pd.l} · {c.course.room}{c.sub?` (${c.dow}曜授業)`:""}</div>
            </div>
            <div style={{fontSize:11,color:T.txD,flexShrink:0}}>{c.pd.s[0]}:{String(c.pd.s[1]).padStart(2,"0")}–{c.pd.e[0]}:{String(c.pd.e[1]).padStart(2,"0")}</div>
          </div>)}
        </>}
        {exs.length>0&&<>
          <div style={{fontSize:10,fontWeight:700,color:T.txD,letterSpacing:.4,marginTop:cls.length?4:0}}>期末試験</div>
          {exs.map((ex,i)=>{const pt=PERIOD_TIMES[ex.period];const co=courses.find(c=>c.code===ex.code);const col=co?.col||"#d97706";return(
            <div key={`ex${i}`} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:8,background:`${col}10`,borderLeft:`3px solid ${col}`}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:4}}>
                  <span style={{fontSize:10,fontWeight:700,color:"#d97706",background:"#d9770618",padding:"1px 5px",borderRadius:4,flexShrink:0}}>試験</span>
                  <span style={{fontSize:11,fontWeight:700,color:col}}>{ex.code}</span>
                </div>
                <div style={{fontSize:13,fontWeight:600,color:T.txH,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ex.name}</div>
                <div style={{fontSize:11,color:T.txD}}>{ex.period}限 · {ex.room}</div>
              </div>
              <div style={{fontSize:11,color:T.txD,flexShrink:0}}>{pt?`${pt.start}–${pt.end}`:""}</div>
            </div>);})}
        </>}
        {evs.length>0&&<>
          <div style={{fontSize:10,fontWeight:700,color:T.txD,letterSpacing:.4,marginTop:(cls.length||exs.length)?4:0}}>予定</div>
          {evs.map(ev=>{const h=ev.date.getHours(),m=ev.date.getMinutes();const end=ev.end?`–${ev.end.getHours()}:${String(ev.end.getMinutes()).padStart(2,"0")}`:"";return(
            <div key={ev.id} onClick={()=>openEdit(ev)} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:8,background:`${ev.color}10`,borderLeft:`3px solid ${ev.color}`,cursor:"pointer"}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:ev.color,flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,color:T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ev.title}</div>
                {ev.memo&&<div style={{fontSize:11,color:T.txD,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ev.memo}</div>}
              </div>
              <div style={{fontSize:11,color:T.txD,flexShrink:0}}>{h}:{String(m).padStart(2,"0")}{end}</div>
            </div>);
          })}
        </>}
        {asgns.length>0&&<>
          <div style={{fontSize:10,fontWeight:700,color:T.txD,letterSpacing:.4,marginTop:(cls.length||evs.length)?4:0}}>課題締切</div>
          {asgns.map(a=>{const co=courses.find(x=>x.id===a.cid);const dl=uDue(a.due);return(
            <div key={a.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:8,background:dl.u?`${T.red}08`:`${co?.col||T.accent}10`,borderLeft:`3px solid ${dl.u?T.red:co?.col||T.accent}`}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:4}}><Tag color={co?.col}>{co?.code}</Tag></div>
                <div style={{fontSize:13,fontWeight:600,color:T.txH,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.title}</div>
              </div>
              <div style={{fontSize:12,fontWeight:700,color:dl.c,flexShrink:0}}>{dl.t}</div>
            </div>);
          })}
        </>}
        {empty&&<div style={{padding:"8px 0",textAlign:"center",fontSize:12,color:T.txD}}>この日に予定はありません</div>}
      </div>
    </div>;
  };

  // ── TIMELINE VIEW (compact list × 7 days) ──
  if(viewMode==="timeline"){
    const wDays=Array.from({length:7},(_,i)=>{const d=new Date(weekStart);d.setDate(d.getDate()+i);return d;});
    return(
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <Header/>
        <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:mob?"0 6px 8px":"0 12px 12px"}}>
          {wDays.map((d,di)=>{
            const data=getDayData(d);
            const isT=isSameDay(d,NOW);
            const items=[];
            data.classes.forEach((c,ci)=>{items.push({type:"cls",sh:c.pd.s[0],sm:c.pd.s[1],eh:c.pd.e[0],em:c.pd.e[1],label:c.course.name,sub:`${c.pd.l} · ${c.course.room}${c.n!=null?` · 第${c.n}回`:""}${c.sub?" (振替)":""}`,col:c.course.col,id:`cls${di}_${ci}`});});
            data.events.forEach(ev=>{const sh=ev.date.getHours(),sm=ev.date.getMinutes();const eh=ev.end?ev.end.getHours():sh+1,em=ev.end?ev.end.getMinutes():sm;items.push({type:"ev",sh,sm,eh,em,label:ev.title,sub:ev.memo||"",col:ev.color,id:ev.id,ev});});
            data.asgns.forEach(a=>{const h=a.due.getHours(),m=a.due.getMinutes();const co=courses.find(x=>x.id===a.cid);items.push({type:"asgn",sh:h,sm:m,eh:h,em:m+30,label:a.title,sub:co?.code||"",col:co?.col||T.orange,id:`a${a.id}`});});
            (data.exams||[]).forEach((ex,ei)=>{const pt=PERIOD_TIMES[ex.period];if(pt){const [sh,sm]=pt.start.split(":").map(Number);const [eh,em]=pt.end.split(":").map(Number);items.push({type:"exam",sh,sm,eh,em,label:ex.name,sub:`${ex.period}限 · ${ex.room}`,col:"#d97706",id:`ex${di}_${ei}`});}});
            items.sort((a,b)=>a.sh*60+a.sm-b.sh*60-b.sm);
            const dayAcadNonCls=(data.acad?.items||[]).filter(it=>it.type!=="class");
            if(items.length===0&&!isT&&dayAcadNonCls.length===0)return null;
            return(
              <div key={di} style={{marginTop:di?2:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8,padding:mob?"5px 4px":"4px 6px",position:"sticky",top:0,zIndex:3,background:T.bg,flexWrap:"wrap"}}>
                  <span style={{fontSize:mob?13:14,fontWeight:700,color:isT?T.accent:T.txH}}>{d.getMonth()+1}/{d.getDate()}</span>
                  <span style={{fontSize:mob?11:12,fontWeight:600,color:isT?T.accent:di>=5?T.orange:T.txD}}>{DAYS[di]}</span>
                  {isT&&<span style={{fontSize:9,padding:"1px 6px",borderRadius:4,background:`${T.accent}18`,color:T.accent,fontWeight:600}}>TODAY</span>}
                  {dayAcadNonCls.map((it,ai)=>{const cfg={holiday:{col:"#ef4444",l:it.label},event:{col:"#0ea5e9",l:it.label},cancel:{col:"#6b7280",l:"休講"},exam:{col:"#d97706",l:it.label}}[it.type];return cfg?<span key={`ac${ai}`} style={{fontSize:9,padding:"1px 6px",borderRadius:4,background:`${cfg.col}18`,color:cfg.col,fontWeight:600}}>{cfg.l}</span>:null;})}
                </div>
                {items.length===0&&<div style={{padding:"4px 8px",fontSize:11,color:T.txD}}>予定なし</div>}
                <div style={{display:"flex",flexDirection:"column",gap:2}}>
                  {items.map(it=>{
                    const isEv=it.type==="ev";const isAsgn=it.type==="asgn";const isCls=it.type==="cls";
                    const timeStr=`${it.sh}:${String(it.sm).padStart(2,"0")}`;
                    const endStr=`${it.eh}:${String(it.em).padStart(2,"0")}`;
                    const dur=((it.eh*60+it.em)-(it.sh*60+it.sm));
                    const durStr=dur>=60?`${Math.floor(dur/60)}h${dur%60?String(dur%60).padStart(2,"0")+"m":""}`:`${dur}m`;
                    return <div key={it.id} onClick={isEv?()=>openEdit(it.ev):undefined} style={{display:"flex",alignItems:"center",gap:mob?8:12,padding:mob?"6px 8px":"5px 10px",borderRadius:6,background:`${it.col}08`,borderLeft:`3px solid ${it.col}`,cursor:isEv?"pointer":"default"}}>
                      <div style={{width:mob?52:60,flexShrink:0,textAlign:"right"}}>
                        <div style={{fontSize:mob?11:13,fontWeight:600,color:T.txH,fontVariantNumeric:"tabular-nums",lineHeight:"16px"}}>{timeStr}</div>
                        <div style={{fontSize:mob?9:10,color:T.txD,lineHeight:"14px"}}>{endStr}</div>
                      </div>
                      <div style={{width:1,height:mob?24:28,background:`${it.col}40`,flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0,display:"flex",alignItems:"center",gap:mob?6:10}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:mob?12:14,fontWeight:600,color:T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",lineHeight:"18px"}}>{it.label}</div>
                          {it.sub&&<div style={{fontSize:mob?10:11,color:T.txD,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",lineHeight:"14px"}}>{it.sub}</div>}
                        </div>
                        {!mob&&<>
                          <span style={{fontSize:10,color:T.txD,flexShrink:0,padding:"2px 6px",borderRadius:4,background:T.bg3}}>{durStr}</span>
                          <span style={{fontSize:10,color:T.txD,flexShrink:0,padding:"2px 6px",borderRadius:4,background:`${it.col}14`,color:it.col}}>{isCls?"授業":isAsgn?"課題":it.type==="exam"?"試験":"予定"}</span>
                        </>}
                      </div>
                    </div>;
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── WEEK VIEW ──
  if(viewMode==="week"){
    const HH=mob?36:48;
    const SH=8,EH=22;
    const wDays=Array.from({length:7},(_,i)=>{const d=new Date(weekStart);d.setDate(d.getDate()+i);return d;});
    const toY=(h,m)=>((h+m/60)-SH)*HH;
    const toH=(sh,sm,eh,em)=>Math.max(HH/2,((eh+em/60)-(sh+sm/60))*HH);
    return(
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <Header/>
        <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
          <div style={{display:"grid",gridTemplateColumns:`${mob?28:44}px repeat(7,1fr)`,position:"relative"}}>
            {/* Day headers */}
            <div style={{borderBottom:`1px solid ${T.bd}`,background:T.bg2,position:"sticky",top:0,zIndex:2}}/>
            {wDays.map((d,i)=>{const isT=isSameDay(d,NOW);return <div key={i} onClick={()=>setSelDay(d)} style={{textAlign:"center",padding:"6px 0",borderBottom:`1px solid ${T.bd}`,background:T.bg2,position:"sticky",top:0,zIndex:2,cursor:"pointer",borderLeft:`1px solid ${T.bd}`}}>
              <div style={{fontSize:mob?9:11,fontWeight:600,color:isT?T.accent:i>=5?T.orange:T.txD}}>{DAYS[i]}</div>
              <div style={{fontSize:mob?11:14,fontWeight:isT?700:500,color:isT?T.accent:T.txH}}>{d.getDate()}</div>
            </div>;})}
            {/* Time grid */}
            {Array.from({length:EH-SH},(_,hi)=><React.Fragment key={hi}>
              <div style={{height:HH,display:"flex",alignItems:"start",justifyContent:"center",paddingTop:2,fontSize:mob?8:10,color:T.txD,borderTop:`1px solid ${T.bd}`,background:T.bg}}>{SH+hi}:00</div>
              {wDays.map((d,di)=><div key={di} style={{height:HH,borderTop:`1px solid ${T.bd}`,borderLeft:`1px solid ${T.bd}`,background:isSameDay(d,NOW)?`${T.accent}04`:"transparent",position:"relative"}}/>)}
            </React.Fragment>)}
          </div>
          {/* Overlay: positioned events/classes */}
          <div style={{position:"relative",marginTop:-(EH-SH)*HH-((mob?26:34)),display:"grid",gridTemplateColumns:`${mob?28:44}px repeat(7,1fr)`}}>
            <div/>
            {wDays.map((d,di)=>{
              const data=getDayData(d);
              const items=[];
              data.classes.forEach(c=>{items.push({y:toY(c.pd.s[0],c.pd.s[1]),h:toH(c.pd.s[0],c.pd.s[1],c.pd.e[0],c.pd.e[1]),label:mob?c.course.code.split(".")[1]:c.course.name,sub:`${c.pd.l}${c.n!=null?` #${c.n}`:""}`,col:c.course.col,type:"cls"});});
              data.events.forEach(ev=>{const sh=ev.date.getHours(),sm=ev.date.getMinutes();const eh=ev.end?ev.end.getHours():sh+1,em=ev.end?ev.end.getMinutes():sm;items.push({y:toY(sh,sm),h:toH(sh,sm,eh,em),label:ev.title,sub:`${fTs(ev.date)}`,col:ev.color,type:"ev"});});
              data.asgns.forEach(a=>{const h=a.due.getHours(),m=a.due.getMinutes();items.push({y:toY(h,m),h:HH/2,label:mob?a.title.slice(0,4):a.title,sub:"締切",col:courses.find(x=>x.id===a.cid)?.col||T.orange,type:"asgn"});});
              (data.exams||[]).forEach(ex=>{const pt=PERIOD_TIMES[ex.period];if(pt){const [sh,sm]=pt.start.split(":").map(Number);const [eh,em]=pt.end.split(":").map(Number);items.push({y:toY(sh,sm),h:toH(sh,sm,eh,em),label:mob?ex.code.split(".")[1]:ex.name,sub:`${ex.period}限`,col:"#d97706",type:"exam"});}});
              return <div key={di} style={{position:"relative",height:(EH-SH)*HH,borderLeft:`1px solid transparent`}}>
                {items.map((it,ii)=><div key={ii} style={{position:"absolute",top:it.y,left:1,right:1,height:it.h,borderRadius:4,background:`${it.col}20`,borderLeft:`2px solid ${it.col}`,padding:"2px 3px",overflow:"hidden",cursor:"pointer",zIndex:1}} onClick={()=>setSelDay(d)}>
                  <div style={{fontSize:mob?7:9,fontWeight:600,color:it.col,lineHeight:"12px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.label}</div>
                  {it.h>HH/2&&<div style={{fontSize:mob?6:8,color:T.txD,lineHeight:"10px"}}>{it.sub}</div>}
                </div>)}
              </div>;
            })}
          </div>
        </div>
        {/* DayDetail is shown only in month view */}
      </div>
    );
  }

  // ── MONTH VIEW ──
  const calGrid=<div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:mob?1:2}}>
    {DAYS.map((d,i)=><div key={d} style={{textAlign:"center",fontSize:10,fontWeight:600,color:i>=5?T.orange:T.txD,padding:"4px 0"}}>{d}</div>)}
    {Array.from({length:weeks*7},(_,i)=>{
      const day=i-startOff+1;
      const valid=day>=1&&day<=daysInMonth;
      const date=valid?new Date(calMonth.y,calMonth.m,day):null;
      const isToday=date&&isSameDay(date,NOW);
      const isSel=date&&selDay&&isSameDay(date,selDay);
      const dayData=date?getDayData(date):{events:[],asgns:[],classes:[],exams:[]};
      const evItems=dayData.events.map(e=>{const h=e.date.getHours(),m=e.date.getMinutes();return{type:"ev",label:e.title,col:e.color,id:e.id,time:`${h}:${String(m).padStart(2,"0")}`,hasEnd:!!e.end};});
      const asgnItems=dayData.asgns.map(a=>{const co=courses.find(x=>x.id===a.cid);const h=a.due.getHours(),m=a.due.getMinutes();const dl=uDue(a.due);return{type:"asgn",label:a.title,col:co?.col||T.accent,id:a.id,time:`${h}:${String(m).padStart(2,"0")}`,urgent:dl.u};});
      const examItems=(dayData.exams||[]).map((ex,idx)=>{const pt=PERIOD_TIMES[ex.period];return{type:"exam",label:ex.name,col:"#d97706",id:`ex${idx}`,time:pt?.start||"00:00"};});
      const acadItems=(dayData.acad?.items||[]).filter(it=>it.type!=="class").map((it,idx)=>{
        const cfg={holiday:{col:"#ef4444",l:it.label},event:{col:"#0ea5e9",l:it.label},cancel:{col:"#6b7280",l:"休講"},exam:{col:"#d97706",l:it.label}}[it.type];
        return cfg?{type:"acad",label:cfg.l,col:cfg.col,id:`ac${idx}`,time:"00:00"}:null;
      }).filter(Boolean);
      const isHoliday=dayData.acad?.items.some(it=>it.type==="holiday");
      const allItems=[...acadItems,...examItems,...evItems,...asgnItems].sort((a,b)=>(a.time>b.time?1:-1));
      const hasOverlap=date&&getOverlaps(date).length>0;
      const isSun=date&&date.getDay()===0;
      const isSat=date&&date.getDay()===6;
      return <div key={i} onClick={()=>{if(date)setSelDay(isSel?null:date);}} style={{minHeight:mob?56:88,padding:mob?"2px 1px":"3px",borderRadius:6,background:isSel?`${T.accent}16`:isToday?`${T.accent}08`:valid?T.bg2:"transparent",border:isSel?`1px solid ${T.accent}40`:isToday?`1px solid ${T.accent}20`:`1px solid ${valid?T.bd:"transparent"}`,cursor:valid?"pointer":"default",display:"flex",flexDirection:"column",gap:mob?1:2,overflow:"hidden",position:"relative"}}>
        {valid&&<div style={{display:"flex",justifyContent:"space-between",padding:"0 2px"}}>
          <span style={{fontSize:mob?9:11,fontWeight:isToday?700:400,color:isToday?T.accent:(isSun||isHoliday)?T.red:isSat?T.orange:T.txH}}>{day}</span>
          {hasOverlap&&<span style={{width:mob?5:6,height:mob?5:6,borderRadius:3,background:T.red,flexShrink:0,marginTop:2}}/>}
        </div>}
        {valid&&allItems.slice(0,maxShow).map(it=>it.type==="acad"
          ?<div key={it.id} style={{display:"flex",alignItems:"center",gap:mob?2:3,padding:mob?"1px 2px":"2px 3px",borderRadius:3,background:`${it.col}14`,overflow:"hidden"}}>
            <span style={{fontSize:mob?7:8,fontWeight:700,color:it.col,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",lineHeight:"12px"}}>{it.label}</span>
          </div>
          :it.type==="exam"
          ?<div key={it.id} style={{display:"flex",alignItems:"center",gap:mob?2:3,padding:mob?"1px 2px":"2px 3px",borderRadius:3,background:`${it.col}14`,borderLeft:`2px solid ${it.col}`,overflow:"hidden"}}>
            {!mob&&<span style={{fontSize:7,fontWeight:700,color:it.col,flexShrink:0,lineHeight:"10px"}}>試験</span>}
            <span style={{fontSize:mob?7:8,fontWeight:600,color:it.col,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",lineHeight:"12px"}}>{it.label}</span>
          </div>
          :it.type==="ev"
          ?<div key={it.id} style={{display:"flex",alignItems:"center",gap:mob?2:3,padding:mob?"1px 2px":"2px 3px",borderRadius:3,background:`${it.col}14`,overflow:"hidden"}}>
            <span style={{width:mob?4:5,height:mob?4:5,borderRadius:"50%",background:it.col,flexShrink:0}}/>
            {!mob&&<span style={{fontSize:7,color:T.txD,flexShrink:0,lineHeight:"10px"}}>{it.time}</span>}
            <span style={{fontSize:mob?7:8,fontWeight:600,color:it.col,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",lineHeight:"12px"}}>{it.label}</span>
          </div>
          :<div key={it.id} style={{display:"flex",alignItems:"center",gap:mob?2:3,padding:mob?"1px 2px":"2px 3px",borderRadius:3,background:it.urgent?`${T.red}10`:`${it.col}10`,borderLeft:`2px solid ${it.urgent?T.red:it.col}`,overflow:"hidden"}}>
            <span style={{fontSize:mob?7:8,fontWeight:600,color:it.urgent?T.red:it.col,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",lineHeight:"12px"}}>{it.label}</span>
          </div>
        )}
        {valid&&allItems.length>maxShow&&<div style={{display:"flex",alignItems:"center",gap:3,padding:"0 2px"}}>
          {allItems.slice(maxShow).some(it=>it.type==="ev")&&<span style={{width:mob?4:5,height:mob?4:5,borderRadius:"50%",background:T.accent,flexShrink:0}}/>}
          <span style={{fontSize:mob?7:8,color:T.txD}}>+{allItems.length-maxShow}</span>
        </div>}
        {valid&&dayData.classes.length>0&&<div style={{display:"flex",gap:mob?1:2,flexWrap:"wrap",padding:"1px 2px",marginTop:"auto"}}>
          {dayData.classes.map((c,ci)=><span key={ci} style={{width:mob?5:6,height:mob?5:6,borderRadius:mob?1:2,background:c.course.col,flexShrink:0,opacity:.8}} title={`${c.pd.l} ${c.course.name}`}/>)}
        </div>}
      </div>;
    })}
  </div>;

  if(mob){
    return(
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <Header/>
        <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:12}}>
          {calGrid}
          {DayDetail()}
        </div>
      </div>
    );
  }
  // PC: side-by-side (calendar left, detail right)
  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <Header/>
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:16,minWidth:0}}>
          {calGrid}
        </div>
        <div style={{width:320,flexShrink:0,borderLeft:`1px solid ${T.bd}`,overflowY:"auto",padding:12,WebkitOverflowScrolling:"touch"}}>
          {selDay?<>{DayDetail()}</>:<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",color:T.txD,fontSize:13,gap:8}}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={T.txD} strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            <span>日付をクリック</span>
          </div>}
        </div>
      </div>
    </div>
  );
};
