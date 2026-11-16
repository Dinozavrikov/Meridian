import React from "react"
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { FeedGroupsView } from "@/components/feed/feed-groups-view"
import type { FeedGroup, FeedGroupsPage } from "@/lib/feed-groups"

const api = vi.hoisted(() => ({ groupsPublic: vi.fn(), groupsLab: vi.fn() }))

vi.mock("@/lib/api", () => ({ feedApi: api }))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return {
    useT: () => (key: string, vars?: Record<string, string | number>) =>
      Object.entries(vars ?? {}).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), (STRINGS as Record<string, string>)[key] ?? key),
  }
})
vi.mock("@/lib/i18n/useTypeRu", () => ({
  useTypeRu: () => ({ hypothesis: "Гипотеза", observation: "Наблюдение", prediction: "Прогноз", question: "Вопрос", task: "Задача", worldview: "Убеждение" }),
}))
vi.mock("@/lib/store", () => ({ useStore: (sel: any) => sel({ user: { username: "me" } }) }))
vi.mock("@/lib/use-infinite-scroll-sentinel", () => ({ useInfiniteScrollSentinel: () => ({ current: null }) }))
vi.mock("@/components/feed/feed-group-card", async () => {
  const React = await import("react")
  return {
    FeedGroupCard: ({ group, isNew }: any) => React.createElement("div",
      { "data-testid": "group", "data-key": group.key, "data-new": String(isNew) }, group.core.title),
  }
})
vi.mock("@/components/feed/feed-list", async () => {
  const React = await import("react")
  return {
    FeedList: ({ groups, isNew }: any) => React.createElement("div", { "data-testid": "list-stub" },
      groups.map((g: any) => React.createElement("span",
        { key: g.key, "data-testid": "list-row-stub", "data-new": String(isNew(g)) }, g.core.title))),
  }
})

const SEEN_KEY = "meridian.feed.seen.public"
const VIEW_KEY = "meridian.feed.view"

const mk = (id: number, activity: string, author = "other"): FeedGroup => ({
  key: `hypothesis:${id}`,
  core: { id, entity_id: id, type: "hypothesis", title: `H${id}`, preview: "", author_username: author, author_display: author, created_at: activity },
  members: [], internal: [], outside: [], activity, size: 1, topics: [],
})
const pageOf = (groups: FeedGroup[]): FeedGroupsPage => ({
  groups, page: 1, page_size: 20, total: groups.length, total_pages: 1,
  type_counts: { hypothesis: groups.length }, topics: [],
})

let main: FeedGroupsPage

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><FeedGroupsView key="k" scope={{ type: "public" } as any} /></QueryClientProvider>)
}

beforeEach(() => {
  localStorage.clear()
  main = pageOf([mk(1, "2026-11-01T00:00:00Z")])
  api.groupsPublic.mockReset().mockImplementation(async () => main)
  api.groupsLab.mockReset().mockImplementation(async () => main)
  vi.spyOn(window, "scrollTo").mockImplementation(() => {})
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

const pressed = (id: string) => screen.getByTestId(id).getAttribute("aria-pressed")

describe("переключатель «Карточки | Список» в ленте", () => {
  it("по умолчанию карточки", async () => {
    mount()
    expect(await screen.findByTestId("group")).not.toBeNull()
    expect(screen.queryByTestId("list-stub")).toBeNull()
    expect(pressed("feed-view-cards")).toBe("true")
    expect(pressed("feed-view-list")).toBe("false")
  })

  it("клик по «Список» заменяет карточки списком и запоминает выбор", async () => {
    mount()
    await screen.findByTestId("group")
    fireEvent.click(screen.getByTestId("feed-view-list"))
    expect((await screen.findByTestId("list-stub")).textContent).toContain("H1")
    expect(screen.queryByTestId("group")).toBeNull()
    expect(pressed("feed-view-list")).toBe("true")
    expect(localStorage.getItem(VIEW_KEY)).toBe("list")
  })

  it("сохранённый выбор «список» подхватывается при следующем заходе", async () => {
    localStorage.setItem(VIEW_KEY, "list")
    mount()
    expect(await screen.findByTestId("list-stub")).not.toBeNull()
    expect(screen.queryByTestId("group")).toBeNull()
    expect(pressed("feed-view-list")).toBe("true")
  })

  it("возврат на «Карточки» возвращает карточки и пишет выбор", async () => {
    localStorage.setItem(VIEW_KEY, "list")
    mount()
    await screen.findByTestId("list-stub")
    fireEvent.click(screen.getByTestId("feed-view-cards"))
    expect(await screen.findByTestId("group")).not.toBeNull()
    expect(screen.queryByTestId("list-stub")).toBeNull()
    expect(localStorage.getItem(VIEW_KEY)).toBe("cards")
  })

  it("переключение не ходит в сеть заново", async () => {
    mount()
    await screen.findByTestId("group")
    const calls = api.groupsPublic.mock.calls.length
    fireEvent.click(screen.getByTestId("feed-view-list"))
    await screen.findByTestId("list-stub")
    fireEvent.click(screen.getByTestId("feed-view-cards"))
    await screen.findByTestId("group")
    expect(api.groupsPublic.mock.calls.length).toBe(calls)
  })

  it("«Новое» в списке считается так же, как в карточках: чужое после прошлого захода — да, своё — нет", async () => {
    localStorage.setItem(SEEN_KEY, "2020-01-01T00:00:00Z")
    localStorage.setItem(VIEW_KEY, "list")
    main = pageOf([mk(1, "2026-11-01T00:00:00Z", "other"), mk(2, "2026-11-01T00:00:00Z", "me")])
    mount()
    await screen.findByTestId("list-stub")
    await waitFor(() => expect(screen.getAllByTestId("list-row-stub")).toHaveLength(2))
    expect(screen.getAllByTestId("list-row-stub").map(r => r.getAttribute("data-new"))).toEqual(["true", "false"])
  })
})
