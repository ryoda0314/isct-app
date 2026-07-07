import React, { useState } from "react";
import { T } from "../theme.js";
import { t } from "../i18n.js";
import { I } from "../icons.jsx";
import { Av } from "../shared.jsx";
import { ChatView } from "./ChatView.jsx";
import { useLanguages, useLanguageMembers } from "../hooks/useLanguages.js";
import { LANG_COMMUNITIES, roomIdForLang } from "../languages.js";

// 内製の簡易ヘッダーバー（App の MHdr は非公開なので独自定義）
const Bar = ({ title, sub, onBack, right }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: `1px solid ${T.bd}`, background: T.bg2, flexShrink: 0 }}>
    {onBack && <button onClick={onBack} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", display: "flex", padding: 0 }}>{I.back}</button>}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontWeight: 700, fontSize: 15, color: T.txH, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
      {sub && <div style={{ fontSize: 11, color: T.txD, marginTop: 1 }}>{sub}</div>}
    </div>
    {right}
  </div>
);

// 参加ロール選択モーダル
const JoinModal = ({ meta, current, onPick, onClose }) => {
  const roles = [
    { key: "learner", label: t("lang.learner"), desc: t("lang.learnerDesc"), col: T.accent },
    { key: "native", label: t("lang.native"), desc: t("lang.nativeDesc"), col: T.green },
  ];
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: T.bg2, borderRadius: 16, width: "100%", maxWidth: 360, border: `1px solid ${T.bdL}`, overflow: "hidden" }}>
        <div style={{ padding: "16px 18px 10px", textAlign: "center" }}>
          <div style={{ fontSize: 34 }}>{meta.flag}</div>
          <div style={{ fontWeight: 700, fontSize: 17, color: T.txH, marginTop: 4 }}>{meta.name}</div>
          <div style={{ fontSize: 12, color: T.txD, marginTop: 4 }}>{current ? t("lang.changeRolePrompt") : t("lang.chooseRole")}</div>
        </div>
        <div style={{ padding: "6px 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {roles.map((r) => {
            const on = current === r.key;
            return (
              <button key={r.key} onClick={() => onPick(r.key)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderRadius: 12, border: `1.5px solid ${on ? r.col : T.bd}`, background: on ? `${r.col}10` : T.bg3, cursor: "pointer", textAlign: "left" }}>
                <span style={{ width: 38, height: 38, borderRadius: 10, background: `${r.col}20`, color: r.col, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {r.key === "native" ? I.check : I.grad}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.txH }}>{r.label}{on && <span style={{ fontSize: 11, fontWeight: 500, color: r.col, marginLeft: 6 }}>{t("lang.current")}</span>}</div>
                  <div style={{ fontSize: 11.5, color: T.txD, marginTop: 2, lineHeight: 1.4 }}>{r.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// メンバー一覧パネル（右からのスライドイン）
const RosterPanel = ({ meta, members, onClose }) => {
  const learners = members.filter((m) => m.role === "learner");
  const natives = members.filter((m) => m.role === "native");
  const Section = ({ label, list, col }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: T.txD, letterSpacing: .5, textTransform: "uppercase", padding: "0 4px 6px" }}>{label} — {list.length}</div>
      {list.map((m) => (
        <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 4px" }}>
          <Av u={{ name: m.name, av: m.avatar, col: m.color }} sz={26} uid={m.id} />
          <span style={{ fontSize: 13, color: T.txH, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{m.name}</span>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: col }} />
        </div>
      ))}
      {list.length === 0 && <div style={{ fontSize: 12, color: T.txD, padding: "2px 4px" }}>—</div>}
    </div>
  );
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 200, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 300, maxWidth: "85vw", background: T.bg2, borderLeft: `1px solid ${T.bd}`, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderBottom: `1px solid ${T.bd}` }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: T.txH }}>{meta.flag} {t("lang.members")} ({members.length})</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", display: "flex" }}>{I.x}</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
          <Section label={t("lang.natives")} list={natives} col={T.green} />
          <Section label={t("lang.learners")} list={learners} col={T.accent} />
        </div>
      </div>
    </div>
  );
};

// 一言語のルーム（ヘッダー＋グループチャット）
const LangRoom = ({ meta, myRole, mob, onBack, onChangeRole, onLeave }) => {
  const [roster, setRoster] = useState(false);
  const [menu, setMenu] = useState(false);
  const { members, roleMap } = useLanguageMembers(meta.code, true);
  const total = members.length;
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
      <Bar
        title={<span><span style={{ marginRight: 6 }}>{meta.flag}</span>{meta.name}</span>}
        sub={t("lang.roomSub", { n: total })}
        onBack={onBack}
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 4, position: "relative" }}>
            <button onClick={() => setRoster(true)} title={t("lang.members")} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", display: "flex", position: "relative", padding: 4 }}>
              {I.users}
              {total > 0 && <span style={{ position: "absolute", top: -2, right: -4, minWidth: 14, height: 14, borderRadius: 7, background: meta.col, color: "#fff", fontSize: 8, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>{total}</span>}
            </button>
            <button onClick={() => setMenu((v) => !v)} style={{ background: "none", border: "none", color: menu ? T.accent : T.txD, cursor: "pointer", display: "flex", padding: 4 }}>{I.more}</button>
            {menu && <>
              <div onClick={() => setMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 10 }} />
              <div style={{ position: "absolute", top: 34, right: 0, background: T.bg2, border: `1px solid ${T.bd}`, borderRadius: 10, padding: 6, zIndex: 11, boxShadow: "0 4px 16px rgba(0,0,0,.25)", minWidth: 170 }}>
                <div onClick={() => { setMenu(false); onChangeRole(); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, color: T.txH }}>
                  <span style={{ color: T.txD, display: "flex" }}>{I.setting}</span>{t("lang.changeRole")}
                </div>
                <div onClick={() => { setMenu(false); onLeave(); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, color: T.red }}>
                  <span style={{ display: "flex" }}>{I.x}</span>{t("lang.leave")}
                </div>
              </div>
            </>}
          </div>
        }
      />
      <ChatView roomId={roomIdForLang(meta.code)} roleMap={roleMap} mob={mob} />
      {roster && <RosterPanel meta={meta} members={members} onClose={() => setRoster(false)} />}
    </div>
  );
};

