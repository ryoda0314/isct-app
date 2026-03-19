import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { tMap, fT } from "../utils.jsx";
import { Av, Tag, Tx, Btn, Loader } from "../shared.jsx";
import { useCurrentUser } from "../hooks/useCurrentUser.js";
import { useFeed } from "../hooks/useFeed.js";
import { useComments } from "../hooks/useComments.js";
import { useCourseMembers } from "../hooks/useCourseMembers.js";
import { showToast } from "../hooks/useToast.js";
import { isDemoMode } from "../demoMode.js";
import { DEMO_POSTS } from "../demoData.js";

const EMOJIS=["👍","❤️","😂","😢","🔥","👏"];

// Mention suggestion dropdown
const MentionSuggest=({text,cursorPos,members,onSelect})=>{
  const match=useMemo(()=>{
    if(!text||cursorPos<=0||!members.length) return null;
    const before=text.slice(0,cursorPos);
    const m=before.match(/@(\S*)$/);
    return m?{query:m[1].toLowerCase(),start:m.index,len:m[0].length}:null;
  },[text,cursorPos,members]);

  const filtered=useMemo(()=>{
    if(!match) return [];
    return members.filter(m=>m.name?.toLowerCase().includes(match.query)).slice(0,5);
  },[match,members]);

  if(!filtered.length) return null;

  return(
    <div style={{position:"absolute",left:0,right:0,bottom:"100%",zIndex:200,background:T.bg2,border:`1px solid ${T.bd}`,borderRadius:8,boxShadow:"0 4px 12px rgba(0,0,0,.3)",maxHeight:180,overflowY:"auto",marginBottom:4}}>
      {filtered.map(m=>(
        <div key={m.id} onClick={()=>onSelect(m.name,match.start,match.len)}
          style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",cursor:"pointer",fontSize:13,color:T.txH}}
          onMouseEnter={e=>e.currentTarget.style.background=T.bg3}
          onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
          <Av u={{name:m.name,col:m.col}} sz={24}/>
          <span>{m.name}</span>
        </div>
      ))}
    </div>
  );
};

// Inline comment section for a single post
const CommentSection=({postId,user,onCountChange,members})=>{
  const {comments,loading,sendComment,deleteComment}=useComments(postId);
  const [txt,setTxt]=useState("");
  const prevCount=React.useRef(0);
  const [cursor,setCursor]=useState(0);

  React.useEffect(()=>{
    if(comments.length!==prevCount.current){
      onCountChange?.(comments.length-prevCount.current);
      prevCount.current=comments.length;
    }
  },[comments.length]);

  const send=()=>{
    if(!txt.trim())return;
    sendComment(txt,user);
    setTxt("");
  };

  const insertMention=(name,start,len)=>{
    const before=txt.slice(0,start);
    const after=txt.slice(start+len);
    const newTxt=before+`@${name} `+after;
    setTxt(newTxt);
    setCursor(start+name.length+2);
  };

  return(
    <div style={{paddingLeft:44,marginTop:8,borderTop:`1px solid ${T.bd}`,paddingTop:8}}>
      {loading&&<div style={{fontSize:12,color:T.txD,padding:4}}>読み込み中...</div>}
      {comments.map(c=>{
        const isOwn=c.uid===(user.moodleId||user.id);
        return(
          <div key={c.id} style={{display:"flex",gap:8,marginBottom:8,alignItems:"flex-start"}}>
            <Av u={{name:c.name,av:c.avatar,col:c.color}} sz={24}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontWeight:600,fontSize:12,color:c.color||T.txH}}>{c.name||`User ${c.uid}`}</span>
                <span style={{fontSize:10,color:T.txD}}>{fT(c.ts)}</span>
                {isOwn&&<span onClick={()=>deleteComment(c.id)}
                  style={{cursor:"pointer",color:T.txD,fontSize:10,marginLeft:"auto",opacity:.6}}
                  onMouseEnter={e=>e.currentTarget.style.opacity=1}
                  onMouseLeave={e=>e.currentTarget.style.opacity=.6}>削除</span>}
              </div>
              <div style={{margin:0,fontSize:13,color:T.tx,lineHeight:1.5}}><Tx>{c.text}</Tx></div>
            </div>
          </div>
        );
      })}
      <div style={{display:"flex",gap:6,alignItems:"center",marginTop:4,position:"relative"}}>
        <MentionSuggest text={txt} cursorPos={cursor} members={members||[]} onSelect={insertMention}/>
        <input value={txt} onChange={e=>{setTxt(e.target.value);setCursor(e.target.selectionStart);}}
          onSelect={e=>setCursor(e.target.selectionStart)}
          onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
          placeholder="コメントを入力..."
          style={{flex:1,padding:"6px 10px",borderRadius:16,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:12,outline:"none",fontFamily:"inherit"}}/>
        <div onClick={send} style={{cursor:"pointer",color:txt.trim()?T.accent:T.txD,display:"flex",opacity:txt.trim()?1:.4}}>
          {I.send}
        </div>
      </div>
    </div>
  );
};

