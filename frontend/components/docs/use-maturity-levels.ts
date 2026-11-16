import { useMemo } from "react"
import { DEFAULT_SCALES } from "@/lib/scales"
import { useDynamicTranslate } from "@/lib/i18n/useDynamicT"
import { collectStrings } from "@/lib/i18n/collect-strings"

/** Подписи уровней зрелости из единого источника (шкала «Зрелость» гипотезы), с переводом. */
export function useMaturityLevels() {
  const levels = DEFAULT_SCALES.find(s => s.id === "maturity" && s.entity_type === "hypothesis")?.levels ?? []
  const dt = useDynamicTranslate(collectStrings(levels.flatMap(l => [l.label, l.desc])))
  return useMemo(() => ({
    levels,
    label: (v: number) => dt(levels.find(l => l.value === v)?.label ?? ""),
    desc: (v: number) => dt(levels.find(l => l.value === v)?.desc ?? ""),
  }), [levels, dt])
}
