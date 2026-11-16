import { describe, it, expect, vi, beforeAll } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { ScalesGrid } from "@/components/entities/scales-grid"

vi.mock("@/lib/i18n/useDynamicT", () => ({ useDynamicTranslate: () => (s: string) => s }))

// jsdom не считает реальный layout — getBoundingClientRect() возвращает width=0 у любого
// элемента, а значение под пальцем вычисляется делением на ширину полосы. Фиксируем реальную
// ширину трека, чтобы жест давал конечное число (и CSS clamp(...) у точки не ронял парсер).
beforeAll(() => {
  Element.prototype.getBoundingClientRect = () =>
    ({ width: 200, height: 20, left: 0, right: 200, top: 0, bottom: 20, x: 0, y: 0, toJSON() {} }) as DOMRect
})

const predictionScale = [{
  id: "confidence", name: "Уверенность", entity_type: "prediction",
  min: 0, max: 100, step: 5, group_by: "none", color: "#4dcfa6", builtin: true,
  description: "", levels: [],
}]

// Один и тот же настоящий жест (указатель/палец) во всех трёх тестах: если он сохраняет значение
// в разблокированной шкале, то отсутствие вызова в заблокированной — реальный результат блокировки,
// а не следствие того, что жест вообще ни на что не влияет.
function tapMiddleOfSlider() {
  const slider = screen.getByRole("slider")
  fireEvent.pointerDown(slider, { clientX: 100, pointerId: 1 })
  fireEvent.pointerUp(slider, { clientX: 100, pointerId: 1 })
}

describe("ScalesGrid — lockedIds", () => {
  it("заблокированная шкала не вызывает onChange по касанию трека", () => {
    const onChange = vi.fn()
    render(
      <ScalesGrid entityType="prediction" values={{ confidence: 60 }} scales={predictionScale}
        lockedIds={new Set(["confidence"])} onChange={onChange} />,
    )
    tapMiddleOfSlider()
    expect(onChange).not.toHaveBeenCalled()
  })

  it("незаблокированная шкала по-прежнему интерактивна (регрессия: lockedIds не должен глушить остальные)", () => {
    const onChange = vi.fn()
    render(
      <ScalesGrid entityType="prediction" values={{ confidence: 60 }} scales={predictionScale}
        lockedIds={new Set()} onChange={onChange} />,
    )
    tapMiddleOfSlider()
    expect(onChange).toHaveBeenCalledWith("confidence", 50)
  })

  it("без lockedIds (проп не передан) поведение как раньше — интерактивно", () => {
    const onChange = vi.fn()
    render(<ScalesGrid entityType="prediction" values={{ confidence: 60 }} scales={predictionScale} onChange={onChange} />)
    tapMiddleOfSlider()
    expect(onChange).toHaveBeenCalledWith("confidence", 50)
  })
})
