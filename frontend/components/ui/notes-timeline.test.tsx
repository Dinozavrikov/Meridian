import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { STRINGS } from "@/lib/i18n/strings"
import { NotesTimeline } from "@/components/ui/notes-timeline"
import { ConfirmHost } from "@/components/ui/confirm-host"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return {
    useT: () => (key: string, vars?: Record<string, string | number>) =>
      Object.entries(vars ?? {}).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), STRINGS[key] ?? key),
  }
})
vi.mock("@/lib/store", () => {
  const state = { user: { id: 1, username: "alexey", display_name: "Алексей" }, locale: "ru" }
  return { useStore: (sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state) }
})
vi.mock("@/lib/use-is-mobile", () => ({ useIsMobile: () => false }))
vi.mock("@/lib/use-require-auth", () => ({
  useRequireAuth: () => ({ isGuest: false, requireAuth: (arg?: unknown) => { if (typeof arg === "function") (arg as () => void)(); return true } }),
}))
vi.mock("@/lib/use-unread", () => {
  const markSeen = Object.assign(vi.fn(), { mutate: vi.fn(), mutateAsync: vi.fn() }) // и функция, и объект мутации
  return { useMarkSeen: () => markSeen }
})
vi.mock("@/lib/i18n/useContentT", () => ({ useTranslatedField: (_t: string, _i: number, _f: string, text: string) => text }))
vi.mock("next/link", async () => {
  const React = await vi.importActual<typeof import("react")>("react")
  return { default: ({ href, children }: { href: string; children: unknown }) => React.createElement("a", { href }, children as never) }
})

const S = STRINGS as Record<string, string>
const NOTE = {
  id: 3, content: "моя заметка", author_id: 1, author_username: "alexey", author_display: "Алексей", author_avatar_url: null,
  created_at: "2026-10-06T10:00:00Z", parent_id: null, replies: [],
}

// Настоящий компонент, настоящий клик и настоящий диалог (ConfirmHost); window.confirm не должен вызываться.
async function clickDelete(inLab: boolean) {
  vi.spyOn(api, "get").mockResolvedValue({ data: [NOTE] } as never)
  const del = vi.spyOn(api, "delete").mockResolvedValue({ data: {} } as never)
  const native = vi.spyOn(window, "confirm")
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <NotesTimeline entityType="observation" entityId={7} inLab={inLab} />
      <ConfirmHost />
    </QueryClientProvider>,
  )
  await screen.findByText("моя заметка")
  const edit = screen.getByText(S["notes.edit"]).closest("button") as HTMLElement
  fireEvent.click(edit.nextElementSibling as HTMLElement) // кнопка «корзина» стоит сразу за «Изменить»
  const dialog = await screen.findByRole("dialog")
  return { del, native, dialog }
}

describe("удаление заметки", () => {
  it("запись из лаборатории: диалог содержит предупреждение про снимки", async () => {
    const { native, dialog } = await clickDelete(true)
    expect(dialog.textContent).toContain(S["notes.deleteConfirm"])
    expect(dialog.textContent).toContain(S["notes.deleteConfirmSnapshots"])
    expect(native).not.toHaveBeenCalled()
  })

  it("личная запись: без предупреждения", async () => {
    const { dialog } = await clickDelete(false)
    expect(dialog.textContent).toContain(S["notes.deleteConfirm"])
    expect(dialog.textContent).not.toContain(S["notes.deleteConfirmSnapshots"])
  })

  it("отмена ничего не удаляет", async () => {
    const { del } = await clickDelete(true)
    fireEvent.click(screen.getByText(S["actions.cancel"]))
    await new Promise(r => setTimeout(r, 50))
    expect(del).not.toHaveBeenCalled()
  })

  it("подтверждение шлёт DELETE по id заметки", async () => {
    const { del } = await clickDelete(true)
    fireEvent.click(screen.getByText(S["confirm.delete"]))
    await waitFor(() => expect(del).toHaveBeenCalledWith("/api/v1/comments/3"))
  })
})
