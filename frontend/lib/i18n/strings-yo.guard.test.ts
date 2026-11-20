import { describe, expect, it } from "vitest"
import { STRINGS } from "./strings"

const YO = /[\u0451\u0401]/

describe("русская база интерфейса", () => {
  it("не содержит буквы йо ни в одной строке", () => {
    const bad = Object.entries(STRINGS).filter(([, v]) => YO.test(v)).map(([k]) => k)
    expect(bad).toEqual([])
  })
})
