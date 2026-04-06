import React, { useState, useEffect } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
export const TTView=(_p)=>{
  const {setCid,setView,setCh,asgn,mob,quarter,setQuarter,qd,onRefresh,courses=[],hiddenSet=new Set(),goToBuilding,pastTTCache={},fetchPastTimetable,pastTTLoading=false,pastTTError=null}=_p;
  const _yr=_p.tty,_setYr=_p.setTty;
  const days=["月","火","水","木","金"],daysFull=["Monday","Tuesday","Wednesday","Thursday","Friday"],dayJP=["月曜日","火曜日","水曜日","木曜日","金曜日"];
  const pds=["1","2","3","4","5"],pdLabel=["1限","2限","3限","4限","5限"],pdTimes=["8:50–10:30","10:45–12:25","13:30–15:10","15:25–17:05","17:15–18:55"];
  const _jd=new Date(Date.now()+9*3600000);
  const _cAY=_jd.getUTCMonth()>=3?_jd.getUTCFullYear():_jd.getUTCFullYear()-1;
  const _yrOpts=[_cAY-2,_cAY-1,_cAY];
  const [qOpen,setQOpen]=useState(false);
  const [yrOpen,setYrOpen]=useState(false);
  const [refreshing,setRefreshing]=useState(false);
  const [merged,setMerged]=useState(()=>{try{return localStorage.getItem("tt_merged")!=="0";}catch{return true;}});
  const isPast=_yr<=2024;
  const pastData=isPast?pastTTCache[_yr]:null;
  const pastQd=pastData?.qData?.[quarter]||null;
  useEffect(()=>{if(isPast&&!pastData&&fetchPastTimetable&&!pastTTLoading)fetchPastTimetable(_yr);},[_yr,isPast]);
  const _allC=isPast?(pastQd?.C||[]):(qd.C||[]);
  const _allTT=isPast?(pastQd?.TT||[]):(qd.TT||[]);
  const curC=isPast?_allC:_allC.filter(c=>!c.year||c.year===_yr);
  const curTT=React.useMemo(()=>{
    if(isPast)return _allTT;
    // Rebuild grid from year-filtered courses to avoid cross-year overwrites
    const DM={'月':0,'火':1,'水':2,'木':3,'金':4};
    const g=Array.from({length:5},()=>Array(5).fill(null));
    const place=(co,per)=>{const m=per.match(/([月火水木金])(\d+)[-–ー](\d+)/);if(!m)return;const di=DM[m[1]],rs=Math.floor((parseInt(m[2])-1)/2),re=Math.floor((parseInt(m[3])-1)/2);for(let r=rs;r<=re;r++)if(di>=0&&di<5&&r>=0&&r<5)g[r][di]=co;};
    for(const co of curC){if(!co.per||co.per==='未設定')continue;place(co,co.per);if(co.extraSlots)for(const s of co.extraSlots)if(s.per)place(co,s.per);}
    return g;
  },[isPast,_allTT,curC]);
  const cnt=cid=>asgn.filter(a=>a.cid===cid&&a.st!=="completed"&&!hiddenSet.has(a.id)).length;
  const handleRefresh=async()=>{if(!onRefresh||refreshing)return;setRefreshing(true);try{await onRefresh();}finally{setRefreshing(false);}};
  const toggleMerged=()=>setMerged(p=>{const nv=!p;try{localStorage.setItem("tt_merged",nv?"1":"0");}catch{}return nv;});
  const cellEntries=React.useMemo(()=>{const entries=[],visited=new Set();for(let pi=0;pi<5;pi++)for(let di=0;di<5;di++){if(visited.has(`${pi}-${di}`))continue;const co=curTT[pi]?.[di];let span=1;if(co&&merged){for(let pj=pi+1;pj<5;pj++){const nx=curTT[pj]?.[di];if(nx&&nx.id===co.id){span++;visited.add(`${pj}-${di}`);}else break;}}entries.push({di,pi,co,span});}return entries;},[curTT,merged]);
  const MergeBtn=()=>(
    <button onClick={toggleMerged}
      style={{background:merged?`${T.accent}15`:T.bg3,border:`1px solid ${merged?`${T.accent}40`:T.bd}`,borderRadius:6,padding:"3px 8px",cursor:"pointer",
        display:"flex",alignItems:"center",gap:3,fontSize:mob?11:12,fontWeight:600,color:merged?T.accent:T.txD,transition:"all .2s"}}>
      <svg width={mob?10:12} height={mob?10:12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        {merged?<><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/></>
          :<><rect x="3" y="3" width="18" height="8" rx="2"/><rect x="3" y="13" width="18" height="8" rx="2"/></>}
      </svg>
      {merged?"結合":"分割"}
    </button>
  );
  const RefreshBtn=()=>onRefresh?(<>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    <button onClick={handleRefresh} disabled={refreshing}
      style={{background:T.bg3,border:`1px solid ${T.bd}`,borderRadius:6,padding:"3px 10px",cursor:refreshing?"default":"pointer",
        display:"flex",alignItems:"center",gap:4,fontSize:mob?12:13,fontWeight:600,color:refreshing?T.txD:T.txH,opacity:refreshing?.6:1,transition:"all .2s"}}>
      <svg width={mob?12:14} height={mob?12:14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        style={{animation:refreshing?"spin 1s linear infinite":"none"}}>
        <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
      </svg>
      {refreshing?"更新中...":"更新"}
    </button>
  </>):null;
  const QDrop=()=>(
    <div style={{position:"relative",display:"inline-block"}}>
      <button onClick={()=>setQOpen(p=>!p)}
        style={{background:T.bg3,border:`1px solid ${T.bd}`,borderRadius:6,padding:"3px 10px",cursor:"pointer",
          display:"flex",alignItems:"center",gap:4,fontSize:mob?12:13,fontWeight:700,color:T.accent}}>
        {quarter}Q
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      {qOpen&&<><div onClick={()=>setQOpen(false)} style={{position:"fixed",inset:0,zIndex:49}}/>
        <div style={{position:"absolute",top:"100%",left:0,marginTop:4,background:T.bg2,border:`1px solid ${T.bd}`,borderRadius:8,
          boxShadow:"0 4px 16px rgba(0,0,0,.4)",overflow:"hidden",zIndex:50,minWidth:80}}>
          {[1,2,3,4].map(q=>(
            <div key={q} onClick={()=>{setQuarter(q);setQOpen(false);}}
              style={{padding:"8px 14px",cursor:"pointer",fontSize:13,fontWeight:q===quarter?700:400,
                color:q===quarter?T.accent:T.txH,background:q===quarter?`${T.accent}10`:"transparent"}}>
              {q}Q
            </div>
          ))}
        </div></>}
    </div>
  );
  const YrDrop=()=>(
    <div style={{position:"relative",display:"inline-block"}}>
      <button onClick={()=>setYrOpen(p=>!p)}
        style={{background:T.bg3,border:`1px solid ${T.bd}`,borderRadius:6,padding:"3px 10px",cursor:"pointer",
          display:"flex",alignItems:"center",gap:4,fontSize:mob?12:13,fontWeight:700,color:T.txD}}>
        {_yr}年度
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.txD} strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      {yrOpen&&<><div onClick={()=>setYrOpen(false)} style={{position:"fixed",inset:0,zIndex:49}}/>
        <div style={{position:"absolute",top:"100%",left:0,marginTop:4,background:T.bg2,border:`1px solid ${T.bd}`,borderRadius:8,
          boxShadow:"0 4px 16px rgba(0,0,0,.4)",overflow:"hidden",zIndex:50,minWidth:90}}>
          {_yrOpts.map(y=>(
            <div key={y} onClick={()=>{_setYr(y);setYrOpen(false);try{localStorage.setItem("tty",String(y));}catch{}}}
              style={{padding:"8px 14px",cursor:"pointer",fontSize:13,fontWeight:y===_yr?700:400,
                color:y===_yr?T.accent:T.txH,background:y===_yr?`${T.accent}10`:"transparent"}}>
              {y}年度
            </div>
          ))}
        </div></>}
    </div>
  );
  const today=new Date().getDay();
  const todayIdx=today>=1&&today<=5?today-1:-1;
  const [hover,setHover]=useState(null);
  const gap=mob?3:5;
  const Cell=({co,n,pi,di,gs})=>{
    const hk=`${pi}-${di}`;const isHov=hover===hk;const isToday=di===todayIdx;
    if(!co)return <div style={{borderRadius:mob?8:10,background:isToday?`${T.accent}06`:`${T.bg2}80`,minHeight:80,border:`1px solid ${isToday?`${T.accent}15`:T.bd}`,...gs}}/>;
    return(
      <div onClick={()=>{setCid(co.id);setCh("timeline");setView("course");}}
        onMouseEnter={()=>setHover(hk)} onMouseLeave={()=>setHover(null)}
        style={{borderRadius:mob?8:10,minHeight:80,cursor:"pointer",position:"relative",overflow:"hidden",
          background:`linear-gradient(135deg, ${co.col}${isHov?"30":"18"}, ${co.col}${isHov?"15":"08"})`,
          border:`1.5px solid ${co.col}${isHov?"60":"30"}`,
          transition:"all .2s ease",transform:isHov?"scale(1.02)":"scale(1)",...gs}}>
        <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:co.col,borderRadius:"10px 10px 0 0"}}/>
        <div style={{padding:mob?"6px 6px 5px":"10px 10px 8px",display:"flex",flexDirection:"column",height:"100%",justifyContent:"center"}}>
          <div style={{fontWeight:800,color:co.col,fontSize:mob?9:13,letterSpacing:.5,lineHeight:1}}>{mob?co.code.split(".")[1]:co.code}</div>
          <div style={{fontSize:mob?8:12,color:T.txH,marginTop:mob?2:4,lineHeight:1.3,fontWeight:600,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{co.name}</div>
          <div style={{fontSize:mob?8:10,color:T.txD,marginTop:mob?2:4,opacity:.8}}>
            <div style={{display:"flex",alignItems:"center",gap:3}}>
              <svg width={mob?7:9} height={mob?7:9} viewBox="0 0 24 24" fill={T.txD} stroke="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/></svg>
              <span>{co.room?.replace(/\s*\(.*?\)/g,"")}{co.bldg&&!co.building?` (${co.bldg})`:""}</span>
            </div>
            {co.bldg&&co.building&&<div onClick={e=>{e.stopPropagation();goToBuilding(co.building);}} style={{display:"inline-flex",alignItems:"center",gap:2,marginTop:2,padding:"0px 4px",borderRadius:4,background:"#14b8a620",color:"#14b8a6",fontWeight:700,cursor:"pointer",fontSize:9}}><svg width={8} height={8} viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/></svg>{co.bldg}</div>}
          </div>
        </div>
        {n>0&&<div style={{position:"absolute",top:mob?3:6,right:mob?3:6,minWidth:mob?15:20,height:mob?15:20,borderRadius:10,background:T.red,color:"#fff",fontSize:mob?8:10,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 4px",boxShadow:`0 2px 6px ${T.red}60`}}>{n}</div>}
      </div>);
  };
  const PastBanner=()=>{
    if(!isPast)return null;
    if(pastTTLoading)return <div style={{padding:mob?10:14,borderRadius:10,background:`${T.accent}10`,border:`1px solid ${T.accent}30`,marginBottom:mob?8:14,display:"flex",alignItems:"center",gap:8}}>
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{animation:"spin 1s linear infinite",flexShrink:0}}><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
      <span style={{fontSize:12,color:T.accent,fontWeight:600}}>{_yr}年度の時間割を取得中...</span>
    </div>;
    if(pastTTError&&!pastData)return <div style={{padding:mob?10:14,borderRadius:10,background:`${T.red}10`,border:`1px solid ${T.red}30`,marginBottom:mob?8:14}}>
      <div style={{fontSize:12,color:T.red,fontWeight:600}}>{_yr}年度の取得に失敗しました</div>
      <div style={{fontSize:11,color:T.txD,marginTop:4}}>{pastTTError}</div>
      {fetchPastTimetable&&<button onClick={()=>fetchPastTimetable(_yr)} style={{marginTop:8,padding:"5px 14px",borderRadius:8,border:`1px solid ${T.accent}`,background:"transparent",color:T.accent,fontSize:12,fontWeight:600,cursor:"pointer"}}>再取得</button>}
    </div>;
    if(pastData?.stats)return <div style={{padding:mob?"6px 10px":"8px 14px",borderRadius:8,background:T.bg3,border:`1px solid ${T.bd}`,marginBottom:mob?8:14,fontSize:11,color:T.txD,display:"flex",alignItems:"center",gap:6}}>
      <span style={{background:`${T.accent}15`,color:T.accent,padding:"2px 8px",borderRadius:6,fontWeight:700,fontSize:10}}>T2SCHOLA</span>
      {pastData.stats.withSchedule}/{pastData.stats.total}科目の時間割あり
    </div>;
    return null;
  };
  /* --- mobile: grid (rows=periods, cols=days) with vertical scroll --- */
  if(mob){
    return(<>
      <header style={{display:"flex",alignItems:"center",gap:8,padding:"env(safe-area-inset-top) 12px 0",minHeight:46,borderBottom:`1px solid ${T.bd}`,flexShrink:0,background:T.bg2}}>
        <div style={{display:"flex",alignItems:"center",gap:8,width:"100%",height:46}}>
          <h1 style={{flex:1,margin:0,fontSize:16,fontWeight:700,color:T.txH,display:"flex",alignItems:"center",gap:6}}>時間割 <QDrop/> <YrDrop/></h1>
          <MergeBtn/><RefreshBtn/>
        </div>
      </header>
      <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:8}}>
        <PastBanner/>
        {isPast&&pastTTLoading&&!pastData?null:<><div style={{display:"grid",gridTemplateColumns:"32px repeat(5,1fr)",gridTemplateRows:"auto repeat(5,1fr)",gap:2}}>
          <div/>
          {days.map((d,i)=>{const isT=i===todayIdx;return(
            <div key={d} style={{display:"flex",alignItems:"center",justifyContent:"center",borderRadius:6,
              background:isT?T.accent:"transparent",padding:"4px 0"}}>
              <span style={{fontWeight:800,fontSize:12,color:isT?"#fff":T.txH}}>{d}</span>
            </div>);
          })}
          {pds.map((p,pi)=>
            <div key={`lbl${pi}`} style={{gridColumn:1,gridRow:pi+2,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:1}}>
              <span style={{fontWeight:700,fontSize:10,color:T.txH}}>{pdLabel[pi]}</span>
              <span style={{fontSize:7,color:T.txD,marginTop:1,lineHeight:1.2,whiteSpace:"nowrap",textAlign:"center"}}>{pdTimes[pi].split("–")[0]}</span>
              <span style={{fontSize:6,color:T.txD,lineHeight:1}}>~</span>
              <span style={{fontSize:7,color:T.txD,lineHeight:1.2,whiteSpace:"nowrap",textAlign:"center"}}>{pdTimes[pi].split("–")[1]}</span>
            </div>
          )}
          {cellEntries.map(({di,pi,co,span})=>{const n=co?cnt(co.id):0;const isT=di===todayIdx;
            if(!co)return <div key={`${pi}-${di}`} style={{gridColumn:di+2,gridRow:`${pi+2}/span ${span}`,borderRadius:6,background:isT?`${T.accent}06`:`${T.bg2}50`,minHeight:68}}/>;
            return(
              <div key={`${pi}-${di}`} onClick={()=>{setCid(co.id);setCh("timeline");setView("course");}}
                style={{gridColumn:di+2,gridRow:`${pi+2}/span ${span}`,borderRadius:6,minHeight:68,cursor:"pointer",position:"relative",overflow:"hidden",
                  background:`linear-gradient(135deg, ${co.col}18, ${co.col}08)`,
                  border:`1.5px solid ${co.col}30`}}>
                <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:co.col,borderRadius:"8px 8px 0 0"}}/>
                <div style={{padding:"6px 5px 5px",display:"flex",flexDirection:"column",height:"100%",justifyContent:"center"}}>
                  <div style={{fontWeight:800,color:co.col,fontSize:9,letterSpacing:.3,lineHeight:1}}>{co.code.split(".")[1]}</div>
                  <div style={{fontSize:9,color:T.txH,marginTop:2,lineHeight:1.25,fontWeight:600,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{co.name}</div>
                  <div style={{fontSize:8,color:T.txD,marginTop:2}}>
                    <div style={{display:"flex",alignItems:"center",gap:2}}>
                      <svg width="7" height="7" viewBox="0 0 24 24" fill={T.txD} stroke="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/></svg>
                      {co.room?.replace(/\s*\(.*?\)/g,"")}{co.bldg&&!co.building?` (${co.bldg})`:""}
                    </div>
                    {co.bldg&&co.building&&<div onClick={e=>{e.stopPropagation();goToBuilding(co.building);}} style={{display:"inline-flex",alignItems:"center",gap:3,marginTop:3,padding:"3px 5px",borderRadius:5,background:"#14b8a630",color:"#14b8a6",fontWeight:700,cursor:"pointer",fontSize:10,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"100%"}}><svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/></svg>{co.bldg}</div>}
                  </div>
                </div>
                {n>0&&<div style={{position:"absolute",top:2,right:2,minWidth:14,height:14,borderRadius:7,background:T.red,color:"#fff",fontSize:8,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px",boxShadow:`0 2px 6px ${T.red}60`}}>{n}</div>}
              </div>);
          })}
        </div>
        <div style={{marginTop:14}}>
          <div style={{fontSize:13,fontWeight:700,color:T.txH,marginBottom:6}}>履修科目</div>
          {curC.map(co=>{const n=cnt(co.id);return(
            <div key={co.id} onClick={()=>{setCid(co.id);setCh("timeline");setView("course");}}
              style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:8,background:T.bg2,border:`1px solid ${T.bd}`,marginBottom:4,cursor:"pointer"}}>
              <div style={{width:6,height:6,borderRadius:3,background:co.col,flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:600,color:T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{co.name}</div>
                <div style={{fontSize:10,color:T.txD}}>{co.code} · {co.per} · {co.room?.replace(/\s*\(.*?\)/g,"")}{co.bldg&&!co.building?` (${co.bldg})`:""} {co.bldg&&co.building&&<span onClick={e=>{e.stopPropagation();goToBuilding(co.building);}} style={{display:"inline-flex",alignItems:"center",gap:2,padding:"0px 4px",borderRadius:4,background:"#14b8a620",color:"#14b8a6",fontSize:10,fontWeight:700,cursor:"pointer",verticalAlign:"middle"}}><svg width="7" height="7" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/></svg>{co.bldg}</span>}</div>
              </div>
              {n>0&&<span style={{fontSize:10,fontWeight:700,color:T.red}}>{n}件</span>}
            </div>
          );})}
        </div>
        </>}
      </div>
    </>);
  }
  /* --- desktop: grid --- */
  return(
    <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:20}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <h2 style={{color:T.txH,margin:0,fontSize:22,fontWeight:800,letterSpacing:-.5}}>時間割</h2>
            <QDrop/>
            <YrDrop/>
          </div>
          <span style={{fontSize:12,color:T.txD}}>{curC.length}科目 · {curC.length*2}単位</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}><MergeBtn/><RefreshBtn/></div>
      </div>
      <PastBanner/>
      {isPast&&pastTTLoading&&!pastData?null:<><div style={{display:"grid",gridTemplateColumns:`52px repeat(5,1fr)`,gridTemplateRows:"44px repeat(5,1fr)",gap:gap}}>
        <div/>
        {days.map((d,i)=>{const isT=i===todayIdx;return(
          <div key={d} style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",borderRadius:10,
            background:isT?T.accent:"transparent",padding:"6px 0"}}>
            <span style={{fontWeight:700,color:isT?"#fff":T.txH,fontSize:14}}>{d}</span>
            <span style={{fontSize:9,color:isT?"rgba(255,255,255,.7)":T.txD,marginTop:1}}>{daysFull[i].slice(0,3)}</span>
          </div>);
        })}
        {pds.map((p,pi)=>
          <div key={`lbl${pi}`} style={{gridColumn:1,gridRow:pi+2,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:4}}>
            <span style={{fontWeight:700,fontSize:13,color:T.txH}}>{pdLabel[pi]}</span>
            <span style={{fontSize:10,color:T.txD,marginTop:2,lineHeight:1,whiteSpace:"nowrap"}}>{pdTimes[pi].replace("–","~")}</span>
          </div>
        )}
        {cellEntries.map(({di,pi,co,span})=>{const n=co?cnt(co.id):0;
          return <Cell key={`c${pi}-${di}`} co={co} n={n} pi={pi} di={di} gs={{gridColumn:di+2,gridRow:`${pi+2}/span ${span}`}}/>;
        })}
      </div>
      <div style={{marginTop:28}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <h3 style={{color:T.txH,margin:0,fontSize:16,fontWeight:700}}>履修科目一覧</h3>
          <span style={{fontSize:11,color:T.txD,background:T.bg3,padding:"2px 10px",borderRadius:10}}>{curC.length}科目</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        {curC.map(co=>{const n=cnt(co.id);return(
          <div key={co.id} onClick={()=>{setCid(co.id);setCh("timeline");setView("course");}}
            onMouseEnter={e=>{e.currentTarget.style.background=`${co.col}12`;e.currentTarget.style.borderColor=`${co.col}40`;}}
            onMouseLeave={e=>{e.currentTarget.style.background=T.bg2;e.currentTarget.style.borderColor=T.bd;}}
            style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:12,background:T.bg2,border:`1.5px solid ${T.bd}`,cursor:"pointer",transition:"all .2s"}}>
            <div style={{width:44,height:44,borderRadius:12,background:`linear-gradient(135deg, ${co.col}, ${co.col}aa)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:`0 2px 8px ${co.col}30`}}>
              <span style={{color:"#fff",fontWeight:800,fontSize:13}}>{co.code.split(".")[1]?.slice(0,3)||co.code.slice(0,3)}</span>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:600,color:T.txH,fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{co.name}</div>
              <div style={{fontSize:11,color:T.txD,marginTop:2,display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
                <span style={{background:T.bg3,padding:"1px 6px",borderRadius:4,fontSize:10}}>{co.code}</span>
                <span>{co.per}</span><span>·</span><span>{co.room?.replace(/\s*\(.*?\)/g,"")}{co.bldg&&!co.building?` (${co.bldg})`:""}</span>{co.bldg&&co.building&&<span onClick={e=>{e.stopPropagation();goToBuilding(co.building);}} style={{display:"inline-flex",alignItems:"center",gap:2,padding:"1px 5px",borderRadius:4,background:"#14b8a620",color:"#14b8a6",fontSize:10,fontWeight:700,cursor:"pointer"}}><svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/></svg>{co.bldg}</span>}
              </div>
            </div>
            {n>0&&<div style={{padding:"4px 10px",borderRadius:12,background:`${T.red}15`,color:T.red,fontSize:11,fontWeight:700,flexShrink:0,border:`1px solid ${T.red}30`}}>課題 {n}</div>}
          </div>
        );})}
        </div>
      </div>
      </>}
    </div>
  );
};

export const CSelect=({setCid,setView,setCh,courses=[],depts=[],schools=[],setDid,userUnit=null})=>{
  return(
    <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:12}}>
      {schools.length>0&&<>
        <div style={{fontSize:12,fontWeight:700,color:T.txD,marginBottom:6,letterSpacing:.3}}>学院</div>
        {schools.map(s=><div key={s.prefix} onClick={()=>{setDid?.(s.prefix);setCh("timeline");setView("dept");}} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:10,background:T.bg2,border:`1px solid ${T.bd}`,marginBottom:8,borderLeft:`3px solid ${s.col}`,cursor:"pointer"}}>
          <div style={{width:38,height:38,borderRadius:10,background:s.col,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:12,flexShrink:0}}>{s.name.slice(0,2)}</div>
          <div style={{flex:1}}><div style={{fontWeight:600,color:T.txH,fontSize:14}}>{s.name}</div></div>
          <span style={{color:T.txD,display:"flex"}}>{I.arr}</span>
        </div>)}
      </>}
      {depts.length>0&&<>
        <div style={{fontSize:12,fontWeight:700,color:T.txD,marginTop:8,marginBottom:6,letterSpacing:.3}}>学系</div>
        {depts.map(d=><div key={d.prefix} onClick={()=>{setDid?.(d.prefix);setCh("timeline");setView("dept");}} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:10,background:T.bg2,border:`1px solid ${T.bd}`,marginBottom:8,borderLeft:`3px solid ${d.col}`,cursor:"pointer"}}>
          <div style={{width:38,height:38,borderRadius:10,background:d.col,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:11,flexShrink:0}}>{d.prefix}</div>
          <div style={{flex:1}}><div style={{fontWeight:600,color:T.txH,fontSize:14}}>{d.name}</div></div>
          <span style={{color:T.txD,display:"flex"}}>{I.arr}</span>
        </div>)}
      </>}
      {userUnit&&<>
        <div style={{fontSize:12,fontWeight:700,color:T.txD,marginTop:8,marginBottom:6,letterSpacing:.3}}>ユニット — {userUnit.yg}</div>
        <div onClick={()=>{setDid?.(userUnit.prefix);setCh("timeline");setView("dept");}} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:10,background:T.bg2,border:`1px solid ${T.bd}`,marginBottom:8,borderLeft:`3px solid ${userUnit.col}`,cursor:"pointer"}}>
          <div style={{width:38,height:38,borderRadius:10,background:userUnit.col,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:12,flexShrink:0}}>U{userUnit.num}</div>
          <div style={{flex:1}}><div style={{fontWeight:600,color:T.txH,fontSize:14}}>ユニット{userUnit.num}</div><div style={{fontSize:12,color:T.txD}}>{userUnit.yg} 学院横断グループ</div></div>
          <span style={{color:T.txD,display:"flex"}}>{I.arr}</span>
        </div>
      </>}
      {(schools.length>0||depts.length>0||userUnit)&&<div style={{fontSize:12,fontWeight:700,color:T.txD,marginTop:8,marginBottom:6,letterSpacing:.3}}>コース</div>}
      {courses.map(co=><div key={co.id} onClick={()=>{setCid(co.id);setCh("timeline");setView("course");}} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:10,background:T.bg2,border:`1px solid ${T.bd}`,marginBottom:8,borderLeft:`3px solid ${co.col}`,cursor:"pointer"}}>
        <div style={{width:38,height:38,borderRadius:10,background:co.col,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:13,flexShrink:0}}>{co.code.slice(0,3)}</div>
        <div style={{flex:1}}><div style={{fontWeight:600,color:T.txH,fontSize:14}}>{co.name}</div><div style={{fontSize:12,color:T.txD}}>{co.code} · {co.per}</div></div>
        <span style={{color:T.txD,display:"flex"}}>{I.arr}</span>
      </div>)}
    </div>
  );
};
