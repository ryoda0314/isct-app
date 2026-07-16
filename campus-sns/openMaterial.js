import { isNative } from './capacitor.js';

/**
 * Open / download a Moodle material from the client.
 *
 * Why client-side fetch instead of just navigating to the URL:
 *  - The LMS rejects server-side fetches (403), so a proxy isn't an option;
 *    client-direct is the only working path.
 *  - Navigating a tab straight to the fileurl means a replaced/missing resource
 *    dumps Moodle's raw `filenotfound` JSON into the tab. By fetching first we
 *    can detect that error envelope (Moodle returns it as a JSON body, often
 *    with HTTP 200) and show a friendly message + refresh the stale list.
 *
 * Three environments, three open mechanisms:
 *  - Native (Capacitor/WKWebView): `window.open` returns null and blob: URLs
 *    can't be opened, so both the "tab" and "download" tricks are silent no-ops.
 *    The Moodle fileurl is self-authenticating (?token=...), so we hand it to
 *    the in-app system browser (@capacitor/browser → SafariVC / Chrome Custom
 *    Tab), which renders the PDF and offers native share / "save to Files".
 *  - Mobile web (iOS Safari/PWA): `a.download` is ignored and the click() fires
 *    after an async fetch (outside the user gesture), so download is a no-op —
 *    open the blob in a tab instead.
 *  - Desktop web: real download via an <a download> anchor.
 *
 * @param {object} m         material ({fileurl, filename, name, fileType})
 * @param {function} [onStale] called when the file is gone (to refetch fresh URLs)
 * @param {{download?: boolean, mob?: boolean}} [opts] download instead of opening
 *        in a tab; on mobile (mob) the download falls back to opening in a tab.
 */
