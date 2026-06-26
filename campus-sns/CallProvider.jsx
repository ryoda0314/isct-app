import { createContext, useContext } from 'react';
import { T } from './theme.js';
import { t } from './i18n.js';
import { Av } from './shared.jsx';
import { useCall } from './hooks/useCall.js';

// 通話の発信トリガーをツリー全体へ配るコンテキスト。
// DMView などが useCallControls().startCall(target) を呼ぶだけで発信できる。
const CallCtx = createContext({ startCall: () => {}, isActive: false });
export const useCallControls = () => useContext(CallCtx);

const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// 丸ボタン
const RoundBtn = ({ onClick, bg, title, children }) => (
  <button onClick={onClick} title={title} aria-label={title} style={{
    width: 60, height: 60, borderRadius: '50%', border: 'none', background: bg,
    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,.3)',
  }}>{children}</button>
);

const PhoneIcon = ({ size = 26 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.4 0 .8-.3 1l-2.2 2.2z"/>
  </svg>
);
const HangupIcon = ({ size = 26 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ transform: 'rotate(135deg)' }}>
    <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.4 0 .8-.3 1l-2.2 2.2z"/>
  </svg>
);
const MicIcon = ({ off, size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
    <path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" y1="19" x2="12" y2="23"/>
    {off && <line x1="3" y1="3" x2="21" y2="21" stroke="#f55" />}
  </svg>
);

function CallOverlay({ call, accept, decline, hangup, toggleMute }) {
  const { phase, peer, muted, durationSec, endReason } = call;
  if (phase === 'idle' || !peer) return null;

  const u = { name: peer.name, av: peer.av, col: peer.col || '#888' };
  let status = '';
  if (phase === 'outgoing') status = t('call.calling');
  else if (phase === 'incoming') status = t('call.incoming');
  else if (phase === 'connecting') status = t('call.connecting');
  else if (phase === 'connected') status = mmss(durationSec);
  else if (phase === 'ended') status = t(`call.${endReason || 'ended'}`);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 4000,
      background: 'rgba(8,10,14,.92)', backdropFilter: 'blur(6px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
      padding: 'calc(env(safe-area-inset-top,0px) + 60px) 24px calc(env(safe-area-inset-bottom,0px) + 48px)',
      color: '#fff', animation: 'callIn .2s ease',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, marginTop: 'auto' }}>
        <div style={{ borderRadius: '50%', boxShadow: phase === 'connected' ? '0 0 0 4px rgba(80,200,120,.5)' : '0 0 0 4px rgba(255,255,255,.12)' }}>
          <Av u={u} sz={108} uid={peer.id} />
        </div>
        <div style={{ fontSize: 24, fontWeight: 700 }}>{u.name || '?'}</div>
        <div style={{ fontSize: 15, opacity: .8, minHeight: 20, letterSpacing: .3 }}>{status}</div>
      </div>

      <div style={{ marginTop: 'auto', width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 28, alignItems: 'center' }}>
        {/* 通話中: ミュートトグル */}
        {phase === 'connected' && (
          <button onClick={toggleMute} title={muted ? t('call.unmute') : t('call.mute')} style={{
            width: 56, height: 56, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: muted ? 'rgba(255,255,255,.92)' : 'rgba(255,255,255,.16)',
            color: muted ? '#111' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><MicIcon off={muted} /></button>
        )}

        <div style={{ display: 'flex', gap: 56, alignItems: 'center', justifyContent: 'center' }}>
          {phase === 'incoming' ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <RoundBtn onClick={decline} bg="#e5484d" title={t('call.decline')}><HangupIcon /></RoundBtn>
                <span style={{ fontSize: 12, opacity: .8 }}>{t('call.decline')}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <RoundBtn onClick={accept} bg="#30a46c" title={t('call.accept')}><PhoneIcon /></RoundBtn>
                <span style={{ fontSize: 12, opacity: .8 }}>{t('call.accept')}</span>
              </div>
            </>
          ) : phase === 'ended' ? null : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <RoundBtn onClick={hangup} bg="#e5484d"
                title={phase === 'outgoing' ? t('call.cancel') : t('call.hangup')}><HangupIcon /></RoundBtn>
              <span style={{ fontSize: 12, opacity: .8 }}>{phase === 'outgoing' ? t('call.cancel') : t('call.hangup')}</span>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes callIn{from{opacity:0}to{opacity:1}}`}</style>
    </div>
  );
}

export function CallProvider({ me, children }) {
  const { call, startCall, accept, decline, hangup, toggleMute } = useCall(me);
  const isActive = call.phase !== 'idle';
  return (
    <CallCtx.Provider value={{ startCall, isActive }}>
      {children}
      <CallOverlay call={call} accept={accept} decline={decline} hangup={hangup} toggleMute={toggleMute} />
    </CallCtx.Provider>
  );
}
