import type { MetadataRoute } from "next"

// Явного allow не нужно — всё, что не в disallow, разрешено по умолчанию
// (стандартное поведение robots exclusion protocol).
const BASE_URL = "https://miridin.com"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: ["/login", "/register", "/onboarding", "/settings", "/messages", "/api/"],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  }
}
