import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { STRINGS } from "@/lib/i18n/strings"
import { DEFAULT_SCALES } from "@/lib/scales"
import { EntityPassport } from "@/components/entities/passport"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
vi.mock("@/lib/i18n/useDynamicT", () => ({ useDynamicTranslate: () => (s: string) => s }))
vi.mock("@/lib/use-is-mobile", () => ({ useIsMobile: () => false }))
vi.mock("@/components/entities/scale-edit-modal", () => ({ ScaleEditModal: () => null }))
vi.mock("@/components/entities/stage-track", () => ({ StageTrack: () => <div data-testid="stage-track" /> }))

const stage = vi.hoisted(() => ({ stage: null as string | null }))
vi.mock("@/lib/use-entity-stage", () => ({ useEntityStage: () => ({ stage: stage.stage }) }))

const st = vi.hoisted(() => ({ scales: [] as any[], setCustomValue: vi.fn() }))
vi.mock("@/lib/use-scales", () => ({
  useEntityScales: () => ({ scales: st.scales, isLoading: false }),
  useScaleValues: (_t: string, _id: number, builtin: Record<string, any>) => ({
    values: builtin, setCustomValue: st.setCustomValue, isPending: false,
  }),
}))

const S = STRINGS as Record<string, string>
const forType = (t: string) => DEFAULT_SCALES.filter(s => s.entity_type === t)
const CUSTOM = { id: "custom_7", name: "Моя шкала", entity_type: "observation", min: 0, max: 10, step: 1,
  group_by: "none", color: "#ff8800", builtin: false, description: "", levels: [] }

beforeEach(() => {
  st.scales = forType("observation"); st.setCustomValue.mockClear(); stage.stage = null
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0, right: 200, top: 0, bottom: 10, width: 200, height: 10, x: 0, y: 0, toJSON() {},
  } as DOMRect)
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

const mount = (over: Record<string, any> = {}) => {
  const onSave = vi.fn()
  render(<EntityPassport entityType="observation" entityId={1} values={{ importance: null }}
    onSave={onSave} isOwner accent="#1ABC9C" {...over} />)
  return { onSave }
}
const clearBtn = () => screen.queryAllByRole("button", { name: new RegExp(S["passport.clear"]) })

describe("EntityPassport: «не оценено» и оценка", () => {
  it("неоценённая шкала: подпись «не оценено», числа нет, сбрасывать нечего", () => {
    mount()
    expect(screen.getByText(S["passport.unrated"])).toBeTruthy()
    expect(screen.getByRole("slider").getAttribute("aria-valuenow")).toBeNull()
    expect(clearBtn()).toHaveLength(0)
  })

  it("оценённая шкала: уровень, пояснение и значение; 0 — тоже оценка, а не «не оценено»", () => {
    mount({ values: { importance: 3 } })
    expect(screen.getByText("Важное")).toBeTruthy()
    expect(screen.getByText("Меняет картину исследования")).toBeTruthy()
    expect(screen.getByText("3/5")).toBeTruthy()
    cleanup()
    mount({ values: { importance: 0 } })
    expect(screen.getByText("Незначительное")).toBeTruthy()
    expect(screen.queryByText(S["passport.unrated"])).toBeNull()
  })

  it("«сбросить» отправляет null для встроенной шкалы", () => {
    const { onSave } = mount({ values: { importance: 3 } })
    fireEvent.click(clearBtn()[0])
    expect(onSave).toHaveBeenCalledWith({ importance: null })
  })

  it("«сбросить» для пользовательской шкалы пишет null через setCustomValue", () => {
    st.scales = [...forType("observation"), CUSTOM]
    const { onSave } = mount({ values: { importance: null, custom_7: 4 } })
    fireEvent.click(screen.getByRole("button", { name: `${S["passport.clear"]}: Моя шкала` }))
    expect(st.setCustomValue).toHaveBeenCalledWith("custom_7", null)
    expect(onSave).not.toHaveBeenCalled()
  })

  it("шкалы, у которых бэкенд не хранит «пусто» (зрелость гипотезы), сбросить нельзя", () => {
    st.scales = forType("hypothesis")
    mount({ entityType: "hypothesis", values: { maturity: 2, stability: 5, research_load: 5, risk: 5 } })
    expect(clearBtn()).toHaveLength(0)
  })

  it("чужая запись: ни сброса, ни управления с клавиатуры, виден текст про владельца", () => {
    mount({ isOwner: false, values: { importance: 3 } })
    expect(clearBtn()).toHaveLength(0)
    expect(screen.getByRole("slider").getAttribute("tabindex")).toBeNull()
    expect(screen.getByText(S["ownership.editOwnerOnly"])).toBeTruthy()
  })
})

