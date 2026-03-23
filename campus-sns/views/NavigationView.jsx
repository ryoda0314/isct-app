import { useState, useEffect, useRef, useCallback } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { useLeaflet, Loader } from "../shared.jsx";
import { CAMPUS_CENTER, CAMPUS_ZOOM, SPOTS, SPOT_CATS, ENTRANCES, AREAS } from "../hooks/useLocationSharing.js";
import { useNavigation, NAV_SPOTS } from "../hooks/useNavigation.js";

const NAV_QUICK_DEFAULT=["taki","eki","lib","main","coop","gym","w5"];
// Returns raw IDs including cat: and grp: prefixes
const getNavQuickRaw=()=>{try{const v=localStorage.getItem("navQuickSpots");return v?JSON.parse(v):NAV_QUICK_DEFAULT;}catch{return NAV_QUICK_DEFAULT;}};
export { NAV_QUICK_DEFAULT };
const NON_GEO_NAV=new Set(["suzu","home_loc","commute","off_campus"]);
const haversineNav=(lat1,lng1,lat2,lng2)=>{
  const R=6371e3,toRad=d=>d*Math.PI/180;
  const dLat=toRad(lat2-lat1),dLng=toRad(lng2-lng1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
};
// 2点間の方位角（度, 北=0, 時計回り）
const bearingNav=(lat1,lng1,lat2,lng2)=>{
  const toRad=d=>d*Math.PI/180,toDeg=r=>r*180/Math.PI;
  const dLng=toRad(lng2-lng1);
  const y=Math.sin(dLng)*Math.cos(toRad(lat2));
  const x=Math.cos(toRad(lat1))*Math.sin(toRad(lat2))-Math.sin(toRad(lat1))*Math.cos(toRad(lat2))*Math.cos(dLng);
  return (toDeg(Math.atan2(y,x))+360)%360;
};
const pointInPolyNav=(lat,lng,poly)=>{
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const [yi,xi]=poly[i],[yj,xj]=poly[j];
    if((yi>lat)!==(yj>lat)&&lng<(xj-xi)*(lat-yi)/(yj-yi)+xi)inside=!inside;
  }
  return inside;
};
const findNearestNavSpot=(lat,lng)=>{
  // 1) ポリゴン判定: AREAS内のポリゴンに含まれるか
  for(const [id,poly] of Object.entries(AREAS)){
    if(NON_GEO_NAV.has(id)||poly.length<3)continue;
    if(pointInPolyNav(lat,lng,poly)){
      const spot=NAV_SPOTS.find(s=>s.id===id);
      if(spot)return {spot,distance:0};
    }
  }
  // 2) 入口ベース: 最も近い入口の建物を優先
  let bestEntSpot=null,bestEntDist=Infinity;
  for(const ent of ENTRANCES){
    if(!ent.spot||NON_GEO_NAV.has(ent.spot))continue;
    const d=haversineNav(lat,lng,ent.lat,ent.lng);
    if(d<bestEntDist){bestEntDist=d;bestEntSpot=ent.spot;}
  }
  if(bestEntSpot&&bestEntDist<100){
    const spot=NAV_SPOTS.find(s=>s.id===bestEntSpot);
    if(spot)return {spot,distance:bestEntDist};
  }
  // 3) フォールバック: 入口データがない建物は中心点で判定
  let best=null,bestDist=Infinity;
  for(const s of NAV_SPOTS){
    if(!s.id||s.lat==null||NON_GEO_NAV.has(s.id))continue;
    const d=haversineNav(lat,lng,s.lat,s.lng);
    if(d<bestDist){bestDist=d;best=s;}
  }
  return {spot:best,distance:bestDist};
};

/* ── Spot group definitions ── */
export const SPOT_GROUPS=[
  {prefix:"bench",label:"ベンチ",col:"#8bc34a"},
  {prefix:"park",label:"駐輪場",col:"#78909c"},
  {prefix:"vend_d",label:"自販機・飲料",col:"#42a5f5"},
  {prefix:"vend_f",label:"自販機・食品",col:"#ff8a65"},
  {prefix:"smoke",label:"喫煙所",col:"#b0bec5"},
  {prefix:"rest",label:"飲食店",col:"#e8843a"},
];
const getGroupPrefix=(id)=>{const g=SPOT_GROUPS.find(g=>id.startsWith(g.prefix+"_"));return g?g.prefix:null;};
const isGroupableSpot=(s)=>(s.cat==="outdoor"||s.cat==="restaurant")&&getGroupPrefix(s.id)!=null;

const buildSearchResults=(spots)=>{
  const nonGroupable=spots.filter(s=>!isGroupableSpot(s));
  const groupable=spots.filter(s=>isGroupableSpot(s));
  const groups=[];
  SPOT_GROUPS.forEach(g=>{
    const members=groupable.filter(s=>s.id.startsWith(g.prefix+"_"));
    if(members.length>0)groups.push({...g,spots:members,isGroup:true});
  });
  return {singles:nonGroupable,groups};
};

