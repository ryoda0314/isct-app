import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { T, updateT, ACCENT_PRESETS, isDarkMode, THEME_MODES } from "./theme.js";
import { setLang, detectLang, t, locName, locCal } from "./i18n.js";
import FogOverlay from "./components/FogOverlay.jsx";
import { I } from "./icons.jsx";
import { QData, ASGN0, MYTK0, EVENTS0, REVIEWS0, MYEVENTS0, SCHOOLS, DEPTS, UNIT_COL, evCat } from "./data.js";
import { DEMO_EVENTS, DEMO_REVIEWS, DEMO_MY_EVENTS, DEMO_TASKS, DEMO_PERSONAS, buildDemoDataForPersona, DEMO_MED_RAW_COURSES, buildDemoMedSessions } from "./demoData.js";
import { setDemoMode, isDemoMode, setScreenshotMode, isScreenshotMode } from "./demoMode.js";
import { useNotifications } from "./hooks/useNotifications.js";
import { useDeadlineNotifications } from "./hooks/useDeadlineNotifications.js";
import { useCurrentUser, setCurrentUserFromAPI, resetCurrentUserCache } from "./hooks/useCurrentUser.js";
import { usePresence } from "./hooks/usePresence.js";
import { useCourseMembers, resetCourseMembersCache } from "./hooks/useCourseMembers.js";
import { useDeptMembers } from "./hooks/useDeptMembers.js";
import { resetCourseMaterialsCache } from "./hooks/useCourseMaterials.js";
import { useMobile, useBreakpoint } from "./utils.jsx";
import { isNative, clearNativeCookies } from "./capacitor.js";
import { openLmsPage } from "./plugins/portalWebView.js";
import { saveTimetableToWidget } from "./plugins/timetableWidget.js";
import { Av, Loader, setProfileOpener } from "./shared.jsx";
import { DSide, DChan, MNav, MoreMenu } from "./layout.jsx";
import { HomeView } from "./views/HomeView.jsx";
import { TTView, CSelect } from "./views/TTView.jsx";
import { AsgnView } from "./views/AsgnView.jsx";
import { FeedView } from "./views/FeedView.jsx";
import { ChatView } from "./views/ChatView.jsx";
import { MatView } from "./views/MatView.jsx";
import { DMView } from "./views/DMView.jsx";
import { PocketView } from "./views/PocketView.jsx";
import { MusicView } from "./views/MusicView.jsx";
import { GymView } from "./views/GymView.jsx";
import { TsubameView } from "./views/TsubameView.jsx";
import { useDailyTsubameClaim } from "./hooks/useTsubamePoints.js";
import { PdfToolsView } from "./views/PdfToolsView.jsx";
import { NotesView } from "./views/NotesView.jsx";
import { MiniPlayer } from "./components/MiniPlayer.jsx";
import { NotifView } from "./views/NotifView.jsx";
import { EventView } from "./views/EventView.jsx";
import { GradeView } from "./views/GradeView.jsx";
import { PomodoroView } from "./views/PomodoroView.jsx";
import { ReviewView } from "./views/ReviewView.jsx";
import { ProfileView } from "./views/ProfileView.jsx";
import { SupportChat } from "./SupportChat.jsx";
import { SearchView } from "./views/SearchView.jsx";
import { BookmarkView } from "./views/BookmarkView.jsx";
import { CalendarView } from "./views/CalendarView.jsx";
import { SetupView } from "./views/SetupView.jsx";
import { NavigationView } from "./views/NavigationView.jsx";
import { FacilityReservationView } from "./views/FacilityReservationView.jsx";
import { TrainView } from "./views/TrainView.jsx";
import { LibraryView } from "./views/LibraryView.jsx";
import { FriendsView } from "./views/FriendsView.jsx";
import { UserProfileView } from "./views/UserProfileView.jsx";
import { CircleView } from "./views/CircleView.jsx";
import { AdminView } from "./views/AdminView.jsx";
import { TextbooksView } from "./views/TextbooksView.jsx";
import { GradingView } from "./views/GradingView.jsx";
import { FreshmanBoardView } from "./views/FreshmanBoardView.jsx";
import { AcademicCalendarView } from "./views/AcademicCalendarView.jsx";
import { ExamView } from "./views/ExamView.jsx";
import { FreeRoomView } from "./views/FreeRoomView.jsx";
import { RegView } from "./views/RegView.jsx";
import { MedTTView } from "./views/MedTTView.jsx";
import { SciAttendanceView } from "./views/SciAttendanceView.jsx";
import { MedAttendanceView } from "./views/MedAttendanceView.jsx";
import { DeptModal } from "./components/DeptModal.jsx";
import { ACADEMIC_EVENTS, getCurrentQuarter } from "./academicCalendar.js";
import { useFriends } from "./hooks/useFriends.js";
import { useBlocks } from "./hooks/useBlocks.js";
import { useMutes } from "./hooks/useMutes.js";
import { useTasks } from "./hooks/useTasks.js";
import { useCalendarEvents } from "./hooks/useCalendarEvents.js";
import { useOfflineQueue } from "./hooks/useOfflineQueue.js";
import { useGroups } from "./hooks/useGroups.js";
import { getClientToken, clearClientToken, fetchUserCourses as moodleFetchCourses, fetchAssignments as moodleFetchAssignments, fetchSubmissionStatus as moodleFetchSubmissionStatus } from "./moodleClient.js";
import { useCircles } from "./hooks/useCircles.js";
import { Toasts, showToast } from "./hooks/useToast.js";
import { useBookmarks } from "./hooks/useBookmarks.js";
import { useAttendance } from "./hooks/useAttendance.js";
import { useUnreadDM } from "./hooks/useUnreadDM.js";
import { useAppLock } from "./hooks/useAppLock.js";
import { installFetchInterceptor, updateStatusBarTheme } from "./capacitor.js";

installFetchInterceptor();

const API="";

