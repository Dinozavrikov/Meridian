import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { LinkHistorySection } from "@/components/entities/link-history-section"

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock("@/lib/api", () => ({ api: { get: h.get, post: h.post } }))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string, p?: Record<string, string>) =>
    Object.entries(p ?? {}).reduce((acc, [k, v]) => acc.replace(`{${k}}`, v), (STRINGS as Record<string, string>)[key] ?? key) }
})
const base = { created_at: "2026-10-17T10:00:00+00:00", actor_id: 1, other_type: "hypothesis", other_id: 5, other_title: "Гипотеза А", link_type: "подтверждает", old: null, new: null, reverted: false, reverts_event_id: null }
beforeEach(() => { h.get.mockReset(); h.post.mockReset(); h.post.mockResolvedValue({ data: { fields: [] } }) })
afterEach(cleanup)
const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><LinkHistorySection entityType="observation" entityId={1} /></QueryClientProvider>)

describe("LinkHistorySection", () => {
  it("удалённая связь: описание, кнопка «Откатить» вызывает откат этого события", async () => {
    h.get.mockResolvedValue({ data: [{ ...base, id: 7, type: "unlinked", undoable: true, blocked_code: null }] })
    mount()
    expect(await screen.findByText("Удалена связь с «Гипотеза А»")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /Откатить/ }))
    await waitFor(() => expect(h.post).toHaveBeenCalledWith("/api/v1/observation/1/undo/7"))
  })

  it("нельзя откатить: вместо кнопки причина", async () => {
    h.get.mockResolvedValue({ data: [{ ...base, id: 8, type: "linked", undoable: false, blocked_code: "link_missing" }] })
    mount()
    expect(await screen.findByText(/связи уже нет/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Откатить/ })).toBeNull()
  })

  it("смена типа показывает старый и новый тип; пустая история — раздела нет", async () => {
    h.get.mockResolvedValue({ data: [{ ...base, id: 9, type: "link_type_changed", old: "связано", new: "опровергает", undoable: true, blocked_code: null }] })
    mount()
    expect(await screen.findByText(/связано → опровергает/)).toBeTruthy()
    cleanup()
    h.get.mockResolvedValue({ data: [] })
    const { container } = mount()
    await waitFor(() => expect(h.get).toHaveBeenCalledTimes(2))
    expect(container.querySelector("section")).toBeNull()
  })
})
