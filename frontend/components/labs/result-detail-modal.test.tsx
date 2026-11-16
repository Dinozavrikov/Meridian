import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { STRINGS } from "@/lib/i18n/strings"
import { cancelDelete, DELETE_DELAY_MS, DELETE_SAFETY_MS } from "@/lib/deferred-delete"
import { ResultDetailModal } from "@/components/labs/result-detail-modal"

const h = vi.hoisted(() => ({ get: vi.fn(), del: vi.fn(), toast: vi.fn(), user: { id: 1 } as { id: number } | null }))
vi.mock("@/lib/api", () => ({
  API_BASE_URL: "http://x", resolveHtmlImages: (s: string) => s,
  resultApi: { get: h.get, delete: h.del, listSuggestions: async () => [], listLinkedSources: async () => [],
    publish: vi.fn(), unpublish: vi.fn(), unlinkSource: vi.fn(), createSuggestion: vi.fn(), acceptSuggestion: vi.fn(), rejectSuggestion: vi.fn() },
}))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
vi.mock("@/lib/store", () => ({ useStore: (sel: (s: unknown) => unknown) => sel({ user: h.user }) }))
vi.mock("@/lib/ownership", () => ({ isOwner: (u: { id: number } | null, r: { user_id: number } | undefined) => !!u && !!r && r.user_id === u.id }))
vi.mock("@/lib/i18n/useContentT", () => ({ useTranslatedField: (_t: string, _i: number, _f: string, text: string) => text }))
vi.mock("@/lib/sanitize-html", () => ({ sanitizeHtml: (s: string) => s }))
vi.mock("@/components/entities/rich-html", () => ({ RichHtml: () => null }))
vi.mock("@/components/entities/rich-text-editor", () => ({ RichTextEditor: () => null }))
vi.mock("@/components/labs/result-source-picker", () => ({ ResultSourcePicker: () => null }))
vi.mock("@/components/ui/modal", () => ({ Modal: ({ open, title, children }: any) => open ? <div><h2>{title}</h2>{children}</div> : null }))
vi.mock("@/components/ui/button", () => ({ Button: ({ children, onClick, disabled }: any) => <button type="button" onClick={onClick} disabled={disabled}>{children}</button> }))
vi.mock("@/lib/toast", async () => ({ ...(await vi.importActual<typeof import("@/lib/toast")>("@/lib/toast")), toast: h.toast }))

const S = STRINGS as Record<string, string>
const R = (over: object = {}) => ({ id: 5, user_id: 1, lab_id: 3, title: "Черновик Т", body: "b", visibility: "private", is_published: false, ...over })
let qc: QueryClient

function mount(res: object) {
  h.get.mockResolvedValue(res)
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  qc.setQueryData(["results", "lab", 3], [{ id: 5 }, { id: 6 }])
  const onClose = vi.fn()
  render(<QueryClientProvider client={qc}><ResultDetailModal resultId={5} onClose={onClose} canManage={false} isMember={false} labIsPublic={false} /></QueryClientProvider>)
  return onClose
}
const deleteButton = () => screen.findByRole("button", { name: S["results.delete"] })

beforeEach(() => { h.get.mockReset(); h.del.mockReset(); h.del.mockResolvedValue(undefined); h.toast.mockReset(); h.user = { id: 1 } })
afterEach(() => { vi.useRealTimers(); cancelDelete("result:5"); cleanup() })

