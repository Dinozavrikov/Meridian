import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { STRINGS } from "@/lib/i18n/strings"
import { EDGES, EDGE_KINDS, KIND_COLOR, LEGEND, SCOPES, SCOPE_COLOR } from "@/lib/features-map"

const env = vi.hoisted(() => ({ mobile: false }))

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
vi.mock("@/lib/use-is-mobile", () => ({ useIsMobile: () => env.mobile }))
vi.mock("@/lib/store", () => ({ useStore: () => ({ user: null }) }))
vi.mock("@/lib/use-personal-feature-metrics", () => ({
  usePersonalFeatureMetrics: () => ({ metricFor: () => null, isError: false }),
}))

import { FeatureEdges } from "./FeatureEdges"
import { FeatureExplorer } from "./FeatureExplorer"

const S = STRINGS as Record<string, string>
afterEach(() => { cleanup(); env.mobile = false })

const live = (c: HTMLElement) =>
  [...c.querySelectorAll('path[data-state="live"]')].map(p => p.getAttribute("data-edge")).sort()
const ofKind = (k: string) =>
  (k === "scope" ? SCOPES.map(s => `${s.from}:@${s.group}`) : EDGES.filter(e => e.kind === k).map(e => `${e.from}:${e.to}`)).sort()

describe("линии и вид связи", () => {
  it("цвет линии задан видом связи, сквозные нейтральные", () => {
    const { container } = render(<FeatureEdges selected="messages" showAll />)
    for (const k of EDGE_KINDS)
      for (const p of container.querySelectorAll(`path[data-kind="${k}"]`)) expect(p.getAttribute("stroke"), k).toBe(KIND_COLOR[k])
    for (const p of container.querySelectorAll('path[data-kind="scope"]')) expect(p.getAttribute("stroke")).toBe(SCOPE_COLOR)
  })
  it("при подсветке вида яркие только его линии, остальные приглушены", () => {
    for (const k of LEGEND) {
      const { container, unmount } = render(<FeatureEdges selected="hypothesis" showAll={false} highlight={k} />)
      expect(live(container), k).toEqual(ofKind(k))
      const others = [...container.querySelectorAll("path")].filter(p => p.getAttribute("data-kind") !== k)
      expect(others.length, k).toBeGreaterThan(0)
      for (const p of others) expect(p.getAttribute("data-state"), k).toBe("dim")
      unmount()
    }
  })
})

describe("легенда на странице", () => {
  it("по пункту на каждый вид, с названием и пояснением", () => {
    const { container } = render(<FeatureExplorer />)
    expect(container.querySelectorAll("[data-legend]").length).toBe(LEGEND.length)
    for (const k of LEGEND) {
      expect(screen.getByText(S[`featuresPage.legend.${k}.name`])).toBeTruthy()
      expect(screen.getByText(S[`featuresPage.legend.${k}.text`])).toBeTruthy()
    }
  })
  it("наведение подсвечивает вид, уход возвращает прежнее, клик закрепляет, повторный клик снимает", () => {
    const { container } = render(<FeatureExplorer />)
    const base = live(container)
    const item = container.querySelector('[data-legend="evidence"]') as HTMLElement
    fireEvent.mouseEnter(item)
    expect(live(container)).toEqual(ofKind("evidence"))
    fireEvent.mouseLeave(item)
    expect(live(container)).toEqual(base)
    fireEvent.click(item)
    expect(item.getAttribute("aria-pressed")).toBe("true")
    fireEvent.mouseLeave(item)
    expect(live(container)).toEqual(ofKind("evidence"))
    fireEvent.click(item)
    expect(item.getAttribute("aria-pressed")).toBe("false")
    expect(live(container)).toEqual(base)
  })
  it("на телефоне легенды нет: линий там тоже нет", () => {
    env.mobile = true
    const { container } = render(<FeatureExplorer />)
    expect(container.querySelector("[data-legend]")).toBeNull()
  })
})
