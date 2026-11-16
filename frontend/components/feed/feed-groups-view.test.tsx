import React from "react"
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { STRINGS } from "@/lib/i18n/strings"
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
    FeedGroupCard: ({ group, isNew, onTopic }: any) => React.createElement("div",
      { "data-testid": "group", "data-key": group.key, "data-new": String(isNew) },
      React.createElement("span", null, group.core.title),
      React.createElement("button", { "data-testid": `pick-${group.key}`, onClick: () => onTopic("alpha") })),
  }
})

const S = STRINGS as Record<string, string>
const SEEN_KEY = "meridian.feed.seen.public"
const T0 = "2020-01-01T00:00:00Z"

const mk = (id: number, activity: string, author = "other"): FeedGroup => ({
  key: `hypothesis:${id}`,
  core: { id, entity_id: id, type: "hypothesis", title: `H${id}`, preview: "", author_username: author, author_display: author, created_at: activity },
  members: [], internal: [], outside: [], activity, size: 1, topics: [],
})
const pageOf = (groups: FeedGroup[]): FeedGroupsPage => ({
  groups, page: 1, page_size: 20, total: groups.length, total_pages: 1,
  type_counts: { hypothesis: groups.length, observation: 1 }, topics: [{ name: "alpha", count: 2 }],
})

let main: FeedGroupsPage
let peek: FeedGroupsPage

function mount(scope: any = { type: "public" }, props: Record<string, unknown> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><FeedGroupsView key="k" scope={scope} {...props} /></QueryClientProvider>)
}

beforeEach(() => {
  localStorage.clear()
  main = pageOf([mk(1, "2026-11-01T00:00:00Z")])
  peek = main
  api.groupsPublic.mockReset().mockImplementation(async (p: any) => (p.pageSize === 1 ? peek : main))
  api.groupsLab.mockReset().mockImplementation(async () => main)
  vi.spyOn(window, "scrollTo").mockImplementation(() => {})
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe("FeedGroupsView", () => {
  it("рисует карточки; фильтр типа есть только для тех типов, что встречаются", async () => {
    mount()
    expect(await screen.findByText("H1")).not.toBeNull()
    expect(screen.getByTestId("filter-hypothesis")).not.toBeNull()
    expect(screen.getByTestId("filter-observation")).not.toBeNull()
    expect(screen.queryByTestId("filter-question")).toBeNull()
  })

  it("выбор типа и темы уходит в запрос; повторный клик по теме снимает фильтр", async () => {
    mount()
    await screen.findByText("H1")
    fireEvent.click(screen.getByTestId("filter-observation"))
    await waitFor(() => expect(api.groupsPublic).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 20, types: ["observation"] })))
    fireEvent.click(screen.getByTestId("topic-alpha"))
    await waitFor(() => expect(api.groupsPublic).toHaveBeenCalledWith(expect.objectContaining({ types: ["observation"], topic: "alpha" })))
    fireEvent.click(screen.getByTestId("topic-alpha"))
    await waitFor(() => {
      const last = api.groupsPublic.mock.calls.filter(c => c[0].pageSize === 20).at(-1)![0]
      expect(last.topic).toBeUndefined()
    })
  })

  it("чипы фильтров не пропадают, пока грузится новая выборка; старые карточки при этом не показываются", async () => {
    mount()
    await screen.findByText("H1")
    let release!: (p: FeedGroupsPage) => void
    api.groupsPublic.mockImplementation((p: any) =>
      p.pageSize === 1 ? Promise.resolve(peek) : new Promise<FeedGroupsPage>(r => { release = r }))
    fireEvent.click(screen.getByTestId("filter-observation"))
    await waitFor(() => expect(api.groupsPublic).toHaveBeenCalledWith(expect.objectContaining({ types: ["observation"] })))
    expect(screen.getByTestId("filter-hypothesis")).not.toBeNull()
    expect(screen.getByTestId("filter-observation")).not.toBeNull()
    expect(screen.getByTestId("topic-alpha")).not.toBeNull()
    expect(screen.queryByText("H1")).toBeNull()
    release(pageOf([mk(5, "2026-11-04T00:00:00Z")]))
    expect(await screen.findByText("H5")).not.toBeNull()
  })

  it("тема с карточки включает фильтр", async () => {
    mount()
    fireEvent.click(await screen.findByTestId("pick-hypothesis:1"))
    await waitFor(() => expect(api.groupsPublic).toHaveBeenCalledWith(expect.objectContaining({ topic: "alpha" })))
  })

  it("лента лаборатории ходит за своим адресом с её id", async () => {
    mount({ type: "lab", labId: 7, labName: "Сон" })
    await screen.findByText("H1")
    expect(api.groupsLab).toHaveBeenCalledWith(7, expect.objectContaining({ page: 1 }))
    expect(api.groupsPublic).not.toHaveBeenCalled()
  })

  it("пусто: общий текст", async () => {
    main = pageOf([])
    mount()
    expect(await screen.findByText(S["feedPage.emptyTitleAll"])).not.toBeNull()
  })
})

describe("FeedGroupsView: «Есть новое»", () => {
  it("плашка появляется, когда сверху есть более свежая карточка; по клику лента обновляется и плашка уходит", async () => {
    const fresh = mk(2, "2026-11-05T00:00:00Z")
    peek = pageOf([fresh])
    mount()
    await screen.findByText("H1")
    const banner = await screen.findByTestId("feed-new-banner")
    expect(banner.textContent).toContain(S["feedGroups.newBanner"])

    main = pageOf([fresh, mk(1, "2026-11-01T00:00:00Z")])
    fireEvent.click(banner)
    await screen.findByText("H2")
    expect(window.scrollTo).toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByTestId("feed-new-banner")).toBeNull())
    expect(screen.getAllByTestId("group").map(g => g.getAttribute("data-key"))).toEqual(["hypothesis:2", "hypothesis:1"])
  })

  it("если наверху то же самое, плашки нет", async () => {
    mount()
    await screen.findByText("H1")
    await waitFor(() => expect(api.groupsPublic.mock.calls.some(c => c[0].pageSize === 1)).toBe(true))
    expect(screen.queryByTestId("feed-new-banner")).toBeNull()
  })
})

