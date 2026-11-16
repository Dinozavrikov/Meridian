import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { Pill } from "@/components/ui/pill"
import { contrastRatio, cssRgbToHex } from "@/lib/color"

afterEach(cleanup)
const root = (c: HTMLElement) => c.firstElementChild as HTMLElement

describe("Pill", () => {
  it("без onClick — метка, не кнопка; с onClick — кнопка, клик доходит", () => {
    const { container, rerender } = render(<Pill>Личное</Pill>)
    expect(screen.queryByRole("button")).toBeNull()
    expect(root(container).tagName).toBe("SPAN")
    const onClick = vi.fn()
    rerender(<Pill onClick={onClick}>Личное</Pill>)
    fireEvent.click(screen.getByRole("button", { name: "Личное" }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it("стрелка показывается только у кликабельного бейджа, который её просит", () => {
    const { container, rerender } = render(<Pill chevron>Личное</Pill>)
    expect(container.querySelector("svg")).toBeNull()
    rerender(<Pill chevron onClick={() => {}}>Личное</Pill>)
    expect(container.querySelector("svg")).not.toBeNull()
  })

  it("тёмный цвет (#333333) даёт читаемый на тёмном фоне текст, а не невидимый", () => {
    const { container } = render(<Pill color="#333333">закрыта</Pill>)
    const text = cssRgbToHex(root(container).style.color)
    expect(text).not.toBeNull()
    expect(contrastRatio(text as string, "#0b0d14")).toBeGreaterThanOrEqual(4.5)
  })

  it("яркий цвет остаётся своим", () => {
    const { container } = render(<Pill color="#1ABC9C">осмысленное</Pill>)
    expect(cssRgbToHex(root(container).style.color)).toBe("#1abc9c")
  })
})
