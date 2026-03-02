import React, { useState } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
export const TTView=({setCid,setView,setCh,asgn,mob,quarter,setQuarter,qd,onRefresh,courses=[]})=>{
  const days=["月","火","水","木","金"],daysFull=["Monday","Tuesday","Wednesday","Thursday","Friday"],dayJP=["月曜日","火曜日","水曜日","木曜日","金曜日"];
  const pds=["1","2","3","4","5"],pdLabel=["1限","2限","3限","4限","5限"],pdTimes=["8:50–10:30","10:45–12:25","13:20–15:00","15:15–16:55","17:10–18:50"];
  const curC=qd.C,curTT=qd.TT;
  const cnt=cid=>asgn.filter(a=>a.cid===cid&&a.st!=="completed").length;
  const [qOpen,setQOpen]=useState(false);
  const [refreshing,setRefreshing]=useState(false);
  const handleRefresh=async()=>{if(!onRefresh||refreshing)return;setRefreshing(true);try{await onRefresh();}finally{setRefreshing(false);}};
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
  const today=new Date().getDay();
  const todayIdx=today>=1&&today<=5?today-1:-1;
  const [hover,setHover]=useState(null);
  const gap=mob?3:5;
  const Cell=({co,n,pi,di})=>{
    const hk=`${pi}-${di}`;const isHov=hover===hk;const isToday=di===todayIdx;
    if(!co)return <div style={{borderRadius:mob?8:10,background:isToday?`${T.accent}06`:`${T.bg2}80`,minHeight:80,border:`1px solid ${isToday?`${T.accent}15`:T.bd}`}}/>;
    return(
      <div onClick={()=>{setCid(co.id);setCh("timeline");setView("course");}}
        onMouseEnter={()=>setHover(hk)} onMouseLeave={()=>setHover(null)}
        style={{borderRadius:mob?8:10,minHeight:80,cursor:"pointer",position:"relative",overflow:"hidden",
          background:`linear-gradient(135deg, ${co.col}${isHov?"30":"18"}, ${co.col}${isHov?"15":"08"})`,
          border:`1.5px solid ${co.col}${isHov?"60":"30"}`,
          transition:"all .2s ease",transform:isHov?"scale(1.02)":"scale(1)"}}>
        <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:co.col,borderRadius:"10px 10px 0 0"}}/>
        <div style={{padding:mob?"6px 6px 5px":"10px 10px 8px",display:"flex",flexDirection:"column",height:"100%",justifyContent:"center"}}>
          <div style={{fontWeight:800,color:co.col,fontSize:mob?9:13,letterSpacing:.5,lineHeight:1}}>{mob?co.code.split(".")[1]:co.code}</div>
          <div style={{fontSize:mob?8:12,color:T.txH,marginTop:mob?2:4,lineHeight:1.3,fontWeight:600,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{co.name}</div>
          <div style={{fontSize:mob?8:10,color:T.txD,marginTop:mob?2:4,display:"flex",alignItems:"center",gap:3,opacity:.8}}>
            <svg width={mob?7:9} height={mob?7:9} viewBox="0 0 24 24" fill={T.txD} stroke="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/></svg>
            <span>{co.room}</span>
          </div>
        </div>
        {n>0&&<div style={{position:"absolute",top:mob?3:6,right:mob?3:6,minWidth:mob?15:20,height:mob?15:20,borderRadius:10,background:T.red,color:"#fff",fontSize:mob?8:10,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 4px",boxShadow:`0 2px 6px ${T.red}60`}}>{n}</div>}
      </div>);
  };
  /* --- mobile: grid (rows=periods, cols=days) with vertical scroll --- */
  if(mob){
    return(<>
      <header style={{display:"flex",alignItems:"center",gap:8,padding:"0 12px",height:46,borderBottom:`1px solid ${T.bd}`,flexShrink:0,background:T.bg2}}>
        <h1 style={{flex:1,margin:0,fontSize:16,fontWeight:700,color:T.txH,display:"flex",alignItems:"center",gap:6}}>時間割 <QDrop/></h1>
        <RefreshBtn/>
      </header>
      <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:8}}>
        <div style={{display:"grid",gridTemplateColumns:"32px repeat(5,1fr)",gap:2}}>
          <div/>
          {days.map((d,i)=>{const isT=i===todayIdx;return(
            <div key={d} style={{display:"flex",alignItems:"center",justifyContent:"center",borderRadius:6,
              background:isT?T.accent:"transparent",padding:"4px 0"}}>
              <span style={{fontWeight:800,fontSize:12,color:isT?"#fff":T.txH}}>{d}</span>
            </div>);
          })}
          {pds.map((p,pi)=><React.Fragment key={`r${pi}`}>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:1}}>
              <span style={{fontWeight:700,fontSize:10,color:T.txH}}>{pdLabel[pi]}</span>
              <span style={{fontSize:7,color:T.txD,marginTop:1,lineHeight:1.2,whiteSpace:"nowrap",textAlign:"center"}}>{pdTimes[pi].split("–")[0]}</span>
              <span style={{fontSize:6,color:T.txD,lineHeight:1}}>~</span>
              <span style={{fontSize:7,color:T.txD,lineHeight:1.2,whiteSpace:"nowrap",textAlign:"center"}}>{pdTimes[pi].split("–")[1]}</span>
            </div>
            {days.map((_,di)=>{const co=curTT[pi]?.[di];const n=co?cnt(co.id):0;const isT=di===todayIdx;
              if(!co)return <div key={`${pi}-${di}`} style={{borderRadius:6,background:isT?`${T.accent}06`:`${T.bg2}50`,minHeight:68}}/>;
              return(
                <div key={`${pi}-${di}`} onClick={()=>{setCid(co.id);setCh("timeline");setView("course");}}
                  style={{borderRadius:6,minHeight:68,cursor:"pointer",position:"relative",overflow:"hidden",
                    background:`linear-gradient(135deg, ${co.col}18, ${co.col}08)`,
                    border:`1.5px solid ${co.col}30`}}>
                  <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:co.col,borderRadius:"8px 8px 0 0"}}/>
                  <div style={{padding:"6px 5px 5px",display:"flex",flexDirection:"column",height:"100%",justifyContent:"center"}}>
                    <div style={{fontWeight:800,color:co.col,fontSize:9,letterSpacing:.3,lineHeight:1}}>{co.code.split(".")[1]}</div>
                    <div style={{fontSize:9,color:T.txH,marginTop:2,lineHeight:1.25,fontWeight:600,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{co.name}</div>
                    <div style={{fontSize:8,color:T.txD,marginTop:2,display:"flex",alignItems:"center",gap:2}}>
                      <svg width="7" height="7" viewBox="0 0 24 24" fill={T.txD} stroke="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/></svg>
                      {co.room}
                    </div>
                  </div>
                  {n>0&&<div style={{position:"absolute",top:2,right:2,minWidth:14,height:14,borderRadius:7,background:T.red,color:"#fff",fontSize:8,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px",boxShadow:`0 2px 6px ${T.red}60`}}>{n}</div>}
                </div>);
            })}
          </React.Fragment>)}
        </div>
        <div style={{marginTop:14}}>
          <div style={{fontSize:13,fontWeight:700,color:T.txH,marginBottom:6}}>履修科目</div>
          {curC.map(co=>{const n=cnt(co.id);return(
            <div key={co.id} onClick={()=>{setCid(co.id);setCh("timeline");setView("course");}}
              style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:8,background:T.bg2,border:`1px solid ${T.bd}`,marginBottom:4,cursor:"pointer"}}>
              <div style={{width:6,height:6,borderRadius:3,background:co.col,flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:600,color:T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{co.name}</div>
                <div style={{fontSize:10,color:T.txD}}>{co.code} · {co.per} · {co.room}</div>
              </div>
              {n>0&&<span style={{fontSize:10,fontWeight:700,color:T.red}}>{n}件</span>}
            </div>
          );})}
        </div>
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
          </div>
          <span style={{fontSize:12,color:T.txD}}>2025年度 · {curC.length}科目 · {curC.length*2}単位</span>
        </div>
        <RefreshBtn/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:`52px repeat(5,1fr)`,gridTemplateRows:"44px repeat(5,1fr)",gap:gap}}>
        <div/>
        {days.map((d,i)=>{const isT=i===todayIdx;return(
          <div key={d} style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",borderRadius:10,
            background:isT?T.accent:"transparent",padding:"6px 0"}}>
            <span style={{fontWeight:700,color:isT?"#fff":T.txH,fontSize:14}}>{d}</span>
            <span style={{fontSize:9,color:isT?"rgba(255,255,255,.7)":T.txD,marginTop:1}}>{daysFull[i].slice(0,3)}</span>
          </div>);
        })}
        {pds.map((p,pi)=><React.Fragment key={`r${pi}`}>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:4}}>
            <span style={{fontWeight:700,fontSize:13,color:T.txH}}>{pdLabel[pi]}</span>
            <span style={{fontSize:10,color:T.txD,marginTop:2,lineHeight:1,whiteSpace:"nowrap"}}>{pdTimes[pi].replace("–","~")}</span>
          </div>
          {days.map((_,di)=>{const co=curTT[pi]?.[di];const n=co?cnt(co.id):0;
            return <Cell key={`${pi}-${di}`} co={co} n={n} pi={pi} di={di}/>;
          })}
        </React.Fragment>)}
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
                <span>{co.per}</span><span>·</span><span>{co.room}</span>
              </div>
            </div>
            {n>0&&<div style={{padding:"4px 10px",borderRadius:12,background:`${T.red}15`,color:T.red,fontSize:11,fontWeight:700,flexShrink:0,border:`1px solid ${T.red}30`}}>課題 {n}</div>}
          </div>
        );})}
        </div>
      </div>
    </div>
  );
};

