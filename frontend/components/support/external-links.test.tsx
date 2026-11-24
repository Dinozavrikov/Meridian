// Внешние ссылки не передают вес сайта (nofollow) и открываются безопасно; внутренние остаются обычными.
import { describe, it, expect, vi, afterEach } from "vitest"
import { render, cleanup } from "@testing-library/react"

vi.mock("@/lib/i18n/useT", () => ({ useT: () => (k: string) => k }))
afterEach(cleanup)

import { Footer } from "@/components/layout/footer"
import { SupportContent } from "@/components/support/SupportContent"

function anchors(c: HTMLElement) {
  const all = Array.from(c.querySelectorAll("a"))
  return { external: all.filter(a => /^https?:\/\//.test(a.getAttribute("href") ?? "")), internal: all.filter(a => (a.getAttribute("href") ?? "").startsWith("/")) }
}

function check(c: HTMLElement, minExternal: number) {
  const { external, internal } = anchors(c)
  expect(external.length).toBeGreaterThanOrEqual(minExternal)
  for (const a of external) {
    const rel = (a.getAttribute("rel") ?? "").split(/\s+/)
    expect(rel, a.getAttribute("href")!).toEqual(expect.arrayContaining(["nofollow", "noopener", "noreferrer"]))
    expect(a.getAttribute("target")).toBe("_blank")
  }
  for (const a of internal) expect(a.getAttribute("rel") ?? "", a.getAttribute("href")!).not.toContain("nofollow")
}

describe("внешние ссылки", () => {
  it("подвал", () => { check(render(<Footer />).container, 1) })
  it("страница поддержки: оплата, репозиторий, трекер, лицензия", () => { check(render(<SupportContent />).container, 5) })
})
