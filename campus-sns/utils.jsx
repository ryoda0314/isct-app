import { T } from "./theme.js";
import { I } from "./icons.jsx";
import { useState, useEffect } from "react";
import { t } from "./i18n.js";

const NOW=new Date();
const fT=d=>{const m=Math.floor((NOW-d)/6e4);if(m<1)return"now";if(m<60)return`${m}m`;const h=Math.floor(m/60);if(h<24)return`${h}h`;return`${Math.floor(h/24)}d`;};
const fTs=d=>`${d.getHours()}:${String(d.getMinutes()).padStart(2,"0")}`;
const fDS=d=>`${d.getMonth()+1}/${d.getDate()}`;
const fDF=d=>`${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,"0")}`;
const uDue=d=>{const df=d-NOW,dy=Math.floor(df/864e5),hr=Math.floor((df%864e5)/36e5);if(df<0)return{t:t("utils.overdue"),c:T.red,u:true};if(dy===0){const mn=Math.floor((df%36e5)/6e4);return{t:hr>0?`${hr}h${mn}m`:`${mn}m`,c:T.red,u:true};}if(dy<=2)return{t:`${dy}d${hr}h`,c:T.orange,u:true};if(dy<=7)return{t:t("utils.days",{n:dy}),c:T.yellow};return{t:t("utils.days",{n:dy}),c:T.green};};
const pDone=ss=>ss.length?Math.round(ss.filter(s=>s.d).length/ss.length*100):0;
const tMap=()=>({question:{l:t("utils.typeQuestion"),c:T.accent},material:{l:t("utils.typeMaterial"),c:T.green},info:{l:t("utils.typeInfo"),c:T.orange},discussion:{l:t("utils.typeDiscussion"),c:"#a855c7"},poll:{l:t("utils.typePoll"),c:"#2d9d8f"},anon:{l:t("common.anonymous"),c:T.txD}});
const aMap=()=>({report:{l:t("utils.asgReport"),c:T.accent,i:I.pen},coding:{l:t("utils.asgCoding"),c:T.green,i:I.code},problem_set:{l:t("utils.asgProblemSet"),c:T.orange,i:I.pen},project:{l:t("utils.asgProject"),c:"#a855c7",i:I.tgt},quiz:{l:t("utils.asgQuiz"),c:T.yellow,i:I.pen}});
const sMap=()=>({not_started:{l:t("utils.statusNotStarted"),c:T.txD},in_progress:{l:t("utils.statusInProgress"),c:T.accent},completed:{l:t("utils.statusCompleted"),c:T.green},loading:{l:t("common.loading"),c:T.txD}});
const pCol=()=>({high:T.red,medium:T.orange,low:T.txD});
// mention parser: @name → highlighted span
const parseMention=(text)=>{
  const parts=text.split(/(@\S+)/g);
  return parts.map((p,i)=>p.startsWith("@")?<span key={i} style={{color:T.accent,fontWeight:600}}>{p}</span>:p);
};

// --- useMediaQuery ---
const useMobile=()=>{const [m,setM]=useState(typeof window!=="undefined"?window.innerWidth<768:true);useEffect(()=>{const h=()=>setM(window.innerWidth<768);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[]);return m;};

// breakpoint: mobile(<768) / tablet(768-1079) / desktop(>=1080)
const getBreakpoint=()=>{if(typeof window==="undefined")return"mobile";const w=window.innerWidth;if(w<768)return"mobile";if(w<1080)return"tablet";return"desktop";};
const useBreakpoint=()=>{const [bp,setBp]=useState(getBreakpoint);useEffect(()=>{const h=()=>setBp(getBreakpoint());window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[]);return bp;};

export { NOW, fT, fTs, fDS, fDF, uDue, pDone, tMap, aMap, sMap, pCol, parseMention, useMobile, useBreakpoint };
