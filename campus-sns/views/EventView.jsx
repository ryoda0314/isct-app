import { useState, useEffect, useCallback } from 'react';
import { T } from '../theme.js';
import { Tag, Tx } from '../shared.jsx';
import { evCat } from '../data.js';
import { fDS, fTs } from '../utils.jsx';
import { isDemoMode } from '../demoMode.js';

const RSVP_OPTS=[
  {id:"going",l:"参加",c:T.green},
  {id:"maybe",l:"検討中",c:T.orange},
  {id:"not_going",l:"不参加",c:T.txD},
];

export const EventView=({events,mob})=>{
  const [rsvps,setRsvps]=useState({}); // { eventId: "going"|"maybe"|"not_going" }

  // Fetch user's RSVPs
  useEffect(()=>{
    if(isDemoMode()){
      try{const v=localStorage.getItem("eventRsvps");if(v)setRsvps(JSON.parse(v));}catch{}
      return;
    }
    (async()=>{
      try{
        const r=await fetch('/api/events');
        if(r.ok) setRsvps(await r.json());
      }catch{}
    })();
  },[]);

  const setRsvp=useCallback(async(eventId,status)=>{
    const prev=rsvps[eventId];
    const next=prev===status?null:status; // toggle off if same
    setRsvps(p=>{
      const n={...p};
      if(next) n[eventId]=next; else delete n[eventId];
      // Persist to localStorage for demo mode
      try{localStorage.setItem("eventRsvps",JSON.stringify(n));}catch{}
      return n;
    });
    if(isDemoMode()) return;
    try{
      if(next){
        await fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event_id:eventId,status:next})});
      }else{
        await fetch('/api/events',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({event_id:eventId})});
      }
    }catch{}
  },[rsvps]);

  const sorted=[...events].sort((a,b)=>a.date-b.date);
  return(
    <div style={{flex:1,overflowY:"auto",padding:12}}>
      <div style={{fontWeight:700,color:T.txH,fontSize:14,marginBottom:10}}>イベント</div>
      {sorted.map(ev=>{const ec=evCat[ev.cat];const myRsvp=rsvps[ev.id];return(
        <div key={ev.id} style={{padding:12,borderRadius:10,background:T.bg2,border:`1px solid ${T.bd}`,marginBottom:8,borderLeft:`3px solid ${ec?.c||T.accent}`}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><Tag color={ec?.c}>{ec?.l}</Tag><span style={{fontSize:12,color:T.txD}}>{fDS(ev.date)}</span></div>
          <div style={{fontWeight:600,color:T.txH,fontSize:15}}>{ev.title}</div>
          <div style={{fontSize:12,color:T.txD,marginTop:2}}>{fTs(ev.date)}{ev.end&&`〜${fTs(ev.end)}`} · {ev.loc}</div>
          <div style={{fontSize:13,color:T.tx,marginTop:4}}><Tx>{ev.desc}</Tx></div>
          {/* RSVP buttons */}
          <div style={{display:"flex",gap:6,marginTop:8}}>
            {RSVP_OPTS.map(o=>{
              const sel=myRsvp===o.id;
              return <button key={o.id} onClick={()=>setRsvp(ev.id,o.id)}
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
