import React, { useState, useEffect, useCallback, useMemo, useRef, createContext, useContext } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { Av } from "../shared.jsx";
import { MapEditorView } from "./MapEditorView.jsx";
import { usePresence } from "../hooks/usePresence.js";
import { useCurrentUser } from "../hooks/useCurrentUser.js";
import { useMusic } from "../hooks/useMusic.js";
import { LyricsSyncEditor } from "../components/LyricsSyncEditor.jsx";
import { showToast } from "../hooks/useToast.js";
import { t } from "../i18n.js";
import { getSupabaseClient } from "../../lib/supabase/client.js";

const OnlineContext = createContext(new Set());

const API = "";

const tabs = [
  { id: "stats", labelKey: "admin.tab.stats", icon: I.bar },
  { id: "reports", labelKey: "admin.tab.reports", icon: I.flag },
  { id: "support", labelKey: "admin.tab.support", icon: I.mail },
  { id: "users", labelKey: "admin.tab.users", icon: I.users },
  { id: "posts", labelKey: "admin.tab.posts", icon: I.feed },
  { id: "comments", labelKey: "admin.tab.comments", icon: I.chat },
  { id: "messages", labelKey: "admin.tab.messages", icon: I.chat },
  { id: "dms", labelKey: "admin.tab.dms", icon: I.mail },
  { id: "circles", labelKey: "admin.tab.circles", icon: I.circle },
  { id: "announce", labelKey: "admin.tab.announce", icon: I.mega },
  { id: "music", labelKey: "admin.tab.music", icon: I.music },
  { id: "audit", labelKey: "admin.tab.audit", icon: I.clock },
  { id: "map", labelKey: "admin.tab.map", icon: I.pin },
  { id: "syllabus", labelKey: "admin.tab.syllabus", icon: I.cal },
  { id: "syllabus_fetch", labelKey: "admin.tab.syllabusFetch", icon: I.cal },
  { id: "exams", labelKey: "admin.tab.exams", icon: I.clip },
  { id: "t2schola", labelKey: "admin.tab.t2schola", icon: I.search },
  { id: "user_analytics", labelKey: "admin.tab.userAnalytics", icon: I.bar },
  { id: "analytics", labelKey: "admin.tab.analytics", icon: I.poll },
  { id: "guests", labelKey: "admin.tab.guests", icon: I.eye },
  { id: "med_syllabus", labelKey: "admin.tab.medSyllabus", icon: I.cal },
  { id: "med_fetch", labelKey: "admin.tab.medFetch", icon: I.cal },
  { id: "moodle_capture", labelKey: "admin.tab.moodleCapture", icon: I.search },
  { id: "settings", labelKey: "admin.tab.settings", icon: I.shield },
];

const Card = ({ label, value, color }) => (
  <div style={{ flex: 1, minWidth: 140, padding: 20, borderRadius: 14, background: T.bg3, border: `1px solid ${T.bd}` }}>
    <div style={{ fontSize: 12, color: T.txD, marginBottom: 6 }}>{label}</div>
    <div style={{ fontSize: 28, fontWeight: 700, color: color || T.txH }}>{value ?? "..."}</div>
  </div>
);

const Pager = ({ page, total, limit, onPage }) => {
  const pages = Math.ceil(total / limit);
  if (pages <= 1) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", padding: "12px 0" }}>
      <button disabled={page <= 0} onClick={() => onPage(page - 1)} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, cursor: page > 0 ? "pointer" : "default", opacity: page > 0 ? 1 : 0.4, fontSize: 13 }}>{t("admin.prev")}</button>
      <span style={{ fontSize: 13, color: T.txD }}>{page + 1} / {pages}</span>
      <button disabled={page >= pages - 1} onClick={() => onPage(page + 1)} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, cursor: page < pages - 1 ? "pointer" : "default", opacity: page < pages - 1 ? 1 : 0.4, fontSize: 13 }}>{t("admin.next")}</button>
    </div>
  );
};

const Btn = ({ onClick, color, children, disabled, small }) => (
  <button onClick={onClick} disabled={disabled} style={{
    display: "flex", alignItems: "center", gap: 4,
    padding: small ? "4px 8px" : "5px 12px", borderRadius: 8,
    border: `1px solid ${color}30`, background: `${color}10`, color,
    cursor: disabled ? "default" : "pointer", fontSize: 12, fontWeight: 500,
    opacity: disabled ? 0.5 : 1,
  }}>{children}</button>
);

const Badge = ({ text, color }) => (
  <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, background: `${color}20`, color, fontWeight: 500 }}>{text}</span>
);

const SearchBar = ({ value, onChange, onSearch, placeholder = t("admin.searchPh"), width = 200 }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, background: T.bg3, border: `1px solid ${T.bd}`, width }}>
    <span style={{ color: T.txD, display: "flex" }}>{I.search}</span>
    <input value={value} onChange={e => onChange(e.target.value)} onKeyDown={e => { if (e.key === "Enter") onSearch(); }} placeholder={placeholder} style={{ flex: 1, border: "none", background: "transparent", color: T.txH, fontSize: 13, outline: "none" }} />
  </div>
);

// ---- Mini bar chart for trends ----
const MiniChart = ({ data, color, height = 60 }) => {
  const entries = Object.entries(data).sort((a, b) => a[0].localeCompare(b[0]));
  if (!entries.length) return <div style={{ fontSize: 12, color: T.txD }}>{t("admin.noData")}</div>;
  const max = Math.max(...entries.map(([, v]) => typeof v === "number" ? v : v.total || 0), 1);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height }}>
        {entries.map(([day, v]) => {
          const val = typeof v === "number" ? v : v.total || 0;
          const h = Math.max((val / max) * height, 2);
          return (
            <div key={day} title={`${day}: ${val}`} style={{ flex: 1, minWidth: 4, maxWidth: 16, height: h, borderRadius: 2, background: color || T.accent, cursor: "default" }} />
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: T.txD, marginTop: 2 }}>
        <span>{entries[0]?.[0]?.slice(5)}</span>
        <span>{entries[entries.length - 1]?.[0]?.slice(5)}</span>
      </div>
    </div>
  );
};

// ---- Richer SVG charts for the Analytics tab ----
const fmtDay = (d) => (d || "").slice(5); // YYYY-MM-DD -> MM-DD
const niceMax = (v) => {
  if (v <= 5) return Math.max(Math.ceil(v), 1);
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
};

// Line chart with y-axis, gridlines, optional area fill and an interactive tooltip.
const LineChart = ({ data, valueKey, color = T.accent, height = 150, area = true, fmt = (v) => v }) => {
  const [hover, setHover] = useState(null);
  const W = 600, padL = 44, padR = 12, padT = 10, padB = 22;
  const pts = (data || []).map(d => ({ x: d.day, y: Number(d[valueKey]) || 0 }));
  if (!pts.length) return <div style={{ fontSize: 12, color: T.txD }}>{t("admin.noData")}</div>;
  const maxY = niceMax(Math.max(...pts.map(p => p.y), 1));
  const innerW = W - padL - padR, innerH = height - padT - padB;
  const X = (i) => padL + (pts.length === 1 ? innerW / 2 : (i / (pts.length - 1)) * innerW);
  const Y = (v) => padT + innerH - (v / maxY) * innerH;
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join(" ");
  const areaPath = `${line} L${X(pts.length - 1).toFixed(1)},${(padT + innerH).toFixed(1)} L${X(0).toFixed(1)},${(padT + innerH).toFixed(1)} Z`;
  const ticks = [0, 0.5, 1].map(f => Math.round(maxY * f));
  const xLabelIdx = [0, Math.floor(pts.length / 2), pts.length - 1];
  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} preserveAspectRatio="none"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const rx = ((e.clientX - rect.left) / rect.width) * W;
          let idx = pts.length === 1 ? 0 : Math.round(((rx - padL) / innerW) * (pts.length - 1));
          setHover(Math.max(0, Math.min(pts.length - 1, idx)));
        }}>
        {ticks.map((tk, i) => {
          const yy = Y(tk);
          return (
            <g key={i}>
              <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke={T.bd} strokeWidth="1" />
              <text x={padL - 6} y={yy + 3} textAnchor="end" fontSize="9" fill={T.txD}>{tk}</text>
            </g>
          );
        })}
        {area && <path d={areaPath} fill={color} fillOpacity="0.12" stroke="none" />}
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        {hover != null && (
          <g>
            <line x1={X(hover)} y1={padT} x2={X(hover)} y2={padT + innerH} stroke={color} strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={X(hover)} cy={Y(pts[hover].y)} r="3.5" fill={color} stroke={T.bg2} strokeWidth="1.5" />
          </g>
        )}
        {xLabelIdx.map((i, k) => (
          <text key={k} x={X(i)} y={height - 6} textAnchor={k === 0 ? "start" : k === 2 ? "end" : "middle"} fontSize="9" fill={T.txD}>{fmtDay(pts[i].x)}</text>
        ))}
      </svg>
      {hover != null && (
        <div style={{ position: "absolute", top: 4, left: "50%", transform: "translateX(-50%)", background: T.bg2, border: `1px solid ${T.bd}`, borderRadius: 8, padding: "4px 10px", fontSize: 11, color: T.txH, pointerEvents: "none", whiteSpace: "nowrap" }}>
          <span style={{ color: T.txD }}>{pts[hover].x}</span> · <b style={{ color }}>{fmt(pts[hover].y)}</b>
        </div>
      )}
    </div>
  );
};

// Stacked bar chart (1+ series) with y-axis, gridlines and a per-day tooltip.
const StackedBars = ({ data, keys, height = 160 }) => {
  const [hover, setHover] = useState(null);
  const rows = data || [];
  if (!rows.length) return <div style={{ fontSize: 12, color: T.txD }}>{t("admin.noData")}</div>;
  const totals = rows.map(r => keys.reduce((s, k) => s + (Number(r[k.key]) || 0), 0));
  const maxY = niceMax(Math.max(...totals, 1));
  const W = 600, padL = 44, padR = 12, padT = 10, padB = 22;
  const innerW = W - padL - padR, innerH = height - padT - padB;
  const bw = innerW / rows.length;
  const ticks = [0, 0.5, 1].map(f => Math.round(maxY * f));
  const xLabelIdx = [0, Math.floor(rows.length / 2), rows.length - 1];
  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} preserveAspectRatio="none" onMouseLeave={() => setHover(null)}>
        {ticks.map((tk, i) => {
          const yy = padT + innerH - (tk / maxY) * innerH;
          return (
            <g key={i}>
              <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke={T.bd} strokeWidth="1" />
              <text x={padL - 6} y={yy + 3} textAnchor="end" fontSize="9" fill={T.txD}>{tk}</text>
            </g>
          );
        })}
        {rows.map((r, i) => {
          let yAcc = padT + innerH;
          const x = padL + i * bw;
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              {keys.map(k => {
                const v = Number(r[k.key]) || 0;
                const h = (v / maxY) * innerH;
                yAcc -= h;
                if (v === 0) return null;
                return <rect key={k.key} x={x + bw * 0.12} y={yAcc} width={Math.max(bw * 0.76, 0.5)} height={h} fill={k.color} />;
              })}
              <rect x={x} y={padT} width={bw} height={innerH} fill="transparent" />
            </g>
          );
        })}
        {xLabelIdx.map((i, k) => (
          <text key={k} x={padL + i * bw + bw / 2} y={height - 6} textAnchor={k === 0 ? "start" : k === 2 ? "end" : "middle"} fontSize="9" fill={T.txD}>{fmtDay(rows[i].day)}</text>
        ))}
      </svg>
      {hover != null && (
        <div style={{ position: "absolute", top: 4, left: "50%", transform: "translateX(-50%)", background: T.bg2, border: `1px solid ${T.bd}`, borderRadius: 8, padding: "6px 10px", fontSize: 11, color: T.txH, pointerEvents: "none", whiteSpace: "nowrap" }}>
          <div style={{ color: T.txD, marginBottom: 3 }}>{rows[hover].day}</div>
          {keys.map(k => (
            <div key={k.key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: k.color, display: "inline-block" }} /> {k.label}: <b>{Number(rows[hover][k.key]) || 0}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ChartCard = ({ title, desc, children }) => (
  <div style={{ padding: 16, borderRadius: 14, background: T.bg3, border: `1px solid ${T.bd}`, marginBottom: 16 }}>
    <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: desc ? 2 : 10 }}>{title}</div>
    {desc && <div style={{ fontSize: 11, color: T.txD, marginBottom: 10 }}>{desc}</div>}
    {children}
  </div>
);

const ChartLegend = ({ items }) => (
  <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10 }}>
    {items.map(it => (
      <div key={it.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: T.txD }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: it.color, display: "inline-block" }} /> {it.label}
      </div>
    ))}
  </div>
);

// ---- Analytics Tab (growth & activity time-series) ----
const AnalyticsTab = () => {
  const [range, setRange] = useState(90);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/api/admin?action=analytics&range=${range}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [range]);

  const stats = useMemo(() => {
    if (!data?.growth?.length) return null;
    const g = data.growth, a = data.activity || [];
    const newInPeriod = g.reduce((s, r) => s + r.new, 0);
    const baseline = (g[0]?.cumulative || 0) - (g[0]?.new || 0);
    const growthRate = baseline > 0 ? (newInPeriod / baseline) * 100 : null;
    const peakReg = g.reduce((m, r) => (r.new > m.new ? r : m), g[0]);
    const avgActive = a.length ? a.reduce((s, r) => s + r.active, 0) / a.length : 0;
    const totalContent = a.reduce((s, r) => s + r.posts + r.comments + r.messages + r.dms, 0);
    const sn = data.snapshot || {};
    const stickiness = sn.mau > 0 ? (sn.dau / sn.mau) * 100 : null;
    return { newInPeriod, growthRate, peakReg, avgActive, totalContent, stickiness };
  }, [data]);

  const sn = data?.snapshot || {};
  const contentKeys = [
    { key: "posts", label: t("admin.stat.postsShort"), color: T.accent },
    { key: "comments", label: t("admin.stat.commentsShort"), color: T.green },
    { key: "messages", label: t("admin.stat.chat"), color: T.orange },
    { key: "dms", label: "DM", color: "#c6a236" },
  ];

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>{t("admin.an.title")}</div>
        <div style={{ display: "flex", gap: 6 }}>
          {[30, 90, 180, 365].map(r => (
            <button key={r} onClick={() => setRange(r)} style={{
              padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: range === r ? 600 : 400,
              border: `1px solid ${range === r ? T.accent : T.bd}`,
              background: range === r ? `${T.accent}18` : T.bg3, color: range === r ? T.accent : T.txD, cursor: "pointer",
            }}>{t("admin.an.daysN", { n: r })}</button>
          ))}
        </div>
      </div>

      {loading && <div style={{ color: T.txD, fontSize: 13 }}>{t("common.loading")}</div>}
      {!loading && !data && <div style={{ color: T.txD, fontSize: 13 }}>{t("admin.fetchDataFailed")}</div>}
      {!loading && data && (
        <>
          {/* Live snapshot */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <Card label={t("admin.an.totalUsers")} value={sn.total} color={T.accent} />
            <Card label={t("admin.stat.dau")} value={sn.dau} color={T.green} />
            <Card label={t("admin.stat.wau")} value={sn.wau} color={T.accent} />
            <Card label={t("admin.stat.mau")} value={sn.mau} color={T.orange} />
            <Card label={t("admin.an.stickiness")} value={stats?.stickiness != null ? `${stats.stickiness.toFixed(1)}%` : "-"} color="#c6a236" />
          </div>
          {/* Period summary */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
            <Card label={t("admin.an.newInPeriod")} value={stats?.newInPeriod} color={T.green} />
            <Card label={t("admin.an.avgPerDay")} value={stats ? (stats.newInPeriod / range).toFixed(1) : "-"} color={T.accent} />
            <Card label={t("admin.an.growthRate")} value={stats?.growthRate != null ? `+${stats.growthRate.toFixed(1)}%` : "-"} color={T.green} />
            <Card label={t("admin.an.avgActive")} value={stats ? stats.avgActive.toFixed(1) : "-"} color={T.orange} />
            <Card label={t("admin.an.totalContent")} value={stats?.totalContent} color="#c6a236" />
          </div>

          <ChartCard title={t("admin.an.userGrowth")} desc={t("admin.an.userGrowthDesc")}>
            <LineChart data={data.growth} valueKey="cumulative" color={T.accent} height={170} />
          </ChartCard>

          <ChartCard title={t("admin.an.newUsers")} desc={stats?.peakReg ? t("admin.an.peakDay", { day: stats.peakReg.day, n: stats.peakReg.new }) : undefined}>
            <StackedBars data={data.growth} keys={[{ key: "new", label: t("admin.an.newUsers"), color: T.green }]} height={140} />
          </ChartCard>

          <ChartCard title={t("admin.an.activeUsers")} desc={t("admin.an.activeUsersDesc")}>
            <LineChart data={data.activity} valueKey="active" color={T.orange} height={150} />
          </ChartCard>

          <ChartCard title={t("admin.an.contentActivity")} desc={t("admin.an.contentActivityDesc")}>
            <StackedBars data={data.activity} keys={contentKeys} height={170} />
            <ChartLegend items={contentKeys} />
          </ChartCard>

          {data.source === "fallback" && (
            <div style={{ fontSize: 11, color: T.txD, marginTop: -6 }}>{t("admin.an.fallbackNote")}</div>
          )}
        </>
      )}
    </div>
  );
};

