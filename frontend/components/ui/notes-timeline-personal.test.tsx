import React from "react"
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import { render, screen, cleanup, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { STRINGS } from "@/lib/i18n/strings"
import { NotesTimeline } from "@/components/ui/notes-timeline"

const h = vi.hoisted(() => ({
  store: { user: null as null | { id: number; username: string } },
  get: vi.fn(), markSeen: vi.fn(),
}))
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
vi.mock("@/lib/api", () => ({ api: { get: h.get, post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }))
vi.mock("@/lib/use-unread", () => ({ useMarkSeen: () => ({ mutate: h.markSeen }) }))
vi.mock("@/lib/use-require-auth", () => ({ useRequireAuth: () => ({ isGuest: false, requireAuth: (f: any) => f() }) }))
vi.mock("@/lib/use-is-mobile", () => ({ useIsMobile: () => false }))
vi.mock("@/lib/confirm", () => ({ askConfirm: vi.fn() }))
vi.mock("@/lib/i18n/useContentT", () => ({ useTranslatedField: (_a: string, _b: number, _c: string, content: string) => content }))
vi.mock("@/components/ui/avatar", () => ({ Avatar: () => null }))
vi.mock("@/components/ui/image-attachment", () => ({ isImageUrl: () => false, isUrl: () => false, ImageAttachment: () => null }))
vi.mock("@/components/ui/video-attachment", () => ({ VideoAttachment: () => null }))
afterEach(cleanup)

const mk = (id: number, author: string, content: string, stance: string | null, replies: any[] = []) => ({
  id, entity_type: "hypothesis", entity_id: 7, author_id: author === "own" ? 1 : 2, author_username: author,
  author_display: author, author_avatar_url: null, content, parent_id: null, stance,
  created_at: "2026-11-06T10:00:00Z", is_new: false, replies,
})
const DATA = [
  mk(1, "own", "NOTE-SELF", null, [mk(2, "own", "NOTE-SELF-REPLY", null)]),
  mk(3, "guest", "DISCUSS-1", "confirm"),
]

function renderNotes(props: Record<string, unknown> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><NotesTimeline entityType="hypothesis" entityId={7} {...props} /></QueryClientProvider>)
}
beforeEach(() => {
  h.store.user = { id: 1, username: "own" }
  h.get.mockReset().mockResolvedValue({ data: DATA })
  h.markSeen.mockReset()
})

describe("NotesTimeline: личные заметки владельца", () => {
  it("по умолчанию — все комментарии записи; «прочитано» отмечается один раз после загрузки", async () => {
    renderNotes()
    expect(await screen.findByText("DISCUSS-1")).toBeTruthy()
    expect(screen.getByText("NOTE-SELF")).toBeTruthy()
    await waitFor(() => expect(h.markSeen).toHaveBeenCalledTimes(1))
  })

  it("personalOnly: только заметки владельца с ответами, чужое обсуждение не показывается", async () => {
    renderNotes({ personalOnly: true })
    expect(await screen.findByText("NOTE-SELF")).toBeTruthy()
    expect(screen.getByText("NOTE-SELF-REPLY")).toBeTruthy()
    expect(screen.queryByText("DISCUSS-1")).toBeNull()
  })

  it("trackSeen=false: запись прочитанной не отмечается (это делает вкладка «Обсуждение»)", async () => {
    renderNotes({ personalOnly: true, trackSeen: false })
    await screen.findByText("NOTE-SELF")
    await new Promise(r => setTimeout(r, 60))
    expect(h.markSeen).not.toHaveBeenCalled()
  })

  it("bare прячет собственный заголовок «Заметки», без bare он виден", async () => {
    const { unmount } = renderNotes({ bare: true })
    await screen.findByText("NOTE-SELF")
    expect((screen.getByText(STRINGS["notes.title"]).parentElement as HTMLElement).style.display).toBe("none")
    unmount()
    renderNotes()
    await screen.findByText("NOTE-SELF")
    expect((screen.getByText(STRINGS["notes.title"]).parentElement as HTMLElement).style.display).toBe("flex")
  })
})
