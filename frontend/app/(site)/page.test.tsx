import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"

const nav = vi.hoisted(() => ({ permanent: vi.fn(), temporary: vi.fn() }))
const model = vi.hoisted(() => ({ data: undefined as unknown }))
vi.mock("next/navigation", () => ({ permanentRedirect: nav.permanent, redirect: nav.temporary }))
vi.mock("next/link", () => ({ default: ({ children, ...p }: any) => <a {...p}>{children}</a> }))
vi.mock("@/lib/maturity-model", async () => ({
  ...(await vi.importActual<typeof import("@/lib/maturity-model")>("@/lib/maturity-model")),
  useMaturityModel: () => ({ data: model.data }),
}))

import HomePage, { metadata } from "@/app/(site)/page"
import { STRINGS } from "@/lib/i18n/strings"
import { SITE_DESCRIPTION } from "@/lib/page-meta"
import { useStore } from "@/lib/store"
import { COMPUTE_IDS, EXAMPLE, PASSPORT_KEYS, SECTION_KEYS, STEP_IDS, computeKeys, stepKeys } from "@/lib/site/home"

const S = STRINGS as Record<string, string>
const hrefs = (c: HTMLElement) => [...c.querySelectorAll("a")].map(a => a.getAttribute("href"))
const fill = (key: string, vars: Record<string, string | number>) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), S[key])

beforeEach(() => { useStore.setState({ user: null }); model.data = undefined; nav.permanent.mockReset(); nav.temporary.mockReset() })
afterEach(cleanup)

describe("главная страница", () => {
  it("корень рисует страницу, а не перенаправляет", () => {
    render(<HomePage />)
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(S["sitePage.home.title"])
    expect(nav.permanent).not.toHaveBeenCalled()
    expect(nav.temporary).not.toHaveBeenCalled()
  })

  it("метаданные: свой canonical и общее описание сайта", () => {
    expect(metadata.alternates?.canonical).toBe("/")
    expect(metadata.description).toBe(SITE_DESCRIPTION)
    expect(String(metadata.title)).toContain(S["footer.tagline"])
    expect(metadata.openGraph).toMatchObject({ url: "/" })
    expect(metadata.twitter).toBeTruthy()
  })

  it("гостю предлагают создать аккаунт и войти, в приложение не зовут", () => {
    const { container } = render(<HomePage />)
    expect(hrefs(container)).toEqual(expect.arrayContaining(["/register", "/login"]))
    expect(hrefs(container)).not.toContain("/dashboard")
  })

  it("вошедшему предлагают открыть приложение, регистрации нет", () => {
    useStore.setState({ user: { id: 1, username: "a" } as never })
    const { container } = render(<HomePage />)
    expect(hrefs(container)).toContain("/dashboard")
    expect(hrefs(container)).not.toContain("/register")
  })

  it("шесть разделов идут в своем порядке", () => {
    render(<HomePage />)
    const titles = screen.getAllByRole("heading", { level: 2 }).map(h => h.textContent)
    expect(titles).toEqual(Object.values(SECTION_KEYS).map(k => S[k.title]))
  })

  it("шаги и карточки расчетов на месте", () => {
    render(<HomePage />)
    for (const id of STEP_IDS) expect(screen.getByRole("heading", { level: 3, name: S[stepKeys(id).title] })).toBeTruthy()
    for (const id of COMPUTE_IDS.filter(i => i !== "maturity")) expect(screen.getByRole("heading", { level: 3, name: S[computeKeys(id).title] })).toBeTruthy()
  })

  it("число уровней берется из модели зрелости, а пока она грузится, заголовок без числа и шкала без уровня", () => {
    const { unmount } = render(<HomePage />)
    expect(screen.getByRole("heading", { level: 3, name: S["sitePage.home.compute.maturity.titlePending"] })).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Зрелость идеи от/)
    expect(document.body.textContent).not.toMatch(/Уровень \d/)
    unmount()
    model.data = { levels: { min: 1, max: 7, base_thresholds: [] } }
    render(<HomePage />)
    expect(screen.getByRole("heading", { level: 3, name: fill("sitePage.home.compute.maturity.title", { min: 1, max: 7 }) })).toBeTruthy()
    expect(screen.getByText(fill(PASSPORT_KEYS.level, { level: EXAMPLE.level, max: 7 }))).toBeTruthy()
  })

  it("уровень примера не выше верхней границы модели", () => {
    model.data = { levels: { min: 0, max: 1, base_thresholds: [] } }
    render(<HomePage />)
    expect(screen.getByText(fill(PASSPORT_KEYS.level, { level: 1, max: 1 }))).toBeTruthy()
  })

  it("паспорт идеи подписан как пример и с пометкой, что это не отзыв", () => {
    render(<HomePage />)
    expect(screen.getByLabelText(S[PASSPORT_KEYS.label])).toBeTruthy()
    expect(screen.getByText(S[PASSPORT_KEYS.example])).toBeTruthy()
    expect(screen.getByText(S[PASSPORT_KEYS.note])).toBeTruthy()
    expect(screen.getByText(fill(PASSPORT_KEYS.confidence, { pct: EXAMPLE.confidence }))).toBeTruthy()
  })

  it("пояснение про почту и ссылки на приватность и документацию на месте", () => {
    const { container } = render(<HomePage />)
    expect(screen.getByText(S["sitePage.home.privacy"])).toBeTruthy()
    expect(hrefs(container)).toEqual(expect.arrayContaining(["/privacy", "/docs#maturity"]))
  })
})
