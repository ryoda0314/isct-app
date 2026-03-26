import React, { useState, useEffect, useRef } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { fTs } from "../utils.jsx";
import { Av, Tx, Loader } from "../shared.jsx";
import { useChat } from "../hooks/useChat.js";
import { useCurrentUser } from "../hooks/useCurrentUser.js";
import { useTyping } from "../hooks/useTyping.js";
import { ReportModal } from "../ReportModal.jsx";

const ChatPoll=({options,votes,userId,onVote,settings,profiles})=>{
  const multi=settings?.multi||false;
  const anon=settings?.anon||false;
  const totalVoters=new Set(Object.values(votes).flatMap(arr=>arr||[])).size;
  const totalVotes=Object.values(votes).reduce((s,arr)=>s+(arr||[]).length,0);
  const myVotes=options.filter(o=>(votes[o]||[]).includes(userId));
  const [showVoters,setShowVoters]=useState(false);
  return(
    <div style={{display:"flex",flexDirection:"column",gap:5,marginTop:6,maxWidth:320}}>
      {(multi||anon)&&<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {multi&&<span style={{fontSize:10,color:T.txD,background:T.bg4,padding:"1px 6px",borderRadius:4}}>複数選択</span>}
        {anon&&<span style={{fontSize:10,color:T.txD,background:T.bg4,padding:"1px 6px",borderRadius:4}}>匿名</span>}
      </div>}
      {options.map((opt,i)=>{
        const count=(votes[opt]||[]).length;
        const pct=totalVotes>0?Math.round(count/totalVotes*100):0;
        const voted=myVotes.includes(opt);
        return(
          <div key={i} onClick={()=>onVote(opt)}
            style={{position:"relative",padding:"7px 10px",borderRadius:8,border:`1px solid ${voted?T.accent+"44":T.bd}`,cursor:"pointer",overflow:"hidden",background:T.bg3}}>
            <div style={{position:"absolute",left:0,top:0,bottom:0,width:`${pct}%`,background:voted?T.accent+"22":T.txD+"11",transition:"width .3s",borderRadius:8}}/>
            <div style={{position:"relative",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:13,color:voted?T.accent:T.txH,fontWeight:voted?600:400}}>
                {voted&&"\u2713 "}{opt}
              </span>
              <span style={{fontSize:11,color:T.txD,fontWeight:600}}>{pct}%</span>
            </div>
          </div>
        );
      })}
      <div style={{fontSize:10,color:T.txD,textAlign:"right"}}>
        {anon?`${totalVotes}票`
          :totalVoters>0?<span onClick={()=>setShowVoters(true)} style={{cursor:"pointer",color:T.accent,fontWeight:500}}>{totalVoters}人が投票 &rsaquo;</span>
          :"0人が投票"}
      </div>
      {/* Voter modal */}
      {showVoters&&!anon&&<div onClick={()=>setShowVoters(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.bg2,borderRadius:14,width:"100%",maxWidth:320,maxHeight:"70vh",overflow:"hidden",display:"flex",flexDirection:"column"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderBottom:`1px solid ${T.bd}`}}>
            <span style={{fontSize:14,fontWeight:600,color:T.txH}}>投票者一覧</span>
            <span onClick={()=>setShowVoters(false)} style={{color:T.txD,cursor:"pointer",display:"flex"}}>{I.x}</span>
          </div>
          <div style={{overflowY:"auto",padding:"8px 0"}}>
            {options.map((opt,i)=>{
              const voters=votes[opt]||[];
              if(voters.length===0) return null;
              return(
                <div key={i} style={{padding:"8px 16px"}}>
                  <div style={{fontSize:12,fontWeight:600,color:T.txH,marginBottom:4}}>{opt} ({voters.length})</div>
                  <div style={{display:"flex",flexDirection:"column",gap:3}}>
                    {voters.map((vid,j)=>{const p=profiles?.[vid];return(
                      <div key={j} style={{display:"flex",alignItems:"center",gap:8}}>
                        <Av u={{av:p?.av,col:p?.col}} sz={22}/>
                        <span style={{fontSize:12,color:T.txH}}>{p?.name||`User ${vid}`}</span>
                      </div>
                    );})}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>}
    </div>
  );
};

export const ChatView=({course,dept,mob})=>{
  const user=useCurrentUser();
  const roomId=course?.id||`dept:${dept?.prefix}`;
  const {messages,loading,sendMessage,votePoll}=useChat(roomId);
  const {typingUsers,setTyping}=useTyping(roomId,{id:user?.moodleId||user?.id,name:user?.name});
  const [inp,setInp]=useState("");
  const [menuOpen,setMenuOpen]=useState(null); // null|'actions'|'emoji'
  const [reportTarget,setReportTarget]=useState(null);
  const [compose,setCompose]=useState(null); // null|'code'|'poll'|'announce'
  const scrollRef=useRef(null);

  // Code block state
  const [codeLang,setCodeLang]=useState("");
  const [codeBody,setCodeBody]=useState("");
  // Poll state
  const [pollQ,setPollQ]=useState("");
  const [pollOpts,setPollOpts]=useState(["",""]);
  const [pollMulti,setPollMulti]=useState(false);
  const [pollAnon,setPollAnon]=useState(false);
  // Announce state
  const [announceText,setAnnounceText]=useState("");

  useEffect(()=>{if(scrollRef.current) scrollRef.current.scrollTop=scrollRef.current.scrollHeight;},[messages.length]);

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
    const settings={};
    if(pollMulti) settings.multi=true;
    if(pollAnon) settings.anon=true;
    sendMessage(`📊 ${q}`,user,{pollOptions:opts,pollSettings:settings});
    setPollQ("");setPollOpts(["",""]);setPollMulti(false);setPollAnon(false);setCompose(null);
  };
  const sendAnnounce=()=>{
    const t=announceText.trim();if(!t)return;
    sendMessage(`📢 **お知らせ**\n${t}`,user);
    setAnnounceText("");setCompose(null);
  };

  // Group consecutive messages from same user within 5 min, with date separators
  const _dateKey=d=>`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const _dateLabel=d=>{
    const now=new Date();const t=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    const md=new Date(d.getFullYear(),d.getMonth(),d.getDate());
    const diff=Math.round((t-md)/864e5);
    if(diff===0)return"今日";if(diff===1)return"昨日";
    return `${d.getMonth()+1}月${d.getDate()}日`;
  };
  const grp=[];let lastDate="";messages.forEach((m,i)=>{
    const dk=_dateKey(m.ts);
    if(dk!==lastDate){grp.push({_dateSep:true,_dateLabel:_dateLabel(m.ts),_key:`date_${dk}`});lastDate=dk;}
    const p=messages[i-1];grp.push({...m,hdr:!(p&&p.uid===m.uid&&_dateKey(p.ts)===dk&&(m.ts-p.ts)<3e5)});
  });

  // Resolve display info: prefer DB profile, fall back to static data
  const resolveUser=(m)=>{
    if(m.name) return {name:m.name,av:m.avatar,col:m.color};
    if(m.uid===user.moodleId||m.uid===user.id) return {name:user.name,av:user.av,col:user.col};
    return {name:`User ${m.uid}`,av:"?",col:"#888"};
  };

  // Build profile map from messages for poll voter display
  const profileMap=React.useMemo(()=>{
    const map={};
    messages.forEach(m=>{
      if(m.uid&&m.name) map[m.uid]={name:m.name,av:m.avatar,col:m.color};
    });
    const uid=user?.moodleId||user?.id;
    if(uid) map[uid]={name:user.name,av:user.av,col:user.col};
    return map;
  },[messages,user]);

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
      <div ref={scrollRef} style={{flex:1,overflowY:"auto",overflowX:"hidden",WebkitOverflowScrolling:"touch",padding:"8px 0"}}>
        {loading&&<Loader msg="メッセージを読み込み中" size="sm"/>}
        {grp.map(m=>{
          if(m._dateSep) return(
            <div key={m._key} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px 4px",margin:"4px 0"}}>
              <div style={{flex:1,height:1,background:T.bd}}/>
              <span style={{fontSize:11,color:T.txD,fontWeight:500,whiteSpace:"nowrap"}}>{m._dateLabel}</span>
              <div style={{flex:1,height:1,background:T.bd}}/>
            </div>
          );
          const u=resolveUser(m);const userId=user?.moodleId||user?.id;const own=m.uid===userId;const poll=m.pollOptions?<ChatPoll options={m.pollOptions} votes={m.pollVotes||{}} userId={userId} onVote={opt=>votePoll(m.id,opt,userId)} settings={m.pollSettings} profiles={profileMap}/>:null;return(
          <div key={m.id} className="chatMsg" style={{padding:m.hdr?"5px 14px 2px":"1px 14px 1px 56px",maxWidth:"100%",overflow:"hidden"}}>
            {m.hdr?<div style={{display:"flex",gap:8}}><Av u={u} sz={32}/><div style={{flex:1,minWidth:0}}><div style={{display:"flex",alignItems:"baseline",gap:4}}><span style={{fontWeight:600,color:u?.col,fontSize:13}}>{u?.name}</span><span style={{fontSize:10,color:T.txD}}>{fTs(m.ts)}</span>{!own&&<span className="chatMsgFlag" onClick={()=>setReportTarget({type:"message",id:m.id,userId:m.uid})} style={{cursor:"pointer",color:T.txD,display:"flex",opacity:0,transition:"opacity .15s",marginLeft:2}} title="通報">{I.flag}</span>}</div><div style={{margin:"2px 0 0",color:T.tx,fontSize:14,lineHeight:1.5}}><Tx>{m.text}</Tx></div>{poll}</div></div>
            :<><div style={{margin:0,color:T.tx,fontSize:14,lineHeight:1.5}}><Tx>{m.text}</Tx></div>{poll}</>}
          </div>
        );})}

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
          <div style={{display:"flex",gap:12,paddingTop:4,borderTop:`1px solid ${T.bd}`,marginTop:2}}>
            {[{key:"multi",label:"複数選択",val:pollMulti,set:setPollMulti},{key:"anon",label:"匿名投票",val:pollAnon,set:setPollAnon}].map(s=>(
              <label key={s.key} onClick={()=>s.set(v=>!v)} style={{display:"flex",alignItems:"center",gap:5,cursor:"pointer",fontSize:12,color:T.txD,userSelect:"none"}}>
                <div style={{width:16,height:16,borderRadius:4,border:`1.5px solid ${s.val?T.accent:T.bd}`,background:s.val?T.accent:"transparent",display:"flex",alignItems:"center",justifyContent:"center",transition:"all .15s",flexShrink:0}}>
                  {s.val&&<svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5l2 2 4-4" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                {s.label}
              </label>
            ))}
          </div>
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
      {reportTarget&&<ReportModal targetType={reportTarget.type} targetId={reportTarget.id} targetUserId={reportTarget.userId} onClose={()=>setReportTarget(null)}/>}
      <style>{`.chatMsg:hover .chatMsgFlag{opacity:.5!important}.chatMsgFlag:hover{opacity:1!important}`}</style>
    </div>
  );
};
