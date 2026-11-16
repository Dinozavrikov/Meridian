import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { LoopRings } from "@/components/dashboard/LoopRings"

vi.mock("@/lib/i18n/useT", () => ({ useT: () => (k: string) => k }))
vi.mock("@/components/entities/use-entity-preview", () => ({ useEntityPreview: () => ({ data: undefined, isLoading: false, isError: false }) }))
vi.mock("@/lib/use-is-mobile", () => ({ useIsMobile: () => false }))
vi.mock("@/lib/store", () => ({ useStore: (sel: (s: unknown) => unknown) => sel({ user: null }) }))
vi.mock("@/lib/i18n/useTypeRu", () => ({ useTypeRu: () => ({}) }))
afterEach(cleanup)

const loops = {
  hyps_no_obs: [{ id: 3, name: "Гипотеза без наблюдений" }],
  hyps_no_pred: [{ id: 4, name: "Гипотеза без прогнозов" }],
  preds_no_date: [],
  worldview_no_reflection: [{ id: 5, title: "Убеждение" }],
  questions_no_answer: [{ id: 6, title: "Вопрос" }],
}

describe("LoopRings: строка ведёт на саму запись", () => {
  it("каждая группа ссылается на запись своего типа, а не на список", () => {
    render(<LoopRings loops={loops} total={4} />)
    const href = (name: string) => screen.getByText(new RegExp(name)).closest("a")?.getAttribute("href")
    expect(href("Гипотеза без наблюдений")).toBe("/hypotheses?id=3&tab=detail")
    expect(href("Гипотеза без прогнозов")).toBe("/hypotheses?id=4&tab=detail")
    expect(href("Убеждение")).toBe("/worldview?id=5&tab=detail")
    expect(href("Вопрос")).toBe("/questions?id=6&tab=detail")
  })
})
