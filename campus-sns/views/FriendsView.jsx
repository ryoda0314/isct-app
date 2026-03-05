import { useState, useEffect, useRef } from 'react';
import { T } from '../theme.js';
import { I } from '../icons.jsx';
import { Av, Loader, useQRCode } from '../shared.jsx';
import { fT } from '../utils.jsx';

export const FriendsView=({mob,setView,friends,pending,sent,loading,pendingCount,sendRequest,acceptRequest,rejectRequest,unfriend,searchUsers,onStartDM,userId,lookupById})=>{
  const [tab,setTab]=useState('list');
  const [searchQ,setSearchQ]=useState('');
  const [results,setResults]=useState([]);
  const [searching,setSearching]=useState(false);
  const [actionLoading,setActionLoading]=useState(null);
  const debounceRef=useRef(null);
  const [lookupId,setLookupId]=useState('');
  const [lookupResult,setLookupResult]=useState(null);
  const [lookupLoading,setLookupLoading]=useState(false);
  const [copied,setCopied]=useState(false);
  const [scanning,setScanning]=useState(false);
  const [qrDataUrl,setQrDataUrl]=useState(null);
  const qrReady=useQRCode();
  const videoRef=useRef(null);
  const streamRef=useRef(null);
  const scanRef=useRef(null);

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

  // QR code generation
  useEffect(()=>{
    if(!qrReady||!userId||tab!=='qr')return;
    try{const qr=window.qrcode(0,'M');qr.addData(`ISCT:${userId}`);qr.make();setQrDataUrl(qr.createDataURL(8,4));}catch{}
  },[qrReady,userId,tab]);

  // Cleanup scanner on unmount
  useEffect(()=>()=>{
    if(scanRef.current)cancelAnimationFrame(scanRef.current);
    if(streamRef.current)streamRef.current.getTracks().forEach(t=>t.stop());
  },[]);

  const doLookup=async(id)=>{
    const v=id||lookupId;if(!v?.trim())return;
    setLookupLoading(true);setLookupResult(null);
    const r=await lookupById(v.trim());
    setLookupResult(r||'not_found');
    setLookupLoading(false);
  };

  const copyId=()=>{navigator.clipboard.writeText(String(userId));setCopied(true);setTimeout(()=>setCopied(false),2000);};

  const stopScan=()=>{
    if(scanRef.current)cancelAnimationFrame(scanRef.current);
    if(streamRef.current){streamRef.current.getTracks().forEach(t=>t.stop());streamRef.current=null;}
    setScanning(false);
  };

  const startScan=async()=>{
    try{
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
      streamRef.current=stream;setScanning(true);
      setTimeout(()=>{
        if(videoRef.current){videoRef.current.srcObject=stream;videoRef.current.play();}
        if(typeof BarcodeDetector!=='undefined'){
          const det=new BarcodeDetector({formats:['qr_code']});
          const tick=async()=>{
            if(!videoRef.current||!streamRef.current)return;
            try{const bs=await det.detect(videoRef.current);for(const b of bs){if(b.rawValue?.startsWith('ISCT:')){const fid=b.rawValue.slice(5);stopScan();setLookupId(fid);doLookup(fid);return;}}}catch{}
            scanRef.current=requestAnimationFrame(tick);
          };
          scanRef.current=requestAnimationFrame(tick);
        }
      },100);
    }catch{setScanning(false);}
  };

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
          {id:'qr',l:'QR/ID'},
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

      {/* QR/ID */}
      {tab==='qr'&&<div style={{flex:1,overflowY:"auto",padding:12}}>
        <div style={{maxWidth:340,margin:"0 auto"}}>
          {/* Own QR code */}
          <div style={{textAlign:"center",padding:20,background:T.bg2,borderRadius:12,border:`1px solid ${T.bd}`,marginBottom:12}}>
            <div style={{fontSize:12,fontWeight:700,color:T.txD,marginBottom:12}}>あなたのQRコード</div>
            {qrDataUrl?<div style={{display:"inline-block",padding:12,background:"#fff",borderRadius:12}}><img src={qrDataUrl} alt="QR" style={{width:180,height:180,display:"block",imageRendering:"pixelated"}}/></div>:<div style={{width:204,height:204,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"center",background:T.bg3,borderRadius:12}}><span style={{fontSize:12,color:T.txD}}>読み込み中...</span></div>}
            <div style={{marginTop:12,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              <span style={{fontSize:13,color:T.txH,fontWeight:600}}>ID: {userId}</span>
              <button onClick={copyId} style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${T.bd}`,background:copied?T.green:"transparent",color:copied?"#fff":T.txD,fontSize:11,fontWeight:600,cursor:"pointer"}}>{copied?"コピー済":"コピー"}</button>
            </div>
          </div>

          {/* QR Scanner */}
          {scanning?<div style={{marginBottom:12}}>
            <video ref={videoRef} style={{width:"100%",borderRadius:10,background:"#000"}} playsInline muted/>
            <button onClick={stopScan} style={{width:"100%",marginTop:8,padding:"10px 0",borderRadius:8,border:`1px solid ${T.bd}`,background:T.bg2,color:T.txH,fontSize:13,fontWeight:600,cursor:"pointer"}}>スキャンを停止</button>
            {typeof BarcodeDetector==='undefined'&&<div style={{fontSize:11,color:T.txD,textAlign:"center",marginTop:6}}>このブラウザはQRスキャンに対応していません。IDを手動入力してください。</div>}
          </div>:<button onClick={startScan} style={{width:"100%",marginBottom:12,padding:"12px 0",borderRadius:10,border:`1px solid ${T.accent}30`,background:`${T.accent}10`,color:T.accent,fontSize:13,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
            {I.search}<span>QRコードをスキャン</span>
          </button>}

          {/* Manual ID input */}
          <div style={{background:T.bg2,borderRadius:12,border:`1px solid ${T.bd}`,padding:16}}>
            <div style={{fontSize:12,fontWeight:700,color:T.txD,marginBottom:8}}>IDで友達追加</div>
            <div style={{display:"flex",gap:6}}>
              <input value={lookupId} onChange={e=>setLookupId(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doLookup()} placeholder="友達のIDを入力" style={{flex:1,padding:"8px 12px",borderRadius:8,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:14,outline:"none",fontFamily:"inherit"}}/>
              <button onClick={()=>doLookup()} disabled={lookupLoading||!lookupId.trim()} style={{padding:"8px 16px",borderRadius:8,border:"none",background:T.accent,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",opacity:lookupLoading||!lookupId.trim()?0.5:1}}>検索</button>
            </div>
            {lookupLoading&&<div style={{marginTop:8}}><Loader msg="検索中" size="sm"/></div>}
            {lookupResult&&lookupResult!=='not_found'&&<div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",marginTop:10,borderTop:`1px solid ${T.bd}`}}>
              <Av u={{name:lookupResult.name,av:lookupResult.avatar,col:lookupResult.color}} sz={40}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:600,color:T.txH}}>{lookupResult.name}</div>
                {lookupResult.dept&&<div style={{fontSize:11,color:T.txD}}>{lookupResult.dept}</div>}
              </div>
              {lookupResult.friendship?.status==='accepted'&&<span style={{fontSize:11,fontWeight:600,color:T.green,padding:"4px 10px",borderRadius:6,background:`${T.green}14`}}>友達</span>}
              {lookupResult.friendship?.status==='pending'&&<span style={{fontSize:11,fontWeight:500,color:T.txD,padding:"4px 10px",borderRadius:6,background:T.bg3}}>申請中</span>}
              {!lookupResult.friendship&&<button onClick={()=>doAction(`send_qr_${lookupResult.moodleId}`,()=>sendRequest(lookupResult.moodleId))} disabled={actionLoading===`send_qr_${lookupResult.moodleId}`} style={{padding:"6px 14px",borderRadius:7,border:"none",background:T.accent,cursor:"pointer"}}>
                <span style={{fontSize:12,fontWeight:600,color:"#fff"}}>申請する</span>
              </button>}
            </div>}
            {lookupResult==='not_found'&&<div style={{marginTop:8,padding:8,borderRadius:8,background:`${T.red}14`,fontSize:12,color:T.red,textAlign:"center"}}>ユーザーが見つかりません</div>}
          </div>
        </div>
      </div>}
    </div>
  );
};
