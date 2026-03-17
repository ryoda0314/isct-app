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

// --- QR Code Generator Loader ---
const useQRCode=()=>{
  const [ready,setReady]=useState(typeof window!=="undefined"&&!!window.qrcode);
  useEffect(()=>{
    if(window.qrcode){setReady(true);return;}
    const js=document.createElement("script");js.src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js";js.onload=()=>setReady(true);document.head.appendChild(js);
  },[]);
  return ready;
};

// --- Leaflet Loader ---
const useLeaflet=()=>{
  const [ready,setReady]=useState(typeof window!=="undefined"&&!!window.L);
  useEffect(()=>{
    if(window.L){setReady(true);return;}
    const css=document.createElement("link");css.rel="stylesheet";css.href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";document.head.appendChild(css);
    const js=document.createElement("script");js.src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";js.onload=()=>{
      const rot=document.createElement("script");rot.src="https://unpkg.com/leaflet-rotate@0.2.8/dist/leaflet-rotate-src.js";rot.onload=()=>setReady(true);rot.onerror=()=>setReady(true);document.head.appendChild(rot);
    };document.head.appendChild(js);
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
      // #hashtags
      out=out.replace(/#([^\s#]+)/g,'<span class="hashtag" style="color:#6375f0;font-weight:500;cursor:pointer" data-tag="$1">#$1</span>');
      return out;
    }catch{return null;}
  },[children,k]);
  if(!children)return null;
  if(html)return <span style={s} dangerouslySetInnerHTML={{__html:html}}/>;
  // fallback: no katex yet, just render with mentions and hashtags
  const parts=(children+"").split(/([@#]\S+)/g);
  return <span style={s}>{parts.map((p,i)=>p.startsWith("@")?<span key={i} style={{color:"#6375f0",fontWeight:600}}>{p}</span>:p.startsWith("#")?<span key={i} style={{color:"#6375f0",fontWeight:500,cursor:"pointer"}}>{p}</span>:p)}</span>;
};

const _isImg=v=>v&&(v.startsWith("data:")||v.startsWith("http")||v.startsWith("/"));
const Av=({u,sz=32,st})=>{const av=u?.av,img=_isImg(av);return <div style={{position:"relative",flexShrink:0}}>{img?<img src={av} style={{width:sz,height:sz,borderRadius:"50%",objectFit:"cover",display:"block"}} alt=""/>:<div style={{width:sz,height:sz,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:sz*.36,fontWeight:700,color:"#fff",background:u?.col||T.accent,userSelect:"none"}}>{av||"?"}</div>}{st&&u?.st&&<div style={{position:"absolute",bottom:-1,right:-1,width:sz*.28,height:sz*.28,borderRadius:"50%",border:`2px solid ${T.bg}`,background:u.st==="online"?T.on:u.st==="idle"?T.idle:T.off}}/>}</div>;};
const Tag=({children,color=T.accent})=><span style={{display:"inline-flex",alignItems:"center",padding:"2px 7px",borderRadius:4,fontSize:11,fontWeight:600,color,background:`${color}16`,whiteSpace:"nowrap",gap:3}}>{children}</span>;
const Bar=({p,h=4,c})=><div style={{flex:1,height:h,borderRadius:h,background:T.bg4}}><div style={{height:"100%",borderRadius:h,background:c||(p>=100?T.green:T.accent),width:`${Math.min(p,100)}%`,transition:"width .3s"}}/></div>;
const Btn=({children,on,onClick,style:s})=><button onClick={onClick} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:5,border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:500,borderRadius:6,padding:"5px 10px",fontSize:13,background:on?T.accent:"transparent",color:on?"#fff":T.txD,transition:"all .12s",...s}}>{children}</button>;

/* ─── Animated Loader ─── */
let _loaderCssInjected=false;
const injectLoaderCss=()=>{
  if(_loaderCssInjected||typeof document==="undefined")return;
  _loaderCssInjected=true;
  const s=document.createElement("style");
  s.textContent=`
@keyframes ldSpin{to{transform:rotate(360deg)}}
@keyframes ldPulse{0%,80%,100%{transform:scale(0);opacity:.4}40%{transform:scale(1);opacity:1}}
@keyframes ldFade{0%,100%{opacity:.4}50%{opacity:1}}`;
  document.head.appendChild(s);
};
const Loader=({msg,size="md"})=>{
  injectLoaderCss();
  const sz=size==="sm"?{ring:20,dot:5,gap:4,font:12}:size==="lg"?{ring:36,dot:8,gap:6,font:14}:{ring:28,dot:6,gap:5,font:13};
  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14,padding:size==="sm"?16:40,flex:1}}>
      <div style={{position:"relative",width:sz.ring,height:sz.ring}}>
        <div style={{position:"absolute",inset:0,border:`2.5px solid ${T.bd}`,borderRadius:"50%"}}/>
        <div style={{position:"absolute",inset:0,border:"2.5px solid transparent",borderTopColor:T.accent,borderRadius:"50%",animation:"ldSpin .8s cubic-bezier(.45,.05,.55,.95) infinite"}}/>
      </div>
      {msg&&(
        <div style={{display:"flex",alignItems:"center",gap:2}}>
          <span style={{color:T.txD,fontSize:sz.font,fontWeight:500}}>{msg}</span>
          <span style={{display:"inline-flex",gap:sz.gap-1,marginLeft:2}}>
            {[0,1,2].map(i=><span key={i} style={{width:sz.dot,height:sz.dot,borderRadius:"50%",background:T.txD,animation:`ldPulse 1.2s ${i*.15}s ease-in-out infinite`}}/>)}
          </span>
        </div>
      )}
    </div>
  );
};

export { useKatex, useLeaflet, useQRCode, Tx, Av, Tag, Bar, Btn, Loader };
