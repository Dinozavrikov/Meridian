import { describe, expect, it } from "vitest"
import { searchDocs, type DocsEntry } from "@/lib/docs-search"

const E: DocsEntry[] = [
  { id: "maturity", kind: "section", title: "Зрелость гипотезы", body: "Уровень складывается из закрытых прогнозов" },
  { id: "faq-slow", kind: "faq", title: "Почему один прогноз почти не двигает зрелость?", body: "Ожидаемый исход слабое доказательство" },
  { id: "trash", kind: "faq", title: "Что происходит при удалении записи?", body: "Запись уходит в корзину, всё можно вернуть" },
]

describe("searchDocs", () => {
  it("игнорирует регистр и различие ё/е", () => {
    expect(searchDocs(E, "ВСЕ МОЖНО")[0]?.id).toBe("trash")
    expect(searchDocs(E, "всё")[0]?.id).toBe("trash")
  })
  it("находит по основе слова", () => {
    expect(searchDocs(E, "прогнозов").map(e => e.id)).toContain("faq-slow")
    expect(searchDocs(E, "зрелость").map(e => e.id)).toEqual(["maturity", "faq-slow"])
  })
  it("все слова запроса обязательны, заголовок весит больше текста", () => {
    expect(searchDocs(E, "прогноз корзина")).toEqual([])
    expect(searchDocs(E, "прогноз")[0].id).toBe("faq-slow")
  })
  it("слишком короткий запрос ничего не ищет, лимит соблюдается", () => {
    expect(searchDocs(E, "а")).toEqual([])
    expect(searchDocs(E, "про", 1)).toHaveLength(1)
  })
})
