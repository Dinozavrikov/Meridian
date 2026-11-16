import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { STRINGS } from "@/lib/i18n/strings"

const m = vi.hoisted(() => ({ del: vi.fn(), post: vi.fn() }))
vi.mock("@/lib/api", () => ({ api: { delete: m.del, post: m.post, get: vi.fn(), put: vi.fn() } }))
import { SharedWithRow } from "@/components/entities/shared-with-row"

const sw = { share_id: 5, lab_id: 1, lab_name: "Лаба", entity_type: "observation", entity_id: 9 }
const S = (k: string) => STRINGS[k]
function mount(items: any[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><SharedWithRow items={items} /></QueryClientProvider>)
}
beforeEach(() => {
  m.del.mockReset().mockResolvedValue({ data: { ok: true, event_id: 77 } })
  m.post.mockReset().mockResolvedValue({ data: { reverted_event_id: 77, fields: [] } })
})

describe("SharedWithRow", () => {
  it("без shared_with ничего не рисует", () => {
    mount([])
    expect(screen.queryByTestId("shared-with")).toBeNull()
  })
  it("показывает лабораторию; «Закрыть доступ» бьёт в DELETE записи-владельца и даёт «Вернуть»", async () => {
    mount([sw])
    expect(screen.getByText(/Лаба/)).toBeTruthy()
    fireEvent.click(screen.getByText(S("shares.closeShort")))
    expect(await screen.findByText(S("shares.restore"))).toBeTruthy()
    expect(m.del).toHaveBeenCalledWith("/api/v1/observation/9/shares/5")
    expect(screen.queryByTestId("shared-with")).toBeNull()
  })
  it("«Вернуть» откатывает событие закрытия", async () => {
    mount([sw])
    fireEvent.click(screen.getByText(S("shares.closeShort")))
    fireEvent.click(await screen.findByText(S("shares.restore")))
    await vi.waitFor(() => expect(m.post).toHaveBeenCalledWith("/api/v1/observation/9/undo/77"))
  })
})
