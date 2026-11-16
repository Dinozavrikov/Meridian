import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup, fireEvent } from "@testing-library/react"
import { ResizableLayout } from "@/components/layout/resizable-layout"

const mockIsMobile = vi.hoisted(() => ({ value: false }))
vi.mock("@/lib/use-is-mobile", () => ({ useIsMobile: () => mockIsMobile.value }))
vi.mock("@/lib/i18n/useT", () => ({ useT: () => (k: string) => k }))
afterEach(cleanup)

describe("ResizableLayout: список слева липкий, высота страницы не фиксируется", () => {
  it("левая колонка sticky под шапкой, контейнер без фиксированной высоты", () => {
    mockIsMobile.value = false
    render(<ResizableLayout left={<div data-testid="l" />} right={<div />} showRight />)
    const left = screen.getByTestId("l").parentElement!
    expect(left.style.position).toBe("sticky")
    expect(left.style.top).toBe("53px")
    expect(left.parentElement!.style.height).toBe("")
  })
})

describe("ResizableLayout: mobile back button", () => {
  beforeEach(() => {
    mockIsMobile.value = true
  })
  afterEach(() => {
    mockIsMobile.value = false
  })

  it("кнопка возврата на мобильном устройстве имеет type=button и вызывает onBack", () => {
    const onBack = vi.fn()
    render(<ResizableLayout left={<div />} right={<div data-testid="r" />} showRight onBack={onBack} />)
    
    const backBtn = screen.getByRole("button")
    expect(backBtn.getAttribute("type")).toBe("button")
    
    fireEvent.click(backBtn)
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
