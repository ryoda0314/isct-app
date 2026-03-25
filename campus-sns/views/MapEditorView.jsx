import { useState, useEffect, useRef, useCallback } from "react";
import { T } from "../theme.js";
import { useLeaflet, Loader } from "../shared.jsx";
import { SPOTS, CAMPUS_CENTER, CAMPUS_ZOOM, WAYPOINTS, EDGES, ENTRANCES, AREAS } from "../hooks/useLocationSharing.js";

const SPOT_TYPES=[
  {id:"bench",label:"ベンチ",prefix:"B",col:"#8bc34a"},
  {id:"park",label:"駐輪場",prefix:"P",col:"#78909c"},
  {id:"vend_d",label:"自販機・飲料",prefix:"VD",col:"#42a5f5"},
  {id:"vend_f",label:"自販機・食品",prefix:"VF",col:"#ff8a65"},
  {id:"smoke",label:"喫煙所",prefix:"S",col:"#b0bec5"},
];

export const MapEditorView=({mob})=>{
  const leafletReady=useLeaflet();
  const mapRef=useRef(null);
  const mapInst=useRef(null);
  const markersRef=useRef([]);
  const overlayRef=useRef(null);
  const [overlayOp,setOverlayOp]=useState(0.35);

  // 座標編集
  const [editMode,setEditMode]=useState(false);
  const [edits,setEdits]=useState({});
  const [copied,setCopied]=useState(false);

  // 道（パス）
  const [showPaths,setShowPaths]=useState(false);
  const [wpEditMode,setWpEditMode]=useState(false);
  const [wpEdits,setWpEdits]=useState({});
  const [wpCopied,setWpCopied]=useState(false);
  const [newWps,setNewWps]=useState([]);

  // エッジ
  const [edgeEditMode,setEdgeEditMode]=useState(false);
  const [newEdges,setNewEdges]=useState([]);
  const [edgeFrom,setEdgeFrom]=useState(null);
  const [edgeType,setEdgeType]=useState("path");
  const [edgeCopied,setEdgeCopied]=useState(false);
  const [deletedEdges,setDeletedEdges]=useState(new Set());

  // 入口
  const [showEnts,setShowEnts]=useState(false);
  const [entEditMode,setEntEditMode]=useState(false);
  const [newEnts,setNewEnts]=useState([]);
  const [entDragEdits,setEntDragEdits]=useState({});
  const [entCopied,setEntCopied]=useState(false);

  // 範囲（ポリゴン）
  const [areaEditMode,setAreaEditMode]=useState(false);
  const [areaEdits,setAreaEdits]=useState({});
  const [areaCopied,setAreaCopied]=useState(false);
  const [areaSelSpot,setAreaSelSpot]=useState(null);

  // スポット登録
  const [spotRegMode,setSpotRegMode]=useState(false);
  const [spotRegType,setSpotRegType]=useState(null);
  const [spotRegs,setSpotRegs]=useState(()=>{try{return JSON.parse(localStorage.getItem("spotRegs")||"[]")}catch{return []}});
  const [spotRegCopied,setSpotRegCopied]=useState(false);
  const saveSpotRegs=useCallback((regs)=>{setSpotRegs(regs);localStorage.setItem("spotRegs",JSON.stringify(regs));},[]);
  const spotRegTypeRef=useRef(null);
  const spotRegsRef=useRef(spotRegs);
  useEffect(()=>{spotRegTypeRef.current=spotRegType;},[spotRegType]);
  useEffect(()=>{spotRegsRef.current=spotRegs;},[spotRegs]);

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
    return()=>{map.remove();mapInst.current=null;};
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

    if(editMode){
      // ── 座標編集モード ──
      SPOTS.forEach(s=>{
        if(!s.id||s.lat==null)return;
        const pos=edits[s.id]||{lat:s.lat,lng:s.lng};
        const edited=!!edits[s.id];
        const icon=L.divIcon({
          className:"",
          html:`<div style="display:flex;align-items:center;gap:4px;padding:3px 8px 3px 5px;border-radius:8px;background:${edited?"#e8b63a":s.col};box-shadow:0 2px 8px rgba(0,0,0,.5);cursor:grab;white-space:nowrap;font-family:'Inter',sans-serif;transform:translate(-50%,-50%);border:2px solid ${edited?"#fff":"transparent"}">
            <span style="width:16px;height:16px;border-radius:3px;background:rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center;font-size:7px;font-weight:700;color:#fff">${s.short}</span>
            <span style="font-size:10px;font-weight:600;color:#fff">${s.label}</span>
          </div>`,
          iconSize:[0,0],iconAnchor:[0,0],
        });
        const m=L.marker([pos.lat,pos.lng],{icon,draggable:true}).addTo(map);
        m.on("dragend",()=>{
          const ll=m.getLatLng();
          setEdits(prev=>({...prev,[s.id]:{lat:parseFloat(ll.lat.toFixed(5)),lng:parseFloat(ll.lng.toFixed(5))}}));
        });
        markersRef.current.push(m);
      });
      return;
    }

    // ── 範囲編集モード ──
    if(areaEditMode){
      SPOTS.forEach(s=>{
        if(!s.id||s.lat==null)return;
        const verts=areaEdits[s.id]||[];
        const isSel=areaSelSpot===s.id;
        if(verts.length>=3){
          const poly=L.polygon(verts,{
            color:isSel?"#60a0ff":s.col,fillColor:isSel?"#60a0ff":s.col,
            fillOpacity:isSel?0.25:0.12,weight:isSel?2.5:1.5,opacity:isSel?0.9:0.5,
            interactive:true,
          }).addTo(map);
          poly.on("click",(ev)=>{L.DomEvent.stopPropagation(ev);setAreaSelSpot(s.id);});
          markersRef.current.push(poly);
        }else if(verts.length===2){
          const line=L.polyline(verts,{color:isSel?"#60a0ff":s.col,weight:isSel?2.5:1.5,opacity:isSel?0.9:0.5,dashArray:"4,4"}).addTo(map);
          line.on("click",(ev)=>{L.DomEvent.stopPropagation(ev);setAreaSelSpot(s.id);});
          markersRef.current.push(line);
        }else if(verts.length===1){
          const dot=L.circleMarker(verts[0],{radius:4,color:isSel?"#60a0ff":s.col,fillColor:isSel?"#60a0ff":s.col,fillOpacity:0.5,weight:2}).addTo(map);
          dot.on("click",(ev)=>{L.DomEvent.stopPropagation(ev);setAreaSelSpot(s.id);});
          markersRef.current.push(dot);
        }
        const icon=L.divIcon({
          className:"",
          html:`<div style="display:flex;align-items:center;gap:3px;padding:2px 6px;border-radius:6px;background:${isSel?"#60a0ff":s.col};box-shadow:0 1px 4px rgba(0,0,0,.4);cursor:pointer;white-space:nowrap;font-family:'Inter',sans-serif;transform:translate(-50%,-50%);border:${isSel?"2px solid #fff":"1.5px solid transparent"}">
            <span style="font-size:7px;font-weight:700;color:#fff">${s.short}</span>
            <span style="font-size:9px;font-weight:500;color:rgba(255,255,255,.8)">${verts.length}pt</span>
          </div>`,
          iconSize:[0,0],iconAnchor:[0,0],
        });
        const m=L.marker([s.lat,s.lng],{icon}).addTo(map);
        m.on("click",()=>setAreaSelSpot(s.id));
        markersRef.current.push(m);
        if(isSel){
          verts.forEach((v,vi)=>{
            const handleIcon=L.divIcon({
              className:"",
              html:`<div style="width:14px;height:14px;border-radius:50%;background:#fff;border:3px solid #60a0ff;box-shadow:0 2px 8px rgba(0,0,0,.4);cursor:grab;transform:translate(-50%,-50%)"><span style="position:absolute;top:-14px;left:50%;transform:translateX(-50%);font-size:8px;font-weight:700;color:#60a0ff;text-shadow:0 0 3px #000">${vi+1}</span></div>`,
              iconSize:[0,0],iconAnchor:[0,0],
            });
            const handle=L.marker(v,{icon:handleIcon,draggable:true}).addTo(map);
            handle.on("dragend",()=>{
              const ll=handle.getLatLng();
              setAreaEdits(prev=>{
                const nv=[...(prev[s.id]||[])];
                nv[vi]=[parseFloat(ll.lat.toFixed(6)),parseFloat(ll.lng.toFixed(6))];
                return {...prev,[s.id]:nv};
              });
            });
            handle.on("contextmenu",(ev)=>{
              L.DomEvent.stopPropagation(ev);L.DomEvent.preventDefault(ev);
              setAreaEdits(prev=>{
                const nv=[...(prev[s.id]||[])].filter((_,i)=>i!==vi);
                return {...prev,[s.id]:nv};
              });
            });
            markersRef.current.push(handle);
          });
        }
      });
      const onMapClick=(e)=>{
        if(areaSelSpot){
          const lat=parseFloat(e.latlng.lat.toFixed(6));
          const lng=parseFloat(e.latlng.lng.toFixed(6));
          setAreaEdits(prev=>({...prev,[areaSelSpot]:[...(prev[areaSelSpot]||[]),[lat,lng]]}));
        }else{
          setAreaSelSpot(null);
        }
      };
      map.on("click",onMapClick);
      markersRef.current.push({remove:()=>map.off("click",onMapClick)});
      return;
    }

    // ── 通常表示: 全スポットをドットで表示 ──
    SPOTS.forEach(s=>{
      if(!s.id||s.lat==null)return;
      const dot=L.divIcon({
        className:"",
        html:`<div style="width:8px;height:8px;border-radius:50%;background:${s.col}50;border:1.5px solid ${s.col}30;transform:translate(-50%,-50%)"></div>`,
        iconSize:[0,0],iconAnchor:[0,0],
      });
      const m=L.marker([s.lat,s.lng],{icon:dot}).addTo(map);
      m.bindTooltip(s.label,{className:"spot-tip",direction:"top",offset:[0,-4]});
      markersRef.current.push(m);
    });

    // ── 歩道ネットワーク表示 ──
    if(showPaths){
      const nodes={};
      SPOTS.forEach(s=>{
        if(!s.id||s.lat==null)return;
        nodes[s.id]={lat:s.lat,lng:s.lng};
      });
      const wpIdSet=new Set(WAYPOINTS.map(w=>w.id));
      [...WAYPOINTS,...newWps.filter(w=>!wpIdSet.has(w.id))].forEach(w=>{
        const ed=wpEdits[w.id];
        nodes[w.id]=ed||{lat:w.lat,lng:w.lng};
      });
      ENTRANCES.forEach((ent,idx)=>{
        nodes[`ent_${idx}`]={lat:ent.lat,lng:ent.lng};
      });

      const allEdges=[...EDGES,...newEdges];
      allEdges.forEach((e,ei)=>{
        const isExisting=ei<EDGES.length;
        if(isExisting&&deletedEdges.has(ei))return;
        const [a,b]=e;
        const type=e[2]||"path";
        const na=nodes[a],nb=nodes[b];
        if(!na||!nb)return;
        const isStairs=type==="stairs";
        const isNew=!isExisting;
        const line=L.polyline([[na.lat,na.lng],[nb.lat,nb.lng]],{
          color:isStairs?"#e06050":"#f0c040",weight:isNew?3:isStairs?2.5:2,opacity:isNew?0.85:0.5,dashArray:isNew?null:(isStairs?"2,6":"4,4"),
        }).addTo(map);
        if(edgeEditMode){
          if(isNew){
            line.bindTooltip("クリックで削除",{className:"spot-tip",direction:"top"});
            const ri=ei-EDGES.length;
            line.on("click",(ev)=>{L.DomEvent.stopPropagation(ev);setNewEdges(prev=>prev.filter((_,i)=>i!==ri));});
          }else{
            line.setStyle({weight:3,opacity:0.7});
            line.bindTooltip("クリックで削除",{className:"spot-tip",direction:"top"});
            const ci=ei;
            line.on("click",(ev)=>{L.DomEvent.stopPropagation(ev);setDeletedEdges(prev=>{const s=new Set(prev);s.add(ci);return s;});});
          }
        }
        markersRef.current.push(line);
      });

      const wpIds=new Set(WAYPOINTS.map(w=>w.id));
      const allWps=[...WAYPOINTS,...newWps.filter(w=>!wpIds.has(w.id))];
      if(wpEditMode){
        allWps.forEach(w=>{
          const pos=wpEdits[w.id]||{lat:w.lat,lng:w.lng};
          const edited=!!wpEdits[w.id];
          const isNew=!WAYPOINTS.find(x=>x.id===w.id);
          const icon=L.divIcon({
            className:"",
            html:`<div style="width:14px;height:14px;border-radius:50%;background:${edited||isNew?"#f0c040":"#f0c04080"};border:2px solid ${edited||isNew?"#fff":"#f0c04060"};cursor:grab;transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center"><span style="font-size:5px;font-weight:700;color:#000">${w.id.replace("wp_","").slice(0,3)}</span></div>`,
            iconSize:[0,0],iconAnchor:[0,0],
          });
          const m=L.marker([pos.lat,pos.lng],{icon,draggable:true}).addTo(map);
          m.bindTooltip(w.id+(isNew?" (NEW)":""),{className:"spot-tip",direction:"top",offset:[0,-6]});
          m.on("dragend",()=>{
            const ll=m.getLatLng();
            if(isNew){
              setNewWps(prev=>prev.map(x=>x.id===w.id?{...x,lat:parseFloat(ll.lat.toFixed(5)),lng:parseFloat(ll.lng.toFixed(5))}:x));
            }else{
              setWpEdits(prev=>({...prev,[w.id]:{lat:parseFloat(ll.lat.toFixed(5)),lng:parseFloat(ll.lng.toFixed(5))}}));
            }
          });
          markersRef.current.push(m);
        });
        const onClick=(e)=>{
          const id=`wp_${Date.now().toString(36)}`;
          setNewWps(prev=>[...prev,{id,lat:parseFloat(e.latlng.lat.toFixed(5)),lng:parseFloat(e.latlng.lng.toFixed(5))}]);
        };
        map.on("click",onClick);
        markersRef.current.push({remove:()=>map.off("click",onClick)});
      }else if(edgeEditMode){
        const edgeClick=(nodeId)=>{
          if(!edgeFrom){setEdgeFrom(nodeId);return;}
          if(edgeFrom===nodeId){setEdgeFrom(null);return;}
          const dup=[...EDGES.filter((_,i)=>!deletedEdges.has(i)),...newEdges].some(e=>(e[0]===edgeFrom&&e[1]===nodeId)||(e[0]===nodeId&&e[1]===edgeFrom));
          if(!dup){
            setNewEdges(prev=>[...prev,edgeType==="stairs"?[edgeFrom,nodeId,"stairs"]:[edgeFrom,nodeId]]);
          }
          setEdgeFrom(null);
        };
        allWps.forEach(w=>{
          const pos=wpEdits[w.id]||{lat:w.lat,lng:w.lng};
          const isSel=edgeFrom===w.id;
          const icon=L.divIcon({
            className:"",
            html:`<div style="width:${isSel?16:10}px;height:${isSel?16:10}px;border-radius:50%;background:${isSel?"#ff6060":"#f0c040"};border:2px solid ${isSel?"#fff":"#f0c04060"};cursor:pointer;transform:translate(-50%,-50%);${isSel?"box-shadow:0 0 12px #ff6060;":""}transition:all .15s"></div>`,
            iconSize:[0,0],iconAnchor:[0,0],
          });
          const m=L.marker([pos.lat,pos.lng],{icon}).addTo(map);
          m.bindTooltip(w.id,{className:"spot-tip",direction:"top",offset:[0,-4]});
          m.on("click",(ev)=>{L.DomEvent.stopPropagation(ev);edgeClick(w.id);});
          markersRef.current.push(m);
        });
        SPOTS.forEach(s=>{
          if(!s.id||s.lat==null)return;
          const isSel=edgeFrom===s.id;
          const icon=L.divIcon({
            className:"",
            html:`<div style="width:${isSel?16:10}px;height:${isSel?16:10}px;border-radius:50%;background:${isSel?"#ff6060":s.col};border:2px solid ${isSel?"#fff":"#fff4"};cursor:pointer;transform:translate(-50%,-50%);${isSel?"box-shadow:0 0 12px #ff6060;":""}transition:all .15s"></div>`,
            iconSize:[0,0],iconAnchor:[0,0],
          });
          const m=L.marker([s.lat,s.lng],{icon}).addTo(map);
          m.bindTooltip(s.label,{className:"spot-tip",direction:"top",offset:[0,-4]});
          m.on("click",(ev)=>{L.DomEvent.stopPropagation(ev);edgeClick(s.id);});
          markersRef.current.push(m);
        });
        ENTRANCES.forEach((ent,idx)=>{
          const nodeId=`ent_${idx}`;
          const s=SPOTS.find(x=>x.id===ent.spot);
          const isSel=edgeFrom===nodeId;
          const icon=L.divIcon({
            className:"",
            html:`<div style="width:${isSel?16:9}px;height:${isSel?16:9}px;border-radius:50%;background:${isSel?"#ff6060":"#4de8b0"};border:2px solid ${isSel?"#fff":"#fff6"};cursor:pointer;transform:translate(-50%,-50%);${isSel?"box-shadow:0 0 12px #ff6060;":""}transition:all .15s"></div>`,
            iconSize:[0,0],iconAnchor:[0,0],
          });
          const m=L.marker([ent.lat,ent.lng],{icon}).addTo(map);
          m.bindTooltip(`${s?.short||"?"} 入口 (${nodeId})`,{className:"spot-tip",direction:"top",offset:[0,-4]});
          m.on("click",(ev)=>{L.DomEvent.stopPropagation(ev);edgeClick(nodeId);});
          markersRef.current.push(m);
        });
        if(edgeFrom&&nodes[edgeFrom]){
          const fn=nodes[edgeFrom];
          const guide=L.polyline([[fn.lat,fn.lng],[fn.lat,fn.lng]],{color:"#ff6060",weight:2,opacity:0.6,dashArray:"4,6"}).addTo(map);
          const onMove=(ev)=>{guide.setLatLngs([[fn.lat,fn.lng],[ev.latlng.lat,ev.latlng.lng]]);};
          map.on("mousemove",onMove);
          markersRef.current.push(guide);
          markersRef.current.push({remove:()=>map.off("mousemove",onMove)});
        }
      }else{
        allWps.forEach(w=>{
          const pos=wpEdits[w.id]||{lat:w.lat,lng:w.lng};
          const dot=L.divIcon({
            className:"",
            html:`<div style="width:6px;height:6px;border-radius:50%;background:#f0c04080;transform:translate(-50%,-50%)"></div>`,
            iconSize:[0,0],iconAnchor:[0,0],
          });
          const m=L.marker([pos.lat,pos.lng],{icon:dot}).addTo(map);
          m.bindTooltip(w.id,{className:"spot-tip",direction:"top",offset:[0,-4]});
          markersRef.current.push(m);
        });
      }
    }

    // ── 入口表示 ──
    if(showEnts){
      const allEnts=[...ENTRANCES,...newEnts];
      allEnts.forEach((ent,idx)=>{
        const s=SPOTS.find(x=>x.id===ent.spot);
        if(!s||s.lat==null)return;
        const pos=entDragEdits[idx]||{lat:ent.lat,lng:ent.lng};
        const conn=L.polyline([[s.lat,s.lng],[pos.lat,pos.lng]],{
          color:s.col,weight:1.5,opacity:0.6,
        }).addTo(map);
        markersRef.current.push(conn);
        if(entEditMode){
          const edited=!!entDragEdits[idx];
          const icon=L.divIcon({
            className:"",
            html:`<div style="width:12px;height:12px;border-radius:50%;background:${edited?"#4de8b0":s.col};border:2px solid ${edited?"#fff":"#fff8"};cursor:grab;transform:translate(-50%,-50%);box-shadow:0 0 6px ${edited?"#4de8b0":s.col}80"></div>`,
            iconSize:[0,0],iconAnchor:[0,0],
          });
          const m=L.marker([pos.lat,pos.lng],{icon,draggable:true}).addTo(map);
          m.bindTooltip(`${s.short} 入口`,{className:"spot-tip",direction:"top",offset:[0,-6]});
          const ci=idx;
          m.on("dragend",()=>{
            const ll=m.getLatLng();
            setEntDragEdits(prev=>({...prev,[ci]:{lat:parseFloat(ll.lat.toFixed(5)),lng:parseFloat(ll.lng.toFixed(5))}}));
          });
          markersRef.current.push(m);
        }else{
          const dot=L.divIcon({
            className:"",
            html:`<div style="width:7px;height:7px;border-radius:50%;background:${s.col};border:1.5px solid #fff6;transform:translate(-50%,-50%)"></div>`,
            iconSize:[0,0],iconAnchor:[0,0],
          });
          const m=L.marker([pos.lat,pos.lng],{icon:dot}).addTo(map);
          m.bindTooltip(`${s.short} 入口`,{className:"spot-tip",direction:"top",offset:[0,-4]});
          markersRef.current.push(m);
        }
      });
      if(entEditMode){
        const onClick=(e)=>{
          let closest=null,minD=Infinity;
          SPOTS.forEach(s=>{
            if(!s.id||s.lat==null)return;
            const d=Math.sqrt((e.latlng.lat-s.lat)**2+(e.latlng.lng-s.lng)**2);
            if(d<minD){minD=d;closest=s;}
          });
          if(closest&&minD<0.002){
            setNewEnts(prev=>[...prev,{spot:closest.id,lat:parseFloat(e.latlng.lat.toFixed(5)),lng:parseFloat(e.latlng.lng.toFixed(5))}]);
          }
        };
        map.on("click",onClick);
        markersRef.current.push({remove:()=>map.off("click",onClick)});
      }
    }

    // 仮登録スポットのマーカー
    spotRegs.forEach((r,i)=>{
      const t=SPOT_TYPES.find(x=>x.id===r.type);
      const dot=L.divIcon({
        className:"",
        html:`<div style="width:18px;height:18px;border-radius:50%;background:${t?.col||"#888"};border:2px solid #fff;display:flex;align-items:center;justify-content:center;transform:translate(-50%,-50%);font-size:7px;font-weight:700;color:#fff;cursor:grab">${t?.prefix||"?"}${i+1}</div>`,
        iconSize:[0,0],iconAnchor:[0,0],
      });
      const m=L.marker([r.lat,r.lng],{icon:dot,draggable:true}).addTo(map);
      m.bindTooltip(`${r.memo||t?.label||""}`,{className:"spot-tip",direction:"top",offset:[0,-10]});
      m.on("dragend",()=>{
        const pos=m.getLatLng();
        const updated=[...spotRegsRef.current];
        updated[i]={...updated[i],lat:parseFloat(pos.lat.toFixed(5)),lng:parseFloat(pos.lng.toFixed(5))};
        saveSpotRegs(updated);
      });
      markersRef.current.push(m);
    });

    // スポット登録モード: マップクリックで登録
    if(spotRegMode){
      const onSpotClick=(e)=>{
        const typeId=spotRegTypeRef.current;
        if(!typeId)return;
        const t=SPOT_TYPES.find(x=>x.id===typeId);
        const memo=prompt(`${t.label}のメモ（場所の説明）`,"");
        if(memo===null)return;
        const reg={type:typeId,lat:parseFloat(e.latlng.lat.toFixed(5)),lng:parseFloat(e.latlng.lng.toFixed(5)),memo:memo||t.label,ts:Date.now()};
        saveSpotRegs([...spotRegsRef.current,reg]);
      };
      map.on("click",onSpotClick);
      markersRef.current.push({remove:()=>map.off("click",onSpotClick)});
    }
  },[leafletReady,editMode,edits,showPaths,wpEditMode,wpEdits,newWps,edgeEditMode,edgeFrom,newEdges,edgeType,deletedEdges,showEnts,entEditMode,newEnts,entDragEdits,areaEditMode,areaSelSpot,areaEdits,spotRegMode,spotRegType,spotRegs]);

  // コピー関数群
  const copyEdits=()=>{
    const lines=Object.entries(edits).map(([id,pos])=>{
      const s=SPOTS.find(x=>x.id===id);
      return `  { id: "${id}", label: "${s?.label}", lat: ${pos.lat}, lng: ${pos.lng} },`;
    }).join("\n");
    navigator.clipboard.writeText(lines);
    setCopied(true);setTimeout(()=>setCopied(false),2000);
  };
  const copyWpEdits=()=>{
    const cpIds=new Set(WAYPOINTS.map(w=>w.id));
    const allWps=[...WAYPOINTS,...newWps.filter(w=>!cpIds.has(w.id))];
    const lines=allWps.map(w=>{
      const pos=wpEdits[w.id]||{lat:w.lat,lng:w.lng};
      return `  { id: "${w.id}", lat: ${pos.lat}, lng: ${pos.lng} },`;
    }).join("\n");
    navigator.clipboard.writeText(lines);
    setWpCopied(true);setTimeout(()=>setWpCopied(false),2000);
  };
  const copyEdgeEdits=()=>{
    const remaining=EDGES.filter((_,i)=>!deletedEdges.has(i));
    const allEdges=[...remaining,...newEdges];
    const lines=allEdges.map(e=>{
      const type=e[2];
      return type?`  ["${e[0]}", "${e[1]}", "${type}"],`:`  ["${e[0]}", "${e[1]}"],`;
    }).join("\n");
    navigator.clipboard.writeText(lines);
    setEdgeCopied(true);setTimeout(()=>setEdgeCopied(false),2000);
  };
  const copyAreaEdits=()=>{
    const entries=Object.entries(areaEdits).filter(([,v])=>v.length>0).map(([id,verts])=>{
      const pts=verts.map(v=>`[${v[0]},${v[1]}]`).join(",");
      return `  "${id}": [${pts}],`;
    }).join("\n");
    navigator.clipboard.writeText(`{\n${entries}\n}`);
    setAreaCopied(true);setTimeout(()=>setAreaCopied(false),2000);
  };
  const copyEntEdits=()=>{
    const allEnts=[...ENTRANCES,...newEnts];
    const lines=allEnts.map((ent,idx)=>{
      const pos=entDragEdits[idx]||{lat:ent.lat,lng:ent.lng};
      return `  { spot: "${ent.spot}", lat: ${pos.lat}, lng: ${pos.lng} },`;
    }).join("\n");
    navigator.clipboard.writeText(lines);
    setEntCopied(true);setTimeout(()=>setEntCopied(false),2000);
  };

  if(!leafletReady)return <Loader msg="地図を読み込み中" size="sm"/>;

  const editCount=Object.keys(edits).length;
  const existingIds=new Set(WAYPOINTS.map(w=>w.id));
  const allWpsForPanel=[...WAYPOINTS,...newWps.filter(w=>!existingIds.has(w.id))];
  const wpEditCount=Object.keys(wpEdits).length+newWps.length;
  const allEntsForPanel=[...ENTRANCES,...newEnts];
  const entEditCount=allEntsForPanel.length;

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
      `}</style>
      <div style={{flex:1,minHeight:mob?300:400,overflow:"hidden",position:"relative"}}>
        <div ref={mapRef} style={{width:"100%",height:"100%"}}/>
      </div>

      {/* 地図オーバーレイ透明度スライダー */}
      <div style={{position:"absolute",bottom:30,left:10,zIndex:1000,display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:8,background:`${T.bg2}d0`,backdropFilter:"blur(8px)",border:`1px solid ${T.bd}`}}>
        <span style={{fontSize:9,fontWeight:600,color:T.txD,whiteSpace:"nowrap"}}>地図</span>
        <input type="range" min="0" max="100" value={Math.round(overlayOp*100)} onChange={e=>setOverlayOp(e.target.value/100)} style={{width:80,height:3,accentColor:"#f0c040",cursor:"pointer"}}/>
        <span style={{fontSize:9,color:T.txD,fontFamily:"monospace",minWidth:28}}>{Math.round(overlayOp*100)}%</span>
      </div>

      {/* 編集モードトグル */}
      <div style={{position:"absolute",top:10,right:10,zIndex:1000,display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end",maxWidth:mob?280:400}}>
        <button onClick={()=>{setShowPaths(e=>!e);if(showPaths){setWpEditMode(false);setEdgeEditMode(false);setEdgeFrom(null);}}} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:8,background:showPaths?"#f0c040":`${T.bg2}e0`,backdropFilter:"blur(8px)",border:`1px solid ${showPaths?"#f0c040":T.bd}`,cursor:"pointer",transition:"all .15s"}}>
          <span style={{fontSize:11,fontWeight:600,color:showPaths?"#000":T.txH}}>{showPaths?"道 ON":"道"}</span>
        </button>
        {showPaths&&<button onClick={()=>{setWpEditMode(e=>!e);if(!wpEditMode)setEdgeEditMode(false);}} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:8,background:wpEditMode?"#f0c040":`${T.bg2}e0`,backdropFilter:"blur(8px)",border:`1px solid ${wpEditMode?"#f0c040":T.bd}`,cursor:"pointer",transition:"all .15s"}}>
          <span style={{fontSize:11,fontWeight:600,color:wpEditMode?"#000":T.txH}}>{wpEditMode?"WP編集中":"WP編集"}</span>
        </button>}
        {showPaths&&<button onClick={()=>{setEdgeEditMode(e=>!e);if(!edgeEditMode){setWpEditMode(false);setEdgeFrom(null);}}} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:8,background:edgeEditMode?"#ff8040":`${T.bg2}e0`,backdropFilter:"blur(8px)",border:`1px solid ${edgeEditMode?"#ff8040":T.bd}`,cursor:"pointer",transition:"all .15s"}}>
          <span style={{fontSize:11,fontWeight:600,color:edgeEditMode?"#000":T.txH}}>{edgeEditMode?"Edge編集中":"Edge編集"}</span>
        </button>}
        <button onClick={()=>{setShowEnts(e=>!e);if(showEnts)setEntEditMode(false);}} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:8,background:showEnts?"#4de8b0":`${T.bg2}e0`,backdropFilter:"blur(8px)",border:`1px solid ${showEnts?"#4de8b0":T.bd}`,cursor:"pointer",transition:"all .15s"}}>
          <span style={{fontSize:11,fontWeight:600,color:showEnts?"#000":T.txH}}>{showEnts?"入口 ON":"入口"}</span>
        </button>
        {showEnts&&<button onClick={()=>setEntEditMode(e=>!e)} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:8,background:entEditMode?"#4de8b0":`${T.bg2}e0`,backdropFilter:"blur(8px)",border:`1px solid ${entEditMode?"#4de8b0":T.bd}`,cursor:"pointer",transition:"all .15s"}}>
          <span style={{fontSize:11,fontWeight:600,color:entEditMode?"#000":T.txH}}>{entEditMode?"入口編集中":"入口編集"}</span>
        </button>}
        <button onClick={()=>{setAreaEditMode(e=>!e);if(areaEditMode)setAreaSelSpot(null);}} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:8,background:areaEditMode?"#60a0ff":`${T.bg2}e0`,backdropFilter:"blur(8px)",border:`1px solid ${areaEditMode?"#60a0ff":T.bd}`,cursor:"pointer",transition:"all .15s"}}>
          <span style={{fontSize:11,fontWeight:600,color:areaEditMode?"#fff":T.txH}}>{areaEditMode?"範囲編集中":"範囲"}</span>
        </button>
        <button onClick={()=>{setEditMode(e=>!e);}} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:8,background:editMode?"#e8b63a":`${T.bg2}e0`,backdropFilter:"blur(8px)",border:`1px solid ${editMode?"#e8b63a":T.bd}`,cursor:"pointer",transition:"all .15s"}}>
          <span style={{fontSize:11,fontWeight:600,color:editMode?"#000":T.txH}}>{editMode?"編集中":"座標を編集"}</span>
        </button>
        <button onClick={()=>{setSpotRegMode(e=>!e);setSpotRegType(null);}} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:8,background:spotRegMode?"#8bc34a":`${T.bg2}e0`,backdropFilter:"blur(8px)",border:`1px solid ${spotRegMode?"#8bc34a":T.bd}`,cursor:"pointer",transition:"all .15s"}}>
          <span style={{fontSize:11,fontWeight:600,color:spotRegMode?"#000":T.txH}}>{spotRegMode?`登録中(${spotRegs.length})`:"スポット登録"}</span>
        </button>
      </div>

      {/* スポット仮登録パネル */}
      {spotRegMode&&<div style={{position:"absolute",bottom:50,left:10,right:10,zIndex:1000,borderRadius:12,background:`${T.bg2}f0`,backdropFilter:"blur(8px)",border:`1px solid #8bc34a`,boxShadow:"0 4px 16px rgba(0,0,0,.4)",padding:12}}>
        <div style={{fontSize:11,fontWeight:700,color:"#8bc34a",marginBottom:8}}>屋外スポット仮登録</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
          {SPOT_TYPES.map(t=>{
            const active=spotRegType===t.id;
            return <button key={t.id} onClick={()=>setSpotRegType(active?null:t.id)} style={{display:"flex",alignItems:"center",gap:5,padding:"7px 12px",borderRadius:8,border:`1.5px solid ${t.col}`,background:active?t.col:`${t.col}18`,cursor:"pointer"}}>
              <div style={{width:14,height:14,borderRadius:"50%",background:active?"#fff":t.col}}/>
              <span style={{fontSize:11,fontWeight:600,color:active?"#fff":t.col}}>{t.label}</span>
            </button>;
          })}
        </div>
        {spotRegType&&<div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",marginBottom:8,borderRadius:8,background:`#8bc34a15`}}>
          <span style={{fontSize:11,color:"#8bc34a",fontWeight:500}}>マップをクリックしてスポットを配置</span>
        </div>}
        {spotRegs.length>0&&<>
          <div style={{maxHeight:120,overflowY:"auto",marginBottom:8}}>
            {spotRegs.map((r,i)=>{
              const t=SPOT_TYPES.find(x=>x.id===r.type);
              return <div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 0",borderBottom:`1px solid ${T.bd}`}}>
                <div style={{width:14,height:14,borderRadius:"50%",background:t?.col||"#888",flexShrink:0}}/>
                <span style={{fontSize:11,color:T.txH,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.memo}</span>
                <span style={{fontSize:9,color:T.txD,flexShrink:0}}>{r.lat},{r.lng}</span>
                <button onClick={()=>saveSpotRegs(spotRegs.filter((_,j)=>j!==i))} style={{background:"none",border:"none",cursor:"pointer",color:T.red,fontSize:12,padding:"0 2px"}}>x</button>
              </div>;
            })}
          </div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>{
              const lines=spotRegs.map((r,i)=>{
                const t=SPOT_TYPES.find(x=>x.id===r.type);
                const n=spotRegs.slice(0,i+1).filter(x=>x.type===r.type).length;
                return `  { id: "${r.type}_${n}", label: "${t?.label||r.type}（${r.memo}）", short: "${t?.prefix||"?"}${n}", col: "${t?.col||"#888"}", cat: "outdoor", lat: ${r.lat}, lng: ${r.lng} },`;
              }).join("\n");
              navigator.clipboard.writeText(lines);
              setSpotRegCopied(true);setTimeout(()=>setSpotRegCopied(false),2000);
            }} style={{flex:1,padding:"7px 0",borderRadius:8,border:`1px solid #8bc34a`,background:"#8bc34a20",cursor:"pointer",fontSize:11,fontWeight:600,color:"#8bc34a"}}>{spotRegCopied?"Copied!":"コードをコピー"}</button>
            <button onClick={()=>{if(confirm("全て削除しますか？"))saveSpotRegs([]);}} style={{padding:"7px 12px",borderRadius:8,border:`1px solid ${T.red}`,background:`${T.red}10`,cursor:"pointer",fontSize:11,fontWeight:600,color:T.red}}>全削除</button>
          </div>
        </>}
      </div>}

      {/* 入口編集パネル */}
      {entEditMode&&entEditCount>0&&<div style={{position:"absolute",top:46,right:10,zIndex:1000,width:mob?220:260,borderRadius:10,background:`${T.bg2}f0`,backdropFilter:"blur(8px)",border:`1px solid #4de8b0`,boxShadow:"0 4px 16px rgba(0,0,0,.4)",padding:10,maxHeight:300,overflowY:"auto"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#4de8b0",marginBottom:6}}>入口 {entEditCount}件{newEnts.length>0&&` (新規${newEnts.length})`}</div>
        {allEntsForPanel.map((ent,idx)=>{
          const s=SPOTS.find(x=>x.id===ent.spot);
          const pos=entDragEdits[idx]||{lat:ent.lat,lng:ent.lng};
          const isNew=idx>=ENTRANCES.length;
          return <div key={idx} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 0",borderBottom:`1px solid ${T.bd}`}}>
            <div style={{width:16,height:16,borderRadius:3,background:s?.col||"#888",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:6,fontWeight:700,color:"#fff"}}>{s?.short}</span></div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:10,fontWeight:600,color:T.txH}}>{s?.label}{isNew&&<span style={{color:"#4de8b0",marginLeft:4}}>NEW</span>}</div>
              <div style={{fontSize:9,color:T.txD,fontFamily:"monospace"}}>{pos.lat}, {pos.lng}</div>
            </div>
          </div>;
        })}
        <button onClick={copyEntEdits} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4,width:"100%",padding:"7px",borderRadius:7,border:"none",background:entCopied?"#4db88a":"#4de8b0",cursor:"pointer",marginTop:8,transition:"background .15s"}}>
          <span style={{fontSize:11,fontWeight:700,color:"#000"}}>{entCopied?"コピーしました":"入口座標をコピー"}</span>
        </button>
        <button onClick={()=>{setNewEnts([]);setEntDragEdits({});}} style={{display:"flex",alignItems:"center",justifyContent:"center",width:"100%",padding:"5px",borderRadius:7,border:`1px solid ${T.bd}`,background:"transparent",cursor:"pointer",marginTop:4}}>
          <span style={{fontSize:10,fontWeight:500,color:T.txD}}>リセット</span>
        </button>
      </div>}

      {/* 範囲編集パネル */}
      {areaEditMode&&<div style={{position:"absolute",top:46,right:10,zIndex:1000,width:mob?220:270,borderRadius:10,background:`${T.bg2}f0`,backdropFilter:"blur(8px)",border:`1px solid #60a0ff`,boxShadow:"0 4px 16px rgba(0,0,0,.4)",padding:10,maxHeight:380,display:"flex",flexDirection:"column"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#60a0ff",marginBottom:6}}>建物範囲（ポリゴン）{areaSelSpot?` — ${SPOTS.find(s=>s.id===areaSelSpot)?.label||areaSelSpot}`:""}</div>
        {areaSelSpot&&<div style={{marginBottom:8,padding:"6px 8px",borderRadius:8,background:"#60a0ff10",border:"1px solid #60a0ff30"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
            <span style={{fontSize:10,fontWeight:600,color:"#60a0ff"}}>{(areaEdits[areaSelSpot]||[]).length}頂点</span>
            <div style={{display:"flex",gap:4}}>
              {(areaEdits[areaSelSpot]||[]).length>0&&<button onClick={()=>setAreaEdits(prev=>{const nv=[...(prev[areaSelSpot]||[])];nv.pop();return{...prev,[areaSelSpot]:nv};})} style={{fontSize:9,fontWeight:600,color:"#ff6060",background:"#ff606014",border:"1px solid #ff606030",borderRadius:5,padding:"2px 6px",cursor:"pointer"}}>末尾削除</button>}
              {(areaEdits[areaSelSpot]||[]).length>0&&<button onClick={()=>setAreaEdits(prev=>({...prev,[areaSelSpot]:[]})) } style={{fontSize:9,fontWeight:600,color:"#ff6060",background:"#ff606014",border:"1px solid #ff606030",borderRadius:5,padding:"2px 6px",cursor:"pointer"}}>全削除</button>}
            </div>
          </div>
          <div style={{fontSize:9,color:T.txD,lineHeight:1.4}}>マップクリックで頂点追加。ドラッグで移動。右クリックで削除。</div>
        </div>}
        <div style={{flex:1,overflowY:"auto",maxHeight:200}}>
          {SPOTS.filter(s=>s.id&&s.lat!=null).map(s=>{
            const verts=areaEdits[s.id]||[];
            const isSel=areaSelSpot===s.id;
            return <div key={s.id} onClick={()=>setAreaSelSpot(s.id)} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 6px",borderRadius:6,borderBottom:`1px solid ${T.bd}`,cursor:"pointer",background:isSel?"#60a0ff14":"transparent",transition:"background .1s"}}>
              <div style={{width:14,height:14,borderRadius:3,background:s.col,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:5,fontWeight:700,color:"#fff"}}>{s.short}</span></div>
              <div style={{flex:1,fontSize:10,fontWeight:isSel?700:500,color:isSel?"#60a0ff":T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.label}</div>
              <span style={{fontSize:9,fontWeight:600,color:verts.length>0?"#60a0ff":T.txD,fontFamily:"monospace"}}>{verts.length}pt</span>
            </div>;
          })}
        </div>
        {Object.values(areaEdits).some(v=>v.length>0)&&<button onClick={copyAreaEdits} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4,width:"100%",padding:"7px",borderRadius:7,border:"none",background:areaCopied?"#4db88a":"#60a0ff",cursor:"pointer",marginTop:8,transition:"background .15s"}}>
          <span style={{fontSize:11,fontWeight:700,color:"#fff"}}>{areaCopied?"コピーしました":"ポリゴンデータをコピー"}</span>
        </button>}
        <button onClick={()=>{setAreaEdits({});setAreaSelSpot(null);}} style={{display:"flex",alignItems:"center",justifyContent:"center",width:"100%",padding:"5px",borderRadius:7,border:`1px solid ${T.bd}`,background:"transparent",cursor:"pointer",marginTop:4}}>
          <span style={{fontSize:10,fontWeight:500,color:T.txD}}>リセット</span>
        </button>
      </div>}

      {/* Edge編集パネル */}
      {edgeEditMode&&<div style={{position:"absolute",top:46,right:10,zIndex:1000,width:mob?220:280,borderRadius:10,background:`${T.bg2}f0`,backdropFilter:"blur(8px)",border:`1px solid #ff8040`,boxShadow:"0 4px 16px rgba(0,0,0,.4)",padding:10,maxHeight:340,display:"flex",flexDirection:"column"}}>
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
        {newEdges.length>0&&<div style={{overflowY:"auto",marginBottom:4,maxHeight:100}}>
          <div style={{fontSize:9,fontWeight:600,color:"#f0c040",marginBottom:2}}>追加 ({newEdges.length})</div>
          {newEdges.map((e,i)=>{
            const nameA=(SPOTS.find(s=>s.id===e[0])?.short)||e[0].replace("wp_","").slice(0,6);
            const nameB=(SPOTS.find(s=>s.id===e[1])?.short)||e[1].replace("wp_","").slice(0,6);
            const isStairs=e[2]==="stairs";
            return <div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"3px 0",borderBottom:`1px solid ${T.bd}`}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:isStairs?"#e06050":"#f0c040",flexShrink:0}}/>
              <div style={{flex:1,fontSize:10,fontWeight:500,color:T.txH,fontFamily:"monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{nameA} → {nameB}{isStairs?" (階段)":""}</div>
              <button onClick={()=>setNewEdges(prev=>prev.filter((_,j)=>j!==i))} style={{background:"none",border:"none",cursor:"pointer",color:T.txD,fontSize:12,padding:"0 2px",display:"flex"}}>×</button>
            </div>;
          })}
        </div>}
        {deletedEdges.size>0&&<div style={{overflowY:"auto",marginBottom:4,maxHeight:100}}>
          <div style={{fontSize:9,fontWeight:600,color:"#e06050",marginBottom:2}}>削除 ({deletedEdges.size})</div>
          {[...deletedEdges].map(idx=>{
            const e=EDGES[idx];
            if(!e)return null;
            const nameA=(SPOTS.find(s=>s.id===e[0])?.short)||e[0].replace("wp_","").slice(0,6);
            const nameB=(SPOTS.find(s=>s.id===e[1])?.short)||e[1].replace("wp_","").slice(0,6);
            const isStairs=e[2]==="stairs";
            return <div key={idx} style={{display:"flex",alignItems:"center",gap:6,padding:"3px 0",borderBottom:`1px solid ${T.bd}`,opacity:0.7}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:"#e06050",flexShrink:0}}/>
              <div style={{flex:1,fontSize:10,fontWeight:500,color:T.txD,fontFamily:"monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:"line-through"}}>{nameA} → {nameB}{isStairs?" (階段)":""}</div>
              <button onClick={()=>setDeletedEdges(prev=>{const s=new Set(prev);s.delete(idx);return s;})} style={{background:"none",border:"none",cursor:"pointer",color:"#4de8b0",fontSize:10,padding:"0 4px",display:"flex",fontWeight:700}}>↩</button>
            </div>;
          })}
        </div>}
        {(EDGES.length+newEdges.length)>0&&<button onClick={copyEdgeEdits} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4,width:"100%",padding:"7px",borderRadius:7,border:"none",background:edgeCopied?"#4db88a":"#ff8040",cursor:"pointer",transition:"background .15s"}}>
          <span style={{fontSize:11,fontWeight:700,color:"#fff"}}>{edgeCopied?"コピーしました":"Edge配列をコピー"}</span>
        </button>}
        <button onClick={()=>{setNewEdges([]);setEdgeFrom(null);setDeletedEdges(new Set());}} style={{display:"flex",alignItems:"center",justifyContent:"center",width:"100%",padding:"5px",borderRadius:7,border:`1px solid ${T.bd}`,background:"transparent",cursor:"pointer",marginTop:4}}>
          <span style={{fontSize:10,fontWeight:500,color:T.txD}}>リセット</span>
        </button>
        <div style={{fontSize:9,color:T.txD,marginTop:6,lineHeight:1.4}}>ノード2つクリックで接続。エッジをクリックで削除。</div>
      </div>}

      {/* WP編集パネル */}
      {wpEditMode&&wpEditCount>0&&<div style={{position:"absolute",top:46,right:10,zIndex:1000,width:mob?220:260,borderRadius:10,background:`${T.bg2}f0`,backdropFilter:"blur(8px)",border:`1px solid #f0c040`,boxShadow:"0 4px 16px rgba(0,0,0,.4)",padding:10,maxHeight:300,overflowY:"auto"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#f0c040",marginBottom:6}}>WP {allWpsForPanel.length}件{newWps.length>0&&` (新規${newWps.length})`}</div>
        {allWpsForPanel.map(w=>{
          const pos=wpEdits[w.id]||{lat:w.lat,lng:w.lng};
          const isNew=!WAYPOINTS.find(x=>x.id===w.id);
          return <div key={w.id} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 0",borderBottom:`1px solid ${T.bd}`}}>
            <div style={{width:16,height:16,borderRadius:"50%",background:"#f0c040",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:6,fontWeight:700,color:"#000"}}>{w.id.replace("wp_","").slice(0,2)}</span></div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:10,fontWeight:600,color:T.txH}}>{w.id}{isNew&&<span style={{color:"#f0c040",marginLeft:4}}>NEW</span>}</div>
              <div style={{fontSize:9,color:T.txD,fontFamily:"monospace"}}>{pos.lat}, {pos.lng}</div>
            </div>
          </div>;
        })}
        <button onClick={copyWpEdits} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4,width:"100%",padding:"7px",borderRadius:7,border:"none",background:wpCopied?"#4db88a":"#f0c040",cursor:"pointer",marginTop:8,transition:"background .15s"}}>
          <span style={{fontSize:11,fontWeight:700,color:"#000"}}>{wpCopied?"コピーしました":"WP座標をコピー"}</span>
        </button>
        <button onClick={()=>{setNewWps([]);setWpEdits({});}} style={{display:"flex",alignItems:"center",justifyContent:"center",width:"100%",padding:"5px",borderRadius:7,border:`1px solid ${T.bd}`,background:"transparent",cursor:"pointer",marginTop:4}}>
          <span style={{fontSize:10,fontWeight:500,color:T.txD}}>リセット</span>
        </button>
      </div>}

      {/* 座標編集パネル */}
      {editMode&&editCount>0&&<div style={{position:"absolute",top:46,right:10,zIndex:1000,width:mob?220:260,borderRadius:10,background:`${T.bg2}f0`,backdropFilter:"blur(8px)",border:`1px solid ${T.bdL}`,boxShadow:"0 4px 16px rgba(0,0,0,.4)",padding:10,maxHeight:300,overflowY:"auto"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#e8b63a",marginBottom:6}}>{editCount}件の変更</div>
        {Object.entries(edits).map(([id,pos])=>{
          const s=SPOTS.find(x=>x.id===id);
          return <div key={id} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 0",borderBottom:`1px solid ${T.bd}`}}>
            <div style={{width:16,height:16,borderRadius:3,background:s?.col||"#888",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:6,fontWeight:700,color:"#fff"}}>{s?.short}</span></div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:10,fontWeight:600,color:T.txH}}>{s?.label}</div>
              <div style={{fontSize:9,color:T.txD,fontFamily:"monospace"}}>{pos.lat}, {pos.lng}</div>
            </div>
          </div>;
        })}
        <button onClick={copyEdits} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4,width:"100%",padding:"7px",borderRadius:7,border:"none",background:copied?"#4db88a":"#e8b63a",cursor:"pointer",marginTop:8,transition:"background .15s"}}>
          <span style={{fontSize:11,fontWeight:700,color:"#000"}}>{copied?"コピーしました":"座標をコピー"}</span>
        </button>
        <button onClick={()=>setEdits({})} style={{display:"flex",alignItems:"center",justifyContent:"center",width:"100%",padding:"5px",borderRadius:7,border:`1px solid ${T.bd}`,background:"transparent",cursor:"pointer",marginTop:4}}>
          <span style={{fontSize:10,fontWeight:500,color:T.txD}}>リセット</span>
        </button>
      </div>}
    </div>
  );
};