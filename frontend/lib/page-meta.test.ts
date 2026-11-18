// Метаданные публичных страниц: у каждой свои, без «ё», canonical совпадает с адресом; запись берет данные у самой записи.
import { afterEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"

const PAGES = ["features", "roadmap", "docs", "privacy", "terms", "support", "labs", "questions"]
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe("метаданные публичных страниц", async () => {
  const metas = await Promise.all(PAGES.map(async p => [p, (await import(`@/app/(app)/${p}/layout`)).metadata] as const))
  it.each(metas)("%s: свои title, description и canonical", (p, m: any) => {
    expect(m.title).toMatch(/ · Meridian$/)
    expect(m.title).not.toBe("Meridian")
    expect(m.description.length).toBeGreaterThan(40)
    expect(m.alternates.canonical).toBe(`/${p}`)
    expect(`${m.title}${m.description}`).not.toContain("\u0451")
  })
  it("title и description не повторяются между страницами", () => {
    expect(new Set(metas.map(([, m]: any) => m.title)).size).toBe(PAGES.length)
    expect(new Set(metas.map(([, m]: any) => m.description)).size).toBe(PAGES.length)
  })
  it("корневой layout без «ё»", () => {
    expect(readFileSync("app/layout.tsx", "utf-8")).not.toContain("\u0451")
  })
})

describe("метаданные записи", () => {
  const stub = (status: number, body: unknown) => vi.stubGlobal("fetch", vi.fn(async () => ({ ok: status === 200, json: async () => body })))
  const run = async (type: string, id: string) => {
    vi.stubEnv("INTERNAL_API_URL", "http://backend:8000")
    const { generateMetadata } = await import("@/app/(app)/feed/discussion/[type]/[id]/layout")
    return (await generateMetadata({ params: Promise.resolve({ type, id }) })) as any
  }
  it("публичная запись: заголовок и описание из записи, автора нет", async () => {
    stub(200, { core: { title: "Кофе мешает спать", preview: "<p>Проверю <b>две недели</b></p>", visibility: "public", author_username: "anna", author_display: "Anna Secret" } })
    const m = await run("hypothesis", "5")
    expect(m.title).toBe("Кофе мешает спать · Meridian")
    expect(m.description).toBe("Проверю две недели")
    expect(m.alternates.canonical).toBe("/feed/discussion/hypothesis/5")
    expect(m.robots).toBeUndefined()
    expect(JSON.stringify(m)).not.toMatch(/anna|Anna Secret/i)
  })
  it.each([["не публичная", 200, { core: { title: "Секрет", preview: "x", visibility: "lab" } }], ["не найдена", 404, {}]])("%s: noindex и без текста записи", async (_n, status, body) => {
    stub(status, body)
    const m = await run("hypothesis", "5")
    expect(m.robots).toEqual({ index: false, follow: false })
    expect(JSON.stringify(m)).not.toContain("Секрет")
  })
  it("мусор в адресе не доходит до backend", async () => {
    const f = vi.fn(); vi.stubGlobal("fetch", f)
    const m = await run("../../auth/me", "1")
    expect(f).not.toHaveBeenCalled()
    expect(m.robots).toEqual({ index: false, follow: false })
  })
})
