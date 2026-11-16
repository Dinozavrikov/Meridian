import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { Globe, Lock } from "lucide-react"
import { ActionDialog } from "@/components/ui/action-dialog"

const choices = [
  { key: "a", label: "Первый", description: "Описание первого", icon: Lock },
  { key: "b", label: "Второй", icon: Globe, tone: "warn" as const, note: "Осторожно" },
]
function setup(open = true) {
  const onChoose = vi.fn(), onClose = vi.fn()
  render(<ActionDialog open={open} title="Заголовок" choices={choices} onChoose={onChoose} onClose={onClose} cancelLabel="Отмена" />)
  return { onChoose, onClose }
}

describe("ActionDialog", () => {
  it("показывает заголовок, варианты, описание и предупреждение", () => {
    setup()
    for (const s of ["Заголовок", "Первый", "Описание первого", "Второй", "Осторожно"]) expect(screen.getByText(s)).toBeTruthy()
  })
  it("клик по варианту зовёт onChoose с ключом", () => {
    const { onChoose } = setup()
    fireEvent.click(screen.getByText("Второй"))
    expect(onChoose).toHaveBeenCalledWith("b")
  })
  it("цифра выбирает вариант, лишняя цифра ничего не делает", () => {
    const { onChoose } = setup()
    fireEvent.keyDown(document, { key: "3" })
    expect(onChoose).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: "1" })
    expect(onChoose).toHaveBeenCalledWith("a")
  })
  it("«Отмена» зовёт onClose", () => {
    const { onClose, onChoose } = setup()
    fireEvent.click(screen.getByText("Отмена"))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onChoose).not.toHaveBeenCalled()
  })
  it("закрытый диалог ничего не рисует и цифры не слушает", () => {
    const { onChoose } = setup(false)
    expect(screen.queryByText("Первый")).toBeNull()
    fireEvent.keyDown(document, { key: "1" })
    expect(onChoose).not.toHaveBeenCalled()
  })
})

describe("ActionDialog: слой", () => {
  it("лежит выше окон с zIndex 200 (окно выбора записи для связи)", () => {
    setup()
    const overlay = screen.getByRole("dialog").parentElement as HTMLElement
    expect(Number(overlay.style.zIndex)).toBeGreaterThan(200)
  })
})
