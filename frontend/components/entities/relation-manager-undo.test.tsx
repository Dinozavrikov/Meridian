import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { STRINGS } from "@/lib/i18n/strings"
import { RelationManager } from "@/components/entities/relation-manager"
import { ToastHost } from "@/components/ui/toast-host"

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), related: { current: {} as Record<string, unknown[]> } }))
vi.mock("@/lib/api", () => ({ api: { get: h.get, post: h.post, delete: vi.fn(), put: h.put } }))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
vi.mock("@/lib/i18n/useTypeRu", () => ({ useTypeRu: () => ({ question: "Вопрос", hypothesis: "Гипотеза" }) }))
vi.mock("@/lib/i18n/useDynamicT", () => ({ useDynamicTranslate: () => (s: string) => s }))
vi.mock("@/lib/i18n/useContentT", () => ({ useContentT: () => ({ ct: (_t: string, _i: number, _f: string, x: string) => x, ensure: () => {} }) }))
vi.mock("@/lib/i18n/use-translated-query", () => ({ useTranslatedRelated: () => ({ isLoading: false, data: { related: h.related.current } }) }))
vi.mock("@/components/entities/link-types", () => ({
  getLinkTypes: () => [
    { value: "подтверждает", label: "Подтверждает", color: "#2ECC71" },
    { value: "опровергает", label: "Опровергает", color: "#E74C3C" },
    { value: "связано", label: "Связано", color: "#4A90D9" },
  ],
}))
const S = STRINGS as Record<string, string>

beforeEach(() => {
  h.get.mockReset(); h.post.mockReset(); h.put.mockReset()
  h.put.mockResolvedValue({ data: {} }); h.post.mockResolvedValue({ data: {} })
})
afterEach(cleanup)

const history = (ev: object) => h.get.mockImplementation(async (url: string) => ({ data: url.includes("/link-history") ? [ev] : [] }))
const mount = (entityType: string, entityId: number) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><><RelationManager entityType={entityType} entityId={entityId} /><ToastHost /></></QueryClientProvider>)

describe("RelationManager: «Вернуть» после смены", () => {
  it("тип связи: тост, «Вернуть» откатывает именно событие смены у этой записи", async () => {
    h.related.current = { hypothesis: [{ id: 5, title: "Гипотеза Б", link_type: "связано", source: "link", direct: true, capabilities: ["remove", "set_type"], lock: null, status: "идея" }] }
    history({ id: 9, type: "link_type_changed", other_type: "hypothesis", other_id: 5, reverted: false, undoable: true })
    mount("observation", 1)
    fireEvent.click(screen.getAllByRole("button", { name: S["relations.changeType"] }).find(b => b.textContent?.includes("Связано"))!)
    fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitemradio", { name: "Подтверждает" }))
    await waitFor(() => expect(h.put).toHaveBeenCalled())
    expect(S["relations.typeChanged"]).toBeTruthy()
    expect(await screen.findByText(S["relations.typeChanged"])).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: S["toast.undo"] }))
    await waitFor(() => expect(h.post).toHaveBeenCalledWith("/api/v1/observation/1/undo/9"))
  })

  it("роль конкурента: тост, «Вернуть» откатывает competing_changed у этой записи", async () => {
    h.related.current = { question: [{ id: 5, title: "Вопрос А", link_type: "конкурирующая гипотеза", direct: true, source: "competing", role: "alternative", stance: "связано", capabilities: ["remove", "set_role"], lock: null }] }
    history({ id: 12, type: "competing_changed", other_type: "question", other_id: 5, reverted: false, undoable: true })
    mount("hypothesis", 29)
    fireEvent.click(screen.getByRole("button", { name: S["relations.roleChange"] }))
    fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitemradio", { name: S["relations.role.leading"] }))
    await waitFor(() => expect(h.put).toHaveBeenCalledWith("/api/v1/competing/question/5/29", { role: "leading" }))
    expect(S["relations.competingChanged"]).toBeTruthy()
    expect(await screen.findByText(S["relations.competingChanged"])).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: S["toast.undo"] }))
    await waitFor(() => expect(h.post).toHaveBeenCalledWith("/api/v1/hypothesis/29/undo/12"))
  })
})
