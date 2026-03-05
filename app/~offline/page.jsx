"use client";

export default function OfflinePage() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100dvh',
      background: '#111113', color: '#dddde0', fontFamily: 'Inter, sans-serif',
      padding: 24,
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>📡</div>
      <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 8px' }}>
        オフラインです
      </h1>
      <p style={{ fontSize: 14, color: '#68687a', textAlign: 'center', maxWidth: 300 }}>
        インターネットに接続されていません。接続を確認して、もう一度お試しください。
      </p>
      <button
        onClick={() => typeof window !== 'undefined' && window.location.reload()}
        style={{
          marginTop: 24, padding: '10px 24px', borderRadius: 8,
          background: '#6375f0', color: '#fff', border: 'none',
          fontSize: 14, fontWeight: 500, cursor: 'pointer',
        }}
      >
        再読み込み
      </button>
    </div>
  );
}