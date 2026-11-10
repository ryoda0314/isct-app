"use client";
// 3D 地図のデバッグ用の目印（CampusMap3D の中に出す。開発中・エディタ・localStorage の cb3Debug が "1" のとき）。
// - 右の列の「目印」ボタンで一覧を開き、地図をクリックするとそこ（描いた面か地面）に番号つきの目印。歩いているときは M キーか
//   「目印」ボタンで画面のまん中（十字）に
// - 目印ごとにコメント、近くの構造物（id・階の壁や家具・屋根の板の番号）、そのときの視点、画面の絵（目印の場所に丸と番号）を残す
// - 「書き出し」で JSON（Claude に渡す）。「読み込み」で戻す。目印は localStorage（cb3DebugMarks）に覚えておく
// 計算は campus3dDebug.js（3D の点 ⇔ 画面・光線と三角形・近くの構造物）
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../i18n.js";
import { dem } from "../campusDem.js";
import { toLngLat } from "../campus3dFeatures.js";
import { MARKS_KEY, fromWorld, marksJSON, nearFeatures, parseMarks, pointOnRay, projectPoint, raycastMesh, screenRay, terrainHit, toWorld } from "../campus3dDebug.js";

const SHOT_KEY = "cb3DebugShot";
const CSS = `
.cb3-dbg-btn{position:absolute;right:10px;bottom:274px;width:40px;height:40px;border:none;border-radius:14px;background:var(--cb3-btn);color:var(--cb3-btn-tx);
  box-shadow:0 6px 16px -6px rgba(0,0,0,.4);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;z-index:2}
.cb3-dbg-btn.on{background:#e11d48;color:#fff}
.cb3-dbg-btn .cb3-dbg-n{position:absolute;right:-4px;top:-4px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:#e11d48;color:#fff;font-size:10px;font-weight:800;line-height:16px}
.cb3-dbg-btn.on .cb3-dbg-n{background:#fff;color:#e11d48}
.cb3-dbg-pins{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:2}
.cb3-dbg-pin{position:absolute;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:#e11d48;border:2px solid #fff;color:#fff;
  font:800 11px/18px system-ui,sans-serif;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.5);pointer-events:auto;cursor:pointer;white-space:nowrap}
.cb3-dbg-pin.sel{background:#f59e0b}
.cb3-dbg-pin span{display:none;position:absolute;left:24px;top:-2px;max-width:220px;padding:3px 7px;border-radius:7px;background:rgba(14,32,48,.88);font-weight:600;font-size:11px;line-height:1.4;
  white-space:normal;text-align:left;width:max-content}
.cb3-dbg-pin:hover span,.cb3-dbg-pin.sel span{display:block}
.cb3-walking .cb3-dbg-pin{pointer-events:none}
.cb3-dbg-panel{position:absolute;left:10px;bottom:24px;width:min(340px,calc(100% - 70px));max-height:min(62%,560px);display:flex;flex-direction:column;border-radius:14px;
  background:var(--cb3-btn);color:var(--cb3-btn-tx);box-shadow:0 10px 28px -10px rgba(0,0,0,.55);z-index:4;font-size:12px;overflow:hidden}
.cb3-dbg-head{display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid var(--cb3-btn-bd);font-weight:800}
.cb3-dbg-head .grow{flex:1}
.cb3-dbg-panel button{border:none;border-radius:9px;padding:5px 9px;background:rgba(127,127,127,.16);color:inherit;font:inherit;font-weight:700;cursor:pointer}
.cb3-dbg-panel button.on{background:#e11d48;color:#fff}
.cb3-dbg-list{overflow-y:auto;padding:6px 8px;display:flex;flex-direction:column;gap:8px}
.cb3-dbg-item{border-radius:10px;padding:7px 8px;background:rgba(127,127,127,.09)}
.cb3-dbg-item.sel{outline:2px solid #f59e0b}
.cb3-dbg-row{display:flex;align-items:center;gap:6px}
.cb3-dbg-no{flex:none;width:20px;height:20px;border-radius:50%;background:#e11d48;color:#fff;font-weight:800;font-size:11px;line-height:20px;text-align:center}
.cb3-dbg-item textarea{width:100%;box-sizing:border-box;margin-top:5px;min-height:34px;resize:vertical;border:1px solid var(--cb3-btn-bd);border-radius:8px;padding:4px 6px;
  background:transparent;color:inherit;font:inherit}
.cb3-dbg-meta{margin-top:4px;opacity:.75;font-size:11px;line-height:1.45;word-break:break-all}
.cb3-dbg-item img{display:block;width:100%;margin-top:5px;border-radius:7px}
.cb3-dbg-foot{display:flex;flex-wrap:wrap;gap:6px;padding:8px 10px;border-top:1px solid var(--cb3-btn-bd);align-items:center}
.cb3-dbg-foot label{display:flex;align-items:center;gap:4px;font-weight:700}
.cb3-dbg-hint{position:absolute;left:50%;top:14px;transform:translateX(-50%);padding:7px 13px;border-radius:14px;background:rgba(225,29,72,.92);color:#fff;font-size:12.5px;font-weight:700;
  z-index:4;pointer-events:none;white-space:nowrap}
.cb3-placing .maplibregl-canvas{cursor:crosshair!important}
.cb3-dbg-walkbtn{position:absolute;right:12px;top:14px;height:38px;padding:0 14px;border:none;border-radius:19px;background:rgba(225,29,72,.9);color:#fff;font-size:13px;font-weight:800;
  pointer-events:auto;cursor:pointer;z-index:4}
`;
const PIN_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 22s7-6.1 7-12a7 7 0 0 0-14 0c0 5.9 7 12 7 12z" />
    <circle cx="12" cy="10" r="2.6" />
  </svg>
);

