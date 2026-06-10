import { useState, useEffect, useRef, useMemo } from "react";
import { T } from "../theme.js";
import { t } from "../i18n.js";
import { getAcademicInfo } from "../academicCalendar.js";

const DOW=["日","月","火","水","木","金","土"];
const DOW_KEY=["acadcal.dowSun","acadcal.dowMon","acadcal.dowTue","acadcal.dowWed","acadcal.dowThu","acadcal.dowFri","acadcal.dowSat"];
const dowCol=d=>d===0?"#ef4444":d===6?"#3b82f6":T.txH;

const typeCfg={
  class:{col:()=>T.accent,fmt:it=>t("acadcal.classItem",{q:it.q,dow:it.dow,n:it.n})+(it.sub?" "+t("acadcal.substitute"):"")},
  holiday:{col:()=>"#ef4444",fmt:it=>t("acadcal.holidayItem",{label:it.label})},
  event:{col:()=>"#0ea5e9",fmt:it=>it.label},
  cancel:{col:()=>"#6b7280",fmt:it=>t("acadcal.cancelItem",{q:it.q,label:it.label})},
  exam:{col:()=>"#d97706",fmt:it=>`${it.q}Q ${it.label}`},
};
const periodCol={exam:"#d97706",break:"#10b981",prep:"#6366f1"};

