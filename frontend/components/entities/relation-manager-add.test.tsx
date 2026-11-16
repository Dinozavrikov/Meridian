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
      hypothesis: [{ id: 5, title: "Гипотеза А", link_type: "связано", source: "link", direct: true, capabilities: ["remove", "set_type"], lock: null, status: "идея" }],
      observation: [{ id: 9, title: "Наблюдение Б", link_type: "связано", source: "link", direct: true, capabilities: ["remove", "set_type"], lock: null }],
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

const FOUND = [
  { type: "hypothesis", id: 8, title: "Другая гипотеза", is_own: true },
  { type: "observation", id: 77, title: "Новое наблюдение", is_own: true },
]
const HISTORY = [{ id: 501, type: "linked", other_type: "observation", other_id: 77, reverted: false, undoable: true }]

function mockApi(history: unknown[]) {
  h.get.mockImplementation(async (url: string) => {
    if (url.includes("/graph/search")) return { data: FOUND }
    if (url.includes("/link-history")) return { data: history }
    return { data: [] }
  })
}
beforeEach(() => { h.get.mockReset(); h.post.mockReset(); h.del.mockReset(); h.put.mockReset(); h.post.mockResolvedValue({ data: {} }) })
afterEach(cleanup)

async function openSearch() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={qc}><><RelationManager entityType="hypothesis" entityId={1} /><ToastHost /></></QueryClientProvider>)
  fireEvent.change(screen.getByLabelText(S["relations.searchPlaceholder"]), { target: { value: "н" } })
  await screen.findByText("Новое наблюдение")
}
// первая группа с этой подписью — выбор типа для добавления; ниже идут фильтр и пакетные кнопки с теми же названиями
const addChip = (label: string) => within(screen.getAllByRole("group", { name: S["relations.linkTypeLabel"] })[0]).getByRole("button", { name: label })
const undoButton = () => screen.queryByRole("button", { name: new RegExp(S["relations.undo"]) })

describe("RelationManager: добавление связи", () => {
  it("после добавления есть «Вернуть», и он откатывает именно событие этого добавления", async () => {
    mockApi(HISTORY)
    await openSearch()
    fireEvent.click(screen.getByText("Новое наблюдение"))
    await screen.findByRole("status")
    expect(h.post.mock.calls[0][0]).toContain("from_type=hypothesis&from_id=1&to_type=observation&to_id=77")
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(S["relations.undo"]) }))
    await waitFor(() => expect(h.post).toHaveBeenCalledWith("/api/v1/hypothesis/1/undo/501"))
  })

  it("если события добавления в истории нет, «Добавлено» остаётся, а «Вернуть» не показывается", async () => {
    mockApi([])
    await openSearch()
    fireEvent.click(screen.getByText("Новое наблюдение"))
    await screen.findByRole("status")
    expect(undoButton()).toBeNull()
  })
})

describe("RelationManager: записи одного типа", () => {
  it("при «подтверждает» гипотезы из поиска скрыты и есть подсказка, наблюдения остаются; «связано» возвращает всё", async () => {
    mockApi(HISTORY)
    await openSearch()
    expect(screen.getByText("Другая гипотеза")).toBeTruthy()
    fireEvent.click(addChip("Подтверждает"))
    expect(screen.queryByText("Другая гипотеза")).toBeNull()
    expect(screen.getByText(S["relations.sameTypeHidden"])).toBeTruthy()
    expect(screen.getByText("Новое наблюдение")).toBeTruthy()
    fireEvent.click(addChip("Связано"))
    expect(screen.getByText("Другая гипотеза")).toBeTruthy()
    expect(screen.queryByText(S["relations.sameTypeHidden"])).toBeNull()
  })
})
