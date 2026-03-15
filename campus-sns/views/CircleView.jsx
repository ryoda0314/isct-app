import { useState, useEffect, useRef, useCallback } from 'react';
import { T } from '../theme.js';
import { I } from '../icons.jsx';
import { Av, Tx } from '../shared.jsx';
import { fTs } from '../utils.jsx';
import { useCurrentUser } from '../hooks/useCurrentUser.js';
import { useTyping } from '../hooks/useTyping.js';

/* ── Mobile Header ── */
const Hdr = ({ title, back, right }) => (
  <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', minHeight: 46, borderBottom: `1px solid ${T.bd}`, flexShrink: 0, background: T.bg2 }}>
    {back && <button onClick={back} style={{ background: 'none', border: 'none', color: T.txD, cursor: 'pointer', display: 'flex', padding: 4, flexShrink: 0 }}>{I.back}</button>}
    <h1 style={{ flex: 1, margin: 0, fontSize: 16, fontWeight: 700, color: T.txH, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>{title}</h1>
    {right}
  </header>
);

/* ── Member row ── */
const MemberRow = ({ m, sz = 24 }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px' }}>
    <Av u={{ name: m.name, av: m.avatar, col: m.color }} sz={sz} />
    <span style={{ fontSize: 12, color: T.txH, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
    {m.role === 'admin' && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: `${T.accent}20`, color: T.accent, fontWeight: 600 }}>管理者</span>}
  </div>
);

/* ── Swipe back hook ── */
const useSwipeBack = (onBack, enabled = true) => {
  const touchRef = useRef({ sx: 0, sy: 0, moving: false });
  const onTS = useCallback(e => {
    if (!enabled) return;
    const t = e.touches[0];
    if (t.clientX < 30) touchRef.current = { sx: t.clientX, sy: t.clientY, moving: true };
  }, [enabled]);
  const onTE = useCallback(e => {
    if (!touchRef.current.moving) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchRef.current.sx;
    const dy = Math.abs(t.clientY - touchRef.current.sy);
    touchRef.current.moving = false;
    if (dx > 80 && dy < 100) onBack();
  }, [onBack]);
  return { onTouchStart: onTS, onTouchEnd: onTE };
};

/* ── Slide panel wrapper ── */
const ANIM = '0.32s cubic-bezier(0.4,0,0.2,1)';
const Panel = ({ show, active, direction, children }) => {
  // Don't render at all if never shown
  if (!show && !active) return null;
  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      transform: active ? 'translateX(0)' : direction === 'left' ? 'translateX(-25%)' : 'translateX(100%)',
      opacity: active ? 1 : direction === 'left' ? 0.3 : 1,
      transition: `transform ${ANIM}, opacity ${ANIM}`,
      pointerEvents: active ? 'auto' : 'none',
      zIndex: active ? 2 : direction === 'left' ? 0 : 1,
      background: T.bg,
      willChange: 'transform, opacity',
      overflow: 'hidden',
    }}>
      {children}
    </div>
  );
};

/* ── Circle icon renderer (supports image URL or text/emoji) ── */
const isUrl = (s) => typeof s === 'string' && (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:'));
const CIcon = ({ icon, color, sz = 56, radius = 16, border, style: sx }) => {
  const base = { width: sz, height: sz, borderRadius: radius, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: sz * 0.4, fontWeight: 700, flexShrink: 0, overflow: 'hidden', ...sx };
  if (border) base.border = border;
  if (isUrl(icon)) return <div style={base}><img src={icon} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>;
  return <div style={base}>{icon || '?'}</div>;
};

/* ── Appearance Edit Modal ── */
const COLOR_PRESETS = ['#6375f0','#e5534b','#3dae72','#d4843e','#a855c7','#2d9d8f','#c6a236','#c75d8e','#5b8ff9','#f06292','#4db6ac','#ff8a65'];

const EditAppearModal = ({ data, onSave, onClose }) => {
  const [icon, setIcon] = useState(data.icon || '');
  const [color, setColor] = useState(data.color || '#6375f0');
  const [banner, setBanner] = useState(data.banner || '');
  const fileRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setIcon(ev.target.result);
    reader.readAsDataURL(file);
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 360, maxHeight: '90vh', borderRadius: 16, background: T.bg2, border: `1px solid ${T.bd}`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Preview */}
        <div style={{ position: 'relative', height: 80, flexShrink: 0, background: banner ? `url(${banner}) center/cover` : `linear-gradient(135deg, ${color}, ${color}aa)` }}>
          <CIcon icon={icon} color={color} sz={52} radius={14} border={`3px solid ${T.bg2}`} style={{ position: 'absolute', bottom: -22, left: 16, boxShadow: '0 2px 8px rgba(0,0,0,.2)' }} />
        </div>
        <div style={{ padding: '30px 16px 16px', overflowY: 'auto', flex: 1 }}>
          {/* Icon */}
          <label style={{ fontSize: 12, fontWeight: 600, color: T.txD, display: 'block', marginBottom: 8 }}>アイコン画像</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button onClick={() => fileRef.current?.click()} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 0', borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              {I.img} 写真を選択
            </button>
            {isUrl(icon) && <button onClick={() => setIcon(data.icon && !isUrl(data.icon) ? data.icon : '')} style={{ padding: '10px 14px', borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg3, color: T.red, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>削除</button>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
          {!isUrl(icon) && (
            <input value={icon} onChange={e => setIcon(e.target.value)} placeholder="または絵文字・テキスト（例: P）" maxLength={2} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 16, outline: 'none', fontFamily: 'inherit', marginBottom: 14, boxSizing: 'border-box' }} />
          )}
          {isUrl(icon) && <div style={{ marginBottom: 14 }} />}

          {/* Color */}
          <label style={{ fontSize: 12, fontWeight: 600, color: T.txD, display: 'block', marginBottom: 6 }}>テーマカラー</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {COLOR_PRESETS.map(c => (
              <button key={c} onClick={() => setColor(c)} style={{ width: 32, height: 32, borderRadius: 8, background: c, border: color === c ? '3px solid #fff' : '2px solid transparent', cursor: 'pointer', boxShadow: color === c ? `0 0 0 2px ${c}` : 'none' }} />
            ))}
          </div>

          {/* Banner */}
          <label style={{ fontSize: 12, fontWeight: 600, color: T.txD, display: 'block', marginBottom: 6 }}>ヘッダー画像 (URL)</label>
          <input value={banner} onChange={e => setBanner(e.target.value)} placeholder="https://..." style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 14, outline: 'none', fontFamily: 'inherit', marginBottom: 16, boxSizing: 'border-box' }} />

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: `1px solid ${T.bd}`, background: 'transparent', color: T.txD, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>キャンセル</button>
            <button onClick={() => { onSave({ icon, color, banner }); onClose(); }} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: T.accent, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>保存</button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── Inline text field ── */
const Field = ({ label, value, onChange, placeholder, multiline, type }) => (
  <div style={{ marginBottom: 14 }}>
    <label style={{ fontSize: 12, fontWeight: 600, color: T.txD, display: 'block', marginBottom: 5 }}>{label}</label>
    {multiline ? (
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 15, outline: 'none', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
    ) : (
      <input type={type || 'text'} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 15, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
    )}
  </div>
);

/* ── Stat pill ── */
const Stat = ({ label, value, color }) => (
  <div style={{ flex: 1, padding: '10px 0', textAlign: 'center', borderRadius: 10, background: `${color}10` }}>
    <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
    <div style={{ fontSize: 10, color: T.txD, marginTop: 2 }}>{label}</div>
  </div>
);

/* ── Toggle switch ── */
const Toggle = ({ on, onToggle, label }) => (
  <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', cursor: 'pointer' }}>
    <span style={{ fontSize: 14, color: T.txH }}>{label}</span>
    <div style={{ width: 44, height: 24, borderRadius: 12, background: on ? T.accent : T.bg4, transition: 'background .2s', padding: 2, boxSizing: 'border-box' }}>
      <div style={{ width: 20, height: 20, borderRadius: 10, background: '#fff', transform: on ? 'translateX(20px)' : 'translateX(0)', transition: 'transform .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
    </div>
  </div>
);

/* ── Admin full-page panel ── */
const ADMIN_PAGES = [
  { id: 'info',     icon: I.pen,            color: '#6375f0', label: '基本情報',       sub: 'サークル名・説明・外観' },
  { id: 'channels', icon: I.chat,           color: '#5b8ff9', label: 'チャンネル管理', sub: '追加・編集・削除' },
  { id: 'announce', icon: I.bell,           color: '#d4843e', label: 'お知らせ管理',   sub: '投稿・編集・ピン留め' },
  { id: 'events',   icon: I.event || I.cal, color: '#3dae72', label: 'イベント管理',   sub: '作成・編集・参加者' },
  { id: 'recruit',  icon: I.mega,           color: '#a855c7', label: '募集管理',       sub: '作成・編集・開閉' },
  { id: 'members',  icon: I.users,          color: '#c75d8e', label: 'メンバー管理',   sub: '権限変更・除名' },
  { id: 'applications', icon: I.inbox,     color: '#2d9d8f', label: '参加申請',       sub: '承認・却下' },
  { id: 'fees',     icon: I.yen,           color: '#c6a236', label: '会費管理',       sub: 'プラン・回収・期間' },
  { id: 'danger',   icon: I.x,             color: '#e5534b', label: '危険な操作',     sub: 'サークル削除' },
];

const AdminSection = ({ sc, updateCircle, setEditAppear, addChannel, deleteChannel, leaveCircle, backToList, user }) => {
  const [page, setPage] = useState(null);

  const uid = user?.moodleId || user?.id;
  const cardS = { padding: '14px 16px', borderRadius: 14, background: T.bg2, border: `1px solid ${T.bd}`, marginBottom: 8 };
  const btnPrimary = (enabled) => ({ width: '100%', padding: '12px 0', borderRadius: 10, border: 'none', background: enabled ? T.accent : T.bg4, color: enabled ? '#fff' : T.txD, fontSize: 14, fontWeight: 600, cursor: enabled ? 'pointer' : 'default' });
  const btnDel = { background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: T.red, opacity: 0.5, display: 'flex' };

  const counts = { channels: sc.channels?.length || 0, announce: sc.announcements?.length || 0, events: sc.events?.length || 0, recruit: sc.recruit?.length || 0, members: sc.members?.length || 0, applications: sc.applications?.filter(a => a.status === 'pending').length || 0, fees: sc.feePlans?.length || 0 };

  /* ── Admin Menu (top level) ── */
  if (!page) return (
    <div style={{ padding: '8px 14px 24px' }}>
      <div style={{ textAlign: 'center', padding: '16px 0 12px' }}>
        <CIcon icon={sc.icon} color={sc.color} sz={52} radius={16} style={{ margin: '0 auto 8px', boxShadow: '0 2px 10px rgba(0,0,0,.15)' }} />
        <div style={{ fontWeight: 700, fontSize: 17, color: T.txH }}>{sc.name}</div>
        <div style={{ fontSize: 12, color: T.txD, marginTop: 2 }}>管理者設定</div>
      </div>
      {/* Stats overview */}
      <div style={{ display: 'flex', gap: 8, margin: '8px 0 18px' }}>
        <Stat label="チャンネル" value={counts.channels} color="#5b8ff9" />
        <Stat label="メンバー" value={counts.members} color="#c75d8e" />
        <Stat label="イベント" value={counts.events} color="#3dae72" />
        <Stat label="募集" value={counts.recruit} color="#a855c7" />
      </div>
      {ADMIN_PAGES.map(p => {
        const cnt = counts[p.id];
        return (
          <button key={p.id} onClick={() => setPage(p.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 14, border: `1px solid ${T.bd}`, background: T.bg2, cursor: 'pointer', textAlign: 'left', marginBottom: 8, WebkitTapHighlightColor: 'transparent' }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: `${p.color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: p.color, flexShrink: 0 }}>{p.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.txH }}>{p.label}</div>
              <div style={{ fontSize: 11, color: T.txD, marginTop: 1 }}>{p.sub}</div>
            </div>
            {cnt != null && <span style={{ fontSize: 12, fontWeight: 600, color: T.txD, minWidth: 20, textAlign: 'center' }}>{cnt}</span>}
            <span style={{ color: T.txD, opacity: 0.4, display: 'flex' }}>{I.arr}</span>
          </button>
        );
      })}
    </div>
  );

  /* ── Sub-page header ── */
  const pg = ADMIN_PAGES.find(p => p.id === page);
  const SubHdr = () => (
    <div style={{ padding: '12px 14px', borderBottom: `1px solid ${T.bd}`, display: 'flex', alignItems: 'center', gap: 8, background: T.bg2, flexShrink: 0 }}>
      <button onClick={() => setPage(null)} style={{ background: 'none', border: 'none', color: T.txD, cursor: 'pointer', display: 'flex', padding: 2 }}>{I.back}</button>
      <div style={{ width: 26, height: 26, borderRadius: 7, background: `${pg.color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: pg.color }}>{pg.icon}</div>
      <span style={{ fontWeight: 700, fontSize: 15, color: T.txH }}>{pg.label}</span>
    </div>
  );

  /* ── 基本情報 ── */
  if (page === 'info') return <AdminInfo sc={sc} updateCircle={updateCircle} setEditAppear={setEditAppear} SubHdr={SubHdr} cardS={cardS} btnPrimary={btnPrimary} />;

  /* ── チャンネル管理 ── */
  if (page === 'channels') return <AdminChannels sc={sc} addChannel={addChannel} deleteChannel={deleteChannel} updateCircle={updateCircle} SubHdr={SubHdr} cardS={cardS} btnPrimary={btnPrimary} btnDel={btnDel} />;

  /* ── お知らせ管理 ── */
  if (page === 'announce') return <AdminAnnounce sc={sc} updateCircle={updateCircle} user={user} SubHdr={SubHdr} cardS={cardS} btnPrimary={btnPrimary} btnDel={btnDel} />;

  /* ── イベント管理 ── */
  if (page === 'events') return <AdminEvents sc={sc} updateCircle={updateCircle} SubHdr={SubHdr} cardS={cardS} btnPrimary={btnPrimary} btnDel={btnDel} />;

  /* ── 募集管理 ── */
  if (page === 'recruit') return <AdminRecruit sc={sc} updateCircle={updateCircle} SubHdr={SubHdr} cardS={cardS} btnPrimary={btnPrimary} btnDel={btnDel} />;

  /* ── メンバー管理 ── */
  if (page === 'members') return <AdminMembers sc={sc} updateCircle={updateCircle} uid={uid} SubHdr={SubHdr} cardS={cardS} btnDel={btnDel} />;

  /* ── 参加申請 ── */
  if (page === 'applications') return <AdminApplications sc={sc} updateCircle={updateCircle} user={user} SubHdr={SubHdr} cardS={cardS} btnPrimary={btnPrimary} btnDel={btnDel} />;

  /* ── 会費管理 ── */
  if (page === 'fees') return <AdminFees sc={sc} updateCircle={updateCircle} user={user} SubHdr={SubHdr} cardS={cardS} btnPrimary={btnPrimary} btnDel={btnDel} />;

  /* ── 危険な操作 ── */
  if (page === 'danger') return <AdminDanger sc={sc} leaveCircle={leaveCircle} backToList={backToList} SubHdr={SubHdr} />;

  return null;
};

/* ── Admin sub-pages ── */
const AdminInfo = ({ sc, updateCircle, setEditAppear, SubHdr, cardS, btnPrimary }) => {
  const [name, setName] = useState(sc.name);
  const [desc, setDesc] = useState(sc.desc || '');
  const [saved, setSaved] = useState(false);
  const [isPublic, setIsPublic] = useState(sc.isPublic !== false);
  const [allowInvite, setAllowInvite] = useState(sc.allowInvite !== false);
  const save = () => {
    if (!name.trim()) return;
    updateCircle(sc.id, { name: name.trim(), desc: desc.trim(), isPublic, allowInvite });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };
  return (<div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <SubHdr />
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px 24px' }}>
      {/* Banner preview */}
      <div onClick={() => setEditAppear({ icon: sc.icon, color: sc.color, banner: sc.banner || '' })} style={{ cursor: 'pointer', borderRadius: 14, overflow: 'hidden', marginBottom: 16, position: 'relative', border: `1px solid ${T.bd}` }}>
        <div style={{ height: 70, background: sc.banner ? `url(${sc.banner}) center/cover` : `linear-gradient(135deg, ${sc.color}dd, ${sc.color}55)` }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: T.bg2 }}>
          <CIcon icon={sc.icon} color={sc.color} sz={40} radius={12} style={{ marginTop: -24, border: `2px solid ${T.bg2}`, boxShadow: '0 2px 6px rgba(0,0,0,.15)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.txH }}>{sc.name}</div>
            <div style={{ fontSize: 11, color: T.txD }}>{sc.members?.length || 0}人</div>
          </div>
          <div style={{ padding: '4px 10px', borderRadius: 6, background: `${T.accent}14`, color: T.accent, fontSize: 11, fontWeight: 600 }}>外観変更</div>
        </div>
      </div>

      {/* Name & desc */}
      <div style={cardS}>
        <Field label="サークル名" value={name} onChange={setName} placeholder="サークル名" />
        <Field label="紹介文" value={desc} onChange={setDesc} placeholder="サークルの説明を入力（探すページに表示されます）" multiline />
      </div>

      {/* Settings toggles */}
      <div style={{ ...cardS, padding: '6px 16px' }}>
        <Toggle on={isPublic} onToggle={() => setIsPublic(p => !p)} label="サークルを公開" />
        <div style={{ height: 1, background: T.bd }} />
        <Toggle on={allowInvite} onToggle={() => setAllowInvite(p => !p)} label="メンバーの招待を許可" />
      </div>
      <div style={{ fontSize: 11, color: T.txD, padding: '4px 4px 14px', lineHeight: 1.5 }}>
        公開サークルは「探す」ページに表示されます。非公開の場合は招待リンクでのみ参加できます。
      </div>

      <button onClick={save} disabled={!name.trim()} style={btnPrimary(name.trim())}>{saved ? '✓ 保存しました' : '変更を保存'}</button>
    </div>
  </div>);
};

const AdminChannels = ({ sc, addChannel, deleteChannel, updateCircle, SubHdr, cardS, btnPrimary, btnDel }) => {
  const [name, setName] = useState('');
  const [catName, setCatName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editVal, setEditVal] = useState('');
  const add = () => { if (!name.trim()) return; addChannel(sc.id, name); setName(''); };
  const addCat = () => {
    if (!catName.trim()) return;
    updateCircle(sc.id, { categories: [...(sc.categories || []), { id: `cat_${Date.now()}`, name: catName.trim() }] });
    setCatName('');
  };
  const delCat = (id) => {
    updateCircle(sc.id, {
      categories: (sc.categories || []).filter(c => c.id !== id),
      channels: (sc.channels || []).map(ch => ch.categoryId === id ? { ...ch, categoryId: undefined } : ch),
    });
  };
  const renameCh = (chId) => {
    if (!editVal.trim()) return;
    updateCircle(sc.id, { channels: (sc.channels || []).map(ch => ch.id === chId ? { ...ch, name: editVal.trim().toLowerCase().replace(/\s+/g, '-') } : ch) });
    setEditingId(null); setEditVal('');
  };
  const setCat = (chId, catId) => {
    updateCircle(sc.id, { channels: (sc.channels || []).map(ch => ch.id === chId ? { ...ch, categoryId: catId || undefined } : ch) });
  };
  const cats = sc.categories || [];
  const uncategorized = (sc.channels || []).filter(ch => !ch.categoryId || !cats.find(c => c.id === ch.categoryId));
  return (<div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <SubHdr />
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px 24px' }}>
      {/* Add channel */}
      <div style={{ ...cardS, marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 10 }}>チャンネルを追加</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="チャンネル名" style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 15, outline: 'none' }} />
          <button onClick={add} disabled={!name.trim()} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: name.trim() ? T.accent : T.bg4, color: name.trim() ? '#fff' : T.txD, fontSize: 14, fontWeight: 600, cursor: name.trim() ? 'pointer' : 'default' }}>追加</button>
        </div>
      </div>
      {/* Add category */}
      <div style={{ ...cardS, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 10 }}>カテゴリを追加</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={catName} onChange={e => setCatName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCat()} placeholder="カテゴリ名（例: 開発, 雑談）" style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 15, outline: 'none' }} />
          <button onClick={addCat} disabled={!catName.trim()} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: catName.trim() ? '#5b8ff9' : T.bg4, color: catName.trim() ? '#fff' : T.txD, fontSize: 14, fontWeight: 600, cursor: catName.trim() ? 'pointer' : 'default' }}>追加</button>
        </div>
      </div>

      {/* Categories + channels */}
      {cats.map(cat => {
        const chsInCat = (sc.channels || []).filter(ch => ch.categoryId === cat.id);
        return (
          <div key={cat.id} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 2px', marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: T.txD, letterSpacing: 0.5, flex: 1, textTransform: 'uppercase' }}>{cat.name} ({chsInCat.length})</span>
              <button onClick={() => delCat(cat.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.txD, opacity: 0.4, display: 'flex', padding: 2, fontSize: 10 }}>{I.x}</button>
            </div>
            {chsInCat.map(ch => (
              <ChannelRow key={ch.id} ch={ch} sc={sc} cats={cats} editingId={editingId} editVal={editVal} setEditingId={setEditingId} setEditVal={setEditVal} renameCh={renameCh} setCat={setCat} deleteChannel={deleteChannel} cardS={cardS} btnDel={btnDel} />
            ))}
            {chsInCat.length === 0 && <div style={{ padding: '8px 10px', fontSize: 12, color: T.txD }}>チャンネルなし</div>}
          </div>
        );
      })}
      {/* Uncategorized */}
      {uncategorized.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {cats.length > 0 && <div style={{ fontSize: 11, fontWeight: 700, color: T.txD, letterSpacing: 0.5, padding: '6px 2px', marginBottom: 4 }}>未分類 ({uncategorized.length})</div>}
          {!cats.length && <div style={{ fontSize: 11, fontWeight: 700, color: T.txD, letterSpacing: 0.5, padding: '6px 2px', marginBottom: 4 }}>チャンネル一覧 ({uncategorized.length})</div>}
          {uncategorized.map(ch => (
            <ChannelRow key={ch.id} ch={ch} sc={sc} cats={cats} editingId={editingId} editVal={editVal} setEditingId={setEditingId} setEditVal={setEditVal} renameCh={renameCh} setCat={setCat} deleteChannel={deleteChannel} cardS={cardS} btnDel={btnDel} />
          ))}
        </div>
      )}
    </div>
  </div>);
};

