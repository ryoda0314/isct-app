// キャンパスロワイヤルの表示（docs/campus-royale-spec.md の 7.5 章。2026-11-25「まだ安っぽいゲーム感が強い」で作り直し）。
// VirtualCampusView が CampusMap3D の walkOverlay として渡す（歩く画面の箱の中に描かれるので、スマホで回して描くときも一緒に回る）。
// 状態は game（campus3dRoyale.js）が onUi で知らせるもの（ui）。よく変わるもの（方位の帯・円の秒・十字の広がり・ミニマップ・赤いふち・
// 命中の印・ダメージの数字・撃たれた向き）は game が DOM に直接書く（attach で渡す）。
// 見た目：半透明の暗い面に細い線、数字は等幅、記号（SVG）で見せる。グラデーション・左の色帯・きらきらの飾りは使わない。
import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "../i18n.js";
import { PEER_PHRASES } from "../campus3dPeers.js";
import { AMMO_CAP, HEALS, HEAL_KINDS, WEAPONS } from "../campus3dRoyaleRules.js";
import { BLASTER } from "../campus3dRoyaleModels.js";
const COMPASS_PX = 2.4; // 方位の帯：1 度あたりの px（game は要素の data-px を読む）

const CSS = `
.roy{position:absolute;inset:0;pointer-events:none;font-family:inherit;color:#fff;z-index:4;font-variant-numeric:tabular-nums}
.roy button{font-family:inherit}
.roy-vig{position:absolute;inset:0;opacity:0;box-shadow:inset 0 0 90px 30px rgba(214,40,52,.85);transition:opacity .15s}
.roy-vig[data-zone="1"]{box-shadow:inset 0 0 110px 44px rgba(70,90,230,.75)}
.roy-panel{background:rgba(10,15,21,.62);border:1px solid rgba(255,255,255,.13);border-radius:10px;backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}
.roy-top{position:absolute;left:50%;top:calc(8px + var(--cb3-st,env(safe-area-inset-top,0px)));transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:5px}
.roy-compass{position:relative;width:min(420px,52vw);height:24px;overflow:hidden;border-radius:7px}
.roy-strip{position:absolute;left:50%;top:0;height:100%;will-change:transform}
.roy-strip span{position:absolute;top:3px;transform:translateX(-50%);font-size:10px;font-weight:700;color:rgba(255,255,255,.62);white-space:nowrap}
.roy-strip span.c{font-size:12px;font-weight:900;color:#fff;top:2px}
.roy-strip span:after{content:"";position:absolute;left:50%;top:15px;width:1px;height:5px;background:rgba(255,255,255,.45)}
.roy-needle{position:absolute;left:50%;bottom:0;width:0;height:0;margin-left:-5px;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:6px solid #fff}
.roy-hdg{position:absolute;right:6px;top:4px;font-size:10px;font-weight:800;color:rgba(255,255,255,.7)}
.roy-chips{display:flex;gap:5px}
.roy-chip{height:26px;padding:0 10px;display:flex;align-items:center;gap:6px;font-size:13px;font-weight:800;white-space:nowrap}
.roy-chip svg{width:14px;height:14px;opacity:.85}
.roy-chip b:empty{display:none}
.roy-mini{position:absolute;left:calc(12px + var(--cb3-sl,env(safe-area-inset-left,0px)));top:calc(10px + var(--cb3-st,env(safe-area-inset-top,0px)));width:var(--roy-map,148px);height:var(--roy-map,148px);border-radius:50%;pointer-events:auto;cursor:pointer;touch-action:none;box-shadow:0 0 0 2px rgba(10,15,21,.7),0 0 0 3px rgba(255,255,255,.18)}
.roy-mini canvas,.roy-big canvas{width:100%;height:100%;display:block;border-radius:inherit}
.roy-big{position:absolute;inset:0;display:grid;place-items:center;background:rgba(6,10,14,.55);pointer-events:auto;z-index:20}
.roy-big>div{width:min(86%,86vh,640px);aspect-ratio:1;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,.2)}
.roy-feed{position:absolute;right:calc(12px + var(--cb3-sr,env(safe-area-inset-right,0px)));top:calc(56px + var(--cb3-st,env(safe-area-inset-top,0px)));display:flex;flex-direction:column;align-items:flex-end;gap:4px;max-width:46%}
.roy-feed div{display:flex;align-items:center;gap:7px;padding:4px 10px;font-size:12px;font-weight:800;white-space:nowrap;max-width:100%;animation:royfeed .25s ease-out}
.roy-feed svg{width:24px;height:12px;flex:none;opacity:.9}
.roy-feed em{font-style:normal;overflow:hidden;text-overflow:ellipsis}
@keyframes royfeed{from{opacity:0;transform:translateX(14px)}to{opacity:1;transform:none}}
.roy-cross{position:absolute;left:50%;top:50%;width:0;height:0;--gap:4px}
.roy-cross i{position:absolute;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.45);transition:transform .05s linear}
.roy-cross i:nth-child(1){left:-1px;top:calc(-1 * var(--gap) - 9px);width:2px;height:8px}
.roy-cross i:nth-child(2){left:-1px;top:var(--gap);width:2px;height:8px}
.roy-cross i:nth-child(3){top:-1px;left:calc(-1 * var(--gap) - 9px);width:8px;height:2px}
.roy-cross i:nth-child(4){top:-1px;left:var(--gap);width:8px;height:2px}
.roy-cross b{position:absolute;left:-1px;top:-1px;width:2px;height:2px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.4)}
.roy-cross.ads i{opacity:.25}
.roy-hm{position:absolute;left:0;top:0;opacity:0}
.roy-hm u{position:absolute;width:9px;height:2px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.5);left:-4.5px;top:-1px}
.roy-hm u:nth-child(1){transform:rotate(45deg) translateX(-10px)}.roy-hm u:nth-child(2){transform:rotate(-45deg) translateX(-10px)}
.roy-hm u:nth-child(3){transform:rotate(45deg) translateX(10px)}.roy-hm u:nth-child(4){transform:rotate(-45deg) translateX(10px)}
.roy-cross.hit .roy-hm,.roy-cross.head .roy-hm{animation:royhm .22s ease-out}
.roy-cross.head .roy-hm u{background:#ffd84a}
@keyframes royhm{0%{opacity:1;transform:scale(1.35)}100%{opacity:0;transform:scale(1)}}
.roy-ring{position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;transform:rotate(-90deg)}
.roy-ring circle{fill:none;stroke-width:3}
.roy-ring .bg{stroke:rgba(255,255,255,.18)}
.roy-ring .fg{stroke:#fff;stroke-dasharray:132;stroke-dashoffset:132;animation:royring linear forwards}
@keyframes royring{to{stroke-dashoffset:0}}
.roy-dmg{position:absolute;left:50%;top:calc(50% + 26px);transform:translateX(-50%);font-size:11px;font-weight:900;letter-spacing:.06em;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.8);opacity:0}
.roy-dmg.on{animation:roydmg .6s ease-out}
@keyframes roydmg{0%{opacity:1}100%{opacity:0}}
.roy-pops{position:absolute;inset:0;overflow:hidden}
.roy-pop{position:absolute;left:0;top:0;display:none;font-size:17px;font-weight:900;color:#fff;-webkit-text-stroke:0;text-shadow:0 0 3px rgba(0,0,0,.9),0 2px 6px rgba(0,0,0,.6);animation:roypop .95s ease-out forwards;will-change:transform}
.roy-pop.sh{color:#9fd0ff}.roy-pop.head{color:#ffd84a;font-size:21px}.roy-pop.broke{color:#5fb2ff;font-size:20px}
@keyframes roypop{0%{opacity:0;font-size:12px}12%{opacity:1;font-size:22px}30%{font-size:inherit}75%{opacity:1}100%{opacity:0}}
.roy-dirs{position:absolute;left:50%;top:50%;width:0;height:0}
.roy-dirs i{position:absolute;left:-60px;top:-60px;width:120px;height:120px;border-radius:50%;border:4px solid transparent;border-top-color:rgba(255,64,64,.9);opacity:0;transition:opacity .2s}
.roy-scope{position:absolute;left:50%;top:50%;width:min(70%,70vh);aspect-ratio:1;transform:translate(-50%,-50%);border-radius:50%;box-shadow:0 0 0 200vmax rgba(4,8,11,.9);border:3px solid #050709}
.roy-scope:before,.roy-scope:after{content:"";position:absolute;background:rgba(0,0,0,.8)}
.roy-scope:before{left:50%;top:0;bottom:0;width:1px}.roy-scope:after{top:50%;left:0;right:0;height:1px}
.roy-scope i{position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:#ff4d4d}
.roy-ann{position:absolute;left:50%;top:21%;transform:translateX(-50%);text-align:center;white-space:nowrap;animation:royann 3.4s ease forwards}
.roy-ann b{display:block;font-size:30px;font-weight:900;letter-spacing:.1em;text-shadow:0 2px 14px rgba(0,0,0,.55)}
.roy-ann span{display:block;margin-top:5px;font-size:13px;font-weight:700;color:rgba(255,255,255,.88);text-shadow:0 1px 6px rgba(0,0,0,.6)}
.roy-ann hr{width:0;height:2px;margin:7px auto 0;border:none;background:var(--roy-accent,#28c868);animation:royline .5s .1s ease-out forwards}
.roy-ann.kill b{color:#ffd84a}.roy-ann.kill hr{background:#ffd84a}
.roy-ann.out b{color:#ff6b6b}.roy-ann.out hr{background:#ff6b6b}
.roy-ann.zone b{color:#9fd0ff}.roy-ann.zone hr{background:#9fd0ff}
.roy-ann.win b{font-size:54px}
@keyframes royann{0%{opacity:0;transform:translate(-50%,8px)}7%{opacity:1;transform:translate(-50%,0)}82%{opacity:1}100%{opacity:0}}
@keyframes royline{to{width:120px}}
.roy-hp{position:absolute;left:calc(14px + var(--cb3-sl,env(safe-area-inset-left,0px)));bottom:calc(14px + var(--cb3-sb,env(safe-area-inset-bottom,0px)));width:260px;padding:9px 11px 10px;display:flex;flex-direction:column;gap:5px}
.roy-hp .row{display:flex;align-items:center;gap:8px}
.roy-hp .row b{min-width:30px;text-align:right;font-size:15px;font-weight:900}
.roy-hp svg{width:15px;height:15px;flex:none}
.roy-seg{flex:1;display:flex;gap:3px;height:8px}
.roy-seg span{flex:1;background:rgba(255,255,255,.14);border-radius:2px;overflow:hidden;position:relative}
.roy-seg span i{position:absolute;left:0;top:0;bottom:0;background:#4da3ff;transition:width .2s}
.roy-bar{flex:1;height:12px;border-radius:3px;background:rgba(255,255,255,.14);overflow:hidden;position:relative}
.roy-bar i{position:absolute;left:0;top:0;bottom:0;background:#f3f5f7;transition:width .2s}
.roy-bar.low i{background:#ff5a5a}
.roy-hp .helm{position:absolute;right:9px;top:-22px;display:flex;align-items:center;gap:4px;font-size:11px;font-weight:800;padding:2px 8px}
.roy-wpn{position:absolute;right:calc(14px + var(--cb3-sr,env(safe-area-inset-right,0px)));bottom:calc(14px + var(--cb3-sb,env(safe-area-inset-bottom,0px)));width:236px;padding:9px 11px 9px;pointer-events:auto}
.roy-wpn .name{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:800;color:rgba(255,255,255,.85)}
.roy-wpn .name i{width:3px;height:13px;border-radius:2px}
.roy-wpn .ammo{display:flex;align-items:baseline;gap:6px;margin:1px 0 6px}
.roy-wpn .ammo b{font-size:34px;line-height:1;font-weight:900}
.roy-wpn .ammo span{font-size:14px;font-weight:800;color:rgba(255,255,255,.55)}
.roy-wpn .ammo b.empty{color:#ff6b6b}
.roy-slots{display:flex;gap:5px}
.roy-slots button{flex:1;min-width:0;height:30px;padding:0 6px;border-radius:7px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fff;display:flex;align-items:center;gap:5px;cursor:pointer}
.roy-slots button.on{border-color:var(--roy-accent,#28c868);background:rgba(255,255,255,.12)}
.roy-slots button:disabled{opacity:.35;cursor:default}
.roy-slots small{font-size:10px;font-weight:800;color:rgba(255,255,255,.55)}
.roy-slots svg{width:30px;height:14px;flex:none}
.roy-mid{position:absolute;left:50%;bottom:calc(14px + var(--cb3-sb,env(safe-area-inset-bottom,0px)));transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:7px}
.roy-heals{display:flex;gap:5px;padding:5px;pointer-events:auto}
.roy-heal{position:relative;width:46px;height:40px;border-radius:7px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:#fff;cursor:pointer;display:grid;place-items:center;padding:0}
.roy-heal svg{width:18px;height:18px}
.roy-heal em{position:absolute;right:4px;bottom:2px;font-style:normal;font-size:11px;font-weight:900}
.roy-heal small{position:absolute;left:4px;top:2px;font-size:9px;font-weight:800;color:rgba(255,255,255,.5)}
.roy-heal:disabled{opacity:.32;cursor:default}
.roy-note{padding:5px 12px;font-size:12px;font-weight:800;white-space:nowrap}
.roy-note kbd{display:inline-block;min-width:16px;padding:0 4px;margin-right:6px;border-radius:4px;border:1px solid rgba(255,255,255,.4);font:inherit;font-size:11px;text-align:center}
.roy-swap{pointer-events:auto;height:36px;padding:0 15px;border-radius:9px;border:1px solid rgba(255,255,255,.3);background:rgba(10,15,21,.75);color:#fff;font-size:13px;font-weight:800}
.roy-card{position:absolute;left:50%;transform:translateX(-50%);top:calc(48px + var(--cb3-st,env(safe-area-inset-top,0px)));width:min(400px,calc(100% - 32px));max-height:calc(100% - 110px);overflow:auto;box-sizing:border-box;padding:14px 16px;pointer-events:auto;font-size:12.5px;line-height:1.55}
.roy-card h3{margin:0 0 3px;font-size:17px;font-weight:900;letter-spacing:.06em;display:flex;align-items:center;gap:8px}
.roy-card h3 small{font-size:11px;font-weight:800;padding:1px 7px;border-radius:5px;border:1px solid rgba(255,255,255,.3);letter-spacing:0}
.roy-card p{margin:3px 0;color:rgba(255,255,255,.7);font-size:12px}
.roy-card .roy-btns{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.roy-card button{height:36px;padding:0 14px;border-radius:9px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.06);color:#fff;font-size:13px;font-weight:800;cursor:pointer}
.roy-card button.pri{background:var(--roy-accent,#28c868);border-color:transparent;color:#fff;min-width:120px}
.roy-card button:disabled{opacity:.45;cursor:default}
.roy-ppl{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:5px;margin:9px 0 3px}
.roy-ppl span{display:flex;align-items:center;gap:7px;padding:5px 8px;border-radius:7px;background:rgba(255,255,255,.06);font-size:12px;font-weight:800;overflow:hidden}
.roy-ppl span i{width:9px;height:9px;border-radius:50%;flex:none;background:var(--c,#6870e0)}
.roy-ppl span em{font-style:normal;margin-left:auto;font-size:10.5px;color:rgba(255,255,255,.45)}
.roy-ppl span.ok em{color:#5ee08f}
.roy-card table{width:100%;border-collapse:collapse;margin-top:8px;font-size:12.5px}
.roy-card td,.roy-card th{padding:5px 4px;border-bottom:1px solid rgba(255,255,255,.1);text-align:left}
.roy-card th{color:rgba(255,255,255,.5);font-weight:700;font-size:11px}
.roy-card tr.me td{font-weight:900;color:var(--roy-accent-l,#7ff0a8)}
.roy-card td:first-child{width:40px;font-weight:900}
.roy-room{display:flex;gap:6px;margin-top:9px}
.roy-room input{flex:1;min-width:0;height:34px;border-radius:8px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.06);color:#fff;padding:0 9px;font-size:12.5px;font-family:inherit}
.roy-room input::placeholder{color:rgba(255,255,255,.4)}
.roy-count{font-size:64px;font-weight:900;line-height:1;margin:6px 0 2px;text-align:center}
.roy-drop{pointer-events:auto;height:48px;padding:0 28px;border-radius:12px;border:none;background:#fff;color:#0b1117;font-size:15px;font-weight:900;letter-spacing:.06em;display:flex;align-items:center;gap:9px}
.roy-drop:disabled{opacity:.5}
.roy-drop kbd{font:inherit;font-size:11px;padding:1px 6px;border-radius:5px;border:1px solid rgba(11,17,23,.35)}
.roy-touch{position:absolute;right:calc(18px + var(--cb3-sr,env(safe-area-inset-right,0px)));bottom:calc(150px + var(--cb3-sb,env(safe-area-inset-bottom,0px)));display:grid;grid-template-columns:auto auto;gap:10px;align-items:end;pointer-events:auto}
.roy-touch button{border:1px solid rgba(255,255,255,.28);border-radius:50%;background:rgba(10,15,21,.5);color:#fff;width:54px;height:54px;padding:0;touch-action:none;user-select:none;-webkit-user-select:none;display:grid;place-items:center}
.roy-touch button svg{width:22px;height:22px}
.roy-touch button.fire{width:86px;height:86px;border:2px solid rgba(255,255,255,.75);background:rgba(10,15,21,.35)}
.roy-touch button.fire svg{width:34px;height:34px}
.roy-touch button.on{background:var(--roy-accent,#28c868);border-color:transparent}
.roy-spec{position:absolute;left:50%;bottom:calc(16px + var(--cb3-sb,env(safe-area-inset-bottom,0px)));transform:translateX(-50%);display:flex;gap:6px;align-items:center;pointer-events:auto;flex-wrap:wrap;justify-content:center;max-width:calc(100% - 32px)}
.roy-spec button{height:36px;padding:0 14px;border-radius:9px;border:1px solid rgba(255,255,255,.25);background:rgba(10,15,21,.6);color:#fff;font-size:12.5px;font-weight:800}
.roy-recap{position:absolute;left:50%;bottom:calc(64px + var(--cb3-sb,env(safe-area-inset-bottom,0px)));transform:translateX(-50%);min-width:260px;padding:11px 16px 12px;text-align:center;animation:royfeed .3s ease-out}
.roy-recap b{display:block;font-size:22px;font-weight:900;letter-spacing:.1em;color:#ff6b6b}
.roy-recap b span{color:#fff;font-size:15px;letter-spacing:0;margin-left:8px}
.roy-recap p{margin:4px 0 0;font-size:12.5px;font-weight:700;color:rgba(255,255,255,.85);display:flex;align-items:center;justify-content:center;gap:6px}
.roy-recap p svg{width:26px;height:13px}
.roy-recap .st{display:flex;justify-content:center;gap:18px;margin-top:8px}
.roy-recap .st div{display:flex;flex-direction:column;font-size:10.5px;color:rgba(255,255,255,.55);font-weight:700}
.roy-recap .st div strong{font-size:19px;color:#fff;font-weight:900}
.roy-outcard{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);text-align:center;pointer-events:none}
.roy-outcard b{display:block;font-size:44px;font-weight:900;letter-spacing:.12em;color:#ff6b6b;text-shadow:0 2px 16px rgba(0,0,0,.6)}
.roy-outcard span{display:block;font-size:15px;font-weight:800;margin-top:4px;text-shadow:0 1px 8px rgba(0,0,0,.7)}
.cb3-walk-ui:has(.roy-wpn.pc) .cb3-walk-btns{bottom:calc(150px + var(--cb3-sb,env(safe-area-inset-bottom,0px)))}
.cb3-full .roy-feed{top:calc(112px + var(--cb3-st,env(safe-area-inset-top,0px)))}
.cb3-full .roy-hp{width:200px;padding:7px 9px}
.cb3-full .roy-mid{bottom:calc(10px + var(--cb3-sb,env(safe-area-inset-bottom,0px)));left:calc(50% - 40px)}
.cb3-full .roy-heal{width:40px;height:36px}
.cb3-full.cb3-rot .roy-touch{bottom:calc(24px + var(--cb3-sb,env(safe-area-inset-bottom,0px)));right:calc(24px + var(--cb3-sr,env(safe-area-inset-right,0px)))}
.cb3-full.cb3-rot .roy-mini{--roy-map:108px}
.cb3-full.cb3-rot .roy-hp{left:calc(150px + var(--cb3-sl,env(safe-area-inset-left,0px)))}
@media (orientation:landscape) and (max-height:540px){
  .cb3-full .roy-touch{bottom:calc(24px + var(--cb3-sb,env(safe-area-inset-bottom,0px)));right:calc(24px + var(--cb3-sr,env(safe-area-inset-right,0px)))}
  .cb3-full .roy-mini{--roy-map:108px}
  .cb3-full .roy-hp{left:calc(150px + var(--cb3-sl,env(safe-area-inset-left,0px)))}
}
@media (max-width:760px){.roy-hp{width:200px}.roy-wpn{width:200px}.roy-compass{width:min(320px,60vw)}}
`;

