import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { EntityPage, TWO_COLUMN_MIN } from "@/components/layout/entity-page"
import { cssRgbToHex } from "@/lib/color"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
vi.mock("@/lib/use-is-mobile", () => ({ useIsMobile: () => false }))

let w = 1200
let h = 800
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
  vi.spyOn(Element.prototype, "clientWidth", "get").mockImplementation(() => w)
  vi.spyOn(Element.prototype, "clientHeight", "get").mockImplementation(() => h)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const mount = (width: number, onTab = vi.fn()) => {
  w = width
  render(
    <EntityPage
      accent="#1ABC9C" kicker="Наблюдение" title="Заголовок записи"
      actions={<button>Изменить</button>} insights={<div>Полоса подсказок</div>}
      passport={compact => <div data-testid="passport" data-compact={String(compact)} />}
      tabs={[{ id: "detail", label: "Детали" }, { id: "hyp", label: "Гипотезы", count: 2 }, { id: "rel", label: "Связи", count: 0 }]}
      activeTab="detail" onTabChange={onTab}
    >
      Содержимое вкладки
    </EntityPage>,
  )
  return onTab
}

describe("EntityPage: раскладка по ширине самой панели", () => {
  it("широкая панель: паспорт сбоку, один раз, не в свёрнутом виде", () => {
    mount(1200)
    expect(screen.getAllByTestId("passport")).toHaveLength(1)
    expect(screen.getByTestId("passport").getAttribute("data-compact")).toBe("false")
    expect(screen.getByRole("complementary").contains(screen.getByTestId("passport"))).toBe(true)
  })

  it("узкая панель: паспорт один раз, в свёрнутом виде над вкладками, боковой панели нет", () => {
    mount(600)
    expect(screen.getAllByTestId("passport")).toHaveLength(1)
    expect(screen.getByTestId("passport").getAttribute("data-compact")).toBe("true")
    expect(screen.queryByRole("complementary")).toBeNull()
  })

  it("граница: на 1px уже порога — свёрнуто, на пороге — сбоку", () => {
    mount(TWO_COLUMN_MIN - 1)
    expect(screen.getByTestId("passport").getAttribute("data-compact")).toBe("true")
    cleanup()
    mount(TWO_COLUMN_MIN)
    expect(screen.getByTestId("passport").getAttribute("data-compact")).toBe("false")
  })

  it("заголовок, действия, подсказки и содержимое вкладки выводятся в обеих раскладках", () => {
    for (const width of [1200, 600]) {
      mount(width)
      expect(screen.getByRole("heading", { name: "Заголовок записи" })).toBeTruthy()
      expect(screen.getByText("Изменить")).toBeTruthy()
      expect(screen.getByText("Полоса подсказок")).toBeTruthy()
      expect(screen.getByText("Содержимое вкладки")).toBeTruthy()
      cleanup()
    }
  })
})

describe("EntityPage: вкладки", () => {
  it("счётчик виден у непустой вкладки, у пустой не показывается, а вкладка приглушена", () => {
    mount(1200)
    expect(screen.getByText("2")).toBeTruthy()
    expect(screen.queryByText("0")).toBeNull()
    // пустая вкладка приглушена цветом, а не прозрачностью (прозрачность роняет контраст текста ниже читаемого)
    const color = (name: string | RegExp) => cssRgbToHex(screen.getByRole("tab", { name }).style.color)
    expect(color("Связи")).toBe("#848cb0")
    expect(color(/Гипотезы/)).toBe("#c3c8e0")
    expect(screen.getByRole("tab", { name: "Связи" }).style.opacity).toBe("")
  })

  it("клик по вкладке сообщает её id; активная помечена", () => {
    const onTab = mount(1200)
    expect(screen.getByRole("tab", { name: "Детали" }).getAttribute("aria-selected")).toBe("true")
    fireEvent.click(screen.getByRole("tab", { name: /Гипотезы/ }))
    expect(onTab).toHaveBeenCalledWith("hyp")
  })
})

describe("EntityPage: действия и ширина колонки", () => {
  const actionsBox = () => screen.getByText("Изменить").parentElement as HTMLElement

  it("на очень узкой панели кнопки действий — сетка равной ширины; шире — обычный ряд", () => {
    mount(400)
    expect(actionsBox().style.display).toBe("grid")
    cleanup()
    mount(700)
    expect(actionsBox().style.display).toBe("flex")
  })

  it("на широкой панели основная колонка ограничена по ширине и центрируется; на узкой занимает всё", () => {
    mount(1800)
    const heading = screen.getByRole("heading", { name: "Заголовок записи" })
    const column = heading.parentElement as HTMLElement
    expect(column.style.maxWidth).toBe("1096px")
    expect(column.style.margin).toContain("auto")
    cleanup()
    mount(600)
    const narrowColumn = screen.getByRole("heading", { name: "Заголовок записи" }).parentElement as HTMLElement
    expect(narrowColumn.style.maxWidth).toBe("")
  })
})


describe("EntityPage: прокрутка одним потоком", () => {
  function renderAt(width: number) {
    w = width
    return render(
      <EntityPage
        accent="#1ABC9C" title="Заголовок записи"
        passport={compact => <div data-testid="passport" data-compact={String(compact)} />}
        tabs={[{ id: "detail", label: "Детали" }]} activeTab="detail" onTabChange={vi.fn()}
      >
        Содержимое
      </EntityPage>,
    )
  }
  const rootOf = (c: HTMLElement) => c.firstElementChild as HTMLElement

  it("широкая панель: корень без фиксированной высоты и без своей прокрутки, паспорт липкий", () => {
    const { container } = renderAt(1200)
    expect(rootOf(container).style.height).toBe("")
    expect(rootOf(container).style.overflow).toBe("")
    expect(screen.getByRole("complementary").style.position).toBe("sticky")
  })

  it("узкая панель: паспорт свёрнут над вкладками, корень занимает свою высоту и прокручивает сам", () => {
    const { container } = renderAt(600)
    expect(rootOf(container).style.height).toBe("100%")
    expect(rootOf(container).style.overflow).toBe("hidden")
    expect(screen.queryByRole("complementary")).toBeNull()
  })
})