// Fetch with a hard timeout so a slow/unreachable backend (e.g. Supabase
// disk-IO throttling) can't freeze startup forever. On timeout the promise
// rejects, letting callers fall back to cache / setup instead of hanging.
const fetchT=(url,opts={},ms=12000)=>fetch(url,{...opts,signal:AbortSignal.timeout(ms)});

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
    {fails>=5&&<button onClick={()=>{if(confirm(t("app.logoutConfirm"))){appLock.removePin();onLogout();}}} style={{marginTop:24,padding:"10px 24px",borderRadius:10,border:"none",background:T.red,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer"}}>{t("app.logout")}</button>}
    <style>{`@keyframes appLockShake{10%,90%{transform:translateX(-2px)}20%,80%{transform:translateX(4px)}30%,50%,70%{transform:translateX(-6px)}40%,60%{transform:translateX(6px)}}`}</style>
  </div>;
};

// ============================================================
export default function App(){
  const mob=useMobile();
  const bp=useBreakpoint(); // "mobile" | "tablet" | "desktop"
  const [appState,setAppState]=useState("loading");
  const [reconnecting,setReconnecting]=useState(false);
  const ready=appState==="ready";
  const user=useCurrentUser(ready);
  const [themePref,setThemePref]=useState(()=>{try{const v=localStorage.getItem("themePref");if(v)return v;return "tsubame";}catch{return "tsubame";}});
  const [accentPref,setAccentPref]=useState(()=>{try{return localStorage.getItem("accentPref")||"default";}catch{return "default";}});
  const [langPref,setLangPref]=useState(()=>{try{return localStorage.getItem("langPref")||detectLang();}catch{return "ja";}});
  const [sitelenPref,setSitelenPref]=useState(()=>{try{return localStorage.getItem("sitelenPona")==="1";}catch{return false;}});
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
  useEffect(()=>{try{localStorage.setItem("langPref",langPref);}catch{}try{document.documentElement.lang=langPref;}catch{}},[langPref]);
  useEffect(()=>{try{localStorage.setItem("sitelenPona",sitelenPref?"1":"0");}catch{}},[sitelenPref]);
  useEffect(()=>{try{document.body.classList.toggle("sitelen-pona",langPref==="tp"&&sitelenPref);}catch{}},[langPref,sitelenPref]);
  const themeMode=themePref==="auto"?(sysDark?"dark":"light"):themePref;
  const dark=isDarkMode(themeMode);
  updateT(themeMode,accentPref);
  setLang(langPref);
  updateStatusBarTheme(T.bg2);
  useEffect(()=>{document.documentElement.style.background=T.bg;document.body.style.background=T.bg;},[themeMode,accentPref]);
  const [mockMode,setMockMode]=useState(false);
  const [guestMode,setGuestMode]=useState(()=>{if(typeof window==="undefined")return null;const h=window.location.hash;if(h==="#freshman")return "freshman";if(h==="#navi")return "navi";if(h==="#reg")return "reg";return null;});
  const [fromGuest,setFromGuest]=useState(null);
  // ツバメポイント: 起動時に当日分を自動受け取り（View を開かなくても貯まる）。
  //   demo/guest では付与しない（本人セッションのみ）。
  useDailyTsubameClaim({
    active: ready && !guestMode && !isDemoMode(),
    onClaimed: (res) => showToast(t("tsubame.claimedToast", { n: res.awarded }), "success"),
  });
  const [quarter,setQuarter]=useState(()=>{try{const v=localStorage.getItem("quarter");if(v)return Number(v);const jd=new Date(Date.now()+9*3600000);return getCurrentQuarter(jd);}catch{return 1;}});
  const [qDataLive,setQDataLive]=useState(null);
  const [pastTTCache,setPastTTCache]=useState({});
  const [pastTTLoading,setPastTTLoading]=useState(false);
  const [pastTTError,setPastTTError]=useState(null);
  const [_selY,_setSelY]=useState(()=>{try{const v=localStorage.getItem("tty");if(v)return Number(v);const jd=new Date(Date.now()+9*3600000);return jd.getUTCMonth()>=3?jd.getUTCFullYear():jd.getUTCFullYear()-1;}catch{const jd=new Date(Date.now()+9*3600000);return jd.getUTCMonth()>=3?jd.getUTCFullYear():jd.getUTCFullYear()-1;}});
  const qd=(qDataLive&&qDataLive[quarter])||QData[quarter]||{C:[],TT:[]};
  const [allCourses,setAllCourses]=useState([]);
  const [medRawCourses,setMedRawCourses]=useState([]);
  const [demoMedKey,setDemoMedKey]=useState(null);
  const [medSessions,setMedSessions]=useState([]);
  const [view,setViewRaw]=useState(()=>{try{return localStorage.getItem("lastView")||"home";}catch{return "home";}});
  const viewHistRef=useRef([]);
  const guestSessionRef=useRef(null);
  const setView=useCallback((v)=>{setShowMembers(false);setViewRaw(prev=>{if(prev&&prev!==v)viewHistRef.current.push(prev);return v;});},[]);
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

  // Deep link: widget tap (scitokyo://timetable) opens the timetable view (native).
  useEffect(()=>{
    if(!isNative())return;
    let cleanup;
    const route=(url)=>{if(url&&/timetable/i.test(url))setView("timetable");};
    (async()=>{
      try{
        const {App:CapApp}=await import("@capacitor/app");
        const launch=await CapApp.getLaunchUrl();
        route(launch?.url);
        cleanup=await CapApp.addListener("appUrlOpen",(e)=>route(e?.url));
      }catch{}
    })();
    return()=>{cleanup?.remove?.();};
  },[]);

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
  const [pendingMat,setPendingMat]=useState(null);
  const [pendingNote,setPendingNote]=useState(null); // 教材→ノート橋渡し（作成 or 既存を開く）
  const [showMembers,setShowMembers]=useState(false);
  const [lmsLoading,setLmsLoading]=useState(false);
  const [asgn,setAsgn]=useState(ASGN0);
  const [hiddenAsgn,setHiddenAsgn]=useState(()=>{try{return JSON.parse(localStorage.getItem("hiddenAsgn"))||[];}catch{return[];}});
  const saveHidden=ids=>{setHiddenAsgn(ids);try{localStorage.setItem("hiddenAsgn",JSON.stringify(ids));}catch{}};
  const {tasks:myTasks,setTasks:setMyTasks,addTask:addTaskFn,toggleTask:toggleTaskFn,deleteTask:deleteTaskFn}=useTasks(ready);
  const appLock=useAppLock();
  const {bmarks,toggle:togBmark}=useBookmarks(ready);
  const {records:attRecords,setStatus:setAttStatus}=useAttendance(ready);
  const [attSys,setAttSys]=useState(null); // 出欠管理: 'sci'|'med' 手動切替（両方持つユーザー用）
  const [events,setEvents]=useState(EVENTS0);
  const allEvents=useMemo(()=>[...events,...ACADEMIC_EVENTS.map(e=>({...e,title:locCal(e.title),desc:locCal(e.desc),loc:locCal(e.loc)}))],[events,langPref]);
  // grades are now fetched inside GradeView directly
  const [reviews,setReviews]=useState(REVIEWS0);
  const {events:myEvents,setEvents:setMyEvents,addEvent:addEventFn,addEvents:addEventsFn,updateEvent:updateEventFn,deleteEvent:deleteEventFn}=useCalendarEvents(ready);
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
  const [lmsDown,setLmsDown]=useState(false);
  const [refreshing,setRefreshing]=useState(false);

  const lastAsnErrorRef=useRef(false);
  const startupBusyRef=useRef(true);

  /** Apply fetched (or cached) data to state. Returns asnList or false. */
  const applyData=(d)=>{
    if(d.qData) setQDataLive(d.qData);
    if(d.courses){setAllCourses(d.courses);if(d.courses[0]&&!cid)setCid(d.courses[0].id);}
    const asnList=d.assignments?d.assignments.map(a=>({...a,due:new Date(a.due),st:'loading'})):[];
    if(d.assignments) setAsgn(prev=>{
      if(!prev||prev.length===0) return asnList;
      const m={};prev.forEach(p=>{if(p.st&&p.st!=='loading') m[p.id]=p;});
      return asnList.map(a=>{const p=m[a.id];return p?{...a,st:p.st,sub:p.sub}:a;});
    });
    if(d.user) setCurrentUserFromAPI(d.user);
    lastAsnErrorRef.current=!!d.assignmentError;
    return asnList;
  };

  /** Try to restore from localStorage cache. Returns asnList or false. */
  const loadCachedData=()=>{
    try{
      const raw=localStorage.getItem('dataAllCache');
      if(!raw) return false;
      const d=JSON.parse(raw);
      console.log('[App] loading cached data from localStorage');
      const asnList=applyData(d);
      setLmsDown(true);
      return asnList;
    }catch(e){console.error('[App] cache load error:',e);return false;}
  };

  /** Apply last-known submission statuses from cache so assignments render instantly. */
  const applyCachedStatuses=()=>{
    try{
      const merged=JSON.parse(localStorage.getItem('asnStatusCache')||'{}');
      if(Object.keys(merged).length>0){
        setAsgn(prev=>prev.map(a=>{const s=merged[a.id];return s?{...a,st:s.st,sub:s.sub?new Date(s.sub):undefined}:a;}));
      }
    }catch{}
  };

  /** Paint cached data for an instant first frame on startup (no lmsDown banner). Returns asnList or false. */
  const loadCacheForStartup=()=>{
    try{
      const raw=localStorage.getItem('dataAllCache');
      if(!raw) return false;
      const asnList=applyData(JSON.parse(raw));
      applyCachedStatuses();
      return asnList;
    }catch(e){console.error('[App] startup cache load error:',e);return false;}
  };

  /** Client-side Moodle API flow: fetch token, call Moodle directly, then send to server for transforms */
  const fetchDataClientSide=async(opts={})=>{
    const t0=performance.now();
    let step='init';
    const tag=(s)=>{step=s;console.log(`[ClientFetch] step=${s} t=${(performance.now()-t0).toFixed(0)}ms`);};
    try{
      // Step 1: Get token (in-memory cached, auto-expires after 10min)
      tag('token');
      let wstoken,userid;
      try{
        ({wstoken,userid}=await getClientToken());
      }catch(e){
        if(e.code==='AUTH_REQUIRED'){if(!opts.silentAuth)setAppState("setup");return false;}
        console.error(`[ClientFetch] token fetch failed: name=${e.name} code=${e.code||'-'} msg=${e.message}`);
        throw e;
      }
      console.log(`[Timing] client-side: token fetch ${(performance.now()-t0).toFixed(0)}ms`);

      // Step 2: Call Moodle API directly from client
      tag('courses');
      const rawCourses=await moodleFetchCourses(wstoken,userid);
      console.log(`[Timing] client-side: courses fetch ${(performance.now()-t0).toFixed(0)}ms (${rawCourses.length} courses)`);

      // Extract medical/dental course info (fullname contains【lctCd】)
      const medRaw=rawCourses.filter(c=>c.visible!==0&&/【\d{6}】/.test(c.fullname));
      if(medRaw.length>0){
        setMedRawCourses(medRaw);
        // Fetch med sessions for home timeline
        const medCrs=medRaw.map(c=>{const m=c.fullname.match(/【(\d{6})】/);const cm=c.shortname?.match(/([A-Z]{2,4}\.[A-Z]\d{3})/);return{code:cm?cm[1]:c.shortname,lctCd:m[1],name:c.fullname.split(" / ")[0].replace(/\s*\/?\s*【\d{6}】/,"").trim()};});
        fetch("/api/data/med-schedule",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({courses:medCrs})}).then(r=>r.ok?r.json():null).then(d=>{if(d?.sessions)setMedSessions(d.sessions);}).catch(()=>{});
      }

      tag('assignments');
      const moodleIds=rawCourses.filter(c=>c.visible!==0).map(c=>c.id);
      let rawAssignments=null;
      try{rawAssignments=await moodleFetchAssignments(wstoken,moodleIds);}
      catch(e){console.error(`[ClientFetch] assignment fetch soft-fail: name=${e.name} code=${e.code||'-'} msg=${e.message}`);}
      console.log(`[Timing] client-side: assignments fetch ${(performance.now()-t0).toFixed(0)}ms`);

      // Step 3: Send raw data to server for transforms (syllabus, timetable, profile)
      tag('all-meta');
      const metaR=await fetch(`${API}/api/data/all-meta`,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({rawCourses,rawAssignments}),
      });
      if(!metaR.ok){
        const body=await metaR.text().catch(()=>'<body read failed>');
        console.error(`[ClientFetch] all-meta failed status=${metaR.status} body=${body.substring(0,300)}`);
        throw new Error(`all-meta failed: ${metaR.status}`);
      }
      tag('parse');
      const d=await metaR.json();
      try{localStorage.setItem('dataAllCache',JSON.stringify(d));}catch{}
      setLmsDown(false);
      const asnList=applyData(d);
      console.log(`[Timing] client-side total: ${(performance.now()-t0).toFixed(0)}ms`);
      return asnList;
    }catch(e){
      console.error(`[ClientFetch] THREW at step=${step} t=${(performance.now()-t0).toFixed(0)}ms name=${e.name} code=${e.code||'-'} msg=${e.message}`);
      if(e.stack) console.error(`[ClientFetch] stack:`,e.stack);
      e.clientFetchStep=step;
      throw e;
    }
  };

  /** Original server-side flow (fallback) */
  const fetchDataServerSide=async(opts={})=>{
    const t0=performance.now();
    const r=await fetchT(`${API}/api/data/all`,{},15000);
    console.log(`[Timing] /api/data/all fetch: ${(performance.now()-t0).toFixed(0)}ms`);
    if(r.status===401){console.warn('[App] fetchData: 401 — not authenticated');if(!opts.silentAuth)setAppState("setup");return false;}
    if(r.status===503){
      console.warn('[App] fetchData: 503 — LMS down, trying cache');
      return loadCachedData();
    }
    if(!r.ok){console.error(`[App] /api/data/all failed: ${r.status} ${r.statusText}`);return loadCachedData();}
    const d=await r.json();
    try{localStorage.setItem('dataAllCache',JSON.stringify(d));}catch{}
    setLmsDown(false);
    const asnList=applyData(d);
    console.log(`[Timing] /api/data/all total: ${(performance.now()-t0).toFixed(0)}ms${d.assignmentError?' [assignmentError]':''}`);
    return asnList;
  };

  const fetchData=async(opts={})=>{
    try{
      // Try client-side Moodle API first (bypasses server-side 403 block)
      return await fetchDataClientSide(opts);
    }catch(e){
      console.warn(`[App] client-side fetch failed at step=${e.clientFetchStep||'?'} name=${e.name} code=${e.code||'-'} msg=${e.message}, falling back to server-side`);
      try{
        return await fetchDataServerSide(opts);
      }catch(e2){
        console.error(`[App] fetchData exception: name=${e2.name} code=${e2.code||'-'} msg=${e2.message}`,e2);
        return loadCachedData();
      }
    }
  };

  /** Client-side submission status fetch — calls Moodle directly */
  const fetchSubmissionStatusesClientSide=async(currentAsgn,wstoken)=>{
    const CONCURRENCY=5;
    const statuses={};
    const errors=[]; // {id, moodleId, name, code, httpStatus, message}
    const emptySubmissions=[]; // {id, moodleId} — succeeded but no submission data
    for(let i=0;i<currentAsgn.length;i+=CONCURRENCY){
      const batch=currentAsgn.slice(i,i+CONCURRENCY);
      await Promise.all(batch.map(async({id,moodleId})=>{
        try{
          const status=await moodleFetchSubmissionStatus(wstoken,moodleId);
          if(!status?.lastattempt?.submission){emptySubmissions.push({id,moodleId});return;}
          const sub=status.lastattempt.submission;
          let st='not_started';
          if(sub.status==='submitted') st='completed';
          else if(sub.status==='draft') st='in_progress';
          else if(sub.status==='new'&&sub.timemodified>0) st='in_progress';
          statuses[id]={st,sub:st==='completed'?new Date(sub.timemodified*1000).toISOString():null};
        }catch(e){
          errors.push({id,moodleId,name:e.name,code:e.code||null,httpStatus:e.httpStatus||null,message:(e.message||'').substring(0,200)});
          console.error(`[App] client submission status failed for ${id} (moodle:${moodleId}): name=${e.name} code=${e.code||'-'} msg=${e.message}`);
        }
      }));
    }
    return {statuses,errors,emptySubmissions};
  };

  const fetchSubmissionStatuses=async(assignList)=>{
    try{
      const t0=performance.now();
      let currentAsgn=[];
      const pick=list=>list.filter(a=>a.moodleId&&a.st!=='completed');
      if(assignList){currentAsgn=pick(assignList).map(a=>({id:a.id,moodleId:a.moodleId}));}
      else{setAsgn(prev=>{currentAsgn=pick(prev).map(a=>({id:a.id,moodleId:a.moodleId}));return prev;});}
      if(currentAsgn.length===0)return;
      console.log(`[Timing] fetchSubmissionStatuses: requesting ${currentAsgn.length} items`);

      let statuses=null;
      let clientFailure=null; // summary sent to server on fallback for Vercel-side diagnostics

      // Try client-side first (token from in-memory cache)
      try{
        const{wstoken}=await getClientToken();
        const res=await fetchSubmissionStatusesClientSide(currentAsgn,wstoken);
        statuses=res.statuses;
        if(Object.keys(statuses).length>0){
          console.log(`[Timing] client-side submission statuses: ${(performance.now()-t0).toFixed(0)}ms (ok=${Object.keys(statuses).length} errors=${res.errors.length} empty=${res.emptySubmissions.length})`);
        }else{
          clientFailure={stage:'moodle_calls',total:currentAsgn.length,errors:res.errors.slice(0,10),emptyCount:res.emptySubmissions.length};
          console.warn(`[App] client-side returned 0 statuses — errors=${res.errors.length} empty=${res.emptySubmissions.length}`);
          statuses=null;
        }
      }catch(e){
        clientFailure={stage:'token_or_setup',name:e.name,code:e.code||null,message:(e.message||'').substring(0,200)};
        console.warn(`[App] client-side submission status threw: name=${e.name} code=${e.code||'-'} msg=${e.message}`);
      }

      // Fallback to server-side
      if(!statuses){
        const body=JSON.stringify({assignments:currentAsgn,clientFailure});
        for(let attempt=1;attempt<=3;attempt++){
          try{
            const r=await fetch(`${API}/api/data/assignments/status`,{method:'POST',headers:{'Content-Type':'application/json'},body});
            if(!r.ok){console.error(`[App] fetchSubmissionStatuses attempt ${attempt} failed:`,r.status);continue;}
            const d=await r.json();
            if(d.statuses&&Object.keys(d.statuses).length>0){statuses=d.statuses;break;}
            console.warn(`[App] fetchSubmissionStatuses attempt ${attempt}: 0 results, retrying in 3s...`);
          }catch(e){console.error(`[App] fetchSubmissionStatuses attempt ${attempt} error:`,e.message);}
          if(attempt<3) await new Promise(r=>setTimeout(r,3000));
        }
      }

      // Merge with cache
      let merged={};
      try{merged=JSON.parse(localStorage.getItem('asnStatusCache')||'{}');}catch{}
      if(statuses){
        merged={...merged,...statuses};
        try{localStorage.setItem('asnStatusCache',JSON.stringify(merged));}catch{}
      }else if(Object.keys(merged).length>0){
        console.log(`[App] all attempts failed — using cached ${Object.keys(merged).length} statuses`);
      }
      const counts={completed:0,in_progress:0,not_started:0};
      Object.values(merged).forEach(s=>{if(s&&s.st)counts[s.st]=(counts[s.st]||0)+1;});
      const src=statuses?'':'[cached]';
      console.log(`[Timing] fetchSubmissionStatuses done: ${(performance.now()-t0).toFixed(0)}ms — 提出済=${counts.completed} 進行中=${counts.in_progress} 未着手=${counts.not_started} (total=${Object.keys(merged).length}${src?' '+src:''})`);
      setAsgn(prev=>prev.map(a=>{const s=merged[a.id];if(!s)return a.st==='loading'?{...a,st:'not_started'}:a;return{...a,st:s.st,sub:s.sub?new Date(s.sub):undefined};}));
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
    // 機能紹介ページ(/features)の実演iframe(/embed/demo#demo)用：認証/通信を一切せず即デモ起動。
    if(typeof window!=="undefined"&&window.location.hash==="#demo"){onDemo("ss");return;}
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
      if(lastAsnErrorRef.current){
        console.warn('[App] assignments failed on startup — retrying in 3s');
        setTimeout(async()=>{
          const r=await fetchData();
          if(r&&!lastAsnErrorRef.current) fetchSubmissionStatuses(r);
          startupBusyRef.current=false;
        },3000);
      }else{
        startupBusyRef.current=false;
      }
    };
    // Cache-first: show last-known data immediately, then refresh in the background
    // so a slow token recovery (on-device SSO) never freezes the splash.
    const goReadyFromCache=(cachedAsn)=>{
      setAppState("ready");
      if(guestMode) setGuestMode(null);
      fetchSiteSettings();
      refreshRef.current=setInterval(async()=>{const r2=await fetchData();if(r2)fetchSubmissionStatuses(r2);},15*60*1000);
      setRefreshing(true);
      (async()=>{
        try{
          const fresh=await fetchData({silentAuth:true});
          if(fresh) await fetchSubmissionStatuses(fresh);
        }catch(e){console.warn('[App] background refresh failed:',e.message);}
        finally{setRefreshing(false);startupBusyRef.current=false;}
      })();
    };
    // Native: proactively migrate credentials to the device Keychain on every
    // launch (no-op once migrated). Fire-and-forget — never blocks startup.
    if(wasLoggedIn&&isNative()) import('./secureCreds.js').then(m=>m.ensureMigrated?.()).catch(()=>{});
    (async()=>{
      // Previously logged in → skip /api/auth/status, go straight to fetchData
      // iOS PWA often fails to send cookies on the initial status check after cold start
      // 審査アカウント判定を最優先で行う（wasLoggedIn でも status チェック）
      try{
        const sr=await fetchT(`${API}/api/auth/status`);
        const sd=await sr.json();
        if(sd.loginId==="apple-review"){console.log("[App] review account detected, loading demo");onDemo("ss");return;}
      }catch{}
      if(wasLoggedIn){
        // Paint cached data instantly and refresh in the background.
        const cachedAsn=loadCacheForStartup();
        if(cachedAsn){
          console.log(`[Timing] cache-first paint: ${(performance.now()-tStart).toFixed(0)}ms`);
          goReadyFromCache(cachedAsn);
          return;
        }
        console.log(`[Timing] wasLoggedIn=true, no cache, calling fetchData directly`);
        try{
          const asnList=await fetchData();
          if(asnList){goReady(asnList);return;}
        }catch(e){console.error("[App] direct fetchData failed:",e.message);}
        console.log(`[Timing] direct fetchData failed, falling back to /api/auth/status`);
      }
      try{
        const t0=performance.now();
        const r=await fetchT(`${API}/api/auth/status`);
        const d=await r.json();
        console.log(`[Timing] /api/auth/status: ${(performance.now()-t0).toFixed(0)}ms (hasCredentials=${d.hasCredentials})`);
        if(d.loginId==="apple-review"){console.log("[App] review account detected, loading demo");onDemo("ss");return;}
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

  // Re-fetch data when app resumes from background
  useEffect(()=>{
    if(appState!=="ready") return;
    const cleanup={fn:null};
    let cancelled=false;
    let bgTime=null;
    const onPause=()=>{bgTime=Date.now();};
    const onResume=async()=>{
      if(!bgTime) return;
      const sec=(Date.now()-bgTime)/1000;
      bgTime=null;
      if(sec<5) return;
      if(startupBusyRef.current){console.log('[App] resume skipped — startup still in progress');return;}
      console.log(`[App] resume after ${sec.toFixed(0)}s — re-fetching data`);
      const r=await fetchData();
      if(r) fetchSubmissionStatuses(r);
    };
    (async()=>{
      try{
        const{App}=await import("@capacitor/app");
        if(cancelled) return;
        const p=await App.addListener("pause",onPause);
        const r=await App.addListener("resume",onResume);
        cleanup.fn=()=>{p.remove();r.remove();};
        if(cancelled){cleanup.fn();cleanup.fn=null;}
      }catch{
        if(cancelled) return;
        const h=()=>{if(document.hidden) onPause(); else onResume();};
        document.addEventListener("visibilitychange",h);
        cleanup.fn=()=>document.removeEventListener("visibilitychange",h);
        if(cancelled){cleanup.fn();cleanup.fn=null;}
      }
    })();
    return()=>{cancelled=true;cleanup.fn?.();};
  },[appState]);

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
  // Push the full timetable (all quarters/years) to the iOS widget; it filters by its
  // own year+quarter config. defaultYear/Quarter = what an unconfigured widget shows. Native-only.
  useEffect(()=>{if(allCourses&&allCourses.length)saveTimetableToWidget({allCourses,pastTTCache,defaultYear:_selY,defaultQuarter:quarter});},[allCourses,pastTTCache,quarter,_selY]);
  useEffect(()=>{try{localStorage.setItem("notifEnabled",JSON.stringify(notifEnabled));}catch{}},[notifEnabled]);
  useEffect(()=>{try{localStorage.setItem("notifSettings",JSON.stringify(notifSettings));}catch{}},[notifSettings]);
  const onSetupComplete=async()=>{try{const sr=await fetchT(`${API}/api/auth/status`);const sd=await sr.json();if(sd.loginId==="apple-review"){console.log("[App] review account detected, loading demo");onDemo("ss");return;}}catch{}const MAX=4;const attempt=async(n)=>{console.log(`[App] onSetupComplete: fetchData attempt ${n}/${MAX}`);const r=await fetchData();if(r){console.log(`[App] onSetupComplete: fetchData OK — ${r.length} assignments`);setAppState("ready");refreshRef.current=setInterval(async()=>{const r2=await fetchData();if(r2)fetchSubmissionStatuses(r2);},15*60*1000);fetchSiteSettings();fetchSubmissionStatuses(r);return;}if(n<MAX){const delay=n*2;console.warn(`[App] onSetupComplete: fetchData attempt ${n} failed, retrying in ${delay}s...`);await new Promise(r=>setTimeout(r,delay*1000));return attempt(n+1);}console.error(`[App] onSetupComplete: fetchData failed after ${MAX} attempts, returning to setup`);setAppState("setup");};await attempt(1);};
  const onDemo=(personaId)=>{const pd=buildDemoDataForPersona(personaId);setDemoMode(true);setScreenshotMode(personaId==="ss");setAllCourses(pd.courses);setQDataLive(pd.qdata);setAsgn(pd.asgn.map(a=>({...a,due:a.due instanceof Date?a.due:new Date(a.due)})));setMyTasks(DEMO_TASKS);setReviews(DEMO_REVIEWS);setMyEvents(DEMO_MY_EVENTS);setEvents(DEMO_EVENTS);setCurrentUserFromAPI(pd.user);const medRaw=DEMO_MED_RAW_COURSES[personaId];if(medRaw){setMedRawCourses(medRaw);setDemoMedKey(personaId);const ms=buildDemoMedSessions(personaId);setMedSessions(ms.sessions||[]);}else{setMedRawCourses([]);setDemoMedKey(null);setMedSessions([]);}const q2c=pd.courses.find(c=>c.quarter===2);setCid(q2c?q2c.id:pd.courses[0].id);setQuarter(2);circleInit();try{localStorage.setItem("myLocation","lib");}catch{}setAppState("ready");};

  const cc=allCourses.find(c=>c.id===cid);
  const userDepts=useMemo(()=>{
    // 学系を登録済みのユーザーのみ表示
    if(user.myDept&&DEPTS[user.myDept]){
      return [{id:`dept:${user.myDept}`,prefix:user.myDept,...DEPTS[user.myDept]}];
    }
    return [];
  },[user.myDept]);
  const userSchools=useMemo(()=>{
    // 学系を登録済みのユーザーのみ、所属学院を表示
    if(user.myDept&&DEPTS[user.myDept]){
      const sk=DEPTS[user.myDept].school;
      if(SCHOOLS[sk]) return [{id:`school:${sk}`,prefix:`school:${sk}`,name:SCHOOLS[sk].name,col:SCHOOLS[sk].col}];
    }
    return [];
  },[user.myDept]);
  const userUnit=useMemo(()=>{
    if(!user.myUnit) return null;
    const parts=user.myUnit.split("-");
    const yg=parts[0]||"";
    const num=parts[1]||user.myUnit;
    return {id:user.myUnit,yg,num,name:`${t("sidebar.unit")}${num}`,col:UNIT_COL,prefix:`unit:${user.myUnit}`};
  },[user.myUnit]);
  const SANDBOX={id:"sandbox",name:t("nav.testground"),col:"#6366f1",prefix:"global:sandbox"};
  const [deptModalDone,setDeptModalDone]=useState(false);
  const showDeptModal=!deptModalDone&&!user.myDept;
  const cd=did===SANDBOX.prefix?SANDBOX:userDepts.find(d=>d.prefix===did)||userSchools.find(s=>s.prefix===did)||(userUnit&&did===userUnit.prefix?userUnit:null);
  const qCourseIds=useMemo(()=>new Set(allCourses.filter(c=>c.quarter===quarter&&(!_selY||!c.year||c.year===_selY)).map(c=>c.id)),[allCourses,quarter,_selY]);
  const hiddenSet=useMemo(()=>new Set(hiddenAsgn),[hiddenAsgn]);
  const asgnLoading=asgn.some(a=>a.st==='loading');
  const ac=asgnLoading?null:asgn.filter(a=>a.st!=="completed"&&qCourseIds.has(a.cid)&&!hiddenSet.has(a.id)).length;
  const {unreadCount:unreadN}=useNotifications(ready);
  useDeadlineNotifications(asgn, ready && notifEnabled && notifSettings.deadline);
  // My Task deadlines reuse the same deadline pipeline (prefixed ids avoid dedup collisions with assignments).
  const taskDeadlineItems=useMemo(()=>(myTasks||[]).filter(tk=>!tk.d&&tk.due).map(tk=>({id:`task_${tk.id}`,title:tk.t,cid:null,due:tk.due,st:"active"})),[myTasks]);
  useDeadlineNotifications(taskDeadlineItems, ready && notifEnabled && notifSettings.deadline, "task");
  const {unreadDM:dmUnread,markDMSeen}=useUnreadDM(user?.moodleId||user?.id);
  const {friends:friendList,pending:friendPending,sent:friendSent,loading:friendLoading,pendingCount:pendingFriendCount,friendIds:_fIds,isFriend:_isFriend,sendRequest,acceptRequest,rejectRequest,unfriend,searchUsers,lookupById,fetchGraph,fetchRecommendations,refetch:refetchFriends}=useFriends(ready,user?.moodleId||user?.id);
  const {blocks:blockList,isBlocked,blockUser,unblockUser}=useBlocks(ready);
  const {mutes:muteList,isMuted,muteUser,unmuteUser}=useMutes(ready);
  const {enqueue:enqueueOffline,pending:offlinePending}=useOfflineQueue();
  const {online}=usePresence("app",{id:user.moodleId||user.id,name:user.name,col:user.col});
  const members=useCourseMembers(cc?.moodleId);
  const deptMembers=useDeptMembers(cd?.prefix);
  const [navDest,setNavDest]=useState(null);
  const [navOrig,setNavOrig]=useState(null);
  const navCrs=id=>{setCid(id);setView("course");setCh("materials");};
  const goToBuilding=(destId,origId)=>{if(destId){setNavDest(destId);setNavOrig(origId||null);setView("navigation");}};
  // 教材→ノート: PDF を端末ローカルのノートに取り込み手書き編集へ（年度/クォーター/講義メタ付き）
  const annotateMaterial=({matId,name,base64,course,session,sessionOrder})=>{setPendingNote({create:{base64,name,matId,courseId:course?.id,courseName:course?.name,courseCode:course?.code,year:course?.year||_selY,quarter:course?.quarter,session,sessionOrder}});setView("notes");};
  const openMaterialNote=(noteId)=>{setPendingNote({openId:noteId});setView("notes");};
  // togBmark is now from useBookmarks()
  const {groups:groupList,createGroup,leaveGroup}=useGroups(ready,user?.moodleId||user?.id);
  const {circles:circleList,messages:circleMsgs,discover:circleDiscover,sendMessage:circleSend,createCircle,joinCircle,leaveCircle,addChannel:circleAddCh,deleteChannel:circleDelCh,pinMessage:circlePin,updateCircle:circleUpdate,init:circleInit,fetchMessages:circleFetchMsgs}=useCircles(ready,user?.moodleId||user?.id);
  const [dmTarget,setDmTarget]=useState(null); // {id,name,avatar,color} — DMViewが開いたら消費
  const startDMFromFriend=(fid,name,avatar,color)=>{if(fid)setDmTarget({id:fid,name,avatar,color});setView("dm");};
  const [profileId,setProfileId]=useState(null);
  const openProfile=useCallback((id)=>{if(id==null)return;setProfileId(id);setView("user");},[setView]);
  // どこでもアイコンタップでプロフィールが開くよう、グローバルオープナーを登録
  useEffect(()=>{setProfileOpener(openProfile);},[openProfile]);
  const openGroupChat=(g)=>{setView("dm");};
  const friendProps={friends:friendList,pending:friendPending,sent:friendSent,loading:friendLoading,pendingCount:pendingFriendCount,sendRequest,acceptRequest,rejectRequest,unfriend,searchUsers,onStartDM:startDMFromFriend,userId:user?.moodleId||user?.id,lookupById,fetchGraph,fetchRecommendations,openProfile,isAdmin:!!user?.isAdmin,groups:groupList,createGroup,leaveGroup,onOpenGroup:openGroupChat,blockUser,unblockUser,isBlocked,blocks:blockList,muteUser,unmuteUser,isMuted,mutes:muteList,refetch:refetchFriends};
  const profileProps={userId:profileId,user,lookupById,onStartDM:startDMFromFriend,sendRequest,acceptRequest,unfriend,blockUser,muteUser,unmuteUser,isMuted,onEditProfile:()=>setView("profile"),goBack,refetch:refetchFriends};
  const togTheme=()=>setThemePref(p=>p==="dark"?"light":"dark");
  const onLogout=async()=>{setDemoMode(false);clearClientToken();try{await fetch("/api/auth/logout",{method:"POST"});}catch{}await clearNativeCookies();try{const{clearCreds}=await import("./secureCreds.js");await clearCreds();}catch{}if(refreshRef.current){clearInterval(refreshRef.current);refreshRef.current=null;}resetCurrentUserCache();resetCourseMembersCache();resetCourseMaterialsCache();try{localStorage.clear();}catch{}setAllCourses([]);setQDataLive(null);setAsgn(ASGN0);setHiddenAsgn([]);setMyTasks(MYTK0);setEvents(EVENTS0);setReviews(REVIEWS0);setMyEvents(MYEVENTS0);setRsvps({});setQuarter(2);setNotifEnabled(true);setNotifSettings({course:true,deadline:true,dm:true,event:true});setPomo({running:false,sec:25*60,mode:"work",sessions:0});setSearchQ("");setCid(null);setDid(null);setCh("timeline");viewHistRef.current=[];setView("home");setMockMode(false);setAppState("setup");};

  // Telecom restriction overlay — shown when regulated features are disabled
  const TelecomBlockView=({title,onBack})=><div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:32,gap:16}}>
    <div style={{width:64,height:64,borderRadius:20,background:`${T.orange}15`,border:`1px solid ${T.orange}30`,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={T.orange} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    </div>
    <div style={{fontSize:16,fontWeight:700,color:T.txH,textAlign:"center"}}>{title||t("app.featUnavailable")}</div>
    <div style={{fontSize:13,color:T.txD,textAlign:"center",lineHeight:1.8,maxWidth:340}}>
      {telecomMsg||"メッセージング機能（DM・チャット・サークルメッセージ等）は現在一時的に制限されています。"}
    </div>
    <div style={{fontSize:12,color:T.txD,textAlign:"center",lineHeight:1.6,marginTop:4,padding:"10px 16px",borderRadius:10,background:T.bg3,border:`1px solid ${T.bd}`}}>
      投稿・コメント・フレンド機能など<br/>掲示板型の機能は引き続きご利用いただけます。
    </div>
    {onBack&&<button onClick={onBack} style={{marginTop:8,padding:"10px 28px",borderRadius:10,border:`1px solid ${T.bd}`,background:T.bg2,color:T.txH,fontSize:14,fontWeight:600,cursor:"pointer"}}>{t("common.back")}</button>}
  </div>;

  // Lock screen for mock mode
  const LockedView=({title})=><div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:32,gap:12}}>
    <div style={{width:56,height:56,borderRadius:16,background:T.bg3,border:`1px solid ${T.bd}`,display:"flex",alignItems:"center",justifyContent:"center"}}><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={T.txD} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></div>
    <div style={{fontSize:15,fontWeight:700,color:T.txH}}>{title||t("app.loginRequired")}</div>
    <div style={{fontSize:13,color:T.txD,textAlign:"center",lineHeight:1.6}}>{t("app.loginRequiredDesc")}</div>
    <button onClick={()=>{setMockMode(false);setAppState("setup");}} style={{marginTop:8,padding:"10px 28px",borderRadius:10,border:"none",background:T.accent,color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer"}}>{t("setup.login")}</button>
  </div>;
  const L=mockMode;

  // Demo mode banner — persistent login/signup prompt
  const demoReady=isDemoMode()&&appState==="ready";
  const exitDemo=()=>{setDemoMode(false);if(refreshRef.current)clearInterval(refreshRef.current);setAllCourses([]);setQDataLive(null);setAsgn(ASGN0);viewHistRef.current=[];setView("home");setMockMode(false);setAppState("setup");};
  const DemoBanner=()=>(!demoReady||isScreenshotMode())?null:(
    <div style={{position:"fixed",bottom:mob?68:0,left:0,right:0,zIndex:9998,display:"flex",alignItems:"center",justifyContent:"center",gap:10,padding:"10px 16px",background:`linear-gradient(135deg,${T.accent}18,${T.accentSoft||T.accent}22)`,borderTop:`1px solid ${T.accent}30`,backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)"}}>
      <span style={{fontSize:13,color:T.txH,fontWeight:500}}>デモモードで表示中</span>
      <button onClick={exitDemo} style={{padding:"7px 20px",borderRadius:8,border:"none",background:T.accent,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>{t("app.loginSignup")}</button>
    </div>
  );

  // App lock screen (PIN pad + biometric)

  // --- Header for mobile ---
  const MHdr=({title,back,color,right})=><header style={{display:"flex",alignItems:"center",gap:8,padding:"env(safe-area-inset-top) 14px 0",minHeight:54,borderBottom:`1px solid ${T.bd}`,flexShrink:0,background:T.bg2}}><div style={{display:"flex",alignItems:"center",gap:8,width:"100%",height:54}}>{back&&<button onClick={back} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",padding:4}}>{I.back}</button>}<h1 style={{flex:1,margin:0,fontSize:17,fontWeight:700,color:color||T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</h1>{right}</div></header>;

  // Desktop top bar
  const DTop=({title,color})=><div style={{display:"flex",alignItems:"center",gap:10,padding:"0 16px",height:44,borderBottom:`1px solid ${T.bd}`,flexShrink:0}}><h3 style={{margin:0,color:color||T.txH,fontSize:15,fontWeight:700,flex:1}}>{title}</h3><div style={{display:"flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:6,background:T.bg3,border:`1px solid ${T.bd}`,width:180}}><span style={{color:T.txD,display:"flex"}}>{I.search}</span><input placeholder={t("app.searchPlaceholder")} style={{flex:1,border:"none",background:"transparent",color:T.txH,fontSize:12,outline:"none"}}/></div><div style={{position:"relative",cursor:"pointer",color:T.txD,display:"flex"}} onClick={()=>setView("notif")}>{I.bell}{unreadN>0&&<span style={{position:"absolute",top:-3,right:-5,minWidth:14,height:14,borderRadius:7,background:T.red,color:"#fff",fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px"}}>{unreadN}</span>}</div><div style={{cursor:"pointer",display:"flex"}} onClick={()=>openProfile(user?.moodleId||user?.id)} title={t("profile.viewTitle")}><Av u={user} sz={28} st/></div></div>;

  // Mobile member panel
  const MemberPanel=({mList,onlineList,col,onClose})=>{
    const onIds=new Set(onlineList.map(u=>String(u.id)));
    const onl=mList.filter(m=>onIds.has(String(m.id)));
    const off=mList.filter(m=>!onIds.has(String(m.id)));
    const Row=({u,isOn})=>(
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 16px"}}>
        <div style={{position:"relative"}}>
          <div style={{width:28,height:28,borderRadius:"50%",background:isOn?(u.col||"#888"):`${T.txD}40`,display:"flex",alignItems:"center",justifyContent:"center",color:isOn?"#fff":T.txD,fontSize:11,fontWeight:700}}>{(u.name||"?")[0]}</div>
          <div style={{position:"absolute",bottom:-1,right:-1,width:8,height:8,borderRadius:"50%",background:isOn?T.green:T.txD,border:`2px solid ${T.bg2}`}}/>
        </div>
        <span style={{fontSize:13,color:isOn?T.txH:T.txD}}>{u.name||`User ${u.id}`}</span>
      </div>
    );
    return <>
      <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.45)",zIndex:998}}/>
      <div style={{position:"fixed",bottom:0,left:0,right:0,maxHeight:"70vh",background:T.bg2,borderRadius:"16px 16px 0 0",zIndex:999,display:"flex",flexDirection:"column",paddingBottom:"env(safe-area-inset-bottom)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px 8px"}}>
          <span style={{fontWeight:700,fontSize:15,color:T.txH}}>メンバー ({mList.length})</span>
          <button onClick={onClose} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex"}}>{I.x}</button>
        </div>
        <div style={{flex:1,overflowY:"auto"}}>
          {onl.length>0&&<>
            <div style={{padding:"8px 16px 4px",fontSize:11,fontWeight:700,color:T.green,letterSpacing:.3}}>{t("app.online")} — {onl.length}</div>
            {onl.map(u=><Row key={u.id} u={u} isOn/>)}
          </>}
          {off.length>0&&<>
            <div style={{padding:"8px 16px 4px",fontSize:11,fontWeight:700,color:T.txD,letterSpacing:.3}}>{t("app.offline")} — {off.length}</div>
            {off.map(u=><Row key={u.id} u={u} isOn={false}/>)}
          </>}
          {mList.length===0&&<div style={{padding:"24px 16px",textAlign:"center",color:T.txD,fontSize:13}}>{t("app.noMembers")}</div>}
        </div>
      </div>
    </>;
  };

  // Course header (gradient banner + equal-width icon+label tabs)
  const cTabs=[{id:"materials",l:t("chan.materials"),i:I.clip},{id:"assignments",l:t("chan.assignments"),i:I.tasks},{id:"timeline",l:t("chan.feed"),i:I.feed},{id:"chat",l:t("chan.chat"),i:I.chat},{id:"reviews",l:t("chan.reviews"),i:I.star}];
  const openLms=async()=>{
    if(!cc?.moodleId||lmsLoading) return;
    const url=`https://lms.s.isct.ac.jp/2025/course/view.php?id=${cc.moodleId}`;
    setLmsLoading(true);
    try{
      if(isNative()){
        const r=await fetch("/api/auth/credentials?type=isct",{headers:{"x-app-platform":"capacitor"}});
        if(!r.ok)throw new Error(t("app.credFetchFailed"));
        const{userId,password,totpCode}=await r.json();
        await openLmsPage(url,{userId,password,totpCode});
      }else{
        window.open(url,"_blank","noopener");
      }
    }catch(e){console.error('[LMS]',e);}
    setLmsLoading(false);
  };
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
            <button onClick={()=>setShowMembers(true)} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",position:"relative"}}>{I.users}{members.length>0&&<span style={{position:"absolute",top:-4,right:-6,minWidth:14,height:14,borderRadius:7,background:cc.col,color:"#fff",fontSize:8,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px"}}>{members.length}</span>}</button>
            {cc.moodleId&&<button onClick={openLms} disabled={lmsLoading} title={t("chan.openLms")} style={{display:"flex",alignItems:"center",gap:4,background:`${cc.col}18`,border:`1px solid ${cc.col}40`,borderRadius:8,color:cc.col,cursor:lmsLoading?"wait":"pointer",padding:"5px 9px",fontSize:11,fontWeight:700,opacity:lmsLoading?.6:1}}>{I.book}<span>{lmsLoading?"...":"LMS"}</span></button>}
            <button style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex"}}>{I.more}</button>
          </div>
        </div>
      </div>
      <div style={{display:"flex",background:T.bg2,borderBottom:`1px solid ${T.bd}`}}>
        {cTabs.map(tab=><button key={tab.id} onClick={()=>setCh(tab.id)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"8px 4px",border:"none",borderBottom:ch===tab.id?`2px solid ${cc.col}`:"2px solid transparent",background:"transparent",color:ch===tab.id?cc.col:T.txD,fontSize:10,fontWeight:ch===tab.id?600:400,cursor:"pointer"}}><span style={{display:"flex",transform:ch===tab.id?"scale(1.15)":"scale(1)",transition:"transform .15s"}}>{tab.i}</span><span>{tab.l}</span></button>)}
      </div>
    </div>;
  };

  const userSchoolKey=user?.myDept?DEPTS[user.myDept]?.school:null;
  const isMedDentalUser=userSchoolKey==="medicine"||userSchoolKey==="dentistry";
  // 25B/26B（学士1〜2年）はT2SCHOLAに未登録のため接続失敗バナーを非表示
  const isFreshman26B=user?.yearGroup==="26B"||user?.yearGroup==="25B";
  // 医歯学時間割メニューの表示可否（admin は確認用に表示）
  const hasMed=medRawCourses.length>0||isMedDentalUser||!!user?.isAdmin;
  // 下部ナビの「時間割」を「医歯学時間割」に置き換える条件（admin単独では置き換えない）
  const medPrimary=medRawCourses.length>0||isMedDentalUser;
  const lmsDownBanner=(lmsDown&&!isMedDentalUser&&!isFreshman26B)?<div style={{padding:"8px 16px",background:"#fef3cd",color:"#856404",fontSize:13,fontWeight:500,textAlign:"center",borderBottom:"1px solid #ffc107",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
    <span style={{fontSize:16}}>!</span>
    <span>T2SCHOLAに接続できないため、前回のデータを表示しています</span>
    <button onClick={async()=>{const r=await fetchData();if(r)setLmsDown(false);}} style={{marginLeft:8,padding:"3px 10px",borderRadius:6,border:"1px solid #856404",background:"transparent",color:"#856404",fontSize:12,cursor:"pointer",fontWeight:600,whiteSpace:"nowrap"}}>{t("app.retry")}</button>
  </div>:null;
  const refreshingBanner=(refreshing&&!lmsDown)?<div style={{padding:"5px 14px",background:"rgba(127,127,127,0.10)",color:T.txD,fontSize:12,fontWeight:500,textAlign:"center",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
    <span style={{width:11,height:11,border:`2px solid ${T.txD}`,borderTopColor:"transparent",borderRadius:"50%",display:"inline-block",animation:"mnSpin .7s linear infinite"}}/>
    <span>{langPref==="ja"?"最新の情報に更新中…":"Refreshing…"}</span>
  </div>:null;
  const TR=telecomRestricted;
  const courseContent=()=>{
    if(!cc) return null;
    if(ch==="timeline") return <FeedView course={cc} mob={mob} bmarks={bmarks} togBmark={togBmark} courses={allCourses} onOfflineQueue={enqueueOffline}/>;
    if(ch==="chat") return <ChatView course={cc} mob={mob}/>;
    if(ch==="assignments") return <AsgnView asgn={asgn} setAsgn={setAsgn} course={cc} mob={mob} courses={allCourses}/>;
    if(ch==="materials") return <MatView course={cc} mob={mob} initialMatId={pendingMat?.courseId===cc.id?pendingMat.matId:null} onInitialConsumed={()=>setPendingMat(null)} onAnnotate={annotateMaterial} onOpenNote={openMaterialNote}/>;
    if(ch==="reviews") return <ReviewView reviews={reviews} setReviews={setReviews} course={cc} mob={mob} courses={allCourses}/>;
    return null;
  };
  const deptContent=()=>{
    if(!cd) return null;
    if(ch==="timeline") return <FeedView dept={cd} mob={mob} courses={allCourses} onOfflineQueue={enqueueOffline}/>;
    if(ch==="chat") return <ChatView dept={cd} mob={mob}/>;
    return null;
  };

  // 出欠管理: 医歯学系ユーザーは日付ベース(med)のみ。理工ルート(履修データ×年間予定)は出さない。
  // 非医歯ユーザーは理工(sci)が基本で、医歯データも持つ場合(admin等)のみトグルで切替可。
  const renderAttendance=(m)=>{
    // 医歯学系の学生: med 固定（理工表示・トグルなし）
    if(isMedDentalUser){
      return(
        <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,minHeight:0}}>
          <MedAttendanceView medSessions={medSessions} records={attRecords} setStatus={setAttStatus} mob={m}/>
        </div>
      );
    }
    // 非医歯ユーザー
    const medData=medRawCourses.length>0||(medSessions&&medSessions.length>0);
    const both=medData; // 理工は基本表示。医歯データも持つ場合のみトグル
    const eff=both?(attSys||"sci"):"sci";
    return(
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,minHeight:0}}>
        {both&&<div style={{display:"flex",gap:6,padding:m?"8px 12px 0":"12px 20px 0",flexShrink:0}}>
          {[["sci",t("app.campusSci")],["med",t("app.campusMed")]].map(([k,l])=>(
            <button key={k} onClick={()=>setAttSys(k)}
              style={{flex:m?1:"none",border:`1px solid ${eff===k?T.accent:T.bd}`,background:eff===k?`${T.accent}15`:"transparent",color:eff===k?T.accent:T.txD,borderRadius:8,padding:"6px 16px",fontSize:13,fontWeight:700,cursor:"pointer"}}>{l}</button>
          ))}
        </div>}
        {eff==="med"
          ?<MedAttendanceView medSessions={medSessions} records={attRecords} setStatus={setAttStatus} mob={m}/>
          :<SciAttendanceView courses={allCourses} records={attRecords} setStatus={setAttStatus} quarter={quarter} setQuarter={setQuarter} academicYear={_selY} setAcademicYear={_setSelY} mob={m}/>}
      </div>
    );
  };

  // Guest session tracking
  useEffect(()=>{
    if(!guestMode)return;
    try{
      let sid=sessionStorage.getItem("guest_sid");
      if(!sid){sid=crypto.randomUUID();sessionStorage.setItem("guest_sid",sid);}
      guestSessionRef.current=sid;
      fetch("/api/guest-track",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:sid,mode:guestMode})}).catch(()=>{});
    }catch(e){console.warn("[GuestTrack]",e);}
  },[guestMode]);

  // --- LOADING / SETUP ---
  if(splashPhase!=="done") return (
    <div style={{position:"fixed",inset:0,zIndex:99999,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:T.bg,fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,'Hiragino Sans','Segoe UI',sans-serif",overflow:"hidden",opacity:splashPhase==="fade"?0:1,transition:"opacity .5s ease-out"}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
        <div style={{width:84,height:84,borderRadius:24,background:`linear-gradient(135deg,${T.accent},${T.accentSoft})`,display:"flex",alignItems:"center",justifyContent:"center",animation:"spLogoIn .7s cubic-bezier(.16,1,.3,1) both",boxShadow:`0 10px 36px ${T.accent}30`}}>
          <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
        </div>
        <div style={{marginTop:24,fontSize:24,fontWeight:700,color:T.txH,letterSpacing:"-0.02em",animation:"spFadeUp .6s .12s cubic-bezier(.16,1,.3,1) both"}}>Science<span style={{color:T.accent}}>Tokyo</span> App</div>
        <div style={{marginTop:8,fontSize:13,color:T.txD,letterSpacing:"0.02em",animation:"spFadeUp .6s .22s cubic-bezier(.16,1,.3,1) both"}}>{t("app.tagline")}</div>
      </div>
      <div style={{position:"absolute",bottom:`calc(72px + env(safe-area-inset-bottom))`,display:"flex",flexDirection:"column",alignItems:"center",gap:10,animation:"spFadeUp .5s .32s cubic-bezier(.16,1,.3,1) both"}}>
        {reconnecting&&<div style={{fontSize:12,color:T.txD,marginBottom:2}}>再接続中...</div>}
        <div style={{display:"flex",gap:8}}>
          {[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:T.accent,animation:`spDot 1.4s ${i*.15}s ease-in-out infinite`}}/>)}
        </div>
      </div>
      <style>{`@keyframes spLogoIn{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:scale(1)}}@keyframes spFadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}@keyframes spDot{0%,80%,100%{transform:scale(.5);opacity:.3}40%{transform:scale(1.2);opacity:1}}html,body{background:${T.bg};margin:0}`}</style>
    </div>
  );
  // --- GUEST BOARD (direct link #freshman) ---
  const guestLogin=()=>{
    if(guestSessionRef.current){fetch("/api/guest-track",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:guestSessionRef.current,mode:guestMode||"freshman",action:"convert"})}).catch(()=>{});}
    setFromGuest(guestMode);setGuestMode(null);window.location.hash="";setMockMode(false);setAppState("setup");};
  const backToGuest=()=>{const mode=fromGuest||"freshman";setFromGuest(null);setGuestMode(mode);window.location.hash=mode==="navi"?"navi":mode==="reg"?"reg":"freshman";setAppState("ready");setViewRaw(mode==="navi"?"navigation":mode==="reg"?"reg":"freshman");};

  if(appState==="setup") return <SetupView onComplete={onSetupComplete} onSkip={onDemo} personas={DEMO_PERSONAS} mob={mob} dark={dark} onBackToBoard={fromGuest?backToGuest:null} backLabel={fromGuest==="navi"?t("app.backToNavi"):fromGuest==="reg"?t("app.backToReg"):undefined}/>;

  if(guestMode){
    return(
      <div style={{display:"flex",flexDirection:"column",height:"100dvh",maxHeight:"100vh",background:T.bg,color:T.tx,fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>
        {/* Guest header */}
        <div style={{flexShrink:0,display:"flex",alignItems:"center",gap:10,padding:"0 16px",height:48,borderBottom:`1px solid ${T.bd}`,background:T.bg2}}>
          <div style={{fontWeight:700,fontSize:15,color:T.txH,flex:1}}>{guestMode==="navi"?t("nav.navigation"):guestMode==="reg"?t("more.regAssist"):t("nav.freshman")}</div>
          <button onClick={guestLogin} style={{padding:"6px 16px",borderRadius:8,border:"none",background:T.accent,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>{t("app.loginSignup")}</button>
        </div>
        {guestMode==="freshman"&&<FreshmanBoardView mob={mob} loggedIn={false} onLogin={guestLogin}/>}
        {guestMode==="navi"&&<NavigationView mob={mob} initialDest={null} initialOrig={null} onDestUsed={()=>{}}/>}
        {guestMode==="reg"&&<RegView mob={mob}/>}
      </div>
    );
  }

  // --- DESKTOP ---
  if(!mob){
    const titles={home:t("nav.home"),timetable:t("nav.timetable"),tasks:t("header.taskMgmt"),calendar:t("nav.calendar"),acadCal:t("tool.acadCal"),exams:t("tool.exams"),dm:t("common.dm"),notif:t("nav.notif"),grades:t("tool.grades"),pomo:t("tool.pomo"),events:t("tool.events"),reviews:t("tool.reviews"),bmarks:t("tool.bmarks"),search:t("nav.search"),profile:t("nav.profile"),navigation:t("nav.navigation"),friends:t("nav.friends"),circles:t("nav.circles"),admin:t("nav.admin"),freshman:t("nav.freshman"),reg:t("more.regAssist"),freeroom:t("tool.freeroom"),attendance:t("nav.attendance"),music:t("tool.music"),pdftools:t("nav.pdftools"),notes:t("nav.notes")};
    const dTitle=()=>{
      if(view==="course"&&cc) return <><span style={{color:cc.col}}>#{cc.code}</span> {{timeline:t("chan.timeline"),chat:t("chan.chat"),assignments:t("chan.assignments"),materials:t("chan.materials"),reviews:t("chan.reviews")}[ch]}</>;
      if(view==="dept"&&cd){const nameOnly=cd.prefix.startsWith("school:")||cd.prefix.startsWith("unit:")||cd.prefix.startsWith("global:");return <><span style={{color:cd.col}}>{nameOnly?locName(cd):cd.prefix}</span> {nameOnly?"":`${locName(cd)} `}— {{timeline:t("chan.timeline"),chat:t("chan.chat")}[ch]||""}</>;}
      return titles[view]||"";
    };
    return(
      <div style={{display:"flex",height:"100dvh",width:"100%",background:T.bg,color:T.tx,fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,'Hiragino Sans','Segoe UI',sans-serif",overflow:"hidden"}}>

        <DSide cid={cid} did={did} view={view} setView={setView} setCid={setCid} setDid={setDid} setCh={setCh} ac={ac} unreadN={unreadN} dmUnread={dmUnread} courses={allCourses} depts={userDepts} schools={userSchools} user={user} quarter={quarter} academicYear={_selY} pendingFriendCount={pendingFriendCount} userUnit={userUnit} compact={false} narrow={bp==="tablet"} hasMed={hasMed}/>
        {bp!=="mobile"&&view==="course"&&cc&&<DChan course={cc} ch={ch} setCh={setCh} online={online} members={members} compact={bp==="tablet"}/>}
        {bp!=="mobile"&&view==="dept"&&cd&&<DChan dept={cd} ch={ch} setCh={setCh} online={online} members={deptMembers} compact={bp==="tablet"}/>}
        <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
          <DTop title={dTitle()} color={view==="course"&&cc?cc.col:view==="dept"&&cd?cd.col:undefined}/>
          {lmsDownBanner}
          {refreshingBanner}
          {view==="home"&&<HomeView asgn={asgn} setView={setView} setCid={setCid} setCh={setCh} mob={false} courses={allCourses} user={user} myEvents={myEvents} quarter={quarter} hiddenSet={hiddenSet} qd={qd} qDataAll={qDataLive||QData} goToBuilding={goToBuilding} setDid={setDid} userDepts={userDepts} userSchools={userSchools} userUnit={userUnit} medSessions={medSessions} setPendingMat={setPendingMat} records={attRecords} setStatus={setAttStatus}/>}
  {view==="timetable"&&(L?<LockedView title={t("nav.timetable")}/>:<TTView setCid={setCid} setView={setView} setCh={setCh} asgn={asgn} mob={false} quarter={quarter} setQuarter={setQuarter} qd={qd} onRefresh={fetchData} courses={allCourses} hiddenSet={hiddenSet} goToBuilding={goToBuilding} pastTTCache={pastTTCache} fetchPastTimetable={fetchPastTimetable} pastTTLoading={pastTTLoading} pastTTError={pastTTError} tty={_selY} setTty={_setSelY}/>)}
          {view==="med-tt"&&(L?<LockedView title={t("nav.medTimetable")}/>:<MedTTView courses={medRawCourses} mob={false} setCid={setCid} setView={setView} setCh={setCh} demoKey={demoMedKey} asgn={asgn} hiddenSet={hiddenSet} onRefresh={fetchData}/>)}
          {view==="tasks"&&(L?<LockedView title={t("header.taskMgmt")}/>:<AsgnView asgn={asgn} setAsgn={setAsgn} mob={false} myTasks={myTasks} addTask={addTaskFn} toggleTask={toggleTaskFn} deleteTask={deleteTaskFn} navCourse={navCrs} courses={allCourses} quarter={quarter} setQuarter={setQuarter} hiddenAsgn={hiddenSet} saveHidden={saveHidden} academicYear={_selY}/>)}
          {view==="course"&&(L?<LockedView title={t("header.course")}/>:cc&&courseContent())}
          {view==="dept"&&(L?<LockedView title={t("sidebar.depts")}/>:cd&&deptContent())}
          {view==="friends"&&(L?<LockedView title={t("nav.friends")}/>:<FriendsView mob={false} setView={setView} {...friendProps}/>)}
          {view==="user"&&(L?<LockedView title={t("profile.viewTitle")}/>:<UserProfileView mob={false} {...profileProps}/>)}
          {view==="dm"&&(L?<LockedView title="DM"/>:TR?<TelecomBlockView title={t("telecom.dmUnavailable")}/>:<DMView mob={false} setView={setView} friends={friendList} groups={groupList} leaveGroup={leaveGroup} markDMSeen={markDMSeen} createGroup={createGroup} dmTarget={dmTarget} onConsumeDmTarget={()=>setDmTarget(null)}/>)}
          {view==="pocket"&&(L?<LockedView title={t("nav.pocket")}/>:<PocketView mob={false}/>)}
          {view==="music"&&(L?<LockedView title={t("tool.music")}/>:<MusicView mob={false}/>)}
          {view==="pdftools"&&(L?<LockedView title={t("nav.pdftools")}/>:<PdfToolsView mob={false}/>)}
          {view==="notes"&&(L?<LockedView title={t("nav.notes")}/>:<NotesView mob={false} courses={allCourses} pendingNote={pendingNote} onPendingConsumed={()=>setPendingNote(null)}/>)}
          {view==="notif"&&(L?<LockedView title={t("nav.notif")}/>:<NotifView mob={false} pending={friendPending} acceptRequest={acceptRequest} rejectRequest={rejectRequest} onRefetchFriends={refetchFriends}/>)}
          {view==="grades"&&(L?<LockedView title={t("tool.grades")}/>:<GradeView mob={false}/>)}
          {view==="pomo"&&<PomodoroView pomo={pomo} setPomo={setPomo} mob={false}/>}
          {view==="calendar"&&(L?<LockedView title={t("nav.calendar")}/>:<CalendarView myEvents={myEvents} addEvent={addEventFn} addEvents={addEventsFn} updateEvent={updateEventFn} deleteEvent={deleteEventFn} asgn={asgn} courses={allCourses} qd={qd} qDataAll={qDataLive||QData} mob={false} pastTTCache={pastTTCache} fetchPastTimetable={fetchPastTimetable} medSessions={medSessions}/>)}
          {view==="events"&&<EventView events={allEvents} mob={false} rsvps={rsvps} onRsvp={handleRsvp}/>}
          {view==="reviews"&&(L?<LockedView title={t("tool.reviews")}/>:<ReviewView reviews={reviews} setReviews={setReviews} mob={false} courses={allCourses}/>)}
          {view==="bmarks"&&(L?<LockedView title={t("tool.bmarks")}/>:<BookmarkView bmarks={bmarks} mob={false} setView={setView} setCid={setCid} setCh={setCh} courses={allCourses}/>)}
          {view==="attendance"&&(L?<LockedView title={t("nav.attendance")}/>:renderAttendance(false))}
          {view==="search"&&(L?<LockedView title={t("nav.search")}/>:<SearchView searchQ={searchQ} setSearchQ={setSearchQ} setView={setView} setCid={setCid} setCh={setCh} mob={false} courses={allCourses}/>)}
          {view==="profile"&&<ProfileView mob={false} togTheme={togTheme} dark={dark} themePref={themePref} setThemePref={setThemePref} accentPref={accentPref} setAccentPref={setAccentPref} langPref={langPref} setLangPref={setLangPref} sitelenPref={sitelenPref} setSitelenPref={setSitelenPref} asgn={asgn} courses={allCourses} user={user} notifEnabled={notifEnabled} setNotifEnabled={setNotifEnabled} notifSettings={notifSettings} setNotifSettings={setNotifSettings} onLogout={onLogout} appLock={appLock} blocks={blockList} unblockUser={unblockUser} mutes={muteList} unmuteUser={unmuteUser} setView={setView}/>}
          {view==="support"&&<SupportChat embedded userId={user?.moodleId||user?.id} langPref={langPref} currentView="support" onClose={goBack}/>}
          {view==="navigation"&&<NavigationView mob={false} initialDest={navDest} initialOrig={navOrig} onDestUsed={()=>{setNavDest(null);setNavOrig(null);}}/>}
          {view==="takiplaza"&&(L?<LockedView title="Taki Plaza"/>:<FacilityReservationView mob={false} onNavigate={goToBuilding}/>)}
          {view==="gym"&&(L?<LockedView title={t("tool.gym")}/>:<GymView mob={false}/>)}
          {view==="tsubame"&&(L?<LockedView title={t("tool.tsubame")}/>:<TsubameView mob={false}/>)}
          {view==="train"&&(L?<LockedView title={t("nav.train")}/>:<TrainView mob={false}/>)}
          {view==="library"&&<LibraryView mob={false}/>}
          {view==="circles"&&(TR?<TelecomBlockView title={t("telecom.circlesUnavailable")}/>:<CircleView mob={false} circles={circleList} messages={circleMsgs} discover={circleDiscover} sendMessage={circleSend} createCircle={createCircle} joinCircle={joinCircle} leaveCircle={leaveCircle} addChannel={circleAddCh} deleteChannel={circleDelCh} pinMessage={circlePin} updateCircle={circleUpdate} fetchMessages={circleFetchMsgs}/>)}
          {view==="acadCal"&&<AcademicCalendarView mob={false}/>}
          {view==="exams"&&(L?<LockedView title={t("tool.exams")}/>:<ExamView courses={allCourses} mob={false} goToBuilding={goToBuilding} setCid={setCid} setView={setView} setCh={setCh}/>)}
          {view==="freeroom"&&(L?<LockedView title={t("tool.freeroom")}/>:<FreeRoomView mob={false} goToBuilding={goToBuilding}/>)}
          {view==="reg"&&<RegView mob={false}/>}
          {view==="textbooks"&&(L?<LockedView title={t("nav.textbooks")}/>:<TextbooksView courses={allCourses} academicYear={_selY} setAcademicYear={_setSelY}/>)}
          {view==="grading"&&(L?<LockedView title={t("nav.grading")}/>:<GradingView courses={allCourses} academicYear={_selY} setAcademicYear={_setSelY}/>)}
          {view==="admin"&&<AdminView mob={false} courses={allCourses} depts={userDepts} schools={userSchools}/>}
          {view==="freshman"&&<FreshmanBoardView mob={false} loggedIn={!!user.moodleId} onLogin={()=>{setGuestMode(null);setMockMode(false);setAppState("setup");}}/>}
        </div>
        {showDeptModal&&<DeptModal user={user} onClose={()=>setDeptModalDone(true)}/>}
        {appLock.locked&&<LockScreen appLock={appLock} onLogout={onLogout}/>}
        <DemoBanner/>
        <Toasts/>
        <MiniPlayer mob={false} view={view} ch={ch} onOpen={()=>setView("music")}/>
        {themeMode==="mizukumori"&&<FogOverlay/>}
        <style>{`*{box-sizing:border-box;margin:0;padding:0;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}input,textarea{-webkit-user-select:text;user-select:text}::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${T.bd};border-radius:3px}::placeholder{color:${T.txD}}button,input,textarea,select{font-family:inherit}@keyframes mnSpin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // --- MOBILE ---
  const mBack=goBack;
  return(
    <div ref={el=>{if(!el)return;const pwa=window.matchMedia("(display-mode:standalone)").matches||window.navigator.standalone;const u=()=>{el.style.height=pwa?screen.height+"px":"100dvh";};u();window.addEventListener("resize",u);}} style={{display:"flex",flexDirection:"column",width:"100vw",overflow:"hidden",background:T.bg,color:T.tx,fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,'Hiragino Sans','Segoe UI',sans-serif"}}>
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minHeight:0,position:"relative"}}>
        {lmsDownBanner}
        {refreshingBanner}
        {view==="home"&&<><MHdr title="ScienceTokyo App" right={<div style={{display:"flex",alignItems:"center",gap:8}}><button onClick={()=>setView("notif")} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",position:"relative"}}>{I.bell}{unreadN>0&&<span style={{position:"absolute",top:-3,right:-5,minWidth:14,height:14,borderRadius:7,background:T.red,color:"#fff",fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px"}}>{unreadN}</span>}</button><button onClick={()=>setView("search")} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex"}}>{I.search}</button><button onClick={()=>openProfile(user?.moodleId||user?.id)} style={{background:"none",border:"none",cursor:"pointer",display:"flex",padding:0}}><Av u={user} sz={26}/></button></div>}/><HomeView asgn={asgn} setView={setView} setCid={setCid} setCh={setCh} setPendingMat={setPendingMat} mob courses={allCourses} user={user} myEvents={myEvents} quarter={quarter} hiddenSet={hiddenSet} qd={qd} qDataAll={qDataLive||QData} goToBuilding={goToBuilding} setDid={setDid} userDepts={userDepts} userSchools={userSchools} userUnit={userUnit} medSessions={medSessions} records={attRecords} setStatus={setAttStatus}/></>}
        {view==="timetable"&&(L?<><MHdr title={t("nav.timetable")}/><LockedView title={t("nav.timetable")}/></>:<TTView setCid={setCid} setView={setView} setCh={setCh} asgn={asgn} mob quarter={quarter} setQuarter={setQuarter} qd={qd} onRefresh={fetchData} courses={allCourses} hiddenSet={hiddenSet} goToBuilding={goToBuilding} pastTTCache={pastTTCache} fetchPastTimetable={fetchPastTimetable} pastTTLoading={pastTTLoading} pastTTError={pastTTError} tty={_selY} setTty={_setSelY}/>)}
        {view==="med-tt"&&(L?<><MHdr title={t("nav.medTimetable")}/><LockedView title={t("nav.medTimetable")}/></>:<><MHdr title={t("nav.medTimetable")}/><MedTTView courses={medRawCourses} mob setCid={setCid} setView={setView} setCh={setCh} demoKey={demoMedKey} asgn={asgn} hiddenSet={hiddenSet} onRefresh={fetchData}/></>)}
        {view==="tasks"&&(L?<><MHdr title={t("header.taskMgmt")}/><LockedView title={t("header.taskMgmt")}/></>:<><MHdr title={t("header.taskMgmt")}/><AsgnView asgn={asgn} setAsgn={setAsgn} mob myTasks={myTasks} addTask={addTaskFn} toggleTask={toggleTaskFn} deleteTask={deleteTaskFn} navCourse={navCrs} courses={allCourses} quarter={quarter} setQuarter={setQuarter} hiddenAsgn={hiddenSet} saveHidden={saveHidden} academicYear={_selY}/></>)}
        {view==="courseSelect"&&(L?<><MHdr title={t("header.courseSelect")}/><LockedView title={t("header.course")}/></>:<><MHdr title={t("header.courseSelect")}/><CSelect setCid={setCid} setView={setView} setCh={setCh} courses={allCourses} depts={userDepts} schools={userSchools} setDid={setDid} userUnit={userUnit} medSessions={medSessions}/></>)}
        {view==="course"&&(L?<><MHdr title={t("header.course")} back={goBack}/><LockedView title={t("header.course")}/></>:cc&&<><CourseHdr/>{courseContent()}</>)}
        {view==="dept"&&(L?<><MHdr title={t("sidebar.depts")} back={goBack}/><LockedView title={t("sidebar.depts")}/></>:cd&&<><MHdr title={<>{(()=>{const nameOnly=cd.prefix.startsWith("school:")||cd.prefix.startsWith("unit:")||cd.prefix.startsWith("global:");return <><span style={{color:cd.col}}>{nameOnly?locName(cd):cd.prefix}</span>{!nameOnly&&<span style={{fontWeight:400,color:T.txD,fontSize:13,marginLeft:4}}>{locName(cd)}</span>}</>;})()}</>} back={goBack} right={<button onClick={()=>setShowMembers(true)} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",position:"relative"}}>{I.users}{deptMembers.length>0&&<span style={{position:"absolute",top:-4,right:-6,minWidth:14,height:14,borderRadius:7,background:cd.col||T.accent,color:"#fff",fontSize:8,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px"}}>{deptMembers.length}</span>}</button>}/><div style={{display:"flex",borderBottom:`1px solid ${T.bd}`,background:T.bg2,flexShrink:0}}>{[{id:"timeline",l:t("chan.timeline"),i:I.feed},{id:"chat",l:t("chan.chat"),i:I.chat}].map(tab=><button key={tab.id} onClick={()=>setCh(tab.id)} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:3,padding:"10px 14px",border:"none",borderBottom:ch===tab.id?`2px solid ${T.accent}`:"2px solid transparent",background:"transparent",color:ch===tab.id?T.txH:T.txD,fontSize:13,fontWeight:ch===tab.id?600:400,cursor:"pointer"}}>{tab.i}<span>{tab.l}</span></button>)}</div>{deptContent()}</>)}
        {view==="moreMenu"&&<><MHdr title={t("nav.more")}/><MoreMenu setView={setView} unreadN={unreadN} pendingFriendCount={pendingFriendCount} dmUnread={dmUnread} isAdmin={!!user.isAdmin}/></>}
        {view==="friends"&&(L?<><MHdr title={t("nav.friends")} back={mBack}/><LockedView title={t("nav.friends")}/></>:<><MHdr title={t("nav.friends")} back={mBack}/><FriendsView mob setView={setView} {...friendProps}/></>)}
        {view==="user"&&(L?<><MHdr title={t("profile.viewTitle")} back={mBack}/><LockedView title={t("profile.viewTitle")}/></>:<UserProfileView mob {...profileProps}/>)}
        {view==="dm"&&(L?<><MHdr title="DM"/><LockedView title="DM"/></>:TR?<><MHdr title="DM"/><TelecomBlockView title={t("telecom.dmUnavailable")} onBack={goBack}/></>:<><MHdr title="DM"/><DMView mob setView={setView} friends={friendList} groups={groupList} leaveGroup={leaveGroup} markDMSeen={markDMSeen} createGroup={createGroup} dmTarget={dmTarget} onConsumeDmTarget={()=>setDmTarget(null)}/></>)}
        {view==="pocket"&&(L?<><MHdr title={t("nav.pocket")} back={mBack}/><LockedView title={t("nav.pocket")}/></>:<><MHdr title={t("nav.pocket")} back={mBack}/><PocketView mob/></>)}
        {view==="music"&&(L?<><MHdr title={t("tool.music")} back={mBack}/><LockedView title={t("tool.music")}/></>:<><MHdr title={t("tool.music")} back={mBack}/><MusicView mob/></>)}
        {view==="pdftools"&&(L?<><MHdr title={t("nav.pdftools")} back={mBack}/><LockedView title={t("nav.pdftools")}/></>:<><MHdr title={t("nav.pdftools")} back={mBack}/><PdfToolsView mob/></>)}
        {view==="notes"&&(L?<><MHdr title={t("nav.notes")} back={mBack}/><LockedView title={t("nav.notes")}/></>:<NotesView mob onExit={mBack} courses={allCourses} pendingNote={pendingNote} onPendingConsumed={()=>setPendingNote(null)}/>)}
        {view==="notif"&&(L?<><MHdr title={t("nav.notif")} back={mBack}/><LockedView title={t("nav.notif")}/></>:<><MHdr title={t("nav.notif")} back={mBack}/><NotifView mob pending={friendPending} acceptRequest={acceptRequest} rejectRequest={rejectRequest} onRefetchFriends={refetchFriends}/></>)}
        {view==="grades"&&(L?<><MHdr title={t("tool.grades")} back={mBack}/><LockedView title={t("tool.grades")}/></>:<><MHdr title={t("tool.grades")} back={mBack}/><GradeView mob/></>)}
        {view==="pomo"&&<><MHdr title={t("tool.pomo")} back={mBack}/><PomodoroView pomo={pomo} setPomo={setPomo} mob/></>}
        {view==="calendar"&&(L?<><MHdr title={t("nav.calendar")} back={mBack}/><LockedView title={t("nav.calendar")}/></>:<><MHdr title={t("nav.calendar")} back={mBack}/><CalendarView myEvents={myEvents} addEvent={addEventFn} addEvents={addEventsFn} updateEvent={updateEventFn} deleteEvent={deleteEventFn} asgn={asgn} courses={allCourses} qd={qd} qDataAll={qDataLive||QData} mob pastTTCache={pastTTCache} fetchPastTimetable={fetchPastTimetable} medSessions={medSessions}/></>)}
        {view==="events"&&<><MHdr title={t("tool.events")} back={mBack}/><EventView events={allEvents} mob rsvps={rsvps} onRsvp={handleRsvp}/></>}
        {view==="reviews"&&(L?<><MHdr title={t("tool.reviews")} back={mBack}/><LockedView title={t("tool.reviews")}/></>:<><MHdr title={t("tool.reviews")} back={mBack}/><ReviewView reviews={reviews} setReviews={setReviews} mob courses={allCourses}/></>)}
        {view==="bmarks"&&(L?<><MHdr title={t("tool.bmarks")} back={mBack}/><LockedView title={t("tool.bmarks")}/></>:<><MHdr title={t("tool.bmarks")} back={mBack}/><BookmarkView bmarks={bmarks} mob setView={setView} setCid={setCid} setCh={setCh} courses={allCourses}/></>)}
        {view==="attendance"&&(L?<><MHdr title={t("nav.attendance")} back={mBack}/><LockedView title={t("nav.attendance")}/></>:<><MHdr title={t("nav.attendance")} back={mBack}/>{renderAttendance(true)}</>)}
        {view==="search"&&(L?<><MHdr title={t("nav.search")} back={mBack}/><LockedView title={t("nav.search")}/></>:<><MHdr title={t("nav.search")} back={mBack}/><SearchView searchQ={searchQ} setSearchQ={setSearchQ} setView={setView} setCid={setCid} setCh={setCh} mob courses={allCourses}/></>)}
        {view==="profile"&&<><MHdr title={t("nav.profile")} back={mBack}/><ProfileView mob togTheme={togTheme} dark={dark} themePref={themePref} setThemePref={setThemePref} accentPref={accentPref} setAccentPref={setAccentPref} langPref={langPref} setLangPref={setLangPref} sitelenPref={sitelenPref} setSitelenPref={setSitelenPref} asgn={asgn} courses={allCourses} user={user} notifEnabled={notifEnabled} setNotifEnabled={setNotifEnabled} notifSettings={notifSettings} setNotifSettings={setNotifSettings} onLogout={onLogout} appLock={appLock} blocks={blockList} unblockUser={unblockUser} mutes={muteList} unmuteUser={unmuteUser} setView={setView}/></>}
        {view==="support"&&<SupportChat embedded mob userId={user?.moodleId||user?.id} langPref={langPref} currentView="support" onClose={mBack}/>}
        {view==="navigation"&&<><MHdr title={t("nav.navigation")} back={mBack}/><NavigationView mob initialDest={navDest} initialOrig={navOrig} onDestUsed={()=>{setNavDest(null);setNavOrig(null);}}/></>}
        {view==="takiplaza"&&<><MHdr title="Taki Plaza" back={mBack}/>{L?<LockedView title="Taki Plaza"/>:<FacilityReservationView mob onNavigate={goToBuilding}/>}</>}
        {view==="gym"&&<><MHdr title={t("tool.gym")} back={mBack}/>{L?<LockedView title={t("tool.gym")}/>:<GymView mob/>}</>}
        {view==="tsubame"&&<><MHdr title={t("tool.tsubame")} back={mBack}/>{L?<LockedView title={t("tool.tsubame")}/>:<TsubameView mob/>}</>}
        {view==="train"&&<><MHdr title={t("nav.train")} back={mBack}/>{L?<LockedView title={t("nav.train")}/>:<TrainView mob/>}</>}
        {view==="library"&&<><MHdr title={t("nav.library")} back={mBack}/><LibraryView mob/></>}
        {view==="circles"&&(TR?<><MHdr title={t("nav.circles")} back={mBack}/><TelecomBlockView title={t("telecom.circlesUnavailable")} onBack={goBack}/></>:<CircleView mob circles={circleList} messages={circleMsgs} discover={circleDiscover} sendMessage={circleSend} createCircle={createCircle} joinCircle={joinCircle} leaveCircle={leaveCircle} addChannel={circleAddCh} deleteChannel={circleDelCh} pinMessage={circlePin} updateCircle={circleUpdate} fetchMessages={circleFetchMsgs} onBack={mBack}/>)}
        {view==="acadCal"&&<AcademicCalendarView mob/>}
        {view==="exams"&&(L?<><MHdr title={t("tool.exams")} back={mBack}/><LockedView title={t("tool.exams")}/></>:<><MHdr title={t("tool.exams")} back={mBack}/><ExamView courses={allCourses} mob goToBuilding={goToBuilding} setCid={setCid} setView={setView} setCh={setCh}/></>)}
        {view==="freeroom"&&(L?<><MHdr title={t("tool.freeroom")} back={mBack}/><LockedView title={t("tool.freeroom")}/></>:<><MHdr title={t("tool.freeroom")} back={mBack}/><FreeRoomView mob goToBuilding={goToBuilding}/></>)}
        {view==="reg"&&<><MHdr title={t("more.regAssist")} back={mBack}/><RegView mob/></>}
        {view==="textbooks"&&(L?<><MHdr title={t("nav.textbooks")} back={mBack}/><LockedView title={t("nav.textbooks")}/></>:<><MHdr title={t("nav.textbooks")} back={mBack}/><TextbooksView courses={allCourses} academicYear={_selY} setAcademicYear={_setSelY}/></>)}
        {view==="grading"&&(L?<><MHdr title={t("nav.grading")} back={mBack}/><LockedView title={t("nav.grading")}/></>:<><MHdr title={t("nav.grading")} back={mBack}/><GradingView courses={allCourses} academicYear={_selY} setAcademicYear={_setSelY}/></>)}
        {view==="admin"&&<><MHdr title={t("nav.admin")} back={mBack}/><AdminView mob courses={allCourses} depts={userDepts} schools={userSchools}/></>}
        {view==="freshman"&&<><MHdr title={t("nav.freshman")} back={mBack}/><FreshmanBoardView mob loggedIn={!!user.moodleId} onLogin={()=>{setGuestMode(null);setMockMode(false);setAppState("setup");}}/></>}
      </div>
      <MiniPlayer mob view={view} ch={ch} onOpen={()=>setView("music")}/>
      <MNav view={view} setView={setView} ac={ac} unreadN={unreadN} dmUnread={dmUnread} hasMed={medPrimary}/>
      <div className="sa-bottom" style={{background:T.bg2,flexShrink:0}}/>
      {showMembers&&(view==="course"&&cc?<MemberPanel mList={members} onlineList={online} col={cc.col} onClose={()=>setShowMembers(false)}/>:view==="dept"&&cd?<MemberPanel mList={deptMembers} onlineList={online} col={cd.col||T.accent} onClose={()=>setShowMembers(false)}/>:null)}
      {showDeptModal&&<DeptModal user={user} onClose={()=>setDeptModalDone(true)}/>}
      {appLock.locked&&<LockScreen appLock={appLock} onLogout={onLogout}/>}
      <DemoBanner/>
      <Toasts/>
      {themeMode==="mizukumori"&&<FogOverlay/>}
      <style>{`*{box-sizing:border-box;margin:0;padding:0;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}input,textarea{-webkit-user-select:text;user-select:text}html,body{background:${T.bg2};overscroll-behavior:none;-webkit-tap-highlight-color:transparent}::-webkit-scrollbar{width:0;display:none}::placeholder{color:${T.txD}}button,input,textarea,select{font-family:inherit;-webkit-appearance:none}input,textarea{font-size:16px}.sa-bottom{height:env(safe-area-inset-bottom,0px)}@keyframes mnSpin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
