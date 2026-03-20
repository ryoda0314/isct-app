"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  SPOTS, SPOT_CATS, CAMPUS_CENTER, CAMPUS_ZOOM,
  WAYPOINTS, EDGES, ENTRANCES, AREAS, getSpot,
} from "../../campus-sns/hooks/useLocationSharing.js";
import { useNavigation, NAV_SPOTS } from "../../campus-sns/hooks/useNavigation.js";

/* ── Theme (inline dark) ── */
const T={bg:"#1a1a1f",bg2:"#222228",bg3:"#2a2a32",bg4:"#32323c",tx:"#b0b0b8",txH:"#e8e8f0",txD:"#68687a",bd:"#2e2e38",bdL:"#3a3a48",accent:"#6375f0",green:"#4db88a",red:"#e5534b",orange:"#d4843e",yellow:"#f0c040"};

/* ── Leaflet Loader ── */
function useLeaflet(){
  const [ready,setReady]=useState(false);
  useEffect(()=>{
    if(typeof window==="undefined")return;
    if(window.L){setReady(true);return;}
    const css=document.createElement("link");css.rel="stylesheet";css.href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";document.head.appendChild(css);
    const js=document.createElement("script");js.src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";js.onload=()=>setReady(true);document.head.appendChild(js);
  },[]);
  return ready;
}

/* ── Spot types for outdoor registration ── */
const SPOT_TYPES=[
  {id:"bench",label:"ベンチ",prefix:"B",col:"#8bc34a"},
  {id:"park",label:"駐輪場",prefix:"P",col:"#78909c"},
  {id:"vend_d",label:"自販機・飲料",prefix:"VD",col:"#42a5f5"},
  {id:"vend_f",label:"自販機・食品",prefix:"VF",col:"#ff8a65"},
  {id:"smoke",label:"喫煙所",prefix:"S",col:"#b0bec5"},
];

/* ── Mode definitions ── */
const MODES=[
  {id:"view",label:"ビュー",col:T.txH},
  {id:"spots",label:"スポット",col:"#e8b63a"},
  {id:"areas",label:"範囲",col:"#60a0ff"},
  {id:"paths",label:"道",col:"#f0c040"},
  {id:"entrances",label:"入口",col:"#4de8b0"},
  {id:"register",label:"登録",col:"#8bc34a"},
  {id:"nav",label:"ナビ",col:"#4de8b0"},
];

const HELP={
  view:"全スポットとエリアの概要表示",
  spots:"マーカーをドラッグして座標を編集",
  areas:"建物を選択→クリックで頂点追加。ドラッグで移動。右クリックで削除",
  paths_view:"歩道ネットワークの表示",
  paths_wp:"クリックでWP追加。ドラッグで移動",
  paths_edge:"ノード2つクリックで接続。エッジクリックで削除",
  entrances:"入口の表示。編集モードでクリック追加・ドラッグ移動",
  register:"種類を選んでマップクリックで配置",
  nav:"出発地と目的地を選択して経路プレビュー",
};

/* ══════════════════════════════════════════════════════════
   Main Editor Component
   ══════════════════════════════════════════════════════════ */
