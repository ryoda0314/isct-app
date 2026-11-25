import { useEffect, useMemo, useRef, useState } from "react";
import { distance, routeDirections } from "../yokohama/navigation.js";
import styles from "../yokohama/map.module.css";
import { T } from "../theme.js";
import { t } from "../i18n.js";
import { MapInventory, itemUseLabel } from "../components/MapInventory.jsx";
import { ITEMS, loadInventory, saveInventory, takeItem } from "../campus3dInventory.js";

// 横浜・湯島の地図（大岡山は NavigationView・CampusMap3D）。2026-11-25：見た目と使い方を大岡山にそろえた ──
// 上の大きな検索の欄、右下の名前つきのボタン（現在地・3D・全体・歩いて見る・＋−）、下のカード。歩くときは照準・PC はクリックで
// マウスを捕まえて見回す・C でしゃがむ・持ち物の 9 マス（スマホ・カメラ・地図・学生証・IC カード。数字キー・ホイール・右クリック）・
// スマホナビ（行き先を選ぶと道に案内の線）・メニュー（持ち物・ほかの所へ移る・操作のしかた）。乗り物・建物の中・椅子・自販機は
// このキャンパスのデータにないので出さない
const icons={
  search:<><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></>,
  walk:<><circle cx="14" cy="4" r="1.5"/><path d="m7 12 3-4 4 1 2 5 4 1M12 9l-2 7-4 5m4-6 5 2 1 4"/></>,
  route:<><circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/></>,
  fit:<><path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"/><circle cx="12" cy="12" r="2"/></>,
  close:<path d="m6 6 12 12M18 6 6 18"/>,
  locate:<><circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="8"/><path d="M12 1.5v3m0 15v3M1.5 12h3m15 0h3"/></>,
  cube:<><path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7z"/><path d="M3.5 7 12 11.5 20.5 7M12 11.5v10"/></>,
  phone:<><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></>,
};
function Icon({name,size=18}) {return <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{icons[name]}</svg>;}
function IconButton({name,label,onClick}) {return <button type="button" className={styles.iconBtn} onClick={onClick} title={label} aria-label={label}><Icon name={name}/></button>;}

// 左のスティック（大岡山と同じ大きさ）
// rot：横に回して描いているとき（縦に持ったスマホ）は、画面の上の指の位置を絵の向きに直す
function Joystick({onMove,rot}) {
  const [knob,setKnob]=useState([0,0]), active=useRef(null);
  // 大岡山のスティックと同じ効き方（2026-11-26）：ふちから 14px 内側までで最大、まん中の 12% は止まる、倒した分だけの速さ
  function aim(e) {
    const box=e.currentTarget.getBoundingClientRect();
    const lim=box.width/2-14;
    let x=e.clientX-box.left-box.width/2,y=e.clientY-box.top-box.height/2;
    if(rot){const s=x;x=y;y=-s;}
    const m=Math.hypot(x,y);
    if(m>lim){x*=lim/m;y*=lim/m;}
    const v=m<lim*.12?0:1;
    setKnob([x,y]);onMove(x/lim*v,y/lim*v);
  }
  function end(e) {if(e.pointerId===active.current){active.current=null;setKnob([0,0]);onMove(0,0);}}
  return <div role="group" aria-label="歩く方向" className={styles.joy}
    onPointerDown={e=>{if(active.current!==null)return;active.current=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);aim(e);}}
    onPointerMove={e=>{if(e.pointerId===active.current)aim(e);}} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}>
    <span className={styles.joyKnob} style={{transform:`translate(${knob[0]}px,${knob[1]}px)`}}/>
  </div>;
}

