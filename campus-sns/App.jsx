import React, { useState, useEffect, useRef, useMemo } from "react";
import { T, updateT } from "./theme.js";
import { I } from "./icons.jsx";
import { QData, ASGN0, MYTK0, EVENTS0, GRADES0, ATT0, REVIEWS0, MYEVENTS0, DEPTS } from "./data.js";
import { useNotifications } from "./hooks/useNotifications.js";
import { useCurrentUser, setCurrentUserFromAPI } from "./hooks/useCurrentUser.js";
import { usePresence } from "./hooks/usePresence.js";
import { useCourseMembers } from "./hooks/useCourseMembers.js";
import { useMobile } from "./utils.jsx";
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
import { LocationView } from "./views/LocationView.jsx";
import { NavigationView } from "./views/NavigationView.jsx";
import { FriendsView } from "./views/FriendsView.jsx";
import { useFriends } from "./hooks/useFriends.js";
import { useGroups } from "./hooks/useGroups.js";

const API="";

// ============================================================
export default function App(){
  const mob=useMobile();
  const user=useCurrentUser();
  const [dark,setDark]=useState(true);
  updateT(dark);
  const [appState,setAppState]=useState("loading");
  const [quarter,setQuarter]=useState(()=>{try{const v=localStorage.getItem("quarter");return v?Number(v):2;}catch{return 2;}});
  const [qDataLive,setQDataLive]=useState(null);
  const qd=(qDataLive&&qDataLive[quarter])||QData[quarter]||{C:[],TT:[]};
  const [allCourses,setAllCourses]=useState([]);
  const [view,setView]=useState("home");
  const [cid,setCid]=useState(null);
  const [did,setDid]=useState(null);
  const [ch,setCh]=useState("timeline");
  const [asgn,setAsgn]=useState(ASGN0);
  const [hiddenAsgn,setHiddenAsgn]=useState(()=>{try{return JSON.parse(localStorage.getItem("hiddenAsgn"))||[];}catch{return[];}});
  const saveHidden=ids=>{setHiddenAsgn(ids);try{localStorage.setItem("hiddenAsgn",JSON.stringify(ids));}catch{}};
  const [myTasks,setMyTasks]=useState(MYTK0);
  const [bmarks,setBmarks]=useState([]);
  const [events]=useState(EVENTS0);
  const [grades]=useState(GRADES0);
  const [att]=useState(ATT0);
  const [reviews,setReviews]=useState(REVIEWS0);
  const [myEvents,setMyEvents]=useState(MYEVENTS0);
  const [pomo,setPomo]=useState({running:false,sec:25*60,mode:"work",sessions:0});
  const [searchQ,setSearchQ]=useState("");
  const [notifEnabled,setNotifEnabled]=useState(()=>{try{const v=localStorage.getItem("notifEnabled");return v!==null?JSON.parse(v):true;}catch{return true;}});
  const [notifSettings,setNotifSettings]=useState(()=>{try{const v=localStorage.getItem("notifSettings");return v?JSON.parse(v):{course:true,deadline:true,dm:true,event:true};}catch{return{course:true,deadline:true,dm:true,event:true};}});
  const refreshRef=useRef(null);

  const fetchData=async()=>{
    try{
      const r=await fetch(`${API}/api/data/all`);
      if(!r.ok) return;
      const d=await r.json();
      if(d.qData) setQDataLive(d.qData);
      if(d.courses){setAllCourses(d.courses);if(d.courses[0]&&!cid)setCid(d.courses[0].id);}
      if(d.assignments) setAsgn(d.assignments.map(a=>({...a,due:new Date(a.due)})));
      if(d.user) setCurrentUserFromAPI(d.user);
    }catch{}
  };

  useEffect(()=>{
    (async()=>{
      try{
        const r=await fetch(`${API}/api/auth/status`);
        const d=await r.json();
        if(d.hasCredentials){
          await fetchData();
          setAppState("ready");
          refreshRef.current=setInterval(fetchData,15*60*1000);
        }else{
          setAppState("setup");
        }
      }catch{
        setAppState("ready");
      }
    })();
    return()=>{if(refreshRef.current)clearInterval(refreshRef.current)};
  },[]);

  useEffect(()=>{try{localStorage.setItem("quarter",String(quarter));}catch{}},[quarter]);
  useEffect(()=>{try{localStorage.setItem("notifEnabled",JSON.stringify(notifEnabled));}catch{}},[notifEnabled]);
  useEffect(()=>{try{localStorage.setItem("notifSettings",JSON.stringify(notifSettings));}catch{}},[notifSettings]);
  const onSetupComplete=async()=>{await fetchData();setAppState("ready");refreshRef.current=setInterval(fetchData,15*60*1000);};

  const cc=allCourses.find(c=>c.id===cid);
  const userDepts=useMemo(()=>{
    const ps=[...new Set(allCourses.map(c=>c.code.split('.')[0]))];
    return ps.filter(p=>DEPTS[p]).map(p=>({id:`dept:${p}`,prefix:p,...DEPTS[p]}));
  },[allCourses]);
  const cd=userDepts.find(d=>d.prefix===did);
  const qCourseIds=useMemo(()=>new Set(allCourses.filter(c=>c.quarter===quarter).map(c=>c.id)),[allCourses,quarter]);
  const hiddenSet=useMemo(()=>new Set(hiddenAsgn),[hiddenAsgn]);
  const ac=asgn.filter(a=>a.st!=="completed"&&qCourseIds.has(a.cid)&&!hiddenSet.has(a.id)).length;
  const {unreadCount:unreadN}=useNotifications();
  const {friends:friendList,pending:friendPending,sent:friendSent,loading:friendLoading,pendingCount:pendingFriendCount,friendIds,isFriend,sendRequest,acceptRequest,rejectRequest,unfriend,searchUsers,lookupById}=useFriends();
  const presenceRoom=view==="course"&&cc?`course:${cc.id}`:view==="dept"&&cd?`dept:${cd.prefix}`:null;
  const {online}=usePresence(presenceRoom,{id:user.moodleId||user.id,name:user.name,col:user.col});
  const members=useCourseMembers(cc?.moodleId);
  const [navDest,setNavDest]=useState(null);
  const [navOrig,setNavOrig]=useState(null);
  const navCrs=id=>{setCid(id);setView("course");setCh("assignments");};
  const goToBuilding=(destId,origId)=>{if(destId){setNavDest(destId);setNavOrig(origId||null);setView("navigation");}};
  const togBmark=pid=>setBmarks(p=>p.includes(pid)?p.filter(x=>x!==pid):[...p,pid]);
  const {groups:groupList,createGroup,leaveGroup}=useGroups();
  const startDMFromFriend=(fid,name,avatar,color)=>{setView("dm");};
  const openGroupChat=(g)=>{setView("dm");};
  const friendProps={friends:friendList,pending:friendPending,sent:friendSent,loading:friendLoading,pendingCount:pendingFriendCount,sendRequest,acceptRequest,rejectRequest,unfriend,searchUsers,onStartDM:startDMFromFriend,userId:user?.moodleId||user?.id,lookupById,groups:groupList,createGroup,leaveGroup,onOpenGroup:openGroupChat};
  const togTheme=()=>setDark(p=>!p);

  // --- Header for mobile ---
  const MHdr=({title,back,color,right})=><header style={{display:"flex",alignItems:"center",gap:8,padding:"0 12px",height:46,borderBottom:`1px solid ${T.bd}`,flexShrink:0,background:T.bg2}}>{back&&<button onClick={back} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",padding:4}}>{I.back}</button>}<h1 style={{flex:1,margin:0,fontSize:16,fontWeight:700,color:color||T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</h1>{right}</header>;

  // Desktop top bar
  const DTop=({title,color})=><div style={{display:"flex",alignItems:"center",gap:10,padding:"0 16px",height:44,borderBottom:`1px solid ${T.bd}`,flexShrink:0}}><h3 style={{margin:0,color:color||T.txH,fontSize:15,fontWeight:700,flex:1}}>{title}</h3><div style={{display:"flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:6,background:T.bg3,border:`1px solid ${T.bd}`,width:180}}><span style={{color:T.txD,display:"flex"}}>{I.search}</span><input placeholder="検索..." style={{flex:1,border:"none",background:"transparent",color:T.txH,fontSize:12,outline:"none"}}/></div><div style={{position:"relative",cursor:"pointer",color:T.txD,display:"flex"}} onClick={()=>setView("notif")}>{I.bell}{unreadN>0&&<span style={{position:"absolute",top:-3,right:-5,minWidth:14,height:14,borderRadius:7,background:T.red,color:"#fff",fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px"}}>{unreadN}</span>}</div><Av u={user} sz={28} st/></div>;

  // Course channel tabs (mobile)
  const MTabs=({ch,setCh})=><div style={{display:"flex",borderBottom:`1px solid ${T.bd}`,background:T.bg2,overflowX:"auto",flexShrink:0}}>{[{id:"timeline",l:"フィード",i:I.feed},{id:"chat",l:"チャット",i:I.chat},{id:"assignments",l:"課題",i:I.tasks},{id:"materials",l:"教材",i:I.clip},{id:"reviews",l:"レビュー",i:I.star}].map(t=><button key={t.id} onClick={()=>setCh(t.id)} style={{flex:"0 0 auto",display:"flex",alignItems:"center",gap:3,padding:"10px 14px",border:"none",borderBottom:ch===t.id?`2px solid ${T.accent}`:"2px solid transparent",background:"transparent",color:ch===t.id?T.txH:T.txD,fontSize:13,fontWeight:ch===t.id?600:400,cursor:"pointer",whiteSpace:"nowrap"}}>{t.i}<span>{t.l}</span></button>)}</div>;

  const courseContent=()=>{
    if(!cc) return null;
    if(ch==="timeline") return <FeedView course={cc} mob={mob} bmarks={bmarks} togBmark={togBmark} courses={allCourses}/>;
    if(ch==="chat") return <ChatView course={cc} mob={mob}/>;
    if(ch==="assignments") return <AsgnView asgn={asgn} setAsgn={setAsgn} course={cc} mob={mob} courses={allCourses}/>;
    if(ch==="materials") return <MatView course={cc} mob={mob}/>;
    if(ch==="reviews") return <ReviewView reviews={reviews} setReviews={setReviews} course={cc} mob={mob} courses={allCourses}/>;
    return null;
  };
  const deptContent=()=>{
    if(!cd) return null;
    if(ch==="timeline") return <FeedView dept={cd} mob={mob} courses={allCourses}/>;
    if(ch==="chat") return <ChatView dept={cd} mob={mob}/>;
    return null;
  };

  // --- LOADING / SETUP ---
  if(appState==="loading") return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100dvh",width:"100vw",background:T.bg,color:T.txD,fontFamily:"'Inter',sans-serif"}}><Loader msg="読み込み中" size="lg"/></div>;
  if(appState==="setup") return <div style={{display:"flex",height:"100dvh",width:"100vw",background:T.bg,color:T.tx,fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,'Hiragino Sans','Segoe UI',sans-serif"}}><SetupView onComplete={onSetupComplete} onSkip={()=>setAppState("ready")} mob={mob}/></div>;

  // --- DESKTOP ---
  if(!mob){
    const titles={home:"ホーム",timetable:"時間割",tasks:"課題管理",calendar:"カレンダー",dm:"ダイレクトメッセージ",notif:"通知",grades:"成績・出席",pomo:"ポモドーロ",events:"イベント",reviews:"授業レビュー",bmarks:"ブックマーク",search:"検索",profile:"プロフィール",location:"友達の居場所",navigation:"キャンパスナビ",friends:"友達"};
    const dTitle=()=>{
      if(view==="course"&&cc) return <><span style={{color:cc.col}}>#{cc.code}</span> {{timeline:"タイムライン",chat:"チャット",assignments:"課題",materials:"教材",reviews:"レビュー"}[ch]}</>;
      if(view==="dept"&&cd) return <><span style={{color:cd.col}}>{cd.prefix}</span> {cd.name} — {{timeline:"タイムライン",chat:"チャット"}[ch]||""}</>;
      return titles[view]||"";
    };
    return(
      <div style={{display:"flex",height:"100dvh",width:"100vw",background:T.bg,color:T.tx,fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,'Hiragino Sans','Segoe UI',sans-serif",overflow:"hidden"}}>
        <DSide cid={cid} did={did} view={view} setView={setView} setCid={setCid} setDid={setDid} setCh={setCh} ac={ac} unreadN={unreadN} courses={allCourses} depts={userDepts} user={user} quarter={quarter} pendingFriendCount={pendingFriendCount}/>
        {view==="course"&&cc&&<DChan course={cc} ch={ch} setCh={setCh} online={online} members={members}/>}
        {view==="dept"&&cd&&<DChan dept={cd} ch={ch} setCh={setCh} online={online}/>}
        <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
          <DTop title={dTitle()} color={view==="course"&&cc?cc.col:view==="dept"&&cd?cd.col:undefined}/>
          {view==="home"&&<HomeView asgn={asgn} setView={setView} setCid={setCid} setCh={setCh} mob={false} courses={allCourses} user={user} myEvents={myEvents} quarter={quarter} hiddenSet={hiddenSet} qd={qd} goToBuilding={goToBuilding}/>}
          {view==="timetable"&&<TTView setCid={setCid} setView={setView} setCh={setCh} asgn={asgn} mob={false} quarter={quarter} setQuarter={setQuarter} qd={qd} onRefresh={fetchData} courses={allCourses} hiddenSet={hiddenSet} goToBuilding={goToBuilding}/>}
          {view==="tasks"&&<AsgnView asgn={asgn} setAsgn={setAsgn} mob={false} myTasks={myTasks} setMyTasks={setMyTasks} navCourse={navCrs} courses={allCourses} quarter={quarter} setQuarter={setQuarter} hiddenAsgn={hiddenSet} saveHidden={saveHidden}/>}
          {view==="course"&&cc&&courseContent()}
          {view==="dept"&&cd&&deptContent()}
          {view==="friends"&&<FriendsView mob={false} setView={setView} {...friendProps}/>}
          {view==="dm"&&<DMView mob={false} setView={setView} friends={friendList} groups={groupList} leaveGroup={leaveGroup}/>}
          {view==="notif"&&<NotifView mob={false}/>}
          {view==="grades"&&<GradeView grades={grades} att={att} mob={false} courses={allCourses}/>}
          {view==="pomo"&&<PomodoroView pomo={pomo} setPomo={setPomo} mob={false}/>}
          {view==="calendar"&&<CalendarView myEvents={myEvents} setMyEvents={setMyEvents} asgn={asgn} courses={allCourses} qd={qd} mob={false}/>}
          {view==="events"&&<EventView events={events} mob={false}/>}
          {view==="reviews"&&<ReviewView reviews={reviews} setReviews={setReviews} mob={false} courses={allCourses}/>}
          {view==="bmarks"&&<BookmarkView bmarks={bmarks} mob={false} setView={setView} setCid={setCid} setCh={setCh} courses={allCourses}/>}
          {view==="search"&&<SearchView searchQ={searchQ} setSearchQ={setSearchQ} setView={setView} setCid={setCid} setCh={setCh} mob={false} courses={allCourses}/>}
          {view==="profile"&&<ProfileView mob={false} togTheme={togTheme} dark={dark} asgn={asgn} att={att} courses={allCourses} user={user} notifEnabled={notifEnabled} setNotifEnabled={setNotifEnabled} notifSettings={notifSettings} setNotifSettings={setNotifSettings}/>}
          {view==="location"&&<LocationView mob={false} user={user} friendIds={friendIds}/>}
          {view==="navigation"&&<NavigationView mob={false} initialDest={navDest} initialOrig={navOrig} onDestUsed={()=>{setNavDest(null);setNavOrig(null);}}/>}
        </div>
        <style>{`*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${T.bd};border-radius:3px}::placeholder{color:${T.txD}}button,input,textarea,select{font-family:inherit}`}</style>
      </div>
    );
  }

  // --- MOBILE ---
  const mBack=()=>setView("moreMenu");
  return(
    <div style={{display:"flex",flexDirection:"column",height:"100dvh",width:"100vw",maxWidth:480,margin:"0 auto",background:T.bg,color:T.tx,fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,'Hiragino Sans','Segoe UI',sans-serif",overflow:"hidden"}}>
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {view==="home"&&<><MHdr title="ScienceTokyo App" right={<button onClick={()=>setView("search")} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex"}}>{I.search}</button>}/><HomeView asgn={asgn} setView={setView} setCid={setCid} setCh={setCh} mob courses={allCourses} user={user} myEvents={myEvents} quarter={quarter} hiddenSet={hiddenSet} qd={qd} goToBuilding={goToBuilding}/></>}
        {view==="timetable"&&<TTView setCid={setCid} setView={setView} setCh={setCh} asgn={asgn} mob quarter={quarter} setQuarter={setQuarter} qd={qd} onRefresh={fetchData} courses={allCourses} hiddenSet={hiddenSet} goToBuilding={goToBuilding}/>}
        {view==="tasks"&&<><MHdr title="課題管理"/><AsgnView asgn={asgn} setAsgn={setAsgn} mob myTasks={myTasks} setMyTasks={setMyTasks} navCourse={navCrs} courses={allCourses} quarter={quarter} setQuarter={setQuarter} hiddenAsgn={hiddenSet} saveHidden={saveHidden}/></>}
        {view==="courseSelect"&&<><MHdr title="コース・学系"/><CSelect setCid={setCid} setView={setView} setCh={setCh} courses={allCourses} depts={userDepts} setDid={setDid}/></>}
        {view==="course"&&cc&&<><MHdr title={<><span style={{color:cc.col}}>{cc.code}</span><span style={{fontWeight:400,color:T.txD,fontSize:13,marginLeft:4}}>{cc.name}</span></>} back={()=>setView("courseSelect")} right={<button style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex"}}>{I.more}</button>}/><MTabs ch={ch} setCh={setCh}/>{courseContent()}</>}
        {view==="dept"&&cd&&<><MHdr title={<><span style={{color:cd.col}}>{cd.prefix}</span><span style={{fontWeight:400,color:T.txD,fontSize:13,marginLeft:4}}>{cd.name}</span></>} back={()=>setView("courseSelect")}/><div style={{display:"flex",borderBottom:`1px solid ${T.bd}`,background:T.bg2,flexShrink:0}}>{[{id:"timeline",l:"タイムライン",i:I.feed},{id:"chat",l:"チャット",i:I.chat}].map(t=><button key={t.id} onClick={()=>setCh(t.id)} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:3,padding:"10px 14px",border:"none",borderBottom:ch===t.id?`2px solid ${T.accent}`:"2px solid transparent",background:"transparent",color:ch===t.id?T.txH:T.txD,fontSize:13,fontWeight:ch===t.id?600:400,cursor:"pointer"}}>{t.i}<span>{t.l}</span></button>)}</div>{deptContent()}</>}
        {view==="moreMenu"&&<><MHdr title="その他"/><MoreMenu setView={setView} unreadN={unreadN} pendingFriendCount={pendingFriendCount}/></>}
        {view==="friends"&&<><MHdr title="友達" back={mBack}/><FriendsView mob setView={setView} {...friendProps}/></>}
        {view==="dm"&&<><MHdr title="DM" back={mBack}/><DMView mob setView={setView} friends={friendList} groups={groupList} leaveGroup={leaveGroup}/></>}
        {view==="notif"&&<><MHdr title="通知" back={mBack}/><NotifView mob/></>}
        {view==="grades"&&<><MHdr title="成績・出席" back={mBack}/><GradeView grades={grades} att={att} mob courses={allCourses}/></>}
        {view==="pomo"&&<><MHdr title="ポモドーロ" back={mBack}/><PomodoroView pomo={pomo} setPomo={setPomo} mob/></>}
        {view==="calendar"&&<><MHdr title="カレンダー" back={mBack}/><CalendarView myEvents={myEvents} setMyEvents={setMyEvents} asgn={asgn} courses={allCourses} qd={qd} mob/></>}
        {view==="events"&&<><MHdr title="イベント" back={mBack}/><EventView events={events} mob/></>}
        {view==="reviews"&&<><MHdr title="授業レビュー" back={mBack}/><ReviewView reviews={reviews} setReviews={setReviews} mob courses={allCourses}/></>}
        {view==="bmarks"&&<><MHdr title="ブックマーク" back={mBack}/><BookmarkView bmarks={bmarks} mob setView={setView} setCid={setCid} setCh={setCh} courses={allCourses}/></>}
        {view==="search"&&<><MHdr title="検索" back={mBack}/><SearchView searchQ={searchQ} setSearchQ={setSearchQ} setView={setView} setCid={setCid} setCh={setCh} mob courses={allCourses}/></>}
        {view==="profile"&&<><MHdr title="プロフィール" back={mBack}/><ProfileView mob togTheme={togTheme} dark={dark} asgn={asgn} att={att} courses={allCourses} user={user} notifEnabled={notifEnabled} setNotifEnabled={setNotifEnabled} notifSettings={notifSettings} setNotifSettings={setNotifSettings}/></>}
        {view==="location"&&<><MHdr title="友達の居場所" back={mBack}/><LocationView mob user={user} friendIds={friendIds}/></>}
        {view==="navigation"&&<><MHdr title="キャンパスナビ" back={mBack}/><NavigationView mob initialDest={navDest} initialOrig={navOrig} onDestUsed={()=>{setNavDest(null);setNavOrig(null);}}/></>}
      </div>
      <MNav view={view} setView={setView} ac={ac} unreadN={unreadN}/>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}html,body{overscroll-behavior:none;-webkit-tap-highlight-color:transparent}::-webkit-scrollbar{width:0;display:none}::placeholder{color:${T.txD}}button,input,textarea,select{font-family:inherit;-webkit-appearance:none}input,textarea{font-size:16px}`}</style>
    </div>
  );
}
