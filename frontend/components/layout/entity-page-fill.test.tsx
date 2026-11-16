import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { EntityPage } from "@/components/layout/entity-page"

vi.mock("@/lib/i18n/useT", () => ({ useT: () => (k: string) => k }))
vi.mock("@/lib/use-is-mobile", () => ({ useIsMobile: () => false }))
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
  vi.spyOn(Element.prototype, "clientWidth", "get").mockImplementation(() => 1200)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe("EntityPage: колонки доходят до низа окна даже при коротком содержимом", () => {
  it("корень не меньше окна минус шапка, колонка паспорта растягивается вместе с ним", () => {
    const { container } = render(
      <EntityPage accent="#1ABC9C" title="T" passport={() => <div />} tabs={[{ id: "d", label: "D" }]} activeTab="d" onTabChange={() => {}}>x</EntityPage>,
    )
    const root = container.firstElementChild as HTMLElement
    expect(root.style.minHeight).toContain("100vh")
    const column = screen.getByRole("complementary").parentElement!
    expect(column.parentElement!.style.display).toBe("flex")
    expect(column.style.alignSelf).toBe("")
  })
})
