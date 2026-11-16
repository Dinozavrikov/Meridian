import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { STRINGS } from "@/lib/i18n/strings"
import { MaturitySuggestionBanner } from "@/components/entities/maturity-suggestion-banner"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return {
    useT: () => (key: string, params?: Record<string, string | number>) =>
      ((STRINGS as Record<string, string>)[key] ?? key).replace(/\{(\w+)\}/g, (_m, k) => String(params?.[k] ?? "")),
  }
})
vi.mock("@/lib/i18n/useDynamicT", () => ({ useDynamicTranslate: () => (s: string) => s }))
vi.mock("@/lib/use-is-mobile", () => ({ useIsMobile: () => false }))

const api = vi.hoisted(() => ({ get: vi.fn(), accept: vi.fn(), dismiss: vi.fn() }))
vi.mock("@/lib/api", () => ({
  hypApi: { getMaturitySuggestion: api.get, acceptMaturitySuggestion: api.accept, dismissMaturitySuggestion: api.dismiss },
}))

const S = STRINGS as Record<string, string>
const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MaturitySuggestionBanner hypothesisId={7} />
    </QueryClientProvider>,
  )

beforeEach(() => { api.get.mockReset(); api.accept.mockReset().mockResolvedValue({}); api.dismiss.mockReset().mockResolvedValue({}) })
afterEach(cleanup)

describe("MaturitySuggestionBanner", () => {
  it("нет предложения — ничего не показывает", async () => {
    api.get.mockResolvedValue(null)
    const { container } = mount()
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(7))
    expect(container.firstChild).toBeNull()
  })

  it("повышение: названия уровней и причина на виду; «принять» шлёт запрос по этой гипотезе", async () => {
    api.get.mockResolvedValue({ current_level: 1, suggested_level: 3, reason: "Три независимых подтверждения" })
    mount()
    expect(await screen.findByText("Формула предлагает поднять зрелость: Первые наблюдения → Многократно подтверждена")).toBeTruthy()
    expect(screen.getByText("Три независимых подтверждения")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: S["maturityBanner.accept"] }))
    await waitFor(() => expect(api.accept).toHaveBeenCalledWith(7))
    expect(api.dismiss).not.toHaveBeenCalled()
  })

  it("понижение формулируется иначе; «отклонить» шлёт отклонение, а не принятие", async () => {
    api.get.mockResolvedValue({ current_level: 3, suggested_level: 1, reason: "Опровергающий прогноз" })
    mount()
    expect(await screen.findByText(/Формула предлагает понизить зрелость/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: S["maturityBanner.dismiss"] }))
    await waitFor(() => expect(api.dismiss).toHaveBeenCalledWith(7))
    expect(api.accept).not.toHaveBeenCalled()
  })
})

describe("MaturitySuggestionBanner: части сигнала", () => {
  it("есть числа — текст собирается из них через useT, а не берётся готовая строка reason", async () => {
    api.get.mockResolvedValue({
      current_level: 0, suggested_level: 1, reason: "ГОТОВАЯ СТРОКА С БЭКЕНДА",
      raw_signal: 3.62, pred_signal: 0, obs_signal: 0.3, lab_signal: 3.32,
    })
    mount()
    expect(await screen.findByText(/3\.62/)).toBeTruthy()
    expect(screen.getByText(/лаборатория: 3\.32/)).toBeTruthy()
    expect(screen.queryByText("ГОТОВАЯ СТРОКА С БЭКЕНДА")).toBeNull()
  })
})
