import React, { useState, useEffect, useCallback } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { Av } from "../shared.jsx";

const API = "";

const tabs = [
  { id: "stats", label: "ダッシュボード", icon: I.bar },
  { id: "users", label: "ユーザー", icon: I.users },
  { id: "posts", label: "投稿", icon: I.feed },
  { id: "messages", label: "メッセージ", icon: I.chat },
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

// ---- Stats Tab ----
const StatsTab = () => {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    fetch(`${API}/api/admin?action=stats`).then(r => r.json()).then(setStats).catch(() => {});
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
    </div>
  );
};

// ---- Users Tab ----
const UsersTab = () => {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback((p) => {
    setLoading(true);
    fetch(`${API}/api/admin?action=users&page=${p}`)
      .then(r => r.json())
      .then(d => { setUsers(d.users || []); setTotal(d.total || 0); setPage(d.page || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(0); }, [load]);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>ユーザー一覧 ({total})</div>
      </div>
      {loading && <div style={{ color: T.txD, fontSize: 13 }}>読み込み中...</div>}
      <div style={{ borderRadius: 12, border: `1px solid ${T.bd}`, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: T.bg3, borderBottom: `1px solid ${T.bd}` }}>
              <th style={{ padding: "10px 12px", textAlign: "left", color: T.txD, fontWeight: 600 }}>ユーザー</th>
              <th style={{ padding: "10px 12px", textAlign: "left", color: T.txD, fontWeight: 600 }}>ID</th>
              <th style={{ padding: "10px 12px", textAlign: "left", color: T.txD, fontWeight: 600 }}>学科</th>
              <th style={{ padding: "10px 12px", textAlign: "left", color: T.txD, fontWeight: 600 }}>学年</th>
              <th style={{ padding: "10px 12px", textAlign: "left", color: T.txD, fontWeight: 600 }}>登録日</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id || u.moodle_user_id} style={{ borderBottom: `1px solid ${T.bd}` }}>
                <td style={{ padding: "8px 12px", color: T.txH }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Av u={{ name: u.name, col: u.color, avatar: u.avatar }} sz={28} />
                    <span style={{ fontWeight: 500 }}>{u.name || "不明"}</span>
                  </div>
                </td>
                <td style={{ padding: "8px 12px", color: T.txD, fontFamily: "monospace", fontSize: 12 }}>{u.moodle_user_id || u.id}</td>
                <td style={{ padding: "8px 12px", color: T.txD }}>{u.department || "-"}</td>
                <td style={{ padding: "8px 12px", color: T.txD }}>{u.year || "-"}</td>
                <td style={{ padding: "8px 12px", color: T.txD, fontSize: 12 }}>{u.created_at ? new Date(u.created_at).toLocaleDateString("ja-JP") : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={total} limit={50} onPage={load} />
    </div>
  );
};

// ---- Course Select ----
const CourseSelect = ({ courses, value, onChange }) => (
  <select value={value} onChange={e => onChange(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 13, outline: "none", maxWidth: 220 }}>
    <option value="">すべてのコース</option>
    {courses.map(c => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
  </select>
);

// ---- Posts Tab ----
const PostsTab = ({ courses }) => {
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
    fetch(`${API}/api/admin?${qs}`)
      .then(r => r.json())
      .then(d => { setPosts(d.posts || []); setTotal(d.total || 0); setPage(d.page || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(0, "", ""); }, [load]);

  const handleCourse = (cid) => { setCourseId(cid); load(0, search, cid); };
  const handleDelete = async (id) => {
    if (!confirm("この投稿を削除しますか？")) return;
    const r = await fetch(`${API}/api/admin`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "post", id }) });
    if (r.ok) load(page, search, courseId);
  };

  const courseMap = Object.fromEntries(courses.map(c => [c.id, c]));

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>投稿管理 ({total})</div>
        <div style={{ flex: 1 }} />
        <CourseSelect courses={courses} value={courseId} onChange={handleCourse} />
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, background: T.bg3, border: `1px solid ${T.bd}`, width: 200 }}>
          <span style={{ color: T.txD, display: "flex" }}>{I.search}</span>
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === "Enter") load(0, search, courseId); }} placeholder="検索..." style={{ flex: 1, border: "none", background: "transparent", color: T.txH, fontSize: 13, outline: "none" }} />
        </div>
      </div>
      {loading && <div style={{ color: T.txD, fontSize: 13 }}>読み込み中...</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {posts.map(p => {
          const cc = courseMap[p.course_id];
          return (
          <div key={p.id} style={{ padding: 14, borderRadius: 12, background: T.bg3, border: `1px solid ${T.bd}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Av u={{ name: p.profiles?.name, col: p.profiles?.color, avatar: p.profiles?.avatar }} sz={24} />
              <span style={{ fontSize: 13, fontWeight: 600, color: T.txH }}>{p.profiles?.name || "匿名"}</span>
              <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 4, background: cc ? `${cc.col}18` : `${T.txD}18`, color: cc?.col || T.txD }}>{cc?.code || p.course_id}</span>
              <span style={{ fontSize: 11, color: T.txD, marginLeft: "auto" }}>{p.created_at ? new Date(p.created_at).toLocaleString("ja-JP") : ""}</span>
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, background: `${T.accent}20`, color: T.accent }}>{p.type || "post"}</span>
            </div>
            <div style={{ fontSize: 13, color: T.tx, lineHeight: 1.6, marginBottom: 8, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 120, overflow: "hidden" }}>{p.text}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 11, color: T.txD }}>{I.heart} {(p.likes || []).length}</span>
              <span style={{ fontSize: 11, color: T.txD }}>{I.chat} {p.comment_count || 0}</span>
              <div style={{ flex: 1 }} />
              <button onClick={() => handleDelete(p.id)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 12px", borderRadius: 8, border: `1px solid ${T.red}30`, background: `${T.red}10`, color: T.red, cursor: "pointer", fontSize: 12, fontWeight: 500 }}>{I.trash} 削除</button>
            </div>
          </div>
          );
        })}
        {!loading && posts.length === 0 && <div style={{ padding: 32, textAlign: "center", color: T.txD, fontSize: 13 }}>投稿がありません</div>}
      </div>
      <Pager page={page} total={total} limit={30} onPage={p => load(p, search, courseId)} />
    </div>
  );
};

// ---- Messages Tab ----
const MessagesTab = ({ courses }) => {
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
    fetch(`${API}/api/admin?${qs}`)
      .then(r => r.json())
      .then(d => { setMessages(d.messages || []); setTotal(d.total || 0); setPage(d.page || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(0, "", ""); }, [load]);

  const handleCourse = (cid) => { setCourseId(cid); load(0, search, cid); };
  const handleDelete = async (id) => {
    if (!confirm("このメッセージを削除しますか？")) return;
    const r = await fetch(`${API}/api/admin`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "message", id }) });
    if (r.ok) load(page, search, courseId);
  };

  const courseMap = Object.fromEntries(courses.map(c => [c.id, c]));

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>メッセージ管理 ({total})</div>
        <div style={{ flex: 1 }} />
        <CourseSelect courses={courses} value={courseId} onChange={handleCourse} />
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, background: T.bg3, border: `1px solid ${T.bd}`, width: 200 }}>
          <span style={{ color: T.txD, display: "flex" }}>{I.search}</span>
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === "Enter") load(0, search, courseId); }} placeholder="検索..." style={{ flex: 1, border: "none", background: "transparent", color: T.txH, fontSize: 13, outline: "none" }} />
        </div>
      </div>
      {loading && <div style={{ color: T.txD, fontSize: 13 }}>読み込み中...</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {messages.map(m => {
          const cc = courseMap[m.course_id];
          return (
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
            <button onClick={() => handleDelete(m.id)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 8, border: `1px solid ${T.red}30`, background: `${T.red}10`, color: T.red, cursor: "pointer", fontSize: 12, flexShrink: 0 }}>{I.trash}</button>
          </div>
          );
        })}
        {!loading && messages.length === 0 && <div style={{ padding: 32, textAlign: "center", color: T.txD, fontSize: 13 }}>メッセージがありません</div>}
      </div>
      <Pager page={page} total={total} limit={50} onPage={p => load(p, search, courseId)} />
    </div>
  );
};

// ---- Main AdminView ----
export const AdminView = ({ mob, courses = [] }) => {
  const [tab, setTab] = useState("stats");
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/admin?action=stats`)
      .then(r => { if (r.status === 403) setForbidden(true); })
      .catch(() => {});
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
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: `1px solid ${T.bd}`, background: T.bg2, flexShrink: 0, overflowX: "auto" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            display: "flex", alignItems: "center", gap: 6, padding: mob ? "10px 14px" : "10px 18px",
            border: "none", borderBottom: tab === t.id ? `2px solid ${T.accent}` : "2px solid transparent",
            background: "transparent", color: tab === t.id ? T.txH : T.txD,
            fontSize: 13, fontWeight: tab === t.id ? 600 : 400, cursor: "pointer", whiteSpace: "nowrap",
          }}>
            <span style={{ display: "flex" }}>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {tab === "stats" && <StatsTab />}
        {tab === "users" && <UsersTab />}
        {tab === "posts" && <PostsTab courses={courses} />}
        {tab === "messages" && <MessagesTab courses={courses} />}
      </div>
    </div>
  );
};
