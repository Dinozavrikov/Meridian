import { describe, it, expect, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

vi.mock("@/lib/feed-server", () => ({ fetchEntityCore: vi.fn() }))

import { fetchEntityCore } from "@/lib/feed-server"
import Layout from "./layout"

const html = async (core: Record<string, unknown> | null) => {
  vi.mocked(fetchEntityCore).mockResolvedValue(core)
  return renderToStaticMarkup(await Layout({ params: Promise.resolve({ type: "question", id: "9" }), children: null }))
}

describe("страница обсуждения: разметка Article", () => {
  it("у публичной записи в HTML есть script с Article", async () => {
    const out = await html({ title: "Вопрос", preview: "<p>текст</p>", visibility: "public" })
    expect(out).toContain('type="application/ld+json"')
    expect(out).toContain('"@type":"Article"')
  })
  it("у непубличной записи скрипта нет", async () => {
    expect(await html({ title: "Секрет", preview: "тайна", visibility: "private" })).not.toContain("ld+json")
  })
})
