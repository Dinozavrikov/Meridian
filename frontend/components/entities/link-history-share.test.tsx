import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { STRINGS } from "@/lib/i18n/strings"

const item = (over: object) => ({ id: 1, created_at: "2026-10-26T10:00:00Z", actor_id: 1, type: "share_closed", other_type: "observation", other_id: 2,
  other_title: "R", link_type: null, old: null, new: null, undoable: true, blocked_code: null, reverted: false, reverts_event_id: null, ...over })
const m = vi.hoisted(() => ({ list: vi.fn() }))
vi.mock("@/lib/entity-history-api", async orig => ({ ...(await orig<object>()), entityHistoryApi: { linkList: m.list, undo: vi.fn(), undoBatch: vi.fn() } }))
import { LinkHistorySection } from "@/components/entities/link-history-section"

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><LinkHistorySection entityType="observation" entityId={9} /></QueryClientProvider>)
}

describe("история связей: события доступа", () => {
  it("share_closed и share_opened рисуются со своими подписями", async () => {
    m.list.mockResolvedValue([item({ id: 2, type: "share_opened", reverts_event_id: 1 }), item({ id: 1 })])
    mount()
    expect(await screen.findByText(/Закрыт доступ участникам через связь с «R»/)).toBeTruthy()
    expect(screen.getByText(/Возвращён доступ участникам через связь с «R»/)).toBeTruthy()
  })
  it("блокировка отката доступа говорит про доступ, а не про тип связи", async () => {
    m.list.mockResolvedValue([item({ undoable: false, blocked_code: "link_changed" })])
    mount()
    expect(await screen.findByText(STRINGS["history.blocked.share.link_changed"])).toBeTruthy()
    expect(screen.queryByText(STRINGS["history.blocked.link_changed"])).toBeNull()
  })
})
