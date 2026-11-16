// Вкладки, которых больше нет, и куда вести старые ссылки на них (письма, история браузера, закладки).
const REMOVED_TABS: Record<string, string> = { relations: "detail" }

export function resolveEntityTab(raw: string | null | undefined): string {
  if (!raw) return "detail"
  return REMOVED_TABS[raw] ?? raw
}

/**
 * Тип связанной записи -> id соответствующей вкладки.
 * Переход включён только для типов, у которых есть отдельная вкладка на странице.
 */
const RELATED_TABS: Record<string, Record<string, string>> = {
  observation: { hypothesis: "hypotheses", prediction: "predictions", worldview: "worldview", task: "tasks" },
  hypothesis:  { observation: "observations", prediction: "predictions", worldview: "worldview", task: "tasks" },
  prediction:  { observation: "observations", worldview: "worldview", task: "tasks" },
  worldview:   { observation: "observations", prediction: "predictions", worldview: "worldview", task: "tasks" },
  question:    { observation: "observations", prediction: "predictions", worldview: "worldview", task: "tasks" },
  task:        { hypothesis: "hypotheses", observation: "observations", prediction: "predictions", worldview: "worldview" },
}

export function relatedTabsFor(entityType: string): Record<string, string> {
  return RELATED_TABS[entityType] ?? {}
}
