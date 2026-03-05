import { useState, useEffect, useRef } from 'react';
import { T } from '../theme.js';
import { I } from '../icons.jsx';
import { Av, Loader } from '../shared.jsx';
import { fT } from '../utils.jsx';

export const FriendsView=({mob,setView,friends,pending,sent,loading,pendingCount,sendRequest,acceptRequest,rejectRequest,unfriend,searchUsers,onStartDM})=>{
  const [tab,setTab]=useState('list');
  const [searchQ,setSearchQ]=useState('');
  const [results,setResults]=useState([]);
  const [searching,setSearching]=useState(false);
  const [actionLoading,setActionLoading]=useState(null);
  const debounceRef=useRef(null);

  // Debounced search
  useEffect(()=>{
    if(tab!=='search')return;
    if(debounceRef.current)clearTimeout(debounceRef.current);
    if(!searchQ.trim()){setResults([]);return;}
    setSearching(true);
    debounceRef.current=setTimeout(async()=>{
      const r=await searchUsers(searchQ);
      setResults(r);
      setSearching(false);
    },300);
    return()=>clearTimeout(debounceRef.current);
  },[searchQ,tab,searchUsers]);

  const doAction=async(key,fn)=>{
    setActionLoading(key);
    await fn();
    setActionLoading(null);
  };

  const friendStatus=(f)=>{
    if(!f) return null;
    if(f.status==='accepted') return 'friend';
    if(f.status==='pending'&&f.isSender) return 'sent';
    if(f.status==='pending'&&!f.isSender) return 'received';
    return null;
  };

  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {/* Tabs */}
      <div style={{display:"flex",gap:0,padding:"0 16px",borderBottom:`1px solid ${T.bd}`,flexShrink:0}}>
        {[
          {id:'list',l:'友達',cnt:friends.length},
          {id:'requests',l:'申請',cnt:pendingCount},
          {id:'search',l:'検索'},
        ].map(t=>
          <button key={t.id} onClick={()=>setTab(t.id)} style={{display:"flex",alignItems:"center",gap:4,padding:"8px 14px",border:"none",borderBottom:tab===t.id?`2px solid ${T.accent}`:"2px solid transparent",background:"transparent",cursor:"pointer"}}>
            <span style={{fontSize:13,fontWeight:tab===t.id?600:400,color:tab===t.id?T.txH:T.txD}}>{t.l}</span>
            {t.cnt>0&&<span style={{fontSize:10,fontWeight:700,color:t.id==='requests'?'#fff':T.accent,background:t.id==='requests'?T.red:`${T.accent}14`,padding:"1px 6px",borderRadius:8,minWidth:16,textAlign:"center"}}>{t.cnt}</span>}
          </button>
        )}
      </div>

      {/* Friend List */}
      {tab==='list'&&<div style={{flex:1,overflowY:"auto",padding:12}}>
        {loading&&<Loader msg="読み込み中" size="sm"/>}
        {!loading&&friends.length===0&&<div style={{textAlign:"center",padding:"40px 20px"}}>
          <div style={{display:"flex",justifyContent:"center",marginBottom:8}}><span style={{color:T.txD,display:"flex"}}>{I.users}</span></div>
          <div style={{fontSize:14,fontWeight:600,color:T.txH,marginBottom:4}}>友達はまだいません</div>
          <div style={{fontSize:12,color:T.txD,lineHeight:1.5}}>「検索」タブからユーザーを探して友達申請を送りましょう</div>
          <button onClick={()=>setTab('search')} style={{marginTop:12,padding:"8px 20px",borderRadius:8,border:"none",background:T.accent,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer"}}>ユーザーを検索</button>
        </div>}
        <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:8}}>
          {friends.map(f=>{
            const u={name:f.name,av:f.avatar,col:f.color};
            return <div key={f.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,background:T.bg2,border:`1px solid ${T.bd}`}}>
              <Av u={u} sz={36}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,color:T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</div>
                {f.dept&&<div style={{fontSize:11,color:T.txD}}>{f.dept}</div>}
              </div>
              <div style={{display:"flex",gap:4}}>
                {onStartDM&&<button onClick={()=>onStartDM(f.friendId,f.name,f.avatar,f.color)} style={{padding:"5px 10px",borderRadius:7,border:`1px solid ${T.accent}30`,background:`${T.accent}10`,cursor:"pointer"}} title="DMを送る">
                  <span style={{fontSize:11,fontWeight:600,color:T.accent}}>DM</span>
                </button>}
                <button onClick={()=>doAction(`unfriend_${f.id}`,()=>unfriend(f.friendId))} disabled={actionLoading===`unfriend_${f.id}`} style={{padding:"5px 8px",borderRadius:7,border:`1px solid ${T.bd}`,background:"transparent",cursor:"pointer"}} title="フレンド解除">
                  <span style={{fontSize:11,color:T.txD}}>{I.x}</span>
                </button>
              </div>
            </div>;
          })}
        </div>
      </div>}

      {/* Requests */}
      {tab==='requests'&&<div style={{flex:1,overflowY:"auto",padding:12}}>
        {pending.length>0&&<>
          <div style={{fontSize:11,fontWeight:700,color:T.txD,marginBottom:8,letterSpacing:.3}}>受信した申請</div>
          {pending.map(p=>{
            const u={name:p.fromName,av:p.fromAvatar,col:p.fromColor};
            return <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,background:T.bg2,border:`1px solid ${T.bd}`,marginBottom:6}}>
              <Av u={u} sz={36}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,color:T.txH}}>{p.fromName}</div>
                {p.fromDept&&<div style={{fontSize:11,color:T.txD}}>{p.fromDept}</div>}
              </div>
              <div style={{display:"flex",gap:4}}>
                <button onClick={()=>doAction(`accept_${p.id}`,()=>acceptRequest(p.id))} disabled={actionLoading===`accept_${p.id}`} style={{padding:"5px 12px",borderRadius:7,border:"none",background:T.green,cursor:"pointer"}}>
                  <span style={{fontSize:12,fontWeight:600,color:"#fff"}}>承認</span>
                </button>
                <button onClick={()=>doAction(`reject_${p.id}`,()=>rejectRequest(p.id))} disabled={actionLoading===`reject_${p.id}`} style={{padding:"5px 12px",borderRadius:7,border:`1px solid ${T.bd}`,background:"transparent",cursor:"pointer"}}>
                  <span style={{fontSize:12,fontWeight:500,color:T.txD}}>拒否</span>
                </button>
              </div>
            </div>;
          })}
        </>}

        {sent.length>0&&<>
          <div style={{fontSize:11,fontWeight:700,color:T.txD,marginBottom:8,marginTop:pending.length>0?16:0,letterSpacing:.3}}>送信した申請</div>
          {sent.map(s=>{
            const u={name:s.toName,av:s.toAvatar,col:s.toColor};
            return <div key={s.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,background:T.bg2,border:`1px solid ${T.bd}`,marginBottom:6}}>
              <Av u={u} sz={36}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,color:T.txH}}>{s.toName}</div>
                {s.toDept&&<div style={{fontSize:11,color:T.txD}}>{s.toDept}</div>}
              </div>
              <span style={{fontSize:11,fontWeight:500,color:T.txD,padding:"4px 10px",borderRadius:6,background:T.bg3}}>申請中</span>
            </div>;
          })}
        </>}

        {pending.length===0&&sent.length===0&&!loading&&<div style={{textAlign:"center",padding:"40px 20px",color:T.txD,fontSize:13}}>申請はありません</div>}
      </div>}

      {/* Search */}
      {tab==='search'&&<div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{padding:"10px 12px",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"3px 3px 3px 12px",borderRadius:10,background:T.bg3,border:`1px solid ${T.bd}`}}>
            <span style={{color:T.txD,display:"flex"}}>{I.search}</span>
            <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="ユーザーを検索..." autoFocus style={{flex:1,padding:"8px 0",border:"none",background:"transparent",color:T.txH,fontSize:14,outline:"none",fontFamily:"inherit"}}/>
            {searchQ&&<button onClick={()=>{setSearchQ('');setResults([]);}} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",padding:6}}>{I.x}</button>}
          </div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"0 12px 12px"}}>
          {searching&&<Loader msg="検索中" size="sm"/>}
          {!searching&&searchQ&&results.length===0&&<div style={{textAlign:"center",padding:20,color:T.txD,fontSize:13}}>ユーザーが見つかりません</div>}
          {results.map(r=>{
            const u={name:r.name,av:r.avatar,col:r.color};
            const st=friendStatus(r.friendship);
            return <div key={r.moodleId} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,background:T.bg2,border:`1px solid ${T.bd}`,marginBottom:6}}>
              <Av u={u} sz={36}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,color:T.txH}}>{r.name}</div>
                {r.dept&&<div style={{fontSize:11,color:T.txD}}>{r.dept}</div>}
              </div>
              {st==='friend'&&<span style={{fontSize:11,fontWeight:600,color:T.green,padding:"4px 10px",borderRadius:6,background:`${T.green}14`}}>友達</span>}
              {st==='sent'&&<span style={{fontSize:11,fontWeight:500,color:T.txD,padding:"4px 10px",borderRadius:6,background:T.bg3}}>申請中</span>}
              {st==='received'&&<button onClick={()=>doAction(`accept_s_${r.moodleId}`,()=>acceptRequest(r.friendship.id))} disabled={actionLoading===`accept_s_${r.moodleId}`} style={{padding:"5px 12px",borderRadius:7,border:"none",background:T.green,cursor:"pointer"}}>
                <span style={{fontSize:12,fontWeight:600,color:"#fff"}}>承認する</span>
              </button>}
              {!st&&<button onClick={()=>doAction(`send_${r.moodleId}`,()=>sendRequest(r.moodleId))} disabled={actionLoading===`send_${r.moodleId}`} style={{padding:"5px 12px",borderRadius:7,border:"none",background:T.accent,cursor:"pointer"}}>
                <span style={{fontSize:12,fontWeight:600,color:"#fff"}}>申請する</span>
              </button>}
            </div>;
          })}
          {!searchQ&&<div style={{textAlign:"center",padding:"40px 20px"}}>
            <div style={{display:"flex",justifyContent:"center",marginBottom:8}}><span style={{color:T.txD,display:"flex"}}>{I.search}</span></div>
            <div style={{fontSize:13,color:T.txD,lineHeight:1.5}}>名前を入力してユーザーを検索</div>
          </div>}
        </div>
      </div>}
    </div>
  );
};
