// frontend/lib/entity-delete-path.ts
//
// Адрес DELETE записи по типу, как в graph/links (единственное число) -> путь API (множественное).
// Отдельный модуль: многие тесты мокают link-types и graph-visuals целиком, новые экспорты кладём вне них.
const PATHS: Record<string, string> = {
  observation: "observations", hypothesis: "hypotheses", prediction: "predictions",
  worldview: "worldview", question: "questions", task: "tasks",
}

export function entityDeleteUrl(entityType: string, id: number): string {
  const path = PATHS[entityType]
  if (!path) throw new Error(`entityDeleteUrl: неизвестный тип ${entityType}`)
  return `/api/v1/${path}/${id}`
}
