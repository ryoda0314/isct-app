import { useEffect, useMemo, useRef, useState } from "react";
import { distance, routeDirections } from "../yokohama/navigation.js";
import styles from "../yokohama/map.module.css";
const icons={
  search:<><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></>,
  walk:<><circle cx="14" cy="4" r="1.5"/><path d="m7 12 3-4 4 1 2 5 4 1M12 9l-2 7-4 5m4-6 5 2 1 4"/></>,
  route:<><circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/></>,
  fit:<><path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"/><circle cx="12" cy="12" r="2"/></>,
  close:<path d="m6 6 12 12M18 6 6 18"/>,plus:<path d="M12 5v14M5 12h14"/>,minus:<path d="M5 12h14"/>,
};
function Icon({name}) {return <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icons[name]}</svg>;}
function IconButton({name,label,onClick}) {return <button type="button" className={styles.icon} onClick={onClick} title={label} aria-label={label}><Icon name={name}/></button>;}

function Joystick({onMove}) {
  const [knob,setKnob]=useState([0,0]), active=useRef(null);
  function aim(e) {
    const box=e.currentTarget.getBoundingClientRect(),x=e.clientX-box.left-box.width/2,y=e.clientY-box.top-box.height/2;
    const scale=Math.max(30,Math.hypot(x,y)),a=x/scale,b=y/scale;
    setKnob([a*19,b*19]);onMove(a,b);
  }
  function end(e) {if(e.pointerId===active.current){active.current=null;setKnob([0,0]);onMove(0,0);}}
  return <div role="group" aria-label="歩く方向" className={styles.joystick}
    onPointerDown={e=>{if(active.current!==null)return;active.current=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);aim(e);}}
    onPointerMove={e=>{if(e.pointerId===active.current)aim(e);}} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}>
    <span style={{transform:`translate(${knob[0]}px,${knob[1]}px)`}}/>
  </div>;
}