describe("удаление личного черновика результата с «Вернуть»", () => {
  it("тексты заведены в словаре", () => {
    for (const k of ["results.delete", "results.deleted", "results.deleteFailed"]) expect(S[k]).toBeTruthy()
  })

  it("нажатие: окно закрыто, черновик убран из списка, DELETE уходит один раз и только когда тост закрылся", async () => {
    const onClose = mount(R())
    const btn = await deleteButton()
    vi.useFakeTimers()
    fireEvent.click(btn)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ message: S["results.deleted"] }))
    expect(qc.getQueryData(["results", "lab", 3])).toEqual([{ id: 6 }])
    expect(h.del).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(DELETE_DELAY_MS * 2)
    expect(h.del).not.toHaveBeenCalled()                      // тост ещё на экране (например, под мышью): удаления нет
    h.toast.mock.calls[0][0].onClose("closed")
    await vi.advanceTimersByTimeAsync(0)
    expect(h.del).toHaveBeenCalledTimes(1)
    expect(h.del).toHaveBeenCalledWith(5)
  })

  it("«Вернуть» до конца окна: DELETE не уходит никогда", async () => {
    mount(R())
    const btn = await deleteButton()
    vi.useFakeTimers()
    fireEvent.click(btn)
    await h.toast.mock.calls[0][0].undo.run()
    h.toast.mock.calls[0][0].onClose("undone")
    await vi.advanceTimersByTimeAsync(DELETE_SAFETY_MS * 2)
    expect(h.del).not.toHaveBeenCalled()
  })

  it("«Вернуть» после того, как DELETE ушёл: откат честно не удаётся", async () => {
    mount(R())
    const btn = await deleteButton()
    vi.useFakeTimers()
    fireEvent.click(btn)
    h.toast.mock.calls[0][0].onClose("closed")
    await vi.advanceTimersByTimeAsync(0)
    expect(h.del).toHaveBeenCalledTimes(1)
    await expect(h.toast.mock.calls[0][0].undo.run()).rejects.toThrow()
  })

  it("результат с видимостью lab: кнопки нет", async () => {
    mount(R({ visibility: "lab" }))
    await screen.findByText("Черновик Т")
    expect(screen.queryByRole("button", { name: S["results.delete"] })).toBeNull()
  })

  it("не владелец: кнопки нет даже у private", async () => {
    h.user = { id: 2 }
    mount(R())
    await screen.findByText("Черновик Т")
    expect(screen.queryByRole("button", { name: S["results.delete"] })).toBeNull()
  })
})

describe("удаление черновика: уход со страницы, сбой, перечитывание списка", () => {
  it("pagehide в окне: уходит DELETE с keepalive и куками, а axios-вызова нет", async () => {
    const f = vi.fn(async () => ({}))
    vi.stubGlobal("fetch", f)
    try {
      mount(R())
      const btn = await deleteButton()
      vi.useFakeTimers()
      fireEvent.click(btn)
      window.dispatchEvent(new Event("pagehide"))
      expect(f).toHaveBeenCalledTimes(1)
      expect(f).toHaveBeenCalledWith("http://x/api/v1/results/5", expect.objectContaining({ method: "DELETE", keepalive: true, credentials: "include" }))
      await vi.advanceTimersByTimeAsync(DELETE_DELAY_MS * 2)
      expect(h.del).not.toHaveBeenCalled()
    } finally { vi.unstubAllGlobals() }
  })

  it("DELETE упал: тост об ошибке и список перечитывается", async () => {
    h.del.mockRejectedValue(new Error("boom"))
    mount(R())
    const btn = await deleteButton()
    const inv = vi.spyOn(qc, "invalidateQueries")
    vi.useFakeTimers()
    fireEvent.click(btn)
    h.toast.mock.calls[0][0].onClose("closed")
    await vi.advanceTimersByTimeAsync(0)
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ message: S["results.deleteFailed"], tone: "error" }))
    expect(inv).toHaveBeenCalledWith({ queryKey: ["results", "lab"] })
  })

  it("«Вернуть»: список перечитывается, чтобы черновик вернулся", async () => {
    mount(R())
    const btn = await deleteButton()
    const inv = vi.spyOn(qc, "invalidateQueries")
    vi.useFakeTimers()
    fireEvent.click(btn)
    await h.toast.mock.calls[0][0].undo.run()
    expect(inv).toHaveBeenCalledWith({ queryKey: ["results", "lab"] })
  })
})

describe("удаление черновика: страховка и счётчик карточки", () => {
  it("тост потерян (onClose не пришёл): страховка выполняет удаление через DELETE_SAFETY_MS", async () => {
    mount(R())
    const btn = await deleteButton()
    vi.useFakeTimers()
    fireEvent.click(btn)
    await vi.advanceTimersByTimeAsync(DELETE_SAFETY_MS - 1)
    expect(h.del).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(h.del).toHaveBeenCalledTimes(1)
  })

  it("после удаления счётчик в карточке лаборатории перечитывается (не раньше)", async () => {
    mount(R())
    qc.setQueryData(["lab", "my-slug"], { id: 3, results_count: 2 })
    const btn = await deleteButton()
    vi.useFakeTimers()
    fireEvent.click(btn)
    expect(qc.getQueryState(["lab", "my-slug"])?.isInvalidated).toBe(false)
    h.toast.mock.calls[0][0].onClose("closed")
    await vi.advanceTimersByTimeAsync(0)
    expect(qc.getQueryState(["lab", "my-slug"])?.isInvalidated).toBe(true)
  })
})
