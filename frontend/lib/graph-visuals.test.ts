import { describe, it, expect } from "vitest"
import { EDGE_COLOR } from "@/lib/graph-visuals"
import { theme } from "@/lib/theme"
import { getLinkTypes } from "@/components/entities/link-types"

describe("цвет нейтральной связи", () => {
  it("не совпадает с акцентом темы", () => {
    expect(EDGE_COLOR.neutral.toLowerCase()).not.toBe(theme.accent.toLowerCase())
  })
  it("единый источник у графа и у менеджера связей", () => {
    const t = (k: string) => k
    const related = getLinkTypes(t).find(x => x.value === "связано")!
    expect(related.color).toBe(EDGE_COLOR.neutral)
    expect(related.color).toBe(theme.edgeNeutral)
  })
})