// ---- User Detail Modal ----
const UserDetailModal = ({ userId, onClose }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/api/admin?action=user_detail&user_id=${userId}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ background: T.bg2, borderRadius: 16, border: `1px solid ${T.bd}`, maxWidth: 600, width: "100%", maxHeight: "80vh", overflow: "auto", padding: 20 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>{t("admin.userDetail.title")}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", display: "flex" }}>{I.x}</button>
        </div>
        {loading && <div style={{ color: T.txD, fontSize: 13 }}>{t("common.loading")}</div>}
        {data && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, padding: 14, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}` }}>
              <Av u={{ name: data.profile?.name, col: data.profile?.color, avatar: data.profile?.avatar }} sz={48} />
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: T.txH }}>{data.profile?.name || t("admin.unknown")}</div>
                <div style={{ fontSize: 12, color: T.txD, fontFamily: "monospace" }}>ID: {data.profile?.moodle_id} | {t("admin.dept")}: {data.profile?.dept || "-"}</div>
                <div style={{ fontSize: 11, color: T.txD }}>
                  {t("admin.registered")}: {data.profile?.created_at ? new Date(data.profile.created_at).toLocaleDateString("ja-JP") : "-"}
                  {data.profile?.last_active_at && ` | ${t("admin.lastActive")}: ${new Date(data.profile.last_active_at).toLocaleString("ja-JP")}`}
                </div>
                {data.profile?.banned && <Badge text={t("admin.banned")} color={T.red} />}
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              <Card label={t("admin.stat.posts")} value={data.postsTotal} color={T.accent} />
              <Card label={t("admin.stat.comments")} value={data.commentsTotal} color={T.green} />
              <Card label={t("admin.stat.dmsSent")} value={data.dmsSent} color={T.orange} />
              <Card label={t("admin.stat.reportsMade")} value={data.reportsMadeTotal} color={T.yellow} />
              <Card label={t("admin.stat.reportsReceived")} value={data.reportsReceivedTotal} color={T.red} />
            </div>
            {data.posts.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 8 }}>{t("admin.recentPosts")}</div>
                {data.posts.slice(0, 5).map(p => (
                  <div key={p.id} style={{ fontSize: 12, color: T.tx, padding: "6px 10px", borderRadius: 6, background: T.bg3, marginBottom: 4, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 60, overflow: "hidden" }}>
                    <span style={{ fontSize: 10, color: T.txD }}>[{p.type}] {new Date(p.created_at).toLocaleDateString("ja-JP")}</span> {p.text?.slice(0, 200)}
                  </div>
                ))}
              </div>
            )}
            {data.reportsReceived.length > 0 && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 8 }}>{t("admin.reportHistory")}</div>
                {data.reportsReceived.map(r => (
                  <div key={r.id} style={{ fontSize: 12, color: T.tx, padding: "6px 10px", borderRadius: 6, background: T.bg3, marginBottom: 4, display: "flex", gap: 8, alignItems: "center" }}>
                    <Badge text={r.reason} color={T.orange} />
                    <Badge text={r.status} color={r.status === "pending" ? T.orange : r.status === "resolved" ? T.green : T.txD} />
                    <span style={{ fontSize: 10, color: T.txD }}>{new Date(r.created_at).toLocaleDateString("ja-JP")}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ---- Stats Tab ----
const StatsTab = () => {
  const [stats, setStats] = useState(null);
  const [reportTrends, setReportTrends] = useState(null);
  const [regStats, setRegStats] = useState(null);
  const [featureStats, setFeatureStats] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/admin?action=stats`).then(r => r.json()).then(setStats).catch(() => {});
    fetch(`${API}/api/admin?action=report_trends`).then(r => r.json()).then(d => setReportTrends(d.trends)).catch(() => {});
    fetch(`${API}/api/admin?action=registration_stats`).then(r => r.json()).then(d => setRegStats(d.registrations)).catch(() => {});
    fetch(`${API}/api/admin?action=feature_stats`).then(r => r.json()).then(setFeatureStats).catch(() => {});
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, marginBottom: 16 }}>{t("admin.stats.overview")}</div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Card label={t("admin.stat.users")} value={stats?.users} color={T.accent} />
        <Card label={t("admin.stat.posts")} value={stats?.posts} color={T.green} />
        <Card label={t("admin.stat.chatMessages")} value={stats?.messages} color={T.orange} />
        <Card label="DM" value={stats?.dms} color="#c6a236" />
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
        <Card label={t("admin.stat.reportsPending")} value={stats?.reportsPending} color={T.red} />
        <Card label={t("admin.stat.reportsTotal")} value={stats?.reportsTotal} color={T.orange} />
        <Card label={t("admin.stat.supportPending")} value={stats?.supportPending} color={T.accent} />
        <Card label={t("admin.stat.bannedUsers")} value={stats?.bannedUsers} color={T.red} />
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, margin: "20px 0 12px" }}>{t("admin.stats.activeUsers")}</div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Card label={t("admin.stat.dau")} value={stats?.dau} color={T.green} />
        <Card label={t("admin.stat.wau")} value={stats?.wau} color={T.accent} />
        <Card label={t("admin.stat.mau")} value={stats?.mau} color={T.orange} />
        <Card label={t("admin.stat.circles")} value={stats?.circles} color={T.accentSoft || T.accent} />
      </div>

      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, margin: "24px 0 12px" }}>{t("admin.stats.trends")}</div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200, padding: 16, borderRadius: 14, background: T.bg3, border: `1px solid ${T.bd}` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 10 }}>{t("admin.stats.reportTrend")}</div>
          {reportTrends ? <MiniChart data={reportTrends} color={T.red} /> : <div style={{ fontSize: 12, color: T.txD }}>{t("common.loading")}</div>}
        </div>
        <div style={{ flex: 1, minWidth: 200, padding: 16, borderRadius: 14, background: T.bg3, border: `1px solid ${T.bd}` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 10 }}>{t("admin.stats.regTrend")}</div>
          {regStats ? <MiniChart data={regStats} color={T.green} /> : <div style={{ fontSize: 12, color: T.txD }}>{t("common.loading")}</div>}
        </div>
      </div>

      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, margin: "24px 0 12px" }}>{t("admin.stats.featureUsage")}</div>
      {featureStats ? (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Card label={t("admin.stat.postsShort")} value={featureStats.week?.posts} color={T.accent} />
          <Card label={t("admin.stat.commentsShort")} value={featureStats.week?.comments} color={T.green} />
          <Card label={t("admin.stat.chat")} value={featureStats.week?.messages} color={T.orange} />
          <Card label="DM" value={featureStats.week?.dms} color="#c6a236" />
          <Card label={t("admin.stat.circleChat")} value={featureStats.week?.circleMessages} color={T.accentSoft || T.accent} />
        </div>
      ) : <div style={{ fontSize: 12, color: T.txD }}>{t("common.loading")}</div>}
      {featureStats?.week?.postTypes && (
        <div style={{ marginTop: 12, padding: 14, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}` }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.txH, marginBottom: 8 }}>{t("admin.stats.postTypeBreakdown")}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Object.entries(featureStats.week.postTypes).map(([type, count]) => (
              <Badge key={type} text={`${type}: ${count}`} color={T.accent} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ---- Reports Tab ----
const REPORT_REASON_KEYS = { spam: "admin.reason.spam", harassment: "admin.reason.harassment", inappropriate: "admin.reason.inappropriate", copyright: "admin.reason.copyright", other: "admin.reason.other" };
const REPORT_STATUS_KEYS = { pending: "admin.status.pending", reviewed: "admin.status.reviewed", resolved: "admin.status.resolved", dismissed: "admin.status.dismissed" };
const REPORT_STATUS_COLORS = { pending: T.orange, reviewed: T.accent, resolved: T.green, dismissed: T.txD };

const ReportsTab = () => {
  const [reports, setReports] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState("pending");
  const [loading, setLoading] = useState(false);

  const load = useCallback((p, f) => {
    setLoading(true);
    let qs = `action=reports&page=${p}`;
    if (f) qs += `&status=${f}`;
    fetch(`${API}/api/admin?${qs}`)
      .then(r => r.json())
      .then(d => { setReports(d.reports || []); setTotal(d.total || 0); setPage(d.page || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(0, filter); }, [load, filter]);

  const handleResolve = async (id, status) => {
    const note = status === 'dismissed' ? prompt(t("admin.report.dismissReasonPrompt")) : prompt(t("admin.report.notePrompt"));
    const r = await fetch(`${API}/api/admin`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resolve_report", reportId: id, status, adminNote: note || "" }),
    });
    if (r.ok) load(page, filter);
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>{t("admin.report.manage")} ({total})</div>
        <div style={{ flex: 1 }} />
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 13, outline: "none" }}>
          <option value="">{t("admin.all")}</option>
          <option value="pending">{t("admin.status.pending")}</option>
          <option value="reviewed">{t("admin.status.reviewed")}</option>
          <option value="resolved">{t("admin.status.resolved")}</option>
          <option value="dismissed">{t("admin.status.dismissed")}</option>
        </select>
      </div>
      {loading && <div style={{ color: T.txD, fontSize: 13 }}>{t("common.loading")}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {reports.map(r => (
          <div key={r.id} style={{ padding: 14, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <Badge text={REPORT_STATUS_KEYS[r.status] ? t(REPORT_STATUS_KEYS[r.status]) : r.status} color={REPORT_STATUS_COLORS[r.status] || T.txD} />
              <Badge text={REPORT_REASON_KEYS[r.reason] ? t(REPORT_REASON_KEYS[r.reason]) : r.reason} color={T.orange} />
              <Badge text={r.target_type} color={T.accent} />
              <span style={{ fontSize: 11, color: T.txD, marginLeft: "auto" }}>{r.created_at ? new Date(r.created_at).toLocaleString("ja-JP") : ""}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: T.txD }}>{t("admin.report.reporter")}:</span>
              <Av u={{ name: r.reporter?.name, col: r.reporter?.color, avatar: r.reporter?.avatar }} sz={20} />
              <span style={{ fontSize: 13, color: T.txH }}>{r.reporter?.name || t("admin.unknown")}</span>
              {r.target_user && <>
                <span style={{ fontSize: 12, color: T.txD, marginLeft: 12 }}>{t("admin.report.target")}:</span>
                <Av u={{ name: r.target_user?.name, col: r.target_user?.color, avatar: r.target_user?.avatar }} sz={20} />
                <span style={{ fontSize: 13, color: T.txH }}>{r.target_user?.name || t("admin.unknown")}</span>
              </>}
            </div>
            {r.detail && <div style={{ fontSize: 13, color: T.tx, marginBottom: 8, padding: "8px 12px", borderRadius: 8, background: T.bg2, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{r.detail}</div>}
            {r.admin_note && <div style={{ fontSize: 12, color: T.txD, marginBottom: 8 }}>{t("admin.report.adminNote")}: {r.admin_note}</div>}
            <div style={{ fontSize: 11, color: T.txD, marginBottom: 8 }}>{t("admin.report.targetId")}: {r.target_id}</div>
            {r.status === 'pending' && (
              <div style={{ display: "flex", gap: 8 }}>
                <Btn onClick={() => handleResolve(r.id, 'resolved')} color={T.green}>{t("admin.report.markResolved")}</Btn>
                <Btn onClick={() => handleResolve(r.id, 'dismissed')} color={T.txD}>{t("admin.status.dismissed")}</Btn>
              </div>
            )}
          </div>
        ))}
        {!loading && reports.length === 0 && <div style={{ padding: 32, textAlign: "center", color: T.txD, fontSize: 13 }}>{t("admin.report.empty")}</div>}
      </div>
      <Pager page={page} total={total} limit={30} onPage={p => load(p, filter)} />
    </div>
  );
};

// ---- Support Tab (運営チャット) ----
const FB_CAT_KEYS = { bug: "admin.fbcat.bug", feature: "admin.fbcat.feature", question: "admin.fbcat.question", account: "admin.fbcat.account", other: "admin.fbcat.other" };
const FB_STATUS_KEYS = { open: "admin.fbstatus.open", in_progress: "admin.fbstatus.in_progress", resolved: "admin.fbstatus.resolved", closed: "admin.fbstatus.closed" };
const FB_STATUS_COLORS = { open: T.orange, in_progress: T.accent, resolved: T.green, closed: T.txD };
const FB_CAT_COLORS = { bug: T.red, feature: T.accent, question: T.yellow, account: T.orange, other: T.txD };
const fbTime = (iso) => { try { return new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

const SupportTab = () => {
  const [tickets, setTickets] = useState([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const scrollDown = () => requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; });

  const loadList = useCallback((f) => {
    setLoading(true);
    let qs = `action=support_tickets`;
    if (f) qs += `&status=${f}`;
    fetch(`${API}/api/admin?${qs}`)
      .then(r => r.json())
      .then(d => setTickets(d.tickets || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadThread = useCallback((id) => {
    fetch(`${API}/api/admin?action=support_thread&ticketId=${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { setTicket(d.ticket); setMessages(d.messages || []); scrollDown(); } })
      .catch(() => {});
  }, []);

  useEffect(() => { loadList(filter); }, [loadList, filter]);
  useEffect(() => { if (activeId) loadThread(activeId); }, [activeId, loadThread]);

  // Realtime: ping on support_admin for any new ticket/message
  useEffect(() => {
    const sb = getSupabaseClient();
    const ch = sb.channel("support_admin")
      .on("broadcast", { event: "new" }, () => { loadList(filter); if (activeId) loadThread(activeId); })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [filter, activeId, loadList, loadThread]);

  const handleReply = async () => {
    const text = draft.trim();
    if (!text || sending || !activeId) return;
    setSending(true);
    try {
      const r = await fetch(`${API}/api/admin`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "support_reply", ticketId: activeId, body: text }),
      });
      if (r.ok) { setDraft(""); loadThread(activeId); loadList(filter); }
    } finally { setSending(false); }
  };

  const handleStatus = async (status) => {
    if (!activeId) return;
    const r = await fetch(`${API}/api/admin`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "support_status", ticketId: activeId, status }),
    });
    if (r.ok) { loadThread(activeId); loadList(filter); }
  };

  return (
    <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
      {/* ── ticket list ── */}
      <div style={{ width: 300, flexShrink: 0, borderRight: `1px solid ${T.bd}`, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ padding: 12, borderBottom: `1px solid ${T.bd}`, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: T.txH, flex: 1 }}>{t("admin.support.manage")}</span>
          <select value={filter} onChange={e => setFilter(e.target.value)} style={{ padding: "5px 8px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 12, outline: "none" }}>
            <option value="">{t("admin.all")}</option>
            <option value="open">{t("admin.fbstatus.open")}</option>
            <option value="in_progress">{t("admin.fbstatus.in_progress")}</option>
            <option value="resolved">{t("admin.fbstatus.resolved")}</option>
            <option value="closed">{t("admin.fbstatus.closed")}</option>
          </select>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
          {loading && <div style={{ color: T.txD, fontSize: 13, padding: 16 }}>{t("common.loading")}</div>}
          {!loading && tickets.length === 0 && <div style={{ color: T.txD, fontSize: 13, padding: 24, textAlign: "center" }}>{t("admin.support.empty")}</div>}
          {tickets.map(tk => (
            <button key={tk.id} onClick={() => setActiveId(tk.id)}
              style={{ width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 10, marginBottom: 6, cursor: "pointer", border: `1px solid ${activeId === tk.id ? T.accent : T.bd}`, background: activeId === tk.id ? `${T.accent}12` : T.bg3, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Badge text={t(FB_STATUS_KEYS[tk.status] || tk.status)} color={FB_STATUS_COLORS[tk.status] || T.txD} />
                {tk.unread > 0 && <span style={{ minWidth: 16, height: 16, borderRadius: 8, background: T.red, color: "#fff", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{tk.unread}</span>}
                <span style={{ fontSize: 10, color: T.txD, marginLeft: "auto" }}>{fbTime(tk.last_message_at)}</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.txH, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tk.subject}</span>
              <span style={{ fontSize: 11, color: T.txD }}>{tk.user?.name || t("admin.unknown")}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── conversation ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        {!activeId ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: T.txD, fontSize: 13 }}>{t("admin.support.selectPrompt")}</div>
        ) : (
          <>
            <div style={{ padding: 12, borderBottom: `1px solid ${T.bd}`, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.txH, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ticket?.subject}</div>
                <div style={{ fontSize: 11, color: T.txD, display: "flex", alignItems: "center", gap: 6 }}>
                  <Av u={{ name: ticket?.user?.name, col: ticket?.user?.color, avatar: ticket?.user?.avatar }} sz={16} />
                  {ticket?.user?.name || t("admin.unknown")} · {ticket && t(FB_CAT_KEYS[ticket.category] || ticket.category)}
                </div>
              </div>
              <div style={{ flex: 1 }} />
              {ticket && ticket.status !== "in_progress" && <Btn onClick={() => handleStatus("in_progress")} color={T.accent}>{t("admin.fbstatus.in_progress")}</Btn>}
              {ticket && ticket.status !== "resolved" && <Btn onClick={() => handleStatus("resolved")} color={T.green}>{t("admin.support.markResolved")}</Btn>}
              {ticket && ticket.status !== "closed" && <Btn onClick={() => handleStatus("closed")} color={T.txD}>{t("admin.support.close")}</Btn>}
            </div>
            {ticket?.diagnostics && (
              <div style={{ fontSize: 11, color: T.txD, padding: "6px 12px", fontFamily: "monospace", wordBreak: "break-all", borderBottom: `1px solid ${T.bd}` }}>
                {Object.entries(ticket.diagnostics).map(([k, v]) => `${k}=${v}`).join("  ")}
              </div>
            )}
            <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              {messages.map(m => {
                const admin = m.sender_role === "admin";
                return (
                  <div key={m.id} style={{ alignSelf: admin ? "flex-end" : "flex-start", maxWidth: "80%" }}>
                    <div style={{ fontSize: 10, color: T.txD, marginBottom: 2, textAlign: admin ? "right" : "left" }}>{admin ? t("admin.support.staff") : (ticket?.user?.name || t("admin.support.userSide"))} · {fbTime(m.created_at)}</div>
                    <div style={{ padding: "9px 13px", borderRadius: 14, background: admin ? T.accent : T.bg3, color: admin ? "#fff" : T.txH, fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word", border: admin ? "none" : `1px solid ${T.bd}` }}>{m.body}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8, padding: 12, borderTop: `1px solid ${T.bd}` }}>
              <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={1}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && (e.metaKey || e.ctrlKey || true)) { if (!e.shiftKey) { e.preventDefault(); handleReply(); } } }}
                placeholder={t("admin.support.replyPlaceholder")}
                style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 14, outline: "none", resize: "none", boxSizing: "border-box", maxHeight: 120 }} />
              <button onClick={handleReply} disabled={sending || !draft.trim()} style={{ padding: "0 18px", borderRadius: 10, border: "none", background: T.accent, color: "#fff", fontSize: 14, fontWeight: 700, cursor: sending || !draft.trim() ? "default" : "pointer", opacity: sending || !draft.trim() ? 0.5 : 1 }}>{t("support.send")}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ---- Users Tab ----
const UsersTab = () => {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [detailUser, setDetailUser] = useState(null);
  const onlineIds = useContext(OnlineContext);

  const load = useCallback((p, q, f) => {
    setLoading(true);
    let qs = `action=users&page=${p}`;
    if (q) qs += `&search=${encodeURIComponent(q)}`;
    if (f) qs += `&filter=${f}`;
    fetch(`${API}/api/admin?${qs}`)
      .then(r => r.json())
      .then(d => { setUsers(d.users || []); setTotal(d.total || 0); setPage(d.page || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(0, "", ""); }, [load]);

  const handleBan = async (userId, name) => {
    const reason = prompt(t("admin.user.banReasonPrompt", { name: name || t("admin.user.thisUser") }));
    if (reason === null) return;
    const r = await fetch(`${API}/api/admin`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ban_user", moodleUserId: userId, reason }),
    });
    if (r.ok) load(page, search, filter);
  };

  const handleEditName = async (userId, currentName) => {
    const newName = prompt(t("admin.user.editNamePrompt"), currentName || "");
    if (!newName || newName === currentName) return;
    const r = await fetch(`${API}/api/admin`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "edit_profile", moodleUserId: userId, name: newName }),
    });
    if (r.ok) load(page, search, filter);
  };

  const handleUnban = async (userId) => {
    if (!confirm(t("admin.user.confirmUnban"))) return;
    const r = await fetch(`${API}/api/admin`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unban_user", moodleUserId: userId }),
    });
    if (r.ok) load(page, search, filter);
  };

  return (
    <div style={{ padding: 16 }}>
      {detailUser && <UserDetailModal userId={detailUser} onClose={() => setDetailUser(null)} />}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>{t("admin.user.manage")} ({total})</div>
        <div style={{ flex: 1 }} />
        <select value={filter} onChange={e => { setFilter(e.target.value); load(0, search, e.target.value); }} style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 13, outline: "none" }}>
          <option value="">{t("admin.all")}</option>
          <option value="online">{t("admin.user.onlineOnly")}</option>
          <option value="offline">{t("admin.user.offlineOnly")}</option>
          <option value="banned">{t("admin.user.bannedOnly")}</option>
        </select>
        <SearchBar value={search} onChange={setSearch} onSearch={() => load(0, search, filter)} placeholder={t("admin.user.searchByName")} />
      </div>
      {loading && <div style={{ color: T.txD, fontSize: 13 }}>{t("common.loading")}</div>}
      <div style={{ borderRadius: 12, border: `1px solid ${T.bd}`, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: T.bg3, borderBottom: `1px solid ${T.bd}` }}>
              <th style={{ padding: "10px 12px", textAlign: "center", color: T.txD, fontWeight: 600, width: 40 }}>{t("admin.col.state")}</th>
              <th style={{ padding: "10px 12px", textAlign: "left", color: T.txD, fontWeight: 600 }}>{t("admin.col.user")}</th>
              <th style={{ padding: "10px 12px", textAlign: "left", color: T.txD, fontWeight: 600 }}>ID</th>
              <th style={{ padding: "10px 12px", textAlign: "left", color: T.txD, fontWeight: 600 }}>{t("admin.dept")}</th>
              <th style={{ padding: "10px 12px", textAlign: "left", color: T.txD, fontWeight: 600 }}>{t("admin.col.year")}</th>
              <th style={{ padding: "10px 12px", textAlign: "left", color: T.txD, fontWeight: 600 }}>{t("admin.col.isctAuth")}</th>
              <th style={{ padding: "10px 12px", textAlign: "left", color: T.txD, fontWeight: 600 }}>{t("admin.col.titechAuth")}</th>
              <th style={{ padding: "10px 12px", textAlign: "left", color: T.txD, fontWeight: 600 }}>{t("admin.col.regDate")}</th>
              <th style={{ padding: "10px 12px", textAlign: "right", color: T.txD, fontWeight: 600 }}>{t("admin.col.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {users.filter(u => {
              if (filter === "online") return onlineIds.has(String(u.moodle_id));
              if (filter === "offline") return !onlineIds.has(String(u.moodle_id));
              return true;
            }).map(u => {
              const isOn = onlineIds.has(String(u.moodle_id));
              return (
              <tr key={u.moodle_id || u.id} style={{ borderBottom: `1px solid ${T.bd}` }}>
                <td style={{ padding: "8px 12px", textAlign: "center" }}>
                  <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: isOn ? T.green : T.txD, opacity: isOn ? 1 : 0.35 }} title={isOn ? t("admin.online") : t("admin.offline")} />
                </td>
                <td style={{ padding: "8px 12px", color: T.txH }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Av u={{ name: u.name, col: u.color, avatar: u.avatar }} sz={28} />
                    <span style={{ fontWeight: 500, cursor: "pointer", textDecoration: "underline", textDecorationColor: `${T.accent}40` }} onClick={() => setDetailUser(u.moodle_id)}>{u.name || t("admin.unknown")}</span>
                  </div>
                </td>
                <td style={{ padding: "8px 12px", color: T.txD, fontFamily: "monospace", fontSize: 12 }}>{u.moodle_id || u.moodle_user_id || u.id}</td>
                <td style={{ padding: "8px 12px", color: T.txD }}>{u.dept || "-"}</td>
                <td style={{ padding: "8px 12px", color: T.txD }}>{u.year_group || "-"}</td>
                <td style={{ padding: "8px 12px" }}>
                  {u.isct_verified ? <Badge text={t("admin.verified")} color={T.green} /> : <Badge text={t("admin.unverified")} color={T.txD} />}
                </td>
                <td style={{ padding: "8px 12px" }}>
                  {u.portal_verified ? <Badge text={t("admin.verified")} color={T.green} /> : <Badge text={t("admin.unverified")} color={T.txD} />}
                </td>
                <td style={{ padding: "8px 12px", color: T.txD, fontSize: 12 }}>{u.created_at ? new Date(u.created_at).toLocaleDateString("ja-JP") : "-"}</td>
                <td style={{ padding: "8px 12px", textAlign: "right" }}>
                  <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                    <Btn onClick={() => setDetailUser(u.moodle_id)} color={T.accent} small>{I.eye}</Btn>
                    <Btn onClick={() => handleEditName(u.moodle_id, u.name)} color={T.accent} small>{I.pen}</Btn>
                    {u.banned ? (
                      <Btn onClick={() => handleUnban(u.moodle_id)} color={T.green} small>{t("admin.user.unban")}</Btn>
                    ) : (
                      <Btn onClick={() => handleBan(u.moodle_id, u.name)} color={T.red} small>{I.ban} BAN</Btn>
                    )}
                  </div>
                </td>
              </tr>
            ); })}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={total} limit={50} onPage={p => load(p, search, filter)} />
    </div>
  );
};

// ---- Room Select ----
const RoomSelect = ({ courses, schools = [], depts = [], value, onChange }) => (
  <select value={value} onChange={e => onChange(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 13, outline: "none", maxWidth: 240 }}>
    <option value="">{t("admin.allRooms")}</option>
    {schools.length > 0 && <optgroup label={t("sidebar.schools")}>{schools.map(s => <option key={s.prefix} value={`dept:${s.prefix}`}>{s.name}</option>)}</optgroup>}
    {depts.length > 0 && <optgroup label={t("sidebar.depts")}>{depts.map(d => <option key={d.prefix} value={`dept:${d.prefix}`}>{d.prefix} {d.name}</option>)}</optgroup>}
    {courses.length > 0 && <optgroup label={t("admin.courses")}>{courses.map(c => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}</optgroup>}
  </select>
);

// ---- Posts Tab ----
const PostsTab = ({ courses, schools, depts }) => {
  const [posts, setPosts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [courseId, setCourseId] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback((p, q, cid) => {
    setLoading(true);
    let qs = `action=posts&page=${p}`;
    if (q) qs += `&search=${encodeURIComponent(q)}`;
    if (cid) qs += `&course_id=${encodeURIComponent(cid)}`;
    fetch(`${API}/api/admin?${qs}`).then(r => r.json()).then(d => { setPosts(d.posts || []); setTotal(d.total || 0); setPage(d.page || 0); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(0, "", ""); }, [load]);

  const handleCourse = (cid) => { setCourseId(cid); load(0, search, cid); };
  const handleDelete = async (id) => {
    if (!confirm(t("admin.post.confirmDelete"))) return;
    const r = await fetch(`${API}/api/admin`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "post", id }) });
    if (r.ok) load(page, search, courseId);
  };
  const handleIdentify = async (postId) => {
    const r = await fetch(`${API}/api/admin?action=anon_author&post_id=${postId}`);
    if (!r.ok) { alert(t("admin.fetchFailed")); return; }
    const d = await r.json();
    alert(`${t("admin.post.authorInfo")}:\n${t("admin.name")}: ${d.name || t("admin.unknown")}\nMoodle ID: ${d.moodleUserId}\n${t("admin.post.anonPost")}: ${d.isAnon ? t("admin.yes") : t("admin.no")}`);
  };

  const roomMap = Object.fromEntries([
    ...courses.map(c => [c.id, { code: c.code, col: c.col, name: c.name }]),
    ...depts.map(d => [`dept:${d.prefix}`, { code: d.prefix, col: d.col, name: d.name }]),
    ...schools.map(s => [`dept:${s.prefix}`, { code: s.name.slice(0, 3), col: s.col, name: s.name }]),
  ]);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>{t("admin.post.manage")} ({total})</div>
        <div style={{ flex: 1 }} />
        <RoomSelect courses={courses} schools={schools} depts={depts} value={courseId} onChange={handleCourse} />
        <SearchBar value={search} onChange={setSearch} onSearch={() => load(0, search, courseId)} />
      </div>
      {loading && <div style={{ color: T.txD, fontSize: 13 }}>{t("common.loading")}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {posts.map(p => { const cc = roomMap[p.course_id]; return (
          <div key={p.id} style={{ padding: 14, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Av u={{ name: p.profiles?.name, col: p.profiles?.color, avatar: p.profiles?.avatar }} sz={24} />
              <span style={{ fontSize: 13, fontWeight: 600, color: T.txH }}>{p.profiles?.name || t("common.anonymous")}</span>
              <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 4, background: cc ? `${cc.col}18` : `${T.txD}18`, color: cc?.col || T.txD }}>{cc?.code || p.course_id}</span>
              <span style={{ fontSize: 11, color: T.txD, marginLeft: "auto" }}>{p.created_at ? new Date(p.created_at).toLocaleString("ja-JP") : ""}</span>
              <Badge text={p.type || "post"} color={T.accent} />
            </div>
            <div style={{ fontSize: 13, color: T.tx, lineHeight: 1.6, marginBottom: 8, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 120, overflow: "hidden" }}>{p.text}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 11, color: T.txD }}>{I.heart} {(p.likes || []).length}</span>
              <span style={{ fontSize: 11, color: T.txD }}>{I.chat} {p.comment_count || 0}</span>
              <span style={{ fontSize: 11, color: T.txD, fontFamily: "monospace" }}>UID: {p.moodle_user_id}</span>
              <div style={{ flex: 1 }} />
              {p.type === "anon" && <Btn onClick={() => handleIdentify(p.id)} color={T.orange} small>{I.eye} {t("admin.post.identify")}</Btn>}
              <Btn onClick={() => handleDelete(p.id)} color={T.red}>{I.trash} {t("common.delete")}</Btn>
            </div>
          </div>
        ); })}
        {!loading && posts.length === 0 && <div style={{ padding: 32, textAlign: "center", color: T.txD, fontSize: 13 }}>{t("admin.post.empty")}</div>}
      </div>
      <Pager page={page} total={total} limit={30} onPage={p => load(p, search, courseId)} />
    </div>
  );
};

// ---- Comments Tab ----
const CommentsTab = () => {
  const [comments, setComments] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const load = useCallback((p, q) => {
    setLoading(true);
    let qs = `action=comments&page=${p}`;
    if (q) qs += `&search=${encodeURIComponent(q)}`;
    fetch(`${API}/api/admin?${qs}`).then(r => r.json()).then(d => { setComments(d.comments || []); setTotal(d.total || 0); setPage(d.page || 0); }).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(0, ""); }, [load]);
  const handleDelete = async (id) => {
    if (!confirm(t("admin.comment.confirmDelete"))) return;
    const r = await fetch(`${API}/api/admin`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "comment", id }) });
    if (r.ok) load(page, search);
  };
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>{t("admin.comment.manage")} ({total})</div>
        <div style={{ flex: 1 }} />
        <SearchBar value={search} onChange={setSearch} onSearch={() => load(0, search)} />
      </div>
      {loading && <div style={{ color: T.txD, fontSize: 13 }}>{t("common.loading")}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {comments.map(c => (
          <div key={c.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 10, background: T.bg3, border: `1px solid ${T.bd}` }}>
            <Av u={{ name: c.profiles?.name, col: c.profiles?.color, avatar: c.profiles?.avatar }} sz={28} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.txH }}>{c.profiles?.name || t("admin.unknown")}</span>
                <span style={{ fontSize: 11, color: T.txD }}>{t("admin.comment.postRef", { id: c.post_id })}</span>
                <span style={{ fontSize: 11, color: T.txD, marginLeft: "auto" }}>{c.created_at ? new Date(c.created_at).toLocaleString("ja-JP") : ""}</span>
              </div>
              <div style={{ fontSize: 13, color: T.tx, marginTop: 4, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 80, overflow: "hidden" }}>{c.text}</div>
              {c.posts?.text && <div style={{ fontSize: 11, color: T.txD, marginTop: 4, fontStyle: "italic", maxHeight: 40, overflow: "hidden" }}>{t("admin.comment.origPost")}: {c.posts.text.slice(0, 100)}</div>}
            </div>
            <Btn onClick={() => handleDelete(c.id)} color={T.red} small>{I.trash}</Btn>
          </div>
        ))}
        {!loading && comments.length === 0 && <div style={{ padding: 32, textAlign: "center", color: T.txD, fontSize: 13 }}>{t("admin.comment.empty")}</div>}
      </div>
      <Pager page={page} total={total} limit={50} onPage={p => load(p, search)} />
    </div>
  );
};

// ---- Messages Tab ----
const MessagesTab = ({ courses, schools, depts }) => {
  const [messages, setMessages] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [courseId, setCourseId] = useState("");
  const [loading, setLoading] = useState(false);
  const load = useCallback((p, q, cid) => {
    setLoading(true);
    let qs = `action=messages&page=${p}`;
    if (q) qs += `&search=${encodeURIComponent(q)}`;
    if (cid) qs += `&course_id=${encodeURIComponent(cid)}`;
    fetch(`${API}/api/admin?${qs}`).then(r => r.json()).then(d => { setMessages(d.messages || []); setTotal(d.total || 0); setPage(d.page || 0); }).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(0, "", ""); }, [load]);
  const handleCourse = (cid) => { setCourseId(cid); load(0, search, cid); };
  const handleDelete = async (id) => {
    if (!confirm(t("admin.message.confirmDelete"))) return;
    const r = await fetch(`${API}/api/admin`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "message", id }) });
    if (r.ok) load(page, search, courseId);
  };
  const roomMap = Object.fromEntries([
    ...courses.map(c => [c.id, { code: c.code, col: c.col, name: c.name }]),
    ...depts.map(d => [`dept:${d.prefix}`, { code: d.prefix, col: d.col, name: d.name }]),
    ...schools.map(s => [`dept:${s.prefix}`, { code: s.name.slice(0, 3), col: s.col, name: s.name }]),
  ]);
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>{t("admin.message.manage")} ({total})</div>
        <div style={{ flex: 1 }} />
        <RoomSelect courses={courses} schools={schools} depts={depts} value={courseId} onChange={handleCourse} />
        <SearchBar value={search} onChange={setSearch} onSearch={() => load(0, search, courseId)} />
      </div>
      {loading && <div style={{ color: T.txD, fontSize: 13 }}>{t("common.loading")}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {messages.map(m => { const cc = roomMap[m.course_id]; return (
          <div key={m.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 10, background: T.bg3, border: `1px solid ${T.bd}` }}>
            <Av u={{ name: m.profiles?.name, col: m.profiles?.color, avatar: m.profiles?.avatar }} sz={28} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.txH }}>{m.profiles?.name || t("admin.unknown")}</span>
                <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 4, background: cc ? `${cc.col}18` : `${T.txD}18`, color: cc?.col || T.txD }}>{cc?.code || m.course_id}</span>
                <span style={{ fontSize: 11, color: T.txD, marginLeft: "auto" }}>{m.created_at ? new Date(m.created_at).toLocaleString("ja-JP") : ""}</span>
              </div>
              <div style={{ fontSize: 13, color: T.tx, marginTop: 4, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 80, overflow: "hidden" }}>{m.text}</div>
            </div>
            <Btn onClick={() => handleDelete(m.id)} color={T.red} small>{I.trash}</Btn>
          </div>
        ); })}
        {!loading && messages.length === 0 && <div style={{ padding: 32, textAlign: "center", color: T.txD, fontSize: 13 }}>{t("admin.message.empty")}</div>}
      </div>
      <Pager page={page} total={total} limit={50} onPage={p => load(p, search, courseId)} />
    </div>
  );
};

