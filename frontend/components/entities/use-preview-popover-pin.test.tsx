import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { usePreviewPopover } from "@/components/entities/use-preview-popover"

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }) })
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = "" })

const setup = (isMobile = false) => {
  const anchor = document.createElement("a"); anchor.href = "#x"; document.body.appendChild(anchor)
  const anchorRef = { current: anchor as HTMLElement }
  const hook = renderHook(() => usePreviewPopover({ anchorRef, isMobile }))
  anchor.addEventListener("focus", () => hook.result.current.enter()) // как у PreviewLink и RichHtml
  return { ...hook, anchor }
}
const esc = () => act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })) })

describe("закрепление", () => {
  it("pin открывает сразу, уход курсора не закрывает, close снимает закрепление", () => {
    const { result } = setup()
    act(() => result.current.pin())
    expect(result.current.open && result.current.pinned).toBe(true)
    act(() => result.current.leave()); act(() => { vi.advanceTimersByTime(500) })
    expect(result.current.open).toBe(true)
    act(() => result.current.close())
    expect(result.current.open || result.current.pinned).toBe(false)
  })
  it("клик мимо закрывает закреплённую; клик по самой ссылке — нет", () => {
    const { result, anchor } = setup()
    act(() => result.current.pin())
    act(() => { anchor.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })) })
    expect(result.current.open).toBe(true)
    act(() => { document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })) })
    expect(result.current.open).toBe(false)
  })
  it("на мобильном клик внутри шторки не считается кликом мимо", () => {
    const { result } = setup(true)
    act(() => result.current.pin())
    act(() => { document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })) })
    expect(result.current.open).toBe(true)
  })
})

describe("Esc", () => {
  it("не доходит до слушателей document (как у Modal), пока карточка открыта", () => {
    const { result } = setup()
    const modalClose = vi.fn()
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") modalClose() }
    document.addEventListener("keydown", onKey)
    act(() => result.current.pin())
    esc()
    expect(result.current.open).toBe(false)
    expect(modalClose).not.toHaveBeenCalled()
    esc() // карточки нет — Esc проходит дальше и закрывает модалку
    expect(modalClose).toHaveBeenCalledTimes(1)
    document.removeEventListener("keydown", onKey)
  })
  it("после Esc у закреплённой фокус возвращается на ссылку и карточка не открывается заново", () => {
    const { result, anchor } = setup()
    act(() => result.current.pin())
    esc()
    expect(document.activeElement).toBe(anchor)
    act(() => { vi.advanceTimersByTime(600) })
    expect(result.current.open).toBe(false)
  })
})
