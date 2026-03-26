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
        // 成績APIはPuppeteerで17秒+かかるため、SWキャッシュをバイパス
        urlPattern: /\/api\/data\/grades/,
        handler: "NetworkOnly",
      },
      {
        // ポータルAPIはHTML/JSONを返すためSWキャッシュをバイパス
        urlPattern: /\/api\/portal\//,
        handler: "NetworkOnly",
      },
    ],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // puppeteer etc. should not be bundled into client
  serverExternalPackages: ['puppeteer', 'puppeteer-core', '@sparticuz/chromium', 'otplib'],
};

export default withPWA(nextConfig);
