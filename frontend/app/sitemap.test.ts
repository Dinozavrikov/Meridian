import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/feed-server", () => ({
  fetchSitemapRecords: async () => [{ type: "question", id: 7, updated_at: "2026-11-01T00:00:00Z" }],
}))

import sitemap from "@/app/sitemap"

describe("sitemap", () => {
  it("содержит конечные адреса: нет корня, который редиректит, есть /feed и запись", async () => {
    const urls = (await sitemap()).map(e => e.url)
    expect(urls).not.toContain("https://miridin.com/")
    expect(urls).toContain("https://miridin.com/feed")
    expect(urls).toContain("https://miridin.com/feed/discussion/question/7")
    expect(new Set(urls).size).toBe(urls.length)
  })
})
