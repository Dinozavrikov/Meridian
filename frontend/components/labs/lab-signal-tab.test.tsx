import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { safeEntityHref } from "@/lib/entity-routes"
import { LabSignalTab } from "@/components/labs/lab-signal-tab"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return {
    useT: () => (key: string, params?: Record<string, string | number>) =>
      ((STRINGS as Record<string, string>)[key] ?? key).replace(/\{(\w+)\}/g, (_m, k) => String(params?.[k] ?? "")),
  }
})
vi.mock("@/lib/i18n/useDynamicT", () => ({ useDynamicTranslate: () => (s: string) => s }))
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: any) => <a href={href} {...r}>{children}</a> }))
vi.mock("@/components/entities/preview-link", () => ({
  PreviewLink: ({ type, id, href, children }: any) => <a data-testid="preview-link" data-type={type} data-id={id} href={href}>{children}</a>,
  PreviewLinkTitle: ({ children }: any) => <span>{children}</span>,
}))
const api = vi.hoisted(() => ({ signal: vi.fn() }))
vi.mock("@/lib/api", () => ({ labApi: { signal: api.signal } }))

const hyp = (over: object = {}) => ({
  id: 1, name: "Гипотеза А", maturity: 0, next_level: 1, next_threshold: 2, lab_total: 1.5, rest: 0,
  contributions: [
    { type: "prediction", id: 10, title: "Прогноз П", value: 1.2, mine: 1.2, votes: null },
    { type: "observation", id: 20, title: "Наблюдение Н", value: 0.3, mine: 0, votes: { n: 3, mean: 1 } },
  ], ...over,
})
const mount = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <LabSignalTab labId={5} />
  </QueryClientProvider>)
beforeEach(() => api.signal.mockReset())
afterEach(cleanup)

describe("LabSignalTab", () => {
  it("гипотеза и каждый вклад — PreviewLink с нужным типом и id (наведение / шторка)", async () => {
    api.signal.mockResolvedValue({ hypotheses: [hyp()] })
    mount()
    await screen.findAllByTestId("lab-signal-row")
    const got = screen.getAllByTestId("preview-link").map(a => `${a.getAttribute("data-type")}:${a.getAttribute("data-id")}`)
    expect(got).toEqual(["hypothesis:1", "prediction:10", "observation:20"])
  })
  it("полоска по вкладу лаборатории, вклады по порядку с сервера, ссылки живые", async () => {
    api.signal.mockResolvedValue({ hypotheses: [hyp()] })
    mount()
    expect((await screen.findByRole("progressbar")).getAttribute("aria-valuenow")).toBe("75")
    expect(screen.getByText("Вклад лаборатории")).toBeTruthy()
    const rows = screen.getAllByTestId("lab-signal-row")
    expect(rows[0].textContent).toContain("Прогноз П")
    expect(rows[1].textContent).toContain("Наблюдение Н")
    expect(rows[0].querySelector("a")!.getAttribute("href")).toBe(safeEntityHref("prediction", 10))
    expect(api.signal).toHaveBeenCalledWith(5)
  })
  it("«ваш вклад» только у своего, у наблюдения сводка голосов", async () => {
    api.signal.mockResolvedValue({ hypotheses: [hyp()] })
    mount()
    await screen.findAllByTestId("lab-signal-row")
    expect(screen.getAllByTestId("effect-lab-mine")).toHaveLength(1)
    expect(screen.getByTestId("effect-lab-mine").textContent).toBe("ваш вклад: +1.20")
    expect(screen.getByTestId("effect-lab-votes").textContent).toBe("голосов: 3, за: 100%")
  })
  it("личная строка только когда сервер прислал личные числа (владелец)", async () => {
    api.signal.mockResolvedValue({ hypotheses: [hyp({ pred_signal: 0.5, obs_signal: 0.1, total_signal: 2.0 })] })
    mount()
    expect((await screen.findByTestId("lab-signal-personal")).textContent).toContain("Сигнал гипотезы 2.00")
    cleanup(); api.signal.mockResolvedValue({ hypotheses: [hyp()] })
    mount()
    await screen.findAllByTestId("lab-signal-row")
    expect(screen.queryByTestId("lab-signal-personal")).toBeNull()
  })
  it("остаток удалённых прогнозов показывается только когда он не нулевой", async () => {
    api.signal.mockResolvedValue({ hypotheses: [hyp({ rest: -0.5 })] })
    mount()
    expect((await screen.findByTestId("lab-signal-rest")).textContent).toContain("-0.50")
    cleanup(); api.signal.mockResolvedValue({ hypotheses: [hyp()] })
    mount()
    await screen.findAllByTestId("lab-signal-row")
    expect(screen.queryByTestId("lab-signal-rest")).toBeNull()
  })
  it("нет вкладов и нет гипотез — понятные пустые состояния", async () => {
    api.signal.mockResolvedValue({ hypotheses: [hyp({ contributions: [] })] })
    mount()
    expect(await screen.findByText(/Пока нет вкладов/)).toBeTruthy()
    cleanup(); api.signal.mockResolvedValue({ hypotheses: [] })
    mount()
    expect(await screen.findByText("В лаборатории пока нет гипотез")).toBeTruthy()
  })
})
