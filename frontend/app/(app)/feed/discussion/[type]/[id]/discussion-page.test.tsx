import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import { render, screen, cleanup, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { STRINGS } from "@/lib/i18n/strings"
import { safeEntityHref } from "@/lib/entity-routes"
import { DiscussionClient } from "@/app/(app)/feed/discussion/[type]/[id]/discussion-client"

const h = vi.hoisted(() => ({
  store: { user: null as null | { id: number; username: string } },
  groupEntity: vi.fn(), comments: vi.fn(), post: vi.fn(), markSeen: vi.fn(),
}))
const tt = (key: string, vars?: Record<string, string | number>) =>
  Object.entries(vars ?? {}).reduce((a, [k, v]) => a.replaceAll(`{${k}}`, String(v)), (STRINGS as Record<string, string>)[key] ?? key)

vi.mock("next/navigation", () => ({ useParams: () => ({ type: "hypothesis", id: "7" }) }))
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
vi.mock("@/lib/store", () => ({ useStore: (sel: any) => sel(h.store) }))
vi.mock("@/lib/use-unread", () => ({ useMarkSeen: () => ({ mutate: h.markSeen }) }))
vi.mock("@/lib/api", () => ({
  discussionApi: { comments: h.comments, post: h.post }, feedApi: { groupEntity: h.groupEntity },
}))
vi.mock("@/components/layout/header", () => ({ Header: () => null }))
vi.mock("@/components/layout/page-shell", async () => {
  const React = await import("react")
  const P = ({ children }: any) => React.createElement("div", null, children)
  return { PageShell: P, PageContent: P }
})
vi.mock("@/components/feed/feed-styles", () => ({ FeedStyles: () => null }))
vi.mock("@/components/feed/feed-group-card", async () => {
  const React = await import("react")
  return { FeedGroupCard: (p: any) => React.createElement("div", { "data-testid": "card", "data-full": String(!!p.full) }) }
})
const flat = (list: any[]): string[] => list.flatMap(c => [c.content, ...flat(c.replies ?? [])])
vi.mock("@/components/discussion/courtroom", async () => {
  const React = await import("react")
  const f = (list: any[]): string[] => list.flatMap(c => [c.content, ...f(c.replies ?? [])])
  return { Courtroom: (p: any) => React.createElement("div", { "data-testid": "courtroom" }, f(p.comments).join("|")) }
})
vi.mock("@/components/discussion/sentiment-meter", async () => {
  const React = await import("react")
  const f = (list: any[]): string[] => list.flatMap(c => [c.content, ...f(c.replies ?? [])])
  return { SentimentMeter: (p: any) => React.createElement("div", { "data-testid": "meter", "data-n": String(f(p.comments).length) }) }
})
vi.mock("@/components/discussion/stance-composer", async () => {
  const React = await import("react")
  return { StanceComposer: () => React.createElement("div", { "data-testid": "composer" }) }
})

const group = {
  key: "hypothesis:7", core: { type: "hypothesis", entity_id: 7, author_username: "own" },
  members: [], internal: [], outside: [], activity: "2026-11-06T10:00:00Z", size: 1, topics: [],
}
const note = { id: 1, author_username: "own", stance: null, content: "NOTE-SELF",
  replies: [{ id: 2, author_username: "own", stance: null, content: "NOTE-SELF-REPLY", replies: [] }] }
const talk = { id: 3, author_username: "guest", stance: "confirm", content: "DISCUSS-1", replies: [] }

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><DiscussionClient type="hypothesis" id="7" initialGroup={null} /></QueryClientProvider>)
}

beforeEach(() => {
  h.store.user = null
  h.groupEntity.mockReset().mockResolvedValue(group)
  h.markSeen.mockReset()
  h.comments.mockReset().mockResolvedValue([note, talk])
})
afterEach(cleanup)

describe("страница обсуждения записи", () => {
  it("владелец: личная заметка и ответы под ней не попадают ни в обсуждение, ни в счётчик позиций, ни в участников", async () => {
    h.store.user = { id: 1, username: "own" }
    renderPage()
    expect((await screen.findByTestId("courtroom")).textContent).toBe("DISCUSS-1")
    expect(screen.getByTestId("meter").getAttribute("data-n")).toBe("1")
    expect(screen.getByText(tt("discussion.participants.one", { n: 1 }))).toBeTruthy()
  })

  it("владелец видит ссылку на свои заметки (одну на корневую заметку) и она ведёт на страницу записи", async () => {
    h.store.user = { id: 1, username: "own" }
    renderPage()
    const link = await screen.findByTestId("my-notes-link")
    expect(link.getAttribute("href")).toBe(safeEntityHref("hypothesis", 7))
    expect(link.textContent).toContain(tt("discussion.myNotes", { n: 1 }))
  })

  it("не владелец и гость ссылки на заметки не видят; карточка показана целиком", async () => {
    h.store.user = { id: 2, username: "guest" }
    renderPage()
    await screen.findByTestId("courtroom")
    expect(screen.queryByTestId("my-notes-link")).toBeNull()
    expect(screen.getByTestId("card").getAttribute("data-full")).toBe("true")
    cleanup()
    h.store.user = null
    renderPage()
    await screen.findByTestId("courtroom")
    expect(screen.queryByTestId("my-notes-link")).toBeNull()
    expect(screen.queryByTestId("composer")).toBeNull()
  })

  it("запись недоступна (сервер ответил ошибкой): «не найдено», ни обсуждения, ни формы", async () => {
    h.store.user = { id: 1, username: "own" }
    h.groupEntity.mockReset().mockRejectedValue(new Error("404"))
    renderPage()
    expect(await screen.findByText(STRINGS["discussion.notFound"])).toBeTruthy()
    expect(screen.queryByTestId("courtroom")).toBeNull()
    expect(screen.queryByTestId("composer")).toBeNull()
  })
})


describe("страница обсуждения: «прочитано»", () => {
  it("вошедший пользователь после загрузки комментариев отмечает запись прочитанной ровно один раз", async () => {
    h.store.user = { id: 2, username: "guest" }
    renderPage()
    await screen.findByTestId("courtroom")
    await waitFor(() => expect(h.markSeen).toHaveBeenCalledTimes(1))
    expect(h.markSeen).toHaveBeenCalledWith({ entityType: "hypothesis", entityId: 7 })
  })

  it("гость ничего не отмечает", async () => {
    renderPage()
    await screen.findByTestId("courtroom")
    await new Promise(r => setTimeout(r, 50))
    expect(h.markSeen).not.toHaveBeenCalled()
  })
})

describe("страница обсуждения: серверная отрисовка", () => {
  const render = (initialGroup: unknown) => renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <DiscussionClient type="hypothesis" id="7" initialGroup={initialGroup as never} />
    </QueryClientProvider>)

  it("с готовой группой карточка записи есть в серверном HTML", () => {
    expect(render({ core: { author_username: "a", lab_id: null }, members: [] })).toContain('data-testid="card"')
  })

  it("без группы карточки в серверном HTML нет", () => {
    expect(render(null)).not.toContain('data-testid="card"')
  })
})