/* ── SpotSelector (search-first, category tabs) ── */
const SpotSelector=({value,onChange,onSelectGroup,placeholder,accent,onGps,gpsLoading,initialOpen})=>{
  const [open,setOpen]=useState(!!initialOpen);
  const [q,setQ]=useState("");
  const [openCat,setOpenCat]=useState(null);
  const sel=value==="__gps__"?{id:"__gps__",label:"現在地",col:"#4285f4",short:"GPS"}:NAV_SPOTS.find(s=>s.id===value);

  const searching=q.trim().length>0;
  const filtered=searching?NAV_SPOTS.filter(s=>s.label.includes(q)||s.short.includes(q)||s.id.includes(q.toLowerCase())):[];
  const searchResults=searching?buildSearchResults(filtered):null;
  const searchGrouped=searching?SPOT_CATS.map(cat=>({...cat,spots:filtered.filter(s=>s.cat===cat.id&&!isGroupableSpot(s))})).filter(g=>g.spots.length>0):[];
  const catSpots=openCat?NAV_SPOTS.filter(s=>s.cat===openCat):[];
  const rawQuick=getNavQuickRaw();
  // Build mixed list: spots + category entries + group entries
  const quickItems=rawQuick.map(id=>{
    if(id.startsWith("cat:")){const catId=id.slice(4);const cat=SPOT_CATS.find(c=>c.id===catId);return cat?{type:"cat",catId,label:cat.label,count:NAV_SPOTS.filter(s=>s.cat===catId).length}:null;}
    if(id.startsWith("grp:")){const pfx=id.slice(4);const g=SPOT_GROUPS.find(x=>x.prefix===pfx);return g?{type:"grp",prefix:pfx,label:g.label,col:g.col,count:NAV_SPOTS.filter(s=>s.id.startsWith(pfx+"_")).length}:null;}
    const s=NAV_SPOTS.find(s=>s.id===id);return s?{type:"spot",...s}:null;
  }).filter(Boolean);

  return <div style={{position:"relative",flex:1,minWidth:0}}>
    <div style={{position:"relative",width:"100%"}} onMouseEnter={e=>{const x=e.currentTarget.querySelector('[data-clear]');if(x)x.style.opacity='1';}} onMouseLeave={e=>{const x=e.currentTarget.querySelector('[data-clear]');if(x)x.style.opacity='0';}}>
      <button onClick={()=>{setOpen(p=>!p);setQ("");setOpenCat(null);}} style={{width:"100%",display:"flex",alignItems:"center",gap:6,padding:"9px 10px",paddingRight:sel?30:10,borderRadius:8,border:"none",background:open?T.bg3:"transparent",cursor:"pointer",textAlign:"left",transition:"background .12s"}} onMouseEnter={e=>{if(!open)e.currentTarget.style.background=T.bg3}} onMouseLeave={e=>{if(!open)e.currentTarget.style.background="transparent"}}>
        {sel?<span style={{fontSize:13,fontWeight:600,color:T.txH,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sel.label}</span>
        :<span style={{fontSize:13,color:T.txD,flex:1}}>{placeholder}</span>}
      </button>
      {sel&&<button data-clear onClick={e=>{e.stopPropagation();onChange(null);setOpen(false);}} style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",display:"flex",alignItems:"center",justifyContent:"center",width:20,height:20,borderRadius:"50%",border:"none",background:`${T.red}18`,cursor:"pointer",opacity:0,transition:"opacity .15s",padding:0}}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.red} strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>}
    </div>
    {open&&<>
      <div onClick={()=>setOpen(false)} style={{position:"fixed",inset:0,zIndex:2000}}/>
      <div style={{position:"absolute",top:"100%",left:-44,right:-12,marginTop:6,background:T.bg2,border:`1px solid ${T.bdL}`,borderRadius:14,boxShadow:"0 16px 48px rgba(0,0,0,.55)",zIndex:2001,overflow:"hidden"}}>
        <div style={{padding:"10px 10px 6px"}}>
          <div style={{position:"relative"}}>
            <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",display:"flex",color:T.txD,pointerEvents:"none"}}>{I.search}</span>
            <input value={q} onChange={e=>{setQ(e.target.value);setOpenCat(null);}} placeholder="建物名を検索..." autoFocus style={{width:"100%",padding:"9px 10px 9px 34px",borderRadius:10,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
          </div>
        </div>
        <div style={{maxHeight:280,overflowY:"auto",padding:"0 6px 6px"}}>
          {value&&<button onClick={()=>{onChange(null);setOpen(false);}} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:8,border:"none",background:`${T.red}10`,cursor:"pointer",textAlign:"left",marginBottom:4}}>
            <span style={{display:"flex",color:T.red}}>{I.x}</span>
            <span style={{fontSize:12,fontWeight:500,color:T.red}}>選択を解除</span>
          </button>}
          {searching?<>
            {/* Grouped outdoor spots */}
            {searchResults.groups.map(g=>(
              <button key={g.prefix} onClick={()=>{if(onSelectGroup){onSelectGroup(g.prefix);setOpen(false);}}} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"9px 10px",borderRadius:8,border:"none",background:"transparent",cursor:"pointer",textAlign:"left"}} onMouseEnter={e=>e.currentTarget.style.background=T.hover} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <div style={{width:24,height:24,borderRadius:6,background:`${g.col}30`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill={g.col} stroke="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/></svg>
                </div>
                <span style={{fontSize:13,fontWeight:600,color:T.txH,flex:1}}>{g.label}</span>
                <span style={{fontSize:11,color:T.txD}}>{g.spots.length}件 ›</span>
              </button>
            ))}
            {/* Non-groupable spots */}
            {searchGrouped.map(g=><div key={g.id}>
              <div style={{fontSize:10,fontWeight:700,color:T.txD,letterSpacing:.5,padding:"8px 10px 3px"}}>{g.label}</div>
              {g.spots.map(s=>{
                const on=s.id===value;
                return <button key={s.id} onClick={()=>{onChange(s.id);setOpen(false);}} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:8,border:"none",background:on?`${accent}18`:"transparent",cursor:"pointer",textAlign:"left"}} onMouseEnter={e=>{if(!on)e.currentTarget.style.background=T.hover}} onMouseLeave={e=>{if(!on)e.currentTarget.style.background="transparent"}}>
                  <div style={{width:20,height:20,borderRadius:5,background:on?s.col:`${s.col}40`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:7,fontWeight:700,color:on?"#fff":s.col}}>{s.short}</span></div>
                  <span style={{fontSize:12,fontWeight:on?600:400,color:on?T.txH:T.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{s.label}</span>
                  {on&&<span style={{display:"flex",color:accent,flexShrink:0}}>{I.chk}</span>}
                </button>;
              })}
            </div>)}
            {searchResults.groups.length===0&&searchGrouped.length===0&&<div style={{padding:"16px 0",fontSize:12,color:T.txD,textAlign:"center"}}>見つかりません</div>}
          </>:openCat?<>
            <button onClick={()=>setOpenCat(null)} style={{display:"flex",alignItems:"center",gap:4,padding:"6px 10px",borderRadius:8,border:"none",background:"transparent",cursor:"pointer",color:T.txD,fontSize:11,marginBottom:2}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              戻る
            </button>
            {catSpots.map(s=>{
              const on=s.id===value;
              return <button key={s.id} onClick={()=>{onChange(s.id);setOpen(false);}} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:8,border:"none",background:on?`${accent}18`:"transparent",cursor:"pointer",textAlign:"left"}} onMouseEnter={e=>{if(!on)e.currentTarget.style.background=T.hover}} onMouseLeave={e=>{if(!on)e.currentTarget.style.background="transparent"}}>
                <div style={{width:20,height:20,borderRadius:5,background:on?s.col:`${s.col}40`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:7,fontWeight:700,color:on?"#fff":s.col}}>{s.short}</span></div>
                <span style={{fontSize:12,fontWeight:on?600:400,color:on?T.txH:T.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{s.label}</span>
                {on&&<span style={{display:"flex",color:accent,flexShrink:0}}>{I.chk}</span>}
              </button>;
            })}
          </>:<>
            {onGps&&<button onClick={()=>{onGps();setOpen(false);}} disabled={gpsLoading} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"9px 10px",borderRadius:8,border:"none",background:"#4285f410",cursor:gpsLoading?"wait":"pointer",textAlign:"left",marginBottom:4}} onMouseEnter={e=>e.currentTarget.style.background="#4285f420"} onMouseLeave={e=>e.currentTarget.style.background="#4285f410"}>
              <div style={{width:20,height:20,borderRadius:5,background:"#4285f430",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{I.tgt}</div>
              <span style={{fontSize:12,fontWeight:500,color:"#4285f4"}}>{gpsLoading?"取得中...":"現在地"}</span>
            </button>}
            <div style={{fontSize:10,fontWeight:700,color:T.txD,letterSpacing:.5,padding:"6px 10px 3px"}}>よく使う</div>
            {quickItems.map((item,i)=>{
              if(item.type==="cat") return <button key={"cat:"+item.catId} onClick={()=>setOpenCat(item.catId)} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,padding:"9px 10px",borderRadius:8,border:"none",background:"transparent",cursor:"pointer",textAlign:"left"}} onMouseEnter={e=>e.currentTarget.style.background=T.hover} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <span style={{fontSize:12,fontWeight:500,color:T.txH}}>{item.label}</span>
                <span style={{fontSize:11,color:T.txD}}>{item.count}件 ›</span>
              </button>;
              if(item.type==="grp") return <button key={"grp:"+item.prefix} onClick={()=>{if(onSelectGroup){onSelectGroup(item.prefix);setOpen(false);}}} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"9px 10px",borderRadius:8,border:"none",background:"transparent",cursor:"pointer",textAlign:"left"}} onMouseEnter={e=>e.currentTarget.style.background=T.hover} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <div style={{width:20,height:20,borderRadius:5,background:`${item.col}30`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <div style={{width:8,height:8,borderRadius:2,background:item.col}}/>
                </div>
                <span style={{fontSize:12,fontWeight:500,color:T.txH,flex:1}}>{item.label}</span>
                <span style={{fontSize:11,color:T.txD}}>{item.count}件 ›</span>
              </button>;
              const on=item.id===value;
              return <button key={item.id} onClick={()=>{onChange(item.id);setOpen(false);}} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:8,border:"none",background:on?`${accent}18`:"transparent",cursor:"pointer",textAlign:"left"}} onMouseEnter={e=>{if(!on)e.currentTarget.style.background=T.hover}} onMouseLeave={e=>{if(!on)e.currentTarget.style.background="transparent"}}>
                <div style={{width:20,height:20,borderRadius:5,background:on?item.col:`${item.col}40`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:7,fontWeight:700,color:on?"#fff":item.col}}>{item.short}</span></div>
                <span style={{fontSize:12,fontWeight:on?600:400,color:on?T.txH:T.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{item.label}</span>
                {on&&<span style={{display:"flex",color:accent,flexShrink:0}}>{I.chk}</span>}
              </button>;
            })}
            <div style={{height:1,background:T.bd,margin:"6px 10px"}}/>
            {SPOT_CATS.filter(cat=>NAV_SPOTS.some(s=>s.cat===cat.id)).map(cat=>{
              const count=NAV_SPOTS.filter(s=>s.cat===cat.id).length;
              return <button key={cat.id} onClick={()=>setOpenCat(cat.id)} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,padding:"10px 10px",borderRadius:8,border:"none",background:"transparent",cursor:"pointer",textAlign:"left"}} onMouseEnter={e=>e.currentTarget.style.background=T.hover} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <span style={{fontSize:13,fontWeight:500,color:T.txH}}>{cat.label}</span>
                <span style={{fontSize:11,color:T.txD}}>{count}件 ›</span>
              </button>;
            })}
          </>}
        </div>
      </div>
    </>}
  </div>;
};

