// Страницы, доступные гостю без входа — только чтение публичного слоя.
// Единый источник истины: используется и в AppShell (решение, редиректить
// ли на /login при отсутствии сессии), и в api.ts (решение, редиректить ли
// при 401 от второстепенного запроса — счётчики, "мои лабы" и т.п. — на
// странице, которая сама по себе гостю разрешена).
//
// Разделы сущностей (/observations и т.п.) тоже в списке — гость может
// открыть список и конкретную публичную запись; доступ к непубличным
// записям внутри раздела разруливается на уровне API (403) и глобальной
// модалки AuthGateModal (см. app/providers.tsx), а не превентивным
// редиректом здесь.
export const GUEST_ALLOWED = [
  "/feed", "/features", "/roadmap", "/docs", "/privacy", "/terms", "/support", "/labs",
  "/login", "/register",
  "/observations", "/hypotheses", "/predictions", "/worldview", "/questions",
  "/profile",
]

export function isGuestAllowedPath(pathname: string): boolean {
  return GUEST_ALLOWED.some(p => pathname === p || pathname.startsWith(p + "/"))
}
