// @vitest-environment node
import { describe, it, expect } from "vitest"
import { GET } from "./route"

describe("общая картинка сайта", () => {
  it("отдает настоящий PNG", async () => {
    const res = await GET()
    expect(res.headers.get("content-type")).toBe("image/png")
    const png = new Uint8Array(await res.arrayBuffer())
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(png.length).toBeGreaterThan(3000)
  })
})
