import { describe, it, expect } from "vitest"
import { ENTITY_ROUTES, entityHref, safeEntityHref, isEntityType, type EntityType } from "@/lib/entity-routes"

describe("safeEntityHref", () => {
  it.each(Object.entries(ENTITY_ROUTES))("%s: тот же адрес, что у entityHref (вкладка «Детали»)", (type, page) => {
    expect(safeEntityHref(type, 7)).toBe(`${page}?id=7&tab=detail`)
    expect(safeEntityHref(type, 7)).toBe(entityHref(type as EntityType, 7))
  })
  it("неизвестный тип и унаследованные ключи объекта ведут в корень, а не в «undefined?id=»", () => {
    expect(safeEntityHref("result", 3)).toBe("/")
    expect(safeEntityHref("toString", 3)).toBe("/")
    expect(isEntityType("constructor")).toBe(false)
    expect(isEntityType("hypothesis")).toBe(true)
  })
  it("страницы типов не пересекаются и начинаются с «/»", () => {
    const pages = Object.values(ENTITY_ROUTES)
    expect(new Set(pages).size).toBe(pages.length)
    expect(pages.every(p => p.startsWith("/"))).toBe(true)
  })
})