const ChannelRow = ({ ch, sc, cats, editingId, editVal, setEditingId, setEditVal, renameCh, setCat, deleteChannel, cardS, btnDel }) => (
  <div style={{ ...cardS, padding: editingId === ch.id ? '12px 14px' : '10px 14px' }}>
    {editingId === ch.id ? (
      <div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input value={editVal} onChange={e => setEditVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && renameCh(ch.id)} style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 14, outline: 'none' }} autoFocus />
          <button onClick={() => renameCh(ch.id)} style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: T.accent, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>保存</button>
          <button onClick={() => setEditingId(null)} style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${T.bd}`, background: 'transparent', color: T.txD, fontSize: 12, cursor: 'pointer' }}>×</button>
        </div>
        {cats.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, color: T.txD, alignSelf: 'center', marginRight: 2 }}>カテゴリ:</span>
            <button onClick={() => setCat(ch.id, undefined)} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: `1px solid ${!ch.categoryId ? T.accent : T.bd}`, background: !ch.categoryId ? `${T.accent}18` : 'transparent', color: !ch.categoryId ? T.accent : T.txD, cursor: 'pointer' }}>なし</button>
            {cats.map(c => (
              <button key={c.id} onClick={() => setCat(ch.id, c.id)} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: `1px solid ${ch.categoryId === c.id ? T.accent : T.bd}`, background: ch.categoryId === c.id ? `${T.accent}18` : 'transparent', color: ch.categoryId === c.id ? T.accent : T.txD, cursor: 'pointer' }}>{c.name}</button>
            ))}
          </div>
        )}
      </div>
    ) : (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 28, height: 28, borderRadius: 7, background: `${T.accent}10`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.accent, fontSize: 15, fontWeight: 700, flexShrink: 0 }}>#</span>
        <span style={{ flex: 1, fontSize: 14, color: T.txH, fontWeight: 500 }}>{ch.name}</span>
        <button onClick={() => { setEditingId(ch.id); setEditVal(ch.name); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.txD, opacity: 0.4, display: 'flex', padding: 2 }}>{I.pen}</button>
        {ch.name !== 'general' ? (
          <button onClick={() => deleteChannel(sc.id, ch.id)} style={btnDel}>{I.x}</button>
        ) : (
          <span style={{ fontSize: 10, color: T.txD, padding: '2px 6px', borderRadius: 4, background: T.bg3 }}>既定</span>
        )}
      </div>
    )}
  </div>
);

const AdminAnnounce = ({ sc, updateCircle, user, SubHdr, cardS, btnPrimary, btnDel }) => {
  const [text, setText] = useState('');
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState('');
  const add = () => {
    if (!text.trim()) return;
    updateCircle(sc.id, { announcements: [{ id: `ann_${Date.now()}`, text: text.trim(), by: user?.name || '管理者', ts: new Date(), pinned: false }, ...(sc.announcements || [])] });
    setText('');
  };
  const del = (id) => updateCircle(sc.id, { announcements: (sc.announcements || []).filter(a => a.id !== id) });
  const togglePin = (id) => updateCircle(sc.id, { announcements: (sc.announcements || []).map(a => a.id === id ? { ...a, pinned: !a.pinned } : a) });
  const saveEdit = (id) => {
    if (!editText.trim()) return;
    updateCircle(sc.id, { announcements: (sc.announcements || []).map(a => a.id === id ? { ...a, text: editText.trim() } : a) });
    setEditId(null); setEditText('');
  };
  const pinned = (sc.announcements || []).filter(a => a.pinned);
  const unpinned = (sc.announcements || []).filter(a => !a.pinned);
  const renderAnn = (a) => (
    <div key={a.id} style={{ ...cardS, position: 'relative' }}>
      {a.pinned && <div style={{ fontSize: 10, fontWeight: 600, color: T.accent, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 3 }}>{I.pin} ピン留め</div>}
      {editId === a.id ? (
        <div>
          <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={3} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 14, outline: 'none', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', marginBottom: 8 }} autoFocus />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setEditId(null)} style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: `1px solid ${T.bd}`, background: 'transparent', color: T.txD, fontSize: 13, cursor: 'pointer' }}>キャンセル</button>
            <button onClick={() => saveEdit(a.id)} style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', background: T.accent, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>保存</button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 14, color: T.txH, lineHeight: 1.6 }}>{a.text}</div>
          <div style={{ fontSize: 11, color: T.txD, marginTop: 6 }}>{a.by} · {(a.ts instanceof Date ? a.ts : new Date(a.ts)).toLocaleDateString('ja')}</div>
          <div style={{ display: 'flex', gap: 4, marginTop: 8, borderTop: `1px solid ${T.bd}`, paddingTop: 8 }}>
            <button onClick={() => togglePin(a.id)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: `1px solid ${a.pinned ? T.accent : T.bd}`, background: a.pinned ? `${T.accent}14` : 'transparent', color: a.pinned ? T.accent : T.txD, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>{I.pin} {a.pinned ? 'ピン解除' : 'ピン留め'}</button>
            <button onClick={() => { setEditId(a.id); setEditText(a.text); }} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: `1px solid ${T.bd}`, background: 'transparent', color: T.txD, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>{I.pen} 編集</button>
            <div style={{ flex: 1 }} />
            <button onClick={() => del(a.id)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: `1px solid ${T.red}30`, background: 'transparent', color: T.red, cursor: 'pointer' }}>削除</button>
          </div>
        </>
      )}
    </div>
  );
  return (<div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <SubHdr />
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px 24px' }}>
      <div style={{ ...cardS, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 10 }}>新しいお知らせを投稿</div>
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="お知らせ内容を入力..." rows={3} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 15, outline: 'none', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', marginBottom: 10 }} />
        <button onClick={add} disabled={!text.trim()} style={btnPrimary(text.trim())}>投稿する</button>
      </div>
      {pinned.length > 0 && <>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.accent, letterSpacing: 0.5, marginBottom: 8, padding: '0 2px', display: 'flex', alignItems: 'center', gap: 4 }}>{I.pin} ピン留め ({pinned.length})</div>
        {pinned.map(renderAnn)}
      </>}
      <div style={{ fontSize: 11, fontWeight: 700, color: T.txD, letterSpacing: 0.5, marginBottom: 8, marginTop: pinned.length ? 12 : 0, padding: '0 2px' }}>すべて ({unpinned.length})</div>
      {unpinned.length === 0 && pinned.length === 0 && <div style={{ textAlign: 'center', padding: 24, color: T.txD, fontSize: 13 }}>お知らせはまだありません</div>}
      {unpinned.map(renderAnn)}
    </div>
  </div>);
};

const AdminEvents = ({ sc, updateCircle, SubHdr, cardS, btnPrimary, btnDel }) => {
  const [f, setF] = useState({ title: '', date: '', location: '', desc: '' });
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [editId, setEditId] = useState(null);
  const [ef, setEf] = useState({ title: '', date: '', location: '', desc: '' });
  const add = () => {
    if (!f.title.trim() || !f.date) return;
    updateCircle(sc.id, { events: [...(sc.events || []), { id: `cev_${Date.now()}`, title: f.title.trim(), date: new Date(f.date), location: f.location.trim(), desc: f.desc.trim(), going: [] }] });
    setF({ title: '', date: '', location: '', desc: '' }); setOpen(false);
  };
  const del = (id) => { updateCircle(sc.id, { events: (sc.events || []).filter(e => e.id !== id) }); if (detail === id) setDetail(null); };
  const saveEdit = () => {
    if (!ef.title.trim() || !ef.date) return;
    updateCircle(sc.id, { events: (sc.events || []).map(e => e.id === editId ? { ...e, title: ef.title.trim(), date: new Date(ef.date), location: ef.location.trim(), desc: ef.desc.trim() } : e) });
    setEditId(null);
  };
  const startEdit = (ev) => {
    const d = ev.date instanceof Date ? ev.date : new Date(ev.date);
    const pad = n => String(n).padStart(2, '0');
    setEf({ title: ev.title, date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`, location: ev.location || '', desc: ev.desc || '' });
    setEditId(ev.id); setDetail(null);
  };
  const upcoming = (sc.events || []).filter(e => (e.date instanceof Date ? e.date : new Date(e.date)) >= new Date()).sort((a, b) => new Date(a.date) - new Date(b.date));
  const past = (sc.events || []).filter(e => (e.date instanceof Date ? e.date : new Date(e.date)) < new Date()).sort((a, b) => new Date(b.date) - new Date(a.date));
  const renderEv = (ev) => {
    const evd = ev.date instanceof Date ? ev.date : new Date(ev.date);
    const isPast = evd < new Date();
    if (detail === ev.id) return (
      <div key={ev.id} style={{ ...cardS, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <button onClick={() => setDetail(null)} style={{ background: 'none', border: 'none', color: T.txD, cursor: 'pointer', display: 'flex', padding: 2 }}>{I.back}</button>
          <span style={{ fontSize: 15, fontWeight: 700, color: T.txH }}>イベント詳細</span>
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: T.txH, marginBottom: 8 }}>{ev.title}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: T.tx }}>{I.cal} {evd.toLocaleDateString('ja', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })} {evd.toLocaleTimeString('ja', { hour: '2-digit', minute: '2-digit' })}</div>
          {ev.location && <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: T.tx }}>{I.pin} {ev.location}</div>}
        </div>
        {ev.desc && <div style={{ fontSize: 14, color: T.tx, lineHeight: 1.6, padding: '10px 12px', borderRadius: 10, background: T.bg3, marginBottom: 12 }}>{ev.desc}</div>}
        <div style={{ fontSize: 12, fontWeight: 600, color: T.txD, marginBottom: 8 }}>参加者 ({ev.going?.length || 0}人)</div>
        {(ev.going || []).length === 0 && <div style={{ fontSize: 12, color: T.txD, padding: '4px 0 12px' }}>まだ参加者がいません</div>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {(ev.going || []).map(uid => {
            const m = (sc.members || []).find(mm => mm.id === uid);
            return m ? <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px 4px 4px', borderRadius: 20, background: T.bg3 }}><Av u={{ name: m.name, av: m.avatar, col: m.color }} sz={22} /><span style={{ fontSize: 12, color: T.txH }}>{m.name}</span></div> : null;
          })}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => startEdit(ev)} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: `1px solid ${T.bd}`, background: 'transparent', color: T.txH, fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>{I.pen} 編集</button>
          <button onClick={() => del(ev.id)} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: `1px solid ${T.red}30`, background: 'transparent', color: T.red, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>削除</button>
        </div>
      </div>
    );
    return (
      <div key={ev.id} onClick={() => setDetail(ev.id)} style={{ ...cardS, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', opacity: isPast ? 0.5 : 1 }}>
        <div style={{ width: 44, textAlign: 'center', flexShrink: 0, padding: '4px 0', borderRadius: 10, background: `${sc.color}10` }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: sc.color }}>{evd.toLocaleDateString('ja', { month: 'short' })}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.txH, lineHeight: 1 }}>{evd.getDate()}</div>
          <div style={{ fontSize: 9, color: T.txD }}>{evd.toLocaleTimeString('ja', { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: T.txH }}>{ev.title}</div>
          {ev.location && <div style={{ fontSize: 12, color: T.txD, marginTop: 2 }}>{ev.location}</div>}
          <div style={{ fontSize: 11, color: T.txD, marginTop: 2 }}>{ev.going?.length || 0}人参加</div>
        </div>
        <span style={{ color: T.txD, opacity: 0.4, display: 'flex' }}>{I.arr}</span>
      </div>
    );
  };
  return (<div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <SubHdr />
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px 24px' }}>
      {editId ? (
        <div style={{ ...cardS, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.txH, marginBottom: 12 }}>イベントを編集</div>
          <Field label="タイトル" value={ef.title} onChange={v => setEf(p => ({ ...p, title: v }))} placeholder="イベント名" />
          <Field label="日時" value={ef.date} onChange={v => setEf(p => ({ ...p, date: v }))} type="datetime-local" />
          <Field label="場所" value={ef.location} onChange={v => setEf(p => ({ ...p, location: v }))} placeholder="場所" />
          <Field label="説明" value={ef.desc} onChange={v => setEf(p => ({ ...p, desc: v }))} placeholder="詳細" multiline />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setEditId(null)} style={{ flex: 1, padding: '12px 0', borderRadius: 10, border: `1px solid ${T.bd}`, background: 'transparent', color: T.txD, fontSize: 14, cursor: 'pointer' }}>キャンセル</button>
            <button onClick={saveEdit} disabled={!ef.title.trim() || !ef.date} style={{ ...btnPrimary(ef.title.trim() && ef.date), flex: 1 }}>保存</button>
          </div>
        </div>
      ) : !open ? (
        <button onClick={() => setOpen(true)} style={{ ...btnPrimary(true), marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>{I.plus} 新しいイベントを作成</button>
      ) : (
        <div style={{ ...cardS, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.txH, marginBottom: 12 }}>イベント作成</div>
          <Field label="タイトル" value={f.title} onChange={v => setF(p => ({ ...p, title: v }))} placeholder="イベント名" />
          <Field label="日時" value={f.date} onChange={v => setF(p => ({ ...p, date: v }))} type="datetime-local" />
          <Field label="場所" value={f.location} onChange={v => setF(p => ({ ...p, location: v }))} placeholder="例: 南3号館 115教室" />
          <Field label="説明" value={f.desc} onChange={v => setF(p => ({ ...p, desc: v }))} placeholder="詳細" multiline />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setOpen(false)} style={{ flex: 1, padding: '12px 0', borderRadius: 10, border: `1px solid ${T.bd}`, background: 'transparent', color: T.txD, fontSize: 14, cursor: 'pointer' }}>キャンセル</button>
            <button onClick={add} disabled={!f.title.trim() || !f.date} style={{ ...btnPrimary(f.title.trim() && f.date), flex: 1 }}>作成</button>
          </div>
        </div>
      )}
      {!editId && <>
        {upcoming.length > 0 && <div style={{ fontSize: 11, fontWeight: 700, color: T.green, letterSpacing: 0.5, marginBottom: 8, padding: '0 2px' }}>今後のイベント ({upcoming.length})</div>}
        {upcoming.map(renderEv)}
        {past.length > 0 && <div style={{ fontSize: 11, fontWeight: 700, color: T.txD, letterSpacing: 0.5, marginBottom: 8, marginTop: 12, padding: '0 2px' }}>過去のイベント ({past.length})</div>}
        {past.map(renderEv)}
        {(sc.events || []).length === 0 && <div style={{ textAlign: 'center', padding: 24, color: T.txD, fontSize: 13 }}>イベントはまだありません</div>}
      </>}
    </div>
  </div>);
};

