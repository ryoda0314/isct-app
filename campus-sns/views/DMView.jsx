import { useState, useEffect, useRef } from 'react';
import { T } from '../theme.js';
import { I } from '../icons.jsx';
import { Av, Tx } from '../shared.jsx';
import { fT, fTs } from '../utils.jsx';
import { useCurrentUser } from '../hooks/useCurrentUser.js';
import { useDMList, useDMMessages, useDMSend } from '../hooks/useDM.js';

export const DMView=({mob,setView})=>{
  const user=useCurrentUser();
  const {conversations,loading}=useDMList(user?.moodleId);
  const [sel,setSel]=useState(null);
  const [inp,setInp]=useState("");
  const ref=useRef(null);
  const sendDM=useDMSend();
  const {messages,setMessages:initMessages}=useDMMessages(sel?.id);

  // When selecting a conversation, initialize its messages
  useEffect(()=>{
    if(sel){
      const conv=conversations.find(c=>c.id===sel.id);
      if(conv) initMessages(conv.msgs);
    }
  },[sel,conversations,initMessages]);

  useEffect(()=>{ref.current?.scrollIntoView({behavior:"smooth"});},[messages]);

  const send=async()=>{
    if(!inp.trim()||!sel)return;
    const text=inp.trim();
    setInp("");
    await sendDM(text,sel.id);
  };

  const uid=user?.moodleId||user?.id;

  if(sel){
    const conv=conversations.find(c=>c.id===sel.id)||sel;
    const wu={name:conv.withName||'?',av:conv.withAvatar||'?',col:conv.withColor||'#888'};
    return(
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderBottom:`1px solid ${T.bd}`,background:T.bg2}}>
          <button onClick={()=>setSel(null)} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex"}}>{I.back}</button>
          <Av u={wu} sz={28} st/><span style={{fontWeight:600,color:T.txH,fontSize:14}}>{wu.name}</span>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:8}}>
          {messages.map(m=>{const me=m.uid===uid;return <div key={m.id} style={{display:"flex",justifyContent:me?"flex-end":"flex-start",marginBottom:4}}>
            <div style={{maxWidth:"75%",padding:"8px 12px",borderRadius:me?"14px 14px 4px 14px":"14px 14px 14px 4px",background:me?T.accent:T.bg3,color:me?"#fff":T.txH,fontSize:14}}><Tx>{m.text}</Tx><div style={{fontSize:10,color:me?"rgba(255,255,255,.6)":T.txD,textAlign:"right",marginTop:2}}>{fTs(m.ts)}</div></div>
          </div>;})}
          <div ref={ref}/>
        </div>
        <div style={{padding:"8px 10px",borderTop:`1px solid ${T.bd}`,background:T.bg2}}>
          <div style={{display:"flex",gap:6,alignItems:"center",padding:"3px 3px 3px 12px",borderRadius:20,background:T.bg3,border:`1px solid ${T.bd}`}}>
            <input value={inp} onChange={e=>setInp(e.target.value)} onKeyDown={e=>e.key==="Enter"&&(e.preventDefault(),send())} placeholder="メッセージ..." style={{flex:1,padding:"8px 0",border:"none",background:"transparent",color:T.txH,fontSize:14,outline:"none",fontFamily:"inherit"}}/>
            <button onClick={send} style={{width:34,height:34,borderRadius:"50%",border:"none",background:inp.trim()?T.accent:"transparent",color:inp.trim()?"#fff":T.txD,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>{I.send}</button>
          </div>
        </div>
      </div>
    );
  }

  return(
    <div style={{flex:1,overflowY:"auto",padding:12}}>
      <div style={{fontSize:12,fontWeight:700,color:T.txD,marginBottom:8}}>ダイレクトメッセージ</div>
      {loading&&<div style={{textAlign:"center",padding:20,color:T.txD,fontSize:13}}>読み込み中...</div>}
      {conversations.map(conv=>{
        const wu={name:conv.withName||'?',av:conv.withAvatar||'?',col:conv.withColor||'#888'};
        const last=conv.msgs[conv.msgs.length-1];
        return(
          <div key={conv.id} onClick={()=>setSel(conv)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,background:T.bg2,border:`1px solid ${T.bd}`,marginBottom:6,cursor:"pointer"}}>
            <Av u={wu} sz={36} st/><div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,color:T.txH,fontSize:14}}>{wu.name}</div><div style={{fontSize:12,color:T.txD,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{last?.text}</div></div>
            <span style={{fontSize:10,color:T.txD}}>{last?fT(last.ts):""}</span>
          </div>
        );
      })}
      {!loading&&conversations.length===0&&<div style={{textAlign:"center",padding:20,color:T.txD,fontSize:13}}>DMはまだありません</div>}
    </div>
  );
};
