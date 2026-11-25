import { forwardRef,useImperativeHandle,useRef,useState } from "react";
import { boundsOf } from "../yokohama/navigation.js";

const fill={wood:"#b4c9ab",water:"#91bdc9",pitch:"#c6c6a6",parking:"#d0d2c8",plaza:"#ddd4c5",lawn:"#cbd8b8",garden:"#b7cda2"};
const points=ring=>ring.map(p=>p.join(",")).join(" ");
export function createPlanMaps({name,buildings,areas,paths,campusBounds,places,district,contextPlan,groundColor="#e2e6d8",labelZoom=360}) {
  const home={center:campusBounds.center,span:Math.max(campusBounds.width,campusBounds.depth)*1.15};
  const planBuildings=buildings.map(b=><polygon key={b.id} points={points(b.footprint)} fill={district[b.district]||"#a9b6a4"} stroke="#89988a" strokeWidth="1"/>);
  const planPaths=paths.filter(p=>p.walkable!==false).map(p=><polyline key={p.id} points={points(p.points)} fill="none" stroke="#f9f4e8" strokeWidth={p.width+1}/>);
  const planAreas=areas.map(a=><polygon key={a.id} points={points(a.polygon)} fill={fill[a.kind]||"#d3ddc5"}/>);
  function WalkMinimap({pose,route}) {
    if(!pose)return null;
    const [x,z,yaw]=pose;
    return <svg className="yh-mini" role="img" aria-label="構内の現在位置・北が上" viewBox={[x-60,z-60,120,120].join(" ")}>
      <rect x={x-60} y={z-60} width="120" height="120" fill={groundColor}/>
      {planAreas}{planPaths}{planBuildings}
      {route&&<polyline points={points(route.points)} fill="none" stroke="#137fa6" strokeWidth="2.6"/>}
      <path data-walk-position="" transform={`translate(${x} ${z}) rotate(${yaw*180/Math.PI})`} d="M0 -8 5 6 0 4 -5 6Z" fill="#15594a" stroke="white" strokeWidth="1.6"/>
      <text x={x+47} y={z-42} fontWeight="700" fontSize="12" fill="#345047">N</text>
    </svg>;
  }
  const PlanMap=forwardRef(function PlanMap({selected,route,onPick},ref) {
    const [view,setView]=useState(home), svg=useRef(null),drag=useRef(null),suppress=useRef(false);
    const coordinates=e=>{
      const p=svg.current.createSVGPoint();p.x=e.clientX;p.y=e.clientY;
      const local=p.matrixTransform(svg.current.getScreenCTM().inverse());return [local.x,local.y];
    };
    const zoom=f=>setView(v=>({...v,span:Math.min(home.span*1.8,Math.max(70,v.span*f))}));
    function fitRoute(route) {
      if(!route?.points.length)return;
      const box=boundsOf(route.points),rect=svg.current.getBoundingClientRect();
      const dim=Math.min(rect.width,rect.height);
      const bottom=Math.min(215,rect.height*.32), top=56;
      const scale=Math.max(.13,Math.min((rect.width-84)/Math.max(45,box.width),(rect.height-bottom-top)/Math.max(45,box.depth))*.91);
      setView({center:[box.center[0],box.center[1]+(bottom-top)/2/scale],span:dim/scale});
    }
    useImperativeHandle(ref,()=>({zoom,fitRoute,fit:()=>setView(home),focus:p=>p && setView({center:p.point,span:p.footprint ? Math.max(140,boundsOf(p.footprint).width*3) : 175})}),[]);
    return <svg className="yh-plan" ref={svg} role="img" aria-label={name+"平面図"} viewBox={[view.center[0]-view.span/2,view.center[1]-view.span/2,view.span,view.span].join(" ")}
      onWheel={e=>zoom(e.deltaY>0?1.16:.86)} onPointerDown={e=>{
        if(!e.isPrimary)return;drag.current={x:e.clientX,y:e.clientY,center:view.center,scale:svg.current.getScreenCTM().a};suppress.current=false;
      }} onPointerMove={e=>{
        const d=drag.current;if(!d)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;
        if(Math.hypot(dx,dy)<4 && !suppress.current)return;
        suppress.current=true;svg.current.setPointerCapture(e.pointerId);
        setView(v=>({...v,center:[d.center[0]-dx/d.scale,d.center[1]-dy/d.scale]}));
      }} onPointerCancel={()=>{drag.current=null;suppress.current=true;}} onPointerUp={()=>{drag.current=null;}}
      onClick={e=>{if(suppress.current)return;const id=e.target.closest("[data-place]")?.dataset.place;onPick(id?{id}:{point:coordinates(e)});}}>
      <rect x="-4000" y="-4000" width="8000" height="8000" fill={groundColor}/>
      {contextPlan}
      {planAreas}
      {paths.map(p=><polyline key={p.id} points={points(p.points)} fill="none" stroke={p.kind==="road"?"#f8f6ed":p.kind==="stairs"?"#b29c84":"#f3ecdc"} strokeWidth={p.width} strokeLinecap="round" strokeLinejoin="round"/>)}
      {buildings.map(b=><polygon key={b.id} data-place={b.id} points={points(b.footprint)} fill={selected?.id===b.id?"#db965e":district[b.district]||"#bfbfb2"} stroke="#747e77" strokeWidth=".8"/>)}
      {route?.points.length>1 && <polyline points={points(route.points)} fill="none" stroke="#117baa" strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round"/>}
      {places.filter(p=>p.featured || p.id===selected?.id || view.span<labelZoom).map(p=><g key={p.id} data-place={p.id} transform={`translate(${p.point.join(" ")})`} style={{cursor:"pointer"}}>
        {!p.district&&<circle r="3.8" fill="#386451" stroke="white"/>}
        <text y={p.district?1:-7} textAnchor="middle" dominantBaseline="middle" fontWeight="700" fontSize={Math.max(3,view.span/64)} style={{paintOrder:"stroke",stroke:"#f5f5ec",strokeWidth:2,fill:"#344e47"}}>{p.mapLabel}</text>
      </g>)}
      {selected?.id==="map-point" && <circle cx={selected.point[0]} cy={selected.point[1]} r="4" fill="#e27740" stroke="white"/>}
    </svg>;
  });
  return {PlanMap,WalkMinimap};
}
