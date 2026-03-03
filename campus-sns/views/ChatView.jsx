import React, { useState, useEffect, useRef } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { fTs } from "../utils.jsx";
import { Av, Tx, Loader } from "../shared.jsx";
import { useChat } from "../hooks/useChat.js";
import { useCurrentUser } from "../hooks/useCurrentUser.js";

export const ChatView=({course,dept,mob})=>{
  const user=useCurrentUser();
  const roomId=course?.id||`dept:${dept?.prefix}`;
  const {messages,loading,sendMessage}=useChat(roomId);
  const [inp,setInp]=useState("");const ref=useRef(null);
  useEffect(()=>{ref.current?.scrollIntoView({behavior:"smooth"});},[messages.length]);
  const send=()=>{if(!inp.trim())return;sendMessage(inp,user);setInp("");};

  // Group consecutive messages from same user within 5 min
  const grp=[];messages.forEach((m,i)=>{const p=messages[i-1];grp.push({...m,hdr:!(p&&p.uid===m.uid&&(m.ts-p.ts)<3e5)});});

  // Resolve display info: prefer DB profile, fall back to static data
  const resolveUser=(m)=>{
    if(m.name) return {name:m.name,av:m.avatar,col:m.color};
    // profile lookup removed (was static dummy data)
    if(m.uid===user.moodleId||m.uid===user.id) return {name:user.name,av:user.av,col:user.col};
    return {name:`User ${m.uid}`,av:"?",col:"#888"};
  };

  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:"8px 0"}}>
        {loading&&<Loader msg="メッセージを読み込み中" size="sm"/>}
        {grp.map(m=>{const u=resolveUser(m);return(
          <div key={m.id} style={{padding:m.hdr?"5px 14px 2px":"1px 14px 1px 56px"}}>
            {m.hdr?<div style={{display:"flex",gap:8}}><Av u={u} sz={32}/><div><div style={{display:"flex",alignItems:"baseline",gap:4}}><span style={{fontWeight:600,color:u?.col,fontSize:13}}>{u?.name}</span><span style={{fontSize:10,color:T.txD}}>{fTs(m.ts)}</span></div><p style={{margin:"2px 0 0",color:T.tx,fontSize:14,lineHeight:1.5}}><Tx>{m.text}</Tx></p></div></div>
            :<p style={{margin:0,color:T.tx,fontSize:14,lineHeight:1.5}}><Tx>{m.text}</Tx></p>}
          </div>
        );})}
        <div ref={ref}/>
      </div>
      <div style={{padding:"8px 10px",borderTop:`1px solid ${T.bd}`,background:T.bg2}}>
        <div style={{display:"flex",alignItems:"center",gap:6,padding:"3px 3px 3px 12px",borderRadius:mob?20:8,background:T.bg3,border:`1px solid ${T.bd}`}}>
          <span style={{color:T.txD,display:"flex",cursor:"pointer"}}>{I.plus}</span>
          <input value={inp} onChange={e=>setInp(e.target.value)} onKeyDown={e=>e.key==="Enter"&&(e.preventDefault(),send())} placeholder="メッセージ..." style={{flex:1,padding:"8px 0",border:"none",background:"transparent",color:T.txH,fontSize:14,outline:"none",fontFamily:"inherit"}}/>
          <button onClick={send} style={{width:34,height:34,borderRadius:mob?"50%":6,border:"none",background:inp.trim()?T.accent:"transparent",color:inp.trim()?"#fff":T.txD,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0}}>{I.send}</button>
        </div>
      </div>
    </div>
  );
};
