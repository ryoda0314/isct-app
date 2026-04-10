import React, { useState, useEffect, useCallback, useMemo, createContext, useContext } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { Av } from "../shared.jsx";
import { MapEditorView } from "./MapEditorView.jsx";
import { usePresence } from "../hooks/usePresence.js";
import { useCurrentUser } from "../hooks/useCurrentUser.js";

const OnlineContext = createContext(new Set());

const API = "";

const tabs = [
  { id: "stats", label: "ダッシュボード", icon: I.bar },
  { id: "reports", label: "通報", icon: I.flag },
  { id: "users", label: "ユーザー", icon: I.users },
  { id: "posts", label: "投稿", icon: I.feed },
  { id: "comments", label: "コメント", icon: I.chat },
  { id: "messages", label: "メッセージ", icon: I.chat },
  { id: "dms", label: "DM", icon: I.mail },
  { id: "circles", label: "サークル", icon: I.circle },
  { id: "announce", label: "お知らせ", icon: I.mega },
  { id: "audit", label: "操作ログ", icon: I.clock },
  { id: "map", label: "地図編集", icon: I.pin },
  { id: "syllabus", label: "時間割データ", icon: I.cal },
  { id: "syllabus_fetch", label: "時間割取得", icon: I.cal },
  { id: "exams", label: "期末試験", icon: I.clip },
  { id: "t2schola", label: "T2SCHOLA", icon: I.search },
  { id: "guests", label: "ゲスト分析", icon: I.eye },
  { id: "moodle_capture", label: "Moodle取得", icon: I.search },
  { id: "settings", label: "設定", icon: I.shield },
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
      <button disabled={page <= 0} onClick={() => onPage(page - 1)} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, cursor: page > 0 ? "pointer" : "default", opacity: page > 0 ? 1 : 0.4, fontSize: 13 }}>前へ</button>
      <span style={{ fontSize: 13, color: T.txD }}>{page + 1} / {pages}</span>
      <button disabled={page >= pages - 1} onClick={() => onPage(page + 1)} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, cursor: page < pages - 1 ? "pointer" : "default", opacity: page < pages - 1 ? 1 : 0.4, fontSize: 13 }}>次へ</button>
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

const SearchBar = ({ value, onChange, onSearch, placeholder = "検索...", width = 200 }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, background: T.bg3, border: `1px solid ${T.bd}`, width }}>
    <span style={{ color: T.txD, display: "flex" }}>{I.search}</span>
    <input value={value} onChange={e => onChange(e.target.value)} onKeyDown={e => { if (e.key === "Enter") onSearch(); }} placeholder={placeholder} style={{ flex: 1, border: "none", background: "transparent", color: T.txH, fontSize: 13, outline: "none" }} />
  </div>
);

