import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { STRINGS } from "@/lib/i18n/strings"
import { ScaleControl } from "@/components/ui/scale-control"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
vi.mock("@/components/ui/tooltip", () => ({ Tooltip: ({ children }: any) => children }))

const S = STRINGS as Record<string, string>

// В jsdom нет раскладки — фиксируем геометрию полосы: 200px шириной, начало в x=0.
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0, right: 200, top: 0, bottom: 10, width: 200, height: 10, x: 0, y: 0, toJSON() {},
  } as DOMRect)
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

const mount = (props: Partial<React.ComponentProps<typeof ScaleControl>> = {}) => {
  const onChange = vi.fn()
  render(<ScaleControl name="Прогресс" value={50} min={0} max={100} step={5} color="#4A90D9" onChange={onChange} {...props} />)
  return { onChange, slider: screen.getByRole("slider") }
}

describe("ScaleControl — непрерывная шкала (указатель/палец)", () => {
  it("перетаскивание: onChange вызывается один раз, на отпускании, со значением под пальцем", () => {
    const { onChange, slider } = mount({ value: 0 })
    fireEvent.pointerDown(slider, { clientX: 40, pointerId: 1 })
    fireEvent.pointerMove(slider, { clientX: 140, pointerId: 1 })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.pointerUp(slider, { clientX: 140, pointerId: 1 })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(70)
  })

  it("значение привязывается к шагу и не выходит за границы", () => {
    const { onChange, slider } = mount()
    fireEvent.pointerDown(slider, { clientX: 999, pointerId: 1 })
    fireEvent.pointerUp(slider, { clientX: 999, pointerId: 1 })
    expect(onChange).toHaveBeenLastCalledWith(100)
    fireEvent.pointerDown(slider, { clientX: -50, pointerId: 1 })
    fireEvent.pointerUp(slider, { clientX: -50, pointerId: 1 })
    expect(onChange).toHaveBeenLastCalledWith(0)
    fireEvent.pointerDown(slider, { clientX: 61, pointerId: 1 })
    fireEvent.pointerUp(slider, { clientX: 61, pointerId: 1 })
    expect(onChange).toHaveBeenLastCalledWith(30) // 61/200*100 = 30.5 -> шаг 5 -> 30
  })

  it("движение без нажатия ничего не меняет", () => {
    const { onChange, slider } = mount()
    fireEvent.pointerMove(slider, { clientX: 100, pointerId: 1 })
    fireEvent.pointerUp(slider, { clientX: 100, pointerId: 1 })
    expect(onChange).not.toHaveBeenCalled()
  })

  it("pointercancel (браузер забрал жест) отменяет перетаскивание без сохранения", () => {
    const { onChange, slider } = mount()
    fireEvent.pointerDown(slider, { clientX: 40, pointerId: 1 })
    fireEvent.pointerMove(slider, { clientX: 140, pointerId: 1 })
    fireEvent.pointerCancel(slider, { pointerId: 1 })
    fireEvent.pointerUp(slider, { clientX: 140, pointerId: 1 })
    expect(onChange).not.toHaveBeenCalled()
  })

  it("без onChange (чужая запись): не интерактивна, не фокусируется, не меняется", () => {
    render(<ScaleControl name="Прогресс" value={50} min={0} max={100} step={5} color="#4A90D9" />)
    const slider = screen.getByRole("slider")
    expect(slider.getAttribute("tabindex")).toBeNull()
    expect(slider.getAttribute("aria-readonly")).toBe("true")
    fireEvent.pointerDown(slider, { clientX: 10, pointerId: 1 })
    fireEvent.pointerUp(slider, { clientX: 10, pointerId: 1 })
    fireEvent.keyDown(slider, { key: "ArrowRight" })
    expect(slider.getAttribute("aria-valuenow")).toBe("50")
  })
})

describe("ScaleControl — клавиатура", () => {
  it("стрелки двигают на шаг, Home/End — в крайние значения", () => {
    const { onChange, slider } = mount()
    expect(slider.getAttribute("tabindex")).toBe("0")
    fireEvent.keyDown(slider, { key: "ArrowRight" })
    expect(onChange).toHaveBeenLastCalledWith(55)
    fireEvent.keyDown(slider, { key: "Home" })
    expect(onChange).toHaveBeenLastCalledWith(0)
    fireEvent.keyDown(slider, { key: "End" })
    expect(onChange).toHaveBeenLastCalledWith(100)
  })

  it("на границе стрелка за пределы не вызывает сохранение", () => {
    const { onChange, slider } = mount({ value: 100 })
    fireEvent.keyDown(slider, { key: "ArrowRight" })
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe("ScaleControl — не указано", () => {
  it("пустое значение показывает переведённую подпись, а не число", () => {
    mount({ value: null })
    expect(screen.getByText(S["ruler.notSet"])).toBeTruthy()
    expect(screen.getByRole("slider").getAttribute("aria-valuenow")).toBeNull()
  })

  it("первое нажатие стрелки на пустой шкале ставит min + шаг", () => {
    const { onChange, slider } = mount({ value: null })
    fireEvent.keyDown(slider, { key: "ArrowRight" })
    expect(onChange).toHaveBeenCalledWith(5)
  })
})

describe("ScaleControl — сегментная шкала (регрессия: не сломана)", () => {
  it("клик по делению сохраняет его значение", () => {
    const onChange = vi.fn()
    render(<ScaleControl name="Значимость" value={1} min={0} max={5} step={1} color="#1ABC9C" onChange={onChange} />)
    const segments = screen.getByRole("group").children
    expect(segments.length).toBe(6)
    fireEvent.click(segments[3])
    expect(onChange).toHaveBeenCalledWith(3)
  })
})
