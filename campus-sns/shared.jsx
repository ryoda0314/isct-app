import React, { useState, useEffect, useMemo } from "react";
import { T } from "./theme.js";
import { I } from "./icons.jsx";

// --- KaTeX Loader ---
const useKatex=()=>{
  const [ready,setReady]=useState(typeof window!=="undefined"&&!!window.katex);
  useEffect(()=>{
    if(window.katex){setReady(true);return;}
    const css=document.createElement("link");css.rel="stylesheet";css.href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css";document.head.appendChild(css);
    const js=document.createElement("script");js.src="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js";js.onload=()=>setReady(true);document.head.appendChild(js);
  },[]);
  return ready;
};

// --- TeX Text Component ---
// Supports $$...$$ (display) and $...$ (inline), plus @mentions
const Tx=({children,style:s})=>{
  const k=useKatex();
  const html=useMemo(()=>{
    if(!children||typeof children!=="string")return null;
    if(!k)return null;
    try{
      // split by $$...$$ first, then $...$
      let out=children;
      // display math
      out=out.replace(/\$\$(.+?)\$\$/gs,(_, m)=>{
        try{return window.katex.renderToString(m,{displayMode:true,throwOnError:false});}catch{return _;}
      });
      // inline math
      out=out.replace(/\$(.+?)\$/g,(_,m)=>{
        try{return window.katex.renderToString(m,{displayMode:false,throwOnError:false});}catch{return _;}
      });
      // @mentions
      out=out.replace(/@(\S+)/g,'<span style="color:#6375f0;font-weight:600">@$1</span>');
      return out;
    }catch{return null;}
  },[children,k]);
  if(!children)return null;
  if(html)return <span style={s} dangerouslySetInnerHTML={{__html:html}}/>;
  // fallback: no katex yet, just render with mentions
  const parts=(children+"").split(/(@\S+)/g);
  return <span style={s}>{parts.map((p,i)=>p.startsWith("@")?<span key={i} style={{color:"#6375f0",fontWeight:600}}>{p}</span>:p)}</span>;
};

const Av=({u,sz=32,st})=><div style={{position:"relative",flexShrink:0}}><div style={{width:sz,height:sz,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:sz*.36,fontWeight:700,color:"#fff",background:u?.col||T.accent,userSelect:"none"}}>{u?.av||"?"}</div>{st&&u?.st&&<div style={{position:"absolute",bottom:-1,right:-1,width:sz*.28,height:sz*.28,borderRadius:"50%",border:`2px solid ${T.bg}`,background:u.st==="online"?T.on:u.st==="idle"?T.idle:T.off}}/>}</div>;
const Tag=({children,color=T.accent})=><span style={{display:"inline-flex",alignItems:"center",padding:"2px 7px",borderRadius:4,fontSize:11,fontWeight:600,color,background:`${color}16`,whiteSpace:"nowrap",gap:3}}>{children}</span>;
const Bar=({p,h=4,c})=><div style={{flex:1,height:h,borderRadius:h,background:T.bg4}}><div style={{height:"100%",borderRadius:h,background:c||(p>=100?T.green:T.accent),width:`${Math.min(p,100)}%`,transition:"width .3s"}}/></div>;
const Btn=({children,on,onClick,style:s})=><button onClick={onClick} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:5,border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:500,borderRadius:6,padding:"5px 10px",fontSize:13,background:on?T.accent:"transparent",color:on?"#fff":T.txD,transition:"all .12s",...s}}>{children}</button>;

export { useKatex, Tx, Av, Tag, Bar, Btn };