export async function openMaterial(m, onStale, opts = {}) {
  const { download = false, mob = false } = opts;
  const url = m?.fileurl;
  if (!url) return;

  // Synchronous so the web path below can call window.open() while the click
  // gesture is still active (an await here would forfeit it on mobile web).
  const native = isNative();

  // External links (mod url) are real URLs — just open them.
  if (m.fileType === 'link') {
    if (native) await openInSystemBrowser(url);
    else window.open(url, '_blank', 'noopener');
    return;
  }

  // ── Native: validate (catch stale filenotfound), then open in system browser ──
  if (native) {
    try {
      const resp = await fetch(url);
      const ct = (resp.headers.get('content-type') || '').toLowerCase();
      // Sniff only the first chunk — the system browser (below) does the actual
      // download, so buffering the whole body here is pure waste and OOM-crashes
      // the WebView on large files (big PDFs / videos). We only need the
      // content-type + first bytes to detect Moodle's JSON filenotfound envelope.
      let head = new Uint8Array();
      const reader = resp.body?.getReader?.();
      if (reader) {
        try {
          const { value } = await reader.read();
          if (value) head = value;
        } finally {
          try { await reader.cancel(); } catch {}
        }
      }
      if (!resp.ok || ct.includes('application/json') || head[0] === 0x7b /* { */) {
        let code = null;
        try { code = JSON.parse(new TextDecoder().decode(head)).errorcode; } catch {}
        if (code) {
          onStale?.();
          alert('資料が見つかりませんでした。更新された可能性があります。一覧を更新したので、もう一度お試しください。');
          return;
        }
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      }
    } catch (e) {
      console.error('[openMaterial] native precheck', e?.message);
      alert('資料を開けませんでした。時間をおいて再度お試しください。');
      return;
    }
    await openInSystemBrowser(url);
    return;
  }

  // ── Web path ──
  const useDownload = download && !mob;

  // Open the tab synchronously inside the click gesture so popup blockers allow
  // it; we redirect it to the blob once the fetch resolves. (Skipped for the
  // desktop download path, which uses an <a download> anchor instead.)
  const w = useDownload ? null : window.open('', '_blank');

  try {
    const resp = await fetch(url);
    const ct = (resp.headers.get('content-type') || '').toLowerCase();
    const buf = await resp.arrayBuffer();

    if (!resp.ok || ct.includes('application/json') || new Uint8Array(buf)[0] === 0x7b /* { */) {
      let code = null;
      try { code = JSON.parse(new TextDecoder().decode(buf)).errorcode; } catch {}
      if (code) {
        if (w) w.close();
        onStale?.();
        alert('資料が見つかりませんでした。更新された可能性があります。一覧を更新したので、もう一度お試しください。');
        return;
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    }

    const blobUrl = URL.createObjectURL(new Blob([buf], { type: ct || 'application/octet-stream' }));
    if (useDownload) {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = m.filename || m.name || '資料';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else if (w) {
      w.location.href = blobUrl;
    } else {
      window.open(blobUrl, '_blank', 'noopener');
    }
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  } catch (e) {
    if (w) w.close();
    console.error('[openMaterial]', e?.message);
    alert('資料を開けませんでした。時間をおいて再度お試しください。');
  }
}

/**
 * Pop a material out into a SEPARATE window (desktop / Electron only).
 *
 * Used by the materials split view so several PDFs can be compared side-by-side
 * as real OS windows the user can tile, instead of cramped in-app panes.
 *
 * - Electron: the app shell (electron/main.js setWindowOpenHandler) opens any
 *   blob:https://sciencetokyo.app/… URL as a NEW BrowserWindow, and Chromium's
 *   built-in PDF viewer renders it. Electron has no popup blocker, so we fetch
 *   first then window.open(blobUrl). about:blank is denied by the shell handler,
 *   so we must NOT pre-open an empty window here.
 * - Desktop browser: popup blockers require the window to be opened inside the
 *   click gesture, so we open an empty window synchronously and redirect it to
 *   the blob once the fetch resolves.
 *
 * Fetching first also lets us catch Moodle's `filenotfound` JSON (served as a
 * 200 body) before it lands in the new window as raw JSON, and refresh the list.
 */
export async function openMaterialWindow(m, onStale) {
  const url = m?.fileurl;
  if (!url) return;
  // External links are real URLs — just open them.
  if (m.fileType === 'link') { window.open(url, '_blank', 'noopener'); return; }

  const isElectron = typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent);
  const features = 'width=900,height=1000';
  // Browser: reserve the window synchronously (popup blocker). Electron: don't —
  // it has no blocker and its shell handler denies about:blank.
  const w = isElectron ? null : window.open('', '_blank', features);

  try {
    const resp = await fetch(url);
    const ct = (resp.headers.get('content-type') || '').toLowerCase();
    const buf = await resp.arrayBuffer();
    if (!resp.ok || ct.includes('application/json') || new Uint8Array(buf)[0] === 0x7b /* { */) {
      let code = null;
      try { code = JSON.parse(new TextDecoder().decode(buf)).errorcode; } catch {}
      if (code) {
        if (w) w.close();
        onStale?.();
        alert('資料が見つかりませんでした。更新された可能性があります。一覧を更新したので、もう一度お試しください。');
        return;
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    }
    const blobUrl = URL.createObjectURL(new Blob([buf], { type: ct || 'application/pdf' }));
    if (w) w.location.href = blobUrl;
    else window.open(blobUrl, '_blank', features);
    // Give the new window ample time to load the blob before revoking.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5 * 60_000);
  } catch (e) {
    if (w) { try { w.close(); } catch {} }
    console.error('[openMaterialWindow]', e?.message);
    alert('資料を開けませんでした。時間をおいて再度お試しください。');
  }
}

/** Open a real http(s) URL in the in-app system browser (SafariVC / Custom Tab). */
export async function openInSystemBrowser(url) {
  try {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url });
  } catch (e) {
    console.error('[openMaterial] Browser.open failed', e?.message);
    // Last-ditch: in-WebView navigation still beats doing nothing.
    window.open(url, '_blank', 'noopener');
  }
}