export const AcademicCalendarView=({mob})=>{
  const curRef=useRef(null);
  const today=useMemo(()=>new Date(),[]);
  const defaultYear=useMemo(()=>today.getMonth()>=3?today.getFullYear():today.getFullYear()-1,[today]);
  const [selYear,setSelYear]=useState(defaultYear);

  useEffect(()=>{
    const t=setTimeout(()=>curRef.current?.scrollIntoView({block:"start"}),150);
    return()=>clearTimeout(t);
  },[selYear]);

  const months=useMemo(()=>{
    const arr=[];
    for(let i=0;i<14;i++){
      const year=i<11?selYear:selYear+1;
      const month=(1+i)%12;
      const dim=new Date(year,month+1,0).getDate();
      const entries=[];
      let prevPeriod=null;
      for(let d=1;d<=dim;d++){
        const date=new Date(year,month,d);
        const info=getAcademicInfo(date);
        if(info.items.length===0&&!info.period) continue;
        const pk=info.period?.l||null;
        const showPBanner=pk&&pk!==prevPeriod;
        prevPeriod=pk;
        entries.push({d,dow:date.getDay(),info,showPBanner});
      }
      arr.push({year,month,entries});
    }
    return arr;
  },[selYear]);

  const isCurMonth=(y,m)=>today.getFullYear()===y&&today.getMonth()===m;
  const isToday=(y,m,d)=>isCurMonth(y,m)&&today.getDate()===d;

  return(
    <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:mob?"0 0 20px":0}}>
      <div style={{maxWidth:640,margin:"0 auto",padding:"0 16px"}}>
        {/* Sticky Header */}
        <div style={{position:"sticky",top:0,zIndex:10,background:T.bg,paddingTop:mob?"env(safe-area-inset-top)":0}}>
          <div style={{padding:"12px 0 6px",display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:36,height:36,borderRadius:10,background:`${T.accent}15`,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>
            </div>
            <div>
              <div style={{fontSize:18,fontWeight:800,color:T.txH}}>{t("acadcal.title")} {selYear}</div>
              <div style={{fontSize:12,color:T.txD}}>{t("acadcal.subtitle")}</div>
            </div>
          </div>

          {/* Year selector */}
          <div style={{display:"flex",gap:6,padding:"4px 0 6px"}}>
            {[2025,2026].map(y=>
              <button key={y} onClick={()=>setSelYear(y)}
                style={{padding:"5px 14px",borderRadius:8,border:`1px solid ${selYear===y?T.accent:T.bd}`,background:selYear===y?`${T.accent}15`:"transparent",color:selYear===y?T.accent:T.txD,fontSize:13,fontWeight:selYear===y?700:500,cursor:"pointer",transition:"all .12s"}}>
                {t("acadcal.yearSuffix",{year:y})}
              </button>
            )}
          </div>

          {/* Legend */}
          <div style={{display:"flex",flexWrap:"wrap",gap:6,padding:"2px 0 8px"}}>
            {[["acadcal.legClass",T.accent],["acadcal.legHoliday","#ef4444"],["acadcal.legEvent","#0ea5e9"],["acadcal.legCancel","#6b7280"],["acadcal.legExam","#d97706"],["acadcal.legBreak","#10b981"]].map(([lk,c])=>
              <span key={lk} style={{fontSize:10,fontWeight:600,color:c,background:`${c}12`,padding:"2px 6px",borderRadius:4}}>{t(lk)}</span>
            )}
          </div>
          <div style={{borderBottom:`1px solid ${T.bd}`}}/>
        </div>

        {/* Months */}
        {months.map(({year,month,entries})=>{
          const cur=isCurMonth(year,month);
          return(
            <div key={`${year}-${month}`} style={{marginBottom:16}}>
              {/* Month header */}
              <div ref={cur?curRef:null} style={{position:"sticky",top:0,zIndex:2,padding:"8px 0",background:T.bg,borderBottom:`2px solid ${cur?T.accent:T.bd}`,display:"flex",alignItems:"baseline",gap:6}}>
                <span style={{fontSize:16,fontWeight:800,color:cur?T.accent:T.txH}}>{t("acadcal.month",{month:month+1})}</span>
                <span style={{fontSize:12,color:T.txD}}>{t("acadcal.yearLabel",{year})}</span>
                {cur&&<span style={{marginLeft:"auto",fontSize:10,fontWeight:700,color:T.accent,background:`${T.accent}15`,padding:"2px 8px",borderRadius:4}}>{t("acadcal.thisMonth")}</span>}
              </div>

              {entries.length===0&&<div style={{padding:"14px 4px",fontSize:12,color:T.txD,fontStyle:"italic"}}>{t("acadcal.noSchedule")}</div>}

              {entries.map(({d,dow,info,showPBanner})=>{
                const td=isToday(year,month,d);
                return(
                  <div key={d}>
                    {/* Period banner */}
                    {showPBanner&&<div style={{margin:"8px 0 4px",padding:"5px 10px",borderRadius:6,fontSize:11,fontWeight:700,background:`${periodCol[info.period.t]||T.accent}15`,color:periodCol[info.period.t]||T.accent,display:"flex",alignItems:"center",gap:6}}>
                      <span style={{width:4,height:4,borderRadius:2,background:"currentColor",flexShrink:0}}/>
                      {info.period.l}
                    </div>}

                    {/* Day row */}
                    <div style={{display:"flex",alignItems:"flex-start",gap:8,padding:"5px 4px",background:td?`${T.accent}08`:"transparent",borderRadius:td?8:0,borderLeft:td?`3px solid ${T.accent}`:"3px solid transparent",marginLeft:-3}}>
                      {/* Date badge */}
                      <div style={{width:40,flexShrink:0,textAlign:"center",paddingTop:1}}>
                        <div style={{fontSize:15,fontWeight:700,color:td?T.accent:dowCol(dow),lineHeight:1.1}}>{d}</div>
                        <div style={{fontSize:9,fontWeight:600,color:td?T.accent:dowCol(dow),opacity:.7}}>{t(DOW_KEY[dow])}</div>
                      </div>
                      {/* Items */}
                      <div style={{flex:1,display:"flex",flexWrap:"wrap",gap:3,paddingTop:2}}>
                        {info.items.map((it,i)=>{
                          const cfg=typeCfg[it.type];
                          if(!cfg) return null;
                          const c=cfg.col();
                          return <span key={i} style={{fontSize:11,fontWeight:600,color:c,background:`${c}12`,padding:"2px 7px",borderRadius:5,lineHeight:1.4}}>{cfg.fmt(it)}</span>;
                        })}
                        {info.items.length===0&&info.period&&<span style={{fontSize:11,color:periodCol[info.period.t]||T.txD,fontWeight:500}}>{info.period.l}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
        <div style={{height:40}}/>
      </div>
    </div>
  );
};