export default function MapEditor(){
  const leafletReady=useLeaflet();
  const mapRef=useRef(null);
  const mapInst=useRef(null);
  const markersRef=useRef([]);
  const overlayRef=useRef(null);

  /* ── State ── */
  const [mode,setMode]=useState("view");
  const [overlayOp,setOverlayOp]=useState(0.35);

  // Spot coordinate editing
  const [edits,setEdits]=useState({});
  const [copied,setCopied]=useState(false);

  // Area polygon editing (pre-loaded from existing AREAS)
  const [areaEdits,setAreaEdits]=useState(()=>{
    const init={};
    for(const [id,poly] of Object.entries(AREAS)){init[id]=poly.map(v=>[...v]);}
    return init;
  });
  const [areaSelSpot,setAreaSelSpot]=useState(null);
  const [areaCopied,setAreaCopied]=useState(false);

  // Paths sub-mode
  const [pathSub,setPathSub]=useState("view"); // view | wp | edge

  // Waypoint editing
  const [wpEdits,setWpEdits]=useState({});
  const [newWps,setNewWps]=useState([]);
  const [wpCopied,setWpCopied]=useState(false);

  // Edge editing
  const [newEdges,setNewEdges]=useState([]);
  const [edgeFrom,setEdgeFrom]=useState(null);
  const [edgeType,setEdgeType]=useState("path");
  const [edgeCopied,setEdgeCopied]=useState(false);
  const [deletedEdges,setDeletedEdges]=useState(new Set());

  // Entrance editing
  const [entEdit,setEntEdit]=useState(false);
  const [newEnts,setNewEnts]=useState([]);
  const [entDragEdits,setEntDragEdits]=useState({});
  const [entCopied,setEntCopied]=useState(false);

  // Spot registration
  const [spotRegType,setSpotRegType]=useState(null);
  const spotRegTypeRef=useRef(null);
  useEffect(()=>{spotRegTypeRef.current=spotRegType;},[spotRegType]);
  const [spotRegs,setSpotRegs]=useState(()=>{
    try{return JSON.parse(localStorage.getItem("editorSpotRegs")||"[]")}catch{return []}
  });
  const spotRegsRef=useRef(spotRegs);
  useEffect(()=>{spotRegsRef.current=spotRegs;},[spotRegs]);
  const [spotRegCopied,setSpotRegCopied]=useState(false);
  const saveSpotRegs=useCallback((regs)=>{setSpotRegs(regs);localStorage.setItem("editorSpotRegs",JSON.stringify(regs));},[]);

  // Navigation
  const nav=useNavigation();
  const [navDest,setNavDest]=useState(null);
  const [navOrigin,setNavOrigin]=useState(null);
  useEffect(()=>{nav.setOrigin(navOrigin);},[navOrigin]);
  useEffect(()=>{nav.setDestination(navDest);},[navDest]);

  // Cleanup on mode switch
  useEffect(()=>{
    setEdgeFrom(null);
    if(mode!=="paths")setPathSub("view");
    if(mode!=="entrances")setEntEdit(false);
    if(mode!=="register")setSpotRegType(null);
    if(mode!=="areas")setAreaSelSpot(null);
  },[mode]);

  /* ── Init map ── */
  useEffect(()=>{
    if(!leafletReady||!mapRef.current||mapInst.current)return;
    const L=window.L;
    const map=L.map(mapRef.current,{
      center:[CAMPUS_CENTER.lat,CAMPUS_CENTER.lng],zoom:CAMPUS_ZOOM,
      zoomControl:false,attributionControl:false,
    });
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:22,maxNativeZoom:19}).addTo(map);
    overlayRef.current=L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:22,maxNativeZoom:19,pane:"overlayPane",opacity:0.35}).addTo(map);
    L.control.zoom({position:"bottomright"}).addTo(map);
    L.control.attribution({position:"bottomleft",prefix:false}).addAttribution("&copy; Esri, Maxar, Earthstar Geographics").addTo(map);
    mapInst.current=map;
    return()=>{map.remove();mapInst.current=null;};
  },[leafletReady]);

  useEffect(()=>{if(overlayRef.current)overlayRef.current.setOpacity(overlayOp);},[overlayOp]);

  /* ══════════════════════════════════════════════════════════
     Marker rendering (the big one)
     ══════════════════════════════════════════════════════════ */
  useEffect(()=>{
    if(!mapInst.current||!leafletReady)return;
    const L=window.L;const map=mapInst.current;
    markersRef.current.forEach(m=>{if(m.remove)m.remove();else map.removeLayer(m);});
    markersRef.current=[];

    /* ── Spot edit mode ── */
    if(mode==="spots"){
      SPOTS.forEach(s=>{
        if(!s.id||s.lat==null)return;
        const pos=edits[s.id]||{lat:s.lat,lng:s.lng};
        const edited=!!edits[s.id];
        const icon=L.divIcon({className:"",
          html:`<div style="display:flex;align-items:center;gap:4px;padding:3px 8px 3px 5px;border-radius:8px;background:${edited?"#e8b63a":s.col};box-shadow:0 2px 8px rgba(0,0,0,.5);cursor:grab;white-space:nowrap;font-family:'Inter',sans-serif;transform:translate(-50%,-50%);border:2px solid ${edited?"#fff":"transparent"}">
            <span style="width:16px;height:16px;border-radius:3px;background:rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center;font-size:7px;font-weight:700;color:#fff">${s.short}</span>
            <span style="font-size:10px;font-weight:600;color:#fff">${s.label}</span></div>`,
          iconSize:[0,0],iconAnchor:[0,0],
        });
        const m=L.marker([pos.lat,pos.lng],{icon,draggable:true}).addTo(map);
        m.on("dragend",()=>{const ll=m.getLatLng();setEdits(prev=>({...prev,[s.id]:{lat:parseFloat(ll.lat.toFixed(5)),lng:parseFloat(ll.lng.toFixed(5))}}));});
        markersRef.current.push(m);
      });
      return;
    }

    /* ── Area edit mode ── */
    if(mode==="areas"){
      SPOTS.forEach(s=>{
        if(!s.id||s.lat==null)return;
        const verts=areaEdits[s.id]||[];
        const isSel=areaSelSpot===s.id;
        if(verts.length>=3){
          const poly=L.polygon(verts,{color:isSel?"#60a0ff":s.col,fillColor:isSel?"#60a0ff":s.col,fillOpacity:isSel?0.25:0.12,weight:isSel?2.5:1.5,opacity:isSel?0.9:0.5}).addTo(map);
          poly.on("click",ev=>{L.DomEvent.stopPropagation(ev);setAreaSelSpot(s.id);});
          markersRef.current.push(poly);
        }else if(verts.length===2){
          const line=L.polyline(verts,{color:isSel?"#60a0ff":s.col,weight:isSel?2.5:1.5,opacity:isSel?0.9:0.5,dashArray:"4,4"}).addTo(map);
          line.on("click",ev=>{L.DomEvent.stopPropagation(ev);setAreaSelSpot(s.id);});
          markersRef.current.push(line);
        }else if(verts.length===1){
          const dot=L.circleMarker(verts[0],{radius:4,color:isSel?"#60a0ff":s.col,fillColor:isSel?"#60a0ff":s.col,fillOpacity:0.5,weight:2}).addTo(map);
          dot.on("click",ev=>{L.DomEvent.stopPropagation(ev);setAreaSelSpot(s.id);});
          markersRef.current.push(dot);
        }
        // Label
        const icon=L.divIcon({className:"",
          html:`<div style="display:flex;align-items:center;gap:3px;padding:2px 6px;border-radius:6px;background:${isSel?"#60a0ff":s.col};box-shadow:0 1px 4px rgba(0,0,0,.4);cursor:pointer;white-space:nowrap;font-family:'Inter',sans-serif;transform:translate(-50%,-50%);border:${isSel?"2px solid #fff":"1.5px solid transparent"}">
            <span style="font-size:7px;font-weight:700;color:#fff">${s.short}</span>
            <span style="font-size:9px;font-weight:500;color:rgba(255,255,255,.8)">${verts.length}pt</span></div>`,
          iconSize:[0,0],iconAnchor:[0,0],
        });
        const m=L.marker([s.lat,s.lng],{icon}).addTo(map);
        m.on("click",()=>setAreaSelSpot(s.id));
        markersRef.current.push(m);
        // Draggable vertex handles
        if(isSel){
          verts.forEach((v,vi)=>{
            const hIcon=L.divIcon({className:"",
              html:`<div style="width:14px;height:14px;border-radius:50%;background:#fff;border:3px solid #60a0ff;box-shadow:0 2px 8px rgba(0,0,0,.4);cursor:grab;transform:translate(-50%,-50%)"><span style="position:absolute;top:-14px;left:50%;transform:translateX(-50%);font-size:8px;font-weight:700;color:#60a0ff;text-shadow:0 0 3px #000">${vi+1}</span></div>`,
              iconSize:[0,0],iconAnchor:[0,0],
            });
            const handle=L.marker(v,{icon:hIcon,draggable:true}).addTo(map);
            handle.on("dragend",()=>{
              const ll=handle.getLatLng();
              setAreaEdits(prev=>{const nv=[...(prev[s.id]||[])];nv[vi]=[parseFloat(ll.lat.toFixed(6)),parseFloat(ll.lng.toFixed(6))];return{...prev,[s.id]:nv};});
            });
            handle.on("contextmenu",ev=>{
              L.DomEvent.stopPropagation(ev);L.DomEvent.preventDefault(ev);
              setAreaEdits(prev=>{const nv=[...(prev[s.id]||[])].filter((_,i)=>i!==vi);return{...prev,[s.id]:nv};});
            });
            markersRef.current.push(handle);
          });
        }
      });
      const onMapClick=e=>{
        if(areaSelSpot){
          const lat=parseFloat(e.latlng.lat.toFixed(6));
          const lng=parseFloat(e.latlng.lng.toFixed(6));
          setAreaEdits(prev=>({...prev,[areaSelSpot]:[...(prev[areaSelSpot]||[]),[lat,lng]]}));
        }else{setAreaSelSpot(null);}
      };
      map.on("click",onMapClick);
      markersRef.current.push({remove:()=>map.off("click",onMapClick)});
      return;
    }

    /* ── Paths mode ── */
    if(mode==="paths"){
      const nodes={};
      SPOTS.forEach(s=>{if(!s.id||s.lat==null)return;nodes[s.id]={lat:s.lat,lng:s.lng};});
      const wpIdSet=new Set(WAYPOINTS.map(w=>w.id));
      [...WAYPOINTS,...newWps.filter(w=>!wpIdSet.has(w.id))].forEach(w=>{
        const ed=wpEdits[w.id];nodes[w.id]=ed||{lat:w.lat,lng:w.lng};
      });
      ENTRANCES.forEach((ent,idx)=>{nodes[`ent_${idx}`]={lat:ent.lat,lng:ent.lng};});

      // Draw edges
      const allEdges=[...EDGES,...newEdges];
      allEdges.forEach((e,ei)=>{
        const isExisting=ei<EDGES.length;
        if(isExisting&&deletedEdges.has(ei))return;
        const [a,b]=e;const type=e[2]||"path";
        const na=nodes[a],nb=nodes[b];if(!na||!nb)return;
        const isStairs=type==="stairs";const isNew=!isExisting;
        const line=L.polyline([[na.lat,na.lng],[nb.lat,nb.lng]],{
          color:isStairs?"#e06050":"#f0c040",weight:isNew?3:isStairs?2.5:2,
          opacity:isNew?0.85:0.5,dashArray:isNew?null:(isStairs?"2,6":"4,4"),
        }).addTo(map);
        if(pathSub==="edge"){
          line.setStyle({weight:3,opacity:0.7});
          line.bindTooltip("クリックで削除",{className:"spot-tip",direction:"top"});
          if(isNew){const ri=ei-EDGES.length;line.on("click",ev=>{L.DomEvent.stopPropagation(ev);setNewEdges(prev=>prev.filter((_,i)=>i!==ri));});}
          else{const ci=ei;line.on("click",ev=>{L.DomEvent.stopPropagation(ev);setDeletedEdges(prev=>{const s=new Set(prev);s.add(ci);return s;});});}
        }
        markersRef.current.push(line);
      });

      const wpIds=new Set(WAYPOINTS.map(w=>w.id));
      const allWps=[...WAYPOINTS,...newWps.filter(w=>!wpIds.has(w.id))];

      if(pathSub==="wp"){
        allWps.forEach(w=>{
          const pos=wpEdits[w.id]||{lat:w.lat,lng:w.lng};
          const edited=!!wpEdits[w.id];
          const isNew=!WAYPOINTS.find(x=>x.id===w.id);
          const icon=L.divIcon({className:"",
            html:`<div style="width:14px;height:14px;border-radius:50%;background:${edited||isNew?"#f0c040":"#f0c04080"};border:2px solid ${edited||isNew?"#fff":"#f0c04060"};cursor:grab;transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center"><span style="font-size:5px;font-weight:700;color:#000">${w.id.replace("wp_","").slice(0,3)}</span></div>`,
            iconSize:[0,0],iconAnchor:[0,0],
          });
          const m=L.marker([pos.lat,pos.lng],{icon,draggable:true}).addTo(map);
          m.bindTooltip(w.id+(isNew?" (NEW)":""),{className:"spot-tip",direction:"top",offset:[0,-6]});
          m.on("dragend",()=>{
            const ll=m.getLatLng();
            if(isNew){setNewWps(prev=>prev.map(x=>x.id===w.id?{...x,lat:parseFloat(ll.lat.toFixed(5)),lng:parseFloat(ll.lng.toFixed(5))}:x));}
            else{setWpEdits(prev=>({...prev,[w.id]:{lat:parseFloat(ll.lat.toFixed(5)),lng:parseFloat(ll.lng.toFixed(5))}}));}
          });
          markersRef.current.push(m);
        });
        const onClick=e=>{
          const id=`wp_${Date.now().toString(36)}`;
          setNewWps(prev=>[...prev,{id,lat:parseFloat(e.latlng.lat.toFixed(5)),lng:parseFloat(e.latlng.lng.toFixed(5))}]);
        };
        map.on("click",onClick);
        markersRef.current.push({remove:()=>map.off("click",onClick)});
      }else if(pathSub==="edge"){
        const edgeClick=nodeId=>{
          if(!edgeFrom){setEdgeFrom(nodeId);return;}
          if(edgeFrom===nodeId){setEdgeFrom(null);return;}
          const dup=[...EDGES.filter((_,i)=>!deletedEdges.has(i)),...newEdges].some(e=>(e[0]===edgeFrom&&e[1]===nodeId)||(e[0]===nodeId&&e[1]===edgeFrom));
          if(!dup){setNewEdges(prev=>[...prev,edgeType==="stairs"?[edgeFrom,nodeId,"stairs"]:[edgeFrom,nodeId]]);}
          setEdgeFrom(null);
        };
        allWps.forEach(w=>{
          const pos=wpEdits[w.id]||{lat:w.lat,lng:w.lng};
          const isSel=edgeFrom===w.id;
          const icon=L.divIcon({className:"",
            html:`<div style="width:${isSel?16:10}px;height:${isSel?16:10}px;border-radius:50%;background:${isSel?"#ff6060":"#f0c040"};border:2px solid ${isSel?"#fff":"#f0c04060"};cursor:pointer;transform:translate(-50%,-50%);${isSel?"box-shadow:0 0 12px #ff6060;":""}transition:all .15s"></div>`,
            iconSize:[0,0],iconAnchor:[0,0],
          });
          const m=L.marker([pos.lat,pos.lng],{icon}).addTo(map);
          m.bindTooltip(w.id,{className:"spot-tip",direction:"top",offset:[0,-4]});
          m.on("click",ev=>{L.DomEvent.stopPropagation(ev);edgeClick(w.id);});
          markersRef.current.push(m);
        });
        SPOTS.forEach(s=>{
          if(!s.id||s.lat==null)return;
          const isSel=edgeFrom===s.id;
          const icon=L.divIcon({className:"",
            html:`<div style="width:${isSel?16:10}px;height:${isSel?16:10}px;border-radius:50%;background:${isSel?"#ff6060":s.col};border:2px solid ${isSel?"#fff":"#fff4"};cursor:pointer;transform:translate(-50%,-50%);${isSel?"box-shadow:0 0 12px #ff6060;":""}transition:all .15s"></div>`,
            iconSize:[0,0],iconAnchor:[0,0],
          });
          const m=L.marker([s.lat,s.lng],{icon}).addTo(map);
          m.bindTooltip(s.label,{className:"spot-tip",direction:"top",offset:[0,-4]});
          m.on("click",ev=>{L.DomEvent.stopPropagation(ev);edgeClick(s.id);});
          markersRef.current.push(m);
        });
        ENTRANCES.forEach((ent,idx)=>{
          const nodeId=`ent_${idx}`;
          const s=SPOTS.find(x=>x.id===ent.spot);
          const isSel=edgeFrom===nodeId;
          const icon=L.divIcon({className:"",
            html:`<div style="width:${isSel?16:9}px;height:${isSel?16:9}px;border-radius:50%;background:${isSel?"#ff6060":"#4de8b0"};border:2px solid ${isSel?"#fff":"#fff6"};cursor:pointer;transform:translate(-50%,-50%);${isSel?"box-shadow:0 0 12px #ff6060;":""}transition:all .15s"></div>`,
            iconSize:[0,0],iconAnchor:[0,0],
          });
          const m=L.marker([ent.lat,ent.lng],{icon}).addTo(map);
          m.bindTooltip(`${s?.short||"?"} 入口 (${nodeId})`,{className:"spot-tip",direction:"top",offset:[0,-4]});
          m.on("click",ev=>{L.DomEvent.stopPropagation(ev);edgeClick(nodeId);});
          markersRef.current.push(m);
        });
        if(edgeFrom&&nodes[edgeFrom]){
          const fn=nodes[edgeFrom];
          const guide=L.polyline([[fn.lat,fn.lng],[fn.lat,fn.lng]],{color:"#ff6060",weight:2,opacity:0.6,dashArray:"4,6"}).addTo(map);
          const onMove=ev=>{guide.setLatLngs([[fn.lat,fn.lng],[ev.latlng.lat,ev.latlng.lng]]);};
          map.on("mousemove",onMove);
          markersRef.current.push(guide);
          markersRef.current.push({remove:()=>map.off("mousemove",onMove)});
        }
      }else{
        // Paths view: faint dots
        allWps.forEach(w=>{
          const pos=wpEdits[w.id]||{lat:w.lat,lng:w.lng};
          const dot=L.divIcon({className:"",html:`<div style="width:6px;height:6px;border-radius:50%;background:#f0c04080;transform:translate(-50%,-50%)"></div>`,iconSize:[0,0],iconAnchor:[0,0]});
          const m=L.marker([pos.lat,pos.lng],{icon:dot}).addTo(map);
          m.bindTooltip(w.id,{className:"spot-tip",direction:"top",offset:[0,-4]});
          markersRef.current.push(m);
        });
      }
      // Spot labels (all path sub-modes)
      SPOTS.forEach(s=>{
        if(!s.id||s.lat==null)return;
        const icon=L.divIcon({className:"",
          html:`<div style="padding:1px 4px;border-radius:4px;background:${s.col}80;transform:translate(-50%,-50%)"><span style="font-size:7px;font-weight:700;color:#fff">${s.short}</span></div>`,
          iconSize:[0,0],iconAnchor:[0,0],
        });
        const m=L.marker([s.lat,s.lng],{icon}).addTo(map);
        markersRef.current.push(m);
      });
      return;
    }

    /* ── Entrances mode ── */
    if(mode==="entrances"){
      const allEnts=[...ENTRANCES,...newEnts];
      allEnts.forEach((ent,idx)=>{
        const s=SPOTS.find(x=>x.id===ent.spot);if(!s||s.lat==null)return;
        const pos=entDragEdits[idx]||{lat:ent.lat,lng:ent.lng};
        const conn=L.polyline([[s.lat,s.lng],[pos.lat,pos.lng]],{color:s.col,weight:1.5,opacity:0.6}).addTo(map);
        markersRef.current.push(conn);
        if(entEdit){
          const edited=!!entDragEdits[idx];
          const icon=L.divIcon({className:"",
            html:`<div style="width:12px;height:12px;border-radius:50%;background:${edited?"#4de8b0":s.col};border:2px solid ${edited?"#fff":"#fff8"};cursor:grab;transform:translate(-50%,-50%);box-shadow:0 0 6px ${edited?"#4de8b0":s.col}80"></div>`,
            iconSize:[0,0],iconAnchor:[0,0],
          });
          const m=L.marker([pos.lat,pos.lng],{icon,draggable:true}).addTo(map);
          m.bindTooltip(`${s.short} 入口`,{className:"spot-tip",direction:"top",offset:[0,-6]});
          const ci=idx;
          m.on("dragend",()=>{const ll=m.getLatLng();setEntDragEdits(prev=>({...prev,[ci]:{lat:parseFloat(ll.lat.toFixed(5)),lng:parseFloat(ll.lng.toFixed(5))}}));});
          markersRef.current.push(m);
        }else{
          const dot=L.divIcon({className:"",
            html:`<div style="width:7px;height:7px;border-radius:50%;background:${s.col};border:1.5px solid #fff6;transform:translate(-50%,-50%)"></div>`,
            iconSize:[0,0],iconAnchor:[0,0],
          });
          const m=L.marker([pos.lat,pos.lng],{icon:dot}).addTo(map);
          m.bindTooltip(`${s.short} 入口`,{className:"spot-tip",direction:"top",offset:[0,-4]});
          markersRef.current.push(m);
        }
      });
      if(entEdit){
        const onClick=e=>{
          let closest=null,minD=Infinity;
          SPOTS.forEach(s=>{if(!s.id||s.lat==null)return;const d=Math.sqrt((e.latlng.lat-s.lat)**2+(e.latlng.lng-s.lng)**2);if(d<minD){minD=d;closest=s;}});
          if(closest&&minD<0.002){setNewEnts(prev=>[...prev,{spot:closest.id,lat:parseFloat(e.latlng.lat.toFixed(5)),lng:parseFloat(e.latlng.lng.toFixed(5))}]);}
        };
        map.on("click",onClick);
        markersRef.current.push({remove:()=>map.off("click",onClick)});
      }
      // Spot labels
      SPOTS.forEach(s=>{
        if(!s.id||s.lat==null)return;
        const icon=L.divIcon({className:"",
          html:`<div style="padding:1px 4px;border-radius:4px;background:${s.col}80;transform:translate(-50%,-50%)"><span style="font-size:7px;font-weight:700;color:#fff">${s.short}</span></div>`,
          iconSize:[0,0],iconAnchor:[0,0],
        });
        markersRef.current.push(L.marker([s.lat,s.lng],{icon}).addTo(map));
      });
      return;
    }

    /* ── Register mode ── */
    if(mode==="register"){
      spotRegs.forEach((r,i)=>{
        const t=SPOT_TYPES.find(x=>x.id===r.type);
        const dot=L.divIcon({className:"",
          html:`<div style="width:18px;height:18px;border-radius:50%;background:${t?.col||"#888"};border:2px solid #fff;display:flex;align-items:center;justify-content:center;transform:translate(-50%,-50%);font-size:7px;font-weight:700;color:#fff;cursor:grab">${t?.prefix||"?"}${i+1}</div>`,
          iconSize:[0,0],iconAnchor:[0,0],
        });
        const m=L.marker([r.lat,r.lng],{icon:dot,draggable:true}).addTo(map);
        m.bindTooltip(r.memo||t?.label||"",{className:"spot-tip",direction:"top",offset:[0,-10]});
        m.on("dragend",()=>{const pos=m.getLatLng();const updated=[...spotRegsRef.current];updated[i]={...updated[i],lat:parseFloat(pos.lat.toFixed(5)),lng:parseFloat(pos.lng.toFixed(5))};saveSpotRegs(updated);});
        markersRef.current.push(m);
      });
      const onSpotClick=e=>{
        const typeId=spotRegTypeRef.current;if(!typeId)return;
        const t=SPOT_TYPES.find(x=>x.id===typeId);
        const memo=prompt(`${t.label}のメモ（場所の説明）`,"");
        if(memo===null)return;
        saveSpotRegs([...spotRegsRef.current,{type:typeId,lat:parseFloat(e.latlng.lat.toFixed(5)),lng:parseFloat(e.latlng.lng.toFixed(5)),memo:memo||t.label,ts:Date.now()}]);
      };
      map.on("click",onSpotClick);
      markersRef.current.push({remove:()=>map.off("click",onSpotClick)});
      // Faint spots
      SPOTS.forEach(s=>{
        if(!s.id||s.lat==null)return;
        const dot=L.divIcon({className:"",html:`<div style="width:8px;height:8px;border-radius:50%;background:${s.col}50;border:1.5px solid ${s.col}30;transform:translate(-50%,-50%)"></div>`,iconSize:[0,0],iconAnchor:[0,0]});
        const m=L.marker([s.lat,s.lng],{icon:dot}).addTo(map);
        m.bindTooltip(s.label,{className:"spot-tip",direction:"top",offset:[0,-4]});
        markersRef.current.push(m);
      });
      return;
    }

    /* ── Nav mode ── */
    if(mode==="nav"){
      if(nav.route&&nav.route.coords.length>1){
        const latlngs=nav.route.coords.map(c=>[c.lat,c.lng]);
        markersRef.current.push(
          L.polyline(latlngs,{color:"#4de8b0",weight:14,opacity:0.15,lineCap:"round",lineJoin:"round"}).addTo(map),
          L.polyline(latlngs,{color:"#000",weight:7,opacity:0.25,lineCap:"round",lineJoin:"round"}).addTo(map),
          L.polyline(latlngs,{color:"#4de8b0",weight:5,opacity:0.95,lineCap:"round",lineJoin:"round"}).addTo(map),
        );
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
        map.fitBounds(L.latLngBounds(latlngs).pad(0.25));
      }
      SPOTS.forEach(s=>{
        if(!s.id||s.lat==null)return;
        const dot=L.divIcon({className:"",html:`<div style="width:8px;height:8px;border-radius:50%;background:${s.col}80;border:1.5px solid ${s.col}50;transform:translate(-50%,-50%)"></div>`,iconSize:[0,0],iconAnchor:[0,0]});
        const m=L.marker([s.lat,s.lng],{icon:dot}).addTo(map);
        m.bindTooltip(s.label,{className:"spot-tip",direction:"top",offset:[0,-4]});
        markersRef.current.push(m);
      });
      return;
    }

    /* ── View mode (default) ── */
    Object.entries(AREAS).forEach(([id,poly])=>{
      if(poly.length<3)return;const s=SPOTS.find(x=>x.id===id);if(!s)return;
      markersRef.current.push(L.polygon(poly,{color:s.col,fillColor:s.col,fillOpacity:0.1,weight:1,opacity:0.4}).addTo(map));
    });
    SPOTS.forEach(s=>{
      if(!s.id||s.lat==null)return;
      const icon=L.divIcon({className:"",
        html:`<div style="display:flex;align-items:center;gap:4px;padding:3px 7px 3px 5px;border-radius:8px;background:${s.col};box-shadow:0 2px 8px rgba(0,0,0,.4);white-space:nowrap;font-family:'Inter',sans-serif;transform:translate(-50%,-50%)">
          <span style="width:16px;height:16px;border-radius:3px;background:rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center;font-size:7px;font-weight:700;color:#fff">${s.short}</span>
          <span style="font-size:10px;font-weight:600;color:#fff">${s.label}</span></div>`,
        iconSize:[0,0],iconAnchor:[0,0],
      });
      markersRef.current.push(L.marker([s.lat,s.lng],{icon}).addTo(map));
    });

  },[leafletReady,mode,edits,areaEdits,areaSelSpot,pathSub,wpEdits,newWps,edgeFrom,newEdges,edgeType,deletedEdges,entEdit,newEnts,entDragEdits,spotRegType,spotRegs,navDest,navOrigin,nav.route]);

  /* ══════════════════════════════════════════════════════════
     Copy / Export functions
     ══════════════════════════════════════════════════════════ */
  const copyEdits=()=>{
    const lines=Object.entries(edits).map(([id,pos])=>{const s=SPOTS.find(x=>x.id===id);return `  { id: "${id}", label: "${s?.label}", lat: ${pos.lat}, lng: ${pos.lng} },`;}).join("\n");
    navigator.clipboard.writeText(lines);setCopied(true);setTimeout(()=>setCopied(false),2000);
  };
  const copyWpEdits=()=>{
    const cpIds=new Set(WAYPOINTS.map(w=>w.id));
    const allWps=[...WAYPOINTS,...newWps.filter(w=>!cpIds.has(w.id))];
    const lines=allWps.map(w=>{const pos=wpEdits[w.id]||{lat:w.lat,lng:w.lng};return `  { id: "${w.id}", lat: ${pos.lat}, lng: ${pos.lng} },`;}).join("\n");
    navigator.clipboard.writeText(lines);setWpCopied(true);setTimeout(()=>setWpCopied(false),2000);
  };
  const copyEdgeEdits=()=>{
    const remaining=EDGES.filter((_,i)=>!deletedEdges.has(i));
    const allE=[...remaining,...newEdges];
    const lines=allE.map(e=>{const type=e[2];return type?`  ["${e[0]}", "${e[1]}", "${type}"],`:`  ["${e[0]}", "${e[1]}"],`;}).join("\n");
    navigator.clipboard.writeText(lines);setEdgeCopied(true);setTimeout(()=>setEdgeCopied(false),2000);
  };
  const copyAreaEdits=()=>{
    const entries=Object.entries(areaEdits).filter(([,v])=>v.length>0).map(([id,verts])=>{const pts=verts.map(v=>`[${v[0]},${v[1]}]`).join(",");return `  "${id}": [${pts}],`;}).join("\n");
    navigator.clipboard.writeText(`{\n${entries}\n}`);setAreaCopied(true);setTimeout(()=>setAreaCopied(false),2000);
  };
  const copyEntEdits=()=>{
    const allEnts=[...ENTRANCES,...newEnts];
    const lines=allEnts.map((ent,idx)=>{const pos=entDragEdits[idx]||{lat:ent.lat,lng:ent.lng};return `  { spot: "${ent.spot}", lat: ${pos.lat}, lng: ${pos.lng} },`;}).join("\n");
    navigator.clipboard.writeText(lines);setEntCopied(true);setTimeout(()=>setEntCopied(false),2000);
  };
  const copySpotRegs=()=>{
    const lines=spotRegs.map((r,i)=>{const t=SPOT_TYPES.find(x=>x.id===r.type);const n=spotRegs.slice(0,i+1).filter(x=>x.type===r.type).length;return `  { id: "${r.type}_${n}", label: "${t?.label||r.type}（${r.memo}）", short: "${t?.prefix||"?"}${n}", col: "${t?.col||"#888"}", cat: "outdoor", lat: ${r.lat}, lng: ${r.lng} },`;}).join("\n");
    navigator.clipboard.writeText(lines);setSpotRegCopied(true);setTimeout(()=>setSpotRegCopied(false),2000);
  };

  const exportJSON=()=>{
    const spots=SPOTS.map(s=>edits[s.id]?{...s,lat:edits[s.id].lat,lng:edits[s.id].lng}:s);
    const areas={};for(const [id,poly] of Object.entries(areaEdits)){if(poly.length>0)areas[id]=poly;}
    const wpIds=new Set(WAYPOINTS.map(w=>w.id));
    const waypoints=[...WAYPOINTS.map(w=>wpEdits[w.id]?{...w,...wpEdits[w.id]}:w),...newWps.filter(w=>!wpIds.has(w.id))];
    const edges=[...EDGES.filter((_,i)=>!deletedEdges.has(i)),...newEdges];
    const entrances=[...ENTRANCES,...newEnts].map((ent,idx)=>entDragEdits[idx]?{...ent,...entDragEdits[idx]}:ent);
    const data={spots,spotCats:SPOT_CATS,areas,waypoints,edges,entrances};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download=`map-data-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url);
  };

  /* ── Stats ── */
  const stats=useMemo(()=>{
    const geoSpots=SPOTS.filter(s=>s.id&&s.lat!=null).length;
    const areaCount=Object.values(areaEdits).filter(v=>v.length>=3).length;
    const wpCount=WAYPOINTS.length+newWps.length;
    const edgeCount=EDGES.length-deletedEdges.size+newEdges.length;
    const entCount=ENTRANCES.length+newEnts.length;
    return {geoSpots,areaCount,wpCount,edgeCount,entCount};
  },[areaEdits,newWps,newEdges,deletedEdges,newEnts]);

  /* ── Help text ── */
  const helpKey=mode==="paths"?`paths_${pathSub}`:mode;
  const helpText=HELP[helpKey]||HELP[mode]||"";

  if(!leafletReady)return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:T.bg,color:T.txD,fontFamily:"'Inter',sans-serif"}}>地図を読み込み中...</div>
  );

  const editCount=Object.keys(edits).length;
  const wpEditCount=Object.keys(wpEdits).length+newWps.length;

  /* ══════════════════════════════════════════════════════════
     Render
     ══════════════════════════════════════════════════════════ */
  return(
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:T.bg,fontFamily:"'Inter',sans-serif",color:T.txH}}>
      {/* ── Header ── */}
      <header style={{display:"flex",alignItems:"center",gap:8,padding:"8px 16px",background:T.bg2,borderBottom:`1px solid ${T.bd}`,flexShrink:0,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginRight:8}}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <span style={{fontSize:15,fontWeight:700}}>マップエディタ</span>
        </div>
        <nav style={{display:"flex",gap:4,flex:1,flexWrap:"wrap"}}>
          {MODES.map(m=>{
            const active=mode===m.id;
            return <button key={m.id} onClick={()=>setMode(m.id)} style={{padding:"5px 12px",borderRadius:6,border:`1.5px solid ${active?m.col:"transparent"}`,background:active?`${m.col}20`:"transparent",cursor:"pointer",transition:"all .15s"}}>
              <span style={{fontSize:11,fontWeight:active?700:500,color:active?m.col:T.txD}}>{m.label}</span>
            </button>;
          })}
        </nav>
        <button onClick={exportJSON} style={{display:"flex",alignItems:"center",gap:5,padding:"5px 12px",borderRadius:6,border:`1px solid ${T.accent}`,background:`${T.accent}15`,cursor:"pointer"}}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span style={{fontSize:11,fontWeight:600,color:T.accent}}>JSON出力</span>
        </button>
      </header>

      {/* ── Stats + help bar ── */}
      <div style={{display:"flex",gap:16,padding:"4px 16px",background:T.bg3,borderBottom:`1px solid ${T.bd}`,fontSize:10,color:T.txD,flexShrink:0,alignItems:"center",flexWrap:"wrap"}}>
        <span>スポット: <b style={{color:T.txH}}>{stats.geoSpots}</b></span>
        <span>エリア: <b style={{color:T.txH}}>{stats.areaCount}</b></span>
        <span>WP: <b style={{color:T.txH}}>{stats.wpCount}</b></span>
        <span>Edge: <b style={{color:T.txH}}>{stats.edgeCount}</b></span>
        <span>入口: <b style={{color:T.txH}}>{stats.entCount}</b></span>
        {helpText&&<span style={{marginLeft:"auto",color:MODES.find(m=>m.id===mode)?.col||T.txD,fontWeight:500}}>{helpText}</span>}
      </div>

      {/* ── Map ── */}
      <div style={{flex:1,position:"relative",overflow:"hidden"}}>
        <style>{`
.leaflet-container{background:${T.bg}!important}
.leaflet-control-zoom a{background:${T.bg2}!important;color:${T.txH}!important;border-color:${T.bd}!important}
.leaflet-control-zoom a:hover{background:${T.bg3}!important}
.leaflet-control-attribution{background:${T.bg2}cc!important;color:${T.txD}!important;font-size:9px!important}
.leaflet-control-attribution a{color:${T.txD}!important}
.spot-tip{background:${T.bg2}!important;color:${T.txH}!important;border:1px solid ${T.bdL}!important;border-radius:8px!important;padding:6px 10px!important;font-size:11px!important;font-weight:500!important;font-family:'Inter',sans-serif!important;box-shadow:0 4px 16px rgba(0,0,0,.45)!important;white-space:nowrap!important}
.spot-tip .leaflet-tooltip-arrow{display:none!important}
        `}</style>
        <div ref={mapRef} style={{width:"100%",height:"100%"}}/>

        {/* Overlay slider */}
        <div style={{position:"absolute",bottom:30,left:10,zIndex:1000,display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:8,background:`${T.bg2}d0`,backdropFilter:"blur(8px)",border:`1px solid ${T.bd}`}}>
          <span style={{fontSize:9,fontWeight:600,color:T.txD,whiteSpace:"nowrap"}}>地図</span>
          <input type="range" min="0" max="100" value={Math.round(overlayOp*100)} onChange={e=>setOverlayOp(e.target.value/100)} style={{width:80,height:3,accentColor:"#f0c040",cursor:"pointer"}}/>
          <span style={{fontSize:9,color:T.txD,fontFamily:"monospace",minWidth:28}}>{Math.round(overlayOp*100)}%</span>
        </div>

        {/* ── Paths sub-tabs ── */}
        {mode==="paths"&&<div style={{position:"absolute",top:10,left:10,zIndex:1000,display:"flex",gap:4}}>
          {[{id:"view",label:"表示",col:"#f0c040"},{id:"wp",label:"WP編集",col:"#f0c040"},{id:"edge",label:"Edge編集",col:"#ff8040"}].map(s=>{
            const active=pathSub===s.id;
            return <button key={s.id} onClick={()=>{setPathSub(s.id);setEdgeFrom(null);}} style={{padding:"5px 10px",borderRadius:6,border:`1.5px solid ${active?s.col:T.bd}`,background:active?s.col:`${T.bg2}e0`,backdropFilter:"blur(8px)",cursor:"pointer"}}>
              <span style={{fontSize:10,fontWeight:600,color:active?"#000":T.txH}}>{s.label}</span>
            </button>;
          })}
        </div>}

        {/* ── Entrance edit toggle ── */}
        {mode==="entrances"&&<div style={{position:"absolute",top:10,left:10,zIndex:1000}}>
          <button onClick={()=>setEntEdit(e=>!e)} style={{padding:"5px 10px",borderRadius:6,border:`1.5px solid ${entEdit?"#4de8b0":T.bd}`,background:entEdit?"#4de8b0":`${T.bg2}e0`,backdropFilter:"blur(8px)",cursor:"pointer"}}>
            <span style={{fontSize:10,fontWeight:600,color:entEdit?"#000":T.txH}}>{entEdit?"編集中":"編集モード"}</span>
          </button>
        </div>}

        {/* ══════════════ Floating Panels ══════════════ */}

        {/* Spot edit panel */}
        {mode==="spots"&&editCount>0&&<div style={{position:"absolute",top:10,right:10,zIndex:1000,width:260,borderRadius:10,background:`${T.bg2}f0`,backdropFilter:"blur(8px)",border:`1px solid ${T.bdL}`,boxShadow:"0 4px 16px rgba(0,0,0,.4)",padding:10,maxHeight:300,overflowY:"auto"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#e8b63a",marginBottom:6}}>{editCount}件の変更</div>
          {Object.entries(edits).map(([id,pos])=>{const s=SPOTS.find(x=>x.id===id);return(
            <div key={id} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 0",borderBottom:`1px solid ${T.bd}`}}>
              <div style={{width:16,height:16,borderRadius:3,background:s?.col||"#888",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:6,fontWeight:700,color:"#fff"}}>{s?.short}</span></div>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:10,fontWeight:600,color:T.txH}}>{s?.label}</div><div style={{fontSize:9,color:T.txD,fontFamily:"monospace"}}>{pos.lat}, {pos.lng}</div></div>
            </div>);})}
          <button onClick={copyEdits} style={{display:"flex",alignItems:"center",justifyContent:"center",width:"100%",padding:"7px",borderRadius:7,border:"none",background:copied?"#4db88a":"#e8b63a",cursor:"pointer",marginTop:8}}>
            <span style={{fontSize:11,fontWeight:700,color:"#000"}}>{copied?"コピーしました":"座標をコピー"}</span>
          </button>
          <button onClick={()=>setEdits({})} style={{display:"flex",alignItems:"center",justifyContent:"center",width:"100%",padding:"5px",borderRadius:7,border:`1px solid ${T.bd}`,background:"transparent",cursor:"pointer",marginTop:4}}>
            <span style={{fontSize:10,fontWeight:500,color:T.txD}}>リセット</span>
          </button>
        </div>}

        {/* Area edit panel */}
        {mode==="areas"&&<div style={{position:"absolute",top:10,right:10,zIndex:1000,width:270,borderRadius:10,background:`${T.bg2}f0`,backdropFilter:"blur(8px)",border:"1px solid #60a0ff",boxShadow:"0 4px 16px rgba(0,0,0,.4)",padding:10,maxHeight:380,display:"flex",flexDirection:"column"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#60a0ff",marginBottom:6}}>建物範囲{areaSelSpot?` — ${SPOTS.find(s=>s.id===areaSelSpot)?.label||areaSelSpot}`:""}</div>
          {areaSelSpot&&<div style={{marginBottom:8,padding:"6px 8px",borderRadius:8,background:"#60a0ff10",border:"1px solid #60a0ff30"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
              <span style={{fontSize:10,fontWeight:600,color:"#60a0ff"}}>{(areaEdits[areaSelSpot]||[]).length}頂点</span>
              <div style={{display:"flex",gap:4}}>
                {(areaEdits[areaSelSpot]||[]).length>0&&<button onClick={()=>setAreaEdits(prev=>{const nv=[...(prev[areaSelSpot]||[])];nv.pop();return{...prev,[areaSelSpot]:nv};})} style={{fontSize:9,fontWeight:600,color:"#ff6060",background:"#ff606014",border:"1px solid #ff606030",borderRadius:5,padding:"2px 6px",cursor:"pointer"}}>末尾削除</button>}
                {(areaEdits[areaSelSpot]||[]).length>0&&<button onClick={()=>setAreaEdits(prev=>({...prev,[areaSelSpot]:[]}))} style={{fontSize:9,fontWeight:600,color:"#ff6060",background:"#ff606014",border:"1px solid #ff606030",borderRadius:5,padding:"2px 6px",cursor:"pointer"}}>全削除</button>}
              </div>
            </div>
            <div style={{fontSize:9,color:T.txD,lineHeight:1.4}}>クリックで頂点追加。ドラッグで移動。右クリックで削除。</div>
          </div>}
          <div style={{flex:1,overflowY:"auto",maxHeight:200}}>
            {SPOTS.filter(s=>s.id&&s.lat!=null).map(s=>{
              const verts=areaEdits[s.id]||[];const isSel=areaSelSpot===s.id;
              return <div key={s.id} onClick={()=>setAreaSelSpot(s.id)} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 6px",borderRadius:6,borderBottom:`1px solid ${T.bd}`,cursor:"pointer",background:isSel?"#60a0ff14":"transparent"}}>
                <div style={{width:14,height:14,borderRadius:3,background:s.col,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:5,fontWeight:700,color:"#fff"}}>{s.short}</span></div>
                <div style={{flex:1,fontSize:10,fontWeight:isSel?700:500,color:isSel?"#60a0ff":T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.label}</div>
                <span style={{fontSize:9,fontWeight:600,color:verts.length>0?"#60a0ff":T.txD,fontFamily:"monospace"}}>{verts.length}pt</span>
              </div>;
            })}
          </div>
          {Object.values(areaEdits).some(v=>v.length>0)&&<button onClick={copyAreaEdits} style={{display:"flex",alignItems:"center",justifyContent:"center",width:"100%",padding:"7px",borderRadius:7,border:"none",background:areaCopied?"#4db88a":"#60a0ff",cursor:"pointer",marginTop:8}}>
            <span style={{fontSize:11,fontWeight:700,color:"#fff"}}>{areaCopied?"コピーしました":"ポリゴンデータをコピー"}</span>
          </button>}
          <button onClick={()=>{setAreaEdits({});setAreaSelSpot(null);}} style={{display:"flex",alignItems:"center",justifyContent:"center",width:"100%",padding:"5px",borderRadius:7,border:`1px solid ${T.bd}`,background:"transparent",cursor:"pointer",marginTop:4}}>
            <span style={{fontSize:10,fontWeight:500,color:T.txD}}>リセット</span>
          </button>
        </div>}

        {/* Edge edit panel */}
        {mode==="paths"&&pathSub==="edge"&&<div style={{position:"absolute",top:46,right:10,zIndex:1000,width:280,borderRadius:10,background:`${T.bg2}f0`,backdropFilter:"blur(8px)",border:"1px solid #ff8040",boxShadow:"0 4px 16px rgba(0,0,0,.4)",padding:10,maxHeight:340,display:"flex",flexDirection:"column"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
            <div style={{fontSize:11,fontWeight:700,color:"#ff8040"}}>Edge {EDGES.length-deletedEdges.size+newEdges.length}件{newEdges.length>0&&` (+${newEdges.length})`}{deletedEdges.size>0&&` (-${deletedEdges.size})`}</div>
            {edgeFrom&&<div style={{fontSize:10,fontWeight:600,color:"#ff6060",background:"#ff606018",padding:"2px 8px",borderRadius:6}}>始点: {edgeFrom.replace("wp_","").slice(0,8)}</div>}
          </div>
          <div style={{display:"flex",gap:4,marginBottom:8}}>
            <button onClick={()=>setEdgeType("path")} style={{flex:1,padding:"5px",borderRadius:6,border:`1px solid ${edgeType==="path"?"#f0c040":T.bd}`,background:edgeType==="path"?"#f0c04020":"transparent",cursor:"pointer"}}>
              <span style={{fontSize:10,fontWeight:600,color:edgeType==="path"?"#f0c040":T.txD}}>道</span>
            </button>
            <button onClick={()=>setEdgeType("stairs")} style={{flex:1,padding:"5px",borderRadius:6,border:`1px solid ${edgeType==="stairs"?"#e06050":T.bd}`,background:edgeType==="stairs"?"#e0605020":"transparent",cursor:"pointer"}}>
              <span style={{fontSize:10,fontWeight:600,color:edgeType==="stairs"?"#e06050":T.txD}}>階段</span>
            </button>
          </div>
          {newEdges.length>0&&<div style={{overflowY:"auto",marginBottom:4,maxHeight:80}}>
            <div style={{fontSize:9,fontWeight:600,color:"#f0c040",marginBottom:2}}>追加 ({newEdges.length})</div>
            {newEdges.map((e,i)=>{
              const nA=SPOTS.find(s=>s.id===e[0])?.short||e[0].replace("wp_","").slice(0,6);
              const nB=SPOTS.find(s=>s.id===e[1])?.short||e[1].replace("wp_","").slice(0,6);
              return <div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"3px 0",borderBottom:`1px solid ${T.bd}`}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:e[2]==="stairs"?"#e06050":"#f0c040",flexShrink:0}}/>
                <div style={{flex:1,fontSize:10,color:T.txH,fontFamily:"monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{nA} → {nB}{e[2]==="stairs"?" (階段)":""}</div>
                <button onClick={()=>setNewEdges(prev=>prev.filter((_,j)=>j!==i))} style={{background:"none",border:"none",cursor:"pointer",color:T.txD,fontSize:12,padding:"0 2px"}}>×</button>
              </div>;
            })}
          </div>}
          {deletedEdges.size>0&&<div style={{overflowY:"auto",marginBottom:4,maxHeight:80}}>
            <div style={{fontSize:9,fontWeight:600,color:"#e06050",marginBottom:2}}>削除 ({deletedEdges.size})</div>
            {[...deletedEdges].map(idx=>{
              const e=EDGES[idx];if(!e)return null;
              const nA=SPOTS.find(s=>s.id===e[0])?.short||e[0].replace("wp_","").slice(0,6);
              const nB=SPOTS.find(s=>s.id===e[1])?.short||e[1].replace("wp_","").slice(0,6);
              return <div key={idx} style={{display:"flex",alignItems:"center",gap:6,padding:"3px 0",borderBottom:`1px solid ${T.bd}`,opacity:0.7}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:"#e06050",flexShrink:0}}/>
                <div style={{flex:1,fontSize:10,color:T.txD,fontFamily:"monospace",textDecoration:"line-through"}}>{nA} → {nB}</div>
                <button onClick={()=>setDeletedEdges(prev=>{const s=new Set(prev);s.delete(idx);return s;})} style={{background:"none",border:"none",cursor:"pointer",color:"#4de8b0",fontSize:10,padding:"0 4px",fontWeight:700}}>↩</button>
              </div>;
            })}
          </div>}
          <button onClick={copyEdgeEdits} style={{display:"flex",alignItems:"center",justifyContent:"center",width:"100%",padding:"7px",borderRadius:7,border:"none",background:edgeCopied?"#4db88a":"#ff8040",cursor:"pointer"}}>
            <span style={{fontSize:11,fontWeight:700,color:"#fff"}}>{edgeCopied?"コピーしました":"Edge配列をコピー"}</span>
          </button>
          <button onClick={()=>{setNewEdges([]);setEdgeFrom(null);setDeletedEdges(new Set());}} style={{display:"flex",alignItems:"center",justifyContent:"center",width:"100%",padding:"5px",borderRadius:7,border:`1px solid ${T.bd}`,background:"transparent",cursor:"pointer",marginTop:4}}>
            <span style={{fontSize:10,fontWeight:500,color:T.txD}}>リセット</span>
          </button>
        </div>}

        {/* WP edit panel */}
        {mode==="paths"&&pathSub==="wp"&&wpEditCount>0&&<div style={{position:"absolute",top:46,right:10,zIndex:1000,width:260,borderRadius:10,background:`${T.bg2}f0`,backdropFilter:"blur(8px)",border:"1px solid #f0c040",boxShadow:"0 4px 16px rgba(0,0,0,.4)",padding:10,maxHeight:300,overflowY:"auto"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#f0c040",marginBottom:6}}>WP {WAYPOINTS.length+newWps.length}件{newWps.length>0&&` (新規${newWps.length})`}</div>
          {newWps.slice(-10).map(w=>(
            <div key={w.id} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 0",borderBottom:`1px solid ${T.bd}`}}>
              <div style={{width:16,height:16,borderRadius:"50%",background:"#f0c040",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:6,fontWeight:700,color:"#000"}}>{w.id.replace("wp_","").slice(0,2)}</span></div>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:10,fontWeight:600,color:T.txH}}>{w.id}<span style={{color:"#f0c040",marginLeft:4}}>NEW</span></div><div style={{fontSize:9,color:T.txD,fontFamily:"monospace"}}>{w.lat}, {w.lng}</div></div>
            </div>))}
          {Object.keys(wpEdits).length>0&&<div style={{fontSize:9,color:"#f0c040",padding:"4px 0"}}>{Object.keys(wpEdits).length}件の既存WP移動</div>}
          <button onClick={copyWpEdits} style={{display:"flex",alignItems:"center",justifyContent:"center",width:"100%",padding:"7px",borderRadius:7,border:"none",background:wpCopied?"#4db88a":"#f0c040",cursor:"pointer",marginTop:8}}>
            <span style={{fontSize:11,fontWeight:700,color:"#000"}}>{wpCopied?"コピーしました":"WP座標をコピー"}</span>
          </button>
          <button onClick={()=>{setNewWps([]);setWpEdits({});}} style={{display:"flex",alignItems:"center",justifyContent:"center",width:"100%",padding:"5px",borderRadius:7,border:`1px solid ${T.bd}`,background:"transparent",cursor:"pointer",marginTop:4}}>
            <span style={{fontSize:10,fontWeight:500,color:T.txD}}>リセット</span>
          </button>
        </div>}

        {/* Entrance edit panel */}
        {mode==="entrances"&&entEdit&&(newEnts.length>0||Object.keys(entDragEdits).length>0)&&<div style={{position:"absolute",top:46,right:10,zIndex:1000,width:260,borderRadius:10,background:`${T.bg2}f0`,backdropFilter:"blur(8px)",border:"1px solid #4de8b0",boxShadow:"0 4px 16px rgba(0,0,0,.4)",padding:10,maxHeight:300,overflowY:"auto"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#4de8b0",marginBottom:6}}>入口 {ENTRANCES.length+newEnts.length}件{newEnts.length>0&&` (新規${newEnts.length})`}{Object.keys(entDragEdits).length>0&&` (移動${Object.keys(entDragEdits).length})`}</div>
          {newEnts.map((ent,i)=>{const s=SPOTS.find(x=>x.id===ent.spot);return(
            <div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 0",borderBottom:`1px solid ${T.bd}`}}>
              <div style={{width:16,height:16,borderRadius:3,background:s?.col||"#888",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:6,fontWeight:700,color:"#fff"}}>{s?.short}</span></div>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:10,fontWeight:600,color:T.txH}}>{s?.label}<span style={{color:"#4de8b0",marginLeft:4}}>NEW</span></div><div style={{fontSize:9,color:T.txD,fontFamily:"monospace"}}>{ent.lat}, {ent.lng}</div></div>
            </div>);})}
          <button onClick={copyEntEdits} style={{display:"flex",alignItems:"center",justifyContent:"center",width:"100%",padding:"7px",borderRadius:7,border:"none",background:entCopied?"#4db88a":"#4de8b0",cursor:"pointer",marginTop:8}}>
            <span style={{fontSize:11,fontWeight:700,color:"#000"}}>{entCopied?"コピーしました":"入口座標をコピー"}</span>
          </button>
          <button onClick={()=>{setNewEnts([]);setEntDragEdits({});}} style={{display:"flex",alignItems:"center",justifyContent:"center",width:"100%",padding:"5px",borderRadius:7,border:`1px solid ${T.bd}`,background:"transparent",cursor:"pointer",marginTop:4}}>
            <span style={{fontSize:10,fontWeight:500,color:T.txD}}>リセット</span>
          </button>
        </div>}

        {/* Spot registration panel */}
        {mode==="register"&&<div style={{position:"absolute",bottom:50,left:10,right:10,maxWidth:400,zIndex:1000,borderRadius:12,background:`${T.bg2}f0`,backdropFilter:"blur(8px)",border:"1px solid #8bc34a",boxShadow:"0 4px 16px rgba(0,0,0,.4)",padding:12}}>
          <div style={{fontSize:11,fontWeight:700,color:"#8bc34a",marginBottom:8}}>屋外スポット登録</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
            {SPOT_TYPES.map(t=>{const active=spotRegType===t.id;return(
              <button key={t.id} onClick={()=>setSpotRegType(active?null:t.id)} style={{display:"flex",alignItems:"center",gap:5,padding:"7px 12px",borderRadius:8,border:`1.5px solid ${t.col}`,background:active?t.col:`${t.col}18`,cursor:"pointer"}}>
                <div style={{width:14,height:14,borderRadius:"50%",background:active?"#fff":t.col}}/>
                <span style={{fontSize:11,fontWeight:600,color:active?"#fff":t.col}}>{t.label}</span>
              </button>);})}
          </div>
          {spotRegType&&<div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",marginBottom:8,borderRadius:8,background:"#8bc34a15"}}>
            <span style={{fontSize:11,color:"#8bc34a",fontWeight:500}}>マップをクリックしてスポットを配置</span>
          </div>}
          {spotRegs.length>0&&<>
            <div style={{maxHeight:120,overflowY:"auto",marginBottom:8}}>
              {spotRegs.map((r,i)=>{const t=SPOT_TYPES.find(x=>x.id===r.type);return(
                <div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 0",borderBottom:`1px solid ${T.bd}`}}>
                  <div style={{width:14,height:14,borderRadius:"50%",background:t?.col||"#888",flexShrink:0}}/>
                  <span style={{fontSize:11,color:T.txH,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.memo}</span>
                  <span style={{fontSize:9,color:T.txD,flexShrink:0}}>{r.lat},{r.lng}</span>
                  <button onClick={()=>saveSpotRegs(spotRegs.filter((_,j)=>j!==i))} style={{background:"none",border:"none",cursor:"pointer",color:T.red,fontSize:12,padding:"0 2px"}}>x</button>
                </div>);})}
            </div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={copySpotRegs} style={{flex:1,padding:"7px 0",borderRadius:8,border:"1px solid #8bc34a",background:"#8bc34a20",cursor:"pointer",fontSize:11,fontWeight:600,color:"#8bc34a"}}>{spotRegCopied?"Copied!":"コードをコピー"}</button>
              <button onClick={()=>{if(confirm("全て削除しますか？"))saveSpotRegs([]);}} style={{padding:"7px 12px",borderRadius:8,border:`1px solid ${T.red}`,background:`${T.red}10`,cursor:"pointer",fontSize:11,fontWeight:600,color:T.red}}>全削除</button>
            </div>
          </>}
        </div>}

        {/* Navigation panel */}
        {mode==="nav"&&<div style={{position:"absolute",bottom:50,left:10,right:10,maxWidth:380,zIndex:1000,background:T.bg2,borderRadius:16,boxShadow:"0 4px 24px rgba(0,0,0,.45)",border:`1px solid ${T.bdL}`,overflow:"hidden"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",borderBottom:`1px solid ${T.bd}`}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4de8b0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
            <span style={{fontSize:13,fontWeight:700,color:T.txH,flex:1}}>ナビプレビュー</span>
          </div>
          <div style={{padding:"10px 14px"}}>
            <div style={{fontSize:11,color:T.txD,marginBottom:4}}>出発地</div>
            <select value={navOrigin||""} onChange={e=>setNavOrigin(e.target.value||null)} style={{width:"100%",padding:"8px 10px",borderRadius:10,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:12,outline:"none",cursor:"pointer",marginBottom:8}}>
              <option value="">選択...</option>
              {SPOT_CATS.map(cat=>{const spots=NAV_SPOTS.filter(s=>s.cat===cat.id);return spots.length>0&&<optgroup key={cat.id} label={cat.label}>{spots.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</optgroup>;})}
            </select>
            <div style={{fontSize:11,color:T.txD,marginBottom:4}}>目的地</div>
            <select value={navDest||""} onChange={e=>setNavDest(e.target.value||null)} style={{width:"100%",padding:"8px 10px",borderRadius:10,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:12,outline:"none",cursor:"pointer"}}>
              <option value="">選択...</option>
              {SPOT_CATS.map(cat=>{const spots=NAV_SPOTS.filter(s=>s.cat===cat.id);return spots.length>0&&<optgroup key={cat.id} label={cat.label}>{spots.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</optgroup>;})}
            </select>
          </div>
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
              {nav.route.hasStairs&&<div style={{display:"flex",alignItems:"center",gap:3,marginTop:4,padding:"2px 7px",borderRadius:6,background:`${T.orange}12`,width:"fit-content"}}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.orange} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 18h4v-4h4v-4h4v-4h4"/></svg>
                <span style={{fontSize:10,fontWeight:600,color:T.orange}}>階段あり</span>
              </div>}
            </div>
          </div>}
          {navOrigin&&navDest&&!nav.route&&<div style={{padding:"0 14px 12px",fontSize:12,color:T.txD}}>経路が見つかりません</div>}
        </div>}

      </div>
    </div>
  );
}
