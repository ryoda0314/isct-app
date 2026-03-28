import { useState, useEffect, useRef, useCallback } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { Av, useLeaflet, Loader } from "../shared.jsx";
import { useLocationSharing, SPOTS, SPOT_CATS, getSpot, CAMPUS_CENTER, CAMPUS_ZOOM, AREAS, CAMPUS_BOUNDARY } from "../hooks/useLocationSharing.js";
import { useNavigation, NAV_SPOTS } from "../hooks/useNavigation.js";
import { isDemoMode } from "../demoMode.js";

const NON_GEO=new Set(["suzu","home_loc","commute","off_campus","road"]);

/* ── GPS → 最寄りスポット検索（ポリゴン→入口→中心点） ── */
// Ray-casting法によるポリゴン内判定
const pointInPolygon=(lat,lng,poly)=>{
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const [yi,xi]=poly[i],[yj,xj]=poly[j];
    if((yi>lat)!==(yj>lat)&&lng<(xj-xi)*(lat-yi)/(yj-yi)+xi)inside=!inside;
  }
  return inside;
};
const findNearestSpot=(lat,lng)=>{
  // 1) ポリゴン判定: AREAS内のポリゴンに含まれるか
  for(const [id,poly] of Object.entries(AREAS)){
    if(NON_GEO.has(id)||poly.length<3)continue;
    if(pointInPolygon(lat,lng,poly)){
      const spot=SPOTS.find(s=>s.id===id);
      if(spot)return {spot,distance:0};
    }
  }
  // 2) ポリゴン外 → 道
  const roadSpot=SPOTS.find(s=>s.id==="road");
  return {spot:roadSpot,distance:-1};
};

