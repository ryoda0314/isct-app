/** @type {import('next').NextConfig} */
const nextConfig = {
  // puppeteer etc. should not be bundled into client
  serverExternalPackages: ['puppeteer', 'otplib'],
};

export default nextConfig;
