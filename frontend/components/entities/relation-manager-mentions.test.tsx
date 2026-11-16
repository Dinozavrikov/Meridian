import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { STRINGS } from "@/lib/i18n/strings"
import { RelationManager } from "@/components/entities/relation-manager"

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), toast: vi.fn(), data: { current: null as any } }))
vi.mock("@/lib/api", () => ({ api: { get: h.get, post: h.post, delete: vi.fn(), put: vi.fn() } }))
vi.mock("@/lib/toast", () => ({ toast: h.toast }))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string, p?: Record<string, string>) =>
    Object.entries(p ?? {}).reduce((a, [k, v]) => a.replace(`{${k}}`, v), (STRINGS as Record<string, string>)[key] ?? key) }
})
vi.mock("@/lib/i18n/useTypeRu", () => ({ useTypeRu: () => ({ hypothesis: "Гипотеза", observation: "Наблюдение", question: "Вопрос" }) }))
vi.mock("@/lib/i18n/useDynamicT", () => ({ useDynamicTranslate: () => (s: string) => s }))
vi.mock("@/lib/i18n/useContentT", () => ({
  useContentT: () => ({ ct: (_t: string, _i: number, _f: string, x: string) => x, ensure: () => {} }),
  useTranslatedField: (_t: string, _i: number, _f: string, x: string) => x,
}))
vi.mock("@/lib/i18n/use-translated-query", () => ({ useTranslatedRelated: () => ({ isLoading: false, data: h.data.current }) }))

const S = STRINGS as Record<string, string>
const WITH = { related: {}, mentions: {
  mentions: [{ id: 7, type: "observation", title: "Наблюдение М", fields: ["text"], is_own: true }],
  mentioned_in: [{ id: 8, type: "question", title: "Вопрос Н", fields: ["text"], is_own: true }],
} }

beforeEach(() => {
  h.get.mockReset(); h.post.mockReset(); h.toast.mockReset()
  h.get.mockResolvedValue({ data: [{ id: 55, type: "linked", other_type: "observation", other_id: 7, reverted: false, undoable: true }] })
  h.post.mockResolvedValue({ data: {} })
  h.data.current = WITH
})
afterEach(cleanup)
function mount() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    <RelationManager entityType="hypothesis" entityId={1} /></QueryClientProvider>)
}

describe("RelationManager: упоминания в тексте", () => {
  it("две группы «Упоминает» и «Упомянуто в» с записями", () => {
    mount()
    expect(screen.getByText(S["relations.mentions"])).toBeTruthy()
    expect(screen.getByText(S["relations.mentionedIn"])).toBeTruthy()
    expect(screen.getAllByText("Наблюдение М").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Вопрос Н").length).toBeGreaterThan(0)
  })
  it("охранный (зелёный и до правки): без упоминаний в ответе групп нет", () => {
    h.data.current = { related: {} }
    mount()
    expect(screen.queryByText(S["relations.mentions"])).toBeNull()
    expect(screen.queryByText(S["relations.mentionedIn"])).toBeNull()
  })
  it("«Сделать связью» создаёт «связано» с этой записью и даёт «Вернуть», откатывающее именно эту связь", async () => {
    mount()
    fireEvent.click(screen.getAllByRole("button", { name: S["relations.makeLink"] })[0])
    await waitFor(() => expect(h.toast).toHaveBeenCalled())
    const url = h.post.mock.calls[0][0] as string
    expect(url).toContain("from_type=hypothesis&from_id=1&to_type=observation&to_id=7")
    expect(url).toContain(`link_type=${encodeURIComponent("связано")}`)
    const req = h.toast.mock.calls[0][0]
    expect(req.message).toContain("Наблюдение М")
    await req.undo.run()
    expect(h.post).toHaveBeenLastCalledWith("/api/v1/hypothesis/1/undo/55")
  })
})
