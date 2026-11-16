import { describe, it, expect, vi, beforeEach } from "vitest"
import { act, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { STRINGS } from "@/lib/i18n/strings"
import { NotesTimeline } from "@/components/ui/notes-timeline"

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string, vars?: Record<string, string | number>) =>
    Object.entries(vars ?? {}).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), STRINGS[key] ?? key) }
})
vi.mock("@/lib/store", () => {
  const state = { user: { id: 1, username: "alexey", display_name: "Алексей" }, locale: "ru" }
  return { useStore: (sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state) }
})
vi.mock("@/lib/use-is-mobile", () => ({ useIsMobile: () => false }))
vi.mock("@/lib/use-require-auth", () => ({ useRequireAuth: () => ({ isGuest: false, requireAuth: () => true }) }))
vi.mock("@/lib/use-unread", () => ({ useMarkSeen: () => ({ mutate, mutateAsync: vi.fn() }) }))
vi.mock("@/lib/i18n/useContentT", () => ({ useTranslatedField: (_t: string, _i: number, _f: string, text: string) => text }))
vi.mock("next/link", async () => {
  const React = await vi.importActual<typeof import("react")>("react")
  return { default: ({ href, children, ...r }: any) => React.createElement("a", { href, ...r }, children) }
})

const S = STRINGS as Record<string, string>
const mk = (id: number, o: any = {}) => ({ id, content: `c${id}`, author_id: 2, author_username: "anna", author_display: "Анна", author_avatar_url: null,
  created_at: "2026-10-06T10:00:00Z", parent_id: null, is_new: false, replies: [], ...o })

function mount(data: any[], access?: string, type = "observation") {
  const get = vi.spyOn(api, "get").mockResolvedValue({ data } as never)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={qc}><NotesTimeline entityType={type} entityId={7} access={access} /></QueryClientProvider>)
  return { qc, get }
}
beforeEach(() => { vi.restoreAllMocks(); mutate.mockClear() })

describe("NotesTimeline: доступ", () => {
  it("opened: вместо формы строка с замком, действий нет", async () => {
    mount([mk(1)], "opened")
    expect(await screen.findByTestId("notes-readonly")).toBeTruthy()
    expect(screen.queryByPlaceholderText(S["notes.composePlaceholderFull"])).toBeNull()
    expect(screen.queryByText(S["notes.reply"])).toBeNull()
  })
  it("owner: форма есть, замка нет", async () => {
    mount([mk(1)], "owner")
    expect(await screen.findByPlaceholderText(S["notes.composePlaceholderFull"])).toBeTruthy()
    expect(screen.queryByTestId("notes-readonly")).toBeNull()
  })
})

describe("NotesTimeline: новые", () => {
  it("разделитель «Новые · N» переживает перечитывание, когда сервер уже считает всё прочитанным", async () => {
    const { qc, get } = mount([mk(1), mk(2, { is_new: true, replies: [mk(3, { is_new: true, parent_id: 2 })] })])
    expect((await screen.findByTestId("notes-new-divider")).textContent).toBe("Новые · 2")
    get.mockResolvedValue({ data: [mk(1), mk(2, { replies: [mk(3, { parent_id: 2 })] })] } as never)
    await act(async () => { await qc.invalidateQueries({ queryKey: ["comments", "observation", 7] }) })
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
    expect(screen.getByTestId("notes-new-divider")).toBeTruthy()
  })
  it("без новых разделителя нет", async () => {
    mount([mk(1)])
    await screen.findByTestId("note-1")
    expect(screen.queryByTestId("notes-new-divider")).toBeNull()
  })
  it("markSeen вызывается только после загрузки списка", async () => {
    let release!: (v: unknown) => void
    vi.spyOn(api, "get").mockReturnValue(new Promise(r => { release = r }) as never)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={qc}><NotesTimeline entityType="observation" entityId={7} /></QueryClientProvider>)
    await new Promise(r => setTimeout(r, 30))
    expect(mutate).not.toHaveBeenCalled()
    release({ data: [mk(1)] })
    await waitFor(() => expect(mutate).toHaveBeenCalledWith({ entityType: "observation", entityId: 7 }))
  })
})

describe("NotesTimeline: вид", () => {
  it("ответ вложен в заметку-родителя", async () => {
    mount([mk(3, { replies: [mk(4, { content: "ответ", parent_id: 3 })] })])
    const parent = await screen.findByTestId("note-3")
    expect(parent.contains(screen.getByText("ответ"))).toBe(true)
  })
  it("пустое состояние зависит от типа записи", async () => {
    mount([], undefined, "prediction")
    expect(await screen.findByText(S["notes.emptyPrompt.prediction"])).toBeTruthy()
  })
})
