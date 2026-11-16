import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { taskApi } from "@/lib/api"
import { STRINGS } from "@/lib/i18n/strings"
import { createLinksFor } from "@/components/entities/entity-link-picker"
import { QuickAddTaskModal } from "@/components/entities/quick-add-task-modal"

vi.mock("@/lib/toast", () => ({ toast: vi.fn() }))
vi.mock("@/lib/use-my-labs", () => ({ useMyLabs: () => ({ data: [] }) }))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
vi.mock("@/components/entities/entity-link-picker", () => ({ EntityLinkPicker: () => null, createLinksFor: vi.fn() }))

const S = STRINGS as Record<string, string>
beforeEach(() => { vi.mocked(createLinksFor).mockReset() })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe("QuickAddTaskModal", () => {
  it("статус не шлётся (сервер ставит «открыта»; «в работе» не существует), задача привязывается как «связано»", async () => {
    const create = vi.spyOn(taskApi, "create").mockResolvedValue({ id: 9 } as never)
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <QuickAddTaskModal open onClose={vi.fn()} targetType="hypothesis" targetId={3} targetLabel="Г" />
    </QueryClientProvider>)
    fireEvent.change(screen.getByPlaceholderText(S["tasks.namePlaceholder"]), { target: { value: "Задача" } })
    fireEvent.submit(document.querySelector("form")!)
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create.mock.calls[0][0]).toEqual({ name: "Задача", description: "", visibility: "private", lab_id: null })
    await waitFor(() => expect(createLinksFor).toHaveBeenCalledWith(
      "task", 9, [expect.objectContaining({ type: "hypothesis", id: 3, link_type: "связано" })]))
  })
})
