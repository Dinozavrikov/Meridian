import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { ComponentProps } from "react"
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react"
import { STRINGS } from "@/lib/i18n/strings"
import { EntityKnowledge } from "@/components/entities/entity-knowledge"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
vi.mock("@/lib/i18n/useTypeRu", () => ({
  useTypeRu: () => ({ hypothesis: "Гипотеза", observation: "Наблюдение", prediction: "Прогноз", worldview: "Убеждение", question: "Вопрос", task: "Задача" }),
}))
vi.mock("@/lib/use-is-mobile", () => ({ useIsMobile: () => false }))

const st = vi.hoisted(() => ({ grouped: {} as Record<string, { link_type?: string | null }[]>, isLoading: false, fit: vi.fn() }))
vi.mock("@/lib/use-related-groups", () => ({
  useRelatedGroups: () => ({
    grouped: st.grouped, counts: {}, isLoading: st.isLoading,
    total: Object.values(st.grouped).reduce((sum, items) => sum + items.length, 0),
  }),
}))
vi.mock("@/components/entities/relations-panel", () => ({
  LocalGraphPanel: (p: { bare?: boolean; height?: number; onFitReady?: (fit: (() => void) | null) => void; compact?: boolean }) => {
    p.onFitReady?.(st.fit)
    return <div data-testid="graph" data-bare={String(p.bare)} data-height={String(p.height)} data-fit-outside={String(!!p.onFitReady)} data-compact={String(!!p.compact)} />
  },
  RelationsPanel: () => <div data-testid="manage-panel" />,
}))

class FakeIO {
  constructor(public cb: (e: { isIntersecting: boolean }[]) => void) { observers.push(this) }
  observe() {}
  unobserve() {}
  disconnect() {}
}
const observers: FakeIO[] = []
let width = 900

