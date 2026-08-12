import "server-only";
import type { Browser } from "puppeteer-core";

// Production/Vercel: puppeteer-core + the serverless-optimized Chromium binary
// (no bundled browser, keeps the function small). Local dev: the full
// `puppeteer` package (devDependency only), which downloads a real Chromium
// for the host OS — @sparticuz/chromium's binary is Linux-only and won't run
// on a Mac/Windows dev machine.
const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

async function launchBrowser(): Promise<Browser> {
  if (isServerless) {
    const [{ default: puppeteer }, { default: chromium }] = await Promise.all([
      import("puppeteer-core"),
      import("@sparticuz/chromium"),
    ]);
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  // Local dev — the plain `puppeteer` package manages its own Chromium download.
  const { default: puppeteer } = await import("puppeteer");
  return puppeteer.launch({ headless: true }) as unknown as Promise<Browser>;
}

/** "INV/26-27/0001" → "INV-26-27-0001.pdf" — safe for both filesystem keys and Content-Disposition. */
export function docFilename(number: string): string {
  return `${number.replace(/[^\w-]+/g, "-")}.pdf`;
}

/**
 * Renders an internal, authenticated app page to a PDF buffer by navigating
 * a headless browser to it — reuses the exact print page (and its print
 * CSS) that "Print / Save as PDF" already uses, so there's one source of
 * truth for the document layout instead of a second PDF-specific renderer.
 *
 * `baseUrl` must be the calling request's own origin (e.g. `req.nextUrl.origin`)
 * rather than an env-derived guess — dev servers routinely run on a fallback
 * port when 3000 is taken, and a hardcoded/guessed origin would silently point
 * the headless browser at the wrong (or no) server.
 */
export async function renderPagePdf(
  pathname: string,
  baseUrl: string,
  cookieHeader: string,
): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    if (cookieHeader) {
      await page.setExtraHTTPHeaders({ cookie: cookieHeader });
    }
    const url = new URL(pathname, baseUrl).toString();
    const res = await page.goto(url, { waitUntil: "networkidle0" });
    if (!res || !res.ok()) {
      throw new Error(`Could not render ${pathname} (status ${res?.status()})`);
    }
    await page.emulateMediaType("print");
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
