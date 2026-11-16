import { WORLDVIEW_INFLUENCE } from "@/lib/worldview-influence"

/** Зеркало словаря бэкенда backend/app/services/link_mutations.py (дрейф ловит lib/link-vocab.test.ts).
 *  Модуль без React и без обращений к API, чтобы тесты, мокающие link-types, его не задевали. */
export const EVIDENCE_LINK_TYPES = ["подтверждает", "опровергает"]
export const NEUTRAL_LINK_TYPES = ["связано", "related"]
export const INFLUENCE_LINK_TYPES = WORLDVIEW_INFLUENCE.map(i => i.value)

export const isEvidenceLinkType = (linkType: string) => EVIDENCE_LINK_TYPES.includes(linkType)

/** Типы связи, допустимые для пары записей. С убеждением (любая сторона, в том числе убеждение с убеждением):
 *  четыре влияния и нейтральная. Один тип: только нейтральная. Остальное: доказательные и нейтральная. */
export function allowedLinkTypes(a: string, b: string): string[] {
  if (a === "worldview" || b === "worldview") return [...INFLUENCE_LINK_TYPES, ...NEUTRAL_LINK_TYPES]
  if (a === b) return NEUTRAL_LINK_TYPES
  return [...EVIDENCE_LINK_TYPES, ...NEUTRAL_LINK_TYPES]
}

/** Набор типов связи для пары: base фильтруется словарём. Для пары с убеждением влияние подставляется ПЕРЕД base
 *  (если в base своего влияния нет). Работает на любом списке с полем value; влияние (influenceOptions(t)) передаётся вызывающим. */
export function linkTypesFor<T extends { value: string }>(base: T[], a: string, b: string, influence: T[]): T[] {
  const withWorldview = a === "worldview" || b === "worldview"
  const hasInfluence = base.some(x => INFLUENCE_LINK_TYPES.includes(x.value))
  const pool = withWorldview && !hasInfluence ? [...influence, ...base] : base
  const ok = allowedLinkTypes(a, b)
  return pool.filter(x => ok.includes(x.value))
}

/** Скрыть ли результат поиска: тип связи доказательный, а найденная запись того же типа, что и сама.
 *  selfType не задан (поиск вне контекста записи): ничего не скрываем. */
export const sameTypeBlocked = (linkType: string, selfType: string | undefined, otherType: string) =>
  !!selfType && selfType === otherType && isEvidenceLinkType(linkType)

/** Остался ли в наборе только нейтральный тип (для подсказки «записи одного типа связываются только нейтрально»). */
export const isNeutralOnly = (types: { value: string }[]) =>
  types.length > 0 && types.every(x => NEUTRAL_LINK_TYPES.includes(x.value))
