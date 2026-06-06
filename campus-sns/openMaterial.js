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
 * @param {object} m         material ({fileurl, filename, name, fileType})
 * @param {function} [onStale] called when the file is gone (to refetch fresh URLs)
 * @param {{download?: boolean}} [opts] download instead of opening in a tab
 */
export async function openMaterial(m, onStale, opts = {}) {
  const { download = false } = opts;
  const url = m?.fileurl;
  if (!url) return;

  // External links (mod url) are real URLs — just open them.
  if (m.fileType === 'link') { window.open(url, '_blank', 'noopener'); return; }

  // Open the tab synchronously inside the click gesture so popup blockers allow
  // it; we redirect it to the blob once the fetch resolves. (Skipped for downloads.)
  const w = download ? null : window.open('', '_blank');

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
    if (download) {
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
