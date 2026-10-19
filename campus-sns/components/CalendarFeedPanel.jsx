import React, { useState, useEffect } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { t } from "../i18n.js";
import { isNative } from "../capacitor.js";
import { openInSystemBrowser } from "../openMaterial.js";
import { showToast } from "../hooks/useToast.js";

// Calendar → "連携": issue / copy / rotate / revoke the iCal subscription URL
// (state + sync live in hooks/useCalendarFeed.js).

const openUrl=url=>{if(isNative())openInSystemBrowser(url);else window.open(url,"_blank","noopener");};
const fmtTime=iso=>{const d=new Date(iso);return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;};

export const CalendarFeedPanel=({feed,mob,onBack})=>{
  const {status,busy,enable,rotate,disable,refresh}=feed;
  const [copied,setCopied]=useState(false);
  // Fresh status on open — the feed may have been turned on/off on another device.
  useEffect(()=>{refresh();},[refresh]);

  const url=status.enabled?status.url:null;
  const webcal=url?url.replace(/^https?:/,"webcal:"):null;
  const isAndroid=typeof navigator!=="undefined"&&/android/i.test(navigator.userAgent);
  const run=async fn=>{if(!(await fn()))showToast(t("cal.feedError"));};
  const copy=async()=>{try{await navigator.clipboard.writeText(url);setCopied(true);setTimeout(()=>setCopied(false),2000);}catch{showToast(t("feed.copyFailed"));}};
  const onRotate=()=>{if(confirm(t("cal.feedRotateConfirm")))run(rotate);};
  const onDisable=()=>{if(confirm(t("cal.feedDisableConfirm")))run(disable);};

  const card={background:T.bg2,border:`1px solid ${T.bd}`,borderRadius:12,padding:12,display:"flex",flexDirection:"column",gap:10};
  const btn=(primary)=>({width:"100%",padding:"11px 0",borderRadius:8,border:primary?"none":`1px solid ${T.bd}`,background:primary?T.accent:T.bg3,color:primary?"#fff":T.txH,fontSize:14,fontWeight:600,cursor:busy?"default":"pointer",opacity:busy?.6:1});
  const note={fontSize:12,color:T.txD,lineHeight:1.6,margin:0};
  const notes=[t("cal.feedDelayNote"),t("cal.feedSyncNote"),t("cal.feedPrivacyNote")];

  return(
    <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:mob?14:20}}>
      <div style={{maxWidth:560,display:"flex",flexDirection:"column",gap:12}}>
        <button onClick={onBack} style={{display:"flex",alignItems:"center",gap:4,background:"none",border:"none",color:T.txD,fontSize:13,cursor:"pointer",padding:0,alignSelf:"flex-start"}}>{I.back} {t("common.back")}</button>
        <h2 style={{color:T.txH,margin:0,fontSize:mob?18:20,fontWeight:700}}>{t("cal.feedTitle")}</h2>
        <p style={{...note,fontSize:13,color:T.tx}}>{t("cal.feedDesc")}</p>

        <div style={card}>
          <div style={{fontSize:12,color:T.txD}}>{t("cal.feedIncludes")}</div>
          <div style={{fontSize:13,color:T.txH,lineHeight:1.6}}>{t("cal.feedIncludesList")}</div>
        </div>

        {!url?<>
          <button onClick={()=>run(enable)} disabled={busy} style={btn(true)}>{t("cal.feedEnable")}</button>
          <p style={note}>{t("cal.feedPrivacyNote")}</p>
        </>:<>
          <div style={card}>
            <div style={{fontSize:12,color:T.txD}}>{t("cal.feedUrl")}</div>
            <div style={{display:"flex",gap:6}}>
              <input readOnly value={url} onFocus={e=>e.target.select()} style={{flex:1,minWidth:0,padding:"9px 10px",borderRadius:8,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:12,fontFamily:"ui-monospace,SFMono-Regular,Menlo,monospace",outline:"none"}}/>
              <button onClick={copy} style={{flexShrink:0,display:"flex",alignItems:"center",gap:4,padding:"0 12px",borderRadius:8,border:`1px solid ${copied?T.green:T.bd}`,background:copied?`${T.green}14`:T.bg3,color:copied?T.green:T.txH,fontSize:12,fontWeight:600,cursor:"pointer"}}>{copied?<>{I.chk}{t("cal.feedCopied")}</>:t("cal.feedCopy")}</button>
            </div>
            <div style={{fontSize:11,color:T.txD}}>{status.syncedAt?t("cal.feedLastSync",{d:fmtTime(status.syncedAt)}):t("cal.feedNotSynced")}</div>
          </div>

          <button onClick={()=>openUrl(`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`)} style={btn(true)}>{t("cal.feedAddGoogle")}</button>
          <p style={note}>{t("cal.feedGoogleHint")}</p>
          {!isAndroid&&<button onClick={()=>{window.location.href=webcal;}} style={btn(false)}>{t("cal.feedAddApple")}</button>}

          <div style={{...card,gap:6}}>
            {notes.map((n,i)=><p key={i} style={note}>・{n}</p>)}
          </div>

          <div style={{display:"flex",gap:8}}>
            <button onClick={onRotate} disabled={busy} style={{...btn(false),flex:1,fontSize:13}}>{t("cal.feedRotate")}</button>
            <button onClick={onDisable} disabled={busy} style={{...btn(false),flex:1,fontSize:13,border:`1px solid ${T.red}33`,background:`${T.red}10`,color:T.red}}>{t("cal.feedDisable")}</button>
          </div>
        </>}
      </div>
    </div>
  );
};
