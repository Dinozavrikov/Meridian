import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { STRINGS } from "@/lib/i18n/strings"
import { CompetingChips, CompetingSummary, competingPath, sortByRole } from "@/components/entities/competing-chips"

const h = vi.hoisted(() => ({ put: vi.fn() }))
vi.mock("@/lib/api", () => ({ api: { put: h.put } }))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
const S = STRINGS as Record<string, string>
beforeEach(() => { h.put.mockReset(); h.put.mockResolvedValue({ data: {} }) })
afterEach(cleanup)
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>)

describe("competing-chips: чистая логика", () => {
  it("ведущая первой, отвергнутые внизу, порядок внутри роли сохраняется", () => {
    const r = sortByRole([{ id: 1, role: "rejected" }, { id: 2, role: "alternative" }, { id: 3, role: "leading" }, { id: 4, role: "alternative" }])
    expect(r.map(x => x.id)).toEqual([3, 2, 4, 1])
  })
  it("путь: родитель — вопрос или задача, с любой из двух страниц", () => {
    expect(competingPath({ type: "hypothesis", id: 29 }, { type: "question", id: 5 })).toBe("/api/v1/competing/question/5/29")
    expect(competingPath({ type: "task", id: 2 }, { type: "hypothesis", id: 7 })).toBe("/api/v1/competing/task/2/7")
  })
  it("сводка по ролям", () => {
    wrap(<CompetingSummary items={[{ source: "competing", role: "leading" }, { source: "competing" }, { source: "competing", role: "alternative" }, { source: "link" }]} />)
    expect(screen.getByText("Ведущая 1 · Альтернатива 2")).toBeTruthy()
  })
})

describe("CompetingChips", () => {
  it("со страницы гипотезы: выбор роли шлёт PUT на вопрос-родитель", async () => {
    wrap(<CompetingChips self={{ type: "hypothesis", id: 29 }} item={{ type: "question", id: 5, role: "alternative", stance: "связано" }} editable />)
    fireEvent.click(screen.getByRole("button", { name: S["relations.roleChange"] }))
    fireEvent.click(screen.getByRole("menuitemradio", { name: S["relations.role.leading"] }))
    await waitFor(() => expect(h.put).toHaveBeenCalledWith("/api/v1/competing/question/5/29", { role: "leading" }))
  })
  it("со страницы вопроса: смена отношения шлёт PUT с гипотезой в пути", async () => {
    wrap(<CompetingChips self={{ type: "question", id: 5 }} item={{ type: "hypothesis", id: 7, role: "leading", stance: "связано" }} editable />)
    fireEvent.click(screen.getByRole("button", { name: S["relations.stanceChange"] }))
    fireEvent.click(screen.getByRole("menuitemradio", { name: S["linkType.refutes"] }))
    await waitFor(() => expect(h.put).toHaveBeenCalledWith("/api/v1/competing/question/5/7", { stance: "опровергает" }))
  })
  it("выбор текущего значения запрос не шлёт; без прав кнопок нет", () => {
    wrap(<CompetingChips self={{ type: "question", id: 5 }} item={{ type: "hypothesis", id: 7, role: "leading" }} editable />)
    fireEvent.click(screen.getByRole("button", { name: S["relations.roleChange"] }))
    fireEvent.click(screen.getByRole("menuitemradio", { name: S["relations.role.leading"] }))
    expect(h.put).not.toHaveBeenCalled()
    cleanup()
    wrap(<CompetingChips self={{ type: "question", id: 5 }} item={{ type: "hypothesis", id: 7, role: "leading" }} editable={false} />)
    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.getByText(S["relations.role.leading"])).toBeTruthy()
  })
})
