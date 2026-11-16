import { describe, it, expect } from "vitest"
import { viewItems, linkKey } from "@/lib/relation-view"

const items = [
  { id: 1, link_type: "связано", linked_at: "2026-09-01T10:00:00Z" },
  { id: 2, link_type: "опровергает", linked_at: "2026-10-01T10:00:00Z" },
  { id: 3, source: "field", stance: "опровергает", link_type: "связано", linked_at: null },
  { id: 4, source: "competing", link_type: "конкурирующая гипотеза", role: "leading" },
  { id: 5, link_type: "подтверждает", linked_at: "2026-09-15T10:00:00Z" },
]
const ids = (r: { id: number }[]) => r.map(i => i.id)

describe("viewItems", () => {
  it("«Все» и порядок по умолчанию ничего не меняют", () => {
    expect(ids(viewItems(items, { filter: "all", sort: "default" }))).toEqual([1, 2, 3, 4, 5])
  })
  it("фильтр по типу: у связи из поля тип берётся из stance, конкурирующие скрыты", () => {
    expect(linkKey(items[2])).toBe("опровергает")
    expect(ids(viewItems(items, { filter: "опровергает", sort: "default" }))).toEqual([2, 3])
    expect(ids(viewItems(items, { filter: "подтверждает", sort: "default" }))).toEqual([5])
  })
  it("«сначала новые»: по убыванию даты, без даты в конце, конкурирующие первыми", () => {
    expect(ids(viewItems(items, { filter: "all", sort: "fresh" }))).toEqual([4, 2, 5, 1, 3])
  })
  it("исходный массив не мутируется", () => {
    const copy = [...items]
    viewItems(items, { filter: "all", sort: "fresh" })
    expect(items).toEqual(copy)
  })
})
