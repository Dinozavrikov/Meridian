/**
 * Общий рекурсивный сборщик строк для useDynamicTranslate.
 *
 * Принимает произвольную комбинацию строк, массивов и объектов (в любой
 * вложенности) и вытаскивает из них все строковые значения одним плоским
 * списком — без необходимости вручную перечислять каждое поле каждого
 * объекта на каждой странице (как раньше делал локальный collectStrings()
 * в roadmap/docs/legal-document — три почти одинаковые копии).
 *
 * Использование:
 *   const dt = useDynamicTranslate(collectStrings(PAGE_STRINGS, SECTIONS, STATS))
 *
 * Не проходит внутрь пользовательских данных, если их не передать явно —
 * страница сама решает, что в неё попадает (см. useDynamicT.ts: не для
 * пользовательского контента).
 */
export function collectStrings(...values: unknown[]): string[] {
  const result: string[] = []

  function walk(v: unknown) {
    if (v == null) return
    if (typeof v === "string") {
      if (v) result.push(v)
      return
    }
    if (Array.isArray(v)) {
      for (const item of v) walk(item)
      return
    }
    if (typeof v === "object") {
      for (const val of Object.values(v as Record<string, unknown>)) walk(val)
      return
    }
    // числа, булевы и т.п. — не строки для перевода, пропускаем молча
  }

  for (const v of values) walk(v)
  return result
}