describe("FeedGroupsView: метка «Новое» по прошлому заходу", () => {
  it("новое — только то, что случилось после прошлого захода, и не твои собственные записи", async () => {
    localStorage.setItem(SEEN_KEY, "2026-11-02T00:00:00Z")
    main = pageOf([mk(1, "2026-11-04T00:00:00Z"), mk(2, "2026-11-01T00:00:00Z"), mk(3, "2026-11-04T00:00:00Z", "me")])
    peek = main
    mount()
    await screen.findByText("H1")
    const flag = (k: string) => screen.getAllByTestId("group").find(g => g.getAttribute("data-key") === k)!.getAttribute("data-new")
    expect(flag("hypothesis:1")).toBe("true")
    expect(flag("hypothesis:2")).toBe("false")
    expect(flag("hypothesis:3")).toBe("false")
  })

  it("первый заход: ничего не новое; время захода сохраняется при уходе со страницы", async () => {
    const view = mount()
    await screen.findByText("H1")
    expect(screen.getByTestId("group").getAttribute("data-new")).toBe("false")
    expect(localStorage.getItem(SEEN_KEY)).not.toBeNull()
    localStorage.setItem(SEEN_KEY, T0)
    view.unmount()
    expect(Date.parse(localStorage.getItem(SEEN_KEY)!)).toBeGreaterThan(Date.parse(T0))
  })
})


describe("FeedGroupsView: заголовок, панель и состояния", () => {
  const extras = <div data-testid="extra-block">extra</div>

  it("заголовок страницы с числом карточек — только когда его просят; во вкладке лаборатории его нет", async () => {
    main = pageOf([mk(1, "2026-11-01T00:00:00Z"), mk(2, "2026-11-02T00:00:00Z")])
    const first = mount({ type: "public" }, { showHeading: true })
    expect(await screen.findByText("H1")).not.toBeNull()
    expect(screen.getByTestId("feed-heading").querySelector("h1")!.textContent).toBe(S["feedGroups.headTitle"])
    expect(screen.getByTestId("feed-heading").textContent).toContain(S["feedGroups.headSub"])
    expect(screen.getByTestId("feed-stat").textContent).toBe(S["feedGroups.headStats"].replace("{n}", "2"))
    first.unmount()
    mount({ type: "lab", labId: 7, labName: "Сон" })
    await screen.findByText("H1")
    expect(screen.queryByTestId("feed-heading")).toBeNull()
  })

  it("число в заголовке остаётся общим при включённом фильтре", async () => {
    main = pageOf([mk(1, "2026-11-01T00:00:00Z"), mk(2, "2026-11-02T00:00:00Z")])
    mount({ type: "public" }, { showHeading: true })
    await screen.findByText("H1")
    api.groupsPublic.mockImplementation(async (p: any) => (p.pageSize === 1 ? peek : pageOf([mk(1, "2026-11-01T00:00:00Z")])))
    fireEvent.click(screen.getByTestId("filter-observation"))
    await waitFor(() => expect(screen.getAllByTestId("group")).toHaveLength(1))
    expect(screen.getByTestId("feed-stat").textContent).toBe(S["feedGroups.headStats"].replace("{n}", "2"))
  })

  it("доп. блоки правой панели — только на странице ленты (split), во вкладке лаборатории не рисуются", async () => {
    const first = mount({ type: "public" }, { layout: "split", extras })
    await screen.findByText("H1")
    expect(screen.getByTestId("feed-extras").contains(screen.getByTestId("extra-block"))).toBe(true)
    first.unmount()
    mount({ type: "lab", labId: 7, labName: "Сон" }, { layout: "single", extras })
    await screen.findByText("H1")
    expect(screen.queryByTestId("extra-block")).toBeNull()
  })

  it("фильтры: активный тип отмечен, у списка типов есть подпись про смысл числа", async () => {
    mount()
    await screen.findByText("H1")
    expect(screen.getByTestId("filter-all").getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(screen.getByTestId("filter-observation"))
    await waitFor(() => expect(screen.getByTestId("filter-observation").getAttribute("aria-pressed")).toBe("true"))
    expect(screen.getByTestId("filter-all").getAttribute("aria-pressed")).toBe("false")
    expect(screen.getByTestId("filter-hint").textContent).toBe(S["feedGroups.countHint"])
  })

  it("пока грузится — скелетоны формы карточки, а не пустой экран", async () => {
    api.groupsPublic.mockImplementation(() => new Promise(() => {}))
    mount()
    expect(await screen.findByTestId("feed-skeleton")).not.toBeNull()
    expect(screen.getByTestId("feed-skeleton").children).toHaveLength(3)
  })

  it("ошибка загрузки: сообщение и «Повторить»; повтор показывает ленту", async () => {
    api.groupsPublic.mockRejectedValueOnce(new Error("boom"))
    mount()
    const err = await screen.findByTestId("feed-error")
    expect(err.getAttribute("role")).toBe("alert")
    expect(err.textContent).toContain(S["feedGroups.error"])
    fireEvent.click(screen.getByText(S["feedGroups.retry"]))
    expect(await screen.findByText("H1")).not.toBeNull()
    expect(screen.queryByTestId("feed-error")).toBeNull()
  })
})
