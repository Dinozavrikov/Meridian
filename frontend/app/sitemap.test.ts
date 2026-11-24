import { describe, it, expect, vi } from "vitest"
import { PRERENDERED_PATHS } from "@/lib/guest-access"
import robots from "@/app/robots"

vi.mock("@/lib/feed-server", () => ({
  fetchSitemapRecords: async () => [{ type: "question", id: 7, updated_at: "2026-11-01T00:00:00Z" }],
}))

import sitemap from "@/app/sitemap"

const ORIGIN = "https://miridin.com"
const isRecord = (u: string) => u.includes("/feed/discussion/")

describe("sitemap", () => {
  it("содержит конечные адреса: есть корень, /feed и запись, дублей нет", async () => {
    const urls = (await sitemap()).map(e => e.url)
    expect(urls).toContain(`${ORIGIN}/`)
    expect(urls).toContain(`${ORIGIN}/feed`)
    expect(urls).toContain(`${ORIGIN}/feed/discussion/question/7`)
    expect(new Set(urls).size).toBe(urls.length)
  })

  it("страницы это ровно те, у которых есть серверный текст; входа, профиля и пустых списков нет", async () => {
    const pages = (await sitemap()).map(e => e.url).filter(u => !isRecord(u)).map(u => u.replace(ORIGIN, ""))
    expect([...pages].sort()).toEqual([...PRERENDERED_PATHS].sort())
    for (const bad of ["/login", "/register", "/profile", "/observations", "/hypotheses", "/predictions", "/worldview"]) {
      expect(pages).not.toContain(bad)
    }
  })

  it("у корня приоритет выше, чем у остальных страниц", async () => {
    const all = await sitemap()
    const prio = (path: string) => all.find(e => e.url === `${ORIGIN}${path}`)?.priority
    expect(prio("/")).toBe(1)
    for (const p of PRERENDERED_PATHS.filter(p => p !== "/")) expect(prio(p), p).toBe(0.7)
  })

  it("ни один адрес из sitemap не закрыт в robots.txt", async () => {
    const disallow = (robots().rules as { disallow: string[] }).disallow
    for (const e of await sitemap()) {
      const path = e.url.replace(ORIGIN, "")
      expect(disallow.some(d => path.startsWith(d)), path).toBe(false)
    }
  })

  it("у статических страниц нет выдуманной даты изменения, у записи настоящая", async () => {
    const all = await sitemap()
    expect(all.filter(e => !isRecord(e.url)).every(e => e.lastModified === undefined)).toBe(true)
    expect(all.find(e => isRecord(e.url))?.lastModified).toEqual(new Date("2026-11-01T00:00:00Z"))
  })
})
