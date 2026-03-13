import { useState, useEffect, useRef, useCallback } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { Av, useLeaflet, Loader } from "../shared.jsx";
import { useLocationSharing, SPOTS, SPOT_CATS, getSpot, CAMPUS_CENTER, CAMPUS_ZOOM, WAYPOINTS, EDGES, ENTRANCES, AREAS } from "../hooks/useLocationSharing.js";

const NON_GEO=new Set(["suzu","home_loc","commute","off_campus","road"]);

/* ── GPS → 最寄りスポット検索（ポリゴン→入口→中心点） ── */
const haversine=(lat1,lng1,lat2,lng2)=>{
  const R=6371e3,toRad=d=>d*Math.PI/180;
  const dLat=toRad(lat2-lat1),dLng=toRad(lng2-lng1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
};
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
  const overlayRef=useRef(null);
  const [overlayOp,setOverlayOp]=useState(0.35);
  const [selSpot,setSelSpot]=useState(null);
  const [editMode,setEditMode]=useState(false);
  const [edits,setEdits]=useState({});
  const [copied,setCopied]=useState(false);
  const [showPaths,setShowPaths]=useState(false);
  const [wpEditMode,setWpEditMode]=useState(false);
  const [wpEdits,setWpEdits]=useState({});
  const [wpCopied,setWpCopied]=useState(false);
  const [newWps,setNewWps]=useState([]); // クリックで追加した新規WP [{id,lat,lng}, ...]
  // エッジ（道）編集
  const [edgeEditMode,setEdgeEditMode]=useState(false);
  const [newEdges,setNewEdges]=useState([]); // [[nodeA,nodeB], [nodeA,nodeB,"stairs"], ...]
  const [edgeFrom,setEdgeFrom]=useState(null); // 始点ノードID
  const [edgeType,setEdgeType]=useState("path"); // "path" | "stairs"
  const [edgeCopied,setEdgeCopied]=useState(false);
  const [deletedEdges,setDeletedEdges]=useState(new Set()); // 削除した既存EDGESのインデックス
  // 入口（道とは独立）
  const [showEnts,setShowEnts]=useState(false);
  const [entEditMode,setEntEditMode]=useState(false);
  const [newEnts,setNewEnts]=useState([]); // 新規追加した入口 [{spot,lat,lng}, ...]
  const [entDragEdits,setEntDragEdits]=useState({}); // idx→{lat,lng} 既存ENTRANCES+newEntsのドラッグ修正
  const [entCopied,setEntCopied]=useState(false);
  // 建物範囲（ポリゴン）編集
  const [areaEditMode,setAreaEditMode]=useState(false);
  const [areaEdits,setAreaEdits]=useState({}); // spotId → [[lat,lng], ...]
  const [areaCopied,setAreaCopied]=useState(false);
  const [areaSelSpot,setAreaSelSpot]=useState(null); // 選択中の建物ID

  // init map
  useEffect(()=>{
    if(!leafletReady||!mapRef.current||mapInst.current)return;
    const L=window.L;
    const map=L.map(mapRef.current,{
      center:[CAMPUS_CENTER.lat,CAMPUS_CENTER.lng],
      zoom:CAMPUS_ZOOM,
      zoomControl:false,
      attributionControl:false,
    });
    L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg",{
      maxZoom:22,maxNativeZoom:18,
    }).addTo(map);
    overlayRef.current=L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{
      maxZoom:22,maxNativeZoom:19,pane:"overlayPane",opacity:0.35,
    }).addTo(map);
    L.control.zoom({position:"bottomright"}).addTo(map);
    L.control.attribution({position:"bottomleft",prefix:false})
      .addAttribution('&copy; 国土地理院')
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
      // ── 編集モード: 全スポットをドラッグ可能なラベル付きマーカーで表示 ──
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
        const verts=areaEdits[s.id]||[]; // [[lat,lng], ...]
        const isSel=areaSelSpot===s.id;
        // ポリゴン描画（頂点が3つ以上ある場合）
        if(verts.length>=3){
          const poly=L.polygon(verts,{
            color:isSel?"#60a0ff":s.col,fillColor:isSel?"#60a0ff":s.col,
            fillOpacity:isSel?0.25:0.12,weight:isSel?2.5:1.5,opacity:isSel?0.9:0.5,
            interactive:true,
          }).addTo(map);
          poly.on("click",(ev)=>{L.DomEvent.stopPropagation(ev);setAreaSelSpot(s.id);});
          markersRef.current.push(poly);
        }else if(verts.length===2){
          // 2頂点: 線で表示
          const line=L.polyline(verts,{color:isSel?"#60a0ff":s.col,weight:isSel?2.5:1.5,opacity:isSel?0.9:0.5,dashArray:"4,4"}).addTo(map);
          line.on("click",(ev)=>{L.DomEvent.stopPropagation(ev);setAreaSelSpot(s.id);});
          markersRef.current.push(line);
        }else if(verts.length===1){
          // 1頂点: ドットで表示
          const dot=L.circleMarker(verts[0],{radius:4,color:isSel?"#60a0ff":s.col,fillColor:isSel?"#60a0ff":s.col,fillOpacity:0.5,weight:2}).addTo(map);
          dot.on("click",(ev)=>{L.DomEvent.stopPropagation(ev);setAreaSelSpot(s.id);});
          markersRef.current.push(dot);
        }
        // 建物ラベル
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
        // 選択中: 各頂点をドラッグ可能なマーカーで表示
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
            // 右クリックで頂点削除
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
      // マップクリック: 選択中の建物に頂点追加 / 未選択なら選択解除
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

    // GPS位置マーカー（実際の現在地）
    if(gpsPos){
      const gpsPulse=L.divIcon({
        className:"",
        html:`<div style="position:relative;transform:translate(-50%,-50%)">
          <div style="position:absolute;inset:-12px;border-radius:50%;background:#4285f420;border:1.5px solid #4285f440;animation:locPulse 2s ease-in-out infinite"></div>
          <div style="width:14px;height:14px;border-radius:50%;background:#4285f4;border:3px solid #fff;box-shadow:0 0 6px rgba(66,133,244,.5)"></div>
        </div>`,
        iconSize:[0,0],iconAnchor:[0,0],
      });
      const gm=L.marker([gpsPos.lat,gpsPos.lng],{icon:gpsPulse,zIndexOffset:1000}).addTo(map);
      gm.bindTooltip(`<b>現在地</b><br/><span style="color:${T.txD}">GPS精度: ${gpsPos.accuracy?Math.round(gpsPos.accuracy)+"m":"不明"}</span>`,{className:"spot-tip",direction:"top",offset:[0,-10]});
      markersRef.current.push(gm);
      // 精度円
      if(gpsPos.accuracy&&gpsPos.accuracy<500){
        const circle=L.circle([gpsPos.lat,gpsPos.lng],{radius:gpsPos.accuracy,color:"#4285f4",fillColor:"#4285f4",fillOpacity:0.08,weight:1,opacity:0.3}).addTo(map);
        markersRef.current.push(circle);
      }
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
      // 入口もノードとして登録
      ENTRANCES.forEach((ent,idx)=>{
        nodes[`ent_${idx}`]={lat:ent.lat,lng:ent.lng};
      });

      // エッジ（道）を描画 — 既存 + 新規
      const allEdges=[...EDGES,...newEdges];
      allEdges.forEach((e,ei)=>{
        const isExisting=ei<EDGES.length;
        if(isExisting&&deletedEdges.has(ei))return; // 削除済みはスキップ
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

      // ウェイポイント（既存 + 新規、重複排除）
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
        // マップクリックで新規WP追加
        const onClick=(e)=>{
          const id=`wp_${Date.now().toString(36)}`;
          setNewWps(prev=>[...prev,{id,lat:parseFloat(e.latlng.lat.toFixed(5)),lng:parseFloat(e.latlng.lng.toFixed(5))}]);
        };
        map.on("click",onClick);
        markersRef.current.push({remove:()=>map.off("click",onClick)});
      }else if(edgeEditMode){
        // エッジ編集: WP+スポットをクリックして接続
        const edgeClick=(nodeId)=>{
          if(!edgeFrom){setEdgeFrom(nodeId);return;}
          if(edgeFrom===nodeId){setEdgeFrom(null);return;} // 同じノードは解除
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
        // スポットもエッジ端点に
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
        // 入口もエッジ端点に
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
        // edgeFrom → マウス追従ライン
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

    // ── 入口表示（道とは独立） ──
    if(showEnts){
      const allEnts=[...ENTRANCES,...newEnts];
      allEnts.forEach((ent,idx)=>{
        const s=SPOTS.find(x=>x.id===ent.spot);
        if(!s||s.lat==null)return;
        const pos=entDragEdits[idx]||{lat:ent.lat,lng:ent.lng};
        // 建物中心↔入口の接続線
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
      // 入口編集モード: マップクリックで最寄り建物に新規入口追加
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
  },[leafletReady,peers,myLoc,grouped,editMode,edits,showPaths,wpEditMode,wpEdits,newWps,edgeEditMode,edgeFrom,newEdges,edgeType,deletedEdges,showEnts,entEditMode,newEnts,entDragEdits,gpsPos,areaEditMode,areaSelSpot,areaEdits]);

  // 変更をコード形式でコピー
  const copyEdits=()=>{
    const lines=Object.entries(edits).map(([id,pos])=>{
      const s=SPOTS.find(x=>x.id===id);
      return `  { id: "${id}", label: "${s?.label}", lat: ${pos.lat}, lng: ${pos.lng} },`;
    }).join("\n");
    navigator.clipboard.writeText(lines);
    setCopied(true);
    setTimeout(()=>setCopied(false),2000);
  };

  // WP変更をコピー（既存の編集 + 新規WP、全WPをコピー）
  const copyWpEdits=()=>{
    const cpIds=new Set(WAYPOINTS.map(w=>w.id));
    const allWps=[...WAYPOINTS,...newWps.filter(w=>!cpIds.has(w.id))];
    const lines=allWps.map(w=>{
      const pos=wpEdits[w.id]||{lat:w.lat,lng:w.lng};
      return `  { id: "${w.id}", lat: ${pos.lat}, lng: ${pos.lng} },`;
    }).join("\n");
    navigator.clipboard.writeText(lines);
    setWpCopied(true);
    setTimeout(()=>setWpCopied(false),2000);
  };

  // エッジをコピー（全EDGES - 削除分 + 新規）
  const copyEdgeEdits=()=>{
    const remaining=EDGES.filter((_,i)=>!deletedEdges.has(i));
    const allEdges=[...remaining,...newEdges];
    const lines=allEdges.map(e=>{
      const type=e[2];
      return type?`  ["${e[0]}", "${e[1]}", "${type}"],`:`  ["${e[0]}", "${e[1]}"],`;
    }).join("\n");
    navigator.clipboard.writeText(lines);
    setEdgeCopied(true);
    setTimeout(()=>setEdgeCopied(false),2000);
  };

  // 範囲（ポリゴン）変更をコピー（オブジェクト形式）
  const copyAreaEdits=()=>{
    const entries=Object.entries(areaEdits).filter(([,v])=>v.length>0).map(([id,verts])=>{
      const pts=verts.map(v=>`[${v[0]},${v[1]}]`).join(",");
      return `  "${id}": [${pts}],`;
    }).join("\n");
    navigator.clipboard.writeText(`{\n${entries}\n}`);
    setAreaCopied(true);
    setTimeout(()=>setAreaCopied(false),2000);
  };

  // 入口変更をコピー（ENTRANCES配列形式）
  const copyEntEdits=()=>{
    const allEnts=[...ENTRANCES,...newEnts];
    const lines=allEnts.map((ent,idx)=>{
      const pos=entDragEdits[idx]||{lat:ent.lat,lng:ent.lng};
      return `  { spot: "${ent.spot}", lat: ${pos.lat}, lng: ${pos.lng} },`;
    }).join("\n");
    navigator.clipboard.writeText(lines);
    setEntCopied(true);
    setTimeout(()=>setEntCopied(false),2000);
  };

  if(!leafletReady)return <Loader msg="地図を読み込み中" size="sm"/>;

  const selGroup=selSpot?grouped[selSpot]:null;
  const selSpotObj=selSpot?getSpot(selSpot):null;
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
      <div ref={mapRef} style={{flex:1,minHeight:mob?300:400}}/>

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
        <button onClick={()=>{setEditMode(e=>!e);setSelSpot(null);}} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:8,background:editMode?"#e8b63a":`${T.bg2}e0`,backdropFilter:"blur(8px)",border:`1px solid ${editMode?"#e8b63a":T.bd}`,cursor:"pointer",transition:"all .15s"}}>
          <span style={{fontSize:11,fontWeight:600,color:editMode?"#000":T.txH}}>{editMode?"編集中":"座標を編集"}</span>
        </button>
      </div>

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
        {/* path/stairs 切替 */}
        <div style={{display:"flex",gap:4,marginBottom:8}}>
          <button onClick={()=>setEdgeType("path")} style={{flex:1,padding:"5px",borderRadius:6,border:`1px solid ${edgeType==="path"?"#f0c040":T.bd}`,background:edgeType==="path"?"#f0c04020":"transparent",cursor:"pointer"}}>
            <span style={{fontSize:10,fontWeight:600,color:edgeType==="path"?"#f0c040":T.txD}}>道</span>
          </button>
          <button onClick={()=>setEdgeType("stairs")} style={{flex:1,padding:"5px",borderRadius:6,border:`1px solid ${edgeType==="stairs"?"#e06050":T.bd}`,background:edgeType==="stairs"?"#e0605020":"transparent",cursor:"pointer"}}>
            <span style={{fontSize:10,fontWeight:600,color:edgeType==="stairs"?"#e06050":T.txD}}>階段</span>
          </button>
        </div>
        {/* 新規エッジ一覧 */}
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
        {/* 削除済みエッジ一覧 */}
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

      {/* 編集パネル */}
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

      {/* 非地理スポット凡例 */}
      {!editMode&&(()=>{
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
      {!editMode&&selSpotObj&&<>
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

/* ── メインビュー ── */
export const LocationView=({mob,user={},friendIds})=>{
  const {peers:allPeers,myLoc,setMyLoc}=useLocationSharing({id:user.moodleId||user.id,name:user.name,col:user.col,av:user.av});
  const peers=friendIds?allPeers.filter(p=>friendIds.has(Number(p.id))):allPeers;
  const mySpot=getSpot(myLoc);
  const [tab,setTab]=useState("list"); // "list" | "map" | "spots"
  const [gpsPos,setGpsPos]=useState(null); // {lat,lng,accuracy}
  const [gpsStatus,setGpsStatus]=useState("idle"); // "idle"|"loading"|"done"|"error"
  const [gpsMsg,setGpsMsg]=useState("");

  const getGps=useCallback(()=>{
    if(!navigator.geolocation){setGpsStatus("error");setGpsMsg("この端末では位置情報を使えません");return;}
    setGpsStatus("loading");setGpsMsg("");
    navigator.geolocation.getCurrentPosition(
      (pos)=>{
        const {latitude:lat,longitude:lng,accuracy}=pos.coords;
        setGpsPos({lat,lng,accuracy});
        const {spot,distance}=findNearestSpot(lat,lng);
        const campusDist=haversine(lat,lng,CAMPUS_CENTER.lat,CAMPUS_CENTER.lng);
        if(campusDist>1500){
          setGpsMsg("キャンパス外のようです");
        }else if(spot){
          setMyLoc(spot.id);
          setGpsMsg(distance===0?`${spot.label}（建物内）に設定しました`:distance===-1?"屋外（道）に設定しました":`${spot.label}（${Math.round(distance)}m）に設定しました`);
        }
        setGpsStatus("done");
        setTab("map");
      },
      (err)=>{
        setGpsStatus("error");
        if(err.code===1)setGpsMsg("位置情報の許可が必要です");
        else if(err.code===2)setGpsMsg("位置情報を取得できません");
        else setGpsMsg("タイムアウトしました");
      },
      {enableHighAccuracy:true,timeout:10000,maximumAge:30000}
    );
  },[setMyLoc]);

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
          {/* GPS 現在地取得 */}
          <div style={{display:"flex",alignItems:"center",gap:8,marginTop:8}}>
            <button onClick={getGps} disabled={gpsStatus==="loading"} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:8,border:`1px solid ${T.accent}30`,background:`${T.accent}08`,cursor:gpsStatus==="loading"?"wait":"pointer",transition:"all .15s",opacity:gpsStatus==="loading"?0.6:1}} onMouseEnter={e=>{if(gpsStatus!=="loading")e.currentTarget.style.background=`${T.accent}16`;}} onMouseLeave={e=>e.currentTarget.style.background=`${T.accent}08`}>
              <span style={{display:"flex",color:T.accent}}>{I.tgt}</span>
              <span style={{fontSize:12,fontWeight:600,color:T.accent}}>{gpsStatus==="loading"?"取得中…":"現在地を取得"}</span>
            </button>
            {gpsMsg&&<span style={{fontSize:11,color:gpsStatus==="error"?T.red:T.green,fontWeight:500}}>{gpsMsg}</span>}
          </div>
        </div>
      </div>

      {/* ── タブ切り替え ── */}
      <div style={{display:"flex",gap:0,padding:"0 16px",borderBottom:`1px solid ${T.bd}`,flexShrink:0}}>
        {[{id:"list",l:"友達",cnt:peers.length},{id:"map",l:"地図"},{id:"spots",l:"場所を選択"}].map(t=>
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