// ---- DMs Tab ----
const DMsTab = () => {
  const [dms, setDms] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const load = useCallback((p, q, uid) => {
    setLoading(true);
    let qs = `action=dms&page=${p}`;
    if (q) qs += `&search=${encodeURIComponent(q)}`;
    if (uid) qs += `&user_id=${uid}`;
    fetch(`${API}/api/admin?${qs}`).then(r => r.json()).then(d => { setDms(d.dms || []); setTotal(d.total || 0); setPage(d.page || 0); }).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(0, "", ""); }, [load]);
  const handleDelete = async (id) => {
    if (!confirm(t("admin.dm.confirmDelete"))) return;
    const r = await fetch(`${API}/api/admin`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "dm", id }) });
    if (r.ok) load(page, search, userId);
  };
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>{t("admin.dm.monitor")} ({total})</div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, background: T.bg3, border: `1px solid ${T.bd}`, width: 140 }}>
          <input value={userId} onChange={e => setUserId(e.target.value)} onKeyDown={e => { if (e.key === "Enter") load(0, search, userId); }} placeholder={t("admin.userId")} style={{ flex: 1, border: "none", background: "transparent", color: T.txH, fontSize: 12, outline: "none", fontFamily: "monospace" }} />
        </div>
        <SearchBar value={search} onChange={setSearch} onSearch={() => load(0, search, userId)} placeholder={t("admin.dm.textSearch")} />
      </div>
      {loading && <div style={{ color: T.txD, fontSize: 13 }}>{t("common.loading")}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {dms.map(m => (
          <div key={m.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 10, background: T.bg3, border: `1px solid ${T.bd}` }}>
            <Av u={{ name: m.profiles?.name, col: m.profiles?.color, avatar: m.profiles?.avatar }} sz={28} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.txH }}>{m.profiles?.name || t("admin.unknown")}</span>
                <span style={{ fontSize: 11, color: T.txD, fontFamily: "monospace" }}>UID:{m.sender_id} | Conv:{m.conversation_id}</span>
                <span style={{ fontSize: 11, color: T.txD, marginLeft: "auto" }}>{m.created_at ? new Date(m.created_at).toLocaleString("ja-JP") : ""}</span>
              </div>
              <div style={{ fontSize: 13, color: T.tx, marginTop: 4, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 80, overflow: "hidden" }}>{m.text}</div>
            </div>
            <Btn onClick={() => handleDelete(m.id)} color={T.red} small>{I.trash}</Btn>
          </div>
        ))}
        {!loading && dms.length === 0 && <div style={{ padding: 32, textAlign: "center", color: T.txD, fontSize: 13 }}>{t("admin.dm.empty")}</div>}
      </div>
      <Pager page={page} total={total} limit={50} onPage={p => load(p, search, userId)} />
    </div>
  );
};

// ---- Circles Tab ----
const CirclesTab = () => {
  const [circles, setCircles] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [viewMessages, setViewMessages] = useState(null);
  const [circleMessages, setCircleMessages] = useState([]);
  const [cmTotal, setCmTotal] = useState(0);
  const [cmPage, setCmPage] = useState(0);
  const [cmLoading, setCmLoading] = useState(false);

  const load = useCallback((p, q) => {
    setLoading(true);
    let qs = `action=circles&page=${p}`;
    if (q) qs += `&search=${encodeURIComponent(q)}`;
    fetch(`${API}/api/admin?${qs}`).then(r => r.json()).then(d => { setCircles(d.circles || []); setTotal(d.total || 0); setPage(d.page || 0); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(0, ""); }, [load]);

  const loadCircleMessages = useCallback((circleId, p) => {
    setCmLoading(true);
    fetch(`${API}/api/admin?action=circle_messages&circle_id=${circleId}&page=${p}`)
      .then(r => r.json()).then(d => { setCircleMessages(d.messages || []); setCmTotal(d.total || 0); setCmPage(p); }).catch(() => {}).finally(() => setCmLoading(false));
  }, []);

  const handleDelete = async (id, name) => {
    if (!confirm(t("admin.circle.confirmDelete", { name }))) return;
    const r = await fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete_circle", circleId: id }) });
    if (r.ok) load(page, search);
  };

  const handleTransferOwner = async (circleId) => {
    const newOwnerId = prompt(t("admin.circle.newOwnerPrompt"));
    if (!newOwnerId) return;
    const r = await fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "transfer_circle_owner", circleId, newOwnerId: parseInt(newOwnerId) }) });
    const d = await r.json();
    if (r.ok) { alert(t("admin.circle.ownerChanged")); load(page, search); } else alert(d.error || t("admin.changeFailed"));
  };

  const handleDeleteCircleMessage = async (id) => {
    if (!confirm(t("admin.message.confirmDelete"))) return;
    const r = await fetch(`${API}/api/admin`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "circle_message", id }) });
    if (r.ok && viewMessages) loadCircleMessages(viewMessages, cmPage);
  };

  if (viewMessages) {
    const circle = circles.find(c => c.id === viewMessages);
    return (
      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <Btn onClick={() => setViewMessages(null)} color={T.txD}>{I.back} {t("common.back")}</Btn>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>{t("admin.circle.messages")}: {circle?.name || viewMessages} ({cmTotal})</div>
        </div>
        {cmLoading && <div style={{ color: T.txD, fontSize: 13 }}>{t("common.loading")}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {circleMessages.map(m => (
            <div key={m.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 10, background: T.bg3, border: `1px solid ${T.bd}` }}>
              <Av u={{ name: m.profiles?.name, col: m.profiles?.color, avatar: m.profiles?.avatar }} sz={28} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.txH }}>{m.profiles?.name || t("admin.unknown")}</span>
                  <Badge text={m.circle_channels?.name || "ch"} color={T.accent} />
                  <span style={{ fontSize: 11, color: T.txD, marginLeft: "auto" }}>{m.created_at ? new Date(m.created_at).toLocaleString("ja-JP") : ""}</span>
                </div>
                <div style={{ fontSize: 13, color: T.tx, marginTop: 4, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 80, overflow: "hidden" }}>{m.text}</div>
              </div>
              <Btn onClick={() => handleDeleteCircleMessage(m.id)} color={T.red} small>{I.trash}</Btn>
            </div>
          ))}
          {!cmLoading && circleMessages.length === 0 && <div style={{ padding: 32, textAlign: "center", color: T.txD, fontSize: 13 }}>{t("admin.message.empty")}</div>}
        </div>
        <Pager page={cmPage} total={cmTotal} limit={50} onPage={p => loadCircleMessages(viewMessages, p)} />
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>{t("admin.circle.manage")} ({total})</div>
        <div style={{ flex: 1 }} />
        <SearchBar value={search} onChange={setSearch} onSearch={() => load(0, search)} placeholder={t("admin.circle.searchByName")} />
      </div>
      {loading && <div style={{ color: T.txD, fontSize: 13 }}>{t("common.loading")}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {circles.map(c => (
          <div key={c.id} style={{ padding: 14, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: c.color || T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{c.icon || "?"}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.txH }}>{c.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: T.txD, marginTop: 2 }}>
                  <span>{I.users} {t("admin.circle.memberCount", { n: c.member_count })}</span>
                  <Badge text={c.is_public ? t("admin.public") : t("admin.private")} color={c.is_public ? T.green : T.txD} />
                  <Badge text={c.join_mode === "open" ? t("admin.circle.joinOpen") : c.join_mode === "approval" ? t("admin.circle.joinApproval") : t("admin.circle.joinInvite")} color={T.accent} />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
                {c.owner && <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: T.txD }}>
                  <Av u={{ name: c.owner?.name, col: c.owner?.color, avatar: c.owner?.avatar }} sz={18} />
                  {c.owner?.name}
                </div>}
                <Btn onClick={() => { setViewMessages(c.id); loadCircleMessages(c.id, 0); }} color={T.accent} small>{I.chat} MSG</Btn>
                <Btn onClick={() => handleTransferOwner(c.id)} color={T.orange} small>{I.users} {t("admin.circle.transfer")}</Btn>
                <Btn onClick={() => handleDelete(c.id, c.name)} color={T.red} small>{I.trash}</Btn>
              </div>
            </div>
            {c.description && <div style={{ fontSize: 12, color: T.txD, maxHeight: 40, overflow: "hidden" }}>{c.description}</div>}
            <div style={{ fontSize: 10, color: T.txD, marginTop: 4 }}>ID: {c.id} | {t("admin.created")}: {c.created_at ? new Date(c.created_at).toLocaleDateString("ja-JP") : "-"}</div>
          </div>
        ))}
        {!loading && circles.length === 0 && <div style={{ padding: 32, textAlign: "center", color: T.txD, fontSize: 13 }}>{t("admin.circle.empty")}</div>}
      </div>
      <Pager page={page} total={total} limit={30} onPage={p => load(p, search)} />
    </div>
  );
};

// ---- Announcements Tab ----
const ANNOUNCE_TYPES = [
  { id: "info", labelKey: "admin.annType.info", color: T.accent },
  { id: "maintenance", labelKey: "admin.annType.maintenance", color: T.orange },
  { id: "update", labelKey: "admin.annType.update", color: T.green },
  { id: "urgent", labelKey: "admin.annType.urgent", color: T.red },
];

const AnnouncementsTab = () => {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState("info");
  const [saving, setSaving] = useState(false);
  const load = useCallback((p) => {
    setLoading(true);
    fetch(`${API}/api/admin?action=announcements&page=${p}`).then(r => r.json()).then(d => { setItems(d.announcements || []); setTotal(d.total || 0); setPage(d.page || 0); }).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(0); }, [load]);
  const handleCreate = async () => {
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    const r = await fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_announcement", title, announcementBody: body, type }) });
    if (r.ok) { setShowForm(false); setTitle(""); setBody(""); setType("info"); load(0); }
    setSaving(false);
  };
  const handleToggle = async (id, active) => {
    await fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update_announcement", announcementId: id, active: !active }) });
    load(page);
  };
  const handleDeleteAnnouncement = async (id) => {
    if (!confirm(t("admin.announce.confirmDelete"))) return;
    await fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete_announcement", announcementId: id }) });
    load(page);
  };
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>{t("admin.announce.title")} ({total})</div>
        <div style={{ flex: 1 }} />
        <Btn onClick={() => setShowForm(!showForm)} color={T.accent}>{I.plus} {t("admin.announce.new")}</Btn>
      </div>
      {showForm && (
        <div style={{ padding: 16, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}`, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder={t("admin.announce.titlePh")} style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, outline: "none" }} />
            <select value={type} onChange={e => setType(e.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, outline: "none" }}>
              {ANNOUNCE_TYPES.map(at => <option key={at.id} value={at.id}>{t(at.labelKey)}</option>)}
            </select>
          </div>
          <textarea value={body} onChange={e => setBody(e.target.value)} placeholder={t("admin.announce.bodyPh")} rows={4} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
            <Btn onClick={() => setShowForm(false)} color={T.txD}>{t("common.cancel")}</Btn>
            <Btn onClick={handleCreate} color={T.accent} disabled={saving || !title.trim() || !body.trim()}>{saving ? t("admin.sending") : t("admin.announce.publish")}</Btn>
          </div>
        </div>
      )}
      {loading && <div style={{ color: T.txD, fontSize: 13 }}>{t("common.loading")}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map(a => { const typeInfo = ANNOUNCE_TYPES.find(at => at.id === a.type) || ANNOUNCE_TYPES[0]; return (
          <div key={a.id} style={{ padding: 14, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}`, opacity: a.active ? 1 : 0.5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Badge text={t(typeInfo.labelKey)} color={typeInfo.color} />
              {!a.active && <Badge text={t("admin.unpublished")} color={T.txD} />}
              <span style={{ fontSize: 14, fontWeight: 600, color: T.txH }}>{a.title}</span>
              <span style={{ fontSize: 11, color: T.txD, marginLeft: "auto" }}>{a.created_at ? new Date(a.created_at).toLocaleString("ja-JP") : ""}</span>
            </div>
            <div style={{ fontSize: 13, color: T.tx, lineHeight: 1.6, marginBottom: 8, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{a.body}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn onClick={() => handleToggle(a.id, a.active)} color={a.active ? T.orange : T.green} small>{a.active ? t("admin.announce.makeUnpublished") : t("admin.announce.makePublished")}</Btn>
              <Btn onClick={() => handleDeleteAnnouncement(a.id)} color={T.red} small>{I.trash} {t("common.delete")}</Btn>
            </div>
          </div>
        ); })}
        {!loading && items.length === 0 && <div style={{ padding: 32, textAlign: "center", color: T.txD, fontSize: 13 }}>{t("admin.announce.empty")}</div>}
      </div>
      <Pager page={page} total={total} limit={30} onPage={load} />
    </div>
  );
};

// ---- Music (配信) Tab ----
// 管理者がアップロードした曲は is_public=true で全ユーザーのミュージック画面に配信される。
// ミュージック画面側は全員同一表示（聴くだけ）。管理はこのタブで行う。
const MusicTab = () => {
  const { tracks, albums, loading, addTrack, removeTrack, renameTrack, moveTrack, addAlbum, removeAlbum } = useMusic();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [albumId, setAlbumId] = useState("");
  const [audioFile, setAudioFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const audioRef = useRef(null);
  const coverRef = useRef(null);
  const published = tracks.filter(tr => tr.is_public);
  const publicAlbums = albums.filter(a => a.is_public);

  // アルバム作成フォーム
  const [showAlbumForm, setShowAlbumForm] = useState(false);
  const [albName, setAlbName] = useState("");
  const [albArtist, setAlbArtist] = useState("");
  const [albCoverFile, setAlbCoverFile] = useState(null);
  const [albSaving, setAlbSaving] = useState(false);
  const albCoverRef = useRef(null);

  // 既存曲の歌詞同期エディタを開いているトラックID
  const [editId, setEditId] = useState(null);

  const reset = () => {
    setShowForm(false); setTitle(""); setArtist(""); setLyrics(""); setAlbumId(""); setAudioFile(null); setCoverFile(null);
    if (audioRef.current) audioRef.current.value = "";
    if (coverRef.current) coverRef.current.value = "";
  };
  const submit = async () => {
    if (!audioFile) { showToast(t("admin.music.selectAudio"), "error"); return; }
    setSaving(true);
    try {
      await addTrack({ audioFile, coverFile, title: title.trim(), artist: artist.trim(), lyrics: lyrics.trim(), isPublic: true, albumId: albumId || null });
      showToast(t("admin.music.published"), "success");
      reset();
    } catch (e) {
      showToast(e.message || t("admin.music.uploadFailed"), "error");
    } finally { setSaving(false); }
  };
  const del = async (tr) => {
    if (!confirm(t("admin.music.confirmStop", { title: tr.title }))) return;
    await removeTrack(tr.id);
    showToast(t("admin.deleted"), "success");
  };
  const saveLyrics = async (id, lrc) => {
    setEditId(null);
    await renameTrack(id, { lyrics: lrc });
    showToast(t("admin.music.lyricsSaved"), "success");
  };

  const resetAlbum = () => {
    setShowAlbumForm(false); setAlbName(""); setAlbArtist(""); setAlbCoverFile(null);
    if (albCoverRef.current) albCoverRef.current.value = "";
  };
  const createAlbum = async () => {
    if (!albName.trim()) { showToast(t("admin.music.albumName"), "error"); return; }
    setAlbSaving(true);
    try {
      await addAlbum({ title: albName.trim(), artist: albArtist.trim(), coverFile: albCoverFile });
      showToast(t("admin.music.albumCreated"), "success");
      resetAlbum();
    } catch (e) {
      showToast(e.message || t("admin.music.uploadFailed"), "error");
    } finally { setAlbSaving(false); }
  };
  const delAlbum = async (a) => {
    if (!confirm(t("admin.music.confirmDeleteAlbum", { title: a.title }))) return;
    await removeAlbum(a.id);
    showToast(t("admin.deleted"), "success");
  };

  const lyricsArea = { width: "100%", minHeight: 120, padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical", lineHeight: 1.5 };

  const fileInput = { flex: 1, padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, outline: "none" };
  const selectInput = { ...fileInput, width: "100%", boxSizing: "border-box", marginTop: 4 };

  return (
    <div style={{ padding: 16 }}>
      {/* ── アルバム管理 ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>{t("admin.music.albumsHeading")} ({publicAlbums.length})</div>
        <div style={{ flex: 1 }} />
        <Btn onClick={() => setShowAlbumForm(!showAlbumForm)} color={T.accent}>{I.plus} {t("admin.music.newAlbum")}</Btn>
      </div>

      {showAlbumForm && (
        <div style={{ padding: 16, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}`, marginBottom: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input value={albName} onChange={e => setAlbName(e.target.value)} placeholder={t("admin.music.albumName")} style={fileInput} />
            <input value={albArtist} onChange={e => setAlbArtist(e.target.value)} placeholder={t("admin.music.artistName")} style={fileInput} />
            <label style={{ fontSize: 12, color: T.txD }}>{t("admin.music.albumCoverOptional")}
              <input ref={albCoverRef} type="file" accept="image/*" onChange={e => setAlbCoverFile(e.target.files?.[0] || null)} style={{ ...fileInput, width: "100%", marginTop: 4, boxSizing: "border-box" }} />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
            <Btn onClick={resetAlbum} color={T.txD} disabled={albSaving}>{t("common.cancel")}</Btn>
            <Btn onClick={createAlbum} color={T.accent} disabled={albSaving || !albName.trim()}>{albSaving ? t("admin.music.uploading") : t("admin.music.createAlbum")}</Btn>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
        {publicAlbums.map(a => {
          const count = published.filter(tr => tr.album_id === a.id).length;
          return (
            <div key={a.id} style={{ padding: 12, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}`, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 8, flexShrink: 0, overflow: "hidden", background: `linear-gradient(145deg, ${T.accent}, ${T.accent}99)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
                {a.cover?.url ? <img src={a.cover.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : I.music}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.txH, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.title}</div>
                <div style={{ fontSize: 12, color: T.txD, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {a.artist || "ScienceTokyo Music"} · {t("admin.music.trackCount", { n: count })}
                </div>
              </div>
              <Btn onClick={() => delAlbum(a)} color={T.red} small>{I.trash} {t("common.delete")}</Btn>
            </div>
          );
        })}
        {!loading && publicAlbums.length === 0 && <div style={{ padding: 20, textAlign: "center", color: T.txD, fontSize: 13 }}>{t("admin.music.albumEmpty")}</div>}
      </div>

      {/* ── 曲の配信 ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>{t("admin.music.title")} ({published.length})</div>
        <div style={{ flex: 1 }} />
        <Btn onClick={() => setShowForm(!showForm)} color={T.accent}>{I.plus} {t("admin.music.distribute")}</Btn>
      </div>
      <div style={{ fontSize: 12, color: T.txD, marginBottom: 12 }}>{t("admin.music.desc")}</div>

      {showForm && (
        <div style={{ padding: 16, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}`, marginBottom: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ fontSize: 12, color: T.txD }}>{t("admin.music.audioFile")}
              <input ref={audioRef} type="file" accept="audio/*" onChange={e => { const f = e.target.files?.[0]; if (f) { setAudioFile(f); if (!title) setTitle(f.name.replace(/\.[^.]+$/, "")); } }} style={{ ...fileInput, width: "100%", marginTop: 4, boxSizing: "border-box" }} />
            </label>
            <label style={{ fontSize: 12, color: T.txD }}>{t("admin.music.coverImage")}
              <input ref={coverRef} type="file" accept="image/*" onChange={e => setCoverFile(e.target.files?.[0] || null)} style={{ ...fileInput, width: "100%", marginTop: 4, boxSizing: "border-box" }} />
            </label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder={t("admin.music.songName")} style={fileInput} />
            <input value={artist} onChange={e => setArtist(e.target.value)} placeholder={t("admin.music.artistName")} style={fileInput} />
            <label style={{ fontSize: 12, color: T.txD }}>{t("admin.music.albumField")}
              <select value={albumId} onChange={e => setAlbumId(e.target.value)} style={selectInput}>
                <option value="">{t("admin.music.noAlbum")}</option>
                {publicAlbums.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, color: T.txD }}>{t("admin.music.lyrics")}
              <textarea value={lyrics} onChange={e => setLyrics(e.target.value)} placeholder={t("admin.music.lyricsPlaceholder")} style={{ ...lyricsArea, marginTop: 4 }} />
            </label>
            <div style={{ fontSize: 11, color: T.txD, lineHeight: 1.5 }}>{t("admin.music.lyricsHint")}</div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
            <Btn onClick={reset} color={T.txD} disabled={saving}>{t("common.cancel")}</Btn>
            <Btn onClick={submit} color={T.accent} disabled={saving || !audioFile}>{saving ? t("admin.music.uploading") : t("admin.music.distributeShort")}</Btn>
          </div>
        </div>
      )}

      {loading && <div style={{ color: T.txD, fontSize: 13 }}>{t("common.loading")}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {published.map(tr => (
          <div key={tr.id} style={{ padding: 12, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 8, flexShrink: 0, overflow: "hidden", background: `linear-gradient(145deg, ${T.accent}, ${T.accent}99)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
                {tr.cover?.url ? <img src={tr.cover.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : I.music}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.txH, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tr.title}</div>
                <div style={{ fontSize: 12, color: T.txD, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {tr.artist || "ScienceTokyo Music"}{tr.lyrics ? ` · ${t("admin.music.hasLyrics")}` : ""}
                </div>
              </div>
              <Btn onClick={() => setEditId(editId === tr.id ? null : tr.id)} color={T.accent} small>{I.lyrics} {t("admin.music.editLyrics")}</Btn>
              <Btn onClick={() => del(tr)} color={T.red} small>{I.trash} {t("common.delete")}</Btn>
            </div>
            {/* 所属アルバムの変更 */}
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12, color: T.txD }}>
              {t("admin.music.albumField")}
              <select value={tr.album_id || ""} onChange={e => moveTrack(tr.id, e.target.value || null)} style={{ ...fileInput, flex: 1 }}>
                <option value="">{t("admin.music.noAlbum")}</option>
                {publicAlbums.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
            </label>
            {editId === tr.id && (
              tr.audio?.url
                ? <LyricsSyncEditor track={tr} onSave={(lrc) => saveLyrics(tr.id, lrc)} onClose={() => setEditId(null)} />
                : <div style={{ marginTop: 10, fontSize: 12, color: T.txD }}>{t("admin.music.syncNoAudio")}</div>
            )}
          </div>
        ))}
        {!loading && published.length === 0 && <div style={{ padding: 32, textAlign: "center", color: T.txD, fontSize: 13 }}>{t("admin.music.empty")}</div>}
      </div>
    </div>
  );
};

// ---- Audit Log Tab ----
const ACTION_LABEL_KEYS = {
  ban_user: "admin.act.banUser", unban_user: "admin.act.unbanUser", delete_post: "admin.act.deletePost",
  delete_comment: "admin.act.deleteComment", delete_message: "admin.act.deleteMessage", delete_dm: "admin.act.deleteDm",
  delete_circle_message: "admin.act.deleteCircleMsg",
  resolve_report: "admin.act.resolveReport", create_announcement: "admin.act.createAnnounce",
  update_announcement: "admin.act.updateAnnounce", delete_announcement: "admin.act.deleteAnnounce",
  add_admin: "admin.act.addAdmin", remove_admin: "admin.act.removeAdmin",
  edit_profile: "admin.act.editProfile", identify_anon: "admin.act.identifyAnon",
  delete_circle: "admin.act.deleteCircle", transfer_circle_owner: "admin.act.transferOwner",
  update_site_setting: "admin.act.updateSetting",
  add_ng_word: "admin.act.addNgWord", delete_ng_word: "admin.act.deleteNgWord",
  enable_maintenance: "admin.act.maintOn", disable_maintenance: "admin.act.maintOff",
  enable_registration_limit: "admin.act.regLimitOn", disable_registration_limit: "admin.act.regLimitOff",
  toggle_feature: "admin.act.toggleFeature", bulk_update_profiles: "admin.act.bulkUpdate",
};

const AuditLogTab = () => {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const load = useCallback((p) => {
    setLoading(true);
    fetch(`${API}/api/admin?action=audit_log&page=${p}`).then(r => r.json()).then(d => { setLogs(d.logs || []); setTotal(d.total || 0); setPage(d.page || 0); }).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(0); }, [load]);
  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, marginBottom: 12 }}>{t("admin.audit.title")} ({total})</div>
      {loading && <div style={{ color: T.txD, fontSize: 13 }}>{t("common.loading")}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {logs.map(l => (
          <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 8, background: T.bg3, border: `1px solid ${T.bd}`, fontSize: 13 }}>
            <Av u={{ name: l.profiles?.name, col: l.profiles?.color, avatar: l.profiles?.avatar }} sz={22} />
            <span style={{ color: T.txH, fontWeight: 500 }}>{l.profiles?.name || t("admin.unknown")}</span>
            <Badge text={ACTION_LABEL_KEYS[l.action] ? t(ACTION_LABEL_KEYS[l.action]) : l.action} color={T.accent} />
            {l.target_type && <span style={{ fontSize: 11, color: T.txD }}>{l.target_type}#{l.target_id}</span>}
            {l.detail && typeof l.detail === 'object' && l.detail.reason && <span style={{ fontSize: 11, color: T.txD }}>{t("admin.reason")}: {l.detail.reason}</span>}
            <span style={{ fontSize: 11, color: T.txD, marginLeft: "auto" }}>{l.created_at ? new Date(l.created_at).toLocaleString("ja-JP") : ""}</span>
          </div>
        ))}
        {!loading && logs.length === 0 && <div style={{ padding: 32, textAlign: "center", color: T.txD, fontSize: 13 }}>{t("admin.audit.empty")}</div>}
      </div>
      <Pager page={page} total={total} limit={50} onPage={load} />
    </div>
  );
};

// ---- NG Words Section ----
const NG_MATCH_TYPES = [{ id: "contains", labelKey: "admin.ng.matchContains" }, { id: "exact", labelKey: "admin.ng.matchExact" }, { id: "regex", labelKey: "admin.ng.matchRegex" }];
const NG_ACTIONS = [{ id: "block", labelKey: "admin.ng.actBlock" }, { id: "warn", labelKey: "admin.ng.actWarn" }];
const NG_CATEGORIES = ["general", "spam", "slur", "ad", "other"];

