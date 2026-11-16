import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { STRINGS } from "@/lib/i18n/strings"
import { ConfirmPredictionModal } from "@/components/entities/confirm-prediction-modal"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
vi.mock("@/lib/api", () => ({ predApi: { listInsights: vi.fn(), addReflection: vi.fn() } }))
vi.mock("@/components/entities/reflection-dialog", () => ({ ReflectionDialog: () => null }))
vi.mock("@/components/entities/reflection-insight-panel", () => ({ ReflectionInsightPanel: () => null }))
const S = STRINGS as Record<string, string>
afterEach(cleanup)

const mount = (target: any) => render(<ConfirmPredictionModal target={target} onClose={vi.fn()} onSave={vi.fn()} />)

describe("ConfirmPredictionModal: мягкие предупреждения", () => {
  it("пока исход не выбран, подсказок нет; после выбора для стресс-теста без пояснения — две, кнопка «Далее» не блокируется", () => {
    mount({ id: 1, title: "п", confidence: 60, confirms_hypothesis_if_true: false, hypothesis_id: 3 })
    expect(screen.queryByTestId("close-warnings")).toBeNull()
    fireEvent.click(screen.getByText(S["confirmPrediction.outcome.confirmed"]))
    const box = screen.getByTestId("close-warnings")
    expect(box.textContent).toContain(S["closeWarn.stress.down"])
    expect(box.textContent).toContain(S["closeWarn.noNotes"])
    expect((screen.getByText(S["confirmPrediction.next"]) as HTMLButtonElement).disabled).toBe(false)
  })
  it("обычный прогноз с пояснением: подсказок нет", () => {
    mount({ id: 2, title: "п", confidence: 60, confirms_hypothesis_if_true: true, hypothesis_id: 3 })
    fireEvent.click(screen.getByText(S["confirmPrediction.outcome.confirmed"]))
    fireEvent.change(screen.getByPlaceholderText(S["confirmPrediction.notesPlaceholder"]), { target: { value: "сбылось" } })
    expect(screen.queryByTestId("close-warnings")).toBeNull()
  })
})
