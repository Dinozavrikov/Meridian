import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { STRINGS } from "@/lib/i18n/strings"
import { ObservationForm } from "@/components/entities/forms/observation-form"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => STRINGS[key] ?? key }
})
vi.mock("@/lib/i18n/useDynamicT", () => ({ useDynamicTranslate: () => (s: string) => s }))
vi.mock("@/components/entities/rich-text-editor", async () => {
  const React = await vi.importActual<typeof import("react")>("react")
  return { RichTextEditor: ({ value, onChange }: any) =>
    React.createElement("textarea", { "aria-label": "editor", value, onChange: (e: any) => onChange(e.target.value) }) }
})
vi.mock("@/components/entities/entity-link-picker", () => ({ EntityLinkPicker: () => null }))
vi.mock("@/components/entities/images-tab", () => ({ LocalImagePicker: () => null }))
vi.mock("@/lib/use-my-labs", () => ({ useMyLabs: () => ({ data: [] }) }))

const S = STRINGS as Record<string, string>
const titleInput = () => screen.getByPlaceholderText(S["observations.titlePlaceholder"]) as HTMLInputElement
const fillText = () => fireEvent.change(screen.getByLabelText("editor"), { target: { value: "<p>текст</p>" } })
const submit = () => fireEvent.submit(document.querySelector("form")!)

describe("ObservationForm: заголовок обязателен", () => {
  it.each(["", "   "])("заголовок %j не отправляется, показывается ошибка", (v) => {
    const onSave = vi.fn()
    render(<ObservationForm onSave={onSave} onCancel={vi.fn()} />)
    fireEvent.change(titleInput(), { target: { value: v } })
    fillText()
    submit()
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText(S["field.titleRequired"])).toBeTruthy()
  })

  it("заполненный заголовок уходит обрезанным по краям", () => {
    const onSave = vi.fn()
    render(<ObservationForm onSave={onSave} onCancel={vi.fn()} />)
    fireEvent.change(titleInput(), { target: { value: "  Название  " } })
    fillText()
    submit()
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0].data.title).toBe("Название")
  })
})

describe("ObservationForm: значимость (null = «не оценено», 0 = «оценено как наименьшее»)", () => {
  const fillRequired = () => {
    fireEvent.change(titleInput(), { target: { value: "Название" } })
    fillText()
  }
  const sentImportance = (onSave: ReturnType<typeof vi.fn>) => onSave.mock.calls[0][0].data.importance

  it("новое наблюдение без выбора значимости уходит как «не оценено» (null), а не как 0", () => {
    const onSave = vi.fn()
    render(<ObservationForm onSave={onSave} onCancel={vi.fn()} />)
    fillRequired()
    submit()
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(sentImportance(onSave)).toBeNull()
  })

  it("выбранный 0 уходит как 0, а не как «не оценено»", () => {
    const onSave = vi.fn()
    render(<ObservationForm onSave={onSave} onCancel={vi.fn()} />)
    fillRequired()
    fireEvent.keyDown(screen.getByRole("slider"), { key: "Home" })
    submit()
    expect(sentImportance(onSave)).toBe(0)
  })

  it("выбор с клавиатуры: первая стрелка на пустой шкале ставит 1", () => {
    const onSave = vi.fn()
    render(<ObservationForm onSave={onSave} onCancel={vi.fn()} />)
    fillRequired()
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" })
    submit()
    expect(sentImportance(onSave)).toBe(1)
  })

  it.each([3, 0])("редактирование записи со значимостью %i сохраняет её как есть", (v) => {
    const onSave = vi.fn()
    render(<ObservationForm initial={{ id: 1, title: "Т", text: "<p>x</p>", author: "a", date: "2026-10-13", importance: v }}
      onSave={onSave} onCancel={vi.fn()} />)
    submit()
    expect(sentImportance(onSave)).toBe(v)
  })

  it("редактирование неоценённой записи не превращает «не оценено» в 0", () => {
    const onSave = vi.fn()
    render(<ObservationForm initial={{ id: 1, title: "Т", text: "<p>x</p>", author: "a", date: "2026-10-13", importance: null }}
      onSave={onSave} onCancel={vi.fn()} />)
    submit()
    expect(sentImportance(onSave)).toBeNull()
  })
})
