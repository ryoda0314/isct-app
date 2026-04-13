import { useState } from "react";
import { T } from "../theme.js";
import { useCourseMaterials } from "../hooks/useCourseMaterials.js";

const TC={pdf:'#e5534b',slide:'#d4843e',document:'#6375f0',spreadsheet:'#3dae72',image:'#a855c7',video:'#2d9d8f',audio:'#c6a236',archive:'#68687a',code:'#3dae72',text:'#68687a',link:'#6375f0',file:'#68687a'};
const TL={pdf:'PDF',slide:'スライド',document:'文書',spreadsheet:'表計算',image:'画像',video:'動画',audio:'音声',archive:'圧縮',code:'コード',text:'テキスト',link:'リンク',file:'ファイル'};

const CourseMatCard=({course,mob,setCid,setView,setCh})=>{
  const {sections,totalFiles,loading,error}=useCourseMaterials(course.moodleId);
  const [open,setOpen]=useState(false);
  const allMats=sections.flatMap(s=>s.materials);

  return(
    <div style={{borderRadius:8,background:T.bg2,border:`1px solid ${T.bd}`,overflow:"hidden",marginBottom:4}}>
      <div onClick={()=>{if(totalFiles>0)setOpen(o=>!o);}} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",cursor:totalFiles>0?"pointer":"default",borderLeft:`3px solid ${course.col||T.accent}`}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:12,fontWeight:600,color:T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{course.name}</div>
        </div>
        {loading?<span style={{fontSize:10,color:T.txD}}>読込中...</span>
        :error?<span style={{fontSize:10,color:"#ef4444"}}>取得失敗</span>
        :<span style={{fontSize:10,color:T.txD,flexShrink:0}}>{totalFiles}件</span>}
        {totalFiles>0&&<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.txD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,transform:open?"rotate(90deg)":"none",transition:"transform .15s"}}><polyline points="9 18 15 12 9 6"/></svg>}
      </div>
      {open&&allMats.length>0&&<div style={{borderTop:`1px solid ${T.bd}`,padding:"4px 0"}}>
        {allMats.map(mat=>{
          const tc=TC[mat.fileType]||"#68687a";
          const tl=TL[mat.fileType]||"ファイル";
          const href=mat.modname==="url"?mat.fileurl:mat.fileurl;
          return(
            <a key={mat.id} href={href} target="_blank" rel="noopener noreferrer"
              style={{display:"flex",alignItems:"center",gap:8,padding:"5px 10px 5px 16px",textDecoration:"none",cursor:"pointer",background:"transparent",transition:"background .1s"}}
              onMouseEnter={e=>e.currentTarget.style.background=T.bg3}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <span style={{fontSize:9,fontWeight:700,color:tc,background:`${tc}15`,padding:"1px 5px",borderRadius:3,flexShrink:0}}>{tl}</span>
              <span style={{flex:1,fontSize:11,color:T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{mat.filename||mat.name}</span>
              {mat.filesizeFormatted&&<span style={{fontSize:9,color:T.txD,flexShrink:0}}>{mat.filesizeFormatted}</span>}
            </a>
          );
        })}
        <div style={{padding:"3px 10px 3px 16px"}}>
          <button onClick={e=>{e.stopPropagation();setCid(course.id);setCh("materials");setView("course");}}
            style={{background:"none",border:"none",color:T.accentSoft,fontSize:10,cursor:"pointer",padding:0,display:"flex",alignItems:"center",gap:2}}>
            すべての教材を見る
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </button>
        </div>
      </div>}
    </div>
  );
};

export const TodayMaterials=({courses,mob,setCid,setView,setCh})=>{
  if(!courses||courses.length===0)return null;
  return(
    <div style={{padding:"4px 16px 8px"}}>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.txH} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        <span style={{fontWeight:700,color:T.txH,fontSize:14}}>今日の教材</span>
      </div>
      {courses.map(c=><CourseMatCard key={c.id} course={c} mob={mob} setCid={setCid} setView={setView} setCh={setCh}/>)}
    </div>
  );
};
