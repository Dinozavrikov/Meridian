import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { STRINGS } from "@/lib/i18n/strings"
import { HypForm } from "@/components/entities/hypothesis-form"

const { labsState } = vi.hoisted(() => ({ labsState: { data: [] as any[] } }))
vi.mock("@/lib/use-my-labs", () => ({ useMyLabs: () => ({ data: labsState.data }) }))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => STRINGS[key] ?? key }
})
vi.mock("@/lib/i18n/useDynamicT", () => ({ useDynamicTranslate: () => (s: string) => s }))
vi.mock("@/components/entities/rich-text-editor", async () => {
  const React = await vi.importActual<typeof import("react")>("react")
  return { RichTextEditor: ({ value, onChange }: any) => React.createElement("textarea", { "aria-label": "editor", value, onChange: (e: any) => onChange(e.target.value) }) }
})
vi.mock("@/components/entities/entity-link-picker", () => ({ EntityLinkPicker: () => null }))
vi.mock("@/components/entities/images-tab", () => ({ LocalImagePicker: () => null }))
vi.mock("@/components/entities/tag-calibration-hint", () => ({ TagCalibrationHint: () => null }))

afterEach(() => { labsState.data = [] })

const S = STRINGS as Record<string, string>
const submit = () => fireEvent.submit(document.querySelector("form")!)
const placeholder = (k: string) => S[k] ?? k
const fillCriteria = () => fireEvent.change(screen.getByPlaceholderText(placeholder("hypotheses.falsificationPlaceholder")), { target: { value: "если X — гипотеза неверна" } })
const dataOf = (onSave: any) => onSave.mock.calls[0][0].data

describe("HypForm: создание из лаборатории", () => {
  it("выбора видимости нет, вместо него текст про закрытую лабораторию", () => {
    labsState.data = [{ id: 5, is_public: false }]
    render(<HypForm onSave={vi.fn()} onCancel={vi.fn()} lockedLabId={5} />)
    expect(screen.queryByText(S["field.visibility"])).toBeNull()
    expect(screen.getByTestId("lab-locked-note").textContent).toBe(S["forms.lockedToLab.lab"])
  })

  it("публичная лаборатория — форма прямо говорит, что гипотеза будет видна всем", () => {
    labsState.data = [{ id: 5, is_public: true }]
    render(<HypForm onSave={vi.fn()} onCancel={vi.fn()} lockedLabId={5} />)
    expect(screen.getByTestId("lab-locked-note").textContent).toBe(S["forms.lockedToLab.public"])
  })

  it("уходят visibility=lab и lab_id лаборатории (числом), даже если initial был личным", () => {
    const onSave = vi.fn()
    render(<HypForm onSave={onSave} onCancel={vi.fn()} lockedLabId={5} initial={{ visibility: "private", lab_id: null }} />)
    fillCriteria(); submit()
    expect(dataOf(onSave)).toEqual(expect.objectContaining({ visibility: "lab", lab_id: 5 }))
  })
})

describe("HypForm: обычный режим", () => {
  it("выбор видимости есть; по умолчанию личная гипотеза без lab_id", () => {
    const onSave = vi.fn()
    render(<HypForm onSave={onSave} onCancel={vi.fn()} labs={[{ id: 5, name: "Лаба" }]} />)
    expect(screen.getByText(S["field.visibility"])).toBeTruthy()
    expect(screen.queryByTestId("lab-locked-note")).toBeNull()
    fillCriteria(); submit()
    expect(dataOf(onSave)).toEqual(expect.objectContaining({ visibility: "private", lab_id: null }))
  })

  it("без критерия опровержения первое сохранение показывает предупреждение, второе — сохраняет", () => {
    const onSave = vi.fn()
    render(<HypForm onSave={onSave} onCancel={vi.fn()} />)
    submit()
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText(S["hypotheses.falsificationWarning"])).toBeTruthy()
    submit()
    expect(onSave).toHaveBeenCalledTimes(1)
  })
})

describe("HypForm: общий контракт форм", () => {
  it("onSave отдаёт { data, links, images, pendingFiles }; служебных _links/_images/_pendingFiles в теле записи нет", () => {
    const onSave = vi.fn()
    render(<HypForm onSave={onSave} onCancel={vi.fn()} />)
    fillCriteria(); submit()
    const arg = onSave.mock.calls[0][0]
    expect(Object.keys(arg).sort()).toEqual(["data", "images", "links", "pendingFiles"])
    expect(arg.links).toEqual([])
    expect(arg.images).toEqual([])
    expect(arg.pendingFiles).toBeInstanceOf(Map)
    expect(Object.keys(arg.data).some(k => k.startsWith("_"))).toBe(false)
  })

  it("теги разбираются в массив, числовые поля приводятся к числам", () => {
    const onSave = vi.fn()
    render(<HypForm onSave={onSave} onCancel={vi.fn()} initial={{ tags: ["a", "b"], maturity: "2", stability: "7" }} />)
    fillCriteria(); submit()
    expect(dataOf(onSave)).toEqual(expect.objectContaining({ tags: ["a", "b"], maturity: 2, stability: 7 }))
  })

  it("слот header показывается сверху; ошибка видна, а кнопка сохранения блокируется на время отправки", () => {
    render(<HypForm onSave={vi.fn()} onCancel={vi.fn()} header={<div>шапка</div>} error="Не вышло" submitting />)
    expect(screen.getByText("шапка")).toBeTruthy()
    expect(screen.getByRole("alert").textContent).toBe("Не вышло")
    expect((screen.getByText(S["actions.save"]).closest("button") as HTMLButtonElement).disabled).toBe(true)
  })
})
