import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { Tag } from "../shared.jsx";

export const MatView=({course,mob})=>{

  const files=[];
  const cats={past_exam:{l:"過去問",c:T.red},notes:{l:"ノート",c:T.green},exercise:{l:"演習",c:T.accent}};
  return(
    <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:12}}>
      <div style={{padding:16,borderRadius:8,border:`1.5px dashed ${T.bd}`,textAlign:"center",marginBottom:12}}><div style={{color:T.txD,display:"flex",justifyContent:"center",marginBottom:4}}>{I.upload}</div><div style={{color:T.txH,fontWeight:600,fontSize:13}}>ファイルをアップロード</div></div>
      {files.map((f,i)=>{const ct=cats[f.cat];return <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",borderRadius:6,background:T.bg2,border:`1px solid ${T.bd}`,marginBottom:3}}><span style={{color:T.txD,display:"flex"}}>{I.file}</span><div style={{flex:1,minWidth:0}}><div style={{color:T.txH,fontSize:13,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.n}</div><div style={{fontSize:11,color:T.txD}}>{f.by} · {f.sz}</div></div><Tag color={ct?.c}>{ct?.l}</Tag></div>;})}
      {files.length===0&&<div style={{textAlign:"center",padding:40,color:T.txD,fontSize:13}}>教材はまだありません</div>}
    </div>
  );
};
