import React from "react"
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { FeedGroupCard } from "@/components/feed/feed-group-card"
import type { FeedGroup, FeedItem } from "@/lib/feed-groups"

const h = vi.hoisted(() => ({ store: { user: null as null | { username: string }, locale: "ru" }, ensure: vi.fn() }))
vi.mock("next/link", async () => {
  const React = await import("react")
  return { default: ({ href, children, ...rest }: any) => React.createElement("a", { href, ...rest }, children) }
})
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return {
    useT: () => (key: string, vars?: Record<string, string | number>) =>
      Object.entries(vars ?? {}).reduce((a, [k, v]) => a.replaceAll(`{${k}}`, String(v)), (STRINGS as Record<string, string>)[key] ?? key),
  }
})
vi.mock("@/lib/i18n/useTypeRu", () => ({ useTypeRu: () => ({ hypothesis: "Гипотеза", observation: "Наблюдение", worldview: "Убеждение", question: "Вопрос" }) }))
vi.mock("@/lib/store", () => ({ useStore: (sel: any) => sel(h.store) }))
vi.mock("@/lib/i18n/useContentT", () => ({
  useContentT: () => ({ ct: (_a: string, _b: number, _c: string, fb: string) => `T:${fb}`, ensure: h.ensure }),
}))
vi.mock("@/lib/i18n/useDynamicT", () => ({ useDynamicTranslate: () => (s: string) => s }))
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/lib/api")
  return { ...actual,
    obsApi: { delete: vi.fn() }, hypApi: { delete: vi.fn() }, predApi: { delete: vi.fn() }, wvApi: { delete: vi.fn() },
    questionApi: { delete: vi.fn() }, taskApi: { delete: vi.fn() }, trashApi: { restore: vi.fn() } }
})
vi.mock("@/lib/confirm", () => ({ askConfirmText: vi.fn() }))
vi.mock("@/lib/toast", () => ({ toast: vi.fn() }))
vi.mock("@/components/ui/avatar", () => ({ Avatar: () => null }))
vi.mock("@/components/entities/entity-quick-add-menu", () => ({ EntityQuickAddMenu: () => null }))
vi.mock("@/components/feed/repost-quote", () => ({ RepostQuote: () => null }))
vi.mock("@/components/feed/maturation-stepper", () => ({ MaturationStepper: () => null }))
vi.mock("@/components/feed/verify-track", () => ({ VerifyTrack: () => null }))
vi.mock("@/components/feed/repost-modal", () => ({ RepostModal: () => null }))
afterEach(cleanup)
beforeEach(() => { h.store.user = { username: "me" }; h.ensure.mockReset() })

const item = (type: string, id: number) => ({
  id, entity_id: id, type, title: `${type}-${id}`, preview: `текст ${id}`, author_username: "a", author_display: "A",
  author_avatar_url: null, visibility: "public", created_at: "2026-11-06T10:00:00Z", comment_count: 0, note_count: 0, notes: [], status: null,
}) as unknown as FeedItem
const ref = (type: string, entity_id: number, title: string, translatable: boolean, author_username: string) =>
  ({ type, entity_id, title, translatable, author_username })

const group = (): FeedGroup => ({
  key: "hypothesis:1", core: item("hypothesis", 1),
  members: [{ item: item("observation", 10), relation: "подтверждает" }, { item: item("observation", 11), relation: "опровергает" }],
  internal: [{ a: ref("observation", 10, "R-A", true, "other"), b: ref("observation", 11, "R-B", true, "me"), kind: "подтверждает" }],
  outside: [ref("worldview", 50, "R-W", false, "other"), ref("question", 51, "R-Q", true, "other")],
  activity: "2026-11-06T10:00:00Z", size: 3, topics: [],
}) as unknown as FeedGroup

const ensured = () => h.ensure.mock.calls.flatMap(c => c[0] as any[])
function renderCard() {
  return render(<QueryClientProvider client={new QueryClient()}><FeedGroupCard group={group()} full /></QueryClientProvider>)
}

describe("FeedGroupCard: перевод названий в связях между участниками и в «Ещё связано с»", () => {
  it("переводятся только настоящие заголовки чужих записей", () => {
    renderCard()
    const refs = ensured().filter(x => x.field === "title" && String(x.text).startsWith("R-"))
    expect(refs.map(x => [x.entityType, x.entityId, x.text]).sort()).toEqual([["observation", 10, "R-A"], ["question", 51, "R-Q"]])
  })

  it("на экране: чужие переведены, своя запись и запись без заголовка — как есть", () => {
    renderCard()
    expect(screen.getByText("T:R-A")).toBeTruthy()
    expect(screen.getByText("T:R-Q")).toBeTruthy()
    expect(screen.getByText("R-B")).toBeTruthy()   // своя запись
    expect(screen.getByText("R-W")).toBeTruthy()   // title — слепок превью, не заголовок
  })

  it("гость: переводятся все настоящие заголовки, своих у него нет", () => {
    h.store.user = null
    renderCard()
    expect(screen.getByText("T:R-B")).toBeTruthy()
  })
})
