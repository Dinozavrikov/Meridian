import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup, fireEvent } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { RelationManager } from "@/components/entities/relation-manager"
import { ToastHost } from "@/components/ui/toast-host"

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn(), delete: vi.fn(), put: vi.fn() } }))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string, p?: Record<string, string>) => ((STRINGS as Record<string, string>)[key] ?? key).replace("{title}", p?.title ?? "") }
})
vi.mock("@/lib/i18n/useTypeRu", () => ({ useTypeRu: () => ({ hypothesis: "Гипотеза", question: "Вопрос", prediction: "Прогноз" }) }))
vi.mock("@/lib/i18n/useDynamicT", () => ({ useDynamicTranslate: () => (s: string) => s }))
vi.mock("@/lib/i18n/useContentT", () => ({ useContentT: () => ({ ct: (_t: string, _i: number, _f: string, x: string) => x, ensure: () => {} }),
  useTranslatedField: (_t: string, _i: number, _f: string, x: string) => x,
}))
vi.mock("@/lib/i18n/use-translated-query", () => ({
  useTranslatedRelated: () => ({
    isLoading: false,
    data: { related: {
      hypothesis: [{ id: 5, title: "Гипотеза А", link_type: "связано", direct: true, source: "link", can_edit: true }],
      question: [{ id: 8, title: "Вопрос Б", link_type: "связано", direct: false, source: "link", can_edit: false, parent_type: "hypothesis", parent_id: 5 }],
      prediction: [{ id: 3, title: "Прогноз В", link_type: "прогноз", direct: true, source: "field", can_edit: false }],
    } },
  }),
}))
vi.mock("@/components/entities/link-types", () => ({
  getLinkTypes: () => [{ value: "связано", label: "Связано", color: "#4A90D9" }],
}))
afterEach(cleanup)

describe("RelationManager: управление только там, где оно работает", () => {
  it("своя прямая связь редактируется, косвенная и из поля — только с пометкой", () => {
    render(<QueryClientProvider client={new QueryClient()}><><RelationManager entityType="observation" entityId={1} /><ToastHost /></></QueryClientProvider>)
    expect(screen.getAllByRole("button", { name: "Удалить связь" })).toHaveLength(1)
    expect(screen.queryByText(/Через «Гипотеза А»/)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /Косвенные связи/ }))
    expect(screen.getByText(/Через «Гипотеза А»/)).toBeTruthy()
    expect(screen.getByText(/Задана в самой записи/)).toBeTruthy()
  })
})

describe("RelationManager: предпросмотр косвенных записей", () => {
  it("косвенная запись — ссылка с карточкой: наведение открывает предпросмотр с «Через …»", async () => {
    const { act } = await import("@testing-library/react")
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<QueryClientProvider client={new QueryClient()}><><RelationManager entityType="observation" entityId={1} /><ToastHost /></></QueryClientProvider>)
    fireEvent.click(screen.getByRole("button", { name: /Косвенные связи/ }))
    fireEvent.mouseEnter(screen.getByRole("link", { name: /Вопрос Б/ }))
    act(() => { vi.advanceTimersByTime(310) })
    expect(screen.getByRole("dialog")).toBeTruthy()
    vi.useRealTimers()
  })
})
