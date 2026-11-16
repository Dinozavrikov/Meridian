import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { PreviewLink } from "@/components/entities/preview-link"
import { fitCard } from "@/components/entities/use-preview-popover"

const h = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock("@/lib/api", () => ({ api: { get: h.get } }))
vi.mock("@/lib/use-is-mobile", () => ({ useIsMobile: () => false }))
vi.mock("@/lib/store", () => ({ useStore: (sel: (s: unknown) => unknown) => sel({ user: null }) }))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string, p?: Record<string, string>) =>
    Object.entries(p ?? {}).reduce((a, [k, v]) => a.replace(`{${k}}`, v), (STRINGS as Record<string, string>)[key] ?? key) }
})
vi.mock("@/lib/i18n/useTypeRu", () => ({ useTypeRu: () => ({ hypothesis: "Гипотеза" }) }))

describe("fitCard (чистая функция)", () => {
  it("помещается снизу — положение как у placeCard", () => {
    expect(fitCard({ left: 10, top: 100, bottom: 120 }, { w: 340, h: 200 }, 1200, 900)).toMatchObject({ left: 10, top: 128 })
  })
  it("не помещается ни снизу, ни сверху: берёт сторону побольше, высота ограничена, из окна не вылезает", () => {
    const r = fitCard({ left: 10, top: 413, bottom: 421 }, { w: 340, h: 1400 }, 1920, 947)
    expect(r.top).toBe(429)
    expect(r.top + r.maxHeight).toBeLessThanOrEqual(947 - 8)
    expect(r.maxHeight).toBeGreaterThan(400)
  })
  it("сверху места больше — карточка упирается в ссылку сверху и не заходит на неё", () => {
    const r = fitCard({ left: 10, top: 700, bottom: 720 }, { w: 340, h: 1000 }, 1200, 800)
    expect(r.top).toBeGreaterThanOrEqual(8)
    expect(r.top + r.maxHeight).toBe(700 - 8)
  })
  it("совсем тесно: на всю высоту окна с полями", () => {
    expect(fitCard({ left: 10, top: 60, bottom: 80 }, { w: 340, h: 500 }, 1200, 200)).toMatchObject({ top: 8, maxHeight: 184 })
  })
})

describe("PreviewLink: высокая карточка", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    h.get.mockReset()
    h.get.mockResolvedValue({ data: { type: "hypothesis", id: 5, title: "Заг", excerpt: "Т", status: null, visibility: "public",
      created_at: null, author: { username: "u", display_name: "А" }, is_owner: false, tags: [], metrics: [], links_count: 0 } })
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 947 })
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1920 })
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get() { return (this as HTMLElement).getAttribute("role") === "dialog" ? 2000 : 0 } })
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const a = this.tagName === "A"
      return { left: a ? 10 : 0, top: a ? 413 : 0, bottom: a ? 421 : 0, height: a ? 8 : 0, width: 0, right: 0, x: 0, y: 0, toJSON() {} } as DOMRect
    })
  })
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); delete (HTMLElement.prototype as { scrollHeight?: number }).scrollHeight })

  it("карточка выше окна получает предельную высоту по месту под ссылкой и прокрутку", async () => {
    render(<QueryClientProvider client={new QueryClient()}><PreviewLink type="hypothesis" id={5} href="/h?id=5">Гипотеза</PreviewLink></QueryClientProvider>)
    fireEvent.mouseEnter(screen.getByRole("link", { name: "Гипотеза" }))
    act(() => { vi.advanceTimersByTime(310) })
    await screen.findByText("Заг")
    const card = screen.getByRole("dialog") as HTMLElement
    expect(card.style.top).toBe("429px")
    expect(card.style.maxHeight).toBe("510px") // 947 − 8 (поле) − 429
    expect(card.style.overflowY).toBe("auto")
  })
})
