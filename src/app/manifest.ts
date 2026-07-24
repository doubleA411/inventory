import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Stackwise — Inventory & Billing",
    short_name: "Stackwise",
    description: "Inventory management, quotations and billing for any business.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f6f7f5",
    theme_color: "#16794c",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
