import { describe, it, expect, vi } from "vitest"

// Шрифты next/font и провайдеры не предмет теста: проверяется настоящий экспорт viewport из корневого layout.
vi.mock("next/font/google", () => {
  const font = () => ({ variable: "" })
  return { Inter: font, JetBrains_Mono: font, PT_Serif: font }
})
vi.mock("@/app/providers", () => ({ Providers: ({ children }: { children: unknown }) => children }))

import { viewport } from "@/app/layout"

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
