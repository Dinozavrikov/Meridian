import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { STRINGS } from "@/lib/i18n/strings"

const m = vi.hoisted(() => ({ del: vi.fn(), post: vi.fn() }))
vi.mock("@/lib/api", () => ({ api: { delete: m.del, post: m.post, get: vi.fn(), put: vi.fn() } }))
import { SharedWithRow } from "@/components/entities/shared-with-row"

const sw = { share_id: 5, lab_id: 1, lab_name: "Лаба", entity_type: "observation", entity_id: 9 }
beforeEach(() => { m.del.mockReset().mockResolvedValue({ data: { ok: true, event_id: 77 } }) })

describe("SharedWithRow: «Вернуть» переживает перечитывание данных", () => {
  it("после закрытия сервер отдаёт пустой shared_with, а «Вернуть» остаётся", async () => {
    const qc = new QueryClient()
    const ui = (items: any[]) => <QueryClientProvider client={qc}><SharedWithRow items={items} /></QueryClientProvider>
    const { rerender } = render(ui([sw]))
    fireEvent.click(screen.getByText(STRINGS["shares.closeShort"]))
    expect(await screen.findByText(STRINGS["shares.restore"])).toBeTruthy()
    rerender(ui([]))
    expect(screen.getByText(STRINGS["shares.restore"])).toBeTruthy()
    expect(screen.getByTestId("shared-closed")).toBeTruthy()
  })
})
