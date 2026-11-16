import { describe, it, expect } from "vitest"
import { buildLocalGraphData } from "@/lib/graph-data"
import { mentionAwareDash, mentionAwareColor, legendSwatchStyle, MENTION_EDGE_DASH, MENTION_EDGE_COLOR, MENTION_LEGEND_KEY, MENTION_DESCRIPTION_KEY } from "@/lib/graph-mention"
import { edgeColorFor } from "@/lib/graph-visuals"
import { STRINGS } from "@/lib/i18n/strings"

const M = (type: string, id: number, title = "t") => ({ type, id, title, fields: ["text"] })

describe("buildLocalGraphData: упоминания", () => {
  it("узлы и рёбра упоминаний от центра, помечены mention", () => {
    const g = buildLocalGraphData({ related: {}, mentions: { mentions: [M("observation", 7, "О")], mentioned_in: [M("question", 8, "В")] } }, "hypothesis", 1, "Г")
    expect(g.nodes.map(n => n.id)).toEqual(["center", "observation-7", "question-8"])
    expect(g.edges).toEqual([
      { source: "center", target: "observation-7", mention: true },
      { source: "center", target: "question-8", mention: true },
    ])
  })
  it("запись, уже связанная или упомянутая дважды, не дублируется; связь остаётся обычным ребром", () => {
    const g = buildLocalGraphData({
      related: { observation: [{ id: 7, type: "observation", title: "О", link_type: "связано" }] },
      mentions: { mentions: [M("observation", 7), M("task", 3)], mentioned_in: [M("task", 3)] },
    }, "hypothesis", 1, "Г")
    expect(g.nodes.filter(n => n.id === "observation-7")).toHaveLength(1)
    expect(g.nodes.filter(n => n.id === "task-3")).toHaveLength(1)
    expect(g.edges.filter(e => e.target === "observation-7").every(e => !e.mention)).toBe(true)
    expect(g.edges.filter(e => e.mention)).toHaveLength(1)
  })
  it("охранный (зелёный и до правки): без упоминаний граф прежний", () => {
    const g = buildLocalGraphData({ related: { hypothesis: [{ id: 1, type: "hypothesis", title: "H", link_type: "связано" }] } }, "observation", 1, "T")
    expect(g.nodes).toHaveLength(2); expect(g.edges).toEqual([{ source: "center", target: "hypothesis-1", linkType: "связано" }])
  })
})

describe("mentionAwareDash", () => {
  it("упоминание пунктиром; «опровергает» прежним; остальное сплошное", () => {
    expect(mentionAwareDash({ source: "a", target: "b", mention: true })).toBe(MENTION_EDGE_DASH)
    expect(mentionAwareDash({ source: "a", target: "b", linkType: "опровергает" })).toBe("4,3")
    expect(mentionAwareDash({ source: "a", target: "b", linkType: "связано" })).toBeNull()
  })
})

describe("mentionAwareColor и образец легенды", () => {
  it("упоминание серое, остальные по типу связи", () => {
    expect(mentionAwareColor({ source: "a", target: "b", mention: true })).toBe(MENTION_EDGE_COLOR)
    expect(mentionAwareColor({ source: "a", target: "b", linkType: "опровергает" })).toBe(edgeColorFor("опровергает"))
  })
  it("образец: упоминание штрихом, остальное сплошной линией", () => {
    expect(legendSwatchStyle("#fff", MENTION_LEGEND_KEY, 16)).toMatchObject({ borderTop: "2px dashed #fff" })
    expect(legendSwatchStyle("#fff", "linkType.confirms", 16)).toMatchObject({ background: "#fff" })
  })
  it("подпись и описание упоминания заведены в словаре", () => {
    for (const k of [MENTION_LEGEND_KEY, MENTION_DESCRIPTION_KEY]) expect((STRINGS as Record<string, string>)[k]).toBeTruthy()
  })
})
