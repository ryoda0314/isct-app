import { useState, useEffect } from 'react';
import React from 'react';
import { T } from '../theme.js';
import { I } from '../icons.jsx';

// Module-level pub/sub (no Provider needed)
let _listeners = [];
let _toasts = [];
let _nextId = 1;

function notify() {
  _listeners.forEach(fn => fn([..._toasts]));
}

export function showToast(msg, type = 'error') {
  const id = _nextId++;
  _toasts = [{ id, type, msg }, ..._toasts].slice(0, 3);
  notify();
  setTimeout(() => {
    _toasts = _toasts.filter(t => t.id !== id);
    notify();
  }, 4000);
}

export function useToasts() {
  const [toasts, setToasts] = useState([..._toasts]);
  useEffect(() => {
    _listeners.push(setToasts);
    return () => { _listeners = _listeners.filter(fn => fn !== setToasts); };
  }, []);
  return toasts;
}

const colors = { error: '#ef4444', success: '#22c55e' };

export function Toasts() {
  const toasts = useToasts();
  if (!toasts.length) return null;
  return (
    <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          pointerEvents: 'auto',
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', borderRadius: 8,
          background: T.bg2, border: `1px solid ${colors[t.type] || colors.error}44`,
          boxShadow: '0 4px 12px rgba(0,0,0,.3)',
          color: T.txH, fontSize: 13, fontWeight: 500,
          maxWidth: 320, animation: 'toastIn .2s ease-out',
        }}>
          <span style={{ width: 4, height: 28, borderRadius: 2, background: colors[t.type] || colors.error, flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{t.msg}</span>
          <span onClick={() => { _toasts = _toasts.filter(x => x.id !== t.id); notify(); }}
            style={{ cursor: 'pointer', color: T.txD, display: 'flex', flexShrink: 0 }}>{I.x}</span>
        </div>
      ))}
    </div>
  );
}
