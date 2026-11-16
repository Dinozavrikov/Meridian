import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { RelationManager } from "@/components/entities/relation-manager"
import { ToastHost } from "@/components/ui/toast-host"

const h = vi.hoisted(() => ({ get: vi.fn(), del: vi.fn() }))
vi.mock("@/lib/api", () => ({ api: { get: h.get, post: vi.fn(), delete: h.del, put: vi.fn() } }))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
vi.mock("@/lib/i18n/useTypeRu", () => ({ useTypeRu: () => ({ question: "Вопрос", task: "Задача" }) }))
vi.mock("@/lib/i18n/useDynamicT", () => ({ useDynamicTranslate: () => (s: string) => s }))
vi.mock("@/lib/i18n/useContentT", () => ({ useContentT: () => ({ ct: (_t: string, _i: number, _f: string, x: string) => x, ensure: () => {} }) }))
vi.mock("@/lib/i18n/use-translated-query", () => ({
  useTranslatedRelated: () => ({ isLoading: false, data: { related: {
    question: [{ id: 5, title: "Вопрос А", link_type: "конкурирующая гипотеза", direct: true, source: "competing", can_edit: true }],
    task: [{ id: 2, title: "Задача Б", link_type: "конкурирующая гипотеза", direct: true, source: "competing", can_edit: false }],
  } } }),
}))
vi.mock("@/components/entities/link-types", () => ({
  getLinkTypes: () => [{ value: "связано", label: "Связано", color: "#4A90D9" }],
}))
beforeEach(() => { h.get.mockReset(); h.del.mockReset(); h.get.mockResolvedValue({ data: [] }); h.del.mockResolvedValue({ data: "" }) })
afterEach(cleanup)

describe("RelationManager: конкурирующая гипотеза", () => {
  it("удаление идёт через эндпоинт родителя; без прав кнопки нет; меню смены типа недоступно", async () => {
    render(<QueryClientProvider client={new QueryClient()}><><RelationManager entityType="hypothesis" entityId={29} /><ToastHost /></></QueryClientProvider>)
    expect(screen.getAllByRole("button", { name: "Удалить связь" })).toHaveLength(1)
    expect(screen.queryAllByRole("button", { name: "Сменить тип связи" })).toHaveLength(0)
    fireEvent.click(screen.getByRole("button", { name: "Удалить связь" }))
    await waitFor(() => expect(h.del).toHaveBeenCalledWith("/api/v1/questions/5/hypotheses/29"))
  })
})
