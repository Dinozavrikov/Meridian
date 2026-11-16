import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, cleanup } from "@testing-library/react"
import { ForceGraph } from "@/components/graph/force-graph"

vi.mock("@/lib/i18n/useT", () => ({ useT: () => (key: string) => key }))
vi.mock("@/lib/i18n/useTypeRu", () => ({ useTypeRu: () => ({}) }))

const nodes = [
  { id: "c", label: "Центр", type: "observation", entityId: 1, isCenter: true },
  { id: "h", label: "Гипотеза", type: "hypothesis", entityId: 2 },
]
const edges = [{ source: "c", target: "h", linkType: "связано" }]

beforeEach(() => { vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe("ForceGraph: собственная кнопка «Показать весь граф»", () => {
  it("по умолчанию она есть, с hideFitButton исчезает ровно она", () => {
    const withButton = render(<ForceGraph nodes={nodes} edges={edges} fixedCenter />)
    const before = withButton.container.querySelectorAll("button").length
    withButton.unmount()
    const hidden = render(<ForceGraph nodes={nodes} edges={edges} fixedCenter hideFitButton />)
    expect(before).toBeGreaterThan(0)
    expect(before - hidden.container.querySelectorAll("button").length).toBe(1)
  })

  it("onFitReady отдаёт функцию масштаба и снимает её при размонтировании", () => {
    const onFitReady = vi.fn()
    const { unmount } = render(<ForceGraph nodes={nodes} edges={edges} fixedCenter hideFitButton onFitReady={onFitReady} />)
    const fit = onFitReady.mock.calls.map(c => c[0]).find(f => typeof f === "function")
    expect(fit).toBeTypeOf("function")
    // сам fit() в jsdom не вызываем: d3 нужна геометрия SVG, которой там нет. Масштабирование проверяется в браузере.
    unmount()
    expect(onFitReady).toHaveBeenLastCalledWith(null)
  })
})
