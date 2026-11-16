import { describe, it, expect, vi, beforeEach } from "vitest"
import { loadTranslationsChunked, dropUntranslated, type Dict, type EnsureReply } from "@/lib/i18n/chunked-loader"

const SOURCE: Dict = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`k${i}`, `Русский ${i}`]))
const translateAll = (chunk: Dict): EnsureReply => ({
  translations: Object.fromEntries(Object.keys(chunk).map(k => [k, `EN ${k}`])),
  missing: [],
})

beforeEach(() => { vi.spyOn(console, "warn").mockImplementation(() => {}) })

describe("dropUntranslated", () => {
  it("убирает пустые значения и русский оригинал, выданный за перевод", () => {
    const out = dropUntranslated({ a: "Русский 0", b: "EN b", c: "  ", d: "EN d" }, { a: "Русский 0", b: "Русский b", c: "Русский c" })
    expect(out).toEqual({ b: "EN b", d: "EN d" })
  })
})

describe("loadTranslationsChunked", () => {
  it("делит на пачки заданного размера и собирает результат", async () => {
    const sizes: number[] = []
    const result = await loadTranslationsChunked({
      strings: SOURCE, chunkSize: 3,
      post: async chunk => { sizes.push(Object.keys(chunk).length); return translateAll(chunk) },
    })
    expect(sizes).toEqual([3, 3, 1])
    expect(Object.keys(result)).toHaveLength(7)
    expect(result.k4).toBe("EN k4")
  })

  it.each([1, 2])("не больше %i запросов одновременно", async concurrency => {
    let active = 0
    let peak = 0
    await loadTranslationsChunked({
      strings: SOURCE, chunkSize: 1, concurrency,
      post: async chunk => {
        active++; peak = Math.max(peak, active)
        await new Promise(r => setTimeout(r, 5))
        active--
        return translateAll(chunk)
      },
    })
    expect(peak).toBe(concurrency)
  })

  it("повторяет только ключи из missing и не принимает для них значения", async () => {
    const payloads: string[][] = []
    const post = vi.fn(async (chunk: Dict): Promise<EnsureReply> => {
      payloads.push(Object.keys(chunk))
      if (payloads.length === 1) {
        return { translations: { k0: "EN k0", k2: "EN k2" }, missing: ["k1"] }
      }
      return translateAll(chunk)
    })
    const result = await loadTranslationsChunked({ strings: { k0: "Русский 0", k1: "Русский 1", k2: "Русский 2" }, chunkSize: 3, retryDelayMs: 0, post })
    expect(payloads).toEqual([["k0", "k1", "k2"], ["k1"]])
    expect(result).toEqual({ k0: "EN k0", k1: "EN k1", k2: "EN k2" })
  })

  it("русский оригинал, выданный за перевод (старый сервер), не попадает в результат и не повторяется", async () => {
    const post = vi.fn(async (): Promise<EnsureReply> => ({ translations: { k0: "Русский 0", k1: "EN k1" } }))
    const result = await loadTranslationsChunked({ strings: { k0: "Русский 0", k1: "Русский 1" }, post })
    expect(result).toEqual({ k1: "EN k1" })
    expect(post).toHaveBeenCalledTimes(1)
  })

  it("сетевая ошибка: повторы, затем сдаётся; остальные пачки не страдают и исключения нет", async () => {
    const post = vi.fn(async (chunk: Dict): Promise<EnsureReply> => {
      if ("k0" in chunk) throw new Error("network")
      return translateAll(chunk)
    })
    const result = await loadTranslationsChunked({ strings: SOURCE, chunkSize: 3, retries: 1, retryDelayMs: 0, post })
    expect(Object.keys(result).sort()).toEqual(["k3", "k4", "k5", "k6"])
    const failing = post.mock.calls.filter(([chunk]) => "k0" in chunk)
    expect(failing).toHaveLength(2) // первая попытка + один повтор
  })

  it("shouldStop прекращает отправку новых пачек", async () => {
    let stop = false
    const post = vi.fn(async (chunk: Dict) => { stop = true; return translateAll(chunk) })
    await loadTranslationsChunked({ strings: SOURCE, chunkSize: 2, shouldStop: () => stop, post })
    expect(post).toHaveBeenCalledTimes(1)
  })

  it("onChunk получает накопленный словарь", async () => {
    const seen: number[] = []
    await loadTranslationsChunked({
      strings: SOURCE, chunkSize: 3, post: async chunk => translateAll(chunk),
      onChunk: merged => seen.push(Object.keys(merged).length),
    })
    expect(seen).toEqual([3, 6, 7])
  })
})
