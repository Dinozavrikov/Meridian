import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { RelationManager } from "@/components/entities/relation-manager"
import { ToastHost } from "@/components/ui/toast-host"

const h = vi.hoisted(() => ({ items: [] as any[] }))
vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn(), delete: vi.fn(), put: vi.fn() } }))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string, p?: Record<string, string>) =>
    Object.entries(p ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), (STRINGS as Record<string, string>)[key] ?? key) }
})
vi.mock("@/lib/i18n/useTypeRu", () => ({ useTypeRu: () => ({ hypothesis: "Гипотеза", question: "Вопрос", prediction: "Прогноз" }) }))
vi.mock("@/lib/i18n/useDynamicT", () => ({ useDynamicTranslate: () => (s: string) => s }))
vi.mock("@/lib/i18n/useContentT", () => ({ useContentT: () => ({ ct: (_t: string, _i: number, _f: string, x: string) => x, ensure: () => {} }),
  useTranslatedField: (_t: string, _i: number, _f: string, x: string) => x,
}))
vi.mock("@/lib/i18n/use-translated-query", () => ({
  useTranslatedRelated: () => ({ isLoading: false, data: { related: { hypothesis: h.items } } }),
}))
vi.mock("@/components/entities/link-types", () => ({
  getLinkTypes: () => [{ value: "связано", label: "Связано", color: "#4A90D9" }],
}))
afterEach(cleanup)

const SW = { share_id: 5, lab_id: 1, lab_name: "Лаба-X", entity_type: "observation", entity_id: 1 }
const base = { id: 5, title: "Гипотеза А", link_type: "связано", direct: true, source: "link", can_edit: true }
const mount = () => render(<QueryClientProvider client={new QueryClient()}><><RelationManager entityType="observation" entityId={1} /><ToastHost /></></QueryClientProvider>)

describe("RelationManager: полоса «открыта лаборатории» (оба теста охранные: зелёные и до патча)", () => {
  it("у связи с shared_with рисуется полоса с названием лаборатории", () => {
    h.items = [{ ...base, shared_with: [SW] }]
    mount()
    expect(screen.getAllByText(/Лаба-X/).length).toBeGreaterThan(0)
  })
  it("без shared_with полосы нет", () => {
    h.items = [base]
    mount()
    expect(screen.getAllByText(/Гипотеза А/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Лаба-X/)).toBeNull()
  })
})
