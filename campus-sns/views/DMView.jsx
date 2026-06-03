import { useState, useEffect, useRef } from 'react';
import { T } from '../theme.js';
import { I } from '../icons.jsx';
import { Av, Tx, Loader } from '../shared.jsx';
import { fT, fTs } from '../utils.jsx';
import { useCurrentUser } from '../hooks/useCurrentUser.js';
import { useDMList, useDMMessages, useDMSend } from '../hooks/useDM.js';
import { useGroupMessages, useGroupSend } from '../hooks/useGroupChat.js';
import { useTyping } from '../hooks/useTyping.js';
import { ReportModal } from '../ReportModal.jsx';

// Must match server allowlist in app/api/dm/route.js and public/stamps/manifest.json.
// Stamps are grouped by category for the picker UI; the on-disk path is
// /stamps/<category>/<id>.webp.
const STAMP_GROUPS = [
  {
    category: 'reactions',
    label: 'リアクション',
    stamps: [
      { id: 'ryokai',   label: '了解！' },
      { id: 'arigatou', label: 'ありがとう！' },
      { id: 'otsukare', label: 'おつかれさま！' },
      { id: 'gomenne',  label: 'ごめんね' },
      { id: 'ok',       label: 'OK！' },
      { id: 'matane',   label: 'またね！' },
    ],
  },
  {
    category: 'campus',
    label: 'キャンパス',
    stamps: [
      { id: 'now_ookayama',  label: '今大岡山！' },
      { id: 'near_yushima',  label: '湯島寄りです' },
      { id: 'engr_face',     label: '理工の顔してる' },
      { id: 'med_face',      label: '医歯学の顔してる' },
      { id: 'togo_topic',    label: 'その話、統合向き' },
      { id: 'today_suzu',    label: '今日はすずかけ' },
      { id: 'lost_tamachi',  label: '田町で迷子' },
      { id: 'summon_ooka',   label: '大岡山に召喚' },
      { id: 'experimenting', label: '実験中です' },
      { id: 'kadai_oware',   label: '課題に追われています' },
      { id: 'med_eng',       label: '医工連携してる' },
      { id: 'kokuritsu_kyu', label: 'それ、指定国立級' },
      { id: 'back_to_lab',   label: '研究室に戻ります' },
      { id: 'mood_yushima',  label: '今日は湯島の気分' },
      { id: 'mem_tokyotech', label: '東工大の記憶' },
      { id: 'mem_idaishika', label: '医科歯科の記憶' },
    ],
  },
];

// Lookup stamp_id → category for resolving image src on received messages.
const STAMP_CATEGORY_BY_ID = (() => {
  const map = {};
  for (const g of STAMP_GROUPS) for (const s of g.stamps) map[s.id] = g.category;
  return map;
})();
const stampSrc = (id) => {
  const cat = STAMP_CATEGORY_BY_ID[id];
  // Fall back to flat /stamps/<id>.webp if id is unknown (e.g., stamps deprecated
  // mid-rollout). Modern messages will always have a known category.
  return cat ? `/stamps/${cat}/${id}.webp` : `/stamps/${id}.webp`;
};