// Poll display/vote component
const PollView=({options,votes,userId,onVote})=>{
  const total=Object.values(votes).reduce((s,arr)=>s+(arr||[]).length,0);
  const myVote=options.find(o=>(votes[o]||[]).includes(userId));
  return(
    <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:8}}>
      {options.map(opt=>{
        const count=(votes[opt]||[]).length;
        const pct=total>0?Math.round(count/total*100):0;
        const voted=myVote===opt;
        return(
          <div key={opt} onClick={()=>onVote(opt)}
            style={{position:"relative",padding:"8px 12px",borderRadius:8,border:`1px solid ${voted?T.accent+44:T.bd}`,cursor:"pointer",overflow:"hidden",background:T.bg3}}>
            <div style={{position:"absolute",left:0,top:0,bottom:0,width:`${pct}%`,background:voted?T.accent+"22":T.txD+"11",transition:"width .3s",borderRadius:8}}/>
            <div style={{position:"relative",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:13,color:voted?T.accent:T.txH,fontWeight:voted?600:400}}>
                {voted&&"✓ "}{opt}
              </span>
              <span style={{fontSize:11,color:T.txD,fontWeight:600}}>{pct}%</span>
            </div>
          </div>
        );
      })}
      <div style={{fontSize:11,color:T.txD,textAlign:"right"}}>{total}票</div>
    </div>
  );
};

// Reaction bar
const ReactionBar=({reactions,userId,onReact,likes,onLike})=>{
  const [showPicker,setShowPicker]=useState(false);
  const liked=likes.includes(userId);
  return(
    <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap",position:"relative"}}>
      {/* Heart / like */}
      <div onClick={onLike} style={{display:"flex",alignItems:"center",gap:3,cursor:"pointer",color:liked?T.red:T.txD,fontSize:12,padding:"2px 6px",borderRadius:12,background:liked?T.red+"12":"transparent"}}>
        <span style={{display:"flex"}}>{I.heart}</span>
        {likes.length>0&&<span>{likes.length}</span>}
      </div>
      {/* Existing reactions */}
      {Object.entries(reactions).map(([emoji,uids])=>{
        const myReact=(uids||[]).includes(userId);
        return(
          <div key={emoji} onClick={()=>onReact(emoji)}
            style={{display:"flex",alignItems:"center",gap:2,cursor:"pointer",padding:"2px 6px",borderRadius:12,fontSize:12,background:myReact?T.accent+"18":"transparent",border:`1px solid ${myReact?T.accent+"44":T.bd}`}}>
            <span>{emoji}</span>
            <span style={{color:myReact?T.accent:T.txD,fontSize:11}}>{(uids||[]).length}</span>
          </div>
        );
      })}
      {/* Add reaction button */}
      <div style={{position:"relative"}}>
        <div onClick={e=>{e.stopPropagation();setShowPicker(!showPicker);}}
          style={{cursor:"pointer",color:T.txD,fontSize:14,padding:"2px 4px",borderRadius:8,display:"flex",alignItems:"center",opacity:.6}}
          onMouseEnter={e=>e.currentTarget.style.opacity=1}
          onMouseLeave={e=>e.currentTarget.style.opacity=.6}>
          +
        </div>
        {showPicker&&<div onClick={e=>e.stopPropagation()} style={{
          position:"absolute",bottom:"100%",left:0,zIndex:100,
          display:"flex",gap:2,padding:4,borderRadius:8,
          background:T.bg2,border:`1px solid ${T.bd}`,boxShadow:"0 4px 12px rgba(0,0,0,.3)",
        }}>
          {EMOJIS.map(e=>(
            <div key={e} onClick={()=>{onReact(e);setShowPicker(false);}}
              style={{cursor:"pointer",padding:4,fontSize:16,borderRadius:4}}
              onMouseEnter={ev=>ev.currentTarget.style.background=T.bg3}
              onMouseLeave={ev=>ev.currentTarget.style.background="transparent"}>
              {e}
            </div>
          ))}
        </div>}
      </div>
    </div>
  );
};

