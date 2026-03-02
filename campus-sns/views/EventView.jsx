import { T } from '../theme.js';
import { Tag, Tx } from '../shared.jsx';
import { evCat } from '../data.js';
import { fDS, fTs } from '../utils.jsx';

export const EventView=({events,mob})=>{
  const sorted=[...events].sort((a,b)=>a.date-b.date);
  return(
    <div style={{flex:1,overflowY:"auto",padding:12}}>
      <div style={{fontWeight:700,color:T.txH,fontSize:14,marginBottom:10}}>イベント</div>
      {sorted.map(ev=>{const ec=evCat[ev.cat];return(
        <div key={ev.id} style={{padding:12,borderRadius:10,background:T.bg2,border:`1px solid ${T.bd}`,marginBottom:8,borderLeft:`3px solid ${ec?.c||T.accent}`}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><Tag color={ec?.c}>{ec?.l}</Tag><span style={{fontSize:12,color:T.txD}}>{fDS(ev.date)}</span></div>
          <div style={{fontWeight:600,color:T.txH,fontSize:15}}>{ev.title}</div>
          <div style={{fontSize:12,color:T.txD,marginTop:2}}>{fTs(ev.date)}〜{fTs(ev.end)} · {ev.loc}</div>
          <div style={{fontSize:13,color:T.tx,marginTop:4}}><Tx>{ev.desc}</Tx></div>
        </div>
      );})}
    </div>
  );
};
