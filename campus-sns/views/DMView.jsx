import { useState, useEffect, useRef } from 'react';
import { T } from '../theme.js';
import { I } from '../icons.jsx';
import { Av, Tx, Loader } from '../shared.jsx';
import { fT, fTs } from '../utils.jsx';
import { useCurrentUser } from '../hooks/useCurrentUser.js';
import { useDMList, useDMMessages, useDMSend } from '../hooks/useDM.js';
import { useGroupMessages, useGroupSend } from '../hooks/useGroupChat.js';
import { useTyping } from '../hooks/useTyping.js';

export const DMView=({mob,setView,friends=[],groups=[],leaveGroup,markDMSeen})=>{
  const user=useCurrentUser();
  const {conversations,loading}=useDMList(user?.moodleId);
  const [sel,setSel]=useState(null); // {type:'dm'|'group', ...}
  const [inp,setInp]=useState("");
  const [showPicker,setShowPicker]=useState(false);
  const ref=useRef(null);
  const sendDM=useDMSend();
  const sendGrpMsg=useGroupSend();
  const typingRoom=sel?(sel.type==='group'?`grp:${sel.id}`:`dm:${sel.id}`):null;
  const {typingUsers,setTyping}=useTyping(typingRoom,{id:user?.moodleId||user?.id,name:user?.name});

  // DM messages (only active when sel.type==='dm')
  const {messages:dmMsgs,setMessages:initDMMsgs}=useDMMessages(sel?.type==='dm'?sel.id:null);
  // Group messages (only active when sel.type==='group')
  const {messages:grpMsgs,loading:grpLoading}=useGroupMessages(sel?.type==='group'?sel.id:null);

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
    setInp("");
    if(sel.type==='group'){
      await sendGrpMsg(text,sel.id);
    }else if(sel.id){
      await sendDM(text,sel.id);
    }else if(sel.withId){
      const result=await sendDM(text,null,sel.withId);
      if(result?.conversation_id) setSel(prev=>({...prev,id:result.conversation_id}));
    }
  };

  useEffect(()=>{
    if(sel?.type==='dm'&&sel){
      const conv=conversations.find(c=>c.id===sel.id);
      if(conv) initDMMsgs(conv.msgs);
    }
  },[sel,conversations,initDMMsgs]);

  useEffect(()=>{ref.current?.scrollIntoView({behavior:"smooth"});},[messages]);

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
        <div style={{flex:1,overflowY:"auto",padding:8}}>
          {isGroup&&grpLoading&&<Loader msg="読み込み中" size="sm"/>}
          {messages.map(m=>{
            const me=m.uid===uid;
            return <div key={m.id} style={{display:"flex",justifyContent:me?"flex-end":"flex-start",marginBottom:4}}>
              {/* Group: show sender avatar */}
              {isGroup&&!me&&<div style={{marginRight:6,alignSelf:"flex-end"}}>
                <Av u={{name:m.name,av:m.avatar,col:m.color}} sz={24}/>
              </div>}
              <div style={{maxWidth:"75%"}}>
                {isGroup&&!me&&<div style={{fontSize:11,fontWeight:600,color:m.color||T.txD,marginBottom:2,marginLeft:2}}>{m.name}</div>}
                <div style={{padding:"8px 12px",borderRadius:me?"14px 14px 4px 14px":"14px 14px 14px 4px",background:me?T.accent:T.bg3,color:me?"#fff":T.txH,fontSize:14}}>
                  <Tx>{m.text}</Tx>
                  <div style={{fontSize:10,color:me?"rgba(255,255,255,.6)":T.txD,textAlign:"right",marginTop:2,display:"flex",alignItems:"center",justifyContent:"flex-end",gap:3}}>
                    <span>{fTs(m.ts)}</span>
                    {me&&!isGroup&&<span style={{fontSize:9,opacity:isRead(m.ts)?.9:.5}}>{isRead(m.ts)?"✓✓":"✓"}</span>}
                  </div>
                </div>
              </div>
            </div>;
          })}
          <div ref={ref}/>
        </div>
        {/* Typing indicator */}
        {typingUsers.length>0&&<div style={{padding:"2px 14px",fontSize:11,color:T.txD,fontStyle:"italic"}}>
          {typingUsers.join("、")}が入力中...
        </div>}
        <div style={{padding:"8px 10px",borderTop:`1px solid ${T.bd}`,background:T.bg2}}>
          <div style={{display:"flex",gap:6,alignItems:"center",padding:"3px 3px 3px 12px",borderRadius:20,background:T.bg3,border:`1px solid ${T.bd}`}}>
            <input value={inp} onChange={e=>{setInp(e.target.value);setTyping(!!e.target.value.trim());}} onKeyDown={e=>e.key==="Enter"&&(e.preventDefault(),sendMsg())} placeholder="メッセージ..." style={{flex:1,padding:"8px 0",border:"none",background:"transparent",color:T.txH,fontSize:14,outline:"none",fontFamily:"inherit"}}/>
            <button onClick={()=>{sendMsg();setTyping(false);}} style={{width:34,height:34,borderRadius:"50%",border:"none",background:inp.trim()?T.accent:"transparent",color:inp.trim()?"#fff":T.txD,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>{I.send}</button>
          </div>
        </div>
      </div>
    );
  }

  // Friend picker overlay
  if(showPicker){
    return(
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderBottom:`1px solid ${T.bd}`,background:T.bg2}}>
          <button onClick={()=>setShowPicker(false)} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex"}}>{I.back}</button>
          <span style={{fontWeight:600,color:T.txH,fontSize:14}}>友達を選択</span>
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

  /* ── Conversation list ── */
  return(
    <div style={{flex:1,overflowY:"auto",padding:12}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
        <div style={{fontSize:12,fontWeight:700,color:T.txD}}>ダイレクトメッセージ</div>
        {friends.length>0&&<button onClick={()=>setShowPicker(true)} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:7,border:`1px solid ${T.accent}30`,background:`${T.accent}10`,cursor:"pointer"}}>
          <span style={{color:T.accent,display:"flex"}}>{I.plus}</span>
          <span style={{fontSize:11,fontWeight:600,color:T.accent}}>新しいDM</span>
        </button>}
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
            <Av u={wu} sz={36} st/><div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,color:T.txH,fontSize:14}}>{wu.name}</div><div style={{fontSize:12,color:T.txD,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{last?.text}</div></div>
            <span style={{fontSize:10,color:T.txD}}>{last?fT(last.ts):""}</span>
          </div>
        );
      })}
      {!loading&&conversations.length===0&&groups.length===0&&<div style={{textAlign:"center",padding:20,color:T.txD,fontSize:13}}>DMはまだありません</div>}
    </div>
  );
};
