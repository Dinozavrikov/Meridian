import { describe, it, expect, beforeEach } from "vitest"
import { migrateLegacyCaches } from "@/lib/i18n/cache-migrate"
import { uiCacheKey, dynCacheKey } from "@/lib/i18n/cache-keys"

const UI_SOURCE = { "a.b": "Привет", "a.c": "Мир" }
beforeEach(() => localStorage.clear())

describe("migrateLegacyCaches", () => {
  it("переносит хорошие UI-переводы и отбрасывает русский оригинал, выданный за перевод", () => {
    localStorage.setItem("i18n-cache:en", JSON.stringify({ "a.b": "Hello", "a.c": "Мир" }))
    migrateLegacyCaches("en", UI_SOURCE)
    expect(JSON.parse(localStorage.getItem(uiCacheKey("en"))!)).toEqual({ "a.b": "Hello" })
    expect(localStorage.getItem("i18n-cache:en")).toBeNull()
  })

  it("динамический кэш: текст-как-ключ, значение равное ключу отбрасывается", () => {
    localStorage.setItem("dyn-i18n-cache:en", JSON.stringify({ "Привет мир": "Hello world", "Эхо": "Эхо", "Пусто": " " }))
    migrateLegacyCaches("en", UI_SOURCE)
    expect(JSON.parse(localStorage.getItem(dynCacheKey("en"))!)).toEqual({ "Привет мир": "Hello world" })
    expect(localStorage.getItem("dyn-i18n-cache:en")).toBeNull()
  })

  it("не перезаписывает уже существующий кэш v2", () => {
    localStorage.setItem(uiCacheKey("en"), JSON.stringify({ "a.b": "Fresh" }))
    localStorage.setItem("i18n-cache:en", JSON.stringify({ "a.b": "Old" }))
    migrateLegacyCaches("en", UI_SOURCE)
    expect(JSON.parse(localStorage.getItem(uiCacheKey("en"))!)).toEqual({ "a.b": "Fresh" })
    expect(localStorage.getItem("i18n-cache:en")).toBeNull()
  })

  it("без старого кэша — ничего не делает", () => {
    expect(() => migrateLegacyCaches("en", UI_SOURCE)).not.toThrow()
    expect(localStorage.length).toBe(0)
  })

  it("битый JSON не роняет и удаляется", () => {
    localStorage.setItem("i18n-cache:en", "{oops")
    localStorage.setItem("dyn-i18n-cache:en", "undefined")
    expect(() => migrateLegacyCaches("en", UI_SOURCE)).not.toThrow()
    expect(localStorage.getItem("i18n-cache:en")).toBeNull()
    expect(localStorage.getItem(uiCacheKey("en"))).toBeNull()
  })
})
