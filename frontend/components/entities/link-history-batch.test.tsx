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
const base = { created_at: "2026-10-17T10:00:00+00:00", actor_id: 1, other_type: "hypothesis", other_id: 5, link_type: "связано", old: null, new: null,
  reverted: false, reverts_event_id: null, undoable: true, blocked_code: null, batch_id: null }
const ev = (o: object) => ({ ...base, type: "unlinked", ...o })
beforeEach(() => { h.get.mockReset(); h.post.mockReset(); h.post.mockResolvedValue({ data: { reverted: 2 } }) })
afterEach(cleanup)
const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><LinkHistorySection entityType="observation" entityId={1} /></QueryClientProvider>)

describe("история связей: пакеты", () => {
  it("события одного пакета — одна строка; одиночное остаётся отдельной; раскрытие показывает связи", async () => {
    h.get.mockResolvedValue({ data: [ev({ id: 3, other_title: "А", batch_id: "b1" }), ev({ id: 2, other_title: "Б", batch_id: "b1" }), ev({ id: 1, other_title: "В", type: "linked" })] })
    mount()
    expect(await screen.findByText("Пакет: изменено связей — 2")).toBeTruthy()
    expect(screen.getAllByTestId("link-history-row")).toHaveLength(2)
    expect(screen.queryByText("Удалена связь с «А»")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /Показать связи/ }))
    expect(screen.getByText("Удалена связь с «А»")).toBeTruthy()
    expect(screen.getByText("Удалена связь с «Б»")).toBeTruthy()
  })
  it("«Откатить пакет» вызывает откат пакета одним запросом", async () => {
    h.get.mockResolvedValue({ data: [ev({ id: 3, other_title: "А", batch_id: "b1" }), ev({ id: 2, other_title: "Б", batch_id: "b1" })] })
    mount()
    fireEvent.click(await screen.findByRole("button", { name: "Откатить пакет" }))
    await waitFor(() => expect(h.post).toHaveBeenCalledTimes(1))
    expect(h.post).toHaveBeenCalledWith("/api/v1/observation/1/undo/batch/b1")
  })
  it("часть уже откатили по одному — кнопка остаётся; всё откатано — кнопки нет, есть «Откачено»", async () => {
    h.get.mockResolvedValue({ data: [ev({ id: 3, batch_id: "b1", reverted: true, undoable: false, blocked_code: "link_exists" }), ev({ id: 2, batch_id: "b1" })] })
    mount()
    expect(await screen.findByRole("button", { name: "Откатить пакет" })).toBeTruthy()
    cleanup()
    h.get.mockResolvedValue({ data: [ev({ id: 3, batch_id: "b1", reverted: true, undoable: false }), ev({ id: 2, batch_id: "b1", reverted: true, undoable: false })] })
    mount()
    expect(await screen.findByText("Откачено")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Откатить пакет" })).toBeNull()
  })
  it("одно из оставшихся событий заблокировано — кнопки нет, показана причина", async () => {
    h.get.mockResolvedValue({ data: [ev({ id: 3, batch_id: "b1" }), ev({ id: 2, batch_id: "b1", undoable: false, blocked_code: "endpoint_gone" })] })
    mount()
    expect(await screen.findByText(/одна из записей удалена/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Откатить пакет" })).toBeNull()
  })
  it("единственное событие с batch_id пакетом не считается", async () => {
    h.get.mockResolvedValue({ data: [ev({ id: 3, other_title: "А", batch_id: "b1" })] })
    mount()
    expect(await screen.findByText("Удалена связь с «А»")).toBeTruthy()
  })
})
