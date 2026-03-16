export const metadata = {
  title: "ScienceTokyo App",
  description: "東京科学大学キャンパスSNS",
  manifest: "/manifest.json",
  themeColor: "#6375f0",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ScienceTokyo",
  },
};

export const viewport = {
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
      </head>
      <body style={{ margin: 0, background: "#1a1a1f" }}>{children}</body>
    </html>
  );
}
