import { useState, useEffect, useRef, useCallback } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { useLeaflet, Loader } from "../shared.jsx";
import { CAMPUS_CENTER, CAMPUS_ZOOM, SPOTS, SPOT_CATS, ENTRANCES, AREAS } from "../hooks/useLocationSharing.js";
import { useNavigation, NAV_SPOTS } from "../hooks/useNavigation.js";

const NON_GEO_NAV=new Set(["suzu","home_loc","commute","off_campus"]);
const haversineNav=(lat1,lng1,lat2,lng2)=>{
  const R=6371e3,toRad=d=>d*Math.PI/180;
  const dLat=toRad(lat2-lat1),dLng=toRad(lng2-lng1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
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

/* ── SpotSelector (search-first, category tabs) ── */
const SpotSelector=({value,onChange,placeholder,accent,onGps,gpsLoading})=>{
  const [open,setOpen]=useState(false);
  const [q,setQ]=useState("");
  const [openCat,setOpenCat]=useState(null);
  const sel=NAV_SPOTS.find(s=>s.id===value);

  const searching=q.trim().length>0;
  const filtered=searching?NAV_SPOTS.filter(s=>s.label.includes(q)||s.short.includes(q)||s.id.includes(q.toLowerCase())):[];
  const searchGrouped=searching?SPOT_CATS.map(cat=>({...cat,spots:filtered.filter(s=>s.cat===cat.id)})).filter(g=>g.spots.length>0):[];
  const catSpots=openCat?NAV_SPOTS.filter(s=>s.cat===openCat):[];
  const QUICK_IDS=["taki","eki","lib","main","coop","gym","w5"];
  const quickSpots=QUICK_IDS.map(id=>NAV_SPOTS.find(s=>s.id===id)).filter(Boolean);

  return <div style={{position:"relative",flex:1,minWidth:0}}>
    <button onClick={()=>{setOpen(p=>!p);setQ("");setOpenCat(null);}} style={{width:"100%",display:"flex",alignItems:"center",gap:6,padding:"9px 10px",borderRadius:8,border:"none",background:open?T.bg3:"transparent",cursor:"pointer",textAlign:"left",transition:"background .12s"}} onMouseEnter={e=>{if(!open)e.currentTarget.style.background=T.bg3}} onMouseLeave={e=>{if(!open)e.currentTarget.style.background="transparent"}}>
      {sel?<span style={{fontSize:13,fontWeight:600,color:T.txH,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sel.label}</span>
      :<span style={{fontSize:13,color:T.txD,flex:1}}>{placeholder}</span>}
    </button>
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
            {searchGrouped.length===0&&<div style={{padding:"16px 0",fontSize:12,color:T.txD,textAlign:"center"}}>見つかりません</div>}
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
            {quickSpots.map(s=>{
              const on=s.id===value;
              return <button key={s.id} onClick={()=>{onChange(s.id);setOpen(false);}} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:8,border:"none",background:on?`${accent}18`:"transparent",cursor:"pointer",textAlign:"left"}} onMouseEnter={e=>{if(!on)e.currentTarget.style.background=T.hover}} onMouseLeave={e=>{if(!on)e.currentTarget.style.background="transparent"}}>
                <div style={{width:20,height:20,borderRadius:5,background:on?s.col:`${s.col}40`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:7,fontWeight:700,color:on?"#fff":s.col}}>{s.short}</span></div>
                <span style={{fontSize:12,fontWeight:on?600:400,color:on?T.txH:T.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{s.label}</span>
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
  const {origin,setOrigin,destination,setDestination,route,swap}=useNavigation();
  const [selectMode,setSelectMode]=useState(null);
  const [panelMin,setPanelMin]=useState(false);
  const [gpsPos,setGpsPos]=useState(null);
  const [gpsLoading,setGpsLoading]=useState(false);

  const getGpsOrigin=useCallback(()=>{
    if(!navigator.geolocation)return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos)=>{
        const {latitude:lat,longitude:lng,accuracy}=pos.coords;
        setGpsPos({lat,lng,accuracy});
        const {spot,distance}=findNearestNavSpot(lat,lng);
        if(spot&&distance<1500) setOrigin(spot.id);
        setGpsLoading(false);
      },
      ()=>setGpsLoading(false),
      {enableHighAccuracy:true,timeout:10000,maximumAge:30000}
    );
  },[setOrigin]);

  // Accept initial origin+destination from external navigation (e.g. TTView/HomeView building click)
  useEffect(()=>{
    if(initialDest){
      if(initialOrig) setOrigin(initialOrig);
      setDestination(initialDest);
      onDestUsed?.();
    }
  },[initialDest]);

  // init map
  useEffect(()=>{
    if(!leafletReady||!mapRef.current||mapInst.current)return;
    const L=window.L;
    const map=L.map(mapRef.current,{center:[CAMPUS_CENTER.lat,CAMPUS_CENTER.lng],zoom:CAMPUS_ZOOM,zoomControl:false,attributionControl:false});
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:22,maxNativeZoom:19}).addTo(map);
    overlayRef.current=L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:22,maxNativeZoom:19,pane:"overlayPane",opacity:0.35}).addTo(map);
    L.control.zoom({position:"bottomright"}).addTo(map);
    mapInst.current=map;
    return()=>{map.remove();mapInst.current=null;};
  },[leafletReady]);

  // selectMode ref for click handler
  const selectModeRef=useRef(selectMode);
  useEffect(()=>{selectModeRef.current=selectMode;},[selectMode]);
  const originRef=useRef(origin);
  useEffect(()=>{originRef.current=origin;},[origin]);
  const destRef=useRef(destination);
  useEffect(()=>{destRef.current=destination;},[destination]);

  // update markers/route
  useEffect(()=>{
    if(!mapInst.current||!leafletReady)return;
    const L=window.L;
    const map=mapInst.current;
    layersRef.current.forEach(l=>{try{map.removeLayer(l);}catch{}});
    layersRef.current=[];

    const originSpot=NAV_SPOTS.find(s=>s.id===origin);
    const destSpot=NAV_SPOTS.find(s=>s.id===destination);

    // All building dots
    NAV_SPOTS.forEach(s=>{
      const isOrig=s.id===origin,isDest=s.id===destination;
      if(isOrig||isDest)return;
      const icon=L.divIcon({className:"",html:`<div style="width:10px;height:10px;border-radius:50%;background:${s.col}55;border:1.5px solid ${s.col}80;cursor:pointer;transition:transform .15s" onmouseover="this.style.transform='scale(1.6)'" onmouseout="this.style.transform='scale(1)'"></div>`,iconSize:[10,10],iconAnchor:[5,5]});
      const m=L.marker([s.lat,s.lng],{icon,interactive:true}).addTo(map);
      m.on("click",()=>{
        const mode=selectModeRef.current;
        if(mode==="origin"){setOrigin(s.id);setSelectMode(null);}
        else if(mode==="destination"){setDestination(s.id);setSelectMode(null);}
        else if(!originRef.current){setOrigin(s.id);}
        else if(!destRef.current){setDestination(s.id);}
      });
      m.bindTooltip(s.label,{direction:"top",offset:[0,-8],className:"nav-tip"});
      layersRef.current.push(m);
    });

    // Route polyline
    if(route&&route.coords.length>1){
      const latlngs=route.coords.map(c=>[c.lat,c.lng]);
      const glow=L.polyline(latlngs,{color:"#4de8b0",weight:12,opacity:0.15,lineCap:"round",lineJoin:"round"}).addTo(map);
      const shadow=L.polyline(latlngs,{color:"#000",weight:7,opacity:0.3,lineCap:"round",lineJoin:"round"}).addTo(map);
      const line=L.polyline(latlngs,{color:"#4de8b0",weight:5,opacity:0.95,lineCap:"round",lineJoin:"round"}).addTo(map);
      layersRef.current.push(glow,shadow,line);
      map.fitBounds(line.getBounds().pad(0.25));
    }

    // Origin marker — green pin style
    if(originSpot){
      const icon=L.divIcon({className:"",html:`
        <div style="position:relative;width:32px;height:42px">
          <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:10px;height:10px;border-radius:50%;background:rgba(0,0,0,.2);filter:blur(3px)"></div>
          <div style="position:absolute;bottom:4px;left:50%;transform:translateX(-50%);width:28px;height:28px;border-radius:50%;background:#34a853;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center">
            <div style="width:8px;height:8px;border-radius:50%;background:#fff"></div>
          </div>
        </div>`,iconSize:[32,42],iconAnchor:[16,42]});
      const m=L.marker([originSpot.lat,originSpot.lng],{icon,zIndexOffset:1000}).addTo(map);
      m.bindTooltip(`出発: ${originSpot.label}`,{direction:"top",offset:[0,-44],className:"nav-tip"});
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
      const gpsDot=L.divIcon({className:"",html:`<div style="position:relative"><div style="position:absolute;inset:-10px;border-radius:50%;background:#4285f420;border:1.5px solid #4285f440;animation:locPulse 2s ease-in-out infinite"></div><div style="width:12px;height:12px;border-radius:50%;background:#4285f4;border:2.5px solid #fff;box-shadow:0 0 6px rgba(66,133,244,.5)"></div></div>`,iconSize:[12,12],iconAnchor:[6,6]});
      const gm=L.marker([gpsPos.lat,gpsPos.lng],{icon:gpsDot,zIndexOffset:900}).addTo(map);
      gm.bindTooltip(`<b>現在地</b>`,{direction:"top",offset:[0,-10],className:"nav-tip"});
      layersRef.current.push(gm);
      if(gpsPos.accuracy&&gpsPos.accuracy<500){
        const circle=L.circle([gpsPos.lat,gpsPos.lng],{radius:gpsPos.accuracy,color:"#4285f4",fillColor:"#4285f4",fillOpacity:0.08,weight:1,opacity:0.3}).addTo(map);
        layersRef.current.push(circle);
      }
    }

    if(!route&&originSpot&&destSpot){
      map.fitBounds(L.latLngBounds([[originSpot.lat,originSpot.lng],[destSpot.lat,destSpot.lng]]).pad(0.3));
    }
  },[leafletReady,origin,destination,route,gpsPos]);

  if(!leafletReady)return <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center"}}><Loader msg="マップを読み込み中" size="md"/></div>;

  const tipStyle=`.nav-tip{background:${T.bg2}!important;color:${T.txH}!important;border:1px solid ${T.bdL}!important;border-radius:8px!important;font-size:11px!important;font-weight:600!important;padding:4px 10px!important;box-shadow:0 4px 16px rgba(0,0,0,.45)!important;font-family:inherit!important}.nav-tip::before{display:none!important}`;

  const hasRoute=!!route;
  const noRoute=origin&&destination&&origin!==destination&&!route;

  /* ── Floating search card ── */
  const searchCard=<div style={{
    position:"absolute",
    top:mob?10:14,
    left:mob?10:14,
    right:mob?10:"auto",
    width:mob?"auto":360,
    zIndex:1000,
    background:T.bg2,
    borderRadius:16,
    boxShadow:"0 4px 24px rgba(0,0,0,.45), 0 1px 3px rgba(0,0,0,.2)",
    border:`1px solid ${T.bdL}`,
    overflow:"visible",
  }}>
    <div style={{display:"flex",alignItems:"stretch",padding:"4px 8px 4px 4px"}}>
      {/* Dots + line connector (Google Maps style) */}
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",width:32,flexShrink:0,padding:"12px 0"}}>
        <div style={{width:10,height:10,borderRadius:"50%",background:origin?"#34a853":"#34a85360",border:"2px solid #34a853",flexShrink:0}}/>
        <div style={{width:2,flex:1,background:`${T.txD}30`,margin:"3px 0",minHeight:12}}/>
        <div style={{width:10,height:10,borderRadius:"50%",background:destination?T.accent:`${T.accent}60`,border:`2px solid ${T.accent}`,flexShrink:0}}/>
      </div>

      {/* Inputs */}
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
        <div style={{borderBottom:`1px solid ${T.bd}`}}>
          <SpotSelector value={origin} onChange={v=>{setOrigin(v);setSelectMode(null);}} placeholder="出発地を選択" accent="#34a853" onGps={getGpsOrigin} gpsLoading={gpsLoading}/>
        </div>
        <SpotSelector value={destination} onChange={v=>{setDestination(v);setSelectMode(null);}} placeholder="目的地を選択" accent={T.accent}/>
      </div>

      {/* Swap + GPS buttons */}
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,flexShrink:0,paddingLeft:4}}>
        <button onClick={getGpsOrigin} disabled={gpsLoading} style={{display:"flex",alignItems:"center",justifyContent:"center",width:32,height:32,borderRadius:"50%",border:`1px solid ${gpsPos?"#4285f440":T.bd}`,background:gpsPos?"#4285f410":"transparent",cursor:gpsLoading?"wait":"pointer",color:gpsPos?"#4285f4":T.txD,transition:"all .15s",opacity:gpsLoading?0.5:1}} onMouseEnter={e=>{e.currentTarget.style.background=gpsPos?"#4285f420":T.bg3;e.currentTarget.style.color=gpsPos?"#4285f4":T.txH;}} onMouseLeave={e=>{e.currentTarget.style.background=gpsPos?"#4285f410":"transparent";e.currentTarget.style.color=gpsPos?"#4285f4":T.txD;}} title="現在地を出発地に設定">
          {I.tgt}
        </button>
        <button onClick={swap} style={{display:"flex",alignItems:"center",justifyContent:"center",width:32,height:32,borderRadius:"50%",border:`1px solid ${T.bd}`,background:"transparent",cursor:"pointer",color:T.txD,transition:"all .15s"}} onMouseEnter={e=>{e.currentTarget.style.background=T.bg3;e.currentTarget.style.color=T.txH;}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=T.txD;}} title="入れ替え">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="7 3 7 21"/><polyline points="4 6 7 3 10 6"/><polyline points="17 21 17 3"/><polyline points="14 18 17 21 20 18"/></svg>
        </button>
      </div>
    </div>

    {/* Select mode hint */}
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
    <style>{tipStyle}{`@keyframes navSlideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}@keyframes locPulse{0%,100%{opacity:.6;transform:scale(1)}50%{opacity:1;transform:scale(1.5)}}`}</style>
    {/* Full-screen map */}
    <div ref={mapRef} style={{position:"absolute",inset:0}}/>
    {/* Floating UI */}
    {searchCard}
    {routeCard}
    {routePill}
    {noRouteCard}
  </div>;
};
