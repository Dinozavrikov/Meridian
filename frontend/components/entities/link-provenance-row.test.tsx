import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { LinkProvenanceRow, relativeAge } from "@/components/entities/link-provenance-row"

vi.mock("@/lib/store", () => ({ useStore: (sel: (s: { locale: string }) => string) => sel({ locale: "ru" }) }))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
afterEach(cleanup)
const by = { username: "alexey", display_name: "Алексей" }

describe("relativeAge", () => {
  const now = new Date("2026-10-18T12:00:00Z")
  it("сегодня, дни, месяцы, годы", () => {
    expect(relativeAge("2026-10-18T08:00:00Z", now, "ru")).toMatch(/сегодня/)
    expect(relativeAge("2026-10-15T12:00:00Z", now, "ru")).toMatch(/3/)
    expect(relativeAge("2026-07-01T12:00:00Z", now, "ru")).toMatch(/3/)
    expect(relativeAge("2024-10-01T12:00:00Z", now, "ru")).toMatch(/2/)
  })
})

describe("LinkProvenanceRow", () => {
  it("с датой: аватар-инициал, имя, чип с полной датой в подсказке", () => {
    render(<LinkProvenanceRow item={{ source: "link", linked_by: by, linked_at: "2026-10-15T12:00:00Z" }} />)
    expect(screen.getByText("Алексей")).toBeTruthy()
    expect(screen.getByText("А")).toBeTruthy()
    expect(document.querySelector("[title]")?.getAttribute("title")).toMatch(/2026/)
  })
  it("старая связь: «давно» с пояснением", () => {
    render(<LinkProvenanceRow item={{ source: "link", linked_by: by, linked_at: null }} />)
    expect(screen.getByText("давно").closest("[title]")?.getAttribute("title")).toMatch(/стал фиксировать даты/)
  })
  it("связь из поля: чипа с текстом нет, имя есть; без автора ничего", () => {
    render(<LinkProvenanceRow item={{ source: "field", linked_by: by, linked_at: null }} />)
    expect(screen.getByText("Алексей")).toBeTruthy()
    expect(screen.queryByText("давно")).toBeNull()
    cleanup()
    const { container } = render(<LinkProvenanceRow item={{ source: "link", linked_by: null }} />)
    expect(container.firstChild).toBeNull()
  })
})
