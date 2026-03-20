"use client";
import { useState, useEffect, useCallback } from "react";

/* ─── Browser / OS detection ─── */
function detect(ua) {
  const isIOS = /iP(hone|ad|od)/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isLINE = /Line\//i.test(ua);
  const isInstagram = /Instagram/i.test(ua);
  const isFacebook = /FBBV|FBAV|FB_IAB/i.test(ua);
  const isTwitter = /Twitter/i.test(ua);
  const isInApp = isLINE || isInstagram || isFacebook || isTwitter;
  const isSafari = /Safari/i.test(ua) && !/Chrome|CriOS|Edg/i.test(ua) && !isInApp;
  const isChrome = /Chrome|CriOS/i.test(ua) && !isInApp;
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
  return { isIOS, isAndroid, isLINE, isInstagram, isFacebook, isTwitter, isInApp, isSafari, isChrome, isStandalone };
}

/* ─── Inline SVG Icons ─── */
const ShareIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6375f0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/>
    <polyline points="16 6 12 2 8 6"/>
    <line x1="12" y1="2" x2="12" y2="15"/>
  </svg>
);
const PlusBoxIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6375f0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <line x1="12" y1="8" x2="12" y2="16"/>
    <line x1="8" y1="12" x2="16" y2="12"/>
  </svg>
);
const MenuDotsIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6375f0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="5" r="1.5" fill="#6375f0"/>
    <circle cx="12" cy="12" r="1.5" fill="#6375f0"/>
    <circle cx="12" cy="19" r="1.5" fill="#6375f0"/>
  </svg>
);
const ExternalIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6375f0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
    <polyline points="15 3 21 3 21 9"/>
    <line x1="10" y1="14" x2="21" y2="3"/>
  </svg>
);
const CheckCircleIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#3dae72" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="9 12 11.5 14.5 16 9.5"/>
  </svg>
);
const CopyIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2"/>
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
  </svg>
);

/* ─── Styles ─── */
const ACCENT = "#6375f0";
const BG = "#111113";
const BG2 = "#1a1a1f";
const BG3 = "#222228";
const TX = "#b0b0b8";
const TXH = "#dddde0";
const GREEN = "#3dae72";
const BD = "#2a2a34";

const S = {
  page: {
    minHeight: "100dvh", background: BG, color: TX,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    display: "flex", flexDirection: "column", alignItems: "center",
    padding: "0 16px 48px",
    touchAction: "pan-y",
    WebkitTextSizeAdjust: "100%",
    overflowX: "hidden",
  },
  header: {
    display: "flex", flexDirection: "column", alignItems: "center",
    paddingTop: 56, paddingBottom: 32, gap: 16,
  },
  appIcon: {
    width: 80, height: 80, borderRadius: 20,
    boxShadow: "0 8px 32px rgba(99,117,240,0.3)",
  },
  appName: {
    fontSize: 22, fontWeight: 700, color: TXH, margin: 0,
  },
  appDesc: {
    fontSize: 14, color: TX, margin: 0, textAlign: "center",
  },
  card: {
    background: BG2, borderRadius: 16, border: `1px solid ${BD}`,
    padding: "24px 20px", width: "100%", maxWidth: 420,
    marginTop: 16,
  },
  cardTitle: {
    fontSize: 16, fontWeight: 600, color: TXH, margin: "0 0 20px",
    display: "flex", alignItems: "center", gap: 8,
  },
  stepBadge: {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: 28, height: 28, borderRadius: 14,
    background: ACCENT, color: "#fff",
    fontSize: 14, fontWeight: 700, flexShrink: 0,
  },
  step: {
    display: "flex", gap: 14, marginBottom: 20, alignItems: "flex-start",
  },
  stepText: {
    fontSize: 15, lineHeight: 1.6, color: TX, margin: 0, flex: 1,
  },
  highlight: {
    color: TXH, fontWeight: 600,
  },
  inlineIcon: {
    display: "inline-flex", verticalAlign: "middle", margin: "0 2px",
  },
  btn: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    width: "100%", padding: "14px 20px",
    background: ACCENT, color: "#fff", border: "none", borderRadius: 12,
    fontSize: 16, fontWeight: 600, cursor: "pointer",
    transition: "opacity 0.15s",
    marginTop: 8,
  },
  btnSecondary: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    width: "100%", padding: "12px 20px",
    background: BG3, color: TXH, border: `1px solid ${BD}`, borderRadius: 12,
    fontSize: 14, fontWeight: 500, cursor: "pointer",
    transition: "opacity 0.15s",
    marginTop: 8,
  },
  tag: {
    display: "inline-block", padding: "3px 10px", borderRadius: 6,
    background: BG3, border: `1px solid ${BD}`,
    fontSize: 13, fontWeight: 500, color: TXH,
  },
  divider: {
    width: "100%", height: 1, background: BD, margin: "8px 0",
  },
  successBox: {
    display: "flex", flexDirection: "column", alignItems: "center",
    gap: 12, padding: "20px 0",
  },
  tipBox: {
    background: BG3, borderRadius: 12, padding: "14px 16px",
    fontSize: 13, color: TX, lineHeight: 1.6, marginTop: 12,
  },
  sourceTag: {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "5px 12px", borderRadius: 20,
    background: "rgba(99,117,240,0.12)", border: "1px solid rgba(99,117,240,0.25)",
    fontSize: 13, fontWeight: 500, color: ACCENT,
    marginTop: 8,
  },
};

