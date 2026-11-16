import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { STRINGS } from "@/lib/i18n/strings"
import { useRemoveLinkWithUndo } from "@/lib/use-remove-link"

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), del: vi.fn(), toast: vi.fn() }))
vi.mock("@/lib/api", () => ({ api: { get: h.get, post: h.post, delete: h.del } }))
vi.mock("@/lib/toast", () => ({ toast: h.toast }))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
const S = STRINGS as Record<string, string>
const wrapper = ({ children }: { children: ReactNode }) =>
  <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>{children}</QueryClientProvider>

beforeEach(() => {
  h.get.mockReset(); h.post.mockReset(); h.del.mockReset(); h.toast.mockReset()
  h.del.mockResolvedValue({ data: {} }); h.post.mockResolvedValue({ data: {} })
})

describe("useRemoveLinkWithUndo", () => {
  it("удаляет связь и даёт «Вернуть», откатывающее событие unlinked именно этой пары", async () => {
    h.get.mockResolvedValue({ data: [
      { id: 70, type: "unlinked", other_type: "hypothesis", other_id: 99, reverted: false, undoable: true },
      { id: 71, type: "unlinked", other_type: "hypothesis", other_id: 5, reverted: false, undoable: true },
    ] })
    const { result } = renderHook(() => useRemoveLinkWithUndo("observation", 1), { wrapper })
    await act(async () => { await result.current.mutateAsync({ toType: "hypothesis", toId: 5 }) })
    expect(h.del.mock.calls[0][0]).toContain("from_type=observation&from_id=1&to_type=hypothesis&to_id=5")
    const req = h.toast.mock.calls[0][0]
    expect(req.message).toBe(S["relations.removed"])
    await act(async () => { await req.undo.run() })
    expect(h.post).toHaveBeenCalledWith("/api/v1/observation/1/undo/71")
  })
  it("события не нашлось: только сообщение, без «Вернуть»", async () => {
    h.get.mockResolvedValue({ data: [] })
    const { result } = renderHook(() => useRemoveLinkWithUndo("observation", 1), { wrapper })
    await act(async () => { await result.current.mutateAsync({ toType: "hypothesis", toId: 5 }) })
    expect(h.toast.mock.calls[0][0].undo).toBeUndefined()
  })
  it("удаление провалилось: тоста нет", async () => {
    h.del.mockRejectedValue(new Error("boom"))
    const { result } = renderHook(() => useRemoveLinkWithUndo("observation", 1), { wrapper })
    await act(async () => { await result.current.mutateAsync({ toType: "hypothesis", toId: 5 }).catch(() => {}) })
    expect(h.toast).not.toHaveBeenCalled()
  })
})