/* ── マップタブ ── */
const MapTab=({peers,myLoc,mySpot,grouped,mob,gpsPos})=>{
  const leafletReady=useLeaflet();
  const mapRef=useRef(null);
  const mapInst=useRef(null);
  const markersRef=useRef([]);
  const gpsMarkerRef=useRef(null);
  const gpsCircleRef=useRef(null);
  const overlayRef=useRef(null);
  const [overlayOp,setOverlayOp]=useState(0.35);
  const [selSpot,setSelSpot]=useState(null);
  // コンパス（ヘディング）
  const [compassOn,setCompassOn]=useState(false);
  const [heading,setHeading]=useState(null);
  const headingRef=useRef(null);

  useEffect(()=>{
    if(!compassOn){setHeading(null);return;}
    const handler=(e)=>{
      let h=null;
      if(e.webkitCompassHeading!=null){h=e.webkitCompassHeading;}
      else if(e.alpha!=null){h=(360-e.alpha)%360;}
      if(h!=null){headingRef.current=h;setHeading(h);}
    };
    if(typeof DeviceOrientationEvent!=="undefined"&&typeof DeviceOrientationEvent.requestPermission==="function"){
      DeviceOrientationEvent.requestPermission().then(r=>{
        if(r==="granted")window.addEventListener("deviceorientation",handler,true);
        else setCompassOn(false);
      }).catch(()=>setCompassOn(false));
    }else{
      window.addEventListener("deviceorientation",handler,true);
    }
    return()=>window.removeEventListener("deviceorientation",handler,true);
  },[compassOn]);
  // 案内モード
  const [navMode,setNavMode]=useState(false);
  const [navDest,setNavDest]=useState(null);
  const nav=useNavigation();
  useEffect(()=>{
    if(!navMode||!gpsPos)return;
    const {spot}=findNearestSpot(gpsPos.lat,gpsPos.lng);
    if(spot&&spot.id!=="road")nav.setOrigin(spot.id);
  },[navMode,gpsPos]);
  useEffect(()=>{nav.setDestination(navDest||null);},[navDest]);

  // init map
  useEffect(()=>{
    if(!leafletReady||!mapRef.current||mapInst.current)return;
    const L=window.L;
    const map=L.map(mapRef.current,{
      center:[CAMPUS_CENTER.lat,CAMPUS_CENTER.lng],
      zoom:CAMPUS_ZOOM,
      zoomControl:false,
      attributionControl:false,
      touchRotate:true,
      shiftKeyRotate:true,
      rotateControl:true,
    });
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{
      maxZoom:22,maxNativeZoom:19,
    }).addTo(map);
    overlayRef.current=L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{
      maxZoom:22,maxNativeZoom:19,pane:"overlayPane",opacity:0.35,
    }).addTo(map);
    L.control.zoom({position:"bottomright"}).addTo(map);
    L.control.attribution({position:"bottomleft",prefix:false})
      .addAttribution('&copy; Esri, Maxar, Earthstar Geographics')
      .addTo(map);
    mapInst.current=map;
    return()=>{map.remove();mapInst.current=null;gpsMarkerRef.current=null;gpsCircleRef.current=null;};
  },[leafletReady]);

  // overlay opacity sync
  useEffect(()=>{if(overlayRef.current)overlayRef.current.setOpacity(overlayOp);},[overlayOp]);

  // update markers
  useEffect(()=>{
    if(!mapInst.current||!leafletReady)return;
    const L=window.L;
    const map=mapInst.current;
    markersRef.current.forEach(m=>{ if(m.remove) m.remove(); else map.removeLayer(m); });
    markersRef.current=[];

    // ── 通常モード ──
    // peer markers grouped by spot
    const geoGroups=Object.values(grouped).filter(g=>g.spot.lat!=null&&g.spot.lng!=null);
    geoGroups.forEach(g=>{
      const icon=L.divIcon({
        className:"",
        html:`<div style="display:flex;align-items:center;gap:4px;padding:4px 8px 4px 6px;border-radius:10px;background:${g.spot.col};box-shadow:0 2px 8px rgba(0,0,0,.4);cursor:pointer;white-space:nowrap;font-family:'Inter',sans-serif;transform:translate(-50%,-50%)">
          <span style="width:18px;height:18px;border-radius:4px;background:rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;color:#fff">${g.spot.short}</span>
          <span style="font-size:11px;font-weight:600;color:#fff">${g.users.length}</span>
        </div>`,
        iconSize:[0,0],iconAnchor:[0,0],
      });
      const marker=L.marker([g.spot.lat,g.spot.lng],{icon}).addTo(map);
      const names=g.users.map(u=>u.name||"?").slice(0,5).join("、")+(g.users.length>5?` 他${g.users.length-5}人`:"");
      marker.bindTooltip(`<b>${g.spot.label}</b><br/><span style="color:${T.txD}">${names}</span>`,{className:"spot-tip",direction:"top",offset:[0,-6]});
      marker.on("click",()=>setSelSpot(g.spot.id));
      markersRef.current.push(marker);
    });

    // my location marker
    if(mySpot&&mySpot.lat!=null&&mySpot.lng!=null){
      const myIcon=L.divIcon({
        className:"",
        html:`<div style="width:16px;height:16px;border-radius:50%;background:${T.green};border:3px solid #fff;box-shadow:0 0 0 3px ${T.green}60,0 2px 8px rgba(0,0,0,.4);transform:translate(-50%,-50%)"></div>`,
        iconSize:[0,0],iconAnchor:[0,0],
      });
      const m=L.marker([mySpot.lat,mySpot.lng],{icon:myIcon}).addTo(map);
      m.bindTooltip(`<b>自分</b><span style="color:${T.txD}"> — ${mySpot.label}</span>`,{className:"spot-tip",direction:"top",offset:[0,-6]});
      markersRef.current.push(m);
    }

    // all geo spots as faint dots (no users)
    SPOTS.forEach(s=>{
      if(!s.id||s.lat==null||grouped[s.id])return;
      const dot=L.divIcon({
        className:"",
        html:`<div style="width:8px;height:8px;border-radius:50%;background:${s.col}50;border:1.5px solid ${s.col}30;transform:translate(-50%,-50%)"></div>`,
        iconSize:[0,0],iconAnchor:[0,0],
      });
      const m=L.marker([s.lat,s.lng],{icon:dot}).addTo(map);
      m.bindTooltip(s.label,{className:"spot-tip",direction:"top",offset:[0,-4]});
      m.on("click",()=>setSelSpot(s.id));
      markersRef.current.push(m);
    });

    // 案内モード: ルート描画
    if(navMode&&nav.route&&nav.route.coords.length>1){
      const latlngs=nav.route.coords.map(c=>[c.lat,c.lng]);
      const glow=L.polyline(latlngs,{color:"#4de8b0",weight:14,opacity:0.15,lineCap:"round",lineJoin:"round"}).addTo(map);
      const shadow=L.polyline(latlngs,{color:"#000",weight:7,opacity:0.25,lineCap:"round",lineJoin:"round"}).addTo(map);
      const line=L.polyline(latlngs,{color:"#4de8b0",weight:5,opacity:0.95,lineCap:"round",lineJoin:"round"}).addTo(map);
      markersRef.current.push(glow,shadow,line);
      // 目的地ピン
      const destSpot=NAV_SPOTS.find(s=>s.id===navDest);
      if(destSpot){
        const destIcon=L.divIcon({className:"",html:`
          <div style="position:relative;width:32px;height:42px">
            <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:10px;height:10px;border-radius:50%;background:rgba(0,0,0,.2);filter:blur(3px)"></div>
            <div style="position:absolute;bottom:4px;left:50%;transform:translateX(-50%);width:28px;height:28px;border-radius:50%;background:${T.accent};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="#fff"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg>
            </div>
          </div>`,iconSize:[32,42],iconAnchor:[16,42]});
        const dm=L.marker([destSpot.lat,destSpot.lng],{icon:destIcon,zIndexOffset:1100}).addTo(map);
        dm.bindTooltip(`<b>${destSpot.label}</b>`,{className:"spot-tip",direction:"top",offset:[0,-44]});
        markersRef.current.push(dm);
      }
      // ルート全体が見えるようにフィット（GPS追従でない場合）
      if(!compassOn&&!gpsPos){map.fitBounds(L.latLngBounds(latlngs).pad(0.25));}
    }
  },[leafletReady,peers,myLoc,grouped,navMode,navDest,nav.route]);

  // GPS位置マーカー — 永続refでスムーズ移動
  useEffect(()=>{
    if(!mapInst.current||!leafletReady) return;
    const L=window.L;
    const map=mapInst.current;
    if(!gpsPos){
      if(gpsMarkerRef.current){map.removeLayer(gpsMarkerRef.current);gpsMarkerRef.current=null;}
      if(gpsCircleRef.current){map.removeLayer(gpsCircleRef.current);gpsCircleRef.current=null;}
      return;
    }
    if(gpsMarkerRef.current){
      // 既存マーカー — setLatLngでスムーズ移動（CSS transitionが補間）
      gpsMarkerRef.current.setLatLng([gpsPos.lat,gpsPos.lng]);
    }else{
      // 初回作成
      const gpsPulse=L.divIcon({
        className:"gps-smooth",
        html:`<div style="position:relative;transform:translate(-50%,-50%)">
          <div class="gps-arrow" style="display:none;position:absolute;top:-22px;left:50%;transform-origin:center 29px;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:14px solid #4285f4;filter:drop-shadow(0 0 3px rgba(66,133,244,.6));transition:transform .15s ease-out"></div>
          <div style="position:absolute;inset:-12px;border-radius:50%;background:#4285f420;border:1.5px solid #4285f440;animation:locPulse 2s ease-in-out infinite"></div>
          <div style="width:14px;height:14px;border-radius:50%;background:#4285f4;border:3px solid #fff;box-shadow:0 0 6px rgba(66,133,244,.5)"></div>
        </div>`,
        iconSize:[0,0],iconAnchor:[0,0],
      });
      const gm=L.marker([gpsPos.lat,gpsPos.lng],{icon:gpsPulse,zIndexOffset:1000}).addTo(map);
      gm.bindTooltip(`<b>現在地</b>`,{className:"spot-tip",direction:"top",offset:[0,-10]});
      gpsMarkerRef.current=gm;
    }
    // 精度円
    if(gpsPos.accuracy&&gpsPos.accuracy<500){
      if(gpsCircleRef.current){
        gpsCircleRef.current.setLatLng([gpsPos.lat,gpsPos.lng]);
        gpsCircleRef.current.setRadius(gpsPos.accuracy);
      }else{
        gpsCircleRef.current=L.circle([gpsPos.lat,gpsPos.lng],{radius:gpsPos.accuracy,color:"#4285f4",fillColor:"#4285f4",fillOpacity:0.08,weight:1,opacity:0.3}).addTo(map);
      }
    }else if(gpsCircleRef.current){
      map.removeLayer(gpsCircleRef.current);gpsCircleRef.current=null;
    }
  },[leafletReady,gpsPos]);

  // GPS方向矢印 — DOM直接操作で高頻度heading更新に対応
  useEffect(()=>{
    if(!gpsMarkerRef.current) return;
    const el=gpsMarkerRef.current.getElement?.();
    if(!el) return;
    const arrow=el.querySelector('.gps-arrow');
    if(!arrow) return;
    if(heading!=null){
      arrow.style.display='block';
      arrow.style.transform=`translateX(-50%) rotate(${heading}deg)`;
    }else{
      arrow.style.display='none';
    }
  },[heading]);

  // コンパス or 案内モード時、GPS位置に自動追従
  useEffect(()=>{
    if((compassOn||navMode)&&gpsPos&&mapInst.current){
      mapInst.current.setView([gpsPos.lat,gpsPos.lng],mapInst.current.getZoom(),{animate:true,duration:0.3});
    }
  },[compassOn,navMode,gpsPos]);

  if(!leafletReady)return <Loader msg="地図を読み込み中" size="sm"/>;

  const selGroup=selSpot?grouped[selSpot]:null;
  const selSpotObj=selSpot?getSpot(selSpot):null;

  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",position:"relative",minHeight:mob?300:400}}>
      <style>{`
.leaflet-container{background:${T.bg}!important}
.leaflet-control-zoom a{background:${T.bg2}!important;color:${T.txH}!important;border-color:${T.bd}!important}
.leaflet-control-zoom a:hover{background:${T.bg3}!important}
.leaflet-control-attribution{background:${T.bg2}cc!important;color:${T.txD}!important;font-size:9px!important}
.leaflet-control-attribution a{color:${T.txD}!important}
.spot-tip{background:${T.bg2}!important;color:${T.txH}!important;border:1px solid ${T.bdL}!important;border-radius:8px!important;padding:6px 10px!important;font-size:11px!important;font-weight:500!important;font-family:'Inter',sans-serif!important;box-shadow:0 4px 16px rgba(0,0,0,.45)!important;white-space:nowrap!important;opacity:0;animation:tipIn .15s ease-out forwards!important}
.spot-tip .leaflet-tooltip-arrow{display:none!important}
@keyframes tipIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
.gps-smooth{transition:transform .3s ease-out!important}
.compass-on .leaflet-control-container{transform:rotate(${heading!=null?heading:0}deg)!important;transition:transform .15s ease-out!important}
.compass-on .leaflet-tooltip{transform:rotate(${heading!=null?heading:0}deg)!important}
      `}</style>
      <div style={{flex:1,minHeight:mob?300:400,overflow:"hidden",position:"relative"}}>
        <div ref={mapRef} className={compassOn?"compass-on":""} style={{width:"100%",height:"100%",transition:compassOn?"transform .15s ease-out":"none",transform:compassOn&&heading!=null?`rotate(${-heading}deg)`:"none",transformOrigin:"center center"}}/>
      </div>

      {/* コンパス & 案内ボタン */}
      <div style={{position:"absolute",top:10,left:10,zIndex:1000,display:"flex",flexDirection:"column",gap:6}}>
        <button onClick={()=>setCompassOn(c=>!c)} style={{width:36,height:36,borderRadius:"50%",border:`1.5px solid ${compassOn?`${T.accent}`:`${T.bd}`}`,background:compassOn?`${T.accent}20`:`${T.bg2}d0`,backdropFilter:"blur(8px)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all .15s",boxShadow:"0 2px 8px rgba(0,0,0,.3)"}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{transform:compassOn&&heading!=null?`rotate(${heading}deg)`:"none",transition:"transform .15s"}}>
            <path d="M12 2L9 9L2 12L9 15L12 22L15 15L22 12L15 9L12 2Z" fill={compassOn?T.accent:T.txD} opacity={compassOn?1:0.6}/>
            <circle cx="12" cy="12" r="2" fill={compassOn?"#fff":T.bg2}/>
          </svg>
        </button>
        {!navMode&&<button onClick={()=>{setNavMode(true);setCompassOn(true);}} style={{display:"flex",alignItems:"center",gap:5,padding:"7px 12px",borderRadius:10,border:`1.5px solid #4de8b060`,background:`${T.bg2}e0`,backdropFilter:"blur(8px)",cursor:"pointer",transition:"all .15s",boxShadow:"0 2px 8px rgba(0,0,0,.3)"}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4de8b0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
          <span style={{fontSize:11,fontWeight:700,color:"#4de8b0"}}>案内</span>
        </button>}
      </div>

      {/* 案内モードパネル */}
      {navMode&&<div style={{position:"absolute",bottom:mob?8:12,left:mob?8:12,right:mob?8:12,maxWidth:mob?"none":380,zIndex:1001,background:T.bg2,borderRadius:16,boxShadow:"0 4px 24px rgba(0,0,0,.45),0 1px 3px rgba(0,0,0,.2)",border:`1px solid ${T.bdL}`,overflow:"hidden",animation:"navSlideUp .25s ease-out"}}>
        <style>{`@keyframes navSlideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
        {/* ヘッダー */}
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",borderBottom:`1px solid ${T.bd}`}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4de8b0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
          <span style={{fontSize:13,fontWeight:700,color:T.txH,flex:1}}>案内モード</span>
          <button onClick={()=>{setNavMode(false);setNavDest(null);nav.setOrigin(null);nav.setDestination(null);}} style={{background:"none",border:"none",cursor:"pointer",color:T.txD,display:"flex",padding:4}} title="終了">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        {/* 目的地選択 */}
        <div style={{padding:"10px 14px"}}>
          <div style={{fontSize:11,color:T.txD,marginBottom:6}}>目的地を選択</div>
          <select value={navDest||""} onChange={e=>setNavDest(e.target.value||null)} style={{width:"100%",padding:"9px 10px",borderRadius:10,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:13,outline:"none",cursor:"pointer"}}>
            <option value="">タップして選択...</option>
            {SPOT_CATS.map(cat=>{
              const spots=NAV_SPOTS.filter(s=>s.cat===cat.id);
              return spots.length>0&&<optgroup key={cat.id} label={cat.label}>
                {spots.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
              </optgroup>;
            })}
          </select>
        </div>
        {/* ルート情報 */}
        {nav.route&&<div style={{padding:"0 14px 12px",display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:48,height:48,borderRadius:"50%",background:"linear-gradient(135deg,#4de8b0,#34a853)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <span style={{fontSize:18,fontWeight:800,color:"#fff",lineHeight:1}}>{nav.route.minutes}</span>
            <span style={{fontSize:8,fontWeight:600,color:"rgba(255,255,255,.85)",marginTop:-1}}>分</span>
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"baseline",gap:6}}>
              <span style={{fontSize:15,fontWeight:700,color:T.txH}}>{nav.route.distance}m</span>
              <span style={{fontSize:11,color:T.txD}}>徒歩</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6,marginTop:4,flexWrap:"wrap"}}>
              {nav.route.hasStairs&&<div style={{display:"flex",alignItems:"center",gap:3,padding:"2px 7px",borderRadius:6,background:`${T.orange}12`}}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.orange} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 18h4v-4h4v-4h4v-4h4"/></svg>
                <span style={{fontSize:10,fontWeight:600,color:T.orange}}>階段あり</span>
              </div>}
              {!gpsPos&&<span style={{fontSize:10,color:T.txD}}>GPS追従で出発地を自動設定</span>}
            </div>
          </div>
        </div>}
        {navDest&&!nav.route&&nav.origin&&<div style={{padding:"0 14px 12px",display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:32,height:32,borderRadius:"50%",background:`${T.red}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.red} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          </div>
          <span style={{fontSize:12,color:T.txD}}>経路が見つかりません</span>
        </div>}
      </div>}

      {/* 地図オーバーレイ透明度スライダー */}
      <div style={{position:"absolute",bottom:30,left:10,zIndex:1000,display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:8,background:`${T.bg2}d0`,backdropFilter:"blur(8px)",border:`1px solid ${T.bd}`}}>
        <span style={{fontSize:9,fontWeight:600,color:T.txD,whiteSpace:"nowrap"}}>地図</span>
        <input type="range" min="0" max="100" value={Math.round(overlayOp*100)} onChange={e=>setOverlayOp(e.target.value/100)} style={{width:80,height:3,accentColor:"#f0c040",cursor:"pointer"}}/>
        <span style={{fontSize:9,color:T.txD,fontFamily:"monospace",minWidth:28}}>{Math.round(overlayOp*100)}%</span>
      </div>

      {/* 非地理スポット凡例 */}
      {(()=>{
        const nonGeo=Object.values(grouped).filter(g=>NON_GEO.has(g.spot.id));
        if(!nonGeo.length)return null;
        return <div style={{position:"absolute",bottom:40,left:8,zIndex:1000,display:"flex",flexDirection:"column",gap:4}}>
          {nonGeo.map(g=><button key={g.spot.id} onClick={()=>setSelSpot(g.spot.id)} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:8,background:`${T.bg2}e0`,backdropFilter:"blur(8px)",border:`1px solid ${T.bd}`,cursor:"pointer"}}>
            <div style={{width:18,height:18,borderRadius:4,background:g.spot.col,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:7,fontWeight:700,color:"#fff"}}>{g.spot.short}</span></div>
            <span style={{fontSize:11,fontWeight:600,color:T.txH}}>{g.spot.label}</span>
            <span style={{fontSize:10,fontWeight:700,color:T.accent,background:`${T.accent}14`,padding:"1px 6px",borderRadius:6}}>{g.users.length}</span>
          </button>)}
        </div>;
      })()}

      {/* スポット詳細ポップアップ */}
      {selSpotObj&&<>
        <div onClick={()=>setSelSpot(null)} style={{position:"absolute",inset:0,zIndex:1000}}/>
        <div style={{position:"absolute",zIndex:1001,animation:"locFadeIn .2s ease-out",...(mob?{bottom:0,left:0,right:0,borderRadius:"16px 16px 0 0"}:{bottom:16,right:16,width:280,borderRadius:14}),background:T.bg2,border:`1px solid ${T.bdL}`,boxShadow:"0 -4px 24px rgba(0,0,0,.4)",padding:16}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
            <div style={{width:28,height:28,borderRadius:7,background:selSpotObj.col,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:10,fontWeight:700,color:"#fff"}}>{selSpotObj.short}</span></div>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:700,color:T.txH}}>{selSpotObj.label}</div>
              <div style={{fontSize:11,color:T.txD}}>{selGroup?.users.length||0}人</div>
            </div>
            <button onClick={()=>setSelSpot(null)} style={{background:"none",border:"none",color:T.txD,cursor:"pointer",display:"flex"}}>{I.x}</button>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:200,overflowY:"auto"}}>
            {selGroup?.users.map(u=><div key={u.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",borderRadius:8,background:T.bg3,border:`1px solid ${T.bd}`}}>
              <Av u={u} sz={24}/>
              <span style={{fontSize:12,fontWeight:600,color:T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.name||"?"}</span>
            </div>)}
            {(!selGroup||selGroup.users.length===0)&&<div style={{fontSize:12,color:T.txD,textAlign:"center",padding:12}}>現在ここにいる人はいません</div>}
          </div>
        </div>
      </>}
    </div>
  );
};

