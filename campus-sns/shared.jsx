import React, { useState, useEffect, useMemo } from "react";
import { t } from "./i18n.js";
import { T } from "./theme.js";
import { I } from "./icons.jsx";

// --- CDN Loader Helpers (with SRI) ---
const _loadCSS=(href,integrity)=>{const el=document.createElement("link");el.rel="stylesheet";el.href=href;if(integrity){el.integrity=integrity;el.crossOrigin="anonymous";}document.head.appendChild(el);};
const _loadJS=(src,integrity,onload)=>{const el=document.createElement("script");el.src=src;if(integrity){el.integrity=integrity;el.crossOrigin="anonymous";}if(onload)el.onload=onload;document.head.appendChild(el);return el;};

// --- DOMPurify Loader (XSS protection for dangerouslySetInnerHTML) ---
const usePurify=()=>{
  const [ready,setReady]=useState(typeof window!=="undefined"&&!!window.DOMPurify);
  useEffect(()=>{
    if(window.DOMPurify){setReady(true);return;}
    _loadJS("https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.2.4/purify.min.js","sha384-eEu5CTj3qGvu9PdJuS+YlkNi7d2XxQROAFYOr59zgObtlcux1ae1Il3u7jvdCSWu",()=>setReady(true));
  },[]);
  return ready;
};
const _sanitize=html=>window.DOMPurify?window.DOMPurify.sanitize(html,{ADD_TAGS:["annotation","semantics","mrow","mi","mo","mn","msup","msub","mfrac","mover","munder","mspace","mtable","mtr","mtd","msqrt","mroot","menclose","mstyle","mtext","merror","mpadded","mphantom"],ADD_ATTR:["xmlns","encoding","mathvariant","displaystyle","scriptlevel","fence","stretchy","symmetric","maxsize","minsize","largeop","movablelimits","accent","accentunder","align","rowalign","columnalign","columnwidth","data-tag","target","rel"],FORBID_TAGS:["style"],FORBID_ATTR:["onerror","onload","onclick","onmouseover","onfocus"]}):"";

// --- KaTeX Loader ---
const useKatex=()=>{
  const [ready,setReady]=useState(typeof window!=="undefined"&&!!window.katex);
  useEffect(()=>{
    if(window.katex){setReady(true);return;}
    _loadCSS("https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css","sha384-n8MVd4RsNIU0tAv4ct0nTaAbDJwPJzDEaqSD1odI+WdtXRGWt2kTvGFasHpSy3SV");
    _loadJS("https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js","sha384-XjKyOOlGwcjNTAIQHIpgOno0Hl1YQqzUOEleOLALmuqehneUG+vnGctmUb0ZY0l8",()=>setReady(true));
  },[]);
  return ready;
};

// --- QR Code Generator Loader ---
const useQRCode=()=>{
  const [ready,setReady]=useState(typeof window!=="undefined"&&!!window.qrcode);
  useEffect(()=>{
    if(window.qrcode){setReady(true);return;}
    _loadJS("https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js","sha384-mZT2gIty7ZDdOGkxfP6joZcYdMW1Jvj9dRlfpTmaJAKKXTqzygtB22k7FLe+KZC1",()=>setReady(true));
  },[]);
  return ready;
};

// --- Leaflet Loader ---
const useLeaflet=()=>{
  const [ready,setReady]=useState(typeof window!=="undefined"&&!!window.L);
  useEffect(()=>{
    if(window.L){setReady(true);return;}
    _loadCSS("https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css","sha384-c6Rcwz4e4CITMbu/NBmnNS8yN2sC3cUElMEMfP3vqqKFp7GOYaaBBCqmaWBjmkjb");
    _loadJS("https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js","sha384-NElt3Op+9NBMCYaef5HxeJmU4Xeard/Lku8ek6hoPTvYkQPh3zLIrJP7KiRocsxO",()=>{
      const rot=document.createElement("script");rot.src="/js/leaflet-rotate-src.js";rot.onload=()=>setReady(true);rot.onerror=()=>setReady(true);document.head.appendChild(rot);
    });
  },[]);
  return ready;
};