describe("EntityPassport: ввод значения", () => {
  it("палец: значение — номер деления под пальцем (граница между делениями не округляется к соседнему)", () => {
    const { onSave } = mount()
    const slider = screen.getByRole("slider")
    fireEvent.pointerDown(slider, { clientX: 32, pointerId: 1 })
    fireEvent.pointerUp(slider, { clientX: 32, pointerId: 1 })
    expect(onSave).toHaveBeenCalledWith({ importance: 0 })
  })

  it("клавиатура: первая стрелка на неоценённой шкале ставит первое значение выше минимума", () => {
    const { onSave } = mount()
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" })
    expect(onSave).toHaveBeenCalledWith({ importance: 1 })
  })
})

describe("EntityPassport: свойства записи", () => {
  const meta = [
    { label: "Статус", node: <span>осмысленное</span> },
    { label: "Видимость", node: <span>Личное</span> },
    { label: "Автор", node: null },
  ]

  it("боковая панель: свойства с подписями; свойство без значения пропускается", () => {
    mount({ meta })
    expect(screen.getByText("Статус")).toBeTruthy()
    expect(screen.getByText("осмысленное")).toBeTruthy()
    expect(screen.getByText("Личное")).toBeTruthy()
    expect(screen.queryByText("Автор")).toBeNull()
    expect(screen.getByTestId("stage-track")).toBeTruthy()
  })
})

describe("EntityPassport: свёрнутая карточка (узкая панель)", () => {
  it("свёрнута: свойства и сводка по шкалам и стадии на виду, самих шкал нет; по нажатию раскрывается", () => {
    stage.stage = "research"
    mount({ compact: true, values: { importance: 3 }, meta: [{ label: "Статус", node: <span>осмысленное</span> }] })
    expect(screen.getByText("осмысленное")).toBeTruthy()
    expect(screen.getByText("3/5")).toBeTruthy()
    expect(screen.getByText("2/8")).toBeTruthy()
    expect(screen.queryByRole("slider")).toBeNull()
    expect(screen.queryByTestId("stage-track")).toBeNull()
    const toggle = screen.getByRole("button", { name: S["passport.expand"] })
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    fireEvent.click(toggle)
    expect(screen.getByRole("slider")).toBeTruthy()
    expect(screen.getByTestId("stage-track")).toBeTruthy()
    expect(screen.getByRole("button", { name: S["passport.collapse"] }).getAttribute("aria-expanded")).toBe("true")
  })

  it("неоценённая шкала и неотслеживаемая стадия в сводке видны честно, а не как нули", () => {
    mount({ compact: true, values: { importance: null } })
    expect(screen.getByText(S["passport.unrated"])).toBeTruthy()
    expect(screen.getByText("—")).toBeTruthy()
  })
})

vi.mock("@/components/entities/passport-visibility", () => ({
  PassportVisibility: (p: any) => <div data-testid="pv" data-owner={String(p.isOwner)} />,
}))

describe("EntityPassport: строка видимости", () => {
  it("у записи с visibility строка добавляется сама и получает право автора", () => {
    mount({ values: { importance: null, visibility: "private", lab_id: null }, isOwner: false })
    expect(screen.getByTestId("pv").getAttribute("data-owner")).toBe("false")
    expect(screen.getByText(S["passport.visibility"])).toBeTruthy()
  })
  it("если страница передала свою строку видимости, вторая не добавляется", () => {
    mount({ values: { importance: null, visibility: "private" }, meta: [{ label: S["passport.visibility"], node: <span>своя</span> }] })
    expect(screen.queryByTestId("pv")).toBeNull()
  })
  it("без visibility в записи строки нет", () => {
    mount()
    expect(screen.queryByTestId("pv")).toBeNull()
  })
})