/* ─── Step component ─── */
function Step({ num, children }) {
  return (
    <div style={S.step}>
      <span style={S.stepBadge}>{num}</span>
      <p style={S.stepText}>{children}</p>
    </div>
  );
}

/* ─── In-app browser guide (LINE / Instagram / etc.) ─── */
function InAppGuide({ env, url, copied, onCopy }) {
  const appName = env.isLINE ? "LINE" : env.isInstagram ? "Instagram" : env.isFacebook ? "Facebook" : env.isTwitter ? "X (Twitter)" : "アプリ";
  const browserName = env.isIOS ? "Safari" : "Chrome";

  return (
    <>
      <div style={S.card}>
        <div style={S.sourceTag}>
          {appName} のアプリ内ブラウザを検出しました
        </div>
        <h2 style={{ ...S.cardTitle, marginTop: 16 }}>
          {browserName} で開いてください
        </h2>
        <p style={{ fontSize: 14, color: TX, lineHeight: 1.6, margin: "0 0 20px" }}>
          PWAのインストールには {browserName} が必要です。<br/>
          以下の手順で外部ブラウザに切り替えてください。
        </p>

        {env.isLINE && (
          <>
            <Step num={1}>
              画面右下の <span style={S.inlineIcon}><MenuDotsIcon/></span> <span style={S.highlight}>「{"\u22EF"}」</span>（メニュー）をタップ
            </Step>
            <Step num={2}>
              <span style={S.highlight}>「{env.isIOS ? "Safariで開く" : "他のブラウザで開く"}"」</span> <span style={S.inlineIcon}><ExternalIcon/></span> をタップ
            </Step>
          </>
        )}

        {env.isInstagram && (
          <>
            <Step num={1}>
              画面右下の <span style={S.inlineIcon}><MenuDotsIcon/></span> <span style={S.highlight}>「{"\u22EF"}」</span>（メニュー）をタップ
            </Step>
            <Step num={2}>
              <span style={S.highlight}>「ブラウザで開く」</span> <span style={S.inlineIcon}><ExternalIcon/></span> をタップ
            </Step>
          </>
        )}

        {(env.isFacebook || env.isTwitter) && (
          <>
            <Step num={1}>
              画面右下の <span style={S.inlineIcon}><MenuDotsIcon/></span> メニューをタップ
            </Step>
            <Step num={2}>
              <span style={S.highlight}>「ブラウザで開く」</span> <span style={S.inlineIcon}><ExternalIcon/></span> をタップ
            </Step>
          </>
        )}

        <div style={S.divider}/>

        <div style={S.tipBox}>
          上記の方法でうまくいかない場合は、URLをコピーして {browserName} に貼り付けてください。
        </div>

        <button
          style={S.btnSecondary}
          onClick={onCopy}
        >
          <CopyIcon/>
          {copied ? "コピーしました!" : "URLをコピー"}
        </button>
      </div>

      {/* Also show the PWA steps for reference */}
      <PWASteps env={env}/>
    </>
  );
}