// ---- Mini bar chart for trends ----
const MiniChart = ({ data, color, height = 60 }) => {
  const entries = Object.entries(data).sort((a, b) => a[0].localeCompare(b[0]));
  if (!entries.length) return <div style={{ fontSize: 12, color: T.txD }}>データなし</div>;
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
          <div style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>ユーザー詳細</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", display: "flex" }}>{I.x}</button>
        </div>
        {loading && <div style={{ color: T.txD, fontSize: 13 }}>読み込み中...</div>}
        {data && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, padding: 14, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}` }}>
              <Av u={{ name: data.profile?.name, col: data.profile?.color, avatar: data.profile?.avatar }} sz={48} />
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: T.txH }}>{data.profile?.name || "不明"}</div>
                <div style={{ fontSize: 12, color: T.txD, fontFamily: "monospace" }}>ID: {data.profile?.moodle_id} | 学科: {data.profile?.dept || "-"}</div>
                <div style={{ fontSize: 11, color: T.txD }}>
                  登録: {data.profile?.created_at ? new Date(data.profile.created_at).toLocaleDateString("ja-JP") : "-"}
                  {data.profile?.last_active_at && ` | 最終: ${new Date(data.profile.last_active_at).toLocaleString("ja-JP")}`}
                </div>
                {data.profile?.banned && <Badge text="BAN中" color={T.red} />}
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              <Card label="投稿数" value={data.postsTotal} color={T.accent} />
              <Card label="コメント数" value={data.commentsTotal} color={T.green} />
              <Card label="DM送信数" value={data.dmsSent} color={T.orange} />
              <Card label="通報した数" value={data.reportsMadeTotal} color={T.yellow} />
              <Card label="被通報数" value={data.reportsReceivedTotal} color={T.red} />
            </div>
            {data.posts.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 8 }}>最近の投稿</div>
                {data.posts.slice(0, 5).map(p => (
                  <div key={p.id} style={{ fontSize: 12, color: T.tx, padding: "6px 10px", borderRadius: 6, background: T.bg3, marginBottom: 4, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 60, overflow: "hidden" }}>
                    <span style={{ fontSize: 10, color: T.txD }}>[{p.type}] {new Date(p.created_at).toLocaleDateString("ja-JP")}</span> {p.text?.slice(0, 200)}
                  </div>
                ))}
              </div>
            )}
            {data.reportsReceived.length > 0 && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 8 }}>被通報履歴</div>
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
      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, marginBottom: 16 }}>概要</div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Card label="ユーザー数" value={stats?.users} color={T.accent} />
        <Card label="投稿数" value={stats?.posts} color={T.green} />
        <Card label="チャットメッセージ" value={stats?.messages} color={T.orange} />
        <Card label="DM" value={stats?.dms} color="#c6a236" />
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
        <Card label="未対応の通報" value={stats?.reportsPending} color={T.red} />
        <Card label="通報合計" value={stats?.reportsTotal} color={T.orange} />
        <Card label="BAN中ユーザー" value={stats?.bannedUsers} color={T.red} />
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, margin: "20px 0 12px" }}>アクティブユーザー</div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Card label="DAU (24h)" value={stats?.dau} color={T.green} />
        <Card label="WAU (7日)" value={stats?.wau} color={T.accent} />
        <Card label="MAU (30日)" value={stats?.mau} color={T.orange} />
        <Card label="サークル数" value={stats?.circles} color={T.accentSoft || T.accent} />
      </div>

      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, margin: "24px 0 12px" }}>トレンド</div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200, padding: 16, borderRadius: 14, background: T.bg3, border: `1px solid ${T.bd}` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 10 }}>通報推移 (30日)</div>
          {reportTrends ? <MiniChart data={reportTrends} color={T.red} /> : <div style={{ fontSize: 12, color: T.txD }}>読み込み中...</div>}
        </div>
        <div style={{ flex: 1, minWidth: 200, padding: 16, borderRadius: 14, background: T.bg3, border: `1px solid ${T.bd}` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 10 }}>新規登録推移 (90日)</div>
          {regStats ? <MiniChart data={regStats} color={T.green} /> : <div style={{ fontSize: 12, color: T.txD }}>読み込み中...</div>}
        </div>
      </div>

      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, margin: "24px 0 12px" }}>機能利用率 (直近7日)</div>
      {featureStats ? (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Card label="投稿" value={featureStats.week?.posts} color={T.accent} />
          <Card label="コメント" value={featureStats.week?.comments} color={T.green} />
          <Card label="チャット" value={featureStats.week?.messages} color={T.orange} />
          <Card label="DM" value={featureStats.week?.dms} color="#c6a236" />
          <Card label="サークルチャット" value={featureStats.week?.circleMessages} color={T.accentSoft || T.accent} />
        </div>
      ) : <div style={{ fontSize: 12, color: T.txD }}>読み込み中...</div>}
      {featureStats?.week?.postTypes && (
        <div style={{ marginTop: 12, padding: 14, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}` }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.txH, marginBottom: 8 }}>投稿タイプ別内訳 (7日)</div>
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
const REPORT_REASONS = { spam: "スパム", harassment: "嫌がらせ", inappropriate: "不適切", copyright: "著作権", other: "その他" };
const REPORT_STATUSES = { pending: "未対応", reviewed: "確認中", resolved: "対応済", dismissed: "却下" };
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
    const note = status === 'dismissed' ? prompt("却下理由（任意）:") : prompt("対応メモ（任意）:");
    const r = await fetch(`${API}/api/admin`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resolve_report", reportId: id, status, adminNote: note || "" }),
    });
    if (r.ok) load(page, filter);
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>通報管理 ({total})</div>
        <div style={{ flex: 1 }} />
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 13, outline: "none" }}>
          <option value="">すべて</option>
          <option value="pending">未対応</option>
          <option value="reviewed">確認中</option>
          <option value="resolved">対応済</option>
          <option value="dismissed">却下</option>
        </select>
      </div>
      {loading && <div style={{ color: T.txD, fontSize: 13 }}>読み込み中...</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {reports.map(r => (
          <div key={r.id} style={{ padding: 14, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <Badge text={REPORT_STATUSES[r.status] || r.status} color={REPORT_STATUS_COLORS[r.status] || T.txD} />
              <Badge text={REPORT_REASONS[r.reason] || r.reason} color={T.orange} />
              <Badge text={r.target_type} color={T.accent} />
              <span style={{ fontSize: 11, color: T.txD, marginLeft: "auto" }}>{r.created_at ? new Date(r.created_at).toLocaleString("ja-JP") : ""}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: T.txD }}>通報者:</span>
              <Av u={{ name: r.reporter?.name, col: r.reporter?.color, avatar: r.reporter?.avatar }} sz={20} />
              <span style={{ fontSize: 13, color: T.txH }}>{r.reporter?.name || "不明"}</span>
              {r.target_user && <>
                <span style={{ fontSize: 12, color: T.txD, marginLeft: 12 }}>対象:</span>
                <Av u={{ name: r.target_user?.name, col: r.target_user?.color, avatar: r.target_user?.avatar }} sz={20} />
                <span style={{ fontSize: 13, color: T.txH }}>{r.target_user?.name || "不明"}</span>
              </>}
            </div>
            {r.detail && <div style={{ fontSize: 13, color: T.tx, marginBottom: 8, padding: "8px 12px", borderRadius: 8, background: T.bg2, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{r.detail}</div>}
            {r.admin_note && <div style={{ fontSize: 12, color: T.txD, marginBottom: 8 }}>管理者メモ: {r.admin_note}</div>}
            <div style={{ fontSize: 11, color: T.txD, marginBottom: 8 }}>対象ID: {r.target_id}</div>
            {r.status === 'pending' && (
              <div style={{ display: "flex", gap: 8 }}>
                <Btn onClick={() => handleResolve(r.id, 'resolved')} color={T.green}>対応済みにする</Btn>
                <Btn onClick={() => handleResolve(r.id, 'dismissed')} color={T.txD}>却下</Btn>
              </div>
            )}
          </div>
        ))}
        {!loading && reports.length === 0 && <div style={{ padding: 32, textAlign: "center", color: T.txD, fontSize: 13 }}>通報がありません</div>}
      </div>
      <Pager page={page} total={total} limit={30} onPage={p => load(p, filter)} />
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
    const reason = prompt(`${name || "このユーザー"}をBANする理由を入力:`);
    if (reason === null) return;
    const r = await fetch(`${API}/api/admin`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ban_user", moodleUserId: userId, reason }),
    });
    if (r.ok) load(page, search, filter);
  };

  const handleEditName = async (userId, currentName) => {
    const newName = prompt("新しい表示名を入力:", currentName || "");
    if (!newName || newName === currentName) return;
    const r = await fetch(`${API}/api/admin`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "edit_profile", moodleUserId: userId, name: newName }),
    });
    if (r.ok) load(page, search, filter);
  };

  const handleUnban = async (userId) => {
    if (!confirm("このユーザーのBANを解除しますか？")) return;
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
        <div style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>ユーザー管理 ({total})</div>
        <div style={{ flex: 1 }} />
        <select value={filter} onChange={e => { setFilter(e.target.value); load(0, search, e.target.value); }} style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 13, outline: "none" }}>
          <option value="">すべて</option>
          <option value="online">オンラインのみ</option>
          <option value="offline">オフラインのみ</option>
          <option value="banned">BAN中のみ</option>
        </select>
        <SearchBar value={search} onChange={setSearch} onSearch={() => load(0, search, filter)} placeholder="名前で検索..." />
      </div>
      {loading && <div style={{ color: T.txD, fontSize: 13 }}>読み込み中...</div>}
      <div style={{ borderRadius: 12, border: `1px solid ${T.bd}`, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: T.bg3, borderBottom: `1px solid ${T.bd}` }}>
              <th style={{ padding: "10px 12px", textAlign: "center", color: T.txD, fontWeight: 600, width: 40 }}>状態</th>
              <th style={{ padding: "10px 12px", textAlign: "left", color: T.txD, fontWeight: 600 }}>ユーザー</th>
              <th style={{ padding: "10px 12px", textAlign: "left", color: T.txD, fontWeight: 600 }}>ID</th>
              <th style={{ padding: "10px 12px", textAlign: "left", color: T.txD, fontWeight: 600 }}>学科</th>
              <th style={{ padding: "10px 12px", textAlign: "left", color: T.txD, fontWeight: 600 }}>学年</th>
              <th style={{ padding: "10px 12px", textAlign: "left", color: T.txD, fontWeight: 600 }}>ISCT認証</th>
              <th style={{ padding: "10px 12px", textAlign: "left", color: T.txD, fontWeight: 600 }}>TiTech認証</th>
              <th style={{ padding: "10px 12px", textAlign: "left", color: T.txD, fontWeight: 600 }}>登録日</th>
              <th style={{ padding: "10px 12px", textAlign: "right", color: T.txD, fontWeight: 600 }}>操作</th>
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
                  <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: isOn ? T.green : T.txD, opacity: isOn ? 1 : 0.35 }} title={isOn ? "オンライン" : "オフライン"} />
                </td>
                <td style={{ padding: "8px 12px", color: T.txH }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Av u={{ name: u.name, col: u.color, avatar: u.avatar }} sz={28} />
                    <span style={{ fontWeight: 500, cursor: "pointer", textDecoration: "underline", textDecorationColor: `${T.accent}40` }} onClick={() => setDetailUser(u.moodle_id)}>{u.name || "不明"}</span>
                  </div>
                </td>
                <td style={{ padding: "8px 12px", color: T.txD, fontFamily: "monospace", fontSize: 12 }}>{u.moodle_id || u.moodle_user_id || u.id}</td>
                <td style={{ padding: "8px 12px", color: T.txD }}>{u.dept || "-"}</td>
                <td style={{ padding: "8px 12px", color: T.txD }}>{u.year_group || "-"}</td>
                <td style={{ padding: "8px 12px" }}>
                  {u.isct_verified ? <Badge text="認証済" color={T.green} /> : <Badge text="未認証" color={T.txD} />}
                </td>
                <td style={{ padding: "8px 12px" }}>
                  {u.portal_verified ? <Badge text="認証済" color={T.green} /> : <Badge text="未認証" color={T.txD} />}
                </td>
                <td style={{ padding: "8px 12px", color: T.txD, fontSize: 12 }}>{u.created_at ? new Date(u.created_at).toLocaleDateString("ja-JP") : "-"}</td>
                <td style={{ padding: "8px 12px", textAlign: "right" }}>
                  <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                    <Btn onClick={() => setDetailUser(u.moodle_id)} color={T.accent} small>{I.eye}</Btn>
                    <Btn onClick={() => handleEditName(u.moodle_id, u.name)} color={T.accent} small>{I.pen}</Btn>
                    {u.banned ? (
                      <Btn onClick={() => handleUnban(u.moodle_id)} color={T.green} small>BAN解除</Btn>
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
    <option value="">すべての部屋</option>
    {schools.length > 0 && <optgroup label="学院">{schools.map(s => <option key={s.prefix} value={`dept:${s.prefix}`}>{s.name}</option>)}</optgroup>}
    {depts.length > 0 && <optgroup label="学系">{depts.map(d => <option key={d.prefix} value={`dept:${d.prefix}`}>{d.prefix} {d.name}</option>)}</optgroup>}
    {courses.length > 0 && <optgroup label="コース">{courses.map(c => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}</optgroup>}
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
    if (!confirm("この投稿を削除しますか？")) return;
    const r = await fetch(`${API}/api/admin`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "post", id }) });
    if (r.ok) load(page, search, courseId);
  };
  const handleIdentify = async (postId) => {
    const r = await fetch(`${API}/api/admin?action=anon_author&post_id=${postId}`);
    if (!r.ok) { alert("取得に失敗しました"); return; }
    const d = await r.json();
    alert(`投稿者情報:\n名前: ${d.name || "不明"}\nMoodle ID: ${d.moodleUserId}\n匿名投稿: ${d.isAnon ? "はい" : "いいえ"}`);
  };

  const roomMap = Object.fromEntries([
    ...courses.map(c => [c.id, { code: c.code, col: c.col, name: c.name }]),
    ...depts.map(d => [`dept:${d.prefix}`, { code: d.prefix, col: d.col, name: d.name }]),
    ...schools.map(s => [`dept:${s.prefix}`, { code: s.name.slice(0, 3), col: s.col, name: s.name }]),
  ]);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>投稿管理 ({total})</div>
        <div style={{ flex: 1 }} />
        <RoomSelect courses={courses} schools={schools} depts={depts} value={courseId} onChange={handleCourse} />
        <SearchBar value={search} onChange={setSearch} onSearch={() => load(0, search, courseId)} />
      </div>
      {loading && <div style={{ color: T.txD, fontSize: 13 }}>読み込み中...</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {posts.map(p => { const cc = roomMap[p.course_id]; return (
          <div key={p.id} style={{ padding: 14, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Av u={{ name: p.profiles?.name, col: p.profiles?.color, avatar: p.profiles?.avatar }} sz={24} />
              <span style={{ fontSize: 13, fontWeight: 600, color: T.txH }}>{p.profiles?.name || "匿名"}</span>
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
              {p.type === "anon" && <Btn onClick={() => handleIdentify(p.id)} color={T.orange} small>{I.eye} 投稿者特定</Btn>}
              <Btn onClick={() => handleDelete(p.id)} color={T.red}>{I.trash} 削除</Btn>
            </div>
          </div>
        ); })}
        {!loading && posts.length === 0 && <div style={{ padding: 32, textAlign: "center", color: T.txD, fontSize: 13 }}>投稿がありません</div>}
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
    if (!confirm("このコメントを削除しますか？")) return;
    const r = await fetch(`${API}/api/admin`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "comment", id }) });
    if (r.ok) load(page, search);
  };
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>コメント管理 ({total})</div>
        <div style={{ flex: 1 }} />
        <SearchBar value={search} onChange={setSearch} onSearch={() => load(0, search)} />
      </div>
      {loading && <div style={{ color: T.txD, fontSize: 13 }}>読み込み中...</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {comments.map(c => (
          <div key={c.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 10, background: T.bg3, border: `1px solid ${T.bd}` }}>
            <Av u={{ name: c.profiles?.name, col: c.profiles?.color, avatar: c.profiles?.avatar }} sz={28} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.txH }}>{c.profiles?.name || "不明"}</span>
                <span style={{ fontSize: 11, color: T.txD }}>投稿#{c.post_id}</span>
                <span style={{ fontSize: 11, color: T.txD, marginLeft: "auto" }}>{c.created_at ? new Date(c.created_at).toLocaleString("ja-JP") : ""}</span>
              </div>
              <div style={{ fontSize: 13, color: T.tx, marginTop: 4, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 80, overflow: "hidden" }}>{c.text}</div>
              {c.posts?.text && <div style={{ fontSize: 11, color: T.txD, marginTop: 4, fontStyle: "italic", maxHeight: 40, overflow: "hidden" }}>元投稿: {c.posts.text.slice(0, 100)}</div>}
            </div>
            <Btn onClick={() => handleDelete(c.id)} color={T.red} small>{I.trash}</Btn>
          </div>
        ))}
        {!loading && comments.length === 0 && <div style={{ padding: 32, textAlign: "center", color: T.txD, fontSize: 13 }}>コメントがありません</div>}
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
    if (!confirm("このメッセージを削除しますか？")) return;
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
        <div style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>メッセージ管理 ({total})</div>
        <div style={{ flex: 1 }} />
        <RoomSelect courses={courses} schools={schools} depts={depts} value={courseId} onChange={handleCourse} />
        <SearchBar value={search} onChange={setSearch} onSearch={() => load(0, search, courseId)} />
      </div>
      {loading && <div style={{ color: T.txD, fontSize: 13 }}>読み込み中...</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {messages.map(m => { const cc = roomMap[m.course_id]; return (
          <div key={m.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 10, background: T.bg3, border: `1px solid ${T.bd}` }}>
            <Av u={{ name: m.profiles?.name, col: m.profiles?.color, avatar: m.profiles?.avatar }} sz={28} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.txH }}>{m.profiles?.name || "不明"}</span>
                <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 4, background: cc ? `${cc.col}18` : `${T.txD}18`, color: cc?.col || T.txD }}>{cc?.code || m.course_id}</span>
                <span style={{ fontSize: 11, color: T.txD, marginLeft: "auto" }}>{m.created_at ? new Date(m.created_at).toLocaleString("ja-JP") : ""}</span>
              </div>
              <div style={{ fontSize: 13, color: T.tx, marginTop: 4, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 80, overflow: "hidden" }}>{m.text}</div>
            </div>
            <Btn onClick={() => handleDelete(m.id)} color={T.red} small>{I.trash}</Btn>
          </div>
        ); })}
        {!loading && messages.length === 0 && <div style={{ padding: 32, textAlign: "center", color: T.txD, fontSize: 13 }}>メッセージがありません</div>}
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
    if (!confirm("このDMを削除しますか？")) return;
    const r = await fetch(`${API}/api/admin`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "dm", id }) });
    if (r.ok) load(page, search, userId);
  };
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>DM監視 ({total})</div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, background: T.bg3, border: `1px solid ${T.bd}`, width: 140 }}>
          <input value={userId} onChange={e => setUserId(e.target.value)} onKeyDown={e => { if (e.key === "Enter") load(0, search, userId); }} placeholder="ユーザーID" style={{ flex: 1, border: "none", background: "transparent", color: T.txH, fontSize: 12, outline: "none", fontFamily: "monospace" }} />
        </div>
        <SearchBar value={search} onChange={setSearch} onSearch={() => load(0, search, userId)} placeholder="テキスト検索..." />
      </div>
      {loading && <div style={{ color: T.txD, fontSize: 13 }}>読み込み中...</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {dms.map(m => (
          <div key={m.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 10, background: T.bg3, border: `1px solid ${T.bd}` }}>
            <Av u={{ name: m.profiles?.name, col: m.profiles?.color, avatar: m.profiles?.avatar }} sz={28} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.txH }}>{m.profiles?.name || "不明"}</span>
                <span style={{ fontSize: 11, color: T.txD, fontFamily: "monospace" }}>UID:{m.sender_id} | Conv:{m.conversation_id}</span>
                <span style={{ fontSize: 11, color: T.txD, marginLeft: "auto" }}>{m.created_at ? new Date(m.created_at).toLocaleString("ja-JP") : ""}</span>
              </div>
              <div style={{ fontSize: 13, color: T.tx, marginTop: 4, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 80, overflow: "hidden" }}>{m.text}</div>
            </div>
            <Btn onClick={() => handleDelete(m.id)} color={T.red} small>{I.trash}</Btn>
          </div>
        ))}
        {!loading && dms.length === 0 && <div style={{ padding: 32, textAlign: "center", color: T.txD, fontSize: 13 }}>DMがありません</div>}
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
    if (!confirm(`サークル「${name}」を削除しますか？メンバー・チャンネル・メッセージも全て削除されます。`)) return;
    const r = await fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete_circle", circleId: id }) });
    if (r.ok) load(page, search);
  };

  const handleTransferOwner = async (circleId) => {
    const newOwnerId = prompt("新しいオーナーのMoodle IDを入力:");
    if (!newOwnerId) return;
    const r = await fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "transfer_circle_owner", circleId, newOwnerId: parseInt(newOwnerId) }) });
    const d = await r.json();
    if (r.ok) { alert("オーナーを変更しました"); load(page, search); } else alert(d.error || "変更に失敗しました");
  };

  const handleDeleteCircleMessage = async (id) => {
    if (!confirm("このメッセージを削除しますか？")) return;
    const r = await fetch(`${API}/api/admin`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "circle_message", id }) });
    if (r.ok && viewMessages) loadCircleMessages(viewMessages, cmPage);
  };

  if (viewMessages) {
    const circle = circles.find(c => c.id === viewMessages);
    return (
      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <Btn onClick={() => setViewMessages(null)} color={T.txD}>{I.back} 戻る</Btn>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>サークルメッセージ: {circle?.name || viewMessages} ({cmTotal})</div>
        </div>
        {cmLoading && <div style={{ color: T.txD, fontSize: 13 }}>読み込み中...</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {circleMessages.map(m => (
            <div key={m.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 10, background: T.bg3, border: `1px solid ${T.bd}` }}>
              <Av u={{ name: m.profiles?.name, col: m.profiles?.color, avatar: m.profiles?.avatar }} sz={28} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.txH }}>{m.profiles?.name || "不明"}</span>
                  <Badge text={m.circle_channels?.name || "ch"} color={T.accent} />
                  <span style={{ fontSize: 11, color: T.txD, marginLeft: "auto" }}>{m.created_at ? new Date(m.created_at).toLocaleString("ja-JP") : ""}</span>
                </div>
                <div style={{ fontSize: 13, color: T.tx, marginTop: 4, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 80, overflow: "hidden" }}>{m.text}</div>
              </div>
              <Btn onClick={() => handleDeleteCircleMessage(m.id)} color={T.red} small>{I.trash}</Btn>
            </div>
          ))}
          {!cmLoading && circleMessages.length === 0 && <div style={{ padding: 32, textAlign: "center", color: T.txD, fontSize: 13 }}>メッセージがありません</div>}
        </div>
        <Pager page={cmPage} total={cmTotal} limit={50} onPage={p => loadCircleMessages(viewMessages, p)} />
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>サークル管理 ({total})</div>
        <div style={{ flex: 1 }} />
        <SearchBar value={search} onChange={setSearch} onSearch={() => load(0, search)} placeholder="サークル名で検索..." />
      </div>
      {loading && <div style={{ color: T.txD, fontSize: 13 }}>読み込み中...</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {circles.map(c => (
          <div key={c.id} style={{ padding: 14, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: c.color || T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{c.icon || "?"}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.txH }}>{c.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: T.txD, marginTop: 2 }}>
                  <span>{I.users} {c.member_count}人</span>
                  <Badge text={c.is_public ? "公開" : "非公開"} color={c.is_public ? T.green : T.txD} />
                  <Badge text={c.join_mode === "open" ? "自由参加" : c.join_mode === "approval" ? "承認制" : "招待のみ"} color={T.accent} />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
                {c.owner && <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: T.txD }}>
                  <Av u={{ name: c.owner?.name, col: c.owner?.color, avatar: c.owner?.avatar }} sz={18} />
                  {c.owner?.name}
                </div>}
                <Btn onClick={() => { setViewMessages(c.id); loadCircleMessages(c.id, 0); }} color={T.accent} small>{I.chat} MSG</Btn>
                <Btn onClick={() => handleTransferOwner(c.id)} color={T.orange} small>{I.users} 移譲</Btn>
                <Btn onClick={() => handleDelete(c.id, c.name)} color={T.red} small>{I.trash}</Btn>
              </div>
            </div>
            {c.description && <div style={{ fontSize: 12, color: T.txD, maxHeight: 40, overflow: "hidden" }}>{c.description}</div>}
            <div style={{ fontSize: 10, color: T.txD, marginTop: 4 }}>ID: {c.id} | 作成: {c.created_at ? new Date(c.created_at).toLocaleDateString("ja-JP") : "-"}</div>
          </div>
        ))}
        {!loading && circles.length === 0 && <div style={{ padding: 32, textAlign: "center", color: T.txD, fontSize: 13 }}>サークルがありません</div>}
      </div>
      <Pager page={page} total={total} limit={30} onPage={p => load(p, search)} />
    </div>
  );
};

