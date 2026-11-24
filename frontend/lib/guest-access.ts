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
  "/", "/feed", "/features", "/roadmap", "/docs", "/privacy", "/terms", "/support", "/labs",
  "/login", "/register",
  "/observations", "/hypotheses", "/predictions", "/worldview", "/questions",
  "/profile",
]

/** Публичные страницы, чей текст должен быть в серверном HTML: AppShell рисует их до ответа auth/me. */
export const PRERENDERED_PATHS = ["/", "/feed", "/support", "/features", "/roadmap", "/docs", "/privacy", "/terms"]

/** Путь входит в список сам или как вложенный. Корень "/" только сам: иначе "/" + "/" давало бы префикс "//". */
const covers = (list: readonly string[], pathname: string) =>
  list.some(p => pathname === p || (p !== "/" && pathname.startsWith(p + "/")))

export function isPrerenderedPath(pathname: string | null): boolean {
  return !!pathname && covers(PRERENDERED_PATHS, pathname)
}

export function isGuestAllowedPath(pathname: string): boolean {
  return covers(GUEST_ALLOWED, pathname)
}
