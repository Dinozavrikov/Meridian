import { describe, it, expect, vi } from "vitest"

// Шрифты next/font и провайдеры не предмет теста: проверяется настоящий экспорт viewport из корневого layout.
vi.mock("next/font/google", () => {
  const font = () => ({ variable: "" })
  return { Inter: font, JetBrains_Mono: font, PT_Serif: font }
})
vi.mock("@/app/providers", () => ({ Providers: ({ children }: { children: unknown }) => children }))

import { viewport, metadata } from "@/app/layout"
import { SITE_DESCRIPTION } from "@/lib/page-meta"
import { SITE_JSON_LD } from "@/lib/site-jsonld"
import { STRINGS } from "@/lib/i18n/strings"

describe("viewport", () => {
  it("не запрещает менять масштаб: максимум не задан или не меньше 200% (WCAG 1.4.4)", () => {
    const max = viewport.maximumScale
    expect(max === undefined || (typeof max === "number" && max >= 2)).toBe(true)
    expect((viewport as { userScalable?: boolean }).userScalable).not.toBe(false)
  })

  it("ширина устройства и начальный масштаб остались", () => {
    expect(viewport.width).toBe("device-width")
    expect(viewport.initialScale).toBe(1)
  })
})

describe("описание сайта", () => {
  it("одна формулировка: description, OpenGraph, Twitter и JSON-LD берут ее из одного места", () => {
    expect(SITE_DESCRIPTION).toBe(STRINGS["site.description"])
    expect(SITE_DESCRIPTION.length).toBeGreaterThan(40)
    expect(metadata.description).toBe(SITE_DESCRIPTION)
    expect(metadata.openGraph?.description).toBe(SITE_DESCRIPTION)
    expect(metadata.twitter?.description).toBe(SITE_DESCRIPTION)
    expect(SITE_JSON_LD.description).toBe(SITE_DESCRIPTION)
  })

  it("не длиннее 160 знаков (дальше поисковик обрезает) и в тексте пишем е вместо буквы с двумя точками", () => {
    expect(SITE_DESCRIPTION.length).toBeLessThanOrEqual(160)
    expect(SITE_DESCRIPTION).not.toMatch(/\u0451/)
  })
})
