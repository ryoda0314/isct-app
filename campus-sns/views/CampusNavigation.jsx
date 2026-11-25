import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { T } from "../theme.js";
import { getLang } from "../i18n.js";
import { NavigationView } from "./NavigationView.jsx";

const mapLoading = () => <div role="status" style={{padding:20,color:T.tx}}>地図を読み込み中…</div>;
const YokohamaMap = dynamic(() => import("../yokohama/YokohamaMap.jsx"), {ssr:false,loading:mapLoading});
const YushimaMap = dynamic(() => import("../yushima/YushimaMap.jsx"), {ssr:false,loading:mapLoading});
const campuses = [
  ["ookayama","大岡山キャンパス","Ookayama Campus"],
  ["yokohama","横浜キャンパス","Yokohama Campus"],
  ["yushima","湯島キャンパス","Yushima Campus"],
];
const campusFromLink = () => campuses.find(([id])=>typeof window!=="undefined" && location.hash==="#navi/"+id)?.[0] || "ookayama";

export function CampusNavigation(props) {
  const [campus, setCampus] = useState(() => props.initialDest || props.initialOrig ? "ookayama" : campusFromLink());
  useEffect(() => {
    const onHash = () => setCampus(campusFromLink());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    if (props.initialDest || props.initialOrig) setCampus("ookayama");
  }, [props.initialDest, props.initialOrig]);
  const en = getLang() === "en";
  function choose(id) {
    if (id === campus) return;
    history.replaceState(history.state, "", id === "ookayama" ? "#navi" : "#navi/"+id);
    setCampus(id);
  }
  return <div style={{display:"flex",flexDirection:"column",flex:1,minWidth:0,minHeight:0,overflow:"hidden"}}>
    <nav aria-label={en ? "Campus" : "キャンパス選択"} style={{display:"flex",alignItems:"center",gap:3,padding:"5px 8px",background:T.bg2,borderBottom:`1px solid ${T.bd}`,flexShrink:0,overflowX:"auto"}}>
      {campuses.map(([id,ja,label]) => <button key={id} type="button" aria-pressed={campus===id} onClick={()=>choose(id)}
        style={{background:campus===id ? T.bg3 : "transparent",color:campus===id ? T.txH : T.tx,border:0,borderRadius:7,padding:"6px 8px",font:"inherit",fontSize:12,fontWeight:campus===id ? 750 : 500,cursor:"pointer",whiteSpace:"nowrap"}}>
        {en ? label : ja}
      </button>)}
    </nav>
    {campus === "yushima" ? <YushimaMap/> : campus === "yokohama" ? <YokohamaMap/> : <NavigationView {...props}/>}
  </div>;
}
