import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { STRINGS } from "@/lib/i18n/strings"
import { RelationManager } from "@/components/entities/relation-manager"
import { ToastHost } from "@/components/ui/toast-host"
import { safeEntityHref } from "@/lib/entity-routes"

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), del: vi.fn(), put: vi.fn() }))
vi.mock("@/lib/api", () => ({ api: { get: h.get, post: h.post, delete: h.del, put: h.put } }))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string, p?: Record<string, string>) =>
    Object.entries(p ?? {}).reduce((a, [k, v]) => a.replace(`{${k}}`, v), (STRINGS as Record<string, string>)[key] ?? key) }
})
vi.mock("@/lib/i18n/useTypeRu", () => ({ useTypeRu: () => ({ hypothesis: "Гипотеза", observation: "Наблюдение" }) }))
vi.mock("@/lib/i18n/useDynamicT", () => ({ useDynamicTranslate: () => (s: string) => s }))
vi.mock("@/lib/i18n/useContentT", () => ({
  useContentT: () => ({ ct: (_t: string, _i: number, _f: string, x: string) => x, ensure: () => {} }),
  useTranslatedField: (_t: string, _i: number, _f: string, x: string) => x,
}))
vi.mock("@/lib/i18n/use-translated-query", () => ({
  useTranslatedRelated: () => ({
    isLoading: false,
    data: { related: {
      hypothesis: [{ id: 5, title: "Гипотеза А", link_type: "прогноз", stance: "подтверждает", source: "field", direct: true, capabilities: ["remove", "set_type"], lock: null, status: "идея" }],
      observation: [
        { id: 9, title: "Наблюдение Б", link_type: "связано", source: "link", direct: true, capabilities: ["remove", "set_type"], lock: null },
        { id: 10, title: "Наблюдение В", link_type: "связано", source: "link", direct: true, capabilities: [], lock: { code: "other_author" } },
      ],
    } },
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
  h.get.mockReset(); h.post.mockReset(); h.del.mockReset(); h.put.mockReset()
  h.get.mockResolvedValue({ data: [] }); h.post.mockResolvedValue({ data: { batch_id: "b1", applied: 2 } })
})
afterEach(cleanup)

const mount = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <><RelationManager entityType="prediction" entityId={1} /><ToastHost /></>
  </QueryClientProvider>)
const panel = () => within(screen.getByRole("region", { name: S["relations.batch.panel"] }))
const selectAll = () => fireEvent.click(screen.getByRole("checkbox", { name: S["relations.batch.selectAll"] }))

describe("меню смены типа у связи из поля прогноза", () => {
  it("только «Подтверждает» и «Опровергает»: «Связано» превращалось в «опровергает»", () => {
    mount()
    fireEvent.click(screen.getAllByRole("button", { name: S["relations.changeType"] })[0])
    expect(screen.getAllByRole("menuitemradio").map(b => b.textContent)).toEqual(["Подтверждает", "Опровергает"])
  })
})

describe("выбор связей", () => {
  it("чекбоксы видны сразу, без переключения режима; панели действий пока нет", () => {
    mount()
    expect(screen.queryByRole("button", { name: "Выбрать" })).toBeNull()
    expect(screen.getAllByRole("checkbox")).toHaveLength(4) // 3 связи + «выбрать все»
    expect(screen.queryByRole("region", { name: S["relations.batch.panel"] })).toBeNull()
  })
  it("панель появляется при выборе первой связи и исчезает, когда выбор снят; «выбрать все» показывает частичный выбор", () => {
    mount()
    fireEvent.click(screen.getByRole("checkbox", { name: /Наблюдение Б/ }))
    expect(screen.getByRole("region", { name: S["relations.batch.panel"] })).toBeTruthy()
    expect((screen.getByRole("checkbox", { name: S["relations.batch.selectAll"] }) as HTMLInputElement).indeterminate).toBe(true)
    fireEvent.click(screen.getByRole("checkbox", { name: /Наблюдение Б/ }))
    expect(screen.queryByRole("region", { name: S["relations.batch.panel"] })).toBeNull()
  })
  it("повторный клик по «выбрать все» снимает выбор", () => {
    mount(); selectAll()
    expect(screen.getByText("Выбрано 2 из 2")).toBeTruthy()
    selectAll()
    expect(screen.queryByRole("region", { name: S["relations.batch.panel"] })).toBeNull()
  })
  it("выбранная карточка помечена цветом типа связи", () => {
    mount()
    fireEvent.click(screen.getByRole("checkbox", { name: /Наблюдение Б/ }))
    expect(screen.getByRole("checkbox", { name: /Наблюдение Б/ }).closest("[data-selected]")?.getAttribute("data-selected")).toBe("true")
  })
  it("чужую связь выбрать нельзя, свои можно", () => {
    mount()
    expect(screen.getAllByRole("checkbox")).toHaveLength(4)
    expect((screen.getByRole("checkbox", { name: /Наблюдение В/ }) as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole("checkbox", { name: /Наблюдение Б/ }) as HTMLInputElement).disabled).toBe(false)
  })
  it("«Выбрать все доступные» берёт только доступные; «Удалить» шлёт один пакетный запрос, затем «Вернуть» откатывает пакет", async () => {
    mount(); selectAll()
    expect(screen.getByText("Выбрано 2 из 2")).toBeTruthy()
    fireEvent.click(panel().getByRole("button", { name: S["relations.batch.remove"] }))
    await waitFor(() => expect(h.post).toHaveBeenCalledTimes(1))
    expect(h.post.mock.calls[0][0]).toBe("/api/v1/prediction/1/links/batch")
    expect(h.post.mock.calls[0][1]).toEqual({ ops: [
      { op: "remove", other_type: "hypothesis", other_id: 5, source: "field" },
      { op: "remove", other_type: "observation", other_id: 9, source: "link" }] })
    expect(await screen.findByText("Изменено: 2")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: S["relations.undo"] }))
    await waitFor(() => expect(h.post).toHaveBeenCalledTimes(2))
    expect(h.post.mock.calls[1][0]).toBe("/api/v1/prediction/1/undo/batch/b1")
  })
  it("смена типа: «Связано» недоступно при связи из поля; итог с последствиями до применения", async () => {
    h.post.mockImplementation(async (url: string) => url.endsWith("/links/batch/preview")
      ? { data: { hypotheses: [{ hypothesis_id: 5, name: "Гипотеза А", before: 0.3, after: -0.3, level_before: 1, level_after: 0 }], pending_predictions: 1 } }
      : { data: { batch_id: "b1", applied: 2 } })
    mount(); selectAll()
    expect((panel().getByRole("button", { name: "Связано" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(panel().getByRole("button", { name: "Опровергает" }))
    expect(screen.getByText("Сменить тип у 2 на «Опровергает»")).toBeTruthy()
    expect(await screen.findByTestId("batch-impact")).toBeTruthy()
    expect(screen.getByText("0.30 → -0.30")).toBeTruthy()
    expect(screen.getByTestId("batch-impact-link").getAttribute("href")).toBe(safeEntityHref("hypothesis", 5))
    expect(screen.getByText(S["relations.batch.pending"].replace("{n}", "1"))).toBeTruthy()
    // до нажатия «Применить» ушёл только пробный запуск, сам пакет не применён
    expect(h.post.mock.calls.map(c => c[0])).toEqual(["/api/v1/prediction/1/links/batch/preview"])
    fireEvent.click(panel().getByRole("button", { name: S["relations.batch.apply"] }))
    await waitFor(() => expect(h.post).toHaveBeenCalledTimes(2))
    expect(h.post.mock.calls[1][0]).toBe("/api/v1/prediction/1/links/batch")
    expect(h.post.mock.calls[1][1]).toEqual({ ops: [
      { op: "set_type", other_type: "hypothesis", other_id: 5, source: "field", link_type: "опровергает" },
      { op: "set_type", other_type: "observation", other_id: 9, source: "link", link_type: "опровергает" }] })
  })
  it("отказ сервера (409): ничего не применено, причины по строкам", async () => {
    h.post.mockRejectedValue({ response: { status: 409, data: { detail: { code: "batch_rejected", errors: [{ index: 1, status: 404, message: "Связь не найдена" }] } } } })
    mount(); selectAll()
    fireEvent.click(panel().getByRole("button", { name: S["relations.batch.remove"] }))
    expect(await screen.findByText("Наблюдение Б: Связь не найдена")).toBeTruthy()
    expect(screen.getByText(S["relations.batch.rejected"])).toBeTruthy()
    expect(screen.queryByText(/Изменено:/)).toBeNull()
  })
})
