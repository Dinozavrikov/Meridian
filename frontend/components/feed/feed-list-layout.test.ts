import { describe, it, expect } from "vitest"
import { LIST_RULES } from "@/components/feed/feed-list-styles"

const rule = (sel: string) => LIST_RULES.match(new RegExp("\\." + sel + "\\{[^}]*\\}"))![0]

describe("раскладка режима «Список»", () => {
  it("шапки колонок нет, строка — вердикт фиксированной ширины, основная часть, счётчик", () => {
    expect(LIST_RULES).not.toContain(".mfl-head")
    expect(rule("mfl-row")).toMatch(/grid-template-columns:\d+px minmax\(0,1fr\) auto/)
  })

  it("подпись вердикта и статус в метаданных переносятся и не обрезаются многоточием (раньше «активная пров…»)", () => {
    expect(rule("mfl-cap")).toContain("white-space:normal")
    expect(rule("mfl-cap")).not.toContain("text-overflow")
    expect(rule("mfl-st")).not.toContain("text-overflow")
    expect(rule("mfl-st")).not.toContain("white-space:nowrap")
  })

  it("имя автора выделено: крупнее метаданных и жирное", () => {
    const r = rule("mfl-name")
    expect(r).toContain("font-weight:600")
    expect(r).toMatch(/font-size:1[4-9]px/)
  })

  it("на узкой ленте счётчик комментариев уходит под основную часть, колонка вердикта сужается", () => {
    const narrow = LIST_RULES.slice(LIST_RULES.indexOf("@container"))
    expect(narrow).toMatch(/\.mfl-cnt-c\{grid-column:2/)
    expect(narrow).toMatch(/\.mfl-row\{grid-template-columns:\d+px minmax\(0,1fr\)/)
  })
})
