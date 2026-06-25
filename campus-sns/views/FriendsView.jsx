import { useState, useEffect, useRef } from 'react';
import { T } from '../theme.js';
import { t } from "../i18n.js";
import { I } from '../icons.jsx';
import { Av, Loader, useQRCode } from '../shared.jsx';
import { SocialGraphView } from './SocialGraphView.jsx';
import { QRScanner } from '../components/QRScanner.jsx';

export const FriendsView=({mob,setView,friends,pending,sent,loading,pendingCount,sendRequest,acceptRequest,rejectRequest,unfriend,searchUsers,onStartDM,userId,lookupById,fetchGraph,fetchRecommendations,openProfile,isAdmin,groups=[],createGroup,leaveGroup,onOpenGroup,blockUser,unblockUser,isBlocked,blocks=[],muteUser,unmuteUser,isMuted,mutes=[],refetch})=>{
  const [mode,setMode]=useState('list'); // 'list' | 'graph'
  const [graphScope,setGraphScope]=useState('ego'); // 'ego' | 'all'（学内全体は管理者のみ）
  const [recs,setRecs]=useState([]);
  const [recsLoading,setRecsLoading]=useState(false);
  const [recsLoaded,setRecsLoaded]=useState(false);
  const [sentRecs,setSentRecs]=useState(()=>new Set());
  const [addOpen,setAddOpen]=useState(false);
  const [addTab,setAddTab]=useState('requests');
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
  const [filter,setFilter]=useState('');
  const [actionFor,setActionFor]=useState(null); // friend whose action sheet is open
  const [topMenu,setTopMenu]=useState(false); // top-bar "+" dropdown

  // Group creation state
  const [grpOpen,setGrpOpen]=useState(false);
  const [grpName,setGrpName]=useState('');
  const [grpSel,setGrpSel]=useState(new Set());
  const [grpCreating,setGrpCreating]=useState(false);

  useEffect(()=>{
    if(!addOpen||addTab!=='search')return;
    if(debounceRef.current)clearTimeout(debounceRef.current);
    if(!searchQ.trim()){setResults([]);return;}
    setSearching(true);
    debounceRef.current=setTimeout(async()=>{
      const r=await searchUsers(searchQ);
      setResults(r);
      setSearching(false);
    },300);
    return()=>clearTimeout(debounceRef.current);
  },[searchQ,addTab,addOpen,searchUsers]);

  // Lazy-load "people you may know" when the search tab opens
  useEffect(()=>{
    if(!addOpen||addTab!=='search'||recsLoaded||!fetchRecommendations)return;
    setRecsLoading(true);
    fetchRecommendations().then(r=>{setRecs(r||[]);setRecsLoaded(true);setRecsLoading(false);}).catch(()=>{setRecsLoaded(true);setRecsLoading(false);});
  },[addOpen,addTab,recsLoaded,fetchRecommendations]);

  useEffect(()=>{
    if(!qrReady||!userId||!addOpen||addTab!=='qr')return;
    try{const qr=window.qrcode(0,'M');qr.addData(`ISCT:${userId}`);qr.make();setQrDataUrl(qr.createDataURL(8,4));}catch{}
  },[qrReady,userId,addTab,addOpen]);

  // Each tab starts clean: close the scanner when leaving QR, clear any lookup result on tab switch
  useEffect(()=>{
    if(addTab!=='qr')setScanning(false);
    setLookupResult(null);
  },[addTab]);

  const doLookup=async(id)=>{
    const v=id||lookupId;if(!v?.trim())return;
    setLookupLoading(true);setLookupResult(null);
    const r=await lookupById(v.trim());
    setLookupResult(r||'not_found');
    setLookupLoading(false);
  };
  const copyId=()=>{navigator.clipboard.writeText(String(userId));setCopied(true);setTimeout(()=>setCopied(false),2000);};
  // Handle a decoded QR string. Returns true if it was a valid ISCT friend code.
  const handleScannedQr=(raw)=>{
    if(typeof raw!=='string'||!raw.startsWith('ISCT:'))return false;
    const fid=raw.slice(5).trim();
    if(!fid)return false;
    setScanning(false);
    setLookupId(fid);
    doLookup(fid);
    return true;
  };
  const doAction=async(key,fn)=>{setActionLoading(key);await fn();if(refetch)await refetch();setActionLoading(null);};
  const friendStatus=(f)=>{
    if(!f)return null;
    if(f.status==='accepted')return 'friend';
    if(f.status==='pending'&&f.isSender)return 'sent';
    if(f.status==='pending'&&!f.isSender)return 'received';
    return null;
  };
  const Mutual=({n})=>n>0?<div style={{fontSize:11,color:T.accentSoft,fontWeight:500,display:"flex",alignItems:"center",gap:3}}>
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
    {t("friends.mutual",{n})}</div>:null;

  const filtered=filter?friends.filter(f=>f.name?.toLowerCase().includes(filter.toLowerCase())):friends;
  const filteredGroups=filter?groups.filter(g=>g.name?.toLowerCase().includes(filter.toLowerCase())):groups;

  const handleCreateGroup=async()=>{
    if(!grpName.trim()||grpSel.size===0||!createGroup)return;
    setGrpCreating(true);
    await createGroup(grpName.trim(),[...grpSel]);
    setGrpCreating(false);
    setGrpOpen(false);
    setGrpName('');
    setGrpSel(new Set());
  };

  const toggleGrpMember=(id)=>setGrpSel(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});

  /* ── Group avatar (stacked member avatars) ── */
  const GroupAv=({g,sz=44})=>{
    const m=g.members||[];
    if(m.length<=1)return <div style={{width:sz,height:sz,borderRadius:sz*.3,background:g.color||T.accent,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{color:"#fff",fontWeight:700,fontSize:sz*.36}}>{g.avatar||g.name?.[0]||'G'}</span></div>;
    const show=m.slice(0,4);
    const half=sz*.52;
    return <div style={{width:sz,height:sz,position:"relative",flexShrink:0}}>
      {show.map((u,i)=>{
        const row=Math.floor(i/2),col=i%2;
        return <div key={u.id} style={{position:"absolute",top:row*(sz-half),left:col*(sz-half),width:half,height:half,borderRadius:half*.4,
          background:u.color||T.accent,display:"flex",alignItems:"center",justifyContent:"center",border:`1.5px solid ${T.bg}`,zIndex:4-i}}>
          <span style={{color:"#fff",fontWeight:700,fontSize:half*.4}}>{u.avatar||u.name?.[0]||'?'}</span>
        </div>;
      })}
    </div>;
  };

  /* ── Shared modal wrapper ── */
  const addTabs=[{id:'requests',label:t("friends.tabRequests"),cnt:pendingCount},{id:'search',label:t("friends.tabSearch"),cnt:undefined},{id:'qr',label:t("friends.tabQr")},{id:'id',label:t("friends.tabId")}];

  const ModalWrap=({children,onClose})=>(
    <>
      <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:100,animation:"fdIn .15s ease"}}/>
      <div style={{position:"fixed",bottom:0,left:0,right:0,maxHeight:"75vh",background:T.bg2,borderRadius:"16px 16px 0 0",zIndex:101,display:"flex",flexDirection:"column",animation:"slideUp .25s ease",
        ...(mob?{}:{left:"50%",right:"auto",bottom:"auto",top:"50%",transform:"translate(-50%,-50%)",width:420,maxHeight:"70vh",borderRadius:16})}}>
        <style>{`@keyframes fdIn{from{opacity:0}to{opacity:1}}@keyframes slideUp{from{transform:${mob?"translateY(100%)":"translate(-50%,-40%)"};opacity:${mob?1:0}}to{transform:${mob?"translateY(0)":"translate(-50%,-50%)"};opacity:1}}`}</style>
        {mob&&<div style={{width:36,height:4,borderRadius:2,background:T.bg4,margin:"12px auto 0"}}/>}
        {children}
      </div>
    </>
  );

  const AddModal=()=>ModalWrap({onClose:()=>{setAddOpen(false);setScanning(false);},children:(<>
      <div style={{padding:"12px 16px 0",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <span style={{fontSize:16,fontWeight:700,color:T.txH}}>{t("friends.addFriend")}</span>
          <button onClick={()=>{setAddOpen(false);setScanning(false);}} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",padding:4}}>{I.x}</button>
        </div>
        <div style={{display:"flex",gap:0,borderBottom:`1px solid ${T.bd}`}}>
          {addTabs.map(t=>{const active=addTab===t.id;return <button key={t.id} onClick={()=>setAddTab(t.id)} style={{flex:1,padding:"8px 0",border:"none",background:"transparent",cursor:"pointer",borderBottom:active?`2px solid ${T.accent}`:"2px solid transparent",display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
            <span style={{fontSize:13,fontWeight:active?600:400,color:active?T.txH:T.txD}}>{t.label}</span>
            {t.cnt>0&&<span style={{fontSize:9,fontWeight:700,minWidth:16,height:16,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 4px",color:"#fff",background:T.red}}>{t.cnt}</span>}
          </button>;})}
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
        {addTab==='requests'&&<div style={{padding:"8px 0"}}>
          {pending.length>0&&<><div style={{padding:"4px 16px 4px",fontSize:11,fontWeight:600,color:T.txD,letterSpacing:.3}}>{t("friends.received")} {pending.length}</div>
            {pending.map(p=>{const u={name:p.fromName,av:p.fromAvatar,col:p.fromColor};return <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 16px"}}>
              <Av u={u} sz={40} uid={p.fromId}/><div style={{flex:1,minWidth:0}}><div style={{fontSize:14,fontWeight:600,color:T.txH}}>{p.fromName}</div>{p.fromDept&&<div style={{fontSize:11,color:T.txD}}>{p.fromDept}</div>}<Mutual n={p.mutual}/></div>
              <div style={{display:"flex",gap:6}}><button onClick={()=>doAction(`accept_${p.id}`,()=>acceptRequest(p.id))} disabled={actionLoading===`accept_${p.id}`} style={{padding:"6px 14px",borderRadius:8,border:"none",background:T.green,cursor:"pointer",fontSize:12,fontWeight:600,color:"#fff"}}>{t("friends.accept")}</button>
              <button onClick={()=>doAction(`reject_${p.id}`,()=>rejectRequest(p.id))} disabled={actionLoading===`reject_${p.id}`} style={{padding:"6px 14px",borderRadius:8,border:`1px solid ${T.bd}`,background:"transparent",cursor:"pointer",fontSize:12,fontWeight:500,color:T.txD}}>{t("friends.reject")}</button></div>
            </div>;})}
          </>}
          {sent.length>0&&<><div style={{padding:`${pending.length>0?12:4}px 16px 4px`,fontSize:11,fontWeight:600,color:T.txD,letterSpacing:.3}}>{t("friends.sent")} {sent.length}</div>
            {sent.map(s=>{const u={name:s.toName,av:s.toAvatar,col:s.toColor};return <div key={s.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 16px"}}>
              <Av u={u} sz={40} uid={s.toId}/><div style={{flex:1,minWidth:0}}><div style={{fontSize:14,fontWeight:600,color:T.txH}}>{s.toName}</div>{s.toDept&&<div style={{fontSize:11,color:T.txD}}>{s.toDept}</div>}</div>
              <span style={{fontSize:11,fontWeight:600,color:T.txD,padding:"4px 10px",borderRadius:6,background:T.bg3}}>{t("friends.requesting")}</span>
            </div>;})}
          </>}
          {pending.length===0&&sent.length===0&&<div style={{textAlign:"center",padding:"32px 20px",color:T.txD,fontSize:13}}>{t("friends.noRequests")}</div>}
        </div>}
        {addTab==='search'&&<div style={{padding:"10px 16px 0"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"0 10px",borderRadius:10,background:T.bg3,border:`1.5px solid ${T.bd}`}}>
            <span style={{color:T.txD,display:"flex",flexShrink:0}}>{I.search}</span>
            <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder={t("friends.searchByName")} autoFocus style={{flex:1,padding:"9px 0",border:"none",background:"transparent",color:T.txH,fontSize:14,outline:"none",fontFamily:"inherit"}}/>
            {searchQ&&<button onClick={()=>{setSearchQ('');setResults([]);}} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",padding:4}}>{I.x}</button>}
          </div>
          <div style={{padding:"8px 0"}}>
            {searching&&<Loader msg={t("friends.searching")} size="sm"/>}
            {!searching&&searchQ&&results.length===0&&<div style={{textAlign:"center",padding:20,color:T.txD,fontSize:13}}>{t("friends.notFound")}</div>}
            {results.map(r=>{const u={name:r.name,av:r.avatar,col:r.color};const st=friendStatus(r.friendship);return <div key={r.moodleId} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0"}}>
              <Av u={u} sz={40} uid={r.moodleId}/><div style={{flex:1,minWidth:0}}><div style={{fontSize:14,fontWeight:600,color:T.txH}}>{r.name}</div>{r.dept&&<div style={{fontSize:11,color:T.txD}}>{r.dept}</div>}<Mutual n={r.mutual}/></div>
              {st==='friend'&&<span style={{fontSize:11,fontWeight:600,color:T.green,padding:"4px 10px",borderRadius:6,background:`${T.green}12`}}>{t("friends.friend")}</span>}
              {(st==='sent'||(!st&&sentRecs.has(r.moodleId)))&&<span style={{fontSize:11,fontWeight:600,color:T.txD,padding:"4px 10px",borderRadius:6,background:T.bg3}}>{t("friends.requesting")}</span>}
              {st==='received'&&<button onClick={()=>doAction(`ac_${r.moodleId}`,()=>acceptRequest(r.friendship.id))} disabled={actionLoading===`ac_${r.moodleId}`} style={{padding:"6px 14px",borderRadius:8,border:"none",background:T.green,cursor:"pointer",fontSize:12,fontWeight:600,color:"#fff"}}>{t("friends.accept")}</button>}
              {!st&&!sentRecs.has(r.moodleId)&&<button onClick={()=>{setSentRecs(prev=>new Set(prev).add(r.moodleId));doAction(`send_${r.moodleId}`,()=>sendRequest(r.moodleId));}} disabled={actionLoading===`send_${r.moodleId}`} style={{padding:"6px 14px",borderRadius:8,border:"none",background:T.accent,cursor:"pointer",fontSize:12,fontWeight:600,color:"#fff"}}>{t("friends.add")}</button>}
            </div>;})}
            {!searchQ&&<div>
              {recsLoading&&<Loader msg={t("friends.searching")} size="sm"/>}
              {!recsLoading&&recs.length>0&&<>
                <div style={{padding:"2px 0 6px",fontSize:11,fontWeight:600,color:T.txD,letterSpacing:.3}}>{t("friends.recommendHeader")}</div>
                {recs.map(r=>{const u={name:r.name,av:r.avatar,col:r.color};const sentR=sentRecs.has(r.moodleId);return <div key={r.moodleId} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0"}}>
                  <Av u={u} sz={40} uid={r.moodleId}/><div style={{flex:1,minWidth:0}}><div style={{fontSize:14,fontWeight:600,color:T.txH}}>{r.name}</div>{r.dept&&<div style={{fontSize:11,color:T.txD}}>{r.dept}</div>}<Mutual n={r.mutual}/></div>
                  {sentR?<span style={{fontSize:11,fontWeight:600,color:T.txD,padding:"4px 10px",borderRadius:6,background:T.bg3}}>{t("friends.requesting")}</span>
                  :<button onClick={()=>{setSentRecs(prev=>new Set(prev).add(r.moodleId));doAction(`rec_${r.moodleId}`,()=>sendRequest(r.moodleId));}} disabled={actionLoading===`rec_${r.moodleId}`} style={{padding:"6px 14px",borderRadius:8,border:"none",background:T.accent,cursor:"pointer",fontSize:12,fontWeight:600,color:"#fff"}}>{t("friends.add")}</button>}
                </div>;})}
              </>}
              {!recsLoading&&recs.length===0&&<div style={{textAlign:"center",padding:"24px 20px",color:T.txD,fontSize:13}}>{t("friends.enterNameToSearch")}</div>}
            </div>}
          </div>
        </div>}
        {addTab==='qr'&&<div style={{padding:16}}><div style={{maxWidth:320,margin:"0 auto"}}>
          {/* 自分のQRを見せる */}
          <div style={{textAlign:"center",padding:"4px 0 16px"}}>
            <div style={{fontSize:12,fontWeight:600,color:T.txD,marginBottom:10}}>{t("friends.yourQrCode")}</div>
            {qrDataUrl?<div style={{display:"inline-block",padding:12,background:"#fff",borderRadius:14}}><img src={qrDataUrl} alt="QR" style={{width:180,height:180,display:"block",imageRendering:"pixelated"}}/></div>
            :<div style={{width:204,height:204,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"center",background:T.bg3,borderRadius:14}}><Loader size="sm"/></div>}
          </div>
          {/* 相手のQRをスキャン */}
          <div style={{borderTop:`1px solid ${T.bd}`,paddingTop:14}}>
            <div style={{fontSize:12,fontWeight:600,color:T.txD,marginBottom:8}}>{t("friends.scanFriendQr")}</div>
            {scanning?<QRScanner onResult={handleScannedQr} onClose={()=>setScanning(false)}/>
            :<button onClick={()=>setScanning(true)} style={{width:"100%",padding:"11px 0",borderRadius:8,border:`1px solid ${T.accent}30`,background:`${T.accent}08`,color:T.accent,fontSize:13,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>{I.search}<span>{t("friends.scanQr")}</span></button>}
            {lookupResult&&lookupResult!=='not_found'&&<div style={{display:"flex",alignItems:"center",gap:10,paddingTop:10,marginTop:10,borderTop:`1px solid ${T.bd}`}}>
              <Av u={{name:lookupResult.name,av:lookupResult.avatar,col:lookupResult.color}} sz={38} uid={lookupResult.moodleId}/><div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:600,color:T.txH}}>{lookupResult.name}</div>{lookupResult.dept&&<div style={{fontSize:11,color:T.txD}}>{lookupResult.dept}</div>}<Mutual n={lookupResult.mutual}/></div>
              {lookupResult.friendship?.status==='accepted'&&<span style={{fontSize:11,fontWeight:600,color:T.green}}>{t("friends.friend")}</span>}
              {lookupResult.friendship?.status==='pending'&&<span style={{fontSize:11,color:T.txD}}>{t("friends.requesting")}</span>}
              {!lookupResult.friendship&&<button onClick={()=>doAction(`sq_${lookupResult.moodleId}`,()=>sendRequest(lookupResult.moodleId))} disabled={actionLoading===`sq_${lookupResult.moodleId}`} style={{padding:"5px 12px",borderRadius:7,border:"none",background:T.accent,cursor:"pointer",fontSize:12,fontWeight:600,color:"#fff"}}>{t("friends.add")}</button>}
            </div>}
          </div>
        </div></div>}
        {addTab==='id'&&<div style={{padding:16}}><div style={{maxWidth:320,margin:"0 auto"}}>
          {/* 自分のID */}
          <div style={{marginBottom:16}}>
            <div style={{fontSize:12,fontWeight:600,color:T.txD,marginBottom:8}}>{t("friends.yourId")}</div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{flex:1,fontSize:16,color:T.txH,fontWeight:700,fontFamily:"monospace",background:T.bg3,padding:"11px 14px",borderRadius:8,textAlign:"center",letterSpacing:1}}>{userId}</span>
              <button onClick={copyId} style={{padding:"11px 14px",borderRadius:8,border:`1px solid ${copied?T.green:T.bd}`,background:copied?`${T.green}14`:"transparent",color:copied?T.green:T.txD,fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>{copied?t("friends.copied"):t("friends.copy")}</button>
            </div>
          </div>
          {/* IDで追加 */}
          <div style={{borderTop:`1px solid ${T.bd}`,paddingTop:14}}>
            <div style={{fontSize:12,fontWeight:600,color:T.txD,marginBottom:6}}>{t("friends.addById")}</div>
            <div style={{display:"flex",gap:6}}>
              <input value={lookupId} onChange={e=>setLookupId(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doLookup()} placeholder={t("friends.enterId")} style={{flex:1,padding:"10px 12px",borderRadius:8,border:`1px solid ${T.bd}`,background:T.bg2,color:T.txH,fontSize:14,outline:"none",fontFamily:"inherit"}}/>
              <button onClick={()=>doLookup()} disabled={lookupLoading||!lookupId.trim()} style={{padding:"10px 16px",borderRadius:8,border:"none",background:T.accent,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",opacity:lookupLoading||!lookupId.trim()?0.4:1}}>{t("friends.searchBtn")}</button>
            </div>
            {lookupLoading&&<div style={{marginTop:6}}><Loader msg={t("friends.searching")} size="sm"/></div>}
            {lookupResult&&lookupResult!=='not_found'&&<div style={{display:"flex",alignItems:"center",gap:10,paddingTop:10,marginTop:10,borderTop:`1px solid ${T.bd}`}}>
              <Av u={{name:lookupResult.name,av:lookupResult.avatar,col:lookupResult.color}} sz={38} uid={lookupResult.moodleId}/><div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:600,color:T.txH}}>{lookupResult.name}</div>{lookupResult.dept&&<div style={{fontSize:11,color:T.txD}}>{lookupResult.dept}</div>}<Mutual n={lookupResult.mutual}/></div>
              {lookupResult.friendship?.status==='accepted'&&<span style={{fontSize:11,fontWeight:600,color:T.green}}>{t("friends.friend")}</span>}
              {lookupResult.friendship?.status==='pending'&&<span style={{fontSize:11,color:T.txD}}>{t("friends.requesting")}</span>}
              {!lookupResult.friendship&&<button onClick={()=>doAction(`sq_${lookupResult.moodleId}`,()=>sendRequest(lookupResult.moodleId))} disabled={actionLoading===`sq_${lookupResult.moodleId}`} style={{padding:"5px 12px",borderRadius:7,border:"none",background:T.accent,cursor:"pointer",fontSize:12,fontWeight:600,color:"#fff"}}>{t("friends.add")}</button>}
            </div>}
            {lookupResult==='not_found'&&<div style={{marginTop:8,fontSize:12,color:T.red,textAlign:"center"}}>{t("friends.notFound")}</div>}
          </div>
        </div></div>}
      </div>
  </>)});

  /* ── Create Group modal ── */
  const CreateGroupModal=()=>ModalWrap({onClose:()=>setGrpOpen(false),children:(<>
      <div style={{padding:"12px 16px 0",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <span style={{fontSize:16,fontWeight:700,color:T.txH}}>{t("friends.createGroup")}</span>
          <button onClick={()=>setGrpOpen(false)} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",padding:4}}>{I.x}</button>
        </div>
        <input value={grpName} onChange={e=>setGrpName(e.target.value)} placeholder={t("friends.groupName")} autoFocus
          style={{width:"100%",padding:"10px 12px",borderRadius:10,border:`1.5px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:14,outline:"none",fontFamily:"inherit",marginBottom:12,boxSizing:"border-box"}}/>
        <div style={{fontSize:11,fontWeight:600,color:T.txD,letterSpacing:.3,marginBottom:6}}>{t("friends.selectMembers")} {grpSel.size>0&&<span style={{color:T.accent}}>({grpSel.size})</span>}</div>
        <div style={{borderTop:`1px solid ${T.bd}`}}/>
      </div>
      <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:"4px 0"}}>
        {friends.length===0&&<div style={{textAlign:"center",padding:"32px 20px",color:T.txD,fontSize:13}}>{t("friends.noFriendsYet")}</div>}
        {friends.map(f=>{
          const u={name:f.name,av:f.avatar,col:f.color};
          const sel=grpSel.has(f.friendId);
          return <div key={f.friendId} onClick={()=>toggleGrpMember(f.friendId)}
            style={{display:"flex",alignItems:"center",gap:10,padding:"8px 16px",cursor:"pointer",transition:"background .12s"}}
            onMouseEnter={e=>{e.currentTarget.style.background=T.hover;}}
            onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}>
            <div style={{width:20,height:20,borderRadius:6,border:`2px solid ${sel?T.accent:T.bd}`,background:sel?T.accent:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all .15s"}}>
              {sel&&<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
            </div>
            <Av u={u} sz={36}/>
            <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:600,color:T.txH}}>{f.name}</div>{f.dept&&<div style={{fontSize:11,color:T.txD}}>{f.dept}</div>}</div>
          </div>;
        })}
      </div>
      <div style={{padding:"10px 16px",borderTop:`1px solid ${T.bd}`,flexShrink:0}}>
        <button onClick={handleCreateGroup} disabled={grpCreating||!grpName.trim()||grpSel.size===0}
          style={{width:"100%",padding:"10px 0",borderRadius:10,border:"none",background:T.accent,color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",opacity:grpCreating||!grpName.trim()||grpSel.size===0?.4:1,transition:"opacity .15s"}}>
          {grpCreating?t("friends.creating"):t("friends.createGroupBtn")}
        </button>
      </div>
  </>)});

  /* ── Friend action sheet (manage a single friend) ── */
  const FriendActionSheet=()=>{
    const f=actionFor;
    const close=()=>setActionFor(null);
    const muted=isMuted&&isMuted(f.friendId);
    const row=(key,label,icon,{danger,run})=>(
      <button key={key} disabled={actionLoading===key} onClick={()=>run()}
        style={{display:"flex",alignItems:"center",gap:12,width:"100%",padding:"13px 16px",border:"none",background:"transparent",cursor:"pointer",textAlign:"left",fontFamily:"inherit",fontSize:14,fontWeight:500,color:danger?T.red:T.txH,transition:"background .12s"}}
        onMouseEnter={e=>{e.currentTarget.style.background=danger?`${T.red}10`:T.hover;}}
        onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}>
        <span style={{display:"flex",color:danger?T.red:T.txD,flexShrink:0}}>{icon}</span>{label}
      </button>
    );
    return ModalWrap({onClose:close,children:(<>
      <div style={{display:"flex",alignItems:"center",gap:12,padding:"4px 16px 12px",flexShrink:0}}>
        <Av u={{name:f.name,av:f.avatar,col:f.color}} sz={44} uid={f.friendId}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:15,fontWeight:700,color:T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</div>
          {f.dept&&<div style={{fontSize:12,color:T.txD,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.dept}</div>}
        </div>
      </div>
      <div style={{borderTop:`1px solid ${T.bd}`,padding:"4px 0 8px"}}>
        {openProfile&&row(`pf_${f.friendId}`,t("profile.viewProfile"),
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
          {run:()=>{close();openProfile(f.friendId);}})}
        {onStartDM&&row(`dm_${f.friendId}`,t("friends.message"),
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
          {run:()=>{close();onStartDM(f.friendId,f.name,f.avatar,f.color);}})}
        {muteUser&&row(muted?`um_${f.friendId}`:`mu_${f.friendId}`,muted?t("friends.unmute"):t("friends.mute"),
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.12 1.5-.34 2.18"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>,
          {run:()=>{close();muted?doAction(`um_${f.friendId}`,()=>unmuteUser(f.friendId)):doAction(`mu_${f.friendId}`,()=>muteUser(f.friendId));}})}
        {row(`uf_${f.friendId}`,t("friends.unfriend"),
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" y1="8" x2="23" y2="8"/></svg>,
          {danger:true,run:()=>{if(confirm(t("friends.unfriendConfirm",{name:f.name}))){close();doAction(`uf_${f.friendId}`,()=>unfriend(f.friendId));}}})}
        {blockUser&&row(`bl_${f.friendId}`,t("friends.block"),
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>,
          {danger:true,run:()=>{if(confirm(t("friends.blockConfirm",{name:f.name}))){close();doAction(`bl_${f.friendId}`,()=>blockUser(f.friendId));}}})}
      </div>
    </>)});
  };

  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:T.bg}}>
      {/* ── Top bar ── */}
      <div style={{display:"flex",alignItems:"center",gap:6,padding:"8px 12px",flexShrink:0,borderBottom:`1px solid ${T.bd}`,background:T.bg2}}>
        {/* List / Graph toggle */}
        <div style={{display:"flex",alignItems:"center",gap:2,padding:2,borderRadius:8,background:T.bg3,height:34,flexShrink:0}}>
          {[{id:'list',label:t("friends.viewList"),icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>},
            {id:'graph',label:t("friends.viewGraph"),icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.2 7.4l7.6 9.2M15.5 6h-7.3"/></svg>}].map(m=>{
            const active=mode===m.id;
            return <button key={m.id} onClick={()=>setMode(m.id)} title={m.label}
              style={{display:"flex",alignItems:"center",gap:5,padding:"0 10px",height:30,borderRadius:6,border:"none",cursor:"pointer",background:active?T.bg2:"transparent",color:active?T.accent:T.txD,fontSize:12,fontWeight:600,fontFamily:"inherit",transition:"all .15s",boxShadow:active?"0 1px 3px rgba(0,0,0,.12)":"none"}}>
              {m.icon}{!mob&&<span>{m.label}</span>}
            </button>;
          })}
        </div>
        {mode==='list'&&<div style={{flex:1,display:"flex",alignItems:"center",gap:6,padding:"0 10px",borderRadius:8,background:T.bg3,height:34}}>
          <span style={{color:T.txD,display:"flex",flexShrink:0}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
          <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder={t("friends.searchBtn")} style={{flex:1,border:"none",background:"transparent",color:T.txH,fontSize:13,outline:"none",fontFamily:"inherit",padding:"0"}}/>
          {filter&&<button onClick={()=>setFilter('')} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",padding:2}}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
        </div>}
        {mode==='graph'&&<div style={{flex:1,display:"flex",justifyContent:"center"}}>
          {isAdmin&&<div style={{display:"flex",alignItems:"center",gap:2,padding:2,borderRadius:8,background:T.bg3,height:34}}>
            {[{id:'ego',label:t("friends.viewGraph")},{id:'all',label:t("graph.campus")}].map(s=>{
              const active=graphScope===s.id;
              return <button key={s.id} onClick={()=>setGraphScope(s.id)}
                style={{padding:"0 12px",height:30,borderRadius:6,border:"none",cursor:"pointer",background:active?T.bg2:"transparent",color:active?T.accent:T.txD,fontSize:12,fontWeight:600,fontFamily:"inherit",transition:"all .15s",boxShadow:active?"0 1px 3px rgba(0,0,0,.12)":"none"}}>
                {s.label}</button>;
            })}
          </div>}
        </div>}
        <div style={{position:"relative",flexShrink:0}}>
          <button onClick={()=>setTopMenu(o=>!o)} title={t("friends.addFriend")}
            style={{position:"relative",width:34,height:34,borderRadius:8,border:`1px solid ${topMenu?`${T.accent}40`:T.bd}`,background:topMenu?`${T.accent}14`:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:topMenu?T.accent:T.txH,transition:"all .15s"}}
            onMouseEnter={e=>{e.currentTarget.style.background=`${T.accent}14`;e.currentTarget.style.borderColor=`${T.accent}40`;e.currentTarget.style.color=T.accent;}}
            onMouseLeave={e=>{if(!topMenu){e.currentTarget.style.background="transparent";e.currentTarget.style.borderColor=T.bd;e.currentTarget.style.color=T.txH;}}}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{transform:topMenu?"rotate(45deg)":"none",transition:"transform .18s ease"}}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            {pendingCount>0&&!topMenu&&<span style={{position:"absolute",top:-4,right:-4,minWidth:16,height:16,borderRadius:8,background:T.red,color:"#fff",fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 4px",border:`2px solid ${T.bg2}`}}>{pendingCount}</span>}
          </button>
          {topMenu&&<>
            <div onClick={()=>setTopMenu(false)} style={{position:"fixed",inset:0,zIndex:60}}/>
            <div style={{position:"absolute",top:40,right:0,zIndex:61,minWidth:188,background:T.bg2,border:`1px solid ${T.bd}`,borderRadius:12,boxShadow:"0 10px 30px rgba(0,0,0,.22)",overflow:"hidden"}}>
              <button onClick={()=>{setTopMenu(false);setAddOpen(true);}}
                style={{display:"flex",alignItems:"center",gap:11,width:"100%",padding:"12px 14px",border:"none",background:"transparent",cursor:"pointer",textAlign:"left",fontFamily:"inherit",fontSize:14,fontWeight:500,color:T.txH}}
                onMouseEnter={e=>{e.currentTarget.style.background=T.hover;}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}>
                <span style={{display:"flex",color:T.accent,flexShrink:0}}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg></span>
                <span style={{flex:1}}>{t("friends.addFriend")}</span>
                {pendingCount>0&&<span style={{minWidth:16,height:16,borderRadius:8,background:T.red,color:"#fff",fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 4px"}}>{pendingCount}</span>}
              </button>
              {createGroup&&<button onClick={()=>{setTopMenu(false);setGrpOpen(true);setGrpName('');setGrpSel(new Set());}}
                style={{display:"flex",alignItems:"center",gap:11,width:"100%",padding:"12px 14px",border:"none",borderTop:`1px solid ${T.bd}`,background:"transparent",cursor:"pointer",textAlign:"left",fontFamily:"inherit",fontSize:14,fontWeight:500,color:T.txH}}
                onMouseEnter={e=>{e.currentTarget.style.background=T.hover;}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}>
                <span style={{display:"flex",color:T.green,flexShrink:0}}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg></span>
                <span style={{flex:1}}>{t("friends.createGroup")}</span>
              </button>}
            </div>
          </>}
        </div>
      </div>

      {/* ── Graph mode ── */}
      {mode==='graph'&&<SocialGraphView mob={mob} fetchGraph={fetchGraph} userId={userId} onStartDM={onStartDM} sendRequest={sendRequest} openProfile={openProfile} scope={isAdmin?graphScope:'ego'}/>}

      {/* ── Content (list mode) ── */}
      {mode==='list'&&<div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
        {loading&&<Loader msg={t("common.loading")} size="sm"/>}

        {!loading&&friends.length===0&&groups.length===0&&(
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"64px 32px",textAlign:"center"}}>
            <div style={{width:72,height:72,borderRadius:20,background:`${T.accent}10`,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:16}}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
            </div>
            <div style={{fontSize:16,fontWeight:700,color:T.txH,marginBottom:6}}>{t("friends.emptyTitle")}</div>
            <div style={{fontSize:13,color:T.txD,lineHeight:1.6,maxWidth:240}}>{t("friends.emptyDesc")}</div>
          </div>
        )}

        {/* Groups */}
        {filteredGroups.length>0&&<>
          <div style={{padding:"10px 16px 4px"}}><span style={{fontSize:11,fontWeight:600,color:T.txD,letterSpacing:.5}}>{t("friends.groupsHeader",{n:filteredGroups.length})}</span></div>
          {filteredGroups.map((g,i)=>(
            <div key={g.id} onClick={()=>onOpenGroup&&onOpenGroup(g)}
              style={{display:"flex",alignItems:"center",gap:12,padding:"10px 16px",cursor:"pointer",borderBottom:i<filteredGroups.length-1||filtered.length>0?`1px solid ${T.bd}`:"none",transition:"background .12s"}}
              onMouseEnter={e=>{e.currentTarget.style.background=T.hover;}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}>
              <GroupAv g={g} sz={44}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:600,color:T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.name}</div>
                <div style={{fontSize:12,color:T.txD,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t("friends.memberCount",{n:g.memberCount})}{g.lastMessage?` · ${g.lastMessage.senderName}: ${g.lastMessage.text}`:''}</div>
              </div>
              <span style={{color:T.txD,display:"flex",flexShrink:0}}>{I.arr}</span>
            </div>
          ))}
        </>}

        {/* Friends */}
        {filtered.length>0&&<div style={{padding:"10px 16px 4px"}}><span style={{fontSize:11,fontWeight:600,color:T.txD,letterSpacing:.5}}>{t("friends.friendsHeader",{n:filtered.length})}</span></div>}
        {!loading&&friends.length>0&&filtered.length===0&&filteredGroups.length===0&&filter&&<div style={{textAlign:"center",padding:"40px 20px",color:T.txD,fontSize:13}}>{t("friends.noFilterMatch",{q:filter})}</div>}

        {filtered.map((f,i)=>{
          const u={name:f.name,av:f.avatar,col:f.color};
          return <div key={f.id}
            style={{display:"flex",alignItems:"center",gap:12,padding:"10px 16px",cursor:"pointer",borderBottom:i<filtered.length-1?`1px solid ${T.bd}`:"none",transition:"background .12s"}}
            onMouseEnter={e=>{e.currentTarget.style.background=T.hover;}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}>
            <Av u={u} sz={44} st uid={f.friendId}/>
            <div style={{flex:1,minWidth:0}} onClick={()=>openProfile?openProfile(f.friendId):onStartDM&&onStartDM(f.friendId,f.name,f.avatar,f.color)}>
              <div style={{fontSize:14,fontWeight:600,color:T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</div>
              {f.dept&&<div style={{fontSize:12,color:T.txD,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.dept}</div>}
            </div>
            <div style={{display:"flex",gap:4,alignItems:"center",flexShrink:0}}>
              {isMuted&&isMuted(f.friendId)&&<span title={t("friends.mute")} style={{color:T.txD,display:"flex",opacity:.55}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.12 1.5-.34 2.18"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              </span>}
              {onStartDM&&<button onClick={e=>{e.stopPropagation();onStartDM(f.friendId,f.name,f.avatar,f.color);}}
                style={{width:32,height:32,borderRadius:8,border:"none",background:`${T.accent}10`,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:T.accent,transition:"background .15s"}}
                onMouseEnter={e=>{e.currentTarget.style.background=`${T.accent}20`;}} onMouseLeave={e=>{e.currentTarget.style.background=`${T.accent}10`;}} title={t("common.dm")}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
              </button>}
              <button onClick={e=>{e.stopPropagation();setActionFor(f);}}
                style={{width:32,height:32,borderRadius:8,border:"none",background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:T.txD,transition:"all .15s"}}
                onMouseEnter={e=>{e.currentTarget.style.background=T.bg3;e.currentTarget.style.color=T.txH;}}
                onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=T.txD;}} title={t("friends.manageFriend")}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>
              </button>
            </div>
          </div>;
        })}
      </div>}

      {addOpen&&AddModal()}
      {grpOpen&&CreateGroupModal()}
      {actionFor&&FriendActionSheet()}
    </div>
  );
};
