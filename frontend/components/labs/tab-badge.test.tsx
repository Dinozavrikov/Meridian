import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { TabBadge } from "@/components/labs/tab-badge"

describe("TabBadge", () => {
  it("без extra — только N", () => {
    render(<TabBadge n={3} />)
    expect(screen.getByText("3")).toBeTruthy()
    expect(screen.queryByText(/\+/)).toBeNull()
  })
  it("с extra — «3 + 2»", () => {
    render(<TabBadge n={3} extra={2} />)
    expect(screen.getByText("3")).toBeTruthy()
    expect(screen.getByText("+ 2")).toBeTruthy()
  })
  it("нулевое extra не рисуется", () => {
    render(<TabBadge n={3} extra={0} />)
    expect(screen.queryByText("+ 0")).toBeNull()
  })
  it("оба нуля — ничего", () => {
    const { container } = render(<TabBadge n={0} extra={0} />)
    expect(container.firstChild).toBeNull()
  })
})
