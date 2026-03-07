import { T } from '../theme.js';

export const GradeView=({grades,att,mob,courses=[]})=>{
  return(
    <div style={{flex:1,overflowY:"auto",padding:mob?12:20}}>
      <div style={{fontWeight:700,color:T.txH,fontSize:mob?16:18,marginBottom:10}}>成績・出席</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:mob?6:8,marginBottom:16}}>
        <div style={{padding:mob?10:12,borderRadius:10,background:`${T.accent}08`,border:`1px solid ${T.accent}20`,textAlign:"center"}}><div style={{fontSize:mob?20:24,fontWeight:700,color:T.accent}}>--</div><div style={{fontSize:mob?10:11,color:T.txD}}>累積GPA</div></div>
        <div style={{padding:mob?10:12,borderRadius:10,background:`${T.green}08`,border:`1px solid ${T.green}20`,textAlign:"center"}}><div style={{fontSize:mob?20:24,fontWeight:700,color:T.green}}>{courses.length*2}</div><div style={{fontSize:mob?10:11,color:T.txD}}>今期単位</div></div>
        <div style={{padding:mob?10:12,borderRadius:10,background:`${T.orange}08`,border:`1px solid ${T.orange}20`,textAlign:"center"}}><div style={{fontSize:mob?20:24,fontWeight:700,color:T.orange}}>{courses.length}</div><div style={{fontSize:mob?10:11,color:T.txD}}>履修科目</div></div>
      </div>
      <div style={{fontWeight:700,color:T.txH,fontSize:14,marginBottom:6}}>科目別</div>
      {grades.map(g=>{const co=courses.find(c=>c.id===g.cid);const a=att[g.cid]||{};const rate=a.total?Math.round(a.attended/a.total*100):0;return(
        <div key={g.cid} style={{padding:12,borderRadius:10,background:T.bg2,border:`1px solid ${T.bd}`,marginBottom:6,borderLeft:`3px solid ${co?.col||T.txD}`}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,minWidth:0}}>
            <div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0}}><span style={{fontWeight:700,color:co?.col,fontSize:12}}>{co?.code}</span><span style={{fontSize:13,color:T.txH,fontWeight:500,marginLeft:6}}>{co?.name}</span></div>
          </div>
          <div style={{display:"flex",gap:mob?8:12,fontSize:12,color:T.txD,flexWrap:"wrap"}}>
            {g.mid!=null&&<span>中間: <strong style={{color:T.txH}}>{g.mid}</strong></span>}
            {g.asgn!=null&&<span>課題: <strong style={{color:T.txH}}>{g.asgn}</strong></span>}
            {a.total&&<span>出席: <strong style={{color:rate>=90?T.green:rate>=75?T.orange:T.red}}>{rate}%</strong> ({a.attended}/{a.total})</span>}
            {a.late>0&&<span style={{color:T.yellow}}>遅刻{a.late}</span>}
          </div>
        </div>
      );})}
      {grades.length===0&&<div style={{textAlign:"center",padding:40,color:T.txD,fontSize:13}}>成績データはまだありません</div>}
    </div>
  );
};
