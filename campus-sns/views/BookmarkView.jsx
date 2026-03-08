import React, { useState, useEffect } from 'react';
import { T } from '../theme.js';
import { I } from '../icons.jsx';
import { fT } from '../utils.jsx';
import { Av, Tag, Tx, Loader } from '../shared.jsx';
import { tMap } from '../utils.jsx';

export const BookmarkView=({bmarks=[],mob,setView,setCid,setCh,courses=[]})=>{
  const [posts,setPosts]=useState([]);
  const [loading,setLoading]=useState(false);
  const tm=tMap();

  // Fetch bookmarked posts details
  useEffect(()=>{
    if(!bmarks.length){setPosts([]);return;}
    setLoading(true);
    (async()=>{
      try{
        const r=await fetch(`/api/bookmarks/posts`,{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({post_ids:bmarks}),
        });
        if(r.ok){
          const data=await r.json();
          setPosts(data.map(p=>({
            id:p.id,
            uid:p.moodle_user_id,
            text:p.text,
            type:p.type,
            courseId:p.course_id,
            ts:new Date(p.created_at),
            name:p.profiles?.name,
            avatar:p.profiles?.avatar,
            color:p.profiles?.color,
          })));
        }
      }catch(e){console.error('[BookmarkView fetch]',e);}
      setLoading(false);
    })();
  },[bmarks]);

  const findCourse=(cid)=>courses.find(c=>c.id===cid);

  return(
    <div style={{flex:1,overflowY:"auto",padding:12}}>
      <div style={{fontWeight:700,color:T.txH,fontSize:14,marginBottom:10}}>ブックマーク ({bmarks.length})</div>
      {loading&&<Loader msg="読み込み中" size="sm"/>}
      {!loading&&posts.length===0&&<div style={{textAlign:"center",padding:40,color:T.txD,fontSize:13}}>まだブックマークがありません</div>}
      {posts.map(p=>{
        const ti=tm[p.type];
        const course=findCourse(p.courseId);
        return(
          <div key={p.id} style={{padding:"12px 14px",borderBottom:`1px solid ${T.bd}`,cursor:"pointer"}}
            onClick={()=>{if(course){setCid(course.id);setCh("timeline");setView("course");}}}>
            <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4}}>
              <Av u={{name:p.name,av:p.avatar,col:p.color}} sz={28}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontWeight:600,fontSize:12,color:p.color||T.txH}}>{p.name||`User ${p.uid}`}</span>
                  {ti&&<Tag color={ti.c}>{ti.l}</Tag>}
                </div>
                <span style={{fontSize:10,color:T.txD}}>{fT(p.ts)}</span>
              </div>
              <span style={{display:"flex",color:T.accent}}>{I.bmark}</span>
            </div>
            <p style={{margin:0,paddingLeft:36,color:T.tx,fontSize:13,lineHeight:1.5,overflow:"hidden",textOverflow:"ellipsis",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}><Tx>{p.text}</Tx></p>
            {course&&<div style={{paddingLeft:36,marginTop:4,fontSize:11,color:T.txD}}>{course.name||course.shortname}</div>}
          </div>
        );
      })}
    </div>
  );
};