// --- Highlight.js Loader ---
const useHighlight=()=>{
  const [ready,setReady]=useState(typeof window!=="undefined"&&!!window.hljs);
  useEffect(()=>{
    if(window.hljs){setReady(true);return;}
    _loadCSS("https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css","sha384-wH75j6z1lH97ZOpMOInqhgKzFkAInZPPSPlZpYKYTOqsaizPvhQZmAtLcPKXpLyH");
    _loadJS("https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js","sha384-F/bZzf7p3Joyp5psL90p/p89AZJsndkSoGwRpXcZhleCWhd8SnRuoYo4d0yirjJp",()=>setReady(true));
  },[]);
  return ready;
};

// --- Markdown Text Component ---
// Block: # headings, - / * / + & 1. lists, > blockquotes, --- rules, ```code```, $$math$$
// Inline: **bold**, *italic*/_italic_, ~~strike~~, `code`, $math$, [links](url), bare URLs, @mentions, #hashtags
const _esc=s=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const _codeBlock=(highlighted,lang,raw)=>{
  const langLabel=lang?`<span style="color:#888;font-size:11px;font-weight:500;user-select:none">${_esc(lang)}</span>`:"";
  const copyBtn=`<button class="code-copy-btn" data-code="${_esc(raw)}" style="padding:5px 14px;border-radius:5px;border:1px solid #444;background:#2a2a3e;color:#aaa;font-size:12px;cursor:pointer;font-family:inherit;transition:background .15s;-webkit-tap-highlight-color:transparent">${_esc(t("shared.copy"))}</button>`;
  const toolbar=`<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:#181825;border-radius:0 0 8px 8px;border-top:1px solid #2a2a3e">${langLabel}${copyBtn}</div>`;
  return `<div style="margin:4px 0;border-radius:8px;overflow:hidden;background:#1e1e2e"><pre style="margin:0;padding:10px 12px;overflow-x:auto;font-size:12.5px;line-height:1.5;background:transparent"><code${highlighted?' class="hljs"':' style="color:#cdd6f4"'}>${highlighted||_esc(raw)}</code></pre>${toolbar}</div>`;
};
// Parse a markdown string to safe-ish HTML (final pass is DOMPurify). Output contains no literal
// newlines so a call-site white-space:pre-wrap stays a no-op.
const _mdParse=(children,hlReady)=>{
  const held=[];
  const ph=h=>{const id=`\x00${held.length}\x00`;held.push(h);return id;};
  let src=children;
  // Protect block code fences first (own line via surrounding newlines)
  src=src.replace(/```(\w*)\n?([\s\S]*?)```/g,(_,lang,code)=>{
    const raw=code.replace(/\n$/,"");
    if(hlReady&&window.hljs){
      try{
        const r=lang&&window.hljs.getLanguage(lang)?window.hljs.highlight(raw,{language:lang}):window.hljs.highlightAuto(raw);
        return "\n"+ph(_codeBlock(r.value,lang,raw))+"\n";
      }catch{}
    }
    return "\n"+ph(_codeBlock(null,lang,raw))+"\n";
  });
  // Protect display math (may span lines), inline code, inline math — all become newline-free tokens
  src=src.replace(/\$\$([\s\S]+?)\$\$/g,(_,m)=>{try{return ph(window.katex.renderToString(m,{displayMode:true,throwOnError:false}));}catch{return _;}});
  src=src.replace(/`([^`\n]+)`/g,(_,code)=>ph(`<code style="background:#1e1e2e;color:#cdd6f4;padding:1px 5px;border-radius:4px;font-size:12.5px">${_esc(code)}</code>`));
  src=src.replace(/\$([^\n$]+?)\$/g,(_,m)=>{try{return ph(window.katex.renderToString(m,{displayMode:false,throwOnError:false}));}catch{return _;}});
  // Inline markup → placeholders (links/URLs before mentions/hashtags so #/@ inside URLs survive)
  const inline=txt=>{
    let o=txt;
    o=o.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g,(_,tx,url)=>ph(`<a href="${_esc(url)}" target="_blank" rel="noopener noreferrer" style="color:#6375f0;text-decoration:underline">${_esc(tx)}</a>`));
    o=o.replace(/(^|[\s(])(https?:\/\/[^\s<]+)/g,(_,pre,url)=>pre+ph(`<a href="${_esc(url)}" target="_blank" rel="noopener noreferrer" style="color:#6375f0;text-decoration:underline">${_esc(url)}</a>`));
    o=o.replace(/\*\*([^\n]+?)\*\*/g,(_,x)=>ph(`<strong>${_esc(x)}</strong>`));
    o=o.replace(/~~([^\n]+?)~~/g,(_,x)=>ph(`<del>${_esc(x)}</del>`));
    o=o.replace(/\*([^*\n]+?)\*/g,(_,x)=>ph(`<em>${_esc(x)}</em>`));
    o=o.replace(/(^|[^\w])_([^_\n]+?)_(?![\w])/g,(_,pre,x)=>pre+ph(`<em>${_esc(x)}</em>`));
    o=o.replace(/@(\S+)/g,(_,name)=>ph(`<span style="color:#6375f0;font-weight:600">@${_esc(name)}</span>`));
    o=o.replace(/#([^\s#]+)/g,(_,tag)=>ph(`<span class="hashtag" style="color:#6375f0;font-weight:500;cursor:pointer" data-tag="${_esc(tag)}">#${_esc(tag)}</span>`));
    return o;
  };
  // Finalize a text fragment: run inline markup, escape the plain gaps, restore all placeholders
  const fin=txt=>{
    let o=inline(txt);
    o=o.split(/(\x00\d+\x00)/g).map((seg,j)=>j%2===0?_esc(seg):seg).join('');
    return o.replace(/\x00(\d+)\x00/g,(_,j)=>held[+j]);
  };
  const lines=src.split('\n');
  const isPh=l=>/^\x00\d+\x00$/.test(l);
  const isBlock=l=>l===''||isPh(l)||/^(#{1,6})\s+/.test(l)||/^>\s?/.test(l)||/^[-*+]\s+/.test(l)||/^\d+\.\s+/.test(l)||/^(---+|\*\*\*+|___+)$/.test(l);
  const hSize=[0,17,16,15,14,13.5,13];
  const out=[];
  let i=0;
  while(i<lines.length){
    const l=lines[i].trim();
    if(l===''){i++;continue;}
    if(isPh(l)){out.push(`<div style="margin:4px 0">${held[+l.replace(/\x00/g,'')]}</div>`);i++;continue;}
    if(/^(---+|\*\*\*+|___+)$/.test(l)){out.push(`<hr style="border:none;border-top:1px solid ${T.bd};margin:8px 0">`);i++;continue;}
    const hm=l.match(/^(#{1,6})\s+(.+)$/);
    if(hm){out.push(`<div style="font-weight:700;font-size:${hSize[hm[1].length]}px;line-height:1.4;margin:6px 0 2px">${fin(hm[2])}</div>`);i++;continue;}
    if(/^>\s?/.test(l)){
      const buf=[];
      while(i<lines.length&&/^>\s?/.test(lines[i].trim())){buf.push(lines[i].trim().replace(/^>\s?/,''));i++;}
      out.push(`<blockquote style="margin:4px 0;padding:2px 0 2px 10px;border-left:3px solid #6375f0;opacity:.85">${buf.map(fin).join('<br>')}</blockquote>`);continue;
    }
    if(/^[-*+]\s+/.test(l)){
      const buf=[];
      while(i<lines.length&&/^[-*+]\s+/.test(lines[i].trim())){buf.push(lines[i].trim().replace(/^[-*+]\s+/,''));i++;}
      out.push(`<ul style="margin:4px 0;padding-left:20px">${buf.map(x=>`<li style="margin:1px 0">${fin(x)}</li>`).join('')}</ul>`);continue;
    }
    if(/^\d+\.\s+/.test(l)){
      const buf=[];
      while(i<lines.length&&/^\d+\.\s+/.test(lines[i].trim())){buf.push(lines[i].trim().replace(/^\d+\.\s+/,''));i++;}
      out.push(`<ol style="margin:4px 0;padding-left:22px">${buf.map(x=>`<li style="margin:1px 0">${fin(x)}</li>`).join('')}</ol>`);continue;
    }
    const buf=[];
    while(i<lines.length&&!isBlock(lines[i].trim())){buf.push(lines[i]);i++;}
    out.push(`<div style="margin:0">${buf.map(fin).join('<br>')}</div>`);
  }
  return out.join('');
};
const Tx=({children,style:s})=>{
  const k=useKatex();
  const hl=useHighlight();
  const dp=usePurify();
  const html=useMemo(()=>{
    if(!children||typeof children!=="string")return null;
    if(!k)return null;
    try{return _mdParse(children,hl);}catch{return null;}
  },[children,k,hl,dp]);
  // Event delegation for code copy buttons (no inline onclick)
  const handleClick=React.useCallback(e=>{
    const btn=e.target.closest(".code-copy-btn");
    if(!btn)return;
    const code=btn.getAttribute("data-code");
    if(code)navigator.clipboard.writeText(code).then(()=>{btn.textContent="\u2713 "+t("shared.copied");setTimeout(()=>{btn.textContent=t("shared.copy")},1500)}).catch(()=>{});
  },[]);
  if(!children)return null;
  if(html&&dp)return <div style={s} onClick={handleClick} dangerouslySetInnerHTML={{__html:_sanitize(html)}}/>;
  // fallback: CDN libs not ready yet, render plain text with mentions and hashtags
  const parts=(children+"").split(/([@#]\S+)/g);
  return <div style={s}>{parts.map((p,i)=>p.startsWith("@")?<span key={i} style={{color:"#6375f0",fontWeight:600}}>{p}</span>:p.startsWith("#")?<span key={i} style={{color:"#6375f0",fontWeight:500,cursor:"pointer"}}>{p}</span>:p)}</div>;
};

const _isImg=v=>v&&(v.startsWith("data:")||v.startsWith("http")||v.startsWith("/"));
// グローバルなプロフィールオープナー（App が一度だけ登録）。Av に uid を渡すと
// どこでもアイコンタップでその人のプロフィールが開く。親の onClick とは stopPropagation で分離。
let _profileOpener=null;
const setProfileOpener=(fn)=>{_profileOpener=fn;};
const openProfileFor=(uid)=>{if(uid!=null&&_profileOpener)_profileOpener(uid);};
const Av=({u,sz=32,st,uid})=>{const av=u?.av,img=_isImg(av);const clickable=uid!=null&&!!_profileOpener;const onClick=clickable?(e)=>{e.stopPropagation();_profileOpener(uid);}:undefined;return <div onClick={onClick} style={{position:"relative",flexShrink:0,...(clickable?{cursor:"pointer"}:null)}}>{img?<img src={av} style={{width:sz,height:sz,borderRadius:"50%",objectFit:"cover",display:"block"}} alt=""/>:<div style={{width:sz,height:sz,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:sz*.36,fontWeight:700,color:"#fff",background:u?.col||T.accent,userSelect:"none"}}>{av||"?"}</div>}{st&&u?.st&&<div style={{position:"absolute",bottom:-1,right:-1,width:sz*.28,height:sz*.28,borderRadius:"50%",border:`2px solid ${T.bg}`,background:u.st==="online"?T.on:u.st==="idle"?T.idle:T.off}}/>}</div>;};
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

// Chat message preview: collapse whitespace and hard-cap length so a single
// pathological unbroken token (e.g. a pasted base64 blob) can't sprawl across
// wide viewports where CSS ellipsis won't engage.
const msgPreview = (txt, max = 48) => {
  const s = String(txt || "").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
};

export { useKatex, useHighlight, useLeaflet, useQRCode, Tx, Av, Tag, Bar, Btn, Loader, setProfileOpener, openProfileFor, msgPreview };
