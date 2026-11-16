import { describe, expect, it } from "vitest"
import { STRINGS } from "@/lib/i18n/strings"
import { EDGES, EDGE_KINDS, LEGEND, SCOPE_COLOR, legendColor } from "@/lib/features-map"

const S = STRINGS as Record<string, string>

describe("легенда связей", () => {
  it("у каждой связи вид из словаря, и каждый вид где-то используется (мертвых пунктов легенды нет)", () => {
    for (const e of EDGES) expect(EDGE_KINDS as readonly string[], `${e.from}:${e.to}`).toContain(e.kind)
    for (const k of EDGE_KINDS) expect(EDGES.some(e => e.kind === k), k).toBe(true)
  })
  it("для каждого пункта легенды есть название и пояснение", () => {
    for (const k of LEGEND) {
      expect(S[`featuresPage.legend.${k}.name`]?.trim(), k).toBeTruthy()
      expect(S[`featuresPage.legend.${k}.text`]?.trim(), k).toBeTruthy()
    }
    expect(S["featuresPage.legend.title"]?.trim()).toBeTruthy()
  })
  it("цвета пунктов различимы между собой, сквозная связь нейтральная", () => {
    const colors = LEGEND.map(legendColor)
    expect(new Set(colors).size).toBe(colors.length)
    expect(legendColor("scope")).toBe(SCOPE_COLOR)
  })
})