/* ─── PWA install steps (Safari / Chrome) ─── */
function PWASteps({ env }) {
  return (
    <div style={S.card}>
      <h2 style={S.cardTitle}>
        <PlusBoxIcon/>
        ホーム画面に追加
      </h2>
      <p style={{ fontSize: 14, color: TX, lineHeight: 1.6, margin: "0 0 20px" }}>
        ブラウザで開いたら、以下の手順でアプリをインストールできます。
      </p>

      {env.isIOS ? (
        <>
          <Step num={1}>
            画面下部の <span style={S.inlineIcon}><ShareIcon/></span> <span style={S.highlight}>共有ボタン</span> をタップ
          </Step>
          <Step num={2}>
            メニューをスクロールして<br/>
            <span style={S.highlight}>「ホーム画面に追加」</span> <span style={S.inlineIcon}><PlusBoxIcon/></span> をタップ
          </Step>
          <Step num={3}>
            右上の <span style={S.highlight}>「追加」</span> をタップして完了!
          </Step>
        </>
      ) : (
        <>
          <Step num={1}>
            画面右上の <span style={S.inlineIcon}><MenuDotsIcon/></span> <span style={S.highlight}>メニュー</span>（{"\u22EE"}）をタップ
          </Step>
          <Step num={2}>
            <span style={S.highlight}>「ホーム画面に追加」</span>または<br/>
            <span style={S.highlight}>「アプリをインストール」</span>をタップ
          </Step>
          <Step num={3}>
            確認画面で <span style={S.highlight}>「インストール」</span> をタップして完了!
          </Step>
        </>
      )}
    </div>
  );
}

/* ─── Already installed ─── */
function AlreadyInstalled() {
  return (
    <div style={S.card}>
      <div style={S.successBox}>
        <CheckCircleIcon/>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: GREEN, margin: 0 }}>
          インストール済み
        </h2>
        <p style={{ fontSize: 14, color: TX, textAlign: "center", margin: 0, lineHeight: 1.6 }}>
          このアプリは既にホーム画面に<br/>追加されています。
        </p>
        <button
          style={{ ...S.btn, marginTop: 12, maxWidth: 240 }}
          onClick={() => window.location.href = "/"}
        >
          アプリを開く
        </button>
      </div>
    </div>
  );
}

/* ─── Desktop fallback ─── */
function DesktopGuide() {
  return (
    <div style={S.card}>
      <h2 style={S.cardTitle}>
        <PlusBoxIcon/>
        スマートフォンでアクセスしてください
      </h2>
      <p style={{ fontSize: 14, color: TX, lineHeight: 1.6, margin: 0 }}>
        このアプリはスマートフォン向けに最適化されています。
        iPhoneまたはAndroidで このページのURLにアクセスし、
        ホーム画面に追加してください。
      </p>
    </div>
  );
}

/* ─── Main Page ─── */
export default function InstallPage() {
  const [env, setEnv] = useState(null);
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState("");

  useEffect(() => {
    const ua = navigator.userAgent;
    setEnv(detect(ua));
    setUrl(window.location.origin);

    // Prevent pinch-zoom on iOS Safari (ignores viewport meta)
    const preventZoom = (e) => { if (e.touches && e.touches.length > 1) e.preventDefault(); };
    document.addEventListener("touchmove", preventZoom, { passive: false });
    // Prevent double-tap zoom
    let lastTap = 0;
    const preventDoubleTap = (e) => {
      const now = Date.now();
      if (now - lastTap < 300) e.preventDefault();
      lastTap = now;
    };
    document.addEventListener("touchend", preventDoubleTap, { passive: false });

    return () => {
      document.removeEventListener("touchmove", preventZoom);
      document.removeEventListener("touchend", preventDoubleTap);
    };
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // Fallback for clipboard API not available
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [url]);

  if (!env) {
    return <div style={{ ...S.page, justifyContent: "center", alignItems: "center" }}>
      <div style={{ width: 32, height: 32, border: `3px solid ${BD}`, borderTopColor: ACCENT, borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>;
  }

  const isMobile = env.isIOS || env.isAndroid;

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <img src="/icons/icon-192x192.png" alt="ScienceTokyo App" style={S.appIcon}/>
        <h1 style={S.appName}>ScienceTokyo App</h1>
        <p style={S.appDesc}>東京科学大学キャンパスSNS</p>
      </div>

      {/* Content based on environment */}
      {env.isStandalone ? (
        <AlreadyInstalled/>
      ) : env.isInApp ? (
        <InAppGuide env={env} url={url} copied={copied} onCopy={handleCopy}/>
      ) : isMobile ? (
        <PWASteps env={env}/>
      ) : (
        <DesktopGuide/>
      )}

      {/* Footer link */}
      {!env.isStandalone && (
        <button
          style={{ ...S.btnSecondary, maxWidth: 420, marginTop: 24 }}
          onClick={() => window.location.href = "/"}
        >
          ブラウザ版で続ける
        </button>
      )}
    </div>
  );
}
