// Sitemap: публичные записи попадают в него с адресом страницы обсуждения; мусор из ответа и сбои не ломают карту.
import { afterEach, describe, expect, it, vi } from "vitest"
import sitemap from "@/app/sitemap"

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
const stub = (ok: boolean, body: unknown) => vi.stubGlobal("fetch", vi.fn(async () => ({ ok, json: async () => body })))
const urls = async () => (await sitemap()).map(e => e.url)

describe("sitemap", () => {
  it("публичные записи добавляются с адресом страницы обсуждения", async () => {
    vi.stubEnv("INTERNAL_API_URL", "http://backend:8000")
    stub(true, [{ type: "hypothesis", id: 5, updated_at: "2026-11-01T10:00:00+00:00" }, { type: "task", id: 9, updated_at: "2026-11-02T10:00:00+00:00" }])
    const u = await urls()
    expect(u).toContain("https://miridin.com/feed/discussion/hypothesis/5")
    expect(u).toContain("https://miridin.com/feed/discussion/task/9")
    expect(u).toContain("https://miridin.com/support")
  })
  it("записи с недопустимым типом или id отбрасываются", async () => {
    vi.stubEnv("INTERNAL_API_URL", "http://backend:8000")
    stub(true, [{ type: "../x", id: 1, updated_at: "2026-11-01T00:00:00Z" }, { type: "hypothesis", id: "7; drop", updated_at: "2026-11-01T00:00:00Z" }, { type: "hypothesis", id: -3, updated_at: "2026-11-01T00:00:00Z" }, null])
    expect((await urls()).filter(x => x.includes("/discussion/"))).toEqual([])
  })
  it.each([["без INTERNAL_API_URL", "", true, []], ["ответ не 200", "http://backend:8000", false, {}], ["ответ не список", "http://backend:8000", true, { detail: "x" }]])("%s: остаются только страницы", async (_n, env, ok, body) => {
    vi.stubEnv("INTERNAL_API_URL", env as string)
    stub(ok as boolean, body)
    const u = await urls()
    expect(u).toContain("https://miridin.com/support")
    expect(u.filter(x => x.includes("/discussion/"))).toEqual([])
  })
  it("сеть упала: sitemap все равно отдается", async () => {
    vi.stubEnv("INTERNAL_API_URL", "http://backend:8000")
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED") }))
    expect((await urls()).length).toBeGreaterThan(5)
  })
})