const loadMarks = () => {
  try {
    const v = JSON.parse(localStorage.getItem(MARKS_KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
// 覚えておく（入りきらなければ画面の絵を外して）
const saveMarks = (marks) => {
  try {
    localStorage.setItem(MARKS_KEY, JSON.stringify(marks));
  } catch {
    try {
      localStorage.setItem(MARKS_KEY, JSON.stringify(marks.map((m) => ({ ...m, image: undefined }))));
    } catch {
      /* 覚えられなくても、書き出しはできる */
    }
  }
};
const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "-");
const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};

/**
 * props: loaded, mapRef, layerRef（extras レイヤー：matrix）, meshRef（いま描いている三角形＝buildMesh の結果）, viewRef（構造物の並び）,
 *        walkRef（歩いて見るときの状態）, wrapRef（地図の外の箱：クリックを先に受ける）, walking, picking, detail（{ on, level }）
 */
export function MapDebugMarks({ loaded, mapRef, layerRef, meshRef, viewRef, walkRef, wrapRef, walking, picking, detail }) {
  const [marks, setMarks] = useState(loadMarks);
  const marksRef = useRef(marks);
  marksRef.current = marks;
  const [open, setOpen] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [sel, setSel] = useState(null);
  const [toast, setToast] = useState(null);
  const [shot, setShot] = useState(() => {
    try {
      return localStorage.getItem(SHOT_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const pinsRef = useRef(null);
  const fileRef = useRef(null);
  const detailRef = useRef(detail);
  detailRef.current = detail;

  // 覚えておく（コメントを打つたびに全部を書かないよう、少し待って）
  useEffect(() => {
    const id = setTimeout(() => saveMarks(marks), 400);
    return () => clearTimeout(id);
  }, [marks]);
  useEffect(() => {
    try {
      localStorage.setItem(SHOT_KEY, shot ? "1" : "0");
    } catch {
      /* なくてもよい */
    }
  }, [shot]);
  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(id);
  }, [toast]);

  // 画面の絵（目印のところに丸と番号）。描いたすぐあと（render のなか）に読む
  const capture = (sx, sy, n) => new Promise((resolve) => {
    const map = mapRef.current;
    if (!map) return resolve(null);
    const done = () => {
      try {
        const c = map.getCanvas();
        const W = 640;
        const H = Math.round((c.height * W) / c.width);
        const out = document.createElement("canvas");
        out.width = W;
        out.height = H;
        const g = out.getContext("2d");
        g.drawImage(c, 0, 0, W, H);
        const k = W / c.clientWidth;
        g.lineWidth = 3;
        g.strokeStyle = "#fff";
        g.fillStyle = "#e11d48";
        g.beginPath();
        g.arc(sx * k, sy * k, 10, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.fillStyle = "#fff";
        g.font = "bold 12px sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(String(n), sx * k, sy * k + 0.5);
        resolve(out.toDataURL("image/jpeg", 0.72));
      } catch {
        resolve(null);
      }
    };
    map.once("render", done);
    map.triggerRepaint();
  });

  // 画面の点（地図の画面の CSS px）に目印を置く：光線が先に当たる面（描いた三角形か、表示の地面）
  const placeAt = useCallback(async (sx, sy) => {
    const map = mapRef.current;
    const M = layerRef.current?.matrix;
    if (!map || !M) return;
    const c = map.getCanvas();
    const W = c.clientWidth;
    const H = c.clientHeight;
    const ray = screenRay(M, sx, sy, W, H);
    if (!ray) return;
    const mh = raycastMesh(meshRef.current, ray);
    const tg = terrainHit(ray, (ll) => dem.surfaceAt(ll), mh ? mh.t : 1);
    let hit;
    if (mh && (tg == null || mh.t <= tg)) hit = { t: mh.t, pass: mh.pass || "mesh", normal: mh.normal?.map((v) => +v.toFixed(3)) || null };
    else if (tg != null) hit = { t: tg, pass: "terrain", normal: null };
    else {
      setToast(t("debug.noHit"));
      return;
    }
    const at = fromWorld(pointOnRay(ray, hit.t));
    const ll = toLngLat([at.x, at.y]);
    const ground = dem.groundAt(ll);
    const surface = dem.surfaceAt(ll);
    const near = nearFeatures(viewRef.current || [], at.x, at.y, at.z, (q) => dem.groundAt(q));
    const w = walkRef.current;
    const cam = map.transform.getCameraLngLat?.();
    const center = map.getCenter();
    const d = detailRef.current || {};
    const n = marksRef.current.reduce((mx, m) => Math.max(mx, m.n || 0), 0) + 1;
    const mark = {
      n,
      comment: "",
      time: new Date().toISOString(),
      at: { lng: +ll[0].toFixed(8), lat: +ll[1].toFixed(8), x: +at.x.toFixed(3), y: +at.y.toFixed(3), z: +at.z.toFixed(3), ground: Number.isFinite(ground) ? +ground.toFixed(3) : null, surface: Number.isFinite(surface) ? +surface.toFixed(3) : null },
      hit: { pass: hit.pass, normal: hit.normal },
      near,
      view: {
        mode: w ? (w.fly ? (w.noclip ? "fly-noclip" : "fly") : "walk") : "map",
        detail: !!d.on,
        level: d.level ?? null,
        center: [+center.lng.toFixed(8), +center.lat.toFixed(8)],
        zoom: +map.getZoom().toFixed(3),
        bearing: +map.getBearing().toFixed(2),
        pitch: +map.getPitch().toFixed(2),
        fov: +(map.transform.fov || 0).toFixed(2),
        camera: cam ? { lng: +cam.lng.toFixed(8), lat: +cam.lat.toFixed(8), alt: +(map.transform.getCameraAltitude?.() ?? 0).toFixed(2) } : null,
        walker: w ? { x: +w.x.toFixed(3), y: +w.y.toFixed(3), z: +w.z.toFixed(3), yaw: +w.yaw.toFixed(2), pitch: +w.pitch.toFixed(2), fly: !!w.fly } : null,
        screen: { x: Math.round(sx), y: Math.round(sy), w: W, h: H },
      },
    };
    setMarks((ms) => [...ms, mark]);
    setSel(n);
    setToast(t("debug.placed", { n }));
    if (shot) {
      const image = await capture(sx, sy, n);
      if (image) setMarks((ms) => ms.map((m) => (m.n === n ? { ...m, image } : m)));
    }
  }, [shot]); // eslint-disable-line react-hooks/exhaustive-deps

  // 地図をクリックして置く（目印を置くあいだ）。地図・エディタのクリックには渡さない（外の箱で先に受ける）。ドラッグは地図を動かす
  useEffect(() => {
    if (!placing || walking || picking) return undefined;
    const wrap = wrapRef.current;
    const map = mapRef.current;
    if (!wrap || !map) return undefined;
    wrap.classList.add("cb3-placing");
    let down = null;
    const onDown = (e) => {
      down = e.button === 0 && e.target === map.getCanvas() ? { x: e.clientX, y: e.clientY } : null;
    };
    const onClick = (e) => {
      if (!down || e.target !== map.getCanvas()) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5;
      down = null;
      if (moved) return;
      e.stopPropagation();
      e.preventDefault();
      const r = map.getCanvas().getBoundingClientRect();
      placeAt(e.clientX - r.left, e.clientY - r.top);
    };
    const onKey = (e) => {
      if (e.code === "Escape" && !e.target?.closest?.("input,textarea,select")) setPlacing(false);
    };
    wrap.addEventListener("pointerdown", onDown, true);
    wrap.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey);
    return () => {
      wrap.classList.remove("cb3-placing");
      wrap.removeEventListener("pointerdown", onDown, true);
      wrap.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [placing, walking, picking, placeAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // 歩いているあいだ：M キーで画面のまん中（十字）に
  const placeCenter = useCallback(() => {
    const c = mapRef.current?.getCanvas();
    if (c) placeAt(c.clientWidth / 2, c.clientHeight / 2);
  }, [placeAt]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!walking) return undefined;
    const onKey = (e) => {
      if (e.code !== "KeyM" || e.repeat || e.target?.closest?.("input,textarea,select,[contenteditable='true']")) return;
      e.preventDefault();
      placeCenter();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [walking, placeCenter]);

  // 目印を画面の位置へ（地図を描くたびに。描いたときの行列で）
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map) return undefined;
    const update = () => {
      const box = pinsRef.current;
      const M = layerRef.current?.matrix;
      if (!box || !M) return;
      const c = map.getCanvas();
      const W = c.clientWidth;
      const H = c.clientHeight;
      for (const el of box.children) {
        const m = marksRef.current.find((q) => String(q.n) === el.dataset.n);
        const p = m ? projectPoint(M, toWorld(m.at.x, m.at.y, m.at.z), W, H) : null;
        if (!p || p.depth > 1 || p.x < -30 || p.y < -30 || p.x > W + 30 || p.y > H + 30) {
          el.style.display = "none";
          continue;
        }
        el.style.display = "";
        el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
      }
    };
    map.on("render", update);
    update();
    map.triggerRepaint();
    return () => map.off("render", update);
  }, [loaded, marks]); // eslint-disable-line react-hooks/exhaustive-deps

  const setComment = (n, comment) => setMarks((ms) => ms.map((m) => (m.n === n ? { ...m, comment } : m)));
  const remove = (n) => setMarks((ms) => ms.filter((m) => m.n !== n));
  const clearAll = () => {
    if (marksRef.current.length && window.confirm(t("debug.clearConfirm", { n: marksRef.current.length }))) setMarks([]);
  };
  // その目印を置いたときの視点へ（歩いているなら、その場所へ移る。歩く人の位置がなければ目印の点の上に浮かぶ）
  const goTo = (m) => {
    const map = mapRef.current;
    const w = walkRef.current;
    if (!map) return;
    setSel(m.n);
    if (w) {
      const v = m.view?.walker || { x: m.at.x, y: m.at.y, z: m.at.z, yaw: w.yaw, pitch: 88, fly: true };
      Object.assign(w, { x: v.x, y: v.y, z: v.z, vx: 0, vy: 0, vz: 0, yaw: v.yaw, pitch: v.pitch, onGround: !v.fly, deck: null, fly: !!v.fly || !!w.fly });
      return;
    }
    const v = m.view || {};
    if (v.center) map.jumpTo({ center: v.center, zoom: v.zoom, bearing: v.bearing, pitch: v.pitch });
  };
  const exportMarks = () => {
    const text = marksJSON(marksRef.current, { page: typeof location !== "undefined" ? location.pathname + location.hash : "", images: true });
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campus3d-marks-${stamp()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const importMarks = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const list = parseMarks(await file.text());
      setMarks((ms) => {
        let n = ms.reduce((mx, m) => Math.max(mx, m.n || 0), 0);
        return [...ms, ...list.map((m) => ({ ...m, n: ++n, importedFrom: m.n }))];
      });
      setToast(t("debug.imported", { n: list.length }));
    } catch (err) {
      setToast(`${t("debug.importFailed")}: ${err.message}`);
    }
  };

  const nearText = (m) => (m.near || []).slice(0, 4).map((q) => `${q.id}${q.part ? ` ${q.part}${q.partKind ? `(${q.partKind})` : ""}` : ""}${q.dist ? ` ${q.dist}m` : ""}`).join(" / ");
  return (
    <>
      <style>{CSS}</style>
      <div ref={pinsRef} className="cb3-dbg-pins">
        {marks.map((m) => (
          <div key={m.n} data-n={m.n} className={`cb3-dbg-pin${sel === m.n ? " sel" : ""}`} style={{ display: "none" }} onClick={() => { setSel(m.n); setOpen(true); }}>
            {m.n}
            {m.comment ? <span>{m.comment}</span> : null}
          </div>
        ))}
      </div>
      {!walking && !picking && (
        <button type="button" className={`cb3-dbg-btn${open ? " on" : ""}`} aria-label={t("debug.marks")} title={t("debug.marks")} onClick={() => { const next = !open; setOpen(next); setPlacing(next); }}>
          {PIN_ICON}
          {marks.length > 0 && <span className="cb3-dbg-n">{marks.length}</span>}
        </button>
      )}
      {walking && <button type="button" className="cb3-dbg-walkbtn" onClick={placeCenter}>{t("debug.placeHere")}</button>}
      {placing && open && !walking && !picking && <div className="cb3-dbg-hint">{t("debug.placeHint")}</div>}
      {toast && <div className="cb3-dbg-hint" style={{ top: placing && open && !walking ? 50 : 14 }}>{toast}</div>}
      {open && !walking && !picking && (
        <div className="cb3-dbg-panel" role="dialog" aria-label={t("debug.marks")}>
          <div className="cb3-dbg-head">
            <span className="grow">{t("debug.marks")}（{marks.length}）</span>
            <button type="button" className={placing ? "on" : ""} aria-pressed={placing} onClick={() => setPlacing((p) => !p)}>{placing ? t("debug.placing") : t("debug.place")}</button>
            <button type="button" aria-label={t("debug.close")} onClick={() => { setOpen(false); setPlacing(false); }}>×</button>
          </div>
          <div className="cb3-dbg-list">
            {!marks.length && <div style={{ opacity: 0.7, padding: "6px 2px" }}>{t("debug.empty")}</div>}
            {marks.map((m) => (
              <div key={m.n} className={`cb3-dbg-item${sel === m.n ? " sel" : ""}`}>
                <div className="cb3-dbg-row">
                  <span className="cb3-dbg-no">{m.n}</span>
                  <span style={{ flex: 1, fontWeight: 700 }}>{m.near?.[0]?.id || m.hit?.pass}</span>
                  <button type="button" onClick={() => goTo(m)}>{t("debug.go")}</button>
                  <button type="button" onClick={() => remove(m.n)}>{t("debug.remove")}</button>
                </div>
                <textarea value={m.comment || ""} placeholder={t("debug.commentPh")} onChange={(e) => setComment(m.n, e.target.value)} onFocus={() => setSel(m.n)} />
                <div className="cb3-dbg-meta">
                  x {fmt(m.at.x)} y {fmt(m.at.y)} z {fmt(m.at.z)}（{t("debug.fromGround")} {fmt(m.at.z - (m.at.ground ?? m.at.surface ?? m.at.z))}m）· {m.hit?.pass}
                  {m.near?.length ? <><br />{nearText(m)}</> : null}
                </div>
                {m.image && sel === m.n && <img src={m.image} alt="" />}
              </div>
            ))}
          </div>
          <div className="cb3-dbg-foot">
            <button type="button" onClick={exportMarks} disabled={!marks.length}>{t("debug.export")}</button>
            <button type="button" onClick={() => fileRef.current?.click()}>{t("debug.import")}</button>
            <button type="button" onClick={clearAll} disabled={!marks.length}>{t("debug.clear")}</button>
            <label><input type="checkbox" checked={shot} onChange={(e) => setShot(e.target.checked)} />{t("debug.shot")}</label>
            <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: "none" }} onChange={importMarks} />
          </div>
        </div>
      )}
    </>
  );
}