export const DMView=({mob,setView,friends=[],groups=[],leaveGroup,markDMSeen,createGroup})=>{
  const user=useCurrentUser();
  const {conversations,loading}=useDMList(user?.moodleId);
  const [sel,setSel]=useState(null); // {type:'dm'|'group', ...}
  const [inp,setInp]=useState("");
  const [showPicker,setShowPicker]=useState(false);
  const [showStamps,setShowStamps]=useState(false);
  const [reportTarget,setReportTarget]=useState(null);
  const [showNewGroup,setShowNewGroup]=useState(false);
  const [grpName,setGrpName]=useState("");
  const [grpSel,setGrpSel]=useState([]);
  const listRef=useRef(null);
  const sendDM=useDMSend();
  const sendGrpMsg=useGroupSend();
  const typingRoom=sel?(sel.type==='group'?`grp:${sel.id}`:`dm:${sel.id}`):null;
  const {typingUsers,setTyping}=useTyping(typingRoom,{id:user?.moodleId||user?.id,name:user?.name});

  // DM messages (only active when sel.type==='dm')
  const {messages:dmMsgs,setMessages:initDMMsgs,appendMessage:appendDMMsg}=useDMMessages(sel?.type==='dm'?sel.id:null);
  // Group messages (only active when sel.type==='group')
  const {messages:grpMsgs,loading:grpLoading,appendMessage:appendGrpMsg}=useGroupMessages(sel?.type==='group'?sel.id:null);

  const messages=sel?.type==='group'?grpMsgs:dmMsgs;

  // Mark conversation as read on server
  const markRead=async(convId)=>{
    if(!convId) return;
    try{await fetch('/api/dm',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({conversation_id:convId})});}catch{}
  };

  const startNewDM=async(friendId,name,avatar,color)=>{
    const existing=conversations.find(c=>c.withId===friendId);
    if(existing){setSel({type:'dm',...existing});setShowPicker(false);markRead(existing.id);return;}
    setSel({type:'dm',id:null,withId:friendId,withName:name,withAvatar:avatar,withColor:color,msgs:[]});
    setShowPicker(false);
  };

  const sendMsg=async()=>{
    if(!inp.trim()||!sel)return;
    const text=inp.trim();
    const myUid=user?.moodleId||user?.id;
    setInp("");
    if(sel.type==='group'){
      const result=await sendGrpMsg(text,sel.id);
      if(result?.id) appendGrpMsg({id:result.id,uid:myUid,text:result.text||text,ts:new Date(result.created_at||Date.now()),name:user?.name,avatar:user?.av,color:user?.col});
    }else if(sel.id){
      const result=await sendDM(text,sel.id);
      if(result?.id) appendDMMsg({id:result.id,uid:result.sender_id||myUid,text:result.text||text,ts:new Date(result.created_at||Date.now())});
    }else if(sel.withId){
      const result=await sendDM(text,null,sel.withId);
      if(result?.conversation_id) setSel(prev=>({...prev,id:result.conversation_id}));
      if(result?.id) appendDMMsg({id:result.id,uid:result.sender_id||myUid,text:result.text||text,ts:new Date(result.created_at||Date.now())});
    }
  };

  // Stamps are DM-only (group chat send/render is text-only for now).
  const sendStamp=async(stampId)=>{
    if(!sel||sel.type==='group')return;
    setShowStamps(false);
    const myUid=user?.moodleId||user?.id;
    if(sel.id){
      const result=await sendDM(null,sel.id,null,{stampId});
      if(result?.id) appendDMMsg({id:result.id,uid:result.sender_id||myUid,text:'',stamp_id:stampId,ts:new Date(result.created_at||Date.now())});
    }else if(sel.withId){
      const result=await sendDM(null,null,sel.withId,{stampId});
      if(result?.conversation_id) setSel(prev=>({...prev,id:result.conversation_id}));
      if(result?.id) appendDMMsg({id:result.id,uid:result.sender_id||myUid,text:'',stamp_id:stampId,ts:new Date(result.created_at||Date.now())});
    }
  };

  useEffect(()=>{
    if(sel?.type==='dm'&&sel){
      const conv=conversations.find(c=>c.id===sel.id);
      if(conv) initDMMsgs(conv.msgs);
    }
  },[sel,conversations,initDMMsgs]);

  useEffect(()=>{ setShowStamps(false); },[sel?.id,sel?.type]);

  // Scroll the message list to the bottom by moving the container's own
  // scrollTop — NOT scrollIntoView, which also scrolls every scrollable
  // ancestor and would push the whole DM panel (header + list) off-screen.
  useEffect(()=>{const el=listRef.current;if(el)el.scrollTop=el.scrollHeight;},[messages]);

  const uid=user?.moodleId||user?.id;

  /* ── Chat view (DM or Group) ── */
  if(sel){
    const isGroup=sel.type==='group';
    const convData=conversations.find(c=>c.id===sel.id)||sel;
    const headerName=isGroup?sel.name:convData.withName||'?';
    const headerAv=isGroup
      ?{name:sel.name,av:sel.avatar||sel.name?.[0],col:sel.color||T.accent}
      :{name:headerName,av:convData.withAvatar||'?',col:convData.withColor||'#888'};
    // Read receipt: check if the other user has read up to a certain timestamp
    const otherLastRead=!isGroup&&convData.lastRead?convData.lastRead[String(convData.withId)]:null;
    const isRead=(msgTs)=>otherLastRead&&new Date(otherLastRead)>=new Date(msgTs);

    return(
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderBottom:`1px solid ${T.bd}`,background:T.bg2}}>
          <button onClick={()=>setSel(null)} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex"}}>{I.back}</button>
          <Av u={headerAv} sz={28} st={!isGroup}/>
          <div style={{flex:1,minWidth:0}}>
            <span style={{fontWeight:600,color:T.txH,fontSize:14}}>{headerName}</span>
            {isGroup&&<span style={{fontSize:11,color:T.txD,marginLeft:6}}>{sel.memberCount}人</span>}
          </div>
          {isGroup&&leaveGroup&&<button onClick={async()=>{await leaveGroup(sel.id);setSel(null);}}
            style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${T.bd}`,background:"transparent",color:T.txD,fontSize:11,fontWeight:500,cursor:"pointer"}}
            title="グループ退出">退出</button>}
        </div>
        <div ref={listRef} style={{flex:1,overflowY:"auto",padding:8}}>
          {isGroup&&grpLoading&&<Loader msg="読み込み中" size="sm"/>}
          {(()=>{
            const _dateKey=d=>`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
            const _dateLabel=d=>{
              const now=new Date();const t=new Date(now.getFullYear(),now.getMonth(),now.getDate());
              const md=new Date(d.getFullYear(),d.getMonth(),d.getDate());
              const diff=Math.round((t-md)/864e5);
              if(diff===0)return"今日";if(diff===1)return"昨日";
              return `${d.getMonth()+1}月${d.getDate()}日`;
            };
            const grp=[];let lastDate="";messages.forEach(m=>{
              const dk=_dateKey(m.ts);
              if(dk!==lastDate){grp.push({_dateSep:true,_dateLabel:_dateLabel(m.ts),_key:`date_${dk}`});lastDate=dk;}
              grp.push(m);
            });
            return grp.map(m=>{
              if(m._dateSep) return(
                <div key={m._key} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px 4px",margin:"4px 0"}}>
                  <div style={{flex:1,height:1,background:T.bd}}/>
                  <span style={{fontSize:11,color:T.txD,fontWeight:500,whiteSpace:"nowrap"}}>{m._dateLabel}</span>
                  <div style={{flex:1,height:1,background:T.bd}}/>
                </div>
              );
              const me=m.uid===uid;
              return <div key={m.id} className="dmMsg" style={{display:"flex",justifyContent:me?"flex-end":"flex-start",marginBottom:4,alignItems:"flex-end",gap:4}}>
              {/* Group: show sender avatar */}
              {isGroup&&!me&&<div style={{marginRight:2,alignSelf:"flex-end"}}>
                <Av u={{name:m.name,av:m.avatar,col:m.color}} sz={24}/>
              </div>}
              {!me&&<span className="dmMsgFlag" onClick={()=>setReportTarget({type:isGroup?"message":"dm",id:m.id,userId:m.uid})} style={{cursor:"pointer",color:T.txD,display:"flex",opacity:0,transition:"opacity .15s",alignSelf:"center",flexShrink:0}} title="通報">{I.flag}</span>}
              <div style={{maxWidth:"75%"}}>
                {isGroup&&!me&&<div style={{fontSize:11,fontWeight:600,color:m.color||T.txD,marginBottom:2,marginLeft:2}}>{m.name}</div>}
                {m.stamp_id?
                  <div>
                    <img src={stampSrc(m.stamp_id)} alt="" draggable={false} style={{display:"block",width:160,height:160,objectFit:"contain",userSelect:"none"}}/>
                    <div style={{fontSize:10,color:T.txD,textAlign:"right",marginTop:2,display:"flex",alignItems:"center",justifyContent:"flex-end",gap:3}}>
                      <span>{fTs(m.ts)}</span>
                      {me&&!isGroup&&<span style={{fontSize:9,opacity:isRead(m.ts)?.9:.5}}>{isRead(m.ts)?"✓✓":"✓"}</span>}
                    </div>
                  </div>
                  :
                  <div style={{padding:"8px 12px",borderRadius:me?"14px 14px 4px 14px":"14px 14px 14px 4px",background:me?T.accent:T.bg3,color:me?"#fff":T.txH,fontSize:14}}>
                    <Tx>{m.text}</Tx>
                    <div style={{fontSize:10,color:me?"rgba(255,255,255,.6)":T.txD,textAlign:"right",marginTop:2,display:"flex",alignItems:"center",justifyContent:"flex-end",gap:3}}>
                      <span>{fTs(m.ts)}</span>
                      {me&&!isGroup&&<span style={{fontSize:9,opacity:isRead(m.ts)?.9:.5}}>{isRead(m.ts)?"✓✓":"✓"}</span>}
                    </div>
                  </div>
                }
              </div>
            </div>;
            });
          })()}
        </div>
        {/* Typing indicator */}
        {typingUsers.length>0&&<div style={{padding:"2px 14px",fontSize:11,color:T.txD,fontStyle:"italic"}}>
          {typingUsers.join("、")}が入力中...
        </div>}
        {!isGroup&&showStamps&&<div style={{padding:"10px 10px 0",background:T.bg2,borderTop:`1px solid ${T.bd}`,maxHeight:320,overflowY:"auto"}}>
          {STAMP_GROUPS.map(g=>(
            <div key={g.category} style={{marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:T.txD,letterSpacing:.4,padding:"2px 4px 6px",textTransform:"uppercase"}}>{g.label}</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3, 1fr)",gap:8}}>
                {g.stamps.map(s=>(
                  <button key={s.id} onClick={()=>sendStamp(s.id)} style={{padding:6,borderRadius:10,border:`1px solid ${T.bd}`,background:T.bg3,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <img src={`/stamps/${g.category}/${s.id}.webp`} alt={s.label} draggable={false} style={{width:"100%",aspectRatio:"1/1",objectFit:"contain",display:"block"}}/>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>}
        <div style={{padding:"8px 10px",borderTop:`1px solid ${T.bd}`,background:T.bg2}}>
          <div style={{display:"flex",gap:6,alignItems:"center",padding:"3px 3px 3px 6px",borderRadius:20,background:T.bg3,border:`1px solid ${T.bd}`}}>
            {!isGroup&&<button onClick={()=>setShowStamps(s=>!s)} title="スタンプ" style={{width:32,height:32,borderRadius:"50%",border:"none",background:showStamps?`${T.accent}22`:"transparent",color:showStamps?T.accent:T.txD,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0}}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10"/><path d="M21 15l-6 6"/><path d="M21 15h-4a2 2 0 0 0-2 2v4"/></svg>
            </button>}
            <input value={inp} onChange={e=>{setInp(e.target.value);setTyping(!!e.target.value.trim());}} onKeyDown={e=>e.key==="Enter"&&(e.preventDefault(),sendMsg())} onFocus={()=>setShowStamps(false)} placeholder="メッセージ..." style={{flex:1,padding:"8px 0",border:"none",background:"transparent",color:T.txH,fontSize:14,outline:"none",fontFamily:"inherit"}}/>
            <button onClick={()=>{sendMsg();setTyping(false);}} style={{width:34,height:34,borderRadius:"50%",border:"none",background:inp.trim()?T.accent:"transparent",color:inp.trim()?"#fff":T.txD,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>{I.send}</button>
          </div>
        </div>
        {reportTarget&&<ReportModal targetType={reportTarget.type} targetId={reportTarget.id} targetUserId={reportTarget.userId} onClose={()=>setReportTarget(null)}/>}
        <style>{`.dmMsg:hover .dmMsgFlag{opacity:.5!important}.dmMsgFlag:hover{opacity:1!important}`}</style>
      </div>
    );
  }

  // Friend picker overlay (for new DM)
  if(showPicker){
    return(
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderBottom:`1px solid ${T.bd}`,background:T.bg2}}>
          <button onClick={()=>setShowPicker(false)} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex"}}>{I.back}</button>
          <span style={{fontWeight:600,color:T.txH,fontSize:14}}>DMを送る相手を選択</span>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:12}}>
          {friends.length===0&&<div style={{textAlign:"center",padding:20,color:T.txD,fontSize:13}}>友達がいません</div>}
          {friends.map(f=>{
            const u={name:f.name,av:f.avatar,col:f.color};
            return <div key={f.friendId} onClick={()=>startNewDM(f.friendId,f.name,f.avatar,f.color)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,background:T.bg2,border:`1px solid ${T.bd}`,marginBottom:6,cursor:"pointer"}}>
              <Av u={u} sz={36}/><div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,color:T.txH,fontSize:14}}>{f.name}</div>{f.dept&&<div style={{fontSize:11,color:T.txD}}>{f.dept}</div>}</div>
            </div>;
          })}
        </div>
      </div>
    );
  }

  // Group creation overlay
  if(showNewGroup){
    const toggleGrpMember=(fid)=>setGrpSel(p=>p.includes(fid)?p.filter(x=>x!==fid):[...p,fid]);
    const doCreate=async()=>{
      if(!grpName.trim()||grpSel.length===0)return;
      if(createGroup) await createGroup(grpName.trim(),grpSel);
      setShowNewGroup(false);setGrpName("");setGrpSel([]);
    };
    return(
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderBottom:`1px solid ${T.bd}`,background:T.bg2}}>
          <button onClick={()=>{setShowNewGroup(false);setGrpName("");setGrpSel([]);}} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex"}}>{I.back}</button>
          <span style={{fontWeight:600,color:T.txH,fontSize:14}}>グループ作成</span>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:12}}>
          <div style={{marginBottom:12}}>
            <input value={grpName} onChange={e=>setGrpName(e.target.value)} placeholder="グループ名" style={{width:"100%",padding:"10px 12px",borderRadius:10,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:14,outline:"none",fontFamily:"inherit"}}/>
          </div>
          <div style={{fontSize:12,fontWeight:700,color:T.txD,marginBottom:8}}>メンバーを選択 {grpSel.length>0&&<span style={{color:T.accent}}>({grpSel.length}人)</span>}</div>
          {friends.length===0&&<div style={{textAlign:"center",padding:20,color:T.txD,fontSize:13}}>友達がいません</div>}
          {friends.map(f=>{
            const u={name:f.name,av:f.avatar,col:f.color};
            const on=grpSel.includes(f.friendId);
            return <div key={f.friendId} onClick={()=>toggleGrpMember(f.friendId)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,background:on?`${T.accent}10`:T.bg2,border:`1px solid ${on?T.accent+'50':T.bd}`,marginBottom:6,cursor:"pointer"}}>
              <Av u={u} sz={36}/><div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,color:T.txH,fontSize:14}}>{f.name}</div>{f.dept&&<div style={{fontSize:11,color:T.txD}}>{f.dept}</div>}</div>
              <div style={{width:22,height:22,borderRadius:6,border:`2px solid ${on?T.accent:T.bd}`,background:on?T.accent:"transparent",display:"flex",alignItems:"center",justifyContent:"center"}}>{on&&I.chk}</div>
            </div>;
          })}
        </div>
        <div style={{padding:"10px 12px",borderTop:`1px solid ${T.bd}`,background:T.bg2}}>
          <button onClick={doCreate} disabled={!grpName.trim()||grpSel.length===0} style={{width:"100%",padding:"12px 0",borderRadius:10,border:"none",background:grpName.trim()&&grpSel.length>0?T.accent:T.bg3,color:grpName.trim()&&grpSel.length>0?"#fff":T.txD,fontSize:14,fontWeight:600,cursor:grpName.trim()&&grpSel.length>0?"pointer":"default"}}>作成</button>
        </div>
      </div>
    );
  }

  /* ── Conversation list ── */
  return(
    <div style={{flex:1,overflowY:"auto",padding:12}}>
      {/* Action buttons */}
      <div style={{display:"flex",gap:8,marginBottom:12}}>
        <button onClick={()=>setShowPicker(true)} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"10px 0",borderRadius:10,border:`1px solid ${T.bd}`,background:T.bg2,cursor:"pointer"}}>
          <span style={{color:T.accent,display:"flex"}}>{I.pen}</span>
          <span style={{fontSize:12,fontWeight:600,color:T.txH}}>新しいDM</span>
        </button>
        <button onClick={()=>setView("friends")} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"10px 0",borderRadius:10,border:`1px solid ${T.bd}`,background:T.bg2,cursor:"pointer"}}>
          <span style={{color:T.accent,display:"flex"}}>{I.users}</span>
          <span style={{fontSize:12,fontWeight:600,color:T.txH}}>友達一覧</span>
        </button>
        <button onClick={()=>setShowNewGroup(true)} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"10px 0",borderRadius:10,border:`1px solid ${T.bd}`,background:T.bg2,cursor:"pointer"}}>
          <span style={{color:T.accent,display:"flex"}}>{I.plus}</span>
          <span style={{fontSize:12,fontWeight:600,color:T.txH}}>グループ</span>
        </button>
      </div>
      {loading&&<Loader msg="DMを読み込み中" size="sm"/>}

      {/* Group conversations */}
      {groups.length>0&&<>
        {groups.map(g=>(
          <div key={`g_${g.id}`} onClick={()=>setSel({type:'group',id:g.id,name:g.name,avatar:g.avatar,color:g.color,memberCount:g.memberCount,members:g.members})}
            style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,background:T.bg2,border:`1px solid ${T.bd}`,marginBottom:6,cursor:"pointer"}}>
            <div style={{width:36,height:36,borderRadius:12,background:g.color||T.accent,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <span style={{color:"#fff",fontWeight:700,fontSize:13}}>{g.avatar||g.name?.[0]||'G'}</span>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:600,color:T.txH,fontSize:14}}>{g.name}</div>
              <div style={{fontSize:12,color:T.txD,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {g.lastMessage?`${g.lastMessage.senderName}: ${g.lastMessage.text}`:`${g.memberCount}人のグループ`}
              </div>
            </div>
            {g.lastMessage&&<span style={{fontSize:10,color:T.txD}}>{fT(new Date(g.lastMessage.ts))}</span>}
          </div>
        ))}
      </>}

      {/* DM conversations */}
      {conversations.map(conv=>{
        const wu={name:conv.withName||'?',av:conv.withAvatar||'?',col:conv.withColor||'#888'};
        const last=conv.msgs[conv.msgs.length-1];
        return(
          <div key={conv.id} onClick={()=>{setSel({type:'dm',...conv});markDMSeen?.(conv.id);markRead(conv.id);}} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,background:T.bg2,border:`1px solid ${T.bd}`,marginBottom:6,cursor:"pointer"}}>
            <Av u={wu} sz={36} st/><div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,color:T.txH,fontSize:14}}>{wu.name}</div><div style={{fontSize:12,color:T.txD,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{last?.stamp_id?"[スタンプ]":last?.text}</div></div>
            <span style={{fontSize:10,color:T.txD}}>{last?fT(last.ts):""}</span>
          </div>
        );
      })}
      {!loading&&conversations.length===0&&groups.length===0&&<div style={{textAlign:"center",padding:20,color:T.txD,fontSize:13}}>DMはまだありません</div>}
    </div>
  );
};
