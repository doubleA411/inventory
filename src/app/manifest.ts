import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "StockKitchen — Inventory",
    short_name: "StockKitchen",
    description: "Simple stock & inventory management for catering.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f6f7f5",
    theme_color: "#16794c",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
