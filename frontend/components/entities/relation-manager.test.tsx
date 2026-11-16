import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { STRINGS } from "@/lib/i18n/strings"
import { RelationManager } from "@/components/entities/relation-manager"
import { ToastHost } from "@/components/ui/toast-host"

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), del: vi.fn(), put: vi.fn() }))
vi.mock("@/lib/api", () => ({ api: { get: h.get, post: h.post, delete: h.del, put: h.put } }))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
vi.mock("@/lib/i18n/useTypeRu", () => ({ useTypeRu: () => ({ hypothesis: "Гипотеза", observation: "Наблюдение" }) }))
vi.mock("@/lib/i18n/useDynamicT", () => ({ useDynamicTranslate: () => (s: string) => s }))
vi.mock("@/lib/i18n/useContentT", () => ({ useContentT: () => ({ ct: (_t: string, _i: number, _f: string, x: string) => x, ensure: () => {} }) }))
vi.mock("@/lib/i18n/use-translated-query", () => ({
  useTranslatedRelated: () => ({
    isLoading: false,
    data: { related: { hypothesis: [{ id: 5, title: "Гипотеза А", link_type: "подтверждает", status: "идея" }] } },
  }),
}))
vi.mock("@/components/entities/link-types", () => ({
  getLinkTypes: () => [
    { value: "подтверждает", label: "Подтверждает", color: "#2ECC71" },
    { value: "опровергает", label: "Опровергает", color: "#E74C3C" },
    { value: "связано", label: "Связано", color: "#4A90D9" },
  ],
}))
const S = STRINGS as Record<string, string>

beforeEach(() => {
  h.get.mockReset(); h.post.mockReset(); h.del.mockReset(); h.put.mockReset(); h.put.mockResolvedValue({ data: {} })
  h.get.mockResolvedValue({ data: [{ type: "observation", id: 9, title: "Наблюдение Б" }] })
  h.post.mockResolvedValue({ data: {} }); h.del.mockResolvedValue({ data: {} })
})
afterEach(cleanup)

const mount = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <><RelationManager entityType="prediction" entityId={1} /><ToastHost /></>
  </QueryClientProvider>,
)

describe("RelationManager", () => {
  it("карточка связи — ссылка на запись", () => {
    mount()
    expect(screen.getByRole("link", { name: /Гипотеза А/ }).getAttribute("href")).toBe("/hypotheses?id=5&tab=detail")
  })

  it("удаление: «Вернуть» откатывает событие unlinked платформенным откатом", async () => {
    h.get.mockImplementation((url: string) => url.includes("link-history")
      ? Promise.resolve({ data: [{ id: 42, type: "unlinked", other_type: "hypothesis", other_id: 5, reverted: false, undoable: true }] })
      : Promise.resolve({ data: [{ type: "observation", id: 9, title: "Наблюдение Б" }] }))
    mount()
    fireEvent.click(screen.getByRole("button", { name: S["relations.remove"] }))
    await waitFor(() => expect(h.del).toHaveBeenCalledTimes(1))
    expect(h.del.mock.calls[0][0]).toContain("to_type=hypothesis&to_id=5")
    fireEvent.click(await screen.findByRole("button", { name: S["relations.undo"] }))
    await waitFor(() => expect(h.post).toHaveBeenCalledTimes(1))
    expect(h.post.mock.calls[0][0]).toBe("/api/v1/prediction/1/undo/42")
  })

  it("без события отката кнопки «Вернуть» нет, но удаление подтверждено", async () => {
    h.get.mockResolvedValue({ data: [] })
    mount()
    fireEvent.click(screen.getByRole("button", { name: S["relations.remove"] }))
    await screen.findByText(new RegExp(S["relations.removed"]))
    expect(screen.queryByRole("button", { name: S["relations.undo"] })).toBeNull()
  })

  it("поиск и добавление без окна: выбранный результат создаёт связь с выбранным типом", async () => {
    mount()
    fireEvent.click(screen.getByRole("button", { name: "Опровергает" }))
    fireEvent.change(screen.getByPlaceholderText(S["relations.searchPlaceholder"]), { target: { value: "набл" } })
    fireEvent.click(await screen.findByRole("button", { name: /Наблюдение Б/ }))
    await waitFor(() => expect(h.post).toHaveBeenCalledTimes(1))
    expect(h.post.mock.calls[0][0]).toContain("to_type=observation&to_id=9")
    expect(h.post.mock.calls[0][0]).toContain(`link_type=${encodeURIComponent("опровергает")}`)
  })
})

describe("RelationManager: смена типа связи", () => {
  it("чип открывает меню, выбор вызывает PUT с новым типом и закрывает меню", async () => {
    mount()
    fireEvent.click(screen.getByRole("button", { name: S["relations.changeType"] }))
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitemradio", { name: "Опровергает" }))
    await waitFor(() => expect(h.put).toHaveBeenCalledTimes(1))
    expect(h.put.mock.calls[0][0]).toContain("to_type=hypothesis&to_id=5")
    expect(h.put.mock.calls[0][0]).toContain(`link_type=${encodeURIComponent("опровергает")}`)
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
  })

  it("выбор текущего типа запрос не отправляет", () => {
    mount()
    fireEvent.click(screen.getByRole("button", { name: S["relations.changeType"] }))
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitemradio", { name: "Подтверждает" }))
    expect(h.put).not.toHaveBeenCalled()
  })
})

describe("RelationManager: честное удаление", () => {
  it("сервер вернул removed:0 — ошибка, а не «Связь удалена» и не «Вернуть»", async () => {
    h.del.mockResolvedValue({ data: { ok: true, removed: 0 } })
    mount()
    fireEvent.click(screen.getByRole("button", { name: S["relations.remove"] }))
    expect((await screen.findByRole("alert")).textContent).toContain(S["relations.actionFailed"])
    expect(screen.queryByRole("button", { name: S["relations.undo"] })).toBeNull()
  })
})

describe("RelationManager: layout", () => {
  it("ссылка связи имеет flexWrap для предотвращения наложения статуса", () => {
    mount()
    const link = screen.getByRole("link", { name: /Гипотеза А/ })
    expect(link.style.flexWrap).toBe("wrap")
  })
})
