import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { EffectChip } from "@/components/entities/effect-chip"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return {
    useT: () => (key: string, params?: Record<string, string | number>) =>
      ((STRINGS as Record<string, string>)[key] ?? key).replace(/\{(\w+)\}/g, (_m, k) => String(params?.[k] ?? "")),
  }
})
afterEach(cleanup)

describe("EffectChip: лабораторная часть", () => {
  it("участник (lab_only): только лабораторный чип, личного нет, «ваш вклад» виден", () => {
    render(<EffectChip effect={{ kind: "lab_only", value: null, lab: { value: 0.3, mine: 0.3, votes: null } }} otherType="prediction" />)
    expect(screen.queryByTestId("effect-chip")).toBeNull()
    expect(screen.getByText("В лаборатории: слабо за")).toBeTruthy()
    expect(screen.getByTestId("effect-lab-mine").textContent).toBe("ваш вклад: +0.30")
  })
  it("наблюдение: сводка голосов считает долю «за» из среднего знака", () => {
    render(<EffectChip effect={{ kind: "lab_only", value: null, lab: { value: 0.1, mine: 0, votes: { n: 3, mean: 1 / 3 } } }} otherType="observation" />)
    expect(screen.getByTestId("effect-lab-votes").textContent).toBe("голосов: 3, за: 67%")
    expect(screen.queryByTestId("effect-lab-mine")).toBeNull()
  })
  it("владелец: личный чип и лабораторный вместе", () => {
    render(<EffectChip effect={{ kind: "counted", value: 0, lab: { value: -2.5, mine: 0, votes: null } }} otherType="prediction" />)
    expect(screen.getByTestId("effect-chip")).toBeTruthy()
    expect(screen.getByText("В лаборатории: сильно против")).toBeTruthy()
  })
  it("без lab — как раньше, лабораторного блока нет", () => {
    render(<EffectChip effect={{ kind: "counted", value: 0.8 }} otherType="prediction" />)
    expect(screen.getByTestId("effect-chip")).toBeTruthy()
    expect(screen.queryByTestId("effect-lab")).toBeNull()
  })
})
