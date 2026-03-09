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
  const [inp,setInp]=useState("");
  const [menuOpen,setMenuOpen]=useState(null); // null|'actions'|'emoji'
  const [compose,setCompose]=useState(null); // null|'code'|'poll'|'announce'
  const ref=useRef(null);

  // Code block state
  const [codeLang,setCodeLang]=useState("");
  const [codeBody,setCodeBody]=useState("");
  // Poll state
  const [pollQ,setPollQ]=useState("");
  const [pollOpts,setPollOpts]=useState(["",""]);
  // Announce state
  const [announceText,setAnnounceText]=useState("");

  useEffect(()=>{ref.current?.scrollIntoView({behavior:"smooth"});},[messages.length]);

  const send=()=>{if(!inp.trim())return;sendMessage(inp,user);setInp("");setTyping(false);};
  const closeMenu=()=>setMenuOpen(null);

  const sendCode=()=>{
    const code=codeBody.trim();if(!code)return;
    const lang=codeLang.trim();
    sendMessage(`\`\`\`${lang}\n${code}\n\`\`\``,user);
    setCodeLang("");setCodeBody("");setCompose(null);
  };
  const sendPoll=()=>{
    const q=pollQ.trim();const opts=pollOpts.map(o=>o.trim()).filter(Boolean);
    if(!q||opts.length<2)return;
    sendMessage(`📊 **投票: ${q}**\n${opts.map((o,i)=>` ${i+1}. ${o}`).join("\n")}`,user);
    setPollQ("");setPollOpts(["",""]);setCompose(null);
  };
  const sendAnnounce=()=>{
    const t=announceText.trim();if(!t)return;
    sendMessage(`📢 **お知らせ**\n${t}`,user);
    setAnnounceText("");setCompose(null);
  };

  // Group consecutive messages from same user within 5 min
  const grp=[];messages.forEach((m,i)=>{const p=messages[i-1];grp.push({...m,hdr:!(p&&p.uid===m.uid&&(m.ts-p.ts)<3e5)});});

  // Resolve display info: prefer DB profile, fall back to static data
  const resolveUser=(m)=>{
    if(m.name) return {name:m.name,av:m.avatar,col:m.color};
    if(m.uid===user.moodleId||m.uid===user.id) return {name:user.name,av:user.av,col:user.col};
    return {name:`User ${m.uid}`,av:"?",col:"#888"};
  };

  const composeHeader=(icon,label,onSend,canSend)=>(
    <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderBottom:`1px solid ${T.bd}`}}>
      <span style={{color:T.accent,display:"flex"}}>{icon}</span>
      <span style={{flex:1,fontSize:13,fontWeight:600,color:T.txH}}>{label}</span>
      <button onClick={()=>setCompose(null)} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",fontSize:12,fontWeight:500}}>キャンセル</button>
      <button onClick={onSend} disabled={!canSend}
        style={{padding:"5px 14px",borderRadius:6,border:"none",background:canSend?T.accent:T.bg4,color:canSend?"#fff":T.txD,fontSize:12,fontWeight:600,cursor:canSend?"pointer":"default",transition:"all .12s"}}>送信</button>
    </div>
  );

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

      {/* ── Compose: Code Block ── */}
      {compose==='code'&&<div style={{borderTop:`1px solid ${T.bd}`,background:T.bg2}}>
        {composeHeader(I.code,"コードブロック",sendCode,!!codeBody.trim())}
        <div style={{padding:"8px 12px",display:"flex",flexDirection:"column",gap:6}}>
          <input value={codeLang} onChange={e=>setCodeLang(e.target.value)} placeholder="言語 (例: javascript, python)"
            style={{padding:"6px 10px",borderRadius:6,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:12,outline:"none",fontFamily:"inherit"}}/>
          <textarea value={codeBody} onChange={e=>setCodeBody(e.target.value)} placeholder="コードを入力..." rows={5}
            style={{padding:"8px 10px",borderRadius:6,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:13,outline:"none",fontFamily:"monospace",resize:"vertical",lineHeight:1.5}}/>
        </div>
      </div>}

      {/* ── Compose: Poll ── */}
      {compose==='poll'&&<div style={{borderTop:`1px solid ${T.bd}`,background:T.bg2}}>
        {composeHeader(I.poll,"投票を作成",sendPoll,!!pollQ.trim()&&pollOpts.filter(o=>o.trim()).length>=2)}
        <div style={{padding:"8px 12px",display:"flex",flexDirection:"column",gap:6}}>
          <input value={pollQ} onChange={e=>setPollQ(e.target.value)} placeholder="質問を入力..."
            style={{padding:"8px 10px",borderRadius:6,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:13,outline:"none",fontFamily:"inherit",fontWeight:600}}/>
          {pollOpts.map((o,i)=>(
            <div key={i} style={{display:"flex",gap:6,alignItems:"center"}}>
              <span style={{fontSize:12,color:T.txD,fontWeight:600,width:20,textAlign:"center"}}>{i+1}.</span>
              <input value={o} onChange={e=>{const a=[...pollOpts];a[i]=e.target.value;setPollOpts(a);}} placeholder={`選択肢 ${i+1}`}
                style={{flex:1,padding:"7px 10px",borderRadius:6,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:13,outline:"none",fontFamily:"inherit"}}/>
              {pollOpts.length>2&&<button onClick={()=>setPollOpts(p=>p.filter((_,j)=>j!==i))}
                style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",padding:2}}>{I.x}</button>}
            </div>
          ))}
          {pollOpts.length<6&&<button onClick={()=>setPollOpts(p=>[...p,""])}
            style={{display:"flex",alignItems:"center",gap:4,padding:"6px 10px",borderRadius:6,border:`1px dashed ${T.bd}`,background:"transparent",color:T.txD,fontSize:12,cursor:"pointer",justifyContent:"center"}}>
            <span style={{display:"flex"}}>{I.plus}</span>選択肢を追加
          </button>}
        </div>
      </div>}

      {/* ── Compose: Announce ── */}
      {compose==='announce'&&<div style={{borderTop:`1px solid ${T.bd}`,background:T.bg2}}>
        {composeHeader(I.mega,"お知らせ",sendAnnounce,!!announceText.trim())}
        <div style={{padding:"8px 12px"}}>
          <div style={{padding:"10px 12px",borderRadius:8,border:`2px solid ${T.orange||"#d4843e"}30`,background:`${T.orange||"#d4843e"}08`}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
              <span style={{fontSize:16}}>📢</span>
              <span style={{fontSize:12,fontWeight:700,color:T.orange||"#d4843e"}}>お知らせ</span>
            </div>
            <textarea value={announceText} onChange={e=>setAnnounceText(e.target.value)} placeholder="お知らせ内容を入力..." rows={3}
              style={{width:"100%",padding:0,border:"none",background:"transparent",color:T.txH,fontSize:13,outline:"none",fontFamily:"inherit",resize:"vertical",lineHeight:1.5}}/>
          </div>
        </div>
      </div>}

      {/* ── Normal input ── */}
      {!compose&&<div style={{padding:"8px 10px",borderTop:`1px solid ${T.bd}`,background:T.bg2}}>
        <div style={{display:"flex",alignItems:"center",gap:6,padding:"3px 3px 3px 12px",borderRadius:mob?20:8,background:T.bg3,border:`1px solid ${T.bd}`}}>
          <div style={{position:"relative"}}>
            <span onClick={()=>setMenuOpen(p=>p?null:'actions')} style={{color:menuOpen?T.accent:T.txD,display:"flex",cursor:"pointer",transition:"color .15s"}}>{menuOpen?I.x:I.plus}</span>
            {menuOpen==='actions'&&<div style={{position:"absolute",bottom:36,left:0,background:T.bg2,border:`1px solid ${T.bd}`,borderRadius:12,padding:6,zIndex:10,boxShadow:"0 4px 16px rgba(0,0,0,.25)",minWidth:160}}>
              {[
                {icon:I.mask,label:"絵文字",action:()=>setMenuOpen('emoji')},
                {icon:I.code,label:"コードブロック",action:()=>{closeMenu();setCompose('code');}},
                {icon:I.poll,label:"投票を作成",action:()=>{closeMenu();setCompose('poll');}},
                {icon:I.mega,label:"お知らせ",action:()=>{closeMenu();setCompose('announce');}},
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
      </div>}
    </div>
  );
};
