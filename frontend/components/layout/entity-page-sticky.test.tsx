import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { EntityPage } from "@/components/layout/entity-page"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
vi.mock("@/lib/use-is-mobile", () => ({ useIsMobile: () => false }))
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
  vi.spyOn(Element.prototype, "clientWidth", "get").mockImplementation(() => 1200)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe("EntityPage: паспорт липкий, страница прокручивается одним потоком", () => {
  it("паспорт sticky, а колонка вокруг него тянется на всю высоту (линия не обрывается)", () => {
    render(
      <EntityPage accent="#1ABC9C" title="T" passport={() => <div data-testid="p" />} tabs={[{ id: "d", label: "D" }]} activeTab="d" onTabChange={() => {}}>x</EntityPage>,
    )
    const aside = screen.getByRole("complementary")
    expect(aside.style.position).toBe("sticky")
    expect(aside.parentElement!.style.borderLeft).not.toBe("")
    // у корня нет своей прокрутки: иначе sticky прилипал бы к нему, а не к окну
    expect(aside.parentElement!.parentElement!.parentElement!.style.overflow).toBe("")
  })
})
