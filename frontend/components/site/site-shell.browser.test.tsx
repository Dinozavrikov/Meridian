import { describe, it, expect, afterEach, vi } from "vitest"
import { page } from "vitest/browser"
import { render, cleanup } from "@testing-library/react"
import "@/app/globals.css"

// В браузерном проекте нет process: подвал читает версию из process.env, поэтому заглушка ставится до импортов.
vi.hoisted(() => { (globalThis as { process?: unknown }).process ??= { env: { NEXT_PUBLIC_APP_VERSION: "test" } } })
// next/link приходит в браузер как CJS-модуль: без __esModule Vite отдает вместо default весь объект мока.
vi.mock("next/link", async () => {
  const { createElement } = await import("react")
  return { __esModule: true, default: ({ children, ...p }: any) => createElement("a", p, children) }
})
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  const t = (key: string, vars?: Record<string, string | number>) =>
    Object.entries(vars ?? {}).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), (STRINGS as Record<string, string>)[key] ?? key)
  return { useT: () => t, useTranslationsLoader: () => {} }
})
vi.mock("@/lib/api", () => ({ authApi: { me: () => new Promise(() => {}) } }))
vi.mock("@/lib/maturity-model", () => ({
  useMaturityModel: () => ({ data: { levels: { min: 0, max: 4, base_thresholds: [] } } }),
  fmtNumber: (n: number) => String(n),
}))

import { SiteShell } from "@/components/site/site-shell"
import { HomeContent } from "@/components/site/home-content"

// Реальный Chromium и настоящий globals.css: считается раскладка, а не текст правил.
afterEach(() => { cleanup() })

describe.each([360, 390, 768, 1280])("главная при ширине %i", width => {
  it("ничего не вылезает за экран по горизонтали", async () => {
    await page.viewport(width, 800)
    const { container } = render(<SiteShell><HomeContent /></SiteShell>)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
    const outside = [...container.querySelectorAll("header a, header button, main h1, main h2, main h3, main li, main aside, main a, footer a")]
      .filter(el => el.getBoundingClientRect().right > window.innerWidth + 1)
      .map(el => (el.textContent ?? "").trim().slice(0, 30))
    expect(outside).toEqual([])
  })
})
