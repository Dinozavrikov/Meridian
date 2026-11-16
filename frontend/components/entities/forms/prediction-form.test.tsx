import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { STRINGS } from "@/lib/i18n/strings"
import { PredictionForm } from "@/components/entities/forms/prediction-form"

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

const { labsState } = vi.hoisted(() => ({ labsState: { data: [] as any[] } }))
vi.mock("@/lib/use-my-labs", () => ({ useMyLabs: () => ({ data: labsState.data }) }))
afterEach(() => { labsState.data = [] })

const S = STRINGS as Record<string, string>
const fillText = () => fireEvent.change(screen.getByLabelText("editor"), { target: { value: "текст" } })
const submit = () => fireEvent.submit(document.querySelector("form")!)
const slider = () => document.querySelector('input[type="range"]') as HTMLInputElement
const HYPS = [{ id: 7, name: "Гипотеза" }]

describe("PredictionForm", () => {
  it("слайдер уверенности есть всегда: по умолчанию 50, выбранное значение уходит числом", () => {
    const onSave = vi.fn()
    render(<PredictionForm onSave={onSave} onCancel={vi.fn()} />)
    expect(slider()).toBeTruthy()
    expect(slider().value).toBe("50")
    fillText()
    fireEvent.change(slider(), { target: { value: "70" } })
    submit()
    expect(onSave.mock.calls[0][0].data.confidence).toBe(70)
  })

  it("не отправляет пустой текст", () => {
    const onSave = vi.fn()
    render(<PredictionForm onSave={onSave} onCancel={vi.fn()} />)
    submit()
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText(S["field.textRequired"])).toBeTruthy()
  })

  it("в режиме лаборатории нет выбора видимости, уходят visibility=lab и lab_id, даже если initial был личным", () => {
    const onSave = vi.fn()
    render(<PredictionForm onSave={onSave} onCancel={vi.fn()} lockedLabId={5} initial={{ visibility: "private", lab_id: null, text: "" }} />)
    expect(screen.queryByText(S["visibility.private"])).toBeNull()
    expect(screen.queryByText(S["visibility.public"])).toBeNull()
    expect(screen.getByTestId("lab-locked-note")).toBeTruthy()
    fillText(); submit()
    const d = onSave.mock.calls[0][0].data
    expect(d.visibility).toBe("lab")
    expect(d.lab_id).toBe(5)
    expect(typeof d.confidence).toBe("number")
  })

  it("вне лаборатории видимость выбирается, по умолчанию личная и lab_id не залипает", () => {
    const onSave = vi.fn()
    render(<PredictionForm onSave={onSave} onCancel={vi.fn()} labs={[{ id: 5, name: "Лаба" }]} />)
    expect(screen.getByText(S["visibility.public"])).toBeTruthy()
    fillText(); submit()
    const d = onSave.mock.calls[0][0].data
    expect(d.visibility).toBe("private")
    expect(d.lab_id).toBeNull()
  })

  it("без списка гипотез и без закреплённой нет ни выбора гипотезы, ни направления; hypothesis_id = null", () => {
    const onSave = vi.fn()
    render(<PredictionForm onSave={onSave} onCancel={vi.fn()} />)
    expect(document.querySelector("select")).toBeNull()
    expect(screen.queryByText(S["predictions.directionRefutes"])).toBeNull()
    fillText(); submit()
    expect(onSave.mock.calls[0][0].data.hypothesis_id).toBeNull()
  })

  it("выбор гипотезы открывает направление; стресс-тест уходит как confirms_hypothesis_if_true=false", () => {
    const onSave = vi.fn()
    render(<PredictionForm onSave={onSave} onCancel={vi.fn()} hyps={HYPS} />)
    expect(screen.queryByText(S["predictions.directionRefutes"])).toBeNull()
    fireEvent.change(document.querySelector("select")!, { target: { value: "7" } })
    fireEvent.click(screen.getByText(S["predictions.directionRefutes"]))
    fillText(); submit()
    const d = onSave.mock.calls[0][0].data
    expect(d.hypothesis_id).toBe(7)
    expect(d.confirms_hypothesis_if_true).toBe(false)
  })

  it("закреплённая гипотеза: hypothesis_id берётся из пропа, выбора нет, направление доступно", () => {
    const onSave = vi.fn()
    render(<PredictionForm onSave={onSave} onCancel={vi.fn()} hyps={HYPS} lockedHypothesisId={9} />)
    expect(document.querySelector("select")).toBeNull()
    expect(screen.getByText(S["predictions.directionConfirms"])).toBeTruthy()
    fillText(); submit()
    expect(onSave.mock.calls[0][0].data.hypothesis_id).toBe(9)
  })

  it("при редактировании направление стресс-теста не сбрасывается", () => {
    const onSave = vi.fn()
    render(<PredictionForm onSave={onSave} onCancel={vi.fn()} hyps={HYPS}
      initial={{ id: 1, text: "<p>x</p>", hypothesis_id: 7, confirms_hypothesis_if_true: false, status: "не проверен", confidence: 40 }} />)
    submit()
    const d = onSave.mock.calls[0][0].data
    expect(d.confirms_hypothesis_if_true).toBe(false)
    expect(d.confidence).toBe(40)
  })

  it.each([[null], [65]])("закрытый прогноз (confidence=%s): слайдер заблокирован, уходит исходная уверенность, а не 50", (conf) => {
    const onSave = vi.fn()
    render(<PredictionForm onSave={onSave} onCancel={vi.fn()}
      initial={{ id: 1, text: "<p>x</p>", status: "подтвердился", confidence: conf, expected_check_date: "2026-12-01T10:00:00Z", date_created: "2026-10-01" }} />)
    expect(slider().disabled).toBe(true)
    submit()
    expect(onSave.mock.calls[0][0].data.confidence).toBe(conf)
  })
})

