import { describe, it, expect, beforeEach } from "vitest"
import { migrateLegacyCaches } from "@/lib/i18n/cache-migrate"
import { uiCacheKey, dynCacheKey } from "@/lib/i18n/cache-keys"

beforeEach(() => localStorage.clear())

describe("migrateLegacyCaches", () => {
  it("старые кэши интерфейса удаляются без переноса, нынешний не трогается", () => {
    localStorage.setItem("i18n-cache:en", JSON.stringify({ "a.b": "Hello" }))
    localStorage.setItem("i18n-cache:v2:en", JSON.stringify({ "a.b": "Old" }))
    localStorage.setItem(uiCacheKey("en"), "current")
    migrateLegacyCaches("en")
    expect(localStorage.getItem("i18n-cache:en")).toBeNull()
    expect(localStorage.getItem("i18n-cache:v2:en")).toBeNull()
    expect(localStorage.getItem(uiCacheKey("en"))).toBe("current")
  })

  it("динамический кэш: текст-как-ключ, значение равное ключу отбрасывается", () => {
    localStorage.setItem("dyn-i18n-cache:en", JSON.stringify({ "Привет мир": "Hello world", "Эхо": "Эхо", "Пусто": " " }))
    migrateLegacyCaches("en")
    expect(JSON.parse(localStorage.getItem(dynCacheKey("en"))!)).toEqual({ "Привет мир": "Hello world" })
    expect(localStorage.getItem("dyn-i18n-cache:en")).toBeNull()
  })

  it("не перезаписывает уже существующий динамический кэш v2", () => {
    localStorage.setItem(dynCacheKey("en"), JSON.stringify({ "Мир": "Fresh" }))
    localStorage.setItem("dyn-i18n-cache:en", JSON.stringify({ "Мир": "Old" }))
    migrateLegacyCaches("en")
    expect(JSON.parse(localStorage.getItem(dynCacheKey("en"))!)).toEqual({ "Мир": "Fresh" })
  })

  it("без старого кэша ничего не делает", () => {
    migrateLegacyCaches("en")
    expect(localStorage.length).toBe(0)
  })

  it("битый JSON не роняет и удаляется", () => {
    localStorage.setItem("i18n-cache:en", "{oops")
    localStorage.setItem("dyn-i18n-cache:en", "undefined")
    expect(() => migrateLegacyCaches("en")).not.toThrow()
    expect(localStorage.length).toBe(0)
  })
})
