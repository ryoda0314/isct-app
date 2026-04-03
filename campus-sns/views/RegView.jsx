import React, { useState, useMemo, useCallback, useEffect } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { REQ_1Q, REQ_2Q, CAT_COLORS, UNIT_OPT, LAB_OPT, SCHOOLS, SHARED_DEPTS, DEPT_LABELS, DAYS, PERIODS, PER_TIMES, slotLabel, slotKey, unitToSection, unitToLabDay } from "../registrationData.js";

// Per-quarter localStorage (includes year level: "reg_1_1Q", "reg_2_1Q", etc.)
const lsKey=(yr,q)=>`reg_${yr}_${q}`;
const loadQ=(yr,q)=>{try{return JSON.parse(localStorage.getItem(lsKey(yr,q)))||{};}catch{return{};}};
const saveQ=(yr,q,d)=>{try{localStorage.setItem(lsKey(yr,q),JSON.stringify(d));}catch{}};
// Migration: old keys → new
(function migrate(){try{
  for(const oq of["1Q","2Q"]){const old=localStorage.getItem(`reg_${oq}`);if(old&&!localStorage.getItem(`reg_1_${oq}`)){localStorage.setItem(`reg_1_${oq}`,old);localStorage.removeItem(`reg_${oq}`);}}
  const old1q=localStorage.getItem("reg1q");if(old1q&&!localStorage.getItem("reg_1_1Q")){localStorage.setItem("reg_1_1Q",old1q);localStorage.removeItem("reg1q");}
}catch{}})();

const initQ=(yr,q)=>{const s=loadQ(yr,q);return{req:s.req||{},reqSec:s.reqSec||{},sci:s.sci||{},opt:s.opt||{},optInfo:s.optInfo||{},unit:s.unit||""};};

const YEAR_LABELS=["1年 (100番台)","2年 (200番台)","3年 (300番台)","4年 (400番台)"];

