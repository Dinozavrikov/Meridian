import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { LabGraphTab } from "@/components/labs/lab-graph-tab"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return {
    useT: () => (key: string, params?: Record<string, string | number>) =>
      ((STRINGS as Record<string, string>)[key] ?? key).replace(/\{(\w+)\}/g, (_m, k) => String(params?.[k] ?? "")),
  }
})
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: any) => <a href={href} {...r}>{children}</a> }))
vi.mock("@/components/entities/entity-preview-modal", () => ({ EntityPreviewModal: () => null }))
vi.mock("@/components/graph/graph-explorer", () => ({
  GraphExplorer: ({ nodes }: any) => <div data-testid="explorer" data-nodes={JSON.stringify(nodes)} />,
}))
vi.mock("@/components/graph/use-graph-insights", () => ({
  useGraphInsights: () => ({ toolbar: null, colorForNode: undefined, emphasis: undefined, onNodeClick: () => {}, previewEnabled: false }),
}))
const api = vi.hoisted(() => ({ lab: vi.fn() }))
vi.mock("@/lib/api", () => ({ graphApi: { lab: api.lab } }))

const mount = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <LabGraphTab labId={5} />
  </QueryClientProvider>)

beforeEach(() => api.lab.mockReset())
afterEach(cleanup)

describe("LabGraphTab: include_opened", () => {
  it("по умолчанию includeOpened=false; узлы без opened", async () => {
    api.lab.mockResolvedValue({ nodes: [{ id: "observation-1", eid: 1, type: "observation", label: "Н1" }], edges: [] })
    mount()
    await waitFor(() => {
      const raw = screen.getByTestId("explorer").getAttribute("data-nodes")!
      expect(JSON.parse(raw).length).toBeGreaterThan(0)
    })
    expect(api.lab).toHaveBeenCalledWith(5, { includeOpened: false })
    const nodes = JSON.parse(screen.getByTestId("explorer").getAttribute("data-nodes")!)
    expect(nodes[0].opened).toBeUndefined()
  })

  it("тумблер шлёт includeOpened=true и открытый узел помечается opened", async () => {
    api.lab.mockResolvedValueOnce({ nodes: [{ id: "observation-1", eid: 1, type: "observation", label: "Н1" }], edges: [] })
    mount()
    await screen.findByTestId("explorer")
    api.lab.mockResolvedValueOnce({ nodes: [
      { id: "observation-1", eid: 1, type: "observation", label: "Н1" },
      { id: "observation-2", eid: 2, type: "observation", label: "Н2", opened: true },
    ], edges: [] })
    fireEvent.click(screen.getByRole("tab", { name: "Включая открытые за пределами лаборатории" }))
    await waitFor(() => expect(api.lab).toHaveBeenLastCalledWith(5, { includeOpened: true }))
    await waitFor(() => {
      const nodes = JSON.parse(screen.getByTestId("explorer").getAttribute("data-nodes")!)
      expect(nodes.find((n: any) => n.entityId === 2)?.opened).toBe(true)
    })
  })
})
