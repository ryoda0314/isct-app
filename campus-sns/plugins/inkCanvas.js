// ネイティブ PencilKit 手書きキャンバス（InkPlugin / オーバーレイ方式）への JS ブリッジ。
// Web の「キャンバス領域(rect)」にだけネイティブ PKCanvasView を重ねる。サイドバーや
// ツールバーは Web のまま表示される。ペンで描画、指でスクロール/ズーム（ネイティブ）。
// プラグイン未登録の旧ビルドや Web では inkAvailable()=false → 従来の Web キャンバスへ。
//
// 対応 Swift: docs/ios-native/InkPlugin.swift（jsName="Ink"）
import { isNative } from "../capacitor.js";

export function inkAvailable() {
  try { return isNative() && !!window.Capacitor?.Plugins?.Ink?.show; } catch { return false; }
}

// rect: ビューポート基準の CSS px（= WKWebView の point 座標に一致）
export async function showInk({ rect, pages, drawing }) {
  if (!inkAvailable()) throw new Error("ink-unavailable");
  return window.Capacitor.Plugins.Ink.show({ rect, pages: pages || [], drawing: drawing || undefined });
}

export async function setInkRect(rect) {
  try { await window.Capacitor.Plugins.Ink.setRect({ rect }); } catch {}
}

// 独自ツールバーからネイティブのペンを操作
export async function setInkTool({ type, color, width, mode }) {
  try { await window.Capacitor.Plugins.Ink.setTool({ type, color: color || "#1c1c1e", width: width || 6, mode: mode || "stroke" }); } catch {}
}
export async function inkUndo() { try { await window.Capacitor.Plugins.Ink.undo(); } catch {} }
export async function inkRedo() { try { await window.Capacitor.Plugins.Ink.redo(); } catch {} }
// 図形補助（直線/円/四角に整える）のON/OFF
export async function setInkShapeAssist(on) { try { await window.Capacitor.Plugins.Ink.setShapeAssist({ enabled: !!on }); } catch {} }

// Apple Pencil ダブルタップ。cb には {action} が渡る。戻り値の handle.remove() で解除
export async function onPencilDoubleTap(cb) {
  try { return await window.Capacitor?.Plugins?.Ink?.addListener?.("pencilDoubleTap", cb); } catch { return null; }
}

// 編集中に現在の描画を取得（オーバーレイは閉じない）→ ノート内からの書き出し用
export async function inkSnapshot() {
  try { const r = await window.Capacitor.Plugins.Ink.snapshot(); return { drawing: r?.drawing || "", thumbnails: r?.thumbnails || [] }; }
  catch { return { drawing: "", thumbnails: [] }; }
}

// 保存して撤去 → { drawing:<base64 PKDrawing>, thumbnails:[<base64 PNG ink>/ページ] }
export async function hideInk() {
  if (!inkAvailable()) return { drawing: "", thumbnails: [] };
  try {
    const res = await window.Capacitor.Plugins.Ink.hide();
    return { drawing: res?.drawing || "", thumbnails: res?.thumbnails || [] };
  } catch { return { drawing: "", thumbnails: [] }; }
}

// DOM 要素のビューポート矩形を rect(CSS px, 整数) で返す
export function rectOfEl(el) {
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
}
