import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { ComponentType } from "react"
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react"
import { STRINGS } from "@/lib/i18n/strings"
import { ScaleControl } from "@/components/ui/scale-control"
import { Ruler } from "@/components/ui/ruler"
import { OPTIMISTIC_TTL_MS } from "@/lib/use-scale-track"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
vi.mock("@/components/ui/tooltip", () => ({ Tooltip: ({ children }: any) => children }))

const S = STRINGS as Record<string, string>

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0, right: 200, top: 0, bottom: 10, width: 200, height: 10, x: 0, y: 0, toJSON() {},
  } as DOMRect)
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

const COMPONENTS: [string, ComponentType<any>][] = [["ScaleControl", ScaleControl], ["Ruler", Ruler]]

describe.each(COMPONENTS)("%s: общая логика линейки", (_n, Comp) => {
  const props = { name: "Прогресс", min: 0, max: 100, step: 5, color: "#4A90D9" }
  const slider = () => screen.getByRole("slider")
  const drag = (el: HTMLElement, x: number) => {
    fireEvent.pointerDown(el, { clientX: x, pointerId: 1 })
    fireEvent.pointerUp(el, { clientX: x, pointerId: 1 })
  }

  it("палец: перетаскивание даёт одно сохранение на отпускании", () => {
    const onChange = vi.fn()
    render(<Comp {...props} value={0} onChange={onChange} />)
    fireEvent.pointerDown(slider(), { clientX: 40, pointerId: 1 })
    fireEvent.pointerMove(slider(), { clientX: 140, pointerId: 1 })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.pointerUp(slider(), { clientX: 140, pointerId: 1 })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(70)
  })

  it("клавиатура: стрелка двигает на шаг, Home/End — в края", () => {
    const onChange = vi.fn()
    render(<Comp {...props} value={50} onChange={onChange} />)
    fireEvent.keyDown(slider(), { key: "ArrowRight" })
    expect(onChange).toHaveBeenLastCalledWith(55)
    fireEvent.keyDown(slider(), { key: "End" })
    expect(onChange).toHaveBeenLastCalledWith(100)
  })

  it("чужая запись (без onChange): не двигается и не получает фокус", () => {
    render(<Comp {...props} value={50} />)
    expect(slider().getAttribute("tabindex")).toBeNull()
    drag(slider(), 10)
    fireEvent.keyDown(slider(), { key: "Home" })
    expect(slider().getAttribute("aria-valuenow")).toBe("50")
  })

  it("пусто = «не оценено»: подпись переведена, числа нет", () => {
    render(<Comp {...props} value={null} onChange={vi.fn()} />)
    expect(screen.getAllByText(S["ruler.notSet"]).length).toBeGreaterThan(0)
    expect(slider().getAttribute("aria-valuenow")).toBeNull()
  })

  it("после сохранения показывается выбранное значение сразу, без ожидания сервера", () => {
    render(<Comp {...props} value={50} onChange={vi.fn()} />)
    drag(slider(), 140)
    expect(slider().getAttribute("aria-valuenow")).toBe("70")
  })

  it("сервер ответил иначе (откат в «не оценено»): экран показывает ответ сервера, а не своё значение", () => {
    const { rerender } = render(<Comp {...props} value={50} onChange={vi.fn()} />)
    drag(slider(), 140)
    expect(slider().getAttribute("aria-valuenow")).toBe("70")
    rerender(<Comp {...props} value={null} onChange={vi.fn()} />)
    expect(slider().getAttribute("aria-valuenow")).toBeNull()
  })

  it("сохранение не прошло (значение из пропсов не меняется): через таймаут возвращается реальное значение", () => {
    vi.useFakeTimers()
    render(<Comp {...props} value={50} onChange={vi.fn()} />)
    drag(slider(), 140)
    expect(slider().getAttribute("aria-valuenow")).toBe("70")
    act(() => { vi.advanceTimersByTime(OPTIMISTIC_TTL_MS + 100) })
    expect(slider().getAttribute("aria-valuenow")).toBe("50")
  })
})
