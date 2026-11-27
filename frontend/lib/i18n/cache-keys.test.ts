import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { uiCacheKey, dynCacheKey, legacyCacheKeys } from "@/lib/i18n/cache-keys"

describe("ключи кэша переводов", () => {
  it("версионированы и не пересекаются со старыми", () => {
    expect(uiCacheKey("en")).toBe("i18n-cache:v3:en")
    expect(dynCacheKey("en")).toBe("dyn-i18n-cache:v2:en")
    for (const legacy of legacyCacheKeys("en")) {
      expect([uiCacheKey("en"), dynCacheKey("en")]).not.toContain(legacy)
    }
  })

  it("хуки берут ключи из cache-keys, а не хардкодят строки", () => {
    const useT = readFileSync("lib/i18n/useT.ts", "utf8")
    const useDyn = readFileSync("lib/i18n/useDynamicT.ts", "utf8")
    expect(useT).toContain("uiCacheKey")
    expect(useT).toContain("dynCacheKey")
    expect(useDyn).toContain("dynCacheKey")
    expect(useT).not.toContain("i18n-cache:")
    expect(useDyn).not.toContain("dyn-i18n-cache")
  })
})
