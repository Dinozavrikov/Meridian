// @vitest-environment node
import { describe, it, expect } from "vitest"
import OGImage from "./opengraph-image"

describe("общая картинка сайта", () => {
  it("рисуется в настоящий PNG с кириллической подписью и нашими шрифтами", async () => {
    const png = new Uint8Array(await (await OGImage()).arrayBuffer())
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(png.length).toBeGreaterThan(5000)
  })
})
