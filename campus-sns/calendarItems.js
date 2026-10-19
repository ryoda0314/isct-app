// Calendar item builders shared by CalendarView (the on-screen calendar) and the
// iCal subscription feed (useCalendarFeed → /api/ical/<token>). One implementation
// keeps the feed identical to what the app shows: academic-calendar class days,
// 振替 days, 休講 marks and med sessions included.
import { getAcademicInfo, getCurrentQuarter } from "./academicCalendar.js";
import { PERIOD_TIMES } from "./examData.js";
import { buildTimetable } from "../lib/transform/timetable-builder.js";
import { getSciSessions, annotateSessions } from "./attendanceUtils.js";

export const PD=[{s:[8,50],e:[10,30],l:"1限"},{s:[10,45],e:[12,25],l:"2限"},{s:[13,30],e:[15,10],l:"3限"},{s:[15,25],e:[17,5],l:"4限"},{s:[17,15],e:[18,55],l:"5限"}];
const DOW_MAP={"月":0,"火":1,"水":2,"木":3,"金":4};
const dKey=d=>`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
// Academic year from date: April–March = same nendo
export const dateToAY=d=>d.getMonth()>=3?d.getFullYear():d.getFullYear()-1;
// getSciSessions().dateStr はゼロ埋め "YYYY-MM-DD"。dKey(ゼロ埋め無し)は流用不可。
export const isoOf=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

/**
 * Returns getClasses(date) → the class sessions held on that date:
 * [{type:"class",course,pd,pi,n,sub,dow?,dispN,cancelled,sessionKey,dateStr}].
 * Built once per data change; getClasses itself is cheap per date.
 */
export function makeClassResolver({qDataAll={},pastTTCache={},courses=[],records={},medSessions=[]}){
  // Build year-filtered timetables to avoid cross-year slot collisions.
  // When courses from multiple years share the same quarter (e.g. 2025-1Q and 2026-1Q),
  // building one grid overwrites slots. Filter by year first, then build separate grids.
  const yearTTMap={};
  for(const [q,qObj] of Object.entries(qDataAll)){
    if(!qObj?.C)continue;
    const byYear={};
    for(const c of qObj.C){const y=c.year||0;if(!byYear[y])byYear[y]=[];byYear[y].push(c);}
    yearTTMap[q]={};
    for(const [y,cs] of Object.entries(byYear)){yearTTMap[q][y]=buildTimetable(cs);}
  }
  const getTT=(q,yr)=>{
    // 1. Try year-filtered timetable from qDataAll
    const tt=yearTTMap[q]?.[yr];
    if(tt&&tt.some(row=>row.some(cell=>cell)))return tt;
    // 2. Fallback: pastTTCache for that year
    const past=pastTTCache[yr];
    if(past?.qData?.[q]?.TT)return past.qData[q].TT;
    return[];
  };
  // Index med sessions by date key (YYYY-M-D) for fast lookup
  const medByDay={};
  for(const s of medSessions){
    if(!s.date)continue;
    // s.date is "YYYY/MM/DD" — convert to dKey format
    const parts=s.date.split("/").map(Number);
    const k=`${parts[0]}-${parts[1]-1}-${parts[2]}`;
    if(!medByDay[k])medByDay[k]=[];
    medByDay[k].push(s);
  }
  const getMedClasses=date=>{
    const sessions=medByDay[dKey(date)];
    if(!sessions||sessions.length===0)return [];
    const seen=new Set();
    return sessions.filter(s=>{
      const key=`${s.code}|${s.timeStart}|${s.timeEnd}`;
      if(seen.has(key))return false;
      seen.add(key);return true;
    }).map(s=>{
      const [sh,sm]=(s.timeStart||"0:0").split(":").map(Number);
      const [eh,em]=(s.timeEnd||"0:0").split(":").map(Number);
      return{type:"class",course:{name:s.name,col:"#e04e6a",room:s.room||null,code:s.code},pd:{l:s.timeStart,s:[sh,sm],e:[eh,em]},pi:null,n:null,sub:false,dow:s.day};
    });
  };
  // 休講(cancelled)注釈マップ: courseId → ゼロ埋めISO日付 → {cancelled, ordinal, sessionKey}
  const sci=records.sci||{};
  const sciAnnot={};
  for(const co of courses){
    if(!co?.quarter)continue; // sci のみ（medは別扱い）
    const statuses=sci[String(co.id)]||{};
    const keys=new Set(Object.keys(statuses).filter(k=>statuses[k]==="cancelled"));
    const byDate={};
    for(const s of annotateSessions(getSciSessions(co),keys))byDate[s.dateStr]={cancelled:s.cancelled,ordinal:s.ordinal,sessionKey:s.sessionKey};
    sciAnnot[String(co.id)]=byDate;
  }
  return date=>{
    const yr=dateToAY(date);
    const iso=isoOf(date);
    const info=getAcademicInfo(date);
    const hasAcad=info.items.length>0||info.period;
    const withAnnot=(co,base)=>{
      const ann=sciAnnot[String(co.id)]?.[iso];
      return {...base,dispN:(ann&&ann.ordinal!=null)?ann.ordinal:base.n,cancelled:!!ann?.cancelled,sessionKey:ann?.sessionKey,dateStr:iso};
    };
    let results=[];
    if(hasAcad){
      const classItems=info.items.filter(it=>it.type==="class");
      if(classItems.length>0){
        for(const item of classItems){
          const di=DOW_MAP[item.dow];
          if(di===undefined) continue;
          const tt=getTT(item.q,yr);
          PD.forEach((pd,pi)=>{const co=tt[pi]?.[di];if(co) results.push(withAnnot(co,{type:"class",course:co,pd,pi,n:item.n,sub:item.sub,dow:item.dow}));});
        }
      }
    } else {
      const dow=date.getDay();
      if(dow>=1&&dow<=5){
        const di=dow-1;
        const tt=getTT(getCurrentQuarter(date),yr);
        results=PD.map((pd,pi)=>{const co=tt[pi]?.[di];if(!co)return null;return withAnnot(co,{type:"class",course:co,pd,pi,n:null,sub:false});}).filter(Boolean);
      }
    }
    // Append med sessions (date-based, not timetable grid)
    return results.concat(getMedClasses(date));
  };
}

/** Exams (from /api/exams) that belong to the user's enrolled courses. */
export function matchMyExams(exams,courses){
  if(!courses?.length||!exams?.length)return [];
  // 試験(e)と履修科目(c)の年度/クォーターを正規化して比較
  // exam.year:'2025' 文字列 / exam.quarter:数値or'4Q' ; course.year:'2025' / course.quarter:1-4数値
  const normQ=q=>{if(q==null||q==="")return"";const m=String(q).match(/(\d)/);return m?m[1]:"";};
  // 試験日(YYYY-MM-DD)が属する年度: 4月〜翌3月が同一年度 (dateToAYと同じ規則)
  const examAY=ds=>{const [y,m]=ds.split("-").map(Number);return (m-1)>=3?y:y-1;};
  const matchYQ=(c,ey,eq)=>{
    if(ey&&(!c.year||String(c.year)!==ey))return false;
    if(eq){
      // 複数クォーター科目(例:1-2Q)は該当する全クォーターの試験にマッチ
      const qs=(c.quarters&&c.quarters.length)?c.quarters.map(String):(c.quarter==null?[]:[normQ(c.quarter)]);
      if(!qs.includes(eq))return false;
    }
    return true;
  };
  return exams.filter(e=>{
    const ey=e.year==null?"":String(e.year);
    const eq=normQ(e.quarter);
    // 試験の年度と、表示される日付の年度が一致すること (2026年度試験→年度2026の日付にのみ)
    if(ey&&e.date&&String(examAY(e.date))!==ey)return false;
    return courses.some(c=>matchYQ(c,ey,eq)&&(
      (c.codeRaw&&c.codeRaw!==c.code)?c.codeRaw===e.code_raw:c.code===e.code
    ));
  });
}

// ── iCal feed snapshot ──
// The LMS blocks server IPs, so the server can't build this itself: the client
// computes it and uploads it (PUT /api/calendar-feed). Personal events are NOT
// included — the feed reads those live from user_events.
//
// Item: { k:"class"|"asgn"|"exam"|"event", id, t:title, s:start, e?:end, l?:location, d?:description, allDay? }
// s/e are absolute ISO instants, or "YYYY-MM-DD" when allDay (e = exclusive end day).

const hm=([h,m])=>`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
// Class/exam times are JST wall-clock times regardless of the device's timezone.
const jst=(iso,time)=>`${iso}T${time}:00+09:00`;

