import React from "react"
import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { safeEntityHref } from "@/lib/entity-routes"
import { FeedGroupCard } from "@/components/feed/feed-group-card"
import type { FeedGroup, FeedItem } from "@/lib/feed-groups"

const h = vi.hoisted(() => ({ store: { user: null as null | { username: string }, locale: "ru" } }))
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
vi.mock("@/lib/i18n/useTypeRu", () => ({ useTypeRu: () => ({ hypothesis: "Гипотеза", observation: "Наблюдение" }) }))
vi.mock("@/lib/store", () => ({ useStore: (sel: any) => sel(h.store) }))
vi.mock("@/lib/i18n/useContentT", () => ({
  useContentT: () => ({ ct: (_a: string, _b: number, _c: string, fb: string) => fb, ensure: vi.fn() }),
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

const item = (type: string, id: number, over: Record<string, unknown> = {}) => ({
  id, entity_id: id, type, title: `${type}-${id}`, preview: `текст ${id}`, author_username: "a", author_display: "A",
  author_avatar_url: null, visibility: "public", created_at: "2026-11-06T10:00:00Z", comment_count: 0, note_count: 0,
  notes: [], status: null, ...over,
}) as unknown as FeedItem
const MEMBERS = 8   // заведомо больше порога сворачивания
const group = (): FeedGroup => ({
  key: "hypothesis:1", core: item("hypothesis", 1),
  members: Array.from({ length: MEMBERS }, (_, i) => ({ item: item("observation", 10 + i), relation: i % 2 ? "опровергает" : "подтверждает" })),
  internal: [{ a: { type: "observation", entity_id: 10, title: "A-10" }, b: { type: "observation", entity_id: 11, title: "B-11" }, kind: "подтверждает" }],
  outside: [], activity: "2026-11-06T10:00:00Z", size: MEMBERS + 1, topics: [],
}) as unknown as FeedGroup

function renderCard(full: boolean) {
  const qc = new QueryClient()
  return render(<QueryClientProvider client={qc}><FeedGroupCard group={group()} full={full} /></QueryClientProvider>)
}

describe("FeedGroupCard: full (страница обсуждения)", () => {
  it("в ленте участники свёрнуты, на странице обсуждения показаны все без кнопок сворачивания", () => {
    renderCard(false)
    expect(screen.getAllByTestId("feed-member").length).toBeLessThan(MEMBERS)   // предусловие: в ленте свёрнуто
    expect(screen.getByTestId("feed-more")).toBeTruthy()
    cleanup()
    renderCard(true)
    expect(screen.getAllByTestId("feed-member")).toHaveLength(MEMBERS)
    expect(screen.queryByTestId("feed-more")).toBeNull()
    expect(screen.queryByTestId("feed-less")).toBeNull()
  })

  it("связи между участниками на странице раскрыты сразу, в ленте — по клику", () => {
    renderCard(false)
    expect(screen.queryAllByTestId("feed-internal-link")).toHaveLength(0)
    cleanup()
    renderCard(true)
    expect(screen.getAllByTestId("feed-internal-link")).toHaveLength(1)
  })

  it("кнопка «Обсуждение» только в ленте; заголовок в ленте ведёт на обсуждение, на странице — на запись", () => {
    const { container } = renderCard(false)
    expect(screen.getByTestId("feed-discussion")).toBeTruthy()
    expect(container.querySelector("h3 a")?.getAttribute("href")).toBe("/feed/discussion/hypothesis/1")
    cleanup()
    const full = renderCard(true)
    expect(screen.queryByTestId("feed-discussion")).toBeNull()
    expect(full.container.querySelector("h3 a")?.getAttribute("href")).toBe(safeEntityHref("hypothesis", 1))
  })
})