export default function CampusExplorer({campus}) {
  const {name, places, byId, defaultStart, exteriorView, network, overviewStops, searchPlaces,
    PlanMap, WalkMinimap, loadScene, defaultView, searchHint, sources, credit, buildingNotes} = campus;
  const groups=useMemo(()=>[...new Set(places.map(p=>p.group))],[places]);
  const host=useRef(null),scene=useRef(null),plan=useRef(null),handlers=useRef(null),searchInput=useRef(null);
  const [mode,setMode]=useState("3D"),[ready,setReady]=useState(false),[unavailable,setUnavailable]=useState(false);
  const [walking,setWalking]=useState(false),[walkName,setWalkName]=useState(""),[pose,setPose]=useState(null);
  const [selected,setSelected]=useState(null),[picker,setPicker]=useState(null),[query,setQuery]=useState(""),[group,setGroup]=useState("");
  const [planning,setPlanning]=useState(false),[origin,setOrigin]=useState(defaultStart),[dest,setDest]=useState(null);
  const [avoid,setAvoid]=useState(false),[info,setInfo]=useState(false),[message,setMessage]=useState("");
  const [mapPicking,setMapPicking]=useState(null);
  const route=useMemo(()=>planning && origin && dest ? network.route(origin.approach,dest.approach,avoid) : null,[planning,origin,dest,avoid]);
  const walkReturn=useRef("3D"), pendingWalk=useRef(null), initialView=useRef(false);
  const currentMap=()=>mode==="2D"?plan.current:scene.current;
  function select(p) {
    if(!p)return;
    setSelected(p);setPicker(null);setInfo(false);setMessage("");setMapPicking(null);
    currentMap()?.focus(p);
  }
  function assign(p,field) {
    if(field==="origin")setOrigin(p);else setDest(p);
    setPlanning(true);setPicker(null);setMapPicking(null);setMessage("");setInfo(false);
    setSelected(p);currentMap()?.focus(p);
  }
  function pick({id,point}) {
    let p=byId.get(id);
    if(!p && point) {
      if(campus.canPickGround && !campus.canPickGround(...point)){setMessage("歩いて通れる場所を選んでください。");return;}
      const hit=network.project(point);
      if(!hit || hit.gap>45) {setMessage("学内の建物か通路を選んでください。");return;}
      p={id:"map-point",name:"地図上の地点",point,approach:hit.point,group:"付近の通路"};
    }
    if(!p)return;
    if(mapPicking)assign(p,mapPicking);else {setPlanning(false);select(p);}
  }
  function openPicker(field) {setPicker(field);setMapPicking(null);setInfo(false);setQuery("");setGroup("");}
  function openRoutes() {setDest(selected||null);setPlanning(true);setInfo(false);setPicker(null);setMapPicking(null);}
  function exitWalk() {
    scene.current?.leave();setWalking(false);setMode(walkReturn.current);setPose(null);
  }
  function startWalk(p,alongRoute=false) {
    if(unavailable)return;
    const view=alongRoute && route?.points.length>1 ?
      {start:route.points[0],toward:route.points.find(q=>distance(q,route.points[0])>3)||route.points.at(-1),pitch:0} :
      exteriorView(p||defaultView);
    walkReturn.current=mode;setMode("3D");setPicker(null);setInfo(false);setMessage("");setMapPicking(null);
    const begin=()=>{
      if(scene.current?.walk(view.start,view.toward,view.pitch,view.framingFov,view.framingAspect)){
        setWalkName(alongRoute ? dest.name+"へ" : p?.name||defaultView.name);setWalking(true);
      } else setMessage("近くに歩行を開始できる通路が見つかりませんでした。");
    };
    if(ready)begin();else pendingWalk.current=begin;
  }
  handlers.current={pick,exitWalk,startWalk,select};
  useEffect(()=>{
    if(unavailable)return;
    let alive=true;
    function fallback(err) {
      if(!alive)return;
      if(err)console.warn(name+" 3D map",err);
      setUnavailable(true);setWalking(false);setMode("2D");setMessage("この端末では平面図で表示します。");
    }
    loadScene().then(({createScene})=>{
      if(!alive)return;
      scene.current=createScene(host.current,{places,onPick:e=>handlers.current.pick(e),onExit:()=>handlers.current.exitWalk(),onPose:setPose,onError:fallback,
        onBearing:angle=>host.current?.parentElement?.style.setProperty("--north",angle+"rad")});
      setReady(true);
    }).catch(fallback);
    return ()=>{alive=false;scene.current?.dispose();scene.current=null;};
  },[unavailable,loadScene,name,places]);
  useEffect(()=>{
    if(!ready || initialView.current)return;
    initialView.current=true;
    if(pendingWalk.current){pendingWalk.current();pendingWalk.current=null;return;}
    const params=new URLSearchParams(location.search), p=byId.get(params.get("walk")||params.get("place"));
    if(p){handlers.current.select(p);if(params.has("walk"))handlers.current.startWalk(p);}
  },[ready]);
  useEffect(()=>{scene.current?.setRoute(route);},[route,ready]);
  useEffect(()=>{
    if(!route)return;
    plan.current?.fitRoute(route);scene.current?.fitRoute(route);
  },[route,ready]);
  useEffect(()=>{if(picker)searchInput.current?.focus();},[picker]);
  function toggleMode() {
    const next=mode==="3D"?"2D":"3D";setMode(next);setInfo(false);
    const target=next==="3D"?scene.current:plan.current;
    if(route)target?.fitRoute(route);else if(selected)target?.focus(selected);
  }
  function reset() {setSelected(null);setPicker(null);setMapPicking(null);setMessage("");scene.current?.focus(null);currentMap()?.fit();}
  const list=searchPlaces(query,group), notes=selected && (buildingNotes?.[selected.id] || selected);
  return <section className={styles.map} aria-label={name+" 学内マップ"} data-mode={walking?"walk":mode}>
    <div ref={host} className={styles.scene} style={{visibility:mode==="3D"?"visible":"hidden"}}/>
    <div style={{position:"absolute",inset:0,visibility:mode==="2D"?"visible":"hidden"}}><PlanMap ref={plan} selected={selected} route={route} onPick={pick}/></div>
    {!ready && mode==="3D" && <div role="status" className={styles.loading}>{name}を描画中…</div>}
    {!walking && <>
      <div className={styles.searchBar}>
        <button className={styles.search} onClick={()=>openPicker("search")}><Icon name="search"/>棟番号・施設名で検索</button>
        <IconButton name="route" label="徒歩ルート" onClick={openRoutes}/>
      </div>
      <div className={styles.tools}>
        {!unavailable && <button type="button" onClick={toggleMode} aria-label={mode==="3D"?"平面図に切り替え":"3Dに切り替え"}>{mode==="3D"?"2D":"3D"}</button>}
        {mode==="3D"&&<button type="button" title="北を上にする" aria-label="北を上にする" onClick={()=>scene.current?.northUp()}>
          <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" style={{transform:"rotate(var(--north,0rad))"}}>
            <path d="M10 1 14 10 10 8 6 10Z" fill="#aa5451"/><path d="M10 19 6 10 10 12 14 10Z" fill="#728283"/>
          </svg></button>}
        <IconButton name="fit" label="キャンパス全景" onClick={reset}/>
        <IconButton name="plus" label="拡大" onClick={()=>currentMap()?.zoom(.76)}/>
        <IconButton name="minus" label="縮小" onClick={()=>currentMap()?.zoom(1.32)}/>
      </div>
      {picker && <div className={styles.picker} role="dialog" aria-label={picker==="search"?"施設検索":picker==="origin"?"出発地の選択":"目的地の選択"}>
        <div className={styles.row}><b>{picker==="search"?"施設を探す":picker==="origin"?"出発地を選ぶ":"目的地を選ぶ"}</b><IconButton name="close" label="検索を閉じる" onClick={()=>setPicker(null)}/></div>
        <input ref={searchInput} aria-label="棟番号・施設名" placeholder={searchHint} value={query} onChange={e=>setQuery(e.target.value)}
          onKeyDown={e=>{if(e.key==="Escape")setPicker(null);if(e.key==="Enter"&&list[0])picker==="search"?(setPlanning(false),select(list[0])):assign(list[0],picker);}}/>
        <div className={styles.row}><select aria-label="地区で絞り込み" value={group} onChange={e=>setGroup(e.target.value)}><option value="">全地区・屋外施設</option>{groups.map(g=><option key={g}>{g}</option>)}</select>
          {picker!=="search" && <button type="button" onClick={()=>{setMapPicking(picker);setPicker(null);}}>地図で指定</button>}</div>
        <div className={styles.results}>{list.map(p=><button key={p.id} onClick={()=>picker==="search"?(setPlanning(false),select(p)):assign(p,picker)}><span>{p.name}</span><small>{p.group}</small></button>)}
          {!list.length&&<p>一致する施設がありません。</p>}</div>
      </div>}
      {mapPicking && <div className={styles.notice}>{mapPicking==="origin"?"出発地":"目的地"}にする建物か通路をタップ<button onClick={()=>setMapPicking(null)}>取消</button></div>}
      {!picker && !mapPicking && !info && <div className={styles.card}>
        {planning ? <>
          <div className={styles.row}><h3>徒歩ルート</h3><IconButton name="close" label="ルートを閉じる" onClick={()=>setPlanning(false)}/></div>
          <button className={styles.endpoint} onClick={()=>openPicker("origin")}><small>出発地</small>{origin?.name||"選択"}</button>
          <button className={styles.endpoint} onClick={()=>openPicker("destination")}><small>目的地</small>{dest?.name||"選択"}</button>
          <label className={styles.check}><input type="checkbox" checked={avoid} onChange={e=>setAvoid(e.target.checked)}/>階段を避ける</label>
          {route && <><div className={styles.row}><b>約{Math.ceil(route.length/80)}分 <small>・ {Math.round(route.length)} m</small></b>
            {!unavailable && route.length>0 && <button className={styles.primary} onClick={()=>startWalk(origin,true)}><Icon name="walk"/>ルートを歩く</button>}</div>
            <details className={styles.directions}><summary>道順・到着地点</summary><ol>{routeDirections(route).map((d,i)=><li key={i}>{d.action} · 約{Math.round(d.length)} m</li>)}</ol>{dest.arrival||dest.name+"付近の通路"}に到着</details></>}
          {dest && origin && !route && <p role="status">この条件でつながる屋外通路がありません。</p>}
        </> : selected ? <>
          <div className={styles.row}><small>{selected.group}</small><IconButton name="close" label="施設詳細を閉じる" onClick={reset}/></div>
          <h3>{selected.name}</h3>
          {notes?.detail && <p>{notes.detail}</p>}
          {notes?.source && <a className={styles.sourceLink} href={notes.source} target="_blank" rel="noreferrer">大学の施設案内 ↗</a>}
          {selected.locationEstimate && <p>表示位置は大学資料をもとにした概略です。</p>}
          <div className={styles.actions}>{!unavailable&&<button className={styles.primary} onClick={()=>startWalk(selected)}><Icon name="walk"/>{selected.footprint?"地上から外観を見る":"ここから歩く"}</button>}
            <button onClick={openRoutes}><Icon name="route"/>ここへ行く</button></div>
        </> : <>
          <div className={styles.row}><h3>{campus.mapTitle||"主な施設"}</h3>{!unavailable&&<button className={styles.primary} onClick={()=>startWalk(null)}><Icon name="walk"/>構内を歩く</button>}</div>
          <div className={styles.stops}>{overviewStops.map(p=><button key={p.id} onClick={()=>select(p)}>{p.mapLabel}</button>)}</div>
        </>}
      </div>}
    </>}
    {walking && <>
      <div className={styles.walkHeader}><button className={styles.primary} onClick={exitWalk}>← 地図に戻る</button><span>{walkName}</span></div>
      <WalkMinimap pose={pose} route={route}/>
      <div className={styles.walkHint}>{route && pose && dest ? (distance(pose,route.points.at(-1))<4 ? "目的地付近に到着" : "青い経路に沿って移動") : "ドラッグで見回す"}<span>WASD・矢印で移動</span></div>
      <Joystick onMove={(x,y)=>scene.current?.move(x,y)}/>
    </>}
    {message && !walking && !picker && <div className={styles.notice} role="status">{message}<button aria-label="通知を閉じる" onClick={()=>setMessage("")}>×</button></div>}
    {info&&<div className={styles.info} role="dialog" aria-label="地図の出典"><div className={styles.row}><h3>地図の出典</h3><IconButton name="close" label="出典を閉じる" onClick={()=>setInfo(false)}/></div>
      <p>{campus.sourceNote||"建物の配置・外観は大学資料と公開地図を照合しています。窓割りの一部、植栽、入口付近の細部には推定が含まれます。"}</p>
      {sources.map(([label,url])=><a key={url} href={url} target="_blank" rel="noreferrer">{label}</a>)}
    </div>}
    <div className={styles.credit}><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a> · {credit} <button onClick={()=>setInfo(v=>!v)}>出典</button></div>
  </section>;
}
