import { useState } from 'react';
import { T } from '../theme.js';
import { t, formatNotif } from "../i18n.js";
import { Tx, Loader } from '../shared.jsx';
import { fT } from '../utils.jsx';
import { useNotifications } from '../hooks/useNotifications.js';

export const NotifView=({mob,pending=[],acceptRequest,rejectRequest,onRefetchFriends})=>{
  const {notifications,loading,markRead,markAll}=useNotifications();
  const [actLoading,setActLoading]=useState(null);

  const doFriendAction=async(key,fn,notifId)=>{
    setActLoading(key);
    await fn();
    if(onRefetchFriends) await onRefetchFriends();
    markRead(notifId);
    setActLoading(null);
  };

  return(
    <div style={{flex:1,overflowY:"auto",padding:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <span style={{fontWeight:700,color:T.txH,fontSize:14}}>{t("notifview.title")}</span>
        <button onClick={markAll} style={{background:"none",border:"none",color:T.accentSoft,fontSize:12,cursor:"pointer"}}>{t("notifview.markAllRead")}</button>
      </div>
      {loading&&<Loader msg={t("notifview.loading")} size="sm"/>}
      {notifications.map(n=>{
        // フレンド申請通知 かつ まだ pending（未処理）なら承認/拒否ボタンを出す
        const req=n.type==='friend_request'&&n.actorId!=null&&acceptRequest?pending.find(p=>p.fromId===n.actorId):null;
        return(
        <div key={n.id} onClick={()=>markRead(n.id)} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 12px",borderRadius:8,background:n.read?T.bg2:`${T.accent}08`,border:`1px solid ${n.read?T.bd:`${T.accent}30`}`,marginBottom:4,cursor:"pointer"}}>
          {!n.read&&<div style={{width:8,height:8,borderRadius:4,background:T.accent,flexShrink:0,marginTop:5}}/>}
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,color:T.txH}}><Tx>{formatNotif(n.text)}</Tx></div>
            <div style={{fontSize:11,color:T.txD,marginTop:2}}>{fT(n.ts)}</div>
            {req&&<div style={{display:"flex",gap:8,marginTop:8}} onClick={e=>e.stopPropagation()}>
              <button onClick={()=>doFriendAction(`ac_${n.id}`,()=>acceptRequest(req.id),n.id)} disabled={actLoading===`ac_${n.id}`}
                style={{padding:"6px 16px",borderRadius:8,border:"none",background:T.green,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",opacity:actLoading===`ac_${n.id}`?0.5:1}}>{t("friends.accept")}</button>
              <button onClick={()=>doFriendAction(`rj_${n.id}`,()=>rejectRequest(req.id),n.id)} disabled={actLoading===`rj_${n.id}`}
                style={{padding:"6px 16px",borderRadius:8,border:`1px solid ${T.bd}`,background:"transparent",color:T.txD,fontSize:12,fontWeight:500,cursor:"pointer",opacity:actLoading===`rj_${n.id}`?0.5:1}}>{t("friends.reject")}</button>
            </div>}
          </div>
        </div>
      );})}
      {!loading&&notifications.length===0&&<div style={{textAlign:"center",padding:20,color:T.txD,fontSize:13}}>{t("notifview.empty")}</div>}
    </div>
  );
};
