import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { RelationManager } from "@/components/entities/relation-manager"

const h = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock("@/lib/api", () => ({ api: { get: h.get, post: vi.fn(), delete: vi.fn(), put: vi.fn() } }))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string, p?: Record<string, string>) =>
    Object.entries(p ?? {}).reduce((a, [k, v]) => a.replace(`{${k}}`, v), (STRINGS as Record<string, string>)[key] ?? key) }
})
vi.mock("@/lib/i18n/useTypeRu", () => ({ useTypeRu: () => ({ hypothesis: "Гипотеза", worldview: "Убеждение" }) }))
vi.mock("@/lib/i18n/useDynamicT", () => ({ useDynamicTranslate: () => (s: string) => s }))
vi.mock("@/lib/i18n/useContentT", () => ({
  useContentT: () => ({ ct: (_t: string, _i: number, _f: string, x: string) => x, ensure: () => {} }),
  useTranslatedField: (_t: string, _i: number, _f: string, x: string) => x,
}))
vi.mock("@/lib/i18n/use-translated-query", () => ({
  useTranslatedRelated: () => ({
    isLoading: false,
    data: { related: {
      worldview: [{ id: 11, title: "Убеждение А", link_type: "challenges", source: "link", direct: true, capabilities: ["remove", "set_type"], lock: null }],
      hypothesis: [{ id: 5, title: "Гипотеза Б", link_type: "связано", source: "link", direct: true, capabilities: ["remove", "set_type"], lock: null, status: "идея" }],
    } },
  }),
}))

beforeEach(() => { h.get.mockReset(); h.get.mockResolvedValue({ data: [] }) })
afterEach(cleanup)

describe("RelationManager: фильтр по типу связи знает влияние на убеждение", () => {
  it("чип «Бросает вызов» со счётчиком; выбор оставляет только строку убеждения", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={qc}><RelationManager entityType="hypothesis" entityId={1} /></QueryClientProvider>)
    const chip = screen.getAllByRole("button").find(b => b.textContent === "Бросает вызов1")
    expect(chip, "нет чипа фильтра «Бросает вызов» со счётчиком 1").toBeTruthy()
    fireEvent.click(chip!)
    expect(screen.queryByText("Гипотеза Б")).toBeNull()
    expect(screen.queryByText("Убеждение А")).not.toBeNull()
  })
})
