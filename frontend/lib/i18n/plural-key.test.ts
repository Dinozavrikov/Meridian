import { describe, expect, it } from "vitest"
import { pluralKey } from "@/lib/i18n/ru-plural"

describe("pluralKey", () => {
  it("выбирает форму по правилам русского языка", () => {
    const f = (n: number) => pluralKey("x", n)
    expect([0, 5, 11, 12, 14, 25].map(f)).toEqual(Array(6).fill("xMany"))
    expect([1, 21, 101].map(f)).toEqual(Array(3).fill("xOne"))
    expect([2, 3, 4, 22, 24].map(f)).toEqual(Array(5).fill("xFew"))
  })
})
