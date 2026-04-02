import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { T, updateT, ACCENT_PRESETS, isDarkMode } from "./theme.js";
import { I } from "./icons.jsx";
import { QData, ASGN0, MYTK0, EVENTS0, REVIEWS0, MYEVENTS0, SCHOOLS, DEPTS, UNIT_COL, evCat } from "./data.js";
import { DEMO_EVENTS, DEMO_REVIEWS, DEMO_MY_EVENTS, DEMO_TASKS, DEMO_PERSONAS, buildDemoDataForPersona } from "./demoData.js";
import { setDemoMode, isDemoMode } from "./demoMode.js";
import { useNotifications } from "./hooks/useNotifications.js";
import { useCurrentUser, setCurrentUserFromAPI, resetCurrentUserCache } from "./hooks/useCurrentUser.js";
import { usePresence } from "./hooks/usePresence.js";
import { useCourseMembers, resetCourseMembersCache } from "./hooks/useCourseMembers.js";
import { useDeptMembers } from "./hooks/useDeptMembers.js";
import { resetCourseMaterialsCache } from "./hooks/useCourseMaterials.js";
import { useMobile, useBreakpoint } from "./utils.jsx";
import { isNative } from "./capacitor.js";
import { Av, Loader } from "./shared.jsx";
import { DSide, DChan, MNav, MoreMenu } from "./layout.jsx";
import { HomeView } from "./views/HomeView.jsx";
import { TTView, CSelect } from "./views/TTView.jsx";
import { AsgnView } from "./views/AsgnView.jsx";
import { FeedView } from "./views/FeedView.jsx";
import { ChatView } from "./views/ChatView.jsx";
import { MatView } from "./views/MatView.jsx";
import { DMView } from "./views/DMView.jsx";
import { NotifView } from "./views/NotifView.jsx";
import { EventView } from "./views/EventView.jsx";
import { GradeView } from "./views/GradeView.jsx";
import { PomodoroView } from "./views/PomodoroView.jsx";
import { ReviewView } from "./views/ReviewView.jsx";
import { ProfileView } from "./views/ProfileView.jsx";
import { SearchView } from "./views/SearchView.jsx";
import { BookmarkView } from "./views/BookmarkView.jsx";
import { CalendarView } from "./views/CalendarView.jsx";
import { SetupView } from "./views/SetupView.jsx";
import { NavigationView } from "./views/NavigationView.jsx";
import { FriendsView } from "./views/FriendsView.jsx";
import { CircleView } from "./views/CircleView.jsx";
import { AdminView } from "./views/AdminView.jsx";
import { FreshmanBoardView } from "./views/FreshmanBoardView.jsx";
import { AcademicCalendarView } from "./views/AcademicCalendarView.jsx";
import { ExamView } from "./views/ExamView.jsx";
import { RegView } from "./views/RegView.jsx";
import { ACADEMIC_EVENTS } from "./academicCalendar.js";
import { useFriends } from "./hooks/useFriends.js";
import { useBlocks } from "./hooks/useBlocks.js";
import { useMutes } from "./hooks/useMutes.js";
import { useOfflineQueue } from "./hooks/useOfflineQueue.js";
import { useGroups } from "./hooks/useGroups.js";
import { useCircles } from "./hooks/useCircles.js";
import { Toasts } from "./hooks/useToast.js";
import { useBookmarks } from "./hooks/useBookmarks.js";
import { useUnreadDM } from "./hooks/useUnreadDM.js";
import { useAppLock } from "./hooks/useAppLock.js";
import { installFetchInterceptor, updateStatusBarTheme } from "./capacitor.js";

installFetchInterceptor();

const API="";