// 言語カード（一覧）
const LangCard = ({ meta, count, myRole, onOpen, onJoin }) => {
  const learners = count?.learner || 0;
  const natives = count?.native || 0;
  const joined = !!myRole;
  return (
    <div onClick={() => (joined ? onOpen() : onJoin())}
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderRadius: 14, border: `1px solid ${joined ? meta.col + "55" : T.bd}`, background: joined ? `${meta.col}0c` : T.bg2, cursor: "pointer", transition: "all .12s" }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: `${meta.col}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>{meta.flag}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: T.txH, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta.name}</span>
          {joined && <span style={{ fontSize: 9, fontWeight: 700, color: myRole === "native" ? T.green : T.accent, background: `${myRole === "native" ? T.green : T.accent}18`, border: `1px solid ${myRole === "native" ? T.green : T.accent}44`, borderRadius: 4, padding: "0 5px", lineHeight: "15px" }}>{myRole === "native" ? t("lang.native") : t("lang.learner")}</span>}
        </div>
        <div style={{ fontSize: 11.5, color: T.txD, marginTop: 3 }}>
          {t("lang.learners")} {learners} · {t("lang.natives")} {natives}
        </div>
      </div>
      {joined
        ? <span style={{ color: T.txD, display: "flex", flexShrink: 0 }}>{I.arr}</span>
        : <span style={{ fontSize: 12, fontWeight: 700, color: meta.col, background: `${meta.col}18`, border: `1px solid ${meta.col}44`, borderRadius: 8, padding: "6px 12px", flexShrink: 0, whiteSpace: "nowrap" }}>{t("lang.join")}</span>}
    </div>
  );
};

export const LanguagesView = ({ mob, onBack }) => {
  const { counts, mine, join, leave } = useLanguages();
  const [open, setOpen] = useState(null);      // 開いている言語コード
  const [joinTarget, setJoinTarget] = useState(null); // ロール選択中の言語コード

  const openMeta = open ? LANG_COMMUNITIES.find((l) => l.code === open) : null;
  const joinMeta = joinTarget ? LANG_COMMUNITIES.find((l) => l.code === joinTarget) : null;

  // ── ルーム画面 ──
  if (openMeta) {
    return (
      <>
        <LangRoom
          meta={openMeta}
          myRole={mine[openMeta.code]}
          mob={mob}
          onBack={() => setOpen(null)}
          onChangeRole={() => setJoinTarget(openMeta.code)}
          onLeave={async () => {
            if (typeof window !== "undefined" && !window.confirm(t("lang.leaveConfirm", { name: openMeta.name }))) return;
            await leave(openMeta.code);
            setOpen(null);
          }}
        />
        {joinMeta && (
          <JoinModal
            meta={joinMeta}
            current={mine[joinMeta.code]}
            onClose={() => setJoinTarget(null)}
            onPick={async (role) => { await join(joinMeta.code, role); setJoinTarget(null); }}
          />
        )}
      </>
    );
  }

  // ── 一覧画面 ──
  const joinedCount = Object.keys(mine).length;
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
      {mob && <Bar title={t("nav.languages")} onBack={onBack} />}
      <div style={{ flex: 1, overflowY: "auto", padding: mob ? "12px 12px 24px" : "16px 18px 28px" }}>
        <div style={{ maxWidth: 620, margin: "0 auto" }}>
          <div style={{ fontSize: 13, color: T.txD, lineHeight: 1.6, marginBottom: 16 }}>{t("lang.subtitle")}</div>
          {joinedCount > 0 && <div style={{ fontSize: 10, fontWeight: 700, color: T.txD, letterSpacing: .5, textTransform: "uppercase", margin: "4px 2px 8px" }}>{t("lang.joined")}</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {LANG_COMMUNITIES.filter((l) => mine[l.code]).map((meta) => (
              <LangCard key={meta.code} meta={meta} count={counts[meta.code]} myRole={mine[meta.code]}
                onOpen={() => setOpen(meta.code)} onJoin={() => setJoinTarget(meta.code)} />
            ))}
          </div>
          {joinedCount > 0 && <div style={{ fontSize: 10, fontWeight: 700, color: T.txD, letterSpacing: .5, textTransform: "uppercase", margin: "18px 2px 8px" }}>{t("lang.discover")}</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {LANG_COMMUNITIES.filter((l) => !mine[l.code]).map((meta) => (
              <LangCard key={meta.code} meta={meta} count={counts[meta.code]} myRole={null}
                onOpen={() => setOpen(meta.code)} onJoin={() => setJoinTarget(meta.code)} />
            ))}
          </div>
        </div>
      </div>
      {joinMeta && (
        <JoinModal
          meta={joinMeta}
          current={mine[joinMeta.code]}
          onClose={() => setJoinTarget(null)}
          onPick={async (role) => {
            const code = joinMeta.code;
            await join(code, role);
            setJoinTarget(null);
            setOpen(code); // 参加したらそのままルームへ
          }}
        />
      )}
    </div>
  );
};
