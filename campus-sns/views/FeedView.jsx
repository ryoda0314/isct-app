import React, { useState, useMemo } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { tMap, fT } from "../utils.jsx";
import { Av, Tag, Tx, Btn, Loader } from "../shared.jsx";
import { useCurrentUser } from "../hooks/useCurrentUser.js";
import { useFeed } from "../hooks/useFeed.js";

export const FeedView=({course,dept,mob,bmarks=[],togBmark,courses=[]})=>{
  const user=useCurrentUser();
  const roomId=course?.id||`dept:${dept?.prefix}`;
  const {posts,loading,sendPost,toggleLike}=useFeed(roomId);
  const [txt,setTxt]=useState("");
  const [type,setType]=useState("discussion");
  const [composing,setComposing]=useState(false);
  const tm=tMap();

  const filtered=useMemo(()=>{
    const ug=user.yearGroup||null;
    return posts.filter(p=>!p.yearGroup||p.yearGroup===ug);
  },[posts,user.yearGroup]);

  const send=()=>{
    if(!txt.trim())return;
    sendPost(txt,type,user);
    setTxt("");
    setType("discussion");
    setComposing(false);
  };

  const resolveUser=(p)=>{
    if(p.type==="anon") return {name:"匿名",av:"?",col:T.txD};
    if(p.name) return {name:p.name,av:p.avatar,col:p.color};
    if(p.uid===user.moodleId||p.uid===user.id) return {name:user.name,av:user.av,col:user.col};
    return {name:`User ${p.uid}`,av:"?",col:"#888"};
  };

  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {/* Composer */}
      <div style={{padding:mob?12:14,borderBottom:`1px solid ${T.bd}`,flexShrink:0}}>
        <div style={{display:"flex",gap:8,alignItems:mob&&!composing?"center":"flex-start"}}>
          <Av u={user} sz={mob?32:36}/>
          {mob&&!composing?
            <div onClick={()=>setComposing(true)} style={{flex:1,padding:"8px 12px",borderRadius:18,background:T.bg3,border:`1px solid ${T.bd}`,color:T.txD,fontSize:13,cursor:"pointer"}}>投稿する...</div>
          :
            <div style={{flex:1}}>
              <textarea value={txt} onChange={e=>setTxt(e.target.value)} placeholder="みんなに共有しよう..." autoFocus={mob&&composing} style={{width:"100%",minHeight:mob?60:48,padding:10,borderRadius:8,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:14,resize:"vertical",outline:"none",fontFamily:"inherit"}}/>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6,gap:6,flexWrap:"wrap"}}>
                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                  {Object.entries(tm).map(([k,v])=>
                    <div key={k} onClick={()=>setType(k)} style={{padding:"3px 8px",borderRadius:10,fontSize:11,fontWeight:600,cursor:"pointer",background:type===k?v.c+"22":"transparent",color:type===k?v.c:T.txD,border:`1px solid ${type===k?v.c+"44":T.bd}`}}>{v.l}</div>
                  )}
                </div>
                <div style={{display:"flex",gap:4,alignItems:"center"}}>
                  {user.yearGroup&&<span style={{fontSize:10,color:T.txD}}>{user.yearGroup}として投稿</span>}
                  {mob&&<Btn onClick={()=>{setComposing(false);setTxt("");}}>キャンセル</Btn>}
                  <Btn on onClick={send} style={{borderRadius:14,opacity:txt.trim()?1:.4}}>投稿</Btn>
                </div>
              </div>
            </div>
          }
        </div>
      </div>

      {/* Feed list */}
      <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
        {loading&&<Loader msg="投稿を読み込み中" size="sm"/>}
        {!loading&&filtered.length===0&&<div style={{textAlign:"center",padding:40,color:T.txD,fontSize:13}}>まだ投稿がありません</div>}
        {filtered.map(p=>{
          const u=resolveUser(p);
          const liked=p.likes.includes(user.moodleId)||p.likes.includes(user.id);
          const ti=tm[p.type];
          return(
            <div key={p.id} style={{padding:"14px 16px",borderBottom:`1px solid ${T.bd}`}}>
              {/* Header */}
              <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:6}}>
                <Av u={u} sz={34}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    <span style={{fontWeight:600,fontSize:13,color:u.col||T.txH}}>{u.name}</span>
                    {ti&&<Tag color={ti.c}>{ti.l}</Tag>}
                    {p.yearGroup&&<span style={{padding:"1px 6px",borderRadius:8,fontSize:10,fontWeight:600,background:T.accent+"18",color:T.accent,border:`1px solid ${T.accent}33`}}>{p.yearGroup}</span>}
                  </div>
                  <span style={{fontSize:11,color:T.txD}}>{fT(p.ts)}</span>
                </div>
              </div>
              {/* Body */}
              <div style={{paddingLeft:44,marginBottom:8}}>
                <p style={{margin:0,color:T.tx,fontSize:14,lineHeight:1.6,whiteSpace:"pre-wrap"}}><Tx>{p.text}</Tx></p>
              </div>
              {/* Actions */}
              <div style={{paddingLeft:44,display:"flex",gap:16}}>
                <div onClick={()=>toggleLike(p.id,user.moodleId||user.id)} style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer",color:liked?T.red:T.txD,fontSize:12}}>
                  <span style={{display:"flex"}}>{I.heart}</span>
                  {p.likes.length>0&&<span>{p.likes.length}</span>}
                </div>
                {togBmark&&<div onClick={()=>togBmark(p.id)} style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer",color:bmarks.includes(p.id)?T.accent:T.txD,fontSize:12}}>
                  <span style={{display:"flex"}}>{I.bmark}</span>
                </div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
