import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Noto_Sans_Tamil } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Geist has no Tamil glyphs — this fills the gap so Tamil text (names,
// addresses, menu items) renders correctly everywhere, print included,
// instead of falling back to whatever font (if any) the OS happens to have.
const notoSansTamil = Noto_Sans_Tamil({
  variable: "--font-tamil",
  subsets: ["tamil"],
});

export const metadata: Metadata = {
  title: "Stackwise — Inventory & Billing",
  description: "Inventory management, quotations and billing for any business.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Stackwise", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#16794c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${notoSansTamil.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
