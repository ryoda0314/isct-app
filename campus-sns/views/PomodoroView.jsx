import { useEffect } from 'react';
import { T } from '../theme.js';
import { I } from '../icons.jsx';

export const PomodoroView=({pomo,setPomo,mob})=>{
  useEffect(()=>{if(!pomo.running)return;const iv=setInterval(()=>{setPomo(p=>{if(p.sec<=1){const next=p.mode==="work"?"break":"work";return{...p,sec:next==="work"?25*60:5*60,mode:next,running:false,sessions:next==="break"?p.sessions+1:p.sessions};}return{...p,sec:p.sec-1};});},1000);return()=>clearInterval(iv);},[pomo.running]);
  const mm=String(Math.floor(pomo.sec/60)).padStart(2,"0"),ss=String(pomo.sec%60).padStart(2,"0");
  const pct=pomo.mode==="work"?((25*60-pomo.sec)/(25*60))*100:((5*60-pomo.sec)/(5*60))*100;
  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{fontSize:14,fontWeight:600,color:pomo.mode==="work"?T.accent:T.green,marginBottom:16}}>{pomo.mode==="work"?"集中タイム":"休憩"}</div>
      <div style={{position:"relative",width:180,height:180,marginBottom:20}}>
        <svg width="180" height="180" viewBox="0 0 180 180"><circle cx="90" cy="90" r="80" fill="none" stroke={T.bg3} strokeWidth="8"/><circle cx="90" cy="90" r="80" fill="none" stroke={pomo.mode==="work"?T.accent:T.green} strokeWidth="8" strokeDasharray={`${2*Math.PI*80}`} strokeDashoffset={`${2*Math.PI*80*(1-pct/100)}`} strokeLinecap="round" transform="rotate(-90 90 90)" style={{transition:"stroke-dashoffset .5s"}}/></svg>
        <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:42,fontWeight:700,color:T.txH,fontVariantNumeric:"tabular-nums"}}>{mm}:{ss}</span></div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={()=>setPomo(p=>({...p,running:!p.running}))} style={{width:52,height:52,borderRadius:"50%",border:"none",background:pomo.running?T.red:T.accent,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>{pomo.running?I.pause:I.play}</button>
        <button onClick={()=>setPomo({running:false,sec:25*60,mode:"work",sessions:pomo.sessions})} style={{width:52,height:52,borderRadius:"50%",border:`1px solid ${T.bd}`,background:T.bg3,color:T.txD,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>{I.reset}</button>
      </div>
      <div style={{marginTop:20,fontSize:13,color:T.txD}}>完了セッション: <strong style={{color:T.txH}}>{pomo.sessions}</strong></div>
    </div>
  );
};
