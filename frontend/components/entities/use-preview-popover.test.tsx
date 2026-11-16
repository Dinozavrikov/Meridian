import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { usePreviewPopover } from "@/components/entities/use-preview-popover"

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }) })
afterEach(() => { vi.useRealTimers() })

const setup = (isMobile = false) => {
  const anchor = document.createElement("span") // не <a>: хук должен работать с любым элементом
  vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue({ left: 10, top: 100, bottom: 120 } as DOMRect)
  const anchorRef = { current: anchor }
  return renderHook(() => usePreviewPopover({ anchorRef, isMobile }))
}

describe("usePreviewPopover", () => {
  it("открывается через 300 мс, не раньше, и «прогревает» запрос сразу", () => {
    const { result } = setup()
    act(() => result.current.enter())
    expect(result.current.warm).toBe(true)
    act(() => { vi.advanceTimersByTime(299) })
    expect(result.current.open).toBe(false)
    act(() => { vi.advanceTimersByTime(2) })
    expect(result.current.open).toBe(true)
  })
  it("закрывается через 150 мс; возврат курсора за это время отменяет закрытие", () => {
    const { result } = setup()
    act(() => result.current.enter()); act(() => { vi.advanceTimersByTime(310) })
    act(() => result.current.leave()); act(() => { vi.advanceTimersByTime(100) })
    act(() => result.current.enter()); act(() => { vi.advanceTimersByTime(300) })
    expect(result.current.open).toBe(true)
    act(() => result.current.leave()); act(() => { vi.advanceTimersByTime(160) })
    expect(result.current.open).toBe(false)
  })
  it("Esc закрывает", () => {
    const { result } = setup()
    act(() => result.current.enter()); act(() => { vi.advanceTimersByTime(310) })
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })) })
    expect(result.current.open).toBe(false)
  })
  it("положение считается от переданного элемента: под ним, левый край якоря", () => {
    const { result } = setup()
    act(() => result.current.measure())
    expect(result.current.pos).toEqual({ left: 10, top: 128 })
  })
  it("на мобильном наведение ничего не делает, нажатие отменяет переход и открывает шторку", () => {
    const { result } = setup(true)
    act(() => result.current.enter()); act(() => { vi.advanceTimersByTime(500) })
    expect(result.current.open).toBe(false)
    act(() => result.current.measure())
    expect(result.current.pos).toBeNull()
    const preventDefault = vi.fn()
    act(() => result.current.onAnchorClick({ preventDefault } as never))
    expect(preventDefault).toHaveBeenCalled()
    expect(result.current.open).toBe(true)
  })
  it("на десктопе клик не отменяет переход и закрывает карточку", () => {
    const { result } = setup()
    act(() => result.current.enter()); act(() => { vi.advanceTimersByTime(310) })
    const preventDefault = vi.fn()
    act(() => result.current.onAnchorClick({ preventDefault } as never))
    expect(preventDefault).not.toHaveBeenCalled()
    expect(result.current.open).toBe(false)
  })
})