describe("PredictionForm: направление при редактировании", () => {
  const initial = { id: 1, text: "<p>x</p>", hypothesis_id: 7, status: "не проверен", confidence: 40 }

  it("если сервер направление не вернул и пользователь его не трогал — поле не отправляется (бэкенд оставит прежнее)", () => {
    const onSave = vi.fn()
    render(<PredictionForm onSave={onSave} onCancel={vi.fn()} initial={initial} />)
    submit()
    expect("confirms_hypothesis_if_true" in onSave.mock.calls[0][0].data).toBe(false)
    expect(onSave.mock.calls[0][0].data.hypothesis_id).toBe(7)
  })

  it("если пользователь выбрал направление — оно отправляется", () => {
    const onSave = vi.fn()
    render(<PredictionForm onSave={onSave} onCancel={vi.fn()} initial={initial} />)
    fireEvent.click(screen.getByText(S["predictions.directionRefutes"]))
    submit()
    expect(onSave.mock.calls[0][0].data.confirms_hypothesis_if_true).toBe(false)
  })
})

describe("PredictionForm: ошибка отправки", () => {
  it("показывает переданную ошибку и блокирует кнопку, пока идёт отправка", () => {
    render(<PredictionForm onSave={vi.fn()} onCancel={vi.fn()} error="Не вышло" submitting />)
    expect(screen.getByRole("alert").textContent).toBe("Не вышло")
    expect((screen.getByText(S["actions.save"]).closest("button") as HTMLButtonElement).disabled).toBe(true)
  })
  it("без ошибки сообщения нет", () => {
    render(<PredictionForm onSave={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.queryByRole("alert")).toBeNull()
  })
})

describe("PredictionForm: текст про видимость в лаборатории", () => {
  it("публичная лаборатория — форма прямо говорит, что прогноз будет виден всем", () => {
    labsState.data = [{ id: 5, is_public: true }]
    render(<PredictionForm onSave={vi.fn()} onCancel={vi.fn()} lockedLabId={5} />)
    expect(screen.getByTestId("lab-locked-note").textContent).toBe(S["forms.lockedToLab.public"])
  })
  it("закрытая лаборатория — только участникам", () => {
    labsState.data = [{ id: 5, is_public: false }]
    render(<PredictionForm onSave={vi.fn()} onCancel={vi.fn()} lockedLabId={5} />)
    expect(screen.getByTestId("lab-locked-note").textContent).toBe(S["forms.lockedToLab.lab"])
  })
})

describe("PredictionForm: привязка к гипотезе закрытого прогноза", () => {
  const hypSelect = () => Array.from(document.querySelectorAll("select")).find(s => Array.from(s.options).some(o => o.value === "7")) as HTMLSelectElement
  const closed = { text: "т", status: "подтвердился", confidence: 20, hypothesis_id: 7, expected_check_date: "2026-12-06T00:00:00" } as any

  it("у закрытого выбор гипотезы недоступен, подсказка показана, уходит прежняя гипотеза", () => {
    const onSave = vi.fn()
    render(<PredictionForm onSave={onSave} onCancel={vi.fn()} hyps={HYPS} initial={closed} />)
    expect(hypSelect().disabled).toBe(true)
    expect(screen.getByText(S["predictions.hypothesisLockedHint"])).toBeTruthy()
    submit()
    expect(onSave.mock.calls[0][0].data.hypothesis_id).toBe(7)
  })

  it("у открытого выбор гипотезы доступен", () => {
    render(<PredictionForm onSave={vi.fn()} onCancel={vi.fn()} hyps={HYPS} initial={{ ...closed, status: "не проверен" }} />)
    expect(hypSelect().disabled).toBe(false)
  })
})
