import { useState, useEffect, useRef, useCallback } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client.js';
import { callTopic, rtcTopic } from '../../lib/realtime.js';

// ============================================================
// 1対1 音声通話エンジン（WebRTC）
//
// シグナリングは Supabase Realtime の Broadcast に相乗り（専用サーバー無し）:
//   ・`call:<uid>`  … 各ユーザーの「呼び鈴」。常時購読し invite/cancel/decline/busy を受ける。
//   ・`rtc:<callId>`… 通話セッションごとのチャンネル。両者が join して SDP を交換する。
//
// NAT 越えは ICE。Broadcast は「あとから join した人に過去メッセージを再送しない」揮発的な
// チャンネルなので、candidate を逐次流す trickle ICE は取りこぼしやすい。そこで本実装は
// **ICE 収集が完了してから candidate 入りの完全 SDP を 1 回だけ送る non-trickle 方式**。
// これで揮発チャンネル上でも確実にハンドシェイクが成立する（音声のみなら収集は ~1-2s）。
//
// TURN について（重要・将来の差し替えポイント）:
//   いまは無料 STUN のみ。学内 WiFi 同士など P2P が通る経路では繋がるが、モバイル回線の
//   対称 NAT 越しでは繋がらないことがある。安定運用が必要になったら ICE_SERVERS に TURN を
//   足すだけでよい（コードの他の部分は変更不要）。例:
//     { urls: 'turn:your-turn.example.com:3478', username: '...', credential: '...' }
//   無料枠なら Metered Open Relay、自前なら coturn。lib/realtime.js のメモ参照。
// ============================================================

const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

// 通話トラブル切り分け用ログ。接続周りで落ちる/繋がらない時はコンソール(またはネイティブログ)に [call] で出る。
const LOG = (...a) => { try { console.log('[call]', ...a); } catch {} };

const RING_TIMEOUT_MS = 30_000;   // 発信側: 応答が無ければ自動キャンセル
const INCOMING_TIMEOUT_MS = 45_000; // 着信側: 放置されたら自動拒否
const ENDED_DISPLAY_MS = 2500;    // 終了表示を残す時間

// ICE 収集の完了（または timeout）を待つ。完了後の localDescription には
// 集まった candidate が SDP に埋め込まれている。
function waitIceGathering(pc, timeoutMs = 2500) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      pc.removeEventListener('icegatheringstatechange', check);
      resolve();
    };
    const check = () => { if (pc.iceGatheringState === 'complete') finish(); };
    pc.addEventListener('icegatheringstatechange', check);
    setTimeout(finish, timeoutMs);
  });
}

/**
 * 通話エンジン。アプリのトップ（CallProvider）で1つだけ動かす。
 * @param {object} me - { id, name, av, col } 自分のユーザー情報
 * @returns 通話状態 + 操作API
 */
