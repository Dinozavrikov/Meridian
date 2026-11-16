import { describe, it, expect, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { Modal } from "@/components/ui/modal"

afterEach(cleanup)

describe("Modal: портал", () => {
  it("окно, открытое внутри липкого блока, рисуется в body, а не внутри него", () => {
    render(
      <div data-testid="sticky" style={{ position: "sticky" }}>
        <Modal open onClose={() => {}} title="Окно"><span>Содержимое</span></Modal>
      </div>,
    )
    const dialog = screen.getByRole("dialog")
    expect(screen.getByTestId("sticky").contains(dialog)).toBe(false)
    expect(dialog.parentElement!.parentElement).toBe(document.body)
  })

  it("compact уменьшает отступы тела", () => {
    render(<Modal open compact onClose={() => {}} title="Окно"><span data-testid="c">x</span></Modal>)
    expect(screen.getByTestId("c").parentElement!.style.padding).toBe("20px")
  })
})
