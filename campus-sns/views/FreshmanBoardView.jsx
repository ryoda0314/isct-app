import React, { useState, useMemo, useCallback } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { fT } from "../utils.jsx";
import { Av, Tag, Tx, Btn } from "../shared.jsx";
import { useCurrentUser } from "../hooks/useCurrentUser.js";
import { useFreshmanBoard } from "../hooks/useFreshmanBoard.js";
import { useFreshmanComments } from "../hooks/useFreshmanComments.js";
import { showToast } from "../hooks/useToast.js";

// ── Categories ──
const CATEGORIES=[
  {id:"course_reg",label:"履修登録",icon:I.clip,color:"#6366f1",desc:"履修の組み方、おすすめ科目、単位の取り方など"},
  {id:"circle",label:"サークル・新歓",icon:I.circle,color:"#f59e0b",desc:"サークル紹介、新歓イベント、部活情報など"},
  {id:"campus_life",label:"キャンパスライフ",icon:I.home,color:"#10b981",desc:"学食、施設、通学、生活のコツなど"},
];
const CAT_MAP=Object.fromEntries(CATEGORIES.map(c=>[c.id,c]));

// ── Role badge ──
const RoleBadge=({yr})=>{
  if(!yr) return null;
  const isSenpai=yr>=2;
  return <span style={{fontSize:10,fontWeight:600,padding:"1px 5px",borderRadius:4,
    background:isSenpai?"#3b82f618":"#10b98118",
    color:isSenpai?"#3b82f6":"#10b981",
    border:`1px solid ${isSenpai?"#3b82f630":"#10b98130"}`,
    whiteSpace:"nowrap"}}>{isSenpai?`${yr}年`:"1年"}</span>;
};

