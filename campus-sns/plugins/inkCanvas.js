// ネイティブ PencilKit 手書きキャンバス（InkPlugin）への JS ブリッジ。
// iPad のネイティブアプリでのみ利用可能。プラグイン未登録の旧ビルドや Web では
// inkAvailable() が false を返し、呼び出し側は従来の Web キャンバスにフォールバックする。
//
// 対応する Swift: docs/ios-native/InkPlugin.swift（jsName="Ink"）
import { isNative } from "../capacitor.js";

/** ネイティブの Ink プラグインが使えるか（iPad + プラグイン登録済み） */
export function inkAvailable() {
  try {
    return isNative() && !!window.Capacitor?.Plugins?.Ink?.open;
  } catch {
    return false;
  }
}

/**
 * ネイティブ PencilKit エディタを開く。ユーザーが「完了」を押すと解決。
 * @param {Object} opts
 * @param {Array<{bg:string,w:number,h:number}>} opts.pages
 *        各ページの背景PNG(base64, data:プレフィックス無し) と論理サイズ。
 *        背景が無いページ（白紙）は bg:"" でよい。
 * @param {string} [opts.drawing] 既存の PKDrawing(base64)。新規は省略。
 * @returns {Promise<{drawing:string, thumbnails:string[]}>}
 *        drawing: 更新後の PKDrawing(base64, 再編集用)
 *        thumbnails: ページ別の ink PNG(base64, 透明背景)。背景はWeb側で合成する。
 */
export async function openInk({ pages, drawing }) {
  if (!inkAvailable()) throw new Error("ink-unavailable");
  const { Ink } = window.Capacitor.Plugins;
  const res = await Ink.open({ pages: pages || [], drawing: drawing || undefined });
  return { drawing: res?.drawing || "", thumbnails: res?.thumbnails || [] };
}

// base64(プレフィックス無し) → dataURL（Web 側で背景合成や img 表示に使う）
export function pngB64ToDataUrl(b64) {
  return b64 ? `data:image/png;base64,${b64}` : "";
}
