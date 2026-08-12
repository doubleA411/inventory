import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Headless-Chromium PDF rendering (src/lib/pdf.ts) ships a native binary —
  // keep it out of the Next.js bundling/tracing pass and let Node require it directly.
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
};

export default nextConfig;