/* ── NavigationView ── */
export const NavigationView=({mob,initialDest,initialOrig,onDestUsed})=>{
  const leafletReady=useLeaflet();
  const mapRef=useRef(null);
  const mapInst=useRef(null);
  const layersRef=useRef([]);
  const overlayRef=useRef(null);
  const gpsMarkerRef=useRef(null);
  const {origin,setOrigin,destination,setDestination,route,swap,gpsOriginPos,setGpsOriginPos}=useNavigation();
  const [selectMode,setSelectMode]=useState(null);
  const [panelMin,setPanelMin]=useState(false);
  const [searchMin,setSearchMin]=useState(true);
  const [navPhase,setNavPhase]=useState(initialDest?"route":"search"); // "search" | "group" | "detail" | "route"
  const [spotGroup,setSpotGroup]=useState(null); // e.g. "bench", "park"
  const [gpsPos,setGpsPos]=useState(null);
  const [gpsLoading,setGpsLoading]=useState(false);
  // 案内モード（GPS追従+コンパス）
  const [guiding,setGuiding]=useState(false);
  const [heading,setHeading]=useState(null);
  const headingRef=useRef(null);
  const watchIdRef=useRef(null);
  const routeCoordsRef=useRef(null);
  const initialBearingRef=useRef(null);
  const compassPermRef=useRef(false); // コンパス権限取得済みか
  const guidingOriginRef=useRef(null); // 案内開始時の出発地点（固定表示用）
  // 自動追従モード（案内中にユーザーがドラッグしたらfalse）
  const [following,setFollowing]=useState(true);
  const guidingRef=useRef(false);
  useEffect(()=>{guidingRef.current=guiding;},[guiding]);
  // 出発地がGPS（現在地）由来かどうか
  const [originFromGps,setOriginFromGps]=useState(false);
  const gpsCenteredRef=useRef(false);

  // マップ表示用の常時GPS更新（案内中はstartWatchが担当するのでスキップ）
  useEffect(()=>{
    if(guiding||!navigator.geolocation)return;
    const id=navigator.geolocation.watchPosition(
      (pos)=>{
        const {latitude:lat,longitude:lng,accuracy}=pos.coords;
        setGpsPos({lat,lng,accuracy});
        // 初回GPS取得時にマップを現在地へ移動
        if(!gpsCenteredRef.current&&mapInst.current){
          gpsCenteredRef.current=true;
          mapInst.current.flyTo([lat,lng],CAMPUS_ZOOM,{duration:0.6});
        }
      },
      ()=>{},
      {enableHighAccuracy:true,timeout:10000,maximumAge:5000}
    );
    return ()=>navigator.geolocation.clearWatch(id);
  },[guiding]);

  // ルート座標をrefに同期（watchPositionコールバック内で参照するため）
  useEffect(()=>{routeCoordsRef.current=route?.coords||null;},[route]);

  // ルートからの逸脱判定しきい値（メートル）
  const REROUTE_THRESHOLD=50;

  // GPS位置からルートポリライン上の最短距離を求める
  const distToRoute=(lat,lng,coords)=>{
    if(!coords||coords.length===0)return Infinity;
    let minD=Infinity;
    for(let i=0;i<coords.length-1;i++){
      const c1=coords[i],c2=coords[i+1];
      const dx=c2.lat-c1.lat,dy=c2.lng-c1.lng;
      const lenSq=dx*dx+dy*dy;
      let t=lenSq===0?0:((lat-c1.lat)*dx+(lng-c1.lng)*dy)/lenSq;
      t=Math.max(0,Math.min(1,t));
      const d=haversineNav(lat,lng,c1.lat+t*dx,c1.lng+t*dy);
      if(d<minD)minD=d;
    }
    // 単一点の場合
    if(coords.length===1){
      minD=haversineNav(lat,lng,coords[0].lat,coords[0].lng);
    }
    return minD;
  };

  // GPS常時追従
  const startWatch=useCallback(()=>{
    if(!navigator.geolocation||watchIdRef.current!=null)return;
    const id=navigator.geolocation.watchPosition(
      (pos)=>{
        const {latitude:lat,longitude:lng,accuracy}=pos.coords;
        setGpsPos({lat,lng,accuracy});
        // ルートが存在する場合、逸脱時のみ再計算
        const rc=routeCoordsRef.current;
        if(rc&&rc.length>0){
          const d=distToRoute(lat,lng,rc);
          if(d>REROUTE_THRESHOLD){
            setOrigin("__gps__");setGpsOriginPos({lat,lng});setOriginFromGps(true);
          }
        }else{
          // ルート未設定時は従来通り（出発地の初期設定用）
          setOrigin("__gps__");setGpsOriginPos({lat,lng});setOriginFromGps(true);
        }
      },
      ()=>{},
      {enableHighAccuracy:true,timeout:10000,maximumAge:5000}
    );
    watchIdRef.current=id;
  },[setOrigin]);
  const stopWatch=useCallback(()=>{
    if(watchIdRef.current!=null){navigator.geolocation.clearWatch(watchIdRef.current);watchIdRef.current=null;}
  },[]);
  useEffect(()=>()=>stopWatch(),[]);

  // コンパス（ローパスフィルタ+連続回転角でジッター・ラップアラウンド抑制）
  // 権限はstartGuiding内（ユーザージェスチャー内）で取得済み
  useEffect(()=>{
    if(!guiding){setHeading(null);return;}
    if(!compassPermRef.current)return;
    let smoothed=null;
    let prevSmoothed=null;
    let accumulated=null;
    let gotAbsolute=false; // 絶対方向イベントを受信済みか
    const process=(h)=>{
      // ローパスフィルタ: 急な変動を平滑化
      if(smoothed==null){smoothed=h;prevSmoothed=h;accumulated=h;}
      else{
        let delta=h-smoothed;
        if(delta>180)delta-=360;
        if(delta<-180)delta+=360;
        smoothed=(smoothed+delta*0.25+360)%360;
      }
      headingRef.current=smoothed;
      // 連続回転角: 0/360境界をまたいでもCSSが最短経路で回転
      let d=smoothed-prevSmoothed;
      if(d>180)d-=360;
      if(d<-180)d+=360;
      prevSmoothed=smoothed;
      accumulated+=d;
      // 2度以上変化した時のみ再描画
      setHeading(prev=>{
        if(prev==null)return Math.round(accumulated);
        return Math.abs(accumulated-prev)>=2?Math.round(accumulated):prev;
      });
    };
    // 絶対方向ハンドラ（deviceorientationabsolute）
    const absHandler=(e)=>{
      let h=null;
      if(e.webkitCompassHeading!=null)h=e.webkitCompassHeading;
      else if(e.alpha!=null&&(e.absolute||e.type==="deviceorientationabsolute"))h=(360-e.alpha)%360;
      if(h==null)return;
      gotAbsolute=true;
      process(h);
    };
    // フォールバック: 通常のdeviceorientation（絶対方向が取れない場合のみ使用）
    const fallbackHandler=(e)=>{
      if(gotAbsolute)return; // 絶対方向が取れている場合は無視
      let h=null;
      if(e.webkitCompassHeading!=null)h=e.webkitCompassHeading;
      else if(e.alpha!=null)h=(360-e.alpha)%360;
      if(h==null)return;
      process(h);
    };
    const hasAbsoluteEvent=typeof window.DeviceOrientationAbsoluteEvent!=="undefined";
    if(hasAbsoluteEvent){
      window.addEventListener("deviceorientationabsolute",absHandler,true);
    }
    // iOS: webkitCompassHeadingはdeviceorientationイベント内で取得
    // Android: absoluteイベントがない端末のフォールバック
    window.addEventListener("deviceorientation",hasAbsoluteEvent?fallbackHandler:absHandler,true);
    return()=>{
      if(hasAbsoluteEvent)window.removeEventListener("deviceorientationabsolute",absHandler,true);
      window.removeEventListener("deviceorientation",hasAbsoluteEvent?fallbackHandler:absHandler,true);
    };
  },[guiding]);

  // 案内モード: GPS追従でマップ中央を追従（followingがtrueの時のみ）
  useEffect(()=>{
    if(guiding&&following&&gpsPos&&mapInst.current){
      const zoom=Math.max(mapInst.current.getZoom(),18);
      mapInst.current.setView([gpsPos.lat,gpsPos.lng],zoom,{animate:true,duration:0.3});
    }
  },[guiding,following,gpsPos]);

  // 案内モード: heading変更時にマップをネイティブ回転（followingがtrueの時のみ）
  // コンパスデータ到着前は出発地→目的地の初期方位を維持
  useEffect(()=>{
    if(!mapInst.current||typeof mapInst.current.setBearing!=='function')return;
    if(guiding&&following&&heading!=null){
      mapInst.current.setBearing(-heading);
    }else if(guiding&&following&&initialBearingRef.current!=null){
      mapInst.current.setBearing(initialBearingRef.current);
    }else if(!guiding){
      mapInst.current.setBearing(0);
    }
    // guiding && !following の時は何もしない（ユーザーが自由操作中）
  },[guiding,following,heading]);

  // GPSマーカーの方向矢印をheading変化に追従させる
  useEffect(()=>{
    if(!gpsMarkerRef.current||!window.L)return;
    const hd=headingRef.current;
    // マップがsetBearingで回転中は矢印を常に上向き(0)にする（マップ自体が回転してるため）
    const mapBearing=(mapInst.current&&typeof mapInst.current.getBearing==='function')?mapInst.current.getBearing():0;
    const arrowAngle=hd!=null?hd+mapBearing:null;
    const arrowHtml=arrowAngle!=null?`<div style="position:absolute;top:-18px;left:50%;transform:translateX(-50%) rotate(${arrowAngle}deg);transform-origin:center 24px;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:14px solid #4285f4;filter:drop-shadow(0 0 3px rgba(66,133,244,.6));z-index:2"></div>`:"";
    const icon=window.L.divIcon({className:"",html:`<div style="position:relative">${arrowHtml}<div style="position:absolute;inset:-10px;border-radius:50%;background:#4285f420;border:1.5px solid #4285f440;animation:locPulse 2s ease-in-out infinite"></div><div style="width:12px;height:12px;border-radius:50%;background:#4285f4;border:2.5px solid #fff;box-shadow:0 0 6px rgba(66,133,244,.5)"></div></div>`,iconSize:[12,12],iconAnchor:[6,6]});
    gpsMarkerRef.current.setIcon(icon);
  },[heading,guiding,following]);

  // 案内開始/終了
  const startGuiding=useCallback(()=>{
    const doStart=()=>{
      setGuiding(true);
      setFollowing(true);
      setPanelMin(true);
      startWatch();
      // 出発地点を固定保存（マーカー表示用、案内中に動かない）
      const origSpot=origin==="__gps__"&&gpsOriginPos?{lat:gpsOriginPos.lat,lng:gpsOriginPos.lng}:NAV_SPOTS.find(s=>s.id===origin);
      if(origSpot)guidingOriginRef.current={lat:origSpot.lat,lng:origSpot.lng};
      const destSpot=NAV_SPOTS.find(s=>s.id===destination);
      if(origSpot&&destSpot&&mapInst.current&&typeof mapInst.current.setBearing==='function'){
        const b=bearingNav(origSpot.lat,origSpot.lng,destSpot.lat,destSpot.lng);
        initialBearingRef.current=b;
        mapInst.current.setBearing(b);
      }
      // 現在地にズームイン
      if(gpsPos&&mapInst.current){
        mapInst.current.flyTo([gpsPos.lat,gpsPos.lng],18,{duration:0.8});
      }else if(mapInst.current){
        navigator.geolocation?.getCurrentPosition((pos)=>{
          const {latitude:lat,longitude:lng,accuracy}=pos.coords;
          setGpsPos({lat,lng,accuracy});
          mapInst.current?.flyTo([lat,lng],18,{duration:0.8});
        },()=>{},{enableHighAccuracy:true,timeout:10000});
      }
    };
    // iOSではユーザージェスチャー内でコンパス権限を取得する必要がある
    if(typeof DeviceOrientationEvent!=="undefined"&&typeof DeviceOrientationEvent.requestPermission==="function"){
      DeviceOrientationEvent.requestPermission().then(r=>{
        compassPermRef.current=r==="granted";
        doStart();
      }).catch(()=>{compassPermRef.current=false;doStart();});
    }else{
      compassPermRef.current=true;
      doStart();
    }
  },[startWatch,gpsPos,gpsOriginPos,origin,destination]);
  const stopGuiding=useCallback(()=>{
    setGuiding(false);
    setFollowing(true);
    stopWatch();
    initialBearingRef.current=null;
    guidingOriginRef.current=null;
  },[stopWatch]);

  // 現在地に戻る（自動追従再開）
  const reCenter=useCallback(()=>{
    setFollowing(true);
    if(gpsPos&&mapInst.current){
      mapInst.current.flyTo([gpsPos.lat,gpsPos.lng],18,{duration:0.5});
    }
  },[gpsPos]);

  const getGpsOrigin=useCallback(()=>{
    if(!navigator.geolocation)return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos)=>{
        const {latitude:lat,longitude:lng,accuracy}=pos.coords;
        setGpsPos({lat,lng,accuracy});
        setOrigin("__gps__");setGpsOriginPos({lat,lng});setOriginFromGps(true);
        setGpsLoading(false);
      },
      ()=>setGpsLoading(false),
      {enableHighAccuracy:true,timeout:10000,maximumAge:30000}
    );
  },[setOrigin,setGpsOriginPos]);

  // Accept initial origin+destination from external navigation (e.g. TTView/HomeView building click)
  useEffect(()=>{
    if(initialDest){
      if(initialOrig){
        setOrigin(initialOrig);
        setNavPhase("route");
      } else {
        // GPS で現在地を取得して出発地に設定
        if(navigator.geolocation){
          setGpsLoading(true);
          navigator.geolocation.getCurrentPosition(
            pos=>{
              const {latitude:lat,longitude:lng,accuracy}=pos.coords;
              setGpsPos({lat,lng,accuracy});
              const ns=findNearestNavSpot(lat,lng);
              if(ns&&ns.distance<1500){setOrigin("__gps__");setGpsOriginPos({lat,lng});setOriginFromGps(true);}
              setGpsLoading(false);setNavPhase("route");
            },
            ()=>{setGpsLoading(false);setNavPhase("route");},
            {enableHighAccuracy:true,timeout:10000,maximumAge:30000}
          );
        } else {
          setNavPhase("route");
        }
      }
      setDestination(initialDest);
      onDestUsed?.();
    }
  },[initialDest]);

  // init map
  useEffect(()=>{
    if(!leafletReady||!mapRef.current||mapInst.current)return;
    const L=window.L;
    const map=L.map(mapRef.current,{center:[CAMPUS_CENTER.lat,CAMPUS_CENTER.lng],zoom:CAMPUS_ZOOM,zoomControl:false,attributionControl:false,rotate:true,touchRotate:true,bearing:0});
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:22,maxNativeZoom:19}).addTo(map);
    overlayRef.current=L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:22,maxNativeZoom:19,pane:"overlayPane",opacity:0.35}).addTo(map);
    L.control.zoom({position:"bottomright"}).addTo(map);
    mapInst.current=map;
    map.on("click",()=>{if(navPhaseRef.current==="search")setSearchMin(true);});
    map.on("dragstart",()=>{if(guidingRef.current)setFollowing(false);});
    return()=>{map.remove();mapInst.current=null;};
  },[leafletReady]);

  // refs for click handler
  const selectModeRef=useRef(selectMode);
  useEffect(()=>{selectModeRef.current=selectMode;},[selectMode]);
  const originRef=useRef(origin);
  useEffect(()=>{originRef.current=origin;},[origin]);
  const destRef=useRef(destination);
  useEffect(()=>{destRef.current=destination;},[destination]);
  const navPhaseRef=useRef(navPhase);
  useEffect(()=>{navPhaseRef.current=navPhase;},[navPhase]);
  const spotGroupRef=useRef(spotGroup);
  useEffect(()=>{spotGroupRef.current=spotGroup;},[spotGroup]);

  // update markers/route
  useEffect(()=>{
    if(!mapInst.current||!leafletReady)return;
    const L=window.L;
    const map=mapInst.current;
    layersRef.current.forEach(l=>{try{map.removeLayer(l);}catch{}});
    layersRef.current=[];
    gpsMarkerRef.current=null;

    const originSpot=origin==="__gps__"&&gpsOriginPos?{id:"__gps__",label:"現在地",lat:gpsOriginPos.lat,lng:gpsOriginPos.lng,col:"#4285f4"}:NAV_SPOTS.find(s=>s.id===origin);
    const destSpot=NAV_SPOTS.find(s=>s.id===destination);

    // All building dots
    const isGroupPhase=navPhase==="group"&&spotGroup;
    const groupBounds=[];
    NAV_SPOTS.forEach(s=>{
      const isOrig=s.id===origin,isDest=s.id===destination;
      if(isOrig||isDest)return;
      const inGroup=isGroupPhase&&s.id.startsWith(spotGroup+"_");
      // Group phase: prominent pins for group members, dim others
      if(inGroup){
        const gInfo=SPOT_GROUPS.find(g=>g.prefix===spotGroup);
        const col=gInfo?.col||s.col;
        const lbl=s.label.replace(/^[^（(]*[（(]/,"").replace(/[）)]$/,"")||s.short;
        const mkIcon=(showLabel,anim=false,delay=0)=>L.divIcon({className:"",html:showLabel
          ?`<div style="position:relative;display:flex;flex-direction:column;align-items:center;${anim?`animation:navPinPop .35s cubic-bezier(.34,1.56,.64,1) ${delay}ms both`:""}"><div style="background:${col};color:#fff;font-size:10px;font-weight:700;padding:3px 8px;border-radius:8px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.4);border:2px solid #fff">${lbl}</div><div style="width:2px;height:6px;background:#fff;opacity:.7"></div><div style="width:6px;height:6px;border-radius:50%;background:${col};border:1.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div></div>`
          :`<div style="position:relative;display:flex;flex-direction:column;align-items:center"><div style="width:14px;height:14px;border-radius:50%;background:${col};border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4);${anim?`animation:navPinDot .3s cubic-bezier(.34,1.56,.64,1) ${delay}ms both`:""}"></div></div>`,
          iconSize:[0,0],iconAnchor:[0,showLabel?40:7]});
        const m=L.marker([s.lat,s.lng],{icon:mkIcon(false),interactive:true,zIndexOffset:500}).addTo(map);
        m._mkIcon=mkIcon;
        m.on("click",()=>{setDestination(s.id);setSpotGroup(null);setNavPhase("detail");});
        layersRef.current.push(m);
        groupBounds.push([s.lat,s.lng]);
      } else {
        const opacity=isGroupPhase?"20":"55";
        const borderOp=isGroupPhase?"40":"80";
        const icon=L.divIcon({className:"",html:`<div style="width:10px;height:10px;border-radius:50%;background:${s.col}${opacity};border:1.5px solid ${s.col}${borderOp};cursor:pointer;transition:transform .15s" onmouseover="this.style.transform='scale(1.6)'" onmouseout="this.style.transform='scale(1)'"></div>`,iconSize:[10,10],iconAnchor:[5,5]});
        const m=L.marker([s.lat,s.lng],{icon,interactive:true}).addTo(map);
        m.on("click",()=>{
          const mode=selectModeRef.current;
          const phase=navPhaseRef.current;
          if(mode==="origin"){setOrigin(s.id);setGpsOriginPos(null);setOriginFromGps(false);setSelectMode(null);}
          else if(mode==="destination"){setDestination(s.id);setSelectMode(null);setNavPhase("detail");}
          else if(phase==="search"||phase==="detail"||phase==="group"){setDestination(s.id);setSpotGroup(null);setNavPhase("detail");}
          else if(phase==="route"&&!originRef.current){setOrigin(s.id);setGpsOriginPos(null);setOriginFromGps(false);}
        });
        m.bindTooltip(s.label,{direction:"top",offset:[0,-8],className:"nav-tip"});
        layersRef.current.push(m);
      }
    });
    // Fit map to group bounds
    if(isGroupPhase&&groupBounds.length>0){
      if(groupBounds.length===1)map.flyTo(groupBounds[0],18,{duration:.4});
      else map.fitBounds(L.latLngBounds(groupBounds).pad(0.3));
    }

    // Zoom-dependent label toggle for group pins
    if(isGroupPhase){
      let prevShow=false;
      const onZoom=()=>{
        const show=map.getZoom()>=17;
        if(show===prevShow)return;
        prevShow=show;
        const center=map.getCenter();
        const pins=layersRef.current.filter(m=>m._mkIcon);
        const dists=pins.map(m=>{const ll=m.getLatLng();return Math.hypot(ll.lat-center.lat,ll.lng-center.lng);});
        const maxD=Math.max(...dists)||1;
        pins.forEach((m,i)=>{m.setIcon(m._mkIcon(show,true,Math.round((dists[i]/maxD)*200)));});
      };
      map.on("zoomend",onZoom);
      layersRef.current.push({remove:()=>map.off("zoomend",onZoom)});
    }

    // Route polyline
    if(route&&route.coords.length>1){
      const latlngs=route.coords.map(c=>[c.lat,c.lng]);

      // 案内中: GPSに最も近いルート上のセグメント射影点で分割 → 通過済み=グレー, 残り=緑
      if(guiding&&gpsPos){
        let bestSeg=0,bestT=0,bestDist=Infinity;
        for(let i=0;i<latlngs.length-1;i++){
          const [ay,ax]=latlngs[i],[by,bx]=latlngs[i+1];
          const dy=by-ay,dx=bx-ax,lenSq=dy*dy+dx*dx;
          let t=lenSq===0?0:((gpsPos.lat-ay)*dy+(gpsPos.lng-ax)*dx)/lenSq;
          t=Math.max(0,Math.min(1,t));
          const d=haversineNav(gpsPos.lat,gpsPos.lng,ay+t*dy,ax+t*dx);
          if(d<bestDist){bestDist=d;bestSeg=i;bestT=t;}
        }
        const [ay,ax]=latlngs[bestSeg],[by,bx]=latlngs[bestSeg+1];
        const proj=[ay+bestT*(by-ay),ax+bestT*(bx-ax)];
        // 通過済み部分（先頭〜射影点）
        const passed=[...latlngs.slice(0,bestSeg+1),proj];
        // 残り部分（射影点〜ゴール）
        const remaining=[proj,...latlngs.slice(bestSeg+1)];

        if(passed.length>1){
          const pg=L.polyline(passed,{color:"#888",weight:5,opacity:0.4,lineCap:"round",lineJoin:"round",dashArray:"6 8"}).addTo(map);
          layersRef.current.push(pg);
        }
        if(remaining.length>1){
          const rGlow=L.polyline(remaining,{color:"#4de8b0",weight:12,opacity:0.15,lineCap:"round",lineJoin:"round"}).addTo(map);
          const rShadow=L.polyline(remaining,{color:"#000",weight:7,opacity:0.3,lineCap:"round",lineJoin:"round"}).addTo(map);
          const rLine=L.polyline(remaining,{color:"#4de8b0",weight:5,opacity:0.95,lineCap:"round",lineJoin:"round"}).addTo(map);
          layersRef.current.push(rGlow,rShadow,rLine);
        }
      }else{
        // 通常表示
        const glow=L.polyline(latlngs,{color:"#4de8b0",weight:12,opacity:0.15,lineCap:"round",lineJoin:"round"}).addTo(map);
        const shadow=L.polyline(latlngs,{color:"#000",weight:7,opacity:0.3,lineCap:"round",lineJoin:"round"}).addTo(map);
        const line=L.polyline(latlngs,{color:"#4de8b0",weight:5,opacity:0.95,lineCap:"round",lineJoin:"round"}).addTo(map);
        layersRef.current.push(glow,shadow,line);
        map.fitBounds(line.getBounds().pad(0.25));
      }
    }

    // Origin marker — 白丸（中心アンカー）、案内中はguidingOriginRefの固定位置を使用
    const originPos=guiding&&guidingOriginRef.current?guidingOriginRef.current:originSpot;
    if(originPos){
      const icon=L.divIcon({className:"",html:`<div style="width:18px;height:18px;border-radius:50%;background:#fff;border:3px solid #ccc;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center"><div style="width:6px;height:6px;border-radius:50%;background:#aaa"></div></div>`,iconSize:[18,18],iconAnchor:[9,9]});
      const m=L.marker([originPos.lat,originPos.lng],{icon,zIndexOffset:1000}).addTo(map);
      m.bindTooltip(`出発: ${originSpot?.label||"現在地"}`,{direction:"top",offset:[0,-12],className:"nav-tip"});
      layersRef.current.push(m);
    }

    // Destination marker — accent pin style
    if(destSpot){
      const icon=L.divIcon({className:"",html:`
        <div style="position:relative;width:32px;height:42px">
          <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:10px;height:10px;border-radius:50%;background:rgba(0,0,0,.2);filter:blur(3px)"></div>
          <div style="position:absolute;bottom:4px;left:50%;transform:translateX(-50%);width:28px;height:28px;border-radius:50%;background:${T.accent};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#fff"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg>
          </div>
        </div>`,iconSize:[32,42],iconAnchor:[16,42]});
      const m=L.marker([destSpot.lat,destSpot.lng],{icon,zIndexOffset:1000}).addTo(map);
      m.bindTooltip(`到着: ${destSpot.label}`,{direction:"top",offset:[0,-44],className:"nav-tip"});
      layersRef.current.push(m);
    }

    // GPS位置マーカー
    if(gpsPos){
      const hd=headingRef.current;
      const mapBearing=(map&&typeof map.getBearing==='function')?map.getBearing():0;
      const arrowAngle=hd!=null?hd+mapBearing:null;
      const arrowHtml=arrowAngle!=null?`<div style="position:absolute;top:-18px;left:50%;transform:translateX(-50%) rotate(${arrowAngle}deg);transform-origin:center 24px;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:14px solid #4285f4;filter:drop-shadow(0 0 3px rgba(66,133,244,.6));z-index:2"></div>`:"";
      const gpsDot=L.divIcon({className:"",html:`<div style="position:relative">${arrowHtml}<div style="position:absolute;inset:-10px;border-radius:50%;background:#4285f420;border:1.5px solid #4285f440;animation:locPulse 2s ease-in-out infinite"></div><div style="width:12px;height:12px;border-radius:50%;background:#4285f4;border:2.5px solid #fff;box-shadow:0 0 6px rgba(66,133,244,.5)"></div></div>`,iconSize:[12,12],iconAnchor:[6,6]});
      const gm=L.marker([gpsPos.lat,gpsPos.lng],{icon:gpsDot,zIndexOffset:900}).addTo(map);
      gm.bindTooltip(`<b>現在地</b>`,{direction:"top",offset:[0,-10],className:"nav-tip"});
      gpsMarkerRef.current=gm;
      layersRef.current.push(gm);
      if(gpsPos.accuracy&&gpsPos.accuracy<500){
        const circle=L.circle([gpsPos.lat,gpsPos.lng],{radius:gpsPos.accuracy,color:"#4285f4",fillColor:"#4285f4",fillOpacity:0.08,weight:1,opacity:0.3}).addTo(map);
        layersRef.current.push(circle);
      }
    }

    // detailフェーズ: 目的地にズーム
    if(!route&&destSpot&&!originSpot){
      map.flyTo([destSpot.lat,destSpot.lng],18,{duration:.4});
    }
    if(!route&&originSpot&&destSpot){
      map.fitBounds(L.latLngBounds([[originSpot.lat,originSpot.lng],[destSpot.lat,destSpot.lng]]).pad(0.3));
    }
  },[leafletReady,origin,destination,route,gpsPos,gpsOriginPos,guiding,navPhase,spotGroup]);

  /* ── Inline search for search phase ── */
  const [searchQ,setSearchQ]=useState("");
  const [openCatInline,setOpenCatInline]=useState(null);
  const [tipsOpen,setTipsOpen]=useState(false);

  if(!leafletReady)return <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center"}}><Loader msg="マップを読み込み中" size="md"/></div>;

  const tipStyle=`.nav-tip{background:${T.bg2}!important;color:${T.txH}!important;border:1px solid ${T.bdL}!important;border-radius:8px!important;font-size:11px!important;font-weight:600!important;padding:4px 10px!important;box-shadow:0 4px 16px rgba(0,0,0,.45)!important;font-family:inherit!important}.nav-tip::before{display:none!important}`;

  const hasRoute=!!route;
  const noRoute=origin&&destination&&origin!==destination&&!route;

  /* ── helper: destination spot ── */
  const destSpotInfo=NAV_SPOTS.find(s=>s.id===destination);

  /* ── Floating search card ── */
  const cardBase={position:"absolute",top:mob?10:14,left:mob?10:14,right:mob?10:"auto",width:mob?"auto":360,zIndex:1000,background:T.bg2,borderRadius:16,boxShadow:"0 4px 24px rgba(0,0,0,.45), 0 1px 3px rgba(0,0,0,.2)",border:`1px solid ${T.bdL}`,overflow:"visible"};

  const groupInfo=spotGroup?SPOT_GROUPS.find(g=>g.prefix===spotGroup):null;
  const groupSpots=spotGroup?NAV_SPOTS.filter(s=>s.id.startsWith(spotGroup+"_")):[];
  const searchFiltered=searchQ.trim().length>0?NAV_SPOTS.filter(s=>s.label.includes(searchQ)||s.short.includes(searchQ)||s.id.includes(searchQ.toLowerCase())):[];
  const searchInlineResults=searchQ.trim().length>0?buildSearchResults(searchFiltered):null;
  const searchInlineGrouped=searchQ.trim().length>0?SPOT_CATS.map(cat=>({...cat,spots:searchFiltered.filter(s=>s.cat===cat.id&&!isGroupableSpot(s))})).filter(g=>g.spots.length>0):[];
  const rawQuickInline=getNavQuickRaw();
  const quickItemsInline=rawQuickInline.map(id=>{
    if(id.startsWith("cat:")){const catId=id.slice(4);const cat=SPOT_CATS.find(c=>c.id===catId);return cat?{type:"cat",catId,label:cat.label,count:NAV_SPOTS.filter(s=>s.cat===catId).length}:null;}
    if(id.startsWith("grp:")){const pfx=id.slice(4);const g=SPOT_GROUPS.find(x=>x.prefix===pfx);return g?{type:"grp",prefix:pfx,label:g.label,col:g.col,count:NAV_SPOTS.filter(s=>s.id.startsWith(pfx+"_")).length}:null;}
    const s=NAV_SPOTS.find(s=>s.id===id);return s?{type:"spot",...s}:null;
  }).filter(Boolean);

  const stopProp=e=>{e.stopPropagation();};
  const searchCard=navPhase==="search"&&searchMin?
    <div onClick={()=>setSearchMin(false)} style={{position:"absolute",top:mob?10:14,left:mob?10:14,right:mob?10:"auto",width:mob?"auto":360,zIndex:1000,display:"flex",alignItems:"center",gap:10,padding:"12px 16px",background:T.bg2,borderRadius:16,border:`1px solid ${T.bdL}`,boxShadow:"0 4px 24px rgba(0,0,0,.45), 0 1px 3px rgba(0,0,0,.2)",cursor:"pointer",transition:"box-shadow .15s"}}>
      <span style={{display:"flex",color:T.txD}}>{I.search}</span>
      <span style={{fontSize:14,color:T.txD,flex:1}}>スポットを検索...</span>
    </div>
  :navPhase==="search"?
    /* ── Phase 1: Search (直接入力可能) ── */
    <div style={cardBase} onMouseDown={stopProp} onDoubleClick={stopProp} onKeyDown={stopProp} onKeyUp={stopProp}>
      <div style={{padding:"10px 10px 6px"}}>
        <div style={{position:"relative"}}>
          <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",display:"flex",color:T.txD,pointerEvents:"none"}}>{I.search}</span>
          <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="スポットを検索..." autoFocus style={{width:"100%",padding:"11px 10px 11px 34px",borderRadius:10,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:14,outline:"none",boxSizing:"border-box"}}/>
        </div>
      </div>
      <div style={{maxHeight:320,overflowY:"auto",padding:"0 6px 6px"}}>
        {searchQ.trim().length>0?<>
          {searchInlineResults.groups.map(g=>(
            <button key={g.prefix} onClick={()=>{setSpotGroup(g.prefix);setNavPhase("group");setSearchQ("");}} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"9px 10px",borderRadius:8,border:"none",background:"transparent",cursor:"pointer",textAlign:"left"}} onMouseEnter={e=>e.currentTarget.style.background=T.hover} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <div style={{width:24,height:24,borderRadius:6,background:`${g.col}30`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill={g.col} stroke="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/></svg>
              </div>
              <span style={{fontSize:13,fontWeight:600,color:T.txH,flex:1}}>{g.label}</span>
              <span style={{fontSize:11,color:T.txD}}>{g.spots.length}件 ›</span>
            </button>
          ))}
          {searchInlineGrouped.map(g=><div key={g.id}>
            <div style={{fontSize:10,fontWeight:700,color:T.txD,letterSpacing:.5,padding:"8px 10px 3px"}}>{g.label}</div>
            {g.spots.map(s=>(
              <button key={s.id} onClick={()=>{setDestination(s.id);setSpotGroup(null);setNavPhase("detail");setSearchQ("");if(mapInst.current)mapInst.current.flyTo([s.lat,s.lng],18,{duration:.5});}} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:8,border:"none",background:"transparent",cursor:"pointer",textAlign:"left"}} onMouseEnter={e=>e.currentTarget.style.background=T.hover} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <div style={{width:20,height:20,borderRadius:5,background:`${s.col}40`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:7,fontWeight:700,color:s.col}}>{s.short}</span></div>
                <span style={{fontSize:12,fontWeight:400,color:T.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{s.label}</span>
              </button>
            ))}
          </div>)}
          {searchInlineResults.groups.length===0&&searchInlineGrouped.length===0&&<div style={{padding:"16px 0",fontSize:12,color:T.txD,textAlign:"center"}}>見つかりません</div>}
        </>:<>
          <div style={{fontSize:10,fontWeight:700,color:T.txD,letterSpacing:.5,padding:"6px 10px 3px"}}>よく使う</div>
          {quickItemsInline.map((item,i)=>{
            if(item.type==="cat") return <button key={"cat:"+item.catId} onClick={()=>setOpenCatInline(item.catId)} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,padding:"9px 10px",borderRadius:8,border:"none",background:"transparent",cursor:"pointer",textAlign:"left"}} onMouseEnter={e=>e.currentTarget.style.background=T.hover} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <span style={{fontSize:12,fontWeight:500,color:T.txH}}>{item.label}</span>
              <span style={{fontSize:11,color:T.txD}}>{item.count}件 ›</span>
            </button>;
            if(item.type==="grp") return <button key={"grp:"+item.prefix} onClick={()=>{setSpotGroup(item.prefix);setNavPhase("group");setSearchQ("");}} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"9px 10px",borderRadius:8,border:"none",background:"transparent",cursor:"pointer",textAlign:"left"}} onMouseEnter={e=>e.currentTarget.style.background=T.hover} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <div style={{width:20,height:20,borderRadius:5,background:`${item.col}30`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><div style={{width:8,height:8,borderRadius:2,background:item.col}}/></div>
              <span style={{fontSize:12,fontWeight:500,color:T.txH,flex:1}}>{item.label}</span>
              <span style={{fontSize:11,color:T.txD}}>{item.count}件 ›</span>
            </button>;
            return <button key={item.id} onClick={()=>{setDestination(item.id);setSpotGroup(null);setNavPhase("detail");setSearchQ("");if(mapInst.current)mapInst.current.flyTo([item.lat,item.lng],18,{duration:.5});}} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:8,border:"none",background:"transparent",cursor:"pointer",textAlign:"left"}} onMouseEnter={e=>e.currentTarget.style.background=T.hover} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <div style={{width:20,height:20,borderRadius:5,background:`${item.col}40`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:7,fontWeight:700,color:item.col}}>{item.short}</span></div>
              <span style={{fontSize:12,fontWeight:400,color:T.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{item.label}</span>
            </button>;
          })}
          <div style={{height:1,background:T.bd,margin:"6px 10px"}}/>
          {SPOT_CATS.filter(cat=>NAV_SPOTS.some(s=>s.cat===cat.id)).map(cat=>{
            const catSpots=NAV_SPOTS.filter(s=>s.cat===cat.id&&!isGroupableSpot(s));
            const catGroups=SPOT_GROUPS.filter(g=>NAV_SPOTS.some(s=>s.cat===cat.id&&s.id.startsWith(g.prefix+"_")));
            // カテゴリ内にグループ1つだけ（個別スポットなし）→ 直接グループリンク
            if(catSpots.length===0&&catGroups.length===1){
              const g=catGroups[0];
              const cnt=NAV_SPOTS.filter(s=>s.id.startsWith(g.prefix+"_")).length;
              return <button key={cat.id} onClick={()=>{setSpotGroup(g.prefix);setNavPhase("group");setSearchQ("");setOpenCatInline(null);}} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"10px 10px",borderRadius:8,border:"none",background:"transparent",cursor:"pointer",textAlign:"left"}} onMouseEnter={e=>e.currentTarget.style.background=T.hover} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <div style={{width:20,height:20,borderRadius:6,background:`${g.col}30`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill={g.col} stroke="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/></svg>
                </div>
                <span style={{fontSize:13,fontWeight:500,color:T.txH,flex:1}}>{cat.label}</span>
                <span style={{fontSize:11,color:T.txD}}>{cnt}件 ›</span>
              </button>;
            }
            const isOpen=openCatInline===cat.id;
            return <div key={cat.id}>
              <button onClick={()=>setOpenCatInline(isOpen?null:cat.id)} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,padding:"10px 10px",borderRadius:8,border:"none",background:isOpen?T.bg3:"transparent",cursor:"pointer",textAlign:"left"}} onMouseEnter={e=>{if(!isOpen)e.currentTarget.style.background=T.hover}} onMouseLeave={e=>{if(!isOpen)e.currentTarget.style.background=isOpen?T.bg3:"transparent"}}>
                <span style={{fontSize:13,fontWeight:500,color:T.txH}}>{cat.label}</span>
                <span style={{fontSize:11,color:T.txD}}>{catSpots.length+catGroups.length}件 {isOpen?"▾":"›"}</span>
              </button>
              {isOpen&&<div style={{padding:"0 4px 4px"}}>
                {catGroups.map(g=>{
                  const cnt=NAV_SPOTS.filter(s=>s.id.startsWith(g.prefix+"_")).length;
                  return <button key={g.prefix} onClick={()=>{setSpotGroup(g.prefix);setNavPhase("group");setSearchQ("");setOpenCatInline(null);}} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:8,border:"none",background:"transparent",cursor:"pointer",textAlign:"left"}} onMouseEnter={e=>e.currentTarget.style.background=T.hover} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div style={{width:20,height:20,borderRadius:6,background:`${g.col}30`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill={g.col} stroke="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/></svg>
                    </div>
                    <span style={{fontSize:12,fontWeight:400,color:T.tx,flex:1}}>{g.label}</span>
                    <span style={{fontSize:10,color:T.txD}}>{cnt}件 ›</span>
                  </button>;
                })}
                {catSpots.map(s=>(
                  <button key={s.id} onClick={()=>{setDestination(s.id);setSpotGroup(null);setNavPhase("detail");setSearchQ("");setOpenCatInline(null);if(mapInst.current)mapInst.current.flyTo([s.lat,s.lng],18,{duration:.5});}} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:8,border:"none",background:"transparent",cursor:"pointer",textAlign:"left"}} onMouseEnter={e=>e.currentTarget.style.background=T.hover} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div style={{width:20,height:20,borderRadius:5,background:`${s.col}40`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:7,fontWeight:700,color:s.col}}>{s.short}</span></div>
                    <span style={{fontSize:12,fontWeight:400,color:T.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{s.label}</span>
                  </button>
                ))}
              </div>}
            </div>;
          })}
        </>}
      </div>
    </div>
  :navPhase==="group"?
    /* ── Phase 1.5: Group pins on map ── */
    <div style={cardBase}>
      <div style={{padding:14}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
          <div style={{width:36,height:36,borderRadius:10,background:`${groupInfo?.col||T.txD}30`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill={groupInfo?.col||T.txD} stroke="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/></svg>
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:15,fontWeight:700,color:T.txH}}>{groupInfo?.label||""}</div>
            <div style={{fontSize:11,color:T.txD,marginTop:1}}>{groupSpots.length}件のスポット</div>
          </div>
          <button onClick={()=>{setSpotGroup(null);setNavPhase("search");}} style={{display:"flex",alignItems:"center",justifyContent:"center",width:28,height:28,borderRadius:"50%",border:`1px solid ${T.bd}`,background:"transparent",cursor:"pointer",color:T.txD,flexShrink:0}}>{I.x}</button>
        </div>
        <div style={{fontSize:11,color:T.txD}}>マップ上のピンをタップして選択</div>
      </div>
    </div>
  :navPhase==="detail"?
    /* ── Phase 2: Spot detail + navigate button ── */
    <div style={{...cardBase,top:"auto",bottom:mob?10:14}}>
      <div style={{padding:14}}>
        {destSpotInfo&&<>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:destSpotInfo.meta?8:12}}>
            <div style={{width:36,height:36,borderRadius:10,background:`${destSpotInfo.col}30`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              {destSpotInfo.cat==="restaurant"
                ?<svg width="18" height="18" viewBox="0 0 24 24" fill={destSpotInfo.col} stroke="none"><path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z"/></svg>
                :<span style={{fontSize:12,fontWeight:800,color:destSpotInfo.col}}>{destSpotInfo.short}</span>}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:15,fontWeight:700,color:T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{destSpotInfo.label}</div>
              <div style={{fontSize:11,color:T.txD,marginTop:1}}>{SPOT_CATS.find(c=>c.id===destSpotInfo.cat)?.label||""}</div>
            </div>
            <button onClick={()=>{setDestination(null);setOrigin(null);setNavPhase("search");}} style={{display:"flex",alignItems:"center",justifyContent:"center",width:28,height:28,borderRadius:"50%",border:`1px solid ${T.bd}`,background:"transparent",cursor:"pointer",color:T.txD,flexShrink:0}}>{I.x}</button>
          </div>
          {/* ── Restaurant meta info ── */}
          {destSpotInfo.meta&&<div style={{marginBottom:12,padding:"10px 12px",borderRadius:10,background:T.bg3,display:"flex",flexDirection:"column",gap:6}}>
            {destSpotInfo.meta.genre&&<div style={{display:"flex",alignItems:"center",gap:8}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.txD} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
              <span style={{fontSize:12,color:T.txH,fontWeight:500}}>{destSpotInfo.meta.genre}</span>
            </div>}
            {destSpotInfo.meta.hours&&<div style={{display:"flex",alignItems:"center",gap:8}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.txD} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span style={{fontSize:12,color:T.txH}}>{destSpotInfo.meta.hours}</span>
            </div>}
            {destSpotInfo.meta.budget&&<div style={{display:"flex",alignItems:"center",gap:8}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.txD} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
              <span style={{fontSize:12,color:T.txH}}>{destSpotInfo.meta.budget}</span>
            </div>}
            {destSpotInfo.meta.closed&&<div style={{display:"flex",alignItems:"center",gap:8}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.red||"#e5534b"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
              <span style={{fontSize:12,color:T.red||"#e5534b"}}>{destSpotInfo.meta.closed} 定休</span>
            </div>}
            {destSpotInfo.meta.desc&&<div style={{fontSize:11,color:T.txD,marginTop:2,lineHeight:1.5}}>{destSpotInfo.meta.desc}</div>}
            {destSpotInfo.meta.tips&&<>
              <button onClick={()=>setTipsOpen(!tipsOpen)} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:6,padding:"6px 0 0",border:"none",background:"transparent",cursor:"pointer"}}>
                <span style={{fontSize:11,fontWeight:600,color:T.txH}}>初めて行く人へ</span>
                <span style={{fontSize:10,color:T.txD}}>{tipsOpen?"▾ 閉じる":"› 詳しく見る"}</span>
              </button>
              {tipsOpen&&<div style={{marginTop:6,display:"flex",flexDirection:"column",gap:8}}>
                {destSpotInfo.meta.tips.map((sec,i)=><div key={i}>
                  <div style={{fontSize:11,fontWeight:600,color:T.txH,marginBottom:3}}>{sec.title}</div>
                  {sec.items.map((item,j)=><div key={j} style={{fontSize:10,color:T.txD,lineHeight:1.5,paddingLeft:8,position:"relative"}}>
                    <span style={{position:"absolute",left:0,color:T.txD}}>•</span>{item}
                  </div>)}
                </div>)}
              </div>}
            </>}
          </div>}
          <button onClick={()=>{
            setNavPhase("route");
            // GPS で現在地を自動取得
            if(navigator.geolocation){
              setGpsLoading(true);
              navigator.geolocation.getCurrentPosition(
                pos=>{
                  const {latitude:lat,longitude:lng,accuracy}=pos.coords;
                  setGpsPos({lat,lng,accuracy});
                  setOrigin("__gps__");setGpsOriginPos({lat,lng});setOriginFromGps(true);
                  setGpsLoading(false);
                },
                ()=>setGpsLoading(false),
                {enableHighAccuracy:true,timeout:10000,maximumAge:30000}
              );
            }
          }} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,width:"100%",padding:"11px 0",borderRadius:12,border:"none",background:"linear-gradient(135deg,#4de8b0,#34a853)",cursor:"pointer",transition:"opacity .15s"}} onMouseEnter={e=>e.currentTarget.style.opacity=".85"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
            <span style={{fontSize:14,fontWeight:700,color:"#fff"}}>ここへ案内</span>
          </button>
        </>}
      </div>
    </div>
  :
    /* ── Phase 3: Route mode (origin selector + destination) ── */
    <div style={cardBase}>
      <div style={{display:"flex",alignItems:"stretch",padding:"4px 8px 4px 4px"}}>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",width:32,flexShrink:0,padding:"12px 0"}}>
          <div style={{width:10,height:10,borderRadius:"50%",background:origin?"#fff":"#ccc",border:"2px solid #bbb",flexShrink:0}}/>
          <div style={{width:2,flex:1,background:`${T.txD}30`,margin:"3px 0",minHeight:12}}/>
          <div style={{width:10,height:10,borderRadius:"50%",background:destination?T.accent:`${T.accent}60`,border:`2px solid ${T.accent}`,flexShrink:0}}/>
        </div>
        <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
          <div style={{borderBottom:`1px solid ${T.bd}`}}>
            <SpotSelector value={origin} onChange={v=>{setOrigin(v);setGpsOriginPos(null);setOriginFromGps(false);setSelectMode(null);}} placeholder="出発地を選択" accent="#34a853" onGps={getGpsOrigin} gpsLoading={gpsLoading}/>
          </div>
          <SpotSelector value={destination} onChange={v=>{if(v){setDestination(v);}else{setDestination(null);setOrigin(null);setNavPhase("search");}}} placeholder="目的地を選択" accent={T.accent}/>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,flexShrink:0,paddingLeft:4}}>
          <button onClick={getGpsOrigin} disabled={gpsLoading} style={{display:"flex",alignItems:"center",justifyContent:"center",width:32,height:32,borderRadius:"50%",border:`1px solid ${gpsPos?"#4285f440":T.bd}`,background:gpsPos?"#4285f410":"transparent",cursor:gpsLoading?"wait":"pointer",color:gpsPos?"#4285f4":T.txD,transition:"all .15s",opacity:gpsLoading?0.5:1}} title="現在地を出発地に設定">
            {I.tgt}
          </button>
          <button onClick={swap} style={{display:"flex",alignItems:"center",justifyContent:"center",width:32,height:32,borderRadius:"50%",border:`1px solid ${T.bd}`,background:"transparent",cursor:"pointer",color:T.txD,transition:"all .15s"}} title="入れ替え">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="7 3 7 21"/><polyline points="4 6 7 3 10 6"/><polyline points="17 21 17 3"/><polyline points="14 18 17 21 20 18"/></svg>
          </button>
        </div>
      </div>
      {selectMode&&<div style={{padding:"6px 14px 10px",borderTop:`1px solid ${T.bd}`}}>
        <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",borderRadius:8,background:`${T.accent}10`}}>
          <span style={{display:"flex",color:T.accent}}>{I.tgt}</span>
          <span style={{fontSize:11,color:T.accent,fontWeight:500}}>マップ上の建物をタップして{selectMode==="origin"?"出発地":"目的地"}を選択</span>
        </div>
      </div>}
    </div>;

  /* ── Floating route info card (bottom) ── */
  const routeCard=hasRoute&&!panelMin&&<div style={{
    position:"absolute",
    bottom:mob?12:20,
    left:mob?12:14,
    right:mob?12:"auto",
    width:mob?"auto":360,
    zIndex:1000,
    background:T.bg2,
    borderRadius:16,
    boxShadow:"0 -2px 20px rgba(0,0,0,.35), 0 1px 3px rgba(0,0,0,.2)",
    border:`1px solid ${T.bdL}`,
    padding:"16px 18px",
    animation:"navSlideUp .25s ease-out",
  }}>
    <div style={{display:"flex",alignItems:"center",gap:14}}>
      {/* Time circle */}
      <div style={{width:56,height:56,borderRadius:"50%",background:"linear-gradient(135deg,#4de8b0,#34a853)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0}}>
        <span style={{fontSize:20,fontWeight:800,color:"#fff",lineHeight:1}}>{route.minutes}</span>
        <span style={{fontSize:9,fontWeight:600,color:"rgba(255,255,255,.85)",marginTop:-1}}>分</span>
      </div>

      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"baseline",gap:6}}>
          <span style={{fontSize:16,fontWeight:700,color:T.txH}}>{route.distance}m</span>
          <span style={{fontSize:12,color:T.txD}}>徒歩</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginTop:5,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:4,padding:"3px 8px",borderRadius:6,background:`${T.bg3}`}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4de8b0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span style={{fontSize:11,fontWeight:600,color:T.txH}}>約{route.minutes}分</span>
          </div>
          {route.hasStairs&&<div style={{display:"flex",alignItems:"center",gap:4,padding:"3px 8px",borderRadius:6,background:`${T.orange}12`}}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.orange} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 18h4v-4h4v-4h4v-4h4"/></svg>
            <span style={{fontSize:11,fontWeight:600,color:T.orange}}>階段あり</span>
          </div>}
        </div>
      </div>

      {/* Close/minimize */}
      <button onClick={()=>setPanelMin(true)} style={{position:"absolute",top:8,right:10,background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex",padding:4}} title="閉じる">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 15 12 9 18 15"/></svg>
      </button>
    </div>
    {/* 案内を開始ボタン（出発地がGPS=現在地の時のみ） */}
    {!guiding&&originFromGps&&<button onClick={startGuiding} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,width:"100%",padding:"12px 0",marginTop:10,borderRadius:12,border:"none",background:"linear-gradient(135deg,#4de8b0,#34a853)",cursor:"pointer",transition:"opacity .15s"}} onMouseEnter={e=>e.currentTarget.style.opacity=".85"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
      <span style={{fontSize:14,fontWeight:700,color:"#fff"}}>案内を開始</span>
    </button>}
    {guiding&&<button onClick={stopGuiding} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,width:"100%",padding:"12px 0",marginTop:10,borderRadius:12,border:`1.5px solid ${T.red}40`,background:`${T.red}12`,cursor:"pointer",transition:"opacity .15s"}}>
      <span style={{fontSize:14,fontWeight:700,color:T.red}}>案内を終了</span>
    </button>}
  </div>;

  /* ── Minimized route pill ── */
  const routePill=hasRoute&&panelMin&&<button onClick={()=>setPanelMin(false)} style={{
    position:"absolute",
    bottom:mob?12:20,
    left:mob?12:14,
    zIndex:1000,
    display:"flex",alignItems:"center",gap:8,
    padding:"10px 16px",
    borderRadius:28,
    background:"linear-gradient(135deg,#4de8b0,#34a853)",
    border:"none",
    boxShadow:"0 4px 16px rgba(77,232,176,.3), 0 2px 6px rgba(0,0,0,.2)",
    cursor:"pointer",
    animation:"navSlideUp .2s ease-out",
  }}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
    <span style={{fontSize:14,fontWeight:700,color:"#fff"}}>{route.minutes}分</span>
    <span style={{fontSize:12,fontWeight:500,color:"rgba(255,255,255,.8)"}}>{route.distance}m</span>
  </button>;

  /* ── No route error ── */
  const noRouteCard=noRoute&&<div style={{
    position:"absolute",
    bottom:mob?12:20,
    left:mob?12:14,
    right:mob?12:"auto",
    width:mob?"auto":360,
    zIndex:1000,
    background:T.bg2,
    borderRadius:14,
    boxShadow:"0 4px 20px rgba(0,0,0,.35)",
    border:`1px solid ${T.red}30`,
    padding:"14px 18px",
    display:"flex",alignItems:"center",gap:10,
    animation:"navSlideUp .25s ease-out",
  }}>
    <div style={{width:36,height:36,borderRadius:"50%",background:`${T.red}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.red} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
    </div>
    <div>
      <div style={{fontSize:13,fontWeight:600,color:T.txH}}>経路が見つかりません</div>
      <div style={{fontSize:11,color:T.txD,marginTop:2}}>別のルートをお試しください</div>
    </div>
  </div>;

  return <div style={{flex:1,position:"relative",overflow:"hidden"}}>
    <style>{tipStyle}{`
@keyframes navSlideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes navPinPop{0%{opacity:0;transform:scale(.3) translateY(8px)}60%{opacity:1;transform:scale(1.08) translateY(-1px)}100%{opacity:1;transform:scale(1) translateY(0)}}
@keyframes navPinDot{0%{transform:scale(.5)}60%{transform:scale(1.15)}100%{transform:scale(1)}}
@keyframes locPulse{0%,100%{opacity:.6;transform:scale(1)}50%{opacity:1;transform:scale(1.5)}}
    `}</style>
    {/* Full-screen map */}
    <div ref={mapRef} style={{position:"absolute",inset:0}}/>
    {/* Floating UI */}
    {!guiding&&searchCard}
    {routeCard}
    {routePill}
    {noRouteCard}
    {/* 案内中: 終了ボタン（searchCardが非表示のため） */}
    {guiding&&<div style={{position:"absolute",top:mob?10:14,left:mob?10:14,right:mob?10:"auto",width:mob?"auto":320,zIndex:1000}}>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:T.bg2,borderRadius:14,boxShadow:"0 4px 20px rgba(0,0,0,.4)",border:`1px solid #4de8b060`}}>
        <div style={{width:8,height:8,borderRadius:"50%",background:following?"#4de8b0":"#888",animation:following?"locPulse 1.5s infinite":"none",flexShrink:0}}/>
        <span style={{fontSize:13,fontWeight:700,color:following?"#4de8b0":"#888",flex:1}}>{following?"案内中":"自由操作中"}</span>
        {route&&<span style={{fontSize:12,fontWeight:600,color:T.txH}}>{route.distance}m / {route.minutes}分</span>}
        <button onClick={stopGuiding} style={{padding:"5px 12px",borderRadius:8,border:`1px solid ${T.red}40`,background:`${T.red}10`,cursor:"pointer",fontSize:11,fontWeight:600,color:T.red}}>終了</button>
      </div>
    </div>}
    {/* 案内中 + 自由操作中: 現在地に戻るボタン */}
    {guiding&&!following&&<button onClick={reCenter} style={{position:"absolute",bottom:hasRoute&&!panelMin?(mob?180:195):(mob?70:80),right:mob?12:14,zIndex:1000,display:"flex",alignItems:"center",gap:6,padding:"10px 16px",borderRadius:28,background:T.bg2,border:`1px solid #4285f440`,boxShadow:"0 4px 16px rgba(0,0,0,.35)",cursor:"pointer",animation:"navSlideUp .2s ease-out",transition:"bottom .25s ease"}}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4285f4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4m-10-10h4m12 0h4"/></svg>
      <span style={{fontSize:13,fontWeight:700,color:"#4285f4"}}>現在地に戻る</span>
    </button>}
  </div>;
};
