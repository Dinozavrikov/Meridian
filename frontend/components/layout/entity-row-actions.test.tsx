import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { STRINGS } from "@/lib/i18n/strings"
import { EditDeleteActions } from "@/components/layout/entity-row-actions"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

const S = STRINGS as Record<string, string>
const edit = () => screen.getByRole("button", { name: S["actions.edit"] })
const del = () => screen.getByRole("button", { name: S["actions.deleteLabel"] })

describe("EditDeleteActions", () => {
  it("скрыт, пока visible=false; без обработчиков тоже ничего не рисует", () => {
    const { container, rerender } = render(<EditDeleteActions visible={false} onEdit={() => {}} onDelete={() => {}} />)
    expect(container.firstChild).toBeNull()
    rerender(<EditDeleteActions visible />)
    expect(container.firstChild).toBeNull()
  })

  it("правка вызывает onEdit и не доходит до строки списка (иначе клик открывал бы и запись)", () => {
    const onEdit = vi.fn(); const onRow = vi.fn()
    render(<div onClick={onRow}><EditDeleteActions visible onEdit={onEdit} /></div>)
    fireEvent.click(edit())
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onRow).not.toHaveBeenCalled()
  })

  it("удаление спрашивает подтверждение: «нет» ничего не удаляет, «да» удаляет", async () => {
    const onDelete = vi.fn(); const onRow = vi.fn()
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false)
    render(<div onClick={onRow}><EditDeleteActions visible onDelete={onDelete} deleteConfirmText="точно?" /></div>)
    fireEvent.click(del())
    expect(confirm).toHaveBeenCalledWith("точно?")
    expect(onDelete).not.toHaveBeenCalled()
    confirm.mockReturnValue(true)
    fireEvent.click(del())
    await vi.waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1))
    expect(onRow).not.toHaveBeenCalled()
  })

  it("после наведения и ухода курсора цвет возвращается к исходному (раньше оставался «чужим»)", () => {
    render(<EditDeleteActions visible onEdit={() => {}} onDelete={() => {}} />)
    for (const get of [edit, del]) {
      const before = get().style.color
      fireEvent.mouseEnter(get())
      expect(get().style.color).not.toBe(before)
      fireEvent.mouseLeave(get())
      expect(get().style.color).toBe(before)
    }
  })
})
