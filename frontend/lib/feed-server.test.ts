// Серверная первая страница ленты: без INTERNAL_API_URL и при любой ошибке отдает null, иначе данные как есть.
import { afterEach, describe, expect, it, vi } from "vitest"
import { fetchPublicFeedFirstPage } from "@/lib/feed-server"

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
const page = { groups: [{ key: "hypothesis:1" }], page: 1, page_size: 20, total: 1, total_pages: 1, type_counts: {}, topics: [] }

describe("fetchPublicFeedFirstPage", () => {
  it("без INTERNAL_API_URL не ходит в сеть", async () => {
    vi.stubEnv("INTERNAL_API_URL", "")
    const f = vi.fn(); vi.stubGlobal("fetch", f)
    expect(await fetchPublicFeedFirstPage()).toBeNull()
    expect(f).not.toHaveBeenCalled()
  })
  it("ходит на публичный адрес первой страницы и возвращает данные", async () => {
    vi.stubEnv("INTERNAL_API_URL", "http://backend:8000/")
    const f = vi.fn(async () => ({ ok: true, json: async () => page })); vi.stubGlobal("fetch", f)
    expect(await fetchPublicFeedFirstPage()).toEqual(page)
    expect((f.mock.calls[0] as unknown[])[0]).toBe("http://backend:8000/api/v1/feed/groups/public?page=1&page_size=20")
  })
  it.each([
    ["ответ не 200", async () => ({ ok: false, json: async () => ({}) })],
    ["сеть упала", async () => { throw new Error("ECONNREFUSED") }],
    ["не та форма ответа", async () => ({ ok: true, json: async () => ({ detail: "x" }) })],
  ])("%s: null", async (_n, impl) => {
    vi.stubEnv("INTERNAL_API_URL", "http://backend:8000")
    vi.stubGlobal("fetch", vi.fn(impl))
    expect(await fetchPublicFeedFirstPage()).toBeNull()
  })
})
