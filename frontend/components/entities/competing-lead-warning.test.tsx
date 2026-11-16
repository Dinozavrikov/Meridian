import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { CompetingLeadWarning, leadLag } from "@/components/entities/competing-lead-warning"

const h = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock("@/lib/api", () => ({ api: { get: h.get } }))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string, p?: Record<string, string>) =>
    Object.entries(p ?? {}).reduce((a, [k, v]) => a.replace(`{${k}}`, v), (STRINGS as Record<string, string>)[key] ?? key) }
})
afterEach(cleanup)
const rows = [{ id: 2, name: "Б", evidence_score: 3 }, { id: 1, name: "А", evidence_score: 1 }, { id: 3, name: "В", evidence_score: 3 }]

describe("leadLag", () => {
  it("ведущая позади по данным — расхождение", () => { expect(leadLag(rows, 1)?.top.id).toBe(2) })
  it("ведущая впереди или вровень — нет; нет ведущей — нет", () => {
    expect(leadLag(rows, 2)).toBeNull()
    expect(leadLag(rows, 3)).toBeNull()
    expect(leadLag(rows, null)).toBeNull()
    expect(leadLag([], 1)).toBeNull()
  })
})

describe("CompetingLeadWarning", () => {
  const mount = (leadingId: number | null) => render(
    <QueryClientProvider client={new QueryClient()}><CompetingLeadWarning parentType="question" parentId={5} leadingId={leadingId} /></QueryClientProvider>)
  it("показывает обе гипотезы с оценками", async () => {
    h.get.mockResolvedValue({ data: rows })
    mount(1)
    expect((await screen.findByRole("note")).textContent).toMatch(/«Б» \(\+3\).*«А» \(\+1\)/)
    expect(h.get).toHaveBeenCalledWith("/api/v1/questions/5/competition")
  })
  it("без ведущей запрос не шлётся, предупреждения нет", () => {
    h.get.mockReset()
    mount(null)
    expect(screen.queryByRole("note")).toBeNull()
    expect(h.get).not.toHaveBeenCalled()
  })
})
