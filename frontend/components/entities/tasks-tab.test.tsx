import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { STRINGS } from "@/lib/i18n/strings"
import { TasksTab } from "@/components/entities/tasks-tab"

const h = vi.hoisted(() => ({ remove: vi.fn() }))
vi.mock("@/lib/use-remove-link", () => ({ useRemoveLinkWithUndo: () => ({ mutate: h.remove }) }))
vi.mock("@/lib/store", () => ({ useStore: (sel: any) => sel({ user: { id: 1 } }) }))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
vi.mock("@/components/layout/resizable-layout", () => ({ useIsMobile: () => false }))
vi.mock("@/components/ui/status-badge", () => ({ StatusBadge: ({ status }: any) => <span data-testid="badge">{status}</span> }))
vi.mock("@/components/entities/link-existing-modal", () => ({ LinkExistingModal: () => null }))
vi.mock("@/components/entities/quick-add-task-modal", () => ({ QuickAddTaskModal: ({ open }: any) => open ? <div data-testid="qa" /> : null }))
vi.mock("@/lib/i18n/use-translated-query", () => ({
  useTranslatedRelated: () => ({ isLoading: false, data: { related: { task: [
    { id: 1, title: "Т1", status: "открыта" }, { id: 2, title: "Т2", status: "исследуется" },
    { id: 3, title: "Т3", status: "решена" }, { id: 4, title: "Т4", status: "закрыта" },
  ] } } }),
}))

const S = STRINGS as Record<string, string>
beforeEach(() => { h.remove.mockReset() })
afterEach(cleanup)
function mount() {
  render(<QueryClientProvider client={new QueryClient()}><TasksTab entityType="hypothesis" entityId={1} entityName="Г" /></QueryClientProvider>)
}

describe("TasksTab: настоящие статусы задачи", () => {
  it("прогресс считает решена и закрыта; «исследуется» в группе «В процессе»", () => {
    mount()
    expect(screen.getByText("2 / 4")).toBeTruthy()
    expect(screen.getByText(S["tasksTab.status.inProgress"])).toBeTruthy()
    expect(screen.getByText("Т2")).toBeTruthy()
    expect(screen.getByText("Т1")).toBeTruthy()
  })
  it("группа «Выполнено» свёрнута и раскрывается: решена и закрыта внутри", () => {
    mount()
    expect(screen.queryByText("Т3")).toBeNull()
    fireEvent.click(screen.getByText(S["tasksTab.status.done"]))
    expect(screen.getByText("Т3")).toBeTruthy()
    expect(screen.getByText("Т4")).toBeTruthy()
  })
  it("× убирает связь именно этой задачи", () => {
    mount()
    fireEvent.click(screen.getAllByRole("button", { name: S["relations.remove"] })[0])
    expect(h.remove).toHaveBeenCalledWith({ toType: "task", toId: 2 })
  })
  it("создание открывает QuickAddTaskModal (форма с видимостью и привязкой), а не встроенную форму", () => {
    mount()
    expect(screen.queryByTestId("qa")).toBeNull()
    fireEvent.click(screen.getByText(S["tasksTab.quickAdd"]))
    expect(screen.getByTestId("qa")).toBeTruthy()
  })
})
