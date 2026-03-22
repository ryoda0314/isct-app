import React, { useState, useMemo, useRef, useEffect } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { NOW, uDue, pDone, tMap, aMap, sMap, pCol, fT, fDS, fDF } from "../utils.jsx";
import { Av, Tag, Bar, Btn, Tx } from "../shared.jsx";
import { isNative } from "../capacitor.js";
import { openLmsPage } from "../plugins/portalWebView.js";

const DAYS=["月","火","水","木","金","土","日"];
const dKey=d=>`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const isSameDay=(a,b)=>a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();
const dayLabel=(d)=>{if(isSameDay(d,NOW))return"今日";const tm=new Date(NOW);tm.setDate(tm.getDate()+1);if(isSameDay(d,tm))return"明日";return DAYS[(d.getDay()+6)%7]+"曜日";};

function OverdueCollapse({open,items,renderItems,hasUpcoming}){
  const ref=useRef(null);
  const [h,setH]=useState(0);
  useEffect(()=>{if(ref.current)setH(ref.current.scrollHeight);},[open,items]);
  return <div style={{overflow:"hidden",height:open?h:0,opacity:open?1:0,transition:"height .25s ease,opacity .2s ease"}}>
    <div ref={ref}>
      {renderItems(items)}
      {hasUpcoming&&<div style={{display:"flex",alignItems:"center",gap:8,margin:"4px 0 8px"}}>
        <div style={{flex:1,height:1,background:T.bd}}/>
        <span style={{fontSize:10,fontWeight:600,color:T.txD,flexShrink:0}}>これより先は期限内</span>
        <div style={{flex:1,height:1,background:T.bd}}/>
      </div>}
    </div>
  </div>;
}

export const AsgnView=({asgn,setAsgn,course,mob,myTasks,setMyTasks,navCourse,courses=[],quarter,setQuarter,hiddenAsgn,saveHidden})=>{

  const [tab,setTab]=useState("active");
  const [sel,setSel]=useState(null);
  const [ntxt,setNtxt]=useState("");
  const [ndue,setNdue]=useState("");
  const [addExpand,setAddExpand]=useState(false);
  const [showDoneTk,setShowDoneTk]=useState(false);
  const [qOpen,setQOpen]=useState(false);
  const [showHidden,setShowHidden]=useState(false);
  const [showOverdue,setShowOverdue]=useState(false);
  const [calMode,setCalMode]=useState("timeline");
  const [calMonth,setCalMonth]=useState(()=>({y:NOW.getFullYear(),m:NOW.getMonth()}));
  const [selDay,setSelDay]=useState(null);
  const showTabs=!course;
  const qCids=showTabs&&quarter?new Set(courses.filter(c=>c.quarter===quarter).map(c=>c.id)):null;
  const items=course?asgn.filter(a=>a.cid===course.id):qCids?asgn.filter(a=>qCids.has(a.cid)):asgn;
  const allActive=items.filter(a=>a.st!=="completed").sort((a,b)=>a.due-b.due);
  const active=hiddenAsgn?allActive.filter(a=>!hiddenAsgn.has(a.id)):allActive;
  const hidden=hiddenAsgn?allActive.filter(a=>hiddenAsgn.has(a.id)):[];
  const done=items.filter(a=>a.st==="completed");
  const hideA=(e,id)=>{e.stopPropagation();if(!saveHidden)return;saveHidden([...(hiddenAsgn?[...hiddenAsgn]:[]),id]);};
  const unhideA=(e,id)=>{e.stopPropagation();if(!saveHidden||!hiddenAsgn)return;saveHidden([...hiddenAsgn].filter(x=>x!==id));};
  const togSub=(aid,sid)=>setAsgn(p=>p.map(a=>{if(a.id!==aid)return a;const ns=a.subs.map(s=>s.id===sid?{...s,d:!s.d}:s);return{...a,subs:ns,st:ns.every(s=>s.d)&&ns.length?"completed":a.st==="not_started"?"in_progress":a.st};}));
  const chSt=(aid,st)=>setAsgn(p=>p.map(a=>a.id===aid?{...a,st,sub:st==="completed"?new Date():null}:a));
  const togTk=id=>setMyTasks?.(p=>p?.map(t=>t.id===id?{...t,d:!t.d}:t));
  const delTk=id=>setMyTasks?.(p=>p?.filter(t=>t.id!==id));
  const addTk=()=>{if(!ntxt.trim()||!setMyTasks)return;const due=ndue?new Date(ndue+"T23:59:00"):null;setMyTasks(p=>[...p,{id:`mt_${Date.now()}`,t:ntxt.trim(),d:false,due}]);setNtxt("");setNdue("");setAddExpand(false);};
  const [lmsLoading,setLmsLoading]=useState(false);
  const goLms=async(url)=>{
    if(!url)return;
    setLmsLoading(true);
    try{
      if(isNative()){
        const r=await fetch("/api/auth/credentials?type=isct");
        if(!r.ok)throw new Error("認証情報の取得に失敗");
        const{userId,password,totpCode}=await r.json();
        await openLmsPage(url,{userId,password,totpCode});
      }else{
        window.open(url,'_blank');
      }
    }catch(e){console.error('[LMS]',e);}
    setLmsLoading(false);
  };

  // Detail (mobile: full page)
  if(sel&&mob){
    const a=sel,co=courses.find(x=>x.id===a.cid),at=aMap()[a.type],dl=uDue(a.due),si=sMap()[a.st],p=pDone(a.subs);
    return(
      <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:mob?14:20}}>
        <button onClick={()=>setSel(null)} style={{display:"flex",alignItems:"center",gap:4,background:"none",border:"none",color:T.txD,fontSize:13,cursor:"pointer",marginBottom:12,padding:0}}>{I.back} 戻る</button>
        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:6}}><Tag color={co?.col}>{co?.code}</Tag><Tag color={at?.c}>{at?.l}</Tag><Tag color={si.c}>{si.l}</Tag><span style={{width:7,height:7,borderRadius:4,background:pCol()[a.pri],alignSelf:"center"}}/></div>
        <h2 style={{color:T.txH,margin:"0 0 4px",fontSize:mob?18:20,fontWeight:700}}>{a.title}</h2>
        <div style={{color:T.tx,fontSize:13,lineHeight:1.6,margin:"0 0 14px"}}><Tx>{a.desc}</Tx></div>
        <div style={{display:"grid",gridTemplateColumns:mob?"1fr 1fr":"repeat(3,1fr)",gap:8,marginBottom:14}}>
          <div style={{padding:10,borderRadius:8,background:T.bg2,border:`1px solid ${T.bd}`}}><div style={{fontSize:10,color:T.txD}}>締切</div><div style={{fontSize:15,fontWeight:700,color:dl.c}}>{fDF(a.due)}</div><div style={{fontSize:11,color:dl.c}}>{dl.t}</div></div>
          <div style={{padding:10,borderRadius:8,background:T.bg2,border:`1px solid ${T.bd}`}}><div style={{fontSize:10,color:T.txD}}>配点 / 進捗</div><div style={{fontSize:15,fontWeight:700,color:T.accent}}>{a.pts}点 · {p}%</div></div>
        </div>
        <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
          {[{s:"not_started",l:"未着手"},{s:"in_progress",l:"着手"},{s:"completed",l:"提出済"}].map(x=><button key={x.s} onClick={()=>chSt(a.id,x.s)} style={{padding:"8px 14px",borderRadius:8,border:"none",fontSize:13,fontWeight:600,cursor:"pointer",background:a.st===x.s?`${sMap()[x.s].c}22`:T.bg3,color:a.st===x.s?sMap()[x.s].c:T.txD}}>{x.s==="completed"&&<span style={{display:"inline-flex",marginRight:3,verticalAlign:"middle"}}>{I.chk}</span>}{x.l}</button>)}
        </div>
        {a.subs.length>0&&<div style={{marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}><Bar p={p} h={6}/><span style={{fontSize:12,fontWeight:600,color:p>=100?T.green:T.accent}}>{p}%</span></div>
          {a.subs.map(s=><div key={s.id} onClick={()=>togSub(a.id,s.id)} style={{display:"flex",alignItems:"center",gap:10,padding:mob?"10px":"8px 10px",borderRadius:8,marginBottom:3,background:s.d?`${T.green}06`:T.bg2,border:`1px solid ${s.d?`${T.green}16`:T.bd}33`,cursor:"pointer"}}><div style={{width:20,height:20,borderRadius:5,display:"flex",alignItems:"center",justifyContent:"center",background:s.d?T.green:"transparent",border:s.d?"none":`2px solid ${T.bdL}`,color:"#fff",flexShrink:0}}>{s.d&&I.chk}</div><span style={{fontSize:14,color:s.d?T.txD:T.txH,textDecoration:s.d?"line-through":"none"}}>{s.t}</span></div>)}
        </div>}
        {a.url&&<button onClick={()=>goLms(a.url)} disabled={lmsLoading} style={{display:"flex",alignItems:"center",gap:6,padding:"10px 14px",borderRadius:8,border:`1px solid ${T.accent}33`,background:`${T.accent}08`,color:T.accent,fontSize:13,fontWeight:500,cursor:lmsLoading?"wait":"pointer",width:"100%",justifyContent:"center",marginBottom:6,opacity:lmsLoading?.6:1}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          {lmsLoading?"ログイン中...":"LMSで課題を開く"}
        </button>}
        {navCourse&&<button onClick={()=>navCourse(a.cid)} style={{display:"flex",alignItems:"center",gap:6,padding:"10px 14px",borderRadius:8,border:`1px solid ${co?.col}33`,background:`${co?.col}08`,color:co?.col,fontSize:13,fontWeight:500,cursor:"pointer",width:"100%",justifyContent:"center"}}>{co?.code} のチャンネルへ {I.arr}</button>}
      </div>
    );
  }

  // List
  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {showTabs&&<div style={{display:"flex",flexDirection:"column",borderBottom:`1px solid ${T.bd}`,background:T.bg2,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px 0"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {quarter&&setQuarter&&<div style={{position:"relative",display:"inline-block"}}>
              <button onClick={()=>setQOpen(p=>!p)} style={{background:T.bg3,border:`1px solid ${T.bd}`,borderRadius:6,padding:"4px 10px",cursor:"pointer",display:"flex",alignItems:"center",gap:4,fontSize:mob?12:13,fontWeight:700,color:T.accent}}>
                {quarter}Q
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
              </button>
              {qOpen&&<><div onClick={()=>setQOpen(false)} style={{position:"fixed",inset:0,zIndex:49}}/>
                <div style={{position:"absolute",top:"100%",left:0,marginTop:4,background:T.bg2,border:`1px solid ${T.bd}`,borderRadius:8,boxShadow:"0 4px 16px rgba(0,0,0,.4)",overflow:"hidden",zIndex:50,minWidth:80}}>
                  {[1,2,3,4].map(q=><div key={q} onClick={()=>{setQuarter(q);setQOpen(false);}} style={{padding:"8px 14px",cursor:"pointer",fontSize:13,fontWeight:q===quarter?700:400,color:q===quarter?T.accent:T.txH,background:q===quarter?`${T.accent}10`:"transparent"}}>{q}Q</div>)}
                </div></>}
            </div>}
            <span style={{fontSize:12,color:T.txD}}>{items.length}件</span>
          </div>
          <div style={{display:"flex",gap:2}}>
            {[{id:"month",l:"月表示"},{id:"timeline",l:"タイムライン"}].map(v=><button key={v.id} onClick={()=>setCalMode(v.id)} style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${calMode===v.id?T.accent:T.bd}`,background:calMode===v.id?`${T.accent}16`:"transparent",color:calMode===v.id?T.accent:T.txD,fontSize:11,fontWeight:calMode===v.id?600:400,cursor:"pointer"}}>{v.l}</button>)}
          </div>
        </div>
        <div style={{padding:"10px 14px 10px",display:"flex",alignItems:"center",gap:6}}>
          <div style={{display:"flex",gap:2,background:T.bg3,borderRadius:8,padding:2,flex:1}}>
            {[{id:"active",l:"未完了",ct:active.length},{id:"mytasks",l:"マイタスク",ct:null}].map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"8px 0",borderRadius:6,border:"none",fontSize:12,fontWeight:tab===t.id?600:500,cursor:"pointer",background:tab===t.id?T.bg2:"transparent",color:tab===t.id?T.txH:T.txD,boxShadow:tab===t.id?"0 1px 3px rgba(0,0,0,.2)":"none",transition:"all .15s ease",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>{t.l}{t.ct!=null&&<span style={{fontSize:10,fontWeight:600,padding:"1px 6px",borderRadius:10,background:tab===t.id?`${T.accent}18`:T.bg4||T.bg3,color:tab===t.id?T.accent:T.txD}}>{t.ct}</span>}</button>)}
          </div>
          <button onClick={()=>setTab("done")} style={{display:"flex",alignItems:"center",gap:4,padding:"7px 10px",borderRadius:6,border:tab==="done"?`1px solid ${T.green}40`:`1px solid ${T.bd}`,background:tab==="done"?`${T.green}10`:"transparent",fontSize:11,fontWeight:tab==="done"?600:400,cursor:"pointer",color:tab==="done"?T.green:T.txD,transition:"all .15s ease",flexShrink:0}}>
            <span style={{display:"flex"}}>{I.chk}</span>提出済{done.length>0&&<span style={{fontSize:10,fontWeight:600,padding:"1px 6px",borderRadius:10,background:tab==="done"?`${T.green}18`:T.bg3,color:tab==="done"?T.green:T.txD}}>{done.length}</span>}
          </button>
        </div>
      </div>}
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:12,minWidth:0}}>
        {!showTabs&&<>{active.map(a=>{const at=aMap()[a.type],dl=uDue(a.due),si=sMap()[a.st],p=pDone(a.subs);return(
          <div key={a.id} onClick={()=>setSel(a)} style={{padding:12,borderRadius:10,background:T.bg2,border:`1px solid ${T.bd}`,marginBottom:8,borderLeft:`3px solid ${dl.u?dl.c:T.accent}`,cursor:"pointer"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"start",marginBottom:4}}>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}><Tag color={at?.c}>{at?.l}</Tag><Tag color={si.c}>{si.l}</Tag></div>
              <span style={{fontSize:13,fontWeight:700,color:dl.c,flexShrink:0}}>{dl.t}</span>
            </div>
            <div style={{fontSize:14,fontWeight:600,color:T.txH,marginBottom:4}}>{a.title}</div>
            {a.subs.length>0&&<div style={{display:"flex",alignItems:"center",gap:6}}><Bar p={p} h={4}/><span style={{fontSize:11,color:T.txD}}>{a.subs.filter(s=>s.d).length}/{a.subs.length}</span></div>}
            <div style={{display:"flex",gap:8,marginTop:4,fontSize:11,color:T.txD}}><span>{a.pts}点</span><span>{fDS(a.due)}</span></div>
          </div>
        );})}
        {done.length>0&&<><div style={{fontSize:12,color:T.txD,fontWeight:700,margin:"12px 0 6px"}}>提出済み</div>{done.map(a=><div key={a.id} style={{padding:10,borderRadius:8,background:`${T.green}06`,border:`1px solid ${T.green}16`,marginBottom:4,opacity:.6}}><div style={{display:"flex",alignItems:"center",gap:6}}><span style={{color:T.green,display:"flex"}}>{I.chk}</span><span style={{fontSize:13,color:T.txH}}>{a.title}</span></div></div>)}</>}
        </>}
        {showTabs&&(tab==="active"||tab==="done")&&calMode==="month"&&(()=>{
          const calItems=tab==="done"?done:active;
          const byDay={};calItems.forEach(a=>{const k=dKey(a.due);(byDay[k]=byDay[k]||[]).push(a);});
          const first=new Date(calMonth.y,calMonth.m,1);
          const startOff=(first.getDay()+6)%7;
          const daysInMonth=new Date(calMonth.y,calMonth.m+1,0).getDate();
          const weeks=Math.ceil((startOff+daysInMonth)/7);
          const prevM=()=>setCalMonth(p=>p.m===0?{y:p.y-1,m:11}:{y:p.y,m:p.m-1});
          const nextM=()=>setCalMonth(p=>p.m===11?{y:p.y+1,m:0}:{y:p.y,m:p.m+1});
          const selDayItems=selDay?calItems.filter(a=>isSameDay(a.due,selDay)):[];
          const maxShow=mob?1:2;
          return <>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
              <button onClick={prevM} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",padding:4}}>{I.back}</button>
              <span style={{fontSize:14,fontWeight:700,color:T.txH}}>{calMonth.y}年{calMonth.m+1}月</span>
              <button onClick={nextM} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",padding:4}}>{I.arr}</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:mob?1:2}}>
              {DAYS.map(d=><div key={d} style={{textAlign:"center",fontSize:10,fontWeight:600,color:T.txD,padding:"4px 0"}}>{d}</div>)}
              {Array.from({length:weeks*7},(_,i)=>{
                const day=i-startOff+1;
                const valid=day>=1&&day<=daysInMonth;
                const date=valid?new Date(calMonth.y,calMonth.m,day):null;
                const isToday=date&&isSameDay(date,NOW);
                const isSel=date&&selDay&&isSameDay(date,selDay);
                const dayAsgn=date?byDay[dKey(date)]||[]:[];
                return <div key={i} onClick={()=>{if(date)setSelDay(isSel?null:date);}} style={{minHeight:mob?56:88,padding:mob?"2px 1px":"3px",borderRadius:6,background:isSel?`${T.accent}16`:isToday?`${T.accent}08`:valid?T.bg2:"transparent",border:isSel?`1px solid ${T.accent}40`:isToday?`1px solid ${T.accent}20`:`1px solid ${valid?T.bd:"transparent"}`,cursor:valid?"pointer":"default",display:"flex",flexDirection:"column",gap:2,overflow:"hidden"}}>
                  {valid&&<span style={{fontSize:mob?9:11,fontWeight:isToday?700:400,color:isToday?T.accent:T.txH,padding:"0 2px"}}>{day}</span>}
                  {valid&&dayAsgn.slice(0,maxShow).map(a=>{const co=courses.find(x=>x.id===a.cid);return <div key={a.id} style={{padding:mob?"1px 2px":"2px 3px",borderRadius:3,background:`${co?.col||T.accent}18`,borderLeft:`2px solid ${co?.col||T.accent}`,overflow:"hidden"}}>
                    <div style={{fontSize:mob?7:8,fontWeight:600,color:co?.col||T.accent,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",lineHeight:"12px"}}>{co?.name||""}</div>
                    <div style={{fontSize:mob?7:8,color:T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",lineHeight:"12px"}}>{a.title}</div>
                  </div>;})}
                  {valid&&dayAsgn.length>maxShow&&<div style={{fontSize:mob?7:8,color:T.txD,padding:"0 2px"}}>+{dayAsgn.length-maxShow}</div>}
                </div>;
              })}
            </div>
            {mob&&selDay&&<div style={{marginTop:10,padding:10,borderRadius:10,background:T.bg2,border:`1px solid ${T.bd}`}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <span style={{fontSize:13,fontWeight:700,color:T.txH}}>{selDay.getMonth()+1}/{selDay.getDate()} ({DAYS[(selDay.getDay()+6)%7]})</span>
                <button onClick={()=>setSelDay(null)} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",padding:2}}>{I.x}</button>
              </div>
              {selDayItems.length===0&&<div style={{fontSize:12,color:T.txD,padding:4}}>課題なし</div>}
              {selDayItems.map(a=>{const co=courses.find(x=>x.id===a.cid),at=aMap()[a.type],si=sMap()[a.st],dl=uDue(a.due);return(
                <div key={a.id} onClick={()=>setSel(a)} style={{padding:10,borderRadius:8,background:tab==="done"?`${T.green}06`:T.bg3,border:`1px solid ${tab==="done"?`${T.green}16`:T.bd}`,marginBottom:4,borderLeft:`3px solid ${tab==="done"?T.green:(co?.col||T.accent)}`,cursor:"pointer"}}>
                  <div style={{display:"flex",gap:4,marginBottom:3}}><Tag color={co?.col}>{co?.code}</Tag><Tag color={at?.c}>{at?.l}</Tag><Tag color={si.c}>{si.l}</Tag></div>
                  <div style={{fontSize:13,fontWeight:600,color:T.txH}}>{a.title}</div>
                  <div style={{fontSize:11,color:tab==="done"?T.green:dl.c,marginTop:2}}>{fDF(a.due)} · {dl.t}</div>
                </div>
              );})}
            </div>}
          </>;
        })()}
        {showTabs&&(tab==="active"||tab==="done")&&calMode==="timeline"&&(()=>{
          const calItems=tab==="done"?done:active;
          const overdue=tab==="active"?calItems.filter(a=>a.due<NOW):[];
          const upcoming=tab==="active"?calItems.filter(a=>a.due>=NOW):calItems;
          const makeDates=list=>[...new Set(list.map(a=>dKey(a.due)))].sort((a,b)=>{const[ay,am,ad]=a.split("-").map(Number);const[by,bm,bd]=b.split("-").map(Number);return new Date(ay,am,ad)-new Date(by,bm,bd);});
          const upDates=makeDates(upcoming);
          const renderItems=(list)=>makeDates(list).map(dk=>{const[y,m,dd]=dk.split("-").map(Number);const date=new Date(y,m,dd);const dayItems=list.filter(a=>isSameDay(a.due,date));const dl=uDue(date);return(
              <div key={dk} style={{marginBottom:12}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                  <span style={{fontSize:13,fontWeight:700,color:tab==="done"?T.green:dl.c}}>{date.getMonth()+1}/{date.getDate()}</span>
                  <span style={{fontSize:12,color:T.txD}}>{dayLabel(date)}</span>
                  {tab!=="done"&&<span style={{fontSize:11,color:dl.c,fontWeight:600}}>{dl.t}</span>}
                  <div style={{flex:1,height:1,background:T.bd}}/>
                </div>
                {dayItems.map(a=>{const co=courses.find(x=>x.id===a.cid),at=aMap()[a.type],si=sMap()[a.st];return(
                  <div key={a.id} onClick={()=>setSel(a)} style={{padding:10,borderRadius:8,background:tab==="done"?`${T.green}06`:T.bg2,border:`1px solid ${tab==="done"?`${T.green}16`:T.bd}`,marginBottom:4,borderLeft:`3px solid ${tab==="done"?T.green:(co?.col||T.accent)}`,cursor:"pointer"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"start"}}>
                      <div style={{display:"flex",gap:4,marginBottom:3}}><Tag color={co?.col}>{co?.code}</Tag><Tag color={at?.c}>{at?.l}</Tag><Tag color={si.c}>{si.l}</Tag></div>
                      {tab==="active"&&saveHidden&&<button onClick={e=>hideA(e,a.id)} title="削除" style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",padding:2,borderRadius:4,opacity:.5}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.5}>{I.x}</button>}
                    </div>
                    <div style={{fontSize:13,fontWeight:600,color:T.txH}}>{a.title}</div>
                    <div style={{display:"flex",gap:8,marginTop:2,fontSize:11,color:T.txD}}><span>{a.pts}点</span><span>{fDF(a.due)}</span></div>
                  </div>
                );})}
              </div>
          );});
          return <>
            {overdue.length>0&&<div style={{marginBottom:upDates.length?12:0}}>
              <button onClick={()=>setShowOverdue(p=>!p)} style={{display:"flex",alignItems:"center",gap:6,background:`${T.red}10`,border:`1px solid ${T.red}20`,borderRadius:8,padding:"8px 12px",cursor:"pointer",width:"100%",marginBottom:showOverdue?8:0}}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.red} strokeWidth="2.5" style={{transform:showOverdue?"rotate(90deg)":"none",transition:"transform .15s",flexShrink:0}}><path d="M9 18l6-6-6-6"/></svg>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.red} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span style={{fontSize:12,fontWeight:700,color:T.red}}>期限切れ</span>
                <span style={{fontSize:11,fontWeight:600,padding:"1px 7px",borderRadius:10,background:`${T.red}18`,color:T.red}}>{overdue.length}</span>
                <div style={{flex:1}}/>
                <span style={{fontSize:10,color:T.txD}}>{showOverdue?"閉じる":"確認する"}</span>
              </button>
              <OverdueCollapse open={showOverdue} items={overdue} renderItems={renderItems} hasUpcoming={upDates.length>0}/>
            </div>}
            {calItems.length===0&&<div style={{textAlign:"center",color:T.txD,padding:20,fontSize:13}}>{tab==="done"?"提出済みの課題はありません":"未完了の課題はありません"}</div>}
            {renderItems(upcoming)}
          </>;
        })()}
        {showTabs&&tab==="active"&&hidden.length>0&&<div style={{marginTop:4}}>
          <button onClick={()=>setShowHidden(p=>!p)} style={{display:"flex",alignItems:"center",gap:4,background:"none",border:"none",color:T.txD,fontSize:12,cursor:"pointer",padding:"4px 0"}}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{transform:showHidden?"rotate(90deg)":"none",transition:"transform .15s"}}><path d="M9 18l6-6-6-6"/></svg>
            削除済み ({hidden.length})
          </button>
          {showHidden&&hidden.map(a=>{const co=courses.find(x=>x.id===a.cid);return(
            <div key={a.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:8,background:T.bg2,border:`1px solid ${T.bd}`,marginTop:4,opacity:.5}}>
              <span style={{flex:1,fontSize:13,color:T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.title}</span>
              {co&&<Tag color={co.col}>{co.code}</Tag>}
              <button onClick={e=>unhideA(e,a.id)} style={{background:T.bg3,border:`1px solid ${T.bd}`,borderRadius:6,padding:"3px 8px",fontSize:11,color:T.txD,cursor:"pointer",flexShrink:0}}>戻す</button>
            </div>
          );})}
        </div>}
        {showTabs&&tab==="mytasks"&&(()=>{
          const pending=myTasks?.filter(t=>!t.d)||[];
          const completed=myTasks?.filter(t=>t.d)||[];
          const fmtD=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
          const today=fmtD(NOW);
          const tmrw=(()=>{const d=new Date(NOW);d.setDate(d.getDate()+1);return fmtD(d);})();
          const nxtWk=(()=>{const d=new Date(NOW);d.setDate(d.getDate()+7);return fmtD(d);})();
          return <>
            {/* Summary cards */}
            {(pending.length>0||completed.length>0)&&<div style={{display:"flex",gap:8,marginBottom:12}}>
              <div style={{flex:1,padding:"10px 12px",borderRadius:10,background:T.bg2,border:`1px solid ${T.bd}`,display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:32,height:32,borderRadius:8,background:`${T.accent}14`,display:"flex",alignItems:"center",justifyContent:"center",color:T.accent,flexShrink:0}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
                <div><div style={{fontSize:18,fontWeight:700,color:T.txH}}>{pending.length}</div><div style={{fontSize:10,color:T.txD}}>未完了</div></div>
              </div>
              <div style={{flex:1,padding:"10px 12px",borderRadius:10,background:T.bg2,border:`1px solid ${T.bd}`,display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:32,height:32,borderRadius:8,background:`${T.green}14`,display:"flex",alignItems:"center",justifyContent:"center",color:T.green,flexShrink:0}}>{I.chk}</div>
                <div><div style={{fontSize:18,fontWeight:700,color:T.txH}}>{completed.length}</div><div style={{fontSize:10,color:T.txD}}>完了</div></div>
              </div>
            </div>}

            {/* Add task */}
            {!addExpand
              ?<button onClick={()=>setAddExpand(true)} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"12px 14px",borderRadius:10,border:`1.5px dashed ${T.bdL}`,background:"transparent",color:T.txD,fontSize:14,cursor:"pointer",marginBottom:14,textAlign:"left"}}>
                <div style={{width:26,height:26,borderRadius:7,background:`${T.accent}14`,display:"flex",alignItems:"center",justifyContent:"center",color:T.accent,flexShrink:0}}>{I.plus}</div>
                タスクを追加...
              </button>
              :<div style={{padding:14,borderRadius:10,background:T.bg2,border:`1px solid ${T.accent}40`,marginBottom:14,boxShadow:`0 0 0 1px ${T.accent}10`}}>
                <input value={ntxt} onChange={e=>setNtxt(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&ntxt.trim())addTk();if(e.key==="Escape"){setAddExpand(false);setNtxt("");setNdue("");}}} autoFocus placeholder="タスク名を入力..." style={{width:"100%",padding:"8px 0",border:"none",borderBottom:`1px solid ${T.bd}`,background:"transparent",color:T.txH,fontSize:15,fontWeight:500,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
                <div style={{marginTop:10}}>
                  <div style={{fontSize:11,color:T.txD,marginBottom:6,display:"flex",alignItems:"center",gap:4}}>{I.clock} 期限（任意）</div>
                  <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
                    {[{l:"今日",v:today},{l:"明日",v:tmrw},{l:"来週",v:nxtWk}].map(q=><button key={q.l} onClick={()=>setNdue(ndue===q.v?"":q.v)} style={{padding:"5px 10px",borderRadius:6,border:`1px solid ${ndue===q.v?T.accent:T.bd}`,background:ndue===q.v?`${T.accent}14`:"transparent",color:ndue===q.v?T.accent:T.txD,fontSize:12,cursor:"pointer",fontWeight:ndue===q.v?600:400}}>{q.l}</button>)}
                    <input type="date" value={ndue} onChange={e=>setNdue(e.target.value)} style={{padding:"5px 8px",borderRadius:6,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:12,outline:"none",fontFamily:"inherit"}}/>
                    {ndue&&<button onClick={()=>setNdue("")} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",padding:2,fontSize:10}}>{I.x}</button>}
                  </div>
                </div>
                <div style={{display:"flex",gap:6,marginTop:12}}>
                  <button onClick={addTk} disabled={!ntxt.trim()} style={{flex:1,padding:"9px 0",borderRadius:8,border:"none",background:ntxt.trim()?T.accent:T.bg3,color:ntxt.trim()?"#fff":T.txD,fontSize:13,fontWeight:600,cursor:ntxt.trim()?"pointer":"default"}}>追加</button>
                  <button onClick={()=>{setAddExpand(false);setNtxt("");setNdue("");}} style={{padding:"9px 14px",borderRadius:8,border:`1px solid ${T.bd}`,background:"transparent",color:T.txD,fontSize:13,cursor:"pointer"}}>キャンセル</button>
                </div>
              </div>
            }

            {/* Empty state */}
            {pending.length===0&&completed.length===0&&!addExpand&&<div style={{textAlign:"center",padding:"32px 0",color:T.txD}}>
              <div style={{display:"inline-flex",marginBottom:10,opacity:.4}}><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg></div>
              <div style={{fontSize:14,fontWeight:500,color:T.txH,marginBottom:4}}>タスクがありません</div>
              <div style={{fontSize:12}}>上の「タスクを追加」から始めましょう</div>
            </div>}

            {/* Pending tasks */}
            {pending.map(t=>{const dl=t.due?uDue(t.due):null;return(
              <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",borderRadius:10,background:T.bg2,border:`1px solid ${T.bd}`,marginBottom:6,borderLeft:dl?.u?`3px solid ${dl.c}`:`3px solid transparent`}}>
                <div onClick={()=>togTk(t.id)} style={{width:22,height:22,borderRadius:6,border:`2px solid ${T.bdL}`,flexShrink:0,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}/>
                <div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>togTk(t.id)}>
                  <div style={{fontSize:14,color:T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.t}</div>
                  {dl&&<div style={{fontSize:11,color:dl.c,marginTop:2,display:"flex",alignItems:"center",gap:3}}>{I.clock} {fDS(t.due)} · {dl.t}</div>}
                </div>
                <button onClick={()=>delTk(t.id)} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",padding:4,borderRadius:4,opacity:.3,flexShrink:0}} onMouseEnter={e=>e.currentTarget.style.opacity=.9} onMouseLeave={e=>e.currentTarget.style.opacity=.3}>{I.x}</button>
              </div>
            );})}

            {/* Completed tasks */}
            {completed.length>0&&<div style={{marginTop:pending.length?8:0}}>
              <button onClick={()=>setShowDoneTk(p=>!p)} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",color:T.txD,fontSize:12,fontWeight:600,cursor:"pointer",padding:"6px 0",width:"100%"}}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{transform:showDoneTk?"rotate(90deg)":"none",transition:"transform .15s"}}><path d="M9 18l6-6-6-6"/></svg>
                完了済み ({completed.length})
                <div style={{flex:1,height:1,background:T.bd,marginLeft:4}}/>
              </button>
              {showDoneTk&&completed.map(t=><div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 14px",borderRadius:8,marginBottom:3,opacity:.5}}>
                <div onClick={()=>togTk(t.id)} style={{width:22,height:22,borderRadius:6,background:T.green,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",flexShrink:0,cursor:"pointer"}}>{I.chk}</div>
                <span onClick={()=>togTk(t.id)} style={{flex:1,fontSize:14,color:T.txD,textDecoration:"line-through",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",cursor:"pointer"}}>{t.t}</span>
                <button onClick={()=>delTk(t.id)} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",padding:4,borderRadius:4,opacity:.3,flexShrink:0}} onMouseEnter={e=>e.currentTarget.style.opacity=.9} onMouseLeave={e=>e.currentTarget.style.opacity=.3}>{I.x}</button>
              </div>)}
            </div>}
          </>;
        })()}
        </div>
        {/* PC Right Panel */}
        {!mob&&showTabs&&(tab==="active"||tab==="done")&&<div style={{width:340,flexShrink:0,borderLeft:`1px solid ${T.bd}`,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:14}}>
          {sel?(()=>{
            const a=sel,co=courses.find(x=>x.id===a.cid),at=aMap()[a.type],dl=uDue(a.due),si=sMap()[a.st],p=pDone(a.subs);
            return <>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                <span style={{fontSize:14,fontWeight:700,color:T.txH}}>課題詳細</span>
                <button onClick={()=>setSel(null)} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",padding:2}}>{I.x}</button>
              </div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:6}}><Tag color={co?.col}>{co?.code}</Tag><Tag color={at?.c}>{at?.l}</Tag><Tag color={si.c}>{si.l}</Tag><span style={{width:7,height:7,borderRadius:4,background:pCol()[a.pri],alignSelf:"center"}}/></div>
              <h3 style={{color:T.txH,margin:"0 0 4px",fontSize:17,fontWeight:700}}>{a.title}</h3>
              <div style={{color:T.tx,fontSize:13,lineHeight:1.6,margin:"0 0 12px"}}><Tx>{a.desc}</Tx></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr",gap:8,marginBottom:12}}>
                <div style={{padding:10,borderRadius:8,background:T.bg2,border:`1px solid ${T.bd}`}}><div style={{fontSize:10,color:T.txD}}>締切</div><div style={{fontSize:14,fontWeight:700,color:dl.c}}>{fDF(a.due)}</div><div style={{fontSize:11,color:dl.c}}>{dl.t}</div></div>
                <div style={{padding:10,borderRadius:8,background:T.bg2,border:`1px solid ${T.bd}`}}><div style={{fontSize:10,color:T.txD}}>配点 / 進捗</div><div style={{fontSize:14,fontWeight:700,color:T.accent}}>{a.pts}点 · {p}%</div></div>
              </div>
              <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
                {[{s:"not_started",l:"未着手"},{s:"in_progress",l:"着手"},{s:"completed",l:"提出済"}].map(x=><button key={x.s} onClick={()=>chSt(a.id,x.s)} style={{padding:"7px 12px",borderRadius:8,border:"none",fontSize:12,fontWeight:600,cursor:"pointer",background:a.st===x.s?`${sMap()[x.s].c}22`:T.bg3,color:a.st===x.s?sMap()[x.s].c:T.txD}}>{x.s==="completed"&&<span style={{display:"inline-flex",marginRight:3,verticalAlign:"middle"}}>{I.chk}</span>}{x.l}</button>)}
              </div>
              {a.subs.length>0&&<div style={{marginBottom:12}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}><Bar p={p} h={6}/><span style={{fontSize:12,fontWeight:600,color:p>=100?T.green:T.accent}}>{p}%</span></div>
                {a.subs.map(s=><div key={s.id} onClick={()=>togSub(a.id,s.id)} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 8px",borderRadius:8,marginBottom:3,background:s.d?`${T.green}06`:T.bg2,border:`1px solid ${s.d?`${T.green}16`:T.bd}33`,cursor:"pointer"}}><div style={{width:18,height:18,borderRadius:5,display:"flex",alignItems:"center",justifyContent:"center",background:s.d?T.green:"transparent",border:s.d?"none":`2px solid ${T.bdL}`,color:"#fff",flexShrink:0}}>{s.d&&I.chk}</div><span style={{fontSize:13,color:s.d?T.txD:T.txH,textDecoration:s.d?"line-through":"none"}}>{s.t}</span></div>)}
              </div>}
              {a.url&&<button onClick={()=>goLms(a.url)} disabled={lmsLoading} style={{display:"flex",alignItems:"center",gap:6,padding:"9px 12px",borderRadius:8,border:`1px solid ${T.accent}33`,background:`${T.accent}08`,color:T.accent,fontSize:12,fontWeight:500,cursor:lmsLoading?"wait":"pointer",width:"100%",justifyContent:"center",marginBottom:6,opacity:lmsLoading?.6:1}}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                {lmsLoading?"ログイン中...":"LMSで課題を開く"}
              </button>}
              {navCourse&&<button onClick={()=>navCourse(a.cid)} style={{display:"flex",alignItems:"center",gap:6,padding:"9px 12px",borderRadius:8,border:`1px solid ${co?.col}33`,background:`${co?.col}08`,color:co?.col,fontSize:12,fontWeight:500,cursor:"pointer",width:"100%",justifyContent:"center"}}>{co?.code} のチャンネルへ {I.arr}</button>}
            </>;
          })():calMode==="month"&&selDay?(()=>{
            const calItems=tab==="done"?done:active;
            const selDayItems=calItems.filter(a=>isSameDay(a.due,selDay));
            return <>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                <span style={{fontSize:14,fontWeight:700,color:T.txH}}>{selDay.getMonth()+1}/{selDay.getDate()} ({DAYS[(selDay.getDay()+6)%7]})</span>
                <button onClick={()=>setSelDay(null)} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",padding:2}}>{I.x}</button>
              </div>
              {selDayItems.length===0&&<div style={{fontSize:12,color:T.txD,padding:4}}>この日の課題はありません</div>}
              {selDayItems.map(a=>{const co=courses.find(x=>x.id===a.cid),at=aMap()[a.type],si=sMap()[a.st],dl=uDue(a.due);return(
                <div key={a.id} onClick={()=>setSel(a)} style={{padding:10,borderRadius:8,background:tab==="done"?`${T.green}06`:T.bg3,border:`1px solid ${tab==="done"?`${T.green}16`:T.bd}`,marginBottom:4,borderLeft:`3px solid ${tab==="done"?T.green:(co?.col||T.accent)}`,cursor:"pointer"}}>
                  <div style={{display:"flex",gap:4,marginBottom:3}}><Tag color={co?.col}>{co?.code}</Tag><Tag color={at?.c}>{at?.l}</Tag><Tag color={si.c}>{si.l}</Tag></div>
                  <div style={{fontSize:13,fontWeight:600,color:T.txH}}>{a.title}</div>
                  <div style={{fontSize:11,color:tab==="done"?T.green:dl.c,marginTop:2}}>{fDF(a.due)} · {dl.t}</div>
                </div>
              );})}
            </>;
          })():<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",color:T.txD,fontSize:13,gap:8}}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={T.txD} strokeWidth="1.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
            <span>日付または課題を選択</span>
          </div>}
        </div>}
      </div>
    </div>
  );
};
