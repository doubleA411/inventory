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

/** Hosts document images (logo, letterhead, signature) may load from. */
function storageHostnames(): Set<string> {
  const hosts = new Set<string>();
  for (const url of [process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL]) {
    try {
      if (url) hosts.add(new URL(url).hostname);
    } catch {
      // ignore malformed env
    }
  }
  return hosts;
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
    // The user's session cookie goes only to the app's own origin. Extra HTTP
    // headers would attach it to every request the page makes — including the
    // logo/letterhead fetched from storage. Anything that isn't the app or the
    // storage host is refused, so the renderer can't be pointed at internal
    // addresses (cloud metadata, localhost services) or file:// URLs.
    const appOrigin = new URL(baseUrl).origin;
    const storageHosts = storageHostnames();
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      let target: URL;
      try {
        target = new URL(request.url());
      } catch {
        return void request.abort();
      }
      if (target.origin === appOrigin) {
        const headers = { ...request.headers() };
        if (cookieHeader) headers.cookie = cookieHeader;
        return void request.continue({ headers });
      }
      if (target.protocol === "data:" || target.protocol === "blob:") {
        return void request.continue();
      }
      if (target.protocol === "https:" && storageHosts.has(target.hostname)) {
        return void request.continue();
      }
      return void request.abort();
    });
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
