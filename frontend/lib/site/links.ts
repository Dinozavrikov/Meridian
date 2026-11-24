// Ссылки шапки публичного сайта: единый список. Тексты берутся из strings.ts (ключи подвала и меню приложения).
// Каждая ссылка обязана вести на настоящую страницу, быть открытой гостю и отдавать текст в серверном HTML (проверяет site-links.test.ts).
export const SITE_LINKS = [
  { href: "/features", labelKey: "footer.link.features" },
  { href: "/docs", labelKey: "footer.link.docs" },
  { href: "/roadmap", labelKey: "footer.link.roadmap" },
  { href: "/feed", labelKey: "nav.community.feed" },
] as const
