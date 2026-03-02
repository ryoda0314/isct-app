import { T } from "./theme.js";
import { I } from "./icons.jsx";
import { useState, useEffect } from "react";

const NOW=new Date(2026,1,28,12,0);
const fT=d=>{const m=Math.floor((NOW-d)/6e4);if(m<1)return"now";if(m<60)return`${m}m`;const h=Math.floor(m/60);if(h<24)return`${h}h`;return`${Math.floor(h/24)}d`;};
const fTs=d=>`${d.getHours()}:${String(d.getMinutes()).padStart(2,"0")}`;
const fDS=d=>`${d.getMonth()+1}/${d.getDate()}`;
const fDF=d=>`${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,"0")}`;
const uDue=d=>{const df=d-NOW,dy=Math.floor(df/864e5),hr=Math.floor((df%864e5)/36e5);if(df<0)return{t:"期限切れ",c:T.red,u:true};if(dy===0)return{t:`${hr}h`,c:T.red,u:true};if(dy<=2)return{t:`${dy}d${hr}h`,c:T.orange,u:true};if(dy<=7)return{t:`${dy}日`,c:T.yellow};return{t:`${dy}日`,c:T.green};};
const pDone=ss=>ss.length?Math.round(ss.filter(s=>s.d).length/ss.length*100):0;
const tMap=()=>({question:{l:"質問",c:T.accent},material:{l:"教材",c:T.green},info:{l:"お知らせ",c:T.orange},discussion:{l:"議論",c:"#a855c7"},poll:{l:"投票",c:"#2d9d8f"},anon:{l:"匿名",c:T.txD}});
const aMap=()=>({report:{l:"レポート",c:T.accent,i:I.pen},coding:{l:"コード",c:T.green,i:I.code},problem_set:{l:"演習",c:T.orange,i:I.pen},project:{l:"PJ",c:"#a855c7",i:I.tgt},quiz:{l:"テスト",c:T.yellow,i:I.pen}});
const sMap=()=>({not_started:{l:"未着手",c:T.txD},in_progress:{l:"進行中",c:T.accent},completed:{l:"提出済",c:T.green}});
const pCol=()=>({high:T.red,medium:T.orange,low:T.txD});
// mention parser: @name → highlighted span
const parseMention=(text)=>{
  const parts=text.split(/(@\S+)/g);
  return parts.map((p,i)=>p.startsWith("@")?<span key={i} style={{color:T.accent,fontWeight:600}}>{p}</span>:p);
};

// --- useMediaQuery ---
const useMobile=()=>{const [m,setM]=useState(typeof window!=="undefined"?window.innerWidth<768:true);useEffect(()=>{const h=()=>setM(window.innerWidth<768);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[]);return m;};

export { NOW, fT, fTs, fDS, fDF, uDue, pDone, tMap, aMap, sMap, pCol, parseMention, useMobile };
