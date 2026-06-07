import { NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '../../../../lib/auth/session.js';
import { loadCredentials } from '../../../../lib/credentials.js';
import { UA, isAllowedUrl, getBrowser, ensurePortalData } from '../../../../lib/api/portal-session.js';

export const maxDuration = 60;

function htmlError(msg) {
  return new NextResponse(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<style>body{display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;font-family:system-ui,-apple-system,sans-serif;background:#0d1117;color:#c9d1d9}` +
    `.c{text-align:center;padding:24px}.err{font-size:15px;color:#f85149;margin:0 0 8px}.hint{font-size:12px;color:#8b949e}</style>` +
    `</head><body><div class="c"><p class="err">${msg}</p><p class="hint">戻るボタンで閉じてください</p></div></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
}

export async function GET(request) {
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  const session = verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let creds;
  try { creds = await loadCredentials(session.loginId); }
  catch { return NextResponse.json({ error: 'Credentials not found' }, { status: 400 }); }

  const { portalUserId, portalPassword, matrix } = creds;
  if (!portalUserId || !portalPassword || !matrix)
    return NextResponse.json({ error: 'Portal credentials not configured' }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');
  const warmup = searchParams.get('warmup');

  try {
    /* ── Warmup: background login + section extraction ── */
    if (warmup) {
      await ensurePortalData(session.loginId, creds);
      return NextResponse.json({ ok: true });
    }

    /* ── Sections list (no url param) ── */
    if (!targetUrl) {
      const data = await ensurePortalData(session.loginId, creds);
      return NextResponse.json({ sections: data.sections }, {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
      });
    }

    /* ── H5: SSRF protection — reject disallowed URLs ── */
    if (!isAllowedUrl(targetUrl)) {
      return htmlError('許可されていないURLです');
    }

    /* ── Full proxy: rewrite all URLs, return self-contained HTML ── */
    const data = await ensurePortalData(session.loginId, creds);
    let browser;
    try {
      browser = await getBrowser();
      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(30000);
      page.setDefaultTimeout(15000);
      await page.setUserAgent(UA);

      await page.setCookie(...data.cookies);

      await page.evaluateOnNewDocument(() => {
        window.open = function(url) { if (url) window.location.href = url; return window; };
      });

      await page.goto(targetUrl, { waitUntil: 'networkidle2' });
      await new Promise(r => setTimeout(r, 1500));

      const allPages = await browser.pages();
      let activePage = page;
      if (allPages.length > 1) {
        for (const p of allPages) {
          const u = p.url();
          if (u !== 'about:blank' && u !== page.url()) { activePage = p; break; }
        }
      }

      const finalUrl = activePage.url();
      const baseOrigin = new URL(finalUrl).origin;
      let html = await activePage.content();

      await browser.close();
      browser = null;

      // Rewrite all resource URLs to go through /api/portal/proxy?url=...
      const proxyBase = '/api/portal/proxy?url=';
      const rewriteUrl = (rawUrl) => {
        if (!rawUrl || rawUrl.startsWith('data:') || rawUrl.startsWith('javascript:') || rawUrl.startsWith('#') || rawUrl.startsWith('mailto:')) return rawUrl;
        try {
          const abs = new URL(rawUrl, finalUrl).href;
          return proxyBase + encodeURIComponent(abs);
        } catch { return rawUrl; }
      };

      // Rewrite src, href (CSS/JS/img), action, background attributes
      html = html.replace(/(<(?:link|script|img|input|source|video|audio|embed|iframe)\b[^>]*?\s)(src|href)=(["'])(.*?)\3/gi,
        (m, pre, attr, q, url) => `${pre}${attr}=${q}${rewriteUrl(url)}${q}`);
      html = html.replace(/(<link\b[^>]*?\s)(href)=(["'])(.*?)\3/gi,
        (m, pre, attr, q, url) => `${pre}${attr}=${q}${rewriteUrl(url)}${q}`);
      // Rewrite <a href> to go through page proxy (not resource proxy)
      html = html.replace(/(<a\b[^>]*?\s)(href)=(["'])((?!javascript:|#|mailto:).*?)\3/gi,
        (m, pre, attr, q, url) => {
          try {
            const abs = new URL(url, finalUrl).href;
            return `${pre}${attr}=${q}/api/portal/page?url=${encodeURIComponent(abs)}${q}`;
          } catch { return m; }
        });
      // Rewrite url() in <style> and style attributes
      html = html.replace(/url\((["']?)((?!data:).*?)\1\)/gi,
        (m, q, url) => `url(${q}${rewriteUrl(url)}${q})`);

      return new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          // Prevent scripts in proxied portal HTML from executing in app's origin context.
          // This blocks access to session cookies and app APIs from injected scripts.
          'Content-Security-Policy': "default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https:; font-src https: data:; frame-ancestors 'self'",
        },
      });
    } finally {
      if (browser) await browser.close();
    }
  } catch (err) {
    console.error('[Portal Page] Error:', err.message, err.stack);
    const failedStep = err.failedStep || 'unknown';
    const stepMessages = {
      connect:  'ポータルサイトに接続できませんでした。時間をおいて再度お試しください。',
      password: 'アカウントまたはパスワードが正しくありません。設定画面から再登録してください。',
      matrix:   'マトリクス認証に失敗しました。設定画面からマトリクスカードを再登録してください。',
      network:  'ページの読み込みがタイムアウトしました。通信環境を確認して再度お試しください。',
      unknown:  'ポータルへの接続中にエラーが発生しました。',
    };
    return htmlError(stepMessages[failedStep] || stepMessages.unknown);
  }
}