// ---- Announcements Tab ----
const ANNOUNCE_TYPES = [
  { id: "info", label: "お知らせ", color: T.accent },
  { id: "maintenance", label: "メンテナンス", color: T.orange },
  { id: "update", label: "アップデート", color: T.green },
  { id: "urgent", label: "緊急", color: T.red },
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
    if (!confirm("このお知らせを削除しますか？")) return;
    await fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete_announcement", announcementId: id }) });
    load(page);
  };
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>お知らせ管理 ({total})</div>
        <div style={{ flex: 1 }} />
        <Btn onClick={() => setShowForm(!showForm)} color={T.accent}>{I.plus} 新規作成</Btn>
      </div>
      {showForm && (
        <div style={{ padding: 16, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}`, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="タイトル" style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, outline: "none" }} />
            <select value={type} onChange={e => setType(e.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, outline: "none" }}>
              {ANNOUNCE_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="本文..." rows={4} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
            <Btn onClick={() => setShowForm(false)} color={T.txD}>キャンセル</Btn>
            <Btn onClick={handleCreate} color={T.accent} disabled={saving || !title.trim() || !body.trim()}>{saving ? "送信中..." : "公開"}</Btn>
          </div>
        </div>
      )}
      {loading && <div style={{ color: T.txD, fontSize: 13 }}>読み込み中...</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map(a => { const typeInfo = ANNOUNCE_TYPES.find(t => t.id === a.type) || ANNOUNCE_TYPES[0]; return (
          <div key={a.id} style={{ padding: 14, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}`, opacity: a.active ? 1 : 0.5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Badge text={typeInfo.label} color={typeInfo.color} />
              {!a.active && <Badge text="非公開" color={T.txD} />}
              <span style={{ fontSize: 14, fontWeight: 600, color: T.txH }}>{a.title}</span>
              <span style={{ fontSize: 11, color: T.txD, marginLeft: "auto" }}>{a.created_at ? new Date(a.created_at).toLocaleString("ja-JP") : ""}</span>
            </div>
            <div style={{ fontSize: 13, color: T.tx, lineHeight: 1.6, marginBottom: 8, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{a.body}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn onClick={() => handleToggle(a.id, a.active)} color={a.active ? T.orange : T.green} small>{a.active ? "非公開にする" : "公開にする"}</Btn>
              <Btn onClick={() => handleDeleteAnnouncement(a.id)} color={T.red} small>{I.trash} 削除</Btn>
            </div>
          </div>
        ); })}
        {!loading && items.length === 0 && <div style={{ padding: 32, textAlign: "center", color: T.txD, fontSize: 13 }}>お知らせがありません</div>}
      </div>
      <Pager page={page} total={total} limit={30} onPage={load} />
    </div>
  );
};

