import React, { useState } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { tMap, fT } from "../utils.jsx";
import { Av, Tag, Tx, Btn } from "../shared.jsx";
import { useCurrentUser } from "../hooks/useCurrentUser.js";

export const FeedView=({course,dept,mob,bmarks=[],togBmark,courses=[]})=>{
  const user=useCurrentUser();
  const [txt,setTxt]=useState("");
  // Posts will come from Supabase in future; currently empty
  const fp=[];
  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{padding:mob?12:14,borderBottom:`1px solid ${T.bd}`}}>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <Av u={user} sz={mob?32:36}/>
          {mob?<div style={{flex:1,padding:"8px 12px",borderRadius:18,background:T.bg3,border:`1px solid ${T.bd}`,color:T.txD,fontSize:13}}>投稿する...</div>:
          <div style={{flex:1}}><textarea value={txt} onChange={e=>setTxt(e.target.value)} placeholder="みんなに共有しよう..." style={{width:"100%",minHeight:48,padding:10,borderRadius:8,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:14,resize:"vertical",outline:"none",fontFamily:"inherit"}}/><div style={{display:"flex",justifyContent:"space-between",marginTop:4}}><div style={{display:"flex",gap:2}}><Btn>{I.img}</Btn><Btn>{I.file}</Btn></div><Btn on style={{borderRadius:14,opacity:txt.trim()?1:.4}}>投稿</Btn></div></div>}
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
        {fp.length===0&&<div style={{textAlign:"center",padding:40,color:T.txD,fontSize:13}}>まだ投稿がありません</div>}
      </div>
    </div>
  );
};