/* ── デモ用：仮現在地ピッカー ── */
const FakeLocPicker=({myLoc,setMyLoc})=>{
  const [open,setOpen]=useState(false);
  const cur=SPOTS.find(s=>s.id===myLoc);
  return <div style={{marginTop:8}}>
    <button onClick={()=>setOpen(o=>!o)} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:8,border:`1px solid ${T.accent}30`,background:`${T.accent}08`,cursor:"pointer",transition:"all .15s"}}>
      <span style={{display:"flex",color:T.accent}}>{I.pin}</span>
      <span style={{fontSize:12,fontWeight:600,color:T.accent}}>仮現在地{cur?`：${cur.label}`:"を選択"}</span>
      <span style={{display:"flex",color:T.txD,transform:open?"rotate(90deg)":"rotate(-90deg)",transition:"transform .15s"}}>{I.back}</span>
    </button>
    {open&&<div style={{marginTop:6,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:4}}>
      {SPOTS.filter(s=>s.id&&!NON_GEO.has(s.id)).map(s=>{
        const sel=myLoc===s.id;
        return <button key={s.id} onClick={()=>{setMyLoc(s.id);try{localStorage.setItem("myLocation",s.id);}catch{}setOpen(false);}} style={{display:"flex",alignItems:"center",gap:4,padding:"5px 8px",borderRadius:6,border:`1px solid ${sel?T.accent:T.bd}`,background:sel?`${T.accent}12`:T.bg2,cursor:"pointer",transition:"all .12s"}}>
          <div style={{width:16,height:16,borderRadius:4,background:sel?s.col:`${s.col}30`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:7,fontWeight:700,color:sel?"#fff":s.col}}>{s.short}</span></div>
          <span style={{fontSize:10,fontWeight:sel?600:400,color:sel?T.accent:T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.label}</span>
        </button>;
      })}
    </div>}
  </div>;
};