// ── Login prompt (inline) ──
const LoginPrompt=({msg,onLogin})=>(
  <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",borderRadius:10,background:T.bg3,border:`1px solid ${T.bd}`,marginTop:8}}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.txD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
    <span style={{fontSize:12,color:T.txD,flex:1}}>{msg||"ログインすると投稿・コメントできます"}</span>
    {onLogin&&<span onClick={onLogin} style={{fontSize:12,color:T.accent,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>ログイン</span>}
  </div>
);

// ── Comment section (uses real API) ──
const CommentSection=({postId,user,onCountChange,loggedIn,onLogin})=>{
  const {comments,sendComment}=useFreshmanComments(postId);
  const [txt,setTxt]=useState("");
  const send=async()=>{
    if(!loggedIn||!txt.trim()) return;
    const ok=await sendComment(txt,user);
    if(ok){
      onCountChange?.(1);
      setTxt("");
    }
  };
  return(
    <div style={{marginTop:10,borderTop:`1px solid ${T.bd}`,paddingTop:10}}>
      {comments.map(c=>(
        <div key={c.id} style={{display:"flex",gap:8,marginBottom:8,alignItems:"flex-start"}}>
          <Av u={{name:c.name,col:c.color}} sz={22}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontWeight:600,fontSize:11,color:c.color||T.txH}}>{c.name}</span>
              <span style={{fontSize:10,color:T.txD}}>{fT(c.ts)}</span>
            </div>
            <div style={{fontSize:13,color:T.tx,lineHeight:1.5}}><Tx>{c.text}</Tx></div>
          </div>
        </div>
      ))}
      {loggedIn?(
        <div style={{display:"flex",gap:6,alignItems:"center",marginTop:4}}>
          <input value={txt} onChange={e=>setTxt(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
            placeholder="返信を書く..."
            style={{flex:1,padding:"6px 10px",borderRadius:16,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:12,outline:"none",fontFamily:"inherit"}}/>
          <div onClick={send} style={{cursor:"pointer",color:txt.trim()?T.accent:T.txD,display:"flex",opacity:txt.trim()?1:.4}}>{I.send}</div>
        </div>
      ):(
        <LoginPrompt msg="ログインするとコメントできます" onLogin={onLogin}/>
      )}
    </div>
  );
};

// ── Loading spinner ──
const Spinner=()=>(
  <div style={{textAlign:"center",padding:40,color:T.txD,fontSize:13}}>読み込み中...</div>
);

// ── Main View ──
export const FreshmanBoardView=({mob,loggedIn,onLogin})=>{
  const user=useCurrentUser();
  const [cat,setCat]=useState(null); // null = top page, category id = board view
  const [searchQ,setSearchQ]=useState("");
  const [composing,setComposing]=useState(false);
  const [txt,setTxt]=useState("");
  const [newCat,setNewCat]=useState("course_reg");
  const [openPost,setOpenPost]=useState(null);
  const [sortBy,setSortBy]=useState("new");

  const {posts,loading,loadingMore,hasMore,sendPost,loadMore,toggleLike,updateCommentCount}=useFreshmanBoard(cat);

  const userId=user.moodleId||user.id;

  const handleToggleLike=useCallback((postId)=>{
    if(!loggedIn){showToast("いいねするにはログインが必要です");return;}
    toggleLike(postId,userId);
  },[userId,loggedIn,toggleLike]);

  const handleSendPost=()=>{
    if(!loggedIn||!txt.trim()) return;
    const target=cat||newCat;
    sendPost(txt,target,'discussion',user);
    setTxt("");setComposing(false);
  };

  const catCounts=useMemo(()=>{
    const counts={};
    CATEGORIES.forEach(c=>{counts[c.id]=posts.filter(p=>p.cat===c.id).length;});
    return counts;
  },[posts]);

  const filtered=useMemo(()=>{
    let result=cat?posts.filter(p=>p.cat===cat):posts;
    if(searchQ){
      const q=searchQ.toLowerCase();
      result=result.filter(p=>p.text.toLowerCase().includes(q)||(p.name||"").toLowerCase().includes(q));
    }
    const pinned=result.filter(p=>p.pinned);
    const rest=result.filter(p=>!p.pinned);
    if(sortBy==="popular") rest.sort((a,b)=>b.likes.length-a.likes.length);
    else rest.sort((a,b)=>(b.ts?.getTime?.()||0)-(a.ts?.getTime?.()||0));
    return [...pinned,...rest];
  },[posts,cat,searchQ,sortBy]);

  // ── Thread detail view ──
  const threadPost=openPost?posts.find(p=>p.id===openPost):null;
  if(threadPost){
    const c=CAT_MAP[threadPost.cat];
    const liked=threadPost.likes.includes(userId);
    const lines=threadPost.text.split("\n");
    const title=lines[0].replace(/^\*\*(.+)\*\*$/,"$1").replace(/^#+\s*/,"");
    return(
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {/* Thread header */}
        <div style={{flexShrink:0,display:"flex",alignItems:"center",gap:8,padding:"10px 16px",borderBottom:`1px solid ${T.bd}`,background:T.bg2}}>
          <div onClick={()=>setOpenPost(null)} style={{cursor:"pointer",color:T.txD,display:"flex",padding:4,borderRadius:"50%"}}
            onMouseEnter={e=>e.currentTarget.style.background=T.bg3} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{I.back}</div>
          {c&&<div style={{display:"flex",alignItems:"center",gap:4}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:c.color}}/>
            <span style={{fontSize:12,color:c.color,fontWeight:600}}>{c.label}</span>
          </div>}
          <span style={{fontSize:12,color:T.txD}}>スレッド</span>
        </div>

        <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
          {/* Thread body */}
          <div style={{padding:mob?16:24}}>
            {/* Author + meta */}
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
              <Av u={{name:threadPost.name,col:threadPost.color}} sz={40}/>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:5}}><span style={{fontWeight:600,fontSize:14,color:threadPost.color||T.txH}}>{threadPost.name}</span><RoleBadge yr={threadPost.yr}/></div>
                <div style={{fontSize:11,color:T.txD,marginTop:1}}>{fT(threadPost.ts)}</div>
              </div>
              {threadPost.pinned&&<div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:3,padding:"3px 8px",borderRadius:6,background:`${T.accent}12`,color:T.accent,fontSize:11,fontWeight:600}}>
                <span style={{display:"flex"}}>{I.pin}</span>ピン留め
              </div>}
            </div>

            {/* Tags */}
            <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
              {c&&<Tag color={c.color}>{c.label}</Tag>}
              {threadPost.type==="question"&&<Tag color="#f59e0b">質問</Tag>}
            </div>

            {/* Full text */}
            <div style={{fontSize:15,color:T.tx,lineHeight:1.75,whiteSpace:"pre-wrap"}}><Tx>{threadPost.text}</Tx></div>

            {/* Actions */}
            <div style={{display:"flex",gap:16,alignItems:"center",marginTop:16,paddingTop:12,borderTop:`1px solid ${T.bd}`}}>
              <div onClick={()=>handleToggleLike(threadPost.id)} style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer",color:liked?T.red:T.txD,fontSize:13,padding:"4px 10px",borderRadius:16,background:liked?T.red+"10":T.bg3,border:`1px solid ${liked?T.red+"30":T.bd}`}}>
                <span style={{display:"flex"}}>{I.heart}</span>
                <span>{threadPost.likes.length}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:4,color:T.txD,fontSize:13,padding:"4px 10px",borderRadius:16,background:T.bg3,border:`1px solid ${T.bd}`}}>
                <span style={{display:"flex"}}>{I.reply}</span>
                <span>{threadPost.commentCount||0} 件の返信</span>
              </div>
            </div>

            {/* Comments / replies */}
            <div style={{marginTop:16}}>
              <div style={{fontSize:13,fontWeight:600,color:T.txH,marginBottom:8}}>返信</div>
              <CommentSection postId={threadPost.id} user={user} onCountChange={delta=>updateCommentCount(threadPost.id,delta)} loggedIn={loggedIn} onLogin={onLogin}/>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Top page (category selection) ──
  if(!cat){
    const recentByCat=(catId)=>{
      const catPosts=posts.filter(p=>p.cat===catId);
      const pinned=catPosts.filter(p=>p.pinned);
      const rest=catPosts.filter(p=>!p.pinned).sort((a,b)=>(b.ts?.getTime?.()||0)-(a.ts?.getTime?.()||0));
      return [...pinned,...rest].slice(0,3);
    };
    return(
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:mob?12:20}}>
          {/* Welcome banner */}
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:mob?12:16,padding:"0 2px"}}>
            <div style={{fontSize:mob?15:17,fontWeight:700,color:T.txH}}>2026年度 新入生掲示板</div>
            <div style={{fontSize:11,color:T.txD}}>- 先輩や同期と情報交換</div>
          </div>

          {/* Category cards */}
          <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"repeat(3,1fr)",gap:mob?10:14,marginBottom:mob?14:20}}>
            {CATEGORIES.map(c=>{
              const count=catCounts[c.id]||0;
              return(
                <div key={c.id} onClick={()=>setCat(c.id)}
                  style={{borderRadius:14,border:`1px solid ${T.bd}`,background:T.bg2,cursor:"pointer",overflow:"hidden",transition:"transform .12s, box-shadow .12s"}}
                  onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow=`0 4px 16px ${c.color}15`;}}
                  onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none";}}>
                  {/* Color bar */}
                  <div style={{height:4,background:`linear-gradient(90deg, ${c.color}, ${c.color}88)`}}/>
                  <div style={{padding:mob?"14px 14px 12px":"18px 18px 14px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                      <div style={{width:36,height:36,borderRadius:10,background:`${c.color}14`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>
                        <span style={{color:c.color,display:"flex"}}>{c.icon}</span>
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:700,fontSize:14,color:T.txH}}>{c.label}</div>
                        <div style={{fontSize:11,color:T.txD,marginTop:1}}>{count}件のスレッド</div>
                      </div>
                      <span style={{color:T.txD,display:"flex"}}>{I.arr}</span>
                    </div>
                    <div style={{fontSize:12,color:T.txD,lineHeight:1.5}}>{c.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{borderBottom:`1px solid ${T.bd}`,marginBottom:mob?14:20}}/>

          {loading?<Spinner/>:<>
            {/* Recent threads per category */}
            {CATEGORIES.map(c=>{
              const recent=recentByCat(c.id);
              if(!recent.length) return null;
              return(
                <div key={c.id} style={{marginBottom:mob?16:20}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8,padding:"0 2px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <div style={{width:4,height:16,borderRadius:2,background:c.color}}/>
                      <span style={{fontWeight:700,fontSize:14,color:T.txH}}>{c.label}</span>
                      <span style={{fontSize:11,color:T.txD}}>の最新スレッド</span>
                    </div>
                    <div onClick={()=>setCat(c.id)} style={{fontSize:12,color:T.accent,cursor:"pointer",fontWeight:500,display:"flex",alignItems:"center",gap:2}}>
                      すべて見る<span style={{display:"flex"}}>{I.arr}</span>
                    </div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {recent.map(p=>{
                      const liked=p.likes.includes(userId);
                      const firstLine=p.text.split("\n")[0].replace(/^\*\*(.+)\*\*$/,"$1").slice(0,60);
                      return(
                        <div key={p.id} onClick={()=>setOpenPost(p.id)}
                          style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,border:`1px solid ${T.bd}`,background:T.bg2,cursor:"pointer",transition:"background .1s"}}
                          onMouseEnter={e=>e.currentTarget.style.background=T.bg3} onMouseLeave={e=>e.currentTarget.style.background=T.bg2}>
                          {/* Left color accent */}
                          <div style={{width:3,alignSelf:"stretch",borderRadius:2,background:p.pinned?T.accent:c.color+"60",flexShrink:0}}/>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                              {p.pinned&&<span style={{fontSize:10,color:T.accent,fontWeight:600}}>PINNED</span>}
                              {p.type==="question"&&<span style={{fontSize:10,color:"#f59e0b",fontWeight:600}}>Q</span>}
                              <span style={{fontSize:13,fontWeight:600,color:T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{firstLine}</span>
                            </div>
                            <div style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:T.txD}}>
                              <span>{p.name}</span>
                              <RoleBadge yr={p.yr}/>
                              <span>·</span>
                              <span>{fT(p.ts)}</span>
                            </div>
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0,fontSize:11,color:T.txD}}>
                            <span style={{display:"flex",alignItems:"center",gap:2,color:liked?T.red:T.txD}}><span style={{display:"flex",transform:"scale(0.75)"}}>{I.heart}</span>{p.likes.length||""}</span>
                            <span style={{display:"flex",alignItems:"center",gap:2}}><span style={{display:"flex",transform:"scale(0.75)"}}>{I.reply}</span>{p.commentCount||""}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {posts.length===0&&!loading&&(
              <div style={{textAlign:"center",padding:40,color:T.txD,fontSize:13}}>まだスレッドがありません。最初の投稿をしてみよう！</div>
            )}
          </>}
        </div>
      </div>
    );
  }

  // ── Board view (specific category) ──
  const activeCat=CAT_MAP[cat];

  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {/* Board header */}
      <div style={{flexShrink:0,borderBottom:`1px solid ${T.bd}`}}>
        {/* Category top bar */}
        <div style={{height:4,background:`linear-gradient(90deg, ${activeCat.color}, ${activeCat.color}66)`}}/>
        <div style={{padding:mob?"12px 14px":"14px 20px",display:"flex",alignItems:"center",gap:10}}>
          <div onClick={()=>{setCat(null);setSearchQ("");}} style={{cursor:"pointer",color:T.txD,display:"flex",padding:4,borderRadius:"50%"}}
            onMouseEnter={e=>e.currentTarget.style.background=T.bg3} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{I.back}</div>
          <div style={{width:34,height:34,borderRadius:10,background:`${activeCat.color}14`,display:"flex",alignItems:"center",justifyContent:"center",color:activeCat.color}}>{activeCat.icon}</div>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:15,color:T.txH}}>{activeCat.label}</div>
            <div style={{fontSize:11,color:T.txD,marginTop:1}}>{activeCat.desc}</div>
          </div>
        </div>

        {/* Category tabs */}
        <div style={{display:"flex",borderTop:`1px solid ${T.bd}`,background:T.bg2}}>
          {CATEGORIES.map(c=>{
            const active=cat===c.id;
            return <div key={c.id} onClick={()=>setCat(c.id)}
              style={{flex:1,textAlign:"center",padding:"9px 0",fontSize:12,fontWeight:active?600:400,color:active?c.color:T.txD,
                borderBottom:`2px solid ${active?c.color:"transparent"}`,cursor:"pointer",transition:"all .12s"}}>
              {c.label}
            </div>;
          })}
        </div>
      </div>

      {/* Search + sort + compose */}
      <div style={{flexShrink:0,padding:mob?"8px 12px":"10px 20px",borderBottom:`1px solid ${T.bd}`,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:4,flex:1,minWidth:120,padding:"5px 10px",borderRadius:8,background:T.bg3,border:`1px solid ${T.bd}`}}>
          <span style={{color:T.txD,display:"flex"}}>{I.search}</span>
          <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder={`${activeCat.label}を検索...`}
            style={{flex:1,border:"none",background:"transparent",color:T.txH,fontSize:12,outline:"none",fontFamily:"inherit"}}/>
          {searchQ&&<span onClick={()=>setSearchQ("")} style={{cursor:"pointer",color:T.txD,display:"flex"}}>{I.x}</span>}
        </div>
        <div style={{display:"flex",gap:2,background:T.bg3,borderRadius:8,padding:2,border:`1px solid ${T.bd}`}}>
          {[{id:"new",l:"新着"},{id:"popular",l:"人気"}].map(s=>(
            <div key={s.id} onClick={()=>setSortBy(s.id)}
              style={{padding:"4px 10px",borderRadius:6,fontSize:11,fontWeight:sortBy===s.id?600:400,cursor:"pointer",
                background:sortBy===s.id?T.bg2:"transparent",color:sortBy===s.id?T.txH:T.txD,transition:"all .1s"}}>
              {s.l}
            </div>
          ))}
        </div>
        {loggedIn?(
          <div onClick={()=>setComposing(true)} style={{display:"flex",alignItems:"center",gap:4,padding:"5px 12px",borderRadius:8,background:activeCat.color,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>
            <span style={{display:"flex"}}>{I.plus}</span>
            <span>投稿</span>
          </div>
        ):(
          <div onClick={onLogin} style={{display:"flex",alignItems:"center",gap:4,padding:"5px 12px",borderRadius:8,background:T.bg3,color:T.txD,fontSize:12,fontWeight:500,border:`1px solid ${T.bd}`,cursor:onLogin?"pointer":"default"}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
            <span>ログインで投稿</span>
          </div>
        )}
      </div>

      {/* Compose modal */}
      {composing&&<>
        <div onClick={()=>setComposing(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:998}}/>
        <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:mob?"calc(100% - 32px)":480,maxHeight:"80vh",background:T.bg2,border:`1px solid ${T.bd}`,borderRadius:16,zIndex:999,boxShadow:"0 20px 60px rgba(0,0,0,.4)",display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{padding:"14px 18px",borderBottom:`1px solid ${T.bd}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span style={{fontWeight:700,fontSize:15,color:T.txH}}>新しいスレッド</span>
            <div onClick={()=>{setComposing(false);setTxt("");}} style={{cursor:"pointer",color:T.txD,display:"flex"}}>{I.x}</div>
          </div>
          <div style={{padding:18,flex:1,overflowY:"auto"}}>
            {/* Category selector (when on top page) */}
            {!cat&&<div style={{marginBottom:12}}>
              <div style={{fontSize:12,color:T.txD,marginBottom:6,fontWeight:500}}>カテゴリ</div>
              <div style={{display:"flex",gap:6}}>
                {CATEGORIES.map(c=>(
                  <div key={c.id} onClick={()=>setNewCat(c.id)}
                    style={{flex:1,padding:"8px 6px",borderRadius:8,textAlign:"center",fontSize:12,fontWeight:600,cursor:"pointer",
                      background:newCat===c.id?`${c.color}18`:T.bg3,color:newCat===c.id?c.color:T.txD,
                      border:`1px solid ${newCat===c.id?c.color+"44":T.bd}`,transition:"all .12s"}}>
                    {c.label}
                  </div>
                ))}
              </div>
            </div>}
            <textarea value={txt} onChange={e=>setTxt(e.target.value)} placeholder="質問、情報、体験談を共有しよう..." autoFocus
              style={{width:"100%",minHeight:120,padding:12,borderRadius:10,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:14,resize:"vertical",outline:"none",fontFamily:"inherit",lineHeight:1.6}}/>
          </div>
          <div style={{padding:"12px 18px",borderTop:`1px solid ${T.bd}`,display:"flex",justifyContent:"flex-end",gap:8}}>
            <Btn onClick={()=>{setComposing(false);setTxt("");}}>キャンセル</Btn>
            <Btn on onClick={handleSendPost} style={{borderRadius:10,opacity:txt.trim()?1:.4,padding:"6px 20px"}}>投稿する</Btn>
          </div>
        </div>
      </>}

      {/* Thread list */}
      <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:mob?"8px 12px":"12px 20px"}}>
        {loading?<Spinner/>:<>
          {filtered.length===0&&(
            <div style={{textAlign:"center",padding:40,color:T.txD,fontSize:13}}>
              {searchQ?"該当するスレッドがありません":"まだスレッドがありません"}
            </div>
          )}
          {filtered.map(p=>{
            const liked=p.likes.includes(userId);
            const lines=p.text.split("\n");
            const title=lines[0].replace(/^\*\*(.+)\*\*$/,"$1").replace(/^#+\s*/,"");
            const preview=lines.slice(1).join("\n").trim().slice(0,100);
            const isPinned=p.pinned;
            const isQ=p.type==="question";
            return(
              <div key={p.id} onClick={()=>setOpenPost(p.id)}
                style={{marginBottom:8,borderRadius:12,border:`1px solid ${isPinned?T.accent+"30":T.bd}`,background:isPinned?`${T.accent}05`:T.bg2,cursor:"pointer",overflow:"hidden",transition:"transform .1s"}}
                onMouseEnter={e=>e.currentTarget.style.transform="translateY(-1px)"} onMouseLeave={e=>e.currentTarget.style.transform="none"}>
                {/* Left color stripe via border */}
                <div style={{display:"flex"}}>
                  <div style={{width:4,background:activeCat.color,flexShrink:0,borderRadius:"4px 0 0 4px"}}/>
                  <div style={{flex:1,padding:mob?"12px 12px":"14px 16px"}}>
                    {/* Top row: badges */}
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6,flexWrap:"wrap"}}>
                      {isPinned&&<span style={{fontSize:10,fontWeight:700,color:T.accent,background:`${T.accent}12`,padding:"1px 6px",borderRadius:4}}>PINNED</span>}
                      {isQ&&<span style={{fontSize:10,fontWeight:700,color:"#f59e0b",background:"#f59e0b18",padding:"1px 6px",borderRadius:4}}>質問</span>}
                    </div>

                    {/* Title */}
                    <div style={{fontWeight:600,fontSize:mob?14:15,color:T.txH,lineHeight:1.4,marginBottom:preview?4:0}}>{title}</div>

                    {/* Preview */}
                    {preview&&<div style={{fontSize:12,color:T.txD,lineHeight:1.5,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{preview}</div>}

                    {/* Meta row */}
                    <div style={{display:"flex",alignItems:"center",gap:8,marginTop:8,flexWrap:"wrap"}}>
                      <div style={{display:"flex",alignItems:"center",gap:4}}>
                        <Av u={{name:p.name,col:p.color}} sz={18}/>
                        <span style={{fontSize:11,color:T.txD,fontWeight:500}}>{p.name}</span>
                        <RoleBadge yr={p.yr}/>
                      </div>
                      <span style={{fontSize:11,color:T.txD}}>{fT(p.ts)}</span>
                      <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:10,fontSize:11,color:T.txD}}>
                        <span onClick={e=>{e.stopPropagation();handleToggleLike(p.id);}} style={{display:"flex",alignItems:"center",gap:3,cursor:"pointer",color:liked?T.red:T.txD}}>
                          <span style={{display:"flex",transform:"scale(0.8)"}}>{I.heart}</span>{p.likes.length||""}
                        </span>
                        <span style={{display:"flex",alignItems:"center",gap:3}}>
                          <span style={{display:"flex",transform:"scale(0.8)"}}>{I.reply}</span>{p.commentCount||""}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {hasMore&&!loadingMore&&(
            <div onClick={loadMore} style={{textAlign:"center",padding:12,color:T.accent,fontSize:13,cursor:"pointer",fontWeight:500}}>もっと読み込む</div>
          )}
          {loadingMore&&<Spinner/>}
        </>}
        <div style={{height:20}}/>
      </div>
    </div>
  );
};
