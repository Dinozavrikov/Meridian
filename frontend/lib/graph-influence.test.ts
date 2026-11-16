import { describe, it, expect } from "vitest"
import { STRINGS } from "@/lib/i18n/strings"
import { WORLDVIEW_INFLUENCE, influenceLegendFor } from "@/lib/worldview-influence"
import { edgeColorFor, edgeLabelKeyFor, edgeDescriptionKeyFor, orbitalLayout, EDGE_COLOR } from "@/lib/graph-visuals"

const S = STRINGS as Record<string, string>

describe("рёбра влияния на убеждение", () => {
  it("цвет ребра = цвет влияния, не нейтральный", () => {
    for (const i of WORLDVIEW_INFLUENCE) {
      expect(edgeColorFor(i.value), i.value).toBe(i.color)
      expect(edgeColorFor(i.value), i.value).not.toBe(EDGE_COLOR.neutral)
    }
  })
  it("подпись и описание ребра из словаря влияния, тексты заведены", () => {
    for (const i of WORLDVIEW_INFLUENCE) {
      expect(edgeLabelKeyFor(i.value), i.value).toBe(i.labelKey)
      expect(edgeDescriptionKeyFor(i.value), i.value).toBe(i.descKey)
      expect(S[i.labelKey] && S[i.descKey], i.value).toBeTruthy()
    }
  })
  it("охранный (зелёный и до правки): прежние типы не изменились", () => {
    expect(edgeColorFor("подтверждает")).toBe(EDGE_COLOR.confirms)
    expect(edgeColorFor("опровергает")).toBe(EDGE_COLOR.refutes)
    expect(edgeColorFor("связано")).toBe(EDGE_COLOR.neutral)
    expect(edgeColorFor("competing_hypothesis")).toBe(EDGE_COLOR.competing_hypothesis)
  })
  it("охранный (зелёный и до правки): раскладка размещает связь с влиянием", () => {
    const p = orbitalLayout([{ item: "a", linkType: "strengthens" }, { item: "b", linkType: "подтверждает" }], 0, 0, 100)
    expect(p.map(x => x.item).sort()).toEqual(["a", "b"])
  })
  it("легенда влияний: только те, что есть среди рёбер, в порядке словаря (красное «на отсутствующей функции»)", () => {
    const edges = [{ linkType: "contradicts" }, { linkType: "strengthens" }, { linkType: "связано" }, {}]
    expect(influenceLegendFor(edges)).toEqual([["#A3E635", "influence.strengthens.label"], ["#E74C3C", "influence.contradicts.label"]])
  })
  it("легенда влияний пуста, если влияний среди рёбер нет (красное «на отсутствующей функции»)", () => {
    expect(influenceLegendFor([{ linkType: "подтверждает" }, {}])).toEqual([])
  })
})

const rgb = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
const dist = (a: string, b: string) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]))

describe("цвета рёбер различимы", () => {
  it("влияние отличается от всех прочих видов ребра и от соседних влияний (кроме намеренной пары: противоречит=опровергает)", () => {
    const base: Record<string, string> = { confirms: EDGE_COLOR.confirms, refutes: EDGE_COLOR.refutes, neutral: EDGE_COLOR.neutral, prediction_of: EDGE_COLOR.prediction_of, competing: EDGE_COLOR.competing_hypothesis }
    const same: Record<string, string> = { contradicts: "refutes" }
    const infl = Object.fromEntries(WORLDVIEW_INFLUENCE.map(i => [i.value, i.color]))
    for (const [name, c] of Object.entries(infl)) {
      for (const [bn, bc] of Object.entries(base)) {
        if (same[name] === bn) { expect(c.toLowerCase(), name).toBe(bc.toLowerCase()); continue }
        expect(dist(c, bc), `${name} vs ${bn}`).toBeGreaterThanOrEqual(70)
      }
      for (const [on, oc] of Object.entries(infl)) if (on < name) expect(dist(c, oc), `${name} vs ${on}`).toBeGreaterThanOrEqual(70)
    }
  })
})