export function useCall(me) {
  const myUid = me?.id ? String(me.id) : null;

  // 公開スナップショット（UI 用）
  const [call, setCall] = useState({ phase: 'idle', peer: null, muted: false, durationSec: 0, endReason: null });

  // ── 内部可変状態（描画に依らず即時参照したいので ref） ──
  const phaseRef = useRef('idle');         // idle|outgoing|incoming|connecting|connected|ended
  const peerRef = useRef(null);            // 相手 { id, name, av, col }
  const roleRef = useRef(null);            // 'caller' | 'callee'
  const callIdRef = useRef(null);
  const mutedRef = useRef(false);
  const durationRef = useRef(0);
  const endReasonRef = useRef(null);
  const wasConnectedRef = useRef(false);  // 一度でも接続成立したか（通話履歴の判定用）

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);     // <audio> 要素（プログラム生成）
  const rtcChanRef = useRef(null);         // rtc:<callId> チャンネル
  const peerBellRef = useRef(null);        // 相手の call:<uid>（invite/cancel 送信用）
  const ringTimerRef = useRef(null);
  const incomingTimerRef = useRef(null);
  const durTimerRef = useRef(null);
  const disconnectTimerRef = useRef(null);  // 一時切断の猶予タイマー

  const publish = useCallback(() => {
    setCall({
      phase: phaseRef.current,
      peer: peerRef.current,
      muted: mutedRef.current,
      durationSec: durationRef.current,
      endReason: endReasonRef.current,
    });
  }, []);

  // ── 後片付け：トラック停止・pc クローズ・チャンネル解放・タイマー解除 ──
  const teardown = useCallback(() => {
    const sb = getSupabaseClient();
    try { pcRef.current?.close(); } catch {}
    pcRef.current = null;
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => { try { t.stop(); } catch {} });
      localStreamRef.current = null;
    }
    if (remoteAudioRef.current) {
      try { remoteAudioRef.current.pause(); remoteAudioRef.current.srcObject = null; remoteAudioRef.current.remove?.(); } catch {}
      remoteAudioRef.current = null;
    }
    // rtc/呼び鈴チャンネルは、直前に送った bye/cancel が確実に flush されるよう少し遅らせて解放する。
    if (rtcChanRef.current) {
      const rtc = rtcChanRef.current; rtcChanRef.current = null;
      setTimeout(() => { try { sb.removeChannel(rtc); } catch {} }, 600);
    }
    if (peerBellRef.current) {
      const bell = peerBellRef.current; peerBellRef.current = null;
      setTimeout(() => { try { sb.removeChannel(bell); } catch {} }, 600);
    }
    if (ringTimerRef.current) { clearTimeout(ringTimerRef.current); ringTimerRef.current = null; }
    if (incomingTimerRef.current) { clearTimeout(incomingTimerRef.current); incomingTimerRef.current = null; }
    if (durTimerRef.current) { clearInterval(durTimerRef.current); durTimerRef.current = null; }
    if (disconnectTimerRef.current) { clearTimeout(disconnectTimerRef.current); disconnectTimerRef.current = null; }
    callIdRef.current = null;
    roleRef.current = null;
  }, []);

  // ── 発信者だけが通話履歴を 1 行 DM として残す（重複防止）。
  //    sender=発信者なので、閲覧側が発信/着信どちらかで表示を出し分ける。
  const logCallHistory = useCallback((reason) => {
    if (roleRef.current !== 'caller') return;          // 着信側はログしない
    if (reason === 'micDenied' || reason === 'failed') return; // 通話未成立は記録しない
    const peer = peerRef.current;
    if (!peer?.id) return;
    let status, durationSec = 0;
    if (wasConnectedRef.current) { status = 'completed'; durationSec = durationRef.current; }
    else if (reason === 'rejected') { status = 'declined'; }
    else { status = 'missed'; }
    fetch('/api/dm', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_user_id: peer.id, call_meta: { status, durationSec } }),
    }).catch(() => {});
  }, []);

  // ── 通話終了：理由を表示して idle に戻す ──
  const endCall = useCallback((reason) => {
    if (phaseRef.current === 'idle') return;
    LOG('endCall reason=', reason, 'role=', roleRef.current, 'wasConnected=', wasConnectedRef.current);
    logCallHistory(reason);   // teardown より前（peer/role/duration がまだ生きている間）に記録
    teardown();
    phaseRef.current = 'ended';
    endReasonRef.current = reason || 'ended';
    durationRef.current = 0;
    publish();
    setTimeout(() => {
      // 終了表示の間に新しい着信が来ていたら上書きしない
      if (phaseRef.current === 'ended') {
        phaseRef.current = 'idle';
        peerRef.current = null;
        endReasonRef.current = null;
        publish();
      }
    }, ENDED_DISPLAY_MS);
  }, [teardown, publish, logCallHistory]);

  // ── 任意トピックへ 1 回だけ broadcast を送る（呼び鈴用の使い捨てチャンネル） ──
  // 注意: 同一クライアントで同じトピックに 2 つチャンネルを張ると競合する（lib/realtime.js 参照）。
  // 発信側は相手の呼び鈴(peerBellRef)に既に接続しているので、その宛先へはこれを使わず
  // sendCancel() で既存チャンネルを再利用すること。
  const sendToBell = useCallback((uid, event, payload = {}) => {
    const sb = getSupabaseClient();
    const ch = sb.channel(callTopic(uid));
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        ch.send({ type: 'broadcast', event, payload });
        setTimeout(() => { try { sb.removeChannel(ch); } catch {} }, 800);
      }
    });
  }, []);

  // 発信側のキャンセル: 既に開いている相手の呼び鈴チャンネルを再利用して送る。
  const sendCancel = useCallback(() => {
    const cid = callIdRef.current;
    if (peerBellRef.current) {
      try { peerBellRef.current.send({ type: 'broadcast', event: 'cancel', payload: { callId: cid } }); } catch {}
    } else if (peerRef.current) {
      sendToBell(peerRef.current.id, 'cancel', { callId: cid });
    }
  }, [sendToBell]);

  // ── RTCPeerConnection を作り、自分の音声を載せ、相手の音声を再生 ──
  const buildPc = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    localStreamRef.current = stream;
    if (mutedRef.current) stream.getAudioTracks().forEach(t => { t.enabled = false; });

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    pc.ontrack = (e) => {
      try {
        LOG('ontrack', e.streams?.length, 'tracks');
        let audio = remoteAudioRef.current;
        if (!audio) {
          audio = new Audio();
          audio.autoplay = true;
          audio.setAttribute('playsinline', '');     // iOS でインライン再生
          audio.style.display = 'none';
          // 一部の WebView はデタッチされた media 要素を再生できないため DOM に接続する。
          try { document.body.appendChild(audio); } catch {}
          remoteAudioRef.current = audio;
        }
        audio.srcObject = e.streams[0];
        audio.play?.().catch((err) => LOG('audio.play rejected', err?.message));
      } catch (err) { LOG('ontrack error', err?.message); }
    };
    // 診断ログ（接続トラブルの切り分け用）
    pc.oniceconnectionstatechange = () => LOG('iceConnectionState', pc.iceConnectionState);
    pc.onicegatheringstatechange = () => LOG('iceGatheringState', pc.iceGatheringState);
    pc.onsignalingstatechange = () => LOG('signalingState', pc.signalingState);
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      LOG('connectionState', st);
      try {
        if (st === 'connected') {
          // 一時切断からの復帰なら猶予タイマーを解除
          if (disconnectTimerRef.current) { clearTimeout(disconnectTimerRef.current); disconnectTimerRef.current = null; }
          if (phaseRef.current !== 'connected') {
            phaseRef.current = 'connected';
            wasConnectedRef.current = true;
            durationRef.current = 0;
            publish();
            durTimerRef.current = setInterval(() => { durationRef.current += 1; publish(); }, 1000);
          }
        } else if (st === 'failed') {
          endCall('failed');
        } else if (st === 'disconnected') {
          // 'disconnected' は一時的なことが多く、数秒で 'connected' に戻る場合がある。
          // 即終了せず猶予を与え、復帰しなければ終了する（接続直後のフラつきで切れるのを防ぐ）。
          if (phaseRef.current === 'connected' && !disconnectTimerRef.current) {
            disconnectTimerRef.current = setTimeout(() => {
              disconnectTimerRef.current = null;
              if (phaseRef.current === 'connected' && pc.connectionState !== 'connected') {
                LOG('disconnected grace expired -> end');
                endCall('ended');
              }
            }, 7000);
          }
        }
      } catch (err) { LOG('onconnectionstatechange error', err?.message); }
    };
    pcRef.current = pc;
    return pc;
  }, [publish, endCall]);

  // ── rtc:<callId> セッションチャンネルに join（offer/answer/bye/accept をやり取り） ──
  const joinRtc = useCallback((callId, onReady) => {
    const sb = getSupabaseClient();
    const ch = sb.channel(rtcTopic(callId));

    ch.on('broadcast', { event: 'accept' }, async () => {
      // 発信側のみ: 相手が応答 → オファー生成
      if (roleRef.current !== 'caller' || phaseRef.current === 'connected') return;
      LOG('rtc accept recv -> caller builds offer');
      if (ringTimerRef.current) { clearTimeout(ringTimerRef.current); ringTimerRef.current = null; }
      phaseRef.current = 'connecting'; publish();
      try {
        const pc = await buildPc();
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await waitIceGathering(pc);
        ch.send({ type: 'broadcast', event: 'offer', payload: { sdp: pc.localDescription } });
      } catch (err) {
        ch.send({ type: 'broadcast', event: 'bye', payload: {} });
        endCall(err?.name === 'NotAllowedError' ? 'micDenied' : 'failed');
      }
    });

    ch.on('broadcast', { event: 'offer' }, async ({ payload }) => {
      // 着信側のみ: オファー受信 → アンサー生成
      if (roleRef.current !== 'callee') return;
      LOG('rtc offer recv -> callee builds answer');
      try {
        const pc = pcRef.current;
        if (!pc) return;
        await pc.setRemoteDescription(payload.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await waitIceGathering(pc);
        ch.send({ type: 'broadcast', event: 'answer', payload: { sdp: pc.localDescription } });
      } catch {
        ch.send({ type: 'broadcast', event: 'bye', payload: {} });
        endCall('failed');
      }
    });

    ch.on('broadcast', { event: 'answer' }, async ({ payload }) => {
      if (roleRef.current !== 'caller') return;
      LOG('rtc answer recv -> caller setRemoteDescription');
      try { await pcRef.current?.setRemoteDescription(payload.sdp); }
      catch (err) { LOG('setRemoteDescription(answer) error', err?.message); endCall('failed'); }
    });

    ch.on('broadcast', { event: 'bye' }, () => { LOG('rtc bye recv'); endCall('ended'); });

    rtcChanRef.current = ch;
    ch.subscribe((status) => { if (status === 'SUBSCRIBED') onReady?.(ch); });
    return ch;
  }, [buildPc, publish, endCall]);

  // ════════════════════ 公開 API ════════════════════

  // 発信
  const startCall = useCallback((target) => {
    if (!myUid || !target?.id) return;
    if (phaseRef.current !== 'idle') return;
    const targetId = String(target.id);
    if (targetId === myUid) return;

    const callId = `${myUid}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    LOG('startCall -> target', targetId, 'callId', callId);
    callIdRef.current = callId;
    roleRef.current = 'caller';
    peerRef.current = { id: targetId, name: target.name || '', av: target.av || target.avatar, col: target.col || target.color };
    phaseRef.current = 'outgoing';
    mutedRef.current = false;
    endReasonRef.current = null;
    wasConnectedRef.current = false;
    publish();

    // セッションチャンネルに先に join してから相手の呼び鈴へ invite を送る
    joinRtc(callId, () => {
      const sb = getSupabaseClient();
      const bell = sb.channel(callTopic(targetId));
      peerBellRef.current = bell;
      bell.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          bell.send({ type: 'broadcast', event: 'invite', payload: {
            callId, from: myUid, fromName: me?.name || '', fromAv: me?.av, fromCol: me?.col,
          } });
        }
      });
    });

    ringTimerRef.current = setTimeout(() => {
      if (phaseRef.current === 'outgoing' || phaseRef.current === 'connecting') {
        sendCancel();
        endCall('declined');
      }
    }, RING_TIMEOUT_MS);
  }, [myUid, me, publish, joinRtc, sendCancel, endCall]);

  // 着信に応答
  const accept = useCallback(async () => {
    if (phaseRef.current !== 'incoming') return;
    LOG('accept -> callee builds pc, sends accept');
    if (incomingTimerRef.current) { clearTimeout(incomingTimerRef.current); incomingTimerRef.current = null; }
    phaseRef.current = 'connecting'; publish();
    try {
      await buildPc(); // 先にマイクを取得（拒否時はここで例外）
      const ch = rtcChanRef.current;
      ch?.send({ type: 'broadcast', event: 'accept', payload: {} });
      // 以降は 'offer' 受信ハンドラがアンサーを返す
    } catch (err) {
      const peer = peerRef.current;
      if (peer) sendToBell(peer.id, 'decline', { callId: callIdRef.current });
      endCall(err?.name === 'NotAllowedError' ? 'micDenied' : 'failed');
    }
  }, [buildPc, publish, sendToBell, endCall]);

  // 着信を拒否
  const decline = useCallback(() => {
    if (phaseRef.current !== 'incoming') return;
    const peer = peerRef.current;
    if (peer) sendToBell(peer.id, 'decline', { callId: callIdRef.current });
    endCall('ended');
  }, [sendToBell, endCall]);

  // 終了 / キャンセル（状況に応じて適切な信号を送る）
  const hangup = useCallback(() => {
    const phase = phaseRef.current;
    if (phase === 'idle' || phase === 'ended') return;
    if (phase === 'incoming') { decline(); return; }
    if (phase === 'outgoing') {
      sendCancel();
      endCall('ended');
      return;
    }
    // connecting / connected
    try { rtcChanRef.current?.send({ type: 'broadcast', event: 'bye', payload: {} }); } catch {}
    endCall('ended');
  }, [decline, sendCancel, endCall]);

  // ミュート切替
  const toggleMute = useCallback(() => {
    mutedRef.current = !mutedRef.current;
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !mutedRef.current; });
    publish();
  }, [publish]);

  // ── 自分の呼び鈴 call:<myUid> を常時購読（着信・キャンセル等の受信） ──
  useEffect(() => {
    if (!myUid) return;
    const sb = getSupabaseClient();
    const bell = sb.channel(callTopic(myUid));

    bell.on('broadcast', { event: 'invite' }, ({ payload }) => {
      LOG('invite recv from', payload?.from, 'callId', payload?.callId);
      // 通話中なら自動的に busy を返す
      if (phaseRef.current !== 'idle') {
        sendToBell(payload.from, 'busy', { callId: payload.callId });
        return;
      }
      callIdRef.current = payload.callId;
      roleRef.current = 'callee';
      peerRef.current = { id: String(payload.from), name: payload.fromName || '', av: payload.fromAv, col: payload.fromCol };
      phaseRef.current = 'incoming';
      mutedRef.current = false;
      endReasonRef.current = null;
      wasConnectedRef.current = false;
      publish();
      // セッションチャンネルに join しておく（応答時に accept/offer をやり取りするため）
      joinRtc(payload.callId);
      incomingTimerRef.current = setTimeout(() => {
        if (phaseRef.current === 'incoming') decline();
      }, INCOMING_TIMEOUT_MS);
    });

    bell.on('broadcast', { event: 'cancel' }, ({ payload }) => {
      if (callIdRef.current === payload.callId && phaseRef.current === 'incoming') endCall('ended');
    });
    bell.on('broadcast', { event: 'decline' }, ({ payload }) => {
      if (callIdRef.current === payload.callId && (phaseRef.current === 'outgoing' || phaseRef.current === 'connecting')) endCall('rejected');
    });
    bell.on('broadcast', { event: 'busy' }, ({ payload }) => {
      if (callIdRef.current === payload.callId && (phaseRef.current === 'outgoing' || phaseRef.current === 'connecting')) endCall('busy');
    });

    bell.subscribe();
    return () => { try { sb.removeChannel(bell); } catch {} };
    // joinRtc/decline/endCall/sendToBell/publish は安定（useCallback）。myUid 変化時のみ貼り直す。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myUid]);

  // アンマウント時に進行中の通話を畳む
  useEffect(() => () => teardown(), [teardown]);

  return { call, startCall, accept, decline, hangup, toggleMute };
}
