import { useState, useEffect, useCallback, useMemo } from "react";
import { T } from "../theme.js";
import { t } from "../i18n.js";
import { DEPTS } from "../data.js";
import { showToast } from "../hooks/useToast.js";
import { setCareerPublic } from "../careerAccess.js";
import { CAREER_FIELDS, CAREER_SKILLS, REWARD_KINDS, DEPT_CODES } from "../../lib/career-tags.js";

// 管理画面「キャリア」: インターン・就職・イベントの掲載を登録・確認・公開する（/api/admin/career）。
// 載せるのは公式ページで確かめたことだけ。金額・待遇は募集元の記載どおりに写す（的確表示）。
// 「確認した」で最終確認日を今にする。要確認 = 最終確認から 60 日（随時募集は 30 日）・リンク切れ。

const PUBLISH_GOAL = 30; // 一般公開の目安（有効な掲載の数）
const STATUS_LABEL = { draft: "下書き", published: "掲載中", closed: "終了", hidden: "非表示" };
const STATUS_COLOR = { draft: "#64748b", published: "#16a34a", closed: "#94a3b8", hidden: "#dc2626" };
const KIND_LABEL = { intern: "インターン", job: "就職", event: "イベント" };
const DAY = 86400e3;

const EMPTY = {
  kind: "intern", status: "draft", title: "", org: "", org_url: "", apply_url: "", source_url: "", summary: "",
  fields: [], skills_req: [], skills_pref: [], depts: [], degrees: [], grad_years: "",
  intern_type: "", duration: "", period_text: "", pay_kind: "", pay_text: "", remote: "", location: "",
  reward_kind: "", reward_text: "", reward_max: "", starts_at: "", ends_at: "", deadline: "",
  promo: "", promo_note: "", source: "manual",
};

const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function fromRow(r) {
  const f = { ...EMPTY };
  for (const k of Object.keys(EMPTY)) if (r[k] != null) f[k] = r[k];
  f.grad_years = (r.grad_years || []).join(",");
  f.starts_at = toLocalInput(r.starts_at);
  f.ends_at = toLocalInput(r.ends_at);
  f.intern_type = r.intern_type ?? "";
  f.reward_max = r.reward_max ?? "";
  return f;
}

function toPayload(f) {
  return {
    ...f,
    grad_years: String(f.grad_years || "").split(/[,\s、]+/).filter(Boolean).map(Number),
    starts_at: f.starts_at ? new Date(f.starts_at).toISOString() : null,
    ends_at: f.ends_at ? new Date(f.ends_at).toISOString() : null,
    intern_type: f.intern_type === "" ? null : Number(f.intern_type),
    reward_max: f.reward_max === "" ? null : Number(f.reward_max),
  };
}

const needsCheck = (r, now = Date.now()) => {
  const age = now - Date.parse(r.checked_at || 0);
  if (r.link_status === "broken") return "リンク切れ";
  if (!r.deadline && !r.starts_at && age > 30 * DAY) return "随時募集・30日未確認";
  if (age > 60 * DAY) return "60日未確認";
  return null;
};

const inp = { width: "100%", boxSizing: "border-box", padding: "7px 9px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 12.5 };
const Label = ({ children, req }) => <div style={{ fontSize: 11, fontWeight: 700, color: T.txD, margin: "10px 0 4px" }}>{children}{req && <span style={{ color: T.red }}> *</span>}</div>;

function Multi({ options, value, onChange, label }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {options.map((o) => {
        const on = value.includes(o);
        return <button key={o} type="button" onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])} style={{ padding: "3px 9px", borderRadius: 14, border: `1px solid ${on ? T.accent : T.bd}`, background: on ? `${T.accent}1f` : T.bg2, color: on ? T.accent : T.txD, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>{label(o)}</button>;
      })}
    </div>
  );
}

