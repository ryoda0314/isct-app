import { useState, useRef, useCallback, useEffect } from "react";
import { T } from "../theme.js";
import { t } from "../i18n.js";

/* 30秒ごとにセグメントを区切って逐次文字起こしする「準リアルタイム」方式。
   録音を止めずに MediaRecorder を再起動することで、各セグメントを
   単体で完結した音声ファイルにし、そのまま /api/transcribe へ送る。 */
const SEGMENT_MS = 30_000;
const MAX_MINUTES = 180; // 安全上限（コスト暴走防止）

/** この環境の MediaRecorder が扱えるmimeTypeを選ぶ */
function pickMime() {
  const cands = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac"];
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of cands) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* ignore */ }
  }
  return "";
}

function fmtClock(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function LectureRecorderView({ mob = false }) {
  const [phase, setPhase] = useState("idle"); // idle | recording | summarizing | done
  const [elapsed, setElapsed] = useState(0);
  const [segments, setSegments] = useState([]); // [{idx, status:'pending'|'done'|'error', text}]
  const [summary, setSummary] = useState("");
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(null); // 'transcript' | 'summary' | null

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const recordingRef = useRef(false);
  const segTimerRef = useRef(null);
  const clockRef = useRef(null);
  const segIdxRef = useRef(0);
  const pendingRef = useRef(0); // 未完了の文字起こしリクエスト数
  const supported = typeof MediaRecorder !== "undefined";

  const cleanup = useCallback(() => {
    recordingRef.current = false;
    if (segTimerRef.current) { clearTimeout(segTimerRef.current); segTimerRef.current = null; }
    if (clockRef.current) { clearInterval(clockRef.current); clockRef.current = null; }
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try { recorderRef.current.stop(); } catch { /* ignore */ }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(tr => tr.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const transcribeSegment = useCallback(async (blob, idx) => {
    pendingRef.current += 1;
    try {
      const form = new FormData();
      form.append("audio", blob, `seg-${idx}.webm`);
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t("lec.errTranscribe"));
      setSegments(prev => prev.map(s => s.idx === idx ? { ...s, status: "done", text: data.text || "" } : s));
    } catch (e) {
      setSegments(prev => prev.map(s => s.idx === idx ? { ...s, status: "error", text: "" } : s));
    } finally {
      pendingRef.current -= 1;
    }
  }, []);

  // 1セグメント分の録音を開始し、SEGMENT_MS後に自身を停止する。
  const startSegment = useCallback(() => {
    if (!recordingRef.current || !streamRef.current) return;
    const mime = pickMime();
    let mr;
    try {
      mr = new MediaRecorder(streamRef.current, {
        ...(mime ? { mimeType: mime } : {}),
        audioBitsPerSecond: 48_000,
      });
    } catch {
      mr = new MediaRecorder(streamRef.current);
    }
    const localChunks = [];
    mr.ondataavailable = (e) => { if (e.data && e.data.size) localChunks.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(localChunks, { type: mr.mimeType || "audio/webm" });
      // 次のセグメントを即座に開始（録音継続中の場合）
      if (recordingRef.current) startSegment();
      if (blob.size > 200) {
        const idx = segIdxRef.current++;
        setSegments(prev => [...prev, { idx, status: "pending", text: "" }]);
        transcribeSegment(blob, idx);
      }
    };
    recorderRef.current = mr;
    mr.start();
    segTimerRef.current = setTimeout(() => {
      if (mr.state !== "inactive") { try { mr.stop(); } catch { /* ignore */ } }
    }, SEGMENT_MS);
  }, [transcribeSegment]);

  const start = useCallback(async () => {
    setError(null); setSummary(""); setSegments([]); setElapsed(0);
    segIdxRef.current = 0;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      recordingRef.current = true;
      setPhase("recording");
      startSegment();
      clockRef.current = setInterval(() => {
        setElapsed(prev => {
          const next = prev + 1;
          if (next >= MAX_MINUTES * 60) { stopRef.current?.(); }
          return next;
        });
      }, 1000);
    } catch (e) {
      setError(t("lec.errMic", { msg: e.message || "" }));
      setPhase("idle");
    }
  }, [startSegment]);

  const stop = useCallback(() => {
    recordingRef.current = false;
    if (segTimerRef.current) { clearTimeout(segTimerRef.current); segTimerRef.current = null; }
    if (clockRef.current) { clearInterval(clockRef.current); clockRef.current = null; }
    // 現在のセグメントを閉じる（onstopで最後のセグメントが送られ、次は始まらない）
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try { recorderRef.current.stop(); } catch { /* ignore */ }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(tr => tr.stop());
      streamRef.current = null;
    }
    setPhase("done");
  }, []);

  // stopをclockのコールバックから安全に呼べるようrefに保持
  const stopRef = useRef(stop);
  useEffect(() => { stopRef.current = stop; }, [stop]);

  const transcriptText = segments
    .filter(s => s.status === "done")
    .map(s => s.text)
    .filter(Boolean)
    .join("\n");

  const hasText = transcriptText.trim().length > 0;

  const summarize = useCallback(async () => {
    if (!hasText) return;
    setPhase("summarizing"); setError(null);
    try {
      const res = await fetch("/api/lecture-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: transcriptText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t("lec.errSummarize"));
      setSummary(data.summary || "");
    } catch (e) {
      setError(e.message || t("lec.errSummarize"));
    } finally {
      setPhase("done");
    }
  }, [hasText, transcriptText]);

  const copy = useCallback(async (kind, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch { /* ignore */ }
  }, []);

  const reset = useCallback(() => {
    cleanup();
    setPhase("idle"); setSegments([]); setSummary(""); setError(null); setElapsed(0);
    segIdxRef.current = 0; pendingRef.current = 0;
  }, [cleanup]);

  const pendingCount = segments.filter(s => s.status === "pending").length;
  const isRecording = phase === "recording";

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: mob ? "10px 14px 28px" : "6px 0 28px" }}>
      {!supported && (
        <div style={{ padding: "10px 12px", borderRadius: 10, background: `${T.red}14`, color: T.red, fontSize: 13, marginBottom: 12 }}>
          {t("lec.unsupported")}
        </div>
      )}

      {/* 録音コントロール */}
      <div style={{
        padding: 20, borderRadius: 18, border: `1px solid ${T.bd}`,
        background: isRecording ? `linear-gradient(135deg, ${T.red}18, ${T.bg3})` : T.bg3,
        textAlign: "center",
      }}>
        {phase === "idle" && (
          <>
            <p style={{ fontSize: 13, color: T.txD, lineHeight: 1.6, margin: "0 0 16px" }}>{t("lec.intro")}</p>
            <button onClick={start} disabled={!supported} style={{
              padding: "14px 28px", borderRadius: 999, border: "none",
              background: supported ? `linear-gradient(135deg, ${T.red}, ${T.orange})` : T.bg4,
              color: "#fff", fontSize: 15, fontWeight: 800, cursor: supported ? "pointer" : "default",
              display: "inline-flex", alignItems: "center", gap: 9,
            }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#fff" }} />
              {t("lec.start")}
            </button>
          </>
        )}

        {(isRecording || phase === "summarizing" || phase === "done") && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {isRecording && <span style={{ width: 11, height: 11, borderRadius: "50%", background: T.red, animation: "recPulse 1.2s ease-in-out infinite" }} />}
              <span style={{ fontSize: 34, fontWeight: 800, color: T.txH, fontVariantNumeric: "tabular-nums", letterSpacing: 1 }}>{fmtClock(elapsed)}</span>
            </div>
            {isRecording && (
              <div style={{ fontSize: 12, color: T.txD }}>
                {t("lec.liveHint")}{pendingCount > 0 ? ` ・ ${t("lec.processingN", { n: pendingCount })}` : ""}
              </div>
            )}
            {isRecording && (
              <button onClick={stop} style={{
                padding: "12px 26px", borderRadius: 999, border: `1px solid ${T.bd}`,
                background: T.bg2, color: T.txH, fontSize: 14, fontWeight: 700, cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 8,
              }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: T.red }} />
                {t("lec.stop")}
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: `${T.red}14`, color: T.red, fontSize: 13 }}>{error}</div>
      )}

      {/* 文字起こし（逐次表示） */}
      {segments.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.txD, letterSpacing: 0.4, textTransform: "uppercase" }}>{t("lec.transcript")}</span>
            {hasText && (
              <button onClick={() => copy("transcript", transcriptText)} style={{
                fontSize: 12, color: copied === "transcript" ? T.green : T.accent, background: "none", border: "none", cursor: "pointer", fontWeight: 600,
              }}>{copied === "transcript" ? t("lec.copied") : t("lec.copy")}</button>
            )}
          </div>
          <div style={{
            padding: "12px 14px", borderRadius: 12, background: T.bg2, border: `1px solid ${T.bd}`,
            fontSize: 14, color: T.txH, lineHeight: 1.7, maxHeight: 260, overflowY: "auto", whiteSpace: "pre-wrap",
          }}>
            {transcriptText || <span style={{ color: T.txD }}>{t("lec.waiting")}</span>}
            {pendingCount > 0 && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 6, color: T.txD, fontSize: 12 }}>
                <span style={{ width: 12, height: 12, border: `2px solid ${T.bd}`, borderTop: `2px solid ${T.accent}`, borderRadius: "50%", animation: "spin 1s linear infinite", display: "inline-block" }} />
              </span>
            )}
          </div>
        </div>
      )}

      {/* 要約アクション */}
      {phase === "done" && (
        <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={summarize} disabled={!hasText} style={{
            flex: 1, minWidth: 160, padding: "12px 0", borderRadius: 10, border: "none", cursor: hasText ? "pointer" : "default",
            background: hasText ? T.accent : T.bg4, color: "#fff", fontSize: 14, fontWeight: 700,
          }}>{summary ? t("lec.resummarize") : t("lec.summarize")}</button>
          <button onClick={reset} style={{
            flex: "0 0 auto", padding: "12px 18px", borderRadius: 10, border: `1px solid ${T.bd}`,
            background: T.bg2, color: T.txD, fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>{t("lec.newRecording")}</button>
        </div>
      )}

      {phase === "summarizing" && (
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: T.txD, fontSize: 13, padding: "12px 0" }}>
          <span style={{ width: 16, height: 16, border: `2px solid ${T.bd}`, borderTop: `2px solid ${T.accent}`, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
          {t("lec.summarizing")}
        </div>
      )}

      {/* 要約結果 */}
      {summary && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.txD, letterSpacing: 0.4, textTransform: "uppercase" }}>{t("lec.summary")}</span>
            <button onClick={() => copy("summary", summary)} style={{
              fontSize: 12, color: copied === "summary" ? T.green : T.accent, background: "none", border: "none", cursor: "pointer", fontWeight: 600,
            }}>{copied === "summary" ? t("lec.copied") : t("lec.copy")}</button>
          </div>
          <div style={{
            padding: "14px 16px", borderRadius: 12, background: T.bg2, border: `1px solid ${T.bd}`,
            fontSize: 14, color: T.txH, lineHeight: 1.75, whiteSpace: "pre-wrap",
          }}>{summary}</div>
        </div>
      )}

      <style>{`@keyframes recPulse{0%,100%{opacity:1}50%{opacity:.3}}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
