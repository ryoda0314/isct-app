import React, { useState, useMemo, useCallback, useEffect } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { REQ_1Q, OPT_1Q, OPT_CATS, DAYS, PERIODS, PER_TIMES, slotLabel, slotKey } from "../registrationData.js";

const LS="reg1q";
const load=()=>{try{return JSON.parse(localStorage.getItem(LS))||{};}catch{return{};}};
const save=(d)=>{try{localStorage.setItem(LS,JSON.stringify(d));}catch{}};

// ── Main View ──────────────────────────────────────
export const RegView=({mob})=>{
  const [data,setData]=useState(()=>{
    const s=load();
    return {req:s.req||{},reqSec:s.reqSec||{},sci:s.sci||{},opt:s.opt||{},unit:s.unit||""};
  });
  const up=useCallback((fn)=>setData(prev=>{const next=fn(prev);save(next);return next;}),[]);

  const {req,reqSec,sci,opt,unit}=data;
  const [reqOpen,setReqOpen]=useState(true);
  const [optOpen,setOptOpen]=useState(true);
  const [search,setSearch]=useState("");
  const [catFilter,setCatFilter]=useState(null);
  const [slotPick,setSlotPick]=useState(null); // {courseId,course} for slot picker modal
  const [detailCourse,setDetailCourse]=useState(null);
  const [syllabusData,setSyllabusData]=useState(null);
  const [syllabusLoading,setSyllabusLoading]=useState(false);
  const [sectionData,setSectionData]=useState(null);
  const [secLoading,setSecLoading]=useState(true);

  // ── Fetch section data from DB (all courses) ──
  useEffect(()=>{
    const names=[...REQ_1Q.common,...REQ_1Q.science,...OPT_1Q].map(c=>c.name);
    fetch(`/api/data/reg-sections?year=2026&names=${encodeURIComponent(names.join(','))}`)
      .then(r=>r.json()).then(d=>{setSectionData(d.courses||{});setSecLoading(false);})
      .catch(()=>setSecLoading(false));
  },[]);

  // ── Convert DB slot to grid [day, period] ──
  const toGridSlot=(s)=>{
    const di={月:0,火:1,水:2,木:3,金:4}[s.day];
    const pi=Math.floor((s.period_start-1)/2);
    if(di==null||isNaN(pi)) return null;
    return [di,pi];
  };

  // ── Active courses ──
  const active=useMemo(()=>{
    const list=[];
    for(const c of REQ_1Q.common){
      const sl=req[c.id]||[];
      if(sl.length) list.push({...c,sel:sl,type:"req"});
    }
    for(const c of REQ_1Q.science){
      if(!sci[c.id]) continue;
      const sl=req[c.id]||[];
      if(sl.length) list.push({...c,sel:sl,type:"sci"});
    }
    for(const c of OPT_1Q){
      const sl=opt[c.id]||[];
      if(sl.length) list.push({...c,sel:sl,type:"opt"});
    }
    return list;
  },[req,sci,opt]);

  // ── Grid ──
  const grid=useMemo(()=>{
    const g=Array.from({length:5},()=>Array(5).fill(null));
    for(const c of active) for(const s of c.sel){
      const prev=g[s[1]][s[0]];
      if(prev) g[s[1]][s[0]]={...c,conflict:prev.name};
      else g[s[1]][s[0]]=c;
    }
    return g;
  },[active]);

  // ── Stats ──
  const courseCount=active.length;
  const creditSum=active.reduce((s,c)=>s+c.cr*(c.sel?.length||1)/(c.slots?.length||1)*((c.slots?.length||1)/(c.sel?.length||1)),0);
  // Simpler: just sum credits per unique course
  const credits=active.reduce((s,c)=>s+c.cr,0);
  const slotCount=active.reduce((s,c)=>s+(c.sel?.length||0),0);

  // ── Occupied set ──
  const occupied=useMemo(()=>{
    const set=new Set();
    for(const c of active) for(const s of c.sel) set.add(slotKey(s));
    return set;
  },[active]);

  // ── Occupied set excluding a specific course (for section conflict check) ──
  const occExcept=(excludeId)=>{
    const set=new Set();
    for(const c of active){if(c.id===excludeId)continue;for(const s of c.sel) set.add(slotKey(s));}
    return set;
  };

  // ── Toggle required slot (fallback when no section data) ──
  const togReq=(cid,slot)=>up(p=>{
    const cur=p.req[cid]||[];
    const k=slotKey(slot);
    const has=cur.some(s=>slotKey(s)===k);
    return {...p,req:{...p.req,[cid]:has?cur.filter(s=>slotKey(s)!==k):[...cur,slot]}};
  });

  // ── Select section for required course ──
  const selectReqSec=(cid,courseName,secName)=>up(p=>{
    const sections=sectionData?.[courseName]||[];
    const sec=sections.find(s=>s.section===secName);
    if(!sec) return p;
    const slots=sec.slots.map(toGridSlot).filter(Boolean);
    // Toggle: deselect if same section
    if((p.reqSec||{})[cid]===secName){
      const ns={...(p.reqSec||{})};delete ns[cid];
      return {...p,reqSec:ns,req:{...p.req,[cid]:[]}};
    }
    return {...p,reqSec:{...(p.reqSec||{}),[cid]:secName},req:{...p.req,[cid]:slots}};
  });

  // ── Apply unit number to all common required courses ──
  const applyUnit=(unitNum)=>{
    if(!sectionData||!unitNum) return;
    const n=String(parseInt(unitNum));
    const pad=n.padStart(2,'0');
    up(p=>{
      const nReq={...p.req},nSec={...(p.reqSec||{})};
      let matched=0;
      for(const c of REQ_1Q.common){
        const sections=sectionData[c.name]||[];
        const sec=sections.find(s=>s.section===n||s.section===pad||s.section===unitNum);
        if(sec){
          nReq[c.id]=sec.slots.map(toGridSlot).filter(Boolean);
          nSec[c.id]=sec.section;
          matched++;
        }
      }
      return {...p,req:nReq,reqSec:nSec,unit:unitNum};
    });
  };

  // ── Toggle science enabled ──
  const togSci=(cid)=>up(p=>{
    const off=p.sci[cid];
    const ns={...(p.reqSec||{})};if(off)delete ns[cid];
    return {...p,sci:{...p.sci,[cid]:!off},req:off?{...p.req,[cid]:[]}:p.req,reqSec:ns};
  });

  // ── Select section for optional course ──
  const selectOptSec=(cid,courseName,secName)=>up(p=>{
    const sections=sectionData?.[courseName]||[];
    const sec=sections.find(s=>s.section===secName);
    if(!sec) return p;
    const slots=sec.slots.map(toGridSlot).filter(Boolean);
    if((p.reqSec||{})[cid]===secName){
      const ns={...(p.reqSec||{})};delete ns[cid];
      const no={...p.opt};delete no[cid];
      return {...p,reqSec:ns,opt:no};
    }
    return {...p,reqSec:{...(p.reqSec||{}),[cid]:secName},opt:{...p.opt,[cid]:slots}};
  });

  // ── Add optional slot (fallback) ──
  const addOpt=(cid,slot)=>{
    up(p=>({...p,opt:{...p.opt,[cid]:[...(p.opt[cid]||[]),slot]}}));
    setSlotPick(null);
  };

  // ── Remove optional ──
  const rmOpt=(cid)=>up(p=>{
    const no={...p.opt};delete no[cid];
    const ns={...(p.reqSec||{})};delete ns[cid];
    return{...p,opt:no,reqSec:ns};
  });

  // ── Remove optional slot ──
  const rmOptSlot=(cid,slot)=>up(p=>{
    const cur=(p.opt[cid]||[]).filter(s=>slotKey(s)!==slotKey(slot));
    const next={...p.opt};
    if(cur.length) next[cid]=cur; else delete next[cid];
    const ns={...(p.reqSec||{})};if(!cur.length) delete ns[cid];
    return{...p,opt:next,reqSec:ns};
  });

  // ── Reset all ──
  const resetAll=()=>{if(confirm("すべての選択をリセットしますか？")){up(()=>({req:{},reqSec:{},sci:{},opt:{},unit:""}));}};

  // ── Syllabus fetch ──
  const fetchSyllabus=async(name)=>{
    setDetailCourse(name);setSyllabusLoading(true);setSyllabusData(null);
    try{
      const r=await fetch(`/api/data/syllabus-search?q=${encodeURIComponent(name)}&year=2026&quarter=1Q`);
      if(r.ok){const d=await r.json();setSyllabusData(d.courses||[]);}
      else setSyllabusData([]);
    }catch{setSyllabusData([]);}
    setSyllabusLoading(false);
  };

  // ── Filtered optional ──
  const filtered=useMemo(()=>{
    let list=OPT_1Q;
    if(catFilter) list=list.filter(c=>c.cat===catFilter);
    if(search){const q=search.toLowerCase();list=list.filter(c=>c.name.toLowerCase().includes(q)||(c.school||"").includes(q));}
    return list;
  },[search,catFilter]);

  // ── Styles ──
  const pad=mob?12:20;
  const cellW=mob?56:72;
  const cellH=mob?48:56;
  const hdrH=mob?24:28;

  // ── Grid cell ──
  const Cell=({c,d,p})=>{
    if(!c) return <div style={{width:cellW,height:cellH,background:T.bg3,borderRadius:6,border:`1px solid ${T.bd}`}}/>;
    const isConflict=!!c.conflict;
    return(
      <div onClick={()=>{ if(c.type==="opt"){if((reqSec||{})[c.id]) rmOpt(c.id); else rmOptSlot(c.id,[d,p]);} else fetchSyllabus(c.name); }}
        title={isConflict?`衝突: ${c.name} / ${c.conflict}`:c.name}
        style={{width:cellW,height:cellH,background:isConflict?`${T.red}20`:`${c.col}18`,borderRadius:6,
          border:`1.5px solid ${isConflict?T.red:c.col}`,cursor:"pointer",padding:3,overflow:"hidden",
          display:"flex",flexDirection:"column",justifyContent:"center",position:"relative"}}>
        {isConflict&&<div style={{position:"absolute",top:2,right:3,fontSize:8,color:T.red,fontWeight:700}}>!</div>}
        <div style={{fontSize:mob?8:9,fontWeight:700,color:c.col,lineHeight:1.2,
          overflow:"hidden",textOverflow:"ellipsis",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>
          {c.name}
        </div>
        {c.type==="opt"&&<div style={{fontSize:7,color:T.txD,marginTop:1}}>tap to remove</div>}
      </div>
    );
  };

  // ── Slot chip ──
  const Chip=({slot,selected,conflict,onClick,small})=>{
    const label=slotLabel(slot);
    const isBusy=conflict&&!selected;
    return(
      <button onClick={onClick} style={{padding:small?"2px 8px":"4px 12px",borderRadius:6,fontSize:small?10:12,fontWeight:selected?700:400,
        border:`1.5px solid ${selected?T.accent:isBusy?T.red+"60":T.bd}`,
        background:selected?`${T.accent}18`:isBusy?`${T.red}08`:T.bg3,
        color:selected?T.accent:isBusy?T.txD:T.txH,cursor:"pointer",whiteSpace:"nowrap",
        opacity:isBusy?.5:1,transition:"all .12s"}}>
        {label}
      </button>
    );
  };

  // ── Section header ──
  const SecHdr=({title,open,toggle,count,badge})=>(
    <button onClick={toggle} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"10px 0",
      border:"none",background:"transparent",cursor:"pointer",borderBottom:`1px solid ${T.bd}`}}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.txD} strokeWidth="2.5"
        style={{transform:open?"rotate(90deg)":"none",transition:"transform .15s"}}>
        <path d="M9 18l6-6-6-6"/>
      </svg>
      <span style={{fontSize:14,fontWeight:700,color:T.txH,flex:1,textAlign:"left"}}>{title}</span>
      {badge!=null&&<span style={{fontSize:11,color:T.txD}}>{badge}</span>}
    </button>
  );

  // ── Course row (required) ──
  const ReqRow=({c,isScience})=>{
    const enabled=isScience?!!sci[c.id]:true;
    const selSlots=req[c.id]||[];
    const selSec=(reqSec||{})[c.id];
    const courseSections=sectionData?.[c.name]||[];
    const hasSections=!secLoading&&courseSections.length>0;
    const otherOcc=hasSections?occExcept(c.id):null;
    return(
      <div style={{padding:"10px 0",borderBottom:`1px solid ${T.bd}08`}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
          {isScience&&<button onClick={()=>togSci(c.id)} style={{width:20,height:20,borderRadius:4,
            border:`1.5px solid ${enabled?T.accent:T.bd}`,background:enabled?T.accent:"transparent",
            cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            {enabled&&<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
          </button>}
          <div style={{width:6,height:6,borderRadius:3,background:c.col,flexShrink:0}}/>
          <span style={{fontSize:13,fontWeight:600,color:enabled?T.txH:T.txD,flex:1}}>{c.name}</span>
          <span style={{fontSize:11,color:T.txD}}>{c.cr}単位</span>
          <button onClick={()=>fetchSyllabus(c.name)} style={{background:"none",border:"none",cursor:"pointer",color:T.txD,display:"flex",padding:2}}
            title="シラバスを検索">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </button>
        </div>
        {enabled&&(hasSections?(
          <div style={{paddingLeft:isScience?28:14}}>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {courseSections.map(sec=>{
                const isSel=selSec===sec.section;
                const conflict=!isSel&&otherOcc&&sec.slots.some(s=>{const g=toGridSlot(s);return g&&otherOcc.has(slotKey(g));});
                const slotsLabel=sec.slots.map(s=>`${s.day}${s.period_start}-${s.period_end}限`).join(' · ');
                return(
                  <button key={sec.section||'_default'} onClick={()=>selectReqSec(c.id,c.name,sec.section)}
                    style={{padding:"5px 12px",borderRadius:8,fontSize:12,fontWeight:isSel?700:400,
                      border:`1.5px solid ${isSel?T.accent:conflict?T.orange+'60':T.bd}`,
                      background:isSel?`${T.accent}18`:conflict?`${T.orange}08`:T.bg3,
                      color:isSel?T.accent:conflict?T.orange:T.txH,cursor:"pointer",textAlign:"left",
                      opacity:conflict&&!isSel?.6:1,transition:"all .12s"}}>
                    <div style={{fontWeight:600}}>{sec.section||"—"}</div>
                    <div style={{fontSize:9,color:isSel?T.accent:T.txD,marginTop:1,whiteSpace:"nowrap"}}>{slotsLabel}</div>
                  </button>
                );
              })}
            </div>
          </div>
        ):secLoading?(
          <div style={{paddingLeft:isScience?28:14,fontSize:11,color:T.txD}}>セクション読込中...</div>
        ):(
          <div style={{display:"flex",flexWrap:"wrap",gap:6,paddingLeft:isScience?28:14}}>
            {c.slots.map(s=>{
              const k=slotKey(s);
              const sel=selSlots.some(x=>slotKey(x)===k);
              const busy=!sel&&occupied.has(k);
              return <Chip key={k} slot={s} selected={sel} conflict={busy} onClick={()=>togReq(c.id,s)}/>;
            })}
          </div>
        ))}
      </div>
    );
  };

  // ── Optional course row ──
  const OptRow=({c})=>{
    const added=(opt[c.id]||[]).length>0;
    const selSec=(reqSec||{})[c.id];
    const courseSections=sectionData?.[c.name]||[];
    const hasSections=!secLoading&&courseSections.length>0;
    const otherOcc=hasSections?occExcept(c.id):null;
    return(
      <div style={{padding:"8px 0",borderBottom:`1px solid ${T.bd}08`}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:6,height:6,borderRadius:3,background:c.col,flexShrink:0}}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:12,fontWeight:500,color:T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name}</span>
              {c.school&&<span style={{fontSize:9,color:T.txD,background:T.bg3,padding:"1px 5px",borderRadius:4,whiteSpace:"nowrap"}}>{c.school}</span>}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:4,marginTop:2}}>
              <span style={{fontSize:10,color:T.txD}}>{c.cr}単位</span>
              {!hasSections&&<><span style={{fontSize:10,color:T.txD}}>·</span>
              <span style={{fontSize:10,color:T.txD}}>{c.slots.map(slotLabel).join(" / ")}</span></>}
            </div>
            {c.note&&<div style={{fontSize:9,color:T.orange,marginTop:1}}>{c.note}</div>}
          </div>
          {/* Fallback buttons when no section data */}
          {!hasSections&&(added?(
            <button onClick={()=>rmOpt(c.id)} style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${T.red}40`,
              background:`${T.red}10`,color:T.red,fontSize:11,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>
              削除
            </button>
          ):(
            <button onClick={()=>{
              if(c.slots.length===1){addOpt(c.id,c.slots[0]);}
              else setSlotPick({id:c.id,course:c});
            }} style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${T.accent}40`,
              background:`${T.accent}10`,color:T.accent,fontSize:11,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>
              追加
            </button>
          ))}
          <button onClick={()=>fetchSyllabus(c.name)} style={{background:"none",border:"none",cursor:"pointer",color:T.txD,display:"flex",padding:2}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </button>
        </div>
        {/* Section chips */}
        {hasSections&&<div style={{display:"flex",flexWrap:"wrap",gap:6,paddingLeft:14,marginTop:6}}>
          {courseSections.map(sec=>{
            const isSel=selSec===sec.section;
            const conflict=!isSel&&otherOcc&&sec.slots.some(s=>{const g=toGridSlot(s);return g&&otherOcc.has(slotKey(g));});
            const slotsLabel=sec.slots.map(s=>`${s.day}${s.period_start}-${s.period_end}限`).join(' · ');
            return(
              <button key={sec.section||'_default'} onClick={()=>selectOptSec(c.id,c.name,sec.section)}
                style={{padding:"5px 12px",borderRadius:8,fontSize:12,fontWeight:isSel?700:400,
                  border:`1.5px solid ${isSel?T.accent:conflict?T.orange+'60':T.bd}`,
                  background:isSel?`${T.accent}18`:conflict?`${T.orange}08`:T.bg3,
                  color:isSel?T.accent:conflict?T.orange:T.txH,cursor:"pointer",textAlign:"left",
                  opacity:conflict&&!isSel?.6:1,transition:"all .12s"}}>
                <div style={{fontWeight:600}}>{sec.section||"—"}</div>
                <div style={{fontSize:9,color:isSel?T.accent:T.txD,marginTop:1,whiteSpace:"nowrap"}}>{slotsLabel}</div>
              </button>
            );
          })}
        </div>}
      </div>
    );
  };

  // ── Render ──
  return(
    <div style={{flex:1,overflowY:"auto",background:T.bg,padding:`${pad}px`,fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,'Hiragino Sans','Segoe UI',sans-serif"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
        <div>
          <div style={{fontSize:mob?18:22,fontWeight:800,color:T.txH,letterSpacing:-.3}}>1Q 履修登録</div>
          <div style={{fontSize:12,color:T.txD,marginTop:2}}>100番台科目 · 2026年度</div>
        </div>
        <button onClick={resetAll} style={{padding:"5px 12px",borderRadius:8,border:`1px solid ${T.bd}`,
          background:T.bg3,color:T.txD,fontSize:11,cursor:"pointer"}}>リセット</button>
      </div>

      {/* Stats */}
      <div style={{display:"flex",gap:mob?8:12,marginBottom:16}}>
        {[
          {label:"科目数",value:courseCount,unit:"科目",col:T.accent},
          {label:"単位数",value:credits,unit:"単位",col:T.green},
          {label:"コマ数",value:slotCount,unit:"コマ",col:T.orange},
        ].map(s=>(
          <div key={s.label} style={{flex:1,padding:mob?"10px 8px":"12px 16px",borderRadius:12,
            background:`${s.col}08`,border:`1px solid ${s.col}20`}}>
            <div style={{fontSize:10,color:T.txD,marginBottom:2}}>{s.label}</div>
            <div style={{fontSize:mob?20:24,fontWeight:800,color:s.col}}>{s.value}<span style={{fontSize:11,fontWeight:400,color:T.txD,marginLeft:3}}>{s.unit}</span></div>
          </div>
        ))}
      </div>

      {/* Timetable Grid */}
      <div style={{background:T.bg2,borderRadius:14,border:`1px solid ${T.bd}`,padding:mob?8:12,marginBottom:16,overflowX:"auto"}}>
        <div style={{display:"inline-grid",gridTemplateColumns:`${mob?36:48}px repeat(5,${cellW}px)`,gap:mob?3:4,minWidth:"fit-content"}}>
          {/* Header row */}
          <div style={{height:hdrH}}/>
          {DAYS.map(d=>(
            <div key={d} style={{height:hdrH,display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:mob?11:13,fontWeight:700,color:T.txH}}>{d}</div>
          ))}
          {/* Grid rows */}
          {PERIODS.map((pd,pi)=><React.Fragment key={pi}>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
              fontSize:mob?8:9,color:T.txD,lineHeight:1.2,paddingRight:2}}>
              <div style={{fontWeight:600}}>{pd}</div>
              <div style={{fontSize:mob?7:8,opacity:.6}}>{PER_TIMES[pi]?.split("–")[0]}</div>
            </div>
            {DAYS.map((_,di)=><Cell key={di} c={grid[pi][di]} d={di} p={pi}/>)}
          </React.Fragment>)}
        </div>
      </div>

      {/* Required courses */}
      <div style={{background:T.bg2,borderRadius:14,border:`1px solid ${T.bd}`,padding:`4px ${mob?12:16}px`,marginBottom:16}}>
        <SecHdr title="必修科目のクラス設定" open={reqOpen} toggle={()=>setReqOpen(p=>!p)}
          badge={`${REQ_1Q.common.filter(c=>(req[c.id]||[]).length>0).length + REQ_1Q.science.filter(c=>sci[c.id]&&(req[c.id]||[]).length>0).length}科目設定済`}/>
        {reqOpen&&<div>
          {/* Unit bulk-set */}
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 0",borderBottom:`1px solid ${T.bd}08`}}>
            <span style={{fontSize:12,fontWeight:600,color:T.txH,whiteSpace:"nowrap"}}>ユニット番号</span>
            <input type="number" min="1" max="80" value={unit||""} onChange={e=>up(p=>({...p,unit:e.target.value}))}
              placeholder="例: 5" style={{width:60,padding:"5px 8px",borderRadius:6,border:`1px solid ${T.bd}`,
                background:T.bg3,color:T.txH,fontSize:12,outline:"none",textAlign:"center"}}/>
            <button onClick={()=>applyUnit(unit)} disabled={!unit||secLoading||!sectionData}
              style={{padding:"5px 14px",borderRadius:6,border:`1px solid ${T.accent}40`,
                background:`${T.accent}10`,color:T.accent,fontSize:11,fontWeight:600,cursor:!unit||secLoading?"default":"pointer",
                opacity:!unit||secLoading?.5:1,whiteSpace:"nowrap"}}>
              一括設定
            </button>
            {unit&&reqSec&&REQ_1Q.common.some(c=>reqSec[c.id])&&(
              <span style={{fontSize:10,color:T.green}}>
                {REQ_1Q.common.filter(c=>reqSec[c.id]).length}/{REQ_1Q.common.length}科目設定済
              </span>
            )}
          </div>
          <div style={{fontSize:10,fontWeight:700,color:T.txD,padding:"8px 0 4px",letterSpacing:.5}}>共通必修</div>
          {REQ_1Q.common.map(c=><ReqRow key={c.id} c={c}/>)}
          <div style={{fontSize:10,fontWeight:700,color:T.txD,padding:"12px 0 4px",letterSpacing:.5}}>理工系基礎（該当科目をチェック）</div>
          {REQ_1Q.science.map(c=><ReqRow key={c.id} c={c} isScience/>)}
        </div>}
      </div>

      {/* Optional courses */}
      <div style={{background:T.bg2,borderRadius:14,border:`1px solid ${T.bd}`,padding:`4px ${mob?12:16}px`,marginBottom:16}}>
        <SecHdr title="選択科目を追加" open={optOpen} toggle={()=>setOptOpen(p=>!p)}
          badge={`${Object.keys(opt).filter(k=>(opt[k]||[]).length>0).length}科目追加済`}/>
        {optOpen&&<div>
          {/* Search + filter */}
          <div style={{display:"flex",gap:8,padding:"8px 0",alignItems:"center",flexWrap:"wrap"}}>
            <div style={{position:"relative",flex:1,minWidth:150}}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="科目名で検索..."
                style={{width:"100%",padding:"7px 10px 7px 30px",borderRadius:8,border:`1px solid ${T.bd}`,
                  background:T.bg3,color:T.txH,fontSize:12,outline:"none"}}/>
              <span style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",color:T.txD,display:"flex"}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </span>
            </div>
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
              <button onClick={()=>setCatFilter(null)}
                style={{padding:"3px 8px",borderRadius:6,border:`1px solid ${!catFilter?T.accent:T.bd}`,
                  background:!catFilter?`${T.accent}14`:T.bg3,color:!catFilter?T.accent:T.txD,fontSize:10,cursor:"pointer"}}>
                すべて
              </button>
              {OPT_CATS.map(cat=>(
                <button key={cat} onClick={()=>setCatFilter(catFilter===cat?null:cat)}
                  style={{padding:"3px 8px",borderRadius:6,border:`1px solid ${catFilter===cat?T.accent:T.bd}`,
                    background:catFilter===cat?`${T.accent}14`:T.bg3,color:catFilter===cat?T.accent:T.txD,fontSize:10,cursor:"pointer"}}>
                  {cat}
                </button>
              ))}
            </div>
          </div>
          {/* Course list */}
          <div>
            {filtered.map(c=><OptRow key={c.id} c={c}/>)}
            {filtered.length===0&&<div style={{padding:16,textAlign:"center",fontSize:12,color:T.txD}}>該当する科目がありません</div>}
          </div>
        </div>}
      </div>

      {/* Slot picker modal */}
      {slotPick&&<>
        <div onClick={()=>setSlotPick(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:998}}/>
        <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",
          width:mob?280:320,background:T.bg2,border:`1px solid ${T.bdL}`,borderRadius:16,padding:20,zIndex:999,
          boxShadow:"0 20px 60px rgba(0,0,0,.5)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <span style={{fontWeight:700,color:T.txH,fontSize:14}}>{slotPick.course.name}</span>
            <button onClick={()=>setSlotPick(null)} style={{background:"none",border:"none",color:T.txD,cursor:"pointer"}}>{I.x}</button>
          </div>
          <div style={{fontSize:12,color:T.txD,marginBottom:12}}>配置する時間帯を選択</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {slotPick.course.slots.map(s=>{
              const k=slotKey(s);
              const busy=occupied.has(k);
              const already=(opt[slotPick.id]||[]).some(x=>slotKey(x)===k);
              return(
                <button key={k} disabled={already} onClick={()=>addOpt(slotPick.id,s)}
                  style={{padding:"10px 14px",borderRadius:8,border:`1px solid ${busy?T.orange:T.bd}`,
                    background:already?`${T.accent}14`:busy?`${T.orange}08`:T.bg3,
                    color:already?T.accent:busy?T.orange:T.txH,fontSize:13,fontWeight:500,cursor:already?"default":"pointer",
                    textAlign:"left",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span>{slotLabel(s)}<span style={{fontSize:10,color:T.txD,marginLeft:6}}>{PER_TIMES[s[1]]}</span></span>
                  {already&&<span style={{fontSize:10,color:T.accent}}>追加済</span>}
                  {busy&&!already&&<span style={{fontSize:10,color:T.orange}}>衝突あり</span>}
                </button>
              );
            })}
          </div>
        </div>
      </>}

      {/* Syllabus detail modal */}
      {detailCourse&&<>
        <div onClick={()=>{setDetailCourse(null);setSyllabusData(null);}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:998}}/>
        <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",
          width:mob?"90vw":420,maxHeight:"70vh",background:T.bg2,border:`1px solid ${T.bdL}`,borderRadius:16,padding:20,zIndex:999,
          boxShadow:"0 20px 60px rgba(0,0,0,.5)",overflowY:"auto"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <span style={{fontWeight:700,color:T.txH,fontSize:15}}>{detailCourse}</span>
            <button onClick={()=>{setDetailCourse(null);setSyllabusData(null);}} style={{background:"none",border:"none",color:T.txD,cursor:"pointer"}}>{I.x}</button>
          </div>
          {syllabusLoading&&<div style={{padding:20,textAlign:"center"}}><span style={{fontSize:12,color:T.txD}}>シラバス検索中...</span></div>}
          {syllabusData&&syllabusData.length===0&&<div style={{padding:20,textAlign:"center",fontSize:12,color:T.txD}}>シラバスDBに該当データがありません</div>}
          {syllabusData&&syllabusData.length>0&&<div style={{display:"flex",flexDirection:"column",gap:8}}>
            {syllabusData.map((c,i)=>(
              <div key={i} style={{padding:10,borderRadius:10,border:`1px solid ${T.bd}`,background:T.bg3}}>
                <div style={{fontSize:13,fontWeight:600,color:T.txH}}>{c.name||detailCourse}</div>
                <div style={{fontSize:11,color:T.txD,marginTop:2}}>{c.code} · {c.teacher||"—"}</div>
                {c.per&&<div style={{fontSize:11,color:T.tx,marginTop:2}}>{c.day}{c.per} · {c.room||"—"}</div>}
                {c.quarter&&<div style={{fontSize:10,color:T.txD,marginTop:2}}>{c.quarter}</div>}
                {c.syllabus_url&&<a href={c.syllabus_url} target="_blank" rel="noopener noreferrer"
                  style={{display:"inline-flex",alignItems:"center",gap:4,marginTop:6,padding:"4px 10px",borderRadius:6,
                    background:`${T.accent}14`,color:T.accent,fontSize:11,fontWeight:600,textDecoration:"none",border:`1px solid ${T.accent}30`}}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  シラバスを開く
                </a>}
              </div>
            ))}
          </div>}
        </div>
      </>}

      {/* Footer note */}
      <div style={{fontSize:10,color:T.txD,textAlign:"center",padding:"8px 0 24px",lineHeight:1.6}}>
        自分のセクション（クラス）を選択すると時間割が自動設定されます<br/>
        時間割データは自動保存されます
      </div>
    </div>
  );
};
