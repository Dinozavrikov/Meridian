// Единый источник правды для 8 фиксированных, не кастомизируемых лабой
// стадий пути "домашнее исследование -> проверенный продукт" (backend:
// STAGE_VALUES в app/models/entities.py, единый Python-enum, не таблица).
// Тот же key-map паттерн, что ROLE_ORDER/roleLabel в lab-roles.ts —
// закрытый список значений, не открытый пользовательский текст, поэтому
// не через useDynamicT, а через явные ключи в strings.ts.
export const STAGE_VALUES = [
  "question", "research", "experiments", "prototype",
  "real_world_testing", "evidence", "proven_product", "market_handoff",
] as const

export type StageValue = typeof STAGE_VALUES[number]

export function stageLabel(t: (key: string) => string, stage: string): string {
  // useT() возвращает undefined для ru-локали, если ключа нет в STRINGS
  // (не сам ключ — см. lib/i18n/useT.ts), поэтому fallback через ?? на
  // сырое значение stage, а не сравнение с ключом.
  return t(`stagePanel.stage.${stage}`) ?? stage
}
