import { describe, it, expect, afterEach, vi } from "vitest"
import { page, cdp } from "vitest/browser"
import { render, cleanup } from "@testing-library/react"
import type { ComponentProps } from "react"
import "@/app/globals.css"

// В браузерном проекте нет process: подвал читает версию из process.env, поэтому заглушка ставится до импортов.
vi.hoisted(() => { (globalThis as { process?: unknown }).process ??= { env: { NEXT_PUBLIC_APP_VERSION: "test" } } })
vi.mock("next/link", async () => {
  const { createElement } = await import("react")
  return { __esModule: true, default: ({ children, ...p }: ComponentProps<"a">) => createElement("a", p, children) }
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

import { HomeHero } from "@/components/site/home-hero"

// Реальный Chromium: настоящий холст, настоящая настройка "уменьшить движение" через CDP.
const REDUCE_QUERY = "(prefers-reduced-motion: reduce)"
async function setReduce(on: boolean) {
  await cdp().send("Emulation.setEmulatedMedia", {
    features: on ? [{ name: "prefers-reduced-motion", value: "reduce" }] : [],
  })
}
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
function blankLike(c: HTMLCanvasElement) {
  const b = document.createElement("canvas")
  b.width = c.width; b.height = c.height
  return b.toDataURL()
}

afterEach(async () => { cleanup(); await setReduce(false) })

describe("фон первого экрана главной", () => {
  it("при настройке уменьшить движение сеть нарисована и не меняется", async () => {
    await page.viewport(1280, 800)
    await setReduce(true)
    expect(window.matchMedia(REDUCE_QUERY).matches).toBe(true)
    const { container } = render(<HomeHero />)
    const canvas = container.querySelector("canvas")
    expect(canvas).not.toBeNull()
    await wait(300)
    const first = canvas!.toDataURL()
    expect(first).not.toBe(blankLike(canvas!))
    await wait(1500)
    expect(canvas!.toDataURL()).toBe(first)
  })

  it("без ограничений движения сеть движется", async () => {
    await page.viewport(1280, 800)
    await setReduce(false)
    expect(window.matchMedia(REDUCE_QUERY).matches).toBe(false)
    const { container } = render(<HomeHero />)
    const canvas = container.querySelector("canvas")
    expect(canvas).not.toBeNull()
    await wait(300)
    const first = canvas!.toDataURL()
    expect(first).not.toBe(blankLike(canvas!))
    await wait(1500)
    expect(canvas!.toDataURL()).not.toBe(first)
  })

  it("холст не перехватывает нажатия: в пустом месте под ним находится не он", async () => {
    await page.viewport(1280, 800)
    const { container } = render(<HomeHero />)
    const canvas = container.querySelector("canvas")
    expect(canvas).not.toBeNull()
    const r = (container.firstElementChild as HTMLElement).getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + 4, r.top + 4)
    expect(hit).not.toBeNull()
    expect(hit).not.toBe(canvas)
  })
})