/**
 * Window covered by the snapshot: from the 1st of last month to the 1st of the
 * month 4 months ahead. Month-aligned so the snapshot (and its DB write) only
 * changes when the data does, or once a month — not every day.
 */
export function feedWindow(now=new Date()){
  return {from:new Date(now.getFullYear(),now.getMonth()-1,1),to:new Date(now.getFullYear(),now.getMonth()+4,1)};
}

export function buildFeedItems({getClasses,asgn=[],hiddenAsgn=[],courses=[],myExams=[],rsvpEvents=[],labels,now=new Date()}){
  const {from,to}=feedWindow(now);
  const fromIso=isoOf(from),toIso=isoOf(to);
  const items=[];

  // Classes — consecutive periods of the same course (e.g. 1-4限) become one event.
  for(const d=new Date(from);d<to;d.setDate(d.getDate()+1)){
    const iso=isoOf(d);
    const cls=getClasses(new Date(d)).filter(c=>!c.cancelled);
    for(let i=0;i<cls.length;i++){
      const c=cls[i];
      let last=c;
      while(c.pi!=null&&i+1<cls.length&&cls[i+1].pi===last.pi+1&&cls[i+1].course===c.course){last=cls[++i];}
      const co=c.course;
      const desc=[co.code,c.dispN!=null?labels.sessionN(c.dispN):null,c.sub?labels.makeup(c.dow):null].filter(Boolean).join(" / ");
      items.push({k:"class",id:`${co.id||co.code||co.name}_${iso}_${c.pi??c.pd.l}`,t:co.name||co.code||"",s:jst(iso,hm(c.pd.s)),e:jst(iso,hm(last.pd.e)),l:co.room||undefined,d:desc||undefined});
    }
  }

  // Assignment deadlines — a zero-length event at the due time (no DTEND).
  const hidden=new Set(hiddenAsgn);
  for(const a of asgn){
    if(!a.due||a.st==="completed"||hidden.has(a.id))continue;
    const due=a.due instanceof Date?a.due:new Date(a.due);
    if(!Number.isFinite(due.getTime())||due<from||due>=to)continue;
    const co=courses.find(x=>x.id===a.cid);
    items.push({k:"asgn",id:String(a.id),t:labels.deadline(a.title),s:due.toISOString(),d:co?[co.name,co.code].filter(Boolean).join(" / "):undefined});
  }

  // Exams — timed when the period is known, otherwise all-day.
  for(const ex of myExams){
    if(!ex.date||ex.date<fromIso||ex.date>=toIso)continue;
    const pt=PERIOD_TIMES[ex.period];
    const base={k:"exam",id:String(ex.id),t:labels.exam(ex.name),l:ex.room||undefined,d:[ex.code,ex.instructor].filter(Boolean).join(" / ")||undefined};
    if(pt)items.push({...base,s:jst(ex.date,pt.start),e:jst(ex.date,pt.end)});
    else{const n=new Date(ex.date+"T00:00:00");n.setDate(n.getDate()+1);items.push({...base,s:ex.date,e:isoOf(n),allDay:true});}
  }

  // Campus events the user RSVP'd "going" to (mirrored into the calendar as rsvp_<id>).
  for(const ev of rsvpEvents){
    const s=ev.date instanceof Date?ev.date:new Date(ev.date);
    if(!Number.isFinite(s.getTime())||s>=to)continue;
    const e=ev.end?(ev.end instanceof Date?ev.end:new Date(ev.end)):null;
    if((e||s)<from)continue;
    items.push({k:"event",id:String(ev.id),t:ev.title,s:s.toISOString(),e:e&&e>s?e.toISOString():undefined,l:ev.memo||undefined});
  }
  return items;
}
