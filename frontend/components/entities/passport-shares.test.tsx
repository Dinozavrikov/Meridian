import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { STRINGS } from "@/lib/i18n/strings"

const m = vi.hoisted(() => ({ get: vi.fn(), del: vi.fn(), post: vi.fn() }))
vi.mock("@/lib/api", () => ({ api: { get: m.get, delete: m.del, post: m.post, put: vi.fn() } }))
import { PassportShares } from "@/components/entities/passport-shares"

const row = { id: 5, lab_id: 1, lab_name: "Лаба", via_type: "observation", via_id: 2, via_title: "Соседняя" }
const S = (k: string) => STRINGS[k]
function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><PassportShares entityType="observation" entityId={9} enabled /></QueryClientProvider>)
}
beforeEach(() => {
  m.get.mockReset().mockResolvedValue({ data: [row] })
  m.del.mockReset().mockResolvedValue({ data: { ok: true, event_id: 77 } })
  m.post.mockReset().mockResolvedValue({ data: { reverted_event_id: 77, fields: [] } })
})

describe("PassportShares", () => {
  it("показывает лабораторию и связь, через которую открыта запись", async () => {
    mount()
    expect(await screen.findByText(/Лаба/)).toBeTruthy()
    expect(screen.getByText(/Соседняя/)).toBeTruthy()
    expect(m.get).toHaveBeenCalledWith("/api/v1/observation/9/shares")
  })
  it("пустой список: панели нет", async () => {
    m.get.mockResolvedValue({ data: [] })
    mount()
    await vi.waitFor(() => expect(m.get).toHaveBeenCalled())
    expect(screen.queryByTestId("share-row")).toBeNull()
    expect(screen.queryByText(S("shares.title"))).toBeNull()
  })
  it("«Закрыть доступ» зовёт DELETE и показывает «Вернуть»", async () => {
    mount()
    fireEvent.click(await screen.findByText(S("shares.close")))
    expect(await screen.findByText(S("shares.restore"))).toBeTruthy()
    expect(m.del).toHaveBeenCalledWith("/api/v1/observation/9/shares/5")
    expect(screen.queryByText(S("shares.close"))).toBeNull()
  })
  it("«Вернуть» откатывает событие закрытия", async () => {
    mount()
    fireEvent.click(await screen.findByText(S("shares.close")))
    fireEvent.click(await screen.findByText(S("shares.restore")))
    await vi.waitFor(() => expect(m.post).toHaveBeenCalledWith("/api/v1/observation/9/undo/77"))
  })
  it("ошибка закрытия: сообщение, строка остаётся открытой", async () => {
    m.del.mockRejectedValue(new Error("boom"))
    mount()
    fireEvent.click(await screen.findByText(S("shares.close")))
    expect(await screen.findByText(S("shares.failed"))).toBeTruthy()
    expect(screen.getByText(S("shares.close"))).toBeTruthy()
  })
})
