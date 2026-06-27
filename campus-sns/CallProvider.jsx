import { createContext, useContext, Component } from 'react';
import { T } from './theme.js';
import { t } from './i18n.js';
import { Av } from './shared.jsx';
import { useCall } from './hooks/useCall.js';

// 通話の発信トリガーをツリー全体へ配るコンテキスト。
// DMView などが useCallControls().startCall(target) を呼ぶだけで発信できる。
const CallCtx = createContext({ startCall: () => {}, isActive: false });
export const useCallControls = () => useContext(CallCtx);

const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// 角丸グラスボタン（アイコン＋ラベル、押下でわずかに沈む）
const CallBtn = ({ onClick, bg, color = '#fff', label, glow, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
    <button onClick={onClick} title={label} aria-label={label} className="callBtn" style={{
      width: 66, height: 66, borderRadius: '50%', border: 'none', background: bg, color,
      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
      boxShadow: glow || '0 6px 20px rgba(0,0,0,.35)',
      WebkitBackdropFilter: 'blur(8px)', backdropFilter: 'blur(8px)',
    }}>{children}</button>
    {label && <span style={{ fontSize: 12.5, fontWeight: 500, opacity: .82, letterSpacing: .2 }}>{label}</span>}
  </div>
);

const PhoneIcon = ({ size = 27 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.4 0 .8-.3 1l-2.2 2.2z"/>
  </svg>
);
const HangupIcon = ({ size = 27 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ transform: 'rotate(135deg)' }}>
    <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.4 0 .8-.3 1l-2.2 2.2z"/>
  </svg>
);
const MicIcon = ({ off, size = 25 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
    <path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" y1="19" x2="12" y2="23"/>
    {off && <line x1="3.2" y1="3.2" x2="20.8" y2="20.8" stroke="currentColor" />}
  </svg>
);

function CallOverlay({ call, accept, decline, hangup, toggleMute }) {
  const { phase, peer, muted, durationSec, endReason } = call;
  if (phase === 'idle' || !peer) return null;

  const col = peer.col || '#5b8cff';
  const u = { name: peer.name, av: peer.av, col };
  const ringing = phase === 'outgoing' || phase === 'incoming' || phase === 'connecting';
  const connected = phase === 'connected';

  let status = '';
  if (phase === 'outgoing') status = t('call.calling');
  else if (phase === 'incoming') status = t('call.incoming');
  else if (phase === 'connecting') status = t('call.connecting');
  else if (phase === 'connected') status = mmss(durationSec);
  else if (phase === 'ended') status = t(`call.${endReason || 'ended'}`);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 4000,
      background: `radial-gradient(125% 80% at 50% 20%, ${col}59 0%, ${col}1f 34%, rgba(9,11,17,.97) 72%), #090b11`,
      WebkitBackdropFilter: 'blur(2px)', backdropFilter: 'blur(2px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
      padding: 'calc(env(safe-area-inset-top,0px) + 64px) 24px calc(env(safe-area-inset-bottom,0px) + 52px)',
      color: '#fff', animation: 'callFade .25s ease', overflow: 'hidden',
    }}>
      {/* 上部の名前・状態 */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 'auto' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 13px', borderRadius: 99,
          background: 'rgba(255,255,255,.1)', WebkitBackdropFilter: 'blur(8px)', backdropFilter: 'blur(8px)',
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: connected ? '#34d27b' : '#fff',
            animation: ringing ? 'callBlink 1.3s ease-in-out infinite' : 'none', opacity: connected ? 1 : .85 }} />
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: .4, opacity: .9 }}>{status}</span>
        </div>
      </div>

      {/* 中央のアバター＋パルスリング */}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
        <div style={{ position: 'relative', width: 132, height: 132, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {ringing && [0, 1, 2].map(i => (
            <span key={i} style={{
              position: 'absolute', width: 132, height: 132, borderRadius: '50%',
              border: `2px solid ${col}`, animation: `callPulse 2.4s ${i * 0.8}s cubic-bezier(.2,.6,.3,1) infinite`,
            }} />
          ))}
          <div style={{
            borderRadius: '50%', padding: 4,
            background: `linear-gradient(145deg, ${col}, ${col}55)`,
            boxShadow: connected ? `0 0 32px ${col}99` : `0 0 26px ${col}66`,
          }}>
            <div style={{ borderRadius: '50%', border: '3px solid rgba(9,11,17,.6)' }}>
              <Av u={u} sz={118} uid={peer.id} />
            </div>
          </div>
        </div>
        <div style={{ fontSize: 27, fontWeight: 700, letterSpacing: .3, textShadow: '0 2px 12px rgba(0,0,0,.4)' }}>{u.name || '?'}</div>
      </div>

      {/* 下部のコントロール */}
      <div style={{ marginTop: 'auto', width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 30, alignItems: 'center' }}>
        {connected && (
          <CallBtn onClick={toggleMute} label={muted ? t('call.unmute') : t('call.mute')}
            bg={muted ? 'rgba(255,255,255,.92)' : 'rgba(255,255,255,.14)'}
            color={muted ? '#111' : '#fff'}><MicIcon off={muted} /></CallBtn>
        )}

        <div style={{ display: 'flex', gap: 60, alignItems: 'flex-start', justifyContent: 'center' }}>
          {phase === 'incoming' ? (
            <>
              <CallBtn onClick={decline} bg="#e5484d" label={t('call.decline')}
                glow="0 6px 22px rgba(229,72,77,.5)"><HangupIcon /></CallBtn>
              <div className="callAccept">
                <CallBtn onClick={accept} bg="#2bb673" label={t('call.accept')}
                  glow="0 6px 22px rgba(43,182,115,.55)"><PhoneIcon /></CallBtn>
              </div>
            </>
          ) : phase === 'ended' ? null : (
            <CallBtn onClick={hangup} bg="#e5484d"
              glow="0 6px 22px rgba(229,72,77,.5)"
              label={phase === 'outgoing' ? t('call.cancel') : t('call.hangup')}><HangupIcon /></CallBtn>
          )}
        </div>
      </div>

      <style>{`
        @keyframes callFade{from{opacity:0}to{opacity:1}}
        @keyframes callBlink{0%,100%{opacity:.35}50%{opacity:1}}
        @keyframes callPulse{0%{transform:scale(1);opacity:.55}70%{opacity:0}100%{transform:scale(1.9);opacity:0}}
        @keyframes callAcceptBounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
        .callBtn{transition:transform .12s ease,filter .12s ease}
        .callBtn:active{transform:scale(.9)}
        .callBtn:hover{filter:brightness(1.08)}
        .callAccept{animation:callAcceptBounce 1.4s ease-in-out infinite}
      `}</style>
    </div>
  );
}

// 通話オーバーレイの描画で万一例外が出ても、アプリ全体を巻き込んで落とさないための安全網。
// 例外時は通話を終了し、オーバーレイを消す（白画面＝アプリクラッシュを防ぐ）。
class CallErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err, info) {
    try { console.error('[call] overlay render crashed:', err?.message, info?.componentStack); } catch {}
    this.props.onError?.();
  }
  componentDidUpdate(prev) {
    // 通話が畳まれたら次の通話に備えて復帰
    if (this.state.failed && !this.props.active && prev.active) this.setState({ failed: false });
  }
  render() { return this.state.failed ? null : this.props.children; }
}

export function CallProvider({ me, children }) {
  const { call, startCall, accept, decline, hangup, toggleMute } = useCall(me);
  const isActive = call.phase !== 'idle';
  return (
    <CallCtx.Provider value={{ startCall, isActive }}>
      {children}
      <CallErrorBoundary active={isActive} onError={hangup}>
        <CallOverlay call={call} accept={accept} decline={decline} hangup={hangup} toggleMute={toggleMute} />
      </CallErrorBoundary>
    </CallCtx.Provider>
  );
}
