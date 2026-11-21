import { describe, it, expect } from "vitest"
import { ogFonts } from "@/lib/og-fonts"

describe("шрифты картинки записи", () => {
  it("оба файла читаются с диска и это настоящие WOFF", async () => {
    const fonts = await ogFonts()
    expect(fonts).toHaveLength(2)
    for (const f of fonts) {
      expect(f.data.length).toBeGreaterThan(1000)
      expect(Buffer.from(f.data).subarray(0, 4).toString("latin1")).toBe("wOFF")
    }
  })
})
