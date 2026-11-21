// @vitest-environment node
import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/feed-server", () => ({ fetchEntityCore: vi.fn() }))

import { fetchEntityCore } from "@/lib/feed-server"
import Image from "./opengraph-image"

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const render = async (core: Record<string, unknown> | null) => {
  vi.mocked(fetchEntityCore).mockResolvedValue(core)
  const res = await Image({ params: Promise.resolve({ type: "question", id: "9" }) })
  return new Uint8Array(await res.arrayBuffer())
}

describe("картинка записи: настоящая отрисовка", () => {
  it("публичная запись с кириллицей рисуется в PNG", async () => {
    const png = await render({ title: "Сколько нужно спать?", preview: "<p>текст</p>", visibility: "public" })
    expect([...png.subarray(0, 8)]).toEqual(PNG)
    expect(png.length).toBeGreaterThan(5000)
  })

  it("приватная запись и отсутствие записи тоже дают картинку с брендом", async () => {
    for (const core of [{ title: "Секрет", preview: "тайна", visibility: "private" }, null]) {
      expect([...(await render(core)).subarray(0, 8)]).toEqual(PNG)
    }
  })
})
