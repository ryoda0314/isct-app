import { useState } from 'react';
import { T } from '../theme.js';
import { I } from '../icons.jsx';
import { Av, Tag, Tx } from '../shared.jsx';
import { fDS } from '../utils.jsx';
import { useCurrentUser } from '../hooks/useCurrentUser.js';

export const ReviewView=({reviews,setReviews,course,mob,courses=[]})=>{
  const user=useCurrentUser();
  const [showForm,setShowForm]=useState(false);
  const [nr,setNr]=useState({rating:4,diff:3,useful:4,text:""});
  const items=course?reviews.filter(r=>r.cid===course.id):reviews;
  const avg=items.length?(items.reduce((s,r)=>s+r.rating,0)/items.length).toFixed(1):"--";
  const submit=()=>{if(!nr.text.trim())return;setReviews(p=>[{cid:course?.id||"",uid:user.id||user.moodleId,rating:nr.rating,diff:nr.diff,useful:nr.useful,text:nr.text,ts:new Date()},...p]);setNr({rating:4,diff:3,useful:4,text:""});setShowForm(false);};
  const Stars=({v,set})=><div style={{display:"flex",gap:2}}>{[1,2,3,4,5].map(i=><span key={i} onClick={()=>set?.(i)} style={{cursor:set?"pointer":"default",color:i<=v?"#c6a236":T.txD,display:"flex"}}>{i<=v?I.starF:I.star}</span>)}</div>;
  return(
    <div style={{flex:1,overflowY:"auto",padding:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <span style={{fontWeight:700,color:T.txH,fontSize:14}}>授業レビュー{course?` — ${course.code}`:""}</span>
        {course&&<button onClick={()=>setShowForm(!showForm)} style={{padding:"6px 12px",borderRadius:8,border:"none",background:T.accent,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>レビューを書く</button>}
      </div>
      {!course&&<div style={{padding:16,borderRadius:10,background:`${T.accent}08`,border:`1px solid ${T.accent}20`,textAlign:"center",marginBottom:12}}><div style={{fontSize:28,fontWeight:700,color:T.accent}}>{avg}</div><Stars v={Math.round(parseFloat(avg)||0)}/><div style={{fontSize:11,color:T.txD,marginTop:2}}>{items.length}件のレビュー</div></div>}
      {showForm&&<div style={{padding:12,borderRadius:10,background:T.bg2,border:`1px solid ${T.bd}`,marginBottom:10}}>
        <div style={{display:"flex",gap:16,marginBottom:8,flexWrap:"wrap",fontSize:12}}>
          <div>総合<div><Stars v={nr.rating} set={v=>setNr(p=>({...p,rating:v}))}/></div></div>
          <div>難易度<div><Stars v={nr.diff} set={v=>setNr(p=>({...p,diff:v}))}/></div></div>
          <div>有用性<div><Stars v={nr.useful} set={v=>setNr(p=>({...p,useful:v}))}/></div></div>
        </div>
        <textarea value={nr.text} onChange={e=>setNr(p=>({...p,text:e.target.value}))} placeholder="授業の感想を書いてください..." style={{width:"100%",minHeight:60,padding:8,borderRadius:6,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:13,outline:"none",resize:"vertical",fontFamily:"inherit"}}/>
        <div style={{display:"flex",justifyContent:"flex-end",gap:6,marginTop:6}}>
          <button onClick={()=>setShowForm(false)} style={{padding:"6px 12px",borderRadius:6,border:`1px solid ${T.bd}`,background:"transparent",color:T.txD,fontSize:12,cursor:"pointer"}}>Cancel</button>
          <button onClick={submit} style={{padding:"6px 12px",borderRadius:6,border:"none",background:T.accent,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>投稿</button>
        </div>
      </div>}
      {items.map((r,i)=>{const co=courses.find(x=>x.id===r.cid);return(
        <div key={i} style={{padding:12,borderRadius:10,background:T.bg2,border:`1px solid ${T.bd}`,marginBottom:6}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
            {!course&&<Tag color={co?.col}>{co?.code}</Tag>}
            <span style={{fontSize:10,color:T.txD,marginLeft:"auto"}}>{fDS(r.ts)}</span>
          </div>
          <Stars v={r.rating}/>
          <div style={{margin:"6px 0 0",fontSize:13,color:T.tx,lineHeight:1.5}}><Tx>{r.text}</Tx></div>
          <div style={{display:"flex",gap:12,fontSize:11,color:T.txD,marginTop:4}}><span>難易度 {r.diff}/5</span><span>有用性 {r.useful}/5</span></div>
        </div>
      );})}
      {items.length===0&&<div style={{textAlign:"center",padding:40,color:T.txD,fontSize:13}}>レビューはまだありません</div>}
    </div>
  );
};
