import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { STRINGS } from "@/lib/i18n/strings"
import { EffectChip } from "@/components/entities/effect-chip"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string, p?: Record<string, string>) => (STRINGS[key] ?? key).replace(/\{(\w+)\}/g, (_m, k) => p?.[k] ?? "") }
})
const S = STRINGS as Record<string, string>
const chip = () => screen.getByTestId("effect-chip")

describe("EffectChip", () => {
  it("учтённый вклад: слово и стрелка в чипе, число в подсказке", () => {
    render(<EffectChip effect={{ kind: "counted", value: 2.5 }} otherType="prediction" />)
    expect(chip().textContent).toContain(S["effect.strong.pos"])
    expect(chip().textContent).not.toContain("2.50")
    expect(chip().getAttribute("title")).toContain("+2.50")
    expect(chip().getAttribute("data-effect-kind")).toBe("counted")
  })
  it("отрицательный вклад наблюдения", () => {
    render(<EffectChip effect={{ kind: "counted", value: -0.18 }} otherType="observation" />)
    expect(chip().textContent).toContain(S["effect.weak.neg"])
    expect(chip().getAttribute("title")).toContain("-0.18")
  })
  it("открытый прогноз, старый закрытый и неучтённая связь: свои слова, без числа", () => {
    const { rerender } = render(<EffectChip effect={{ kind: "pending", value: 0 }} otherType="prediction" />)
    expect(chip().textContent).toContain(S["effect.pending"])
    rerender(<EffectChip effect={{ kind: "unknown", value: null }} otherType="prediction" />)
    expect(chip().textContent).toContain(S["effect.unknown"])
    rerender(<EffectChip effect={{ kind: "not_counted", value: null }} otherType="observation" />)
    expect(chip().textContent).toContain(S["effect.notCounted"])
    expect(chip().getAttribute("title")).toBe(S["effect.tip.notCounted"])
  })
})
