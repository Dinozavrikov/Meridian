import { describe, it, expect } from "vitest"
import { theme, ink, v2 } from "@/lib/theme"
import { contrastRatio } from "@/lib/color"

describe("токены текста: читаемо на тёмных фонах (WCAG AA, 4.5:1)", () => {
  const backgrounds: [string, string][] = [["bg0", theme.bg0], ["bg1", theme.bg1], ["bg2", theme.bg2], ["card", ink.card]]
  const texts: [string, string][] = [
    ["ink.label", ink.label], ["ink.muted", ink.muted],
    ["theme.tx2", theme.tx2], ["theme.tx3", theme.tx3], ["theme.tx4", theme.tx4],
    ["v2.t3", v2.t3], ["v2.t4", v2.t4],
  ]
  for (const [tn, tc] of texts) {
    for (const [bn, bc] of backgrounds) {
      it(`${tn} на ${bn}`, () => { expect(contrastRatio(tc, bc)).toBeGreaterThanOrEqual(4.5) })
    }
  }
  it("формула верна: белый на чёрном = 21, старый служебный цвет нечитаем", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 0)
    expect(contrastRatio("#3A3F5C", theme.bg1)).toBeLessThan(3)
  })
})
