import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { EditFactorsButton } from "@/components/entities/edit-factors-button"
import { ActionButton } from "@/components/ui/action-button"

vi.mock("@/lib/i18n/useT", () => ({ useT: () => (key: string) => key }))
vi.mock("@/lib/use-is-mobile", () => ({ useIsMobile: () => false }))
afterEach(cleanup)

describe("EditFactorsButton", () => {
  it("выглядит как остальные кнопки действий: те же стили и класс, что у ActionButton с иконкой, и есть иконка", () => {
    const { container } = render(
      <>
        <EditFactorsButton onClick={() => {}} />
        <ActionButton icon={<svg />} onClick={() => {}}>x</ActionButton>
      </>,
    )
    const [factors, reference] = Array.from(container.querySelectorAll("button"))
    expect(factors.getAttribute("style")).toBe(reference.getAttribute("style"))
    expect(factors.className).toBe(reference.className)
    expect(factors.querySelector("svg")).toBeTruthy()
  })

  it("клик вызывает обработчик, disabled блокирует", () => {
    const onClick = vi.fn()
    const { rerender } = render(<EditFactorsButton onClick={onClick} />)
    fireEvent.click(screen.getByRole("button"))
    expect(onClick).toHaveBeenCalledTimes(1)
    rerender(<EditFactorsButton onClick={onClick} disabled />)
    fireEvent.click(screen.getByRole("button"))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
