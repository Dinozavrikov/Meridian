import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup, waitFor } from "@testing-library/react"
import { renderToString } from "react-dom/server"

const h = vi.hoisted(() => ({ me: vi.fn(), loader: vi.fn() }))
vi.mock("next/link", () => ({ default: ({ children, ...p }: any) => <a {...p}>{children}</a> }))
vi.mock("@/lib/api", async () => ({
  ...(await vi.importActual<typeof import("@/lib/api")>("@/lib/api")),
  authApi: { me: h.me },
}))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key, useTranslationsLoader: h.loader }
})

import { SiteShell } from "@/components/site/site-shell"
import { SITE_LINKS } from "@/lib/site/links"
import { STRINGS } from "@/lib/i18n/strings"
import { useStore } from "@/lib/store"

const S = STRINGS as Record<string, string>
const hrefs = (root: ParentNode) => [...root.querySelectorAll("a")].map(a => a.getAttribute("href"))

beforeEach(() => {
  useStore.setState({ user: null })
  h.me.mockReset(); h.loader.mockReset()
  h.me.mockReturnValue(new Promise(() => {}))
})
afterEach(cleanup)

describe("SiteShell: серверный HTML", () => {
  it("текст страницы, ссылки и вход есть до ответа auth/me", () => {
    const out = renderToString(<SiteShell><p>PAGE-CONTENT</p></SiteShell>)
    expect(out).toContain("PAGE-CONTENT")
    expect(out).toContain('href="/"')
    for (const l of SITE_LINKS) {
      expect(out).toContain(`href="${l.href}"`)
      expect(out).toContain(S[l.labelKey])
    }
    expect(out).toContain(S["sitePage.nav.login"])
    expect(out).not.toContain(S["sitePage.nav.app"])
  })
})

describe("SiteShell: вход", () => {
  it("вошедшему вместо входа предлагается открыть приложение", async () => {
    h.me.mockResolvedValue({ id: 1, username: "a" })
    const { container } = render(<SiteShell><p>x</p></SiteShell>)
    expect(await screen.findByText(S["sitePage.nav.app"])).toBeTruthy()
    expect(hrefs(container)).toContain("/dashboard")
    expect(screen.queryByText(S["sitePage.nav.login"])).toBeNull()
  })

  it("гостю остается вход, а на страницу входа его не уводит", async () => {
    h.me.mockRejectedValue({ response: { status: 401 } })
    const { container } = render(<SiteShell><p>x</p></SiteShell>)
    await waitFor(() => expect(h.me).toHaveBeenCalled())
    expect(screen.getByText(S["sitePage.nav.login"])).toBeTruthy()
    expect(hrefs(container)).toEqual(expect.arrayContaining(["/login", "/register"]))
  })

  it("загрузчик переводов включен: гость с другим языком получает готовые переводы", () => {
    render(<SiteShell><p>x</p></SiteShell>)
    expect(h.loader).toHaveBeenCalled()
  })

  it("логотип ведет на главную", () => {
    const { container } = render(<SiteShell><p>x</p></SiteShell>)
    const logo = container.querySelector(".site-logo") as HTMLElement
    expect(logo.getAttribute("href")).toBe("/")
    expect(logo.textContent).toContain("MER")
  })
})
