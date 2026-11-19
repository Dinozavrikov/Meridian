// Порядок и размер пачек перевода: нужное на экране первым, объем текста ограничен, прежний порядок без этих настроек.
import { describe, expect, it } from "vitest"
import { loadTranslationsChunked, type Dict } from "@/lib/i18n/chunked-loader"

const make = (n: number, text: (i: number) => string = i => `текст ${i}`): Dict =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, text(i)]))
const recorder = () => {
  const calls: string[][] = []
  const post = async (chunk: Dict) => {
    calls.push(Object.keys(chunk))
    return { translations: Object.fromEntries(Object.entries(chunk).map(([k, v]) => [k, `EN ${v}`])) }
  }
  return { calls, post }
}

describe("пачки перевода", () => {
  it("без настроек идут подряд по 30, как раньше", async () => {
    const { calls, post } = recorder()
    await loadTranslationsChunked({ strings: make(70), post })
    expect(calls.map(c => c.length)).toEqual([30, 30, 10])
    expect(calls.flat()).toEqual(Object.keys(make(70)))
  })
  it("ключи с экрана уходят первыми, остальные не теряются и не повторяются", async () => {
    const { calls, post } = recorder()
    const out = await loadTranslationsChunked({ strings: make(100), post, priorityKeys: () => ["k95", "k96", "нет-такого"] })
    expect(calls[0].slice(0, 2)).toEqual(["k95", "k96"])
    expect(calls[0].length).toBe(30)
    expect(new Set(calls.flat()).size).toBe(100)
    expect(calls.flat().length).toBe(100)
    expect(Object.keys(out).length).toBe(100)
  })
  it("ключи, появившиеся на экране позже, переводятся со следующей пачки", async () => {
    let extra: string[] = []
    const calls: string[][] = []
    const post = async (chunk: Dict) => {
      calls.push(Object.keys(chunk)); extra = ["k80"]
      return { translations: Object.fromEntries(Object.entries(chunk).map(([k, v]) => [k, `EN ${v}`])) }
    }
    await loadTranslationsChunked({ strings: make(100), post, priorityKeys: () => extra })
    expect(calls[0][0]).toBe("k0")
    expect(calls[1][0]).toBe("k80")
  })
  it("пачка не превышает предел объема текста, длинная строка идет одна", async () => {
    const { calls, post } = recorder()
    const strings = make(10, i => (i === 4 ? "я".repeat(5000) : "а".repeat(600)))
    await loadTranslationsChunked({ strings, post, maxChars: 1500 })
    const vol = (c: string[]) => c.reduce((n, k) => n + strings[k].length, 0)
    for (const c of calls) expect(c.length === 1 || vol(c) <= 1500).toBe(true)
    expect(calls.some(c => c.length === 1 && c[0] === "k4")).toBe(true)
    expect(calls.flat().length).toBe(10)
  })
})