const AdminRecruit = ({ sc, updateCircle, SubHdr, cardS, btnPrimary, btnDel }) => {
  const [f, setF] = useState({ title: '', desc: '', spots: '3', deadline: '' });
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [ef, setEf] = useState({ title: '', desc: '', spots: '3', deadline: '' });
  const add = () => {
    if (!f.title.trim()) return;
    updateCircle(sc.id, { recruit: [...(sc.recruit || []), { id: `rec_${Date.now()}`, title: f.title.trim(), desc: f.desc.trim(), spots: Number(f.spots) || 1, applied: 0, deadline: f.deadline ? new Date(f.deadline) : new Date(Date.now() + 30 * 86400000), closed: false }] });
    setF({ title: '', desc: '', spots: '3', deadline: '' }); setOpen(false);
  };
  const del = (id) => updateCircle(sc.id, { recruit: (sc.recruit || []).filter(r => r.id !== id) });
  const toggleClose = (id) => updateCircle(sc.id, { recruit: (sc.recruit || []).map(r => r.id === id ? { ...r, closed: !r.closed } : r) });
  const startEdit = (r) => {
    const dl = r.deadline instanceof Date ? r.deadline : new Date(r.deadline);
    const pad = n => String(n).padStart(2, '0');
    setEf({ title: r.title, desc: r.desc || '', spots: String(r.spots), deadline: `${dl.getFullYear()}-${pad(dl.getMonth() + 1)}-${pad(dl.getDate())}` });
    setEditId(r.id);
  };
  const saveEdit = () => {
    if (!ef.title.trim()) return;
    updateCircle(sc.id, { recruit: (sc.recruit || []).map(r => r.id === editId ? { ...r, title: ef.title.trim(), desc: ef.desc.trim(), spots: Number(ef.spots) || 1, deadline: ef.deadline ? new Date(ef.deadline) : r.deadline } : r) });
    setEditId(null);
  };
  const activeR = (sc.recruit || []).filter(r => !r.closed);
  const closedR = (sc.recruit || []).filter(r => r.closed);
  return (<div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <SubHdr />
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px 24px' }}>
      {editId ? (
        <div style={{ ...cardS, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.txH, marginBottom: 12 }}>募集を編集</div>
          <Field label="タイトル" value={ef.title} onChange={v => setEf(p => ({ ...p, title: v }))} placeholder="タイトル" />
          <Field label="説明" value={ef.desc} onChange={v => setEf(p => ({ ...p, desc: v }))} placeholder="詳細" multiline />
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1 }}><label style={{ fontSize: 12, fontWeight: 600, color: T.txD, display: 'block', marginBottom: 5 }}>募集人数</label><input type="number" min={1} value={ef.spots} onChange={e => setEf(p => ({ ...p, spots: e.target.value }))} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 15, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} /></div>
            <div style={{ flex: 1 }}><label style={{ fontSize: 12, fontWeight: 600, color: T.txD, display: 'block', marginBottom: 5 }}>締切日</label><input type="date" value={ef.deadline} onChange={e => setEf(p => ({ ...p, deadline: e.target.value }))} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 15, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setEditId(null)} style={{ flex: 1, padding: '12px 0', borderRadius: 10, border: `1px solid ${T.bd}`, background: 'transparent', color: T.txD, fontSize: 14, cursor: 'pointer' }}>キャンセル</button>
            <button onClick={saveEdit} disabled={!ef.title.trim()} style={{ ...btnPrimary(ef.title.trim()), flex: 1 }}>保存</button>
          </div>
        </div>
      ) : !open ? (
        <button onClick={() => setOpen(true)} style={{ ...btnPrimary(true), marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>{I.plus} 新しい募集を作成</button>
      ) : (
        <div style={{ ...cardS, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.txH, marginBottom: 12 }}>募集作成</div>
          <Field label="タイトル" value={f.title} onChange={v => setF(p => ({ ...p, title: v }))} placeholder="募集タイトル" />
          <Field label="説明" value={f.desc} onChange={v => setF(p => ({ ...p, desc: v }))} placeholder="詳細" multiline />
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1 }}><label style={{ fontSize: 12, fontWeight: 600, color: T.txD, display: 'block', marginBottom: 5 }}>募集人数</label><input type="number" min={1} value={f.spots} onChange={e => setF(p => ({ ...p, spots: e.target.value }))} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 15, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} /></div>
            <div style={{ flex: 1 }}><label style={{ fontSize: 12, fontWeight: 600, color: T.txD, display: 'block', marginBottom: 5 }}>締切日</label><input type="date" value={f.deadline} onChange={e => setF(p => ({ ...p, deadline: e.target.value }))} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 15, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setOpen(false)} style={{ flex: 1, padding: '12px 0', borderRadius: 10, border: `1px solid ${T.bd}`, background: 'transparent', color: T.txD, fontSize: 14, cursor: 'pointer' }}>キャンセル</button>
            <button onClick={add} disabled={!f.title.trim()} style={{ ...btnPrimary(f.title.trim()), flex: 1 }}>作成</button>
          </div>
        </div>
      )}
      {!editId && <>
        {activeR.length > 0 && <div style={{ fontSize: 11, fontWeight: 700, color: T.green, letterSpacing: 0.5, marginBottom: 8, padding: '0 2px' }}>募集中 ({activeR.length})</div>}
        {activeR.map(r => {
          const dl = r.deadline instanceof Date ? r.deadline : new Date(r.deadline);
          const rem = r.spots - r.applied;
          return (
            <div key={r.id} style={cardS}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: T.txH, marginBottom: 4 }}>{r.title}</div>
                  {r.desc && <div style={{ fontSize: 13, color: T.tx, lineHeight: 1.5, marginBottom: 6 }}>{r.desc}</div>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: rem > 0 ? `${T.green}14` : `${T.red}14`, color: rem > 0 ? T.green : T.red, fontWeight: 600 }}>残り{rem}/{r.spots}枠</span>
                <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: T.bg3, color: T.txD }}>~{dl.toLocaleDateString('ja', { month: 'numeric', day: 'numeric' })}</span>
                <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: T.bg3, color: T.txD }}>{r.applied}人応募</span>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10, borderTop: `1px solid ${T.bd}`, paddingTop: 10 }}>
                <button onClick={() => startEdit(r)} style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, border: `1px solid ${T.bd}`, background: 'transparent', color: T.txD, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>{I.pen} 編集</button>
                <button onClick={() => toggleClose(r.id)} style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, border: `1px solid ${T.orange}40`, background: 'transparent', color: T.orange, cursor: 'pointer' }}>締め切る</button>
                <div style={{ flex: 1 }} />
                <button onClick={() => del(r.id)} style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, border: `1px solid ${T.red}30`, background: 'transparent', color: T.red, cursor: 'pointer' }}>削除</button>
              </div>
            </div>
          );
        })}
        {closedR.length > 0 && <div style={{ fontSize: 11, fontWeight: 700, color: T.txD, letterSpacing: 0.5, marginBottom: 8, marginTop: 12, padding: '0 2px' }}>締め切り済み ({closedR.length})</div>}
        {closedR.map(r => (
          <div key={r.id} style={{ ...cardS, opacity: 0.6 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.txH }}>{r.title}</div>
            <div style={{ fontSize: 11, color: T.txD, marginTop: 2 }}>{r.applied}/{r.spots}人応募</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button onClick={() => toggleClose(r.id)} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 6, border: `1px solid ${T.green}40`, background: 'transparent', color: T.green, cursor: 'pointer' }}>再開</button>
              <div style={{ flex: 1 }} />
              <button onClick={() => del(r.id)} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 6, border: `1px solid ${T.red}30`, background: 'transparent', color: T.red, cursor: 'pointer' }}>削除</button>
            </div>
          </div>
        ))}
        {(sc.recruit || []).length === 0 && <div style={{ textAlign: 'center', padding: 24, color: T.txD, fontSize: 13 }}>募集はまだありません</div>}
      </>}
    </div>
  </div>);
};

const AdminMembers = ({ sc, updateCircle, uid, SubHdr, cardS, btnDel }) => {
  const [search, setSearch] = useState('');
  const [confirmKick, setConfirmKick] = useState(null);
  const toggle = (id) => updateCircle(sc.id, { members: (sc.members || []).map(m => m.id === id ? { ...m, role: m.role === 'admin' ? 'member' : 'admin' } : m) });
  const kick = (id) => { updateCircle(sc.id, { members: (sc.members || []).filter(m => m.id !== id) }); setConfirmKick(null); };
  const all = (sc.members || []).filter(m => !search || m.name.toLowerCase().includes(search.toLowerCase()));
  const admins = all.filter(m => m.role === 'admin');
  const mems = all.filter(m => m.role !== 'admin');
  return (<div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <SubHdr />
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px 24px' }}>
      {/* Stats */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <Stat label="管理者" value={admins.length} color={T.accent} />
        <Stat label="メンバー" value={mems.length} color="#c75d8e" />
        <Stat label="合計" value={(sc.members || []).length} color={T.txD} />
      </div>
      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="メンバーを検索..." style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
        <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: T.txD, opacity: 0.5, display: 'flex' }}>{I.search}</div>
      </div>
      {/* Kick confirm modal */}
      {confirmKick && (
        <div style={{ ...cardS, background: `${T.red}08`, border: `1px solid ${T.red}30`, marginBottom: 12, padding: 14 }}>
          <div style={{ fontSize: 13, color: T.txH, marginBottom: 10 }}>「{(sc.members || []).find(m => m.id === confirmKick)?.name}」をサークルから除名しますか？</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setConfirmKick(null)} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: `1px solid ${T.bd}`, background: 'transparent', color: T.txD, fontSize: 13, cursor: 'pointer' }}>キャンセル</button>
            <button onClick={() => kick(confirmKick)} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', background: T.red, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>除名する</button>
          </div>
        </div>
      )}
      {admins.length > 0 && <>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.txD, letterSpacing: 0.5, marginBottom: 8, padding: '0 2px' }}>管理者 ({admins.length})</div>
        {admins.map(m => (
          <div key={m.id} style={{ ...cardS, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Av u={{ name: m.name, av: m.avatar, col: m.color }} sz={38} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.txH }}>{m.name}</div>
              {m.id === uid && <div style={{ fontSize: 10, color: T.txD }}>あなた</div>}
            </div>
            <button onClick={() => toggle(m.id)} style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, border: `1px solid ${T.accent}`, background: `${T.accent}14`, color: T.accent, fontWeight: 600, cursor: 'pointer' }}>管理者</button>
            {m.id !== uid && <button onClick={() => setConfirmKick(m.id)} style={btnDel}>{I.x}</button>}
          </div>
        ))}
      </>}
      {mems.length > 0 && <>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.txD, letterSpacing: 0.5, marginBottom: 8, marginTop: 12, padding: '0 2px' }}>メンバー ({mems.length})</div>
        {mems.map(m => (
          <div key={m.id} style={{ ...cardS, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Av u={{ name: m.name, av: m.avatar, col: m.color }} sz={38} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.txH }}>{m.name}</div>
            </div>
            <button onClick={() => toggle(m.id)} style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, border: `1px solid ${T.bd}`, background: 'transparent', color: T.txD, fontWeight: 500, cursor: 'pointer' }}>メンバー</button>
            <button onClick={() => setConfirmKick(m.id)} style={btnDel}>{I.x}</button>
          </div>
        ))}
      </>}
      {all.length === 0 && <div style={{ textAlign: 'center', padding: 24, color: T.txD, fontSize: 13 }}>{search ? '該当するメンバーがいません' : 'メンバーがいません'}</div>}
    </div>
  </div>);
};

const AdminDanger = ({ sc, leaveCircle, backToList, SubHdr }) => {
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState('');
  return (<div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <SubHdr />
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px 24px' }}>
      <div style={{ padding: '20px 16px', borderRadius: 14, border: `1px solid ${T.red}30`, background: `${T.red}06` }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.red, marginBottom: 6 }}>サークルを削除</div>
        <div style={{ fontSize: 13, color: T.tx, lineHeight: 1.6, marginBottom: 16 }}>
          「{sc.name}」を完全に削除します。チャンネル・メッセージ・イベント・募集など、すべてのデータが失われます。この操作は取り消せません。
        </div>
        {!confirm ? (
          <button onClick={() => setConfirm(true)} style={{ width: '100%', padding: '12px 0', borderRadius: 10, border: `1px solid ${T.red}50`, background: 'transparent', color: T.red, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>削除を開始</button>
        ) : (
          <>
            <div style={{ fontSize: 13, color: T.txH, marginBottom: 8 }}>確認のためサークル名を入力してください:</div>
            <input value={typed} onChange={e => setTyped(e.target.value)} placeholder={sc.name} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.red}40`, background: T.bg3, color: T.txH, fontSize: 15, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 12 }} autoFocus />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setConfirm(false); setTyped(''); }} style={{ flex: 1, padding: '12px 0', borderRadius: 10, border: `1px solid ${T.bd}`, background: 'transparent', color: T.txD, fontSize: 14, cursor: 'pointer' }}>キャンセル</button>
              <button onClick={() => { leaveCircle(sc.id); backToList(); }} disabled={typed !== sc.name} style={{ flex: 1, padding: '12px 0', borderRadius: 10, border: 'none', background: typed === sc.name ? T.red : T.bg4, color: typed === sc.name ? '#fff' : T.txD, fontSize: 14, fontWeight: 600, cursor: typed === sc.name ? 'pointer' : 'default' }}>完全に削除する</button>
            </div>
          </>
        )}
      </div>
    </div>
  </div>);
};

/* ── 参加申請管理 ── */
const AdminApplications = ({ sc, updateCircle, user, SubHdr, cardS, btnPrimary, btnDel }) => {
  const [tab, setTab] = useState('pending');
  const apps = sc.applications || [];
  const pending = apps.filter(a => a.status === 'pending');
  const approved = apps.filter(a => a.status === 'approved');
  const rejected = apps.filter(a => a.status === 'rejected');
  const list = tab === 'pending' ? pending : tab === 'approved' ? approved : rejected;

  const approve = (id) => {
    updateCircle(sc.id, { applications: apps.map(a => a.id === id ? { ...a, status: 'approved', reviewedBy: user?.name || '管理者', reviewedAt: new Date() } : a) });
  };
  const reject = (id, reason) => {
    updateCircle(sc.id, { applications: apps.map(a => a.id === id ? { ...a, status: 'rejected', rejectReason: reason || '', reviewedBy: user?.name || '管理者', reviewedAt: new Date() } : a) });
  };
  const [rejectId, setRejectId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  // 参加方式設定
  const [joinMode, setJoinMode] = useState(sc.joinMode || 'open');
  const saveJoinMode = (mode) => { setJoinMode(mode); updateCircle(sc.id, { joinMode: mode }); };

  const tabS = (active) => ({ flex: 1, padding: '8px 0', border: 'none', borderBottom: active ? `2px solid ${T.accent}` : '2px solid transparent', background: 'transparent', color: active ? T.accent : T.txD, fontSize: 13, fontWeight: active ? 700 : 400, cursor: 'pointer' });

  return (<div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <SubHdr />
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px 24px' }}>
      {/* 参加方式設定 */}
      <div style={{ ...cardS, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.txH, marginBottom: 10 }}>参加方式</div>
        {[
          { id: 'open', label: '自由参加', desc: '誰でもすぐに参加可能' },
          { id: 'approval', label: '承認制', desc: '管理者の承認が必要' },
          { id: 'invite_only', label: '招待のみ', desc: '招待されたユーザーのみ参加可能' },
        ].map(m => (
          <button key={m.id} onClick={() => saveJoinMode(m.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px', borderRadius: 10, border: `1px solid ${joinMode === m.id ? T.accent : T.bd}`, background: joinMode === m.id ? `${T.accent}08` : 'transparent', cursor: 'pointer', textAlign: 'left', marginBottom: 6 }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${joinMode === m.id ? T.accent : T.txD}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {joinMode === m.id && <div style={{ width: 10, height: 10, borderRadius: '50%', background: T.accent }} />}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.txH }}>{m.label}</div>
              <div style={{ fontSize: 11, color: T.txD, marginTop: 1 }}>{m.desc}</div>
            </div>
          </button>
        ))}
      </div>

      {/* 申請タブ */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${T.bd}`, marginBottom: 12 }}>
        <button onClick={() => setTab('pending')} style={tabS(tab === 'pending')}>未処理 ({pending.length})</button>
        <button onClick={() => setTab('approved')} style={tabS(tab === 'approved')}>承認済 ({approved.length})</button>
        <button onClick={() => setTab('rejected')} style={tabS(tab === 'rejected')}>却下 ({rejected.length})</button>
      </div>

      {list.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 32, color: T.txD, fontSize: 13 }}>
          {tab === 'pending' ? '未処理の申請はありません' : tab === 'approved' ? '承認済みの申請はありません' : '却下した申請はありません'}
        </div>
      ) : list.map(a => (
        <div key={a.id} style={{ ...cardS, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: a.color || '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{a.avatar || a.name?.[0] || '?'}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.txH }}>{a.name || '不明'}</div>
              <div style={{ fontSize: 11, color: T.txD }}>{a.ts ? new Date(a.ts).toLocaleDateString('ja') : ''}</div>
            </div>
            {a.status === 'approved' && <span style={{ fontSize: 11, fontWeight: 600, color: T.green, padding: '3px 8px', borderRadius: 6, background: `${T.green}14` }}>承認済</span>}
            {a.status === 'rejected' && <span style={{ fontSize: 11, fontWeight: 600, color: T.red, padding: '3px 8px', borderRadius: 6, background: `${T.red}14` }}>却下</span>}
          </div>
          {a.message && <div style={{ fontSize: 13, color: T.tx, lineHeight: 1.6, padding: '8px 12px', borderRadius: 8, background: T.bg3, marginBottom: 8 }}>{a.message}</div>}
          {a.reviewedBy && <div style={{ fontSize: 11, color: T.txD, marginBottom: 4 }}>処理: {a.reviewedBy} ({a.reviewedAt ? new Date(a.reviewedAt).toLocaleDateString('ja') : ''})</div>}
          {a.rejectReason && <div style={{ fontSize: 11, color: T.red, marginBottom: 4 }}>理由: {a.rejectReason}</div>}
          {a.status === 'pending' && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={() => approve(a.id)} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', background: T.green, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>承認</button>
              <button onClick={() => setRejectId(a.id)} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: `1px solid ${T.red}50`, background: 'transparent', color: T.red, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>却下</button>
            </div>
          )}
        </div>
      ))}

      {/* 却下理由モーダル */}
      {rejectId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ width: '100%', maxWidth: 360, background: T.bg, borderRadius: 16, padding: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, marginBottom: 12 }}>却下理由</div>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="却下理由を入力（任意）" rows={3} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} autoFocus />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={() => { setRejectId(null); setRejectReason(''); }} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: `1px solid ${T.bd}`, background: 'transparent', color: T.txD, fontSize: 13, cursor: 'pointer' }}>キャンセル</button>
              <button onClick={() => { reject(rejectId, rejectReason); setRejectId(null); setRejectReason(''); }} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', background: T.red, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>却下する</button>
            </div>
          </div>
        </div>
      )}
    </div>
  </div>);
};

