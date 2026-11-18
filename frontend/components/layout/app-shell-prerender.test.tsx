// Серверный HTML: публичная страница содержит свой текст до ответа auth/me, приватная нет.
import { describe, expect, it, vi } from "vitest"
import { renderToString } from "react-dom/server"

const nav = vi.hoisted(() => ({ path: "/feed" }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => nav.path }))
vi.mock("@/lib/store", () => ({ useStore: (sel?: any) => { const s = { user: null, setUser: vi.fn(), setSearchOpen: vi.fn() }; return sel ? sel(s) : s } }))
vi.mock("@/lib/i18n/useT", () => ({ useTranslationsLoader: () => {} }))
vi.mock("@/lib/i18n/useDynamicT", () => ({ useDynamicTranslate: () => (s: string) => s }))
vi.mock("@/lib/use-is-mobile", () => ({ useIsMobile: () => false }))
vi.mock("@/lib/api", () => ({ authApi: { me: () => new Promise(() => {}) } }))
vi.mock("@/components/layout/sidebar", () => ({ Sidebar: () => <nav>SIDEBAR</nav> }))
vi.mock("@/components/layout/guest-sidebar", () => ({ GuestSidebar: () => <nav>GUEST-SIDEBAR</nav> }))
vi.mock("@/components/layout/search-modal", () => ({ SearchModal: () => <div>SEARCH</div> }))
import { AppShell } from "@/components/layout/app-shell"

const html = (path: string) => { nav.path = path; return renderToString(<AppShell><main>PAGE-CONTENT</main></AppShell>) }

describe("AppShell: серверный HTML", () => {
  it.each(["/feed", "/support", "/docs", "/features"])("%s: текст страницы есть, сайдбара еще нет", p => {
    const out = html(p)
    expect(out).toContain("PAGE-CONTENT")
    expect(out).not.toContain("SIDEBAR")
  })
  it.each(["/settings", "/observations", "/hypotheses"])("%s: до проверки сессии пусто", p => {
    expect(html(p)).not.toContain("PAGE-CONTENT")
  })
})
