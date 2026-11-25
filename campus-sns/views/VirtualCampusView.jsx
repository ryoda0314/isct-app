// バーチャルキャンパス（2026-11-18 ユーザー「メタバースみたいにできる？ そのときに入ってる人と交流できればいい。一緒に探検したい」
// 「MAPはMAPであつかい、バーチャルキャンパスはバーチャルキャンパス」）。
// 地図（キャンパスナビ＝NavigationView）とは別の画面。3D の世界と歩く操作は同じ部品（CampusMap3D）を使い、この画面だけが部屋サーバー
// （cf-walk-rooms。Cloudflare Durable Objects）につないで、同じ部屋にいる人の姿・ひとこと・合図を見せる。ログインなしでも入れる（名前は「ゲスト」）。
import { useEffect, useMemo, useRef, useState } from "react";
import { T } from "../theme.js";
import { useMapLibre, Loader } from "../shared.jsx";
import { CampusMap3D } from "../components/CampusMap3D.jsx";
import { isDarkColor } from "../campusBasemap.js";
import { FEATURES_URL, parseFeatures, toLngLat } from "../campus3dFeatures.js";
import { createPeerLink, PEER_PHRASES } from "../campus3dPeers.js";
import { t } from "../i18n.js";
import { VC_GAMES } from "../vcGames.js";
import { MapRoyale } from "../components/MapRoyale.jsx";

// 部屋サーバーの場所（cf-walk-rooms を Cloudflare に出したもの。2026-11-19 公開。公開の住所で、秘密ではない）。
// NEXT_PUBLIC_WALK_ROOMS_URL があればそれ（別の部屋サーバーを試すとき。手元の wrangler dev なら ws://localhost:8799）
export const WALK_ROOMS_URL = "wss://isct-walk-rooms.learnguages-poly.workers.dev";
const roomsUrl = () => (process.env.NEXT_PUBLIC_WALK_ROOMS_URL || WALK_ROOMS_URL).replace(/\/+$/, "");
const ROOM = "main";
// 入口：ウッドデッキの西の張り出し（70周年記念講堂の前）。重ならないように 1 人ずつ少しずらす。平面の m・向きは西
const SPAWN = { x: 46, y: 121.5, yaw: 262 };
const COLORS = ["#28c868", "#3d8bfd", "#ff7a59", "#b06ef3", "#f2b705", "#17b8be", "#ef5da8", "#8d99ae"];
const EMOTES = [["手を振る", 0], ["ジャンプ", 1], ["拍手", 2]];

const CSS = `
.vc-wrap{position:relative;width:100%;height:100%;min-height:320px;background:#0e2030;overflow:hidden}
.vc-enter{position:absolute;left:50%;bottom:36px;transform:translateX(-50%);z-index:1003;display:flex;flex-direction:column;align-items:center;gap:10px;width:min(360px,calc(100% - 32px))}
.vc-card{width:100%;box-sizing:border-box;padding:14px 16px;border-radius:14px;background:#fff;border:1px solid #d6dde4;color:#0e2030;font-size:13px;line-height:1.6}
.vc-card b{font-size:15px}
.vc-btn{width:100%;height:48px;border:none;border-radius:24px;background:var(--vc-accent,#28c868);color:#fff;font-size:15px;font-weight:800;cursor:pointer}
.vc-btn:disabled{opacity:.5;cursor:default}
.vc-hud{position:absolute;left:calc(112px + var(--cb3-sl,env(safe-area-inset-left,0px)));top:calc(10px + var(--cb3-st,env(safe-area-inset-top,0px)));z-index:5;display:flex;align-items:center;gap:6px;pointer-events:auto}
.vc-chip{height:34px;padding:0 12px;border-radius:17px;background:rgba(14,32,48,.82);color:#fff;font-size:12px;font-weight:800;display:flex;align-items:center;gap:6px;border:none;cursor:pointer;white-space:nowrap}
.vc-dot{width:8px;height:8px;border-radius:50%;background:#8d99ae}
.vc-dot.on{background:#28c868}
.vc-panel{position:absolute;left:calc(112px + var(--cb3-sl,env(safe-area-inset-left,0px)));top:calc(50px + var(--cb3-st,env(safe-area-inset-top,0px)));z-index:6;width:min(300px,calc(100% - 140px));padding:10px;border-radius:14px;background:#fff;border:1px solid #d6dde4;pointer-events:auto;display:flex;flex-wrap:wrap;gap:6px}
.vc-panel button{height:34px;padding:0 12px;border-radius:17px;border:1px solid #cfd6de;background:#f3f5f7;color:#0e2030;font-size:12.5px;font-weight:700;cursor:pointer}
.vc-panel .vc-sep{flex-basis:100%;height:0;border-top:1px solid #e3e8ee;margin:2px 0}
.vc-panel small{flex-basis:100%;color:#5b6b7a;font-size:11px}
.vc-games{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:14px;background:#fff;border:1px solid #d6dde4;color:#0e2030;display:flex;flex-direction:column;gap:8px}
.vc-games>small{color:#5b6b7a;font-size:11px;font-weight:700}
.vc-game{display:flex;align-items:center;gap:10px}
.vc-game div{flex:1;min-width:0;font-size:12px;line-height:1.5;color:#5b6b7a}
.vc-game div b{display:block;color:#0e2030;font-size:13.5px}
.vc-game button{flex:none;height:36px;padding:0 16px;border-radius:18px;border:1px solid #cfd6de;background:#f3f5f7;color:#0e2030;font-size:13px;font-weight:800;cursor:pointer}
.vc-game.pick button{background:var(--vc-accent,#28c868);border-color:transparent;color:#fff}
`;

