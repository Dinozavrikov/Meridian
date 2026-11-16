import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react"
import { STRINGS } from "@/lib/i18n/strings"
import { LocalGraphPanel } from "@/components/entities/relations-panel"
import { MENTION_EDGE_COLOR, MENTION_EDGE_DASH } from "@/lib/graph-mention"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
vi.mock("@/lib/i18n/useTypeRu", () => ({ useTypeRu: () => ({}) }))
vi.mock("@/lib/i18n/useContentT", () => ({ useContentT: () => ({ ct: (_t: string, _i: number, _f: string, text: string) => text, ensure: () => {} }) }))
const st = vi.hoisted(() => ({ data: undefined as unknown, fit: vi.fn(), graph: { nodes: [], edges: [] } as { nodes: unknown[]; edges: unknown[] } }))
vi.mock("@/lib/i18n/use-translated-query", () => ({ useTranslatedRelated: () => ({ data: st.data, isLoading: false }) }))
vi.mock("@/lib/graph-data", () => ({ buildLocalGraphData: () => st.graph }))
vi.mock("@/lib/graph-visuals", () => ({ EDGE_LEGEND: [["#2ECC71", "linkType.confirms"]] }))
vi.mock("@/components/graph/force-graph", () => ({
  ForceGraph: (p: { hideFitButton?: boolean; onFitReady?: (fit: (() => void) | null) => void; dashForEdge?: (e: { source: string; target: string; mention?: boolean }) => string | null | undefined; colorForEdge?: (e: { source: string; target: string; mention?: boolean }) => string }) => {
    p.onFitReady?.(st.fit)
    return <div data-testid="graph-canvas" data-hide-fit={String(!!p.hideFitButton)} data-dash-mention={String(p.dashForEdge?.({ source: "a", target: "b", mention: true }))} data-color-mention={String(p.colorForEdge?.({ source: "a", target: "b", mention: true }))} />
  },
}))
vi.mock("@/components/layout/resizable-layout", () => ({ useIsMobile: () => false }))
vi.mock("@/lib/use-is-mobile", () => ({ useIsMobile: () => false }))
vi.mock("@/lib/api", () => ({ api: {} }))
vi.mock("@/lib/store", () => ({ useStore: (sel: (s: unknown) => unknown) => sel({ user: null }) }))
vi.mock("@/components/ui/status-badge", () => ({ StatusBadge: () => null }))
vi.mock("@/components/entities/add-related-button", () => ({ AddRelatedButton: () => null }))
vi.mock("@/components/entities/quick-add-observation-modal", () => ({ QuickAddObservationModal: () => null }))
vi.mock("@/components/entities/quick-add-hypothesis-modal", () => ({ QuickAddHypothesisModal: () => null }))
vi.mock("@/components/entities/quick-add-prediction-link-modal", () => ({ QuickAddPredictionLinkModal: () => null }))
vi.mock("@/components/entities/add-forecast-modal", () => ({ AddForecastModal: () => null }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }))

const S = STRINGS as Record<string, string>
beforeEach(() => { st.data = { related: { hypothesis: [{ id: 1, title: "H", link_type: "связано" }] } }; st.fit.mockClear(); st.graph = { nodes: [], edges: [] } })
afterEach(cleanup)

const expandName = () => { expect(S["relations.expandGraph"]).toBeTruthy(); return S["relations.expandGraph"] }

describe("LocalGraphPanel без внешней кнопки масштаба (старый режим)", () => {
  it("«развернуть» стоит вне холста, родная кнопка масштаба графа не скрыта", () => {
    render(<LocalGraphPanel entityType="observation" entityId={1} entityTitle="T" bare />)
    const canvas = screen.getByTestId("graph-canvas")
    expect(canvas.parentElement!.contains(screen.getByRole("button", { name: expandName() }))).toBe(false)
    expect(canvas.getAttribute("data-hide-fit")).toBe("false")
  })

  it("развернуть открывает полный экран; свернуть: оверлей остаётся на время анимации и затем убирается", () => {
    vi.useFakeTimers()
    try {
      render(<LocalGraphPanel entityType="observation" entityId={1} entityTitle="T" bare />)
      expect(screen.queryByRole("dialog")).toBeNull()
      fireEvent.click(screen.getByRole("button", { name: expandName() }))
      expect(screen.getByRole("dialog")).toBeTruthy()
      expect(screen.getAllByTestId("graph-canvas")).toHaveLength(2)
      act(() => { vi.advanceTimersByTime(100) })
      expect(S["relations.collapseGraph"]).toBeTruthy()
      fireEvent.click(screen.getByTitle(S["relations.collapseGraph"]))
      expect(screen.getByRole("dialog")).toBeTruthy()
      act(() => { vi.advanceTimersByTime(500) })
      expect(screen.queryByRole("dialog")).toBeNull()
      expect(screen.getAllByTestId("graph-canvas")).toHaveLength(1)
    } finally { vi.useRealTimers() }
  })

  it("Escape закрывает полный экран; повторное открытие во время закрытия не оставляет его закрытым", () => {
    vi.useFakeTimers()
    try {
      render(<LocalGraphPanel entityType="observation" entityId={1} entityTitle="T" bare />)
      fireEvent.click(screen.getByRole("button", { name: expandName() }))
      fireEvent.keyDown(document.body, { key: "Escape" })
      act(() => { vi.advanceTimersByTime(500) })
      expect(screen.queryByRole("dialog")).toBeNull()
      fireEvent.click(screen.getByRole("button", { name: expandName() }))
      fireEvent.keyDown(document.body, { key: "Escape" })
      fireEvent.click(screen.getByRole("button", { name: expandName() }))
      act(() => { vi.advanceTimersByTime(500) })
      expect(screen.getByRole("dialog")).toBeTruthy()
    } finally { vi.useRealTimers() }
  })

  it("bare убирает заголовок блока, обычный режим его показывает; легенда есть в обоих", () => {
    const { rerender } = render(<LocalGraphPanel entityType="observation" entityId={1} entityTitle="T" bare />)
    expect(screen.queryByText(S["relations.localGraph"])).toBeNull()
    expect(screen.getByText(S["linkType.confirms"])).toBeTruthy()
    rerender(<LocalGraphPanel entityType="observation" entityId={1} entityTitle="T" />)
    expect(screen.getByText(S["relations.localGraph"])).toBeTruthy()
    expect(screen.getByText(S["linkType.confirms"])).toBeTruthy()
  })

  it("нет связей — граф не рисуется вовсе", () => {
    st.data = { related: {} }
    const { container } = render(<LocalGraphPanel entityType="observation" entityId={1} bare />)
    expect(container.firstChild).toBeNull()
  })
})