export default function CampusExplorer({campus}) {
  const {name, places, byId, defaultStart, exteriorView, network, overviewStops, searchPlaces,
    PlanMap, WalkMinimap, loadScene, defaultView, searchHint, sources, credit, buildingNotes, toLocal} = campus;
  const groups=useMemo(()=>[...new Set(places.map(p=>p.group))],[places]);
  const host=useRef(null),scene=useRef(null),plan=useRef(null),handlers=useRef(null),searchInput=useRef(null),root=useRef(null),cardRef=useRef(null);
  const [mode,setMode]=useState("3D"),[ready,setReady]=useState(false),[unavailable,setUnavailable]=useState(false);
  const [walking,setWalking]=useState(false),[pose,setPose]=useState(null);
  const [selected,setSelected]=useState(null),[picker,setPicker]=useState(null),[query,setQuery]=useState(""),[group,setGroup]=useState("");
  const [planning,setPlanning]=useState(false),[origin,setOrigin]=useState(defaultStart),[dest,setDest]=useState(null);
  const [avoid,setAvoid]=useState(false),[info,setInfo]=useState(false),[message,setMessage]=useState("");
  const [mapPicking,setMapPicking]=useState(null);
  // 大岡山にそろえた分（2026-11-25）
  const [rotated,setRotated]=useState(false),rotatedRef=useRef(false);
  const [gps,setGps]=useState(null),gpsWatch=useRef(null),gpsShown=useRef(false); // 現在地 [x, z]（このキャンパスの m）
  const [locked,setLocked]=useState(false); // PC：マウスを捕まえて見回しているか
  const [hint,setHint]=useState(false);
  const [walkMenu,setWalkMenu]=useState(false);
  const [phoneOpen,setPhoneOpen]=useState(false),[phoneQuery,setPhoneQuery]=useState("");
  const [guide,setGuide]=useState(null); // スマホナビで案内している行き先
  const [inv,setInv]=useState(null),invRef=useRef(null);
  const [invMenu,setInvMenu]=useState(null),[invToast,setInvToast]=useState(null),toastTimer=useRef(0);
  const [kitOpen,setKitOpen]=useState(()=>{try{return localStorage.getItem("cb3Kit")==="1";}catch{return false;}});
  const [run,setRun]=useState(false);
  const [sideBottom,setSideBottom]=useState(null);
  const [rot,setRot]=useState(false); // スマホで歩くあいだ、縦に持っていれば横に回して描く
  const touch=useMemo(()=>typeof window!=="undefined"&&!!window.matchMedia?.("(pointer: coarse)").matches,[]);
  const route=useMemo(()=>planning && origin && dest ? network.route(origin.approach,dest.approach,avoid) : null,[planning,origin,dest,avoid]);
  const walkReturn=useRef("3D"), pendingWalk=useRef(null), initialView=useRef(false), keyFns=useRef({});
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
    if(mapPicking)assign(p,mapPicking);else {setPlanning(false);setGuide(null);select(p);}
  }
  function openPicker(field) {setPicker(field);setMapPicking(null);setInfo(false);setQuery("");setGroup("");}
  function openRoutes() {setDest(selected||null);setPlanning(true);setInfo(false);setPicker(null);setMapPicking(null);}
  // 歩くのをやめる（「やめる」ボタン）。Esc は、メニュー・スマホ・持ち物の画面が開いていればそれを閉じるだけ（exitWalk）
  function stopWalk() {
    setInvMenu(null);setPhoneOpen(false);setWalkMenu(false);setRun(false);setHint(false);
    scene.current?.leave();setWalking(false);setMode(walkReturn.current);setPose(null);
  }
  function exitWalk() {
    if(invMenu){setInvMenu(null);return;}
    if(phoneOpen){setPhoneOpen(false);return;}
    if(walkMenu){setWalkMenu(false);return;}
    stopWalk();
  }
  function startWalk(p,alongRoute=false) {
    if(unavailable)return;
    // 何も選ばずに「歩いて見る」は大岡山と同じ見え方（画角 70°・2° 見下ろす）。建物を選んだとき（地上から外観を見る）は、その建物を収める画角
    // （大岡山の写真の撮影地点と同じ扱い。2026-11-26）
    const ext=exteriorView(p||defaultView);
    const view=alongRoute && route?.points.length>1 ?
      {start:route.points[0],toward:route.points.find(q=>distance(q,route.points[0])>3)||route.points.at(-1),pitch:-2*Math.PI/180} :
      p ? ext : {start:ext.start,toward:ext.toward,pitch:-2*Math.PI/180};
    walkReturn.current=mode;setMode("3D");setPicker(null);setInfo(false);setMessage("");setMapPicking(null);
    const begin=()=>{
      if(scene.current?.walk(view.start,view.toward,view.pitch,view.framingFov,view.framingAspect)){
        setWalking(true);setHint(true);setGuide(alongRoute?dest:null);
        // 持ち物（大岡山と同じ物を、端末に保存したまま使う。日が変わっていればお金を補充）
        const iv=loadInventory();saveInventory(iv);invRef.current=iv;setInv(iv);
      } else setMessage("近くに歩行を開始できる通路が見つかりませんでした。");
    };
    if(ready)begin();else pendingWalk.current=begin;
  }
  // 歩いたまま別の所へ移る（メニュー）。見る向きは view.toward
  function walkTo(view) {
    if(!scene.current?.walk(view.start,view.toward,view.pitch||0,view.framingFov,view.framingAspect))showToast("近くに歩ける通路がありません");
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
      scene.current=createScene(host.current,{places,onPick:e=>handlers.current.pick(e),onExit:()=>handlers.current.exitWalk(),onPose:setPose,onError:fallback,onLock:setLocked,
        onBearing:angle=>{
          root.current?.style.setProperty("--north",angle+"rad");
          const r=Math.abs(angle)>.05;
          if(r!==rotatedRef.current){rotatedRef.current=r;setRotated(r);}
        }});
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
    if(!route || walking)return;
    plan.current?.fitRoute(route);scene.current?.fitRoute(route);
  },[route,ready]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{if(picker)searchInput.current?.focus();},[picker]);
  function toggleMode() {
    const next=mode==="3D"?"2D":"3D";setMode(next);setInfo(false);
    const target=next==="3D"?scene.current:plan.current;
    if(route)target?.fitRoute(route);else if(selected)target?.focus(selected);
  }
  function reset() {setSelected(null);setPicker(null);setMapPicking(null);setMessage("");scene.current?.focus(null);currentMap()?.fit();}

  // 現在地（大岡山と同じ「現在地」ボタン。このキャンパスの m に直して青い点。キャンパスから遠ければ知らせるだけ）
  function locate() {
    if(!toLocal)return;
    if(mode==="2D")setMode("3D");
    if(gps){scene.current?.focusPoint(gps);return;}
    if(!navigator.geolocation){setMessage(t("cx.noGps"));return;}
    if(gpsWatch.current!=null)return;
    setMessage(t("cx.locating"));
    gpsWatch.current=navigator.geolocation.watchPosition(pos=>{
      const p=toLocal(pos.coords.longitude,pos.coords.latitude);
      const c=defaultView?.point||[0,0];
      if(distance(p,c)>2500){setGps(null);setMessage(t("cx.outside"));return;}
      setGps(p);setMessage(m=>m===t("cx.locating")?"":m);
      if(!gpsShown.current){gpsShown.current=true;scene.current?.focusPoint(p);}
    },()=>{setMessage(t("cx.noGps"));if(gpsWatch.current!=null)navigator.geolocation.clearWatch(gpsWatch.current);gpsWatch.current=null;},{enableHighAccuracy:true,maximumAge:5000,timeout:20000});
  }
  useEffect(()=>{scene.current?.setGps?.(gps);},[gps,ready]);
  useEffect(()=>()=>{if(gpsWatch.current!=null)navigator.geolocation?.clearWatch(gpsWatch.current);},[]);

  // 持ち物（大岡山の MapInventory をそのまま使う）
  const setKit=on=>{setKitOpen(on);try{localStorage.setItem("cb3Kit",on?"1":"0");}catch{/* 覚えられなくてもよい */}};
  function updateInv(fn) {const v=JSON.parse(JSON.stringify(invRef.current));fn(v);invRef.current=v;saveInventory(v);setInv(v);}
  function showToast(msg) {setInvToast(msg);clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setInvToast(null),2200);}
  function selectSlot(i,fromBar=false) {
    if(!invRef.current)return;
    if(!fromBar&&!kitOpen)setKit(true); // 数字キー・ホイールで持ちかえたら、しまっていた持ち物を出す
    updateInv(v=>{v.sel=((i%v.slots.length)+v.slots.length)%v.slots.length;});
  }
  function takePhoto() {
    const shot=scene.current?.capture?.();
    if(!shot){showToast(t("inv.photoFail"));return;}
    shot.then(blob=>{
      if(!blob){showToast(t("inv.photoFail"));return;}
      const d=new Date(),p2=n=>String(n).padStart(2,"0");
      const fname=`campus-${d.getFullYear()}${p2(d.getMonth()+1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}.jpg`;
      let file=null;
      try{file=new File([blob],fname,{type:"image/jpeg"});}catch{/* 保存だけ */}
      setInvMenu({kind:"photo",url:URL.createObjectURL(blob),name:fname,file});
    });
  }
  function applyItem() {
    const v=invRef.current,it=v?.slots[v.sel];
    if(!it||!walking)return;
    if(!kitOpen){setKit(true);return;} // しまっているときは、使わずに出すだけ（右クリック・Enter）
    if(it.id==="phone")setPhoneOpen(true);
    else if(it.id==="camera")takePhoto();
    else if(it.id==="student"||it.id==="ic")setInvMenu({kind:"card",id:it.id});
    else if(ITEMS[it.id]?.drink){updateInv(x=>takeItem(x,x.sel));showToast(t("inv.drank",{name:t(ITEMS[it.id].name)}));}
  }
  function closeInvMenu() {if(invMenu?.url)URL.revokeObjectURL(invMenu.url);setInvMenu(null);}
  keyFns.current={selectSlot,applyItem,sel:inv?.sel??0};
  // スマホナビ：いまいる所から行き先まで（道に案内の線。上に残りの距離）
  function guideTo(p) {
    const ps=scene.current?.pose?.();
    const hit=ps&&network.project([ps[0],ps[1]]);
    if(!hit){showToast("近くに通路が見つかりません");return;}
    setOrigin({id:"here",name:t("cx.here"),point:[ps[0],ps[1]],approach:hit.point,group:""});
    setDest(p);setPlanning(true);setGuide(p);setPhoneOpen(false);setPhoneQuery("");
  }
  function stopGuide() {setGuide(null);setPlanning(false);}
  const phoneList=useMemo(()=>phoneOpen?searchPlaces(phoneQuery,""):[],[phoneOpen,phoneQuery,searchPlaces]);
  const guideInfo=walking&&guide&&pose?(()=>{
    const end=route?.points.at(-1)||guide.approach||guide.point;
    const d=distance(pose,end);
    return d<4?t("cx.arrived",{name:guide.name}):t("cx.guiding",{name:guide.name,m:Math.round(d)});
  })():null;

  // 歩いているあいだのキー（1〜9 で持ちかえ・P でスマホ・Enter で使う）・ホイール（持ちかえ）・右クリック（使う）
  useEffect(()=>{
    if(!walking)return undefined;
    const el=host.current;
    const onKey=e=>{
      if(/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName))return;
      if(/^Digit[1-9]$/.test(e.code)){e.preventDefault();keyFns.current.selectSlot(+e.code.slice(5)-1);}
      else if(e.code==="KeyP"&&!e.repeat){e.preventDefault();setPhoneOpen(v=>!v);}
      else if(e.code==="Enter"&&!e.repeat){e.preventDefault();keyFns.current.applyItem();}
    };
    const onWheel=e=>{if(Math.abs(e.deltaY)>4)keyFns.current.selectSlot(keyFns.current.sel+(e.deltaY>0?1:-1));};
    const onDown=e=>{if(e.button===2)keyFns.current.applyItem();};
    window.addEventListener("keydown",onKey);
    el?.addEventListener("wheel",onWheel,{passive:true});
    el?.addEventListener("mousedown",onDown);
    return ()=>{window.removeEventListener("keydown",onKey);el?.removeEventListener("wheel",onWheel);el?.removeEventListener("mousedown",onDown);};
  },[walking]);
  // メニュー・スマホ・持ち物の画面を開いているあいだは歩かない
  useEffect(()=>{scene.current?.setInputOff?.(walking&&(walkMenu||phoneOpen||!!invMenu));},[walking,walkMenu,phoneOpen,invMenu]);
  // 説明：スマホとマウスを捕まえたあとは 6 秒で消す（PC でマウスを捕まえる前は、クリックの案内なので出しておく）
  useEffect(()=>{
    if(!walking||!hint||(!touch&&!locked))return undefined;
    const id=setTimeout(()=>setHint(false),6000);
    return ()=>clearTimeout(id);
  },[walking,hint,locked,touch]);
  // スマホで歩くあいだは画面いっぱい（大岡山と同じ）。縦に持っているときは横に回して描く
  const full=walking&&touch;
  useEffect(()=>{
    if(!full){setRot(false);scene.current?.setRotated?.(false);return undefined;}
    const on=()=>{const r=window.innerHeight>window.innerWidth;setRot(r);scene.current?.setRotated?.(r);};
    on();
    document.documentElement.classList.add(styles.scrollLock);
    window.addEventListener("resize",on);window.addEventListener("orientationchange",on);
    return ()=>{document.documentElement.classList.remove(styles.scrollLock);window.removeEventListener("resize",on);window.removeEventListener("orientationchange",on);};
  },[full]);
  function toggleRun() {const n=!run;setRun(n);scene.current?.setRun?.(n);}
  // せまい画面では、右下のボタンの列を下のカードの上に置く
  useEffect(()=>{
    const el=root.current;
    if(!el)return undefined;
    const update=()=>{
      const card=cardRef.current;
      setSideBottom(el.clientWidth<=540&&card?.isConnected?card.offsetHeight+20:null);
    };
    update();
    const ro=new ResizeObserver(update);ro.observe(el);if(cardRef.current)ro.observe(cardRef.current);
    return ()=>ro.disconnect();
  },[walking,picker,mapPicking,info,selected,planning,route]);

  const list=searchPlaces(query,group), notes=selected && (buildingNotes?.[selected.id] || selected);
  const vars={"--cx-bg":T.bg2,"--cx-bd":T.bdL,"--cx-tx":T.tx,"--cx-txh":T.txH,"--cx-txd":T.txD,"--cx-accent":T.accent,"--cx-tint":`${T.accent}1f`,
    ...(sideBottom!=null?{"--cx-side-bottom":`${sideBottom}px`}:{})};
  const sel=inv?.slots[inv.sel];
  return <section ref={root} className={`${styles.map}${full?" "+styles.full:""}${rot?" "+styles.rot:""}`} aria-label={name+" 学内マップ"} data-mode={walking?"walk":mode} style={vars}>
    <div ref={host} className={styles.scene} style={{visibility:mode==="3D"?"visible":"hidden"}}/>
    <div style={{position:"absolute",inset:0,visibility:mode==="2D"?"visible":"hidden"}}><PlanMap ref={plan} selected={selected} route={route} onPick={pick}/></div>
    {!ready && mode==="3D" && <div role="status" className={styles.loading}>{name}を描画中…</div>}
    {!walking && <>
      {!picker && <button type="button" className={styles.searchBar} onClick={()=>openPicker("search")}><Icon name="search"/><span>{t("navi.searchAny")}</span></button>}
      {picker && <div className={styles.picker} role="dialog" aria-label={picker==="search"?"施設検索":picker==="origin"?"出発地の選択":"目的地の選択"}>
        <div className={styles.row}><b>{picker==="search"?"施設を探す":picker==="origin"?"出発地を選ぶ":"目的地を選ぶ"}</b><IconButton name="close" label="検索を閉じる" onClick={()=>setPicker(null)}/></div>
        <input ref={searchInput} aria-label="棟番号・施設名" placeholder={searchHint} value={query} onChange={e=>setQuery(e.target.value)}
          onKeyDown={e=>{if(e.key==="Escape")setPicker(null);if(e.key==="Enter"&&list[0])picker==="search"?(setPlanning(false),select(list[0])):assign(list[0],picker);}}/>
        <div className={styles.row}><select aria-label="地区で絞り込み" value={group} onChange={e=>setGroup(e.target.value)}><option value="">全地区・屋外施設</option>{groups.map(g=><option key={g}>{g}</option>)}</select>
          {picker!=="search" && <button type="button" className={styles.btn} onClick={()=>{setMapPicking(picker);setPicker(null);}}>地図で指定</button>}</div>
        <div className={styles.results}>{list.map(p=><button key={p.id} onClick={()=>picker==="search"?(setPlanning(false),select(p)):assign(p,picker)}><span>{p.name}</span><small>{p.group}</small></button>)}
          {!list.length&&<p>一致する施設がありません。</p>}</div>
      </div>}
      {mapPicking && <div className={styles.notice}>{mapPicking==="origin"?"出発地":"目的地"}にする建物か通路をタップ<button onClick={()=>setMapPicking(null)}>取消</button></div>}
      {!picker && !mapPicking && !info && <div ref={cardRef} className={styles.card}>
        {planning ? <>
          <div className={styles.row}><h3>徒歩ルート</h3><IconButton name="close" label="ルートを閉じる" onClick={()=>{setPlanning(false);setGuide(null);}}/></div>
          <button className={styles.endpoint} onClick={()=>openPicker("origin")}><small>出発地</small>{origin?.name||"選択"}</button>
          <button className={styles.endpoint} onClick={()=>openPicker("destination")}><small>目的地</small>{dest?.name||"選択"}</button>
          <label className={styles.check}><input type="checkbox" checked={avoid} onChange={e=>setAvoid(e.target.checked)}/>階段を避ける</label>
          {route && <><div className={styles.row}><b>約{Math.ceil(route.length/80)}分 <small>・ {Math.round(route.length)} m</small></b>
            {!unavailable && route.length>0 && <button className={`${styles.btn} ${styles.primary}`} onClick={()=>startWalk(origin,true)}><Icon name="walk"/>ルートを歩く</button>}</div>
            <details className={styles.directions}><summary>道順・到着地点</summary><ol>{routeDirections(route).map((d,i)=><li key={i}>{d.action} · 約{Math.round(d.length)} m</li>)}</ol>{dest.arrival||dest.name+"付近の通路"}に到着</details></>}
          {dest && origin && !route && <p role="status">この条件でつながる屋外通路がありません。</p>}
        </> : selected ? <>
          <div className={styles.row}><small>{selected.group}</small><IconButton name="close" label="施設詳細を閉じる" onClick={reset}/></div>
          <h3>{selected.name}</h3>
          {notes?.detail && <p>{notes.detail}</p>}
          {notes?.source && <a className={styles.sourceLink} href={notes.source} target="_blank" rel="noreferrer">大学の施設案内 ↗</a>}
          {selected.locationEstimate && <p>表示位置は大学資料をもとにした概略です。</p>}
          <div className={styles.actions}>{!unavailable&&<button className={`${styles.btn} ${styles.primary}`} onClick={()=>startWalk(selected)}><Icon name="walk"/>{selected.footprint?"地上から外観を見る":"ここから歩く"}</button>}
            <button className={styles.btn} onClick={openRoutes}><Icon name="route"/>ここへ行く</button></div>
        </> : <>
          <div className={styles.row}><h3>{campus.mapTitle||"主な施設"}</h3><button className={styles.btn} onClick={openRoutes}><Icon name="route"/>{t("cx.routes")}</button></div>
          <div className={styles.stops}>{overviewStops.map(p=><button key={p.id} onClick={()=>select(p)}>{p.mapLabel}</button>)}</div>
        </>}
      </div>}
      {/* 右下のボタン（大岡山と同じ：名前つきのカード・歩いて見る・＋−。北がずれているときだけ方位） */}
      {!picker && <div className={styles.side}>
        {rotated && mode==="3D" && <button type="button" className={styles.compass} title={t("navi.northUp")} aria-label={t("navi.northUp")} onClick={()=>scene.current?.northUp()}>
          <svg viewBox="0 0 16 22" width="16" height="22" aria-hidden="true" style={{transform:"rotate(var(--north,0rad))"}}><polygon points="8,1 13,11 3,11" fill="#e5534b"/><polygon points="8,21 13,11 3,11" fill="#8a97a3"/></svg>
        </button>}
        {toLocal && <div className={styles.tileCard}><button type="button" className={styles.tile} aria-pressed={!!gps} title={t("navi.locateMe")} onClick={locate}><Icon name="locate" size={20}/><span>{t("navi.tileLocate")}</span></button></div>}
        <div className={styles.tileCard}>
          {!unavailable && <button type="button" className={styles.tile} aria-pressed={mode==="3D"} title={t("navi.view3d")} onClick={toggleMode}><Icon name="cube" size={20}/><span>3D</span></button>}
          <button type="button" className={styles.tile} title="キャンパス全景" onClick={reset}><Icon name="fit" size={20}/><span>{t("cx.tileFit")}</span></button>
        </div>
        {!unavailable && <button type="button" className={styles.walkPill} aria-label={t("navi.stroll")} title={t("navi.stroll")} onClick={()=>startWalk(selected||null)}><Icon name="walk" size={20}/>{t("navi.stroll")}</button>}
        <div className={styles.zoom}><button type="button" aria-label={t("pdf.zoomIn")} onClick={()=>currentMap()?.zoom(.76)}>+</button><button type="button" aria-label={t("pdf.zoomOut")} onClick={()=>currentMap()?.zoom(1.32)}>−</button></div>
      </div>}
    </>}
    {walking && <div className={styles.walkUi} data-kit={inv&&kitOpen?"1":undefined}>
      <div className={styles.cross}/>
      {hint && <div className={styles.walkHint}>{touch?t("cx.hintTouch"):locked?t("navi.strollHintLocked"):t("cx.hintKeys")}</div>}
      {guideInfo && !phoneOpen && <div className={styles.guideTag}>{guideInfo}</div>}
      {!phoneOpen && <button type="button" className={styles.phoneBtn} title={t("phone.launcher")} onClick={()=>setPhoneOpen(true)}><Icon name="phone"/>{t("phone.launcher")}{!touch&&<kbd>P</kbd>}</button>}
      {phoneOpen && <div className={styles.phone} role="dialog" aria-label={t("phone.launcher")}>
        <div className={styles.row}><h3>{t("phone.launcher")}</h3><IconButton name="close" label={t("navi.walkClose")} onClick={()=>setPhoneOpen(false)}/></div>
        {guide && <div className={styles.row}><small>{guideInfo||guide.name}</small><button type="button" className={styles.btn} onClick={stopGuide}>{t("cx.stopGuide")}</button></div>}
        <input autoFocus aria-label={t("cx.phoneSearch")} placeholder={t("cx.phoneSearch")} value={phoneQuery} onChange={e=>setPhoneQuery(e.target.value)}
          onKeyDown={e=>{if(e.key==="Escape"){e.stopPropagation();setPhoneOpen(false);}if(e.key==="Enter"&&phoneList[0])guideTo(phoneList[0]);}}/>
        <div className={styles.results}>{phoneList.map(p=><button key={p.id} onClick={()=>guideTo(p)}><span>{p.name}</span><small>{p.group}</small></button>)}
          {!phoneList.length&&<p>一致する施設がありません。</p>}</div>
      </div>}
      {touch && <Joystick rot={rot} onMove={(x,y)=>scene.current?.move(x,y)}/>}
      <div className={styles.walkBtns}>
        {inv && kitOpen && sel?.id!=="phone" && itemUseLabel(inv) && <button type="button" className={styles.use} onClick={applyItem}>{itemUseLabel(inv)}</button>}
        {touch && <button type="button" className={styles.jump} onPointerDown={()=>scene.current?.jump?.()}>{t("navi.strollJump")}</button>}
        <button type="button" className={walkMenu?styles.on:""} aria-haspopup="menu" aria-expanded={walkMenu} onClick={()=>setWalkMenu(v=>!v)}>{t("navi.walkMenu")}</button>
        {touch && <button type="button" className={run?styles.on:""} aria-pressed={run} onClick={toggleRun}>{t("navi.strollRun")}</button>}
        <button type="button" className={styles.exit} onClick={stopWalk}>{t("navi.strollStop")}</button>
      </div>
      {walkMenu && <div className={styles.wmenuBack} onClick={()=>setWalkMenu(false)}/>}
      {walkMenu && <div className={styles.wmenu} role="menu" aria-label={t("navi.walkMenu")}>
        {inv && <button type="button" role="menuitem" onClick={()=>{setKit(!kitOpen);setWalkMenu(false);}}>{t(kitOpen?"navi.walkKitHide":"navi.walkKitShow")}</button>}
        {gps && <button type="button" role="menuitem" onClick={()=>{const y=pose?.[2]||0;setWalkMenu(false);walkTo({start:gps,toward:[gps[0]+Math.sin(y),gps[1]-Math.cos(y)],pitch:0});}}>{t("navi.walkToGps")}</button>}
        {route?.points.length>1 && <button type="button" role="menuitem" onClick={()=>{setWalkMenu(false);walkTo({start:route.points[0],toward:route.points.find(q=>distance(q,route.points[0])>3)||route.points.at(-1),pitch:0});}}>{t("navi.walkToRoute")}</button>}
        <select aria-label={t("cx.walkToPlace")} value="" onChange={e=>{const p=byId.get(e.target.value);setWalkMenu(false);if(p)walkTo(exteriorView(p));}}>
          <option value="" disabled>{t("cx.walkToPlace")}</option>
          {places.filter(p=>!p.auxiliary).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button type="button" role="menuitem" onClick={()=>{setWalkMenu(false);setHint(true);}}>{t("navi.walkHelp")}</button>
        <button type="button" className={styles.close} onClick={()=>setWalkMenu(false)}>{t("navi.walkClose")}</button>
      </div>}
      <MapInventory inv={inv} bar={kitOpen} touch={touch} menu={invMenu} toast={invToast} accent={T.accent}
        onSelect={i=>selectSlot(i,true)} onUse={applyItem} onCloseMenu={closeInvMenu} onBuy={()=>{}} onCharge={()=>{}}
        onRename={nm=>updateInv(x=>{x.name=nm;})} miniMap={<WalkMinimap pose={pose} route={route}/>}/>
    </div>}
    {message && !walking && !picker && <div className={styles.notice} role="status">{message}<button aria-label="通知を閉じる" onClick={()=>setMessage("")}>×</button></div>}
    {info&&<div className={styles.info} role="dialog" aria-label="地図の出典"><div className={styles.row}><h3>地図の出典</h3><IconButton name="close" label="出典を閉じる" onClick={()=>setInfo(false)}/></div>
      <p>{campus.sourceNote||"建物の配置・外観は大学資料と公開地図を照合しています。窓割りの一部、植栽、入口付近の細部には推定が含まれます。"}</p>
      {sources.map(([label,url])=><a key={url} href={url} target="_blank" rel="noreferrer">{label}</a>)}
    </div>}
    <div className={styles.credit}><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a> · {credit} <button onClick={()=>setInfo(v=>!v)}>出典</button></div>
  </section>;
}