const NgWordsSection = () => {
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [word, setWord] = useState("");
  const [matchType, setMatchType] = useState("contains");
  const [wordAction, setWordAction] = useState("block");
  const [category, setCategory] = useState("general");
  const [saving, setSaving] = useState(false);
  const loadWords = useCallback(() => {
    setLoading(true);
    fetch(`${API}/api/admin?action=ng_words`).then(r => r.json()).then(d => setWords(d.words || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { loadWords(); }, [loadWords]);
  const handleAdd = async () => {
    if (!word.trim()) return;
    setSaving(true);
    const r = await fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add_ng_word", word, matchType, wordAction, category }) });
    if (r.ok) { setWord(""); loadWords(); } else { const d = await r.json(); alert(d.error || t("admin.addFailed")); }
    setSaving(false);
  };
  const handleDelete = async (id) => {
    if (!confirm(t("admin.ng.confirmDelete"))) return;
    await fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete_ng_word", wordId: id }) });
    loadWords();
  };
  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, margin: "24px 0 12px" }}>{t("admin.ng.title")}</div>
      <div style={{ fontSize: 12, color: T.txD, marginBottom: 12 }}>{t("admin.ng.desc")}</div>
      <div style={{ padding: 14, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}`, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input value={word} onChange={e => setWord(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleAdd(); }} placeholder={t("admin.ng.wordPh")} style={{ flex: 1, minWidth: 120, padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, outline: "none" }} />
          <select value={matchType} onChange={e => setMatchType(e.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 12, outline: "none" }}>
            {NG_MATCH_TYPES.map(m => <option key={m.id} value={m.id}>{t(m.labelKey)}</option>)}
          </select>
          <select value={wordAction} onChange={e => setWordAction(e.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 12, outline: "none" }}>
            {NG_ACTIONS.map(a => <option key={a.id} value={a.id}>{t(a.labelKey)}</option>)}
          </select>
          <select value={category} onChange={e => setCategory(e.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 12, outline: "none" }}>
            {NG_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <Btn onClick={handleAdd} color={T.accent} disabled={saving || !word.trim()}>{saving ? t("admin.adding") : t("admin.add")}</Btn>
        </div>
      </div>
      {loading && <div style={{ color: T.txD, fontSize: 13 }}>{t("common.loading")}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {words.map(w => (
          <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: T.bg3, border: `1px solid ${T.bd}`, fontSize: 13 }}>
            <span style={{ fontWeight: 600, color: T.txH, fontFamily: "monospace" }}>{w.word}</span>
            <Badge text={(() => { const m = NG_MATCH_TYPES.find(m => m.id === w.match_type); return m ? t(m.labelKey) : w.match_type; })()} color={T.accent} />
            <Badge text={w.action === "block" ? t("admin.ng.actBlock") : t("admin.ng.warn")} color={w.action === "block" ? T.red : T.orange} />
            <Badge text={w.category || "general"} color={T.txD} />
            <span style={{ fontSize: 10, color: T.txD, marginLeft: "auto" }}>{w.created_at ? new Date(w.created_at).toLocaleDateString("ja-JP") : ""}</span>
            <Btn onClick={() => handleDelete(w.id)} color={T.red} small>{I.trash}</Btn>
          </div>
        ))}
        {!loading && words.length === 0 && <div style={{ padding: 16, textAlign: "center", color: T.txD, fontSize: 13 }}>{t("admin.ng.empty")}</div>}
      </div>
    </div>
  );
};

// ---- Settings Tab ----
const FEATURE_FLAGS = [
  { id: "feed", labelKey: "chan.timeline" }, { id: "chat", labelKey: "chan.chat" },
  { id: "dm", labelKey: "common.dm" }, { id: "circles", labelKey: "nav.circles" },
  { id: "map", labelKey: "nav.map" }, { id: "anonymous_posts", labelKey: "admin.flag.anonPosts" },
  { id: "polls", labelKey: "admin.flag.polls" }, { id: "file_upload", labelKey: "admin.flag.fileUpload" },
];

// ---- Syllabus / Timetable Tab ----
const DAY_LABELS = ["月", "火", "水", "木", "金"];
const PERIOD_LABELS = ["1-2", "3-4", "5-6", "7-8", "9-10"];
const PERIOD_TIMES = ["8:50–10:30", "10:45–12:25", "13:30–15:10", "15:25–17:05", "17:15–18:55"];

const SyllabusTab = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [filterQuarter, setFilterQuarter] = useState("");
  const [filterDay, setFilterDay] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [viewMode, setViewMode] = useState("table");

  // Debounce search input
  useEffect(() => {
    const tm = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(tm);
  }, [search]);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ action: 'syllabus' });
    if (filterDept) params.set('dept', filterDept);
    if (filterYear) params.set('year', filterYear);
    if (filterQuarter) params.set('quarter', filterQuarter);
    if (filterDay) params.set('day', filterDay);
    if (debouncedSearch) params.set('search', debouncedSearch);
    const url = `${API}/api/admin?${params}`;
    console.log(`[SyllabusTab] fetch: ${params}`);
    fetch(url).then(r => {
      console.log(`[SyllabusTab] response status: ${r.status}`);
      return r.json();
    }).then(d => {
      console.log(`[SyllabusTab] loaded: ${d.courses?.length ?? 0} courses, ${Object.keys(d.stats || {}).length} stats, years=${d.years}`);
      if (d.error) console.error(`[SyllabusTab] API error:`, d.error);
      setData(d);
    }).catch(e => { console.error(`[SyllabusTab] fetch failed:`, e); }).finally(() => setLoading(false));
  }, [filterDept, filterYear, filterQuarter, filterDay, debouncedSearch]);

  useEffect(() => { load(); }, [load]);

  const courses = data?.courses || [];
  const departments = data?.departments || [];
  const filtered = courses;

  // Quarter stats from filtered data
  const quarterCounts = {};
  for (const c of courses) {
    if (c.quarter) quarterCounts[c.quarter] = (quarterCounts[c.quarter] || 0) + 1;
  }

  // Grid view
  const buildGrid = () => {
    const grid = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => []));
    const dayMap = { "月": 0, "火": 1, "水": 2, "木": 3, "金": 4 };
    for (const c of filtered) {
      if (!c.day || !c.period_start) continue;
      const col = dayMap[c.day];
      if (col === undefined) continue;
      const rowStart = Math.floor((c.period_start - 1) / 2);
      const rowEnd = c.period_end ? Math.floor((c.period_end - 1) / 2) : rowStart;
      for (let row = rowStart; row <= rowEnd && row < 5; row++) {
        grid[row][col].push(c);
      }
    }
    return grid;
  };

  const years = data?.years || [];
  const uniqueQuarters = [...new Set(courses.map(c => c.quarter).filter(Boolean))].sort();

  return (
    <div style={{ padding: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>{t("admin.syllabus.title")}</div>
        {courses.length > 0 && (
          <Btn onClick={() => setViewMode(viewMode === "table" ? "grid" : "table")} color={T.accent} small>
            {viewMode === "table" ? t("admin.syllabus.gridView") : t("admin.syllabus.listView")}
          </Btn>
        )}
      </div>

      {/* Stats */}
      {courses.length > 0 && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <Card label={t("admin.syllabus.totalCourses")} value={courses.length} color={T.accent} />
          {uniqueQuarters.map(q => (
            <Card key={q} label={q} value={quarterCounts[q] || 0} color={T.green} />
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <SearchBar value={search} onChange={setSearch} onSearch={() => {}} placeholder={t("admin.syllabus.searchPh")} width={240} />
        <select value={filterYear} onChange={e => setFilterYear(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, background: T.bg3, border: `1px solid ${T.bd}`, color: T.txH, fontSize: 13 }}>
          <option value="">{t("admin.allYears")}</option>
          {years.map(y => <option key={y} value={y}>{t("admin.yearLabel", { y })}</option>)}
        </select>
        <select value={filterDept} onChange={e => setFilterDept(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, background: T.bg3, border: `1px solid ${T.bd}`, color: T.txH, fontSize: 13 }}>
          <option value="">{t("admin.allDepts")}</option>
          {departments.map(d => (
            <option key={d.key} value={d.key}>{d.key} ({d.label})</option>
          ))}
        </select>
        <select value={filterQuarter} onChange={e => setFilterQuarter(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, background: T.bg3, border: `1px solid ${T.bd}`, color: T.txH, fontSize: 13 }}>
          <option value="">{t("admin.allQuarters")}</option>
          {["1", "2", "3", "4"].map(q => <option key={q} value={q}>{q}Q</option>)}
        </select>
        <select value={filterDay} onChange={e => setFilterDay(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, background: T.bg3, border: `1px solid ${T.bd}`, color: T.txH, fontSize: 13 }}>
          <option value="">{t("admin.allDays")}</option>
          {DAY_LABELS.map(d => <option key={d} value={d}>{t("dow.s." + d)}</option>)}
        </select>
        {(search || filterDept || filterQuarter || filterDay || filterYear) && (
          <span style={{ fontSize: 12, color: T.txD }}>{t("admin.countItems", { n: filtered.length })}</span>
        )}
      </div>

      {loading && <div style={{ color: T.txD, fontSize: 13, padding: 20 }}>{t("common.loading")}</div>}

      {/* Grid View */}
      {!loading && courses.length > 0 && viewMode === "grid" && (() => {
        const grid = buildGrid();
        return (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ padding: "8px 4px", borderBottom: `1px solid ${T.bd}`, color: T.txD, fontWeight: 500, width: 60, textAlign: "left" }}>{t("admin.period")}</th>
                  {DAY_LABELS.map(d => (
                    <th key={d} style={{ padding: "8px 4px", borderBottom: `1px solid ${T.bd}`, color: T.txH, fontWeight: 600, textAlign: "center", width: "19%" }}>{t("dow.s." + d)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERIOD_LABELS.map((p, ri) => (
                  <tr key={p}>
                    <td style={{ padding: "6px 4px", borderBottom: `1px solid ${T.bd}`, color: T.txD, verticalAlign: "top" }}>
                      <div style={{ fontWeight: 600 }}>{p}</div>
                      <div style={{ fontSize: 10 }}>{PERIOD_TIMES[ri]}</div>
                    </td>
                    {DAY_LABELS.map((_, ci) => (
                      <td key={ci} style={{ padding: 4, borderBottom: `1px solid ${T.bd}`, verticalAlign: "top" }}>
                        {grid[ri][ci].map((c, i) => (
                          <div key={i} style={{ padding: "4px 6px", borderRadius: 6, background: `${T.accent}15`, border: `1px solid ${T.accent}30`, marginBottom: 2, fontSize: 11 }}>
                            <div style={{ fontWeight: 600, color: T.txH }}>{c.code}</div>
                            {c.name && <div style={{ color: T.tx, fontSize: 10, lineHeight: 1.3 }}>{c.name}</div>}
                            {c.room && <div style={{ color: T.txD, fontSize: 10 }}>{c.room}</div>}
                          </div>
                        ))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}

      {/* Table View */}
      {!loading && courses.length > 0 && viewMode === "table" && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${T.bd}` }}>
                {["admin.col.code", "admin.col.name", "admin.col.req", "admin.col.credits", "admin.col.section", "admin.col.teacher", "admin.dept", "admin.col.yearShort", "admin.col.day", "admin.period", "admin.col.room", "admin.col.building", "Q"].map(h => (
                  <th key={h} style={{ padding: "8px 6px", textAlign: "left", color: T.txD, fontWeight: 600, fontSize: 11, whiteSpace: "nowrap" }}>{h === "Q" ? "Q" : t(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <tr key={`${c.id}-${i}`} style={{ borderBottom: `1px solid ${T.bd}` }}>
                  <td style={{ padding: "6px 6px", color: T.accent, fontFamily: "monospace", fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" }}>{c.code}</td>
                  <td style={{ padding: "6px 6px", color: T.txH, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name || "-"}</td>
                  <td style={{ padding: "6px 6px", whiteSpace: "nowrap" }}>{c.requirement ? <Badge text={c.requirement} color={c.requirement === '必修' ? '#ef4444' : c.requirement === '選択必修' ? '#f59e0b' : T.green} /> : "-"}</td>
                  <td style={{ padding: "6px 6px", color: T.txH, textAlign: "center", fontWeight: 600 }}>{c.credits || "-"}</td>
                  <td style={{ padding: "6px 6px", color: T.txD, fontSize: 11, whiteSpace: "nowrap" }}>{c.section || "-"}</td>
                  <td style={{ padding: "6px 6px", color: T.tx, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11 }}>{c.teacher || "-"}</td>
                  <td style={{ padding: "6px 6px" }}><Badge text={c.dept} color={T.accent} /></td>
                  <td style={{ padding: "6px 6px", color: T.txD, fontSize: 11, textAlign: "center" }}>{c.year || "-"}</td>
                  <td style={{ padding: "6px 6px", color: T.txH, textAlign: "center" }}>{c.day || "-"}</td>
                  <td style={{ padding: "6px 6px", color: T.tx, whiteSpace: "nowrap" }}>{c.per || "-"}</td>
                  <td style={{ padding: "6px 6px", color: T.tx, fontFamily: "monospace", fontSize: 11 }}>{c.room || "-"}</td>
                  <td style={{ padding: "6px 6px", whiteSpace: "nowrap" }}>{c.building ? c.building.split(", ").map(b => <Badge key={b} text={b} color={T.blue || "#3b82f6"} />) : "-"}</td>
                  <td style={{ padding: "6px 6px" }}>{c.quarter ? <Badge text={c.quarter} color={T.green} /> : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div style={{ padding: 20, textAlign: "center", color: T.txD, fontSize: 13 }}>
              {t("admin.syllabus.noMatch")}
            </div>
          )}
        </div>
      )}

      {courses.length === 0 && !loading && (
        <div style={{ padding: 20, textAlign: "center", color: T.txD, fontSize: 13 }}>
          {t("admin.syllabus.noDataHint")}
        </div>
      )}
    </div>
  );
};

const CurriculumInput = ({ years }) => {
  const [text, setText] = useState("");
  const [year, setYear] = useState(years?.[years.length - 1] || "2026");
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const preview = () => {
    const re = /([A-Z]{2,4}\.[A-Z]\d{3})(?:\.[A-Z])?\s+(◎|○)?\s*(.+?)\s+(\d+-\d+-\d+)/g;
    const items = [];
    let m;
    while ((m = re.exec(text)) !== null) {
      items.push({ code: m[1], dept: m[1].split('.')[0], req: m[2] === '◎' ? '必修' : m[2] === '○' ? '選択必修' : '選択', name: m[3].trim() });
    }
    return items;
  };
  const parsed = text.trim() ? preview() : [];
  const detectedDepts = [...new Set(parsed.map(p => p.dept))];

  const submit = async () => {
    if (parsed.length === 0) return;
    setSubmitting(true);
    try {
      const r = await fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update_curriculum", text, dept: detectedDepts.join(','), year }) });
      const d = await r.json();
      setResult(d);
      if (d.ok) setText("");
    } catch (e) { setResult({ error: e.message }); }
    finally { setSubmitting(false); }
  };

  const reqColor = (r) => r === '必修' ? '#ef4444' : r === '選択必修' ? '#f59e0b' : '#22c55e';

  return (
    <div style={{ padding: 16, borderRadius: 14, background: T.bg3, border: `1px solid ${T.bd}` }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: T.txH, marginBottom: 4 }}>{t("admin.curr.title")}</div>
      <div style={{ fontSize: 11, color: T.txD, marginBottom: 12 }}>{t("admin.curr.desc")}</div>

      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        <select value={year} onChange={e => setYear(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, background: T.bg2, border: `1px solid ${T.bd}`, color: T.txH, fontSize: 13 }}>
          {(years || ["2026"]).map(y => <option key={y} value={y}>{t("admin.yearLabel", { y })}</option>)}
        </select>
        {detectedDepts.length > 0 && <span style={{ fontSize: 11, color: T.txD }}>{t("admin.detected")}: {detectedDepts.map(d => <Badge key={d} text={d} color={T.accent} />)}</span>}
      </div>

      <textarea value={text} onChange={e => setText(e.target.value)} placeholder={"MTH.A201.R ◎ 代数学概論第一 1-1-0 1 (a)\nMTH.A203.A ○ 代数学概論第三 1-1-0 1 (a)\nMTH.T201.L 解析力学（講義） 2-0-0 1 5 (b)"} rows={8}
        style={{ width: "100%", padding: 10, borderRadius: 10, background: T.bg2, border: `1px solid ${T.bd}`, color: T.txH, fontSize: 12, fontFamily: "monospace", resize: "vertical", boxSizing: "border-box" }} />

      {parsed.length > 0 && (
        <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: T.bg2, border: `1px solid ${T.bd}`, maxHeight: 200, overflowY: "auto" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.txD, marginBottom: 6 }}>{t("admin.preview")}: {t("admin.curr.nCourses", { n: parsed.length })}</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            {['必修', '選択必修', '選択'].map(r => {
              const cnt = parsed.filter(p => p.req === r).length;
              return cnt > 0 ? <Badge key={r} text={`${r} ${cnt}`} color={reqColor(r)} /> : null;
            })}
          </div>
          {parsed.map((p, i) => (
            <div key={i} style={{ fontSize: 11, color: T.tx, padding: "2px 0", display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontFamily: "monospace", color: T.accent, width: 80, flexShrink: 0 }}>{p.code}</span>
              <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, fontWeight: 600, background: `${reqColor(p.req)}20`, color: reqColor(p.req), flexShrink: 0 }}>{p.req}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
        <Btn onClick={submit} color={T.green} disabled={submitting || parsed.length === 0}>
          {submitting ? t("admin.updating") : t("admin.curr.updateBtn", { n: parsed.length })}
        </Btn>
      </div>

      {/* Result logs */}
      {result && (
        <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: T.bg2, border: `1px solid ${result.ok ? T.green : T.red}40` }}>
          {result.ok ? (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.txH, marginBottom: 6 }}>
                {t("admin.updateDone")}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <Badge text={t("admin.curr.parsed", { n: result.parsed })} color={T.accent} />
                <Badge text={t("admin.curr.dbMatched", { n: result.matched })} color={T.green} />
                {result.notFound > 0 && <Badge text={t("admin.curr.notRegistered", { n: result.notFound })} color="#f59e0b" />}
                {result.errors > 0 && <Badge text={t("admin.curr.errors", { n: result.errors })} color="#ef4444" />}
                <Badge text={t("admin.curr.rowsUpdated", { n: result.updated })} color={T.green} />
              </div>
              {result.logs && (
                <div style={{ maxHeight: 200, overflowY: "auto", fontSize: 11 }}>
                  {result.logs.map((l, i) => (
                    <div key={i} style={{ padding: "2px 0", display: "flex", gap: 6, alignItems: "center", color: l.status === 'ok' ? T.tx : l.status === 'not_found' ? '#f59e0b' : '#ef4444' }}>
                      <span style={{ width: 14, flexShrink: 0, textAlign: "center" }}>
                        {l.status === 'ok' ? '\u2713' : l.status === 'not_found' ? '\u2012' : '\u2717'}
                      </span>
                      <span style={{ fontFamily: "monospace", width: 80, flexShrink: 0 }}>{l.code}</span>
                      <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, fontWeight: 600, background: `${reqColor(l.requirement)}20`, color: reqColor(l.requirement), flexShrink: 0 }}>{l.requirement}</span>
                      <span style={{ color: T.txD }}>
                        {l.status === 'ok' ? t("admin.curr.rowsUpdatedShort", { n: l.rows }) : l.detail}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 12, color: T.red }}>{result.error || t("admin.error")}</div>
          )}
        </div>
      )}
    </div>
  );
};

const SyllabusFetchTab = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scrapeYear, setScrapeYear] = useState("");
  const [selectedDepts, setSelectedDepts] = useState(new Set());
  const [scraping, setScraping] = useState(""); // current dept_year being scraped
  const [queue, setQueue] = useState([]); // remaining [{dept, year}]
  const [batchResults, setBatchResults] = useState([]); // [{dept, year, ok, count?, error?}]
  const [progress, setProgress] = useState(null);
  const [dbLookup, setDbLookup] = useState(true);
  const [togglingLookup, setTogglingLookup] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    console.log(`[SyllabusFetchTab] fetching...`);
    fetch(`${API}/api/admin?action=syllabus`).then(r => {
      console.log(`[SyllabusFetchTab] response status: ${r.status}`);
      return r.json();
    }).then(d => {
      console.log(`[SyllabusFetchTab] loaded: years=${d.years}, depts=${d.departments?.length}, stats=${Object.keys(d.stats || {}).length}`);
      if (d.error) console.error(`[SyllabusFetchTab] API error:`, d.error);
      setData(d);
      if (d?.dbLookupEnabled !== undefined) setDbLookup(d.dbLookupEnabled);
    }).catch(e => { console.error(`[SyllabusFetchTab] fetch failed:`, e); }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleDbLookup = async (enabled) => {
    setTogglingLookup(true);
    try {
      const r = await fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update_site_setting", key: "syllabus_db_lookup", value: { enabled } }) });
      if (r.ok) setDbLookup(enabled);
    } catch {}
    finally { setTogglingLookup(false); }
  };

  // Poll progress during scraping
  useEffect(() => {
    if (!scraping) { setProgress(null); return; }
    const id = setInterval(async () => {
      try {
        const r = await fetch(`${API}/api/admin?action=scrape_progress&key=${scraping}`);
        const d = await r.json();
        if (d.progress) setProgress(d.progress);
      } catch {}
    }, 1000);
    return () => clearInterval(id);
  }, [scraping]);

  // Process queue sequentially. action: 'scrape_syllabus' | 'scrape_textbooks' | 'scrape_grading'
  const scrapeSingle = async (dept, year, action = "scrape_syllabus") => {
    const keyPrefix = action === "scrape_textbooks" ? "tb_"
      : action === "scrape_grading" ? "gr_" : "";
    const key = `${keyPrefix}${dept}_${year}`;
    setScraping(key);
    setProgress({ total: 0, done: 0, phase: "listing", current: "" });
    try {
      const r = await fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, dept, year }) });
      const text = await r.text();
      let d;
      try { d = JSON.parse(text); } catch {
        console.error(`[scrape] ${dept} status=${r.status} body=`, text.slice(0, 500));
        return { dept, year, ok: false, error: `HTTP ${r.status}: ${text.slice(0, 120)}` };
      }
      if (r.ok) {
        const count = action === "scrape_textbooks" ? (d.rows || 0)
          : action === "scrape_grading" ? (d.rows || 0)
          : (d.added || 0);
        return { dept, year, ok: true, count, extra: action === "scrape_grading" ? d.withBreakdown : null };
      }
      return { dept, year, ok: false, error: d.error || t("admin.unknownError") };
    } catch (e) {
      console.error(`[scrape] ${dept} fetch error:`, e);
      return { dept, year, ok: false, error: e.message };
    } finally {
      setScraping("");
      setProgress(null);
    }
  };

  const handleBatchScrape = async (deptList, year, action = "scrape_syllabus") => {
    setBatchResults([]);
    setQueue(deptList.map(d => ({ dept: d, year })));
    const results = [];
    for (const dept of deptList) {
      setQueue(prev => prev.filter(q => q.dept !== dept));
      const result = await scrapeSingle(dept, year, action);
      results.push(result);
      setBatchResults(prev => [...prev, result]);
    }
    load();
    const ok = results.filter(r => r.ok);
    const fail = results.filter(r => !r.ok);
    const label = action === "scrape_textbooks" ? t("admin.fetch.textbookFetch")
      : action === "scrape_grading" ? t("admin.fetch.gradingFetch")
      : t("admin.fetch.fetch");
    let msg = t("admin.fetch.batchDone", { label, ok: ok.length, total: results.length });
    if (ok.length > 0) {
      msg += "\n" + t("admin.fetch.totalCount", { n: ok.reduce((s, r) => s + r.count, 0) });
      if (action === "scrape_grading") {
        msg += " " + t("admin.fetch.parsedRatio", { n: ok.reduce((s, r) => s + (r.extra || 0), 0) });
      }
    }
    if (fail.length > 0) msg += "\n\n" + t("admin.fetch.failed", { list: fail.map(r => `${r.dept} (${r.error})`).join(", ") });
    alert(msg);
  };

  const handleScrape = async (dept, year, action = "scrape_syllabus") => {
    setBatchResults([]);
    const result = await scrapeSingle(dept, year, action);
    setBatchResults([result]);
    load();
    const label = action === "scrape_textbooks" ? t("admin.fetch.textbook")
      : action === "scrape_grading" ? t("admin.fetch.grading")
      : "";
    if (result.ok) alert(t("admin.fetch.singleDone", { dept, year, label, n: result.count }));
    else alert(t("admin.fetch.fetchFailed", { error: result.error }));
  };

  const departments = data?.departments || [];
  const years = data?.years || [];
  const stats = data?.stats || {};
  const gradingStats = data?.gradingStats || {};
  const gradingTotals = data?.gradingTotals || { total: 0, parsed: 0 };
  const gradingTableExists = data?.gradingTableExists !== false; // undefined = まだロード中
  const gradingTableError = data?.gradingTableError;
  const isBusy = !!scraping || queue.length > 0;

  const bySchool = {};
  for (const d of departments) {
    if (!bySchool[d.school]) bySchool[d.school] = [];
    bySchool[d.school].push(d);
  }

  const toggleDept = (key) => {
    setSelectedDepts(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleSchool = (school) => {
    const depts = bySchool[school] || [];
    const allSelected = depts.every(d => selectedDepts.has(d.key));
    setSelectedDepts(prev => {
      const next = new Set(prev);
      for (const d of depts) { allSelected ? next.delete(d.key) : next.add(d.key); }
      return next;
    });
  };

  const selectAll = () => {
    if (selectedDepts.size === departments.length) setSelectedDepts(new Set());
    else setSelectedDepts(new Set(departments.map(d => d.key)));
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, marginBottom: 16 }}>{t("admin.tab.syllabusFetch")}</div>

      {loading && <div style={{ color: T.txD, fontSize: 13, padding: 20 }}>{t("common.loading")}</div>}

      {!loading && (
        <>
          {/* Scrape controls */}
          <div style={{ padding: 16, borderRadius: 14, background: T.bg3, border: `1px solid ${T.bd}`, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.txH, marginBottom: 12 }}>{t("admin.fetch.fromSyllabus")}</div>

            {/* Year + action buttons */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
              <select value={scrapeYear} onChange={e => setScrapeYear(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, background: T.bg2, border: `1px solid ${T.bd}`, color: T.txH, fontSize: 13 }}>
                <option value="">{t("admin.selectYear")}</option>
                {years.map(y => <option key={y} value={y}>{t("admin.yearLabel", { y })}</option>)}
              </select>
              <Btn onClick={selectAll} color={T.txD} small>
                {selectedDepts.size === departments.length ? t("admin.deselectAll") : t("admin.selectAll")}
              </Btn>
              <Btn
                onClick={() => handleBatchScrape([...selectedDepts], scrapeYear)}
                color={T.green}
                disabled={!scrapeYear || selectedDepts.size === 0 || isBusy}
              >
                {isBusy ? t("admin.fetching") : t("admin.fetch.fetchSelectedDepts", { n: selectedDepts.size })}
              </Btn>
              <Btn
                onClick={() => handleBatchScrape([...selectedDepts], scrapeYear, "scrape_textbooks")}
                color={T.accent}
                disabled={!scrapeYear || selectedDepts.size === 0 || isBusy}
              >
                {isBusy ? t("admin.fetching") : t("admin.fetch.fetchTextbooks")}
              </Btn>
              <Btn
                onClick={() => handleBatchScrape([...selectedDepts], scrapeYear, "scrape_grading")}
                color={T.purple || "#a855c7"}
                disabled={!scrapeYear || selectedDepts.size === 0 || isBusy}
              >
                {isBusy ? t("admin.fetching") : t("admin.fetch.fetchGrading")}
              </Btn>
            </div>

            {/* Department chips grouped by school */}
            <div style={{ marginBottom: 12 }}>
              {Object.entries(bySchool).map(([school, depts]) => {
                const allSelected = depts.every(d => selectedDepts.has(d.key));
                return (
                  <div key={school} style={{ marginBottom: 8 }}>
                    <button
                      onClick={() => toggleSchool(school)}
                      style={{ background: "none", border: "none", padding: "2px 0", cursor: "pointer", fontSize: 11, fontWeight: 700, color: allSelected ? T.accent : T.txD, marginBottom: 4, display: "block" }}
                    >{school}</button>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {depts.map(d => {
                        const sel = selectedDepts.has(d.key);
                        const done = batchResults.find(r => r.dept === d.key);
                        return (
                          <button
                            key={d.key}
                            onClick={() => toggleDept(d.key)}
                            disabled={isBusy}
                            style={{
                              padding: "3px 8px", borderRadius: 6, fontSize: 11, cursor: isBusy ? "default" : "pointer",
                              border: `1px solid ${done ? (done.ok ? T.green : T.red) : sel ? T.accent : T.bd}`,
                              background: done ? (done.ok ? `${T.green}15` : `${T.red}15`) : sel ? `${T.accent}15` : T.bg2,
                              color: done ? (done.ok ? T.green : T.red) : sel ? T.accent : T.txD,
                              fontWeight: sel ? 600 : 400,
                            }}
                          >
                            {d.key}
                            {done && done.ok && <span style={{ marginLeft: 3 }}>{done.count}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Progress indicator */}
            {scraping && progress && (
              <div style={{ padding: "10px 14px", borderRadius: 10, background: T.bg2, border: `1px solid ${T.accent}40` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.txH }}>
                    {scraping.replace("_", " ")} — {progress.phase === "listing" ? t("admin.fetch.phaseListing") : progress.phase === "saving" ? t("admin.fetch.phaseSaving") : t("admin.fetch.phaseDetail", { done: progress.done, total: progress.total })}
                    {queue.length > 0 && <span style={{ color: T.txD, fontWeight: 400 }}> {t("admin.fetch.remainingDepts", { n: queue.length })}</span>}
                  </span>
                  {progress.current && <span style={{ fontSize: 11, color: T.accent, fontFamily: "monospace" }}>{progress.current}</span>}
                </div>
                {progress.total > 0 && (
                  <div style={{ height: 6, borderRadius: 3, background: T.bd, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 3, background: T.accent, width: `${Math.round((progress.done / progress.total) * 100)}%`, transition: "width 0.3s" }} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Per-dept × year status table */}
          {departments.length > 0 && (
            <div style={{ padding: 16, borderRadius: 14, background: T.bg3, border: `1px solid ${T.bd}`, marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.txH, marginBottom: 12 }}>{t("admin.fetch.status")}</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr>
                      <th style={{ padding: "6px 8px", textAlign: "left", color: T.txD, fontWeight: 600, borderBottom: `1px solid ${T.bd}` }}>{t("admin.dept")}</th>
                      {years.map(y => <th key={y} style={{ padding: "6px 8px", textAlign: "center", color: T.txD, fontWeight: 600, borderBottom: `1px solid ${T.bd}` }}>{y}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(bySchool).map(([school, depts]) => (
                      <React.Fragment key={school}>
                        <tr><td colSpan={1 + years.length} style={{ padding: "6px 8px", fontWeight: 700, fontSize: 11, color: T.txD, background: T.bg2, borderBottom: `1px solid ${T.bd}` }}>{school}</td></tr>
                        {depts.map(d => (
                          <tr key={d.key} style={{ borderBottom: `1px solid ${T.bd}` }}>
                            <td style={{ padding: "4px 8px", color: T.txH, fontWeight: 500 }}>{d.key} <span style={{ color: T.txD, fontWeight: 400 }}>{d.label}</span></td>
                            {years.map(y => {
                              const s = stats[`${d.key}_${y}`];
                              const isScraping = scraping === `${d.key}_${y}`;
                              return (
                                <td key={y} style={{ padding: "4px 8px", textAlign: "center" }}>
                                  {s ? (
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                                      <span style={{ color: T.green, fontWeight: 600 }}>{s.count}</span>
                                      <button onClick={() => handleScrape(d.key, y)} disabled={isBusy} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", padding: 0, fontSize: 10 }} title={t("admin.refetch")}>{isScraping ? "..." : "↻"}</button>
                                    </span>
                                  ) : (
                                    <button onClick={() => handleScrape(d.key, y)} disabled={isBusy} style={{ background: "none", border: `1px solid ${T.bd}`, borderRadius: 6, padding: "2px 8px", color: T.txD, cursor: "pointer", fontSize: 10 }}>{isScraping ? "..." : t("admin.fetch.fetch")}</button>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 成績割合 取得状況 */}
          {departments.length > 0 && (
            <div style={{ padding: 16, borderRadius: 14, background: T.bg3, border: `1px solid ${T.bd}`, marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.txH }}>{t("admin.grading.status")}</div>
                {gradingTableExists && (
                  <div style={{ fontSize: 11, color: T.txD }}>
                    {t("admin.total")} <span style={{ color: T.txH, fontWeight: 700 }}>{gradingTotals.total}</span> {t("admin.items")}
                    {" / " + t("admin.grading.ofWhichParsed") + " "}
                    <span style={{ color: T.accent, fontWeight: 700 }}>{gradingTotals.parsed}</span> {t("admin.items")}
                    {gradingTotals.total > 0 && (
                      <span> ({Math.round(gradingTotals.parsed / gradingTotals.total * 100)}%)</span>
                    )}
                  </div>
                )}
              </div>

              {!gradingTableExists && (
                <div style={{
                  padding: "10px 14px", borderRadius: 10,
                  background: `${T.red}15`, border: `1px solid ${T.red}60`,
                  color: T.red, fontSize: 12, marginBottom: 12,
                }}>
                  ⚠ <strong>{t("admin.grading.tableMissing")}</strong><br/>
                  <span style={{ color: T.txH }}>
                    {t("admin.grading.runSqlPre")} <code style={{ background: T.bg2, padding: "1px 5px", borderRadius: 3 }}>supabase/course-grading.sql</code> {t("admin.grading.runSqlPost")}
                  </span>
                  {gradingTableError && (
                    <div style={{ marginTop: 6, fontSize: 10, color: T.txD, fontFamily: "monospace" }}>
                      detail: {gradingTableError}
                    </div>
                  )}
                </div>
              )}

              {gradingTableExists && (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead>
                      <tr>
                        <th style={{ padding: "6px 8px", textAlign: "left", color: T.txD, fontWeight: 600, borderBottom: `1px solid ${T.bd}` }}>{t("admin.dept")}</th>
                        {years.map(y => (
                          <th key={y} style={{ padding: "6px 8px", textAlign: "center", color: T.txD, fontWeight: 600, borderBottom: `1px solid ${T.bd}` }}>
                            {y} <span style={{ fontWeight: 400, fontSize: 10 }}>{t("admin.grading.itemsParsedHdr")}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(bySchool).map(([school, depts]) => (
                        <React.Fragment key={school}>
                          <tr><td colSpan={1 + years.length} style={{ padding: "6px 8px", fontWeight: 700, fontSize: 11, color: T.txD, background: T.bg2, borderBottom: `1px solid ${T.bd}` }}>{school}</td></tr>
                          {depts.map(d => (
                            <tr key={d.key} style={{ borderBottom: `1px solid ${T.bd}` }}>
                              <td style={{ padding: "4px 8px", color: T.txH, fontWeight: 500 }}>{d.key} <span style={{ color: T.txD, fontWeight: 400 }}>{d.label}</span></td>
                              {years.map(y => {
                                const s = gradingStats[`${d.key}_${y}`];
                                const isScraping = scraping === `gr_${d.key}_${y}`;
                                return (
                                  <td key={y} style={{ padding: "4px 8px", textAlign: "center" }}>
                                    {s ? (
                                      <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                                        <span style={{ color: T.txH, fontWeight: 600 }}>{s.total}</span>
                                        <span style={{ color: T.txD }}>/</span>
                                        <span style={{ color: s.parsed > 0 ? T.accent : T.txD, fontWeight: 600 }}>{s.parsed}</span>
                                        <button onClick={() => handleScrape(d.key, y, "scrape_grading")} disabled={isBusy} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", padding: 0, fontSize: 10 }} title={t("admin.refetch")}>{isScraping ? "..." : "↻"}</button>
                                      </span>
                                    ) : (
                                      <button onClick={() => handleScrape(d.key, y, "scrape_grading")} disabled={isBusy} style={{ background: "none", border: `1px solid ${T.bd}`, borderRadius: 6, padding: "2px 8px", color: T.txD, cursor: "pointer", fontSize: 10 }}>{isScraping ? "..." : t("admin.fetch.fetch")}</button>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* DB lookup toggle */}
          <div style={{ padding: 16, borderRadius: 14, background: T.bg3, border: `1px solid ${T.bd}`, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.txH, marginBottom: 12 }}>{t("admin.settings")}</div>
            <div style={{ padding: "10px 14px", borderRadius: 10, background: T.bg2, border: `1px solid ${T.bd}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.txH }}>{t("admin.fetch.dbLookup")}</div>
                <div style={{ fontSize: 11, color: T.txD, marginTop: 2 }}>{t("admin.fetch.dbLookupDesc")}</div>
              </div>
              <button
                onClick={() => toggleDbLookup(!dbLookup)}
                disabled={togglingLookup}
                style={{ width: 44, height: 24, borderRadius: 12, border: "none", cursor: togglingLookup ? "wait" : "pointer", background: dbLookup ? T.green : T.bd, position: "relative", transition: "background 0.2s" }}
              >
                <div style={{ width: 18, height: 18, borderRadius: 9, background: "#fff", position: "absolute", top: 3, left: dbLookup ? 23 : 3, transition: "left 0.2s" }} />
              </button>
            </div>
          </div>

          {/* Curriculum requirement update */}
          <CurriculumInput years={years} />

          {/* Textbooks viewer */}
          <TextbooksViewer years={years} departments={departments} />

          {/* Normalized books viewer (Stage B) */}
          <BooksViewer years={years} departments={departments} />
        </>
      )}
    </div>
  );
};

// ---- Textbooks Viewer (course_textbooks_raw) ----
const TextbooksViewer = ({ years, departments }) => {
  const [year, setYear] = useState("");
  const [dept, setDept] = useState("");
  const [kind, setKind] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState([]);
  const [lineTotals, setLineTotals] = useState({ book: 0, noise: 0, annotation: 0 });
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [hideNoise, setHideNoise] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ action: "textbooks" });
      if (year) params.set("year", year);
      if (dept) params.set("dept", dept);
      if (kind) params.set("kind", kind);
      if (search) params.set("search", search);
      const r = await fetch(`${API}/api/admin?${params.toString()}`);
      const d = await r.json();
      setRows(d.rows || []);
      setLineTotals(d.lineTotals || { book: 0, noise: 0, annotation: 0 });
      setLoaded(true);
    } catch (e) {
      console.error("[Textbooks] fetch failed:", e);
    } finally {
      setLoading(false);
    }
  }, [year, dept, kind, search]);

  const kindLabel = (k) => k === "textbook" ? t("admin.tb.textbook") : k === "reference" ? t("admin.tb.reference") : k;
  const lineKindStyle = (k) => {
    if (k === "book") return { color: T.green, bg: `${T.green}15`, label: "📚 " + t("admin.tb.candidate") };
    if (k === "noise") return { color: T.txD, bg: T.bg2, label: "✕ " + t("admin.tb.ignore") };
    if (k === "annotation") return { color: T.accent, bg: `${T.accent}15`, label: t("admin.tb.annotation") };
    return { color: T.txD, bg: T.bg2, label: k };
  };

  return (
    <div style={{ padding: 16, borderRadius: 14, background: T.bg3, border: `1px solid ${T.bd}`, marginTop: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: T.txH, marginBottom: 4 }}>
        {t("admin.tb.listTitle")} ({rows.length})
      </div>
      {loaded && (
        <div style={{ fontSize: 11, color: T.txD, marginBottom: 12 }}>
          {t("admin.tb.splitLines")}: <span style={{ color: T.green, fontWeight: 600 }}>📚 {t("admin.tb.candidate")} {lineTotals.book}</span>
          <span style={{ color: T.accent }}>{t("admin.tb.annotation")} {lineTotals.annotation}</span>
          <span>✕ {t("admin.tb.ignore")} {lineTotals.noise}</span>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <select value={year} onChange={e => setYear(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, background: T.bg2, border: `1px solid ${T.bd}`, color: T.txH, fontSize: 13 }}>
          <option value="">{t("admin.yearAll")}</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={dept} onChange={e => setDept(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, background: T.bg2, border: `1px solid ${T.bd}`, color: T.txH, fontSize: 13 }}>
          <option value="">{t("admin.schoolAll")}</option>
          {departments.map(d => <option key={d.key} value={d.key}>{d.key} {d.label}</option>)}
        </select>
        <select value={kind} onChange={e => setKind(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, background: T.bg2, border: `1px solid ${T.bd}`, color: T.txH, fontSize: 13 }}>
          <option value="">{t("admin.tb.kindAll")}</option>
          <option value="textbook">{t("admin.tb.textbook")}</option>
          <option value="reference">{t("admin.tb.reference")}</option>
        </select>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") load(); }}
          placeholder={t("admin.tb.searchPh")}
          style={{ padding: "6px 10px", borderRadius: 8, background: T.bg2, border: `1px solid ${T.bd}`, color: T.txH, fontSize: 13, minWidth: 180 }}
        />
        <Btn onClick={load} color={T.accent} small disabled={loading}>
          {loading ? t("admin.loadingShort") : t("admin.search")}
        </Btn>
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: T.txD, cursor: "pointer" }}>
          <input type="checkbox" checked={showPreview} onChange={e => setShowPreview(e.target.checked)} />
          {t("admin.tb.splitPreview")}
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: T.txD, cursor: "pointer" }}>
          <input type="checkbox" checked={hideNoise} onChange={e => setHideNoise(e.target.checked)} />
          {t("admin.tb.hideNoise")}
        </label>
      </div>

      {/* Table */}
      {loaded && rows.length === 0 && (
        <div style={{ color: T.txD, fontSize: 13, padding: 12 }}>{t("admin.noMatchData")}</div>
      )}
      {rows.length > 0 && (
        <div style={{ overflowX: "auto", maxHeight: 600, overflowY: "auto", border: `1px solid ${T.bd}`, borderRadius: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead style={{ position: "sticky", top: 0, background: T.bg2, zIndex: 1 }}>
              <tr>
                <th style={{ padding: "6px 8px", textAlign: "left", color: T.txD, fontWeight: 600, borderBottom: `1px solid ${T.bd}`, whiteSpace: "nowrap" }}>{t("admin.col.course")}</th>
                <th style={{ padding: "6px 8px", textAlign: "left", color: T.txD, fontWeight: 600, borderBottom: `1px solid ${T.bd}`, whiteSpace: "nowrap" }}>{t("admin.col.yearShort")}</th>
                <th style={{ padding: "6px 8px", textAlign: "left", color: T.txD, fontWeight: 600, borderBottom: `1px solid ${T.bd}`, whiteSpace: "nowrap" }}>{t("admin.col.kind")}</th>
                <th style={{ padding: "6px 8px", textAlign: "left", color: T.txD, fontWeight: 600, borderBottom: `1px solid ${T.bd}` }}>{showPreview ? t("admin.tb.splitPreview") : t("admin.col.content")}</th>
                <th style={{ padding: "6px 8px", textAlign: "left", color: T.txD, fontWeight: 600, borderBottom: `1px solid ${T.bd}`, whiteSpace: "nowrap" }}>{t("admin.col.syllabus")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ borderBottom: `1px solid ${T.bd}` }}>
                  <td style={{ padding: "6px 8px", color: T.txH, fontFamily: "monospace", whiteSpace: "nowrap", verticalAlign: "top" }}>{r.course_code}</td>
                  <td style={{ padding: "6px 8px", color: T.txD, whiteSpace: "nowrap", verticalAlign: "top" }}>{r.syllabus_year}</td>
                  <td style={{ padding: "6px 8px", color: r.kind === "textbook" ? T.accent : T.txD, whiteSpace: "nowrap", verticalAlign: "top" }}>{kindLabel(r.kind)}</td>
                  <td style={{ padding: "6px 8px", color: T.txH, verticalAlign: "top", maxWidth: 700 }}>
                    {showPreview && r.lines ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        {r.lines.filter(l => !(hideNoise && l.kind === "noise")).map((l, i) => {
                          const st = lineKindStyle(l.kind);
                          return (
                            <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                              <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: st.bg, color: st.color, whiteSpace: "nowrap", flexShrink: 0, fontWeight: 600 }}>{st.label}</span>
                              <span style={{ color: l.kind === "book" ? T.txH : T.txD, whiteSpace: "pre-wrap", flex: 1 }}>
                                {l.text}
                                {l.reason && <span style={{ color: T.txD, fontSize: 10, marginLeft: 6 }}>// {l.reason}</span>}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <span style={{ whiteSpace: "pre-wrap" }}>{r.raw_text}</span>
                    )}
                  </td>
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap", verticalAlign: "top" }}>
                    {r.source_url && <a href={r.source_url} target="_blank" rel="noopener noreferrer" style={{ color: T.accent, fontSize: 11 }}>{t("admin.open")}</a>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ---- Books Viewer (Stage B: course_books × books) ----
const BooksViewer = ({ years, departments }) => {
  const [year, setYear] = useState("");
  const [dept, setDept] = useState("");
  const [confidence, setConfidence] = useState("");
  const [onlyOrphan, setOnlyOrphan] = useState(false);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({ high: 0, medium: 0, low: 0, none: 0 });
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [normalizing, setNormalizing] = useState(false);
  const [normResult, setNormResult] = useState(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichResult, setEnrichResult] = useState(null);
  const [enrichProgress, setEnrichProgress] = useState(null);
  const [normProgress, setNormProgress] = useState(null);
  const [status, setStatus] = useState("");
  const [actionLoading, setActionLoading] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ action: "books" });
      if (year) params.set("year", year);
      if (dept) params.set("dept", dept);
      if (confidence) params.set("confidence", confidence);
      if (onlyOrphan) params.set("only_orphan", "1");
      if (status) params.set("status", status);
      if (search) params.set("search", search);
      const r = await fetch(`${API}/api/admin?${params.toString()}`);
      const d = await r.json();
      setRows(d.rows || []);
      setCounts(d.counts || { high: 0, medium: 0, low: 0, none: 0 });
      setLoaded(true);
    } catch (e) {
      console.error("[Books] fetch failed:", e);
    } finally {
      setLoading(false);
    }
  }, [year, dept, confidence, onlyOrphan, status, search]);

  // Stage D action handlers
  const updateRowStatus = async (rowId, newStatus) => {
    setActionLoading(prev => ({ ...prev, [rowId]: true }));
    try {
      const r = await fetch(`${API}/api/admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_course_book", id: rowId, status: newStatus }),
      });
      if (r.ok) {
        setRows(prev => prev.map(x => x.id === rowId ? { ...x, status: newStatus } : x));
      } else {
        const d = await r.json();
        alert(`${t("admin.failed")}: ${d.error}`);
      }
    } catch (e) {
      alert(`${t("admin.error")}: ${e.message}`);
    } finally {
      setActionLoading(prev => ({ ...prev, [rowId]: false }));
    }
  };

  const manualLinkIsbn = async (rowId) => {
    const isbn = prompt(t("admin.books.isbnPrompt"));
    if (!isbn) return;
    setActionLoading(prev => ({ ...prev, [rowId]: true }));
    try {
      const r = await fetch(`${API}/api/admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "manual_link_isbn", course_book_id: rowId, isbn }),
      });
      const d = await r.json();
      if (r.ok) {
        alert(`${t("admin.books.linkSuccess")}: ${d.title || d.book_id} (${d.source})`);
        await load();
      } else {
        alert(`${t("admin.failed")}: ${d.error}`);
      }
    } catch (e) {
      alert(`${t("admin.error")}: ${e.message}`);
    } finally {
      setActionLoading(prev => ({ ...prev, [rowId]: false }));
    }
  };

  const runNormalize = async () => {
    if (!year) { alert(t("admin.selectYearAlert")); return; }
    if (!confirm(t("admin.books.confirmNormalize", { dept: dept || t("admin.allSchools"), year }))) return;
    setNormalizing(true);
    setNormResult(null);
    setNormProgress({ phase: "loading" });
    try {
      const r = await fetch(`${API}/api/admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "normalize_textbooks", dept: dept || undefined, year, faculty: "isct" }),
      });
      const d = await r.json();
      if (r.ok) {
        setNormResult(d);
        await load();
      } else {
        alert(`${t("admin.books.normalizeFailed")}: ${d.error}`);
      }
    } catch (e) {
      alert(`${t("admin.error")}: ${e.message}`);
    } finally {
      setNormalizing(false);
      setNormProgress(null);
    }
  };

  const runRecleanup = async () => {
    if (!year) { alert(t("admin.selectYearAlert")); return; }
    if (!confirm(t("admin.books.confirmRecleanup", { dept: dept || t("admin.allSchools"), year }))) return;
    try {
      const r = await fetch(`${API}/api/admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "recleanup_course_books", dept: dept || undefined, year, faculty: "isct" }),
      });
      const d = await r.json();
      if (r.ok) {
        alert(t("admin.books.recleanupDone", { scanned: d.scanned, deleted: d.deleted }));
        await load();
      } else {
        alert(`${t("admin.failed")}: ${d.error}`);
      }
    } catch (e) {
      alert(`${t("admin.error")}: ${e.message}`);
    }
  };

  const runEnrich = async () => {
    if (!year) { alert(t("admin.selectYearAlert")); return; }
    if (!confirm(t("admin.books.confirmEnrich", { dept: dept || t("admin.allSchools"), year }))) return;
    setEnriching(true);
    setEnrichResult(null);
    setEnrichProgress({ phase: "loading", done: 0, total: 0, matched: 0 });
    try {
      const r = await fetch(`${API}/api/admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enrich_textbooks", dept: dept || undefined, year, faculty: "isct" }),
      });
      const d = await r.json();
      if (r.ok) {
        setEnrichResult(d);
        await load();
      } else {
        alert(`${t("admin.books.enrichFailed")}: ${d.error}`);
      }
    } catch (e) {
      alert(`${t("admin.error")}: ${e.message}`);
    } finally {
      setEnriching(false);
      setEnrichProgress(null);
    }
  };

  // Poll progress while enriching
  useEffect(() => {
    if (!enriching) return;
    const key = `enrich_${dept || "all"}_${year}_isct`;
    const id = setInterval(async () => {
      try {
        const r = await fetch(`${API}/api/admin?action=enrich_progress&key=${encodeURIComponent(key)}`);
        const d = await r.json();
        if (d.progress) setEnrichProgress(d.progress);
      } catch {}
    }, 1500);
    return () => clearInterval(id);
  }, [enriching, dept, year]);

  // Poll progress while normalizing
  useEffect(() => {
    if (!normalizing) return;
    const key = `norm_${dept || "all"}_${year}_isct`;
    const id = setInterval(async () => {
      try {
        const r = await fetch(`${API}/api/admin?action=normalize_progress&key=${encodeURIComponent(key)}`);
        const d = await r.json();
        if (d.progress) setNormProgress(d.progress);
      } catch {}
    }, 1500);
    return () => clearInterval(id);
  }, [normalizing, dept, year]);

  const confidenceStyle = (c) => {
    if (c === "high") return { color: T.green, bg: `${T.green}15`, label: t("admin.books.high") };
    if (c === "medium") return { color: T.accent, bg: `${T.accent}15`, label: t("admin.books.medium") };
    if (c === "low") return { color: "#e58c25", bg: "#e58c2515", label: t("admin.books.low") };
    return { color: T.txD, bg: T.bg2, label: "—" };
  };

  const statusStyle = (s) => {
    if (s === "confirmed") return { color: T.green, bg: `${T.green}20`, label: "✓ " + t("admin.books.confirmed") };
    if (s === "rejected") return { color: T.red, bg: `${T.red}20`, label: "✗ " + t("admin.books.rejected") };
    if (s === "not_a_book") return { color: T.txD, bg: T.bg2, label: "⊘ " + t("admin.books.notABook") };
    return { color: T.txD, bg: "transparent", label: t("admin.books.unconfirmed") };
  };

  return (
    <div style={{ padding: 16, borderRadius: 14, background: T.bg3, border: `1px solid ${T.bd}`, marginTop: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: T.txH, marginBottom: 4 }}>
        {t("admin.books.title")} ({rows.length})
      </div>
      <div style={{ fontSize: 11, color: T.txD, marginBottom: 12 }}>
        {t("admin.books.confidence")}: <span style={{ color: T.green, fontWeight: 600 }}>{t("admin.books.high")} {counts.high}</span>{" / "}
        <span style={{ color: T.accent }}>{t("admin.books.medium")} {counts.medium}</span>{" / "}
        <span style={{ color: "#e58c25" }}>{t("admin.books.low")} {counts.low}</span>{" / "}
        <span>{t("admin.books.unmatched")} {counts.none}</span>
      </div>

      {/* Filters + run */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <select value={year} onChange={e => setYear(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, background: T.bg2, border: `1px solid ${T.bd}`, color: T.txH, fontSize: 13 }}>
          <option value="">{t("admin.yearSelect")}</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={dept} onChange={e => setDept(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, background: T.bg2, border: `1px solid ${T.bd}`, color: T.txH, fontSize: 13 }}>
          <option value="">{t("admin.schoolAll")}</option>
          {departments.map(d => <option key={d.key} value={d.key}>{d.key} {d.label}</option>)}
        </select>
        <select value={confidence} onChange={e => setConfidence(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, background: T.bg2, border: `1px solid ${T.bd}`, color: T.txH, fontSize: 13 }}>
          <option value="">{t("admin.books.confidenceAll")}</option>
          <option value="high">{t("admin.books.high")}</option>
          <option value="medium">{t("admin.books.medium")}</option>
          <option value="low">{t("admin.books.low")}</option>
          <option value="none">{t("admin.books.unmatched")}</option>
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, background: T.bg2, border: `1px solid ${T.bd}`, color: T.txH, fontSize: 13 }}>
          <option value="">{t("admin.books.reviewStateAll")}</option>
          <option value="pending">{t("admin.books.unconfirmed")}</option>
          <option value="confirmed">{t("admin.books.confirmed")}</option>
          <option value="rejected">{t("admin.books.rejected")}</option>
          <option value="not_a_book">{t("admin.books.notABook")}</option>
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: T.txD, cursor: "pointer" }}>
          <input type="checkbox" checked={onlyOrphan} onChange={e => setOnlyOrphan(e.target.checked)} />
          {t("admin.books.unmatchedOnly")}
        </label>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") load(); }}
          placeholder={t("admin.books.codeTextPh")}
          style={{ padding: "6px 10px", borderRadius: 8, background: T.bg2, border: `1px solid ${T.bd}`, color: T.txH, fontSize: 13, minWidth: 140 }}
        />
        <Btn onClick={load} color={T.accent} small disabled={loading}>{loading ? t("admin.loadingShort") : t("admin.search")}</Btn>
        <Btn onClick={runNormalize} color={T.green} disabled={normalizing || enriching || !year}>
          {normalizing ? t("admin.books.normalizing") : t("admin.books.btnNormalize") + (dept ? ` (${dept})` : "")}
        </Btn>
        <Btn onClick={runEnrich} color={T.accent} disabled={normalizing || enriching || !year}>
          {enriching ? t("admin.books.searching") : t("admin.books.btnEnrich")}
        </Btn>
        <Btn onClick={runRecleanup} color={T.txD} disabled={normalizing || enriching || !year}>
          {t("admin.books.btnRecleanup")}
        </Btn>
      </div>

      {/* Live progress while normalizing */}
      {normalizing && normProgress && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: T.bg2, border: `1px solid ${T.green}40`, marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, fontSize: 12, color: T.txH }}>
            <span><b>{t("admin.books.normalizingLabel")}</b> — {t("admin.phase")}: {normProgress.phase || "—"}</span>
            {normProgress.total > 0 && <span>{normProgress.done || 0} / {normProgress.total}</span>}
          </div>
          {normProgress.total > 0 && (
            <div style={{ height: 6, borderRadius: 3, background: T.bd, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 3, background: T.green, width: `${Math.min(100, Math.round(((normProgress.done || 0) / normProgress.total) * 100))}%`, transition: "width 0.3s" }} />
            </div>
          )}
          {normProgress.rawRows && <div style={{ fontSize: 11, color: T.txD, marginTop: 4 }}>raw {normProgress.rawRows}{t("admin.items")}, {t("admin.books.bookCandidates")} {normProgress.bookLines || "?"}, books up {normProgress.booksUpserted || 0}</div>}
        </div>
      )}

      {/* Live progress while enriching */}
      {enriching && enrichProgress && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: T.bg2, border: `1px solid ${T.accent}40`, marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, fontSize: 12, color: T.txH }}>
            <span><b>{t("admin.books.searchingLabel")}</b> — {enrichProgress.phase || "—"}</span>
            {enrichProgress.total > 0 && (
              <span>
                {enrichProgress.done || 0} / {enrichProgress.total}
                {" "}({Math.round(((enrichProgress.done || 0) / enrichProgress.total) * 100)}%)
              </span>
            )}
          </div>
          {enrichProgress.total > 0 && (
            <div style={{ height: 6, borderRadius: 3, background: T.bd, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 3, background: T.accent, width: `${Math.min(100, Math.round(((enrichProgress.done || 0) / enrichProgress.total) * 100))}%`, transition: "width 0.3s" }} />
            </div>
          )}
          <div style={{ fontSize: 11, color: T.txD, marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <span>{t("admin.books.matched")} {enrichProgress.matched || 0}{t("admin.items")}</span>
            <span style={{ color: T.green }}>NDL {enrichProgress.ndlHits || 0}</span>
            <span style={{ color: enrichProgress.useGoogleBooks === false ? T.red : T.accent }}>
              Google {enrichProgress.googleHits || 0}{enrichProgress.useGoogleBooks === false && " " + t("admin.books.stopped")}
            </span>
            {enrichProgress.currentText && (
              <span style={{ fontFamily: "monospace", color: T.txD, fontSize: 10, marginLeft: "auto", maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{enrichProgress.currentText}</span>
            )}
          </div>
        </div>
      )}

      {normResult && (
        <div style={{ padding: "8px 12px", borderRadius: 8, background: `${T.green}15`, border: `1px solid ${T.green}40`, color: T.txH, fontSize: 12, marginBottom: 8 }}>
          {t("admin.books.normDoneLabel")}: raw {normResult.rawRows}{t("admin.items")} → {t("admin.books.bookCandidates")} {normResult.bookLines}{t("admin.lines")}
          ({t("admin.books.withIsbn")} {normResult.isbnLines}, openBD HIT {normResult.openbdHits} / MISS {normResult.openbdMisses}, {t("admin.books.noIsbn")} {normResult.noIsbn}){t("admin.comma")}
          books {t("admin.books.toN", { n: normResult.booksUpserted })}{t("admin.comma")}course_books {t("admin.books.toN", { n: normResult.linksUpserted })}
        </div>
      )}
      {enrichResult && (
        <div style={{ padding: "8px 12px", borderRadius: 8, background: `${T.accent}15`, border: `1px solid ${T.accent}40`, color: T.txH, fontSize: 12, marginBottom: 12 }}>
          {t("admin.books.enrichDoneLabel")}: {t("admin.books.unmatched")} {enrichResult.candidates}{t("admin.items")} → {t("admin.books.matched")} {enrichResult.matched}{t("admin.items")}
          (NDL {enrichResult.ndlHits} / Google {enrichResult.googleHits}, {t("admin.books.medium")} {enrichResult.medium} / {t("admin.books.low")} {enrichResult.low}){t("admin.comma")}
          books {t("admin.books.newN", { n: enrichResult.booksUpserted })}
        </div>
      )}

      {loaded && rows.length === 0 && (
        <div style={{ color: T.txD, fontSize: 13, padding: 12 }}>{t("admin.books.emptyHint")}</div>
      )}

      {rows.length > 0 && (
        <div style={{ overflowX: "auto", maxHeight: 600, overflowY: "auto", border: `1px solid ${T.bd}`, borderRadius: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead style={{ position: "sticky", top: 0, background: T.bg2, zIndex: 1 }}>
              <tr>
                <th style={{ padding: "6px 8px", textAlign: "left", color: T.txD, fontWeight: 600, borderBottom: `1px solid ${T.bd}`, whiteSpace: "nowrap" }}>{t("admin.col.course")}</th>
                <th style={{ padding: "6px 8px", textAlign: "left", color: T.txD, fontWeight: 600, borderBottom: `1px solid ${T.bd}`, whiteSpace: "nowrap" }}>{t("admin.col.kind")}</th>
                <th style={{ padding: "6px 8px", textAlign: "left", color: T.txD, fontWeight: 600, borderBottom: `1px solid ${T.bd}`, whiteSpace: "nowrap" }}>{t("admin.col.confidenceShort")}</th>
                <th style={{ padding: "6px 8px", textAlign: "left", color: T.txD, fontWeight: 600, borderBottom: `1px solid ${T.bd}` }}>{t("admin.books.matchedOrText")}</th>
                <th style={{ padding: "6px 8px", textAlign: "left", color: T.txD, fontWeight: 600, borderBottom: `1px solid ${T.bd}`, whiteSpace: "nowrap" }}>ISBN</th>
                <th style={{ padding: "6px 8px", textAlign: "left", color: T.txD, fontWeight: 600, borderBottom: `1px solid ${T.bd}`, whiteSpace: "nowrap" }}>{t("admin.col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const cs = confidenceStyle(r.confidence);
                const ss = statusStyle(r.status);
                const b = r.books;
                const busy = actionLoading[r.id];
                const btnStyle = (color, faded) => ({
                  padding: "2px 6px", borderRadius: 4, fontSize: 10, cursor: busy ? "wait" : "pointer",
                  border: `1px solid ${color}40`, background: faded ? "transparent" : `${color}10`,
                  color, fontWeight: 600, opacity: busy ? 0.5 : 1,
                });
                return (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${T.bd}` }}>
                    <td style={{ padding: "6px 8px", color: T.txH, fontFamily: "monospace", whiteSpace: "nowrap", verticalAlign: "top" }}>
                      {r.course_code}
                      <div style={{ fontSize: 10, color: T.txD }}>{r.syllabus_year}</div>
                    </td>
                    <td style={{ padding: "6px 8px", color: r.kind === "textbook" ? T.accent : T.txD, whiteSpace: "nowrap", verticalAlign: "top" }}>
                      {r.kind === "textbook" ? t("admin.tb.textbook") : t("admin.tb.reference")}
                    </td>
                    <td style={{ padding: "6px 8px", verticalAlign: "top", display: "flex", flexDirection: "column", gap: 3 }}>
                      <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: cs.bg, color: cs.color, fontWeight: 600, textAlign: "center" }}>{cs.label}</span>
                      {r.status && r.status !== "pending" && (
                        <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: ss.bg, color: ss.color, fontWeight: 600, textAlign: "center", whiteSpace: "nowrap" }}>{ss.label}</span>
                      )}
                    </td>
                    <td style={{ padding: "6px 8px", color: T.txH, verticalAlign: "top", maxWidth: 500 }}>
                      {b ? (
                        <div>
                          <div style={{ fontWeight: 600 }}>{b.title}</div>
                          <div style={{ fontSize: 11, color: T.txD }}>
                            {b.author && <>{b.author}　</>}
                            {b.publisher && <>{b.publisher}　</>}
                            {b.published_year && <>{b.published_year}</>}
                          </div>
                          <div style={{ fontSize: 10, color: T.txD, fontStyle: "italic", marginTop: 2, whiteSpace: "pre-wrap" }}>{r.raw_line}</div>
                        </div>
                      ) : (
                        <div style={{ whiteSpace: "pre-wrap" }}>
                          {r.raw_line}
                          {r.note && <div style={{ fontSize: 10, color: T.txD, marginTop: 2 }}>{r.note}</div>}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap", verticalAlign: "top", fontFamily: "monospace", fontSize: 11, color: T.txD }}>
                      {b?.isbn13 || ""}
                    </td>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap", verticalAlign: "top" }}>
                      <div style={{ display: "flex", gap: 3, flexDirection: "column" }}>
                        {b && (
                          <button disabled={busy} onClick={() => updateRowStatus(r.id, "confirmed")} style={btnStyle(T.green, r.status !== "confirmed")} title={t("admin.books.titleConfirm")}>✓ {t("admin.books.confirmed")}</button>
                        )}
                        {b && (
                          <button disabled={busy} onClick={() => updateRowStatus(r.id, "rejected")} style={btnStyle(T.red, r.status !== "rejected")} title={t("admin.books.titleReject")}>✗ {t("admin.books.rejected")}</button>
                        )}
                        <button disabled={busy} onClick={() => updateRowStatus(r.id, "not_a_book")} style={btnStyle(T.txD, r.status !== "not_a_book")} title={t("admin.books.titleNotABook")}>⊘ {t("admin.books.notABook")}</button>
                        <button disabled={busy} onClick={() => manualLinkIsbn(r.id)} style={btnStyle(T.accent, true)} title={t("admin.books.titleManualIsbn")}>🔍 ISBN</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ---- Exam Timetable Tab ----
const ExamTab = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterPeriod, setFilterPeriod] = useState("");
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [addMode, setAddMode] = useState(false);
  const [addForm, setAddForm] = useState({ date: "", day: "", period: "", code: "", name: "", instructor: "", room: "" });
  const [bulkText, setBulkText] = useState("");
  const [bulkMode, setBulkMode] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${API}/api/admin?action=exams`).then(r => r.json()).then(d => setData(d)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const exams = data?.exams || [];
  const total = data?.total || exams.length;

  const dates = [...new Set(exams.map(e => e.date).filter(Boolean))].sort();
  const periods = [...new Set(exams.map(e => e.period).filter(Boolean))].sort();

  const filtered = exams.filter(e => {
    if (filterDate && e.date !== filterDate) return false;
    if (filterPeriod && e.period !== filterPeriod) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!e.code?.toLowerCase().includes(s) && !e.name?.toLowerCase().includes(s) && !e.instructor?.toLowerCase().includes(s) && !e.room?.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const fmtDate = d => {
    if (!d) return "";
    const dt = new Date(d + "T00:00:00");
    const days = ["日", "月", "火", "水", "木", "金", "土"];
    return `${dt.getMonth() + 1}/${dt.getDate()}(${days[dt.getDay()]})`;
  };

  const saveEdit = async () => {
    if (!editId) return;
    try {
      await fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update_exam", id: editId, ...editForm }) });
      setEditId(null);
      load();
    } catch {}
  };

  const deleteExam = async (id) => {
    if (!confirm(t("admin.exam.confirmDelete"))) return;
    try {
      await fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete_exam", id }) });
      load();
    } catch {}
  };

  const addExam = async () => {
    if (!addForm.date || !addForm.code || !addForm.period) return;
    // auto-fill day from date
    const dt = new Date(addForm.date + "T00:00:00");
    const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
    const day = addForm.day || dayNames[dt.getDay()];
    try {
      await fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add_exam", ...addForm, day }) });
      setAddForm({ date: "", day: "", period: "", code: "", name: "", instructor: "", room: "" });
      setAddMode(false);
      load();
    } catch {}
  };

  const bulkImport = async () => {
    if (!bulkText.trim()) return;
    try {
      // Parse tab/comma separated lines: date, period, code, name, instructor, room
      const lines = bulkText.trim().split("\n").map(l => l.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(c => c.replace(/^"|"$/g, "").trim()));
      const entries = lines.filter(l => l.length >= 4).map(l => {
        const [date, period, code, name, instructor, room] = l;
        const dt = new Date(date + "T00:00:00");
        const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
        return { date, day: dayNames[dt.getDay()] || "", period, code: code.replace(/-\d+$/, ""), codeRaw: code, name: name || "", instructor: instructor || "", room: room || "" };
      });
      if (entries.length === 0) { alert(t("admin.exam.noValidLines")); return; }
      await fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "bulk_import_exams", entries }) });
      setBulkText("");
      setBulkMode(false);
      load();
    } catch {}
  };

  const inputSt = { padding: "6px 10px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 13, outline: "none" };
  const selectSt = { ...inputSt, cursor: "pointer" };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>{t("admin.exam.title")}</div>
        <div style={{ display: "flex", gap: 6 }}>
          <Btn onClick={() => { setAddMode(!addMode); setBulkMode(false); }} color={T.green} small>{I.plus} {t("admin.add")}</Btn>
          <Btn onClick={() => { setBulkMode(!bulkMode); setAddMode(false); }} color={T.accent} small>{I.upload} {t("admin.exam.bulkImport")}</Btn>
          <Btn onClick={load} color={T.txD} small>{I.reset} {t("admin.refresh")}</Btn>
        </div>
      </div>

      {/* 一括登録モード */}
      {bulkMode && (
        <div style={{ marginBottom: 16, padding: 14, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 8 }}>{t("admin.exam.bulkImportCsv")}</div>
          <div style={{ fontSize: 11, color: T.txD, marginBottom: 8 }}>{t("admin.exam.bulkFormat")}</div>
          <div style={{ fontSize: 11, color: T.txD, marginBottom: 8 }}>例: 2026-01-28, 1-2, CSC.T263, 関数型プログラミング基礎, 渡部 卓雄, M-278(H121)</div>
          <textarea value={bulkText} onChange={e => setBulkText(e.target.value)} rows={6} placeholder={t("admin.exam.pastePh")} style={{ ...inputSt, width: "100%", resize: "vertical", fontFamily: "monospace", fontSize: 12 }} />
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <Btn onClick={bulkImport} color={T.accent}>{t("admin.register")}</Btn>
            <Btn onClick={() => setBulkMode(false)} color={T.txD}>{t("common.cancel")}</Btn>
          </div>
        </div>
      )}

      {/* 個別追加モード */}
      {addMode && (
        <div style={{ marginBottom: 16, padding: 14, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 8 }}>{t("admin.exam.addExam")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            <input type="date" value={addForm.date} onChange={e => setAddForm(f => ({ ...f, date: e.target.value }))} style={{ ...inputSt, width: 150 }} />
            <select value={addForm.period} onChange={e => setAddForm(f => ({ ...f, period: e.target.value }))} style={selectSt}>
              <option value="">{t("admin.period")}</option>
              {["1-2", "3-4", "5-6", "7-8", "9-10", "1-4", "3-8", "5-8"].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <input value={addForm.code} onChange={e => setAddForm(f => ({ ...f, code: e.target.value }))} placeholder={t("admin.col.code")} style={{ ...inputSt, width: 130 }} />
            <input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder={t("admin.col.name")} style={{ ...inputSt, width: 200 }} />
            <input value={addForm.instructor} onChange={e => setAddForm(f => ({ ...f, instructor: e.target.value }))} placeholder={t("admin.col.teacher")} style={{ ...inputSt, width: 150 }} />
            <input value={addForm.room} onChange={e => setAddForm(f => ({ ...f, room: e.target.value }))} placeholder={t("admin.col.lectureRoom")} style={{ ...inputSt, width: 150 }} />
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Btn onClick={addExam} color={T.green}>{t("admin.add")}</Btn>
            <Btn onClick={() => setAddMode(false)} color={T.txD}>{t("common.cancel")}</Btn>
          </div>
        </div>
      )}

      {/* フィルター */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <SearchBar value={search} onChange={setSearch} onSearch={() => {}} placeholder={t("admin.exam.searchPh")} width={200} />
        <select value={filterDate} onChange={e => setFilterDate(e.target.value)} style={selectSt}>
          <option value="">{t("admin.exam.allDates")}</option>
          {dates.map(d => <option key={d} value={d}>{fmtDate(d)}</option>)}
        </select>
        <select value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)} style={selectSt}>
          <option value="">{t("admin.allPeriods")}</option>
          {periods.map(p => <option key={p} value={p}>{t("period.single", { n: p })}</option>)}
        </select>
        <span style={{ fontSize: 12, color: T.txD }}>{filtered.length} / {total} {t("admin.items")}</span>
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40, color: T.txD }}>{t("common.loading")}</div>}

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: T.txD }}>
          {exams.length === 0 ? t("admin.exam.emptyHint") : t("admin.exam.noMatch")}
        </div>
      )}

      {/* テーブル */}
      {!loading && filtered.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${T.bd}` }}>
                {["admin.col.date", "admin.period", "admin.col.code", "admin.col.name", "admin.col.teacher", "admin.col.lectureRoom", "admin.col.actions"].map(h => (
                  <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: T.txD, fontWeight: 600, fontSize: 11, whiteSpace: "nowrap" }}>{t(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => {
                const isEditing = editId === (e.id || i);
                return (
                  <tr key={e.id || i} style={{ borderBottom: `1px solid ${T.bd}`, background: isEditing ? `${T.accent}08` : "transparent" }}>
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap", color: T.txH }}>{fmtDate(e.date)}</td>
                    <td style={{ padding: "8px 10px", color: T.txH }}>{e.period}</td>
                    <td style={{ padding: "8px 10px" }}>
                      {isEditing
                        ? <input value={editForm.code || ""} onChange={ev => setEditForm(f => ({ ...f, code: ev.target.value }))} style={{ ...inputSt, width: 110 }} />
                        : <span style={{ fontWeight: 600, color: T.accent }}>{e.codeRaw || e.code}</span>}
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      {isEditing
                        ? <input value={editForm.name || ""} onChange={ev => setEditForm(f => ({ ...f, name: ev.target.value }))} style={{ ...inputSt, width: 180 }} />
                        : <span style={{ color: T.txH }}>{e.name}</span>}
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      {isEditing
                        ? <input value={editForm.instructor || ""} onChange={ev => setEditForm(f => ({ ...f, instructor: ev.target.value }))} style={{ ...inputSt, width: 120 }} />
                        : <span style={{ color: T.txD, fontSize: 12 }}>{e.instructor}</span>}
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      {isEditing
                        ? <input value={editForm.room || ""} onChange={ev => setEditForm(f => ({ ...f, room: ev.target.value }))} style={{ ...inputSt, width: 120 }} />
                        : <span style={{ color: T.txD, fontSize: 12 }}>{e.room}</span>}
                    </td>
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                      {isEditing ? (
                        <div style={{ display: "flex", gap: 4 }}>
                          <Btn onClick={saveEdit} color={T.green} small>{I.chk}</Btn>
                          <Btn onClick={() => setEditId(null)} color={T.txD} small>{I.x}</Btn>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 4 }}>
                          <Btn onClick={() => { setEditId(e.id || i); setEditForm({ code: e.codeRaw || e.code, name: e.name, instructor: e.instructor, room: e.room }); }} color={T.accent} small>{I.pen}</Btn>
                          <Btn onClick={() => deleteExam(e.id || i)} color={T.red} small>{I.trash}</Btn>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ---- User Analytics Tab ----
const CAMPUS_COLORS = { science_eng: "#6375f0", med_dental: "#e04e6a", unknown: "#888" };
const CAMPUS_LABEL_KEYS = { science_eng: "admin.campus.sciEng", med_dental: "admin.campus.medDental", unknown: "admin.unknown" };
const SCHOOL_COLORS = {
  science:"#6375f0", engineering:"#e5534b", matsci:"#3dae72",
  computing:"#a855c7", lifesci:"#2d9d8f", envsoc:"#d4843e",
  medicine:"#e04e6a", dentistry:"#4ea8e0",
};
const DEGREE_LABEL_KEYS = { B: "admin.degree.b", M: "admin.degree.m", D: "admin.degree.d", R: "admin.degree.r" };
const DEGREE_COLORS = { B: "#6375f0", M: "#e5534b", D: "#3dae72", R: "#d4843e" };

const HBar = ({ label, value, max, color, total }) => {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const ratio = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
      <div style={{ width: 140, fontSize: 12, color: T.txH, textAlign: "right", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={label}>{label}</div>
      <div style={{ flex: 1, height: 22, background: T.bg3, borderRadius: 6, overflow: "hidden", position: "relative" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color || T.accent, borderRadius: 6, transition: "width 0.3s" }} />
      </div>
      <div style={{ width: 80, fontSize: 12, color: T.txD, textAlign: "right", flexShrink: 0, fontFamily: "monospace" }}>{value} ({ratio}%)</div>
    </div>
  );
};

const UserAnalyticsTab = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("campus"); // campus | school | dept | grade

  useEffect(() => {
    fetch(`${API}/api/admin?action=user_analytics`)
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 20, color: T.txD, fontSize: 13 }}>{t("common.loading")}</div>;
  if (!data) return <div style={{ padding: 20, color: T.txD, fontSize: 13 }}>{t("admin.fetchDataFailed")}</div>;

  const viewBtns = [
    { id: "campus", label: t("admin.ua.campus") },
    { id: "school", label: t("admin.ua.school") },
    { id: "dept", label: t("admin.ua.dept") },
    { id: "grade", label: t("admin.ua.grade") },
  ];

  // school entries sorted by count
  const schoolEntries = Object.entries(data.bySchool || {}).sort((a, b) => b[1] - a[1]);
  const schoolMax = schoolEntries.length > 0 ? schoolEntries[0][1] : 1;

  // dept entries grouped by school
  const deptEntries = Object.entries(data.byDept || {}).sort((a, b) => b[1] - a[1]);
  const deptMax = deptEntries.length > 0 ? deptEntries[0][1] : 1;

  // Group depts by school for organized display
  const deptsBySchool = {};
  for (const [dk, count] of deptEntries) {
    const sk = data.deptToSchool?.[dk] || "unknown";
    if (!deptsBySchool[sk]) deptsBySchool[sk] = [];
    deptsBySchool[sk].push({ key: dk, name: data.deptNames?.[dk] || dk, count });
  }

  // year_group entries (e.g. "21B", "23M") sorted by year desc, then degree
  const ygEntries = Object.entries(data.byYearGroup || {}).sort((a, b) => {
    if (a[0] === "不明") return 1;
    if (b[0] === "不明") return -1;
    const ya = parseInt(a[0].slice(0, 2)) || 0, yb = parseInt(b[0].slice(0, 2)) || 0;
    if (ya !== yb) return ya - yb; // older year (senior) first
    const order = { B: 0, M: 1, D: 2, R: 3 };
    const da = a[0].match(/[BMDR]/i)?.[0]?.toUpperCase(), db = b[0].match(/[BMDR]/i)?.[0]?.toUpperCase();
    return (order[da] ?? 9) - (order[db] ?? 9);
  });
  const ygMax = ygEntries.length > 0 ? Math.max(...ygEntries.map(e => e[1])) : 1;

  const campusTotal = data.byCampus.science_eng + data.byCampus.med_dental + data.byCampus.unknown;

  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, marginBottom: 16 }}>{t("admin.ua.title")}</div>

      {/* Summary cards */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <Card label={t("admin.ua.totalUsers")} value={data.total} color={T.accent} />
        <Card label={t("admin.campus.sciEng")} value={data.byCampus.science_eng} color="#6375f0" />
        <Card label={t("admin.campus.medDental")} value={data.byCampus.med_dental} color="#e04e6a" />
        <Card label={t("admin.ua.affiliationUnknown")} value={data.byCampus.unknown} color={T.txD} />
      </div>

      {/* Coverage info */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <Card label={t("admin.ua.withDept")} value={data.withDept} color={T.green} />
        <Card label={t("admin.ua.withStudentId")} value={data.withStudentId} color={T.orange} />
      </div>

      {/* Degree type breakdown */}
      {data.byDegree && Object.keys(data.byDegree).length > 0 && (
        <div style={{ marginBottom: 20, padding: 16, borderRadius: 14, background: T.bg3, border: `1px solid ${T.bd}` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 10 }}>{t("admin.ua.byDegree")}</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {Object.entries(data.byDegree).sort((a, b) => b[1] - a[1]).map(([d, count]) => (
              <div key={d} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: DEGREE_COLORS[d] || T.txD }} />
                <span style={{ fontSize: 13, color: T.txH, fontWeight: 600 }}>{DEGREE_LABEL_KEYS[d] ? t(DEGREE_LABEL_KEYS[d]) : d}</span>
                <span style={{ fontSize: 13, color: T.txD }}>{t("admin.peopleCount", { n: count })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* View switcher */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {viewBtns.map(v => (
          <button key={v.id} onClick={() => setView(v.id)} style={{
            padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: view === v.id ? 600 : 400,
            border: `1px solid ${view === v.id ? T.accent : T.bd}`,
            background: view === v.id ? `${T.accent}18` : T.bg3,
            color: view === v.id ? T.accent : T.txD,
            cursor: "pointer",
          }}>{v.label}</button>
        ))}
      </div>

      {/* Campus view */}
      {view === "campus" && (
        <div style={{ padding: 16, borderRadius: 14, background: T.bg3, border: `1px solid ${T.bd}` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 14 }}>{t("admin.ua.byCampus")}</div>
          {/* Stacked bar */}
          <div style={{ height: 32, borderRadius: 8, overflow: "hidden", display: "flex", marginBottom: 14 }}>
            {campusTotal > 0 && ["science_eng", "med_dental", "unknown"].map(k => {
              const w = (data.byCampus[k] / campusTotal) * 100;
              if (w === 0) return null;
              return <div key={k} style={{ width: `${w}%`, background: CAMPUS_COLORS[k], height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {w > 8 && <span style={{ fontSize: 11, color: "#fff", fontWeight: 600 }}>{Math.round(w)}%</span>}
              </div>;
            })}
          </div>
          {["science_eng", "med_dental", "unknown"].map(k => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: CAMPUS_COLORS[k] }} />
              <span style={{ fontSize: 13, color: T.txH }}>{t(CAMPUS_LABEL_KEYS[k])}</span>
              <span style={{ fontSize: 13, color: T.txD, fontFamily: "monospace" }}>{t("admin.peopleCount", { n: data.byCampus[k] })} ({campusTotal > 0 ? ((data.byCampus[k] / campusTotal) * 100).toFixed(1) : 0}%)</span>
            </div>
          ))}
        </div>
      )}

      {/* School view */}
      {view === "school" && (
        <div style={{ padding: 16, borderRadius: 14, background: T.bg3, border: `1px solid ${T.bd}` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 14 }}>{t("admin.ua.bySchool")}</div>
          {schoolEntries.map(([sk, count]) => (
            <HBar key={sk} label={data.schoolNames?.[sk] || sk} value={count} max={schoolMax} total={data.total} color={SCHOOL_COLORS[sk] || T.accent} />
          ))}
          {schoolEntries.length === 0 && <div style={{ fontSize: 12, color: T.txD }}>{t("admin.noData")}</div>}
        </div>
      )}

      {/* Dept view */}
      {view === "dept" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {Object.entries(deptsBySchool).sort((a, b) => {
            const order = ["science","engineering","matsci","computing","lifesci","envsoc","medicine","dentistry","unknown"];
            return order.indexOf(a[0]) - order.indexOf(b[0]);
          }).map(([sk, depts]) => (
            <div key={sk} style={{ padding: 16, borderRadius: 14, background: T.bg3, border: `1px solid ${T.bd}` }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: SCHOOL_COLORS[sk] || T.txH, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: SCHOOL_COLORS[sk] || T.txD }} />
                {data.schoolNames?.[sk] || sk}
              </div>
              {depts.map(d => (
                <HBar key={d.key} label={d.name} value={d.count} max={deptMax} total={data.total} color={SCHOOL_COLORS[sk] || T.accent} />
              ))}
            </div>
          ))}
          {deptEntries.length === 0 && <div style={{ padding: 16, fontSize: 12, color: T.txD }}>{t("admin.ua.noDeptData")}</div>}
        </div>
      )}

      {/* Year group view */}
      {view === "grade" && (
        <div style={{ padding: 16, borderRadius: 14, background: T.bg3, border: `1px solid ${T.bd}` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 14 }}>{t("admin.ua.byGrade")}</div>
          {ygEntries.map(([yg, count]) => {
            const degree = yg.match(/[BMDR]/i)?.[0]?.toUpperCase();
            return <HBar key={yg} label={yg} value={count} max={ygMax} total={data.total} color={DEGREE_COLORS[degree] || T.txD} />;
          })}
          {ygEntries.length === 0 && <div style={{ fontSize: 12, color: T.txD }}>{t("admin.noData")}</div>}
        </div>
      )}
    </div>
  );
};

// ---- Guest Analytics Tab ----
const MODE_LABEL_KEYS = { freshman: "nav.freshman", navi: "nav.navigation", reg: "tool.reg" };
const MODE_COLORS = { freshman: "#4fc3f7", navi: "#81c784", reg: "#ffb74d" };

const GuestAnalyticsTab = () => {
  const [stats, setStats] = useState(null);
  const [trends, setTrends] = useState(null);
  const [trendsByMode, setTrendsByMode] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [sessTotal, setSessTotal] = useState(0);
  const [sessPage, setSessPage] = useState(0);
  const [modeFilter, setModeFilter] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/admin?action=guest_stats`).then(r => r.json()).then(setStats).catch(() => {});
    fetch(`${API}/api/admin?action=guest_trends`).then(r => r.json()).then(d => {
      setTrends(d.trends);
      setTrendsByMode(d.byMode);
    }).catch(() => {});
  }, []);

  const loadSessions = useCallback((p, mode) => {
    setLoading(true);
    let qs = `action=guest_sessions&page=${p}`;
    if (mode) qs += `&mode=${mode}`;
    fetch(`${API}/api/admin?${qs}`)
      .then(r => r.json())
      .then(d => { setSessions(d.sessions || []); setSessTotal(d.total || 0); setSessPage(d.page || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadSessions(0, modeFilter); }, [loadSessions, modeFilter]);

  // Conversion rate donut
  const DonutChart = ({ rate }) => {
    const pct = parseFloat(rate) || 0;
    const r = 36, c = 2 * Math.PI * r;
    const filled = c * pct / 100;
    return (
      <svg width="90" height="90" viewBox="0 0 90 90">
        <circle cx="45" cy="45" r={r} fill="none" stroke={T.bd} strokeWidth="8" />
        <circle cx="45" cy="45" r={r} fill="none" stroke={T.green} strokeWidth="8"
          strokeDasharray={`${filled} ${c - filled}`} strokeDashoffset={c / 4} strokeLinecap="round" />
        <text x="45" y="45" textAnchor="middle" dominantBaseline="central"
          fill={T.txH} fontSize="14" fontWeight="700">{pct}%</text>
      </svg>
    );
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, marginBottom: 16 }}>{t("admin.guest.overview")}</div>

      {/* Summary cards */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Card label={t("admin.guest.totalSessions")} value={stats?.total} color={T.accent} />
        <Card label={t("admin.guest.today")} value={stats?.today} color={T.green} />
        <Card label={t("admin.guest.last7d")} value={stats?.week} color={T.orange} />
        <Card label={t("admin.guest.last30d")} value={stats?.month} color="#c6a236" />
      </div>

      {/* Mode breakdown */}
      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, margin: "20px 0 12px" }}>{t("admin.guest.byMode")}</div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {Object.keys(MODE_LABEL_KEYS).map((mode) => (
          <div key={mode} style={{ flex: 1, minWidth: 140, padding: 16, borderRadius: 14, background: T.bg3, border: `1px solid ${T.bd}` }}>
            <div style={{ fontSize: 12, color: T.txD, marginBottom: 4 }}>{t(MODE_LABEL_KEYS[mode])}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: MODE_COLORS[mode] }}>{stats?.byMode?.[mode] ?? "..."}</div>
            <div style={{ fontSize: 11, color: T.txD, marginTop: 4 }}>{t("admin.guest.today")}: {stats?.todayByMode?.[mode] ?? "-"}</div>
          </div>
        ))}
      </div>

      {/* Conversion */}
      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, margin: "20px 0 12px" }}>{t("admin.guest.conversion")}</div>
      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ padding: 16, borderRadius: 14, background: T.bg3, border: `1px solid ${T.bd}`, display: "flex", alignItems: "center", gap: 16 }}>
          <DonutChart rate={stats?.conversionRate} />
          <div>
            <div style={{ fontSize: 13, color: T.txD }}>{t("admin.guest.loginTransitions")}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: T.green }}>{stats?.converted ?? "..."}</div>
            <div style={{ fontSize: 11, color: T.txD }}>{t("admin.guest.outOfSessions", { n: stats?.total ?? "..." })}</div>
          </div>
        </div>
      </div>

      {/* Trends chart */}
      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, margin: "24px 0 12px" }}>{t("admin.guest.trends30d")}</div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200, padding: 16, borderRadius: 14, background: T.bg3, border: `1px solid ${T.bd}` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 10 }}>{t("admin.guest.overallTrend")}</div>
          {trends ? <MiniChart data={trends} color={T.accent} /> : <div style={{ fontSize: 12, color: T.txD }}>{t("common.loading")}</div>}
        </div>
        {Object.keys(MODE_LABEL_KEYS).map((mode) => (
          <div key={mode} style={{ flex: 1, minWidth: 200, padding: 16, borderRadius: 14, background: T.bg3, border: `1px solid ${T.bd}` }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: MODE_COLORS[mode], marginBottom: 10 }}>{t(MODE_LABEL_KEYS[mode])}</div>
            {trendsByMode?.[mode] ? <MiniChart data={trendsByMode[mode]} color={MODE_COLORS[mode]} /> : <div style={{ fontSize: 12, color: T.txD }}>{t("common.loading")}</div>}
          </div>
        ))}
      </div>

      {/* Session list */}
      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, margin: "24px 0 12px" }}>{t("admin.guest.sessionList")}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: T.txD }}>{t("admin.countItems", { n: sessTotal })}</div>
        <div style={{ flex: 1 }} />
        <select value={modeFilter} onChange={e => setModeFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 13, outline: "none" }}>
          <option value="">{t("admin.guest.allModes")}</option>
          <option value="freshman">{t("nav.freshman")}</option>
          <option value="navi">{t("nav.navigation")}</option>
          <option value="reg">{t("tool.reg")}</option>
        </select>
      </div>
      {loading && <div style={{ color: T.txD, fontSize: 13 }}>{t("common.loading")}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {sessions.map(s => {
          const uaParsed = s.user_agent || "";
          const isMobile = /mobile|android|iphone/i.test(uaParsed);
          return (
            <div key={s.id} style={{ padding: 12, borderRadius: 10, background: T.bg3, border: `1px solid ${T.bd}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <Badge text={MODE_LABEL_KEYS[s.mode] ? t(MODE_LABEL_KEYS[s.mode]) : s.mode} color={MODE_COLORS[s.mode] || T.accent} />
              {s.converted && <Badge text="CV" color={T.green} />}
              <Badge text={isMobile ? "Mobile" : "Desktop"} color={T.txD} />
              <span style={{ fontSize: 12, color: T.txD, fontFamily: "monospace" }}>PV: {s.page_views || 1}</span>
              <span style={{ fontSize: 11, color: T.txD, marginLeft: "auto" }}>
                {s.created_at ? new Date(s.created_at).toLocaleString("ja-JP") : ""}
              </span>
              {s.referrer && <span style={{ fontSize: 10, color: T.txD, width: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={s.referrer}>Ref: {s.referrer}</span>}
            </div>
          );
        })}
      </div>
      <Pager page={sessPage} total={sessTotal} limit={50} onPage={p => loadSessions(p, modeFilter)} />
    </div>
  );
};

const SettingsTab = () => {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newId, setNewId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [tosNotice, setTosNotice] = useState("");
  const [ppNotice, setPpNotice] = useState("");
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const [maintenanceMsg, setMaintenanceMsg] = useState("");
  const [telecomRestricted, setTelecomRestricted] = useState(false);
  const [telecomMsg, setTelecomMsg] = useState("");
  const [featureFlags, setFeatureFlags] = useState({});
  const [regLimitEnabled, setRegLimitEnabled] = useState(false);
  const [regLimitMax, setRegLimitMax] = useState("");
  const [regLimitMsg, setRegLimitMsg] = useState("");
  const [bulkField, setBulkField] = useState("dept");
  const [bulkOld, setBulkOld] = useState("");
  const [bulkNew, setBulkNew] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);

  const loadAdmins = useCallback(() => {
    setLoading(true);
    fetch(`${API}/api/admin?action=admins`).then(r => r.json()).then(d => setAdmins(d.admins || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadAdmins();
    fetch(`${API}/api/admin?action=site_settings`).then(r => r.json()).then(d => {
      setTosNotice(d.settings?.tos_notice?.text || "");
      setPpNotice(d.settings?.pp_notice?.text || "");
      const mm = d.settings?.maintenance_mode || {};
      setMaintenanceEnabled(!!mm.enabled);
      setMaintenanceMsg(mm.message || "");
      const tr = d.settings?.telecom_restriction || {};
      setTelecomRestricted(!!tr.enabled);
      setTelecomMsg(tr.message || "");
      setFeatureFlags(d.settings?.feature_flags || {});
      const rl = d.settings?.registration_limit || {};
      setRegLimitEnabled(!!rl.enabled);
      setRegLimitMax(rl.maxUsers || "");
      setRegLimitMsg(rl.message || "");
      setSettingsLoaded(true);
    }).catch(() => setSettingsLoaded(true));
  }, [loadAdmins]);

  const handleAdd = async () => {
    const id = parseInt(newId);
    if (!id) { setError(t("admin.settings.validMoodleId")); return; }
    setSaving(true); setError("");
    try {
      const r = await fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add_admin", moodleUserId: id }) });
      const d = await r.json();
      if (!r.ok) { setError(d.error || t("admin.addFailed")); return; }
      setNewId(""); loadAdmins();
    } catch { setError(t("admin.commError")); }
    finally { setSaving(false); }
  };

  const handleRemove = async (moodleId) => {
    if (!confirm(t("admin.settings.confirmRemoveAdmin"))) return;
    const r = await fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remove_admin", moodleUserId: moodleId }) });
    const d = await r.json();
    if (!r.ok) { alert(d.error || t("admin.deleteFailed")); return; }
    loadAdmins();
  };

  const handleToggleMaintenance = async () => {
    const next = !maintenanceEnabled;
    const r = await fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "toggle_maintenance", enabled: next, message: maintenanceMsg }) });
    if (r.ok) setMaintenanceEnabled(next);
  };

  const handleToggleTelecom = async () => {
    const next = !telecomRestricted;
    const r = await fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "toggle_telecom_restriction", enabled: next, message: telecomMsg }) });
    if (r.ok) setTelecomRestricted(next);
  };

  const handleToggleRegLimit = async () => {
    const next = !regLimitEnabled;
    const r = await fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "toggle_registration_limit", enabled: next, maxUsers: parseInt(regLimitMax) || 0, message: regLimitMsg }) });
    if (r.ok) setRegLimitEnabled(next);
  };

  const handleSaveRegLimit = async () => {
    const r = await fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "toggle_registration_limit", enabled: regLimitEnabled, maxUsers: parseInt(regLimitMax) || 0, message: regLimitMsg }) });
    if (r.ok) alert(t("admin.saved"));
  };

  const handleToggleFeature = async (feature) => {
    const next = !featureFlags[feature];
    const r = await fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "toggle_feature", feature, enabled: next }) });
    if (r.ok) setFeatureFlags(prev => ({ ...prev, [feature]: next }));
  };

  const handleBulkUpdate = async () => {
    if (!bulkNew.trim()) return;
    if (!confirm(t("admin.bulk.confirm", { old: bulkOld || t("admin.bulk.allParen"), new: bulkNew }))) return;
    setBulkSaving(true);
    const r = await fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "bulk_update_profiles", field: bulkField, oldValue: bulkOld || null, newValue: bulkNew }) });
    const d = await r.json();
    setBulkSaving(false);
    if (r.ok) alert(t("admin.bulk.done", { n: d.count || 0 })); else alert(d.error || t("admin.updateFailed"));
  };

  return (
    <div style={{ padding: 16, maxWidth: 700 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, marginBottom: 16 }}>{t("admin.settings.title")}</div>
      <div style={{ padding: 16, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}`, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 10 }}>{t("admin.settings.addAdmin")}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input value={newId} onChange={e => setNewId(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleAdd(); }} placeholder={t("admin.settings.moodleUserId")} style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, outline: "none", fontFamily: "monospace" }} />
          <button onClick={handleAdd} disabled={saving || !newId.trim()} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: T.accent, color: "#fff", fontSize: 13, fontWeight: 600, cursor: saving ? "default" : "pointer", opacity: saving || !newId.trim() ? 0.5 : 1 }}>{saving ? t("admin.adding") : t("admin.add")}</button>
        </div>
        {error && <div style={{ fontSize: 12, color: T.red, marginTop: 8 }}>{error}</div>}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 10 }}>{t("admin.settings.adminList")}</div>
      {loading && <div style={{ color: T.txD, fontSize: 13 }}>{t("common.loading")}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {admins.map(a => (
          <div key={a.moodleId} style={{ display: "flex", alignItems: "center", gap: 10, padding: 12, borderRadius: 10, background: T.bg3, border: `1px solid ${T.bd}` }}>
            <Av u={{ name: a.name, col: a.color, avatar: a.avatar }} sz={32} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.txH }}>{a.name || t("admin.unknown")}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                <span style={{ fontSize: 11, color: T.txD, fontFamily: "monospace" }}>ID: {a.moodleId}</span>
                <Badge text={a.source === "env" ? t("admin.settings.envVar") : "DB"} color={a.source === "env" ? T.orange : T.accent} />
              </div>
            </div>
            {a.source === "db" ? <Btn onClick={() => handleRemove(a.moodleId)} color={T.red} small>{I.trash} {t("common.delete")}</Btn> : <span style={{ fontSize: 11, color: T.txD }}>{t("admin.settings.cannotDelete")}</span>}
          </div>
        ))}
      </div>

      {/* Registration limit (新規登録人数制限) */}
      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, margin: "24px 0 12px" }}>{t("admin.regLimit.title")}</div>
      <div style={{ fontSize: 12, color: T.txD, marginBottom: 12, lineHeight: 1.6 }}>
        {t("admin.regLimit.desc")}
      </div>
      {settingsLoaded && (
        <div style={{ padding: 14, borderRadius: 12, background: regLimitEnabled ? `${T.orange}12` : T.bg3, border: `1px solid ${regLimitEnabled ? T.orange + "40" : T.bd}`, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.txH }}>{t("admin.state")}:</span>
            <Badge text={regLimitEnabled ? t("admin.regLimit.limited") : t("admin.regLimit.unlimited")} color={regLimitEnabled ? T.orange : T.green} />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: T.txH, whiteSpace: "nowrap" }}>{t("admin.regLimit.maxUsers")}:</span>
            <input type="number" min="0" value={regLimitMax} onChange={e => setRegLimitMax(e.target.value)} placeholder={t("admin.regLimit.examplePh")} style={{ width: 120, padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, outline: "none", fontFamily: "monospace" }} />
            <span style={{ fontSize: 12, color: T.txD }}>{t("admin.regLimit.peopleZero")}</span>
          </div>
          <input value={regLimitMsg} onChange={e => setRegLimitMsg(e.target.value)} placeholder={t("admin.regLimit.msgPh")} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 10 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={handleToggleRegLimit} color={regLimitEnabled ? T.green : T.orange}>{regLimitEnabled ? t("admin.regLimit.lift") : t("admin.regLimit.enable")}</Btn>
            {regLimitEnabled && <Btn onClick={handleSaveRegLimit} color={T.accent}>{t("admin.saveSettings")}</Btn>}
          </div>
        </div>
      )}

      {/* Communication features kill switch (originally added for pre-registration period; kept as emergency toggle) */}
      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, margin: "24px 0 12px" }}>{t("admin.telecom.title")}</div>
      <div style={{ fontSize: 12, color: T.txD, marginBottom: 12, lineHeight: 1.6 }}>
        {t("admin.telecom.desc")}
      </div>
      {settingsLoaded && (
        <div style={{ padding: 14, borderRadius: 12, background: telecomRestricted ? `${T.orange}12` : T.bg3, border: `1px solid ${telecomRestricted ? T.orange + "40" : T.bd}`, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.txH }}>{t("admin.state")}:</span>
            <Badge text={telecomRestricted ? t("admin.telecom.restricted") : t("admin.telecom.allEnabled")} color={telecomRestricted ? T.orange : T.green} />
          </div>
          <div style={{ fontSize: 12, color: T.txD, marginBottom: 8 }}>{t("admin.telecom.scope")}</div>
          <input value={telecomMsg} onChange={e => setTelecomMsg(e.target.value)} placeholder={t("admin.telecom.msgPh")} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 10 }} />
          <Btn onClick={handleToggleTelecom} color={telecomRestricted ? T.green : T.orange}>{telecomRestricted ? t("admin.regLimit.lift") : t("admin.telecom.enable")}</Btn>
        </div>
      )}

      {/* Maintenance mode */}
      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, margin: "24px 0 12px" }}>{t("admin.maint.title")}</div>
      {settingsLoaded && (
        <div style={{ padding: 14, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}`, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.txH }}>{t("admin.state")}:</span>
            <Badge text={maintenanceEnabled ? t("admin.maint.inMaintenance") : t("admin.maint.normal")} color={maintenanceEnabled ? T.red : T.green} />
          </div>
          <input value={maintenanceMsg} onChange={e => setMaintenanceMsg(e.target.value)} placeholder={t("admin.maint.msgPh")} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 10 }} />
          <Btn onClick={handleToggleMaintenance} color={maintenanceEnabled ? T.green : T.red}>{maintenanceEnabled ? t("admin.maint.end") : t("admin.maint.start")}</Btn>
        </div>
      )}

      {/* Feature flags */}
      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, margin: "24px 0 12px" }}>{t("admin.flag.title")}</div>
      <div style={{ fontSize: 12, color: T.txD, marginBottom: 12 }}>{t("admin.flag.desc")}</div>
      {settingsLoaded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {FEATURE_FLAGS.map(f => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 10, background: T.bg3, border: `1px solid ${T.bd}` }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: T.txH, flex: 1 }}>{t(f.labelKey)}</span>
              <Badge text={featureFlags[f.id] === false ? t("admin.flag.disabled") : t("admin.flag.enabled")} color={featureFlags[f.id] === false ? T.red : T.green} />
              <button onClick={() => handleToggleFeature(f.id)} style={{ width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", position: "relative", background: featureFlags[f.id] === false ? T.bg4 : T.green, transition: "background .2s" }}>
                <div style={{ width: 18, height: 18, borderRadius: 9, background: "#fff", position: "absolute", top: 3, left: featureFlags[f.id] === false ? 3 : 23, transition: "left .2s" }} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Bulk update */}
      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, margin: "24px 0 12px" }}>{t("admin.bulk.title")}</div>
      <div style={{ fontSize: 12, color: T.txD, marginBottom: 12 }}>{t("admin.bulk.desc")}</div>
      <div style={{ padding: 14, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}`, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select value={bulkField} onChange={e => setBulkField(e.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, outline: "none" }}>
            <option value="dept">{t("admin.dept")} (dept)</option>
          </select>
          <input value={bulkOld} onChange={e => setBulkOld(e.target.value)} placeholder={t("admin.bulk.fromPh")} style={{ flex: 1, minWidth: 100, padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, outline: "none" }} />
          <span style={{ color: T.txD }}>→</span>
          <input value={bulkNew} onChange={e => setBulkNew(e.target.value)} placeholder={t("admin.bulk.toPh")} style={{ flex: 1, minWidth: 100, padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, outline: "none" }} />
          <Btn onClick={handleBulkUpdate} color={T.orange} disabled={bulkSaving || !bulkNew.trim()}>{bulkSaving ? t("admin.updating") : t("admin.bulk.btn")}</Btn>
        </div>
      </div>

      {/* ToS / Privacy */}
      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, margin: "24px 0 12px" }}>{t("admin.legal.title")}</div>
      <div style={{ fontSize: 12, color: T.txD, marginBottom: 12 }}>{t("admin.legal.desc")}</div>
      {settingsLoaded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ padding: 14, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}` }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 8 }}>{t("admin.legal.tosNotice")}</div>
            <textarea value={tosNotice} onChange={e => setTosNotice(e.target.value)} placeholder={t("admin.legal.tosPh")} rows={3} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box" }} />
          </div>
          <div style={{ padding: 14, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}` }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 8 }}>{t("admin.legal.ppNotice")}</div>
            <textarea value={ppNotice} onChange={e => setPpNotice(e.target.value)} placeholder={t("admin.legal.ppPh")} rows={3} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Btn onClick={async () => {
              setSettingsSaving(true);
              await Promise.all([
                fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update_site_setting", key: "tos_notice", value: { text: tosNotice, updatedAt: new Date().toISOString() } }) }),
                fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update_site_setting", key: "pp_notice", value: { text: ppNotice, updatedAt: new Date().toISOString() } }) }),
              ]);
              setSettingsSaving(false);
              alert(t("admin.saved"));
            }} color={T.accent} disabled={settingsSaving}>{settingsSaving ? t("admin.saving") : t("admin.legal.saveBtn")}</Btn>
          </div>
        </div>
      )}

      {/* NG Words */}
      <NgWordsSection />
    </div>
  );
};

