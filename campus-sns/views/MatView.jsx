import React, { useState, useEffect, useRef, useCallback } from "react";
import { T } from "../theme.js";
import { t } from "../i18n.js";
import { I } from "../icons.jsx";
import { Tag, Loader } from "../shared.jsx";
import { useCourseMaterials } from "../hooks/useCourseMaterials.js";
import { useSharedMaterials } from "../hooks/useSharedMaterials.js";
import { useCurrentUser } from "../hooks/useCurrentUser.js";
import { openMaterial } from "../openMaterial.js";
import { bulkDownloadMaterials } from "../bulkDownload.js";
import { findMaterialNote } from "./NotesView.jsx";

const tCol={pdf:'#e5534b',slide:'#d4843e',document:'#6375f0',spreadsheet:'#3dae72',image:'#a855c7',video:'#2d9d8f',audio:'#c6a236',archive:'#68687a',code:'#3dae72',text:'#68687a',link:'#6375f0',file:'#68687a'};
const tLblKey={pdf:'mat.ft.pdf',slide:'mat.ft.slide',document:'mat.ft.document',spreadsheet:'mat.ft.spreadsheet',image:'mat.ft.image',video:'mat.ft.video',audio:'mat.ft.audio',archive:'mat.ft.archive',code:'mat.ft.code',text:'mat.ft.text',link:'mat.ft.link',file:'mat.ft.file'};
const fmtD=ts=>{if(!ts)return'';const d=new Date(ts*1000);return`${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;};
const fmtDt=d=>{if(!d)return'';return`${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;};
const fmtSize=b=>{if(!b)return'';if(b<1024)return`${b} B`;if(b<1048576)return`${(b/1024).toFixed(1)} KB`;return`${(b/1048576).toFixed(1)} MB`;};
export const PREVIEWABLE=new Set(['pdf','image','video','audio']);
/* .docx は docx-preview でプレビューできる(.doc 旧形式は非対応→DL)。 */
const isDocx=m=>{if(!m)return false;const f=(m.filename||m.name||'').toLowerCase();return f.endsWith('.docx')||(m.mimetype||'').toLowerCase().includes('wordprocessingml');};
export const canPreviewType=(m,ft)=>PREVIEWABLE.has(ft)||(ft==='document'&&isDocx(m));
export const canPreview=m=>m&&m.fileurl&&canPreviewType(m,m.fileType);

/* Detect file type from mimetype */
export const detectType=mime=>{
  if(!mime)return'file';
  if(mime==='application/pdf')return'pdf';
  if(mime.startsWith('image/'))return'image';
  if(mime.startsWith('video/'))return'video';
  if(mime.startsWith('audio/'))return'audio';
  if(mime.includes('presentation')||mime.includes('powerpoint'))return'slide';
  if(mime.includes('spreadsheet')||mime.includes('excel'))return'spreadsheet';
  if(mime.includes('document')||mime.includes('word')||mime.includes('msword'))return'document';
  if(mime.includes('zip')||mime.includes('rar')||mime.includes('tar')||mime.includes('gzip'))return'archive';
  if(mime.includes('text/'))return'text';
  return'file';
};

/* Category config */
const CATS=[
  {key:'all',labelKey:'mat.cat.all',color:T.txD},
  {key:'past_exam',labelKey:'mat.cat.pastExam',color:'#e5534b'},
  {key:'notes',labelKey:'mat.cat.notes',color:'#3dae72'},
  {key:'exercise',labelKey:'mat.cat.exercise',color:'#6375f0'},
  {key:'other',labelKey:'mat.cat.other',color:'#68687a'},
];
const catLabel=k=>{const c=CATS.find(c=>c.key===k);return c?t(c.labelKey):k;};
const catColor=k=>CATS.find(c=>c.key===k)?.color||T.txD;

/* ──────────────────────────────────────────────
   PDF.js CDN loader — v3 legacy build (UMD)
   ────────────────────────────────────────────── */
const PDFJS_VER="3.11.174";
/* jsdelivr (npm pdfjs-dist) を使用。cdnjs は cmaps/ ディレクトリを配信しておらず
   (403)、CID 方式の日本語フォント(Adobe-Japan1)のグリフ解決に失敗して
   日本語テキストが空白になるため。 */
const PDFJS_CDN=`https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VER}`;
let pdfjsLoading=null;
function loadPdfjs(){
  if(window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if(pdfjsLoading) return pdfjsLoading;
  pdfjsLoading=new Promise((resolve,reject)=>{
    const s=document.createElement("script");
    s.src=`${PDFJS_CDN}/build/pdf.min.js`;
    s.onload=()=>{
      if(window.pdfjsLib){
        window.pdfjsLib.GlobalWorkerOptions.workerSrc=`${PDFJS_CDN}/build/pdf.worker.min.js`;
        resolve(window.pdfjsLib);
      }else reject(new Error("pdfjsLib not found"));
    };
    s.onerror=reject;
    document.head.appendChild(s);
  });
  return pdfjsLoading;
}

/* ──────────────────────────────────────────────
   Custom PDF Viewer
   ────────────────────────────────────────────── */
const PdfViewer=({url,dlUrl,mob,onStale,onOpen})=>{
  const [pdf,setPdf]=useState(null);
  const [pages,setPages]=useState([]);
  const [zoom,setZoom]=useState(0.75);
  const [curPage,setCurPage]=useState(1);
  const [err,setErr]=useState(null);
  const [loadMsg,setLoadMsg]=useState(t("mat.loadingPdfjs"));
  const containerRef=useRef(null);
  const pagesWrapRef=useRef(null);
  const pageRefs=useRef({});
  const renderTasks=useRef({});
  const DPR=typeof window!=="undefined"?window.devicePixelRatio||1:1;

  /* Load PDF: fetch as ArrayBuffer first, then pass data to PDF.js */
  useEffect(()=>{
    let cancelled=false;
    setPdf(null);setPages([]);setCurPage(1);setErr(null);setLoadMsg(t("mat.loadingPdfjs"));
    (async()=>{
      try{
        const lib=await loadPdfjs();
        if(cancelled)return;
        setLoadMsg(t("mat.downloadingPdf"));
        const resp=await fetch(url);
        const ct=(resp.headers.get("content-type")||"").toLowerCase();
        const buf=await resp.arrayBuffer();
        // Moodle serves filenotfound (e.g. a replaced resource) as a JSON error
        // body — often with HTTP 200 — instead of the PDF. Catch it before it
        // reaches PDF.js (which would throw a cryptic parse error), then refresh
        // the stale list so a retry picks up the new URL.
        if(!resp.ok||ct.includes("application/json")||new Uint8Array(buf)[0]===0x7b){
          let code=null;
          try{code=JSON.parse(new TextDecoder().decode(buf)).errorcode;}catch{}
          if(code){
            onStale?.();
            throw new Error(t("mat.notFoundRefreshing"));
          }
          if(!resp.ok)throw new Error(`HTTP ${resp.status}`);
        }
        if(cancelled)return;
        setLoadMsg(t("mat.parsingPdf"));
        const doc=await lib.getDocument({data:buf,cMapUrl:`${PDFJS_CDN}/cmaps/`,cMapPacked:true,standardFontDataUrl:`${PDFJS_CDN}/standard_fonts/`}).promise;
        if(cancelled)return;
        setPdf(doc);
        setPages(Array.from({length:doc.numPages},(_,i)=>i+1));
      }catch(e){if(!cancelled)setErr(e.message||t("mat.pdfLoadFailed"));}
    })();
    return()=>{cancelled=true;};
  },[url,onStale]);

  /* Render a single page to canvas */
  const renderPage=useCallback(async(pageNum)=>{
    if(!pdf)return;
    const canvas=pageRefs.current[pageNum];
    if(!canvas)return;
    if(renderTasks.current[pageNum]){
      try{renderTasks.current[pageNum].cancel();}catch{}
    }
    try{
      const page=await pdf.getPage(pageNum);
      const vp=page.getViewport({scale:zoom*DPR});
      canvas.width=vp.width;
      canvas.height=vp.height;
      canvas.style.width=`${vp.width/DPR}px`;
      canvas.style.height=`${vp.height/DPR}px`;
      const ctx=canvas.getContext("2d");
      const task=page.render({canvasContext:ctx,viewport:vp});
      renderTasks.current[pageNum]=task;
      await task.promise;
    }catch(e){
      if(e?.name!=="RenderingCancelledException")console.error("render err",e);
    }
  },[pdf,zoom,DPR]);

  /* Re-render all visible pages on zoom/pdf change */
  useEffect(()=>{
    if(!pdf)return;
    pages.forEach(p=>renderPage(p));
  },[pdf,zoom,pages,renderPage]);

  /* Track current page via scroll */
  useEffect(()=>{
    const el=containerRef.current;
    if(!el)return;
    const onScroll=()=>{
      const threshold=el.getBoundingClientRect().top+el.clientHeight/3;
      for(let i=pages.length-1;i>=0;i--){
        const c=pageRefs.current[pages[i]];
        if(c&&c.getBoundingClientRect().top<=threshold){setCurPage(pages[i]);break;}
      }
    };
    el.addEventListener("scroll",onScroll,{passive:true});
    return()=>el.removeEventListener("scroll",onScroll);
  },[pages]);

  const scrollToPage=n=>{
    const c=pageRefs.current[n];
    const el=containerRef.current;
    if(!c||!el)return;
    const top=c.getBoundingClientRect().top-el.getBoundingClientRect().top+el.scrollTop-8;
    el.scrollTo({top,behavior:"smooth"});
  };
  /* Zoom helper that keeps a focal point (viewport-local x,y) stable.
     Used by +/− buttons (focal = viewport center). */
  const zoomAt=(newZoom,focalX,focalY)=>{
    const el=containerRef.current,w=pagesWrapRef.current;
    if(!el||!w||newZoom===zoom)return;
    const wr=w.getBoundingClientRect();
    const focalWrapX=focalX-wr.left,focalWrapY=focalY-wr.top;
    const r=newZoom/zoom;
    setZoom(newZoom);
    let tries=0;
    const correct=()=>{
      const w2=pagesWrapRef.current;
      if(!w2)return;
      const wr2=w2.getBoundingClientRect();
      el.scrollLeft+=wr2.left-(focalX-focalWrapX*r);
      el.scrollTop+=wr2.top-(focalY-focalWrapY*r);
      if(++tries<4)requestAnimationFrame(correct);
    };
    requestAnimationFrame(()=>requestAnimationFrame(correct));
  };
  const zoomAtCenter=nz=>{
    const el=containerRef.current;
    if(!el){setZoom(nz);return;}
    const r=el.getBoundingClientRect();
    zoomAt(nz,r.left+r.width/2,r.top+r.height/2);
  };
  const zoomIn=()=>zoomAtCenter(Math.min(zoom+0.25,3));
  const zoomOut=()=>zoomAtCenter(Math.max(zoom-0.25,0.25));

  /* Pinch-to-zoom (touch) + trackpad pinch (ctrl+wheel)
     - Anchor the transform at the pinch midpoint so content under the user's
       fingers stays put (native-feeling zoom direction).
     - After commit, adjust scroll so the focal point ends up at the same
       viewport position post-re-render. */
  useEffect(()=>{
    const el=containerRef.current;
    if(!el)return;
    const pinch={active:false,startDist:0,startZoom:zoom,lastZoom:zoom,
                 midX:0,midY:0,focalWrapX:0,focalWrapY:0};
    const dist=(a,b)=>Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
    const resetVisual=()=>{
      const w=pagesWrapRef.current;
      if(w){w.style.transform="";w.style.transformOrigin="";}
    };
    const onStart=e=>{
      if(e.touches.length!==2)return;
      const t1=e.touches[0],t2=e.touches[1];
      const midX=(t1.clientX+t2.clientX)/2;
      const midY=(t1.clientY+t2.clientY)/2;
      const w=pagesWrapRef.current;
      if(!w)return;
      const wr=w.getBoundingClientRect();
      pinch.active=true;
      pinch.startDist=dist(t1,t2)||1;
      pinch.startZoom=zoom;
      pinch.lastZoom=zoom;
      pinch.midX=midX;
      pinch.midY=midY;
      pinch.focalWrapX=midX-wr.left;
      pinch.focalWrapY=midY-wr.top;
      w.style.transformOrigin=`${pinch.focalWrapX}px ${pinch.focalWrapY}px`;
    };
    const onMove=e=>{
      if(!pinch.active||e.touches.length<2)return;
      e.preventDefault();
      const d=dist(e.touches[0],e.touches[1]);
      const ratio=d/pinch.startDist;
      const nz=Math.min(3,Math.max(0.25,pinch.startZoom*ratio));
      pinch.lastZoom=nz;
      const w=pagesWrapRef.current;
      if(w)w.style.transform=`scale(${nz/pinch.startZoom})`;
    };
    const onEnd=e=>{
      if(!pinch.active)return;
      if(e.touches.length<2){
        pinch.active=false;
        const r=pinch.lastZoom/pinch.startZoom;
        const midX=pinch.midX,midY=pinch.midY;
        const focalWrapX=pinch.focalWrapX,focalWrapY=pinch.focalWrapY;
        resetVisual();
        if(pinch.lastZoom!==pinch.startZoom){
          setZoom(pinch.lastZoom);
          /* After re-render, scroll so the focal point stays at the same
             viewport position. Canvas CSS dimensions update when PDF.js
             re-renders asynchronously; retry a few frames. */
          let tries=0;
          const correct=()=>{
            const w=pagesWrapRef.current;
            if(!w)return;
            const wr=w.getBoundingClientRect();
            const targetLeft=midX-focalWrapX*r;
            const targetTop=midY-focalWrapY*r;
            el.scrollLeft+=wr.left-targetLeft;
            el.scrollTop+=wr.top-targetTop;
            if(++tries<4)requestAnimationFrame(correct);
          };
          requestAnimationFrame(()=>requestAnimationFrame(correct));
        }
      }
    };
    const onWheel=e=>{
      if(!e.ctrlKey)return;
      e.preventDefault();
      /* Anchor ctrl+wheel zoom at cursor position */
      const w=pagesWrapRef.current;
      if(!w)return;
      const wr=w.getBoundingClientRect();
      const focalWrapX=e.clientX-wr.left;
      const focalWrapY=e.clientY-wr.top;
      const nz=Math.min(3,Math.max(0.25,zoom*(1-e.deltaY*0.01)));
      if(nz===zoom)return;
      const r=nz/zoom;
      const cx=e.clientX,cy=e.clientY;
      setZoom(nz);
      let tries=0;
      const correct=()=>{
        const w2=pagesWrapRef.current;
        if(!w2)return;
        const wr2=w2.getBoundingClientRect();
        el.scrollLeft+=wr2.left-(cx-focalWrapX*r);
        el.scrollTop+=wr2.top-(cy-focalWrapY*r);
        if(++tries<4)requestAnimationFrame(correct);
      };
      requestAnimationFrame(()=>requestAnimationFrame(correct));
    };
    el.addEventListener("touchstart",onStart,{passive:true});
    el.addEventListener("touchmove",onMove,{passive:false});
    el.addEventListener("touchend",onEnd);
    el.addEventListener("touchcancel",onEnd);
    el.addEventListener("wheel",onWheel,{passive:false});
    return()=>{
      el.removeEventListener("touchstart",onStart);
      el.removeEventListener("touchmove",onMove);
      el.removeEventListener("touchend",onEnd);
      el.removeEventListener("touchcancel",onEnd);
      el.removeEventListener("wheel",onWheel);
    };
  },[zoom,pdf]);

  if(err) return <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12,color:T.txD,fontSize:13,padding:40}}><div>{err}</div>{onOpen
    ?<button onClick={onOpen} style={{padding:"8px 16px",borderRadius:8,border:"none",background:T.accent,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer"}}>{t("mat.openInNewTab")}</button>
    :dlUrl&&<a href={dlUrl} target="_blank" rel="noopener noreferrer" style={{padding:"8px 16px",borderRadius:8,background:T.accent,color:"#fff",fontSize:13,fontWeight:600,textDecoration:"none"}}>{t("mat.openInNewTab")}</a>}</div>;
  if(!pdf) return <Loader msg={loadMsg} size="md"/>;

  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {/* Toolbar */}
      <div style={{display:"flex",alignItems:"center",gap:mob?4:8,padding:mob?"6px 8px":"6px 12px",background:T.bg2,borderBottom:`1px solid ${T.bd}`,flexShrink:0,flexWrap:"wrap"}}>
        <button onClick={()=>{if(curPage>1){setCurPage(curPage-1);scrollToPage(curPage-1);}}} disabled={curPage<=1} style={{background:"none",border:"none",color:curPage<=1?T.bd:T.txH,cursor:curPage<=1?"default":"pointer",display:"flex",padding:4,borderRadius:4}}>{I.back}</button>
        <div style={{display:"flex",alignItems:"center",gap:3,fontSize:12,color:T.txH}}>
          <input value={curPage} onChange={e=>{const v=parseInt(e.target.value);if(v>=1&&v<=pdf.numPages){setCurPage(v);scrollToPage(v);}}} style={{width:36,textAlign:"center",background:T.bg3,border:`1px solid ${T.bd}`,borderRadius:4,color:T.txH,fontSize:12,padding:"2px 0",outline:"none",fontFamily:"inherit"}}/>
          <span style={{color:T.txD}}>/ {pdf.numPages}</span>
        </div>
        <button onClick={()=>{if(curPage<pdf.numPages){setCurPage(curPage+1);scrollToPage(curPage+1);}}} disabled={curPage>=pdf.numPages} style={{background:"none",border:"none",color:curPage>=pdf.numPages?T.bd:T.txH,cursor:curPage>=pdf.numPages?"default":"pointer",display:"flex",padding:4,borderRadius:4,transform:"rotate(180deg)"}}>{I.back}</button>
        <div style={{width:1,height:18,background:T.bd,margin:"0 2px"}}/>
        <button onClick={zoomOut} style={{background:"none",border:"none",color:T.txH,cursor:"pointer",display:"flex",padding:4,borderRadius:4,fontSize:16,fontWeight:700,lineHeight:1}}>−</button>
        <span style={{fontSize:12,color:T.txH,fontWeight:600,minWidth:40,textAlign:"center"}}>{Math.round(zoom*100)}%</span>
        <button onClick={zoomIn} style={{background:"none",border:"none",color:T.txH,cursor:"pointer",display:"flex",padding:4,borderRadius:4,fontSize:16,fontWeight:700,lineHeight:1}}>+</button>
      </div>
      {/* Pages */}
      <div ref={containerRef} style={{flex:1,overflow:"auto",WebkitOverflowScrolling:"touch",background:T.bg,padding:mob?8:16,touchAction:"pan-x pan-y"}}>
        <div ref={pagesWrapRef} style={{width:"fit-content",display:"flex",flexDirection:"column",alignItems:"center",gap:mob?8:12,willChange:"transform"}}>
          {pages.map(p=>(
            <canvas key={p} ref={el=>{pageRefs.current[p]=el;}} style={{display:"block",borderRadius:4,boxShadow:"0 2px 12px rgba(0,0,0,.3)"}}/>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ──────────────────────────────────────────────
   Word (.docx) viewer — docx-preview (high-fidelity: pages, fonts, colors,
   column layout, tables with widths), loaded from CDN. mammoth was dropped
   because it discards styling (lost colors/columns → unreadable layout).
   Same client-direct fetch + filenotfound handling as PdfViewer, so the
   self-authenticating fileurl never leaves the device (no MS/Google viewer).
   docx-preview's UMD build needs a global JSZip, so we load that first.
   ────────────────────────────────────────────── */
const JSZIP_CDN="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
const DOCXP_CDN="https://cdn.jsdelivr.net/npm/docx-preview@0.3.7/dist/docx-preview.min.js";
function loadScriptOnce(src){
  return new Promise((resolve,reject)=>{
    const s=document.createElement("script");
    s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error(`load failed: ${src}`));
    document.head.appendChild(s);
  });
}
let docxpLoading=null;
function loadDocxPreview(){
  if(window.docx?.renderAsync) return Promise.resolve(window.docx);
  if(docxpLoading) return docxpLoading;
  docxpLoading=(async()=>{
    if(!window.JSZip) await loadScriptOnce(JSZIP_CDN);   // docx-preview reads global JSZip at eval time
    if(!window.docx?.renderAsync) await loadScriptOnce(DOCXP_CDN);
    if(!window.docx?.renderAsync) throw new Error("docx-preview not found");
    return window.docx;
  })();
  return docxpLoading;
}

const DocxViewer=({url,mob,onStale,onOpen})=>{
  const scrollRef=useRef(null);   // scroll viewport
  const holderRef=useRef(null);   // flow box sized to the *scaled* page
  const scalerRef=useRef(null);   // natural-size box that gets CSS-scaled to fit
  const [err,setErr]=useState(null);
  const [loading,setLoading]=useState(true);
  const [loadMsg,setLoadMsg]=useState(t("mat.loadingWord"));
  // Absolute display scale. null = auto fit-to-width. Mobile defaults to ~40%
  // (a phone is too narrow to read full-fit comfortably); desktop fits the pane.
  const [scale,setScale]=useState(mob?0.4:null);
  const [pct,setPct]=useState(40);    // displayed effective scale (% of real size)
  const effRef=useRef(mob?0.4:1);     // last applied effective scale (for relative zoom steps)
  const bordersRef=useRef([]);        // table borders to keep visible when scaled down

  /* Collect every visible table border so we can keep it ≥1px after scaling.
     Thin borders (0.5pt ≈ 0.67px) become sub-pixel when scaled to 40% and stop
     rendering, so the table grid disappears on mobile. */
  const collectBorders=useCallback(()=>{
    const sk=scalerRef.current;
    if(!sk){bordersRef.current=[];return;}
    const sides=[["borderTopStyle","borderTopWidth"],["borderRightStyle","borderRightWidth"],["borderBottomStyle","borderBottomWidth"],["borderLeftStyle","borderLeftWidth"]];
    const out=[];
    sk.querySelectorAll("table,tr,td,th").forEach(el=>{
      const cs=getComputedStyle(el);
      for(const [ss,ws] of sides){
        const st=cs[ss];
        if(st&&st!=="none"&&st!=="hidden"){
          const w=parseFloat(cs[ws])||0;
          if(w>0) out.push({el,prop:ws,orig:w});
        }
      }
    });
    bordersRef.current=out;
  },[]);

  /* Render at fixed A4 width, then CSS-scale so the real layout is preserved
     instead of reflowed. scale=null → fit the viewport width. */
  const fit=useCallback(()=>{
    const sc=scrollRef.current,h=holderRef.current,sk=scalerRef.current;
    if(!sc||!h||!sk)return;
    const wrap=sk.querySelector(".docx-wrapper");
    if(!wrap)return;
    sk.style.transform="none";
    const natW=wrap.offsetWidth,natH=wrap.offsetHeight;
    if(!natW)return;
    const base=Math.min(1,(sc.clientWidth-(mob?8:24))/natW);
    const eff=scale==null?base:scale;
    // Keep thin table borders ≥~1px once scaled (else they vanish when shrunk).
    const minW=eff<1?1/eff:0;
    for(const b of bordersRef.current) b.el.style[b.prop]=`${Math.max(b.orig,minW)}px`;
    sk.style.transformOrigin="0 0";
    sk.style.transform=`scale(${eff})`;
    h.style.width=`${natW*eff}px`;
    h.style.height=`${natH*eff}px`;
    // Centre when it fits; left-align when zoomed past the viewport so both edges scroll.
    h.style.margin=natW*eff<=sc.clientWidth?"0 auto":"0";
    effRef.current=eff;
    setPct(Math.round(eff*100));
  },[mob,scale]);

  const zoomIn=()=>setScale(Math.min(5,+(effRef.current*1.25).toFixed(3)));
  const zoomOut=()=>setScale(Math.max(0.1,+(effRef.current/1.25).toFixed(3)));
  const zoomReset=()=>setScale(null);   // back to fit-to-width

  /* Re-fit whenever the scale changes. */
  useEffect(()=>{fit();},[scale,fit]);

  useEffect(()=>{
    let cancelled=false;
    setErr(null);setLoading(true);setLoadMsg(t("mat.loadingWord"));
    (async()=>{
      try{
        const lib=await loadDocxPreview();
        if(cancelled)return;
        setLoadMsg(t("mat.downloadingFile"));
        const resp=await fetch(url);
        const ct=(resp.headers.get("content-type")||"").toLowerCase();
        const buf=await resp.arrayBuffer();
        if(!resp.ok||ct.includes("application/json")||new Uint8Array(buf)[0]===0x7b){
          let code=null;
          try{code=JSON.parse(new TextDecoder().decode(buf)).errorcode;}catch{}
          if(code){onStale?.();throw new Error(t("mat.notFoundRefreshing"));}
          if(!resp.ok)throw new Error(`HTTP ${resp.status}`);
        }
        if(cancelled)return;
        const sk=scalerRef.current;
        if(!sk)return;
        sk.innerHTML="";
        setLoadMsg(t("mat.renderingWord"));
        await lib.renderAsync(buf,sk,null,{
          className:"docx",inWrapper:true,breakPages:true,experimental:true,
          useBase64URL:true,renderHeaders:true,renderFooters:true,renderFootnotes:true,renderEndnotes:true,
        });
        if(cancelled)return;
        collectBorders();
        setLoading(false);
        requestAnimationFrame(fit);
        setTimeout(()=>{if(!cancelled){collectBorders();fit();}},150); // re-collect/re-fit after late layout (embedded fonts/images)
      }catch(e){if(!cancelled){setErr(e.message||t("mat.wordLoadFailed"));setLoading(false);}}
    })();
    return()=>{cancelled=true;};
  },[url,onStale,fit,collectBorders]);

  /* Re-fit when the viewport (split-pane / rotation / fullscreen) resizes. */
  useEffect(()=>{
    const sc=scrollRef.current;
    if(!sc||typeof ResizeObserver==="undefined")return;
    const ro=new ResizeObserver(()=>fit());
    ro.observe(sc);
    return()=>ro.disconnect();
  },[fit]);

  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {/* Toolbar */}
      <div style={{display:"flex",alignItems:"center",gap:mob?4:8,padding:mob?"6px 8px":"6px 12px",background:T.bg2,borderBottom:`1px solid ${T.bd}`,flexShrink:0}}>
        <button onClick={zoomOut} disabled={loading||!!err} style={{background:"none",border:"none",color:loading||err?T.bd:T.txH,cursor:loading||err?"default":"pointer",display:"flex",padding:4,borderRadius:4,fontSize:16,fontWeight:700,lineHeight:1}}>−</button>
        <button onClick={zoomReset} disabled={loading||!!err} title={t("mat.fitToWidth")} style={{background:"none",border:"none",color:loading||err?T.bd:T.txH,cursor:loading||err?"default":"pointer",fontSize:12,fontWeight:600,minWidth:44,textAlign:"center",padding:"2px 4px",borderRadius:4,fontFamily:"inherit"}}>{pct}%</button>
        <button onClick={zoomIn} disabled={loading||!!err} style={{background:"none",border:"none",color:loading||err?T.bd:T.txH,cursor:loading||err?"default":"pointer",display:"flex",padding:4,borderRadius:4,fontSize:16,fontWeight:700,lineHeight:1}}>+</button>
      </div>
      {/* Pages */}
      <div ref={scrollRef} style={{flex:1,overflow:"auto",WebkitOverflowScrolling:"touch",background:"#5f6368",position:"relative"}}>
        {loading&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:T.bg,zIndex:2}}><Loader msg={loadMsg} size="md"/></div>}
        {err&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12,color:T.txD,fontSize:13,padding:40,textAlign:"center",background:T.bg,zIndex:2}}><div>{err}</div>{onOpen&&<button onClick={onOpen} style={{padding:"8px 16px",borderRadius:8,border:"none",background:T.accent,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer"}}>{t("mat.openInNewTab")}</button>}</div>}
        <div ref={holderRef} style={{margin:"0 auto"}}><div ref={scalerRef}/></div>
      </div>
    </div>
  );
};

/* Split-view icon (2 columns) */
const SplitIcon=()=><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="12" y1="4" x2="12" y2="20"/></svg>;

/* Fullscreen icon */
const FsIcon=({active})=>active
  ?<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
  :<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>;

/* ──────────────────────────────────────────────
   Preview component (PDF / image / video / audio)
   Works for both Moodle materials and shared files
   ────────────────────────────────────────────── */
export const Preview=({m,mob,onClose,onStale,course,onAnnotate,onOpenNote,session,sessionOrder})=>{
  const ft=m.fileType||detectType(m.mimetype);
  const c=tCol[ft]||T.txD;
  // 教材→ノート（PDFのみ）。既存ノートがあれば「開く」、無ければ取得して「書き込む」
  const [existingNote,setExistingNote]=useState(null);
  const [prepNote,setPrepNote]=useState(false);
  useEffect(()=>{ setExistingNote(findMaterialNote(m.id)); },[m.id]);
  const annotate=async()=>{
    if(prepNote)return;
    if(existingNote){ onOpenNote?.(existingNote.id); return; }
    const url=m.fileurl||m.url||m.proxyUrl;
    if(!url){ onStale?.(); return; }
    setPrepNote(true);
    try{
      const buf=await (await fetch(url)).arrayBuffer();
      let bin=""; const bytes=new Uint8Array(buf);
      for(let i=0;i<bytes.length;i+=0x8000) bin+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));
      const base64=btoa(bin);
      onAnnotate?.({matId:m.id,name:m.filename||m.name,base64,course,session,sessionOrder});
    }catch(e){ console.warn("[mat] annotate fetch",e); onStale?.(); }
    finally{ setPrepNote(false); }
  };
  // Client-direct (fileurl) is the primary path: the LMS rejects server-side
  // fetches (403), so the proxy is only a last-resort fallback. filenotfound is
  // detected client-side instead — Moodle returns it as a JSON body.
  const previewUrl=m.fileurl||m.url||m.proxyUrl;
  const dlUrl=m.fileurl||m.url;
  const wrapRef=useRef(null);
  const [fs,setFs]=useState(false);
  const [mediaErr,setMediaErr]=useState(false);
  useEffect(()=>{setMediaErr(false);},[previewUrl]);
  const onMediaErr=()=>{setMediaErr(true);onStale?.();};

  // In-app fullscreen (CSS overlay) instead of the native Fullscreen API:
  // the OS adds a swipe-down-to-exit gesture to native fullscreen, which
  // dismissed the material unexpectedly. A fixed overlay has no such gesture
  // (exit only via the button / Esc) and also works on iOS, where
  // requestFullscreen on a non-video element is unsupported.
  const toggleFs=()=>setFs(v=>!v);
  useEffect(()=>{
    if(!fs)return;
    const onKey=e=>{if(e.key==="Escape")setFs(false);};
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[fs]);

  return(
    <div ref={wrapRef} style={{display:"flex",flexDirection:"column",overflow:"hidden",background:T.bg,...(fs?{position:"fixed",inset:0,zIndex:2000}:{flex:1,height:"100%"})}}>
      <div style={{display:"flex",alignItems:"center",gap:8,padding:mob?"10px 12px":"8px 14px",borderBottom:`1px solid ${T.bd}`,flexShrink:0,background:T.bg2}}>
        <button onClick={onClose} style={{display:"flex",alignItems:"center",gap:4,background:"none",border:"none",color:T.txD,fontSize:13,cursor:"pointer",padding:0}}>{I.back} {t("common.back")}</button>
        <div style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:13,fontWeight:600,color:T.txH}}>{m.filename||m.name}</div>
        <Tag color={c}>{t(tLblKey[ft]||'mat.ft.file')}</Tag>
        <button onClick={toggleFs} title={fs?t("mat.exitFullscreen"):t("mat.fullscreen")} style={{display:"flex",alignItems:"center",justifyContent:"center",width:30,height:30,borderRadius:6,border:`1px solid ${T.bd}`,background:fs?`${T.accent}18`:T.bg3,color:fs?T.accent:T.txD,cursor:"pointer",flexShrink:0}}><FsIcon active={fs}/></button>
        {ft==="pdf"&&onAnnotate&&<button onClick={annotate} disabled={prepNote} title={existingNote?t("mat.openNote"):t("mat.annotate")} style={{display:"flex",alignItems:"center",gap:3,padding:"5px 10px",borderRadius:6,border:`1px solid ${T.accent}`,background:`${T.accent}14`,color:T.accent,fontSize:12,fontWeight:600,cursor:prepNote?"default":"pointer",opacity:prepNote?0.6:1,flexShrink:0}}>{I.pen} {prepNote?t("mat.preparingNote"):existingNote?t("mat.openNote"):t("mat.annotate")}</button>}
        {dlUrl&&(m.fileurl
          ?<button onClick={()=>openMaterial(m,onStale,{download:true,mob})} style={{display:"flex",alignItems:"center",gap:3,padding:"5px 10px",borderRadius:6,border:"none",background:T.accent,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",flexShrink:0}}>{I.dl} DL</button>
          :<a href={dlUrl} target="_blank" rel="noopener noreferrer" download style={{display:"flex",alignItems:"center",gap:3,padding:"5px 10px",borderRadius:6,background:T.accent,color:"#fff",fontSize:12,fontWeight:600,textDecoration:"none",flexShrink:0}}>{I.dl} DL</a>)}
      </div>
      {ft==="pdf"&&<PdfViewer url={previewUrl} dlUrl={dlUrl} mob={mob} onStale={onStale} onOpen={m.fileurl?()=>openMaterial(m,onStale):null}/>}
      {ft==="document"&&isDocx(m)&&<DocxViewer url={previewUrl} mob={mob} onStale={onStale} onOpen={m.fileurl?()=>openMaterial(m,onStale):null}/>}
      {ft!=="pdf"&&ft!=="document"&&mediaErr&&<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12,color:T.txD,fontSize:13,padding:40,textAlign:"center"}}><div>{t("mat.notFoundRefreshed")}</div>{m.fileurl
        ?<button onClick={()=>openMaterial(m,onStale)} style={{padding:"8px 16px",borderRadius:8,border:"none",background:T.accent,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer"}}>{t("mat.openInNewTab")}</button>
        :dlUrl&&<a href={dlUrl} target="_blank" rel="noopener noreferrer" style={{padding:"8px 16px",borderRadius:8,background:T.accent,color:"#fff",fontSize:13,fontWeight:600,textDecoration:"none"}}>{t("mat.openInNewTab")}</a>}</div>}
      {ft==="image"&&!mediaErr&&<div style={{flex:1,overflow:"auto",display:"flex",alignItems:"center",justifyContent:"center",background:T.bg,padding:16}}><img src={previewUrl} alt={m.filename||m.name} onError={onMediaErr} style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain",borderRadius:4,boxShadow:"0 2px 12px rgba(0,0,0,.3)"}}/></div>}
      {ft==="video"&&!mediaErr&&<div style={{flex:1,overflow:"auto",display:"flex",alignItems:"center",justifyContent:"center",background:T.bg,padding:16}}><video src={previewUrl} controls onError={onMediaErr} style={{maxWidth:"100%",maxHeight:"100%",borderRadius:4}}/></div>}
      {ft==="audio"&&!mediaErr&&<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",background:T.bg,padding:40}}><div style={{textAlign:"center",width:"100%"}}><div style={{fontSize:14,color:T.txH,fontWeight:600,marginBottom:16}}>{m.filename||m.name}</div><audio src={previewUrl} controls onError={onMediaErr} style={{width:"100%",maxWidth:400}}/></div></div>}
      <div style={{display:"flex",alignItems:"center",gap:12,padding:"6px 14px",borderTop:`1px solid ${T.bd}`,flexShrink:0,background:T.bg2,fontSize:11,color:T.txD}}>
        {(m.filesizeFormatted||m.filesize>0)&&<span>{m.filesizeFormatted||fmtSize(m.filesize)}</span>}
        {m.timemodified>0&&<span>{fmtD(m.timemodified)}</span>}
        {m.createdAt&&<span>{fmtDt(m.createdAt)}</span>}
        {m.name&&m.filename&&m.name!==m.filename&&<span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.name}</span>}
      </div>
    </div>
  );
};

/* ──────────────────────────────────────────────
   File list row (Moodle materials)
   selMode 中は開く代わりにチェック選択(一括DL用)。link はDL対象外なので薄く表示
   ────────────────────────────────────────────── */
const isDownloadable=m=>m.fileType!=="link"&&!!m.fileurl;
const FileRow=({m,onClick,onStale,selMode,checked,onToggle})=>{
  const c=tCol[m.fileType]||T.txD;
  const preview=canPreview(m);
  const selectable=isDownloadable(m);
  const handle=selMode
    ?()=>{if(selectable)onToggle(m);}
    :preview?()=>onClick(m):()=>openMaterial(m,onStale);
  return(
    <div onClick={handle} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",borderRadius:6,background:selMode&&checked?`${T.accent}0d`:T.bg2,border:`1px solid ${selMode&&checked?T.accent+'60':T.bd}`,marginBottom:3,textDecoration:"none",cursor:selMode&&!selectable?"default":"pointer",opacity:selMode&&!selectable?0.45:1}}>
      {selMode&&<input type="checkbox" readOnly checked={!!checked} disabled={!selectable} style={{accentColor:T.accent,width:15,height:15,flexShrink:0,margin:0,pointerEvents:"none"}}/>}
      <span style={{color:c,display:"flex",flexShrink:0}}>{m.fileType==="link"?I.arr:I.file}</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{color:T.txH,fontSize:13,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.filename||m.name}</div>
        <div style={{fontSize:11,color:T.txD}}>{[m.filesizeFormatted,fmtD(m.timemodified)].filter(Boolean).join(" · ")}</div>
      </div>
      <Tag color={c}>{t(tLblKey[m.fileType]||'mat.ft.file')}</Tag>
      {!selMode&&m.fileType!=="link"&&<span style={{color:T.txD,display:"flex",flexShrink:0}}>{preview?I.arr:I.dl}</span>}
    </div>
  );
};

/* ──────────────────────────────────────────────
   Shared file row
   ────────────────────────────────────────────── */
const SharedFileRow=({m,onClick,myId,onDelete})=>{
  const ft=detectType(m.mimetype);
  const c=tCol[ft]||T.txD;
  const previewable=m.url&&canPreviewType(m,ft);
  const isMine=myId&&m.uid===myId;
  return(
    <div onClick={()=>previewable?onClick(m):m.url&&window.open(m.url,'_blank')} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",borderRadius:6,background:T.bg2,border:`1px solid ${T.bd}`,marginBottom:3,cursor:"pointer"}}>
      <span style={{color:c,display:"flex",flexShrink:0}}>{I.file}</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{color:T.txH,fontSize:13,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.filename}</div>
        <div style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:T.txD,marginTop:1}}>
          {m.name&&<span>{m.name}</span>}
          {m.filesize>0&&<span>{fmtSize(m.filesize)}</span>}
          {m.createdAt&&<span>{fmtDt(m.createdAt)}</span>}
        </div>
      </div>
      <Tag color={catColor(m.category)}>{catLabel(m.category)}</Tag>
      <Tag color={c}>{t(tLblKey[ft]||'mat.ft.file')}</Tag>
      {isMine&&<button onClick={e=>{e.stopPropagation();if(confirm(t("mat.confirmDeleteFile",{name:m.filename})))onDelete(m.id);}} title={t("common.delete")} style={{display:"flex",alignItems:"center",justifyContent:"center",width:26,height:26,borderRadius:6,border:`1px solid ${T.bd}`,background:"transparent",color:T.red||'#e5534b',cursor:"pointer",flexShrink:0}}>{I.x}</button>}
      <span style={{color:T.txD,display:"flex",flexShrink:0}}>{previewable?I.arr:I.dl}</span>
    </div>
  );
};

/* (UploadArea removed — integrated into SharedMaterials) */

/* ──────────────────────────────────────────────
   Tab: 講義資料 (Moodle materials)
   一括DL: 選択モード(全選択/授業回ごと/個別) → ZIP 生成 → 全環境保存
   ────────────────────────────────────────────── */
const LectureMaterials=({sections,totalFiles,loading,error,mob,onSelect,onRefresh,course})=>{
  const [collapsed,setCollapsed]=useState({});
  const [search,setSearch]=useState("");
  const [selMode,setSelMode]=useState(false);
  const [checked,setChecked]=useState(()=>new Set());
  const [dl,setDl]=useState(null); // {phase:'fetch',done,total} | {phase:'zip',pct}
  const togSec=id=>setCollapsed(p=>({...p,[id]:!p[id]}));

  const filtered=search.trim()
    ?sections.map(s=>({...s,materials:s.materials.filter(m=>(m.name||'').toLowerCase().includes(search.toLowerCase())||(m.filename||'').toLowerCase().includes(search.toLowerCase()))})).filter(s=>s.materials.length>0)
    :sections;

  /* 選択対象 = 検索で表示中の DL 可能ファイル */
  const visibleDl=filtered.flatMap(s=>s.materials.filter(isDownloadable));
  const allChecked=visibleDl.length>0&&visibleDl.every(m=>checked.has(m.id));
  let checkedSize=0;
  for(const s of sections)for(const m of s.materials)if(checked.has(m.id))checkedSize+=m.filesize||0;

  const enterSel=()=>{setSelMode(true);setChecked(new Set(visibleDl.map(m=>m.id)));};
  const exitSel=()=>{if(dl)return;setSelMode(false);setChecked(new Set());};
  const togOne=m=>setChecked(p=>{const n=new Set(p);if(n.has(m.id))n.delete(m.id);else n.add(m.id);return n;});
  const togAll=()=>setChecked(allChecked?new Set():new Set(visibleDl.map(m=>m.id)));
  const togSecSel=sec=>{
    const ms=sec.materials.filter(isDownloadable);
    const all=ms.length>0&&ms.every(m=>checked.has(m.id));
    setChecked(p=>{const n=new Set(p);ms.forEach(m=>{if(all)n.delete(m.id);else n.add(m.id);});return n;});
  };

  const runBulkDl=async()=>{
    console.log('[bulkDl] runBulkDl clicked, checked=',checked.size,'dl=',dl);
    if(dl)return;
    const items=[];
    for(const s of sections)for(const m of s.materials)if(checked.has(m.id)&&isDownloadable(m))items.push({m,section:sections.length>1?s.name:""});
    console.log('[bulkDl] items to download=',items.length);
    if(!items.length){alert(t("mat.dlAllFailed"));return;}
    setDl({phase:'fetch',done:0,total:items.length});
    try{
      const zipName=`${(course?.name||'').replace(/[\\/:*?"<>|]/g,'_').trim()||'materials'}.zip`;
      const res=await bulkDownloadMaterials({items,zipName,mob,onProgress:p=>setDl(p)});
      if(res.stale)onRefresh?.();
      if(!res.saved){alert(t("mat.dlAllFailed"));}
      else{
        if(res.failed.length)alert(t("mat.dlFailedSome",{count:res.failed.length}));
        setSelMode(false);setChecked(new Set());
      }
    }catch(e){
      console.error("[mat] bulk dl",e);
      alert(t("mat.dlSaveFailed"));
    }finally{setDl(null);}
  };
  /* 進捗: 取得 0-80% + ZIP化 80-100% */
  const dlPct=dl?(dl.phase==='fetch'?(dl.total?dl.done/dl.total*80:0):80+(dl.pct||0)*0.2):0;

  if(loading) return <Loader msg={t("mat.loadingMaterials")}/>;
  if(error==='LMS_UNAVAILABLE') return <div style={{textAlign:"center",padding:40,color:T.txD,fontSize:13}}>{t("mat.lmsUnavailable")}</div>;
  if(error) return <div style={{textAlign:"center",padding:40,color:T.txD,fontSize:13}}>{t("mat.materialsFetchFailed")}</div>;

  return(
    <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:12}}>
      {selMode?(
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
          <button onClick={togAll} disabled={!!dl} style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:12,fontWeight:600,cursor:dl?"default":"pointer",flexShrink:0,opacity:dl?0.5:1}}>{allChecked?t("mat.deselectAll"):t("mat.selectAll")}</button>
          <span style={{fontSize:12,color:T.txD,fontWeight:600}}>{t("mat.selectedCount",{count:checked.size})}{checkedSize>0?` · ${fmtSize(checkedSize)}`:''}</span>
          <div style={{flex:1}}/>
          <button onClick={runBulkDl} disabled={!checked.size||!!dl} style={{display:"flex",alignItems:"center",gap:4,padding:"5px 12px",borderRadius:6,border:"none",background:T.accent,color:"#fff",fontSize:12,fontWeight:600,cursor:(!checked.size||dl)?"default":"pointer",flexShrink:0,opacity:(!checked.size||dl)?0.5:1}}>{I.dl} {t("mat.dlZip")}</button>
          <button onClick={exitSel} disabled={!!dl} style={{padding:"5px 12px",borderRadius:6,border:`1px solid ${T.bd}`,background:"transparent",color:T.txD,fontSize:12,fontWeight:600,cursor:dl?"default":"pointer",flexShrink:0,opacity:dl?0.5:1}}>{t("common.cancel")}</button>
        </div>
      ):(
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
          <span style={{fontSize:12,color:T.txD,fontWeight:600}}>{t("mat.materialCount",{count:totalFiles})}</span>
          {onRefresh&&<button onClick={onRefresh} title={t("mat.refresh")} style={{display:"flex",alignItems:"center",justifyContent:"center",width:26,height:26,borderRadius:6,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txD,cursor:"pointer",flexShrink:0}}>{I.reset}</button>}
          {totalFiles>0&&<button onClick={enterSel} title={t("mat.bulkDl")} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:6,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txD,fontSize:12,fontWeight:600,cursor:"pointer",flexShrink:0}}>{I.dl} {t("mat.bulkDl")}</button>}
          <div style={{flex:1,display:"flex",alignItems:"center",gap:4,padding:"4px 8px",borderRadius:6,background:T.bg3,border:`1px solid ${T.bd}`,minWidth:mob?"100%":140,maxWidth:240}}>
            <span style={{color:T.txD,display:"flex"}}>{I.search}</span>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t("mat.searchMaterials")} style={{flex:1,border:"none",background:"transparent",color:T.txH,fontSize:12,outline:"none",fontFamily:"inherit"}}/>
            {search&&<button onClick={()=>setSearch("")} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",padding:0}}>{I.x}</button>}
          </div>
        </div>
      )}
      {dl&&(
        <div style={{marginBottom:10}}>
          <div style={{fontSize:12,color:T.txD,marginBottom:4}}>{dl.phase==='fetch'?t("mat.dlFetching",{done:dl.done,total:dl.total}):t("mat.dlZipping")}</div>
          <div style={{height:6,background:T.bg3,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${dlPct}%`,background:T.accent,transition:"width .2s"}}/></div>
        </div>
      )}
      {filtered.map(sec=>{
        const secDl=sec.materials.filter(isDownloadable);
        const secAll=secDl.length>0&&secDl.every(m=>checked.has(m.id));
        return(
        <div key={sec.id}>
          {sections.length>1&&(
            <div onClick={()=>togSec(sec.id)} style={{display:"flex",alignItems:"center",gap:5,padding:"8px 4px 4px",cursor:"pointer",userSelect:"none"}}>
              {selMode&&secDl.length>0&&<input type="checkbox" checked={secAll} onChange={()=>{}} onClick={e=>{e.stopPropagation();togSecSel(sec);}} style={{accentColor:T.accent,width:14,height:14,margin:0,cursor:"pointer",flexShrink:0}}/>}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.txD} strokeWidth="2.5" style={{transform:collapsed[sec.id]?"none":"rotate(90deg)",transition:"transform .15s"}}><path d="M9 18l6-6-6-6"/></svg>
              <span style={{fontSize:13,fontWeight:700,color:T.txD}}>{sec.name}</span>
              <span style={{fontSize:11,color:T.txD}}>{sec.materials.length}</span>
            </div>
          )}
          {!collapsed[sec.id]&&sec.materials.map(m=><FileRow key={m.id} m={m} onClick={onSelect} onStale={onRefresh} selMode={selMode} checked={checked.has(m.id)} onToggle={togOne}/>)}
        </div>
      );})}
      {filtered.length===0&&!loading&&<div style={{textAlign:"center",padding:40,color:T.txD,fontSize:13}}>{search?t("mat.noSearchResults"):t("mat.noMaterialsYet")}</div>}
    </div>
  );
};

/* ──────────────────────────────────────────────
   Tab: みんなの共有 (Shared materials)
   Flow: select files → pick category dialog → upload
   ────────────────────────────────────────────── */
const SharedMaterials=({courseId,mob,onSelect})=>{
  const {files,loading,uploading,upload,remove}=useSharedMaterials(courseId);
  const me=useCurrentUser();
  const [filter,setFilter]=useState('all');
  const [drag,setDrag]=useState(false);
  const [pending,setPending]=useState(null); // files waiting for category pick
  const [pickCat,setPickCat]=useState('notes');
  const inputRef=useRef(null);
  const dragCounter=useRef(0);

  const filtered=filter==='all'?files:files.filter(f=>f.category===filter);

  /* Stage files for category selection */
  const stageFiles=fl=>{
    if(!fl||!fl.length)return;
    setPending(Array.from(fl));
    setPickCat('notes');
  };
  /* Confirm upload with chosen category */
  const confirmUpload=()=>{
    if(!pending)return;
    pending.forEach(f=>upload(f,pickCat));
    setPending(null);
  };

  const onDragEnter=e=>{e.preventDefault();dragCounter.current++;setDrag(true);};
  const onDragLeave=e=>{e.preventDefault();dragCounter.current--;if(dragCounter.current<=0){dragCounter.current=0;setDrag(false);}};
  const onDragOver=e=>e.preventDefault();
  const onDrop=e=>{e.preventDefault();dragCounter.current=0;setDrag(false);stageFiles(e.dataTransfer.files);};

  if(loading) return <Loader msg={t("mat.loadingShared")}/>;

  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",position:"relative"}}
      onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={onDragOver} onDrop={onDrop}>
      <input ref={inputRef} type="file" multiple hidden onChange={e=>{stageFiles(e.target.files);e.target.value='';}}/>

      {/* Header: filter pills + upload button */}
      <div style={{display:"flex",alignItems:"center",gap:6,padding:"10px 12px",flexWrap:"wrap",flexShrink:0}}>
        <span style={{fontSize:12,color:T.txD,fontWeight:600}}>{t("mat.fileCount",{count:filtered.length})}</span>
        {CATS.map(c=>(
          <button key={c.key} onClick={()=>setFilter(c.key)} style={{padding:"3px 10px",borderRadius:12,fontSize:11,fontWeight:600,border:`1px solid ${filter===c.key?(c.key==='all'?T.accent:c.color):T.bd}`,background:filter===c.key?`${c.key==='all'?T.accent:c.color}20`:'transparent',color:filter===c.key?(c.key==='all'?T.accent:c.color):T.txD,cursor:"pointer",transition:"all .12s"}}>{t(c.labelKey)}</button>
        ))}
        <div style={{flex:1}}/>
        <button onClick={()=>inputRef.current?.click()} disabled={uploading} style={{display:"flex",alignItems:"center",gap:5,padding:"5px 12px",borderRadius:8,border:`1px solid ${T.accent}50`,background:`${T.accent}12`,color:T.accent,fontSize:12,fontWeight:600,cursor:uploading?"wait":"pointer",flexShrink:0}}>
          {uploading?<span style={{display:"flex"}}>{I.reset}</span>:I.upload}
          {uploading?t("mat.uploading"):t("mat.upload")}
        </button>
      </div>

      {/* File list */}
      <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:"0 12px 12px"}}>
        {filtered.map(m=><SharedFileRow key={m.id} m={m} onClick={onSelect} myId={me?.moodleId} onDelete={remove}/>)}
        {filtered.length===0&&<div style={{textAlign:"center",padding:40,color:T.txD,fontSize:13}}>{files.length===0?t("mat.noSharedYet"):t("mat.noSharedInCategory")}</div>}
      </div>

      {/* Drag overlay */}
      {drag&&(
        <div style={{position:"absolute",inset:0,background:`${T.accent}10`,border:`2px dashed ${T.accent}`,borderRadius:8,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,zIndex:10,pointerEvents:"none"}}>
          <span style={{color:T.accent,display:"flex",transform:"scale(1.5)"}}>{I.upload}</span>
          <span style={{fontSize:15,color:T.accent,fontWeight:700}}>{t("mat.dropHere")}</span>
        </div>
      )}

      {/* Category picker dialog (appears after file selection) */}
      {pending&&(
        <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:20}} onClick={()=>setPending(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:T.bg2,borderRadius:12,border:`1px solid ${T.bd}`,padding:mob?"20px 16px":"24px 28px",maxWidth:360,width:"90%",boxShadow:"0 8px 32px rgba(0,0,0,.4)"}}>
            <div style={{fontSize:14,fontWeight:700,color:T.txH,marginBottom:4}}>{t("mat.selectCategory")}</div>
            <div style={{fontSize:12,color:T.txD,marginBottom:14}}>
              {t("mat.filesSelected",{count:pending.length})}: {pending.map(f=>f.name).join(', ')}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:18}}>
              {CATS.filter(c=>c.key!=='all').map(c=>(
                <button key={c.key} onClick={()=>setPickCat(c.key)} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",borderRadius:8,border:`1px solid ${pickCat===c.key?c.color:T.bd}`,background:pickCat===c.key?`${c.color}14`:T.bg3,cursor:"pointer",transition:"all .12s"}}>
                  <div style={{width:10,height:10,borderRadius:"50%",background:c.color,flexShrink:0}}/>
                  <span style={{fontSize:13,fontWeight:pickCat===c.key?700:500,color:pickCat===c.key?c.color:T.txH}}>{t(c.labelKey)}</span>
                </button>
              ))}
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button onClick={()=>setPending(null)} style={{padding:"7px 16px",borderRadius:8,border:`1px solid ${T.bd}`,background:"transparent",color:T.txD,fontSize:13,fontWeight:600,cursor:"pointer"}}>{t("common.cancel")}</button>
              <button onClick={confirmUpload} style={{padding:"7px 20px",borderRadius:8,border:"none",background:T.accent,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>{t("mat.upload")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ──────────────────────────────────────────────
   Main MatView — 2-tab layout
   ────────────────────────────────────────────── */
const MAX_PANES=4; // PC分割表示の最大ペイン数

export const MatView=({course,mob,initialMatId,onInitialConsumed,onAnnotate,onOpenNote})=>{
  const {sections,totalFiles,loading,error,refresh}=useCourseMaterials(course?.moodleId);
  const [tab,setTab]=useState(0); // 0=講義資料, 1=みんなの共有
  /* プレビュー中の教材。モバイルは先頭のみ全画面、PCは最大 MAX_PANES 面まで並べる */
  const [panes,setPanes]=useState([]);
  const [activeIdx,setActiveIdx]=useState(0); // リストクリックの差し替え先ペイン

  const openPane=m=>{setPanes([m]);setActiveIdx(0);};
  const replaceActive=m=>{
    if(!panes.length){openPane(m);return;}
    const i=Math.min(activeIdx,panes.length-1);
    setPanes(panes.map((p,j)=>j===i?m:p));
    setActiveIdx(i);
  };
  const addPane=m=>{
    if(panes.length>=MAX_PANES)return;
    setPanes([...panes,m]);
    setActiveIdx(panes.length);
  };
  const closePane=i=>{
    const n=panes.filter((_,j)=>j!==i);
    setPanes(n);
    setActiveIdx(a=>{const na=i<a?a-1:a;return Math.max(0,Math.min(na,n.length-1));});
  };

  // ホーム「今日の教材」から特定教材を開いた場合、教材一覧ロード後に自動選択
  const initialConsumedRef=useRef(false);
  useEffect(()=>{
    if(!initialMatId||!sections.length||initialConsumedRef.current)return;
    for(const sec of sections){
      const m=sec.materials.find(x=>x.id===initialMatId);
      if(m){
        initialConsumedRef.current=true;
        if(canPreview(m)) openPane(m);
        else openMaterial(m,refresh);
        onInitialConsumed?.();
        return;
      }
    }
  },[initialMatId,sections,onInitialConsumed]);

  /* 教材が属する section（授業回。例: 第1回）を引く。並び順は section インデックス */
  const matSession=m=>{
    const i=m?sections.findIndex(s=>s.materials.some(mm=>mm.id===m.id)):-1;
    return i>=0?{session:sections[i].name||null,sessionOrder:i}:{session:null,sessionOrder:null};
  };

  /* Mobile: full-screen preview */
  if(panes.length&&mob){
    const m=panes[0],ss=matSession(m);
    return <Preview m={m} mob onClose={()=>setPanes([])} onStale={refresh} course={course} onAnnotate={onAnnotate} onOpenNote={onOpenNote} session={ss.session} sessionOrder={ss.sessionOrder}/>;
  }

  /* Desktop: split view when previewing (複数ペイン可) */
  if(panes.length&&!mob){
    const isShared=!!panes[0].storagePath;
    const canSplit=!isShared&&panes.length<MAX_PANES;
    return(
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        <div style={{width:280,flexShrink:0,borderRight:`1px solid ${T.bd}`,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:10}}>
          {isShared
            ? <div style={{padding:8}}>
                <div style={{fontSize:11,fontWeight:700,color:T.txD,marginBottom:8}}>{t("mat.tabShared")}</div>
                <div style={{padding:"7px 8px",borderRadius:6,background:`${T.accent}14`,border:`1px solid ${T.accent}40`}}>
                  <div style={{color:T.accent,fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{panes[0].filename}</div>
                </div>
              </div>
            : sections.map(sec=>(
                <div key={sec.id} style={{marginBottom:8}}>
                  <div style={{fontSize:11,fontWeight:700,color:T.txD,padding:"4px 6px",marginBottom:2}}>{sec.name}</div>
                  {sec.materials.map(m=>{
                    const c=tCol[m.fileType]||T.txD;
                    const openIdx=panes.findIndex(p=>p.id===m.id);
                    const open=openIdx!==-1;
                    const active=openIdx===activeIdx&&open;
                    return(
                    <div key={m.id} onClick={()=>canPreview(m)?replaceActive(m):openMaterial(m,refresh)} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 8px",borderRadius:6,background:open?`${T.accent}14`:T.bg2,border:`1px solid ${active?T.accent:open?T.accent+'40':T.bd}`,marginBottom:2,cursor:"pointer"}}>
                      <span style={{color:c,display:"flex",flexShrink:0}}>{I.file}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{color:open?T.accent:T.txH,fontSize:12,fontWeight:open?600:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.filename||m.name}</div>
                      </div>
                      {canSplit&&canPreview(m)&&(
                        <button onClick={e=>{e.stopPropagation();addPane(m);}} title={t("mat.openSplit")} style={{display:"flex",alignItems:"center",justifyContent:"center",width:20,height:20,borderRadius:4,border:"none",background:"transparent",color:T.txD,cursor:"pointer",flexShrink:0,padding:0}}><SplitIcon/></button>
                      )}
                    </div>
                  );})}
                </div>
              ))
          }
        </div>
        {panes.map((p,i)=>{
          const ss=matSession(p);
          return(
          <div key={`${p.id}_${i}`} onMouseDownCapture={()=>setActiveIdx(i)} style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",overflow:"hidden",borderLeft:i>0?`1px solid ${T.bd}`:"none",borderTop:`2px solid ${panes.length>1&&i===activeIdx?T.accent:"transparent"}`}}>
            <Preview m={p} mob={false} onClose={()=>closePane(i)} onStale={refresh} course={course} onAnnotate={onAnnotate} onOpenNote={onOpenNote} session={ss.session} sessionOrder={ss.sessionOrder}/>
          </div>
        );})}
      </div>
    );
  }

  /* Default: tabbed view */
  const tabs=[
    {label:t("mat.tabLectures"),icon:I.clip},
    {label:t("mat.tabShared"),icon:I.upload},
  ];

  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {/* Tab bar */}
      <div style={{display:"flex",borderBottom:`1px solid ${T.bd}`,flexShrink:0,background:T.bg2}}>
        {tabs.map((tb,i)=>(
          <button key={i} onClick={()=>setTab(i)} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:mob?"10px 8px":"10px 16px",border:"none",borderBottom:`2px solid ${tab===i?T.accent:"transparent"}`,background:"transparent",color:tab===i?T.accent:T.txD,fontSize:13,fontWeight:tab===i?700:500,cursor:"pointer",transition:"all .15s"}}>
            <span style={{display:"flex"}}>{tb.icon}</span>
            {tb.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab===0&&<LectureMaterials sections={sections} totalFiles={totalFiles} loading={loading} error={error} mob={mob} onSelect={openPane} onRefresh={refresh} course={course}/>}
      {tab===1&&<SharedMaterials courseId={course?.moodleId} mob={mob} onSelect={m=>{
        const ft=detectType(m.mimetype);
        if(m.url&&PREVIEWABLE.has(ft)){
          openPane({...m,fileType:ft});
        }else if(m.url){
          window.open(m.url,'_blank');
        }
      }}/>}
    </div>
  );
};
