import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { STRINGS } from "@/lib/i18n/strings"
import { WorldviewTab } from "@/components/entities/worldview-tab"

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), toast: vi.fn() }))
vi.mock("@/lib/api", () => ({ api: { get: h.get, post: h.post, put: h.put, delete: h.del } }))
vi.mock("@/lib/toast", () => ({ toast: h.toast }))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
vi.mock("@/lib/i18n/use-translated-query", () => ({
  useTranslatedRelated: () => ({ isLoading: false, data: { related: { worldview: [{ id: 11, title: "Убеждение А", link_type: "strengthens", confidence: 3 }] } } }),
}))
vi.mock("@/components/layout/resizable-layout", () => ({ useIsMobile: () => false }))
vi.mock("@/components/entities/add-related-button", () => ({ AddRelatedButton: () => null }))
vi.mock("@/components/entities/link-existing-modal", () => ({ LinkExistingModal: () => null }))
vi.mock("@/components/entities/quick-add-worldview-modal", () => ({ QuickAddWorldviewModal: () => null }))
vi.mock("@/components/ui/ruler", () => ({ Ruler: () => null }))

const S = STRINGS as Record<string, string>
const history = (type: string, id: number) => ({ id, type, other_type: "worldview", other_id: 11, reverted: false, undoable: true })

beforeEach(() => {
  h.get.mockReset(); h.post.mockReset(); h.put.mockReset(); h.del.mockReset(); h.toast.mockReset()
  h.post.mockResolvedValue({ data: {} }); h.put.mockResolvedValue({ data: {} }); h.del.mockResolvedValue({ data: {} })
})
afterEach(cleanup)

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={qc}><WorldviewTab entityType="hypothesis" entityId={1} /></QueryClientProvider>)
}

describe("WorldviewTab: «Вернуть»", () => {
  it("смена влияния: один PUT (без удаления и повторного создания), «Вернуть» откатывает событие смены", async () => {
    h.get.mockImplementation(async (url: string) => ({ data: url.includes("/link-history") ? [history("link_type_changed", 77)] : [] }))
    mount()
    fireEvent.click(screen.getByRole("button", { name: "Бросает вызов" }))
    await waitFor(() => expect(h.toast).toHaveBeenCalled())
    expect(h.put.mock.calls[0][0]).toContain("to_type=worldview&to_id=11&link_type=challenges")
    expect(h.del).not.toHaveBeenCalled()
    expect(h.post).not.toHaveBeenCalled()
    const req = h.toast.mock.calls[0][0]
    expect(req.message).toBe(S["relations.typeChanged"])
    await req.undo.run()
    expect(h.post).toHaveBeenCalledWith("/api/v1/hypothesis/1/undo/77")
  })

  it("удаление связи: сообщение и «Вернуть» откатывают событие unlinked", async () => {
    h.get.mockImplementation(async (url: string) => ({ data: url.includes("/link-history") ? [history("unlinked", 78)] : [] }))
    mount()
    fireEvent.click(screen.getByRole("button", { name: S["relations.remove"] }))
    await waitFor(() => expect(h.toast).toHaveBeenCalled())
    expect(h.del.mock.calls[0][0]).toContain("to_type=worldview&to_id=11")
    const req = h.toast.mock.calls[0][0]
    expect(req.message).toBe(S["relations.removed"])
    await req.undo.run()
    expect(h.post).toHaveBeenCalledWith("/api/v1/hypothesis/1/undo/78")
  })
})