// ── Main View ──────────────────────────────────────
export const RegView=({mob})=>{
  const [yearLevel,setYearLevel]=useState(1);
  const [quarter,setQuarter]=useState("1Q");
  const [data,setData]=useState(()=>initQ(1,"1Q"));
  const curReq=yearLevel===1?(quarter==="1Q"?REQ_1Q:REQ_2Q):null;

  // DB state
  const [sectionData,setSectionData]=useState(null);
  const [secLoading,setSecLoading]=useState(true);
  const [dbCats,setDbCats]=useState([]);
  const [dbLoading,setDbLoading]=useState(true);

  // Department filter (for 2+ year)
  const [selSchool,setSelSchool]=useState(null); // school key
  const [selDepts,setSelDepts]=useState([]); // selected dept prefixes

  // UI state
  const [reqOpen,setReqOpen]=useState(true);
  const [optOpen,setOptOpen]=useState(true);
  const [openCats,setOpenCats]=useState({});
  const [search,setSearch]=useState("");
  const [detailCourse,setDetailCourse]=useState(null);
  const [syllabusData,setSyllabusData]=useState(null);
  const [syllabusLoading,setSyllabusLoading]=useState(false);

  // Derived
  const level=String(yearLevel);
  const deptParam=selDepts.length>0?selDepts.join(','):'';

  // Save & switch
  const switchState=(yr,q)=>{
    saveQ(yearLevel,quarter,data);
    setData(initQ(yr,q));
    setYearLevel(yr);setQuarter(q);
    setSectionData(null);setSecLoading(true);
    setDbCats([]);setDbLoading(true);
    setOpenCats({});setSearch("");
  };
  const switchYear=(yr)=>{if(yr!==yearLevel)switchState(yr,quarter);};
  const switchQ=(q)=>{if(q!==quarter)switchState(yearLevel,q);};

  const up=useCallback((fn)=>setData(prev=>{const next=fn(prev);saveQ(yearLevel,quarter,next);return next;}),[yearLevel,quarter]);

  const {req,reqSec,sci,opt,optInfo,unit}=data;

  // ── Fetch required sections from DB (1年 only) ──
  useEffect(()=>{
    if(yearLevel!==1){setSecLoading(false);setSectionData(null);return;}
    setSecLoading(true);
    const names=[...curReq.common,...curReq.science].map(c=>c.name);
    fetch(`/api/data/reg-sections?year=2026&quarter=${quarter}&names=${encodeURIComponent(names.join(','))}`)
      .then(r=>r.json()).then(d=>{setSectionData(d.courses||{});setSecLoading(false);})
      .catch(()=>setSecLoading(false));
  },[quarter,yearLevel]);

  // ── Fetch courses from DB (categorized) ──
  useEffect(()=>{
    setDbLoading(true);
    let excludeNames='';
    if(yearLevel===1&&curReq){
      excludeNames=[...curReq.common,...curReq.science].map(c=>c.name).join(',');
    }
    const params=new URLSearchParams({year:'2026',quarter,level});
    if(excludeNames) params.set('exclude',excludeNames);
    if(yearLevel>=2&&deptParam) params.set('dept',deptParam);
    fetch(`/api/data/reg-courses?${params}`)
      .then(r=>r.json()).then(d=>{setDbCats(d.categories||[]);setDbLoading(false);})
      .catch(()=>{setDbCats([]);setDbLoading(false);});
  },[quarter,yearLevel,level,deptParam]);

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
    if(yearLevel===1&&curReq){
      for(const c of curReq.common){
        const sl=req[c.id]||[];
        if(sl.length) list.push({...c,sel:sl,type:"req"});
      }
      for(const c of curReq.science){
        if(!sci[c.id]) continue;
        const sl=req[c.id]||[];
        if(sl.length) list.push({...c,sel:sl,type:"sci"});
      }
    }
    for(const [code,slots] of Object.entries(opt)){
      if(!slots||!slots.length) continue;
      const info=optInfo[code]||{};
      list.push({id:code,name:info.name||code,cr:info.cr||0,col:CAT_COLORS[info.cat]||'#6b7280',sel:slots,type:"opt"});
    }
    return list;
  },[req,sci,opt,optInfo,quarter,yearLevel]);

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

  const credits=active.reduce((s,c)=>s+c.cr,0);
  const slotCount=active.reduce((s,c)=>s+(c.sel?.length||0),0);

  const occupied=useMemo(()=>{
    const set=new Set();
    for(const c of active) for(const s of c.sel) set.add(slotKey(s));
    return set;
  },[active]);

  const occExcept=(excludeId)=>{
    const set=new Set();
    for(const c of active){if(c.id===excludeId)continue;for(const s of c.sel) set.add(slotKey(s));}
    return set;
  };

  const togReq=(cid,slot)=>up(p=>{
    const cur=p.req[cid]||[];
    const k=slotKey(slot);
    const has=cur.some(s=>slotKey(s)===k);
    return {...p,req:{...p.req,[cid]:has?cur.filter(s=>slotKey(s)!==k):[...cur,slot]}};
  });

  const selectReqSec=(cid,courseName,secName)=>up(p=>{
    const sections=sectionData?.[courseName]||[];
    const sec=sections.find(s=>s.section===secName);
    if(!sec) return p;
    const slots=sec.slots.map(toGridSlot).filter(Boolean);
    if((p.reqSec||{})[cid]===secName){
      const ns={...(p.reqSec||{})};delete ns[cid];
      return {...p,reqSec:ns,req:{...p.req,[cid]:[]}};
    }
    return {...p,reqSec:{...(p.reqSec||{}),[cid]:secName},req:{...p.req,[cid]:slots}};
  });

  const selectOptSec=(code,courseName,cat,cr,secObj)=>up(p=>{
    const slots=secObj.slots.map(toGridSlot).filter(Boolean);
    if((p.reqSec||{})[code]===secObj.section){
      const ns={...(p.reqSec||{})};delete ns[code];
      const no={...p.opt};delete no[code];
      const ni={...p.optInfo};delete ni[code];
      return {...p,reqSec:ns,opt:no,optInfo:ni};
    }
    return {
      ...p,
      reqSec:{...(p.reqSec||{}),[code]:secObj.section},
      opt:{...p.opt,[code]:slots},
      optInfo:{...(p.optInfo||{}),[code]:{name:courseName,cat,cr}},
    };
  });

  const rmOpt=(code)=>up(p=>{
    const no={...p.opt};delete no[code];
    const ns={...(p.reqSec||{})};delete ns[code];
    const ni={...(p.optInfo||{})};delete ni[code];
    return{...p,opt:no,reqSec:ns,optInfo:ni};
  });

  // ── Apply unit number (1年 only) ──
  const applyUnit=(unitNum)=>{
    if(!sectionData||!unitNum||yearLevel!==1) return;
    const num=parseInt(unitNum);
    if(!num||num<1||num>80) return;
    up(p=>{
      const nReq={...p.req},nSec={...(p.reqSec||{})},nSci={...p.sci},nOpt={...p.opt},nOptInfo={...(p.optInfo||{})};
      const secMatchNum=(secName,mn)=>{
        const s=String(mn),pad=s.padStart(2,'0');
        if(secName===s||secName===pad) return true;
        const m=secName.match(/\((\d+)[~～\-](\d+)\)/);
        return m&&mn>=parseInt(m[1])&&mn<=parseInt(m[2]);
      };
      for(const c of curReq.common){
        const sections=sectionData[c.name]||[];
        const mn=(c.id==='risshi'||c.id==='eng1'||c.id==='eng2')?Math.ceil(num/2):num;
        const sec=sections.find(s=>secMatchNum(s.section,mn));
        if(sec){ nReq[c.id]=sec.slots.map(toGridSlot).filter(Boolean); nSec[c.id]=sec.section; }
      }
      for(const c of curReq.science){
        const letter=unitToSection(c.id,num);
        if(letter){
          const sections=sectionData[c.name]||[];
          const sec=sections.find(s=>s.section===letter);
          if(sec){
            const slots=sec.slots.map(toGridSlot).filter(Boolean);
            if(slots.length){ nSci[c.id]=true; nReq[c.id]=slots; nSec[c.id]=letter; }
          }
        }
      }
      for(const cat of dbCats){
        for(const course of cat.courses){
          const mapId=UNIT_OPT[course.code];
          if(mapId){
            const letter=unitToSection(mapId,num);
            if(letter){
              const sec=course.sections.find(s=>s.section===letter);
              if(sec){
                const slots=sec.slots.map(toGridSlot).filter(Boolean);
                if(slots.length){ nOpt[course.code]=slots; nSec[course.code]=sec.section; nOptInfo[course.code]={name:course.name,cat:cat.name,cr:1}; }
              }
            }
          }
          if(LAB_OPT.includes(course.code)){
            const day=unitToLabDay(num);
            if(day){
              const sec=course.sections.find(s=>s.slots.some(sl=>sl.day===day));
              if(sec){
                const slots=sec.slots.map(toGridSlot).filter(Boolean);
                if(slots.length){ nOpt[course.code]=slots; nSec[course.code]=sec.section; nOptInfo[course.code]={name:course.name,cat:cat.name,cr:1}; }
              }
            }
          }
        }
      }
      return {...p,req:nReq,reqSec:nSec,sci:nSci,opt:nOpt,optInfo:nOptInfo,unit:unitNum};
    });
  };

  const togSci=(cid)=>up(p=>{
    const off=p.sci[cid];
    const ns={...(p.reqSec||{})};if(off)delete ns[cid];
    return {...p,sci:{...p.sci,[cid]:!off},req:off?{...p.req,[cid]:[]}:p.req,reqSec:ns};
  });

  const resetAll=()=>{if(confirm("このクオーターの選択をリセットしますか？")){up(()=>({req:{},reqSec:{},sci:{},opt:{},optInfo:{},unit:data.unit}));}};

  const fetchSyllabus=async(name)=>{
    setDetailCourse(name);setSyllabusLoading(true);setSyllabusData(null);
    try{
      const r=await fetch(`/api/data/syllabus-search?q=${encodeURIComponent(name)}&year=2026&quarter=${quarter}`);
      if(r.ok){const d=await r.json();setSyllabusData(d.courses||[]);}
      else setSyllabusData([]);
    }catch{setSyllabusData([]);}
    setSyllabusLoading(false);
  };

  const filteredCats=useMemo(()=>{
    if(!search) return dbCats;
    const q=search.toLowerCase();
    return dbCats.map(cat=>{
      const courses=cat.courses.filter(c=>c.name.toLowerCase().includes(q)||c.code.toLowerCase().includes(q));
      return courses.length?{...cat,courses}:null;
    }).filter(Boolean);
  },[dbCats,search]);

  const toggleCat=(catName)=>setOpenCats(p=>({...p,[catName]:!p[catName]}));

  // School select handler
  const curSchool=SCHOOLS.find(s=>s.key===selSchool);
  const handleSchool=(schoolKey)=>{
    if(selSchool===schoolKey){setSelSchool(null);setSelDepts([]);return;}
    const school=SCHOOLS.find(s=>s.key===schoolKey);
    setSelSchool(schoolKey);
    // Default: all depts in this school + shared
    setSelDepts(school?[...school.depts,...SHARED_DEPTS]:[]);
  };
  const toggleDept=(deptCode)=>{
    setSelDepts(prev=>{
      const isShared=SHARED_DEPTS.includes(deptCode);
      if(isShared) return prev; // shared always included
      if(prev.includes(deptCode)) return prev.filter(d=>d!==deptCode);
      return [...prev,deptCode];
    });
  };

  // ── Styles ──
  const pd=mob?12:20;
  const cellW=mob?56:72;
  const cellH=mob?48:56;
  const hdrH=mob?24:28;

  const Cell=({c,d,p})=>{
    if(!c) return <div style={{width:cellW,height:cellH,background:T.bg3,borderRadius:6,border:`1px solid ${T.bd}`}}/>;
    const isConflict=!!c.conflict;
    return(
      <div onClick={()=>{ if(c.type==="opt") rmOpt(c.id); else fetchSyllabus(c.name); }}
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

  const SecHdr=({title,open,toggle,badge})=>(
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
              return(
                <button key={k} onClick={()=>togReq(c.id,s)}
                  style={{padding:"4px 12px",borderRadius:6,fontSize:12,fontWeight:sel?700:400,
                    border:`1.5px solid ${sel?T.accent:busy?T.red+"60":T.bd}`,
                    background:sel?`${T.accent}18`:busy?`${T.red}08`:T.bg3,
                    color:sel?T.accent:busy?T.txD:T.txH,cursor:"pointer",whiteSpace:"nowrap",
                    opacity:busy?.5:1,transition:"all .12s"}}>
                  {slotLabel(s)}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  const DbOptRow=({course,catName})=>{
    const code=course.code;
    const isAdded=!!(opt[code]&&opt[code].length>0);
    const selSec=(reqSec||{})[code];
    const otherOcc=occExcept(code);
    const catCol=CAT_COLORS[catName]||'#6b7280';
    return(
      <div style={{padding:"8px 0",borderBottom:`1px solid ${T.bd}08`}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
          <div style={{width:6,height:6,borderRadius:3,background:catCol,flexShrink:0}}/>
          <span style={{fontSize:12,fontWeight:isAdded?600:500,color:isAdded?T.txH:T.tx,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {course.name}
          </span>
          <span style={{fontSize:9,color:T.txD,background:T.bg3,padding:"1px 5px",borderRadius:4,whiteSpace:"nowrap",flexShrink:0}}>{course.code}</span>
          {isAdded&&<button onClick={()=>rmOpt(code)}
            style={{padding:"3px 8px",borderRadius:6,border:`1px solid ${T.red}40`,
              background:`${T.red}10`,color:T.red,fontSize:10,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>
            削除
          </button>}
          <button onClick={()=>fetchSyllabus(course.name)} style={{background:"none",border:"none",cursor:"pointer",color:T.txD,display:"flex",padding:2,flexShrink:0}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </button>
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:5,paddingLeft:14}}>
          {course.sections.map(sec=>{
            const isSel=selSec===sec.section;
            const conflict=!isSel&&sec.slots.some(s=>{const g=toGridSlot(s);return g&&otherOcc.has(slotKey(g));});
            const slotsLabel=sec.slots.map(s=>`${s.day}${s.period_start}-${s.period_end}限`).join(' · ');
            return(
              <button key={sec.section||'_default'} onClick={()=>selectOptSec(code,course.name,catName,1,sec)}
                style={{padding:"4px 10px",borderRadius:8,fontSize:11,fontWeight:isSel?700:400,
                  border:`1.5px solid ${isSel?T.accent:conflict?T.orange+'60':T.bd}`,
                  background:isSel?`${T.accent}18`:conflict?`${T.orange}08`:T.bg3,
                  color:isSel?T.accent:conflict?T.orange:T.txH,cursor:"pointer",textAlign:"left",
                  opacity:conflict&&!isSel?.6:1,transition:"all .12s"}}>
                <div style={{fontWeight:600,fontSize:11}}>{sec.section||"—"}</div>
                <div style={{fontSize:8,color:isSel?T.accent:T.txD,marginTop:1,whiteSpace:"nowrap"}}>{slotsLabel}</div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // ── Render ──
  return(
    <div style={{flex:1,overflowY:"auto",background:T.bg,padding:`${pd}px`,fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,'Hiragino Sans','Segoe UI',sans-serif"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <div>
          <div style={{fontSize:mob?18:22,fontWeight:800,color:T.txH,letterSpacing:-.3}}>履修登録</div>
          <div style={{fontSize:12,color:T.txD,marginTop:2}}>2026年度</div>
        </div>
        <button onClick={resetAll} style={{padding:"5px 12px",borderRadius:8,border:`1px solid ${T.bd}`,
          background:T.bg3,color:T.txD,fontSize:11,cursor:"pointer"}}>リセット</button>
      </div>

      {/* Year level tabs */}
      <div style={{display:"flex",gap:3,marginBottom:8}}>
        {[1,2,3,4].map(yr=>(
          <button key={yr} onClick={()=>switchYear(yr)}
            style={{flex:1,padding:mob?"8px 0":"9px 0",borderRadius:10,fontSize:mob?11:13,fontWeight:700,cursor:"pointer",
              border:`2px solid ${yr===yearLevel?T.accent:T.bd}`,
              background:yr===yearLevel?`${T.accent}14`:T.bg2,
              color:yr===yearLevel?T.accent:T.txD,transition:"all .15s"}}>
            {mob?`${yr}年`:`${yr}年生`}
          </button>
        ))}
      </div>

      {/* Quarter tabs */}
      <div style={{display:"flex",gap:4,marginBottom:16}}>
        {["1Q","2Q"].map(q=>(
          <button key={q} onClick={()=>switchQ(q)}
            style={{flex:1,padding:"10px 0",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer",
              border:`2px solid ${q===quarter?T.accent:T.bd}`,
              background:q===quarter?`${T.accent}14`:T.bg2,
              color:q===quarter?T.accent:T.txD,transition:"all .15s"}}>
            {q}
          </button>
        ))}
      </div>

      {/* School/dept filter (2+ year) */}
      {yearLevel>=2&&(
        <div style={{background:T.bg2,borderRadius:14,border:`1px solid ${T.bd}`,padding:mob?10:14,marginBottom:16}}>
          <div style={{fontSize:12,fontWeight:700,color:T.txH,marginBottom:8}}>学院で絞り込み</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {SCHOOLS.map(s=>{
              const isSel=selSchool===s.key;
              return(
                <button key={s.key} onClick={()=>handleSchool(s.key)}
                  style={{padding:"6px 14px",borderRadius:8,fontSize:mob?11:12,fontWeight:isSel?700:500,cursor:"pointer",
                    border:`1.5px solid ${isSel?T.accent:T.bd}`,
                    background:isSel?`${T.accent}18`:T.bg3,
                    color:isSel?T.accent:T.txH,transition:"all .12s"}}>
                  {s.label}
                </button>
              );
            })}
            <button onClick={()=>{setSelSchool(null);setSelDepts([]);}}
              style={{padding:"6px 14px",borderRadius:8,fontSize:mob?11:12,fontWeight:!selSchool?700:500,cursor:"pointer",
                border:`1.5px solid ${!selSchool?T.accent:T.bd}`,
                background:!selSchool?`${T.accent}18`:T.bg3,
                color:!selSchool?T.accent:T.txH,transition:"all .12s"}}>
              すべて
            </button>
          </div>
          {curSchool&&(
            <div style={{marginTop:10,paddingTop:8,borderTop:`1px solid ${T.bd}30`}}>
              <div style={{fontSize:11,fontWeight:600,color:T.txD,marginBottom:6}}>学系で絞り込み</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {curSchool.depts.map(dept=>{
                  const isSel=selDepts.includes(dept);
                  const col=CAT_COLORS[DEPT_LABELS[dept]]||'#6b7280';
                  return(
                    <button key={dept} onClick={()=>toggleDept(dept)}
                      style={{padding:"4px 10px",borderRadius:7,fontSize:mob?10:11,fontWeight:isSel?700:400,cursor:"pointer",
                        border:`1.5px solid ${isSel?col:T.bd}`,
                        background:isSel?`${col}18`:T.bg3,
                        color:isSel?col:T.txD,transition:"all .12s"}}>
                      {DEPT_LABELS[dept]||dept}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      <div style={{display:"flex",gap:mob?8:12,marginBottom:16}}>
        {[
          {label:"科目数",value:active.length,unit:"科目",col:T.accent},
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
          <div style={{height:hdrH}}/>
          {DAYS.map(d=>(
            <div key={d} style={{height:hdrH,display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:mob?11:13,fontWeight:700,color:T.txH}}>{d}</div>
          ))}
          {PERIODS.map((p2,pi)=><React.Fragment key={pi}>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
              fontSize:mob?8:9,color:T.txD,lineHeight:1.2,paddingRight:2}}>
              <div style={{fontWeight:600}}>{p2}</div>
              <div style={{fontSize:mob?7:8,opacity:.6}}>{PER_TIMES[pi]?.split("–")[0]}</div>
            </div>
            {DAYS.map((_,di)=><Cell key={di} c={grid[pi][di]} d={di} p={pi}/>)}
          </React.Fragment>)}
        </div>
      </div>

      {/* Required courses (1年 only) */}
      {yearLevel===1&&curReq&&(
        <div style={{background:T.bg2,borderRadius:14,border:`1px solid ${T.bd}`,padding:`4px ${mob?12:16}px`,marginBottom:16}}>
          <SecHdr title="必修科目のクラス設定" open={reqOpen} toggle={()=>setReqOpen(p=>!p)}
            badge={`${curReq.common.filter(c=>(req[c.id]||[]).length>0).length + curReq.science.filter(c=>sci[c.id]&&(req[c.id]||[]).length>0).length}科目設定済`}/>
          {reqOpen&&<div>
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
              {unit&&reqSec&&Object.keys(reqSec).length>0&&(
                <span style={{fontSize:10,color:T.green}}>{Object.keys(reqSec).length}科目設定済</span>
              )}
            </div>
            <div style={{fontSize:10,fontWeight:700,color:T.txD,padding:"8px 0 4px",letterSpacing:.5}}>共通必修</div>
            {curReq.common.map(c=><ReqRow key={c.id} c={c}/>)}
            <div style={{fontSize:10,fontWeight:700,color:T.txD,padding:"12px 0 4px",letterSpacing:.5}}>理工系基礎（該当科目をチェック）</div>
            {curReq.science.map(c=><ReqRow key={c.id} c={c} isScience/>)}
          </div>}
        </div>
      )}

      {/* Courses — DB-driven categories */}
      <div style={{background:T.bg2,borderRadius:14,border:`1px solid ${T.bd}`,padding:`4px ${mob?12:16}px`,marginBottom:16}}>
        <SecHdr title={yearLevel===1?"選択科目を追加":"科目を追加"} open={optOpen} toggle={()=>setOptOpen(p=>!p)}
          badge={`${Object.keys(opt).filter(k=>(opt[k]||[]).length>0).length}科目追加済`}/>
        {optOpen&&<div>
          <div style={{padding:"8px 0"}}>
            <div style={{position:"relative"}}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="科目名・科目コードで検索..."
                style={{width:"100%",padding:"7px 10px 7px 30px",borderRadius:8,border:`1px solid ${T.bd}`,
                  background:T.bg3,color:T.txH,fontSize:12,outline:"none",boxSizing:"border-box"}}/>
              <span style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",color:T.txD,display:"flex"}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </span>
            </div>
          </div>

          {dbLoading?(
            <div style={{padding:20,textAlign:"center",fontSize:12,color:T.txD}}>科目を読込中...</div>
          ):filteredCats.length===0?(
            <div style={{padding:16,textAlign:"center",fontSize:12,color:T.txD}}>
              {yearLevel>=2&&!selSchool?"学院を選択するか、科目名で検索してください":"該当する科目がありません"}
            </div>
          ):(
            filteredCats.map(cat=>{
              const isOpen=openCats[cat.name]!==false;
              const catCol=CAT_COLORS[cat.name]||'#6b7280';
              const addedCount=cat.courses.filter(c=>opt[c.code]&&opt[c.code].length>0).length;
              return(
                <div key={cat.name} style={{marginBottom:4}}>
                  <button onClick={()=>toggleCat(cat.name)}
                    style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"8px 0",
                      border:"none",background:"transparent",cursor:"pointer",borderBottom:`1px solid ${T.bd}20`}}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.txD} strokeWidth="2.5"
                      style={{transform:isOpen?"rotate(90deg)":"none",transition:"transform .15s",flexShrink:0}}>
                      <path d="M9 18l6-6-6-6"/>
                    </svg>
                    <div style={{width:8,height:8,borderRadius:4,background:catCol,flexShrink:0}}/>
                    <span style={{fontSize:13,fontWeight:700,color:T.txH,flex:1,textAlign:"left"}}>{cat.name}</span>
                    <span style={{fontSize:10,color:T.txD,marginRight:4}}>
                      {cat.courses.length}科目{addedCount>0&&<span style={{color:T.accent,fontWeight:600,marginLeft:4}}>{addedCount}選択中</span>}
                    </span>
                  </button>
                  {isOpen&&<div style={{paddingLeft:4}}>
                    {cat.courses.map(c=><DbOptRow key={c.code} course={c} catName={cat.name}/>)}
                  </div>}
                </div>
              );
            })
          )}
        </div>}
      </div>

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

      {/* Footer */}
      <div style={{fontSize:10,color:T.txD,textAlign:"center",padding:"8px 0 24px",lineHeight:1.6}}>
        セクションを選択すると時間割が自動設定されます<br/>
        時間割データは自動保存されます
      </div>
    </div>
  );
};
