import { useState, useEffect } from "react";
import { T } from "../theme.js";
import { t } from "../i18n.js";
import { I } from "../icons.jsx";

// ホームの天気。日付の横には小さいチップ（気温・雨が降りそうなら降水確率）だけを出し、
// タップすると時間ごとの予報と場所の変更を開く。データは open-meteo（キー不要）。

const WxIcon = ({ type, sz = 20 }) => {
  const s = { width: sz, height: sz, display: "inline-block", verticalAlign: "middle", flexShrink: 0 };
  const sun = <svg style={s} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="5" fill="#f59e0b" opacity=".85"/><g stroke="#f59e0b" strokeWidth="2" strokeLinecap="round">{[[12,1,12,3],[12,21,12,23],[4.22,4.22,5.64,5.64],[18.36,18.36,19.78,19.78],[1,12,3,12],[21,12,23,12],[4.22,19.78,5.64,18.36],[18.36,5.64,19.78,4.22]].map(([x1,y1,x2,y2],i)=><line key={i} x1={x1} y1={y1} x2={x2} y2={y2}/>)}</g></svg>;
  const cloud = <svg style={s} viewBox="0 0 24 24" fill="none"><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" fill="#94a3b8" opacity=".7" stroke="#64748b" strokeWidth="1.5" strokeLinejoin="round"/></svg>;
  const partCloud = <svg style={s} viewBox="0 0 24 24" fill="none"><circle cx="9" cy="9" r="4" fill="#f59e0b" opacity=".8"/><g stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round">{[[9,2,9,3.5],[9,14.5,9,16],[3.05,3.05,4.11,4.11],[13.89,13.89,14.95,14.95],[2,9,3.5,9],[14.5,9,16,9],[3.05,14.95,4.11,13.89],[13.89,4.11,14.95,3.05]].map(([x1,y1,x2,y2],i)=><line key={i} x1={x1} y1={y1} x2={x2} y2={y2}/>)}</g><path d="M19 14h-1A6.5 6.5 0 008 16.5 4 4 0 008 22h11a4 4 0 000-8z" fill="#94a3b8" opacity=".7" stroke="#64748b" strokeWidth="1.5" strokeLinejoin="round"/></svg>;
  const rain = <svg style={s} viewBox="0 0 24 24" fill="none"><path d="M18 8h-1.26A8 8 0 109 18h9a5 5 0 000-10z" fill="#93c5fd" opacity=".5" stroke="#3b82f6" strokeWidth="1.5" strokeLinejoin="round"/><g stroke="#3b82f6" strokeWidth="1.8" strokeLinecap="round"><line x1="8" y1="20" x2="7" y2="23"/><line x1="12" y1="20" x2="11" y2="23"/><line x1="16" y1="20" x2="15" y2="23"/></g></svg>;
  const heavyRain = <svg style={s} viewBox="0 0 24 24" fill="none"><path d="M18 7h-1.26A8 8 0 109 17h9a5 5 0 000-10z" fill="#93c5fd" opacity=".6" stroke="#2563eb" strokeWidth="1.5" strokeLinejoin="round"/><g stroke="#2563eb" strokeWidth="2" strokeLinecap="round"><line x1="7" y1="19" x2="5.5" y2="23"/><line x1="10.5" y1="19" x2="9" y2="23"/><line x1="14" y1="19" x2="12.5" y2="23"/><line x1="17.5" y1="19" x2="16" y2="23"/></g></svg>;
  const drizzle = <svg style={s} viewBox="0 0 24 24" fill="none"><circle cx="8" cy="7" r="3.5" fill="#f59e0b" opacity=".7"/><path d="M18 12h-1A6 6 0 008 14a4 4 0 004 6h6a4 4 0 000-8z" fill="#93c5fd" opacity=".45" stroke="#3b82f6" strokeWidth="1.5" strokeLinejoin="round"/><g stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round"><line x1="10" y1="21" x2="9.5" y2="23"/><line x1="14" y1="21" x2="13.5" y2="23"/></g></svg>;
  const fog = <svg style={s} viewBox="0 0 24 24" fill="none"><g stroke="#9ca3af" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="8" x2="21" y2="8"/><line x1="5" y1="12" x2="19" y2="12"/><line x1="3" y1="16" x2="21" y2="16"/><line x1="7" y1="20" x2="17" y2="20"/></g></svg>;
  const snow = <svg style={s} viewBox="0 0 24 24" fill="none"><path d="M18 8h-1.26A8 8 0 109 18h9a5 5 0 000-10z" fill="#e0e7ff" opacity=".5" stroke="#93c5fd" strokeWidth="1.5" strokeLinejoin="round"/><g fill="#60a5fa">{[[8,21],[12,20],[16,21],[10,23],[14,23]].map(([cx,cy],i)=><circle key={i} cx={cx} cy={cy} r="1.2"/>)}</g></svg>;
  const thunder = <svg style={s} viewBox="0 0 24 24" fill="none"><path d="M18 6h-1.26A8 8 0 109 16h9a5 5 0 000-10z" fill="#c4b5fd" opacity=".5" stroke="#7c3aed" strokeWidth="1.5" strokeLinejoin="round"/><path d="M13 16l-2 4h3l-2 4" stroke="#eab308" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  return { sun, partCloud, cloud, rain, heavyRain, drizzle, fog, snow, thunder }[type] || sun;
};