function Editor({ initial, onCancel, onSaved }) {
  const [f, setF] = useState(initial.row ? fromRow(initial.row) : { ...EMPTY });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e && e.target ? e.target.value : e }));
  const save = async () => {
    setBusy(true); setErr("");
    try {
      const body = initial.row ? { id: initial.row.id, data: toPayload(f) } : { data: toPayload(f) };
      const r = await fetch("/api/admin/career", { method: initial.row ? "PATCH" : "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error + (d.duplicate ? `（${d.duplicate.title}）` : "")); setBusy(false); return; }
      onSaved(d.item);
    } catch { setErr("保存できませんでした"); }
    setBusy(false);
  };
  const isEvent = f.kind === "event";
  return (
    <div style={{ border: `1px solid ${T.accent}55`, borderRadius: 12, padding: "6px 14px 14px", background: T.bg, marginBottom: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: T.txH, margin: "8px 0 2px" }}>{initial.row ? "掲載を編集" : "掲載を追加"}</div>
      <div style={{ fontSize: 11, color: T.txD }}>公式ページで確かめたことだけを、募集元の記載どおりに入れてください。保存すると最終確認日が今日になります。</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "0 10px" }}>
        <div><Label req>種類</Label><select value={f.kind} onChange={set("kind")} style={inp}>{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><Label>状態</Label><select value={f.status} onChange={set("status")} style={inp}>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><Label>掲載元</Label><select value={f.source} onChange={set("source")} style={inp}><option value="manual">運営者が確認</option><option value="tip">学生からの情報</option></select></div>
      </div>
      <Label req>タイトル</Label><input value={f.title} onChange={set("title")} maxLength={120} style={inp} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 10px" }}>
        <div><Label req>組織名</Label><input value={f.org} onChange={set("org")} maxLength={80} style={inp} /></div>
        <div><Label>組織の URL</Label><input value={f.org_url} onChange={set("org_url")} style={inp} placeholder="https://" /></div>
      </div>
      <Label req>応募先 URL（公式）</Label><input value={f.apply_url} onChange={set("apply_url")} style={inp} placeholder="https://" />
      <Label>確認したページ（応募先と違うとき）</Label><input value={f.source_url} onChange={set("source_url")} style={inp} placeholder="https://" />
      <Label>内容の要約（事実だけ・400字まで）</Label><textarea value={f.summary} onChange={set("summary")} maxLength={400} rows={3} style={{ ...inp, resize: "vertical", font: "inherit" }} />
      <Label req>分野</Label><Multi options={CAREER_FIELDS} value={f.fields} onChange={set("fields")} label={(o) => t(`career.f.${o}`)} />
      <Label>必須スキル</Label><Multi options={CAREER_SKILLS} value={f.skills_req} onChange={set("skills_req")} label={(o) => t(`career.s.${o}`)} />
      <Label>歓迎スキル</Label><Multi options={CAREER_SKILLS} value={f.skills_pref} onChange={set("skills_pref")} label={(o) => t(`career.s.${o}`)} />
      <Label>対象の系（募集元が明記しているときだけ）</Label><Multi options={DEPT_CODES.filter((c) => DEPTS[c])} value={f.depts} onChange={set("depts")} label={(o) => DEPTS[o]?.name || o} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 10px" }}>
        <div><Label>対象の学位</Label><Multi options={["B", "M", "D"]} value={f.degrees} onChange={set("degrees")} label={(o) => ({ B: "学部", M: "修士", D: "博士" }[o])} /></div>
        <div><Label>対象の卒業年（例: 2028,2029）</Label><input value={f.grad_years} onChange={set("grad_years")} style={inp} placeholder="空 = 書かれていない" /></div>
      </div>
      {!isEvent && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "0 10px" }}>
          {f.kind === "intern" && <div><Label>期間</Label><select value={f.duration} onChange={set("duration")} style={inp}><option value="">—</option><option value="short">短期</option><option value="long">長期</option></select></div>}
          {f.kind === "intern" && <div><Label>三省合意の類型</Label><select value={f.intern_type} onChange={set("intern_type")} style={inp}><option value="">不明</option><option value="3">タイプ3（汎用・専門活用型）</option><option value="4">タイプ4（高度専門型）</option></select></div>}
          <div><Label>給与</Label><select value={f.pay_kind} onChange={set("pay_kind")} style={inp}><option value="">—</option><option value="paid">有給</option><option value="unpaid">無給</option><option value="unknown">要確認</option></select></div>
          <div><Label>期間・日数（記載どおり）</Label><input value={f.period_text} onChange={set("period_text")} maxLength={60} style={inp} /></div>
        </div>
      )}
      {!isEvent && <><Label>給与・待遇（記載どおり）</Label><input value={f.pay_text} onChange={set("pay_text")} maxLength={120} style={inp} placeholder="例: 時給1,500円〜、交通費支給" /></>}
      {isEvent && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 10px" }}>
            <div><Label req>もらえるもの（種類）</Label><select value={f.reward_kind} onChange={set("reward_kind")} style={inp}><option value="">選ぶ</option>{REWARD_KINDS.map((k) => <option key={k} value={k}>{t(`career.r.${k}`)}</option>)}</select></div>
            <div><Label>金額の上限（円・並べ替え用）</Label><input value={f.reward_max} onChange={set("reward_max")} inputMode="numeric" style={inp} /></div>
          </div>
          <Label req={f.reward_kind && f.reward_kind !== "none"}>もらえるもの（記載どおり）</Label><input value={f.reward_text} onChange={set("reward_text")} maxLength={120} style={inp} placeholder="例: Amazonギフト券 3,000円（参加者全員）" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 10px" }}>
            <div><Label>開始</Label><input type="datetime-local" value={f.starts_at} onChange={set("starts_at")} style={inp} /></div>
            <div><Label>終了</Label><input type="datetime-local" value={f.ends_at} onChange={set("ends_at")} style={inp} /></div>
          </div>
          <div style={{ fontSize: 10.5, color: T.txD, marginTop: 4 }}>1day の仕事体験・オープン・カンパニーは「イベント」に（三省合意で「インターンシップ」と呼ばないもの）。</div>
        </>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "0 10px" }}>
        <div><Label>応募締切</Label><input type="date" value={f.deadline || ""} onChange={set("deadline")} style={inp} /></div>
        <div><Label>働き方</Label><select value={f.remote} onChange={set("remote")} style={inp}><option value="">—</option><option value="onsite">出社・会場</option><option value="remote">リモート・オンライン</option><option value="hybrid">一部リモート</option></select></div>
        <div><Label>場所</Label><input value={f.location} onChange={set("location")} maxLength={80} style={inp} /></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "0 10px" }}>
        <div><Label>広告・提携の表示</Label><select value={f.promo} onChange={set("promo")} style={inp}><option value="">なし（通常）</option><option value="pr">PR</option><option value="partner">提携</option></select></div>
        <div><Label>表示の補足（広告主名など）</Label><input value={f.promo_note} onChange={set("promo_note")} maxLength={120} style={inp} /></div>
      </div>
      {err && <div style={{ color: T.red, fontSize: 12.5, marginTop: 10 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button onClick={onCancel} style={{ padding: "8px 14px", borderRadius: 9, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txD, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>やめる</button>
        <button disabled={busy} onClick={save} style={{ padding: "8px 18px", borderRadius: 9, border: "none", background: T.accent, color: "#fff", fontSize: 12.5, fontWeight: 800, cursor: "pointer", opacity: busy ? .6 : 1 }}>保存</button>
      </div>
    </div>
  );
}

export function CareerAdminTab() {
  const [rows, setRows] = useState([]);
  const [pub, setPub] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState(null); // { row? }
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/career", { credentials: "include" });
      const d = await r.json();
      setRows(d.items || []); setPub(!!d.public); setTableMissing(!!d.tableMissing);
    } catch { showToast("読み込めませんでした"); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const patch = async (body, okMsg) => {
    const r = await fetch("/api/admin/career", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { showToast(d.error || "保存できませんでした"); return null; }
    if (okMsg) showToast(okMsg, "success");
    return d;
  };
  const replace = (item) => setRows((rs) => { const i = rs.findIndex((x) => x.id === item.id); return i < 0 ? [item, ...rs] : rs.map((x) => (x.id === item.id ? item : x)); });
  const del = async (row) => {
    if (!confirm(`「${row.title}」を削除しますか？（終了・非表示にするだけなら状態を変えてください）`)) return;
    const r = await fetch("/api/admin/career", { method: "DELETE", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id }) });
    if (r.ok) setRows((rs) => rs.filter((x) => x.id !== row.id)); else showToast("削除できませんでした");
  };

  const now = Date.now();
  const activeCount = rows.filter((r) => r.status === "published" && (!r.deadline || Date.parse(`${r.deadline}T23:59:59+09:00`) >= now)).length;
  const shown = useMemo(() => rows.filter((r) => {
    if (filter === "check" ? !needsCheck(r) : filter !== "all" && r.status !== filter) return false;
    if (q && !`${r.title} ${r.org}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [rows, filter, q]);

  if (tableMissing) return <div style={{ padding: 24, fontSize: 13, color: T.txD, lineHeight: 1.8 }}>表 career_listings がまだありません。Supabase で supabase/career.sql を実行してください。</div>;

  return (
    <div style={{ padding: 16, maxWidth: 960 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12, padding: "10px 12px", borderRadius: 12, background: T.bg2, border: `1px solid ${T.bd}` }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: T.txH }}>{pub ? "一般に公開中" : "管理者だけに表示中"}</div>
          <div style={{ fontSize: 11.5, color: T.txD }}>有効な掲載 {activeCount} 件（公開の目安 {PUBLISH_GOAL} 件）。公開前に労働局・規約の確認を済ませること。</div>
        </div>
        <button onClick={async () => { const d = await patch({ action: "public", value: !pub }, pub ? "管理者だけに戻しました" : "公開しました"); if (d) { setPub(d.public); setCareerPublic(d.public); } }} style={{ padding: "8px 14px", borderRadius: 9, border: `1px solid ${pub ? T.bd : T.accent}`, background: pub ? T.bg : T.accent, color: pub ? T.txH : "#fff", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>{pub ? "非公開に戻す" : "一般に公開する"}</button>
      </div>

      {editing ? <Editor initial={editing} onCancel={() => setEditing(null)} onSaved={(item) => { replace(item); setEditing(null); showToast("保存しました", "success"); }} /> : (
        <button onClick={() => setEditing({})} style={{ marginBottom: 12, padding: "9px 16px", borderRadius: 10, border: "none", background: T.accent, color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>＋ 掲載を追加</button>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        {[["all", "すべて"], ["check", "要確認"], ...Object.entries(STATUS_LABEL)].map(([k, l]) => {
          const n = k === "all" ? rows.length : k === "check" ? rows.filter((r) => needsCheck(r)).length : rows.filter((r) => r.status === k).length;
          return <button key={k} onClick={() => setFilter(k)} style={{ padding: "5px 11px", borderRadius: 14, border: `1px solid ${filter === k ? T.accent : T.bd}`, background: filter === k ? `${T.accent}1f` : T.bg2, color: filter === k ? T.accent : T.txD, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{l} {n}</button>;
        })}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="タイトル・組織で絞る" style={{ ...inp, width: 200, marginLeft: "auto" }} />
      </div>

      {loading ? <div style={{ padding: 20, color: T.txD, fontSize: 13 }}>読み込み中…</div> : shown.length === 0 ? <div style={{ padding: 20, color: T.txD, fontSize: 13 }}>該当する掲載はありません</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {shown.map((r) => {
            const chk = needsCheck(r, now);
            const expired = r.deadline && Date.parse(`${r.deadline}T23:59:59+09:00`) < now;
            return (
              <div key={r.id} style={{ border: `1px solid ${T.bd}`, borderRadius: 11, padding: "9px 12px", background: T.bg2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10.5, fontWeight: 800, color: "#fff", background: STATUS_COLOR[r.status], borderRadius: 5, padding: "1px 6px" }}>{STATUS_LABEL[r.status]}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: T.txD }}>{KIND_LABEL[r.kind]}</span>
                  {r.promo && <span style={{ fontSize: 10.5, fontWeight: 800, color: "#b45309" }}>{r.promo === "pr" ? "PR" : "提携"}</span>}
                  {chk && <span style={{ fontSize: 10.5, fontWeight: 800, color: T.orange }}>要確認: {chk}</span>}
                  {expired && <span style={{ fontSize: 10.5, fontWeight: 800, color: T.txD }}>締切済み</span>}
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: T.txD }}>締切 {r.deadline || "随時"} ・ 確認 {new Date(r.checked_at).toLocaleDateString("ja-JP")}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.txH, marginTop: 3 }}>{r.title}</div>
                <div style={{ fontSize: 12, color: T.tx }}>{r.org} ・ <a href={r.apply_url} target="_blank" rel="noopener noreferrer" style={{ color: T.accent }}>応募先</a>{r.source !== "manual" && <span style={{ color: T.txD }}> ・ {r.source}</span>}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
                  {[
                    ["編集", () => setEditing({ row: r })],
                    ["確認した", async () => { const d = await patch({ id: r.id, action: "checked" }, "最終確認日を更新しました"); if (d) replace(d.item); }],
                    ...(r.status !== "published" ? [["掲載する", async () => { const d = await patch({ id: r.id, action: "status", status: "published" }); if (d) replace(d.item); }]] : []),
                    ...(r.status === "published" ? [["終了にする", async () => { const d = await patch({ id: r.id, action: "status", status: "closed" }); if (d) replace(d.item); }]] : []),
                    ...(r.status !== "hidden" ? [["非表示", async () => { const d = await patch({ id: r.id, action: "status", status: "hidden" }); if (d) replace(d.item); }]] : []),
                    ["削除", () => del(r)],
                  ].map(([l, fn]) => <button key={l} onClick={fn} style={{ padding: "4px 10px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg, color: l === "削除" ? T.red : T.txH, fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>{l}</button>)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
