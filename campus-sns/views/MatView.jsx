import React, { useState, useEffect, useRef, useCallback } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { Tag, Loader } from "../shared.jsx";
import { useCourseMaterials } from "../hooks/useCourseMaterials.js";
import { useSharedMaterials } from "../hooks/useSharedMaterials.js";
import { useCurrentUser } from "../hooks/useCurrentUser.js";

const tCol={pdf:'#e5534b',slide:'#d4843e',document:'#6375f0',spreadsheet:'#3dae72',image:'#a855c7',video:'#2d9d8f',audio:'#c6a236',archive:'#68687a',code:'#3dae72',text:'#68687a',link:'#6375f0',file:'#68687a'};
const tLbl={pdf:'PDF',slide:'スライド',document:'文書',spreadsheet:'表計算',image:'画像',video:'動画',audio:'音声',archive:'圧縮',code:'コード',text:'テキスト',link:'リンク',file:'ファイル'};
const fmtD=ts=>{if(!ts)return'';const d=new Date(ts*1000);return`${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;};
const fmtDt=d=>{if(!d)return'';return`${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;};
const fmtSize=b=>{if(!b)return'';if(b<1024)return`${b} B`;if(b<1048576)return`${(b/1024).toFixed(1)} KB`;return`${(b/1048576).toFixed(1)} MB`;};
const PREVIEWABLE=new Set(['pdf','image','video','audio']);
const canPreview=m=>m&&m.fileurl&&PREVIEWABLE.has(m.fileType);

/* Detect file type from mimetype */
const detectType=mime=>{
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
  {key:'all',label:'すべて',color:T.txD},
  {key:'past_exam',label:'過去問',color:'#e5534b'},
  {key:'notes',label:'ノート',color:'#3dae72'},
  {key:'exercise',label:'演習',color:'#6375f0'},
  {key:'other',label:'その他',color:'#68687a'},
];
const catLabel=k=>CATS.find(c=>c.key===k)?.label||k;
const catColor=k=>CATS.find(c=>c.key===k)?.color||T.txD;

/* ──────────────────────────────────────────────
   PDF.js CDN loader — v3 legacy build (UMD)
   ────────────────────────────────────────────── */
const PDFJS_VER="3.11.174";
const PDFJS_CDN=`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}`;
let pdfjsLoading=null;
function loadPdfjs(){
  if(window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if(pdfjsLoading) return pdfjsLoading;
  pdfjsLoading=new Promise((resolve,reject)=>{
    const s=document.createElement("script");
    s.src=`${PDFJS_CDN}/pdf.min.js`;
    s.onload=()=>{
      if(window.pdfjsLib){
        window.pdfjsLib.GlobalWorkerOptions.workerSrc=`${PDFJS_CDN}/pdf.worker.min.js`;
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
const PdfViewer=({url,dlUrl,mob})=>{
  const [pdf,setPdf]=useState(null);
  const [pages,setPages]=useState([]);
  const [zoom,setZoom]=useState(0.75);
  const [curPage,setCurPage]=useState(1);
  const [err,setErr]=useState(null);
  const [loadMsg,setLoadMsg]=useState("PDF.js を読み込み中...");
  const containerRef=useRef(null);
  const pageRefs=useRef({});
  const renderTasks=useRef({});
  const DPR=typeof window!=="undefined"?window.devicePixelRatio||1:1;

  /* Load PDF: fetch as ArrayBuffer first, then pass data to PDF.js */
  useEffect(()=>{
    let cancelled=false;
    setPdf(null);setPages([]);setCurPage(1);setErr(null);setLoadMsg("PDF.js を読み込み中...");
    (async()=>{
      try{
        const lib=await loadPdfjs();
        if(cancelled)return;
        setLoadMsg("PDF をダウンロード中...");
        const resp=await fetch(url);
        if(!resp.ok)throw new Error(`HTTP ${resp.status}`);
        const buf=await resp.arrayBuffer();
        if(cancelled)return;
        setLoadMsg("PDF を解析中...");
        const doc=await lib.getDocument({data:buf,cMapUrl:`${PDFJS_CDN}/cmaps/`,cMapPacked:true}).promise;
        if(cancelled)return;
        setPdf(doc);
        setPages(Array.from({length:doc.numPages},(_,i)=>i+1));
      }catch(e){if(!cancelled)setErr(e.message||"PDF読み込み失敗");}
    })();
    return()=>{cancelled=true;};
  },[url]);

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
      const ct=el.scrollTop+el.clientHeight/3;
      for(let i=pages.length-1;i>=0;i--){
        const c=pageRefs.current[pages[i]];
        if(c&&c.offsetTop<=ct){setCurPage(pages[i]);break;}
      }
    };
    el.addEventListener("scroll",onScroll,{passive:true});
    return()=>el.removeEventListener("scroll",onScroll);
  },[pages]);

  const scrollToPage=n=>{
    const c=pageRefs.current[n];
    if(c&&containerRef.current) containerRef.current.scrollTo({top:c.offsetTop-8,behavior:"smooth"});
  };
  const zoomIn=()=>setZoom(z=>Math.min(z+0.25,3));
  const zoomOut=()=>setZoom(z=>Math.max(z-0.25,0.5));

  if(err) return <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12,color:T.txD,fontSize:13,padding:40}}><div>{err}</div>{dlUrl&&<a href={dlUrl} target="_blank" rel="noopener noreferrer" style={{padding:"8px 16px",borderRadius:8,background:T.accent,color:"#fff",fontSize:13,fontWeight:600,textDecoration:"none"}}>新しいタブで開く</a>}</div>;
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
      <div ref={containerRef} style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",background:T.bg,padding:mob?8:16,display:"flex",flexDirection:"column",alignItems:"center",gap:mob?8:12}}>
        {pages.map(p=>(
          <canvas key={p} ref={el=>{pageRefs.current[p]=el;}} style={{display:"block",borderRadius:4,boxShadow:"0 2px 12px rgba(0,0,0,.3)"}}/>
        ))}
      </div>
    </div>
  );
};

/* Fullscreen icon */
const FsIcon=({active})=>active
  ?<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
  :<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>;

/* ──────────────────────────────────────────────
   Preview component (PDF / image / video / audio)
   Works for both Moodle materials and shared files
   ────────────────────────────────────────────── */
const Preview=({m,mob,onClose})=>{
  const ft=m.fileType||detectType(m.mimetype);
  const c=tCol[ft]||T.txD;
  const previewUrl=m.fileurl||m.url||m.proxyUrl;
  const dlUrl=m.fileurl||m.url;
  const wrapRef=useRef(null);
  const [fs,setFs]=useState(false);

  useEffect(()=>{
    const onChange=()=>setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange",onChange);
    return()=>document.removeEventListener("fullscreenchange",onChange);
  },[]);

  const toggleFs=()=>{
    if(!wrapRef.current)return;
    if(document.fullscreenElement){
      document.exitFullscreen().catch(()=>{});
    }else{
      wrapRef.current.requestFullscreen().catch(()=>{});
    }
  };

  return(
    <div ref={wrapRef} style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",height:"100%",background:T.bg}}>
      <div style={{display:"flex",alignItems:"center",gap:8,padding:mob?"10px 12px":"8px 14px",borderBottom:`1px solid ${T.bd}`,flexShrink:0,background:T.bg2}}>
        <button onClick={onClose} style={{display:"flex",alignItems:"center",gap:4,background:"none",border:"none",color:T.txD,fontSize:13,cursor:"pointer",padding:0}}>{I.back} 戻る</button>
        <div style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:13,fontWeight:600,color:T.txH}}>{m.filename||m.name}</div>
        <Tag color={c}>{tLbl[ft]||'ファイル'}</Tag>
        <button onClick={toggleFs} title={fs?"全画面解除":"全画面"} style={{display:"flex",alignItems:"center",justifyContent:"center",width:30,height:30,borderRadius:6,border:`1px solid ${T.bd}`,background:fs?`${T.accent}18`:T.bg3,color:fs?T.accent:T.txD,cursor:"pointer",flexShrink:0}}><FsIcon active={fs}/></button>
        {dlUrl&&<a href={dlUrl} target="_blank" rel="noopener noreferrer" download style={{display:"flex",alignItems:"center",gap:3,padding:"5px 10px",borderRadius:6,background:T.accent,color:"#fff",fontSize:12,fontWeight:600,textDecoration:"none",flexShrink:0}}>{I.dl} DL</a>}
      </div>
      {ft==="pdf"&&<PdfViewer url={previewUrl} dlUrl={dlUrl} mob={mob}/>}
      {ft==="image"&&<div style={{flex:1,overflow:"auto",display:"flex",alignItems:"center",justifyContent:"center",background:T.bg,padding:16}}><img src={previewUrl} alt={m.filename||m.name} style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain",borderRadius:4,boxShadow:"0 2px 12px rgba(0,0,0,.3)"}}/></div>}
      {ft==="video"&&<div style={{flex:1,overflow:"auto",display:"flex",alignItems:"center",justifyContent:"center",background:T.bg,padding:16}}><video src={previewUrl} controls style={{maxWidth:"100%",maxHeight:"100%",borderRadius:4}}/></div>}
      {ft==="audio"&&<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",background:T.bg,padding:40}}><div style={{textAlign:"center",width:"100%"}}><div style={{fontSize:14,color:T.txH,fontWeight:600,marginBottom:16}}>{m.filename||m.name}</div><audio src={previewUrl} controls style={{width:"100%",maxWidth:400}}/></div></div>}
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
   ────────────────────────────────────────────── */
const FileRow=({m,onClick})=>{
  const c=tCol[m.fileType]||T.txD;
  const preview=canPreview(m);
  const Row=preview?"div":"a";
  const extra=preview?{onClick:()=>onClick(m)}:{href:m.fileurl,target:"_blank",rel:"noopener noreferrer"};
  return(
    <Row {...extra} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",borderRadius:6,background:T.bg2,border:`1px solid ${T.bd}`,marginBottom:3,textDecoration:"none",cursor:"pointer"}}>
      <span style={{color:c,display:"flex",flexShrink:0}}>{m.fileType==="link"?I.arr:I.file}</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{color:T.txH,fontSize:13,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.filename||m.name}</div>
        <div style={{fontSize:11,color:T.txD}}>{[m.filesizeFormatted,fmtD(m.timemodified)].filter(Boolean).join(" · ")}</div>
      </div>
      <Tag color={c}>{tLbl[m.fileType]||'ファイル'}</Tag>
      {m.fileType!=="link"&&<span style={{color:T.txD,display:"flex",flexShrink:0}}>{preview?I.arr:I.dl}</span>}
    </Row>
  );
};

/* ──────────────────────────────────────────────
   Shared file row
   ────────────────────────────────────────────── */
const SharedFileRow=({m,onClick,myId,onDelete})=>{
  const ft=detectType(m.mimetype);
  const c=tCol[ft]||T.txD;
  const previewable=m.url&&PREVIEWABLE.has(ft);
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
      <Tag color={c}>{tLbl[ft]||'ファイル'}</Tag>
      {isMine&&<button onClick={e=>{e.stopPropagation();if(confirm(`「${m.filename}」を削除しますか？`))onDelete(m.id);}} title="削除" style={{display:"flex",alignItems:"center",justifyContent:"center",width:26,height:26,borderRadius:6,border:`1px solid ${T.bd}`,background:"transparent",color:T.red||'#e5534b',cursor:"pointer",flexShrink:0}}>{I.x}</button>}
      <span style={{color:T.txD,display:"flex",flexShrink:0}}>{previewable?I.arr:I.dl}</span>
    </div>
  );
};

/* (UploadArea removed — integrated into SharedMaterials) */

/* ──────────────────────────────────────────────
   Tab: 講義資料 (Moodle materials)
   ────────────────────────────────────────────── */
const LectureMaterials=({sections,totalFiles,loading,error,mob,onSelect})=>{
  const [collapsed,setCollapsed]=useState({});
  const [search,setSearch]=useState("");
  const togSec=id=>setCollapsed(p=>({...p,[id]:!p[id]}));

  const filtered=search.trim()
    ?sections.map(s=>({...s,materials:s.materials.filter(m=>(m.name||'').toLowerCase().includes(search.toLowerCase())||(m.filename||'').toLowerCase().includes(search.toLowerCase()))})).filter(s=>s.materials.length>0)
    :sections;

  if(loading) return <Loader msg="教材を読み込み中"/>;
  if(error==='LMS_UNAVAILABLE') return <div style={{textAlign:"center",padding:40,color:T.txD,fontSize:13}}>LMS に接続できません（学外ネットワークからはアクセスできない場合があります）</div>;
  if(error) return <div style={{textAlign:"center",padding:40,color:T.txD,fontSize:13}}>教材の取得に失敗しました</div>;

  return(
    <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:12}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
        <span style={{fontSize:12,color:T.txD,fontWeight:600}}>{totalFiles}件の教材</span>
        <div style={{flex:1,display:"flex",alignItems:"center",gap:4,padding:"4px 8px",borderRadius:6,background:T.bg3,border:`1px solid ${T.bd}`,minWidth:mob?"100%":140,maxWidth:240}}>
          <span style={{color:T.txD,display:"flex"}}>{I.search}</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="教材を検索..." style={{flex:1,border:"none",background:"transparent",color:T.txH,fontSize:12,outline:"none",fontFamily:"inherit"}}/>
          {search&&<button onClick={()=>setSearch("")} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",padding:0}}>{I.x}</button>}
        </div>
      </div>
      {filtered.map(sec=>(
        <div key={sec.id}>
          {sections.length>1&&(
            <div onClick={()=>togSec(sec.id)} style={{display:"flex",alignItems:"center",gap:5,padding:"8px 4px 4px",cursor:"pointer",userSelect:"none"}}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.txD} strokeWidth="2.5" style={{transform:collapsed[sec.id]?"none":"rotate(90deg)",transition:"transform .15s"}}><path d="M9 18l6-6-6-6"/></svg>
              <span style={{fontSize:13,fontWeight:700,color:T.txD}}>{sec.name}</span>
              <span style={{fontSize:11,color:T.txD}}>{sec.materials.length}</span>
            </div>
          )}
          {!collapsed[sec.id]&&sec.materials.map(m=><FileRow key={m.id} m={m} onClick={onSelect}/>)}
        </div>
      ))}
      {filtered.length===0&&!loading&&<div style={{textAlign:"center",padding:40,color:T.txD,fontSize:13}}>{search?"検索結果がありません":"教材はまだありません"}</div>}
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

  if(loading) return <Loader msg="共有資料を読み込み中"/>;

  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",position:"relative"}}
      onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={onDragOver} onDrop={onDrop}>
      <input ref={inputRef} type="file" multiple hidden onChange={e=>{stageFiles(e.target.files);e.target.value='';}}/>

      {/* Header: filter pills + upload button */}
      <div style={{display:"flex",alignItems:"center",gap:6,padding:"10px 12px",flexWrap:"wrap",flexShrink:0}}>
        <span style={{fontSize:12,color:T.txD,fontWeight:600}}>{filtered.length}件</span>
        {CATS.map(c=>(
          <button key={c.key} onClick={()=>setFilter(c.key)} style={{padding:"3px 10px",borderRadius:12,fontSize:11,fontWeight:600,border:`1px solid ${filter===c.key?(c.key==='all'?T.accent:c.color):T.bd}`,background:filter===c.key?`${c.key==='all'?T.accent:c.color}20`:'transparent',color:filter===c.key?(c.key==='all'?T.accent:c.color):T.txD,cursor:"pointer",transition:"all .12s"}}>{c.label}</button>
        ))}
        <div style={{flex:1}}/>
        <button onClick={()=>inputRef.current?.click()} disabled={uploading} style={{display:"flex",alignItems:"center",gap:5,padding:"5px 12px",borderRadius:8,border:`1px solid ${T.accent}50`,background:`${T.accent}12`,color:T.accent,fontSize:12,fontWeight:600,cursor:uploading?"wait":"pointer",flexShrink:0}}>
          {uploading?<span style={{display:"flex"}}>{I.reset}</span>:I.upload}
          {uploading?"送信中...":"アップロード"}
        </button>
      </div>

      {/* File list */}
      <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:"0 12px 12px"}}>
        {filtered.map(m=><SharedFileRow key={m.id} m={m} onClick={onSelect} myId={me?.moodleId} onDelete={remove}/>)}
        {filtered.length===0&&<div style={{textAlign:"center",padding:40,color:T.txD,fontSize:13}}>{files.length===0?"まだ共有資料はありません":"このカテゴリの資料はありません"}</div>}
      </div>

      {/* Drag overlay */}
      {drag&&(
        <div style={{position:"absolute",inset:0,background:`${T.accent}10`,border:`2px dashed ${T.accent}`,borderRadius:8,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,zIndex:10,pointerEvents:"none"}}>
          <span style={{color:T.accent,display:"flex",transform:"scale(1.5)"}}>{I.upload}</span>
          <span style={{fontSize:15,color:T.accent,fontWeight:700}}>ここにドロップ</span>
        </div>
      )}

      {/* Category picker dialog (appears after file selection) */}
      {pending&&(
        <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:20}} onClick={()=>setPending(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:T.bg2,borderRadius:12,border:`1px solid ${T.bd}`,padding:mob?"20px 16px":"24px 28px",maxWidth:360,width:"90%",boxShadow:"0 8px 32px rgba(0,0,0,.4)"}}>
            <div style={{fontSize:14,fontWeight:700,color:T.txH,marginBottom:4}}>カテゴリを選択</div>
            <div style={{fontSize:12,color:T.txD,marginBottom:14}}>
              {pending.length}件のファイル: {pending.map(f=>f.name).join(', ')}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:18}}>
              {CATS.filter(c=>c.key!=='all').map(c=>(
                <button key={c.key} onClick={()=>setPickCat(c.key)} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",borderRadius:8,border:`1px solid ${pickCat===c.key?c.color:T.bd}`,background:pickCat===c.key?`${c.color}14`:T.bg3,cursor:"pointer",transition:"all .12s"}}>
                  <div style={{width:10,height:10,borderRadius:"50%",background:c.color,flexShrink:0}}/>
                  <span style={{fontSize:13,fontWeight:pickCat===c.key?700:500,color:pickCat===c.key?c.color:T.txH}}>{c.label}</span>
                </button>
              ))}
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button onClick={()=>setPending(null)} style={{padding:"7px 16px",borderRadius:8,border:`1px solid ${T.bd}`,background:"transparent",color:T.txD,fontSize:13,fontWeight:600,cursor:"pointer"}}>キャンセル</button>
              <button onClick={confirmUpload} style={{padding:"7px 20px",borderRadius:8,border:"none",background:T.accent,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>アップロード</button>
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
export const MatView=({course,mob,initialMatId,onInitialConsumed})=>{
  const {sections,totalFiles,loading,error}=useCourseMaterials(course?.moodleId);
  const [tab,setTab]=useState(0); // 0=講義資料, 1=みんなの共有
  const [sel,setSel]=useState(null);

  // ホーム「今日の教材」から特定教材を開いた場合、教材一覧ロード後に自動選択
  const initialConsumedRef=useRef(false);
  useEffect(()=>{
    if(!initialMatId||!sections.length||initialConsumedRef.current)return;
    for(const sec of sections){
      const m=sec.materials.find(x=>x.id===initialMatId);
      if(m){
        initialConsumedRef.current=true;
        if(canPreview(m)) setSel(m);
        else if(m.fileurl) window.open(m.fileurl,'_blank');
        onInitialConsumed?.();
        return;
      }
    }
  },[initialMatId,sections,onInitialConsumed]);

  /* Mobile: full-screen preview */
  if(sel&&mob) return <Preview m={sel} mob onClose={()=>setSel(null)}/>;

  /* Desktop: split view when previewing */
  if(sel&&!mob){
    const isShared=!!sel.storagePath;
    return(
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        <div style={{width:280,flexShrink:0,borderRight:`1px solid ${T.bd}`,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:10}}>
          {isShared
            ? <div style={{padding:8}}>
                <div style={{fontSize:11,fontWeight:700,color:T.txD,marginBottom:8}}>みんなの共有</div>
                <div style={{padding:"7px 8px",borderRadius:6,background:`${T.accent}14`,border:`1px solid ${T.accent}40`}}>
                  <div style={{color:T.accent,fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sel.filename}</div>
                </div>
              </div>
            : sections.map(sec=>(
                <div key={sec.id} style={{marginBottom:8}}>
                  <div style={{fontSize:11,fontWeight:700,color:T.txD,padding:"4px 6px",marginBottom:2}}>{sec.name}</div>
                  {sec.materials.map(m=>{const c=tCol[m.fileType]||T.txD;const active=sel.id===m.id;return(
                    <div key={m.id} onClick={()=>canPreview(m)?setSel(m):window.open(m.fileurl,'_blank')} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 8px",borderRadius:6,background:active?`${T.accent}14`:T.bg2,border:`1px solid ${active?T.accent+'40':T.bd}`,marginBottom:2,cursor:"pointer"}}>
                      <span style={{color:c,display:"flex",flexShrink:0}}>{I.file}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{color:active?T.accent:T.txH,fontSize:12,fontWeight:active?600:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.filename||m.name}</div>
                      </div>
                    </div>
                  );})}
                </div>
              ))
          }
        </div>
        <Preview m={sel} mob={false} onClose={()=>setSel(null)}/>
      </div>
    );
  }

  /* Default: tabbed view */
  const tabs=[
    {label:'講義資料',icon:I.clip},
    {label:'みんなの共有',icon:I.upload},
  ];

  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {/* Tab bar */}
      <div style={{display:"flex",borderBottom:`1px solid ${T.bd}`,flexShrink:0,background:T.bg2}}>
        {tabs.map((t,i)=>(
          <button key={i} onClick={()=>setTab(i)} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:mob?"10px 8px":"10px 16px",border:"none",borderBottom:`2px solid ${tab===i?T.accent:"transparent"}`,background:"transparent",color:tab===i?T.accent:T.txD,fontSize:13,fontWeight:tab===i?700:500,cursor:"pointer",transition:"all .15s"}}>
            <span style={{display:"flex"}}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab===0&&<LectureMaterials sections={sections} totalFiles={totalFiles} loading={loading} error={error} mob={mob} onSelect={setSel}/>}
      {tab===1&&<SharedMaterials courseId={course?.moodleId} mob={mob} onSelect={m=>{
        const ft=detectType(m.mimetype);
        if(m.url&&PREVIEWABLE.has(ft)){
          setSel({...m,fileType:ft});
        }else if(m.url){
          window.open(m.url,'_blank');
        }
      }}/>}
    </div>
  );
};
