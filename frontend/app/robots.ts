import type { MetadataRoute } from "next"

const BASE_URL = "https://miridin.com"

// Публичные чтения, из которых клиент рисует ленту и карточку записи. Без них краулер, исполняющий JS,
// видит пустой контейнер. Остальной /api/ закрыт: при споре правил побеждает самое длинное совпадение.
// Это не контроль доступа (эти адреса и так открыты гостю), только разрешение краулеру их читать.
const PUBLIC_API_READS = [
  "/api/v1/feed/groups/public",
  "/api/v1/feed/groups/entity/",
  "/api/v1/feed/public/",
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: PUBLIC_API_READS,
      disallow: ["/login", "/register", "/onboarding", "/settings", "/messages", "/api/"],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  }
}
