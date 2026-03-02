import { T } from '../theme.js';
import { Tx } from '../shared.jsx';
import { fT } from '../utils.jsx';
import { useNotifications } from '../hooks/useNotifications.js';

export const NotifView=({mob})=>{
  const {notifications,loading,markRead,markAll}=useNotifications();
  return(
    <div style={{flex:1,overflowY:"auto",padding:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <span style={{fontWeight:700,color:T.txH,fontSize:14}}>通知</span>
        <button onClick={markAll} style={{background:"none",border:"none",color:T.accentSoft,fontSize:12,cursor:"pointer"}}>すべて既読</button>
      </div>
      {loading&&<div style={{textAlign:"center",padding:20,color:T.txD,fontSize:13}}>読み込み中...</div>}
      {notifications.map(n=>(
        <div key={n.id} onClick={()=>markRead(n.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:8,background:n.read?T.bg2:`${T.accent}08`,border:`1px solid ${n.read?T.bd:`${T.accent}30`}`,marginBottom:4,cursor:"pointer"}}>
          {!n.read&&<div style={{width:8,height:8,borderRadius:4,background:T.accent,flexShrink:0}}/>}
          <div style={{flex:1}}><div style={{fontSize:13,color:T.txH}}><Tx>{n.text}</Tx></div><div style={{fontSize:11,color:T.txD}}>{fT(n.ts)}</div></div>
        </div>
      ))}
      {!loading&&notifications.length===0&&<div style={{textAlign:"center",padding:20,color:T.txD,fontSize:13}}>通知はありません</div>}
    </div>
  );
};
