import { describe, it, expect } from "vitest"
import { FEED_RULES, FEED_TOKENS } from "@/components/feed/feed-styles"

// Охрана светлой темы и единых токенов: цвет задаётся только токеном, иначе тему придётся искать по правилам.
describe("стили ленты", () => {
  it("в правилах нет цветовых литералов (цвета только через токены --mf-*)", () => {
    expect(FEED_RULES.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/g)).toBeNull()
  })

  it("все токены, на которые ссылаются правила, объявлены", () => {
    const declared = new Set([...FEED_TOKENS.matchAll(/(--mf-[a-z0-9-]+)\s*:/g)].map(m => m[1]))
    expect(declared.size).toBeGreaterThan(10)
    const used = new Set([...FEED_RULES.matchAll(/var\((--mf-[a-z0-9-]+)/g)].map(m => m[1]))
    expect([...used].filter(u => !declared.has(u))).toEqual([])
  })

  it("локальная переменная только одна — --c (цвет типа, статуса или связи приходит из компонента)", () => {
    const names = new Set([...FEED_RULES.matchAll(/var\((--[a-z0-9-]+)/g)].map(m => m[1]))
    expect([...names].filter(n => n !== "--c" && !n.startsWith("--mf-"))).toEqual([])
  })

  it("правая панель закреплена и не выше окна (иначе нижняя её часть недоступна)", () => {
    const rail = FEED_RULES.match(/\.mf-rail\{[^}]*\}/)![0]
    expect(rail).toContain("position:sticky")
    expect(rail).toMatch(/max-height:calc\(100vh/)
    expect(rail).toContain("overflow-y:auto")
  })

  it("на узких экранах панель не закреплена и не режется", () => {
    const narrow = FEED_RULES.slice(FEED_RULES.indexOf("@media (max-width:1023px)"))
    expect(narrow).toMatch(/\.mf-rail\{[^}]*position:static[^}]*max-height:none/)
  })
})
