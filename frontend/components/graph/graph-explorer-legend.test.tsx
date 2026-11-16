import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { STRINGS } from "@/lib/i18n/strings"
import { WORLDVIEW_INFLUENCE } from "@/lib/worldview-influence"
import { GraphExplorer } from "@/components/graph/graph-explorer"

vi.mock("@/components/graph/force-graph", () => ({ ForceGraph: () => null }))
vi.mock("@/lib/i18n/useTypeRu", () => ({ useTypeRu: () => ({}) }))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
afterEach(cleanup)

const S = STRINGS as Record<string, string>
const KEYS = WORLDVIEW_INFLUENCE.map(i => i.labelKey)
const nodes = [
  { id: "a", label: "A", type: "worldview", entityId: 1 },
  { id: "b", label: "B", type: "observation", entityId: 2 },
]
const edge = (linkType: string) => ({ source: "a", target: "b", linkType })
const view = (edges: { source: string; target: string; linkType: string }[]) =>
  <GraphExplorer nodes={nodes} edges={edges} types={["worldview", "observation"]} />
const count = (key: string) => screen.queryAllByText(S[key]).length
const counts = () => Object.fromEntries(KEYS.map(k => [k, count(k)]))

describe("GraphExplorer: легенда влияний на убеждение", () => {
  it("тексты подписей заведены", () => {
    for (const k of KEYS) expect(S[k], k).toBeTruthy()
  })
  it("охранный (зелёный и до патча): без рёбер влияния подписи влияний не появляются", () => {
    const { rerender } = render(view([edge("связано")]))
    const before = counts()
    rerender(view([edge("подтверждает"), edge("опровергает")]))
    expect(counts()).toEqual(before)
  })
  it("ребро strengthens добавляет в легенду одну подпись влияния", () => {
    const { rerender } = render(view([edge("связано")]))
    const before = count("influence.strengthens.label")
    rerender(view([edge("strengthens")]))
    expect(count("influence.strengthens.label")).toBe(before + 1)
  })
  it("два вида влияния: по одной подписи на каждый, остальные не появляются", () => {
    const { rerender } = render(view([edge("связано")]))
    const before = counts()
    rerender(view([edge("strengthens"), edge("contradicts")]))
    for (const k of KEYS) {
      const want = k === "influence.strengthens.label" || k === "influence.contradicts.label" ? 1 : 0
      expect(count(k), k).toBe(before[k] + want)
    }
  })
})