// ── 記号（SVG） ──
const S = (p, vb = "0 0 16 16") => (props) => <svg viewBox={vb} fill="currentColor" aria-hidden="true" {...props}>{p}</svg>;
const Ico = {
  clock: S(<path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm0 1.6a4.9 4.9 0 1 1 0 9.8 4.9 4.9 0 0 1 0-9.8ZM7.3 4.5v4.1l3 1.8.7-1.2-2.3-1.4V4.5Z" />),
  person: S(<path d="M8 1.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6ZM2.5 14.5c0-3 2.5-5.2 5.5-5.2s5.5 2.2 5.5 5.2Z" />),
  target: S(<path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm0 1.8a5.2 5.2 0 1 1 0 10.4A5.2 5.2 0 0 1 8 2.8Zm0 2.4a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Zm0 1.6a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Z" />),
  shield: S(<path d="M8 1 2.5 3v4.4c0 3.4 2.3 6.2 5.5 7.6 3.2-1.4 5.5-4.2 5.5-7.6V3Z" />),
  heart: S(<path d="M6.6 2h2.8v4.6H14v2.8H9.4V14H6.6V9.4H2V6.6h4.6Z" />),
  helmet: S(<path d="M2.5 11a5.5 5.5 0 0 1 11 0h1.5v1.8H1V11Zm3-5.2V9h1.2V4.6Zm3.8-1.2V9h1.2V5.6Z" />),
  tea: S(<path d="M6.3 1h3.4v2l1.3 1.9V15H5V4.9L6.3 3Zm-.1 6.5v3.8h3.6V7.5Z" />),
  bento: S(<path d="M1.5 5h13v8h-13Zm0-1.8h13V4h-13ZM7.3 5h1.4v8H7.3Z" />),
  coffee: S(<path d="M4.5 2h7v1.2h-7Zm0 1.8h7V14h-7Zm1.3 3v3.5h4.4V6.8Z" />),
  energy: S(<path d="M9.6 1 3.5 9h3.8l-1 6 6.2-8.3H8.6Z" />),
  scope: S(<path d="M7.2 1h1.6v2.6a4.5 4.5 0 0 1 3.6 3.6H15v1.6h-2.6a4.5 4.5 0 0 1-3.6 3.6V15H7.2v-2.6a4.5 4.5 0 0 1-3.6-3.6H1V7.2h2.6a4.5 4.5 0 0 1 3.6-3.6Zm.8 4.2a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />),
  reload: S(<path d="M8 2.2a5.8 5.8 0 0 1 5.1 3l1.4-1V9h-4.7l1.7-1.3A4 4 0 1 0 12 9.7l1.7.6A5.8 5.8 0 1 1 8 2.2Z" />),
  up: S(<path d="M8 2 2.5 8h3.3v6h4.4V8h3.3Z" />),
  fire: S(<path d="M7.2 1h1.6v4H7.2Zm0 10h1.6v4H7.2ZM1 7.2h4v1.6H1Zm10 0h4v1.6h-4ZM8 6.4a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2Z" />),
  map: S(<path d="M1 3.5 5.5 2l5 1.5L15 2v10.5L10.5 14l-5-1.5L1 14Zm4.5 0v8l5 1.5v-8Z" />),
};
// 装備の形（横から）
const W_ICON = {
  fist: <path d="M5 3h9.5a2.5 2.5 0 0 1 2.5 2.5V8a3 3 0 0 1-3 3H8L5 8.5Z" />,
  pistol: <path d="M3 3h15v3.5h-7.3l-1 5.5H6.3l1-5.5H3Z" />,
  smg: <path d="M1 3.5h19v3h-5.5l-.6 2.5v3h-2.3V9H8.4L7 12H4.6L6 9H1Zm19 1h3v1.5h-3Z" />,
  ar: <path d="M1 4h24v2.6h-8.2l-1 1.7v3.2h-2.4V8.6H9.6L7.6 12H5l1.8-3.4H1Zm8-2.5h5V4H9Z" />,
  shotgun: <path d="M1 3.8h25v3.4H10.2l-2.3 4.8H5.2l2-4.8H1Zm12 4.2h7v2h-7Z" />,
  sniper: <path d="M0 5h28v2H18v2.5h-2.2V7H9.5l-2.2 4.8H4.6l2-4.8H0Zm9.5-3.5h8V4h-8Z" />,
};
const WIcon = ({ kind, ...p }) => <svg viewBox="0 0 28 14" fill="currentColor" aria-hidden="true" {...p}>{W_ICON[kind] || W_ICON.fist}</svg>;
const HEAL_ICON = { tea: Ico.tea, bento: Ico.bento, coffee: Ico.coffee, energy: Ico.energy };

const kindName = (k) => (k === "fist" ? t("roy.fist") : WEAPONS[k] ? t(`roy.w.${k}`) : HEALS[k] ? t(`roy.h.${k}`) : k === "helmet" ? t("roy.h.helmet") : AMMO_CAP[k] ? t(`roy.a.${k}`) : k);
const CARD = ["北", "15", "30", "北東", "60", "75", "東", "105", "120", "南東", "150", "165", "南", "195", "210", "南西", "240", "255", "西", "285", "300", "北西", "330", "345"];

export function MapRoyale({ game, ui, accent = "#28c868", onLeave }) {
  const touch = useMemo(() => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches, []);
  const [room, setRoom] = useState("");
  const fireRef = useRef(null);
  const at = (part) => (el) => game?.attach(part, el);
  // ミニマップのキャンバスの画素（表示の大きさ × 画面の倍率）
  useEffect(() => {
    const fit = () => {
      for (const sel of [".roy-mini canvas", ".roy-big canvas"]) {
        document.querySelectorAll(sel).forEach((cv) => {
          const r = cv.getBoundingClientRect();
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          const W = Math.max(64, Math.round(Math.max(r.width, r.height) * dpr));
          if (cv.width !== W) { cv.width = W; cv.height = W; }
        });
      }
    };
    fit();
    const id = setInterval(fit, 1000);
    window.addEventListener("resize", fit);
    return () => { clearInterval(id); window.removeEventListener("resize", fit); };
  }, [ui?.bigMap]);
  const compass = useMemo(() => {
    const out = [];
    for (let a = -360; a <= 720; a += 15) {
      const i = (((a % 360) + 360) % 360) / 15;
      out.push(<span key={a} className={i % 6 === 0 ? "c" : ""} style={{ left: `${(a + 360) * COMPASS_PX}px` }}>{CARD[i]}</span>);
    }
    return out;
  }, []);
  if (!game || !ui) return null;
  const me = ui.me;
  const playing = ui.phase === "play" || ui.phase === "end";
  const ground = ui.mode === "ground" && !ui.results;
  const held = ui.held || (me.held === 0 ? "fist" : me.slots[me.held - 1]?.kind || "fist");
  const heldSlot = me.held ? me.slots[me.held - 1] : null;
  const lobby = ui.mode === "lobby";
  const watching = ui.mode === "out" || ui.mode === "spectate";
  const phrases = PEER_PHRASES.slice(0, 4);
  const busy = ui.reload || ui.heal;

  // 撃つボタン：押しているあいだ撃つ。押したまま指を動かすと見回す（回して描いているときは向きを直す）
  const fireDown = (e) => {
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* なし */ }
    fireRef.current = { x: e.clientX, y: e.clientY, rot: !!e.currentTarget.closest(".cb3-rot") };
    game.fireDown();
  };
  const fireMove = (e) => {
    const f = fireRef.current;
    if (!f) return;
    const dx = e.clientX - f.x, dy = e.clientY - f.y;
    f.x = e.clientX;
    f.y = e.clientY;
    if (f.rot) game.look(dy, -dx);
    else game.look(dx, dy);
  };
  const fireUp = () => { fireRef.current = null; game.fireUp(); };
  const hold = (fn) => ({ onPointerDown: (e) => { e.preventDefault(); fn(true); }, onPointerUp: () => fn(false), onPointerCancel: () => fn(false), onPointerLeave: () => fn(false) });

  const statusLine = ui.conn === "open" ? null : ui.conn === "full" ? t("roy.full") : ui.conn === "ver" ? t("roy.ver") : ui.practice ? null : t("roy.offline");
  const readyCount = ui.lobby.filter((p) => p.ready).length;
  const shSeg = [0, 1, 2, 3].map((i) => Math.max(0, Math.min(1, (me.sh - i * 25) / 25)));
  const W = WEAPONS[held];
  return (
    <div className="roy" style={{ "--roy-accent": accent }}>
      <style>{CSS}</style>
      <div ref={at("vignette")} className="roy-vig" />
      <div ref={at("pops")} className="roy-pops" />

      {/* 上：方位の帯・円の秒・残り・撃破 */}
      {(playing || ui.phase === "countdown") && (
        <div className="roy-top">
          {playing && (
            <div className="roy-compass roy-panel">
              <div ref={at("compass")} className="roy-strip" data-px={COMPASS_PX}>{compass}</div>
              <i className="roy-needle" />
              <b ref={at("heading")} className="roy-hdg" />
            </div>
          )}
          <div className="roy-chips">
            <span className="roy-chip roy-panel"><Ico.clock /><b ref={at("timer")} /></span>
            {playing && ui.inMatch && <span className="roy-chip roy-panel"><Ico.person />{ui.alive}<span style={{ opacity: 0.45, fontWeight: 700 }}>/{ui.total}</span></span>}
            {playing && ui.inMatch && <span className="roy-chip roy-panel"><Ico.target />{ui.kills}</span>}
          </div>
        </div>
      )}
      {playing && (
        <div className="roy-mini" onClick={() => game.toggleMap()} role="button" aria-label={t("roy.map")}>
          <canvas ref={at("map")} />
        </div>
      )}
      {ui.bigMap && (
        <div className="roy-big" onClick={() => game.toggleMap()}>
          <div><canvas ref={at("bigMap")} /></div>
        </div>
      )}
      {ui.feed.length > 0 && (
        <div className="roy-feed">
          {ui.feed.map((f) => (
            <div key={f.at + f.text} className="roy-panel">
              {f.killer ? <><em style={{ color: f.kc || "#fff" }}>{f.killer}</em><WIcon kind={f.w} /><em style={{ color: f.vc || "#fff" }}>{f.victim}</em></> : <em>{f.text}</em>}
            </div>
          ))}
        </div>
      )}

      {/* まん中：知らせ・十字・命中・撃たれた向き・スコープ */}
      {ui.announce && (
        <div key={ui.announce.id} className={`roy-ann ${ui.announce.kind}`}>
          <b>{ui.announce.text}</b>
          {ui.announce.sub && <span>{ui.announce.sub}</span>}
          <hr />
        </div>
      )}
      <div ref={at("dirs")} className="roy-dirs" />
      {ground && ui.ads && held === "sniper" && <div className="roy-scope"><i /></div>}
      {ground && !(ui.ads && held === "sniper") && (
        <div ref={at("cross")} className={`roy-cross${ui.ads ? " ads" : ""}`}>
          <i /><i /><i /><i /><b />
          <span className="roy-hm"><u /><u /><u /><u /></span>
        </div>
      )}
      {ground && busy && (
        <svg className="roy-ring" viewBox="0 0 46 46"><circle className="bg" cx="23" cy="23" r="21" /><circle key={busy.until} className="fg" cx="23" cy="23" r="21" style={{ animationDuration: `${Math.max(50, busy.until - performance.now())}ms` }} /></svg>
      )}
      {ground && <div ref={at("dmg")} className="roy-dmg" />}

      {/* 左下：シールドと体力 */}
      {ground && (
        <div className="roy-hp roy-panel">
          {me.helmet && <span className="helm roy-panel"><Ico.helmet style={{ width: 13, height: 13 }} />{t("roy.h.helmet")}</span>}
          <div className="row">
            <Ico.shield style={{ color: "#4da3ff" }} />
            <div className="roy-seg">{shSeg.map((v, i) => <span key={i}><i style={{ width: `${v * 100}%` }} /></span>)}</div>
            <b>{me.sh}</b>
          </div>
          <div className="row">
            <Ico.heart style={{ color: me.hp <= 30 ? "#ff5a5a" : "#f3f5f7" }} />
            <div className={`roy-bar${me.hp <= 30 ? " low" : ""}`}><i style={{ width: `${me.hp}%` }} /></div>
            <b>{me.hp}</b>
          </div>
        </div>
      )}

      {/* 下のまん中：拾う・リロード中・回復 */}
      {ground && (
        <div className="roy-mid">
          {ui.swap && (touch
            ? <button type="button" className="roy-swap" onClick={() => game.pick()}>{t("roy.pick", { name: kindName(ui.swap.kind) })}</button>
            : <div className="roy-note roy-panel"><kbd>F</kbd>{t("roy.pick", { name: kindName(ui.swap.kind) })}</div>)}
          {ui.reload && <div className="roy-note roy-panel">{t("roy.reloading")}</div>}
          {ui.heal && <div className="roy-note roy-panel">{t("roy.healing", { name: kindName(ui.heal.kind) })}</div>}
          <div className="roy-heals roy-panel">
            {HEAL_KINDS.map((k, i) => {
              const I = HEAL_ICON[k];
              return (
                <button key={k} type="button" className="roy-heal" disabled={!me.heals[k]} onClick={() => game.heal(k)} title={kindName(k)} aria-label={kindName(k)}>
                  {!touch && <small>{i + 4}</small>}
                  <I />
                  <em>{me.heals[k]}</em>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 右下：装備と弾（スマホはボタンの上に小さく） */}
      {ground && !touch && (
        <div className="roy-wpn roy-panel pc">
          <div className="name"><i style={{ background: BLASTER[held]?.col || "#fff" }} />{kindName(held)}</div>
          <div className="ammo">
            {W?.mag ? <><b className={heldSlot && heldSlot.mag === 0 ? "empty" : ""}>{heldSlot?.mag ?? 0}</b><span>/ {me.ammo[W.ammo]}</span></> : <b style={{ fontSize: 20 }}>—</b>}
          </div>
          <div className="roy-slots">
            {[1, 2, 0].map((i) => {
              const s = i ? me.slots[i - 1] : { kind: "fist" };
              return (
                <button key={i} type="button" className={me.held === i ? "on" : ""} disabled={!s} onClick={() => game.slot(i)}>
                  <small>{i || 3}</small>
                  {s ? <WIcon kind={s.kind} style={{ color: s.kind === "fist" ? "#fff" : BLASTER[s.kind]?.col }} /> : <small>—</small>}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {ground && touch && (
        <div className="roy-wpn roy-panel" style={{ bottom: "auto", right: "auto", left: "calc(12px + var(--cb3-sl,env(safe-area-inset-left,0px)))", top: "calc(var(--roy-map,108px) + 22px + var(--cb3-st,env(safe-area-inset-top,0px)))", width: 150, padding: "6px 8px" }}>
          <div className="name"><i style={{ background: BLASTER[held]?.col || "#fff" }} />{kindName(held)}</div>
          <div className="ammo" style={{ marginBottom: 4 }}>{W?.mag ? <><b style={{ fontSize: 24 }}>{heldSlot?.mag ?? 0}</b><span>/ {me.ammo[W.ammo]}</span></> : null}</div>
          <div className="roy-slots">
            {[1, 2, 0].map((i) => {
              const s = i ? me.slots[i - 1] : { kind: "fist" };
              return <button key={i} type="button" className={me.held === i ? "on" : ""} disabled={!s} onClick={() => game.slot(i)}>{s ? <WIcon kind={s.kind} style={{ color: s.kind === "fist" ? "#fff" : BLASTER[s.kind]?.col }} /> : <small>—</small>}</button>;
            })}
          </div>
        </div>
      )}
      {touch && ground && (
        <div className="roy-touch">
          <button type="button" className={ui.ads ? "on" : ""} aria-label={t("roy.aim")} onPointerDown={(e) => { e.preventDefault(); game.ads(); }}><Ico.scope /></button>
          <button type="button" aria-label={t("roy.reload")} onPointerDown={(e) => { e.preventDefault(); game.reload(); }}><Ico.reload /></button>
          <button type="button" aria-label={t("navi.strollJump")} {...hold((v) => game.jump(v))}><Ico.up /></button>
          <button type="button" className="fire" aria-label={t("roy.fire")} onPointerDown={fireDown} onPointerMove={fireMove} onPointerUp={fireUp} onPointerCancel={fireUp}><Ico.fire /></button>
        </div>
      )}

      {/* 飛行機・降下 */}
      {ui.mode === "plane" && (
        <div className="roy-spec">
          <button type="button" className="roy-drop" disabled={!ui.canDrop} onClick={() => game.jump(true)}>{!touch && <kbd>Space</kbd>}{t("roy.drop")}</button>
        </div>
      )}
      {ui.mode === "fall" && <div className="roy-spec"><button type="button" className="roy-drop" {...hold((v) => game.jump(v))}>{!touch && <kbd>Space</kbd>}{t("roy.open")}</button></div>}

      {/* ロビー */}
      {lobby && (
        <div className="roy-card roy-panel">
          <h3>{t("roy.title")}{ui.practice && <small>{t("roy.practice")}</small>}</h3>
          {statusLine && <p>{statusLine}</p>}
          {ui.phase === "countdown" ? <><div ref={at("count")} className="roy-count" /><p style={{ textAlign: "center" }}>{t("roy.countdown")}</p></> : !ui.practice && ui.conn === "open" ? <p>{t("roy.readyHint")}</p> : null}
          {ui.conn === "open" && !ui.practice && (
            <div className="roy-ppl">
              {ui.lobby.map((p) => <span key={p.id} className={p.ready ? "ok" : ""} style={{ "--c": p.col }}><i />{p.name}{p.id === ui.myId ? `（${t("roy.you")}）` : ""}<em>{p.ready ? t("roy.ready") : "…"}</em></span>)}
            </div>
          )}
          {!ui.practice && ui.conn === "open" && <p>{t("roy.room", { room: ui.room })}・{t("roy.readyN", { n: readyCount, all: ui.lobby.length })}</p>}
          <div className="roy-btns">
            {ui.conn === "open" && (
              <button type="button" className={ui.readyMe ? "" : "pri"} onClick={() => game.ready(!ui.readyMe)}>{ui.readyMe ? t("roy.unready") : ui.practice ? t("roy.start") : t("roy.ready")}</button>
            )}
            {!ui.practice && <button type="button" onClick={() => game.practice()}>{t("roy.practice")}</button>}
            {ui.practice && ui.online && <button type="button" onClick={() => game.online()}>{t("roy.backOnline")}</button>}
            {onLeave && <button type="button" onClick={onLeave}>{t("roy.leave")}</button>}
          </div>
          {!ui.practice && ui.online && (
            <div className="roy-room">
              <input value={room} placeholder={t("roy.passRoom")} maxLength={32} onChange={(e) => setRoom(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} onKeyDown={(e) => e.stopPropagation()} />
              <button type="button" disabled={!room} onClick={() => { game.online(room); setRoom(""); }}>{t("roy.join")}</button>
            </div>
          )}
          {ui.conn === "open" && !ui.practice && (
            <div className="roy-btns">{phrases.map((p, i) => <button key={p} type="button" style={{ height: 30, fontSize: 12 }} onClick={() => game.say(i)}>{p}</button>)}</div>
          )}
          <p style={{ marginTop: 10 }}>{t("roy.toyNote")}</p>
          {!touch && <p>{t("roy.keys")}</p>}
        </div>
      )}

      {/* アウトのまとめ（順位・倒した相手と装備・撃破とダメージ） */}
      {ui.outInfo && !ui.results && !ui.announce && (
        <div className="roy-recap roy-panel">
          <b>{t("roy.outTitle")}<span>#{ui.place} / {ui.total}</span></b>
          {ui.outInfo.killer ? <p><em style={{ fontStyle: "normal", color: ui.outInfo.kc || "#fff" }}>{ui.outInfo.killer}</em><WIcon kind={ui.outInfo.weapon} />{kindName(ui.outInfo.weapon || "fist")}</p> : ui.outInfo.cause === "zone" ? <p>{t("roy.outZone")}</p> : null}
          <div className="st"><div><strong>{ui.outInfo.kills}</strong>{t("roy.koH")}</div><div><strong>{ui.outInfo.damage}</strong>{t("roy.dmgH")}</div></div>
        </div>
      )}
      {/* アウト・観戦 */}
      {watching && !ui.results && (
        <div className="roy-spec">
          <span className="roy-note roy-panel">{ui.mode === "out" ? t("roy.out", { place: ui.place }) : t("roy.waitNext")}{ui.follow ? `・${t("roy.following", { name: ui.follow })}` : ""}</span>
          <button type="button" onClick={() => game.spectateNext()}>{t("roy.next")}</button>
          {ui.follow && <button type="button" onClick={() => game.freeLook()}>{t("roy.free")}</button>}
          {touch && !ui.follow && <button type="button" {...hold((v) => game.up(v))}>▲</button>}
          {touch && !ui.follow && <button type="button" {...hold((v) => game.down(v))}>▼</button>}
          {ui.practice && onLeave && <button type="button" onClick={onLeave}>{t("roy.leave")}</button>}
        </div>
      )}

      {/* 結果 */}
      {ui.phase === "end" && ui.results && (
        <div className="roy-card roy-panel" style={{ top: "auto", bottom: "calc(14px + var(--cb3-sb,env(safe-area-inset-bottom,0px)))" }}>
          <h3>{t("roy.results")}</h3>
          <table>
            <thead><tr><th>{t("roy.placeH")}</th><th>{t("roy.nameH")}</th><th>{t("roy.koH")}</th><th>{t("roy.dmgH")}</th></tr></thead>
            <tbody>
              {ui.results.map((r) => (
                <tr key={r.id} className={r.id === ui.myId ? "me" : ""}><td>#{r.place || "-"}</td><td>{r.name}</td><td>{r.kills}</td><td>{r.damage}</td></tr>
              ))}
            </tbody>
          </table>
          <p>{t("roy.backSoon")}</p>
        </div>
      )}
    </div>
  );
}