export function VirtualCampusView({ mob = false, user = null }) {
  const mapLibre = useMapLibre(true);
  const [bm, setBm] = useState(null);
  const [feat, setFeat] = useState(null);
  const [ready, setReady] = useState(false); // 3D の地図が読めた
  const [failed, setFailed] = useState(false);
  const [panel, setPanel] = useState(false);
  const [, bump] = useState(0);
  const mapRef = useRef(null);
  const linkRef = useRef(null);
  const url = useMemo(roomsUrl, []);
  const name = (user?.name && String(user.name).trim().slice(0, 16)) || "ゲスト";
  const col = useMemo(() => {
    if (user?.col && /^#[0-9a-fA-F]{6}$/.test(user.col)) return user.col;
    try {
      const saved = window.localStorage.getItem("vcCol");
      if (saved && /^#[0-9a-fA-F]{6}$/.test(saved)) return saved;
      const c = COLORS[Math.floor(Math.random() * COLORS.length)];
      window.localStorage.setItem("vcCol", c);
      return c;
    } catch {
      return COLORS[0];
    }
  }, [user?.col]);

  useEffect(() => {
    let alive = true;
    import("../campusBasemapData.js").then((m) => { if (alive) setBm(m.BASEMAP); }).catch(() => { if (alive) setFailed(true); });
    fetch(FEATURES_URL).then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive) setFeat(parseFeatures(j)); }).catch(() => { if (alive) setFeat([]); });
    return () => { alive = false; };
  }, []);

  // ゲーム（vcGames.js）：mode は "walk"（みんなと歩く）かゲームの id。ゲームのあいだは「みんなと歩く」の部屋からは出る
  const [mode, setMode] = useState("walk");
  const [game, setGame] = useState(null); // createRoyaleGame の返す物
  const [rui, setRui] = useState(null); // ゲームの表示の状態（game が onUi で知らせる）
  const enterGame = useRef(false); // ゲームを読みこんだら歩きはじめる
  const pickGame = useMemo(() => (typeof window !== "undefined" && window.location.hash === "#vcampus/royale" ? "royale" : null), []);

  // 部屋につなぐのは、この画面を開いている間だけ（ゲームのあいだはつながない）
  useEffect(() => {
    if (!url || mode !== "walk") return undefined;
    const link = createPeerLink({ url: `${url}/room/${ROOM}`, name, col, onChange: () => bump((v) => v + 1) });
    linkRef.current = link;
    bump((v) => v + 1);
    return () => { link.close(); if (linkRef.current === link) linkRef.current = null; };
  }, [url, name, col, mode]);

  // ゲームを始める：コードを読み、部屋（または練習）につないで、ロビー（入口）から歩きはじめる
  useEffect(() => {
    if (mode === "walk") return undefined;
    const def = VC_GAMES.find((g) => g.id === mode);
    if (!def || !bm) return undefined;
    let alive = true;
    let made = null;
    def.load().then((m) => {
      if (!alive) return;
      made = m.createRoyaleGame({ url, room: "main", name, col, basemap: bm, onUi: (s) => { if (alive) setRui(s); } });
      if (process.env.NODE_ENV !== "production") window.__royale = made; // 開発中の確かめ用（ヘッドレスのテストから操作する）
      setGame(made);
    }).catch(() => { if (alive) setMode("walk"); });
    return () => { alive = false; made?.dispose(); setGame(null); setRui(null); };
  }, [mode, bm]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!game || !enterGame.current) return;
    enterGame.current = false;
    const r = Math.random() * Math.PI * 2, d = Math.random() * 2.5;
    mapRef.current?.startWalkAt({ x: SPAWN.x + Math.cos(r) * d, y: SPAWN.y + Math.sin(r) * d, yaw: SPAWN.yaw });
  }, [game]);
  const startGame = (id) => { enterGame.current = true; setMode(id); };

  // 歩いているか（入口のカードを出す・隠す）。CampusMap3D は歩きはじめ・終わりを知らせないので、ときどき見る
  const [walking, setWalking] = useState(false);
  useEffect(() => {
    const id = setInterval(() => { const w = !!mapRef.current?.isWalking?.(); setWalking((v) => (v === w ? v : w)); }, 400);
    return () => clearInterval(id);
  }, []);
  // ゲームの途中で歩くのをやめたら、ゲームを閉じて「みんなと歩く」に戻る
  const wasWalking = useRef(false);
  useEffect(() => {
    if (wasWalking.current && !walking && mode !== "walk" && !enterGame.current) setMode("walk");
    wasWalking.current = walking;
  }, [walking, mode]);

  const link = linkRef.current;
  const status =!url ? "none" : link ? link.status() : "connecting";
  const count = link ? link.count() : 0;
  const enter = () => {
    const r = Math.random() * Math.PI * 2, d = Math.random() * 2.5;
    mapRef.current?.startWalkAt({ x: SPAWN.x + Math.cos(r) * d, y: SPAWN.y + Math.sin(r) * d, yaw: SPAWN.yaw });
  };
  const initialView = useMemo(() => { const [lng, lat] = toLngLat([SPAWN.x - 20, SPAWN.y]); return { lat, lng, zoom: 18.2, bearing: 0 }; }, []);
  const statusText = status === "open" ? `${count + 1} 人` : status === "full" ? "満員" : status === "none" ? "ひとり" : "接続中";

  // 歩く画面の上に重ねる物（CampusMap3D の中に描く：スマホでは歩く画面が全画面・回して描かれるため）
  const overlay = (
    <>
      <div className="vc-hud">
        <button type="button" className="vc-chip" onClick={() => setPanel((v) => !v)} aria-label="バーチャルキャンパスのメニュー">
          <span className={`vc-dot${status === "open" ? " on" : ""}`} />
          {statusText}
          {status === "open" && <span style={{ opacity: 0.75 }}>・ひとこと</span>}
        </button>
      </div>
      {panel && (
        <div className="vc-panel">
          {status !== "open" && <small>{status === "none" ? "部屋サーバーがまだ公開されていないので、ひとりで歩いています。" : status === "full" ? "部屋が満員です。あとでもう一度ためしてください。" : "部屋につないでいます…"}</small>}
          {PEER_PHRASES.map((p, i) => <button key={p} type="button" disabled={status !== "open"} onClick={() => { link?.say(i); setPanel(false); }}>{p}</button>)}
          <span className="vc-sep" />
          {EMOTES.map(([label, n]) => <button key={label} type="button" disabled={status !== "open"} onClick={() => { link?.emote(n); setPanel(false); }}>{label}</button>)}
        </div>
      )}
    </>
  );

  const dark = isDarkColor(T.bg);
  return (
    <div className="vc-wrap" style={{ "--vc-accent": T.accent, height: mob ? "calc(100dvh - 110px)" : "100%" }}>
      <style>{CSS}</style>
      {failed && <div className="vc-enter"><div className="vc-card">3D の地図を読めませんでした。通信の状態を確かめて、もう一度開いてください。</div></div>}
      {!failed && (!mapLibre.ready || !bm || !feat) && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><Loader /></div>}
      {!failed && mapLibre.ready && bm && feat && (
        <CampusMap3D
          key={`${dark ? "d" : "l"}${T.accent}`}
          ref={mapRef}
          data={bm}
          trains
          features={feat}
          dark={dark}
          accent={T.accent}
          initialView={initialView}
          spots={[]}
          lookKey="vcLook"
          peers={mode === "walk" ? link : game?.peers || null}
          game={mode === "walk" ? undefined : game?.hook}
          lookMode={mode === "walk" ? undefined : "day"}
          walkOverlay={mode === "walk" ? overlay : <MapRoyale game={game} ui={rui} accent={T.accent} onLeave={() => mapRef.current?.stopWalk()} />}
          onLoad={() => setReady(true)}
          onError={() => setFailed(true)}
        />
      )}
      {!failed && ready && !walking && mode === "walk" && (
        <div className="vc-enter">
          <div className="vc-card">
            <b>バーチャルキャンパス</b>
            <div>いま入っている人といっしょに、キャンパスを歩けます。名前は「{name}」で表示されます。</div>
            <div style={{ color: "#5b6b7a", fontSize: 12 }}>{status === "open" ? `いま ${count} 人が入っています` : status === "none" ? "部屋サーバーが未公開のため、ひとりで歩きます" : status === "full" ? "部屋が満員です" : "部屋につないでいます…"}</div>
          </div>
          <button type="button" className="vc-btn" onClick={enter}>キャンパスに入る</button>
          <div className="vc-games">
            <small>{t("roy.games")}</small>
            {VC_GAMES.map((g) => (
              <div key={g.id} className={`vc-game${pickGame === g.id ? " pick" : ""}`}>
                <div><b>{t(g.title)}</b>{t(g.desc)}</div>
                <button type="button" onClick={() => startGame(g.id)}>{t("roy.enterGame")}</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {!failed && ready && !walking && mode !== "walk" && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1003 }}><Loader /></div>}
    </div>
  );
}