export const CSelect=({setCid,setView,setCh,courses=[],depts=[],setDid})=>{
  return(
    <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:12}}>
      {depts.length>0&&<>
        <div style={{fontSize:12,fontWeight:700,color:T.txD,marginBottom:6,letterSpacing:.3}}>学系</div>
        {depts.map(d=><div key={d.prefix} onClick={()=>{setDid?.(d.prefix);setCh("timeline");setView("dept");}} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:10,background:T.bg2,border:`1px solid ${T.bd}`,marginBottom:8,borderLeft:`3px solid ${d.col}`,cursor:"pointer"}}>
          <div style={{width:38,height:38,borderRadius:10,background:d.col,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:11,flexShrink:0}}>{d.prefix}</div>
          <div style={{flex:1}}><div style={{fontWeight:600,color:T.txH,fontSize:14}}>{d.name}</div></div>
          <span style={{color:T.txD,display:"flex"}}>{I.arr}</span>
        </div>)}
        <div style={{fontSize:12,fontWeight:700,color:T.txD,marginTop:8,marginBottom:6,letterSpacing:.3}}>コース</div>
      </>}
      {courses.map(co=><div key={co.id} onClick={()=>{setCid(co.id);setCh("timeline");setView("course");}} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:10,background:T.bg2,border:`1px solid ${T.bd}`,marginBottom:8,borderLeft:`3px solid ${co.col}`,cursor:"pointer"}}>
        <div style={{width:38,height:38,borderRadius:10,background:co.col,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:13,flexShrink:0}}>{co.code.slice(0,3)}</div>
        <div style={{flex:1}}><div style={{fontWeight:600,color:T.txH,fontSize:14}}>{co.name}</div><div style={{fontSize:12,color:T.txD}}>{co.code} · {co.per}</div></div>
        <span style={{color:T.txD,display:"flex"}}>{I.arr}</span>
      </div>)}
    </div>
  );
};
