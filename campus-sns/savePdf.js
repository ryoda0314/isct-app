import { isNative } from "./capacitor.js";

/* blob → base64 (data: プレフィックス無し。Filesystem.writeFile はこの形式を要求) */
function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] || "");
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

/**
 * 端末内で作った PDF(Blob) を保存/共有する (openMaterial.js と同じ「OSに委ねる」考え方)。
 * PdfToolsView の結合保存と、教材ビューアの「パスワードを外して保存」で共用。
 * @returns {Promise<"ok"|"cancel"|"needsUpdate">} needsUpdate = 旧ネイティブビルドで保存プラグインが無い
 */
export async function savePdfBlob(blob, fname, { mob = false } = {}) {
  const file = (() => { try { return new File([blob], fname, { type: "application/pdf" }); } catch { return null; } })();

  // ① OSの共有シート(Web Share API)。iOSのアプリ/Safariで動作し、これが
  //    教材DLの「Safariで開く/ファイルに保存」に相当。プラグイン・再ビルド不要。
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fname });
      return "ok";
    } catch (e) {
      const m = String(e?.name || e?.message || "");
      if (/Abort/i.test(m)) return "cancel"; // ユーザーがキャンセル
      console.warn("[savePdf] web share failed", m); // それ以外は下のフォールバックへ
    }
  }

  // ② ネイティブ(Capacitor): ファイル書き出し→共有シート (要・最新ネイティブビルド)
  if (isNative()) {
    try {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const { Share } = await import("@capacitor/share");
      const base64 = await blobToBase64(blob);
      const { uri } = await Filesystem.writeFile({ path: fname, data: base64, directory: Directory.Cache });
      await Share.share({ title: fname, text: fname, url: uri });
      return "ok";
    } catch (e) {
      // ユーザーが共有シートを閉じた場合もここに来るので、キャンセルは無視
      const msg = String(e?.message || e || "");
      if (/cancel/i.test(msg)) return "cancel";
      console.error("[savePdf] native save", msg);
      // 旧ビルド(プラグイン未実装)向けの保険: WebView内でPDFを開いて閲覧/共有させる
      try { window.open(URL.createObjectURL(blob), "_blank"); } catch {}
      return "needsUpdate";
    }
  }

  // ③ Web
  const url = URL.createObjectURL(blob);
  const isMob = mob || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (isMob) {
    // モバイルブラウザは a.download を無視するので新規タブで開く
    window.open(url, "_blank", "noopener");
  } else {
    const a = document.createElement("a");
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return "ok";
}
