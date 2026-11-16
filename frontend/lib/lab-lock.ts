// frontend/lib/lab-lock.ts
//
// Принудительная привязка формы к лаборатории (создание из вкладки лаборатории): форма не даёт
// выбрать видимость и всегда шлёт lab_id этой лаборатории. Присланное visibility на бэкенде ИГНОРИРУЕТСЯ:
// итоговую видимость выводит resolve_lab_attachment (backend/app/core/lab_access.py) из публичности
// лаборатории — публичная лаба даёт public, иначе lab. Поэтому форма не предлагает выбор, а показывает,
// что получится (LabLockedNote + use-lab-entity-visibility.ts).
export const isLabLocked = (id?: number | null): id is number => id != null

/** Зеркало backend/app/core/lab_access.py::visibility_from_lab. */
export const visibilityFromLab = (isPublic: boolean): "public" | "lab" => (isPublic ? "public" : "lab")

export function initialVisibilityFields(initial: any, lockedLabId?: number | null): { visibility: string; lab_id: number | null } {
  if (isLabLocked(lockedLabId)) return { visibility: "lab", lab_id: lockedLabId }
  return { visibility: initial?.visibility || "private", lab_id: initial?.lab_id ?? null }
}

/** Поверх любого состояния формы: при блокировке всегда lab_id этой лаборатории (видимость на бэкенде выводится из неё). */
export function applyLabLock<T extends Record<string, any>>(data: T, lockedLabId?: number | null): T {
  return isLabLocked(lockedLabId) ? { ...data, visibility: "lab", lab_id: lockedLabId } : data
}
