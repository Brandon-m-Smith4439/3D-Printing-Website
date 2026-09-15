import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://example.com";
  return ["", "/gallery", "/queue", "/custom-request", "/privacy"].map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date(),
    changeFrequency: path === "/gallery" ? "weekly" : "monthly",
    priority: path === "" ? 1 : path === "/gallery" ? 0.8 : 0.7,
  }));
}
