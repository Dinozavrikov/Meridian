import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MaturityProgress } from "@/components/entities/maturity-progress"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return {
    useT: () => (key: string, params?: Record<string, string | number>) =>
      ((STRINGS as Record<string, string>)[key] ?? key).replace(/\{(\w+)\}/g, (_m, k) => String(params?.[k] ?? "")),
  }
})
vi.mock("@/lib/i18n/useDynamicT", () => ({ useDynamicTranslate: () => (s: string) => s }))
const api = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock("@/lib/api", () => ({ hypApi: { maturityProgress: api.get } }))

const base = { pred_signal: 0, obs_signal: 0.3, lab_signal: 1.2, total_signal: 1.5, maturity: 0, next_level: 1, next_threshold: 3, signal_level: 0 }
const mount = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MaturityProgress hypothesisId={7} />
  </QueryClientProvider>)

beforeEach(() => api.get.mockReset())
afterEach(cleanup)

describe("MaturityProgress", () => {
  it("полоска заполнена пропорционально сигналу, подпись и три части видны", async () => {
    api.get.mockResolvedValue(base)
    mount()
    const bar = await screen.findByRole("progressbar")
    expect(bar.getAttribute("aria-valuenow")).toBe("50")
    expect(screen.getByText(/1\.50 из 3\.00 до уровня «Первые наблюдения»/)).toBeTruthy()
    expect(screen.getByText(/лаборатория: 1\.20/)).toBeTruthy()
    expect(api.get).toHaveBeenCalledWith(7)
  })
  it("пропорция на второй точке: 0.75 из 3 — это 25%, не 50%", async () => {
    api.get.mockResolvedValue({ ...base, total_signal: 0.75, obs_signal: 0.3, lab_signal: 0.45 })
    mount()
    expect((await screen.findByRole("progressbar")).getAttribute("aria-valuenow")).toBe("25")
  })
  it("отрицательный сигнал — полоска пустая, а не уходит в минус", async () => {
    api.get.mockResolvedValue({ ...base, total_signal: -1, pred_signal: -1, obs_signal: 0, lab_signal: 0 })
    mount()
    expect((await screen.findByRole("progressbar")).getAttribute("aria-valuenow")).toBe("0")
  })
  it("сигнала достаточно — полоска полная и подпись «достаточно»", async () => {
    api.get.mockResolvedValue({ ...base, total_signal: 4, signal_level: 1 })
    mount()
    expect((await screen.findByRole("progressbar")).getAttribute("aria-valuenow")).toBe("100")
    expect(screen.getByText(/Сигнала достаточно для уровня «Первые наблюдения»/)).toBeTruthy()
  })
  it("максимальный уровень — вместо полоски одна строка", async () => {
    api.get.mockResolvedValue({ ...base, maturity: 4, next_level: null, next_threshold: null })
    mount()
    expect(await screen.findByTestId("maturity-progress-top")).toBeTruthy()
    expect(screen.queryByRole("progressbar")).toBeNull()
  })
  it("нет данных — ничего не рисует", async () => {
    api.get.mockResolvedValue(null)
    const { container } = mount()
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(container.firstChild).toBeNull()
  })
})
