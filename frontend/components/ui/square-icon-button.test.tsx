import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { SquareIconButton } from "@/components/ui/square-icon-button"

afterEach(cleanup)

describe("SquareIconButton", () => {
  it("нет видимого текста, но у кнопки есть имя и подсказка; клик вызывает обработчик", () => {
    const onClick = vi.fn()
    render(<SquareIconButton label="Показать весь граф" icon={<svg data-testid="ic" />} onClick={onClick} />)
    const button = screen.getByRole("button", { name: "Показать весь граф" })
    expect(button.textContent).toBe("")
    expect(button.getAttribute("title")).toBe("Показать весь граф")
    expect(screen.getByTestId("ic")).toBeTruthy()
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
