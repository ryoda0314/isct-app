// 全ルートを動的レンダリングにする。CSP は middleware がリクエスト毎に nonce を発行するため、
// 静的生成された HTML（nonce 無し）だと 'strict-dynamic' で全スクリプトがブロックされてしまう。
// 動的レンダリングなら Next.js が request ヘッダの CSP から nonce を読み、各 <script> に付与する。
export const dynamic = 'force-dynamic';

export const metadata = {
  title: "ScienceTokyo App",
  description: "東京科学大学キャンパスSNS",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ScienceTokyo",
  },
};

export const viewport = {
  themeColor: "#28c868",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <link rel="icon" href="/icons/icon-96x96.png" sizes="96x96" type="image/png" />
        <link rel="icon" href="/icons/icon-192x192.png" sizes="192x192" type="image/png" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        {/* sitelen pona (toki pona の表語文字)。lang=tp + 設定オン時のみ body に .sitelen-pona が付く。
            otf は font-family が実際に適用されるまで遅延ダウンロードされる(font-src 'self' で許可済み)。
            インライン font-family(monospace 等)は class より優先されるためコード/ID 表示は保持。
            フォント: nasin-nanpa (jan Itan, MIT) — public/fonts/nasin-nanpa-LICENSE.txt */}
        <style dangerouslySetInnerHTML={{ __html: `
@font-face{font-family:'nasin-nanpa';src:url('/fonts/nasin-nanpa.otf') format('opentype');font-display:swap;}
.sitelen-pona,.sitelen-pona button,.sitelen-pona input,.sitelen-pona textarea,.sitelen-pona select{font-family:'nasin-nanpa','Inter',-apple-system,sans-serif;}
` }} />
      </head>
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