// ---- Audit Log Tab ----
const ACTION_LABELS = {
  ban_user: "ユーザーBAN", unban_user: "BAN解除", delete_post: "投稿削除",
  delete_comment: "コメント削除", delete_message: "メッセージ削除", delete_dm: "DM削除",
  delete_circle_message: "サークルMSG削除",
  resolve_report: "通報対応", create_announcement: "お知らせ作成",
  update_announcement: "お知らせ更新", delete_announcement: "お知らせ削除",
  add_admin: "管理者追加", remove_admin: "管理者削除",
  edit_profile: "プロフィール変更", identify_anon: "匿名投稿者特定",
  delete_circle: "サークル削除", transfer_circle_owner: "オーナー移譲",
  update_site_setting: "設定変更",
  add_ng_word: "NGワード追加", delete_ng_word: "NGワード削除",
  enable_maintenance: "メンテON", disable_maintenance: "メンテOFF",
  enable_registration_limit: "登録制限ON", disable_registration_limit: "登録制限OFF",
  toggle_feature: "機能フラグ", bulk_update_profiles: "一括更新",
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
      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, marginBottom: 12 }}>管理者操作ログ ({total})</div>
      {loading && <div style={{ color: T.txD, fontSize: 13 }}>読み込み中...</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {logs.map(l => (
          <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 8, background: T.bg3, border: `1px solid ${T.bd}`, fontSize: 13 }}>
            <Av u={{ name: l.profiles?.name, col: l.profiles?.color, avatar: l.profiles?.avatar }} sz={22} />
            <span style={{ color: T.txH, fontWeight: 500 }}>{l.profiles?.name || "不明"}</span>
            <Badge text={ACTION_LABELS[l.action] || l.action} color={T.accent} />
            {l.target_type && <span style={{ fontSize: 11, color: T.txD }}>{l.target_type}#{l.target_id}</span>}
            {l.detail && typeof l.detail === 'object' && l.detail.reason && <span style={{ fontSize: 11, color: T.txD }}>理由: {l.detail.reason}</span>}
            <span style={{ fontSize: 11, color: T.txD, marginLeft: "auto" }}>{l.created_at ? new Date(l.created_at).toLocaleString("ja-JP") : ""}</span>
          </div>
        ))}
        {!loading && logs.length === 0 && <div style={{ padding: 32, textAlign: "center", color: T.txD, fontSize: 13 }}>ログがありません</div>}
      </div>
      <Pager page={page} total={total} limit={50} onPage={load} />
    </div>
  );
};

