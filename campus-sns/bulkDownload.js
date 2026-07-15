import { isNative } from './capacitor.js';

/**
 * 授業資料の一括ダウンロード (ZIP)。
 *
 * - fileurl は token 付きで自己認証済み (material-transform.js が付与)。
 *   LMS はサーバーサイド fetch を 403 で拒否するため、必ずクライアントから直接
 *   fetch する (openMaterial.js と同じ理由)。
 * - Moodle は差し替え/削除済みファイルを HTTP 200 の JSON (filenotfound) で返す
 *   ことがあるので、1 ファイルずつエンベロープを検知してスキップする。
 * - ZIP は無圧縮 (STORE)。教材の大半は PDF/画像/pptx で再圧縮が効かず、
 *   速度とメモリを優先。
 * - 保存は PdfToolsView と同じ「OS に委ねる」3 段構え:
 *   ① Web Share API (iOS Safari/PWA/アプリ → 「ファイルに保存」)
 *   ② Capacitor ネイティブ: Filesystem 書き出し → 共有シート
 *   ③ Web: <a download> (デスクトップ) / 新規タブ (モバイル)
 */

const JSZIP_CDN = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
let jszipLoading = null;
function loadJSZip() {
  if (window.JSZip) { console.log('[bulkDl] JSZip already present'); return Promise.resolve(window.JSZip); }
  if (jszipLoading) return jszipLoading;
  console.log('[bulkDl] loading JSZip from', JSZIP_CDN);
  jszipLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = JSZIP_CDN;
    s.onload = () => { console.log('[bulkDl] JSZip onload, window.JSZip=', !!window.JSZip); window.JSZip ? resolve(window.JSZip) : reject(new Error('JSZip not found')); };
    s.onerror = () => { jszipLoading = null; console.error('[bulkDl] JSZip load failed (CSP/network?)', JSZIP_CDN); reject(new Error(`load failed: ${JSZIP_CDN}`)); };
    document.head.appendChild(s);
    // CDN スクリプトが CSP でブロックされると onerror が飛ばず永久ハングすることがある
    setTimeout(() => { if (!window.JSZip) { jszipLoading = null; reject(new Error('JSZip load timeout (15s) — CSP/ネットワークを確認')); } }, 15000);
  });
  return jszipLoading;
}

/* ZIP 内エントリ名/ファイル名に使えない文字を除去 */
const sanitize = (s) => String(s || '').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120);

function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

/** blob を全環境 (iOS/Android ネイティブ・モバイル Web・デスクトップ) で保存/共有する。 */
export async function saveBlob(blob, fname, { mob = false, mime } = {}) {
  const type = mime || blob.type || 'application/octet-stream';
  const file = (() => { try { return new File([blob], fname, { type }); } catch { return null; } })();

  // ② ネイティブ: ファイル書き出し → 共有シート (Web Share より先に判定。
  //    ネイティブ WebView の navigator.share は不安定なため使わない)
  if (isNative()) {
    console.log('[bulkDl] save via native Filesystem+Share');
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const base64 = await blobToBase64(blob);
    const { uri } = await Filesystem.writeFile({ path: fname, data: base64, directory: Directory.Cache });
    try {
      await Share.share({ title: fname, text: fname, url: uri });
    } catch (e) {
      // 共有シートを閉じただけならキャンセル扱い
      if (!/cancel/i.test(String(e?.message || e || ''))) throw e;
    }
    return;
  }

  // ① デスクトップ Web: <a download> で確実にダウンロード
  if (!mob) {
    console.log('[bulkDl] save via <a download>');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }

  // ③ モバイル Web: OS の共有シート (Web Share API)。iOS Safari/PWA で
  //    「ファイルに保存」に相当。gesture 外だと拒否されるので、失敗時は
  //    <a download> にフォールバック (Android は DL、iOS はインライン表示)。
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      console.log('[bulkDl] save via Web Share');
      await navigator.share({ files: [file], title: fname });
      return;
    } catch (e) {
      const m = String(e?.name || e?.message || '');
      if (/Abort/i.test(m)) return; // ユーザーがキャンセル
      console.warn('[bulkDl] web share failed, falling back to <a download>', m);
    }
  }
  console.log('[bulkDl] save via <a download> (mobile fallback)');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fname;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * 選択された教材を ZIP にまとめて保存する。
 *
 * @param {{items: Array<{m: object, section: string}>, zipName: string,
 *          mob?: boolean, onProgress?: function}} p
 *        items: {m: material, section: フォルダ名にする授業回名 ('' でルート直下)}
 *        onProgress: {phase:'fetch',done,total} → {phase:'zip',pct}
 * @returns {{saved: boolean, failed: string[], stale: boolean}}
 *          saved: ZIP を保存できたか / failed: 取得失敗ファイル名 /
 *          stale: filenotfound を検知した (呼び出し側で一覧 refresh する)
 */