/* ── 会費管理 ── */
const AdminFees = ({ sc, updateCircle, user, SubHdr, cardS, btnPrimary, btnDel }) => {
  const plans = sc.feePlans || [];
  const periods = sc.feePeriods || [];
  const assignments = sc.feeAssignments || [];
  const logs = sc.feeLogs || [];
  const members = sc.members || [];
  const currentPeriod = periods.find(p => p.isCurrent);
  const isSetup = plans.length === 0 && periods.length === 0; // 初期設定がまだ

  const [mode, setMode] = useState(isSetup ? 'setup' : 'manage'); // setup: 初期設定, manage: 管理画面
  const [setupStep, setSetupStep] = useState(0); // 0: 選択, 1: 簡単, 2: 詳細
  const [tab, setTab] = useState('plans');
  const tabS = (active) => ({ flex: 1, padding: '8px 0', border: 'none', borderBottom: active ? `2px solid ${T.accent}` : '2px solid transparent', background: 'transparent', color: active ? T.accent : T.txD, fontSize: 12, fontWeight: active ? 700 : 400, cursor: 'pointer' });

  const inputS = { width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };
  const selectS = { ...inputS, appearance: 'none', WebkitAppearance: 'none' };
  const cycleName = { yearly: '年次', half_yearly: '半期', monthly: '月次', one_time: '入会時' };
  const statusLabel = { unpaid: '未納', paid: '納入済', exempt: '免除', overdue: '滞納' };
  const statusColor = { unpaid: T.orange || '#d4843e', paid: T.green, exempt: T.txD, overdue: T.red };

  /* ── 簡単設定 state ── */
  const [quickPreset, setQuickPreset] = useState(null);
  const [quickAmount, setQuickAmount] = useState('');
  const [quickCycle, setQuickCycle] = useState('yearly');
  const QUICK_PRESETS = [
    { id: 'free', label: '会費なし', desc: 'サークル参加は無料', amount: 0, cycle: 'yearly' },
    { id: 'yearly_low', label: '年会費（少額）', desc: '年1回の少額徴収', amount: 1000, cycle: 'yearly' },
    { id: 'yearly_mid', label: '年会費（標準）', desc: '一般的なサークル会費', amount: 3000, cycle: 'yearly' },
    { id: 'yearly_high', label: '年会費（高額）', desc: '設備費・合宿費込み', amount: 10000, cycle: 'yearly' },
    { id: 'half', label: '半期ごと', desc: '前期/後期で分割徴収', amount: 2000, cycle: 'half_yearly' },
    { id: 'monthly', label: '月額', desc: '毎月定額を徴収', amount: 500, cycle: 'monthly' },
    { id: 'custom', label: '金額を自分で決める', desc: '金額とサイクルを指定', amount: 0, cycle: 'yearly' },
  ];

  const applyQuickSetup = () => {
    const y = new Date().getFullYear();
    const amt = quickPreset === 'custom' ? Number(quickAmount) : (QUICK_PRESETS.find(p => p.id === quickPreset)?.amount || 0);
    const cyc = quickPreset === 'custom' ? quickCycle : (QUICK_PRESETS.find(p => p.id === quickPreset)?.cycle || 'yearly');
    const preset = QUICK_PRESETS.find(p => p.id === quickPreset);
    const updates = {};
    // プラン作成
    if (amt > 0) {
      updates.feePlans = [{ id: `fp_${Date.now()}`, name: preset?.label || '会費', amount: amt, cycle: cyc, desc: '', isDefault: true, isActive: true, createdAt: new Date() }];
    } else {
      updates.feePlans = [{ id: `fp_${Date.now()}`, name: '無料', amount: 0, cycle: 'yearly', desc: '会費なし', isDefault: true, isActive: true, createdAt: new Date() }];
    }
    // 期間作成
    if (cyc === 'half_yearly') {
      updates.feePeriods = [
        { id: `per_${Date.now()}_h1`, name: `${y}年度 前期`, type: 'first_half', startDate: `${y}-04-01`, endDate: `${y}-09-30`, isCurrent: true },
        { id: `per_${Date.now()}_h2`, name: `${y}年度 後期`, type: 'second_half', startDate: `${y}-10-01`, endDate: `${y + 1}-03-31`, isCurrent: false },
      ];
    } else {
      updates.feePeriods = [{ id: `per_${Date.now()}`, name: `${y}年度`, type: 'yearly', startDate: `${y}-04-01`, endDate: `${y + 1}-03-31`, isCurrent: true }];
    }
    updateCircle(sc.id, updates);
    setMode('manage');
  };

  /* ── 詳細設定 state ── */
  const [detailStep, setDetailStep] = useState(0); // 0: プラン, 1: 期間, 2: 完了
  const [dpf, setDpf] = useState({ name: '', amount: '', cycle: 'yearly', desc: '', isDefault: true });
  const [detailPlans, setDetailPlans] = useState([]);
  const [detailPeriodType, setDetailPeriodType] = useState('yearly');
  const [detailYear, setDetailYear] = useState(new Date().getFullYear());

  const addDetailPlan = () => {
    if (!dpf.name.trim() || !dpf.amount) return;
    setDetailPlans(prev => [...prev, { id: `fp_${Date.now()}_${prev.length}`, name: dpf.name.trim(), amount: Number(dpf.amount), cycle: dpf.cycle, desc: dpf.desc.trim(), isDefault: dpf.isDefault, isActive: true, createdAt: new Date() }]);
    setDpf({ name: '', amount: '', cycle: 'yearly', desc: '', isDefault: false });
  };

  const applyDetailSetup = () => {
    const y = detailYear;
    const updates = { feePlans: detailPlans };
    if (detailPeriodType === 'half_yearly') {
      updates.feePeriods = [
        { id: `per_${Date.now()}_h1`, name: `${y}年度 前期`, type: 'first_half', startDate: `${y}-04-01`, endDate: `${y}-09-30`, isCurrent: true },
        { id: `per_${Date.now()}_h2`, name: `${y}年度 後期`, type: 'second_half', startDate: `${y}-10-01`, endDate: `${y + 1}-03-31`, isCurrent: false },
      ];
    } else {
      updates.feePeriods = [{ id: `per_${Date.now()}`, name: `${y}年度`, type: 'yearly', startDate: `${y}-04-01`, endDate: `${y + 1}-03-31`, isCurrent: true }];
    }
    updateCircle(sc.id, updates);
    setMode('manage');
  };

  /* ── 管理画面 actions ── */
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [pf, setPf] = useState({ name: '', amount: '', cycle: 'yearly', desc: '', isDefault: false });
  const [editPlanId, setEditPlanId] = useState(null);
  const [epf, setEpf] = useState({});

  const addPlan = () => {
    if (!pf.name.trim() || !pf.amount) return;
    updateCircle(sc.id, { feePlans: [...plans, { id: `fp_${Date.now()}`, name: pf.name.trim(), amount: Number(pf.amount), cycle: pf.cycle, desc: pf.desc.trim(), isDefault: pf.isDefault, isActive: true, createdAt: new Date() }] });
    setPf({ name: '', amount: '', cycle: 'yearly', desc: '', isDefault: false });
    setShowPlanForm(false);
  };
  const deletePlan = (id) => updateCircle(sc.id, { feePlans: plans.filter(p => p.id !== id) });
  const togglePlanActive = (id) => updateCircle(sc.id, { feePlans: plans.map(p => p.id === id ? { ...p, isActive: !p.isActive } : p) });
  const savePlanEdit = (id) => {
    updateCircle(sc.id, { feePlans: plans.map(p => p.id === id ? { ...p, name: epf.name?.trim() || p.name, amount: Number(epf.amount) || p.amount, cycle: epf.cycle || p.cycle, desc: epf.desc?.trim() ?? p.desc, isDefault: epf.isDefault ?? p.isDefault } : p) });
    setEditPlanId(null);
  };

  const [showPerForm, setShowPerForm] = useState(false);
  const [perf, setPerf] = useState({ name: '', type: 'yearly', startDate: '', endDate: '' });
  const [genYear, setGenYear] = useState(new Date().getFullYear());
  const [genType, setGenType] = useState('yearly');

  const addPeriod = () => {
    if (!perf.name.trim() || !perf.startDate || !perf.endDate) return;
    updateCircle(sc.id, { feePeriods: [...periods, { id: `per_${Date.now()}`, name: perf.name.trim(), type: perf.type, startDate: perf.startDate, endDate: perf.endDate, isCurrent: false }] });
    setPerf({ name: '', type: 'yearly', startDate: '', endDate: '' });
    setShowPerForm(false);
  };
  const generatePeriods = () => {
    const y = genYear;
    let newPers = genType === 'yearly'
      ? [{ id: `per_${Date.now()}`, name: `${y}年度`, type: 'yearly', startDate: `${y}-04-01`, endDate: `${y + 1}-03-31`, isCurrent: false }]
      : [
          { id: `per_${Date.now()}_h1`, name: `${y}年度 前期`, type: 'first_half', startDate: `${y}-04-01`, endDate: `${y}-09-30`, isCurrent: false },
          { id: `per_${Date.now()}_h2`, name: `${y}年度 後期`, type: 'second_half', startDate: `${y}-10-01`, endDate: `${y + 1}-03-31`, isCurrent: false },
        ];
    const existing = periods.map(p => p.name);
    const toAdd = newPers.filter(p => !existing.includes(p.name));
    if (toAdd.length > 0) updateCircle(sc.id, { feePeriods: [...periods, ...toAdd] });
  };
  const setCurrentPeriod = (id) => updateCircle(sc.id, { feePeriods: periods.map(p => ({ ...p, isCurrent: p.id === id })) });
  const deletePeriod = (id) => updateCircle(sc.id, { feePeriods: periods.filter(p => p.id !== id) });

  const [selPeriod, setSelPeriod] = useState(currentPeriod?.id || periods[0]?.id || '');
  const periodAssignments = assignments.filter(a => a.periodId === selPeriod);
  const stats = { total: periodAssignments.length, paid: periodAssignments.filter(a => a.status === 'paid').length, unpaid: periodAssignments.filter(a => a.status === 'unpaid').length, exempt: periodAssignments.filter(a => a.status === 'exempt').length, overdue: periodAssignments.filter(a => a.status === 'overdue').length };
  const totalAmount = periodAssignments.reduce((s, a) => s + (a.amount || 0), 0);
  const collectedAmount = periodAssignments.filter(a => a.status === 'paid').reduce((s, a) => s + (a.amount || 0), 0);

  const bulkAssign = () => {
    const plan = plans.find(p => p.isDefault && p.isActive) || plans.find(p => p.isActive);
    if (!plan || !selPeriod) return;
    const existing = assignments.filter(a => a.periodId === selPeriod).map(a => a.userId);
    const newAssigns = members.filter(m => !existing.includes(m.id)).map(m => ({
      id: `fa_${Date.now()}_${m.id}`, circleId: sc.id, userId: m.id, userName: m.name, planId: plan.id, planName: plan.name, periodId: selPeriod, amount: plan.amount, status: 'unpaid', createdAt: new Date(),
    }));
    if (newAssigns.length > 0) updateCircle(sc.id, { feeAssignments: [...assignments, ...newAssigns] });
  };
  const updateAssignStatus = (id, status) => {
    updateCircle(sc.id, {
      feeAssignments: assignments.map(a => a.id === id ? { ...a, status, ...(status === 'paid' ? { paidAt: new Date(), confirmedBy: user?.name || '管理者', confirmedAt: new Date() } : {}) } : a),
      feeLogs: [...logs, { id: `fl_${Date.now()}`, action: status, actorName: user?.name || '管理者', targetName: assignments.find(a => a.id === id)?.userName, amount: assignments.find(a => a.id === id)?.amount, ts: new Date() }],
    });
  };

  /* ── reset to setup ── */
  const resetToSetup = () => {
    setMode('setup');
    setSetupStep(0);
    setDetailStep(0);
    setDetailPlans([]);
  };

  return (<div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <SubHdr />

    {/* =============== 初期設定: ステップ選択 =============== */}
    {mode === 'setup' && setupStep === 0 && (
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 14px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: `#c6a23614`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c6a236', margin: '0 auto 12px' }}>{I.yen}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.txH }}>会費設定</div>
          <div style={{ fontSize: 13, color: T.txD, marginTop: 4, lineHeight: 1.6 }}>サークルの会費を設定しましょう。<br />あとから変更することもできます。</div>
        </div>

        <button onClick={() => setSetupStep(1)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '18px 16px', borderRadius: 16, border: `1px solid ${T.bd}`, background: T.bg2, cursor: 'pointer', textAlign: 'left', marginBottom: 10 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: `${T.green}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ color: T.green, fontSize: 20 }}>{I.check}</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>簡単設定</div>
            <div style={{ fontSize: 12, color: T.txD, marginTop: 2, lineHeight: 1.5 }}>プリセットから選ぶだけで完了。<br />会費なし・年会費・半期・月額から選択</div>
          </div>
          <span style={{ color: T.txD, opacity: 0.4, display: 'flex' }}>{I.arr}</span>
        </button>

        <button onClick={() => setSetupStep(2)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '18px 16px', borderRadius: 16, border: `1px solid ${T.bd}`, background: T.bg2, cursor: 'pointer', textAlign: 'left', marginBottom: 10 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: `${T.accent}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ color: T.accent, fontSize: 20 }}>{I.setting}</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>詳細設定</div>
            <div style={{ fontSize: 12, color: T.txD, marginTop: 2, lineHeight: 1.5 }}>複数プラン・カスタム期間など<br />細かくカスタマイズして設定</div>
          </div>
          <span style={{ color: T.txD, opacity: 0.4, display: 'flex' }}>{I.arr}</span>
        </button>

        {plans.length > 0 && (
          <button onClick={() => setMode('manage')} style={{ width: '100%', padding: '12px 0', borderRadius: 10, border: `1px solid ${T.bd}`, background: 'transparent', color: T.txD, fontSize: 13, cursor: 'pointer', marginTop: 8 }}>現在の設定に戻る</button>
        )}
      </div>
    )}

    {/* =============== 簡単設定 =============== */}
    {mode === 'setup' && setupStep === 1 && (
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <button onClick={() => setSetupStep(0)} style={{ background: 'none', border: 'none', color: T.txD, cursor: 'pointer', display: 'flex', padding: 2 }}>{I.back}</button>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>簡単設定</div>
        </div>

        <div style={{ fontSize: 13, color: T.txD, marginBottom: 16, lineHeight: 1.6 }}>会費の種類を選択してください。会計期間は自動で{new Date().getFullYear()}年度（4月〜）が作成されます。</div>

        {QUICK_PRESETS.map(p => (
          <button key={p.id} onClick={() => { setQuickPreset(p.id); setQuickAmount(String(p.amount)); setQuickCycle(p.cycle); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 14px', borderRadius: 12, border: `1px solid ${quickPreset === p.id ? T.accent : T.bd}`, background: quickPreset === p.id ? `${T.accent}08` : T.bg2, cursor: 'pointer', textAlign: 'left', marginBottom: 8 }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${quickPreset === p.id ? T.accent : T.txD}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {quickPreset === p.id && <div style={{ width: 10, height: 10, borderRadius: '50%', background: T.accent }} />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.txH }}>{p.label}</div>
              <div style={{ fontSize: 11, color: T.txD, marginTop: 1 }}>{p.desc}</div>
            </div>
            {p.amount > 0 && p.id !== 'custom' && <span style={{ fontSize: 15, fontWeight: 700, color: T.txH }}>¥{p.amount.toLocaleString()}</span>}
          </button>
        ))}

        {/* カスタム金額入力 */}
        {quickPreset === 'custom' && (
          <div style={{ ...cardS, marginTop: 4, marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <input value={quickAmount} onChange={e => setQuickAmount(e.target.value.replace(/[^\d]/g, ''))} placeholder="金額" style={inputS} autoFocus />
                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: T.txD, fontSize: 13 }}>円</span>
              </div>
              <select value={quickCycle} onChange={e => setQuickCycle(e.target.value)} style={{ ...selectS, flex: 1 }}>
                <option value="yearly">年次</option>
                <option value="half_yearly">半期</option>
                <option value="monthly">月次</option>
                <option value="one_time">入会時のみ</option>
              </select>
            </div>
          </div>
        )}

        <button onClick={applyQuickSetup} disabled={!quickPreset || (quickPreset === 'custom' && !quickAmount)} style={{ ...btnPrimary(quickPreset && (quickPreset !== 'custom' || quickAmount)), marginTop: 12 }}>この設定で始める</button>
      </div>
    )}

    {/* =============== 詳細設定 =============== */}
    {mode === 'setup' && setupStep === 2 && (
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <button onClick={() => detailStep > 0 ? setDetailStep(detailStep - 1) : setSetupStep(0)} style={{ background: 'none', border: 'none', color: T.txD, cursor: 'pointer', display: 'flex', padding: 2 }}>{I.back}</button>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.txH }}>詳細設定</div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            {[0, 1, 2].map(s => <div key={s} style={{ width: 24, height: 4, borderRadius: 2, background: s <= detailStep ? T.accent : T.bg4 }} />)}
          </div>
        </div>

        {/* Step 0: プラン作成 */}
        {detailStep === 0 && (<>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.txH, marginBottom: 4 }}>Step 1: 会費プランの作成</div>
          <div style={{ fontSize: 12, color: T.txD, marginBottom: 16, lineHeight: 1.6 }}>複数のプランを作成できます（例: 通常会費・新入生割引・幽霊部員）。最低1つ作成してください。</div>

          <div style={{ ...cardS, marginBottom: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input value={dpf.name} onChange={e => setDpf({ ...dpf, name: e.target.value })} placeholder="プラン名（例: 通常会費）" style={inputS} />
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input value={dpf.amount} onChange={e => setDpf({ ...dpf, amount: e.target.value.replace(/[^\d]/g, '') })} placeholder="金額" style={inputS} />
                  <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: T.txD, fontSize: 13 }}>円</span>
                </div>
                <select value={dpf.cycle} onChange={e => setDpf({ ...dpf, cycle: e.target.value })} style={{ ...selectS, flex: 1 }}>
                  <option value="yearly">年次</option>
                  <option value="half_yearly">半期</option>
                  <option value="monthly">月次</option>
                  <option value="one_time">入会時のみ</option>
                </select>
              </div>
              <input value={dpf.desc} onChange={e => setDpf({ ...dpf, desc: e.target.value })} placeholder="説明（任意）" style={inputS} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.txH, cursor: 'pointer' }}>
                <input type="checkbox" checked={dpf.isDefault} onChange={e => setDpf({ ...dpf, isDefault: e.target.checked })} />
                デフォルトプラン（新規メンバーに自動適用）
              </label>
              <button onClick={addDetailPlan} style={btnPrimary(dpf.name.trim() && dpf.amount)}>プランを追加</button>
            </div>
          </div>

          {detailPlans.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.txD, marginBottom: 6 }}>追加済みプラン ({detailPlans.length})</div>
              {detailPlans.map((p, i) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: T.bg2, border: `1px solid ${T.bd}`, marginBottom: 6 }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: T.txH }}>{p.name}</span>
                    {p.isDefault && <span style={{ fontSize: 10, color: T.accent, marginLeft: 6 }}>デフォルト</span>}
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.txH, marginTop: 2 }}>¥{p.amount.toLocaleString()} / {cycleName[p.cycle]}</div>
                  </div>
                  <button onClick={() => setDetailPlans(prev => prev.filter((_, j) => j !== i))} style={btnDel}>{I.x}</button>
                </div>
              ))}
            </div>
          )}

          <button onClick={() => setDetailStep(1)} disabled={detailPlans.length === 0} style={btnPrimary(detailPlans.length > 0)}>次へ: 会計期間</button>
        </>)}

        {/* Step 1: 期間設定 */}
        {detailStep === 1 && (<>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.txH, marginBottom: 4 }}>Step 2: 会計期間の設定</div>
          <div style={{ fontSize: 12, color: T.txD, marginBottom: 16, lineHeight: 1.6 }}>年度単位か半期単位かを選択してください。4月始まりで自動生成されます。</div>

          <div style={{ ...cardS, marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 8 }}>開始年度</div>
            <input type="number" value={detailYear} onChange={e => setDetailYear(Number(e.target.value))} style={{ ...inputS, textAlign: 'center', marginBottom: 12 }} />

            <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 8 }}>期間の区切り方</div>
            {[
              { id: 'yearly', label: '年度単位', desc: `${detailYear}年4月 〜 ${detailYear + 1}年3月` },
              { id: 'half_yearly', label: '半期単位', desc: `前期 (4〜9月) + 後期 (10〜3月)` },
            ].map(opt => (
              <button key={opt.id} onClick={() => setDetailPeriodType(opt.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px', borderRadius: 10, border: `1px solid ${detailPeriodType === opt.id ? T.accent : T.bd}`, background: detailPeriodType === opt.id ? `${T.accent}08` : 'transparent', cursor: 'pointer', textAlign: 'left', marginBottom: 6 }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${detailPeriodType === opt.id ? T.accent : T.txD}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {detailPeriodType === opt.id && <div style={{ width: 8, height: 8, borderRadius: '50%', background: T.accent }} />}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.txH }}>{opt.label}</div>
                  <div style={{ fontSize: 11, color: T.txD }}>{opt.desc}</div>
                </div>
              </button>
            ))}
          </div>

          <button onClick={() => setDetailStep(2)} style={btnPrimary(true)}>次へ: 確認</button>
        </>)}

        {/* Step 2: 確認 */}
        {detailStep === 2 && (<>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.txH, marginBottom: 4 }}>Step 3: 設定の確認</div>
          <div style={{ fontSize: 12, color: T.txD, marginBottom: 16, lineHeight: 1.6 }}>以下の内容で会費を設定します。あとから管理画面で変更できます。</div>

          <div style={{ ...cardS, marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.txD, marginBottom: 8 }}>会費プラン</div>
            {detailPlans.map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${T.bd}` }}>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: T.txH }}>{p.name}</span>
                  {p.isDefault && <span style={{ fontSize: 10, color: T.accent, marginLeft: 6 }}>デフォルト</span>}
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: T.txH }}>¥{p.amount.toLocaleString()} / {cycleName[p.cycle]}</span>
              </div>
            ))}
          </div>
          <div style={{ ...cardS, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.txD, marginBottom: 8 }}>会計期間</div>
            <div style={{ fontSize: 14, color: T.txH }}>{detailPeriodType === 'half_yearly' ? `${detailYear}年度（前期 + 後期）` : `${detailYear}年度`}</div>
            <div style={{ fontSize: 12, color: T.txD, marginTop: 2 }}>{detailYear}年4月1日 〜 {detailYear + 1}年3月31日</div>
          </div>

          <button onClick={applyDetailSetup} style={btnPrimary(true)}>この設定で開始する</button>
        </>)}
      </div>
    )}

    {/* =============== 管理画面（設定済み後） =============== */}
    {mode === 'manage' && (<>
      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${T.bd}`, flexShrink: 0 }}>
        <button onClick={() => setTab('plans')} style={tabS(tab === 'plans')}>プラン</button>
        <button onClick={() => setTab('periods')} style={tabS(tab === 'periods')}>期間</button>
        <button onClick={() => setTab('collection')} style={tabS(tab === 'collection')}>回収</button>
        <button onClick={() => setTab('logs')} style={tabS(tab === 'logs')}>履歴</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px 24px' }}>

        {/* ── プラン管理 ── */}
        {tab === 'plans' && (<>
          {/* 現在の設定サマリー */}
          <div style={{ ...cardS, marginBottom: 16, background: `${T.accent}06`, border: `1px solid ${T.accent}20` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.txH }}>現在の会費設定</span>
              <button onClick={resetToSetup} style={{ background: 'none', border: 'none', color: T.accent, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>初期設定に戻す</button>
            </div>
            <div style={{ fontSize: 12, color: T.txD, lineHeight: 1.6 }}>
              プラン数: {plans.length} ・ 有効: {plans.filter(p => p.isActive).length} ・ 会計期間: {periods.length}<br />
              プランの追加・金額変更・有効/無効の切替はここで行えます。変更はすぐに反映されますが、すでに割当済みの会費には影響しません。
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.txH }}>会費プラン ({plans.length})</span>
            <button onClick={() => setShowPlanForm(p => !p)} style={{ background: 'none', border: 'none', color: T.accent, cursor: 'pointer', display: 'flex', fontSize: 13, fontWeight: 600, gap: 4, alignItems: 'center' }}>{I.plus} 新規プラン</button>
          </div>
          {showPlanForm && (
            <div style={{ ...cardS, marginBottom: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input value={pf.name} onChange={e => setPf({ ...pf, name: e.target.value })} placeholder="プラン名（例: 通常会費）" style={inputS} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1, position: 'relative' }}>
                    <input value={pf.amount} onChange={e => setPf({ ...pf, amount: e.target.value.replace(/[^\d]/g, '') })} placeholder="金額" style={inputS} />
                    <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: T.txD, fontSize: 13 }}>円</span>
                  </div>
                  <select value={pf.cycle} onChange={e => setPf({ ...pf, cycle: e.target.value })} style={{ ...selectS, flex: 1 }}>
                    <option value="yearly">年次</option><option value="half_yearly">半期</option><option value="monthly">月次</option><option value="one_time">入会時のみ</option>
                  </select>
                </div>
                <input value={pf.desc} onChange={e => setPf({ ...pf, desc: e.target.value })} placeholder="説明（任意）" style={inputS} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.txH, cursor: 'pointer' }}>
                  <input type="checkbox" checked={pf.isDefault} onChange={e => setPf({ ...pf, isDefault: e.target.checked })} />
                  デフォルトプラン
                </label>
                <button onClick={addPlan} style={btnPrimary(pf.name.trim() && pf.amount)}>プランを作成</button>
              </div>
            </div>
          )}
          {plans.map(p => (
            <div key={p.id} style={{ ...cardS, marginBottom: 8, opacity: p.isActive ? 1 : 0.5 }}>
              {editPlanId === p.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input value={epf.name ?? p.name} onChange={e => setEpf({ ...epf, name: e.target.value })} style={inputS} placeholder="プラン名" />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                      <input value={epf.amount ?? p.amount} onChange={e => setEpf({ ...epf, amount: e.target.value.replace(/[^\d]/g, '') })} style={inputS} />
                      <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: T.txD, fontSize: 13 }}>円</span>
                    </div>
                    <select value={epf.cycle ?? p.cycle} onChange={e => setEpf({ ...epf, cycle: e.target.value })} style={{ ...selectS, flex: 1 }}>
                      <option value="yearly">年次</option><option value="half_yearly">半期</option><option value="monthly">月次</option><option value="one_time">入会時のみ</option>
                    </select>
                  </div>
                  <input value={epf.desc ?? p.desc} onChange={e => setEpf({ ...epf, desc: e.target.value })} placeholder="説明" style={inputS} />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.txH, cursor: 'pointer' }}>
                    <input type="checkbox" checked={epf.isDefault ?? p.isDefault} onChange={e => setEpf({ ...epf, isDefault: e.target.checked })} />
                    デフォルトプラン
                  </label>
                  <div style={{ fontSize: 11, color: T.txD, padding: '6px 0', lineHeight: 1.5 }}>金額を変更しても、すでに割当済みの会費には影響しません。新しい割当から反映されます。</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setEditPlanId(null)} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: `1px solid ${T.bd}`, background: 'transparent', color: T.txD, fontSize: 13, cursor: 'pointer' }}>キャンセル</button>
                    <button onClick={() => savePlanEdit(p.id)} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', background: T.accent, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>保存</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: T.txH }}>{p.name}</span>
                        {p.isDefault && <span style={{ fontSize: 10, fontWeight: 600, color: T.accent, padding: '2px 6px', borderRadius: 4, background: `${T.accent}14` }}>デフォルト</span>}
                        {!p.isActive && <span style={{ fontSize: 10, fontWeight: 600, color: T.txD, padding: '2px 6px', borderRadius: 4, background: T.bg4 }}>無効</span>}
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: T.txH, marginTop: 4 }}>¥{(p.amount || 0).toLocaleString()}<span style={{ fontSize: 12, fontWeight: 400, color: T.txD, marginLeft: 4 }}>/ {cycleName[p.cycle] || p.cycle}</span></div>
                    </div>
                  </div>
                  {p.desc && <div style={{ fontSize: 12, color: T.txD, marginTop: 6 }}>{p.desc}</div>}
                  <div style={{ display: 'flex', gap: 6, marginTop: 10, borderTop: `1px solid ${T.bd}`, paddingTop: 10 }}>
                    <button onClick={() => { setEditPlanId(p.id); setEpf({ name: p.name, amount: p.amount, cycle: p.cycle, desc: p.desc, isDefault: p.isDefault }); }} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${T.bd}`, background: 'transparent', color: T.accent, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>{I.pen} 編集</button>
                    <button onClick={() => togglePlanActive(p.id)} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${T.bd}`, background: 'transparent', color: p.isActive ? T.txD : T.green, fontSize: 12, cursor: 'pointer' }}>{p.isActive ? '無効化' : '有効化'}</button>
                    <button onClick={() => deletePlan(p.id)} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${T.red}30`, background: 'transparent', color: T.red, fontSize: 12, cursor: 'pointer', marginLeft: 'auto' }}>削除</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </>)}

        {/* ── 会計期間 ── */}
        {tab === 'periods' && (<>
          <div style={{ ...cardS, marginBottom: 16, background: `${T.accent}06`, border: `1px solid ${T.accent}20` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.txH, marginBottom: 4 }}>年度更新について</div>
            <div style={{ fontSize: 12, color: T.txD, lineHeight: 1.6 }}>新しい年度が始まったら「一括生成」で新しい期間を追加し、「現在に設定」を押してください。過去の期間データはそのまま残ります。</div>
          </div>

          {/* 一括生成 */}
          <div style={{ ...cardS, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.txH, marginBottom: 10 }}>期間を一括生成</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input type="number" value={genYear} onChange={e => setGenYear(Number(e.target.value))} style={{ ...inputS, flex: 1, textAlign: 'center' }} />
              <select value={genType} onChange={e => setGenType(e.target.value)} style={{ ...selectS, flex: 1 }}>
                <option value="yearly">年度 (4月〜3月)</option>
                <option value="half_yearly">半期 (前期+後期)</option>
              </select>
            </div>
            <button onClick={generatePeriods} style={btnPrimary(true)}>生成</button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.txH }}>会計期間 ({periods.length})</span>
            <button onClick={() => setShowPerForm(p => !p)} style={{ background: 'none', border: 'none', color: T.accent, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>手動追加</button>
          </div>
          {showPerForm && (
            <div style={{ ...cardS, marginBottom: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input value={perf.name} onChange={e => setPerf({ ...perf, name: e.target.value })} placeholder="期間名（例: 2026年度）" style={inputS} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="date" value={perf.startDate} onChange={e => setPerf({ ...perf, startDate: e.target.value })} style={{ ...inputS, flex: 1 }} />
                  <span style={{ color: T.txD, alignSelf: 'center' }}>〜</span>
                  <input type="date" value={perf.endDate} onChange={e => setPerf({ ...perf, endDate: e.target.value })} style={{ ...inputS, flex: 1 }} />
                </div>
                <button onClick={addPeriod} style={btnPrimary(perf.name.trim() && perf.startDate && perf.endDate)}>追加</button>
              </div>
            </div>
          )}
          {periods.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: T.txD, fontSize: 13 }}>会計期間がありません</div>
          ) : periods.map(p => (
            <div key={p.id} style={{ ...cardS, marginBottom: 8, border: `1px solid ${p.isCurrent ? T.accent : T.bd}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: T.txH }}>{p.name}</span>
                    {p.isCurrent && <span style={{ fontSize: 10, fontWeight: 600, color: T.accent, padding: '2px 6px', borderRadius: 4, background: `${T.accent}14` }}>現在</span>}
                  </div>
                  <div style={{ fontSize: 12, color: T.txD, marginTop: 2 }}>{p.startDate} 〜 {p.endDate}</div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {!p.isCurrent && <button onClick={() => setCurrentPeriod(p.id)} style={{ background: 'none', border: 'none', color: T.accent, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>現在に設定</button>}
                  <button onClick={() => deletePeriod(p.id)} style={btnDel}>{I.x}</button>
                </div>
              </div>
            </div>
          ))}
        </>)}

        {/* ── 回収管理 ── */}
        {tab === 'collection' && (<>
          <div style={{ marginBottom: 16 }}>
            <select value={selPeriod} onChange={e => setSelPeriod(e.target.value)} style={{ ...selectS, marginBottom: 8 }}>
              {periods.length === 0 && <option value="">期間がありません</option>}
              {periods.map(p => <option key={p.id} value={p.id}>{p.name}{p.isCurrent ? ' (現在)' : ''}</option>)}
            </select>
            {selPeriod && (
              <button onClick={bulkAssign} style={{ ...btnPrimary(true), marginBottom: 8 }}>全メンバーに会費を一括割当</button>
            )}
          </div>

          {periodAssignments.length > 0 && (
            <div style={{ ...cardS, marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.txH, marginBottom: 10 }}>回収状況</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                <Stat label="回収済" value={`¥${collectedAmount.toLocaleString()}`} color={T.green} />
                <Stat label="合計" value={`¥${totalAmount.toLocaleString()}`} color="#5b8ff9" />
              </div>
              <div style={{ height: 8, borderRadius: 4, background: T.bg4, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ height: '100%', width: totalAmount > 0 ? `${(collectedAmount / totalAmount) * 100}%` : '0%', borderRadius: 4, background: T.green, transition: 'width 0.3s' }} />
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                <span style={{ color: T.green }}>納入済 {stats.paid}</span>
                <span style={{ color: T.orange || '#d4843e' }}>未納 {stats.unpaid}</span>
                <span style={{ color: T.red }}>滞納 {stats.overdue}</span>
                <span style={{ color: T.txD }}>免除 {stats.exempt}</span>
              </div>
            </div>
          )}

          {periodAssignments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: T.txD, fontSize: 13 }}>
              {selPeriod ? 'この期間の会費割当はありません。「一括割当」で作成してください。' : '会計期間を選択してください'}
            </div>
          ) : periodAssignments.map(a => {
            const m = members.find(mm => mm.id === a.userId);
            return (
              <div key={a.id} style={{ ...cardS, marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: m?.color || '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{m?.avatar || a.userName?.[0] || '?'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: T.txH }}>{a.userName || m?.name || '不明'}</div>
                    <div style={{ fontSize: 12, color: T.txD }}>{a.planName || ''} · ¥{(a.amount || 0).toLocaleString()}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: statusColor[a.status], padding: '3px 8px', borderRadius: 6, background: `${statusColor[a.status]}14` }}>{statusLabel[a.status]}</span>
                </div>
                {a.confirmedBy && <div style={{ fontSize: 11, color: T.txD, marginTop: 6 }}>確認: {a.confirmedBy} ({a.confirmedAt ? new Date(a.confirmedAt).toLocaleDateString('ja') : ''})</div>}
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {a.status !== 'paid' && <button onClick={() => updateAssignStatus(a.id, 'paid')} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: T.green, color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>回収済</button>}
                  {a.status !== 'exempt' && <button onClick={() => updateAssignStatus(a.id, 'exempt')} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${T.bd}`, background: 'transparent', color: T.txD, fontSize: 11, cursor: 'pointer' }}>免除</button>}
                  {a.status !== 'overdue' && a.status !== 'paid' && <button onClick={() => updateAssignStatus(a.id, 'overdue')} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${T.red}40`, background: 'transparent', color: T.red, fontSize: 11, cursor: 'pointer' }}>滞納</button>}
                  {a.status !== 'unpaid' && <button onClick={() => updateAssignStatus(a.id, 'unpaid')} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${T.bd}`, background: 'transparent', color: T.txD, fontSize: 11, cursor: 'pointer' }}>未納に戻す</button>}
                </div>
              </div>
            );
          })}
        </>)}

        {/* ── 操作履歴 ── */}
        {tab === 'logs' && (<>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.txH, marginBottom: 12 }}>操作履歴 ({logs.length})</div>
          {logs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: T.txD, fontSize: 13 }}>まだ操作履歴はありません</div>
          ) : [...logs].reverse().map((l, i) => {
            const actionLabel = { created: '割当作成', paid: '回収確認', confirmed: '確認', exempted: '免除', overdue: '滞納設定', refunded: '返金', plan_changed: 'プラン変更', unpaid: '未納に戻す', exempt: '免除' };
            const actionColor = { paid: T.green, overdue: T.red, exempt: T.txD, unpaid: T.orange || '#d4843e' };
            return (
              <div key={l.id || i} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: `1px solid ${T.bd}` }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: actionColor[l.action] || T.accent, marginTop: 6, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: T.txH }}><span style={{ fontWeight: 600 }}>{l.actorName}</span> が <span style={{ fontWeight: 600 }}>{l.targetName}</span> を <span style={{ color: actionColor[l.action] || T.accent, fontWeight: 600 }}>{actionLabel[l.action] || l.action}</span></div>
                  {l.amount != null && <div style={{ fontSize: 12, color: T.txD, marginTop: 2 }}>¥{l.amount.toLocaleString()}</div>}
                  <div style={{ fontSize: 11, color: T.txD, marginTop: 2 }}>{l.ts ? new Date(l.ts).toLocaleString('ja') : ''}</div>
                </div>
              </div>
            );
          })}
        </>)}
      </div>
    </>)}
  </div>);
};

/* ── サークル探すセクション ── */
const GENRE_FILTERS = [
  { id: 'all', label: 'すべて' },
  { id: '運動', label: '運動', icon: '🏃' },
  { id: '技術', label: '技術', icon: '💻' },
  { id: '音楽', label: '音楽', icon: '🎵' },
  { id: '文化', label: '文化', icon: '🎨' },
  { id: '学術', label: '学術', icon: '📖' },
  { id: '初心者歓迎', label: '初心者歓迎', icon: '🌱' },
  { id: 'ゆるめ', label: 'ゆるめ', icon: '☕' },
  { id: '本格派', label: '本格派', icon: '🔥' },
];

const DiscoverSection = ({ discover, joinCircle }) => {
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState('all');
  const [sort, setSort] = useState('popular'); // popular, name, newest

  const filtered = discover.filter(c => {
    const matchQ = !query || c.name.toLowerCase().includes(query.toLowerCase()) || c.desc?.toLowerCase().includes(query.toLowerCase()) || (c.tags || []).some(t => t.includes(query));
    const matchG = genre === 'all' || (c.tags || []).includes(genre);
    return matchQ && matchG;
  }).sort((a, b) => {
    if (sort === 'popular') return (b.memberCount || 0) - (a.memberCount || 0);
    if (sort === 'name') return a.name.localeCompare(b.name, 'ja');
    return 0; // newest: default order
  });

  const chipS = (active) => ({ padding: '6px 14px', borderRadius: 20, border: `1px solid ${active ? T.accent : T.bd}`, background: active ? `${T.accent}14` : T.bg2, color: active ? T.accent : T.txD, fontSize: 12, fontWeight: active ? 600 : 400, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 });

  return (<>
    {/* 検索バー */}
    <div style={{ position: 'relative', marginBottom: 10 }}>
      <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.txD, display: 'flex', opacity: 0.6 }}>{I.search}</div>
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder="サークル名・タグで検索" style={{ width: '100%', padding: '10px 12px 10px 38px', borderRadius: 12, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
      {query && <button onClick={() => setQuery('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: T.txD, cursor: 'pointer', display: 'flex', padding: 2 }}>{I.x}</button>}
    </div>

    {/* ジャンルフィルター */}
    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 6, WebkitOverflowScrolling: 'touch', msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
      {GENRE_FILTERS.map(g => (
        <button key={g.id} onClick={() => setGenre(g.id)} style={chipS(genre === g.id)}>
          {g.icon ? `${g.icon} ${g.label}` : g.label}
        </button>
      ))}
    </div>

    {/* ソート＆件数 */}
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '0 2px' }}>
      <span style={{ fontSize: 12, color: T.txD }}>{filtered.length}件</span>
      <div style={{ display: 'flex', gap: 4 }}>
        {[{ id: 'popular', l: '人気' }, { id: 'name', l: '名前' }, { id: 'newest', l: '新着' }].map(s => (
          <button key={s.id} onClick={() => setSort(s.id)} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: sort === s.id ? `${T.accent}14` : 'transparent', color: sort === s.id ? T.accent : T.txD, fontSize: 11, fontWeight: sort === s.id ? 600 : 400, cursor: 'pointer' }}>{s.l}</button>
        ))}
      </div>
    </div>

    {/* サークル一覧 */}
    {filtered.length === 0 ? (
      <div style={{ textAlign: 'center', padding: 40, color: T.txD }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.txH, marginBottom: 4 }}>見つかりませんでした</div>
        <div style={{ fontSize: 12 }}>別のキーワードやジャンルで検索してみてください</div>
      </div>
    ) : filtered.map(c => (
      <div key={c.id} style={{ padding: 14, borderRadius: 14, background: T.bg2, border: `1px solid ${T.bd}`, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <CIcon icon={c.icon} color={c.color} sz={48} radius={14} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: T.txH, fontSize: 15 }}>{c.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <span style={{ fontSize: 12, color: T.txD, display: 'flex', alignItems: 'center', gap: 3 }}>{I.users} {c.memberCount}人</span>
            </div>
          </div>
        </div>
        <div style={{ fontSize: 13, color: T.tx, lineHeight: 1.6, marginBottom: 10 }}>{c.desc}</div>
        {/* タグ */}
        {(c.tags || []).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
            {c.tags.map(tag => (
              <span key={tag} onClick={() => { setGenre(GENRE_FILTERS.find(g => g.id === tag) ? tag : 'all'); setQuery(GENRE_FILTERS.find(g => g.id === tag) ? '' : tag); }} style={{ padding: '3px 10px', borderRadius: 12, background: T.bg4, color: T.txD, fontSize: 11, cursor: 'pointer' }}>#{tag}</span>
            ))}
          </div>
        )}
        <button onClick={() => joinCircle(c.id)} style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: 'none', background: T.accent, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>参加する</button>
      </div>
    ))}
  </>);
};

/* ── サークルView ── */
export const CircleView = ({ mob, circles = [], messages = {}, discover = [], sendMessage, createCircle, joinCircle, leaveCircle, addChannel, deleteChannel, pinMessage, updateCircle, onBack }) => {
  const user = useCurrentUser();
  const uid = user?.moodleId || user?.id;
  const [selCircle, setSelCircle] = useState(null);
  const [selChannel, setSelChannel] = useState(null);
  const [inp, setInp] = useState('');
  const [tab, setTab] = useState('my');
  const [showMembers, setShowMembers] = useState(!mob);
  const [showNewCh, setShowNewCh] = useState(false);
  const [newChName, setNewChName] = useState('');
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createColor, setCreateColor] = useState('#6375f0');
  const [showPins, setShowPins] = useState(false);
  const [homeSection, setHomeSection] = useState(null); // null=home, 'channels','members','events','recruit'
  const [editAppear, setEditAppear] = useState(null); // null or { icon, color, banner }
  const ref = useRef(null);
  const typingRoom = selChannel ? `circle:${selChannel}` : null;
  const { typingUsers, setTyping } = useTyping(typingRoom, { id: uid, name: user?.name });

  const sc = circles.find(c => c.id === selCircle);
  const chMsgs = selChannel ? (messages[selChannel] || []) : [];
  const pinnedMsgs = chMsgs.filter(m => m.pinned);

  // Mobile navigation level: 0=list, 1=circle, 2=chat
  const level = selChannel && sc ? 2 : sc ? 1 : 0;

  useEffect(() => { ref.current?.scrollIntoView({ behavior: 'smooth' }); }, [chMsgs.length]);

  const goCircle = (id) => { setSelCircle(id); setSelChannel(null); setShowNewCh(false); setHomeSection(null); };
  const goChannel = (chId) => { setSelChannel(chId); setShowMembers(false); setShowPins(false); };
  const backToList = useCallback(() => { setSelCircle(null); setSelChannel(null); setShowNewCh(false); setHomeSection(null); }, []);
  const backToCircle = useCallback(() => { setSelChannel(null); setShowMembers(false); setShowPins(false); setInp(''); setHomeSection(null); }, []);

  const doSend = () => {
    if (!inp.trim() || !selChannel) return;
    sendMessage(selChannel, inp, user);
    setInp('');
    setTyping(false);
  };

  const doCreateCircle = () => {
    if (!createName.trim()) return;
    const c = createCircle(createName.trim(), createDesc.trim(), createColor);
    setCreateName(''); setCreateDesc(''); setCreateColor('#6375f0');
    if (mob) {
      goCircle(c.id); setTab('my');
    } else {
      setSelCircle(c.id); setSelChannel(c.channels[0]?.id); setTab('my');
    }
  };

  const doAddChannel = () => {
    if (!newChName.trim() || !selCircle) return;
    addChannel(selCircle, newChName);
    setNewChName(''); setShowNewCh(false);
  };

  const colors = ['#6375f0', '#e5534b', '#3dae72', '#d4843e', '#a855c7', '#2d9d8f', '#c6a236', '#c75d8e'];

  // Swipe handlers per level
  const swipe1 = useSwipeBack(backToList, level === 1);
  const swipe2 = useSwipeBack(backToCircle, level === 2);

  // ============================================================
  // MOBILE — stacked panels with slide transitions
  // ============================================================
  if (mob) {
    const sch = sc?.channels?.find(c => c.id === selChannel);

    return (
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

        {/* ── Panel 0: Circle list ── */}
        <Panel show={true} active={level === 0} direction="left">
          <Hdr title="サークル" back={onBack} />
          <div style={{ display: 'flex', borderBottom: `1px solid ${T.bd}`, background: T.bg2, flexShrink: 0 }}>
            {[{ id: 'my', l: '参加中' }, { id: 'discover', l: '探す' }, { id: 'create', l: '作成' }].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, padding: '10px 0', border: 'none', borderBottom: tab === t.id ? `2px solid ${T.accent}` : '2px solid transparent', background: 'transparent', color: tab === t.id ? T.txH : T.txD, fontSize: 13, fontWeight: tab === t.id ? 600 : 400, cursor: 'pointer' }}>{t.l}</button>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
            {tab === 'my' && <>
              {circles.length === 0 && (
                <div style={{ textAlign: 'center', padding: 40, color: T.txD, fontSize: 13 }}>
                  参加中のサークルはありません<br />
                  <button onClick={() => setTab('discover')} style={{ marginTop: 8, background: 'none', border: 'none', color: T.accent, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>サークルを探す →</button>
                </div>
              )}
              {circles.map(c => {
                const allMsgs = (c.channels || []).flatMap(ch => messages[ch.id] || []);
                const lastMsg = allMsgs.sort((a, b) => new Date(b.ts) - new Date(a.ts))[0];
                return (
                  <div key={c.id} onClick={() => goCircle(c.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, background: T.bg2, border: `1px solid ${T.bd}`, marginBottom: 8, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
                    <CIcon icon={c.icon} color={c.color} sz={44} radius={12} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 600, color: T.txH, fontSize: 15 }}>{c.name}</span>
                        {c.role === 'admin' && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: `${T.accent}20`, color: T.accent, fontWeight: 600 }}>管理者</span>}
                      </div>
                      <div style={{ fontSize: 12, color: T.txD, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                        {lastMsg ? <>{lastMsg.name}: {lastMsg.text}</> : <>{c.memberCount}人 · {c.channels?.length || 0}ch</>}
                      </div>
                    </div>
                    <span style={{ color: T.txD, display: 'flex', flexShrink: 0 }}>{I.arr}</span>
                  </div>
                );
              })}
            </>}

            {tab === 'discover' && <DiscoverSection discover={discover} joinCircle={joinCircle} />}

            {tab === 'create' && (
              <div style={{ padding: 4 }}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: T.txD, display: 'block', marginBottom: 6 }}>サークル名 *</label>
                  <input value={createName} onChange={e => setCreateName(e.target.value)} placeholder="例: プログラミング研究会" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 16, outline: 'none', fontFamily: 'inherit' }} />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: T.txD, display: 'block', marginBottom: 6 }}>説明</label>
                  <textarea value={createDesc} onChange={e => setCreateDesc(e.target.value)} placeholder="サークルの説明を入力..." rows={3} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 16, outline: 'none', fontFamily: 'inherit', resize: 'vertical' }} />
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: T.txD, display: 'block', marginBottom: 8 }}>カラー</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {colors.map(c => (
                      <button key={c} onClick={() => setCreateColor(c)} style={{ width: 36, height: 36, borderRadius: 8, background: c, border: createColor === c ? '3px solid #fff' : '2px solid transparent', cursor: 'pointer', boxShadow: createColor === c ? `0 0 0 2px ${c}` : 'none' }} />
                    ))}
                  </div>
                </div>
                <button onClick={doCreateCircle} disabled={!createName.trim()} style={{ width: '100%', padding: '12px 0', borderRadius: 10, border: 'none', background: createName.trim() ? T.accent : T.bg3, color: createName.trim() ? '#fff' : T.txD, fontSize: 14, fontWeight: 600, cursor: createName.trim() ? 'pointer' : 'default' }}>サークルを作成</button>
                <div style={{ marginTop: 12, fontSize: 12, color: T.txD, lineHeight: 1.6, textAlign: 'center' }}>作成すると自動的に管理者になります。<br />general, announcements, random チャンネルが作成されます。</div>
              </div>
            )}
          </div>
        </Panel>

        {/* ── Panel 1: Circle Home ── */}
        <Panel show={!!sc} active={level === 1} direction={level === 0 ? 'right' : 'left'}>
          <div {...swipe1} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Hdr
              title={sc ? <><CIcon icon={sc.icon} color={sc.color} sz={22} radius={6} style={{ fontSize: 9 }} />{sc.name}</> : 'サークル'}
              back={() => { if (homeSection) setHomeSection(null); else backToList(); }}
              right={sc && <div style={{ display: 'flex', gap: 2 }}>
                {sc.role === 'admin' && <button onClick={() => setHomeSection('admin')} style={{ background: 'none', border: 'none', color: homeSection === 'admin' ? T.accent : T.txD, cursor: 'pointer', display: 'flex', padding: 4 }}>{I.setting}</button>}
              </div>}
            />
            {sc && (
              <div style={{ flex: 1, overflowY: 'auto' }}>

                {/* ── サークルホーム (default) ── */}
                {!homeSection && <>
                  {/* Banner */}
                  <div style={{ position: 'relative' }}>
                    {/* Header image */}
                    <div style={{ height: 100, background: sc.banner ? `url(${sc.banner}) center/cover` : `linear-gradient(135deg, ${sc.color}dd 0%, ${sc.color}55 100%)`, position: 'relative' }}>
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 40, background: `linear-gradient(transparent, ${T.bg})` }} />
                      {sc.role === 'admin' && updateCircle && (
                        <button onClick={() => setEditAppear({ icon: sc.icon, color: sc.color, banner: sc.banner || '' })} style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 8, background: 'rgba(0,0,0,.45)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{I.pen}</button>
                      )}
                    </div>
                    {/* Profile card overlapping banner */}
                    <div style={{ margin: '-30px 14px 0', position: 'relative', padding: '14px 16px 14px', borderRadius: 16, background: T.bg2, border: `1px solid ${T.bd}`, boxShadow: '0 2px 12px rgba(0,0,0,.15)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: sc.desc ? 10 : 0 }}>
                        <div onClick={() => { if (sc.role === 'admin' && updateCircle) setEditAppear({ icon: sc.icon, color: sc.color, banner: sc.banner || '' }); }} style={{ cursor: sc.role === 'admin' ? 'pointer' : 'default' }}>
                          <CIcon icon={sc.icon} color={sc.color} sz={48} radius={14} style={{ boxShadow: '0 2px 8px rgba(0,0,0,.15)' }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 17, color: T.txH, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sc.name}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                            <span style={{ fontSize: 12, color: T.txD, display: 'flex', alignItems: 'center', gap: 3 }}>{I.users} {sc.members?.length || sc.memberCount}人</span>
                            {sc.role === 'admin' && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: `${sc.color}20`, color: sc.color, fontWeight: 700 }}>管理者</span>}
                          </div>
                        </div>
                      </div>
                      {sc.desc && <div style={{ fontSize: 13, color: T.tx, lineHeight: 1.5 }}>{sc.desc}</div>}
                    </div>
                    <div style={{ height: 10 }} />
                  </div>

                  {/* Quick Menu - 2x2 rich cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '6px 16px 14px' }}>
                    {[
                      { id: 'channels', icon: I.chat, color: '#6375f0', label: 'チャット', sub: `${sc.channels?.length || 0}チャンネル` },
                      { id: 'events', icon: I.event || I.cal, color: '#3dae72', label: 'イベント', sub: `${sc.events?.length || 0}件` },
                      { id: 'members', icon: I.users, color: '#d4843e', label: 'メンバー', sub: `${sc.members?.length || sc.memberCount}人` },
                      { id: 'recruit', icon: I.mega, color: '#a855c7', label: '募集', sub: sc.recruit?.length ? `${sc.recruit.length}件募集中` : 'なし' },
                    ].map(item => (
                      <button key={item.id} onClick={() => setHomeSection(item.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 12px', borderRadius: 14, border: `1px solid ${T.bd}`, background: T.bg2, cursor: 'pointer', textAlign: 'left', WebkitTapHighlightColor: 'transparent' }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: `${item.color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: item.color, flexShrink: 0 }}>{item.icon}</div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: T.txH }}>{item.label}</div>
                          <div style={{ fontSize: 11, color: T.txD, marginTop: 1 }}>{item.sub}</div>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Announcements */}
                  {(sc.announcements?.length > 0) && (
                    <div style={{ margin: '0 16px 12px' }}>
                      <div style={{ padding: '12px 14px', borderRadius: 14, background: T.bg2, border: `1px solid ${T.bd}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                          <div style={{ width: 24, height: 24, borderRadius: 6, background: `${T.orange}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.orange }}>{I.bell}</div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: T.txH }}>お知らせ</span>
                        </div>
                        {sc.announcements.slice(0, 2).map((a, i) => (
                          <div key={a.id} style={{ padding: '8px 0', borderTop: i > 0 ? `1px solid ${T.bd}` : 'none' }}>
                            <div style={{ fontSize: 13, color: T.txH, lineHeight: 1.5 }}>{a.text}</div>
                            <div style={{ fontSize: 11, color: T.txD, marginTop: 3 }}>{a.by}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Upcoming Events Preview */}
                  {(sc.events?.length > 0) && (
                    <div style={{ margin: '0 16px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 24, height: 24, borderRadius: 6, background: `${T.green}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.green }}>{I.cal}</div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: T.txH }}>今後のイベント</span>
                        </div>
                        <button onClick={() => setHomeSection('events')} style={{ background: 'none', border: 'none', color: T.accent, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>すべて</button>
                      </div>
                      {sc.events.slice(0, 2).map(ev => {
                        const evd = ev.date instanceof Date ? ev.date : new Date(ev.date);
                        return (
                          <div key={ev.id} onClick={() => setHomeSection('events')} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12, background: T.bg2, border: `1px solid ${T.bd}`, marginBottom: 6, cursor: 'pointer' }}>
                            <div style={{ width: 42, height: 48, borderRadius: 10, background: `${sc.color}10`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <span style={{ fontSize: 9, fontWeight: 700, color: sc.color, textTransform: 'uppercase' }}>{evd.toLocaleDateString('ja', { month: 'short' })}</span>
                              <span style={{ fontSize: 20, fontWeight: 800, color: T.txH, lineHeight: 1 }}>{evd.getDate()}</span>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 600, color: T.txH }}>{ev.title}</div>
                              <div style={{ fontSize: 11, color: T.txD, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>{ev.location}</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                <div style={{ display: 'flex' }}>
                                  {(ev.going || []).slice(0, 4).map((uid, i) => {
                                    const m = sc.members?.find(mm => mm.id === uid);
                                    return m ? <div key={uid} style={{ width: 18, height: 18, borderRadius: '50%', background: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 8, fontWeight: 700, marginLeft: i > 0 ? -5 : 0, border: `1.5px solid ${T.bg}` }}>{m.avatar}</div> : null;
                                  })}
                                </div>
                                <span style={{ fontSize: 10, color: T.txD }}>{ev.going?.length || 0}人</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Recent Channels Preview */}
                  <div style={{ margin: '0 16px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 24, height: 24, borderRadius: 6, background: `${T.accent}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.accent }}>{I.chat}</div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: T.txH }}>チャット</span>
                      </div>
                      <button onClick={() => setHomeSection('channels')} style={{ background: 'none', border: 'none', color: T.accent, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>すべて</button>
                    </div>
                    <div style={{ borderRadius: 12, background: T.bg2, border: `1px solid ${T.bd}`, overflow: 'hidden' }}>
                      {sc.channels?.slice(0, 3).map((ch, i) => {
                        const chm = messages[ch.id] || [];
                        const lastMsg = chm[chm.length - 1];
                        return (
                          <button key={ch.id} onClick={() => goChannel(ch.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', border: 'none', borderTop: i > 0 ? `1px solid ${T.bd}` : 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', WebkitTapHighlightColor: 'transparent' }}>
                            <span style={{ width: 28, height: 28, borderRadius: 7, background: `${T.accent}10`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.accent, fontSize: 14, fontWeight: 700, flexShrink: 0 }}>#</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: lastMsg ? 600 : 400, color: lastMsg ? T.txH : T.txD }}>{ch.name}</div>
                              {lastMsg && <div style={{ fontSize: 11, color: T.txD, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{lastMsg.name}: {lastMsg.text}</div>}
                            </div>
                            <span style={{ color: T.txD, opacity: 0.4, display: 'flex' }}>{I.arr}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Recruitment Preview */}
                  {(sc.recruit?.length > 0) && (
                    <div style={{ margin: '0 16px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <div style={{ width: 24, height: 24, borderRadius: 6, background: '#a855c714', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a855c7' }}>{I.mega}</div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: T.txH }}>募集中</span>
                      </div>
                      {sc.recruit.slice(0, 1).map(r => {
                        const remaining = r.spots - r.applied;
                        return (
                          <div key={r.id} onClick={() => setHomeSection('recruit')} style={{ padding: '12px 14px', borderRadius: 12, background: T.bg2, border: `1px solid ${T.bd}`, cursor: 'pointer' }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: T.txH, marginBottom: 4 }}>{r.title}</div>
                            <div style={{ fontSize: 12, color: T.tx, lineHeight: 1.4, marginBottom: 8 }}>{r.desc}</div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: remaining > 0 ? `${T.green}14` : `${T.red}14`, color: remaining > 0 ? T.green : T.red, fontWeight: 600 }}>残り{remaining}枠</span>
                                <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: T.bg3, color: T.txD }}>~{(r.deadline instanceof Date ? r.deadline : new Date(r.deadline)).toLocaleDateString('ja', { month: 'numeric', day: 'numeric' })}</span>
                              </div>
                              <span style={{ fontSize: 11, color: T.accent, fontWeight: 600 }}>詳細</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Members preview row */}
                  <div style={{ margin: '0 16px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 24, height: 24, borderRadius: 6, background: `${T.orange}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.orange }}>{I.users}</div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: T.txH }}>メンバー ({sc.members?.length || sc.memberCount})</span>
                      </div>
                      <button onClick={() => setHomeSection('members')} style={{ background: 'none', border: 'none', color: T.accent, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>すべて</button>
                    </div>
                    <div style={{ display: 'flex', gap: -4, padding: '0 2px' }}>
                      {(sc.members || []).slice(0, 8).map((m, i) => (
                        <div key={m.id} style={{ marginLeft: i > 0 ? -6 : 0 }}>
                          <Av u={{ name: m.name, av: m.avatar, col: m.color }} sz={32} />
                        </div>
                      ))}
                      {(sc.members?.length || 0) > 8 && <div style={{ width: 32, height: 32, borderRadius: '50%', background: T.bg3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: T.txD, marginLeft: -6, border: `2px solid ${T.bg}` }}>+{(sc.members?.length || 0) - 8}</div>}
                    </div>
                  </div>

                  {/* Leave button */}
                  {leaveCircle && sc.role !== 'admin' && (
                    <div style={{ padding: '4px 16px 24px' }}>
                      <button onClick={() => { leaveCircle(sc.id); backToList(); }} style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: 'none', background: `${T.red}0a`, color: T.red, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>サークルを退出</button>
                    </div>
                  )}
                </>}

                {/* ── チャンネル一覧 ── */}
                {homeSection === 'channels' && (
                  <div style={{ padding: '8px 10px' }}>
                    {showNewCh && (
                      <div style={{ display: 'flex', gap: 6, padding: '6px 4px 10px' }}>
                        <input value={newChName} onChange={e => setNewChName(e.target.value)} onKeyDown={e => e.key === 'Enter' && doAddChannel()} placeholder="チャンネル名" style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 16, outline: 'none' }} autoFocus />
                        <button onClick={doAddChannel} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: T.accent, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>追加</button>
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 4px 8px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.txD, letterSpacing: 0.5 }}>テキストチャンネル ({sc.channels?.length || 0})</span>
                      {sc.role === 'admin' && <button onClick={() => setShowNewCh(p => !p)} style={{ background: 'none', border: 'none', color: T.accent, cursor: 'pointer', display: 'flex', padding: 2 }}>{I.plus}</button>}
                    </div>
                    {(() => {
                      const cats = sc.categories || [];
                      const allCh = sc.channels || [];
                      const uncategorized = allCh.filter(ch => !ch.categoryId || !cats.find(c => c.id === ch.categoryId));
                      const grouped = cats.map(cat => ({ ...cat, chs: allCh.filter(ch => ch.categoryId === cat.id) })).filter(g => g.chs.length > 0);
                      const ChBtn = (ch) => {
                        const chm = messages[ch.id] || [];
                        const lastMsg = chm[chm.length - 1];
                        return (
                          <button key={ch.id} onClick={() => goChannel(ch.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 10px', borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg2, marginBottom: 6, cursor: 'pointer', textAlign: 'left', WebkitTapHighlightColor: 'transparent' }}>
                            <span style={{ color: T.accent, fontSize: 20, fontWeight: 400, flexShrink: 0, width: 24, textAlign: 'center' }}>#</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 500, color: T.txH }}>{ch.name}</div>
                              {lastMsg && <div style={{ fontSize: 11, color: T.txD, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>{lastMsg.name}: {lastMsg.text}</div>}
                            </div>
                            {sc.role === 'admin' && ch.name !== 'general' && (
                              <button onClick={e => { e.stopPropagation(); deleteChannel(sc.id, ch.id); }} style={{ background: 'none', border: 'none', color: T.txD, cursor: 'pointer', display: 'flex', padding: 2, opacity: 0.4 }}>{I.x}</button>
                            )}
                          </button>
                        );
                      };
                      return (
                        <>
                          {grouped.map(g => (
                            <div key={g.id} style={{ marginBottom: 8 }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: T.txD, letterSpacing: 0.5, textTransform: 'uppercase', padding: '6px 4px 4px' }}>{g.name}</div>
                              {g.chs.map(ChBtn)}
                            </div>
                          ))}
                          {uncategorized.length > 0 && (
                            <div>
                              {grouped.length > 0 && <div style={{ fontSize: 10, fontWeight: 700, color: T.txD, letterSpacing: 0.5, padding: '6px 4px 4px' }}>その他</div>}
                              {uncategorized.map(ChBtn)}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* ── イベント一覧 ── */}
                {homeSection === 'events' && (
                  <div style={{ padding: '10px 14px' }}>
                    {(!sc.events || sc.events.length === 0) ? (
                      <div style={{ textAlign: 'center', padding: 32, color: T.txD, fontSize: 13 }}>イベントはまだありません</div>
                    ) : sc.events.map(ev => {
                      const evDate = ev.date instanceof Date ? ev.date : new Date(ev.date);
                      const isGoing = ev.going?.includes(uid);
                      return (
                        <div key={ev.id} style={{ padding: '14px', borderRadius: 12, background: T.bg2, border: `1px solid ${T.bd}`, marginBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                            <div style={{ width: 44, textAlign: 'center', padding: '6px 0', borderRadius: 8, background: `${sc.color}14`, flexShrink: 0 }}>
                              <div style={{ fontSize: 10, color: sc.color, fontWeight: 700 }}>{evDate.toLocaleDateString('ja', { month: 'short' })}</div>
                              <div style={{ fontSize: 20, fontWeight: 700, color: T.txH }}>{evDate.getDate()}</div>
                              <div style={{ fontSize: 10, color: T.txD }}>{evDate.toLocaleTimeString('ja', { hour: '2-digit', minute: '2-digit' })}</div>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 15, fontWeight: 600, color: T.txH, marginBottom: 4 }}>{ev.title}</div>
                              <div style={{ fontSize: 12, color: T.txD, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>{I.pin} {ev.location}</div>
                              {ev.desc && <div style={{ fontSize: 12, color: T.tx, lineHeight: 1.5, marginTop: 4 }}>{ev.desc}</div>}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                                <span style={{ fontSize: 11, color: T.txD }}>{ev.going?.length || 0}人参加</span>
                                <span style={{ fontSize: 11, color: isGoing ? T.green : T.accent, fontWeight: 600 }}>{isGoing ? '参加予定' : ''}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ── メンバー一覧 ── */}
                {homeSection === 'members' && (
                  <div style={{ padding: '6px 10px' }}>
                    {(() => {
                      const admins = (sc.members || []).filter(m => m.role === 'admin');
                      const mems = (sc.members || []).filter(m => m.role !== 'admin');
                      return <>
                        {admins.length > 0 && (
                          <div style={{ padding: '6px 4px 4px' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: T.txD, letterSpacing: 0.5, marginBottom: 6 }}>管理者 ({admins.length})</div>
                            {admins.map(m => (
                              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px', borderRadius: 10, marginBottom: 2 }}>
                                <Av u={{ name: m.name, av: m.avatar, col: m.color }} sz={34} />
                                <span style={{ flex: 1, fontWeight: 600, color: T.txH, fontSize: 14 }}>{m.name}</span>
                                <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: `${T.accent}16`, color: T.accent, fontWeight: 600 }}>管理者</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {mems.length > 0 && (
                          <div style={{ padding: '6px 4px 4px' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: T.txD, letterSpacing: 0.5, marginBottom: 6 }}>メンバー ({mems.length})</div>
                            {mems.map(m => (
                              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px', borderRadius: 10, marginBottom: 2 }}>
                                <Av u={{ name: m.name, av: m.avatar, col: m.color }} sz={34} />
                                <span style={{ flex: 1, fontWeight: 600, color: T.txH, fontSize: 14 }}>{m.name}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>;
                    })()}
                  </div>
                )}

                {/* ── 募集一覧 ── */}
                {homeSection === 'recruit' && (
                  <div style={{ padding: '10px 14px' }}>
                    {(!sc.recruit || sc.recruit.length === 0) ? (
                      <div style={{ textAlign: 'center', padding: 32, color: T.txD, fontSize: 13 }}>現在募集はありません</div>
                    ) : sc.recruit.map(r => {
                      const dl = r.deadline instanceof Date ? r.deadline : new Date(r.deadline);
                      const remaining = r.spots - r.applied;
                      return (
                        <div key={r.id} style={{ padding: 14, borderRadius: 12, background: T.bg2, border: `1px solid ${T.bd}`, marginBottom: 8 }}>
                          <div style={{ fontSize: 15, fontWeight: 600, color: T.txH, marginBottom: 6 }}>{r.title}</div>
                          <div style={{ fontSize: 13, color: T.tx, lineHeight: 1.5, marginBottom: 8 }}>{r.desc}</div>
                          <div style={{ display: 'flex', gap: 12, fontSize: 12, color: T.txD, marginBottom: 10 }}>
                            <span>残り {remaining}/{r.spots} 枠</span>
                            <span>締切 {dl.toLocaleDateString('ja')}</span>
                          </div>
                          <div style={{ height: 4, borderRadius: 2, background: T.bg4, marginBottom: 10 }}>
                            <div style={{ height: '100%', borderRadius: 2, background: remaining > 0 ? T.accent : T.red, width: `${(r.applied / r.spots) * 100}%` }} />
                          </div>
                          {remaining > 0 && (
                            <button style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: 'none', background: T.accent, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>応募する</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ── 管理者設定 ── */}
                {homeSection === 'admin' && sc.role === 'admin' && (
                  <AdminSection sc={sc} updateCircle={updateCircle} setEditAppear={setEditAppear} addChannel={addChannel} deleteChannel={deleteChannel} leaveCircle={leaveCircle} backToList={backToList} user={user} />
                )}
              </div>
            )}
          </div>
        </Panel>

        {/* ── Panel 2: Channel chat ── */}
        <Panel show={!!selChannel && !!sc} active={level === 2} direction="right">
          <div {...swipe2} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Hdr
              title={sc ? <><CIcon icon={sc.icon} color={sc.color} sz={20} radius={5} style={{ fontSize: 8 }} /><span style={{ color: T.txD }}>#</span>{sch?.name}</> : '#'}
              back={backToCircle}
              right={<div style={{ display: 'flex', gap: 2 }}>
                <button onClick={() => setShowPins(p => !p)} style={{ background: 'none', border: 'none', color: showPins ? T.accent : T.txD, cursor: 'pointer', display: 'flex', padding: 4 }}>{I.pin}</button>
                <button onClick={() => setShowMembers(p => !p)} style={{ background: 'none', border: 'none', color: showMembers ? T.accent : T.txD, cursor: 'pointer', display: 'flex', padding: 4 }}>{I.users}</button>
              </div>}
            />

            {showPins && pinnedMsgs.length > 0 && (
              <div style={{ padding: '6px 12px', background: `${T.accent}08`, borderBottom: `1px solid ${T.bd}`, flexShrink: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.accent, marginBottom: 4 }}>📌 ピン留め ({pinnedMsgs.length})</div>
                {pinnedMsgs.map(m => (
                  <div key={m.id} style={{ fontSize: 12, color: T.txH, padding: '3px 0' }}>
                    <span style={{ fontWeight: 600, color: m.color }}>{m.name}</span>: {m.text}
                  </div>
                ))}
              </div>
            )}

            {showMembers && (
              <div style={{ padding: '6px 0', background: T.bg3, borderBottom: `1px solid ${T.bd}`, maxHeight: 150, overflowY: 'auto', flexShrink: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.txD, padding: '2px 12px 4px', letterSpacing: 0.5 }}>メンバー ({sc?.members?.length || sc?.memberCount || 0})</div>
                {(sc?.members || []).map(m => <MemberRow key={m.id} m={m} sz={20} />)}
              </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', padding: '6px 10px' }}>
              {chMsgs.length === 0 && (
                <div style={{ textAlign: 'center', padding: 32, color: T.txD, fontSize: 13 }}>
                  <div style={{ fontSize: 28, marginBottom: 6, color: T.accent }}>#</div>
                  <b style={{ color: T.txH }}>#{sch?.name}</b> へようこそ！<br />最初のメッセージを送りましょう
                </div>
              )}
              {chMsgs.map(m => (
                <div key={m.id} style={{ display: 'flex', gap: 8, marginBottom: 6, padding: '4px 2px' }}>
                  <Av u={{ name: m.name, av: m.avatar, col: m.color }} sz={30} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, color: m.color || T.txH, fontSize: 13 }}>{m.name}</span>
                      <span style={{ fontSize: 10, color: T.txD }}>{fTs(m.ts instanceof Date ? m.ts : new Date(m.ts))}</span>
                      {m.pinned && <span style={{ fontSize: 9, color: T.accent }}>📌</span>}
                    </div>
                    <div style={{ fontSize: 14, color: T.txH, lineHeight: 1.5, wordBreak: 'break-word' }}><Tx>{m.text}</Tx></div>
                  </div>
                  {sc?.role === 'admin' && (
                    <button onClick={() => pinMessage(selChannel, m.id)} style={{ background: 'none', border: 'none', color: m.pinned ? T.accent : T.txD, cursor: 'pointer', alignSelf: 'flex-start', opacity: 0.5, padding: 2, flexShrink: 0 }}>{I.pin}</button>
                  )}
                </div>
              ))}
              <div ref={ref} />
            </div>

            {typingUsers.length > 0 && <div style={{ padding: '2px 12px', fontSize: 11, color: T.txD, fontStyle: 'italic', flexShrink: 0 }}>{typingUsers.join('、')}が入力中...</div>}

            <div style={{ padding: '6px 8px', borderTop: `1px solid ${T.bd}`, background: T.bg2, flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '3px 3px 3px 12px', borderRadius: 20, background: T.bg3, border: `1px solid ${T.bd}` }}>
                <input value={inp} onChange={e => { setInp(e.target.value); setTyping(!!e.target.value.trim()); }} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), doSend())} placeholder={`#${sch?.name || ''} にメッセージ...`} style={{ flex: 1, padding: '8px 0', border: 'none', background: 'transparent', color: T.txH, fontSize: 16, outline: 'none', fontFamily: 'inherit' }} />
                <button onClick={doSend} style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: inp.trim() ? T.accent : 'transparent', color: inp.trim() ? '#fff' : T.txD, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>{I.send}</button>
              </div>
            </div>
          </div>
        </Panel>

        {editAppear && <EditAppearModal data={editAppear} onClose={() => setEditAppear(null)} onSave={d => { if (updateCircle && sc) updateCircle(sc.id, { icon: d.icon || sc.icon, color: d.color || sc.color, banner: d.banner || undefined }); }} />}
      </div>
    );
  }

  // ============================================================
  // DESKTOP (unchanged)
  // ============================================================
  if (sc && selChannel) {
    const sch = sc.channels?.find(c => c.id === selChannel);
    return (
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ width: 200, background: T.bg2, borderRight: `1px solid ${T.bd}`, display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'auto' }}>
          <div style={{ padding: '12px 12px 8px', borderBottom: `1px solid ${T.bd}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div onClick={() => { if (sc.role === 'admin' && updateCircle) setEditAppear({ icon: sc.icon, color: sc.color, banner: sc.banner || '' }); }} style={{ cursor: sc.role === 'admin' ? 'pointer' : 'default' }}><CIcon icon={sc.icon} color={sc.color} sz={24} radius={6} style={{ fontSize: 10 }} /></div>
              <span style={{ fontWeight: 700, fontSize: 14, color: T.txH, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sc.name}</span>
              <button onClick={() => { setSelCircle(null); setSelChannel(null); }} style={{ background: 'none', border: 'none', color: T.txD, cursor: 'pointer', display: 'flex' }}>{I.back}</button>
            </div>
            <div style={{ fontSize: 11, color: T.txD, marginTop: 4, lineHeight: 1.4 }}>{sc.desc}</div>
          </div>
          <div style={{ padding: '6px 0', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '4px 12px', marginBottom: 2 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: T.txD, letterSpacing: 0.5, flex: 1 }}>TEXT CHANNELS</span>
              {sc.role === 'admin' && <button onClick={() => setShowNewCh(true)} style={{ background: 'none', border: 'none', color: T.txD, cursor: 'pointer', display: 'flex', padding: 0 }}>{I.plus}</button>}
            </div>
            {sc.channels?.map(ch => (
              <button key={ch.id} onClick={() => setSelChannel(ch.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', border: 'none', cursor: 'pointer', fontSize: 13, background: selChannel === ch.id ? `${T.accent}14` : 'transparent', color: selChannel === ch.id ? T.txH : T.txD, textAlign: 'left', borderLeft: selChannel === ch.id ? `2px solid ${T.accent}` : '2px solid transparent' }}>
                <span style={{ color: T.txD }}>#</span>
                <span style={{ flex: 1 }}>{ch.name}</span>
                {sc.role === 'admin' && ch.name !== 'general' && (
                  <button onClick={e => { e.stopPropagation(); deleteChannel(sc.id, ch.id); if (selChannel === ch.id) setSelChannel(sc.channels[0]?.id); }} style={{ background: 'none', border: 'none', color: T.txD, cursor: 'pointer', display: 'flex', padding: 0, opacity: 0.5, fontSize: 10 }}>{I.x}</button>
                )}
              </button>
            ))}
            {showNewCh && (
              <div style={{ padding: '6px 12px' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  <input value={newChName} onChange={e => setNewChName(e.target.value)} onKeyDown={e => e.key === 'Enter' && doAddChannel()} placeholder="チャンネル名" style={{ flex: 1, padding: '4px 8px', borderRadius: 6, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 12, outline: 'none' }} />
                  <button onClick={doAddChannel} style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: T.accent, color: '#fff', fontSize: 11, cursor: 'pointer' }}>追加</button>
                </div>
              </div>
            )}
          </div>
          {leaveCircle && sc.role !== 'admin' && (
            <button onClick={() => { leaveCircle(sc.id); setSelCircle(null); setSelChannel(null); }} style={{ margin: '8px 12px', padding: '6px 0', borderRadius: 8, border: `1px solid ${T.bd}`, background: 'transparent', color: T.red, fontSize: 12, cursor: 'pointer' }}>サークルを退出</button>
          )}
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', height: 44, borderBottom: `1px solid ${T.bd}`, flexShrink: 0 }}>
            <span style={{ color: T.txD, fontSize: 18 }}>#</span>
            <span style={{ fontWeight: 700, color: T.txH, fontSize: 15 }}>{sch?.name}</span>
            <div style={{ flex: 1 }} />
            <button onClick={() => setShowPins(p => !p)} style={{ background: 'none', border: 'none', color: showPins ? T.accent : T.txD, cursor: 'pointer', display: 'flex', gap: 4, alignItems: 'center', fontSize: 12 }}>{I.pin}{pinnedMsgs.length > 0 && <span>{pinnedMsgs.length}</span>}</button>
            <button onClick={() => setShowMembers(p => !p)} style={{ background: 'none', border: 'none', color: showMembers ? T.accent : T.txD, cursor: 'pointer', display: 'flex', gap: 4, alignItems: 'center', fontSize: 12 }}>{I.users}<span>{sc.members?.length || sc.memberCount}</span></button>
          </div>

          {showPins && pinnedMsgs.length > 0 && (
            <div style={{ padding: '8px 16px', background: `${T.accent}08`, borderBottom: `1px solid ${T.bd}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.accent, marginBottom: 6 }}>📌 ピン留めメッセージ</div>
              {pinnedMsgs.map(m => (
                <div key={m.id} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 0' }}>
                  <span style={{ fontWeight: 600, color: m.color, fontSize: 12 }}>{m.name}</span>
                  <span style={{ fontSize: 12, color: T.tx }}>{m.text}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
            {chMsgs.length === 0 && (
              <div style={{ textAlign: 'center', padding: 60, color: T.txD }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>#</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, marginBottom: 4 }}>#{sch?.name} へようこそ！</div>
                <div style={{ fontSize: 13 }}>このチャンネルの始まりです。</div>
              </div>
            )}
            {chMsgs.map(m => (
              <div key={m.id} style={{ display: 'flex', gap: 10, marginBottom: 4, padding: '6px 4px', borderRadius: 6 }}>
                <Av u={{ name: m.name, av: m.avatar, col: m.color }} sz={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontWeight: 600, color: m.color || T.txH, fontSize: 14 }}>{m.name}</span>
                    <span style={{ fontSize: 11, color: T.txD }}>{fTs(m.ts instanceof Date ? m.ts : new Date(m.ts))}</span>
                    {m.pinned && <span style={{ fontSize: 10, color: T.accent }}>📌</span>}
                  </div>
                  <div style={{ fontSize: 14, color: T.txH, lineHeight: 1.5, wordBreak: 'break-word' }}><Tx>{m.text}</Tx></div>
                </div>
                {sc.role === 'admin' && <button onClick={() => pinMessage(selChannel, m.id)} style={{ background: 'none', border: 'none', color: m.pinned ? T.accent : T.txD, cursor: 'pointer', opacity: 0.4, alignSelf: 'flex-start', marginTop: 4 }} title={m.pinned ? 'ピン解除' : 'ピン留め'}>{I.pin}</button>}
              </div>
            ))}
            <div ref={ref} />
          </div>

          {typingUsers.length > 0 && <div style={{ padding: '2px 16px', fontSize: 11, color: T.txD, fontStyle: 'italic' }}>{typingUsers.join('、')}が入力中...</div>}

          <div style={{ padding: '8px 16px 12px', borderTop: `1px solid ${T.bd}` }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '3px 3px 3px 14px', borderRadius: 20, background: T.bg3, border: `1px solid ${T.bd}` }}>
              <input value={inp} onChange={e => { setInp(e.target.value); setTyping(!!e.target.value.trim()); }} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), doSend())} placeholder={`#${sch?.name} にメッセージを送信`} style={{ flex: 1, padding: '10px 0', border: 'none', background: 'transparent', color: T.txH, fontSize: 14, outline: 'none', fontFamily: 'inherit' }} />
              <button onClick={doSend} style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: inp.trim() ? T.accent : 'transparent', color: inp.trim() ? '#fff' : T.txD, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>{I.send}</button>
            </div>
          </div>
        </div>

        {showMembers && (
          <div style={{ width: 200, background: T.bg2, borderLeft: `1px solid ${T.bd}`, flexShrink: 0, overflowY: 'auto', padding: '12px 0' }}>
            {(() => {
              const admins = (sc.members || []).filter(m => m.role === 'admin');
              const mems = (sc.members || []).filter(m => m.role !== 'admin');
              return <>
                {admins.length > 0 && <>
                  <div style={{ padding: '6px 12px 4px', fontSize: 10, fontWeight: 700, color: T.txD, letterSpacing: 0.5 }}>管理者 — {admins.length}</div>
                  {admins.map(m => <MemberRow key={m.id} m={m} />)}
                </>}
                {mems.length > 0 && <>
                  <div style={{ padding: '10px 12px 4px', fontSize: 10, fontWeight: 700, color: T.txD, letterSpacing: 0.5 }}>メンバー — {mems.length}</div>
                  {mems.map(m => <MemberRow key={m.id} m={m} />)}
                </>}
              </>;
            })()}
          </div>
        )}
        {editAppear && <EditAppearModal data={editAppear} onClose={() => setEditAppear(null)} onSave={d => { if (updateCircle && sc) updateCircle(sc.id, { icon: d.icon || sc.icon, color: d.color || sc.color, banner: d.banner || undefined }); }} />}
      </div>
    );
  }

  /* ── Desktop: Circle list ── */
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', borderBottom: `1px solid ${T.bd}`, background: T.bg2, flexShrink: 0 }}>
        {[{ id: 'my', l: '参加中' }, { id: 'discover', l: '探す' }, { id: 'create', l: '作成' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, padding: '10px 0', border: 'none', borderBottom: tab === t.id ? `2px solid ${T.accent}` : '2px solid transparent', background: 'transparent', color: tab === t.id ? T.txH : T.txD, fontSize: 13, fontWeight: tab === t.id ? 600 : 400, cursor: 'pointer' }}>{t.l}</button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {tab === 'my' && <>
          {circles.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: T.txD, fontSize: 13 }}>参加中のサークルはありません<br /><button onClick={() => setTab('discover')} style={{ marginTop: 8, background: 'none', border: 'none', color: T.accent, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>サークルを探す →</button></div>}
          {circles.map(c => (
            <div key={c.id} onClick={() => { setSelCircle(c.id); setSelChannel(c.channels?.[0]?.id || null); }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, background: T.bg2, border: `1px solid ${T.bd}`, marginBottom: 8, cursor: 'pointer' }}>
              <CIcon icon={c.icon} color={c.color} sz={44} radius={12} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: T.txH, fontSize: 15 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: T.txD, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.memberCount}人 · {c.channels?.length || 0}チャンネル</div>
              </div>
              {c.role === 'admin' && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: `${T.accent}20`, color: T.accent, fontWeight: 600 }}>管理者</span>}
              <span style={{ color: T.txD, display: 'flex' }}>{I.arr}</span>
            </div>
          ))}
        </>}

        {tab === 'discover' && <DiscoverSection discover={discover} joinCircle={joinCircle} />}

        {tab === 'create' && (
          <div style={{ padding: 4 }}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.txD, display: 'block', marginBottom: 6 }}>サークル名 *</label>
              <input value={createName} onChange={e => setCreateName(e.target.value)} placeholder="例: プログラミング研究会" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 14, outline: 'none', fontFamily: 'inherit' }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.txD, display: 'block', marginBottom: 6 }}>説明</label>
              <textarea value={createDesc} onChange={e => setCreateDesc(e.target.value)} placeholder="サークルの説明を入力..." rows={3} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 14, outline: 'none', fontFamily: 'inherit', resize: 'vertical' }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.txD, display: 'block', marginBottom: 8 }}>カラー</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {colors.map(c => (
                  <button key={c} onClick={() => setCreateColor(c)} style={{ width: 32, height: 32, borderRadius: 8, background: c, border: createColor === c ? '3px solid #fff' : '2px solid transparent', cursor: 'pointer', boxShadow: createColor === c ? `0 0 0 2px ${c}` : 'none' }} />
                ))}
              </div>
            </div>
            <button onClick={doCreateCircle} disabled={!createName.trim()} style={{ width: '100%', padding: '12px 0', borderRadius: 10, border: 'none', background: createName.trim() ? T.accent : T.bg3, color: createName.trim() ? '#fff' : T.txD, fontSize: 14, fontWeight: 600, cursor: createName.trim() ? 'pointer' : 'default' }}>サークルを作成</button>
            <div style={{ marginTop: 12, fontSize: 12, color: T.txD, lineHeight: 1.6, textAlign: 'center' }}>作成すると自動的に管理者になります。<br />general, announcements, random チャンネルが作成されます。</div>
          </div>
        )}
      </div>
    </div>
  );
};
