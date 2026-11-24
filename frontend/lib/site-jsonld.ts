import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/page-meta"

/** Структурированные данные сайта для корневого layout. Описание то же, что в метатегах (SITE_DESCRIPTION).
 *  В script попадает только через safeJsonLd (охрана html-sinks.test.ts). */
export const SITE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: "LifestyleApplication",
  operatingSystem: "Web",
  inLanguage: "ru",
  publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
}
