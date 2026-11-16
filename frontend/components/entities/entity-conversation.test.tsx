import React from "react"
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import { render, screen, cleanup, fireEvent, waitFor, within, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { STRINGS } from "@/lib/i18n/strings"
import { EntityConversation } from "@/components/entities/entity-conversation"

const h = vi.hoisted(() => ({ store: { user: null as null | { id: number; username: string } }, comments: vi.fn() }))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
vi.mock("@/lib/store", () => ({ useStore: (sel: any) => sel(h.store) }))
vi.mock("@/lib/api", () => ({ discussionApi: { comments: h.comments } }))
vi.mock("@/lib/ownership", () => ({ isOwner: (_u: any, e: any) => !!e.mine }))
vi.mock("@/components/ui/notes-timeline", async () => {
  const React = await import("react")
  return { NotesTimeline: (p: any) => React.createElement("div", {
    "data-testid": "notes", "data-personal": String(!!p.personalOnly), "data-track": String(p.trackSeen ?? true),
    "data-bare": String(!!p.bare), "data-inlab": String(!!p.inLab),
  }) }
})
vi.mock("@/components/discussion/discussion-panel", async () => {
  const React = await import("react")
  return { DiscussionPanel: (p: any) => React.createElement("div", {
    "data-testid": "panel", "data-owner": p.ownerUsername ?? "", "data-readonly": String(!!p.readOnly),
  }) }
})
afterEach(cleanup)

const mk = (id: number, author: string, stance: string | null, replies: any[] = [], is_new = false) =>
  ({ id, author_username: author, stance, replies, is_new, content: `c${id}` })
const KEY = ["comments", "hypothesis", 7]
const personalAndTalk = () => [mk(1, "own", null, [mk(2, "own", null)]), mk(3, "guest", "confirm")]   // 2 заметки, 1 обсуждение

function renderConv(props: Record<string, unknown> = {}, data: any[] = personalAndTalk()) {
  h.comments.mockReset().mockResolvedValue(data)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const ui = (p: Record<string, unknown>) => {
    const { visibility = "public", isOwner = true, access, ...rest } = p as any
    return (
      <QueryClientProvider client={qc}>
        <EntityConversation entityType="hypothesis" entity={{ id: 7, visibility, access, mine: isOwner, lab_id: null }} {...rest} />
      </QueryClientProvider>
    )
  }
  return { qc, ...render(ui(props)) }
}
beforeEach(() => { h.store.user = { id: 1, username: "own" } })

describe("EntityConversation", () => {
  it("приватная запись: только заметки как раньше, переключателя нет", () => {
    renderConv({ visibility: "private" })
    const n = screen.getByTestId("notes")
    expect(n.getAttribute("data-personal")).toBe("false")
    expect(n.getAttribute("data-track")).toBe("true")
    expect(n.getAttribute("data-bare")).toBe("false")
    expect(screen.queryByTestId("conv-tablist")).toBeNull()
    expect(h.comments).not.toHaveBeenCalled()   // лишнего запроса за обсуждением нет
  })

  it("публичная запись, не владелец: только обсуждение; режим «только чтение» доходит до панели", () => {
    h.store.user = { id: 2, username: "guest" }
    renderConv({ isOwner: false, access: "opened" })
    expect(screen.getByTestId("panel").getAttribute("data-readonly")).toBe("true")
    expect(screen.getByTestId("panel").getAttribute("data-owner")).toBe("")
    expect(screen.queryByTestId("conv-tablist")).toBeNull()
    expect(screen.queryByTestId("notes")).toBeNull()
  })

  it("владелец: счётчики вкладок из одного запроса, заметки открыты, личное отделено и не отмечает «прочитано»", async () => {
    renderConv()
    const notesTab = await screen.findByTestId("conv-tab-notes")
    expect(within(notesTab).getByText("2")).toBeTruthy()
    expect(within(screen.getByTestId("conv-tab-discussion")).getByText("1")).toBeTruthy()
    expect(notesTab.getAttribute("aria-selected")).toBe("true")
    const n = screen.getByTestId("notes")
    expect(n.getAttribute("data-personal")).toBe("true")
    expect(n.getAttribute("data-track")).toBe("false")
    expect(n.getAttribute("data-bare")).toBe("true")
    expect(n.getAttribute("data-inlab")).toBe("false")   // личные заметки в снимки лаборатории не копируются
    expect(h.comments).toHaveBeenCalledTimes(1)
  })

  it("переключение: обсуждение показывает панель владельцу, заметки уходят; подсказка называет, кто прочтёт", async () => {
    renderConv()
    await screen.findByTestId("conv-tab-notes")
    expect(screen.getByTestId("conv-hint").textContent).toBe(STRINGS["conv.hintNotes"])
    fireEvent.click(screen.getByTestId("conv-tab-discussion"))
    expect(screen.getByTestId("conv-tab-discussion").getAttribute("aria-selected")).toBe("true")
    expect(screen.queryByTestId("notes")).toBeNull()
    expect(screen.getByTestId("panel").getAttribute("data-owner")).toBe("own")
    expect(screen.getByTestId("conv-hint").textContent).toBe(STRINGS["conv.hintDiscussionPublic"])
    expect(screen.getByTestId("conv-tablist").getAttribute("data-i")).toBe("1")
  })

  it("лабораторная запись: подсказка про участников лаборатории", async () => {
    renderConv({ visibility: "lab" })
    await screen.findByTestId("conv-tab-notes")
    fireEvent.click(screen.getByTestId("conv-tab-discussion"))
    expect(screen.getByTestId("conv-hint").textContent).toBe(STRINGS["conv.hintDiscussionLab"])
  })

  it("клавиатура: стрелки и Home/End переключают вкладки", async () => {
    renderConv()
    const list = await screen.findByTestId("conv-tablist")
    fireEvent.keyDown(list, { key: "ArrowRight" })
    expect(screen.getByTestId("conv-tab-discussion").getAttribute("aria-selected")).toBe("true")
    fireEvent.keyDown(list, { key: "Home" })
    expect(screen.getByTestId("conv-tab-notes").getAttribute("aria-selected")).toBe("true")
    fireEvent.keyDown(list, { key: "End" })
    expect(screen.getByTestId("conv-tab-discussion").getAttribute("aria-selected")).toBe("true")
  })

  it("есть непрочитанное обсуждение — открывается оно; нет заметок, но есть обсуждение — тоже; пусто — заметки", async () => {
    renderConv({}, [mk(1, "own", null), mk(3, "guest", "confirm", [], true)])
    expect((await screen.findByTestId("conv-tab-discussion")).getAttribute("aria-selected")).toBe("true")
    cleanup()
    renderConv({}, [mk(3, "guest", "confirm")])
    expect((await screen.findByTestId("conv-tab-discussion")).getAttribute("aria-selected")).toBe("true")
    cleanup()
    renderConv({}, [])
    expect((await screen.findByTestId("conv-tab-notes")).getAttribute("aria-selected")).toBe("true")
  })

  it("точка «новое в обсуждении» появляется на вкладке заметок, когда пришло новое, и гаснет после визита в обсуждение", async () => {
    const { qc } = renderConv()
    await screen.findByTestId("conv-tab-notes")
    expect(screen.queryByTestId("conv-dot")).toBeNull()
    act(() => { qc.setQueryData(KEY, [...personalAndTalk(), mk(9, "guest", "refute", [], true)]) })
    await waitFor(() => expect(screen.getByTestId("conv-dot")).toBeTruthy())
    fireEvent.click(screen.getByTestId("conv-tab-discussion"))
    fireEvent.click(screen.getByTestId("conv-tab-notes"))
    expect(screen.queryByTestId("conv-dot")).toBeNull()
  })
})

describe("EntityConversation: смена записи", () => {
  it("другая запись на том же месте: выбранная вкладка сбрасывается к стартовой", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    h.comments.mockReset().mockResolvedValue(personalAndTalk())
    const el = (id: number) => (
      <QueryClientProvider client={qc}>
        <EntityConversation entityType="hypothesis" entity={{ id, visibility: "public", mine: true }} />
      </QueryClientProvider>
    )
    const { rerender } = render(el(7))
    fireEvent.click(await screen.findByTestId("conv-tab-discussion"))
    expect(screen.getByTestId("conv-tab-discussion").getAttribute("aria-selected")).toBe("true")
    rerender(el(8))
    await waitFor(() => expect(screen.getByTestId("conv-tab-notes").getAttribute("aria-selected")).toBe("true"))
  })
})