export async function bulkDownloadMaterials({ items, zipName, mob = false, onProgress }) {
  console.log('[bulkDl] bulkDownloadMaterials start', { count: items.length, zipName, mob });
  const JSZip = await loadJSZip();
  const zip = new JSZip();

  // fetch 完了順に依らず ZIP 内パスが安定するよう、重複解決込みで先に確定する
  const used = new Set();
  const jobs = items.map(({ m, section }) => {
    const dir = sanitize(section);
    const base = sanitize(m.filename || m.name || 'file') || 'file';
    let path = dir ? `${dir}/${base}` : base;
    if (used.has(path.toLowerCase())) {
      const dot = base.lastIndexOf('.');
      const stem = dot > 0 ? base.slice(0, dot) : base;
      const ext = dot > 0 ? base.slice(dot) : '';
      for (let n = 2; ; n++) {
        const cand = dir ? `${dir}/${stem} (${n})${ext}` : `${stem} (${n})${ext}`;
        if (!used.has(cand.toLowerCase())) { path = cand; break; }
      }
    }
    used.add(path.toLowerCase());
    return { m, path };
  });

  const total = jobs.length;
  let done = 0;
  let next = 0;
  let stale = false;
  const failed = [];

  async function worker() {
    while (next < jobs.length) {
      const { m, path } = jobs[next++];
      try {
        const resp = await fetch(m.fileurl);
        const ct = (resp.headers.get('content-type') || '').toLowerCase();
        const buf = await resp.arrayBuffer();
        let bad = null;
        if (!resp.ok || ct.includes('application/json') || new Uint8Array(buf)[0] === 0x7b /* { */) {
          let code = null;
          try { code = JSON.parse(new TextDecoder().decode(buf)).errorcode; } catch {}
          if (code) { stale = true; bad = code; }
          else if (!resp.ok) bad = `HTTP ${resp.status}`;
          // code 無し & resp.ok → たまたま '{' で始まる正規ファイルなので通す
        }
        if (bad) throw new Error(bad);
        zip.file(path, buf, m.timemodified ? { date: new Date(m.timemodified * 1000) } : undefined);
      } catch (e) {
        console.warn('[bulkDl] skip', path, e?.message);
        failed.push(m.filename || m.name || '?');
      }
      done++;
      onProgress?.({ phase: 'fetch', done, total });
    }
  }
  // LMS への同時接続は 3 本まで
  await Promise.all(Array.from({ length: Math.min(3, jobs.length) }, () => worker()));
  console.log('[bulkDl] fetch done', { ok: total - failed.length, failed: failed.length, stale });

  if (failed.length >= total) return { saved: false, failed, stale };

  onProgress?.({ phase: 'zip', pct: 0 });
  const blob = await zip.generateAsync(
    { type: 'blob', compression: 'STORE' },
    (meta) => onProgress?.({ phase: 'zip', pct: meta.percent }),
  );
  console.log('[bulkDl] zip generated', { bytes: blob.size });
  await saveBlob(blob, zipName, { mob, mime: 'application/zip' });
  console.log('[bulkDl] saveBlob returned');
  return { saved: true, failed, stale };
}
