import React, { useState } from "react";
import { T } from "./theme.js";
import { I } from "./icons.jsx";
import { Av } from "./shared.jsx";
// ============================================================

const SideItem=({icon,label,on,click,badge})=>(
  <button onClick={click} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:8,border:"none",cursor:"pointer",background:on?`${T.accent}14`:"transparent",color:on?T.txH:T.tx,fontSize:12.5,fontWeight:on?600:400,textAlign:"left",borderLeft:on?`2px solid ${T.accent}`:"2px solid transparent"}}>
    <span style={{color:on?T.accent:T.txD,display:"flex",flexShrink:0}}>{icon}</span>
    <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{label}</span>
    {badge>0&&<span style={{minWidth:16,height:16,borderRadius:8,background:T.red,color:"#fff",fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px"}}>{badge}</span>}
  </button>
);

const DSide=({cid,did,view,setView,setCid,setDid,setCh,ac,unreadN,dmUnread=0,courses=[],depts=[],schools=[],user={},quarter,pendingFriendCount=0})=>{
  const [moreOpen,setMoreOpen]=useState(false);
  const extras=["grades","pomo","events","reviews","bmarks","location","encounter"];
  const isExtra=extras.includes(view);
  return(
  <div style={{width:180,background:T.bg2,display:"flex",flexDirection:"column",borderRight:`1px solid ${T.bd}`,flexShrink:0,overflowY:"auto"}}>
    <div style={{padding:"12px 10px 8px",fontWeight:800,fontSize:15,color:T.txH,letterSpacing:-.3}}>ScienceTokyo App</div>
    <div style={{padding:"0 6px"}}>
      <SideItem icon={I.home} label="ホーム" on={view==="home"} click={()=>setView("home")}/>
      <SideItem icon={I.cal} label="時間割" on={view==="timetable"} click={()=>setView("timetable")}/>
      <SideItem icon={I.tasks} label="課題" on={view==="tasks"} click={()=>setView("tasks")} badge={ac}/>
      <SideItem icon={I.mail} label="DM" on={view==="dm"} click={()=>setView("dm")} badge={dmUnread}/>
      <SideItem icon={I.users} label="友達" on={view==="friends"} click={()=>setView("friends")} badge={pendingFriendCount}/>
      <SideItem icon={I.bell} label="通知" on={view==="notif"} click={()=>setView("notif")} badge={unreadN}/>
      <SideItem icon={I.search} label="検索" on={view==="search"} click={()=>setView("search")}/>
      <SideItem icon={I.cal} label="カレンダー" on={view==="calendar"} click={()=>setView("calendar")}/>
      <SideItem icon={I.circle} label="サークル" on={view==="circles"} click={()=>setView("circles")}/>
      <SideItem icon={I.map} label="キャンパスナビ" on={view==="navigation"} click={()=>setView("navigation")}/>
      <SideItem icon={I.more} label="ツール" on={moreOpen||isExtra} click={()=>setMoreOpen(p=>!p)}/>
    </div>
    {schools.length>0&&<>
      <div style={{width:"calc(100% - 20px)",height:1,background:T.bd,margin:"6px 10px"}}/>
      <div style={{padding:"0 10px 2px",fontSize:10,fontWeight:700,color:T.txD,letterSpacing:.4}}>学院</div>
      <div style={{padding:"0 6px"}}>
        {schools.map(s=>{const on=did===s.prefix&&view==="dept";return(
          <button key={s.prefix} onClick={()=>{setDid(s.prefix);setView("dept");setCh("timeline");}} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"5px 10px",borderRadius:8,border:"none",cursor:"pointer",background:on?`${s.col}14`:"transparent",color:on?T.txH:T.tx,fontSize:12,textAlign:"left",borderLeft:on?`2px solid ${s.col}`:"2px solid transparent"}}>
            <div style={{width:24,height:24,borderRadius:6,background:on?s.col:`${s.col}30`,display:"flex",alignItems:"center",justifyContent:"center",color:on?"#fff":s.col,fontSize:8,fontWeight:700,flexShrink:0}}>{s.name.slice(0,2)}</div>
            <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</span>
          </button>
        );})}
      </div>
    </>}
    {depts.length>0&&<>
      <div style={{width:"calc(100% - 20px)",height:1,background:T.bd,margin:"6px 10px"}}/>
      <div style={{padding:"0 10px 2px",fontSize:10,fontWeight:700,color:T.txD,letterSpacing:.4}}>学系</div>
      <div style={{padding:"0 6px"}}>
        {depts.map(d=>{const on=did===d.prefix&&view==="dept";return(
          <button key={d.prefix} onClick={()=>{setDid(d.prefix);setView("dept");setCh("timeline");}} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"5px 10px",borderRadius:8,border:"none",cursor:"pointer",background:on?`${d.col}14`:"transparent",color:on?T.txH:T.tx,fontSize:12,textAlign:"left",borderLeft:on?`2px solid ${d.col}`:"2px solid transparent"}}>
            <div style={{width:24,height:24,borderRadius:6,background:on?d.col:`${d.col}30`,display:"flex",alignItems:"center",justifyContent:"center",color:on?"#fff":d.col,fontSize:8,fontWeight:700,flexShrink:0}}>{d.prefix.slice(0,3)}</div>
            <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</span>
          </button>
        );})}
      </div>
    </>}
    <div style={{width:"calc(100% - 20px)",height:1,background:T.bd,margin:"6px 10px"}}/>
    <div style={{padding:"0 10px 2px",fontSize:10,fontWeight:700,color:T.txD,letterSpacing:.4}}>COURSES{quarter?` (${quarter}Q)`:""}</div>
    <div style={{padding:"0 6px",flex:1}}>
      {courses.filter(c=>!quarter||c.quarter===quarter).map(c=>{const on=cid===c.id&&view==="course";return(
        <button key={c.id} onClick={()=>{setCid(c.id);setView("course");}} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"5px 10px",borderRadius:8,border:"none",cursor:"pointer",background:on?`${c.col}14`:"transparent",color:on?T.txH:T.tx,fontSize:12,textAlign:"left",borderLeft:on?`2px solid ${c.col}`:"2px solid transparent"}}>
          <div style={{width:24,height:24,borderRadius:6,background:on?c.col:`${c.col}30`,display:"flex",alignItems:"center",justifyContent:"center",color:on?"#fff":c.col,fontSize:9,fontWeight:700,flexShrink:0}}>{c.code?.split(".")[1]?.slice(0,2)||c.code?.slice(0,2)||"?"}</div>
          <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name}</span>
        </button>
      );})}
    </div>
    <div style={{padding:"6px 6px 10px"}}>
      <SideItem icon={I.shield} label="管理者" on={view==="admin"} click={()=>setView("admin")}/>
      <SideItem icon={I.user1} label={user.name||"プロフィール"} on={view==="profile"} click={()=>setView("profile")}/>
    </div>
    {moreOpen&&<>
      <div onClick={()=>setMoreOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",zIndex:998}}/>
      <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:320,background:T.bg2,border:`1px solid ${T.bdL}`,borderRadius:16,padding:16,zIndex:999,boxShadow:"0 20px 60px rgba(0,0,0,.6)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <span style={{fontWeight:700,color:T.txH,fontSize:15}}>Tools</span>
          <button onClick={()=>setMoreOpen(false)} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex"}}>{I.x}</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {[{id:"grades",i:I.grad,l:"成績",c:T.accentSoft},{id:"pomo",i:I.play,l:"ポモドーロ",c:T.green},{id:"events",i:I.event,l:"イベント",c:T.orange},{id:"reviews",i:I.star,l:"授業レビュー",c:"#c6a236"},{id:"bmarks",i:I.bmark,l:"ブックマーク",c:T.txD},{id:"location",i:I.pin,l:"友達の居場所",c:T.green},{id:"encounter",i:I.encounter,l:"すれ違い通信",c:T.accent}].map(n=>
            <button key={n.id} onClick={()=>{setView(n.id);setMoreOpen(false);}} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,padding:"16px 8px",borderRadius:12,border:view===n.id?`2px solid ${n.c}`:`1px solid ${T.bd}`,background:view===n.id?`${n.c}10`:T.bg3,cursor:"pointer",transition:"all .12s"}}>
              <span style={{color:n.c,display:"flex"}}>{n.i}</span>
              <span style={{fontSize:12,fontWeight:view===n.id?600:400,color:view===n.id?T.txH:T.tx}}>{n.l}</span>
            </button>
          )}
        </div>
      </div>
    </>}
  </div>);
};