// ---- Medical/Dental Syllabus Data Tab ----
const MedSyllabusTab = () => {
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterFac, setFilterFac] = useState("");
  const [filterSemester, setFilterSemester] = useState("");
  const [expandedCourse, setExpandedCourse] = useState(null);

  useEffect(() => { const tm = setTimeout(() => setDebouncedSearch(search), 400); return () => clearTimeout(tm); }, [search]);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${API}/api/admin`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get_med_sessions", faculty: filterFac || undefined, year: "2026", search: debouncedSearch || undefined }),
    }).then(r => r.json()).then(d => {
      setSessions(d.sessions || []);
      setStats({ total: d.totalSessions, courses: d.totalCourses, fac: d.facCounts || {} });
    }).catch(() => {}).finally(() => setLoading(false));
  }, [filterFac, debouncedSearch]);

  useEffect(() => { load(); }, [load]);

  // Group sessions by course (lct_cd)
  const courseGroups = useMemo(() => {
    const map = {};
    for (const s of sessions) {
      if (!map[s.lct_cd]) map[s.lct_cd] = { lctCd: s.lct_cd, name: s.name, faculty: s.faculty, semester: s.semester, credits: s.credits, instructor: s.instructor, sessions: [] };
      if (s.date) map[s.lct_cd].sessions.push(s);
    }
    return Object.values(map);
  }, [sessions]);

  const filtered = courseGroups.filter(c => {
    if (filterSemester && c.semester && !c.semester.includes(filterSemester)) return false;
    return true;
  });

  const semesters = [...new Set(courseGroups.map(c => c.semester).filter(Boolean))].sort();

  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, marginBottom: 16 }}>{t("admin.med.sessionData")}</div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <Card label={t("admin.guest.totalSessions")} value={stats.total || 0} color={T.accent} />
        <Card label={t("admin.med.courseCount")} value={stats.courses || 0} color={T.green} />
        <Card label={t("admin.med.dentistry")} value={stats.fac?.DEN || 0} color="#a855c7" />
        <Card label={t("admin.med.medicine")} value={stats.fac?.MED || 0} color="#3dae72" />
        <Card label={t("admin.med.liberalArts")} value={stats.fac?.LIB || 0} color="#d4843e" />
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("admin.med.searchPh")} style={{ padding: "6px 10px", borderRadius: 8, background: T.bg3, border: `1px solid ${T.bd}`, color: T.txH, fontSize: 13, width: 200 }} />
        <select value={filterFac} onChange={e => setFilterFac(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, background: T.bg3, border: `1px solid ${T.bd}`, color: T.txH, fontSize: 13 }}>
          <option value="">{t("admin.med.allFaculties")}</option>
          <option value="MED">{t("admin.med.medicine")}</option>
          <option value="DEN">{t("admin.med.dentistry")}</option>
          <option value="LIB">{t("admin.med.liberalArts")}</option>
        </select>
        <select value={filterSemester} onChange={e => setFilterSemester(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, background: T.bg3, border: `1px solid ${T.bd}`, color: T.txH, fontSize: 13 }}>
          <option value="">{t("admin.med.allSemesters")}</option>
          {semesters.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span style={{ fontSize: 12, color: T.txD }}>{t("admin.med.nCourses", { n: filtered.length })}</span>
      </div>

      {loading && <div style={{ color: T.txD, fontSize: 13, padding: 20 }}>{t("common.loading")}</div>}

      {!loading && filtered.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {filtered.slice(0, 100).map(c => {
            const isOpen = expandedCourse === c.lctCd;
            return (
              <div key={c.lctCd} style={{ borderRadius: 10, background: T.bg3, border: `1px solid ${T.bd}`, overflow: "hidden" }}>
                {/* Course header */}
                <div onClick={() => setExpandedCourse(isOpen ? null : c.lctCd)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", cursor: "pointer" }}>
                  <span style={{ fontSize: 11, fontFamily: "monospace", color: T.accent, minWidth: 60 }}>{c.lctCd}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.txH, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                  <span style={{ fontSize: 10, color: T.txD, padding: "1px 6px", borderRadius: 4, background: T.bg2 }}>{c.faculty}</span>
                  <span style={{ fontSize: 10, color: T.txD }}>{c.semester || "-"}</span>
                  <span style={{ fontSize: 10, color: T.txD }}>{c.credits ? t("admin.med.credits", { n: c.credits }) : ""}</span>
                  <span style={{ fontSize: 10, color: T.txD }}>{t("admin.med.sessions", { n: c.sessions.length })}</span>
                  <span style={{ fontSize: 12, color: T.txD }}>{isOpen ? "▲" : "▼"}</span>
                </div>

                {/* Sessions table */}
                {isOpen && c.sessions.length > 0 && (
                  <div style={{ borderTop: `1px solid ${T.bd}`, overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                      <thead>
                        <tr style={{ background: T.bg2 }}>
                          {["admin.med.colSeq", "admin.col.date", "admin.col.day", "admin.med.colTime", "admin.col.room", "admin.col.teacher"].map(h => (
                            <th key={h} style={{ padding: "4px 8px", textAlign: "left", color: T.txD, fontWeight: 600, borderBottom: `1px solid ${T.bd}`, whiteSpace: "nowrap" }}>{t(h)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {c.sessions.map((s, i) => (
                          <tr key={i} style={{ borderBottom: `1px solid ${T.bd}15` }}>
                            <td style={{ padding: "3px 8px", color: T.txD, fontFamily: "monospace" }}>{s.seq_no || "-"}</td>
                            <td style={{ padding: "3px 8px", color: T.txH }}>{s.date || "-"}</td>
                            <td style={{ padding: "3px 8px", color: T.txD }}>{s.day || "-"}</td>
                            <td style={{ padding: "3px 8px", color: T.txH, fontFamily: "monospace" }}>{s.time_start}～{s.time_end}</td>
                            <td style={{ padding: "3px 8px", color: T.txD, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.room || "-"}</td>
                            <td style={{ padding: "3px 8px", color: T.txD, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.session_instructor || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {isOpen && c.sessions.length === 0 && (
                  <div style={{ padding: "8px 12px", fontSize: 11, color: T.txD, borderTop: `1px solid ${T.bd}` }}>{t("admin.med.noSchedule")}</div>
                )}
              </div>
            );
          })}
          {filtered.length > 100 && <div style={{ fontSize: 11, color: T.txD, padding: 8 }}>{t("admin.med.moreNCourses", { n: filtered.length - 100 })}</div>}
        </div>
      )}

      {!loading && filtered.length === 0 && <div style={{ color: T.txD, fontSize: 13, padding: 20 }}>{t("admin.med.emptyHint")}</div>}
    </div>
  );
};

// ---- Medical/Dental Syllabus Fetch Tab ----
const MedSyllabusFetchTab = () => {
  const [faculties, setFaculties] = useState([]);
  const [years, setYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scrapeYear, setScrapeYear] = useState("");
  const [selectedFacs, setSelectedFacs] = useState(new Set());
  const [scraping, setScraping] = useState("");
  const [queue, setQueue] = useState([]);
  const [batchResults, setBatchResults] = useState([]);
  const [progress, setProgress] = useState(null);
  const [stats, setStats] = useState({});

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "med_faculty_list" }) }).then(r => r.json()),
      fetch(`${API}/api/admin?action=syllabus`).then(r => r.json()),
    ]).then(([facData, syllData]) => {
      setFaculties(facData.faculties || []);
      setYears(facData.years || []);
      // Extract med stats from syllabus stats
      const medDepts = new Set((facData.faculties || []).map(f => f.key));
      const medStats = {};
      for (const [k, v] of Object.entries(syllData.stats || {})) {
        if (medDepts.has(v.dept)) medStats[k] = v;
      }
      setStats(medStats);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Poll progress
  useEffect(() => {
    if (!scraping) { setProgress(null); return; }
    const id = setInterval(async () => {
      try {
        const r = await fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "med_scrape_progress", key: scraping }) });
        const d = await r.json();
        if (d.progress) setProgress(d.progress);
      } catch {}
    }, 1000);
    return () => clearInterval(id);
  }, [scraping]);

  const scrapeSingle = async (faculty, year) => {
    const key = `med_${faculty}_${year}`;
    setScraping(key);
    setProgress({ total: 0, done: 0, phase: "search", current: "" });
    try {
      const r = await fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "scrape_med_syllabus", faculty, year }) });
      const d = await r.json();
      if (r.ok) return { faculty, year, ok: true, count: d.added || 0 };
      return { faculty, year, ok: false, error: d.error || t("admin.unknownError") };
    } catch (e) {
      return { faculty, year, ok: false, error: e.message };
    } finally {
      setScraping("");
      setProgress(null);
    }
  };

  const handleBatchScrape = async (facList, year) => {
    setBatchResults([]);
    setQueue(facList.map(f => ({ faculty: f, year })));
    const results = [];
    for (const fac of facList) {
      setQueue(prev => prev.filter(q => q.faculty !== fac));
      const result = await scrapeSingle(fac, year);
      results.push(result);
      setBatchResults(prev => [...prev, result]);
    }
    load();
    const ok = results.filter(r => r.ok);
    const fail = results.filter(r => !r.ok);
    let msg = t("admin.medFetch.batchDone", { ok: ok.length, total: results.length });
    if (ok.length > 0) msg += "\n" + t("admin.fetch.totalCount", { n: ok.reduce((s, r) => s + r.count, 0) });
    if (fail.length > 0) msg += "\n\n" + t("admin.fetch.failed", { list: fail.map(r => `${r.faculty} (${r.error})`).join(", ") });
    alert(msg);
  };

  const handleScrape = async (faculty, year) => {
    setBatchResults([]);
    const result = await scrapeSingle(faculty, year);
    setBatchResults([result]);
    load();
    if (result.ok) alert(t("admin.medFetch.singleDone", { faculty, year, n: result.count }));
    else alert(t("admin.fetch.fetchFailed", { error: result.error }));
  };

  const isBusy = !!scraping || queue.length > 0;

  const bySchool = {};
  for (const f of faculties) {
    if (!bySchool[f.school]) bySchool[f.school] = [];
    bySchool[f.school].push(f);
  }

  const toggleFac = (key) => setSelectedFacs(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const selectAll = () => { if (selectedFacs.size === faculties.length) setSelectedFacs(new Set()); else setSelectedFacs(new Set(faculties.map(f => f.key))); };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, marginBottom: 16 }}>{t("admin.tab.medFetch")}</div>

      {loading && <div style={{ color: T.txD, fontSize: 13, padding: 20 }}>{t("common.loading")}</div>}

      {!loading && (
        <>
          {/* Scrape controls */}
          <div style={{ padding: 16, borderRadius: 14, background: T.bg3, border: `1px solid ${T.bd}`, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.txH, marginBottom: 12 }}>{t("admin.medFetch.fromSyllabus")}</div>
            <div style={{ fontSize: 11, color: T.txD, marginBottom: 12, lineHeight: 1.6 }}>
              {t("admin.medFetch.descLine1")}<br />
              {t("admin.medFetch.descLine2")}
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
              <select value={scrapeYear} onChange={e => setScrapeYear(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, background: T.bg2, border: `1px solid ${T.bd}`, color: T.txH, fontSize: 13 }}>
                <option value="">{t("admin.selectYear")}</option>
                {years.map(y => <option key={y} value={y}>{t("admin.yearLabel", { y })}</option>)}
              </select>
              <Btn onClick={selectAll} color={T.txD} small>
                {selectedFacs.size === faculties.length ? t("admin.deselectAll") : t("admin.selectAll")}
              </Btn>
              <Btn onClick={() => handleBatchScrape([...selectedFacs], scrapeYear)} color={T.green} disabled={!scrapeYear || selectedFacs.size === 0 || isBusy}>
                {isBusy ? t("admin.fetching") : t("admin.medFetch.fetchSelectedFacs", { n: selectedFacs.size })}
              </Btn>
            </div>

            {/* Faculty chips */}
            {Object.entries(bySchool).map(([school, facs]) => (
              <div key={school} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.txD, marginBottom: 4 }}>{school}</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {facs.map(f => {
                    const sel = selectedFacs.has(f.key);
                    const done = batchResults.find(r => r.faculty === f.key);
                    return (
                      <button key={f.key} onClick={() => toggleFac(f.key)} disabled={isBusy} style={{
                        padding: "3px 8px", borderRadius: 6, fontSize: 11, cursor: isBusy ? "default" : "pointer",
                        border: `1px solid ${done ? (done.ok ? T.green : T.red) : sel ? T.accent : T.bd}`,
                        background: done ? (done.ok ? `${T.green}15` : `${T.red}15`) : sel ? `${T.accent}15` : T.bg2,
                        color: done ? (done.ok ? T.green : T.red) : sel ? T.accent : T.txD,
                        fontWeight: sel ? 600 : 400,
                      }}>
                        {f.key} {f.label}
                        {done && done.ok && <span style={{ marginLeft: 3 }}>{done.count}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Progress */}
            {scraping && progress && (
              <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: T.bg2, border: `1px solid ${T.accent}40` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.txH }}>
                    {scraping.replace(/med_/, "").replace("_", " ")} — {progress.phase === "search" ? t("admin.medFetch.phaseSearch") : progress.phase === "saving" ? t("admin.fetch.phaseSaving") : t("admin.fetch.phaseDetail", { done: progress.done, total: progress.total })}
                    {queue.length > 0 && <span style={{ color: T.txD, fontWeight: 400 }}> {t("admin.medFetch.remaining", { n: queue.length })}</span>}
                  </span>
                </div>
                {progress.total > 0 && (
                  <div style={{ height: 6, borderRadius: 3, background: T.bd, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 3, background: T.accent, width: `${Math.round((progress.done / progress.total) * 100)}%`, transition: "width 0.3s" }} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Status table */}
          {faculties.length > 0 && (
            <div style={{ padding: 16, borderRadius: 14, background: T.bg3, border: `1px solid ${T.bd}` }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.txH, marginBottom: 12 }}>{t("admin.fetch.status")}</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr>
                    <th style={{ padding: "6px 8px", textAlign: "left", color: T.txD, fontWeight: 600, borderBottom: `1px solid ${T.bd}` }}>{t("admin.med.faculty")}</th>
                    {years.map(y => <th key={y} style={{ padding: "6px 8px", textAlign: "center", color: T.txD, fontWeight: 600, borderBottom: `1px solid ${T.bd}` }}>{y}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {faculties.map(f => (
                    <tr key={f.key} style={{ borderBottom: `1px solid ${T.bd}20` }}>
                      <td style={{ padding: "4px 8px", color: T.txH, fontWeight: 500 }}>{f.key} <span style={{ color: T.txD, fontWeight: 400 }}>{f.label}</span></td>
                      {years.map(y => {
                        const s = stats[`${f.key}_${y}`];
                        const isScraping = scraping === `med_${f.key}_${y}`;
                        return (
                          <td key={y} style={{ padding: "4px 8px", textAlign: "center" }}>
                            {s ? (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                                <span style={{ color: T.green, fontWeight: 600 }}>{s.count}</span>
                                <button onClick={() => handleScrape(f.key, y)} disabled={isBusy} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", padding: 0, fontSize: 10 }} title={t("admin.refetch")}>{isScraping ? "..." : "↻"}</button>
                              </span>
                            ) : (
                              <button onClick={() => handleScrape(f.key, y)} disabled={isBusy} style={{ background: "none", border: `1px solid ${T.bd}`, borderRadius: 6, padding: "2px 8px", color: T.txD, cursor: "pointer", fontSize: 10 }}>{isScraping ? "..." : t("admin.fetch.fetch")}</button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ---- Moodle Capture Tab (医歯学系データ確認) ----
const MoodleCaptureTab = () => {
  const [targets, setTargets] = useState([]);
  const [targetsLoaded, setTargetsLoaded] = useState(false);
  const [newId, setNewId] = useState("");
  const [captures, setCaptures] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const loadTargets = async () => {
    try {
      const r = await fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "get_capture_targets" }) });
      const d = await r.json();
      setTargets(d.user_ids || []);
    } catch {}
    setTargetsLoaded(true);
  };

  const loadCaptures = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "get_captured_moodle" }) });
      const d = await r.json();
      setCaptures(d.captures || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadTargets(); loadCaptures(); }, []);

  const saveTargets = async (ids) => {
    await fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "set_capture_targets", user_ids: ids }) });
    setTargets(ids);
  };

  const addTarget = () => {
    if (!targetsLoaded) return;
    const id = parseInt(newId);
    if (!id || targets.includes(id)) return;
    saveTargets([...targets, id]);
    setNewId("");
  };

  const removeTarget = (id) => { if (targetsLoaded) saveTargets(targets.filter(x => x !== id)); };

  const deleteCapture = async (id, all) => {
    if (all && !confirm(t("admin.moodle.confirmDeleteAll"))) return;
    await fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete_captured_moodle", ...(all ? { all: true } : { id }) }) });
    loadCaptures();
  };

  const inputStyle = { padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 13, outline: "none" };

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: T.txH }}>{t("admin.moodle.title")}</div>
      <div style={{ fontSize: 12, color: T.txD, lineHeight: 1.6 }}>
        {t("admin.moodle.descLine1")}<br />
        {t("admin.moodle.descLine2")}
      </div>

      {/* Target user IDs */}
      <div style={{ padding: 14, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}` }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 10 }}>{t("admin.moodle.targetIds")}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <input value={newId} onChange={e => setNewId(e.target.value)} placeholder="Moodle User ID" style={{ ...inputStyle, width: 160 }} onKeyDown={e => { if (e.key === "Enter") addTarget(); }} />
          <Btn onClick={addTarget} color={T.accent} disabled={!newId.trim()}>{t("admin.add")}</Btn>
        </div>
        {targets.length === 0 ? (
          <div style={{ fontSize: 12, color: T.txD }}>{t("admin.moodle.noTarget")}</div>
        ) : (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {targets.map(id => (
              <div key={id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 8, background: `${T.accent}15`, fontSize: 12, color: T.accent }}>
                <span style={{ fontFamily: "monospace" }}>{id}</span>
                <button onClick={() => removeTarget(id)} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>x</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Captured data */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.txH }}>{t("admin.moodle.capturedData", { n: captures.length })}</div>
        <div style={{ display: "flex", gap: 6 }}>
          <Btn onClick={loadCaptures} color={T.accent} small>{loading ? t("admin.loadingShort") : t("admin.refresh")}</Btn>
          {captures.length > 0 && <Btn onClick={() => deleteCapture(null, true)} color="#e5534b" small>{t("admin.moodle.deleteAll")}</Btn>}
        </div>
      </div>

      {captures.length === 0 ? (
        <div style={{ fontSize: 12, color: T.txD, padding: 20, textAlign: "center" }}>
          {t("admin.moodle.emptyHint")}
        </div>
      ) : captures.map(cap => (
        <div key={cap.id} style={{ padding: 14, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.txH }}>{cap.user_name || t("admin.unknown")}</span>
              <span style={{ fontSize: 11, color: T.txD, marginLeft: 8 }}>ID: {cap.moodle_user_id}</span>
              <span style={{ fontSize: 11, color: T.txD, marginLeft: 8 }}>{t("admin.med.nCourses", { n: cap.course_count })}</span>
              <span style={{ fontSize: 11, color: T.txD, marginLeft: 8 }}>{new Date(cap.captured_at).toLocaleString("ja-JP")}</span>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <Btn onClick={() => {
                const json = JSON.stringify(cap.raw_courses, null, 2);
                const blob = new Blob([json], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `moodle_${cap.moodle_user_id}_${new Date(cap.captured_at).toISOString().slice(0,10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }} color="#4CAF50" small>{t("admin.moodle.saveJson")}</Btn>
              <Btn onClick={() => setExpanded(expanded === cap.id ? null : cap.id)} color={T.accent} small>{expanded === cap.id ? t("common.close") : t("admin.detail")}</Btn>
              <Btn onClick={() => deleteCapture(cap.id)} color="#e5534b" small>{t("common.delete")}</Btn>
            </div>
          </div>

          {/* Summary: shortname list */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {(cap.raw_courses || []).slice(0, 10).map((c, i) => (
              <span key={i} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: T.bg2, color: T.txD, fontFamily: "monospace" }}>
                {c.shortname || c.idnumber || `id:${c.id}`}
              </span>
            ))}
            {(cap.raw_courses || []).length > 10 && <span style={{ fontSize: 11, color: T.txD }}>...+{cap.raw_courses.length - 10}</span>}
          </div>

          {/* Expanded: full data table */}
          {expanded === cap.id && (
            <div style={{ marginTop: 12, overflowX: "auto" }}>
              {/* All keys from first course as columns */}
              {(() => {
                const courses = cap.raw_courses || [];
                if (courses.length === 0) return <div style={{ fontSize: 12, color: T.txD }}>{t("admin.noData")}</div>;
                const allKeys = [...new Set(courses.flatMap(c => Object.keys(c)))];
                // Priority keys first, then rest
                const priority = ["id", "shortname", "idnumber", "fullname", "visible", "format"];
                const keys = [...priority.filter(k => allKeys.includes(k)), ...allKeys.filter(k => !priority.includes(k))];
                return (
                  <table style={{ width: "100%", fontSize: 10, borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {keys.map(h => (
                          <th key={h} style={{ padding: "4px 6px", textAlign: "left", borderBottom: `1px solid ${T.bd}`, color: T.txD, fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {courses.map((c, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${T.bd}20` }}>
                          {keys.map(k => {
                            const v = c[k];
                            const display = v === null || v === undefined ? "-" : typeof v === "object" ? JSON.stringify(v) : String(v);
                            const isCode = k === "shortname" || k === "idnumber";
                            return <td key={k} style={{ padding: "3px 6px", fontFamily: isCode ? "monospace" : "inherit", color: isCode ? T.accent : T.txH, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={display}>{display}</td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}

              {/* Raw JSON */}
              <details style={{ marginTop: 8 }}>
                <summary style={{ fontSize: 11, color: T.txD, cursor: "pointer" }}>Raw JSON</summary>
                <pre style={{ fontSize: 10, color: T.txD, background: T.bg2, padding: 10, borderRadius: 8, overflow: "auto", maxHeight: 400, marginTop: 6 }}>
                  {JSON.stringify(cap.raw_courses, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// ---- T2SCHOLA Explorer Tab ----
const T2ScholaTab = () => {
  const [siteInfo, setSiteInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [timetable, setTimetable] = useState(null);
  const [ttQuarter, setTtQuarter] = useState(1);

  const fetchSiteInfo = async (wstoken) => {
    const resp = await fetch(`${API}/api/admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "t2schola_call", wstoken, wsfunction: "core_webservice_get_site_info", params: {} }),
    });
    const d = await resp.json();
    if (d.error) throw new Error(d.error);
    return d.data;
  };

  const fetchTimetable = async (wstoken) => {
    const resp = await fetch(`${API}/api/data/timetable-past?t2token=${encodeURIComponent(wstoken)}&year=2024`);
    const d = await resp.json();
    if (d.error) throw new Error(d.error);
    return d;
  };

  const runAll = async () => {
    if (!password.trim()) return;
    setLoading(true); setError(""); setSiteInfo(null); setTimetable(null);
    try {
      const tokResp = await fetch(`${API}/api/admin`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "t2schola_get_token", password }),
      });
      const tokData = await tokResp.json();
      if (!tokData.ok || !tokData.token) {
        setError(tokData.error || tokData.errorcode || t("admin.t2.tokenFailed"));
        return;
      }
      setPassword("");
      const info = await fetchSiteInfo(tokData.token);
      setSiteInfo(info);
      const tt = await fetchTimetable(tokData.token);
      setTimetable(tt);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = { padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 13, outline: "none", fontFamily: "monospace" };

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: T.txH }}>{t("admin.t2.title")}</div>
      <div style={{ fontSize: 12, color: T.txD, lineHeight: 1.6 }}>
        {t("admin.t2.desc")}
      </div>

      {/* Single input: password → token → siteInfo → timetable */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="password" value={password} onChange={e => setPassword(e.target.value)}
          placeholder={t("admin.t2.passwordPh")}
          style={{ ...inputStyle, flex: 1, minWidth: 200 }}
          onKeyDown={e => { if (e.key === "Enter") runAll(); }}
        />
        <Btn onClick={runAll} color="#4CAF50" disabled={loading || !password.trim()}>
          {loading ? t("admin.fetching") : t("admin.t2.fetchBtn")}
        </Btn>
      </div>

      {/* Connection Status */}
      {siteInfo && (
        <div style={{ padding: 12, borderRadius: 10, background: `${T.accent}10`, border: `1px solid ${T.accent}30` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.accent }}>
            {t("admin.t2.connected")}: {siteInfo.fullname} (userid: {siteInfo.userid})
          </div>
          <div style={{ fontSize: 11, color: T.txD, marginTop: 4 }}>
            {siteInfo.sitename} — {siteInfo.siteurl}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: 10, borderRadius: 8, background: "#ff444420", border: "1px solid #ff444440", color: "#ff6666", fontSize: 12 }}>
          {error}
        </div>
      )}

      {/* Timetable */}
      {timetable && (
        <div style={{ padding: 14, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.txH, marginBottom: 12 }}>{t("admin.t2.ttTitle")}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: T.txD }}>
              {t("admin.t2.ttStats", { total: timetable.stats.total, withSchedule: timetable.stats.withSchedule, dbRows: timetable.stats.dbRows })}
            </div>
          </div>

          {/* Quarter selector */}
          <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
            {[1,2,3,4].map(q => (
              <button key={q} onClick={() => setTtQuarter(q)} style={{
                padding: "5px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                border: ttQuarter === q ? `1px solid ${T.accent}` : `1px solid ${T.bd}`,
                background: ttQuarter === q ? `${T.accent}15` : T.bg2,
                color: ttQuarter === q ? T.accent : T.txD,
              }}>{q}Q</button>
            ))}
          </div>

          {/* Timetable grid */}
          {(() => {
            const qd = timetable.qData[ttQuarter];
            if (!qd || !qd.TT) return <div style={{ fontSize: 12, color: T.txD }}>{t("admin.t2.noQuarterData")}</div>;
            const days = ["月", "火", "水", "木", "金"];
            const times = ["1-2\n8:50", "3-4\n10:45", "5-6\n13:20", "7-8\n15:15", "9-10\n17:10"];
            return (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse", tableLayout: "fixed" }}>
                  <thead>
                    <tr>
                      <th style={{ width: 44, padding: 4, color: T.txD, borderBottom: `1px solid ${T.bd}` }}></th>
                      {days.map(d => (
                        <th key={d} style={{ padding: 4, color: T.txD, fontWeight: 600, borderBottom: `1px solid ${T.bd}`, textAlign: "center" }}>{t("dow.s." + d)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {qd.TT.map((row, ri) => (
                      <tr key={ri}>
                        <td style={{ padding: 4, color: T.txD, fontSize: 9, whiteSpace: "pre-line", verticalAlign: "top", borderRight: `1px solid ${T.bd}` }}>{times[ri]}</td>
                        {row.map((cell, ci) => (
                          <td key={ci} style={{
                            padding: 3, verticalAlign: "top", border: `1px solid ${T.bd}`,
                            background: cell ? `${cell.col || T.accent}15` : "transparent",
                            minHeight: 48,
                          }}>
                            {cell && (
                              <div>
                                <div style={{ fontSize: 10, fontWeight: 600, color: cell.col || T.accent, lineHeight: 1.3 }}>{cell.name}</div>
                                {cell.room && <div style={{ fontSize: 9, color: T.txD, marginTop: 2 }}>{cell.room}</div>}
                              </div>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}

          {/* Course list for this quarter */}
          <div style={{ marginTop: 10, fontSize: 11, color: T.txD }}>
            {timetable.qData[ttQuarter]?.C?.map((c, i) => (
              <div key={i} style={{ padding: "3px 0", display: "flex", gap: 8 }}>
                <span style={{ color: c.col || T.accent, fontFamily: "monospace", minWidth: 80 }}>{c.code}</span>
                <span style={{ color: T.txH }}>{c.name}</span>
                <span style={{ color: T.txD }}>{c.per || t("admin.t2.timeUnknown")}</span>
                <span style={{ color: T.txD }}>{c.room || ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ---- Main AdminView ----
export const AdminView = ({ mob, courses = [], depts = [], schools = [] }) => {
  const [tab, setTab] = useState("stats");
  const [forbidden, setForbidden] = useState(false);
  const user = useCurrentUser();
  const { online } = usePresence("app", { id: user.moodleId || user.id, name: user.name, col: user.col });
  const onlineIds = useMemo(() => new Set(online.map(u => String(u.id))), [online]);

  useEffect(() => {
    fetch(`${API}/api/admin?action=stats`).then(r => { if (r.status === 403) setForbidden(true); }).catch(() => {});
  }, []);

  if (forbidden) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, gap: 12 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: T.bg3, border: `1px solid ${T.bd}`, display: "flex", alignItems: "center", justifyContent: "center" }}>{I.shield}</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.txH }}>{t("admin.forbidden.title")}</div>
        <div style={{ fontSize: 13, color: T.txD, textAlign: "center", lineHeight: 1.6 }}>{t("admin.forbidden.desc")}</div>
      </div>
    );
  }

  return (
    <OnlineContext.Provider value={onlineIds}>
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", borderBottom: `1px solid ${T.bd}`, background: T.bg2, flexShrink: 0, overflowX: "auto" }}>
        {tabs.map(tb => (
          <button key={tb.id} onClick={() => setTab(tb.id)} style={{
            display: "flex", alignItems: "center", gap: 6, padding: mob ? "10px 10px" : "10px 14px",
            border: "none", borderBottom: tab === tb.id ? `2px solid ${T.accent}` : "2px solid transparent",
            background: "transparent", color: tab === tb.id ? T.txH : T.txD,
            fontSize: 12, fontWeight: tab === tb.id ? 600 : 400, cursor: "pointer", whiteSpace: "nowrap",
          }}>
            <span style={{ display: "flex" }}>{tb.icon}</span>
            {!mob && <span>{t(tb.labelKey)}</span>}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: (tab === "map" || tab === "support") ? "hidden" : "auto", display: "flex", flexDirection: "column" }}>
        {tab === "stats" && <StatsTab />}
        {tab === "reports" && <ReportsTab />}
        {tab === "support" && <SupportTab />}
        {tab === "users" && <UsersTab />}
        {tab === "posts" && <PostsTab courses={courses} schools={schools} depts={depts} />}
        {tab === "comments" && <CommentsTab />}
        {tab === "messages" && <MessagesTab courses={courses} schools={schools} depts={depts} />}
        {tab === "dms" && <DMsTab />}
        {tab === "circles" && <CirclesTab />}
        {tab === "announce" && <AnnouncementsTab />}
        {tab === "music" && <MusicTab />}
        {tab === "audit" && <AuditLogTab />}
        {tab === "map" && <MapEditorView mob={mob} />}
        {tab === "syllabus" && <SyllabusTab />}
        {tab === "syllabus_fetch" && <SyllabusFetchTab />}
        {tab === "exams" && <ExamTab />}
        {tab === "t2schola" && <T2ScholaTab />}
        {tab === "user_analytics" && <UserAnalyticsTab />}
        {tab === "analytics" && <AnalyticsTab />}
        {tab === "guests" && <GuestAnalyticsTab />}
        {tab === "med_syllabus" && <MedSyllabusTab />}
        {tab === "med_fetch" && <MedSyllabusFetchTab />}
        {tab === "moodle_capture" && <MoodleCaptureTab />}
        {tab === "settings" && <SettingsTab />}
      </div>
    </div>
    </OnlineContext.Provider>
  );
};