describe("LocalGraphPanel с внешней кнопкой масштаба (блок «Что уже известно»)", () => {
  it("на холсте одна кнопка «Развернуть граф»; масштаб отдан владельцу блока, родная кнопка скрыта", () => {
    const onFitReady = vi.fn()
    render(<LocalGraphPanel entityType="observation" entityId={1} bare onFitReady={onFitReady} />)
    const canvas = screen.getByTestId("graph-canvas")
    const buttons = screen.getAllByRole("button", { name: expandName() })
    expect(buttons).toHaveLength(1)
    expect(canvas.parentElement!.contains(buttons[0])).toBe(true)
    expect(canvas.getAttribute("data-hide-fit")).toBe("true")
    expect(onFitReady).toHaveBeenCalledWith(st.fit)
  })

  it("полный экран: у него родная кнопка масштаба остаётся, ведь в шапке полного экрана есть только «свернуть»", () => {
    render(<LocalGraphPanel entityType="observation" entityId={1} bare onFitReady={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: expandName() }))
    const canvases = screen.getAllByTestId("graph-canvas")
    expect(canvases).toHaveLength(2)
    expect(canvases[0].getAttribute("data-hide-fit")).toBe("true")
    expect(canvases[1].getAttribute("data-hide-fit")).toBe("false")
  })
})

describe("LocalGraphPanel: compact", () => {
  it("на холсте квадратная кнопка без текста, внутри холста; клик открывает полный экран", () => {
    render(<LocalGraphPanel entityType="observation" entityId={1} bare compact onFitReady={vi.fn()} />)
    const button = screen.getByRole("button", { name: expandName() })
    expect(button.textContent).toBe("")
    expect(screen.getByTestId("graph-canvas").parentElement!.contains(button)).toBe(true)
    fireEvent.click(button)
    expect(screen.getByRole("dialog")).toBeTruthy()
  })

  it("без compact: кнопка с текстом", () => {
    render(<LocalGraphPanel entityType="observation" entityId={1} bare onFitReady={vi.fn()} />)
    expect(screen.getByRole("button", { name: expandName() }).textContent).toContain(S["relations.expandGraph"])
  })
})

describe("LocalGraphPanel: упоминания", () => {
  it("у записи с одними упоминаниями граф рисуется", () => {
    st.data = { related: {}, mentions: { mentions: [{ id: 1, type: "hypothesis", title: "H", fields: ["text"] }], mentioned_in: [] } }
    render(<LocalGraphPanel entityType="observation" entityId={1} entityTitle="T" bare />)
    expect(screen.getByTestId("graph-canvas")).toBeTruthy()
  })
})

describe("LocalGraphPanel: рёбра упоминаний", () => {
  const withMention = () => {
    st.data = { related: {}, mentions: { mentions: [{ id: 3, type: "task", title: "Z", fields: ["text"] }], mentioned_in: [] } }
    st.graph = { nodes: [{ id: "center" }, { id: "task-3" }], edges: [{ source: "center", target: "task-3", mention: true }] }
  }

  it("есть рёбра-упоминания: «Упоминание» в легенде, и в полноэкранном виде тоже", () => {
    withMention()
    render(<LocalGraphPanel entityType="observation" entityId={1} entityTitle="T" bare />)
    expect(S["graphVisuals.mentionLabel"]).toBeTruthy()
    expect(screen.getAllByText(S["graphVisuals.mentionLabel"])).toHaveLength(1)
    fireEvent.click(screen.getByRole("button", { name: expandName() }))
    expect(screen.getAllByText(S["graphVisuals.mentionLabel"])).toHaveLength(2)
  })

  it("рёбер-упоминаний нет: легенды упоминаний нет", () => {
    render(<LocalGraphPanel entityType="observation" entityId={1} entityTitle="T" bare />)
    expect(screen.queryByText(S["graphVisuals.mentionLabel"])).toBeNull()
  })

  it("оба холста красят и штрихуют упоминания", () => {
    withMention()
    render(<LocalGraphPanel entityType="observation" entityId={1} entityTitle="T" bare />)
    fireEvent.click(screen.getByRole("button", { name: expandName() }))
    const canvases = screen.getAllByTestId("graph-canvas")
    expect(canvases).toHaveLength(2)
    for (const c of canvases) {
      expect(c.getAttribute("data-dash-mention")).toBe(MENTION_EDGE_DASH)
      expect(c.getAttribute("data-color-mention")).toBe(MENTION_EDGE_COLOR)
    }
  })
})