const UserRow=({u,isOnline})=>(
  <div style={{display:"flex",alignItems:"center",gap:6,padding:"3px 12px"}}>
    <div style={{position:"relative"}}>
      <div style={{width:20,height:20,borderRadius:"50%",background:isOnline?(u.col||"#888"):`${T.txD}40`,display:"flex",alignItems:"center",justifyContent:"center",color:isOnline?"#fff":T.txD,fontSize:8,fontWeight:700}}>{(u.name||"?")[0]}</div>
      <div style={{position:"absolute",bottom:-1,right:-1,width:7,height:7,borderRadius:"50%",background:isOnline?T.green:T.txD,border:`1.5px solid ${T.bg2}`}}/>
    </div>
    <span style={{fontSize:11,color:isOnline?T.txH:T.txD,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.name||`User ${u.id}`}</span>
  </div>
);

const DChan=({course,dept,ch,setCh,online=[],members=[]})=>{
  const isDept=!!dept;
  const chs=isDept
    ?[{id:"timeline",n:"タイムライン",i:I.feed},{id:"chat",n:"チャット",i:I.chat}]
    :[{id:"timeline",n:"タイムライン",i:I.feed},{id:"chat",n:"チャット",i:I.chat},{id:"assignments",n:"課題",i:I.tasks},{id:"materials",n:"教材",i:I.clip},{id:"reviews",n:"レビュー",i:I.star}];
  const col=isDept?dept.col:course?.col;
  const onlineIds=new Set(online.map(u=>String(u.id)));
  const offline=members.filter(m=>!onlineIds.has(String(m.id)));
  return(
    <div style={{width:210,background:T.bg2,display:"flex",flexDirection:"column",borderRight:`1px solid ${T.bd}`,flexShrink:0}}>
      <div style={{padding:"13px 12px 10px",borderBottom:`1px solid ${T.bd}`}}>
        {isDept?<>
          <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:8,height:8,borderRadius:"50%",background:dept.col}}/><span style={{fontWeight:700,color:T.txH,fontSize:14}}>{dept.prefix}</span></div>
          <div style={{fontSize:11,color:T.txD,marginTop:2}}>{dept.name}</div>
        </>:<>
          <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:8,height:8,borderRadius:"50%",background:course.col}}/><span style={{fontWeight:700,color:T.txH,fontSize:14}}>{course.code}</span></div>
          <div style={{fontSize:11,color:T.txD,marginTop:2}}>{course.name}</div>
          <div style={{fontSize:10,color:T.txD,marginTop:1}}>{course.per} · {course.room}</div>
        </>}
      </div>
      <div style={{padding:"5px 0",flex:1,overflowY:"auto"}}>
        <div style={{padding:"5px 12px 3px",fontSize:10,fontWeight:700,color:T.txD,textTransform:"uppercase",letterSpacing:.7}}>Channels</div>
        {chs.map(c=><button key={c.id} onClick={()=>setCh(c.id)} style={{width:"100%",display:"flex",alignItems:"center",gap:6,padding:"5px 12px",border:"none",cursor:"pointer",fontSize:12,background:ch===c.id?`${T.accent}14`:"transparent",color:ch===c.id?T.txH:T.txD,textAlign:"left",borderLeft:ch===c.id?`2px solid ${T.accent}`:"2px solid transparent"}}><span style={{color:ch===c.id?T.accent:T.txD,display:"flex"}}>{c.i}</span><span style={{flex:1}}>{c.n}</span></button>)}
        {online.length>0&&<>
          <div style={{padding:"10px 12px 3px",fontSize:10,fontWeight:700,color:T.txD,textTransform:"uppercase",letterSpacing:.7}}>Online — {online.length}</div>
          {online.map(u=><UserRow key={u.id} u={u} isOnline/>)}
        </>}
        {offline.length>0&&<>
          <div style={{padding:"10px 12px 3px",fontSize:10,fontWeight:700,color:T.txD,textTransform:"uppercase",letterSpacing:.7}}>Offline — {offline.length}</div>
          {offline.map(u=><UserRow key={u.id} u={u} isOnline={false}/>)}
        </>}
      </div>
    </div>
  );
};

