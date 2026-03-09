import React, { useState, useEffect, useRef } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { fTs } from "../utils.jsx";
import { Av, Tx, Loader } from "../shared.jsx";
import { useChat } from "../hooks/useChat.js";
import { useCurrentUser } from "../hooks/useCurrentUser.js";
import { useTyping } from "../hooks/useTyping.js";

export const ChatView=({course,dept,mob})=>{
  const user=useCurrentUser();
  const roomId=course?.id||`dept:${dept?.prefix}`;
  const {messages,loading,sendMessage}=useChat(roomId);
  const {typingUsers,setTyping}=useTyping(roomId,{id:user?.moodleId||user?.id,name:user?.name});
  const [inp,setInp]=useState("");const [menuOpen,setMenuOpen]=useState(null);const ref=useRef(null); // menuOpen: null|'actions'|'emoji'
  useEffect(()=>{ref.current?.scrollIntoView({behavior:"smooth"});},[messages.length]);
  const send=()=>{if(!inp.trim())return;sendMessage(inp,user);setInp("");setTyping(false);};
  const closeMenu=()=>setMenuOpen(null);

  // Group consecutive messages from same user within 5 min
  const grp=[];messages.forEach((m,i)=>{const p=messages[i-1];grp.push({...m,hdr:!(p&&p.uid===m.uid&&(m.ts-p.ts)<3e5)});});

  // Resolve display info: prefer DB profile, fall back to static data
  const resolveUser=(m)=>{
    if(m.name) return {name:m.name,av:m.avatar,col:m.color};
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
      {/* Typing indicator */}
      {typingUsers.length>0&&<div style={{padding:"2px 14px",fontSize:11,color:T.txD,fontStyle:"italic"}}>
        {typingUsers.join("、")}が入力中...
      </div>}
      <div style={{padding:"8px 10px",borderTop:`1px solid ${T.bd}`,background:T.bg2}}>
        <div style={{display:"flex",alignItems:"center",gap:6,padding:"3px 3px 3px 12px",borderRadius:mob?20:8,background:T.bg3,border:`1px solid ${T.bd}`}}>
          <div style={{position:"relative"}}>
            <span onClick={()=>setMenuOpen(p=>p?null:'actions')} style={{color:menuOpen?T.accent:T.txD,display:"flex",cursor:"pointer",transition:"color .15s"}}>{menuOpen?I.x:I.plus}</span>
            {menuOpen==='actions'&&<div style={{position:"absolute",bottom:36,left:0,background:T.bg2,border:`1px solid ${T.bd}`,borderRadius:12,padding:6,zIndex:10,boxShadow:"0 4px 16px rgba(0,0,0,.25)",minWidth:160}}>
              {[
                {icon:I.mask,label:"絵文字",action:()=>setMenuOpen('emoji')},
                {icon:I.code,label:"コードブロック",action:()=>{setInp(p=>p+"```\n\n```");closeMenu();}},
                {icon:I.poll,label:"投票を作成",action:()=>{setInp(p=>p+"/poll ");closeMenu();}},
                {icon:I.mega,label:"お知らせ",action:()=>{setInp(p=>p+"/announce ");closeMenu();}},
              ].map(item=>(
                <div key={item.label} onClick={item.action}
                  style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:8,cursor:"pointer",transition:"background .1s"}}
                  onMouseEnter={e=>e.currentTarget.style.background=T.bg4} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <span style={{color:T.txD,display:"flex",flexShrink:0}}>{item.icon}</span>
                  <span style={{fontSize:13,color:T.txH,fontWeight:500}}>{item.label}</span>
                </div>
              ))}
            </div>}
            {menuOpen==='emoji'&&<div style={{position:"absolute",bottom:36,left:0,background:T.bg2,border:`1px solid ${T.bd}`,borderRadius:10,padding:8,zIndex:10,boxShadow:"0 4px 16px rgba(0,0,0,.25)"}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6,paddingBottom:6,borderBottom:`1px solid ${T.bd}`}}>
                <span onClick={()=>setMenuOpen('actions')} style={{color:T.txD,display:"flex",cursor:"pointer"}}>{I.back}</span>
                <span style={{fontSize:12,fontWeight:600,color:T.txD}}>絵文字</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
                {["😀","😂","🥹","😍","🤔","👍","👎","🎉","🔥","❤️","👏","😢","😮","🙏","✅","🚀","💯","⭐","📝","✨","🤣"].map(e=>(
                  <button key={e} onClick={()=>{setInp(p=>p+e);closeMenu();}} style={{width:32,height:32,border:"none",background:"transparent",fontSize:18,cursor:"pointer",borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center"}}
                    onMouseEnter={ev=>ev.currentTarget.style.background=T.bg4} onMouseLeave={ev=>ev.currentTarget.style.background="transparent"}>{e}</button>
                ))}
              </div>
            </div>}
          </div>
          <input value={inp} onChange={e=>{setInp(e.target.value);setTyping(!!e.target.value.trim());}} onKeyDown={e=>e.key==="Enter"&&(e.preventDefault(),send())} placeholder="メッセージ..." style={{flex:1,padding:"8px 0",border:"none",background:"transparent",color:T.txH,fontSize:14,outline:"none",fontFamily:"inherit"}}/>
          <button onClick={send} style={{width:34,height:34,borderRadius:mob?"50%":6,border:"none",background:inp.trim()?T.accent:"transparent",color:inp.trim()?"#fff":T.txD,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0}}>{I.send}</button>
        </div>
      </div>
    </div>
  );
};
