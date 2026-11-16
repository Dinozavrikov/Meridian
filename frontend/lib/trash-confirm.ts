/**
 * Единый текст подтверждения перед перемещением записи в корзину — с учётом
 * того, что реально пропадёт для конкретной записи (лаба/публичность), а не
 * общая формулировка для всех случаев сразу. Один источник, а не по копии
 * в каждой из 6 страниц-списков.
 */
import type { EntityType } from "@/lib/entity-routes"

type Trashable = { visibility: string; lab_id?: number | null }

export function buildTrashConfirmText(
  t: (key: string, vars?: Record<string, string | number>) => string,
  entityType: EntityType,
  entity: Trashable,
): string {
  const key = CONFIRM_KEY[entityType]
  const text = t(key)
  const suffix =
    entity.visibility === "public" ? t("trash.confirmSuffix.public") :
    entity.lab_id ? t("trash.confirmSuffix.lab") :
    ""
  return suffix ? `${text} ${suffix}` : text
}

// Ключи словаря не следуют единому правилу склонения (hypotheses, но worldview
// в единственном числе) — явная карта, а не строковая генерация ключа.
const CONFIRM_KEY: Record<EntityType, string> = {
  observation: "observations.deleteConfirm",
  hypothesis:  "hypotheses.deleteConfirm",
  prediction:  "predictions.deleteConfirm",
  worldview:   "worldview.deleteConfirm",
  question:    "questions.deleteConfirm",
  task:        "tasks.deleteConfirm",
}