/* ── 公開先管理パネル ── */
const VisibilityPanel=({friends=[],visibleTo,toggleVisibleTo,setVisibleTo})=>{
  const allOn=friends.length>0&&friends.every(f=>visibleTo.includes(f.friendId)||visibleTo.includes(String(f.friendId)));
  const noneOn=visibleTo.length===0;
  return <div style={{padding:"8px 16px",flex:1,overflowY:"auto"}}>
    <div style={{fontSize:12,color:T.txD,marginBottom:8,lineHeight:1.5}}>
      位置情報を共有する友達を選択してください。{noneOn&&<span style={{color:T.green,fontWeight:600}}>（現在: 全員に公開）</span>}
    </div>
    <div style={{display:"flex",gap:6,marginBottom:10}}>
      <button onClick={()=>setVisibleTo(friends.map(f=>f.friendId))} style={{padding:"5px 12px",borderRadius:6,border:`1px solid ${allOn?`${T.accent}50`:T.bd}`,background:allOn?`${T.accent}12`:T.bg2,cursor:"pointer",fontSize:11,fontWeight:600,color:allOn?T.accent:T.txD}}>全員を選択</button>
      <button onClick={()=>setVisibleTo([])} style={{padding:"5px 12px",borderRadius:6,border:`1px solid ${noneOn?`${T.green}50`:T.bd}`,background:noneOn?`${T.green}12`:T.bg2,cursor:"pointer",fontSize:11,fontWeight:600,color:noneOn?T.green:T.txD}}>全員に公開</button>
    </div>
    {friends.length===0&&<div style={{textAlign:"center",padding:"30px 20px",fontSize:13,color:T.txD}}>友達がまだいません</div>}
    {friends.map(f=>{
      const on=visibleTo.includes(f.friendId)||visibleTo.includes(String(f.friendId));
      return <button key={f.friendId} onClick={()=>toggleVisibleTo(f.friendId)} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"10px 12px",borderRadius:10,border:`1px solid ${on?`${T.green}30`:T.bd}`,background:on?`${T.green}08`:T.bg2,cursor:"pointer",marginBottom:6,transition:"all .15s"}}>
        <Av u={{name:f.name,av:f.avatar,col:f.color}} sz={30}/>
        <div style={{flex:1,minWidth:0,textAlign:"left"}}>
          <div style={{fontSize:13,fontWeight:600,color:T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</div>
          {f.dept&&<div style={{fontSize:10,color:T.txD}}>{f.dept}</div>}
        </div>
        <div style={{width:20,height:20,borderRadius:4,border:`2px solid ${on?T.green:T.txD+"40"}`,background:on?T.green:"transparent",display:"flex",alignItems:"center",justifyContent:"center",transition:"all .15s",flexShrink:0}}>
          {on&&<svg width="12" height="12" viewBox="0 0 12 12"><path d="M2.5 6l2.5 2.5 4.5-5" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </div>
      </button>;
    })}
  </div>;
};

/* ── メインビュー ── */
export const LocationView=({mob,user={},friendIds,friends=[]})=>{
  const {peers:allPeers,myLoc,setMyLoc,visibleTo,setVisibleTo,toggleVisibleTo}=useLocationSharing({id:user.moodleId||user.id,name:user.name,col:user.col,av:user.av});
  const peers=friendIds?allPeers.filter(p=>friendIds.has(Number(p.id))):allPeers;
  const mySpot=getSpot(myLoc);
  const [tab,setTab]=useState("list"); // "list" | "map" | "spots" | "visibility"
  const [gpsPos,setGpsPos]=useState(null); // {lat,lng,accuracy}
  const [gpsStatus,setGpsStatus]=useState("idle"); // "idle"|"loading"|"watching"|"error"
  const [gpsMsg,setGpsMsg]=useState("");
  const watchIdRef=useRef(null);
  const prevGpsRef=useRef(null);
  const GPS_SMOOTH=0.35; // exponential smoothing factor

  const stopGps=useCallback(()=>{
    if(watchIdRef.current!=null){navigator.geolocation.clearWatch(watchIdRef.current);watchIdRef.current=null;}
    prevGpsRef.current=null;
    setGpsStatus("idle");setGpsMsg("");
  },[]);

  const startGps=useCallback(()=>{
    if(!navigator.geolocation){setGpsStatus("error");setGpsMsg("この端末では位置情報を使えません");return;}
    if(watchIdRef.current!=null) return; // already watching
    setGpsStatus("loading");setGpsMsg("");
    const id=navigator.geolocation.watchPosition(
      (pos)=>{
        const {latitude:rawLat,longitude:rawLng,accuracy}=pos.coords;
        const prev=prevGpsRef.current;
        const A=GPS_SMOOTH;
        const lat=prev?prev.lat+A*(rawLat-prev.lat):rawLat;
        const lng=prev?prev.lng+A*(rawLng-prev.lng):rawLng;
        prevGpsRef.current={lat,lng};
        setGpsPos({lat,lng,accuracy});
        const {spot,distance}=findNearestSpot(lat,lng);
        const inCampus=pointInPolygon(lat,lng,CAMPUS_BOUNDARY);
        if(!inCampus){
          setMyLoc("off_campus");
          setGpsMsg("キャンパス外（位置は非公開）");
        }else if(spot){
          setMyLoc(spot.id);
          setGpsMsg(distance===0?`${spot.label}（建物内）`:distance===-1?"屋外（道）":`${spot.label}（${Math.round(distance)}m）`);
        }
        setGpsStatus("watching");
        setTab("map");
      },
      (err)=>{
        setGpsStatus("error");
        if(err.code===1)setGpsMsg("位置情報の許可が必要です");
        else if(err.code===2)setGpsMsg("位置情報を取得できません");
        else setGpsMsg("タイムアウトしました");
        watchIdRef.current=null;
      },
      {enableHighAccuracy:true,timeout:10000,maximumAge:2000}
    );
    watchIdRef.current=id;
  },[setMyLoc]);

  // cleanup on unmount
  useEffect(()=>()=>{if(watchIdRef.current!=null)navigator.geolocation.clearWatch(watchIdRef.current);},[]);

  // グループ化
  const grouped={};
  peers.forEach(p=>{const sp=getSpot(p.loc);if(sp){(grouped[p.loc]||(grouped[p.loc]={spot:sp,users:[]})).users.push(p);}});
  const groups=Object.values(grouped).sort((a,b)=>b.users.length-a.users.length);

  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <style>{`@keyframes locPulse{0%,100%{opacity:.6;transform:scale(1)}50%{opacity:1;transform:scale(1.5)}}@keyframes locFadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* ── 自分のステータス ── */}
      <div style={{padding:"12px 16px 8px",flexShrink:0}}>
        <div style={{borderRadius:14,background:`linear-gradient(135deg,${T.accent}10,${T.green}08)`,border:`1px solid ${myLoc?`${T.green}25`:T.bd}`,padding:"14px 16px",transition:"border-color .2s"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{position:"relative"}}>
              <Av u={user} sz={36}/>
              {myLoc&&<div style={{position:"absolute",bottom:-1,right:-1,width:12,height:12,borderRadius:"50%",background:T.green,border:`2.5px solid ${T.bg}`,zIndex:1}}/>}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:700,color:T.txH}}>{user.name||"自分"}</div>
              {myLoc?<div style={{display:"flex",alignItems:"center",gap:4,marginTop:2}}>
                <div style={{position:"relative",width:6,height:6,flexShrink:0}}>
                  <div style={{position:"absolute",inset:0,borderRadius:"50%",background:T.green,animation:"locPulse 2s ease-in-out infinite"}}/>
                  <div style={{position:"relative",width:6,height:6,borderRadius:"50%",background:T.green}}/>
                </div>
                <div style={{width:14,height:14,borderRadius:3,background:mySpot?.col||T.green,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:6,fontWeight:800,color:"#fff"}}>{mySpot?.short||"?"}</span></div>
                <span style={{fontSize:12,color:T.green,fontWeight:600}}>{mySpot?.label}</span>
              </div>:<div style={{fontSize:11,color:T.txD,marginTop:2}}>位置を共有していません</div>}
            </div>
            <button onClick={()=>{if(myLoc)setMyLoc("");else setTab("spots");}} style={{padding:"6px 14px",borderRadius:8,border:`1px solid ${myLoc?`${T.red}40`:`${T.green}40`}`,background:myLoc?`${T.red}10`:`${T.green}10`,cursor:"pointer",transition:"all .15s"}}>
              <span style={{fontSize:12,fontWeight:600,color:myLoc?T.red:T.green}}>{myLoc?"停止":"共有する"}</span>
            </button>
          </div>
          {/* GPS 現在地取得 / デモ時は仮現在地選択 */}
          {isDemoMode()?<FakeLocPicker myLoc={myLoc} setMyLoc={setMyLoc}/>:
          <div style={{display:"flex",alignItems:"center",gap:8,marginTop:8}}>
            <button onClick={gpsStatus==="watching"?stopGps:startGps} disabled={gpsStatus==="loading"} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:8,border:`1px solid ${gpsStatus==="watching"?`${T.green}60`:`${T.accent}30`}`,background:gpsStatus==="watching"?`${T.green}15`:`${T.accent}08`,cursor:gpsStatus==="loading"?"wait":"pointer",transition:"all .15s",opacity:gpsStatus==="loading"?0.6:1}}>
              <span style={{display:"flex",color:gpsStatus==="watching"?T.green:T.accent}}>{I.tgt}</span>
              <span style={{fontSize:12,fontWeight:600,color:gpsStatus==="watching"?T.green:T.accent}}>{gpsStatus==="loading"?"取得中…":gpsStatus==="watching"?"追従中（タップで停止）":"現在地を追従"}</span>
            </button>
            {gpsMsg&&<span style={{fontSize:11,color:gpsStatus==="error"?T.red:T.green,fontWeight:500}}>{gpsMsg}</span>}
          </div>}
        </div>
      </div>

      {/* ── タブ切り替え ── */}
      <div style={{display:"flex",gap:0,padding:"0 16px",borderBottom:`1px solid ${T.bd}`,flexShrink:0}}>
        {[{id:"list",l:"友達",cnt:peers.length},{id:"map",l:"地図"},{id:"spots",l:"場所を選択"},{id:"visibility",l:"公開先",cnt:visibleTo.length||null}].map(t=>
          <button key={t.id} onClick={()=>setTab(t.id)} style={{display:"flex",alignItems:"center",gap:4,padding:"8px 14px",border:"none",borderBottom:tab===t.id?`2px solid ${T.accent}`:"2px solid transparent",background:"transparent",cursor:"pointer",transition:"all .12s"}}>
            <span style={{fontSize:13,fontWeight:tab===t.id?600:400,color:tab===t.id?T.txH:T.txD}}>{t.l}</span>
            {t.cnt!=null&&t.cnt>0&&<span style={{fontSize:10,fontWeight:700,color:T.accent,background:`${T.accent}14`,padding:"1px 6px",borderRadius:8}}>{t.cnt}</span>}
          </button>
        )}
      </div>

      {/* ── 友達リスト ── */}
      {tab==="list"&&<div style={{padding:"8px 16px",flex:1,overflowY:"auto"}}>
        {groups.length===0&&<div style={{textAlign:"center",padding:"40px 20px"}}>
          <div style={{display:"flex",justifyContent:"center",marginBottom:8}}><div style={{width:36,height:36,borderRadius:8,background:`${T.txD}20`,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{display:"flex",color:T.txD}}>{I.pin}</span></div></div>
          <div style={{fontSize:14,fontWeight:600,color:T.txH,marginBottom:4}}>まだ誰もいません</div>
          <div style={{fontSize:12,color:T.txD,lineHeight:1.5}}>友達が場所を共有するとここに表示されます</div>
        </div>}

        {groups.map(g=><div key={g.spot.id} style={{marginBottom:12,animation:"locFadeIn .3s ease-out"}}>
          {/* 場所ヘッダー */}
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
            <div style={{width:22,height:22,borderRadius:5,background:g.spot.col||T.txD,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:8,fontWeight:700,color:"#fff"}}>{g.spot.short}</span></div>
            <span style={{fontSize:13,fontWeight:700,color:T.txH}}>{g.spot.label}</span>
            <span style={{fontSize:11,fontWeight:600,color:T.accent,background:`${T.accent}12`,padding:"1px 7px",borderRadius:8}}>{g.users.length}人</span>
          </div>
          {/* ユーザーカード */}
          <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:6}}>
            {g.users.map(u=><div key={u.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:10,background:T.bg2,border:`1px solid ${T.bd}`,transition:"border-color .12s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=T.bdL} onMouseLeave={e=>e.currentTarget.style.borderColor=T.bd}>
              <div style={{position:"relative"}}>
                <Av u={u} sz={28}/>
                <div style={{position:"absolute",bottom:-1,right:-1,width:9,height:9,borderRadius:"50%",background:T.green,border:`2px solid ${T.bg2}`}}/>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:600,color:T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.name||"?"}</div>
              </div>
            </div>)}
          </div>
        </div>)}
      </div>}

      {/* ── 公開先タブ ── */}
      {tab==="visibility"&&<VisibilityPanel friends={friends} visibleTo={visibleTo} toggleVisibleTo={toggleVisibleTo} setVisibleTo={setVisibleTo}/>}

      {/* ── 地図タブ ── */}
      {tab==="map"&&<MapTab peers={peers} myLoc={myLoc} mySpot={mySpot} grouped={grouped} mob={mob} gpsPos={gpsPos}/>}

      {/* ── 場所選択グリッド ── */}
      {tab==="spots"&&<div style={{padding:"10px 16px",flex:1,overflowY:"auto"}}>
        {SPOT_CATS.map(cat=>{
          const items=SPOTS.filter(s=>s.cat===cat.id&&s.id!=="");
          if(!items.length)return null;
          return <div key={cat.id} style={{marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:T.txD,textTransform:"uppercase",letterSpacing:.5,padding:"0 2px 6px"}}>{cat.label}</div>
            <div style={{display:"grid",gridTemplateColumns:mob?"1fr 1fr":"1fr 1fr 1fr",gap:6}}>
              {items.map(s=>{
                const sel=myLoc===s.id;
                const cnt=grouped[s.id]?.users.length||0;
                const ppl=grouped[s.id]?.users||[];
                return <button key={s.id} onClick={()=>{setMyLoc(s.id);setTab("list");}} style={{display:"flex",flexDirection:"column",gap:6,padding:"10px 10px",borderRadius:10,border:`1.5px solid ${sel?T.accent:T.bd}`,background:sel?`${T.accent}12`:T.bg2,cursor:"pointer",transition:"all .15s",textAlign:"left"}} onMouseEnter={e=>{if(!sel){e.currentTarget.style.borderColor=T.bdL;e.currentTarget.style.background=T.bg3;}}} onMouseLeave={e=>{if(!sel){e.currentTarget.style.borderColor=T.bd;e.currentTarget.style.background=T.bg2;}}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <div style={{width:24,height:24,borderRadius:6,background:sel?s.col:`${s.col}30`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:9,fontWeight:700,color:sel?"#fff":s.col}}>{s.short}</span></div>
                    <span style={{fontSize:12,fontWeight:sel?700:500,color:sel?T.accent:T.txH,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.label}</span>
                    {sel&&<span style={{display:"flex",color:T.accent}}>{I.chk}</span>}
                  </div>
                  {cnt>0?<div style={{display:"flex",alignItems:"center",gap:4}}>
                    <div style={{display:"flex"}}>
                      {ppl.slice(0,3).map((u,i)=><div key={u.id} style={{marginLeft:i>0?-4:0,zIndex:3-i}}><div style={{borderRadius:"50%",border:`1.5px solid ${T.bg2}`}}><Av u={u} sz={16}/></div></div>)}
                    </div>
                    <span style={{fontSize:10,color:T.accent,fontWeight:600}}>{cnt}人</span>
                  </div>:<div style={{fontSize:10,color:T.txD}}>0人</div>}
                </button>;
              })}
            </div>
          </div>;
        })}

        {myLoc&&<button onClick={()=>{setMyLoc("");}} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,width:"100%",padding:"10px",borderRadius:10,border:`1px solid ${T.red}30`,background:`${T.red}08`,cursor:"pointer",marginTop:4,transition:"background .12s"}} onMouseEnter={e=>e.currentTarget.style.background=`${T.red}14`} onMouseLeave={e=>e.currentTarget.style.background=`${T.red}08`}>
          <span style={{display:"flex",color:T.red}}>{I.x}</span>
          <span style={{fontSize:12,fontWeight:600,color:T.red}}>位置共有を停止</span>
        </button>}
      </div>}
    </div>
  );
};