// ============================================================
// MOBILE: Bottom Nav
// ============================================================

const MNav=({view,setView,ac,unreadN,dmUnread})=>{
  const moreViews=["friends","notif","calendar","grades","pomo","events","reviews","bmarks","search","profile","courseSelect","course","dept","circles","admin"];
  const isMore=moreViews.includes(view);
  return(
  <nav style={{display:"flex",background:T.bg2,borderTop:`1px solid ${T.bd}`,flexShrink:0}}>
    {[{id:"home",i:I.home,l:"ホーム"},{id:"timetable",i:I.cal,l:"時間割"},{id:"tasks",i:I.tasks,l:"課題",b:ac},{id:"navigation",i:I.map,l:"マップ"},{id:"dm",i:I.mail,l:"DM",b:dmUnread},{id:"moreMenu",i:I.more,l:"その他",b:unreadN}].map(n=>{
      const on=n.id==="moreMenu"?isMore:view===n.id;
      return <button key={n.id} onClick={()=>setView(n.id)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,border:"none",background:"transparent",color:on?T.accent:T.txD,cursor:"pointer",padding:0,position:"relative",height:64}}><div style={{position:"relative"}}>{n.i}{n.b>0&&<span style={{position:"absolute",top:-4,right:-7,minWidth:14,height:14,borderRadius:7,background:T.red,color:"#fff",fontSize:8,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px"}}>{n.b}</span>}</div><span style={{fontSize:10,fontWeight:on?600:400}}>{n.l}</span></button>;
    })}
  </nav>);
};

// --- More Menu (mobile) ---

const MoreMenu=({setView,unreadN,pendingFriendCount=0,dmUnread=0})=>{
  const sections=[
    {title:"アカウント",items:[
      {id:"profile",i:I.user1,l:"プロフィール・設定"},
    ]},
    {title:"コミュニケーション",items:[
      {id:"friends",i:I.users,l:"友達",b:pendingFriendCount},
    ]},
    {title:"学習",items:[
      {id:"grades",i:I.grad,l:"成績"},
      {id:"reviews",i:I.star,l:"授業レビュー"},
      {id:"pomo",i:I.play,l:"ポモドーロタイマー"},
    ]},
    {title:"キャンパス",items:[
      {id:"location",i:I.pin,l:"友達の居場所"},
      {id:"encounter",i:I.encounter,l:"すれ違い通信"},
    ]},
    {title:"その他",items:[
      {id:"bmarks",i:I.bmark,l:"ブックマーク"},
      {id:"admin",i:I.shield,l:"管理者"},
    ]},
  ];
  const Item=({n})=>(
    <div onClick={()=>setView(n.id)} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 14px",cursor:"pointer"}}>
      <span style={{color:T.txD,display:"flex"}}>{n.i}</span>
      <span style={{flex:1,fontSize:14,color:T.txH,fontWeight:500}}>{n.l}</span>
      {n.b>0&&<span style={{minWidth:18,height:18,borderRadius:9,background:T.red,color:"#fff",fontSize:10,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 4px"}}>{n.b}</span>}
      <span style={{color:T.txD,display:"flex"}}>{I.arr}</span>
    </div>
  );
  return(
    <div style={{flex:1,overflowY:"auto",padding:12}}>
      {sections.map((s,si)=>(
        <div key={si} style={{marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:700,color:T.txD,letterSpacing:.3,padding:"0 6px 6px",textTransform:"uppercase"}}>{s.title}</div>
          <div style={{borderRadius:12,background:T.bg2,border:`1px solid ${T.bd}`,overflow:"hidden"}}>
            {s.items.map((n,ni)=>(
              <div key={n.id}>
                {ni>0&&<div style={{height:1,background:T.bd,margin:"0 14px"}}/>}
                <Item n={n}/>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export { SideItem, DSide, DChan, MNav, MoreMenu };