// ---- NG Words Section ----
const NG_MATCH_TYPES = [{ id: "contains", label: "部分一致" }, { id: "exact", label: "完全一致" }, { id: "regex", label: "正規表現" }];
const NG_ACTIONS = [{ id: "block", label: "ブロック" }, { id: "warn", label: "警告のみ" }];
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
    if (r.ok) { setWord(""); loadWords(); } else { const d = await r.json(); alert(d.error || "追加に失敗しました"); }
    setSaving(false);
  };
  const handleDelete = async (id) => {
    if (!confirm("このNGワードを削除しますか？")) return;
    await fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete_ng_word", wordId: id }) });
    loadWords();
  };
  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, margin: "24px 0 12px" }}>NGワード管理</div>
      <div style={{ fontSize: 12, color: T.txD, marginBottom: 12 }}>投稿・コメント・メッセージ・DMに含まれる禁止ワードを管理します。ブロック設定のワードは投稿が拒否されます。</div>
      <div style={{ padding: 14, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}`, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input value={word} onChange={e => setWord(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleAdd(); }} placeholder="NGワード" style={{ flex: 1, minWidth: 120, padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, outline: "none" }} />
          <select value={matchType} onChange={e => setMatchType(e.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 12, outline: "none" }}>
            {NG_MATCH_TYPES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <select value={wordAction} onChange={e => setWordAction(e.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 12, outline: "none" }}>
            {NG_ACTIONS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
          <select value={category} onChange={e => setCategory(e.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 12, outline: "none" }}>
            {NG_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <Btn onClick={handleAdd} color={T.accent} disabled={saving || !word.trim()}>{saving ? "追加中..." : "追加"}</Btn>
        </div>
      </div>
      {loading && <div style={{ color: T.txD, fontSize: 13 }}>読み込み中...</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {words.map(w => (
          <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: T.bg3, border: `1px solid ${T.bd}`, fontSize: 13 }}>
            <span style={{ fontWeight: 600, color: T.txH, fontFamily: "monospace" }}>{w.word}</span>
            <Badge text={NG_MATCH_TYPES.find(m => m.id === w.match_type)?.label || w.match_type} color={T.accent} />
            <Badge text={w.action === "block" ? "ブロック" : "警告"} color={w.action === "block" ? T.red : T.orange} />
            <Badge text={w.category || "general"} color={T.txD} />
            <span style={{ fontSize: 10, color: T.txD, marginLeft: "auto" }}>{w.created_at ? new Date(w.created_at).toLocaleDateString("ja-JP") : ""}</span>
            <Btn onClick={() => handleDelete(w.id)} color={T.red} small>{I.trash}</Btn>
          </div>
        ))}
        {!loading && words.length === 0 && <div style={{ padding: 16, textAlign: "center", color: T.txD, fontSize: 13 }}>NGワードが登録されていません</div>}
      </div>
    </div>
  );
};

// ---- Settings Tab ----
const FEATURE_FLAGS = [
  { id: "feed", label: "タイムライン" }, { id: "chat", label: "チャット" },
  { id: "dm", label: "DM" }, { id: "circles", label: "サークル" },
  { id: "map", label: "マップ" }, { id: "anonymous_posts", label: "匿名投稿" },
  { id: "polls", label: "投票" }, { id: "file_upload", label: "ファイルアップロード" },
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
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
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
        <div style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>時間割データ</div>
        {courses.length > 0 && (
          <Btn onClick={() => setViewMode(viewMode === "table" ? "grid" : "table")} color={T.accent} small>
            {viewMode === "table" ? "時間割表示" : "一覧表示"}
          </Btn>
        )}
      </div>

      {/* Stats */}
      {courses.length > 0 && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <Card label="総授業数" value={courses.length} color={T.accent} />
          {uniqueQuarters.map(q => (
            <Card key={q} label={q} value={quarterCounts[q] || 0} color={T.green} />
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <SearchBar value={search} onChange={setSearch} onSearch={() => {}} placeholder="科目コード・名前・教室..." width={240} />
        <select value={filterYear} onChange={e => setFilterYear(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, background: T.bg3, border: `1px solid ${T.bd}`, color: T.txH, fontSize: 13 }}>
          <option value="">全年度</option>
          {years.map(y => <option key={y} value={y}>{y}年度</option>)}
        </select>
        <select value={filterDept} onChange={e => setFilterDept(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, background: T.bg3, border: `1px solid ${T.bd}`, color: T.txH, fontSize: 13 }}>
          <option value="">全学科</option>
          {departments.map(d => (
            <option key={d.key} value={d.key}>{d.key} ({d.label})</option>
          ))}
        </select>
        <select value={filterQuarter} onChange={e => setFilterQuarter(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, background: T.bg3, border: `1px solid ${T.bd}`, color: T.txH, fontSize: 13 }}>
          <option value="">全クォーター</option>
          {["1", "2", "3", "4"].map(q => <option key={q} value={q}>{q}Q</option>)}
        </select>
        <select value={filterDay} onChange={e => setFilterDay(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, background: T.bg3, border: `1px solid ${T.bd}`, color: T.txH, fontSize: 13 }}>
          <option value="">全曜日</option>
          {DAY_LABELS.map(d => <option key={d} value={d}>{d}曜</option>)}
        </select>
        {(search || filterDept || filterQuarter || filterDay || filterYear) && (
          <span style={{ fontSize: 12, color: T.txD }}>{filtered.length}件</span>
        )}
      </div>

      {loading && <div style={{ color: T.txD, fontSize: 13, padding: 20 }}>読み込み中...</div>}

      {/* Grid View */}
      {!loading && courses.length > 0 && viewMode === "grid" && (() => {
        const grid = buildGrid();
        return (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ padding: "8px 4px", borderBottom: `1px solid ${T.bd}`, color: T.txD, fontWeight: 500, width: 60, textAlign: "left" }}>時限</th>
                  {DAY_LABELS.map(d => (
                    <th key={d} style={{ padding: "8px 4px", borderBottom: `1px solid ${T.bd}`, color: T.txH, fontWeight: 600, textAlign: "center", width: "19%" }}>{d}</th>
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
                {["科目コード", "科目名", "区分", "単位", "セクション", "教員", "学科", "年度", "曜日", "時限", "教室", "建物", "Q"].map(h => (
                  <th key={h} style={{ padding: "8px 6px", textAlign: "left", color: T.txD, fontWeight: 600, fontSize: 11, whiteSpace: "nowrap" }}>{h}</th>
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
              条件に一致する授業がありません
            </div>
          )}
        </div>
      )}

      {courses.length === 0 && !loading && (
        <div style={{ padding: 20, textAlign: "center", color: T.txD, fontSize: 13 }}>
          データがありません。「時間割取得」タブからスクレイピングしてください。
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
      <div style={{ fontSize: 14, fontWeight: 600, color: T.txH, marginBottom: 4 }}>必修/選択必修の登録</div>
      <div style={{ fontSize: 11, color: T.txD, marginBottom: 12 }}>学修案内から科目一覧をコピペしてください（◎=必修, ○=選択必修, 無印=選択）</div>

      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        <select value={year} onChange={e => setYear(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, background: T.bg2, border: `1px solid ${T.bd}`, color: T.txH, fontSize: 13 }}>
          {(years || ["2026"]).map(y => <option key={y} value={y}>{y}年度</option>)}
        </select>
        {detectedDepts.length > 0 && <span style={{ fontSize: 11, color: T.txD }}>検出: {detectedDepts.map(d => <Badge key={d} text={d} color={T.accent} />)}</span>}
      </div>

      <textarea value={text} onChange={e => setText(e.target.value)} placeholder={"MTH.A201.R ◎ 代数学概論第一 1-1-0 1 (a)\nMTH.A203.A ○ 代数学概論第三 1-1-0 1 (a)\nMTH.T201.L 解析力学（講義） 2-0-0 1 5 (b)"} rows={8}
        style={{ width: "100%", padding: 10, borderRadius: 10, background: T.bg2, border: `1px solid ${T.bd}`, color: T.txH, fontSize: 12, fontFamily: "monospace", resize: "vertical", boxSizing: "border-box" }} />

      {parsed.length > 0 && (
        <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: T.bg2, border: `1px solid ${T.bd}`, maxHeight: 200, overflowY: "auto" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.txD, marginBottom: 6 }}>プレビュー: {parsed.length} 科目</div>
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
          {submitting ? "更新中..." : `${parsed.length}科目の区分を更新`}
        </Btn>
      </div>

      {/* Result logs */}
      {result && (
        <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: T.bg2, border: `1px solid ${result.ok ? T.green : T.red}40` }}>
          {result.ok ? (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.txH, marginBottom: 6 }}>
                更新完了
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <Badge text={`パース ${result.parsed}`} color={T.accent} />
                <Badge text={`DB一致 ${result.matched}`} color={T.green} />
                {result.notFound > 0 && <Badge text={`未登録 ${result.notFound}`} color="#f59e0b" />}
                {result.errors > 0 && <Badge text={`エラー ${result.errors}`} color="#ef4444" />}
                <Badge text={`更新行数 ${result.updated}`} color={T.green} />
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
                        {l.status === 'ok' ? `${l.rows}行更新` : l.detail}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 12, color: T.red }}>{result.error || "エラー"}</div>
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

  // Process queue sequentially
  const scrapeSingle = async (dept, year) => {
    const key = `${dept}_${year}`;
    setScraping(key);
    setProgress({ total: 0, done: 0, phase: "listing", current: "" });
    try {
      const r = await fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "scrape_syllabus", dept, year }) });
      const text = await r.text();
      let d;
      try { d = JSON.parse(text); } catch {
        console.error(`[scrape] ${dept} status=${r.status} body=`, text.slice(0, 500));
        return { dept, year, ok: false, error: `HTTP ${r.status}: ${text.slice(0, 120)}` };
      }
      if (r.ok) return { dept, year, ok: true, count: d.added || 0 };
      return { dept, year, ok: false, error: d.error || "不明なエラー" };
    } catch (e) {
      console.error(`[scrape] ${dept} fetch error:`, e);
      return { dept, year, ok: false, error: e.message };
    } finally {
      setScraping("");
      setProgress(null);
    }
  };

  const handleBatchScrape = async (deptList, year) => {
    setBatchResults([]);
    setQueue(deptList.map(d => ({ dept: d, year })));
    const results = [];
    for (const dept of deptList) {
      setQueue(prev => prev.filter(q => q.dept !== dept));
      const result = await scrapeSingle(dept, year);
      results.push(result);
      setBatchResults(prev => [...prev, result]);
    }
    load();
    const ok = results.filter(r => r.ok);
    const fail = results.filter(r => !r.ok);
    let msg = `取得完了: ${ok.length}/${results.length} 学科成功`;
    if (ok.length > 0) msg += `\n合計 ${ok.reduce((s, r) => s + r.count, 0)} 件`;
    if (fail.length > 0) msg += `\n\n失敗: ${fail.map(r => `${r.dept} (${r.error})`).join(", ")}`;
    alert(msg);
  };

  const handleScrape = async (dept, year) => {
    setBatchResults([]);
    const result = await scrapeSingle(dept, year);
    setBatchResults([result]);
    load();
    if (result.ok) alert(`${dept} ${year}: ${result.count}件取得完了`);
    else alert(`取得失敗: ${result.error}`);
  };

  const departments = data?.departments || [];
  const years = data?.years || [];
  const stats = data?.stats || {};
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
      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, marginBottom: 16 }}>時間割取得</div>

      {loading && <div style={{ color: T.txD, fontSize: 13, padding: 20 }}>読み込み中...</div>}

      {!loading && (
        <>
          {/* Scrape controls */}
          <div style={{ padding: 16, borderRadius: 14, background: T.bg3, border: `1px solid ${T.bd}`, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.txH, marginBottom: 12 }}>シラバスから取得</div>

            {/* Year + action buttons */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
              <select value={scrapeYear} onChange={e => setScrapeYear(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, background: T.bg2, border: `1px solid ${T.bd}`, color: T.txH, fontSize: 13 }}>
                <option value="">年度を選択</option>
                {years.map(y => <option key={y} value={y}>{y}年度</option>)}
              </select>
              <Btn onClick={selectAll} color={T.txD} small>
                {selectedDepts.size === departments.length ? "全解除" : "全選択"}
              </Btn>
              <Btn
                onClick={() => handleBatchScrape([...selectedDepts], scrapeYear)}
                color={T.green}
                disabled={!scrapeYear || selectedDepts.size === 0 || isBusy}
              >
                {isBusy ? "取得中..." : `選択した${selectedDepts.size}学科を取得`}
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
                    {scraping.replace("_", " ")} — {progress.phase === "listing" ? "一覧取得中..." : progress.phase === "saving" ? "DB保存中..." : `詳細取得中 ${progress.done}/${progress.total}`}
                    {queue.length > 0 && <span style={{ color: T.txD, fontWeight: 400 }}> (残り {queue.length} 学科)</span>}
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
              <div style={{ fontSize: 14, fontWeight: 600, color: T.txH, marginBottom: 12 }}>取得状況</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr>
                      <th style={{ padding: "6px 8px", textAlign: "left", color: T.txD, fontWeight: 600, borderBottom: `1px solid ${T.bd}` }}>学科</th>
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
                                      <button onClick={() => handleScrape(d.key, y)} disabled={isBusy} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", padding: 0, fontSize: 10 }} title="再取得">{isScraping ? "..." : "↻"}</button>
                                    </span>
                                  ) : (
                                    <button onClick={() => handleScrape(d.key, y)} disabled={isBusy} style={{ background: "none", border: `1px solid ${T.bd}`, borderRadius: 6, padding: "2px 8px", color: T.txD, cursor: "pointer", fontSize: 10 }}>{isScraping ? "..." : "取得"}</button>
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

          {/* DB lookup toggle */}
          <div style={{ padding: 16, borderRadius: 14, background: T.bg3, border: `1px solid ${T.bd}`, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.txH, marginBottom: 12 }}>設定</div>
            <div style={{ padding: "10px 14px", borderRadius: 10, background: T.bg2, border: `1px solid ${T.bd}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.txH }}>DB優先ルックアップ</div>
                <div style={{ fontSize: 11, color: T.txD, marginTop: 2 }}>ONにすると時間割取得時にDBを先に検索し、なければスクレイピング</div>
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
        </>
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
    if (!confirm("この試験を削除しますか？")) return;
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
      if (entries.length === 0) { alert("有効な行がありません"); return; }
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
        <div style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>期末試験データ</div>
        <div style={{ display: "flex", gap: 6 }}>
          <Btn onClick={() => { setAddMode(!addMode); setBulkMode(false); }} color={T.green} small>{I.plus} 追加</Btn>
          <Btn onClick={() => { setBulkMode(!bulkMode); setAddMode(false); }} color={T.accent} small>{I.upload} 一括登録</Btn>
          <Btn onClick={load} color={T.txD} small>{I.reset} 更新</Btn>
        </div>
      </div>

      {/* 一括登録モード */}
      {bulkMode && (
        <div style={{ marginBottom: 16, padding: 14, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 8 }}>一括登録（CSV/TSV）</div>
          <div style={{ fontSize: 11, color: T.txD, marginBottom: 8 }}>形式: 日付, 時限, 科目コード, 科目名, 教員, 講義室（1行1件）</div>
          <div style={{ fontSize: 11, color: T.txD, marginBottom: 8 }}>例: 2026-01-28, 1-2, CSC.T263, 関数型プログラミング基礎, 渡部 卓雄, M-278(H121)</div>
          <textarea value={bulkText} onChange={e => setBulkText(e.target.value)} rows={6} placeholder="ここに貼り付け..." style={{ ...inputSt, width: "100%", resize: "vertical", fontFamily: "monospace", fontSize: 12 }} />
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <Btn onClick={bulkImport} color={T.accent}>登録</Btn>
            <Btn onClick={() => setBulkMode(false)} color={T.txD}>キャンセル</Btn>
          </div>
        </div>
      )}

      {/* 個別追加モード */}
      {addMode && (
        <div style={{ marginBottom: 16, padding: 14, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 8 }}>試験追加</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            <input type="date" value={addForm.date} onChange={e => setAddForm(f => ({ ...f, date: e.target.value }))} style={{ ...inputSt, width: 150 }} />
            <select value={addForm.period} onChange={e => setAddForm(f => ({ ...f, period: e.target.value }))} style={selectSt}>
              <option value="">時限</option>
              {["1-2", "3-4", "5-6", "7-8", "9-10", "1-4", "3-8", "5-8"].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <input value={addForm.code} onChange={e => setAddForm(f => ({ ...f, code: e.target.value }))} placeholder="科目コード" style={{ ...inputSt, width: 130 }} />
            <input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="科目名" style={{ ...inputSt, width: 200 }} />
            <input value={addForm.instructor} onChange={e => setAddForm(f => ({ ...f, instructor: e.target.value }))} placeholder="教員" style={{ ...inputSt, width: 150 }} />
            <input value={addForm.room} onChange={e => setAddForm(f => ({ ...f, room: e.target.value }))} placeholder="講義室" style={{ ...inputSt, width: 150 }} />
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Btn onClick={addExam} color={T.green}>追加</Btn>
            <Btn onClick={() => setAddMode(false)} color={T.txD}>キャンセル</Btn>
          </div>
        </div>
      )}

      {/* フィルター */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <SearchBar value={search} onChange={setSearch} onSearch={() => {}} placeholder="科目コード・名前で検索..." width={200} />
        <select value={filterDate} onChange={e => setFilterDate(e.target.value)} style={selectSt}>
          <option value="">全日程</option>
          {dates.map(d => <option key={d} value={d}>{fmtDate(d)}</option>)}
        </select>
        <select value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)} style={selectSt}>
          <option value="">全時限</option>
          {periods.map(p => <option key={p} value={p}>{p}限</option>)}
        </select>
        <span style={{ fontSize: 12, color: T.txD }}>{filtered.length} / {total} 件</span>
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40, color: T.txD }}>読み込み中...</div>}

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: T.txD }}>
          {exams.length === 0 ? "試験データがありません。一括登録または個別追加で登録してください。" : "条件に一致する試験がありません"}
        </div>
      )}

      {/* テーブル */}
      {!loading && filtered.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${T.bd}` }}>
                {["日付", "時限", "科目コード", "科目名", "教員", "講義室", "操作"].map(h => (
                  <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: T.txD, fontWeight: 600, fontSize: 11, whiteSpace: "nowrap" }}>{h}</th>
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

// ---- Guest Analytics Tab ----
const MODE_LABELS = { freshman: "新入生掲示板", navi: "キャンパスナビ", reg: "履修登録" };
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
      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, marginBottom: 16 }}>ゲストアクセス概要</div>

      {/* Summary cards */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Card label="総セッション数" value={stats?.total} color={T.accent} />
        <Card label="今日" value={stats?.today} color={T.green} />
        <Card label="直近7日" value={stats?.week} color={T.orange} />
        <Card label="直近30日" value={stats?.month} color="#c6a236" />
      </div>

      {/* Mode breakdown */}
      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, margin: "20px 0 12px" }}>モード別アクセス</div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {Object.entries(MODE_LABELS).map(([mode, label]) => (
          <div key={mode} style={{ flex: 1, minWidth: 140, padding: 16, borderRadius: 14, background: T.bg3, border: `1px solid ${T.bd}` }}>
            <div style={{ fontSize: 12, color: T.txD, marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: MODE_COLORS[mode] }}>{stats?.byMode?.[mode] ?? "..."}</div>
            <div style={{ fontSize: 11, color: T.txD, marginTop: 4 }}>今日: {stats?.todayByMode?.[mode] ?? "-"}</div>
          </div>
        ))}
      </div>

      {/* Conversion */}
      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, margin: "20px 0 12px" }}>コンバージョン（ログインへ遷移）</div>
      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ padding: 16, borderRadius: 14, background: T.bg3, border: `1px solid ${T.bd}`, display: "flex", alignItems: "center", gap: 16 }}>
          <DonutChart rate={stats?.conversionRate} />
          <div>
            <div style={{ fontSize: 13, color: T.txD }}>ログイン遷移数</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: T.green }}>{stats?.converted ?? "..."}</div>
            <div style={{ fontSize: 11, color: T.txD }}>全 {stats?.total ?? "..."} セッション中</div>
          </div>
        </div>
      </div>

      {/* Trends chart */}
      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, margin: "24px 0 12px" }}>トレンド（30日）</div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200, padding: 16, borderRadius: 14, background: T.bg3, border: `1px solid ${T.bd}` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 10 }}>全体アクセス推移</div>
          {trends ? <MiniChart data={trends} color={T.accent} /> : <div style={{ fontSize: 12, color: T.txD }}>読み込み中...</div>}
        </div>
        {Object.entries(MODE_LABELS).map(([mode, label]) => (
          <div key={mode} style={{ flex: 1, minWidth: 200, padding: 16, borderRadius: 14, background: T.bg3, border: `1px solid ${T.bd}` }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: MODE_COLORS[mode], marginBottom: 10 }}>{label}</div>
            {trendsByMode?.[mode] ? <MiniChart data={trendsByMode[mode]} color={MODE_COLORS[mode]} /> : <div style={{ fontSize: 12, color: T.txD }}>読み込み中...</div>}
          </div>
        ))}
      </div>

      {/* Session list */}
      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, margin: "24px 0 12px" }}>セッション一覧</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: T.txD }}>{sessTotal} 件</div>
        <div style={{ flex: 1 }} />
        <select value={modeFilter} onChange={e => setModeFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 13, outline: "none" }}>
          <option value="">すべてのモード</option>
          <option value="freshman">新入生掲示板</option>
          <option value="navi">キャンパスナビ</option>
          <option value="reg">履修登録</option>
        </select>
      </div>
      {loading && <div style={{ color: T.txD, fontSize: 13 }}>読み込み中...</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {sessions.map(s => {
          const uaParsed = s.user_agent || "";
          const isMobile = /mobile|android|iphone/i.test(uaParsed);
          return (
            <div key={s.id} style={{ padding: 12, borderRadius: 10, background: T.bg3, border: `1px solid ${T.bd}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <Badge text={MODE_LABELS[s.mode] || s.mode} color={MODE_COLORS[s.mode] || T.accent} />
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
    if (!id) { setError("有効なMoodle IDを入力してください"); return; }
    setSaving(true); setError("");
    try {
      const r = await fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add_admin", moodleUserId: id }) });
      const d = await r.json();
      if (!r.ok) { setError(d.error || "追加に失敗しました"); return; }
      setNewId(""); loadAdmins();
    } catch { setError("通信エラー"); }
    finally { setSaving(false); }
  };

  const handleRemove = async (moodleId) => {
    if (!confirm("この管理者を削除しますか？")) return;
    const r = await fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remove_admin", moodleUserId: moodleId }) });
    const d = await r.json();
    if (!r.ok) { alert(d.error || "削除に失敗しました"); return; }
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
    if (r.ok) alert("保存しました");
  };

  const handleToggleFeature = async (feature) => {
    const next = !featureFlags[feature];
    const r = await fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "toggle_feature", feature, enabled: next }) });
    if (r.ok) setFeatureFlags(prev => ({ ...prev, [feature]: next }));
  };

  const handleBulkUpdate = async () => {
    if (!bulkNew.trim()) return;
    if (!confirm(`「${bulkOld || "(すべて)"}」→「${bulkNew}」に一括変更しますか？`)) return;
    setBulkSaving(true);
    const r = await fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "bulk_update_profiles", field: bulkField, oldValue: bulkOld || null, newValue: bulkNew }) });
    const d = await r.json();
    setBulkSaving(false);
    if (r.ok) alert(`${d.count || 0}件を更新しました`); else alert(d.error || "更新に失敗しました");
  };

  return (
    <div style={{ padding: 16, maxWidth: 700 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, marginBottom: 16 }}>管理者設定</div>
      <div style={{ padding: 16, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}`, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 10 }}>管理者を追加</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input value={newId} onChange={e => setNewId(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleAdd(); }} placeholder="Moodle ユーザーID" style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, outline: "none", fontFamily: "monospace" }} />
          <button onClick={handleAdd} disabled={saving || !newId.trim()} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: T.accent, color: "#fff", fontSize: 13, fontWeight: 600, cursor: saving ? "default" : "pointer", opacity: saving || !newId.trim() ? 0.5 : 1 }}>{saving ? "追加中..." : "追加"}</button>
        </div>
        {error && <div style={{ fontSize: 12, color: T.red, marginTop: 8 }}>{error}</div>}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 10 }}>管理者一覧</div>
      {loading && <div style={{ color: T.txD, fontSize: 13 }}>読み込み中...</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {admins.map(a => (
          <div key={a.moodleId} style={{ display: "flex", alignItems: "center", gap: 10, padding: 12, borderRadius: 10, background: T.bg3, border: `1px solid ${T.bd}` }}>
            <Av u={{ name: a.name, col: a.color, avatar: a.avatar }} sz={32} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.txH }}>{a.name || "不明"}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                <span style={{ fontSize: 11, color: T.txD, fontFamily: "monospace" }}>ID: {a.moodleId}</span>
                <Badge text={a.source === "env" ? "環境変数" : "DB"} color={a.source === "env" ? T.orange : T.accent} />
              </div>
            </div>
            {a.source === "db" ? <Btn onClick={() => handleRemove(a.moodleId)} color={T.red} small>{I.trash} 削除</Btn> : <span style={{ fontSize: 11, color: T.txD }}>削除不可</span>}
          </div>
        ))}
      </div>

      {/* Registration limit (新規登録人数制限) */}
      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, margin: "24px 0 12px" }}>新規登録人数制限</div>
      <div style={{ fontSize: 12, color: T.txD, marginBottom: 12, lineHeight: 1.6 }}>
        新規登録を受け入れる人数を制限します。上限に達すると、既存ユーザーのログインは可能ですが新規登録はブロックされます。
      </div>
      {settingsLoaded && (
        <div style={{ padding: 14, borderRadius: 12, background: regLimitEnabled ? `${T.orange}12` : T.bg3, border: `1px solid ${regLimitEnabled ? T.orange + "40" : T.bd}`, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.txH }}>状態:</span>
            <Badge text={regLimitEnabled ? "制限中" : "無制限"} color={regLimitEnabled ? T.orange : T.green} />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: T.txH, whiteSpace: "nowrap" }}>上限人数:</span>
            <input type="number" min="0" value={regLimitMax} onChange={e => setRegLimitMax(e.target.value)} placeholder="例: 100" style={{ width: 120, padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, outline: "none", fontFamily: "monospace" }} />
            <span style={{ fontSize: 12, color: T.txD }}>人（0 = 新規登録を完全停止）</span>
          </div>
          <input value={regLimitMsg} onChange={e => setRegLimitMsg(e.target.value)} placeholder="ユーザーへの表示メッセージ（例: 現在新規登録を一時停止しています）" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 10 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={handleToggleRegLimit} color={regLimitEnabled ? T.green : T.orange}>{regLimitEnabled ? "制限を解除" : "新規登録を制限"}</Btn>
            {regLimitEnabled && <Btn onClick={handleSaveRegLimit} color={T.accent}>設定を保存</Btn>}
          </div>
        </div>
      )}

      {/* Telecom restriction (電気通信事業の届出前制限) */}
      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, margin: "24px 0 12px" }}>電気通信事業 届出前制限</div>
      <div style={{ fontSize: 12, color: T.txD, marginBottom: 12, lineHeight: 1.6 }}>
        電気通信事業の届出が未承認の間、通信媒介機能（DM・チャット・サークルメッセージ等）を一括で無効化します。
        投稿・コメントなど掲示板型の機能は影響を受けません。
      </div>
      {settingsLoaded && (
        <div style={{ padding: 14, borderRadius: 12, background: telecomRestricted ? `${T.orange}12` : T.bg3, border: `1px solid ${telecomRestricted ? T.orange + "40" : T.bd}`, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.txH }}>状態:</span>
            <Badge text={telecomRestricted ? "通信機能を制限中" : "全機能有効"} color={telecomRestricted ? T.orange : T.green} />
          </div>
          <div style={{ fontSize: 12, color: T.txD, marginBottom: 8 }}>制限対象: DM / コースチャット / サークルメッセージ / グループチャット</div>
          <input value={telecomMsg} onChange={e => setTelecomMsg(e.target.value)} placeholder="ユーザーへの表示メッセージ（例: 届出手続き中のため一時制限中）" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 10 }} />
          <Btn onClick={handleToggleTelecom} color={telecomRestricted ? T.green : T.orange}>{telecomRestricted ? "制限を解除（届出承認済み）" : "通信機能を一括制限"}</Btn>
        </div>
      )}

      {/* Maintenance mode */}
      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, margin: "24px 0 12px" }}>メンテナンスモード</div>
      {settingsLoaded && (
        <div style={{ padding: 14, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}`, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.txH }}>状態:</span>
            <Badge text={maintenanceEnabled ? "メンテナンス中" : "通常運用"} color={maintenanceEnabled ? T.red : T.green} />
          </div>
          <input value={maintenanceMsg} onChange={e => setMaintenanceMsg(e.target.value)} placeholder="メンテナンスメッセージ" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 10 }} />
          <Btn onClick={handleToggleMaintenance} color={maintenanceEnabled ? T.green : T.red}>{maintenanceEnabled ? "メンテナンスを終了" : "メンテナンスを開始"}</Btn>
        </div>
      )}

      {/* Feature flags */}
      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, margin: "24px 0 12px" }}>機能フラグ</div>
      <div style={{ fontSize: 12, color: T.txD, marginBottom: 12 }}>各機能の有効/無効を切り替えます。</div>
      {settingsLoaded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {FEATURE_FLAGS.map(f => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 10, background: T.bg3, border: `1px solid ${T.bd}` }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: T.txH, flex: 1 }}>{f.label}</span>
              <Badge text={featureFlags[f.id] === false ? "無効" : "有効"} color={featureFlags[f.id] === false ? T.red : T.green} />
              <button onClick={() => handleToggleFeature(f.id)} style={{ width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", position: "relative", background: featureFlags[f.id] === false ? T.bg4 : T.green, transition: "background .2s" }}>
                <div style={{ width: 18, height: 18, borderRadius: 9, background: "#fff", position: "absolute", top: 3, left: featureFlags[f.id] === false ? 3 : 23, transition: "left .2s" }} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Bulk update */}
      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, margin: "24px 0 12px" }}>一括更新</div>
      <div style={{ fontSize: 12, color: T.txD, marginBottom: 12 }}>学科の一括変更（年度切替時など）。変更元を空にすると全ユーザーが対象。</div>
      <div style={{ padding: 14, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}`, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select value={bulkField} onChange={e => setBulkField(e.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, outline: "none" }}>
            <option value="dept">学科 (dept)</option>
          </select>
          <input value={bulkOld} onChange={e => setBulkOld(e.target.value)} placeholder="変更元（空=全て）" style={{ flex: 1, minWidth: 100, padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, outline: "none" }} />
          <span style={{ color: T.txD }}>→</span>
          <input value={bulkNew} onChange={e => setBulkNew(e.target.value)} placeholder="変更先" style={{ flex: 1, minWidth: 100, padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, outline: "none" }} />
          <Btn onClick={handleBulkUpdate} color={T.orange} disabled={bulkSaving || !bulkNew.trim()}>{bulkSaving ? "更新中..." : "一括更新"}</Btn>
        </div>
      </div>

      {/* ToS / Privacy */}
      <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, margin: "24px 0 12px" }}>利用規約・プライバシーポリシー補足</div>
      <div style={{ fontSize: 12, color: T.txD, marginBottom: 12 }}>規約本文はコードで管理。追加の補足事項をここで設定できます。</div>
      {settingsLoaded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ padding: 14, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}` }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 8 }}>利用規約の補足事項</div>
            <textarea value={tosNotice} onChange={e => setTosNotice(e.target.value)} placeholder="例: 2026年4月1日付で第5条を改定しました" rows={3} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box" }} />
          </div>
          <div style={{ padding: 14, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}` }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 8 }}>プライバシーポリシーの補足事項</div>
            <textarea value={ppNotice} onChange={e => setPpNotice(e.target.value)} placeholder="例: 位置情報の取り扱いについて更新しました" rows={3} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Btn onClick={async () => {
              setSettingsSaving(true);
              await Promise.all([
                fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update_site_setting", key: "tos_notice", value: { text: tosNotice, updatedAt: new Date().toISOString() } }) }),
                fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update_site_setting", key: "pp_notice", value: { text: ppNotice, updatedAt: new Date().toISOString() } }) }),
              ]);
              setSettingsSaving(false);
              alert("保存しました");
            }} color={T.accent} disabled={settingsSaving}>{settingsSaving ? "保存中..." : "補足事項を保存"}</Btn>
          </div>
        </div>
      )}

      {/* NG Words */}
      <NgWordsSection />
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

  const removeTarget = (id) => { if (targetsLoaded) saveTargets(targets.filter(t => t !== id)); };

  const deleteCapture = async (id, all) => {
    if (all && !confirm("全キャプチャデータを削除しますか？")) return;
    await fetch(`${API}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete_captured_moodle", ...(all ? { all: true } : { id }) }) });
    loadCaptures();
  };

  const inputStyle = { padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 13, outline: "none" };

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: T.txH }}>Moodleデータ取得</div>
      <div style={{ fontSize: 12, color: T.txD, lineHeight: 1.6 }}>
        指定したMoodleユーザーIDの履修科目データを、次回ログイン時に自動でキャプチャします。<br />
        医歯学系のMoodleコース形式を確認するための一時的な機能です。
      </div>

      {/* Target user IDs */}
      <div style={{ padding: 14, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}` }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 10 }}>キャプチャ対象ユーザーID</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <input value={newId} onChange={e => setNewId(e.target.value)} placeholder="Moodle User ID" style={{ ...inputStyle, width: 160 }} onKeyDown={e => { if (e.key === "Enter") addTarget(); }} />
          <Btn onClick={addTarget} color={T.accent} disabled={!newId.trim()}>追加</Btn>
        </div>
        {targets.length === 0 ? (
          <div style={{ fontSize: 12, color: T.txD }}>対象なし（IDを追加するとそのユーザーのログイン時にデータを取得します）</div>
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
        <div style={{ fontSize: 13, fontWeight: 600, color: T.txH }}>取得済みデータ ({captures.length}件)</div>
        <div style={{ display: "flex", gap: 6 }}>
          <Btn onClick={loadCaptures} color={T.accent} small>{loading ? "読込中..." : "更新"}</Btn>
          {captures.length > 0 && <Btn onClick={() => deleteCapture(null, true)} color="#e5534b" small>全削除</Btn>}
        </div>
      </div>

      {captures.length === 0 ? (
        <div style={{ fontSize: 12, color: T.txD, padding: 20, textAlign: "center" }}>
          まだデータがありません。対象ユーザーがアプリにログインすると、ここにデータが表示されます。
        </div>
      ) : captures.map(cap => (
        <div key={cap.id} style={{ padding: 14, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.txH }}>{cap.user_name || "不明"}</span>
              <span style={{ fontSize: 11, color: T.txD, marginLeft: 8 }}>ID: {cap.moodle_user_id}</span>
              <span style={{ fontSize: 11, color: T.txD, marginLeft: 8 }}>{cap.course_count}科目</span>
              <span style={{ fontSize: 11, color: T.txD, marginLeft: 8 }}>{new Date(cap.captured_at).toLocaleString("ja-JP")}</span>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <Btn onClick={() => { navigator.clipboard.writeText(JSON.stringify(cap.raw_courses, null, 2)); }} color="#4CAF50" small>JSON コピー</Btn>
              <Btn onClick={() => setExpanded(expanded === cap.id ? null : cap.id)} color={T.accent} small>{expanded === cap.id ? "閉じる" : "詳細"}</Btn>
              <Btn onClick={() => deleteCapture(cap.id)} color="#e5534b" small>削除</Btn>
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
                if (courses.length === 0) return <div style={{ fontSize: 12, color: T.txD }}>データなし</div>;
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
  const [token, setToken] = useState("");
  const [siteInfo, setSiteInfo] = useState(null);
  const [wsfunction, setWsfunction] = useState("core_enrol_get_users_courses");
  const [paramsText, setParamsText] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const [password, setPassword] = useState("");
  const [timetable, setTimetable] = useState(null);
  const [ttLoading, setTtLoading] = useState(false);
  const [ttQuarter, setTtQuarter] = useState(1);

  const presets = [
    { label: "サイト情報", fn: "core_webservice_get_site_info", params: "" },
    { label: "履修科目一覧", fn: "core_enrol_get_users_courses", params: '{"userid":"__USERID__"}' },
    { label: "コース内容", fn: "core_course_get_contents", params: '{"courseid":""}' },
    { label: "コース検索", fn: "core_course_search_courses", params: '{"criterianame":"search","criteriavalue":""}' },
    { label: "ユーザー情報", fn: "core_user_get_users_by_field", params: '{"field":"id","values":["__USERID__"]}' },
    { label: "コース登録者", fn: "core_enrol_get_enrolled_users", params: '{"courseid":""}' },
    { label: "利用可能関数一覧", fn: "core_webservice_get_site_info", params: "" },
  ];

  const callApi = async (fn, params) => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      let parsedParams = {};
      if (params && params.trim()) {
        parsedParams = JSON.parse(params);
      }
      const resp = await fetch(`${API}/api/admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "t2schola_call", wstoken: token, wsfunction: fn, params: parsedParams }),
      });
      const d = await resp.json();
      if (d.error) { setError(d.error); return; }
      setResult(d.data);
      setHistory(h => [{ fn, params, time: new Date().toLocaleTimeString(), preview: JSON.stringify(d.data).slice(0, 100) }, ...h].slice(0, 20));
      // Auto-extract userid from site_info
      if (fn === "core_webservice_get_site_info" && d.data?.userid) {
        setSiteInfo(d.data);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const autoGetToken = async () => {
    if (!password.trim()) return;
    setLoading(true); setError("");
    try {
      const resp = await fetch(`${API}/api/admin`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "t2schola_get_token", password }),
      });
      const d = await resp.json();
      if (d.ok && d.token) {
        setToken(d.token);
        setPassword("");
        // Auto-connect with site info
        await callApi("core_webservice_get_site_info", "");
      } else {
        setError(d.error || d.errorcode || "トークン取得失敗");
      }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const connectToken = async () => {
    if (!token.trim()) return;
    await callApi("core_webservice_get_site_info", "");
  };

  const inputStyle = { padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 13, outline: "none", fontFamily: "monospace" };

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: T.txH }}>T2SCHOLA API Explorer</div>
      <div style={{ fontSize: 12, color: T.txD, lineHeight: 1.6 }}>
        旧T2SCHOLA (t2schola.titech.ac.jp) のMoodle APIを探索。2024年度の履修データ取得に使用。<br />
        トークン取得: ブラウザでT2SCHOLAにログイン → DevToolsのNetwork → token= を探す
      </div>

      {/* Token: manual or auto-acquire with password */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={token} onChange={e => setToken(e.target.value)}
          placeholder="T2SCHOLA wstoken (32文字hex)"
          style={{ ...inputStyle, flex: 1, minWidth: 200 }}
        />
        <Btn onClick={connectToken} color={T.accent} disabled={loading || !token.trim()}>接続テスト</Btn>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="password" value={password} onChange={e => setPassword(e.target.value)}
          placeholder="Science Tokyo パスワード"
          style={{ ...inputStyle, flex: 1, minWidth: 200 }}
          onKeyDown={e => { if (e.key === "Enter") autoGetToken(); }}
        />
        <Btn onClick={autoGetToken} color="#4CAF50" disabled={loading || !password.trim()}>
          {loading ? "取得中..." : "パスワードでトークン自動取得"}
        </Btn>
      </div>

      {/* Connection Status */}
      {siteInfo && (
        <div style={{ padding: 12, borderRadius: 10, background: `${T.accent}10`, border: `1px solid ${T.accent}30` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.accent }}>
            接続済: {siteInfo.fullname} (userid: {siteInfo.userid})
          </div>
          <div style={{ fontSize: 11, color: T.txD, marginTop: 4 }}>
            {siteInfo.sitename} — {siteInfo.siteurl}
          </div>
        </div>
      )}

      {/* Timetable Generation */}
      {siteInfo && token && (
        <div style={{ padding: 14, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.txH }}>2024年度 時間割</div>
            <Btn onClick={async () => {
              setTtLoading(true); setError("");
              try {
                const resp = await fetch(`${API}/api/data/timetable-past?t2token=${encodeURIComponent(token)}&year=2024`);
                const d = await resp.json();
                if (d.error) { setError(d.error); return; }
                setTimetable(d);
              } catch (e) { setError(e.message); }
              finally { setTtLoading(false); }
            }} color={T.accent} disabled={ttLoading}>
              {ttLoading ? "生成中..." : timetable ? "再取得" : "時間割を生成"}
            </Btn>
          </div>

          {timetable && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: T.txD }}>
                  {timetable.stats.total}科目中 {timetable.stats.withSchedule}科目の時間割あり (DB: {timetable.stats.dbRows}行)
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
                if (!qd || !qd.TT) return <div style={{ fontSize: 12, color: T.txD }}>この学期のデータなし</div>;
                const days = ["月", "火", "水", "木", "金"];
                const times = ["1-2\n8:50", "3-4\n10:45", "5-6\n13:20", "7-8\n15:15", "9-10\n17:10"];
                return (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse", tableLayout: "fixed" }}>
                      <thead>
                        <tr>
                          <th style={{ width: 44, padding: 4, color: T.txD, borderBottom: `1px solid ${T.bd}` }}></th>
                          {days.map(d => (
                            <th key={d} style={{ padding: 4, color: T.txD, fontWeight: 600, borderBottom: `1px solid ${T.bd}`, textAlign: "center" }}>{d}</th>
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
                    <span style={{ color: T.txD }}>{c.per || "時間不明"}</span>
                    <span style={{ color: T.txD }}>{c.room || ""}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Preset Buttons */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: T.txD, marginBottom: 8 }}>プリセット</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {presets.map((p, i) => (
            <Btn key={i} onClick={() => {
              setWsfunction(p.fn);
              let params = p.params;
              if (siteInfo?.userid) params = params.replace(/__USERID__/g, String(siteInfo.userid));
              setParamsText(params);
            }} color={T.txD} small>{p.label}</Btn>
          ))}
        </div>
      </div>

      {/* API Call Form */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={wsfunction} onChange={e => setWsfunction(e.target.value)}
            placeholder="wsfunction (例: core_enrol_get_users_courses)"
            style={{ ...inputStyle, flex: 1, minWidth: 300 }}
          />
          <Btn onClick={() => callApi(wsfunction, paramsText)} color={T.accent} disabled={loading || !token.trim()}>
            {loading ? "実行中..." : "実行"}
          </Btn>
        </div>
        <textarea
          value={paramsText} onChange={e => setParamsText(e.target.value)}
          placeholder='パラメータ JSON (例: {"userid":"12345"})'
          rows={3}
          style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
        />
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: 10, borderRadius: 8, background: "#ff444420", border: "1px solid #ff444440", color: "#ff6666", fontSize: 12 }}>
          {error}
        </div>
      )}

      {/* Result */}
      {result !== null && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.txD }}>
              レスポンス {Array.isArray(result) ? `(${result.length}件)` : ""}
            </div>
            <Btn onClick={() => { navigator.clipboard.writeText(JSON.stringify(result, null, 2)); }} color={T.txD} small>コピー</Btn>
          </div>

          {/* If it's an array of courses, show table view */}
          {Array.isArray(result) && result.length > 0 && result[0].shortname && (
            <div style={{ overflowX: "auto", borderRadius: 10, border: `1px solid ${T.bd}` }}>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: T.bg3 }}>
                    {["id", "shortname", "fullname", "enrolledusercount"].map(col => (
                      <th key={col} style={{ padding: "8px 10px", textAlign: "left", color: T.txD, fontWeight: 600, borderBottom: `1px solid ${T.bd}` }}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.map((row, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${T.bd}` }}>
                      <td style={{ padding: "6px 10px", color: T.txD }}>{row.id}</td>
                      <td style={{ padding: "6px 10px", color: T.accent, fontFamily: "monospace", fontSize: 11 }}>{row.shortname}</td>
                      <td style={{ padding: "6px 10px", color: T.txH }}>{row.fullname}</td>
                      <td style={{ padding: "6px 10px", color: T.txD }}>{row.enrolledusercount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Raw JSON */}
          <pre style={{
            padding: 12, borderRadius: 10, background: T.bg3, border: `1px solid ${T.bd}`,
            color: T.txH, fontSize: 11, fontFamily: "monospace", lineHeight: 1.5,
            overflow: "auto", maxHeight: 400, whiteSpace: "pre-wrap", wordBreak: "break-all",
          }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.txD, marginBottom: 8 }}>呼び出し履歴</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {history.map((h, i) => (
              <div key={i} onClick={() => { setWsfunction(h.fn); setParamsText(h.params); }}
                style={{ padding: "6px 10px", borderRadius: 8, background: T.bg3, border: `1px solid ${T.bd}`, cursor: "pointer", fontSize: 11, display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ color: T.txD }}>{h.time}</span>
                <span style={{ color: T.accent, fontFamily: "monospace" }}>{h.fn}</span>
                <span style={{ color: T.txD, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.preview}</span>
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
        <div style={{ fontSize: 15, fontWeight: 700, color: T.txH }}>アクセス権限がありません</div>
        <div style={{ fontSize: 13, color: T.txD, textAlign: "center", lineHeight: 1.6 }}>管理者のみアクセスできます</div>
      </div>
    );
  }

  return (
    <OnlineContext.Provider value={onlineIds}>
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", borderBottom: `1px solid ${T.bd}`, background: T.bg2, flexShrink: 0, overflowX: "auto" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            display: "flex", alignItems: "center", gap: 6, padding: mob ? "10px 10px" : "10px 14px",
            border: "none", borderBottom: tab === t.id ? `2px solid ${T.accent}` : "2px solid transparent",
            background: "transparent", color: tab === t.id ? T.txH : T.txD,
            fontSize: 12, fontWeight: tab === t.id ? 600 : 400, cursor: "pointer", whiteSpace: "nowrap",
          }}>
            <span style={{ display: "flex" }}>{t.icon}</span>
            {!mob && <span>{t.label}</span>}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: tab === "map" ? "hidden" : "auto", display: "flex", flexDirection: "column" }}>
        {tab === "stats" && <StatsTab />}
        {tab === "reports" && <ReportsTab />}
        {tab === "users" && <UsersTab />}
        {tab === "posts" && <PostsTab courses={courses} schools={schools} depts={depts} />}
        {tab === "comments" && <CommentsTab />}
        {tab === "messages" && <MessagesTab courses={courses} schools={schools} depts={depts} />}
        {tab === "dms" && <DMsTab />}
        {tab === "circles" && <CirclesTab />}
        {tab === "announce" && <AnnouncementsTab />}
        {tab === "audit" && <AuditLogTab />}
        {tab === "map" && <MapEditorView mob={mob} />}
        {tab === "syllabus" && <SyllabusTab />}
        {tab === "syllabus_fetch" && <SyllabusFetchTab />}
        {tab === "exams" && <ExamTab />}
        {tab === "t2schola" && <T2ScholaTab />}
        {tab === "guests" && <GuestAnalyticsTab />}
        {tab === "moodle_capture" && <MoodleCaptureTab />}
        {tab === "settings" && <SettingsTab />}
      </div>
    </div>
    </OnlineContext.Provider>
  );
};
