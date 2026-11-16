import { isClosedPrediction } from "@/lib/prediction-status"

/** Id встроенных шкал, которые сейчас нельзя редактировать для данной сущности — не из-за прав
 *  (это isOwner), а потому что значение уже зафиксировано бизнес-правилом. Единая точка: новое
 *  правило блокировки добавляется здесь, а не в каждом месте, где рисуется слайдер (ScalesGrid на
 *  странице деталей и ScaleEditModal обязаны совпадать, иначе заблокированное на одной поверхности
 *  останется редактируемым на другой). Ключ по (entityType, id) — "confidence" есть и у worldview,
 *  и у prediction, это разные шкалы. */
export function getLockedScaleIds(entityType: string, values: Record<string, any>): Set<string> {
  if (entityType === "prediction" && isClosedPrediction(values.status)) {
    return new Set(["confidence"])
  }
  return new Set()
}
