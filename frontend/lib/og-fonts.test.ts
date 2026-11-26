// @vitest-environment node
// Real rendering: covered characters must come from the bundled fonts, without the network.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import SiteImage from "@/app/opengraph-image"
import { ogCard } from "@/lib/og-card"
import { ogFonts } from "@/lib/og-fonts"
import { renderOgCard } from "@/lib/og-render"

const real = globalThis.fetch
let external: string[] = []

beforeEach(() => {
  external = []
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input)
    if (!/^https?:/.test(url)) return real(input, init)
    external.push(url)
    throw new TypeError("network blocked by test")
  })
})
afterEach(() => { vi.unstubAllGlobals() })

const bytes = async (res: Response) => Buffer.from(await res.arrayBuffer())
const draw = async (title: string) => bytes(await renderOgCard({ label: "", title, color: "#8892A6", fontSize: 96 }))

describe("social preview fonts", () => {
  it("card renders without external requests", async () => {
    await bytes(await renderOgCard(ogCard(null, "question")))
    await draw("Сколько нужно спать? Meridian «90%» — 1234567890…")
    expect(external).toEqual([])
  })

  it("site image renders without external requests", async () => {
    await bytes(await SiteImage())
    expect(external).toEqual([])
  })

  it("card draws real glyphs for latin, cyrillic and digits", async () => {
    for (const [a, b] of [["abcd", "wxyz"], ["абвг", "жзик"], ["1234", "5678"]]) {
      expect((await draw(a)).equals(await draw(b)), `${a} and ${b} look the same`).toBe(false)
    }
  }, 20000)
})

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
