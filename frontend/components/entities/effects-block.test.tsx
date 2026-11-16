import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { EffectsBlock } from "@/components/entities/effects-block"
import { safeEntityHref } from "@/lib/entity-routes"
import { STRINGS } from "@/lib/i18n/strings"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string, p?: Record<string, string>) => (STRINGS[key] ?? key).replace(/\{(\w+)\}/g, (_m, k) => p?.[k] ?? "") }
})

describe("EffectsBlock", () => {
  it("прогноз: один чип; наблюдение: по чипу на каждую гипотезу с её названием", () => {
    const { rerender } = render(<EffectsBlock type="prediction" effect={{ kind: "counted", value: 2.5 }} />)
    expect(screen.getAllByTestId("effect-chip")).toHaveLength(1)
    rerender(<EffectsBlock type="observation" effects={[
      { hypothesis_id: 1, hypothesis_name: "Гипотеза А", effect: { kind: "counted", value: 0.3 } },
      { hypothesis_id: 2, hypothesis_name: "Гипотеза Б", effect: { kind: "not_counted", value: null } }]} />)
    expect(screen.getAllByTestId("effect-chip")).toHaveLength(2)
    expect(screen.getByText("Гипотеза Б")).toBeTruthy()
  })
  it("нечего показывать: блока нет", () => {
    const { container, rerender } = render(<EffectsBlock type="prediction" effect={null} />)
    expect(container.firstChild).toBeNull()
    rerender(<EffectsBlock type="observation" effects={[]} />)
    expect(container.firstChild).toBeNull()
    rerender(<EffectsBlock type="hypothesis" effect={{ kind: "pending", value: 0 }} />)
    expect(container.firstChild).toBeNull()
  })

  it("название гипотезы у наблюдения — настоящая ссылка на её страницу", () => {
    render(<EffectsBlock type="observation" effects={[
      { hypothesis_id: 1, hypothesis_name: "Гипотеза А", effect: { kind: "counted", value: 0.3 } },
      { hypothesis_id: 2, hypothesis_name: "Гипотеза Б", effect: { kind: "not_counted", value: null } }]} />)
    const links = screen.getAllByTestId("effect-hypothesis-link")
    expect(links).toHaveLength(2)
    expect(links[0].getAttribute("href")).toBe(safeEntityHref("hypothesis", 1))
    expect(links[1].getAttribute("href")).toBe(safeEntityHref("hypothesis", 2))
    expect(links[0].textContent).toContain("Гипотеза А")
  })

  it("вопрос, задача и убеждение: честно сказано, что в сигнал не входят; у гипотезы блока нет", () => {
    for (const type of ["question", "task", "worldview"]) {
      const { container, unmount } = render(<EffectsBlock type={type} />)
      expect(container.textContent).toContain((STRINGS as Record<string, string>)["effect.none"])
      unmount()
    }
    const { container } = render(<EffectsBlock type="hypothesis" />)
    expect(container.firstChild).toBeNull()
  })
})