// WMO の天気コード → [ラベル（wx.* の訳語キー）, アイコン]
const WX = { 0: ["晴れ", "sun"], 1: ["晴れ", "partCloud"], 2: ["くもり", "partCloud"], 3: ["くもり", "cloud"], 45: ["霧", "fog"], 48: ["霧", "fog"], 51: ["小雨", "drizzle"], 53: ["雨", "rain"], 55: ["雨", "rain"], 61: ["雨", "rain"], 63: ["雨", "rain"], 65: ["大雨", "heavyRain"], 71: ["雪", "snow"], 73: ["雪", "snow"], 75: ["大雪", "snow"], 80: ["にわか雨", "drizzle"], 81: ["にわか雨", "rain"], 95: ["雷雨", "thunder"], 96: ["雷雨", "thunder"], 99: ["雷雨", "thunder"] };
const wxInfo = (c) => WX[c] || ["--", "sun"];

const DEF_LOC = { name: "東京", lat: 35.68, lon: 139.77 };
const CACHE_MS = 30 * 60 * 1000;
const RAIN_SHOW = 30; // これ以上の降水確率なら、チップにも出す（傘を持つかどうかの目安）
const readJSON = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };

/** 天気（30 分は端末のキャッシュから先に出す）と、表示する場所（端末に保存） */
export function useWeather() {
  const [loc, setLoc] = useState(() => readJSON("wxLoc", DEF_LOC));
  const [wx, setWx] = useState(() => { const d = readJSON("wxCache", null); return d && Date.now() - d._ts < CACHE_MS ? d : null; });

  useEffect(() => { try { localStorage.setItem("wxLoc", JSON.stringify(loc)); } catch {} }, [loc]);
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&hourly=temperature_2m,weather_code,precipitation_probability&forecast_days=2&timezone=Asia%2FTokyo`);
        if (!r.ok) return;
        const d = await r.json();
        if (dead || !d.current) return;
        const dy = d.daily || {}, hr = d.hourly || {};
        // いまの時間帯（ちょうど今を含む 1 時間）から 8 時間ぶん
        const now = Date.now();
        const hourly = [];
        if (hr.time && hr.temperature_2m && hr.weather_code) {
          const start = hr.time.findIndex((x) => new Date(x).getTime() + 3600000 > now);
          for (let i = Math.max(0, start); start >= 0 && i < hr.time.length && hourly.length < 8; i++) {
            const at = new Date(hr.time[i]);
            hourly.push({ h: at.getHours(), temp: Math.round(hr.temperature_2m[i]), code: hr.weather_code[i], rain: hr.precipitation_probability ? hr.precipitation_probability[i] : null, nextDay: at.getDate() !== new Date(now).getDate() });
          }
        }
        const data = {
          temp: Math.round(d.current.temperature_2m), code: d.current.weather_code,
          hi: dy.temperature_2m_max ? Math.round(dy.temperature_2m_max[0]) : null,
          lo: dy.temperature_2m_min ? Math.round(dy.temperature_2m_min[0]) : null,
          rain: dy.precipitation_probability_max ? dy.precipitation_probability_max[0] : null,
          hourly,
        };
        setWx(data);
        try { localStorage.setItem("wxCache", JSON.stringify({ ...data, _ts: Date.now() })); } catch {}
      } catch {}
    })();
    return () => { dead = true; };
  }, [loc.lat, loc.lon]);

  return { wx, loc, setLoc };
}

/** 日付の横の小さいチップ。タップで予報（WeatherPanel）を開く */
export function WeatherChip({ weather }) {
  const { wx } = weather;
  const [open, setOpen] = useState(false);
  if (!wx) return <div aria-hidden style={{ width: 76, height: 36, borderRadius: 999, background: T.bg3, flexShrink: 0 }} />;
  const [label, icon] = wxInfo(wx.code);
  const rainy = wx.rain != null && wx.rain >= RAIN_SHOW;
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`${t("wx." + label)} ${wx.temp}°`}
        style={{ display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 12px 0 9px", borderRadius: 999, border: `1px solid ${T.bd}`, background: T.bg2, cursor: "pointer", font: "inherit" }}>
        <WxIcon type={icon} sz={22} />
        <span style={{ fontSize: 15, fontWeight: 800, color: T.txH }}>{wx.temp}°</span>
        {rainy && <span style={{ fontSize: 12, fontWeight: 700, color: "#2563eb", whiteSpace: "nowrap" }}>{t("home.wxRain", { n: wx.rain })}</span>}
      </button>
      {open && <WeatherPanel weather={weather} onClose={() => setOpen(false)} />}
    </div>
  );
}

function WeatherPanel({ weather, onClose }) {
  const { wx, loc, setLoc } = weather;
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState("");
  const [res, setRes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [label, icon] = wxInfo(wx.code);

  useEffect(() => {
    if (!q.trim()) { setRes([]); setBusy(false); return; }
    setBusy(true);
    const id = setTimeout(async () => {
      try {
        const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.trim())}&count=5&language=ja`);
        const d = r.ok ? await r.json() : {};
        setRes(d.results || []);
      } catch {}
      setBusy(false);
    }, 300);
    return () => clearTimeout(id);
  }, [q]);

  const pick = (l) => { setLoc(l); setEditing(false); setQ(""); onClose(); };
  const row = { display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 10px", borderRadius: 8, border: "none", background: "none", cursor: "pointer", font: "inherit", textAlign: "left" };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 998 }} />
      <div role="dialog" aria-label={t("home.wxTitle")} style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 999, width: "min(340px, calc(100vw - 32px))", background: T.bg2, border: `1px solid ${T.bdL}`, borderRadius: 14, boxShadow: "0 12px 32px rgba(0,0,0,.18)", padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <WxIcon type={icon} sz={34} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 24, fontWeight: 800, color: T.txH, lineHeight: 1 }}>{wx.temp}°</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.txD }}>{t("wx." + label)}</span>
            </div>
            <div style={{ fontSize: 12, color: T.txD, marginTop: 4 }}>
              {wx.hi != null && wx.lo != null && t("home.wxHiLo", { hi: wx.hi, lo: wx.lo })}
              {wx.rain != null && <span style={{ marginLeft: 8, color: wx.rain >= RAIN_SHOW ? "#2563eb" : T.txD, fontWeight: wx.rain >= RAIN_SHOW ? 700 : 400 }}>{t("home.wxRain", { n: wx.rain })}</span>}
            </div>
          </div>
        </div>

        {wx.hourly?.length > 0 && <div style={{ display: "flex", gap: 2, marginTop: 12, overflowX: "auto", scrollbarWidth: "none" }}>
          {wx.hourly.map((h, i) => (
            <div key={i} style={{ flex: "1 0 34px", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "6px 0", borderRadius: 8, background: i === 0 ? T.bg3 : "transparent" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: T.txD, whiteSpace: "nowrap" }}>{i === 0 ? t("home.wxNow") : h.nextDay ? t("home.wxNextDay", { h: h.h }) : t("home.wxHour", { h: h.h })}</span>
              <WxIcon type={wxInfo(h.code)[1]} sz={18} />
              <span style={{ fontSize: 11, fontWeight: 700, color: T.txH }}>{h.temp}°</span>
              <span style={{ fontSize: 9, fontWeight: 600, color: "#3b82f6", minHeight: 11 }}>{h.rain ? `${h.rain}%` : ""}</span>
            </div>
          ))}
        </div>}

        <div style={{ borderTop: `1px solid ${T.bd}`, marginTop: 12, paddingTop: 10 }}>
          {!editing ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ display: "flex", color: T.txD }}>{I.pin}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: T.txH, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{loc.name}</span>
              <button type="button" onClick={() => setEditing(true)} style={{ background: "none", border: "none", color: T.accent, fontSize: 12.5, fontWeight: 700, cursor: "pointer", padding: 4 }}>{t("home.wxChangePlace")}</button>
            </div>
          ) : (
            <div>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", display: "flex", color: T.txD, pointerEvents: "none" }}>{I.search}</span>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("home.searchCity")} autoFocus
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px 8px 30px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 13, outline: "none" }} />
              </div>
              <div style={{ marginTop: 6, maxHeight: 180, overflowY: "auto" }}>
                {busy && <div style={{ padding: "8px 0", fontSize: 12, color: T.txD, textAlign: "center" }}>{t("home.searching")}</div>}
                {!busy && !q.trim() && <button type="button" onClick={() => pick(DEF_LOC)} style={row}>
                  <span style={{ display: "flex", color: T.accent }}>{I.pin}</span>
                  <span style={{ fontSize: 13, color: T.txH }}>{t("home.tokyo")}</span>
                  <span style={{ fontSize: 11, color: T.txD }}>{t("home.default")}</span>
                </button>}
                {res.map((r) => (
                  <button type="button" key={`${r.latitude}-${r.longitude}`} onClick={() => pick({ name: r.name, lat: r.latitude, lon: r.longitude })} style={row}>
                    <span style={{ display: "flex", color: T.txD, flexShrink: 0 }}>{I.pin}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13, color: T.txH, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                      <span style={{ display: "block", fontSize: 11, color: T.txD, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[r.admin1, r.country].filter(Boolean).join(", ")}</span>
                    </span>
                  </button>
                ))}
                {!busy && q.trim() && res.length === 0 && <div style={{ padding: "8px 0", fontSize: 12, color: T.txD, textAlign: "center" }}>{t("home.notFound", { q })}</div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
