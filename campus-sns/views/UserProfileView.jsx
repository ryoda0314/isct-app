import { useState, useEffect, useCallback } from 'react';
import { T } from '../theme.js';
import { t } from '../i18n.js';
import { I } from '../icons.jsx';
import { Av, Loader } from '../shared.jsx';
import { DEPTS, SCHOOLS } from '../data.js';

/* dept コード("MEC") → 学院名・系名。名前で保存済みのデータにも逆引きで対応 */
const deptInfo = (dep) => {
  if (!dep) return null;
  let d = DEPTS[dep];
  if (!d) { const k = Object.keys(DEPTS).find(key => DEPTS[key].name === dep); if (k) d = DEPTS[k]; }
  if (d) return { school: SCHOOLS[d.school]?.name || null, dept: d.name };
  return { school: null, dept: dep };
};

/* yearGroup ("25B") → 入学年度・学年ラベル（現在の学暦から導出, 4月始まり） */
const degInfo = (yg) => {
  if (!yg) return null;
  const m = String(yg).match(/^(\d{2})([BMDR])$/i);
  if (!m) return { raw: String(yg) };
  const admYear = 2000 + parseInt(m[1], 10);
  const deg = m[2].toUpperCase();
  const now = new Date();
  const ay = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  let n = ay - admYear + 1;
  if (n < 1) n = 1;
  const key = deg === 'B' ? 'profile.degBachelor' : deg === 'M' ? 'profile.degMaster' : deg === 'D' ? 'profile.degDoctor' : null;
  return { admYear, grade: key ? t(key, { n }) : null };
};

/**
 * UserProfileView — 閲覧専用プロフィール（自分・友達・任意ユーザー共通）。
 * 自分のときは「編集」で設定画面へ。lookup は自分IDを弾くため自分は user から描画。
 */