// Attachment display
const Attachments=({items})=>{
  if(!items||!items.length) return null;
  return(
    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8}}>
      {items.map((a,i)=>{
        const isImg=a.type?.startsWith("image/");
        if(isImg){
          return <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" style={{display:"block"}}>
            <img src={a.url} alt={a.name} style={{maxWidth:200,maxHeight:200,borderRadius:8,border:`1px solid ${T.bd}`,objectFit:"cover"}}/>
          </a>;
        }
        return(
          <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
            style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",borderRadius:8,border:`1px solid ${T.bd}`,background:T.bg3,textDecoration:"none",color:T.txH,fontSize:12}}>
            <span style={{display:"flex",color:T.txD}}>{I.file}</span>
            <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:120}}>{a.name}</span>
            <span style={{display:"flex",color:T.txD}}>{I.dl}</span>
          </a>
        );
      })}
    </div>
  );
};

export const FeedView=({course,dept,mob,bmarks=[],togBmark,courses=[]})=>{
  const user=useCurrentUser();
  const roomId=course?.id||`dept:${dept?.prefix}`;
  const {posts,pinnedPosts,loading,loadingMore,hasMore,sendPost,loadMore,toggleLike,deletePost,editPost,votePoll,reactPost,pinPost,updateCommentCount}=useFeed(roomId);
  const members=useCourseMembers(course?.moodleId);
  const [txt,setTxt]=useState("");
  const [type,setType]=useState("discussion");
  const [composing,setComposing]=useState(false);
  const [expandedPost,setExpandedPost]=useState(null);
  const [menuPost,setMenuPost]=useState(null);
  const [editingPost,setEditingPost]=useState(null);
  const [editText,setEditText]=useState("");
  // Poll composer
  const [pollOptions,setPollOptions]=useState(["",""]);
  // File attachments
  const [files,setFiles]=useState([]);
  const fileRef=useRef(null);
  // Search & filter
  const [searchQ,setSearchQ]=useState("");
  const [filterType,setFilterType]=useState(null);
  // User profile filter (Twitter-like)
  const [filterUser,setFilterUser]=useState(null); // {uid,name,av,col}
  const [profileTab,setProfileTab]=useState("course"); // "course" | "all"
  // Mention autocomplete cursor tracking
  const [cursor,setCursor]=useState(0);
  const tm=tMap();

  // Infinite scroll sentinel
  const sentinelRef=useRef(null);
  const scrollRef=useRef(null);
  useEffect(()=>{
    if(!sentinelRef.current) return;
    const obs=new IntersectionObserver(([entry])=>{
      if(entry.isIntersecting&&hasMore&&!loadingMore) loadMore();
    },{root:scrollRef.current,threshold:0.1});
    obs.observe(sentinelRef.current);
    return()=>obs.disconnect();
  },[hasMore,loadingMore,loadMore]);

  const userId=user.moodleId||user.id;

  // User posts: current course only (include pinned posts too)
  const courseUserPosts=useMemo(()=>{
    if(!filterUser) return [];
    const all=[...posts,...pinnedPosts];
    const result=all.filter(p=>p.uid===filterUser.uid&&p.type!=="anon").map(p=>({...p,_courseId:roomId}));
    result.sort((a,b)=>(b.ts?.getTime?b.ts.getTime():0)-(a.ts?.getTime?a.ts.getTime():0));
    return result;
  },[filterUser,posts,pinnedPosts,roomId]);

  // User posts: all courses (demo mode)
  const allUserPosts=useMemo(()=>{
    if(!filterUser||!isDemoMode()) return courseUserPosts;
    const all=Object.entries(DEMO_POSTS).flatMap(([cid,arr])=>
      arr.filter(p=>p.uid===filterUser.uid&&p.type!=="anon").map(p=>({...p,_courseId:cid}))
    );
    all.sort((a,b)=>(b.ts?.getTime?b.ts.getTime():0)-(a.ts?.getTime?a.ts.getTime():0));
    return all;
  },[filterUser,courseUserPosts]);

  // Active profile posts based on tab
  const profilePosts=useMemo(()=>{
    return profileTab==="all"?allUserPosts:courseUserPosts;
  },[profileTab,allUserPosts,courseUserPosts]);

  // Filter posts: year group + search + type + user
  const filtered=useMemo(()=>{
    if(filterUser) {
      let result=profilePosts;
      if(searchQ){
        const q=searchQ.toLowerCase();
        result=result.filter(p=>p.text.toLowerCase().includes(q)||(p.name||"").toLowerCase().includes(q));
      }
      if(filterType) result=result.filter(p=>p.type===filterType);
      return result;
    }
    const ug=user.yearGroup||null;
    let result=posts.filter(p=>!p.yearGroup||p.yearGroup===ug);
    if(searchQ){
      const q=searchQ.toLowerCase();
      result=result.filter(p=>p.text.toLowerCase().includes(q)||(p.name||"").toLowerCase().includes(q));
    }
    if(filterType) result=result.filter(p=>p.type===filterType);
    return result;
  },[posts,user.yearGroup,searchQ,filterType,filterUser,profilePosts]);

  // Also filter pinned posts
  const filteredPinned=useMemo(()=>{
    if(searchQ||filterType||filterUser) return [];
    const ug=user.yearGroup||null;
    return pinnedPosts.filter(p=>!p.yearGroup||p.yearGroup===ug);
  },[pinnedPosts,user.yearGroup,searchQ,filterType,filterUser]);

  const userPostCount=useMemo(()=>allUserPosts.length,[allUserPosts]);

  const send=()=>{
    if(!txt.trim()) return;
    const extra={};
    if(type==="poll"){
      const opts=pollOptions.map(o=>o.trim()).filter(Boolean);
      if(opts.length<2) return;
      extra.pollOptions=opts;
    }
    if(files.length>0) extra.files=files;
    sendPost(txt,type,user,extra);
    setTxt("");
    setType("discussion");
    setComposing(false);
    setPollOptions(["",""]);
    setFiles([]);
  };

  const startEdit=(p)=>{
    setEditingPost(p.id);
    setEditText(p.text);
    setMenuPost(null);
  };

  const saveEdit=(postId)=>{
    if(!editText.trim()) return;
    editPost(postId,editText.trim());
    setEditingPost(null);
    setEditText("");
  };

  const resolveUser=(p)=>{
    if(p.type==="anon") return {name:"匿名",av:"?",col:T.txD};
    if(p.name) return {name:p.name,av:p.avatar,col:p.color};
    if(p.uid===userId) return {name:user.name,av:user.av,col:user.col};
    return {name:`User ${p.uid}`,av:"?",col:"#888"};
  };

  const isOwnPost=(p)=>p.uid===userId&&p.type!=="anon";

  const addPollOption=()=>{if(pollOptions.length<6) setPollOptions([...pollOptions,""]);};
  const rmPollOption=(i)=>{if(pollOptions.length>2) setPollOptions(pollOptions.filter((_,j)=>j!==i));};
  const setPollOpt=(i,v)=>{const o=[...pollOptions];o[i]=v;setPollOptions(o);};

  const handleFiles=(e)=>{
    const f=Array.from(e.target.files||[]).slice(0,3);
    setFiles(f);
  };

  const insertMention=(name,start,len)=>{
    const before=txt.slice(0,start);
    const after=txt.slice(start+len);
    const newTxt=before+`@${name} `+after;
    setTxt(newTxt);
    setCursor(start+name.length+2);
  };

  // Render a single post
  const renderPost=(p,key)=>{
    const u=resolveUser(p);
    const ti=tm[p.type];
    const own=isOwnPost(p);
    const expanded=expandedPost===p.id;
    const isEditing=editingPost===p.id;
    const cInfo=filterUser&&profileTab==="all"&&p._courseId?courses.find(c=>c.id===p._courseId):null;
    return(
      <div key={key||p.id} style={{padding:"14px 16px",borderBottom:`1px solid ${T.bd}`}}>
        {/* Course label in profile view */}
        {cInfo&&<div style={{display:"flex",alignItems:"center",gap:4,marginBottom:6,paddingLeft:44,fontSize:11,color:cInfo.col||T.txD,fontWeight:500}}>
          <span style={{width:6,height:6,borderRadius:"50%",background:cInfo.col,flexShrink:0}}/>
          {cInfo.code} {cInfo.name}
        </div>}
        {/* Pin indicator */}
        {p.pinned&&!filterUser&&<div style={{display:"flex",alignItems:"center",gap:4,marginBottom:6,paddingLeft:44,fontSize:11,color:T.accent,fontWeight:600}}>
          <span style={{display:"flex"}}>{I.pin}</span>ピン留め
        </div>}
        {/* Header */}
        <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:6}}>
          <div onClick={()=>p.type!=="anon"&&(setFilterUser({uid:p.uid,name:u.name,av:u.av,col:u.col}),setProfileTab("course"))} style={{cursor:p.type==="anon"?"default":"pointer"}}><Av u={u} sz={34}/></div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
              <span onClick={()=>p.type!=="anon"&&(setFilterUser({uid:p.uid,name:u.name,av:u.av,col:u.col}),setProfileTab("course"))} style={{fontWeight:600,fontSize:13,color:u.col||T.txH,cursor:p.type==="anon"?"default":"pointer"}}>{u.name}</span>
              {ti&&<Tag color={ti.c}>{ti.l}</Tag>}
              {p.yearGroup&&<span style={{padding:"1px 6px",borderRadius:8,fontSize:10,fontWeight:600,background:T.accent+"18",color:T.accent,border:`1px solid ${T.accent}33`}}>{p.yearGroup}</span>}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:11,color:T.txD}}>{fT(p.ts)}</span>
              {p.editedAt&&<span style={{fontSize:10,color:T.txD,fontStyle:"italic"}}>（編集済み）</span>}
            </div>
          </div>
          {/* More menu for own posts */}
          {own&&<div style={{position:"relative"}}>
            <div onClick={e=>{e.stopPropagation();setMenuPost(menuPost===p.id?null:p.id);}}
              style={{cursor:"pointer",color:T.txD,display:"flex",padding:4}}>
              {I.more}
            </div>
            {menuPost===p.id&&<div onClick={e=>e.stopPropagation()} style={{
              position:"absolute",right:0,top:28,zIndex:100,
              background:T.bg2,border:`1px solid ${T.bd}`,borderRadius:8,
              boxShadow:"0 4px 12px rgba(0,0,0,.3)",overflow:"hidden",minWidth:100,
            }}>
              <div onClick={()=>startEdit(p)}
                style={{padding:"8px 14px",fontSize:13,color:T.txH,cursor:"pointer",whiteSpace:"nowrap"}}
                onMouseEnter={e=>e.currentTarget.style.background=T.bg3}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                編集
              </div>
              <div onClick={()=>{pinPost(p.id);setMenuPost(null);}}
                style={{padding:"8px 14px",fontSize:13,color:T.accent,cursor:"pointer",whiteSpace:"nowrap"}}
                onMouseEnter={e=>e.currentTarget.style.background=T.bg3}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                {p.pinned?"ピン解除":"ピン留め"}
              </div>
              <div onClick={()=>{deletePost(p.id);setMenuPost(null);}}
                style={{padding:"8px 14px",fontSize:13,color:T.red,cursor:"pointer",whiteSpace:"nowrap"}}
                onMouseEnter={e=>e.currentTarget.style.background=T.bg3}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                削除
              </div>
            </div>}
          </div>}
        </div>
        {/* Body */}
        <div style={{paddingLeft:44,marginBottom:8}}>
          {isEditing?(
            <div>
              <textarea value={editText} onChange={e=>setEditText(e.target.value)}
                style={{width:"100%",minHeight:48,padding:8,borderRadius:8,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:14,resize:"vertical",outline:"none",fontFamily:"inherit"}}/>
              <div style={{display:"flex",gap:6,marginTop:4}}>
                <Btn on onClick={()=>saveEdit(p.id)} style={{borderRadius:10,fontSize:12}}>保存</Btn>
                <Btn onClick={()=>{setEditingPost(null);setEditText("");}} style={{borderRadius:10,fontSize:12}}>キャンセル</Btn>
              </div>
            </div>
          ):(
            <div style={{margin:0,color:T.tx,fontSize:14,lineHeight:1.6,whiteSpace:"pre-wrap"}}><Tx>{p.text}</Tx></div>
          )}
          {/* Poll */}
          {p.type==="poll"&&p.pollOptions&&(
            <PollView options={p.pollOptions} votes={p.pollVotes||{}} userId={userId} onVote={opt=>votePoll(p.id,opt,userId)}/>
          )}
          {/* Attachments */}
          <Attachments items={p.attachments}/>
        </div>
        {/* Actions */}
        <div style={{paddingLeft:44,display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
          <ReactionBar
            reactions={p.reactions||{}}
            userId={userId}
            onReact={emoji=>reactPost(p.id,emoji,userId)}
            likes={p.likes||[]}
            onLike={()=>toggleLike(p.id,userId)}
          />
          {/* Comment toggle */}
          <div onClick={()=>setExpandedPost(expanded?null:p.id)} style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer",color:expanded?T.accent:T.txD,fontSize:12}}>
            <span style={{display:"flex"}}>{I.reply}</span>
            {(p.commentCount||0)>0&&<span>{p.commentCount}</span>}
          </div>
          {togBmark&&<div onClick={()=>togBmark(p.id)} style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer",color:bmarks.includes(p.id)?T.accent:T.txD,fontSize:12}}>
            <span style={{display:"flex"}}>{I.bmark}</span>
          </div>}
          {/* Share */}
          <div onClick={async()=>{
            const text=`${u.name}: ${p.text.slice(0,100)}${p.text.length>100?"...":""}`;
            if(navigator.share){try{await navigator.share({title:"投稿を共有",text});return;}catch{}}
            try{await navigator.clipboard.writeText(p.text);showToast("テキストをコピーしました");}catch{showToast("コピーに失敗しました");}
          }} style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer",color:T.txD,fontSize:12,opacity:.7}}
            onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.7}>
            <span style={{display:"flex"}}>{I.send}</span>
          </div>
        </div>
        {/* Comment section */}
        {expanded&&<CommentSection postId={p.id} user={user} onCountChange={delta=>updateCommentCount(p.id,delta)} members={members}/>}
      </div>
    );
  };

  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {/* Composer (hidden when viewing user profile) */}
      {!filterUser&&<div style={{padding:mob?12:14,borderBottom:`1px solid ${T.bd}`,flexShrink:0}}>
        <div style={{display:"flex",gap:8,alignItems:mob&&!composing?"center":"flex-start"}}>
          <Av u={user} sz={mob?32:36}/>
          {mob&&!composing?
            <div onClick={()=>setComposing(true)} style={{flex:1,padding:"8px 12px",borderRadius:18,background:T.bg3,border:`1px solid ${T.bd}`,color:T.txD,fontSize:13,cursor:"pointer"}}>投稿する...</div>
          :
            <div style={{flex:1,position:"relative"}}>
              <MentionSuggest text={txt} cursorPos={cursor} members={members} onSelect={insertMention}/>
              <textarea value={txt} onChange={e=>{setTxt(e.target.value);setCursor(e.target.selectionStart);}}
                onSelect={e=>setCursor(e.target.selectionStart)}
                placeholder="みんなに共有しよう..." autoFocus={mob&&composing} style={{width:"100%",minHeight:mob?60:48,padding:10,borderRadius:8,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:14,resize:"vertical",outline:"none",fontFamily:"inherit"}}/>
              {/* Poll options when type=poll */}
              {type==="poll"&&(
                <div style={{marginTop:6,display:"flex",flexDirection:"column",gap:4}}>
                  {pollOptions.map((o,i)=>(
                    <div key={i} style={{display:"flex",gap:4,alignItems:"center"}}>
                      <input value={o} onChange={e=>setPollOpt(i,e.target.value)} placeholder={`選択肢 ${i+1}`}
                        style={{flex:1,padding:"6px 10px",borderRadius:6,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:12,outline:"none",fontFamily:"inherit"}}/>
                      {pollOptions.length>2&&<span onClick={()=>rmPollOption(i)} style={{cursor:"pointer",color:T.txD,display:"flex"}}>{I.x}</span>}
                    </div>
                  ))}
                  {pollOptions.length<6&&<div onClick={addPollOption} style={{fontSize:11,color:T.accent,cursor:"pointer",paddingLeft:4}}>+ 選択肢を追加</div>}
                </div>
              )}
              {/* File previews */}
              {files.length>0&&(
                <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
                  {files.map((f,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 8px",borderRadius:6,background:T.bg3,border:`1px solid ${T.bd}`,fontSize:11,color:T.txH}}>
                      <span>{f.name}</span>
                      <span onClick={()=>setFiles(files.filter((_,j)=>j!==i))} style={{cursor:"pointer",color:T.txD,display:"flex"}}>{I.x}</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6,gap:6,flexWrap:"wrap"}}>
                <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
                  {Object.entries(tm).map(([k,v])=>
                    <div key={k} onClick={()=>setType(k)} style={{padding:"3px 8px",borderRadius:10,fontSize:11,fontWeight:600,cursor:"pointer",background:type===k?v.c+"22":"transparent",color:type===k?v.c:T.txD,border:`1px solid ${type===k?v.c+"44":T.bd}`}}>{v.l}</div>
                  )}
                  {/* Attach button */}
                  <div onClick={()=>fileRef.current?.click()} style={{cursor:"pointer",color:T.txD,display:"flex",padding:2,opacity:.7}}
                    onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.7}>
                    {I.img}
                  </div>
                  <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.txt" style={{display:"none"}} onChange={handleFiles}/>
                </div>
                <div style={{display:"flex",gap:4,alignItems:"center"}}>
                  {user.yearGroup&&<span style={{fontSize:10,color:T.txD}}>{user.yearGroup}として投稿</span>}
                  {mob&&<Btn onClick={()=>{setComposing(false);setTxt("");setFiles([]);setPollOptions(["",""]);}}>キャンセル</Btn>}
                  <Btn on onClick={send} style={{borderRadius:14,opacity:txt.trim()?1:.4}}>投稿</Btn>
                </div>
              </div>
            </div>
          }
        </div>
      </div>}

      {/* Search & filter bar (hidden in profile view) */}
      {!filterUser&&<div style={{padding:"6px 16px",borderBottom:`1px solid ${T.bd}`,display:"flex",gap:6,alignItems:"center",flexShrink:0,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:4,flex:1,minWidth:120,padding:"4px 10px",borderRadius:8,background:T.bg3,border:`1px solid ${T.bd}`}}>
          <span style={{color:T.txD,display:"flex"}}>{I.search}</span>
          <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="投稿を検索..."
            style={{flex:1,border:"none",background:"transparent",color:T.txH,fontSize:12,outline:"none",fontFamily:"inherit"}}/>
          {searchQ&&<span onClick={()=>setSearchQ("")} style={{cursor:"pointer",color:T.txD,display:"flex"}}>{I.x}</span>}
        </div>
        {Object.entries(tm).map(([k,v])=>
          <div key={k} onClick={()=>setFilterType(filterType===k?null:k)}
            style={{padding:"3px 8px",borderRadius:10,fontSize:10,fontWeight:600,cursor:"pointer",
              background:filterType===k?v.c+"22":"transparent",color:filterType===k?v.c:T.txD,
              border:`1px solid ${filterType===k?v.c+"44":"transparent"}`}}>
            {v.l}
          </div>
        )}
      </div>}

      {/* Sticky back bar for profile view */}
      {filterUser&&<div style={{flexShrink:0,display:"flex",alignItems:"center",gap:12,padding:"8px 16px",borderBottom:`1px solid ${T.bd}`,background:T.bg}}>
        <div onClick={()=>setFilterUser(null)} style={{cursor:"pointer",color:T.txH,display:"flex",padding:4,borderRadius:"50%",transition:"background .15s"}}
          onMouseEnter={e=>e.currentTarget.style.background=T.bg3} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{I.back}</div>
        <div>
          <div style={{fontWeight:700,fontSize:15,color:T.txH,lineHeight:1.2}}>{filterUser.name}</div>
          <div style={{fontSize:12,color:T.txD}}>{userPostCount}件の投稿</div>
        </div>
      </div>}

      {/* Feed list */}
      <div ref={scrollRef} style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch"}} onClick={e=>{setMenuPost(null);const tag=e.target.closest?.('.hashtag')?.dataset?.tag;if(tag)setSearchQ(`#${tag}`);}}>
        {/* Profile header (scrolls with content) */}
        {filterUser&&<div>
          <div style={{height:80,background:`linear-gradient(135deg, ${filterUser.col||T.accent}, ${filterUser.col||T.accent}88)`}}/>
          <div style={{padding:"0 16px 12px",position:"relative"}}>
            <div style={{marginTop:-32,marginBottom:8,border:`3px solid ${T.bg}`,borderRadius:"50%",width:68,height:68,display:"inline-block"}}>
              <Av u={filterUser} sz={62}/>
            </div>
            <div style={{fontWeight:700,fontSize:17,color:T.txH}}>{filterUser.name}</div>
            <div style={{fontSize:13,color:T.txD,marginTop:2}}>全{userPostCount}件の投稿</div>
          </div>
          <div style={{display:"flex",borderTop:`1px solid ${T.bd}`,borderBottom:`1px solid ${T.bd}`}}>
            {[["course","この科目"],["all","すべて"]].map(([k,l])=>{
              const active=profileTab===k;
              return <div key={k} onClick={()=>setProfileTab(k)}
                style={{flex:1,textAlign:"center",padding:"10px 0",fontSize:13,fontWeight:active?600:400,
                  color:active?T.accent:T.txD,borderBottom:`2px solid ${active?T.accent:"transparent"}`,cursor:"pointer",transition:"all .15s"}}>
                {l}{k==="course"?` (${courseUserPosts.length})`:` (${allUserPosts.length})`}
              </div>;
            })}
          </div>
        </div>}

        {loading&&<Loader msg="投稿を読み込み中" size="sm"/>}
        {!loading&&filtered.length===0&&filteredPinned.length===0&&<div style={{textAlign:"center",padding:40,color:T.txD,fontSize:13}}>{filterUser?`${filterUser.name}の投稿はありません`:searchQ||filterType?"該当する投稿がありません":"まだ投稿がありません"}</div>}

        {/* Pinned posts */}
        {filteredPinned.map(p=>renderPost(p,`pin_${p.id}`))}

        {/* Regular posts */}
        {filtered.map(p=>renderPost(p))}

        {/* Infinite scroll sentinel */}
        {hasMore&&!searchQ&&!filterType&&<div ref={sentinelRef} style={{padding:16,textAlign:"center"}}>
          {loadingMore?<Loader msg="読み込み中" size="sm"/>:<div style={{color:T.txD,fontSize:12}}>スクロールして続きを読み込む</div>}
        </div>}
      </div>
    </div>
  );
};
