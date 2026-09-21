import type { NextConfig } from "next";

/**
 * Baseline response headers.
 *
 * Deliberately no `script-src`/`style-src`: Next.js injects inline bootstrap
 * scripts and Tailwind emits inline styles, so locking those down needs
 * per-request nonces and a middleware to mint them — a change that breaks the
 * app quietly (hydration stops, pages render dead) if it's even slightly
 * wrong. The directives below are the ones that cost nothing to get right:
 * they stop the app being framed for clickjacking, stop `<base>` and plugin
 * content being injected, and stop a form being retargeted at another origin —
 * which matters here because server actions are ordinary form posts.
 */
const CSP = [
  "default-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  // Logos/letterheads are served from Supabase Storage, and pdf-to-image
  // rasterises through blob: and data: URLs.
  "img-src 'self' data: blob: https:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "connect-src 'self' https:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    // HSTS is safe to send unconditionally here — the app is only ever served
    // over HTTPS in production, and browsers ignore the header on plain HTTP
    // (so local dev on localhost is unaffected).
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  // Headless-Chromium PDF rendering (src/lib/pdf.ts) ships a native binary —
  // keep it out of the Next.js bundling/tracing pass and let Node require it directly.
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
