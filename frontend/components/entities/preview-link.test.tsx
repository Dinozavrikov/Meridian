import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { PreviewLink, placeCard } from "@/components/entities/preview-link"

const h = vi.hoisted(() => ({ get: vi.fn(), mobile: false }))
vi.mock("@/lib/api", () => ({ api: { get: h.get } }))
vi.mock("@/lib/use-is-mobile", () => ({ useIsMobile: () => h.mobile }))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string, p?: Record<string, string>) =>
    Object.entries(p ?? {}).reduce((a, [k, v]) => a.replace(`{${k}}`, v), (STRINGS as Record<string, string>)[key] ?? key) }
})
vi.mock("@/lib/i18n/useTypeRu", () => ({ useTypeRu: () => ({ hypothesis: "Гипотеза" }) }))
vi.mock("@/lib/i18n/useDynamicT", () => ({ useDynamicTranslate: () => (s: string) => s }))

const preview = { type: "hypothesis", id: 5, title: "Заголовок гипотезы", excerpt: "Выдержка текста", status: "идея", visibility: "private",
  created_at: "2026-09-01T10:00:00Z", author: { username: "u", display_name: "Автор" }, is_owner: true, tags: ["альфа"],
  metrics: [{ key: "maturity", value: 3 }], links_count: 2 }

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); h.get.mockReset(); h.get.mockResolvedValue({ data: preview }); h.mobile = false })
afterEach(() => { cleanup(); vi.useRealTimers() })

const mount = () => render(
  <QueryClientProvider client={new QueryClient()}>
    <PreviewLink type="hypothesis" id={5} href="/hypotheses?id=5&tab=detail" context={{ label: "Подтверждает" }}>Гипотеза А</PreviewLink>
  </QueryClientProvider>,
)

describe("placeCard", () => {
  it("под ссылкой; если снизу тесно — над ней; не выходит за правый край", () => {
    expect(placeCard({ left: 10, top: 100, bottom: 120 }, { w: 340, h: 200 }, 1200, 900)).toEqual({ left: 10, top: 128 })
    expect(placeCard({ left: 10, top: 700, bottom: 720 }, { w: 340, h: 200 }, 1200, 800).top).toBe(700 - 8 - 200)
    expect(placeCard({ left: 1100, top: 100, bottom: 120 }, { w: 340, h: 200 }, 1200, 900).left).toBe(1200 - 340 - 8)
  })
})

describe("PreviewLink: десктоп", () => {
  it("карточка открывается через 300 мс, не раньше, и показывает данные и связь", async () => {
    mount()
    fireEvent.mouseEnter(screen.getByRole("link", { name: "Гипотеза А" }))
    act(() => { vi.advanceTimersByTime(299) })
    expect(screen.queryByRole("dialog")).toBeNull()
    act(() => { vi.advanceTimersByTime(2) })
    expect(screen.getByRole("dialog")).toBeTruthy()
    expect(await screen.findByText("Заголовок гипотезы")).toBeTruthy()
    expect(screen.getByText("Выдержка текста")).toBeTruthy()
    expect(screen.getByText("Подтверждает")).toBeTruthy()
    expect(h.get).toHaveBeenCalledWith("/api/v1/hypothesis/5/preview")
  })
  it("уход курсора закрывает через 150 мс, уход на саму карточку не закрывает", () => {
    mount()
    const a = screen.getByRole("link", { name: "Гипотеза А" })
    fireEvent.mouseEnter(a); act(() => { vi.advanceTimersByTime(310) })
    fireEvent.mouseLeave(a)
    fireEvent.mouseEnter(screen.getByRole("dialog")); act(() => { vi.advanceTimersByTime(400) })
    expect(screen.getByRole("dialog")).toBeTruthy()
    fireEvent.mouseLeave(screen.getByRole("dialog")); act(() => { vi.advanceTimersByTime(160) })
    expect(screen.queryByRole("dialog")).toBeNull()
  })
  it("фокус открывает, Esc закрывает; быстрый проход мышью ничего не открывает", () => {
    mount()
    const a = screen.getByRole("link", { name: "Гипотеза А" })
    fireEvent.mouseEnter(a); fireEvent.mouseLeave(a); act(() => { vi.advanceTimersByTime(500) })
    expect(screen.queryByRole("dialog")).toBeNull()
    fireEvent.focus(a); act(() => { vi.advanceTimersByTime(310) })
    expect(screen.getByRole("dialog")).toBeTruthy()
    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
  })
  it("запись недоступна — честный текст", async () => {
    h.get.mockRejectedValue(new Error("404"))
    mount()
    fireEvent.mouseEnter(screen.getByRole("link", { name: "Гипотеза А" })); act(() => { vi.advanceTimersByTime(310) })
    expect(await screen.findByText(/недоступна/i)).toBeTruthy()
  })
})

describe("PreviewLink: мобильный", () => {
  it("нажатие открывает шторку вместо перехода, в ней кнопка «Открыть запись», крестик закрывает", async () => {
    h.mobile = true
    mount()
    const ev = fireEvent.click(screen.getByRole("link", { name: "Гипотеза А" }))
    expect(ev).toBe(false) // переход отменён
    expect(await screen.findByText("Заголовок гипотезы")).toBeTruthy()
    expect(screen.getByRole("link", { name: /Открыть запись/ }).getAttribute("href")).toBe("/hypotheses?id=5&tab=detail")
    fireEvent.click(screen.getByRole("button", { name: /Закрыть/ }))
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
