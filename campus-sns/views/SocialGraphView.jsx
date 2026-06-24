import { useState, useEffect, useRef, useCallback } from 'react';
import { T } from '../theme.js';
import { t } from '../i18n.js';
import { Av, Loader } from '../shared.jsx';

const _isImg = (s) => typeof s === 'string' && (s.startsWith('http') || s.startsWith('data:') || s.startsWith('/'));

/**
 * Force-directed social graph rendered on a <canvas> (no external libs — CSP-safe).
 * me = degree 0 (pinned center), friends = degree 1, friends-of-friends = degree 2.
 */
export const SocialGraphView = ({ mob, fetchGraph, userId, onStartDM, sendRequest, openProfile, scope = 'ego' }) => {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const nodesRef = useRef([]);        // {id,name,avatar,color,dept,degree,mutual,x,y,vx,vy,pinned,r}
  const edgesRef = useRef([]);        // {a:nodeRef, b:nodeRef}
  const viewRef = useRef({ scale: 1, ox: 0, oy: 0 });
  const alphaRef = useRef(1);
  const rafRef = useRef(0);
  const imgCache = useRef(new Map());
  const ptrs = useRef(new Map());     // active pointers
  const dragRef = useRef(null);       // { node, moved } | { panning, moved }
  const pinchRef = useRef(null);      // { dist, scale }
  const scopeRef = useRef(scope);     // 'ego' | 'all'（描画の色分けに使用）
  const fittedRef = useRef(false);    // 初回緩和後に一度だけ全体フィットしたか

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [selected, setSelected] = useState(null);
  const [actionState, setActionState] = useState(null); // 'sending' | 'sent'
  const [truncated, setTruncated] = useState(false);

  /* ── load graph data & lay out ── */
  const load = useCallback(async () => {
    setLoading(true); setErr(false); setEmpty(false);
    scopeRef.current = scope;
    const g = await fetchGraph?.(scope);
    if (!g || !g.me) { setErr(true); setLoading(false); return; }
    if (!g.nodes || g.nodes.length === 0) { setEmpty(true); setLoading(false); return; }
    setTruncated(!!g.truncated);

    const isAll = scope === 'all';
    const me = { ...g.me, degree: 0 };
    const all = [me, ...g.nodes];
    // ノードが多いとき(=学内全体)は小さく描く
    const k = all.length > 200 ? 0.45 : all.length > 90 ? 0.6 : 1;
    const byId = new Map();
    // Initial layout: ego は me 中心の同心円。all は全体を散らす(me は固定しない)。
    const GA = 2.399963;
    all.forEach((n, i) => {
      const ring = isAll ? 60 + (i % 50) * 8 : n.degree === 0 ? 0 : n.degree === 1 ? 150 : 290;
      const ang = i * GA;
      const atCenter = n.degree === 0 && !isAll;
      const node = {
        ...n,
        x: atCenter ? 0 : Math.cos(ang) * ring + (i % 5) * 4,
        y: atCenter ? 0 : Math.sin(ang) * ring + (i % 3) * 4,
        vx: 0, vy: 0,
        pinned: atCenter, // all モードでは me も自由に動く
        r: (n.degree === 0 ? 26 : n.degree === 1 ? 19 : 13) * k,
      };
      byId.set(n.id, node);
    });
    nodesRef.current = [...byId.values()];
    edgesRef.current = (g.edges || [])
      .map(([a, b]) => ({ a: byId.get(a), b: byId.get(b) }))
      .filter(e => e.a && e.b);

    // Preload image avatars
    for (const n of nodesRef.current) {
      if (_isImg(n.avatar) && !imgCache.current.has(n.avatar)) {
        const img = new Image();
        img.src = n.avatar;
        imgCache.current.set(n.avatar, img);
      }
    }

    viewRef.current = { scale: 1, ox: 0, oy: 0 };
    alphaRef.current = 1;
    fittedRef.current = false;
    setLoading(false);
    kick();
  }, [fetchGraph, scope]);

  useEffect(() => { load(); }, [load]);

  /* ── physics tick ── */
  const step = useCallback(() => {
    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    const alpha = alphaRef.current;
    const n = nodes.length;
    const isAll = scopeRef.current === 'all';

    // 交差を減らすには「よく広げて十分に緩和させる」のが要点:
    //  斥力を強く / 辺を長く / 中心引力を弱く。ノードが多いほど広げる。
    const repK = isAll ? 26000 : 16000;
    const lenK = isAll ? (n > 200 ? 2.2 : 1.7) : 1.3;
    const grav = isAll ? 0.0016 : 0.003;
    const damp = 0.84;

    // Repulsion (all pairs)
    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) { dx = (i - j) || 1; dy = 1; d2 = 2; }
        const d = Math.sqrt(d2);
        const rep = repK / d2;
        const fx = (dx / d) * rep, fy = (dy / d) * rep;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }
    }
    // Springs（理想長を長めに取り、クラスタを離して交差を減らす）
    for (const e of edges) {
      const a = e.a, b = e.b;
      const base = (a.degree === 0 || b.degree === 0) ? 150
        : (a.degree === 2 && b.degree === 2) ? 120 : 110;
      const ideal = base * lenK;
      let dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - ideal) * 0.04;
      const fx = (dx / d) * f, fy = (dy / d) * f;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    }
    // Centering gravity + integrate
    let motion = 0;
    for (const node of nodes) {
      if (node.pinned) { node.x = node.degree === 0 ? 0 : node.x; node.y = node.degree === 0 ? 0 : node.y; node.vx = 0; node.vy = 0; continue; }
      node.vx += -node.x * grav;
      node.vy += -node.y * grav;
      node.vx *= damp; node.vy *= damp;
      node.x += node.vx * alpha;
      node.y += node.vy * alpha;
      motion += Math.abs(node.vx) + Math.abs(node.vy);
    }
    // ゆっくり冷ます = より時間をかけて緩和し、交差の少ない配置に落ち着く
    alphaRef.current = Math.max(0, alpha - 0.0042);
    return motion;
  }, []);

  /* ── render ── */
  const draw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = cv.width / dpr, h = cv.height / dpr;
    const { scale, ox, oy } = viewRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2 + ox, h / 2 + oy);
    ctx.scale(scale, scale);

    // Edges — 3種類に色分け:
    //  ・自分/友達どうし(accent)
    //  ・友達↔2次(やや薄め)
    //  ・2次↔2次 = あなたと繋がりのない人どうしのつながり(orangeで目立たせる)
    const isAll = scopeRef.current === 'all';
    // 線幅をズーム補正: ctx.scale で線が縮むため px/scale で画面上の太さを保ち、
    // 縮小時(scale小)はさらに最大1.8倍まで太くして見やすくする。
    const lw = (px) => px / scale * Math.min(1.8, Math.max(1, 0.7 / scale));
    for (const e of edgesRef.current) {
      if (isAll) {
        // 学内全体: 自分/友達に接する辺だけ強調、他は薄く
        const hot = e.a.degree <= 1 || e.b.degree <= 1;
        ctx.lineWidth = lw(hot ? 1.6 : 0.9);
        ctx.strokeStyle = hot ? `${T.accent}88` : `${T.tx}22`;
      } else {
        const bothSecond = e.a.degree === 2 && e.b.degree === 2;
        const anySecond = e.a.degree === 2 || e.b.degree === 2;
        ctx.lineWidth = lw(bothSecond ? 2 : anySecond ? 1.3 : 1.6);
        ctx.strokeStyle = bothSecond ? `${T.orange}cc` : anySecond ? `${T.tx}55` : `${T.accent}66`;
      }
      ctx.beginPath();
      ctx.moveTo(e.a.x, e.a.y);
      ctx.lineTo(e.b.x, e.b.y);
      ctx.stroke();
    }

    // Nodes
    for (const node of nodesRef.current) {
      const r = node.r;
      const isMe = node.degree === 0;
      const dim = node.degree === 2;
      ctx.save();
      ctx.globalAlpha = dim ? 0.92 : 1;
      // ring/halo
      if (isMe) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 4, 0, Math.PI * 2);
        ctx.fillStyle = `${T.accent}22`;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      const img = _isImg(node.avatar) ? imgCache.current.get(node.avatar) : null;
      if (img && img.complete && img.naturalWidth) {
        ctx.save();
        ctx.clip();
        ctx.drawImage(img, node.x - r, node.y - r, r * 2, r * 2);
        ctx.restore();
      } else {
        ctx.fillStyle = node.color || T.accent;
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `700 ${r * 0.8}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((node.avatar && !_isImg(node.avatar)) ? node.avatar : (node.name?.[0] || '?'), node.x, node.y + 1);
      }
      // border
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      ctx.lineWidth = isMe ? 3 : 2;
      ctx.strokeStyle = isMe ? T.accent : (node.degree === 1 ? `${T.accent}88` : T.bd);
      ctx.stroke();
      ctx.restore();

      // label
      if (!dim || scale > 0.85) {
        ctx.fillStyle = T.txH;
        ctx.font = `600 ${isMe ? 12 : dim ? 9.5 : 11}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const name = node.name || '';
        const label = name.length > 8 ? name.slice(0, 8) + '…' : name;
        ctx.fillText(label, node.x, node.y + r + 3);
      }
    }
    ctx.restore();
  }, []);

  // 全ノードが収まるように scale / pan を自動調整
  const fitView = useCallback(() => {
    const nodes = nodesRef.current, cv = canvasRef.current;
    if (!nodes.length || !cv) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const nd of nodes) {
      if (nd.x < minX) minX = nd.x; if (nd.x > maxX) maxX = nd.x;
      if (nd.y < minY) minY = nd.y; if (nd.y > maxY) maxY = nd.y;
    }
    const rect = cv.getBoundingClientRect();
    const w = rect.width || 1, h = rect.height || 1;
    const gw = (maxX - minX) || 1, gh = (maxY - minY) || 1;
    const pad = 90;
    const scale = Math.min(2, Math.max(0.15, Math.min((w - pad) / gw, (h - pad) / gh)));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    viewRef.current = { scale, ox: -cx * scale, oy: -cy * scale };
    draw();
  }, [draw]);

  const loop = useCallback(() => {
    const motion = step();
    draw();
    if (alphaRef.current > 0.01 || motion > 0.5 || dragRef.current?.node) {
      rafRef.current = requestAnimationFrame(loop);
    } else {
      rafRef.current = 0;
      // 緩和が落ち着いたら一度だけ全体が見えるようフィット
      if (!fittedRef.current) { fittedRef.current = true; fitView(); }
    }
  }, [step, draw, fitView]);

  const kick = useCallback(() => {
    if (!rafRef.current) rafRef.current = requestAnimationFrame(loop);
  }, [loop]);

  const reheat = useCallback(() => { alphaRef.current = Math.max(alphaRef.current, 0.7); kick(); }, [kick]);

  /* ── canvas sizing (DPR + resize) ── */
  useEffect(() => {
    const cv = canvasRef.current, wrap = wrapRef.current;
    if (!cv || !wrap) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = wrap.getBoundingClientRect();
      cv.width = Math.max(1, rect.width) * dpr;
      cv.height = Math.max(1, rect.height) * dpr;
      cv.style.width = rect.width + 'px';
      cv.style.height = rect.height + 'px';
      draw();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [draw]);

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  /* ── coordinate helpers ── */
  const screenToGraph = (sx, sy) => {
    const cv = canvasRef.current;
    const rect = cv.getBoundingClientRect();
    const { scale, ox, oy } = viewRef.current;
    const x = sx - rect.left - rect.width / 2 - ox;
    const y = sy - rect.top - rect.height / 2 - oy;
    return { x: x / scale, y: y / scale };
  };
  const hitNode = (sx, sy) => {
    const { x, y } = screenToGraph(sx, sy);
    const nodes = nodesRef.current;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const dx = x - n.x, dy = y - n.y;
      if (dx * dx + dy * dy <= (n.r + 4) * (n.r + 4)) return n;
    }
    return null;
  };

  /* ── pointer interaction ── */
  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 2) {
      const [p1, p2] = [...ptrs.current.values()];
      pinchRef.current = { dist: Math.hypot(p1.x - p2.x, p1.y - p2.y), scale: viewRef.current.scale };
      dragRef.current = null;
      return;
    }
    const node = hitNode(e.clientX, e.clientY);
    if (node) {
      dragRef.current = { node, moved: false };
      node._wasPinned = node.pinned;
      node.pinned = true;
    } else {
      dragRef.current = { panning: true, moved: false, sx: e.clientX, sy: e.clientY, ox: viewRef.current.ox, oy: viewRef.current.oy };
    }
  };
  const onPointerMove = (e) => {
    if (!ptrs.current.has(e.pointerId)) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinchRef.current && ptrs.current.size === 2) {
      const [p1, p2] = [...ptrs.current.values()];
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const next = Math.min(3, Math.max(0.12, pinchRef.current.scale * (dist / pinchRef.current.dist)));
      viewRef.current.scale = next;
      draw();
      return;
    }
    const d = dragRef.current;
    if (!d) return;
    if (d.node) {
      const { x, y } = screenToGraph(e.clientX, e.clientY);
      d.node.x = x; d.node.y = y; d.node.vx = 0; d.node.vy = 0;
      d.moved = true;
      reheat();
    } else if (d.panning) {
      viewRef.current.ox = d.ox + (e.clientX - d.sx);
      viewRef.current.oy = d.oy + (e.clientY - d.sy);
      if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 4) d.moved = true;
      draw();
    }
  };
  const onPointerUp = (e) => {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size < 2) pinchRef.current = null;
    const d = dragRef.current;
    if (d?.node) {
      if (!d.moved) { setSelected(d.node); setActionState(null); }
      // un-pin friends/FoF after drag so layout can relax; keep me pinned
      if (d.node.degree !== 0 && !d.node._wasPinned) d.node.pinned = false;
      reheat();
    }
    dragRef.current = null;
  };
  // ホイールズーム: React は wheel を passive リスナーで登録するため onWheel 内の
  // preventDefault が効かず警告が出る。canvas に非passive のネイティブリスナーを張る。
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const handler = (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      viewRef.current.scale = Math.min(3, Math.max(0.12, viewRef.current.scale * factor));
      draw();
    };
    cv.addEventListener('wheel', handler, { passive: false });
    return () => cv.removeEventListener('wheel', handler);
  }, [draw]);

  const recenter = () => { fitView(); };

  /* ── selected-node action sheet ── */
  const doAdd = async () => {
    if (!sendRequest || !selected) return;
    setActionState('sending');
    const ok = await sendRequest(selected.id);
    setActionState(ok ? 'sent' : null);
  };

  return (
    <div ref={wrapRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', background: T.bg, touchAction: 'none' }}>
      {loading && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Loader msg={t('common.loading')} size="sm" /></div>}

      {err && !loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: T.txD }}>{t('graph.loadFail')}</div>
          <button onClick={load} style={{ padding: '8px 18px', borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{t('graph.retry')}</button>
        </div>
      )}

      {empty && !loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, background: `${T.accent}10`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3" /><circle cx="18" cy="18" r="3" /><circle cx="18" cy="6" r="3" /><path d="M8.5 7.5l7 9M15.5 6h-7" /></svg>
          </div>
          <div style={{ fontSize: 13, color: T.txD, lineHeight: 1.6, maxWidth: 240 }}>{t('graph.empty')}</div>
        </div>
      )}

      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ display: (loading || err || empty) ? 'none' : 'block', cursor: 'grab', touchAction: 'none' }}
      />

      {/* Legend */}
      {!loading && !err && !empty && (
        <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', flexDirection: 'column', gap: 5, background: `${T.bg2}d8`, border: `1px solid ${T.bd}`, borderRadius: 10, padding: '8px 10px', backdropFilter: 'blur(6px)' }}>
          {[[T.accent, t('graph.you')], [`${T.accent}88`, t('graph.friend')], [T.bd, scope === 'all' ? t('graph.other') : t('graph.fof')]].map(([c, label], i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 11, height: 11, borderRadius: '50%', background: i === 0 ? T.accent : T.bg3, border: `2px solid ${c}`, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: T.txD, fontWeight: 500 }}>{label}</span>
            </div>
          ))}
          {/* エッジ凡例: 知らない人どうしのつながり（ego のみ） */}
          {scope !== 'all' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 1 }}>
              <span style={{ width: 11, height: 0, borderTop: `2px solid ${T.orange}`, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: T.txD, fontWeight: 500 }}>{t('graph.fofLink')}</span>
            </div>
          )}
        </div>
      )}

      {/* 学内全体: ノード上限に達したときの注意書き */}
      {!loading && !err && !empty && scope === 'all' && truncated && (
        <div style={{ position: 'absolute', top: 10, right: 10, maxWidth: 200, background: `${T.bg2}e0`, border: `1px solid ${T.bd}`, borderRadius: 10, padding: '6px 10px', fontSize: 10, color: T.txD, backdropFilter: 'blur(6px)' }}>
          {t('graph.truncated')}
        </div>
      )}

      {/* Recenter */}
      {!loading && !err && !empty && (
        <button onClick={recenter} title={t('graph.reset')}
          style={{ position: 'absolute', bottom: 14, right: 14, width: 40, height: 40, borderRadius: 12, border: `1px solid ${T.bd}`, background: `${T.bg2}e0`, color: T.txH, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>
        </button>
      )}

      {/* Selected node sheet */}
      {selected && (
        <>
          <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 100 }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: T.bg2, borderRadius: '16px 16px 0 0', zIndex: 101, padding: '16px', boxShadow: '0 -8px 30px rgba(0,0,0,.2)' }}>
            {mob && <div style={{ width: 36, height: 4, borderRadius: 2, background: T.bg4, margin: '-4px auto 12px' }} />}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <Av u={{ name: selected.name, av: selected.avatar, col: selected.color }} sz={48} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: T.txH, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.name}</div>
                {selected.dept && <div style={{ fontSize: 12, color: T.txD }}>{selected.dept}</div>}
                <div style={{ fontSize: 11, color: T.txD, marginTop: 2 }}>
                  {selected.degree === 0 ? t('graph.you') : selected.degree === 1 ? t('graph.friend') : t('graph.mutual', { n: selected.mutual || 0 })}
                </div>
              </div>
            </div>
            {selected.degree !== 0 && openProfile && (
              <button onClick={() => { openProfile(selected.id); setSelected(null); }}
                style={{ width: '100%', padding: '11px 0', borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 8 }}>
                {t('profile.viewProfile')}
              </button>
            )}
            {selected.degree === 1 && onStartDM && (
              <button onClick={() => { onStartDM(selected.id, selected.name, selected.avatar, selected.color); setSelected(null); }}
                style={{ width: '100%', padding: '11px 0', borderRadius: 10, border: 'none', background: T.accent, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                {t('friends.message')}
              </button>
            )}
            {selected.degree === 2 && (
              <button onClick={doAdd} disabled={actionState === 'sending' || actionState === 'sent'}
                style={{ width: '100%', padding: '11px 0', borderRadius: 10, border: 'none', background: actionState === 'sent' ? T.green : T.accent, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: actionState === 'sending' ? 0.5 : 1 }}>
                {actionState === 'sent' ? t('friends.requesting') : actionState === 'sending' ? t('friends.searching') : t('friends.add')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};
