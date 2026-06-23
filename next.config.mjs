import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    importScripts: ['/push-handler.js'],
    runtimeCaching: [
      {
        // 全APIはユーザー固有データを返すため、SWキャッシュを一切使わない
        urlPattern: /\/api\//,
        handler: "NetworkOnly",
      },
    ],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // puppeteer etc. should not be bundled into client
  serverExternalPackages: ['puppeteer', 'puppeteer-core', '@sparticuz/chromium', 'otplib'],
  // 開発時の「N」インジケーターを無効化（/features 実演iframe内でアプリ右上に被るため）。本番では元々非表示。
  devIndicators: false,
};

export default withPWA(nextConfig);
