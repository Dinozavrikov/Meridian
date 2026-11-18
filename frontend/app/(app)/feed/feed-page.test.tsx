import React from "react"
import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import FeedPage from "@/app/(app)/feed/page"
import { fetchPublicFeedFirstPage } from "@/lib/feed-server"

// Страница стала серверным компонентом: ждем ее и подменяем серверный запрос первой страницы ленты.
vi.mock("@/lib/feed-server", () => ({ fetchPublicFeedFirstPage: vi.fn(async () => null) }))
const renderPage = async () => render(await FeedPage())

vi.mock("@/components/layout/header", () => ({ Header: () => null }))
vi.mock("@/components/layout/footer", () => ({ Footer: () => null }))
vi.mock("@/components/feed/graph-teaser", () => ({ GraphTeaser: () => null }))
vi.mock("@/components/feed/recently-confirmed", () => ({ RecentlyConfirmed: () => null }))
vi.mock("@/components/feed/feed-groups-view", async () => {
  const React = await import("react")
  return {
    FeedGroupsView: (p: any) => React.createElement("div", {
      "data-testid": "stub-view", "data-layout": p.layout, "data-heading": String(!!p.showHeading),
      "data-initial": p.initialPage ? String(p.initialPage.total) : "none",
    }),
  }
})
afterEach(cleanup)

// Предки, у которых вертикальная прокрутка не «visible»: sticky внутри них прилипает к такому блоку, а не к окну.
const scrollers = (el: HTMLElement) => {
  const out: string[] = []
  for (let n = el.parentElement; n; n = n.parentElement) {
    const o = n.style.overflowY
    if (o && o !== "visible") out.push(`${n.tagName}:${o}`)
  }
  return out
}

describe("страница ленты", () => {
  it("правая панель может прилипать к окну: ни у одного предка нет собственной прокрутки", async () => {
    await renderPage()
    expect(scrollers(screen.getByTestId("stub-view"))).toEqual([])
  })

  it("лента — двухколонная, с заголовком страницы", async () => {
    await renderPage()
    const view = screen.getByTestId("stub-view")
    expect(view.getAttribute("data-layout")).toBe("split")
    expect(view.getAttribute("data-heading")).toBe("true")
  })

  it("первая страница, полученная сервером, доходит до ленты", async () => {
    vi.mocked(fetchPublicFeedFirstPage).mockResolvedValueOnce({ groups: [], page: 1, page_size: 20, total: 7, total_pages: 1, type_counts: {}, topics: [] })
    await renderPage()
    expect(screen.getByTestId("stub-view").getAttribute("data-initial")).toBe("7")
  })

  it("сервер не ответил: лента получает null и грузится в браузере", async () => {
    vi.mocked(fetchPublicFeedFirstPage).mockResolvedValueOnce(null)
    await renderPage()
    expect(screen.getByTestId("stub-view").getAttribute("data-initial")).toBe("none")
  })
})
