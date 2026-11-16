import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { STRINGS } from "@/lib/i18n/strings"
import { LinkExistingModal } from "@/components/entities/link-existing-modal"

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), toast: vi.fn() }))
vi.mock("@/lib/api", () => ({ api: { get: h.get, post: h.post } }))
vi.mock("@/lib/toast", () => ({ toast: h.toast }))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
vi.mock("@/lib/i18n/useTypeRu", () => ({ useTypeRu: () => ({ observation: "Наблюдение" }) }))
vi.mock("@/lib/i18n/useContentT", () => ({ useContentT: () => ({ ct: (_t: string, _i: number, _f: string, x: string) => x, ensure: () => {} }) }))

const S = STRINGS as Record<string, string>
const TYPES = [{ value: "связано", label: "Связано", color: "#4A90D9" }]
const FOUND = [{ type: "observation", id: 77, title: "Новое наблюдение", is_own: true }]
const HISTORY = [{ id: 501, type: "linked", other_type: "observation", other_id: 77, reverted: false, undoable: true }]

function mockApi(history: unknown[]) {
  h.get.mockImplementation(async (url: string) => {
    if (url.includes("/graph/search")) return { data: FOUND }
    if (url.includes("/link-history")) return { data: history }
    return { data: [] }
  })
}
beforeEach(() => { h.get.mockReset(); h.post.mockReset(); h.toast.mockReset(); h.post.mockResolvedValue({ data: {} }) })
afterEach(cleanup)

async function pick() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidate = vi.spyOn(qc, "invalidateQueries")
  const onClose = vi.fn()
  render(<QueryClientProvider client={qc}>
    <LinkExistingModal entityType="hypothesis" entityId={1} onlyType="observation" linkTypes={TYPES} defaultLinkType="связано" onClose={onClose} />
  </QueryClientProvider>)
  fireEvent.change(screen.getByPlaceholderText(S["relations.searchPlaceholder"]), { target: { value: "н" } })
  fireEvent.click(await screen.findByText("Новое наблюдение"))
  await waitFor(() => expect(h.toast).toHaveBeenCalled())
  return { onClose, invalidate }
}

describe("LinkExistingModal: «Вернуть» после привязки", () => {
  it("окно закрывается, а уведомление с «Вернуть» откатывает именно эту связь и обновляет данные", async () => {
    mockApi(HISTORY)
    const { onClose, invalidate } = await pick()
    expect(h.post.mock.calls[0][0]).toContain("from_type=hypothesis&from_id=1&to_type=observation&to_id=77&link_type=")
    expect(onClose).toHaveBeenCalled()
    const req = h.toast.mock.calls[0][0]
    expect(req.message).toBe(S["relations.added"])
    invalidate.mockClear()
    await req.undo.run()
    expect(h.post).toHaveBeenLastCalledWith("/api/v1/hypothesis/1/undo/501")
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["related", "hypothesis", 1] })
  })

  it("события добавления в истории нет: окно закрывается, сообщение есть, «Вернуть» нет", async () => {
    mockApi([])
    const { onClose } = await pick()
    expect(onClose).toHaveBeenCalled()
    expect(h.toast.mock.calls[0][0].undo).toBeUndefined()
  })
})