export const UserProfileView = ({ mob, userId, user, lookupById, onStartDM, sendRequest, acceptRequest, unfriend, blockUser, muteUser, unmuteUser, isMuted, onEditProfile, goBack, refetch }) => {
  const selfId = user?.moodleId || user?.id;
  const isSelf = String(userId) === String(selfId);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(false);
    if (isSelf) {
      setData({
        moodleId: selfId,
        name: user?.name,
        avatar: user?.av || user?.avatar,
        color: user?.col || user?.color,
        dept: user?.myDept || user?.dept,
        bio: user?.bio || null,
        yearGroup: user?.yearGroup || null,
        friendship: null,
      });
      setLoading(false);
      return;
    }
    const r = await lookupById?.(userId);
    if (!r || r === 'not_found') { setErr(true); setLoading(false); return; }
    setData(r);
    setLoading(false);
  }, [userId, isSelf, selfId, user, lookupById]);

  useEffect(() => { load(); }, [load]);

  const doAction = async (key, fn) => {
    setActionLoading(key);
    await fn();
    if (refetch) await refetch();
    await load();
    setActionLoading(null);
  };

  const di = data && degInfo(data.yearGroup);
  const di2 = data && deptInfo(data.dept);
  const muted = !isSelf && isMuted && isMuted(userId);
  const fs = data?.friendship?.status;
  const isReceived = fs === 'pending' && !data.friendship.isSender;
  const isSent = fs === 'pending' && data.friendship.isSender;
  const isFriend = fs === 'accepted';

  const Header = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', flexShrink: 0, borderBottom: `1px solid ${T.bd}`, background: T.bg2 }}>
      {goBack && <button onClick={goBack} style={{ background: 'none', border: 'none', color: T.txH, cursor: 'pointer', display: 'flex', padding: 4 }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
      </button>}
      <span style={{ fontSize: 15, fontWeight: 700, color: T.txH }}>{t('profile.viewTitle')}</span>
    </div>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.bg }}>
      <Header />
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {loading && <Loader msg={t('common.loading')} size="sm" />}

        {err && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 32px', textAlign: 'center', gap: 12 }}>
            <div style={{ fontSize: 13, color: T.txD }}>{t('profile.loadFail')}</div>
            <button onClick={load} style={{ padding: '8px 18px', borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{t('graph.retry')}</button>
          </div>
        )}

        {data && !loading && !err && (
          <div style={{ maxWidth: 480, margin: '0 auto' }}>
            {/* Cover + avatar */}
            <div style={{ position: 'relative', marginBottom: 60 }}>
              <div style={{ height: 128, background: `linear-gradient(135deg, ${data.color || T.accent}, ${data.color || T.accent}55)` }} />
              <div style={{ position: 'absolute', left: '50%', bottom: -52, transform: 'translateX(-50%)', borderRadius: '50%', padding: 4, background: T.bg, boxShadow: '0 6px 20px rgba(0,0,0,.20)' }}>
                <Av u={{ name: data.name, av: data.avatar, col: data.color }} sz={104} />
              </div>
            </div>
            {/* Identity */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 24px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: T.txH, lineHeight: 1.25 }}>{data.name || t('friends.userFallback', { id: userId })}</div>
              {di2 && (di2.school || di2.dept) && (
                <div style={{ fontSize: 13, color: T.txD, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {di2.school && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600, color: T.tx }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 21v-6h6v6" /></svg>
                    {di2.school}
                  </span>}
                  {di2.school && di2.dept && <span style={{ color: T.bd }}>·</span>}
                  {di2.dept && <span>{di2.dept}</span>}
                </div>
              )}
              {di && (di.grade || di.admYear) && (
                <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {di.grade && <span style={{ fontSize: 12, fontWeight: 700, color: T.accent, background: `${T.accent}15`, padding: '5px 12px', borderRadius: 20 }}>{di.grade}</span>}
                  {di.admYear && <span style={{ fontSize: 12, fontWeight: 600, color: T.txD, background: T.bg3, padding: '5px 12px', borderRadius: 20 }}>{t('profile.enrolledYear', { y: di.admYear })}</span>}
                  {di.raw && !di.grade && <span style={{ fontSize: 12, fontWeight: 600, color: T.txD, background: T.bg3, padding: '5px 12px', borderRadius: 20 }}>{di.raw}</span>}
                </div>
              )}
              {!isSelf && data.mutual > 0 && (
                <div style={{ fontSize: 12, color: T.txD, fontWeight: 500, marginTop: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>
                  {t('friends.mutual', { n: data.mutual })}
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ padding: '0 20px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {isSelf && (
                <button onClick={onEditProfile} style={{ width: '100%', padding: '12px 0', borderRadius: 10, border: 'none', background: T.accent, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z" /></svg>
                  {t('profile.editProfile')}
                </button>
              )}
              {!isSelf && isFriend && (
                <button onClick={() => onStartDM?.(userId, data.name, data.avatar, data.color)} style={{ width: '100%', padding: '12px 0', borderRadius: 10, border: 'none', background: T.accent, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                  {t('friends.message')}
                </button>
              )}
              {!isSelf && isReceived && (
                <button onClick={() => doAction('accept', () => acceptRequest(data.friendship.id))} disabled={actionLoading === 'accept'} style={{ width: '100%', padding: '12px 0', borderRadius: 10, border: 'none', background: T.green, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{t('friends.accept')}</button>
              )}
              {!isSelf && isSent && (
                <div style={{ width: '100%', padding: '12px 0', borderRadius: 10, background: T.bg3, color: T.txD, fontSize: 14, fontWeight: 600, textAlign: 'center' }}>{t('friends.requesting')}</div>
              )}
              {!isSelf && !fs && (
                <button onClick={() => doAction('send', () => sendRequest(userId))} disabled={actionLoading === 'send'} style={{ width: '100%', padding: '12px 0', borderRadius: 10, border: 'none', background: T.accent, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></svg>
                  {t('friends.addFriend')}
                </button>
              )}
            </div>

            {/* Bio */}
            {data.bio ? (
              <div style={{ padding: '12px 20px' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.txD, letterSpacing: .3, marginBottom: 6 }}>{t('profile.bioLabel')}</div>
                <div style={{ fontSize: 14, color: T.txH, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: T.bg2, border: `1px solid ${T.bd}`, borderRadius: 12, padding: '12px 14px' }}>{data.bio}</div>
              </div>
            ) : isSelf ? (
              <div style={{ padding: '12px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: T.txD }}>{t('profile.noBioSelf')}</div>
              </div>
            ) : null}

            {/* Secondary friend actions */}
            {!isSelf && isFriend && (
              <div style={{ padding: '12px 20px 28px' }}>
                <div style={{ background: T.bg2, border: `1px solid ${T.bd}`, borderRadius: 14, overflow: 'hidden' }}>
                  {[
                    { key: muted ? 'unmute' : 'mute', label: muted ? t('friends.unmute') : t('friends.mute'), danger: false,
                      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" /><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.12 1.5-.34 2.18" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>,
                      run: () => muted ? doAction('unmute', () => unmuteUser(userId)) : doAction('mute', () => muteUser(userId)) },
                    { key: 'unfriend', label: t('friends.unfriend'), danger: true,
                      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="17" y1="8" x2="23" y2="8" /></svg>,
                      run: () => { if (confirm(t('friends.unfriendConfirm', { name: data.name }))) doAction('unfriend', () => unfriend(userId)); } },
                    ...(blockUser ? [{ key: 'block', label: t('friends.block'), danger: true,
                      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>,
                      run: () => { if (confirm(t('friends.blockConfirm', { name: data.name }))) doAction('block', () => blockUser(userId)); } }] : []),
                  ].map((a, i, arr) => (
                    <button key={a.key} onClick={a.run} disabled={actionLoading === a.key}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '14px 16px', border: 'none', borderBottom: i < arr.length - 1 ? `1px solid ${T.bd}` : 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', fontSize: 14, fontWeight: 500, color: a.danger ? T.red : T.txH, transition: 'background .12s' }}
                      onMouseEnter={e => { e.currentTarget.style.background = a.danger ? `${T.red}0e` : T.hover; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                      <span style={{ display: 'flex', color: a.danger ? T.red : T.txD, flexShrink: 0 }}>{a.icon}</span>
                      <span style={{ flex: 1 }}>{a.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
