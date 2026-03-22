import { T } from '../theme.js';
import { Tag, Tx } from '../shared.jsx';
import { evCat } from '../data.js';
import { fDS, fTs } from '../utils.jsx';

const RSVP_OPTS=[
  {id:"going",l:"参加",c:T.green},
  {id:"maybe",l:"検討中",c:T.orange},
  {id:"not_going",l:"不参加",c:T.txD},
];

export const EventView=({events,mob,rsvps={},onRsvp})=>{

  const sorted=[...events].sort((a,b)=>a.date-b.date);
  const multiDay=(s,e)=>e&&(s.getFullYear()!==e.getFullYear()||s.getMonth()!==e.getMonth()||s.getDate()!==e.getDate());
  return(
    <div style={{flex:1,overflowY:"auto",padding:12}}>
      <div style={{fontWeight:700,color:T.txH,fontSize:14,marginBottom:10}}>イベント</div>
      {sorted.map(ev=>{const ec=evCat[ev.cat];const myRsvp=rsvps[ev.id];const md=multiDay(ev.date,ev.end);return(
        <div key={ev.id} style={{padding:12,borderRadius:10,background:T.bg2,border:`1px solid ${T.bd}`,marginBottom:8,borderLeft:`3px solid ${ec?.c||T.accent}`}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><Tag color={ec?.c}>{ec?.l}</Tag><span style={{fontSize:12,color:T.txD}}>{fDS(ev.date)}{md&&`〜${fDS(ev.end)}`}</span></div>
          <div style={{fontWeight:600,color:T.txH,fontSize:15}}>{ev.title}</div>
          <div style={{fontSize:12,color:T.txD,marginTop:2}}>{md?`${fDS(ev.date)} ${fTs(ev.date)}〜${fDS(ev.end)} ${fTs(ev.end)}`:`${fTs(ev.date)}${ev.end?`〜${fTs(ev.end)}`:""}`} · {ev.loc}</div>
          <div style={{fontSize:13,color:T.tx,marginTop:4}}><Tx>{ev.desc}</Tx></div>
          {/* RSVP buttons */}
          <div style={{display:"flex",gap:6,marginTop:8}}>
            {RSVP_OPTS.map(o=>{
              const sel=myRsvp===o.id;
              return <button key={o.id} onClick={()=>onRsvp?.(ev.id,o.id)}
                style={{padding:"5px 14px",borderRadius:8,border:`1px solid ${sel?o.c:T.bd}`,background:sel?`${o.c}18`:"transparent",color:sel?o.c:T.txD,fontSize:12,fontWeight:sel?700:500,cursor:"pointer",transition:"all .12s"}}>
                {sel&&"✓ "}{o.l}
              </button>;
            })}
          </div>
        </div>
      );})}
    </div>
  );
};
