import { describe, it, expect, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { Tooltip } from "./tooltip"

afterEach(cleanup)

describe("Tooltip: карточка", () => {
  it("показывает метку, заголовок и текст, а плоская подсказка остается плоской", () => {
    const { rerender } = render(
      <Tooltip text="Расшифровка" card={{ title: "Заголовок", eyebrow: "Метка", accent: "#4f8cff" }}><button>x</button></Tooltip>)
    fireEvent.mouseEnter(screen.getByText("x"))
    expect(screen.getByRole("tooltip")).toBeTruthy()
    expect(screen.getByText("Заголовок")).toBeTruthy()
    expect(screen.getByText("Метка")).toBeTruthy()
    expect(screen.getByText("Расшифровка")).toBeTruthy()
    fireEvent.mouseLeave(screen.getByText("x"))
    expect(screen.queryByRole("tooltip")).toBeNull()

    rerender(<Tooltip text="Просто текст"><button>x</button></Tooltip>)
    fireEvent.mouseEnter(screen.getByText("x"))
    expect(screen.getByText("Просто текст")).toBeTruthy()
    expect(screen.queryByText("Заголовок")).toBeNull()
  })

  it("открывается вниз, когда над элементом нет места (в jsdom элемент у самого верха)", () => {
    render(<Tooltip text="Расшифровка" card={{ title: "Заголовок" }}><button>x</button></Tooltip>)
    fireEvent.mouseEnter(screen.getByText("x"))
    expect(screen.getByRole("tooltip").getAttribute("data-placement")).toBe("below")
  })

  it("по фокусу открывается, по Escape закрывается", () => {
    render(<Tooltip text="Расшифровка" card={{ title: "Заголовок" }}><button>x</button></Tooltip>)
    fireEvent.focus(screen.getByText("x"))
    expect(screen.getByRole("tooltip")).toBeTruthy()
    fireEvent.keyDown(screen.getByText("x"), { key: "Escape" })
    expect(screen.queryByRole("tooltip")).toBeNull()
  })
})
