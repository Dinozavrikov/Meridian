import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { STRINGS } from "@/lib/i18n/strings"
import { BatchImpact } from "@/components/entities/batch-impact"
import { safeEntityHref } from "@/lib/entity-routes"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string, p?: Record<string, string>) => (STRINGS[key] ?? key).replace(/\{(\w+)\}/g, (_m, k) => p?.[k] ?? "") }
})
const S = STRINGS as Record<string, string>

describe("BatchImpact", () => {
  it("по каждой гипотезе: ссылка на неё, сигнал до → после, смена предложенного уровня", () => {
    render(<BatchImpact data={{ pending_predictions: 0, hypotheses: [
      { hypothesis_id: 4, name: "Кофе", before: 0.6, after: -0.6, level_before: 1, level_after: 0 },
      { hypothesis_id: 5, name: "Сон", before: 0.3, after: 0.12, level_before: 1, level_after: 1 }] }} />)
    const links = screen.getAllByTestId("batch-impact-link")
    expect(links.map(l => l.getAttribute("href"))).toEqual([safeEntityHref("hypothesis", 4), safeEntityHref("hypothesis", 5)])
    expect(screen.getByText("0.60 → -0.60")).toBeTruthy()
    expect(screen.getAllByText(S["relations.batch.levelChange"].replace("{a}", "1").replace("{b}", "0"))).toHaveLength(1)  // только у первой
  })
  it("открытые прогнозы: отдельная строка про закрытие; пусто: ничего", () => {
    const { container, rerender } = render(<BatchImpact data={{ pending_predictions: 2, hypotheses: [] }} />)
    expect(container.textContent).toContain(S["relations.batch.pending"].replace("{n}", "2"))
    rerender(<BatchImpact data={{ pending_predictions: 0, hypotheses: [] }} />)
    expect(container.firstChild).toBeNull()
    rerender(<BatchImpact data={{} as any} />)    // ответ без полей (старый бэкенд, мок) не ломает менеджер
    expect(container.firstChild).toBeNull()
  })
})
