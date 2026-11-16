import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { STRINGS } from "@/lib/i18n/strings"
import { EDGES, NODES, SCOPES, NODE_BY_KEY, neighbors } from "@/lib/features-map"

const env = vi.hoisted(() => ({ mobile: false, user: null as null | { username: string } }))

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
vi.mock("@/lib/use-is-mobile", () => ({ useIsMobile: () => env.mobile }))
vi.mock("@/lib/store", () => ({ useStore: () => ({ user: env.user }) }))
vi.mock("@/lib/use-personal-feature-metrics", () => ({
  usePersonalFeatureMetrics: (enabled: boolean) => ({
    metricFor: () => (enabled ? { labelKey: "featuresPage.metric.records", value: "42" } : null), isError: false,
  }),
}))

import { FeatureMap } from "./FeatureMap"
import { FeatureDetailPanel } from "./FeatureDetailPanel"
import { FeatureExplorer } from "./FeatureExplorer"

const S = STRINGS as Record<string, string>
afterEach(() => { cleanup(); env.mobile = false; env.user = null })

const states = (c: HTMLElement, state: string) =>
  [...c.querySelectorAll(`path[data-state="${state}"]`)].map(p => p.getAttribute("data-edge")).sort()

describe("карта", () => {
  it("клик по узлу выбирает его", () => {
    const onSelect = vi.fn()
    const { container } = render(<FeatureMap selected="hypothesis" showAll={false} onSelect={onSelect} />)
    fireEvent.click(container.querySelector('[data-node="observation"]')!)
    expect(onSelect).toHaveBeenCalledWith("observation")
  })
  it("выбранный узел отмечен, соседи подсвечены, остальные приглушены", () => {
    const { container } = render(<FeatureMap selected="hypothesis" showAll={false} onSelect={() => {}} />)
    const near = new Set(neighbors("hypothesis"))
    for (const n of NODES) {
      const want = n.key === "hypothesis" ? "selected" : near.has(n.key) ? "related" : "dim"
      expect(container.querySelector(`[data-node="${n.key}"]`)?.getAttribute("data-state"), n.key).toBe(want)
    }
    expect(container.querySelector('[data-node="hypothesis"]')?.getAttribute("aria-pressed")).toBe("true")
  })
  it("яркими рисуются только линии выбранного узла и сквозные действия на его колонку", () => {
    const { container } = render(<FeatureMap selected="hypothesis" showAll={false} onSelect={() => {}} />)
    const want = [
      ...EDGES.filter(e => e.from === "hypothesis" || e.to === "hypothesis").map(e => `${e.from}:${e.to}`),
      ...SCOPES.filter(s => s.from === "hypothesis" || s.group === NODE_BY_KEY.hypothesis.group).map(s => `${s.from}:@${s.group}`),
    ].sort()
    expect(states(container, "live")).toEqual(want)
  })
  it("без выбора связей видны только ключевые, остальные скрыты, а «все связи» скрытых не оставляет", () => {
    const a = render(<FeatureMap selected="messages" showAll={false} onSelect={() => {}} />)
    expect(states(a.container, "core")).toEqual(EDGES.filter(e => e.core).map(e => `${e.from}:${e.to}`).sort())
    expect(states(a.container, "hidden").length).toBe(EDGES.filter(e => !e.core).length + SCOPES.length)
    cleanup()
    const b = render(<FeatureMap selected="messages" showAll onSelect={() => {}} />)
    expect(states(b.container, "hidden")).toEqual([])
  })
  it("на телефоне вместо схемы список: все узлы есть, линий нет", () => {
    env.mobile = true
    const onSelect = vi.fn()
    const { container } = render(<FeatureMap selected="hypothesis" showAll={false} onSelect={onSelect} />)
    expect(container.querySelector("svg")).toBeNull()
    expect(container.querySelectorAll("[data-node]").length).toBe(NODES.length)
    fireEvent.click(container.querySelector('[data-node="feed"]')!)
    expect(onSelect).toHaveBeenCalledWith("feed")
  })
})

describe("панель узла", () => {
  it("для каждого узла: название, описание, соседи, ссылка на раздел только если он есть", () => {
    for (const n of NODES) {
      const { unmount } = render(<FeatureDetailPanel selected={n.key} metric={null} onSelect={() => {}} />)
      expect(screen.getByRole("heading", { level: 3 }).textContent, n.key).toBe(S[n.nameKey])
      expect(screen.getByText(S[n.textKey]), n.key).toBeTruthy()
      expect(screen.queryAllByRole("button").length, n.key).toBe(neighbors(n.key).length)
      const link = screen.queryByRole("link")
      if (n.href) expect(link?.getAttribute("href"), n.key).toBe(n.href)
      else expect(link, n.key).toBeNull()
      unmount()
    }
  })
  it("клик по соседу переключает выбор, метрика показывается с подписью", () => {
    const onSelect = vi.fn()
    render(<FeatureDetailPanel selected="hypothesis" metric={{ labelKey: "featuresPage.metric.records", value: "12" }} onSelect={onSelect} />)
    expect(screen.getByText("12")).toBeTruthy()
    expect(screen.getByText(new RegExp(S["featuresPage.metric.records"]))).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: S[NODE_BY_KEY.observation.nameKey] }))
    expect(onSelect).toHaveBeenCalledWith("observation")
  })
})

describe("обозреватель", () => {
  it("гостю вместо переключателя данных ссылка на вход", () => {
    render(<FeatureExplorer />)
    expect(screen.getByRole("link", { name: S["featuresPage.personal.login"] }).getAttribute("href")).toBe("/login")
    expect(screen.queryByRole("button", { name: S["featuresPage.personal.show"] })).toBeNull()
  })
  it("вошедший включает свои данные, и метрика появляется в панели", () => {
    env.user = { username: "alexey" }
    render(<FeatureExplorer />)
    expect(screen.queryByText("42")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: S["featuresPage.personal.show"] }))
    expect(screen.getByText("42")).toBeTruthy()
  })
  it("кнопка «Показать все связи» переключается и меняет состояние линий", () => {
    const { container } = render(<FeatureExplorer />)
    expect(container.querySelectorAll('path[data-state="hidden"]').length).toBeGreaterThan(0)
    const btn = screen.getByRole("button", { name: S["featuresPage.map.showAll"] })
    fireEvent.click(btn)
    expect(container.querySelectorAll('path[data-state="hidden"]').length).toBe(0)
    expect(screen.getByRole("button", { name: S["featuresPage.map.coreOnly"] }).getAttribute("aria-pressed")).toBe("true")
  })
  it("выбор узла в карте меняет заголовок панели", () => {
    const { container } = render(<FeatureExplorer />)
    fireEvent.click(container.querySelector('[data-node="labs"]')!)
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe(S[NODE_BY_KEY.labs.nameKey])
  })
})