beforeEach(() => {
  observers.length = 0; width = 900; st.grouped = {}; st.isLoading = false; st.fit.mockClear()
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal("IntersectionObserver", FakeIO)
  vi.spyOn(Element.prototype, "clientWidth", "get").mockImplementation(() => width)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const S = STRINGS as Record<string, string>
const mount = (props: Partial<ComponentProps<typeof EntityKnowledge>> = {}) =>
  render(<EntityKnowledge entityType="observation" entityId={1} entityTitle="Тест" accent="#1ABC9C" {...props} />)
const showGraph = () => act(() => { observers.forEach(o => o.cb([{ isIntersecting: true }])) })
const DATA = {
  hypothesis: [{ link_type: "подтверждает" }, { link_type: "опровергает" }, { link_type: "связано" }],
  prediction: [{ link_type: "связано" }],
}

describe("EntityKnowledge: состояния", () => {
  it("пока грузится — блок занимает место, но ничего не показывает", () => {
    st.isLoading = true
    const { container } = mount()
    expect(container.querySelector("section")?.getAttribute("aria-busy")).toBe("true")
    expect(screen.queryByTestId("graph")).toBeNull()
  })

  it("связей нет: приглашение вместо графа, кнопка добавления на месте, управления нет", () => {
    mount({ addAction: <button>Добавить</button> })
    expect(screen.getByText(S["knowledge.emptyTitle"])).toBeTruthy()
    expect(screen.getByRole("button", { name: "Добавить" })).toBeTruthy()
    expect(screen.queryByTestId("graph")).toBeNull()
    expect(screen.queryByRole("button", { name: S["knowledge.manage"] })).toBeNull()
  })

  it("есть связи: общее число и сводка по типам в фиксированном порядке со счётом +/−", () => {
    st.grouped = DATA
    mount()
    expect(screen.getByText(S["knowledge.title"])).toBeTruthy()
    const rows = screen.getAllByRole("listitem")
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain("Гипотеза")
    expect(rows[0].textContent).toContain("3")
    expect(rows[1].textContent).toContain("Прогноз")
    expect(screen.getByRole("img", { name: `${S["knowledge.confirming"]}: 1` })).toBeTruthy()
    expect(screen.getByRole("img", { name: `${S["knowledge.refuting"]}: 1` })).toBeTruthy()
  })
})

describe("EntityKnowledge: граф", () => {
  it("рисуется только когда блок дошёл до экрана; до этого — заглушка", () => {
    st.grouped = DATA
    mount()
    expect(screen.queryByTestId("graph")).toBeNull()
    expect(screen.getByRole("status").textContent).toBe(S["knowledge.graphLoading"])
    showGraph()
    expect(screen.getByTestId("graph").getAttribute("data-bare")).toBe("true")
    expect(screen.getByTestId("graph").getAttribute("data-height")).toBe("280")
  })
})

describe("EntityKnowledge: масштаб графа", () => {
  it("«Показать весь граф» в шапке блока: появляется вместе с графом и вызывает его масштабирование", () => {
    st.grouped = DATA
    mount()
    expect(S["knowledge.fitGraph"]).toBeTruthy()
    expect(screen.queryByRole("button", { name: S["knowledge.fitGraph"] })).toBeNull()
    showGraph()
    expect(screen.getByTestId("graph").getAttribute("data-fit-outside")).toBe("true")
    fireEvent.click(screen.getByRole("button", { name: S["knowledge.fitGraph"] }))
    expect(st.fit).toHaveBeenCalledTimes(1)
  })

  it("без связей кнопки масштаба нет: масштабировать нечего", () => {
    mount()
    expect(screen.queryByRole("button", { name: S["knowledge.fitGraph"] })).toBeNull()
  })
})

describe("EntityKnowledge: переходы и управление", () => {
  it("строка типа с вкладкой — кнопка и открывает её; без вкладки — просто строка", () => {
    st.grouped = DATA
    const onOpenTab = vi.fn()
    mount({ tabForType: { hypothesis: "hypotheses" }, onOpenTab })
    fireEvent.click(screen.getByRole("button", { name: /Гипотеза/ }))
    expect(onOpenTab).toHaveBeenCalledWith("hypotheses")
    expect(screen.queryByRole("button", { name: /Прогноз/ })).toBeNull()
  })

  it("«Управлять связями» раскрывает и скрывает список с удалением", () => {
    st.grouped = DATA
    mount()
    const toggle = screen.getByRole("button", { name: S["knowledge.manage"] })
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    expect(screen.queryByTestId("manage-panel")).toBeNull()
    fireEvent.click(toggle)
    expect(screen.getByTestId("manage-panel")).toBeTruthy()
    expect(screen.getByRole("button", { name: S["knowledge.manageHide"] }).getAttribute("aria-expanded")).toBe("true")
    fireEvent.click(screen.getByRole("button", { name: S["knowledge.manageHide"] }))
    expect(screen.queryByTestId("manage-panel")).toBeNull()
  })
})

describe("EntityKnowledge: раскладка по ширине блока", () => {
  it("широкий блок: граф и сводка рядом; узкий: друг под другом", () => {
    st.grouped = DATA
    width = 900
    mount()
    expect(screen.getByTestId("knowledge-body").getAttribute("data-wide")).toBe("true")
    cleanup()
    width = 400
    mount()
    expect(screen.getByTestId("knowledge-body").getAttribute("data-wide")).toBe("false")
  })
})

describe("EntityKnowledge: тесное место (телефон)", () => {
  it("узкий блок: масштаб — квадратная кнопка без текста, подпись в имени; граф получает compact; клик работает", () => {
    st.grouped = DATA
    width = 400
    mount()
    showGraph()
    const button = screen.getByRole("button", { name: S["knowledge.fitGraph"] })
    expect(button.textContent).toBe("")
    expect(button.getAttribute("title")).toBe(S["knowledge.fitGraph"])
    expect(screen.getByTestId("graph").getAttribute("data-compact")).toBe("true")
    fireEvent.click(button)
    expect(st.fit).toHaveBeenCalledTimes(1)
  })

  it("широкий блок: кнопка с текстом, compact выключен", () => {
    st.grouped = DATA
    width = 900
    mount()
    showGraph()
    const button = screen.getByRole("button", { name: S["knowledge.fitGraph"] })
    expect(button.textContent).toContain(S["knowledge.fitGraph"])
    expect(screen.getByTestId("graph").getAttribute("data-compact")).toBe("false")
  })
})
