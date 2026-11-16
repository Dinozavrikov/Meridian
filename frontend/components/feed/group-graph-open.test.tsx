import React from "react"
import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup, fireEvent } from "@testing-library/react"
import { GroupGraph } from "@/components/feed/group-graph"
import type { FeedGroup, FeedItem } from "@/lib/feed-groups"

vi.mock("@/lib/i18n/useT", () => ({
  useT: () => (key: string, vars?: Record<string, string | number>) => key + (vars ? `:${Object.values(vars).join(",")}` : ""),
}))
vi.mock("@/components/ui/modal", async () => {
  const React = await import("react")
  return { Modal: (p: any) => p.open ? React.createElement("div", { "data-testid": "modal", "data-title": p.title },
    React.createElement("button", { type: "button", "data-testid": "modal-close", onClick: p.onClose }), p.children) : null }
})
vi.mock("@/components/entities/relations-panel", async () => {
  const React = await import("react")
  return { LocalGraphPanel: (p: any) => React.createElement("div", {
    "data-testid": "local-graph", "data-type": p.entityType, "data-id": String(p.entityId), "data-title": p.entityTitle,
    "data-height": String(p.height), "data-bare": String(!!p.bare),
  }) }
})
afterEach(cleanup)

const item = (type: string, id: number, over: Record<string, unknown> = {}) => ({
  id, entity_id: id, type, title: `${type}-${id}`, preview: "<p>текст</p>", author_username: "a", author_display: "A",
  visibility: "public", created_at: "2026-11-06T10:00:00Z", ...over,
}) as unknown as FeedItem
const group = (coreOver: Record<string, unknown> = {}): FeedGroup => ({
  key: "hypothesis:1", core: item("hypothesis", 1, coreOver),
  members: [{ item: item("observation", 10), relation: "подтверждает" }, { item: item("observation", 11), relation: "опровергает" }],
  internal: [], outside: [], activity: "2026-11-06T10:00:00Z", size: 3, topics: [],
}) as unknown as FeedGroup

describe("GroupGraph: клик по миниатюре открывает локальный граф", () => {
  it("миниатюра — настоящая кнопка с названием; по умолчанию граф не открыт и не загружается", () => {
    render(<GroupGraph group={group()} />)
    const b = screen.getByRole("button", { name: "feedGroups.graphOpen" })
    expect(b.tagName).toBe("BUTTON")   // Enter и Пробел работают сами
    expect(screen.getByTestId("group-graph")).toBeTruthy()
    expect(screen.queryByTestId("modal")).toBeNull()
    expect(screen.queryByTestId("local-graph")).toBeNull()
  })

  it("клик: окно с графом именно этой записи, без своего заголовка, высотой 480", async () => {
    render(<GroupGraph group={group()} />)
    fireEvent.click(screen.getByTestId("group-graph-open"))
    const g = await screen.findByTestId("local-graph")
    expect(g.getAttribute("data-type")).toBe("hypothesis")
    expect(g.getAttribute("data-id")).toBe("1")
    expect(g.getAttribute("data-title")).toBe("hypothesis-1")
    expect(g.getAttribute("data-height")).toBe("480")
    expect(g.getAttribute("data-bare")).toBe("true")
    expect(screen.getByTestId("modal").getAttribute("data-title")).toBe("feedGroups.graphModalTitle")
  })

  it("репост: граф строится по исходной записи, а не по записи-обёртке", async () => {
    render(<GroupGraph group={group({ repost_source_type: "observation", repost_source_id: 99 })} />)
    fireEvent.click(screen.getByTestId("group-graph-open"))
    const g = await screen.findByTestId("local-graph")
    expect([g.getAttribute("data-type"), g.getAttribute("data-id")]).toEqual(["observation", "99"])
  })

  it("у записи без заголовка (убеждение) название берётся из текста", async () => {
    render(<GroupGraph group={group({ title: "", preview: "<p>Я считаю так</p>" })} />)
    fireEvent.click(screen.getByTestId("group-graph-open"))
    expect((await screen.findByTestId("local-graph")).getAttribute("data-title")).toBe("Я считаю так")
  })

  it("закрытие окна убирает граф", async () => {
    render(<GroupGraph group={group()} />)
    fireEvent.click(screen.getByTestId("group-graph-open"))
    await screen.findByTestId("local-graph")
    fireEvent.click(screen.getByTestId("modal-close"))
    expect(screen.queryByTestId("local-graph")).toBeNull()
  })
})
