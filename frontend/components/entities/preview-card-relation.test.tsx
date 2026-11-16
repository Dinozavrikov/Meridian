import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { PreviewBody } from "@/components/entities/preview-card"

vi.mock("@/lib/store", () => ({ useStore: (sel: (s: unknown) => unknown) => sel({ user: null }) }))
vi.mock("@/lib/i18n/useContentT", () => ({ useTranslatedField: (_a: string, _b: number, _c: string, text: string) => text }))
vi.mock("@/lib/i18n/useT", () => ({ useT: () => (k: string) => k }))
vi.mock("@/lib/i18n/useTypeRu", () => ({ useTypeRu: () => ({ hypothesis: "Гипотеза" }) }))
afterEach(cleanup)

const data = { type: "hypothesis", id: 5, title: "Заг", excerpt: "", status: null, visibility: "private", created_at: null,
  author: { username: "u", display_name: "А" }, is_owner: true, tags: [], metrics: [], links_count: 0 }

describe("тип связи в карточке", () => {
  it("рисуется чипом цвета типа связи, как в менеджере", () => {
    render(<PreviewBody type="hypothesis" id={5} data={data} loading={false} context={{ label: "Опровергает", color: "#E74C3C" }} />)
    const chip = screen.getByTestId("relation-chip")
    expect(chip.textContent).toBe("Опровергает")
    expect(chip.getAttribute("data-link-color")).toBe("#E74C3C")
  })
  it("без цвета (конкурирующая гипотеза) чип нейтральный, но тоже чип", () => {
    render(<PreviewBody type="hypothesis" id={5} data={data} loading={false} context={{ label: "Ведущая" }} />)
    expect(screen.getByTestId("relation-chip").getAttribute("data-link-color")).toBe("")
  })
  it("без контекста блока связи нет", () => {
    render(<PreviewBody type="hypothesis" id={5} data={data} loading={false} />)
    expect(screen.queryByTestId("relation-chip")).toBeNull()
  })
})
