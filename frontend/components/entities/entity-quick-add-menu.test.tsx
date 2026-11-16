import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { STRINGS } from "@/lib/i18n/strings"
import { EntityQuickAddMenu } from "@/components/entities/entity-quick-add-menu"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
vi.mock("@/lib/use-is-mobile", () => ({ useIsMobile: () => false }))
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: () => {} }) }))
// Фиксированный набор типов связи; фильтр для пар одного типа (linkTypesFor из lib/link-vocab) не мокается:
// так видно, какие типы реально доходят до окна привязки.
vi.mock("@/components/entities/link-types", () => ({
  getLinkTypes: () => [
    { value: "подтверждает", label: "Подтверждает", color: "#2ECC71" },
    { value: "опровергает", label: "Опровергает", color: "#E74C3C" },
    { value: "связано", label: "Связано", color: "#4A90D9" },
  ],
}))
// Компоненты-пустышки возвращают строку-метку: так видно, какая модалка открылась, в каком режиме и с какими типами связи.
vi.mock("@/components/entities/link-existing-modal", () => ({
  LinkExistingModal: (p: { onlyType: string; linkTypes: { value: string }[] }) => `LINK:${p.onlyType}|${p.linkTypes.map(l => l.value).join(",")}`,
}))
vi.mock("@/components/entities/quick-add-observation-modal", () => ({ QuickAddObservationModal: (p: { open: boolean }) => (p.open ? "CREATE:observation" : null) }))
vi.mock("@/components/entities/quick-add-hypothesis-modal", () => ({ QuickAddHypothesisModal: (p: { open: boolean }) => (p.open ? "CREATE:hypothesis" : null) }))
vi.mock("@/components/entities/quick-add-worldview-modal", () => ({ QuickAddWorldviewModal: (p: { open: boolean }) => (p.open ? "CREATE:worldview" : null) }))
vi.mock("@/components/entities/quick-add-task-modal", () => ({ QuickAddTaskModal: (p: { open: boolean }) => (p.open ? "CREATE:task" : null) }))
vi.mock("@/components/entities/quick-add-question-modal", () => ({ QuickAddQuestionModal: (p: { open: boolean }) => (p.open ? "CREATE:question" : null) }))
vi.mock("@/components/entities/quick-add-prediction-link-modal", () => ({ QuickAddPredictionLinkModal: (p: { open: boolean }) => (p.open ? "CREATE:prediction" : null) }))
vi.mock("@/components/entities/add-forecast-modal", () => ({ AddForecastModal: (p: { open: boolean }) => (p.open ? "CREATE:forecast" : null) }))

const S = STRINGS as Record<string, string>
const ORDER = ["observation", "hypothesis", "prediction", "worldview", "task", "question"]

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function openMenu(entityType = "observation") {
  render(<EntityQuickAddMenu entityType={entityType} entityId={1} entityName="Тест" />)
  fireEvent.keyDown(screen.getByRole("button", { name: S["actions.addRelated"] }), { key: "Enter" })
}
const modeButton = (key: string) => screen.getByRole("button", { name: new RegExp(S[key]) })
const item = (type: string) => screen.getByRole("menuitem", { name: S[`entityType.${type}`] })

describe("EntityQuickAddMenu", () => {
  it("один список типов (6 для наблюдения, включая свой) вместо двух строк на каждый тип; по умолчанию режим «создать»", () => {
    openMenu()
    expect(screen.getAllByRole("menuitem").map(el => el.textContent)).toEqual(ORDER.map(k => S[`entityType.${k}`]))
    expect(modeButton("quickAdd.createAndLink").getAttribute("aria-pressed")).toBe("true")
    expect(modeButton("quickAdd.linkExisting").getAttribute("aria-pressed")).toBe("false")
  })

  it.each(ORDER)("на странице типа %s в меню есть и сам этот тип", (type) => {
    openMenu(type)
    expect(screen.getAllByRole("menuitem").map(el => el.textContent)).toContain(S[`entityType.${type}`])
  })

  it("выбор типа в режиме «создать» открывает создание именно этого типа", () => {
    openMenu()
    fireEvent.click(item("hypothesis"))
    expect(screen.getByText("CREATE:hypothesis")).toBeTruthy()
    expect(screen.queryByText(/^LINK:/)).toBeNull()
  })

  it("создание записи того же типа: открывается создание своего типа", () => {
    openMenu()
    fireEvent.click(item("observation"))
    expect(screen.getByText("CREATE:observation")).toBeTruthy()
  })

  it("после переключения на «привязать существующее» выбор типа открывает привязку, а не создание", () => {
    openMenu()
    fireEvent.click(modeButton("quickAdd.linkExisting"))
    expect(modeButton("quickAdd.linkExisting").getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(item("task"))
    expect(screen.getByText("LINK:task|связано")).toBeTruthy()
    expect(screen.queryByText(/^CREATE:/)).toBeNull()
  })

  it("привязка записи другого типа: все три типа связи", () => {
    openMenu()
    fireEvent.click(modeButton("quickAdd.linkExisting"))
    fireEvent.click(item("hypothesis"))
    expect(screen.getByText("LINK:hypothesis|подтверждает,опровергает,связано")).toBeTruthy()
  })

  it("привязка записи того же типа: только нейтральная связь", () => {
    openMenu()
    fireEvent.click(modeButton("quickAdd.linkExisting"))
    fireEvent.click(item("observation"))
    expect(screen.getByText("LINK:observation|связано")).toBeTruthy()
  })
})