// Lock screen – defined outside App to avoid remount on parent re-render
const LockScreen=({appLock,onLogout})=>{
  const [pin,setPin]=useState("");
  const [shake,setShake]=useState(false);
  const [fails,setFails]=useState(0);
  const biometricTriedRef=useRef(false);
  const enter=async d=>{
    if(pin.length>=4)return;
    const next=pin+d;
    setPin(next);
    if(next.length===4){
      const ok=await appLock.verify(next);
      if(ok){setFails(0);}
      else{
        setFails(f=>f+1);
        setShake(true);
        try{navigator.vibrate?.(80);}catch{}
        setTimeout(()=>{setPin("");setShake(false);},400);
      }
    }
  };
  const tryBiometric=useCallback(async()=>{
    if(!appLock.biometricEnabled||!appLock.biometricAvailable)return;
    await appLock.verifyBiometric();
  },[appLock.biometricEnabled,appLock.biometricAvailable,appLock.verifyBiometric]);
  useEffect(()=>{
    if(!biometricTriedRef.current&&appLock.biometricEnabled&&appLock.biometricAvailable){
      biometricTriedRef.current=true;
      tryBiometric();
    }
  },[tryBiometric,appLock.biometricEnabled,appLock.biometricAvailable]);
  const showBio=appLock.biometricEnabled&&appLock.biometricAvailable;
  const nums=[1,2,3,4,5,6,7,8,9,null,0,"del"];
  return <div style={{position:"fixed",inset:0,zIndex:99998,background:T.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,'Hiragino Sans','Segoe UI',sans-serif"}}>
    <div style={{width:56,height:56,borderRadius:16,background:`${T.accent}18`,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:16}}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
    </div>
    <div style={{fontSize:16,fontWeight:600,color:T.txH}}>パスコードを入力</div>
    {fails>=3&&<div style={{fontSize:12,color:T.red,marginTop:6}}>{fails}回失敗</div>}
    <div style={{display:"flex",gap:14,margin:"24px 0 32px",animation:shake?"appLockShake .4s":"none"}}>
      {[0,1,2,3].map(i=><div key={i} style={{width:14,height:14,borderRadius:7,border:`2px solid ${pin.length>i?T.accent:T.txD}`,background:pin.length>i?T.accent:"transparent",transition:"all .1s"}}/>)}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,76px)",gap:10}}>
      {nums.map((k,i)=>{
        if(k===null)return <div key={i}/>;
        if(k==="del")return <button key="del" onClick={()=>setPin(p=>p.slice(0,-1))} style={{width:76,height:52,borderRadius:12,border:"none",background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:T.txD}}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>
        </button>;
        return <button key={k} onClick={()=>enter(String(k))} style={{width:76,height:52,borderRadius:12,border:`1px solid ${T.bd}`,background:T.bg2,cursor:"pointer",fontSize:24,fontWeight:300,color:T.txH,transition:"background .1s"}} onMouseDown={e=>e.currentTarget.style.background=T.bg3} onMouseUp={e=>e.currentTarget.style.background=T.bg2} onMouseLeave={e=>e.currentTarget.style.background=T.bg2}>{k}</button>;
      })}
    </div>
    {showBio&&<button onClick={tryBiometric} style={{marginTop:20,padding:"10px 20px",borderRadius:10,border:`1px solid ${T.bd}`,background:T.bg2,cursor:"pointer",display:"flex",alignItems:"center",gap:8,color:T.txH,fontSize:13,fontWeight:500}}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 11c0-1.1.9-2 2-2s2 .9 2 2v1"/><path d="M8 11V9a4 4 0 018 0"/><path d="M6 11V8a6 6 0 0112 0v3"/><path d="M12 14v3"/><rect x="4" y="11" width="16" height="10" rx="2"/></svg>
      生体認証で解除
    </button>}
    {fails>=5&&<button onClick={()=>{if(confirm("ログアウトしますか？パスコードはリセットされます。")){appLock.removePin();onLogout();}}} style={{marginTop:24,padding:"10px 24px",borderRadius:10,border:"none",background:T.red,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer"}}>ログアウト</button>}
    <style>{`@keyframes appLockShake{10%,90%{transform:translateX(-2px)}20%,80%{transform:translateX(4px)}30%,50%,70%{transform:translateX(-6px)}40%,60%{transform:translateX(6px)}}`}</style>
  </div>;
};

// ============================================================
export default function App(){
  const mob=useMobile();
  const bp=useBreakpoint(); // "mobile" | "tablet" | "desktop"
  const [appState,setAppState]=useState("loading");
  const ready=appState==="ready";
  const user=useCurrentUser(ready);
  const [themePref,setThemePref]=useState(()=>{try{const v=localStorage.getItem("themePref");if(v)return v;return "tsubame";}catch{return "tsubame";}});
  const [accentPref,setAccentPref]=useState(()=>{try{return localStorage.getItem("accentPref")||"default";}catch{return "default";}});
  const [sysDark,setSysDark]=useState(()=>typeof window!=="undefined"&&window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  useEffect(()=>{
    const mq=window.matchMedia?.("(prefers-color-scheme: dark)");
    if(!mq) return;
    const h=e=>setSysDark(e.matches);
    mq.addEventListener("change",h);
    return()=>mq.removeEventListener("change",h);
  },[]);
  useEffect(()=>{try{localStorage.setItem("themePref",themePref);}catch{}},[themePref]);
  useEffect(()=>{try{localStorage.setItem("accentPref",accentPref);}catch{}},[accentPref]);
  const themeMode=themePref==="auto"?(sysDark?"dark":"light"):themePref;
  const dark=isDarkMode(themeMode);
  updateT(themeMode,accentPref);
  updateStatusBarTheme(T.bg2);
  useEffect(()=>{document.documentElement.style.background=T.bg;document.body.style.background=T.bg;},[themeMode,accentPref]);
  const [mockMode,setMockMode]=useState(false);
  const [guestMode,setGuestMode]=useState(()=>{if(typeof window==="undefined")return null;const h=window.location.hash;if(h==="#freshman")return "freshman";if(h==="#navi")return "navi";return null;});
  const [fromGuest,setFromGuest]=useState(null);
  const [quarter,setQuarter]=useState(()=>{try{const v=localStorage.getItem("quarter");return v?Number(v):2;}catch{return 2;}});
  const [qDataLive,setQDataLive]=useState(null);
  const [pastTTCache,setPastTTCache]=useState({});
  const [pastTTLoading,setPastTTLoading]=useState(false);
  const [pastTTError,setPastTTError]=useState(null);
  const [_selY,_setSelY]=useState(()=>{try{const v=localStorage.getItem("tty");if(v)return Number(v);const jd=new Date(Date.now()+9*3600000);return jd.getUTCMonth()>=3?jd.getUTCFullYear():jd.getUTCFullYear()-1;}catch{const jd=new Date(Date.now()+9*3600000);return jd.getUTCMonth()>=3?jd.getUTCFullYear():jd.getUTCFullYear()-1;}});
  const qd=(qDataLive&&qDataLive[quarter])||QData[quarter]||{C:[],TT:[]};
  const [allCourses,setAllCourses]=useState([]);
  const [view,setViewRaw]=useState("home");
  const viewHistRef=useRef([]);
  const setView=useCallback((v)=>{setViewRaw(prev=>{if(prev&&prev!==v)viewHistRef.current.push(prev);return v;});},[]);
  const goBack=useCallback(()=>{const h=viewHistRef.current;const prev=h.pop()||"home";setViewRaw(prev);},[]);

  // Android hardware back button (native)
  useEffect(()=>{
    if(!isNative())return;
    let cleanup;
    (async()=>{
      try{
        const {App:CapApp}=await import("@capacitor/app");
        const handle=CapApp.addListener("backButton",()=>{
          const h=viewHistRef.current;
          if(h.length>0){goBack();}
          else{CapApp.exitApp();}
        });
        cleanup=handle;
      }catch{}
    })();
    return()=>{cleanup?.remove?.();};
  },[goBack]);

  // Android back button (PWA standalone)
  useEffect(()=>{
    if(isNative())return;
    const isAndroid=/android/i.test(navigator.userAgent);
    const isPWA=window.matchMedia("(display-mode:standalone)").matches;
    if(!isAndroid||!isPWA)return;
    history.pushState(null,"");
    const onPop=()=>{
      const h=viewHistRef.current;
      if(h.length>0)goBack();
      history.pushState(null,"");
    };
    window.addEventListener("popstate",onPop);
    return()=>window.removeEventListener("popstate",onPop);
  },[goBack]);

  const [cid,setCid]=useState(null);
  const [did,setDid]=useState(null);
  const [ch,setCh]=useState("timeline");
  const [asgn,setAsgn]=useState(ASGN0);
  const [hiddenAsgn,setHiddenAsgn]=useState(()=>{try{return JSON.parse(localStorage.getItem("hiddenAsgn"))||[];}catch{return[];}});
  const saveHidden=ids=>{setHiddenAsgn(ids);try{localStorage.setItem("hiddenAsgn",JSON.stringify(ids));}catch{}};
  const [myTasks,setMyTasks]=useState(MYTK0);
  const appLock=useAppLock();
  const {bmarks,toggle:togBmark}=useBookmarks(ready);
  const [events,setEvents]=useState(EVENTS0);
  const allEvents=useMemo(()=>[...events,...ACADEMIC_EVENTS],[events]);
  // grades are now fetched inside GradeView directly
  const [reviews,setReviews]=useState(REVIEWS0);
  const [myEvents,setMyEvents]=useState(MYEVENTS0);
  const [rsvps,setRsvps]=useState(()=>{try{const v=localStorage.getItem("eventRsvps");return v?JSON.parse(v):{};}catch{return{};}});
  const handleRsvp=useCallback((eventId,status)=>{
    const prev=rsvps[eventId];
    const next=prev===status?null:status;
    const newRsvps={...rsvps};
    if(next) newRsvps[eventId]=next; else delete newRsvps[eventId];
    setRsvps(newRsvps);
    try{localStorage.setItem("eventRsvps",JSON.stringify(newRsvps));}catch{}
    // Sync with calendar: add/remove from myEvents
    const rsvpId=`rsvp_${eventId}`;
    if(next==="going"){
      const ev=allEvents.find(e=>e.id===eventId);
      if(ev&&!myEvents.some(e=>e.id===rsvpId)){
        const col=evCat[ev.cat]?.c||T.accent;
        setMyEvents(p=>[...p,{id:rsvpId,title:ev.title,date:ev.date,end:ev.end||null,color:col,memo:ev.loc||""}]);
      }
    }else{
      if(prev==="going") setMyEvents(p=>p.filter(e=>e.id!==rsvpId));
    }
    if(isDemoMode()) return;
    (async()=>{try{
      if(next) await fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event_id:eventId,status:next})});
      else await fetch('/api/events',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({event_id:eventId})});
    }catch{}})();
  },[rsvps,allEvents,myEvents]);
  // Restore "going" RSVPs into calendar on mount
  useEffect(()=>{
    const goingIds=Object.entries(rsvps).filter(([,s])=>s==="going").map(([id])=>id);
    if(goingIds.length===0) return;
    const toAdd=goingIds.map(eid=>{
      const rsvpId=`rsvp_${eid}`;
      const ev=allEvents.find(e=>e.id===eid);
      if(!ev) return null;
      const col=evCat[ev.cat]?.c||T.accent;
      return {id:rsvpId,title:ev.title,date:ev.date,end:ev.end||null,color:col,memo:ev.loc||""};
    }).filter(Boolean);
    if(toAdd.length>0) setMyEvents(p=>{
      const existing=new Set(p.map(e=>e.id));
      const fresh=toAdd.filter(e=>!existing.has(e.id));
      return fresh.length?[...p,...fresh]:p;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  const [pomo,setPomo]=useState({running:false,sec:25*60,mode:"work",sessions:0});
  const [searchQ,setSearchQ]=useState("");
  const [notifEnabled,setNotifEnabled]=useState(()=>{try{const v=localStorage.getItem("notifEnabled");return v!==null?JSON.parse(v):true;}catch{return true;}});
  const [notifSettings,setNotifSettings]=useState(()=>{try{const v=localStorage.getItem("notifSettings");return v?JSON.parse(v):{course:true,deadline:true,dm:true,event:true};}catch{return{course:true,deadline:true,dm:true,event:true};}});
  const refreshRef=useRef(null);
  const [splashPhase,setSplashPhase]=useState("show");
  const [telecomRestricted,setTelecomRestricted]=useState(false);
  const [telecomMsg,setTelecomMsg]=useState("");

  const fetchData=async()=>{
    try{
      const t0=performance.now();
      const r=await fetch(`${API}/api/data/all`);
      console.log(`[Timing] /api/data/all fetch: ${(performance.now()-t0).toFixed(0)}ms`);
      if(r.status===401){console.warn('[App] fetchData: 401 — not authenticated');setAppState("setup");return false;}
      if(!r.ok){console.error(`[App] /api/data/all failed: ${r.status} ${r.statusText}`);return false;}
      const d=await r.json();
      if(d.qData) setQDataLive(d.qData);
      if(d.courses){setAllCourses(d.courses);if(d.courses[0]&&!cid)setCid(d.courses[0].id);}
      const asnList=d.assignments?d.assignments.map(a=>({...a,due:new Date(a.due),st:'loading'})):[];
      if(d.assignments) setAsgn(asnList);
      if(d.user) setCurrentUserFromAPI(d.user);
      console.log(`[Timing] /api/data/all total (fetch+parse+setState): ${(performance.now()-t0).toFixed(0)}ms`);
      return asnList;
    }catch(e){ console.error("[App] fetchData exception:",e); return false; }
  };

  const fetchSubmissionStatuses=async(assignList)=>{
    try{
      const t0=performance.now();
      let currentAsgn=[];
      if(assignList){currentAsgn=assignList.filter(a=>a.moodleId).map(a=>({id:a.id,moodleId:a.moodleId}));}
      else{setAsgn(prev=>{currentAsgn=prev.filter(a=>a.moodleId).map(a=>({id:a.id,moodleId:a.moodleId}));return prev;});}
      if(currentAsgn.length===0)return;
      console.log(`[Timing] fetchSubmissionStatuses: requesting ${currentAsgn.length} items`);
      const r=await fetch(`${API}/api/data/assignments/status`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({assignments:currentAsgn})});
      if(!r.ok){console.error('[App] fetchSubmissionStatuses failed:',r.status);return;}
      const{statuses}=await r.json();
      if(!statuses)return;
      const counts={completed:0,in_progress:0,not_started:0};
      Object.values(statuses).forEach(s=>{if(s&&s.st)counts[s.st]=(counts[s.st]||0)+1;});
      console.log(`[Timing] fetchSubmissionStatuses done: ${(performance.now()-t0).toFixed(0)}ms — 提出済=${counts.completed} 進行中=${counts.in_progress} 未着手=${counts.not_started} (total=${Object.keys(statuses).length})`);
      setAsgn(prev=>prev.map(a=>{const s=statuses[a.id];if(!s)return a.st==='loading'?{...a,st:'not_started'}:a;return{...a,st:s.st,sub:s.sub?new Date(s.sub):undefined};}));
    }catch(e){console.error('[App] fetchSubmissionStatuses error:',e);setAsgn(prev=>prev.map(a=>a.st==='loading'?{...a,st:'not_started'}:a));}
  };

  const fetchPastTimetable=async(year)=>{
    if(pastTTCache[year])return pastTTCache[year];
    setPastTTLoading(true);setPastTTError(null);
    try{
      const r=await fetch(`${API}/api/data/timetable-past?year=${year}`);
      if(!r.ok){const d=await r.json().catch(()=>({}));setPastTTError(d.error||`Error ${r.status}`);return null;}
      const d=await r.json();
      setPastTTCache(prev=>({...prev,[year]:d}));
      return d;
    }catch(e){console.error("[App] fetchPastTimetable error:",e);setPastTTError(e.message);return null;}
    finally{setPastTTLoading(false);}
  };

  const fetchSiteSettings=async()=>{
    try{
      const r=await fetch(`${API}/api/settings`);
      if(r.ok){
        const d=await r.json();
        const tr=d.telecom_restriction||{};
        setTelecomRestricted(!!tr.enabled);
        setTelecomMsg(tr.message||"");
      }
    }catch{}
  };

  useEffect(()=>{
    const tStart=performance.now();
    console.log(`[Timing] === startup begin ===`);
    const wasLoggedIn=!!localStorage.getItem("userPref");
    const goSetupOrGuest=()=>{
      if(guestMode){setAppState("ready");setViewRaw(guestMode==="navi"?"navigation":"freshman");}
      else setAppState("setup");
    };
    const goReady=(asnList)=>{
      setAppState("ready");
      console.log(`[Timing] appState → ready: ${(performance.now()-tStart).toFixed(0)}ms`);
      if(guestMode) setGuestMode(null);
      refreshRef.current=setInterval(async()=>{const r2=await fetchData();if(r2)fetchSubmissionStatuses(r2);},15*60*1000);
      fetchSiteSettings();
      fetchSubmissionStatuses(asnList);
    };
    (async()=>{
      // Previously logged in → skip /api/auth/status, go straight to fetchData
      // iOS PWA often fails to send cookies on the initial status check after cold start
      if(wasLoggedIn){
        console.log(`[Timing] wasLoggedIn=true, skipping status check, calling fetchData directly`);
        try{
          const asnList=await fetchData();
          if(asnList){goReady(asnList);return;}
        }catch(e){console.error("[App] direct fetchData failed:",e.message);}
        // fetchData failed (401 or network) — fall through to status check as fallback
        console.log(`[Timing] direct fetchData failed, falling back to /api/auth/status`);
      }
      try{
        const t0=performance.now();
        const r=await fetch(`${API}/api/auth/status`);
        const d=await r.json();
        console.log(`[Timing] /api/auth/status: ${(performance.now()-t0).toFixed(0)}ms (hasCredentials=${d.hasCredentials})`);
        if(d.hasCredentials){
          const asnList=await fetchData();
          if(asnList){goReady(asnList);return;}
        }
        goSetupOrGuest();
      }catch(e){
        console.error("[App] startup error:",e.message);
        goSetupOrGuest();
      }
    })();
    return()=>{if(refreshRef.current)clearInterval(refreshRef.current)};
  },[]);

  useEffect(()=>{
    if(appState!=="loading"&&splashPhase==="show") setSplashPhase("fade");
  },[appState,splashPhase]);
  useEffect(()=>{
    if(splashPhase==="fade"){
      const t=setTimeout(()=>setSplashPhase("done"),600);
      return()=>clearTimeout(t);
    }
  },[splashPhase]);

  useEffect(()=>{try{localStorage.setItem("quarter",String(quarter));}catch{}},[quarter]);
  useEffect(()=>{try{localStorage.setItem("notifEnabled",JSON.stringify(notifEnabled));}catch{}},[notifEnabled]);
  useEffect(()=>{try{localStorage.setItem("notifSettings",JSON.stringify(notifSettings));}catch{}},[notifSettings]);
  const onSetupComplete=async()=>{const MAX=4;const attempt=async(n)=>{console.log(`[App] onSetupComplete: fetchData attempt ${n}/${MAX}`);const r=await fetchData();if(r){console.log(`[App] onSetupComplete: fetchData OK — ${r.length} assignments`);setAppState("ready");refreshRef.current=setInterval(async()=>{const r2=await fetchData();if(r2)fetchSubmissionStatuses(r2);},15*60*1000);fetchSiteSettings();fetchSubmissionStatuses(r);return;}if(n<MAX){const delay=n*2;console.warn(`[App] onSetupComplete: fetchData attempt ${n} failed, retrying in ${delay}s...`);await new Promise(r=>setTimeout(r,delay*1000));return attempt(n+1);}console.error(`[App] onSetupComplete: fetchData failed after ${MAX} attempts, returning to setup`);setAppState("setup");};await attempt(1);};
  const onDemo=(personaId)=>{if(process.env.NODE_ENV==="production")return;const pd=buildDemoDataForPersona(personaId);setDemoMode(true);setAllCourses(pd.courses);setQDataLive(pd.qdata);setAsgn(pd.asgn.map(a=>({...a,due:a.due instanceof Date?a.due:new Date(a.due)})));setMyTasks(DEMO_TASKS);setReviews(DEMO_REVIEWS);setMyEvents(DEMO_MY_EVENTS);setEvents(DEMO_EVENTS);setCurrentUserFromAPI(pd.user);const q2c=pd.courses.find(c=>c.quarter===2);setCid(q2c?q2c.id:pd.courses[0].id);setQuarter(2);circleInit();try{localStorage.setItem("myLocation","lib");}catch{}setAppState("ready");};

  const cc=allCourses.find(c=>c.id===cid);
  const userDepts=useMemo(()=>{
    // プロフィール設定済み → その学系のみ表示
    if(user.myDept&&DEPTS[user.myDept]){
      return [{id:`dept:${user.myDept}`,prefix:user.myDept,...DEPTS[user.myDept]}];
    }
    // 未設定 → コースから自動検出
    const ps=[...new Set(allCourses.map(c=>c.code.split('.')[0]))];
    return ps.filter(p=>DEPTS[p]).map(p=>({id:`dept:${p}`,prefix:p,...DEPTS[p]}));
  },[allCourses,user.myDept]);
  const userSchools=useMemo(()=>{
    // プロフィール設定済み → その学院のみ表示
    if(user.myDept&&DEPTS[user.myDept]){
      const sk=DEPTS[user.myDept].school;
      if(SCHOOLS[sk]) return [{id:`school:${sk}`,prefix:`school:${sk}`,name:SCHOOLS[sk].name,col:SCHOOLS[sk].col}];
    }
    // 未設定 → コースから自動検出
    const sks=[...new Set(userDepts.map(d=>d.school))];
    return sks.filter(k=>SCHOOLS[k]).map(k=>({id:`school:${k}`,prefix:`school:${k}`,name:SCHOOLS[k].name,col:SCHOOLS[k].col}));
  },[userDepts,user.myDept]);
  const userUnit=useMemo(()=>{
    if(!user.myUnit) return null;
    const parts=user.myUnit.split("-");
    const yg=parts[0]||"";
    const num=parts[1]||user.myUnit;
    return {id:user.myUnit,yg,num,name:`ユニット${num}`,col:UNIT_COL,prefix:`unit:${user.myUnit}`};
  },[user.myUnit]);
  const SANDBOX={id:"sandbox",name:"テスト広場",col:"#6366f1",prefix:"global:sandbox"};
  const cd=did===SANDBOX.prefix?SANDBOX:userDepts.find(d=>d.prefix===did)||userSchools.find(s=>s.prefix===did)||(userUnit&&did===userUnit.prefix?userUnit:null);
  const qCourseIds=useMemo(()=>new Set(allCourses.filter(c=>c.quarter===quarter).map(c=>c.id)),[allCourses,quarter]);
  const hiddenSet=useMemo(()=>new Set(hiddenAsgn),[hiddenAsgn]);
  const asgnLoading=asgn.some(a=>a.st==='loading');
  const ac=asgnLoading?null:asgn.filter(a=>a.st!=="completed"&&qCourseIds.has(a.cid)&&!hiddenSet.has(a.id)).length;
  const {unreadCount:unreadN}=useNotifications(ready);
  const {unreadDM:dmUnread,markDMSeen}=useUnreadDM(user?.moodleId||user?.id);
  const {friends:friendList,pending:friendPending,sent:friendSent,loading:friendLoading,pendingCount:pendingFriendCount,friendIds:_fIds,isFriend:_isFriend,sendRequest,acceptRequest,rejectRequest,unfriend,searchUsers,lookupById,refetch:refetchFriends}=useFriends(ready,user?.moodleId||user?.id);
  const {blocks:blockList,isBlocked,blockUser,unblockUser}=useBlocks(ready);
  const {mutes:muteList,isMuted,muteUser,unmuteUser}=useMutes(ready);
  const {enqueue:enqueueOffline,pending:offlinePending}=useOfflineQueue();
  const presenceRoom=view==="course"&&cc?`course:${cc.id}`:view==="dept"&&cd?`dept:${cd.prefix}`:null;
  const {online}=usePresence(presenceRoom,{id:user.moodleId||user.id,name:user.name,col:user.col});
  const members=useCourseMembers(cc?.moodleId);
  const deptMembers=useDeptMembers(cd?.prefix);
  const [navDest,setNavDest]=useState(null);
  const [navOrig,setNavOrig]=useState(null);
  const navCrs=id=>{setCid(id);setView("course");setCh("assignments");};
  const goToBuilding=(destId,origId)=>{if(destId){setNavDest(destId);setNavOrig(origId||null);setView("navigation");}};
  // togBmark is now from useBookmarks()
  const {groups:groupList,createGroup,leaveGroup}=useGroups(ready,user?.moodleId||user?.id);
  const {circles:circleList,messages:circleMsgs,discover:circleDiscover,sendMessage:circleSend,createCircle,joinCircle,leaveCircle,addChannel:circleAddCh,deleteChannel:circleDelCh,pinMessage:circlePin,updateCircle:circleUpdate,init:circleInit}=useCircles();
  const startDMFromFriend=(fid,name,avatar,color)=>{setView("dm");};
  const openGroupChat=(g)=>{setView("dm");};
  const friendProps={friends:friendList,pending:friendPending,sent:friendSent,loading:friendLoading,pendingCount:pendingFriendCount,sendRequest,acceptRequest,rejectRequest,unfriend,searchUsers,onStartDM:startDMFromFriend,userId:user?.moodleId||user?.id,lookupById,groups:groupList,createGroup,leaveGroup,onOpenGroup:openGroupChat,blockUser,unblockUser,isBlocked,blocks:blockList,muteUser,unmuteUser,isMuted,mutes:muteList,refetch:refetchFriends};
  const togTheme=()=>setThemePref(p=>p==="dark"?"light":"dark");
  const onLogout=async()=>{setDemoMode(false);try{await fetch("/api/auth/logout",{method:"POST"});}catch{}if(refreshRef.current){clearInterval(refreshRef.current);refreshRef.current=null;}resetCurrentUserCache();resetCourseMembersCache();resetCourseMaterialsCache();try{localStorage.clear();}catch{}setAllCourses([]);setQDataLive(null);setAsgn(ASGN0);setHiddenAsgn([]);setMyTasks(MYTK0);setEvents(EVENTS0);setReviews(REVIEWS0);setMyEvents(MYEVENTS0);setRsvps({});setQuarter(2);setNotifEnabled(true);setNotifSettings({course:true,deadline:true,dm:true,event:true});setPomo({running:false,sec:25*60,mode:"work",sessions:0});setSearchQ("");setCid(null);setDid(null);setCh("timeline");viewHistRef.current=[];setView("home");setMockMode(false);setAppState("setup");};

  // Telecom restriction overlay — shown when regulated features are disabled
  const TelecomBlockView=({title,onBack})=><div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:32,gap:16}}>
    <div style={{width:64,height:64,borderRadius:20,background:`${T.orange}15`,border:`1px solid ${T.orange}30`,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={T.orange} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    </div>
    <div style={{fontSize:16,fontWeight:700,color:T.txH,textAlign:"center"}}>{title||"この機能は現在利用できません"}</div>
    <div style={{fontSize:13,color:T.txD,textAlign:"center",lineHeight:1.8,maxWidth:340}}>
      {telecomMsg||"電気通信事業の届出手続き中のため、メッセージング機能（DM・チャット・サークルメッセージ等）を一時的に制限しています。"}
    </div>
    <div style={{fontSize:12,color:T.txD,textAlign:"center",lineHeight:1.6,marginTop:4,padding:"10px 16px",borderRadius:10,background:T.bg3,border:`1px solid ${T.bd}`}}>
      投稿・コメント・フレンド機能など<br/>掲示板型の機能は引き続きご利用いただけます。
    </div>
    {onBack&&<button onClick={onBack} style={{marginTop:8,padding:"10px 28px",borderRadius:10,border:`1px solid ${T.bd}`,background:T.bg2,color:T.txH,fontSize:14,fontWeight:600,cursor:"pointer"}}>戻る</button>}
  </div>;

  // Lock screen for mock mode
  const LockedView=({title})=><div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:32,gap:12}}>
    <div style={{width:56,height:56,borderRadius:16,background:T.bg3,border:`1px solid ${T.bd}`,display:"flex",alignItems:"center",justifyContent:"center"}}><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={T.txD} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></div>
    <div style={{fontSize:15,fontWeight:700,color:T.txH}}>{title||"ログインが必要です"}</div>
    <div style={{fontSize:13,color:T.txD,textAlign:"center",lineHeight:1.6}}>この機能を使うにはLMSに<br/>ログインしてください</div>
    <button onClick={()=>{setMockMode(false);setAppState("setup");}} style={{marginTop:8,padding:"10px 28px",borderRadius:10,border:"none",background:T.accent,color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer"}}>ログイン</button>
  </div>;
  const L=mockMode;

  // Demo mode banner — persistent login/signup prompt
  const demoReady=isDemoMode()&&appState==="ready";
  const exitDemo=()=>{setDemoMode(false);if(refreshRef.current)clearInterval(refreshRef.current);setAllCourses([]);setQDataLive(null);setAsgn(ASGN0);viewHistRef.current=[];setView("home");setMockMode(false);setAppState("setup");};
  const DemoBanner=()=>!demoReady?null:(
    <div style={{position:"fixed",bottom:mob?68:0,left:0,right:0,zIndex:9998,display:"flex",alignItems:"center",justifyContent:"center",gap:10,padding:"10px 16px",background:`linear-gradient(135deg,${T.accent}18,${T.accentSoft||T.accent}22)`,borderTop:`1px solid ${T.accent}30`,backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)"}}>
      <span style={{fontSize:13,color:T.txH,fontWeight:500}}>デモモードで表示中</span>
      <button onClick={exitDemo} style={{padding:"7px 20px",borderRadius:8,border:"none",background:T.accent,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>ログイン / 新規登録</button>
    </div>
  );

  // App lock screen (PIN pad + biometric)

  // --- Header for mobile ---
  const MHdr=({title,back,color,right})=><header style={{display:"flex",alignItems:"center",gap:8,padding:"env(safe-area-inset-top) 14px 0",minHeight:54,borderBottom:`1px solid ${T.bd}`,flexShrink:0,background:T.bg2}}><div style={{display:"flex",alignItems:"center",gap:8,width:"100%",height:54}}>{back&&<button onClick={back} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",padding:4}}>{I.back}</button>}<h1 style={{flex:1,margin:0,fontSize:17,fontWeight:700,color:color||T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</h1>{right}</div></header>;

  // Desktop top bar
  const DTop=({title,color})=><div style={{display:"flex",alignItems:"center",gap:10,padding:"0 16px",height:44,borderBottom:`1px solid ${T.bd}`,flexShrink:0}}><h3 style={{margin:0,color:color||T.txH,fontSize:15,fontWeight:700,flex:1}}>{title}</h3><div style={{display:"flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:6,background:T.bg3,border:`1px solid ${T.bd}`,width:180}}><span style={{color:T.txD,display:"flex"}}>{I.search}</span><input placeholder="検索..." style={{flex:1,border:"none",background:"transparent",color:T.txH,fontSize:12,outline:"none"}}/></div><div style={{position:"relative",cursor:"pointer",color:T.txD,display:"flex"}} onClick={()=>setView("notif")}>{I.bell}{unreadN>0&&<span style={{position:"absolute",top:-3,right:-5,minWidth:14,height:14,borderRadius:7,background:T.red,color:"#fff",fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px"}}>{unreadN}</span>}</div><Av u={user} sz={28} st/></div>;

  // Course header (gradient banner + equal-width icon+label tabs)
  const cTabs=[{id:"timeline",l:"フィード",i:I.feed},{id:"chat",l:"チャット",i:I.chat},{id:"assignments",l:"課題",i:I.tasks},{id:"materials",l:"教材",i:I.clip},{id:"reviews",l:"レビュー",i:I.star}];
  const CourseHdr=()=>{
    if(!cc) return null;
    const bk=goBack;
    return <div style={{flexShrink:0}}>
      <div style={{background:`linear-gradient(135deg, ${cc.col}20, ${cc.col}08)`,borderBottom:`1px solid ${cc.col}25`}}>
        <div style={{display:"flex",alignItems:"center",gap:8,paddingTop:"env(safe-area-inset-top)",padding:"env(safe-area-inset-top) 14px 0",minHeight:54}}>
          <div style={{display:"flex",alignItems:"center",gap:10,width:"100%",height:54}}>
            <button onClick={bk} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",padding:4}}>{I.back}</button>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:16,fontWeight:700,color:T.txH}}>{cc.code}</div>
              <div style={{fontSize:12,color:T.txD,marginTop:1}}>{cc.name}</div>
            </div>
            <button style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex"}}>{I.more}</button>
          </div>
        </div>
      </div>
      <div style={{display:"flex",background:T.bg2,borderBottom:`1px solid ${T.bd}`}}>
        {cTabs.map(t=><button key={t.id} onClick={()=>setCh(t.id)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"8px 4px",border:"none",borderBottom:ch===t.id?`2px solid ${cc.col}`:"2px solid transparent",background:"transparent",color:ch===t.id?cc.col:T.txD,fontSize:10,fontWeight:ch===t.id?600:400,cursor:"pointer"}}><span style={{display:"flex",transform:ch===t.id?"scale(1.15)":"scale(1)",transition:"transform .15s"}}>{t.i}</span><span>{t.l}</span></button>)}
      </div>
    </div>;
  };

  const TR=telecomRestricted;
  const courseContent=()=>{
    if(!cc) return null;
    if(ch==="timeline") return <FeedView course={cc} mob={mob} bmarks={bmarks} togBmark={togBmark} courses={allCourses} onOfflineQueue={enqueueOffline}/>;
    if(ch==="chat") return <ChatView course={cc} mob={mob}/>;
    if(ch==="assignments") return <AsgnView asgn={asgn} setAsgn={setAsgn} course={cc} mob={mob} courses={allCourses}/>;
    if(ch==="materials") return <MatView course={cc} mob={mob}/>;
    if(ch==="reviews") return <ReviewView reviews={reviews} setReviews={setReviews} course={cc} mob={mob} courses={allCourses}/>;
    return null;
  };
  const deptContent=()=>{
    if(!cd) return null;
    if(ch==="timeline") return <FeedView dept={cd} mob={mob} courses={allCourses} onOfflineQueue={enqueueOffline}/>;
    if(ch==="chat") return <ChatView dept={cd} mob={mob}/>;
    return null;
  };

  // --- LOADING / SETUP ---
  if(splashPhase!=="done") return (
    <div style={{position:"fixed",inset:0,zIndex:99999,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:T.bg,fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,'Hiragino Sans','Segoe UI',sans-serif",overflow:"hidden",opacity:splashPhase==="fade"?0:1,transition:"opacity .5s ease-out"}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
        <div style={{width:84,height:84,borderRadius:24,background:`linear-gradient(135deg,${T.accent},${T.accentSoft})`,display:"flex",alignItems:"center",justifyContent:"center",animation:"spLogoIn .7s cubic-bezier(.16,1,.3,1) both",boxShadow:`0 10px 36px ${T.accent}30`}}>
          <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
        </div>
        <div style={{marginTop:24,fontSize:24,fontWeight:700,color:T.txH,letterSpacing:"-0.02em",animation:"spFadeUp .6s .12s cubic-bezier(.16,1,.3,1) both"}}>Science<span style={{color:T.accent}}>Tokyo</span> App</div>
        <div style={{marginTop:8,fontSize:13,color:T.txD,letterSpacing:"0.02em",animation:"spFadeUp .6s .22s cubic-bezier(.16,1,.3,1) both"}}>東京科学大学キャンパスSNS</div>
      </div>
      <div style={{position:"absolute",bottom:`calc(72px + env(safe-area-inset-bottom))`,display:"flex",gap:8,animation:"spFadeUp .5s .32s cubic-bezier(.16,1,.3,1) both"}}>
        {[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:T.accent,animation:`spDot 1.4s ${i*.15}s ease-in-out infinite`}}/>)}
      </div>
      <style>{`@keyframes spLogoIn{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:scale(1)}}@keyframes spFadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}@keyframes spDot{0%,80%,100%{transform:scale(.5);opacity:.3}40%{transform:scale(1.2);opacity:1}}html,body{background:${T.bg};margin:0}`}</style>
    </div>
  );
  // --- GUEST BOARD (direct link #freshman) ---
  const guestLogin=()=>{setFromGuest(guestMode);setGuestMode(null);window.location.hash="";setMockMode(false);setAppState("setup");};
  const backToGuest=()=>{const mode=fromGuest||"freshman";setFromGuest(null);setGuestMode(mode);window.location.hash=mode==="navi"?"navi":"freshman";setAppState("ready");setViewRaw(mode==="navi"?"navigation":"freshman");};

  if(appState==="setup") return <SetupView onComplete={onSetupComplete} onSkip={onDemo} personas={DEMO_PERSONAS} mob={mob} dark={dark} onBackToBoard={fromGuest?backToGuest:null} backLabel={fromGuest==="navi"?"キャンパスナビに戻る":undefined}/>;

  if(guestMode){
    return(
      <div style={{display:"flex",flexDirection:"column",height:"100vh",background:T.bg,color:T.tx,fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>
        {/* Guest header */}
        <div style={{flexShrink:0,display:"flex",alignItems:"center",gap:10,padding:"0 16px",height:48,borderBottom:`1px solid ${T.bd}`,background:T.bg2}}>
          <div style={{fontWeight:700,fontSize:15,color:T.txH,flex:1}}>{guestMode==="navi"?"キャンパスナビ":"新入生掲示板"}</div>
          <button onClick={guestLogin} style={{padding:"6px 16px",borderRadius:8,border:"none",background:T.accent,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>ログイン / 新規登録</button>
        </div>
        {guestMode==="freshman"&&<FreshmanBoardView mob={mob} loggedIn={false} onLogin={guestLogin}/>}
        {guestMode==="navi"&&<NavigationView mob={mob} initialDest={null} initialOrig={null} onDestUsed={()=>{}}/>}
      </div>
    );
  }

  // --- DESKTOP ---
  if(!mob){
    const titles={home:"ホーム",timetable:"時間割",tasks:"課題管理",calendar:"カレンダー",acadCal:"学年暦",exams:"期末試験",dm:"ダイレクトメッセージ",notif:"通知",grades:"成績",pomo:"ポモドーロ",events:"イベント",reviews:"授業レビュー",bmarks:"ブックマーク",search:"検索",profile:"プロフィール",navigation:"キャンパスナビ",friends:"友達",circles:"サークル",admin:"管理者",freshman:"新入生掲示板",reg:"履修登録補助"};
    const dTitle=()=>{
      if(view==="course"&&cc) return <><span style={{color:cc.col}}>#{cc.code}</span> {{timeline:"タイムライン",chat:"チャット",assignments:"課題",materials:"教材",reviews:"レビュー"}[ch]}</>;
      if(view==="dept"&&cd){const nameOnly=cd.prefix.startsWith("school:")||cd.prefix.startsWith("unit:")||cd.prefix.startsWith("global:");return <><span style={{color:cd.col}}>{nameOnly?cd.name:cd.prefix}</span> {nameOnly?"":`${cd.name} `}— {{timeline:"タイムライン",chat:"チャット"}[ch]||""}</>;}
      return titles[view]||"";
    };
    return(
      <div style={{display:"flex",height:"100dvh",width:"100%",background:T.bg,color:T.tx,fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,'Hiragino Sans','Segoe UI',sans-serif",overflow:"hidden"}}>

        <DSide cid={cid} did={did} view={view} setView={setView} setCid={setCid} setDid={setDid} setCh={setCh} ac={ac} unreadN={unreadN} dmUnread={dmUnread} courses={allCourses} depts={userDepts} schools={userSchools} user={user} quarter={quarter} pendingFriendCount={pendingFriendCount} userUnit={userUnit} compact={bp==="tablet"}/>
        {bp==="desktop"&&view==="course"&&cc&&<DChan course={cc} ch={ch} setCh={setCh} online={online} members={members}/>}
        {bp==="desktop"&&view==="dept"&&cd&&<DChan dept={cd} ch={ch} setCh={setCh} online={online} members={deptMembers}/>}
        <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
          <DTop title={dTitle()} color={view==="course"&&cc?cc.col:view==="dept"&&cd?cd.col:undefined}/>
          {view==="home"&&<HomeView asgn={asgn} setView={setView} setCid={setCid} setCh={setCh} mob={false} courses={allCourses} user={user} myEvents={myEvents} quarter={quarter} hiddenSet={hiddenSet} qd={qd} qDataAll={qDataLive||QData} goToBuilding={goToBuilding} setDid={setDid} userDepts={userDepts} userSchools={userSchools} userUnit={userUnit}/>}
          {view==="timetable"&&(L?<LockedView title="時間割"/>:<TTView setCid={setCid} setView={setView} setCh={setCh} asgn={asgn} mob={false} quarter={quarter} setQuarter={setQuarter} qd={qd} onRefresh={fetchData} courses={allCourses} hiddenSet={hiddenSet} goToBuilding={goToBuilding} pastTTCache={pastTTCache} fetchPastTimetable={fetchPastTimetable} pastTTLoading={pastTTLoading} pastTTError={pastTTError} tty={_selY} setTty={_setSelY}/>)}
          {view==="tasks"&&(L?<LockedView title="課題管理"/>:<AsgnView asgn={asgn} setAsgn={setAsgn} mob={false} myTasks={myTasks} setMyTasks={setMyTasks} navCourse={navCrs} courses={allCourses} quarter={quarter} setQuarter={setQuarter} hiddenAsgn={hiddenSet} saveHidden={saveHidden}/>)}
          {view==="course"&&(L?<LockedView title="コース"/>:cc&&courseContent())}
          {view==="dept"&&(L?<LockedView title="学系"/>:cd&&deptContent())}
          {view==="friends"&&(L?<LockedView title="友達"/>:<FriendsView mob={false} setView={setView} {...friendProps}/>)}
          {view==="dm"&&(L?<LockedView title="DM"/>:TR?<TelecomBlockView title="DMは現在利用できません"/>:<DMView mob={false} setView={setView} friends={friendList} groups={groupList} leaveGroup={leaveGroup} markDMSeen={markDMSeen} createGroup={createGroup}/>)}
          {view==="notif"&&(L?<LockedView title="通知"/>:<NotifView mob={false}/>)}
          {view==="grades"&&(L?<LockedView title="成績"/>:<GradeView mob={false}/>)}
          {view==="pomo"&&<PomodoroView pomo={pomo} setPomo={setPomo} mob={false}/>}
          {view==="calendar"&&(L?<LockedView title="カレンダー"/>:<CalendarView myEvents={myEvents} setMyEvents={setMyEvents} asgn={asgn} courses={allCourses} qd={qd} qDataAll={qDataLive||QData} mob={false}/>)}
          {view==="events"&&<EventView events={allEvents} mob={false} rsvps={rsvps} onRsvp={handleRsvp}/>}
          {view==="reviews"&&(L?<LockedView title="授業レビュー"/>:<ReviewView reviews={reviews} setReviews={setReviews} mob={false} courses={allCourses}/>)}
          {view==="bmarks"&&(L?<LockedView title="ブックマーク"/>:<BookmarkView bmarks={bmarks} mob={false} setView={setView} setCid={setCid} setCh={setCh} courses={allCourses}/>)}
          {view==="search"&&(L?<LockedView title="検索"/>:<SearchView searchQ={searchQ} setSearchQ={setSearchQ} setView={setView} setCid={setCid} setCh={setCh} mob={false} courses={allCourses}/>)}
          {view==="profile"&&<ProfileView mob={false} togTheme={togTheme} dark={dark} themePref={themePref} setThemePref={setThemePref} accentPref={accentPref} setAccentPref={setAccentPref} asgn={asgn} courses={allCourses} user={user} notifEnabled={notifEnabled} setNotifEnabled={setNotifEnabled} notifSettings={notifSettings} setNotifSettings={setNotifSettings} onLogout={onLogout} appLock={appLock} blocks={blockList} unblockUser={unblockUser} mutes={muteList} unmuteUser={unmuteUser}/>}
          {view==="navigation"&&<NavigationView mob={false} initialDest={navDest} initialOrig={navOrig} onDestUsed={()=>{setNavDest(null);setNavOrig(null);}}/>}
          {view==="circles"&&(TR?<TelecomBlockView title="サークルは現在利用できません"/>:<CircleView mob={false} circles={circleList} messages={circleMsgs} discover={circleDiscover} sendMessage={circleSend} createCircle={createCircle} joinCircle={joinCircle} leaveCircle={leaveCircle} addChannel={circleAddCh} deleteChannel={circleDelCh} pinMessage={circlePin} updateCircle={circleUpdate}/>)}
          {view==="acadCal"&&<AcademicCalendarView mob={false}/>}
          {view==="exams"&&(L?<LockedView title="期末試験"/>:<ExamView courses={allCourses} mob={false} goToBuilding={goToBuilding} setCid={setCid} setView={setView} setCh={setCh}/>)}
          {view==="reg"&&<RegView mob={false}/>}
          {view==="admin"&&<AdminView mob={false} courses={allCourses} depts={userDepts} schools={userSchools}/>}
          {view==="freshman"&&<FreshmanBoardView mob={false} loggedIn={!!user.moodleId} onLogin={()=>{setGuestMode(null);setMockMode(false);setAppState("setup");}}/>}
        </div>
        {appLock.locked&&<LockScreen appLock={appLock} onLogout={onLogout}/>}
        <DemoBanner/>
        <Toasts/>
        <style>{`*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${T.bd};border-radius:3px}::placeholder{color:${T.txD}}button,input,textarea,select{font-family:inherit}@keyframes mnSpin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // --- MOBILE ---
  const mBack=goBack;
  return(
    <div ref={el=>{if(!el)return;const pwa=window.matchMedia("(display-mode:standalone)").matches||window.navigator.standalone;const u=()=>{el.style.height=pwa?screen.height+"px":"100dvh";};u();window.addEventListener("resize",u);}} style={{display:"flex",flexDirection:"column",width:"100vw",overflow:"hidden",background:T.bg,color:T.tx,fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,'Hiragino Sans','Segoe UI',sans-serif"}}>
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minHeight:0,position:"relative"}}>
        {view==="home"&&<><MHdr title="ScienceTokyo App" right={<div style={{display:"flex",alignItems:"center",gap:8}}><button onClick={()=>setView("notif")} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",position:"relative"}}>{I.bell}{unreadN>0&&<span style={{position:"absolute",top:-3,right:-5,minWidth:14,height:14,borderRadius:7,background:T.red,color:"#fff",fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px"}}>{unreadN}</span>}</button><button onClick={()=>setView("search")} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex"}}>{I.search}</button><button onClick={()=>setView("profile")} style={{background:"none",border:"none",cursor:"pointer",display:"flex",padding:0}}><Av u={user} sz={26}/></button></div>}/><HomeView asgn={asgn} setView={setView} setCid={setCid} setCh={setCh} mob courses={allCourses} user={user} myEvents={myEvents} quarter={quarter} hiddenSet={hiddenSet} qd={qd} qDataAll={qDataLive||QData} goToBuilding={goToBuilding} setDid={setDid} userDepts={userDepts} userSchools={userSchools} userUnit={userUnit}/></>}
        {view==="timetable"&&(L?<><MHdr title="時間割"/><LockedView title="時間割"/></>:<TTView setCid={setCid} setView={setView} setCh={setCh} asgn={asgn} mob quarter={quarter} setQuarter={setQuarter} qd={qd} onRefresh={fetchData} courses={allCourses} hiddenSet={hiddenSet} goToBuilding={goToBuilding} pastTTCache={pastTTCache} fetchPastTimetable={fetchPastTimetable} pastTTLoading={pastTTLoading} pastTTError={pastTTError} tty={_selY} setTty={_setSelY}/>)}
        {view==="tasks"&&(L?<><MHdr title="課題管理"/><LockedView title="課題管理"/></>:<><MHdr title="課題管理"/><AsgnView asgn={asgn} setAsgn={setAsgn} mob myTasks={myTasks} setMyTasks={setMyTasks} navCourse={navCrs} courses={allCourses} quarter={quarter} setQuarter={setQuarter} hiddenAsgn={hiddenSet} saveHidden={saveHidden}/></>)}
        {view==="courseSelect"&&(L?<><MHdr title="コース・学院・学系"/><LockedView title="コース"/></>:<><MHdr title="コース・学院・学系"/><CSelect setCid={setCid} setView={setView} setCh={setCh} courses={allCourses} depts={userDepts} schools={userSchools} setDid={setDid} userUnit={userUnit}/></>)}
        {view==="course"&&(L?<><MHdr title="コース" back={goBack}/><LockedView title="コース"/></>:cc&&<><CourseHdr/>{courseContent()}</>)}
        {view==="dept"&&(L?<><MHdr title="学系" back={goBack}/><LockedView title="学系"/></>:cd&&<><MHdr title={<>{(()=>{const nameOnly=cd.prefix.startsWith("school:")||cd.prefix.startsWith("unit:")||cd.prefix.startsWith("global:");return <><span style={{color:cd.col}}>{nameOnly?cd.name:cd.prefix}</span>{!nameOnly&&<span style={{fontWeight:400,color:T.txD,fontSize:13,marginLeft:4}}>{cd.name}</span>}</>;})()}</>} back={goBack}/><div style={{display:"flex",borderBottom:`1px solid ${T.bd}`,background:T.bg2,flexShrink:0}}>{[{id:"timeline",l:"タイムライン",i:I.feed},{id:"chat",l:"チャット",i:I.chat}].map(t=><button key={t.id} onClick={()=>setCh(t.id)} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:3,padding:"10px 14px",border:"none",borderBottom:ch===t.id?`2px solid ${T.accent}`:"2px solid transparent",background:"transparent",color:ch===t.id?T.txH:T.txD,fontSize:13,fontWeight:ch===t.id?600:400,cursor:"pointer"}}>{t.i}<span>{t.l}</span></button>)}</div>{deptContent()}</>)}
        {view==="moreMenu"&&<><MHdr title="その他"/><MoreMenu setView={setView} unreadN={unreadN} pendingFriendCount={pendingFriendCount} dmUnread={dmUnread} isAdmin={!!user.isAdmin}/></>}
        {view==="friends"&&(L?<><MHdr title="友達" back={mBack}/><LockedView title="友達"/></>:<><MHdr title="友達" back={mBack}/><FriendsView mob setView={setView} {...friendProps}/></>)}
        {view==="dm"&&(L?<><MHdr title="DM"/><LockedView title="DM"/></>:TR?<><MHdr title="DM"/><TelecomBlockView title="DMは現在利用できません" onBack={goBack}/></>:<><MHdr title="DM"/><DMView mob setView={setView} friends={friendList} groups={groupList} leaveGroup={leaveGroup} markDMSeen={markDMSeen} createGroup={createGroup}/></>)}
        {view==="notif"&&(L?<><MHdr title="通知" back={mBack}/><LockedView title="通知"/></>:<><MHdr title="通知" back={mBack}/><NotifView mob/></>)}
        {view==="grades"&&(L?<><MHdr title="成績" back={mBack}/><LockedView title="成績"/></>:<><MHdr title="成績" back={mBack}/><GradeView mob/></>)}
        {view==="pomo"&&<><MHdr title="ポモドーロ" back={mBack}/><PomodoroView pomo={pomo} setPomo={setPomo} mob/></>}
        {view==="calendar"&&(L?<><MHdr title="カレンダー" back={mBack}/><LockedView title="カレンダー"/></>:<><MHdr title="カレンダー" back={mBack}/><CalendarView myEvents={myEvents} setMyEvents={setMyEvents} asgn={asgn} courses={allCourses} qd={qd} qDataAll={qDataLive||QData} mob/></>)}
        {view==="events"&&<><MHdr title="イベント" back={mBack}/><EventView events={allEvents} mob rsvps={rsvps} onRsvp={handleRsvp}/></>}
        {view==="reviews"&&(L?<><MHdr title="授業レビュー" back={mBack}/><LockedView title="授業レビュー"/></>:<><MHdr title="授業レビュー" back={mBack}/><ReviewView reviews={reviews} setReviews={setReviews} mob courses={allCourses}/></>)}
        {view==="bmarks"&&(L?<><MHdr title="ブックマーク" back={mBack}/><LockedView title="ブックマーク"/></>:<><MHdr title="ブックマーク" back={mBack}/><BookmarkView bmarks={bmarks} mob setView={setView} setCid={setCid} setCh={setCh} courses={allCourses}/></>)}
        {view==="search"&&(L?<><MHdr title="検索" back={mBack}/><LockedView title="検索"/></>:<><MHdr title="検索" back={mBack}/><SearchView searchQ={searchQ} setSearchQ={setSearchQ} setView={setView} setCid={setCid} setCh={setCh} mob courses={allCourses}/></>)}
        {view==="profile"&&<><MHdr title="プロフィール" back={mBack}/><ProfileView mob togTheme={togTheme} dark={dark} themePref={themePref} setThemePref={setThemePref} accentPref={accentPref} setAccentPref={setAccentPref} asgn={asgn} courses={allCourses} user={user} notifEnabled={notifEnabled} setNotifEnabled={setNotifEnabled} notifSettings={notifSettings} setNotifSettings={setNotifSettings} onLogout={onLogout} appLock={appLock} blocks={blockList} unblockUser={unblockUser} mutes={muteList} unmuteUser={unmuteUser}/></>}
        {view==="navigation"&&<><MHdr title="キャンパスナビ" back={mBack}/><NavigationView mob initialDest={navDest} initialOrig={navOrig} onDestUsed={()=>{setNavDest(null);setNavOrig(null);}}/></>}
        {view==="circles"&&(TR?<><MHdr title="サークル" back={mBack}/><TelecomBlockView title="サークルは現在利用できません" onBack={goBack}/></>:<CircleView mob circles={circleList} messages={circleMsgs} discover={circleDiscover} sendMessage={circleSend} createCircle={createCircle} joinCircle={joinCircle} leaveCircle={leaveCircle} addChannel={circleAddCh} deleteChannel={circleDelCh} pinMessage={circlePin} updateCircle={circleUpdate} onBack={mBack}/>)}
        {view==="acadCal"&&<AcademicCalendarView mob/>}
        {view==="exams"&&(L?<><MHdr title="期末試験" back={mBack}/><LockedView title="期末試験"/></>:<><MHdr title="期末試験" back={mBack}/><ExamView courses={allCourses} mob goToBuilding={goToBuilding} setCid={setCid} setView={setView} setCh={setCh}/></>)}
        {view==="reg"&&<><MHdr title="履修登録補助" back={mBack}/><RegView mob/></>}
        {view==="admin"&&<><MHdr title="管理者" back={mBack}/><AdminView mob courses={allCourses} depts={userDepts} schools={userSchools}/></>}
        {view==="freshman"&&<><MHdr title="新入生掲示板" back={mBack}/><FreshmanBoardView mob loggedIn={!!user.moodleId} onLogin={()=>{setGuestMode(null);setMockMode(false);setAppState("setup");}}/></>}
      </div>
      <MNav view={view} setView={setView} ac={ac} unreadN={unreadN} dmUnread={dmUnread}/>
      <div className="sa-bottom" style={{background:T.bg2,flexShrink:0}}/>
      {appLock.locked&&<LockScreen appLock={appLock} onLogout={onLogout}/>}
      <DemoBanner/>
      <Toasts/>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}html,body{background:${T.bg2};overscroll-behavior:none;-webkit-tap-highlight-color:transparent}::-webkit-scrollbar{width:0;display:none}::placeholder{color:${T.txD}}button,input,textarea,select{font-family:inherit;-webkit-appearance:none}input,textarea{font-size:16px}.sa-bottom{height:env(safe-area-inset-bottom,0px)}@keyframes mnSpin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
