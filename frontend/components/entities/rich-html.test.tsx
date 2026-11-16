import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { RichHtml } from "@/components/entities/rich-html"

const h = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock("@/lib/api", () => ({ api: { get: h.get } }))
vi.mock("@/lib/use-is-mobile", () => ({ useIsMobile: () => false }))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string, p?: Record<string, string>) =>
    Object.entries(p ?? {}).reduce((a, [k, v]) => a.replace(`{${k}}`, v), (STRINGS as Record<string, string>)[key] ?? key) }
})
vi.mock("@/lib/i18n/useTypeRu", () => ({ useTypeRu: () => ({ hypothesis: "Гипотеза" }) }))

const preview = { type: "hypothesis", id: 5, title: "Заголовок гипотезы", excerpt: "Выдержка", status: null, visibility: "private",
  created_at: null, author: { username: "u", display_name: "Автор" }, is_owner: true, tags: [], metrics: [], links_count: 0 }
const HTML = '<p>См. <a href="meridian://hypothesis/5"><b>гипотезу</b></a>, <a href="https://example.com/x">сайт</a>, <a href="meridian://result/9">старая</a></p>'

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  h.get.mockReset()
  h.get.mockImplementation((url: string) => url.includes("/hypothesis/5/") ? Promise.resolve({ data: preview }) : Promise.reject(new Error("404")))
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

const mount = () => render(
  <QueryClientProvider client={new QueryClient()}><RichHtml html={HTML} accent="#4A90D9" /></QueryClientProvider>)
const link = () => screen.getByText("гипотезу").closest("a") as HTMLAnchorElement

describe("RichHtml", () => {
  it("наведение на внутреннюю ссылку (даже на вложенный <b>) открывает карточку через 300 мс", async () => {
    mount()
    fireEvent.mouseOver(screen.getByText("гипотезу"))
    act(() => { vi.advanceTimersByTime(299) })
    expect(screen.queryByRole("dialog")).toBeNull()
    act(() => { vi.advanceTimersByTime(2) })
    expect(await screen.findByText("Заголовок гипотезы")).toBeTruthy()
    expect(h.get).toHaveBeenCalledWith("/api/v1/hypothesis/5/preview")
  })
  it("клик закрепляет карточку без перехода; уход мыши не закрывает; клик мимо закрывает", async () => {
    mount()
    expect(fireEvent.click(link())).toBe(false)
    expect(await screen.findByText("Заголовок гипотезы")).toBeTruthy()
    fireEvent.mouseOut(link()); act(() => { vi.advanceTimersByTime(1000) })
    expect(screen.getByRole("dialog")).toBeTruthy()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole("dialog")).toBeNull()
  })
  it("закреплённая карточка не перенацеливается на другую ссылку при наведении", async () => {
    mount()
    fireEvent.click(link()); await screen.findByText("Заголовок гипотезы")
    fireEvent.mouseOver(screen.getByText("старая")); act(() => { vi.advanceTimersByTime(500) })
    expect(h.get).toHaveBeenCalledTimes(1)
  })
  it("Esc закрывает карточку, но не доходит до модалки; фокус возвращается на ссылку и карточка не всплывает снова", async () => {
    mount()
    const modalClose = vi.fn()
    document.addEventListener("keydown", modalClose)
    fireEvent.click(link()); await screen.findByText("Заголовок гипотезы")
    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(modalClose).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(link())
    act(() => { vi.advanceTimersByTime(600) })
    expect(screen.queryByRole("dialog")).toBeNull()
    document.removeEventListener("keydown", modalClose)
  })
  it("если HTML перерисовали (пришёл перевод), закреплённая карточка находит ссылку заново и фокус возвращается на неё", async () => {
    const qc = new QueryClient()
    const { rerender } = render(<QueryClientProvider client={qc}><RichHtml html={HTML} accent="#4A90D9" /></QueryClientProvider>)
    fireEvent.click(link()); await screen.findByText("Заголовок гипотезы")
    const old = link()
    rerender(<QueryClientProvider client={qc}><RichHtml html={HTML.replace("См.", "Смотри")} accent="#4A90D9" /></QueryClientProvider>)
    expect(old.isConnected).toBe(false)
    fireEvent.keyDown(document, { key: "Escape" })
    expect(document.activeElement).toBe(link())
  })
  it("смена состояния (наведение, закрепление, закрытие) не пересоздаёт узлы ссылок в тексте", async () => {
    mount()
    const before = link()
    fireEvent.mouseOver(before); act(() => { vi.advanceTimersByTime(310) })
    fireEvent.click(before); await screen.findByText("Заголовок гипотезы")
    expect(link()).toBe(before)
    fireEvent.mouseDown(document.body)
    expect(link()).toBe(before)
    expect(before.isConnected).toBe(true)
  })
  it("Ctrl-клик открывает запись в новой вкладке, карточку не закрепляет", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null)
    mount()
    expect(fireEvent.click(link(), { ctrlKey: true })).toBe(false)
    expect(open).toHaveBeenCalledWith("/hypotheses?id=5&tab=detail", "_blank", "noopener")
    expect(screen.queryByRole("dialog")).toBeNull()
  })
  it("обычные ссылки не перехватываются", () => {
    mount()
    let prevented: boolean | null = null
    document.addEventListener("click", e => { prevented = e.defaultPrevented; e.preventDefault() }, { once: true })
    fireEvent.click(screen.getByText("сайт"))
    expect(prevented).toBe(false)
    expect(screen.queryByRole("dialog")).toBeNull()
  })
  it("ссылка на неизвестный тип даёт честное «недоступна»", async () => {
    mount()
    fireEvent.click(screen.getByText("старая"))
    expect(await screen.findByText(/недоступна/i)).toBeTruthy()
  })
  it("ссылки красятся цветом типа записи", () => {
    const { container } = mount()
    expect(container.querySelector("style")?.textContent).toMatch(/a\[href\^="meridian:\/\/hypothesis\/"\]\{color:/)
  })
})
