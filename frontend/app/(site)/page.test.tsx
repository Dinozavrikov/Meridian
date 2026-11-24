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

const S = STRINGS as Record<string, string>
const hrefs = (c: HTMLElement) => [...c.querySelectorAll("a")].map(a => a.getAttribute("href"))

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

  it("число уровней берется из модели зрелости, а пока она грузится, заголовок пункта без числа", () => {
    const { unmount } = render(<HomePage />)
    expect(screen.getByText(S["sitePage.home.point.maturity.titlePending"])).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Зрелость идеи от/)
    unmount()
    model.data = { levels: { min: 1, max: 7, base_thresholds: [] } }
    render(<HomePage />)
    const expected = S["sitePage.home.point.maturity.title"].replace("{min}", "1").replace("{max}", "7")
    expect(screen.getByText(expected)).toBeTruthy()
  })

  it("все три пункта и пояснение про почту на месте", () => {
    render(<HomePage />)
    for (const key of ["blind", "calibration"]) {
      expect(screen.getByText(S[`sitePage.home.point.${key}.title`])).toBeTruthy()
      expect(screen.getByText(S[`sitePage.home.point.${key}.text`])).toBeTruthy()
    }
    expect(screen.getByText(S["sitePage.home.point.maturity.text"])).toBeTruthy()
    expect(screen.getByText(S["sitePage.home.privacy"])).toBeTruthy()
  })
})
