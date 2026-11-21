import { describe, it, expect } from "vitest"
import { safeJsonLd } from "@/lib/json-ld"

describe("safeJsonLd", () => {
  it("в результате нет <, > и &, а данные после разбора те же", () => {
    const data = { a: "</script><img onerror=1> & x", n: [1, 2] }
    const out = safeJsonLd(data)
    expect(out).not.toMatch(/[<>&]/)
    expect(JSON.parse(out)).toEqual(data)
  })

  it("разделители строк U+2028 и U+2029 экранированы", () => {
    const out = safeJsonLd({ a: "x\u2028y\u2029z" })
    expect(out).not.toContain("\u2028")
    expect(out).not.toContain("\u2029")
    expect(JSON.parse(out).a).toBe("x\u2028y\u2029z")
  })
})
