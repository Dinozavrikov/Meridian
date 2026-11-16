import { describe, it, expect } from "vitest"
import { contrastRatio, cssRgbToHex, luminance, mixHex, readableOn } from "@/lib/color"

const BG = "#0b0d14"

describe("contrastRatio", () => {
  it("белый на чёрном = 21, одинаковые цвета = 1", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 0)
    expect(contrastRatio("#4a90d9", "#4a90d9")).toBeCloseTo(1, 5)
  })
})

describe("readableOn", () => {
  it("уже читаемый цвет не меняется (с точностью до регистра)", () => {
    expect(readableOn("#1ABC9C", BG)).toBe("#1abc9c")
    expect(contrastRatio("#1ABC9C", BG)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(["#333333", "#484848", "#606060", "#606080"])("тёмный цвет %s поднимается до 4.5:1 и остаётся светлее исходного, но не белым", (c) => {
    const out = readableOn(c, BG)
    expect(contrastRatio(out, BG)).toBeGreaterThanOrEqual(4.5)
    expect(luminance(out)).toBeGreaterThan(luminance(c))
    expect(out).not.toBe("#ffffff")
  })

  it("оттенок сохраняется: синеватый серый остаётся синеватым", () => {
    const out = readableOn("#606080", BG)
    const [r, , b] = [parseInt(out.slice(1, 3), 16), 0, parseInt(out.slice(5, 7), 16)]
    expect(b).toBeGreaterThan(r)
  })

  it("не-hex значение возвращается как есть", () => {
    expect(readableOn("var(--x)", BG)).toBe("var(--x)")
  })
})

describe("mixHex / cssRgbToHex", () => {
  it("смешивание и перевод из rgb()", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080")
    expect(cssRgbToHex("rgb(26, 188, 156)")).toBe("#1abc9c")
    expect(cssRgbToHex("не цвет")).toBeNull()
  })
})

import { isDimTextColor, resolveOnBg } from "@/lib/color"

describe("isDimTextColor", () => {
  it.each(["#3A3F5C", "#333", "#2a2a3a", "#404060", "#4A90D960", "#7f8295"])("%s — тусклый серый", c => {
    expect(isDimTextColor(c)).toBe(true)
  })
  it.each(["#1ABC9C", "#f2efe9", "#9aa1c2", "#0b0d14", "#111", "#E74C3C", "var(--x)", "rgb(1,2,3)"])("%s — не трогаем", c => {
    expect(isDimTextColor(c)).toBe(false)
  })
  it("прозрачный цвет считается поверх фона", () => {
    expect(resolveOnBg("#ffffff00")).toBe("#0b0d14")
    expect(resolveOnBg("#fff")).toBe("#ffffff")
  })
})
