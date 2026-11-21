import React from "react"
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import { render, cleanup } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { STRINGS } from "@/lib/i18n/strings"
import { FeedGroupCard } from "@/components/feed/feed-group-card"
import type { FeedGroup, FeedItem } from "@/lib/feed-groups"

const h = vi.hoisted(() => ({
  ensure: vi.fn(),
  store: { user: null as null | { username: string }, locale: "ru" },
}))

vi.mock("next/link", async () => {
  const React = await import("react")
  return { default: ({ href, children, ...rest }: any) => React.createElement("a", { href, ...rest }, children) }
})
vi.mock("@/lib/i18n/useT", () => ({
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    Object.entries(vars ?? {}).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), (STRINGS as Record<string, string>)[key] ?? key),
}))
vi.mock("@/lib/i18n/useTypeRu", () => ({ useTypeRu: () => ({}) }))
vi.mock("@/lib/store", () => ({ useStore: (sel: any) => sel(h.store) }))
vi.mock("@/lib/i18n/useContentT", () => ({ useContentT: () => ({ ct: (_a: string, _b: number, _c: string, f: string) => f, ensure: h.ensure }) }))
vi.mock("@/lib/i18n/useDynamicT", () => ({ useDynamicTranslate: () => (s: string) => s }))
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/lib/api")
  const api = { delete: vi.fn() }
  return { ...actual, obsApi: api, hypApi: api, predApi: api, wvApi: api, questionApi: api, taskApi: api, trashApi: { restore: vi.fn() } }
})
vi.mock("@/lib/confirm", () => ({ askConfirmText: vi.fn() }))
vi.mock("@/lib/toast", () => ({ toast: vi.fn() }))
vi.mock("@/components/ui/avatar", () => ({ Avatar: () => null }))
vi.mock("@/components/entities/entity-quick-add-menu", () => ({ EntityQuickAddMenu: () => null }))
vi.mock("@/components/feed/repost-quote", () => ({ RepostQuote: () => null }))
vi.mock("@/components/feed/repost-modal", () => ({ RepostModal: () => null }))
vi.mock("@/components/feed/maturation-stepper", () => ({ MaturationStepper: () => null }))
vi.mock("@/components/feed/verify-track", () => ({ VerifyTrack: () => null }))
vi.mock("@/components/feed/group-graph", () => ({ GroupGraph: () => null }))

beforeEach(() => { h.store.user = null; h.store.locale = "ru"; h.ensure.mockReset() })
afterEach(cleanup)

const LINK = '<p>см. <a href="meridian://question/7">вопрос</a> и <a href="javascript:alert(1)">плохая</a></p>'
const item = (over: Partial<FeedItem> = {}): FeedItem => ({
  id: 1, entity_id: 1, type: "question", title: "Заголовок", preview: LINK, author_username: "other",
  author_display: "Other", created_at: new Date().toISOString(), comment_count: 0, status: null, ...over,
})
const group = (core: Partial<FeedItem> = {}): FeedGroup => ({
  key: "question:1", core: item(core), members: [], internal: [], outside: [],
  activity: new Date().toISOString(), size: 1, topics: [], ...({} as object),
} as FeedGroup)

function renderCard(g: FeedGroup) {
  return render(<QueryClientProvider client={new QueryClient()}><FeedGroupCard group={g} /></QueryClientProvider>)
}

describe("FeedGroupCard: ссылки в тексте записи", () => {
  it("тело записи содержит рабочую ссылку на запись, а javascript: отрезается", () => {
    const { container } = renderCard(group())
    const lead = container.querySelector(".mf-lead") as HTMLElement
    expect(lead).toBeTruthy()
    expect(lead.querySelector('a[href="meridian://question/7"]')?.textContent).toBe("вопрос")
    expect(lead.innerHTML).not.toContain("javascript:")
  })

  it("заметка к наблюдению тоже показывает ссылку", () => {
    const core = {
      type: "observation", title: "Нб", preview: "<p>текст</p>", note_count: 1,
      notes: [{ id: 5, title: "", preview: LINK, author_username: "x", author_display: "X", created_at: new Date().toISOString() }],
    } as Partial<FeedItem>
    const { container } = renderCard(group(core))
    expect(container.querySelector('.mf-note-q a[href="meridian://question/7"]')).toBeTruthy()
  })

  it("чужое тело со ссылками уходит на перевод как preview_html вместе с разметкой", () => {
    renderCard(group())
    const sent = h.ensure.mock.calls.flatMap(c => c[0]) as { field: string; text: string }[]
    expect(sent.find(i => i.field === "preview_html")?.text).toBe(LINK)
  })

  it("свою запись на перевод не отправляет", () => {
    h.store.user = { username: "other" }
    renderCard(group())
    const sent = h.ensure.mock.calls.flatMap(c => c[0]) as { field: string }[]
    expect(sent.some(i => i.field === "preview_html")).toBe(false)
  })
})
