import { useState, useEffect, useRef } from 'react';
import { T } from '../theme.js';
import { I } from '../icons.jsx';
import { Av, Tx } from '../shared.jsx';
import { fTs } from '../utils.jsx';
import { useCurrentUser } from '../hooks/useCurrentUser.js';
import { useTyping } from '../hooks/useTyping.js';

/* ── サークルView (Discord風) ── */
export const CircleView = ({ mob, circles = [], messages = {}, discover = [], sendMessage, createCircle, joinCircle, leaveCircle, addChannel, deleteChannel, pinMessage }) => {
  const user = useCurrentUser();
  const uid = user?.moodleId || user?.id;
  const [selCircle, setSelCircle] = useState(null);
  const [selChannel, setSelChannel] = useState(null);
  const [inp, setInp] = useState('');
  const [tab, setTab] = useState('my'); // 'my' | 'discover' | 'create'
  const [showMembers, setShowMembers] = useState(!mob);
  const [showNewCh, setShowNewCh] = useState(false);
  const [newChName, setNewChName] = useState('');
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createColor, setCreateColor] = useState('#6375f0');
  const [showPins, setShowPins] = useState(false);
  const ref = useRef(null);
  const typingRoom = selChannel ? `circle:${selChannel}` : null;
  const { typingUsers, setTyping } = useTyping(typingRoom, { id: uid, name: user?.name });

  const sc = circles.find(c => c.id === selCircle);
  const chMsgs = selChannel ? (messages[selChannel] || []) : [];
  const pinnedMsgs = chMsgs.filter(m => m.pinned);

  useEffect(() => { ref.current?.scrollIntoView({ behavior: 'smooth' }); }, [chMsgs.length]);
  useEffect(() => {
    if (sc && sc.channels?.length > 0 && !selChannel) setSelChannel(sc.channels[0].id);
  }, [sc, selChannel]);

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
    setSelCircle(c.id); setSelChannel(c.channels[0]?.id); setTab('my');
  };

  const doAddChannel = () => {
    if (!newChName.trim() || !selCircle) return;
    addChannel(selCircle, newChName);
    setNewChName(''); setShowNewCh(false);
  };

  const colors = ['#6375f0', '#e5534b', '#3dae72', '#d4843e', '#a855c7', '#2d9d8f', '#c6a236', '#c75d8e'];

  /* ── Circle内チャンネルビュー ── */
  if (sc && selChannel) {
    const sch = sc.channels?.find(c => c.id === selChannel);

    // ---- Mobile: channel chat ----
    if (mob) {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: `1px solid ${T.bd}`, background: T.bg2 }}>
            <button onClick={() => { setSelChannel(null); setSelCircle(null); }} style={{ background: 'none', border: 'none', color: T.txD, cursor: 'pointer', display: 'flex' }}>{I.back}</button>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: sc.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{sc.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontWeight: 600, color: T.txH, fontSize: 14 }}>#{sch?.name}</span>
              <span style={{ fontSize: 11, color: T.txD, marginLeft: 6 }}>{sc.name}</span>
            </div>
            <button onClick={() => setShowPins(p => !p)} style={{ background: 'none', border: 'none', color: showPins ? T.accent : T.txD, cursor: 'pointer', display: 'flex' }}>{I.pin}</button>
            <button onClick={() => setShowMembers(p => !p)} style={{ background: 'none', border: 'none', color: showMembers ? T.accent : T.txD, cursor: 'pointer', display: 'flex' }}>{I.users}</button>
          </div>

          {/* Pinned messages overlay */}
          {showPins && pinnedMsgs.length > 0 && (
            <div style={{ padding: 8, background: `${T.accent}10`, borderBottom: `1px solid ${T.bd}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.accent, marginBottom: 4 }}>📌 ピン留め ({pinnedMsgs.length})</div>
              {pinnedMsgs.map(m => (
                <div key={m.id} style={{ fontSize: 12, color: T.txH, padding: '4px 0', borderBottom: `1px solid ${T.bd}` }}>
                  <span style={{ fontWeight: 600, color: m.color }}>{m.name}</span>: <Tx>{m.text}</Tx>
                </div>
              ))}
            </div>
          )}

          {/* Members overlay */}
          {showMembers && (
            <div style={{ padding: 8, background: T.bg3, borderBottom: `1px solid ${T.bd}`, maxHeight: 160, overflowY: 'auto' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.txD, marginBottom: 4 }}>メンバー ({sc.members?.length || sc.memberCount})</div>
              {(sc.members || []).map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
                  <Av u={{ name: m.name, av: m.avatar, col: m.color }} sz={20} />
                  <span style={{ fontSize: 12, color: T.txH, flex: 1 }}>{m.name}</span>
                  {m.role === 'admin' && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: `${T.accent}20`, color: T.accent, fontWeight: 600 }}>管理者</span>}
                </div>
              ))}
            </div>
          )}

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
            {chMsgs.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: T.txD, fontSize: 13 }}>#{sch?.name} へようこそ！<br />最初のメッセージを送りましょう</div>}
            {chMsgs.map(m => {
              const me = m.uid === uid;
              return (
                <div key={m.id} style={{ display: 'flex', gap: 8, marginBottom: 8, padding: '4px 0' }}>
                  <Av u={{ name: m.name, av: m.avatar, col: m.color }} sz={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ fontWeight: 600, color: m.color || T.txH, fontSize: 13 }}>{m.name}</span>
                      <span style={{ fontSize: 10, color: T.txD }}>{fTs(m.ts instanceof Date ? m.ts : new Date(m.ts))}</span>
                      {m.pinned && <span style={{ fontSize: 9, color: T.accent }}>📌</span>}
                    </div>
                    <div style={{ fontSize: 14, color: T.txH, lineHeight: 1.5, wordBreak: 'break-word' }}><Tx>{m.text}</Tx></div>
                  </div>
                  {sc.role === 'admin' && <button onClick={() => pinMessage(selChannel, m.id)} style={{ background: 'none', border: 'none', color: m.pinned ? T.accent : T.txD, cursor: 'pointer', fontSize: 10, alignSelf: 'flex-start', opacity: 0.6, padding: 2 }} title="ピン留め">{I.pin}</button>}
                </div>
              );
            })}
            <div ref={ref} />
          </div>

          {/* Typing */}
          {typingUsers.length > 0 && <div style={{ padding: '2px 14px', fontSize: 11, color: T.txD, fontStyle: 'italic' }}>{typingUsers.join('、')}が入力中...</div>}

          {/* Input */}
          <div style={{ padding: '8px 10px', borderTop: `1px solid ${T.bd}`, background: T.bg2 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '3px 3px 3px 12px', borderRadius: 20, background: T.bg3, border: `1px solid ${T.bd}` }}>
              <input value={inp} onChange={e => { setInp(e.target.value); setTyping(!!e.target.value.trim()); }} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), doSend())} placeholder={`#${sch?.name} にメッセージ...`} style={{ flex: 1, padding: '8px 0', border: 'none', background: 'transparent', color: T.txH, fontSize: 14, outline: 'none', fontFamily: 'inherit' }} />
              <button onClick={doSend} style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: inp.trim() ? T.accent : 'transparent', color: inp.trim() ? '#fff' : T.txD, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>{I.send}</button>
            </div>
          </div>
        </div>
      );
    }

    // ---- Desktop: 3-column (channels | chat | members) ----
    return (
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Channel sidebar */}
        <div style={{ width: 200, background: T.bg2, borderRight: `1px solid ${T.bd}`, display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'auto' }}>
          <div style={{ padding: '12px 12px 8px', borderBottom: `1px solid ${T.bd}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 24, height: 24, borderRadius: 6, background: sc.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 700 }}>{sc.icon}</div>
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
                {sc.role === 'admin' && ch.name !== 'general' && <button onClick={e => { e.stopPropagation(); deleteChannel(sc.id, ch.id); if (selChannel === ch.id) setSelChannel(sc.channels[0]?.id); }} style={{ background: 'none', border: 'none', color: T.txD, cursor: 'pointer', display: 'flex', padding: 0, opacity: 0.5, fontSize: 10 }}>{I.x}</button>}
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

        {/* Chat area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Chat header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', height: 44, borderBottom: `1px solid ${T.bd}`, flexShrink: 0 }}>
            <span style={{ color: T.txD, fontSize: 18 }}>#</span>
            <span style={{ fontWeight: 700, color: T.txH, fontSize: 15 }}>{sch?.name}</span>
            <div style={{ flex: 1 }} />
            <button onClick={() => setShowPins(p => !p)} style={{ background: 'none', border: 'none', color: showPins ? T.accent : T.txD, cursor: 'pointer', display: 'flex', gap: 4, alignItems: 'center', fontSize: 12 }}>{I.pin}{pinnedMsgs.length > 0 && <span>{pinnedMsgs.length}</span>}</button>
            <button onClick={() => setShowMembers(p => !p)} style={{ background: 'none', border: 'none', color: showMembers ? T.accent : T.txD, cursor: 'pointer', display: 'flex', gap: 4, alignItems: 'center', fontSize: 12 }}>{I.users}<span>{sc.members?.length || sc.memberCount}</span></button>
          </div>

          {/* Pinned overlay */}
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

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
            {chMsgs.length === 0 && (
              <div style={{ textAlign: 'center', padding: 60, color: T.txD }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>#</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, marginBottom: 4 }}>#{sch?.name} へようこそ！</div>
                <div style={{ fontSize: 13 }}>このチャンネルの始まりです。</div>
              </div>
            )}
            {chMsgs.map(m => (
              <div key={m.id} style={{ display: 'flex', gap: 10, marginBottom: 4, padding: '6px 4px', borderRadius: 6 }} className="msg-row">
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

          {/* Typing */}
          {typingUsers.length > 0 && <div style={{ padding: '2px 16px', fontSize: 11, color: T.txD, fontStyle: 'italic' }}>{typingUsers.join('、')}が入力中...</div>}

          {/* Input */}
          <div style={{ padding: '8px 16px 12px', borderTop: `1px solid ${T.bd}` }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '3px 3px 3px 14px', borderRadius: 20, background: T.bg3, border: `1px solid ${T.bd}` }}>
              <input value={inp} onChange={e => { setInp(e.target.value); setTyping(!!e.target.value.trim()); }} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), doSend())} placeholder={`#${sch?.name} にメッセージを送信`} style={{ flex: 1, padding: '10px 0', border: 'none', background: 'transparent', color: T.txH, fontSize: 14, outline: 'none', fontFamily: 'inherit' }} />
              <button onClick={doSend} style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: inp.trim() ? T.accent : 'transparent', color: inp.trim() ? '#fff' : T.txD, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>{I.send}</button>
            </div>
          </div>
        </div>

        {/* Members sidebar */}
        {showMembers && (
          <div style={{ width: 200, background: T.bg2, borderLeft: `1px solid ${T.bd}`, flexShrink: 0, overflowY: 'auto', padding: '12px 0' }}>
            {/* Admins */}
            {(() => {
              const admins = (sc.members || []).filter(m => m.role === 'admin');
              const members = (sc.members || []).filter(m => m.role !== 'admin');
              return <>
                {admins.length > 0 && <>
                  <div style={{ padding: '6px 12px 4px', fontSize: 10, fontWeight: 700, color: T.txD, letterSpacing: 0.5 }}>管理者 — {admins.length}</div>
                  {admins.map(m => <MemberRow key={m.id} m={m} />)}
                </>}
                {members.length > 0 && <>
                  <div style={{ padding: '10px 12px 4px', fontSize: 10, fontWeight: 700, color: T.txD, letterSpacing: 0.5 }}>メンバー — {members.length}</div>
                  {members.map(m => <MemberRow key={m.id} m={m} />)}
                </>}
              </>;
            })()}
          </div>
        )}
      </div>
    );
  }

  /* ── サークル選択画面 (mobile: circle channels) ── */
  if (sc && mob) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: `1px solid ${T.bd}`, background: T.bg2 }}>
          <button onClick={() => setSelCircle(null)} style={{ background: 'none', border: 'none', color: T.txD, cursor: 'pointer', display: 'flex' }}>{I.back}</button>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: sc.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{sc.icon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: T.txH, fontSize: 14 }}>{sc.name}</div>
            <div style={{ fontSize: 11, color: T.txD }}>{sc.memberCount}人</div>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          <div style={{ fontSize: 12, color: T.txD, lineHeight: 1.5, marginBottom: 12, padding: '8px 12px', background: T.bg3, borderRadius: 10 }}>{sc.desc}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.txD, marginBottom: 8, letterSpacing: 0.5 }}>TEXT CHANNELS</div>
          {sc.channels?.map(ch => (
            <button key={ch.id} onClick={() => setSelChannel(ch.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg2, marginBottom: 6, cursor: 'pointer' }}>
              <span style={{ color: T.txD, fontSize: 18, fontWeight: 300 }}>#</span>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: T.txH, textAlign: 'left' }}>{ch.name}</span>
              {I.arr}
            </button>
          ))}
          {sc.role === 'admin' && (
            showNewCh ? (
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <input value={newChName} onChange={e => setNewChName(e.target.value)} onKeyDown={e => e.key === 'Enter' && doAddChannel()} placeholder="チャンネル名" style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 14, outline: 'none' }} />
                <button onClick={doAddChannel} style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: T.accent, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>追加</button>
              </div>
            ) : (
              <button onClick={() => setShowNewCh(true)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 0', borderRadius: 10, border: `1px dashed ${T.bd}`, background: 'transparent', cursor: 'pointer', marginTop: 4 }}>
                <span style={{ color: T.accent, display: 'flex' }}>{I.plus}</span>
                <span style={{ fontSize: 13, color: T.txD }}>チャンネル追加</span>
              </button>
            )
          )}

          <div style={{ fontSize: 11, fontWeight: 700, color: T.txD, marginTop: 16, marginBottom: 8, letterSpacing: 0.5 }}>メンバー ({sc.members?.length || sc.memberCount})</div>
          {(sc.members || []).map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: T.bg2, border: `1px solid ${T.bd}`, marginBottom: 4 }}>
              <Av u={{ name: m.name, av: m.avatar, col: m.color }} sz={32} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: T.txH, fontSize: 13 }}>{m.name}</div>
              </div>
              {m.role === 'admin' && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: `${T.accent}20`, color: T.accent, fontWeight: 600 }}>管理者</span>}
            </div>
          ))}

          {leaveCircle && sc.role !== 'admin' && (
            <button onClick={() => { leaveCircle(sc.id); setSelCircle(null); }} style={{ width: '100%', marginTop: 16, padding: '12px 0', borderRadius: 10, border: `1px solid ${T.red}30`, background: `${T.red}10`, color: T.red, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>サークルを退出</button>
          )}
        </div>
      </div>
    );
  }

  /* ── サークル一覧 (top level) ── */
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${T.bd}`, background: T.bg2, flexShrink: 0 }}>
        {[{ id: 'my', l: '参加中' }, { id: 'discover', l: '探す' }, { id: 'create', l: '作成' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, padding: '10px 0', border: 'none', borderBottom: tab === t.id ? `2px solid ${T.accent}` : '2px solid transparent', background: 'transparent', color: tab === t.id ? T.txH : T.txD, fontSize: 13, fontWeight: tab === t.id ? 600 : 400, cursor: 'pointer' }}>{t.l}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {/* 参加中 */}
        {tab === 'my' && <>
          {circles.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: T.txD, fontSize: 13 }}>参加中のサークルはありません<br /><button onClick={() => setTab('discover')} style={{ marginTop: 8, background: 'none', border: 'none', color: T.accent, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>サークルを探す →</button></div>}
          {circles.map(c => (
            <div key={c.id} onClick={() => { setSelCircle(c.id); setSelChannel(c.channels?.[0]?.id || null); }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, background: T.bg2, border: `1px solid ${T.bd}`, marginBottom: 8, cursor: 'pointer' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, fontWeight: 700, flexShrink: 0 }}>{c.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: T.txH, fontSize: 15 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: T.txD, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.memberCount}人 · {c.channels?.length || 0}チャンネル</div>
              </div>
              {c.role === 'admin' && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: `${T.accent}20`, color: T.accent, fontWeight: 600 }}>管理者</span>}
              <span style={{ color: T.txD, display: 'flex' }}>{I.arr}</span>
            </div>
          ))}
        </>}

        {/* 探す */}
        {tab === 'discover' && <>
          {discover.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: T.txD, fontSize: 13 }}>見つかるサークルはありません</div>}
          {discover.map(c => (
            <div key={c.id} style={{ padding: '14px', borderRadius: 12, background: T.bg2, border: `1px solid ${T.bd}`, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 16, fontWeight: 700, flexShrink: 0 }}>{c.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: T.txH, fontSize: 14 }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: T.txD }}>{c.memberCount}人</div>
                </div>
              </div>
              <div style={{ fontSize: 13, color: T.tx, lineHeight: 1.5, marginBottom: 10 }}>{c.desc}</div>
              <button onClick={() => joinCircle(c.id)} style={{ width: '100%', padding: '10px 0', borderRadius: 8, border: 'none', background: T.accent, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>参加する</button>
            </div>
          ))}
        </>}

        {/* 作成 */}
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
            <div style={{ marginTop: 12, fontSize: 12, color: T.txD, lineHeight: 1.6, textAlign: 'center' }}>作成すると自動的に管理者になります。<br />general、announcements、random チャンネルが作成されます。</div>
          </div>
        )}
      </div>
    </div>
  );
};

const MemberRow = ({ m }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', cursor: 'pointer' }}>
    <Av u={{ name: m.name, av: m.avatar, col: m.color }} sz={24} />
    <span style={{ fontSize: 12, color: T.txH, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
  </div>
);
