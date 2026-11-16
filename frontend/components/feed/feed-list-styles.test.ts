import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { FEED_TOKENS } from "@/components/feed/feed-styles"
import { LIST_RULES } from "@/components/feed/feed-list-styles"

const src = ["feed-list.tsx", "feed-view-toggle.tsx"]
  .map(f => readFileSync(resolve(process.cwd(), "components/feed", f), "utf8")).join("\n")

describe("стили режима «Список»", () => {
  it("в правилах нет цветовых литералов (только токены --mf-*)", () => {
    expect(LIST_RULES.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/g)).toBeNull()
  })

  it("все токены, на которые ссылаются правила, объявлены", () => {
    const declared = new Set([...FEED_TOKENS.matchAll(/(--mf-[a-z0-9-]+)\s*:/g)].map(m => m[1]))
    const used = new Set([...LIST_RULES.matchAll(/var\((--mf-[a-z0-9-]+)/g)].map(m => m[1]))
    expect(used.size).toBeGreaterThan(5)
    expect([...used].filter(u => !declared.has(u))).toEqual([])
  })

  it("локальная переменная только одна — --c", () => {
    const names = new Set([...LIST_RULES.matchAll(/var\((--[a-z0-9-]+)/g)].map(m => m[1]))
    expect([...names].filter(n => n !== "--c" && !n.startsWith("--mf-"))).toEqual([])
  })

  it("каждый класс mfl-*, который использует разметка, имеет правило (опечатка в имени класса ловится здесь)", () => {
    const used = [...new Set(src.match(/\bmfl(?:-[a-z0-9]+)*\b/g) ?? [])]
    expect(used.length).toBeGreaterThan(15)
    const missing = used.filter(c => !new RegExp("\\." + c + "(?![a-z0-9-])").test(LIST_RULES))
    expect(missing).toEqual([])
  })

  it("ширина колонок считается от ширины самой ленты (вкладка лаборатории уже страницы ленты), а не окна", () => {
    expect(LIST_RULES).toMatch(/\.mfl\{[^}]*container-type:inline-size/)
    expect(LIST_RULES).toMatch(/@container \(max-width:\d+px\)\{[\s\S]*\.mfl-cnt-c\{grid-column:2/)
  })
})
