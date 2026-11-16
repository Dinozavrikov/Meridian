/**
 * Единый источник правды для маршрутизации по сущностям.
 * Любой виджет (заметки на полях, лента, поиск и т.п.), которому нужно
 * сослаться на конкретную сущность, берёт маршрут отсюда — а не хардкодит
 * свою пару "тип → путь".
 */
export type EntityType =
  | "observation"
  | "hypothesis"
  | "prediction"
  | "question"
  | "task"
  | "worldview"

export const ENTITY_ROUTES: Record<EntityType, string> = {
  observation: "/observations",
  hypothesis:  "/hypotheses",
  prediction:  "/predictions",
  question:    "/questions",
  task:        "/tasks",
  worldview:   "/worldview",
}

/** Строит href на detail-таб сущности, совместимый с useEntityUrlSync (?id=&tab=detail). */
export function entityHref(type: EntityType, id: number | string, extra?: Record<string, string>): string {
  const params = new URLSearchParams({ id: String(id), tab: "detail", ...extra })
  return `${ENTITY_ROUTES[type]}?${params.toString()}`
}

export function isEntityType(type: string): type is EntityType {
  return Object.hasOwn(ENTITY_ROUTES, type)
}

/** Для мест, где тип приходит строкой с сервера: неизвестный тип ведёт в корень, а не ломает адрес. */
export function safeEntityHref(type: string, id: number | string): string {
  return isEntityType(type) ? entityHref(type, id) : "/"
}

const ENTITY_HREF = /^meridian:\/\/([a-z]+)\/(\d+)$/

/** Внутренняя ссылка из текста (meridian://тип/id). Тип не проверяем: неизвестный покажет «запись недоступна». */
export function parseEntityHref(href: string): { type: string; id: number } | null {
  const m = ENTITY_HREF.exec(href.trim())
  return m ? { type: m[1], id: Number(m[2]) } : null
}
