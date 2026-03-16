import { useState, useRef, useEffect, useCallback } from "react";
import { T } from "../theme.js";
import jsQR from "jsqr";

/**
 * Extract TOTP secret from otpauth:// URI
 * e.g. "otpauth://totp/isct:wlpk5780?secret=27XBTRKXL63Y357I&issuer=isct"
 */
function parseOtpAuth(uri) {
  try {
    const url = new URL(uri);
    if (url.protocol !== "otpauth:") return null;
    return url.searchParams.get("secret")?.toUpperCase() || null;
  } catch {
    return null;
  }
}

/** Decode QR from an ImageData object */
function decodeQR(imageData) {
  const code = jsQR(imageData.data, imageData.width, imageData.height);
  return code?.data || null;
}

/**
 * QRScanner — camera or file-based QR code reader for TOTP setup
 * @param {Function} onSecret - called with extracted TOTP secret string
 * @param {Function} onClose - called to close the scanner
 */
export function QRScanner({ onSecret, onClose }) {
  const [mode, setMode] = useState(null); // null | "camera" | "file"
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const fileRef = useRef(null);

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const handleResult = useCallback((raw) => {
    const secret = parseOtpAuth(raw);
    if (secret) {
      stopCamera();
      onSecret(secret);
    } else {
      setError("QRコードからシークレットを取得できませんでした");
    }
  }, [onSecret, stopCamera]);

  /* ── Camera scanning ── */
  const startCamera = useCallback(async () => {
    setMode("camera");
    setError(null);
    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      const scan = () => {
        if (!streamRef.current) return;
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const raw = decodeQR(imageData);
          if (raw) {
            handleResult(raw);
            return;
          }
        }
        rafRef.current = requestAnimationFrame(scan);
      };
      rafRef.current = requestAnimationFrame(scan);
    } catch (e) {
      setError("カメラを起動できませんでした: " + e.message);
      setScanning(false);
    }
  }, [handleResult]);

  /* ── File scanning ── */
  const handleFile = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMode("file");
    setError(null);
    setScanning(true);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const raw = decodeQR(imageData);
      if (raw) {
        handleResult(raw);
      } else {
        setError("QRコードが見つかりませんでした。画像を確認してください。");
      }
      setScanning(false);
    };
    img.onerror = () => {
      setError("画像を読み込めませんでした");
      setScanning(false);
    };
    img.src = URL.createObjectURL(file);
    if (fileRef.current) fileRef.current.value = "";
  }, [handleResult]);

  const close = () => { stopCamera(); onClose(); };

  /* ── Choose mode ── */
  if (!mode) {
    return (
      <div style={{ marginTop: 10, padding: 14, borderRadius: 12, border: `1px solid ${T.bd}`, background: T.bg3 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 10 }}>
          QRコードからシークレットを読み取る
        </div>
        <p style={{ fontSize: 11, color: T.txD, marginBottom: 12, lineHeight: 1.5 }}>
          ISCTアカウント設定の「多要素認証(OTP)」ページに表示されるQRコードを読み取ります
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={startCamera} style={{
            flex: 1, padding: "10px 0", borderRadius: 8,
            border: `1px solid ${T.accent}40`, background: `${T.accent}08`,
            color: T.accent, fontSize: 12, fontWeight: 600, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
            カメラ
          </button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
          <button onClick={() => fileRef.current?.click()} style={{
            flex: 1, padding: "10px 0", borderRadius: 8,
            border: `1px solid ${T.accent}40`, background: `${T.accent}08`,
            color: T.accent, fontSize: 12, fontWeight: 600, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            スクリーンショット
          </button>
        </div>
        <button onClick={close} style={{
          width: "100%", marginTop: 8, padding: "6px 0",
          background: "none", border: "none", color: T.txD,
          fontSize: 11, cursor: "pointer",
        }}>キャンセル</button>
        {error && <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: `${T.red}14`, color: T.red, fontSize: 12 }}>{error}</div>}
      </div>
    );
  }

  /* ── Camera view ── */
  if (mode === "camera") {
    return (
      <div style={{ marginTop: 10, padding: 14, borderRadius: 12, border: `1px solid ${T.bd}`, background: T.bg3 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 8 }}>
          QRコードをカメラに向けてください
        </div>
        <div style={{ position: "relative", borderRadius: 8, overflow: "hidden", background: "#000" }}>
          <video ref={videoRef} style={{ width: "100%", display: "block" }} playsInline muted />
          {/* Scanning overlay */}
          <div style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            pointerEvents: "none",
          }}>
            <div style={{
              width: "60%", aspectRatio: "1", border: `2px solid ${T.accent}`,
              borderRadius: 12, boxShadow: `0 0 0 9999px rgba(0,0,0,0.4)`,
            }} />
          </div>
        </div>
        <canvas ref={canvasRef} style={{ display: "none" }} />
        <button onClick={close} style={{
          width: "100%", marginTop: 10, padding: "10px 0", borderRadius: 8,
          border: `1px solid ${T.bd}`, background: T.bg2,
          color: T.txD, fontSize: 13, cursor: "pointer",
        }}>閉じる</button>
        {error && <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: `${T.red}14`, color: T.red, fontSize: 12 }}>{error}</div>}
      </div>
    );
  }

  /* ── File processing ── */
  return (
    <div style={{ marginTop: 10, padding: 14, borderRadius: 12, border: `1px solid ${T.bd}`, background: T.bg3 }}>
      {scanning ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: T.txD, fontSize: 13 }}>
          <div style={{ width: 16, height: 16, border: `2px solid ${T.bd}`, borderTop: `2px solid ${T.accent}`, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
          読み取り中...
        </div>
      ) : (
        <>
          {error && <div style={{ padding: "8px 12px", borderRadius: 8, background: `${T.red}14`, color: T.red, fontSize: 12, marginBottom: 8 }}>{error}</div>}
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
          <button onClick={() => fileRef.current?.click()} style={{
            width: "100%", padding: "10px 0", borderRadius: 8,
            border: `1px solid ${T.accent}40`, background: `${T.accent}08`,
            color: T.accent, fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>別の画像を選択</button>
          <button onClick={close} style={{
            width: "100%", marginTop: 6, padding: "6px 0",
            background: "none", border: "none", color: T.txD, fontSize: 11, cursor: "pointer",
          }}>キャンセル</button>
        </>
      )}
    </div>
  );
}
