import { describe, it, expect, afterEach, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import pkg from "../package.json"
import nextConfig from "../next.config"
import { appVersion } from "@/lib/version"

afterEach(() => vi.unstubAllEnvs())

describe("версия продукта", () => {
  it("appVersion берет версию из окружения сборки", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.2.3")
    expect(appVersion()).toBe("1.2.3")
  })

  it("без переменной честно показывает dev, а не выдуманный номер", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "")
    expect(appVersion()).toBe("dev")
  })

  it("версия в package.json: корректный semver", () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it("сборка получает версию именно из package.json", () => {
    expect(nextConfig.env?.NEXT_PUBLIC_APP_VERSION).toBe(pkg.version)
  })

  it("верхняя запись CHANGELOG.md совпадает с версией package.json", () => {
    const text = readFileSync(join(process.cwd(), "..", "CHANGELOG.md"), "utf8")
    const m = text.match(/^## \[(\d+\.\d+\.\d+)\]/m)
    expect(m?.[1]).toBe(pkg.version)
  })
})
