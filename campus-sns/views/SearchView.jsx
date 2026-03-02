import { T } from '../theme.js';
import { I } from '../icons.jsx';
import { Tag, Tx } from '../shared.jsx';

export const SearchView=({searchQ,setSearchQ,setView,setCid,setCh,mob,courses=[]})=>{
  const q=searchQ.toLowerCase();
  const matchC=q?courses.filter(c=>c.name?.includes(q)||c.code?.toLowerCase().includes(q)):[];
  return(
    <div style={{flex:1,overflowY:"auto",padding:12}}>
      <div style={{display:"flex",gap:6,marginBottom:12}}>
        <div style={{flex:1,display:"flex",alignItems:"center",gap:6,padding:"8px 12px",borderRadius:10,background:T.bg3,border:`1px solid ${T.bd}`}}>
          <span style={{color:T.txD,display:"flex"}}>{I.search}</span>
          <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="コースを検索..." autoFocus style={{flex:1,border:"none",background:"transparent",color:T.txH,fontSize:14,outline:"none",fontFamily:"inherit"}}/>
          {searchQ&&<button onClick={()=>setSearchQ("")} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex"}}>{I.x}</button>}
        </div>
      </div>
      {!q&&<div style={{textAlign:"center",padding:40,color:T.txD,fontSize:13}}>キーワードを入力してください</div>}
      {q&&matchC.length>0&&<><div style={{fontSize:12,fontWeight:700,color:T.txD,marginBottom:4}}>コース</div>{matchC.map(c=><div key={c.id} onClick={()=>{setCid(c.id);setCh("timeline");setView("course");}} style={{display:"flex",alignItems:"center",gap:8,padding:10,borderRadius:8,background:T.bg2,border:`1px solid ${T.bd}`,marginBottom:4,cursor:"pointer"}}><div style={{width:8,height:8,borderRadius:4,background:c.col}}/><span style={{fontWeight:600,color:T.txH,fontSize:13}}>{c.code}</span><span style={{fontSize:12,color:T.txD}}>{c.name}</span></div>)}</>}
      {q&&matchC.length===0&&<div style={{textAlign:"center",padding:40,color:T.txD,fontSize:13}}>「{searchQ}」に一致する結果はありません</div>}
    </div>
  );
};
