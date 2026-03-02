import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { NOW, fT, fDS, uDue, pDone, tMap } from "../utils.jsx";
import { Av, Tag, Tx } from "../shared.jsx";

export const HomeView=({asgn,setView,setCid,setCh,mob,courses=[],user={},myEvents=[]})=>{

  const upcoming=[...asgn].filter(a=>a.st!=="completed").sort((a,b)=>a.due-b.due).slice(0,mob?3:4);
  const ac=asgn.filter(a=>a.st!=="completed").length;
  const wk=asgn.filter(a=>a.st!=="completed"&&(a.due-NOW)<7*864e5&&a.due>NOW).length;

  // 今日の予定
  const todayKey=`${NOW.getFullYear()}-${NOW.getMonth()}-${NOW.getDate()}`;
  const todayEvents=myEvents.filter(e=>{const d=e.date instanceof Date?e.date:new Date(e.date);return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`===todayKey;}).sort((a,b)=>(a.date instanceof Date?a.date:new Date(a.date))-(b.date instanceof Date?b.date:new Date(b.date)));
  const todayAsgn=asgn.filter(a=>{const d=a.due;return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`===todayKey&&a.st!=="completed";});

  return(
    <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
      <div style={{padding:"14px 16px 10px",display:"flex",alignItems:"center",gap:10}}>
        <Av u={user} sz={mob?40:44} st/><div><div style={{fontWeight:700,color:T.txH,fontSize:mob?16:18}}>おかえり{user.name?`、${user.name}さん`:""}</div>{user.dept&&<div style={{fontSize:12,color:T.txD}}>{user.dept}{user.yr?` · B${user.yr}`:""}</div>}</div>
      </div>
      <div style={{display:"flex",gap:8,padding:"0 16px 10px",overflowX:"auto"}}>
        {[{l:"未完了",v:ac,c:T.accent},{l:"今週",v:wk,c:T.orange},{l:"科目",v:courses.length,c:T.green}].map(s=><div key={s.l} style={{flex:"0 0 auto",padding:"10px 16px",borderRadius:10,background:`${s.c}08`,border:`1px solid ${s.c}20`,minWidth:80,textAlign:"center"}}><div style={{fontSize:22,fontWeight:700,color:s.c}}>{s.v}</div><div style={{fontSize:11,color:T.txD}}>{s.l}</div></div>)}
      </div>

      {(todayEvents.length>0||todayAsgn.length>0)&&<div style={{padding:"4px 16px 8px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <span style={{fontWeight:700,color:T.txH,fontSize:14}}>今日の予定</span>
          <button onClick={()=>setView("calendar")} style={{background:"none",border:"none",color:T.accentSoft,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:2}}>カレンダー {I.arr}</button>
        </div>
        {todayEvents.map(ev=>{const d=ev.date instanceof Date?ev.date:new Date(ev.date);const end=ev.end?(ev.end instanceof Date?ev.end:new Date(ev.end)):null;return(
          <div key={ev.id} onClick={()=>setView("calendar")} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,background:T.bg2,border:`1px solid ${T.bd}`,marginBottom:6,borderLeft:`3px solid ${ev.color||T.accent}`,cursor:"pointer"}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:ev.color||T.accent,flexShrink:0}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:14,fontWeight:600,color:T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ev.title}</div>
              {ev.memo&&<div style={{fontSize:11,color:T.txD,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ev.memo}</div>}
            </div>
            <div style={{fontSize:12,color:T.txD,flexShrink:0}}>{fDS(d)} {d.getHours()}:{String(d.getMinutes()).padStart(2,"0")}{end?`–${end.getHours()}:${String(end.getMinutes()).padStart(2,"0")}`:""}</div>
          </div>
        );})}
        {todayAsgn.map(a=>{const co=courses.find(x=>x.id===a.cid),dl=uDue(a.due);return(
          <div key={a.id} onClick={()=>setView("tasks")} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,background:`${dl.c}08`,border:`1px solid ${dl.c}20`,marginBottom:6,borderLeft:`3px solid ${dl.c}`,cursor:"pointer"}}>
            <div style={{flex:1,minWidth:0}}><Tag color={co?.col}>{co?.code}</Tag><div style={{fontSize:14,fontWeight:600,color:T.txH,marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.title}</div></div>
            <div style={{fontSize:12,fontWeight:700,color:dl.c,flexShrink:0}}>{dl.t}</div>
          </div>
        );})}
      </div>}

      {upcoming.length>0&&<div style={{padding:"4px 16px 8px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><span style={{fontWeight:700,color:T.txH,fontSize:14}}>直近の締切</span><button onClick={()=>setView("tasks")} style={{background:"none",border:"none",color:T.accentSoft,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:2}}>すべて {I.arr}</button></div>
        {upcoming.map(a=>{const co=courses.find(x=>x.id===a.cid),dl=uDue(a.due),p=pDone(a.subs);return(
          <div key={a.id} onClick={()=>setView("tasks")} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,background:dl.u?`${dl.c}08`:T.bg2,border:`1px solid ${dl.u?`${dl.c}20`:T.bd}`,marginBottom:6,borderLeft:`3px solid ${dl.c}`,cursor:"pointer"}}>
            <div style={{flex:1,minWidth:0}}><Tag color={co?.col}>{co?.code}</Tag><div style={{fontSize:14,fontWeight:600,color:T.txH,marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.title}</div></div>
            <div style={{textAlign:"right",flexShrink:0}}><div style={{fontSize:14,fontWeight:700,color:dl.c}}>{dl.t}</div>{a.subs.length>0&&<div style={{fontSize:11,color:T.txD}}>{p}%</div>}</div>
          </div>
        );})}
      </div>}
      {upcoming.length===0&&todayEvents.length===0&&todayAsgn.length===0&&<div style={{padding:"20px 16px",textAlign:"center",color:T.txD,fontSize:13}}>直近の締切はありません</div>}
      <div style={{height:16}}/>
    </div>
  );
};
