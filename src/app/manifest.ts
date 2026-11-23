import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "CampusCrew",
    short_name: "CampusCrew",
    description: "Local services and everyday campus errands.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7f6fb",
    theme_color: "#6659df",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
