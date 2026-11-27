// Real Chromium: layout, keyboard focus, overlap and real clicks of the idea check sandbox on the whole home page.
import { describe, it, expect, afterEach, vi } from "vitest"
import { page, userEvent } from "vitest/browser"
import { render, cleanup } from "@testing-library/react"
import type { ComponentProps } from "react"
import "@/app/globals.css"

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
  useMaturityModel: () => ({ data: {
    levels: { min: 0, max: 4, base_thresholds: [] },
    prediction: { confidence_floor_pct: 1, confidence_ceil_pct: 99, default_confidence: 50 },
  } }),
  fmtNumber: (n: number) => String(n),
}))

import { HomeContent } from "@/components/site/home-content"
import { STRINGS } from "@/lib/i18n/strings"
import { SANDBOX_KEYS as K } from "@/lib/site/sandbox"

const S = STRINGS as Record<string, string>
const CLAIM = "Угол сыреет из-за холодной стены"

const button = (key: string) => {
  const found = [...document.querySelectorAll("button")].filter(b => b.textContent === S[key])
  expect(found, key).toHaveLength(1)
  return found[0]
}
const statusText = () => [...document.querySelectorAll<HTMLElement>('[role="status"]')]
  .filter(e => e.getBoundingClientRect().height > 0).map(e => e.textContent)

function expectUncovered(el: HTMLElement) {
  el.scrollIntoView({ block: "center" })
  const r = el.getBoundingClientRect()
  expect(r.width).toBeGreaterThan(0)
  expect(r.height).toBeGreaterThan(0)
  expect(r.left).toBeGreaterThanOrEqual(0)
  expect(r.right).toBeLessThanOrEqual(window.innerWidth)
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
  expect(el.contains(hit), `covered: ${el.textContent}`).toBe(true)
}

function watchExport() {
  const blobs: Blob[] = []
  const names: string[] = []
  const realCreate = URL.createObjectURL.bind(URL)
  vi.spyOn(URL, "createObjectURL").mockImplementation(obj => { blobs.push(obj as Blob); return realCreate(obj) })
  const realClick = HTMLAnchorElement.prototype.click
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    if (this.download) names.push(this.download)
    realClick.call(this)
  })
  return { blobs, names }
}

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe.each([390, 1280])("idea check sandbox at width %i", width => {
  it("without a claim: reachable by keyboard, explained next to the buttons, does nothing", async () => {
    await page.viewport(width, 800)
    const seen = watchExport()
    render(<HomeContent />)
    const download = button(K.download)
    const copy = button(K.copy)
    ;(document.activeElement as HTMLElement | null)?.blur()
    for (let i = 0; i < 60 && document.activeElement !== download; i++) await userEvent.tab()
    expect(document.activeElement, "download is not reachable by Tab").toBe(download)
    await userEvent.keyboard("{Enter}")
    await userEvent.tab()
    expect(document.activeElement, "copy is not reachable by Tab").toBe(copy)
    await userEvent.keyboard("{Enter}")
    const reason = document.getElementById(download.getAttribute("aria-describedby") ?? "")
    expect(reason?.textContent).toBe(S[K.claimFirst])
    expect(copy.getAttribute("aria-describedby")).toBe(reason?.id)
    const gap = reason!.getBoundingClientRect().top - Math.max(download.getBoundingClientRect().bottom, copy.getBoundingClientRect().bottom)
    expect(gap).toBeGreaterThanOrEqual(0)
    expect(gap).toBeLessThanOrEqual(24)
    download.click()
    copy.click()
    await new Promise(r => setTimeout(r, 200))
    expect(seen.blobs).toHaveLength(0)
    expect(seen.names).toHaveLength(0)
    expect(statusText()).not.toContain(S[K.copied])
    expect(statusText()).not.toContain(S[K.copyFailed])
  })

  it("with a claim: visible, uncovered, real clicks export and report", async () => {
    await page.viewport(width, 800)
    const seen = watchExport()
    render(<HomeContent />)
    await page.getByLabelText(S[K.claimLabel], { exact: true }).fill(CLAIM)
    const download = button(K.download)
    const copy = button(K.copy)
    expect(download.getAttribute("aria-disabled")).toBeNull()
    expect(copy.getAttribute("aria-disabled")).toBeNull()
    expectUncovered(download)
    expectUncovered(copy)
    await page.getByRole("button", { name: S[K.download], exact: true }).click()
    await expect.poll(() => seen.blobs.length).toBe(1)
    expect(await seen.blobs[0].text()).toContain(CLAIM)
    expect(seen.names).toHaveLength(1)
    expect(seen.names[0]).toMatch(/^idea-check-.+[.]md$/)
    await page.getByRole("button", { name: S[K.copy], exact: true }).click()
    await expect.poll(() => statusText().some(s => s === S[K.copied] || s === S[K.copyFailed])).toBe(true)
  })
})
