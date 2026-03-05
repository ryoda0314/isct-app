import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // puppeteer etc. should not be bundled into client
  serverExternalPackages: ['puppeteer', 'otplib'],
};

export default withPWA(nextConfig);
