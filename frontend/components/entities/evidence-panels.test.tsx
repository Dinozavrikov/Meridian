import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { STRINGS } from "@/lib/i18n/strings"
import { EvidencePanels, isBlankHtml } from "@/components/entities/evidence-panels"
import { EntityCallout } from "@/components/entities/entity-callout"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
vi.mock("@/lib/use-is-mobile", () => ({ useIsMobile: () => false }))
vi.mock("@/components/entities/use-entity-preview", () => ({ useEntityPreview: () => ({ data: undefined, isLoading: false, isError: false }) }))

const S = STRINGS as Record<string, string>
let width = 900
beforeEach(() => {
  width = 900
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
  vi.spyOn(Element.prototype, "clientWidth", "get").mockImplementation(() => width)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const mount = (props: Partial<React.ComponentProps<typeof EvidencePanels>> = {}) => render(<EvidencePanels accent="#9B59B6" {...props} />)

describe("isBlankHtml", () => {
  it("пустым считается всё без текста: пусто, пустой абзац, перенос, пробелы", () => {
    for (const v of [null, undefined, "", "   ", "<p></p>", "<p><br></p>", "<p>&nbsp;</p>"]) expect(isBlankHtml(v)).toBe(true)
  })
  it("текст и картинка без текста — не пусто", () => {
    expect(isBlankHtml("<p>да</p>")).toBe(false)
    expect(isBlankHtml('<p><img src="x.png"></p>')).toBe(false)
  })
})

describe("EvidencePanels", () => {
  it("обе стороны заполнены: заголовки, текст выводится как разметка, кнопок нет", () => {
    const { container } = mount({ confirmingHtml: "<p>Три замера <b>совпали</b></p>", refutingHtml: "<p>Один сбой</p>" })
    expect(screen.getByRole("region", { name: S["evidencePanel.confirming"] })).toBeTruthy()
    expect(screen.getByRole("region", { name: S["evidencePanel.refuting"] })).toBeTruthy()
    expect(container.querySelector("b")?.textContent).toBe("совпали")
    expect(screen.getByText("Один сбой")).toBeTruthy()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("пусто у владельца: в каждой пустой карточке «Добавить», клик открывает форму правки", () => {
    const onEdit = vi.fn()
    mount({ canEdit: true, onEdit })
    expect(S["evidencePanel.add"]).toBeTruthy()
    const buttons = screen.getAllByRole("button", { name: S["evidencePanel.add"] })
    expect(buttons).toHaveLength(2)
    fireEvent.click(buttons[0])
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it("пусто у чужого: «Пока не указано» в обеих карточках, кнопок нет", () => {
    mount()
    expect(screen.getAllByText(S["evidencePanel.empty"])).toHaveLength(2)
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("canEdit без onEdit кнопок не рисует: нажать было бы нечем", () => {
    mount({ canEdit: true })
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("очищенный редактор (<p></p>) — пустое состояние, а не пустая карточка", () => {
    mount({ confirmingHtml: "<p></p>", refutingHtml: "<p><br></p>" })
    expect(screen.getAllByText(S["evidencePanel.empty"])).toHaveLength(2)
  })

  it("подсказка про опровержение: только владельцу, только когда подтверждения есть, а опровержений нет", () => {
    const nudge = S["evidencePanel.refutingNudge"]
    expect(nudge).toBeTruthy()
    const a = mount({ confirmingHtml: "<p>да</p>", canEdit: true, onEdit: vi.fn() })
    expect(screen.getByText(nudge)).toBeTruthy(); a.unmount()
    const b = mount({ confirmingHtml: "<p>да</p>" })
    expect(screen.queryByText(nudge)).toBeNull(); b.unmount()
    const c = mount({ canEdit: true, onEdit: vi.fn() })
    expect(screen.queryByText(nudge)).toBeNull(); c.unmount()
    mount({ confirmingHtml: "<p>да</p>", refutingHtml: "<p>нет</p>", canEdit: true, onEdit: vi.fn() })
    expect(screen.queryByText(nudge)).toBeNull()
  })

  it("широкий блок: карточки рядом, узкий: друг под другом", () => {
    mount()
    expect(screen.getByTestId("evidence-body").getAttribute("data-wide")).toBe("true")
    cleanup()
    width = 400
    mount()
    expect(screen.getByTestId("evidence-body").getAttribute("data-wide")).toBe("false")
  })
})

describe("EntityCallout", () => {
  it("заголовок называет область, внутри лежит содержимое", () => {
    render(<EntityCallout tone="#2ECC71" icon={<span data-testid="ic" />} title="Итог">Всё сошлось</EntityCallout>)
    const region = screen.getByRole("region", { name: "Итог" })
    expect(region.textContent).toContain("Всё сошлось")
    expect(screen.getByTestId("ic")).toBeTruthy()
  })
})

describe("EvidencePanels: действие в шапке карточки", () => {
  it("у обеих карточек действие на одном месте: заполненная — «Изменить», пустая — «Добавить»", () => {
    const onEdit = vi.fn()
    mount({ confirmingHtml: "<p>да</p>", canEdit: true, onEdit })
    expect(S["evidencePanel.edit"]).toBeTruthy()
    const confirming = screen.getByRole("region", { name: S["evidencePanel.confirming"] })
    const refuting = screen.getByRole("region", { name: S["evidencePanel.refuting"] })
    expect(confirming.querySelector("button")?.textContent).toBe(S["evidencePanel.edit"])
    expect(refuting.querySelector("button")?.textContent).toBe(S["evidencePanel.add"])
    fireEvent.click(confirming.querySelector("button")!)
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it("обе заполнены у владельца: две кнопки «Изменить»", () => {
    mount({ confirmingHtml: "<p>да</p>", refutingHtml: "<p>нет</p>", canEdit: true, onEdit: vi.fn() })
    expect(screen.getAllByRole("button", { name: S["evidencePanel.edit"] })).toHaveLength(2)
  })

  it("опасная разметка в основаниях очищается в месте вставки", () => {
    const { container } = mount({ confirmingHtml: '<p>текст</p><img src="x" onerror="alert(1)"><script>alert(2)</script>' })
    expect(container.querySelector("script")).toBeNull()
    expect(container.querySelector("[onerror]")).toBeNull()
    expect(screen.getByText("текст")).toBeTruthy()
  })
})
