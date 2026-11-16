import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { RichHtml } from "@/components/entities/rich-html"

const h = vi.hoisted(() => ({ get: vi.fn(), user: null as null | { username: string }, tr: vi.fn() }))
vi.mock("@/lib/api", () => ({ api: { get: h.get } }))
vi.mock("@/lib/use-is-mobile", () => ({ useIsMobile: () => false }))
vi.mock("@/lib/store", () => ({ useStore: (sel: (s: unknown) => unknown) => sel({ user: h.user }) }))
vi.mock("@/lib/i18n/useContentT", () => ({
  useTranslatedField: (...a: unknown[]) => { h.tr(...a); const [, , , text, skip] = a as [string, number, string, string, boolean]; return skip ? text : `TR:${text}` },
}))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string, p?: Record<string, string>) =>
    Object.entries(p ?? {}).reduce((a, [k, v]) => a.replace(`{${k}}`, v), (STRINGS as Record<string, string>)[key] ?? key) }
})
vi.mock("@/lib/i18n/useTypeRu", () => ({ useTypeRu: () => ({ hypothesis: "Гипотеза" }) }))

const mk = (over: object) => ({ type: "hypothesis", id: 5, title: "Заг", excerpt: "Текст", status: null, visibility: "private",
  created_at: null, author: { username: "boris", display_name: "Борис" }, is_owner: false, tags: [], metrics: [], links_count: 0, ...over })
const mount = () => render(<QueryClientProvider client={new QueryClient()}><RichHtml html='<a href="meridian://hypothesis/5">к</a>' accent="#fff" /></QueryClientProvider>)
const pin = () => fireEvent.click(screen.getByText("к"))

beforeEach(() => { h.get.mockReset(); h.tr.mockReset(); h.user = { username: "me" } })
afterEach(cleanup)

describe("закреплённая карточка", () => {
  it("«Открыть» ведёт на страницу записи, автор — на профиль; у закрытой записи обсуждения нет", async () => {
    h.get.mockResolvedValue({ data: mk({}) })
    mount(); pin()
    expect((await screen.findByRole("link", { name: /Открыть запись/ })).getAttribute("href")).toBe("/hypotheses?id=5&tab=detail")
    expect((await screen.findByRole("link", { name: /Борис/ })).getAttribute("href")).toBe("/profile/boris")
    expect(screen.queryByRole("link", { name: /Обсуждение/ })).toBeNull()
  })
  it("у публичной записи есть «Обсуждение»", async () => {
    h.get.mockResolvedValue({ data: mk({ visibility: "public" }) })
    mount(); pin()
    expect((await screen.findByRole("link", { name: /Обсуждение/ })).getAttribute("href")).toBe("/feed/discussion/hypothesis/5")
  })
  it("запись недоступна (404): честный текст и никаких кнопок перехода", async () => {
    h.get.mockRejectedValue(new Error("404"))
    mount(); pin()
    expect(await screen.findByText(/недоступна/i)).toBeTruthy()
    expect(screen.queryByRole("link", { name: /Открыть запись/ })).toBeNull()
  })
  it("пока запись загружается, кнопок тоже нет", () => {
    h.get.mockReturnValue(new Promise(() => {}))
    mount(); pin()
    expect(screen.queryByRole("link", { name: /Открыть запись/ })).toBeNull()
  })
  it("при наведении (без закрепления) кнопок нет", async () => {
    h.get.mockResolvedValue({ data: mk({}) })
    mount(); fireEvent.mouseOver(screen.getByText("к"))
    await new Promise(r => setTimeout(r, 400))
    await screen.findByText("TR:Заг")
    expect(screen.queryByRole("link", { name: /Открыть запись/ })).toBeNull()
  })
})

describe("перевод в карточке", () => {
  it("чужую запись переводит отдельными полями preview_title/preview_excerpt", async () => {
    h.get.mockResolvedValue({ data: mk({}) })
    mount(); pin()
    expect(await screen.findByText("TR:Заг")).toBeTruthy()
    expect(screen.getByText("TR:Текст")).toBeTruthy()
    expect(h.tr).toHaveBeenCalledWith("hypothesis", 5, "preview_title", "Заг", false)
    expect(h.tr).toHaveBeenCalledWith("hypothesis", 5, "preview_excerpt", "Текст", false)
  })
  it("свою запись не переводит", async () => {
    h.get.mockResolvedValue({ data: mk({ is_owner: true }) })
    mount(); pin()
    expect(await screen.findByText("Заг")).toBeTruthy()
  })
  it("гостю не переводит: эндпоинт перевода требует вход", async () => {
    h.user = null
    h.get.mockResolvedValue({ data: mk({}) })
    mount(); pin()
    expect(await screen.findByText("Заг")).toBeTruthy()
    expect(h.tr.mock.calls.every(c => c[4] === true)).toBe(true)
  })
})
