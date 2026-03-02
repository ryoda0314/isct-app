import { T } from '../theme.js';
import { I } from '../icons.jsx';
import { Av } from '../shared.jsx';

export const ProfileView=({mob,togTheme,dark,asgn,att,courses=[],user={}})=>{
  const done=asgn.filter(a=>a.st==="completed").length;
  const total=asgn.length;
  const attAll=Object.values(att);
  const attRate=attAll.length?Math.round(attAll.reduce((s,a)=>s+a.attended,0)/attAll.reduce((s,a)=>s+a.total,0)*100):0;
  return(
    <div style={{flex:1,overflowY:"auto",padding:mob?12:20}}>
      <div style={{textAlign:"center",padding:"20px 0 16px"}}>
        <Av u={user} sz={64} st/><div style={{fontWeight:700,color:T.txH,fontSize:18,marginTop:8}}>{user.name||"ユーザー"}</div>
        {user.dept&&<div style={{fontSize:13,color:T.txD}}>{user.dept}{user.yr?` · B${user.yr}`:""}</div>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:16}}>
        <div style={{padding:10,borderRadius:10,background:T.bg2,border:`1px solid ${T.bd}`,textAlign:"center"}}><div style={{fontSize:20,fontWeight:700,color:T.green}}>{done}/{total}</div><div style={{fontSize:11,color:T.txD}}>課題提出</div></div>
        <div style={{padding:10,borderRadius:10,background:T.bg2,border:`1px solid ${T.bd}`,textAlign:"center"}}><div style={{fontSize:20,fontWeight:700,color:T.accent}}>{attRate}%</div><div style={{fontSize:11,color:T.txD}}>出席率</div></div>
        <div style={{padding:10,borderRadius:10,background:T.bg2,border:`1px solid ${T.bd}`,textAlign:"center"}}><div style={{fontSize:20,fontWeight:700,color:T.orange}}>{courses.length}</div><div style={{fontSize:11,color:T.txD}}>履修科目</div></div>
      </div>
      <div style={{fontWeight:700,color:T.txH,fontSize:14,marginBottom:8}}>設定</div>
      <div onClick={togTheme} style={{display:"flex",alignItems:"center",gap:10,padding:12,borderRadius:10,background:T.bg2,border:`1px solid ${T.bd}`,marginBottom:6,cursor:"pointer"}}>
        <span style={{color:T.txD,display:"flex"}}>{dark?I.moon:I.sun}</span>
        <span style={{flex:1,fontSize:14,color:T.txH}}>テーマ</span>
        <span style={{fontSize:12,color:T.accentSoft}}>{dark?"ダーク":"ライト"}</span>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:12,borderRadius:10,background:T.bg2,border:`1px solid ${T.bd}`,marginBottom:6}}>
        <span style={{color:T.txD,display:"flex"}}>{I.bell}</span><span style={{flex:1,fontSize:14,color:T.txH}}>通知設定</span><span style={{fontSize:12,color:T.txD}}>ON</span>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:12,borderRadius:10,background:T.bg2,border:`1px solid ${T.bd}`,marginBottom:6}}>
        <span style={{color:T.txD,display:"flex"}}>{I.setting}</span><span style={{flex:1,fontSize:14,color:T.txH}}>アカウント設定</span>
      </div>
    </div>
  );
};
